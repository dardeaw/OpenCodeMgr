# OpenCodeMgr 統合管理センター (v1.7.0)

**OpenCode (`opencode-ai`)** 専用のクロスプラットフォームデスクトップ GUI & MCP 管理ツールスイート — **専門スキル管理 (`skills/*/SKILL.md`)**、**環境のネットワーク複製とスナップショットバックアップ**、**モデル＆プロバイダー管理（OpenCode Zen / Go / Models.dev / カスタム推論エンドポイント）**、**ロール別プラグイン割り当て (`plugin/*.js`)**、**カスタムエージェント (`agent/*.md`)**、**システムプロンプト**、**MCP サーバー**、**複数ホスト SSH 切り替え**、および **SQLite 対話データベースの最適化・スリム化** をサポート。

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md) | [更新履歴 (Changelog)](CHANGELOG.md)

---

## 概要

**OpenCodeMgr** は、外部依存関係なしで動作する高信頼な OpenCode ビジュアルコントロールセンター兼 **MCP サーバー (`mcp-server.mjs`)** です。`opencode.jsonc` の手動編集、複数ホスト間の環境移行、スキルの作成・管理、ロールごとのプラグイン振り分け、肥大化した SQLite データベース (`opencode.db`) による動作遅延などの課題を解決します。

---

## 主な機能

### 1. ⚡ 専門スキル管理（`skills/*/SKILL.md`、agentskills.io 標準互換）
- **ネイティブ OpenCode スキル対応**：`<configDir>/skills/<id>/SKILL.md` のディレクトリ構成に対応。YAML フロントマター（`name`、`description`）と Markdown 実行手順をフルサポート。
- **固定ヘッダーカードリストとリアルタイム検索**：スキル ID、表示名、説明文によるリアルタイムキーワード検索で目的のスキルを即座に絞り込み。
- **縦型フルハイト Markdown 編集エリア**：等幅フォント（monospace）と独立した縦スクロール領域を備え、安全な保存・自動バックアップ・ワンクリック削除に対応。
- **実践的なサンプルスキルを標準搭載**：
  - `git-release`：SemVer バージョン自動インクリメント、CHANGELOG 更新、Git Commit/Tag、Push リリース手順。
  - `code-refactor`：単一責任の原則（SRP）、クリーンなレイヤードアーキテクチャ、構文検査とクリーンアップ手順。
  - `sqlite-optimizer`：SQLite WAL チェックポイント切り捨て（`PRAGMA wal_checkpoint(TRUNCATE)`）、セッション履歴削減、データベース `VACUUM`。
- **4 つの専用 Skill MCP ツール**：外部 AI エージェントから各ホストのスキルを自動的に取得、作成、更新、削除可能。

### 2. 🧬 環境複製・ネットワーククローン・スナップショットバックアップ
- **ノード間ダイレクトネットワーククローン (Node-to-Node Live Clone)**：任意の送信元ノード（ローカル `.102`、リモート Fedora `.55`、Nobara `.67` など）から、ローカルネットワーク内の複数ホストへ直接環境設定を複製。
- **ポータブルスナップショットのエクスポートと復元 (Snapshot Export / Import)**：設定一式を `.opencode-env.json` ファイルとしてワンクリック保存・ダウンロード。JSON 検証とプレビュー機能を備えた復元に対応。
- **スマートクロスプラットフォームパス変換 (Smart Path Translation)**：Windows (`C:\Users\馮\.config\opencode\...`) と Linux (`/home/dardeaw/.config/opencode/...`) のディレクトリ形式およびスラッシュ記号を自動識別・変換。
- **ターゲット固有 BaseURL の保護 (Target BaseURL Preservation)**：ターゲットホスト既存のプロバイダー接続先（ローカル SSH トンネル `127.0.0.1:18200` や Tailscale IP `100.103.82.28:18200`）を保護し、複製後の推論切断を防止。
- **実行前自動安全バックアップ (Auto-Backup)**：適用前にターゲットホストで `.bak-YYYYMMDD_HHMMSS` 形式のバックアップを自動生成。
- **12 項目の詳細選択マトリックス（スキルおよび SQLite DB を含む）**：プロバイダー設定、モデル表示トグル、認証キー (`auth.json`)、エージェント設定 (`agent/*.md`)、**スキルライブラリ (`skills/*/SKILL.md`)**、プラグイン (`plugin/*.js`)、プラグイン適用スコープ、プロンプト、MCP サーバー、ツール権限、Bash 権限、および **SQLite セッションデータベース (`opencode.db`)** を自由に選択して複製可能。

### 3. 🧠 モデル＆プロバイダー管理（OpenCode `/models`・`/connect` 準拠）
- **ファジー検索対応コンボボックス (Fuzzy-Search Combobox)**：主要対話モデル (`model`)、軽量モデル (`small_model`)、タイトル生成 (`agent.title.model`)、要約モデル (`agent.compaction.model`) の指定において、リアルタイムキーワード検索とカテゴリ別グループ表示を提供。
- **公式・カスタムプロバイダー統合**：**OpenCode Zen (`opencode`)**、**OpenCode Go (`opencode-go`)**、独自推論サーバー（`gufo`、`strata`、`halogen`、`lemonade`、`vLLM`、`llama.cpp`）および公式クラウド SDK にネイティブ対応。
- **認証キーの一元管理**：`~/.local/share/opencode/auth.json`（`/connect` 相当）および `opencode.jsonc` 内の `options.baseURL` / `options.apiKey` を直接管理。
- **Models.dev 公式カタログインポート**：`~/.cache/opencode/models.json` の数百種類のモデル仕様（コンテキスト長、出力制限、推論モード、無料枠表示）を閲覧し、ワンクリックで設定可能。

### 4. 🧩 プラグイン管理とロール別 (by Agent Role) 割り当て
- **プラグイン読み込み順序と有効化制御**：`plugin/*.js` スクリプトを自動検出し、有効/無効の切り替え、読み込み順序（`↑` / `↓`）の調整、JS コードの編集が可能。
- **ロール別適用範囲の指定 (Per-Agent Plugin Scoping)**：プラグインごとに **「🌐 全ロール共通 (`all`)」**、**「🎯 指定ロールのみ有効 (`include`)」**、**「🚫 指定ロールを除外 (`exclude`)」** を設定可能。
- **双方向同期と非破壊的 Runtime ラッパー**：「🧩 プラグイン管理」と「🤖 ロール管理」の間で即座に双方向同期され、`plugin-scopes.json` と非侵入型ラッパー `plugin/_mgr_scope.js` を自動生成。

### 5. 🤖 ロール管理と専用ツール権限マトリックス
- `agent/*.md` のプロファイル（実行モード `all` / `subagent` / `primary`、専用モデル指定、概要説明、システムプロンプト）を視覚的に管理。
- ツール権限（`edit`、`bash`、`read`、`grep`/`glob`、`task`、`websearch`/`webfetch`）とカスタムルールを設定可能。「⚡ 読み取り専用プリセット」および「⚡ フル開発権限プリセット」を搭載。

### 6. 💬 セッションツリー表示と SQLite の詳細スリム化
- **サブエージェント対話のツリー集約**：サブタスクを親対話の配下に階層構造で表示し、容量とトークン消費量を一目で確認可能。
- **高度なセッションスリム化**：失敗したツール呼び出し、`<think>` 思考ログ、長大な出力結果（1500 文字超過）、一時ファイルスナップショットを安全に削除。ワンクリック `VACUUM` で `opencode.db` のディスク容量を 40%〜60% 削減。

### 7. 🌐 マルチホストノード管理と 4 言語完全対応 (i18n)
- **ローカル**、**ダイレクト SSH ホスト**、**ジャンプホスト (Jump-Host) 経由** の各ノードを瞬時に切り替え可能。
- **100% 完全な 4 言語ローカライズ（340+ キー）**：繁体字中国語 (`zh-TW`)、簡体字中国語 (`zh-CN`)、英語 (`en-US`)、日本語 (`ja-JP`) の動的切り替えに対応。

### 8. 🔌 内蔵 MCP サーバー (Stdio & HTTP)
- **23 種類の MCP ツール (`opencodemgr_*`)** と動的リソース（`opencodemgr://nodes`、`opencodemgr://config/{node}`）を提供し、外部 AI エージェントや自動化システムと連携可能。

---

## モジュール設計

```text
OpenCodeMgr/
├── app.mjs                      # デスクトップアプリ＆サーバー起動スクリプト (--server-only 対応)
├── server.mjs                   # 軽量 HTTP サーバーエントリ (Port 5210)
├── mcp-server.mjs               # 独立 Stdio MCP サーバーエントリ (JSON-RPC 2.0)
├── i18n.mjs                     # 4言語ローカライズ辞書 (340+ キー: zh-TW, zh-CN, en-US, ja-JP)
├── db_helper.py                 # クロスプラットフォーム Python SQLite＆カタログエンジン
├── Launcher.cs                  # ネイティブ Windows .exe 起動元コード (最大化 Edge/Chrome アプリモード)
├── src/
│   ├── core/
│   │   ├── node-transport.mjs   # ローカル FS、Paramiko SSH、ジャンプ転送、安全バックアップ層
│   │   └── parsers.mjs          # JSONC、エージェント/スキル Frontmatter、プラグインラッパー解析
│   ├── services/
│   │   ├── clone-service.mjs    # 環境エクスポート、インポート、クロスプラットフォーム変換、クローン
│   │   ├── skill-service.mjs    # スキル CRUD、検証、ディレクトリ管理
│   │   ├── node-service.mjs     # マルチホスト管理、SSH コマンド実行、ヘルスチェック
│   │   ├── provider-service.mjs # プロバイダー、モデルカタログ、デスクトップ表示同期
│   │   ├── agent-plugin-service.mjs # エージェント設定、プラグインスコープ、システムプロンプト
│   │   ├── session-service.mjs  # SQLite セッションツリー集約、スリム化、最適化
│   │   ├── shared-config.mjs    # 共通ホストファイルシステム＆パス解決
│   │   └── manager-service.mjs  # 統合ビジネスロジックファサード (REST API & MCP)
│   ├── api/
│   │   └── router.mjs           # HTTP REST API (/api/*)、Streamable MCP (/mcp)、静的ルーター
│   └── mcp/
│       └── mcp-server.mjs       # MCP ツール定義 (23ツール)、リソースハンドラー、Stdio
└── public/
    ├── index.html               # ダッシュボード HTML 構造＆モーダル
    ├── styles.css               # ダークテーマスタイル＆分割レイアウト
    ├── app.js                   # フロントエンドメインコントローラー
    └── js/
        ├── core.js              # 状態管理、i18n DOM エンジン、共通 API クライアント
        ├── components/
        │   └── fuzzy-combobox.js# ファジー検索コンボボックスコンポーネント
        └── modules/
            ├── sessions.js      # 対話ツリー、詳細表示、データベースメンテナンス
            ├── providers.js     # プロバイダー、サブモデル、公式カタログブラウザー
            ├── agents-plugins.js# エージェント、ロール別プラグイン、MCP、プロンプト
            ├── skills.js        # スキルカードグリッド＆Markdown エディター
            └── env-clone.js     # 環境クローン、エクスポート、インポートモーダル
```

---

## クイックスタート

### 前提条件
- **Node.js** `>= 18.0.0`
- **Python** `>= 3.8`

### 1. リポジトリのクローンとホスト設定
```bash
git clone https://github.com/dardeaw/OpenCodeMgr.git
cd OpenCodeMgr
cp nodes.example.json nodes.json
```

### 2. 管理センターの起動
```bash
# サーバーとネイティブアプリウィンドウを起動
npm start

# バックグラウンド HTTP サーバーのみ起動 (http://127.0.0.1:5210)
npm run server
```
Windows の場合、**`OpenCode Manager.exe`** を直接ダブルクリックして起動することもできます。

### 3. OpenCode の MCP サーバーとして登録 (`opencode.jsonc`)
```json
{
  "mcp": {
    "opencodemgr": {
      "type": "local",
      "command": ["node", "/path/to/OpenCodeMgr/mcp-server.mjs"],
      "enabled": true,
      "timeout": 60000
    }
  }
}
```

---

## ライセンス

MIT License。詳細は [LICENSE](LICENSE) を参照してください。
