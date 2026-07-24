"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import type { Empresa } from "./types";

type EmpresaCtx = {
  empresaId: string;
  empresaNombre: string;
  isSuperAdmin: boolean;
  loading: boolean;
  // Solo superadmin: lista completa y función para cambiar de empresa
  allEmpresas: Empresa[];
  switchEmpresa: (id: string) => void;
};

const EmpresaContext = createContext<EmpresaCtx>({
  empresaId: "",
  empresaNombre: "",
  isSuperAdmin: false,
  loading: true,
  allEmpresas: [],
  switchEmpresa: () => {},
});

export function EmpresaProvider({ children }: { children: React.ReactNode }) {
  const [empresaId,     setEmpresaId]     = useState("");
  const [empresaNombre, setEmpresaNombre] = useState("");
  const [isSuperAdmin,  setIsSuperAdmin]  = useState(false);
  const [loading,       setLoading]       = useState(true);
  const [allEmpresas,   setAllEmpresas]   = useState<Empresa[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: usr } = await supabase
        .from("usuarios")
        .select("empresa_id, rol, empresa:empresas(id, nombre, rut, created_at)")
        .eq("id", user.id)
        .single();

      if (!usr) { setLoading(false); return; }

      const isSuper = usr.rol === "superadmin";
      setIsSuperAdmin(isSuper);

      if (isSuper) {
        // Superadmin: carga todas las empresas
        const { data: emps } = await supabase
          .from("empresas")
          .select("*")
          .order("nombre");
        const lista = (emps as Empresa[]) || [];
        setAllEmpresas(lista);

        // Usa la empresa guardada en localStorage (o la primera)
        const saved = localStorage.getItem("superadmin_empresa_id");
        const inicial = lista.find(e => e.id === saved) ? saved! : lista[0]?.id ?? "";
        setEmpresaId(inicial);
        setEmpresaNombre(lista.find(e => e.id === inicial)?.nombre ?? "");
      } else {
        const eid  = usr.empresa_id ?? "";
        const enombre = (usr.empresa as unknown as Empresa | null)?.nombre ?? "";
        setEmpresaId(eid);
        setEmpresaNombre(enombre);
      }

      setLoading(false);
    };

    load();

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      setLoading(true);
      load();
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const switchEmpresa = (id: string) => {
    const emp = allEmpresas.find(e => e.id === id);
    if (!emp) return;
    localStorage.setItem("superadmin_empresa_id", id);
    setEmpresaId(id);
    setEmpresaNombre(emp.nombre);
  };

  return (
    <EmpresaContext.Provider value={{ empresaId, empresaNombre, isSuperAdmin, loading, allEmpresas, switchEmpresa }}>
      {children}
    </EmpresaContext.Provider>
  );
}

export function useEmpresa() {
  return useContext(EmpresaContext);
}