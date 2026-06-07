"""Rutas de CuotaClub: autenticación, API JSON y generación de avisos WhatsApp.

El link de pago de Mercado Pago se crea con una preferencia de Checkout (pago único
por el monto de la cuota) usando solo la librería estándar (urllib). Si el gimnasio no
cargó su access token, se cae al fallback de alias/CBU en texto.
"""
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from functools import wraps

from flask import Blueprint, jsonify, request, session

import models
from import_csv import importar_csv

bp = Blueprint("api", __name__, url_prefix="/api")

MP_PREF_URL = "https://api.mercadopago.com/checkout/preferences"


# ----------------------------- auth helpers -----------------------------

def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not session.get("gimnasio_id"):
            return jsonify({"error": "no_autenticado"}), 401
        return f(*args, **kwargs)
    return wrapper


def _gym_id():
    return session.get("gimnasio_id")


# ----------------------------- auth -----------------------------

@bp.post("/login")
def login():
    from werkzeug.security import check_password_hash
    data = request.get_json(silent=True) or {}
    gym = models.get_gimnasio_by_usuario((data.get("usuario") or "").strip())
    if not gym or not check_password_hash(gym["password_hash"], data.get("password") or ""):
        return jsonify({"error": "credenciales_invalidas"}), 401
    session["gimnasio_id"] = gym["id"]
    session.permanent = True
    return jsonify({"ok": True, "gimnasio": gym["nombre"]})


@bp.post("/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


@bp.get("/me")
def me():
    gid = _gym_id()
    if not gid:
        return jsonify({"autenticado": False}), 401
    gym = models.get_gimnasio(gid)
    return jsonify({
        "autenticado": True,
        "gimnasio": gym["nombre"],
        "tiene_mp": bool(gym["mp_access_token"]),
        "alias_cbu": gym["alias_cbu"],
        "dias_por_vencer": gym["dias_por_vencer"],
        "dias_para_moroso": gym["dias_para_moroso"],
    })


@bp.post("/config")
@login_required
def config():
    data = request.get_json(silent=True) or {}
    models.update_config(
        _gym_id(),
        (data.get("mp_access_token") or "").strip(),
        (data.get("alias_cbu") or "").strip(),
        data.get("dias_por_vencer") or 5,
        data.get("dias_para_moroso") or 30,
    )
    return jsonify({"ok": True})


# ----------------------------- dashboard -----------------------------

@bp.get("/dashboard")
@login_required
def dashboard():
    return jsonify(models.dashboard_kpis(_gym_id()))


# ----------------------------- socios -----------------------------

@bp.get("/socios")
@login_required
def socios():
    filtro = request.args.get("filtro", "todos")
    return jsonify(models.list_socios(_gym_id(), filtro))


@bp.get("/socios/<int:socio_id>")
@login_required
def socio_detalle(socio_id):
    socio = models.get_socio(_gym_id(), socio_id)
    if not socio:
        return jsonify({"error": "no_encontrado"}), 404
    socio["pagos"] = models.list_pagos_socio(_gym_id(), socio_id)
    return jsonify(socio)


@bp.post("/socios")
@login_required
def socio_crear():
    data = request.get_json(silent=True) or {}
    if not (data.get("nombre") or "").strip():
        return jsonify({"error": "nombre_requerido"}), 400
    new_id = models.create_socio(_gym_id(), data)
    return jsonify({"ok": True, "id": new_id})


@bp.put("/socios/<int:socio_id>")
@login_required
def socio_editar(socio_id):
    data = request.get_json(silent=True) or {}
    models.update_socio(_gym_id(), socio_id, data)
    return jsonify({"ok": True})


@bp.post("/socios/<int:socio_id>/baja")
@login_required
def socio_baja(socio_id):
    data = request.get_json(silent=True) or {}
    models.set_baja(_gym_id(), socio_id, baja=bool(data.get("baja", True)))
    return jsonify({"ok": True})


@bp.post("/socios/import")
@login_required
def socio_import():
    archivo = request.files.get("archivo")
    if not archivo:
        return jsonify({"error": "archivo_requerido"}), 400
    try:
        contenido = archivo.read().decode("utf-8-sig")
    except UnicodeDecodeError:
        contenido = archivo.read().decode("latin-1")
    resumen = importar_csv(_gym_id(), contenido)
    return jsonify({"ok": True, **resumen})


# ----------------------------- pagos -----------------------------

@bp.post("/socios/<int:socio_id>/pago")
@login_required
def pago_registrar(socio_id):
    from datetime import date
    data = request.get_json(silent=True) or {}
    fecha = (data.get("fecha") or date.today().isoformat())[:10]
    monto = data.get("monto")
    metodo = data.get("metodo") or "Efectivo"
    if monto in (None, ""):
        return jsonify({"error": "monto_requerido"}), 400
    recupero = models.registrar_pago(_gym_id(), socio_id, fecha, monto, metodo)
    if recupero is None:
        return jsonify({"error": "socio_no_encontrado"}), 404
    return jsonify({"ok": True, "recupero": bool(recupero)})


# ----------------------------- aviso WhatsApp + link de pago -----------------------------

def _solo_digitos(tel):
    return re.sub(r"\D", "", tel or "")


def _crear_link_mp(token, titulo, monto):
    """Crea una preferencia de pago en Mercado Pago y devuelve el init_point.

    Devuelve None ante cualquier error (se usará el fallback de alias).
    """
    payload = json.dumps({
        "items": [{
            "title": titulo[:250],
            "quantity": 1,
            "unit_price": float(monto),
            "currency_id": "ARS",
        }]
    }).encode("utf-8")
    req = urllib.request.Request(
        MP_PREF_URL,
        data=payload,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            return body.get("init_point") or body.get("sandbox_init_point")
    except (urllib.error.URLError, urllib.error.HTTPError, ValueError, TimeoutError):
        return None


@bp.get("/socios/<int:socio_id>/aviso")
@login_required
def aviso(socio_id):
    gym = models.get_gimnasio(_gym_id())
    socio = models.get_socio(_gym_id(), socio_id)
    if not socio:
        return jsonify({"error": "no_encontrado"}), 404

    monto = socio["cuota_mensual"]
    nombre = socio["nombre"]
    plan = socio["plan"] or "tu cuota"

    # Link de pago: preferencia MP si hay token; si no, fallback a alias/CBU.
    link_pago = None
    if gym["mp_access_token"]:
        link_pago = _crear_link_mp(
            gym["mp_access_token"], f"Cuota {plan} - {gym['nombre']}", monto
        )
    medio_pago = link_pago or (
        f"Transferí al alias: {gym['alias_cbu']}" if gym["alias_cbu"]
        else "Coordinamos el pago por este medio."
    )
    pago_txt = f"👉 {link_pago}" if link_pago else medio_pago

    if socio["estado"] == "moroso":
        mensaje = (
            f"Hola {nombre}, tu cuota de {plan} está pendiente. "
            f"Importe: ${monto:.0f}. Para regularizar, pagá acá {pago_txt}. "
            f"Cualquier duda escribinos. ¡Gracias!"
        )
    else:  # por_vencer (o cualquier otro: recordatorio amable)
        mensaje = (
            f"Hola {nombre} 👋 Te recordamos que tu cuota de {plan} está por vencer. "
            f"Importe: ${monto:.0f}. Podés pagarla acá {pago_txt}. ¡Gracias!"
        )

    models.marcar_aviso(_gym_id(), socio_id)

    tel = _solo_digitos(socio["telefono"])
    wa_url = f"https://wa.me/{tel}?text=" + urllib.parse.quote(mensaje)
    return jsonify({
        "whatsapp_url": wa_url,
        "mensaje": mensaje,
        "link_pago": link_pago,
        "tiene_telefono": bool(tel),
    })
