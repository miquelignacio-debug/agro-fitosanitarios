"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setError("Email o contraseña incorrectos.");
      setLoading(false);
    } else {
      router.push("/dashboard");
    }
  };

  return (
    <div style={page}>
      <div style={card}>
        <div style={brand}>🌿</div>
        <h1 style={title}>Agro Fitosanitarios</h1>
        <p style={subtitle}>Gestión de aplicaciones fitosanitarias</p>

        <form onSubmit={handleLogin} style={form}>
          <div style={field}>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              placeholder="usuario@empresa.cl"
              required
              autoFocus
            />
          </div>
          <div style={field}>
            <label style={labelStyle}>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
              placeholder="••••••••"
              required
            />
          </div>
          {error && <p style={errorStyle}>{error}</p>}
          <button type="submit" style={btn} disabled={loading}>
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f0f4f2",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "20px",
};

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: "20px",
  padding: "44px 40px",
  width: "100%",
  maxWidth: "380px",
  boxShadow: "0 4px 24px rgba(0,0,0,0.1)",
  textAlign: "center",
};

const brand: React.CSSProperties = { fontSize: "48px", marginBottom: "8px" };

const title: React.CSSProperties = {
  fontSize: "22px",
  fontWeight: 800,
  color: "#1a4731",
  marginBottom: "6px",
};

const subtitle: React.CSSProperties = {
  fontSize: "14px",
  color: "#6b7280",
  marginBottom: "28px",
};

const form: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "16px",
  textAlign: "left",
};

const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "6px" };

const labelStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 700,
  color: "#374151",
};

const inputStyle: React.CSSProperties = {
  padding: "11px 14px",
  borderRadius: "10px",
  border: "1.5px solid #d1d5db",
  fontSize: "15px",
  background: "#fafafa",
  color: "#111",
  outline: "none",
};

const errorStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#dc2626",
  background: "#fef2f2",
  border: "1px solid #fca5a5",
  borderRadius: "8px",
  padding: "10px 12px",
};

const btn: React.CSSProperties = {
  marginTop: "4px",
  padding: "12px",
  borderRadius: "10px",
  background: "#1a4731",
  color: "#fff",
  fontWeight: 700,
  fontSize: "15px",
  border: "none",
  cursor: "pointer",
};
