# pocketbase-cms

[PocketBase](https://pocketbase.io) の上で動く、クライアントがサイトの中身を更新するための管理画面です。
コレクションのスキーマを実行時に読み込んで一覧と編集の画面を作るので、サイトごとに管理画面のコードを書く必要がなく、小さな設定ファイルだけで済みます。

[English README](README.md)

> [!IMPORTANT]
> 非公式のプロジェクトです。PocketBase とは関係がなく、PocketBase の承認も受けていません。

> [!WARNING]
> 開発の初期段階です。まだ使える状態ではなく、編集の画面を作っているところです。

## 仕組み（予定）

- CMS は静的な SPA です。PocketBase の `pb_public/cms/` にコピーし、`https://<PocketBase のドメイン>/cms/` で開きます。
- 編集者は、PocketBase の `users` のうち `role = "editor"` のアカウントでログインします。実際のアクセス制御は PocketBase の API ルールが担います。
- 入力欄はコレクションのスキーマから作ります。アプリの隣に置く `cms.config.json` では、表示名・並び順・一覧の列などの見せ方だけを指定します。
- 小さな PocketBase のフック（JavaScript の `pb_hooks` または Go のパッケージ）が、編集者へのスキーマの公開、保存時のリッチテキストの無害化、内容が変わったときのサイトへの通知を担います。

## 設定ファイル

CMS は自分と同じフォルダの `config.json` を読み込みます。サイトの `cms.config.json` を `pb_public/cms/config.json` にコピーしてください。
このファイルは誰でもダウンロードできるので、秘密の情報は書かないでください。

書式は [`schema/cms.config.schema.json`](schema/cms.config.schema.json) の JSON Schema で決まっています。
`$schema` にこのファイルを指定すると、エディタで補完と検査が効きます。

```json
{
	"$schema": "https://raw.githubusercontent.com/kamodigi/pocketbase-cms/main/schema/cms.config.schema.json",
	"version": 1,
	"collections": {
		"news": { "label": { "en": "News", "ja": "お知らせ" }, "titleField": "title" }
	}
}
```

ファイルが無いときや書式が正しくないときは、CMS は画面の代わりにエラーを表示します。
PocketBase のスキーマに無いコレクションや項目を設定に書いた場合は、画面の上部に警告を出し、その設定を無視します（画面が `GET /api/cms/schema` からスキーマを読むようになってから有効になります）。

## PocketBase のフック

JavaScript のフックは [`hooks/pb_hooks/`](hooks/pb_hooks) にあります。使うファイルを、読み込む `pbcms/` フォルダと一緒に、自分の PocketBase の `pb_hooks/` にコピーします。

| ファイル                 | 役割                                                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `pbcms_sanitize.pb.js`   | PocketBase を通して保存するときに、`editor` 型の項目の HTML を無害化する。CMS・API・ダッシュボード・`app.save()` のどれでも効く              |
| `pbcms_media_urls.pb.js` | API の応答で、`editor` 型の項目をもう一度無害化し、`<img data-media-id="…">` の画像を、その `media` レコードの今のファイルに向ける           |
| `pbcms_schema.pb.js`     | `GET /api/cms/schema` を追加し、ログイン済みの編集者に、CMS が扱うコレクションの定義を返す                                                   |
| `pbcms_preview.pb.js`    | 編集者に期限付きのプレビュー用トークンを発行し、`GET /api/cms/preview/{collection}/{id}` を追加する。サイトはこのトークンで下書きを1件読める |
| `pbcms_notify.pb.js`     | CMS が扱うコレクションのレコードの作成・更新・削除を、サイトに POST で知らせる                                                               |

サニタイズでは、CMS のエディタが書き出すタグと属性（段落、見出し、リスト、リンク、画像、表、文字の揃えと色）だけを残し、script、イベントハンドラ、`javascript:` の URL などはすべて取り除きます。200,000 文字を超えるリッチテキストは保存できません。

CMS は本文中の画像を `<img src="…" data-media-id="<media のレコードの id>" width="…" height="…">` の形で保存します。保存した HTML はそれだけで表示できます。メディアのフックは応答の `src` だけを書き換えるので、media のファイルを差し替えたり PocketBase のドメインを変えたりしても、本文の画像の URL が古いまま残りません。プリセットと同じく、`file` 項目を持つ `media` コレクションが必要です。media のレコードが削除されているか、リクエストした人が閲覧できない画像は、応答で `src` を取り除きます。これは本文中の URL を隠すだけです。ファイルを本当に非公開にするには、`file` 項目を protected にしてください。protected でないファイルは、URL を知っていれば誰でも取得できます。

ファイルの URL の先頭には環境変数 `PBCMS_PUBLIC_URL`（例：`https://pb.example.com`）を使い、設定が無ければ PocketBase の設定の Application URL を使います。`X-Forwarded-Host` などのリクエストヘッダーは、クライアントが偽れるので使いません。

`GET /api/cms/schema` に答えるのは `role = "editor"` の `users` のレコードだけです。トークンが無ければ 401、それ以外のアカウントは 403 になります（superuser も 403 です。superuser は PocketBase の `/api/collections` を使えます）。返すのは `{ "collections": [{ "id", "name", "type", "fields" }] }` で、設定の `collections` に書いたコレクションと `media.collection` を、その順に並べます。項目は PocketBase の定義そのままで、hidden の項目は除きます。ルール・インデックス・認証の設定は含めません。PocketBase に無い名前と、`_superusers` などのシステムのコレクションは飛ばします。フックは設定を、リクエストのたびに `pb_data` の隣の `pb_public/cms/config.json` から読むので、設定を入れ替えればすぐに反映されます。公開フォルダを別の場所に置いている場合（`--publicDir`）は、環境変数 `PBCMS_CONFIG_PATH` にそのファイルのパスを指定してください。設定を読めないときは 500 を返します。

プレビューのフックを使うと、サイトに編集者のトークンを渡さずに下書きを見せられます。編集者が `POST /api/cms/preview/{collection}/{id}/token` を呼ぶと `{ "token", "expiresAt" }` が返ります。トークンはそのレコード1件だけに使え、10分で切れます（変えるには環境変数 `PBCMS_PREVIEW_TOKEN_DURATION` に秒数を指定します）。ログインしていなければ 401、編集者以外は 403、CMS が扱わないコレクション（`GET /api/cms/schema` と同じもの）や無いレコードは 404 になります。サイトは `GET /api/cms/preview/{collection}/{id}` を `Authorization: Bearer <token>` を付けて呼ぶと、コレクションの閲覧ルールにかかわらず、下書きを含めて PocketBase のレコードの API と同じ形でレコードを受け取ります。応答には `Cache-Control: no-store` が付きます。トークンが無い・正しくない・期限切れなら 401、別のレコードのトークンなら 403、レコードが消されていれば 404 です。トークンは編集者自身のトークンキーで署名するので、編集者のパスワードが変わったり、編集者の役割が外れたりすると、すぐに使えなくなります。PocketBase の認証トークンではなく、その代わりにもなりません。

データベースに HTML が入る経路は、PocketBase を通した保存だけではありません。フックを入れる前に保存したレコード、バックアップからの復元、生の SQL、サニタイズのあとで値を書き換える別のフックは、保存時の無害化を通りません。そのため、メディアのフックは応答でもすべての `editor` 型の項目を無害化します。`media` を使わない場合も、両方のフックを入れてください。

### サイトへの通知

`pbcms_notify.pb.js` を使うと、内容が変わったときにサイトでページを作り直したり再検証したりできます。PocketBase の環境変数を2つとも設定してください。`PBCMS_NOTIFY_URL` が無ければ、フックは何もしません。

| 環境変数              | 値                                                                   |
| --------------------- | -------------------------------------------------------------------- |
| `PBCMS_NOTIFY_URL`    | 通知の送り先。例：`https://www.example.com/api/revalidate`           |
| `PBCMS_NOTIFY_SECRET` | サイト側で確かめる長いランダムな文字列。設定が無ければ何も送りません |

対象は `GET /api/cms/schema` と同じコレクション（設定の `collections` と `media.collection`。システムのコレクションは含みません）で、CMS・API・ダッシュボード・`app.save()` のどれで変えても通知します。変更1件につき `POST` を1回送り、`X-Pbcms-Secret` ヘッダーに秘密の文字列を入れ、本文は次の JSON です。

```json
{
	"collection": "posts",
	"action": "update",
	"old": { "id": "abc123def456ghi", "slug": "old-slug", "draft": false, "…": "…" },
	"new": { "id": "abc123def456ghi", "slug": "new-slug", "draft": false, "…": "…" }
}
```

`action` は `create`・`update`・`delete` のどれかです。`old` と `new` は変更前と変更後の保存されたレコードで、作成では `old` が、削除では `new` が `null` になります。中身は API が返す項目で、hidden の項目、メールアドレスを非公開にしている認証レコードのメールアドレス、expand したリレーションは含みません。コレクションの API ルールにかかわらず、下書きも通知します。リッチテキストは API の応答ではなく保存されたままの値です（上のメディアのフックを参照）。通知は何が変わったかを知るために使い、表示する内容は API から読んでください。

受け口では、ヘッダーの値を秘密の文字列と定数時間で比べ、2xx のステータスを返してください。送り先にはリダイレクトされない最終の URL を指定してください（リダイレクトされると本文が届かないことがあります）。PocketBase は変更を確定したあとに通知を1件ずつ送り、応答を最大10秒待つので、受け口が遅いと保存も遅くなります。通知に失敗しても、保存は取り消されず、エラーにもなりません。PocketBase のログ（ダッシュボードの Logs）に `pbcms: could not notify the site` として残り、再送はしません。

### Go パッケージ

Go で組み立てた PocketBase では、JavaScript のフックの代わりに `pbcms` パッケージを使います。PocketBase の v0.41 からのモジュールのパス `ganigeorgiev.com/pocketbase/pocketbase` に合わせてあります。

```sh
go get github.com/kamodigi/pocketbase-cms/pbcms
```

```go
app := pocketbase.New()
pbcms.Register(app)
```

`pbcms.Register` は `GET /api/cms/schema` を追加し、`pbcms_notify.pb.js` と同じようにサイトへ通知します。応答・権限の判定・`PBCMS_CONFIG_PATH` の扱いは `pbcms_schema.pb.js` と、送る内容と `PBCMS_NOTIFY_URL`・`PBCMS_NOTIFY_SECRET` の扱いは `pbcms_notify.pb.js` と同じなので、これらのフックは一緒に入れないでください。ほかのフックはまだパッケージにありません。それまでは、[`tests/gopocketbase/main.go`](tests/gopocketbase/main.go) と同じように PocketBase の `jsvm` プラグインを登録し、`pbcms_sanitize.pb.js`・`pbcms_media_urls.pb.js`・`pbcms_preview.pb.js` を、それらが読み込む `pbcms/` フォルダと一緒に `pb_hooks/` に置いてください。

## 開発

必要なもの：Node.js 22 以上と pnpm。Go パッケージには Go 1.27 以上が必要です。

```sh
pnpm install
pnpm dev      # 開発サーバー http://localhost:5173/cms/
pnpm check    # 型チェック
pnpm lint     # prettier と eslint
pnpm test     # ユニットテスト
pnpm build    # build/ に静的ファイルを書き出す
go vet ./... && go test ./...   # Go パッケージ
```

### 統合テストと E2E

どちらも本物の PocketBase に対して動きます。`compose.yaml` のバージョンの公式バイナリ（初回に [PocketBase のリリース](https://ganigeorgiev.com/pocketbase/pocketbase/releases)から `node_modules/.cache/pocketbase/` にダウンロードし、リリースのチェックサムで確かめる）を、例のプリセットと開発用のアカウントつきで、使い捨てのデータディレクトリで起動します。終わるとデータは消えます。Docker は不要です。

```sh
pnpm test:integration                  # API ルールとフック（tests/integration/）
pnpm exec playwright install chromium  # 最初の E2E の前に一度だけ
pnpm build && pnpm test:e2e            # pb_public/cms/ に置いたビルド済みの CMS（tests/e2e/）
```

`PBCMS_POCKETBASE=go` を付けると、同じテストを、公式バイナリの代わりに `tests/gopocketbase/` の Go で組み立てた PocketBase（`pbcms` パッケージ入り。Go が必要）に対して動かします。パッケージが置き換える JavaScript のフックは入れません。CI では両方を動かします。

```sh
PBCMS_POCKETBASE=go pnpm test:integration
```

E2E の PocketBase はポート 8091 で動きます。別のポートにするときは `E2E_PORT` を設定します。

本物の PocketBase で試すときは、`build/` を `pb_public/cms/` にコピーして `pocketbase serve` を実行します。

画面の文言は `messages/en.json` と `messages/ja.json` にあります（[Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs)）。`src/paraglide/` のコンパイル結果は `pnpm install`、`pnpm dev`、`pnpm build` で生成されます。表示言語は、ユーザーの選択、ブラウザの言語設定、英語の順で決まります。

## 開発用の PocketBase で試す

`compose.yaml` は、公式バイナリの PocketBase（v0.42.3。正式に対応するのは最新のマイナーバージョンだけ。`go.mod` も同じバージョン）を、`examples/` のプリセットつきで起動します。Docker Compose が必要です。

```sh
docker compose up -d --build   # PocketBase: http://localhost:8090
pnpm install
pnpm dev                       # CMS: http://localhost:5173/cms/
```

CMS には `editor@example.com` / `password1234` でログインします。PocketBase のダッシュボード <http://localhost:8090/_/> には `admin@example.com` / `password1234` で入れます。これらのアカウントは `dev/pb_migrations/` が作るもので、ローカルの開発専用です。開発用の PocketBase では `hooks/pb_hooks/` のフックも動きます。

`pnpm dev` は `/api` と `/cms/config.json` を PocketBase に中継します（別のアドレスを使うときは `POCKETBASE_URL` を設定します）。データは Docker のボリュームに入り、`docker compose down -v` で消えます。次の `up` でプリセットから作り直されます。マイグレーションはコンテナの起動時にコピーされるので、編集したら `docker compose restart` してください。

### プリセット

`examples/lantern-coffee/` は、架空のコーヒー焙煎所のサイトです。各プリセットのディレクトリに、マイグレーションと `cms.config.json` があります。必要なものを自分のサイトにコピーして使います。

| コレクション | 型           | 内容                                                                                  |
| ------------ | ------------ | ------------------------------------------------------------------------------------- |
| `posts`      | 記事型       | タイトル、スラッグ、リッチテキストの本文、カバー画像、カテゴリ、下書きと公開日        |
| `stores`     | 一覧型       | 選択項目と URL を持つ、並列のレコード                                                 |
| `about`      | 単一ページ型 | レコードは1件だけ。マイグレーションで作り、編集者は更新だけできる（作成・削除は不可） |
| `media`      | メディア     | 画像ファイル、必須の代替テキスト、キャプション、幅と高さ                              |

- `examples/lantern-coffee/pb_migrations/` に JavaScript のマイグレーションがあります（`users.role` も含みます）。自分の PocketBase の `pb_migrations/` に置きます。
- `examples/lantern-coffee/cms.config.json` が対応する設定ファイルです。`pb_public/cms/config.json` にコピーします。
- どのコレクションにも `created` と `updated`（autodate 型）があります。マイグレーションで作ったコレクションには自動では付かないためです。

## ライセンス

[MIT](LICENSE)
