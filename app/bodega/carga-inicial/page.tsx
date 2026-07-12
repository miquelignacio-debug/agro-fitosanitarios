"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { supabase } from "@/lib/supabaseClient";
import Nav from "@/lib/nav";
import type { Producto } from "@/lib/types";

type FilaImport = {
  producto_nombre: string;
  cantidad: number;
  unidad: string;
  fecha: string;
  tipo_doc: "guia_despacho" | "factura" | null;
  num_doc: string;
  proveedor: string;
  precio_unitario: number | null;
  producto_id: string | null;
  producto_match: string;
  _selected: boolean;
};

function parseExcelDate(raw: unknown): string {
  const hoy = new Date().toISOString().slice(0, 10);
  if (!raw) return hoy;
  const str = String(raw).trim();
  // dd/mm/yyyy
  const slash = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const [, d, m, y] = slash;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  // Excel serial number
  const serial = parseFloat(str);
  if (!isNaN(serial) && serial > 40000) {
    const d = new Date((serial - 25569) * 86400 * 1000);
    return d.toISOString().slice(0, 10);
  }
  return hoy;
}

function CargaInicialContent() {
  const searchParams = useSearchParams();
  const empresa = searchParams.get("empresa") || "";

  const [productos, setProductos] = useState<Producto[]>([]);
  const [loadingProds, setLoadingProds] = useState(true);
  const [catalogProv, setCatalogProv] = useState<string[]>([]);
  const [filas, setFilas] = useState<FilaImport[]>([]);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const init = async () => {
      // Cargar todos los productos con paginación (evita límite de 1000 filas de Supabase)
      const allProds: Producto[] = [];
      const pageSize = 1000;
      let from = 0;
      while (true) {
        const { data } = await supabase
          .from("productos")
          .select("id, nombre_comercial, ingrediente_activo, unidad_dosis")
          .eq("activo", true)
          .order("nombre_comercial")
          .range(from, from + pageSize - 1);
        if (!data?.length) break;
        allProds.push(...(data as Producto[]));
        if (data.length < pageSize) break;
        from += pageSize;
      }
      const { data: prov } = await supabase.from("proveedores").select("nombre").eq("activo", true).order("nombre");
      setProductos(allProds);
      setCatalogProv((prov || []).map((r: { nombre: string }) => r.nombre));
      setLoadingProds(false);
    };
    init();
  }, []);

  // ── Descargar plantilla ────────────────────────────────────────────────────
  const descargarPlantilla = async () => {
    const { utils, writeFile } = await import("xlsx");
    const wb = utils.book_new();

    // Hoja 1: Inventario
    const encabezados = ["Producto (nombre_comercial)", "Cantidad", "Unidad", "Fecha (dd/mm/yyyy)", "Tipo Documento", "N° Documento", "Proveedor", "Precio Unitario (USD)"];
    const ejemplos = [
      ["Nomolt 150 SC", 5, "lt", "01/06/2026", "guia_despacho", "GD-001234", "Agroventas SpA", 45.50],
      ["Captan 80 WP", 20, "kg", "01/06/2026", "factura", "F-56789", "", 14.50],
    ];
    const ws1 = utils.aoa_to_sheet([encabezados, ...ejemplos]);
    ws1["!cols"] = [{ wch: 42 }, { wch: 12 }, { wch: 10 }, { wch: 18 }, { wch: 20 }, { wch: 16 }, { wch: 22 }, { wch: 20 }];
    utils.book_append_sheet(wb, ws1, "Inventario");

    // Hoja 2: Catálogo de productos para referencia
    const catHead = ["Nombre Comercial", "Ingrediente Activo", "Unidad Dosis"];
    const catRows = productos.map(p => [p.nombre_comercial, p.ingrediente_activo || "", p.unidad_dosis || ""]);
    const ws2 = utils.aoa_to_sheet([catHead, ...catRows]);
    ws2["!cols"] = [{ wch: 45 }, { wch: 32 }, { wch: 15 }];
    utils.book_append_sheet(wb, ws2, "Catálogo Productos");

    // Hoja 3: Proveedores registrados
    const provHead = ["Proveedor"];
    const provRows = catalogProv.map(n => [n]);
    const ws3 = utils.aoa_to_sheet([provHead, ...provRows]);
    ws3["!cols"] = [{ wch: 35 }];
    utils.book_append_sheet(wb, ws3, "Proveedores");

    writeFile(wb, "plantilla_inventario_inicial.xlsx");
  };

  // ── Leer archivo ──────────────────────────────────────────────────────────
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg("");
    setResultado(null);

    try {
      const { read, utils } = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: Record<string, unknown>[] = utils.sheet_to_json(ws, { defval: "" });

      if (!rows.length) { setErrorMsg("El archivo no tiene filas de datos."); return; }

      const keys = Object.keys(rows[0]);
      const col = (candidates: string[]) =>
        keys.find(k => candidates.some(c => k.toLowerCase().includes(c.toLowerCase()))) || "";

      const kProd    = col(["producto", "nombre"]);
      const kCant    = col(["cantidad", "cant"]);
      const kUnid    = col(["unidad"]);
      const kFecha   = col(["fecha", "date"]);
      const kTipoDoc = col(["tipo doc", "tipo_doc", "tipo documento"]);
      const kNumDoc  = col(["n° doc", "num doc", "numero doc", "n°"]);
      const kProv    = col(["proveedor"]);
      const kPrecio  = col(["precio unitario", "precio", "precio unit", "price"]);

      const parsed: FilaImport[] = rows
        .map(r => {
          const nombre = String(r[kProd] || "").trim();
          if (!nombre) return null;

          // Buscar producto: primero exacto, luego parcial
          const matchExacto = productos.find(p => p.nombre_comercial.toLowerCase() === nombre.toLowerCase());
          const matchParcial = matchExacto ?? productos.find(p =>
            p.nombre_comercial.toLowerCase().includes(nombre.toLowerCase()) ||
            nombre.toLowerCase().includes(p.nombre_comercial.toLowerCase())
          );

          const tipoDocRaw = String(r[kTipoDoc] || "").toLowerCase().trim();
          const tipo_doc: FilaImport["tipo_doc"] = tipoDocRaw.includes("factura")
            ? "factura"
            : tipoDocRaw.includes("guia") || tipoDocRaw.includes("guía")
              ? "guia_despacho"
              : null;

          return {
            producto_nombre: nombre,
            cantidad: parseFloat(String(r[kCant] || "0")) || 0,
            unidad: String(r[kUnid] || "lt").trim().toLowerCase() || "lt",
            fecha: parseExcelDate(r[kFecha]),
            tipo_doc,
            num_doc: String(r[kNumDoc] || "").trim(),
            proveedor: String(r[kProv] || "").trim(),
            precio_unitario: kPrecio && r[kPrecio] !== "" ? parseFloat(String(r[kPrecio]).replace(/[^0-9.,]/g, "").replace(",", ".")) || null : null,
            producto_id: matchParcial?.id || null,
            producto_match: matchParcial?.nombre_comercial || "",
            _selected: !!matchParcial,
          } as FilaImport;
        })
        .filter(Boolean) as FilaImport[];

      setFilas(parsed);
    } catch (err: unknown) {
      setErrorMsg("Error al leer el archivo: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const toggleFila   = (i: number) => setFilas(f => f.map((r, idx) => idx === i && r.producto_id ? { ...r, _selected: !r._selected } : r));
  const toggleTodos  = (val: boolean) => setFilas(f => f.map(r => r.producto_id ? { ...r, _selected: val } : r));

  const handleImportar = async () => {
    if (!empresa) { setErrorMsg("Seleccioná una empresa en el selector del nav."); return; }
    const seleccionadas = filas.filter(f => f._selected && f.producto_id);
    if (!seleccionadas.length) { setErrorMsg("No hay productos válidos seleccionados."); return; }

    setImportando(true);
    const { error: err } = await supabase.from("stock_movimientos").insert(
      seleccionadas.map(f => ({
        empresa_id: empresa,
        producto_id: f.producto_id!,
        tipo: "entrada",
        cantidad: f.cantidad,
        unidad: f.unidad,
        fecha: f.fecha,
        documento_tipo: f.tipo_doc || null,
        documento_numero: f.num_doc || null,
        proveedor: f.proveedor || null,
        precio_unitario: f.precio_unitario || null,
        notas: "Inventario inicial",
      }))
    );
    if (err) {
      setImportando(false);
      setErrorMsg(err.message);
      return;
    }

    // Actualizar unidad_bodega en la ficha de cada producto
    const ltIds = seleccionadas.filter(f => f.unidad === "lt").map(f => f.producto_id!);
    const kgIds = seleccionadas.filter(f => f.unidad === "kg").map(f => f.producto_id!);
    await Promise.all([
      ltIds.length ? supabase.from("productos").update({ unidad_bodega: "lt" }).in("id", ltIds) : Promise.resolve(),
      kgIds.length ? supabase.from("productos").update({ unidad_bodega: "kg" }).in("id", kgIds) : Promise.resolve(),
    ]);

    setImportando(false);
    setResultado({ ok: seleccionadas.length });
    setFilas([]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const selCount   = filas.filter(f => f._selected).length;
  const matchCount = filas.filter(f => f.producto_id).length;

  return (
    <>
      <Nav empresaId={empresa} />
      <main style={container}>
        {/* Header */}
        <div style={pageHeader}>
          <div>
            <h1 style={pageTitle}>Inventario inicial</h1>
            <p style={pageSubtitle}>Cargá el stock disponible a través de una planilla Excel</p>
          </div>
          <button
            onClick={descargarPlantilla}
            style={templateBtn}
            disabled={loadingProds}
          >
            Descargar plantilla
          </button>
        </div>

        {/* Instrucciones */}
        <div style={infoBox}>
          <strong>Cómo usarlo:</strong>
          <ol style={{ margin: "6px 0 0 18px", padding: 0, fontSize: "13px", lineHeight: "1.7" }}>
            <li>Descargá la plantilla — incluye los {productos.length} productos del catálogo en la segunda hoja.</li>
            <li>Completá la hoja <em>Inventario</em> con los productos que tenés en stock (copiá el nombre exacto del catálogo).</li>
            <li>Subí el archivo completado. El sistema buscará el producto y te pedirá confirmar antes de registrar.</li>
          </ol>
        </div>

        {/* Upload */}
        <div style={dropzone} onClick={() => fileRef.current?.click()}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={handleFile} />
          <span style={{ fontSize: "28px" }}>📂</span>
          <p style={{ fontWeight: 700, color: "#1a4731", margin: "6px 0 2px" }}>Clic para seleccionar archivo</p>
          <p style={{ fontSize: "12px", color: "#6b7280" }}>Formato: .xlsx, .xls</p>
        </div>

        {errorMsg && <p style={errorStyle}>{errorMsg}</p>}

        {resultado && (
          <div style={resultBox}>
            ✅ <strong>{resultado.ok} movimientos de entrada</strong> registrados correctamente en bodega.
          </div>
        )}

        {/* Preview */}
        {filas.length > 0 && !resultado && (
          <div style={tableWrap}>
            <div style={tableHeader}>
              <div style={{ fontSize: "13px" }}>
                <strong>{filas.length}</strong> filas · <strong style={{ color: "#15803d" }}>{matchCount} encontrados</strong>
                {matchCount < filas.length && <strong style={{ color: "#dc2626" }}> · {filas.length - matchCount} sin match</strong>}
              </div>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <label style={{ fontSize: "13px", cursor: "pointer" }}>
                  <input type="checkbox" checked={selCount === matchCount && matchCount > 0} onChange={e => toggleTodos(e.target.checked)} />
                  {" "}Todos ({selCount})
                </label>
                <button onClick={handleImportar} style={importBtn} disabled={importando || selCount === 0}>
                  {importando ? "Registrando..." : `Registrar ${selCount} entradas`}
                </button>
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}></th>
                    <th style={th}>Producto (archivo)</th>
                    <th style={th}>Match en catálogo</th>
                    <th style={th}>Cantidad</th>
                    <th style={th}>Unidad</th>
                    <th style={th}>Precio Unit. (USD)</th>
                    <th style={th}>Fecha</th>
                    <th style={th}>Documento</th>
                    <th style={th}>Proveedor</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f, i) => (
                    <tr key={i} style={{ background: f.producto_id ? (i % 2 === 0 ? "#fff" : "#f9fafb") : "#fef2f2" }}>
                      <td style={td}>
                        <input type="checkbox" checked={f._selected} onChange={() => toggleFila(i)} disabled={!f.producto_id} />
                      </td>
                      <td style={td}>{f.producto_nombre}</td>
                      <td style={{ ...td, fontSize: "12px", color: f.producto_id ? "#15803d" : "#dc2626" }}>
                        {f.producto_id ? f.producto_match : "❌ No encontrado"}
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>{f.cantidad}</td>
                      <td style={td}>{f.unidad}</td>
                      <td style={{ ...td, textAlign: "right", color: f.precio_unitario ? "#15803d" : "#9ca3af" }}>
                        {f.precio_unitario != null ? `$${f.precio_unitario.toFixed(2)}` : "—"}
                      </td>
                      <td style={td}>{f.fecha}</td>
                      <td style={td}>
                        {f.tipo_doc ? `${f.tipo_doc === "factura" ? "Factura" : "Guía"} ${f.num_doc}` : f.num_doc || "—"}
                      </td>
                      <td style={td}>{f.proveedor || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

const container: React.CSSProperties    = { maxWidth: "1100px", margin: "0 auto", padding: "28px 20px" };
const pageHeader: React.CSSProperties   = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", gap: "12px" };
const pageTitle: React.CSSProperties    = { fontSize: "24px", fontWeight: 800, color: "#1a4731" };
const pageSubtitle: React.CSSProperties = { fontSize: "13px", color: "#6b7280", marginTop: "4px" };
const templateBtn: React.CSSProperties  = { padding: "9px 20px", borderRadius: "8px", background: "#1a4731", color: "#fff", fontWeight: 700, fontSize: "13px", border: "none", cursor: "pointer", flexShrink: 0 };
const infoBox: React.CSSProperties      = { background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "10px", padding: "14px 18px", fontSize: "13px", color: "#1e40af", marginBottom: "20px" };
const dropzone: React.CSSProperties     = { border: "2px dashed #d1d5db", borderRadius: "14px", padding: "32px 20px", textAlign: "center", cursor: "pointer", background: "#fafafa", marginBottom: "20px" };
const errorStyle: React.CSSProperties   = { fontSize: "13px", color: "#dc2626", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px" };
const resultBox: React.CSSProperties    = { fontSize: "14px", color: "#15803d", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: "10px", padding: "14px 18px", marginBottom: "16px" };
const tableWrap: React.CSSProperties    = { background: "#fff", borderRadius: "14px", border: "1px solid #e5e7eb", overflow: "hidden" };
const tableHeader: React.CSSProperties  = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid #e5e7eb", gap: "12px" };
const importBtn: React.CSSProperties    = { padding: "8px 18px", borderRadius: "8px", background: "#1a4731", color: "#fff", fontWeight: 700, fontSize: "13px", border: "none", cursor: "pointer" };
const table: React.CSSProperties        = { width: "100%", borderCollapse: "collapse", fontSize: "13px" };
const th: React.CSSProperties           = { padding: "10px 12px", background: "#f3f4f6", textAlign: "left", fontWeight: 700, fontSize: "11px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #e5e7eb" };
const td: React.CSSProperties           = { padding: "9px 12px", borderBottom: "1px solid #f3f4f6", verticalAlign: "middle" };

export default function CargaInicialPage() { return <Suspense><CargaInicialContent /></Suspense>; }
