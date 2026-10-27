// Botones de los minijuegos de opciones. El índice es el número de botón del mensaje BUTTON.
// Cada botón tiene color y forma, para distinguirlos sin depender solo del color.

// Quiz: 4 respuestas, al estilo Kahoot.
export const OPCIONES = [
  { nombre: 'Rojo', hex: '#e21b3c', forma: '▲' },
  { nombre: 'Azul', hex: '#1368ce', forma: '◆' },
  { nombre: 'Amarillo', hex: '#d89e00', forma: '●' },
  { nombre: 'Verde', hex: '#26890c', forma: '■' },
];

// Colores: 8 colores vivos y muy distintos entre sí, que se leen bien sobre el fondo oscuro de la pantalla.
export const TINTAS = [
  { nombre: 'Rojo', hex: '#e8213f', forma: '▲' },
  { nombre: 'Naranja', hex: '#ff8a00', forma: '◆' },
  { nombre: 'Amarillo', hex: '#ffd500', forma: '●' },
  { nombre: 'Verde', hex: '#2fbf4a', forma: '■' },
  { nombre: 'Turquesa', hex: '#00c4cc', forma: '★' },
  { nombre: 'Azul', hex: '#2f6bff', forma: '♥' },
  { nombre: 'Morado', hex: '#9b51e0', forma: '✚' },
  { nombre: 'Rosa', hex: '#ff4fb4', forma: '⬟' },
];

// Cada minijuego dice qué conjunto usa (static opciones en el servidor; options en el mensaje de ronda).
export const CONJUNTOS = { respuestas: OPCIONES, tintas: TINTAS };

// Colores del pincel de Dibuja. El mando y la pantalla usan los índices.
export const PINCELES = ['#1a1a2e', '#e8213f', '#ff8a00', '#ffd500', '#2fbf4a', '#2f6bff', '#9b51e0', '#ffffff'];
export const GROSORES = [6, 14, 30]; // en un lienzo de 1000 × 1000
