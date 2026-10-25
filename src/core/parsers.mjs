// src/core/parsers.mjs
// Pure parsing, serialization, and code transformation utilities for OpenCode Manager

/**
 * Strip comments and trailing commas from JSONC while preserving // inside string literals (e.g. URLs)
 */
export function stripJsonComments(str) {
  if (!str) return '';
  return str
    .replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g) => (g ? '' : m))
    .replace(/,(\s*[\]}])/g, '$1');
}

/**
 * Safely parse JSONC content into an object
 */
export function parseJsonc(str) {
  if (!str || !str.trim()) return null;
  try {
    return JSON.parse(stripJsonComments(str));
  } catch {
    return null;
  }
}

/**
 * Parse an Agent Markdown file (agent/*.md) with YAML frontmatter
 */
export function parseAgentMarkdown(content, filename) {
  const id = filename.replace(/\.md$/, '');
  let description = '';
  let mode = 'all';
  let model = '';
  let prompt = content || '';
  const permissions = {};
  const customRules = [];

  const fmMatch = (content || '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (fmMatch) {
    const fm = fmMatch[1];
    prompt = fmMatch[2].trim();
    let inPerm = false;
    for (const rawLine of fm.split(/\r?\n/)) {
      const line = rawLine.replace(/\r$/, '');
      const trimmed = line.trim();
      if (trimmed.startsWith('description:')) {
        description = trimmed.slice(12).trim().replace(/^["']|["']$/g, '');
        inPerm = false;
      } else if (trimmed.startsWith('mode:')) {
        mode = trimmed.slice(5).trim().replace(/^["']|["']$/g, '');
        inPerm = false;
      } else if (trimmed.startsWith('model:')) {
        model = trimmed.slice(6).trim().replace(/^["']|["']$/g, '');
        inPerm = false;
      } else if (trimmed.startsWith('permission:') || trimmed.startsWith('permissions:')) {
        inPerm = true;
      } else if (inPerm) {
        if (line.startsWith(' ') || line.startsWith('\t')) {
          const parts = trimmed.split(':');
          if (parts.length >= 2) {
            const key = parts[0].trim();
            const val = parts.slice(1).join(':').trim().replace(/['"]/g, '');
            if (['edit', 'bash', 'read', 'grep', 'glob', 'task', 'websearch', 'webfetch'].includes(key)) {
              permissions[key] = val;
            } else {
              customRules.push(trimmed);
            }
          }
        } else if (trimmed) {
          inPerm = false;
        }
      }
    }
  }

  return {
    id,
    filename,
    description,
    mode,
    model,
    prompt,
    permissions,
    customRules,
    fullContent: content || ''
  };
}

/**
 * Serialize Agent configuration into Markdown with YAML frontmatter
 */
export function serializeAgentMarkdown(data) {
  let fmBlock = `description: ${data.description || ''}\nmode: ${data.mode || 'all'}`;
  if (data.model) {
    fmBlock += `\nmodel: ${data.model}`;
  }

  const perms = data.permissions || {};
  const customRules = Array.isArray(data.customRules) ? data.customRules : [];
  const permKeys = Object.keys(perms).filter(k => perms[k] && perms[k] !== 'inherit');

  if (permKeys.length > 0 || customRules.length > 0) {
    fmBlock += `\npermission:`;
    for (const k of permKeys) {
      fmBlock += `\n  ${k}: "${perms[k]}"`;
    }
    for (const cr of customRules) {
      if (cr && cr.trim()) {
        fmBlock += `\n  ${cr.trim()}`;
      }
    }
  }

  return `---\n${fmBlock}\n---\n\n${data.prompt || ''}\n`;
}

/**
 * Parse a Skill Markdown file (skills/<name>/SKILL.md) with YAML frontmatter
 */
export function parseSkillMarkdown(content, dirName = '') {
  let name = dirName;
  let description = '';
  let body = content || '';

  const fmMatch = (content || '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (fmMatch) {
    const fm = fmMatch[1];
    body = fmMatch[2].trim();
    for (const rawLine of fm.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line.startsWith('name:')) {
        name = line.slice(5).trim().replace(/^["']|["']$/g, '');
      } else if (line.startsWith('description:')) {
        description = line.slice(12).trim().replace(/^["']|["']$/g, '');
      }
    }
  }

  return {
    id: dirName || name,
    name: name || dirName,
    description,
    content: body,
    raw: content || ''
  };
}

/**
 * Serialize Skill configuration into Markdown with YAML frontmatter
 */
export function serializeSkillMarkdown(data = {}) {
  const cleanName = (data.name || data.id || '').trim();
  const cleanDesc = (data.description || '').trim();
  const cleanContent = (data.content || '').trim();

  return `---\nname: ${cleanName}\ndescription: ${cleanDesc}\n---\n\n${cleanContent}\n`;
}

/**
 * Parse tool descriptions from plugin/trim-tools.js
 */
export function parseTrimTools(content) {
  const descs = {};
  if (!content) return descs;
  const match = content.match(/const\s+DESCS\s*=\s*\{([\s\S]*?)\r?\n\};/);
  if (!match) return descs;

  const lines = match[1].split(/\r?\n/);
  let currentKey = null;
  let currentVal = '';

  for (const line of lines) {
    const keyMatch = line.match(/^\s*([a-zA-Z0-9_]+)\s*:\s*(.*)$/);
    if (keyMatch) {
      if (currentKey) descs[currentKey] = cleanToolStr(currentVal);
      currentKey = keyMatch[1];
      currentVal = keyMatch[2];
    } else if (currentKey) {
      currentVal += '\n' + line;
    }
  }
  if (currentKey) descs[currentKey] = cleanToolStr(currentVal);
  return descs;
}

function cleanToolStr(raw) {
  let s = raw.trim();
  if (s.endsWith(',')) s = s.slice(0, -1).trim();
  try {
    return Function(`"use strict"; return (${s});`)();
  } catch {
    return s.replace(/^["'`]|["'`]$/g, '');
  }
}

/**
 * Serialize updated tool descriptions back into plugin/trim-tools.js
 */
export function serializeTrimTools(originalContent, updatedDescs) {
  const entries = Object.entries(updatedDescs || {}).map(([k, v]) => {
    return `  ${k}:\n    ${JSON.stringify(String(v ?? ''))},`;
  });
  const newDescsBlock = `const DESCS = {\n${entries.join('\n\n')}\n};`;

  if (originalContent && /const\s+DESCS\s*=\s*\{[\s\S]*?\r?\n\};/.test(originalContent)) {
    return originalContent.replace(/const\s+DESCS\s*=\s*\{[\s\S]*?\r?\n\};/, newDescsBlock);
  }

  return `// Replaces verbose built-in tool descriptions with compact versions to save context.\n\n${newDescsBlock}\n\nexport default async () => ({\n  "tool.definition": async (input, output) => {\n    if (DESCS[input.toolID]) output.description = DESCS[input.toolID];\n  }\n});\n`;
}

/**
 * Runtime helper code injected into plugin/_mgr_scope.js when per-agent plugin scoping is used
 */
export const MGR_SCOPE_HELPER_CODE = `// _mgr_scope.js — OpenCodeMgr Per-Agent Plugin Scope Runtime Helper
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SESSION_AGENT = new Map();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCOPES_FILE = path.resolve(__dirname, "..", "plugin-scopes.json");

function isAgentAllowed(pluginName, agentName) {
  if (!agentName) return true;
  try {
    if (!fs.existsSync(SCOPES_FILE)) return true;
    const scopes = JSON.parse(fs.readFileSync(SCOPES_FILE, "utf-8"));
    const rule = scopes[pluginName];
    if (!rule || !rule.mode || rule.mode === "all") return true;
    const list = Array.isArray(rule.agents) ? rule.agents : [];
    if (rule.mode === "include") return list.includes(agentName);
    if (rule.mode === "exclude") return !list.includes(agentName);
  } catch {}
  return true;
}

export function __mgrWithAgentScope(pluginName, pluginFactory) {
  return async (ctx) => {
    const hooks = (await pluginFactory(ctx)) || {};
    const wrapped = { ...hooks };

    const origChatParams = hooks["chat.params"];
    wrapped["chat.params"] = async (input, output) => {
      if (input && input.sessionID && input.agent) {
        SESSION_AGENT.set(input.sessionID, input.agent);
      }
      if (origChatParams && isAgentAllowed(pluginName, input && input.agent)) {
        return await origChatParams(input, output);
      }
    };

    const origEvent = hooks["event"];
    wrapped["event"] = async (arg) => {
      const ev = arg && arg.event;
      const info = ev && ev.properties && ev.properties.info;
      if (info && info.sessionID && info.agent) {
        SESSION_AGENT.set(info.sessionID, info.agent);
      }
      const sid = (info && info.sessionID) || (ev && ev.properties && ev.properties.sessionID);
      const agent = (info && info.agent) || (sid && SESSION_AGENT.get(sid));
      if (origEvent && isAgentAllowed(pluginName, agent)) {
        return await origEvent(arg);
      }
    };

    for (const hk of ["tool.execute.before", "tool.execute.after", "chat.message", "tool.definition"]) {
      if (typeof hooks[hk] === "function") {
        const orig = hooks[hk];
        wrapped[hk] = async (input, output) => {
          const sid = input && (input.sessionID || input.session_id || input.sessionId);
          const agent = (input && input.agent) || (sid && SESSION_AGENT.get(sid));
          if (!isAgentAllowed(pluginName, agent)) return;
          return await orig(input, output);
        };
      }
    }
    return wrapped;
  };
}
`;

/**
 * Strip the __mgrWithAgentScope wrapper from a plugin file to show clean source code in the UI
 */
export function stripMgrScopeWrapper(code) {
  if (!code) return '';
  let c = code.replace(/^import\s+\{\s*__mgrWithAgentScope\s*\}\s+from\s+["']\.\/_mgr_scope\.js["'];?\s*\/\/\s*@opencode-mgr-scope\r?\n/m, '');
  c = c.replace(/export\s+default\s+__mgrWithAgentScope\(\s*["'][^"']+["']\s*,\s*/, 'export default ');
  c = c.replace(/\)\s*;?\s*\/\/\s*@opencode-mgr-scope-end\s*$/, ';\n');
  return c;
}

/**
 * Apply __mgrWithAgentScope wrapper to a plugin file if its scope is restricted to specific agents
 */
export function applyMgrScopeWrapper(cleanCode, filename, scope) {
  const clean = stripMgrScopeWrapper(cleanCode);
  if (!scope || !scope.mode || scope.mode === 'all' || !Array.isArray(scope.agents) || scope.agents.length === 0) {
    return clean;
  }
  if (!/export\s+default\s+/.test(clean)) {
    return clean;
  }
  const header = `import { __mgrWithAgentScope } from "./_mgr_scope.js"; // @opencode-mgr-scope\n`;
  let body = clean.replace(/export\s+default\s+/, `export default __mgrWithAgentScope(${JSON.stringify(filename)}, `);
  body = body.replace(/;\s*$/, '') + `\n); // @opencode-mgr-scope-end\n`;
  return header + body;
}

/**
 * Extract a concise human-readable description from the top comments or BANNER constant of a plugin .js file
 */
export function extractPluginSummary(cleanCode, filename) {
  if (!cleanCode) return '';
  const lines = cleanCode.split(/\r?\n/);
  const comments = [];
  for (const line of lines.slice(0, 12)) {
    const t = line.trim();
    if (t.startsWith('//')) {
      const txt = t.replace(/^\/\/\s*/, '').trim();
      if (txt) comments.push(txt);
    } else if (comments.length > 0) {
      break;
    }
  }
  if (comments.length > 0) {
    return comments.slice(0, 2).join(' ');
  }
  const bannerMatch = cleanCode.match(/const\s+BANNER\s*=\s*["']([^"']+)["']/);
  if (bannerMatch) return bannerMatch[1];
  return filename;
}
