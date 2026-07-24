"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { useEmpresa } from "./useEmpresa";

export type Campo = { id: string; nombre: string };

type CampoCtx = {
  campoId: string | null;
  campoNombre: string;
  allCampos: Campo[];
  switchCampo: (id: string) => void;
};

const CampoCtx = createContext<CampoCtx>({
  campoId: null,
  campoNombre: "",
  allCampos: [],
  switchCampo: () => {},
});

export function CampoProvider({ children }: { children: React.ReactNode }) {
  const { empresaId } = useEmpresa();
  const [campos, setCampos] = useState<Campo[]>([]);
  const [campoId, setCampoId] = useState<string | null>(null);

  useEffect(() => {
    if (!empresaId) { setCampos([]); setCampoId(null); return; }
    supabase
      .from("campos")
      .select("id, nombre")
      .eq("empresa_id", empresaId)
      .order("nombre")
      .then(({ data }) => {
        const list = (data as Campo[]) || [];
        setCampos(list);
        const stored = typeof window !== "undefined" ? localStorage.getItem("selected_campo_id") : null;
        const valid = list.find(c => c.id === stored);
        setCampoId(valid ? valid.id : (list[0]?.id ?? null));
      });
  }, [empresaId]);

  const switchCampo = (id: string) => {
    setCampoId(id);
    if (typeof window !== "undefined") localStorage.setItem("selected_campo_id", id);
  };

  const campoNombre = campos.find(c => c.id === campoId)?.nombre ?? "";

  return (
    <CampoCtx.Provider value={{ campoId, campoNombre, allCampos: campos, switchCampo }}>
      {children}
    </CampoCtx.Provider>
  );
}

export function useCampo() {
  return useContext(CampoCtx);
}