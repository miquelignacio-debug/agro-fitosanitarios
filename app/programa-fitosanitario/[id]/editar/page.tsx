"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { read as xlsxRead, utils as xlsxUtils } from "xlsx";
import { supabase } from "@/lib/supabaseClient";
import Nav from "@/lib/nav";
import { useEmpresa } from "@/lib/useEmpresa";
import { useRol } from "@/lib/useRol";

// ── Tipos ────────────────────────────────────────────────────────────────────
type LineaForm = {
  key: number;
  objetivo: string;
  productoId: string;
  productoNombre: string;
  dosisValor: string;
  dosisUnidad: string;
  destacado: boolean;
};
type EtapaForm = {
  key: number;
  etapaFenologica: string;
  mojamientoLtha: string;
  lineas: LineaForm[];
};
type CuartelOpt = { id: string; codigo: string; especie: string; campo_nombre: string };
type ProdOpt    = { id: string; nombre_comercial: string };

const DOSIS_UNIDADES = ["cc/100lt", "lt/100lt", "g/100lt", "kg/100lt", "cc/ha", "lt/ha", "g/ha", "kg/ha"];

const newLinea = (): LineaForm => ({ key: Date.now() + Math.random(), objetivo: "", productoId: "", productoNombre: "", dosisValor: "", dosisUnidad: "cc/100lt", destacado: false });
const newEtapa = (): EtapaForm => ({ key: Date.now() + Math.random(), etapaFenologica: "", mojamientoLtha: "", lineas: [newLinea()] });

// ── Vincular producto sin catálogo a uno existente ───────────────────────────
function VincularSearch({ onSelect }: { onSelect: (id: string, nombre: string) => void }) {
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState<ProdOpt[]>([]);
  const [open,    setOpen]    = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (text: string) => {
    setQuery(text);
    if (timer.current) clearTimeout(timer.current);
    if (text.length >= 2) {
      timer.current = setTimeout(async () => {
        const { data } = await supabase.from("productos").select("id, nombre_comercial").eq("activo", true).ilike("nombre_comercial", `%${text}%`).order("nombre_comercial").limit(10);
        setResults((data as ProdOpt[]) || []);
        setOpen(true);
      }, 300);
    } else { setResults([]); setOpen(false); }
  };

  return (
    <div style={{ position: "relative", flex: 1, minWidth: "180px" }}>
      <input value={query} onChange={e => handleChange(e.target.value)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={{ padding: "5px 10px", borderRadius: "6px", border: "1.5px solid #d1d5db", fontSize: "12px", width: "100%", boxSizing: "border-box" }}
        placeholder="Buscar en catálogo..." />
      {open && results.length > 0 && (
        <div style={{ position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0, background: "#fff", border: "1px solid #d1d5db", borderRadius: "8px", zIndex: 200, maxHeight: "200px", overflowY: "auto", boxShadow: "0 4px 16px rgba(0,0,0,0.12)" }}>
          {results.map(r => (
            <div key={r.id} onMouseDown={() => { onSelect(r.id, r.nombre_comercial); setQuery(""); setOpen(false); }}
              style={{ padding: "8px 12px", cursor: "pointer", fontSize: "13px", borderBottom: "1px solid #f3f4f6" }}>
              {r.nombre_comercial}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Búsqueda producto catálogo ────────────────────────────────────────────────
function ProductoSearch({ value, productoId, onChange }: { value: string; productoId: string; onChange: (n: string, id: string) => void }) {
  const [results, setResults] = useState<ProdOpt[]>([]);
  const [open, setOpen]       = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (text: string) => {
    onChange(text, "");
    if (timer.current) clearTimeout(timer.current);
    if (text.length >= 2) {
      timer.current = setTimeout(async () => {
        const { data } = await supabase.from("productos").select("id, nombre_comercial").eq("activo", true).ilike("nombre_comercial", `%${text}%`).order("nombre_comercial").limit(10);
        setResults((data as ProdOpt[]) || []);
        setOpen(true);
      }, 300);
    } else { setResults([]); setOpen(false); }
  };

  return (
    <div style={{ position: "relative", flex: 1 }}>
      <input value={value} onChange={e => handleChange(e.target.value)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={{ ...cellInput, paddingRight: productoId ? "56px" : undefined }} placeholder="Nombre o buscar..." />
      {productoId && <span style={{ position: "absolute", right: "6px", top: "50%", transform: "translateY(-50%)", fontSize: "10px", color: "#059669", fontWeight: 700, background: "#f0fdf4", padding: "1px 5px", borderRadius: "4px", pointerEvents: "none" }}>✓ cat.</span>}
      {open && results.length > 0 && (
        <div style={{ position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0, background: "#fff", border: "1px solid #d1d5db", borderRadius: "8px", zIndex: 100, maxHeight: "200px", overflowY: "auto", boxShadow: "0 4px 16px rgba(0,0,0,0.12)" }}>
          {results.map(r => (
            <div key={r.id} onMouseDown={() => { onChange(r.nombre_comercial, r.id); setOpen(false); }}
              style={{ padding: "8px 12px", cursor: "pointer", fontSize: "13px", borderBottom: "1px solid #f3f4f6" }}>
              {r.nombre_comercial}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Parseo Excel ──────────────────────────────────────────────────────────────
function parseExcelToEtapas(buffer: ArrayBuffer): EtapaForm[] {
  const wb   = xlsxRead(buffer, { type: "array" });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsxUtils.sheet_to_json<Record<string, string | number>>(ws, { defval: "" });
  const norm = (s: string) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const col = (ps: string[]) => headers.find(h => ps.some(p => norm(h).includes(p))) ?? "";
  const [colN, colEEFF, colMoj, colObj, colProd, colDosis, colUnidad] = [
    col(["n°","n ","nro","etapa","numero"]), col(["eeff","fenol","estado"]),
    col(["mojam","volum","agua","ltha"]),    col(["objetivo","control","target"]),
    col(["producto","fitosanit"]),           col(["dosis"]),  col(["unidad","unit"]),
  ];
  const etapaMap = new Map<string, EtapaForm>();
  let lastKey = "";
  for (const row of rows) {
    const nVal = colN ? String(row[colN] ?? "").trim() : "";
    const eeff = colEEFF ? String(row[colEEFF] ?? "").trim() : "";
    const moj  = colMoj  ? String(row[colMoj]  ?? "").trim() : "";
    const obj  = colObj  ? String(row[colObj]  ?? "").trim() : "";
    const prod = colProd ? String(row[colProd] ?? "").trim() : "";
    const dosis  = colDosis  ? String(row[colDosis]  ?? "").trim() : "";
    const unidad = colUnidad ? String(row[colUnidad] ?? "").trim() : "";
    if (!prod && !eeff) continue;
    const etapaKey = nVal || lastKey || eeff;
    lastKey = etapaKey;
    if (!etapaMap.has(etapaKey)) etapaMap.set(etapaKey, { key: Date.now() + Math.random(), etapaFenologica: eeff, mojamientoLtha: moj, lineas: [] });
    else if (eeff && !etapaMap.get(etapaKey)!.etapaFenologica) etapaMap.get(etapaKey)!.etapaFenologica = eeff;
    if (prod) {
      let dosisUnidad = "cc/100lt";
      const u = norm(unidad + dosis);
      if (u.includes("lt/ha")||u.includes("l/ha")) dosisUnidad="lt/ha";
      else if (u.includes("kg/ha"))  dosisUnidad="kg/ha";
      else if (u.includes("g/ha"))   dosisUnidad="g/ha";
      else if (u.includes("cc/ha"))  dosisUnidad="cc/ha";
      else if (u.includes("lt/")||u.includes("l/")) dosisUnidad="lt/100lt";
      else if (u.includes("kg/"))    dosisUnidad="kg/100lt";
      else if (u.includes("g/"))     dosisUnidad="g/100lt";
      etapaMap.get(etapaKey)!.lineas.push({ key: Date.now() + Math.random(), objetivo: obj, productoId: "", productoNombre: prod, dosisValor: dosis.replace(/[^0-9.,]/g,"").replace(",","."), dosisUnidad, destacado: false });
    }
  }
  return Array.from(etapaMap.values()).filter(e => e.etapaFenologica || e.lineas.length > 0);
}

// ── Página ────────────────────────────────────────────────────────────────────
function EditarProgramaContent() {
  const router = useRouter();
  const params = useParams();
  const programaId = typeof params.id === "string" ? params.id : params.id?.[0] ?? "";

  const { empresaId } = useEmpresa();
  const { isSuperAdmin, rol } = useRol();

  const [nombre,    setNombre]    = useState("");
  const [temporada, setTemporada] = useState(new Date().getFullYear().toString());
  const [notas,     setNotas]     = useState("");

  const [cuartelesDisp, setCuartelesDisp] = useState<CuartelOpt[]>([]);
  const [cuartelSel,    setCuartelSel]    = useState<Set<string>>(new Set());
  const [etapas,        setEtapas]        = useState<EtapaForm[]>([newEtapa()]);

  const [loadingData, setLoadingData]     = useState(true);
  const [saving,      setSaving]          = useState(false);
  const [error,       setError]           = useState("");
  const [xlsxWarn,    setXlsxWarn]        = useState("");
  const [sinCatalogoProd, setSinCatalogoProd] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Guard superadmin
  useEffect(() => {
    if (rol === null) return;
    if (!isSuperAdmin) { router.push("/dashboard"); }
  }, [rol, isSuperAdmin, router]);

  // Cargar cuarteles de la empresa
  useEffect(() => {
    if (!empresaId) return;
    supabase.from("cuarteles").select("id, codigo, especie, campo:campos(nombre)").eq("empresa_id", empresaId).eq("activo", true).order("codigo")
      .then(({ data }) => {
        setCuartelesDisp(((data as unknown as { id: string; codigo: string; especie: string; campo: { nombre: string } | null }[]) || []).map(r => ({
          id: r.id, codigo: r.codigo, especie: r.especie ?? "", campo_nombre: r.campo?.nombre ?? "Sin campo",
        })));
      });
  }, [empresaId]);

  // Cargar programa existente
  useEffect(() => {
    if (!programaId || !empresaId) return;
    const load = async () => {
      const { data, error: err } = await supabase
        .from("programas_fitosanitarios")
        .select(`id, nombre, temporada, notas,
          programa_cuarteles(cuartel_id),
          programa_etapas(id, numero, etapa_fenologica, mojamiento_ltha,
            programa_etapa_lineas(id, objetivo, producto_id, producto_nombre, dosis_valor, dosis_unidad, destacado, orden))`)
        .eq("id", programaId).eq("empresa_id", empresaId).single();

      if (err || !data) { router.push("/programa-fitosanitario"); return; }

      const prog = data as unknown as {
        nombre: string; temporada: string; notas: string | null;
        programa_cuarteles: { cuartel_id: string }[];
        programa_etapas: { numero: number; etapa_fenologica: string; mojamiento_ltha: number | null;
          programa_etapa_lineas: { objetivo: string | null; producto_id: string | null; producto_nombre: string; dosis_valor: number | null; dosis_unidad: string; destacado: boolean; orden: number }[] }[];
      };

      setNombre(prog.nombre);
      setTemporada(prog.temporada);
      setNotas(prog.notas ?? "");
      setCuartelSel(new Set(prog.programa_cuarteles.map(pc => pc.cuartel_id)));
      setEtapas(
        prog.programa_etapas
          .sort((a, b) => a.numero - b.numero)
          .map(e => ({
            key: Date.now() + Math.random(),
            etapaFenologica: e.etapa_fenologica,
            mojamientoLtha: e.mojamiento_ltha != null ? String(e.mojamiento_ltha) : "",
            lineas: [...e.programa_etapa_lineas]
              .sort((a, b) => a.orden - b.orden)
              .map(l => ({
                key: Date.now() + Math.random(),
                objetivo:      l.objetivo ?? "",
                productoId:    l.producto_id ?? "",
                productoNombre: l.producto_nombre,
                dosisValor:    l.dosis_valor != null ? String(l.dosis_valor) : "",
                dosisUnidad:   l.dosis_unidad,
                destacado:     l.destacado,
              })),
          }))
      );
      setLoadingData(false);
    };
    load();
  }, [programaId, empresaId, router]);

  // Helpers
  const updateEtapa = (key: number, patch: Partial<EtapaForm>) => setEtapas(prev => prev.map(e => e.key === key ? { ...e, ...patch } : e));
  const updateLinea = (ek: number, lk: number, patch: Partial<LineaForm>) =>
    setEtapas(prev => prev.map(e => e.key !== ek ? e : { ...e, lineas: e.lineas.map(l => l.key === lk ? { ...l, ...patch } : l) }));
  const addLinea    = (ek: number) => setEtapas(prev => prev.map(e => e.key === ek ? { ...e, lineas: [...e.lineas, newLinea()] } : e));
  const removeLinea = (ek: number, lk: number) => setEtapas(prev => prev.map(e => e.key !== ek ? e : { ...e, lineas: e.lineas.filter(l => l.key !== lk) }));
  const toggleCuartel = (id: string) => setCuartelSel(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Catalog matching
  const matchProductos = async (parsed: EtapaForm[]): Promise<{ etapas: EtapaForm[]; sinCatalogo: string[] }> => {
    const nombres = [...new Set(parsed.flatMap(e => e.lineas.map(l => l.productoNombre.trim())).filter(Boolean))];
    if (!nombres.length) return { etapas: parsed, sinCatalogo: [] };
    const results = await Promise.all(nombres.map(n => supabase.from("productos").select("id, nombre_comercial").eq("activo", true).ilike("nombre_comercial", n).limit(1).maybeSingle()));
    const cm = new Map<string, { id: string; nombre_comercial: string }>();
    nombres.forEach((n, i) => { if (results[i].data) cm.set(n.toLowerCase(), results[i].data!); });
    const sinCatalogo: string[] = [];
    const linked = parsed.map(e => ({ ...e, lineas: e.lineas.map(l => {
      const m = cm.get(l.productoNombre.trim().toLowerCase());
      if (m) return { ...l, productoId: m.id, productoNombre: m.nombre_comercial };
      if (!sinCatalogo.includes(l.productoNombre)) sinCatalogo.push(l.productoNombre);
      return l;
    })}));
    return { etapas: linked, sinCatalogo };
  };

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setXlsxWarn(""); setSinCatalogoProd([]);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const buffer = ev.target?.result as ArrayBuffer;
        const parsed = parseExcelToEtapas(buffer);
        if (!parsed.length) { setXlsxWarn("No se encontraron filas con datos."); return; }
        const { etapas: linked, sinCatalogo } = await matchProductos(parsed);
        setEtapas(linked); setSinCatalogoProd(sinCatalogo);
        const matched = linked.flatMap(e => e.lineas).filter(l => l.productoId).length;
        const total   = linked.flatMap(e => e.lineas).length;
        setXlsxWarn(`✓ ${parsed.length} etapa${parsed.length !== 1 ? "s" : ""} importadas · ${matched}/${total} productos vinculados.`);
      } catch { setXlsxWarn("Error al leer la planilla."); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const handleVincular = (excelNombre: string, catalogId: string, catalogNombre: string) => {
    setEtapas(prev => prev.map(e => ({
      ...e,
      lineas: e.lineas.map(l =>
        (l.productoNombre === excelNombre && !l.productoId)
          ? { ...l, productoId: catalogId, productoNombre: catalogNombre }
          : l
      ),
    })));
    setSinCatalogoProd(prev => prev.filter(n => n !== excelNombre));
  };

  // Guardar (UPDATE + delete-reinsert)
  const handleSave = async () => {
    setError("");
    if (!nombre.trim())       { setError("El nombre del programa es obligatorio."); return; }
    if (!cuartelSel.size)     { setError("Seleccioná al menos un cuartel."); return; }
    if (!etapas.length)       { setError("Agregá al menos una etapa."); return; }
    for (const e of etapas) {
      if (!e.etapaFenologica.trim()) { setError("Todas las etapas deben tener estado fenológico."); return; }
      for (const l of e.lineas) { if (!l.productoNombre.trim()) { setError("Cada línea debe tener nombre de producto."); return; } }
    }
    setSaving(true);

    // 1. Update header
    const { error: upErr } = await supabase.from("programas_fitosanitarios")
      .update({ nombre: nombre.trim(), temporada: temporada.trim(), notas: notas.trim() || null })
      .eq("id", programaId);
    if (upErr) { setError(upErr.message); setSaving(false); return; }

    // 2. Delete cuarteles + etapas (lineas cascade)
    await Promise.all([
      supabase.from("programa_cuarteles").delete().eq("programa_id", programaId),
      supabase.from("programa_etapas").delete().eq("programa_id", programaId),
    ]);

    // 3. Reinsert cuarteles
    const { error: cuarErr } = await supabase.from("programa_cuarteles")
      .insert([...cuartelSel].map(cid => ({ programa_id: programaId, cuartel_id: cid })));
    if (cuarErr) { setError(cuarErr.message); setSaving(false); return; }

    // 4. Reinsert etapas + lineas
    for (let i = 0; i < etapas.length; i++) {
      const e = etapas[i];
      const { data: etapa, error: etErr } = await supabase.from("programa_etapas")
        .insert({ programa_id: programaId, numero: i + 1, etapa_fenologica: e.etapaFenologica.trim(), mojamiento_ltha: e.mojamientoLtha ? parseFloat(e.mojamientoLtha) : null })
        .select("id").single();
      if (etErr || !etapa) { setError(etErr?.message ?? "Error en etapa."); setSaving(false); return; }
      if (e.lineas.length > 0) {
        const { error: lErr } = await supabase.from("programa_etapa_lineas").insert(
          e.lineas.map((l, idx) => ({ etapa_id: etapa.id, objetivo: l.objetivo.trim() || null, producto_id: l.productoId || null, producto_nombre: l.productoNombre.trim(), dosis_valor: l.dosisValor ? parseFloat(l.dosisValor) : null, dosis_unidad: l.dosisUnidad, destacado: l.destacado, orden: idx }))
        );
        if (lErr) { setError(lErr.message); setSaving(false); return; }
      }
    }

    router.push(`/programa-fitosanitario/${programaId}`);
  };

  if (rol === null || loadingData) {
    return <><Nav /><main style={container}><p style={{ color: "#6b7280" }}>Cargando...</p></main></>;
  }

  const cuartelesPorCampo: Record<string, CuartelOpt[]> = {};
  cuartelesDisp.forEach(c => { const k = c.campo_nombre || "Sin campo"; if (!cuartelesPorCampo[k]) cuartelesPorCampo[k] = []; cuartelesPorCampo[k].push(c); });

  return (
    <>
      <Nav />
      <main style={container}>
        <div style={{ marginBottom: "24px" }}>
          <Link href={`/programa-fitosanitario/${programaId}`} style={backLink}>← Volver al programa</Link>
          <h1 style={pageTitle}>Editar programa</h1>
        </div>

        {/* Info general */}
        <div style={card}>
          <h2 style={sectionTitle}>Información general</h2>
          <div style={grid2}>
            <Field label="Nombre del programa *">
              <input value={nombre} onChange={e => setNombre(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Temporada">
              <input value={temporada} onChange={e => setTemporada(e.target.value)} style={inputStyle} />
            </Field>
          </div>
          <div style={{ marginTop: "14px" }}>
            <Field label="Notas (opcional)">
              <textarea value={notas} onChange={e => setNotas(e.target.value)} style={{ ...inputStyle, height: "64px", resize: "vertical" }} />
            </Field>
          </div>
        </div>

        {/* Cuarteles */}
        <div style={{ ...card, marginTop: "16px" }}>
          <h2 style={sectionTitle}>Cuarteles aplicables</h2>
          {Object.keys(cuartelesPorCampo).length === 0 ? (
            <p style={{ color: "#6b7280", fontSize: "13px" }}>Sin cuarteles disponibles</p>
          ) : Object.entries(cuartelesPorCampo).map(([campo, list]) => (
            <div key={campo} style={{ marginBottom: "14px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>{campo}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {list.map(c => (
                  <button key={c.id} type="button" onClick={() => toggleCuartel(c.id)} style={{ padding: "6px 14px", borderRadius: "8px", border: `1.5px solid ${cuartelSel.has(c.id) ? "#1a4731" : "#d1d5db"}`, background: cuartelSel.has(c.id) ? "#f0fdf4" : "#fff", color: cuartelSel.has(c.id) ? "#1a4731" : "#374151", fontWeight: cuartelSel.has(c.id) ? 700 : 500, fontSize: "13px", cursor: "pointer" }}>
                    {cuartelSel.has(c.id) ? "✓ " : ""}{c.codigo}{c.especie ? ` (${c.especie})` : ""}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {cuartelSel.size > 0 && <div style={{ fontSize: "12px", color: "#6b7280" }}>{cuartelSel.size} cuartel{cuartelSel.size !== 1 ? "es" : ""} seleccionado{cuartelSel.size !== 1 ? "s" : ""}</div>}
        </div>

        {/* Etapas */}
        <div style={{ marginTop: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
            <h2 style={{ fontSize: "17px", fontWeight: 800, color: "#1a4731" }}>Etapas fenológicas</h2>
            <div style={{ display: "flex", gap: "8px" }}>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={handleExcelImport} />
              <button type="button" onClick={() => fileInputRef.current?.click()} style={{ ...addBtn, background: "#fffbeb", borderColor: "#fcd34d", color: "#92400e" }}>📥 Importar Excel</button>
              <button type="button" onClick={() => setEtapas(prev => [...prev, newEtapa()])} style={addBtn}>+ Agregar etapa</button>
            </div>
          </div>

          {xlsxWarn && (
            <div style={{ padding: "10px 14px", borderRadius: "8px", fontSize: "13px", marginBottom: "12px", background: xlsxWarn.startsWith("✓") ? "#f0fdf4" : "#fffbeb", border: `1px solid ${xlsxWarn.startsWith("✓") ? "#86efac" : "#fcd34d"}`, color: xlsxWarn.startsWith("✓") ? "#15803d" : "#92400e" }}>
              {xlsxWarn}
            </div>
          )}

          {etapas.map((etapa, idx) => (
            <div key={etapa.key} style={{ ...card, marginBottom: "16px", borderLeft: "4px solid #1a4731" }}>
              <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap", marginBottom: "16px" }}>
                <div style={{ background: "#1a4731", color: "#fff", borderRadius: "50%", width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "13px", flexShrink: 0 }}>{idx + 1}</div>
                <div style={{ flex: 1, minWidth: "200px" }}>
                  <label style={labelStyle}>Estado fenológico *</label>
                  <input value={etapa.etapaFenologica} onChange={e => updateEtapa(etapa.key, { etapaFenologica: e.target.value })} style={inputStyle} placeholder="Ej: Brotación, Flor, Cuaja..." />
                </div>
                <div style={{ minWidth: "140px" }}>
                  <label style={labelStyle}>Mojamiento (lt/ha)</label>
                  <input type="number" min="0" step="10" value={etapa.mojamientoLtha} onChange={e => updateEtapa(etapa.key, { mojamientoLtha: e.target.value })} style={inputStyle} placeholder="Ej: 1000" />
                </div>
                {etapas.length > 1 && <button type="button" onClick={() => setEtapas(prev => prev.filter(e => e.key !== etapa.key))} style={deleteEtapaBtn}>Eliminar etapa</button>}
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ background: "#f9fafb" }}>
                      <th style={th}>Objetivo</th>
                      <th style={{ ...th, minWidth: "180px" }}>Producto *</th>
                      <th style={{ ...th, width: "90px" }}>Dosis</th>
                      <th style={{ ...th, width: "110px" }}>Unidad</th>
                      <th style={{ ...th, width: "60px" }}>Dest.</th>
                      <th style={{ ...th, width: "40px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {etapa.lineas.map(linea => (
                      <tr key={linea.key} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={td}><input value={linea.objetivo} onChange={e => updateLinea(etapa.key, linea.key, { objetivo: e.target.value })} style={cellInput} placeholder="Ej: Botrytis..." /></td>
                        <td style={td}>
                          <ProductoSearch value={linea.productoNombre} productoId={linea.productoId} onChange={(n, id) => updateLinea(etapa.key, linea.key, { productoNombre: n, productoId: id })} />
                        </td>
                        <td style={td}><input type="number" min="0" step="0.1" value={linea.dosisValor} onChange={e => updateLinea(etapa.key, linea.key, { dosisValor: e.target.value })} style={cellInput} placeholder="0" /></td>
                        <td style={td}>
                          <select value={linea.dosisUnidad} onChange={e => updateLinea(etapa.key, linea.key, { dosisUnidad: e.target.value })} style={cellInput}>
                            {DOSIS_UNIDADES.map(u => <option key={u} value={u}>{u.replace("/100lt", "/HL")}</option>)}
                          </select>
                        </td>
                        <td style={{ ...td, textAlign: "center" }}><input type="checkbox" checked={linea.destacado} onChange={e => updateLinea(etapa.key, linea.key, { destacado: e.target.checked })} style={{ width: "16px", height: "16px", cursor: "pointer" }} /></td>
                        <td style={{ ...td, textAlign: "center" }}>{etapa.lineas.length > 1 && <button type="button" onClick={() => removeLinea(etapa.key, linea.key)} style={deleteLineaBtn}>×</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={() => addLinea(etapa.key)} style={{ ...addBtn, marginTop: "10px", fontSize: "12px", padding: "5px 12px" }}>+ Agregar producto</button>
            </div>
          ))}
        </div>

        {/* Productos sin catálogo */}
        {sinCatalogoProd.length > 0 && (
          <div style={{ padding: "14px 16px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "10px", marginTop: "16px" }}>
            <div style={{ fontWeight: 700, color: "#dc2626", fontSize: "13px", marginBottom: "10px" }}>
              ⚠ {sinCatalogoProd.length} producto{sinCatalogoProd.length !== 1 ? "s" : ""} sin vincular al catálogo. Buscá el equivalente o creá los faltantes:
            </div>
            {sinCatalogoProd.map(nombre => (
              <div key={nombre} style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "12px", color: "#7f1d1d", fontWeight: 600, minWidth: "160px" }}>• {nombre}</span>
                <span style={{ fontSize: "12px", color: "#9ca3af" }}>→</span>
                <VincularSearch onSelect={(id, nom) => handleVincular(nombre, id, nom)} />
              </div>
            ))}
            <div style={{ marginTop: "10px", fontSize: "12px", color: "#dc2626", borderTop: "1px solid #fca5a5", paddingTop: "10px" }}>
              ¿No existe en el catálogo?{" "}
              <Link href="/productos" target="_blank" style={{ fontWeight: 700, color: "#dc2626" }}>Creá el producto →</Link>
              {" "}y volvé a importar, o guardá como texto libre (sin vincular al stock).
            </div>
          </div>
        )}

        {error && <div style={{ padding: "12px 16px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", color: "#dc2626", fontSize: "13px", marginTop: "16px" }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px", paddingBottom: "40px" }}>
          <Link href={`/programa-fitosanitario/${programaId}`} style={{ padding: "10px 22px", borderRadius: "8px", border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: "14px", textDecoration: "none" }}>Cancelar</Link>
          <button onClick={handleSave} style={saveBtn} disabled={saving}>{saving ? "Guardando..." : "Guardar cambios"}</button>
        </div>
      </main>
    </>
  );
}

export default function EditarProgramaPage() {
  return <Suspense><EditarProgramaContent /></Suspense>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}><label style={labelStyle}>{label}</label>{children}</div>;
}

const container: React.CSSProperties        = { maxWidth: "1000px", margin: "0 auto", padding: "28px 20px" };
const pageTitle: React.CSSProperties        = { fontSize: "24px", fontWeight: 800, color: "#1a4731", marginTop: "8px" };
const card: React.CSSProperties             = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: "14px", padding: "22px 24px" };
const sectionTitle: React.CSSProperties     = { fontSize: "13px", fontWeight: 700, color: "#1a4731", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "16px" };
const grid2: React.CSSProperties            = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" };
const labelStyle: React.CSSProperties       = { fontSize: "12px", fontWeight: 700, color: "#374151" };
const inputStyle: React.CSSProperties       = { padding: "9px 12px", borderRadius: "8px", border: "1.5px solid #d1d5db", fontSize: "14px", background: "#fafafa", color: "#111", width: "100%", boxSizing: "border-box" };
const cellInput: React.CSSProperties        = { padding: "6px 8px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "12px", background: "#fafafa", color: "#111", width: "100%", boxSizing: "border-box" };
const th: React.CSSProperties               = { padding: "8px 10px", textAlign: "left", fontWeight: 700, fontSize: "11px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #e5e7eb" };
const td: React.CSSProperties               = { padding: "6px 6px" };
const addBtn: React.CSSProperties           = { background: "#f0fdf4", color: "#1a4731", border: "1.5px solid #86efac", borderRadius: "8px", padding: "7px 14px", fontWeight: 700, fontSize: "13px", cursor: "pointer" };
const deleteEtapaBtn: React.CSSProperties   = { background: "transparent", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: "6px", padding: "5px 10px", fontSize: "12px", cursor: "pointer" };
const deleteLineaBtn: React.CSSProperties   = { background: "transparent", color: "#9ca3af", border: "none", fontSize: "18px", cursor: "pointer", lineHeight: 1, padding: "0 4px" };
const saveBtn: React.CSSProperties          = { padding: "10px 28px", borderRadius: "8px", background: "#1a4731", color: "#fff", fontWeight: 700, fontSize: "14px", border: "none", cursor: "pointer" };
const backLink: React.CSSProperties         = { color: "#6b7280", fontSize: "13px", fontWeight: 600, textDecoration: "none" };