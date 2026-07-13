-- migration_v15_roles.sql
-- Ejecutar en Supabase SQL Editor
-- Implementa: roles (admin/operador/visualizador), tipos de salida venta/devolución

-- ── 1. Agregar rol visualizador a usuarios ────────────────────────────────────
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('admin', 'operador', 'visualizador'));

-- ── 2. Agregar tipos salida_venta y salida_devolucion a stock_movimientos ─────
ALTER TABLE stock_movimientos DROP CONSTRAINT IF EXISTS stock_movimientos_tipo_check;
ALTER TABLE stock_movimientos ADD CONSTRAINT stock_movimientos_tipo_check
  CHECK (tipo IN (
    'entrada', 'salida', 'salida_barbecho',
    'transferencia_salida', 'transferencia_entrada',
    'ajuste_entrada', 'ajuste_salida',
    'salida_venta', 'salida_devolucion'
  ));

-- ── 3. Actualizar vista stock_actual (incluye nuevas salidas en el cálculo) ───
CREATE OR REPLACE VIEW stock_actual AS
SELECT empresa_id, producto_id,
  SUM(CASE
    WHEN tipo IN ('entrada', 'transferencia_entrada', 'ajuste_entrada')
      THEN cantidad
    WHEN tipo IN ('salida', 'salida_barbecho', 'transferencia_salida', 'ajuste_salida',
                  'salida_venta', 'salida_devolucion')
      THEN -cantidad
    ELSE 0
  END) AS cantidad_disponible
FROM stock_movimientos
GROUP BY empresa_id, producto_id
HAVING SUM(CASE
  WHEN tipo IN ('entrada', 'transferencia_entrada', 'ajuste_entrada')
    THEN cantidad
  WHEN tipo IN ('salida', 'salida_barbecho', 'transferencia_salida', 'ajuste_salida',
                'salida_venta', 'salida_devolucion')
    THEN -cantidad
  ELSE 0
END) > 0;

-- ── 4. Crear usuarios en auth.users ──────────────────────────────────────────
-- Si ya los creaste desde el Dashboard, este bloque es seguro: el IF NOT EXISTS
-- lo saltea y el paso 5 asigna los roles igualmente.
DO $$
DECLARE
  v_franco_id uuid;
  v_andres_id uuid;
BEGIN
  -- Franco Reyes (operador)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'contratista.francoreyes@gmail.com') THEN
    v_franco_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, aud, role
    ) VALUES (
      v_franco_id,
      'contratista.francoreyes@gmail.com',
      crypt('1234567890', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"nombre":"Franco Reyes","rol":"operador"}',
      now(), now(), 'authenticated', 'authenticated'
    );
    BEGIN
      INSERT INTO auth.identities (
        user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
      ) VALUES (
        v_franco_id,
        jsonb_build_object('sub', v_franco_id::text, 'email', 'contratista.francoreyes@gmail.com'),
        'email', 'contratista.francoreyes@gmail.com',
        now(), now(), now()
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  -- Andrés Hevia (visualizador)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'ahevia3@uc.cl') THEN
    v_andres_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, aud, role
    ) VALUES (
      v_andres_id,
      'ahevia3@uc.cl',
      crypt('1234567890', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"nombre":"Andrés Hevia","rol":"visualizador"}',
      now(), now(), 'authenticated', 'authenticated'
    );
    BEGIN
      INSERT INTO auth.identities (
        user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
      ) VALUES (
        v_andres_id,
        jsonb_build_object('sub', v_andres_id::text, 'email', 'ahevia3@uc.cl'),
        'email', 'ahevia3@uc.cl',
        now(), now(), now()
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
END $$;

-- ── 5. Asignar roles en tabla usuarios (idempotente) ─────────────────────────
DO $$
DECLARE
  v_ignacio_id uuid;
  v_franco_id  uuid;
  v_andres_id  uuid;
BEGIN
  SELECT id INTO v_ignacio_id FROM auth.users WHERE email = 'imiquel@scamila.cl';
  SELECT id INTO v_franco_id  FROM auth.users WHERE email = 'contratista.francoreyes@gmail.com';
  SELECT id INTO v_andres_id  FROM auth.users WHERE email = 'ahevia3@uc.cl';

  IF v_ignacio_id IS NOT NULL THEN
    INSERT INTO usuarios (id, nombre, rol) VALUES (v_ignacio_id, 'Ignacio Miquel', 'admin')
    ON CONFLICT (id) DO UPDATE SET rol = 'admin';
  END IF;

  IF v_franco_id IS NOT NULL THEN
    INSERT INTO usuarios (id, nombre, rol) VALUES (v_franco_id, 'Franco Reyes', 'operador')
    ON CONFLICT (id) DO UPDATE SET rol = 'operador', nombre = 'Franco Reyes';
  END IF;

  IF v_andres_id IS NOT NULL THEN
    INSERT INTO usuarios (id, nombre, rol) VALUES (v_andres_id, 'Andrés Hevia', 'visualizador')
    ON CONFLICT (id) DO UPDATE SET rol = 'visualizador', nombre = 'Andrés Hevia';
  END IF;
END $$;
