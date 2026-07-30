"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import Nav from "@/lib/nav";
import { useEmpresa } from "@/lib/useEmpresa";
import { useRol } from "@/lib/useRol";

type Programa = {
  id: string;
  nombre: string;
  temporada: string;
  activo: boolean;
  created_at: string;
  programa_etapas: { id: string }[];
  programa_cuarteles: { cuartel_id: string; cuartel: { codigo: string } | null }[];
};

function ProgramaListContent() {
  const router = useRouter();
  const { empresaId } = useEmpresa();
  const { isSuperAdmin, rol } = useRol();
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!empresaId || rol === null) return;
    if (!isSuperAdmin) { router.push("/dashboard"); return; }
    const load = async () => {
      const { data } = await supabase
        .from("programas_fitosanitarios")
        .select("id, nombre, temporada, activo, created_at, programa_etapas(id), programa_cuarteles(cuartel_id, cuartel:cuarteles(codigo))")
        .eq("empresa_id", empresaId)
        .order("created_at", { ascending: false });
      setProgramas((data as unknown as Programa[]) || []);
      setLoading(false);
    };
    load();
  }, [empresaId, isSuperAdmin, router]);

  if (rol === null) return null;

  return (
    <>
      <Nav />
      <main style={container}>
        <div style={header}>
          <div>
            <h1 style={title}>Programa Fitosanitario</h1>
            <p style={subtitle}>Gestión de programas de aplicación por temporada · Solo superadmin</p>
          </div>
          <Link href="/programa-fitosanitario/nuevo" style={primaryBtn}>+ Nuevo programa</Link>
        </div>

        {loading ? (
          <p style={{ color: "#6b7280", marginTop: "24px" }}>Cargando...</p>
        ) : programas.length === 0 ? (
          <div style={emptyBox}>
            <div style={{ fontSize: "40px", marginBottom: "12px" }}>📋</div>
            <div style={{ fontWeight: 700, color: "#1a4731", marginBottom: "6px" }}>Sin programas cargados</div>
            <div style={{ color: "#6b7280", fontSize: "13px", marginBottom: "16px" }}>Creá el primer programa fitosanitario de la temporada.</div>
            <Link href="/programa-fitosanitario/nuevo" style={primaryBtn}>+ Nuevo programa</Link>
          </div>
        ) : (
          <div style={grid}>
            {programas.map(p => (
              <Link key={p.id} href={`/programa-fitosanitario/${p.id}`} style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: "16px", color: "#1a4731" }}>{p.nombre}</div>
                    <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>Temporada {p.temporada}</div>
                  </div>
                  <span style={{ ...badge, background: p.activo ? "#dcfce7" : "#f3f4f6", color: p.activo ? "#15803d" : "#6b7280" }}>
                    {p.activo ? "Activo" : "Inactivo"}
                  </span>
                </div>

                <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginTop: "12px" }}>
                  <div style={stat}>
                    <span style={statNum}>{p.programa_etapas.length}</span>
                    <span style={statLabel}>etapas</span>
                  </div>
                  <div style={stat}>
                    <span style={statNum}>{p.programa_cuarteles.length}</span>
                    <span style={statLabel}>cuarteles</span>
                  </div>
                </div>

                {p.programa_cuarteles.length > 0 && (
                  <div style={{ marginTop: "10px", display: "flex", gap: "4px", flexWrap: "wrap" }}>
                    {p.programa_cuarteles.slice(0, 6).map(pc => (
                      <span key={pc.cuartel_id} style={cuartelChip}>
                        {pc.cuartel?.codigo ?? "—"}
                      </span>
                    ))}
                    {p.programa_cuarteles.length > 6 && (
                      <span style={cuartelChip}>+{p.programa_cuarteles.length - 6}</span>
                    )}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

export default function ProgramaFitosanitarioPage() {
  return <Suspense><ProgramaListContent /></Suspense>;
}

// ── Estilos ──────────────────────────────────────────────────────────────────
const container: React.CSSProperties = { maxWidth: "1100px", margin: "0 auto", padding: "28px 20px" };
const header: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px", flexWrap: "wrap", gap: "12px" };
const title: React.CSSProperties = { fontSize: "24px", fontWeight: 800, color: "#1a4731" };
const subtitle: React.CSSProperties = { fontSize: "13px", color: "#6b7280", marginTop: "4px" };
const primaryBtn: React.CSSProperties = { background: "#1a4731", color: "#fff", padding: "9px 20px", borderRadius: "8px", fontWeight: 700, fontSize: "14px", textDecoration: "none", display: "inline-block" };
const emptyBox: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: "16px", padding: "48px 32px", textAlign: "center", marginTop: "24px" };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" };
const card: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: "14px", padding: "20px", textDecoration: "none", display: "block", transition: "box-shadow 0.15s", cursor: "pointer" };
const badge: React.CSSProperties = { padding: "3px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 700 };
const stat: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center" };
const statNum: React.CSSProperties = { fontSize: "22px", fontWeight: 800, color: "#1a4731" };
const statLabel: React.CSSProperties = { fontSize: "11px", color: "#6b7280" };
const cuartelChip: React.CSSProperties = { background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0", borderRadius: "6px", padding: "2px 8px", fontSize: "11px", fontWeight: 600 };