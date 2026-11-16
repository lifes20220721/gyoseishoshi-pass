# 購入確認バックエンド

Google Play Developer APIで行政書士PASSの定期購入を検証し、未承認の購入を承認するサーバーです。追加費用を避ける構成としてCloudflare Workers Free向けの `worker.mjs` を用意しています。`server.mjs` はNode.js / Cloud Run向けの別実装です。

## 無料プランでの公開（推奨）

1. Cloudflareの無料アカウントを用意し、Workers Freeを使用します。有料プランへの変更やCloud Runの作成は行いません。
2. `wrangler.jsonc` を使って `worker.mjs` を公開します。
3. Workerの暗号化Secret `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` に、GitHubで登録済みの行政書士用サービスアカウントJSONを設定します。通常の環境変数やソースファイルには鍵を入れません。
4. `/health` と `/v1/subscriptions/verify` のCORS、無効購入の拒否を確認し、Play内部テストの実購入で確認・承認・復元・解約をテストします。
5. 確認後にWeb側の検証URLを接続し、課金機能と商品を有効にします。

Cloudflareの公開に必要なアカウント認証は現在未接続です。無料枠の制限は https://developers.cloudflare.com/workers/platform/pricing/ を参照してください。

## GitHub経由の自動公開

CloudflareのカスタムAPIトークンに、対象の1アカウントだけの「Workersスクリプト: 編集」と「アカウント設定: 参照」を付け、GitHub Repository secret `CLOUDFLARE_API_TOKEN` に保存します。Googleの鍵は既存の `PLAY_SERVICE_ACCOUNT_JSON` を利用します。

`deploy-worker.mjs` は対象アカウントが1件であることを確かめ、必要ならWorkers用サブドメインを作成します。Workerと暗号化SecretをHTTPSで公開し、ヘルスチェックと不許可Originの拒否をテストします。課金プランの変更APIは呼びません。利用アカウントはWorkers Freeであることを事前にダッシュボードで確認してください。

自動公開後も、アプリの課金機能と定期購入商品の有効化は別段階です。

Workerのテストは `node worker.test.mjs` で実行します。秘密鍵・OAuthトークン・購入トークンはログに出しません。

## Node.js / Cloud Runを使用する場合

1. Google Play ConsoleとGoogle Cloudプロジェクトを接続する。
2. Android Publisher APIを有効にする。
3. Cloud Runの実行サービスアカウントをPlay ConsoleのAPIアクセスに追加し、定期購入の参照・管理権限を付与する。
4. Cloud Runの実行サービスアカウントでGoogle Play Developer APIへ認証し、公開HTTPS URLへデプロイする。
5. `subscription-config.js` の `verificationEndpoint` に `https://<Cloud Run URL>/v1/subscriptions/verify` を設定する。

サーバーはカード情報を取得せず、購入商品IDと購入トークンのみを検証します。
