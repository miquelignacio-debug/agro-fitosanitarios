-- ============================================================
-- agro-fitosanitarios — Setup completo
-- Pegar TODO en el SQL Editor de Supabase y ejecutar
-- URL: https://supabase.com/dashboard/project/rsjqmbfrnzkkhcalwdng/sql/new
-- ============================================================

-- ── Empresas ─────────────────────────────────────────────────
CREATE TABLE empresas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text NOT NULL,
  rut         text,
  created_at  timestamptz DEFAULT now()
);

INSERT INTO empresas (nombre, rut) VALUES
  ('Agrícola Santa Camila', NULL),
  ('Agrícola Quillaico',    NULL);

-- ── Usuarios ─────────────────────────────────────────────────
CREATE TABLE usuarios (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre     text NOT NULL,
  rut        text,
  rol        text NOT NULL DEFAULT 'admin' CHECK (rol IN ('admin', 'operador')),
  created_at timestamptz DEFAULT now()
);

-- ── Cuarteles ─────────────────────────────────────────────────
CREATE TABLE cuarteles (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         uuid NOT NULL REFERENCES empresas(id),
  codigo             text NOT NULL,
  especie            text NOT NULL,
  variedad           text NOT NULL,
  patron             text,
  año_plantacion     integer,
  marco_plantacion   text,
  plantas_por_ha     integer,
  plantas_reales     integer,
  superficie_real    numeric(8,2),
  hileras            integer,
  activo             boolean DEFAULT true,
  created_at         timestamptz DEFAULT now(),
  UNIQUE(empresa_id, codigo)
);

-- ── Operadores (aplicadores) ──────────────────────────────────
CREATE TABLE operadores (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     text NOT NULL,
  rut        text NOT NULL,
  activo     boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

INSERT INTO operadores (nombre, rut) VALUES
  ('Jorge Pino', '95768091');
-- Agregar los otros 2 operadores desde la app

-- ── Maquinaria ────────────────────────────────────────────────
CREATE TABLE maquinaria (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo         text NOT NULL CHECK (tipo IN ('tractor', 'pulverizadora', 'otro')),
  codigo       text NOT NULL,
  descripcion  text,
  capacidad_lt numeric(10,2),
  operador_id  uuid REFERENCES operadores(id),
  activo       boolean DEFAULT true,
  created_at   timestamptz DEFAULT now()
);

INSERT INTO maquinaria (tipo, codigo, descripcion, capacidad_lt) VALUES
  ('tractor',        'MF1',    'Massey Ferguson 1', NULL),
  ('pulverizadora',  'Jacto 1','Jacto 1',           2000.00);

-- ── Productos (catálogo SAG + manual) ─────────────────────────
CREATE TABLE productos (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_comercial     text NOT NULL,
  numero_registro      text,
  ingrediente_activo   text,
  tipo_funcion         text[],
  formulacion          text,
  unidad_dosis         text,
  phi_dias             integer DEFAULT 0,
  rei_horas            integer DEFAULT 0,
  especies_autorizadas text[],
  max_ia_descripcion   text,
  activo               boolean DEFAULT true,
  fuente               text DEFAULT 'manual' CHECK (fuente IN ('sag', 'manual')),
  created_at           timestamptz DEFAULT now(),
  UNIQUE(numero_registro)
);

-- ── Stock — movimientos ────────────────────────────────────────
CREATE TABLE stock_movimientos (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id             uuid NOT NULL REFERENCES empresas(id),
  producto_id            uuid NOT NULL REFERENCES productos(id),
  tipo                   text NOT NULL CHECK (tipo IN (
                           'entrada', 'salida', 'transferencia_salida', 'transferencia_entrada'
                         )),
  cantidad               numeric(12,3) NOT NULL,
  unidad                 text NOT NULL,
  fecha                  date NOT NULL,
  documento_tipo         text CHECK (documento_tipo IN ('guia_despacho','factura')),
  documento_numero       text,
  proveedor              text,
  ot_id                  uuid,
  empresa_contraparte_id uuid REFERENCES empresas(id),
  notas                  text,
  usuario_id             uuid REFERENCES usuarios(id),
  created_at             timestamptz DEFAULT now()
);

-- Vista: stock actual por empresa/producto
CREATE VIEW stock_actual AS
SELECT
  empresa_id,
  producto_id,
  SUM(CASE
    WHEN tipo IN ('entrada','transferencia_entrada') THEN cantidad
    WHEN tipo IN ('salida','transferencia_salida')   THEN -cantidad
    ELSE 0
  END) AS cantidad_disponible
FROM stock_movimientos
GROUP BY empresa_id, producto_id;

-- ── Órdenes de Trabajo ────────────────────────────────────────
CREATE TABLE ordenes_trabajo (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero                    integer NOT NULL,
  empresa_id                uuid NOT NULL REFERENCES empresas(id),
  campo                     text,
  fecha_solicitud           date DEFAULT CURRENT_DATE,
  fecha_aplicacion          date,
  hora_inicio               time,
  hora_fin                  time,
  solicitante_id            uuid REFERENCES usuarios(id),
  responsable_id            uuid REFERENCES usuarios(id),
  dosificador_id            uuid REFERENCES usuarios(id),
  funcion                   text[],
  plagas_objetivo           text,
  objetivo_principal        text,
  objetivo_secundario       text,
  mojamiento_solicitado_ltha numeric(10,2),
  mojamiento_real_ltha       numeric(10,2),
  enjuage_pulverizador_lt    numeric(10,2) DEFAULT 0,
  viento_kmh                numeric(6,2),
  temperatura_c              numeric(5,1),
  ppe_traje                 boolean DEFAULT false,
  ppe_guantes               boolean DEFAULT false,
  ppe_anteojos              boolean DEFAULT false,
  ppe_gorro                 boolean DEFAULT false,
  ppe_mascarilla            boolean DEFAULT false,
  ppe_botas                 boolean DEFAULT false,
  estado                    text DEFAULT 'borrador' CHECK (
                              estado IN ('borrador','emitida','en_ejecucion','finalizada','anulada')
                            ),
  notas                     text,
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now(),
  UNIQUE(empresa_id, numero)
);

CREATE TABLE ot_cuarteles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ot_id       uuid NOT NULL REFERENCES ordenes_trabajo(id) ON DELETE CASCADE,
  cuartel_id  uuid NOT NULL REFERENCES cuarteles(id),
  superficie_ha numeric(8,2) NOT NULL
);

CREATE TABLE ot_aplicadores (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ot_id               uuid NOT NULL REFERENCES ordenes_trabajo(id) ON DELETE CASCADE,
  operador_id         uuid NOT NULL REFERENCES operadores(id),
  tractor_id          uuid REFERENCES maquinaria(id),
  pulverizador_id     uuid REFERENCES maquinaria(id),
  cantidad_maquinadas numeric(8,2)
);

CREATE TABLE ot_productos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ot_id               uuid NOT NULL REFERENCES ordenes_trabajo(id) ON DELETE CASCADE,
  producto_id         uuid NOT NULL REFERENCES productos(id),
  dosis_real          numeric(12,4) NOT NULL,
  dosis_unidad        text NOT NULL,
  carencia_dias       integer DEFAULT 0,
  rei_horas           integer DEFAULT 0,
  fecha_viable        date,
  consumo_total       numeric(12,3),
  dosis_por_maquinada numeric(12,4)
);

-- ── Función: número correlativo de OT ────────────────────────
CREATE OR REPLACE FUNCTION siguiente_numero_ot(p_empresa_id uuid)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE v_next integer;
BEGIN
  SELECT COALESCE(MAX(numero), 0) + 1
  INTO v_next
  FROM ordenes_trabajo
  WHERE empresa_id = p_empresa_id;
  RETURN v_next;
END;
$$;

-- ── Trigger: crear registro en usuarios al registrarse ────────
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO usuarios (id, nombre, rol)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'rol', 'admin')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE empresas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuarteles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios           ENABLE ROW LEVEL SECURITY;
ALTER TABLE operadores         ENABLE ROW LEVEL SECURITY;
ALTER TABLE maquinaria         ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movimientos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordenes_trabajo    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ot_cuarteles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ot_aplicadores     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ot_productos       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON empresas          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON cuarteles         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON usuarios          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON operadores        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON maquinaria        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON productos         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON stock_movimientos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON ordenes_trabajo   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON ot_cuarteles      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON ot_aplicadores    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON ot_productos      FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Insertar usuario Ignacio (ya creado en Auth) ──────────────
-- Su auth user fue creado antes del schema, así que el trigger no pudo correr.
-- Insertamos su registro manualmente.
INSERT INTO usuarios (id, nombre, rol)
VALUES ('ce9d524f-e198-48d2-9346-d2b2335f3c25', 'Ignacio Miquel', 'admin')
ON CONFLICT (id) DO NOTHING;
