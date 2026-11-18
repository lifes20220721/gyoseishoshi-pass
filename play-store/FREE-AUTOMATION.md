# 有料ブラウザサービスを使わないアップロード

ローカルPCまたは既存の開発環境でGoogle Play Developer APIを呼び出します。TinyFishのチャージや有料ブラウザは不要です。この仕組みはCloud Run等の課金リソースを作成しません。

## 一度だけ必要な準備

1. Play Consoleの行政書士PASSへ初回AABを登録し、Play App Signing等の初期設定を済ませます。
2. Google CloudでGoogle Play Android Developer APIを有効にしてサービスアカウントを作成します。
3. Play Consoleの「ユーザーと権限」にそのサービスアカウントのメールを追加し、行政書士PASSの内部テストへのリリース権限と必要な参照権限を付けます。
4. サービスアカウントのJSON鍵は `play-store/private/play-service-account.json` に保管します。チャットやGitへ貼り付ける必要はありません。

認証情報はGitHub Actionsの `PLAY_SERVICE_ACCOUNT_JSON` に登録済みです。日常の自動処理ではGitHub上のSecretを使用し、ローカルへの秘密鍵の保存やチャットへの再添付は不要です。

## 日常の操作

`play-store` ディレクトリで初回だけ `npm ci` を実行します。

```bash
# AABを確認（外部送信なし）
npm run check

# Google Playの内部テストへ下書きとして登録
GOOGLE_APPLICATION_CREDENTIALS=./private/play-service-account.json npm run upload:internal
```

送信は下書き登録までです。審査送信・テスター配信・本番公開は開始しません。既に内部テストで配信済みのリリースがある場合は、その配信を変更せず停止します。Google側の検証に失敗した場合は編集中の変更を破棄します。

更新時のAAB作成は、既存の `scripts/build-release.mjs` を使います。アップロードには未使用のversionCodeが必要です。購入確認サーバーはCloudflare Workers無料プランへデプロイ済みで、`Deploy free billing Worker` ワークフローから更新できます。有料プランへの切り替えや課金リソースの作成は行っていません。

公式手順: https://developers.google.com/android-publisher/getting_started

## GitHubからの下書き登録

`PLAY_SERVICE_ACCOUNT_JSON` をGitHub ActionsのRepository secretに登録すると、接続テストを実行できます。
署名済みAABは `scripts/sealed-bundle.mjs` でGoogleサービスアカウントの公開証明書を使って暗号化し、専用ブランチに保存します。GitHubの実行中にのみSecretの秘密鍵で復号し、AABのSHA-256と署名を確認してから既存のアップロード処理へ渡します。

暗号化はAES-256-GCM、コンテンツ鍵の保護はRSA-OAEP-SHA256です。リポジトリへ入れるのは暗号文と公開メタデータだけで、署名用キーストア、パスワード、Google秘密鍵はコミットしません。Googleの鍵を交換した場合は新しい公開証明書でAABを再暗号化します。

## 内部テスト配信

`Prepare internal test release` は、既存の内部テストがversionCode 2だけであることを確認してGoogleの検証を実行します。標準では検証だけを行い、`commit_internal=true` を指定したときだけ内部テストへの配信を確定します。製品版トラックは操作しません。

2026年11月18日に内部テスト配信を確定し、再取得で `completed` を確認しました。
https://github.com/lifes20220721/gyoseishoshi-pass/actions/runs/44221904655

`Activate prepared Play subscription plans` は、月額500円・年額5,000円、日本向け・期間・互換設定を両方検証してから下書き基本プランだけを有効化します。既存の価格や停止済みプランは変更しません。年額プランの有効化はGoogle側のHTTP 403で拒否されており、Consoleでの操作が残っています。

ライセンステスター登録は公開APIが提供されていないため、Consoleで設定します。内部テストへの配信だけでは購入が無料になるとは限りません。詳細と残りの作業は [SUBSCRIPTIONS.md](../SUBSCRIPTIONS.md) に記録しています。
