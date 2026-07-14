"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Nav from "@/lib/nav";
import { ESTADOS_OT, ESTADOS_OT_COLOR } from "@/lib/types";
import type { Cuartel, Empresa, OrdenTrabajo } from "@/lib/types";

type HistorialOT = Pick<OrdenTrabajo, "id" | "numero" | "fecha_aplicacion" | "fecha_solicitud" | "estado" | "funcion"> & {
  ot_productos: { dosis_real: number; dosis_unidad: string; productos: { nombre_comercial: string } | null }[];
};

function CuartelesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const empresaParam = searchParams.get("empresa") || "";

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaId, setEmpresaId] = useState(empresaParam);
  const [cuarteles, setCuarteles] = useState<Cuartel[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Cuartel | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [historialCuartel, setHistorialCuartel] = useState<Cuartel | null>(null);
  const [historial, setHistorial] = useState<HistorialOT[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data: emp } = await supabase.from("empresas").select("*").order("nombre");
      if (!emp || emp.length === 0) return;
      setEmpresas(emp);
      const eid = empresaParam || emp[0].id;
      setEmpresaId(eid);
      await load(eid);
    };
    init();
  }, [empresaParam]);

  const load = async (eid: string) => {
    setLoading(true);
    const { data } = await supabase
      .from("cuarteles")
      .select("*")
      .eq("empresa_id", eid)
      .order("codigo");
    setCuarteles((data as Cuartel[]) || []);
    setLoading(false);
  };

  const switchEmpresa = (eid: string) => {
    setEmpresaId(eid);
    router.push(`/cuarteles?empresa=${eid}`);
    // No llamar load() aquí — el useEffect lo dispara al cambiar empresaParam
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
      })
      .eq("id", editing.id);
    if (err) { setError(err.message); }
    else {
      setCuarteles((prev) => prev.map((c) => (c.id === editing.id ? editing : c)));
      setEditing(null);
    }
    setSaving(false);
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

  const empresa = empresas.find((e) => e.id === empresaId);

  return (
    <>
      <Nav empresaId={empresaId} />
      <main style={container}>
        <div style={empresaBar}>
          {empresas.map((e) => (
            <button
              key={e.id}
              onClick={() => switchEmpresa(e.id)}
              style={{ ...empresaBtn, ...(e.id === empresaId ? empresaBtnActive : {}) }}
            >
              {e.nombre}
            </button>
          ))}
        </div>

        <div style={pageHeader}>
          <div>
            <h1 style={pageTitle}>Cuarteles — {empresa?.nombre}</h1>
            <p style={pageSubtitle}>{cuarteles.filter((c) => c.activo).length} cuarteles activos</p>
          </div>
          <input
            placeholder="Buscar cuartel, especie, variedad..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={searchInput}
          />
        </div>

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
                        <button onClick={() => setEditing(c)} style={editBtn}>Editar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Modal historial de aplicaciones */}
        {historialCuartel && (
          <div style={overlay}>
            <div style={{ ...modal, maxWidth: "720px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h2 style={{ fontSize: "18px", fontWeight: 800, color: "#1a4731" }}>
                  Historial — Cuartel {historialCuartel.codigo}
                </h2>
                <button onClick={() => setHistorialCuartel(null)} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#6b7280", lineHeight: 1 }}>×</button>
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

        {/* Modal de edición */}
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
                  <select
                    value={editing.activo ? "true" : "false"}
                    onChange={(e) => setEditing({ ...editing, activo: e.target.value === "true" })}
                    style={inputStyle}
                  >
                    <option value="true">Sí</option>
                    <option value="false">No</option>
                  </select>
                </div>
              </div>
              {error && <p style={{ color: "#dc2626", fontSize: "13px", marginTop: "10px" }}>{error}</p>}
              <div style={modalFooter}>
                <button onClick={() => setEditing(null)} style={cancelBtn}>Cancelar</button>
                <button onClick={handleSave} style={saveBtn} disabled={saving}>
                  {saving ? "Guardando..." : "Guardar cambios"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

const container: React.CSSProperties = { maxWidth: "1400px", margin: "0 auto", padding: "28px 20px" };
const empresaBar: React.CSSProperties = { display: "flex", gap: "8px", marginBottom: "20px" };
const empresaBtn: React.CSSProperties = { padding: "8px 18px", borderRadius: "999px", border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: "13px", cursor: "pointer" };
const empresaBtnActive: React.CSSProperties = { background: "#1a4731", border: "1.5px solid #1a4731", color: "#fff" };
const pageHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", flexWrap: "wrap", gap: "12px" };
const pageTitle: React.CSSProperties = { fontSize: "24px", fontWeight: 800, color: "#1a4731" };
const pageSubtitle: React.CSSProperties = { fontSize: "13px", color: "#6b7280", marginTop: "4px" };
const searchInput: React.CSSProperties = { padding: "9px 14px", borderRadius: "10px", border: "1.5px solid #d1d5db", fontSize: "14px", width: "280px", background: "#fff" };
const table: React.CSSProperties = { width: "100%", background: "#fff", borderRadius: "14px", overflow: "hidden", border: "1px solid #e5e7eb", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" };
const th: React.CSSProperties = { padding: "10px 12px", background: "#f0f4f2", fontWeight: 700, fontSize: "12px", color: "#374151", textAlign: "left", whiteSpace: "nowrap", borderBottom: "1px solid #e5e7eb" };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: "13px", color: "#374151", borderBottom: "1px solid #f3f4f6", whiteSpace: "nowrap" };
const historialBtn: React.CSSProperties = { padding: "4px 12px", borderRadius: "6px", border: "1px solid #6b7280", background: "transparent", color: "#374151", fontSize: "12px", fontWeight: 600, cursor: "pointer" };
const editBtn: React.CSSProperties = { padding: "4px 12px", borderRadius: "6px", border: "1px solid #1a4731", background: "transparent", color: "#1a4731", fontSize: "12px", fontWeight: 700, cursor: "pointer" };
const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 };
const modal: React.CSSProperties = { background: "#fff", borderRadius: "16px", padding: "28px", width: "90%", maxWidth: "560px", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" };
const formGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" };
const formField: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "5px" };
const labelStyle: React.CSSProperties = { fontSize: "12px", fontWeight: 700, color: "#374151" };
const inputStyle: React.CSSProperties = { padding: "9px 12px", borderRadius: "8px", border: "1.5px solid #d1d5db", fontSize: "14px", background: "#fafafa" };
const modalFooter: React.CSSProperties = { display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" };
const cancelBtn: React.CSSProperties = { padding: "9px 18px", borderRadius: "8px", border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: "14px", cursor: "pointer" };
const saveBtn: React.CSSProperties = { padding: "9px 18px", borderRadius: "8px", background: "#1a4731", color: "#fff", fontWeight: 700, fontSize: "14px", border: "none", cursor: "pointer" };
import { Suspense } from "react"; export default function CuartelesPage() { return <Suspense><CuartelesContent /></Suspense>; }
