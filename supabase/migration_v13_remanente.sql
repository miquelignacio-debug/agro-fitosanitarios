-- v13: remanente de barbecho en OT + salida_barbecho en stock

-- 1. Campo remanente en ordenes_trabajo
ALTER TABLE ordenes_trabajo ADD COLUMN IF NOT EXISTS remanente_lt numeric;

-- 2. Permitir salida_barbecho en stock_movimientos
--    (primero eliminar constraint existente, luego recrear con el nuevo valor)
ALTER TABLE stock_movimientos DROP CONSTRAINT IF EXISTS stock_movimientos_tipo_check;
ALTER TABLE stock_movimientos ADD CONSTRAINT stock_movimientos_tipo_check
  CHECK (tipo IN (
    'entrada', 'salida', 'salida_barbecho',
    'transferencia_salida', 'transferencia_entrada',
    'ajuste_entrada', 'ajuste_salida'
  ));

-- 3. Actualizar vista stock_actual para descontar salida_barbecho
CREATE OR REPLACE VIEW stock_actual AS
SELECT
  empresa_id,
  producto_id,
  SUM(CASE
    WHEN tipo IN ('entrada', 'transferencia_entrada', 'ajuste_entrada') THEN cantidad
    WHEN tipo IN ('salida', 'salida_barbecho', 'transferencia_salida', 'ajuste_salida') THEN -cantidad
    ELSE 0
  END) AS cantidad_disponible
FROM stock_movimientos
GROUP BY empresa_id, producto_id
HAVING SUM(CASE
    WHEN tipo IN ('entrada', 'transferencia_entrada', 'ajuste_entrada') THEN cantidad
    WHEN tipo IN ('salida', 'salida_barbecho', 'transferencia_salida', 'ajuste_salida') THEN -cantidad
    ELSE 0
  END) > 0;
