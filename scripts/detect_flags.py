#!/usr/bin/env python3
"""
FiscalizApp — Detector de banderas rojas en contratos públicos

Reglas de detección:
1. FRACCIONAMIENTO: contratos menores del mismo proveedor+órgano con importes 
   entre 14.000-14.999€ (justo bajo el umbral de 15.000€ que exige licitación)
2. CONCENTRACIÓN: un proveedor gana >60% de contratos de un órgano
3. ADJUDICACIÓN SIN COMPETENCIA: importe de adjudicación = presupuesto base (0% baja)
4. NEGOCIADO REPETIDO: mismo proveedor gana múltiples negociados sin publicidad
"""

import json
import os
from collections import defaultdict
from datetime import datetime

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
CONTRATOS_DIR = os.path.join(DATA_DIR, "contratos")
FLAGS_DIR = os.path.join(DATA_DIR, "banderas-rojas")

# Umbrales
UMBRAL_MENOR = 14000  # Importe mínimo sospechoso
UMBRAL_MENOR_MAX = 15000  # Umbral legal de contrato menor
UMBRAL_CONCENTRACION = 0.6  # 60% de contratos al mismo proveedor
MIN_CONTRATOS_CONCENTRACION = 3  # Mínimo de contratos para evaluar concentración
UMBRAL_BAJA_CERO = 0.01  # Menos de 1% de diferencia = sin competencia real


def load_json(filename):
    path = os.path.join(CONTRATOS_DIR, filename)
    if not os.path.exists(path):
        print(f"  ⚠ No existe {path}")
        return {"contratos": []}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def detect_fraccionamiento(menores):
    """
    Detecta posible fraccionamiento de contratos.
    Patrón: mismo proveedor + mismo órgano + importes entre 14.000-14.999€
    """
    flags = []
    
    # Agrupar por (adjudicatario, órgano)
    grupos = defaultdict(list)
    for c in menores:
        adj = c.get("adjudicatario") or c.get("nif_adjudicatario")
        org = c.get("organo") or c.get("nif_organo")
        importe = c.get("importe_adjudicacion") or c.get("presupuesto_base")
        
        if adj and org and importe:
            grupos[(adj, org)].append(c)

    for (adj, org), contratos in grupos.items():
        # Filtrar los que están en la franja sospechosa
        sospechosos = [
            c for c in contratos
            if UMBRAL_MENOR <= (c.get("importe_adjudicacion") or c.get("presupuesto_base") or 0) < UMBRAL_MENOR_MAX
        ]
        
        if len(sospechosos) >= 2:
            total = sum(c.get("importe_adjudicacion") or c.get("presupuesto_base") or 0 for c in sospechosos)
            flags.append({
                "tipo": "fraccionamiento",
                "severidad": "alta" if len(sospechosos) >= 3 else "media",
                "emoji": "🔴" if len(sospechosos) >= 3 else "🟡",
                "adjudicatario": adj,
                "organo": org,
                "num_contratos": len(sospechosos),
                "importe_total": round(total, 2),
                "importe_medio": round(total / len(sospechosos), 2),
                "descripcion": f"{len(sospechosos)} contratos menores entre {UMBRAL_MENOR:,.0f}€ y {UMBRAL_MENOR_MAX:,.0f}€ del mismo proveedor al mismo órgano. Importe total: {total:,.0f}€ — si fuera un solo contrato, requeriría licitación pública.",
                "contratos": [
                    {
                        "expediente": c.get("expediente"),
                        "objeto": c.get("objeto") or c.get("titulo"),
                        "importe": c.get("importe_adjudicacion") or c.get("presupuesto_base"),
                        "enlace": c.get("enlace"),
                    }
                    for c in sospechosos
                ],
            })

    return flags


def detect_concentracion(contratos):
    """
    Detecta concentración anómala de adjudicaciones.
    Patrón: un proveedor gana >60% de los contratos de un órgano.
    """
    flags = []

    # Agrupar por órgano
    por_organo = defaultdict(list)
    for c in contratos:
        org = c.get("organo") or c.get("nif_organo")
        if org:
            por_organo[org].append(c)

    for org, cs in por_organo.items():
        if len(cs) < MIN_CONTRATOS_CONCENTRACION:
            continue

        # Contar por adjudicatario
        por_adj = defaultdict(int)
        for c in cs:
            adj = c.get("adjudicatario") or c.get("nif_adjudicatario")
            if adj:
                por_adj[adj] += 1

        total = len(cs)
        for adj, count in por_adj.items():
            ratio = count / total
            if ratio >= UMBRAL_CONCENTRACION:
                flags.append({
                    "tipo": "concentracion",
                    "severidad": "alta" if ratio >= 0.8 else "media",
                    "emoji": "🔴" if ratio >= 0.8 else "🟡",
                    "adjudicatario": adj,
                    "organo": org,
                    "contratos_proveedor": count,
                    "contratos_totales": total,
                    "porcentaje": round(ratio * 100, 1),
                    "descripcion": f"{adj} gana {count} de {total} contratos ({ratio*100:.0f}%) del {org}. Concentración anómala: ¿falta de competencia o proveedor cautivo?",
                })

    return flags


def detect_baja_cero(contratos):
    """
    Detecta adjudicaciones sin competencia real.
    Patrón: importe adjudicación ≈ presupuesto base (0% de baja).
    """
    flags = []

    for c in contratos:
        base = c.get("presupuesto_base")
        adj = c.get("importe_adjudicacion")

        if base and adj and base > 0:
            diferencia = abs(base - adj) / base
            if diferencia <= UMBRAL_BAJA_CERO and base > 50000:
                flags.append({
                    "tipo": "sin_competencia",
                    "severidad": "media",
                    "emoji": "🟡",
                    "adjudicatario": c.get("adjudicatario"),
                    "organo": c.get("organo"),
                    "presupuesto_base": base,
                    "importe_adjudicacion": adj,
                    "baja_porcentaje": round(diferencia * 100, 2),
                    "objeto": c.get("objeto") or c.get("titulo"),
                    "enlace": c.get("enlace"),
                    "descripcion": f"Adjudicación por {adj:,.0f}€ sobre presupuesto de {base:,.0f}€ (baja del {diferencia*100:.1f}%). Cuando nadie baja el precio, o no hubo competencia real o el presupuesto estaba hecho a medida.",
                })

    return flags


def main():
    os.makedirs(FLAGS_DIR, exist_ok=True)
    timestamp = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    all_flags = []

    # Cargar datos
    print("🔍 Cargando contratos...")
    menores_data = load_json("menores.json")
    licitaciones_data = load_json("licitaciones.json")

    menores = menores_data.get("contratos", [])
    licitaciones = licitaciones_data.get("contratos", [])
    todos = menores + licitaciones

    print(f"   {len(menores)} contratos menores, {len(licitaciones)} licitaciones")

    # Detectar banderas rojas
    print("\n🚩 Buscando fraccionamiento...")
    flags_fracc = detect_fraccionamiento(menores)
    print(f"   → {len(flags_fracc)} alertas")
    all_flags.extend(flags_fracc)

    print("🚩 Buscando concentración anómala...")
    flags_conc = detect_concentracion(todos)
    print(f"   → {len(flags_conc)} alertas")
    all_flags.extend(flags_conc)

    print("🚩 Buscando adjudicaciones sin competencia...")
    flags_baja = detect_baja_cero(licitaciones)
    print(f"   → {len(flags_baja)} alertas")
    all_flags.extend(flags_baja)

    # Ordenar por severidad
    sev_order = {"alta": 0, "media": 1, "baja": 2}
    all_flags.sort(key=lambda f: sev_order.get(f["severidad"], 99))

    # Estadísticas
    stats = {
        "total_flags": len(all_flags),
        "por_tipo": {
            "fraccionamiento": len(flags_fracc),
            "concentracion": len(flags_conc),
            "sin_competencia": len(flags_baja),
        },
        "severidad_alta": sum(1 for f in all_flags if f["severidad"] == "alta"),
        "severidad_media": sum(1 for f in all_flags if f["severidad"] == "media"),
    }

    output = {
        "meta": {
            "generado": timestamp,
            "contratos_analizados": len(todos),
            "contratos_menores": len(menores),
            "licitaciones": len(licitaciones),
        },
        "stats": stats,
        "flags": all_flags,
    }

    output_path = os.path.join(FLAGS_DIR, "latest.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*60}")
    print(f"🎯 RESULTADO: {len(all_flags)} banderas rojas detectadas")
    print(f"   🔴 Alta: {stats['severidad_alta']}")
    print(f"   🟡 Media: {stats['severidad_media']}")
    print(f"📁 Guardado en {output_path}")


if __name__ == "__main__":
    main()
