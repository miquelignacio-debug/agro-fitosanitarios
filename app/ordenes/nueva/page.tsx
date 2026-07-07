"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Nav from "@/lib/nav";
import type { Empresa, Cuartel, Operador, Maquinaria, Producto, Usuario } from "@/lib/types";
import { FUNCIONES_FITOSANITARIAS } from "@/lib/types";

type CuartelRow = { cuartel_id: string; superficie_ha: string };
type AplicadorRow = { operador_id: string; tractor_id: string; pulverizador_id: string; cantidad_maquinadas: string };
type ProductoRow = {
  producto_id: string;
  dosis_real: string;
  dosis_unidad: string;
  carencia_dias: string;
  rei_horas: string;
  consumo_total: string;
};

import { Suspense } from "react";
function NuevaOTContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const empresaId = searchParams.get("empresa") || "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Catálogos
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [cuarteles, setCuarteles] = useState<Cuartel[]>([]);
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [tractores, setTractores] = useState<Maquinaria[]>([]);
  const [pulverizadoras, setPulverizadoras] = useState<Maquinaria[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);

  // Cabecera
  const [empresa, setEmpresa] = useState(empresaId);
  const [campo, setCampo] = useState("");
  const [fechaSolicitud, setFechaSolicitud] = useState(new Date().toISOString().slice(0, 10));
  const [fechaAplicacion, setFechaAplicacion] = useState("");
  const [solicitanteId, setSolicitanteId] = useState("");
  const [responsableId, setResponsableId] = useState("");
  const [dosificadorId, setDosificadorId] = useState("");
  const [funciones, setFunciones] = useState<string[]>([]);
  const [plagasObjetivo, setPlagasObjetivo] = useState("");
  const [objetivoPrincipal, setObjetivoPrincipal] = useState("");
  const [mojamientoSol, setMojamientoSol] = useState("");
  const [notas, setNotas] = useState("");

  // Cuarteles
  const [cuartelesOT, setCuartelesOT] = useState<CuartelRow[]>([{ cuartel_id: "", superficie_ha: "" }]);

  // Aplicadores
  const [aplicadoresOT, setAplicadoresOT] = useState<AplicadorRow[]>([
    { operador_id: "", tractor_id: "", pulverizador_id: "", cantidad_maquinadas: "" },
  ]);

  // Productos
  const [productosOT, setProductosOT] = useState<ProductoRow[]>([
    { producto_id: "", dosis_real: "", dosis_unidad: "lt/ha", carencia_dias: "", rei_horas: "", consumo_total: "" },
  ]);

  // PPE
  const [ppe, setPpe] = useState({
    traje: false, guantes: false, anteojos: false, gorro: false, mascarilla: false, botas: false,
  });

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const [
        { data: emp }, { data: cua }, { data: op }, { data: mac }, { data: prod }, { data: usr },
      ] = await Promise.all([
        supabase.from("empresas").select("*").order("nombre"),
        supabase.from("cuarteles").select("*").eq("activo", true).order("codigo"),
        supabase.from("operadores").select("*").eq("activo", true).order("nombre"),
        supabase.from("maquinaria").select("*").eq("activo", true).order("codigo"),
        supabase.from("productos").select("*").eq("activo", true).order("nombre_comercial"),
        supabase.from("usuarios").select("*").order("nombre"),
      ]);

      setEmpresas((emp as Empresa[]) || []);
      setCuarteles((cua as Cuartel[]) || []);
      setOperadores((op as Operador[]) || []);
      const maq = (mac as Maquinaria[]) || [];
      setTractores(maq.filter((m) => m.tipo === "tractor"));
      setPulverizadoras(maq.filter((m) => m.tipo === "pulverizadora"));
      setProductos((prod as Producto[]) || []);
      setUsuarios((usr as Usuario[]) || []);
      if (!empresa && emp?.length) setEmpresa(emp[0].id);
      setLoading(false);
    };
    init();
  }, []);

  const cuartelesPorEmpresa = cuarteles.filter((c) => c.empresa_id === empresa);
  const toggleFuncion = (f: string) =>
    setFunciones((prev) => prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]);

  // Cuarteles OT handlers
  const setCuartelRow = (i: number, field: keyof CuartelRow, val: string) =>
    setCuartelesOT((rows) => rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  const addCuartel = () => setCuartelesOT((r) => [...r, { cuartel_id: "", superficie_ha: "" }]);
  const removeCuartel = (i: number) => setCuartelesOT((r) => r.filter((_, idx) => idx !== i));

  // Aplicadores OT handlers
  const setAplicadorRow = (i: number, field: keyof AplicadorRow, val: string) =>
    setAplicadoresOT((rows) => rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  const addAplicador = () =>
    setAplicadoresOT((r) => [...r, { operador_id: "", tractor_id: "", pulverizador_id: "", cantidad_maquinadas: "" }]);
  const removeAplicador = (i: number) => setAplicadoresOT((r) => r.filter((_, idx) => idx !== i));

  // Productos OT handlers
  const setProductoRow = (i: number, field: keyof ProductoRow, val: string) =>
    setProductosOT((rows) => rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  const addProducto = () =>
    setProductosOT((r) => [...r, { producto_id: "", dosis_real: "", dosis_unidad: "lt/ha", carencia_dias: "", rei_horas: "", consumo_total: "" }]);
  const removeProducto = (i: number) => setProductosOT((r) => r.filter((_, idx) => idx !== i));

  // Al seleccionar producto, pre-cargar PHI y REI
  const handleSelectProducto = (i: number, prodId: string) => {
    const prod = productos.find((p) => p.id === prodId);
    setProductosOT((rows) =>
      rows.map((r, idx) =>
        idx === i
          ? {
              ...r,
              producto_id: prodId,
              dosis_unidad: prod?.unidad_dosis || "lt/ha",
              carencia_dias: String(prod?.phi_dias ?? ""),
              rei_horas: String(prod?.rei_horas ?? ""),
            }
          : r
      )
    );
  };

  const handleSave = async (estado: "borrador" | "emitida") => {
    setError("");
    if (!empresa) { setError("Seleccioná una empresa."); return; }
    if (cuartelesOT.some((c) => !c.cuartel_id)) { setError("Completá todos los cuarteles o eliminá las filas vacías."); return; }
    if (productosOT.some((p) => !p.producto_id || !p.dosis_real)) { setError("Cada producto necesita nombre y dosis."); return; }

    setSaving(true);

    // Obtener siguiente número de OT
    const { data: numData } = await supabase.rpc("siguiente_numero_ot", { p_empresa_id: empresa });
    const numero = numData ?? 1;

    const { data: ot, error: otErr } = await supabase.from("ordenes_trabajo").insert({
      numero,
      empresa_id: empresa,
      campo: campo.trim() || null,
      fecha_solicitud: fechaSolicitud,
      fecha_aplicacion: fechaAplicacion || null,
      solicitante_id: solicitanteId || null,
      responsable_id: responsableId || null,
      dosificador_id: dosificadorId || null,
      funcion: funciones.length ? funciones : null,
      plagas_objetivo: plagasObjetivo.trim() || null,
      objetivo_principal: objetivoPrincipal.trim() || null,
      mojamiento_solicitado_ltha: mojamientoSol ? parseFloat(mojamientoSol) : null,
      ppe_traje: ppe.traje,
      ppe_guantes: ppe.guantes,
      ppe_anteojos: ppe.anteojos,
      ppe_gorro: ppe.gorro,
      ppe_mascarilla: ppe.mascarilla,
      ppe_botas: ppe.botas,
      notas: notas.trim() || null,
      estado,
    }).select("id").single();

    if (otErr || !ot) { setError(otErr?.message || "Error creando OT"); setSaving(false); return; }
    const otId = ot.id;

    // Insertar cuarteles
    const cuartelesInsert = cuartelesOT
      .filter((c) => c.cuartel_id)
      .map((c) => ({
        ot_id: otId,
        cuartel_id: c.cuartel_id,
        superficie_ha: parseFloat(c.superficie_ha) || 0,
      }));
    if (cuartelesInsert.length) await supabase.from("ot_cuarteles").insert(cuartelesInsert);

    // Insertar aplicadores
    const aplicadoresInsert = aplicadoresOT
      .filter((a) => a.operador_id)
      .map((a) => ({
        ot_id: otId,
        operador_id: a.operador_id,
        tractor_id: a.tractor_id || null,
        pulverizador_id: a.pulverizador_id || null,
        cantidad_maquinadas: a.cantidad_maquinadas ? parseFloat(a.cantidad_maquinadas) : null,
      }));
    if (aplicadoresInsert.length) await supabase.from("ot_aplicadores").insert(aplicadoresInsert);

    // Insertar productos
    const productosInsert = productosOT
      .filter((p) => p.producto_id && p.dosis_real)
      .map((p) => {
        const superficie = cuartelesInsert.reduce((sum, c) => sum + c.superficie_ha, 0);
        const dosisRealN = parseFloat(p.dosis_real);
        const consumoAuto = p.consumo_total ? parseFloat(p.consumo_total) : dosisRealN * superficie;
        const carencia = parseInt(p.carencia_dias) || 0;
        const fechaViable = fechaAplicacion
          ? new Date(new Date(fechaAplicacion).getTime() + carencia * 86400000).toISOString().slice(0, 10)
          : null;
        return {
          ot_id: otId,
          producto_id: p.producto_id,
          dosis_real: dosisRealN,
          dosis_unidad: p.dosis_unidad,
          carencia_dias: carencia,
          rei_horas: parseInt(p.rei_horas) || 0,
          fecha_viable: fechaViable,
          consumo_total: consumoAuto || null,
        };
      });
    if (productosInsert.length) await supabase.from("ot_productos").insert(productosInsert);

    setSaving(false);
    router.push(`/ordenes/${otId}${empresa ? `?empresa=${empresa}` : ""}`);
  };

  if (loading) return <><Nav empresaId={empresaId} /><main style={container}><p style={{ color: "#6b7280" }}>Cargando...</p></main></>;

  return (
    <>
      <Nav empresaId={empresaId} />
      <main style={container}>
        <div style={pageHeader}>
          <h1 style={pageTitle}>Nueva Orden de Trabajo</h1>
        </div>

        <div style={formCard}>
          {/* ── Cabecera ── */}
          <section style={section}>
            <h2 style={sectionTitle}>Identificación</h2>
            <div style={grid2}>
              <Field label="Empresa *">
                <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} style={inputStyle}>
                  <option value="">— Seleccionar —</option>
                  {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
              </Field>
              <Field label="Campo / Fundo">
                <input value={campo} onChange={(e) => setCampo(e.target.value)} style={inputStyle} placeholder="Nombre del campo" />
              </Field>
              <Field label="Fecha solicitud">
                <input type="date" value={fechaSolicitud} onChange={(e) => setFechaSolicitud(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Fecha aplicación">
                <input type="date" value={fechaAplicacion} onChange={(e) => setFechaAplicacion(e.target.value)} style={inputStyle} />
              </Field>
            </div>
          </section>

          {/* ── Responsables ── */}
          <section style={section}>
            <h2 style={sectionTitle}>Responsables</h2>
            <div style={grid3}>
              <Field label="Solicitante">
                <select value={solicitanteId} onChange={(e) => setSolicitanteId(e.target.value)} style={inputStyle}>
                  <option value="">— Seleccionar —</option>
                  {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                </select>
              </Field>
              <Field label="Responsable técnico">
                <select value={responsableId} onChange={(e) => setResponsableId(e.target.value)} style={inputStyle}>
                  <option value="">— Seleccionar —</option>
                  {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                </select>
              </Field>
              <Field label="Dosificador">
                <select value={dosificadorId} onChange={(e) => setDosificadorId(e.target.value)} style={inputStyle}>
                  <option value="">— Seleccionar —</option>
                  {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                </select>
              </Field>
            </div>
          </section>

          {/* ── Objetivo ── */}
          <section style={section}>
            <h2 style={sectionTitle}>Objetivo de la aplicación</h2>
            <div style={{ marginBottom: "14px" }}>
              <label style={labelStyle}>Función fitosanitaria</label>
              <div style={{ ...chipRow, marginTop: "8px" }}>
                {FUNCIONES_FITOSANITARIAS.map((f) => (
                  <button
                    key={f} type="button" onClick={() => toggleFuncion(f)}
                    style={{ ...chip, ...(funciones.includes(f) ? chipActive : {}) }}
                  >{f}</button>
                ))}
              </div>
            </div>
            <div style={grid2}>
              <Field label="Plagas / enfermedades objetivo">
                <input value={plagasObjetivo} onChange={(e) => setPlagasObjetivo(e.target.value)} style={inputStyle} placeholder="Ej. Botrytis, Oídio..." />
              </Field>
              <Field label="Objetivo principal">
                <input value={objetivoPrincipal} onChange={(e) => setObjetivoPrincipal(e.target.value)} style={inputStyle} placeholder="Control preventivo / curativo..." />
              </Field>
              <Field label="Mojamiento solicitado (lt/ha)">
                <input type="number" min="0" value={mojamientoSol} onChange={(e) => setMojamientoSol(e.target.value)} style={inputStyle} placeholder="Ej. 500" />
              </Field>
            </div>
          </section>

          {/* ── Cuarteles ── */}
          <section style={section}>
            <h2 style={sectionTitle}>Cuarteles a tratar</h2>
            {cuartelesOT.map((row, i) => (
              <div key={i} style={rowWrap}>
                <div style={{ flex: 2 }}>
                  <Field label={i === 0 ? "Cuartel" : ""}>
                    <select value={row.cuartel_id} onChange={(e) => setCuartelRow(i, "cuartel_id", e.target.value)} style={inputStyle}>
                      <option value="">— Seleccionar —</option>
                      {cuartelesPorEmpresa.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.codigo} — {c.especie} {c.variedad} ({c.superficie_real ?? "?"}ha)
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div style={{ flex: 1 }}>
                  <Field label={i === 0 ? "Superficie (ha)" : ""}>
                    <input
                      type="number" min="0" step="0.01"
                      value={row.superficie_ha}
                      onChange={(e) => {
                        setCuartelRow(i, "superficie_ha", e.target.value);
                      }}
                      onFocus={() => {
                        if (!row.superficie_ha && row.cuartel_id) {
                          const c = cuarteles.find((c) => c.id === row.cuartel_id);
                          if (c?.superficie_real) setCuartelRow(i, "superficie_ha", String(c.superficie_real));
                        }
                      }}
                      style={inputStyle}
                      placeholder="Ha"
                    />
                  </Field>
                </div>
                {cuartelesOT.length > 1 && (
                  <button onClick={() => removeCuartel(i)} style={removeBtn} type="button">✕</button>
                )}
              </div>
            ))}
            <button onClick={addCuartel} style={addBtn} type="button">+ Agregar cuartel</button>
          </section>

          {/* ── Aplicadores ── */}
          <section style={section}>
            <h2 style={sectionTitle}>Aplicadores y maquinaria</h2>
            {aplicadoresOT.map((row, i) => (
              <div key={i} style={rowWrap}>
                <div style={{ flex: 2 }}>
                  <Field label={i === 0 ? "Operador" : ""}>
                    <select value={row.operador_id} onChange={(e) => setAplicadorRow(i, "operador_id", e.target.value)} style={inputStyle}>
                      <option value="">— Seleccionar —</option>
                      {operadores.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                    </select>
                  </Field>
                </div>
                <div style={{ flex: 2 }}>
                  <Field label={i === 0 ? "Tractor" : ""}>
                    <select value={row.tractor_id} onChange={(e) => setAplicadorRow(i, "tractor_id", e.target.value)} style={inputStyle}>
                      <option value="">— Sin asignar —</option>
                      {tractores.map((t) => <option key={t.id} value={t.id}>{t.codigo} {t.descripcion ? `— ${t.descripcion}` : ""}</option>)}
                    </select>
                  </Field>
                </div>
                <div style={{ flex: 2 }}>
                  <Field label={i === 0 ? "Pulverizadora" : ""}>
                    <select value={row.pulverizador_id} onChange={(e) => setAplicadorRow(i, "pulverizador_id", e.target.value)} style={inputStyle}>
                      <option value="">— Sin asignar —</option>
                      {pulverizadoras.map((p) => <option key={p.id} value={p.id}>{p.codigo} {p.descripcion ? `— ${p.descripcion}` : ""}</option>)}
                    </select>
                  </Field>
                </div>
                <div style={{ flex: 1 }}>
                  <Field label={i === 0 ? "Maquinadas" : ""}>
                    <input type="number" min="0" step="0.1" value={row.cantidad_maquinadas} onChange={(e) => setAplicadorRow(i, "cantidad_maquinadas", e.target.value)} style={inputStyle} placeholder="N°" />
                  </Field>
                </div>
                {aplicadoresOT.length > 1 && (
                  <button onClick={() => removeAplicador(i)} style={removeBtn} type="button">✕</button>
                )}
              </div>
            ))}
            <button onClick={addAplicador} style={addBtn} type="button">+ Agregar aplicador</button>
          </section>

          {/* ── Productos ── */}
          <section style={section}>
            <h2 style={sectionTitle}>Productos a aplicar</h2>
            {productosOT.map((row, i) => {
              const prod = productos.find((p) => p.id === row.producto_id);
              return (
                <div key={i} style={{ ...rowWrap, flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
                  <div style={{ flex: "3 1 200px" }}>
                    <Field label={i === 0 ? "Producto" : ""}>
                      <select value={row.producto_id} onChange={(e) => handleSelectProducto(i, e.target.value)} style={inputStyle}>
                        <option value="">— Seleccionar —</option>
                        {productos.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre_comercial}
                            {p.especies_autorizadas?.length ? ` (${p.especies_autorizadas.join(", ")})` : ""}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <div style={{ flex: "1 1 90px" }}>
                    <Field label={i === 0 ? "Dosis real" : ""}>
                      <input type="number" min="0" step="0.001" value={row.dosis_real} onChange={(e) => setProductoRow(i, "dosis_real", e.target.value)} style={inputStyle} placeholder="0.00" />
                    </Field>
                  </div>
                  <div style={{ flex: "1 1 100px" }}>
                    <Field label={i === 0 ? "Unidad" : ""}>
                      <select value={row.dosis_unidad} onChange={(e) => setProductoRow(i, "dosis_unidad", e.target.value)} style={inputStyle}>
                        {["lt/ha", "kg/ha", "ml/ha", "g/ha", "g/100lt", "ml/100lt", "cc/100lt"].map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <div style={{ flex: "1 1 80px" }}>
                    <Field label={i === 0 ? "PHI días" : ""}>
                      <input type="number" min="0" value={row.carencia_dias} onChange={(e) => setProductoRow(i, "carencia_dias", e.target.value)} style={inputStyle} />
                    </Field>
                  </div>
                  <div style={{ flex: "1 1 80px" }}>
                    <Field label={i === 0 ? "REI horas" : ""}>
                      <input type="number" min="0" value={row.rei_horas} onChange={(e) => setProductoRow(i, "rei_horas", e.target.value)} style={inputStyle} />
                    </Field>
                  </div>
                  {prod && prod.especies_autorizadas && (
                    <div style={{ flex: "100% 0 0", paddingLeft: "2px" }}>
                      <span style={{ fontSize: "11px", color: "#6b7280" }}>
                        Autorizado en: {prod.especies_autorizadas.join(", ")}
                      </span>
                    </div>
                  )}
                  {productosOT.length > 1 && (
                    <button onClick={() => removeProducto(i)} style={removeBtn} type="button">✕</button>
                  )}
                </div>
              );
            })}
            <button onClick={addProducto} style={addBtn} type="button">+ Agregar producto</button>
          </section>

          {/* ── PPE ── */}
          <section style={section}>
            <h2 style={sectionTitle}>Equipos de protección personal (PPE)</h2>
            <div style={ppeGrid}>
              {(["traje", "guantes", "anteojos", "gorro", "mascarilla", "botas"] as const).map((item) => (
                <label key={item} style={ppeLabel}>
                  <input
                    type="checkbox"
                    checked={ppe[item]}
                    onChange={(e) => setPpe((p) => ({ ...p, [item]: e.target.checked }))}
                  />
                  {item.charAt(0).toUpperCase() + item.slice(1)}
                </label>
              ))}
            </div>
          </section>

          {/* ── Notas ── */}
          <section style={{ ...section, borderBottom: "none" }}>
            <h2 style={sectionTitle}>Notas</h2>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              style={{ ...inputStyle, height: "70px", resize: "vertical" }}
              placeholder="Observaciones adicionales..."
            />
          </section>

          {error && <p style={errorStyle}>{error}</p>}

          <div style={footerRow}>
            <button onClick={() => router.push(`/ordenes${empresaId ? `?empresa=${empresaId}` : ""}`)} style={cancelBtn} type="button">
              Cancelar
            </button>
            <button onClick={() => handleSave("borrador")} style={draftBtn} disabled={saving} type="button">
              {saving ? "..." : "Guardar borrador"}
            </button>
            <button onClick={() => handleSave("emitida")} style={saveBtn} disabled={saving} type="button">
              {saving ? "Guardando..." : "Emitir OT"}
            </button>
          </div>
        </div>
      </main>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
      {label && <label style={labelStyle}>{label}</label>}
      {children}
    </div>
  );
}

const container: React.CSSProperties = { maxWidth: "960px", margin: "0 auto", padding: "28px 20px" };
const pageHeader: React.CSSProperties = { marginBottom: "24px" };
const pageTitle: React.CSSProperties = { fontSize: "24px", fontWeight: 800, color: "#1a4731" };
const formCard: React.CSSProperties = { background: "#fff", borderRadius: "16px", border: "1px solid #e5e7eb", overflow: "hidden" };
const section: React.CSSProperties = { padding: "22px 26px", borderBottom: "1px solid #f3f4f6" };
const sectionTitle: React.CSSProperties = { fontSize: "13px", fontWeight: 700, color: "#1a4731", marginBottom: "14px", textTransform: "uppercase", letterSpacing: "0.05em" };
const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" };
const grid3: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" };
const labelStyle: React.CSSProperties = { fontSize: "12px", fontWeight: 700, color: "#374151" };
const inputStyle: React.CSSProperties = { padding: "9px 12px", borderRadius: "8px", border: "1.5px solid #d1d5db", fontSize: "14px", background: "#fafafa", color: "#111", width: "100%", boxSizing: "border-box" };
const chipRow: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: "6px" };
const chip: React.CSSProperties = { padding: "4px 10px", borderRadius: "999px", border: "1.5px solid #d1d5db", background: "#fff", fontSize: "11px", fontWeight: 600, cursor: "pointer", color: "#374151" };
const chipActive: React.CSSProperties = { background: "#1a4731", color: "#fff", borderColor: "#1a4731" };
const rowWrap: React.CSSProperties = { display: "flex", gap: "10px", alignItems: "flex-end", marginBottom: "10px" };
const addBtn: React.CSSProperties = { marginTop: "6px", padding: "6px 14px", borderRadius: "8px", border: "1.5px solid #1a4731", background: "transparent", color: "#1a4731", fontSize: "13px", fontWeight: 700, cursor: "pointer" };
const removeBtn: React.CSSProperties = { padding: "8px 10px", borderRadius: "8px", border: "1px solid #fca5a5", background: "transparent", color: "#dc2626", fontSize: "14px", cursor: "pointer", flexShrink: 0, marginBottom: "1px" };
const ppeGrid: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: "16px" };
const ppeLabel: React.CSSProperties = { display: "flex", gap: "6px", alignItems: "center", fontSize: "14px", cursor: "pointer", fontWeight: 500 };
const errorStyle: React.CSSProperties = { margin: "0 26px 12px", fontSize: "13px", color: "#dc2626", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", padding: "10px 14px" };
const footerRow: React.CSSProperties = { padding: "18px 26px", display: "flex", justifyContent: "flex-end", gap: "10px" };
const cancelBtn: React.CSSProperties = { padding: "9px 20px", borderRadius: "8px", border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: "14px", cursor: "pointer" };
const draftBtn: React.CSSProperties = { padding: "9px 20px", borderRadius: "8px", border: "1.5px solid #1a4731", background: "#fff", color: "#1a4731", fontWeight: 700, fontSize: "14px", cursor: "pointer" };
const saveBtn: React.CSSProperties = { padding: "9px 20px", borderRadius: "8px", background: "#1a4731", color: "#fff", fontWeight: 700, fontSize: "14px", border: "none", cursor: "pointer" };
export default function NuevaOTPage() { return <Suspense><NuevaOTContent /></Suspense>; }
