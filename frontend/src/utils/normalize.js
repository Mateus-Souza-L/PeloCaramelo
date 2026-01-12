// Utils de normalização compartilhados

export const DEFAULT_IMG = "/paw.png";
export const toNum = (v) => (v === "" || v == null ? null : Number(v));
const cap = (s = "") => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Label amigável para serviços
export const serviceLabel = (k) =>
  k === "petSitter" ? "Pet Sitter" : k === "passeios" ? "Passeios" : cap(k);

/** Mapa de preços (com fallbacks para chaves antigas e atuais) */
export const getSvcPriceMap = (raw) => {
  const p = raw?.prices || {};
  return {
    hospedagem:
      toNum(p.hospedagemDia) ??
      toNum(p.hospedagemDiaria) ??
      toNum(p.hospedagem),
    creche:
      toNum(p.crecheDiaria) ??
      toNum(p.crecheDia) ??
      toNum(p.creche),
    petSitter:
      toNum(p.petSitterDiaria) ??
      toNum(p.petSitterVisita) ??
      toNum(p.petsitterDiaria) ??
      toNum(p.petsiterDiaria) ??
      toNum(p.petSitter),
    passeios:
      toNum(p.passeiosHora) ??
      toNum(p.passeioHora) ??
      toNum(p.passeios30) ??
      toNum(p.passeiosDiaria) ??
      toNum(p.passeios),
  };
};

/** Normaliza campos base (usado por tutor/cuidador) */
const baseLocation = (raw) => {
  const neighborhood = (raw?.neighborhood || "").trim();
  const city = (raw?.city || "").trim();
  const displayLocation = [neighborhood, city].filter(Boolean).join(" — ");
  return { neighborhood, city, displayLocation };
};

/** Normaliza cuidador: services, prices, minPrice e localização */
export function normalizeCaregiver(raw) {
  if (!raw) return null;

  const priceMap = getSvcPriceMap(raw);

  const services = {
    hospedagem: (raw?.services?.hospedagem ?? false) || (priceMap.hospedagem > 0),
    creche:     (raw?.services?.creche     ?? false) || (priceMap.creche     > 0),
    petSitter:  (raw?.services?.petSitter  ?? false) || (priceMap.petSitter  > 0),
    passeios:   (raw?.services?.passeios   ?? false) || (priceMap.passeios   > 0),
  };

  const legacy = toNum(raw?.price);
  const candidates = [
    priceMap.hospedagem, priceMap.creche, priceMap.petSitter, priceMap.passeios, legacy
  ].filter((v) => Number(v) > 0);
  const minPrice = candidates.length ? Math.min(...candidates) : null;

  const { neighborhood, city, displayLocation } = baseLocation(raw);

  return {
    ...raw,
    image: raw?.image || DEFAULT_IMG,
    prices: {
      hospedagemDia:   priceMap.hospedagem,
      crecheDiaria:    priceMap.creche,
      petSitterDiaria: priceMap.petSitter,
      passeiosHora:    priceMap.passeios,
    },
    services,
    minPrice,
    neighborhood,
    city,
    displayLocation,
  };
}

/** Normaliza tutor: remove ruídos e garante campos de localização/imagem */
export function normalizeTutor(raw) {
  if (!raw) return null;
  const { neighborhood, city, displayLocation } = baseLocation(raw);

  return {
    ...raw,
    image: raw?.image || DEFAULT_IMG,
    // tutores não têm serviços/preços/cursos
    services: undefined,
    prices: undefined,
    courses: undefined,
    neighborhood,
    city,
    displayLocation,
  };
}

/** Normaliza usuário por papel (tutor/caregiver/admin) */
export function normalizeUser(raw) {
  if (!raw) return null;
  if (raw.role === "caregiver") return normalizeCaregiver(raw);
  if (raw.role === "tutor") return normalizeTutor(raw);
  // admin: apenas imagem/location padrão
  const { neighborhood, city, displayLocation } = baseLocation(raw);
  return { ...raw, image: raw?.image || DEFAULT_IMG, neighborhood, city, displayLocation };
}
