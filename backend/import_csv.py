"""Importación de socios desde CSV.

Formato esperado de columnas (ver sample_socios.csv):
    nombre, apellido, telefono, email, plan, cuota_mensual, dia_vencimiento, fecha_ultimo_pago

- telefono: idealmente con código de país para WhatsApp (ej. 5491122334455).
- fecha_ultimo_pago: YYYY-MM-DD (opcional; vacío = sin pagos previos).
- Se evitan duplicados por teléfono o email dentro del mismo gimnasio.
"""
import csv
import io

from database import get_db
from models import create_socio

CAMPOS = ["nombre", "apellido", "telefono", "email", "plan",
          "cuota_mensual", "dia_vencimiento", "fecha_ultimo_pago"]


def _existentes(gym_id):
    conn = get_db()
    rows = conn.execute(
        "SELECT telefono, email FROM socios WHERE gimnasio_id=?", (gym_id,)
    ).fetchall()
    conn.close()
    tels = {(r["telefono"] or "").strip() for r in rows if r["telefono"]}
    mails = {(r["email"] or "").strip().lower() for r in rows if r["email"]}
    return tels, mails


def importar_csv(gym_id, contenido_texto):
    """Importa socios desde el texto de un CSV. Devuelve un resumen."""
    tels, mails = _existentes(gym_id)
    reader = csv.DictReader(io.StringIO(contenido_texto))

    creados, omitidos, errores = 0, 0, []
    for i, fila in enumerate(reader, start=2):  # 2 = primera fila de datos
        fila = {(k or "").strip().lower(): (v or "").strip() for k, v in fila.items()}
        nombre = fila.get("nombre", "")
        if not nombre:
            errores.append(f"Fila {i}: sin nombre, omitida.")
            continue

        tel = fila.get("telefono", "")
        mail = fila.get("email", "").lower()
        if (tel and tel in tels) or (mail and mail in mails):
            omitidos += 1
            continue

        try:
            create_socio(gym_id, {
                "nombre": nombre,
                "apellido": fila.get("apellido", ""),
                "telefono": tel,
                "email": fila.get("email", ""),
                "plan": fila.get("plan", ""),
                "cuota_mensual": fila.get("cuota_mensual", "0") or "0",
                "dia_vencimiento": fila.get("dia_vencimiento", "10") or "10",
                "fecha_ultimo_pago": fila.get("fecha_ultimo_pago", "") or None,
            })
            if tel:
                tels.add(tel)
            if mail:
                mails.add(mail)
            creados += 1
        except Exception as e:  # noqa: BLE001 - reportamos y seguimos
            errores.append(f"Fila {i}: {e}")

    return {"creados": creados, "omitidos": omitidos, "errores": errores}
