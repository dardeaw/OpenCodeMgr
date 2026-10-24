# OpenCodeMgr 統合管理センター (v1.4.0)

**OpenCode (`opencode-ai`)** 向けのクロスプラットフォーム GUI ＆ MCP 管理スイート — **モデル＆プロバイダー管理（OpenCode Zen / Go / Models.dev / カスタムエンドポイント）**、**プラグイン管理＆ロール別割り当て (`plugin/*.js`)**、**カスタムエージェント (`agent/*.md`)**、**システムプロンプト**、**MCP サーバー**、**マルチホスト SSH ノード切り替え**、および **SQLite 対話データベース最適化** を統合。

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md)

---

## 概要

**OpenCodeMgr** は外部依存ゼロで動作する OpenCode 用の統合管理ダッシュボード（`http://127.0.0.1:5210`）および **Model Context Protocol (MCP) サーバー（`mcp-server.mjs` / `POST /mcp`）** です。

---

## 主な機能

### 1. 🧠 モデル＆プロバイダー管理（OpenCode `/models`・`/connect` 完全準拠）
- **キーワードあいまい検索コンボボックス**：メインモデル (`model`)、軽量モデル (`small_model`)、タイトル生成 (`agent.title.model`)、コンテキスト圧縮 (`agent.compaction.model`)、および各エージェントのモデル指定でリアルタイム検索＆グループ別選択が可能。
- **内蔵＆カスタムプロバイダー対応**：**OpenCode Zen (`opencode`)**、**OpenCode Go (`opencode-go`)**、ローカル推論サーバー（`gufo`、`strata`、`llama.cpp`、`vLLM`）、公式クラウド SDK を一元管理。
- **認証キー＆公式カタログ連携**：`~/.local/share/opencode/auth.json` の読み書きと、`~/.cache/opencode/models.json`（Models.dev カタログ）からのワンクリックインポートに対応。

### 2. 🧩 プラグイン管理＆ロール別（by Agent Role）割り当て
- `plugin/*.js` の有効化/無効化、`opencode.jsonc` での読み込み順序（`↑` / `↓`）変更、JS コード編集に対応。
- プラグインごとに **「🌐 全ロール共通 (`all`)」**、**「🎯 指定ロールのみ (`include`)」**、**「🚫 指定ロールを除外 (`exclude`)」** を設定可能（`plugin-scopes.json` と `plugin/_mgr_scope.js` による双方向同期）。

### 3. 🤖 エージェント管理＆ツール権限マトリクス
- `agent/*.md` の作成・編集と、エージェント別のツール権限（`edit`, `bash`, `read`, `grep`/`glob`, `task`, `websearch`/`webfetch`）およびワンクリックプリセット（読み取り専用 / フル開発）を提供。

### 4. 💬 セッションツリー集約＆ SQLite データベース整理
- サブエージェント（Subagents）のツリー表示と、エラー履歴・思考プロセス (`<think>`)・長大出力・ファイルスナップショット・ステップマーカーの選択的削除および `VACUUM` 圧縮。

### 5. 🔌 標準 MCP サーバー内蔵（Stdio ＆ HTTP 対応）
- 全 16 種類の管理ツール（`opencodemgr_*`）を MCP プロトコルで公開し、AI エージェントから直接 OpenCode 環境を管理可能。

---

## モジュール構成

```text
OpenCodeMgr/
├── app.mjs                      # デスクトップウィンドウ＆サーバー起動ランチャー
├── server.mjs                   # 軽量 HTTP サーバーエントリ (Port 5210)
├── mcp-server.mjs               # スタンドアロン Stdio MCP サーバー (JSON-RPC 2.0)
├── i18n.mjs                     # 4言語翻訳辞書モジュール (322キー: zh-TW / zh-CN / en-US / ja-JP)
├── db_helper.py                 # Python SQLite ＆ Models.dev カタログ処理エンジン
├── src/
│   ├── core/                    # node-transport.mjs (SSH/FS通信) & parsers.mjs (JSONC/Markdown/Scope変換)
│   ├── services/                # manager-service.mjs (REST API・MCP 共通ビジネスロジック)
│   ├── api/                     # router.mjs (HTTP REST API & Streamable HTTP MCP ルーター)
│   └── mcp/                     # mcp-server.mjs (16 MCP ツール定義＆プロトコル処理)
└── public/                      # index.html / styles.css / app.js (フロントエンド静的アセット)
```

---

## クイックスタート

```bash
# サーバーとデスクトップアプリウィンドウを起動
npm start

# HTTP サーバーのみ起動 (http://127.0.0.1:5210)
npm run server

# Stdio MCP サーバーを起動
npm run mcp
```

---

## ライセンス

MIT License. 詳細は [LICENSE](LICENSE) を参照してください。
