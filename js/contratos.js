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
  document.querySelectorAll(".cstat").forEach(function(el) {
    if (el.dataset.filter === filter) {
      el.style.outline = "2px solid #e63946";
      el.style.outlineOffset = "-2px";
      el.style.background = "rgba(230,57,70,0.08)";
    } else {
      el.style.outline = "none";
      el.style.background = "";
    }
  });
  window.renderFlags();
};

window.renderFlags = function() {
  var container = document.getElementById("flags-container");
  if (!container) return;

  var filtered = allFlags;
  if (currentFilter === "alta") filtered = allFlags.filter(function(f){ return f.severidad === "alta"; });
  else if (currentFilter === "media") filtered = allFlags.filter(function(f){ return f.severidad === "media"; });
  else if (FLAG_TIPOS[currentFilter]) filtered = allFlags.filter(function(f){ return f.tipo === currentFilter; });

  if (contractSearchTerms.length > 0) {
    filtered = filtered.filter(function(f) {
      if (!f._buscable) {
        var text = [f.descripcion||"", f.organo||"", f.adjudicatario||"", f.tipo||"", f.cpv||"", f.expediente||""].join(" ");
        if (f.contratos) f.contratos.forEach(function(c){ text += " " + (c.objeto||"") + " " + (c.expediente||"") + " " + (c.adjudicatario||"") + " " + (c.organo||""); });
        if (f.organos) text += " " + f.organos.join(" ");
        if (f.adjudicatarios) text += " " + f.adjudicatarios.join(" ");
        f._buscable = normalizarBusquedaContratos(text);
      }
      // TODAS las palabras deben aparecer en algún lugar del texto buscable
      return contractSearchTerms.every(function(p){ return f._buscable.indexOf(p) !== -1; });
    });
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

    var html = "";

    // STATS CLICKABLES
    html += '<div class="stats">';
    html += infoCard("📋", (fmeta.menores||0)+(fmeta.licitaciones||0), "Analizados");
    html += statCard("🚩", stats.total_flags||0, "Banderas rojas", "todos");
    html += statCard("🔴", stats.severidad_alta||0, "Sev. alta", "alta");
    html += statCard("✂️", tc.fraccionamiento||0, "Fraccionamiento", "fraccionamiento");
    html += statCard("🎯", tc.concentracion||0, "Concentración", "concentracion");
    html += statCard("🤝", tc.negociado_reiterado||0, "Negociado", "negociado_reiterado");
    html += statCard("🇪🇺", tc.umbral_europeo||0, "Umbral UE", "umbral_europeo");
    html += '</div>';

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
    window.renderFlags();
  });
}

function statCard(icon, val, label, filter) {
  return '<div class="stat-card cstat" data-filter="' + filter + '" onclick="window.setFilter(\'' + filter + '\')" style="cursor:pointer;transition:all 0.15s;user-select:none">' +
    '<div class="stat-icon">' + icon + '</div><div class="stat-value">' + val + '</div><div class="stat-label">' + label + '</div></div>';
}
function infoCard(icon, val, label) {
  return '<div class="stat-card"><div class="stat-icon">' + icon + '</div><div class="stat-value">' + val + '</div><div class="stat-label">' + label + '</div></div>';
}

document.addEventListener("DOMContentLoaded", function() {
  var loaded = false;
  document.querySelectorAll(".nav-tab").forEach(function(tab) {
    tab.addEventListener("click", function() {
      if (tab.dataset.section === "contratos" && !loaded) { loaded = true; renderContratosSection(); }
    });
  });
});
