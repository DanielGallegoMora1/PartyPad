// Mando de PartyPad: se abre en el móvil al escanear el QR.
import { MSG } from '/shared/protocol.js';

document.getElementById('estado').textContent =
  `Protocolo cargado: ${Object.keys(MSG).length} tipos de mensaje`;
