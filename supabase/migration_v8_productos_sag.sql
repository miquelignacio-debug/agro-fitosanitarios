-- Migration v8: Productos con registro SAG faltantes + manuales adicionales
-- Ejecutar DESPUÉS de migration_v7_productos_manuales.sql
-- Ejecutar en Supabase > SQL Editor

-- 1. Productos CON registro SAG
INSERT INTO productos (nombre_comercial, ingrediente_activo, tipo_funcion, phi_dias, rei_horas, fuente, activo)
SELECT nombre_comercial, ingrediente_activo, tipo_funcion, phi_dias, rei_horas, 'sag', true
FROM (VALUES
  ('PROPERTY',        'Piriofenona',                 ARRAY['FUNGUICIDA'],              1,  12),
  ('QUADRIS',         'Azoxistrobina',               ARRAY['FUNGUICIDA'],             14,  12),
  ('Scala 400 SC',    'Pirimetanil',                 ARRAY['FUNGUICIDA'],              7,  12),
  ('Score 250 EC',    'Difenoconazol',               ARRAY['FUNGUICIDA'],             14,  24),
  ('Serenade Aso',    'Bacillus subtilis',           ARRAY['FUNGUICIDA'],              0,   4),
  ('Sivanto Prime',   'Flupyradifurone',             ARRAY['INSECTICIDA'],             7,   4),
  ('Switch 62,5 WG',  'Ciprodinil + Fludioxonil',   ARRAY['FUNGUICIDA'],              7,  12),
  ('Syllit 400 SC',   'Dodina',                      ARRAY['FUNGUICIDA'],             28,  24),
  ('Teldor 500 SC',   'Fenhexamid',                  ARRAY['FUNGUICIDA'],              7,  12),
  ('Timorex Gold',    'Aceite de árbol de té',       ARRAY['FUNGUICIDA'],              1,  12),
  ('Topas 200 EW',    'Penconazol',                  ARRAY['FUNGUICIDA'],             14,  24),
  ('Trebon 30 EC',    'Etofenprox',                  ARRAY['INSECTICIDA'],             3,  12),
  ('Paraquat 276 SL', 'Paraquat',                    ARRAY['HERBICIDA'],              15,  48),
  ('Ambligo 150 sc',  'Abamectina',                  ARRAY['ACARICIDA'],              14,  12),
  ('Botrytis Stop',       'Bacillus subtilis',                          ARRAY['FUNGUICIDA'],   0,   4),
  ('Invicto 50 sc',       'Lambda-cihalotrina',                         ARRAY['INSECTICIDA'],  7,  24),
  ('U46M',                'MCPA',                                        ARRAY['HERBICIDA'],   15,  48),
  ('Vibrance Integral',   'Sedaxane + Difenoconazol + Thiamethoxam',    ARRAY['FUNGUICIDA', 'INSECTICIDA'], 0, 12),
  ('Vivando',             'Metrafenona',                                 ARRAY['FUNGUICIDA'],  21,  12)
) AS n(nombre_comercial, ingrediente_activo, tipo_funcion, phi_dias, rei_horas)
WHERE NOT EXISTS (
  SELECT 1 FROM productos p WHERE LOWER(p.nombre_comercial) = LOWER(n.nombre_comercial)
);

-- 2. Productos SIN registro SAG no incluidos en v7
INSERT INTO productos (nombre_comercial, tipo_funcion, phi_dias, rei_horas, fuente, activo)
SELECT nombre_comercial, tipo_funcion, 0, 0, 'manual', true
FROM (VALUES
  ('Kamab 26-S', ARRAY['BIOESTIMULANTE'])
) AS n(nombre_comercial, tipo_funcion)
WHERE NOT EXISTS (
  SELECT 1 FROM productos p WHERE LOWER(p.nombre_comercial) = LOWER(n.nombre_comercial)
);

-- 3. Correcciones sobre productos ya insertados por v7
-- Strepto Plus: tiene registro SAG (bactericida)
UPDATE productos
SET fuente = 'sag',
    ingrediente_activo = 'Sulfato de estreptomicina',
    phi_dias = 0,
    rei_horas = 4
WHERE LOWER(nombre_comercial) = 'strepto plus';

-- Verificar resultado
SELECT nombre_comercial, ingrediente_activo, tipo_funcion, phi_dias, rei_horas, fuente
FROM productos
WHERE LOWER(nombre_comercial) = ANY(ARRAY[
  'property','quadris','scala 400 sc','score 250 ec','serenade aso',
  'sivanto prime','switch 62,5 wg','syllit 400 sc','teldor 500 sc',
  'timorex gold','topas 200 ew','trebon 30 ec','paraquat 276 sl',
  'ambligo 150 sc','botrytis stop','invicto 50 sc','kamab 26-s','strepto plus',
  'u46m','vibrance integral','vivando'
])
ORDER BY nombre_comercial;
