'use strict';

const net = require('net');
const os = require('os');
const dgram = require('dgram');
const WebSocket = require('ws');

/** Puertos que delatan a cada marca. */
const SIGNATURES = [
  { port: 8060, type: 'roku', brand: 'Roku' },
  { port: 8001, type: 'samsung', brand: 'Samsung' },
  { port: 3000, type: 'lg', brand: 'LG webOS' },
  { port: 5555, type: 'androidtv', brand: 'Android TV' },
];

/** Redes /24 locales donde vale la pena buscar. */
function localSubnets() {
  const nets = os.networkInterfaces();
  const subnets = new Set();
  for (const list of Object.values(nets)) {
    for (const iface of list || []) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      subnets.add(iface.address.split('.').slice(0, 3).join('.'));
    }
  }
  return [...subnets];
}

function probePort(host, port, timeout = 500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (open) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

/** Ejecuta tareas con un tope de concurrencia para no reventar la red. */
async function pool(items, limit, worker) {
  const results = [];
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * El puerto 3000 abierto no alcanza para decir "es una LG": lo usa medio mundo
 * (servidores de desarrollo, Grafana, etc.). Una webOS de verdad completa el
 * handshake de WebSocket en la raíz; una app web común, no.
 */
function verifyLg(host, port = 3000, timeout = 2000) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      try {
        socket.terminate();
      } catch {}
      resolve(value);
    };
    const socket = new WebSocket(`ws://${host}:${port}`, { handshakeTimeout: timeout });
    socket.on('open', () => done(true));
    socket.on('error', () => done(false));
    socket.on('unexpected-response', () => done(false));
    setTimeout(() => done(false), timeout + 500);
  });
}

/** Pide un nombre lindo a la TV encontrada, si la marca lo permite sin autenticación. */
async function describe(host, type) {
  try {
    if (type === 'roku') {
      const res = await fetch(`http://${host}:8060/query/device-info`, {
        signal: AbortSignal.timeout(2500),
      });
      const xml = await res.text();
      const pick = (t) => (xml.match(new RegExp(`<${t}>([^<]*)</${t}>`)) || [])[1];
      return pick('friendly-device-name') || pick('user-device-name') || pick('model-name') || null;
    }
    if (type === 'samsung') {
      const res = await fetch(`http://${host}:8001/api/v2/`, { signal: AbortSignal.timeout(2500) });
      const json = await res.json();
      return (json.device && (json.device.name || json.device.modelName)) || null;
    }
  } catch {
    /* la TV puede no contestar: seguimos igual con el nombre genérico */
  }
  return null;
}

/** Barrido TCP de la LAN buscando los puertos característicos. */
async function scanLan({ subnets, onFound } = {}) {
  const nets = subnets && subnets.length ? subnets : localSubnets();
  const targets = [];
  for (const subnet of nets) {
    for (let i = 1; i <= 254; i++) {
      for (const sig of SIGNATURES) targets.push({ host: `${subnet}.${i}`, sig });
    }
  }

  const found = new Map();
  await pool(targets, 160, async ({ host, sig }) => {
    const open = await probePort(host, sig.port);
    if (!open) return;
    const key = `${host}:${sig.type}`;
    if (found.has(key)) return;
    if (sig.type === 'lg' && !(await verifyLg(host, sig.port))) return;
    const entry = { host, port: sig.port, type: sig.type, brand: sig.brand, name: null, via: 'scan' };
    found.set(key, entry);
    entry.name = await describe(host, sig.type);
    if (onFound) onFound(entry);
  });

  return [...found.values()];
}

/** Consulta SSDP: muchas TVs se anuncian solas y responden en menos de 3 segundos. */
function ssdpSearch(timeout = 3000) {
  return new Promise((resolve) => {
    const results = new Map();
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    const message = Buffer.from(
      'M-SEARCH * HTTP/1.1\r\n' +
        'HOST: 239.255.255.250:1900\r\n' +
        'MAN: "ssdp:discover"\r\n' +
        'MX: 2\r\n' +
        'ST: ssdp:all\r\n\r\n'
    );

    socket.on('error', () => {
      try {
        socket.close();
      } catch {}
      resolve([]);
    });

    socket.on('message', (msg, rinfo) => {
      const text = msg.toString();
      const server = (text.match(/^SERVER:\s*(.+)$/im) || [])[1] || '';
      const st = (text.match(/^ST:\s*(.+)$/im) || [])[1] || '';
      const blob = `${server} ${st} ${text}`.toLowerCase();

      let type = null;
      let brand = null;
      if (blob.includes('roku')) [type, brand] = ['roku', 'Roku'];
      else if (blob.includes('samsung')) [type, brand] = ['samsung', 'Samsung'];
      else if (blob.includes('webos') || blob.includes('lg electronics')) [type, brand] = ['lg', 'LG webOS'];
      else if (blob.includes('sony') || blob.includes('bravia')) [type, brand] = ['sony', 'Sony Bravia'];
      if (!type) return;

      const key = `${rinfo.address}:${type}`;
      if (results.has(key)) return;
      const name = (text.match(/^X-Friendly-Name:\s*(.+)$/im) || [])[1] || null;
      results.set(key, { host: rinfo.address, type, brand, name, via: 'ssdp', port: null });
    });

    socket.bind(() => {
      try {
        socket.setBroadcast(true);
      } catch {}
      socket.send(message, 0, message.length, 1900, '239.255.255.250');
      setTimeout(() => {
        try {
          socket.close();
        } catch {}
        resolve([...results.values()]);
      }, timeout);
    });
  });
}

/** Búsqueda completa: SSDP + barrido, resultados unificados. */
async function discover(options = {}) {
  const [ssdp, scan] = await Promise.all([ssdpSearch(), scanLan(options)]);
  const merged = new Map();
  for (const item of [...ssdp, ...scan]) {
    const key = `${item.host}:${item.type}`;
    const prev = merged.get(key) || {};
    merged.set(key, { ...prev, ...item, name: item.name || prev.name || null });
  }
  return [...merged.values()].sort((a, b) => a.host.localeCompare(b.host));
}

module.exports = { discover, scanLan, ssdpSearch, localSubnets, probePort };
