# セットアップ手順（先生⇄生徒 宿題レビューアプリ）

コード実装は完了しています。動かすには Supabase 側で以下3つの設定が必要です。

## 1. データベース（テーブル・RLS・関数）

Supabase ダッシュボード → SQL Editor で
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) の中身を貼り付けて実行してください。

作成されるもの:
- テーブル: `profiles` / `invites` / `submissions` / `reviews`
- RLS ポリシー（先生は自分の生徒の提出物のみ閲覧可）
- 関数: `join_teacher(token)`（生徒の参加）、`get_invite_info(token)`（先生名の表示）
- 新規ユーザー自動プロフィール作成トリガー（既定 role=`teacher`）
- Storage バケット `task-submissions` とアクセスポリシー

## 2. Google ログインの有効化

Supabase ダッシュボード → Authentication → Providers → Google を有効化し、
Google Cloud Console で発行した OAuth クライアント ID / シークレットを設定。

- Google Cloud の「承認済みリダイレクト URI」に Supabase が表示する
  `https://<プロジェクト>.supabase.co/auth/v1/callback` を追加。

## 3. リダイレクト URL の許可

Authentication → URL Configuration → Redirect URLs に、開発用と本番用を追加:
- `http://localhost:5173/**`
- 本番ドメイン `https://your-app.com/**`

---

## 動作確認の流れ

1. `npm run dev` で起動、`http://localhost:5173/` を開く
2. Googleでログイン → 自分は **先生** になり、先生ダッシュボードが表示される
3. 「招待リンクを作成してコピー」→ 別ブラウザ（またはシークレット）でそのリンクを開く
4. 別の Google アカウントでログイン → **生徒** として登録され、生徒ダッシュボードへ
5. 生徒が宿題を提出 → 先生ダッシュボードの「未レビュー」に出る
6. 先生が「承認」or「直し」で返却 → 生徒側に結果が表示される

## 役割の考え方（MVP）

- 招待リンク経由でログインした人 = **生徒**（`join_teacher` で先生に紐付け）
- それ以外で直接ログインした人 = **先生**
- 先生は自分の生徒の提出物だけ RLS で閲覧可能（他の先生の生徒は見えない）
