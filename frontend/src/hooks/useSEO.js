// src/hooks/useSEO.js
import { useEffect } from "react";

function ensureMetaTag(name) {
  let el = document.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  return el;
}

function ensureCanonicalTag() {
  let el = document.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  return el;
}

/**
 * useSEO (SPA-friendly, React 19 ok)
 * - description: string
 * - noindex: boolean (se true -> robots: noindex,nofollow)
 * - canonical: string (opcional)
 */
export function useSEO({ description, noindex = false, canonical } = {}) {
  useEffect(() => {
    // meta description
    if (typeof description === "string") {
      const meta = ensureMetaTag("description");
      meta.setAttribute("content", description.trim());
    }

    // robots
    const robots = ensureMetaTag("robots");
    robots.setAttribute("content", noindex ? "noindex, nofollow" : "index, follow");

    // canonical (opcional)
    if (typeof canonical === "string" && canonical.trim()) {
      const link = ensureCanonicalTag();
      link.setAttribute("href", canonical.trim());
    }
  }, [description, noindex, canonical]);
}
