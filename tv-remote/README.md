# Control Remoto TV 📺

Controlá tu televisor desde el celular, por WiFi, con una web app que se instala
como si fuera una app nativa.

---

## Antes que nada: por qué no alcanza con index + CSS + JS

Un `index.html` suelto abierto en el navegador del celular **no puede controlar una
tele**, por dos motivos técnicos:

1. **No hay acceso al infrarrojo.** El navegador no expone el emisor IR (y la
   mayoría de los celulares modernos ni siquiera tiene uno).
2. **No puede abrir conexiones crudas.** Las TVs usan WebSockets propietarios, SOAP
   o ADB. El navegador bloquea eso por seguridad (CORS y sockets TCP).

La solución que usan **todas** las apps de control remoto es la misma que está acá:

```
  📱 Celular                🖥️ Puente (tu compu)              📺 TV
  web app  ──── WiFi ────►  servidor Node.js  ──── WiFi ────►  Samsung / LG /
  (esta app)                (traduce a cada marca)             Roku / Sony / Android
```

El celular manda "subí el volumen"; el puente lo traduce al protocolo que entiende
tu marca y se lo manda a la tele.

---

## 1. Qué necesitás

- Una compu (Windows, Mac o Linux) o una Raspberry en la **misma WiFi** que la TV.
- **Node.js 18 o superior** ([nodejs.org](https://nodejs.org)).
- Una TV con control por red: Samsung, LG, Roku, Sony o Android TV (ver la tabla).

> Si no tenés ninguna de esas, igual podés probar toda la app con la **TV de prueba**
> (marca "TV de prueba" en el selector): simula una tele con volumen y canales.

## 2. Arrancarlo

```bash
cd tv-remote
npm install
npm start
```

Vas a ver algo así:

```
  📺  Control remoto listo

  Abrí esta dirección en el navegador del celular
  (el celular tiene que estar en la MISMA WiFi):

     http://192.168.0.20:8099
```

## 3. Usarlo desde el celular

1. Abrí esa dirección en Chrome o Safari.
2. Entrá a **Ajustes** (el engranaje) → **Buscar**. Escanea tu red y lista las teles.
3. Tocá la tuya, después **Guardar y conectar**.
4. Si la TV pide permiso en pantalla, **aceptá con el control original**. Se hace una
   sola vez: el token queda guardado.

**Instalalo como app:** en Chrome, menú → "Agregar a pantalla de inicio". En iPhone,
Compartir → "Agregar a inicio". Queda con ícono propio y sin barra del navegador.

---

## 4. Qué hay que habilitar en cada TV

| Marca | Cómo se conecta | Qué activar en la TV |
|---|---|---|
| **Roku** / TCL Roku | HTTP puerto 8060 | Configuración › Sistema › Control por aplicaciones móviles → **Habilitado** |
| **Samsung** (Tizen 2016+) | WebSocket seguro 8002 | La TV muestra un cartel la primera vez: **Permitir**. Si lo rechazaste: Configuración › General › Administrador de dispositivos externos |
| **LG** (webOS) | WebSocket 3000 | Aparece un cartel de emparejamiento: aceptar con el control |
| **Sony Bravia** | HTTP + IRCC | Red › Configuración de red doméstica › **IP Control** → Autenticación "Normal y Pre-Shared Key", y poné una clave (esa va en el campo PSK) |
| **Android TV / Google TV / Fire TV** | ADB por red | Opciones de desarrollador › **Depuración por USB / ADB por red**. Necesita `adb` instalado en la compu del puente |

### Prender la TV estando apagada

Cuando la tele está apagada del todo, su WiFi también lo está: ningún comando
normal llega. Por eso está el botón **Despertar (WoL)**, que manda un "paquete
mágico" que escucha la placa de red aunque la TV esté en standby.

Para que funcione: cargá la **MAC** de la TV en Ajustes, y activá en la tele la
opción de encendido por red (suele llamarse "Encender por móvil", "Wake on LAN"
o "Encendido remoto").

---

## 5. Seguridad

El puente escucha en tu red local. Si querés que pida un PIN:

```bash
TV_REMOTE_PIN=2468 npm start
```

Después cargá ese PIN en Ajustes › PIN del puente (queda guardado en el celular).

**No lo publiques en internet.** Está pensado para tu red de casa. Si lo exponés
afuera, cualquiera podría manejarte la tele.

---

## 6. Si algo no anda

| Síntoma | Qué pasa |
|---|---|
| "No llego al puente" | El celular está en otra red (¿datos móviles en vez de WiFi?), o el server se cerró. Muchos routers tienen "aislamiento de clientes": desactivalo. |
| "Buscar" no encuentra nada | La TV está apagada del todo, o no tiene habilitado el control por red. Probá cargar la IP a mano (está en el menú de red de la TV). |
| "Rechazó la conexión" | Suele ser el control por red desactivado en el menú de la tele. |
| Samsung nunca conecta | Rechazaste el cartel de permiso. Borrá la TV en Ajustes, volvé a agregarla y aceptá en pantalla. |
| Sony da error 401 | La Pre-Shared Key no coincide con la que cargaste en la TV. |

---

## 7. Cómo está armado

```
tv-remote/
├── server.js              # Puente: sirve la web app y expone la API
├── src/
│   ├── keymap.js          # Teclas canónicas que entiende la API
│   ├── discovery.js       # Busca TVs: SSDP + barrido de la red
│   ├── wol.js             # Wake-on-LAN
│   └── adapters/          # Un traductor por marca
│       ├── base.js        # Contrato común + mensajes de error en criollo
│       ├── roku.js        # ECP (HTTP)
│       ├── samsung.js     # Tizen (WebSocket + token)
│       ├── lg.js          # webOS SSAP (+ socket de botones)
│       ├── sony.js        # IRCC / Scalar (SOAP + PSK)
│       ├── androidtv.js   # ADB
│       └── demo.js        # TV simulada para probar sin tele
└── public/                # La app del celular (HTML + CSS + JS, sin frameworks)
```

**Agregar una marca nueva** es escribir un adapter: una clase con `sendKey`,
`status` y opcionalmente `sendText` / `launchApp`, y registrarla en
`src/adapters/index.js`. El resto (interfaz, descubrimiento, errores) ya funciona.

### La API del puente

| Ruta | Qué hace |
|---|---|
| `GET /api/catalog` | Marcas y teclas soportadas |
| `GET /api/discover` | Busca TVs en la red |
| `POST /api/devices` | Da de alta / edita una TV |
| `POST /api/connect` | Conecta (dispara el emparejamiento) |
| `POST /api/key` | `{"key":"VOL_UP","repeat":3}` |
| `POST /api/text` | `{"text":"stranger things"}` |
| `POST /api/app` | `{"app":"netflix"}` |
| `POST /api/wake` | Paquete mágico de Wake-on-LAN |
| `GET /api/status` | Estado de la TV activa |

---

## 8. ¿Y si mi TV no es ninguna de esas?

Si es un televisor viejo, sin red, la única forma es **infrarrojo**. Ahí hacen falta
20 dólares de ferretería electrónica: un **ESP8266/ESP32 con un LED infrarrojo**
(o un Broadlink RM4 ya armado) que reciba órdenes por WiFi y las emita en IR.

Esta misma app sirve para eso: se escribe un adapter más que le pegue por HTTP al
ESP, y la interfaz del celular no cambia en nada.
