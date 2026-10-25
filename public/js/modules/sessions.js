// public/js/modules/sessions.js
// SQLite Session Explorer, Subagent Tree Aggregation, Message Viewer & 5-Dimension Pruning Module

let currentSessionViewMode = 'tree';
let expandedTreeNodes = new Set();
let cleanTargetId = null;

const DEFAULT_CLEAN_PREFS = {
  errors: true,
  reasoning: true,
  outputs: true,
  files: true,
  steps: true,
  vacuum: false
};

// ============================================================================
// 1. Database Statistics & Workspace Filter
// ============================================================================

async function loadSessionStats() {
  try {
    const stats = await apiGet('/api/session-stats?node=' + currentNode);
    if (stats.error) {
      document.getElementById('stat-db-size').innerText = t('dbNotFound');
      return;
    }

    document.getElementById('stat-db-size').innerText = formatBytes(stats.size_bytes);
    document.getElementById('stat-wal-size').innerText = formatBytes(stats.wal_bytes);
    document.getElementById('stat-sessions').innerText = (stats.session_count || 0).toLocaleString();
    document.getElementById('stat-messages').innerText = (stats.message_count || 0).toLocaleString();
    document.getElementById('stat-parts').innerText = (stats.part_count || 0).toLocaleString();

    const sel = document.getElementById('session-workspace-filter');
    const currVal = sel.value;
    sel.innerHTML = '<option value="all">' + escapeHtml(t('allWorkspaces')) + '</option>';
    (stats.workspaces || []).forEach(w => {
      const opt = document.createElement('option');
      opt.value = w.directory;
      opt.innerText = w.directory + ' (' + w.count + ')';
      sel.appendChild(opt);
    });
    if (currVal) sel.value = currVal;
  } catch (err) {
    console.error('Failed to load session stats:', err);
  }
}

// ============================================================================
// 2. Session Tree / Flat Table Rendering
// ============================================================================

function switchSessionViewMode(mode) {
  currentSessionViewMode = mode;
  const btnTree = document.getElementById('btn-view-tree');
  const btnFlat = document.getElementById('btn-view-flat');
  if (btnTree && btnFlat) {
    btnTree.style.background = mode === 'tree' ? 'rgba(56,189,248,0.2)' : 'transparent';
    btnTree.style.color = mode === 'tree' ? '#38bdf8' : 'var(--text-muted)';
    btnTree.style.fontWeight = mode === 'tree' ? '600' : 'normal';

    btnFlat.style.background = mode === 'flat' ? 'rgba(56,189,248,0.2)' : 'transparent';
    btnFlat.style.color = mode === 'flat' ? '#38bdf8' : 'var(--text-muted)';
    btnFlat.style.fontWeight = mode === 'flat' ? '600' : 'normal';
  }
  loadSessions();
}

function toggleSubagentTree(parentId) {
  const isExpanded = !expandedTreeNodes.has(parentId);
  if (isExpanded) {
    expandedTreeNodes.add(parentId);
  } else {
    expandedTreeNodes.delete(parentId);
  }

  const childRows = document.querySelectorAll('.subagent-of-' + parentId);
  childRows.forEach(row => {
    row.style.display = isExpanded ? '' : 'none';
  });

  const caret = document.getElementById('caret-' + parentId);
  if (caret) {
    caret.innerText = isExpanded ? '▼' : '▶';
    caret.title = isExpanded ? t('collapseSubtasks') : t('expandSubtasks');
  }
}

async function loadSessions() {
  const ws = document.getElementById('session-workspace-filter').value;
  const tbody = document.getElementById('session-tbody');
  const prevScrollY = window.scrollY;

  try {
    const list = await apiGet('/api/sessions?node=' + currentNode + '&workspace=' + encodeURIComponent(ws));

    if (!list || list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;">' + escapeHtml(t('noSessions')) + '</td></tr>';
      return;
    }

    tbody.innerHTML = '';

    if (currentSessionViewMode === 'flat') {
      list.forEach(s => appendSessionRow(tbody, s, false));
      window.scrollTo(0, prevScrollY);
      return;
    }

    // Tree Mode
    const sessionMap = new Map();
    list.forEach(s => {
      s.children = [];
      sessionMap.set(s.id, s);
    });

    const rootList = [];
    list.forEach(s => {
      if (s.parent_id && sessionMap.has(s.parent_id)) {
        sessionMap.get(s.parent_id).children.push(s);
      } else {
        rootList.push(s);
      }
    });

    rootList.forEach(s => {
      const hasChildren = s.children && s.children.length > 0;
      const isExpanded = expandedTreeNodes.has(s.id);
      appendSessionRow(tbody, s, false, hasChildren, isExpanded);

      if (hasChildren) {
        s.children.forEach(child => {
          appendSessionRow(tbody, child, true, false, isExpanded);
        });
      }
    });

    window.scrollTo(0, prevScrollY);
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--danger);">' + escapeHtml(t('loadFailed')) + escapeHtml(err.message) + '</td></tr>';
  }
}

function appendSessionRow(tbody, s, isChild = false, hasChildren = false, isExpanded = false) {
  const tr = document.createElement('tr');
  const totalTokens = ((s.tokens_input || 0) + (s.tokens_output || 0)).toLocaleString();

  if (isChild) {
    tr.className = 'subagent-row subagent-of-' + s.parent_id;
    tr.style.display = isExpanded ? '' : 'none';
    tr.style.background = 'rgba(15, 23, 42, 0.45)';
    tr.style.borderLeft = '3px solid #8b5cf6';
  }

  let titleHtml = '';
  if (isChild) {
    titleHtml = `
      <div style="display: flex; align-items: center; padding-left: 28px;">
        <span style="color: #8b5cf6; font-family: var(--font-mono); font-weight: bold; margin-right: 8px;">└── 🤖</span>
        <span style="font-weight: 500; color: #cbd5e1; cursor: pointer; font-size: 13px;" onclick="openDetail('${escapeAttr(s.id)}')">${escapeHtml(s.title)}</span>
        <span style="font-size: 9.5px; color: #a78bfa; background: rgba(167,139,250,0.15); padding: 1px 6px; border-radius: 4px; border: 1px solid rgba(167,139,250,0.3); margin-left: 8px;">Subagent</span>
      </div>
      <div style="padding-left: 56px; font-size: 10px; color: #64748b; font-family: var(--font-mono); margin-top: 2px;">${escapeHtml(s.id)}</div>
    `;
  } else {
    const caret = hasChildren
      ? `<span id="caret-${escapeAttr(s.id)}" onclick="toggleSubagentTree('${escapeAttr(s.id)}')" style="cursor: pointer; display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 4px; color: #38bdf8; background: rgba(56,189,248,0.15); font-size: 10px; margin-right: 8px; flex-shrink: 0;" title="${isExpanded ? t('collapseSubtasks') : t('expandSubtasks')}">${isExpanded ? '▼' : '▶'}</span>`
      : '<span style="display: inline-block; width: 20px; margin-right: 8px; flex-shrink: 0;"></span>';

    const subagentTag = hasChildren
      ? `<span onclick="toggleSubagentTree('${escapeAttr(s.id)}')" style="cursor: pointer; margin-left: 10px; font-size: 11px; padding: 2px 8px; border-radius: 12px; background: rgba(56,189,248,0.12); color: #38bdf8; border: 1px solid rgba(56,189,248,0.3); font-weight: 500;" title="點擊展開/收合子任務">🤖 ${s.children.length} Subagents ▾</span>`
      : '';

    titleHtml = `
      <div style="display: flex; align-items: center;">
        ${caret}
        <span style="font-weight: 600; color: #fff; cursor: pointer; font-size: 13.5px;" onclick="openDetail('${escapeAttr(s.id)}')">${escapeHtml(s.title)}</span>
        ${subagentTag}
      </div>
      <div style="padding-left: 28px; font-size: 10.5px; color: #64748b; font-family: var(--font-mono); margin-top: 2px;">${escapeHtml(s.id)}</div>
    `;
  }

  let sizeHtml = '';
  if (hasChildren) {
    let totalTreeBytes = s.size_bytes || 0;
    s.children.forEach(c => { totalTreeBytes += (c.size_bytes || 0); });
    sizeHtml = `
      <div style="font-weight: 600; color: #f59e0b; font-size: 12px;">${formatBytes(s.size_bytes)}</div>
      <div style="font-size: 10px; color: #94a3b8;">${t('inclSubtasks')}: ${formatBytes(totalTreeBytes)}</div>
    `;
  } else if (isChild) {
    sizeHtml = `<span style="color: #cbd5e1; font-size: 11.5px;">${formatBytes(s.size_bytes)}</span>`;
  } else {
    sizeHtml = `<span style="font-weight: 600; color: #f59e0b; font-size: 12px;">${formatBytes(s.size_bytes)}</span>`;
  }

  tr.innerHTML = `
    <td>${titleHtml}</td>
    <td style="color: #94a3b8; font-size: 11px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
      ${escapeHtml(s.directory || '-')}
    </td>
    <td><span class="badge" style="color: ${isChild ? '#a78bfa' : '#38bdf8'};">${escapeHtml(s.model || t('defaultModel'))}</span></td>
    <td style="color: var(--text-muted); font-size: 11.5px;">${formatTime(s.time_updated)}</td>
    <td>${sizeHtml}</td>
    <td style="font-size: 11.5px;">
      <span style="color: var(--accent);">${s.message_count} ${t('msgUnit')}</span> / 
      <span style="color: var(--text-muted);">${s.part_count} parts</span>
    </td>
    <td style="font-size: 11.5px; color: var(--purple);">${totalTokens}</td>
    <td style="text-align: right; white-space: nowrap;">
      <button class="btn btn-sm" onclick="openDetail('${escapeAttr(s.id)}')">${t('viewBtn')}</button>
      <button class="btn btn-sm" style="border-color: #f59e0b; color: #fbbf24;" onclick="openCleanModal('${escapeAttr(s.id)}', '${escapeAttr(s.title)}')">${t('cleanBtn')}</button>
      <button class="btn btn-sm btn-danger" onclick="deleteSession('${escapeAttr(s.id)}', '${escapeAttr(s.title)}', ${hasChildren ? s.children.length : 0})">${t('deleteBtn')}</button>
    </td>
  `;
  tbody.appendChild(tr);
}

async function deleteSession(id, title, childrenCount = 0) {
  let confirmMsg = t('confirmDeleteSession', { title, id });
  if (childrenCount > 0) {
    confirmMsg += t('warnSubagentsExist', { count: childrenCount });
  }
  if (!confirm(confirmMsg)) return;
  showLoading(true);
  try {
    await apiPost('/api/delete-session', { node: currentNode, id });
    showToast(t('sessionDeleted'));
    await loadSessionStats();
    await loadSessions();
  } catch (err) {
    alert('刪除失敗: ' + err.message);
  } finally {
    showLoading(false);
  }
}

async function runVacuum() {
  if (!confirm(t('confirmVacuum'))) return;
  showLoading(true);
  try {
    await apiPost('/api/vacuum-db', { node: currentNode });
    showToast(t('vacuumDone'));
    await loadSessionStats();
  } catch (err) {
    alert('VACUUM 失敗: ' + err.message);
  } finally {
    showLoading(false);
  }
}

// ============================================================================
// 3. 5-Dimension SQLite Pruning Modal
// ============================================================================

function loadCleanPreferences() {
  try {
    const saved = localStorage.getItem('opencode_clean_prefs');
    if (saved) {
      return { ...DEFAULT_CLEAN_PREFS, ...JSON.parse(saved) };
    }
  } catch {}
  return { ...DEFAULT_CLEAN_PREFS };
}

function saveCleanPreferences() {
  const prefs = {
    errors: document.getElementById('clean-opt-errors').checked,
    reasoning: document.getElementById('clean-opt-reasoning').checked,
    outputs: document.getElementById('clean-opt-outputs').checked,
    files: document.getElementById('clean-opt-files').checked,
    steps: document.getElementById('clean-opt-steps').checked,
    vacuum: document.getElementById('clean-opt-vacuum').checked
  };
  try {
    localStorage.setItem('opencode_clean_prefs', JSON.stringify(prefs));
  } catch {}
}

function setCleanCheckboxes(prefs) {
  document.getElementById('clean-opt-errors').checked = !!prefs.errors;
  document.getElementById('clean-opt-reasoning').checked = !!prefs.reasoning;
  document.getElementById('clean-opt-outputs').checked = !!prefs.outputs;
  document.getElementById('clean-opt-files').checked = !!prefs.files;
  document.getElementById('clean-opt-steps').checked = !!prefs.steps;
  document.getElementById('clean-opt-vacuum').checked = !!prefs.vacuum;
}

function applyCleanDefaults() {
  setCleanCheckboxes(DEFAULT_CLEAN_PREFS);
  saveCleanPreferences();
  showToast(t('presetApplied'));
}

function openCleanModal(id, title) {
  cleanTargetId = id;
  document.getElementById('clean-session-title').innerText = title;
  document.getElementById('clean-session-id').innerText = 'ID: ' + id;
  setCleanCheckboxes(loadCleanPreferences());
  document.getElementById('clean-modal').style.display = 'flex';
}

function openCleanModalFromDetail() {
  if (currentSessionData && currentSessionData.session) {
    openCleanModal(currentSessionData.session.id, currentSessionData.session.title);
  }
}

function closeCleanModal() {
  document.getElementById('clean-modal').style.display = 'none';
  cleanTargetId = null;
}

function closeCleanModalOverlay(e) {
  if (e.target.id === 'clean-modal') closeCleanModal();
}

async function executeCleanSession() {
  if (!cleanTargetId) return;
  const opts = [];
  if (document.getElementById('clean-opt-errors').checked) opts.push('errors');
  if (document.getElementById('clean-opt-reasoning').checked) opts.push('reasoning');
  if (document.getElementById('clean-opt-outputs').checked) opts.push('outputs');
  if (document.getElementById('clean-opt-files').checked) opts.push('files');
  if (document.getElementById('clean-opt-steps').checked) opts.push('steps');

  if (opts.length === 0) {
    return alert(t('cleanSelectWarning'));
  }

  const doVacuum = document.getElementById('clean-opt-vacuum').checked;
  showLoading(true);
  try {
    const resData = await apiPost('/api/clean-session', {
      node: currentNode,
      id: cleanTargetId,
      options: opts.join(',')
    });
    if (resData.error) throw new Error(resData.error);

    if (doVacuum) {
      await apiPost('/api/vacuum-db', { node: currentNode });
    }

    const st = resData.stats || {};
    const savedMB = ((st.saved_bytes || 0) / (1024 * 1024)).toFixed(2);
    closeCleanModal();

    if (currentSessionData && currentSessionData.session && currentSessionData.session.id === cleanTargetId) {
      await openDetail(cleanTargetId);
    }

    await loadSessionStats();
    await loadSessions();

    let report = '';
    if (resData.total_cleaned > 0) {
      report = t('cleanSuccessTitle') +
        t('cleanSummaryLargeOutput', { count: st.truncated_outputs || 0 }) +
        t('cleanSummaryErrors', { count: st.deleted_errors || 0 }) +
        t('cleanSummaryReasoning', { count: st.deleted_reasoning || 0 }) +
        t('cleanSummarySnapshots', { count: st.deleted_files || 0 }) +
        t('cleanSummarySteps', { count: st.deleted_steps || 0 }) +
        t('cleanSummarySaved', { saved: savedMB + ' MB' }) + '\n' +
        t('cleanSummaryTips');
    } else {
      report = t('cleanHealthyTitle') +
        t('cleanSummaryHeader') +
        t('cleanSummaryMsgParts') +
        t('cleanSummaryNotice');
    }
    alert(report);
  } catch (err) {
    alert('瘦身執行失敗: ' + err.message);
  } finally {
    showLoading(false);
  }
}

// ============================================================================
// 4. Session Detail & Message Inspector Modal
// ============================================================================

async function openDetail(id) {
  showLoading(true);
  try {
    currentSessionData = await apiGet('/api/session-detail?node=' + currentNode + '&id=' + encodeURIComponent(id));
    if (currentSessionData.error) {
      return alert('讀取對話失敗: ' + currentSessionData.error);
    }

    const s = currentSessionData.session;
    document.getElementById('modal-title').innerText = s.title;
    document.getElementById('modal-meta').innerText = 'ID: ' + s.id + ' | Workspace: ' + (s.directory || '無') + ' | ' + formatTime(s.time_created);
    document.getElementById('modal-search').value = '';

    renderModalMessages(currentSessionData.messages);
    document.getElementById('detail-modal').style.display = 'flex';
  } catch (err) {
    alert(t('loading') + ': ' + err.message);
  } finally {
    showLoading(false);
  }
}

function renderModalMessages(messages) {
  const container = document.getElementById('modal-content');
  container.innerHTML = '';

  if (!messages || messages.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 40px;">' + escapeHtml(t('noMessages')) + '</div>';
    return;
  }

  messages.forEach(m => {
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';

    const role = m.role || 'user';
    const roleLabel = role === 'user' ? '👤 USER' : '🤖 ASSISTANT';
    const modelLabel = m.model && (m.model.modelID || m.model.id) ? (' [' + (m.model.modelID || m.model.id) + ']') : '';

    let partsHtml = '';
    (m.parts || []).forEach(p => {
      const d = p.data || {};
      if (d.type === 'text') {
        partsHtml += '<div class="msg-content">' + escapeHtml(d.text || '') + '</div>';
      } else if (d.type === 'reasoning') {
        partsHtml += '<div class="part-box part-reasoning"><strong>' + escapeHtml(t('reasoningLabel')) + '</strong><br>' + escapeHtml(d.text || '') + '</div>';
      } else if (d.type === 'tool') {
        const st = d.state || {};
        const inputStr = JSON.stringify(st.input || {}, null, 2);
        const isError = st.status === 'error' || !!st.error;
        let outputContent = '';
        if (st.error) {
          outputContent = typeof st.error === 'string' ? st.error : JSON.stringify(st.error, null, 2);
        } else if (st.output !== undefined && st.output !== null) {
          outputContent = typeof st.output === 'string' ? st.output : JSON.stringify(st.output, null, 2);
        } else {
          outputContent = t('noOutput');
        }
        const statusBadge = isError
          ? '<span style="color: var(--danger); font-weight: bold;">' + escapeHtml(t('statusFailed')) + '</span>'
          : '<span style="color: var(--primary);">' + escapeHtml(t('statusDone')) + '</span>';

        partsHtml += '<div class="part-box part-tool' + (isError ? ' error' : '') + '">' +
          '<div style="display: flex; justify-content: space-between; align-items: center;">' +
          '<strong>' + escapeHtml(t('toolCallLabel')) + ' ' + escapeHtml(d.tool || '') + '</strong>' + statusBadge +
          '</div>' +
          '<details style="margin-top: 6px;"><summary style="cursor: pointer; color: var(--accent);">' + escapeHtml(t('inputParams')) + '</summary><pre style="margin-top: 4px; overflow-x: auto;">' + escapeHtml(inputStr) + '</pre></details>' +
          '<details style="margin-top: 6px;" open><summary style="cursor: pointer; color: ' + (isError ? 'var(--danger)' : 'var(--primary)') + ';">' + escapeHtml(isError ? t('errorDetails') : t('execOutput')) + '</summary><pre style="margin-top: 4px; overflow-x: auto; max-height: 250px; color: ' + (isError ? '#f87171' : 'inherit') + ';">' + escapeHtml(outputContent) + '</pre></details>' +
          '</div>';
      }
    });

    bubble.innerHTML = `
      <div class="msg-header ${role}">
        <span>${roleLabel}${escapeHtml(modelLabel)}</span>
        <span style="color: #64748b;">${formatTime(m.time_created)}</span>
      </div>
      ${partsHtml || '<div class="msg-content" style="color: var(--text-muted);">' + escapeHtml(t('noTextContent')) + '</div>'}
    `;
    container.appendChild(bubble);
  });
}

function filterModalContent() {
  const q = document.getElementById('modal-search').value.toLowerCase().trim();
  const bubbles = document.querySelectorAll('.msg-bubble');
  bubbles.forEach(b => {
    if (!q) {
      b.style.display = 'block';
    } else {
      b.style.display = b.innerText.toLowerCase().includes(q) ? 'block' : 'none';
    }
  });
}

function closeDetailModal() {
  document.getElementById('detail-modal').style.display = 'none';
}

function closeDetail(e) {
  if (e.target.id === 'detail-modal') {
    closeDetailModal();
  }
}
