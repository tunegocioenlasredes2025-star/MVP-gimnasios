'use strict';

const WebSocket = require('ws');
const { BaseAdapter, RemoteError, UnsupportedKey, PairingRequired, netMessage } = require('./base');

/**
 * Samsung Smart TV (Tizen, modelos 2016 en adelante).
 *
 * WebSocket seguro en el puerto 8002 (wss). El certificado de la TV es
 * autofirmado, por eso rejectUnauthorized:false — es una conexión dentro de tu
 * propia red LAN contra un host que vos elegiste a mano.
 *
 * La PRIMERA conexión muestra un cartel en la TV ("¿Permitir este dispositivo?").
 * Al aceptar, la TV manda un token que guardamos; las siguientes conexiones ya
 * no preguntan nada.
 */
const MAP = {
  POWER: 'KEY_POWER',
  POWER_OFF: 'KEY_POWER',
  VOL_UP: 'KEY_VOLUP',
  VOL_DOWN: 'KEY_VOLDOWN',
  MUTE: 'KEY_MUTE',
  CH_UP: 'KEY_CHUP',
  CH_DOWN: 'KEY_CHDOWN',
  CH_LAST: 'KEY_PRECH',
  UP: 'KEY_UP',
  DOWN: 'KEY_DOWN',
  LEFT: 'KEY_LEFT',
  RIGHT: 'KEY_RIGHT',
  OK: 'KEY_ENTER',
  BACK: 'KEY_RETURN',
  HOME: 'KEY_HOME',
  MENU: 'KEY_MENU',
  EXIT: 'KEY_EXIT',
  INFO: 'KEY_INFO',
  GUIDE: 'KEY_GUIDE',
  PLAY: 'KEY_PLAY',
  PAUSE: 'KEY_PAUSE',
  PLAY_PAUSE: 'KEY_PLAY_BACK',
  STOP: 'KEY_STOP',
  REWIND: 'KEY_REWIND',
  FORWARD: 'KEY_FF',
  RECORD: 'KEY_REC',
  INPUT: 'KEY_SOURCE',
  HDMI1: 'KEY_HDMI1',
  HDMI2: 'KEY_HDMI2',
  HDMI3: 'KEY_HDMI3',
  HDMI4: 'KEY_HDMI4',
  DIGIT_0: 'KEY_0',
  DIGIT_1: 'KEY_1',
  DIGIT_2: 'KEY_2',
  DIGIT_3: 'KEY_3',
  DIGIT_4: 'KEY_4',
  DIGIT_5: 'KEY_5',
  DIGIT_6: 'KEY_6',
  DIGIT_7: 'KEY_7',
  DIGIT_8: 'KEY_8',
  DIGIT_9: 'KEY_9',
  ENTER: 'KEY_ENTER',
  RED: 'KEY_RED',
  GREEN: 'KEY_GREEN',
  YELLOW: 'KEY_YELLOW',
  BLUE: 'KEY_BLUE',
};

// IDs de Tizen para las apps más comunes.
const APP_IDS = {
  netflix: '11101200001',
  youtube: '111299001912',
  prime: '3201910019365',
  disney: '3201901017640',
  spotify: '3201606009684',
  hbo: '3201601007230',
};

class SamsungAdapter extends BaseAdapter {
  static type = 'samsung';
  static brand = 'Samsung';
  static defaultPort = 8002;

  constructor(config) {
    super(config);
    this.ws = null;
    this.token = config.token || null;
    this.ready = null;
  }

  url() {
    const name = Buffer.from(this.config.clientName || 'Control Celular').toString('base64');
    const port = this.config.port || SamsungAdapter.defaultPort;
    const scheme = port === 8001 ? 'ws' : 'wss';
    const qs = new URLSearchParams({ name });
    if (this.token) qs.set('token', this.token);
    return `${scheme}://${this.host}:${port}/api/v2/channels/samsung.remote.control?${qs}`;
  }

  connect() {
    if (this.ready) return this.ready;

    this.ready = new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url(), { rejectUnauthorized: false, handshakeTimeout: 8000 });
      this.ws = ws;

      const timer = setTimeout(() => {
        ws.terminate();
        reject(
          new PairingRequired(
            'La TV no confirmó la conexión. Mirá la pantalla: tiene que aparecer un cartel ' +
              'para permitir este dispositivo. Aceptalo y volvé a intentar.'
          )
        );
      }, 30000);

      ws.on('message', (raw) => {
        let msg;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }
        if (msg.event === 'ms.channel.connect') {
          clearTimeout(timer);
          if (msg.data && msg.data.token) {
            this.token = msg.data.token;
            if (this.onToken) this.onToken(this.token);
          }
          resolve(this);
        }
        if (msg.event === 'ms.channel.unauthorized') {
          clearTimeout(timer);
          ws.terminate();
          reject(new PairingRequired('La TV rechazó la conexión. Revisá los permisos en Configuración > General > Administrador de dispositivos externos.'));
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
      });
    });

    this.ready.catch(() => {
      this.ready = null;
    });
    return this.ready;
  }

  async disconnect() {
    if (this.ws) this.ws.close();
    this.ws = null;
    this.ready = null;
  }

  async status() {
    // El endpoint HTTP de info no necesita pairing: sirve para saber si está viva.
    const res = await fetch(`http://${this.host}:8001/api/v2/`, {
      signal: AbortSignal.timeout(3000),
    }).catch(() => null);
    if (!res || !res.ok) return { connected: false };
    const info = await res.json().catch(() => ({}));
    return {
      connected: !!this.ws,
      name: info.device && info.device.name,
      model: info.device && info.device.modelName,
      paired: !!this.token,
    };
  }

  async send(payload) {
    await this.connect();
    return new Promise((resolve, reject) => {
      this.ws.send(JSON.stringify(payload), (err) =>
        err ? reject(new RemoteError(err.message, 502)) : resolve()
      );
    });
  }

  async sendKey(key) {
    const native = MAP[key];
    if (!native) throw new UnsupportedKey(key, this.brand);
    await this.send({
      method: 'ms.remote.control',
      params: {
        Cmd: 'Click',
        DataOfCmd: native,
        Option: 'false',
        TypeOfRemote: 'SendRemoteKey',
      },
    });
    return { sent: native };
  }

  async sendText(text) {
    await this.send({
      method: 'ms.remote.control',
      params: {
        Cmd: Buffer.from(String(text)).toString('base64'),
        DataOfCmd: 'base64',
        TypeOfRemote: 'SendInputString',
      },
    });
    return { sent: text.length };
  }

  async listApps() {
    return Object.entries(APP_IDS).map(([name, id]) => ({ id, name }));
  }

  async launchApp(name) {
    const id = APP_IDS[name];
    if (!id) throw new RemoteError(`No tengo el ID de Tizen para "${name}"`, 404);
    // El canal de apps es distinto del de teclas: se abre por HTTP.
    const res = await fetch(`http://${this.host}:8001/api/v2/applications/${id}`, {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
    }).catch((err) => {
      throw new RemoteError(`No se pudo abrir la app: ${err.message}`, 502);
    });
    if (!res.ok) throw new RemoteError(`La TV respondió ${res.status} al abrir "${name}"`, 502);
    return { launched: name };
  }
}

module.exports = SamsungAdapter;
