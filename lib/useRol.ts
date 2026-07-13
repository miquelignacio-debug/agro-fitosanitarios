"use client";
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export type Rol = "admin" | "operador" | "visualizador";

export function useRol() {
  const [rol, setRol] = useState<Rol | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setRol("visualizador"); return; }
      supabase
        .from("usuarios")
        .select("rol")
        .eq("id", user.id)
        .single()
        .then(({ data }) => setRol((data?.rol as Rol) ?? "visualizador"));
    });
  }, []);

  return {
    rol,
    isAdmin:        rol === "admin",
    isOperador:     rol === "operador",
    isVisualizador: rol === "visualizador",
    puedeEditar:    rol === "admin" || rol === "operador",
    puedeEliminar:  rol === "admin",
    puedeAprobar:   rol === "admin",
  };
}
