/*
 * 広告審査通過後に本人のAdSense情報を設定します。
 * 例: adsenseClient: 'ca-pub-1234567890123456'
 * 未設定時は外部広告通信も広告枠表示も行いません。
 */
window.GYOPASS_MONETIZATION_CONFIG = Object.freeze({
  enabled: false,
  adsenseClient: '',
  slots: Object.freeze({
    homeTop: '',
    homeBottom: ''
  })
});
