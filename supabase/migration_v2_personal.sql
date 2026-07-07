-- ============================================================
-- Migración v2: tabla personal + actualizar FKs en ordenes_trabajo
-- Pegar en el SQL Editor de Supabase y ejecutar
-- URL: https://supabase.com/dashboard/project/rsjqmbfrnzkkhcalwdng/sql/new
-- ============================================================

-- 1. Crear tabla personal (personal de campo sin cuenta de acceso)
CREATE TABLE IF NOT EXISTS personal (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     text NOT NULL,
  rut        text,
  cargo      text,
  activo     boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE personal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON personal FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. Reemplazar FKs de ordenes_trabajo: usuarios → personal
--    (Las columnas solicitante_id, responsable_id, dosificador_id se mantienen iguales,
--     solo cambia la tabla referenciada.)

ALTER TABLE ordenes_trabajo
  DROP CONSTRAINT IF EXISTS ordenes_trabajo_solicitante_id_fkey,
  DROP CONSTRAINT IF EXISTS ordenes_trabajo_responsable_id_fkey,
  DROP CONSTRAINT IF EXISTS ordenes_trabajo_dosificador_id_fkey;

ALTER TABLE ordenes_trabajo
  ADD CONSTRAINT ordenes_trabajo_solicitante_id_fkey  FOREIGN KEY (solicitante_id)  REFERENCES personal(id),
  ADD CONSTRAINT ordenes_trabajo_responsable_id_fkey  FOREIGN KEY (responsable_id)  REFERENCES personal(id),
  ADD CONSTRAINT ordenes_trabajo_dosificador_id_fkey  FOREIGN KEY (dosificador_id)  REFERENCES personal(id);
