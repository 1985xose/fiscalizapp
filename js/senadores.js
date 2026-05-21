// ============================================================================
// FiscalizApp — Sub-vista "Senadores XV"
// ============================================================================
// Renderiza los 264 senadores de la XV legislatura con sus declaraciones
// de bienes parseadas desde el endpoint XML del Senado.
//
// Estructura (sub-vista dentro de la pestaña Patrimonios):
//   1. Stat cards arriba (clickables, dinámicas, tooltips)
//   2. Buscador con normalización de acentos y multi-palabra AND
//   3. Filtros por grupo parlamentario
//   4. Toggle de ordenación: depósitos / inmuebles / deudas / rentas
//   5. Lista de tarjetas expandibles con detalle completo
// ============================================================================

(function() {
  var SENADORES = [];
  var FILTRO_PARTIDO = 'todos';
  var ORDEN = 'depositos';   // depositos | inmuebles | deudas | rentas | alfabetico
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

  function nInmuebles(s) {
    return (s.inmuebles_urbanos||[]).length + (s.inmuebles_rusticos||[]).length + (s.inmuebles_otros||[]).length;
  }

  function depositosOf(s) { return (s.depositos && s.depositos.total) || 0; }
  function rentasOf(s) { return (s.rentas && s.rentas.total_neto) || 0; }
  function deudasOf(s) { return (s.deudas && s.deudas.total_pendiente) || 0; }

  function buscableDe(s) {
    if (s._buscable) return s._buscable;
    var partes = [
      s.nombre, s.grupo, s.partido_norm, s.circunscripcion,
      s.apellidos, s.nombre_pila, s.estado_civil, s.ciudad_firma,
      (s.inmuebles_urbanos||[]).map(function(i){return (i.descripcion||'')+' '+(i.situacion||'');}).join(' '),
      (s.inmuebles_rusticos||[]).map(function(i){return (i.descripcion||'')+' '+(i.situacion||'');}).join(' '),
      (s.vehiculos||[]).map(function(v){return v.descripcion||'';}).join(' '),
      (s.rentas && s.rentas.detalle ? s.rentas.detalle.map(function(r){return (r.descripcion||'')+' '+(r.tipo||'');}).join(' ') : ''),
    ];
    s._buscable = normaliza(partes.filter(Boolean).join(' '));
    return s._buscable;
  }

  function aplicarFiltros(arr) {
    var f = arr.slice();
    if (FILTRO_PARTIDO !== 'todos') {
      f = f.filter(function(s){ return s.partido_norm === FILTRO_PARTIDO; });
    }
    if (SEARCH_TERMS.length > 0) {
      f = f.filter(function(s){
        var b = buscableDe(s);
        return SEARCH_TERMS.every(function(t){ return b.indexOf(t) !== -1; });
      });
    }
    // Ordenar
    var cmp;
    if (ORDEN === 'depositos') cmp = function(a,b){ return depositosOf(b) - depositosOf(a); };
    else if (ORDEN === 'inmuebles') cmp = function(a,b){ return nInmuebles(b) - nInmuebles(a); };
    else if (ORDEN === 'deudas') cmp = function(a,b){ return deudasOf(b) - deudasOf(a); };
    else if (ORDEN === 'rentas') cmp = function(a,b){ return rentasOf(b) - rentasOf(a); };
    else cmp = function(a,b){ return (a.nombre||'').localeCompare(b.nombre||''); };
    f.sort(cmp);
    return f;
  }

  function renderStats(visibles) {
    var total = SENADORES.length;
    var totalVis = visibles.length;
    var hayFiltro = FILTRO_PARTIDO !== 'todos' || SEARCH_TERMS.length > 0;

    var depAbs = SENADORES.reduce(function(s,x){ return s + depositosOf(x); }, 0);
    var depVis = visibles.reduce(function(s,x){ return s + depositosOf(x); }, 0);
    var inmVis = visibles.reduce(function(s,x){ return s + nInmuebles(x); }, 0);
    var deuVis = visibles.reduce(function(s,x){ return s + deudasOf(x); }, 0);

    var cards = [
      {
        action: 'reset',
        icon: '👥',
        value: hayFiltro ? (totalVis + ' / ' + total) : total,
        label: 'Senadores',
        sub: hayFiltro ? 'Pulsa para resetear' : 'XV Legislatura',
        title: 'Total de senadores de la XV Legislatura. Pulsa para limpiar todos los filtros.',
        activo: !hayFiltro
      },
      {
        action: 'depositos',
        icon: '💰',
        value: fmtMoney(depVis),
        label: 'Depósitos',
        sub: hayFiltro ? 'En este filtro' : 'Total declarado',
        title: 'Suma de depósitos en cuentas corrientes y ahorro declarados. Pulsa para ordenar por depósitos descendente.',
        activo: ORDEN === 'depositos'
      },
      {
        action: 'inmuebles',
        icon: '🏠',
        value: inmVis,
        label: 'Inmuebles',
        sub: hayFiltro ? 'En este filtro' : 'Urbanos + rústicos',
        title: 'Total de inmuebles declarados (urbanos + rústicos + otros). Pulsa para ordenar por nº de inmuebles.',
        activo: ORDEN === 'inmuebles'
      },
      {
        action: 'deudas',
        icon: '💸',
        value: fmtMoney(deuVis),
        label: 'Deudas',
        sub: hayFiltro ? 'En este filtro' : 'Pendientes',
        title: 'Suma de saldos pendientes de préstamos e hipotecas declarados. Pulsa para ordenar por deudas descendente.',
        activo: ORDEN === 'deudas'
      }
    ];

    var html = cards.map(function(c) {
      return '<div class="stat-card clickable' + (c.activo ? ' active' : '') + '" ' +
        'title="' + c.title.replace(/"/g,'&quot;') + '" ' +
        'onclick="window.senadoresStatAction(\'' + c.action + '\')">' +
        '<div class="stat-icon">' + c.icon + '</div>' +
        '<div class="stat-value">' + c.value + '</div>' +
        '<div class="stat-label">' + c.label + '</div>' +
        '<div class="stat-sublabel">' + c.sub + '</div>' +
      '</div>';
    }).join('');
    return html;
  }

  window.senadoresStatAction = function(action) {
    if (action === 'reset') {
      FILTRO_PARTIDO = 'todos';
      ORDEN = 'depositos';
      SEARCH_TERMS = [];
      var inp = document.getElementById('sen-search');
      if (inp) inp.value = '';
    } else if (action === 'depositos' || action === 'inmuebles' || action === 'deudas') {
      ORDEN = (ORDEN === action) ? 'alfabetico' : action;
    }
    renderAll();
  };

  function renderFiltros() {
    // Stats por partido sobre el dataset completo
    var counts = {};
    SENADORES.forEach(function(s){
      counts[s.partido_norm] = (counts[s.partido_norm] || 0) + 1;
    });
    // Orden por tamaño en el Senado (PP, PSOE primero) + nacionalistas + minoritarios
    var orden = ['PP','PSOE','PSC','Vox','EH Bildu','PSE-EE','PNV','ERC','Junts',
                 'PSdeG','AHI','UPN','BNG','CC','Compromís','Más Madrid','Geroa Bai','ASG','Indep.','Otros'];
    var html = '<button class="sen-filter-btn' + (FILTRO_PARTIDO === 'todos' ? ' active' : '') + '" data-partido="todos" onclick="window.senadoresFiltro(\'todos\')">Todos (' + SENADORES.length + ')</button>';
    orden.forEach(function(p) {
      if (!counts[p]) return;
      html += '<button class="sen-filter-btn' + (FILTRO_PARTIDO === p ? ' active' : '') + '" data-partido="' + p + '" onclick="window.senadoresFiltro(\'' + p + '\')">' + p + ' (' + counts[p] + ')</button>';
    });
    // Cualquier partido no incluido en el orden (defensa)
    Object.keys(counts).forEach(function(p){
      if (orden.indexOf(p) === -1) {
        html += '<button class="sen-filter-btn' + (FILTRO_PARTIDO === p ? ' active' : '') + '" data-partido="' + p + '" onclick="window.senadoresFiltro(\'' + p + '\')">' + p + ' (' + counts[p] + ')</button>';
      }
    });
    return html;
  }

  window.senadoresFiltro = function(p) {
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
      return '<button class="orden-btn' + (ORDEN===o.k?' active':'') + '" data-orden="' + o.k + '" onclick="window.senadoresOrden(\'' + o.k + '\')">' + o.l + '</button>';
    }).join('') + '</div>';
  }

  window.senadoresOrden = function(k) {
    ORDEN = k;
    renderAll();
  };

  function renderCardSenador(s, idx) {
    var cifra, label;
    if (ORDEN === 'inmuebles') {
      cifra = nInmuebles(s);
      label = 'inmuebles';
    } else if (ORDEN === 'deudas') {
      cifra = fmtMoneyFull(deudasOf(s));
      label = 'deudas pendientes';
    } else if (ORDEN === 'rentas') {
      cifra = fmtMoneyFull(rentasOf(s));
      label = 'rentas anuales';
    } else {
      cifra = fmtMoneyFull(depositosOf(s));
      label = 'en depósitos';
    }

    var circ = s.circunscripcion ? '<span>📍 ' + s.circunscripcion + '</span>' : '';
    var nInm = nInmuebles(s);
    var nVeh = (s.vehiculos||[]).length;
    var metas = '<span class="partido-badge">' + (s.partido_norm || '?') + '</span>' +
                circ +
                (nInm > 0 ? '<span>🏠 ' + nInm + '</span>' : '') +
                (nVeh > 0 ? '<span>🚗 ' + nVeh + '</span>' : '') +
                (deudasOf(s) > 0 ? '<span>💸 ' + fmtMoney(deudasOf(s)) + '</span>' : '');

    return '<article class="senador-card" data-partido="' + (s.partido_norm||'') + '" onclick="window.toggleSenador(this)">' +
      '<div class="senador-header">' +
        '<div class="senador-rank">#' + (idx+1) + '</div>' +
        '<div class="senador-info">' +
          '<h4>' + s.nombre + '</h4>' +
          '<div class="senador-meta">' + metas + '</div>' +
        '</div>' +
        '<div class="senador-cifra">' + cifra + '<span class="label">' + label + '</span></div>' +
      '</div>' +
      '<div class="senador-detalle">' + renderDetalle(s) + '</div>' +
    '</article>';
  }

  window.toggleSenador = function(card) {
    card.classList.toggle('expanded');
  };

  function renderDetalle(s) {
    var html = '';

    // Datos personales
    html += '<div class="det-bloque"><h5>Datos</h5><ul>';
    if (s.estado_civil) html += '<li>Estado civil: ' + s.estado_civil + '</li>';
    if (s.regimen_economico) html += '<li>Régimen económico: ' + s.regimen_economico + '</li>';
    if (s.motivo_declaracion) html += '<li>Motivo declaración: ' + s.motivo_declaracion + '</li>';
    if (s.ciudad_firma) html += '<li>Ciudad firma: ' + s.ciudad_firma + '</li>';
    if (s.fecha_eleccion) html += '<li>Fecha elección: ' + s.fecha_eleccion + '</li>';
    html += '</ul></div>';

    // Rentas
    var rentas = s.rentas || {};
    if (rentas.total_neto > 0 || (rentas.detalle && rentas.detalle.length > 0)) {
      html += '<div class="det-bloque"><h5>💼 Rentas anuales — Total: <span class="det-num">' + fmtMoneyFull(rentas.total_neto) + '</span></h5>';
      if (s.irpf) html += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">IRPF pagado: ' + fmtMoneyFull(s.irpf) + '</div>';
      if (rentas.detalle && rentas.detalle.length > 0) {
        html += '<ul>';
        rentas.detalle.forEach(function(r) {
          if (!r.descripcion && !r.valor) return;
          html += '<li>';
          if (r.valor) html += '<span class="det-num">' + fmtMoneyFull(r.valor) + '</span> · ';
          if (r.descripcion) html += r.descripcion;
          if (r.tipo) html += ' <em style="color:var(--text-muted);font-size:11px">[' + r.tipo.substring(0,60) + ']</em>';
          html += '</li>';
        });
        html += '</ul>';
      }
      html += '</div>';
    }

    // Inmuebles urbanos
    if ((s.inmuebles_urbanos||[]).length > 0) {
      html += '<div class="det-bloque"><h5>🏢 Inmuebles urbanos (' + s.inmuebles_urbanos.length + ')</h5><ul>';
      s.inmuebles_urbanos.forEach(function(i) {
        html += '<li><strong>' + (i.descripcion||'?') + '</strong>';
        if (i.situacion) html += ' · 📍 ' + i.situacion;
        if (i.derecho) html += ' · ' + i.derecho;
        if (i.fecha) html += ' <em style="color:var(--text-muted);font-size:11px">(' + i.fecha + ')</em>';
        html += '</li>';
      });
      html += '</ul></div>';
    }

    // Inmuebles rústicos
    if ((s.inmuebles_rusticos||[]).length > 0) {
      html += '<div class="det-bloque"><h5>🌾 Inmuebles rústicos (' + s.inmuebles_rusticos.length + ')</h5><ul>';
      s.inmuebles_rusticos.forEach(function(i) {
        html += '<li><strong>' + (i.descripcion||'?') + '</strong>';
        if (i.situacion) html += ' · 📍 ' + i.situacion;
        if (i.derecho) html += ' · ' + i.derecho;
        if (i.fecha) html += ' <em style="color:var(--text-muted);font-size:11px">(' + i.fecha + ')</em>';
        html += '</li>';
      });
      html += '</ul></div>';
    }

    // Inmuebles otros (sociedades, etc.)
    if ((s.inmuebles_otros||[]).length > 0) {
      html += '<div class="det-bloque"><h5>🏛️ Inmuebles de sociedades participadas (' + s.inmuebles_otros.length + ')</h5><ul>';
      s.inmuebles_otros.forEach(function(i) {
        html += '<li>' + (i.descripcion||'?');
        if (i.situacion) html += ' · 📍 ' + i.situacion;
        html += '</li>';
      });
      html += '</ul></div>';
    }

    // Depósitos
    if (s.depositos && (s.depositos.total > 0 || (s.depositos.detalle||[]).length > 0)) {
      html += '<div class="det-bloque"><h5>💰 Depósitos — Total: <span class="det-num">' + fmtMoneyFull(s.depositos.total) + '</span></h5>';
      if ((s.depositos.detalle||[]).length > 0) {
        html += '<ul>';
        s.depositos.detalle.forEach(function(d) {
          html += '<li>' + (d.descripcion||'?');
          if (d.valor) html += ' · <span class="det-num">' + fmtMoneyFull(d.valor) + '</span>';
          html += '</li>';
        });
        html += '</ul>';
      }
      html += '</div>';
    }

    // Valores (bonos, fondos, dividendos)
    if ((s.valores||[]).length > 0) {
      html += '<div class="det-bloque"><h5>📊 Otros bienes y valores (' + s.valores.length + ')</h5><ul>';
      s.valores.forEach(function(v) {
        html += '<li>' + (v.descripcion||'?');
        if (v.valor) html += ' · <span class="det-num">' + fmtMoneyFull(v.valor) + '</span>';
        if (v.tipo) html += ' <em style="color:var(--text-muted);font-size:11px">[' + v.tipo.substring(0,50) + ']</em>';
        html += '</li>';
      });
      html += '</ul></div>';
    }

    // Vehículos
    if ((s.vehiculos||[]).length > 0) {
      html += '<div class="det-bloque"><h5>🚗 Vehículos (' + s.vehiculos.length + ')</h5><ul>';
      s.vehiculos.forEach(function(v) {
        html += '<li>' + (v.descripcion||'?');
        if (v.fecha) html += ' <em style="color:var(--text-muted);font-size:11px">(' + v.fecha + ')</em>';
        html += '</li>';
      });
      html += '</ul></div>';
    }

    // Deudas
    if (s.deudas && (s.deudas.total_pendiente > 0 || (s.deudas.detalle||[]).length > 0)) {
      html += '<div class="det-bloque"><h5>💸 Deudas — Pendiente: <span class="det-num">' + fmtMoneyFull(s.deudas.total_pendiente) + '</span></h5>';
      if ((s.deudas.detalle||[]).length > 0) {
        html += '<ul>';
        s.deudas.detalle.forEach(function(d) {
          html += '<li>' + (d.descripcion||'?');
          if (d.saldo_pendiente) html += ' · pendiente <span class="det-num">' + fmtMoneyFull(d.saldo_pendiente) + '</span>';
          if (d.valor_original) html += ' (original: ' + fmtMoneyFull(d.valor_original) + ')';
          if (d.tipo) html += ' <em style="color:var(--text-muted);font-size:11px">[' + d.tipo.substring(0,40) + ']</em>';
          html += '</li>';
        });
        html += '</ul>';
      }
      html += '</div>';
    }

    // Observaciones
    if (s.observaciones) {
      html += '<div class="det-bloque"><h5>📝 Observaciones</h5><div style="font-style:italic">' + s.observaciones + '</div></div>';
    }

    // Enlaces oficiales
    html += '<div class="det-bloque"><h5>🔗 Enlaces oficiales</h5><ul>';
    if (s.url_ficha) html += '<li><a href="' + s.url_ficha + '" target="_blank" style="color:#2a9d8f">Ficha del Senado</a></li>';
    if (s.url_bienes) html += '<li><a href="' + s.url_bienes + '" target="_blank" style="color:#2a9d8f">XML declaración bienes</a></li>';
    if (s.url_intereses) html += '<li><a href="' + s.url_intereses + '" target="_blank" style="color:#2a9d8f">XML declaración intereses</a></li>';
    html += '</ul></div>';

    return html;
  }

  function renderAll() {
    var visibles = aplicarFiltros(SENADORES);
    var container = document.getElementById('senadores-container');
    if (!container) return;

    // ¿Ya está pintado el shell? Si sí, solo actualizamos stats + lista + active states
    var shellListo = !!document.getElementById('sen-shell');

    if (!shellListo) {
      // Pintar todo el shell (la primera vez)
      var html = '<div id="sen-shell">' +
        '<div class="patrimonio-header">' +
          '<h2>🏛️ Senadores XV Legislatura</h2>' +
          '<p class="pat-intro">Datos extraídos del endpoint público de declaraciones del Senado ' +
          '(<code style="font-size:12px">expedientxmlclobservlet</code>). ' +
          '<strong>264 senadores</strong>, declaración inicial al inicio de la XV Legislatura. ' +
          'Los datos reflejan lo declarado por cada senador, no incluyen valoración catastral de inmuebles.</p>' +
        '</div>' +
        '<div class="stats" id="sen-stats"></div>' +
        '<div class="filtros-pat">' +
          '<input type="text" id="sen-search" class="pat-buscador-input" placeholder="🔍 Buscar nombre, partido, circunscripción, descripción..." oninput="window.senadoresBuscar(this.value)" />' +
          '<div class="senado-filtros" id="sen-filtros"></div>' +
          '<div id="sen-orden-toggle"></div>' +
          '<div class="pat-filtros-contador" id="sen-contador" style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);margin-top:0.5rem"></div>' +
        '</div>' +
        '<div id="sen-lista"></div>' +
      '</div>';
      container.innerHTML = html;
      // Pintar la parte estable (filtros y toggle) una sola vez
      document.getElementById('sen-filtros').innerHTML = renderFiltros();
      document.getElementById('sen-orden-toggle').innerHTML = renderOrdenToggle();
    } else {
      // Refrescar SOLO el 'active' de filtros y toggle sin destruir el DOM
      document.querySelectorAll('#sen-filtros .sen-filter-btn').forEach(function(b){
        b.classList.toggle('active', b.dataset.partido === FILTRO_PARTIDO);
      });
      document.querySelectorAll('#sen-orden-toggle .orden-btn').forEach(function(b){
        b.classList.toggle('active', b.dataset.orden === ORDEN);
      });
    }

    // Actualizar stats (siempre)
    document.getElementById('sen-stats').innerHTML = renderStats(visibles);
    // Actualizar contador
    document.getElementById('sen-contador').textContent = 'Mostrando ' + visibles.length + ' de ' + SENADORES.length + ' senadores';
    // Actualizar lista
    var lista = document.getElementById('sen-lista');
    if (visibles.length === 0) {
      lista.innerHTML = '<div class="section-placeholder"><h3>Sin resultados</h3><p>No se encontraron senadores con esos filtros.</p></div>';
    } else {
      var top = visibles.slice(0, 100);
      var listHtml = top.map(function(s, i){ return renderCardSenador(s, i); }).join('');
      if (visibles.length > 100) {
        listHtml += '<div style="text-align:center;padding:1rem"><button onclick="window.senadoresVerTodos()" style="background:var(--bg-card);border:1px solid var(--accent-red);color:var(--text-primary);padding:10px 20px;font-family:var(--font-mono);cursor:pointer">Mostrar todos (' + visibles.length + ')</button></div>';
      }
      lista.innerHTML = listHtml;
    }
  }

  window.senadoresVerTodos = function() {
    var visibles = aplicarFiltros(SENADORES);
    var lista = document.getElementById('sen-lista');
    if (!lista) return;
    lista.innerHTML = visibles.map(function(s,i){ return renderCardSenador(s,i); }).join('');
  };

  window.senadoresBuscar = function(q) {
    var qNorm = normaliza(q);
    SEARCH_TERMS = qNorm.split(/\s+/).filter(function(t){return t.length>0;});
    renderAll();
  };

  window.renderSenadoresXV = function() {
    if (YA_CARGADO) {
      renderAll();
      return;
    }
    var container = document.getElementById('senadores-container');
    container.innerHTML = '<div class="section-placeholder"><h3>⏳ Cargando 264 senadores…</h3></div>';
    fetch('data/senadores_xv.json')
      .then(function(r){ return r.json(); })
      .then(function(d){
        SENADORES = d.senadores || [];
        YA_CARGADO = true;
        renderAll();
      })
      .catch(function(e){
        container.innerHTML = '<div class="section-placeholder"><h3>Error cargando senadores</h3><p>' + e.message + '</p></div>';
      });
  };
})();
