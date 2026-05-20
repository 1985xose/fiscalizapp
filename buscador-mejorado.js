/**
 * FiscalizApp - Función de búsqueda mejorada
 *
 * PROBLEMA: si buscas "nicolas" no aparece "Pequeño Nicolás" porque la búsqueda
 * actual probablemente:
 *   1. Solo mira en `c.nombre` (y "Pequeño Nicolás" lleva tilde)
 *   2. No normaliza acentos
 *   3. No mira en protagonistas, descripción, timeline...
 *
 * SOLUCIÓN: esta función:
 *   - Normaliza acentos en ambos lados (query y datos)
 *   - Busca en TODOS los campos relevantes: nombre, descripcion, partido,
 *     protagonistas (array), juzgado, juez, timeline.evento, importe, fechas
 *   - Soporta múltiples palabras con lógica AND ("nicolás supremo" exige las dos)
 *   - Es case-insensitive
 *
 * INTEGRACIÓN: en tu app.js (o donde tengas el filtro actual), reemplaza tu
 * función de filtrado por las dos de abajo. El listener del input debe llamar
 * a filtrarCasos(query) y pintar el resultado.
 */

// --- Normalización: quita tildes, ñ→n, pasa a minúsculas, comprime espacios ---
function normalizar(str) {
  if (str == null) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // quita marcas de acento
    .replace(/[^\w\s]/g, ' ')          // signos de puntuación → espacio
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// --- Construye un "texto buscable" único por caso, concatenando TODO ---
function textoBuscableDe(caso) {
  const partes = [
    caso.id,
    caso.nombre,
    caso.partido,
    caso.descripcion,
    caso.juzgado,
    caso.juez,
    caso.estado,
    caso.fecha_inicio,
    caso.motivo_archivo,
    Array.isArray(caso.protagonistas) ? caso.protagonistas.join(' ') : '',
    Array.isArray(caso.timeline)
      ? caso.timeline.map(t => `${t.fecha || ''} ${t.evento || ''}`).join(' ')
      : ''
  ];
  return normalizar(partes.filter(Boolean).join(' '));
}

// --- Cache: calcula el texto buscable UNA vez por caso, no en cada tecla ---
//     Llama a esta función después de cargar casos-corrupcion.json
function indexarCasos(casos) {
  casos.forEach(c => { c._buscable = textoBuscableDe(c); });
  return casos;
}

// --- Filtro principal: divide la query en palabras y exige que TODAS aparezcan ---
function filtrarCasos(query, casos) {
  const q = normalizar(query);
  if (!q) return casos;  // sin query: devuelve todo

  const palabras = q.split(' ').filter(p => p.length > 0);

  return casos.filter(c => {
    // Si no está indexado todavía, lo indexamos al vuelo
    if (!c._buscable) c._buscable = textoBuscableDe(c);
    // TODAS las palabras deben aparecer en algún sitio del texto buscable
    return palabras.every(p => c._buscable.includes(p));
  });
}

/* =============================================================
   EJEMPLO DE USO completo (adáptalo a tus IDs de elementos):

   let casos = [];

   fetch('data/casos-corrupcion.json')
     .then(r => r.json())
     .then(d => {
       casos = indexarCasos(d.casos);
       renderCasos(casos);
     });

   document.getElementById('buscador').addEventListener('input', e => {
     const filtrados = filtrarCasos(e.target.value, casos);
     renderCasos(filtrados);
   });

   ============================================================= */

// Exporta para módulos si lo usas como ES module
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizar, textoBuscableDe, indexarCasos, filtrarCasos };
}
