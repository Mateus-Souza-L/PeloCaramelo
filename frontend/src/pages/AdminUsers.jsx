// frontend/src/pages/AdminUsers.jsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/ToastProvider";
import { authRequest } from "../services/api";

function toStr(v) {
  return v == null ? "" : String(v);
}

function normRole(v) {
  return toStr(v).toLowerCase().trim();
}

function formatDateTimeBR(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return toStr(iso);
  return d.toLocaleString("pt-BR");
}

function safeJsonLike(v) {
  if (v == null) return null;
  if (typeof v === "object") return v;
  const s = String(v).trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export default function AdminUsers() {
  const { user, token } = useAuth();
  const { showToast } = useToast();

  const myRole = useMemo(() => normRole(user?.role), [user?.role]);
  const isAdmin = myRole === "admin" || myRole === "admin_master";
  const isMaster = myRole === "admin_master";

  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("all"); // all | tutor | caregiver | admin | admin_master
  const [onlyBlocked, setOnlyBlocked] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    try {
      const data = await authRequest("/admin/users", token);
      const list = Array.isArray(data?.users) ? data.users : [];
      setUsers(list);
    } catch (err) {
      const msg =
        err?.message ||
        safeJsonLike(err)?.error ||
        "Erro ao carregar usuários.";
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [token, showToast]);

  useEffect(() => {
    if (!token) return;
    if (!isAdmin) return;
    load();
  }, [token, isAdmin, load]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();

    return (users || [])
      .filter((u) => {
        if (onlyBlocked && !u?.blocked) return false;

        const role = normRole(u?.role);
        if (roleFilter !== "all" && role !== roleFilter) return false;

        if (!query) return true;
        const name = toStr(u?.name).toLowerCase();
        const email = toStr(u?.email).toLowerCase();
        const id = toStr(u?.id).toLowerCase();
        return (
          name.includes(query) ||
          email.includes(query) ||
          id.includes(query) ||
          role.includes(query)
        );
      })
      .sort((a, b) => {
        const da = new Date(a?.created_at || 0).getTime();
        const db = new Date(b?.created_at || 0).getTime();
        return db - da;
      });
  }, [users, q, roleFilter, onlyBlocked]);

  async function toggleBlocked(u) {
    try {
      const id = toStr(u?.id);
      if (!id) return;

      const nextBlocked = !Boolean(u?.blocked);

      let reason = null;
      let blockedUntil = null;

      if (nextBlocked) {
        const r = window.prompt(
          "Motivo do bloqueio (opcional):",
          toStr(u?.blocked_reason || "")
        );
        if (r != null && String(r).trim()) reason = String(r).trim();

        const until = window.prompt(
          "Bloqueado até (opcional). Ex: 2026-02-01 ou 2026-02-01T12:00:00Z",
          toStr(u?.blocked_until || "")
        );
        if (until != null && String(until).trim()) blockedUntil = String(until).trim();
      }

      const body = {
        blocked: nextBlocked,
        ...(reason ? { reason } : {}),
        ...(blockedUntil ? { blockedUntil } : {}),
      };

      const updated = await authRequest(`/admin/users/${id}/block`, token, {
        method: "PATCH",
        body: JSON.stringify(body),
      });

      const newUser = updated?.user || null;

      setUsers((prev) =>
        (prev || []).map((x) => {
          if (toStr(x?.id) !== id) return x;
          return {
            ...x,
            ...newUser,
            blocked: Boolean(newUser?.blocked ?? nextBlocked),
            blocked_reason: newUser?.blocked_reason ?? (nextBlocked ? reason : null),
            blocked_until: newUser?.blocked_until ?? (nextBlocked ? blockedUntil : null),
          };
        })
      );

      showToast(
        nextBlocked ? "Usuário bloqueado." : "Usuário desbloqueado.",
        "success"
      );
    } catch (err) {
      const payload = safeJsonLike(err);
      const msg =
        payload?.error ||
        err?.message ||
        "Erro ao atualizar bloqueio do usuário.";
      showToast(msg, "error");
    }
  }

  async function deleteUser(u) {
    try {
      const id = toStr(u?.id);
      if (!id) return;

      const label = `${toStr(u?.name) || "Usuário"} (${toStr(u?.email)})`;
      const ok = window.confirm(
        `Excluir definitivamente: ${label}?\n\nIsso pode remover dados relacionados dependendo do backend.`
      );
      if (!ok) return;

      await authRequest(`/admin/users/${id}`, token, { method: "DELETE" });

      setUsers((prev) => (prev || []).filter((x) => toStr(x?.id) !== id));
      showToast("Usuário excluído.", "success");
    } catch (err) {
      const payload = safeJsonLike(err);
      const msg =
        payload?.error ||
        err?.message ||
        "Erro ao excluir usuário.";
      showToast(msg, "error");
    }
  }

  if (!token) {
    return (
      <div className="max-w-5xl mx-auto p-4">
        <div className="pc-card pc-card-accent">
          <h1 className="text-[#5A3A22] font-semibold text-lg">Admin</h1>
          <p className="text-[#5A3A22] opacity-80 mt-1">
            Faça login para acessar o painel.
          </p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-5xl mx-auto p-4">
        <div className="pc-card pc-card-accent">
          <h1 className="text-[#5A3A22] font-semibold text-lg">Acesso negado</h1>
          <p className="text-[#5A3A22] opacity-80 mt-1">
            Esta área é restrita a administradores.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4">
      <div className="pc-card pc-card-accent mb-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-[#5A3A22] font-semibold text-xl">Admin — Usuários</h1>
            <p className="text-[#5A3A22] opacity-70 text-sm mt-1">
              Você está logado como: <b>{myRole}</b>
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={load}
              className="px-3 py-2 rounded-lg bg-[#5A3A22] text-white hover:opacity-90 text-sm"
              disabled={loading}
            >
              {loading ? "Atualizando..." : "Atualizar"}
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs text-[#5A3A22] opacity-70">Buscar</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="nome, email, id, role..."
              className="w-full mt-1 px-3 py-2 rounded-lg border border-[#EBCBA9] focus:outline-none focus:ring-2 focus:ring-[#FFD700] bg-white"
            />
          </div>

          <div>
            <label className="text-xs text-[#5A3A22] opacity-70">Filtrar role</label>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-[#EBCBA9] focus:outline-none focus:ring-2 focus:ring-[#FFD700] bg-white"
            >
              <option value="all">Todos</option>
              <option value="tutor">Tutor</option>
              <option value="caregiver">Cuidador</option>
              <option value="admin">Admin</option>
              <option value="admin_master">Admin master</option>
            </select>
          </div>

          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-sm text-[#5A3A22]">
              <input
                type="checkbox"
                checked={onlyBlocked}
                onChange={(e) => setOnlyBlocked(e.target.checked)}
              />
              Só bloqueados
            </label>
          </div>
        </div>
      </div>

      <div className="pc-card">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[#5A3A22] font-semibold">
            Resultado: {filtered.length} usuário(s)
          </div>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead>
              <tr className="text-left text-[#5A3A22]">
                <th className="py-2 pr-3">ID</th>
                <th className="py-2 pr-3">Nome</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Role</th>
                <th className="py-2 pr-3">Bloqueado</th>
                <th className="py-2 pr-3">Motivo</th>
                <th className="py-2 pr-3">Até</th>
                <th className="py-2 pr-3">Criado</th>
                <th className="py-2 pr-0 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const id = toStr(u?.id);
                const role = normRole(u?.role);
                const blocked = Boolean(u?.blocked);
                const isMe = toStr(user?.id) === id;

                return (
                  <tr key={id} className="border-t border-[#EBCBA9]/60">
                    <td className="py-2 pr-3 text-[#5A3A22] opacity-90">{id}</td>
                    <td className="py-2 pr-3 text-[#5A3A22] font-medium">
                      {toStr(u?.name) || "-"}
                      {isMe ? (
                        <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-[#FFD700]/30 text-[#5A3A22]">
                          você
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-[#5A3A22] opacity-90">
                      {toStr(u?.email) || "-"}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="text-xs px-2 py-1 rounded-full bg-[#EBCBA9]/60 text-[#5A3A22]">
                        {role || "-"}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          blocked
                            ? "bg-red-100 text-red-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {blocked ? "Sim" : "Não"}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-[#5A3A22] opacity-80">
                      {toStr(u?.blocked_reason) || "-"}
                    </td>
                    <td className="py-2 pr-3 text-[#5A3A22] opacity-80">
                      {u?.blocked_until ? formatDateTimeBR(u.blocked_until) : "-"}
                    </td>
                    <td className="py-2 pr-3 text-[#5A3A22] opacity-80">
                      {u?.created_at ? formatDateTimeBR(u.created_at) : "-"}
                    </td>
                    <td className="py-2 pr-0">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => toggleBlocked(u)}
                          className="px-3 py-2 rounded-lg border border-[#5A3A22] text-[#5A3A22] hover:bg-[#5A3A22] hover:text-white transition text-xs"
                          disabled={isMe && blocked} // evita travar no próprio bloqueio se já bloqueado
                          title={blocked ? "Desbloquear" : "Bloquear"}
                        >
                          {blocked ? "Desbloquear" : "Bloquear"}
                        </button>

                        <button
                          onClick={() => deleteUser(u)}
                          className={`px-3 py-2 rounded-lg text-xs ${
                            isMaster
                              ? "bg-red-600 text-white hover:opacity-90"
                              : "bg-gray-200 text-gray-500 cursor-not-allowed"
                          }`}
                          disabled={!isMaster}
                          title={
                            isMaster
                              ? "Excluir usuário"
                              : "Somente admin_master pode excluir"
                          }
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!loading && filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="py-6 text-center text-[#5A3A22] opacity-70"
                  >
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>

          {loading ? (
            <div className="py-4 text-[#5A3A22] opacity-70 text-sm">Carregando...</div>
          ) : null}
        </div>

        <div className="mt-4 text-xs text-[#5A3A22] opacity-60">
          Dica: o backend já impede auto-bloqueio e exclusão do próprio admin. Mesmo assim, a UI tenta evitar ações perigosas.
        </div>
      </div>
    </div>
  );
}
