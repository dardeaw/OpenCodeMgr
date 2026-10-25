# OpenCodeMgr 統合管理センター (v1.8.0)

> **OpenCode (`opencode-ai`)** 専用のクロスプラットフォームデスクトップ GUI & MCP 総合管理スイート — **専門スキル管理 (`skills/*/SKILL.md`)**、**複数ホスト環境のネットワーククローン＆スナップショットバックアップ**、**モデル＆プロバイダーの視覚的設定**、**ロール別プラグイン振り分け (`plugin/*.js`)**、**カスタムエージェント (`agent/*.md`)**、**23 種類の内蔵 MCP ツール**、および **SQLite セッションデータベースの高度なスリム化** に完全対応。

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md) | [更新履歴 (Changelog)](CHANGELOG.md)

---

## なぜ OpenCodeMgr が必要なのか？

OpenCode は現在最も強力なターミナル AI プログラミングアシスタントの 1 つですが、日常的な開発や複数マシンの運用が進むにつれ、開発者は以下の課題に直面します：

1. **スキルの管理・保守が困難**：OpenCode は `agentskills.io` 規格に準拠した `skills/*/SKILL.md` に対応していますが、手動でターミナルからディレクトリを掘って編集する必要があり、視覚的な一覧表示や検証、マシン間同期機能がありません。
2. **複数ホスト間の設定複製が煩雑**：ローカルで作成したモデル設定、認証キー、カスタムエージェント、スキル、プラグインをリモートの Linux GPU サーバーへコピーする際、パス（Windows のバックスラッシュ vs Linux のスラッシュ）やエンドポイントの接続先（Localhost vs リモート IP）による不整合が頻発します。
3. **対話データベース (`opencode.db`) の急速な肥大化**：繰り返されるデバッグログ、長大なツール出力、思考ログ（`<think>`）、差分スナップショットにより、SQLite データベースが数ギガバイトに達し、OpenCode の起動遅延を招きます。
4. **`opencode.jsonc` の手動編集による構文エラー**：カンマや括弧が 1 つ欠けるだけで、全体の構成解析が失敗します。

**OpenCodeMgr** は、外部依存なしで動作する直感的なダークテーマ GUI ダッシュボード (`http://127.0.0.1:5210`) と、完全な **MCP サーバー** を提供し、これらの課題をワンストップで解決します。

---

## 主要機能の解説

### 1. ⚡ 専門スキル管理（`skills/*/SKILL.md`、agentskills.io 規格準拠）

OpenCode は [agentskills.io](https://agentskills.io) 規格に準拠したスキルシステムを採用しています。OpenCodeMgr は最も直感的で視覚的なスキル管理ワークスペースを提供します：

```text
~/.config/opencode/skills/
├── git-release/
│   └── SKILL.md            # YAML フロントマター (name, description) + 詳細な実行手順
├── code-refactor/
│   └── SKILL.md
└── sqlite-optimizer/
    └── SKILL.md
```

- **OpenCode スキルの仕組み**：
  OpenCode の起動時、`skills/*/SKILL.md` が自動スキャンされ、YAML Frontmatter の `name` と `description`（起動契機）がモデルのコンテキストに登録されます。対話内容がトリガーに合致すると、AI は自動的に `SKILL.md` 全文を読み込み、指定された手順を確実に実行します。
- **標準的な SKILL.md 記述例**：
  ```markdown
  ---
  name: git-release
  description: SemVer バージョンの自動インクリメント、CHANGELOG 更新、Git Commit/Tag、Push リリース手順
  ---

  # Git Release Workflow
  ユーザーから新バージョンのリリースが要求された場合、以下の手順を厳格に実行すること：
  1. git status による作業ツリーの確認および構文チェックの通過
  2. 変更内容に基づく SemVer の判定（Patch / Minor / Major）
  3. CHANGELOG.md への新規リリースセクション追記
  4. git add、git commit、git tag の実行
  5. リモートリポジトリへのコードおよびタグのプッシュ
  ```
- **視覚的な 2 ペイン編集インターフェース**：
  - **固定ヘッダーカードリスト**：スキル ID、表示名、説明文によるリアルタイムキーワード検索で、目的のスキルを即座に特定。
  - **フルハイト縦型 Markdown 編集領域**：等幅フォント（monospace）と独立した縦スクロールバーを備え、長大な SOP 手順書を快適に編集可能。
  - **安全保護機能**：編集や削除を行う前に、自動的に `.bak` バックアップファイルを生成し、誤削除を防止。
- **3 つの実践的なサンプルスキルを標準搭載**：
  1. `git-release`：標準的なリリース手順、CHANGELOG 更新、Git Tag 発行フロー。
  2. `code-refactor`：単一責任の原則（SRP）、レイヤー分離、構文チェック、一時ファイルゼロ原則。
  3. `sqlite-optimizer`：SQLite WAL 切り捨て、対話履歴削減、ディスク VACUUM 最適化。
- **4 つの専用 Skill MCP ツール**：
  AI エージェント自身が `opencodemgr_list_skills`、`opencodemgr_get_skill`、`opencodemgr_save_skill`、`opencodemgr_delete_skill` を呼び出し、スキルの自律管理と更新を実施可能。

---

### 2. 🧬 環境複製・ネットワーククローン・スナップショットバックアップ

- **ノード間ダイレクトネットワーククローン (Node-to-Node Live Clone)**：
  現在操作中のマシン（Windows など）の OpenCode 環境を、LAN 内の 1 台または複数台のリモートホストへ直接複製。順次実行と進捗状況をリアルタイムに表示。
- **ポータブルスナップショット (Export & Import)**：
  環境全体を `.opencode-env.json` ファイル 1 つにパッケージングしてダウンロード保存。別マシンへの移行時もファイルアップロードだけで完全復元。
- **スマートクロスプラットフォームパス変換 (Smart Path Translation)**：
  Windows パス（`C:\Users\馮\.config\opencode\...`）と Linux パス（`/home/dardeaw/.config/opencode/...`）を自動相互変換し、スラッシュの向きやディレクトリ構造を最適化。
- **ターゲット固有 BaseURL の保護**：
  復元時にターゲット固有のエンドポイント（ローカル SSH トンネル `127.0.0.1:18200` vs Tailscale IP `100.103.82.28:18200`）を保護し、複製後の推論切断を防止。
- **12 項目の詳細選択マトリックス**：
  プロバイダー設定、モデル表示トグル、認証キー (`auth.json`)、エージェント設定 (`agent/*.md`)、**スキルライブラリ (`skills/*/SKILL.md`)**、プラグイン (`plugin/*.js`)、適用スコープ、プロンプト、MCP 設定、ツール権限、Bash 権限、および **SQLite セッションデータベース (`opencode.db`)**（WAL 自動チェックポイント＋Gzip 圧縮）を個別に選択可能。

---

### 3. 🧠 モデル＆プロバイダー管理（`/models`・`/connect` 準拠）

- **グローバルアクティブモデル設定**：
  主要対話モデル (`model`)、軽量モデル (`small_model`)、タイトル生成 (`agent.title.model`)、要約モデル (`agent.compaction.model`) を視覚的に設定。全項目で**ファジー検索対応コンボボックス**が利用可能。
- **OpenCode Zen リアルタイム同期**：
  OpenCode Zen 公式オンラインモデル一覧と照合し、非推奨モデルを自動除外。現在推奨されているモデルのみを正確に表示。
- **Models.dev 公式カタログインポート**：
  公式モデルデータベース（40 以上のプロバイダー、数百種類のモデル）を検索し、コンテキスト上限、モダリティ、推論強度をワンクリックで反映。
- **カスタムローカル推論サーバー**：
  `@ai-sdk/openai-compatible` と完全な互換性を持ち、`llama.cpp`、`vLLM`、`gufo`、`strata`、`lemonade` などのローカルモデルを快適に統合。

---

### 4. 🧩 プラグイン管理とロール別 (by Agent Role) 割り当て

- **動的有効化と順序調整**：プラグインの即時有効/無効化、読み込み順序の調整（`↑` / `↓`）、JS ソースコードの編集に対応。
- **ロール別適用範囲の柔軟な制御**：
  - `all`：全エージェント共通で実行。
  - `include`：選択した特定エージェントでのみ実行（非選択エージェントは自動スキップ）。
  - `exclude`：選択した特定エージェントを除外（選択されたエージェントでは実行されない）。
- **非侵入型 Runtime ラッパー**：`plugin/_mgr_scope.js` を OpenCodeMgr が自動生成・管理するため、元のプラグインコードを変更する必要はありません。

---

### 5. 🤖 カスタムエージェント (`agent/*.md`)

- `agent/*.md`（実行モード `all` / `subagent` / `primary`、専用モデル指定、概要説明、システムプロンプト）の視覚的編集を完全サポート。
- **6 大ツール権限マトリックス**：`edit`、`bash`、`read`、`grep`/`glob`、`task`、`websearch`/`webfetch` の権限をロールごとに設定可能。「⚡ 読み取り専用プリセット」および「⚡ フル開発権限プリセット」を搭載。

---

### 6. 💬 セッションツリー表示と SQLite 詳細スリム化

- **サブエージェント対話の階層ツリー集約**：派生したサブタスクを親対話の配下に階層構造で折りたたみ表示し、全体の Token および容量を算出。
- **高度なスリム化クリーンアップ (Pruning)**：
  - 中断・失敗したツール実行結果の削除
  - 長大すぎるツール出力の切り詰め（1500 文字超過など）
  - `<think>` 思考ログの除去
  - 編集時の一時スナップショットの消去
  - ワンクリック `VACUUM` で、`opencode.db` のディスク容量を **40%〜60%** 削減可能。

---

### 7. 🔌 23 種類の内蔵 MCP ツール一覧

OpenCodeMgr は JSON-RPC 2.0 準拠の MCP サーバーを内蔵しており（Stdio および HTTP `POST /mcp` 対応）、すべての機能を AI エージェントから呼び出し可能です：

| カテゴリ | MCP ツール名 | 説明 |
|---|---|---|
| **ホストノード** | `opencodemgr_list_nodes` | 管理対象ホストの一覧取得（ローカル、SSH、ジャンプ） |
| | `opencodemgr_test_node` | 対象ホストの接続性と応答速度をテスト |
| | `opencodemgr_get_config` | 対象ホストの完全な設定スナップショットを取得 |
| **セッション管理** | `opencodemgr_session_stats` | SQLite DB 容量、WAL、メッセージ件数の統計取得 |
| | `opencodemgr_list_sessions` | ワークスペースごとに対話一覧を取得 |
| | `opencodemgr_get_session_detail`| 特定対話の全メッセージおよび履歴詳細を取得 |
| | `opencodemgr_clean_session` | 特定対話の不要ログ・長大出力をスリム化 |
| | `opencodemgr_delete_session` | 特定対話およびサブタスク履歴を削除 |
| **モデル＆プロバイダー**| `opencodemgr_list_providers` | 設定済みプロバイダーおよび配下モデルの一覧取得 |
| | `opencodemgr_set_global_models`| 主要モデル、軽量モデル、命名/要約モデルを設定 |
| | `opencodemgr_save_provider` | プロバイダー設定および認証キーを作成・更新 |
| **エージェント** | `opencodemgr_list_agents` | カスタムエージェントおよびツール権限の一覧取得 |
| | `opencodemgr_save_agent` | カスタムエージェント設定を作成・更新 |
| **専門スキル** | `opencodemgr_list_skills` | **`skills/*/SKILL.md` のスキル一覧を取得** |
| | `opencodemgr_get_skill` | **スキルのフロントマターおよび手順書全文を取得** |
| | `opencodemgr_save_skill` | **専門スキルを作成・更新（自動ディレクトリ生成とバックアップ）** |
| | `opencodemgr_delete_skill` | **指定したスキルを削除（自動バックアップ付き）** |
| **プラグイン** | `opencodemgr_list_plugins` | プラグイン一覧、実行順序、ロール別スコープを取得 |
| | `opencodemgr_configure_plugin`| プラグインの有効化/無効化、スコープ変更、コード編集 |
| **MCP 管理** | `opencodemgr_manage_mcp` | MCP サーバー設定の追加、更新、削除 |
| **環境同期** | `opencodemgr_export_env` | ポータブルな環境スナップショット一式をエクスポート |
| | `opencodemgr_import_env` | スナップショットをターゲットホストへ適用（自動変換対応） |
| | `opencodemgr_clone_env` | ネットワーク経由で複数ホストへ直接環境を複製 |

---

## モジュール構成

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
`nodes.json` を開き、対象となるローカルおよびリモートホストの情報を設定してください。

### 2. 管理センターの起動
```bash
# サーバー起動と同時にアプリウィンドウを最大化表示
npm start

# バックグラウンド HTTP サーバーのみ起動 (http://127.0.0.1:5210)
npm run server
```
Windows の場合、**`OpenCode Manager.exe`** を直接ダブルクリックして起動することもできます。

### 3. OpenCode の MCP サーバーとして登録
`~/.config/opencode/opencode.jsonc` に以下を追加してください：
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

本プロジェクトは [MIT License](LICENSE) の下で公開されています。不具合報告やプルリクエストを心よりお待ちしております！
