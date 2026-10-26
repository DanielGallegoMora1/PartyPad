# Recursos de los packs

Generado con `npm run medir` el 26 de octubre de 2026 a las 18:46. Las imágenes de los packs van en WebP y los sonidos en Opus (dentro de WebM); los originales en PNG y WAV están en `packs/<id>/originales/` para poder comparar.

| Pack | Original → en el pack | Original | En el pack | Ahorro |
|---|---|---|---|---|
| apunta | acierto.wav → acierto.webm | 48044 B | **2977 B** | 16,1 veces menos |
| apunta | acierto-24kbps.webm (alternativa a acierto.webm) | | 1629 B | |
| apunta | diana-oro.png → diana-oro.webp | 46833 B | **11520 B** | 4,1 veces menos |
| apunta | diana.png → diana.webp | 46750 B | **11728 B** | 4,0 veces menos |
| apunta | disparo.wav → disparo.webm | 21164 B | **1673 B** | 12,7 veces menos |
| apunta | disparo-24kbps.webm (alternativa a disparo.webm) | | 1013 B | |

| Pack | Archivos sueltos | ZIP sin comprimir | ZIP con deflate en todo | ZIP del servidor (deflate solo en el código) |
|---|---|---|---|---|
| apunta | 39614 B | 40300 B | 32193 B | **32581 B** |

WebP y Opus ya están comprimidos, así que volver a pasarles deflate dentro del ZIP apenas ahorra: el servidor solo comprime el código y el `pack.json`, y guarda el resto tal cual.
