// public/js/modules/env-clone.js
// OpenCode Environment Clone, Multi-Node Network Replication, and Snapshot Export/Import Module

let currentEnvCloneSubTab = 'clone';
let currentImportBundle = null;

const ALL_CLONE_MODULES = [
  { id: 'providers', label: '🧠 供應商、旗下模型與全域指派 (Providers & Global Models)', default: true },
  { id: 'models_visibility', label: '🎛️ 模型選擇器顯示開關 (opencode.global.dat 撥桿狀態)', default: true },
  { id: 'auth', label: '🔑 全域認證金鑰 (auth.json Keys)', default: true },
  { id: 'agents', label: '🤖 自訂代理角色 (agent/*.md 檔案與專屬權限)', default: true },
  { id: 'plugins', label: '🧩 插件與依角色啟停 (plugin/*.js 與 scopes)', default: true },
  { id: 'prompts', label: '📋 系統提示詞 (AGENTS.md / local / ssh)', default: true },
  { id: 'mcp', label: '🔌 MCP 擴充伺服器設定 (opencode.jsonc mcp)', default: true },
  { id: 'tools', label: '🛠️ 工具精簡設定 (plugin/trim-tools.js)', default: true },
  { id: 'permissions', label: '🛡️ Bash 權限規則 (permission.bash)', default: true }
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
  ['clone', 'export', 'import'].forEach(t => {
    const btn = document.getElementById('btn-env-tab-' + t);
    const pane = document.getElementById('env-pane-' + t);
    if (btn) {
      if (t === tab) {
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
      pane.style.display = t === tab ? 'block' : 'none';
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
    container.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px;">(查無其他主機節點，請先至「⚙️ 管理主機」新增遠端節點)</div>';
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
  container.innerHTML = '';

  ALL_CLONE_MODULES.forEach(m => {
    const lbl = document.createElement('label');
    lbl.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 10px;background:#11131a;border:1px solid var(--border);border-radius:5px;cursor:pointer;margin-bottom:6px;';
    lbl.innerHTML = `
      <input type="checkbox" class="${prefix}-module-cb" data-module="${m.id}" ${m.default ? 'checked' : ''} style="width:15px;height:15px;accent-color:#ec4899;">
      <span style="font-size:12.5px;color:#cbd5e1;">${escapeHtml(m.label)}</span>
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
    return alert('請至少勾選一個接收複製的目標節點！');
  }

  const modules = getSelectedModules('clone');
  if (modules.length === 0) {
    return alert('請至少勾選一項要複製的環境項目！');
  }

  const smartPathTranslate = document.getElementById('env-clone-opt-translate').checked;
  const preserveBaseUrls = document.getElementById('env-clone-opt-preserve-urls').checked;
  const backupTarget = document.getElementById('env-clone-opt-backup').checked;

  const confirmMsg = `確定要將【${sourceNode}】的 OpenCode 環境推送到以下 ${targetNodes.length} 台主機嗎？\n` +
    targetNodes.map(t => ' • ' + t).join('\n') +
    `\n\n共包含 ${modules.length} 個模組，目標主機將在寫入前自動建立安全備份。`;

  if (!confirm(confirmMsg)) return;

  const resultsContainer = document.getElementById('env-clone-results');
  resultsContainer.innerHTML = '<div style="padding:12px;color:#38bdf8;font-size:12.5px;">⏳ 正在網路對拷同步中，請稍候...</div>';
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
            ${isOk ? '✓ 對拷成功' : '✕ 失敗: ' + escapeHtml(r.error || '')}
          </span>
        </div>
        ${isOk ? `<div style="font-size:11.5px;color:var(--text-muted);margin-top:4px;">同步模組: ${(r.appliedModules || []).join(', ')} | 自動備份: ${r.backupCreated ? '已建立' : '未啟用'}</div>` : ''}
      `;
      resultsContainer.appendChild(div);
    });

    if (allOk) {
      showToast('🎉 跨機網路對拷全數完成！');
      if (targetNodes.includes(currentNode)) {
        await reloadAll();
      }
    } else {
      showToast('⚠️ 部分節點對拷失敗，請檢視結果清單');
    }
  } catch (err) {
    resultsContainer.innerHTML = `<div style="color:var(--danger);padding:10px;">對拷失敗: ${escapeHtml(err.message)}</div>`;
    alert('對拷失敗: ' + err.message);
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
    return alert('請至少勾選一項要匯出的環境模組！');
  }

  const url = `/api/env-export?node=${encodeURIComponent(sourceNode)}&modules=${encodeURIComponent(modules.join(','))}&download=1`;
  const a = document.createElement('a');
  a.href = url;
  a.download = `opencode-env-${sourceNode}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast(`已開始下載【${sourceNode}】環境快照包`);
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
        throw new Error('此檔案不是合法的 OpenCode 環境快照包 (缺少 components 區塊)');
      }
      currentImportBundle = bundle;
      renderImportPreview(bundle, file.name);
    } catch (err) {
      alert('解析快照失敗: ' + err.message);
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

  document.getElementById('env-import-preview-name').innerText = filename;
  document.getElementById('env-import-preview-meta').innerText =
    `來源節點: ${src.name || src.id || '未知'} (${src.isWindows ? 'Windows' : 'Linux'}) | 匯出時間: ${formatTime(bundle.exportedAt)} | 版本: ${bundle.version || '1.0'}`;

  document.getElementById('env-import-preview-summary').innerHTML = `
    <span>🧠 供應商: <strong>${provCount}</strong> 組</span>
    <span>🤖 代理角色: <strong>${agentCount}</strong> 款</span>
    <span>🧩 插件: <strong>${pluginCount}</strong> 個</span>
    <span>🔑 認證金鑰: <strong>${hasAuth ? '包含' : '無'}</strong></span>
  `;
}

async function executeEnvImport() {
  if (!currentImportBundle) {
    return alert('請先選取要還原匯入的快照檔案 (.json)！');
  }

  const targetNode = document.getElementById('env-import-target-select').value;
  const smartPathTranslate = document.getElementById('env-import-opt-translate').checked;
  const preserveBaseUrls = document.getElementById('env-import-opt-preserve-urls').checked;
  const backupTarget = document.getElementById('env-import-opt-backup').checked;

  const targetObj = nodeList.find(n => n.id === targetNode) || { name: targetNode };
  const confirmMsg = `確定要將此快照還原匯入至目標節點【${targetObj.name}】嗎？\n\n寫入前將自動在目標機建立 .bak 安全備份。`;
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

    showToast(`🎉 快照已成功還原匯入至【${targetObj.name}】！`);
    if (targetNode === currentNode) {
      await reloadAll();
    }
    closeEnvCloneModal();
  } catch (err) {
    alert('還原匯入失敗: ' + err.message);
  } finally {
    showLoading(false);
  }
}
