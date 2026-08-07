'use strict';

const { BaseAdapter, RemoteError, UnsupportedKey, netMessage } = require('./base');

/**
 * Roku / TCL Roku TV / Hisense Roku TV.
 *
 * Protocolo ECP (External Control Protocol): HTTP plano en el puerto 8060,
 * sin autenticación ni pairing. Es el más simple de todos.
 * Requisito en la TV: Configuración > Sistema > Control por aplicaciones móviles > Habilitado.
 */
const MAP = {
  POWER: 'Power',
  POWER_ON: 'PowerOn',
  POWER_OFF: 'PowerOff',
  VOL_UP: 'VolumeUp',
  VOL_DOWN: 'VolumeDown',
  MUTE: 'VolumeMute',
  CH_UP: 'ChannelUp',
  CH_DOWN: 'ChannelDown',
  CH_LAST: 'InstantReplay',
  UP: 'Up',
  DOWN: 'Down',
  LEFT: 'Left',
  RIGHT: 'Right',
  OK: 'Select',
  BACK: 'Back',
  HOME: 'Home',
  MENU: 'Info',
  EXIT: 'Home',
  INFO: 'Info',
  GUIDE: 'Info',
  PLAY: 'Play',
  PAUSE: 'Play',
  PLAY_PAUSE: 'Play',
  STOP: 'Play',
  REWIND: 'Rev',
  FORWARD: 'Fwd',
  INPUT: 'InputTuner',
  HDMI1: 'InputHDMI1',
  HDMI2: 'InputHDMI2',
  HDMI3: 'InputHDMI3',
  HDMI4: 'InputHDMI4',
  ENTER: 'Enter',
  BACKSPACE: 'Backspace',
};

const APP_NAMES = {
  netflix: ['netflix'],
  youtube: ['youtube'],
  prime: ['prime video', 'amazon prime'],
  disney: ['disney'],
  spotify: ['spotify'],
  hbo: ['hbo', 'max'],
};

class RokuAdapter extends BaseAdapter {
  static type = 'roku';
  static brand = 'Roku';
  static defaultPort = 8060;

  get base() {
    return `http://${this.host}:${this.config.port || RokuAdapter.defaultPort}`;
  }

  async request(method, path) {
    const res = await fetch(this.base + path, {
      method,
      signal: AbortSignal.timeout(4000),
    }).catch((err) => {
      throw new RemoteError(netMessage(err, this.brand, this.host), 502);
    });
    if (!res.ok) throw new RemoteError(`La TV respondió ${res.status} a ${path}`, 502);
    return res;
  }

  async connect() {
    await this.status();
  }

  async status() {
    const res = await this.request('GET', '/query/device-info');
    const xml = await res.text();
    const pick = (tag) => (xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`)) || [])[1] || null;
    return {
      connected: true,
      name: pick('friendly-device-name') || pick('user-device-name') || pick('model-name'),
      model: pick('model-name'),
      poweredOn: pick('power-mode') === 'PowerOn',
    };
  }

  async sendKey(key) {
    // Roku no tiene teclas numéricas: los números se mandan como literales.
    if (key.startsWith('DIGIT_')) return this.sendText(key.slice(6));

    const native = MAP[key];
    if (!native) throw new UnsupportedKey(key, this.brand);
    await this.request('POST', `/keypress/${native}`);
    return { sent: native };
  }

  async sendText(text) {
    for (const char of String(text)) {
      await this.request('POST', `/keypress/Lit_${encodeURIComponent(char)}`);
    }
    return { sent: text.length };
  }

  async listApps() {
    const res = await this.request('GET', '/query/apps');
    const xml = await res.text();
    const apps = [];
    const re = /<app id="([^"]+)"[^>]*>([^<]*)<\/app>/g;
    let m;
    while ((m = re.exec(xml))) apps.push({ id: m[1], name: m[2] });
    return apps;
  }

  async launchApp(name) {
    const wanted = APP_NAMES[name] || [name];
    const apps = await this.listApps();
    const found = apps.find((a) =>
      wanted.some((w) => a.name.toLowerCase().includes(w.toLowerCase()))
    );
    if (!found) throw new RemoteError(`La app "${name}" no está instalada en esta Roku`, 404);
    await this.request('POST', `/launch/${found.id}`);
    return { launched: found.name };
  }
}

module.exports = RokuAdapter;
