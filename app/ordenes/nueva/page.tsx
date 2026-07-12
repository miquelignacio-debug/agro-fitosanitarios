"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Nav from "@/lib/nav";
import type { Empresa, Cuartel, Maquinaria, Producto, Personal } from "@/lib/types";
import { FUNCIONES_FITOSANITARIAS } from "@/lib/types";

type CuartelRow   = { cuartel_id: string; superficie_ha: string };
type AplicadorRow = { personal_id: string; tractor_id: string; pulverizador_id: string; cantidad_maquinadas: string };
type ProductoRow  = { producto_id: string; dosis_real: string; dosis_unidad: string; carencia_dias: string; rei_horas: string; consumo_total: string };
type CatalogPlaga = { id: string; nombre: string; tipo: string; activo: boolean };

import { Suspense } from "react";
function NuevaOTContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const empresaId    = searchParams.get("empresa") || "";

  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");

  // Catálogos
  const [empresas,      setEmpresas]      = useState<Empresa[]>([]);
  const [cuarteles,     setCuarteles]     = useState<Cuartel[]>([]);
  const [tractores,     setTractores]     = useState<Maquinaria[]>([]);
  const [implementos,   setImplementos]   = useState<Maquinaria[]>([]);
  const [productos,     setProductos]     = useState<Producto[]>([]);
  const [personal,      setPersonal]      = useState<Personal[]>([]);
  const [catalogPlagas, setCatalogPlagas] = useState<CatalogPlaga[]>([]);
  const [stockProductoIds, setStockProductoIds] = useState<Set<string>>(new Set());

  // Cabecera
  const [empresa,           setEmpresa]           = useState(empresaId);
  const [fechaSolicitud,    setFechaSolicitud]     = useState(new Date().toISOString().slice(0, 10));
  const [fechaAplicacion,   setFechaAplicacion]   = useState("");
  const [horaInicio,        setHoraInicio]         = useState("05:00");
  const [horaFin,           setHoraFin]            = useState("12:00");
  const [solicitanteId,     setSolicitanteId]      = useState("");
  const [responsableId,     setResponsableId]      = useState("");
  const [dosificadorId,     setDosificadorId]      = useState("");
  const [funciones,         setFunciones]          = useState<string[]>([]);
  const [plagasObjetivo,    setPlagasObjetivo]     = useState<string[]>([]);
  const [objetivoPrincipal, setObjetivoPrincipal] = useState("");
  const [mojamientoSol,     setMojamientoSol]      = useState("");
  const [notas,             setNotas]              = useState("");

  // Filas dinámicas
  const [cuartelesOT, setCuartelesOT] = useState<CuartelRow[]>([{ cuartel_id: "", superficie_ha: "" }]);
  const [aplicadorOT, setAplicadorOT] = useState<AplicadorRow>({ personal_id: "", tractor_id: "", pulverizador_id: "", cantidad_maquinadas: "" });
  const [productosOT, setProductosOT] = useState<ProductoRow[]>([{ producto_id: "", dosis_real: "", dosis_unidad: "lt/ha", carencia_dias: "", rei_horas: "", consumo_total: "" }]);

  // PPE
  const [ppe, setPpe] = useState({ traje: false, guantes: false, anteojos: false, gorro: false, mascarilla: false, botas: false });

  // ── Carga inicial ──────────────────────────────────────────────────────────
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
      if (!empresa && emp?.length) setEmpresa((emp as Empresa[])[0].id);
      setLoading(false);
    };
    init();
  }, []);

  // ── Stock disponible por empresa ───────────────────────────────────────────
  useEffect(() => {
    if (!empresa) { setStockProductoIds(new Set()); return; }
    setStockProductoIds(new Set());
    supabase.from("stock_actual")
      .select("producto_id")
      .eq("empresa_id", empresa)
      .then(({ data }) => {
        setStockProductoIds(new Set(((data || []) as { producto_id: string }[]).map(r => r.producto_id)));
      });
  }, [empresa]);

  // ── Computed ───────────────────────────────────────────────────────────────
  const cuartelesPorEmpresa = cuarteles.filter(c => c.empresa_id === empresa);
  const toggleFuncion = (f: string) =>
    setFunciones(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);

  // Personal filtrado por cargo
  const personalSolicitante = personal.filter(p => p.cargo === "Solicitante");
  const personalResponsable = personal.filter(p => p.cargo === "Responsable técnico");
  const personalDosificador = personal.filter(p => p.cargo === "Dosificador");
  const personalAplicador   = personal.filter(p => p.cargo === "Aplicador");

  // Productos: solo los que tienen stock en bodega, filtrados por función
  const productosFiltrados = (() => {
    let list = stockProductoIds.size > 0
      ? productos.filter(p => stockProductoIds.has(p.id))
      : [];
    if (funciones.length > 0) {
      list = list.filter(p => p.tipo_funcion?.some(f => funciones.includes(f)));
    }
    return list;
  })();

  // ── Handlers: cuarteles ──────────────────────────────────────────────────
  const setCuartelRow = (i: number, field: keyof CuartelRow, val: string) =>
    setCuartelesOT(rows => rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  const addCuartel    = () => setCuartelesOT(r => [...r, { cuartel_id: "", superficie_ha: "" }]);
  const removeCuartel = (i: number) => setCuartelesOT(r => r.filter((_, idx) => idx !== i));

  // ── Maquinadas ────────────────────────────────────────────────────────────
  const calcMaquinadas = (pulvId: string, currentCuarteles?: CuartelRow[], moj?: string): string => {
    const cuarts = currentCuarteles ?? cuartelesOT;
    const mojVal = parseFloat(moj ?? mojamientoSol) || 0;
    const supTotal = cuarts.reduce((s, c) => s + (parseFloat(c.superficie_ha) || 0), 0);
    if (!supTotal || !mojVal || !pulvId) return "";
    const pulv = implementos.find(p => p.id === pulvId);
    if (!pulv?.capacidad_lt) return "";
    return String(Math.ceil(supTotal * mojVal / pulv.capacidad_lt));
  };

  const getMaquinadasDetalle = (): string => {
    const pulvId = aplicadorOT.pulverizador_id;
    if (!pulvId || !mojamientoSol) return "";
    const pulv = implementos.find(p => p.id === pulvId);
    if (!pulv?.capacidad_lt) return "";
    const supTotal = cuartelesOT.reduce((s, c) => s + (parseFloat(c.superficie_ha) || 0), 0);
    const mojVal = parseFloat(mojamientoSol) || 0;
    if (!supTotal || !mojVal) return "";
    const litrosTotales = supTotal * mojVal;
    const maqCompletas = Math.floor(litrosTotales / pulv.capacidad_lt);
    const litrosSaldo = Math.round(litrosTotales - maqCompletas * pulv.capacidad_lt);
    if (litrosSaldo < 1) return `${maqCompletas} maquinadas`;
    return `${maqCompletas} maquinadas y ${litrosSaldo} lt de saldo`;
  };

  const recalcMaquinadas = (newCuarteles?: CuartelRow[], newMoj?: string) => {
    setAplicadorOT(prev =>
      prev.pulverizador_id
        ? { ...prev, cantidad_maquinadas: calcMaquinadas(prev.pulverizador_id, newCuarteles, newMoj) }
        : prev
    );
  };

  const handleAplicadorField = (field: keyof AplicadorRow, val: string) => {
    setAplicadorOT(prev => {
      const updated = { ...prev, [field]: val };
      if (field === "pulverizador_id") {
        updated.cantidad_maquinadas = val ? calcMaquinadas(val) : "";
      }
      return updated;
    });
  };

  // ── Handlers: cuartel superficie → recalc maquinadas ────────────────────
  const handleCuartelSuperficie = (i: number, val: string) => {
    const newCuarteles = cuartelesOT.map((r, idx) => idx === i ? { ...r, superficie_ha: val } : r);
    setCuartelesOT(newCuarteles);
    recalcMaquinadas(newCuarteles);
  };

  const handleMojamiento = (val: string) => {
    setMojamientoSol(val);
    recalcMaquinadas(undefined, val);
  };

  // ── Handlers: productos ──────────────────────────────────────────────────
  const setProductoRow = (i: number, field: keyof ProductoRow, val: string) =>
    setProductosOT(rows => rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  const addProducto    = () =>
    setProductosOT(r => [...r, { producto_id: "", dosis_real: "", dosis_unidad: "lt/ha", carencia_dias: "", rei_horas: "", consumo_total: "" }]);
  const removeProducto = (i: number) => setProductosOT(r => r.filter((_, idx) => idx !== i));

  const handleSelectProducto = (i: number, prodId: string) => {
    const prod = productos.find(p => p.id === prodId);
    setProductosOT(rows =>
      rows.map((r, idx) =>
        idx === i ? { ...r, producto_id: prodId, dosis_unidad: prod?.unidad_dosis || "lt/ha", carencia_dias: String(prod?.phi_dias ?? ""), rei_horas: String(prod?.rei_horas ?? "") } : r
      )
    );
  };

  // ── Cálculo dosis por maquinada y saldo ──────────────────────────────────
  const calcDosisDetalle = (row: ProductoRow): string[] | null => {
    const dosis = parseFloat(row.dosis_real);
    if (!dosis || !aplicadorOT.pulverizador_id || !mojamientoSol) return null;
    const pulv = implementos.find(p => p.id === aplicadorOT.pulverizador_id);
    if (!pulv?.capacidad_lt) return null;
    const supTotal = cuartelesOT.reduce((s, c) => s + (parseFloat(c.superficie_ha) || 0), 0);
    const mojVal = parseFloat(mojamientoSol) || 0;
    if (!supTotal || !mojVal) return null;
    const litrosTotales = supTotal * mojVal;
    const litrosSaldo = litrosTotales % pulv.capacidad_lt;
    const unit = row.dosis_unidad.split("/")[0];
    let dosisMaq: number;
    let dosisSaldo: number;
    if (row.dosis_unidad.includes("/100")) {
      dosisMaq   = dosis * (pulv.capacidad_lt / 100);
      dosisSaldo = dosis * (litrosSaldo / 100);
    } else if (row.dosis_unidad.includes("/ha")) {
      dosisMaq   = dosis * (pulv.capacidad_lt / mojVal);
      dosisSaldo = dosis * (litrosSaldo / mojVal);
    } else {
      return null;
    }
    const fmt = (n: number) => n < 10 ? n.toFixed(2) : n.toFixed(1);
    const lines = [`${fmt(dosisMaq)} ${unit}/maquinada`];
    if (litrosSaldo > 1) lines.push(`Saldo: ${fmt(dosisSaldo)} ${unit} (${Math.round(litrosSaldo)} lt)`);
    return lines;
  };

  // ── Guardar ──────────────────────────────────────────────────────────────
  const handleSave = async (estado: "borrador" | "emitida") => {
    setError("");
    if (!empresa) { setError("Selecciona una empresa."); return; }
    if (cuartelesOT.some(c => !c.cuartel_id)) { setError("Completa todos los cuarteles o elimina las filas vacías."); return; }
    if (productosOT.some(p => !p.producto_id || !p.dosis_real)) { setError("Cada producto necesita nombre y dosis."); return; }

    setSaving(true);

    const { data: numData } = await supabase.rpc("siguiente_numero_ot", { p_empresa_id: empresa });
    const numero = numData ?? 1;

    const { data: ot, error: otErr } = await supabase.from("ordenes_trabajo").insert({
      numero,
      empresa_id: empresa,
      fecha_solicitud: fechaSolicitud,
      fecha_aplicacion: fechaAplicacion || null,
      hora_inicio: horaInicio || null,
      hora_fin: horaFin || null,
      solicitante_id: solicitanteId || null,
      responsable_id: responsableId || null,
      dosificador_id: dosificadorId || null,
      funcion: funciones.length ? funciones : null,
      plagas_objetivo: plagasObjetivo.length ? plagasObjetivo.join(", ") : null,
      objetivo_principal: objetivoPrincipal.trim() || null,
      mojamiento_solicitado_ltha: mojamientoSol ? parseFloat(mojamientoSol) : null,
      ppe_traje: ppe.traje, ppe_guantes: ppe.guantes, ppe_anteojos: ppe.anteojos,
      ppe_gorro: ppe.gorro, ppe_mascarilla: ppe.mascarilla, ppe_botas: ppe.botas,
      notas: notas.trim() || null,
      estado,
    }).select("id").single();

    if (otErr || !ot) { setError(otErr?.message || "Error creando OT"); setSaving(false); return; }
    const otId = ot.id;

    const superficieTotal = cuartelesOT.reduce((s, c) => s + (parseFloat(c.superficie_ha) || 0), 0);
    const mojVal = parseFloat(mojamientoSol) || 0;
    const pulv = implementos.find(p => p.id === aplicadorOT.pulverizador_id);
    const capacidadLt = pulv?.capacidad_lt ?? 0;

    const productosRows = productosOT.filter(p => p.producto_id && p.dosis_real).map(p => {
      const dosis = parseFloat(p.dosis_real);
      const carencia = parseInt(p.carencia_dias) || 0;
      let dosisMaq: number | null = null;
      if (capacidadLt > 0) {
        if (p.dosis_unidad.includes("/100")) dosisMaq = Math.round(dosis * capacidadLt / 100 * 1000) / 1000;
        else if (p.dosis_unidad.includes("/ha") && mojVal > 0) dosisMaq = Math.round(dosis * capacidadLt / mojVal * 1000) / 1000;
      }
      return {
        ot_id: otId,
        producto_id: p.producto_id,
        dosis_real: dosis,
        dosis_unidad: p.dosis_unidad,
        carencia_dias: carencia,
        rei_horas: parseInt(p.rei_horas) || 0,
        fecha_viable: fechaAplicacion
          ? new Date(new Date(fechaAplicacion).getTime() + carencia * 86400000).toISOString().slice(0, 10)
          : null,
        dosis_por_maquinada: dosisMaq,
        consumo_total: null, // se calcula definitivamente al finalizar
      };
    });

    const aplicadorRow = aplicadorOT.personal_id ? {
      ot_id: otId,
      personal_id: aplicadorOT.personal_id,
      tractor_id: aplicadorOT.tractor_id || null,
      pulverizador_id: aplicadorOT.pulverizador_id || null,
      cantidad_maquinadas: aplicadorOT.cantidad_maquinadas ? parseFloat(aplicadorOT.cantidad_maquinadas) : null,
    } : null;

    await Promise.all([
      supabase.from("ot_cuarteles").insert(
        cuartelesOT.filter(c => c.cuartel_id).map(c => ({
          ot_id: otId, cuartel_id: c.cuartel_id, superficie_ha: parseFloat(c.superficie_ha) || 0,
        }))
      ),
      supabase.from("ot_productos").insert(productosRows),
      ...(aplicadorRow ? [supabase.from("ot_aplicadores").insert(aplicadorRow)] : []),
    ]);

    setSaving(false);
    router.push(`/ordenes/${otId}${empresa ? `?empresa=${empresa}` : ""}`);
  };

  if (loading) return <><Nav empresaId={empresaId} /><main style={container}><p style={{ color: "#6b7280" }}>Cargando...</p></main></>;

  const maquinadasDetalle = getMaquinadasDetalle();

  return (
    <>
      <Nav empresaId={empresaId} />
      <main style={container}>
        <div style={pageHeader}>
          <h1 style={pageTitle}>Nueva Orden de Trabajo</h1>
        </div>

        <div style={formCard}>
          {/* ── Identificación ── */}
          <section style={section}>
            <h2 style={sectionTitle}>Identificación</h2>
            <div style={grid2}>
              <Field label="Empresa *">
                <select value={empresa} onChange={e => setEmpresa(e.target.value)} style={inputStyle}>
                  <option value="">— Seleccionar —</option>
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
            {personal.length === 0 && (
              <p style={infoMsg}>No hay personal cargado. Ingresa primero a <strong>Ajustes → Personal</strong>.</p>
            )}
            <div style={grid3}>
              <Field label="Solicitante">
                <select value={solicitanteId} onChange={e => setSolicitanteId(e.target.value)} style={inputStyle}>
                  <option value="">— Seleccionar —</option>
                  {personalSolicitante.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
                {personalSolicitante.length === 0 && personal.length > 0 && (
                  <span style={hintStyle}>Sin personal con cargo "Solicitante" en Ajustes</span>
                )}
              </Field>
              <Field label="Responsable técnico">
                <select value={responsableId} onChange={e => setResponsableId(e.target.value)} style={inputStyle}>
                  <option value="">— Seleccionar —</option>
                  {personalResponsable.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
                {personalResponsable.length === 0 && personal.length > 0 && (
                  <span style={hintStyle}>Sin personal con cargo "Responsable técnico"</span>
                )}
              </Field>
              <Field label="Dosificador">
                <select value={dosificadorId} onChange={e => setDosificadorId(e.target.value)} style={inputStyle}>
                  <option value="">— Seleccionar —</option>
                  {personalDosificador.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
                {personalDosificador.length === 0 && personal.length > 0 && (
                  <span style={hintStyle}>Sin personal con cargo "Dosificador"</span>
                )}
              </Field>
            </div>
          </section>

          {/* ── Objetivo ── */}
          <section style={section}>
            <h2 style={sectionTitle}>Objetivo de la aplicación</h2>
            <div style={{ marginBottom: "14px" }}>
              <label style={labelStyle}>Función fitosanitaria</label>
              <div style={{ ...chipRow, marginTop: "8px" }}>
                {FUNCIONES_FITOSANITARIAS.map(f => (
                  <button key={f} type="button" onClick={() => toggleFuncion(f)}
                    style={{ ...chip, ...(funciones.includes(f) ? chipActive : {}) }}>
                    {f}
                  </button>
                ))}
              </div>
              {funciones.length > 0 && (
                <p style={{ fontSize: "12px", color: "#1a4731", marginTop: "6px" }}>
                  {productosFiltrados.length} producto{productosFiltrados.length !== 1 ? "s" : ""} disponibles en bodega para la función seleccionada
                </p>
              )}
            </div>
            <div style={grid2}>
              <Field label="Plagas / enfermedades a controlar">
                <PlagasSelector
                  catalog={catalogPlagas}
                  selected={plagasObjetivo}
                  onChange={setPlagasObjetivo}
                  tipos={["plaga", "enfermedad"]}
                />
              </Field>
              <Field label="Objetivo principal">
                <SingleSelector
                  catalog={catalogPlagas}
                  value={objetivoPrincipal}
                  onChange={setObjetivoPrincipal}
                  tipos={["manejo", "nutritivo"]}
                  placeholder="Ej: Control Preventivo, Nutrición Foliar..."
                />
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
                      onChange={e => handleCuartelSuperficie(i, e.target.value)}
                      onFocus={() => {
                        if (!row.superficie_ha && row.cuartel_id) {
                          const c = cuarteles.find(c => c.id === row.cuartel_id);
                          if (c?.superficie_real) handleCuartelSuperficie(i, String(c.superficie_real));
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

          {/* ── Aplicador ── */}
          <section style={section}>
            <h2 style={sectionTitle}>Aplicador y maquinaria</h2>
            {personalAplicador.length === 0 && personal.length > 0 && (
              <p style={infoMsg}>Sin aplicadores en Ajustes. Agrega personal con cargo <strong>Aplicador</strong>.</p>
            )}
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
                  <input
                    type="number" min="0" step="1"
                    value={aplicadorOT.cantidad_maquinadas}
                    onChange={e => setAplicadorOT(prev => ({ ...prev, cantidad_maquinadas: e.target.value }))}
                    style={inputStyle}
                    placeholder="Auto"
                  />
                  {maquinadasDetalle && (
                    <span style={{ fontSize: "11px", color: "#1a4731", marginTop: "3px" }}>{maquinadasDetalle}</span>
                  )}
                </Field>
              </div>
            </div>
          </section>

          {/* ── Productos ── */}
          <section style={section}>
            <h2 style={sectionTitle}>Productos a aplicar</h2>
            {empresa && stockProductoIds.size === 0 && (
              <p style={infoMsg}>Sin stock en bodega para esta empresa. Registra ingresos en <strong>Bodega → Ingreso</strong>.</p>
            )}
            {productosFiltrados.length === 0 && funciones.length > 0 && stockProductoIds.size > 0 && (
              <p style={infoMsg}>No hay productos con la función seleccionada disponibles en bodega.</p>
            )}
            {productosOT.map((row, i) => {
              const prod = productos.find(p => p.id === row.producto_id);
              const dosisLines = calcDosisDetalle(row);
              return (
                <div key={i} style={{ ...rowWrap, flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
                  <div style={{ flex: "3 1 200px" }}>
                    <Field label={i === 0 ? "Producto" : ""}>
                      <select value={row.producto_id} onChange={e => handleSelectProducto(i, e.target.value)} style={inputStyle}>
                        <option value="">— Seleccionar —</option>
                        {productosFiltrados.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.nombre_comercial}{p.especies_autorizadas?.length ? ` (${p.especies_autorizadas.slice(0, 2).join(", ")})` : ""}
                          </option>
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
                      {prod?.especies_autorizadas && (
                        <span style={{ fontSize: "11px", color: "#6b7280" }}>Autorizado: {prod.especies_autorizadas.join(", ")}</span>
                      )}
                      {dosisLines && dosisLines.map((line, li) => (
                        <span key={li} style={{ fontSize: "11px", color: "#1a4731", fontWeight: 600 }}>{line}</span>
                      ))}
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
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              style={{ ...inputStyle, height: "70px", resize: "vertical" }}
              placeholder="Observaciones adicionales..."
            />
          </section>

          {error && <p style={errorStyle}>{error}</p>}

          <div style={footerRow}>
            <button onClick={() => router.push(`/ordenes${empresaId ? `?empresa=${empresaId}` : ""}`)} style={cancelBtn} type="button">Cancelar</button>
            <button onClick={() => handleSave("borrador")} style={draftBtn} disabled={saving} type="button">{saving ? "..." : "Guardar borrador"}</button>
            <button onClick={() => handleSave("emitida")} style={saveBtn} disabled={saving} type="button">{saving ? "Guardando..." : "Emitir OT"}</button>
          </div>
        </div>
      </main>
    </>
  );
}

const TIPO_COLORS_OT: Record<string, string> = {
  plaga: "#dc2626", enfermedad: "#ea580c", nutritivo: "#15803d", manejo: "#1d4ed8",
};

function PlagasSelector({ catalog, selected, onChange, tipos, placeholder: ph }: {
  catalog: CatalogPlaga[];
  selected: string[];
  onChange: (v: string[]) => void;
  tipos?: string[];
  placeholder?: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const base = tipos ? catalog.filter(c => tipos.includes(c.tipo)) : catalog;
  const filtered = base.filter(c =>
    c.nombre.toLowerCase().includes(search.toLowerCase()) &&
    !selected.includes(c.nombre)
  );

  const add = (nombre: string) => {
    onChange([...selected, nombre]);
    setSearch("");
    setOpen(false);
  };
  const remove = (nombre: string) => onChange(selected.filter(s => s !== nombre));

  return (
    <div style={{ position: "relative" }}>
      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "6px" }}>
          {selected.map(s => (
            <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 8px", borderRadius: "999px", background: "#f0fdf4", border: "1px solid #86efac", fontSize: "12px", fontWeight: 600, color: "#15803d" }}>
              {s}
              <button onClick={() => remove(s)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: "#6b7280", fontSize: "14px" }}>×</button>
            </span>
          ))}
        </div>
      )}
      <input
        value={search}
        onChange={e => { setSearch(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={inputStyle}
        placeholder={selected.length ? "Agregar más..." : (ph || "Buscar plaga o enfermedad...")}
      />
      {open && (search.length > 0 || filtered.length > 0) && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 200, background: "#fff", border: "1.5px solid #d1d5db", borderRadius: "8px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", maxHeight: "220px", overflowY: "auto", marginTop: "2px" }}>
          {filtered.slice(0, 10).map(c => (
            <button
              key={c.id}
              onMouseDown={() => add(c.nombre)}
              style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "8px 12px", background: "none", border: "none", borderBottom: "1px solid #f3f4f6", cursor: "pointer", textAlign: "left", fontSize: "13px", color: "#111" }}
            >
              <span style={{ fontSize: "10px", fontWeight: 700, padding: "1px 6px", borderRadius: "4px", background: "#f3f4f6", color: TIPO_COLORS_OT[c.tipo] || "#374151", textTransform: "uppercase", flexShrink: 0 }}>
                {c.tipo}
              </span>
              {c.nombre}
            </button>
          ))}
          {search && !base.some(c => c.nombre.toLowerCase() === search.toLowerCase()) && (
            <button
              onMouseDown={() => add(search)}
              style={{ display: "flex", width: "100%", padding: "8px 12px", background: "#fafafa", border: "none", borderTop: "1px solid #e5e7eb", cursor: "pointer", fontSize: "12px", color: "#6b7280", textAlign: "left" }}
            >
              + Agregar &ldquo;{search}&rdquo; como nuevo
            </button>
          )}
          {filtered.length === 0 && !search && (
            <div style={{ padding: "10px 12px", fontSize: "12px", color: "#9ca3af" }}>Todas las opciones ya están seleccionadas</div>
          )}
        </div>
      )}
    </div>
  );
}

function SingleSelector({ catalog, value, onChange, tipos, placeholder: ph }: {
  catalog: CatalogPlaga[];
  value: string;
  onChange: (v: string) => void;
  tipos?: string[];
  placeholder?: string;
}) {
  const [search, setSearch] = useState(value);
  const [open, setOpen] = useState(false);

  useEffect(() => { setSearch(value); }, [value]);

  const base = tipos ? catalog.filter(c => tipos.includes(c.tipo)) : catalog;
  const filtered = base.filter(c => c.nombre.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ position: "relative" }}>
      <input
        value={search}
        onChange={e => { setSearch(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={inputStyle}
        placeholder={ph || "Buscar o escribir..."}
      />
      {open && filtered.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 200, background: "#fff", border: "1.5px solid #d1d5db", borderRadius: "8px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", maxHeight: "220px", overflowY: "auto", marginTop: "2px" }}>
          {filtered.slice(0, 10).map(c => (
            <button
              key={c.id}
              onMouseDown={() => { onChange(c.nombre); setSearch(c.nombre); setOpen(false); }}
              style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "8px 12px", background: "none", border: "none", borderBottom: "1px solid #f3f4f6", cursor: "pointer", textAlign: "left", fontSize: "13px", color: "#111" }}
            >
              <span style={{ fontSize: "10px", fontWeight: 700, padding: "1px 6px", borderRadius: "4px", background: "#f3f4f6", color: TIPO_COLORS_OT[c.tipo] || "#374151", textTransform: "uppercase", flexShrink: 0 }}>
                {c.tipo}
              </span>
              {c.nombre}
            </button>
          ))}
        </div>
      )}
    </div>
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

const container: React.CSSProperties    = { maxWidth: "960px", margin: "0 auto", padding: "28px 20px" };
const pageHeader: React.CSSProperties   = { marginBottom: "24px" };
const pageTitle: React.CSSProperties    = { fontSize: "24px", fontWeight: 800, color: "#1a4731" };
const formCard: React.CSSProperties     = { background: "#fff", borderRadius: "16px", border: "1px solid #e5e7eb", overflow: "hidden" };
const section: React.CSSProperties      = { padding: "22px 26px", borderBottom: "1px solid #f3f4f6" };
const sectionTitle: React.CSSProperties = { fontSize: "13px", fontWeight: 700, color: "#1a4731", marginBottom: "14px", textTransform: "uppercase", letterSpacing: "0.05em" };
const grid2: React.CSSProperties        = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" };
const grid3: React.CSSProperties        = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" };
const labelStyle: React.CSSProperties   = { fontSize: "12px", fontWeight: 700, color: "#374151" };
const hintStyle: React.CSSProperties    = { fontSize: "11px", color: "#92400e", marginTop: "2px" };
const inputStyle: React.CSSProperties   = { padding: "9px 12px", borderRadius: "8px", border: "1.5px solid #d1d5db", fontSize: "14px", background: "#fafafa", color: "#111", width: "100%", boxSizing: "border-box" };
const chipRow: React.CSSProperties      = { display: "flex", flexWrap: "wrap", gap: "6px" };
const chip: React.CSSProperties         = { padding: "4px 10px", borderRadius: "999px", border: "1.5px solid #d1d5db", background: "#fff", fontSize: "11px", fontWeight: 600, cursor: "pointer", color: "#374151" };
const chipActive: React.CSSProperties   = { background: "#1a4731", color: "#fff", borderColor: "#1a4731" };
const rowWrap: React.CSSProperties      = { display: "flex", gap: "10px", alignItems: "flex-end", marginBottom: "10px" };
const addBtn: React.CSSProperties       = { marginTop: "6px", padding: "6px 14px", borderRadius: "8px", border: "1.5px solid #1a4731", background: "transparent", color: "#1a4731", fontSize: "13px", fontWeight: 700, cursor: "pointer" };
const removeBtn: React.CSSProperties    = { padding: "8px 10px", borderRadius: "8px", border: "1px solid #fca5a5", background: "transparent", color: "#dc2626", fontSize: "14px", cursor: "pointer", flexShrink: 0, marginBottom: "1px" };
const ppeGrid: React.CSSProperties      = { display: "flex", flexWrap: "wrap", gap: "16px" };
const ppeLabel: React.CSSProperties     = { display: "flex", gap: "6px", alignItems: "center", fontSize: "14px", cursor: "pointer", fontWeight: 500 };
const infoMsg: React.CSSProperties      = { fontSize: "13px", color: "#92400e", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: "8px", padding: "8px 12px", marginBottom: "12px" };
const errorStyle: React.CSSProperties   = { margin: "0 26px 12px", fontSize: "13px", color: "#dc2626", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", padding: "10px 14px" };
const footerRow: React.CSSProperties    = { padding: "18px 26px", display: "flex", justifyContent: "flex-end", gap: "10px" };
const cancelBtn: React.CSSProperties    = { padding: "9px 20px", borderRadius: "8px", border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: "14px", cursor: "pointer" };
const draftBtn: React.CSSProperties     = { padding: "9px 20px", borderRadius: "8px", border: "1.5px solid #1a4731", background: "#fff", color: "#1a4731", fontWeight: 700, fontSize: "14px", cursor: "pointer" };
const saveBtn: React.CSSProperties      = { padding: "9px 20px", borderRadius: "8px", background: "#1a4731", color: "#fff", fontWeight: 700, fontSize: "14px", border: "none", cursor: "pointer" };

export default function NuevaOTPage() { return <Suspense><NuevaOTContent /></Suspense>; }
