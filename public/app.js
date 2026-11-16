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

    // Global Model Assignment — one card, per-agent sub-blocks.
    // v2 uses the plural `agents` map (prompt->system); pre-v2 uses singular
    // `agent` plus a top-level small_model. Read native first, then render.
    const cfg = state.config || {};
    const isV2 = !!state.isV2;
    const nativeAgents = (isV2 && cfg.agents && typeof cfg.agents === 'object') ? cfg.agents : null;
    const agentCfg = cfg.agent || {};
    const comp = (nativeAgents && nativeAgents.compaction) || agentCfg.compaction || {};
    const titleAgt = (nativeAgents && nativeAgents.title) || agentCfg.title || {};

    document.getElementById('global-primary-model').value = cfg.model || '';

    // Small model block: v2 folds it into the title agent → hide entirely.
    const smallBlock = document.getElementById('gsm-small-block');
    if (smallBlock) smallBlock.style.display = isV2 ? 'none' : '';
    if (!isV2) {
      document.getElementById('global-small-model').value = cfg.small_model || '';
    }

    // Compaction sub-block (model + system prompt + enable switch).
    document.getElementById('compaction-model').value = comp.model || '';
    document.getElementById('compaction-prompt').value = comp.system || comp.prompt || '';
    const compEnabled = comp.disabled !== true;
    document.getElementById('compaction-enabled').checked = compEnabled;

    // Title sub-block (model only + enable switch).
    document.getElementById('global-title-model').value = titleAgt.model || '';
    const titleEnabled = titleAgt.disabled !== true;
    document.getElementById('title-enabled').checked = titleEnabled;

    applyCoreAgentFieldStates();

    // Render Models/Providers, Agents, Skills, MCP & Plugins
    renderProviders();
    renderAgents();
    if (typeof renderSkills === 'function') {
      renderSkills();
    }
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

    // Global Advanced Settings card (populate from parsed config)
    if (typeof renderAdvancedSettings === 'function') {
      renderAdvancedSettings();
    }

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
  checkForUpdateBanner();
}

initApp();
