# Mediciones con bots

Generado con `npm run medir` el 26 de octubre de 2026 a las 18:46. Cada configuración es una partida con los tres minijuegos, jugada por bots que se conectan por WebSocket como los móviles (ver `scripts/simular.js`). Los bytes y los mensajes son reales; la latencia no, porque los bots están en el mismo ordenador. Las mediciones con móviles de verdad se ven en `/medidas` al jugar y se descargan en CSV.

## Tamaño de cada mensaje

| Mensaje | JSON | MessagePack | MessagePack (float32) | Binario propio | En el cable desde el móvil (binario frente a JSON) |
|---|---|---|---|---|---|
| TILT (inclinación) | 49 B | 41 B | 33 B | **4 B** | 10 B frente a 55 B |
| SHAKE (agitar) | 44 B | 39 B | 35 B | **3 B** | 9 B frente a 50 B |
| BUTTON (botón) | 54 B | 38 B | 38 B | **3 B** | 9 B frente a 60 B |
| VIBRATE (vibrar) | 38 B | 28 B | 28 B | **4 B** | 10 B frente a 44 B |

MessagePack guarda los decimales como float64 (9 bytes); con `forceFloat32` baja un poco, pero sigue llevando los nombres de los campos. El binario propio cuantiza la inclinación a `int8` y la intensidad a `uint8`. En el cable, cada mensaje del móvil lleva además la cabecera de WebSocket: 2 bytes y 4 de máscara.

## Subida: mandos → servidor

Bytes por segundo de todos los mandos juntos durante la ronda, con las cabeceras de WebSocket. JSON y MessagePack son lo que ocuparían esos mismos mensajes. «Binario sin delta» es lo que se enviaría mandando todas las lecturas del sensor (lo cuenta cada mando); «Lecturas que no se envían» es lo que ahorra la compresión delta.

| Minijuego | Jugadores | Mensajes/s | JSON | MessagePack | Binario sin delta | Binario + delta | Binario + delta frente a JSON | Lecturas que no se envían |
|---|---|---|---|---|---|---|---|---|
| Carrera de agitar | 2 | 20,1 | 1,03 KB/s | 884 B/s | 256 B/s | **181 B/s** | 5,7 veces menos | 29,3 % |
| Carrera de agitar | 4 | 39,8 | 2,03 KB/s | 1,74 KB/s | 532 B/s | **359 B/s** | 5,7 veces menos | 32,6 % |
| Carrera de agitar | 8 | 38,2 | 1,98 KB/s | 1,71 KB/s | 462 B/s | **344 B/s** | 5,7 veces menos | 25,6 % |
| Carrera de agitar | 8 (quietos) | 0 | 0 B/s | 0 B/s | 1,19 KB/s | **0 B/s** | – | 100,0 % |
| Laberinto | 2 | 49,1 | 2,57 KB/s | 2,12 KB/s | 497 B/s | **491 B/s** | 5,2 veces menos | 1,2 % |
| Laberinto | 4 | 86 | 4,48 KB/s | 3,68 KB/s | 870 B/s | **860 B/s** | 5,2 veces menos | 1,1 % |
| Laberinto | 8 | 78,6 | 3,98 KB/s | 3,17 KB/s | 810 B/s | **786 B/s** | 5,1 veces menos | 3,0 % |
| Laberinto | 8 (quietos) | 0 | 0 B/s | 0 B/s | 1,97 KB/s | **0 B/s** | – | 100,0 % |
| Reflejos | 2 | 0,7 | 44 B/s | 32 B/s | – | **7 B/s** | 6,7 veces menos | – |
| Reflejos | 4 | 1,3 | 77 B/s | 56 B/s | – | **11 B/s** | 6,7 veces menos | – |
| Reflejos | 8 | 2,7 | 162 B/s | 118 B/s | – | **24 B/s** | 6,7 veces menos | – |
| Reflejos | 8 (quietos) | 2,6 | 158 B/s | 115 B/s | – | **24 B/s** | 6,7 veces menos | – |

## Bajada: servidor → pantalla

Los `state_update` que recibe la pantalla durante la ronda, sin cabeceras. «Deflate con contexto» comprime toda la ronda en un mismo flujo, como la extensión permessage-deflate de WebSocket.

| Minijuego | Jugadores | Mensajes/s | JSON | MessagePack | Deflate por mensaje | Deflate con contexto |
|---|---|---|---|---|---|---|
| Carrera de agitar | 2 | 8,7 | 1,29 KB/s | 1,08 KB/s | 891 B/s | 212 B/s |
| Carrera de agitar | 4 | 8,3 | 2,09 KB/s | 1,79 KB/s | 974 B/s | 302 B/s |
| Carrera de agitar | 8 | 5,7 | 2,61 KB/s | 2,28 KB/s | 847 B/s | 330 B/s |
| Carrera de agitar | 8 (quietos) | 8,3 | 3,42 KB/s | 2,46 KB/s | 890 B/s | 137 B/s |
| Laberinto | 2 | 17,4 | 2,10 KB/s | 1,81 KB/s | 1,58 KB/s | 456 B/s |
| Laberinto | 4 | 16,0 | 3,12 KB/s | 2,75 KB/s | 1,78 KB/s | 609 B/s |
| Laberinto | 8 | 9,8 | 3,36 KB/s | 2,99 KB/s | 1,41 KB/s | 593 B/s |
| Laberinto | 8 (quietos) | 16,6 | 5,54 KB/s | 5,08 KB/s | 2,00 KB/s | 258 B/s |
| Reflejos | 2 | 1,4 | 305 B/s | 194 B/s | 179 B/s | 33 B/s |
| Reflejos | 4 | 1,5 | 492 B/s | 299 B/s | 214 B/s | 40 B/s |
| Reflejos | 8 | 1,7 | 984 B/s | 580 B/s | 299 B/s | 59 B/s |
| Reflejos | 8 (quietos) | 1,7 | 977 B/s | 573 B/s | 282 B/s | 58 B/s |
