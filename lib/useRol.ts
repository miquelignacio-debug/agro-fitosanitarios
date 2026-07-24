"use client";
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export type Rol = "admin" | "encargado" | "visualizador" | "superadmin";

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

  const isSuperAdmin   = rol === "superadmin";
  const isAdmin        = rol === "admin" || isSuperAdmin;
  const isEncargado    = rol === "encargado";
  const isVisualizador = rol === "visualizador";

  return {
    rol,
    isSuperAdmin,
    isAdmin,
    isEncargado,
    isVisualizador,
    puedeEditar:   isAdmin || isEncargado,
    puedeEliminar: isAdmin,
    puedeAprobar:  isAdmin,
  };
}