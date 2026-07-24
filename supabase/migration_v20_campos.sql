-- migration_v20_campos.sql
-- Agrega concepto "Campo" (predio) dentro de una empresa.
-- - Crea tabla campos (id, nombre, empresa_id)
-- - Agrega campo_id a cuarteles, ordenes_trabajo, stock_movimientos
-- - Inserta campos "Santa Camila" y "Quillaico" en Agrícola Santa Camila
-- - Asigna todos los registros existentes al campo Santa Camila por defecto
-- - Elimina empresa "Agrícola Quillaico" (era duplicado)
-- Ejecutar en Supabase > SQL Editor DESPUÉS de migration_v18 y v19

-- ── 1. Crear tabla campos ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text NOT NULL,
  empresa_id  uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (nombre, empresa_id)
);
ALTER TABLE campos ENABLE ROW LEVEL SECURITY;

-- ── 2. Agregar campo_id a tablas operacionales ────────────────────────────────
ALTER TABLE cuarteles         ADD COLUMN IF NOT EXISTS campo_id uuid REFERENCES campos(id) ON DELETE SET NULL;
ALTER TABLE ordenes_trabajo   ADD COLUMN IF NOT EXISTS campo_id uuid REFERENCES campos(id) ON DELETE SET NULL;
ALTER TABLE stock_movimientos ADD COLUMN IF NOT EXISTS campo_id uuid REFERENCES campos(id) ON DELETE SET NULL;

-- ── 3. Crear índices ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cuarteles_campo_id         ON cuarteles(campo_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_trabajo_campo_id   ON ordenes_trabajo(campo_id);
CREATE INDEX IF NOT EXISTS idx_stock_movimientos_campo_id ON stock_movimientos(campo_id);

-- ── 4. Insertar campos y asignar datos existentes ────────────────────────────
DO $$
DECLARE
  v_empresa_id uuid;
  v_campo_sc   uuid;
  v_campo_q    uuid;
BEGIN
  SELECT id INTO v_empresa_id FROM empresas WHERE nombre = 'Agrícola Santa Camila' LIMIT 1;

  IF v_empresa_id IS NULL THEN
    RAISE NOTICE 'No se encontró la empresa "Agrícola Santa Camila". Verificar nombre exacto.';
    RETURN;
  END IF;

  -- Insertar campos (idempotente)
  INSERT INTO campos (nombre, empresa_id)
  VALUES ('Santa Camila', v_empresa_id)
  ON CONFLICT (nombre, empresa_id) DO NOTHING
  RETURNING id INTO v_campo_sc;

  -- Si ya existía, obtener el id
  IF v_campo_sc IS NULL THEN
    SELECT id INTO v_campo_sc FROM campos WHERE nombre = 'Santa Camila' AND empresa_id = v_empresa_id;
  END IF;

  INSERT INTO campos (nombre, empresa_id)
  VALUES ('Quillaico', v_empresa_id)
  ON CONFLICT (nombre, empresa_id) DO NOTHING
  RETURNING id INTO v_campo_q;

  IF v_campo_q IS NULL THEN
    SELECT id INTO v_campo_q FROM campos WHERE nombre = 'Quillaico' AND empresa_id = v_empresa_id;
  END IF;

  -- Asignar todos los registros existentes al campo Santa Camila por defecto
  UPDATE cuarteles         SET campo_id = v_campo_sc WHERE empresa_id = v_empresa_id AND campo_id IS NULL;
  UPDATE ordenes_trabajo   SET campo_id = v_campo_sc WHERE empresa_id = v_empresa_id AND campo_id IS NULL;
  UPDATE stock_movimientos SET campo_id = v_campo_sc WHERE empresa_id = v_empresa_id AND campo_id IS NULL;

  RAISE NOTICE 'Campos creados: Santa Camila (%), Quillaico (%)', v_campo_sc, v_campo_q;
  RAISE NOTICE 'Registros existentes asignados al campo Santa Camila.';
END $$;

-- ── 5. Reasignar registros de Agrícola Quillaico → Agrícola Santa Camila ─────
-- Mueve cuarteles, órdenes, bodega, personal, maquinaria al campo Quillaico
-- de la empresa Santa Camila antes de eliminar la empresa Quillaico.
DO $$
DECLARE
  v_empresa_sc uuid;
  v_empresa_q  uuid;
  v_campo_q    uuid;
BEGIN
  SELECT id INTO v_empresa_sc FROM empresas WHERE nombre = 'Agrícola Santa Camila' LIMIT 1;
  SELECT id INTO v_empresa_q  FROM empresas WHERE nombre = 'Agrícola Quillaico'    LIMIT 1;

  IF v_empresa_q IS NULL THEN
    RAISE NOTICE 'Empresa "Agrícola Quillaico" no encontrada (ya fue eliminada). OK.';
    RETURN;
  END IF;

  SELECT id INTO v_campo_q FROM campos WHERE nombre = 'Quillaico' AND empresa_id = v_empresa_sc LIMIT 1;

  UPDATE cuarteles         SET empresa_id = v_empresa_sc, campo_id = v_campo_q WHERE empresa_id = v_empresa_q;
  UPDATE ordenes_trabajo   SET empresa_id = v_empresa_sc, campo_id = v_campo_q WHERE empresa_id = v_empresa_q;
  UPDATE stock_movimientos SET empresa_id = v_empresa_sc, campo_id = v_campo_q WHERE empresa_id = v_empresa_q;
  UPDATE personal          SET empresa_id = v_empresa_sc WHERE empresa_id = v_empresa_q;
  UPDATE operadores        SET empresa_id = v_empresa_sc WHERE empresa_id = v_empresa_q;
  UPDATE maquinaria        SET empresa_id = v_empresa_sc WHERE empresa_id = v_empresa_q;
  UPDATE usuarios          SET empresa_id = v_empresa_sc WHERE empresa_id = v_empresa_q AND rol != 'superadmin';

  RAISE NOTICE 'Registros de Agrícola Quillaico reasignados a Agrícola Santa Camila / campo Quillaico.';
END $$;

-- ── 6. Eliminar empresa Agrícola Quillaico (ahora sin registros dependientes) ─
DELETE FROM empresas WHERE nombre = 'Agrícola Quillaico';

-- ── 6. RLS para campos ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "campos_select" ON campos;
DROP POLICY IF EXISTS "campos_write"  ON campos;
CREATE POLICY "campos_select" ON campos FOR SELECT TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin());
CREATE POLICY "campos_write" ON campos FOR ALL TO authenticated
  USING    (is_super_admin() OR (empresa_id = get_my_empresa_id() AND current_user_rol() IN ('admin', 'superadmin')))
  WITH CHECK (is_super_admin() OR (empresa_id = get_my_empresa_id() AND current_user_rol() IN ('admin', 'superadmin')));

-- ── 7. Verificación ──────────────────────────────────────────────────────────
SELECT 'empresas' AS tabla, nombre FROM empresas ORDER BY nombre;
SELECT 'campos' AS tabla, c.nombre AS campo, e.nombre AS empresa
FROM campos c JOIN empresas e ON c.empresa_id = e.id ORDER BY e.nombre, c.nombre;
SELECT 'cuarteles sin campo' AS check, COUNT(*) FROM cuarteles WHERE campo_id IS NULL;
SELECT 'ordenes sin campo'   AS check, COUNT(*) FROM ordenes_trabajo WHERE campo_id IS NULL;