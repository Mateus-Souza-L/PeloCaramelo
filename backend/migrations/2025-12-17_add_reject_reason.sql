-- 2025-12-17_add_reject_reason.sql
-- Adiciona motivo de recusa/cancelamento visível para o tutor

ALTER TABLE reservations
ADD COLUMN IF NOT EXISTS reject_reason TEXT;

-- (Opcional) índice se você for filtrar por motivo (normalmente não precisa)
-- CREATE INDEX IF NOT EXISTS idx_reservations_reject_reason ON reservations (reject_reason);
    