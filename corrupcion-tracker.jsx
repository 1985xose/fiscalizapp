import { useState, useEffect, useCallback } from "react";

const CASES = [
  {
    id: "begona",
    name: "Caso Begoña Gómez",
    emoji: "👜",
    protagonistas: ["Begoña Gómez", "Pedro Sánchez"],
    descripcion: "Investigación por tráfico de influencias, corrupción en los negocios y apropiación indebida. Cátedra en la Complutense, software con Indra/Telefónica, cartas de recomendación desde Moncloa.",
    juzgado: "Juzgado de Instrucción nº 41 de Madrid",
    juez: "Juan Carlos Peinado",
    estado: "Instrucción",
    color: "#e63946",
    searchQuery: "Begoña Gómez caso judicial 2026",
  },
  {
    id: "koldo",
    name: "Caso Koldo / Mascarillas",
    emoji: "😷",
    protagonistas: ["Koldo García", "José Luis Ábalos", "Víctor de Aldama"],
    descripcion: "Trama de comisiones en la compra de mascarillas durante el COVID por el Ministerio de Transportes. Mediación de Koldo García, asesor de Ábalos, con empresarios como Aldama.",
    juzgado: "Audiencia Nacional",
    juez: "Ismael Moreno",
    estado: "Instrucción",
    color: "#457b9d",
    searchQuery: "caso Koldo mascarillas juicio 2026",
  },
  {
    id: "aldama",
    name: "Caso Aldama / Hidrocarburos",
    emoji: "⛽",
    protagonistas: ["Víctor de Aldama", "Claudio Rivas"],
    descripcion: "Fraude al IVA en comercio de hidrocarburos. Aldama como eje central de la trama, vinculado también al caso Koldo. Declaraciones como investigado colaborador implicando a cargos del PSOE.",
    juzgado: "Audiencia Nacional",
    juez: "Santiago Pedraz",
    estado: "Instrucción",
    color: "#2a9d8f",
    searchQuery: "Aldama hidrocarburos fraude juicio 2026",
  },
  {
    id: "david",
    name: "Caso David Sánchez",
    emoji: "🎵",
    protagonistas: ["David Sánchez Pérez-Castejón"],
    descripcion: "Investigación al hermano del presidente por su puesto en la Diputación de Badajoz como coordinador de actividades musicales. Presuntos delitos contra la Hacienda Pública y tráfico de influencias.",
    juzgado: "Juzgado de Instrucción nº 3 de Badajoz",
    juez: "Adolfo Domínguez",
    estado: "Instrucción",
    color: "#e9c46a",
    searchQuery: "David Sánchez hermano presidente caso judicial 2026",
  },
  {
    id: "ere",
    name: "Caso ERE de Andalucía",
    emoji: "💸",
    protagonistas: ["Manuel Chaves", "José Antonio Griñán", "Magdalena Álvarez"],
    descripcion: "Mayor caso de corrupción institucional: 680M€ en ayudas irregulares a empresas y prejubilaciones sin control. Griñán condenado a prisión por malversación. Chaves inhabilitado.",
    juzgado: "Tribunal Supremo / TC",
    juez: "Varios",
    estado: "Sentencia firme (recursos TC)",
    color: "#f4a261",
    searchQuery: "ERE Andalucía Griñán Chaves Tribunal Constitucional 2026",
  },
  {
    id: "delcy",
    name: "Caso Delcy Rodríguez",
    emoji: "✈️",
    protagonistas: ["José Luis Ábalos", "Delcy Rodríguez", "Koldo García"],
    descripcion: "Escala de la vicepresidenta venezolana (sancionada por la UE) en Barajas en enero 2020. Ábalos acudió al aeropuerto de madrugada. Investigación por posible vulneración de sanciones europeas.",
    juzgado: "Tribunal Supremo",
    juez: "Pendiente",
    estado: "Diligencias previas",
    color: "#264653",
    searchQuery: "Delcy Rodríguez Ábalos Barajas caso 2026",
  },
  {
    id: "zapatero",
    name: "Zapatero y Venezuela",
    emoji: "🇻🇪",
    protagonistas: ["José Luis Rodríguez Zapatero"],
    descripcion: "Investigaciones periodísticas sobre los vínculos de Zapatero con el régimen de Maduro. Presunta mediación en contratos y negocios. Sin causa judicial abierta formalmente por ahora.",
    juzgado: "Sin juzgado asignado",
    juez: "—",
    estado: "Sin causa abierta",
    color: "#6d6875",
    searchQuery: "Zapatero Venezuela Maduro negocios investigación 2026",
  },
  {
    id: "tito_berni",
    name: "Caso Tito Berni",
    emoji: "🍽️",
    protagonistas: ["José Fernández (Tito Berni)", "Koldo García", "Víctor de Aldama"],
    descripcion: "Cenas, regalos y pagos a cargos del PSOE en el restaurante de Tito Berni. Nodo de conexión entre la trama Koldo-Aldama y altos cargos del partido y del Gobierno.",
    juzgado: "Audiencia Nacional",
    juez: "Ismael Moreno",
    estado: "Instrucción (conexo a Koldo)",
    color: "#b5838d",
    searchQuery: "Tito Berni caso restaurante PSOE 2026",
  },
];

const CHASCARRILLOS = [
  "Si la corrupción fuera deporte olímpico, España iría sobrada de medallas.",
  "«No tengo nada que ocultar» — frase que precede al 90% de las imputaciones.",
  "Lo del bulo ya no cuela ni en el bingo del pueblo.",
  "Bienvenido al bingo judicial: si le tocan tres investigados, grita ¡línea!",
  "Instrucción es la forma elegante de decir 'esto huele pero aún no han encontrado el queso'.",
  "Más tramas que una serie de Netflix, pero con peor guión.",
  "En España, la presunción de inocencia aguanta lo que le eches… hasta que no.",
  "Si conectas los hilos de todos los casos, te sale un jersey.",
  "«Eso son bulos de la derecha» — narrador: no eran bulos.",
  "Caso abierto, barra libre de titulares.",
  "Nivel de transparencia: cristal de baño.",
  "Esto tiene más capítulos que Cuéntame.",
];

const ESTADO_BADGES = {
  "Instrucción": { bg: "#fef3c7", text: "#92400e", icon: "🔍" },
  "Instrucción (conexo a Koldo)": { bg: "#fef3c7", text: "#92400e", icon: "🔍" },
  "Diligencias previas": { bg: "#dbeafe", text: "#1e40af", icon: "📋" },
  "Sentencia firme (recursos TC)": { bg: "#fce7f3", text: "#9d174d", icon: "⚖️" },
  "Sin causa abierta": { bg: "#f3f4f6", text: "#374151", icon: "❓" },
};

function getRandomChascarrillo() {
  return CHASCARRILLOS[Math.floor(Math.random() * CHASCARRILLOS.length)];
}

function CaseCard({ caso, onFetchNews, news, loading }) {
  const [expanded, setExpanded] = useState(false);
  const badge = ESTADO_BADGES[caso.estado] || ESTADO_BADGES["Instrucción"];

  return (
    <div
      style={{
        background: "#1a1a2e",
        borderLeft: `4px solid ${caso.color}`,
        borderRadius: "2px",
        padding: "20px 24px",
        marginBottom: "16px",
        transition: "all 0.2s ease",
        cursor: "pointer",
        position: "relative",
        overflow: "hidden",
      }}
      onClick={() => setExpanded(!expanded)}
    >
      <div style={{
        position: "absolute", top: 0, right: 0, width: "120px", height: "120px",
        background: `radial-gradient(circle at top right, ${caso.color}15, transparent 70%)`,
        pointerEvents: "none",
      }} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1 }}>
          <span style={{ fontSize: "28px" }}>{caso.emoji}</span>
          <div>
            <h3 style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "20px", fontWeight: 700, color: "#e8e8e8",
              margin: 0, letterSpacing: "-0.02em",
            }}>{caso.name}</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
              {caso.protagonistas.map((p, i) => (
                <span key={i} style={{
                  fontSize: "11px", color: "#9ca3af", background: "#ffffff0a",
                  padding: "2px 8px", borderRadius: "2px", fontFamily: "'JetBrains Mono', monospace",
                }}>{p}</span>
              ))}
            </div>
          </div>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: "6px",
          background: badge.bg, color: badge.text,
          padding: "4px 12px", borderRadius: "2px",
          fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap",
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          <span>{badge.icon}</span>
          {caso.estado}
        </div>
      </div>

      <p style={{
        fontFamily: "'Libre Baskerville', Georgia, serif",
        fontSize: "14px", color: "#9ca3af", lineHeight: 1.65,
        margin: 0,
      }}>{caso.descripcion}</p>

      {expanded && (
        <div style={{
          marginTop: "16px", paddingTop: "16px",
          borderTop: "1px solid #ffffff10",
          animation: "fadeIn 0.3s ease",
        }}>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px",
            marginBottom: "16px",
          }}>
            <div style={{ background: "#ffffff06", padding: "12px", borderRadius: "2px" }}>
              <span style={{ fontSize: "10px", textTransform: "uppercase", color: "#6b7280", letterSpacing: "0.1em", fontFamily: "'JetBrains Mono', monospace" }}>Juzgado</span>
              <p style={{ margin: "4px 0 0", color: "#d1d5db", fontSize: "13px", fontFamily: "'Libre Baskerville', serif" }}>{caso.juzgado}</p>
            </div>
            <div style={{ background: "#ffffff06", padding: "12px", borderRadius: "2px" }}>
              <span style={{ fontSize: "10px", textTransform: "uppercase", color: "#6b7280", letterSpacing: "0.1em", fontFamily: "'JetBrains Mono', monospace" }}>Juez</span>
              <p style={{ margin: "4px 0 0", color: "#d1d5db", fontSize: "13px", fontFamily: "'Libre Baskerville', serif" }}>{caso.juez}</p>
            </div>
          </div>

          <button
            onClick={(e) => { e.stopPropagation(); onFetchNews(caso); }}
            disabled={loading}
            style={{
              background: loading ? "#374151" : caso.color,
              color: "#fff", border: "none", padding: "10px 20px",
              borderRadius: "2px", cursor: loading ? "wait" : "pointer",
              fontFamily: "'JetBrains Mono', monospace", fontSize: "12px",
              fontWeight: 600, letterSpacing: "0.05em",
              textTransform: "uppercase", width: "100%",
              transition: "all 0.2s ease",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "⏳ Buscando en medios españoles..." : "🔍 Buscar últimas noticias"}
          </button>

          {news && (
            <div style={{
              marginTop: "16px", background: "#0d1117",
              padding: "16px", borderRadius: "2px",
              border: "1px solid #ffffff10",
            }}>
              <div style={{
                display: "flex", alignItems: "center", gap: "8px",
                marginBottom: "12px",
              }}>
                <span style={{ fontSize: "14px" }}>📰</span>
                <span style={{
                  fontSize: "11px", textTransform: "uppercase",
                  color: caso.color, fontWeight: 700, letterSpacing: "0.1em",
                  fontFamily: "'JetBrains Mono', monospace",
                }}>Últimas novedades</span>
              </div>
              <div style={{
                color: "#c9d1d9", fontSize: "14px",
                lineHeight: 1.75, fontFamily: "'Libre Baskerville', serif",
                whiteSpace: "pre-wrap",
              }}>
                {news}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{
        display: "flex", justifyContent: "flex-end", marginTop: "12px",
      }}>
        <span style={{ fontSize: "11px", color: "#4b5563", fontFamily: "'JetBrains Mono', monospace" }}>
          {expanded ? "▲ Cerrar" : "▼ Ver detalles y noticias"}
        </span>
      </div>
    </div>
  );
}

function StatsBar() {
  const enInstruccion = CASES.filter(c => c.estado.includes("Instrucción")).length;
  const total = CASES.length;
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px",
      marginBottom: "32px",
    }}>
      {[
        { label: "Casos totales", value: total, icon: "📂" },
        { label: "En instrucción", value: enInstruccion, icon: "🔍" },
        { label: "Investigados", value: "20+", icon: "👥" },
        { label: "Millones €", value: "680+", icon: "💰" },
      ].map((s, i) => (
        <div key={i} style={{
          background: "#1a1a2e", padding: "16px", borderRadius: "2px",
          textAlign: "center", border: "1px solid #ffffff08",
        }}>
          <span style={{ fontSize: "24px" }}>{s.icon}</span>
          <div style={{
            fontSize: "28px", fontWeight: 800, color: "#e8e8e8",
            fontFamily: "'Playfair Display', serif", marginTop: "4px",
          }}>{s.value}</div>
          <div style={{
            fontSize: "10px", color: "#6b7280", textTransform: "uppercase",
            letterSpacing: "0.12em", fontFamily: "'JetBrains Mono', monospace",
            marginTop: "2px",
          }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

export default function CorrupcionTracker() {
  const [newsMap, setNewsMap] = useState({});
  const [loadingId, setLoadingId] = useState(null);
  const [chascarrillo, setChascarrillo] = useState(getRandomChascarrillo());
  const [filter, setFilter] = useState("todos");
  const [allNews, setAllNews] = useState(null);
  const [allLoading, setAllLoading] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setChascarrillo(getRandomChascarrillo()), 12000);
    return () => clearInterval(interval);
  }, []);

  const fetchNews = useCallback(async (caso) => {
    setLoadingId(caso.id);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{
            role: "user",
            content: `Busca las últimas noticias sobre: ${caso.searchQuery}

Responde SOLO en español. Resume las novedades más recientes del caso judicial en 3-5 puntos clave. Para cada punto incluye la fecha si la encuentras y el medio que lo publica. Al final añade un comentario irónico o chascarrillo breve sobre el estado del caso (con humor ácido pero sin insultos directos). Formato limpio sin markdown.`
          }],
        }),
      });
      const data = await response.json();
      const text = data.content
        ?.filter(item => item.type === "text")
        .map(item => item.text)
        .join("\n") || "No se encontraron novedades recientes.";
      setNewsMap(prev => ({ ...prev, [caso.id]: text }));
    } catch (err) {
      setNewsMap(prev => ({ ...prev, [caso.id]: "❌ Error al buscar noticias. Inténtalo de nuevo." }));
    }
    setLoadingId(null);
  }, []);

  const fetchAllNews = useCallback(async () => {
    setAllLoading(true);
    try {
      const caseNames = CASES.map(c => c.name).join(", ");
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{
            role: "user",
            content: `Busca las noticias más recientes de hoy o esta semana sobre corrupción del PSOE en España. Casos relevantes: ${caseNames}.

Responde SOLO en español. Haz un resumen ejecutivo de las novedades más importantes de los últimos días, agrupando por caso si es posible. Incluye fechas y medios. Al final suelta un chascarrillo ácido sobre el panorama general. Formato limpio, sin markdown.`
          }],
        }),
      });
      const data = await response.json();
      const text = data.content
        ?.filter(item => item.type === "text")
        .map(item => item.text)
        .join("\n") || "No se encontraron novedades recientes.";
      setAllNews(text);
    } catch (err) {
      setAllNews("❌ Error al buscar noticias. Inténtalo de nuevo.");
    }
    setAllLoading(false);
  }, []);

  const filteredCases = filter === "todos"
    ? CASES
    : CASES.filter(c => {
      if (filter === "instruccion") return c.estado.includes("Instrucción");
      if (filter === "otros") return !c.estado.includes("Instrucción");
      return true;
    });

  return (
    <div style={{
      minHeight: "100vh", background: "#0f0f23",
      color: "#e8e8e8", fontFamily: "'Libre Baskerville', Georgia, serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes ticker { 0% { opacity: 0; transform: translateY(10px); } 10% { opacity: 1; transform: translateY(0); } 90% { opacity: 1; transform: translateY(0); } 100% { opacity: 0; transform: translateY(-10px); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        * { box-sizing: border-box; scrollbar-width: thin; scrollbar-color: #374151 transparent; }
      `}</style>

      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #1a0000 0%, #0f0f23 50%, #001a1a 100%)",
        borderBottom: "1px solid #ffffff10",
        padding: "32px 24px 24px",
      }}>
        <div style={{ maxWidth: "900px", margin: "0 auto" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: "8px",
            marginBottom: "8px",
          }}>
            <span style={{
              background: "#e63946", width: "8px", height: "8px",
              borderRadius: "50%", display: "inline-block",
              animation: "pulse 2s infinite",
            }} />
            <span style={{
              fontSize: "10px", color: "#e63946", textTransform: "uppercase",
              letterSpacing: "0.2em", fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 700,
            }}>Seguimiento en directo</span>
          </div>

          <h1 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: "42px", fontWeight: 900, margin: "0 0 8px",
            letterSpacing: "-0.03em", lineHeight: 1.1,
            background: "linear-gradient(135deg, #e8e8e8, #9ca3af)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            El Enjuague
          </h1>
          <p style={{
            fontSize: "15px", color: "#6b7280", margin: "0 0 20px",
            fontFamily: "'Libre Baskerville', serif", fontStyle: "italic",
          }}>
            Tracker de casos judiciales vinculados al PSOE — porque alguien tiene que llevar la cuenta
          </p>

          {/* Chascarrillo ticker */}
          <div style={{
            background: "#ffffff06", border: "1px solid #ffffff0a",
            padding: "12px 16px", borderRadius: "2px",
            display: "flex", alignItems: "center", gap: "12px",
          }}>
            <span style={{ fontSize: "16px" }}>🫠</span>
            <p key={chascarrillo} style={{
              margin: 0, fontSize: "13px", color: "#9ca3af",
              fontStyle: "italic", fontFamily: "'Libre Baskerville', serif",
              animation: "ticker 12s ease-in-out",
            }}>
              {chascarrillo}
            </p>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "32px 24px" }}>
        <StatsBar />

        {/* Controls */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: "24px", flexWrap: "wrap", gap: "12px",
        }}>
          <div style={{ display: "flex", gap: "8px" }}>
            {[
              { key: "todos", label: "Todos" },
              { key: "instruccion", label: "En instrucción" },
              { key: "otros", label: "Otros estados" },
            ].map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)} style={{
                background: filter === f.key ? "#e63946" : "#ffffff08",
                color: filter === f.key ? "#fff" : "#9ca3af",
                border: "none", padding: "8px 16px", borderRadius: "2px",
                cursor: "pointer", fontSize: "11px", fontWeight: 600,
                fontFamily: "'JetBrains Mono', monospace",
                textTransform: "uppercase", letterSpacing: "0.05em",
                transition: "all 0.2s ease",
              }}>{f.label}</button>
            ))}
          </div>
          <button
            onClick={fetchAllNews}
            disabled={allLoading}
            style={{
              background: allLoading ? "#374151" : "linear-gradient(135deg, #e63946, #c41d2e)",
              color: "#fff", border: "none", padding: "10px 24px",
              borderRadius: "2px", cursor: allLoading ? "wait" : "pointer",
              fontFamily: "'JetBrains Mono', monospace", fontSize: "12px",
              fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase",
              transition: "all 0.2s ease",
            }}
          >
            {allLoading ? "⏳ Rastreando medios..." : "📡 Resumen general de hoy"}
          </button>
        </div>

        {/* All news summary */}
        {allNews && (
          <div style={{
            background: "#1a1a2e", border: "1px solid #e6394630",
            borderRadius: "2px", padding: "20px 24px", marginBottom: "24px",
            animation: "fadeIn 0.4s ease",
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: "8px",
              marginBottom: "12px",
            }}>
              <span style={{ fontSize: "16px" }}>📡</span>
              <span style={{
                fontSize: "12px", textTransform: "uppercase", color: "#e63946",
                fontWeight: 700, letterSpacing: "0.1em",
                fontFamily: "'JetBrains Mono', monospace",
              }}>Resumen general</span>
              <button onClick={() => setAllNews(null)} style={{
                marginLeft: "auto", background: "none", border: "none",
                color: "#6b7280", cursor: "pointer", fontSize: "16px",
              }}>✕</button>
            </div>
            <div style={{
              color: "#c9d1d9", fontSize: "14px", lineHeight: 1.75,
              fontFamily: "'Libre Baskerville', serif", whiteSpace: "pre-wrap",
            }}>
              {allNews}
            </div>
          </div>
        )}

        {/* Cases */}
        {filteredCases.map(caso => (
          <CaseCard
            key={caso.id}
            caso={caso}
            onFetchNews={fetchNews}
            news={newsMap[caso.id]}
            loading={loadingId === caso.id}
          />
        ))}

        {/* Footer */}
        <div style={{
          textAlign: "center", padding: "40px 0 20px",
          borderTop: "1px solid #ffffff08",
          marginTop: "32px",
        }}>
          <p style={{
            fontSize: "11px", color: "#4b5563",
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            EL ENJUAGUE v1.0 — Datos judiciales públicos — Noticias vía búsqueda web en tiempo real
          </p>
          <p style={{
            fontSize: "11px", color: "#374151",
            fontFamily: "'JetBrains Mono', monospace",
            marginTop: "4px",
          }}>
            «La corrupción es como los virus: muta, se adapta y siempre encuentra un huésped»
          </p>
        </div>
      </div>
    </div>
  );
}
