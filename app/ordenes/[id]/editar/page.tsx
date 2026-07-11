"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { supabase } from "@/lib/supabaseClient";
import Nav from "@/lib/nav";
import type { Empresa, Cuartel, Maquinaria, Producto, Personal } from "@/lib/types";
import { FUNCIONES_FITOSANITARIAS } from "@/lib/types";

type CuartelRow   = { cuartel_id: string; superficie_ha: string };
type AplicadorRow = { personal_id: string; tractor_id: string; pulverizador_id: string; cantidad_maquinadas: string };
type ProductoRow  = { producto_id: string; dosis_real: string; dosis_unidad: string; carencia_dias: string; rei_horas: string };
type CatalogPlaga = { id: string; nombre: string; tipo: string; activo: boolean };

function EditarOTContent() {
  const router       = useRouter();
  const params       = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const empresaId    = searchParams.get("empresa") || "";

  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");

  // Catálogos
  const [cuarteles,     setCuarteles]     = useState<Cuartel[]>([]);
  const [tractores,     setTractores]     = useState<Maquinaria[]>([]);
  const [implementos,   setImplementos]   = useState<Maquinaria[]>([]);
  const [productos,     setProductos]     = useState<Producto[]>([]);
  const [personal,      setPersonal]      = useState<Personal[]>([]);
  const [catalogPlagas, setCatalogPlagas] = useState<CatalogPlaga[]>([]);
  const [empresa,       setEmpresa]       = useState(empresaId);
  const [stockProductoIds, setStockProductoIds] = useState<Set<string>>(new Set());
  const [empresas,      setEmpresas]      = useState<Empresa[]>([]);

  // Campos de cabecera
  const [fechaSolicitud,    setFechaSolicitud]     = useState("");
  const [fechaAplicacion,   setFechaAplicacion]   = useState("");
  const [horaInicio,        setHoraInicio]         = useState("05:00");
  const [horaFin,           setHoraFin]            = useState("12:00");
  const [solicitanteId,     setSolicitanteId]      = useState("");
  const [responsableId,     setResponsableId]      = useState("");
  const [dosificadorId,     setDosificadorId]      = useState("");
  const [funciones,         setFunciones]          = useState<string[]>([]);
  const [plagasObjetivo,    setPlagasObjetivo]     = useState<string[]>([]);
  const [objetivoPrincipal, setObjetivoPrincipal]  = useState("");
  const [mojamientoSol,     setMojamientoSol]      = useState("");
  const [notas,             setNotas]              = useState("");

  // Filas dinámicas
  const [cuartelesOT, setCuartelesOT] = useState<CuartelRow[]>([]);
  const [aplicadorOT, setAplicadorOT] = useState<AplicadorRow>({ personal_id: "", tractor_id: "", pulverizador_id: "", cantidad_maquinadas: "" });
  const [productosOT, setProductosOT] = useState<ProductoRow[]>([]);

  // PPE
  const [ppe, setPpe] = useState({ traje: false, guantes: false, anteojos: false, gorro: false, mascarilla: false, botas: false });

  // ── Carga inicial: catálogos + datos existentes ────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const [
        { data: emp }, { data: cua }, { data: mac }, { data: prod }, { data: pers }, { data: plagas },
      ] = await Promise.all([
        supabase.from("empresas").select("*").order("nombre"),
        supabase.from("cuarteles").select("*").eq("activo", true).order("codigo"),
        supabase.from("maquinaria").select("*").eq("activo", true).order("codigo"),
        supabase.from("productos").select("*").eq("activo", true).order("nombre_comercial").limit(5000),
        supabase.from("personal").select("*").eq("activo", true).order("nombre"),
        supabase.from("plagas_objetivos").select("*").eq("activo", true).order("tipo").order("nombre"),
      ]);

      setEmpresas((emp as Empresa[]) || []);
      setCuarteles((cua as Cuartel[]) || []);
      const maq = (mac as Maquinaria[]) || [];
      setTractores(maq.filter(m => m.tipo === "tractor"));
      setImplementos(maq.filter(m => m.tipo === "implemento"));
      setProductos((prod as Producto[]) || []);
      setPersonal((pers as Personal[]) || []);
      setCatalogPlagas((plagas as CatalogPlaga[]) || []);

      // Cargar OT existente
      let otResult = await supabase
        .from("ordenes_trabajo")
        .select(`*, ot_cuarteles(cuartel_id, superficie_ha), ot_aplicadores(personal_id, operador_id, tractor_id, pulverizador_id, cantidad_maquinadas), ot_productos(producto_id, dosis_real, dosis_unidad, carencia_dias, rei_horas)`)
        .eq("id", params.id)
        .single();

      const { data: ot, error: otErr } = otResult;
      if (otErr || !ot) { setError("No se pudo cargar la OT."); setLoading(false); return; }

      // Solo editable en borrador o emitida
      if (ot.estado !== "borrador" && ot.estado !== "emitida") {
        router.push(`/ordenes/${params.id}${empresaId ? `?empresa=${empresaId}` : ""}`);
        return;
      }

      const eid = ot.empresa_id || empresaId;
      setEmpresa(eid);
      setFechaSolicitud(ot.fecha_solicitud || "");
      setFechaAplicacion(ot.fecha_aplicacion || "");
      setHoraInicio(ot.hora_inicio || "05:00");
      setHoraFin(ot.hora_fin || "12:00");
      setSolicitanteId(ot.solicitante_id || "");
      setResponsableId(ot.responsable_id || "");
      setDosificadorId(ot.dosificador_id || "");
      setFunciones(ot.funcion || []);
      setPlagasObjetivo(ot.plagas_objetivo ? ot.plagas_objetivo.split(", ").filter(Boolean) : []);
      setObjetivoPrincipal(ot.objetivo_principal || "");
      setMojamientoSol(String(ot.mojamiento_solicitado_ltha || ""));
      setNotas(ot.notas || "");
      setPpe({
        traje:     !!ot.ppe_traje,
        guantes:   !!ot.ppe_guantes,
        anteojos:  !!ot.ppe_anteojos,
        gorro:     !!ot.ppe_gorro,
        mascarilla:!!ot.ppe_mascarilla,
        botas:     !!ot.ppe_botas,
      });

      // Cuarteles
      const cuartelesData = (ot.ot_cuarteles as { cuartel_id: string; superficie_ha: number }[]) || [];
      setCuartelesOT(cuartelesData.map(c => ({ cuartel_id: c.cuartel_id, superficie_ha: String(c.superficie_ha) })));
      if (cuartelesData.length === 0) setCuartelesOT([{ cuartel_id: "", superficie_ha: "" }]);

      // Aplicador (primer registro)
      const apls = (ot.ot_aplicadores as { personal_id?: string; operador_id?: string; tractor_id?: string; pulverizador_id?: string; cantidad_maquinadas?: number }[]) || [];
      if (apls.length > 0) {
        const a = apls[0];
        setAplicadorOT({
          personal_id:        a.personal_id || "",
          tractor_id:         a.tractor_id || "",
          pulverizador_id:    a.pulverizador_id || "",
          cantidad_maquinadas: String(a.cantidad_maquinadas ?? ""),
        });
      }

      // Productos
      const prodsData = (ot.ot_productos as { producto_id: string; dosis_real: number; dosis_unidad: string; carencia_dias: number; rei_horas: number }[]) || [];
      setProductosOT(prodsData.map(p => ({
        producto_id:  p.producto_id,
        dosis_real:   String(p.dosis_real),
        dosis_unidad: p.dosis_unidad,
        carencia_dias: String(p.carencia_dias),
        rei_horas:    String(p.rei_horas),
      })));
      if (prodsData.length === 0) setProductosOT([{ producto_id: "", dosis_real: "", dosis_unidad: "lt/ha", carencia_dias: "", rei_horas: "" }]);

      setLoading(false);
    };
    init();
  }, [params.id]);

  // ── Stock disponible ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!empresa) { setStockProductoIds(new Set()); return; }
    supabase.from("stock_actual")
      .select("producto_id")
      .eq("empresa_id", empresa)
      .then(({ data }) => {
        setStockProductoIds(new Set(((data || []) as { producto_id: string }[]).map(r => r.producto_id)));
      });
  }, [empresa]);

  // ── Computed ──────────────────────────────────────────────────────────────
  const cuartelesPorEmpresa = cuarteles.filter(c => c.empresa_id === empresa);
  const personalSolicitante = personal.filter(p => p.cargo === "Solicitante");
  const personalResponsable = personal.filter(p => p.cargo === "Responsable técnico");
  const personalDosificador = personal.filter(p => p.cargo === "Dosificador");
  const personalAplicador   = personal.filter(p => p.cargo === "Aplicador");
  const toggleFuncion       = (f: string) => setFunciones(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);

  const productosFiltrados = (() => {
    let list = stockProductoIds.size > 0 ? productos.filter(p => stockProductoIds.has(p.id)) : productos;
    if (funciones.length > 0) list = list.filter(p => p.tipo_funcion?.some(f => funciones.includes(f)));
    return list;
  })();

  // ── Handlers cuarteles ────────────────────────────────────────────────────
  const setCuartelRow = (i: number, field: keyof CuartelRow, val: string) =>
    setCuartelesOT(rows => rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  const addCuartel    = () => setCuartelesOT(r => [...r, { cuartel_id: "", superficie_ha: "" }]);
  const removeCuartel = (i: number) => setCuartelesOT(r => r.filter((_, idx) => idx !== i));

  // ── Maquinadas ────────────────────────────────────────────────────────────
  const calcMaquinadas = (pulvId: string, cuarts?: CuartelRow[], moj?: string): string => {
    const c = cuarts ?? cuartelesOT;
    const mojVal = parseFloat(moj ?? mojamientoSol) || 0;
    const sup = c.reduce((s, r) => s + (parseFloat(r.superficie_ha) || 0), 0);
    if (!sup || !mojVal || !pulvId) return "";
    const pulv = implementos.find(p => p.id === pulvId);
    if (!pulv?.capacidad_lt) return "";
    return String(Math.ceil(sup * mojVal / pulv.capacidad_lt));
  };

  const getMaquinadasDetalle = (): string => {
    if (!aplicadorOT.pulverizador_id || !mojamientoSol) return "";
    const pulv = implementos.find(p => p.id === aplicadorOT.pulverizador_id);
    if (!pulv?.capacidad_lt) return "";
    const sup = cuartelesOT.reduce((s, r) => s + (parseFloat(r.superficie_ha) || 0), 0);
    const moj = parseFloat(mojamientoSol) || 0;
    if (!sup || !moj) return "";
    const lts = sup * moj;
    const completas = Math.floor(lts / pulv.capacidad_lt);
    const saldo = Math.round(lts - completas * pulv.capacidad_lt);
    return saldo < 1 ? `${completas} maquinadas` : `${completas} maquinadas y ${saldo} lt de saldo`;
  };

  const recalcMaquinadas = (newCuarts?: CuartelRow[], newMoj?: string) => {
    setAplicadorOT(prev => prev.pulverizador_id
      ? { ...prev, cantidad_maquinadas: calcMaquinadas(prev.pulverizador_id, newCuarts, newMoj) }
      : prev
    );
  };

  const handleAplicadorField = (field: keyof AplicadorRow, val: string) => {
    setAplicadorOT(prev => {
      const updated = { ...prev, [field]: val };
      if (field === "pulverizador_id") updated.cantidad_maquinadas = val ? calcMaquinadas(val) : "";
      return updated;
    });
  };

  const handleCuartelSuperficie = (i: number, val: string) => {
    const nc = cuartelesOT.map((r, idx) => idx === i ? { ...r, superficie_ha: val } : r);
    setCuartelesOT(nc);
    recalcMaquinadas(nc);
  };

  const handleMojamiento = (val: string) => { setMojamientoSol(val); recalcMaquinadas(undefined, val); };

  // ── Handlers productos ────────────────────────────────────────────────────
  const setProductoRow = (i: number, field: keyof ProductoRow, val: string) =>
    setProductosOT(rows => rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  const addProducto    = () =>
    setProductosOT(r => [...r, { producto_id: "", dosis_real: "", dosis_unidad: "lt/ha", carencia_dias: "", rei_horas: "" }]);
  const removeProducto = (i: number) => setProductosOT(r => r.filter((_, idx) => idx !== i));

  const handleSelectProducto = (i: number, prodId: string) => {
    const prod = productos.find(p => p.id === prodId);
    setProductosOT(rows => rows.map((r, idx) =>
      idx === i ? { ...r, producto_id: prodId, dosis_unidad: prod?.unidad_dosis || "lt/ha", carencia_dias: String(prod?.phi_dias ?? ""), rei_horas: String(prod?.rei_horas ?? "") } : r
    ));
  };

  // ── Cálculo dosis por maquinada ───────────────────────────────────────────
  const calcDosisDetalle = (row: ProductoRow): string[] | null => {
    const dosis = parseFloat(row.dosis_real);
    if (!dosis || !aplicadorOT.pulverizador_id || !mojamientoSol) return null;
    const pulv = implementos.find(p => p.id === aplicadorOT.pulverizador_id);
    if (!pulv?.capacidad_lt) return null;
    const sup = cuartelesOT.reduce((s, r) => s + (parseFloat(r.superficie_ha) || 0), 0);
    const moj = parseFloat(mojamientoSol) || 0;
    if (!sup || !moj) return null;
    const litrosSaldo = (sup * moj) % pulv.capacidad_lt;
    const unit = row.dosis_unidad.split("/")[0];
    let dosisMaq: number, dosisSaldo: number;
    if (row.dosis_unidad.includes("/100")) {
      dosisMaq   = dosis * (pulv.capacidad_lt / 100);
      dosisSaldo = dosis * (litrosSaldo / 100);
    } else if (row.dosis_unidad.includes("/ha")) {
      dosisMaq   = dosis * (pulv.capacidad_lt / moj);
      dosisSaldo = dosis * (litrosSaldo / moj);
    } else return null;
    const fmt = (n: number) => n < 10 ? n.toFixed(2) : n.toFixed(1);
    const lines = [`${fmt(dosisMaq)} ${unit}/maquinada`];
    if (litrosSaldo > 1) lines.push(`Saldo: ${fmt(dosisSaldo)} ${unit} (${Math.round(litrosSaldo)} lt)`);
    return lines;
  };

  // ── Guardar ──────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setError("");
    if (cuartelesOT.some(c => !c.cuartel_id)) { setError("Completa todos los cuarteles o elimina las filas vacías."); return; }
    if (productosOT.some(p => !p.producto_id || !p.dosis_real)) { setError("Cada producto necesita nombre y dosis."); return; }
    setSaving(true);

    // Actualizar cabecera OT (no cambia el estado)
    const { error: otErr } = await supabase.from("ordenes_trabajo").update({
      fecha_solicitud:          fechaSolicitud || null,
      fecha_aplicacion:         fechaAplicacion || null,
      hora_inicio:              horaInicio || null,
      hora_fin:                 horaFin || null,
      solicitante_id:           solicitanteId || null,
      responsable_id:           responsableId || null,
      dosificador_id:           dosificadorId || null,
      funcion:                  funciones.length ? funciones : null,
      plagas_objetivo:          plagasObjetivo.length ? plagasObjetivo.join(", ") : null,
      objetivo_principal:       objetivoPrincipal.trim() || null,
      mojamiento_solicitado_ltha: mojamientoSol ? parseFloat(mojamientoSol) : null,
      ppe_traje:      ppe.traje,
      ppe_guantes:    ppe.guantes,
      ppe_anteojos:   ppe.anteojos,
      ppe_gorro:      ppe.gorro,
      ppe_mascarilla: ppe.mascarilla,
      ppe_botas:      ppe.botas,
      notas:          notas.trim() || null,
      updated_at:     new Date().toISOString(),
    }).eq("id", params.id);

    if (otErr) { setError(otErr.message); setSaving(false); return; }

    // Borrar y re-insertar sub-tablas
    await supabase.from("ot_aplicadores").delete().eq("ot_id", params.id);
    await supabase.from("ot_cuarteles").delete().eq("ot_id", params.id);
    await supabase.from("ot_productos").delete().eq("ot_id", params.id);

    const superficieTotal = cuartelesOT.reduce((s, c) => s + (parseFloat(c.superficie_ha) || 0), 0);

    const productosRows = productosOT.filter(p => p.producto_id && p.dosis_real).map(p => {
      const dosis    = parseFloat(p.dosis_real);
      const carencia = parseInt(p.carencia_dias) || 0;
      return {
        ot_id:        params.id,
        producto_id:  p.producto_id,
        dosis_real:   dosis,
        dosis_unidad: p.dosis_unidad,
        carencia_dias: carencia,
        rei_horas:    parseInt(p.rei_horas) || 0,
        fecha_viable: fechaAplicacion
          ? new Date(new Date(fechaAplicacion).getTime() + carencia * 86400000).toISOString().slice(0, 10)
          : null,
        consumo_total: p.dosis_unidad.includes("/ha") ? Math.round(dosis * superficieTotal * 1000) / 1000 : null,
      };
    });

    const aplicadorRow = aplicadorOT.personal_id ? {
      ot_id:               params.id,
      personal_id:         aplicadorOT.personal_id,
      tractor_id:          aplicadorOT.tractor_id || null,
      pulverizador_id:     aplicadorOT.pulverizador_id || null,
      cantidad_maquinadas: aplicadorOT.cantidad_maquinadas ? parseFloat(aplicadorOT.cantidad_maquinadas) : null,
    } : null;

    await Promise.all([
      supabase.from("ot_cuarteles").insert(
        cuartelesOT.filter(c => c.cuartel_id).map(c => ({
          ot_id: params.id, cuartel_id: c.cuartel_id, superficie_ha: parseFloat(c.superficie_ha) || 0,
        }))
      ),
      supabase.from("ot_productos").insert(productosRows),
      ...(aplicadorRow ? [supabase.from("ot_aplicadores").insert(aplicadorRow)] : []),
    ]);

    setSaving(false);
    router.push(`/ordenes/${params.id}${empresaId ? `?empresa=${empresaId}` : ""}`);
  };

  if (loading) return <><Nav empresaId={empresaId} /><main style={container}><p style={{ color: "#6b7280" }}>Cargando...</p></main></>;

  const maquinadasDetalle = getMaquinadasDetalle();

  return (
    <>
      <Nav empresaId={empresaId} />
      <main style={container}>
        <div style={pageHeader}>
          <div>
            <button onClick={() => router.push(`/ordenes/${params.id}${empresaId ? `?empresa=${empresaId}` : ""}`)} style={backBtn}>← Volver a la OT</button>
            <h1 style={pageTitle}>Editar OT</h1>
          </div>
        </div>

        <div style={formCard}>
          {/* ── Identificación ── */}
          <section style={section}>
            <h2 style={sectionTitle}>Identificación</h2>
            <div style={grid2}>
              <Field label="Empresa">
                <select value={empresa} onChange={e => setEmpresa(e.target.value)} style={inputStyle}>
                  {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
              </Field>
              <Field label="Fecha aplicación">
                <input type="date" value={fechaAplicacion} onChange={e => setFechaAplicacion(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Hora inicio">
                <input type="time" value={horaInicio} onChange={e => setHoraInicio(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Hora fin">
                <input type="time" value={horaFin} onChange={e => setHoraFin(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Fecha solicitud">
                <input type="date" value={fechaSolicitud} onChange={e => setFechaSolicitud(e.target.value)} style={inputStyle} />
              </Field>
            </div>
          </section>

          {/* ── Responsables ── */}
          <section style={section}>
            <h2 style={sectionTitle}>Responsables</h2>
            <div style={grid3}>
              <Field label="Solicitante">
                <select value={solicitanteId} onChange={e => setSolicitanteId(e.target.value)} style={inputStyle}>
                  <option value="">— Seleccionar —</option>
                  {personalSolicitante.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </Field>
              <Field label="Responsable técnico">
                <select value={responsableId} onChange={e => setResponsableId(e.target.value)} style={inputStyle}>
                  <option value="">— Seleccionar —</option>
                  {personalResponsable.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </Field>
              <Field label="Dosificador">
                <select value={dosificadorId} onChange={e => setDosificadorId(e.target.value)} style={inputStyle}>
                  <option value="">— Seleccionar —</option>
                  {personalDosificador.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </Field>
            </div>
          </section>

          {/* ── Objetivo ── */}
          <section style={section}>
            <h2 style={sectionTitle}>Objetivo de la aplicación</h2>
            <div style={{ marginBottom: "14px" }}>
              <label style={labelStyle}>Función fitosanitaria</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                {FUNCIONES_FITOSANITARIAS.map(f => (
                  <button key={f} type="button" onClick={() => toggleFuncion(f)}
                    style={{ padding: "5px 12px", borderRadius: "999px", border: "1.5px solid", fontSize: "12px", fontWeight: 600, cursor: "pointer",
                      background: funciones.includes(f) ? "#1a4731" : "#fff",
                      color: funciones.includes(f) ? "#fff" : "#374151",
                      borderColor: funciones.includes(f) ? "#1a4731" : "#d1d5db" }}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div style={grid2}>
              <Field label="Plagas / objetivo">
                <input type="text" value={plagasObjetivo.join(", ")}
                  onChange={e => setPlagasObjetivo(e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
                  style={inputStyle} placeholder="Ej: Botrytis, Oídio..." />
              </Field>
              <Field label="Objetivo principal">
                <input type="text" value={objetivoPrincipal} onChange={e => setObjetivoPrincipal(e.target.value)} style={inputStyle} placeholder="Ej: Control preventivo" />
              </Field>
              <Field label="Mojamiento solicitado (lt/ha)">
                <input type="number" min="0" value={mojamientoSol} onChange={e => handleMojamiento(e.target.value)} style={inputStyle} placeholder="Ej. 500" />
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
                    <select value={row.cuartel_id} onChange={e => setCuartelRow(i, "cuartel_id", e.target.value)} style={inputStyle}>
                      <option value="">— Seleccionar —</option>
                      {cuartelesPorEmpresa.map(c => (
                        <option key={c.id} value={c.id}>{c.codigo} — {c.especie} {c.variedad} ({c.superficie_real ?? "?"}ha)</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div style={{ flex: 1 }}>
                  <Field label={i === 0 ? "Superficie (ha)" : ""}>
                    <input type="number" min="0" step="0.01" value={row.superficie_ha}
                      onChange={e => handleCuartelSuperficie(i, e.target.value)}
                      onFocus={() => {
                        if (!row.superficie_ha && row.cuartel_id) {
                          const c = cuarteles.find(c => c.id === row.cuartel_id);
                          if (c?.superficie_real) handleCuartelSuperficie(i, String(c.superficie_real));
                        }
                      }}
                      style={inputStyle} placeholder="Ha" />
                  </Field>
                </div>
                {cuartelesOT.length > 1 && (
                  <button onClick={() => removeCuartel(i)} style={removeBtn} type="button">✕</button>
                )}
              </div>
            ))}
            <button onClick={addCuartel} style={addBtn} type="button">+ Agregar cuartel</button>
          </section>

          {/* ── Aplicador ── */}
          <section style={section}>
            <h2 style={sectionTitle}>Aplicador y maquinaria</h2>
            <div style={{ ...rowWrap, flexWrap: "wrap" }}>
              <div style={{ flex: "2 1 160px" }}>
                <Field label="Aplicador">
                  <select value={aplicadorOT.personal_id} onChange={e => handleAplicadorField("personal_id", e.target.value)} style={inputStyle}>
                    <option value="">— Seleccionar —</option>
                    {personalAplicador.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </Field>
              </div>
              <div style={{ flex: "2 1 140px" }}>
                <Field label="Tractor">
                  <select value={aplicadorOT.tractor_id} onChange={e => handleAplicadorField("tractor_id", e.target.value)} style={inputStyle}>
                    <option value="">— Sin asignar —</option>
                    {tractores.map(t => <option key={t.id} value={t.id}>{t.codigo}{t.descripcion ? ` — ${t.descripcion}` : ""}</option>)}
                  </select>
                </Field>
              </div>
              <div style={{ flex: "2 1 140px" }}>
                <Field label="Implemento">
                  <select value={aplicadorOT.pulverizador_id} onChange={e => handleAplicadorField("pulverizador_id", e.target.value)} style={inputStyle}>
                    <option value="">— Sin asignar —</option>
                    {implementos.map(p => <option key={p.id} value={p.id}>{p.codigo}{p.capacidad_lt ? ` (${p.capacidad_lt}lt)` : ""}</option>)}
                  </select>
                </Field>
              </div>
              <div style={{ flex: "1 1 130px" }}>
                <Field label="N° Maquinadas">
                  <input type="number" min="0" step="1" value={aplicadorOT.cantidad_maquinadas}
                    onChange={e => setAplicadorOT(prev => ({ ...prev, cantidad_maquinadas: e.target.value }))}
                    style={inputStyle} placeholder="Auto" />
                  {maquinadasDetalle && <span style={{ fontSize: "11px", color: "#1a4731", marginTop: "3px" }}>{maquinadasDetalle}</span>}
                </Field>
              </div>
            </div>
          </section>

          {/* ── Productos ── */}
          <section style={section}>
            <h2 style={sectionTitle}>Productos a aplicar</h2>
            {productosOT.map((row, i) => {
              const dosisLines = calcDosisDetalle(row);
              const prod = productos.find(p => p.id === row.producto_id);
              return (
                <div key={i} style={{ ...rowWrap, flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
                  <div style={{ flex: "3 1 200px" }}>
                    <Field label={i === 0 ? "Producto" : ""}>
                      <select value={row.producto_id} onChange={e => handleSelectProducto(i, e.target.value)} style={inputStyle}>
                        <option value="">— Seleccionar —</option>
                        {productosFiltrados.map(p => (
                          <option key={p.id} value={p.id}>{p.nombre_comercial}{p.especies_autorizadas?.length ? ` (${p.especies_autorizadas.slice(0, 2).join(", ")})` : ""}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <div style={{ flex: "1 1 90px" }}>
                    <Field label={i === 0 ? "Dosis real" : ""}>
                      <input type="number" min="0" step="0.001" value={row.dosis_real} onChange={e => setProductoRow(i, "dosis_real", e.target.value)} style={inputStyle} placeholder="0.00" />
                    </Field>
                  </div>
                  <div style={{ flex: "1 1 110px" }}>
                    <Field label={i === 0 ? "Unidad" : ""}>
                      <select value={row.dosis_unidad} onChange={e => setProductoRow(i, "dosis_unidad", e.target.value)} style={inputStyle}>
                        {["lt/ha", "kg/ha", "cc/ha", "g/ha", "g/100lt", "cc/100lt"].map(u => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <div style={{ flex: "1 1 80px" }}>
                    <Field label={i === 0 ? "Carencia (días)" : ""}>
                      <input type="number" min="0" value={row.carencia_dias} onChange={e => setProductoRow(i, "carencia_dias", e.target.value)} style={inputStyle} />
                    </Field>
                  </div>
                  <div style={{ flex: "1 1 80px" }}>
                    <Field label={i === 0 ? "Reingreso (h)" : ""}>
                      <input type="number" min="0" value={row.rei_horas} onChange={e => setProductoRow(i, "rei_horas", e.target.value)} style={inputStyle} />
                    </Field>
                  </div>
                  {(prod?.especies_autorizadas || dosisLines) && (
                    <div style={{ flex: "0 0 100%", paddingLeft: "2px", display: "flex", gap: "16px", flexWrap: "wrap" }}>
                      {prod?.especies_autorizadas && <span style={{ fontSize: "11px", color: "#6b7280" }}>Autorizado: {prod.especies_autorizadas.join(", ")}</span>}
                      {dosisLines && dosisLines.map((line, li) => <span key={li} style={{ fontSize: "11px", color: "#1a4731", fontWeight: 600 }}>{line}</span>)}
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
              {(["traje", "guantes", "anteojos", "gorro", "mascarilla", "botas"] as const).map(item => (
                <label key={item} style={ppeLabel}>
                  <input type="checkbox" checked={ppe[item]} onChange={e => setPpe(p => ({ ...p, [item]: e.target.checked }))} />
                  {item.charAt(0).toUpperCase() + item.slice(1)}
                </label>
              ))}
            </div>
          </section>

          {/* ── Notas ── */}
          <section style={{ ...section, borderBottom: "none" }}>
            <h2 style={sectionTitle}>Notas</h2>
            <textarea value={notas} onChange={e => setNotas(e.target.value)}
              style={{ ...inputStyle, height: "70px", resize: "vertical" }} placeholder="Observaciones..." />
          </section>

          {error && <p style={{ color: "#dc2626", fontSize: "13px", padding: "0 24px 16px" }}>{error}</p>}

          <div style={footerRow}>
            <button onClick={() => router.push(`/ordenes/${params.id}${empresaId ? `?empresa=${empresaId}` : ""}`)} style={cancelBtn} type="button">Cancelar</button>
            <button onClick={handleSave} style={saveBtn} disabled={saving} type="button">
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </div>
      </main>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      {label && <label style={labelStyle}>{label}</label>}
      {children}
    </div>
  );
}

const container: React.CSSProperties  = { maxWidth: "960px", margin: "0 auto", padding: "24px 20px" };
const pageHeader: React.CSSProperties = { marginBottom: "20px" };
const pageTitle: React.CSSProperties  = { fontSize: "22px", fontWeight: 800, color: "#1a4731", margin: "4px 0 0" };
const backBtn: React.CSSProperties    = { background: "transparent", border: "none", color: "#6b7280", fontSize: "13px", cursor: "pointer", padding: "0", fontWeight: 600 };
const formCard: React.CSSProperties   = { background: "#fff", borderRadius: "16px", border: "1px solid #e5e7eb", overflow: "hidden" };
const section: React.CSSProperties    = { padding: "24px", borderBottom: "1px solid #f3f4f6" };
const sectionTitle: React.CSSProperties = { fontSize: "14px", fontWeight: 700, color: "#1a4731", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.04em" };
const labelStyle: React.CSSProperties = { fontSize: "12px", fontWeight: 600, color: "#374151" };
const inputStyle: React.CSSProperties = { padding: "9px 12px", borderRadius: "8px", border: "1.5px solid #d1d5db", fontSize: "14px", background: "#fafafa", color: "#111", width: "100%", boxSizing: "border-box" };
const grid2: React.CSSProperties      = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" };
const grid3: React.CSSProperties      = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" };
const rowWrap: React.CSSProperties    = { display: "flex", gap: "10px", alignItems: "flex-end", marginBottom: "8px" };
const removeBtn: React.CSSProperties  = { background: "transparent", border: "none", cursor: "pointer", color: "#dc2626", fontSize: "16px", padding: "4px", flexShrink: 0 };
const addBtn: React.CSSProperties     = { background: "transparent", border: "1.5px dashed #d1d5db", color: "#6b7280", borderRadius: "8px", padding: "6px 16px", cursor: "pointer", fontSize: "13px", marginTop: "4px" };
const ppeGrid: React.CSSProperties    = { display: "flex", flexWrap: "wrap", gap: "16px" };
const ppeLabel: React.CSSProperties   = { display: "flex", alignItems: "center", gap: "6px", fontSize: "14px", cursor: "pointer" };
const footerRow: React.CSSProperties  = { display: "flex", justifyContent: "flex-end", gap: "10px", padding: "20px 24px", borderTop: "1px solid #e5e7eb" };
const cancelBtn: React.CSSProperties  = { padding: "10px 20px", borderRadius: "9px", border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: "14px", cursor: "pointer" };
const saveBtn: React.CSSProperties    = { padding: "10px 24px", borderRadius: "9px", background: "#1a4731", color: "#fff", fontWeight: 700, fontSize: "14px", border: "none", cursor: "pointer" };

export default function EditarOTPage() { return <Suspense><EditarOTContent /></Suspense>; }
