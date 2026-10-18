# 02 · Arquitectura y diseño

[← Volver al README](../README.md)

## Visión general

PartyPad tiene tres piezas: la **pantalla principal**, el **servidor** y los **mandos**. El servidor es el único punto de contacto: la pantalla y los móviles nunca hablan directamente entre sí. Así funciona aunque la wifi de la universidad aísle los dispositivos, y además el servidor en la nube nos da HTTPS, que es **obligatorio** para que el navegador del móvil deje leer los sensores.

```mermaid
flowchart TB
    subgraph PANTALLA["Pantalla principal · navegador del PC"]
        direction LR
        P1["Lobby y código QR"]
        P2["Motor de juego Phaser 3"]
        P3["Gestor de packs"]
        P4["Audio y efectos"]
        P1 ~~~ P2 ~~~ P3 ~~~ P4
    end

    subgraph SERVIDOR["Servidor · Node.js en la nube con HTTPS"]
        direction LR
        S1["Gestor de salas"]
        S2["Lógica de partida y puntuaciones"]
        S3["Codificador del protocolo binario"]
        S4["Repositorio de packs y manifest.json"]
        S1 ~~~ S2 ~~~ S3 ~~~ S4
    end

    subgraph MANDOS["Mandos · navegador del móvil, PWA"]
        direction LR
        M1["Interfaz táctil"]
        M2["Sensores: acelerómetro y giroscopio"]
        M3["Vibración"]
        M4["Service Worker y caché"]
        M1 ~~~ M2 ~~~ M3 ~~~ M4
    end

    PANTALLA <-- "WebSocket: eventos de sala y estado del juego" --> SERVIDOR
    PANTALLA -- "HTTPS: descarga de packs ZIP" --> SERVIDOR
    SERVIDOR <-- "WebSocket binario: entradas y vibración" --> MANDOS
    SERVIDOR -- "HTTPS: página del mando, al escanear el QR" --> MANDOS
```

## Componentes

### Pantalla principal (`host/`)

Página web que se abre en el PC conectado al proyector.

- **Lobby y QR:** muestra el código de la sala, el QR (librería `qrcode`) y los jugadores que se van uniendo.
- **Motor de juego:** cada minijuego es una escena de Phaser 3. Dibuja a los jugadores, interpola sus movimientos para que no den tirones y muestra resultados y podio.
- **Gestor de packs:** consulta el manifest del servidor, descarga los packs nuevos y los guarda en IndexedDB.
- **Audio:** música de fondo y efectos de sonido de cada minijuego.

### Servidor (`server/`)

Node.js con Socket.IO o `ws`, desplegado en Render, Railway o Fly.io.

- **Gestor de salas:** crea salas, asigna códigos, gestiona altas, bajas y reconexiones.
- **Lógica de partida:** lleva la máquina de estados de cada sala, el orden de los minijuegos y las puntuaciones.
- **Protocolo:** codifica y decodifica los mensajes binarios de los mandos (ver [03 · Protocolo](03-protocolo.md)).
- **Repositorio de packs:** sirve `manifest.json` y los ZIP de los packs.

### Mando (`controller/`)

Página web móvil que se abre al escanear el QR. Se instala como PWA para que cargue rápido.

- **Interfaz táctil:** botones grandes, usable con una mano y en vertical.
- **Sensores:** `DeviceMotionEvent` (acelerómetro) y `DeviceOrientationEvent` (giroscopio).
- **Vibración:** `navigator.vibrate()` para avisos y penalizaciones.
- **Service Worker:** guarda en caché los recursos del mando con un número de versión.

## Tecnologías y por qué las elegimos

| Tecnología | Uso | Motivo |
|---|---|---|
| Node.js | Servidor | JavaScript en las tres partes: podemos compartir el código del protocolo en `shared/`. |
| Socket.IO o `ws` | Tiempo real | WebSockets con salas y reconexión. `ws` permite enviar binario puro sin sobrecoste. |
| Phaser 3 | Pantalla principal | Motor 2D maduro para navegador: escenas, físicas, sprites y audio. |
| `qrcode` | Lobby | Genera el QR en el navegador sin servicios externos. |
| APIs de sensores del navegador | Mando | El móvil no necesita ninguna app instalada. |
| MessagePack | Comparativa | Formato binario genérico para comparar con JSON y con nuestro protocolo. |
| Render / Railway / Fly.io | Despliegue | HTTPS gratis y URL pública para la demo. |

## Secuencia: unirse a una sala

Desde que se abre PartyPad hasta que empieza la partida. Incluye el permiso de sensores que exige iOS y el token de reconexión que recibe cada jugador.

```mermaid
sequenceDiagram
    autonumber
    actor A as Anfitrión
    participant P as Pantalla principal
    participant S as Servidor
    participant M as Móvil del jugador
    actor J as Jugador

    A->>P: Abre PartyPad
    P->>S: create_room
    S-->>P: room_created, código ABCD
    P->>P: Genera QR con la URL de la sala
    J->>M: Escanea el QR
    M->>S: GET /mando?sala=ABCD por HTTPS
    S-->>M: Página del mando como PWA
    M->>M: Pide permiso de sensores en iOS
    J->>M: Escribe su nombre y elige color
    M->>S: join_room ABCD, nombre, color
    alt Sala llena o código incorrecto
        S-->>M: join_error con el motivo
    else Unión correcta
        S-->>M: joined, id de jugador y token de reconexión
        S-->>P: player_joined
        P->>P: Muestra al jugador en el lobby
    end
    A->>P: Pulsa Empezar
    P->>S: start_game
    S-->>P: game_start con la lista de minijuegos
    S-->>M: game_start
    M->>M: Cambia a la vista de mando
```

## Secuencia: bucle de juego en tiempo real

Una ronda del Laberinto. El móvil lee el giroscopio unas 30 veces por segundo, pero **solo envía cuando el cambio supera un umbral** (compresión delta), y cada envío ocupa 4 bytes.

```mermaid
sequenceDiagram
    autonumber
    participant M as Móvil
    participant S as Servidor
    participant P as Pantalla principal

    S->>P: round_start Laberinto, duración 45 s
    S->>M: round_start, modo inclinación
    loop Cada 33 ms, unos 30 Hz
        M->>M: Lee el giroscopio
        M->>M: Cuantiza x e y a int8
        alt Cambio mayor que el umbral, compresión delta
            M->>S: TILT, 4 bytes en binario
            S->>S: Valida y actualiza el estado
            S->>P: state_update con todos los jugadores
            P->>P: Interpola y dibuja las bolas
        else Cambio pequeño
            M->>M: No envía nada
        end
    end
    P->>S: player_finished, jugador 3
    S->>M: vibrate 200 ms al jugador 3
    S->>S: Calcula puntos de la ronda
    S->>P: round_end con la clasificación
    S->>M: round_end con la posición del jugador
```

## Estados de la partida

La máquina de estados que gestiona el servidor para cada sala. Corresponde al enumerado `RoomState` del diagrama de clases.

```mermaid
stateDiagram-v2
    [*] --> Lobby: crear sala
    Lobby --> Lobby: jugador se une o sale
    Lobby --> CargandoMinijuego: anfitrión inicia, 2 jugadores o más

    CargandoMinijuego --> Instrucciones: recursos listos
    Instrucciones --> CuentaAtras: 5 s
    CuentaAtras --> Jugando: 3, 2, 1
    Jugando --> Pausada: el anfitrión pausa
    Pausada --> Jugando: reanudar
    Jugando --> ResultadosRonda: tiempo agotado o todos terminan

    ResultadosRonda --> CargandoMinijuego: quedan rondas
    ResultadosRonda --> Podio: última ronda

    Podio --> Lobby: jugar otra vez
    Podio --> [*]: cerrar sala

    Lobby --> [*]: sala vacía 10 min

    note right of Jugando
        Si un jugador se desconecta,
        tiene 30 s para reconectarse
        con su token antes de
        quedar fuera de la ronda
    end note
```

| Estado | Qué ocurre |
|---|---|
| Lobby | Los jugadores entran y salen. El anfitrión espera a tener al menos 2. |
| CargandoMinijuego | La pantalla carga los recursos del siguiente minijuego. |
| Instrucciones | Se explica el minijuego durante 5 segundos, en pantalla y en el móvil. |
| CuentaAtras | 3, 2, 1. |
| Jugando | Los mandos envían entradas y el servidor actualiza el estado. |
| Pausada | El anfitrión ha pausado. Los mandos dejan de enviar. |
| ResultadosRonda | Puntos de la ronda y clasificación acumulada. |
| Podio | Clasificación final. Se puede volver a jugar o cerrar la sala. |

## Clases del servidor

Cada minijuego hereda de `MiniGame`. Por eso un pack descargable como `AimShoot` se añade sin tocar el resto del código: basta con implementar `start`, `onInput`, `tick` y `getResults`.

```mermaid
classDiagram
    direction LR
    class GameServer {
        -rooms: Map~string, Room~
        -packs: PackManager
        +createRoom(hostSocket) Room
        +joinRoom(code, name, color) Player
        +handleMessage(socket, buffer)
    }
    class Room {
        +code: string
        +host: Socket
        +players: Player[]
        +state: RoomState
        +rounds: MiniGame[]
        +addPlayer(p) void
        +removePlayer(id) void
        +start() void
        +nextRound() void
        +broadcast(msg) void
    }
    class Player {
        +id: number
        +name: string
        +color: string
        +score: number
        +reconnectToken: string
        +connected: boolean
    }
    class MiniGame {
        <<abstract>>
        +id: string
        +duration: number
        +inputMode: InputMode
        +start(players) void
        +onInput(player, data) void
        +tick(dt) void
        +getResults() Result[]
    }
    class ShakeRace
    class TiltMaze
    class Reflex
    class AimShoot {
        <<pack descargable>>
    }
    class PackManager {
        -manifest: Manifest
        +listPacks() PackInfo[]
        +getPack(id) Buffer
        +reload() void
    }
    class Protocol {
        <<utility>>
        +encode(type, payload) ArrayBuffer
        +decode(buffer) Message
        +quantize(value) int8
    }
    class RoomState {
        <<enumeration>>
        LOBBY
        LOADING
        PLAYING
        PAUSED
        RESULTS
        PODIUM
    }

    GameServer "1" o-- "*" Room
    GameServer --> PackManager
    GameServer ..> Protocol
    Room "1" *-- "1..8" Player
    Room "1" o-- "*" MiniGame
    Room --> RoomState
    MiniGame <|-- ShakeRace
    MiniGame <|-- TiltMaze
    MiniGame <|-- Reflex
    MiniGame <|-- AimShoot
```

## Sistema de packs: descarga y actualización

Cada pack es un ZIP con el código del minijuego, los sprites en WebP y los sonidos en Opus. El servidor publica un `manifest.json` con la lista de packs disponibles:

```json
{
  "version": 3,
  "packs": [
    { "id": "shake-race", "name": "Carrera de agitar",  "version": "1.2.0", "size": 184320, "sha256": "…" },
    { "id": "tilt-maze",  "name": "Laberinto",          "version": "1.0.0", "size": 256000, "sha256": "…" },
    { "id": "reflex",     "name": "Reflejos",           "version": "1.0.0", "size": 98304,  "sha256": "…" },
    { "id": "aim-shoot",  "name": "Apunta y dispara",   "version": "1.0.0", "size": 312000, "sha256": "…" }
  ]
}
```

Al arrancar, la pantalla principal compara el manifest con lo que tiene en su caché y descarga solo lo nuevo o actualizado, comprobando el hash antes de instalarlo.

```mermaid
sequenceDiagram
    autonumber
    participant P as Pantalla principal
    participant C as Caché local IndexedDB
    participant S as Servidor de packs

    P->>S: GET /packs/manifest.json
    S-->>P: Lista de packs con id, versión, tamaño y hash
    P->>C: Consulta versiones instaladas
    C-->>P: tilt-maze 1.0, shake-race 1.2
    loop Para cada pack nuevo o con versión mayor
        P->>S: GET /packs/aim-shoot-1.0.zip
        S-->>P: ZIP con código, sprites WebP y sonidos Opus
        P->>P: Comprueba el hash SHA-256
        alt Hash correcto
            P->>C: Guarda el pack y su versión
            P->>P: Registra el minijuego en el catálogo
        else Hash incorrecto
            P->>P: Descarta y mantiene la versión anterior
        end
    end
    P->>P: Muestra el aviso Nuevo minijuego disponible
```

**Para la demo:** empezamos la presentación con tres minijuegos, publicamos `aim-shoot` en el servidor en directo y la pantalla lo detecta y lo descarga. Así se ve el requisito de actualización funcionando.
