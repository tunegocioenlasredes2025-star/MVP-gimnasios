"""Carga un gimnasio DEMO con datos ficticios para mostrar el sistema.

Crea (o recrea) el gimnasio demo con ~50 socios: la mayoría al día, ~10 morosos y
~8 por vencer, con algo de historial de pagos. NO toca datos de pilotos reales.

Uso:   python seed_demo.py
Login: usuario = demo   /   contraseña = demo1234
"""
import random
from datetime import date, timedelta

from werkzeug.security import generate_password_hash

from database import get_db, init_db
from models import registrar_pago

NOMBRES = ["Juan", "María", "Lucas", "Sofía", "Mateo", "Valentina", "Benjamín",
           "Camila", "Thiago", "Martina", "Joaquín", "Catalina", "Bautista",
           "Isabella", "Santiago", "Emma", "Lautaro", "Mía", "Tomás", "Olivia"]
APELLIDOS = ["González", "Rodríguez", "Gómez", "Fernández", "López", "Díaz",
             "Martínez", "Pérez", "Romero", "Sosa", "Torres", "Ruiz", "Ramírez",
             "Flores", "Acosta", "Benítez", "Medina", "Suárez", "Herrera", "Aguirre"]
PLANES = [("Full", 35000), ("3 días", 28000), ("Pase libre", 42000), ("Estudiante", 22000)]


def reset_demo():
    init_db()
    conn = get_db()
    # Borrar demo previo (si existe) y sus datos.
    row = conn.execute("SELECT id FROM gimnasios WHERE usuario='demo'").fetchone()
    if row:
        gid = row["id"]
        conn.execute("DELETE FROM pagos WHERE gimnasio_id=?", (gid,))
        conn.execute("DELETE FROM socios WHERE gimnasio_id=?", (gid,))
        conn.execute("DELETE FROM gimnasios WHERE id=?", (gid,))
        conn.commit()

    cur = conn.execute(
        """INSERT INTO gimnasios (nombre, usuario, password_hash, alias_cbu, is_demo)
           VALUES (?,?,?,?,1)""",
        ("Gimnasio Demo", "demo", generate_password_hash("demo1234"), "gimnasio.demo.mp"),
    )
    gid = cur.lastrowid
    conn.commit()

    hoy = date.today()
    socios_ids = []
    for i in range(50):
        plan, cuota = random.choice(PLANES)
        # Distribución: ~10 morosos (>30 días), ~8 por vencer (~28-30 días), resto al día.
        if i < 10:
            ult_pago = hoy - timedelta(days=random.randint(35, 75))   # moroso
        elif i < 18:
            ult_pago = hoy - timedelta(days=random.randint(26, 29))   # por vencer
        else:
            ult_pago = hoy - timedelta(days=random.randint(1, 20))    # al día
        tel = "549112" + str(random.randint(1000000, 9999999))
        cur = conn.execute(
            """INSERT INTO socios (gimnasio_id, nombre, apellido, telefono, email, plan,
               cuota_mensual, dia_vencimiento, fecha_ultimo_pago, fecha_ultimo_aviso)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (
                gid,
                random.choice(NOMBRES),
                random.choice(APELLIDOS),
                tel,
                "",
                plan,
                cuota,
                random.choice([5, 10, 15, 20]),
                ult_pago.isoformat(),
                (hoy - timedelta(days=2)).isoformat() if i < 18 else None,
            ),
        )
        socios_ids.append((cur.lastrowid, cuota, ult_pago))
    conn.commit()
    conn.close()

    # Historial de pagos: registramos de la más vieja a la más nueva, terminando en
    # `ult_pago`, para que fecha_ultimo_pago quede correcta y se vea movimiento.
    for sid, cuota, ult_pago in socios_ids:
        previos = random.randint(1, 3)
        fechas = [ult_pago - timedelta(days=30 * k) for k in range(previos, -1, -1)]
        for f in fechas:
            registrar_pago(gid, sid, f.isoformat(), cuota,
                           random.choice(["Efectivo", "Transferencia", "Mercado Pago"]))

    print("Gimnasio DEMO creado.  Login -> usuario: demo  /  contraseña: demo1234")


if __name__ == "__main__":
    reset_demo()
