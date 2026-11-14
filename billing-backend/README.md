# 購入確認バックエンド

Google Play Developer APIで行政書士PASSの定期購入を検証し、未承認の購入を承認するCloud Run向けサーバーです。

## 公開前に必要な設定

1. Google Play ConsoleとGoogle Cloudプロジェクトを接続する。
2. Android Publisher APIを有効にする。
3. Cloud Runの実行サービスアカウントをPlay ConsoleのAPIアクセスに追加し、定期購入の参照・管理権限を付与する。
4. Cloud Runの実行サービスアカウントでGoogle Play Developer APIへ認証し、公開HTTPS URLへデプロイする。
5. `subscription-config.js` の `verificationEndpoint` に `https://<Cloud Run URL>/v1/subscriptions/verify` を設定する。

サーバーはカード情報を取得せず、購入商品IDと購入トークンのみを検証します。
