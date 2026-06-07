"""Acceso a datos y lógica de negocio de CuotaClub.

Concentra: cálculo de estado del socio (activo / por vencer / moroso / inactivo),
consultas de socios y pagos, KPIs del dashboard y registro de pagos/avisos.
El estado NO se guarda en la base: se calcula al vuelo a partir del último pago y la
configuración del gimnasio. Así nunca queda desincronizado.
"""
from datetime import date, datetime, timedelta

from database import get_db


# ----------------------------- utilidades de fecha -----------------------------

def _parse(d):
    if not d:
        return None
    if isinstance(d, (date, datetime)):
        return d if isinstance(d, date) and not isinstance(d, datetime) else d.date()
    try:
        return datetime.strptime(str(d)[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _today():
    return date.today()


# ----------------------------- gimnasios -----------------------------

def get_gimnasio(gym_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM gimnasios WHERE id = ?", (gym_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def get_gimnasio_by_usuario(usuario):
    conn = get_db()
    row = conn.execute("SELECT * FROM gimnasios WHERE usuario = ?", (usuario,)).fetchone()
    conn.close()
    return dict(row) if row else None


def update_config(gym_id, mp_access_token, alias_cbu, dias_por_vencer, dias_para_moroso):
    """Actualiza la config. Si mp_access_token es None/'' se mantiene el actual
    (así el formulario no borra el token al dejar el campo vacío)."""
    conn = get_db()
    if mp_access_token:
        conn.execute("UPDATE gimnasios SET mp_access_token=? WHERE id=?",
                     (mp_access_token, gym_id))
    conn.execute(
        "UPDATE gimnasios SET alias_cbu=?, dias_por_vencer=?, dias_para_moroso=? WHERE id=?",
        (alias_cbu, int(dias_por_vencer), int(dias_para_moroso), gym_id),
    )
    conn.commit()
    conn.close()


# ----------------------------- estado del socio -----------------------------

def compute_estado(socio, gym):
    """Devuelve (estado, dias_hasta_vencimiento).

    estado en {activo, por_vencer, moroso, inactivo}.
    dueDate = (ultimo_pago | created_at) + dias_para_moroso.
    """
    if socio["dado_baja"]:
        return "inactivo", None

    period = gym["dias_para_moroso"]
    por_vencer_win = gym["dias_por_vencer"]

    base = _parse(socio["fecha_ultimo_pago"]) or _parse(socio["created_at"]) or _today()
    due_date = base + timedelta(days=period)
    dias_hasta = (due_date - _today()).days

    if dias_hasta < 0:
        return "moroso", dias_hasta
    if dias_hasta <= por_vencer_win:
        return "por_vencer", dias_hasta
    return "activo", dias_hasta


# ----------------------------- socios -----------------------------

def _socio_to_dict(row, gym):
    d = dict(row)
    estado, dias = compute_estado(d, gym)
    d["estado"] = estado
    d["dias_hasta_vencimiento"] = dias
    return d


def list_socios(gym_id, filtro="todos"):
    gym = get_gimnasio(gym_id)
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM socios WHERE gimnasio_id = ? ORDER BY apellido, nombre",
        (gym_id,),
    ).fetchall()
    conn.close()
    socios = [_socio_to_dict(r, gym) for r in rows]
    if filtro and filtro != "todos":
        socios = [s for s in socios if s["estado"] == filtro]
    return socios


def get_socio(gym_id, socio_id):
    gym = get_gimnasio(gym_id)
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM socios WHERE id = ? AND gimnasio_id = ?", (socio_id, gym_id)
    ).fetchone()
    conn.close()
    return _socio_to_dict(row, gym) if row else None


def create_socio(gym_id, data):
    conn = get_db()
    cur = conn.execute(
        """INSERT INTO socios (gimnasio_id, nombre, apellido, telefono, email, plan,
           cuota_mensual, dia_vencimiento, fecha_ultimo_pago)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (
            gym_id,
            data.get("nombre", "").strip(),
            data.get("apellido", "").strip(),
            data.get("telefono", "").strip(),
            data.get("email", "").strip(),
            data.get("plan", "").strip(),
            float(data.get("cuota_mensual") or 0),
            int(data.get("dia_vencimiento") or 10),
            (data.get("fecha_ultimo_pago") or None),
        ),
    )
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return new_id


def update_socio(gym_id, socio_id, data):
    conn = get_db()
    conn.execute(
        """UPDATE socios SET nombre=?, apellido=?, telefono=?, email=?, plan=?,
           cuota_mensual=?, dia_vencimiento=? WHERE id=? AND gimnasio_id=?""",
        (
            data.get("nombre", "").strip(),
            data.get("apellido", "").strip(),
            data.get("telefono", "").strip(),
            data.get("email", "").strip(),
            data.get("plan", "").strip(),
            float(data.get("cuota_mensual") or 0),
            int(data.get("dia_vencimiento") or 10),
            socio_id,
            gym_id,
        ),
    )
    conn.commit()
    conn.close()


def set_baja(gym_id, socio_id, baja=True):
    conn = get_db()
    conn.execute(
        "UPDATE socios SET dado_baja=? WHERE id=? AND gimnasio_id=?",
        (1 if baja else 0, socio_id, gym_id),
    )
    conn.commit()
    conn.close()


def marcar_aviso(gym_id, socio_id):
    conn = get_db()
    conn.execute(
        "UPDATE socios SET fecha_ultimo_aviso=? WHERE id=? AND gimnasio_id=?",
        (_today().isoformat(), socio_id, gym_id),
    )
    conn.commit()
    conn.close()


# ----------------------------- pagos -----------------------------

def list_pagos_socio(gym_id, socio_id):
    conn = get_db()
    rows = conn.execute(
        """SELECT * FROM pagos WHERE gimnasio_id=? AND socio_id=?
           ORDER BY fecha DESC, id DESC""",
        (gym_id, socio_id),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def registrar_pago(gym_id, socio_id, fecha, monto, metodo):
    """Registra un pago y marca si fue una recuperación.

    recupero=1 si, ANTES del pago, el socio estaba moroso o por_vencer y se le había
    enviado un aviso. Alimenta la métrica 'Recuperado este mes'.
    """
    socio = get_socio(gym_id, socio_id)
    if not socio:
        return None
    recupero = 1 if (socio["estado"] in ("moroso", "por_vencer") and socio["fecha_ultimo_aviso"]) else 0

    conn = get_db()
    conn.execute(
        """INSERT INTO pagos (gimnasio_id, socio_id, fecha, monto, metodo, recupero)
           VALUES (?,?,?,?,?,?)""",
        (gym_id, socio_id, fecha, float(monto), metodo, recupero),
    )
    conn.execute(
        "UPDATE socios SET fecha_ultimo_pago=? WHERE id=? AND gimnasio_id=?",
        (fecha, socio_id, gym_id),
    )
    conn.commit()
    conn.close()
    return recupero


# ----------------------------- dashboard -----------------------------

def dashboard_kpis(gym_id):
    gym = get_gimnasio(gym_id)
    socios = list_socios(gym_id, "todos")

    activos = [s for s in socios if s["estado"] == "activo"]
    morosos = [s for s in socios if s["estado"] == "moroso"]
    por_vencer = [s for s in socios if s["estado"] == "por_vencer"]
    inactivos = [s for s in socios if s["estado"] == "inactivo"]
    vigentes = [s for s in socios if s["estado"] != "inactivo"]

    facturacion_esperada = sum(s["cuota_mensual"] for s in vigentes)

    mes = _today().strftime("%Y-%m")
    conn = get_db()
    pagos_mes = conn.execute(
        """SELECT monto, recupero FROM pagos
           WHERE gimnasio_id=? AND substr(fecha,1,7)=?""",
        (gym_id, mes),
    ).fetchall()
    conn.close()

    cobrado_mes = sum(p["monto"] for p in pagos_mes)
    recuperado_mes = sum(p["monto"] for p in pagos_mes if p["recupero"])
    pendiente = sum(s["cuota_mensual"] for s in (morosos + por_vencer))

    return {
        "socios_activos": len(activos),
        "socios_morosos": len(morosos),
        "socios_por_vencer": len(por_vencer),
        "socios_inactivos": len(inactivos),
        "socios_total": len(socios),
        "facturacion_esperada": round(facturacion_esperada, 2),
        "cobrado_mes": round(cobrado_mes, 2),
        "pendiente": round(pendiente, 2),
        "recuperado_mes": round(recuperado_mes, 2),
        "gimnasio": gym["nombre"],
    }
