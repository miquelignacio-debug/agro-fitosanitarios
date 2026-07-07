"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import Nav from "@/lib/nav";
import type { Empresa, StockMovimiento, Producto } from "@/lib/types";

type StockRow = {
  producto_id: string;
  producto: Producto;
  cantidad_disponible: number;
};

export default function BodegaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const empresaParam = searchParams.get("empresa") || "";

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaId, setEmpresaId] = useState(empresaParam);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [movimientos, setMovimientos] = useState<StockMovimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"stock" | "movimientos">("stock");

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
    const [{ data: st }, { data: mv }] = await Promise.all([
      supabase
        .from("stock_actual")
        .select("*, producto:productos(*)")
        .eq("empresa_id", eid)
        .order("producto(nombre_comercial)", { ascending: true }),
      supabase
        .from("stock_movimientos")
        .select("*, producto:productos(*), empresa_contraparte:empresas!stock_movimientos_empresa_contraparte_id_fkey(*)")
        .eq("empresa_id", eid)
        .order("fecha", { ascending: false })
        .limit(50),
    ]);
    setStock((st as StockRow[]) || []);
    setMovimientos((mv as StockMovimiento[]) || []);
    setLoading(false);
  };

  const switchEmpresa = (eid: string) => {
    setEmpresaId(eid);
    router.push(`/bodega?empresa=${eid}`);
    load(eid);
  };

  const empresa = empresas.find((e) => e.id === empresaId);

  const tipoLabel: Record<string, string> = {
    entrada: "Entrada",
    salida: "Salida (OT)",
    transferencia_salida: "Transferencia salida",
    transferencia_entrada: "Transferencia entrada",
  };

  const tipoColor: Record<string, string> = {
    entrada: "#15803d",
    salida: "#dc2626",
    transferencia_salida: "#d97706",
    transferencia_entrada: "#1d4ed8",
  };

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
            <h1 style={pageTitle}>Bodega — {empresa?.nombre}</h1>
            <p style={pageSubtitle}>Stock de productos fitosanitarios</p>
          </div>
          <Link href={`/bodega/ingreso?empresa=${empresaId}`} style={primaryBtn}>
            + Ingreso a bodega
          </Link>
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

        {loading ? (
          <p style={{ color: "#6b7280", marginTop: "20px" }}>Cargando...</p>
        ) : tab === "stock" ? (
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
                {stock.map((s) => {
                  const bajo = s.cantidad_disponible < 5;
                  return (
                    <tr key={s.producto_id}>
                      <td style={{ ...td, fontWeight: 700 }}>{s.producto.nombre_comercial}</td>
                      <td style={td}>{s.producto.numero_registro || "—"}</td>
                      <td style={td}>{s.producto.ingrediente_activo || "—"}</td>
                      <td style={td}>{s.producto.tipo_funcion?.join(", ") || "—"}</td>
                      <td style={{ ...td, fontWeight: 700, color: bajo ? "#dc2626" : "#15803d" }}>
                        {Number(s.cantidad_disponible).toFixed(3)} {s.producto.unidad_dosis || "u"}
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
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  {["Fecha", "Tipo", "Producto", "Cantidad", "Documento", "Proveedor / OT / Contraparte", "Notas"].map((h) => (
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
                    <td style={td}>
                      {m.documento_tipo ? (
                        <span>
                          {m.documento_tipo === "guia_despacho" ? "Guía" : "Factura"} #{m.documento_numero || "—"}
                        </span>
                      ) : "—"}
                    </td>
                    <td style={td}>
                      {m.proveedor || m.empresa_contraparte?.nombre || (m.ot_id ? `OT ref.` : "—")}
                    </td>
                    <td style={{ ...td, color: "#6b7280" }}>{m.notas || "—"}</td>
                  </tr>
                ))}
                {movimientos.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ ...td, textAlign: "center", color: "#9ca3af", padding: "30px" }}>
                      Sin movimientos registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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
const primaryBtn: React.CSSProperties = { padding: "9px 18px", borderRadius: "10px", background: "#1a4731", color: "#fff", fontWeight: 700, fontSize: "14px" };
const tabBar: React.CSSProperties = { display: "flex", gap: "4px", marginBottom: "16px", borderBottom: "2px solid #e5e7eb", paddingBottom: "0" };
const tabBtn: React.CSSProperties = { padding: "8px 18px", borderRadius: "8px 8px 0 0", border: "none", background: "transparent", color: "#6b7280", fontWeight: 600, fontSize: "14px", cursor: "pointer" };
const tabBtnActive: React.CSSProperties = { background: "#1a4731", color: "#fff" };
const table: React.CSSProperties = { width: "100%", background: "#fff", borderRadius: "14px", overflow: "hidden", border: "1px solid #e5e7eb" };
const th: React.CSSProperties = { padding: "10px 12px", background: "#f0f4f2", fontWeight: 700, fontSize: "12px", color: "#374151", textAlign: "left", whiteSpace: "nowrap", borderBottom: "1px solid #e5e7eb" };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: "13px", color: "#374151", borderBottom: "1px solid #f3f4f6" };
const alertaBadge: React.CSSProperties = { padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 700, background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5" };
