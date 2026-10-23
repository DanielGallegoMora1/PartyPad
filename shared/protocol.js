// Protocolo de mensajes compartido por el servidor, la pantalla y el mando.
// Ver docs/03-protocolo.md. Funciona igual en el navegador y en Node.

// Solo las entradas frecuentes van en binario. Unirse y el resto de eventos de sala van en JSON.
export const MSG = { BUTTON: 0x02, TILT: 0x03, SHAKE: 0x04, VIBRATE: 0x10 };

const quantize = (v) => Math.max(-127, Math.min(127, Math.round(v * 127)));
const toUint8 = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));

function message(size, type, player) {
  const view = new DataView(new ArrayBuffer(size));
  view.setUint8(0, type);
  view.setUint8(1, player);
  return view;
}

// Byte 2: bits 1-7 número de botón, bit 0 pulsado (1) o soltado (0).
export function encodeButton(player, button, pressed) {
  const view = message(3, MSG.BUTTON, player);
  view.setUint8(2, ((button & 0x7f) << 1) | (pressed ? 1 : 0));
  return view.buffer;
}

// x e y entre -1 y 1.
export function encodeTilt(player, x, y) {
  const view = message(4, MSG.TILT, player);
  view.setInt8(2, quantize(x));
  view.setInt8(3, quantize(y));
  return view.buffer;
}

// intensity entre 0 y 1.
export function encodeShake(player, intensity) {
  const view = message(3, MSG.SHAKE, player);
  view.setUint8(2, toUint8(intensity));
  return view.buffer;
}

export function encodeVibrate(player, ms) {
  const view = message(4, MSG.VIBRATE, player);
  view.setUint16(2, Math.max(0, Math.min(0xffff, Math.round(ms))));
  return view.buffer;
}

// Acepta ArrayBuffer, Uint8Array o Buffer de Node. Devuelve null si el mensaje no es válido.
export function decode(data) {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 2) return null;
  const player = view.getUint8(1);

  switch (view.getUint8(0)) {
    case MSG.BUTTON: {
      if (view.byteLength < 3) return null;
      const b = view.getUint8(2);
      return { type: 'button', player, button: b >> 1, pressed: (b & 1) === 1 };
    }
    case MSG.TILT:
      if (view.byteLength < 4) return null;
      return { type: 'tilt', player, x: view.getInt8(2) / 127, y: view.getInt8(3) / 127 };
    case MSG.SHAKE:
      if (view.byteLength < 3) return null;
      return { type: 'shake', player, intensity: view.getUint8(2) / 255 };
    case MSG.VIBRATE:
      if (view.byteLength < 4) return null;
      return { type: 'vibrate', player, ms: view.getUint16(2) };
    default:
      return null;
  }
}
