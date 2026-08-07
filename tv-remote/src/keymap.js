'use strict';

/**
 * Teclas canónicas.
 *
 * La web app siempre manda uno de estos nombres. Cada adapter lo traduce al
 * código nativo de su marca. Si una tele no soporta una tecla, el adapter
 * devuelve null y el servidor responde 501 (no soportado) en vez de romper.
 */
const KEYS = [
  // Encendido
  'POWER', 'POWER_ON', 'POWER_OFF',
  // Volumen
  'VOL_UP', 'VOL_DOWN', 'MUTE',
  // Canales
  'CH_UP', 'CH_DOWN', 'CH_LAST',
  // Navegación
  'UP', 'DOWN', 'LEFT', 'RIGHT', 'OK', 'BACK', 'HOME', 'MENU', 'EXIT', 'INFO', 'GUIDE',
  // Reproducción
  'PLAY', 'PAUSE', 'PLAY_PAUSE', 'STOP', 'REWIND', 'FORWARD', 'RECORD',
  // Entradas
  'INPUT', 'HDMI1', 'HDMI2', 'HDMI3', 'HDMI4',
  // Numérico
  'DIGIT_0', 'DIGIT_1', 'DIGIT_2', 'DIGIT_3', 'DIGIT_4',
  'DIGIT_5', 'DIGIT_6', 'DIGIT_7', 'DIGIT_8', 'DIGIT_9',
  'ENTER', 'BACKSPACE',
  // Colores (teletexto / menús)
  'RED', 'GREEN', 'YELLOW', 'BLUE',
];

const KEY_SET = new Set(KEYS);

function isValidKey(key) {
  return typeof key === 'string' && KEY_SET.has(key);
}

/** Apps que la UI ofrece como acceso directo. */
const APPS = ['netflix', 'youtube', 'prime', 'disney', 'spotify', 'hbo'];

module.exports = { KEYS, KEY_SET, isValidKey, APPS };
