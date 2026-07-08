"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { supabase } from "@/lib/supabaseClient";
import Nav from "@/lib/nav";
import type { Personal, Maquinaria } from "@/lib/types";

type Tab = "personal" | "maquinaria" | "objetivos";

type PlagaObj = { id: string; nombre: string; tipo: string; activo: boolean };

function formatRut(input: string): string {
  const clean = input.replace(/[^0-9kK]/g, "").toUpperCase().slice(0, 9);
  if (clean.length <= 1) return clean;
  const verifier = clean.slice(-1);
  const body = clean.slice(0, -1);
  let formatted = "";
  for (let i = body.length - 1, count = 0; i >= 0; i--, count++) {
    if (count > 0 && count % 3 === 0) formatted = "." + formatted;
    formatted = body[i] + formatted;
  }
  return `${formatted}-${verifier}`;
}

const CARGOS_REQUERIDOS = [
  { cargo: "Solicitante",          desc: "Quien solicita la aplicación" },
  { cargo: "Responsable técnico",  desc: "Responsable técnico de la OT" },
  { cargo: "Dosificador",          desc: "Quien prepara y dosifica los productos" },
  { cargo: "Aplicador",            desc: "Quien realiza la aplicación en terreno" },
];

// ── Personal tab ──────────────────────────────────────────────────────────────
function PersonalTab() {
  const [lista, setLista] = useState<Personal[]>([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<Partial<Personal> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase.from("personal").select("*").order("cargo").order("nombre");
    if (error) {
      setSaveError(
        error.message.includes("does not exist")
          ? 'La tabla "personal" no existe aún. Ejecutá la migración v2 en el SQL Editor de Supabase (archivo supabase/migration_v2_personal.sql).'
          : error.message
      );
    }
    setLista((data as Personal[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!editando?.nombre?.trim()) return;
    setSaving(true);
    setSaveError("");

    const payload = {
      nombre: editando.nombre.trim(),
      rut: editando.rut?.trim() || null,
      cargo: editando.cargo?.trim() || null,
      activo: editando.activo !== false,
    };

    const { error } = editando.id
      ? await supabase.from("personal").update(payload).eq("id", editando.id)
      : await supabase.from("personal").insert(payload);

    setSaving(false);

    if (error) {
      setSaveError(
        error.message.includes("does not exist")
          ? 'La tabla "personal" no existe aún. Ejecutá primero la migración v2 en el SQL Editor de Supabase.'
          : error.message
      );
      return;
    }

    setEditando(null);
    load();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("personal").delete().eq("id", id);
    if (error) { setSaveError(error.message); return; }
    setConfirmDel(null);
    load();
  };

  // Cobertura por cargo requerido (activos)
  const activos = lista.filter(p => p.activo);
  const contarCargo = (cargo: string) =>
    activos.filter(p => p.cargo?.toLowerCase() === cargo.toLowerCase()).length;

  return (
    <div>
      <div style={sectionHeader}>
        <div>
          <h2 style={sectionTitle}>Personal</h2>
          <p style={sectionSub}>Personas que aparecen en las órdenes de trabajo. Podés tener más de uno por cargo.</p>
        </div>
        <button onClick={() => setEditando({ activo: true })} style={addBtn}>+ Agregar</button>
      </div>

      {/* ── Panel de roles requeridos ── */}
      {!loading && (
        <div style={rolesPanel}>
          <p style={rolesPanelTitle}>Roles requeridos en OT</p>
          <div style={rolesGrid}>
            {CARGOS_REQUERIDOS.map(({ cargo, desc }) => {
              const count = contarCargo(cargo);
              const ok = count > 0;
              return (
                <div key={cargo} style={{ ...rolCard, borderColor: ok ? "#86efac" : "#fca5a5", background: ok ? "#f0fdf4" : "#fef2f2" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                    <span style={{ fontSize: "20px", lineHeight: 1 }}>{ok ? "✅" : "❌"}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: "13px", color: ok ? "#15803d" : "#dc2626" }}>{cargo}</div>
                      <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "1px" }}>{desc}</div>
                      <div style={{ fontSize: "12px", fontWeight: 600, color: ok ? "#15803d" : "#dc2626", marginTop: "4px" }}>
                        {ok ? `${count} persona${count > 1 ? "s" : ""}` : "Sin personal asignado"}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setEditando({ activo: true, cargo })}
                    style={rolAddBtn}
                  >
                    + Agregar {cargo.toLowerCase()}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Error global ── */}
      {saveError && (
        <div style={errorBanner}>
          {saveError}
          <button onClick={() => setSaveError("")} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontWeight: 700, marginLeft: "8px" }}>✕</button>
        </div>
      )}

      {/* ── Formulario ── */}
      {editando !== null && (
        <div style={formBox}>
          <p style={{ fontSize: "13px", fontWeight: 700, color: "#1a4731", margin: "0 0 12px" }}>
            {editando.id ? "Editar persona" : `Agregar${editando.cargo ? ` — ${editando.cargo}` : ""}`}
          </p>
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
                onChange={(e) => setEditando(p => ({ ...p!, rut: formatRut(e.target.value) }))}
                style={inputStyle}
                placeholder="12.345.678-9"
                maxLength={12}
              />
            </FormField>
            <FormField label="Cargo / Rol">
              <input
                list="cargos-sugeridos"
                value={editando.cargo || ""}
                onChange={(e) => setEditando(p => ({ ...p!, cargo: e.target.value }))}
                style={inputStyle}
                placeholder="Seleccionar o escribir..."
              />
              <datalist id="cargos-sugeridos">
                {CARGOS_REQUERIDOS.map(c => <option key={c.cargo} value={c.cargo} />)}
              </datalist>
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

      {/* ── Lista ── */}
      {loading ? (
        <p style={emptyMsg}>Cargando...</p>
      ) : lista.length === 0 ? (
        <p style={emptyMsg}>Sin personal cargado aún. Usá los botones de arriba para agregar.</p>
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
                <td style={tdStyle}>
                  {p.cargo
                    ? <span style={CARGOS_REQUERIDOS.some(c => c.cargo === p.cargo) ? cargoBadge : cargoOtroBadge}>{p.cargo}</span>
                    : <span style={{ color: "#9ca3af" }}>—</span>}
                </td>
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
    implemento: "Implemento",
    otro: "Otro",
  };

  return (
    <div>
      <div style={sectionHeader}>
        <div>
          <h2 style={sectionTitle}>Maquinaria</h2>
          <p style={sectionSub}>Tractores, implementos y otros equipos. La capacidad (lt) del implemento (pulverizadora, etc.) se usa para calcular el número de maquinadas.</p>
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
                <option value="implemento">Implemento</option>
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
            {editando.tipo !== "tractor" && (
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
            )}
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
                <td style={tdStyle}>{m.tipo === "tractor" ? <span style={{ color: "#d1d5db", fontSize: "11px" }}>N/A</span> : m.capacidad_lt != null ? `${m.capacidad_lt} lt` : "—"}</td>
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

// ── Objetivos tab ─────────────────────────────────────────────────────────────
const TIPOS_PLAGA = ["plaga", "enfermedad", "nutritivo", "manejo"] as const;
const TIPO_LABEL: Record<string, string> = { plaga: "Plaga", enfermedad: "Enfermedad", nutritivo: "Nutritivo", manejo: "Manejo" };
const TIPO_COLORS: Record<string, React.CSSProperties> = {
  plaga:      { background: "#fef2f2", color: "#dc2626", borderColor: "#fca5a5" },
  enfermedad: { background: "#fff7ed", color: "#ea580c", borderColor: "#fed7aa" },
  nutritivo:  { background: "#f0fdf4", color: "#15803d", borderColor: "#86efac" },
  manejo:     { background: "#eff6ff", color: "#1d4ed8", borderColor: "#bfdbfe" },
};

function ObjetivosTab() {
  const [lista, setLista] = useState<PlagaObj[]>([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<Partial<PlagaObj> | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [buscar, setBuscar] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [saveError, setSaveError] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("plagas_objetivos").select("*").order("tipo").order("nombre");
    if (error) setSaveError(error.message.includes("does not exist") ? 'La tabla "plagas_objetivos" no existe. Ejecutá migration_v4_plagas.sql en el SQL Editor de Supabase.' : error.message);
    setLista((data as PlagaObj[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = lista.filter(p => {
    if (filtroTipo && p.tipo !== filtroTipo) return false;
    if (buscar && !p.nombre.toLowerCase().includes(buscar.toLowerCase())) return false;
    return true;
  });

  const handleSave = async () => {
    if (!editando?.nombre?.trim()) return;
    setSaving(true);
    setSaveError("");
    const payload = { nombre: editando.nombre.trim(), tipo: editando.tipo || "plaga", activo: editando.activo !== false };
    const { error } = editando.id
      ? await supabase.from("plagas_objetivos").update(payload).eq("id", editando.id)
      : await supabase.from("plagas_objetivos").insert(payload);
    setSaving(false);
    if (error) {
      setSaveError(error.message.toLowerCase().includes("unique") || error.message.toLowerCase().includes("duplicate")
        ? `Ya existe "${editando.nombre}" en el catálogo.`
        : error.message);
      return;
    }
    setEditando(null);
    load();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("plagas_objetivos").delete().eq("id", id);
    setConfirmDel(null);
    load();
  };

  return (
    <div>
      <div style={sectionHeader}>
        <div>
          <h2 style={sectionTitle}>Catálogo de objetivos</h2>
          <p style={sectionSub}>Plagas, enfermedades y objetivos disponibles en OTs y Monitoreos. La restricción UNIQUE en la base de datos impide duplicados.</p>
        </div>
        <button onClick={() => setEditando({ tipo: "plaga", activo: true })} style={addBtn}>+ Agregar</button>
      </div>

      {saveError && (
        <div style={errorBanner}>
          {saveError}
          <button onClick={() => setSaveError("")} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontWeight: 700, marginLeft: "8px" }}>✕</button>
        </div>
      )}

      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" }}>
        <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar..." style={{ ...inputStyle, width: "200px" }} />
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          <option value="">Todos los tipos</option>
          {TIPOS_PLAGA.map(t => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
        </select>
        <span style={{ fontSize: "13px", color: "#6b7280" }}>{filtered.filter(p => p.activo).length} activos · {filtered.length} total</span>
      </div>

      {editando !== null && (
        <div style={formBox}>
          <p style={{ fontSize: "13px", fontWeight: 700, color: "#1a4731", margin: "0 0 12px" }}>
            {editando.id ? "Editar entrada" : "Agregar al catálogo"}
          </p>
          <div style={formGrid}>
            <FormField label="Nombre *">
              <input value={editando.nombre || ""} onChange={e => setEditando(p => ({ ...p!, nombre: e.target.value }))} style={inputStyle} placeholder="Ej: Botrytis, Arañita Roja..." autoFocus />
            </FormField>
            <FormField label="Tipo *">
              <select value={editando.tipo || "plaga"} onChange={e => setEditando(p => ({ ...p!, tipo: e.target.value }))} style={inputStyle}>
                {TIPOS_PLAGA.map(t => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
              </select>
            </FormField>
            {editando.id && (
              <FormField label="Estado">
                <select value={editando.activo ? "activo" : "inactivo"} onChange={e => setEditando(p => ({ ...p!, activo: e.target.value === "activo" }))} style={inputStyle}>
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
      ) : filtered.length === 0 ? (
        <p style={emptyMsg}>Sin resultados.</p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Nombre</th>
              <th style={thStyle}>Tipo</th>
              <th style={thStyle}>Estado</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => {
              const tc = TIPO_COLORS[p.tipo] || {};
              return (
                <tr key={p.id} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{p.nombre}</td>
                  <td style={tdStyle}>
                    <span style={{ padding: "2px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: 600, border: "1px solid", ...tc }}>{TIPO_LABEL[p.tipo]}</span>
                  </td>
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
              );
            })}
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
          {(["personal", "maquinaria", "objetivos"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={tab === t ? activeTabStyle : inactiveTabStyle}>
              {t === "personal" ? "Personal" : t === "maquinaria" ? "Maquinaria" : "Objetivos / Plagas"}
            </button>
          ))}
        </div>

        <div style={tabContent}>
          {tab === "personal" ? <PersonalTab /> : tab === "maquinaria" ? <MaquinariaTab /> : <ObjetivosTab />}
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
const activeBadge: React.CSSProperties    = { padding: "2px 10px", borderRadius: "999px", background: "#f0fdf4", color: "#15803d", fontSize: "12px", fontWeight: 600, border: "1px solid #86efac" };
const inactiveBadge: React.CSSProperties  = { padding: "2px 10px", borderRadius: "999px", background: "#f9fafb", color: "#9ca3af", fontSize: "12px", fontWeight: 600, border: "1px solid #d1d5db" };
const cargoBadge: React.CSSProperties     = { padding: "2px 10px", borderRadius: "999px", background: "#eff6ff", color: "#1d4ed8", fontSize: "12px", fontWeight: 600, border: "1px solid #bfdbfe" };
const cargoOtroBadge: React.CSSProperties = { padding: "2px 10px", borderRadius: "999px", background: "#f3f4f6", color: "#374151", fontSize: "12px", fontWeight: 600, border: "1px solid #d1d5db" };
const rolesPanel: React.CSSProperties     = { marginBottom: "20px" };
const rolesPanelTitle: React.CSSProperties = { fontSize: "11px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" };
const rolesGrid: React.CSSProperties      = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px" };
const rolCard: React.CSSProperties        = { borderRadius: "10px", border: "1px solid", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "10px" };
const rolAddBtn: React.CSSProperties      = { padding: "5px 10px", borderRadius: "7px", border: "1.5px solid #1a4731", background: "transparent", color: "#1a4731", fontSize: "12px", fontWeight: 700, cursor: "pointer", alignSelf: "flex-start" };
const errorBanner: React.CSSProperties    = { fontSize: "13px", color: "#dc2626", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "space-between" };

export default function AjustesPage() { return <Suspense><AjustesContent /></Suspense>; }
