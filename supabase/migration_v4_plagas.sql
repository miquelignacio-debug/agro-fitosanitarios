-- Migration v4: Catálogo de Plagas / Enfermedades / Objetivos
-- Ejecutar en Supabase > SQL Editor

CREATE TABLE IF NOT EXISTS plagas_objetivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  tipo text NOT NULL DEFAULT 'plaga' CHECK (tipo IN ('plaga', 'enfermedad', 'nutritivo', 'manejo')),
  activo boolean NOT NULL DEFAULT true,
  UNIQUE(nombre)
);

ALTER TABLE plagas_objetivos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'plagas_objetivos' AND policyname = 'auth_all'
  ) THEN
    CREATE POLICY "auth_all" ON plagas_objetivos FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Carga inicial (extraída de Programa fitosanitario 25-26 + estándar cerezos/vides)
INSERT INTO plagas_objetivos (nombre, tipo) VALUES
  -- PLAGAS
  ('Arañita Roja',               'plaga'),
  ('Arañita - Eriófidos',        'plaga'),
  ('Chanchito Blanco',           'plaga'),
  ('Cochylis',                   'plaga'),
  ('Cochinilla',                 'plaga'),
  ('Escama San José',            'plaga'),
  ('Filoxera',                   'plaga'),
  ('Mosca de la Fruta',          'plaga'),
  ('Polilla',                    'plaga'),
  ('Pulgón',                     'plaga'),
  ('Pulgón Lanígero',            'plaga'),
  ('Psila',                      'plaga'),
  ('Trips',                      'plaga'),
  ('Tortrícidos',                'plaga'),
  -- ENFERMEDADES
  ('Alternaria',                 'enfermedad'),
  ('Antracnosis',                'enfermedad'),
  ('Bacteriosis',                'enfermedad'),
  ('Botrytis',                   'enfermedad'),
  ('Cáncer Bacterial',           'enfermedad'),
  ('Cloca',                      'enfermedad'),
  ('Corineo',                    'enfermedad'),
  ('Enfermedades de Madera',     'enfermedad'),
  ('Esclerotinia',               'enfermedad'),
  ('Fusarium',                   'enfermedad'),
  ('Mildiu',                     'enfermedad'),
  ('Monilinia',                  'enfermedad'),
  ('Oidio',                      'enfermedad'),
  ('Pudrición Gris',             'enfermedad'),
  -- NUTRITIVO
  ('Amino Ácidos',               'nutritivo'),
  ('Bioestimulante',             'nutritivo'),
  ('Calcio',                     'nutritivo'),
  ('Calcio + Boro',              'nutritivo'),
  ('Fertilizante Foliar',        'nutritivo'),
  ('Fierro',                     'nutritivo'),
  ('Giberélico',                 'nutritivo'),
  ('Magnesio',                   'nutritivo'),
  ('Manganeso + Zinc',           'nutritivo'),
  ('Silicio - Potasio',          'nutritivo'),
  ('Urea',                       'nutritivo'),
  ('Zinc',                       'nutritivo'),
  -- MANEJO
  ('Antibiótico',                'manejo'),
  ('Cerrado de Yemas',           'manejo'),
  ('Control de Vigor',           'manejo'),
  ('Crecimiento de Bayas',       'manejo'),
  ('Emparejar Brotación',        'manejo'),
  ('Favorecer Cuaja',            'manejo'),
  ('Homogenizador de Brotación', 'manejo'),
  ('Recolonización Microorganismos', 'manejo'),
  ('Rompedor de Dormancia',      'manejo')
ON CONFLICT (nombre) DO NOTHING;
