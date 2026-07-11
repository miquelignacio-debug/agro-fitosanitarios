-- Migration v10: Vincular ot_aplicadores con la tabla personal
-- Ejecutar en Supabase > SQL Editor

-- Hacer nullable el operador_id (era requerido, FK a operadores)
ALTER TABLE ot_aplicadores ALTER COLUMN operador_id DROP NOT NULL;

-- Agregar personal_id para vincular con la tabla personal de Ajustes
ALTER TABLE ot_aplicadores ADD COLUMN IF NOT EXISTS personal_id uuid REFERENCES personal(id) ON DELETE SET NULL;

-- Verificar resultado
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_name = 'ot_aplicadores'
ORDER BY ordinal_position;
