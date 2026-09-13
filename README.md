# Tutor

家庭教師向けの課題提出・添削システムです。現在はローカル開発基盤まで実装しています。

## 構成

- `frontend`: React、TypeScript、Vite
- `backend`: Go API
- `postgres`: Docker Composeで起動するPostgreSQL

外部サービスや本番環境の設定は含みません。以前の実装は
[`backup/before-redesign-2026-09-12`](https://github.com/HikaruSuna/teacher_app/tree/backup/before-redesign-2026-09-12)
ブランチに保存しています。

## 必要なもの

- Node.js 24以降
- Go 1.26以降
- Docker Desktop

## 初回セットアップ

```bash
make setup
make db-up
make migrate
```

## 起動

ターミナルを2つ開いて、それぞれ実行します。

```bash
make api
```

```bash
make web
```

- 画面: http://localhost:5173
- API: http://localhost:8080/api/health

画面にログインフォームが表示されれば、フロントエンドとGo APIの疎通は正常です。

## 確認

```bash
make check
```

フロントエンドのテスト・型・静的チェックとビルド、Goのテストを実行します。

## 開発用設定

ローカル用の初期値が設定されているため、通常は環境変数を追加せず起動できます。変更する場合は各ディレクトリの `.env.example` を参照してください。

開発用PostgreSQLのデータはDocker Volumeに保存されます。`make db-down` でコンテナを停止してもデータは残ります。

## 現在の実装範囲

- フロントエンドとGo APIの起動
- PostgreSQLへの接続
- マイグレーション実行基盤
- ヘルスチェックAPI
- ログイン、ログイン利用者取得、ログアウトのAPI
- Argon2idによるパスワード照合とDBセッション
- 先生・生徒を選択できるログイン画面
- ログイン状態の復元、仮ホーム画面、ログアウト
- リクエストID、JSONログ、CORS、タイムアウト、安全な終了処理

開発用アカウントはまだ登録していないため、ログインを試すには先にユーザーの作成が必要です。招待、課題提出、採点は未実装です。
