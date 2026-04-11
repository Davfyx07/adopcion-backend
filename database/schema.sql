-- =============================================================
-- SCHEMA MAESTRO — Plataforma Adopción de Mascotas
-- =============================================================
-- Ejecutar este script completo en PostgreSQL antes de
-- levantar el servidor por primera vez.
-- Compatible con: PostgreSQL 14+, Supabase, Azure Database for PostgreSQL
-- =============================================================


-- -------------------------------------------------------------
-- ROLES
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rol (
    id_rol    SERIAL PRIMARY KEY,
    nombre_rol VARCHAR(50) UNIQUE NOT NULL
);

-- Datos iniciales obligatorios (sin esto el registro falla)
INSERT INTO rol (nombre_rol) VALUES ('adoptante'), ('albergue')
ON CONFLICT (nombre_rol) DO NOTHING;


-- -------------------------------------------------------------
-- USUARIOS
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuario (
    id_usuario       SERIAL PRIMARY KEY,
    correo           VARCHAR(255) UNIQUE NOT NULL,
    password_hash    VARCHAR(255) NOT NULL,
    id_rol           INT REFERENCES rol(id_rol),
    estado_cuenta    VARCHAR(50) DEFAULT 'perfil_incompleto',
    intentos_fallidos INT DEFAULT 0,
    bloqueado_hasta  TIMESTAMP,
    ip_registro      VARCHAR(50),
    fecha_registro   TIMESTAMP DEFAULT NOW()
);


-- -------------------------------------------------------------
-- TÉRMINOS Y CONDICIONES ACEPTADOS
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS termino_aceptado (
    id                     SERIAL PRIMARY KEY,
    id_usuario             INT NOT NULL REFERENCES usuario(id_usuario),
    version_documento      VARCHAR(20) NOT NULL,
    ip_aceptacion          VARCHAR(50),
    fecha_hora_aceptacion  TIMESTAMP DEFAULT NOW()
);


-- -------------------------------------------------------------
-- LOG DE AUDITORÍA
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS log_auditoria (
    id_log                SERIAL PRIMARY KEY,
    id_autor              INT,
    accion                VARCHAR(100),
    entidad_afectada      VARCHAR(100),
    id_registro_afectado  INT,
    valor_anterior        JSONB,
    valor_nuevo           JSONB,
    ip                    VARCHAR(50),
    fecha                 TIMESTAMP DEFAULT NOW()
);


-- -------------------------------------------------------------
-- BLACKLIST DE TOKENS JWT (logout)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blacklist_token (
    id                SERIAL PRIMARY KEY,
    token_hash        VARCHAR(255) UNIQUE NOT NULL,
    fecha_expiracion  TIMESTAMP NOT NULL
);

-- Índice para acelerar la consulta de validación en cada request
CREATE INDEX IF NOT EXISTS idx_blacklist_token_hash
    ON blacklist_token (token_hash);


-- -------------------------------------------------------------
-- ALBERGUES
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS albergue (
    id_usuario       INT PRIMARY KEY REFERENCES usuario(id_usuario),
    nit              VARCHAR(20) UNIQUE NOT NULL,
    nombre_albergue  VARCHAR(150) NOT NULL,
    logo             VARCHAR(500),
    descripcion      TEXT,
    whatsapp_actual  VARCHAR(20),
    sitio_web        VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS historial_whatsapp_albergue (
    id            SERIAL PRIMARY KEY,
    id_albergue   INT NOT NULL REFERENCES albergue(id_usuario),
    numero_whatsapp VARCHAR(20) NOT NULL,
    fecha_inicio  TIMESTAMP DEFAULT NOW(),
    fecha_fin     TIMESTAMP
);


-- -------------------------------------------------------------
-- ETIQUETAS (catálogo de tags para matching)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS etiqueta (
    id_etiqueta   SERIAL PRIMARY KEY,
    nombre        VARCHAR(100) NOT NULL,
    categoria     VARCHAR(50),
    es_obligatoria BOOLEAN DEFAULT FALSE
);

-- Datos iniciales de etiquetas
INSERT INTO etiqueta (nombre, categoria, es_obligatoria) VALUES
    ('Tiene patio',                    'vivienda',    TRUE),
    ('Tiene niños en casa',            'hogar',       TRUE),
    ('Vive en apartamento',            'vivienda',    FALSE),
    ('Tiene otras mascotas',           'hogar',       FALSE),
    ('Prefiere perros',                'preferencia', FALSE),
    ('Prefiere gatos',                 'preferencia', FALSE),
    ('Puede adoptar mascota grande',   'preferencia', FALSE),
    ('Puede adoptar mascota pequeña',  'preferencia', FALSE),
    ('Tiene experiencia con mascotas', 'experiencia', FALSE),
    ('Primera mascota',                'experiencia', FALSE)
ON CONFLICT DO NOTHING;


-- -------------------------------------------------------------
-- PERFIL ADOPTANTE (HU-US-01)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS perfil_adoptante (
    id_perfil       SERIAL PRIMARY KEY,
    id_usuario      INT UNIQUE NOT NULL REFERENCES usuario(id_usuario),
    telefono        VARCHAR(20) NOT NULL,
    ciudad          VARCHAR(100) NOT NULL,
    direccion       VARCHAR(255) NOT NULL,
    foto_url        VARCHAR(500),
    embedding       FLOAT[],           -- vector binario basado en tags para matching
    fecha_creacion  TIMESTAMP DEFAULT NOW()
);


-- -------------------------------------------------------------
-- TAGS DEL ADOPTANTE (HU-US-01)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS adoptante_tag (
    id_adoptante_tag  SERIAL PRIMARY KEY,
    id_usuario        INT NOT NULL REFERENCES usuario(id_usuario),
    id_etiqueta       INT NOT NULL REFERENCES etiqueta(id_etiqueta),
    UNIQUE(id_usuario, id_etiqueta)
);
