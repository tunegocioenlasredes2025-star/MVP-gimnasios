'use strict';

const { BaseAdapter } = require('./base');
const { APPS } = require('../keymap');

/**
 * TV simulada. Sirve para probar toda la app desde el celular sin tener la tele
 * prendida (o sin tener una tele compatible todavía). Lleva un estado interno
 * de volumen / canal / mute para que la UI muestre algo real.
 */
class DemoAdapter extends BaseAdapter {
  static type = 'demo';
  static brand = 'TV de prueba';

  constructor(config) {
    super(config);
    this.state = { on: true, volume: 18, channel: 5, muted: false, app: null };
    this.log = [];
  }

  async status() {
    return { connected: true, name: 'TV de prueba', model: 'simulador', ...this.state };
  }

  async sendKey(key) {
    const s = this.state;
    if (key === 'POWER') s.on = !s.on;
    if (key === 'POWER_ON') s.on = true;
    if (key === 'POWER_OFF') s.on = false;
    if (key === 'VOL_UP') s.volume = Math.min(100, s.volume + 1);
    if (key === 'VOL_DOWN') s.volume = Math.max(0, s.volume - 1);
    if (key === 'MUTE') s.muted = !s.muted;
    if (key === 'CH_UP') s.channel += 1;
    if (key === 'CH_DOWN') s.channel = Math.max(1, s.channel - 1);
    if (key.startsWith('DIGIT_')) s.channel = Number(key.slice(6));

    this.log.unshift({ key, at: new Date().toISOString() });
    this.log.length = Math.min(this.log.length, 50);
    return { sent: key, state: { ...s } };
  }

  async sendText(text) {
    this.log.unshift({ key: `TEXTO: ${text}`, at: new Date().toISOString() });
    return { sent: String(text).length };
  }

  async listApps() {
    return APPS.map((name) => ({ id: name, name }));
  }

  async launchApp(name) {
    this.state.app = name;
    this.log.unshift({ key: `APP: ${name}`, at: new Date().toISOString() });
    return { launched: name };
  }
}

module.exports = DemoAdapter;
