"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import Nav from "@/lib/nav";
import type { Empresa, OrdenTrabajo, StockActual } from "@/lib/types";
import { ESTADOS_OT, ESTADOS_OT_COLOR } from "@/lib/types";

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const empresaParam = searchParams.get("empresa") || "";

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaId, setEmpresaId] = useState(empresaParam);
  const [ordenes, setOrdenes] = useState<OrdenTrabajo[]>([]);
  const [stockBajo, setStockBajo] = useState<StockActual[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const { data: emp } = await supabase.from("empresas").select("*").order("nombre");
      if (!emp || emp.length === 0) return;
      setEmpresas(emp);

      const eid = empresaParam || emp[0].id;
      setEmpresaId(eid);
      await loadData(eid);
    };
    init();
  }, [empresaParam]);

  const loadData = async (eid: string) => {
    setLoading(true);
    const [{ data: ots }, { data: stock }] = await Promise.all([
      supabase
        .from("ordenes_trabajo")
        .select("*")
        .eq("empresa_id", eid)
        .in("estado", ["emitida", "en_ejecucion"])
        .order("fecha_solicitud", { ascending: false })
        .limit(8),
      supabase
        .from("stock_actual")
        .select("*, producto:productos(*)")
        .eq("empresa_id", eid)
        .lt("cantidad_disponible", 5),
    ]);
    setOrdenes((ots as OrdenTrabajo[]) || []);
    setStockBajo((stock as StockActual[]) || []);
    setLoading(false);
  };

  const switchEmpresa = (eid: string) => {
    setEmpresaId(eid);
    router.push(`/dashboard?empresa=${eid}`);
    loadData(eid);
  };

  const empresa = empresas.find((e) => e.id === empresaId);

  return (
    <>
      <Nav empresaId={empresaId} />
      <main style={container}>
        {/* Selector de empresa */}
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
            <h1 style={pageTitle}>{empresa?.nombre || "—"}</h1>
            <p style={pageSubtitle}>Panel de gestión fitosanitaria</p>
          </div>
          <Link href={`/ordenes/nueva?empresa=${empresaId}`} style={primaryBtn}>
            + Nueva orden
          </Link>
        </div>

        {loading ? (
          <p style={{ color: "#6b7280", marginTop: "20px" }}>Cargando...</p>
        ) : (
          <div style={grid}>
            {/* Órdenes activas */}
            <section style={panel}>
              <div style={panelHeader}>
                <h2 style={panelTitle}>Órdenes activas</h2>
                <Link href={`/ordenes?empresa=${empresaId}`} style={linkMore}>Ver todas →</Link>
              </div>
              {ordenes.length === 0 ? (
                <p style={empty}>No hay órdenes emitidas o en ejecución.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {ordenes.map((ot) => (
                    <Link key={ot.id} href={`/ordenes/${ot.id}?empresa=${empresaId}`} style={otRow}>
                      <span style={otNum}>OT #{ot.numero}</span>
                      <span style={{ flex: 1, fontSize: "13px", color: "#374151" }}>
                        {ot.campo || "—"} · {ot.fecha_solicitud}
                      </span>
                      <span
                        style={{
                          ...estadoPill,
                          background: ESTADOS_OT_COLOR[ot.estado] + "20",
                          color: ESTADOS_OT_COLOR[ot.estado],
                          border: `1px solid ${ESTADOS_OT_COLOR[ot.estado]}40`,
                        }}
                      >
                        {ESTADOS_OT[ot.estado]}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {/* Alertas de stock */}
            <section style={panel}>
              <div style={panelHeader}>
                <h2 style={panelTitle}>Stock bajo</h2>
                <Link href={`/bodega?empresa=${empresaId}`} style={linkMore}>Ver bodega →</Link>
              </div>
              {stockBajo.length === 0 ? (
                <p style={empty}>Sin alertas de stock.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {stockBajo.map((s) => (
                    <div key={s.producto_id} style={stockRow}>
                      <span style={{ flex: 1, fontSize: "13px", fontWeight: 600, color: "#111" }}>
                        {s.producto?.nombre_comercial || "—"}
                      </span>
                      <span style={stockBadge}>
                        {Number(s.cantidad_disponible).toFixed(2)} {s.producto?.unidad_dosis || "u"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────

const container: React.CSSProperties = {
  maxWidth: "1200px",
  margin: "0 auto",
  padding: "28px 20px",
};

const empresaBar: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  marginBottom: "22px",
};

const empresaBtn: React.CSSProperties = {
  padding: "8px 18px",
  borderRadius: "999px",
  border: "1.5px solid #d1d5db",
  background: "#fff",
  color: "#374151",
  fontWeight: 600,
  fontSize: "13px",
  cursor: "pointer",
};

const empresaBtnActive: React.CSSProperties = {
  background: "#1a4731",
  border: "1.5px solid #1a4731",
  color: "#fff",
};

const pageHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "24px",
  flexWrap: "wrap",
  gap: "12px",
};

const pageTitle: React.CSSProperties = {
  fontSize: "28px",
  fontWeight: 800,
  color: "#1a4731",
};

const pageSubtitle: React.CSSProperties = {
  fontSize: "14px",
  color: "#6b7280",
  marginTop: "4px",
};

const primaryBtn: React.CSSProperties = {
  padding: "10px 20px",
  borderRadius: "10px",
  background: "#1a4731",
  color: "#fff",
  fontWeight: 700,
  fontSize: "14px",
  textDecoration: "none",
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
  gap: "20px",
};

const panel: React.CSSProperties = {
  background: "#fff",
  borderRadius: "16px",
  padding: "20px",
  border: "1px solid #e5e7eb",
  boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
};

const panelHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "16px",
};

const panelTitle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 700,
  color: "#1a4731",
};

const linkMore: React.CSSProperties = {
  fontSize: "13px",
  color: "#1a4731",
  fontWeight: 600,
};

const empty: React.CSSProperties = {
  fontSize: "14px",
  color: "#9ca3af",
  padding: "12px 0",
};

const otRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  padding: "10px 12px",
  borderRadius: "10px",
  background: "#f9fafb",
  border: "1px solid #f3f4f6",
  textDecoration: "none",
};

const otNum: React.CSSProperties = {
  fontWeight: 700,
  fontSize: "13px",
  color: "#1a4731",
  whiteSpace: "nowrap",
};

const estadoPill: React.CSSProperties = {
  padding: "3px 10px",
  borderRadius: "999px",
  fontSize: "12px",
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const stockRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  padding: "10px 12px",
  borderRadius: "10px",
  background: "#fef9f0",
  border: "1px solid #fed7aa",
};

const stockBadge: React.CSSProperties = {
  padding: "3px 10px",
  borderRadius: "999px",
  fontSize: "12px",
  fontWeight: 700,
  background: "#dc262610",
  color: "#dc2626",
  border: "1px solid #fca5a5",
  whiteSpace: "nowrap",
};
