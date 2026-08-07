/* ==========================================================================
   Control Remoto TV — lógica del cliente.
   El celular nunca habla con la TV directamente: le habla al puente,
   y el puente traduce a lo que entienda cada marca.
   ========================================================================== */
'use strict';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const state = {
  pin: localStorage.getItem('tvremote.pin') || '',
  brands: [],
  devices: [],
  activeId: null,
  busy: false,
};

// ------------------------------------------------------------------ api ----

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.pin) headers['x-remote-pin'] = state.pin;

  let res;
  try {
    res = await fetch(path, { ...options, headers });
  } catch {
    throw new Error('No llego al puente. ¿Está prendida la compu y estás en la misma WiFi?');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body || {}) });

// ---------------------------------------------------------------- toast ----

let toastTimer;
function toast(message, isError = false) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.toggle('is-error', isError);
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), isError ? 4200 : 1800);
}

function buzz(ms = 12) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

function setDot(stateName) {
  $('#dot').dataset.state = stateName;
}

// ----------------------------------------------------------- comandos -----

/**
 * Manda una tecla. Es "fire and forget" a propósito: si el usuario aprieta
 * volumen cinco veces seguidas no queremos encolar ni bloquear la UI, solo
 * avisar si algo falló.
 */
async function sendKey(key) {
  buzz();
  try {
    await post('/api/key', { key });
    setDot('on');
  } catch (err) {
    setDot('error');
    toast(err.message, true);
  }
}

async function launchApp(app) {
  buzz(18);
  toast(`Abriendo ${app}…`);
  try {
    await post('/api/app', { app });
    setDot('on');
  } catch (err) {
    setDot('error');
    toast(err.message, true);
  }
}

// ------------------------------------------------------ botones y holds ----

/**
 * Un tap en cualquier elemento con data-key manda esa tecla.
 * Los que tienen data-hold quedan afuera: esos ya se disparan en el pointerdown
 * y si no los excluyéramos acá cada toque contaría doble.
 */
document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-key]');
  if (target && !target.hasAttribute('data-hold')) sendKey(target.dataset.key);

  const app = event.target.closest('[data-app]');
  if (app) launchApp(app.dataset.app);
});

/**
 * Volumen y canal: mantener apretado repite.
 * Arranca lento y acelera, como un control de verdad.
 */
function wireHold(el) {
  let timer = null;
  let delay = 420;

  const tick = () => {
    sendKey(el.dataset.key);
    delay = Math.max(120, delay - 90);
    timer = setTimeout(tick, delay);
  };

  const start = (event) => {
    event.preventDefault();
    if (timer) return;
    delay = 420;
    sendKey(el.dataset.key);
    timer = setTimeout(tick, delay);
  };

  const stop = () => {
    clearTimeout(timer);
    timer = null;
  };

  el.addEventListener('pointerdown', start);
  for (const evt of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(evt, stop);
}

$$('[data-hold]').forEach(wireHold);

// ------------------------------------------------------------ swipe d-pad --

/**
 * Deslizar sobre el círculo navega. Cada 46px de arrastre = una flecha,
 * así se puede recorrer una grilla larga sin levantar el dedo.
 */
(function wireSwipe() {
  const pad = $('#dpad');
  const STEP = 46;
  let active = false;
  let originX = 0;
  let originY = 0;
  let moved = false;

  pad.addEventListener('pointerdown', (event) => {
    // Los botones internos manejan su propio tap.
    if (event.target.closest('.dpad-btn, .dpad-ok')) return;
    active = true;
    moved = false;
    originX = event.clientX;
    originY = event.clientY;
    pad.classList.add('is-swiping');
    pad.setPointerCapture(event.pointerId);
  });

  pad.addEventListener('pointermove', (event) => {
    if (!active) return;
    const dx = event.clientX - originX;
    const dy = event.clientY - originY;
    if (Math.abs(dx) < STEP && Math.abs(dy) < STEP) return;

    moved = true;
    if (Math.abs(dx) > Math.abs(dy)) {
      sendKey(dx > 0 ? 'RIGHT' : 'LEFT');
      originX = event.clientX;
      originY = event.clientY;
    } else {
      sendKey(dy > 0 ? 'DOWN' : 'UP');
      originX = event.clientX;
      originY = event.clientY;
    }
  });

  const end = () => {
    if (active && !moved) sendKey('OK'); // tap seco en el círculo = OK
    active = false;
    pad.classList.remove('is-swiping');
  };

  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', () => {
    active = false;
    pad.classList.remove('is-swiping');
  });
})();

// -------------------------------------------------------------- teclado ----

$('#btnSendText').addEventListener('click', async () => {
  const input = $('#textInput');
  const text = input.value.trim();
  if (!text) return toast('Escribí algo primero');
  buzz(20);
  try {
    await post('/api/text', { text });
    toast('Enviado');
    input.value = '';
  } catch (err) {
    toast(err.message, true);
  }
});

// ----------------------------------------------------------------- tabs ----

$$('.tab').forEach((tab) => {
  tab.addEventListener('click', () => showPanel(tab.dataset.panel));
});

$('#btnSettings').addEventListener('click', () => showPanel('settings'));

function showPanel(name) {
  buzz(8);
  $$('.panel').forEach((p) => p.classList.toggle('is-active', p.id === `panel-${name}`));
  $$('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.panel === name));
  document.querySelector('main').scrollTop = 0;
  if (name === 'settings') refreshDevices();
}

// -------------------------------------------------------------- ajustes ----

async function loadCatalog() {
  const { brands } = await api('/api/catalog');
  state.brands = brands;
  const select = $('#fType');
  select.innerHTML = brands
    .map((b) => `<option value="${b.type}">${b.brand}</option>`)
    .join('');
  select.addEventListener('change', togglePsk);
  togglePsk();
}

function togglePsk() {
  const type = $('#fType').value;
  $('#fPskWrap').hidden = type !== 'sony';
}

async function refreshDevices() {
  try {
    const data = await api('/api/config');
    state.devices = data.devices;
    state.activeId = data.activeId;
    renderDevices();
  } catch (err) {
    toast(err.message, true);
  }
}

function renderDevices() {
  const list = $('#deviceList');
  if (!state.devices.length) {
    list.innerHTML = '<p class="muted">Todavía no cargaste ninguna TV.</p>';
    return;
  }

  list.innerHTML = '';
  for (const device of state.devices) {
    const brand = state.brands.find((b) => b.type === device.type);
    const row = document.createElement('div');
    row.className = 'device-item' + (device.id === state.activeId ? ' is-active' : '');
    row.innerHTML = `
      <div class="meta">
        <strong></strong>
        <small></small>
      </div>
      <button class="icon-btn" data-del aria-label="Borrar">
        <svg class="ico"><use href="#i-trash"/></svg>
      </button>`;
    row.querySelector('strong').textContent = device.name || 'Mi TV';
    row.querySelector('small').textContent =
      `${brand ? brand.brand : device.type} · ${device.host || 'simulada'}`;

    row.querySelector('.meta').addEventListener('click', async () => {
      await post('/api/devices/select', { id: device.id });
      await refreshDevices();
      await refreshStatus();
      toast(`Ahora controlás "${device.name}"`);
    });

    row.querySelector('[data-del]').addEventListener('click', async (event) => {
      event.stopPropagation();
      if (!confirm(`¿Borrar "${device.name}"?`)) return;
      await post('/api/devices/delete', { id: device.id });
      await refreshDevices();
      await refreshStatus();
    });

    list.appendChild(row);
  }
}

$('#deviceForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const body = {
    id: $('#deviceId').value || undefined,
    type: $('#fType').value,
    host: $('#fHost').value.trim(),
    name: $('#fName').value.trim(),
    mac: $('#fMac').value.trim(),
    psk: $('#fPsk').value.trim() || undefined,
  };

  try {
    setDot('busy');
    await post('/api/devices', body);
    $('#deviceId').value = '';
    await refreshDevices();

    // El encabezado se actualiza al toque: conectar puede tardar unos segundos
    // y no queremos que siga mostrando la TV anterior mientras tanto.
    const brand = state.brands.find((b) => b.type === body.type);
    $('#tvName').textContent = body.name || 'Mi TV';
    $('#tvSub').textContent = [brand ? brand.brand : body.type, body.host].filter(Boolean).join(' · ');

    toast('Guardada. Conectando…');
    await connect();
  } catch (err) {
    setDot('error');
    toast(err.message, true);
  }
});

$('#btnDiscover').addEventListener('click', async () => {
  const box = $('#discoverResult');
  const btn = $('#btnDiscover');
  btn.disabled = true;
  box.innerHTML = '<p class="muted">Buscando en toda la red… (puede tardar hasta 30 segundos)</p>';

  try {
    const { found } = await api('/api/discover');
    if (!found.length) {
      box.innerHTML =
        '<p class="muted">No encontré ninguna TV. Verificá que esté prendida, ' +
        'conectada a la misma WiFi, y que tenga habilitado el control por red.</p>';
      return;
    }

    box.innerHTML = '';
    for (const item of found) {
      const btnEl = document.createElement('button');
      btnEl.type = 'button';
      btnEl.className = 'found-item';
      btnEl.innerHTML = '<div class="meta"><strong></strong><small></small></div>';
      btnEl.querySelector('strong').textContent = item.name || item.brand;
      btnEl.querySelector('small').textContent = `${item.brand} · ${item.host}`;
      btnEl.addEventListener('click', () => {
        $('#fType').value = item.type;
        $('#fHost').value = item.host;
        $('#fName').value = item.name || item.brand;
        togglePsk();
        toast('Cargada en el formulario. Tocá «Guardar y conectar».');
        $('#deviceForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      box.appendChild(btnEl);
    }
  } catch (err) {
    box.innerHTML = '';
    toast(err.message, true);
  } finally {
    btn.disabled = false;
  }
});

$('#btnWake').addEventListener('click', async () => {
  const mac = $('#fMac').value.trim();
  try {
    await post('/api/wake', mac ? { mac } : {});
    toast('Paquete mágico enviado. Dale unos segundos a la TV.');
  } catch (err) {
    toast(err.message, true);
  }
});

$('#btnConnect').addEventListener('click', connect);

$('#btnDisconnect').addEventListener('click', async () => {
  try {
    await post('/api/disconnect');
    setDot('off');
    toast('Desconectado');
  } catch (err) {
    toast(err.message, true);
  }
});

$('#fPin').addEventListener('change', (event) => {
  state.pin = event.target.value.trim();
  localStorage.setItem('tvremote.pin', state.pin);
  toast(state.pin ? 'PIN guardado en este celular' : 'PIN borrado');
  refreshStatus();
});

async function connect() {
  setDot('busy');
  try {
    await post('/api/connect');
    setDot('on');
    toast('Conectado');
    await refreshStatus();
  } catch (err) {
    setDot('error');
    toast(err.message, true);
  }
}

// --------------------------------------------------------------- estado ----

async function refreshStatus() {
  try {
    const { device, status } = await api('/api/status');
    if (!device) {
      $('#tvName').textContent = 'Sin TV configurada';
      $('#tvSub').textContent = 'Tocá el engranaje para empezar';
      $('#statusDetail').textContent = '—';
      setDot('off');
      return;
    }

    const brand = state.brands.find((b) => b.type === device.type);
    $('#tvName').textContent = device.name || 'Mi TV';

    const bits = [brand ? brand.brand : device.type, device.host].filter(Boolean);
    if (status.model) bits.push(status.model);
    $('#tvSub').textContent = bits.join(' · ');

    setDot(status.connected ? 'on' : status.error ? 'error' : 'off');
    $('#statusDetail').textContent = status.error
      ? status.error
      : status.connected
        ? 'Conectada y respondiendo.'
        : 'Configurada, pero sin conexión activa.';
  } catch (err) {
    setDot('error');
    $('#statusDetail').textContent = err.message;
  }
}

// --------------------------------------------------------------- arranque --

(async function init() {
  $('#fPin').value = state.pin;

  try {
    await loadCatalog();
  } catch (err) {
    toast(err.message, true);
  }

  await refreshDevices();
  await refreshStatus();

  if (!state.devices.length) showPanel('settings');

  // Refresco suave del estado mientras la app está en pantalla.
  setInterval(() => {
    if (document.visibilityState === 'visible') refreshStatus();
  }, 15000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshStatus();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
