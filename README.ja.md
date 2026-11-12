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

`pnpm dev` では、環境変数 `CMS_CONFIG` で指定したファイルを `/cms/config.json` として配信します（例：`CMS_CONFIG=path/to/cms.config.json pnpm dev`）。

本物の PocketBase で試すときは、`build/` を `pb_public/cms/` にコピーして `pocketbase serve` を実行します。

## ライセンス

[MIT](LICENSE)
