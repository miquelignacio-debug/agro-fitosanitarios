"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabaseClient";
import Nav from "@/lib/nav";
import type { Empresa, Producto } from "@/lib/types";
import { Suspense } from "react";

// ── Types ────────────────────────────────────────────────────────

type MovBase = {
  id: string;
  producto_id: string;
  tipo: string;
  cantidad: number;
  fecha: string;
  created_at: string;
  precio_unitario: number | null;
  costo_unitario: number | null;
};

type TomaLinea = {
  producto_id: string;
  nombre: string;
  unidad: string;
  stock_sistema: number;
  stock_real: number;
  costo_promedio: number | null;
};

type HistorialToma = {
  id: string;
  fecha: string;
  notas: string | null;
  created_at: string;
  lineas?: {
    id: string;
    nombre?: string;
    unidad: string;
    stock_sistema: number;
    stock_real: number;
    costo_unitario: number | null;
    producto?: { nombre_comercial: string };
  }[];
};

// ── Weighted average calculator ──────────────────────────────────

function calcCostosPromedios(movimientos: MovBase[]): Record<string, number | null> {
  const sorted = [...movimientos].sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
    return a.created_at.localeCompare(b.created_at);
  });
  const state: Record<string, { qty: number; value: number }> = {};
  for (const m of sorted) {
    if (!state[m.producto_id]) state[m.producto_id] = { qty: 0, value: 0 };
    const s = state[m.producto_id];
    if (["entrada", "ajuste_entrada", "transferencia_entrada"].includes(m.tipo)) {
      const price = m.precio_unitario ?? m.costo_unitario ?? 0;
      s.qty += m.cantidad;
      s.value += m.cantidad * price;
    } else {
      const avgCost = s.qty > 0 ? s.value / s.qty : 0;
      s.qty = Math.max(0, s.qty - m.cantidad);
      s.value = Math.max(0, s.value - m.cantidad * avgCost);
    }
  }
  return Object.fromEntries(
    Object.entries(state).map(([id, { qty, value }]) => [
      id,
      qty > 0 && value > 0 ? value / qty : null,
    ])
  );
}

// ── Main component ───────────────────────────────────────────────

function InventarioContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const empresaParam = searchParams.get("empresa") || "";

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaId, setEmpresaId] = useState(empresaParam);
  const [tab, setTab] = useState<"nueva" | "historial">("nueva");

  // Step state
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Stock data
  type StockRow = { producto_id: string; cantidad_disponible: number; producto: Producto };
  const [stockActual, setStockActual] = useState<StockRow[]>([]);
  const [costos, setCostos] = useState<Record<string, number | null>>({});

  // Upload / preview
  const [lineas, setLineas] = useState<TomaLinea[]>([]);
  const [fechaToma, setFechaToma] = useState(new Date().toISOString().slice(0, 10));
  const [notas, setNotas] = useState("");

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Historial
  const [historial, setHistorial] = useState<HistorialToma[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histDetalle, setHistDetalle] = useState<HistorialToma | null>(null);

  // ── Init ──────────────────────────────────────────────────────

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data: emp } = await supabase.from("empresas").select("*").order("nombre");
      if (!emp?.length) return;
      setEmpresas(emp);
      const eid = empresaParam || emp[0].id;
      setEmpresaId(eid);
      await loadStock(eid);
    };
    init();
  }, [empresaParam]);

  const loadStock = async (eid: string) => {
    setLoading(true);
    const [{ data: st }, { data: mv }] = await Promise.all([
      supabase
        .from("stock_actual")
        .select("*, producto:productos(*)")
        .eq("empresa_id", eid)
        .order("producto(nombre_comercial)", { ascending: true }),
      supabase
        .from("stock_movimientos")
        .select("id, producto_id, tipo, cantidad, fecha, created_at, precio_unitario, costo_unitario")
        .eq("empresa_id", eid),
    ]);
    setStockActual((st as StockRow[]) || []);
    setCostos(calcCostosPromedios((mv as MovBase[]) || []));
    setLoading(false);
  };

  const loadHistorial = async (eid: string) => {
    setHistLoading(true);
    const { data } = await supabase
      .from("inventarios_toma")
      .select("id, fecha, notas, created_at")
      .eq("empresa_id", eid)
      .order("fecha", { ascending: false });
    setHistorial((data as HistorialToma[]) || []);
    setHistLoading(false);
  };

  const loadDetalle = async (tomaId: string): Promise<NonNullable<HistorialToma["lineas"]>> => {
    const { data } = await supabase
      .from("inventarios_toma_lineas")
      .select("id, unidad, stock_sistema, stock_real, costo_unitario, producto:productos(nombre_comercial)")
      .eq("toma_id", tomaId);
    if (!data) return [];
    return data.map((d) => ({
      id: d.id,
      unidad: d.unidad,
      stock_sistema: d.stock_sistema,
      stock_real: d.stock_real,
      costo_unitario: d.costo_unitario,
      producto: Array.isArray(d.producto) ? d.producto[0] : d.producto,
    }));
  };

  // ── Download template ─────────────────────────────────────────

  const downloadTemplate = () => {
    const rows = stockActual.map((s) => ({
      producto_id: s.producto_id,
      Producto: s.producto.nombre_comercial,
      Unidad: s.producto.unidad_dosis || "u",
      "Stock sistema": Number(s.cantidad_disponible).toFixed(3),
      "Costo promedio ($)": costos[s.producto_id] != null
        ? Number(costos[s.producto_id]).toFixed(2)
        : "",
      "Stock real (completar)": "",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 36 }, { wch: 35 }, { wch: 10 }, { wch: 16 }, { wch: 18 }, { wch: 22 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventario");
    const hoy = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `inventario_${hoy}.xlsx`);
  };

  // ── Upload & parse ────────────────────────────────────────────

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: Record<string, string | number>[] = XLSX.utils.sheet_to_json(ws);

        const parsed: TomaLinea[] = [];
        for (const row of rows) {
          const pid = String(row["producto_id"] || "").trim();
          const nombre = String(row["Producto"] || "").trim();
          const unidad = String(row["Unidad"] || "u").trim();
          const stockSistema = parseFloat(String(row["Stock sistema"] || "0")) || 0;
          const stockRealRaw = row["Stock real (completar)"];
          const stockReal = stockRealRaw !== undefined && stockRealRaw !== ""
            ? parseFloat(String(stockRealRaw))
            : NaN;
          if (isNaN(stockReal)) continue; // skip rows without a count
          const match = stockActual.find((s) => s.producto_id === pid || s.producto.nombre_comercial === nombre);
          parsed.push({
            producto_id: match?.producto_id || pid,
            nombre: match?.producto.nombre_comercial || nombre,
            unidad,
            stock_sistema: stockSistema,
            stock_real: stockReal,
            costo_promedio: match ? (costos[match.producto_id] ?? null) : null,
          });
        }
        if (parsed.length === 0) {
          setError("El archivo no contiene filas con stock real completado. Asegúrate de llenar la columna 'Stock real (completar)'.");
          return;
        }
        setLineas(parsed);
        setStep(2);
      } catch {
        setError("Error al leer el archivo. Usa la plantilla descargada desde esta página.");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  // ── Apply adjustments ─────────────────────────────────────────

  const aplicarAjustes = async () => {
    setError("");
    setSaving(true);

    // 1. Create toma header
    const { data: toma, error: tomaErr } = await supabase
      .from("inventarios_toma")
      .insert({ empresa_id: empresaId, fecha: fechaToma, notas: notas.trim() || null })
      .select("id")
      .single();
    if (tomaErr || !toma) {
      setError("Error al crear la toma: " + tomaErr?.message);
      setSaving(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id || null;

    // 2. Process each line with a difference
    const tomaLineas: object[] = [];
    for (const linea of lineas) {
      const diff = linea.stock_real - linea.stock_sistema;
      if (Math.abs(diff) < 0.001) {
        // No difference — still record the line
        tomaLineas.push({
          toma_id: toma.id,
          producto_id: linea.producto_id || null,
          unidad: linea.unidad,
          stock_sistema: linea.stock_sistema,
          stock_real: linea.stock_real,
          costo_unitario: linea.costo_promedio,
          movimiento_id: null,
        });
        continue;
      }

      const tipo = diff > 0 ? "ajuste_entrada" : "ajuste_salida";
      const cantidad = Math.abs(diff);

      const { data: mov, error: movErr } = await supabase
        .from("stock_movimientos")
        .insert({
          empresa_id: empresaId,
          producto_id: linea.producto_id,
          tipo,
          cantidad,
          unidad: linea.unidad,
          fecha: fechaToma,
          costo_unitario: linea.costo_promedio,
          notas: `Ajuste por toma de inventario ${fechaToma}`,
          usuario_id: userId,
        })
        .select("id")
        .single();

      if (movErr) {
        setError("Error al registrar movimiento: " + movErr.message);
        setSaving(false);
        return;
      }

      tomaLineas.push({
        toma_id: toma.id,
        producto_id: linea.producto_id || null,
        unidad: linea.unidad,
        stock_sistema: linea.stock_sistema,
        stock_real: linea.stock_real,
        costo_unitario: linea.costo_promedio,
        movimiento_id: mov?.id || null,
      });
    }

    // 3. Insert toma lineas
    if (tomaLineas.length > 0) {
      const { error: lineasErr } = await supabase.from("inventarios_toma_lineas").insert(tomaLineas);
      if (lineasErr) {
        setError("Error al registrar líneas: " + lineasErr.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setSaved(true);
    setStep(3);
    await loadStock(empresaId);
  };

  // ── Download informe ──────────────────────────────────────────

  const buildInformeRows = (fecha: string, src: TomaLinea[]) =>
    src.map((ln) => {
      const diff = ln.stock_real - ln.stock_sistema;
      return {
        Producto: ln.nombre,
        Unidad: ln.unidad,
        "Stock sistema": ln.stock_sistema,
        "Stock real": ln.stock_real,
        Diferencia: diff,
        Tipo: diff > 0.001 ? "Ajuste +" : diff < -0.001 ? "Ajuste −" : "Sin diferencia",
        "Costo prom. ($)": ln.costo_promedio != null ? Number(ln.costo_promedio).toFixed(2) : "",
        "Valor ajuste ($)": ln.costo_promedio != null ? (Math.abs(diff) * ln.costo_promedio).toFixed(2) : "",
      };
    });

  type HistLinea = NonNullable<HistorialToma["lineas"]>[number];
  const buildHistInformeRows = (src: HistLinea[]) =>
    src.map((ln) => {
      const diff = ln.stock_real - ln.stock_sistema;
      return {
        Producto: ln.producto?.nombre_comercial || "—",
        Unidad: ln.unidad,
        "Stock sistema": ln.stock_sistema,
        "Stock real": ln.stock_real,
        Diferencia: diff,
        Tipo: diff > 0.001 ? "Ajuste +" : diff < -0.001 ? "Ajuste −" : "Sin diferencia",
        "Costo prom. ($)": ln.costo_unitario != null ? Number(ln.costo_unitario).toFixed(2) : "",
        "Valor ajuste ($)": ln.costo_unitario != null ? (Math.abs(diff) * Number(ln.costo_unitario)).toFixed(2) : "",
      };
    });

  const writeInformeXlsx = (rows: object[], fecha: string) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 35 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Informe");
    XLSX.writeFile(wb, `informe_inventario_${fecha}.xlsx`);
  };

  const downloadInformeNueva = (fecha: string) =>
    writeInformeXlsx(buildInformeRows(fecha, lineas), fecha);

  const downloadInformeHist = (t: HistorialToma) =>
    writeInformeXlsx(buildHistInformeRows(t.lineas || []), t.fecha);

  // ── Summary counts ────────────────────────────────────────────

  const lineasConDif = lineas.filter((l) => Math.abs(l.stock_real - l.stock_sistema) >= 0.001);
  const lineasSinDif = lineas.length - lineasConDif.length;
  const valorTotalAjuste = lineasConDif.reduce((sum, l) => {
    const diff = Math.abs(l.stock_real - l.stock_sistema);
    return sum + (l.costo_promedio != null ? diff * l.costo_promedio : 0);
  }, 0);

  const empresa = empresas.find((e) => e.id === empresaId);

  return (
    <>
      <Nav empresaId={empresaId} />
      <main style={container}>
        {/* Header */}
        <div style={pageHeader}>
          <div>
            <h1 style={pageTitle}>Toma de inventario — {empresa?.nombre}</h1>
            <p style={pageSubtitle}>Ajusta el stock real con los conteos físicos mensuales</p>
          </div>
          <button onClick={() => router.push(`/bodega?empresa=${empresaId}`)} style={backBtn}>
            ← Volver a Bodega
          </button>
        </div>

        {/* Empresa tabs */}
        {empresas.length > 1 && (
          <div style={empresaBar}>
            {empresas.map((e) => (
              <button
                key={e.id}
                onClick={() => { setEmpresaId(e.id); loadStock(e.id); setStep(1); setLineas([]); setSaved(false); }}
                style={{ ...empresaBtn, ...(e.id === empresaId ? empresaBtnActive : {}) }}
              >
                {e.nombre}
              </button>
            ))}
          </div>
        )}

        {/* Main tabs */}
        <div style={tabBar}>
          <button onClick={() => setTab("nueva")} style={{ ...tabBtn, ...(tab === "nueva" ? tabBtnActive : {}) }}>
            Nueva toma
          </button>
          <button
            onClick={() => {
              setTab("historial");
              if (!historial.length) loadHistorial(empresaId);
            }}
            style={{ ...tabBtn, ...(tab === "historial" ? tabBtnActive : {}) }}
          >
            Historial
          </button>
        </div>

        {/* ── Nueva toma ── */}
        {tab === "nueva" && (
          <div style={card}>
            {/* Steps indicator */}
            <div style={stepsRow}>
              {[
                { n: 1, label: "Descargar plantilla" },
                { n: 2, label: "Revisar diferencias" },
                { n: 3, label: "Confirmado" },
              ].map(({ n, label }) => (
                <div key={n} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{
                    ...stepCircle,
                    background: step >= n ? "#1a4731" : "#e5e7eb",
                    color: step >= n ? "#fff" : "#9ca3af",
                  }}>{n}</div>
                  <span style={{ fontSize: "13px", fontWeight: step === n ? 700 : 400, color: step === n ? "#1a4731" : "#6b7280" }}>{label}</span>
                  {n < 3 && <div style={{ width: "32px", height: "2px", background: step > n ? "#1a4731" : "#e5e7eb", marginLeft: "4px" }} />}
                </div>
              ))}
            </div>

            {/* Step 1: Download */}
            {step === 1 && (
              <div style={stepBody}>
                <h2 style={sectionTitle}>Paso 1 — Descarga la plantilla con el stock actual</h2>
                <p style={helpText}>
                  Descarga el Excel con el stock actual del sistema y el costo promedio ponderado de cada producto.
                  Completa la columna <strong>"Stock real (completar)"</strong> con el conteo físico, luego sube el archivo.
                </p>
                {loading ? (
                  <p style={{ color: "#6b7280" }}>Cargando stock...</p>
                ) : (
                  <>
                    <div style={{ marginBottom: "16px", padding: "12px 16px", background: "#f0fdf4", borderRadius: "10px", border: "1px solid #bbf7d0" }}>
                      <p style={{ fontSize: "13px", color: "#15803d", margin: 0 }}>
                        <strong>{stockActual.length} productos</strong> en stock para {empresa?.nombre}.
                        {" "}Productos con costo promedio calculado: {Object.values(costos).filter(v => v != null).length}
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                      <button onClick={downloadTemplate} style={primaryBtn}>
                        ⬇ Descargar plantilla Excel
                      </button>
                      <div>
                        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display: "none" }} />
                        <button onClick={() => fileRef.current?.click()} style={secondaryBtn}>
                          ⬆ Subir conteo físico
                        </button>
                      </div>
                    </div>
                  </>
                )}
                {error && <p style={errorStyle}>{error}</p>}
              </div>
            )}

            {/* Step 2: Review */}
            {step === 2 && (
              <div style={stepBody}>
                <h2 style={sectionTitle}>Paso 2 — Revisa las diferencias</h2>

                {/* Summary */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginBottom: "20px" }}>
                  <SummaryCard label="Productos revisados" value={String(lineas.length)} />
                  <SummaryCard label="Con diferencia" value={String(lineasConDif.length)} color="#dc2626" />
                  <SummaryCard label="Sin diferencia" value={String(lineasSinDif)} color="#15803d" />
                  <SummaryCard
                    label="Valor total ajuste"
                    value={`$${valorTotalAjuste.toLocaleString("es-CL", { maximumFractionDigits: 0 })}`}
                    color="#1d4ed8"
                  />
                </div>

                {/* Date + notas */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "14px", marginBottom: "20px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                    <label style={labelStyle}>Fecha de toma *</label>
                    <input type="date" value={fechaToma} onChange={(e) => setFechaToma(e.target.value)} style={inputStyle} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                    <label style={labelStyle}>Notas (opcional)</label>
                    <input value={notas} onChange={(e) => setNotas(e.target.value)} style={inputStyle} placeholder="Ej: Toma mensual junio 2026..." />
                  </div>
                </div>

                {/* Table */}
                <div style={{ overflowX: "auto", marginBottom: "20px" }}>
                  <table style={table}>
                    <thead>
                      <tr>
                        {["Producto", "Unidad", "Stock sistema", "Stock real", "Diferencia", "Tipo ajuste", "Costo prom.", "Valor ajuste"].map(h => (
                          <th key={h} style={th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lineas.map((l, i) => {
                        const diff = l.stock_real - l.stock_sistema;
                        const absDiff = Math.abs(diff);
                        const hasDiff = absDiff >= 0.001;
                        const tipo = hasDiff ? (diff > 0 ? "Ajuste +" : "Ajuste −") : "Sin diferencia";
                        const tipColor = hasDiff ? (diff > 0 ? "#0891b2" : "#7c3aed") : "#6b7280";
                        const valorAjuste = hasDiff && l.costo_promedio != null
                          ? absDiff * l.costo_promedio
                          : null;
                        return (
                          <tr key={i} style={hasDiff ? { background: "#fafafa" } : {}}>
                            <td style={{ ...td, fontWeight: 600 }}>{l.nombre}</td>
                            <td style={td}>{l.unidad}</td>
                            <td style={{ ...td, textAlign: "right" }}>{Number(l.stock_sistema).toFixed(3)}</td>
                            <td style={{ ...td, textAlign: "right" }}>{Number(l.stock_real).toFixed(3)}</td>
                            <td style={{ ...td, textAlign: "right", fontWeight: hasDiff ? 700 : 400, color: diff > 0.001 ? "#0891b2" : diff < -0.001 ? "#7c3aed" : "#6b7280" }}>
                              {hasDiff ? (diff > 0 ? "+" : "") + Number(diff).toFixed(3) : "—"}
                            </td>
                            <td style={{ ...td, color: tipColor, fontWeight: hasDiff ? 700 : 400 }}>{tipo}</td>
                            <td style={{ ...td, textAlign: "right", color: "#6b7280" }}>
                              {l.costo_promedio != null ? `$${Number(l.costo_promedio).toLocaleString("es-CL", { maximumFractionDigits: 0 })}` : "—"}
                            </td>
                            <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>
                              {valorAjuste != null ? `$${valorAjuste.toLocaleString("es-CL", { maximumFractionDigits: 0 })}` : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {error && <p style={errorStyle}>{error}</p>}

                <div style={{ display: "flex", gap: "10px" }}>
                  <button onClick={() => { setStep(1); setLineas([]); }} style={cancelBtn}>
                    ← Subir otro archivo
                  </button>
                  <button onClick={aplicarAjustes} disabled={saving} style={primaryBtn}>
                    {saving ? "Aplicando ajustes..." : `Aplicar ${lineasConDif.length} ajustes`}
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Done */}
            {step === 3 && saved && (
              <div style={stepBody}>
                <div style={{ textAlign: "center", padding: "40px 20px" }}>
                  <div style={{ fontSize: "48px", marginBottom: "16px" }}>✅</div>
                  <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#15803d", marginBottom: "8px" }}>
                    Inventario aplicado
                  </h2>
                  <p style={{ color: "#6b7280", fontSize: "14px", marginBottom: "24px" }}>
                    Se crearon {lineasConDif.length} movimiento{lineasConDif.length !== 1 ? "s" : ""} de ajuste.
                    El stock del sistema quedó actualizado al conteo físico.
                  </p>
                  <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
                    <button onClick={() => downloadInformeNueva(fechaToma)} style={secondaryBtn}>
                      ⬇ Descargar informe Excel
                    </button>
                    <button
                      onClick={() => { setStep(1); setLineas([]); setSaved(false); setNotas(""); loadStock(empresaId); }}
                      style={primaryBtn}
                    >
                      Nueva toma
                    </button>
                    <button onClick={() => router.push(`/bodega?empresa=${empresaId}`)} style={cancelBtn}>
                      Ir a Bodega
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Historial ── */}
        {tab === "historial" && (
          <div>
            {histDetalle ? (
              <div style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                  <div>
                    <h2 style={sectionTitle}>Toma del {histDetalle.fecha}</h2>
                    {histDetalle.notas && <p style={{ fontSize: "13px", color: "#6b7280" }}>{histDetalle.notas}</p>}
                  </div>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      onClick={() => downloadInformeHist(histDetalle)}
                      style={secondaryBtn}
                    >
                      ⬇ Descargar Excel
                    </button>
                    <button onClick={() => setHistDetalle(null)} style={cancelBtn}>
                      ← Volver
                    </button>
                  </div>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={table}>
                    <thead>
                      <tr>
                        {["Producto", "Unidad", "Stock sistema", "Stock real", "Diferencia", "Costo prom.", "Valor ajuste"].map(h => (
                          <th key={h} style={th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(histDetalle.lineas || []).map((l, i) => {
                        const diff = l.stock_real - l.stock_sistema;
                        const absDiff = Math.abs(diff);
                        const hasDiff = absDiff >= 0.001;
                        return (
                          <tr key={i}>
                            <td style={{ ...td, fontWeight: 600 }}>{l.producto?.nombre_comercial || "—"}</td>
                            <td style={td}>{l.unidad}</td>
                            <td style={{ ...td, textAlign: "right" }}>{Number(l.stock_sistema).toFixed(3)}</td>
                            <td style={{ ...td, textAlign: "right" }}>{Number(l.stock_real).toFixed(3)}</td>
                            <td style={{ ...td, textAlign: "right", color: diff > 0.001 ? "#0891b2" : diff < -0.001 ? "#7c3aed" : "#6b7280" }}>
                              {hasDiff ? (diff > 0 ? "+" : "") + Number(diff).toFixed(3) : "—"}
                            </td>
                            <td style={{ ...td, textAlign: "right", color: "#6b7280" }}>
                              {l.costo_unitario != null ? `$${Number(l.costo_unitario).toLocaleString("es-CL", { maximumFractionDigits: 0 })}` : "—"}
                            </td>
                            <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>
                              {l.costo_unitario != null && hasDiff
                                ? `$${(absDiff * Number(l.costo_unitario)).toLocaleString("es-CL", { maximumFractionDigits: 0 })}`
                                : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div style={card}>
                <h2 style={sectionTitle}>Tomas anteriores</h2>
                {histLoading ? (
                  <p style={{ color: "#6b7280" }}>Cargando historial...</p>
                ) : historial.length === 0 ? (
                  <p style={{ color: "#9ca3af", fontSize: "14px" }}>Aún no hay tomas de inventario registradas para esta empresa.</p>
                ) : (
                  <table style={table}>
                    <thead>
                      <tr>
                        {["Fecha", "Notas", "Registrada", "Acciones"].map(h => (
                          <th key={h} style={th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {historial.map((t) => (
                        <tr key={t.id}>
                          <td style={{ ...td, fontWeight: 700 }}>{t.fecha}</td>
                          <td style={{ ...td, color: "#6b7280" }}>{t.notas || "—"}</td>
                          <td style={{ ...td, color: "#6b7280" }}>{new Date(t.created_at).toLocaleString("es-CL")}</td>
                          <td style={td}>
                            <button
                              onClick={async () => {
                                const data = await loadDetalle(t.id);
                                setHistDetalle({ ...t, lineas: data as HistorialToma["lineas"] });
                              }}
                              style={smallBtn}
                            >
                              Ver detalle
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}

// ── Small helper components ───────────────────────────────────────

function SummaryCard({ label, value, color = "#1a4731" }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: "#f9fafb", borderRadius: "10px", padding: "14px 16px", border: "1px solid #e5e7eb" }}>
      <p style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280", marginBottom: "4px", textTransform: "uppercase" }}>{label}</p>
      <p style={{ fontSize: "20px", fontWeight: 800, color }}>{value}</p>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────

const container: React.CSSProperties = { maxWidth: "1200px", margin: "0 auto", padding: "28px 20px" };
const pageHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", flexWrap: "wrap", gap: "12px" };
const pageTitle: React.CSSProperties = { fontSize: "24px", fontWeight: 800, color: "#1a4731" };
const pageSubtitle: React.CSSProperties = { fontSize: "13px", color: "#6b7280", marginTop: "4px" };
const empresaBar: React.CSSProperties = { display: "flex", gap: "8px", marginBottom: "16px" };
const empresaBtn: React.CSSProperties = { padding: "8px 18px", borderRadius: "999px", border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: "13px", cursor: "pointer" };
const empresaBtnActive: React.CSSProperties = { background: "#1a4731", border: "1.5px solid #1a4731", color: "#fff" };
const tabBar: React.CSSProperties = { display: "flex", gap: "4px", marginBottom: "16px", borderBottom: "2px solid #e5e7eb" };
const tabBtn: React.CSSProperties = { padding: "8px 18px", borderRadius: "8px 8px 0 0", border: "none", background: "transparent", color: "#6b7280", fontWeight: 600, fontSize: "14px", cursor: "pointer" };
const tabBtnActive: React.CSSProperties = { background: "#1a4731", color: "#fff" };
const card: React.CSSProperties = { background: "#fff", borderRadius: "16px", border: "1px solid #e5e7eb", overflow: "hidden" };
const stepsRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: "8px", padding: "20px 24px", borderBottom: "1px solid #f3f4f6" };
const stepCircle: React.CSSProperties = { width: "28px", height: "28px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 800, flexShrink: 0 };
const stepBody: React.CSSProperties = { padding: "24px" };
const sectionTitle: React.CSSProperties = { fontSize: "14px", fontWeight: 800, color: "#1a4731", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.05em" };
const helpText: React.CSSProperties = { fontSize: "14px", color: "#374151", marginBottom: "16px", lineHeight: "1.6" };
const labelStyle: React.CSSProperties = { fontSize: "12px", fontWeight: 700, color: "#374151" };
const inputStyle: React.CSSProperties = { padding: "9px 12px", borderRadius: "8px", border: "1.5px solid #d1d5db", fontSize: "14px", background: "#fafafa", color: "#111", width: "100%", boxSizing: "border-box" };
const primaryBtn: React.CSSProperties = { padding: "9px 20px", borderRadius: "10px", background: "#1a4731", color: "#fff", fontWeight: 700, fontSize: "14px", border: "none", cursor: "pointer" };
const secondaryBtn: React.CSSProperties = { padding: "9px 18px", borderRadius: "10px", border: "1.5px solid #1a4731", color: "#1a4731", fontWeight: 700, fontSize: "14px", background: "#fff", cursor: "pointer" };
const cancelBtn: React.CSSProperties = { padding: "9px 18px", borderRadius: "8px", border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: "14px", cursor: "pointer" };
const backBtn: React.CSSProperties = { padding: "8px 16px", borderRadius: "8px", border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: "13px", cursor: "pointer" };
const smallBtn: React.CSSProperties = { padding: "5px 12px", borderRadius: "6px", background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d", fontWeight: 700, fontSize: "12px", cursor: "pointer" };
const table: React.CSSProperties = { width: "100%", background: "#fff", borderRadius: "12px", overflow: "hidden", border: "1px solid #e5e7eb", borderCollapse: "collapse" };
const th: React.CSSProperties = { padding: "10px 12px", background: "#f0f4f2", fontWeight: 700, fontSize: "12px", color: "#374151", textAlign: "left", whiteSpace: "nowrap", borderBottom: "1px solid #e5e7eb" };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: "13px", color: "#374151", borderBottom: "1px solid #f3f4f6" };
const errorStyle: React.CSSProperties = { marginTop: "12px", fontSize: "13px", color: "#dc2626", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", padding: "10px 14px" };

export default function InventarioPage() {
  return <Suspense><InventarioContent /></Suspense>;
}
