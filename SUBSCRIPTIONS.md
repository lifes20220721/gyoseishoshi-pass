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

## 現在の確認結果（2026年11月18日）

- 内部テスト: バージョン1.1.0（versionCode 2）の配信をAPIで確定し、再取得で `completed` を確認済みです。本番公開はしていません。
  - 配信: https://github.com/lifes20220721/gyoseishoshi-pass/actions/runs/44221904655
  - 再確認: https://github.com/lifes20220721/gyoseishoshi-pass/actions/runs/44222009371
- 月額500円: `monthly` は `ACTIVE` です。
- 年額5,000円: Consoleでの有効化後、`yearly` の `ACTIVE` をAPIで確認しました。月額・年額とも日本価格・期間・互換設定が一致しています。
  - 最新確認: https://github.com/lifes20220721/gyoseishoshi-pass/actions/runs/44228822012
- ライセンステスター登録: 提示された画面で「行政書士購入テスト」が選択され、1人の登録と保存完了の表示を確認しました。公開に使用する開発者アカウントは自動的にライセンステスターとして扱われます。別アカウントの登録はConsoleから行い、公開APIには対応する操作がありません。内部テスト参加者の登録とは別です。
  - 公式手順: https://support.google.com/googleplay/android-developer/answer/6062777?hl=ja
- 内部テストのメールリストはAPIに表示されないため、APIのGoogleグループ件数だけでは参加者登録の有無を判定できません。
- テスト購入は未実施です。実機では「テストカード、常に承認」とテスト購入表示を確認してから実行します。
- 購入UI・無料100問制限・購入情報の復元を有効にしたコードを公開準備済みです。通常ブラウザで購入できない場合は購入ボタンを無効にし、Google Play版での利用方法を表示します。Google Play製品版トラックは引き続き未公開です。
- 自動検証: クライアント11件、Workerとデプロイ8件、1000問・無料100問の教材検査を通過しました。モバイル幅のChromiumで、無料100問、模擬購入後1000問、再読込後の復元、期限切れで100問へ戻ることを確認しました。模擬テストではGoogleへの実購入リクエストは送っていません。

テスト参加URL: https://play.google.com/apps/testing/com.gyoseishoshipass.app （登録したテスターのアカウントで利用）

Play Console: https://play.google.com/console/u/0/developers/8207914986576802573/app/4973020431377712705/app-dashboard

## 自動設定と必要な権限

GitHub Actionsの `Configure Google Play subscriptions` は、登録済みの `PLAY_SERVICE_ACCOUNT_JSON` を使い、上記2商品の日本向け基本プランを下書き作成して価格・期間を再取得確認します。既存商品の価格が異なる場合は上書きせず停止します。

サービスアカウント `gyosei-play-uploader@shihoshoshi-pass-ci.iam.gserviceaccount.com` には、行政書士PASSに限定して「ストアでの表示の管理」権限が必要です。内部テストへのリリース権限だけでは商品APIは利用できません。

2026年11月16日、Consoleで保存された月額・年額商品をAPIで取得し、月額500円（P1M）と年額5,000円（P1Y）、基本プランID `monthly` / `yearly` が一致することを確認しました。確認実行: https://github.com/lifes20220721/gyoseishoshi-pass/actions/runs/43870093834 。商品の新規作成APIは引き続きHTTP 403のため、初回商品はConsoleから作成済みです。

2026年11月16日、Cloudflare接続とWorker公開を実施しました。検証URLは `https://gyoseishoshi-pass-billing.gyosei-pass-85cbe232.workers.dev/v1/subscriptions/verify` です。外部HTTPS疎通、CORS、未許可Originの拒否、Googleへの無効購入照会と拒否を確認しました。11月18日にアプリ側の購入機能を有効化する準備を完了しました。有効な購入・承認・復元・解約の実機テストが残っています。

## 課金を有効にする条件

1. 署名済みAABを内部テスト以上へアップロードする。
2. Google Paymentsの販売者アカウントをPlay Consoleに接続する。
3. 上記2商品を作成し、有効化する。
4. Google Play Developer APIで購入トークンを検証・承認するHTTPSバックエンドを公開する。
5. `subscription-config.js` の `verificationEndpoint` にそのURLを入れ、`enabled` を `true` に変更する。

購入の検証・承認サーバーが未設定の間は `enabled: false` のままにします。誤課金や、3日以内に未承認購入が自動返金される状態を防ぐためです。
