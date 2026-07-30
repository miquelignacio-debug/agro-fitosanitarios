-- ============================================================
-- Migration: Programa Fitosanitario tracking en ordenes_trabajo
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

ALTER TABLE ordenes_trabajo
  ADD COLUMN IF NOT EXISTS programa_etapa_id     UUID    REFERENCES programa_etapas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS es_adicional_programa BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_ot_programa_etapa
  ON ordenes_trabajo(programa_etapa_id)
  WHERE programa_etapa_id IS NOT NULL;