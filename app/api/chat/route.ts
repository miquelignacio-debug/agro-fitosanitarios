import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";

const TIPOS_SUMA = new Set(["entrada", "transferencia_entrada", "ajuste_entrada"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildContext(empresaId: string, campoId: string | null, authHeader: string): Promise<string> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const hoy = new Date().toISOString().slice(0, 10);

  // ── Stock actual ──────────────────────────────────────────────────────────
  const baseAgg = supabase
    .from("stock_movimientos")
    .select("producto_id, tipo, cantidad, producto:productos(nombre_comercial, unidad_bodega, ingrediente_activo)")
    .eq("empresa_id", empresaId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: movStock } = await (campoId ? baseAgg.eq("campo_id", campoId) : baseAgg) as { data: any[] | null };

  const stockMap = new Map<string, { nombre: string; unidad: string; cantidad: number; ia: string }>();
  for (const m of movStock ?? []) {
    const sign = TIPOS_SUMA.has(m.tipo) ? 1 : -1;
    const prod = Array.isArray(m.producto) ? m.producto[0] : m.producto;
    const prev = stockMap.get(m.producto_id);
    if (prev) {
      prev.cantidad += sign * Number(m.cantidad);
    } else {
      stockMap.set(m.producto_id, {
        nombre: prod?.nombre_comercial ?? "?",
        unidad: prod?.unidad_bodega ?? "u",
        cantidad: sign * Number(m.cantidad),
        ia: prod?.ingrediente_activo ?? "",
      });
    }
  }
  const stockLines = [...stockMap.values()]
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .map(s =>
      `  - ${s.nombre}${s.ia ? ` (${s.ia})` : ""}: ${s.cantidad.toFixed(2)} ${s.unidad}${s.cantidad < 0 ? " ⚠️ NEGATIVO" : ""}`,
    );

  // ── OTs recientes (últimos 30 días, máx 10) ──────────────────────────────
  const hace30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const baseOT = supabase
    .from("ordenes_trabajo")
    .select("numero, estado, fecha_aplicacion, ot_cuarteles(cuartel:cuarteles(codigo, especie)), ot_productos(dosis_real, dosis_unidad, producto:productos(nombre_comercial))")
    .eq("empresa_id", empresaId)
    .neq("estado", "anulada")
    .gte("fecha_solicitud", hace30)
    .order("fecha_solicitud", { ascending: false })
    .limit(10);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ots } = await (campoId ? baseOT.eq("campo_id", campoId) : baseOT) as { data: any[] | null };

  const otLines = (ots ?? []).map((ot) => {
    const cuarteles = (ot.ot_cuarteles ?? [])
      .map((c: { cuartel: { codigo: string; especie: string } | null }) => `${c.cuartel?.codigo}/${c.cuartel?.especie}`)
      .join(",");
    const prods = (ot.ot_productos ?? [])
      .map((p: { dosis_real: number; dosis_unidad: string; producto: { nombre_comercial: string } | null }) =>
        `${p.producto?.nombre_comercial} ${p.dosis_real}${p.dosis_unidad}`)
      .join(",");
    return `OT#${ot.numero}[${ot.estado}] ${ot.fecha_aplicacion ?? "s/f"}: ${cuarteles} | ${prods}`;
  });

  // ── Entradas de bodega recientes (últimos 30 días, máx 12) ───────────────
  const baseMov = supabase
    .from("stock_movimientos")
    .select("fecha, tipo, cantidad, unidad, etiquetas, producto:productos(nombre_comercial)")
    .eq("empresa_id", empresaId)
    .gte("fecha", hace30)
    .order("fecha", { ascending: false })
    .limit(12);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: movs } = await (campoId ? baseMov.eq("campo_id", campoId) : baseMov) as { data: any[] | null };

  const movLines = (movs ?? []).map((m) => {
    const sign = TIPOS_SUMA.has(m.tipo) ? "+" : "-";
    const prod = Array.isArray(m.producto) ? m.producto[0] : m.producto;
    const etiq = Array.isArray(m.etiquetas) && m.etiquetas.length ? `[${m.etiquetas.join(",")}]` : "";
    return `${m.fecha} ${sign}${Number(m.cantidad).toFixed(1)}${m.unidad} ${prod?.nombre_comercial ?? "?"}${etiq}`;
  });

  return `STOCK(${hoy}): ${stockLines.join("; ")}
OTs(30d): ${otLines.join(" | ")}
MOVS(30d): ${movLines.join("; ")}`.trim();
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Asistente no configurado aún." }, { status: 500 });

    const { message, empresaId, campoId, history } = await req.json() as {
      message: string;
      empresaId: string;
      campoId: string | null;
      history: { role: string; content: string }[];
    };

    if (!empresaId || !message?.trim()) {
      return NextResponse.json({ error: "Parámetros inválidos." }, { status: 400 });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const context = await buildContext(empresaId, campoId, authHeader);

    const hoyStr = new Date().toLocaleDateString("es-CL", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });

    const systemInstruction = `Asistente AgroFito (fitosanitaria agrícola Chile). Solo lectura. Hoy: ${hoyStr}.
Respondé en español, conciso, basándote SOLO en estos datos:
${context}`;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-lite",
      systemInstruction,
    });

    const rawHistory = (history ?? [])
      .slice(-12)
      .map(msg => ({
        role: msg.role === "assistant" ? "model" : ("user" as "user" | "model"),
        parts: [{ text: msg.content }],
      }));
    // Gemini requires history to start with 'user' — strip any leading model messages
    const firstUserIdx = rawHistory.findIndex(m => m.role === "user");
    const geminiHistory = firstUserIdx >= 0 ? rawHistory.slice(firstUserIdx) : [];

    const chat = model.startChat({
      history: geminiHistory,
      generationConfig: { maxOutputTokens: 900, temperature: 0.2 },
    });

    const result = await chat.sendMessage(message.trim());
    return NextResponse.json({ response: result.response.text() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Chat API error:", msg);
    if (msg.includes("429") || msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("rate")) {
      return NextResponse.json({ error: "Límite de consultas alcanzado. Esperá 30 segundos y volvé a intentar." }, { status: 429 });
    }
    return NextResponse.json({ error: "Error al procesar la consulta. Intentá de nuevo." }, { status: 500 });
  }
}