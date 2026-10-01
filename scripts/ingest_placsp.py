#!/usr/bin/env python3
"""
FiscalizApp — Ingestor PLACSP v4

Cambios vs v3
- El dataset completo (all_contracts.json) ya no se pierde entre ejecuciones.
  El workflow lo guarda y lo restaura con la caché de GitHub Actions, así que
  los datos se acumulan de verdad y las banderas rojas cubren varios meses.
- Fuente principal, el feed ATOM en vivo (paginado con link rel="next").
  Solo se leen las entradas nuevas desde la última ejecución.
- Fuente de respaldo, los ZIP mensuales. Se usan en la carga inicial (sin caché)
  y cuando el feed falla. Los ZIP de la PLACSP se caen varios días seguidos
  de vez en cuando (incidencias conocidas en datos.gob.es).
- Si no se descarga nada pero hay histórico, se conserva el histórico y la web
  no se queda a cero. Solo se sale con error si no hay ni histórico ni datos.
- Retención de RETENCION_MESES meses para que el fichero no crezca sin límite.

Sindicaciones
  643  → licitaciones (excluye menores)   licitacionesPerfilesContratanteCompleto3
  1143 → contratos menores                contratosMenoresPerfilesContratantes
"""
import io, json, os, ssl, sys, zipfile, urllib.request, urllib.error
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
DATASET = os.path.join(DATA_DIR, "all_contracts.json")

MESES_INICIAL = 3        # carga inicial sin histórico, meses de ZIP a bajar
RETENCION_MESES = 3      # se descartan contratos más antiguos que esto
SOLAPE_DIAS = 2          # margen hacia atrás sobre la última ejecución al leer el feed
MAX_PAGINAS_FEED = 600   # tope de páginas del feed por tipo (500 entradas por página)
UA = "FiscalizApp/4 (+https://1985xose.github.io/fiscalizapp/)"


# ---------------------------------------------------------------- utilidades
def log(msg=""):
    print(msg, flush=True)

def get_months(n):
    """Últimos n meses naturales en formato YYYYMM (aritmética de calendario)."""
    now = datetime.now()
    y, m = now.year, now.month
    ms = []
    for _ in range(n):
        ms.append(f"{y}{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return sorted(ms)

def fetch(url, timeout=180):
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
        with urllib.request.urlopen(req, context=ctx, timeout=timeout) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        log(f"    HTTP {e.code}")
        return None
    except Exception as e:
        log(f"    Error: {e}")
        return None

def describir(data):
    """Pista de qué devolvió el servidor cuando no es lo esperado."""
    head = data[:300].decode("utf-8", "ignore").replace("\n", " ").strip()
    return head[:160]

def find_text(el, name):
    for n in el.iter():
        t = n.tag.split("}")[-1] if "}" in n.tag else n.tag
        if t == name and n.text:
            return n.text.strip()
    return None

def to_float(s):
    if not s:
        return None
    try:
        return round(float(s.replace(",", ".").replace(" ", "")), 2)
    except Exception:
        return None

def parse_fecha(s):
    """'2026-09-30T10:11:12.123+02:00' → datetime naive (sin zona). None si no parsea."""
    if not s:
        return None
    s = s.strip()
    try:
        return datetime.fromisoformat(s[:19])
    except Exception:
        return None


# ---------------------------------------------------------------- parseo CODICE
def extract(entry):
    c = {}
    for tag, key in [("id", "id"), ("updated", "actualizado"), ("title", "titulo")]:
        el = entry.find(f"atom:{tag}", NS)
        if el is not None and el.text:
            c[key] = el.text.strip()
    link = entry.find("atom:link[@rel='alternate']", NS)
    if link is None:
        link = entry.find("atom:link", NS)
    if link is not None:
        c["enlace"] = link.get("href")

    content = entry.find("atom:content", NS)
    tgt = entry
    if content is not None and content.text:
        try:
            tgt = ET.fromstring(content.text)
        except Exception:
            pass

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
            c["importe_adjudicacion"] = (to_float(find_text(n, "PayableAmount"))
                                         or to_float(find_text(n, "TaxExclusiveAmount"))
                                         or to_float(find_text(n, "TotalAmount")))
            for i in n.iter():
                it = i.tag.split("}")[-1] if "}" in i.tag else i.tag
                if it == "WinningParty":
                    c["adjudicatario"] = find_text(i, "Name"); c["nif_adjudicatario"] = find_text(i, "ID"); break
            break
    c["procedimiento"] = find_text(tgt, "ProcedureCode")
    return {k: v for k, v in c.items() if v is not None}

def parse_atom(xml_bytes):
    """Devuelve (contratos, url_next). Lanza excepción si el XML no es un feed."""
    root = ET.fromstring(xml_bytes)
    out = []
    for e in root.findall("atom:entry", NS):
        try:
            c = extract(e)
            if c.get("titulo") or c.get("objeto") or c.get("expediente"):
                out.append(c)
        except Exception:
            continue
    nxt = None
    for l in root.findall("atom:link", NS):
        if l.get("rel") == "next" and l.get("href"):
            nxt = l.get("href"); break
    return out, nxt


# ---------------------------------------------------------------- fuentes
def download_feed(tipo, desde):
    """Sigue el feed en vivo hacia atrás hasta llegar a entradas anteriores a `desde`."""
    sin, fich = FEEDS[tipo]
    url = f"{BASE}/{sin}/{fich}.atom"
    all_c, paginas, ok = [], 0, False
    while url and paginas < MAX_PAGINAS_FEED:
        data = fetch(url, timeout=90)
        if not data:
            log(f"    página {paginas + 1} no disponible")
            break
        try:
            entries, nxt = parse_atom(data)
        except ET.ParseError:
            log(f"    página {paginas + 1} no es XML. Respuesta: {describir(data)}")
            break
        ok = True
        paginas += 1
        all_c.extend(entries)
        fechas = [parse_fecha(c.get("actualizado")) for c in entries]
        fechas = [f for f in fechas if f]
        mas_antigua = min(fechas) if fechas else None
        if paginas % 25 == 0 or not nxt:
            log(f"    {paginas} páginas, {len(all_c)} entradas, hasta {mas_antigua}")
        if mas_antigua and mas_antigua < desde:
            break
        url = nxt
    if ok:
        log(f"    feed OK, {paginas} páginas, {len(all_c)} entradas")
    return all_c, ok

def download_zips(tipo, meses):
    sin, fich = FEEDS[tipo]
    all_c, ok = [], False
    for ym in meses:
        url = f"{BASE}/{sin}/{fich}_{ym}.zip"
        log(f"    ZIP {ym}")
        data = fetch(url)
        if not data:
            log("    no disponible"); continue
        if data[:4] != b"PK\x03\x04":
            log(f"    no es ZIP. Respuesta: {describir(data)}"); continue
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as zf:
                atoms = sorted(f for f in zf.namelist() if f.endswith(".atom"))
                n0 = len(all_c)
                for a in atoms:
                    try:
                        entries, _ = parse_atom(zf.read(a))
                        all_c.extend(entries)
                    except Exception:
                        continue
                ok = True
                log(f"    {len(atoms)} .atom, {len(all_c) - n0} entradas")
        except Exception as e:
            log(f"    ZIP error: {e}")
    return all_c, ok


# ---------------------------------------------------------------- merge
def clave(c):
    return c.get("id") or (c.get("expediente", "") + "|" + str(c.get("importe_adjudicacion", "")))

def merge(previos, nuevos):
    """Une histórico y descarga. Ante la misma clave gana la entrada más reciente."""
    idx = {}
    for c in previos:
        idx[clave(c)] = c
    nuevos_reales = 0
    for c in nuevos:
        k = clave(c)
        if k not in idx:
            idx[k] = c; nuevos_reales += 1
        elif (c.get("actualizado") or "") > (idx[k].get("actualizado") or ""):
            idx[k] = c
    return list(idx.values()), nuevos_reales

def aplicar_retencion(contratos, limite):
    out = []
    for c in contratos:
        f = parse_fecha(c.get("actualizado"))
        if f is None or f >= limite:
            out.append(c)
    return out


# ---------------------------------------------------------------- main
def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    now = datetime.now()
    ts = now.strftime("%Y-%m-%dT%H:%M:%S")

    historico = {"menores": [], "licitaciones": [], "meta": {}}
    if os.path.exists(DATASET):
        try:
            with open(DATASET, "r", encoding="utf-8") as f:
                historico = json.load(f)
            historico.setdefault("meta", {})
        except Exception as e:
            log(f"⚠ Histórico ilegible, se ignora: {e}")
    hay_historico = bool(historico.get("menores") or historico.get("licitaciones"))
    ultima = parse_fecha(historico["meta"].get("ultima_ejecucion")) if hay_historico else None

    if ultima:
        desde = ultima - timedelta(days=SOLAPE_DIAS)
    else:
        desde = now - timedelta(days=30 * MESES_INICIAL)
    limite_retencion = now - timedelta(days=30 * RETENCION_MESES)

    log("=" * 60)
    log(f"FiscalizApp Ingestor v4 — {ts}")
    log(f"Histórico: {len(historico.get('menores', []))} menores, {len(historico.get('licitaciones', []))} licitaciones"
        + (f" (última ejecución {historico['meta'].get('ultima_ejecucion')})" if ultima else " (sin histórico, carga inicial)"))
    log(f"Se buscan entradas desde {desde:%Y-%m-%d}")
    log("=" * 60)

    resultado, fuentes = {}, {}
    for tipo, sin in (("menores", "1143"), ("licitaciones", "643")):
        log(f"\n📦 {tipo.upper()} (sindicación {sin})")
        nuevos, ok = [], False

        if hay_historico:
            log("  Feed ATOM en vivo")
            nuevos, ok = download_feed(tipo, desde)
            if not ok:
                log("  Feed caído, pruebo los ZIP mensuales")
                nuevos, ok = download_zips(tipo, get_months(2))
        else:
            log(f"  Carga inicial por ZIP, {MESES_INICIAL} meses")
            nuevos, ok = download_zips(tipo, get_months(MESES_INICIAL))
            if not ok:
                log("  ZIP caídos, pruebo el feed ATOM en vivo")
                nuevos, ok = download_feed(tipo, desde)

        fuentes[tipo] = "ok" if ok else "sin datos nuevos, se conserva el histórico"
        unidos, n_nuevos = merge(historico.get(tipo, []), nuevos)
        unidos = aplicar_retencion(unidos, limite_retencion)
        resultado[tipo] = unidos
        log(f"  ✅ {len(unidos)} {tipo} en total ({n_nuevos} nuevos, {len(nuevos)} entradas leídas)")

    menores, licitaciones = resultado["menores"], resultado["licitaciones"]

    if not menores and not licitaciones:
        log("\n❌ Sin datos descargados y sin histórico. No se escribe nada.")
        raise SystemExit(1)

    if not any(f == "ok" for f in fuentes.values()):
        log("\n⚠ Ninguna fuente respondió hoy. Se republica el histórico tal cual.")

    meta = {
        "ultima_ejecucion": ts,
        "fuentes": fuentes,
        "retencion_meses": RETENCION_MESES,
    }
    with open(DATASET, "w", encoding="utf-8") as f:
        json.dump({"menores": menores, "licitaciones": licitaciones, "meta": meta}, f, ensure_ascii=False)

    fechas = [parse_fecha(c.get("actualizado")) for c in menores + licitaciones]
    fechas = [x for x in fechas if x]
    rango = f"{min(fechas):%Y-%m-%d} a {max(fechas):%Y-%m-%d}" if fechas else "sin fechas"

    resumen = {
        "meta": {
            "generado": ts,
            "total_menores": len(menores),
            "total_licitaciones": len(licitaciones),
            "rango": rango,
            "fuentes": fuentes,
            "version_ingestor": 4,
        },
        "ultimos_menores": sorted(menores, key=lambda c: c.get("actualizado", ""), reverse=True)[:50],
        "ultimas_licitaciones": sorted(licitaciones, key=lambda c: c.get("actualizado", ""), reverse=True)[:50],
    }
    with open(os.path.join(DATA_DIR, "resumen.json"), "w", encoding="utf-8") as f:
        json.dump(resumen, f, ensure_ascii=False, indent=2)
    with open(MARKER, "w") as f:
        f.write(ts)

    log(f"\n{'=' * 60}")
    log(f"🎯 {len(menores)} menores + {len(licitaciones)} licitaciones ({rango})")
    log(f"📁 Dataset: {os.path.getsize(DATASET) / 1e6:.1f} MB")
    log("=" * 60)


if __name__ == "__main__":
    main()
