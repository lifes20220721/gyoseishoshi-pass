'use strict';

window.GYOPASS_SUBSCRIPTION_CONFIG = Object.freeze({
  enabled: false,
  packageName: 'com.gyoseishoshipass.app',
  verificationEndpoint: '',
  freeQuestionCount: 100,
  totalQuestionCount: 1000,
  products: Object.freeze([
    Object.freeze({ id: 'gyosei_premium_monthly', label: '月額プラン', fallbackPrice: '月500円' }),
    Object.freeze({ id: 'gyosei_premium_yearly', label: '年額プラン', fallbackPrice: '年5,000円' })
  ])
});
