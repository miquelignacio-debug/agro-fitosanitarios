-- Migration v12: Unidad de bodega explícita por producto
-- Ejecutar en Supabase > SQL Editor

ALTER TABLE productos ADD COLUMN IF NOT EXISTS unidad_bodega text CHECK (unidad_bodega IN ('lt', 'kg'));

-- Verificar
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'productos' AND column_name = 'unidad_bodega';
