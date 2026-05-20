/**
 * FiscalizApp — Contratos públicos y banderas rojas v2
 * Stats clickables como filtros, órgano y empresa destacados
 */
const FLAG_TIPOS = {
  fraccionamiento: { label: "Fraccionamiento", icon: "✂️", explica: "3+ contratos del mismo proveedor al mismo órgano justo bajo el umbral de licitación" },
  concentracion: { label: "Concentración extrema", icon: "🎯", explica: "Un proveedor gana 80%+ de los contratos de un órgano (mín. 5 contratos)" },
  patron_umbral: { label: "Patrón de umbral", icon: "📊", explica: "Un órgano con >40% de sus contratos justo bajo el límite legal — estadísticamente improbable" },
  omnipresente: { label: "Proveedor omnipresente", icon: "👁️", explica: "Mismo proveedor con contratos cerca del umbral en 3+ administraciones distintas" },
};

let allFlags = [];
let currentFilter = "todos";

function fmtMoney(n) {
  if (!n) return "—";
  return n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

function setFilter(filter) {
  currentFilter = filter;
  document.querySelectorAll(".cstat").forEach(el => {
    el.style.outline = el.dataset.filter === filter ? "2px solid var(--accent-red)" : "none";
    el.style.outlineOffset = "-2px";
  });
  renderFlags();
}

function renderFlags() {
  const container = document.getElementById("flags-container");
  if (!container) return;

  let filtered = allFlags;
  if (currentFilter === "alta") filtered = allFlags.filter(f => f.severidad === "alta");
  else if (currentFilter === "media") filtered = allFlags.filter(f => f.severidad === "media");
  else if (FLAG_TIPOS[currentFilter]) filtered = allFlags.filter(f => f.tipo === currentFilter);

  if (filtered.length === 0 && currentFilter !== "todos") {
    container.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text-muted);font-style:italic">
      No hay banderas rojas con este filtro. <a href="#" onclick="setFilter('todos');return false" style="color:var(--accent-green)">Ver todas</a>
    </div>`;
    return;
  }

  container.innerHTML = filtered.map(flag => {
    const tipo = FLAG_TIPOS[flag.tipo] || { label: flag.tipo, icon: "🚩", explica: "" };
    const sevClass = flag.severidad === "alta" ? "badge-instruccion" : "badge-diligencias";

    return `<div class="case-card" style="border-left-color:${flag.severidad==='alta'?'var(--accent-red)':'var(--accent-amber)'}" onclick="this.classList.toggle('expanded')">
      <div class="case-header"><div class="case-title-area"><span class="case-emoji">${flag.emoji||tipo.icon}</span>
        <div><div class="case-name">${tipo.label}</div><div class="case-party">${tipo.explica}</div></div>
      </div><span class="badge ${sevClass}">${flag.severidad==='alta'?'🔴 Alta':'🟡 Media'}</span></div>

      <p class="case-desc">${flag.descripcion}</p>

      ${flag.organo || flag.adjudicatario ? `
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px">
          ${flag.organo ? `<div style="background:rgba(230,57,70,0.1);border:1px solid rgba(230,57,70,0.2);padding:8px 14px;border-radius:2px;flex:1;min-width:200px">
            <div style="font-family:var(--font-mono);font-size:10px;color:var(--accent-red);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:2px">Administración que adjudica</div>
            <div style="font-size:14px;color:var(--text-primary);font-weight:600">${flag.organo}</div>
          </div>` : ""}
          ${flag.adjudicatario ? `<div style="background:rgba(233,196,106,0.1);border:1px solid rgba(233,196,106,0.2);padding:8px 14px;border-radius:2px;flex:1;min-width:200px">
            <div style="font-family:var(--font-mono);font-size:10px;color:var(--accent-amber);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:2px">Empresa adjudicataria</div>
            <div style="font-size:14px;color:var(--text-primary);font-weight:600">${flag.adjudicatario}</div>
          </div>` : ""}
        </div>
      ` : ""}

      <div class="case-details">
        <div class="detail-grid">
          ${flag.importe_total?`<div class="detail-box"><div class="detail-label">Importe total</div><div class="detail-value" style="color:var(--accent-amber);font-weight:600;font-size:18px">${fmtMoney(flag.importe_total)}</div></div>`:""}
          ${flag.num_contratos?`<div class="detail-box"><div class="detail-label">Contratos sospechosos</div><div class="detail-value" style="font-size:18px">${flag.num_contratos}</div></div>`:""}
          ${flag.porcentaje_contratos?`<div class="detail-box"><div class="detail-label">Concentración</div><div class="detail-value" style="color:var(--accent-red);font-weight:600;font-size:18px">${flag.porcentaje_contratos}%</div></div>`:""}
          ${flag.porcentaje_importe?`<div class="detail-box"><div class="detail-label">% del importe total</div><div class="detail-value">${flag.porcentaje_importe}%</div></div>`:""}
          ${flag.porcentaje?`<div class="detail-box"><div class="detail-label">Contratos en franja</div><div class="detail-value" style="color:var(--accent-red);font-weight:600;font-size:18px">${flag.porcentaje}%</div></div>`:""}
          ${flag.proveedores_distintos?`<div class="detail-box"><div class="detail-label">Proveedores</div><div class="detail-value">${flag.proveedores_distintos}</div></div>`:""}
          ${flag.num_organos?`<div class="detail-box"><div class="detail-label">Administraciones</div><div class="detail-value" style="font-size:18px">${flag.num_organos}</div></div>`:""}
          ${flag.umbral_legal?`<div class="detail-box"><div class="detail-label">Umbral legal</div><div class="detail-value">${fmtMoney(flag.umbral_legal)}</div></div>`:""}
        </div>

        ${flag.contratos ? `<div class="detail-label" style="margin:16px 0 8px">Contratos implicados</div>
          ${flag.contratos.map(c=>`<div style="background:rgba(255,255,255,0.02);padding:10px 14px;margin-bottom:4px;border-radius:2px;border-left:3px solid var(--accent-amber)">
            <div style="font-size:13px;color:var(--text-secondary);line-height:1.5">${c.objeto||"Sin título"}</div>
            <div style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);margin-top:4px;display:flex;flex-wrap:wrap;gap:12px;align-items:center">
              <span style="color:var(--accent-amber);font-weight:600">${fmtMoney(c.importe)}</span>
              ${c.expediente?`<span>${c.expediente}</span>`:""}
              ${c.enlace?`<a href="${c.enlace}" target="_blank" onclick="event.stopPropagation()" style="color:var(--accent-green);text-decoration:none">📄 Ver en PLACSP →</a>`:""}
            </div>
          </div>`).join("")}
        `:""}

        ${flag.organos ? `<div class="detail-label" style="margin:16px 0 8px">Administraciones donde aparece</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${flag.organos.map(o=>`<span style="background:rgba(230,57,70,0.1);border:1px solid rgba(230,57,70,0.15);padding:4px 10px;border-radius:2px;font-size:12px;color:var(--text-secondary)">${o}</span>`).join("")}
          </div>
        `:""}
      </div>
      <div class="expand-hint">▼ Ver detalles y contratos</div>
    </div>`;
  }).join("");
}

function renderContratosSection() {
  const container = document.getElementById("sec-contratos");
  container.innerHTML = '<div class="section-placeholder"><h3>⏳ Cargando datos de la PLACSP...</h3></div>';

  Promise.all([
    fetch("data/banderas-rojas/latest.json").then(r => r.ok ? r.json() : null).catch(() => null),
    fetch("data/contratos/resumen.json").then(r => r.ok ? r.json() : null).catch(() => null),
  ]).then(([flagsData, resumenData]) => {
    if (!flagsData && !resumenData) {
      container.innerHTML = `<div class="section-placeholder"><h3>🏗️ Contratos públicos</h3>
        <p>Ve a GitHub → Actions → Run workflow para la primera carga.</p></div>`;
      return;
    }

    allFlags = flagsData?.flags || [];
    const stats = flagsData?.stats || {};
    const fmeta = flagsData?.meta || {};
    const rmeta = resumenData?.meta || {};
    const ultMen = resumenData?.ultimos_menores || [];
    const ultLic = resumenData?.ultimas_licitaciones || [];

    // Contar tipos para los stats
    const tipoCount = stats.por_tipo || {};

    let html = "";

    // Stats clickables
    html += `<div class="stats">`;
    html += cstat("📋", (fmeta.menores||0)+(fmeta.licitaciones||0), "Analizados", "todos");
    html += cstat("🚩", stats.total_flags||0, "Banderas rojas", "todos");
    html += cstat("🔴", stats.severidad_alta||0, "Severidad alta", "alta");
    html += cstat("✂️", tipoCount.fraccionamiento||0, "Fraccionamiento", "fraccionamiento");
    html += cstat("🎯", tipoCount.concentracion||0, "Concentración", "concentracion");
    html += cstat("📊", tipoCount.patron_umbral||0, "Patrón umbral", "patron_umbral");
    html += `</div>`;

    // Meta info
    if (fmeta.generado) {
      html += `<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-bottom:1.5rem">
        Actualizado: ${fmeta.generado} · ${fmeta.menores||0} menores · ${fmeta.licitaciones||0} licitaciones
      </div>`;
    }

    // Explainer
    html += `<div style="background:var(--bg-card);border:1px solid var(--border-subtle);padding:16px 20px;border-radius:2px;margin-bottom:1.5rem">
      <div style="font-family:var(--font-display);font-size:16px;margin-bottom:8px">¿Qué estás viendo?</div>
      <p style="font-size:14px;color:var(--text-secondary);margin:0">
        FiscalizApp descarga contratos de la <a href="https://contrataciondelsectorpublico.gob.es" target="_blank" style="color:var(--accent-green)">PLACSP</a>
        y pasa 4 detectores automáticos. Pulsa en los contadores de arriba para filtrar por tipo.
        No significa corrupción — significa que merece una mirada más atenta.
      </p>
    </div>`;

    // Reglas colapsables
    if (fmeta.reglas) {
      html += `<details style="margin-bottom:1.5rem"><summary style="cursor:pointer;font-family:var(--font-mono);font-size:12px;color:var(--text-muted)">📐 Reglas del detector (click para ver)</summary>
        <div style="background:var(--bg-card);padding:12px 16px;margin-top:8px;border-radius:2px;font-size:13px;color:var(--text-secondary)">
          ${fmeta.reglas.map(r => `<div style="margin-bottom:6px">• ${r}</div>`).join("")}
        </div></details>`;
    }

    // Container para flags (se re-renderiza al filtrar)
    html += `<div style="font-family:var(--font-display);font-size:20px;margin-bottom:16px">🚩 Banderas rojas detectadas</div>`;
    html += `<div id="flags-container"></div>`;

    // Últimos contratos
    const ultimos = [...ultMen, ...ultLic].filter(c=>c.titulo||c.objeto).sort((a,b)=>(b.actualizado||"").localeCompare(a.actualizado||"")).slice(0,30);
    if (ultimos.length) {
      html += `<div style="font-family:var(--font-display);font-size:20px;margin:2rem 0 16px">📋 Últimos contratos publicados</div>`;
      ultimos.forEach(c => {
        const i = c.importe_adjudicacion || c.presupuesto_base;
        html += `<div style="background:var(--bg-card);border-left:3px solid var(--border-subtle);padding:14px 18px;margin-bottom:8px;border-radius:2px">
          <div style="font-size:14px;color:var(--text-primary);margin-bottom:6px">${c.objeto||c.titulo||"Sin título"}</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:4px">
            ${c.organo?`<span style="font-family:var(--font-mono);font-size:11px;background:rgba(230,57,70,0.08);color:var(--text-secondary);padding:3px 8px;border-radius:2px">📍 ${c.organo}</span>`:""}
            ${c.adjudicatario?`<span style="font-family:var(--font-mono);font-size:11px;background:rgba(233,196,106,0.08);color:var(--text-secondary);padding:3px 8px;border-radius:2px">🏢 ${c.adjudicatario}</span>`:""}
          </div>
          <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);display:flex;flex-wrap:wrap;gap:12px">
            ${i?`<span style="color:var(--accent-amber);font-weight:600">${fmtMoney(i)}</span>`:""}
            ${c.enlace?`<a href="${c.enlace}" target="_blank" style="color:var(--accent-green);text-decoration:none">Ver en PLACSP →</a>`:""}
          </div></div>`;
      });
    }

    container.innerHTML = html;
    renderFlags(); // Render inicial de flags
  });
}

function cstat(icon, val, label, filter) {
  return `<div class="stat-card cstat" data-filter="${filter}" onclick="setFilter('${filter}')" style="cursor:pointer;transition:all 0.15s${filter===currentFilter?';outline:2px solid var(--accent-red);outline-offset:-2px':''}">
    <div class="stat-icon">${icon}</div>
    <div class="stat-value">${val}</div>
    <div class="stat-label">${label}</div>
  </div>`;
}

document.addEventListener("DOMContentLoaded", () => {
  let loaded = false;
  document.querySelectorAll(".nav-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      if (tab.dataset.section === "contratos" && !loaded) { loaded = true; renderContratosSection(); }
    });
  });
});
