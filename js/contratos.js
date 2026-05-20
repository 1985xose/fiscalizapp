/*
 * FiscalizApp — Contratos públicos y banderas rojas v4
 * 6 tipos de flag | Stats clickables | Buscador | Órgano/empresa destacados
 */
var FLAG_TIPOS = {
  fraccionamiento: { label: "Fraccionamiento", icon: "✂️", explica: "3+ contratos mismo proveedor/órgano justo bajo el umbral de licitación" },
  concentracion: { label: "Concentración extrema", icon: "🎯", explica: "80%+ de contratos de un órgano al mismo proveedor (mín. 5)" },
  patron_umbral: { label: "Patrón de umbral", icon: "📊", explica: ">40% de contratos de un órgano justo bajo el límite legal" },
  omnipresente: { label: "Omnipresente", icon: "👁️", explica: "Mismo proveedor en 3+ administraciones cerca del umbral" },
  negociado_reiterado: { label: "Negociado reiterado", icon: "🤝", explica: "3+ contratos sin licitación pública al mismo proveedor — adjudicación a dedo" },
  umbral_europeo: { label: "Umbral europeo", icon: "🇪🇺", explica: "Contratos justo bajo el umbral UE ~140K€ para evitar supervisión europea" },
};

var allFlags = [];
var currentFilter = "todos";
var contractSearchQuery = "";
var contractSearchTerms = [];

// Normaliza tildes y ñ para que "andalucia" encuentre "Andalucía", "cadiz" encuentre "Cádiz", etc.
function normalizarBusquedaContratos(s) {
  if (s == null) return "";
  return String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function fmtMoney(n) {
  if (!n) return "—";
  return n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

window.searchContracts = function(query) {
  contractSearchQuery = normalizarBusquedaContratos(query);
  contractSearchTerms = contractSearchQuery.split(/\s+/).filter(function(p){ return p.length > 0; });
  window.renderFlags();
};

window.setFilter = function(filter) {
  currentFilter = filter;
  window.renderFlags();
};

// Diccionario de etiquetas + tooltips por filtro
var FILTER_META = {
  todos: { tooltip: "Todas las banderas rojas detectadas. Pulsa cualquier otra para filtrar por tipo." },
  alta:  { tooltip: "Banderas de severidad alta: patrones muy difíciles de justificar como contratación regular." },
  media: { tooltip: "Banderas de severidad media: anomalías estadísticas que merecen mirada atenta." },
  fraccionamiento: { tooltip: "Varios contratos seguidos al mismo proveedor por importes justo bajo el umbral, evitando licitación pública." },
  concentracion: { tooltip: "Una entidad concentra una parte desproporcionada de los contratos de un órgano." },
  negociado_reiterado: { tooltip: "3+ contratos sin licitación pública al mismo proveedor. Adjudicación a dedo reiterada." },
  umbral_europeo: { tooltip: "Contratos justo por debajo del umbral europeo (~140K€) para evitar supervisión UE." }
};

// Construye una stat card con el patrón unificado (clickable, tooltip, active)
function contractStatCard(icon, val, label, filter, sublabel) {
  var meta = FILTER_META[filter] || {};
  var isActive = currentFilter === filter;
  var title = (meta.tooltip || "") + (isActive ? " (filtro activo)" : "");
  return '<div class="stat-card clickable' + (isActive ? ' active' : '') + '" ' +
    'data-filter="' + filter + '" ' +
    'title="' + title.replace(/"/g, '&quot;') + '" ' +
    'onclick="window.setFilter(\'' + filter + '\')">' +
    '<div class="stat-icon">' + icon + '</div>' +
    '<div class="stat-value">' + val + '</div>' +
    '<div class="stat-label">' + label + '</div>' +
    (sublabel ? '<div class="stat-sublabel">' + sublabel + '</div>' : '') +
    '</div>';
}
function contractInfoCard(icon, val, label, title) {
  return '<div class="stat-card" title="' + (title||'').replace(/"/g, '&quot;') + '">' +
    '<div class="stat-icon">' + icon + '</div>' +
    '<div class="stat-value">' + val + '</div>' +
    '<div class="stat-label">' + label + '</div></div>';
}

// Pinta o repinta las 7 stats de contratos. Si hay filtro activo, se recalculan los totales
// desde el subconjunto filtrado para que la card "Banderas rojas" muestre el total visible.
function renderContractStats(allFlagsLocal, statsMeta, fmeta) {
  var statsContainer = document.getElementById("contract-stats");
  if (!statsContainer) return;

  // Si hay filtro activo o búsqueda, las cifras de la card "todos" muestran "X / Y"
  var hayFiltro = currentFilter !== "todos" || contractSearchTerms.length > 0;
  var totalFlags = statsMeta.total_flags || allFlagsLocal.length;
  var tc = statsMeta.por_tipo || {};
  var totalAltaAbs = statsMeta.severidad_alta || 0;
  var totalMediaAbs = (statsMeta.severidad_media != null) ? statsMeta.severidad_media : (totalFlags - totalAltaAbs);

  // Recalcula desde el conjunto visible (filtrado por currentFilter + search)
  var visible = filtrarFlagsActual(allFlagsLocal);
  var visibleAlta = visible.filter(function(f){return f.severidad==='alta';}).length;
  var visibleTipo = {};
  visible.forEach(function(f){ visibleTipo[f.tipo] = (visibleTipo[f.tipo]||0) + 1; });

  var html = "";
  html += contractInfoCard("📋", (fmeta.menores||0)+(fmeta.licitaciones||0), "Analizados",
    "Total de contratos descargados de la PLACSP y procesados por los detectores.");
  html += contractStatCard("🚩",
    hayFiltro ? (visible.length + " / " + totalFlags) : totalFlags,
    "Banderas rojas", "todos",
    hayFiltro ? "Pulsa para ver todas" : "Pulsa para resetear");
  html += contractStatCard("🔴",
    hayFiltro ? (visibleAlta + " / " + totalAltaAbs) : totalAltaAbs,
    "Sev. alta", "alta",
    currentFilter === "alta" ? "Filtro activo" : "Pulsa para filtrar");
  html += contractStatCard("✂️",
    hayFiltro ? ((visibleTipo.fraccionamiento||0) + " / " + (tc.fraccionamiento||0)) : (tc.fraccionamiento||0),
    "Fraccionamiento", "fraccionamiento",
    currentFilter === "fraccionamiento" ? "Filtro activo" : "Pulsa para filtrar");
  html += contractStatCard("🎯",
    hayFiltro ? ((visibleTipo.concentracion||0) + " / " + (tc.concentracion||0)) : (tc.concentracion||0),
    "Concentración", "concentracion",
    currentFilter === "concentracion" ? "Filtro activo" : "Pulsa para filtrar");
  html += contractStatCard("🤝",
    hayFiltro ? ((visibleTipo.negociado_reiterado||0) + " / " + (tc.negociado_reiterado||0)) : (tc.negociado_reiterado||0),
    "Negociado", "negociado_reiterado",
    currentFilter === "negociado_reiterado" ? "Filtro activo" : "Pulsa para filtrar");
  html += contractStatCard("🇪🇺",
    hayFiltro ? ((visibleTipo.umbral_europeo||0) + " / " + (tc.umbral_europeo||0)) : (tc.umbral_europeo||0),
    "Umbral UE", "umbral_europeo",
    currentFilter === "umbral_europeo" ? "Filtro activo" : "Pulsa para filtrar");
  statsContainer.innerHTML = html;
}

// Calcula el subconjunto visible según currentFilter + contractSearchTerms
function filtrarFlagsActual(arr) {
  var f = arr;
  if (currentFilter === "alta") f = f.filter(function(x){ return x.severidad === "alta"; });
  else if (currentFilter === "media") f = f.filter(function(x){ return x.severidad === "media"; });
  else if (FLAG_TIPOS[currentFilter]) f = f.filter(function(x){ return x.tipo === currentFilter; });
  if (contractSearchTerms.length > 0) {
    f = f.filter(function(x) {
      if (!x._buscable) {
        var text = [x.descripcion||"", x.organo||"", x.adjudicatario||"", x.tipo||"", x.cpv||"", x.expediente||""].join(" ");
        if (x.contratos) x.contratos.forEach(function(c){ text += " " + (c.objeto||"") + " " + (c.expediente||"") + " " + (c.adjudicatario||"") + " " + (c.organo||""); });
        if (x.organos) text += " " + x.organos.join(" ");
        if (x.adjudicatarios) text += " " + x.adjudicatarios.join(" ");
        x._buscable = normalizarBusquedaContratos(text);
      }
      return contractSearchTerms.every(function(p){ return x._buscable.indexOf(p) !== -1; });
    });
  }
  return f;
}

window.renderFlags = function() {
  var container = document.getElementById("flags-container");
  if (!container) return;

  var filtered = filtrarFlagsActual(allFlags);

  // Recalcular stats con el nuevo subconjunto visible
  if (window._contractStatsMeta && window._contractFmeta) {
    renderContractStats(allFlags, window._contractStatsMeta, window._contractFmeta);
  }

  if (filtered.length === 0 && (currentFilter !== "todos" || contractSearchTerms.length > 0)) {
    container.innerHTML = '<div style="text-align:center;padding:2rem;color:#5a5a72;font-style:italic">Sin resultados. <a href="#" onclick="window.setFilter(\'todos\');document.querySelector(\'#contract-search\').value=\'\';window.searchContracts(\'\');return false" style="color:#2a9d8f">Ver todas</a></div>';
    return;
  }
  if (filtered.length === 0) {
    container.innerHTML = '<div class="section-placeholder"><h3>✅ Sin banderas rojas</h3><p>No se detectaron patrones sospechosos en los datos disponibles.</p></div>';
    return;
  }

  var html = "";
  filtered.forEach(function(flag) {
    var tipo = FLAG_TIPOS[flag.tipo] || { label: flag.tipo, icon: "🚩", explica: "" };
    var sevClass = flag.severidad === "alta" ? "badge-instruccion" : "badge-diligencias";
    var borderColor = flag.severidad === "alta" ? "#e63946" : "#e9c46a";

    html += '<div class="case-card" style="border-left-color:' + borderColor + '" onclick="this.classList.toggle(\'expanded\')">';
    html += '<div class="case-header"><div class="case-title-area">';
    html += '<span class="case-emoji">' + (flag.emoji || tipo.icon) + '</span>';
    html += '<div><div class="case-name">' + tipo.label + '</div>';
    html += '<div class="case-party">' + tipo.explica + '</div></div>';
    html += '</div><span class="badge ' + sevClass + '">' + (flag.severidad === "alta" ? "🔴 Alta" : "🟡 Media") + '</span></div>';
    html += '<p class="case-desc">' + flag.descripcion + '</p>';

    if (flag.organo || flag.adjudicatario) {
      html += '<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:14px">';
      if (flag.organo) {
        html += '<div style="background:rgba(230,57,70,0.12);border:1px solid rgba(230,57,70,0.25);padding:10px 16px;border-radius:3px;flex:1;min-width:220px">';
        html += '<div style="font-family:var(--font-mono);font-size:10px;color:#e63946;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:4px;font-weight:600">📍 Administración que adjudica</div>';
        html += '<div style="font-size:15px;color:var(--text-primary);font-weight:600">' + flag.organo + '</div></div>';
      }
      if (flag.adjudicatario) {
        html += '<div style="background:rgba(233,196,106,0.12);border:1px solid rgba(233,196,106,0.25);padding:10px 16px;border-radius:3px;flex:1;min-width:220px">';
        html += '<div style="font-family:var(--font-mono);font-size:10px;color:#e9c46a;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:4px;font-weight:600">🏢 Empresa adjudicataria</div>';
        html += '<div style="font-size:15px;color:var(--text-primary);font-weight:600">' + flag.adjudicatario + '</div></div>';
      }
      html += '</div>';
    }

    html += '<div class="case-details"><div class="detail-grid">';
    if (flag.importe_total) html += '<div class="detail-box"><div class="detail-label">Importe total</div><div class="detail-value" style="color:#e9c46a;font-weight:600;font-size:18px">' + fmtMoney(flag.importe_total) + '</div></div>';
    if (flag.num_contratos) html += '<div class="detail-box"><div class="detail-label">Contratos</div><div class="detail-value" style="font-size:18px">' + flag.num_contratos + '</div></div>';
    if (flag.porcentaje_contratos) html += '<div class="detail-box"><div class="detail-label">Concentración</div><div class="detail-value" style="color:#e63946;font-weight:600;font-size:18px">' + flag.porcentaje_contratos + '%</div></div>';
    if (flag.porcentaje) html += '<div class="detail-box"><div class="detail-label">En franja sospechosa</div><div class="detail-value" style="color:#e63946;font-weight:600;font-size:18px">' + flag.porcentaje + '%</div></div>';
    if (flag.num_organos) html += '<div class="detail-box"><div class="detail-label">Administraciones</div><div class="detail-value" style="font-size:18px">' + flag.num_organos + '</div></div>';
    if (flag.umbral_legal) html += '<div class="detail-box"><div class="detail-label">Umbral legal</div><div class="detail-value">' + fmtMoney(flag.umbral_legal) + '</div></div>';
    if (flag.porcentaje_importe) html += '<div class="detail-box"><div class="detail-label">% del importe</div><div class="detail-value">' + flag.porcentaje_importe + '%</div></div>';
    if (flag.proveedores_distintos) html += '<div class="detail-box"><div class="detail-label">Proveedores</div><div class="detail-value">' + flag.proveedores_distintos + '</div></div>';
    html += '</div>';

    if (flag.contratos && flag.contratos.length) {
      html += '<div class="detail-label" style="margin:16px 0 8px">Contratos implicados</div>';
      flag.contratos.forEach(function(c) {
        html += '<div style="background:rgba(255,255,255,0.03);padding:10px 14px;margin-bottom:5px;border-radius:2px;border-left:3px solid #e9c46a">';
        html += '<div style="font-size:13px;color:var(--text-secondary);line-height:1.5">' + (c.objeto || "Sin título") + '</div>';
        html += '<div style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);margin-top:4px;display:flex;flex-wrap:wrap;gap:10px;align-items:center">';
        html += '<span style="color:#e9c46a;font-weight:600">' + fmtMoney(c.importe) + '</span>';
        if (c.expediente) html += '<span>' + c.expediente + '</span>';
        if (c.enlace) html += '<a href="' + c.enlace + '" target="_blank" onclick="event.stopPropagation()" style="color:#2a9d8f;text-decoration:none">📄 Ver en PLACSP →</a>';
        html += '</div></div>';
      });
    }
    if (flag.organos && flag.organos.length) {
      html += '<div class="detail-label" style="margin:16px 0 8px">Administraciones donde aparece</div><div style="display:flex;flex-wrap:wrap;gap:6px">';
      flag.organos.forEach(function(o) {
        html += '<span style="background:rgba(230,57,70,0.1);border:1px solid rgba(230,57,70,0.2);padding:4px 10px;border-radius:2px;font-size:12px;color:var(--text-secondary)">' + o + '</span>';
      });
      html += '</div>';
    }
    html += '</div>';
    html += '<div class="expand-hint">▼ Ver detalles y contratos</div>';
    html += '</div>';
  });
  container.innerHTML = html;
};

function renderContratosSection() {
  var container = document.getElementById("sec-contratos");
  container.innerHTML = '<div class="section-placeholder"><h3>⏳ Cargando datos de la PLACSP...</h3></div>';

  Promise.all([
    fetch("data/banderas-rojas/latest.json").then(function(r){ return r.ok ? r.json() : null; }).catch(function(){ return null; }),
    fetch("data/contratos/resumen.json").then(function(r){ return r.ok ? r.json() : null; }).catch(function(){ return null; }),
  ]).then(function(results) {
    var flagsData = results[0];
    var resumenData = results[1];

    if (!flagsData && !resumenData) {
      container.innerHTML = '<div class="section-placeholder"><h3>🏗️ Contratos públicos</h3><p>Ve a GitHub → Actions → Run workflow.</p></div>';
      return;
    }

    allFlags = (flagsData && flagsData.flags) ? flagsData.flags : [];
    var stats = (flagsData && flagsData.stats) ? flagsData.stats : {};
    var fmeta = (flagsData && flagsData.meta) ? flagsData.meta : {};
    var rmeta = (resumenData && resumenData.meta) ? resumenData.meta : {};
    var ultMen = (resumenData && resumenData.ultimos_menores) ? resumenData.ultimos_menores : [];
    var ultLic = (resumenData && resumenData.ultimas_licitaciones) ? resumenData.ultimas_licitaciones : [];
    var tc = stats.por_tipo || {};

    // Guardar meta global para refrescos posteriores de stats
    window._contractStatsMeta = stats;
    window._contractFmeta = fmeta;

    var html = "";

    // STATS CLICKABLES (se rellena dinámicamente con renderContractStats)
    html += '<div class="stats" id="contract-stats"></div>';

    if (fmeta.generado) {
      html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-bottom:1rem">';
      html += 'Actualizado: ' + fmeta.generado + ' · ' + (fmeta.menores||0) + ' menores · ' + (fmeta.licitaciones||0) + ' licitaciones · v' + (fmeta.version||"?");
      html += '</div>';
    }

    html += '<div style="background:var(--bg-card);border:1px solid var(--border-subtle);padding:16px 20px;border-radius:2px;margin-bottom:1rem">';
    html += '<div style="font-family:var(--font-display);font-size:16px;margin-bottom:8px">¿Qué estás viendo?</div>';
    html += '<p style="font-size:14px;color:var(--text-secondary);margin:0">';
    html += 'FiscalizApp descarga contratos de la <a href="https://contrataciondelsectorpublico.gob.es" target="_blank" style="color:#2a9d8f">PLACSP</a> ';
    html += 'y pasa 6 detectores. <strong>Pulsa los contadores para filtrar.</strong> No significa corrupción — significa que merece mirada atenta.</p></div>';

    if (fmeta.reglas) {
      html += '<details style="margin-bottom:1rem"><summary style="cursor:pointer;font-family:var(--font-mono);font-size:12px;color:var(--text-muted)">📐 6 reglas del detector</summary>';
      html += '<div style="background:var(--bg-card);padding:12px 16px;margin-top:8px;border-radius:2px;font-size:13px;color:var(--text-secondary)">';
      fmeta.reglas.forEach(function(r) { html += '<div style="margin-bottom:6px">• ' + r + '</div>'; });
      html += '</div></details>';
    }

    // Search
    html += '<input type="text" id="contract-search" class="search-box" placeholder="🔍 Buscar administración, empresa, expediente..." oninput="window.searchContracts(this.value)">';

    html += '<div style="font-family:var(--font-display);font-size:20px;margin-bottom:16px">🚩 Banderas rojas detectadas</div>';
    html += '<div id="flags-container"></div>';

    // Últimos contratos
    var ultimos = ultMen.concat(ultLic).filter(function(c){ return c.titulo || c.objeto; });
    ultimos.sort(function(a,b){ return (b.actualizado||"").localeCompare(a.actualizado||""); });
    ultimos = ultimos.slice(0, 30);
    if (ultimos.length) {
      html += '<div style="font-family:var(--font-display);font-size:20px;margin:2rem 0 16px">📋 Últimos contratos publicados</div>';
      ultimos.forEach(function(c) {
        var i = c.importe_adjudicacion || c.presupuesto_base;
        html += '<div style="background:var(--bg-card);border-left:3px solid var(--border-subtle);padding:14px 18px;margin-bottom:8px;border-radius:2px">';
        html += '<div style="font-size:14px;color:var(--text-primary);margin-bottom:6px">' + (c.objeto||c.titulo||"Sin título") + '</div>';
        html += '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:4px">';
        if (c.organo) html += '<span style="font-family:var(--font-mono);font-size:11px;background:rgba(230,57,70,0.08);color:var(--text-secondary);padding:3px 8px;border-radius:2px">📍 ' + c.organo + '</span>';
        if (c.adjudicatario) html += '<span style="font-family:var(--font-mono);font-size:11px;background:rgba(233,196,106,0.08);color:var(--text-secondary);padding:3px 8px;border-radius:2px">🏢 ' + c.adjudicatario + '</span>';
        html += '</div><div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);display:flex;flex-wrap:wrap;gap:12px">';
        if (i) html += '<span style="color:#e9c46a;font-weight:600">' + fmtMoney(i) + '</span>';
        if (c.enlace) html += '<a href="' + c.enlace + '" target="_blank" style="color:#2a9d8f;text-decoration:none">Ver en PLACSP →</a>';
        html += '</div></div>';
      });
    }
    container.innerHTML = html;
    renderContractStats(allFlags, stats, fmeta);
    window.renderFlags();
  });
}

document.addEventListener("DOMContentLoaded", function() {
  var loaded = false;
  document.querySelectorAll(".nav-tab").forEach(function(tab) {
    tab.addEventListener("click", function() {
      if (tab.dataset.section === "contratos" && !loaded) { loaded = true; renderContratosSection(); }
    });
  });
});
