// src/pages/Profile.jsx
import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/ToastProvider";
import { authRequest } from "../services/api";

const DEFAULT_IMG = "/paw.png";
const DEFAULT_DAILY_CAPACITY = 15;

const EMPTY_SERVICES = {
  hospedagem: false,
  creche: false,
  petSitter: false,
  passeios: false,
};

const EMPTY_PRICES = {
  hospedagem: "",
  creche: "",
  petSitter: "",
  passeios: "",
};

// rótulos bonitinhos para exibição
const SERVICE_LABELS = {
  hospedagem: "Hospedagem",
  creche: "Creche",
  petSitter: "PetSitter",
  passeios: "Passeios",
};

const maskCep = (raw) => {
  const d = String(raw || "").replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
};

// aceita "10,50" e "10.50" e retorna string normalizada "10.50"
function normalizeMoneyString(v) {
  if (v == null) return "";
  const s = String(v).trim();
  if (!s) return "";
  const cleaned = s.replace(/[^\d.,]/g, "");
  if (!cleaned) return "";
  if (cleaned.includes(",") && cleaned.includes(".")) {
    const noThousands = cleaned.replace(/\./g, "");
    return noThousands.replace(",", ".");
  }
  if (cleaned.includes(",")) return cleaned.replace(",", ".");
  return cleaned;
}

function isDataUrlImage(v) {
  const s = String(v || "");
  return s.startsWith("data:image/") && s.includes(";base64,");
}

// ✅ Normalizador da galeria (snake_case/camelCase)
function normalizeGalleryPhoto(p, idx = 0) {
  if (!p || typeof p !== "object") return null;

  const id =
    p.id ??
    p.photo_id ??
    p.photoId ??
    p.storage_id ??
    p.storageId ??
    `${idx}-${String(p.photo_url || p.photoUrl || p.url || p.public_url || "")}`;

  const photo_url =
    p.photo_url ||
    p.photoUrl ||
    p.url ||
    p.public_url ||
    p.publicUrl ||
    p.publicURL ||
    p.signed_url ||
    p.signedUrl ||
    "";

  const caption = p.caption ?? p.legenda ?? p.title ?? p.descricao ?? "";

  return {
    ...p,
    id,
    photo_url,
    caption,
  };
}

const buildFormFromUser = (user) => {
  if (!user) {
    return {
      name: "",
      email: "",
      phone: "",
      address: "",
      city: "",
      neighborhood: "",
      cep: "",
      bio: "",
      image: "",
      currentPassword: "", // ✅ NOVO
      newPassword: "",
      services: { ...EMPTY_SERVICES },
      prices: { ...EMPTY_PRICES },
      daily_capacity: DEFAULT_DAILY_CAPACITY,
      courses: [],
      newCourse: "",
    };
  }

  const rawServices = user.services;
  const rawPrices = user.prices;

  const safeServices =
    rawServices && !Array.isArray(rawServices) && typeof rawServices === "object"
      ? rawServices
      : {};

  const safePrices =
    rawPrices && !Array.isArray(rawPrices) && typeof rawPrices === "object" ? rawPrices : {};

  const capNum = Number(user.daily_capacity ?? user.dailyCapacity ?? DEFAULT_DAILY_CAPACITY);

  return {
    name: user.name ?? "",
    email: user.email ?? "",
    phone: user.phone ?? "",
    address: user.address ?? "",
    city: user.city ?? "",
    neighborhood: user.neighborhood ?? "",
    cep: user.cep ?? "",
    bio: user.bio ?? "",
    image: user.image ?? "",
    currentPassword: "", // ✅ NOVO
    newPassword: "",
    services: { ...EMPTY_SERVICES, ...safeServices },
    prices: { ...EMPTY_PRICES, ...safePrices },
    daily_capacity: Number.isFinite(capNum) && capNum > 0 ? capNum : DEFAULT_DAILY_CAPACITY,
    courses: Array.isArray(user.courses) ? user.courses : [],
    newCourse: "",
  };
};

// média de reputação para o usuário logado
const getAvgRating = (mode, user, reservations) => {
  if (!user || !reservations.length) return null;

  if (mode === "tutor") {
    const ratings = reservations
      .filter((r) => String(r.tutorId) === String(user.id) && typeof r.caregiverRating === "number")
      .map((r) => r.caregiverRating);
    if (!ratings.length) return null;
    return (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1);
  }

  if (mode === "caregiver") {
    const ratings = reservations
      .filter((r) => String(r.caregiverId) === String(user.id) && typeof r.tutorRating === "number")
      .map((r) => r.tutorRating);
    if (!ratings.length) return null;
    return (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1);
  }

  return null;
};

// Modal simples de confirmação de senha (modo antigo, sem backend)
function ConfirmPasswordModal({ open, value, onChange, onCancel, onConfirm }) {
  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.form
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm();
        }}
      >
        <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-sm">
          <h2 className="text-lg font-semibold text-[#5A3A22] mb-3 text-center">
            Confirme sua senha
          </h2>
          <input
            type="password"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Digite sua senha atual"
            autoComplete="new-password"
            className="w-full border p-2 rounded-lg mb-4"
            autoFocus
          />
          <div className="flex justify-between">
            <button
              type="button"
              onClick={onCancel}
              className="bg-gray-300 hover:bg-gray-400 text-[#5A3A22] font-semibold px-4 py-2 rounded-lg w-[48%]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="bg-[#95301F] hover:bg-[#B25B38] text-white font-semibold px-4 py-2 rounded-lg w-[48%]"
            >
              Confirmar
            </button>
          </div>
        </div>
      </motion.form>
    </AnimatePresence>
  );
}

function isQuotaExceededError(err) {
  const msg = String(err?.message || err || "");
  return (
    err?.name === "QuotaExceededError" ||
    msg.toLowerCase().includes("quota") ||
    msg.toLowerCase().includes("exceeded")
  );
}

function isMobileSafari() {
  try {
    const ua = navigator.userAgent || "";
    const iOS = /iPad|iPhone|iPod/.test(ua);
    const safari = /^((?!chrome|crios|fxios|android).)*safari/i.test(ua);
    return iOS && safari;
  } catch {
    return false;
  }
}

function stripHeavyImageIfNeeded(u) {
  if (!u) return u;
  if (!isMobileSafari()) return u;

  const img = String(u.image || "");
  const isDataUrl = img.startsWith("data:");
  if (!isDataUrl) return u;

  if (img.length > 120000) {
    return { ...u, image: null };
  }
  return u;
}

export default function Profile() {
  const { user, setUser, token, activeMode, hasCaregiverProfile } = useAuth();
  const { showToast } = useToast();

  const [editing, setEditing] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [cepLoading, setCepLoading] = useState(false);
  const [form, setForm] = useState(buildFormFromUser(null));
  const [reservations, setReservations] = useState([]);

  // ✅ só para melhorar feedback no MOBILE (Safari)
  const [saving, setSaving] = useState(false);

  // =========================
  // ✅ Galeria do cuidador
  // =========================
  const [galleryPhotos, setGalleryPhotos] = useState([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);

  // label do input (pra ficar “Nenhum arquivo escolhido” bonitinho)
  const [galleryFileLabel, setGalleryFileLabel] = useState("Nenhum arquivo escolhido");

  // Lightbox (ver foto inteira)
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState(null);

  // Legenda por foto
  const [captionOpen, setCaptionOpen] = useState(false);
  const [captionSaving, setCaptionSaving] = useState(false);
  const [captionValue, setCaptionValue] = useState("");
  const [captionPhoto, setCaptionPhoto] = useState(null);

  const roleLower = String(user?.role || "").toLowerCase().trim();
  const isAdminMaster = roleLower === "admin_master";
  const canEditName = isAdminMaster;

  // ✅ MUITO importante: o Profile NÃO pode depender só do Dashboard para “virar cuidador”
  const showCaregiverArea =
    activeMode === "caregiver" || Boolean(hasCaregiverProfile) || roleLower === "caregiver";

  const isCaregiver = showCaregiverArea;
  const modeForAvg = isCaregiver ? "caregiver" : "tutor";

  // ao ter token, sempre buscar /users/me para trazer o usuário COMPLETO do backend
  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    const fetchMe = async () => {
      try {
        const data = await authRequest("/users/me", token);
        if (!cancelled && data?.user) {
          typeof setUser === "function" && setUser(data.user);
        }
      } catch (err) {
        console.error("Erro ao carregar /users/me:", err);
      }
    };

    fetchMe();
    return () => {
      cancelled = true;
    };
  }, [token, setUser]);

  // sincroniza form com user (qualquer mudança em `user`)
  useEffect(() => {
    if (user) {
      setForm(buildFormFromUser(user));
    }
  }, [user]);

  // carrega reservas para média
  useEffect(() => {
    const load = () => {
      const res = JSON.parse(localStorage.getItem("reservations")) || [];
      setReservations(res);
    };
    load();
    const onStorage = () => load();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const avgRating = useMemo(() => getAvgRating(modeForAvg, user, reservations), [
    modeForAvg,
    user,
    reservations,
  ]);

  const handleChange = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, image: reader.result || "" }));
    reader.readAsDataURL(file);
  };

  const toggleService = (key) =>
    setForm((f) => ({
      ...f,
      services: { ...f.services, [key]: !f.services[key] },
      prices: f.services?.[key] ? { ...f.prices, [key]: "" } : { ...f.prices },
    }));

  const addCourse = () => {
    const v = (form.newCourse || "").trim();
    if (!v) return;

    const exists = (form.courses || []).some((c) => c.toLowerCase() === v.toLowerCase());
    if (exists) {
      showToast("Esse curso já foi adicionado.", "notify");
      return;
    }

    setForm((f) => ({
      ...f,
      courses: [...(f.courses || []), v],
      newCourse: "",
    }));
  };

  const removeCourse = (i) =>
    setForm((f) => ({
      ...f,
      courses: f.courses.filter((_, idx) => idx !== i),
    }));

  // CEP -> ViaCEP
  const fetchByCep = async () => {
    const cepDigits = String(form.cep || "").replace(/\D/g, "");
    if (cepDigits.length !== 8) {
      showToast("CEP inválido. Use 8 dígitos.", "error");
      return;
    }
    try {
      setCepLoading(true);
      const resp = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`);
      const data = await resp.json();
      if (data?.erro) {
        showToast("CEP não encontrado.", "error");
        return;
      }
      setForm((f) => ({
        ...f,
        address: data.logradouro || f.address,
        neighborhood: data.bairro || f.neighborhood,
        city: data.localidade || f.city,
      }));
      showToast("Endereço preenchido pelo CEP ✨", "success");
    } catch (e) {
      console.error(e);
      showToast("Falha ao buscar CEP.", "error");
    } finally {
      setCepLoading(false);
    }
  };

  // Clique em "Salvar Alterações"
  const handleSaveClick = () => {
    if (saving) return;

    // Usuário já é do backend → salva direto
    if (token && !user?.password) {
      setPasswordConfirm("");
      confirmSave();
      return;
    }

    // Fluxo antigo (localStorage)
    setPasswordConfirm("");
    setShowConfirmModal(true);
  };

  // ===============================
  // ✅ Galeria: helpers (otimização automática)
  // ===============================
  const GALLERY_MAX_BYTES = 5.7 * 1024 * 1024; // alvo < 6MB
  const GALLERY_MAX_SIDE = 1600;
  const GALLERY_MIN_QUALITY = 0.62;
  const GALLERY_LIMIT = 12;

  function isAcceptedImage(file) {
    const t = String(file?.type || "").toLowerCase();
    return (
      t === "image/jpeg" ||
      t === "image/jpg" ||
      t === "image/png" ||
      t === "image/webp" ||
      t === "image/gif"
    );
  }

  function bytesFromDataUrl(dataUrl) {
    try {
      const s = String(dataUrl || "");
      const comma = s.indexOf(",");
      if (comma < 0) return 0;
      const b64 = s.slice(comma + 1);
      return Math.floor((b64.length * 3) / 4);
    } catch {
      return 0;
    }
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ""));
      r.onerror = () => reject(new Error("Falha ao ler arquivo."));
      r.readAsDataURL(file);
    });
  }

  function loadImageFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Falha ao carregar imagem."));
      img.src = dataUrl;
    });
  }

  function getTargetSize(w, h, maxSide) {
    if (!w || !h) return { w, h };
    const max = Math.max(w, h);
    if (max <= maxSide) return { w, h };
    const scale = maxSide / max;
    return { w: Math.round(w * scale), h: Math.round(h * scale) };
  }

  function canvasToDataUrl(canvas, mime, quality) {
    try {
      return canvas.toDataURL(mime, quality);
    } catch {
      return canvas.toDataURL(mime);
    }
  }

  function supportsWebp() {
    try {
      const c = document.createElement("canvas");
      const s = c.toDataURL("image/webp");
      return s.startsWith("data:image/webp");
    } catch {
      return false;
    }
  }

  async function compressImageDataUrl(inputDataUrl, opts = {}) {
    const { maxSide = GALLERY_MAX_SIDE, maxBytes = GALLERY_MAX_BYTES, preferWebp = true } = opts;

    // GIF: não recompressa (perde animação)
    if (String(inputDataUrl).startsWith("data:image/gif")) {
      const b = bytesFromDataUrl(inputDataUrl);
      if (b > maxBytes) {
        const e = new Error("GIF muito grande. Use um GIF menor.");
        e.code = "GIF_TOO_LARGE";
        throw e;
      }
      return inputDataUrl;
    }

    const img = await loadImageFromDataUrl(inputDataUrl);
    const { w, h } = getTargetSize(
      img.naturalWidth || img.width,
      img.naturalHeight || img.height,
      maxSide
    );

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d", { alpha: true });
    try {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
    } catch {
      // ignore
    }

    ctx.drawImage(img, 0, 0, w, h);

    const canWebp = preferWebp && supportsWebp();
    const mimePrimary = canWebp ? "image/webp" : "image/jpeg";
    const mimeFallback = "image/jpeg";

    let q = 0.86;
    let out = canvasToDataUrl(canvas, mimePrimary, q);

    while (bytesFromDataUrl(out) > maxBytes && q > GALLERY_MIN_QUALITY) {
      q = Math.max(GALLERY_MIN_QUALITY, q - 0.08);
      out = canvasToDataUrl(canvas, mimePrimary, q);
    }

    if (bytesFromDataUrl(out) > maxBytes && mimePrimary !== mimeFallback) {
      q = 0.84;
      out = canvasToDataUrl(canvas, mimeFallback, q);
      while (bytesFromDataUrl(out) > maxBytes && q > GALLERY_MIN_QUALITY) {
        q = Math.max(GALLERY_MIN_QUALITY, q - 0.08);
        out = canvasToDataUrl(canvas, mimeFallback, q);
      }
    }

    if (bytesFromDataUrl(out) > maxBytes) {
      const e = new Error("Não foi possível comprimir abaixo do limite.");
      e.code = "CANNOT_COMPRESS";
      throw e;
    }

    return out;
  }

  // ===============================
  // ✅ Galeria: API
  // ===============================
  async function loadGallery() {
    if (!token || !showCaregiverArea) return;
    setGalleryLoading(true);
    try {
      const data = await authRequest("/caregivers/me/photos", token);

      const raw = Array.isArray(data?.photos) ? data.photos : Array.isArray(data) ? data : [];

      const normalized = raw
        .map((p, idx) => normalizeGalleryPhoto(p, idx))
        .filter(Boolean)
        .filter((p) => p.photo_url);

      setGalleryPhotos(normalized);
    } catch (e) {
      console.error("Erro ao carregar galeria:", e);
    } finally {
      setGalleryLoading(false);
    }
  }

  async function handleDeleteGalleryPhoto(photoId) {
    if (!token || !showCaregiverArea) return;

    try {
      await authRequest(`/caregivers/me/photos/${photoId}`, token, { method: "DELETE" });
      setGalleryPhotos((prev) => prev.filter((p) => String(p.id) !== String(photoId)));
      showToast("Foto removida da galeria.", "success");
    } catch (err) {
      console.error("Erro ao remover foto:", err);
      showToast("Não foi possível remover a foto.", "error");
    }
  }

  function openLightbox(photo) {
    if (!photo?.photo_url) return;
    setLightboxPhoto(photo);
    setLightboxOpen(true);
  }

  function closeLightbox() {
    setLightboxOpen(false);
    setLightboxPhoto(null);
  }

  const openCaptionModal = (photo) => {
    if (!photo) return;
    setCaptionPhoto(photo);
    setCaptionValue(String(photo.caption || ""));
    setCaptionOpen(true);
  };

  const closeCaptionModal = () => {
    setCaptionOpen(false);
    setCaptionPhoto(null);
    setCaptionValue("");
  };

  async function savePhotoCaption(photoId, caption) {
    if (!token) {
      showToast("Faça login novamente para editar a legenda.", "error");
      return;
    }
    if (!photoId) return;

    setCaptionSaving(true);
    try {
      const resp = await authRequest(`/caregivers/me/photos/${photoId}`, token, {
        method: "PATCH",
        body: JSON.stringify({ caption: String(caption || "").trim() || null }),
      });

      const updated = resp?.photo ? normalizeGalleryPhoto(resp.photo, 0) : null;

      setGalleryPhotos((prev) =>
        (Array.isArray(prev) ? prev : []).map((p) => {
          if (String(p.id) !== String(photoId)) return p;
          const nextCaption = updated?.caption ?? (String(caption || "").trim() || "");
          return { ...p, caption: nextCaption };
        })
      );

      setLightboxPhoto((cur) => {
        if (!cur || String(cur.id) !== String(photoId)) return cur;
        const nextCaption = updated?.caption ?? (String(caption || "").trim() || "");
        return { ...cur, caption: nextCaption };
      });

      showToast("Legenda atualizada! ✅", "success");
      closeCaptionModal();
    } catch (err) {
      console.error("Erro ao salvar legenda:", err);
      showToast("Não foi possível salvar a legenda (backend).", "error");
    } finally {
      setCaptionSaving(false);
    }
  }

  // ✅ Upload (sem legenda em lote)
  async function handlePickGalleryFiles(files) {
    const list = Array.isArray(files) ? files : [];
    if (!list.length) return;

    if (!token) {
      showToast("Faça login novamente para enviar fotos.", "error");
      return;
    }
    if (!showCaregiverArea) {
      showToast("A galeria está disponível apenas para cuidadores.", "error");
      return;
    }

    const accepted = list.filter(isAcceptedImage);
    const rejected = list.filter((f) => !isAcceptedImage(f));

    if (rejected.length) {
      showToast(
        `Arquivos ignorados (formato não suportado): ${rejected.map((f) => f.name).join(", ")}`,
        "error"
      );
    }

    const currentCount = Array.isArray(galleryPhotos) ? galleryPhotos.length : 0;
    const freeSlots = Math.max(0, GALLERY_LIMIT - currentCount);

    if (freeSlots <= 0) {
      showToast(`Você já atingiu o limite de ${GALLERY_LIMIT} fotos na galeria.`, "notify");
      return;
    }

    const limited = accepted.slice(0, freeSlots);

    setGalleryUploading(true);
    showToast(
      limited.length === 1
        ? "Preparando upload de 1 foto..."
        : `Preparando upload de ${limited.length} fotos...`,
      "notify"
    );

    const prepared = [];
    for (const file of limited) {
      try {
        const rawDataUrl = await fileToDataUrl(file);
        const dataUrl = await compressImageDataUrl(rawDataUrl, {
          maxSide: GALLERY_MAX_SIDE,
          maxBytes: GALLERY_MAX_BYTES,
          preferWebp: true,
        });

        prepared.push({
          name: file.name,
          dataUrl,
        });
      } catch (err) {
        const msg =
          err?.code === "GIF_TOO_LARGE"
            ? `"${file.name}" é um GIF grande demais.`
            : err?.code === "CANNOT_COMPRESS"
            ? `"${file.name}" é grande demais. Tente uma imagem um pouco menor.`
            : `"${file.name}" não pôde ser processada.`;

        showToast(msg, "error");
        console.warn("[Profile] falha ao processar imagem:", file?.name, err);
      }
    }

    if (!prepared.length) {
      setGalleryUploading(false);
      return;
    }

    try {
      const payload = {
        photos: prepared.map((p) => ({
          filename: p.name,
          dataUrl: p.dataUrl,
        })),
      };

      const resp = await authRequest("/caregivers/me/photos", token, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const results = Array.isArray(resp?.results) ? resp.results : [];
      const okOnes = results.filter((r) => r && r.ok && r.photo);
      const badOnes = results.filter((r) => r && !r.ok);

      if (okOnes.length) {
        const newOnes = okOnes
          .map((r, idx) => normalizeGalleryPhoto(r.photo, idx))
          .filter(Boolean)
          .filter((p) => p.photo_url);

        setGalleryPhotos((prev) => {
          const cur = Array.isArray(prev) ? prev : [];
          const next = [...newOnes, ...cur];

          const seen = new Set();
          const unique = [];
          for (const it of next) {
            const k = String(it.id);
            if (seen.has(k)) continue;
            seen.add(k);
            unique.push(it);
          }
          return unique.slice(0, GALLERY_LIMIT);
        });

        showToast(
          newOnes.length === 1 ? "Foto enviada com sucesso!" : `${newOnes.length} fotos enviadas!`,
          "success"
        );
      }

      if (badOnes.length) {
        const first = badOnes[0];
        const details = String(first?.details || first?.message || first?.error || "").trim();
        showToast(
          details ? `Falha ao enviar algumas fotos: ${details}` : "Falha ao enviar algumas fotos.",
          "error"
        );
      }

      setGalleryFileLabel("Nenhum arquivo escolhido");
    } catch (err) {
      console.error("[Profile] upload gallery falhou:", err);
      const msg =
        String(err?.message || "").toLowerCase().includes("fetch failed")
          ? "UPLOAD_FAILED — o servidor não conseguiu enviar ao Storage."
          : err?.message || "Não foi possível enviar as fotos. Tente novamente.";

      showToast(msg, "error");
    } finally {
      setGalleryUploading(false);
    }
  }

  // handler do input file (custom)
  const onGalleryFilesChange = async (e) => {
    const files = Array.from(e?.target?.files || []);
    if (!files.length) return;

    // label bonitinho
    setGalleryFileLabel(files.length === 1 ? files[0].name : `${files.length} arquivos selecionados`);

    // permite selecionar o mesmo arquivo novamente
    try {
      e.target.value = "";
    } catch {
      // ignore
    }

    await handlePickGalleryFiles(files);
  };

  // carrega galeria ao entrar no Perfil (se for cuidador)
  useEffect(() => {
    if (!token || !showCaregiverArea) return;
    loadGallery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, showCaregiverArea]);

  // Salvar perfil (backend + fallback localStorage)
  const confirmSave = async () => {
    if (!user) return;
    if (saving) return;

    setSaving(true);

    try {
      // Modo antigo: valida senha local se não há backend
      if (!token && user?.password) {
        if (passwordConfirm !== user.password) {
          showToast("Senha incorreta. Alterações não salvas.", "error");
          setPasswordConfirm("");
          return;
        }
      }

      // sempre ignora email (nunca muda)
      const {
        currentPassword, // ✅ ignora no PATCH /users/me
        newPassword,
        newCourse,
        email: _ignoredEmail,
        ...restForm
      } = form;

      // Se temos backend (token) → envia PATCH /users/me
      if (token) {
        // ✅ se for cuidador e a imagem for base64, sobe no backend e salva URL
        let uploadedPhotoUrl = null;

        if (showCaregiverArea && isDataUrlImage(restForm.image)) {
          try {
            const photoResp = await authRequest("/caregivers/me/photo", token, {
              method: "PATCH",
              body: JSON.stringify({ image: restForm.image }),
            });

            uploadedPhotoUrl = photoResp?.photo_url || photoResp?.photoUrl || photoResp?.url || null;

            if (!uploadedPhotoUrl) {
              showToast("Não foi possível salvar a foto. Tente novamente.", "error");
              return;
            }

            setForm((f) => ({ ...f, image: uploadedPhotoUrl }));
          } catch (err) {
            console.error("Erro ao subir foto do cuidador:", err);
            showToast("Erro ao salvar a foto. Tente novamente.", "error");
            return;
          }
        }

        const finalImageValue = uploadedPhotoUrl ? uploadedPhotoUrl : restForm.image || null;

        const payload = {
          phone: restForm.phone || null,
          address: restForm.address || null,
          city: restForm.city || null,
          neighborhood: restForm.neighborhood || null,
          cep: restForm.cep || null,
          bio: restForm.bio || null,
          image: finalImageValue,
        };

        if (canEditName) {
          payload.name = String(restForm.name || "").trim() || null;
        }

        if (showCaregiverArea) {
          const cleanServices = {};
          for (const key of Object.keys(restForm.services || {})) {
            if (restForm.services[key]) cleanServices[key] = true;
          }

          const cleanPrices = {};
          for (const key of Object.keys(restForm.prices || {})) {
            const raw = restForm.prices[key];
            const norm = normalizeMoneyString(raw);
            if (!norm) continue;

            const n = Number(norm);
            if (Number.isFinite(n) && n >= 0) cleanPrices[key] = String(norm);
          }

          const cap = Number(restForm.daily_capacity);
          payload.daily_capacity =
            Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : DEFAULT_DAILY_CAPACITY;

          payload.services = cleanServices;
          payload.prices = cleanPrices;
          payload.courses = Array.isArray(restForm.courses) ? restForm.courses : [];
        }

        const data = await authRequest("/users/me", token, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });

        const backendUser = data?.user
          ? data.user
          : {
              ...user,
              ...restForm,
              email: user.email,
              name: canEditName ? restForm.name : user.name,
            };

        const finalUser = uploadedPhotoUrl ? { ...backendUser, image: uploadedPhotoUrl } : backendUser;

        typeof setUser === "function" && setUser(finalUser);

        try {
          const safeForStorage = stripHeavyImageIfNeeded(finalUser);

          const users = JSON.parse(localStorage.getItem("users")) || [];
          const updatedList = users.some((u) => u.id === safeForStorage.id)
            ? users.map((u) => (u.id === safeForStorage.id ? safeForStorage : u))
            : [...users, safeForStorage];

          localStorage.setItem("users", JSON.stringify(updatedList));
          localStorage.setItem("currentUser", JSON.stringify(safeForStorage));
          window.dispatchEvent(new Event("users-updated"));
        } catch (lsErr) {
          console.warn("[Profile] localStorage falhou:", lsErr);

          if (isQuotaExceededError(lsErr)) {
            try {
              const safeNoImage = { ...finalUser, image: null };
              localStorage.setItem("currentUser", JSON.stringify(safeNoImage));
            } catch {
              // ignore
            }
          }
        }

        showToast("Perfil atualizado com sucesso! 🐾", "success");
        setEditing(false);
        setShowPasswordChange(false);
        setShowConfirmModal(false);
        setPasswordConfirm("");

        // ✅ limpa campos de senha no form (não muda nada do perfil)
        setForm((f) => ({ ...f, currentPassword: "", newPassword: "" }));

        return;
      }

      // --------- Fluxo antigo: somente localStorage ---------
      const updatedUser = {
        ...user,
        ...restForm,
        email: user.email,
        name: canEditName ? restForm.name : user.name,
        password: newPassword || user.password,
      };

      try {
        const users = JSON.parse(localStorage.getItem("users")) || [];
        const updatedList = users.some((u) => u.id === user.id)
          ? users.map((u) => (u.id === user.id ? updatedUser : u))
          : [...users, updatedUser];

        localStorage.setItem("users", JSON.stringify(updatedList));
        localStorage.setItem("currentUser", JSON.stringify(updatedUser));
        typeof setUser === "function" && setUser(updatedUser);
        window.dispatchEvent(new Event("users-updated"));

        showToast("Perfil atualizado com sucesso! 🐾", "success");
        setEditing(false);
        setShowPasswordChange(false);
        setShowConfirmModal(false);
        setPasswordConfirm("");
      } catch (e) {
        console.error(e);

        if (isQuotaExceededError(e)) {
          showToast("Alterações salvas, mas seu navegador está sem espaço para cache. ✅", "notify");
          setEditing(false);
          setShowPasswordChange(false);
          setShowConfirmModal(false);
          setPasswordConfirm("");
          return;
        }

        showToast("Erro ao salvar perfil.", "error");
      }
    } catch (e) {
      console.error("Erro ao atualizar perfil no servidor:", e);
      showToast("Erro ao salvar perfil no servidor.", "error");
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    if (!user) return;
    setEditing(false);
    setShowPasswordChange(false);
    setForm((f) => ({ ...f, currentPassword: "", newPassword: "" })); // ✅ limpa
    setForm(buildFormFromUser(user));
  };

  if (!user) {
    return (
      <div className="bg-[#EBCBA9] min-h-[calc(100vh-120px)] flex items-center justify-center">
        <p className="text-lg font-semibold text-[#5A3A22]">
          Faça login para acessar seu perfil na{" "}
          <span className="text-[#5A3A22]">Pelo</span>
          <span className="text-yellow-400">Caramelo</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#EBCBA9] min-h-[calc(100vh-120px)] py-6">
      <div className="max-w-[1400px] mx-auto bg-white rounded-2xl shadow p-6 border-l-4 border-[#FFD700]/80">
        <ConfirmPasswordModal
          open={showConfirmModal}
          value={passwordConfirm}
          onChange={setPasswordConfirm}
          onCancel={() => {
            setShowConfirmModal(false);
            setPasswordConfirm("");
          }}
          onConfirm={confirmSave}
        />

        {/* ✅ Lightbox (ver foto inteira) */}
        {lightboxOpen && lightboxPhoto ? (
          <div
            className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4"
            onClick={() => {
              setLightboxOpen(false);
              setLightboxPhoto(null);
            }}
          >
            <div
              className="bg-white w-full max-w-5xl rounded-2xl shadow-lg overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <div className="text-sm text-[#5A3A22] font-semibold truncate">
                  {lightboxPhoto.caption ? lightboxPhoto.caption : "Foto da galeria"}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCaptionPhoto(lightboxPhoto);
                      setCaptionValue(String(lightboxPhoto.caption || ""));
                      setCaptionOpen(true);
                    }}
                    className="hidden sm:inline-flex bg-[#FFD700] hover:bg-yellow-400 text-[#5A3A22] font-semibold px-3 py-1 rounded-lg"
                  >
                    Editar legenda
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLightboxOpen(false);
                      setLightboxPhoto(null);
                    }}
                    className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-[#5A3A22] font-bold flex items-center justify-center"
                    aria-label="Fechar"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="bg-black">
                <img
                  src={lightboxPhoto.photo_url}
                  alt={lightboxPhoto.caption || "foto"}
                  className="w-full max-h-[75vh] object-contain"
                />
              </div>

              {lightboxPhoto.caption ? (
                <div className="px-4 py-3 text-sm text-[#5A3A22]/80">{lightboxPhoto.caption}</div>
              ) : (
                <div className="px-4 py-3 text-xs text-[#5A3A22]/60">
                  Sem legenda. Você pode adicionar clicando em “Editar legenda”.
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* ✅ Modal: editar legenda por foto */}
        {captionOpen && captionPhoto ? (
          <div
            className="fixed inset-0 z-[65] bg-black/60 flex items-center justify-center p-4"
            onClick={() => {
              setCaptionOpen(false);
              setCaptionPhoto(null);
              setCaptionValue("");
            }}
          >
            <div
              className="bg-white w-full max-w-lg rounded-2xl shadow-lg p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-[#5A3A22]">Editar legenda</h3>
                <button
                  type="button"
                  onClick={() => {
                    setCaptionOpen(false);
                    setCaptionPhoto(null);
                    setCaptionValue("");
                  }}
                  className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-[#5A3A22] font-bold flex items-center justify-center"
                  aria-label="Fechar"
                >
                  ×
                </button>
              </div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl overflow-hidden border bg-[#f6f1e8]">
                  <img
                    src={captionPhoto.photo_url}
                    alt={captionPhoto.caption || "foto"}
                    className="w-full aspect-[4/3] object-cover"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-[#5A3A22]">Legenda</label>
                  <input
                    value={captionValue}
                    onChange={(e) => setCaptionValue(e.target.value)}
                    placeholder="Ex: Brincando, passeio, ambiente..."
                    maxLength={140}
                    className="w-full border p-2 rounded-lg"
                    autoFocus
                  />
                  <p className="text-[11px] text-[#5A3A22]/70 leading-snug">
                    Até 140 caracteres. Deixe em branco para remover a legenda.
                  </p>

                  <div className="mt-auto flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCaptionOpen(false);
                        setCaptionPhoto(null);
                        setCaptionValue("");
                      }}
                      className="w-full bg-gray-200 hover:bg-gray-300 text-[#5A3A22] font-semibold px-3 py-2 rounded-lg"
                      disabled={captionSaving}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!token) {
                          showToast("Faça login novamente para editar a legenda.", "error");
                          return;
                        }
                        if (!captionPhoto?.id) return;

                        setCaptionSaving(true);
                        try {
                          const resp = await authRequest(`/caregivers/me/photos/${captionPhoto.id}`, token, {
                            method: "PATCH",
                            body: JSON.stringify({
                              caption: String(captionValue || "").trim() || null,
                            }),
                          });

                          const updated = resp?.photo ? normalizeGalleryPhoto(resp.photo, 0) : null;

                          setGalleryPhotos((prev) =>
                            (Array.isArray(prev) ? prev : []).map((p) => {
                              if (String(p.id) !== String(captionPhoto.id)) return p;
                              const nextCaption =
                                updated?.caption ?? (String(captionValue || "").trim() || "");
                              return { ...p, caption: nextCaption };
                            })
                          );

                          setLightboxPhoto((cur) => {
                            if (!cur || String(cur.id) !== String(captionPhoto.id)) return cur;
                            const nextCaption =
                              updated?.caption ?? (String(captionValue || "").trim() || "");
                            return { ...cur, caption: nextCaption };
                          });

                          showToast("Legenda atualizada! ✅", "success");
                          setCaptionOpen(false);
                          setCaptionPhoto(null);
                          setCaptionValue("");
                        } catch (err) {
                          console.error("Erro ao salvar legenda:", err);
                          showToast("Não foi possível salvar a legenda (backend).", "error");
                        } finally {
                          setCaptionSaving(false);
                        }
                      }}
                      className={`w-full bg-[#5A3A22] hover:bg-[#95301F] text-white font-semibold px-3 py-2 rounded-lg ${
                        captionSaving ? "opacity-70 cursor-wait" : ""
                      }`}
                      disabled={captionSaving}
                    >
                      {captionSaving ? "Salvando..." : "Salvar"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* VISUALIZAÇÃO */}
        {!editing ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-[#5A3A22]">
              {/* Coluna esquerda */}
              <div className="md:col-span-1 flex flex-col items-center gap-2">
                <img
                  src={form.image || DEFAULT_IMG}
                  alt="foto"
                  className="w-28 h-28 rounded-full object-cover border-4 border-[#FFD700]"
                />
                <p className="text-lg font-semibold flex items-center gap-2">
                  <span>{form.name}</span>
                  {avgRating && <span className="text-sm font-normal text-[#5A3A22]">⭐ {avgRating}</span>}
                </p>
                <p className="text-sm opacity-90">{form.email}</p>
                {form.bio && <p className="text-sm mt-2 text-center whitespace-pre-line">{form.bio}</p>}
                <button
                  onClick={() => setEditing(true)}
                  className="mt-3 w-full bg-[#95301F] hover:bg-[#B25B38] text-white py-2 rounded-lg font-semibold"
                >
                  Editar Perfil
                </button>
              </div>

              {/* Coluna meio */}
              <div className="md:col-span-1 space-y-2">
                <h3 className="font-semibold">Localização</h3>
                {form.neighborhood && <p>Bairro: {form.neighborhood}</p>}
                {form.city && <p>Cidade: {form.city}</p>}
                <p className="text-sm opacity-75">(Endereço completo só é exibido após reserva confirmada.)</p>

                {isCaregiver && (
                  <>
                    <h3 className="font-semibold mt-4">Cursos</h3>
                    {form.courses?.length ? (
                      <ul className="list-disc pl-5 text-sm">
                        {form.courses.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm">Nenhum curso cadastrado.</p>
                    )}

                    <h3 className="font-semibold mt-4">Capacidade diária</h3>
                    <p className="text-sm">
                      {Number(form.daily_capacity) || DEFAULT_DAILY_CAPACITY} reserva(s) por dia
                    </p>
                  </>
                )}
              </div>

              {/* Coluna direita */}
              {isCaregiver && (
                <div className="md:col-span-1">
                  <h3 className="font-semibold">Serviços</h3>
                  <ul className="list-disc pl-5 text-sm">
                    {Object.keys(EMPTY_SERVICES).filter((k) => form.services?.[k]).length ? (
                      Object.keys(EMPTY_SERVICES)
                        .filter((k) => form.services?.[k])
                        .map((k) => (
                          <li key={k}>
                            {SERVICE_LABELS[k] || k} —{" "}
                            {form.prices?.[k] !== "" && form.prices?.[k] != null
                              ? `R$ ${Number(normalizeMoneyString(form.prices[k]) || 0).toFixed(2)}`
                              : "sem preço"}
                          </li>
                        ))
                    ) : (
                      <li className="opacity-70">Nenhum serviço ativo.</li>
                    )}
                  </ul>
                </div>
              )}
            </div>

            {/* ✅ Galeria FORA do grid */}
            {isCaregiver && (
              <div className="mt-6 border rounded-2xl p-4 bg-[#FFF8F0]">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h3 className="font-semibold text-[#5A3A22]">Galeria de fotos</h3>
                  {galleryLoading ? (
                    <span className="text-sm text-[#5A3A22]/70">Carregando...</span>
                  ) : (
                    <span className="text-sm text-[#5A3A22]/70">{galleryPhotos.length} foto(s)</span>
                  )}
                </div>

                {!galleryPhotos.length && !galleryLoading ? (
                  <p className="text-sm text-[#5A3A22]/80 mt-2">Você ainda não adicionou fotos na sua galeria.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-3">
                    {galleryPhotos.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          if (!p?.photo_url) return;
                          setLightboxPhoto(p);
                          setLightboxOpen(true);
                        }}
                        className="rounded-xl overflow-hidden border bg-white text-left hover:shadow-md transition"
                        title="Clique para ver a foto inteira"
                      >
                        <div className="w-full aspect-[4/3] bg-[#f3efe8]">
                          <img
                            src={p.photo_url}
                            alt={p.caption || "foto da galeria"}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="p-2">
                          <div className="text-xs text-[#5A3A22]/80 line-clamp-2 min-h-[32px]">
                            {p.caption ? p.caption : <span className="opacity-60">Sem legenda</span>}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                <p className="text-xs text-[#5A3A22]/70 mt-3">
                  Para adicionar/remover fotos, clique em <b>Editar Perfil</b>.
                </p>
              </div>
            )}
          </>
        ) : (
          // EDIÇÃO
          <div className="space-y-6 text-[#5A3A22]">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* FOTO */}
              <div className="flex flex-col items-center gap-3 bg-[#FFF8F0] rounded-2xl p-4 shadow-sm">
                <label htmlFor="img" className="cursor-pointer">
                  <div className="w-32 h-32 md:w-40 md:h-40 rounded-full overflow-hidden border-4 border-[#FFD700] shadow">
                    <img
                      src={form.image || DEFAULT_IMG}
                      alt="foto"
                      className="w-full h-full object-cover hover:opacity-90 transition"
                    />
                  </div>
                </label>
                <input id="img" type="file" accept="image/*" className="hidden" onChange={handleImage} />
                <p className="text-xs text-center text-[#5A3A22]/80">
                  Essa é a foto que aparece no seu perfil para outros usuários.
                </p>
                <label
                  htmlFor="img"
                  className="inline-flex items-center px-4 py-2 rounded-lg bg-[#5A3A22] hover:bg-[#95301F] text-white text-sm font-semibold cursor-pointer shadow-md transition"
                >
                  Alterar foto
                </label>
              </div>

              {/* CAMPOS */}
              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <input
                    value={form.name}
                    onChange={(e) => canEditName && handleChange("name", e.target.value)}
                    readOnly={!canEditName}
                    className={`w-full border p-2 rounded-lg ${
                      canEditName ? "bg-white" : "bg-gray-100 text-gray-700 cursor-not-allowed"
                    }`}
                    placeholder="Nome completo"
                    aria-readonly={!canEditName ? "true" : "false"}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {canEditName ? "Você é admin master: pode alterar o nome." : "Apenas o admin master pode alterar o nome."}
                  </p>
                </div>

                <div>
                  <input
                    value={form.email}
                    readOnly
                    className="w-full border p-2 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
                    placeholder="E-mail"
                    aria-readonly="true"
                  />
                  <p className="text-xs text-gray-500 mt-1">O e-mail de acesso não pode ser alterado aqui.</p>
                </div>

                <input
                  value={form.phone}
                  onChange={(e) => handleChange("phone", e.target.value)}
                  placeholder="Telefone"
                  className="w-full border p-2 rounded-lg"
                />

                <div className="flex gap-2">
                  <input
                    value={maskCep(form.cep)}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
                      handleChange("cep", digits);
                    }}
                    onBlur={fetchByCep}
                    placeholder="CEP (00000-000)"
                    className="w-full border p-2 rounded-lg"
                    inputMode="numeric"
                  />
                  <button
                    type="button"
                    onClick={fetchByCep}
                    disabled={cepLoading}
                    className={`whitespace-nowrap px-3 rounded-lg font-semibold ${
                      cepLoading ? "bg-yellow-300 cursor-wait" : "bg-[#FFD700] hover:bg-yellow-400"
                    } text-[#5A3A22]`}
                  >
                    {cepLoading ? "Buscando..." : "Buscar CEP"}
                  </button>
                </div>

                <input
                  value={form.neighborhood}
                  onChange={(e) => handleChange("neighborhood", e.target.value)}
                  placeholder="Bairro"
                  className="w-full border p-2 rounded-lg"
                />
                <input
                  value={form.city}
                  onChange={(e) => handleChange("city", e.target.value)}
                  placeholder="Cidade"
                  className="w-full border p-2 rounded-lg"
                />
                <input
                  value={form.address}
                  onChange={(e) => handleChange("address", e.target.value)}
                  placeholder="Endereço (oculto até reserva)"
                  className="md:col-span-2 w-full border p-2 rounded-lg"
                />
                <textarea
                  value={form.bio}
                  onChange={(e) => handleChange("bio", e.target.value)}
                  placeholder="Sobre mim"
                  className="md:col-span-2 w-full border p-2 rounded-lg"
                />
              </div>
            </div>

            {/* Serviços + cursos (cuidador) */}
            {showCaregiverArea && (
              <>
                <div className="border rounded-lg p-4 bg-[#FFF6CC]/50">
                  <h3 className="font-semibold mb-2 text-[#5A3A22]">Serviços, Preços e Capacidade</h3>

                  <div className="mb-4">
                    <label className="block font-semibold mb-1">Quantas reservas por dia você aceita?</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={form.daily_capacity}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        handleChange(
                          "daily_capacity",
                          Number.isFinite(v) && v > 0 ? Math.floor(v) : DEFAULT_DAILY_CAPACITY
                        );
                      }}
                      className="w-full max-w-[280px] border p-2 rounded-lg"
                    />
                    <p className="text-xs text-[#5A3A22]/70 mt-1">Isso ajuda a limitar sua agenda automaticamente.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Object.keys(EMPTY_SERVICES).map((key) => (
                      <div key={key} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={Boolean(form.services?.[key])}
                          onChange={() => toggleService(key)}
                        />
                        <span className="capitalize">{SERVICE_LABELS[key] || key}</span>

                        {form.services?.[key] && (
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="Preço (R$)"
                            value={form.prices?.[key] ?? ""}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                prices: { ...(f.prices || {}), [key]: e.target.value },
                              }))
                            }
                            className="ml-auto border rounded p-2 w-40"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex gap-2 mb-2">
                    <input
                      value={form.newCourse}
                      onChange={(e) => handleChange("newCourse", e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addCourse();
                        }
                      }}
                      placeholder="Novo curso (clique + ou Enter para adicionar)"
                      className="flex-1 border p-2 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={addCourse}
                      className="bg-[#95301F] hover:bg-[#B25B38] text-white px-3 rounded-lg"
                    >
                      +
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {form.courses.map((c, i) => (
                      <span
                        key={i}
                        className="bg-[#FFF6CC] px-3 py-1 rounded-full flex items-center gap-2"
                      >
                        {c}
                        <button type="button" onClick={() => removeCourse(i)} className="text-[#95301F]">
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ✅ Galeria na edição */}
            {showCaregiverArea && (
              <div className="border rounded-2xl p-4 bg-[#FFF8F0]">
                <h3 className="font-semibold mb-2 text-[#5A3A22]">Galeria de fotos</h3>

                {/* ✅ Upload (botão no padrão + label compacta) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:items-end">
                  <div className="md:col-span-3">
                    <label className="block text-sm font-semibold mb-1">Adicionar fotos</label>

                    <div className="flex items-center gap-2">
                      <input
                        id="galleryFiles"
                        type="file"
                        accept="image/*"
                        multiple
                        disabled={galleryUploading}
                        onChange={onGalleryFilesChange}
                        className="hidden"
                      />

                      <label
                        htmlFor="galleryFiles"
                        className={`inline-flex items-center justify-center px-4 py-2 rounded-lg font-semibold shadow-md transition cursor-pointer select-none
                          ${
                            galleryUploading
                              ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                              : "bg-[#5A3A22] hover:bg-[#95301F] text-white"
                          }`}
                        title="Escolher arquivos"
                        aria-disabled={galleryUploading ? "true" : "false"}
                      >
                        Escolher Arquivos
                      </label>

                      <span className="text-sm text-[#5A3A22]/80 truncate" title={galleryFileLabel}>
                        {galleryFileLabel}
                      </span>
                    </div>

                    <p className="text-[11px] leading-snug text-[#5A3A22]/70 mt-1">
                      Limite: {GALLERY_LIMIT} fotos • alvo: ~6MB por foto.
                      <br />
                      A legenda é adicionada por foto (botão <b>Legenda</b>).
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-[#5A3A22]">Minhas fotos</p>
                    {galleryLoading ? <span className="text-xs text-[#5A3A22]/70">Carregando...</span> : null}
                  </div>

                  {!galleryPhotos.length && !galleryLoading ? (
                    <p className="text-sm text-[#5A3A22]/80 mt-2">Nenhuma foto na galeria ainda.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-3">
                      {galleryPhotos.map((p) => (
                        <div key={p.id} className="rounded-xl overflow-hidden border bg-white">
                          <button
                            type="button"
                            onClick={() => {
                              if (!p?.photo_url) return;
                              setLightboxPhoto(p);
                              setLightboxOpen(true);
                            }}
                            className="block w-full text-left"
                            title="Clique para ver a foto inteira"
                          >
                            <div className="w-full aspect-[4/3] bg-[#f3efe8]">
                              <img
                                src={p.photo_url}
                                alt={p.caption || "foto da galeria"}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          </button>

                          <div className="p-2">
                            <div className="text-xs text-[#5A3A22]/80 line-clamp-2 min-h-[32px]">
                              {p.caption ? p.caption : <span className="opacity-60">Sem legenda</span>}
                            </div>

                            <div className="mt-2 flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setCaptionPhoto(p);
                                  setCaptionValue(String(p.caption || ""));
                                  setCaptionOpen(true);
                                }}
                                className="text-xs font-semibold bg-[#FFD700] hover:bg-yellow-400 text-[#5A3A22] px-2 py-1 rounded"
                                title="Editar legenda"
                              >
                                Legenda
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteGalleryPhoto(p.id)}
                                className="text-xs font-semibold text-white bg-[#95301F] hover:bg-[#B25B38] px-2 py-1 rounded"
                              >
                                Excluir
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {galleryUploading ? <p className="text-sm text-[#5A3A22]/80 mt-3">Enviando fotos...</p> : null}
                </div>
              </div>
            )}

            {/* ✅ Troca de senha (backend) */}
            <div>
              {!showPasswordChange ? (
                <button
                  type="button"
                  onClick={() => setShowPasswordChange(true)}
                  className="bg-[#FFD700] hover:bg-yellow-400 text-[#5A3A22] px-3 py-1 rounded-lg font-semibold"
                >
                  Trocar Senha
                </button>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    type="password"
                    value={form.currentPassword}
                    onChange={(e) => handleChange("currentPassword", e.target.value)}
                    placeholder="Senha atual"
                    autoComplete="current-password"
                    className="w-full border p-2 rounded-lg"
                  />
                  <input
                    type="password"
                    value={form.newPassword}
                    onChange={(e) => handleChange("newPassword", e.target.value)}
                    placeholder="Nova senha (mín. 8 caracteres)"
                    autoComplete="new-password"
                    className="w-full border p-2 rounded-lg"
                  />

                  <button
                    type="button"
                    onClick={async () => {
                      if (!token) {
                        showToast("Faça login novamente para trocar a senha.", "error");
                        return;
                      }

                      const cur = String(form.currentPassword || "");
                      const nxt = String(form.newPassword || "");

                      if (!cur || !nxt) {
                        showToast("Preencha a senha atual e a nova senha.", "error");
                        return;
                      }
                      if (nxt.length < 8) {
                        showToast("A nova senha deve ter no mínimo 8 caracteres.", "error");
                        return;
                      }

                      try {
                        await authRequest("/users/me/password", token, {
                          method: "PUT",
                          body: JSON.stringify({
                            currentPassword: cur,
                            newPassword: nxt,
                          }),
                        });

                        showToast("Senha atualizada com sucesso! ✅", "success");

                        setForm((f) => ({ ...f, currentPassword: "", newPassword: "" }));
                        setShowPasswordChange(false);
                      } catch (err) {
                        console.error("Erro ao trocar senha:", err);
                        const msg = err?.message || "Não foi possível trocar a senha.";
                        showToast(msg, "error");
                      }
                    }}
                    className="md:col-span-2 bg-[#5A3A22] hover:bg-[#95301F] text-white font-semibold px-4 py-2 rounded-lg"
                  >
                    Salvar nova senha
                  </button>
                </div>
              )}
            </div>

            {/* Botões Salvar / Cancelar */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleSaveClick}
                disabled={saving}
                className={`bg-[#5A3A22] hover:bg-[#7b5233] text-white px-4 py-2 rounded-lg w-full ${
                  saving ? "opacity-70 cursor-wait" : ""
                }`}
              >
                <span className="md:hidden">{saving ? "Salvando..." : "Salvar Alterações"}</span>
                <span className="hidden md:inline">Salvar Alterações</span>
              </button>

              <button
                type="button"
                onClick={cancelEdit}
                disabled={saving}
                className={`bg-gray-300 hover:bg-gray-400 text-[#5A3A22] px-4 py-2 rounded-lg w-full ${
                  saving ? "opacity-70 cursor-not-allowed" : ""
                }`}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}