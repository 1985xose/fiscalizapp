// ============================================================================
// FiscalizApp — Sub-vista "Congresistas XV"
// ============================================================================
// Renderiza los 339 diputados de la XV Legislatura con sus declaraciones de
// bienes extraídas por OCR del BOCG-15-D-10.
//
// Estructura paralela a senadores.js (mismo patrón de stat cards, búsqueda,
// filtros y orden) — los datos vienen del OCR del PDF del Congreso.
// ============================================================================

(function() {
  var DIPUTADOS = [];
  var FILTRO_PARTIDO = 'todos';
  var ORDEN = 'depositos';
  var SEARCH_TERMS = [];
  var YA_CARGADO = false;

  function normaliza(s) {
    if (s == null) return '';
    return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function fmtMoney(v) {
    if (v == null || v === 0) return '—';
    if (v >= 1e6) return (v/1e6).toFixed(1).replace('.0','') + 'M €';
    if (v >= 1e3) return Math.round(v/1e3) + 'K €';
    return Math.round(v) + ' €';
  }

  function fmtMoneyFull(v) {
    if (v == null) return '—';
    return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(v) + ' €';
  }

  function buscableDe(d) {
    if (d._buscable) return d._buscable;
    var partes = [
      d.nombre_completo, d.apellidos, d.nombre, d.grupo, d.partido_norm, d.estado_civil
    ];
    d._buscable = normaliza(partes.filter(Boolean).join(' '));
    return d._buscable;
  }

  function aplicarFiltros(arr) {
    var f = arr.slice();
    if (FILTRO_PARTIDO !== 'todos') {
      f = f.filter(function(d){ return d.partido_norm === FILTRO_PARTIDO; });
    }
    if (SEARCH_TERMS.length > 0) {
      f = f.filter(function(d){
        var b = buscableDe(d);
        return SEARCH_TERMS.every(function(t){ return b.indexOf(t) !== -1; });
      });
    }
    var cmp;
    if (ORDEN === 'depositos')      cmp = function(a,b){ return (b.depositos_total||0) - (a.depositos_total||0); };
    else if (ORDEN === 'inmuebles') cmp = function(a,b){ return (b.inmuebles_total||0) - (a.inmuebles_total||0); };
    else if (ORDEN === 'deudas')    cmp = function(a,b){ return (b.deudas_total||0) - (a.deudas_total||0); };
    else if (ORDEN === 'rentas')    cmp = function(a,b){ return (b.rentas_total||0) - (a.rentas_total||0); };
    else cmp = function(a,b){ return (a.apellidos||'').localeCompare(b.apellidos||''); };
    f.sort(cmp);
    return f;
  }

  function renderStats(visibles) {
    var total = DIPUTADOS.length;
    var totalVis = visibles.length;
    var hayFiltro = FILTRO_PARTIDO !== 'todos' || SEARCH_TERMS.length > 0;

    var depVis = visibles.reduce(function(s,x){ return s + (x.depositos_total||0); }, 0);
    var inmVis = visibles.reduce(function(s,x){ return s + (x.inmuebles_total||0); }, 0);
    var deuVis = visibles.reduce(function(s,x){ return s + (x.deudas_total||0); }, 0);

    var cards = [
      { action: 'reset',     icon: '👥', value: hayFiltro ? (totalVis + ' / ' + total) : total,
        label: 'Diputados', sub: hayFiltro ? 'Pulsa para resetear' : 'XV Legislatura',
        title: 'Total de diputados de la XV Legislatura. Pulsa para limpiar filtros.',
        activo: !hayFiltro },
      { action: 'depositos', icon: '💰', value: fmtMoney(depVis),
        label: 'Depósitos', sub: hayFiltro ? 'En este filtro' : 'Total declarado',
        title: 'Suma de depósitos en cuentas. Pulsa para ordenar por depósitos.',
        activo: ORDEN === 'depositos' },
      { action: 'inmuebles', icon: '🏠', value: inmVis,
        label: 'Inmuebles', sub: hayFiltro ? 'En este filtro' : 'Urbanos + rústicos',
        title: 'Total de inmuebles detectados (OCR). Pulsa para ordenar.',
        activo: ORDEN === 'inmuebles' },
      { action: 'deudas',    icon: '💸', value: fmtMoney(deuVis),
        label: 'Deudas', sub: hayFiltro ? 'En este filtro' : 'Pendientes',
        title: 'Suma de saldos pendientes. Pulsa para ordenar por deudas.',
        activo: ORDEN === 'deudas' }
    ];

    return cards.map(function(c) {
      return '<div class="stat-card clickable' + (c.activo ? ' active' : '') + '" ' +
        'title="' + c.title.replace(/"/g,'&quot;') + '" ' +
        'onclick="window.congresistasStatAction(\'' + c.action + '\')">' +
        '<div class="stat-icon">' + c.icon + '</div>' +
        '<div class="stat-value">' + c.value + '</div>' +
        '<div class="stat-label">' + c.label + '</div>' +
        '<div class="stat-sublabel">' + c.sub + '</div>' +
      '</div>';
    }).join('');
  }

  window.congresistasStatAction = function(action) {
    if (action === 'reset') {
      FILTRO_PARTIDO = 'todos';
      ORDEN = 'depositos';
      SEARCH_TERMS = [];
      var inp = document.getElementById('cong-search');
      if (inp) inp.value = '';
    } else if (action === 'depositos' || action === 'inmuebles' || action === 'deudas') {
      ORDEN = (ORDEN === action) ? 'alfabetico' : action;
    }
    renderAll();
  };

  function renderFiltros() {
    var counts = {};
    DIPUTADOS.forEach(function(d){
      counts[d.partido_norm] = (counts[d.partido_norm] || 0) + 1;
    });
    var orden = ['PP','PSOE','Vox','Sumar','ERC','Junts','EH Bildu','PNV','Mixto','Otros'];
    var html = '<button class="sen-filter-btn' + (FILTRO_PARTIDO === 'todos' ? ' active' : '') + '" data-partido="todos" onclick="window.congresistasFiltro(\'todos\')">Todos (' + DIPUTADOS.length + ')</button>';
    orden.forEach(function(p) {
      if (!counts[p]) return;
      html += '<button class="sen-filter-btn' + (FILTRO_PARTIDO === p ? ' active' : '') + '" data-partido="' + p + '" onclick="window.congresistasFiltro(\'' + p + '\')">' + p + ' (' + counts[p] + ')</button>';
    });
    return html;
  }

  window.congresistasFiltro = function(p) {
    FILTRO_PARTIDO = p;
    renderAll();
  };

  function renderOrdenToggle() {
    var opts = [
      {k:'depositos', l:'💰 Depósitos'},
      {k:'inmuebles', l:'🏠 Inmuebles'},
      {k:'deudas',    l:'💸 Deudas'},
      {k:'rentas',    l:'📈 Rentas'},
      {k:'alfabetico',l:'🔤 A-Z'}
    ];
    return '<div class="senado-orden-toggle">' + opts.map(function(o){
      return '<button class="orden-btn' + (ORDEN===o.k?' active':'') + '" data-orden="' + o.k + '" onclick="window.congresistasOrden(\'' + o.k + '\')">' + o.l + '</button>';
    }).join('') + '</div>';
  }

  window.congresistasOrden = function(k) {
    ORDEN = k;
    renderAll();
  };

  function renderCard(d, idx) {
    var cifra, label;
    if (ORDEN === 'inmuebles')   { cifra = d.inmuebles_total || 0; label = 'inmuebles'; }
    else if (ORDEN === 'deudas') { cifra = fmtMoneyFull(d.deudas_total); label = 'deudas pendientes'; }
    else if (ORDEN === 'rentas') { cifra = fmtMoneyFull(d.rentas_total); label = 'rentas anuales'; }
    else                         { cifra = fmtMoneyFull(d.depositos_total); label = 'en depósitos'; }

    var nInm = d.inmuebles_total || 0;
    var nVeh = d.vehiculos_n || 0;
    var metas = '<span class="partido-badge">' + (d.partido_norm || '?') + '</span>' +
                (nInm > 0 ? '<span>🏠 ' + nInm + '</span>' : '') +
                (nVeh > 0 ? '<span>🚗 ' + nVeh + '</span>' : '') +
                ((d.deudas_total||0) > 0 ? '<span>💸 ' + fmtMoney(d.deudas_total) + '</span>' : '') +
                (d.es_modificacion ? '<span style="color:#e9c46a">🔄 modificación</span>' : '');

    return '<article class="senador-card" data-partido="' + (d.partido_norm||'') + '" onclick="window.toggleCongresista(this)">' +
      '<div class="senador-header">' +
        '<div class="senador-rank">#' + (idx+1) + '</div>' +
        '<div class="senador-info">' +
          '<h4>' + (d.nombre_completo || (d.apellidos + ', ' + d.nombre)) + '</h4>' +
          '<div class="senador-meta">' + metas + '</div>' +
        '</div>' +
        '<div class="senador-cifra">' + cifra + '<span class="label">' + label + '</span></div>' +
      '</div>' +
      '<div class="senador-detalle">' + renderDetalle(d) + '</div>' +
    '</article>';
  }

  window.toggleCongresista = function(card) {
    card.classList.toggle('expanded');
  };

  function renderDetalle(d) {
    var html = '';

    // Datos personales
    html += '<div class="det-bloque"><h5>Datos</h5><ul>';
    if (d.apellidos) html += '<li>Apellidos: ' + d.apellidos + '</li>';
    if (d.nombre) html += '<li>Nombre: ' + d.nombre + '</li>';
    if (d.grupo) html += '<li>Grupo parlamentario: ' + d.grupo + ' → ' + d.partido_norm + '</li>';
    if (d.estado_civil) html += '<li>Estado civil: ' + d.estado_civil + '</li>';
    if (d.expediente_bienes) html += '<li>Expediente bienes: ' + d.expediente_bienes + '</li>';
    if (d.pagina_bienes_inicio) html += '<li>Páginas BOCG: ' + d.pagina_bienes_inicio + '-' + d.pagina_bienes_fin + '</li>';
    html += '</ul></div>';

    // Rentas
    if (d.rentas_total > 0 || d.irpf) {
      html += '<div class="det-bloque"><h5>💼 Rentas anuales</h5><ul>';
      if (d.rentas_total > 0) html += '<li>Total rentas declaradas: <span class="det-num">' + fmtMoneyFull(d.rentas_total) + '</span></li>';
      if (d.irpf) html += '<li>IRPF pagado: <span class="det-num">' + fmtMoneyFull(d.irpf) + '</span></li>';
      html += '</ul></div>';
    }

    // Inmuebles
    if (d.inmuebles_total > 0) {
      html += '<div class="det-bloque"><h5>🏠 Inmuebles (' + d.inmuebles_total + ')</h5><ul>';
      if (d.inmuebles_urbanos_n > 0) html += '<li>Urbanos: <span class="det-num">' + d.inmuebles_urbanos_n + '</span></li>';
      if (d.inmuebles_rusticos_n > 0) html += '<li>Rústicos: <span class="det-num">' + d.inmuebles_rusticos_n + '</span></li>';
      html += '</ul></div>';
    }

    // Depósitos
    if (d.depositos_total > 0) {
      html += '<div class="det-bloque"><h5>💰 Depósitos en cuentas</h5><div class="det-num">' + fmtMoneyFull(d.depositos_total) + '</div></div>';
    }

    if (d.otros_bienes_total > 0) {
      html += '<div class="det-bloque"><h5>📊 Otros bienes/valores</h5><div class="det-num">' + fmtMoneyFull(d.otros_bienes_total) + '</div></div>';
    }

    if (d.vehiculos_n > 0) {
      html += '<div class="det-bloque"><h5>🚗 Vehículos</h5><div>' + d.vehiculos_n + ' vehículo(s) detectado(s)</div></div>';
    }

    if (d.deudas_total > 0) {
      html += '<div class="det-bloque"><h5>💸 Deudas pendientes</h5><div class="det-num">' + fmtMoneyFull(d.deudas_total) + '</div></div>';
    }

    if (d.es_modificacion) {
      html += '<div class="det-bloque"><h5>🔄 Declaración modificada</h5><div>Esta declaración es una modificación posterior (versión ' + (d.n_declaraciones_publicadas) + ' de ' + (d.n_declaraciones_publicadas) + ').</div></div>';
    }

    // Nota OCR
    html += '<div class="det-bloque" style="font-size:11px;color:var(--text-muted);font-style:italic">' +
      'Datos extraídos por OCR del BOCG-15-D-10. Las cifras agregadas pueden contener errores menores. ' +
      'Páginas del BOCG: ' + (d.pagina_bienes_inicio || '?') + '-' + (d.pagina_bienes_fin || '?') + '. ' +
      '<a href="https://www.congreso.es/public_oficiales/L15/CONG/BOCG/D/BOCG-15-D-10.PDF" target="_blank" style="color:#2a9d8f">Ver PDF oficial</a>.' +
      '</div>';

    return html;
  }

  function renderAll() {
    var visibles = aplicarFiltros(DIPUTADOS);
    var container = document.getElementById('congresistas-container');
    if (!container) return;

    var shellListo = !!document.getElementById('cong-shell');

    if (!shellListo) {
      var html = '<div id="cong-shell">' +
        '<div class="patrimonio-header">' +
          '<h2>🏛️ Congresistas XV Legislatura</h2>' +
          '<p class="pat-intro">Datos extraídos por OCR del <a href="https://www.congreso.es/public_oficiales/L15/CONG/BOCG/D/BOCG-15-D-10.PDF" target="_blank" style="color:#2a9d8f">BOCG-15-D-10</a> (Boletín Oficial del Congreso, 15/09/2023). ' +
          '<strong>339 diputados</strong> con declaración de bienes inicial. ' +
          'Las cifras son aproximaciones agregadas: las exactas requieren consultar el PDF original. ' +
          'Los nombres, grupos parlamentarios y números de expediente vienen del índice del propio BOCG (texto puro).</p>' +
        '</div>' +
        '<div class="stats" id="cong-stats"></div>' +
        '<div class="filtros-pat">' +
          '<input type="text" id="cong-search" class="pat-buscador-input" placeholder="🔍 Buscar nombre, partido..." oninput="window.congresistasBuscar(this.value)" />' +
          '<div class="senado-filtros" id="cong-filtros"></div>' +
          '<div id="cong-orden-toggle"></div>' +
          '<div class="pat-filtros-contador" id="cong-contador" style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);margin-top:0.5rem"></div>' +
        '</div>' +
        '<div id="cong-lista"></div>' +
      '</div>';
      container.innerHTML = html;
      document.getElementById('cong-filtros').innerHTML = renderFiltros();
      document.getElementById('cong-orden-toggle').innerHTML = renderOrdenToggle();
    } else {
      document.querySelectorAll('#cong-filtros .sen-filter-btn').forEach(function(b){
        b.classList.toggle('active', b.dataset.partido === FILTRO_PARTIDO);
      });
      document.querySelectorAll('#cong-orden-toggle .orden-btn').forEach(function(b){
        b.classList.toggle('active', b.dataset.orden === ORDEN);
      });
    }

    document.getElementById('cong-stats').innerHTML = renderStats(visibles);
    document.getElementById('cong-contador').textContent = 'Mostrando ' + visibles.length + ' de ' + DIPUTADOS.length + ' diputados';
    var lista = document.getElementById('cong-lista');
    if (visibles.length === 0) {
      lista.innerHTML = '<div class="section-placeholder"><h3>Sin resultados</h3><p>No se encontraron diputados con esos filtros.</p></div>';
    } else {
      var top = visibles.slice(0, 100);
      var listHtml = top.map(function(d, i){ return renderCard(d, i); }).join('');
      if (visibles.length > 100) {
        listHtml += '<div style="text-align:center;padding:1rem"><button onclick="window.congresistasVerTodos()" style="background:var(--bg-card);border:1px solid var(--accent-red);color:var(--text-primary);padding:10px 20px;font-family:var(--font-mono);cursor:pointer">Mostrar todos (' + visibles.length + ')</button></div>';
      }
      lista.innerHTML = listHtml;
    }
  }

  window.congresistasVerTodos = function() {
    var visibles = aplicarFiltros(DIPUTADOS);
    var lista = document.getElementById('cong-lista');
    if (!lista) return;
    lista.innerHTML = visibles.map(function(d,i){ return renderCard(d,i); }).join('');
  };

  window.congresistasBuscar = function(q) {
    SEARCH_TERMS = normaliza(q).split(/\s+/).filter(function(t){return t.length>0;});
    renderAll();
  };

  window.renderCongresistasXV = function() {
    if (YA_CARGADO) { renderAll(); return; }
    var container = document.getElementById('congresistas-container');
    container.innerHTML = '<div class="section-placeholder"><h3>⏳ Cargando 339 diputados...</h3></div>';
    fetch('data/congreso_xv.json')
      .then(function(r){ return r.json(); })
      .then(function(d){
        DIPUTADOS = d.diputados || [];
        YA_CARGADO = true;
        renderAll();
      })
      .catch(function(e){
        container.innerHTML = '<div class="section-placeholder"><h3>Error cargando diputados</h3><p>' + e.message + '</p></div>';
      });
  };
})();
