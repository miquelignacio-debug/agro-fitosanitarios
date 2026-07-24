-- migration_v19_setup.sql
-- Setup inicial: empresas Santa Camila y Quillaico, superadmin miquel.ignacio@gmail.com.
-- Renombra rol 'operador' → 'encargado' si hubiera usuarios previos con ese rol.
-- Ejecutar DESPUÉS de migration_v17 y migration_v18.
-- Ejecutar en Supabase > SQL Editor

-- ── 1. Renombrar rol operador → encargado (usuarios existentes) ──────────────
-- Esto maneja el caso de que alguien haya creado usuarios con rol 'operador'
-- antes de ejecutar v18 (que ya usa 'encargado' en el constraint).
-- Se hace antes de alterar el constraint para evitar violación.
DO $$
BEGIN
  -- Solo ejecutar si el constraint aún incluye 'operador'
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name
    WHERE tc.table_name = 'usuarios' AND cc.check_clause LIKE '%operador%'
  ) THEN
    -- Temporalmente eliminar constraint para poder actualizar datos
    ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
    UPDATE usuarios SET rol = 'encargado' WHERE rol = 'operador';
    ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
      CHECK (rol IN ('admin', 'encargado', 'visualizador', 'superadmin'));
  ELSE
    -- Constraint ya fue actualizado por v18; solo migrar datos si existen
    UPDATE usuarios SET rol = 'encargado' WHERE rol = 'operador';
  END IF;
END $$;

-- ── 2. Crear empresas Santa Camila y Quillaico ───────────────────────────────
INSERT INTO empresas (nombre)
SELECT 'Santa Camila'
WHERE NOT EXISTS (SELECT 1 FROM empresas WHERE nombre = 'Santa Camila');

INSERT INTO empresas (nombre)
SELECT 'Quillaico'
WHERE NOT EXISTS (SELECT 1 FROM empresas WHERE nombre = 'Quillaico');

-- ── 3. Configurar superadmin ─────────────────────────────────────────────────
-- Upsert del usuario en tabla usuarios con rol superadmin y empresa_id NULL.
-- Si el registro no existe aún (primer login pendiente), lo crea.
DO $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'miquel.ignacio@gmail.com' LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Usuario miquel.ignacio@gmail.com no encontrado en auth.users. Verificar que haya iniciado sesión al menos una vez.';
    RETURN;
  END IF;

  INSERT INTO usuarios (id, nombre, rol, empresa_id)
  VALUES (v_user_id, 'Miquel Ignacio', 'superadmin', NULL)
  ON CONFLICT (id) DO UPDATE
    SET rol = 'superadmin',
        empresa_id = NULL;

  RAISE NOTICE 'Superadmin configurado: % (%)', 'miquel.ignacio@gmail.com', v_user_id;
END $$;

-- ── 4. Verificación ──────────────────────────────────────────────────────────
SELECT 'empresas' AS tabla, nombre, id::text AS detalle FROM empresas ORDER BY nombre;
SELECT 'usuario superadmin' AS tabla, nombre, rol, empresa_id::text AS empresa_id
FROM usuarios WHERE rol = 'superadmin';