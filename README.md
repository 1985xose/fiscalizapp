# FiscalizApp

Herramienta ciudadana para fiscalizar la actividad política y el gasto público en España. Sin servidores, sin coste, con fuentes enlazadas en cada dato.

Web: https://1985xose.github.io/fiscalizapp/

## Qué hay dentro

| Sección | Fuente | Actualización |
|---|---|---|
| Casos de corrupción | Curación manual con fuentes periodísticas y judiciales | Manual |
| Contratos públicos | PLACSP (sindicaciones 643 y 1143) | Diaria, GitHub Actions |
| Patrimonios | Declaraciones de bienes (Congreso, Senado, BOE) | Manual |
| Senadores XV | XML oficial del Senado | Puntual |
| Congresistas XV | BOCG D-10 del Congreso | Puntual, en revisión |

## Cómo funciona

- Frontend estático (HTML, CSS y JS sin build) servido por GitHub Pages.
- Pipeline de datos en Python dentro de GitHub Actions. El workflow `daily-update.yml` descarga cada día los contratos de la PLACSP, pasa los 6 detectores de banderas rojas y commitea solo los ficheros pequeños (`data/contratos/resumen.json` y `data/banderas-rojas/latest.json`).
- El dataset completo de contratos (`data/contratos/all_contracts.json`) no se commitea. Se conserva entre ejecuciones con la caché de Actions y se mantienen 3 meses de histórico.
- Las banderas rojas no significan corrupción. Significan que un contrato merece una mirada atenta.

## Estructura

```
index.html                 Página única, navegación por pestañas
js/                        Lógica de cada sección
data/casos-corrupcion.json Casos curados
data/patrimonios/          Políticos, metodología, glosario, IPC, sueldos
data/congreso_xv.json      Declaraciones de diputados (parser en revisión)
data/senadores_xv.json     Declaraciones de senadores
scripts/ingest_placsp.py   Descarga de la PLACSP (feed ATOM + ZIP de respaldo)
scripts/detect_flags.py    Detector de banderas rojas
```

## Licencia y fuentes

Datos públicos de sus respectivas fuentes oficiales. El código es libre para reutilizar citando el proyecto.
