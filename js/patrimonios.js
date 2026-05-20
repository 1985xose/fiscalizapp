// FiscalizApp - Pata Patrimonios v2.2
// Soporta estructura nueva (bloques + calidad) y estructura vieja (patrimonio_neto plano)

let POLITICOS_DATA = null;
let IPC_DATA = null;
let SUELDOS_DATA = null;
let GLOSARIO_DATA = null;
let VISTA_PATRIMONIOS = 'categorias';

async function cargarDatosPatrimonios() {
  const container = document.getElementById('patrimonios-container');
  container.innerHTML = '<div class="cargando">Cargando datos patrimoniales...</div>';
  try {
    const [politicos, ipc, sueldos, glosario] = await Promise.all([
      fetch('data/patrimonios/politicos.json').then(r => r.json()),
      fetch('data/patrimonios/ipc.json').then(r => r.json()),
      fetch('data/patrimonios/sueldos_publicos.json').then(r => r.json()),
      fetch('data/patrimonios/glosario.json').then(r => r.json())
    ]);
    POLITICOS_DATA = politicos.politicos;
    IPC_DATA = ipc;
    SUELDOS_DATA = sueldos;
    GLOSARIO_DATA = glosario;
    renderPatrimonios();
  } catch (err) {
    container.innerHTML = `<div class="error">Error cargando datos: ${err.message}. Sirve la web con un servidor (no abras el HTML con doble clic).</div>`;
    console.error(err);
  }
}

// ============================================================
// LÓGICA DE CÁLCULO
// ============================================================

function esVersionNueva(politico) {
  return politico.version_ficha === '2.2' || politico.version_ficha === '2.3';
}

function ajustarA2024(importe, anio) {
  if (!importe || importe === 0) return 0;
  const factor = IPC_DATA.factores[anio] || 1;
  return importe * factor;
}

function sueldoCargoEnAnio(cargo, anio) {
  if (!cargo) return 0;
  const cargoData = SUELDOS_DATA[cargo];
  if (!cargoData) return 0;
  const anios = Object.keys(cargoData)
    .filter(k => !k.startsWith('_') && parseInt(k) <= anio)
    .map(k => parseInt(k))
    .sort((a, b) => b - a);
  if (anios.length === 0) return 0;
  return cargoData[anios[0]] || 0;
}

// Parsea "2018-06" -> {anio: 2018, mes: 6}, "2018" -> {anio: 2018, mes: 1}
function parsearFechaPeriodo(s) {
  if (!s) return null;
  const partes = String(s).split('-');
  return { anio: parseInt(partes[0]), mes: parseInt(partes[1] || '1') };
}

function calcularSueldoPublicoAcumulado(politico) {
  let totalAjustado2024 = 0;
  const detalles = [];

  for (const periodo of (politico.trayectoria_publica || [])) {
    // Periodos sin cargo o no remunerados: registrar como 0 pero documentar
    if (!periodo.cargo || periodo.remunerado === false) {
      const inicio = parsearFechaPeriodo(periodo.desde) || parsearFechaPeriodo(periodo.anio_inicio);
      const fin = parsearFechaPeriodo(periodo.hasta) || parsearFechaPeriodo(periodo.anio_fin) || { anio: 2026, mes: 12 };
      if (!inicio) continue;
      detalles.push({
        cargo: periodo.cargo || 'sin_cargo_remunerado',
        desde: inicio.anio,
        hasta: fin.anio,
        meses: 0,
        ajustado2024: 0,
        no_remunerado: true,
        nota: periodo.nota || ''
      });
      continue;
    }

    // Periodos remunerados: calcular sueldo prorrateado por meses
    const inicio = parsearFechaPeriodo(periodo.desde) || parsearFechaPeriodo(periodo.anio_inicio);
    const fin = parsearFechaPeriodo(periodo.hasta) || parsearFechaPeriodo(periodo.anio_fin) || { anio: 2026, mes: 5 };
    if (!inicio) continue;

    let subtotalAjustado = 0;
    let mesesTotal = 0;
    for (let a = inicio.anio; a <= fin.anio; a++) {
      const sueldoAnual = sueldoCargoEnAnio(periodo.cargo, a);
      if (sueldoAnual <= 0) continue;
      // Calcular meses dentro del año
      let mesIni = (a === inicio.anio) ? inicio.mes : 1;
      let mesFin = (a === fin.anio) ? fin.mes : 12;
      const mesesEsteAnio = Math.max(0, mesFin - mesIni + 1);
      const porcionAnual = mesesEsteAnio / 12;
      subtotalAjustado += ajustarA2024(sueldoAnual * porcionAnual, a);
      mesesTotal += mesesEsteAnio;
    }

    detalles.push({
      cargo: periodo.cargo,
      desde: inicio.anio,
      hasta: fin.anio,
      meses: mesesTotal,
      ajustado2024: subtotalAjustado,
      no_remunerado: false,
      nota: periodo.nota || ''
    });
    totalAjustado2024 += subtotalAjustado;
  }

  const totalNetoEstimado = totalAjustado2024 * 0.65; // IRPF efectivo 35%
  return { totalAjustado2024, totalNetoEstimado, detalles };
}

// Extrae cifra de patrimonio neto/liquido de una declaración (formato nuevo o viejo)
function extraerPatrimonioDeDeclaracion(d) {
  // Formato nuevo v2.2
  if (d.totales_oficiales) {
    const t = d.totales_oficiales;
    if (t.patrimonio_neto_consolidado != null) {
      return { valor: t.patrimonio_neto_consolidado, calidad: t.calidad, fuente: 'consolidado_oficial' };
    }
  }
  if (d.totales_derivados) {
    if (d.totales_derivados.patrimonio_liquido_neto != null) {
      return { valor: d.totales_derivados.patrimonio_liquido_neto, calidad: d.totales_derivados.calidad || d.calidad_declaracion, fuente: 'liquido_neto' };
    }
    if (d.totales_derivados.patrimonio_estimado_personal != null) {
      return { valor: d.totales_derivados.patrimonio_estimado_personal, calidad: d.totales_derivados.calidad || d.calidad_declaracion, fuente: 'estimacion_personal' };
    }
  }
  // Formato viejo
  if (d.patrimonio_neto != null) return { valor: d.patrimonio_neto, calidad: 'DOBLE_CRUCE', fuente: 'legacy' };
  if (d.patrimonio_neto_pareja != null) return { valor: d.patrimonio_neto_pareja / 2, calidad: 'DOBLE_CRUCE', fuente: 'legacy_pareja' };
  return null;
}

function obtenerDeclaracionesConCifra(politico) {
  return (politico.declaraciones || []).filter(d => extraerPatrimonioDeDeclaracion(d) != null);
}

function calcularMetricas(politico) {
  const sueldo = calcularSueldoPublicoAcumulado(politico);
  const decls = obtenerDeclaracionesConCifra(politico);
  if (decls.length === 0 || sueldo.totalNetoEstimado === 0) return { sinDatos: true, sueldo };

  const primera = decls[0];
  const ultima = decls[decls.length - 1];
  const patUlt = extraerPatrimonioDeDeclaracion(ultima);
  const patPrim = extraerPatrimonioDeDeclaracion(primera);
  const patFinal2024 = ajustarA2024(patUlt.valor, ultima.anio);
  const patInicial2024 = ajustarA2024(patPrim.valor, primera.anio);

  const multiplicador = patFinal2024 / sueldo.totalNetoEstimado;
  const exceso = patFinal2024 - sueldo.totalNetoEstimado;

  let incrementoAbsoluto = null;
  let incrementoPorcentual = null;
  const unaSolaDeclaracion = decls.length <= 1;
  if (!unaSolaDeclaracion) {
    incrementoAbsoluto = patFinal2024 - patInicial2024;
    if (patInicial2024 > 0) incrementoPorcentual = ((patFinal2024 - patInicial2024) / patInicial2024) * 100;
    else if (patInicial2024 < 0) incrementoPorcentual = null; // No bien definido
  }

  return {
    sinDatos: false,
    sueldo,
    patFinal: { valor: patFinal2024, anio: ultima.anio, fuente: patUlt.fuente, calidad: patUlt.calidad },
    patInicial: { valor: patInicial2024, anio: primera.anio, fuente: patPrim.fuente },
    multiplicador,
    exceso,
    incrementoAbsoluto,
    incrementoPorcentual,
    unaSolaDeclaracion,
    calidadCifraPrincipal: patUlt.calidad
  };
}

function categorizar(m) {
  if (m == null) return 'sin_datos';
  if (m >= 1.0) return 'rojo';
  if (m >= 0.5) return 'amarillo';
  if (m >= 0.1) return 'verde';
  return 'negro';
}

const CATEGORIAS = {
  rojo: { titulo: 'Por encima del sueldo público', descripcion: 'Su patrimonio actual es mayor que todo lo que ha cobrado del Estado descontando impuestos. La diferencia puede explicarse por ingresos privados, herencias, plusvalías, ahorro intensivo o cualquier combinación. La explicación corresponde al político, no a esta web.', color: '#e63946', emoji: '🔴' },
  amarillo: { titulo: 'Cómodos pero coherentes', descripcion: 'Su patrimonio está entre la mitad y el total de lo que cobraron del Estado. Cifras compatibles con buenos hábitos de ahorro de quien ha tenido sueldos públicos altos durante muchos años.', color: '#e9c46a', emoji: '🟡' },
  verde: { titulo: 'Han vivido lo que han ganado', descripcion: 'Patrimonio entre el 10% y el 50% del sueldo público neto acumulado. Lo que pasa cuando uno gasta más o menos lo que cobra. La conducta humana normal.', color: '#2a9d8f', emoji: '🟢' },
  negro: { titulo: '¿Dónde está el dinero?', descripcion: 'Patrimonio declarado inferior al 10% de lo cobrado del Estado, o negativo. Puede ser deuda real de hipoteca, separación de bienes con el cónyuge, declaración exclusivamente en gananciales, gasto elevado o cualquier combinación. La explicación corresponde al político.', color: '#5a5a72', emoji: '⚫' },
  sin_datos: { titulo: 'Datos insuficientes', descripcion: 'No disponemos de declaraciones con cifras concretas para calcular su posición. Pendiente de localizar fuentes oficiales.', color: '#888', emoji: '⚪' }
};

const ICONOS = {
  privados: { emoji: '💼', label: 'Ingresos privados conocidos', desc: 'Tiene o ha tenido carrera profesional fuera de la política. Su patrimonio puede contener ingresos legítimos no procedentes del sueldo público.' },
  gananciales: { emoji: '💑', label: 'Declara en gananciales', desc: 'Patrimonio compartido con su pareja según el régimen económico matrimonial. La cifra individual mostrada es una aproximación del 50%.' },
  snapshot: { emoji: '📸', label: 'Una sola declaración disponible', desc: 'No conocemos el punto de partida. No se puede hablar de evolución.' },
  sociedad: { emoji: '🏢', label: 'Patrimonio vía sociedad', desc: 'La cifra principal corresponde a una sociedad mercantil que controla, no a su declaración personal directa.' }
};

const CALIDAD_FUENTE = {
  VERIFICADA:       { emoji: '🟢', label: 'Verificada en documento original', clase: 'cal-verde' },
  TRIPLE_CRUCE:     { emoji: '🟢', label: 'Triple cruce (3+ medios coinciden)', clase: 'cal-verde' },
  DOBLE_CRUCE:      { emoji: '🟡', label: 'Doble cruce (2 medios coinciden)', clase: 'cal-amarillo' },
  CITA_UNICA:       { emoji: '🟠', label: 'Cita única (1 medio cita fuente primaria)', clase: 'cal-naranja' },
  ESTIMACION:       { emoji: '🔴', label: 'Estimación periodística', clase: 'cal-rojo' },
  NO_LOCALIZADA:    { emoji: '⚪', label: 'No localizada', clase: 'cal-gris' },
  NO_CONSOLIDADO:   { emoji: '🟡', label: 'Sin consolidación oficial (bloques sueltos)', clase: 'cal-amarillo' }
};

// ============================================================
// FORMATEO
// ============================================================

function fmtEuros(n) {
  if (n == null) return '—';
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M€';
  if (Math.abs(n) >= 1_000) return Math.round(n / 1_000).toLocaleString('es-ES') + 'K€';
  return Math.round(n).toLocaleString('es-ES') + '€';
}

function fmtMultiplicador(m) {
  if (m == null) return '—';
  return m.toFixed(2) + 'x';
}

function fmtPct(n) {
  if (n == null) return '—';
  const s = n >= 0 ? '+' : '';
  return s + Math.round(n) + '%';
}

const CARGO_LABEL = {
  presidente_gobierno: 'Presidente del Gobierno',
  vicepresidente: 'Vicepresidente',
  vicepresidente_gobierno: 'Vicepresidente del Gobierno',
  ministro: 'Ministro',
  exministra_indemnizacion: 'Indemnización post-cese ministerial',
  diputado_congreso: 'Diputado',
  senador: 'Senador',
  presidente_xunta_galicia: 'Presidente Xunta de Galicia',
  vicepresidente_xunta_galicia: 'Vicepresidente Xunta de Galicia',
  conselleiro_xunta_galicia: 'Conselleiro Xunta de Galicia',
  diputado_parlamento_galicia: 'Diputado Parlamento Galicia',
  diputado_parlamento_vasco: 'Diputado Parlamento Vasco',
  consejero_junta_andalucia: 'Consejero/a Junta de Andalucía',
  alcalde_capital_provincia: 'Alcalde/sa capital de provincia',
  secretario_estado: 'Secretario/a de Estado',
  concejal_pequeno_municipio: 'Concejal municipio pequeño',
  concejal_mediano_municipio: 'Concejal municipio mediano',
  juntas_generales_alava: 'Miembro Juntas Generales Álava',
  alto_cargo_comunidad_madrid: 'Alto cargo Comunidad de Madrid',
  presidente_insalud: 'Presidente Insalud',
  presidente_correos: 'Presidente Correos y Telégrafos',
  alto_cargo_xunta_galicia: 'Alto cargo Xunta de Galicia',
  funcionario_xunta_no_politico: 'Funcionario (no cargo político)',
  eurodiputado: 'Eurodiputado',
  concejal_madrid: 'Concejal Madrid',
  secretario_general_psoe: 'Secretario General PSOE',
  consejero_empresa_municipal_madrid: 'Consejero empresa municipal Madrid',
  sin_cargo_remunerado: 'Sin cargo público remunerado'
};

function calidadIcon(c) {
  const k = CALIDAD_FUENTE[c];
  if (!k) return '';
  return `<span class="cal-icon ${k.clase}" title="${k.label}">${k.emoji}</span>`;
}

// ============================================================
// RENDER
// ============================================================

function renderPatrimonios() {
  const container = document.getElementById('patrimonios-container');
  const todos = POLITICOS_DATA.map(p => ({ p, m: calcularMetricas(p) }));

  let html = `
    <div class="patrimonio-header">
      <h2>Patrimonios políticos</h2>
      <p class="pat-intro">
        Comparamos lo que cada político tiene hoy con lo que ha cobrado del Estado durante toda su carrera pública,
        ajustado a euros de 2024 y descontando impuestos. No diagnosticamos ilegalidades: eso es trabajo de los jueces.
        Aquí enseñamos cifras, fuentes y preguntas. La respuesta corresponde al político.
      </p>
      <p class="pat-aviso">
        <strong>Cómo leer:</strong> el <strong>múltiplo</strong> indica cuánto patrimonio tiene en relación a su sueldo público neto acumulado.
        <strong>1x</strong> significa que tiene exactamente lo que ha cobrado del Estado. Más de 1x significa que tiene más (lo que puede deberse a muchas razones).
        Menos de 1x significa que tiene menos (lo normal: la gente gasta).<br><br>
        <strong>Calidad de cada cifra:</strong>
        <span class="cal-icon cal-verde">🟢</span> verificado o triple cruce ·
        <span class="cal-icon cal-amarillo">🟡</span> doble cruce ·
        <span class="cal-icon cal-naranja">🟠</span> cita única ·
        <span class="cal-icon cal-rojo">🔴</span> estimación ·
        <span class="cal-icon cal-gris">⚪</span> no localizada
      </p>
    </div>

    <div class="vistas-toggle">
      <button class="vista-btn ${VISTA_PATRIMONIOS==='categorias'?'activa':''}" onclick="cambiarVistaPat('categorias')">Por categorías</button>
      <button class="vista-btn ${VISTA_PATRIMONIOS==='absoluto'?'activa':''}" onclick="cambiarVistaPat('absoluto')">Patrimonio absoluto</button>
      <button class="vista-btn ${VISTA_PATRIMONIOS==='crecimiento'?'activa':''}" onclick="cambiarVistaPat('crecimiento')">% crecimiento</button>
    </div>

    <div class="filtros-pat">
      <input type="text" id="pat-buscador" class="pat-buscador-input" placeholder="🔍 Buscar por nombre..." oninput="filtrarPatrimonios()" />
      <div class="pat-filtros-partido" id="pat-filtros-partido">
        ${renderBotonesPartido()}
      </div>
      <div class="pat-filtros-contador" id="pat-filtros-contador"></div>
    </div>
  `;

  if (VISTA_PATRIMONIOS === 'categorias') html += renderVistaCategorias(todos);
  else if (VISTA_PATRIMONIOS === 'absoluto') html += renderVistaAbsoluto(todos);
  else if (VISTA_PATRIMONIOS === 'crecimiento') html += renderVistaCrecimiento(todos);

  html += `
    <div class="pat-footer">
      <a href="#" onclick="mostrarMetodologia();return false;">Ver metodología completa</a>
      <span class="sep">·</span>
      <a href="#" onclick="document.querySelector('[data-section=glosario]').click();return false;">Glosario de términos</a>
    </div>
  `;
  container.innerHTML = html;
}

function cambiarVistaPat(v) { VISTA_PATRIMONIOS = v; renderPatrimonios(); }

function renderVistaCategorias(todos) {
  const grupos = { rojo: [], amarillo: [], verde: [], negro: [], sin_datos: [] };
  todos.forEach(it => {
    const cat = it.m.sinDatos ? 'sin_datos' : categorizar(it.m.multiplicador);
    grupos[cat].push(it);
  });
  Object.keys(grupos).forEach(k => grupos[k].sort((a, b) => (b.m.multiplicador || 0) - (a.m.multiplicador || 0)));

  let html = '';
  ['rojo','amarillo','verde','negro','sin_datos'].forEach(cat => {
    if (!grupos[cat].length) return;
    const c = CATEGORIAS[cat];
    html += `
      <section class="categoria-bloque categoria-${cat}">
        <div class="categoria-header">
          <h3>${c.emoji} ${c.titulo}</h3>
          <p>${c.descripcion}</p>
        </div>
        <div class="politicos-grid">
          ${grupos[cat].map(it => renderTarjeta(it.p, it.m)).join('')}
        </div>
      </section>
    `;
  });
  return html;
}

function renderVistaAbsoluto(todos) {
  const con = todos.filter(x => !x.m.sinDatos);
  con.sort((a, b) => b.m.patFinal.valor - a.m.patFinal.valor);
  return `
    <div class="ranking-simple">
      <p class="ranking-intro">Ordenados por patrimonio neto declarado, ajustado a euros de 2024.</p>
      ${con.map((it, i) => renderTarjeta(it.p, it.m, i + 1)).join('')}
    </div>
  `;
}

function renderVistaCrecimiento(todos) {
  const con = todos.filter(x => !x.m.sinDatos && x.m.incrementoPorcentual != null);
  con.sort((a, b) => b.m.incrementoPorcentual - a.m.incrementoPorcentual);
  return `
    <div class="ranking-simple">
      <p class="ranking-intro">Ordenados por porcentaje de crecimiento patrimonial entre la primera y última declaración conocida. Solo políticos con 2+ declaraciones cuantitativas.</p>
      ${con.map((it, i) => renderTarjeta(it.p, it.m, i + 1)).join('')}
    </div>
  `;
}

function contarFuentesUnicas(p) {
  // Reúne todos los URLs de fuentes secundarias de todas las declaraciones (dedup por dominio)
  const urls = new Set();
  (p.declaraciones || []).forEach(d => {
    (d.fuentes_secundarias || []).forEach(f => {
      if (f.url) urls.add(f.url);
    });
  });
  return urls.size;
}

function renderTarjeta(p, m, pos) {
  const iconos = (p.iconos || []).map(k => {
    const ic = ICONOS[k];
    if (!ic) return '';
    return `<span class="icono-info" title="${ic.label}: ${ic.desc.replace(/"/g,'&quot;')}">${ic.emoji}</span>`;
  }).join('');

  const calidad = !m.sinDatos ? calidadIcon(m.calidadCifraPrincipal) : '';
  const cifra = m.sinDatos
    ? '<span class="cifra-sin-datos">Sin datos completos</span>'
    : `<span class="cifra-multiplo">${fmtMultiplicador(m.multiplicador)}</span>${calidad}<span class="cifra-aclaracion">de su sueldo público neto</span>`;

  const calidadGlobal = p.calidad_global ? `<span class="badge-calidad" title="Calidad global de las fuentes">${calidadIcon(p.calidad_global)}</span>` : '';

  const nFuentes = contarFuentesUnicas(p);
  const fuentesBadge = nFuentes > 0
    ? `<span class="badge-fuentes" title="Número de fuentes secundarias consultadas para verificar las cifras">📎 ${nFuentes} ${nFuentes === 1 ? 'fuente' : 'fuentes'}</span>`
    : '';

  const partidoKey = partidoNormalizado(p.partido);
  const nombreLower = p.nombre.toLowerCase();

  return `
    <article class="politico-card" data-id="${p.id}" data-partido="${partidoKey}" data-nombre="${nombreLower}">
      <header onclick="toggleFicha('${p.id}')">
        ${pos ? `<span class="posicion">#${pos}</span>` : ''}
        <div class="card-titulo">
          <h4>${p.nombre} <span class="partido">${p.partido}</span> ${calidadGlobal}</h4>
          <div class="card-iconos">${iconos} ${fuentesBadge}</div>
        </div>
        <div class="card-cifra">${cifra}</div>
        <button class="btn-toggle" aria-label="Expandir">▼</button>
      </header>
      <div class="ficha-completa" id="ficha-${p.id}" style="display:none">
        ${renderFichaCompleta(p, m)}
      </div>
    </article>
  `;
}

function renderFichaCompleta(p, m) {
  let html = '<div class="ficha-grid">';

  // BLOQUE: Resumen
  html += '<div class="ficha-bloque"><h5>Resumen</h5>';
  if (m.sinDatos) {
    html += '<p>No disponemos de declaraciones con cifras concretas para calcular su posición.</p>';
  } else {
    html += `
      <p><strong>Patrimonio (€ 2024):</strong> ${fmtEuros(m.patFinal.valor)} ${calidadIcon(m.patFinal.calidad)}</p>
      ${m.patFinal.fuente === 'liquido_neto' ? '<p class="nota-icon">Cifra de patrimonio LÍQUIDO neto (activos financieros menos pasivos). No incluye inmuebles porque el Congreso no exige valoración inmobiliaria. El patrimonio total real es necesariamente superior.</p>' : ''}
      ${m.patFinal.fuente === 'estimacion_personal' ? '<p class="nota-icon">Cifra ESTIMADA personal. El político no es cargo público actualmente y no presenta declaración patrimonial oficial. Reconstruido vía Registro Mercantil de sociedades familiares + investigación periodística. El patrimonio real puede ser superior.</p>' : ''}
      <p><strong>Sueldo público neto acumulado:</strong> ${fmtEuros(m.sueldo.totalNetoEstimado)}</p>
      <p><strong>Diferencia:</strong> ${m.exceso >= 0 ? '+' : ''}${fmtEuros(m.exceso)}</p>
      <p><strong>Múltiplo:</strong> ${fmtMultiplicador(m.multiplicador)}</p>
      ${m.incrementoPorcentual != null ? `<p><strong>Crecimiento ${m.patInicial.anio}-${m.patFinal.anio}:</strong> ${fmtPct(m.incrementoPorcentual)} (${fmtEuros(m.incrementoAbsoluto)})</p>` : ''}
    `;
  }
  html += '</div>';

  // BLOQUE DESTACADO: Fuentes consultadas (NUEVO - visible desde el primer momento)
  const todasFuentes = [];
  const urlsVistas = new Set();
  (p.declaraciones || []).forEach(d => {
    (d.fuentes_secundarias || []).forEach(f => {
      if (f.url && !urlsVistas.has(f.url)) {
        urlsVistas.add(f.url);
        todasFuentes.push(f);
      }
    });
  });
  if (todasFuentes.length > 0) {
    html += '<div class="ficha-bloque ficha-fuentes"><h5>📎 Fuentes consultadas (' + todasFuentes.length + ')</h5>';
    html += '<p class="fuentes-intro">De dónde sale la información que ves arriba. Cada declaración patrimonial ha sido contrastada con estos medios.</p>';
    html += '<ul class="fuentes-list">';
    todasFuentes.forEach(f => {
      const medio = f.medio || 'Fuente';
      const fecha = f.fecha_consulta ? `<span class="fuente-fecha">(consultada ${f.fecha_consulta})</span>` : '';
      html += `<li><a href="${f.url}" target="_blank" rel="noopener">${medio}</a> ${fecha}</li>`;
    });
    html += '</ul>';
    html += '<p class="fuentes-nota">Calidad global de la verificación: ' + (p.calidad_global ? calidadIcon(p.calidad_global) + ' ' + (CALIDAD_FUENTE[p.calidad_global]?.label || p.calidad_global) : 'sin clasificar') + '</p>';
    html += '</div>';
  }

  // BLOQUE: Contexto (iconos)
  if ((p.iconos || []).length || p.nota_iconos) {
    html += '<div class="ficha-bloque"><h5>Contexto</h5>';
    (p.iconos || []).forEach(k => {
      const ic = ICONOS[k];
      if (!ic) return;
      html += `<p><span class="emoji-grande">${ic.emoji}</span> <strong>${ic.label}.</strong> ${ic.desc}</p>`;
    });
    if (p.nota_iconos) html += `<p class="nota-icon">${p.nota_iconos}</p>`;
    html += '</div>';
  }

  // BLOQUE: Trayectoria pública
  html += '<div class="ficha-bloque ficha-bloque-ancho"><h5>Trayectoria pública</h5>';
  (p.trayectoria_publica || []).forEach(t => {
    const desde = t.desde || t.anio_inicio || '?';
    const hasta = t.hasta || t.anio_fin || 'actualidad';
    const cargo = t.cargo ? (CARGO_LABEL[t.cargo] || t.cargo) : 'Sin cargo remunerado';
    const noRem = (t.cargo === null || t.remunerado === false) ? ' <span class="badge-no-rem">no remunerado</span>' : '';
    html += `<p><strong>${cargo}</strong>${noRem} · ${desde} – ${hasta}${t.nota ? `<br><span class="decl-detalle">${t.nota}</span>` : ''}</p>`;
  });
  html += '</div>';

  // BLOQUE: Declaraciones (formato nuevo o viejo)
  html += '<div class="ficha-bloque ficha-bloque-ancho"><h5>Declaraciones conocidas</h5>';
  if (!(p.declaraciones || []).length) {
    html += '<p>Sin declaraciones registradas.</p>';
  } else {
    p.declaraciones.forEach(d => html += renderDeclaracion(d));
  }
  html += '</div>';

  // BLOQUE: Sueldo público desglosado
  html += '<div class="ficha-bloque ficha-bloque-ancho"><h5>Sueldo público desglosado (en € 2024)</h5>';
  m.sueldo.detalles.forEach(det => {
    if (det.no_remunerado) {
      html += `<p class="sueldo-no-rem">${CARGO_LABEL[det.cargo] || det.cargo} (${det.desde}-${det.hasta}): periodo sin remuneración del Estado${det.nota ? ` — ${det.nota}` : ''}</p>`;
    } else {
      html += `<p>${CARGO_LABEL[det.cargo] || det.cargo} (${det.desde}-${det.hasta}, ~${Math.round(det.meses/12*10)/10} años): ${fmtEuros(det.ajustado2024)}</p>`;
    }
  });
  html += `<p class="total"><strong>Total bruto:</strong> ${fmtEuros(m.sueldo.totalAjustado2024)}</p>`;
  html += `<p class="total"><strong>Total neto estimado (IRPF 35%):</strong> ${fmtEuros(m.sueldo.totalNetoEstimado)}</p>`;
  html += '</div>';

  // BLOQUE: Pendientes / limitaciones
  if (p.datos_pendientes || p.nota || p.limitaciones_metodologicas) {
    html += '<div class="ficha-bloque ficha-bloque-ancho"><h5>Limitaciones y datos pendientes</h5>';
    if (p.limitaciones_metodologicas) html += `<p><strong>Metodológica:</strong> ${p.limitaciones_metodologicas}</p>`;
    if (p.datos_pendientes) html += `<p><strong>Pendiente:</strong> ${p.datos_pendientes}</p>`;
    if (p.nota) html += `<p>${p.nota}</p>`;
    html += '</div>';
  }

  html += '</div>';
  return html;
}

function renderDeclaracion(d) {
  // Formato viejo (legacy)
  if (!d.bloques && !d.totales_oficiales && !d.totales_derivados) {
    const pat = d.patrimonio_neto != null ? d.patrimonio_neto : (d.patrimonio_neto_pareja != null ? d.patrimonio_neto_pareja : null);
    const esGan = d.patrimonio_neto == null && d.patrimonio_neto_pareja != null;
    return `
      <div class="declaracion-item">
        <div class="decl-header">
          <strong>${d.anio}</strong>
          ${d.contexto ? ` · ${d.contexto}` : ''}
          ${pat != null ? ` · ${fmtEuros(pat)}${esGan ? ' (gananciales)' : ''}` : ' · <em>cifra no disponible</em>'}
        </div>
        ${d.activos_total ? `<div class="decl-detalle">Activos totales: ${fmtEuros(d.activos_total)}</div>` : ''}
        ${d.pasivos_total ? `<div class="decl-detalle">Pasivos: ${fmtEuros(d.pasivos_total)}</div>` : ''}
        ${d.inmuebles_n ? `<div class="decl-detalle">Inmuebles declarados: ${d.inmuebles_n} <span class="decl-asterisco">(a valor catastral)</span></div>` : ''}
        ${d.fuente ? `<div class="decl-fuente">Fuente: ${d.fuente_url ? `<a href="${d.fuente_url}" target="_blank" rel="noopener">${d.fuente}</a>` : d.fuente}</div>` : ''}
      </div>
    `;
  }

  // Formato nuevo v2.2
  let h = `<div class="declaracion-item declaracion-nueva">`;
  h += `<div class="decl-header">
    <strong>${d.anio}</strong> · ${(d.tipo_documento || '').replace(/_/g, ' ')} ${calidadIcon(d.calidad_declaracion)}
    ${d.fecha_declaracion ? `<span class="decl-fecha"> · ${d.fecha_declaracion}</span>` : ''}
  </div>`;

  // Documento oficial
  if (d.documento_oficial) {
    const doc = d.documento_oficial;
    h += `<div class="decl-doc-oficial">📄 ${doc.nombre || 'Documento oficial'}`;
    if (doc.fecha_publicacion) h += ` (${doc.fecha_publicacion})`;
    if (doc.pagina) h += `, pág. ${doc.pagina}`;
    if (doc.url || doc.url_pdf_patron || doc.url_ficha_congreso) {
      const url = doc.url || doc.url_pdf_patron || doc.url_ficha_congreso;
      h += ` <a href="${url}" target="_blank" rel="noopener">[abrir]</a>`;
    }
    if (doc.nota) h += `<div class="decl-asterisco">${doc.nota}</div>`;
    h += '</div>';
  }

  // Bloques
  if (d.bloques) {
    const b = d.bloques;
    if (b.liquido) {
      h += '<div class="decl-subbloque"><strong>Patrimonio líquido:</strong>';
      Object.entries(b.liquido).forEach(([k, v]) => {
        if (typeof v !== 'object' || v.valor == null) return;
        const lbl = k.replace(/_/g, ' ');
        h += `<div class="decl-cifra">${lbl}: ${fmtEuros(v.valor)} ${calidadIcon(v.calidad)} ${v.detalle ? `<span class="decl-asterisco">${v.detalle}</span>` : ''}</div>`;
      });
      h += '</div>';
    }
    if (b.inmuebles && Array.isArray(b.inmuebles) && b.inmuebles.length) {
      h += '<div class="decl-subbloque"><strong>Inmuebles:</strong>';
      b.inmuebles.forEach(im => {
        h += `<div class="decl-cifra">${im.tipo} en ${im.ubicacion} (${(im.regimen || '').replace(/_/g, ' ')}) — ${im.valor_declarado != null ? fmtEuros(im.valor_declarado) : '<em>sin valoración</em>'}</div>`;
      });
      h += '</div>';
    }
    if (b.pasivos) {
      h += '<div class="decl-subbloque"><strong>Pasivos:</strong>';
      Object.entries(b.pasivos).forEach(([k, v]) => {
        if (typeof v !== 'object' || v.valor == null) return;
        h += `<div class="decl-cifra">${k.replace(/_/g, ' ')}: ${fmtEuros(v.valor)} ${calidadIcon(v.calidad)} ${v.detalle ? `<span class="decl-asterisco">${v.detalle}</span>` : ''}</div>`;
      });
      h += '</div>';
    }
  }

  // Totales
  if (d.totales_oficiales || d.totales_derivados) {
    h += '<div class="decl-subbloque"><strong>Totales:</strong>';
    if (d.totales_oficiales) {
      const t = d.totales_oficiales;
      if (t.activos_total != null) h += `<div class="decl-cifra">Activos: ${fmtEuros(t.activos_total)} ${calidadIcon(t.calidad)}</div>`;
      if (t.pasivos_total != null) h += `<div class="decl-cifra">Pasivos: ${fmtEuros(t.pasivos_total)}</div>`;
      if (t.patrimonio_neto_consolidado != null) h += `<div class="decl-cifra"><strong>Patrimonio neto oficial: ${fmtEuros(t.patrimonio_neto_consolidado)} ${calidadIcon(t.calidad)}</strong></div>`;
      if (t.nota) h += `<div class="decl-asterisco">${t.nota}</div>`;
    }
    if (d.totales_derivados) {
      const td = d.totales_derivados;
      if (td.patrimonio_liquido_neto != null) h += `<div class="decl-cifra"><strong>Patrimonio líquido neto: ${fmtEuros(td.patrimonio_liquido_neto)} ${calidadIcon(td.calidad)}</strong></div>`;
      if (td.nota) h += `<div class="decl-asterisco">${td.nota}</div>`;
    }
    h += '</div>';
  }

  // Ingresos del ejercicio anterior
  if (d.ingresos_ejercicio_anterior) {
    const ing = d.ingresos_ejercicio_anterior;
    h += `<div class="decl-subbloque"><strong>Ingresos ejercicio ${ing.ejercicio_fiscal || ''}:</strong>`;
    Object.entries(ing).forEach(([k, v]) => {
      if (k === 'ejercicio_fiscal' || k === 'nota') return;
      if (typeof v !== 'object' || v.valor == null) return;
      let extra = '';
      if (v.donado_totalmente) extra = ` <em>(donado a ${v.destinatario || 'destinatario'})</em>`;
      h += `<div class="decl-cifra">${k.replace(/_/g, ' ')}: ${fmtEuros(v.valor)} ${calidadIcon(v.calidad)}${extra}${v.detalle ? ` <span class="decl-asterisco">${v.detalle}</span>` : ''}</div>`;
    });
    if (ing.nota) h += `<div class="decl-asterisco">${ing.nota}</div>`;
    h += '</div>';
  }

  // Fuentes secundarias
  if (d.fuentes_secundarias && d.fuentes_secundarias.length) {
    h += `<div class="decl-fuente"><strong>Fuentes secundarias cruzadas (${d.fuentes_secundarias.length}):</strong> `;
    h += d.fuentes_secundarias.map(f => `<a href="${f.url}" target="_blank" rel="noopener">${f.medio}</a>`).join(' · ');
    h += `</div>`;
  }

  if (d.verificado_fecha) h += `<div class="decl-verif">Verificado: ${d.verificado_fecha}</div>`;

  h += '</div>';
  return h;
}

function toggleFicha(id) {
  const f = document.getElementById('ficha-' + id);
  if (!f) return;
  const vis = f.style.display !== 'none';
  f.style.display = vis ? 'none' : 'block';
  const btn = f.closest('.politico-card').querySelector('.btn-toggle');
  if (btn) btn.textContent = vis ? '▼' : '▲';
}

function mostrarMetodologia() {
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="modal-content">
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
      <h2>Metodología</h2>
      <p>Esta sección documenta cómo calculamos, qué fuentes usamos y dónde están las limitaciones.</p>

      <h3>Sistema de calidad de fuentes</h3>
      <p>Cada cifra que mostramos lleva un icono que indica la calidad de su verificación:</p>
      <ul>
        <li><span class="cal-icon cal-verde">🟢</span> <strong>Verificada</strong>: el dato proviene del documento original consultado directamente.</li>
        <li><span class="cal-icon cal-verde">🟢</span> <strong>Triple cruce</strong>: la cifra aparece idéntica en 3 o más medios independientes que citan la misma fuente primaria. <em>Es nuestro estándar habitual.</em></li>
        <li><span class="cal-icon cal-amarillo">🟡</span> <strong>Doble cruce</strong>: confirmación en 2 medios independientes.</li>
        <li><span class="cal-icon cal-naranja">🟠</span> <strong>Cita única</strong>: un solo medio que cita fuente primaria, pendiente de cruce adicional.</li>
        <li><span class="cal-icon cal-rojo">🔴</span> <strong>Estimación</strong>: análisis periodístico, no una cifra de declaración oficial.</li>
        <li><span class="cal-icon cal-gris">⚪</span> <strong>No localizada</strong>: sin cifra explotable.</li>
      </ul>

      <h3>Fuentes primarias</h3>
      <ul>
        <li><strong>Declaraciones del Congreso (BOCG):</strong> publicación obligatoria al inicio y fin de cada legislatura. Cifras por bloques, sin patrimonio neto consolidado oficial.</li>
        <li><strong>Declaraciones de altos cargos (BOE):</strong> ministros y secretarios de Estado al entrar y salir. Sí ofrecen patrimonio neto consolidado.</li>
        <li><strong>Registro Mercantil:</strong> sociedades patrimoniales controladas por políticos.</li>
        <li><strong>Sueldos públicos:</strong> Portal de Transparencia del Gobierno, presupuestos generales, presupuestos del Congreso.</li>
        <li><strong>IPC:</strong> Instituto Nacional de Estadística (INE).</li>
      </ul>

      <h3>Decisiones metodológicas</h3>
      <ul>
        <li>Todos los importes se ajustan a euros de 2024 mediante factores IPC del INE.</li>
        <li>Sobre el sueldo público bruto acumulado descontamos un 35% como IRPF efectivo medio estimado.</li>
        <li><strong>Los inmuebles no se incluyen en el cálculo del múltiplo</strong> porque las declaraciones del Congreso no exigen valoración. Aparecen como información cualitativa en cada ficha.</li>
        <li>Los <strong>ingresos donados íntegramente</strong> a entidades benéficas se marcan en la ficha pero no se cuentan como incremento patrimonial.</li>
        <li>Para declaraciones en gananciales dividimos el patrimonio conjunto entre dos como aproximación.</li>
        <li>La trayectoria pública incluye <strong>periodos sin cargo remunerado</strong> de forma explícita.</li>
      </ul>

      <h3>Limitaciones reconocidas</h3>
      <ul>
        <li>Las declaraciones del Congreso son autocumplimentadas y nadie las audita.</li>
        <li>Los PDFs originales del Congreso no se pueden consultar automáticamente. Nuestro estándar de verificación es el cruce de 3+ medios que citen la fuente primaria.</li>
        <li>El patrimonio inmobiliario declarado es invisible en las cifras del Congreso. El patrimonio total real de quien tiene viviendas es necesariamente superior al líquido neto que mostramos.</li>
        <li>El IRPF efectivo varía por persona y año. Un 35% es estimación razonable para sueldos públicos altos.</li>
      </ul>

      <h3>Lo que esta web NO afirma</h3>
      <p>No afirma que ningún político haya cometido delito alguno. No afirma que haya enriquecimiento ilícito. No afirma que haya ocultación. Las cifras y observaciones son descripciones de información pública. Cualquier valoración legal corresponde a tribunales y autoridades competentes.</p>

      <h3>Lo que esta web SÍ afirma</h3>
      <p>Que los patrones descritos merecen explicación pública por parte de quienes ostentan o han ostentado cargos. La transparencia patrimonial es una obligación legal del cargo público.</p>
    </div>
  `;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
}

// Glosario
let GLOSARIO_LOADED = false;
async function cargarGlosario() {
  const c = document.getElementById('glosario-container');
  if (!c) return;
  if (!GLOSARIO_DATA) {
    try { GLOSARIO_DATA = await fetch('data/patrimonios/glosario.json').then(r => r.json()); }
    catch (e) { c.innerHTML = `<div class="error">Error: ${e.message}</div>`; return; }
  }
  renderGlosario();
}

function renderGlosario() {
  const c = document.getElementById('glosario-container');
  if (!c) return;
  const cats = [...new Set(GLOSARIO_DATA.terminos.map(t => t.categoria))];
  let h = `<div class="glosario-header"><h2>Glosario</h2>
    <p>Términos de política, fiscalidad y economía en lenguaje plano. El tono es ácido sobre el sistema legal que regula estas figuras, no sobre las personas que las utilizan. Todas las prácticas descritas son legales salvo que se indique lo contrario.</p></div>`;
  cats.forEach(cat => {
    h += `<section class="glosario-categoria"><h3>${cat}</h3>`;
    GLOSARIO_DATA.terminos.filter(t => t.categoria === cat).forEach(t => {
      h += `<article class="glosario-termino" id="termino-${t.id}"><h4>${t.termino}</h4><p>${t.definicion}</p></article>`;
    });
    h += '</section>';
  });
  c.innerHTML = h;
}

// ============================================================
// FILTROS PATRIMONIOS v2.9 (buscador + partidos)
// ============================================================

// Normaliza el campo partido (multipartido, sufijos como "(suspendido)") a una clave única
function partidoNormalizado(partidoStr) {
  if (!partidoStr) return 'otros';
  const s = partidoStr.toLowerCase();
  // Detección por orden de prioridad
  if (s.includes('psoe')) return 'psoe';
  if (s.includes('pp ') || s.startsWith('pp') || s === 'pp') return 'pp';
  if (s.includes('vox')) return 'vox';
  if (s.includes('podemos')) return 'podemos';
  if (s.includes('sumar') || s.includes('pce')) return 'sumar';
  if (s.includes('erc')) return 'erc';
  return 'otros';
}

const PARTIDO_INFO = {
  psoe: { label: 'PSOE', color: '#e74c3c' },
  pp: { label: 'PP', color: '#1e88e5' },
  vox: { label: 'Vox', color: '#5cbf3e' },
  podemos: { label: 'Podemos', color: '#8e44ad' },
  sumar: { label: 'Sumar/IU', color: '#e91e63' },
  erc: { label: 'ERC', color: '#f39c12' },
  otros: { label: 'Otros', color: '#888' }
};

// Estado de filtros: 'todos' o un partido concreto
let FILTRO_PARTIDO = 'todos';

function renderBotonesPartido() {
  // Cuenta políticos por partido
  const counts = {};
  POLITICOS_DATA.forEach(p => {
    const k = partidoNormalizado(p.partido);
    counts[k] = (counts[k] || 0) + 1;
  });
  let html = `<button class="filtro-partido-btn ${FILTRO_PARTIDO==='todos'?'activo':''}" onclick="filtrarPorPartido('todos')">Todos (${POLITICOS_DATA.length})</button>`;
  // Orden estable
  const orden = ['psoe', 'pp', 'vox', 'podemos', 'sumar', 'erc', 'otros'];
  orden.forEach(k => {
    if (!counts[k]) return;
    const info = PARTIDO_INFO[k];
    const activo = FILTRO_PARTIDO === k ? 'activo' : '';
    html += `<button class="filtro-partido-btn ${activo}" onclick="filtrarPorPartido('${k}')" style="--p-color:${info.color}">${info.label} (${counts[k]})</button>`;
  });
  return html;
}

function filtrarPorPartido(p) {
  FILTRO_PARTIDO = p;
  // Re-renderizar los botones para reflejar el estado activo
  const cont = document.getElementById('pat-filtros-partido');
  if (cont) cont.innerHTML = renderBotonesPartido();
  filtrarPatrimonios();
}

function filtrarPatrimonios() {
  const inputBusqueda = document.getElementById('pat-buscador');
  const query = inputBusqueda ? inputBusqueda.value.trim().toLowerCase() : '';
  const cards = document.querySelectorAll('.politico-card');
  let visibles = 0;
  cards.forEach(card => {
    const nombre = card.dataset.nombre || '';
    const partido = card.dataset.partido || '';
    const matchNombre = !query || nombre.includes(query);
    const matchPartido = FILTRO_PARTIDO === 'todos' || partido === FILTRO_PARTIDO;
    const visible = matchNombre && matchPartido;
    card.style.display = visible ? '' : 'none';
    if (visible) visibles++;
  });
  // Ocultar categorías vacías
  document.querySelectorAll('.categoria-bloque').forEach(bloque => {
    const cardsBloque = bloque.querySelectorAll('.politico-card');
    const visiblesBloque = [...cardsBloque].filter(c => c.style.display !== 'none').length;
    bloque.style.display = visiblesBloque > 0 ? '' : 'none';
  });
  // Contador
  const contador = document.getElementById('pat-filtros-contador');
  if (contador) {
    if (query || FILTRO_PARTIDO !== 'todos') {
      contador.textContent = `Mostrando ${visibles} de ${cards.length} políticos`;
      contador.style.display = '';
    } else {
      contador.style.display = 'none';
    }
  }
}
