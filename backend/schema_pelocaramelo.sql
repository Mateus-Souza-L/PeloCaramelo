-- =========================================================
--  Banco de Dados PeloCaramelo
--  Script de criação das tabelas principais
-- =========================================================

-- ATENÇÃO: execute isto no banco "pelocaramelo"
-- psql -U postgres -d pelocaramelo -f schema_pelocaramelo.sql

-- =========================================================
-- 1) Tabela de usuários
-- =========================================================

CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(255)        NOT NULL,
  email           VARCHAR(255)        NOT NULL UNIQUE,
  password_hash   VARCHAR(255)        NOT NULL,
  role            VARCHAR(50)         NOT NULL DEFAULT 'tutor',  -- 'tutor', 'caregiver', 'admin'

  image           TEXT,
  bio             TEXT,
  phone           VARCHAR(50),
  address         TEXT,
  neighborhood    VARCHAR(255),
  city            VARCHAR(255),
  cep             VARCHAR(20),

  -- Campos JSONB para serviços, preços e cursos (usados no frontend)
  services        JSONB,
  prices          JSONB,
  courses         JSONB,

  -- Disponibilidade de datas do cuidador (array de strings de datas)
  available_dates JSONB,

  blocked         BOOLEAN            NOT NULL DEFAULT FALSE,

  created_at      TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

-- Opcional: garantir que role só tenha valores esperados (não obrigatório)
-- ALTER TABLE users
-- ADD CONSTRAINT users_role_check
-- CHECK (role IN ('tutor', 'caregiver', 'admin'));


-- =========================================================
-- 2) Tabela de reservas
-- =========================================================

CREATE TABLE IF NOT EXISTS reservations (
  id                SERIAL PRIMARY KEY,

  tutor_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  caregiver_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  tutor_name        VARCHAR(255) NOT NULL,
  caregiver_name    VARCHAR(255) NOT NULL,

  city              VARCHAR(255),
  neighborhood      VARCHAR(255),

  service           VARCHAR(255) NOT NULL,
  price_per_day     NUMERIC(10, 2) NOT NULL,

  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  total             NUMERIC(10, 2) NOT NULL,

  status            VARCHAR(50) NOT NULL DEFAULT 'Pendente',
  -- Valores esperados no código:
  -- 'Pendente', 'Aceita', 'Recusada', 'Cancelada', 'Concluida'

  -- Campos de avaliação antigos (se quiser manter compatibilidade futura)
  rating            INTEGER,
  rating_comment    TEXT,

  -- Avaliações separadas para tutor/caregiver (usadas hoje no controller)
  tutor_rating      INTEGER,
  tutor_review      TEXT,
  caregiver_rating  INTEGER,
  caregiver_review  TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices úteis para filtros
CREATE INDEX IF NOT EXISTS idx_reservations_tutor_id
  ON reservations (tutor_id);

CREATE INDEX IF NOT EXISTS idx_reservations_caregiver_id
  ON reservations (caregiver_id);

CREATE INDEX IF NOT EXISTS idx_reservations_status
  ON reservations (status);


-- =========================================================
-- 3) Tabela de mensagens de chat
-- =========================================================

CREATE TABLE IF NOT EXISTS chat_messages (
  id              SERIAL PRIMARY KEY,

  reservation_id  INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  from_user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  message         TEXT    NOT NULL,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para facilitar buscas por reserva
CREATE INDEX IF NOT EXISTS idx_chat_messages_reservation_id
  ON chat_messages (reservation_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_from_user_id
  ON chat_messages (from_user_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_to_user_id
  ON chat_messages (to_user_id);
