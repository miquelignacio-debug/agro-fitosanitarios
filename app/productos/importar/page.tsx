"use client";

import { useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Nav from "@/lib/nav";

type FilaImport = {
  nombre_comercial: string;
  numero_registro: string;
  ingrediente_activo: string;
  tipo_funcion: string[];
  formulacion: string;
  phi_dias: number;
  rei_horas: number;
  especies_autorizadas: string[];
  max_ia_descripcion: string;
  _seleccionado: boolean;
  _error?: string;
};

import { Suspense } from "react";
function ImportarSAGContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const empresa = searchParams.get("empresa") || "";
  const fileRef = useRef<HTMLInputElement>(null);

  const [filas, setFilas] = useState<FilaImport[]>([]);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: number; err: number } | null>(null);
  const [errorGlobal, setErrorGlobal] = useState("");

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorGlobal("");
    setResultado(null);

    try {
      const { read, utils } = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: Record<string, string>[] = utils.sheet_to_json(ws, { defval: "" });

      if (!rows.length) { setErrorGlobal("El archivo no tiene filas de datos."); return; }

      // Mapear columnas — el SAG usa nombres en español
      // Intentamos detectar los encabezados flexiblemente
      const sample = rows[0];
      const keys = Object.keys(sample);

      const col = (candidates: string[]) => {
        const found = keys.find((k) =>
          candidates.some((c) => k.toLowerCase().replace(/\s+/g, " ").includes(c.toLowerCase()))
        );
        return found || "";
      };

      const kNombre   = col(["nombre comercial", "nombre_comercial", "producto", "nombre"]);
      const kRegistro = col(["registro", "n° registro", "numero registro", "reg"]);
      const kIA       = col(["ingrediente activo", "ingrediente_activo", "ia", "materia activa"]);
      const kFuncion  = col(["tipo", "función", "funcion", "grupo", "acción"]);
      const kFormul   = col(["formulacion", "formulación", "forma"]);
      const kPhi      = col(["phi", "carencia", "dias carencia"]);
      const kRei      = col(["rei", "reentrada", "re-entrada"]);
      const kEspecies = col(["especie", "cultivo", "especies autorizadas", "uso autorizado"]);

      const parsed: FilaImport[] = rows
        .map((r) => {
          const nombre = String(r[kNombre] || "").trim();
          if (!nombre) return null;

          const especiesRaw = String(r[kEspecies] || "");
          const especies = especiesRaw
            .split(/[,;\/]/)
            .map((s) => s.trim())
            .filter(Boolean);

          const funcionRaw = String(r[kFuncion] || "");
          const funciones = funcionRaw
            .split(/[,;\/]/)
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean);

          return {
            nombre_comercial: nombre,
            numero_registro: String(r[kRegistro] || "").trim(),
            ingrediente_activo: String(r[kIA] || "").trim(),
            tipo_funcion: funciones,
            formulacion: String(r[kFormul] || "").trim(),
            phi_dias: parseInt(String(r[kPhi] || "0")) || 0,
            rei_horas: parseInt(String(r[kRei] || "0")) || 0,
            especies_autorizadas: especies,
            max_ia_descripcion: "",
            _seleccionado: true,
          } as FilaImport;
        })
        .filter(Boolean) as FilaImport[];

      setFilas(parsed);
    } catch (err: unknown) {
      setErrorGlobal("Error al leer el archivo: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const toggleTodos = (val: boolean) =>
    setFilas((f) => f.map((r) => ({ ...r, _seleccionado: val })));

  const toggleFila = (i: number) =>
    setFilas((f) => f.map((r, idx) => idx === i ? { ...r, _seleccionado: !r._seleccionado } : r));

  const handleImportar = async () => {
    const seleccionadas = filas.filter((f) => f._seleccionado);
    if (!seleccionadas.length) { setErrorGlobal("Seleccioná al menos un producto."); return; }

    setImportando(true);
    setErrorGlobal("");

    let ok = 0, err = 0;
    for (const fila of seleccionadas) {
      const { error } = await supabase.from("productos").upsert(
        {
          nombre_comercial: fila.nombre_comercial,
          numero_registro: fila.numero_registro || null,
          ingrediente_activo: fila.ingrediente_activo || null,
          tipo_funcion: fila.tipo_funcion.length ? fila.tipo_funcion : null,
          formulacion: fila.formulacion || null,
          phi_dias: fila.phi_dias,
          rei_horas: fila.rei_horas,
          especies_autorizadas: fila.especies_autorizadas.length ? fila.especies_autorizadas : null,
          max_ia_descripcion: fila.max_ia_descripcion || null,
          fuente: "sag",
          activo: true,
        },
        { onConflict: "numero_registro", ignoreDuplicates: false }
      );
      if (error) err++; else ok++;
    }

    setImportando(false);
    setResultado({ ok, err });
  };

  const selCount = filas.filter((f) => f._seleccionado).length;

  return (
    <>
      <Nav empresaId={empresa} />
      <main style={container}>
        <div style={pageHeader}>
          <div>
            <h1 style={pageTitle}>Importar desde Excel SAG</h1>
            <p style={pageSubtitle}>
              Cargá el archivo Excel publicado por el SAG con el catastro de productos autorizados
            </p>
          </div>
        </div>

        {/* Upload zone */}
        <div
          style={dropzone}
          onClick={() => fileRef.current?.click()}
        >
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={handleFile} />
          <span style={{ fontSize: "32px" }}>📂</span>
          <p style={{ fontWeight: 700, color: "#1a4731", margin: "8px 0 4px" }}>Clic para seleccionar archivo</p>
          <p style={{ fontSize: "12px", color: "#6b7280" }}>Formatos: .xlsx, .xls, .csv</p>
        </div>

        {errorGlobal && <p style={errorStyle}>{errorGlobal}</p>}

        {resultado && (
          <div style={resultBox}>
            <strong>Importación completada:</strong> {resultado.ok} productos guardados
            {resultado.err > 0 && `, ${resultado.err} con error`}
            <button onClick={() => router.push(`/productos${empresa ? `?empresa=${empresa}` : ""}`)} style={backBtn}>
              Ver catálogo
            </button>
          </div>
        )}

        {filas.length > 0 && !resultado && (
          <div style={tableWrap}>
            <div style={tableHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <label style={{ fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                  <input type="checkbox" checked={selCount === filas.length} onChange={(e) => toggleTodos(e.target.checked)} />
                  {" "}Todos ({filas.length} filas — {selCount} seleccionados)
                </label>
              </div>
              <button onClick={handleImportar} style={importBtn} disabled={importando || selCount === 0}>
                {importando ? "Importando..." : `Importar ${selCount} productos`}
              </button>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}></th>
                    <th style={th}>Nombre comercial</th>
                    <th style={th}>Registro</th>
                    <th style={th}>Ingrediente activo</th>
                    <th style={th}>Función</th>
                    <th style={th}>PHI</th>
                    <th style={th}>Especies</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((fila, i) => (
                    <tr key={i} style={i % 2 === 0 ? {} : { background: "#f9fafb" }}>
                      <td style={td}>
                        <input type="checkbox" checked={fila._seleccionado} onChange={() => toggleFila(i)} />
                      </td>
                      <td style={{ ...td, fontWeight: 600 }}>{fila.nombre_comercial}</td>
                      <td style={td}>{fila.numero_registro}</td>
                      <td style={td}>{fila.ingrediente_activo}</td>
                      <td style={td}>{fila.tipo_funcion.join(", ")}</td>
                      <td style={{ ...td, textAlign: "center" }}>{fila.phi_dias}d</td>
                      <td style={td}>{fila.especies_autorizadas.slice(0, 3).join(", ")}{fila.especies_autorizadas.length > 3 ? "..." : ""}</td>
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

const container: React.CSSProperties = { maxWidth: "1100px", margin: "0 auto", padding: "28px 20px" };
const pageHeader: React.CSSProperties = { marginBottom: "24px" };
const pageTitle: React.CSSProperties = { fontSize: "24px", fontWeight: 800, color: "#1a4731" };
const pageSubtitle: React.CSSProperties = { fontSize: "13px", color: "#6b7280", marginTop: "4px" };
const dropzone: React.CSSProperties = { border: "2px dashed #d1d5db", borderRadius: "14px", padding: "36px 20px", textAlign: "center", cursor: "pointer", background: "#fafafa", marginBottom: "20px", transition: "border-color 0.15s" };
const errorStyle: React.CSSProperties = { fontSize: "13px", color: "#dc2626", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px" };
const resultBox: React.CSSProperties = { display: "flex", alignItems: "center", gap: "16px", fontSize: "14px", color: "#15803d", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: "10px", padding: "12px 16px", marginBottom: "16px" };
const backBtn: React.CSSProperties = { marginLeft: "auto", padding: "6px 16px", borderRadius: "8px", background: "#1a4731", color: "#fff", fontWeight: 700, fontSize: "13px", border: "none", cursor: "pointer" };
const tableWrap: React.CSSProperties = { background: "#fff", borderRadius: "14px", border: "1px solid #e5e7eb", overflow: "hidden" };
const tableHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid #e5e7eb" };
const importBtn: React.CSSProperties = { padding: "8px 18px", borderRadius: "8px", background: "#1a4731", color: "#fff", fontWeight: 700, fontSize: "13px", border: "none", cursor: "pointer" };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: "13px" };
const th: React.CSSProperties = { padding: "10px 12px", background: "#f3f4f6", textAlign: "left", fontWeight: 700, fontSize: "11px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #e5e7eb" };
const td: React.CSSProperties = { padding: "9px 12px", borderBottom: "1px solid #f3f4f6", verticalAlign: "top" };
export default function ImportarSAGPage() { return <Suspense><ImportarSAGContent /></Suspense>; }
