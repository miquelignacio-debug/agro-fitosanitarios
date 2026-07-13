"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Nav from "@/lib/nav";
import type { Usuario } from "@/lib/types";

const ROL_LABELS: Record<string, string> = { admin: "Administrador", operador: "Operador", visualizador: "Visualizador" };

export default function AdminUsuariosPage() {
  const router = useRouter();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Usuario | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Form state
  const [fNombre, setFNombre] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fPassword, setFPassword] = useState("");
  const [fRut, setFRut] = useState("");
  const [fRol, setFRol] = useState<"admin" | "operador" | "visualizador">("admin");

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      await load();
    };
    init();
  }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("usuarios").select("*").order("nombre");
    setUsuarios((data as Usuario[]) || []);
    setLoading(false);
  };

  const openNew = () => {
    setEditing(null);
    setFNombre(""); setFEmail(""); setFPassword(""); setFRut(""); setFRol("admin");
    setError("");
    setShowModal(true);
  };

  const openEdit = (u: Usuario) => {
    setEditing(u);
    setFNombre(u.nombre); setFEmail(""); setFPassword(""); setFRut(u.rut || ""); setFRol(u.rol);
    setError("");
    setShowModal(true);
  };

  const handleSave = async () => {
    setError("");
    if (!fNombre.trim()) { setError("El nombre es obligatorio."); return; }
    if (!editing && (!fEmail.trim() || !fPassword.trim())) {
      setError("Email y contraseña son obligatorios para nuevos usuarios."); return;
    }
    setSaving(true);

    const res = await fetch("/api/usuarios", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        editing
          ? { id: editing.id, nombre: fNombre, rut: fRut || null, rol: fRol, password: fPassword || undefined }
          : { email: fEmail, password: fPassword, nombre: fNombre, rut: fRut || null, rol: fRol }
      ),
    });

    const json = await res.json();
    if (!res.ok) { setError(json.error || "Error al guardar."); setSaving(false); return; }

    await load();
    setShowModal(false);
    setSaving(false);
  };

  const handleDelete = async (u: Usuario) => {
    if (!confirm(`¿Eliminar a ${u.nombre}? Esta acción no se puede deshacer.`)) return;
    await fetch("/api/usuarios", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id }),
    });
    await load();
  };

  return (
    <>
      <Nav />
      <main style={container}>
        <div style={pageHeader}>
          <div>
            <h1 style={pageTitle}>Gestión de usuarios</h1>
            <p style={pageSubtitle}>{usuarios.length} usuarios registrados</p>
          </div>
          <button onClick={openNew} style={primaryBtn}>+ Nuevo usuario</button>
        </div>

        {loading ? (
          <p style={{ color: "#6b7280" }}>Cargando...</p>
        ) : (
          <div style={grid}>
            {usuarios.map((u) => (
              <div key={u.id} style={card}>
                <div style={cardAvatar}>{u.nombre.charAt(0).toUpperCase()}</div>
                <div style={{ flex: 1 }}>
                  <div style={cardName}>{u.nombre}</div>
                  {u.rut && <div style={cardSub}>RUT: {u.rut}</div>}
                  <span style={{ ...rolBadge, ...(u.rol === "admin" ? rolAdmin : u.rol === "operador" ? rolOperador : rolVisualizador) }}>
                    {ROL_LABELS[u.rol] ?? u.rol}
                  </span>
                </div>
                <div style={cardActions}>
                  <button onClick={() => openEdit(u)} style={editBtn}>Editar</button>
                  <button onClick={() => handleDelete(u)} style={deleteBtn}>Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showModal && (
          <div style={overlay}>
            <div style={modal}>
              <h2 style={modalTitle}>
                {editing ? `Editar — ${editing.nombre}` : "Nuevo usuario"}
              </h2>

              <div style={formGrid}>
                <div style={formField}>
                  <label style={labelStyle}>Nombre completo *</label>
                  <input value={fNombre} onChange={(e) => setFNombre(e.target.value)} style={inputStyle} placeholder="Ej. Franco Reyes" />
                </div>
                <div style={formField}>
                  <label style={labelStyle}>RUT</label>
                  <input value={fRut} onChange={(e) => setFRut(e.target.value)} style={inputStyle} placeholder="12.345.678-9" />
                </div>
                {!editing && (
                  <div style={formField}>
                    <label style={labelStyle}>Email *</label>
                    <input type="email" value={fEmail} onChange={(e) => setFEmail(e.target.value)} style={inputStyle} placeholder="usuario@email.cl" />
                  </div>
                )}
                <div style={formField}>
                  <label style={labelStyle}>{editing ? "Nueva contraseña (opcional)" : "Contraseña *"}</label>
                  <input type="password" value={fPassword} onChange={(e) => setFPassword(e.target.value)} style={inputStyle} placeholder={editing ? "Dejar en blanco para no cambiar" : "Mínimo 6 caracteres"} minLength={editing ? 0 : 6} />
                </div>
                <div style={formField}>
                  <label style={labelStyle}>Rol *</label>
                  <select value={fRol} onChange={(e) => setFRol(e.target.value as "admin" | "operador" | "visualizador")} style={inputStyle}>
                    <option value="admin">Administrador</option>
                    <option value="operador">Operador</option>
                    <option value="visualizador">Visualizador</option>
                  </select>
                </div>
              </div>

              {error && <p style={errorStyle}>{error}</p>}

              <div style={modalFooter}>
                <button onClick={() => setShowModal(false)} style={cancelBtn}>Cancelar</button>
                <button onClick={handleSave} style={saveBtn} disabled={saving}>
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

const container: React.CSSProperties = { maxWidth: "900px", margin: "0 auto", padding: "28px 20px" };
const pageHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px", flexWrap: "wrap", gap: "12px" };
const pageTitle: React.CSSProperties = { fontSize: "24px", fontWeight: 800, color: "#1a4731" };
const pageSubtitle: React.CSSProperties = { fontSize: "13px", color: "#6b7280", marginTop: "4px" };
const primaryBtn: React.CSSProperties = { padding: "9px 18px", borderRadius: "10px", background: "#1a4731", color: "#fff", fontWeight: 700, fontSize: "14px", border: "none", cursor: "pointer" };
const grid: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "10px" };
const card: React.CSSProperties = { display: "flex", alignItems: "center", gap: "14px", background: "#fff", borderRadius: "14px", padding: "16px 20px", border: "1px solid #e5e7eb" };
const cardAvatar: React.CSSProperties = { width: "44px", height: "44px", borderRadius: "50%", background: "#1a4731", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "18px", flexShrink: 0 };
const cardName: React.CSSProperties = { fontWeight: 700, fontSize: "15px", color: "#111", marginBottom: "3px" };
const cardSub: React.CSSProperties = { fontSize: "12px", color: "#6b7280", marginBottom: "5px" };
const cardActions: React.CSSProperties = { display: "flex", gap: "8px", flexShrink: 0 };
const rolBadge: React.CSSProperties = { padding: "2px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 700 };
const rolAdmin: React.CSSProperties = { background: "#dbeafe", color: "#1d4ed8" };
const rolOperador: React.CSSProperties = { background: "#dcfce7", color: "#15803d" };
const rolVisualizador: React.CSSProperties = { background: "#fef9c3", color: "#854d0e" };
const editBtn: React.CSSProperties = { padding: "6px 14px", borderRadius: "8px", border: "1px solid #1a4731", background: "transparent", color: "#1a4731", fontSize: "13px", fontWeight: 700, cursor: "pointer" };
const deleteBtn: React.CSSProperties = { padding: "6px 14px", borderRadius: "8px", border: "1px solid #fca5a5", background: "transparent", color: "#dc2626", fontSize: "13px", fontWeight: 700, cursor: "pointer" };
const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 };
const modal: React.CSSProperties = { background: "#fff", borderRadius: "16px", padding: "28px", width: "90%", maxWidth: "480px", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" };
const modalTitle: React.CSSProperties = { fontSize: "18px", fontWeight: 800, color: "#1a4731", marginBottom: "20px" };
const formGrid: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "14px" };
const formField: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "5px" };
const labelStyle: React.CSSProperties = { fontSize: "12px", fontWeight: 700, color: "#374151" };
const inputStyle: React.CSSProperties = { padding: "9px 12px", borderRadius: "8px", border: "1.5px solid #d1d5db", fontSize: "14px", background: "#fafafa" };
const errorStyle: React.CSSProperties = { fontSize: "13px", color: "#dc2626", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", padding: "10px 12px", marginTop: "12px" };
const modalFooter: React.CSSProperties = { display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" };
const cancelBtn: React.CSSProperties = { padding: "9px 18px", borderRadius: "8px", border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: "14px", cursor: "pointer" };
const saveBtn: React.CSSProperties = { padding: "9px 18px", borderRadius: "8px", background: "#1a4731", color: "#fff", fontWeight: 700, fontSize: "14px", border: "none", cursor: "pointer" };
