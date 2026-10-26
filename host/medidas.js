// Página de mediciones: pide /api/medidas y pinta barras y tablas agrupando por minijuego y número de jugadores.
const $ = (id) => document.getElementById(id);
const NOMBRES = { carrera: 'Carrera de agitar', laberinto: 'Laberinto', reflejos: 'Reflejos' };

const SUBIDA = [
  ['JSON', 'var(--serie-1)', (g) => g.subida.json],
  ['MessagePack', 'var(--serie-2)', (g) => g.subida.msgpack],
  ['Binario sin delta', 'var(--serie-3)', (g) => g.subida.binarioSinDelta],
  ['Binario + delta', 'var(--serie-4)', (g) => g.subida.binario],
];
const BAJADA = [
  ['JSON', 'var(--serie-1)', (g) => g.bajada.json],
  ['MessagePack', 'var(--serie-2)', (g) => g.bajada.msgpack],
  ['Deflate por mensaje', 'var(--serie-3)', (g) => g.bajada.deflate],
  ['Deflate con contexto', 'var(--serie-4)', (g) => g.bajada.deflateContexto],
];

let medidas = [];
const numero = (v, decimales = 0) =>
  v == null || Number.isNaN(v) ? '–' : v.toLocaleString('es-ES', { maximumFractionDigits: decimales, minimumFractionDigits: decimales });
const bytes = (v) => (v == null ? '–' : v >= 1000 ? `${numero(v / 1000, 1)} KB/s` : `${numero(v)} B/s`);

// Suma las rondas de cada grupo y divide por el tiempo total: así una ronda corta no pesa como una larga.
function agrupar(lista) {
  const grupos = new Map();
  for (const m of lista) {
    const clave = `${m.minijuego}|${m.jugadores}`;
    if (!grupos.has(clave)) grupos.set(clave, { minijuego: m.minijuego, jugadores: m.jugadores, rondas: [] });
    grupos.get(clave).rondas.push(m);
  }
  return [...grupos.values()]
    .sort((a, b) => a.minijuego.localeCompare(b.minijuego) || a.jugadores - b.jugadores)
    .map((g) => {
      const suma = (f) => g.rondas.reduce((a, m) => a + (f(m) ?? 0), 0);
      const s = Math.max(0.001, suma((m) => m.segundos));
      const tomadas = suma((m) => m.muestras.tomadas);
      const enviadas = suma((m) => m.muestras.enviadas);
      const binario = suma((m) => m.subida.binarioCable) / s;
      const conLecturas = g.rondas.some((m) => m.subida.binarioSinDeltaCable != null);
      return {
        ...g,
        segundos: s,
        subida: {
          mensajes: suma((m) => m.subida.mensajes) / s,
          json: suma((m) => m.subida.jsonCable) / s,
          msgpack: suma((m) => m.subida.msgpackCable) / s,
          binario,
          binarioSinDelta: conLecturas ? suma((m) => m.subida.binarioSinDeltaCable ?? m.subida.binarioCable) / s : null,
          ahorroDelta: tomadas ? 1 - enviadas / tomadas : null,
        },
        bajada: {
          json: suma((m) => m.bajada.json) / s,
          msgpack: suma((m) => m.bajada.msgpack) / s,
          deflate: suma((m) => m.bajada.deflate) / s,
          deflateContexto: suma((m) => m.bajada.deflateContexto) / s,
        },
      };
    });
}

function leyenda(el, series) {
  el.replaceChildren(
    ...series.map(([nombre, color]) => {
      const s = document.createElement('span');
      s.innerHTML = `<i style="background:${color}"></i>`;
      s.append(nombre);
      return s;
    }),
  );
}

// Barras horizontales: cada fila lleva su nombre y su valor escritos, así el color no es lo único que la identifica.
function barras(el, grupos, series) {
  if (!grupos.length) {
    el.innerHTML = '<p class="vacio">Aún no hay rondas medidas.</p>';
    return;
  }
  const maximo = Math.max(...grupos.flatMap((g) => series.map(([, , f]) => f(g) ?? 0)), 1);
  el.replaceChildren(
    ...grupos.map((g) => {
      const div = document.createElement('div');
      div.className = 'grupo';
      const h3 = document.createElement('h3');
      h3.textContent = `${NOMBRES[g.minijuego] ?? g.minijuego} · ${g.jugadores} jugadores · ${g.rondas.length} ronda${g.rondas.length > 1 ? 's' : ''}`;
      div.append(h3);
      for (const [nombre, color, f] of series) {
        const v = f(g);
        const fila = document.createElement('div');
        fila.className = 'fila';
        fila.innerHTML = `<span class="nombre"></span><span class="pista"><span class="barra"></span></span><span class="valor"></span>`;
        fila.querySelector('.nombre').textContent = nombre;
        fila.querySelector('.valor').textContent = bytes(v);
        const barra = fila.querySelector('.barra');
        barra.style.background = color;
        barra.style.width = v == null ? '0' : `${(v / maximo) * 100}%`;
        fila.dataset.tip = `${nombre}: ${bytes(v)}${v != null && f !== series[0][2] && series[0][2](g) ? ` · ${numero((series[0][2](g) / Math.max(v, 0.001)), 1)} veces menos que JSON` : ''}`;
        div.append(fila);
      }
      return div;
    }),
  );
}

function cifras(grupos) {
  const total = (f) => grupos.reduce((a, g) => a + (f(g) ?? 0) * g.segundos, 0);
  const json = total((g) => g.subida.json);
  const binario = total((g) => g.subida.binario);
  const conDelta = grupos.filter((g) => g.subida.ahorroDelta != null);
  const ahorro = conDelta.length ? conDelta.reduce((a, g) => a + g.subida.ahorroDelta * g.segundos, 0) / conDelta.reduce((a, g) => a + g.segundos, 0) : null;
  const rtts = medidasFiltradas().filter((m) => m.rtt.n);
  const rtt = rtts.length ? rtts.reduce((a, m) => a + m.rtt.media * m.rtt.n, 0) / rtts.reduce((a, m) => a + m.rtt.n, 0) : null;
  const p95 = rtts.length ? Math.max(...rtts.map((m) => m.rtt.p95)) : null;
  const tarjetas = [
    [binario ? `${numero(json / binario, 1)}×` : '–', 'menos bytes de subida con el binario que con JSON'],
    [ahorro == null ? '–' : `${numero(ahorro * 100)} %`, 'de lecturas del sensor que la compresión delta no envía'],
    [rtt == null ? '–' : `${numero(rtt)} ms`, `ida y vuelta media a los mandos${p95 != null ? ` (peor p95: ${numero(p95)} ms)` : ''}`],
    [String(medidasFiltradas().length), 'rondas medidas'],
  ];
  $('cifras').replaceChildren(
    ...tarjetas.map(([valor, texto]) => {
      const d = document.createElement('div');
      d.className = 'cifra';
      d.innerHTML = '<strong></strong><span></span>';
      d.querySelector('strong').textContent = valor;
      d.querySelector('span').textContent = texto;
      return d;
    }),
  );
}

const COLUMNAS = [
  ['Sala', (m) => m.sala],
  ['Minijuego', (m) => NOMBRES[m.minijuego] ?? m.minijuego],
  ['Jug.', (m) => m.jugadores],
  ['Hora', (m) => new Date(m.inicio).toLocaleTimeString('es-ES')],
  ['Segundos', (m) => numero(m.segundos, 1)],
  ['Mensajes/s', (m) => numero(m.subida.mensajesPorSegundo, 1)],
  ['JSON', (m) => bytes(m.subida.bytesPorSegundo.json)],
  ['MsgPack', (m) => bytes(m.subida.bytesPorSegundo.msgpack)],
  ['Bin. sin delta', (m) => bytes(m.subida.bytesPorSegundo.binarioSinDelta)],
  ['Bin. + delta', (m) => bytes(m.subida.bytesPorSegundo.binario)],
  ['Ahorro delta', (m) => (m.muestras.ahorroDelta == null ? '–' : `${numero(m.muestras.ahorroDelta, 1)} %`)],
  ['Pantalla JSON', (m) => bytes(m.bajada.bytesPorSegundo.json)],
  ['RTT medio', (m) => (m.rtt.media == null ? '–' : `${numero(m.rtt.media, 1)} ms`)],
  ['RTT p95', (m) => (m.rtt.p95 == null ? '–' : `${numero(m.rtt.p95, 1)} ms`)],
];

function tabla(lista) {
  const t = $('tabla');
  const cabecera = document.createElement('tr');
  for (const [nombre] of COLUMNAS) cabecera.append(Object.assign(document.createElement('th'), { textContent: nombre }));
  const filas = [...lista].reverse().map((m) => {
    const tr = document.createElement('tr');
    for (const [, f] of COLUMNAS) tr.append(Object.assign(document.createElement('td'), { textContent: f(m) }));
    return tr;
  });
  t.replaceChildren(cabecera, ...filas);
}

function medidasFiltradas() {
  const sala = $('filtro-sala').value;
  const juego = $('filtro-juego').value;
  return medidas.filter((m) => (!sala || m.sala === sala) && (!juego || m.minijuego === juego));
}

// Los desplegables conservan lo elegido aunque lleguen salas nuevas.
function opciones(select, valores, nombre = (v) => v) {
  const elegido = select.value;
  const primera = select.options[0];
  select.replaceChildren(primera, ...valores.map((v) => new Option(nombre(v), v)));
  select.value = valores.includes(elegido) ? elegido : '';
}

function pintar() {
  opciones($('filtro-sala'), [...new Set(medidas.map((m) => m.sala))]);
  opciones($('filtro-juego'), [...new Set(medidas.map((m) => m.minijuego))], (v) => NOMBRES[v] ?? v);
  const lista = medidasFiltradas();
  const grupos = agrupar(lista);
  cifras(grupos);
  barras($('subida'), grupos, SUBIDA);
  barras($('bajada'), grupos, BAJADA);
  tabla(lista);
  const sala = $('filtro-sala').value;
  $('csv').href = `/api/medidas.csv${sala ? `?sala=${sala}` : ''}`;
}

async function cargar() {
  try {
    medidas = await fetch('/api/medidas').then((r) => r.json());
    pintar();
  } catch {}
}

$('filtro-sala').addEventListener('change', pintar);
$('filtro-juego').addEventListener('change', pintar);

// Tooltip de las barras
const tip = $('tip');
document.addEventListener('pointermove', (e) => {
  const fila = e.target.closest?.('.fila');
  tip.classList.toggle('visible', Boolean(fila));
  if (!fila) return;
  tip.textContent = fila.dataset.tip;
  tip.style.left = `${Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8)}px`;
  tip.style.top = `${e.clientY + 14}px`;
});

leyenda($('leyenda-subida'), SUBIDA);
leyenda($('leyenda-bajada'), BAJADA);
cargar();
setInterval(cargar, 5000);
