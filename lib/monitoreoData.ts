export type ChecklistItem = {
  id: string;
  nombre: string;
  tipo: "plaga" | "enfermedad";
  metodologia: string;
};

export type ChecklistEspecie = {
  plagas: ChecklistItem[];
  enfermedades: ChecklistItem[];
};

export const CHECKLISTS: Record<string, ChecklistEspecie> = {
  cereza: {
    plagas: [
      {
        id: "pulgon_negro",
        nombre: "Pulgón negro (Myzus cerasi)",
        tipo: "plaga",
        metodologia:
          "Revisar 10 brotes terminales × 5 puntos = 50 brotes. Registrar % con colonias activas. Umbral de acción: >10% brotes afectados.",
      },
      {
        id: "aranita_roja_cereza",
        nombre: "Arañita roja (Panonychus ulmi)",
        tipo: "plaga",
        metodologia:
          "Revisar 10 hojas × 5 puntos (haz y envés). Registrar % hojas con presencia. Umbral: >20% hojas en primavera-verano.",
      },
      {
        id: "trips_cereza",
        nombre: "Trips (Frankliniella occidentalis)",
        tipo: "plaga",
        metodologia:
          "Revisar 10 flores/frutos × 5 puntos sobre papel blanco. Umbral: >5 trips/flor durante floración.",
      },
      {
        id: "mosca_fruta",
        nombre: "Mosca de la fruta (Ceratitis capitata)",
        tipo: "plaga",
        metodologia:
          "Registrar capturas en trampas McPhail (adultos/trampa/día). En pre-cosecha revisar 100 frutos. Umbral: >2 adultos/trampa/día.",
      },
      {
        id: "polilla_oriental",
        nombre: "Polilla oriental (Grapholita molesta)",
        tipo: "plaga",
        metodologia:
          "Revisar trampas de feromonas + 10 brotes × 5 puntos buscando daño de yema. Umbral: >5 capturas/trampa/semana.",
      },
      {
        id: "cochinilla_san_jose",
        nombre: "Cochinilla de San José (Comstock aspidiotus)",
        tipo: "plaga",
        metodologia:
          "Revisar 10 ramas de 2 años × 5 puntos. Buscar escamas en corteza y frutos. Registrar % ramas con colonias.",
      },
    ],
    enfermedades: [
      {
        id: "moniliosis",
        nombre: "Moniliosis (Monilinia spp.)",
        tipo: "enfermedad",
        metodologia:
          "En floración: 100 flores × 5 puntos. En maduración: 100 frutos × 5 puntos. Registrar % con podredumbre parda. Fotografiar síntomas.",
      },
      {
        id: "cancer_bacteriano",
        nombre: "Cáncer bacteriano (Pseudomonas syringae)",
        tipo: "enfermedad",
        metodologia:
          "Revisar tronco y ramas principales en 10 árboles × 5 puntos. Buscar lesiones cancrosas con exudado gomoso. Registrar % plantas afectadas.",
      },
      {
        id: "agalla_corona",
        nombre: "Agalla de corona (Agrobacterium tumefaciens)",
        tipo: "enfermedad",
        metodologia:
          "Revisar cuello y raíces superficiales en 10 plantas × 5 puntos. Registrar % plantas con agallas visibles.",
      },
      {
        id: "taphrina",
        nombre: "Escoba de bruja / Hoja rizosa (Taphrina spp.)",
        tipo: "enfermedad",
        metodologia:
          "Revisar 10 ramas × 5 puntos. Buscar proliferación anormal de brotes o deformación foliar. Registrar % plantas con síntomas.",
      },
    ],
  },

  uva_mesa: {
    plagas: [
      {
        id: "chanchito_blanco",
        nombre: "Chanchito blanco (Pseudococcus viburni)",
        tipo: "plaga",
        metodologia:
          "Revisar 10 pámpanos × 5 puntos + levantar corteza en tronco y brazos. Umbral: >10% pámpanos con colonias activas.",
      },
      {
        id: "aranita_roja_vid",
        nombre: "Arañita roja (Panonychus ulmi / Tetranychus urticae)",
        tipo: "plaga",
        metodologia:
          "Revisar 10 hojas basales × 5 puntos (haz y envés). Registrar % hojas con presencia. Umbral: >30% hojas afectadas.",
      },
      {
        id: "trips_vid",
        nombre: "Trips (Frankliniella occidentalis)",
        tipo: "plaga",
        metodologia:
          "En floración: sacudir 10 inflorescencias × 5 puntos sobre papel blanco. Umbral: >5 trips/flor.",
      },
      {
        id: "polilla_racimo",
        nombre: "Polilla del racimo (Lobesia botrana)",
        tipo: "plaga",
        metodologia:
          "Revisar trampas de feromonas + 20 racimos × 5 puntos. Umbral: >5 capturas/trampa/semana o >1% racimos con daño.",
      },
      {
        id: "cochinilla_harinosa",
        nombre: "Cochinilla harinosa (Planococcus ficus)",
        tipo: "plaga",
        metodologia:
          "Revisar 10 pámpanos × 5 puntos + levantar corteza en cordones. Umbral: >5% plantas con colonias activas.",
      },
    ],
    enfermedades: [
      {
        id: "botrytis",
        nombre: "Botrytis / Podredumbre gris (Botrytis cinerea)",
        tipo: "enfermedad",
        metodologia:
          "Revisar 20 racimos × 5 puntos. Registrar % con podredumbre gris. En pre-cosecha evaluar 50 racimos. Fotografiar síntomas.",
      },
      {
        id: "oidio",
        nombre: "Oídio (Erysiphe necator)",
        tipo: "enfermedad",
        metodologia:
          "Revisar 10 pámpanos + 10 racimos × 5 puntos. Buscar polvillo blanquecino en haz, envés y raquis. Umbral: >10% órganos con síntomas.",
      },
      {
        id: "mildiu",
        nombre: "Mildiu (Plasmopara viticola)",
        tipo: "enfermedad",
        metodologia:
          "Revisar 10 hojas (envés) + 10 racimos × 5 puntos. Buscar 'manchas de aceite' en haz y esporulación algodonosa en envés.",
      },
      {
        id: "yesca",
        nombre: "Yesca / Decaimiento (Phaeomoniella, Phaeoacremonium)",
        tipo: "enfermedad",
        metodologia:
          "Recorrer el cuartel observando síntomas foliares (hoja atigrada, decaimiento súbito). Registrar % plantas con síntomas.",
      },
      {
        id: "podredumbre_acida",
        nombre: "Podredumbre ácida (Acetobacter + Drosophila)",
        tipo: "enfermedad",
        metodologia:
          "Revisar 20 racimos × 5 puntos en pre-cosecha. Buscar bayas con olor a vinagre, exudado y larvas de Drosophila.",
      },
    ],
  },
};

export const ESTADOS_FENOLOGICOS: Record<string, string[]> = {
  cereza: [
    "A — Reposo invernal",
    "B — Yemas hinchadas",
    "C — Puntas verdes",
    "D — Botón floral visible",
    "E — Sépalos separados (botón blanco)",
    "F — Plena floración (>50% flores abiertas)",
    "G — Cuajado / Pétalo caído",
    "H — Fruto tamaño guisante",
    "I — Endurecimiento del carozo",
    "J — Inicio coloración / Maduración",
    "K — Post-cosecha",
  ],
  uva_mesa: [
    "01 — Reposo / Yema invernal",
    "05 — Lloro activo",
    "09 — Yema algodonosa",
    "11 — 1-2 hojas desplegadas",
    "13 — 3-4 hojas desplegadas",
    "15 — 5-6 hojas / Pámpanos 10-15 cm",
    "17 — 8-10 hojas",
    "57 — Inflorescencia visible",
    "61 — Inicio floración",
    "65 — Plena floración (>50%)",
    "71 — Cuajado / Grano de perdigón",
    "73 — Grano de arveja",
    "77 — Cierre de racimo",
    "81 — Inicio pinta",
    "89 — Madurez cosecha",
    "93 — Post-cosecha / Agostamiento",
  ],
};

export const INCIDENCIA_CONFIG: Record<
  number,
  { label: string; short: string; color: string; bg: string; border: string }
> = {
  0: { label: "Sin presencia", short: "0", color: "#15803d", bg: "#f0fdf4", border: "#86efac" },
  1: { label: "Mínima (<5%)", short: "1", color: "#65a30d", bg: "#f7fee7", border: "#bef264" },
  2: { label: "Baja (5-25%)", short: "2", color: "#d97706", bg: "#fffbeb", border: "#fcd34d" },
  3: { label: "Media (25-50%)", short: "3", color: "#ea580c", bg: "#fff7ed", border: "#fdba74" },
  4: { label: "Alta / Sobre umbral (>50%)", short: "4", color: "#dc2626", bg: "#fef2f2", border: "#fca5a5" },
};

export function getChecklist(especie: string): ChecklistEspecie | null {
  const n = especie.toLowerCase();
  if (n.includes("cereza")) return CHECKLISTS.cereza;
  if (n.includes("uva") || n.includes("vid") || n.includes("vitis")) return CHECKLISTS.uva_mesa;
  return null;
}

export function getEstadosFenologicos(especie: string): string[] {
  const n = especie.toLowerCase();
  if (n.includes("cereza")) return ESTADOS_FENOLOGICOS.cereza;
  if (n.includes("uva") || n.includes("vid") || n.includes("vitis")) return ESTADOS_FENOLOGICOS.uva_mesa;
  return [];
}

export function getAllItems(checklist: ChecklistEspecie): ChecklistItem[] {
  return [...checklist.plagas, ...checklist.enfermedades];
}
