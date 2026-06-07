"""Punto de entrada de CuotaClub (Flask).

Sirve el frontend estático (HTML/CSS/JS vanilla) y la API JSON. Multi-piloto: cada
gimnasio se autentica y ve solo sus datos (sesión de Flask).

Correr local:  python app.py
Variables:     SECRET_KEY (recomendado en producción), PORT
"""
import os

from flask import Flask, redirect, session

from database import init_db
from routes import bp as api_bp

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")
app.secret_key = os.environ.get("SECRET_KEY", "cuotaclub-dev-key-cambiar-en-produccion")
app.permanent_session_lifetime = 60 * 60 * 12  # 12 horas

app.register_blueprint(api_bp)

# Crear tablas al importar (idempotente). Necesario en producción con gunicorn,
# que no ejecuta el bloque __main__ de abajo.
init_db()


@app.route("/")
def index():
    # Si ya hay sesión, al dashboard; si no, al login.
    if session.get("gimnasio_id"):
        return redirect("/dashboard.html")
    return app.send_static_file("index.html")


@app.after_request
def no_cache_html(resp):
    if resp.mimetype == "text/html":
        resp.headers["Cache-Control"] = "no-store"
    return resp


if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
