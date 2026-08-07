'use strict';

class RemoteError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

/** La tecla existe en el catálogo pero esta marca no la soporta. */
class UnsupportedKey extends RemoteError {
  constructor(key, brand) {
    super(`La tecla "${key}" no está soportada en ${brand}`, 501);
  }
}

/** Hace falta autorizar el control desde la pantalla de la TV. */
class PairingRequired extends RemoteError {
  constructor(message) {
    super(message, 428);
  }
}

/**
 * Traduce los códigos de error de red a algo que se entienda mirando el celular.
 * "ECONNREFUSED" no le dice nada a nadie; "la TV rechazó la conexión" sí.
 */
function netMessage(err, brand, host) {
  // Ojo: DOMException tiene un `code` numérico heredado (23 = timeout), así que
  // solo sirve si es texto; si no, el nombre del error es más confiable.
  const raw = err.code || (err.cause && err.cause.code);
  const code = typeof raw === 'string' ? raw : err.name;
  const donde = `${brand} en ${host}`;
  switch (code) {
    case 'ECONNREFUSED':
      return `${donde} está en la red pero rechazó la conexión. Suele pasar cuando la TV está apagada del todo, o cuando el control por red está desactivado en su menú.`;
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
    case 'ENOTFOUND':
      return `No llego a ${host}. Revisá que sea la IP correcta y que el celular esté en la misma WiFi que la TV.`;
    case 'ETIMEDOUT':
    case 'TimeoutError':
    case 'AbortError':
      return `${donde} no contestó a tiempo. Puede estar en reposo profundo: probá encenderla con el control original una vez.`;
    case 'ECONNRESET':
      return `${donde} cortó la conexión. Reintentá en unos segundos.`;
    default:
      return `No pude comunicarme con ${donde}: ${err.message}`;
  }
}

/**
 * Contrato que cumplen todos los adapters.
 * Los métodos no implementados por una marca tiran UnsupportedKey / RemoteError.
 */
class BaseAdapter {
  constructor(config) {
    this.config = config;
    this.host = config.host;
  }

  get brand() {
    return this.constructor.brand || this.constructor.type;
  }

  async connect() {}
  async disconnect() {}

  async status() {
    return { connected: true };
  }

  async sendKey() {
    throw new RemoteError('Adapter sin sendKey', 500);
  }

  async sendText() {
    throw new RemoteError(`Escribir texto no está soportado en ${this.brand}`, 501);
  }

  async listApps() {
    return [];
  }

  async launchApp() {
    throw new RemoteError(`Abrir apps no está soportado en ${this.brand}`, 501);
  }
}

module.exports = { BaseAdapter, RemoteError, UnsupportedKey, PairingRequired, netMessage };
