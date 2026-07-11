-- Migration v9: Activar productos que quedaron inactivos en el catálogo SAG
-- Ejecutar en Supabase > SQL Editor

-- Activar los 27 productos que aparecen como "No encontrado" en carga inicial
UPDATE productos SET activo = true
WHERE LOWER(nombre_comercial) IN (
  'property','quadris','retenol','ripper full sl','scala 400 sc','score 250 ec',
  'serenade aso','sett','sillikum','silwet 100 tx','sivanto prime','springer',
  'sprint color','stimulate fruit sizer','strepto plus','switch 62,5 wg',
  'syllit 400 sc','tecbom','teldor 500 sc','timorex gold','topas 200 ew',
  'trebon 30 ec','triple ph','u46m','vibrance integral','vitazyme','vivando'
);

-- Verificar resultado (debe mostrar activo = true para todos)
SELECT nombre_comercial, activo, fuente
FROM productos
WHERE LOWER(nombre_comercial) IN (
  'property','quadris','retenol','ripper full sl','scala 400 sc','score 250 ec',
  'serenade aso','sett','sillikum','silwet 100 tx','sivanto prime','springer',
  'sprint color','stimulate fruit sizer','strepto plus','switch 62,5 wg',
  'syllit 400 sc','tecbom','teldor 500 sc','timorex gold','topas 200 ew',
  'trebon 30 ec','triple ph','u46m','vibrance integral','vitazyme','vivando'
)
ORDER BY nombre_comercial;
