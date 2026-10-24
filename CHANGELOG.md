# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

---

## [1.0.0] - 2026-10-24

### Added
- Internationalization (i18n) Engine:
  - Added full translation sets for English, Traditional Chinese, Simplified Chinese, and Japanese.
  - Added automatic OS and browser language detection with fallback logic.
  - Added dynamic in-page language switcher with localStorage state persistence.
- Session Tree Aggregation:
  - Added parent-child hierarchy grouping connecting root sessions with their subagent executions.
  - Implemented zero-scroll DOM toggling to prevent page jumping and column misalignment.
  - Added comprehensive subagent count badge and cumulative byte calculation.
- Deep Session Pruning System:
  - Added multi-criteria database cleaning: tool errors, non-zero exit codes, aborted runs, and plugin defense rejections.
  - Added reasoning and thought-chain (<think>) stripping to reduce token and storage overhead by 40% to 60%.
  - Added large tool stdout and diff truncation (>1500 chars to 800 chars with badges).
  - Added file snapshot cleanup and empty step-marker removal.
  - Added persistent cleanup preference saving and one-click recommended preset application.
  - Integrated SQLite VACUUM optimization to recover physical disk space.
- Fleet Management:
  - Added dynamic multi-node configuration for localhost, direct Paramiko SSH, and jump-host SSH connections.
  - Added interactive node management dialog with health checking.
  - Provided nodes.example.json template while isolating real node configurations via .gitignore.
- Visual Editors:
  - Added editors for system instructions (AGENTS.local.md, SSH_WORKFLOW.md, AGENTS.md).
  - Added agent profile configuration modal (mode, description, prompt, model override).
  - Added Model Context Protocol (MCP) server manager.
  - Added tool description editor (trim-tools.js) and permission rule editor (permission.bash).
  - Added live opencode.jsonc viewer with automatic backup generation.
- Desktop Integration:
  - Packaged native application launcher (app.mjs) using Edge/Chrome App Mode.
  - Added native Win32 icon and compilation support.
