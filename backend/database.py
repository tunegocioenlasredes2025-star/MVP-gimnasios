"""Conexión y esquema de la base de datos SQLite de CuotaClub.

Sin ORM: usamos sqlite3 de la librería estándar para mantener el MVP simple y sin
dependencias extra. Cada tabla de datos lleva `gimnasio_id` para aislar pilotos.
"""
import os
import sqlite3

# Ruta de la base. En local: backend/data.db. En producción (Render/VPS) se puede
# apuntar a un disco persistente con la variable de entorno DB_PATH.
DB_PATH = os.environ.get("DB_PATH") or os.path.join(os.path.dirname(__file__), "data.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS gimnasios (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre          TEXT    NOT NULL,
    usuario         TEXT    NOT NULL UNIQUE,
    password_hash   TEXT    NOT NULL,
    mp_access_token TEXT    DEFAULT '',
    alias_cbu       TEXT    DEFAULT '',
    dias_por_vencer INTEGER NOT NULL DEFAULT 5,
    dias_para_moroso INTEGER NOT NULL DEFAULT 30,
    is_demo         INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL DEFAULT (date('now'))
);

CREATE TABLE IF NOT EXISTS socios (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    gimnasio_id        INTEGER NOT NULL,
    nombre             TEXT    NOT NULL,
    apellido           TEXT    DEFAULT '',
    telefono           TEXT    DEFAULT '',
    email              TEXT    DEFAULT '',
    plan               TEXT    DEFAULT '',
    cuota_mensual      REAL    NOT NULL DEFAULT 0,
    dia_vencimiento    INTEGER NOT NULL DEFAULT 10,
    fecha_ultimo_pago  TEXT,
    fecha_ultimo_aviso TEXT,
    dado_baja          INTEGER NOT NULL DEFAULT 0,
    created_at         TEXT    NOT NULL DEFAULT (date('now')),
    FOREIGN KEY (gimnasio_id) REFERENCES gimnasios(id)
);

CREATE TABLE IF NOT EXISTS pagos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    gimnasio_id INTEGER NOT NULL,
    socio_id    INTEGER NOT NULL,
    fecha       TEXT    NOT NULL,
    monto       REAL    NOT NULL,
    metodo      TEXT    NOT NULL,
    recupero    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (gimnasio_id) REFERENCES gimnasios(id),
    FOREIGN KEY (socio_id)    REFERENCES socios(id)
);

CREATE INDEX IF NOT EXISTS idx_socios_gym ON socios(gimnasio_id);
CREATE INDEX IF NOT EXISTS idx_pagos_gym  ON pagos(gimnasio_id);
"""


def get_db():
    """Devuelve una conexión con filas tipo dict y FKs activadas."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """Crea las tablas si no existen."""
    conn = get_db()
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()


if __name__ == "__main__":
    init_db()
    print(f"Base creada/actualizada en: {DB_PATH}")
