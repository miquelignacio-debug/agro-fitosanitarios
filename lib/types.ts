// ── Master types matching Supabase schema ─────────────────────

export type Empresa = {
  id: string;
  nombre: string;
  rut: string | null;
  created_at: string;
};

export type Usuario = {
  id: string;
  nombre: string;
  rut: string | null;
  rol: "admin" | "operador";
  created_at: string;
};

export type Cuartel = {
  id: string;
  empresa_id: string;
  codigo: string;
  especie: string;
  variedad: string;
  patron: string | null;
  año_plantacion: number | null;
  marco_plantacion: string | null;
  plantas_por_ha: number | null;
  plantas_reales: number | null;
  superficie_real: number | null;
  hileras: number | null;
  activo: boolean;
  created_at: string;
};

export type Operador = {
  id: string;
  nombre: string;
  rut: string;
  activo: boolean;
  created_at: string;
};

export type Personal = {
  id: string;
  nombre: string;
  rut: string | null;
  cargo: string | null;
  activo: boolean;
  created_at: string;
};

export type Maquinaria = {
  id: string;
  tipo: "tractor" | "implemento" | "otro";
  codigo: string;
  descripcion: string | null;
  capacidad_lt: number | null;
  operador_id: string | null;
  activo: boolean;
  created_at: string;
};

export type Producto = {
  id: string;
  nombre_comercial: string;
  numero_registro: string | null;
  ingrediente_activo: string | null;
  tipo_funcion: string[] | null;
  formulacion: string | null;
  unidad_dosis: string | null;
  phi_dias: number;
  rei_horas: number;
  especies_autorizadas: string[] | null;
  concentracion_ia: string | null;
  unidad_bodega: "lt" | "kg" | null;
  max_ia_descripcion: string | null;
  activo: boolean;
  fuente: "sag" | "manual";
  precio_costo: number | null;
  stock_minimo: number | null;
  created_at: string;
};

export type StockMovimiento = {
  id: string;
  empresa_id: string;
  producto_id: string;
  tipo: "entrada" | "salida" | "transferencia_salida" | "transferencia_entrada" | "ajuste_entrada" | "ajuste_salida";
  cantidad: number;
  unidad: string;
  fecha: string;
  documento_tipo: "guia_despacho" | "factura" | null;
  documento_numero: string | null;
  proveedor: string | null;
  precio_unitario: number | null;
  costo_unitario: number | null;
  ot_id: string | null;
  empresa_contraparte_id: string | null;
  notas: string | null;
  usuario_id: string | null;
  created_at: string;
  // joins
  producto?: Producto;
  empresa?: Empresa;
  empresa_contraparte?: Empresa;
};

export type StockActual = {
  empresa_id: string;
  producto_id: string;
  cantidad_disponible: number;
  producto?: Producto;
};

export type OrdenTrabajo = {
  id: string;
  numero: number;
  empresa_id: string;
  campo: string | null;
  fecha_solicitud: string;
  fecha_aplicacion: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  solicitante_id: string | null;
  responsable_id: string | null;
  dosificador_id: string | null;
  funcion: string[] | null;
  plagas_objetivo: string | null;
  objetivo_principal: string | null;
  objetivo_secundario: string | null;
  mojamiento_solicitado_ltha: number | null;
  mojamiento_real_ltha: number | null;
  enjuage_pulverizador_lt: number | null;
  viento_kmh: number | null;
  temperatura_c: number | null;
  ppe_traje: boolean;
  ppe_guantes: boolean;
  ppe_anteojos: boolean;
  ppe_gorro: boolean;
  ppe_mascarilla: boolean;
  ppe_botas: boolean;
  estado: "borrador" | "emitida" | "en_ejecucion" | "finalizada" | "anulada";
  notas: string | null;
  created_at: string;
  updated_at: string;
  // joins
  empresa?: Empresa;
  solicitante?: Personal;
  responsable?: Personal;
  dosificador?: Personal;
  cuarteles?: OtCuartelConDetalle[];
  aplicadores?: OtAplicadorConDetalle[];
  productos?: OtProductoConDetalle[];
};

export type OtCuartel = {
  id: string;
  ot_id: string;
  cuartel_id: string;
  superficie_ha: number;
};

export type OtCuartelConDetalle = OtCuartel & {
  cuartel: Cuartel;
};

export type OtAplicador = {
  id: string;
  ot_id: string;
  operador_id: string | null;
  personal_id: string | null;
  tractor_id: string | null;
  pulverizador_id: string | null;
  cantidad_maquinadas: number | null;
};

export type OtAplicadorConDetalle = OtAplicador & {
  operador?: Operador;
  personal?: Personal;
  tractor?: Maquinaria;
  pulverizador?: Maquinaria;
};

export type OtProducto = {
  id: string;
  ot_id: string;
  producto_id: string;
  dosis_real: number;
  dosis_unidad: string;
  carencia_dias: number;
  rei_horas: number;
  fecha_viable: string | null;
  consumo_total: number | null;
  dosis_por_maquinada: number | null;
};

export type OtProductoConDetalle = OtProducto & {
  producto: Producto;
};

// ── Tipos auxiliares ──────────────────────────────────────────

export const FUNCIONES_FITOSANITARIAS = [
  "FUNGUICIDA",
  "INSECTICIDA",
  "ACARICIDA",
  "HERBICIDA",
  "FITORREGULADOR",
  "BIOESTIMULANTE",
  "FERTILIZANTE FOLIAR",
  "NEMATICIDA",
  "BACTERICIDA",
  "OTRO",
] as const;

export const OBJETIVOS_APLICACION = [
  "Control de Plagas",
  "Control de Enfermedades",
  "Control de Malezas",
  "Nutrición Foliar",
  "Fitorregulación",
  "Bioestimulación",
  "Otro",
] as const;

export const ESTADOS_OT: Record<OrdenTrabajo["estado"], string> = {
  borrador: "Borrador",
  emitida: "Emitida",
  en_ejecucion: "En ejecución",
  finalizada: "Finalizada",
  anulada: "Anulada",
};

export const ESTADOS_OT_COLOR: Record<OrdenTrabajo["estado"], string> = {
  borrador: "#6b7280",
  emitida: "#1d4ed8",
  en_ejecucion: "#d97706",
  finalizada: "#15803d",
  anulada: "#dc2626",
};
