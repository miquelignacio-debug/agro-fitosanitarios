"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import Nav from "@/lib/nav";
import { useRol } from "@/lib/useRol";
import { useEmpresa } from "@/lib/useEmpresa";
import { useCampo } from "@/lib/useCampo";
import type { Empresa, StockMovimiento, Producto } from "@/lib/types";

type StockRow = {
  producto_id: string;
  producto: Producto;
  cantidad_disponible: number;
};

function displayStock(cantidad: number, unidadBodega: "lt" | "kg" | null): string {
  const fmt = (n: number) => n.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  if (unidadBodega === "kg") return `${fmt(cantidad)} Kg`;
  if (unidadBodega === "lt") return `${fmt(cantidad)} Lt`;
  return `${fmt(cantidad)} ?`; // unidad_bodega no definida → indica que hay que actualizar la ficha
}

type TransfForm = {
  origenId: string;
  productoId: string;
  cantidad: string;
  unidad: string;
  fecha: string;
  notas: string;
};

type SalidaVentaForm = {
  productoId: string;
  cantidad: string;
  tipo: "salida_venta" | "salida_devolucion";
  guiaDespacho: string;
  destinatario: string;
  fecha: string;
};

type OtPendiente = {
  id: string;
  estado: string;
  mojamiento_solicitado_ltha: number | null;
  campo_id: string | null;
  ot_productos: Array<{ producto_id: string; dosis_real: number; dosis_unidad: string; producto: { unidad_bodega: "lt" | "kg" | null } }>;
  ot_cuarteles: Array<{ superficie_ha: number }>;
};

type OtDesviacion = {
  id: string;
  numero: number;
  mojamiento_solicitado_ltha: number;
  mojamiento_real_ltha: number;
  fecha_aplicacion: string | null;
  ot_aplicadores: Array<{
    personal_id?: string | null;
    personal?: { id: string; nombre: string } | null;
    operador?: { nombre: string } | null;
  }>;
  ot_productos: Array<{ producto_id: string; dosis_real: number; dosis_unidad: string; producto: { nombre_comercial: string; unidad_bodega: "lt" | "kg" | null } }>;
  ot_cuarteles: Array<{ superficie_ha: number }>;
};

type OperadorStats = {
  id: string;
  nombre: string;
  nOts: number;
  avgDesviacionPct: number;
  totalExtraLt: number;
  impactoEconomico: number;
  ots: Array<{ id: string; numero: number; fecha: string | null; desviacionPct: number; extraLt: number; impacto: number }>;
};

function calcConsumoPlaneado(dosis: number, dosisUnidad: string, totalHa: number, mojamientoLtha: number): number {
  const u = dosisUnidad.toLowerCase().replace(/\s+/g, "");
  const volTotal = totalHa * mojamientoLtha;
  if (u.includes("/100lt") || u.includes("/100l")) {
    // dosis * volTotal / 100 gives result in the same unit as the dosis prefix.
    // Only divide by 1000 for minor units (cc, ml, g) to convert to lt/kg.
    const raw = dosis * volTotal / 100;
    return (u.startsWith("cc") || u.startsWith("ml") || u.startsWith("g")) ? raw / 1000 : raw;
  }
  if (u.startsWith("lt/ha") || u.startsWith("l/ha")) return dosis * totalHa;
  if (u.startsWith("cc/ha") || u.startsWith("ml/ha")) return dosis * totalHa / 1000;
  if (u.startsWith("kg/ha")) return dosis * totalHa;
  if (u.startsWith("g/ha")) return dosis * totalHa / 1000;
  return 0;
}

const TIPOS_SUMA = new Set(["entrada", "transferencia_entrada", "ajuste_entrada"]);
const TIPOS_SALIDA = new Set(["salida", "salida_barbecho", "salida_venta", "salida_devolucion", "transferencia_salida", "ajuste_salida"]);

const ETIQ_PALETA = ['#1a4731','#1d4ed8','#7c3aed','#b45309','#0f766e','#be185d','#dc2626','#0369a1'];
function etiqColor(n: string) { let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) & 0xfffffff; return ETIQ_PALETA[h % ETIQ_PALETA.length]; }

function BodegaContent() {
  const router = useRouter();
  const { empresaId, empresaNombre } = useEmpresa();
  const { campoId, campoNombre, allCampos } = useCampo();
  const { isAdmin, isEncargado } = useRol();
  const showPrecios = isAdmin;

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [movimientos, setMovimientos] = useState<StockMovimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [mvHasMore, setMvHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tab, setTab] = useState<"stock" | "movimientos" | "desviacion">("stock");
  const [stockSearch,  setStockSearch]  = useState("");
  const [stockFuncion, setStockFuncion] = useState("");
  const [stockBajo,    setStockBajo]    = useState(false);
  const [showTransf,   setShowTransf]   = useState(false);
  const [transfSaving, setTransfSaving] = useState(false);
  const [transfError,  setTransfError]  = useState("");
  const [stockOrigen,  setStockOrigen]  = useState<StockRow[]>([]);
  const [transfForm,   setTransfForm]   = useState<TransfForm>({
    origenId: "", productoId: "", cantidad: "", unidad: "lt",
    fecha: new Date().toISOString().slice(0, 10), notas: "",
  });

  const [showSalidaVenta,   setShowSalidaVenta]   = useState(false);
  const [salidaVentaSaving, setSalidaVentaSaving] = useState(false);
  const [salidaVentaError,  setSalidaVentaError]  = useState("");

  // Editar movimiento
  type EditMovForm = {
    id: string;
    productoNombre: string;
    tipo: string;
    unidad: string;
    fecha: string;
    cantidad: string;
    precioUnitario: string;
    docTipo: string;
    docNumero: string;
    proveedor: string;
    notas: string;
    etiquetas: string[];
  };
  const [editMov,     setEditMov]     = useState<EditMovForm | null>(null);
  const [editSaving,  setEditSaving]  = useState(false);
  const [editError,   setEditError]   = useState("");
  const [catalogProv, setCatalogProv] = useState<string[]>([]);
  const [movSearch, setMovSearch] = useState("");
  const [movDesde,  setMovDesde]  = useState("");
  const [movHasta,  setMovHasta]  = useState("");
  const [historialProductoId, setHistorialProductoId] = useState<string | null>(null);
  const [otsPendientes, setOtsPendientes] = useState<OtPendiente[]>([]);
  const [otsDesviacion, setOtsDesviacion] = useState<OtDesviacion[]>([]);
  const [costosMap,     setCostosMap]     = useState<Map<string, number>>(new Map());
  const [desAnio,       setDesAnio]       = useState(new Date().getFullYear());
  const [etiquetasDisp, setEtiquetasDisp] = useState<string[]>([]);
  const [stockEtiqueta, setStockEtiqueta] = useState("");
  const [movEtiqueta,   setMovEtiqueta]   = useState("");
  const [tagBalance,    setTagBalance]    = useState<Map<string, number>>(new Map());
  const [salidaVentaPrecio, setSalidaVentaPrecio] = useState<number | null>(null);
  const [salidaVentaForm,   setSalidaVentaForm]   = useState<SalidaVentaForm>({
    productoId: "", cantidad: "", tipo: "salida_venta",
    guiaDespacho: "", destinatario: "", fecha: new Date().toISOString().slice(0, 10),
  });

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const [{ data: emp }, { data: prov }] = await Promise.all([
        supabase.from("empresas").select("*").order("nombre"),
        supabase.from("proveedores").select("nombre").eq("activo", true).order("nombre"),
      ]);
      setCatalogProv((prov || []).map((r: { nombre: string }) => r.nombre));
      if (emp) setEmpresas(emp);
      if (!empresaId) return;
      await load(empresaId);
    };
    init();
  }, [empresaId, campoId]);

  useEffect(() => {
    if (!empresaId) return;
    supabase.from("cuarteles").select("especie").eq("empresa_id", empresaId).eq("activo", true)
      .then(({ data }) => {
        const esp = [...new Set((data || []).map((c: { especie: string }) => c.especie).filter(Boolean))].sort() as string[];
        setEtiquetasDisp(esp);
      });
  }, [empresaId]);

  useEffect(() => {
    if (!stockEtiqueta || !empresaId) { setTagBalance(new Map()); return; }
    const q = supabase.from("stock_movimientos")
      .select("producto_id, tipo, cantidad")
      .eq("empresa_id", empresaId)
      .contains("etiquetas", [stockEtiqueta]);
    (campoId ? q.eq("campo_id", campoId) : q).then(({ data }) => {
      const bal = new Map<string, number>();
      for (const m of (data || []) as { producto_id: string; tipo: string; cantidad: number }[]) {
        const sign = TIPOS_SUMA.has(m.tipo) ? 1 : -1;
        bal.set(m.producto_id, (bal.get(m.producto_id) ?? 0) + sign * Number(m.cantidad));
      }
      setTagBalance(bal);
    });
  }, [stockEtiqueta, empresaId, campoId]);

  const load = async (eid: string) => {
    setLoading(true);
    setLoadError("");
    try {

    // Aggregate campo-specific stock from ALL movimientos (not the empresa-level view)
    const baseAgg = supabase
      .from("stock_movimientos")
      .select("producto_id, tipo, cantidad, producto:productos(*)")
      .eq("empresa_id", eid);

    const baseMv = supabase
      .from("stock_movimientos")
      .select("*, producto:productos(*), empresa_contraparte:empresas!stock_movimientos_empresa_contraparte_id_fkey(*)")
      .eq("empresa_id", eid);

    const baseOtsPend = supabase
      .from("ordenes_trabajo")
      .select("id, estado, mojamiento_solicitado_ltha, campo_id, ot_productos(producto_id, dosis_real, dosis_unidad, producto:productos(unidad_bodega)), ot_cuarteles(superficie_ha)")
      .eq("empresa_id", eid)
      .in("estado", ["emitida", "en_ejecucion"]);

    const baseCostos = supabase
      .from("stock_movimientos")
      .select("producto_id, cantidad, precio_unitario")
      .eq("empresa_id", eid)
      .eq("tipo", "entrada")
      .not("precio_unitario", "is", null);

    const [{ data: aggData }, { data: mv }, { data: otsPend }, { data: costosData }] = await Promise.all([
      (campoId ? baseAgg.eq("campo_id", campoId) : baseAgg),
      (campoId ? baseMv.eq("campo_id", campoId) : baseMv)
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500),
      (campoId ? baseOtsPend.eq("campo_id", campoId) : baseOtsPend),
      baseCostos,
    ]);

    // Fetch desviación OTs — try v10 schema (personal_id on ot_aplicadores), fall back to operadores join
    let desQ = supabase.from("ordenes_trabajo")
      .select("id, numero, mojamiento_solicitado_ltha, mojamiento_real_ltha, fecha_aplicacion, ot_aplicadores(personal_id, personal:personal!personal_id(id, nombre)), ot_cuarteles(superficie_ha), ot_productos(producto_id, dosis_real, dosis_unidad, producto:productos(nombre_comercial, unidad_bodega))")
      .eq("empresa_id", eid).eq("estado", "finalizada")
      .not("mojamiento_solicitado_ltha", "is", null)
      .not("mojamiento_real_ltha", "is", null)
      .gte("fecha_aplicacion", `${new Date().getFullYear() - 1}-01-01`);
    if (campoId) desQ = desQ.eq("campo_id", campoId);
    let { data: otsDes, error: desErr } = await desQ;
    if (desErr) {
      let desQFb = supabase.from("ordenes_trabajo")
        .select("id, numero, mojamiento_solicitado_ltha, mojamiento_real_ltha, fecha_aplicacion, ot_aplicadores(operador:operadores(nombre)), ot_cuarteles(superficie_ha), ot_productos(producto_id, dosis_real, dosis_unidad, producto:productos(nombre_comercial, unidad_bodega))")
        .eq("empresa_id", eid).eq("estado", "finalizada")
        .not("mojamiento_solicitado_ltha", "is", null)
        .not("mojamiento_real_ltha", "is", null)
        .gte("fecha_aplicacion", `${new Date().getFullYear() - 1}-01-01`);
      if (campoId) desQFb = desQFb.eq("campo_id", campoId);
      const { data: d2 } = await desQFb;
      otsDes = d2 as unknown as typeof otsDes;
    }

    // Build campo-specific stock from aggregated movements
    const stockMap = new Map<string, StockRow>();
    for (const m of (aggData ?? []) as unknown as { producto_id: string; tipo: string; cantidad: number; producto: Producto }[]) {
      const sign = TIPOS_SUMA.has(m.tipo) ? 1 : -1;
      const prev = stockMap.get(m.producto_id);
      if (prev) {
        prev.cantidad_disponible += sign * m.cantidad;
      } else {
        stockMap.set(m.producto_id, { producto_id: m.producto_id, producto: m.producto, cantidad_disponible: sign * m.cantidad });
      }
    }
    const stockRows = [...stockMap.values()].sort((a, b) =>
      a.producto.nombre_comercial.localeCompare(b.producto.nombre_comercial)
    );

    // Weighted avg cost per product in CLP (empresa-level, for desviación valuation)
    // All precio_unitario values are stored in CLP regardless of entry origin
    const costoAcc = new Map<string, { v: number; q: number }>();
    for (const c of (costosData ?? []) as unknown as { producto_id: string; cantidad: number; precio_unitario: number }[]) {
      const acc = costoAcc.get(c.producto_id) ?? { v: 0, q: 0 };
      acc.v += Number(c.cantidad) * Number(c.precio_unitario);
      acc.q += Number(c.cantidad);
      costoAcc.set(c.producto_id, acc);
    }
    const newCostosMap = new Map<string, number>();
    for (const [pid, acc] of costoAcc) {
      if (acc.q > 0) newCostosMap.set(pid, acc.v / acc.q);
    }

    // Cargar números de OT por separado (ot_id no tiene FK explícito, el join inline falla)
    const rawMv = (mv as StockMovimiento[]) || [];
    const otIds = [...new Set(rawMv.filter(m => m.ot_id).map(m => m.ot_id!))];
    let otMap: Record<string, number> = {};
    if (otIds.length) {
      const { data: ots } = await supabase
        .from("ordenes_trabajo").select("id, numero").in("id", otIds);
      if (ots) otMap = Object.fromEntries(ots.map((o: { id: string; numero: number }) => [o.id, o.numero]));
    }
    const mvsConOt = rawMv.map(m => ({
      ...m,
      ot: m.ot_id ? { id: m.ot_id, numero: otMap[m.ot_id] } : undefined,
    }));

    setStock(stockRows);
    setMovimientos(mvsConOt as StockMovimiento[]);
    setMvHasMore((mv?.length ?? 0) >= 500);
    setOtsPendientes((otsPend ?? []) as unknown as OtPendiente[]);
    setOtsDesviacion((otsDes ?? []) as unknown as OtDesviacion[]);
    setCostosMap(newCostosMap);

    } catch (e) {
      console.error("Error cargando bodega:", e);
      setLoadError("Error al cargar los datos. Intentá recargar la página.");
    } finally {
      setLoading(false);
    }
  };

  const loadMoreMov = async () => {
    if (!empresaId || loadingMore) return;
    setLoadingMore(true);
    const from = movimientos.length;
    const to   = from + 499;
    const baseMv = supabase
      .from("stock_movimientos")
      .select("*, producto:productos(*), empresa_contraparte:empresas!stock_movimientos_empresa_contraparte_id_fkey(*)")
      .eq("empresa_id", empresaId);
    const { data: mv, error: mvErr } = await (campoId ? baseMv.eq("campo_id", campoId) : baseMv)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (mvErr) {
      // keep mvHasMore=true so the user can retry
      setLoadingMore(false);
      return;
    }
    if (mv && mv.length > 0) {
      const rawMv = mv as StockMovimiento[];
      const otIds = [...new Set(rawMv.filter(m => m.ot_id).map(m => m.ot_id!))];
      let otMap: Record<string, number> = {};
      if (otIds.length) {
        const { data: ots } = await supabase.from("ordenes_trabajo").select("id, numero").in("id", otIds);
        if (ots) otMap = Object.fromEntries(ots.map((o: { id: string; numero: number }) => [o.id, o.numero]));
      }
      const mvsConOt = rawMv.map(m => ({ ...m, ot: m.ot_id ? { id: m.ot_id, numero: otMap[m.ot_id] } : undefined }));
      setMovimientos(prev => [...prev, ...mvsConOt as StockMovimiento[]]);
      setMvHasMore(mv.length === 500);
    } else {
      setMvHasMore(false);
    }
    setLoadingMore(false);
  };

  const funcionesDisponibles = Array.from(
    new Set(stock.flatMap(s => s.producto.tipo_funcion || []))
  ).sort();

  const esBajoStock = (s: StockRow) => {
    const min = s.producto.stock_minimo != null ? s.producto.stock_minimo : 5;
    return Number(s.cantidad_disponible) < min;
  };

  const stockFiltrado = stock.filter(s => {
    const q = stockSearch.toLowerCase();
    const matchSearch  = !stockSearch  ||
      s.producto.nombre_comercial.toLowerCase().includes(q) ||
      (s.producto.ingrediente_activo || "").toLowerCase().includes(q);
    const matchFuncion = !stockFuncion || s.producto.tipo_funcion?.includes(stockFuncion);
    const matchBajo    = !stockBajo    || esBajoStock(s);
    return matchSearch && matchFuncion && matchBajo;
  });

  const movsFiltrados = movimientos.filter(m => {
    const matchProd  = !movSearch     || m.producto?.nombre_comercial?.toLowerCase().includes(movSearch.toLowerCase());
    const matchDesde = !movDesde      || m.fecha >= movDesde;
    const matchHasta = !movHasta      || m.fecha <= movHasta;
    const matchEtiq  = !movEtiqueta   || (m.etiquetas?.includes(movEtiqueta) ?? false);
    return matchProd && matchDesde && matchHasta && matchEtiq;
  });

  // Running stock balance per product, computed backwards from current campo stock
  const runningBal = new Map<string, number>(stock.map(s => [s.producto_id, Number(s.cantidad_disponible)]));
  const stockFinalMap = new Map<string, number>();
  for (const m of movimientos) {
    const pid = m.producto_id;
    const curr = runningBal.get(pid) ?? 0;
    stockFinalMap.set(m.id, curr);
    runningBal.set(pid, curr + (TIPOS_SUMA.has(m.tipo) ? -Number(m.cantidad) : Number(m.cantidad)));
  }

  // Stock proyectado: consume pending OTs
  const proyeccionMap = new Map<string, number>();
  for (const ot of otsPendientes) {
    const totalHa = ot.ot_cuarteles.reduce((s, c) => s + Number(c.superficie_ha), 0);
    const moj = Number(ot.mojamiento_solicitado_ltha ?? 0);
    for (const p of ot.ot_productos) {
      const consumo = calcConsumoPlaneado(Number(p.dosis_real), p.dosis_unidad, totalHa, moj);
      proyeccionMap.set(p.producto_id, (proyeccionMap.get(p.producto_id) ?? 0) + consumo);
    }
  }

  // Desviación: filter by selected year and group by aplicador
  const desOts = otsDesviacion.filter(ot => ot.fecha_aplicacion?.slice(0, 4) === String(desAnio));
  const operadorMap = new Map<string, OperadorStats>();
  for (const ot of desOts) {
    const totalHa = ot.ot_cuarteles.reduce((s, c) => s + Number(c.superficie_ha), 0);
    const mojPlan = Number(ot.mojamiento_solicitado_ltha);
    const mojReal = Number(ot.mojamiento_real_ltha);
    const desviacionPct = mojPlan > 0 ? (mojReal - mojPlan) / mojPlan * 100 : 0;
    const extraLt = (mojReal - mojPlan) * totalHa;
    // Impact for ALL products: if mojamiento changed, the tank mix concentration is maintained
    // so all products scale proportionally: extra = consumo_plan × Δmojamiento / mojPlan
    let impacto = 0;
    if (mojPlan > 0) {
      for (const p of ot.ot_productos) {
        const consumoPlan = calcConsumoPlaneado(Number(p.dosis_real), p.dosis_unidad, totalHa, mojPlan);
        const extraProd = consumoPlan * (mojReal - mojPlan) / mojPlan;
        impacto += extraProd * (costosMap.get(p.producto_id) ?? 0);
      }
    }
    const aplicadores = (ot.ot_aplicadores?.length ?? 0) > 0
      ? ot.ot_aplicadores.map(a => ({
          id: a.personal?.id ?? a.operador?.nombre ?? "__none__",
          nombre: a.personal?.nombre ?? a.operador?.nombre ?? "Sin aplicador",
        }))
      : [{ id: "__none__", nombre: "Sin aplicador" }];
    for (const ap of aplicadores) {
      if (!operadorMap.has(ap.id)) {
        operadorMap.set(ap.id, { id: ap.id, nombre: ap.nombre, nOts: 0, avgDesviacionPct: 0, totalExtraLt: 0, impactoEconomico: 0, ots: [] });
      }
      const stats = operadorMap.get(ap.id)!;
      stats.nOts += 1;
      stats.totalExtraLt += extraLt;
      stats.impactoEconomico += impacto;
      stats.ots.push({ id: ot.id, numero: ot.numero, fecha: ot.fecha_aplicacion, desviacionPct, extraLt, impacto });
    }
  }
  for (const [, s] of operadorMap) {
    s.avgDesviacionPct = s.ots.reduce((sum, o) => sum + o.desviacionPct, 0) / s.ots.length;
  }
  const operadorStats = [...operadorMap.values()].sort((a, b) => Math.abs(b.impactoEconomico) - Math.abs(a.impactoEconomico));

  const totalImpacto = operadorStats.reduce((s, o) => s + o.impactoEconomico, 0);
  const totalExtraLt = operadorStats.reduce((s, o) => s + o.totalExtraLt, 0);

  const openTransf = async () => {
    const otrosCampos = allCampos.filter(c => c.id !== campoId);
    const origenId = otrosCampos[0]?.id || "";
    // Carga el stock total de la empresa (para ver disponibilidad)
    const { data } = await supabase.from("stock_actual").select("*, producto:productos(*)").eq("empresa_id", empresaId);
    setStockOrigen((data as StockRow[]) || []);
    setTransfForm({ origenId, productoId: "", cantidad: "", unidad: "lt", fecha: new Date().toISOString().slice(0, 10), notas: "" });
    setTransfError("");
    setShowTransf(true);
  };

  const loadStockOrigen = async (_cid: string) => {
    // Stock total de la empresa (no filtramos por campo para ver disponibilidad global)
    if (!empresaId) { setStockOrigen([]); return; }
    const { data } = await supabase.from("stock_actual").select("*, producto:productos(*)").eq("empresa_id", empresaId);
    setStockOrigen((data as StockRow[]) || []);
  };

  const handleTransferencia = async () => {
    setTransfError("");
    const { origenId, productoId, cantidad, unidad, fecha, notas } = transfForm;
    if (!origenId)                              { setTransfError("Seleccioná el campo origen."); return; }
    if (origenId === campoId)                   { setTransfError("Origen y destino no pueden ser el mismo campo."); return; }
    if (!productoId)                            { setTransfError("Seleccioná un producto."); return; }
    if (!cantidad || parseFloat(cantidad) <= 0) { setTransfError("La cantidad debe ser mayor a 0."); return; }

    const destNombre = campoNombre || "destino";
    const origNombre = allCampos.find(c => c.id === origenId)?.nombre || "origen";
    setTransfSaving(true);

    const [r1, r2] = await Promise.all([
      supabase.from("stock_movimientos").insert({
        empresa_id: empresaId, campo_id: origenId,
        producto_id: productoId, tipo: "transferencia_salida",
        cantidad: parseFloat(cantidad), unidad, fecha,
        notas: notas.trim() || `Transferencia a campo ${destNombre}`,
      }),
      supabase.from("stock_movimientos").insert({
        empresa_id: empresaId, campo_id: campoId,
        producto_id: productoId, tipo: "transferencia_entrada",
        cantidad: parseFloat(cantidad), unidad, fecha,
        notas: notas.trim() || `Transferencia desde campo ${origNombre}`,
      }),
    ]);

    setTransfSaving(false);
    if (r1.error || r2.error) { setTransfError((r1.error || r2.error)!.message); return; }
    setShowTransf(false);
    await load(empresaId);
  };

  const openEditMov = (m: StockMovimiento) => {
    setEditError("");
    setEditMov({
      id: m.id,
      productoNombre: m.producto?.nombre_comercial || "",
      tipo: m.tipo,
      unidad: m.unidad,
      fecha: m.fecha,
      cantidad: String(m.cantidad),
      precioUnitario: m.precio_unitario != null ? String(m.precio_unitario) : "",
      docTipo: m.documento_tipo || "",
      docNumero: m.documento_numero || "",
      proveedor: m.proveedor || "",
      notas: m.notas || "",
      etiquetas: m.etiquetas ?? [],
    });
  };

  const handleEditMov = async () => {
    if (!editMov) return;
    const cantNum = parseFloat(editMov.cantidad);
    if (!cantNum || cantNum <= 0) { setEditError("La cantidad debe ser mayor a 0."); return; }
    setEditSaving(true);
    setEditError("");
    const isSalida = TIPOS_SALIDA.has(editMov.tipo);
    const { error } = await supabase
      .from("stock_movimientos")
      .update({
        etiquetas: editMov.etiquetas.length ? editMov.etiquetas : null,
        ...(isSalida ? {} : {
          fecha: editMov.fecha,
          cantidad: cantNum,
          precio_unitario: editMov.precioUnitario ? parseFloat(editMov.precioUnitario) : null,
          documento_tipo: (editMov.docTipo as "guia_despacho" | "factura") || null,
          documento_numero: editMov.docNumero.trim() || null,
          proveedor: editMov.proveedor.trim() || null,
          notas: editMov.notas.trim() || null,
        }),
      })
      .eq("id", editMov.id);
    setEditSaving(false);
    if (error) { setEditError(error.message); return; }
    if (editMov.proveedor.trim()) {
      await supabase.from("proveedores").upsert(
        { nombre: editMov.proveedor.trim(), activo: true },
        { onConflict: "nombre", ignoreDuplicates: true }
      );
      setCatalogProv(prev => [...new Set([...prev, editMov.proveedor.trim()])].sort());
    }
    setEditMov(null);
    await load(empresaId);
  };

  const calcPrecioPromedio = async (productoId: string): Promise<number | null> => {
    const { data } = await supabase
      .from("stock_movimientos")
      .select("cantidad, precio_unitario")
      .eq("empresa_id", empresaId)
      .eq("producto_id", productoId)
      .in("tipo", ["entrada", "ajuste_entrada"])
      .not("precio_unitario", "is", null);
    if (!data || data.length === 0) return null;
    const totalCosto = data.reduce((s: number, m: { cantidad: number; precio_unitario: number }) => s + m.cantidad * m.precio_unitario, 0);
    const totalCant  = data.reduce((s: number, m: { cantidad: number }) => s + m.cantidad, 0);
    return totalCant > 0 ? totalCosto / totalCant : null;
  };

  const openSalidaVenta = () => {
    setSalidaVentaForm({
      productoId: "", cantidad: "", tipo: "salida_venta",
      guiaDespacho: "", destinatario: "", fecha: new Date().toISOString().slice(0, 10),
    });
    setSalidaVentaPrecio(null);
    setSalidaVentaError("");
    setShowSalidaVenta(true);
  };

  const handleSalidaVenta = async () => {
    setSalidaVentaError("");
    const { productoId, cantidad, tipo, guiaDespacho, destinatario, fecha } = salidaVentaForm;
    if (!productoId)                             { setSalidaVentaError("Selecciona un producto."); return; }
    if (!cantidad || parseFloat(cantidad) <= 0)  { setSalidaVentaError("Ingresa una cantidad válida."); return; }
    if (!guiaDespacho.trim())                    { setSalidaVentaError("Ingresa el número de guía de despacho."); return; }

    const stockRow = stock.find(s => s.producto_id === productoId);
    if (!stockRow || Number(stockRow.cantidad_disponible) < parseFloat(cantidad)) {
      setSalidaVentaError("Stock insuficiente.");
      return;
    }

    const precioPromedio = await calcPrecioPromedio(productoId);

    setSalidaVentaSaving(true);
    const { error } = await supabase.from("stock_movimientos").insert({
      empresa_id:      empresaId,
      campo_id:        campoId || null,
      producto_id:     productoId,
      tipo,
      cantidad:        parseFloat(cantidad),
      unidad:          stockRow.producto.unidad_bodega || "lt",
      fecha,
      documento_tipo:    "guia_despacho",
      documento_numero:  guiaDespacho.trim(),
      precio_unitario:   precioPromedio,
      costo_unitario:    precioPromedio,
      notas:             destinatario.trim() || null,
    });
    setSalidaVentaSaving(false);
    if (error) { setSalidaVentaError(error.message); return; }
    setShowSalidaVenta(false);
    await load(empresaId);
  };

  const tipoLabel: Record<string, string> = {
    entrada: "Entrada",
    salida: "Salida (OT)",
    salida_barbecho: "Barbecho (OT)",
    transferencia_salida: "Transf. salida",
    transferencia_entrada: "Transf. entrada",
    ajuste_entrada: "Ajuste +",
    ajuste_salida: "Ajuste −",
    salida_venta: "Salida venta",
    salida_devolucion: "Devolución",
  };

  const tipoColor: Record<string, string> = {
    entrada: "#15803d",
    salida: "#dc2626",
    salida_barbecho: "#92400e",
    transferencia_salida: "#d97706",
    transferencia_entrada: "#1d4ed8",
    ajuste_entrada: "#0891b2",
    ajuste_salida: "#7c3aed",
    salida_venta: "#be185d",
    salida_devolucion: "#0e7490",
  };

  return (
    <>
      <Nav />
      <main style={container}>
        <div style={pageHeader}>
          <div>
            <h1 style={pageTitle}>Bodega — {campoNombre || empresaNombre}</h1>
            <p style={pageSubtitle}>Stock de productos fitosanitarios</p>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {isAdmin && (
              <>
                <Link href="/bodega/carga-inicial" style={secondaryBtn}>
                  Inventario inicial (plantilla)
                </Link>
                <Link href="/bodega/inventario" style={secondaryBtn}>
                  Toma de inventario
                </Link>
                {allCampos.length > 1 && (
                  <button onClick={openTransf} style={secondaryBtn}>
                    ⇄ Transferencia entre campos
                  </button>
                )}
              </>
            )}
            {isAdmin && (
              <button onClick={openSalidaVenta} style={secondaryBtn}>
                Salida venta / devolución
              </button>
            )}
            {(isAdmin || isEncargado) && (
              <Link href="/bodega/ingreso" style={primaryBtn}>
                + Ingreso a bodega
              </Link>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div style={tabBar}>
          <button
            onClick={() => setTab("stock")}
            style={{ ...tabBtn, ...(tab === "stock" ? tabBtnActive : {}) }}
          >
            Stock actual
          </button>
          <button
            onClick={() => setTab("movimientos")}
            style={{ ...tabBtn, ...(tab === "movimientos" ? tabBtnActive : {}) }}
          >
            Movimientos
          </button>
          <button
            onClick={() => setTab("desviacion")}
            style={{ ...tabBtn, ...(tab === "desviacion" ? tabBtnActive : {}) }}
          >
            Desviación
          </button>
        </div>

        {/* Modal transferencia */}
        {showTransf && (
          <div style={modalOverlay}>
            <div style={{ ...modalBox, width: "480px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 800, color: "#1a4731", marginBottom: "16px" }}>
                Transferencia entre campos
              </h3>

              <div style={{ display: "grid", gap: "14px" }}>
                <div>
                  <label style={lbl}>Campo origen (sale el stock)</label>
                  <select
                    value={transfForm.origenId}
                    onChange={e => {
                      setTransfForm(f => ({ ...f, origenId: e.target.value, productoId: "" }));
                      loadStockOrigen(e.target.value);
                    }}
                    style={minp}
                  >
                    <option value="">— Seleccionar —</option>
                    {allCampos.filter(c => c.id !== campoId).map(c => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={lbl}>Campo destino (entra el stock)</label>
                  <div style={{ ...minp, background: "#f3f4f6", color: "#6b7280" }}>{campoNombre}</div>
                </div>

                <div>
                  <label style={lbl}>Producto</label>
                  <select
                    value={transfForm.productoId}
                    onChange={e => {
                      const prod = stockOrigen.find(s => s.producto_id === e.target.value);
                      const unit = (prod?.producto.unidad_dosis || "lt").split("/")[0].toLowerCase();
                      setTransfForm(f => ({ ...f, productoId: e.target.value, unidad: unit }));
                    }}
                    style={minp}
                  >
                    <option value="">— Seleccionar producto —</option>
                    {stockOrigen.filter(s => Number(s.cantidad_disponible) > 0).map(s => (
                      <option key={s.producto_id} value={s.producto_id}>
                        {s.producto.nombre_comercial} — {displayStock(Number(s.cantidad_disponible), s.producto.unidad_bodega)} disponibles
                      </option>
                    ))}
                  </select>
                  {transfForm.productoId && (() => {
                    const row = stockOrigen.find(s => s.producto_id === transfForm.productoId);
                    if (!row) return null;
                    return (
                      <p style={{ fontSize: "12px", color: "#15803d", marginTop: "4px" }}>
                        Stock disponible: {displayStock(Number(row.cantidad_disponible), row.producto.unidad_bodega)}
                      </p>
                    );
                  })()}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={lbl}>Cantidad</label>
                    <input
                      type="number" min="0" step="any"
                      value={transfForm.cantidad}
                      onChange={e => setTransfForm(f => ({ ...f, cantidad: e.target.value }))}
                      style={minp} placeholder="0"
                    />
                  </div>
                  <div>
                    <label style={lbl}>Unidad</label>
                    <input
                      value={transfForm.unidad}
                      onChange={e => setTransfForm(f => ({ ...f, unidad: e.target.value }))}
                      style={minp} placeholder="lt"
                    />
                  </div>
                </div>

                <div>
                  <label style={lbl}>Fecha</label>
                  <input type="date" value={transfForm.fecha}
                    onChange={e => setTransfForm(f => ({ ...f, fecha: e.target.value }))}
                    style={minp} />
                </div>

                <div>
                  <label style={lbl}>Notas (opcional)</label>
                  <input value={transfForm.notas}
                    onChange={e => setTransfForm(f => ({ ...f, notas: e.target.value }))}
                    style={minp} placeholder="Motivo de la transferencia" />
                </div>

                {transfError && (
                  <p style={{ fontSize: "13px", color: "#dc2626", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", padding: "10px 14px", margin: 0 }}>
                    {transfError}
                  </p>
                )}
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "20px", justifyContent: "flex-end" }}>
                <button onClick={() => setShowTransf(false)} style={mCancelBtn}>Cancelar</button>
                <button onClick={handleTransferencia} disabled={transfSaving} style={mSaveBtn}>
                  {transfSaving ? "Registrando..." : "Registrar transferencia"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal salida venta / devolución */}
        {showSalidaVenta && (
          <div style={modalOverlay}>
            <div style={{ ...modalBox, width: "460px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 800, color: "#1a4731", marginBottom: "16px" }}>
                Salida por venta / devolución
              </h3>
              <div style={{ display: "grid", gap: "14px" }}>
                <div>
                  <label style={lbl}>Tipo</label>
                  <select
                    value={salidaVentaForm.tipo}
                    onChange={e => setSalidaVentaForm(f => ({ ...f, tipo: e.target.value as SalidaVentaForm["tipo"] }))}
                    style={minp}
                  >
                    <option value="salida_venta">Venta</option>
                    <option value="salida_devolucion">Devolución</option>
                  </select>
                </div>

                <div>
                  <label style={lbl}>Producto</label>
                  <select
                    value={salidaVentaForm.productoId}
                    onChange={async e => {
                      const pid = e.target.value;
                      setSalidaVentaForm(f => ({ ...f, productoId: pid, cantidad: "" }));
                      setSalidaVentaPrecio(null);
                      if (pid) {
                        const precio = await calcPrecioPromedio(pid);
                        setSalidaVentaPrecio(precio);
                      }
                    }}
                    style={minp}
                  >
                    <option value="">— Seleccionar producto —</option>
                    {stock.filter(s => Number(s.cantidad_disponible) > 0).map(s => (
                      <option key={s.producto_id} value={s.producto_id}>
                        {s.producto.nombre_comercial} — {displayStock(Number(s.cantidad_disponible), s.producto.unidad_bodega)} disponibles
                      </option>
                    ))}
                  </select>
                  {salidaVentaForm.productoId && (
                    <p style={{ fontSize: "12px", marginTop: "4px", color: salidaVentaPrecio != null ? "#1a4731" : "#d97706" }}>
                      {salidaVentaPrecio != null
                        ? `Precio promedio stock: $${salidaVentaPrecio.toLocaleString("es-CL", { maximumFractionDigits: 0 })} / ${stock.find(s => s.producto_id === salidaVentaForm.productoId)?.producto.unidad_bodega || "u"}`
                        : "Sin precio de costo registrado — se ingresará sin valor monetario."}
                    </p>
                  )}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={lbl}>Cantidad</label>
                    <input
                      type="number" min="0" step="any"
                      value={salidaVentaForm.cantidad}
                      onChange={e => setSalidaVentaForm(f => ({ ...f, cantidad: e.target.value }))}
                      style={minp} placeholder="0"
                    />
                  </div>
                  <div>
                    <label style={lbl}>Fecha</label>
                    <input
                      type="date" value={salidaVentaForm.fecha}
                      onChange={e => setSalidaVentaForm(f => ({ ...f, fecha: e.target.value }))}
                      style={minp}
                    />
                  </div>
                </div>

                <div>
                  <label style={lbl}>N° Guía de despacho</label>
                  <input
                    value={salidaVentaForm.guiaDespacho}
                    onChange={e => setSalidaVentaForm(f => ({ ...f, guiaDespacho: e.target.value }))}
                    style={minp} placeholder="Ej: 1234"
                  />
                </div>

                <div>
                  <label style={lbl}>Destinatario (opcional)</label>
                  <input
                    value={salidaVentaForm.destinatario}
                    onChange={e => setSalidaVentaForm(f => ({ ...f, destinatario: e.target.value }))}
                    style={minp} placeholder="Nombre del comprador o receptor"
                  />
                </div>

                {salidaVentaError && (
                  <p style={{ fontSize: "13px", color: "#dc2626", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", padding: "10px 14px", margin: 0 }}>
                    {salidaVentaError}
                  </p>
                )}
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "20px", justifyContent: "flex-end" }}>
                <button onClick={() => setShowSalidaVenta(false)} style={mCancelBtn}>Cancelar</button>
                <button onClick={handleSalidaVenta} disabled={salidaVentaSaving} style={mSaveBtn}>
                  {salidaVentaSaving ? "Registrando..." : "Registrar salida"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal editar movimiento */}
        {editMov && (() => {
          const isSalidaMov = TIPOS_SALIDA.has(editMov.tipo);
          return (
          <div style={modalOverlay}>
            <div style={{ ...modalBox, width: "500px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 800, color: "#1a4731", marginBottom: "4px" }}>
                {isSalidaMov ? "Editar etiquetas" : "Editar movimiento"}
              </h3>
              <p style={{ fontSize: "12px", color: "#6b7280", marginBottom: "16px" }}>
                {editMov.productoNombre} · {tipoLabel[editMov.tipo] || editMov.tipo}
              </p>
              <div style={{ display: "grid", gap: "14px" }}>
                {/* Etiquetas — siempre visible */}
                {etiquetasDisp.length > 0 && (
                  <div>
                    <label style={lbl}>Etiquetas (especie)</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
                      {etiquetasDisp.map(e => {
                        const sel = editMov.etiquetas.includes(e);
                        return (
                          <button key={e} type="button"
                            onClick={() => setEditMov(f => f && ({ ...f, etiquetas: sel ? f.etiquetas.filter(x => x !== e) : [...f.etiquetas, e] }))}
                            style={{ padding: "4px 12px", borderRadius: "999px", border: `1.5px solid ${etiqColor(e)}`,
                              background: sel ? etiqColor(e) : "#fff", color: sel ? "#fff" : etiqColor(e),
                              fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                            {e}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {/* Campos de cantidad/documento/notas — solo para entradas y ajustes */}
                {!isSalidaMov && (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      <div>
                        <label style={lbl}>Fecha</label>
                        <input type="date" value={editMov.fecha}
                          onChange={e => setEditMov(f => f && ({ ...f, fecha: e.target.value }))} style={minp} />
                      </div>
                      <div>
                        <label style={lbl}>Cantidad ({editMov.unidad})</label>
                        <input type="number" min="0" step="any" value={editMov.cantidad}
                          onChange={e => setEditMov(f => f && ({ ...f, cantidad: e.target.value }))} style={minp} />
                      </div>
                    </div>
                    <div>
                      <label style={lbl}>Precio unitario ($/unidad)</label>
                      <input type="number" min="0" step="any" value={editMov.precioUnitario}
                        onChange={e => setEditMov(f => f && ({ ...f, precioUnitario: e.target.value }))}
                        style={minp} placeholder="Opcional" />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      <div>
                        <label style={lbl}>Tipo de documento</label>
                        <select value={editMov.docTipo} onChange={e => setEditMov(f => f && ({ ...f, docTipo: e.target.value }))} style={minp}>
                          <option value="">Sin documento</option>
                          <option value="guia_despacho">Guía de despacho</option>
                          <option value="factura">Factura</option>
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>N° Documento</label>
                        <input value={editMov.docNumero}
                          onChange={e => setEditMov(f => f && ({ ...f, docNumero: e.target.value }))}
                          style={minp} placeholder="Ej. 975392" />
                      </div>
                    </div>
                    <div>
                      <label style={lbl}>Proveedor</label>
                      <input list="edit-catalog-prov" value={editMov.proveedor}
                        onChange={e => setEditMov(f => f && ({ ...f, proveedor: e.target.value }))}
                        style={minp} placeholder="Buscar o escribir proveedor..." />
                      <datalist id="edit-catalog-prov">
                        {catalogProv.map(n => <option key={n} value={n} />)}
                      </datalist>
                    </div>
                    <div>
                      <label style={lbl}>Notas</label>
                      <input value={editMov.notas}
                        onChange={e => setEditMov(f => f && ({ ...f, notas: e.target.value }))}
                        style={minp} placeholder="Opcional" />
                    </div>
                  </>
                )}
                {editError && (
                  <p style={{ fontSize: "13px", color: "#dc2626", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", padding: "10px 14px", margin: 0 }}>
                    {editError}
                  </p>
                )}
              </div>
              <div style={{ display: "flex", gap: "10px", marginTop: "20px", justifyContent: "flex-end" }}>
                <button onClick={() => setEditMov(null)} style={mCancelBtn}>Cancelar</button>
                <button onClick={handleEditMov} disabled={editSaving} style={mSaveBtn}>
                  {editSaving ? "Guardando..." : "Guardar cambios"}
                </button>
              </div>
            </div>
          </div>
          );
        })()}

        {/* Modal historial de movimientos por producto */}
        {historialProductoId && (() => {
          const prodStock = stock.find(s => s.producto_id === historialProductoId);
          const histMov = movimientos.filter(m => m.producto_id === historialProductoId);
          return (
            <div style={modalOverlay} onClick={() => setHistorialProductoId(null)}>
              <div style={{ ...modalBox, width: "820px", maxWidth: "95vw", padding: "20px" }} onClick={e => e.stopPropagation()}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                  <div>
                    <h3 style={{ fontSize: "17px", fontWeight: 800, color: "#1a4731", marginBottom: "3px" }}>
                      {prodStock?.producto.nombre_comercial ?? "Producto"}
                    </h3>
                    <p style={{ fontSize: "12px", color: "#6b7280" }}>
                      {histMov.length} movimiento{histMov.length !== 1 ? "s" : ""} · Stock actual: {prodStock ? displayStock(Number(prodStock.cantidad_disponible), prodStock.producto.unidad_bodega) : "—"}
                    </p>
                  </div>
                  <button onClick={() => setHistorialProductoId(null)} style={{ background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: "#9ca3af", lineHeight: 1 }}>×</button>
                </div>
                {histMov.length === 0 ? (
                  <p style={{ textAlign: "center", color: "#9ca3af", padding: "28px" }}>Sin movimientos registrados para este producto.</p>
                ) : (
                  <div style={{ overflowX: "auto", maxHeight: "60vh", overflowY: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                      <thead style={{ position: "sticky", top: 0 }}>
                        <tr>
                          {["Fecha", "Tipo", "Cantidad", "Stock final", ...(showPrecios ? ["Valor unit.", "Valor total"] : []), "Documento", "Proveedor / OT", "Notas"].map(h => (
                            <th key={h} style={th}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {histMov.map(m => (
                          <tr key={m.id}>
                            <td style={{ ...td, whiteSpace: "nowrap" }}>{m.fecha}</td>
                            <td style={td}>
                              <span style={{ fontWeight: 700, color: tipoColor[m.tipo] || "#374151" }}>
                                {tipoLabel[m.tipo] || m.tipo}
                              </span>
                            </td>
                            <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>
                              {m.tipo.includes("salida") ? "−" : "+"}{Number(m.cantidad).toFixed(3)} {m.unidad}
                            </td>
                            <td style={{ ...td, textAlign: "right", fontWeight: 600, color: (stockFinalMap.get(m.id) ?? 0) < 0 ? "#dc2626" : "#15803d" }}>
                              {stockFinalMap.has(m.id) ? displayStock(stockFinalMap.get(m.id) ?? 0, prodStock?.producto.unidad_bodega ?? null) : "—"}
                            </td>
                            {showPrecios && (
                              <td style={{ ...td, textAlign: "right", color: "#6b7280" }}>
                                {(m.precio_unitario ?? m.costo_unitario ?? costosMap.get(m.producto_id)) != null ? `$${Number(m.precio_unitario ?? m.costo_unitario ?? costosMap.get(m.producto_id)).toLocaleString("es-CL", { maximumFractionDigits: 0 })}` : "—"}
                              </td>
                            )}
                            {showPrecios && (
                              <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>
                                {(m.precio_unitario ?? m.costo_unitario ?? costosMap.get(m.producto_id)) != null ? `$${(Number(m.precio_unitario ?? m.costo_unitario ?? costosMap.get(m.producto_id)) * Number(m.cantidad)).toLocaleString("es-CL", { maximumFractionDigits: 0 })}` : "—"}
                              </td>
                            )}
                            <td style={td}>
                              {m.documento_tipo ? `${m.documento_tipo === "guia_despacho" ? "Guía" : "Factura"} #${m.documento_numero || "—"}` : "—"}
                            </td>
                            <td style={td}>
                              {m.proveedor || m.empresa_contraparte?.nombre
                                ? (m.proveedor ?? m.empresa_contraparte?.nombre)
                                : m.ot_id
                                  ? <Link href={`/ordenes/${m.ot_id}`} style={{ color: "#1a4731", fontWeight: 700, textDecoration: "none" }}>OT #{m.ot?.numero ?? "?"}</Link>
                                  : "—"}
                            </td>
                            <td style={{ ...td, color: "#6b7280" }}>{m.notas || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {loadError && (
          <div style={{ marginTop: "20px", padding: "14px 18px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "10px", color: "#dc2626", fontSize: "14px" }}>
            ⚠ {loadError}
            <button onClick={() => { setLoadError(""); if (empresaId) load(empresaId); }} style={{ marginLeft: "12px", fontSize: "13px", color: "#dc2626", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Reintentar</button>
          </div>
        )}
        {loading ? (
          <p style={{ color: "#6b7280", marginTop: "20px" }}>Cargando...</p>
        ) : tab === "stock" ? (
          <>
            <div style={{ display: "flex", gap: "10px", marginBottom: "14px", flexWrap: "wrap", alignItems: "center" }}>
              <input
                placeholder="Buscar producto o ingrediente activo..."
                value={stockSearch}
                onChange={e => setStockSearch(e.target.value)}
                style={filterInput}
              />
              <select value={stockFuncion} onChange={e => setStockFuncion(e.target.value)} style={filterSelect}>
                <option value="">Todas las funciones</option>
                {funcionesDisponibles.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              <label style={filterLabel}>
                <input type="checkbox" checked={stockBajo} onChange={e => setStockBajo(e.target.checked)} />
                Solo bajo stock
              </label>
              {(stockSearch || stockFuncion || stockBajo || stockEtiqueta) && (
                <span style={{ fontSize: "12px", color: "#6b7280" }}>{stockFiltrado.length} / {stock.length} productos</span>
              )}
            </div>
            {etiquetasDisp.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px", alignItems: "center" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase" }}>Etiqueta:</span>
                {etiquetasDisp.map(e => (
                  <button key={e} type="button" onClick={() => setStockEtiqueta(prev => prev === e ? "" : e)}
                    style={{ padding: "3px 12px", borderRadius: "999px", border: `1.5px solid ${etiqColor(e)}`,
                      background: stockEtiqueta === e ? etiqColor(e) : "#fff",
                      color: stockEtiqueta === e ? "#fff" : etiqColor(e),
                      fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                    {e}
                  </button>
                ))}
                {stockEtiqueta && <button onClick={() => setStockEtiqueta("")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "12px", color: "#6b7280" }}>✕</button>}
              </div>
            )}
            {stockEtiqueta && tagBalance.size > 0 && (
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "14px 18px", marginBottom: "14px" }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#1a4731", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Stock etiqueta: {stockEtiqueta}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {[...tagBalance.entries()].map(([pid, bal]) => {
                    const prod = stock.find(s => s.producto_id === pid);
                    if (!prod) return null;
                    return (
                      <div key={pid} style={{ background: "#fff", borderRadius: "8px", padding: "8px 14px", border: `1px solid ${bal < 0 ? "#fca5a5" : "#bbf7d0"}` }}>
                        <div style={{ fontSize: "11px", fontWeight: 600, color: "#6b7280" }}>{prod.producto.nombre_comercial}</div>
                        <div style={{ fontSize: "17px", fontWeight: 800, color: bal < 0 ? "#dc2626" : "#15803d" }}>
                          {displayStock(bal, prod.producto.unidad_bodega)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  {["Producto", "N° Registro", "Ingrediente activo", "Función", "Stock disponible", "Stock proyectado", "Valor unitario", "Valor en bodega", "Alerta"].map((h) => (
                    <th key={h} style={{ ...th, textAlign: (h === "Valor en bodega" || h === "Valor unitario") ? "right" : "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stockFiltrado.map((s) => {
                  const bajo = esBajoStock(s);
                  return (
                    <tr
                      key={s.producto_id}
                      onClick={() => setHistorialProductoId(s.producto_id)}
                      style={{ cursor: "pointer" }}
                      title="Ver historial de movimientos"
                    >
                      <td style={{ ...td, fontWeight: 700 }}>{s.producto.nombre_comercial}</td>
                      <td style={td}>{s.producto.numero_registro || "—"}</td>
                      <td style={td}>{s.producto.ingrediente_activo || "—"}</td>
                      <td style={td}>{s.producto.tipo_funcion?.join(", ") || "—"}</td>
                      <td style={{ ...td, fontWeight: 700, color: bajo ? "#dc2626" : "#15803d" }}>
                        {displayStock(Number(s.cantidad_disponible), s.producto.unidad_bodega)}
                      </td>
                      {(() => {
                        const pendiente = proyeccionMap.get(s.producto_id) ?? 0;
                        const proyectado = Number(s.cantidad_disponible) - pendiente;
                        const min = s.producto.stock_minimo != null ? s.producto.stock_minimo : 5;
                        const color = proyectado < 0 ? "#dc2626" : proyectado < min ? "#d97706" : "#6b7280";
                        return (
                          <td style={{ ...td, fontWeight: 600, color }}>
                            {pendiente > 0
                              ? <>{displayStock(proyectado, s.producto.unidad_bodega)}<span style={{ fontSize: "10px", display: "block", color: "#9ca3af" }}>−{displayStock(pendiente, s.producto.unidad_bodega)} OTs</span></>
                              : <span style={{ color: "#9ca3af" }}>—</span>}
                          </td>
                        );
                      })()}
                      {(() => {
                        const costoCLP = costosMap.get(s.producto_id);
                        return (
                          <td style={{ ...td, textAlign: "right", color: costoCLP != null ? "#374151" : "#d1d5db" }}>
                            {costoCLP != null
                              ? `$${costoCLP.toLocaleString("es-CL", { maximumFractionDigits: 0 })}/${s.producto.unidad_bodega || "u"}`
                              : "—"}
                          </td>
                        );
                      })()}
                      {(() => {
                        const costoCLP = costosMap.get(s.producto_id);
                        const valor = costoCLP != null ? Number(s.cantidad_disponible) * costoCLP : null;
                        const fmtMM = (v: number) => `$${(v / 1_000_000).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MM`;
                        return (
                          <td style={{ ...td, textAlign: "right", color: valor != null ? "#1a4731" : "#d1d5db", fontWeight: valor != null ? 700 : 400 }}>
                            {valor != null ? fmtMM(valor) : "—"}
                          </td>
                        );
                      })()}
                      <td style={td}>
                        {bajo && (
                          <span style={alertaBadge}>⚠️ Bajo stock</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {stock.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ ...td, textAlign: "center", color: "#9ca3af", padding: "30px" }}>
                      Sin movimientos de stock para esta empresa.
                    </td>
                  </tr>
                )}
              </tbody>
              {stockFiltrado.length > 0 && (() => {
                const totalValor = stockFiltrado.reduce((sum, s) => {
                  const costoCLP = costosMap.get(s.producto_id);
                  return costoCLP != null ? sum + Number(s.cantidad_disponible) * costoCLP : sum;
                }, 0);
                return totalValor > 0 ? (
                  <tfoot>
                    <tr style={{ background: "#f0f4f2" }}>
                      <td colSpan={7} style={{ ...td, fontWeight: 800, color: "#1a4731", textAlign: "right" }}>Total valor en bodega</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 800, color: "#1a4731" }}>
                        {`$${(totalValor / 1_000_000).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MM`}
                      </td>
                      <td style={td} />
                    </tr>
                  </tfoot>
                ) : null;
              })()}
            </table>
            </div>
          </>
        ) : tab === "movimientos" ? (
          <>
          <div style={{ display: "flex", gap: "10px", marginBottom: "14px", flexWrap: "wrap", alignItems: "center" }}>
            <input
              placeholder="Buscar producto..."
              value={movSearch}
              onChange={e => setMovSearch(e.target.value)}
              style={filterInput}
            />
            <input
              type="date" title="Desde"
              value={movDesde}
              onChange={e => setMovDesde(e.target.value)}
              style={{ ...filterInput, minWidth: "140px" }}
            />
            <input
              type="date" title="Hasta"
              value={movHasta}
              onChange={e => setMovHasta(e.target.value)}
              style={{ ...filterInput, minWidth: "140px" }}
            />
            {etiquetasDisp.map(e => (
              <button key={e} type="button" onClick={() => setMovEtiqueta(prev => prev === e ? "" : e)}
                style={{ padding: "3px 12px", borderRadius: "999px", border: `1.5px solid ${etiqColor(e)}`,
                  background: movEtiqueta === e ? etiqColor(e) : "#fff",
                  color: movEtiqueta === e ? "#fff" : etiqColor(e),
                  fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                {e}
              </button>
            ))}
            {(movSearch || movDesde || movHasta || movEtiqueta) && (
              <>
                <span style={{ fontSize: "12px", color: "#6b7280" }}>{movsFiltrados.length} / {movimientos.length}</span>
                <button
                  onClick={() => { setMovSearch(""); setMovDesde(""); setMovHasta(""); setMovEtiqueta(""); }}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: "12px", color: "#6b7280" }}
                >
                  ✕ Limpiar filtros
                </button>
              </>
            )}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  {["Fecha", "Tipo", "Producto", "Cantidad", "Stock final",
                    ...(showPrecios ? ["Valor unit.", "Valor total"] : []),
                    "Documento", "Origen / OT / Destino", "Notas", "Etiquetas", ""].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {movsFiltrados.map((m) => (
                  <tr key={m.id}>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{m.fecha}</td>
                    <td style={td}>
                      <span style={{ fontWeight: 700, color: tipoColor[m.tipo] || "#374151" }}>
                        {tipoLabel[m.tipo] || m.tipo}
                      </span>
                    </td>
                    <td style={{ ...td, fontWeight: 600 }}>{m.producto?.nombre_comercial || "—"}</td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {m.tipo.includes("salida") ? "-" : "+"}{Number(m.cantidad).toFixed(3)} {m.unidad}
                    </td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 600, color: (stockFinalMap.get(m.id) ?? 0) < 0 ? "#dc2626" : "#15803d" }}>
                      {stockFinalMap.has(m.id)
                        ? displayStock(stockFinalMap.get(m.id) ?? 0, m.producto?.unidad_bodega ?? null)
                        : "—"}
                    </td>
                    {showPrecios && (
                      <td style={{ ...td, textAlign: "right", color: "#6b7280" }}>
                        {(m.precio_unitario ?? m.costo_unitario ?? costosMap.get(m.producto_id)) != null
                          ? `$${Number(m.precio_unitario ?? m.costo_unitario ?? costosMap.get(m.producto_id)).toLocaleString("es-CL", { maximumFractionDigits: 0 })}`
                          : "—"}
                      </td>
                    )}
                    {showPrecios && (
                      <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>
                        {(m.precio_unitario ?? m.costo_unitario ?? costosMap.get(m.producto_id)) != null
                          ? `$${(Number(m.precio_unitario ?? m.costo_unitario ?? costosMap.get(m.producto_id)) * Number(m.cantidad)).toLocaleString("es-CL", { maximumFractionDigits: 0 })}`
                          : "—"}
                      </td>
                    )}
                    <td style={td}>
                      {m.documento_tipo ? (
                        <span>
                          {m.documento_tipo === "guia_despacho" ? "Guía" : "Factura"} #{m.documento_numero || "—"}
                        </span>
                      ) : "—"}
                    </td>
                    <td style={td}>
                      {m.proveedor
                        ? m.proveedor
                        : m.empresa_contraparte?.nombre
                          ? m.empresa_contraparte.nombre
                          : m.ot_id
                            ? <Link
                                href={`/ordenes/${m.ot_id}`}
                                style={{ color: "#1a4731", fontWeight: 700, textDecoration: "none" }}
                              >
                                OT #{m.ot?.numero ?? "?"}
                              </Link>
                            : "—"}
                    </td>
                    <td style={{ ...td, color: "#6b7280" }}>{m.notas || "—"}</td>
                    <td style={td}>
                      {m.etiquetas && m.etiquetas.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "2px" }}>
                          {m.etiquetas.map(e => (
                            <span key={e} style={{ display: "inline-block", padding: "2px 8px", borderRadius: "999px", fontSize: "10px", fontWeight: 700, background: etiqColor(e), color: "#fff" }}>{e}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={td}>
                      {isAdmin && (m.tipo === "entrada" || m.tipo === "ajuste_entrada" || m.tipo === "ajuste_salida" || TIPOS_SALIDA.has(m.tipo)) && (
                        <button
                          onClick={() => openEditMov(m)}
                          title={TIPOS_SALIDA.has(m.tipo) ? "Editar etiquetas" : "Editar movimiento"}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: "14px", padding: "6px 8px", color: "#6b7280", lineHeight: 1 }}
                        >
                          {TIPOS_SALIDA.has(m.tipo) ? "🏷️" : "✏️"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {movsFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={showPrecios ? 12 : 10} style={{ ...td, textAlign: "center", color: "#9ca3af", padding: "30px" }}>
                      {movimientos.length === 0 ? "Sin movimientos registrados." : "Sin resultados con los filtros aplicados."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {mvHasMore && (
              <div style={{ padding: "12px 14px", borderTop: "1px solid #e5e7eb", textAlign: "center" }}>
                <button
                  onClick={loadMoreMov}
                  disabled={loadingMore}
                  style={{ padding: "7px 20px", borderRadius: "8px", border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: "13px", cursor: loadingMore ? "default" : "pointer" }}
                >
                  {loadingMore ? "Cargando..." : `Cargar más (mostrando ${movimientos.length})`}
                </button>
              </div>
            )}
          </div>
          </>
        ) : (
          <>
          {/* ── Filtros ────────────────────────────────────── */}
          <div style={{ display: "flex", gap: "16px", marginBottom: "20px", alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <label style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280", display: "block", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Año</label>
              <select value={desAnio} onChange={e => setDesAnio(Number(e.target.value))} style={filterSelect}>
                {[0, 1, 2].map(i => { const y = new Date().getFullYear() - i; return <option key={y} value={y}>{y}</option>; })}
              </select>
            </div>
            {/* Summary chips */}
            {desOts.length > 0 && (
              <>
                <div style={summaryChip}>
                  <span style={{ fontSize: "11px", color: "#6b7280" }}>OTs analizadas</span>
                  <span style={{ fontSize: "20px", fontWeight: 800, color: "#1a4731" }}>{desOts.length}</span>
                </div>
                <div style={summaryChip}>
                  <span style={{ fontSize: "11px", color: "#6b7280" }}>Vol. extra/menos total</span>
                  <span style={{ fontSize: "20px", fontWeight: 800, color: totalExtraLt > 0 ? "#dc2626" : totalExtraLt < 0 ? "#15803d" : "#374151" }}>
                    {totalExtraLt > 0 ? "+" : ""}{totalExtraLt.toLocaleString("es-CL", { maximumFractionDigits: 0 })} Lt
                  </span>
                </div>
                {showPrecios && (
                  <div style={summaryChip}>
                    <span style={{ fontSize: "11px", color: "#6b7280" }}>Impacto económico total</span>
                    <span style={{ fontSize: "20px", fontWeight: 800, color: totalImpacto > 0 ? "#dc2626" : totalImpacto < 0 ? "#15803d" : "#374151" }}>
                      {totalImpacto !== 0 ? `${totalImpacto > 0 ? "+" : ""}$${Math.abs(totalImpacto).toLocaleString("es-CL", { maximumFractionDigits: 0 })}` : "$0"}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Tabla por aplicador ─────────────────────────── */}
          <h3 style={{ fontSize: "13px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>Por aplicador</h3>
          <div style={{ overflowX: "auto", marginBottom: "28px" }}>
            <table style={table}>
              <thead>
                <tr>
                  {["Aplicador", "OTs", "Desviación mojamiento (prom.)", "Vol. extra / menos", ...(showPrecios ? ["Impacto económico"] : [])].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {operadorStats.map(s => (
                  <tr key={s.id}>
                    <td style={{ ...td, fontWeight: 700 }}>{s.nombre}</td>
                    <td style={{ ...td, textAlign: "center" }}>{s.nOts}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700,
                      color: Math.abs(s.avgDesviacionPct) < 5 ? "#15803d" : Math.abs(s.avgDesviacionPct) < 15 ? "#d97706" : "#dc2626" }}>
                      {s.avgDesviacionPct > 0 ? "+" : ""}{s.avgDesviacionPct.toFixed(1)}%
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {s.totalExtraLt > 0 ? "+" : ""}{s.totalExtraLt.toLocaleString("es-CL", { maximumFractionDigits: 0 })} Lt
                    </td>
                    {showPrecios && (
                      <td style={{ ...td, textAlign: "right", fontWeight: 700,
                        color: s.impactoEconomico > 0 ? "#dc2626" : s.impactoEconomico < 0 ? "#15803d" : "#9ca3af" }}>
                        {s.impactoEconomico !== 0
                          ? `${s.impactoEconomico > 0 ? "+" : ""}$${Math.abs(s.impactoEconomico).toLocaleString("es-CL", { maximumFractionDigits: 0 })}`
                          : "—"}
                      </td>
                    )}
                  </tr>
                ))}
                {operadorStats.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ ...td, textAlign: "center", color: "#9ca3af", padding: "30px" }}>
                      No hay OTs finalizadas con datos de mojamiento para {desAnio}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ── Detalle por OT ─────────────────────────────── */}
          {desOts.length > 0 && (
            <>
              <h3 style={{ fontSize: "13px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>Detalle por OT</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={table}>
                  <thead>
                    <tr>
                      {["OT", "Fecha", "Aplicador/es", "Ha", "Moj. plan. (lt/ha)", "Moj. real (lt/ha)", "Desviación", "Vol. extra/menos", ...(showPrecios ? ["Impacto $"] : [])].map(h => (
                        <th key={h} style={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {desOts.sort((a, b) => (b.fecha_aplicacion ?? "").localeCompare(a.fecha_aplicacion ?? "")).map(ot => {
                      const totalHa = ot.ot_cuarteles.reduce((s, c) => s + Number(c.superficie_ha), 0);
                      const mojPlan = Number(ot.mojamiento_solicitado_ltha);
                      const mojReal = Number(ot.mojamiento_real_ltha);
                      const desvPct = mojPlan > 0 ? (mojReal - mojPlan) / mojPlan * 100 : 0;
                      const extraLt = (mojReal - mojPlan) * totalHa;
                      let impacto = 0;
                      if (mojPlan > 0) {
                        for (const p of ot.ot_productos) {
                          const consumoPlan = calcConsumoPlaneado(Number(p.dosis_real), p.dosis_unidad, totalHa, mojPlan);
                          impacto += consumoPlan * (mojReal - mojPlan) / mojPlan * (costosMap.get(p.producto_id) ?? 0);
                        }
                      }
                      return (
                        <tr key={ot.id}>
                          <td style={td}>
                            <Link href={`/ordenes/${ot.id}`} style={{ color: "#1a4731", fontWeight: 700, textDecoration: "none" }}>OT #{ot.numero}</Link>
                          </td>
                          <td style={{ ...td, whiteSpace: "nowrap" }}>{ot.fecha_aplicacion || "—"}</td>
                          <td style={td}>{ot.ot_aplicadores?.map(a => a.personal?.nombre ?? a.operador?.nombre).filter(Boolean).join(", ") || "—"}</td>
                          <td style={{ ...td, textAlign: "right" }}>{totalHa.toLocaleString("es-CL", { maximumFractionDigits: 1 })}</td>
                          <td style={{ ...td, textAlign: "right" }}>{mojPlan.toLocaleString("es-CL", { maximumFractionDigits: 0 })}</td>
                          <td style={{ ...td, textAlign: "right" }}>{mojReal.toLocaleString("es-CL", { maximumFractionDigits: 0 })}</td>
                          <td style={{ ...td, textAlign: "right", fontWeight: 700,
                            color: Math.abs(desvPct) < 5 ? "#15803d" : Math.abs(desvPct) < 15 ? "#d97706" : "#dc2626" }}>
                            {desvPct > 0 ? "+" : ""}{desvPct.toFixed(1)}%
                          </td>
                          <td style={{ ...td, textAlign: "right" }}>
                            {extraLt > 0 ? "+" : ""}{extraLt.toLocaleString("es-CL", { maximumFractionDigits: 0 })} Lt
                          </td>
                          {showPrecios && (
                            <td style={{ ...td, textAlign: "right", fontWeight: 600,
                              color: impacto > 0 ? "#dc2626" : impacto < 0 ? "#15803d" : "#9ca3af" }}>
                              {impacto !== 0
                                ? `${impacto > 0 ? "+" : ""}$${Math.abs(impacto).toLocaleString("es-CL", { maximumFractionDigits: 0 })}`
                                : "—"}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: "11px", color: "#9ca3af", marginTop: "8px", padding: "0 4px" }}>
                * Impacto económico estimado para todos los productos, asumiendo que la concentración de mezcla se mantiene constante entre aplicaciones (mayor mojamiento = mayor consumo proporcional de todos los productos). Precio basado en costo promedio ponderado de entradas a bodega.
              </p>
            </>
          )}
          </>
        )}
      </main>
    </>
  );
}

const container: React.CSSProperties = { maxWidth: "1400px", margin: "0 auto", padding: "28px 20px" };
const pageHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", flexWrap: "wrap", gap: "12px" };
const pageTitle: React.CSSProperties = { fontSize: "24px", fontWeight: 800, color: "#1a4731" };
const pageSubtitle: React.CSSProperties = { fontSize: "13px", color: "#6b7280", marginTop: "4px" };
const primaryBtn: React.CSSProperties = { padding: "9px 18px", borderRadius: "10px", background: "#1a4731", color: "#fff", fontWeight: 700, fontSize: "14px" };
const secondaryBtn: React.CSSProperties = { padding: "9px 18px", borderRadius: "10px", border: "1.5px solid #1a4731", color: "#1a4731", fontWeight: 700, fontSize: "14px" };
const tabBar: React.CSSProperties = { display: "flex", gap: "4px", marginBottom: "16px", borderBottom: "2px solid #e5e7eb", paddingBottom: "0" };
const tabBtn: React.CSSProperties = { padding: "8px 18px", borderRadius: "8px 8px 0 0", border: "none", background: "transparent", color: "#6b7280", fontWeight: 600, fontSize: "14px", cursor: "pointer" };
const tabBtnActive: React.CSSProperties = { background: "#1a4731", color: "#fff" };
const table: React.CSSProperties = { width: "100%", background: "#fff", borderRadius: "14px", overflow: "hidden", border: "1px solid #e5e7eb" };
const th: React.CSSProperties = { padding: "10px 12px", background: "#f0f4f2", fontWeight: 700, fontSize: "12px", color: "#374151", textAlign: "left", whiteSpace: "nowrap", borderBottom: "1px solid #e5e7eb" };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: "13px", color: "#374151", borderBottom: "1px solid #f3f4f6" };
const alertaBadge: React.CSSProperties  = { padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 700, background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5" };
const filterInput: React.CSSProperties  = { padding: "7px 12px", borderRadius: "8px", border: "1.5px solid #d1d5db", fontSize: "13px", background: "#fff", minWidth: "200px" };
const filterSelect: React.CSSProperties = { padding: "7px 12px", borderRadius: "8px", border: "1.5px solid #d1d5db", fontSize: "13px", background: "#fff" };
const filterLabel: React.CSSProperties  = { display: "flex", gap: "6px", alignItems: "center", fontSize: "13px", cursor: "pointer", fontWeight: 500, color: "#374151" };
const modalOverlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center" };
const modalBox: React.CSSProperties     = { background: "#fff", borderRadius: "16px", padding: "28px 32px", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto", maxWidth: "95vw", boxSizing: "border-box" };
const lbl: React.CSSProperties          = { display: "block", fontSize: "11px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "5px" };
const minp: React.CSSProperties         = { padding: "9px 12px", borderRadius: "8px", border: "1.5px solid #d1d5db", fontSize: "14px", background: "#fff", color: "#111", width: "100%", boxSizing: "border-box" };
const mSaveBtn: React.CSSProperties     = { padding: "9px 22px", background: "#1a4731", color: "#fff", border: "none", borderRadius: "9px", fontWeight: 700, fontSize: "14px", cursor: "pointer" };
const mCancelBtn: React.CSSProperties   = { padding: "9px 18px", background: "#fff", border: "1.5px solid #d1d5db", borderRadius: "9px", fontWeight: 600, fontSize: "14px", cursor: "pointer", color: "#374151" };
const summaryChip: React.CSSProperties  = { display: "flex", flexDirection: "column", gap: "4px", background: "#f0f4f2", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "12px 20px", minWidth: "160px" };
import { Suspense } from "react"; export default function BodegaPage() { return <Suspense><BodegaContent /></Suspense>; }
