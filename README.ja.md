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
PocketBase のスキーマに無いコレクションや項目を設定に書いた場合は、画面の上部に警告を出し、その設定を無視します（スキーマを返すフックができてから有効になります）。

## 開発

必要なもの：Node.js 22 以上と pnpm

```sh
pnpm install
pnpm dev      # 開発サーバー http://localhost:5173/cms/
pnpm check    # 型チェック
pnpm lint     # prettier と eslint
pnpm test     # ユニットテスト
pnpm build    # build/ に静的ファイルを書き出す
```

### 統合テストと E2E

どちらも本物の PocketBase に対して動きます。`compose.yaml` のバージョンの公式バイナリ（初回に `node_modules/.cache/pocketbase/` にダウンロード）を、例のプリセットと開発用のアカウントつきで、使い捨てのデータディレクトリで起動します。終わるとデータは消えます。Docker は不要です。

```sh
pnpm test:integration                  # API ルールとフック（tests/integration/）
pnpm exec playwright install chromium  # 最初の E2E の前に一度だけ
pnpm build && pnpm test:e2e            # pb_public/cms/ に置いたビルド済みの CMS（tests/e2e/）
```

E2E の PocketBase はポート 8091 で動きます。別のポートにするときは `E2E_PORT` を設定します。

本物の PocketBase で試すときは、`build/` を `pb_public/cms/` にコピーして `pocketbase serve` を実行します。

画面の文言は `messages/en.json` と `messages/ja.json` にあります（[Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs)）。`src/paraglide/` のコンパイル結果は `pnpm install`、`pnpm dev`、`pnpm build` で生成されます。表示言語は、ユーザーの選択、ブラウザの言語設定、英語の順で決まります。

## 開発用の PocketBase で試す

`compose.yaml` は、公式バイナリの PocketBase（v0.40.6。正式に対応するのは最新のマイナーバージョンだけ）を、`examples/` のプリセットつきで起動します。Docker Compose が必要です。

```sh
docker compose up -d --build   # PocketBase: http://localhost:8090
pnpm install
pnpm dev                       # CMS: http://localhost:5173/cms/
```

CMS には `editor@example.com` / `password1234` でログインします。PocketBase のダッシュボード <http://localhost:8090/_/> には `admin@example.com` / `password1234` で入れます。これらのアカウントは `dev/pb_migrations/` が作るもので、ローカルの開発専用です。

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
