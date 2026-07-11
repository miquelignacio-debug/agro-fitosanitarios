-- Migration v6: Bodega valorizada + Toma de inventario mensual
-- Ejecutar en Supabase > SQL Editor

-- 1. Columnas de precio/costo en movimientos de stock
ALTER TABLE stock_movimientos
  ADD COLUMN IF NOT EXISTS precio_unitario numeric,
  ADD COLUMN IF NOT EXISTS costo_unitario  numeric;

-- 2. Extender el tipo CHECK para incluir ajustes de inventario
DO $$ BEGIN
  BEGIN
    ALTER TABLE stock_movimientos DROP CONSTRAINT stock_movimientos_tipo_check;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
  ALTER TABLE stock_movimientos ADD CONSTRAINT stock_movimientos_tipo_check
    CHECK (tipo IN ('entrada','salida','transferencia_entrada','transferencia_salida','ajuste_entrada','ajuste_salida'));
END $$;

-- 3. Sesiones de toma de inventario
CREATE TABLE IF NOT EXISTS inventarios_toma (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES empresas(id) ON DELETE CASCADE,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  notas text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE inventarios_toma ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'inventarios_toma' AND policyname = 'auth_all'
  ) THEN
    CREATE POLICY "auth_all" ON inventarios_toma FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 4. Líneas de cada toma
CREATE TABLE IF NOT EXISTS inventarios_toma_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  toma_id uuid REFERENCES inventarios_toma(id) ON DELETE CASCADE,
  producto_id uuid REFERENCES productos(id),
  unidad text,
  stock_sistema numeric NOT NULL DEFAULT 0,
  stock_real numeric NOT NULL DEFAULT 0,
  costo_unitario numeric,
  movimiento_id uuid
);
ALTER TABLE inventarios_toma_lineas ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'inventarios_toma_lineas' AND policyname = 'auth_all'
  ) THEN
    CREATE POLICY "auth_all" ON inventarios_toma_lineas FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
