// Formata AAAA-MM-DD para DD/MM/AAAA
export const formatDateBR = (dateStr) => {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
};

// Converte Date para string local AAAA-MM-DD
export const toLocalKey = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

// Converte AAAA-MM-DD para objeto Date
export const parseLocalKey = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};

// Normaliza para meia-noite
export const normalizeDate = (d) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());

// Retorna número de dias inclusivo (10/10 a 12/10 = 3 diárias)
export const daysInclusive = (start, end) => {
  const a = normalizeDate(start);
  const b = normalizeDate(end);
  return Math.round((b - a) / (1000 * 60 * 60 * 24)) + 1;
};
