# CuotaClub — MVP

SaaS de **cobranza y gestión para gimnasios y academias**. Responde tres preguntas:
**¿quién me debe plata?**, **¿cómo se la cobro sin perseguir a nadie?** (WhatsApp + link
de pago de Mercado Pago) y **¿cuánto recuperé gracias al sistema?**

Stack: **Python + Flask + SQLite** en el backend y **HTML/CSS/JS vanilla** en el
frontend. Sin frameworks pesados, sin Docker.

---

## 1. Requisitos
- Python 3.10+
- pip

## 2. Instalación
```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

pip install -r requirements.txt
```

## 3. Crear la base de datos
```bash
python database.py
```
Crea `data.db` con las tablas (gimnasios, socios, pagos).

## 4. Cargar datos demo (opcional, para mostrar el sistema)
```bash
python seed_demo.py
```
Crea un **Gimnasio Demo** con ~50 socios (≈10 morosos, ≈8 por vencer).
Login del demo → usuario: **demo** · contraseña: **demo1234**

## 5. Ejecutar (local)
```bash
python app.py
```
Abrir http://localhost:5000

> El comando `python app.py` también ejecuta `init_db()`, así que el paso 3 es opcional
> si vas a usar el demo o arrancar de cero.

---

## 6. Crear un gimnasio piloto (real)
No hay registro público (es un MVP de validación). Para dar de alta un piloto, desde
una consola de Python en `backend/`:
```python
from database import init_db, get_db
from werkzeug.security import generate_password_hash
init_db()
conn = get_db()
conn.execute(
    "INSERT INTO gimnasios (nombre, usuario, password_hash, alias_cbu) VALUES (?,?,?,?)",
    ("Gimnasio Olimpo", "olimpo", generate_password_hash("una-clave-segura"), "olimpo.mp"),
)
conn.commit(); conn.close()
```
Cada gimnasio ve **solo sus propios socios** (aislamiento por `gimnasio_id`).

## 7. Importar socios desde CSV
Dentro de la app → **Socios → Importar CSV**. Formato (ver `sample_socios.csv`):
```
nombre,apellido,telefono,email,plan,cuota_mensual,dia_vencimiento,fecha_ultimo_pago
```
- `telefono`: con código de país para WhatsApp (ej. `5491122334455`).
- `fecha_ultimo_pago`: `YYYY-MM-DD` (vacío = sin pagos previos).
- Se omiten duplicados por teléfono o email.

## 8. Configurar el link de pago de Mercado Pago
Dentro de la app → **Configuración** (⚙️ en el menú). Ahí el gimnasio pega su
**Access Token de Mercado Pago** (Credenciales de producción del panel de
desarrolladores de MP), su **alias/CBU** de respaldo y los umbrales de "por vencer" y
"moroso". No hace falta tocar la base de datos.

- Con token cargado → el aviso de WhatsApp incluye un **link de pago real**.
- Sin token → el aviso usa como fallback el **alias/CBU** en texto.

> El MVP genera un **link de pago único por la cuota** (preferencia de Checkout), no
> una suscripción automática. El cobro recurrente automático queda para la V1.

---

## 9. Deploy a una URL (para que el gimnasio lo use de verdad)
El dueño no va a correr Python: hay que hostearlo. El repo ya viene listo para
**Render** (incluye `render.yaml`, `Procfile`, `gunicorn` y `.gitignore`).

**Forma fácil (blueprint):**
1. Subir el repo (la carpeta `CuotaClub-MVP/`) a GitHub.
2. En Render: **New → Blueprint** y conectar el repo. Render lee `render.yaml` y
   configura todo solo: build, start (`gunicorn`), `SECRET_KEY`, `DB_PATH` y el disco.
3. Listo: queda una URL con HTTPS automático.

**Forma manual (Web Service):** si preferís configurarlo a mano:
- Root del servicio: `backend`
- Build: `pip install -r requirements.txt`
- Start: `gunicorn app:app --bind 0.0.0.0:$PORT`
- Env: `SECRET_KEY` (cadena larga aleatoria), `DB_PATH=/var/data/data.db` + un disco
  persistente montado en `/var/data`.

**Sobre los datos (SQLite):** para que NO se borren en cada deploy hace falta un
**disco persistente** (plan pago en Render; el `render.yaml` ya lo declara). En plan
**free** la base se reinicia en cada deploy — sirve para una demo rápida, no para un
piloto real. Para varios pilotos a la vez, migrar a **PostgreSQL** (V1).

HTTPS lo provee el hosting automáticamente (necesario: se manejan datos personales).
Después de deployar, crear el gimnasio piloto (paso 6) apuntando a la base de producción.

---

## 10. Estructura
```
CuotaClub-MVP/
├── backend/
│   ├── app.py          # Flask: sirve frontend + API
│   ├── database.py     # conexión + esquema SQLite (DB_PATH configurable)
│   ├── models.py       # acceso a datos + estados + KPIs
│   ├── routes.py       # auth + API + aviso WhatsApp/MP
│   ├── import_csv.py   # importación de socios
│   ├── seed_demo.py    # datos demo
│   ├── requirements.txt
│   └── Procfile        # arranque con gunicorn (producción)
├── frontend/
│   ├── index.html      # login
│   ├── dashboard.html  # KPIs + "recuperado este mes"
│   ├── socios.html     # lista + filtros + alta/cobro/WhatsApp/import
│   ├── config.html     # token Mercado Pago, alias y umbrales
│   ├── css/styles.css
│   └── js/ (api.js, dashboard.js, socios.js, config.js)
├── sample_socios.csv
├── render.yaml         # deploy automático en Render (blueprint)
├── .gitignore
└── README.md
```

## 11. Estados del socio (cómo se calculan)
- **Al día** (activo): faltan más de `dias_por_vencer` (def. 5) para el vencimiento.
- **Por vencer**: vence dentro de los próximos `dias_por_vencer` días.
- **Moroso**: pasó la fecha de vencimiento (último pago + `dias_para_moroso`, def. 30).
- **Inactivo**: dado de baja manualmente.

## 12. Fuera de alcance del MVP (va a V1/V2)
IA / scoring de bajas · app móvil · facturación ARCA · QR · reservas/clases ·
control de acceso · **cobro automático recurrente (preapproval MP)** · multisede.
```
