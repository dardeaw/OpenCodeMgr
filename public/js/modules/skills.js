// public/js/modules/skills.js
// OpenCode Skills Management Module (skills/*/SKILL.md)

let skillsSearchQuery = '';

function onSkillsSearchInput(val) {
  skillsSearchQuery = (val || '').trim().toLowerCase();
  renderSkills();
}

function renderSkills() {
  const list = document.getElementById('skills-list');
  if (!list) return;
  list.innerHTML = '';

  const allSkills = state.skills || [];
  const filtered = allSkills.filter(s => {
    if (!skillsSearchQuery) return true;
    const nameMatch = (s.name || '').toLowerCase().includes(skillsSearchQuery);
    const idMatch = (s.id || '').toLowerCase().includes(skillsSearchQuery);
    const descMatch = (s.description || '').toLowerCase().includes(skillsSearchQuery);
    return nameMatch || idMatch || descMatch;
  });

  if (filtered.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.style.cssText = 'grid-column: 1 / -1; padding: 32px 16px; text-align: center; color: var(--text-muted); font-size: 13px; background: #0c0d12; border: 1px dashed var(--border); border-radius: 8px;';
    emptyDiv.innerText = t('noSkillsFound');
    list.appendChild(emptyDiv);
    return;
  }

  filtered.forEach(s => {
    const isSelected = currentSkillId === s.id;
    const div = document.createElement('div');
    div.className = 'item-card' + (isSelected ? ' selected' : '');
    div.onclick = () => selectSkill(s.id);
    div.innerHTML = `
      <div class="item-header">
        <span class="item-name">⚡ ${escapeHtml(s.name || s.id)}</span>
        <span class="badge" style="background: rgba(168,85,247,0.15); color: #c084fc; border: 1px solid rgba(168,85,247,0.3);">${escapeHtml(s.id)}</span>
      </div>
      <div class="item-desc" style="line-height: 1.45; font-size: 12px; color: var(--text-muted);">${escapeHtml(s.description || t('noDesc'))}</div>
      <div class="item-footer" style="margin-top: 8px; font-size: 11px; color: #64748b; font-family: var(--font-mono);">
        <span>SKILL.md</span>
      </div>
    `;
    list.appendChild(div);
  });
}

function selectSkill(id) {
  currentSkillId = id;
  renderSkills();

  const skill = (state.skills || []).find(s => s.id === id);
  const editor = document.getElementById('skill-editor');
  if (!editor) return;

  if (!skill) {
    editor.style.display = 'none';
    return;
  }

  editor.style.display = 'flex';
  document.getElementById('skill-editor-title').innerText = t('editSkillTitle') + ' : ' + (skill.name || skill.id);
  
  const idInput = document.getElementById('skill-id');
  idInput.value = skill.id || '';
  idInput.disabled = true;

  document.getElementById('skill-name').value = skill.name || '';
  document.getElementById('skill-desc').value = skill.description || '';
  document.getElementById('skill-content').value = skill.content || '';

  const delBtn = document.getElementById('btn-delete-skill');
  if (delBtn) delBtn.style.display = 'inline-flex';
}

function createNewSkill() {
  currentSkillId = null;
  renderSkills();

  const editor = document.getElementById('skill-editor');
  if (!editor) return;

  editor.style.display = 'flex';
  document.getElementById('skill-editor-title').innerText = t('addSkillBtn');

  const idInput = document.getElementById('skill-id');
  idInput.value = '';
  idInput.disabled = false;
  idInput.focus();

  document.getElementById('skill-name').value = '';
  document.getElementById('skill-desc').value = '';
  document.getElementById('skill-content').value = `# Instructions\n\n## Overview\nDescribe what this skill accomplishes and step-by-step procedures.\n\n## Workflow\n1. Analyze requirements\n2. Execute necessary actions\n3. Verify outcomes\n`;

  const delBtn = document.getElementById('btn-delete-skill');
  if (delBtn) delBtn.style.display = 'none';
}

async function saveCurrentSkill() {
  const idInput = document.getElementById('skill-id');
  const id = (idInput.value || '').trim();
  if (!id) {
    alert(t('skillIdPh'));
    idInput.focus();
    return;
  }

  const name = document.getElementById('skill-name').value.trim();
  const description = document.getElementById('skill-desc').value.trim();
  const content = document.getElementById('skill-content').value;

  showLoading(true);
  try {
    const res = await apiPost('/api/save-skill', {
      node: currentNode,
      id,
      name,
      description,
      content
    });

    if (res.error) {
      throw new Error(res.error);
    }

    currentSkillId = res.id || id;
    showToast(t('skillSavedMsg', { name: res.name || id }));
    await reloadAll();
    selectSkill(currentSkillId);
  } catch (err) {
    alert(t('loadFailedPrefix') + err.message);
  } finally {
    showLoading(false);
  }
}

async function deleteCurrentSkill() {
  if (!currentSkillId) return;

  const skill = (state.skills || []).find(s => s.id === currentSkillId);
  const displayName = (skill && skill.name) ? skill.name : currentSkillId;

  if (!confirm(t('confirmDeleteSkill', { name: displayName }))) {
    return;
  }

  showLoading(true);
  try {
    const res = await apiPost('/api/delete-skill', {
      node: currentNode,
      id: currentSkillId
    });

    if (res.error) {
      throw new Error(res.error);
    }

    showToast(t('skillDeletedMsg', { name: displayName }));
    currentSkillId = null;
    await reloadAll();
  } catch (err) {
    alert(t('loadFailedPrefix') + err.message);
  } finally {
    showLoading(false);
  }
}
