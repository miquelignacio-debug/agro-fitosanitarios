-- Migration v5: Tabla de Proveedores
-- Ejecutar en Supabase > SQL Editor

CREATE TABLE IF NOT EXISTS proveedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  UNIQUE(nombre)
);

ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'proveedores' AND policyname = 'auth_all'
  ) THEN
    CREATE POLICY "auth_all" ON proveedores FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
