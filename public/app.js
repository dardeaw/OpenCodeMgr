// public/app.js — OpenCode Manager Frontend Application

// Detect Language: 1. localStorage, 2. navigator.language (OS / Browser), 3. serverDetectedLocale, 4. 'zh-TW'
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

      const srv = (window.SERVER_DETECTED_LOCALE || "zh-TW").toLowerCase();
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
        str = str.replace(new RegExp('\{' + k + '\}', 'g'), v);
      }
      return str;
    }

    function applyDomI18n() {
      // 1. Update document title
      document.title = t('appName');

      // 2. Update language selector value
      const lSel = document.getElementById('lang-selector');
      if (lSel) lSel.value = currentLang;

      // 3. Update all elements with data-i18n
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const k = el.getAttribute('data-i18n');
        if (k) el.innerText = t(k);
      });

      // 4. Update all placeholders with data-i18n-placeholder
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
      // Re-render all dynamic sections immediately
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
      for (const id of FUZZY_MODEL_INPUT_IDS) {
        const searchInp = document.getElementById('fuzzy-search-' + id);
        if (searchInp) searchInp.placeholder = t('fuzzySearchPh');
        const clearBtn = document.querySelector('#fuzzy-wrap-' + id + ' .fuzzy-clear-btn');
        if (clearBtn) clearBtn.innerText = t('fuzzyClearBtn');
        updateFuzzyTriggerDisplay(id);
      }
    }

    let nodeList = [];
    let currentNode = 'local';
    let state = {};
    let currentAgentId = null;
    let currentMcpId = null;
    let currentSessionData = null;

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

    function showLoading(show) {
      document.getElementById('loading').style.display = show ? 'flex' : 'none';
    }

    function showToast(msg) {
      const t = document.getElementById('toast');
      t.innerText = msg;
      t.style.display = 'block';
      setTimeout(() => { t.style.display = 'none'; }, 2500);
    }

    function switchTab(id) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      if (event && event.currentTarget) event.currentTarget.classList.add('active');
      else if (event && event.target) event.target.classList.add('active');
      document.getElementById(id).classList.add('active');
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

    // Dynamic Node Switcher
    async function loadNodeList() {
      const res = await fetch('/api/nodes');
      nodeList = await res.json();
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
        const res = await fetch('/api/test-node', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: nodeId })
        });
        const r = await res.json();
        if (r.ok) {
          dot.className = 'status-dot';
        } else {
          dot.className = 'status-dot offline';
        }
      } catch {
        dot.className = 'status-dot offline';
      }
    }

    // Manage Nodes Modal
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
      list.innerHTML = '';
      nodeList.forEach(n => {
        const div = document.createElement('div');
        div.style.cssText = 'background: #090a0d; border: 1px solid var(--border); border-radius: 6px; padding: 12px 16px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;';
        div.innerHTML = `
          <div>
            <div style="font-weight: 600; color: #fff; font-size: 13.5px;">${n.name} <span class="badge" style="font-size: 10px;">${n.type}</span></div>
            <div style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); margin-top: 2px;">
              IP: ${n.ip} | User: ${n.user || '-'} | Path: ${n.configDir}
            </div>
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-sm" onclick="editNodeForm('${n.id}')">${t('editBtn')}</button>
            ${n.id !== 'local' ? '<button class="btn btn-sm btn-danger" onclick="deleteNodeConfig(\'' + n.id + '\')">🗑️</button>' : ''}
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
      await fetch('/api/save-node', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      showToast(t('nodeSaved'));
      await loadNodeList();
      renderNodeManagerCards();
      document.getElementById('node-edit-card').style.display = 'none';
    }

    async function deleteNodeConfig(id) {
      if (!confirm(t('confirmDeleteNode') + id + '?')) return;
      await fetch('/api/delete-node', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      showToast(t('nodeDeleted'));
      await loadNodeList();
      renderNodeManagerCards();
    }

    // Sessions Logic
    async function loadSessionStats() {
      try {
        const res = await fetch('/api/session-stats?node=' + currentNode);
        const stats = await res.json();
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

    let currentSessionViewMode = 'tree';
    let expandedTreeNodes = new Set();

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

      // Instant local DOM toggle: zero network call, zero scroll jump!
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

    function escapeAttr(str) {
      return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    }

    async function loadSessions() {
      const ws = document.getElementById('session-workspace-filter').value;
      const tbody = document.getElementById('session-tbody');
      const prevScrollY = window.scrollY;

      try {
        const res = await fetch('/api/sessions?node=' + currentNode + '&workspace=' + encodeURIComponent(ws));
        const list = await res.json();

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

        // Restore scroll position so user never jumps
        window.scrollTo(0, prevScrollY);
      } catch (err) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--danger);">' + escapeHtml(t('loadFailed')) + err.message + '</td></tr>';
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
            <span style="font-weight: 500; color: #cbd5e1; cursor: pointer; font-size: 13px;" onclick="openDetail('${s.id}')">${escapeHtml(s.title)}</span>
            <span style="font-size: 9.5px; color: #a78bfa; background: rgba(167,139,250,0.15); padding: 1px 6px; border-radius: 4px; border: 1px solid rgba(167,139,250,0.3); margin-left: 8px;">Subagent</span>
          </div>
          <div style="padding-left: 56px; font-size: 10px; color: #64748b; font-family: var(--font-mono); margin-top: 2px;">${s.id}</div>
        `;
      } else {
        const caret = hasChildren
          ? `<span id="caret-${s.id}" onclick="toggleSubagentTree('${s.id}')" style="cursor: pointer; display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 4px; color: #38bdf8; background: rgba(56,189,248,0.15); font-size: 10px; margin-right: 8px; flex-shrink: 0;" title="${isExpanded ? t('collapseSubtasks') : t('expandSubtasks')}">${isExpanded ? '▼' : '▶'}</span>`
          : '<span style="display: inline-block; width: 20px; margin-right: 8px; flex-shrink: 0;"></span>';

        const subagentTag = hasChildren
          ? `<span onclick="toggleSubagentTree('${s.id}')" style="cursor: pointer; margin-left: 10px; font-size: 11px; padding: 2px 8px; border-radius: 12px; background: rgba(56,189,248,0.12); color: #38bdf8; border: 1px solid rgba(56,189,248,0.3); font-weight: 500;" title="點擊展開/收合子任務">🤖 ${s.children.length} Subagents ▾</span>`
          : '';

        titleHtml = `
          <div style="display: flex; align-items: center;">
            ${caret}
            <span style="font-weight: 600; color: #fff; cursor: pointer; font-size: 13.5px;" onclick="openDetail('${s.id}')">${escapeHtml(s.title)}</span>
            ${subagentTag}
          </div>
          <div style="padding-left: 28px; font-size: 10.5px; color: #64748b; font-family: var(--font-mono); margin-top: 2px;">${s.id}</div>
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
          <button class="btn btn-sm" onclick="openDetail('${s.id}')">${t('viewBtn')}</button>
          <button class="btn btn-sm" style="border-color: #f59e0b; color: #fbbf24;" onclick="openCleanModal('${s.id}', '${escapeAttr(s.title)}')">${t('cleanBtn')}</button>
          <button class="btn btn-sm btn-danger" onclick="deleteSession('${s.id}', '${escapeAttr(s.title)}', ${hasChildren ? s.children.length : 0})">${t('deleteBtn')}</button>
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
        await fetch('/api/delete-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ node: currentNode, id })
        });
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
        await fetch('/api/vacuum-db', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ node: currentNode })
        });
        showToast(t('vacuumDone'));
        await loadSessionStats();
      } catch (err) {
        alert('VACUUM 失敗: ' + err.message);
      } finally {
        showLoading(false);
      }
    }

    let cleanTargetId = null;

    const DEFAULT_CLEAN_PREFS = {
      errors: true,
      reasoning: true,
      outputs: true,
      files: true,
      steps: true,
      vacuum: false
    };

    function loadCleanPreferences() {
      try {
        const saved = localStorage.getItem('opencode_clean_prefs');
        if (saved) {
          const parsed = JSON.parse(saved);
          return { ...DEFAULT_CLEAN_PREFS, ...parsed };
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
        const res = await fetch('/api/clean-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            node: currentNode,
            id: cleanTargetId,
            options: opts.join(',')
          })
        });
        const resData = await res.json();
        if (resData.error) throw new Error(resData.error);

        if (doVacuum) {
          await fetch('/api/vacuum-db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ node: currentNode })
          });
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

    async function openDetail(id) {
      showLoading(true);
      try {
        const res = await fetch('/api/session-detail?node=' + currentNode + '&id=' + id);
        currentSessionData = await res.json();
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
            <span>${roleLabel}${modelLabel}</span>
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

    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    async function reloadAll() {
      showLoading(true);
      try {
        const res = await fetch('/api/config?node=' + currentNode);
        state = await res.json();

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

        // Render Models/Providers, Agents & MCP
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

    let currentProviderId = null;
    let currentEditingSubModels = {};
    let currentCatalogModelsCache = {};
    let currentWhitelistSet = new Set();
    let currentBlacklistSet = new Set();

    const FUZZY_MODEL_INPUT_IDS = [
      'global-primary-model',
      'global-small-model',
      'global-title-model',
      'global-compaction-model',
      'agent-model',
      'compaction-model',
      'title-model'
    ];
    let allAvailableModelsList = [];

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
            list.push({
              id: fullId,
              providerId: pid,
              providerName: pName,
              modelId: mid,
              name: (mObj && mObj.name) || mid,
              ctx: ctx,
              group: 'configured',
              searchStr: (fullId + ' ' + ((mObj && mObj.name) || '') + ' ' + pName + ' ' + ctx).toLowerCase()
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
            list.push({
              id: fullId,
              providerId: pid,
              providerName: pName,
              modelId: mid,
              name: mBrief.name || mid,
              ctx: ctx,
              group: pid === 'opencode' ? 'zen' : (pid === 'opencode-go' ? 'go' : 'connected'),
              searchStr: (fullId + ' ' + (mBrief.name || '') + ' ' + pName + ' ' + ctx).toLowerCase()
            });
          }
        }
      }

      allAvailableModelsList = list;
      return list;
    }

    function ensureFuzzyModelPicker(inputId) {
      const inp = document.getElementById(inputId);
      if (!inp) return;
      if (inp.dataset.fuzzyReady === '1') {
        updateFuzzyTriggerDisplay(inputId);
        return;
      }
      inp.dataset.fuzzyReady = '1';
      inp.style.display = 'none';

      const wrap = document.createElement('div');
      wrap.className = 'fuzzy-model-wrap';
      wrap.id = 'fuzzy-wrap-' + inputId;

      const trigger = document.createElement('div');
      trigger.className = 'fuzzy-model-trigger';
      trigger.id = 'fuzzy-trigger-' + inputId;
      trigger.onclick = (e) => {
        e.stopPropagation();
        toggleFuzzyDropdown(inputId);
      };

      const panel = document.createElement('div');
      panel.className = 'fuzzy-model-panel';
      panel.onclick = (e) => e.stopPropagation();

      const searchBar = document.createElement('div');
      searchBar.className = 'fuzzy-search-bar';
      searchBar.innerHTML = '<span style="color:var(--accent);font-size:13px;">🔍</span>' +
        '<input type="text" id="fuzzy-search-' + inputId + '" placeholder="' + escapeHtml(t('fuzzySearchPh')) + '" autocomplete="off">' +
        '<button type="button" class="btn btn-sm fuzzy-clear-btn" style="padding:3px 7px;font-size:11px;">' + escapeHtml(t('fuzzyClearBtn')) + '</button>';
      searchBar.querySelector('.fuzzy-clear-btn').onclick = () => selectFuzzyModelOption(inputId, '');

      const optionsContainer = document.createElement('div');
      optionsContainer.className = 'fuzzy-options-list';
      optionsContainer.id = 'fuzzy-list-' + inputId;

      panel.appendChild(searchBar);
      panel.appendChild(optionsContainer);
      wrap.appendChild(trigger);
      wrap.appendChild(panel);

      inp.parentNode.insertBefore(wrap, inp.nextSibling);

      const searchInp = searchBar.querySelector('input');
      searchInp.addEventListener('input', () => {
        renderFuzzyDropdownOptions(inputId, searchInp.value);
      });
      searchInp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const firstItem = optionsContainer.querySelector('.fuzzy-option-item');
          if (firstItem && firstItem.dataset.val !== undefined) {
            selectFuzzyModelOption(inputId, firstItem.dataset.val);
          } else if (searchInp.value.trim()) {
            selectFuzzyModelOption(inputId, searchInp.value.trim());
          }
        } else if (e.key === 'Escape') {
          wrap.classList.remove('open');
        }
      });

      updateFuzzyTriggerDisplay(inputId);
    }

    function updateFuzzyTriggerDisplay(inputId) {
      const inp = document.getElementById(inputId);
      const trigger = document.getElementById('fuzzy-trigger-' + inputId);
      if (!inp || !trigger) return;

      const val = (inp.value || '').trim();
      if (!val) {
        trigger.innerHTML = '<div class="fuzzy-trigger-left"><span class="fuzzy-trigger-placeholder">' + escapeHtml(t('fuzzyTriggerPh')) + '</span></div><span class="fuzzy-trigger-arrow">▼</span>';
        return;
      }

      const found = allAvailableModelsList.find(m => m.id === val);
      const subName = found ? found.name : '';
      const ctxBadge = (found && found.ctx) ? '<span class="badge" style="font-size:10px;">' + escapeHtml(found.ctx) + '</span>' : '';
      trigger.innerHTML = '<div class="fuzzy-trigger-left">' +
        '<span class="fuzzy-trigger-id">' + escapeHtml(val) + '</span>' +
        (subName && subName !== val ? '<span class="fuzzy-trigger-name">— ' + escapeHtml(subName) + '</span>' : '') +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:6px;">' + ctxBadge + '<span class="fuzzy-trigger-arrow">▼</span></div>';
    }

    function toggleFuzzyDropdown(inputId) {
      const wrap = document.getElementById('fuzzy-wrap-' + inputId);
      if (!wrap) return;
      const isOpen = wrap.classList.contains('open');
      document.querySelectorAll('.fuzzy-model-wrap.open').forEach(el => el.classList.remove('open'));
      if (!isOpen) {
        wrap.classList.add('open');
        const searchInp = document.getElementById('fuzzy-search-' + inputId);
        if (searchInp) {
          searchInp.value = '';
          renderFuzzyDropdownOptions(inputId, '');
          setTimeout(() => searchInp.focus(), 20);
        }
      }
    }

    function renderFuzzyDropdownOptions(inputId, query) {
      const container = document.getElementById('fuzzy-list-' + inputId);
      const inp = document.getElementById(inputId);
      if (!container || !inp) return;

      const currVal = (inp.value || '').trim();
      const tokens = (query || '').toLowerCase().trim().split(/\s+/).filter(Boolean);

      const matches = allAvailableModelsList.filter(item => {
        if (tokens.length === 0) return true;
        return tokens.every(tk => item.searchStr.includes(tk));
      });

      container.innerHTML = '';
      if (matches.length === 0) {
        if (query && query.trim()) {
          const customVal = query.trim();
          const customDiv = document.createElement('div');
          customDiv.className = 'fuzzy-option-item';
          customDiv.dataset.val = customVal;
          customDiv.onclick = () => selectFuzzyModelOption(inputId, customVal);
          customDiv.innerHTML = '<div class="fuzzy-opt-main"><span class="fuzzy-opt-id">' + escapeHtml(customVal) + '</span><span class="fuzzy-opt-sub">' + escapeHtml(t('fuzzyCustomApply')) + '</span></div><span class="badge">' + escapeHtml(t('fuzzyCustomBadge')) + '</span>';
          container.appendChild(customDiv);
        } else {
          container.innerHTML = '<div style="padding:14px;text-align:center;color:var(--text-muted);font-size:12px;">' + escapeHtml(t('fuzzyNoMatch')) + '</div>';
        }
        return;
      }

      const groupLabels = {
        configured: t('fuzzyGroupConfigured'),
        zen: t('fuzzyGroupZen'),
        go: t('fuzzyGroupGo'),
        connected: t('fuzzyGroupConnected')
      };

      let lastGroup = null;
      const limitCount = tokens.length > 0 ? 120 : 80;
      for (let i = 0; i < Math.min(matches.length, limitCount); i++) {
        const m = matches[i];
        if (m.group !== lastGroup) {
          lastGroup = m.group;
          const hdr = document.createElement('div');
          hdr.className = 'fuzzy-group-header';
          hdr.innerText = groupLabels[m.group] || m.group;
          container.appendChild(hdr);
        }

        const item = document.createElement('div');
        item.className = 'fuzzy-option-item' + (m.id === currVal ? ' active' : '');
        item.dataset.val = m.id;
        item.onclick = () => selectFuzzyModelOption(inputId, m.id);

        let badges = '';
        if (m.ctx) badges += '<span class="badge" style="font-size:10px;">' + escapeHtml(m.ctx) + '</span>';
        if (m.group === 'configured') badges += '<span class="badge" style="background:rgba(16,185,129,0.18);color:#10b981;font-size:10px;">' + escapeHtml(t('fuzzyBadgeConfigured')) + '</span>';
        if (m.id === currVal) badges += '<span style="color:#10b981;font-weight:700;font-size:12px;">✓</span>';

        item.innerHTML = '<div class="fuzzy-opt-main">' +
          '<span class="fuzzy-opt-id">' + escapeHtml(m.id) + '</span>' +
          '<span class="fuzzy-opt-sub">' + escapeHtml(m.name) + ' · ' + escapeHtml(m.providerName) + '</span>' +
          '</div>' +
          '<div class="fuzzy-opt-badges">' + badges + '</div>';
        container.appendChild(item);
      }
    }

    function selectFuzzyModelOption(inputId, val) {
      const inp = document.getElementById(inputId);
      if (inp) inp.value = val;
      updateFuzzyTriggerDisplay(inputId);
      const wrap = document.getElementById('fuzzy-wrap-' + inputId);
      if (wrap) wrap.classList.remove('open');
    }

    document.addEventListener('click', () => {
      document.querySelectorAll('.fuzzy-model-wrap.open').forEach(el => el.classList.remove('open'));
    });

    function populateAvailableModelsDatalist() {
      buildAvailableModelsList();
      for (const id of FUZZY_MODEL_INPUT_IDS) {
        ensureFuzzyModelPicker(id);
      }

      // Also populate catalog providers datalist
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

    function renderProviders() {
      populateAvailableModelsDatalist();
      const list = document.getElementById('provider-list');
      if (!list) return;
      list.innerHTML = '';

      const cfgProviders = (state.config && state.config.provider) || {};
      const authMap = (state.providersMeta && state.providersMeta.auth) || {};
      const catalog = (state.providersMeta && state.providersMeta.catalog) || {};

      // Merge keys from opencode.jsonc provider AND auth.json AND always highlight 'opencode' & 'opencode-go'
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
        const isInJsonc = Boolean(cfgProviders[pid]);

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
      if (document.getElementById('prov-model-toggle-search')) document.getElementById('prov-model-toggle-search').value = '';
      initProviderEnabledModelsState(wlArr, blArr);
      document.getElementById('submodel-editor').style.display = 'none';
      renderSubModelsTable();
      renderProviderWbCheckboxes();

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
      if (document.getElementById('prov-model-toggle-search')) document.getElementById('prov-model-toggle-search').value = '';
      initProviderEnabledModelsState([], []);
      document.getElementById('submodel-editor').style.display = 'none';
      renderSubModelsTable();
      renderProviderWbCheckboxes();
    }

    let currentEnabledModelsSet = new Set();

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

      // 2. Built-in active catalog models for this provider
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
      syncProviderWbInputs();
    }

    function buildCurrentProviderVisibilityMap() {
      const allModels = getProviderCandidateModels();
      const map = {};
      for (const m of allModels) {
        map[m.id] = currentEnabledModelsSet.has(m.id) ? 'show' : 'hide';
      }
      return map;
    }

    async function persistProviderVisibilityLive() {
      const pid = (document.getElementById('prov-id') && document.getElementById('prov-id').value.trim()) || currentProviderId || '';
      if (!pid) return;
      const visMap = buildCurrentProviderVisibilityMap();
      if (state.providersMeta) {
        if (!state.providersMeta.model_visibility) state.providersMeta.model_visibility = {};
        state.providersMeta.model_visibility[pid] = visMap;
      }
      populateAvailableModelsDatalist();
      try {
        await fetch('/api/save-model-visibility', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ node: currentNode, id: pid, modelVisibility: visMap })
        });
      } catch (e) {}
    }

    function syncProviderWbInputs() {
      const allModels = getProviderCandidateModels();
      const total = allModels.length;
      const enabledIds = [];
      const disabledIds = [];
      for (const m of allModels) {
        if (currentEnabledModelsSet.has(m.id)) enabledIds.push(m.id);
        else disabledIds.push(m.id);
      }

      const wlEl = document.getElementById('prov-whitelist');
      const blEl = document.getElementById('prov-blacklist');
      if (total === 0 || disabledIds.length === 0) {
        // All enabled -> no restriction
        if (wlEl) wlEl.value = '';
        if (blEl) blEl.value = '';
      } else if (enabledIds.length <= disabledIds.length) {
        // Fewer (or equal) enabled -> store as whitelist
        if (wlEl) wlEl.value = enabledIds.join(', ');
        if (blEl) blEl.value = '';
      } else {
        // Most enabled, only a few disabled -> store as blacklist
        if (wlEl) wlEl.value = '';
        if (blEl) blEl.value = disabledIds.join(', ');
      }

      const cntEl = document.getElementById('oc-toggle-provider-count');
      if (cntEl) cntEl.innerText = `${enabledIds.length} / ${total}`;

      const masterSw = document.getElementById('oc-provider-master-switch');
      if (masterSw) {
        masterSw.checked = total > 0 && enabledIds.length === total;
      }
    }

    function toggleProviderModelVisibility(mid, checked) {
      if (checked) currentEnabledModelsSet.add(mid);
      else currentEnabledModelsSet.delete(mid);
      syncProviderWbInputs();
      renderProviderWbCheckboxes();
      persistProviderVisibilityLive();
    }

    function toggleAllProviderModelsVisibility(checked) {
      const allModels = getProviderCandidateModels();
      const query = ((document.getElementById('prov-model-toggle-search') && document.getElementById('prov-model-toggle-search').value) || '').toLowerCase().trim();
      const targets = query
        ? allModels.filter(m => m.id.toLowerCase().includes(query) || (m.name && m.name.toLowerCase().includes(query)))
        : allModels;
      for (const m of targets) {
        if (checked) currentEnabledModelsSet.add(m.id);
        else currentEnabledModelsSet.delete(m.id);
      }
      syncProviderWbInputs();
      renderProviderWbCheckboxes();
      persistProviderVisibilityLive();
    }

    function renderProviderWbCheckboxes() {
      const allModels = getProviderCandidateModels();
      // Ensure any newly added sub-model is in currentEnabledModelsSet if no restriction was active
      syncProviderWbInputs();

      const pid = (document.getElementById('prov-id') && document.getElementById('prov-id').value.trim()) || currentProviderId || 'Provider';
      const catalog = (state.providersMeta && state.providersMeta.catalog) || {};
      const pTitle = document.getElementById('oc-toggle-provider-title');
      if (pTitle) {
        pTitle.innerText = (document.getElementById('prov-name') && document.getElementById('prov-name').value.trim()) || (catalog[pid] && catalog[pid].name) || pid;
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
            <button class="btn btn-sm" onclick="quickAssignGlobalModel('${escapeHtml(fullRef)}', 'primary')">${t('setAsPrimaryBtn')}</button>
            <button class="btn btn-sm" onclick="quickAssignGlobalModel('${escapeHtml(fullRef)}', 'small')">${t('setAsSmallBtn')}</button>
            <button class="btn btn-sm" onclick="openSubModelEditor('${escapeHtml(mid)}')">${t('editBtn')}</button>
            <button class="btn btn-danger btn-sm" onclick="deleteSubModel('${escapeHtml(mid)}')">🗑️</button>
          </td>
        `;
        tbody.appendChild(tr);
      }
    }

    function openSubModelEditor(mid) {
      const box = document.getElementById('submodel-editor');
      box.style.display = 'block';
      if (!mid) {
        document.getElementById('sm-id').value = '';
        document.getElementById('sm-id').disabled = false;
        document.getElementById('sm-name').value = '';
        document.getElementById('sm-context').value = '262144';
        document.getElementById('sm-input').value = '';
        document.getElementById('sm-output').value = '8192';
        document.getElementById('sm-temp').value = '';
        document.getElementById('sm-effort').value = '';
        document.getElementById('sm-attachment').value = 'true';
        document.getElementById('sm-modalities').value = 'text, image';
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
      await fetch('/api/save-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          node: currentNode,
          id: pid,
          providerConfig: pObj,
          modelVisibility: buildCurrentProviderVisibilityMap()
        })
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
      await fetch('/api/delete-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node: currentNode, id: currentProviderId })
      });
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
      await fetch('/api/save-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node: currentNode, id: pid, key: keyVal, type: 'api' })
      });
      showToast(t('authSavedMsg'));
      await reloadAll();
      selectProvider(pid);
    }

    async function saveGlobalModelAssignment() {
      showLoading(true);
      const payload = {
        node: currentNode,
        primaryModel: document.getElementById('global-primary-model').value.trim(),
        smallModel: document.getElementById('global-small-model').value.trim(),
        titleModel: document.getElementById('global-title-model').value.trim(),
        compactionModel: document.getElementById('global-compaction-model').value.trim()
      };
      await fetch('/api/save-global-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
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

    // Official Models.dev Catalog Modal Functions
    async function openCatalogForCurrentProvider() {
      const pid = document.getElementById('prov-id').value.trim() || currentProviderId || 'opencode';
      await openCatalogBrowserModal(pid);
    }

    async function openCatalogBrowserModal(defaultPid) {
      const catalog = (state.providersMeta && state.providersMeta.catalog) || {};
      const sel = document.getElementById('catalog-provider-select');
      sel.innerHTML = '';

      // Priority order: opencode (Zen), opencode-go (Go), openai, anthropic, google, deepseek, meta, openrouter, then alphabetical
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
        const res = await fetch('/api/catalog-models?node=' + currentNode + '&provider=' + encodeURIComponent(pid));
        const data = await res.json();
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
            <button class="btn btn-sm" onclick="importCatalogModelToProvider('${escapeHtml(pid)}', '${escapeHtml(mid)}')">${t('catalogImportAction')}</button>
            <button class="btn btn-primary btn-sm" onclick="setCatalogModelAsPrimary('${escapeHtml(fullRef)}')">${t('catalogSetPrimaryAction')}</button>
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

    function renderAgents() {
      const list = document.getElementById('agent-list');
      list.innerHTML = '';
      (state.agents || []).forEach(a => {
        const div = document.createElement('div');
        div.className = 'item-card' + (currentAgentId === a.id ? ' selected' : '');
        div.onclick = () => selectAgent(a.id);
        div.innerHTML = `
          <div class="item-header">
            <span class="item-name">${a.id}</span>
            <span class="badge">${a.mode}</span>
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
      document.getElementById('agent-model').value = a.model || ''; updateFuzzyTriggerDisplay('agent-model');
      document.getElementById('agent-desc').value = a.description || '';
      document.getElementById('agent-prompt').value = a.prompt || '';
      document.getElementById('btn-delete-agent').style.display = 'inline-flex';

      // Load agent tool permissions
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
      document.getElementById('agent-model').value = ''; updateFuzzyTriggerDisplay('agent-model');
      document.getElementById('agent-desc').value = '';
      document.getElementById('agent-prompt').value = '';
      document.getElementById('btn-delete-agent').style.display = 'none';

      // Reset permissions to inherit
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

      const payload = {
        node: currentNode,
        id,
        mode: document.getElementById('agent-mode').value,
        model: document.getElementById('agent-model').value.trim(),
        description: document.getElementById('agent-desc').value.replace(/\r?\n+/g, ' ').trim(),
        prompt: document.getElementById('agent-prompt').value,
        permissions: perms,
        customRules: customRules,
        pluginStates: pluginStates
      };
      await fetch('/api/save-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
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
      await fetch('/api/delete-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node: currentNode, id: currentAgentId })
      });
      showToast(t('agentDeleted'));
      document.getElementById('agent-editor').style.display = 'none';
      currentAgentId = null;
      await reloadAll();
    }

    let currentPluginFilename = null;

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

      plugins.forEach((p, idx) => {
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
      await fetch('/api/save-plugin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          node: currentNode,
          filename,
          enabled,
          scope: { mode: scopeMode, agents: scopeAgents },
          content
        })
      });
      currentPluginFilename = filename;
      showToast(t('pluginSavedMsg'));
      await reloadAll();
      selectPlugin(filename);
    }

    async function togglePluginQuick(filename, enabled) {
      showLoading(true);
      await fetch('/api/toggle-plugin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node: currentNode, filename, enabled })
      });
      showToast(filename + ' ' + (enabled ? t('pluginEnabledBadge') : t('pluginDisabledBadge')));
      await reloadAll();
      if (currentPluginFilename === filename) selectPlugin(filename);
    }

    async function movePluginOrder(filename, delta) {
      showLoading(true);
      await fetch('/api/reorder-plugin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node: currentNode, filename, delta })
      });
      await reloadAll();
    }

    async function deleteCurrentPlugin() {
      if (!currentPluginFilename) return;
      if (!confirm(t('confirmDeletePlugin') + currentPluginFilename + '?')) return;
      showLoading(true);
      await fetch('/api/delete-plugin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node: currentNode, filename: currentPluginFilename })
      });
      showToast(t('pluginDeletedMsg'));
      document.getElementById('plugin-editor').style.display = 'none';
      currentPluginFilename = null;
      await reloadAll();
    }

    function renderMcp() {
      const list = document.getElementById('mcp-list');
      list.innerHTML = '';
      const mcpMap = (state.config && state.config.mcp) || {};
      for (const [id, m] of Object.entries(mcpMap)) {
        const div = document.createElement('div');
        div.className = 'item-card' + (currentMcpId === id ? ' selected' : '');
        div.onclick = () => selectMcp(id, m);
        const cmd = Array.isArray(m.command) ? m.command.join(' ') : (m.command || '');
        div.innerHTML = `
          <div class="item-header">
            <span class="item-name">${id}</span>
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
      const args = rawArgs ? rawArgs.match(/(?:[^s"]+|"[^"]*")+/g).map(s => s.replace(/^"|"$/g, '')) : [];

      const fullCommand = [cmd, ...args];
      showLoading(true);
      const payload = {
        node: currentNode,
        id,
        type: document.getElementById('mcp-type').value,
        command: fullCommand,
        enabled: document.getElementById('mcp-enabled').value === 'true',
        timeout: parseInt(document.getElementById('mcp-timeout').value, 10) || undefined
      };

      await fetch('/api/save-mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      showToast(t('mcpSaved'));
      await reloadAll();
    }

    async function deleteCurrentMcp() {
      if (!currentMcpId) return;
      if (!confirm(t('confirmDeleteMcp') + currentMcpId + '?')) return;
      showLoading(true);
      await fetch('/api/delete-mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node: currentNode, id: currentMcpId })
      });
      showToast(t('mcpDeleted'));
      document.getElementById('mcp-editor').style.display = 'none';
      currentMcpId = null;
      await reloadAll();
    }

    function renderTools() {
      const container = document.getElementById('tools-container');
      container.innerHTML = '';
      const tools = state.tools || {};
      for (const [k, v] of Object.entries(tools)) {
        const div = document.createElement('div');
        div.style.marginBottom = '14px';
        div.innerHTML = `
          <label style="color: #38bdf8;">Tool: ${k}</label>
          <textarea class="tool-desc-input" data-tool="${k}" style="height: 75px;">${v}</textarea>
        `;
        container.appendChild(div);
      }
    }

    async function saveTools() {
      const textareas = document.querySelectorAll('.tool-desc-input');
      const updated = {};
      textareas.forEach(t => {
        updated[t.getAttribute('data-tool')] = t.value;
      });
      showLoading(true);
      await fetch('/api/save-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node: currentNode, tools: updated })
      });
      showToast(t('trimToolsSaved'));
      await reloadAll();
    }

    async function savePrompt(type) {
      let val = '';
      if (type === 'local') val = document.getElementById('prompt-local').value;
      else if (type === 'global') val = document.getElementById('prompt-global').value;
      else if (type === 'ssh') val = document.getElementById('prompt-ssh').value;

      showLoading(true);
      await fetch('/api/save-system-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node: currentNode, type, content: val })
      });
      showToast(t('promptSaved'));
      showLoading(false);
    }

    async function saveCoreAgents() {
      showLoading(true);
      const payload = {
        node: currentNode,
        compactionModel: document.getElementById('compaction-model').value.trim(),
        compactionPrompt: document.getElementById('compaction-prompt').value.trim(),
        titleModel: document.getElementById('title-model').value.trim()
      };
      await fetch('/api/save-core-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      showToast(t('coreConfigSaved'));
      await reloadAll();
    }

    async function savePermissions() {
      showLoading(true);
      const denyLines = document.getElementById('perm-deny').value.split('\n').map(s => s.trim()).filter(Boolean);
      const askLines = document.getElementById('perm-ask').value.split('\n').map(s => s.trim()).filter(Boolean);
      await fetch('/api/save-permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node: currentNode, deny: denyLines, ask: askLines })
      });
      showToast(t('permGuardSaved'));
      await reloadAll();
    }

    async function saveRawJsonc() {
      showLoading(true);
      const content = document.getElementById('raw-jsonc-content').value;
      await fetch('/api/save-raw-jsonc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node: currentNode, content })
      });
      showToast(t('rawJsonSaved'));
      await reloadAll();
    }

    // Initialize application
    async function initApp() {
      try {
        if (window.screen) {
          window.moveTo(0, 0);
          window.resizeTo(window.screen.availWidth, window.screen.availHeight);
        }
      } catch (e) {}
      applyDomI18n();
      await loadNodeList();
      await loadSessionStats();
      await loadSessions();
      await reloadAll();
      testNodeHealth(currentNode);
    }

    initApp();
