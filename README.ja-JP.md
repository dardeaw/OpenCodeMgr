# OpenCodeMgr 統合管理センター (v1.6.0)

**OpenCode (`opencode-ai`)** 向けのクロスプラットフォーム GUI ＆ MCP 管理スイート — **環境ネットワーク複製＆スナップショットバックアップ**、**モデル＆プロバイダー管理（OpenCode Zen / Go / Models.dev / カスタムエンドポイント）**、**プラグイン管理＆ロール別割り当て (`plugin/*.js`)**、**カスタムエージェント (`agent/*.md`)**、**システムプロンプト**、**MCP サーバー**、**マルチホスト SSH ノード切り替え**、および **SQLite 対話データベース最適化** を統合。

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md) | [変更履歴 (Changelog)](CHANGELOG.md)

---

## 概要

**OpenCodeMgr** は外部依存ゼロで動作する OpenCode 用の統合管理ダッシュボード（`http://127.0.0.1:5210`）および **Model Context Protocol (MCP) サーバー（`mcp-server.mjs` / `POST /mcp`）** です。

---

## 主な機能

### 1. 🧬 環境クローン・ネットワーク複製＆スナップショットバックアップ
- **ノード間ダイレクトネットワーク複製（Node-to-Node Live Clone）**：任意のホスト（ローカル `.102`、リモート Fedora `.55`、Nobara `.67` など）から、1台または複数台のターゲットホストへ設定を直接一括複製。
- **ポータブルスナップショットのエクスポート/インポート**：設定一式を `.opencode-env.json` ファイルとしてブラウザからワンクリックでエクスポート・バックアップ。ファイルアップロードからの復元にも対応。
- **クロスプラットフォーム自動パス変換**：Windows (`C:\Users\馮\...`) と Linux (`/home/dardeaw/...`) 間のパス区切り文字およびユーザーパスを自動相互変換。
- **ターゲット専用 BaseURL の保持**：ターゲットホスト固有のエンドポイント接続（ローカル SSH トンネル `127.0.0.1:18200` や Tailscale IP `100.103.82.28:18200`）を自動保持し、複製による推論遮断を防止。
- **実行前自動安全バックアップ**：上書き前にターゲットホスト上で `.bak-YYYYMMDD_HHMMSS` バックアップを自動作成。
- **10項目の詳細モジュール選択マトリクス**：プロバイダー設定、モデル可視化スイッチ、認証キー (`auth.json`)、エージェント設定、プラグイン、プラグインスコープ、システムプロンプト、MCP サーバー、ツール権限、Bash 権限を個別に選択可能。

### 2. 🧠 モデル＆プロバイダー管理（OpenCode `/models`・`/connect` 完全準拠）
- **キーワードあいまい検索コンボボックス**：メインモデル (`model`)、軽量モデル (`small_model`)、タイトル生成 (`agent.title.model`)、コンテキスト圧縮 (`agent.compaction.model`)、および各エージェントのモデル指定でリアルタイム検索＆グループ別選択が可能。
- **内蔵＆カスタムプロバイダー対応**：**OpenCode Zen (`opencode`)**、**OpenCode Go (`opencode-go`)**、ローカル推論サーバー（`gufo`、`strata`、`llama.cpp`、`vLLM`）、公式クラウド SDK を一元管理。
- **認証キー＆公式カタログ連携**：`~/.local/share/opencode/auth.json` の読み書きと、`~/.cache/opencode/models.json`（Models.dev カタログ）からのワンクリックインポートに対応。

### 3. 🧩 プラグイン管理＆ロール別（by Agent Role）割り当て
- `plugin/*.js` の有効化/無効化、`opencode.jsonc` での読み込み順序（`↑` / `↓`）変更、JS コード編集に対応。
- プラグインごとに **「🌐 全ロール共通 (`all`)」**、**「🎯 指定ロールのみ (`include`)」**、**「🚫 指定ロールを除外 (`exclude`)」** を設定可能（`plugin-scopes.json` と `plugin/_mgr_scope.js` による双方向同期）。

### 4. 🤖 エージェント管理＆ツール権限マトリクス
- `agent/*.md` の作成・編集と、エージェント別のツール権限（`edit`, `bash`, `read`, `grep`/`glob`, `task`, `websearch`/`webfetch`）およびワンクリックプリセット（読み取り専用 / フル開発）を提供。

### 5. 💬 セッションツリー集約＆ SQLite データベース整理
- サブエージェント（Subagents）のツリー表示と、エラー履歴・思考プロセス (`<think>`)・長大出力・ファイルスナップショット・ステップマーカーの選択的削除および `VACUUM` 圧縮。

### 6. 🔌 標準 MCP サーバー内蔵（Stdio ＆ HTTP 対応）
- 全 19 種類の管理ツール（`opencodemgr_*`）を MCP プロトコルで公開し、AI エージェントから直接 OpenCode 環境の管理・複製が可能。

---

## モジュール構成

```text
OpenCodeMgr/
├── app.mjs                      # デスクトップウィンドウ＆サーバー起動ランチャー
├── server.mjs                   # 軽量 HTTP サーバーエントリ (Port 5210)
├── mcp-server.mjs               # スタンドアロン Stdio MCP サーバー (JSON-RPC 2.0)
├── i18n.mjs                     # 4言語翻訳辞書モジュール (322キー: zh-TW / zh-CN / en-US / ja-JP)
├── db_helper.py                 # Python SQLite ＆ Models.dev カタログ処理エンジン
├── Launcher.cs                  # Windows 原生 .exe ランチャーソース
├── src/
│   ├── core/                    # node-transport.mjs (SSH/FS通信) & parsers.mjs (JSONC/Markdown変換)
│   ├── services/                # clone-service, node-service, provider-service, agent-plugin-service, session-service, manager-service
│   ├── api/                     # router.mjs (HTTP REST API & Streamable HTTP MCP ルーター)
│   └── mcp/                     # mcp-server.mjs (19 MCP ツール定義＆プロトコル処理)
└── public/
    ├── index.html               # フロントエンド UI 構造
    ├── styles.css               # ダークテーマスタイル
    ├── app.js                   # メイン UI コントローラー
    └── js/modules/              # env-clone.js (環境複製モーダル)
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
