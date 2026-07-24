-- migration_v18_multitenancy.sql
-- Multi-tenancy completo: cada usuario queda aislado a su empresa.
-- - Agrega empresa_id a usuarios, personal, operadores, maquinaria
-- - Agrega rol 'superadmin' (acceso a todas las empresas)
-- - Reemplaza todas las políticas RLS de v16 con filtros por empresa
-- - productos: catálogo global SAG compartido (solo superadmin puede editar)
-- - proveedores: catálogo global compartido (todos pueden ver, admin puede editar)
-- Ejecutar en Supabase > SQL Editor

-- ── 1. Agregar 'superadmin' al constraint de rol ─────────────────────────────
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('admin', 'encargado', 'visualizador', 'superadmin'));

-- ── 2. Agregar empresa_id a tablas operacionales ─────────────────────────────
ALTER TABLE usuarios   ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES empresas(id) ON DELETE SET NULL;
ALTER TABLE personal   ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE operadores ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE maquinaria ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES empresas(id) ON DELETE CASCADE;

-- ── 3. Migrar datos existentes a la empresa más antigua ──────────────────────
-- Todos los registros sin empresa_id quedan asignados a la primera empresa.
-- Si tenés más de una empresa, ajustá manualmente después.
DO $$
DECLARE v_empresa_id uuid;
BEGIN
  SELECT id INTO v_empresa_id FROM empresas ORDER BY created_at ASC LIMIT 1;
  IF v_empresa_id IS NOT NULL THEN
    UPDATE personal   SET empresa_id = v_empresa_id WHERE empresa_id IS NULL;
    UPDATE operadores SET empresa_id = v_empresa_id WHERE empresa_id IS NULL;
    UPDATE maquinaria SET empresa_id = v_empresa_id WHERE empresa_id IS NULL;
    -- usuarios: solo los que no son superadmin
    UPDATE usuarios   SET empresa_id = v_empresa_id WHERE empresa_id IS NULL AND rol != 'superadmin';
  END IF;
END $$;

-- ── 4. Funciones auxiliares (SECURITY DEFINER) ───────────────────────────────
-- Devuelve la empresa_id del usuario autenticado (NULL si es superadmin)
CREATE OR REPLACE FUNCTION get_my_empresa_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT empresa_id FROM usuarios WHERE id = auth.uid();
$$;

-- Devuelve true si el usuario autenticado es superadmin
CREATE OR REPLACE FUNCTION is_super_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT rol = 'superadmin' FROM usuarios WHERE id = auth.uid()), false);
$$;

-- Mantener current_user_rol() para compatibilidad con código existente
CREATE OR REPLACE FUNCTION current_user_rol()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT rol FROM usuarios WHERE id = auth.uid();
$$;

-- ── 5. Reemplazar políticas RLS ───────────────────────────────────────────────
-- Patrón: SELECT filtra por empresa. Escritura filtra por empresa + rol.
-- Superadmin tiene acceso irrestricto a todo.

-- ── empresas ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "empresas_select" ON empresas;
DROP POLICY IF EXISTS "empresas_all"    ON empresas;
CREATE POLICY "empresas_select" ON empresas FOR SELECT TO authenticated
  USING (id = get_my_empresa_id() OR is_super_admin());
CREATE POLICY "empresas_all" ON empresas FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ── usuarios ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "usuarios_select" ON usuarios;
DROP POLICY IF EXISTS "usuarios_insert" ON usuarios;
DROP POLICY IF EXISTS "usuarios_update" ON usuarios;
DROP POLICY IF EXISTS "usuarios_delete" ON usuarios;
-- Cada usuario ve su propia fila y las de su empresa; admin ve su empresa; superadmin ve todo
CREATE POLICY "usuarios_select" ON usuarios FOR SELECT TO authenticated
  USING (id = auth.uid() OR empresa_id = get_my_empresa_id() OR is_super_admin());
CREATE POLICY "usuarios_insert" ON usuarios FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin() OR
    (empresa_id = get_my_empresa_id() AND current_user_rol() = 'admin')
  );
CREATE POLICY "usuarios_update" ON usuarios FOR UPDATE TO authenticated
  USING (
    is_super_admin() OR
    (empresa_id = get_my_empresa_id() AND current_user_rol() = 'admin')
  );
CREATE POLICY "usuarios_delete" ON usuarios FOR DELETE TO authenticated
  USING (
    is_super_admin() OR
    (empresa_id = get_my_empresa_id() AND current_user_rol() = 'admin')
  );

-- ── productos (catálogo global SAG — lectura todos; insertar/editar admin+encargado; eliminar superadmin) ─
DROP POLICY IF EXISTS "productos_select"        ON productos;
DROP POLICY IF EXISTS "productos_write"         ON productos;
DROP POLICY IF EXISTS "productos_insert"        ON productos;
DROP POLICY IF EXISTS "productos_update"        ON productos;
DROP POLICY IF EXISTS "productos_delete"        ON productos;
DROP POLICY IF EXISTS "productos_precio_update" ON productos;
CREATE POLICY "productos_select" ON productos FOR SELECT TO authenticated USING (true);
CREATE POLICY "productos_insert" ON productos FOR INSERT TO authenticated
  WITH CHECK (current_user_rol() IN ('admin', 'encargado', 'superadmin'));
CREATE POLICY "productos_update" ON productos FOR UPDATE TO authenticated
  USING    (current_user_rol() IN ('admin', 'encargado', 'superadmin'))
  WITH CHECK (current_user_rol() IN ('admin', 'encargado', 'superadmin'));
CREATE POLICY "productos_delete" ON productos FOR DELETE TO authenticated
  USING (is_super_admin());

-- ── cuarteles ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cuarteles_select" ON cuarteles;
DROP POLICY IF EXISTS "cuarteles_write"  ON cuarteles;
CREATE POLICY "cuarteles_select" ON cuarteles FOR SELECT TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin());
CREATE POLICY "cuarteles_write"  ON cuarteles FOR ALL    TO authenticated
  USING    ((empresa_id = get_my_empresa_id() OR is_super_admin()) AND current_user_rol() IN ('admin', 'superadmin'))
  WITH CHECK ((empresa_id = get_my_empresa_id() OR is_super_admin()) AND current_user_rol() IN ('admin', 'superadmin'));

-- ── personal ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "personal_select" ON personal;
DROP POLICY IF EXISTS "personal_write"  ON personal;
CREATE POLICY "personal_select" ON personal FOR SELECT TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin());
CREATE POLICY "personal_write"  ON personal FOR ALL    TO authenticated
  USING    (empresa_id = get_my_empresa_id() OR is_super_admin())
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin());

-- ── operadores ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "operadores_select" ON operadores;
DROP POLICY IF EXISTS "operadores_write"  ON operadores;
CREATE POLICY "operadores_select" ON operadores FOR SELECT TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin());
CREATE POLICY "operadores_write"  ON operadores FOR ALL    TO authenticated
  USING    (empresa_id = get_my_empresa_id() OR is_super_admin())
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin());

-- ── maquinaria ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "maquinaria_select" ON maquinaria;
DROP POLICY IF EXISTS "maquinaria_write"  ON maquinaria;
CREATE POLICY "maquinaria_select" ON maquinaria FOR SELECT TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin());
CREATE POLICY "maquinaria_write"  ON maquinaria FOR ALL    TO authenticated
  USING    (empresa_id = get_my_empresa_id() OR is_super_admin())
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin());

-- ── ordenes_trabajo ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "ot_select" ON ordenes_trabajo;
DROP POLICY IF EXISTS "ot_insert" ON ordenes_trabajo;
DROP POLICY IF EXISTS "ot_update" ON ordenes_trabajo;
DROP POLICY IF EXISTS "ot_delete" ON ordenes_trabajo;
CREATE POLICY "ot_select" ON ordenes_trabajo FOR SELECT TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin());
CREATE POLICY "ot_insert" ON ordenes_trabajo FOR INSERT TO authenticated
  WITH CHECK (
    (empresa_id = get_my_empresa_id() OR is_super_admin()) AND
    current_user_rol() IN ('admin', 'encargado', 'superadmin')
  );
CREATE POLICY "ot_update" ON ordenes_trabajo FOR UPDATE TO authenticated
  USING (
    (empresa_id = get_my_empresa_id() OR is_super_admin()) AND
    current_user_rol() IN ('admin', 'encargado', 'superadmin')
  );
CREATE POLICY "ot_delete" ON ordenes_trabajo FOR DELETE TO authenticated
  USING (
    (empresa_id = get_my_empresa_id() OR is_super_admin()) AND
    current_user_rol() IN ('admin', 'superadmin')
  );

-- ── ot_cuarteles (aislamiento vía OT padre) ───────────────────────────────────
DROP POLICY IF EXISTS "ot_cuarteles_select" ON ot_cuarteles;
DROP POLICY IF EXISTS "ot_cuarteles_write"  ON ot_cuarteles;
CREATE POLICY "ot_cuarteles_select" ON ot_cuarteles FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ordenes_trabajo WHERE id = ot_cuarteles.ot_id
    AND (empresa_id = get_my_empresa_id() OR is_super_admin())
  ));
CREATE POLICY "ot_cuarteles_write" ON ot_cuarteles FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ordenes_trabajo WHERE id = ot_cuarteles.ot_id
    AND (empresa_id = get_my_empresa_id() OR is_super_admin())
  ) AND current_user_rol() IN ('admin', 'encargado', 'superadmin'))
  WITH CHECK (EXISTS (
    SELECT 1 FROM ordenes_trabajo WHERE id = ot_cuarteles.ot_id
    AND (empresa_id = get_my_empresa_id() OR is_super_admin())
  ) AND current_user_rol() IN ('admin', 'encargado', 'superadmin'));

-- ── ot_aplicadores ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "ot_aplicadores_select" ON ot_aplicadores;
DROP POLICY IF EXISTS "ot_aplicadores_write"  ON ot_aplicadores;
CREATE POLICY "ot_aplicadores_select" ON ot_aplicadores FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ordenes_trabajo WHERE id = ot_aplicadores.ot_id
    AND (empresa_id = get_my_empresa_id() OR is_super_admin())
  ));
CREATE POLICY "ot_aplicadores_write" ON ot_aplicadores FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ordenes_trabajo WHERE id = ot_aplicadores.ot_id
    AND (empresa_id = get_my_empresa_id() OR is_super_admin())
  ) AND current_user_rol() IN ('admin', 'encargado', 'superadmin'))
  WITH CHECK (EXISTS (
    SELECT 1 FROM ordenes_trabajo WHERE id = ot_aplicadores.ot_id
    AND (empresa_id = get_my_empresa_id() OR is_super_admin())
  ) AND current_user_rol() IN ('admin', 'encargado', 'superadmin'));

-- ── ot_productos ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "ot_productos_select" ON ot_productos;
DROP POLICY IF EXISTS "ot_productos_write"  ON ot_productos;
CREATE POLICY "ot_productos_select" ON ot_productos FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ordenes_trabajo WHERE id = ot_productos.ot_id
    AND (empresa_id = get_my_empresa_id() OR is_super_admin())
  ));
CREATE POLICY "ot_productos_write" ON ot_productos FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ordenes_trabajo WHERE id = ot_productos.ot_id
    AND (empresa_id = get_my_empresa_id() OR is_super_admin())
  ) AND current_user_rol() IN ('admin', 'encargado', 'superadmin'))
  WITH CHECK (EXISTS (
    SELECT 1 FROM ordenes_trabajo WHERE id = ot_productos.ot_id
    AND (empresa_id = get_my_empresa_id() OR is_super_admin())
  ) AND current_user_rol() IN ('admin', 'encargado', 'superadmin'));

-- ── stock_movimientos ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "sm_select" ON stock_movimientos;
DROP POLICY IF EXISTS "sm_insert" ON stock_movimientos;
DROP POLICY IF EXISTS "sm_update" ON stock_movimientos;
DROP POLICY IF EXISTS "sm_delete" ON stock_movimientos;
CREATE POLICY "sm_select" ON stock_movimientos FOR SELECT TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin());
CREATE POLICY "sm_insert" ON stock_movimientos FOR INSERT TO authenticated
  WITH CHECK (
    (empresa_id = get_my_empresa_id() OR is_super_admin()) AND
    current_user_rol() IN ('admin', 'encargado', 'superadmin')
  );
CREATE POLICY "sm_update" ON stock_movimientos FOR UPDATE TO authenticated
  USING (
    (empresa_id = get_my_empresa_id() OR is_super_admin()) AND
    current_user_rol() IN ('admin', 'superadmin')
  );
CREATE POLICY "sm_delete" ON stock_movimientos FOR DELETE TO authenticated
  USING (
    (empresa_id = get_my_empresa_id() OR is_super_admin()) AND
    current_user_rol() IN ('admin', 'superadmin')
  );

-- ── proveedores (catálogo global — todos leen, admin/superadmin editan) ────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='proveedores') THEN
    EXECUTE 'DROP POLICY IF EXISTS "prov_select" ON proveedores';
    EXECUTE 'DROP POLICY IF EXISTS "prov_write"  ON proveedores';
    EXECUTE 'CREATE POLICY "prov_select" ON proveedores FOR SELECT TO authenticated USING (true)';
    EXECUTE 'CREATE POLICY "prov_write"  ON proveedores FOR ALL    TO authenticated
      USING    (current_user_rol() IN (''admin'', ''superadmin''))
      WITH CHECK (current_user_rol() IN (''admin'', ''superadmin''))';
  END IF;
END $$;

-- ── 6. Verificación ──────────────────────────────────────────────────────────
SELECT
  table_name,
  COUNT(*) AS policies
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY table_name
ORDER BY table_name;