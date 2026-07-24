-- fix_costo_salidas_ot.sql
-- Calcula costo promedio ponderado por campo y producto para todas las salidas de OT
-- que todavía no tienen precio_unitario.
--
-- Fórmula: SUM(cantidad * precio_unitario) / SUM(cantidad)
-- sobre todas las entradas de ese producto+campo con precio registrado.
--
-- Ejecutar en Supabase > SQL Editor (una sola vez).

-- ── 1. Actualizar precio_unitario en salidas de OT ───────────────────────────
UPDATE stock_movimientos sm
SET precio_unitario = sub.avg_costo
FROM (
  SELECT
    e.empresa_id,
    e.campo_id,
    e.producto_id,
    SUM(e.cantidad * e.precio_unitario) / NULLIF(SUM(e.cantidad), 0) AS avg_costo
  FROM stock_movimientos e
  WHERE e.tipo = 'entrada'
    AND e.precio_unitario IS NOT NULL
  GROUP BY e.empresa_id, e.campo_id, e.producto_id
) sub
WHERE sm.tipo IN ('salida', 'salida_barbecho')
  AND sm.ot_id IS NOT NULL
  AND sm.precio_unitario IS NULL
  AND sm.empresa_id = sub.empresa_id
  AND sm.campo_id    = sub.campo_id
  AND sm.producto_id = sub.producto_id;

-- ── 2. Verificación ──────────────────────────────────────────────────────────
SELECT
  'actualizados con precio'  AS resultado,
  COUNT(*)                   AS cantidad
FROM stock_movimientos
WHERE tipo IN ('salida', 'salida_barbecho')
  AND ot_id IS NOT NULL
  AND precio_unitario IS NOT NULL

UNION ALL

SELECT
  'sin precio (sin entradas con costo)' AS resultado,
  COUNT(*)                              AS cantidad
FROM stock_movimientos
WHERE tipo IN ('salida', 'salida_barbecho')
  AND ot_id IS NOT NULL
  AND precio_unitario IS NULL;