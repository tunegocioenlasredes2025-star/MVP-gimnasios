'use strict';

const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const { createAdapter, CATALOG } = require('./src/adapters');
const { RemoteError } = require('./src/adapters/base');
const { isValidKey, KEYS, APPS } = require('./src/keymap');
const { discover } = require('./src/discovery');
const { sendMagicPacket } = require('./src/wol');

const PORT = Number(process.env.PORT || 8099);
const HOST = process.env.HOST || '0.0.0.0';
const PIN = process.env.TV_REMOTE_PIN || '';
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

// ---------------------------------------------------------------- estado ----

/** @type {{devices: object[], activeId: string|null}} */
let config = { devices: [], activeId: null };
/** Adapters vivos, indexados por id de dispositivo. */
const adapters = new Map();

async function loadConfig() {
  try {
    config = JSON.parse(await fsp.readFile(CONFIG_FILE, 'utf8'));
    config.devices = config.devices || [];
  } catch {
    config = { devices: [], activeId: null };
  }
}

async function saveConfig() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function activeDevice() {
  if (!config.activeId) return null;
  return config.devices.find((d) => d.id === config.activeId) || null;
}

/**
 * Devuelve el adapter del dispositivo activo, creándolo si hace falta.
 * Los tokens que la TV entrega durante el pairing se persisten acá.
 */
function getAdapter() {
  const device = activeDevice();
  if (!device) throw new RemoteError('No hay ninguna TV seleccionada todavía', 409);

  let adapter = adapters.get(device.id);
  if (!adapter) {
    adapter = createAdapter(device);
    // Samsung y LG devuelven una credencial al emparejar: la guardamos sola.
    adapter.onToken = (token) => {
      device.token = token;
      saveConfig().catch(() => {});
    };
    adapter.onClientKey = (key) => {
      device.clientKey = key;
      saveConfig().catch(() => {});
    };
    adapters.set(device.id, adapter);
  }
  return adapter;
}

/** Vista pública de un dispositivo: sin credenciales. */
function publicDevice(d) {
  const { psk, token, clientKey, ...rest } = d;
  return { ...rest, hasSecret: Boolean(psk || token || clientKey) };
}

// ------------------------------------------------------------- utilidades ----

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new RemoteError('Cuerpo demasiado grande', 413));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new RemoteError('JSON inválido', 400));
      }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

async function serveStatic(req, res, urlPath) {
  const rel = urlPath === '/' ? '/index.html' : urlPath;
  const file = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC_DIR)) return json(res, 403, { error: 'Ruta no permitida' });

  try {
    const data = await fsp.readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch {
    json(res, 404, { error: 'No encontrado' });
  }
}

/** IPs de la máquina en la LAN: las que hay que tipear en el celular. */
function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const iface of list || []) {
      if (iface.family === 'IPv4' && !iface.internal) out.push(iface.address);
    }
  }
  return out;
}

// ----------------------------------------------------------------- rutas ----

const routes = {
  'GET /api/ping': async () => ({ ok: true, pinRequired: Boolean(PIN) }),

  'GET /api/catalog': async () => ({ brands: CATALOG, keys: KEYS, apps: APPS }),

  'GET /api/config': async () => ({
    devices: config.devices.map(publicDevice),
    activeId: config.activeId,
  }),

  'POST /api/devices': async (body) => {
    if (!body.type) throw new RemoteError('Falta la marca (type)', 400);
    const device = {
      id: body.id || crypto.randomUUID(),
      type: body.type,
      host: (body.host || '').trim(),
      port: body.port ? Number(body.port) : undefined,
      name: (body.name || '').trim() || 'Mi TV',
      mac: (body.mac || '').trim() || undefined,
      psk: body.psk || undefined,
    };
    if (device.type !== 'demo' && !device.host) throw new RemoteError('Falta la IP de la TV', 400);

    const existing = config.devices.findIndex((d) => d.id === device.id);
    if (existing >= 0) {
      // Conservamos credenciales ya obtenidas si el usuario solo edita el nombre.
      const prev = config.devices[existing];
      config.devices[existing] = { ...prev, ...device, psk: device.psk || prev.psk };
      adapters.get(device.id)?.disconnect?.().catch(() => {});
      adapters.delete(device.id);
    } else {
      config.devices.push(device);
    }
    config.activeId = device.id;
    await saveConfig();
    return { device: publicDevice(device), activeId: config.activeId };
  },

  'POST /api/devices/select': async (body) => {
    const device = config.devices.find((d) => d.id === body.id);
    if (!device) throw new RemoteError('Ese dispositivo no existe', 404);
    config.activeId = device.id;
    await saveConfig();
    return { activeId: config.activeId };
  },

  'POST /api/devices/delete': async (body) => {
    const before = config.devices.length;
    config.devices = config.devices.filter((d) => d.id !== body.id);
    if (config.devices.length === before) throw new RemoteError('Ese dispositivo no existe', 404);
    adapters.get(body.id)?.disconnect?.().catch(() => {});
    adapters.delete(body.id);
    if (config.activeId === body.id) config.activeId = config.devices[0]?.id || null;
    await saveConfig();
    return { activeId: config.activeId };
  },

  'GET /api/discover': async () => ({ found: await discover() }),

  'POST /api/connect': async () => {
    const adapter = await getAdapter();
    await adapter.connect();
    return { connected: true, status: await adapter.status().catch(() => ({ connected: true })) };
  },

  'POST /api/disconnect': async () => {
    const adapter = getAdapter();
    await adapter.disconnect();
    adapters.delete(config.activeId);
    return { connected: false };
  },

  'GET /api/status': async () => {
    const device = activeDevice();
    if (!device) return { device: null, status: { connected: false } };
    const adapter = getAdapter();
    const status = await adapter.status().catch((err) => ({
      connected: false,
      error: err.message,
    }));
    return { device: publicDevice(device), status };
  },

  'POST /api/key': async (body) => {
    if (!isValidKey(body.key)) throw new RemoteError(`Tecla desconocida: "${body.key}"`, 400);
    const repeat = Math.min(Math.max(Number(body.repeat) || 1, 1), 20);
    const adapter = getAdapter();
    let result;
    for (let i = 0; i < repeat; i++) result = await adapter.sendKey(body.key);
    return { ok: true, key: body.key, repeat, result };
  },

  'POST /api/text': async (body) => {
    const text = String(body.text ?? '');
    if (!text) throw new RemoteError('Falta el texto', 400);
    if (text.length > 200) throw new RemoteError('Texto demasiado largo', 400);
    return { ok: true, result: await getAdapter().sendText(text) };
  },

  'GET /api/apps': async () => ({ apps: await getAdapter().listApps() }),

  'POST /api/app': async (body) => {
    if (!body.app) throw new RemoteError('Falta el nombre de la app', 400);
    return { ok: true, result: await getAdapter().launchApp(String(body.app)) };
  },

  'POST /api/wake': async (body) => {
    const mac = body.mac || activeDevice()?.mac;
    if (!mac) throw new RemoteError('Falta la MAC de la TV para poder despertarla', 400);
    return { ok: true, result: await sendMagicPacket(mac) };
  },

  'POST /api/pair': async (body) => {
    const adapter = getAdapter();
    if (typeof adapter.pair !== 'function') {
      throw new RemoteError('Esta marca no usa código de emparejamiento', 501);
    }
    if (!body.pairPort || !body.code) throw new RemoteError('Faltan el puerto y el código', 400);
    return { ok: true, result: await adapter.pair(body.pairPort, body.code) };
  },
};

// ---------------------------------------------------------------- server ----

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const key = `${req.method} ${url.pathname}`;

  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);

  // El puente vive en la LAN. Si definiste un PIN, todo lo que no sea /api/ping lo pide.
  if (PIN && url.pathname !== '/api/ping') {
    const sent = req.headers['x-remote-pin'] || url.searchParams.get('pin') || '';
    const ok =
      sent.length === PIN.length &&
      crypto.timingSafeEqual(Buffer.from(String(sent)), Buffer.from(PIN));
    if (!ok) return json(res, 401, { error: 'PIN incorrecto' });
  }

  const handler = routes[key];
  if (!handler) return json(res, 404, { error: `Ruta desconocida: ${key}` });

  try {
    const body = req.method === 'POST' ? await readBody(req) : {};
    const result = await handler(body, url);
    json(res, 200, result);
  } catch (err) {
    const status = err instanceof RemoteError ? err.status : 500;
    if (status >= 500) console.error(`[error] ${key}:`, err);
    json(res, status, { error: err.message || 'Error interno' });
  }
});

loadConfig().then(() => {
  server.listen(PORT, HOST, () => {
    const urls = lanAddresses().map((ip) => `http://${ip}:${PORT}`);
    console.log('\n  📺  Control remoto listo\n');
    console.log('  Abrí esta dirección en el navegador del celular');
    console.log('  (el celular tiene que estar en la MISMA WiFi):\n');
    for (const u of urls) console.log(`     ${u}`);
    if (!urls.length) console.log(`     http://localhost:${PORT}`);
    if (PIN) console.log('\n  PIN activado: te lo va a pedir la primera vez.');
    console.log('');
  });
});

process.on('SIGINT', () => {
  for (const adapter of adapters.values()) adapter.disconnect?.().catch(() => {});
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
});

module.exports = server;
