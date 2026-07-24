"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import Nav from "@/lib/nav";
import { useRol } from "@/lib/useRol";
import { useEmpresa } from "@/lib/useEmpresa";
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

function BodegaContent() {
  const router = useRouter();
  const { empresaId, empresaNombre } = useEmpresa();
  const { isAdmin, isEncargado } = useRol();
  const showPrecios = isAdmin;

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [movimientos, setMovimientos] = useState<StockMovimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"stock" | "movimientos">("stock");
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
  type EditMovForm = { id: string; docNumero: string; proveedor: string };
  const [editMov,     setEditMov]     = useState<EditMovForm | null>(null);
  const [editSaving,  setEditSaving]  = useState(false);
  const [editError,   setEditError]   = useState("");
  const [catalogProv, setCatalogProv] = useState<string[]>([]);
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
  }, [empresaId]);

  const load = async (eid: string) => {
    setLoading(true);
    const [{ data: st }, { data: mv }] = await Promise.all([
      supabase
        .from("stock_actual")
        .select("*, producto:productos(*)")
        .eq("empresa_id", eid)
        .order("producto_id", { ascending: true }),
      supabase
        .from("stock_movimientos")
        .select("*, producto:productos(*), empresa_contraparte:empresas!stock_movimientos_empresa_contraparte_id_fkey(*)")
        .eq("empresa_id", eid)
        .order("fecha", { ascending: false })
        .limit(200),
    ]);

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

    setStock((st as StockRow[]) || []);
    setMovimientos(mvsConOt as StockMovimiento[]);
    setLoading(false);
  };

  const funcionesDisponibles = Array.from(
    new Set(stock.flatMap(s => s.producto.tipo_funcion || []))
  ).sort();

  const esBajoStock = (s: StockRow) => {
    const min = s.producto.stock_minimo != null ? s.producto.stock_minimo : 5;
    return Number(s.cantidad_disponible) < min;
  };

  const stockFiltrado = stock.filter(s => {
    const matchSearch  = !stockSearch  || s.producto.nombre_comercial.toLowerCase().includes(stockSearch.toLowerCase());
    const matchFuncion = !stockFuncion || s.producto.tipo_funcion?.includes(stockFuncion);
    const matchBajo    = !stockBajo    || esBajoStock(s);
    return matchSearch && matchFuncion && matchBajo;
  });

  const openTransf = async () => {
    const otrasEmpresas = empresas.filter(e => e.id !== empresaId);
    const origenId = otrasEmpresas[0]?.id || "";
    let st: StockRow[] = [];
    if (origenId) {
      const { data } = await supabase.from("stock_actual").select("*, producto:productos(*)").eq("empresa_id", origenId);
      st = (data as StockRow[]) || [];
    }
    setStockOrigen(st);
    setTransfForm({ origenId, productoId: "", cantidad: "", unidad: "lt", fecha: new Date().toISOString().slice(0, 10), notas: "" });
    setTransfError("");
    setShowTransf(true);
  };

  const loadStockOrigen = async (eid: string) => {
    if (!eid) { setStockOrigen([]); return; }
    const { data } = await supabase.from("stock_actual").select("*, producto:productos(*)").eq("empresa_id", eid);
    setStockOrigen((data as StockRow[]) || []);
  };

  const handleTransferencia = async () => {
    setTransfError("");
    const { origenId, productoId, cantidad, unidad, fecha, notas } = transfForm;
    if (!origenId)                         { setTransfError("Seleccioná empresa origen."); return; }
    if (origenId === empresaId)            { setTransfError("Origen y destino no pueden ser la misma empresa."); return; }
    if (!productoId)                       { setTransfError("Seleccioná un producto."); return; }
    if (!cantidad || parseFloat(cantidad) <= 0) { setTransfError("La cantidad debe ser mayor a 0."); return; }

    const destNombre = empresaNombre || "destino";
    const origNombre = empresas.find(e => e.id === origenId)?.nombre || "origen";
    setTransfSaving(true);

    const [r1, r2] = await Promise.all([
      supabase.from("stock_movimientos").insert({
        empresa_id: origenId, empresa_contraparte_id: empresaId,
        producto_id: productoId, tipo: "transferencia_salida",
        cantidad: parseFloat(cantidad), unidad, fecha,
        notas: notas.trim() || `Transferencia a ${destNombre}`,
      }),
      supabase.from("stock_movimientos").insert({
        empresa_id: empresaId, empresa_contraparte_id: origenId,
        producto_id: productoId, tipo: "transferencia_entrada",
        cantidad: parseFloat(cantidad), unidad, fecha,
        notas: notas.trim() || `Transferencia desde ${origNombre}`,
      }),
    ]);

    setTransfSaving(false);
    if (r1.error || r2.error) { setTransfError((r1.error || r2.error)!.message); return; }
    setShowTransf(false);
    await load(empresaId);
  };

  const openEditMov = (m: StockMovimiento) => {
    setEditError("");
    setEditMov({ id: m.id, docNumero: m.documento_numero || "", proveedor: m.proveedor || "" });
  };

  const handleEditMov = async () => {
    if (!editMov) return;
    setEditSaving(true);
    setEditError("");
    const { error } = await supabase
      .from("stock_movimientos")
      .update({ documento_numero: editMov.docNumero.trim() || null, proveedor: editMov.proveedor.trim() || null })
      .eq("id", editMov.id);
    setEditSaving(false);
    if (error) { setEditError(error.message); return; }
    // Guardar proveedor en catálogo si es nuevo
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
            <h1 style={pageTitle}>Bodega — {empresaNombre}</h1>
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
                {empresas.length > 1 && (
                  <button onClick={openTransf} style={secondaryBtn}>
                    ⇄ Transferencia
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
        </div>

        {/* Modal transferencia */}
        {showTransf && (
          <div style={modalOverlay}>
            <div style={{ ...modalBox, width: "480px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 800, color: "#1a4731", marginBottom: "16px" }}>
                Transferencia entre empresas
              </h3>

              <div style={{ display: "grid", gap: "14px" }}>
                <div>
                  <label style={lbl}>Empresa origen (tiene el stock)</label>
                  <select
                    value={transfForm.origenId}
                    onChange={e => {
                      setTransfForm(f => ({ ...f, origenId: e.target.value, productoId: "" }));
                      loadStockOrigen(e.target.value);
                    }}
                    style={minp}
                  >
                    <option value="">— Seleccionar —</option>
                    {empresas.filter(e => e.id !== empresaId).map(e => (
                      <option key={e.id} value={e.id}>{e.nombre}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={lbl}>Empresa destino (recibe el stock)</label>
                  <div style={{ ...minp, background: "#f3f4f6", color: "#6b7280" }}>{empresaNombre}</div>
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
        {editMov && (
          <div style={modalOverlay}>
            <div style={{ ...modalBox, width: "420px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 800, color: "#1a4731", marginBottom: "16px" }}>
                Corregir movimiento
              </h3>
              <div style={{ display: "grid", gap: "14px" }}>
                <div>
                  <label style={lbl}>N° Documento (guía / factura)</label>
                  <input
                    value={editMov.docNumero}
                    onChange={e => setEditMov(f => f && ({ ...f, docNumero: e.target.value }))}
                    style={minp}
                    placeholder="Ej. 975392"
                  />
                </div>
                <div>
                  <label style={lbl}>Proveedor</label>
                  <input
                    list="edit-catalog-prov"
                    value={editMov.proveedor}
                    onChange={e => setEditMov(f => f && ({ ...f, proveedor: e.target.value }))}
                    style={minp}
                    placeholder="Buscar o escribir proveedor..."
                  />
                  <datalist id="edit-catalog-prov">
                    {catalogProv.map(n => <option key={n} value={n} />)}
                  </datalist>
                </div>
                {editError && (
                  <p style={{ fontSize: "13px", color: "#dc2626", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", padding: "10px 14px", margin: 0 }}>
                    {editError}
                  </p>
                )}
              </div>
              <div style={{ display: "flex", gap: "10px", marginTop: "20px", justifyContent: "flex-end" }}>
                <button onClick={() => setEditMov(null)} style={mCancelBtn}>Cancelar</button>
                <button onClick={handleEditMov} disabled={editSaving} style={mSaveBtn}>
                  {editSaving ? "Guardando..." : "Guardar corrección"}
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <p style={{ color: "#6b7280", marginTop: "20px" }}>Cargando...</p>
        ) : tab === "stock" ? (
          <>
            <div style={{ display: "flex", gap: "10px", marginBottom: "14px", flexWrap: "wrap", alignItems: "center" }}>
              <input
                placeholder="Buscar producto..."
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
              {(stockSearch || stockFuncion || stockBajo) && (
                <span style={{ fontSize: "12px", color: "#6b7280" }}>{stockFiltrado.length} / {stock.length} productos</span>
              )}
            </div>
            <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  {["Producto", "N° Registro", "Ingrediente activo", "Función", "Stock disponible", "Alerta"].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stockFiltrado.map((s) => {
                  const bajo = esBajoStock(s);
                  return (
                    <tr key={s.producto_id}>
                      <td style={{ ...td, fontWeight: 700 }}>{s.producto.nombre_comercial}</td>
                      <td style={td}>{s.producto.numero_registro || "—"}</td>
                      <td style={td}>{s.producto.ingrediente_activo || "—"}</td>
                      <td style={td}>{s.producto.tipo_funcion?.join(", ") || "—"}</td>
                      <td style={{ ...td, fontWeight: 700, color: bajo ? "#dc2626" : "#15803d" }}>
                        {displayStock(Number(s.cantidad_disponible), s.producto.unidad_bodega)}
                      </td>
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
                    <td colSpan={6} style={{ ...td, textAlign: "center", color: "#9ca3af", padding: "30px" }}>
                      Sin movimientos de stock para esta empresa.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  {["Fecha", "Tipo", "Producto", "Cantidad",
                    ...(showPrecios ? ["Valor unit.", "Valor total"] : []),
                    "Documento", "Origen / OT / Destino", "Notas", ""].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m) => (
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
                    {showPrecios && (
                      <td style={{ ...td, textAlign: "right", color: "#6b7280" }}>
                        {(m.precio_unitario ?? m.costo_unitario) != null
                          ? `$${Number(m.precio_unitario ?? m.costo_unitario).toLocaleString("es-CL", { maximumFractionDigits: 0 })}`
                          : "—"}
                      </td>
                    )}
                    {showPrecios && (
                      <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>
                        {(m.precio_unitario ?? m.costo_unitario) != null
                          ? `$${(Number(m.precio_unitario ?? m.costo_unitario) * Number(m.cantidad)).toLocaleString("es-CL", { maximumFractionDigits: 0 })}`
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
                      {(m.tipo === "entrada" || m.tipo === "ajuste_entrada" || m.tipo === "ajuste_salida") && isAdmin && (
                        <button
                          onClick={() => openEditMov(m)}
                          title="Corregir documento / proveedor"
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: "14px", padding: "2px 4px", color: "#6b7280" }}
                        >
                          ✏️
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {movimientos.length === 0 && (
                  <tr>
                    <td colSpan={showPrecios ? 9 : 7} style={{ ...td, textAlign: "center", color: "#9ca3af", padding: "30px" }}>
                      Sin movimientos registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {movimientos.length >= 200 && (
              <p style={{ fontSize: "12px", color: "#d97706", padding: "10px 14px", background: "#fffbeb", borderTop: "1px solid #fcd34d" }}>
                ⚠ Mostrando los últimos 200 movimientos. El historial completo está disponible en la base de datos.
              </p>
            )}
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
const modalBox: React.CSSProperties     = { background: "#fff", borderRadius: "16px", padding: "28px 32px", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto" };
const lbl: React.CSSProperties          = { display: "block", fontSize: "11px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "5px" };
const minp: React.CSSProperties         = { padding: "9px 12px", borderRadius: "8px", border: "1.5px solid #d1d5db", fontSize: "14px", background: "#fff", color: "#111", width: "100%", boxSizing: "border-box" };
const mSaveBtn: React.CSSProperties     = { padding: "9px 22px", background: "#1a4731", color: "#fff", border: "none", borderRadius: "9px", fontWeight: 700, fontSize: "14px", cursor: "pointer" };
const mCancelBtn: React.CSSProperties   = { padding: "9px 18px", background: "#fff", border: "1.5px solid #d1d5db", borderRadius: "9px", fontWeight: 600, fontSize: "14px", cursor: "pointer", color: "#374151" };
import { Suspense } from "react"; export default function BodegaPage() { return <Suspense><BodegaContent /></Suspense>; }
