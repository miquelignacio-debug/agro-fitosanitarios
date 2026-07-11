-- Migration v7: Productos sin registro SAG (manuales)
-- Fertilizantes foliares, bioestimulantes y coadyuvantes del inventario
-- Ejecutar en Supabase > SQL Editor
-- La inserción es segura: ignora productos que ya existan con el mismo nombre

INSERT INTO productos (nombre_comercial, tipo_funcion, fuente, activo, phi_dias, rei_horas)
SELECT nombre_comercial, tipo_funcion, 'manual', true, 0, 0
FROM (VALUES
  ('Advance Zinc',         ARRAY['FERTILIZANTE FOLIAR']),
  ('Aminochem',            ARRAY['FERTILIZANTE FOLIAR', 'BIOESTIMULANTE']),
  ('Azote',                ARRAY['FERTILIZANTE FOLIAR']),
  ('basfoliar algae',      ARRAY['FERTILIZANTE FOLIAR', 'BIOESTIMULANTE']),
  ('Basfoliar Ca Sl',      ARRAY['FERTILIZANTE FOLIAR']),
  ('basfoliar kelp',       ARRAY['FERTILIZANTE FOLIAR', 'BIOESTIMULANTE']),
  ('Basfoliar MN ZN',      ARRAY['FERTILIZANTE FOLIAR']),
  ('Basfoliar ZN FLO',     ARRAY['FERTILIZANTE FOLIAR']),
  ('bestcure',             ARRAY['FUNGUICIDA', 'BIOESTIMULANTE']),
  ('Biotron plus',         ARRAY['BIOESTIMULANTE']),
  ('Consist Full',         ARRAY['FERTILIZANTE FOLIAR']),
  ('Cytoplant 400',        ARRAY['BIOESTIMULANTE', 'FITORREGULADOR']),
  ('En Vivo',              ARRAY['BIOESTIMULANTE']),
  ('Erger',                ARRAY['BIOESTIMULANTE']),
  ('Foli Zyme',            ARRAY['BIOESTIMULANTE']),
  ('Fosfonat 40-20 sl',    ARRAY['FERTILIZANTE FOLIAR']),
  ('Kelpak',               ARRAY['BIOESTIMULANTE']),
  ('Macroquel',            ARRAY['FERTILIZANTE FOLIAR']),
  ('Mad 100',              ARRAY['BIOESTIMULANTE']),
  ('Megafol',              ARRAY['BIOESTIMULANTE', 'FERTILIZANTE FOLIAR']),
  ('Molimax',              ARRAY['FERTILIZANTE FOLIAR']),
  ('NutriCalcio',          ARRAY['FERTILIZANTE FOLIAR']),
  ('NutriMagnesio',        ARRAY['FERTILIZANTE FOLIAR']),
  ('NutriPotasio',         ARRAY['FERTILIZANTE FOLIAR']),
  ('Phostin Ca',           ARRAY['FERTILIZANTE FOLIAR']),
  ('Poly Mn-Zn',           ARRAY['FERTILIZANTE FOLIAR']),
  ('Retenol',              ARRAY['BIOESTIMULANTE']),
  ('Ripper Full SL',       ARRAY['BIOESTIMULANTE', 'FERTILIZANTE FOLIAR']),
  ('Sett',                 ARRAY['FERTILIZANTE FOLIAR']),
  ('Sillikum',             ARRAY['OTRO']),
  ('silwet 100 tx',        ARRAY['OTRO']),
  ('Springer',             ARRAY['OTRO']),
  ('Sprint Color',         ARRAY['BIOESTIMULANTE']),
  ('Stimulate Fruit Sizer',ARRAY['BIOESTIMULANTE', 'FITORREGULADOR']),
  ('Strepto Plus',         ARRAY['BACTERICIDA']),
  ('Tecbom',               ARRAY['FERTILIZANTE FOLIAR']),
  ('Triple PH',            ARRAY['OTRO']),
  ('Vitazyme',             ARRAY['BIOESTIMULANTE'])
) AS nuevos(nombre_comercial, tipo_funcion)
WHERE NOT EXISTS (
  SELECT 1 FROM productos p
  WHERE LOWER(p.nombre_comercial) = LOWER(nuevos.nombre_comercial)
);

-- Verificar cuántos se insertaron:
SELECT nombre_comercial, tipo_funcion, fuente
FROM productos
WHERE fuente = 'manual'
  AND nombre_comercial = ANY(ARRAY[
    'Advance Zinc','Aminochem','Azote','basfoliar algae','Basfoliar Ca Sl',
    'basfoliar kelp','Basfoliar MN ZN','Basfoliar ZN FLO','bestcure','Biotron plus',
    'Consist Full','Cytoplant 400','En Vivo','Erger','Foli Zyme','Fosfonat 40-20 sl',
    'Kelpak','Macroquel','Mad 100','Megafol','Molimax','NutriCalcio','NutriMagnesio',
    'NutriPotasio','Phostin Ca','Poly Mn-Zn','Retenol','Ripper Full','Sett','Sillikum',
    'silwet 100 tx','Springer','Sprint Color','Stimulate Fruit Sizer','Strepto Plus',
    'Tecbom','Triple PH','Vitazyme'
  ])
ORDER BY nombre_comercial;
