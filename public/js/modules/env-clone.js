// public/js/modules/env-clone.js
// OpenCode Environment Clone, Multi-Node Network Replication, and Snapshot Export/Import Module

let currentEnvCloneSubTab = 'clone';
let currentImportBundle = null;

const ALL_CLONE_MODULES = [
  { id: 'providers', labelKey: 'modProviders', default: true },
  { id: 'models_visibility', labelKey: 'modModelsVisibility', default: true },
  { id: 'auth', labelKey: 'modAuth', default: true },
  { id: 'agents', labelKey: 'modAgents', default: true },
  { id: 'plugins', labelKey: 'modPlugins', default: true },
  { id: 'prompts', labelKey: 'modPrompts', default: true },
  { id: 'mcp', labelKey: 'modMcp', default: true },
  { id: 'tools', labelKey: 'modTools', default: true },
  { id: 'permissions', labelKey: 'modPermissions', default: true },
  { id: 'sqlite', labelKey: 'modSqlite', default: true }
];

// ============================================================================
// 1. Modal Lifecycle & Sub-tab Switching
// ============================================================================

function openEnvCloneModal() {
  currentEnvCloneSubTab = 'clone';
  currentImportBundle = null;
  populateEnvCloneForm();
  switchEnvCloneSubTab('clone');
  document.getElementById('env-clone-modal').style.display = 'flex';
}

function closeEnvCloneModal() {
  document.getElementById('env-clone-modal').style.display = 'none';
}

function closeEnvCloneModalOverlay(e) {
  if (e.target.id === 'env-clone-modal') {
    closeEnvCloneModal();
  }
}

function switchEnvCloneSubTab(tab) {
  currentEnvCloneSubTab = tab;
  ['clone', 'export', 'import'].forEach(tKey => {
    const btn = document.getElementById('btn-env-tab-' + tKey);
    const pane = document.getElementById('env-pane-' + tKey);
    if (btn) {
      if (tKey === tab) {
        btn.classList.add('active');
        btn.style.background = 'rgba(236,72,153,0.2)';
        btn.style.color = '#f472b6';
        btn.style.borderColor = '#ec4899';
      } else {
        btn.classList.remove('active');
        btn.style.background = 'transparent';
        btn.style.color = 'var(--text-muted)';
        btn.style.borderColor = 'var(--border)';
      }
    }
    if (pane) {
      pane.style.display = tKey === tab ? 'block' : 'none';
    }
  });
}

// ============================================================================
// 2. Form Population (Source, Targets, Modules)
// ============================================================================

function populateEnvCloneForm() {
  // Source Selectors
  const cloneSourceSel = document.getElementById('env-clone-source-select');
  const exportSourceSel = document.getElementById('env-export-source-select');
  const importTargetSel = document.getElementById('env-import-target-select');

  [cloneSourceSel, exportSourceSel, importTargetSel].forEach(sel => {
    if (!sel) return;
    sel.innerHTML = '';
    nodeList.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n.id;
      opt.innerText = `${n.name} (${n.ip})`;
      sel.appendChild(opt);
    });
    sel.value = currentNode;
  });

  // Target nodes checkboxes for Network Clone
  renderCloneTargetNodesChecklist();

  // Render Module Checklists
  renderModuleChecklist('env-clone-modules-list', 'clone');
  renderModuleChecklist('env-export-modules-list', 'export');

  // Reset import area
  const importPreview = document.getElementById('env-import-preview');
  if (importPreview) importPreview.style.display = 'none';
  const importFileInp = document.getElementById('env-import-file-input');
  if (importFileInp) importFileInp.value = '';
  const cloneResults = document.getElementById('env-clone-results');
  if (cloneResults) cloneResults.innerHTML = '';
}

function renderCloneTargetNodesChecklist() {
  const container = document.getElementById('env-clone-targets-list');
  if (!container) return;
  container.innerHTML = '';

  const sourceNodeId = document.getElementById('env-clone-source-select').value;
  const targetCandidates = nodeList.filter(n => n.id !== sourceNodeId);

  if (targetCandidates.length === 0) {
    container.innerHTML = `<div style="color:var(--text-muted);font-size:12px;padding:8px;">${t('noOtherNodesHint')}</div>`;
    return;
  }

  targetCandidates.forEach(n => {
    const lbl = document.createElement('label');
    lbl.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 10px;background:#11131a;border:1px solid var(--border);border-radius:5px;cursor:pointer;margin-bottom:6px;';
    lbl.innerHTML = `
      <input type="checkbox" class="env-clone-target-cb" value="${escapeHtml(n.id)}" checked style="width:15px;height:15px;accent-color:#ec4899;">
      <span style="font-weight:600;color:#fff;font-size:12.5px;">${escapeHtml(n.name)}</span>
      <span style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono);">(${escapeHtml(n.ip)} - ${escapeHtml(n.type)})</span>
    `;
    container.appendChild(lbl);
  });
}

function onCloneSourceChange() {
  renderCloneTargetNodesChecklist();
}

function renderModuleChecklist(containerId, prefix) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Preserve checked state if re-rendering due to language change
  const currentChecked = {};
  container.querySelectorAll(`.${prefix}-module-cb`).forEach(cb => {
    currentChecked[cb.getAttribute('data-module')] = cb.checked;
  });

  container.innerHTML = '';

  ALL_CLONE_MODULES.forEach(m => {
    const isChecked = currentChecked[m.id] !== undefined ? currentChecked[m.id] : m.default;
    const labelText = t(m.labelKey);

    const lbl = document.createElement('label');
    lbl.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 10px;background:#11131a;border:1px solid var(--border);border-radius:5px;cursor:pointer;margin-bottom:6px;';
    lbl.innerHTML = `
      <input type="checkbox" class="${prefix}-module-cb" data-module="${m.id}" ${isChecked ? 'checked' : ''} style="width:15px;height:15px;accent-color:#ec4899;">
      <span style="font-size:12.5px;color:#cbd5e1;">${escapeHtml(labelText)}</span>
    `;
    container.appendChild(lbl);
  });
}

function toggleAllCloneTargets(checked) {
  document.querySelectorAll('.env-clone-target-cb').forEach(cb => { cb.checked = checked; });
}

function toggleAllModules(prefix, checked) {
  document.querySelectorAll(`.${prefix}-module-cb`).forEach(cb => { cb.checked = checked; });
}

function getSelectedModules(prefix) {
  const list = [];
  document.querySelectorAll(`.${prefix}-module-cb:checked`).forEach(cb => {
    list.push(cb.getAttribute('data-module'));
  });
  return list;
}

function refreshEnvCloneI18n() {
  const modal = document.getElementById('env-clone-modal');
  if (!modal || modal.style.display === 'none') return;
  renderCloneTargetNodesChecklist();
  renderModuleChecklist('env-clone-modules-list', 'clone');
  renderModuleChecklist('env-export-modules-list', 'export');
  if (currentImportBundle) {
    const fn = document.getElementById('env-import-preview-name').innerText;
    renderImportPreview(currentImportBundle, fn);
  }
}

// ============================================================================
// 3. Network Clone Execution (Node to Node)
// ============================================================================

async function executeNetworkClone() {
  const sourceNode = document.getElementById('env-clone-source-select').value;
  const targetNodes = [];
  document.querySelectorAll('.env-clone-target-cb:checked').forEach(cb => {
    targetNodes.push(cb.value);
  });

  if (targetNodes.length === 0) {
    return alert(t('alertNoTargets'));
  }

  const modules = getSelectedModules('clone');
  if (modules.length === 0) {
    return alert(t('alertNoModules'));
  }

  const smartPathTranslate = document.getElementById('env-clone-opt-translate').checked;
  const preserveBaseUrls = document.getElementById('env-clone-opt-preserve-urls').checked;
  const backupTarget = document.getElementById('env-clone-opt-backup').checked;

  const confirmMsg = t('confirmNetworkClone', {
    source: sourceNode,
    count: targetNodes.length,
    targets: targetNodes.map(tNode => ' • ' + tNode).join('\n'),
    modCount: modules.length
  });

  if (!confirm(confirmMsg)) return;

  const resultsContainer = document.getElementById('env-clone-results');
  resultsContainer.innerHTML = `<div style="padding:12px;color:#38bdf8;font-size:12.5px;">${t('cloneSyncing')}</div>`;
  showLoading(true);

  try {
    const res = await apiPost('/api/env-clone', {
      sourceNode,
      targetNodes,
      options: {
        modules,
        smartPathTranslate,
        preserveBaseUrls,
        backupTarget
      }
    });

    resultsContainer.innerHTML = '';
    const results = res.results || [];
    let allOk = true;

    results.forEach(r => {
      const isOk = r.ok;
      if (!isOk) allOk = false;
      const targetObj = nodeList.find(n => n.id === r.targetNode) || { name: r.targetNode };

      const div = document.createElement('div');
      div.style.cssText = `background: #090a0d; border: 1px solid ${isOk ? '#10b981' : '#ef4444'}; border-radius: 6px; padding: 10px 14px; margin-bottom: 8px;`;
      div.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-weight:600;color:#fff;font-size:13px;">${escapeHtml(targetObj.name)} (${escapeHtml(r.targetNode)})</span>
          <span class="badge" style="background:${isOk ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'};color:${isOk ? '#10b981' : '#ef4444'};">
            ${isOk ? t('previewCloneSuccess') : t('previewCloneFailed') + ': ' + escapeHtml(r.error || '')}
          </span>
        </div>
        ${isOk ? `<div style="font-size:11.5px;color:var(--text-muted);margin-top:4px;">${t('previewSyncModules')}: ${(r.appliedModules || []).join(', ')} | ${t('previewAutoBackup')}: ${r.backupCreated ? t('previewBackupCreated') : t('previewBackupDisabled')}</div>` : ''}
      `;
      resultsContainer.appendChild(div);
    });

    if (allOk) {
      showToast(t('cloneSuccessAll'));
      if (targetNodes.includes(currentNode)) {
        await reloadAll();
      }
    } else {
      showToast(t('clonePartialFail'));
    }
  } catch (err) {
    resultsContainer.innerHTML = `<div style="color:var(--danger);padding:10px;">${t('cloneFailed')} ${escapeHtml(err.message)}</div>`;
    alert(t('cloneFailed') + ' ' + err.message);
  } finally {
    showLoading(false);
  }
}

// ============================================================================
// 4. Export Bundle (.json)
// ============================================================================

function downloadEnvExport() {
  const sourceNode = document.getElementById('env-export-source-select').value;
  const modules = getSelectedModules('export');
  if (modules.length === 0) {
    return alert(t('alertNoModules'));
  }

  const url = `/api/env-export?node=${encodeURIComponent(sourceNode)}&modules=${encodeURIComponent(modules.join(','))}&download=1`;
  const a = document.createElement('a');
  a.href = url;
  a.download = `opencode-env-${sourceNode}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast(t('exportStarted', { node: sourceNode }));
}

// ============================================================================
// 5. Import & Restore Bundle
// ============================================================================

function onEnvImportFileSelected(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const bundle = JSON.parse(e.target.result);
      if (!bundle || !bundle.components) {
        throw new Error(t('alertInvalidSnapshot'));
      }
      currentImportBundle = bundle;
      renderImportPreview(bundle, file.name);
    } catch (err) {
      alert(t('alertParseSnapshotFail') + ' ' + err.message);
      currentImportBundle = null;
      document.getElementById('env-import-preview').style.display = 'none';
    }
  };
  reader.readAsText(file, 'utf-8');
}

function renderImportPreview(bundle, filename) {
  const preview = document.getElementById('env-import-preview');
  if (!preview) return;
  preview.style.display = 'block';

  const src = bundle.source || {};
  const comp = bundle.components || {};

  const agentCount = Array.isArray(comp.agents) ? comp.agents.length : 0;
  const pluginCount = Array.isArray(comp.plugins) ? comp.plugins.length : 0;
  const provCount = comp.providers && comp.providers.provider ? Object.keys(comp.providers.provider).length : 0;
  const hasAuth = comp.auth && Object.keys(comp.auth).length > 0;
  const hasSqlite = comp.sqlite && comp.sqlite.gzipBase64;
  const sqliteSizeStr = hasSqlite ? (comp.sqlite.size ? formatBytes(comp.sqlite.size) : t('previewIncluded')) : t('previewNone');

  document.getElementById('env-import-preview-name').innerText = filename;
  document.getElementById('env-import-preview-meta').innerText =
    `${t('previewSourceNode')}: ${src.name || src.id || 'Unknown'} (${src.isWindows ? 'Windows' : 'Linux'}) | ${t('previewExportTime')}: ${formatTime(bundle.exportedAt)} | ${t('previewVersion')}: ${bundle.version || '1.0'}`;

  document.getElementById('env-import-preview-summary').innerHTML = `
    <span>🧠 ${t('previewProviders')}: <strong>${provCount}</strong></span>
    <span>🤖 ${t('previewAgents')}: <strong>${agentCount}</strong></span>
    <span>🧩 ${t('previewPlugins')}: <strong>${pluginCount}</strong></span>
    <span>🔑 ${t('previewAuth')}: <strong>${hasAuth ? t('previewIncluded') : t('previewNone')}</strong></span>
    <span>💾 ${t('previewSqlite')}: <strong>${sqliteSizeStr}</strong></span>
  `;
}

async function executeEnvImport() {
  if (!currentImportBundle) {
    return alert(t('alertNoImportFile'));
  }

  const targetNode = document.getElementById('env-import-target-select').value;
  const smartPathTranslate = document.getElementById('env-import-opt-translate').checked;
  const preserveBaseUrls = document.getElementById('env-import-opt-preserve-urls').checked;
  const backupTarget = document.getElementById('env-import-opt-backup').checked;

  const targetObj = nodeList.find(n => n.id === targetNode) || { name: targetNode };
  const confirmMsg = t('confirmEnvImport', { target: targetObj.name });
  if (!confirm(confirmMsg)) return;

  showLoading(true);
  try {
    const res = await apiPost('/api/env-import', {
      node: targetNode,
      bundle: currentImportBundle,
      options: {
        smartPathTranslate,
        preserveBaseUrls,
        backupTarget
      }
    });

    if (res.error) throw new Error(res.error);

    showToast(t('importSuccess', { node: targetObj.name }));
    if (targetNode === currentNode) {
      await reloadAll();
    }
    closeEnvCloneModal();
  } catch (err) {
    alert(t('importFailed') + ' ' + err.message);
  } finally {
    showLoading(false);
  }
}
