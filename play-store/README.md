# 行政書士PASS — Google Play提出用Androidアプリ

行政書士PASSのPWAをTrusted Web Activity（TWA）として配布するAndroidプロジェクトです。Web版の問題・解説・学習機能の更新は、アプリにも反映されます。

## アプリ情報

- アプリ名: 行政書士PASS
- パッケージ名: `com.gyoseishoshipass.app`
- 初回バージョン: `1.0.0`（versionCode `1`）
- Target SDK: Android 16 / API 36
- Minimum SDK: Android 7.0 / API 24
- 配信URL: `https://gyoseishoshipass.com/`
- プライバシーポリシー: `https://gyoseishoshipass.com/privacy.html`

## 生成物

署名済みの提出ファイルは `app-release-bundle.aab` です。このファイルをPlay Consoleのテストまたは製品版トラックへアップロードします。

`private/upload-keystore.jks` と `private/upload-key-credentials.txt` は更新時に必要な秘密情報です。Gitには含まれません。必ず暗号化された安全な場所へ2部以上バックアップしてください。

## Play Consoleでの提出順序

1. Play Consoleでアプリを作成し、アプリ種別を「アプリ」、カテゴリを「教育」に設定する。
2. 有料販売する場合は、一般公開前に「有料」と価格を設定する。一度無料で提供した同一パッケージは有料へ変更できません。
3. `app-release-bundle.aab` を内部テストへアップロードし、Play App Signingを有効にする。
4. Play Consoleの「Playアプリ署名」から「アプリ署名鍵証明書」のSHA-256を取得する。
5. 次のコマンドでWeb側のDigital Asset Linksへフィンガープリントを追加し、サイトを公開する。

   `node scripts/add-play-signing-fingerprint.mjs "AA:BB:..."`

6. `https://gyoseishoshipass.com/.well-known/assetlinks.json` がHTTPS・リダイレクトなし・HTTP 200で取得できることを確認する。
7. `store-listing-ja.md` を使ってストア掲載情報を入力する。
8. アプリのコンテンツ、対象年齢、広告、データセーフティ、コンテンツレーティング、プライバシーポリシーを申告する。
9. 実機で「科目、分野別に学ぶ」「科目ごとの続きから再開」「学習履歴」を確認してから審査へ提出する。

個人のデベロッパーアカウントが2023年11月13日以降に作成された場合、製品版アクセス前に12人以上が14日間継続参加するクローズドテストが必要になる場合があります。

## 更新ビルド

1. `twa-manifest.json` の `appVersionCode` を必ず増やし、`appVersion` を更新する。
2. Android SDK 36とJDK 17を準備する。
3. 秘密ファイルを `private/` に戻す。
4. `node scripts/build-release.mjs` を実行する。
5. `node scripts/verify-play-store.mjs` を実行する。

## 公式資料

- [対象API要件](https://support.google.com/googleplay/android-developer/answer/11926878)
- [アプリ価格の設定](https://support.google.com/googleplay/android-developer/answer/6334373)
- [プレビュー素材の要件](https://support.google.com/googleplay/android-developer/answer/9866151)
- [データセーフティ](https://support.google.com/googleplay/android-developer/answer/10787469)
- [App Linksとassetlinks.json](https://developer.android.com/training/app-links/about)

