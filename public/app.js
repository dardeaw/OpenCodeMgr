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

    // Core Agents — v2 uses the plural `agents` map with renamed fields
    // (prompt->system); pre-v2 uses singular `agent`. Read native first.
    const cfg = state.config || {};
    const isV2 = !!state.isV2;
    const nativeAgents = (isV2 && cfg.agents && typeof cfg.agents === 'object') ? cfg.agents : null;
    const agentCfg = cfg.agent || {};
    const comp = (nativeAgents && nativeAgents.compaction) || agentCfg.compaction || {};
    const titleAgt = (nativeAgents && nativeAgents.title) || agentCfg.title || {};
    document.getElementById('compaction-model').value = comp.model || '';
    document.getElementById('compaction-prompt').value = comp.system || comp.prompt || '';
    document.getElementById('title-model').value = titleAgt.model || '';

    // Global Active Models — v2 folds small_model into the title agent's model.
    document.getElementById('global-primary-model').value = cfg.model || '';
    document.getElementById('global-small-model').value = isV2 ? (titleAgt.model || '') : (cfg.small_model || '');
    document.getElementById('global-title-model').value = titleAgt.model || '';
    document.getElementById('global-compaction-model').value = comp.model || '';

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
