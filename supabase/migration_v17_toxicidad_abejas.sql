-- Migration v17: Toxicidad para abejas (Ley Apícola N° 20.786)
-- Los productos clasificados como 'toxico' o 'moderadamente_toxico' obligan
-- a avisar al SAG y apicultores SIPEC con 48h de anticipación.
-- Fuente: ingrediente activo, base PPDB (University of Hertfordshire),
--         fichas EFSA, y registro de plaguicidas SAG Chile.
-- Ejecutar en Supabase > SQL Editor

-- ── 1. Agregar columna ─────────────────────────────────────────────────────────
ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS toxicidad_abejas text
  CHECK (toxicidad_abejas IN ('toxico', 'moderadamente_toxico', 'poco_toxico', 'no_toxico'));

-- ── 2. TÓXICOS para abejas — aviso 48h obligatorio ────────────────────────────
-- Piretroides, avermectinas y neonicotinoides: alta toxicidad aguda por
-- contacto o ingestión (LD50 < 2 µg/abeja).
UPDATE productos SET toxicidad_abejas = 'toxico'
WHERE LOWER(nombre_comercial) IN (
  'trebon 30 ec',      -- Etofenprox — piretroide, tóxico por contacto (LD50 0,5 µg/abeja)
  'invicto 50 sc',     -- Lambda-cihalotrina — piretroide, altamente tóxico (LD50 0,038 µg/abeja)
  'ambligo 150 sc',    -- Abamectina — avermectina, muy tóxico (LD50 0,002 µg/abeja contacto)
  'vibrance integral'  -- Contiene Thiamethoxam (neonicotinoide), sistémico, letal
);

-- ── 3. MODERADAMENTE TÓXICOS — aviso 48h obligatorio ─────────────────────────
-- Sistémicos con riesgo documentado para abejas (LD50 2–11 µg/abeja).
UPDATE productos SET toxicidad_abejas = 'moderadamente_toxico'
WHERE LOWER(nombre_comercial) IN (
  'sivanto prime'   -- Flupyradifurone — butenólido sistémico, riesgo inaceptable EFSA 2020
);

-- ── 4. POCO TÓXICOS — no requieren aviso ──────────────────────────────────────
-- Fungicidas triazoles, estrobilurinas y otros con toxicidad baja
-- para abejas (LD50 > 11 µg/abeja; riesgo bajo en condiciones normales).
UPDATE productos SET toxicidad_abejas = 'poco_toxico'
WHERE LOWER(nombre_comercial) IN (
  'property',          -- Piriofenona — fungicida, sin evidencia de toxicidad abejas
  'quadris',           -- Azoxistrobina — estrobilurina, baja toxicidad abejas
  'scala 400 sc',      -- Pirimetanil — anilino-pirimidina, baja toxicidad
  'score 250 ec',      -- Difenoconazol — triazol, ligeramente tóxico (LD50 > 100 µg/abeja)
  'switch 62,5 wg',    -- Ciprodinil + Fludioxonil — baja toxicidad combinada
  'syllit 400 sc',     -- Dodina — guanidina, ligeramente tóxico por contacto
  'timorex gold',      -- Aceite árbol de té — biopesticida, toxicidad baja
  'topas 200 ew',      -- Penconazol — triazol, baja toxicidad (LD50 > 200 µg/abeja)
  'u46m',              -- MCPA — herbicida, prácticamente no tóxico por contacto
  'paraquat 276 sl',   -- Paraquat — herbicida, poco tóxico abejas (LD50 > 200 µg/abeja)
  'silwet 100 tx',     -- Surfactante silicónico — puede causar daño físico leve
  'springer',          -- Coadyuvante — sin toxicidad específica documentada
  'triple ph'          -- Coadyuvante pH — sin toxicidad específica documentada
);

-- DORMEX (Cianamida de hidrógeno): poco tóxico, y se aplica en dormancia
-- cuando las abejas no están activas. Aun así clasificado conservadoramente.
UPDATE productos SET toxicidad_abejas = 'poco_toxico'
WHERE LOWER(nombre_comercial) LIKE '%dormex%';

-- ── 5. NO TÓXICOS para abejas ────────────────────────────────────────────────
-- Biológicos a base de Bacillus, antibióticos y fungicidas inocuos.
UPDATE productos SET toxicidad_abejas = 'no_toxico'
WHERE LOWER(nombre_comercial) IN (
  'serenade aso',    -- Bacillus subtilis — biológico, inocuo para abejas
  'botrytis stop',   -- Bacillus subtilis — biológico, inocuo
  'teldor 500 sc',   -- Fenhexamid — fungicida, prácticamente no tóxico (LD50 > 200 µg/abeja)
  'vivando',         -- Metrafenona — fungicida, no tóxico para abejas
  'strepto plus',    -- Sulfato de estreptomicina — antibiótico, inocuo
  'bestcure',        -- Base Bacillus subtilis — biológico
  'sillikum'         -- Sílice — no tóxico
);

-- Fertilizantes foliares, bioestimulantes y fitorreguladores puros:
-- no son pesticidas; no requieren aviso apícola.
UPDATE productos
SET toxicidad_abejas = 'no_toxico'
WHERE toxicidad_abejas IS NULL
  AND tipo_funcion && ARRAY['FERTILIZANTE FOLIAR', 'BIOESTIMULANTE', 'FITORREGULADOR']
  AND NOT (tipo_funcion && ARRAY['FUNGUICIDA', 'INSECTICIDA', 'ACARICIDA', 'HERBICIDA', 'NEMATICIDA', 'BACTERICIDA']);

-- ── 6. Verificar resultado ────────────────────────────────────────────────────
SELECT
  toxicidad_abejas,
  COUNT(*) AS cantidad,
  STRING_AGG(nombre_comercial, ', ' ORDER BY nombre_comercial) AS productos
FROM productos
WHERE activo = true
GROUP BY toxicidad_abejas
ORDER BY
  CASE toxicidad_abejas
    WHEN 'toxico'               THEN 1
    WHEN 'moderadamente_toxico' THEN 2
    WHEN 'poco_toxico'          THEN 3
    WHEN 'no_toxico'            THEN 4
    ELSE 5
  END;