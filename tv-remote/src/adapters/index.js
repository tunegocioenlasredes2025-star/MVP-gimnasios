'use strict';

const RokuAdapter = require('./roku');
const SamsungAdapter = require('./samsung');
const LgAdapter = require('./lg');
const SonyAdapter = require('./sony');
const AndroidTvAdapter = require('./androidtv');
const DemoAdapter = require('./demo');
const { RemoteError } = require('./base');

const ADAPTERS = {
  [RokuAdapter.type]: RokuAdapter,
  [SamsungAdapter.type]: SamsungAdapter,
  [LgAdapter.type]: LgAdapter,
  [SonyAdapter.type]: SonyAdapter,
  [AndroidTvAdapter.type]: AndroidTvAdapter,
  [DemoAdapter.type]: DemoAdapter,
};

/** Lo que la UI muestra en el selector de marca. */
const CATALOG = Object.values(ADAPTERS).map((A) => ({
  type: A.type,
  brand: A.brand,
  defaultPort: A.defaultPort || null,
  needsPsk: A.type === 'sony',
  needsAdb: A.type === 'androidtv',
}));

function createAdapter(config) {
  const Adapter = ADAPTERS[config.type];
  if (!Adapter) throw new RemoteError(`Marca desconocida: "${config.type}"`, 400);
  if (Adapter.type !== 'demo' && !config.host) {
    throw new RemoteError('Falta la IP de la TV', 400);
  }
  return new Adapter(config);
}

module.exports = { ADAPTERS, CATALOG, createAdapter };
