// src/utils/date.js

// ------------------------------
// ✅ Formatos / validações
// ------------------------------
const pad2 = (n) => String(n).padStart(2, "0");

export const isLocalKey = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

export const isDateBR = (s) => /^\d{2}\/\d{2}\/\d{4}$/.test(String(s || ""));

// ✅ valida se uma localKey representa uma data real (ex: 2026-02-30 -> inválida)
export const isValidLocalKey = (key) => {
  if (!isLocalKey(key)) return false;
  const [y, m, d] = String(key).split("-").map(Number);
  if (!y || !m || !d) return false;

  const dt = new Date(y, m - 1, d);
  return (
    dt.getFullYear() === y &&
    dt.getMonth() === m - 1 &&
    dt.getDate() === d
  );
};

// ✅ valida DD/MM/AAAA como data real
export const isValidDateBR = (br) => {
  if (!isDateBR(br)) return false;
  const [d, m, y] = String(br).split("/").map(Number);
  if (!y || !m || !d) return false;

  const dt = new Date(y, m - 1, d);
  return (
    dt.getFullYear() === y &&
    dt.getMonth() === m - 1 &&
    dt.getDate() === d
  );
};

// ------------------------------
// ✅ Converters principais
// ------------------------------

// Formata AAAA-MM-DD para DD/MM/AAAA
export const formatDateBR = (dateStr) => {
  if (!dateStr) return "";
  const s = String(dateStr).slice(0, 10);
  if (!isLocalKey(s)) return "";
  const [y, m, d] = s.split("-").map(Number);
  if (!isValidLocalKey(s)) return "";
  return `${pad2(d)}/${pad2(m)}/${y}`;
};

// Converte Date para string local AAAA-MM-DD
export const toLocalKey = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
};

// Converte AAAA-MM-DD para objeto Date (meia-noite local)
export const parseLocalKey = (key) => {
  const s = String(key || "").slice(0, 10);
  if (!isLocalKey(s)) return new Date(NaN);
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

// ✅ Converte DD/MM/AAAA -> AAAA-MM-DD (retorna "" se inválida)
export const dateBRToLocalKey = (br) => {
  if (!br) return "";
  const s = String(br).trim();
  if (!isValidDateBR(s)) return "";
  const [d, m, y] = s.split("/").map(Number);
  return `${y}-${pad2(m)}-${pad2(d)}`;
};

// ✅ Converte AAAA-MM-DD -> DD/MM/AAAA (alias explícito)
export const localKeyToDateBR = (key) => formatDateBR(key);

// ------------------------------
// ✅ Máscara para input DD/MM/AAAA
// - você passa o valor digitado e ela devolve já formatado
// - não valida (apenas mascara). validação é com isValidDateBR.
// ------------------------------
export const maskDateBRInput = (raw) => {
  const digits = String(raw || "").replace(/\D+/g, "").slice(0, 8); // ddmmyyyy
  const dd = digits.slice(0, 2);
  const mm = digits.slice(2, 4);
  const yyyy = digits.slice(4, 8);

  if (digits.length <= 2) return dd;
  if (digits.length <= 4) return `${dd}/${mm}`;
  return `${dd}/${mm}/${yyyy}`;
};

// ------------------------------
// ✅ Helpers extras (mantidos/compat)
// ------------------------------

// Normaliza para meia-noite
export const normalizeDate = (d) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());

// Retorna número de dias inclusivo (10/10 a 12/10 = 3 diárias)
export const daysInclusive = (start, end) => {
  const a = normalizeDate(start);
  const b = normalizeDate(end);
  return Math.round((b - a) / (1000 * 60 * 60 * 24)) + 1;
};
