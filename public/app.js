// public/app.js — OpenCode Manager Application Coordinator & Bootstrapper

async function reloadAll() {
  showLoading(true);
  try {
    state = await apiGet('/api/config?node=' + currentNode);

    // System Prompts
    const sp = state.systemPrompts || {};
    document.getElementById('prompt-local').value = (sp.local && sp.local.content) || '';
    document.getElementById('prompt-global').value = (sp.global && sp.global.content) || '';
    if (sp.ssh) {
      document.getElementById('prompt-ssh').value = sp.ssh.content || '';
    }

    // Core Agents
    const cfg = state.config || {};
    const agentCfg = cfg.agent || {};
    const comp = agentCfg.compaction || {};
    document.getElementById('compaction-model').value = comp.model || '';
    document.getElementById('compaction-prompt').value = comp.prompt || '';
    document.getElementById('title-model').value = (agentCfg.title && agentCfg.title.model) || '';

    // Global Active Models
    document.getElementById('global-primary-model').value = cfg.model || '';
    document.getElementById('global-small-model').value = cfg.small_model || '';
    document.getElementById('global-title-model').value = (agentCfg.title && agentCfg.title.model) || '';
    document.getElementById('global-compaction-model').value = comp.model || '';

    // Render Models/Providers, Agents, MCP & Plugins
    renderProviders();
    renderAgents();
    renderMcp();
    renderPlugins();
    ensureDefaultCardSelections();

    // Render Tools
    const hasTools = state.tools && Object.keys(state.tools).length > 0;
    const isLocal = state.node === 'local' || state.ip === '192.168.68.102';
    document.getElementById('card-trim-tools').style.display = (isLocal || hasTools) ? 'flex' : 'none';
    if (isLocal || hasTools) {
      renderTools();
    }

    // Permissions
    const bashPerm = (cfg.permission && cfg.permission.bash) || {};
    const denyList = [];
    const askList = [];
    for (const [k, v] of Object.entries(bashPerm)) {
      if (v === 'deny') denyList.push(k);
      else if (v === 'ask') askList.push(k);
    }
    document.getElementById('perm-deny').value = denyList.join('\n');
    document.getElementById('perm-ask').value = askList.join('\n');

    // Raw JSONC
    document.getElementById('raw-jsonc-content').value = state.rawJsonc || '';

    showToast(state.name + ' ' + t('syncComplete'));
  } catch (err) {
    alert(t('loadFailed') + err.message);
  } finally {
    showLoading(false);
  }
}

async function initApp() {
  try {
    if (window.screen) {
      window.moveTo(0, 0);
      window.resizeTo(window.screen.availWidth, window.screen.availHeight);
    }
  } catch {}
  applyDomI18n();
  await loadNodeList();
  await loadSessionStats();
  await loadSessions();
  await reloadAll();
  testNodeHealth(currentNode);
}

initApp();
