// public/js/modules/providers.js
// Global Model Assignment, Providers & Sub-Models, OpenCode Model Visibility Switch, Live Probe & Catalog Module

// ============================================================================
// 1. Available Models Index & Global Fuzzy Combobox Mount
// ============================================================================

function buildAvailableModelsList() {
  const list = [];
  const seen = new Set();
  const cfgProviders = (state.config && state.config.provider) || {};
  const catalog = (state.providersMeta && state.providersMeta.catalog) || {};
  const authMap = (state.providersMeta && state.providersMeta.auth) || {};

  // Group 1: Configured models in opencode.jsonc (excluding catalog-deprecated & disabled models)
  for (const [pid, pObj] of Object.entries(cfgProviders)) {
    const models = (pObj && pObj.models) || {};
    const pName = (pObj && pObj.name) || (catalog[pid] && catalog[pid].name) || pid;
    const depSet = new Set((catalog[pid] && catalog[pid].deprecated_ids) || []);
    const wlSet = (Array.isArray(pObj.whitelist) && pObj.whitelist.length > 0) ? new Set(pObj.whitelist) : null;
    const blSet = (Array.isArray(pObj.blacklist) && pObj.blacklist.length > 0) ? new Set(pObj.blacklist) : null;
    for (const [mid, mObj] of Object.entries(models)) {
      if (depSet.has(mid)) continue;
      if (wlSet && !wlSet.has(mid)) continue;
      if (blSet && blSet.has(mid)) continue;
      const fullId = pid + '/' + mid;
      if (!seen.has(fullId)) {
        seen.add(fullId);
        const ctx = (mObj && mObj.limit && mObj.limit.context) ? Math.round(mObj.limit.context / 1024) + 'K' : '';
        const name = (mObj && mObj.name) || mid;
        list.push({
          id: fullId,
          providerId: pid,
          providerName: pName,
          modelId: mid,
          name,
          subText: name + ' · ' + pName,
          ctx,
          group: 'configured',
          badgeText: t('fuzzyBadgeConfigured'),
          badgeStyle: 'background:rgba(16,185,129,0.18);color:#10b981;font-size:10px;',
          searchStr: (fullId + ' ' + name + ' ' + pName + ' ' + ctx).toLowerCase()
        });
      }
    }
  }

  // Group 2: Connected & Built-in Providers (OpenCode Zen, OpenCode Go, and auth.json providers)
  const priorityBuiltins = ['opencode', 'opencode-go', ...Object.keys(authMap), ...Object.keys(cfgProviders)];
  const visitedPids = new Set();
  for (const pid of priorityBuiltins) {
    if (visitedPids.has(pid)) continue;
    visitedPids.add(pid);
    const cObj = catalog[pid];
    if (!cObj || !cObj.models_brief) continue;
    const pCfgObj = cfgProviders[pid] || {};
    const wlSet = (Array.isArray(pCfgObj.whitelist) && pCfgObj.whitelist.length > 0) ? new Set(pCfgObj.whitelist) : null;
    const blSet = (Array.isArray(pCfgObj.blacklist) && pCfgObj.blacklist.length > 0) ? new Set(pCfgObj.blacklist) : null;
    const visMap = (state.providersMeta && state.providersMeta.model_visibility && state.providersMeta.model_visibility[pid]) || null;
    const hasDesktopVis = visMap && Object.keys(visMap).length > 0;
    const hasDesktopHide = hasDesktopVis && Object.values(visMap).includes('hide');
    const pName = cObj.name || pid;
    for (const [mid, mBrief] of Object.entries(cObj.models_brief)) {
      if (hasDesktopVis) {
        if (visMap[mid] === 'hide') continue;
        if (visMap[mid] === undefined && hasDesktopHide) continue;
      } else {
        if (wlSet && !wlSet.has(mid)) continue;
        if (blSet && blSet.has(mid)) continue;
      }
      const fullId = pid + '/' + mid;
      if (!seen.has(fullId)) {
        seen.add(fullId);
        const ctx = mBrief.ctx ? Math.round(mBrief.ctx / 1024) + 'K' : '';
        const name = mBrief.name || mid;
        list.push({
          id: fullId,
          providerId: pid,
          providerName: pName,
          modelId: mid,
          name,
          subText: name + ' · ' + pName,
          ctx,
          group: pid === 'opencode' ? 'zen' : (pid === 'opencode-go' ? 'go' : 'connected'),
          searchStr: (fullId + ' ' + name + ' ' + pName + ' ' + ctx).toLowerCase()
        });
      }
    }
  }

  allAvailableModelsList = list;
  return list;
}

function ensureFuzzyModelPicker(inputId) {
  mountFuzzyCombobox(inputId, {
    getItems: () => allAvailableModelsList,
    getGroupLabels: () => ({
      configured: t('fuzzyGroupConfigured'),
      zen: t('fuzzyGroupZen'),
      go: t('fuzzyGroupGo'),
      connected: t('fuzzyGroupConnected')
    }),
    getSearchPlaceholder: () => t('fuzzySearchPh'),
    getTriggerPlaceholder: () => t('fuzzyTriggerPh')
  });
}

function populateAvailableModelsDatalist() {
  buildAvailableModelsList();
  for (const id of FUZZY_MODEL_INPUT_IDS) {
    ensureFuzzyModelPicker(id);
  }

  const catDl = document.getElementById('catalog-providers-datalist');
  if (catDl) {
    catDl.innerHTML = '';
    const catalog = (state.providersMeta && state.providersMeta.catalog) || {};
    for (const [cid, cObj] of Object.entries(catalog)) {
      const opt = document.createElement('option');
      opt.value = cid;
      opt.label = (cObj.name || cid) + ' (' + (cObj.model_count || 0) + ' models)';
      catDl.appendChild(opt);
    }
  }
}

// ============================================================================
// 2. Providers Grid & Selection
// ============================================================================

function renderProviders() {
  populateAvailableModelsDatalist();
  const list = document.getElementById('provider-list');
  if (!list) return;
  list.innerHTML = '';

  const cfgProviders = (state.config && state.config.provider) || {};
  const authMap = (state.providersMeta && state.providersMeta.auth) || {};
  const catalog = (state.providersMeta && state.providersMeta.catalog) || {};

  const allProviderIds = new Set([
    'opencode',
    'opencode-go',
    ...Object.keys(cfgProviders),
    ...Object.keys(authMap)
  ]);

  for (const pid of allProviderIds) {
    const pCfg = cfgProviders[pid] || {};
    const catInfo = catalog[pid] || {};
    const hasAuth = Boolean(authMap[pid] && authMap[pid].key);
    const hasJsoncKey = Boolean(pCfg.options && pCfg.options.apiKey);

    const customModelsCount = pCfg.models ? Object.keys(pCfg.models).length : 0;
    const catalogModelsCount = catInfo.model_count || 0;

    let badgeHtml = '';
    if (pid === 'opencode') {
      badgeHtml = '<span class="badge" style="background: rgba(129, 140, 248, 0.2); color: #818cf8; border: 1px solid rgba(129,140,248,0.4);">' + t('providerZenBadge') + '</span>';
    } else if (pid === 'opencode-go') {
      badgeHtml = '<span class="badge" style="background: rgba(56, 189, 248, 0.2); color: #38bdf8; border: 1px solid rgba(56,189,248,0.4);">' + t('providerGoBadge') + '</span>';
    } else if (catInfo.id) {
      badgeHtml = '<span class="badge" style="color: #94a3b8;">Built-in (' + escapeHtml(catInfo.name) + ')</span>';
    } else {
      badgeHtml = '<span class="badge" style="color: var(--primary);">' + t('providerCustomBadge') + '</span>';
    }

    let authStatusBadge = '';
    if (hasAuth) {
      authStatusBadge += '<span style="color: #a78bfa; font-size: 11px;">🔑 ' + t('providerConnected') + '</span> ';
    }
    if (hasJsoncKey) {
      authStatusBadge += '<span style="color: #38bdf8; font-size: 11px;">📄 ' + t('providerConfigKey') + '</span>';
    }
    if (!hasAuth && !hasJsoncKey) {
      authStatusBadge = '<span style="color: var(--text-muted); font-size: 11px;">' + escapeHtml(t('providerNoKey')) + '</span>';
    }

    const displayName = pCfg.name || catInfo.name || pid;
    const baseUrl = (pCfg.options && pCfg.options.baseURL) || catInfo.api || '(Default SDK Endpoint)';

    const div = document.createElement('div');
    div.className = 'item-card' + (currentProviderId === pid ? ' selected' : '');
    if (pid === 'opencode' || pid === 'opencode-go') {
      div.style.borderLeft = pid === 'opencode' ? '3px solid #818cf8' : '3px solid #38bdf8';
    }
    div.onclick = () => selectProvider(pid);
    div.innerHTML = `
      <div class="item-header">
        <span class="item-name">${escapeHtml(pid)}</span>
        ${badgeHtml}
      </div>
      <div class="item-desc" style="margin-bottom: 6px; color: #cbd5e1; font-weight: 500;">${escapeHtml(displayName)}</div>
      <div style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); margin-bottom: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${escapeHtml(baseUrl)}
      </div>
      <div class="item-footer" style="display: flex; justify-content: space-between; align-items: center;">
        <span>Models: <strong style="color: var(--text);">${customModelsCount}</strong> ${escapeHtml(t('customCountUnit'))}${catalogModelsCount ? ' / ' + catalogModelsCount + ' ' + escapeHtml(t('builtinCountUnit')) : ''}</span>
        <span>${authStatusBadge}</span>
      </div>
    `;
    list.appendChild(div);
  }
}

function selectProvider(pid) {
  currentProviderId = pid;
  renderProviders();

  const cfgProviders = (state.config && state.config.provider) || {};
  const authMap = (state.providersMeta && state.providersMeta.auth) || {};
  const catalog = (state.providersMeta && state.providersMeta.catalog) || {};

  const pCfg = cfgProviders[pid] || {};
  const catInfo = catalog[pid] || {};
  const authObj = authMap[pid] || {};

  document.getElementById('provider-editor').style.display = 'flex';
  document.getElementById('provider-editor-title').innerText = t('editProviderTitle') + ' : ' + pid;
  document.getElementById('prov-id').value = pid;
  document.getElementById('prov-id').disabled = true;

  document.getElementById('prov-name').value = pCfg.name || catInfo.name || '';
  document.getElementById('prov-npm').value = pCfg.npm || catInfo.npm || '';
  document.getElementById('prov-baseurl').value = (pCfg.options && pCfg.options.baseURL) || '';
  document.getElementById('prov-apikey-jsonc').value = (pCfg.options && pCfg.options.apiKey) || '';
  document.getElementById('prov-auth-key').value = authObj.key || '';

  const authStatusEl = document.getElementById('prov-auth-status');
  if (authObj.key) {
    authStatusEl.innerHTML = escapeHtml(t('authKeyExists')) + ' (' + escapeHtml((state.providersMeta && state.providersMeta.auth_path) || '~/.local/share/opencode/auth.json') + ')';
    authStatusEl.style.color = '#10b981';
  } else {
    authStatusEl.innerHTML = escapeHtml(t('authKeyNotSet'));
    authStatusEl.style.color = 'var(--text-muted)';
  }

  // Clone sub-models for editing (filtering out deprecated historical models)
  const depSet = new Set((catInfo && catInfo.deprecated_ids) || []);
  const rawSubModels = JSON.parse(JSON.stringify(pCfg.models || {}));
  for (const dm of depSet) {
    delete rawSubModels[dm];
  }
  currentEditingSubModels = rawSubModels;

  const wlArr = (Array.isArray(pCfg.whitelist) ? pCfg.whitelist : []).filter(m => !depSet.has(m));
  const blArr = (Array.isArray(pCfg.blacklist) ? pCfg.blacklist : []).filter(m => !depSet.has(m));
  currentProbedProviderModels = [];
  if (document.getElementById('prov-model-toggle-search')) document.getElementById('prov-model-toggle-search').value = '';
  initProviderEnabledModelsState(wlArr, blArr);
  document.getElementById('submodel-editor').style.display = 'none';
  renderSubModelsTable();
  renderProviderWbCheckboxes();
  ensureSubModelIdPicker();
  probeCurrentProviderModels(wlArr, blArr);

  const catBtn = document.getElementById('btn-browse-catalog-models');
  if (catInfo && catInfo.model_count > 0) {
    catBtn.style.display = 'inline-flex';
    catBtn.innerText = t('browseCatalogCountBtn', { pid, count: catInfo.model_count });
  } else {
    catBtn.style.display = 'inline-flex';
    catBtn.innerText = t('importCatalogBtn');
  }
}

function openQuickConnectBuiltin(pid) {
  selectProvider(pid);
}

function createNewProvider() {
  currentProviderId = null;
  renderProviders();
  document.getElementById('provider-editor').style.display = 'flex';
  document.getElementById('provider-editor-title').innerText = t('addCustomProvider');
  document.getElementById('prov-id').value = '';
  document.getElementById('prov-id').disabled = false;
  document.getElementById('prov-name').value = '';
  document.getElementById('prov-npm').value = '@ai-sdk/openai-compatible';
  document.getElementById('prov-baseurl').value = 'http://127.0.0.1:8080/v1';
  document.getElementById('prov-apikey-jsonc').value = '';
  document.getElementById('prov-auth-key').value = '';
  document.getElementById('prov-auth-status').innerText = '';
  currentEditingSubModels = {};
  currentProbedProviderModels = [];
  if (document.getElementById('prov-model-toggle-search')) document.getElementById('prov-model-toggle-search').value = '';
  initProviderEnabledModelsState([], []);
  document.getElementById('submodel-editor').style.display = 'none';
  renderSubModelsTable();
  renderProviderWbCheckboxes();
  ensureSubModelIdPicker();
}

// ============================================================================
// 3. Live /v1/models Endpoint Probing & OpenCode Model Visibility Toggle Switches
// ============================================================================

async function probeCurrentProviderModels(wlArr = null, blArr = null) {
  const baseUrlEl = document.getElementById('prov-baseurl');
  const baseUrl = baseUrlEl ? baseUrlEl.value.trim() : '';
  if (!baseUrl) {
    currentProbedProviderModels = [];
    return;
  }
  const apiKey = (document.getElementById('prov-apikey-jsonc') && document.getElementById('prov-apikey-jsonc').value.trim()) ||
                 (document.getElementById('prov-auth-key') && document.getElementById('prov-auth-key').value.trim()) || '';
  try {
    const data = await apiGet('/api/probe-provider-models?node=' + encodeURIComponent(currentNode) +
      '&baseURL=' + encodeURIComponent(baseUrl) +
      '&apiKey=' + encodeURIComponent(apiKey));
    if (data && Array.isArray(data.models) && data.models.length > 0) {
      currentProbedProviderModels = data.models;
      if (Array.isArray(wlArr) && Array.isArray(blArr)) {
        initProviderEnabledModelsState(wlArr, blArr);
      }
      renderProviderWbCheckboxes();
      refreshFuzzyComboboxTrigger('sm-id');
    }
  } catch {
    // Endpoint may be offline or not OpenAI-compatible; ignore silently
  }
}

function getProviderCandidateModels() {
  const pid = (document.getElementById('prov-id') && document.getElementById('prov-id').value.trim()) || currentProviderId || '';
  const catalog = (state.providersMeta && state.providersMeta.catalog) || {};
  const depSet = new Set((catalog[pid] && catalog[pid].deprecated_ids) || []);
  const map = new Map();

  // 1. Sub-models currently configured on this provider
  for (const [mid, mObj] of Object.entries(currentEditingSubModels || {})) {
    if (!depSet.has(mid)) {
      map.set(mid, (mObj && mObj.name) || mid);
    }
  }

  // 2. Live probed models from provider's baseURL (/v1/models)
  for (const pm of (currentProbedProviderModels || [])) {
    if (pm && pm.id && !depSet.has(pm.id) && !map.has(pm.id)) {
      map.set(pm.id, pm.name || pm.id);
    }
  }

  // 3. Built-in active catalog models for this provider
  const catModels = (catalog[pid] && catalog[pid].models_brief) || {};
  for (const [mid, mBrief] of Object.entries(catModels)) {
    if (!depSet.has(mid) && !map.has(mid)) {
      map.set(mid, (mBrief && mBrief.name) || mid);
    }
  }

  return Array.from(map.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
}

function initProviderEnabledModelsState(wlArr, blArr) {
  const pid = (document.getElementById('prov-id') && document.getElementById('prov-id').value.trim()) || currentProviderId || '';
  const allModels = getProviderCandidateModels();
  const visMap = (state.providersMeta && state.providersMeta.model_visibility && state.providersMeta.model_visibility[pid]) || null;

  if (visMap && Object.keys(visMap).length > 0) {
    const hasHide = Object.values(visMap).includes('hide');
    const enabled = [];
    for (const m of allModels) {
      if (visMap[m.id] === 'show') {
        enabled.push(m.id);
      } else if (visMap[m.id] === 'hide') {
        // explicitly hidden in OpenCode Desktop
      } else if (currentEditingSubModels && currentEditingSubModels[m.id]) {
        enabled.push(m.id);
      } else if (!hasHide) {
        enabled.push(m.id);
      }
    }
    currentEnabledModelsSet = new Set(enabled);
  } else if (Array.isArray(wlArr) && wlArr.length > 0) {
    currentEnabledModelsSet = new Set(wlArr);
  } else if (Array.isArray(blArr) && blArr.length > 0) {
    const blSet = new Set(blArr);
    currentEnabledModelsSet = new Set(allModels.map(m => m.id).filter(id => !blSet.has(id)));
  } else {
    currentEnabledModelsSet = new Set(allModels.map(m => m.id));
  }
  syncProviderHiddenInputsFromSet();
}

function buildCurrentProviderVisibilityMap() {
  const allModels = getProviderCandidateModels();
  const map = {};
  for (const m of allModels) {
    map[m.id] = currentEnabledModelsSet.has(m.id) ? 'show' : 'hide';
  }
  return map;
}

async function persistProviderModelVisibilityImmediate() {
  const pid = (document.getElementById('prov-id') && document.getElementById('prov-id').value.trim()) || currentProviderId || '';
  if (!pid) return;
  const visMap = buildCurrentProviderVisibilityMap();
  if (!state.providersMeta) state.providersMeta = {};
  if (!state.providersMeta.model_visibility) state.providersMeta.model_visibility = {};
  state.providersMeta.model_visibility[pid] = visMap;
  populateAvailableModelsDatalist();
  try {
    await apiPost('/api/save-model-visibility', {
      node: currentNode,
      id: pid,
      modelVisibility: visMap
    });
  } catch (e) {
    console.warn('Failed to persist model visibility:', e);
  }
}

function syncProviderHiddenInputsFromSet() {
  const allModels = getProviderCandidateModels();
  const total = allModels.length;
  const enabledCount = allModels.filter(m => currentEnabledModelsSet.has(m.id)).length;

  const wlEl = document.getElementById('prov-whitelist');
  const blEl = document.getElementById('prov-blacklist');
  if (!wlEl || !blEl) return;

  if (total === 0 || enabledCount === total) {
    wlEl.value = '';
    blEl.value = '';
  } else {
    const enabledIds = allModels.filter(m => currentEnabledModelsSet.has(m.id)).map(m => m.id);
    const disabledIds = allModels.filter(m => !currentEnabledModelsSet.has(m.id)).map(m => m.id);
    if (enabledIds.length > 0 && enabledIds.length <= disabledIds.length) {
      wlEl.value = enabledIds.join(', ');
      blEl.value = '';
    } else {
      wlEl.value = '';
      blEl.value = disabledIds.join(', ');
    }
  }
}

function toggleAllProviderModelsVisibility(checked) {
  const allModels = getProviderCandidateModels();
  const query = ((document.getElementById('prov-model-toggle-search') && document.getElementById('prov-model-toggle-search').value) || '').toLowerCase().trim();
  const targetModels = query
    ? allModels.filter(m => m.id.toLowerCase().includes(query) || (m.name && m.name.toLowerCase().includes(query)))
    : allModels;

  for (const m of targetModels) {
    if (checked) currentEnabledModelsSet.add(m.id);
    else currentEnabledModelsSet.delete(m.id);
  }
  syncProviderHiddenInputsFromSet();
  renderProviderWbCheckboxes();
  persistProviderModelVisibilityImmediate();
}

function toggleProviderModelVisibility(mid, checked) {
  if (checked) currentEnabledModelsSet.add(mid);
  else currentEnabledModelsSet.delete(mid);
  syncProviderHiddenInputsFromSet();
  renderProviderWbCheckboxes();
  persistProviderModelVisibilityImmediate();
}

function renderProviderWbCheckboxes() {
  const pid = (document.getElementById('prov-id') && document.getElementById('prov-id').value.trim()) || currentProviderId || 'Provider';
  const pName = (document.getElementById('prov-name') && document.getElementById('prov-name').value.trim()) || pid;
  const allModels = getProviderCandidateModels();

  const validIds = new Set(allModels.map(m => m.id));
  for (const id of Array.from(currentEnabledModelsSet)) {
    if (!validIds.has(id)) currentEnabledModelsSet.delete(id);
  }
  syncProviderHiddenInputsFromSet();

  const titleEl = document.getElementById('oc-toggle-provider-title');
  if (titleEl) titleEl.innerText = pName;

  const countEl = document.getElementById('oc-toggle-provider-count');
  const enabledCount = allModels.filter(m => currentEnabledModelsSet.has(m.id)).length;
  if (countEl) countEl.innerText = enabledCount + ' / ' + allModels.length;

  const masterSw = document.getElementById('oc-provider-master-switch');
  if (masterSw) {
    masterSw.checked = allModels.length > 0 && enabledCount > 0;
  }

  const listEl = document.getElementById('prov-model-toggle-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  const query = ((document.getElementById('prov-model-toggle-search') && document.getElementById('prov-model-toggle-search').value) || '').toLowerCase().trim();
  const filtered = allModels.filter(m => !query || m.id.toLowerCase().includes(query) || (m.name && m.name.toLowerCase().includes(query)));

  if (filtered.length === 0) {
    listEl.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 12px;">' + escapeHtml(t('noSubModelsHint')) + '</div>';
    return;
  }

  for (const m of filtered) {
    const isOn = currentEnabledModelsSet.has(m.id);
    const row = document.createElement('div');
    row.className = 'oc-model-toggle-row' + (isOn ? '' : ' off');
    row.onclick = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.classList.contains('oc-slider')) return;
      toggleProviderModelVisibility(m.id, !isOn);
    };

    const left = document.createElement('div');
    left.innerHTML = '<div class="oc-model-toggle-title">' + escapeHtml(m.name || m.id) +
      (m.name && m.name !== m.id ? ' <span class="oc-model-toggle-sub">(' + escapeHtml(m.id) + ')</span>' : '') +
      '</div>';

    const sw = document.createElement('label');
    sw.className = 'oc-switch';
    sw.onclick = (e) => e.stopPropagation();
    const inp = document.createElement('input');
    inp.type = 'checkbox';
    inp.checked = isOn;
    inp.onchange = () => toggleProviderModelVisibility(m.id, inp.checked);
    const slider = document.createElement('span');
    slider.className = 'oc-slider';
    sw.appendChild(inp);
    sw.appendChild(slider);

    row.appendChild(left);
    row.appendChild(sw);
    listEl.appendChild(row);
  }
}

// ============================================================================
// 4. Sub-Models Table & #sm-id Fuzzy Combobox Dropdown
// ============================================================================

function renderSubModelsTable() {
  const tbody = document.getElementById('submodels-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const pid = document.getElementById('prov-id').value.trim() || currentProviderId || 'provider';
  const entries = Object.entries(currentEditingSubModels || {});
  const primaryModel = (state.config && state.config.model) || '';
  const smallModel = (state.config && state.config.small_model) || '';

  if (entries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">${escapeHtml(t('noSubModelsHint'))}</td></tr>`;
    return;
  }

  for (const [mid, m] of entries) {
    const fullRef = pid + '/' + mid;
    const isPrimary = primaryModel === fullRef;
    const isSmall = smallModel === fullRef;

    const lim = m.limit || {};
    const ctxStr = lim.context ? (lim.context / 1024).toFixed(0) + 'K (' + lim.context.toLocaleString() + ')' : '-';
    const outStr = lim.output ? lim.output.toLocaleString() : '-';

    const mods = (m.modalities && m.modalities.input) ? m.modalities.input.join(', ') : (m.attachment ? 'text, image' : 'text');
    const opts = m.options || {};
    const optParts = [];
    if (opts.temperature !== undefined) optParts.push('temp: ' + opts.temperature);
    if (opts.reasoningEffort) optParts.push('effort: ' + opts.reasoningEffort);

    let statusPills = '';
    if (isPrimary) statusPills += ` <span class="badge" style="background: rgba(16,185,129,0.2); color: #10b981;">★ Primary</span>`;
    if (isSmall) statusPills += ` <span class="badge" style="background: rgba(56,189,248,0.2); color: #38bdf8;">⚡ Small</span>`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-family: var(--font-mono); font-weight: 600; color: #f8fafc;">
        ${escapeHtml(fullRef)}${statusPills}
      </td>
      <td>${escapeHtml(m.name || mid)}</td>
      <td style="font-family: var(--font-mono); font-size: 12px;">Ctx: ${ctxStr} / Out: ${outStr}</td>
      <td><span class="badge">${escapeHtml(mods)}</span>${m.attachment ? ' 📎' : ''}</td>
      <td style="font-family: var(--font-mono); font-size: 11.5px; color: var(--text-muted);">${escapeHtml(optParts.join(' | ') || '-')}</td>
      <td style="text-align: right; white-space: nowrap;">
        <button class="btn btn-sm" onclick="quickAssignGlobalModel('${escapeAttr(fullRef)}', 'primary')">${t('setAsPrimaryBtn')}</button>
        <button class="btn btn-sm" onclick="quickAssignGlobalModel('${escapeAttr(fullRef)}', 'small')">${t('setAsSmallBtn')}</button>
        <button class="btn btn-sm" onclick="openSubModelEditor('${escapeAttr(mid)}')">${t('editBtn')}</button>
        <button class="btn btn-danger btn-sm" onclick="deleteSubModel('${escapeAttr(mid)}')">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

function buildSubModelDropdownCandidates() {
  const pid = (document.getElementById('prov-id') && document.getElementById('prov-id').value.trim()) || currentProviderId || '';
  const catalog = (state.providersMeta && state.providersMeta.catalog) || {};
  const depSet = new Set((catalog[pid] && catalog[pid].deprecated_ids) || []);
  const seen = new Set();
  const list = [];

  // Only models currently configured on this provider
  for (const [mid, mObj] of Object.entries(currentEditingSubModels || {})) {
    if (depSet.has(mid) || seen.has(mid)) continue;
    seen.add(mid);
    const ctxNum = (mObj && mObj.limit && mObj.limit.context) || 0;
    const ctxStr = ctxNum ? Math.round(ctxNum / 1024) + 'K' : '';
    const name = (mObj && mObj.name) || mid;
    list.push({
      id: mid,
      name,
      subText: name !== mid ? name : '',
      ctx: ctxStr,
      ctxNum,
      group: 'configured',
      badgeText: t('fuzzyBadgeConfigured'),
      badgeStyle: 'background:rgba(16,185,129,0.18);color:#10b981;font-size:10px;',
      searchStr: (mid + ' ' + name + ' ' + ctxStr).toLowerCase()
    });
  }

  return list;
}

function ensureSubModelIdPicker() {
  mountFuzzyCombobox('sm-id', {
    getItems: () => buildSubModelDropdownCandidates(),
    getGroupLabels: () => ({
      configured: '⭐ 本供應商已配置模型'
    }),
    getSearchPlaceholder: () => '搜尋或直接輸入自訂模型 ID...',
    getTriggerPlaceholder: () => '點擊下拉選擇模型 ID 或輸入關鍵字搜尋...',
    onSelect: (mid) => applySubModelSelectedIdMetadata(mid)
  });
}

function applySubModelSelectedIdMetadata(mid) {
  const pid = (document.getElementById('prov-id') && document.getElementById('prov-id').value.trim()) || currentProviderId || '';
  const catalog = (state.providersMeta && state.providersMeta.catalog) || {};
  const catModels = (catalog[pid] && catalog[pid].models_brief) || {};

  if (mid && currentEditingSubModels && currentEditingSubModels[mid]) {
    const m = currentEditingSubModels[mid];
    const lim = m.limit || {};
    const opts = m.options || {};
    const mods = (m.modalities && m.modalities.input) ? m.modalities.input.join(', ') : (m.attachment ? 'text, image' : 'text');
    document.getElementById('sm-name').value = m.name || mid;
    document.getElementById('sm-context').value = lim.context || '';
    document.getElementById('sm-input').value = lim.input || '';
    document.getElementById('sm-output').value = lim.output || '';
    document.getElementById('sm-temp').value = opts.temperature !== undefined ? opts.temperature : '';
    document.getElementById('sm-effort').value = opts.reasoningEffort || '';
    document.getElementById('sm-attachment').value = m.attachment !== false ? 'true' : 'false';
    document.getElementById('sm-modalities').value = mods;
  } else if (mid && catModels[mid]) {
    const cb = catModels[mid];
    document.getElementById('sm-name').value = cb.name || mid;
    document.getElementById('sm-context').value = cb.ctx || 262144;
    document.getElementById('sm-input').value = '';
    document.getElementById('sm-output').value = cb.out || 8192;
    document.getElementById('sm-attachment').value = cb.attachment !== false ? 'true' : 'false';
    document.getElementById('sm-modalities').value = cb.attachment !== false ? 'text, image' : 'text';
  } else if (mid) {
    const probed = (currentProbedProviderModels || []).find(p => p.id === mid);
    if (probed) {
      if (!document.getElementById('sm-name').value.trim()) {
        document.getElementById('sm-name').value = probed.name || mid;
      }
      if (probed.ctx && !document.getElementById('sm-context').value.trim()) {
        document.getElementById('sm-context').value = probed.ctx;
      }
    } else if (!document.getElementById('sm-name').value.trim()) {
      document.getElementById('sm-name').value = mid;
    }
  }
}

function openSubModelEditor(mid) {
  const box = document.getElementById('submodel-editor');
  box.style.display = 'block';
  ensureSubModelIdPicker();
  if (!mid) {
    const candidates = buildSubModelDropdownCandidates();
    const firstId = candidates.length > 0 ? candidates[0].id : '';
    document.getElementById('sm-id').value = firstId;
    document.getElementById('sm-id').disabled = false;
    document.getElementById('sm-name').value = '';
    document.getElementById('sm-context').value = '262144';
    document.getElementById('sm-input').value = '';
    document.getElementById('sm-output').value = '8192';
    document.getElementById('sm-temp').value = '';
    document.getElementById('sm-effort').value = '';
    document.getElementById('sm-attachment').value = 'true';
    document.getElementById('sm-modalities').value = 'text, image';
    if (firstId) {
      applySubModelSelectedIdMetadata(firstId);
    }
    refreshFuzzyComboboxTrigger('sm-id');
  } else {
    const m = currentEditingSubModels[mid] || {};
    const lim = m.limit || {};
    const opts = m.options || {};
    const mods = (m.modalities && m.modalities.input) ? m.modalities.input.join(', ') : (m.attachment ? 'text, image' : 'text');

    document.getElementById('sm-id').value = mid;
    document.getElementById('sm-id').disabled = false;
    document.getElementById('sm-name').value = m.name || '';
    document.getElementById('sm-context').value = lim.context || '';
    document.getElementById('sm-input').value = lim.input || '';
    document.getElementById('sm-output').value = lim.output || '';
    document.getElementById('sm-temp').value = opts.temperature !== undefined ? opts.temperature : '';
    document.getElementById('sm-effort').value = opts.reasoningEffort || '';
    document.getElementById('sm-attachment').value = m.attachment !== false ? 'true' : 'false';
    document.getElementById('sm-modalities').value = mods;
    refreshFuzzyComboboxTrigger('sm-id');
  }
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function applySubModelChanges() {
  const mid = document.getElementById('sm-id').value.trim();
  if (!mid) return alert(t('enterModelIdAlert'));

  const existing = currentEditingSubModels[mid] || {};
  const mObj = { ...existing };

  const nameVal = document.getElementById('sm-name').value.trim();
  if (nameVal) mObj.name = nameVal;
  else delete mObj.name;

  mObj.attachment = document.getElementById('sm-attachment').value === 'true';

  const modStr = document.getElementById('sm-modalities').value.trim();
  if (modStr) {
    const inputs = modStr.split(',').map(s => s.trim()).filter(Boolean);
    mObj.modalities = { input: inputs, output: (existing.modalities && existing.modalities.output) || ['text'] };
  }

  const tempRaw = document.getElementById('sm-temp').value.trim();
  const effortVal = document.getElementById('sm-effort').value;
  if (tempRaw !== '' || effortVal !== '') {
    mObj.options = { ...(existing.options || {}) };
    if (tempRaw !== '') mObj.options.temperature = parseFloat(tempRaw);
    else delete mObj.options.temperature;
    if (effortVal !== '') mObj.options.reasoningEffort = effortVal;
    else delete mObj.options.reasoningEffort;
    if (Object.keys(mObj.options).length === 0) delete mObj.options;
  } else {
    delete mObj.options;
  }

  const ctxVal = parseInt(document.getElementById('sm-context').value, 10);
  const inpVal = parseInt(document.getElementById('sm-input').value, 10);
  const outVal = parseInt(document.getElementById('sm-output').value, 10);
  if (ctxVal || inpVal || outVal) {
    mObj.limit = {};
    if (ctxVal) mObj.limit.context = ctxVal;
    if (inpVal) mObj.limit.input = inpVal;
    if (outVal) mObj.limit.output = outVal;
  }

  currentEditingSubModels[mid] = mObj;
  currentEnabledModelsSet.add(mid);
  document.getElementById('submodel-editor').style.display = 'none';
  renderSubModelsTable();
  renderProviderWbCheckboxes();
  showToast(t('subModelListUpdatedToast'));
}

function deleteSubModel(mid) {
  if (!confirm(t('confirmDeleteModel') + mid + '?')) return;
  delete currentEditingSubModels[mid];
  renderSubModelsTable();
  renderProviderWbCheckboxes();
}

// ============================================================================
// 5. Save / Delete Provider, Auth Key & Global Model Assignment
// ============================================================================

async function saveCurrentProvider() {
  const pid = document.getElementById('prov-id').value.trim();
  if (!pid) return alert(t('enterProviderIdAlert'));

  const existing = ((state.config && state.config.provider && state.config.provider[pid]) || {});
  const pObj = { ...existing };

  const npmVal = document.getElementById('prov-npm').value.trim();
  if (npmVal) pObj.npm = npmVal;
  else delete pObj.npm;

  const nameVal = document.getElementById('prov-name').value.trim();
  if (nameVal) pObj.name = nameVal;
  else delete pObj.name;

  const baseUrlVal = document.getElementById('prov-baseurl').value.trim();
  const apiKeyVal = document.getElementById('prov-apikey-jsonc').value.trim();
  if (baseUrlVal || apiKeyVal) {
    pObj.options = { ...(existing.options || {}) };
    if (baseUrlVal) pObj.options.baseURL = baseUrlVal;
    else delete pObj.options.baseURL;
    if (apiKeyVal) pObj.options.apiKey = apiKeyVal;
    else delete pObj.options.apiKey;
    if (Object.keys(pObj.options).length === 0) delete pObj.options;
  } else {
    delete pObj.options;
  }

  const wl = document.getElementById('prov-whitelist').value.split(',').map(s => s.trim()).filter(Boolean);
  if (wl.length > 0) pObj.whitelist = wl;
  else delete pObj.whitelist;

  const bl = document.getElementById('prov-blacklist').value.split(',').map(s => s.trim()).filter(Boolean);
  if (bl.length > 0) pObj.blacklist = bl;
  else delete pObj.blacklist;

  if (Object.keys(currentEditingSubModels).length > 0) {
    pObj.models = currentEditingSubModels;
  } else {
    delete pObj.models;
  }

  showLoading(true);
  await apiPost('/api/save-provider', {
    node: currentNode,
    id: pid,
    providerConfig: pObj,
    modelVisibility: buildCurrentProviderVisibilityMap()
  });
  currentProviderId = pid;
  showToast(t('providerSavedMsg'));
  await reloadAll();
  selectProvider(pid);
}

async function deleteCurrentProvider() {
  if (!currentProviderId) return;
  if (!confirm(t('confirmDeleteProvider') + currentProviderId + '?')) return;
  showLoading(true);
  await apiPost('/api/delete-provider', { node: currentNode, id: currentProviderId });
  showToast(t('providerDeletedMsg'));
  document.getElementById('provider-editor').style.display = 'none';
  currentProviderId = null;
  await reloadAll();
}

async function saveProviderAuthKey() {
  const pid = document.getElementById('prov-id').value.trim() || currentProviderId;
  if (!pid) return alert(t('enterProviderIdAlert'));
  const keyVal = document.getElementById('prov-auth-key').value.trim();
  showLoading(true);
  await apiPost('/api/save-auth', { node: currentNode, id: pid, key: keyVal, type: 'api' });
  showToast(t('authSavedMsg'));
  await reloadAll();
  selectProvider(pid);
}

async function saveGlobalModelAssignment() {
  showLoading(true);
  await apiPost('/api/save-global-models', {
    node: currentNode,
    primaryModel: document.getElementById('global-primary-model').value.trim(),
    smallModel: document.getElementById('global-small-model').value.trim(),
    titleModel: document.getElementById('global-title-model').value.trim(),
    compactionModel: document.getElementById('global-compaction-model').value.trim()
  });
  showToast(t('globalModelsSavedMsg'));
  await reloadAll();
}

async function quickAssignGlobalModel(fullModelRef, role) {
  if (role === 'primary') {
    document.getElementById('global-primary-model').value = fullModelRef;
  } else if (role === 'small') {
    document.getElementById('global-small-model').value = fullModelRef;
  }
  await saveGlobalModelAssignment();
  if (currentProviderId) selectProvider(currentProviderId);
}

async function saveCoreAgents() {
  showLoading(true);
  await apiPost('/api/save-core-agent', {
    node: currentNode,
    compactionModel: document.getElementById('compaction-model').value.trim(),
    compactionPrompt: document.getElementById('compaction-prompt').value.trim(),
    titleModel: document.getElementById('title-model').value.trim()
  });
  showToast(t('coreConfigSaved'));
  await reloadAll();
}

// ============================================================================
// 6. Official Models.dev Catalog Browser Modal
// ============================================================================

async function openCatalogForCurrentProvider() {
  const pid = document.getElementById('prov-id').value.trim() || currentProviderId || 'opencode';
  await openCatalogBrowserModal(pid);
}

async function openCatalogBrowserModal(defaultPid) {
  const catalog = (state.providersMeta && state.providersMeta.catalog) || {};
  const sel = document.getElementById('catalog-provider-select');
  sel.innerHTML = '';

  const priority = ['opencode', 'opencode-go', 'openai', 'anthropic', 'google', 'deepseek', 'meta', 'openrouter'];
  const allIds = Object.keys(catalog).sort((a, b) => {
    const ia = priority.indexOf(a);
    const ib = priority.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });

  for (const cid of allIds) {
    const c = catalog[cid];
    const opt = document.createElement('option');
    opt.value = cid;
    let label = `${c.name || cid} (${cid}) - ${c.model_count || 0} models`;
    if (cid === 'opencode') label = '✨ OpenCode Zen (opencode) - ' + (c.model_count || 0) + ' models';
    if (cid === 'opencode-go') label = '🚀 OpenCode Go (opencode-go) - ' + (c.model_count || 0) + ' models';
    opt.innerText = label;
    sel.appendChild(opt);
  }

  const targetPid = (defaultPid && catalog[defaultPid]) ? defaultPid : 'opencode';
  sel.value = targetPid;
  document.getElementById('catalog-model-search').value = '';
  document.getElementById('catalog-modal').style.display = 'flex';
  await loadCatalogModelsForProvider(targetPid);
}

async function loadCatalogModelsForProvider(pid) {
  const tbody = document.getElementById('catalog-models-tbody');
  tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px;">' + escapeHtml(t('loadingCatalog')) + '</td></tr>';
  try {
    const data = await apiGet('/api/catalog-models?node=' + currentNode + '&provider=' + encodeURIComponent(pid));
    currentCatalogModelsCache = { providerId: pid, models: data.models || {}, provider: data.provider || {} };
    document.getElementById('catalog-modal-subtitle').innerText = `Provider: ${pid} | API: ${(data.provider && data.provider.api) || 'SDK Default'} | Total: ${Object.keys(currentCatalogModelsCache.models).length} models`;
    filterCatalogModelsTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--danger);">${escapeHtml(t('loadFailed'))}${escapeHtml(err.message)}</td></tr>`;
  }
}

function filterCatalogModelsTable() {
  const q = (document.getElementById('catalog-model-search').value || '').toLowerCase().trim();
  const tbody = document.getElementById('catalog-models-tbody');
  tbody.innerHTML = '';

  const pid = currentCatalogModelsCache.providerId || 'opencode';
  const models = currentCatalogModelsCache.models || {};
  const entries = Object.entries(models).filter(([mid, m]) => {
    if (!q) return true;
    return mid.toLowerCase().includes(q) || (m.name && m.name.toLowerCase().includes(q));
  });

  if (entries.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">' + escapeHtml(t('fuzzyNoMatch')) + '</td></tr>';
    return;
  }

  for (const [mid, m] of entries) {
    const fullRef = pid + '/' + mid;
    const lim = m.limit || {};
    const ctxStr = lim.context ? (lim.context / 1024).toFixed(0) + 'K' : '-';
    const outStr = lim.output ? (lim.output / 1024).toFixed(0) + 'K' : '-';
    const mods = (m.modalities && m.modalities.input) ? m.modalities.input.join(', ') : 'text';
    const isFree = mid.includes('free') || (m.cost && m.cost.input === 0);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-family: var(--font-mono); font-weight: 600; color: #38bdf8;">${escapeHtml(fullRef)}</td>
      <td>${escapeHtml(m.name || mid)}</td>
      <td style="font-family: var(--font-mono); font-size: 12px;">Ctx: ${ctxStr} / Out: ${outStr}</td>
      <td>
        <span class="badge">${escapeHtml(mods)}</span>
        ${m.reasoning ? '<span class="badge" style="color:#c084fc;">Reasoning</span>' : ''}
        ${isFree ? '<span class="badge" style="background:rgba(16,185,129,0.2);color:#10b981;">FREE</span>' : ''}
      </td>
      <td style="text-align: right; white-space: nowrap;">
        <button class="btn btn-sm" onclick="importCatalogModelToProvider('${escapeAttr(pid)}', '${escapeAttr(mid)}')">${t('catalogImportAction')}</button>
        <button class="btn btn-primary btn-sm" onclick="setCatalogModelAsPrimary('${escapeAttr(fullRef)}')">${t('catalogSetPrimaryAction')}</button>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

function importCatalogModelToProvider(pid, mid) {
  const m = (currentCatalogModelsCache.models && currentCatalogModelsCache.models[mid]) || {};
  if (currentProviderId !== pid) {
    selectProvider(pid);
  }
  currentEditingSubModels[mid] = {
    name: m.name || mid,
    attachment: Boolean(m.attachment),
    modalities: m.modalities || { input: ['text'], output: ['text'] },
    limit: m.limit || { context: 128000, output: 8192 }
  };
  currentEnabledModelsSet.add(mid);
  renderSubModelsTable();
  renderProviderWbCheckboxes();
  document.getElementById('catalog-modal').style.display = 'none';
  openSubModelEditor(mid);
  showToast(t('catalogImportedToast', { ref: pid + '/' + mid }));
}

async function setCatalogModelAsPrimary(fullRef) {
  document.getElementById('global-primary-model').value = fullRef;
  document.getElementById('catalog-modal').style.display = 'none';
  await saveGlobalModelAssignment();
}
