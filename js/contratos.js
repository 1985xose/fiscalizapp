/**
 * FiscalizApp — Módulo de contratos públicos y banderas rojas
 * Lee data/contratos/resumen.json y data/banderas-rojas/latest.json
 */
const FLAG_TIPOS = {
  fraccionamiento: { label: "Fraccionamiento", icon: "✂️", explica: "3+ contratos del mismo proveedor al mismo órgano justo bajo el umbral de licitación" },
  concentracion: { label: "Concentración extrema", icon: "🎯", explica: "Un proveedor gana 80%+ de los contratos de un órgano (mín. 5 contratos)" },
  patron_umbral: { label: "Patrón de umbral", icon: "📊", explica: "Un órgano con >40% de sus contratos justo bajo el límite legal — estadísticamente improbable" },
  omnipresente: { label: "Proveedor omnipresente", icon: "👁️", explica: "Mismo proveedor con contratos cerca del umbral en 3+ administraciones distintas" },
};

function fmtMoney(n) {
  if (!n) return "—";
  return n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

function renderContratosSection() {
  const container = document.getElementById("sec-contratos");
  container.innerHTML = '<div class="section-placeholder"><h3>⏳ Cargando datos de la PLACSP...</h3></div>';

  Promise.all([
    fetch("data/banderas-rojas/latest.json").then(r => r.ok ? r.json() : null).catch(() => null),
    fetch("data/contratos/resumen.json").then(r => r.ok ? r.json() : null).catch(() => null),
  ]).then(([flagsData, resumenData]) => {
    if (!flagsData && !resumenData) {
      container.innerHTML = `<div class="section-placeholder">
        <h3>🏗️ Contratos públicos</h3>
        <p>Los datos se actualizan cada mañana a las 8:00.<br>
        Primera vez: ve a GitHub → Actions → Run workflow.</p>
      </div>`;
      return;
    }

    const flags = flagsData?.flags || [];
    const stats = flagsData?.stats || {};
    const fmeta = flagsData?.meta || {};
    const rmeta = resumenData?.meta || {};
    const ultMen = resumenData?.ultimos_menores || [];
    const ultLic = resumenData?.ultimas_licitaciones || [];

    let html = "";

    // Stats
    html += `<div class="stats">`;
    html += sc("📋", (fmeta.menores||0) + (fmeta.licitaciones||0), "Contratos analizados");
    html += sc("🚩", stats.total_flags || 0, "Banderas rojas");
    html += sc("🔴", stats.severidad_alta || 0, "Severidad alta");
    html += sc("✂️", stats.por_tipo?.fraccionamiento || 0, "Fraccionamientos");
    html += `</div>`;

    if (fmeta.generado) {
      html += `<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-bottom:1.5rem">
        Actualizado: ${fmeta.generado} · ${fmeta.menores||0} menores · ${fmeta.licitaciones||0} licitaciones · Rango: ${rmeta.rango||""}
      </div>`;
    }

    html += `<div style="background:var(--bg-card);border:1px solid var(--border-subtle);padding:16px 20px;border-radius:2px;margin-bottom:1.5rem">
      <div style="font-family:var(--font-display);font-size:16px;margin-bottom:8px">¿Qué estás viendo?</div>
      <p style="font-size:14px;color:var(--text-secondary);margin:0">
        FiscalizApp descarga contratos de la <a href="https://contrataciondelsectorpublico.gob.es" target="_blank" style="color:var(--accent-green)">PLACSP</a>
        y pasa 4 detectores automáticos de patrones sospechosos: fraccionamiento, concentración, patrón estadístico y proveedor omnipresente. 
        No significa corrupción — significa que merece una mirada más atenta.
      </p>
    </div>`;

    // Reglas
    if (fmeta.reglas) {
      html += `<details style="margin-bottom:1.5rem"><summary style="cursor:pointer;font-family:var(--font-mono);font-size:12px;color:var(--text-muted)">📐 Reglas del detector (click para ver)</summary>
        <div style="background:var(--bg-card);padding:12px 16px;margin-top:8px;border-radius:2px;font-size:13px;color:var(--text-secondary)">
          ${fmeta.reglas.map(r => `<div style="margin-bottom:6px">• ${r}</div>`).join("")}
        </div>
      </details>`;
    }

    // Banderas rojas
    if (flags.length > 0) {
      html += `<div style="font-family:var(--font-display);font-size:20px;margin-bottom:16px">🚩 Banderas rojas detectadas</div>`;
      flags.forEach(flag => {
        const tipo = FLAG_TIPOS[flag.tipo] || { label: flag.tipo, icon: "🚩", explica: "" };
        const sevClass = flag.severidad === "alta" ? "badge-instruccion" : "badge-diligencias";
        html += `<div class="case-card" style="border-left-color:${flag.severidad==='alta'?'var(--accent-red)':'var(--accent-amber)'}" onclick="this.classList.toggle('expanded')">
          <div class="case-header"><div class="case-title-area"><span class="case-emoji">${flag.emoji||tipo.icon}</span>
            <div><div class="case-name">${tipo.label}</div><div class="case-party">${tipo.explica}</div></div>
          </div><span class="badge ${sevClass}">${flag.severidad==='alta'?'🔴 Alta':'🟡 Media'}</span></div>
          <p class="case-desc">${flag.descripcion}</p>
          ${flag.organo?`<div style="margin-top:8px"><span class="case-tag">📍 ${flag.organo}</span></div>`:""}
          ${flag.adjudicatario?`<div style="margin-top:4px"><span class="case-tag">🏢 ${flag.adjudicatario}</span></div>`:""}
          <div class="case-details">
            <div class="detail-grid">
              ${flag.importe_total?`<div class="detail-box"><div class="detail-label">Importe total</div><div class="detail-value" style="color:var(--accent-amber);font-weight:600">${fmtMoney(flag.importe_total)}</div></div>`:""}
              ${flag.num_contratos?`<div class="detail-box"><div class="detail-label">Contratos</div><div class="detail-value">${flag.num_contratos}</div></div>`:""}
              ${flag.porcentaje_contratos?`<div class="detail-box"><div class="detail-label">Concentración</div><div class="detail-value" style="color:var(--accent-red);font-weight:600">${flag.porcentaje_contratos}%</div></div>`:""}
              ${flag.porcentaje?`<div class="detail-box"><div class="detail-label">En franja</div><div class="detail-value" style="color:var(--accent-red);font-weight:600">${flag.porcentaje}%</div></div>`:""}
              ${flag.num_organos?`<div class="detail-box"><div class="detail-label">Órganos</div><div class="detail-value">${flag.num_organos}</div></div>`:""}
            </div>
            ${flag.contratos?`<div class="detail-label" style="margin:12px 0 8px">Contratos implicados</div>
              ${flag.contratos.map(c=>`<div style="background:rgba(255,255,255,0.02);padding:8px 12px;margin-bottom:4px;border-radius:2px;font-size:13px">
                <div style="color:var(--text-secondary)">${c.objeto||"Sin título"}</div>
                <div style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);margin-top:2px">${c.expediente||""} · ${fmtMoney(c.importe)}${c.enlace?` · <a href="${c.enlace}" target="_blank" onclick="event.stopPropagation()" style="color:var(--accent-green)">PLACSP →</a>`:""}</div>
              </div>`).join("")}`:""}
            ${flag.organos?`<div class="detail-label" style="margin:12px 0 8px">Órganos afectados</div>
              ${flag.organos.map(o=>`<span class="case-tag" style="margin:2px">${o}</span>`).join("")}`:""}
          </div>
          <div class="expand-hint">▼ Ver detalles</div>
        </div>`;
      });
    } else if (flagsData) {
      html += `<div class="section-placeholder" style="margin-top:1rem"><h3>✅ Sin banderas rojas</h3>
        <p>No se han detectado patrones sospechosos. Eso no significa que no existan.</p></div>`;
    }

    // Últimos contratos
    const ultimos = [...ultMen, ...ultLic].filter(c=>c.titulo||c.objeto).sort((a,b)=>(b.actualizado||"").localeCompare(a.actualizado||"")).slice(0,30);
    if (ultimos.length) {
      html += `<div style="font-family:var(--font-display);font-size:20px;margin:2rem 0 16px">📋 Últimos contratos publicados</div>`;
      ultimos.forEach(c => {
        const i = c.importe_adjudicacion || c.presupuesto_base;
        html += `<div style="background:var(--bg-card);border-left:3px solid var(--border-subtle);padding:14px 18px;margin-bottom:8px;border-radius:2px">
          <div style="font-size:14px;color:var(--text-primary);margin-bottom:4px">${c.objeto||c.titulo||"Sin título"}</div>
          <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);display:flex;flex-wrap:wrap;gap:12px">
            ${c.organo?`<span>📍 ${c.organo}</span>`:""}${i?`<span style="color:var(--accent-amber)">${fmtMoney(i)}</span>`:""}${c.adjudicatario?`<span>🏢 ${c.adjudicatario}</span>`:""}${c.enlace?`<a href="${c.enlace}" target="_blank" style="color:var(--accent-green)">Ver →</a>`:""}
          </div></div>`;
      });
    }
    container.innerHTML = html;
  });
}

function sc(icon, val, label) {
  return `<div class="stat-card"><div class="stat-icon">${icon}</div><div class="stat-value">${val}</div><div class="stat-label">${label}</div></div>`;
}

document.addEventListener("DOMContentLoaded", () => {
  let loaded = false;
  document.querySelectorAll(".nav-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      if (tab.dataset.section === "contratos" && !loaded) { loaded = true; renderContratosSection(); }
    });
  });
});
