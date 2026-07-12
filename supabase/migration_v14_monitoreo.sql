-- =============================================================
-- v14: Módulo de monitoreo fenológico y sanitario
-- =============================================================
-- ATENCIÓN: Este migration ELIMINA la tabla 'monitoreos' existente
-- (versión simplificada sin checklists). Si hay datos importantes,
-- exportarlos antes de ejecutar.
-- =============================================================

-- 1. Eliminar tabla antigua
DROP TABLE IF EXISTS monitoreos CASCADE;

-- 2. Sesiones de monitoreo (reemplaza la tabla simple anterior)
CREATE TABLE IF NOT EXISTS monitoreos (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero                  integer NOT NULL,
  empresa_id              uuid NOT NULL REFERENCES empresas(id),
  cuartel_id              uuid NOT NULL REFERENCES cuarteles(id),
  monitor_id              uuid REFERENCES personal(id),
  fecha                   date NOT NULL DEFAULT CURRENT_DATE,
  hora_inicio             time,
  hora_fin                time,
  especie                 text NOT NULL,
  estado_fenologico       text NOT NULL,
  temperatura_c           numeric(5,1),
  humedad_pct             numeric(5,1),
  observaciones_generales text,
  foto_general_url        text,
  estado                  text DEFAULT 'borrador'
                          CHECK (estado IN ('borrador','enviado','revisado')),
  revisor_id              uuid REFERENCES personal(id),
  fecha_revision          date,
  notas_revision          text,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now(),
  UNIQUE(empresa_id, numero)
);

-- 3. Líneas de monitoreo (una por problema del checklist)
CREATE TABLE IF NOT EXISTS monitoreo_lineas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monitoreo_id  uuid NOT NULL REFERENCES monitoreos(id) ON DELETE CASCADE,
  problema      text NOT NULL,
  tipo          text NOT NULL CHECK (tipo IN ('plaga','enfermedad')),
  metodologia   text NOT NULL,
  presencia     boolean NOT NULL DEFAULT false,
  incidencia    integer NOT NULL DEFAULT 0 CHECK (incidencia BETWEEN 0 AND 4),
  observaciones text,
  foto_url      text,
  created_at    timestamptz DEFAULT now()
);

-- 4. RLS
ALTER TABLE monitoreos ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitoreo_lineas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'monitoreos' AND policyname = 'auth_all'
  ) THEN
    CREATE POLICY "auth_all" ON monitoreos FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'monitoreo_lineas' AND policyname = 'auth_all'
  ) THEN
    CREATE POLICY "auth_all" ON monitoreo_lineas FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 5. Número correlativo por empresa
CREATE OR REPLACE FUNCTION siguiente_numero_monitoreo(p_empresa_id uuid)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE v_next integer;
BEGIN
  SELECT COALESCE(MAX(numero), 0) + 1 INTO v_next
  FROM monitoreos WHERE empresa_id = p_empresa_id;
  RETURN v_next;
END;
$$;

-- 6. Storage bucket para fotos de monitoreo
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'monitoreo-fotos',
  'monitoreo-fotos',
  true,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'monitoreo_fotos_auth'
  ) THEN
    CREATE POLICY "monitoreo_fotos_auth" ON storage.objects
    FOR ALL TO authenticated
    USING (bucket_id = 'monitoreo-fotos')
    WITH CHECK (bucket_id = 'monitoreo-fotos');
  END IF;
END $$;
