// public/js/core.js
// Core Application State, i18n, Shared HTTP Client, UI Helpers & Node Fleet Management

// ============================================================================
// 1. Global Application State
// ============================================================================

let nodeList = [];
let currentNode = 'local';
let state = {};
let currentAgentId = null;
let currentSkillId = null;
let currentMcpId = null;
let currentProviderId = null;
let currentPluginFilename = null;
let currentSessionData = null;

let currentEditingSubModels = {};
let currentCatalogModelsCache = {};
let currentEnabledModelsSet = new Set();
let currentProbedProviderModels = [];
let allAvailableModelsList = [];

const FUZZY_MODEL_INPUT_IDS = [
  'global-primary-model',
  'global-small-model',
  'global-title-model',
  'global-compaction-model',
  'agent-model',
  'compaction-model',
  'title-model'
];

// ============================================================================
// 2. Shared HTTP API Client
// ============================================================================

async function apiGet(url) {
  const res = await fetch(url);
  return await res.json();
}

async function apiPost(url, payload = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return await res.json();
}

// ============================================================================
// 3. Internationalization (i18n)
// ============================================================================

function detectInitialLang() {
  const saved = localStorage.getItem('opencode_manager_lang');
  if (saved && I18N[saved]) return saved;

  const navLangs = navigator.languages || [navigator.language || navigator.userLanguage || ''];
  for (const nl of navLangs) {
    if (!nl) continue;
    const lower = nl.toLowerCase();
    if (lower.startsWith('zh-tw') || lower.startsWith('zh-hk') || lower.startsWith('zh-mo') || lower === 'zh-hant') return 'zh-TW';
    if (lower.startsWith('zh')) return 'zh-CN';
    if (lower.startsWith('ja')) return 'ja-JP';
    if (lower.startsWith('en')) return 'en-US';
  }

  const srv = (window.SERVER_DETECTED_LOCALE || 'zh-TW').toLowerCase();
  if (srv.startsWith('zh-tw') || srv.startsWith('zh-hk') || srv.startsWith('zh-mo')) return 'zh-TW';
  if (srv.startsWith('zh')) return 'zh-CN';
  if (srv.startsWith('ja')) return 'ja-JP';
  if (srv.startsWith('en')) return 'en-US';

  return 'zh-TW';
}

let currentLang = detectInitialLang();

function t(key, params = {}) {
  const dict = I18N[currentLang] || I18N['zh-TW'];
  let str = dict[key] !== undefined ? dict[key] : (I18N['zh-TW'][key] || key);
  for (const [k, v] of Object.entries(params)) {
    str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), v);
  }
  return str;
}

function applyDomI18n() {
  document.title = t('appName');

  const lSel = document.getElementById('lang-selector');
  if (lSel) lSel.value = currentLang;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const k = el.getAttribute('data-i18n');
    if (k) el.innerText = t(k);
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const k = el.getAttribute('data-i18n-placeholder');
    if (k) el.placeholder = t(k);
  });
}

function changeLanguage(lang) {
  if (!I18N[lang]) return;
  currentLang = lang;
  localStorage.setItem('opencode_manager_lang', lang);
  applyDomI18n();

  loadSessionStats();
  loadSessions();
  renderProviders();
  if (currentProviderId) selectProvider(currentProviderId);
  renderAgents();
  if (currentAgentId) selectAgent(currentAgentId);
  renderMcp();
  renderPlugins();
  if (currentPluginFilename) selectPlugin(currentPluginFilename);
  renderNodeManagerCards();
  refreshAllFuzzyComboboxes();
  if (typeof refreshEnvCloneI18n === 'function') refreshEnvCloneI18n();
}

// ============================================================================
// 4. Shared UI & Formatting Utilities
// ============================================================================

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatTime(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  return d.getFullYear() + '/' +
    String(d.getMonth() + 1).padStart(2, '0') + '/' +
    String(d.getDate()).padStart(2, '0') + ' ' +
    String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0');
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(str) {
  return String(str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function showLoading(show) {
  const el = document.getElementById('loading');
  if (el) el.style.display = show ? 'flex' : 'none';
}

function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.innerText = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 2500);
}

function switchTab(id) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  if (typeof event !== 'undefined' && event && event.currentTarget) {
    event.currentTarget.classList.add('active');
  } else if (typeof event !== 'undefined' && event && event.target) {
    event.target.classList.add('active');
  }
  const pane = document.getElementById(id);
  if (pane) pane.classList.add('active');
  const mainEl = document.querySelector('main');
  if (mainEl) mainEl.scrollTop = 0;

  if (id === 'sessions') {
    loadSessionStats();
    loadSessions();
  } else {
    ensureDefaultCardSelections();
  }
}

function ensureDefaultCardSelections() {
  // 1. Agents (#agents)
  const agents = state.agents || [];
  if (agents.length > 0) {
    const targetAgentId = (currentAgentId && agents.some(a => a.id === currentAgentId)) ? currentAgentId : agents[0].id;
    selectAgent(targetAgentId);
  } else {
    const el = document.getElementById('agent-editor');
    if (el) el.style.display = 'none';
  }

  // 1.5. Skills (#skills)
  const skills = state.skills || [];
  if (skills.length > 0) {
    const targetSkillId = (currentSkillId && skills.some(s => s.id === currentSkillId)) ? currentSkillId : skills[0].id;
    if (typeof selectSkill === 'function') {
      selectSkill(targetSkillId);
    }
  } else {
    const el = document.getElementById('skill-editor');
    if (el) el.style.display = 'none';
  }

  // 2. MCP (#mcp)
  const mcpMap = (state.config && state.config.mcp) || {};
  const mcpIds = Object.keys(mcpMap);
  if (mcpIds.length > 0) {
    const targetMcpId = (currentMcpId && mcpMap[currentMcpId]) ? currentMcpId : mcpIds[0];
    selectMcp(targetMcpId, mcpMap[targetMcpId]);
  } else {
    const el = document.getElementById('mcp-editor');
    if (el) el.style.display = 'none';
  }

  // 3. Plugins (#plugins)
  const plugins = state.plugins || [];
  if (plugins.length > 0) {
    const targetPluginFn = (currentPluginFilename && plugins.some(p => p.filename === currentPluginFilename)) ? currentPluginFilename : plugins[0].filename;
    selectPlugin(targetPluginFn);
  } else {
    const el = document.getElementById('plugin-editor');
    if (el) el.style.display = 'none';
  }

  // 4. Providers (#models)
  const cfgProviders = (state.config && state.config.provider) || {};
  const authMap = (state.providersMeta && state.providersMeta.auth) || {};
  const allProviderIds = Array.from(new Set([
    'opencode',
    'opencode-go',
    ...Object.keys(cfgProviders),
    ...Object.keys(authMap)
  ]));
  if (allProviderIds.length > 0) {
    const targetPid = (currentProviderId && allProviderIds.includes(currentProviderId)) ? currentProviderId : allProviderIds[0];
    selectProvider(targetPid);
  } else {
    const el = document.getElementById('provider-editor');
    if (el) el.style.display = 'none';
  }
}

// ============================================================================
// 5. Node Fleet Switcher & Modal Management
// ============================================================================

async function loadNodeList() {
  nodeList = await apiGet('/api/nodes');
  const sel = document.getElementById('node-selector');
  sel.innerHTML = '';
  nodeList.forEach(n => {
    const opt = document.createElement('option');
    opt.value = n.id;
    opt.innerText = n.name;
    sel.appendChild(opt);
  });
  if (nodeList.find(n => n.id === currentNode)) {
    sel.value = currentNode;
  } else if (nodeList.length > 0) {
    currentNode = nodeList[0].id;
    sel.value = currentNode;
  }
  updateNodeBadge();
}

function updateNodeBadge() {
  const n = nodeList.find(x => x.id === currentNode);
  if (n) {
    document.getElementById('host-badge').innerText = n.ip + (n.type !== 'local' ? ' (' + (n.user || 'ssh') + ')' : ' (Local)');
  }
}

function switchNode(nodeId) {
  currentNode = nodeId;
  updateNodeBadge();

  const n = nodeList.find(x => x.id === nodeId);
  const isLocal = n && n.type === 'local';

  document.getElementById('card-ssh-prompt').style.display = isLocal ? 'none' : 'block';
  document.getElementById('card-trim-tools').style.display = isLocal ? 'flex' : 'none';

  currentAgentId = null;
  currentMcpId = null;
  currentProviderId = null;
  currentPluginFilename = null;
  document.getElementById('agent-editor').style.display = 'none';
  document.getElementById('mcp-editor').style.display = 'none';
  document.getElementById('provider-editor').style.display = 'none';
  document.getElementById('plugin-editor').style.display = 'none';

  reloadAll();
  loadSessionStats();
  loadSessions();
  testNodeHealth(nodeId);
}

async function testNodeHealth(nodeId) {
  const dot = document.getElementById('node-status-dot');
  try {
    const r = await apiPost('/api/test-node', { id: nodeId });
    dot.className = r && r.ok ? 'status-dot' : 'status-dot offline';
  } catch {
    dot.className = 'status-dot offline';
  }
}

function openNodeManagerModal() {
  renderNodeManagerCards();
  document.getElementById('node-modal').style.display = 'flex';
  document.getElementById('node-edit-card').style.display = 'none';
}

function closeNodeModalDirect() {
  document.getElementById('node-modal').style.display = 'none';
}

function closeNodeModal(e) {
  if (e.target.id === 'node-modal') {
    closeNodeModalDirect();
  }
}

function renderNodeManagerCards() {
  const list = document.getElementById('node-card-list');
  if (!list) return;
  list.innerHTML = '';
  nodeList.forEach(n => {
    const div = document.createElement('div');
    div.style.cssText = 'background: #090a0d; border: 1px solid var(--border); border-radius: 6px; padding: 12px 16px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;';
    div.innerHTML = `
      <div>
        <div style="font-weight: 600; color: #fff; font-size: 13.5px;">${escapeHtml(n.name)} <span class="badge" style="font-size: 10px;">${escapeHtml(n.type)}</span></div>
        <div style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); margin-top: 2px;">
          IP: ${escapeHtml(n.ip)} | User: ${escapeHtml(n.user || '-')} | Path: ${escapeHtml(n.configDir)}
        </div>
      </div>
      <div style="display: flex; gap: 6px;">
        <button class="btn btn-sm" onclick="editNodeForm('${escapeAttr(n.id)}')">${t('editBtn')}</button>
        ${n.id !== 'local' ? '<button class="btn btn-sm btn-danger" onclick="deleteNodeConfig(\'' + escapeAttr(n.id) + '\')">🗑️</button>' : ''}
      </div>
    `;
    list.appendChild(div);
  });
}

function initNewNodeForm() {
  document.getElementById('node-edit-card').style.display = 'block';
  document.getElementById('node-form-title').innerText = t('addNodeBtn');
  document.getElementById('edit-node-id').value = '';
  document.getElementById('edit-node-id').disabled = false;
  document.getElementById('edit-node-name').value = '';
  document.getElementById('edit-node-type').value = 'ssh';
  document.getElementById('edit-node-ip').value = '';
  document.getElementById('edit-node-user').value = 'dardeaw';
  document.getElementById('edit-node-config').value = '/home/dardeaw/.config/opencode';
  document.getElementById('edit-node-db').value = '/home/dardeaw/.local/share/opencode/opencode.db';
}

function editNodeForm(id) {
  const n = nodeList.find(x => x.id === id);
  if (!n) return;
  document.getElementById('node-edit-card').style.display = 'block';
  document.getElementById('node-form-title').innerText = t('editNodeTitle') + ' : ' + n.name;
  document.getElementById('edit-node-id').value = n.id;
  document.getElementById('edit-node-id').disabled = (n.id === 'local');
  document.getElementById('edit-node-name').value = n.name;
  document.getElementById('edit-node-type').value = n.type;
  document.getElementById('edit-node-ip').value = n.ip;
  document.getElementById('edit-node-user').value = n.user || '';
  document.getElementById('edit-node-config').value = n.configDir;
  document.getElementById('edit-node-db').value = n.dbPath || '';
}

async function saveNodeConfig() {
  const id = document.getElementById('edit-node-id').value.trim();
  if (!id) return alert(t('enterNodeId'));
  const payload = {
    id,
    name: document.getElementById('edit-node-name').value.trim() || id,
    type: document.getElementById('edit-node-type').value,
    ip: document.getElementById('edit-node-ip').value.trim(),
    user: document.getElementById('edit-node-user').value.trim(),
    configDir: document.getElementById('edit-node-config').value.trim(),
    dbPath: document.getElementById('edit-node-db').value.trim()
  };
  await apiPost('/api/save-node', payload);
  showToast(t('nodeSaved'));
  await loadNodeList();
  renderNodeManagerCards();
  document.getElementById('node-edit-card').style.display = 'none';
}

async function deleteNodeConfig(id) {
  if (!confirm(t('confirmDeleteNode') + id + '?')) return;
  await apiPost('/api/delete-node', { id });
  showToast(t('nodeDeleted'));
  await loadNodeList();
  renderNodeManagerCards();
}
