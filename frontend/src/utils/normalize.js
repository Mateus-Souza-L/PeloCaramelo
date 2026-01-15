// src/utils/normalize.js
export const DEFAULT_IMG = "/paw.png";

export const toNum = (v) => {
  if (v === "" || v == null) return null;

  // já é número
  if (typeof v === "number") return Number.isFinite(v) ? v : null;

  // string: tenta normalizar "50,00" / "R$ 50" / "  50  "
  const s = String(v).trim();
  if (!s) return null;

  // troca vírgula por ponto e remove símbolos comuns
  const cleaned = s
    .replace(/\s+/g, "")
    .replace("R$", "")
    .replace(/\./g, "") // remove separador de milhar (pt-BR)
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

const cap = (s = "") => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export const serviceLabel = (k) =>
  k === "petSitter" ? "Pet Sitter" : k === "passeios" ? "Passeios" : cap(k);

export const getSvcPriceMap = (raw) => {
  const p = raw?.prices || {};

  // compat: alguns backends mandam preços em campos top-level
  const top = raw || {};

  return {
    hospedagem:
      toNum(p.hospedagemDia) ??
      toNum(p.hospedagemDiaria) ??
      toNum(p.hospedagem) ??
      toNum(top.hospedagemDia) ??
      toNum(top.hospedagemDiaria) ??
      toNum(top.hospedagem),
    creche:
      toNum(p.crecheDiaria) ??
      toNum(p.crecheDia) ??
      toNum(p.creche) ??
      toNum(top.crecheDiaria) ??
      toNum(top.crecheDia) ??
      toNum(top.creche),
    petSitter:
      toNum(p.petSitterDiaria) ??
      toNum(p.petSitterVisita) ??
      toNum(p.petsitterDiaria) ??
      toNum(p.petsiterDiaria) ??
      toNum(p.petSitter) ??
      toNum(top.petSitterDiaria) ??
      toNum(top.petSitterVisita) ??
      toNum(top.petsitterDiaria) ??
      toNum(top.petsiterDiaria) ??
      toNum(top.petSitter),
    passeios:
      toNum(p.passeiosHora) ??
      toNum(p.passeioHora) ??
      toNum(p.passeios30) ??
      toNum(p.passeiosDiaria) ??
      toNum(p.passeios) ??
      toNum(top.passeiosHora) ??
      toNum(top.passeioHora) ??
      toNum(top.passeios30) ??
      toNum(top.passeiosDiaria) ??
      toNum(top.passeios),
  };
};

const baseLocation = (raw) => {
  const neighborhood = (raw?.neighborhood || "").trim();
  const city = (raw?.city || "").trim();
  const displayLocation = [neighborhood, city].filter(Boolean).join(" — ");
  return { neighborhood, city, displayLocation };
};

export function normalizeCaregiver(raw) {
  if (!raw) return null;

  const priceMap = getSvcPriceMap(raw);

  const services = {
    hospedagem:
      (raw?.services?.hospedagem ?? false) || (Number(priceMap.hospedagem) > 0),
    creche:
      (raw?.services?.creche ?? false) || (Number(priceMap.creche) > 0),
    petSitter:
      (raw?.services?.petSitter ?? false) || (Number(priceMap.petSitter) > 0),
    passeios:
      (raw?.services?.passeios ?? false) || (Number(priceMap.passeios) > 0),
  };

  const legacy = toNum(raw?.price);
  const candidates = [
    priceMap.hospedagem,
    priceMap.creche,
    priceMap.petSitter,
    priceMap.passeios,
    legacy,
  ].filter((v) => Number(v) > 0);

  const minPrice = candidates.length ? Math.min(...candidates) : null;

  const { neighborhood, city, displayLocation } = baseLocation(raw);

  return {
    ...raw,
    image: raw?.image || DEFAULT_IMG,
    prices: {
      hospedagemDia: priceMap.hospedagem,
      crecheDiaria: priceMap.creche,
      petSitterDiaria: priceMap.petSitter,
      passeiosHora: priceMap.passeios,
    },
    services,
    minPrice,
    neighborhood,
    city,
    displayLocation,
  };
}

export function normalizeTutor(raw) {
  if (!raw) return null;
  const { neighborhood, city, displayLocation } = baseLocation(raw);

  return {
    ...raw,
    image: raw?.image || DEFAULT_IMG,
    services: undefined,
    prices: undefined,
    courses: undefined,
    neighborhood,
    city,
    displayLocation,
  };
}

export function normalizeUser(raw) {
  if (!raw) return null;
  if (raw.role === "caregiver") return normalizeCaregiver(raw);
  if (raw.role === "tutor") return normalizeTutor(raw);
  const { neighborhood, city, displayLocation } = baseLocation(raw);
  return {
    ...raw,
    image: raw?.image || DEFAULT_IMG,
    neighborhood,
    city,
    displayLocation,
  };
}
