'use strict';

const { execFile } = require('child_process');
const { BaseAdapter, RemoteError, UnsupportedKey } = require('./base');

/**
 * Android TV / Google TV / Fire TV / Xiaomi TV Box (vía ADB por red).
 *
 * Requiere:
 *   1. tener `adb` instalado en la máquina que corre el puente,
 *   2. activar en la TV: Ajustes > Opciones de desarrollador > Depuración por USB / ADB por red.
 *
 * La primera conexión muestra en la TV "¿Permitir depuración?" — hay que aceptarlo.
 * En Android 11+ con "Depuración inalámbrica" hace falta emparejar una vez con
 * el código de 6 dígitos (POST /api/pair).
 */
const KEYCODES = {
  POWER: 'KEYCODE_POWER',
  POWER_ON: 'KEYCODE_WAKEUP',
  POWER_OFF: 'KEYCODE_SLEEP',
  VOL_UP: 'KEYCODE_VOLUME_UP',
  VOL_DOWN: 'KEYCODE_VOLUME_DOWN',
  MUTE: 'KEYCODE_VOLUME_MUTE',
  CH_UP: 'KEYCODE_CHANNEL_UP',
  CH_DOWN: 'KEYCODE_CHANNEL_DOWN',
  CH_LAST: 'KEYCODE_LAST_CHANNEL',
  UP: 'KEYCODE_DPAD_UP',
  DOWN: 'KEYCODE_DPAD_DOWN',
  LEFT: 'KEYCODE_DPAD_LEFT',
  RIGHT: 'KEYCODE_DPAD_RIGHT',
  OK: 'KEYCODE_DPAD_CENTER',
  BACK: 'KEYCODE_BACK',
  HOME: 'KEYCODE_HOME',
  MENU: 'KEYCODE_MENU',
  EXIT: 'KEYCODE_BACK',
  INFO: 'KEYCODE_INFO',
  GUIDE: 'KEYCODE_GUIDE',
  PLAY: 'KEYCODE_MEDIA_PLAY',
  PAUSE: 'KEYCODE_MEDIA_PAUSE',
  PLAY_PAUSE: 'KEYCODE_MEDIA_PLAY_PAUSE',
  STOP: 'KEYCODE_MEDIA_STOP',
  REWIND: 'KEYCODE_MEDIA_REWIND',
  FORWARD: 'KEYCODE_MEDIA_FAST_FORWARD',
  RECORD: 'KEYCODE_MEDIA_RECORD',
  INPUT: 'KEYCODE_TV_INPUT',
  HDMI1: 'KEYCODE_TV_INPUT_HDMI_1',
  HDMI2: 'KEYCODE_TV_INPUT_HDMI_2',
  HDMI3: 'KEYCODE_TV_INPUT_HDMI_3',
  HDMI4: 'KEYCODE_TV_INPUT_HDMI_4',
  DIGIT_0: 'KEYCODE_0',
  DIGIT_1: 'KEYCODE_1',
  DIGIT_2: 'KEYCODE_2',
  DIGIT_3: 'KEYCODE_3',
  DIGIT_4: 'KEYCODE_4',
  DIGIT_5: 'KEYCODE_5',
  DIGIT_6: 'KEYCODE_6',
  DIGIT_7: 'KEYCODE_7',
  DIGIT_8: 'KEYCODE_8',
  DIGIT_9: 'KEYCODE_9',
  ENTER: 'KEYCODE_ENTER',
  BACKSPACE: 'KEYCODE_DEL',
  RED: 'KEYCODE_PROG_RED',
  GREEN: 'KEYCODE_PROG_GREEN',
  YELLOW: 'KEYCODE_PROG_YELLOW',
  BLUE: 'KEYCODE_PROG_BLUE',
};

const PACKAGES = {
  netflix: 'com.netflix.ninja',
  youtube: 'com.google.android.youtube.tv',
  prime: 'com.amazon.amazonvideo.livingroom',
  disney: 'com.disney.disneyplus',
  spotify: 'com.spotify.tv.android',
  hbo: 'com.wbd.stream',
};

function adb(args, timeout = 12000) {
  return new Promise((resolve, reject) => {
    execFile('adb', args, { timeout }, (err, stdout, stderr) => {
      if (err) {
        if (err.code === 'ENOENT') {
          return reject(
            new RemoteError(
              'No encontré el comando `adb`. Instalá las platform-tools de Android en la máquina del puente.',
              500
            )
          );
        }
        return reject(new RemoteError(`adb falló: ${(stderr || err.message).trim()}`, 502));
      }
      resolve(String(stdout).trim());
    });
  });
}

class AndroidTvAdapter extends BaseAdapter {
  static type = 'androidtv';
  static brand = 'Android TV';
  static defaultPort = 5555;

  get target() {
    return `${this.host}:${this.config.port || AndroidTvAdapter.defaultPort}`;
  }

  async connect() {
    const out = await adb(['connect', this.target]);
    if (/failed|unable|refused|cannot/i.test(out)) {
      throw new RemoteError(
        `adb no pudo conectar a ${this.target}. Verificá que la depuración por red esté activa ` +
          'y aceptá el cartel de autorización en la pantalla de la TV. Detalle: ' + out,
        502
      );
    }
    return { connected: true, detail: out };
  }

  /** Emparejado de "Depuración inalámbrica" (Android 11+): puerto y código propios. */
  async pair(pairPort, code) {
    const out = await adb(['pair', `${this.host}:${pairPort}`, String(code)], 20000);
    if (!/success/i.test(out)) throw new RemoteError(`El emparejamiento falló: ${out}`, 502);
    return { paired: true, detail: out };
  }

  async disconnect() {
    await adb(['disconnect', this.target]).catch(() => {});
  }

  async shell(args) {
    return adb(['-s', this.target, 'shell', ...args]);
  }

  async status() {
    const out = await adb(['devices']).catch(() => '');
    const connected = out.split('\n').some((l) => l.startsWith(this.target) && /\bdevice\b/.test(l));
    if (!connected) return { connected: false };
    const model = await this.shell(['getprop', 'ro.product.model']).catch(() => null);
    return { connected: true, model: model || null };
  }

  async sendKey(key) {
    const code = KEYCODES[key];
    if (!code) throw new UnsupportedKey(key, this.brand);
    await this.shell(['input', 'keyevent', code]);
    return { sent: code };
  }

  async sendText(text) {
    // `input text` no acepta espacios: se escriben como %s.
    const safe = String(text).replace(/ /g, '%s');
    await this.shell(['input', 'text', safe]);
    return { sent: text.length };
  }

  async listApps() {
    return Object.entries(PACKAGES).map(([name, id]) => ({ id, name }));
  }

  async launchApp(name) {
    const pkg = PACKAGES[name] || name;
    await this.shell(['monkey', '-p', pkg, '-c', 'android.intent.category.LAUNCHER', '1']);
    return { launched: pkg };
  }
}

module.exports = AndroidTvAdapter;
