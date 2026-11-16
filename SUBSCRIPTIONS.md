# 行政書士PASS 定期購入設定

## 料金と利用範囲

- 無料: 全1000問のうち100問（10%）
- 月額: 500円、全1000問
- 年額: 5,000円、全1000問

無料100問は6科目と4形式（○×・5肢・多肢・記述）すべてを体験できる固定セットです。

## Google Play Consoleで作成する商品

| 商品ID | 表示名 | 請求期間 | 日本価格 |
| --- | --- | --- | --- |
| `gyosei_premium_monthly` | 行政書士PASS プレミアム月額 | 1か月 | 500円 |
| `gyosei_premium_yearly` | 行政書士PASS プレミアム年額 | 1年 | 5,000円 |

アプリ自体の価格は「無料」のままにします。

## 自動設定と必要な権限

GitHub Actionsの `Configure Google Play subscriptions` は、登録済みの `PLAY_SERVICE_ACCOUNT_JSON` を使い、上記2商品の日本向け基本プランを下書き作成して価格・期間を再取得確認します。既存商品の価格が異なる場合は上書きせず停止します。

サービスアカウント `gyosei-play-uploader@shihoshoshi-pass-ci.iam.gserviceaccount.com` には、行政書士PASSに限定して「ストアでの表示の管理」権限が必要です。内部テストへのリリース権限だけでは商品APIは利用できません。

2026年11月16日、Consoleで保存された月額・年額商品をAPIで取得し、月額500円（P1M）と年額5,000円（P1Y）、基本プランID `monthly` / `yearly` が一致することを確認しました。確認実行: https://github.com/lifes20220721/gyoseishoshi-pass/actions/runs/43870093834 。商品の新規作成APIは引き続きHTTP 403のため、初回商品はConsoleから作成済みです。

Cloudflare Workers Free向けの購入確認実装は `billing-backend/worker.mjs` に準備済みですが、Cloudflareへのアカウント接続と公開は未実施です。購入機能はまだ有効にしていません。

## 課金を有効にする条件

1. 署名済みAABを内部テスト以上へアップロードする。
2. Google Paymentsの販売者アカウントをPlay Consoleに接続する。
3. 上記2商品を作成し、有効化する。
4. Google Play Developer APIで購入トークンを検証・承認するHTTPSバックエンドを公開する。
5. `subscription-config.js` の `verificationEndpoint` にそのURLを入れ、`enabled` を `true` に変更する。

購入の検証・承認サーバーが未設定の間は `enabled: false` のままにします。誤課金や、3日以内に未承認購入が自動返金される状態を防ぐためです。
