'use strict';

const { BaseAdapter, RemoteError, UnsupportedKey, netMessage } = require('./base');

/**
 * Sony Bravia (Android TV con la API Scalar/IRCC).
 *
 * Se autentica con una "Pre-Shared Key" que vos definís en la TV:
 * Configuración > Red > Configuración de red doméstica > IP Control >
 * Autenticación: "Normal y Pre-Shared Key" > Clave: (poné una, ej. 1234).
 * Esa clave va en el campo psk.
 */
const IRCC = {
  POWER: 'AAAAAQAAAAEAAAAVAw==',
  POWER_OFF: 'AAAAAQAAAAEAAAAVAw==',
  VOL_UP: 'AAAAAQAAAAEAAAASAw==',
  VOL_DOWN: 'AAAAAQAAAAEAAAATAw==',
  MUTE: 'AAAAAQAAAAEAAAAUAw==',
  CH_UP: 'AAAAAQAAAAEAAAAQAw==',
  CH_DOWN: 'AAAAAQAAAAEAAAARAw==',
  CH_LAST: 'AAAAAQAAAAEAAAA7Aw==',
  UP: 'AAAAAQAAAAEAAAB0Aw==',
  DOWN: 'AAAAAQAAAAEAAAB1Aw==',
  LEFT: 'AAAAAQAAAAEAAAA0Aw==',
  RIGHT: 'AAAAAQAAAAEAAAAzAw==',
  OK: 'AAAAAQAAAAEAAABlAw==',
  ENTER: 'AAAAAQAAAAEAAABlAw==',
  BACK: 'AAAAAgAAAJcAAAAjAw==',
  HOME: 'AAAAAQAAAAEAAABgAw==',
  MENU: 'AAAAAgAAAJcAAAA2Aw==',
  EXIT: 'AAAAAQAAAAEAAABjAw==',
  INFO: 'AAAAAQAAAAEAAAA6Aw==',
  GUIDE: 'AAAAAgAAAKQAAABbAw==',
  PLAY: 'AAAAAgAAAJcAAAAaAw==',
  PAUSE: 'AAAAAgAAAJcAAAAZAw==',
  PLAY_PAUSE: 'AAAAAgAAAJcAAAAaAw==',
  STOP: 'AAAAAgAAAJcAAAAYAw==',
  REWIND: 'AAAAAgAAAJcAAAAbAw==',
  FORWARD: 'AAAAAgAAAJcAAAAcAw==',
  RECORD: 'AAAAAgAAAJcAAAAgAw==',
  INPUT: 'AAAAAQAAAAEAAAAlAw==',
  HDMI1: 'AAAAAgAAABoAAABaAw==',
  HDMI2: 'AAAAAgAAABoAAABbAw==',
  HDMI3: 'AAAAAgAAABoAAABcAw==',
  HDMI4: 'AAAAAgAAABoAAABdAw==',
  DIGIT_0: 'AAAAAQAAAAEAAAAJAw==',
  DIGIT_1: 'AAAAAQAAAAEAAAAAAw==',
  DIGIT_2: 'AAAAAQAAAAEAAAABAw==',
  DIGIT_3: 'AAAAAQAAAAEAAAACAw==',
  DIGIT_4: 'AAAAAQAAAAEAAAADAw==',
  DIGIT_5: 'AAAAAQAAAAEAAAAEAw==',
  DIGIT_6: 'AAAAAQAAAAEAAAAFAw==',
  DIGIT_7: 'AAAAAQAAAAEAAAAGAw==',
  DIGIT_8: 'AAAAAQAAAAEAAAAHAw==',
  DIGIT_9: 'AAAAAQAAAAEAAAAIAw==',
  RED: 'AAAAAgAAAJcAAAAlAw==',
  GREEN: 'AAAAAgAAAJcAAAAmAw==',
  YELLOW: 'AAAAAgAAAJcAAAAnAw==',
  BLUE: 'AAAAAgAAAJcAAAAkAw==',
};

const APP_URIS = {
  netflix: 'com.sony.dtv.com.netflix.ninja.com.netflix.ninja.MainActivity',
  youtube: 'com.sony.dtv.com.google.android.youtube.tv.com.google.android.apps.youtube.tv.activity.ShellActivity',
  prime: 'com.sony.dtv.com.amazon.amazonvideo.livingroom.com.amazon.ignition.IgnitionActivity',
  disney: 'com.sony.dtv.com.disney.disneyplus.com.disney.id.android.dialog.InitActivity',
  spotify: 'com.sony.dtv.com.spotify.tv.android.com.spotify.tv.android.SpotifyTVActivity',
};

class SonyAdapter extends BaseAdapter {
  static type = 'sony';
  static brand = 'Sony Bravia';
  static defaultPort = 80;

  get base() {
    const port = this.config.port || SonyAdapter.defaultPort;
    return port === 443 ? `https://${this.host}` : `http://${this.host}:${port}`;
  }

  get psk() {
    if (!this.config.psk) {
      throw new RemoteError(
        'Falta la Pre-Shared Key. Configurala en la TV (Red > IP Control) y cargala acá.',
        400
      );
    }
    return this.config.psk;
  }

  async rest(service, method, params = [], version = '1.0') {
    const res = await fetch(`${this.base}/sony/${service}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-PSK': this.psk },
      body: JSON.stringify({ method, params, id: 1, version }),
      signal: AbortSignal.timeout(5000),
    }).catch((err) => {
      throw new RemoteError(netMessage(err, this.brand, this.host), 502);
    });
    const json = await res.json().catch(() => ({}));
    if (json.error) {
      const [code, text] = json.error;
      throw new RemoteError(`La TV devolvió error ${code}: ${text}`, code === 403 ? 401 : 502);
    }
    return json.result || [];
  }

  async connect() {
    await this.status();
  }

  async status() {
    const [info] = await this.rest('system', 'getSystemInformation');
    const [power] = await this.rest('system', 'getPowerStatus').catch(() => [{}]);
    return {
      connected: true,
      name: (info && info.name) || null,
      model: (info && info.model) || null,
      poweredOn: power && power.status === 'active',
    };
  }

  async sendKey(key) {
    if (key === 'POWER_ON') {
      await this.rest('system', 'setPowerStatus', [{ status: true }]);
      return { sent: 'POWER_ON' };
    }
    const code = IRCC[key];
    if (!code) throw new UnsupportedKey(key, this.brand);

    const soap =
      '<?xml version="1.0"?>' +
      '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" ' +
      's:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' +
      '<s:Body><u:X_SendIRCC xmlns:u="urn:schemas-sony-com:service:IRCC:1">' +
      `<IRCCCode>${code}</IRCCCode>` +
      '</u:X_SendIRCC></s:Body></s:Envelope>';

    const res = await fetch(`${this.base}/sony/IRCC`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=UTF-8',
        SOAPACTION: '"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC"',
        'X-Auth-PSK': this.psk,
      },
      body: soap,
      signal: AbortSignal.timeout(5000),
    }).catch((err) => {
      throw new RemoteError(netMessage(err, this.brand, this.host), 502);
    });
    if (!res.ok) throw new RemoteError(`La TV respondió ${res.status}`, res.status === 403 ? 401 : 502);
    return { sent: key };
  }

  async sendText(text) {
    await this.rest('appControl', 'setTextForm', [String(text)]);
    return { sent: text.length };
  }

  async listApps() {
    const [apps] = await this.rest('appControl', 'getApplicationList');
    return (apps || []).map((a) => ({ id: a.uri, name: a.title }));
  }

  async launchApp(name) {
    let uri = APP_URIS[name];
    if (!uri) {
      const apps = await this.listApps();
      const found = apps.find((a) => a.name.toLowerCase().includes(name.toLowerCase()));
      if (!found) throw new RemoteError(`La app "${name}" no está en esta TV`, 404);
      uri = found.id;
    }
    await this.rest('appControl', 'setActiveApp', [{ uri }]);
    return { launched: name };
  }
}

module.exports = SonyAdapter;
