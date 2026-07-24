"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Nav from "@/lib/nav";
import { useEmpresa } from "@/lib/useEmpresa";
import { useCampo } from "@/lib/useCampo";
import { useRol } from "@/lib/useRol";
import { ESTADOS_OT, ESTADOS_OT_COLOR } from "@/lib/types";
import type { Cuartel, OrdenTrabajo } from "@/lib/types";

type HistorialOT = Pick<OrdenTrabajo, "id" | "numero" | "fecha_aplicacion" | "fecha_solicitud" | "estado" | "funcion"> & {
  ot_productos: { dosis_real: number; dosis_unidad: string; productos: { nombre_comercial: string } | null }[];
};

type NuevoCuartelForm = {
  codigo: string; especie: string; variedad: string; patron: string;
  año_plantacion: string; marco_plantacion: string; plantas_por_ha: string;
  plantas_reales: string; superficie_real: string; hileras: string;
  activo: boolean; campo_id: string;
};

const NUEVO_VACIO: NuevoCuartelForm = {
  codigo: "", especie: "", variedad: "", patron: "",
  año_plantacion: "", marco_plantacion: "", plantas_por_ha: "",
  plantas_reales: "", superficie_real: "", hileras: "",
  activo: true, campo_id: "",
};

function CuartelesContent() {
  const router = useRouter();
  const { empresaId, empresaNombre } = useEmpresa();
  const { campoId, campoNombre, allCampos } = useCampo();
  const { isAdmin } = useRol();

  const [cuarteles, setCuarteles] = useState<Cuartel[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Cuartel | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [historialCuartel, setHistorialCuartel] = useState<Cuartel | null>(null);
  const [historial, setHistorial] = useState<HistorialOT[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);

  const [creating, setCreating] = useState(false);
  const [nuevo, setNuevo] = useState<NuevoCuartelForm>(NUEVO_VACIO);
  const [createError, setCreateError] = useState("");

  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ ok: number; errores: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      if (!empresaId) return;
      await load(empresaId);
    };
    init();
  }, [empresaId, campoId]);

  useEffect(() => {
    if (creating) {
      setNuevo({ ...NUEVO_VACIO, campo_id: campoId || "" });
      setCreateError("");
    }
  }, [creating, campoId]);

  const load = async (eid: string) => {
    setLoading(true);
    const base = supabase.from("cuarteles").select("*").eq("empresa_id", eid);
    const { data } = await (campoId ? base.eq("campo_id", campoId) : base).order("codigo");
    setCuarteles((data as Cuartel[]) || []);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    setError("");
    const { error: err } = await supabase
      .from("cuarteles")
      .update({
        especie: editing.especie,
        variedad: editing.variedad,
        patron: editing.patron,
        año_plantacion: editing.año_plantacion,
        marco_plantacion: editing.marco_plantacion,
        plantas_por_ha: editing.plantas_por_ha,
        plantas_reales: editing.plantas_reales,
        superficie_real: editing.superficie_real,
        hileras: editing.hileras,
        activo: editing.activo,
        campo_id: editing.campo_id ?? null,
      })
      .eq("id", editing.id);
    if (err) { setError(err.message); }
    else {
      setCuarteles((prev) => prev.map((c) => (c.id === editing.id ? editing : c)));
      setEditing(null);
    }
    setSaving(false);
  };

  const handleCreate = async () => {
    if (!empresaId) return;
    if (!nuevo.codigo.trim()) { setCreateError("El código es obligatorio."); return; }
    setSaving(true);
    setCreateError("");
    const { error: err } = await supabase.from("cuarteles").insert({
      empresa_id: empresaId,
      campo_id: nuevo.campo_id || campoId || null,
      codigo: nuevo.codigo.trim().toUpperCase(),
      especie: nuevo.especie.trim() || null,
      variedad: nuevo.variedad.trim() || null,
      patron: nuevo.patron.trim() || null,
      año_plantacion: nuevo.año_plantacion ? parseInt(nuevo.año_plantacion) : null,
      marco_plantacion: nuevo.marco_plantacion.trim() || null,
      plantas_por_ha: nuevo.plantas_por_ha ? parseInt(nuevo.plantas_por_ha) : null,
      plantas_reales: nuevo.plantas_reales ? parseInt(nuevo.plantas_reales) : null,
      superficie_real: nuevo.superficie_real ? parseFloat(nuevo.superficie_real) : null,
      hileras: nuevo.hileras ? parseInt(nuevo.hileras) : null,
      activo: nuevo.activo,
    });
    if (err) { setCreateError(err.message); }
    else { await load(empresaId); setCreating(false); }
    setSaving(false);
  };

  const downloadPlantilla = () => {
    const headers = "codigo,especie,variedad,patron,año_plantacion,marco_plantacion,plantas_por_ha,plantas_reales,superficie_real,hileras,activo";
    const ejemplo = "C1,Uva,Cabernet Sauvignon,SO4,2010,2.5x1.2,3333,2800,8.4,120,true";
    const csv = "﻿" + `${headers}\n${ejemplo}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla_cuarteles.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUploadCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !empresaId) return;
    setUploading(true);
    setUploadResult(null);

    const text = await file.text();
    const lines = text.replace(/\r/g, "").split("\n").map(l => l.trim()).filter(Boolean);

    if (lines.length < 2) {
      setUploadResult({ ok: 0, errores: ["El archivo no contiene datos (solo encabezados o está vacío)."] });
      setUploading(false);
      e.target.value = "";
      return;
    }

    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    const rows = lines.slice(1);
    const inserts: object[] = [];
    const errores: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const values = rows[i].split(",").map(v => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { row[h] = values[idx] ?? ""; });

      if (!row["codigo"]) {
        errores.push(`Fila ${i + 2}: código vacío (se omitió).`);
        continue;
      }
      inserts.push({
        empresa_id: empresaId,
        campo_id: campoId || null,
        codigo: row["codigo"].toUpperCase(),
        especie: row["especie"] || null,
        variedad: row["variedad"] || null,
        patron: row["patron"] || null,
        año_plantacion: row["año_plantacion"] ? parseInt(row["año_plantacion"]) : null,
        marco_plantacion: row["marco_plantacion"] || null,
        plantas_por_ha: row["plantas_por_ha"] ? parseInt(row["plantas_por_ha"]) : null,
        plantas_reales: row["plantas_reales"] ? parseInt(row["plantas_reales"]) : null,
        superficie_real: row["superficie_real"] ? parseFloat(row["superficie_real"]) : null,
        hileras: row["hileras"] ? parseInt(row["hileras"]) : null,
        activo: row["activo"] === "false" ? false : true,
      });
    }

    if (inserts.length > 0) {
      const { error: err } = await supabase.from("cuarteles").insert(inserts);
      if (err) {
        errores.unshift(`Error al guardar: ${err.message}`);
        setUploadResult({ ok: 0, errores });
      } else {
        await load(empresaId);
        setUploadResult({ ok: inserts.length, errores });
      }
    } else {
      setUploadResult({ ok: 0, errores });
    }

    setUploading(false);
    e.target.value = "";
  };

  const handleHistorial = async (c: Cuartel) => {
    setHistorialCuartel(c);
    setHistorial([]);
    setLoadingHistorial(true);
    const { data: otCuarteles } = await supabase
      .from("ot_cuarteles")
      .select("ot_id")
      .eq("cuartel_id", c.id);
    const otIds = (otCuarteles ?? []).map((r: { ot_id: string }) => r.ot_id);
    if (otIds.length > 0) {
      const { data } = await supabase
        .from("ordenes_trabajo")
        .select("id, numero, fecha_aplicacion, fecha_solicitud, estado, funcion, ot_productos(dosis_real, dosis_unidad, productos(nombre_comercial))")
        .in("id", otIds)
        .in("estado", ["emitida", "en_ejecucion", "finalizada"])
        .order("fecha_aplicacion", { ascending: false })
        .limit(30);
      setHistorial((data as unknown as HistorialOT[]) || []);
    }
    setLoadingHistorial(false);
  };

  const filtered = cuarteles.filter(
    (c) =>
      c.codigo.toLowerCase().includes(search.toLowerCase()) ||
      c.especie.toLowerCase().includes(search.toLowerCase()) ||
      c.variedad.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <Nav />
      <main style={container}>
        <div style={pageHeader}>
          <div>
            <h1 style={pageTitle}>Cuarteles — {campoNombre || empresaNombre}</h1>
            <p style={pageSubtitle}>{cuarteles.filter((c) => c.activo).length} cuarteles activos</p>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <input
              placeholder="Buscar cuartel, especie, variedad..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={searchInput}
            />
            {isAdmin && (
              <>
                <button onClick={downloadPlantilla} style={secBtn} title="Descargar plantilla CSV">
                  ⬇ Plantilla CSV
                </button>
                <label style={{ ...secBtn, cursor: "pointer" }}>
                  {uploading ? "Importando..." : "⬆ Importar CSV"}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    style={{ display: "none" }}
                    onChange={handleUploadCSV}
                    disabled={uploading}
                  />
                </label>
                <button onClick={() => setCreating(true)} style={primaryBtn}>
                  + Nuevo cuartel
                </button>
              </>
            )}
          </div>
        </div>

        {uploadResult && (
          <div style={{
            marginBottom: "16px", padding: "12px 16px", borderRadius: "10px",
            background: uploadResult.errores.length === 0 ? "#f0fdf4" : "#fef2f2",
            border: `1px solid ${uploadResult.errores.length === 0 ? "#86efac" : "#fca5a5"}`,
            fontSize: "13px",
          }}>
            {uploadResult.ok > 0 && (
              <p style={{ fontWeight: 700, color: "#15803d", marginBottom: "4px" }}>
                ✓ {uploadResult.ok} cuartel{uploadResult.ok !== 1 ? "es" : ""} importado{uploadResult.ok !== 1 ? "s" : ""} correctamente.
              </p>
            )}
            {uploadResult.errores.map((e, i) => (
              <p key={i} style={{ color: "#dc2626", marginBottom: "2px" }}>⚠ {e}</p>
            ))}
            <button
              onClick={() => setUploadResult(null)}
              style={{ marginTop: "6px", background: "none", border: "none", fontSize: "12px", cursor: "pointer", color: "#6b7280", textDecoration: "underline", padding: 0 }}
            >
              Cerrar
            </button>
          </div>
        )}

        {loading ? (
          <p style={{ color: "#6b7280" }}>Cargando...</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  {["Cuartel", "Especie", "Variedad", "Patrón", "Año", "Marco", "Plantas/ha", "Plantas reales", "Sup. real (ha)", "Hileras", "Activo", ""].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} style={c.activo ? {} : { opacity: 0.5 }}>
                    <td style={{ ...td, fontWeight: 700 }}>{c.codigo}</td>
                    <td style={td}>{c.especie}</td>
                    <td style={td}>{c.variedad}</td>
                    <td style={td}>{c.patron || "—"}</td>
                    <td style={td}>{c.año_plantacion || "—"}</td>
                    <td style={td}>{c.marco_plantacion || "—"}</td>
                    <td style={{ ...td, textAlign: "right" }}>{c.plantas_por_ha?.toLocaleString("es-CL") || "—"}</td>
                    <td style={{ ...td, textAlign: "right" }}>{c.plantas_reales?.toLocaleString("es-CL") || "—"}</td>
                    <td style={{ ...td, textAlign: "right" }}>{c.superficie_real != null ? `${c.superficie_real} ha` : "—"}</td>
                    <td style={{ ...td, textAlign: "right" }}>{c.hileras || "—"}</td>
                    <td style={{ ...td, textAlign: "center" }}>{c.activo ? "✓" : "—"}</td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button onClick={() => handleHistorial(c)} style={historialBtn}>Historial</button>
                        {isAdmin && <button onClick={() => setEditing(c)} style={editBtn}>Editar</button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={12} style={{ ...td, textAlign: "center", color: "#9ca3af", padding: "32px" }}>
                      Sin cuarteles{search ? ` para "${search}"` : ""}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Modal historial */}
        {historialCuartel && (
          <div style={overlay}>
            <div style={{ ...modal, maxWidth: "720px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h2 style={{ fontSize: "18px", fontWeight: 800, color: "#1a4731" }}>
                  Historial — Cuartel {historialCuartel.codigo}
                </h2>
                <button onClick={() => setHistorialCuartel(null)} style={closeBtn}>×</button>
              </div>
              <p style={{ fontSize: "12px", color: "#6b7280", marginBottom: "14px" }}>
                {historialCuartel.especie} {historialCuartel.variedad} · {historialCuartel.superficie_real ?? "?"} ha · Últimas 30 aplicaciones emitidas o finalizadas
              </p>
              {loadingHistorial ? (
                <p style={{ color: "#6b7280", padding: "20px 0" }}>Cargando...</p>
              ) : historial.length === 0 ? (
                <p style={{ color: "#6b7280", padding: "20px 0" }}>Sin aplicaciones registradas para este cuartel.</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["N° OT", "Fecha aplic.", "Estado", "Función", "Productos"].map(h => (
                          <th key={h} style={{ padding: "8px 10px", background: "#f0f4f2", fontWeight: 700, fontSize: "11px", color: "#374151", textAlign: "left", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {historial.map(ot => (
                        <tr key={ot.id}>
                          <td style={{ padding: "8px 10px", fontSize: "13px", fontWeight: 800, color: "#1a4731", borderBottom: "1px solid #f3f4f6", whiteSpace: "nowrap" }}>#{ot.numero}</td>
                          <td style={{ padding: "8px 10px", fontSize: "12px", color: "#374151", borderBottom: "1px solid #f3f4f6", whiteSpace: "nowrap" }}>{ot.fecha_aplicacion ?? ot.fecha_solicitud}</td>
                          <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6", whiteSpace: "nowrap" }}>
                            <span style={{ padding: "2px 8px", borderRadius: "999px", fontSize: "11px", fontWeight: 700, background: (ESTADOS_OT_COLOR[ot.estado] ?? "#6b7280") + "18", color: ESTADOS_OT_COLOR[ot.estado] ?? "#6b7280", border: `1px solid ${(ESTADOS_OT_COLOR[ot.estado] ?? "#6b7280")}40` }}>
                              {ESTADOS_OT[ot.estado] ?? ot.estado}
                            </span>
                          </td>
                          <td style={{ padding: "8px 10px", fontSize: "12px", color: "#374151", borderBottom: "1px solid #f3f4f6" }}>{ot.funcion?.join(", ") ?? "—"}</td>
                          <td style={{ padding: "8px 10px", fontSize: "12px", color: "#374151", borderBottom: "1px solid #f3f4f6" }}>
                            {ot.ot_productos.length === 0 ? "—" : ot.ot_productos.map((p, i) => (
                              <div key={i}>{p.productos?.nombre_comercial ?? "—"} <span style={{ color: "#6b7280" }}>{p.dosis_real} {p.dosis_unidad}</span></div>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "18px" }}>
                <button onClick={() => setHistorialCuartel(null)} style={cancelBtn}>Cerrar</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal edición */}
        {editing && (
          <div style={overlay}>
            <div style={modal}>
              <h2 style={{ fontSize: "18px", fontWeight: 800, color: "#1a4731", marginBottom: "20px" }}>
                Editar Cuartel {editing.codigo}
              </h2>
              <div style={formGrid}>
                {([
                  ["Especie", "especie", "text"],
                  ["Variedad", "variedad", "text"],
                  ["Patrón", "patron", "text"],
                  ["Año plantación", "año_plantacion", "number"],
                  ["Marco plantación", "marco_plantacion", "text"],
                  ["Plantas/ha", "plantas_por_ha", "number"],
                  ["Plantas reales", "plantas_reales", "number"],
                  ["Superficie real (ha)", "superficie_real", "number"],
                  ["Hileras", "hileras", "number"],
                ] as [string, keyof Cuartel, string][]).map(([label, key, type]) => (
                  <div key={key} style={formField}>
                    <label style={labelStyle}>{label}</label>
                    <input
                      type={type}
                      value={(editing[key] as string | number) ?? ""}
                      onChange={(e) => setEditing({ ...editing, [key]: type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                ))}
                <div style={formField}>
                  <label style={labelStyle}>Activo</label>
                  <select value={editing.activo ? "true" : "false"} onChange={(e) => setEditing({ ...editing, activo: e.target.value === "true" })} style={inputStyle}>
                    <option value="true">Sí</option>
                    <option value="false">No</option>
                  </select>
                </div>
                {allCampos.length > 0 && (
                  <div style={formField}>
                    <label style={labelStyle}>Campo</label>
                    <select value={editing.campo_id ?? ""} onChange={(e) => setEditing({ ...editing, campo_id: e.target.value || null })} style={inputStyle}>
                      <option value="">Sin campo</option>
                      {allCampos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>
                )}
              </div>
              {error && <p style={{ color: "#dc2626", fontSize: "13px", marginTop: "10px" }}>{error}</p>}
              <div style={modalFooter}>
                <button onClick={() => setEditing(null)} style={cancelBtn}>Cancelar</button>
                <button onClick={handleSave} style={saveBtn} disabled={saving}>{saving ? "Guardando..." : "Guardar cambios"}</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal nuevo cuartel */}
        {creating && (
          <div style={overlay}>
            <div style={modal}>
              <h2 style={{ fontSize: "18px", fontWeight: 800, color: "#1a4731", marginBottom: "20px" }}>
                Nuevo Cuartel
              </h2>
              <div style={formGrid}>
                <div style={{ ...formField, gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Código *</label>
                  <input
                    type="text"
                    value={nuevo.codigo}
                    onChange={(e) => setNuevo({ ...nuevo, codigo: e.target.value })}
                    style={inputStyle}
                    placeholder="Ej: C1, QLLA-01"
                    autoFocus
                  />
                </div>
                {([
                  ["Especie", "especie", "text"],
                  ["Variedad", "variedad", "text"],
                  ["Patrón", "patron", "text"],
                  ["Año plantación", "año_plantacion", "number"],
                  ["Marco plantación", "marco_plantacion", "text"],
                  ["Plantas/ha", "plantas_por_ha", "number"],
                  ["Plantas reales", "plantas_reales", "number"],
                  ["Superficie real (ha)", "superficie_real", "number"],
                  ["Hileras", "hileras", "number"],
                ] as [string, keyof NuevoCuartelForm, string][]).map(([label, key, type]) => (
                  <div key={key} style={formField}>
                    <label style={labelStyle}>{label}</label>
                    <input
                      type={type}
                      value={(nuevo[key] as string) ?? ""}
                      onChange={(e) => setNuevo({ ...nuevo, [key]: e.target.value })}
                      style={inputStyle}
                      placeholder="Opcional"
                    />
                  </div>
                ))}
                <div style={formField}>
                  <label style={labelStyle}>Activo</label>
                  <select value={nuevo.activo ? "true" : "false"} onChange={(e) => setNuevo({ ...nuevo, activo: e.target.value === "true" })} style={inputStyle}>
                    <option value="true">Sí</option>
                    <option value="false">No</option>
                  </select>
                </div>
                {allCampos.length > 0 && (
                  <div style={formField}>
                    <label style={labelStyle}>Campo</label>
                    <select value={nuevo.campo_id} onChange={(e) => setNuevo({ ...nuevo, campo_id: e.target.value })} style={inputStyle}>
                      <option value="">Sin campo</option>
                      {allCampos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>
                )}
              </div>
              {createError && <p style={{ color: "#dc2626", fontSize: "13px", marginTop: "10px" }}>{createError}</p>}
              <div style={modalFooter}>
                <button onClick={() => setCreating(false)} style={cancelBtn}>Cancelar</button>
                <button onClick={handleCreate} style={saveBtn} disabled={saving}>{saving ? "Guardando..." : "Crear cuartel"}</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

const container: React.CSSProperties = { maxWidth: "1400px", margin: "0 auto", padding: "28px 20px" };
const pageHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", flexWrap: "wrap", gap: "12px" };
const pageTitle: React.CSSProperties = { fontSize: "24px", fontWeight: 800, color: "#1a4731" };
const pageSubtitle: React.CSSProperties = { fontSize: "13px", color: "#6b7280", marginTop: "4px" };
const searchInput: React.CSSProperties = { padding: "9px 14px", borderRadius: "10px", border: "1.5px solid #d1d5db", fontSize: "14px", width: "260px", background: "#fff" };
const secBtn: React.CSSProperties = { padding: "9px 14px", borderRadius: "10px", border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: "13px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "5px" };
const primaryBtn: React.CSSProperties = { padding: "9px 16px", borderRadius: "10px", background: "#1a4731", color: "#fff", fontWeight: 700, fontSize: "13px", border: "none", cursor: "pointer" };
const table: React.CSSProperties = { width: "100%", background: "#fff", borderRadius: "14px", overflow: "hidden", border: "1px solid #e5e7eb", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" };
const th: React.CSSProperties = { padding: "10px 12px", background: "#f0f4f2", fontWeight: 700, fontSize: "12px", color: "#374151", textAlign: "left", whiteSpace: "nowrap", borderBottom: "1px solid #e5e7eb" };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: "13px", color: "#374151", borderBottom: "1px solid #f3f4f6", whiteSpace: "nowrap" };
const historialBtn: React.CSSProperties = { padding: "4px 12px", borderRadius: "6px", border: "1px solid #6b7280", background: "transparent", color: "#374151", fontSize: "12px", fontWeight: 600, cursor: "pointer" };
const editBtn: React.CSSProperties = { padding: "4px 12px", borderRadius: "6px", border: "1px solid #1a4731", background: "transparent", color: "#1a4731", fontSize: "12px", fontWeight: 700, cursor: "pointer" };
const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 };
const modal: React.CSSProperties = { background: "#fff", borderRadius: "16px", padding: "28px", width: "90%", maxWidth: "560px", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" };
const closeBtn: React.CSSProperties = { background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#6b7280", lineHeight: 1 };
const formGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" };
const formField: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "5px" };
const labelStyle: React.CSSProperties = { fontSize: "12px", fontWeight: 700, color: "#374151" };
const inputStyle: React.CSSProperties = { padding: "9px 12px", borderRadius: "8px", border: "1.5px solid #d1d5db", fontSize: "14px", background: "#fafafa" };
const modalFooter: React.CSSProperties = { display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" };
const cancelBtn: React.CSSProperties = { padding: "9px 18px", borderRadius: "8px", border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: "14px", cursor: "pointer" };
const saveBtn: React.CSSProperties = { padding: "9px 18px", borderRadius: "8px", background: "#1a4731", color: "#fff", fontWeight: 700, fontSize: "14px", border: "none", cursor: "pointer" };

import { Suspense } from "react"; export default function CuartelesPage() { return <Suspense><CuartelesContent /></Suspense>; }