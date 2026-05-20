#!/usr/bin/env python3
"""
FiscalizApp — Detector de banderas rojas v3 (6 reglas)

1. Fraccionamiento: 3+ menores mismo proveedor/órgano en franja 80-99% umbral
2. Concentración: 80%+ contratos de un órgano a un proveedor (mín 5)
3. Patrón umbral: >40% menores de un órgano en franja sospechosa (mín 10)
4. Omnipresente: proveedor en 3+ órganos con contratos cerca del umbral
5. Negociado reiterado: 3+ contratos por negociado sin publicidad al mismo proveedor
6. Umbral europeo: mismo patrón que fraccionamiento pero con umbral UE ~140K€
"""
import json, os
from collections import defaultdict
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(os.path.dirname(SCRIPT_DIR), "data")
CONTRACTS_FILE = os.path.join(DATA_DIR, "contratos", "all_contracts.json")
FLAGS_DIR = os.path.join(DATA_DIR, "banderas-rojas")

# Umbrales LCSP
UMBRAL_SERV = 15000
UMBRAL_OBRA = 40000
FRANJA_SERV = (12000, 14999.99)
FRANJA_OBRA = (32000, 39999.99)
# Umbrales UE (contratación armonizada)
UMBRAL_EU_SERV = 140000
FRANJA_EU_SERV = (112000, 139999.99)  # 80-99% del umbral
# Procedimiento negociado sin publicidad (códigos PLACSP)
NEGOCIADO_SIN_PUB = {"4", "negociado sin publicidad", "negociado sin pub.", "neg. sin publicidad", "procsinneg"}

def imp(c):
    v = c.get("importe_adjudicacion") or c.get("presupuesto_base")
    return v if isinstance(v, (int, float)) else None

# ============================================================
# REGLA 1: FRACCIONAMIENTO (contratos menores)
# ============================================================
def detect_fraccionamiento(menores):
    flags = []
    grupos = defaultdict(list)
    for c in menores:
        adj = c.get("adjudicatario") or c.get("nif_adjudicatario")
        org = c.get("organo") or c.get("nif_organo")
        i = imp(c)
        if adj and org and i: grupos[(adj, org)].append(c)

    for (adj, org), cs in grupos.items():
        for franja, umbral, tipo in [(FRANJA_SERV, UMBRAL_SERV, "servicios"), (FRANJA_OBRA, UMBRAL_OBRA, "obras")]:
            sosp = [c for c in cs if franja[0] <= (imp(c) or 0) <= franja[1]]
            if len(sosp) < 3: continue
            total = sum(imp(c) or 0 for c in sosp)
            if total <= umbral: continue
            importes = [imp(c) for c in sosp]
            rango = max(importes) - min(importes)
            disp_baja = rango < (umbral * 0.15)
            score = min(len(sosp), 5) + (3 if disp_baja else 0) + (2 if total > umbral*2 else 0) + (2 if len(sosp) >= 5 else 0)
            sev = "alta" if score >= 8 else "media"
            flags.append({
                "tipo": "fraccionamiento", "severidad": sev,
                "emoji": "🔴" if sev == "alta" else "🟡", "score": score,
                "adjudicatario": adj, "organo": org,
                "num_contratos": len(sosp), "importe_total": round(total, 2),
                "importe_medio": round(total/len(sosp), 2), "umbral_legal": umbral,
                "descripcion": f"{len(sosp)} contratos menores de {tipo} entre {franja[0]:,.0f}€ y {franja[1]:,.0f}€ del mismo proveedor al mismo órgano. Total: {total:,.0f}€ (supera el umbral de {umbral:,.0f}€ que obligaría a licitar).{' Importes sospechosamente similares.' if disp_baja else ''}",
                "contratos": [{"expediente": c.get("expediente"), "objeto": c.get("objeto") or c.get("titulo"), "importe": imp(c), "enlace": c.get("enlace")} for c in sosp],
            })
    return flags

# ============================================================
# REGLA 2: CONCENTRACIÓN EXTREMA
# ============================================================
def detect_concentracion(contratos):
    flags = []
    por_org = defaultdict(list)
    for c in contratos:
        org = c.get("organo") or c.get("nif_organo")
        if org: por_org[org].append(c)

    for org, cs in por_org.items():
        if len(cs) < 5: continue
        por_adj = defaultdict(lambda: {"n": 0, "imp": 0})
        for c in cs:
            adj = c.get("adjudicatario") or c.get("nif_adjudicatario")
            if adj:
                por_adj[adj]["n"] += 1
                por_adj[adj]["imp"] += imp(c) or 0
        total_n, total_imp = len(cs), sum(d["imp"] for d in por_adj.values())
        for adj, d in por_adj.items():
            r = d["n"] / total_n
            ri = d["imp"] / total_imp if total_imp else 0
            if r >= 0.80:
                sev = "alta" if r >= 0.9 or ri >= 0.85 else "media"
                flags.append({
                    "tipo": "concentracion", "severidad": sev,
                    "emoji": "🔴" if sev == "alta" else "🟡",
                    "adjudicatario": adj, "organo": org,
                    "contratos_proveedor": d["n"], "contratos_totales": total_n,
                    "porcentaje_contratos": round(r*100, 1),
                    "importe_proveedor": round(d["imp"], 2),
                    "porcentaje_importe": round(ri*100, 1),
                    "descripcion": f"{adj} gana {d['n']} de {total_n} contratos ({r*100:.0f}%) del {org}, {d['imp']:,.0f}€ de {total_imp:,.0f}€ ({ri*100:.0f}%). ¿Proveedor único justificado o cautividad?",
                })
    return flags

# ============================================================
# REGLA 3: PATRÓN DE UMBRAL (estadístico)
# ============================================================
def detect_patron_umbral(menores):
    flags = []
    por_org = defaultdict(list)
    for c in menores:
        org = c.get("organo") or c.get("nif_organo")
        i = imp(c)
        if org and i: por_org[org].append(c)

    for org, cs in por_org.items():
        if len(cs) < 10: continue
        importes = [imp(c) for c in cs if imp(c)]
        en_franja = [i for i in importes if FRANJA_SERV[0] <= i <= FRANJA_SERV[1]]
        ratio = len(en_franja) / len(importes) if importes else 0
        if ratio >= 0.40 and len(en_franja) >= 4:
            provs = set()
            for c in cs:
                i = imp(c)
                if i and FRANJA_SERV[0] <= i <= FRANJA_SERV[1]:
                    a = c.get("adjudicatario") or c.get("nif_adjudicatario")
                    if a: provs.add(a)
            flags.append({
                "tipo": "patron_umbral", "severidad": "alta" if ratio >= 0.6 else "media",
                "emoji": "🔴" if ratio >= 0.6 else "🟡",
                "organo": org, "contratos_en_franja": len(en_franja),
                "contratos_totales": len(importes), "porcentaje": round(ratio*100, 1),
                "proveedores_distintos": len(provs),
                "descripcion": f"{org}: {len(en_franja)} de {len(importes)} menores ({ratio*100:.0f}%) entre {FRANJA_SERV[0]:,.0f}-{FRANJA_SERV[1]:,.0f}€. {len(provs)} proveedores. Estadísticamente improbable sin intervención.",
            })
    return flags

# ============================================================
# REGLA 4: PROVEEDOR OMNIPRESENTE
# ============================================================
def detect_omnipresente(menores):
    flags = []
    por_prov = defaultdict(lambda: defaultdict(list))
    for c in menores:
        adj = c.get("adjudicatario") or c.get("nif_adjudicatario")
        org = c.get("organo") or c.get("nif_organo")
        i = imp(c)
        if adj and org and i and FRANJA_SERV[0] <= i <= FRANJA_SERV[1]:
            por_prov[adj][org].append(c)
    for adj, orgs in por_prov.items():
        if len(orgs) < 3: continue
        total_c = sum(len(v) for v in orgs.values())
        total_i = sum(sum(imp(c) or 0 for c in v) for v in orgs.values())
        if total_c >= 5:
            flags.append({
                "tipo": "omnipresente", "severidad": "alta" if len(orgs) >= 5 else "media",
                "emoji": "🔴" if len(orgs) >= 5 else "🟡",
                "adjudicatario": adj, "num_organos": len(orgs), "num_contratos": total_c,
                "importe_total": round(total_i, 2), "organos": list(orgs.keys())[:10],
                "descripcion": f"{adj} en {len(orgs)} órganos distintos, todos en franja {FRANJA_SERV[0]:,.0f}-{FRANJA_SERV[1]:,.0f}€. {total_c} contratos por {total_i:,.0f}€. Presencia sistemática justo bajo el umbral.",
            })
    return flags

# ============================================================
# REGLA 5: NEGOCIADO SIN PUBLICIDAD REITERADO
# ============================================================
def detect_negociado_reiterado(licitaciones):
    """
    3+ contratos por procedimiento negociado sin publicidad
    del mismo proveedor al mismo órgano. Este procedimiento
    es para situaciones excepcionales — usarlo repetidamente
    con el mismo proveedor es una adjudicación a dedo encubierta.
    """
    flags = []
    grupos = defaultdict(list)
    for c in licitaciones:
        proc = (c.get("procedimiento") or "").lower().strip()
        # Detectar negociado sin publicidad por código o texto
        is_neg = proc in NEGOCIADO_SIN_PUB or "negociado sin" in proc or proc == "4"
        if not is_neg:
            continue
        adj = c.get("adjudicatario") or c.get("nif_adjudicatario")
        org = c.get("organo") or c.get("nif_organo")
        if adj and org:
            grupos[(adj, org)].append(c)

    for (adj, org), cs in grupos.items():
        if len(cs) < 3:
            continue
        total = sum(imp(c) or 0 for c in cs)
        sev = "alta" if len(cs) >= 5 or total > 500000 else "media"
        flags.append({
            "tipo": "negociado_reiterado", "severidad": sev,
            "emoji": "🔴" if sev == "alta" else "🟡",
            "score": len(cs),
            "adjudicatario": adj, "organo": org,
            "num_contratos": len(cs), "importe_total": round(total, 2),
            "descripcion": f"{adj} gana {len(cs)} contratos por negociado sin publicidad del {org} por {total:,.0f}€. El negociado sin publicidad es para situaciones excepcionales — usarlo repetidamente con el mismo proveedor huele a adjudicación a dedo.",
            "contratos": [{"expediente": c.get("expediente"), "objeto": c.get("objeto") or c.get("titulo"), "importe": imp(c), "enlace": c.get("enlace")} for c in cs],
        })
    return flags

# ============================================================
# REGLA 6: UMBRAL EUROPEO
# ============================================================
def detect_umbral_europeo(licitaciones):
    """
    Mismo patrón que fraccionamiento pero con el umbral de
    contratación armonizada de la UE (~140.000€ en servicios).
    Contratos del mismo proveedor al mismo órgano entre
    112.000-139.999€ cuyo total supere el umbral.
    """
    flags = []
    grupos = defaultdict(list)
    for c in licitaciones:
        adj = c.get("adjudicatario") or c.get("nif_adjudicatario")
        org = c.get("organo") or c.get("nif_organo")
        i = imp(c)
        if adj and org and i and FRANJA_EU_SERV[0] <= i <= FRANJA_EU_SERV[1]:
            grupos[(adj, org)].append(c)

    for (adj, org), cs in grupos.items():
        if len(cs) < 2:  # Solo 2 ya es sospechoso a estos importes
            continue
        total = sum(imp(c) or 0 for c in cs)
        if total <= UMBRAL_EU_SERV:
            continue
        sev = "alta" if len(cs) >= 3 or total > UMBRAL_EU_SERV * 2 else "media"
        flags.append({
            "tipo": "umbral_europeo", "severidad": sev,
            "emoji": "🔴" if sev == "alta" else "🟡",
            "score": len(cs) * 2,
            "adjudicatario": adj, "organo": org,
            "num_contratos": len(cs), "importe_total": round(total, 2),
            "umbral_legal": UMBRAL_EU_SERV,
            "descripcion": f"{len(cs)} contratos entre {FRANJA_EU_SERV[0]:,.0f}€ y {FRANJA_EU_SERV[1]:,.0f}€ del mismo proveedor al mismo órgano. Total: {total:,.0f}€ — supera el umbral europeo de {UMBRAL_EU_SERV:,.0f}€ que obligaría a publicar en el DOUE y someterse a supervisión europea.",
            "contratos": [{"expediente": c.get("expediente"), "objeto": c.get("objeto") or c.get("titulo"), "importe": imp(c), "enlace": c.get("enlace")} for c in cs],
        })
    return flags

# ============================================================
# MAIN
# ============================================================
def main():
    os.makedirs(FLAGS_DIR, exist_ok=True)
    ts = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")

    print("🔍 Cargando contratos...")
    menores, licitaciones = [], []
    if os.path.exists(CONTRACTS_FILE):
        with open(CONTRACTS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        menores = data.get("menores", [])
        licitaciones = data.get("licitaciones", [])
    todos = menores + licitaciones
    print(f"   {len(menores)} menores, {len(licitaciones)} licitaciones, {len(todos)} total")

    all_flags = []
    rules = [
        ("Fraccionamiento (menores)", detect_fraccionamiento, menores),
        ("Concentración extrema", detect_concentracion, todos),
        ("Patrón umbral (menores)", detect_patron_umbral, menores),
        ("Proveedor omnipresente", detect_omnipresente, menores),
        ("Negociado sin publicidad reiterado", detect_negociado_reiterado, licitaciones),
        ("Umbral europeo ~140K€", detect_umbral_europeo, licitaciones),
    ]
    for name, fn, src in rules:
        print(f"🚩 {name}...")
        f = fn(src)
        print(f"   → {len(f)}")
        all_flags.extend(f)

    sev = {"alta": 0, "media": 1}
    all_flags.sort(key=lambda f: (sev.get(f["severidad"], 9), -f.get("score", 0)))

    tipos = ["fraccionamiento","concentracion","patron_umbral","omnipresente","negociado_reiterado","umbral_europeo"]
    stats = {
        "total_flags": len(all_flags),
        "por_tipo": {t: sum(1 for f in all_flags if f["tipo"]==t) for t in tipos},
        "severidad_alta": sum(1 for f in all_flags if f["severidad"]=="alta"),
        "severidad_media": sum(1 for f in all_flags if f["severidad"]=="media"),
    }
    output = {
        "meta": {"generado": ts, "version": "3.0", "contratos_analizados": len(todos), "menores": len(menores), "licitaciones": len(licitaciones),
                 "reglas": [
                     "Fraccionamiento: 3+ menores mismo proveedor/órgano en franja 80-99% umbral, total > umbral",
                     "Concentración: 80%+ contratos de un órgano a un proveedor (mín 5)",
                     "Patrón umbral: >40% menores de un órgano en franja sospechosa (mín 10)",
                     "Omnipresente: proveedor en 3+ órganos con contratos cerca del umbral (mín 5)",
                     "Negociado reiterado: 3+ contratos por negociado sin publicidad al mismo proveedor/órgano",
                     "Umbral europeo: contratos del mismo proveedor/órgano entre 112K-140K€ que acumulados superan el umbral UE",
                 ]},
        "stats": stats, "flags": all_flags,
    }
    out = os.path.join(FLAGS_DIR, "latest.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*60}")
    print(f"🎯 {len(all_flags)} banderas rojas ({stats['severidad_alta']} alta, {stats['severidad_media']} media)")
    for t, n in stats["por_tipo"].items():
        if n: print(f"   {t}: {n}")
    print(f"{'='*60}")

if __name__ == "__main__":
    main()
