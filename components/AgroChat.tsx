"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useEmpresa } from "@/lib/useEmpresa";
import { useCampo } from "@/lib/useCampo";

type Msg = { role: "user" | "assistant"; content: string };

const SUGERENCIAS = [
  "¿Cuánto stock de cada producto tengo?",
  "¿Qué órdenes están pendientes?",
  "¿Cuándo fue la última aplicación?",
  "¿Qué productos están bajo stock mínimo?",
];

export default function AgroChat() {
  const { empresaId, loading: empresaLoading } = useEmpresa();
  const { campoId } = useCampo();
  const [open, setOpen]         = useState(false);
  const [msgs, setMsgs]         = useState<Msg[]>([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [cooldown, setCooldown] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  // Saludo inicial al abrir
  useEffect(() => {
    if (open && msgs.length === 0) {
      setMsgs([{
        role: "assistant",
        content: "Hola! Soy el asistente de AgroFito. Podés preguntarme sobre stock, órdenes de trabajo, movimientos de bodega y más.\n\n¿En qué te ayudo?",
      }]);
    }
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, loading]);

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading || cooldown || !empresaId) return;
    setInput("");
    setError("");
    setMsgs(prev => [...prev, { role: "user", content: msg }]);
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          message: msg,
          empresaId,
          campoId: campoId ?? null,
          history: msgs.slice(-10),
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setMsgs(prev => [...prev, { role: "assistant", content: data.response }]);
      }
    } catch {
      setError("Sin conexión. Intentá de nuevo.");
    }
    setLoading(false);
    setCooldown(true);
    setTimeout(() => setCooldown(false), 8000);
  };

  // Solo ocultar cuando cargó y definitivamente no hay empresa (usuario no logueado)
  if (!empresaLoading && !empresaId) return null;

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Asistente AgroFito"
        style={{
          position: "fixed", bottom: "24px", right: "24px", zIndex: 10001,
          width: "52px", height: "52px", borderRadius: "50%",
          background: open ? "#374151" : "#1a4731",
          border: "none", cursor: "pointer",
          boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "22px", transition: "background 0.2s",
        }}
      >
        {open ? "✕" : "🌿"}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: "88px", right: "24px", zIndex: 10000,
          width: "min(390px, calc(100vw - 32px))",
          height: "min(560px, calc(100vh - 110px))",
          background: "#fff", borderRadius: "16px",
          boxShadow: "0 8px 48px rgba(0,0,0,0.2)",
          border: "1px solid #e5e7eb",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>

          {/* Header */}
          <div style={{ padding: "13px 18px", background: "#1a4731", color: "#fff", flexShrink: 0 }}>
            <div style={{ fontWeight: 800, fontSize: "14px" }}>🌿 Asistente AgroFito</div>
            <div style={{ fontSize: "11px", opacity: 0.7, marginTop: "1px" }}>
              Solo lectura · datos actualizados en tiempo real
            </div>
          </div>

          {/* Mensajes */}
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 12px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "88%",
                  padding: "9px 13px",
                  borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "4px 16px 16px 16px",
                  background: m.role === "user" ? "#1a4731" : "#f3f4f6",
                  color: m.role === "user" ? "#fff" : "#111",
                  fontSize: "13px", lineHeight: "1.55", whiteSpace: "pre-wrap",
                }}>
                  {m.content}
                </div>
              </div>
            ))}

            {/* Sugerencias — solo después del saludo inicial */}
            {msgs.length === 1 && !loading && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "4px" }}>
                {SUGERENCIAS.map(s => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    style={{
                      textAlign: "left", padding: "7px 12px", borderRadius: "10px",
                      border: "1px solid #d1fae5", background: "#f0fdf4",
                      color: "#1a4731", fontSize: "12px", fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {loading && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{
                  padding: "9px 14px", borderRadius: "4px 16px 16px 16px",
                  background: "#f3f4f6", fontSize: "13px", color: "#6b7280",
                }}>
                  Consultando datos...
                </div>
              </div>
            )}

            {error && (
              <div style={{ fontSize: "12px", color: "#dc2626", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", padding: "8px 12px" }}>
                {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: "10px 12px", borderTop: "1px solid #e5e7eb", display: "flex", gap: "8px", flexShrink: 0 }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Preguntá sobre stock, OTs, costos..."
              disabled={loading}
              style={{
                flex: 1, padding: "9px 12px", borderRadius: "10px",
                border: "1.5px solid #d1d5db", fontSize: "13px",
                outline: "none", background: "#fafafa",
              }}
            />
            <button
              onClick={() => send()}
              disabled={loading || cooldown || !input.trim()}
              style={{
                padding: "9px 14px", borderRadius: "10px",
                background: loading || cooldown || !input.trim() ? "#e5e7eb" : "#1a4731",
                border: "none", color: loading || cooldown || !input.trim() ? "#9ca3af" : "#fff",
                fontWeight: 700, fontSize: "15px",
                cursor: loading || cooldown || !input.trim() ? "default" : "pointer",
                transition: "background 0.15s",
              }}
            >
              {cooldown ? "⏳" : "→"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}