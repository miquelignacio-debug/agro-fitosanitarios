"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Nav from "@/lib/nav";
import { FUNCIONES_FITOSANITARIAS } from "@/lib/types";

const UNIDADES = ["lt/ha", "cc/ha", "kg/ha", "g/ha", "g/100lt", "cc/100lt", "lt/100lt"];

import { Suspense } from "react";
function NuevoProductoContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const empresa = searchParams.get("empresa") || "";

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [nombre, setNombre] = useState("");
  const [registro, setRegistro] = useState("");
  const [ia, setIa] = useState("");
  const [concentracionIa, setConcentracionIa] = useState("");
  const [formulacion, setFormulacion] = useState("");
  const [funciones, setFunciones] = useState<string[]>([]);
  const [unidadDosis, setUnidadDosis] = useState("lt/ha");
  const [unidadBodega, setUnidadBodega] = useState<"lt" | "kg">("lt");
  const [phi, setPhi] = useState("0");
  const [rei, setRei] = useState("0");
  const [especiesRaw, setEspeciesRaw] = useState("");
  const [maxIa, setMaxIa] = useState("");

  const toggleFuncion = (f: string) =>
    setFunciones((prev) => prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]);

  const handleSave = async () => {
    setError("");
    if (!nombre.trim()) { setError("El nombre comercial es obligatorio."); return; }
    setSaving(true);

    const especies = especiesRaw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const { error: err } = await supabase.from("productos").insert({
      nombre_comercial: nombre.trim(),
      numero_registro: registro.trim() || null,
      ingrediente_activo: ia.trim() || null,
      concentracion_ia: concentracionIa.trim() || null,
      unidad_bodega: unidadBodega,
      formulacion: formulacion.trim() || null,
      tipo_funcion: funciones.length ? funciones : null,
      unidad_dosis: unidadDosis,
      phi_dias: parseInt(phi) || 0,
      rei_horas: parseInt(rei) || 0,
      especies_autorizadas: especies.length ? especies : null,
      max_ia_descripcion: maxIa.trim() || null,
      fuente: "manual",
    });

    setSaving(false);
    if (err) { setError(err.message); return; }
    router.push(`/productos${empresa ? `?empresa=${empresa}` : ""}`);
  };

  return (
    <>
      <Nav empresaId={empresa} />
      <main style={container}>
        <div style={pageHeader}>
          <div>
            <h1 style={pageTitle}>Nuevo producto</h1>
            <p style={pageSubtitle}>Ingreso manual al catálogo</p>
          </div>
        </div>

        <div style={formCard}>
          <section style={section}>
            <h2 style={sectionTitle}>Identificación</h2>
            <div style={grid2}>
              <Field label="Nombre comercial *">
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} style={inputStyle} placeholder="Ej. Score 250 EC" />
              </Field>
              <Field label="N° Registro SAG">
                <input value={registro} onChange={(e) => setRegistro(e.target.value)} style={inputStyle} placeholder="Ej. PR-0001234" />
              </Field>
              <Field label="Ingrediente activo">
                <input value={ia} onChange={(e) => setIa(e.target.value)} style={inputStyle} placeholder="Ej. Difenoconazol" />
              </Field>
              <Field label="Concentración IA (GGAP)">
                <input value={concentracionIa} onChange={(e) => setConcentracionIa(e.target.value)} style={inputStyle} placeholder="Ej. 250 g/L" />
              </Field>
              <Field label="Formulación">
                <input value={formulacion} onChange={(e) => setFormulacion(e.target.value)} style={inputStyle} placeholder="Ej. CE, SC, WG..." />
              </Field>
            </div>
          </section>

          <section style={section}>
            <h2 style={sectionTitle}>Función fitosanitaria</h2>
            <div style={chipRow}>
              {FUNCIONES_FITOSANITARIAS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => toggleFuncion(f)}
                  style={{ ...chip, ...(funciones.includes(f) ? chipActive : {}) }}
                >
                  {f}
                </button>
              ))}
            </div>
          </section>

          <section style={section}>
            <h2 style={sectionTitle}>Dosis y seguridad</h2>
            <div style={grid3}>
              <Field label="Unidad de dosis (OT)">
                <select value={unidadDosis} onChange={(e) => setUnidadDosis(e.target.value)} style={inputStyle}>
                  {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </Field>
              <Field label="Unidad de bodega *">
                <select value={unidadBodega} onChange={(e) => setUnidadBodega(e.target.value as "lt" | "kg")} style={inputStyle}>
                  <option value="lt">Litros (Lt)</option>
                  <option value="kg">Kilos (Kg)</option>
                </select>
              </Field>
              <Field label="PHI (días carencia)">
                <input type="number" min="0" value={phi} onChange={(e) => setPhi(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="REI (horas reingreso)">
                <input type="number" min="0" value={rei} onChange={(e) => setRei(e.target.value)} style={inputStyle} />
              </Field>
            </div>
          </section>

          <section style={section}>
            <h2 style={sectionTitle}>Especies autorizadas</h2>
            <Field label="Una por línea o separadas por coma">
              <textarea
                value={especiesRaw}
                onChange={(e) => setEspeciesRaw(e.target.value)}
                style={{ ...inputStyle, height: "80px", resize: "vertical" }}
                placeholder={"Cereza\nVid de mesa\nManzana"}
              />
            </Field>
            <Field label="Restricción máxima IA (texto libre)">
              <input value={maxIa} onChange={(e) => setMaxIa(e.target.value)} style={inputStyle} placeholder="Ej. Máx. 3 aplicaciones por temporada" />
            </Field>
          </section>

          {error && <p style={errorStyle}>{error}</p>}

          <div style={footer}>
            <button
              type="button"
              onClick={() => router.push(`/productos${empresa ? `?empresa=${empresa}` : ""}`)}
              style={cancelBtn}
            >
              Cancelar
            </button>
            <button onClick={handleSave} style={saveBtn} disabled={saving}>
              {saving ? "Guardando..." : "Guardar producto"}
            </button>
          </div>
        </div>
      </main>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

const container: React.CSSProperties = { maxWidth: "860px", margin: "0 auto", padding: "28px 20px" };
const pageHeader: React.CSSProperties = { marginBottom: "24px" };
const pageTitle: React.CSSProperties = { fontSize: "24px", fontWeight: 800, color: "#1a4731" };
const pageSubtitle: React.CSSProperties = { fontSize: "13px", color: "#6b7280", marginTop: "4px" };
const formCard: React.CSSProperties = { background: "#fff", borderRadius: "16px", border: "1px solid #e5e7eb", overflow: "hidden" };
const section: React.CSSProperties = { padding: "24px 28px", borderBottom: "1px solid #f3f4f6" };
const sectionTitle: React.CSSProperties = { fontSize: "14px", fontWeight: 700, color: "#1a4731", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.05em" };
const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" };
const grid3: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" };
const labelStyle: React.CSSProperties = { fontSize: "12px", fontWeight: 700, color: "#374151" };
const inputStyle: React.CSSProperties = { padding: "9px 12px", borderRadius: "8px", border: "1.5px solid #d1d5db", fontSize: "14px", background: "#fafafa", color: "#111", width: "100%", boxSizing: "border-box" };
const chipRow: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: "8px" };
const chip: React.CSSProperties = { padding: "5px 12px", borderRadius: "999px", border: "1.5px solid #d1d5db", background: "#fff", fontSize: "12px", fontWeight: 600, cursor: "pointer", color: "#374151" };
const chipActive: React.CSSProperties = { background: "#1a4731", color: "#fff", borderColor: "#1a4731" };
const footer: React.CSSProperties = { padding: "20px 28px", display: "flex", justifyContent: "flex-end", gap: "10px" };
const errorStyle: React.CSSProperties = { margin: "0 28px 12px", fontSize: "13px", color: "#dc2626", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", padding: "10px 14px" };
const cancelBtn: React.CSSProperties = { padding: "9px 20px", borderRadius: "8px", border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: "14px", cursor: "pointer" };
const saveBtn: React.CSSProperties = { padding: "9px 20px", borderRadius: "8px", background: "#1a4731", color: "#fff", fontWeight: 700, fontSize: "14px", border: "none", cursor: "pointer" };
export default function NuevoProductoPage() { return <Suspense><NuevoProductoContent /></Suspense>; }
