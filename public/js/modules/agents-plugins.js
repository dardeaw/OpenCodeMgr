// public/js/modules/agents-plugins.js
// Custom Agents, Per-Agent Plugins, MCP Servers, Trim-Tools, Bash Permissions, System Prompts & Raw JSONC Module

// ============================================================================
// 1. Custom Agents & Dedicated Tool Permission Matrix
// ============================================================================

function renderAgents() {
  const list = document.getElementById('agent-list');
  if (!list) return;
  list.innerHTML = '';
  (state.agents || []).forEach(a => {
    const div = document.createElement('div');
    div.className = 'item-card' + (currentAgentId === a.id ? ' selected' : '');
    div.onclick = () => selectAgent(a.id);
    div.innerHTML = `
      <div class="item-header">
        <span class="item-name">${escapeHtml(a.id)}</span>
        <span class="badge">${escapeHtml(a.mode)}</span>
      </div>
      <div class="item-desc">${escapeHtml(a.description || t('noDesc'))}</div>
      <div class="item-footer">
        <span>Model: ${escapeHtml(a.model || t('defaultModel'))}</span>
      </div>
    `;
    list.appendChild(div);
  });
}

function selectAgent(id) {
  currentAgentId = id;
  renderAgents();
  const a = (state.agents || []).find(x => x.id === id);
  if (!a) return;
  document.getElementById('agent-editor').style.display = 'flex';
  document.getElementById('agent-editor-title').innerText = t('editAgent') + ' : ' + a.id;
  document.getElementById('agent-id').value = a.id;
  document.getElementById('agent-id').disabled = true;
  document.getElementById('agent-mode').value = a.mode || 'all';
  document.getElementById('agent-model').value = a.model || '';
  updateFuzzyTriggerDisplay('agent-model');
  document.getElementById('agent-desc').value = a.description || '';
  document.getElementById('agent-prompt').value = a.prompt || '';
  document.getElementById('btn-delete-agent').style.display = 'inline-flex';

  const p = a.permissions || {};
  document.getElementById('agent-perm-edit').value = p.edit || 'inherit';
  document.getElementById('agent-perm-bash').value = p.bash || 'inherit';
  document.getElementById('agent-perm-read').value = p.read || 'inherit';
  document.getElementById('agent-perm-search').value = p.grep || p.glob || 'inherit';
  document.getElementById('agent-perm-task').value = p.task || 'inherit';
  document.getElementById('agent-perm-web').value = p.websearch || p.webfetch || 'inherit';
  document.getElementById('agent-perm-custom').value = (a.customRules || []).join('\n');
  renderAgentPluginCheckboxes(a.id);
}

function createNewAgent() {
  currentAgentId = null;
  renderAgents();
  document.getElementById('agent-editor').style.display = 'flex';
  document.getElementById('agent-editor-title').innerText = t('addAgent');
  document.getElementById('agent-id').value = '';
  document.getElementById('agent-id').disabled = false;
  document.getElementById('agent-mode').value = 'all';
  document.getElementById('agent-model').value = '';
  updateFuzzyTriggerDisplay('agent-model');
  document.getElementById('agent-desc').value = '';
  document.getElementById('agent-prompt').value = '';
  document.getElementById('btn-delete-agent').style.display = 'none';

  document.getElementById('agent-perm-edit').value = 'inherit';
  document.getElementById('agent-perm-bash').value = 'inherit';
  document.getElementById('agent-perm-read').value = 'inherit';
  document.getElementById('agent-perm-search').value = 'inherit';
  document.getElementById('agent-perm-task').value = 'inherit';
  document.getElementById('agent-perm-web').value = 'inherit';
  document.getElementById('agent-perm-custom').value = '';
  renderAgentPluginCheckboxes('');
}

function applyAgentToolPreset(preset) {
  if (preset === 'readonly') {
    document.getElementById('agent-perm-edit').value = 'deny';
    document.getElementById('agent-perm-bash').value = 'deny';
    document.getElementById('agent-perm-read').value = 'allow';
    document.getElementById('agent-perm-search').value = 'allow';
    document.getElementById('agent-perm-task').value = 'allow';
    document.getElementById('agent-perm-web').value = 'allow';
    showToast(t('presetReadOnly'));
  } else if (preset === 'fulldev') {
    document.getElementById('agent-perm-edit').value = 'allow';
    document.getElementById('agent-perm-bash').value = 'allow';
    document.getElementById('agent-perm-read').value = 'allow';
    document.getElementById('agent-perm-search').value = 'allow';
    document.getElementById('agent-perm-task').value = 'allow';
    document.getElementById('agent-perm-web').value = 'allow';
    showToast(t('presetFullDev'));
  }
}

async function saveCurrentAgent() {
  const id = document.getElementById('agent-id').value.trim();
  if (!id) return alert(t('enterAgentId'));
  showLoading(true);

  const perms = {
    edit: document.getElementById('agent-perm-edit').value,
    bash: document.getElementById('agent-perm-bash').value,
    read: document.getElementById('agent-perm-read').value,
    grep: document.getElementById('agent-perm-search').value,
    glob: document.getElementById('agent-perm-search').value,
    task: document.getElementById('agent-perm-task').value,
    websearch: document.getElementById('agent-perm-web').value,
    webfetch: document.getElementById('agent-perm-web').value
  };

  const customRules = document.getElementById('agent-perm-custom').value
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);

  const pluginStates = {};
  document.querySelectorAll('.agent-plugin-cb').forEach(cb => {
    pluginStates[cb.dataset.plugin] = cb.checked;
  });

  await apiPost('/api/save-agent', {
    node: currentNode,
    id,
    mode: document.getElementById('agent-mode').value,
    model: document.getElementById('agent-model').value.trim(),
    description: document.getElementById('agent-desc').value.replace(/\r?\n+/g, ' ').trim(),
    prompt: document.getElementById('agent-prompt').value,
    permissions: perms,
    customRules,
    pluginStates
  });
  showToast(t('agentSaved'));
  currentAgentId = id;
  await reloadAll();
  selectAgent(id);
}

async function deleteCurrentAgent() {
  if (!currentAgentId) return;
  if (!confirm(t('confirmDeleteAgent') + currentAgentId + '?')) return;
  showLoading(true);
  await apiPost('/api/delete-agent', { node: currentNode, id: currentAgentId });
  showToast(t('agentDeleted'));
  document.getElementById('agent-editor').style.display = 'none';
  currentAgentId = null;
  await reloadAll();
}

// ============================================================================
// 2. Plugins & Per-Agent Role Scoping
// ============================================================================

function getAllKnownAgentNames() {
  const builtins = ['build', 'plan', 'explore', 'general'];
  const custom = (state.agents || []).map(a => a.id);
  return Array.from(new Set([...builtins, ...custom]));
}

function isPluginActiveForAgent(pluginObj, agentId) {
  if (!pluginObj.enabled) return false;
  const sc = pluginObj.scope || { mode: 'all', agents: [] };
  const list = Array.isArray(sc.agents) ? sc.agents : [];
  if (!sc.mode || sc.mode === 'all') return true;
  if (!agentId) return sc.mode !== 'include';
  if (sc.mode === 'include') return list.includes(agentId);
  if (sc.mode === 'exclude') return !list.includes(agentId);
  return true;
}

function renderAgentPluginCheckboxes(agentId) {
  const box = document.getElementById('agent-plugins-checkboxes');
  if (!box) return;
  box.innerHTML = '';
  const plugins = (state.plugins || []).filter(p => p.enabled);
  if (plugins.length === 0) {
    box.innerHTML = '<div style="color:var(--text-muted);font-size:12px;">' + escapeHtml(t('noActiveGlobalPlugins')) + '</div>';
    return;
  }
  for (const p of plugins) {
    const active = isPluginActiveForAgent(p, agentId);
    const lbl = document.createElement('label');
    lbl.style.cssText = 'display:flex;align-items:center;gap:8px;padding:7px 10px;background:#13151b;border:1px solid var(--border);border-radius:5px;cursor:pointer;margin:0;text-transform:none;';
    lbl.innerHTML = '<input type="checkbox" class="agent-plugin-cb" data-plugin="' + escapeHtml(p.filename) + '" ' + (active ? 'checked' : '') + ' style="width:15px;height:15px;accent-color:#a78bfa;">' +
      '<div style="overflow:hidden;"><div style="font-family:var(--font-mono);font-size:12px;font-weight:600;color:#f8fafc;">' + escapeHtml(p.filename) + '</div>' +
      '<div style="font-size:11px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(p.description || '') + '</div></div>';
    box.appendChild(lbl);
  }
}

function renderPlugins() {
  const list = document.getElementById('plugin-list');
  if (!list) return;
  list.innerHTML = '';
  const plugins = state.plugins || [];

  plugins.forEach((p) => {
    const sc = p.scope || { mode: 'all', agents: [] };
    let scopeBadge = '<span class="badge" style="color:#94a3b8;">' + escapeHtml(t('scopeAllAgents')) + '</span>';
    if (sc.mode === 'include' && sc.agents && sc.agents.length > 0) {
      scopeBadge = '<span class="badge" style="background:rgba(56,189,248,0.18);color:#38bdf8;">' + escapeHtml(t('pluginScopeOnlyPrefix')) + ' ' + escapeHtml(sc.agents.join(', ')) + '</span>';
    } else if (sc.mode === 'exclude' && sc.agents && sc.agents.length > 0) {
      scopeBadge = '<span class="badge" style="background:rgba(245,158,11,0.18);color:#f59e0b;">' + escapeHtml(t('pluginScopeExcludePrefix')) + ' ' + escapeHtml(sc.agents.join(', ')) + '</span>';
    }

    const statusBadge = p.enabled
      ? '<span class="badge" style="background:rgba(16,185,129,0.2);color:#10b981;">' + escapeHtml(t('pluginEnabledBadge')) + ' #' + (p.order + 1) + '</span>'
      : '<span class="badge" style="color:var(--text-muted);">' + escapeHtml(t('pluginDisabledBadge')) + '</span>';

    const div = document.createElement('div');
    div.className = 'item-card' + (currentPluginFilename === p.filename ? ' selected' : '');
    if (p.enabled) div.style.borderLeft = '3px solid #10b981';
    div.onclick = () => selectPlugin(p.filename);

    const toggleBtnText = p.enabled ? t('pluginBtnDisable') : t('pluginBtnEnable');
    const orderBtns = p.enabled
      ? '<button class="btn btn-sm" style="padding:2px 6px;font-size:11px;" data-fn="' + escapeHtml(p.filename) + '" onclick="event.stopPropagation();movePluginOrder(this.dataset.fn, -1)">↑</button>' +
        '<button class="btn btn-sm" style="padding:2px 6px;font-size:11px;" data-fn="' + escapeHtml(p.filename) + '" onclick="event.stopPropagation();movePluginOrder(this.dataset.fn, 1)">↓</button>'
      : '';

    div.innerHTML =
      '<div class="item-header">' +
        '<span class="item-name">' + escapeHtml(p.filename) + '</span>' +
        statusBadge +
      '</div>' +
      '<div class="item-desc" style="min-height:34px;">' + escapeHtml(p.description || t('pluginNoComment')) + '</div>' +
      '<div style="margin-bottom:8px;">' + scopeBadge + '</div>' +
      '<div class="item-footer" style="display:flex;justify-content:space-between;align-items:center;">' +
        '<span style="font-size:11px;">' + (p.content ? p.content.split('\n').length + ' lines' : '') + '</span>' +
        '<div style="display:flex;gap:4px;">' +
          orderBtns +
          '<button class="btn btn-sm" style="padding:2px 8px;font-size:11px;" data-fn="' + escapeHtml(p.filename) + '" onclick="event.stopPropagation();togglePluginQuick(this.dataset.fn, ' + (!p.enabled) + ')">' + escapeHtml(toggleBtnText) + '</button>' +
        '</div>' +
      '</div>';
    list.appendChild(div);
  });
}

function onPluginScopeModeChange() {
  const mode = document.getElementById('plugin-scope-mode').value;
  const box = document.getElementById('plugin-scope-agents-box');
  const hint = document.getElementById('plugin-scope-hint');
  if (mode === 'all') {
    box.style.display = 'none';
  } else {
    box.style.display = 'block';
    hint.innerText = mode === 'include'
      ? t('pluginScopeIncludeHint')
      : t('pluginScopeExcludeHint');
  }
}

function renderPluginScopeAgentsGrid(selectedAgents) {
  const grid = document.getElementById('plugin-scope-agents-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const selSet = new Set(selectedAgents || []);
  const allAgents = getAllKnownAgentNames();
  for (const ag of allAgents) {
    const isBuiltin = ['build', 'plan', 'explore', 'general'].includes(ag);
    const lbl = document.createElement('label');
    lbl.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 10px;background:#13151b;border:1px solid var(--border);border-radius:5px;cursor:pointer;margin:0;text-transform:none;';
    lbl.innerHTML = '<input type="checkbox" class="plugin-scope-agent-cb" value="' + escapeHtml(ag) + '" ' + (selSet.has(ag) ? 'checked' : '') + ' style="width:15px;height:15px;accent-color:#a78bfa;">' +
      '<span style="font-family:var(--font-mono);font-size:12px;color:#f8fafc;">' + escapeHtml(ag) + '</span>' +
      (isBuiltin ? '<span class="badge" style="font-size:9px;margin-left:auto;">' + escapeHtml(t('builtinBadge')) + '</span>' : '');
    grid.appendChild(lbl);
  }
}

function toggleAllPluginScopeAgents(checked) {
  document.querySelectorAll('.plugin-scope-agent-cb').forEach(cb => { cb.checked = checked; });
}

function selectPlugin(filename) {
  currentPluginFilename = filename;
  renderPlugins();
  const p = (state.plugins || []).find(x => x.filename === filename);
  if (!p) return;

  document.getElementById('plugin-editor').style.display = 'flex';
  document.getElementById('plugin-editor-title').innerText = t('editPluginTitle') + ' : ' + p.filename;
  document.getElementById('plugin-filename').value = p.filename;
  document.getElementById('plugin-filename').disabled = true;
  document.getElementById('plugin-enabled').value = p.enabled ? 'true' : 'false';

  const sc = p.scope || { mode: 'all', agents: [] };
  document.getElementById('plugin-scope-mode').value = sc.mode || 'all';
  renderPluginScopeAgentsGrid(sc.agents || []);
  onPluginScopeModeChange();

  document.getElementById('plugin-code').value = p.content || '';
  document.getElementById('btn-delete-plugin').style.display = 'inline-flex';
}

function createNewPlugin() {
  currentPluginFilename = null;
  renderPlugins();
  document.getElementById('plugin-editor').style.display = 'flex';
  document.getElementById('plugin-editor-title').innerText = t('addPluginBtn');
  document.getElementById('plugin-filename').value = '';
  document.getElementById('plugin-filename').disabled = false;
  document.getElementById('plugin-enabled').value = 'true';
  document.getElementById('plugin-scope-mode').value = 'all';
  renderPluginScopeAgentsGrid([]);
  onPluginScopeModeChange();
  document.getElementById('plugin-code').value =
    '// custom-guard.js — 插件說明\n' +
    'export default async ({ client }) => {\n' +
    '  return {\n' +
    '    "tool.execute.before": async (input, output) => {\n' +
    '      // 在此編寫工具執行前攔截邏輯\n' +
    '    },\n' +
    '  };\n' +
    '};\n';
  document.getElementById('btn-delete-plugin').style.display = 'none';
}

async function saveCurrentPlugin() {
  let filename = document.getElementById('plugin-filename').value.trim();
  if (!filename) return alert(t('enterPluginNameAlert'));
  if (!filename.endsWith('.js') && !filename.endsWith('.mjs')) filename += '.js';

  const enabled = document.getElementById('plugin-enabled').value === 'true';
  const scopeMode = document.getElementById('plugin-scope-mode').value;
  const scopeAgents = [];
  document.querySelectorAll('.plugin-scope-agent-cb:checked').forEach(cb => {
    scopeAgents.push(cb.value);
  });

  const content = document.getElementById('plugin-code').value;
  showLoading(true);
  await apiPost('/api/save-plugin', {
    node: currentNode,
    filename,
    enabled,
    scope: { mode: scopeMode, agents: scopeAgents },
    content
  });
  currentPluginFilename = filename;
  showToast(t('pluginSavedMsg'));
  await reloadAll();
  selectPlugin(filename);
}

async function togglePluginQuick(filename, enabled) {
  showLoading(true);
  await apiPost('/api/toggle-plugin', { node: currentNode, filename, enabled });
  showToast(filename + ' ' + (enabled ? t('pluginEnabledBadge') : t('pluginDisabledBadge')));
  await reloadAll();
  if (currentPluginFilename === filename) selectPlugin(filename);
}

async function movePluginOrder(filename, delta) {
  showLoading(true);
  await apiPost('/api/reorder-plugin', { node: currentNode, filename, delta });
  await reloadAll();
}

async function deleteCurrentPlugin() {
  if (!currentPluginFilename) return;
  if (!confirm(t('confirmDeletePlugin') + currentPluginFilename + '?')) return;
  showLoading(true);
  await apiPost('/api/delete-plugin', { node: currentNode, filename: currentPluginFilename });
  showToast(t('pluginDeletedMsg'));
  document.getElementById('plugin-editor').style.display = 'none';
  currentPluginFilename = null;
  await reloadAll();
}

// ============================================================================
// 3. MCP Servers
// ============================================================================

function renderMcp() {
  const list = document.getElementById('mcp-list');
  if (!list) return;
  list.innerHTML = '';
  const mcpMap = (state.config && state.config.mcp) || {};
  for (const [id, m] of Object.entries(mcpMap)) {
    const div = document.createElement('div');
    div.className = 'item-card' + (currentMcpId === id ? ' selected' : '');
    div.onclick = () => selectMcp(id, m);
    const cmd = Array.isArray(m.command) ? m.command.join(' ') : (m.command || '');
    div.innerHTML = `
      <div class="item-header">
        <span class="item-name">${escapeHtml(id)}</span>
        <span class="badge" style="color: ${m.enabled !== false ? 'var(--primary)' : 'var(--danger)'}">
          ${m.enabled !== false ? escapeHtml(t('statusEnabled')) : escapeHtml(t('statusDisabled'))}
        </span>
      </div>
      <div class="item-desc">${escapeHtml(cmd)}</div>
      <div class="item-footer">
        <span>Type: ${escapeHtml(m.type || 'local')}</span>
        <span>Timeout: ${escapeHtml(m.timeout || t('defaultModel'))}</span>
      </div>
    `;
    list.appendChild(div);
  }
}

function selectMcp(id, m) {
  currentMcpId = id;
  renderMcp();
  document.getElementById('mcp-editor').style.display = 'block';
  document.getElementById('mcp-editor-title').innerText = t('editMcp') + ' : ' + id;
  document.getElementById('mcp-id').value = id;
  document.getElementById('mcp-id').disabled = true;
  document.getElementById('mcp-type').value = m.type || 'local';
  document.getElementById('mcp-enabled').value = m.enabled !== false ? 'true' : 'false';
  document.getElementById('mcp-timeout').value = m.timeout || '';

  if (Array.isArray(m.command)) {
    document.getElementById('mcp-command').value = m.command[0] || '';
    document.getElementById('mcp-args').value = m.command.slice(1).join(' ');
  } else {
    document.getElementById('mcp-command').value = m.command || '';
    document.getElementById('mcp-args').value = Array.isArray(m.args) ? m.args.join(' ') : (m.args || '');
  }
}

function addNewMcp() {
  currentMcpId = null;
  renderMcp();
  document.getElementById('mcp-editor').style.display = 'block';
  document.getElementById('mcp-editor-title').innerText = t('addMcp');
  document.getElementById('mcp-id').value = '';
  document.getElementById('mcp-id').disabled = false;
  document.getElementById('mcp-type').value = 'local';
  document.getElementById('mcp-enabled').value = 'true';
  document.getElementById('mcp-timeout').value = '60000';
  document.getElementById('mcp-command').value = '';
  document.getElementById('mcp-args').value = '';
}

async function saveCurrentMcp() {
  const id = document.getElementById('mcp-id').value.trim();
  if (!id) return alert(t('enterMcpId'));
  const cmd = document.getElementById('mcp-command').value.trim();
  const rawArgs = document.getElementById('mcp-args').value.trim();
  const args = rawArgs ? rawArgs.match(/(?:[^\s"]+|"[^"]*")+/g).map(s => s.replace(/^"|"$/g, '')) : [];

  const fullCommand = [cmd, ...args];
  showLoading(true);
  await apiPost('/api/save-mcp', {
    node: currentNode,
    id,
    type: document.getElementById('mcp-type').value,
    command: fullCommand,
    enabled: document.getElementById('mcp-enabled').value === 'true',
    timeout: parseInt(document.getElementById('mcp-timeout').value, 10) || undefined
  });
  showToast(t('mcpSaved'));
  await reloadAll();
}

async function deleteCurrentMcp() {
  if (!currentMcpId) return;
  if (!confirm(t('confirmDeleteMcp') + currentMcpId + '?')) return;
  showLoading(true);
  await apiPost('/api/delete-mcp', { node: currentNode, id: currentMcpId });
  showToast(t('mcpDeleted'));
  document.getElementById('mcp-editor').style.display = 'none';
  currentMcpId = null;
  await reloadAll();
}

// ============================================================================
// 4. Trim-Tools, Bash Permissions, System Prompts & Raw JSONC
// ============================================================================

function renderTools() {
  const container = document.getElementById('tools-container');
  if (!container) return;
  container.innerHTML = '';
  const tools = state.tools || {};
  for (const [k, v] of Object.entries(tools)) {
    const div = document.createElement('div');
    div.style.marginBottom = '14px';
    div.innerHTML = `
      <label style="color: #38bdf8;">Tool: ${escapeHtml(k)}</label>
      <textarea class="tool-desc-input" data-tool="${escapeHtml(k)}" style="height: 75px;">${escapeHtml(v)}</textarea>
    `;
    container.appendChild(div);
  }
}

async function saveTools() {
  const textareas = document.querySelectorAll('.tool-desc-input');
  const updated = {};
  textareas.forEach(ta => {
    updated[ta.getAttribute('data-tool')] = ta.value;
  });
  showLoading(true);
  await apiPost('/api/save-tools', { node: currentNode, tools: updated });
  showToast(t('trimToolsSaved'));
  await reloadAll();
}

async function savePrompt(type) {
  let val = '';
  if (type === 'local') val = document.getElementById('prompt-local').value;
  else if (type === 'global') val = document.getElementById('prompt-global').value;
  else if (type === 'ssh') val = document.getElementById('prompt-ssh').value;

  showLoading(true);
  await apiPost('/api/save-system-prompt', { node: currentNode, type, content: val });
  showToast(t('promptSaved'));
  showLoading(false);
}

async function savePermissions() {
  showLoading(true);
  const denyLines = document.getElementById('perm-deny').value.split('\n').map(s => s.trim()).filter(Boolean);
  const askLines = document.getElementById('perm-ask').value.split('\n').map(s => s.trim()).filter(Boolean);
  await apiPost('/api/save-permissions', { node: currentNode, deny: denyLines, ask: askLines });
  showToast(t('permGuardSaved'));
  await reloadAll();
}

async function saveRawJsonc() {
  showLoading(true);
  const content = document.getElementById('raw-jsonc-content').value;
  await apiPost('/api/save-raw-jsonc', { node: currentNode, content });
  showToast(t('rawJsonSaved'));
  await reloadAll();
}
