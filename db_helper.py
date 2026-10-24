import sqlite3
import os
import sys
import json
import time

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

def get_auth_path():
    if "OPENCODE_AUTH_PATH" in os.environ and os.environ["OPENCODE_AUTH_PATH"]:
        return os.environ["OPENCODE_AUTH_PATH"]
    return os.path.expanduser('~/.local/share/opencode/auth.json')

def get_catalog_path():
    return os.path.expanduser('~/.cache/opencode/models.json')

def get_desktop_global_dat_path():
    candidates = [
        os.path.expanduser('~/AppData/Roaming/ai.opencode.desktop/opencode.global.dat'),
        os.path.expanduser('~/.config/ai.opencode.desktop/opencode.global.dat'),
        os.path.expanduser('~/.local/share/ai.opencode.desktop/opencode.global.dat'),
        os.path.expanduser('~/Library/Application Support/ai.opencode.desktop/opencode.global.dat')
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return candidates[0]

def get_desktop_model_visibility():
    dat_path = get_desktop_global_dat_path()
    vis_by_provider = {}
    if not os.path.exists(dat_path):
        return vis_by_provider
    try:
        with open(dat_path, 'r', encoding='utf-8') as f:
            dat = json.load(f)
        raw_model = dat.get('model')
        if isinstance(raw_model, str):
            model_obj = json.loads(raw_model)
        elif isinstance(raw_model, dict):
            model_obj = raw_model
        else:
            return vis_by_provider
        for item in (model_obj.get('user') or []):
            if isinstance(item, dict) and item.get('providerID') and item.get('modelID'):
                pid = item['providerID']
                mid = item['modelID']
                vis = item.get('visibility', 'show')
                vis_by_provider.setdefault(pid, {})[mid] = vis
    except:
        pass
    return vis_by_provider

def set_desktop_model_visibility(provider_id, vis_map_json):
    dat_path = get_desktop_global_dat_path()
    if not os.path.exists(dat_path):
        return {"ok": False, "reason": "no_desktop_dat"}
    try:
        vis_map = json.loads(vis_map_json) if isinstance(vis_map_json, str) else (vis_map_json or {})
        with open(dat_path, 'r', encoding='utf-8') as f:
            dat = json.load(f)
        raw_model = dat.get('model')
        if isinstance(raw_model, str):
            model_obj = json.loads(raw_model)
        elif isinstance(raw_model, dict):
            model_obj = raw_model
        else:
            model_obj = {"user": [], "recent": [], "variant": {}}

        existing_user = [
            x for x in (model_obj.get('user') or [])
            if isinstance(x, dict) and x.get('providerID') != provider_id
        ]
        for mid, vis in vis_map.items():
            existing_user.append({
                "modelID": mid,
                "providerID": provider_id,
                "visibility": "show" if vis == "show" or vis is True else "hide"
            })
        model_obj['user'] = existing_user
        dat['model'] = json.dumps(model_obj, ensure_ascii=False)
        with open(dat_path, 'w', encoding='utf-8') as f:
            json.dump(dat, f, indent='\t', ensure_ascii=False)
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}

def get_live_zen_model_ids():
    cache_file = os.path.expanduser('~/.cache/opencode/zen_live_ids.json')
    try:
        if os.path.exists(cache_file) and (time.time() - os.path.getmtime(cache_file) < 600):
            with open(cache_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, list) and len(data) > 0:
                    return set(data)
    except:
        pass
    try:
        import urllib.request
        req = urllib.request.Request('https://opencode.ai/zen/v1/models', headers={'User-Agent': 'OpenCode-Manager/1.4'})
        raw = urllib.request.urlopen(req, timeout=3).read().decode('utf-8')
        parsed = json.loads(raw)
        ids = [m.get('id') for m in (parsed.get('data') or []) if isinstance(m, dict) and m.get('id') and m.get('id') != 'test']
        if ids:
            os.makedirs(os.path.dirname(cache_file), exist_ok=True)
            with open(cache_file, 'w', encoding='utf-8') as f:
                json.dump(ids, f)
            return set(ids)
    except:
        pass
    return None

def get_providers_meta():
    auth_path = get_auth_path()
    auth_data = {}
    if os.path.exists(auth_path):
        try:
            with open(auth_path, 'r', encoding='utf-8') as f:
                auth_data = json.load(f)
        except:
            pass

    zen_live_set = get_live_zen_model_ids()
    cat_path = get_catalog_path()
    catalog_summary = {}
    if os.path.exists(cat_path):
        try:
            with open(cat_path, 'r', encoding='utf-8') as f:
                raw_cat = json.load(f)
            for pid, pval in raw_cat.items():
                if not isinstance(pval, dict):
                    continue
                raw_models = pval.get('models') or {}
                brief = {}
                deprecated_ids = []
                if isinstance(raw_models, dict):
                    for mid, mval in raw_models.items():
                        if not isinstance(mval, dict):
                            continue
                        is_dep = (mval.get("status") == "deprecated")
                        if pid == 'opencode' and zen_live_set is not None and mid not in zen_live_set:
                            is_dep = True
                        if is_dep:
                            deprecated_ids.append(mid)
                            continue
                        lim = mval.get("limit") or {}
                        brief[mid] = {
                            "name": mval.get("name") or mid,
                            "ctx": lim.get("context") or 0
                        }
                if pid == 'opencode' and zen_live_set is not None:
                    for live_id in zen_live_set:
                        if live_id not in brief and live_id not in deprecated_ids:
                            brief[live_id] = {"name": live_id, "ctx": 0}
                m_count = len(brief)
                catalog_summary[pid] = {
                    "id": pid,
                    "name": pval.get("name") or pid,
                    "npm": pval.get("npm") or "",
                    "api": pval.get("api") or "",
                    "env": pval.get("env") or [],
                    "doc": pval.get("doc") or "",
                    "model_count": m_count,
                    "models_brief": brief,
                    "deprecated_ids": deprecated_ids
                }
        except:
            pass

    return {
        "auth": auth_data,
        "auth_path": auth_path,
        "catalog": catalog_summary,
        "catalog_path": cat_path,
        "model_visibility": get_desktop_model_visibility()
    }

def get_catalog_models(provider_id):
    cat_path = get_catalog_path()
    if not os.path.exists(cat_path):
        return {"models": {}}
    try:
        with open(cat_path, 'r', encoding='utf-8') as f:
            raw_cat = json.load(f)
        pval = raw_cat.get(provider_id)
        if not isinstance(pval, dict):
            return {"models": {}}
        zen_live_set = get_live_zen_model_ids() if provider_id == 'opencode' else None
        raw_models = pval.get('models') or {}
        models_dict = {}
        if isinstance(raw_models, dict):
            for mid, mval in raw_models.items():
                if not isinstance(mval, dict):
                    continue
                if mval.get("status") == "deprecated":
                    continue
                if provider_id == 'opencode' and zen_live_set is not None and mid not in zen_live_set:
                    continue
                models_dict[mid] = {
                    "id": mid,
                    "name": mval.get("name") or mid,
                    "attachment": bool(mval.get("attachment")),
                    "reasoning": bool(mval.get("reasoning")),
                    "tool_call": mval.get("tool_call", True),
                    "modalities": mval.get("modalities") or {"input": ["text"], "output": ["text"]},
                    "limit": mval.get("limit") or {},
                    "cost": mval.get("cost") or {}
                }
        return {
            "provider": {
                "id": provider_id,
                "name": pval.get("name") or provider_id,
                "npm": pval.get("npm") or "",
                "api": pval.get("api") or "",
                "env": pval.get("env") or []
            },
            "models": models_dict
        }
    except Exception as e:
        return {"error": str(e), "models": {}}

def set_auth_entry(provider_id, key_val, auth_type="api"):
    auth_path = get_auth_path()
    os.makedirs(os.path.dirname(auth_path), exist_ok=True)
    auth_data = {}
    if os.path.exists(auth_path):
        try:
            with open(auth_path, 'r', encoding='utf-8') as f:
                auth_data = json.load(f)
        except:
            pass
    if key_val is None or key_val == "":
        if provider_id in auth_data:
            del auth_data[provider_id]
    else:
        auth_data[provider_id] = {
            "type": auth_type,
            "key": key_val
        }
    with open(auth_path, 'w', encoding='utf-8') as f:
        json.dump(auth_data, f, indent=2, ensure_ascii=False)
    return {"ok": True, "auth": auth_data}

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
    elif action == 'providers-meta':
        print(json.dumps(get_providers_meta(), ensure_ascii=False))
    elif action == 'catalog-models':
        pid = sys.argv[2] if len(sys.argv) > 2 else ''
        print(json.dumps(get_catalog_models(pid), ensure_ascii=False))
    elif action == 'set-auth':
        pid = sys.argv[2] if len(sys.argv) > 2 else ''
        kval = sys.argv[3] if len(sys.argv) > 3 else ''
        atype = sys.argv[4] if len(sys.argv) > 4 else 'api'
        print(json.dumps(set_auth_entry(pid, kval, atype), ensure_ascii=False))
    elif action == 'set-model-visibility':
        pid = sys.argv[2] if len(sys.argv) > 2 else ''
        vjson = sys.argv[3] if len(sys.argv) > 3 else '{}'
        print(json.dumps(set_desktop_model_visibility(pid, vjson), ensure_ascii=False))
