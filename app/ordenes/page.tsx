"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import Nav from "@/lib/nav";
import { useRol } from "@/lib/useRol";
import type { Empresa, OrdenTrabajo } from "@/lib/types";
import { ESTADOS_OT, ESTADOS_OT_COLOR } from "@/lib/types";

type OTConCuarteles = OrdenTrabajo & {
  ot_cuarteles: { cuartel: { codigo: string } }[];
};

function OrdenesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAdmin, isOperador } = useRol();
  const empresaParam = searchParams.get("empresa") || "";

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaId, setEmpresaId] = useState(empresaParam);
  const [ordenes, setOrdenes] = useState<OTConCuarteles[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState("todos");

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
      .from("ordenes_trabajo")
      .select("*, ot_cuarteles(cuartel:cuarteles(codigo))")
      .eq("empresa_id", eid)
      .order("numero", { ascending: false });
    setOrdenes((data as OTConCuarteles[]) || []);
    setLoading(false);
  };

  const switchEmpresa = (eid: string) => {
    setEmpresaId(eid);
    router.push(`/ordenes?empresa=${eid}`);
    load(eid);
  };

  const filtered = filtroEstado === "todos"
    ? ordenes
    : ordenes.filter((o) => o.estado === filtroEstado);

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
            <h1 style={pageTitle}>Órdenes de Trabajo — {empresa?.nombre}</h1>
            <p style={pageSubtitle}>{ordenes.length} órdenes registradas</p>
          </div>
          {(isAdmin || isOperador) && (
            <Link href={`/ordenes/nueva?empresa=${empresaId}`} style={primaryBtn}>
              + Nueva orden
            </Link>
          )}
        </div>

        {/* Filtros de estado */}
        <div style={filterBar}>
          {["todos", "borrador", "emitida", "en_ejecucion", "finalizada", "anulada"].map((e) => (
            <button
              key={e}
              onClick={() => setFiltroEstado(e)}
              style={{
                ...filterBtn,
                ...(filtroEstado === e
                  ? { background: e === "todos" ? "#1a4731" : ESTADOS_OT_COLOR[e as OrdenTrabajo["estado"]] || "#1a4731", color: "#fff" }
                  : {}),
              }}
            >
              {e === "todos" ? "Todos" : ESTADOS_OT[e as OrdenTrabajo["estado"]]}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ color: "#6b7280", marginTop: "20px" }}>Cargando...</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  {["N° OT", "Estado", "Fecha solicitud", "Fecha aplicación", "Función", "Cuarteles", ""].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((ot) => (
                  <tr key={ot.id}>
                    <td style={{ ...td, fontWeight: 800, color: "#1a4731" }}>#{ot.numero}</td>
                    <td style={td}>
                      <span
                        style={{
                          ...estadoPill,
                          background: ESTADOS_OT_COLOR[ot.estado] + "18",
                          color: ESTADOS_OT_COLOR[ot.estado],
                          border: `1px solid ${ESTADOS_OT_COLOR[ot.estado]}40`,
                        }}
                      >
                        {ESTADOS_OT[ot.estado]}
                      </span>
                    </td>
                    <td style={td}>{ot.fecha_solicitud}</td>
                    <td style={td}>{ot.fecha_aplicacion || "—"}</td>
                    <td style={td}>{ot.funcion?.join(", ") || "—"}</td>
                    <td style={{ ...td, color: "#6b7280" }}>
                      {ot.ot_cuarteles?.map(c => c.cuartel?.codigo).filter(Boolean).join(", ") || "—"}
                    </td>
                    <td style={td}>
                      <Link href={`/ordenes/${ot.id}?empresa=${empresaId}`} style={viewLink}>
                        Ver →
                      </Link>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ ...td, textAlign: "center", color: "#9ca3af", padding: "30px" }}>
                      No hay órdenes con este estado.
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
const filterBar: React.CSSProperties = { display: "flex", gap: "6px", marginBottom: "16px", flexWrap: "wrap" };
const filterBtn: React.CSSProperties = { padding: "6px 14px", borderRadius: "999px", border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: "13px", cursor: "pointer" };
const table: React.CSSProperties = { width: "100%", background: "#fff", borderRadius: "14px", overflow: "hidden", border: "1px solid #e5e7eb" };
const th: React.CSSProperties = { padding: "10px 12px", background: "#f0f4f2", fontWeight: 700, fontSize: "12px", color: "#374151", textAlign: "left", whiteSpace: "nowrap", borderBottom: "1px solid #e5e7eb" };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: "13px", color: "#374151", borderBottom: "1px solid #f3f4f6" };
const estadoPill: React.CSSProperties = { padding: "3px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: 700 };
const viewLink: React.CSSProperties = { fontWeight: 700, fontSize: "13px", color: "#1a4731" };
import { Suspense } from "react"; export default function OrdenesPage() { return <Suspense><OrdenesContent /></Suspense>; }
