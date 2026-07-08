"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Nav from "@/lib/nav";
import type { Empresa, Producto, Usuario } from "@/lib/types";

import { Suspense } from "react";
function IngresoContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const empresaId = searchParams.get("empresa") || "";

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  // Form
  const [selectedEmpresa, setSelectedEmpresa] = useState(empresaId);
  const [productoId, setProductoId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [unidad, setUnidad] = useState("lt");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [docTipo, setDocTipo] = useState<"guia_despacho" | "factura">("guia_despacho");
  const [docNumero, setDocNumero] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [notas, setNotas] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [catalogProv, setCatalogProv] = useState<string[]>([]);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const [{ data: emp }, { data: prod }, { data: usr }, { data: prov }] = await Promise.all([
        supabase.from("empresas").select("*").order("nombre"),
        supabase.from("productos").select("*").eq("activo", true).order("nombre_comercial"),
        supabase.from("usuarios").select("*").eq("id", user.id).single(),
        supabase.from("proveedores").select("nombre").eq("activo", true).order("nombre"),
      ]);
      setCatalogProv((prov || []).map((r: { nombre: string }) => r.nombre));
      setEmpresas((emp as Empresa[]) || []);
      setProductos((prod as Producto[]) || []);
      setUsuario(usr as Usuario);
      if (!selectedEmpresa && emp?.length) setSelectedEmpresa(emp[0].id);
    };
    init();
  }, []);

  const productosFiltrados = busqueda
    ? productos.filter((p) => p.nombre_comercial.toLowerCase().includes(busqueda.toLowerCase()))
    : productos;

  const handleSave = async () => {
    setError("");
    if (!selectedEmpresa) { setError("Seleccioná una empresa."); return; }
    if (!productoId) { setError("Seleccioná un producto."); return; }
    if (!cantidad || parseFloat(cantidad) <= 0) { setError("La cantidad debe ser mayor a 0."); return; }
    if (!docNumero.trim()) { setError(`El número de ${docTipo === "guia_despacho" ? "guía de despacho" : "factura"} es obligatorio.`); return; }

    setSaving(true);
    const { error: err } = await supabase.from("stock_movimientos").insert({
      empresa_id: selectedEmpresa,
      producto_id: productoId,
      tipo: "entrada",
      cantidad: parseFloat(cantidad),
      unidad,
      fecha,
      documento_tipo: docTipo,
      documento_numero: docNumero.trim(),
      proveedor: proveedor.trim() || null,
      notas: notas.trim() || null,
      usuario_id: usuario?.id || null,
    });

    setSaving(false);
    if (err) { setError(err.message); return; }
    setSaved(true);
    setTimeout(() => router.push(`/bodega${selectedEmpresa ? `?empresa=${selectedEmpresa}` : ""}`), 1200);
  };

  const productoSel = productos.find((p) => p.id === productoId);

  return (
    <>
      <Nav empresaId={empresaId} />
      <main style={container}>
        <div style={pageHeader}>
          <h1 style={pageTitle}>Ingreso a bodega</h1>
          <p style={pageSubtitle}>Requiere guía de despacho o número de factura</p>
        </div>

        <div style={formCard}>
          {/* Empresa */}
          <section style={section}>
            <h2 style={sectionTitle}>Empresa</h2>
            <div style={grid2}>
              <Field label="Empresa *">
                <select value={selectedEmpresa} onChange={(e) => setSelectedEmpresa(e.target.value)} style={inputStyle}>
                  <option value="">— Seleccionar —</option>
                  {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
              </Field>
              <Field label="Fecha *">
                <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={inputStyle} />
              </Field>
            </div>
          </section>

          {/* Documento */}
          <section style={section}>
            <h2 style={sectionTitle}>Documento de respaldo</h2>
            <div style={grid2}>
              <Field label="Tipo de documento *">
                <div style={radioRow}>
                  <label style={radioLabel}>
                    <input type="radio" checked={docTipo === "guia_despacho"} onChange={() => setDocTipo("guia_despacho")} />
                    Guía de despacho
                  </label>
                  <label style={radioLabel}>
                    <input type="radio" checked={docTipo === "factura"} onChange={() => setDocTipo("factura")} />
                    Factura
                  </label>
                </div>
              </Field>
              <Field label={`N° ${docTipo === "guia_despacho" ? "Guía de despacho" : "Factura"} *`}>
                <input
                  value={docNumero}
                  onChange={(e) => setDocNumero(e.target.value)}
                  style={inputStyle}
                  placeholder={docTipo === "guia_despacho" ? "Ej. GD-12345" : "Ej. 001-00456"}
                />
              </Field>
            </div>
            <div style={{ marginTop: "14px" }}>
              <Field label="Proveedor">
                <input
                  list="catalog-proveedores"
                  value={proveedor}
                  onChange={(e) => setProveedor(e.target.value)}
                  style={inputStyle}
                  placeholder="Buscar o escribir proveedor..."
                />
                <datalist id="catalog-proveedores">
                  {catalogProv.map(n => <option key={n} value={n} />)}
                </datalist>
              </Field>
            </div>
          </section>

          {/* Producto */}
          <section style={section}>
            <h2 style={sectionTitle}>Producto</h2>
            <Field label="Buscar producto">
              <input
                value={busqueda}
                onChange={(e) => { setBusqueda(e.target.value); setProductoId(""); }}
                style={inputStyle}
                placeholder="Escribí para filtrar..."
              />
            </Field>
            <div style={{ marginTop: "10px", maxHeight: "220px", overflowY: "auto", border: "1.5px solid #d1d5db", borderRadius: "8px" }}>
              {productosFiltrados.length === 0 ? (
                <p style={{ padding: "12px 14px", color: "#6b7280", fontSize: "13px" }}>Sin resultados</p>
              ) : (
                productosFiltrados.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => { setProductoId(p.id); setBusqueda(p.nombre_comercial); }}
                    style={{
                      ...prodRow,
                      ...(productoId === p.id ? prodRowActive : {}),
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{p.nombre_comercial}</span>
                    {p.ingrediente_activo && <span style={{ color: "#6b7280", fontSize: "12px" }}> — {p.ingrediente_activo}</span>}
                    {p.especies_autorizadas && (
                      <span style={{ fontSize: "11px", color: "#9ca3af", marginLeft: "8px" }}>
                        ({p.especies_autorizadas.join(", ")})
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>

            {productoSel && (
              <div style={{ marginTop: "14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <Field label="Cantidad *">
                  <input type="number" min="0" step="0.01" value={cantidad} onChange={(e) => setCantidad(e.target.value)} style={inputStyle} placeholder="0.00" />
                </Field>
                <Field label="Unidad">
                  <select value={unidad} onChange={(e) => setUnidad(e.target.value)} style={inputStyle}>
                    {["lt", "kg", "g", "ml", "unidad"].map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </Field>
              </div>
            )}
          </section>

          {/* Notas */}
          <section style={{ ...section, borderBottom: "none" }}>
            <h2 style={sectionTitle}>Notas</h2>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              style={{ ...inputStyle, height: "70px", resize: "vertical" }}
              placeholder="Observaciones opcionales..."
            />
          </section>

          {error && <p style={errorStyle}>{error}</p>}
          {saved && <p style={successStyle}>✓ Ingreso registrado correctamente</p>}

          <div style={footerRow}>
            <button onClick={() => router.push(`/bodega${empresaId ? `?empresa=${empresaId}` : ""}`)} style={cancelBtn}>
              Cancelar
            </button>
            <button onClick={handleSave} style={saveBtn} disabled={saving || saved}>
              {saving ? "Guardando..." : "Registrar ingreso"}
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

const container: React.CSSProperties = { maxWidth: "780px", margin: "0 auto", padding: "28px 20px" };
const pageHeader: React.CSSProperties = { marginBottom: "24px" };
const pageTitle: React.CSSProperties = { fontSize: "24px", fontWeight: 800, color: "#1a4731" };
const pageSubtitle: React.CSSProperties = { fontSize: "13px", color: "#6b7280", marginTop: "4px" };
const formCard: React.CSSProperties = { background: "#fff", borderRadius: "16px", border: "1px solid #e5e7eb", overflow: "hidden" };
const section: React.CSSProperties = { padding: "22px 26px", borderBottom: "1px solid #f3f4f6" };
const sectionTitle: React.CSSProperties = { fontSize: "13px", fontWeight: 700, color: "#1a4731", marginBottom: "14px", textTransform: "uppercase", letterSpacing: "0.05em" };
const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" };
const labelStyle: React.CSSProperties = { fontSize: "12px", fontWeight: 700, color: "#374151" };
const inputStyle: React.CSSProperties = { padding: "9px 12px", borderRadius: "8px", border: "1.5px solid #d1d5db", fontSize: "14px", background: "#fafafa", color: "#111", width: "100%", boxSizing: "border-box" };
const radioRow: React.CSSProperties = { display: "flex", gap: "20px", alignItems: "center", paddingTop: "8px" };
const radioLabel: React.CSSProperties = { display: "flex", gap: "6px", alignItems: "center", fontSize: "14px", cursor: "pointer" };
const prodRow: React.CSSProperties = { padding: "10px 14px", cursor: "pointer", fontSize: "13px", borderBottom: "1px solid #f3f4f6", transition: "background 0.1s" };
const prodRowActive: React.CSSProperties = { background: "#f0fdf4", borderLeft: "3px solid #1a4731" };
const errorStyle: React.CSSProperties = { margin: "0 26px 12px", fontSize: "13px", color: "#dc2626", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", padding: "10px 14px" };
const successStyle: React.CSSProperties = { margin: "0 26px 12px", fontSize: "13px", color: "#15803d", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: "8px", padding: "10px 14px" };
const footerRow: React.CSSProperties = { padding: "18px 26px", display: "flex", justifyContent: "flex-end", gap: "10px" };
const cancelBtn: React.CSSProperties = { padding: "9px 20px", borderRadius: "8px", border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: "14px", cursor: "pointer" };
const saveBtn: React.CSSProperties = { padding: "9px 20px", borderRadius: "8px", background: "#1a4731", color: "#fff", fontWeight: 700, fontSize: "14px", border: "none", cursor: "pointer" };
export default function IngresoPage() { return <Suspense><IngresoContent /></Suspense>; }
