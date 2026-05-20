#!/usr/bin/env python3
"""
FiscalizApp — Ingestor PLACSP v3

- Contratos menores: sindicación 1143 (URL correcta del Mº Hacienda)
- Lógica incremental: primera vez = 3 meses, después = mes actual
- Solo commitea resumen (50 contratos) — datos completos procesados en memoria
- Dataset completo se guarda en all_contracts.json (gitignored, >100MB)

Sindicaciones:
  643  → licitacionesPerfilesContratanteCompleto3_YYYYMM.zip
  1143 → contratosMenoresPerfilesContratantes_YYYYMM.zip
"""
import io, json, os, ssl, zipfile, urllib.request
from datetime import datetime, timedelta
from xml.etree import ElementTree as ET

NS = {"atom": "http://www.w3.org/2005/Atom"}
BASE = "https://contrataciondelsectorpublico.gob.es/sindicacion"
FEEDS = {
    "licitaciones": ("sindicacion_643", "licitacionesPerfilesContratanteCompleto3"),
    "menores": ("sindicacion_1143", "contratosMenoresPerfilesContratantes"),
}
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(os.path.dirname(SCRIPT_DIR), "data", "contratos")
MARKER = os.path.join(DATA_DIR, ".initialized")
MESES_INICIAL = 3

def get_months(n):
    ms = set()
    now = datetime.now()
    for i in range(n):
        ms.add((now - timedelta(days=i*30)).strftime("%Y%m"))
    return sorted(ms)

def fetch(url):
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    try:
        with urllib.request.urlopen(
            urllib.request.Request(url, headers={"User-Agent": "FiscalizApp/3"}),
            context=ctx, timeout=180
        ) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        if e.code != 404: print(f"    HTTP {e.code}")
        return None
    except Exception as e:
        print(f"    Error: {e}")
        return None

def find_text(el, name):
    for n in el.iter():
        t = n.tag.split("}")[-1] if "}" in n.tag else n.tag
        if t == name and n.text: return n.text.strip()
    return None

def to_float(s):
    if not s: return None
    try: return round(float(s.replace(",",".").replace(" ","")), 2)
    except: return None

def extract(entry):
    c = {}
    for tag, key in [("id","id"),("updated","actualizado"),("title","titulo")]:
        el = entry.find(f"atom:{tag}", NS)
        if el is not None and el.text: c[key] = el.text.strip()
    link = entry.find("atom:link[@rel='alternate']", NS) or entry.find("atom:link", NS)
    if link is not None: c["enlace"] = link.get("href")

    content = entry.find("atom:content", NS)
    tgt = entry
    if content is not None and content.text:
        try: tgt = ET.fromstring(content.text)
        except: pass

    c["expediente"] = find_text(tgt, "ContractFolderID")
    c["estado"] = find_text(tgt, "ContractFolderStatusCode")
    for n in tgt.iter():
        t = n.tag.split("}")[-1] if "}" in n.tag else n.tag
        if t == "LocatedContractingParty":
            c["organo"] = find_text(n, "Name"); c["nif_organo"] = find_text(n, "ID"); break
    for n in tgt.iter():
        t = n.tag.split("}")[-1] if "}" in n.tag else n.tag
        if t == "ProcurementProject":
            c["objeto"] = find_text(n, "Name")
            c["presupuesto_base"] = to_float(find_text(n, "TotalAmount"))
            c["tipo_contrato"] = find_text(n, "TypeCode"); break
    for n in tgt.iter():
        t = n.tag.split("}")[-1] if "}" in n.tag else n.tag
        if t == "TenderResult":
            c["importe_adjudicacion"] = to_float(find_text(n,"PayableAmount")) or to_float(find_text(n,"TaxExclusiveAmount")) or to_float(find_text(n,"TotalAmount"))
            for i in n.iter():
                it = i.tag.split("}")[-1] if "}" in i.tag else i.tag
                if it == "WinningParty":
                    c["adjudicatario"] = find_text(i,"Name"); c["nif_adjudicatario"] = find_text(i,"ID"); break
            break
    c["procedimiento"] = find_text(tgt, "ProcedureCode")
    return {k:v for k,v in c.items() if v is not None}

def download(tipo, meses):
    sin, fich = FEEDS[tipo]
    all_c = []
    for ym in meses:
        url = f"{BASE}/{sin}/{fich}_{ym}.zip"
        print(f"  {ym}: {url}")
        data = fetch(url)
        if not data: print(f"    No disponible"); continue
        if data[:4] != b'PK\x03\x04': print(f"    No es ZIP"); continue
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as zf:
                atoms = sorted(f for f in zf.namelist() if f.endswith(".atom"))
                print(f"    {len(atoms)} .atom")
                for a in atoms:
                    try:
                        root = ET.fromstring(zf.read(a))
                        for e in root.findall("atom:entry", NS):
                            try:
                                c = extract(e)
                                if c.get("titulo") or c.get("objeto") or c.get("expediente"):
                                    all_c.append(c)
                            except: continue
                    except: continue
        except Exception as e:
            print(f"    ZIP error: {e}")
        print(f"    {len(all_c)} acumulados")
    # Dedup
    seen, unique = set(), []
    for c in all_c:
        k = c.get("id") or (c.get("expediente","") + str(c.get("importe_adjudicacion","")))
        if k not in seen: seen.add(k); unique.append(c)
    return unique

def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    ts = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    is_init = not os.path.exists(MARKER)
    meses = get_months(MESES_INICIAL if is_init else 1)

    print("="*60)
    print(f"FiscalizApp Ingestor v3 — {ts}")
    print(f"{'CARGA INICIAL' if is_init else 'ACTUALIZACIÓN'} — {len(meses)} mes(es): {', '.join(meses)}")
    print("="*60)

    print(f"\n📦 CONTRATOS MENORES (sindicación 1143):")
    menores = download("menores", meses)
    print(f"✅ {len(menores)} menores únicos")

    print(f"\n📦 LICITACIONES (sindicación 643):")
    licitaciones = download("licitaciones", meses)
    print(f"✅ {len(licitaciones)} licitaciones únicas")

    # Merge con datos previos si es actualización incremental
    prev_path = os.path.join(DATA_DIR, "all_contracts.json")
    if not is_init and os.path.exists(prev_path):
        print(f"\nMergeando con histórico...")
        with open(prev_path, "r", encoding="utf-8") as f:
            prev = json.load(f)
        ids_m = {c.get("id") or c.get("expediente","") for c in menores}
        for c in prev.get("menores",[]):
            if (c.get("id") or c.get("expediente","")) not in ids_m: menores.append(c)
        ids_l = {c.get("id") or c.get("expediente","") for c in licitaciones}
        for c in prev.get("licitaciones",[]):
            if (c.get("id") or c.get("expediente","")) not in ids_l: licitaciones.append(c)
        print(f"  Tras merge: {len(menores)} menores, {len(licitaciones)} licitaciones")

    # Dataset completo (gitignored, para merge futuro y para el detector)
    with open(prev_path, "w", encoding="utf-8") as f:
        json.dump({"menores": menores, "licitaciones": licitaciones}, f, ensure_ascii=False)

    # Resumen para la web (pequeño, se commitea)
    resumen = {
        "meta": {"generado": ts, "total_menores": len(menores), "total_licitaciones": len(licitaciones), "rango": f"{meses[0]}-{meses[-1]}"},
        "ultimos_menores": sorted(menores, key=lambda c: c.get("actualizado",""), reverse=True)[:50],
        "ultimas_licitaciones": sorted(licitaciones, key=lambda c: c.get("actualizado",""), reverse=True)[:50],
    }
    with open(os.path.join(DATA_DIR, "resumen.json"), "w", encoding="utf-8") as f:
        json.dump(resumen, f, ensure_ascii=False, indent=2)

    with open(MARKER, "w") as f: f.write(ts)

    print(f"\n{'='*60}")
    print(f"🎯 {len(menores)} menores + {len(licitaciones)} licitaciones")
    print(f"📁 Resumen para web: {len(resumen['ultimos_menores'])} + {len(resumen['ultimas_licitaciones'])} contratos")
    print(f"{'='*60}")

if __name__ == "__main__":
    main()
