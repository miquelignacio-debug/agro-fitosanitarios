-- migration_v16_rls.sql
-- Row Level Security para todas las tablas de la app
-- Ejecutar en Supabase SQL Editor

-- ── Función auxiliar (SECURITY DEFINER bypasea RLS para leer el rol) ──────────
CREATE OR REPLACE FUNCTION current_user_rol()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT rol FROM usuarios WHERE id = auth.uid()
$$;

-- ── empresas ──────────────────────────────────────────────────────────────────
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "empresas_select" ON empresas;
CREATE POLICY "empresas_select" ON empresas FOR SELECT TO authenticated USING (true);

-- ── usuarios ──────────────────────────────────────────────────────────────────
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "usuarios_select"  ON usuarios;
DROP POLICY IF EXISTS "usuarios_update"  ON usuarios;
DROP POLICY IF EXISTS "usuarios_insert"  ON usuarios;
DROP POLICY IF EXISTS "usuarios_delete"  ON usuarios;
-- Cada usuario ve su propia fila; admin ve todas
CREATE POLICY "usuarios_select" ON usuarios FOR SELECT TO authenticated
  USING (id = auth.uid() OR current_user_rol() = 'admin');
CREATE POLICY "usuarios_update" ON usuarios FOR UPDATE TO authenticated
  USING (current_user_rol() = 'admin');
CREATE POLICY "usuarios_insert" ON usuarios FOR INSERT TO authenticated
  WITH CHECK (current_user_rol() = 'admin');
CREATE POLICY "usuarios_delete" ON usuarios FOR DELETE TO authenticated
  USING (current_user_rol() = 'admin');

-- ── productos ─────────────────────────────────────────────────────────────────
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "productos_select" ON productos;
DROP POLICY IF EXISTS "productos_write"  ON productos;
CREATE POLICY "productos_select" ON productos FOR SELECT TO authenticated USING (true);
CREATE POLICY "productos_write"  ON productos FOR ALL    TO authenticated
  USING (current_user_rol() = 'admin')
  WITH CHECK (current_user_rol() = 'admin');

-- ── cuarteles ─────────────────────────────────────────────────────────────────
ALTER TABLE cuarteles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cuarteles_select" ON cuarteles;
DROP POLICY IF EXISTS "cuarteles_write"  ON cuarteles;
CREATE POLICY "cuarteles_select" ON cuarteles FOR SELECT TO authenticated USING (true);
CREATE POLICY "cuarteles_write"  ON cuarteles FOR ALL    TO authenticated
  USING (current_user_rol() = 'admin')
  WITH CHECK (current_user_rol() = 'admin');

-- ── operadores ────────────────────────────────────────────────────────────────
ALTER TABLE operadores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "operadores_select" ON operadores;
DROP POLICY IF EXISTS "operadores_write"  ON operadores;
CREATE POLICY "operadores_select" ON operadores FOR SELECT TO authenticated USING (true);
CREATE POLICY "operadores_write"  ON operadores FOR ALL    TO authenticated
  USING (current_user_rol() = 'admin')
  WITH CHECK (current_user_rol() = 'admin');

-- ── personal ──────────────────────────────────────────────────────────────────
ALTER TABLE personal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "personal_select" ON personal;
DROP POLICY IF EXISTS "personal_write"  ON personal;
CREATE POLICY "personal_select" ON personal FOR SELECT TO authenticated USING (true);
CREATE POLICY "personal_write"  ON personal FOR ALL    TO authenticated
  USING (current_user_rol() = 'admin')
  WITH CHECK (current_user_rol() = 'admin');

-- ── maquinaria ────────────────────────────────────────────────────────────────
ALTER TABLE maquinaria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "maquinaria_select" ON maquinaria;
DROP POLICY IF EXISTS "maquinaria_write"  ON maquinaria;
CREATE POLICY "maquinaria_select" ON maquinaria FOR SELECT TO authenticated USING (true);
CREATE POLICY "maquinaria_write"  ON maquinaria FOR ALL    TO authenticated
  USING (current_user_rol() = 'admin')
  WITH CHECK (current_user_rol() = 'admin');

-- ── ordenes_trabajo ───────────────────────────────────────────────────────────
ALTER TABLE ordenes_trabajo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ot_select" ON ordenes_trabajo;
DROP POLICY IF EXISTS "ot_insert" ON ordenes_trabajo;
DROP POLICY IF EXISTS "ot_update" ON ordenes_trabajo;
DROP POLICY IF EXISTS "ot_delete" ON ordenes_trabajo;
CREATE POLICY "ot_select" ON ordenes_trabajo FOR SELECT TO authenticated USING (true);
CREATE POLICY "ot_insert" ON ordenes_trabajo FOR INSERT TO authenticated
  WITH CHECK (current_user_rol() IN ('admin', 'operador'));
CREATE POLICY "ot_update" ON ordenes_trabajo FOR UPDATE TO authenticated
  USING (current_user_rol() IN ('admin', 'operador'));
CREATE POLICY "ot_delete" ON ordenes_trabajo FOR DELETE TO authenticated
  USING (current_user_rol() = 'admin');

-- ── ot_cuarteles ──────────────────────────────────────────────────────────────
ALTER TABLE ot_cuarteles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ot_cuarteles_select" ON ot_cuarteles;
DROP POLICY IF EXISTS "ot_cuarteles_write"  ON ot_cuarteles;
CREATE POLICY "ot_cuarteles_select" ON ot_cuarteles FOR SELECT TO authenticated USING (true);
CREATE POLICY "ot_cuarteles_write"  ON ot_cuarteles FOR ALL    TO authenticated
  USING (current_user_rol() IN ('admin', 'operador'))
  WITH CHECK (current_user_rol() IN ('admin', 'operador'));

-- ── ot_aplicadores ────────────────────────────────────────────────────────────
ALTER TABLE ot_aplicadores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ot_aplicadores_select" ON ot_aplicadores;
DROP POLICY IF EXISTS "ot_aplicadores_write"  ON ot_aplicadores;
CREATE POLICY "ot_aplicadores_select" ON ot_aplicadores FOR SELECT TO authenticated USING (true);
CREATE POLICY "ot_aplicadores_write"  ON ot_aplicadores FOR ALL    TO authenticated
  USING (current_user_rol() IN ('admin', 'operador'))
  WITH CHECK (current_user_rol() IN ('admin', 'operador'));

-- ── ot_productos ──────────────────────────────────────────────────────────────
ALTER TABLE ot_productos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ot_productos_select" ON ot_productos;
DROP POLICY IF EXISTS "ot_productos_write"  ON ot_productos;
CREATE POLICY "ot_productos_select" ON ot_productos FOR SELECT TO authenticated USING (true);
CREATE POLICY "ot_productos_write"  ON ot_productos FOR ALL    TO authenticated
  USING (current_user_rol() IN ('admin', 'operador'))
  WITH CHECK (current_user_rol() IN ('admin', 'operador'));

-- ── stock_movimientos ─────────────────────────────────────────────────────────
ALTER TABLE stock_movimientos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sm_select" ON stock_movimientos;
DROP POLICY IF EXISTS "sm_insert" ON stock_movimientos;
DROP POLICY IF EXISTS "sm_update" ON stock_movimientos;
DROP POLICY IF EXISTS "sm_delete" ON stock_movimientos;
CREATE POLICY "sm_select" ON stock_movimientos FOR SELECT TO authenticated USING (true);
CREATE POLICY "sm_insert" ON stock_movimientos FOR INSERT TO authenticated
  WITH CHECK (current_user_rol() IN ('admin', 'operador'));
CREATE POLICY "sm_update" ON stock_movimientos FOR UPDATE TO authenticated
  USING (current_user_rol() = 'admin');
CREATE POLICY "sm_delete" ON stock_movimientos FOR DELETE TO authenticated
  USING (current_user_rol() = 'admin');

-- ── plagas_objetivo (si existe) ───────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'plagas_objetivo') THEN
    EXECUTE 'ALTER TABLE plagas_objetivo ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "plagas_select" ON plagas_objetivo';
    EXECUTE 'DROP POLICY IF EXISTS "plagas_write"  ON plagas_objetivo';
    EXECUTE 'CREATE POLICY "plagas_select" ON plagas_objetivo FOR SELECT TO authenticated USING (true)';
    EXECUTE 'CREATE POLICY "plagas_write"  ON plagas_objetivo FOR ALL TO authenticated USING (current_user_rol() = ''admin'') WITH CHECK (current_user_rol() = ''admin'')';
  END IF;
END $$;

-- ── proveedores (si existe) ───────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'proveedores') THEN
    EXECUTE 'ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "prov_select" ON proveedores';
    EXECUTE 'DROP POLICY IF EXISTS "prov_write"  ON proveedores';
    EXECUTE 'CREATE POLICY "prov_select" ON proveedores FOR SELECT TO authenticated USING (true)';
    EXECUTE 'CREATE POLICY "prov_write"  ON proveedores FOR ALL TO authenticated USING (current_user_rol() = ''admin'') WITH CHECK (current_user_rol() = ''admin'')';
  END IF;
END $$;
