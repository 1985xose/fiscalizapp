#!/usr/bin/env python3
"""
FiscalizApp — Detector de banderas rojas en contratos públicos v2

Diseñado para minimizar falsos positivos. Cada regla tiene umbrales altos
y requiere múltiples señales convergentes antes de marcar una alerta.

Marco legal de referencia:
- Contratos menores servicios/suministros: hasta 15.000€ sin IVA (art. 118 LCSP)
- Contratos menores obras: hasta 40.000€ sin IVA (art. 118 LCSP)
- Por encima: se requiere licitación pública con publicidad y concurrencia

Patrones de fraude documentados en informes de la OIReScon, Tribunal de Cuentas
y Fiscalía Anticorrupción:
"""

import json
import os
from collections import defaultdict
from datetime import datetime

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
CONTRATOS_DIR = os.path.join(DATA_DIR, "contratos")
FLAGS_DIR = os.path.join(DATA_DIR, "banderas-rojas")

# ============================================================
# REGLA 1: FRACCIONAMIENTO DE CONTRATOS
# ============================================================
# El fraccionamiento consiste en dividir un contrato que debería
# licitarse en varios contratos menores para evitar los umbrales
# legales. Requiere MÚLTIPLES señales convergentes:
#
# - Mismo proveedor + mismo órgano
# - Importes concentrados en la franja justo bajo el umbral
# - Al menos 3 contratos (2 puede ser casualidad)
# - Importe acumulado supera el umbral (si fueran uno solo, licitarían)
#
# Umbrales LCSP:
UMBRAL_SERVICIOS = 15000    # €, sin IVA
UMBRAL_OBRAS = 40000        # €, sin IVA
# Franjas sospechosas (80-99.9% del umbral):
FRANJA_SERVICIOS = (12000, 14999.99)
FRANJA_OBRAS = (32000, 39999.99)
# Mínimo de contratos para considerar fraccionamiento:
MIN_CONTRATOS_FRACC = 3


def detect_fraccionamiento(menores):
    """
    Detecta fraccionamiento de contratos menores.
    Solo salta cuando hay EVIDENCIA FUERTE:
    - 3+ contratos del mismo proveedor al mismo órgano
    - Importes en la franja justo bajo el umbral legal
    - El total acumulado supera el umbral (prueba de que debería haberse licitado)
    """
    flags = []

    # Agrupar por (adjudicatario, órgano)
    grupos = defaultdict(list)
    for c in menores:
        adj = c.get("adjudicatario") or c.get("nif_adjudicatario")
        org = c.get("organo") or c.get("nif_organo")
        importe = c.get("importe_adjudicacion") or c.get("presupuesto_base")

        if adj and org and importe and isinstance(importe, (int, float)):
            grupos[(adj, org)].append(c)

    for (adj, org), contratos in grupos.items():
        # Separar por franja de servicios/suministros
        en_franja_serv = [
            c for c in contratos
            if FRANJA_SERVICIOS[0] <= (c.get("importe_adjudicacion") or c.get("presupuesto_base") or 0) <= FRANJA_SERVICIOS[1]
        ]

        # Separar por franja de obras
        en_franja_obras = [
            c for c in contratos
            if FRANJA_OBRAS[0] <= (c.get("importe_adjudicacion") or c.get("presupuesto_base") or 0) <= FRANJA_OBRAS[1]
        ]

        for sospechosos, umbral, tipo_umbral in [
            (en_franja_serv, UMBRAL_SERVICIOS, "servicios/suministros"),
            (en_franja_obras, UMBRAL_OBRAS, "obras"),
        ]:
            if len(sospechosos) < MIN_CONTRATOS_FRACC:
                continue

            total = sum(
                c.get("importe_adjudicacion") or c.get("presupuesto_base") or 0
                for c in sospechosos
            )
            media = total / len(sospechosos)

            # El total debe superar el umbral (si no, no habría motivo para fraccionar)
            if total <= umbral:
                continue

            # Calcular dispersión de importes (si todos son MUY similares, más sospechoso)
            importes = [c.get("importe_adjudicacion") or c.get("presupuesto_base") for c in sospechosos]
            rango = max(importes) - min(importes)
            dispersion_baja = rango < (umbral * 0.15)  # Menos de 15% de variación

            # Severidad basada en acumulación de señales
            score = 0
            score += min(len(sospechosos), 5)  # Más contratos = más sospechoso (max 5 pts)
            score += 3 if dispersion_baja else 0  # Importes muy similares = +3
            score += 2 if total > umbral * 2 else 0  # Total > 2x umbral = +2
            score += 2 if len(sospechosos) >= 5 else 0  # 5+ contratos = +2

            severidad = "alta" if score >= 8 else "media"

            flags.append({
                "tipo": "fraccionamiento",
                "severidad": severidad,
                "emoji": "🔴" if severidad == "alta" else "🟡",
                "score": score,
                "adjudicatario": adj,
                "organo": org,
                "num_contratos": len(sospechosos),
                "importe_total": round(total, 2),
                "importe_medio": round(media, 2),
                "umbral_legal": umbral,
                "tipo_umbral": tipo_umbral,
                "dispersion_baja": dispersion_baja,
                "descripcion": (
                    f"{len(sospechosos)} contratos menores de {tipo_umbral} entre "
                    f"{FRANJA_SERVICIOS[0]:,.0f}€ y {FRANJA_SERVICIOS[1]:,.0f}€ "
                    f"del mismo proveedor al mismo órgano. "
                    f"Total acumulado: {total:,.0f}€ — supera el umbral de {umbral:,.0f}€ "
                    f"que obligaría a licitar públicamente. "
                    f"{'Además, los importes son sospechosamente similares entre sí.' if dispersion_baja else ''}"
                ),
                "contratos": [
                    {
                        "expediente": c.get("expediente"),
                        "objeto": c.get("objeto") or c.get("titulo"),
                        "importe": c.get("importe_adjudicacion") or c.get("presupuesto_base"),
                        "fecha": c.get("actualizado"),
                        "enlace": c.get("enlace"),
                    }
                    for c in sospechosos
                ],
            })

    return flags


# ============================================================
# REGLA 2: CONCENTRACIÓN EXTREMA
# ============================================================
# Un proveedor que gana casi todos los contratos de un órgano.
# Para evitar falsos positivos en órganos pequeños:
# - Requiere mínimo 5 contratos en el órgano
# - Umbral de 80% (no 60%)
# - Se calcula también el importe acumulado, no solo la cantidad
#
MIN_CONTRATOS_CONC = 5
UMBRAL_CONCENTRACION = 0.80  # 80%


def detect_concentracion(contratos):
    """
    Detecta proveedores que acaparan contratos de un órgano.
    Solo salta con:
    - Mínimo 5 contratos en el órgano (evita órganos pequeños)
    - Un proveedor gana 80%+ de los contratos
    """
    flags = []

    por_organo = defaultdict(list)
    for c in contratos:
        org = c.get("organo") or c.get("nif_organo")
        adj = c.get("adjudicatario") or c.get("nif_adjudicatario")
        if org and adj:
            por_organo[org].append(c)

    for org, cs in por_organo.items():
        if len(cs) < MIN_CONTRATOS_CONC:
            continue

        # Contar contratos por adjudicatario
        por_adj = defaultdict(lambda: {"count": 0, "importe": 0})
        for c in cs:
            adj = c.get("adjudicatario") or c.get("nif_adjudicatario")
            imp = c.get("importe_adjudicacion") or c.get("presupuesto_base") or 0
            por_adj[adj]["count"] += 1
            por_adj[adj]["importe"] += imp if isinstance(imp, (int, float)) else 0

        total_contratos = len(cs)
        total_importe = sum(d["importe"] for d in por_adj.values())

        for adj, data in por_adj.items():
            ratio_count = data["count"] / total_contratos
            ratio_importe = data["importe"] / total_importe if total_importe > 0 else 0

            if ratio_count >= UMBRAL_CONCENTRACION:
                # Severidad: alta si concentra tanto en número como en importe
                severidad = "alta" if (ratio_count >= 0.9 or ratio_importe >= 0.85) else "media"

                flags.append({
                    "tipo": "concentracion",
                    "severidad": severidad,
                    "emoji": "🔴" if severidad == "alta" else "🟡",
                    "adjudicatario": adj,
                    "organo": org,
                    "contratos_proveedor": data["count"],
                    "contratos_totales": total_contratos,
                    "porcentaje_contratos": round(ratio_count * 100, 1),
                    "importe_proveedor": round(data["importe"], 2),
                    "importe_total_organo": round(total_importe, 2),
                    "porcentaje_importe": round(ratio_importe * 100, 1),
                    "descripcion": (
                        f"{adj} gana {data['count']} de {total_contratos} contratos "
                        f"({ratio_count*100:.0f}%) del {org}, "
                        f"acumulando {data['importe']:,.0f}€ de {total_importe:,.0f}€ "
                        f"({ratio_importe*100:.0f}% del importe total). "
                        f"Concentración que merece explicación: ¿proveedor único justificado o cautividad?"
                    ),
                })

    return flags


# ============================================================
# REGLA 3: PATRÓN DE UMBRAL (ANÁLISIS ESTADÍSTICO)
# ============================================================
# Un órgano que tiene una proporción anómala de contratos
# justo bajo el umbral legal. No mira proveedores individuales —
# mira el comportamiento del ÓRGANO en su conjunto.
#
# Si >40% de los contratos de un órgano están en el rango
# 12.000-14.999€, algo huele. En condiciones normales,
# los importes deberían distribuirse uniformemente.
#
MIN_CONTRATOS_PATRON = 10  # Mínimo contratos para análisis estadístico
UMBRAL_PATRON = 0.40       # 40% de contratos en franja sospechosa


def detect_patron_umbral(menores):
    """
    Detecta órganos con proporción anómala de contratos cerca del umbral.
    Esto detecta fraccionamiento SISTEMÁTICO incluso cuando usan
    diferentes proveedores para disimular.
    """
    flags = []

    por_organo = defaultdict(list)
    for c in menores:
        org = c.get("organo") or c.get("nif_organo")
        imp = c.get("importe_adjudicacion") or c.get("presupuesto_base")
        if org and imp and isinstance(imp, (int, float)):
            por_organo[org].append(c)

    for org, cs in por_organo.items():
        if len(cs) < MIN_CONTRATOS_PATRON:
            continue

        importes = [
            c.get("importe_adjudicacion") or c.get("presupuesto_base")
            for c in cs
            if isinstance(c.get("importe_adjudicacion") or c.get("presupuesto_base"), (int, float))
        ]

        en_franja = [i for i in importes if FRANJA_SERVICIOS[0] <= i <= FRANJA_SERVICIOS[1]]
        ratio = len(en_franja) / len(importes) if importes else 0

        if ratio >= UMBRAL_PATRON and len(en_franja) >= 4:
            # Calcular cuántos proveedores distintos hay en la franja
            proveedores_franja = set()
            for c in cs:
                imp = c.get("importe_adjudicacion") or c.get("presupuesto_base") or 0
                if FRANJA_SERVICIOS[0] <= imp <= FRANJA_SERVICIOS[1]:
                    adj = c.get("adjudicatario") or c.get("nif_adjudicatario")
                    if adj:
                        proveedores_franja.add(adj)

            flags.append({
                "tipo": "patron_umbral",
                "severidad": "alta" if ratio >= 0.6 else "media",
                "emoji": "🔴" if ratio >= 0.6 else "🟡",
                "organo": org,
                "contratos_en_franja": len(en_franja),
                "contratos_totales": len(importes),
                "porcentaje": round(ratio * 100, 1),
                "proveedores_distintos": len(proveedores_franja),
                "importe_medio_franja": round(sum(en_franja) / len(en_franja), 2),
                "descripcion": (
                    f"El {org} tiene {len(en_franja)} de {len(importes)} contratos menores "
                    f"({ratio*100:.0f}%) concentrados entre {FRANJA_SERVICIOS[0]:,.0f}€ y "
                    f"{FRANJA_SERVICIOS[1]:,.0f}€ — la franja justo bajo el umbral de licitación. "
                    f"Distribuidos entre {len(proveedores_franja)} proveedores distintos. "
                    f"Estadísticamente improbable sin intervención deliberada."
                ),
            })

    return flags


# ============================================================
# REGLA 4: PROVEEDOR OMNIPRESENTE
# ============================================================
# Un proveedor que aparece en contratos menores de muchos órganos
# distintos, todos cerca del umbral. Puede indicar una empresa
# creada expresamente para captar contratos menores fraccionados
# en múltiples administraciones.
#
MIN_ORGANOS_OMNIPRESENTE = 3  # Aparece en 3+ órganos distintos


def detect_proveedor_omnipresente(menores):
    """
    Detecta proveedores que aparecen en múltiples órganos
    con contratos cerca del umbral.
    """
    flags = []

    # Agrupar por proveedor
    por_proveedor = defaultdict(lambda: defaultdict(list))
    for c in menores:
        adj = c.get("adjudicatario") or c.get("nif_adjudicatario")
        org = c.get("organo") or c.get("nif_organo")
        imp = c.get("importe_adjudicacion") or c.get("presupuesto_base") or 0

        if adj and org and isinstance(imp, (int, float)):
            if FRANJA_SERVICIOS[0] <= imp <= FRANJA_SERVICIOS[1]:
                por_proveedor[adj][org].append(c)

    for adj, organos in por_proveedor.items():
        if len(organos) < MIN_ORGANOS_OMNIPRESENTE:
            continue

        total_contratos = sum(len(cs) for cs in organos.values())
        total_importe = sum(
            sum(c.get("importe_adjudicacion") or c.get("presupuesto_base") or 0 for c in cs)
            for cs in organos.values()
        )

        if total_contratos >= 5:  # Al menos 5 contratos en total
            flags.append({
                "tipo": "omnipresente",
                "severidad": "alta" if len(organos) >= 5 else "media",
                "emoji": "🔴" if len(organos) >= 5 else "🟡",
                "adjudicatario": adj,
                "num_organos": len(organos),
                "num_contratos": total_contratos,
                "importe_total": round(total_importe, 2),
                "organos": list(organos.keys())[:10],  # Máx 10 para no saturar
                "descripcion": (
                    f"{adj} aparece en contratos menores de {len(organos)} órganos "
                    f"distintos, todos en la franja {FRANJA_SERVICIOS[0]:,.0f}-"
                    f"{FRANJA_SERVICIOS[1]:,.0f}€. {total_contratos} contratos "
                    f"por {total_importe:,.0f}€ en total. "
                    f"Un proveedor que aparece sistemáticamente justo bajo el umbral "
                    f"en múltiples administraciones es una señal de alerta seria."
                ),
            })

    return flags


# ============================================================
# MAIN
# ============================================================

def main():
    os.makedirs(FLAGS_DIR, exist_ok=True)
    timestamp = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    all_flags = []

    # Cargar datos
    print("🔍 Cargando contratos...")
    menores = []
    licitaciones = []

    men_path = os.path.join(CONTRATOS_DIR, "menores.json")
    lic_path = os.path.join(CONTRATOS_DIR, "licitaciones.json")

    if os.path.exists(men_path):
        with open(men_path, "r", encoding="utf-8") as f:
            menores = json.load(f).get("contratos", [])
    if os.path.exists(lic_path):
        with open(lic_path, "r", encoding="utf-8") as f:
            licitaciones = json.load(f).get("contratos", [])

    todos = menores + licitaciones
    print(f"   {len(menores)} contratos menores")
    print(f"   {len(licitaciones)} licitaciones")
    print(f"   {len(todos)} total")

    # Ejecutar detectores
    print("\n🚩 REGLA 1: Fraccionamiento de contratos...")
    flags_fracc = detect_fraccionamiento(menores)
    print(f"   → {len(flags_fracc)} alertas")
    all_flags.extend(flags_fracc)

    print("🚩 REGLA 2: Concentración extrema de proveedor...")
    flags_conc = detect_concentracion(todos)
    print(f"   → {len(flags_conc)} alertas")
    all_flags.extend(flags_conc)

    print("🚩 REGLA 3: Patrón estadístico de umbral...")
    flags_patron = detect_patron_umbral(menores)
    print(f"   → {len(flags_patron)} alertas")
    all_flags.extend(flags_patron)

    print("🚩 REGLA 4: Proveedor omnipresente...")
    flags_omni = detect_proveedor_omnipresente(menores)
    print(f"   → {len(flags_omni)} alertas")
    all_flags.extend(flags_omni)

    # Ordenar por severidad y score
    sev_order = {"alta": 0, "media": 1, "baja": 2}
    all_flags.sort(key=lambda f: (sev_order.get(f["severidad"], 99), -f.get("score", 0)))

    # Estadísticas
    stats = {
        "total_flags": len(all_flags),
        "por_tipo": {
            "fraccionamiento": len(flags_fracc),
            "concentracion": len(flags_conc),
            "patron_umbral": len(flags_patron),
            "omnipresente": len(flags_omni),
        },
        "severidad_alta": sum(1 for f in all_flags if f["severidad"] == "alta"),
        "severidad_media": sum(1 for f in all_flags if f["severidad"] == "media"),
    }

    output = {
        "meta": {
            "generado": timestamp,
            "version_detector": "2.0",
            "contratos_analizados": len(todos),
            "contratos_menores": len(menores),
            "licitaciones": len(licitaciones),
            "reglas": [
                "Fraccionamiento: 3+ contratos del mismo proveedor/órgano en franja 80-99% del umbral legal, total acumulado > umbral",
                "Concentración: 80%+ de contratos de un órgano a un solo proveedor (mín. 5 contratos)",
                "Patrón umbral: >40% de contratos de un órgano concentrados justo bajo el umbral legal (mín. 10 contratos)",
                "Omnipresente: proveedor con contratos cerca del umbral en 3+ órganos distintos (mín. 5 contratos)",
            ],
        },
        "stats": stats,
        "flags": all_flags,
    }

    output_path = os.path.join(FLAGS_DIR, "latest.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*60}")
    print(f"🎯 RESULTADO: {len(all_flags)} banderas rojas detectadas")
    print(f"   🔴 Severidad alta: {stats['severidad_alta']}")
    print(f"   🟡 Severidad media: {stats['severidad_media']}")
    print(f"   ✂️  Fraccionamiento: {len(flags_fracc)}")
    print(f"   🎯 Concentración: {len(flags_conc)}")
    print(f"   📊 Patrón umbral: {len(flags_patron)}")
    print(f"   👁️  Omnipresente: {len(flags_omni)}")
    print(f"📁 Guardado en {output_path}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
