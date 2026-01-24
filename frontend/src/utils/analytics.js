// src/utils/analytics.js

const GA_ID = import.meta.env.VITE_GA_ID;

// só ativa se tiver GA e estiver em produção
export const isAnalyticsEnabled =
  Boolean(GA_ID) && import.meta.env.PROD === true;

export function loadGA() {
  if (!isAnalyticsEnabled) return;
  if (window.__ga_loaded) return;

  window.__ga_loaded = true;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }

  gtag("js", new Date());
  gtag("config", GA_ID, {
    anonymize_ip: true,
    send_page_view: false, // SPA controla
  });

  window.gtag = gtag;
}

export function trackPageView(path) {
  if (!isAnalyticsEnabled || !window.gtag) return;
  window.gtag("event", "page_view", {
    page_path: path,
  });
}

export function trackEvent(name, params = {}) {
  if (!isAnalyticsEnabled || !window.gtag) return;
  window.gtag("event", name, params);
}
