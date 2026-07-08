-- ============================================================
-- Migración v3: monitoreos + precio/stock_minimo en productos
-- Pegar en el SQL Editor de Supabase y ejecutar
-- URL: https://supabase.com/dashboard/project/rsjqmbfrnzkkhcalwdng/sql/new
-- ============================================================

-- 1. Tabla de monitoreos de plagas
CREATE TABLE IF NOT EXISTS monitoreos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid REFERENCES empresas(id) ON DELETE CASCADE,
  cuartel_id  uuid REFERENCES cuarteles(id) ON DELETE SET NULL,
  fecha       date NOT NULL DEFAULT CURRENT_DATE,
  plaga       text NOT NULL,
  nivel       text NOT NULL CHECK (nivel IN ('bajo', 'medio', 'alto', 'sobre_umbral')),
  decision    text,
  notas       text,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE monitoreos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON monitoreos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. Precio de costo y stock mínimo por producto
ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS precio_costo  numeric,
  ADD COLUMN IF NOT EXISTS stock_minimo  numeric DEFAULT 0;
