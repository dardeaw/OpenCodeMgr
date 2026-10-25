// src/services/skill-service.mjs
// OpenCode Skills Management Service (skills/*/SKILL.md)

import fs from 'node:fs';
import path from 'node:path';
import {
  getNode,
  getNodePaths,
  readNodeFile,
  writeNodeFile,
  backupNodeFile,
  runNodeCmd
} from '../core/node-transport.mjs';
import { parseSkillMarkdown, serializeSkillMarkdown } from '../core/parsers.mjs';

/**
 * List all skills configured on a node
 */
export async function listSkills(nodeId = 'local') {
  const node = getNode(nodeId);
  const paths = getNodePaths(node);
  const { sep, skillDir } = paths;

  const results = [];

  if (node.type === 'local') {
    if (!fs.existsSync(skillDir)) {
      return [];
    }
    try {
      const entries = fs.readdirSync(skillDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const sDirName = entry.name;
        const skillFile = path.join(skillDir, sDirName, 'SKILL.md');
        if (fs.existsSync(skillFile)) {
          const raw = fs.readFileSync(skillFile, 'utf-8');
          const parsed = parseSkillMarkdown(raw, sDirName);
          results.push({
            ...parsed,
            dirName: sDirName,
            fullPath: skillFile
          });
        }
      }
    } catch (err) {
      console.warn(`[skill-service] Failed to list local skills:`, err.message);
    }
  } else {
    // Remote node via find / dir
    try {
      const isWin = String(node.configDir || '').includes('\\');
      if (isWin) {
        const out = await runNodeCmd(node, `dir /s /b "${skillDir}\\SKILL.md" 2>nul || exit 0`);
        const files = out.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        for (const fullPath of files) {
          const parts = fullPath.split('\\');
          const sDirName = parts[parts.length - 2];
          const content = await readNodeFile(node, fullPath);
          const parsed = parseSkillMarkdown(content, sDirName);
          results.push({ ...parsed, dirName: sDirName, fullPath });
        }
      } else {
        const out = await runNodeCmd(node, `find "${skillDir}" -name "SKILL.md" 2>/dev/null || true`);
        const files = out.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        for (const fullPath of files) {
          const parts = fullPath.split('/');
          const sDirName = parts[parts.length - 2];
          const content = await readNodeFile(node, fullPath);
          const parsed = parseSkillMarkdown(content, sDirName);
          results.push({ ...parsed, dirName: sDirName, fullPath });
        }
      }
    } catch (err) {
      console.warn(`[skill-service] Failed to list remote skills on ${node.id}:`, err.message);
    }
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get single skill detail
 */
export async function getSkill(nodeId = 'local', skillId) {
  const skills = await listSkills(nodeId);
  return skills.find(s => s.id === skillId || s.dirName === skillId) || null;
}

/**
 * Save or update a skill (skills/<id>/SKILL.md)
 */
export async function saveSkill(nodeId = 'local', skillData = {}) {
  const node = getNode(nodeId);
  const paths = getNodePaths(node);
  const { sep, skillDir } = paths;

  const targetId = (skillData.id || skillData.name || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  if (!targetId) {
    throw new Error('Skill identifier cannot be empty');
  }

  const finalContent = serializeSkillMarkdown({
    name: skillData.name || targetId,
    description: skillData.description || '',
    content: skillData.content || ''
  });

  const targetSkillDir = `${skillDir}${sep}${targetId}`;
  const targetSkillFile = `${targetSkillDir}${sep}SKILL.md`;

  if (node.type === 'local') {
    if (!fs.existsSync(targetSkillDir)) {
      fs.mkdirSync(targetSkillDir, { recursive: true });
    }
    await writeNodeFile(node, targetSkillFile, finalContent, true);

    // If ID was renamed, remove or rename old folder
    if (skillData.oldId && skillData.oldId !== targetId) {
      const oldSkillDir = `${skillDir}${sep}${skillData.oldId}`;
      if (fs.existsSync(oldSkillDir)) {
        try { fs.rmSync(oldSkillDir, { recursive: true, force: true }); } catch {}
      }
    }
  } else {
    // Ensure remote folder exists
    await runNodeCmd(node, `mkdir -p "${targetSkillDir}"`);
    await writeNodeFile(node, targetSkillFile, finalContent, true);

    if (skillData.oldId && skillData.oldId !== targetId) {
      const oldSkillDir = `${skillDir}/${skillData.oldId}`;
      await runNodeCmd(node, `rm -rf "${oldSkillDir}"`);
    }
  }

  return { ok: true, id: targetId, name: skillData.name || targetId };
}

/**
 * Delete a skill folder
 */
export async function deleteSkill(nodeId = 'local', skillId) {
  const node = getNode(nodeId);
  const paths = getNodePaths(node);
  const { sep, skillDir } = paths;

  const cleanId = (skillId || '').trim();
  if (!cleanId) throw new Error('Skill ID required');

  const targetSkillDir = `${skillDir}${sep}${cleanId}`;
  const targetSkillFile = `${targetSkillDir}${sep}SKILL.md`;

  // Backup SKILL.md before deleting folder
  await backupNodeFile(node, targetSkillFile);

  if (node.type === 'local') {
    if (fs.existsSync(targetSkillDir)) {
      fs.rmSync(targetSkillDir, { recursive: true, force: true });
    }
  } else {
    await runNodeCmd(node, `rm -rf "${targetSkillDir}"`);
  }

  return { ok: true, deleted: cleanId };
}
