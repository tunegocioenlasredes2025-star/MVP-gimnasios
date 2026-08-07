'use strict';

const dgram = require('dgram');

/**
 * Wake-on-LAN.
 *
 * Casi ninguna TV se puede prender por WiFi con un comando normal: cuando está
 * apagada, el WebSocket/HTTP también está apagado. El "paquete mágico" viaja por
 * broadcast UDP y lo escucha la placa de red, así que sí funciona con la TV en
 * standby (hay que tener activado "Encendido por red / móvil" en la TV).
 */
function sendMagicPacket(mac, { broadcast = '255.255.255.255', port = 9 } = {}) {
  const clean = String(mac).replace(/[^0-9a-f]/gi, '');
  if (clean.length !== 12) throw new Error(`MAC inválida: "${mac}"`);
  const bytes = Buffer.from(clean, 'hex');

  // 6 bytes 0xFF + la MAC repetida 16 veces.
  const packet = Buffer.concat([Buffer.alloc(6, 0xff), ...Array(16).fill(bytes)]);

  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    socket.once('error', (err) => {
      socket.close();
      reject(err);
    });
    socket.bind(() => {
      socket.setBroadcast(true);
      socket.send(packet, 0, packet.length, port, broadcast, (err) => {
        socket.close();
        if (err) reject(err);
        else resolve({ sent: true, mac: clean, broadcast, port });
      });
    });
  });
}

module.exports = { sendMagicPacket };
