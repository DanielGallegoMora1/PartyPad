# 05 · Memoria, entrega y presentación

[← Volver al README](../README.md)

## Memoria

**Máximo 12 páginas, en PDF.** Debe tener como mínimo los siete apartados que pide la asignatura. Este es el reparto de páginas que proponemos y los diagramas que van en cada apartado:

| Apartado | Páginas | Contenido | Diagramas |
|---|---|---|---|
| I. Descripción general | 1 | Qué es PartyPad, los minijuegos, capturas, reparto del trabajo | [Planificación](diagramas/png/08_planificacion.png) |
| II. Requisitos de la aplicación | 1,5 | Requisitos funcionales y no funcionales y su relación con los cinco aspectos obligatorios | [Casos de uso](diagramas/png/02_casos_de_uso.png) |
| III. Decisiones y justificación de diseño e implementación | 4 | Arquitectura, por qué cada tecnología, protocolo, sistema de packs y **estudio de compresión con tablas y gráfica** | [Arquitectura](diagramas/png/01_arquitectura.png), [unirse](diagramas/png/03_secuencia_unirse.png), [bucle de juego](diagramas/png/04_secuencia_juego.png), [estados](diagramas/png/05_estados_partida.png), [packs](diagramas/png/06_secuencia_packs.png), [clases](diagramas/png/07_clases_servidor.png), [mensaje TILT](diagramas/png/09_protocolo_tilt.png) |
| IV. Conclusiones | 0,5 | Qué ha salido bien, problemas encontrados y mejoras futuras | |
| V. Bibliografía | 0,5 | Documentación de Phaser, Socket.IO, MDN (APIs de sensores y vibración), MessagePack, WebP y Opus | |
| VI. Manual de instalación y ejecución | 1 | URL desplegada y pasos para ejecutarlo en local | |
| VII. Manual de usuario | 2 | Crear sala, unirse, jugar cada minijuego, con capturas | |

El apartado III es el que más pesa: es donde se ve la complejidad y donde lucen las mediciones de compresión. Si hay que recortar, mejor quitar diagramas secundarios (por ejemplo, la secuencia de unirse) que quitar las mediciones.

## Entrega

**Fecha límite: 4 de diciembre**, en la tarea de Campus Virtual. **La sube solo uno de los dos.**

Fichero: `Proyecto_multimedia_grupo_practicas_NN.zip` (con `NN` el número de nuestro grupo, por ejemplo `01`).

Contenido del ZIP:

```text
Proyecto_multimedia_grupo_practicas_NN.zip
├── alumnos.txt          Nombres, número de identificación y número de grupo
├── repositorio.txt      Enlace a este repositorio de GitHub
└── memoria.pdf          La memoria
```

Si alguno no puede asistir a la presentación por una causa justificada, también hay que entregar un **vídeo** haciendo la presentación.

> Antes de entregar: comprobar que el repositorio es **público** o que el profesor tiene acceso.

## Presentación

**Entre el 9 y el 16 de diciembre**, en las sesiones de teoría o prácticas. **Máximo 15 minutos.**

| Minuto | Parte | Quién |
|---|---|---|
| 0–1 | Qué es PartyPad y por qué lo elegimos | Daniel |
| 1–3 | Arquitectura y tecnologías | Vicente |
| 3–9 | **Demo en directo:** la clase escanea el QR y juega dos minijuegos | Ambos |
| 9–10 | Publicamos el pack nuevo y la pantalla lo descarga en directo | Daniel |
| 10–13 | Protocolo binario y resultados de compresión con la gráfica | Vicente |
| 13–15 | Conclusiones y preguntas | Ambos |

**Antes de la presentación:**

- Probar la demo en el aula con la red de la universidad.
- Tener a mano un vídeo de la demo por si falla la red.
- Llevar dos móviles propios cargados para no depender solo de la clase.

Recordad que también puntúa **hacer preguntas** en las presentaciones de los demás grupos.
