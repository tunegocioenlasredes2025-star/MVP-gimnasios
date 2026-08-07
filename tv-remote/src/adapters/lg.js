'use strict';

const WebSocket = require('ws');
const { BaseAdapter, RemoteError, UnsupportedKey, PairingRequired, netMessage } = require('./base');

/**
 * LG Smart TV (webOS).
 *
 * Protocolo SSAP sobre WebSocket, puerto 3000. La primera vez la TV muestra un
 * cartel de pairing; al aceptar devuelve una "client-key" que guardamos.
 *
 * Las flechas / OK / BACK no van por SSAP: viajan por un segundo socket que la
 * propia TV nos indica (el "pointer input socket").
 */

// Comandos que sí son SSAP.
const SSAP = {
  VOL_UP: { uri: 'ssap://audio/volumeUp' },
  VOL_DOWN: { uri: 'ssap://audio/volumeDown' },
  MUTE: { uri: 'ssap://audio/setMute', payload: { mute: true } },
  CH_UP: { uri: 'ssap://tv/channelUp' },
  CH_DOWN: { uri: 'ssap://tv/channelDown' },
  POWER: { uri: 'ssap://system/turnOff' },
  POWER_OFF: { uri: 'ssap://system/turnOff' },
  INFO: { uri: 'ssap://com.webos.service.ime/sendEnterKey' },
};

// Comandos que van por el pointer socket (botones físicos del control).
const BUTTON = {
  UP: 'UP',
  DOWN: 'DOWN',
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
  OK: 'ENTER',
  ENTER: 'ENTER',
  BACK: 'BACK',
  HOME: 'HOME',
  MENU: 'MENU',
  EXIT: 'EXIT',
  GUIDE: 'GUIDE',
  PLAY: 'PLAY',
  PAUSE: 'PAUSE',
  PLAY_PAUSE: 'PLAY',
  STOP: 'STOP',
  REWIND: 'REWIND',
  FORWARD: 'FASTFORWARD',
  RECORD: 'RECORD',
  CH_LAST: 'BACK',
  INPUT: 'INPUT_HUB',
  BACKSPACE: 'BACK',
  DIGIT_0: '0',
  DIGIT_1: '1',
  DIGIT_2: '2',
  DIGIT_3: '3',
  DIGIT_4: '4',
  DIGIT_5: '5',
  DIGIT_6: '6',
  DIGIT_7: '7',
  DIGIT_8: '8',
  DIGIT_9: '9',
  RED: 'RED',
  GREEN: 'GREEN',
  YELLOW: 'YELLOW',
  BLUE: 'BLUE',
};

const APP_IDS = {
  netflix: 'netflix',
  youtube: 'youtube.leanback.v4',
  prime: 'amazon',
  disney: 'com.disney.disneyplus-prod',
  spotify: 'spotify-beehive',
  hbo: 'hbomax',
};

const MANIFEST = {
  manifestVersion: 1,
  appVersion: '1.0',
  signed: {
    created: '20140509',
    appId: 'com.tv.remote.celular',
    vendorId: 'com.tv.remote',
    localizedAppNames: { '': 'Control Celular' },
    localizedVendorNames: { '': 'Control Celular' },
    permissions: ['TEST_SECURE', 'CONTROL_INPUT_TEXT', 'CONTROL_MOUSE_AND_KEYBOARD', 'READ_INSTALLED_APPS', 'READ_LGE_SDX', 'READ_NOTIFICATIONS', 'SEARCH', 'WRITE_SETTINGS', 'WRITE_NOTIFICATION_ALERT', 'CONTROL_POWER', 'READ_CURRENT_CHANNEL', 'READ_RUNNING_APPS', 'READ_UPDATE_INFO', 'UPDATE_FROM_REMOTE_APP', 'READ_LGE_TV_INPUT_EVENTS', 'READ_TV_CURRENT_TIME'],
    serial: '2f930e2d2cfe083771f68e4fe7bb07',
  },
  permissions: ['LAUNCH', 'LAUNCH_WEBAPP', 'APP_TO_APP', 'CLOSE', 'TEST_OPEN', 'TEST_PROTECTED', 'CONTROL_AUDIO', 'CONTROL_DISPLAY', 'CONTROL_INPUT_JOYSTICK', 'CONTROL_INPUT_MEDIA_RECORDING', 'CONTROL_INPUT_MEDIA_PLAYBACK', 'CONTROL_INPUT_TV', 'CONTROL_POWER', 'READ_APP_STATUS', 'READ_CURRENT_CHANNEL', 'READ_INPUT_DEVICE_LIST', 'READ_NETWORK_STATE', 'READ_RUNNING_APPS', 'READ_TV_CHANNEL_LIST', 'WRITE_NOTIFICATION_TOAST', 'READ_POWER_STATE', 'READ_COUNTRY_INFO'],
  signatures: [
    {
      signatureVersion: 1,
      signature:
        'eyJhbGdvcml0aG0iOiJSU0EtU0hBMjU2Iiwia2V5SWQiOiJ0ZXN0LXNpZ25pbmctY2VydCIsIndlbGwta25vd24iOiJodHRwczovL3dlYm9zdHYuZGV2ZWxvcGVyLmxnZS5jb20vY2EvY2VydHMifQ==',
    },
  ],
};

class LgAdapter extends BaseAdapter {
  static type = 'lg';
  static brand = 'LG webOS';
  static defaultPort = 3000;

  constructor(config) {
    super(config);
    this.ws = null;
    this.pointer = null;
    this.ready = null;
    this.clientKey = config.clientKey || null;
    this.seq = 0;
    this.pending = new Map();
  }

  connect() {
    if (this.ready) return this.ready;

    this.ready = new Promise((resolve, reject) => {
      const port = this.config.port || LgAdapter.defaultPort;
      const ws = new WebSocket(`ws://${this.host}:${port}`, { handshakeTimeout: 8000 });
      this.ws = ws;

      const timer = setTimeout(() => {
        ws.terminate();
        reject(
          new PairingRequired(
            'La TV no confirmó el emparejamiento. Fijate en la pantalla: aparece un cartel ' +
              'para permitir "Control Celular". Aceptalo con el control original y reintentá.'
          )
        );
      }, 45000);

      ws.on('open', () => {
        const payload = { forcePairing: false, pairingType: 'PROMPT', manifest: MANIFEST };
        if (this.clientKey) payload['client-key'] = this.clientKey;
        ws.send(JSON.stringify({ type: 'register', id: 'register_0', payload }));
      });

      ws.on('message', (raw) => {
        let msg;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }

        if (msg.id === 'register_0' && msg.type === 'registered') {
          clearTimeout(timer);
          const key = msg.payload && msg.payload['client-key'];
          if (key && key !== this.clientKey) {
            this.clientKey = key;
            if (this.onClientKey) this.onClientKey(key);
          }
          resolve(this);
          return;
        }

        const waiter = this.pending.get(msg.id);
        if (waiter) {
          this.pending.delete(msg.id);
          if (msg.type === 'error') waiter.reject(new RemoteError(msg.error || 'Error de la TV', 502));
          else waiter.resolve(msg.payload || {});
        }
      });

      ws.on('error', (err) => {
        clearTimeout(timer);
        this.ready = null;
        reject(new RemoteError(netMessage(err, this.brand, this.host), 502));
      });

      ws.on('close', () => {
        this.ready = null;
        this.ws = null;
        if (this.pointer) {
          this.pointer.close();
          this.pointer = null;
        }
      });
    });

    this.ready.catch(() => {
      this.ready = null;
    });
    return this.ready;
  }

  async disconnect() {
    if (this.pointer) this.pointer.close();
    if (this.ws) this.ws.close();
    this.ws = null;
    this.pointer = null;
    this.ready = null;
  }

  async request(uri, payload) {
    await this.connect();
    const id = `req_${++this.seq}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new RemoteError(`La TV no respondió a ${uri}`, 504));
      }, 8000);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.ws.send(JSON.stringify({ id, type: 'request', uri, payload: payload || {} }));
    });
  }

  /** Abre (o reutiliza) el socket de botones que la propia TV nos indica. */
  async pointerSocket() {
    if (this.pointer && this.pointer.readyState === WebSocket.OPEN) return this.pointer;
    const res = await this.request('ssap://com.webos.service.networkinput/getPointerInputSocket');
    const path = res.socketPath;
    if (!path) throw new RemoteError('La TV no devolvió el socket de botones', 502);
    return new Promise((resolve, reject) => {
      const sock = new WebSocket(path, { rejectUnauthorized: false, handshakeTimeout: 8000 });
      sock.on('open', () => {
        this.pointer = sock;
        resolve(sock);
      });
      sock.on('error', (err) => reject(new RemoteError(err.message, 502)));
      sock.on('close', () => {
        if (this.pointer === sock) this.pointer = null;
      });
    });
  }

  async status() {
    if (!this.ws) return { connected: false, paired: !!this.clientKey };
    const info = await this.request('ssap://system/getSystemInfo').catch(() => ({}));
    return {
      connected: true,
      paired: !!this.clientKey,
      model: info.modelName || null,
    };
  }

  async sendKey(key) {
    if (key === 'MUTE') {
      const state = await this.request('ssap://audio/getStatus').catch(() => ({}));
      await this.request('ssap://audio/setMute', { mute: !state.mute });
      return { sent: 'MUTE' };
    }

    const ssap = SSAP[key];
    if (ssap) {
      await this.request(ssap.uri, ssap.payload);
      return { sent: ssap.uri };
    }

    const button = BUTTON[key];
    if (button) {
      const sock = await this.pointerSocket();
      sock.send(`type:button\nname:${button}\n\n`);
      return { sent: button };
    }

    throw new UnsupportedKey(key, this.brand);
  }

  async sendText(text) {
    await this.request('ssap://com.webos.service.ime/insertText', {
      text: String(text),
      replace: false,
    });
    return { sent: text.length };
  }

  async listApps() {
    const res = await this.request('ssap://com.webos.applicationManager/listLaunchPoints');
    return (res.launchPoints || []).map((p) => ({ id: p.id, name: p.title }));
  }

  async launchApp(name) {
    const id = APP_IDS[name] || name;
    await this.request('ssap://system.launcher/launch', { id });
    return { launched: id };
  }
}

module.exports = LgAdapter;
