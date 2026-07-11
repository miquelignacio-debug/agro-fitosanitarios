-- Migration v11: Concentración del ingrediente activo (requerido GGAP)
-- Ejecutar en Supabase > SQL Editor

ALTER TABLE productos ADD COLUMN IF NOT EXISTS concentracion_ia text;

-- Verificar
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'productos' AND column_name = 'concentracion_ia';
