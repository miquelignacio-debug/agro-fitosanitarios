"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Suspense } from "react";
import { supabase } from "@/lib/supabaseClient";
import Nav from "@/lib/nav";
import { useRol } from "@/lib/useRol";
import type { Empresa, Usuario } from "@/lib/types";

type Tab = "empresas" | "usuarios";

type UsuarioConEmpresa = Usuario & {
  empresa: Pick<Empresa, "nombre"> | null;
};

// ── Empresas tab ──────────────────────────────────────────────────────────────
function EmpresasTab() {
  const [lista, setLista] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<Partial<Empresa> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    const { data } = await supabase.from("empresas").select("*").order("nombre");
    setLista((data as Empresa[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!editando?.nombre?.trim()) { setError("El nombre es obligatorio."); return; }
    setSaving(true);
    setError("");
    const payload = { nombre: editando.nombre.trim(), rut: editando.rut?.trim() || null };
    const { error: err } = editando.id
      ? await supabase.from("empresas").update(payload).eq("id", editando.id)
      : await supabase.from("empresas").insert(payload);
    setSaving(false);
    if (err) { setError(err.message); return; }
    setEditando(null);
    load();
  };

  return (
    <div>
      <div style={tabSectionHeader}>
        <div>
          <h2 style={sectionTitle}>Empresas / Campos</h2>
          <p style={sectionSub}>{lista.length} campos registrados</p>
        </div>
        <button onClick={() => setEditando({})} style={addBtn}>+ Nueva empresa</button>
      </div>

      {error && <div style={errorBanner}>{error}</div>}

      {editando !== null && (
        <div style={formBox}>
          <p style={formTitle}>{editando.id ? "Editar empresa" : "Nueva empresa"}</p>
          <div style={formGrid}>
            <FormField label="Nombre *">
              <input value={editando.nombre || ""} onChange={e => setEditando(p => ({ ...p!, nombre: e.target.value }))}
                style={inp} placeholder="Ej. Agrícola San Juan" autoFocus />
            </FormField>
            <FormField label="RUT empresa">
              <input value={editando.rut || ""} onChange={e => setEditando(p => ({ ...p!, rut: e.target.value }))}
                style={inp} placeholder="76.123.456-7" />
            </FormField>
          </div>
          <div style={formActions}>
            <button onClick={handleSave} style={saveBtn} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button>
            <button onClick={() => { setEditando(null); setError(""); }} style={cancelBtn}>Cancelar</button>
          </div>
        </div>
      )}

      {loading ? <p style={empty}>Cargando...</p> : (
        <table style={tableStyle}>
          <thead>
            <tr>{["Nombre", "RUT", "Creada", ""].map(h => <th key={h} style={th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {lista.map((e, i) => (
              <tr key={e.id} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                <td style={{ ...td, fontWeight: 700 }}>{e.nombre}</td>
                <td style={td}>{e.rut || "—"}</td>
                <td style={td}>{new Date(e.created_at).toLocaleDateString("es-CL")}</td>
                <td style={{ ...td, textAlign: "right" }}>
                  <button onClick={() => setEditando({ ...e })} style={editBtn}>Editar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Usuarios tab ──────────────────────────────────────────────────────────────
function UsuariosTab() {
  const [lista, setLista] = useState<UsuarioConEmpresa[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<Partial<UsuarioConEmpresa> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    const [{ data: usrs }, { data: emps }] = await Promise.all([
      supabase.from("usuarios").select("*, empresa:empresas(nombre)").order("nombre"),
      supabase.from("empresas").select("*").order("nombre"),
    ]);
    setLista((usrs as UsuarioConEmpresa[]) || []);
    setEmpresas((emps as Empresa[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!editando?.id) return;
    setSaving(true);
    setError("");
    const { error: err } = await supabase.from("usuarios").update({
      nombre:     editando.nombre?.trim() || undefined,
      rol:        editando.rol,
      empresa_id: editando.empresa_id || null,
    }).eq("id", editando.id);
    setSaving(false);
    if (err) { setError(err.message); return; }
    setEditando(null);
    load();
  };

  const ROL_LABEL: Record<string, string> = {
    admin: "Admin", encargado: "Encargado", visualizador: "Visualizador", superadmin: "Super Admin",
  };
  const ROL_COLOR: Record<string, string> = {
    superadmin: "#7c3aed", admin: "#1d4ed8", encargado: "#d97706", visualizador: "#6b7280",
  };

  return (
    <div>
      <div style={tabSectionHeader}>
        <div>
          <h2 style={sectionTitle}>Usuarios</h2>
          <p style={sectionSub}>Para crear un usuario nuevo, invite al email desde el Dashboard de Supabase → Authentication → Invite User, luego asigná la empresa y rol acá.</p>
        </div>
      </div>

      {error && <div style={errorBanner}>{error}</div>}

      {editando !== null && (
        <div style={formBox}>
          <p style={formTitle}>Editar usuario: {editando.nombre}</p>
          <div style={formGrid}>
            <FormField label="Nombre">
              <input value={editando.nombre || ""} onChange={e => setEditando(p => ({ ...p!, nombre: e.target.value }))}
                style={inp} autoFocus />
            </FormField>
            <FormField label="Empresa / Campo">
              <select value={editando.empresa_id || ""} onChange={e => setEditando(p => ({ ...p!, empresa_id: e.target.value || null as unknown as string }))} style={inp}>
                <option value="">— Sin empresa (solo superadmin) —</option>
                {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </FormField>
            <FormField label="Rol">
              <select value={editando.rol || "visualizador"} onChange={e => setEditando(p => ({ ...p!, rol: e.target.value as Usuario["rol"] }))} style={inp}>
                <option value="visualizador">Visualizador</option>
                <option value="encargado">Encargado</option>
                <option value="admin">Admin</option>
                <option value="superadmin">Super Admin</option>
              </select>
            </FormField>
          </div>
          <div style={formActions}>
            <button onClick={handleSave} style={saveBtn} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button>
            <button onClick={() => { setEditando(null); setError(""); }} style={cancelBtn}>Cancelar</button>
          </div>
        </div>
      )}

      {loading ? <p style={empty}>Cargando...</p> : (
        <table style={tableStyle}>
          <thead>
            <tr>{["Nombre", "RUT", "Empresa", "Rol", ""].map(h => <th key={h} style={th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {lista.map((u, i) => (
              <tr key={u.id} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                <td style={{ ...td, fontWeight: 600 }}>{u.nombre}</td>
                <td style={td}>{u.rut || "—"}</td>
                <td style={td}>{u.empresa?.nombre ?? <span style={{ color: "#9ca3af" }}>Sin empresa</span>}</td>
                <td style={td}>
                  <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px",
                    background: (ROL_COLOR[u.rol] ?? "#6b7280") + "18", color: ROL_COLOR[u.rol] ?? "#6b7280",
                    border: `1px solid ${ROL_COLOR[u.rol] ?? "#6b7280"}40` }}>
                    {ROL_LABEL[u.rol] ?? u.rol}
                  </span>
                </td>
                <td style={{ ...td, textAlign: "right" }}>
                  <button onClick={() => setEditando({ ...u })} style={editBtn}>Editar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Componente auxiliar ───────────────────────────────────────────────────────
function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
      <label style={{ fontSize: "11px", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</label>
      {children}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
function AdminContent() {
  const router = useRouter();
  const { rol, isSuperAdmin } = useRol();
  const [tab, setTab] = useState<Tab>("empresas");
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push("/login"); return; }
      setAuthed(true);
    });
  }, []);

  // Esperar tanto la sesión como el rol
  if (!authed || rol === null) return null;
  if (!isSuperAdmin) {
    return (
      <>
        <Nav />
        <main style={container}>
          <p style={{ color: "#dc2626", fontWeight: 700 }}>Acceso restringido — solo super-admin.</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Nav />
      <main style={container}>
        <div style={pageHeader}>
          <div>
            <h1 style={pageTitle}>Panel Super Admin</h1>
            <p style={pageSubtitle}>Gestión global de empresas y usuarios</p>
          </div>
        </div>

        <div style={tabBar}>
          {(["empresas", "usuarios"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={tab === t ? activeTab : inactiveTab}>
              {t === "empresas" ? "🏢 Empresas" : "👤 Usuarios"}
            </button>
          ))}
        </div>

        <div style={tabContent}>
          {tab === "empresas" ? <EmpresasTab /> : <UsuariosTab />}
        </div>
      </main>
    </>
  );
}

export default function AdminPage() {
  return <Suspense><AdminContent /></Suspense>;
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const container: React.CSSProperties = { maxWidth: "1000px", margin: "0 auto", padding: "28px 20px" };
const pageHeader: React.CSSProperties = { marginBottom: "24px" };
const pageTitle: React.CSSProperties = { fontSize: "24px", fontWeight: 800, color: "#1a4731" };
const pageSubtitle: React.CSSProperties = { fontSize: "13px", color: "#6b7280", marginTop: "4px" };
const tabBar: React.CSSProperties = { display: "flex", gap: "6px", marginBottom: "20px", borderBottom: "2px solid #e5e7eb", paddingBottom: "0" };
const activeTab: React.CSSProperties = { padding: "8px 18px", background: "none", border: "none", borderBottom: "2px solid #1a4731", marginBottom: "-2px", fontWeight: 700, fontSize: "14px", color: "#1a4731", cursor: "pointer" };
const inactiveTab: React.CSSProperties = { padding: "8px 18px", background: "none", border: "none", fontWeight: 600, fontSize: "14px", color: "#9ca3af", cursor: "pointer" };
const tabContent: React.CSSProperties = { background: "#fff", borderRadius: "14px", border: "1px solid #e5e7eb", padding: "24px 28px" };
const tabSectionHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", gap: "12px" };
const sectionTitle: React.CSSProperties = { fontSize: "16px", fontWeight: 700, color: "#1a4731", margin: 0 };
const sectionSub: React.CSSProperties = { fontSize: "12px", color: "#6b7280", marginTop: "3px", maxWidth: "500px" };
const addBtn: React.CSSProperties = { padding: "8px 16px", background: "#1a4731", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, fontSize: "13px", cursor: "pointer", whiteSpace: "nowrap" };
const formBox: React.CSSProperties = { background: "#f9fafb", border: "1.5px solid #e5e7eb", borderRadius: "10px", padding: "18px 20px", marginBottom: "20px" };
const formTitle: React.CSSProperties = { fontSize: "14px", fontWeight: 700, color: "#1a4731", margin: "0 0 14px" };
const formGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" };
const formActions: React.CSSProperties = { display: "flex", gap: "8px", marginTop: "14px" };
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: "8px", border: "1.5px solid #d1d5db", fontSize: "14px", background: "#fff", color: "#111", width: "100%", boxSizing: "border-box" };
const saveBtn: React.CSSProperties = { padding: "8px 20px", background: "#1a4731", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, fontSize: "13px", cursor: "pointer" };
const cancelBtn: React.CSSProperties = { padding: "8px 16px", background: "#fff", border: "1.5px solid #d1d5db", borderRadius: "8px", fontWeight: 600, fontSize: "13px", cursor: "pointer", color: "#374151" };
const errorBanner: React.CSSProperties = { padding: "10px 14px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", fontSize: "13px", color: "#dc2626", marginBottom: "16px" };
const empty: React.CSSProperties = { color: "#9ca3af", fontSize: "14px", textAlign: "center", padding: "20px 0" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const th: React.CSSProperties = { padding: "9px 12px", background: "#f0f4f2", fontWeight: 700, fontSize: "11px", color: "#374151", textAlign: "left", borderBottom: "1px solid #e5e7eb", textTransform: "uppercase", letterSpacing: "0.04em" };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: "13px", color: "#374151", borderBottom: "1px solid #f3f4f6" };
const editBtn: React.CSSProperties = { fontSize: "12px", fontWeight: 700, color: "#1a4731", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" };