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
  const hace60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

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

  // ── OTs recientes ─────────────────────────────────────────────────────────
  const baseOT = supabase
    .from("ordenes_trabajo")
    .select(`
      numero, estado, fecha_solicitud, fecha_aplicacion, remanente_lt,
      ot_cuarteles(superficie_ha, cuartel:cuarteles(codigo, especie, variedad)),
      ot_productos(dosis_real, dosis_unidad, consumo_total, producto:productos(nombre_comercial)),
      responsable:personal!responsable_id(nombre),
      ot_aplicadores(personal:personal!personal_id(nombre), operador:operadores(nombre))
    `)
    .eq("empresa_id", empresaId)
    .neq("estado", "anulada")
    .gte("fecha_solicitud", hace60)
    .order("fecha_solicitud", { ascending: false })
    .limit(25);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ots } = await (campoId ? baseOT.eq("campo_id", campoId) : baseOT) as { data: any[] | null };

  const otLines = (ots ?? []).map((ot) => {
    const cuarteles = (ot.ot_cuarteles ?? [])
      .map((c: { superficie_ha: number; cuartel: { codigo: string; especie: string } | null }) =>
        `${c.cuartel?.codigo}(${c.cuartel?.especie} ${c.superficie_ha}ha)`)
      .join(", ");
    const prods = (ot.ot_productos ?? [])
      .map((p: { dosis_real: number; dosis_unidad: string; consumo_total: number | null; producto: { nombre_comercial: string } | null }) =>
        `${p.producto?.nombre_comercial} ${p.dosis_real}${p.dosis_unidad}${p.consumo_total ? ` consumo:${Number(p.consumo_total).toFixed(2)}` : ""}`)
      .join(", ");
    const resp = Array.isArray(ot.responsable) ? ot.responsable[0]?.nombre : ot.responsable?.nombre;
    const aplics = (ot.ot_aplicadores ?? [])
      .map((a: { personal: { nombre: string } | null; operador: { nombre: string } | null }) =>
        a.personal?.nombre ?? a.operador?.nombre ?? "")
      .filter(Boolean).join(", ");
    return `  - OT#${ot.numero} [${ot.estado}] ${ot.fecha_aplicacion ?? ot.fecha_solicitud}: ${cuarteles} | ${prods} | Resp:${resp ?? "—"} Aplic:${aplics || "—"}${ot.remanente_lt ? ` Rem:${ot.remanente_lt}lt` : ""}`;
  });

  // ── Movimientos de bodega ─────────────────────────────────────────────────
  const baseMov = supabase
    .from("stock_movimientos")
    .select("fecha, tipo, cantidad, unidad, etiquetas, producto:productos(nombre_comercial), proveedor, notas, precio_unitario")
    .eq("empresa_id", empresaId)
    .gte("fecha", hace60)
    .order("fecha", { ascending: false })
    .limit(40);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: movs } = await (campoId ? baseMov.eq("campo_id", campoId) : baseMov) as { data: any[] | null };

  const movLines = (movs ?? []).map((m) => {
    const sign = TIPOS_SUMA.has(m.tipo) ? "+" : "-";
    const prod = Array.isArray(m.producto) ? m.producto[0] : m.producto;
    const etiq = Array.isArray(m.etiquetas) && m.etiquetas.length ? ` [${m.etiquetas.join(",")}]` : "";
    const precio = m.precio_unitario ? ` $${m.precio_unitario}/u` : "";
    return `  - ${m.fecha} ${sign}${Number(m.cantidad).toFixed(2)}${m.unidad} ${prod?.nombre_comercial ?? "?"}${etiq}${precio}${m.proveedor ? ` prov:${m.proveedor}` : ""}${m.notas ? ` nota:"${m.notas}"` : ""}`;
  });

  return `
=== STOCK ACTUAL (${campoId ? "campo activo" : "empresa completa"} · ${hoy}) ===
${stockLines.length ? stockLines.join("\n") : "  Sin stock registrado."}

=== ÓRDENES DE TRABAJO — últimos 60 días ===
${otLines.length ? otLines.join("\n") : "  Sin OTs en el período."}

=== MOVIMIENTOS DE BODEGA — últimos 60 días ===
${movLines.length ? movLines.join("\n") : "  Sin movimientos en el período."}
`.trim();
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

    const systemInstruction = `Sos el asistente de AgroFito, una app de gestión fitosanitaria agrícola chilena.
Tu rol es ayudar al usuario a consultar y entender la información de su empresa.

DATOS ACTUALES:
${context}

REGLAS:
- Respondé en español (Chile), tono profesional pero cercano
- Basá tus respuestas SOLO en los datos del contexto. Si algo no está, decilo — no inventes
- Sé conciso: 2–4 párrafos o lista bien estructurada
- Para stock usá las unidades correctas (lt, kg)
- Hoy es ${hoyStr}
- Solo podés consultar datos, NO podés crear ni modificar registros`;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction,
    });

    const geminiHistory = (history ?? [])
      .slice(-12)
      .map(msg => ({
        role: msg.role === "assistant" ? "model" : ("user" as "user" | "model"),
        parts: [{ text: msg.content }],
      }));

    const chat = model.startChat({
      history: geminiHistory,
      generationConfig: { maxOutputTokens: 900, temperature: 0.2 },
    });

    const result = await chat.sendMessage(message.trim());
    return NextResponse.json({ response: result.response.text() });
  } catch (err) {
    console.error("Chat API error:", err);
    return NextResponse.json({ error: "Error al procesar la consulta. Intentá de nuevo." }, { status: 500 });
  }
}