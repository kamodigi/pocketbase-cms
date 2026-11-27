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
PocketBase のスキーマに無いコレクションや項目を設定に書いた場合は、画面の上部に警告を出し、その設定を無視します。ログインのあとに、`GET /api/cms/schema` から読んだスキーマと照らし合わせます。

### ログインとナビゲーション

ログインできるのは、`users` のうち `role = "editor"` のアカウントだけです。それ以外のアカウントはメッセージを出してすぐにログアウトします。編集者のアカウントが削除されたり権限を外されたりした場合は、次に CMS を開いたときにログアウトします。ログインの状態はブラウザのローカルストレージに保存されるので、再読み込みしても続き、1つのタブでログアウトするとすべてのタブでログアウトします。

「パスワードを忘れた場合」からは、PocketBase 標準の `users` のパスワード再設定の依頼を呼びます。メールは PocketBase が送るので、ダッシュボードでメールの設定（SMTP）をしてください。必要なら `users` コレクションの設定で「Reset password」のテンプレートも変えられます。既定のテンプレートのリンクは、新しいパスワードを設定する PocketBase 自身のページを開きます。CMS は、そのアドレスのアカウントがあってもなくても同じ確認の文を表示します。

サイドバーには `collections` のコレクションを `nav` のグループ分けで並べます。`nav` に書いていないコレクションは最後のグループの末尾に足します。`nav` が無いときは、設定の順に1つのグループにまとめます。ログインすると、サイドバーの最初のコレクションを開きます。`icon` には次の Lucide のアイコン名を使えます。それ以外の名前は `file-text` になります：`award`、`bell`、`book-open`、`box`、`briefcase`、`building`、`calendar`、`camera`、`clipboard-list`、`coffee`、`file`、`file-text`、`folder`、`gift`、`globe`、`graduation-cap`、`handshake`、`heart`、`house`、`image`、`images`、`info`、`layers`、`layout-grid`、`link`、`list`、`mail`、`map`、`map-pin`、`megaphone`、`message-square`、`newspaper`、`package`、`pen-line`、`phone`、`quote`、`rss`、`settings`、`shopping-bag`、`star`、`store`、`tag`、`ticket`、`trophy`、`user`、`users`、`utensils`、`video`。

### 一覧画面

コレクションの画面は、レコードの表です。

- **列**は `list.columns` で、見出しには `fields` の表示名を使います。指定が無いときは、タイトルの項目（`titleField`、無ければ最初の text 型の項目）、`status` があれば公開状態、`updated` の項目があればそれを表示します。タイトルはレコードへのリンクです。画像はサムネイルで、関連するレコードは名前で表示します。
- **検索**は、`list.search` の項目（指定が無ければタイトルの項目）に、入力した文字列を含むレコードを探します。
- **絞り込み**：`status` があるコレクションは、公開・予約公開（`publishedAtField` があるときだけ）・下書きで絞り込めます。
- **並び順**は `list.sort`、指定が無ければ `updated` の新しい順です。日付の列の見出しを選ぶとその日付の新しい順に、もう一度選ぶと逆順に並べ替えます。
- **ページ**は `list.perPage` 件ごとです（指定が無ければ30件）。

ページ・検索・絞り込み・並び順は URL に残るので、再読み込みや「戻る」をしても保たれます。言語ごとの項目は、`locales` の最初の言語の値を表示・検索・並べ替えに使います。`singleton: true` のコレクションには一覧が無く、1件だけのレコードを直接開きます。

### 記事の中身の多言語化

記事を複数の言語で書くときは、`locales` に記事の言語を並べ（先頭が基本の言語）、PocketBase には言語ごとに `<基本名>_<言語コード>` の項目を作ります（`title_en`、`title_ja`）。ハイフン入りの言語コードは小文字とアンダースコアにするので、`zh-Hans` は `title_zh_hans` になります。そのうえで `fields` の基本名に `"localized": true` を付け（`"title": { "localized": true }`）、`titleField`・`form`・`list` など設定のほかの場所でも基本名を使います。

編集画面では、こうした項目を言語のタブ付きの1つの入力欄として表示します。すべての多言語の入力欄のタブは一緒に切り替わり、最初は基本の言語が開きます。どの言語を必須にするかは PocketBase の各項目の `required` に従います。保存できなかったときは、最初にエラーがある項目の言語のタブを開き、エラーのあるタブに印を付けます。`locales` にあってスキーマに項目が無い言語は警告として表示し、入力欄にはある言語だけを出します。スラッグ・日付・画像・公開状態は言語で共通の普通の項目なので、公開はすべての言語でまとめて行います。多言語のタイトルから作るスラッグは基本の言語の値を使います。管理画面そのものの言語は別に選び（言語のメニュー）、開いているタブとは連動しません。

### relation 型の項目

編集画面の `relation` 型の項目は、選んだレコードを名前で表示します。「…を選ぶ」でダイアログを開き、関連先のコレクションを検索して選びます。項目の `maxSelect` が2以上なら複数を選べて、選んだ順に保存します。

- **名前**：項目の `displayField`、なければ関連先のコレクションの `titleField`（または最初の text 型の項目）、それもなければ `name`・`title`・`email` を使います。どれにも値が無いレコードや、PocketBase が編集者に見せないレコードは、ID で表示します。
- **検索**は、その名前の項目と、関連先のコレクションの `list.search` を対象にします。並び順は関連先の `list.sort` です。
- **設定ファイルに無いコレクション**（`users` など）も選べます。選べるレコードは PocketBase の一覧・閲覧のルールで決まり、名前は `displayField`・`name`・`title`・`email` から読みます。

### 未保存の入力

編集画面で入力すると、CMS は変更した項目をブラウザの localStorage に一時保存します。下書きは編集者とレコードごとに1つです（新規作成の画面はコレクションごとに1つ）。同じ画面を開き直すと「保存していない変更があります。復元しますか？」と尋ね、復元か破棄を選ぶとフォームを使えるようになります。復元すると変更した項目だけが戻り、保存するまで何も送りません。下書きは、レコードを保存または削除したとき、破棄を選んだとき、自分で変更を元に戻したときに消えます。ログアウトのボタンでログアウトすると、その編集者の下書きをすべて消すので、共用のパソコンに未公開の文章は残りません。ログインの期限が切れた場合は残るので、入力は失われません。レコードに `updated` の項目があり、下書きを作った後に別の保存があった場合は、その旨を表示します（復元は選べます）。ブラウザの保存領域がいっぱいか使えない場合は、一時保存なしで動きます。

### サイトでの下書きのプレビュー

コレクションの `previewUrl` に、サイトのページの `http` か `https` の絶対 URL を指定すると、そのコレクションの保存済みレコードの編集画面に **サイトで確認** ボタンが出ます。

```json
{
	"collections": {
		"news": { "previewUrl": "https://www.example.com/news/preview" }
	}
}
```

`previewUrl` の無いコレクションにはボタンを出しません。プレビューのフック `pbcms_preview.pb.js`（[PocketBase のフック](#pocketbase-のフック)を参照）か、[Go パッケージ](#go-パッケージ)が必要です。補助ライブラリはありません。ページは、次の説明に沿ってサイト側で実装します。

**ページが受け取るもの。** ボタンは新しいタブを開き、`previewUrl` に HTML のフォームを送ります。`POST` で、本文は `application/x-www-form-urlencoded` です。

| 項目         | 値                                                             |
| ------------ | -------------------------------------------------------------- |
| `collection` | コレクション名（`news` など）                                  |
| `id`         | レコードの ID                                                  |
| `token`      | このレコード 1 件だけに使えるプレビュー用トークン。10 分間有効 |

プレビューに出るのは保存済みのレコードです。保存していない変更は反映されません。項目は今後増えることがあるので、知らない項目は無視してください。

**ページが下書きを読む方法。** トークンを付けて PocketBase を呼びます。

```http
GET https://pb.example.com/api/cms/preview/news/abc123def456ghi
Authorization: Bearer <token>
```

| ステータス | 意味                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------------- |
| 200        | PocketBase のレコードの API と同じ形のレコード（下書きを含む）。`Cache-Control: no-store` 付き |
| 401        | トークンが無い・正しくない・期限切れ。CMS からもう一度プレビューを開くよう案内します           |
| 403        | 別のレコードのトークン                                                                         |
| 404        | レコードが消されている                                                                         |

リレーションは ID で返ります。関連するレコードを表示するには、公開ページと同じように PocketBase のレコードの API から読みます。トークンで読めるのは、その 1 件だけです。

**ページで守ること。**

- 別のオリジンからのフォームの `POST` を受け付けてください。多くのフレームワークは CSRF 対策として既定で拒否するので、CMS のオリジンを許可するか、このルートを対象から外します。`SameSite=Lax` や `Strict` の Cookie は送られません。
- このフォームは誰でも送れるので、項目は信頼できない入力として扱います。ページを用意したコレクションだけを受け付け、ID の形式を確かめ、呼び先は必ず自分の PocketBase にします（リクエストから受け取ったアドレスは使いません）。
- ページは HTTPS で配信し、トークンを URL やログに残さず、ページをキャッシュ・インデックスさせないでください（`Cache-Control: no-store`、`noindex`）。
- リッチテキストは、無害化するフック（後述）を入れた状態でだけ表示してください。

[`examples/lantern-coffee/preview-site/server.mjs`](examples/lantern-coffee/preview-site/server.mjs) は、これを行う依存パッケージなしの小さなページです。サンプルの設定では `posts` と `about` がこのページを指しています。[開発用の PocketBase](#開発用の-pocketbase-で試す) を起動した状態で `node examples/lantern-coffee/preview-site/server.mjs` を実行し、ボタンを押してください。自分のサイトの設定では、この `previewUrl` を書き換えるか消してください。

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

`pbcms.Register` は上の JavaScript のフックすべての代わりになるので、フックは一緒に入れないでください。読み取る環境変数（`PBCMS_CONFIG_PATH`・`PBCMS_PUBLIC_URL`・`PBCMS_PREVIEW_TOKEN_DURATION`・`PBCMS_NOTIFY_URL`・`PBCMS_NOTIFY_SECRET`）も同じです。

- `GET /api/cms/schema` とプレビューのルート（`POST /api/cms/preview/{collection}/{id}/token` と `GET /api/cms/preview/{collection}/{id}`）を追加します。応答と権限の判定は同じです。プレビュー用トークンも同じものなので、JavaScript のフックが発行したトークンは Go パッケージでも使え、その逆も使えます。
- サイトへは `pbcms_notify.pb.js` と同じ内容を通知します。
- 保存時に同じ許可リストで `editor` 型の項目を無害化し、応答でもう一度無害化して画像の URL を引き直します。Go のサニタイザーは `hooks/pb_hooks/pbcms/html.cjs` を移植したもので、テストで両方に同じ入力を与えて出力が同じことを確かめています。

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

| コレクション | 型           | 内容                                                                                               |
| ------------ | ------------ | -------------------------------------------------------------------------------------------------- |
| `posts`      | 記事型       | タイトル、スラッグ、リッチテキストの本文、カバー画像、カテゴリ、店舗、下書きと公開日               |
| `events`     | 記事型       | 3つの言語（`en`・`ja`・`zh-Hans`）の記事型。タイトルと本文は言語ごと、スラッグ・日付・下書きは共通 |
| `stores`     | 一覧型       | 選択項目と URL を持つ、並列のレコード                                                              |
| `about`      | 単一ページ型 | レコードは1件だけ。マイグレーションで作り、編集者は更新だけできる（作成・削除は不可）              |
| `media`      | メディア     | 画像ファイル、必須の代替テキスト、キャプション、幅と高さ                                           |

- `examples/lantern-coffee/pb_migrations/` に JavaScript のマイグレーションがあります（`users.role` も含みます）。自分の PocketBase の `pb_migrations/` に置きます。
- `examples/lantern-coffee/cms.config.json` が対応する設定ファイルです。`pb_public/cms/config.json` にコピーします。
- `examples/lantern-coffee/preview-site/` は、設定の `previewUrl` が指すページです（[サイトでの下書きのプレビュー](#サイトでの下書きのプレビュー)を参照）。
- どのコレクションにも `created` と `updated`（autodate 型）があります。マイグレーションで作ったコレクションには自動では付かないためです。

## ライセンス

[MIT](LICENSE)
