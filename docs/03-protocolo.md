# 03 · Protocolo y compresión

[← Volver al README](../README.md)

La compresión es el aspecto obligatorio que más fácil se queda flojo en un videojuego, así que la hacemos **explícita y medida**. Hay dos frentes: los mensajes de red y los recursos de los packs.

## Dos tipos de mensajes

| Tipo | Ejemplos | Frecuencia | Formato |
|---|---|---|---|
| Entradas de los mandos | Inclinación, agitado, botones | Hasta 30 por segundo y jugador | **Binario propio** |
| Eventos de sala | `create_room`, `joined`, `round_start`, `round_end` | Pocos por minuto | **JSON**, porque se lee y depura mejor y el tamaño no importa |

Esta separación es una decisión de diseño que se justifica en la memoria: comprimimos donde el volumen lo justifica y dejamos legible el resto.

## Mensajes binarios

El primer byte siempre es el tipo de mensaje. El código de estos mensajes va en `shared/` para que lo usen igual el servidor, la pantalla y el mando.

| Código | Mensaje | Sentido | Tamaño | Contenido |
|---|---|---|---|---|
| `0x01` | JOIN | Mando → servidor | Variable | Tipo, color (1 byte), nombre en UTF-8 |
| `0x02` | BUTTON | Mando → servidor | 3 bytes | Tipo, jugador, botón y estado (bits) |
| `0x03` | TILT | Mando → servidor | 4 bytes | Tipo, jugador, X e Y cuantizados a `int8` |
| `0x04` | SHAKE | Mando → servidor | 3 bytes | Tipo, jugador, intensidad `uint8` |
| `0x10` | VIBRATE | Servidor → mando | 4 bytes | Tipo, jugador, duración en ms (`uint16`) |

### Ejemplo: mensaje TILT

![Formato del mensaje TILT](diagramas/png/09_protocolo_tilt.png)

El giroscopio da valores decimales entre -1 y 1. Los **cuantizamos** a un entero de 8 bits multiplicando por 127 y redondeando:

| Campo | Valor original | Cuantizado | Byte |
|---|---|---|---|
| Tipo | TILT | 3 | `03` |
| Jugador | 3 | 3 | `03` |
| X | 0,2345 | 30 | `1E` |
| Y | −0,8812 | −112 | `90` |

Mensaje completo: `03 03 1E 90`.

La cuantización pierde precisión (pasamos de unos 7 decimales a 255 niveles), pero un paso de 1/127 de inclinación es imperceptible en el juego.

```js
// shared/protocol.js (borrador)
export const MSG = { JOIN: 0x01, BUTTON: 0x02, TILT: 0x03, SHAKE: 0x04, VIBRATE: 0x10 };

const quantize = (v) => Math.max(-127, Math.min(127, Math.round(v * 127)));

export function encodeTilt(player, x, y) {
  const view = new DataView(new ArrayBuffer(4));
  view.setUint8(0, MSG.TILT);
  view.setUint8(1, player);
  view.setInt8(2, quantize(x));
  view.setInt8(3, quantize(y));
  return view.buffer;
}

export function decode(buffer) {
  const view = new DataView(buffer);
  switch (view.getUint8(0)) {
    case MSG.TILT:
      return { type: 'tilt', player: view.getUint8(1), x: view.getInt8(2) / 127, y: view.getInt8(3) / 127 };
    // … resto de mensajes
  }
}
```

## Compresión delta

El mando lee el sensor unas 30 veces por segundo, pero si el jugador tiene el móvil quieto no tiene sentido enviar el mismo valor una y otra vez. Solo enviamos cuando el valor cuantizado cambia más que un umbral:

```js
let last = { x: 0, y: 0 };
const UMBRAL = 2; // en unidades cuantizadas

function onSensor(x, y) {
  const qx = quantize(x), qy = quantize(y);
  if (Math.abs(qx - last.x) >= UMBRAL || Math.abs(qy - last.y) >= UMBRAL) {
    socket.send(encodeTilt(myId, x, y));
    last = { x: qx, y: qy };
  }
}
```

El umbral es un compromiso: más alto ahorra más datos pero el movimiento se nota más "a saltos". Conviene probar varios valores y elegir uno.

## Comparativa de tamaños

| Formato | Mensaje TILT | Subida con 8 jugadores a 30 Hz |
|---|---|---|
| JSON `{"type":"tilt","player":3,"x":0.2345,"y":-0.8812}` | ≈ 50 B | ≈ 12 KB/s |
| MessagePack, mismos campos | ≈ 30 B | ≈ 7 KB/s |
| Binario propio | **4 B** | **< 1 KB/s** |
| Binario propio + compresión delta | 4 B | Depende del movimiento: hay que medirlo |

Son tamaños aproximados del contenido del mensaje, sin las cabeceras de WebSocket.

## Compresión de los recursos de los packs

| Recurso | Comparar | Qué medir |
|---|---|---|
| Sprites e imágenes | PNG frente a WebP (con y sin pérdida) | Tamaño y calidad visual (PSNR o SSIM) |
| Música y efectos | MP3 frente a Opus a distintos bitrates | Tamaño y calidad percibida |
| Pack completo | ZIP sin comprimir frente a ZIP con deflate | Tamaño total y tiempo de descarga |

## Qué medir para la memoria

Esta tabla es el corazón del apartado de compresión. Rellenadla con datos reales de las pruebas:

1. **Bytes por segundo de subida** con 2, 4 y 8 jugadores, para JSON, MessagePack, binario y binario + delta. Contad los bytes en el servidor durante una ronda de 45 segundos.
2. **Mensajes por segundo** con y sin compresión delta, con el móvil quieto y moviéndolo.
3. **Latencia** media entre el envío en el móvil y la recepción en el servidor, para comprobar que se cumple RNF1.
4. **Tamaño de cada pack** con los distintos formatos de imagen y audio.

Una gráfica de barras de las mediciones del punto 1 queda muy bien tanto en la memoria como en la presentación.
