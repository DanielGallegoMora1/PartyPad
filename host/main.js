// Pantalla principal de PartyPad.
import { MSG } from '/shared/protocol.js';

document.getElementById('estado').textContent =
  `Protocolo cargado: ${Object.keys(MSG).length} tipos de mensaje`;
