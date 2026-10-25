// public/js/components/fuzzy-combobox.js
// Shared Reusable Fuzzy-Search Combobox Component
// Used by Global Model Pickers (provider/model) and Sub-Model Spec ID Picker (sm-id)

const FUZZY_COMBOBOX_REGISTRY = new Map();

/**
 * Mount or refresh a searchable Fuzzy Combobox on a target <input> element
 * @param {string} inputId - DOM id of the underlying <input>
 * @param {object} config - Configuration callbacks:
 *   - getItems(): Array<{ id, name, subText, ctx, group, badgeText, badgeStyle, searchStr }>
 *   - getGroupLabels(): Record<string, string>
 *   - getSearchPlaceholder(): string
 *   - getTriggerPlaceholder(): string
 *   - onSelect(val): void (optional extra callback after setting value)
 */
function mountFuzzyCombobox(inputId, config) {
  const inp = document.getElementById(inputId);
  if (!inp) return;

  FUZZY_COMBOBOX_REGISTRY.set(inputId, config);

  if (inp.dataset.fuzzyReady === '1') {
    refreshFuzzyComboboxTrigger(inputId);
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
    toggleFuzzyComboboxDropdown(inputId);
  };

  const panel = document.createElement('div');
  panel.className = 'fuzzy-model-panel';
  panel.onclick = (e) => e.stopPropagation();

  const searchBar = document.createElement('div');
  searchBar.className = 'fuzzy-search-bar';
  const searchPh = (config.getSearchPlaceholder && config.getSearchPlaceholder()) || t('fuzzySearchPh');
  searchBar.innerHTML =
    '<span style="color:var(--accent);font-size:13px;">🔍</span>' +
    '<input type="text" id="fuzzy-search-' + inputId + '" placeholder="' + escapeHtml(searchPh) + '" autocomplete="off">' +
    '<button type="button" class="btn btn-sm fuzzy-clear-btn" style="padding:3px 7px;font-size:11px;">' + escapeHtml(t('fuzzyClearBtn')) + '</button>';
  searchBar.querySelector('.fuzzy-clear-btn').onclick = () => selectFuzzyComboboxOption(inputId, '');

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
    renderFuzzyComboboxOptions(inputId, searchInp.value);
  });
  searchInp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const firstItem = optionsContainer.querySelector('.fuzzy-option-item');
      if (firstItem && firstItem.dataset.val !== undefined) {
        selectFuzzyComboboxOption(inputId, firstItem.dataset.val);
      } else if (searchInp.value.trim()) {
        selectFuzzyComboboxOption(inputId, searchInp.value.trim());
      }
    } else if (e.key === 'Escape') {
      wrap.classList.remove('open');
    }
  });

  refreshFuzzyComboboxTrigger(inputId);
}

function toggleFuzzyComboboxDropdown(inputId) {
  const wrap = document.getElementById('fuzzy-wrap-' + inputId);
  if (!wrap) return;
  const isOpen = wrap.classList.contains('open');
  document.querySelectorAll('.fuzzy-model-wrap.open').forEach(el => el.classList.remove('open'));
  if (!isOpen) {
    wrap.classList.add('open');
    const searchInp = document.getElementById('fuzzy-search-' + inputId);
    if (searchInp) {
      searchInp.value = '';
      renderFuzzyComboboxOptions(inputId, '');
      setTimeout(() => searchInp.focus(), 20);
    }
  }
}

function refreshFuzzyComboboxTrigger(inputId) {
  const inp = document.getElementById(inputId);
  const trigger = document.getElementById('fuzzy-trigger-' + inputId);
  if (!inp || !trigger) return;

  const config = FUZZY_COMBOBOX_REGISTRY.get(inputId) || {};
  const val = (inp.value || '').trim();
  if (!val) {
    const ph = (config.getTriggerPlaceholder && config.getTriggerPlaceholder()) || t('fuzzyTriggerPh');
    trigger.innerHTML =
      '<div class="fuzzy-trigger-left"><span class="fuzzy-trigger-placeholder">' + escapeHtml(ph) + '</span></div>' +
      '<span class="fuzzy-trigger-arrow">▼</span>';
    return;
  }

  const items = (config.getItems && config.getItems()) || [];
  const found = items.find(m => m.id === val);
  const subName = found ? found.name : '';
  const ctxBadge = (found && found.ctx) ? '<span class="badge" style="font-size:10px;">' + escapeHtml(found.ctx) + '</span>' : '';
  trigger.innerHTML =
    '<div class="fuzzy-trigger-left">' +
      '<span class="fuzzy-trigger-id">' + escapeHtml(val) + '</span>' +
      (subName && subName !== val ? '<span class="fuzzy-trigger-name">— ' + escapeHtml(subName) + '</span>' : '') +
    '</div>' +
    '<div style="display:flex;align-items:center;gap:6px;">' + ctxBadge + '<span class="fuzzy-trigger-arrow">▼</span></div>';
}

function renderFuzzyComboboxOptions(inputId, query) {
  const container = document.getElementById('fuzzy-list-' + inputId);
  const inp = document.getElementById(inputId);
  if (!container || !inp) return;

  const config = FUZZY_COMBOBOX_REGISTRY.get(inputId) || {};
  const items = (config.getItems && config.getItems()) || [];
  const groupLabels = (config.getGroupLabels && config.getGroupLabels()) || {};

  const currVal = (inp.value || '').trim();
  const trimmedQuery = (query || '').trim();
  const tokens = trimmedQuery.toLowerCase().split(/\s+/).filter(Boolean);

  const matches = items.filter(item => {
    if (tokens.length === 0) return true;
    return tokens.every(tk => (item.searchStr || '').includes(tk));
  });

  container.innerHTML = '';

  // Offer direct custom ID option if query doesn't exactly match an item ID
  if (trimmedQuery && !items.some(c => c.id === trimmedQuery)) {
    const customDiv = document.createElement('div');
    customDiv.className = 'fuzzy-option-item';
    customDiv.dataset.val = trimmedQuery;
    customDiv.onclick = () => selectFuzzyComboboxOption(inputId, trimmedQuery);
    customDiv.innerHTML =
      '<div class="fuzzy-opt-main">' +
        '<span class="fuzzy-opt-id">' + escapeHtml(trimmedQuery) + '</span>' +
        '<span class="fuzzy-opt-sub">' + escapeHtml(t('fuzzyCustomApply')) + '</span>' +
      '</div>' +
      '<span class="badge">' + escapeHtml(t('fuzzyCustomBadge')) + '</span>';
    container.appendChild(customDiv);
  }

  if (matches.length === 0 && !trimmedQuery) {
    container.innerHTML = '<div style="padding:14px;text-align:center;color:var(--text-muted);font-size:12px;">' + escapeHtml(t('fuzzyNoMatch')) + '</div>';
    return;
  }

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
    item.onclick = () => selectFuzzyComboboxOption(inputId, m.id);

    let badges = '';
    if (m.ctx) badges += '<span class="badge" style="font-size:10px;">' + escapeHtml(m.ctx) + '</span>';
    if (m.badgeText) {
      badges += '<span class="badge" style="' + (m.badgeStyle || 'font-size:10px;') + '">' + escapeHtml(m.badgeText) + '</span>';
    }
    if (m.id === currVal) badges += '<span style="color:#10b981;font-weight:700;font-size:12px;">✓</span>';

    const subText = m.subText !== undefined ? m.subText : (m.name && m.name !== m.id ? m.name : '');
    item.innerHTML =
      '<div class="fuzzy-opt-main">' +
        '<span class="fuzzy-opt-id">' + escapeHtml(m.id) + '</span>' +
        (subText ? '<span class="fuzzy-opt-sub">' + escapeHtml(subText) + '</span>' : '') +
      '</div>' +
      '<div class="fuzzy-opt-badges">' + badges + '</div>';
    container.appendChild(item);
  }
}

function selectFuzzyComboboxOption(inputId, val) {
  const inp = document.getElementById(inputId);
  if (inp) inp.value = val;
  const wrap = document.getElementById('fuzzy-wrap-' + inputId);
  if (wrap) wrap.classList.remove('open');

  const config = FUZZY_COMBOBOX_REGISTRY.get(inputId) || {};
  if (typeof config.onSelect === 'function') {
    config.onSelect(val);
  }
  refreshFuzzyComboboxTrigger(inputId);
}

function refreshAllFuzzyComboboxes() {
  for (const [inputId, config] of FUZZY_COMBOBOX_REGISTRY.entries()) {
    const searchInp = document.getElementById('fuzzy-search-' + inputId);
    if (searchInp) {
      searchInp.placeholder = (config.getSearchPlaceholder && config.getSearchPlaceholder()) || t('fuzzySearchPh');
    }
    const clearBtn = document.querySelector('#fuzzy-wrap-' + inputId + ' .fuzzy-clear-btn');
    if (clearBtn) clearBtn.innerText = t('fuzzyClearBtn');
    refreshFuzzyComboboxTrigger(inputId);
  }
}

// Backward-compatible aliases used across modules
function updateFuzzyTriggerDisplay(inputId) {
  refreshFuzzyComboboxTrigger(inputId);
}

document.addEventListener('click', () => {
  document.querySelectorAll('.fuzzy-model-wrap.open').forEach(el => el.classList.remove('open'));
});
