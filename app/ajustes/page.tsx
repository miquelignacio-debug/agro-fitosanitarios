"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { supabase } from "@/lib/supabaseClient";
import Nav from "@/lib/nav";
import type { Personal, Maquinaria } from "@/lib/types";

type Tab = "personal" | "maquinaria";

// ── Personal tab ──────────────────────────────────────────────────────────────
function PersonalTab() {
  const [lista, setLista] = useState<Personal[]>([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<Partial<Personal> | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase.from("personal").select("*").order("nombre");
    setLista((data as Personal[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!editando?.nombre?.trim()) return;
    setSaving(true);
    if (editando.id) {
      await supabase.from("personal").update({
        nombre: editando.nombre.trim(),
        rut: editando.rut?.trim() || null,
        cargo: editando.cargo?.trim() || null,
        activo: editando.activo !== false,
      }).eq("id", editando.id);
    } else {
      await supabase.from("personal").insert({
        nombre: editando.nombre.trim(),
        rut: editando.rut?.trim() || null,
        cargo: editando.cargo?.trim() || null,
        activo: true,
      });
    }
    setSaving(false);
    setEditando(null);
    load();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("personal").delete().eq("id", id);
    setConfirmDel(null);
    load();
  };

  return (
    <div>
      <div style={sectionHeader}>
        <div>
          <h2 style={sectionTitle}>Personal</h2>
          <p style={sectionSub}>Solicitantes, responsables, dosificadores y operarios que aparecen en las órdenes de trabajo</p>
        </div>
        <button onClick={() => setEditando({ activo: true })} style={addBtn}>+ Agregar</button>
      </div>

      {editando !== null && (
        <div style={formBox}>
          <div style={formGrid}>
            <FormField label="Nombre *">
              <input
                value={editando.nombre || ""}
                onChange={(e) => setEditando(p => ({ ...p!, nombre: e.target.value }))}
                style={inputStyle}
                placeholder="Nombre completo"
                autoFocus
              />
            </FormField>
            <FormField label="RUT">
              <input
                value={editando.rut || ""}
                onChange={(e) => setEditando(p => ({ ...p!, rut: e.target.value }))}
                style={inputStyle}
                placeholder="12.345.678-9"
              />
            </FormField>
            <FormField label="Cargo / Rol">
              <input
                value={editando.cargo || ""}
                onChange={(e) => setEditando(p => ({ ...p!, cargo: e.target.value }))}
                style={inputStyle}
                placeholder="Dosificador, Responsable técnico, Solicitante..."
              />
            </FormField>
            {editando.id && (
              <FormField label="Estado">
                <select
                  value={editando.activo ? "activo" : "inactivo"}
                  onChange={(e) => setEditando(p => ({ ...p!, activo: e.target.value === "activo" }))}
                  style={inputStyle}
                >
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                </select>
              </FormField>
            )}
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: "14px" }}>
            <button onClick={handleSave} style={saveBtn} disabled={saving || !editando.nombre?.trim()}>
              {saving ? "Guardando..." : editando.id ? "Actualizar" : "Agregar"}
            </button>
            <button onClick={() => setEditando(null)} style={cancelBtn}>Cancelar</button>
          </div>
        </div>
      )}

      {loading ? (
        <p style={emptyMsg}>Cargando...</p>
      ) : lista.length === 0 ? (
        <p style={emptyMsg}>Sin personal cargado aún. Hacé clic en "+ Agregar" para empezar.</p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Nombre</th>
              <th style={thStyle}>RUT</th>
              <th style={thStyle}>Cargo / Rol</th>
              <th style={thStyle}>Estado</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((p, i) => (
              <tr key={p.id} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{p.nombre}</td>
                <td style={tdStyle}>{p.rut || "—"}</td>
                <td style={tdStyle}>{p.cargo || "—"}</td>
                <td style={tdStyle}>
                  <span style={p.activo ? activeBadge : inactiveBadge}>{p.activo ? "Activo" : "Inactivo"}</span>
                </td>
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  {confirmDel === p.id ? (
                    <>
                      <span style={{ fontSize: "12px", color: "#dc2626", marginRight: "8px" }}>¿Eliminar?</span>
                      <button onClick={() => handleDelete(p.id)} style={dangerSmall}>Sí</button>
                      <button onClick={() => setConfirmDel(null)} style={cancelSmall}>No</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setEditando({ ...p })} style={editBtn}>Editar</button>
                      <button onClick={() => setConfirmDel(p.id)} style={deleteBtn}>Eliminar</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Maquinaria tab ────────────────────────────────────────────────────────────
function MaquinariaTab() {
  const [lista, setLista] = useState<Maquinaria[]>([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<Partial<Maquinaria> | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase.from("maquinaria").select("*").order("tipo").order("codigo");
    setLista((data as Maquinaria[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!editando?.codigo?.trim()) return;
    setSaving(true);
    const payload = {
      tipo: editando.tipo || "tractor",
      codigo: editando.codigo.trim(),
      descripcion: editando.descripcion?.trim() || null,
      capacidad_lt: editando.capacidad_lt ?? null,
      activo: editando.activo !== false,
    };
    if (editando.id) {
      await supabase.from("maquinaria").update(payload).eq("id", editando.id);
    } else {
      await supabase.from("maquinaria").insert(payload);
    }
    setSaving(false);
    setEditando(null);
    load();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("maquinaria").delete().eq("id", id);
    setConfirmDel(null);
    load();
  };

  const TIPOS: Record<Maquinaria["tipo"], string> = {
    tractor: "Tractor",
    pulverizadora: "Pulverizadora",
    otro: "Otro",
  };

  return (
    <div>
      <div style={sectionHeader}>
        <div>
          <h2 style={sectionTitle}>Maquinaria</h2>
          <p style={sectionSub}>Tractores, pulverizadoras y otros equipos. La capacidad (lt) de la pulverizadora se usa para calcular el número de maquinadas.</p>
        </div>
        <button onClick={() => setEditando({ tipo: "tractor", activo: true })} style={addBtn}>+ Agregar</button>
      </div>

      {editando !== null && (
        <div style={formBox}>
          <div style={formGrid}>
            <FormField label="Tipo *">
              <select
                value={editando.tipo || "tractor"}
                onChange={(e) => setEditando(p => ({ ...p!, tipo: e.target.value as Maquinaria["tipo"] }))}
                style={inputStyle}
              >
                <option value="tractor">Tractor</option>
                <option value="pulverizadora">Pulverizadora</option>
                <option value="otro">Otro</option>
              </select>
            </FormField>
            <FormField label="Código *">
              <input
                value={editando.codigo || ""}
                onChange={(e) => setEditando(p => ({ ...p!, codigo: e.target.value }))}
                style={inputStyle}
                placeholder="Ej: MF1, Jacto-1..."
                autoFocus
              />
            </FormField>
            <FormField label="Descripción">
              <input
                value={editando.descripcion || ""}
                onChange={(e) => setEditando(p => ({ ...p!, descripcion: e.target.value }))}
                style={inputStyle}
                placeholder="Descripción opcional"
              />
            </FormField>
            <FormField label="Capacidad (lt)">
              <input
                type="number"
                min="0"
                step="1"
                value={editando.capacidad_lt != null ? String(editando.capacidad_lt) : ""}
                onChange={(e) => setEditando(p => ({ ...p!, capacidad_lt: e.target.value ? parseFloat(e.target.value) : null }))}
                style={inputStyle}
                placeholder="Ej: 2000"
              />
            </FormField>
            {editando.id && (
              <FormField label="Estado">
                <select
                  value={editando.activo ? "activo" : "inactivo"}
                  onChange={(e) => setEditando(p => ({ ...p!, activo: e.target.value === "activo" }))}
                  style={inputStyle}
                >
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                </select>
              </FormField>
            )}
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: "14px" }}>
            <button onClick={handleSave} style={saveBtn} disabled={saving || !editando.codigo?.trim()}>
              {saving ? "Guardando..." : editando.id ? "Actualizar" : "Agregar"}
            </button>
            <button onClick={() => setEditando(null)} style={cancelBtn}>Cancelar</button>
          </div>
        </div>
      )}

      {loading ? (
        <p style={emptyMsg}>Cargando...</p>
      ) : lista.length === 0 ? (
        <p style={emptyMsg}>Sin maquinaria cargada aún.</p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Tipo</th>
              <th style={thStyle}>Código</th>
              <th style={thStyle}>Descripción</th>
              <th style={thStyle}>Capacidad</th>
              <th style={thStyle}>Estado</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((m, i) => (
              <tr key={m.id} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                <td style={tdStyle}>{TIPOS[m.tipo]}</td>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{m.codigo}</td>
                <td style={tdStyle}>{m.descripcion || "—"}</td>
                <td style={tdStyle}>{m.capacidad_lt != null ? `${m.capacidad_lt} lt` : "—"}</td>
                <td style={tdStyle}>
                  <span style={m.activo ? activeBadge : inactiveBadge}>{m.activo ? "Activo" : "Inactivo"}</span>
                </td>
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  {confirmDel === m.id ? (
                    <>
                      <span style={{ fontSize: "12px", color: "#dc2626", marginRight: "8px" }}>¿Eliminar?</span>
                      <button onClick={() => handleDelete(m.id)} style={dangerSmall}>Sí</button>
                      <button onClick={() => setConfirmDel(null)} style={cancelSmall}>No</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setEditando({ ...m })} style={editBtn}>Editar</button>
                      <button onClick={() => setConfirmDel(m.id)} style={deleteBtn}>Eliminar</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Helper ────────────────────────────────────────────────────────────────────
function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <label style={{ fontSize: "12px", fontWeight: 700, color: "#374151" }}>{label}</label>
      {children}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
function AjustesContent() {
  const searchParams = useSearchParams();
  const empresa = searchParams.get("empresa") || "";
  const [tab, setTab] = useState<Tab>("personal");

  return (
    <>
      <Nav empresaId={empresa} />
      <main style={container}>
        <div style={pageHeader}>
          <h1 style={pageTitle}>Ajustes</h1>
        </div>

        <div style={tabBar}>
          {(["personal", "maquinaria"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={tab === t ? activeTabStyle : inactiveTabStyle}
            >
              {t === "personal" ? "Personal" : "Maquinaria"}
            </button>
          ))}
        </div>

        <div style={tabContent}>
          {tab === "personal" ? <PersonalTab /> : <MaquinariaTab />}
        </div>
      </main>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const container: React.CSSProperties = { maxWidth: "960px", margin: "0 auto", padding: "28px 20px" };
const pageHeader: React.CSSProperties = { marginBottom: "20px" };
const pageTitle: React.CSSProperties = { fontSize: "24px", fontWeight: 800, color: "#1a4731" };
const tabBar: React.CSSProperties = { display: "flex", gap: "0", marginBottom: "0", borderBottom: "2px solid #e5e7eb" };
const activeTabStyle: React.CSSProperties = { padding: "9px 22px", background: "#1a4731", color: "#fff", fontWeight: 700, fontSize: "14px", border: "none", cursor: "pointer", borderRadius: "8px 8px 0 0", marginBottom: "-2px", borderBottom: "2px solid #1a4731" };
const inactiveTabStyle: React.CSSProperties = { padding: "9px 22px", background: "transparent", color: "#6b7280", fontWeight: 600, fontSize: "14px", border: "none", cursor: "pointer", borderRadius: "8px 8px 0 0" };
const tabContent: React.CSSProperties = { background: "#fff", borderRadius: "0 12px 12px 12px", border: "1px solid #e5e7eb", borderTop: "none", padding: "26px 24px" };
const sectionHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "18px", gap: "12px" };
const sectionTitle: React.CSSProperties = { fontSize: "16px", fontWeight: 700, color: "#111827", margin: "0 0 4px" };
const sectionSub: React.CSSProperties = { fontSize: "12px", color: "#6b7280", margin: 0, maxWidth: "540px" };
const addBtn: React.CSSProperties = { padding: "8px 18px", borderRadius: "8px", background: "#1a4731", color: "#fff", fontWeight: 700, fontSize: "13px", border: "none", cursor: "pointer", flexShrink: 0 };
const formBox: React.CSSProperties = { background: "#f9fafb", borderRadius: "10px", border: "1px solid #e5e7eb", padding: "18px 20px", marginBottom: "20px" };
const formGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px" };
const inputStyle: React.CSSProperties = { padding: "9px 12px", borderRadius: "8px", border: "1.5px solid #d1d5db", fontSize: "14px", background: "#fff", color: "#111", width: "100%", boxSizing: "border-box" };
const saveBtn: React.CSSProperties = { padding: "8px 18px", borderRadius: "8px", background: "#1a4731", color: "#fff", fontWeight: 700, fontSize: "13px", border: "none", cursor: "pointer" };
const cancelBtn: React.CSSProperties = { padding: "8px 18px", borderRadius: "8px", border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: "13px", cursor: "pointer" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: "14px" };
const thStyle: React.CSSProperties = { padding: "10px 12px", background: "#f3f4f6", textAlign: "left", fontWeight: 700, fontSize: "11px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #e5e7eb" };
const tdStyle: React.CSSProperties = { padding: "11px 12px", borderBottom: "1px solid #f3f4f6", verticalAlign: "middle" };
const emptyMsg: React.CSSProperties = { fontSize: "14px", color: "#6b7280", fontStyle: "italic" };
const editBtn: React.CSSProperties = { padding: "4px 12px", borderRadius: "6px", border: "1px solid #d1d5db", background: "#fff", color: "#374151", fontSize: "12px", fontWeight: 600, cursor: "pointer", marginRight: "6px" };
const deleteBtn: React.CSSProperties = { padding: "4px 12px", borderRadius: "6px", border: "1px solid #fca5a5", background: "#fff", color: "#dc2626", fontSize: "12px", fontWeight: 600, cursor: "pointer" };
const dangerSmall: React.CSSProperties = { padding: "3px 10px", borderRadius: "6px", background: "#dc2626", color: "#fff", fontSize: "12px", fontWeight: 700, border: "none", cursor: "pointer", marginRight: "4px" };
const cancelSmall: React.CSSProperties = { padding: "3px 10px", borderRadius: "6px", border: "1px solid #d1d5db", background: "#fff", color: "#374151", fontSize: "12px", fontWeight: 600, cursor: "pointer" };
const activeBadge: React.CSSProperties = { padding: "2px 10px", borderRadius: "999px", background: "#f0fdf4", color: "#15803d", fontSize: "12px", fontWeight: 600, border: "1px solid #86efac" };
const inactiveBadge: React.CSSProperties = { padding: "2px 10px", borderRadius: "999px", background: "#f9fafb", color: "#9ca3af", fontSize: "12px", fontWeight: 600, border: "1px solid #d1d5db" };

export default function AjustesPage() { return <Suspense><AjustesContent /></Suspense>; }
