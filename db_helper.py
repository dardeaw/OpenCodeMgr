import sqlite3
import os
import sys
import json

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except:
        pass

def get_db_path():
    if "OPENCODE_DB_PATH" in os.environ and os.environ["OPENCODE_DB_PATH"]:
        return os.environ["OPENCODE_DB_PATH"]
    if os.name == 'nt':
        return os.path.expanduser('~/.local/share/opencode/opencode.db')
    elif sys.platform == 'darwin':
        p = os.path.expanduser('~/Library/Application Support/opencode/opencode.db')
        if os.path.exists(p):
            return p
        return os.path.expanduser('~/.local/share/opencode/opencode.db')
    else:
        return os.path.expanduser('~/.local/share/opencode/opencode.db')

def get_stats():
    db_path = get_db_path()
    if not os.path.exists(db_path):
        return {"error": "DB file not found", "path": db_path}

    size = os.path.getsize(db_path)
    wal_path = db_path + '-wal'
    wal_size = os.path.getsize(wal_path) if os.path.exists(wal_path) else 0

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM session")
    session_count = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM message")
    message_count = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM part")
    part_count = cur.fetchone()[0]

    # Group by directory / workspace
    cur.execute("""
        SELECT COALESCE(directory, 'unknown') as dir, COUNT(*) as cnt 
        FROM session 
        GROUP BY directory 
        ORDER BY cnt DESC
    """)
    workspaces = [{"directory": r[0], "count": r[1]} for r in cur.fetchall()]

    conn.close()
    return {
        "db_path": db_path,
        "size_bytes": size,
        "wal_bytes": wal_size,
        "session_count": session_count,
        "message_count": message_count,
        "part_count": part_count,
        "workspaces": workspaces
    }

def get_sessions(workspace_filter=None):
    db_path = get_db_path()
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    query = """
        SELECT s.id, s.title, s.directory, s.model, s.time_created, s.time_updated,
               s.tokens_input, s.tokens_output,
               (SELECT COUNT(*) FROM message m WHERE m.session_id = s.id) as msg_count,
               (SELECT COUNT(*) FROM part p WHERE p.session_id = s.id) as part_count,
               s.parent_id,
               COALESCE((SELECT SUM(length(p.data)) FROM part p WHERE p.session_id = s.id), 0) as size_bytes
        FROM session s
    """
    params = []
    if workspace_filter and workspace_filter != 'all':
        query += " WHERE s.directory = ?"
        params.append(workspace_filter)

    query += " ORDER BY s.time_updated DESC LIMIT 300"

    cur.execute(query, params)
    sessions = []
    for r in cur.fetchall():
        model_str = r[3]
        model_name = ""
        try:
            m_obj = json.loads(model_str)
            model_name = m_obj.get("id") or m_obj.get("modelID") or model_str
        except:
            model_name = model_str or ""

        sessions.append({
            "id": r[0],
            "title": r[1] or "(未命名對話)",
            "directory": r[2] or "",
            "model": model_name,
            "time_created": r[4],
            "time_updated": r[5],
            "tokens_input": r[6] or 0,
            "tokens_output": r[7] or 0,
            "message_count": r[8] or 0,
            "part_count": r[9] or 0,
            "parent_id": r[10] or "",
            "size_bytes": r[11] or 0
        })

    conn.close()
    return sessions

def get_session_detail(session_id):
    db_path = get_db_path()
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    cur.execute("SELECT id, title, directory, model, time_created, time_updated FROM session WHERE id=?", (session_id,))
    s_row = cur.fetchone()
    if not s_row:
        conn.close()
        return {"error": "Session not found"}

    session_info = {
        "id": s_row[0],
        "title": s_row[1] or "(未命名對話)",
        "directory": s_row[2],
        "model": s_row[3],
        "time_created": s_row[4],
        "time_updated": s_row[5]
    }

    # Fetch messages
    cur.execute("SELECT id, time_created, data FROM message WHERE session_id=? ORDER BY time_created ASC", (session_id,))
    messages = []
    for m in cur.fetchall():
        m_id, m_time, m_data_raw = m
        m_data = {}
        try:
            m_data = json.loads(m_data_raw)
        except:
            pass

        # Fetch parts for this message
        cur.execute("SELECT id, time_created, data FROM part WHERE message_id=? ORDER BY time_created ASC", (m_id,))
        parts = []
        for p in cur.fetchall():
            p_id, p_time, p_data_raw = p
            p_data = {}
            try:
                p_data = json.loads(p_data_raw)
            except:
                p_data = {"raw": p_data_raw}
            parts.append({
                "id": p_id,
                "time_created": p_time,
                "data": p_data
            })

        messages.append({
            "id": m_id,
            "time_created": m_time,
            "role": m_data.get("role", "unknown"),
            "agent": m_data.get("agent", ""),
            "model": m_data.get("model", {}),
            "parts": parts
        })

    conn.close()
    return {
        "session": session_info,
        "messages": messages
    }

def delete_session(session_id):
    db_path = get_db_path()
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    cur.execute("DELETE FROM part WHERE session_id=?", (session_id,))
    cur.execute("DELETE FROM message WHERE session_id=?", (session_id,))
    cur.execute("DELETE FROM session WHERE id=?", (session_id,))
    try:
        cur.execute("DELETE FROM session_context_epoch WHERE session_id=?", (session_id,))
    except:
        pass
    conn.commit()
    conn.close()
    return {"ok": True, "deleted": session_id}

def clean_session(session_id, options):
    """
    options can include:
      - 'errors': Clean/delete blocked, failed or hanging tool parts (status in 'error', 'running')
      - 'reasoning': Delete AI thought process parts (type == 'reasoning')
      - 'outputs': Truncate long tool outputs and metadata (> 1500 chars)
      - 'files': Delete large snapshot file parts (type == 'file')
      - 'steps': Delete step-start and step-finish markers
    """
    db_path = get_db_path()
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    opts = set(options.split(',') if isinstance(options, str) else options)
    stats = {
        "deleted_errors": 0,
        "deleted_reasoning": 0,
        "truncated_outputs": 0,
        "deleted_files": 0,
        "deleted_steps": 0,
        "saved_bytes": 0
    }

    cur.execute("SELECT id, data FROM part WHERE session_id=?", (session_id,))
    parts = cur.fetchall()

    ids_to_delete = []
    updates_to_make = []

    for p_id, p_data_raw in parts:
        try:
            d = json.loads(p_data_raw)
            p_type = d.get('type')
            raw_len = len(p_data_raw)

            # 1. Clean reasoning
            if 'reasoning' in opts and p_type == 'reasoning':
                ids_to_delete.append(p_id)
                stats['deleted_reasoning'] += 1
                stats['saved_bytes'] += raw_len
                continue

            # 2. Clean files
            if 'files' in opts and p_type == 'file':
                ids_to_delete.append(p_id)
                stats['deleted_files'] += 1
                stats['saved_bytes'] += raw_len
                continue

            # 3. Clean steps
            if 'steps' in opts and p_type in ('step-start', 'step-finish'):
                ids_to_delete.append(p_id)
                stats['deleted_steps'] += 1
                stats['saved_bytes'] += raw_len
                continue

            # 4. Clean errors (including BLOCKED_BY_LOOP_GUARD, failed tools, and hanging running tools)
            if 'errors' in opts and p_type == 'tool':
                st = d.get('state', {})
                if isinstance(st, dict) and (st.get('status') in ('error', 'running') or st.get('error')):
                    ids_to_delete.append(p_id)
                    stats['deleted_errors'] += 1
                    stats['saved_bytes'] += raw_len
                    continue

            # 5. Truncate heavy outputs (both state.output and state.metadata.output)
            if 'outputs' in opts and p_type == 'tool':
                st = d.get('state', {})
                if isinstance(st, dict):
                    modified = False
                    out = st.get('output')
                    if isinstance(out, str) and len(out) > 1500:
                        st['output'] = out[:800] + "\n\n... [已瘦身清理：截斷剩餘 " + str(len(out) - 800) + " 字元] ..."
                        modified = True
                    meta = st.get('metadata')
                    if isinstance(meta, dict) and 'output' in meta:
                        m_out = meta.get('output')
                        if isinstance(m_out, str) and len(m_out) > 1500:
                            meta['output'] = m_out[:800] + "\n\n... [已瘦身清理：截斷剩餘 " + str(len(m_out) - 800) + " 字元] ..."
                            modified = True
                    if modified:
                        d['state'] = st
                        new_raw = json.dumps(d, ensure_ascii=False)
                        updates_to_make.append((new_raw, p_id))
                        stats['truncated_outputs'] += 1
                        stats['saved_bytes'] += max(0, raw_len - len(new_raw))

        except:
            pass

    if ids_to_delete:
        cur.executemany("DELETE FROM part WHERE id=?", [(x,) for x in ids_to_delete])

    if updates_to_make:
        cur.executemany("UPDATE part SET data=? WHERE id=?", updates_to_make)

    conn.commit()
    conn.close()

    return {
        "ok": True,
        "session_id": session_id,
        "stats": stats,
        "total_cleaned": sum([stats['deleted_errors'], stats['deleted_reasoning'], stats['truncated_outputs'], stats['deleted_files'], stats['deleted_steps']])
    }

def vacuum_db():
    db_path = get_db_path()
    conn = sqlite3.connect(db_path)
    conn.execute("VACUUM")
    conn.close()
    return {"ok": True}

if __name__ == '__main__':
    action = sys.argv[1] if len(sys.argv) > 1 else 'stats'
    if action == 'stats':
        print(json.dumps(get_stats(), ensure_ascii=False))
    elif action == 'sessions':
        ws = sys.argv[2] if len(sys.argv) > 2 else 'all'
        print(json.dumps(get_sessions(ws), ensure_ascii=False))
    elif action == 'detail':
        sid = sys.argv[2] if len(sys.argv) > 2 else ''
        print(json.dumps(get_session_detail(sid), ensure_ascii=False))
    elif action == 'delete':
        sid = sys.argv[2] if len(sys.argv) > 2 else ''
        print(json.dumps(delete_session(sid), ensure_ascii=False))
    elif action == 'clean':
        sid = sys.argv[2] if len(sys.argv) > 2 else ''
        opts = sys.argv[3] if len(sys.argv) > 3 else 'errors,reasoning,outputs,files,steps'
        print(json.dumps(clean_session(sid, opts), ensure_ascii=False))
    elif action == 'vacuum':
        print(json.dumps(vacuum_db(), ensure_ascii=False))
