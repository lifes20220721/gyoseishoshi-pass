# 有料ブラウザサービスを使わないアップロード

ローカルPCまたは既存の開発環境でGoogle Play Developer APIを呼び出します。TinyFishのチャージや有料ブラウザは不要です。この仕組みはCloud Run等の課金リソースを作成しません。

## 一度だけ必要な準備

1. Play Consoleの行政書士PASSへ初回AABを登録し、Play App Signing等の初期設定を済ませます。
2. Google CloudでGoogle Play Android Developer APIを有効にしてサービスアカウントを作成します。
3. Play Consoleの「ユーザーと権限」にそのサービスアカウントのメールを追加し、行政書士PASSの内部テストへのリリース権限と必要な参照権限を付けます。
4. サービスアカウントのJSON鍵は `play-store/private/play-service-account.json` に保管します。チャットやGitへ貼り付ける必要はありません。

サービスアカウントの新規権限設定は、この環境に認証情報がないため未実施です。TinyFishに保存したGoogleログインは、このAPIの認証には使いません。

## 日常の操作

`play-store` ディレクトリで初回だけ `npm ci` を実行します。

```bash
# AABを確認（外部送信なし）
npm run check

# Google Playの内部テストへ下書きとして登録
GOOGLE_APPLICATION_CREDENTIALS=./private/play-service-account.json npm run upload:internal
```

送信は下書き登録までです。審査送信・テスター配信・本番公開は開始しません。既に内部テストで配信済みのリリースがある場合は、その配信を変更せず停止します。Google側の検証に失敗した場合は編集中の変更を破棄します。

更新時のAAB作成は、既存の `scripts/build-release.mjs` を使います。アップロードには未使用のversionCodeが必要です。購入確認サーバーは別途必要で、無料枠のあるサービスも将来の費用ゼロを保証しません。課金サーバーの自動デプロイは含めていません。

公式手順: https://developers.google.com/android-publisher/getting_started

## GitHubからの下書き登録

`PLAY_SERVICE_ACCOUNT_JSON` をGitHub ActionsのRepository secretに登録すると、接続テストを実行できます。
署名済みAABは `scripts/sealed-bundle.mjs` でGoogleサービスアカウントの公開証明書を使って暗号化し、専用ブランチに保存します。GitHubの実行中にのみSecretの秘密鍵で復号し、AABのSHA-256と署名を確認してから既存のアップロード処理へ渡します。

暗号化はAES-256-GCM、コンテンツ鍵の保護はRSA-OAEP-SHA256です。リポジトリへ入れるのは暗号文と公開メタデータだけで、署名用キーストア、パスワード、Google秘密鍵はコミットしません。Googleの鍵を交換した場合は新しい公開証明書でAABを再暗号化します。
