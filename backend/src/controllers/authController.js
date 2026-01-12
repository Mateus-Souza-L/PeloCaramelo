// backend/src/controllers/authController.js
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const {
  createUser,
  findUserByEmail,
  findUserById,
} = require("../models/userModel");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-trocar-em-producao";

function generateToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readBody(req) {
  // Se vier JSON normal, req.body já é objeto
  if (req.body && typeof req.body === "object") return req.body;

  // Se vier text/plain, req.body vira string por causa do express.text()
  if (typeof req.body === "string") {
    const s = req.body.trim();

    // casos clássicos de bug no front: body: {..} vira "[object Object]"
    if (!s || s === "[object Object]") return null;

    const parsed = safeJsonParse(s);
    if (parsed && typeof parsed === "object") return parsed;
    return null;
  }

  return null;
}

// POST /auth/register
async function register(req, res) {
  try {
    const body = readBody(req) || req.body || {};
    const {
      name,
      email,
      password,
      role = "tutor",
      city,
      bio,
      phone,
      address,
      neighborhood,
      cep,
      image,
      services,
      prices,
      courses,
    } = body;

    if (!name || !email || !password) {
      return res.status(400).json({
        error: "Nome, e-mail e senha são obrigatórios.",
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const trimmedName = String(name).trim();

    if (!normalizedEmail) {
      return res.status(400).json({ error: "E-mail inválido." });
    }

    const existing = await findUserByEmail(normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: "E-mail já cadastrado." });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const allowedRoles = ["tutor", "caregiver", "admin"];
    const finalRole = allowedRoles.includes(role) ? role : "tutor";

    const newUser = await createUser({
      name: trimmedName,
      email: normalizedEmail,
      passwordHash,
      role: finalRole,
      city: city ? String(city).trim() : null,
      bio: bio ? String(bio).trim() : null,
      phone: phone ? String(phone).trim() : null,
      address: address ? String(address).trim() : null,
      neighborhood: neighborhood ? String(neighborhood).trim() : null,
      cep: cep ? String(cep).trim() : null,
      image: image || null,
      services: services && typeof services === "object" ? services : null,
      prices: prices && typeof prices === "object" ? prices : null,
      courses: courses && typeof courses === "object" ? courses : null,
    });

    const token = generateToken(newUser);

    return res.status(201).json({
      user: newUser,
      token,
    });
  } catch (err) {
    console.error("Erro em /auth/register:", err);
    return res.status(500).json({ error: "Erro ao registrar usuário." });
  }
}

// POST /auth/login
async function login(req, res) {
  try {
    const contentType = req.headers["content-type"];
    const body = readBody(req);

    // ✅ log melhor pra debug (sem vazar senha)
    console.log("[AUTH LOGIN] body recebido:", {
      keys: body ? Object.keys(body) : [],
      email: body?.email ?? null,
      hasPassword: !!body?.password,
      contentType,
    });

    if (!body) {
      return res.status(400).json({
        error:
          "Body inválido. Envie JSON com { email, password } e Content-Type: application/json.",
      });
    }

    const { email, password } = body;

    if (!email || !password) {
      return res.status(400).json({
        error: "E-mail e senha são obrigatórios.",
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await findUserByEmail(normalizedEmail);

    if (!user) {
      return res.status(401).json({ error: "Credenciais inválidas." });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Credenciais inválidas." });
    }

    const token = generateToken(user);
    const { id, name, role, city, image, blocked } = user;

    return res.json({
      user: {
        id,
        name,
        email: user.email,
        role,
        city,
        image,
        blocked,
      },
      token,
    });
  } catch (err) {
    console.error("Erro em /auth/login:", err);
    return res.status(500).json({ error: "Erro ao fazer login." });
  }
}

// GET /auth/me
async function me(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Não autenticado." });
    }

    const user = await findUserById(userId);
    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    return res.json({ user });
  } catch (err) {
    console.error("Erro em /auth/me:", err);
    return res.status(500).json({ error: "Erro ao buscar usuário." });
  }
}

module.exports = { register, login, me };
