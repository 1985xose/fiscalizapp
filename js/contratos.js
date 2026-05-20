/**
 * FiscalizApp — Módulo de contratos públicos y banderas rojas
 * Lee data/contratos/ y data/banderas-rojas/ y renderiza la pestaña
 */

const FLAG_TIPOS = {
  fraccionamiento: { 
    label: "Fraccionamiento", 
    icon: "✂️",
    explica: "Dividir un contrato grande en varios pequeños para evitar licitación pública" 
  },
  concentracion: { 
    label: "Concentración", 
    icon: "🎯",
    explica: "Un proveedor acapara la mayoría de contratos de un órgano" 
  },
  sin_competencia: { 
    label: "Sin competencia", 
    icon: "🤷",
    explica: "Adjudicación al mismo precio que el presupuesto: nadie más pujó" 
  },
};

function fmtMoney(n) {
  if (!n) return "—";
  return n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

function renderContratosSection() {
  const container = document.getElementById("sec-contratos");

  // Mostrar loading
  container.innerHTML = `
    <div class="section-placeholder">
      <h3>⏳ Cargando datos de la PLACSP...</h3>
      <p>Descargando contratos públicos y banderas rojas</p>
    </div>
  `;

  // Cargar ambos JSONs en paralelo
  Promise.all([
    fetch("data/banderas-rojas/latest.json").then(r => r.ok ? r.json() : null).catch(() => null),
    fetch("data/contratos/licitaciones.json").then(r => r.ok ? r.json() : null).catch(() => null),
    fetch("data/contratos/menores.json").then(r => r.ok ? r.json() : null).catch(() => null),
  ]).then(([flagsData, licData, menData]) => {

    if (!flagsData && !licData && !menData) {
      container.innerHTML = `
        <div class="section-placeholder">
          <h3>🏗️ Contratos públicos</h3>
          <p>Los datos se actualizan automáticamente cada mañana a las 8:00.<br>
          Si es la primera vez, ejecuta el workflow manualmente en GitHub → Actions → Run workflow.</p>
        </div>
      `;
      return;
    }

    const flags = flagsData?.flags || [];
    const stats = flagsData?.stats || {};
    const meta = flagsData?.meta || {};
    const licitaciones = licData?.contratos || [];
    const menores = menData?.contratos || [];

    let html = "";

    // Stats
    html += `<div class="stats">`;
    html += statCard("📋", meta.contratos_analizados || 0, "Contratos analizados");
    html += statCard("🚩", stats.total_flags || 0, "Banderas rojas");
    html += statCard("🔴", stats.severidad_alta || 0, "Severidad alta");
    html += statCard("✂️", stats.por_tipo?.fraccionamiento || 0, "Fraccionamientos");
    html += `</div>`;

    // Info sobre la actualización
    if (meta.generado) {
      html += `<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-bottom:1.5rem">
        Última actualización: ${meta.generado} · 
        ${meta.licitaciones || 0} licitaciones · 
        ${meta.contratos_menores || 0} contratos menores
      </div>`;
    }

    // Explicación
    html += `<div style="background:var(--bg-card);border:1px solid var(--border-subtle);padding:16px 20px;border-radius:2px;margin-bottom:1.5rem">
      <div style="font-family:var(--font-display);font-size:16px;margin-bottom:8px">¿Qué estás viendo?</div>
      <p style="font-size:14px;color:var(--text-secondary);margin:0">
        Cada día a las 8:00, FiscalizApp descarga los últimos contratos publicados en la 
        <a href="https://contrataciondelsectorpublico.gob.es" target="_blank" style="color:var(--accent-green)">Plataforma de Contratación del Sector Público</a> 
        y pasa un detector automático de patrones sospechosos. No significa que haya corrupción — significa que merece una mirada más atenta.
      </p>
    </div>`;

    // Banderas rojas
    if (flags.length > 0) {
      html += `<div style="font-family:var(--font-display);font-size:20px;margin-bottom:16px">🚩 Banderas rojas detectadas</div>`;

      flags.forEach((flag, i) => {
        const tipo = FLAG_TIPOS[flag.tipo] || { label: flag.tipo, icon: "🚩" };
        const sevClass = flag.severidad === "alta" ? "badge-instruccion" : "badge-diligencias";

        html += `
          <div class="case-card" style="border-left-color:${flag.severidad === 'alta' ? 'var(--accent-red)' : 'var(--accent-amber)'}" onclick="this.classList.toggle('expanded')">
            <div class="case-header">
              <div class="case-title-area">
                <span class="case-emoji">${flag.emoji || tipo.icon}</span>
                <div>
                  <div class="case-name">${tipo.label}</div>
                  <div class="case-party">${tipo.explica}</div>
                </div>
              </div>
              <span class="badge ${sevClass}">${flag.severidad === 'alta' ? '🔴 Alta' : '🟡 Media'}</span>
            </div>
            <p class="case-desc">${flag.descripcion}</p>
            ${flag.organo ? `<div style="margin-top:8px"><span class="case-tag">📍 ${flag.organo}</span></div>` : ""}
            ${flag.adjudicatario ? `<div style="margin-top:4px"><span class="case-tag">🏢 ${flag.adjudicatario}</span></div>` : ""}
            <div class="case-details">
              <div class="detail-grid">
                ${flag.importe_total ? `<div class="detail-box"><div class="detail-label">Importe total</div><div class="detail-value" style="color:var(--accent-amber);font-weight:600">${fmtMoney(flag.importe_total)}</div></div>` : ""}
                ${flag.num_contratos ? `<div class="detail-box"><div class="detail-label">Contratos</div><div class="detail-value">${flag.num_contratos}</div></div>` : ""}
                ${flag.porcentaje ? `<div class="detail-box"><div class="detail-label">Concentración</div><div class="detail-value" style="color:var(--accent-red);font-weight:600">${flag.porcentaje}%</div></div>` : ""}
                ${flag.presupuesto_base ? `<div class="detail-box"><div class="detail-label">Presupuesto base</div><div class="detail-value">${fmtMoney(flag.presupuesto_base)}</div></div>` : ""}
                ${flag.importe_adjudicacion ? `<div class="detail-box"><div class="detail-label">Adjudicado</div><div class="detail-value">${fmtMoney(flag.importe_adjudicacion)}</div></div>` : ""}
              </div>
              ${flag.contratos ? `
                <div class="detail-label" style="margin:12px 0 8px">Contratos implicados</div>
                ${flag.contratos.map(c => `
                  <div style="background:rgba(255,255,255,0.02);padding:8px 12px;margin-bottom:4px;border-radius:2px;font-size:13px">
                    <div style="color:var(--text-secondary)">${c.objeto || "Sin título"}</div>
                    <div style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);margin-top:2px">
                      ${c.expediente || ""} · ${fmtMoney(c.importe)}
                      ${c.enlace ? ` · <a href="${c.enlace}" target="_blank" onclick="event.stopPropagation()" style="color:var(--accent-green)">Ver en PLACSP</a>` : ""}
                    </div>
                  </div>
                `).join("")}
              ` : ""}
              ${flag.enlace ? `<div style="margin-top:12px"><a href="${flag.enlace}" target="_blank" onclick="event.stopPropagation()" style="color:var(--accent-green);font-family:var(--font-mono);font-size:12px">📄 Ver contrato en PLACSP</a></div>` : ""}
            </div>
            <div class="expand-hint">▼ Ver detalles</div>
          </div>
        `;
      });
    } else if (flagsData) {
      html += `<div class="section-placeholder" style="margin-top:1rem">
        <h3>✅ Sin banderas rojas hoy</h3>
        <p>No se han detectado patrones sospechosos en la última descarga. Eso no significa que no existan — solo que el detector automático no los ha encontrado.</p>
      </div>`;
    }

    // Últimos contratos
    const ultimos = [...licitaciones, ...menores]
      .filter(c => c.titulo || c.objeto)
      .slice(0, 20);

    if (ultimos.length > 0) {
      html += `<div style="font-family:var(--font-display);font-size:20px;margin:2rem 0 16px">📋 Últimos contratos publicados</div>`;
      
      ultimos.forEach(c => {
        const importe = c.importe_adjudicacion || c.presupuesto_base;
        html += `
          <div style="background:var(--bg-card);border-left:3px solid var(--border-subtle);padding:14px 18px;margin-bottom:8px;border-radius:2px">
            <div style="font-size:14px;color:var(--text-primary);margin-bottom:4px">${c.objeto || c.titulo || "Sin título"}</div>
            <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);display:flex;flex-wrap:wrap;gap:12px">
              ${c.organo ? `<span>📍 ${c.organo}</span>` : ""}
              ${importe ? `<span style="color:var(--accent-amber)">${fmtMoney(importe)}</span>` : ""}
              ${c.adjudicatario ? `<span>🏢 ${c.adjudicatario}</span>` : ""}
              ${c.procedimiento ? `<span>📄 ${c.procedimiento}</span>` : ""}
              ${c.enlace ? `<a href="${c.enlace}" target="_blank" style="color:var(--accent-green)">Ver →</a>` : ""}
            </div>
          </div>
        `;
      });
    }

    container.innerHTML = html;
  });
}

function statCard(icon, value, label) {
  return `
    <div class="stat-card">
      <div class="stat-icon">${icon}</div>
      <div class="stat-value">${value}</div>
      <div class="stat-label">${label}</div>
    </div>
  `;
}

// Inicializar cuando se pulse la pestaña de contratos
document.addEventListener("DOMContentLoaded", () => {
  let loaded = false;
  document.querySelectorAll(".nav-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      if (tab.dataset.section === "contratos" && !loaded) {
        loaded = true;
        renderContratosSection();
      }
    });
  });
});
