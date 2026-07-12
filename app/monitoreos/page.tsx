"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import Nav from "@/lib/nav";
import type { Empresa, MonitoreoSesion, MonitoreoEstado } from "@/lib/types";
import { ESTADOS_MONITOREO, ESTADOS_MONITOREO_COLOR } from "@/lib/types";

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function MonitoreosContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const empresaParam = searchParams.get("empresa") || "";

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaId, setEmpresaId] = useState(empresaParam);
  const [sesiones, setSesiones] = useState<MonitoreoSesion[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState<MonitoreoEstado | "todas">("todas");

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
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
      .from("monitoreos")
      .select(
        "*, cuartel:cuarteles(codigo,especie,variedad), monitor:personal!monitor_id(nombre)"
      )
      .eq("empresa_id", eid)
      .order("fecha", { ascending: false })
      .order("numero", { ascending: false });
    setSesiones((data as MonitoreoSesion[]) || []);
    setLoading(false);
  };

  const switchEmpresa = (eid: string) => {
    setEmpresaId(eid);
    router.push(`/monitoreos?empresa=${eid}`);
    load(eid);
  };

  const filtered =
    filtroEstado === "todas"
      ? sesiones
      : sesiones.filter((s) => s.estado === filtroEstado);

  const pendientes = sesiones.filter((s) => s.estado === "enviado");
  const empresa = empresas.find((e) => e.id === empresaId);

  const estadosFiltro: Array<MonitoreoEstado | "todas"> = [
    "todas",
    "borrador",
    "enviado",
    "revisado",
  ];

  return (
    <>
      <Nav empresaId={empresaId} />
      <main style={container}>
        {/* Selector empresa */}
        <div style={empresaBar}>
          {empresas.map((e) => (
            <button
              key={e.id}
              onClick={() => switchEmpresa(e.id)}
              style={{
                ...empresaBtn,
                ...(e.id === empresaId ? empresaBtnActive : {}),
              }}
            >
              {e.nombre}
            </button>
          ))}
        </div>

        {/* Header */}
        <div style={pageHeader}>
          <div>
            <h1 style={pageTitle}>Monitoreos — {empresa?.nombre}</h1>
            <p style={pageSub}>{sesiones.length} sesiones registradas</p>
          </div>
          <Link href={`/monitoreos/nueva?empresa=${empresaId}`} style={primaryBtn}>
            + Nueva sesión
          </Link>
        </div>

        {/* Alerta pendientes de revisión */}
        {pendientes.length > 0 && (
          <div style={alertaBanner}>
            <span style={{ fontWeight: 700, fontSize: "14px" }}>
              ⏳ {pendientes.length} sesión{pendientes.length > 1 ? "es" : ""} pendiente
              {pendientes.length > 1 ? "s" : ""} de revisión
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "8px" }}>
              {pendientes.map((s) => (
                <Link
                  key={s.id}
                  href={`/monitoreos/${s.id}?empresa=${empresaId}`}
                  style={alertaPill}
                >
                  #{s.numero} · {s.cuartel?.codigo} · {fmtDate(s.fecha)} →
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Filtros */}
        <div style={filterBar}>
          {estadosFiltro.map((e) => {
            const active = filtroEstado === e;
            const color =
              e === "todas"
                ? "#1a4731"
                : ESTADOS_MONITOREO_COLOR[e as MonitoreoEstado];
            return (
              <button
                key={e}
                onClick={() => setFiltroEstado(e)}
                style={{
                  ...filterBtn,
                  ...(active
                    ? { background: color, color: "#fff", borderColor: color }
                    : {}),
                }}
              >
                {e === "todas"
                  ? "Todas"
                  : e === "enviado"
                  ? "Pendientes"
                  : e.charAt(0).toUpperCase() + e.slice(1)}
                {e === "enviado" && pendientes.length > 0 && (
                  <span style={badge}>{pendientes.length}</span>
                )}
              </button>
            );
          })}
        </div>

        {loading ? (
          <p style={{ color: "#6b7280", marginTop: "20px" }}>Cargando...</p>
        ) : filtered.length === 0 ? (
          <div style={emptyState}>
            <p style={{ color: "#9ca3af", fontSize: "14px" }}>
              {empresaId
                ? "No hay sesiones de monitoreo con este filtro."
                : "Seleccioná una empresa."}
            </p>
            {empresaId && (
              <Link href={`/monitoreos/nueva?empresa=${empresaId}`} style={primaryBtn}>
                + Nueva sesión de monitoreo
              </Link>
            )}
          </div>
        ) : (
          <div style={grid}>
            {filtered.map((s) => {
              const color = ESTADOS_MONITOREO_COLOR[s.estado];
              const lineas = s.lineas || [];
              const problemas = lineas.filter((l) => l.incidencia > 0).length;
              const altos = lineas.filter((l) => l.incidencia >= 3).length;
              return (
                <Link
                  key={s.id}
                  href={`/monitoreos/${s.id}?empresa=${empresaId}`}
                  style={card}
                >
                  <div style={cardTop}>
                    <span style={cardNum}>MON-{String(s.numero).padStart(3, "0")}</span>
                    <span
                      style={{
                        ...estadoPill,
                        background: color + "18",
                        color,
                        borderColor: color + "40",
                      }}
                    >
                      {s.estado === "enviado"
                        ? "Pendiente revisión"
                        : s.estado.charAt(0).toUpperCase() + s.estado.slice(1)}
                    </span>
                  </div>
                  <div style={cardInfo}>
                    <span style={cardCuartel}>
                      {s.cuartel?.codigo || "—"}
                    </span>
                    <span style={cardEspecie}>
                      {s.especie} · {s.cuartel?.variedad || ""}
                    </span>
                  </div>
                  <div style={cardMeta}>
                    <span>📅 {fmtDate(s.fecha)}</span>
                    {s.monitor && <span>👤 {(s.monitor as unknown as { nombre: string }).nombre}</span>}
                  </div>
                  <div style={cardFeno}>{s.estado_fenologico}</div>
                  {problemas > 0 && (
                    <div style={cardProblemas}>
                      {altos > 0 && (
                        <span style={{ ...problemaBadge, background: "#fef2f2", color: "#dc2626", borderColor: "#fca5a580" }}>
                          🔴 {altos} alto{altos > 1 ? "s" : ""}
                        </span>
                      )}
                      <span style={{ ...problemaBadge, background: "#fff7ed", color: "#ea580c", borderColor: "#fdba7480" }}>
                        {problemas} con presencia
                      </span>
                    </div>
                  )}
                  <div style={cardLink}>Ver detalle →</div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}

export default function MonitoreosPage() {
  return (
    <Suspense>
      <MonitoreosContent />
    </Suspense>
  );
}

// ── Estilos ────────────────────────────────────────────────────────────────
const container: React.CSSProperties = { maxWidth: "1200px", margin: "0 auto", padding: "28px 20px" };
const empresaBar: React.CSSProperties = { display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" };
const empresaBtn: React.CSSProperties = { padding: "8px 18px", borderRadius: "999px", border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: "13px", cursor: "pointer" };
const empresaBtnActive: React.CSSProperties = { background: "#1a4731", border: "1.5px solid #1a4731", color: "#fff" };
const pageHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", flexWrap: "wrap", gap: "12px" };
const pageTitle: React.CSSProperties = { fontSize: "24px", fontWeight: 800, color: "#1a4731" };
const pageSub: React.CSSProperties = { fontSize: "13px", color: "#6b7280", marginTop: "4px" };
const primaryBtn: React.CSSProperties = { padding: "10px 20px", borderRadius: "10px", background: "#1a4731", color: "#fff", fontWeight: 700, fontSize: "14px", textDecoration: "none", display: "inline-block" };
const alertaBanner: React.CSSProperties = { background: "#fffbeb", border: "1.5px solid #fcd34d", borderRadius: "12px", padding: "14px 18px", marginBottom: "18px" };
const alertaPill: React.CSSProperties = { padding: "5px 14px", borderRadius: "999px", background: "#fef3c7", color: "#92400e", fontSize: "13px", fontWeight: 700, textDecoration: "none", border: "1px solid #fcd34d" };
const filterBar: React.CSSProperties = { display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" };
const filterBtn: React.CSSProperties = { padding: "7px 16px", borderRadius: "999px", border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" };
const badge: React.CSSProperties = { background: "#d97706", color: "#fff", borderRadius: "999px", fontSize: "11px", fontWeight: 700, padding: "1px 7px" };
const emptyState: React.CSSProperties = { textAlign: "center", padding: "60px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" };
const card: React.CSSProperties = { background: "#fff", borderRadius: "14px", border: "1px solid #e5e7eb", padding: "18px", display: "flex", flexDirection: "column", gap: "10px", textDecoration: "none", color: "inherit", transition: "box-shadow 0.15s", cursor: "pointer" };
const cardTop: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center" };
const cardNum: React.CSSProperties = { fontWeight: 800, fontSize: "15px", color: "#1a4731" };
const estadoPill: React.CSSProperties = { padding: "3px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 700, border: "1px solid" };
const cardInfo: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "2px" };
const cardCuartel: React.CSSProperties = { fontWeight: 700, fontSize: "17px", color: "#111827" };
const cardEspecie: React.CSSProperties = { fontSize: "13px", color: "#6b7280" };
const cardMeta: React.CSSProperties = { display: "flex", gap: "12px", flexWrap: "wrap", fontSize: "13px", color: "#6b7280" };
const cardFeno: React.CSSProperties = { fontSize: "12px", color: "#374151", background: "#f3f4f6", borderRadius: "6px", padding: "4px 8px" };
const cardProblemas: React.CSSProperties = { display: "flex", gap: "6px", flexWrap: "wrap" };
const problemaBadge: React.CSSProperties = { padding: "3px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: 700, border: "1px solid" };
const cardLink: React.CSSProperties = { fontSize: "13px", fontWeight: 700, color: "#1a4731", marginTop: "4px" };
