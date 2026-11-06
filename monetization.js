'use strict';

(() => {
  const config = window.GYOPASS_MONETIZATION_CONFIG || {};
  const CONSENT_KEY = 'gyoseishoshi-pass:advertising-consent:v1';
  const banner = document.getElementById('consentBanner');
  const settingsButton = document.querySelector('[data-consent-settings]');
  const clientIsValid = /^ca-pub-\d{16}$/.test(config.adsenseClient || '');
  const configured = config.enabled === true && clientIsValid;
  let adsLoaded = false;

  function readConsent() {
    try {
      return JSON.parse(localStorage.getItem(CONSENT_KEY));
    } catch (_) {
      return null;
    }
  }

  function saveConsent(ads) {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ ads, updatedAt: new Date().toISOString() }));
  }

  function showBanner() {
    if (configured) banner?.classList.remove('hidden');
  }

  function hideBanner() {
    banner?.classList.add('hidden');
  }

  function hideAdContainers() {
    document.querySelectorAll('[data-ad-placement]').forEach(container => container.classList.add('hidden'));
  }

  function renderAdContainers() {
    document.querySelectorAll('[data-ad-placement]').forEach(container => {
      const placement = container.dataset.adPlacement;
      const slot = config.slots?.[placement] || '';
      const ad = container.querySelector('.adsbygoogle');
      if (!ad || !/^\d+$/.test(slot)) {
        container.classList.add('hidden');
        return;
      }
      ad.dataset.adClient = config.adsenseClient;
      ad.dataset.adSlot = slot;
      container.classList.remove('hidden');
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (_) {
        container.classList.add('hidden');
      }
    });
  }

  function loadAds() {
    if (!configured || adsLoaded) return;
    adsLoaded = true;
    const script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(config.adsenseClient)}`;
    script.addEventListener('load', renderAdContainers, { once: true });
    script.addEventListener('error', hideAdContainers, { once: true });
    document.head.append(script);
  }

  document.addEventListener('click', event => {
    const choice = event.target.closest('[data-consent]')?.dataset.consent;
    if (choice === 'accept') {
      saveConsent(true);
      hideBanner();
      loadAds();
    }
    if (choice === 'reject') {
      saveConsent(false);
      hideBanner();
      hideAdContainers();
    }
  });

  settingsButton?.addEventListener('click', () => {
    if (!configured) {
      alert('現在、第三者配信広告は準備中です。広告配信を開始する際は、この画面から設定を変更できるようになります。');
      return;
    }
    showBanner();
  });

  hideAdContainers();
  if (!configured) return;
  const consent = readConsent();
  if (consent?.ads === true) loadAds();
  else if (consent?.ads !== false) showBanner();
})();
