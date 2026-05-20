#!/usr/bin/env python3
"""
FiscalizApp — Ingestor de contratos PLACSP v2
Descarga los ZIPs mensuales de los últimos 6 meses para tener volumen suficiente
para detectar patrones de fraccionamiento y concentración.

Sindicaciones:
  643 = Licitaciones (contratos mayores)
  644 = Contratos menores (donde se detecta el fraccionamiento)

Los ZIPs contienen ficheros .atom con max 500 entries, encadenados con <link rel="next">.
"""

import io
import json
import os
import ssl
import sys
import zipfile
import urllib.request
from datetime import datetime, timedelta
from xml.etree import ElementTree as ET

# Namespaces
NS = {
    "atom": "http://www.w3.org/2005/Atom",
}

# Para parsear contenido CODICE no usamos namespaces estrictos
# porque PLACSP mezcla versiones — buscamos tags por nombre local

BASE_URL = "https://contrataciondelsectorpublico.gob.es/sindicacion"

URLS = {
    "menores": f"{BASE_URL}/sindicacion_644/contratosMenoresPerfilesContratanteCompleto3",
    "licitaciones": f"{BASE_URL}/sindicacion_643/licitacionesPerfilesContratanteCompleto3",
}

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "contratos")

# Cuántos meses atrás descargar
MESES_HISTORICO = 6


def get_month_range(meses_atras):
    """Genera lista de YYYYMM para los últimos N meses."""
    months = []
    now = datetime.now()
    for i in range(meses_atras):
        d = now.replace(day=1) - timedelta(days=i * 30)
        months.append(d.strftime("%Y%m"))
    return sorted(set(months))


def fetch_url(url):
    """Descarga URL con SSL relajado (PLACSP necesita -k)."""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(url, headers={"User-Agent": "FiscalizApp/2.0"})
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=120) as resp:
            return resp.read()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None  # Mes aún no disponible
        print(f"  ⚠ HTTP {e.code} descargando {url}")
        return None
    except Exception as e:
        print(f"  ⚠ Error: {e}")
        return None


def find_text(element, local_name):
    """Busca un elemento por nombre local (ignora namespace)."""
    for el in element.iter():
        tag = el.tag.split("}")[-1] if "}" in el.tag else el.tag
        if tag == local_name and el.text:
            return el.text.strip()
    return None


def find_all_text(element, local_name):
    """Busca todos los elementos con un nombre local."""
    results = []
    for el in element.iter():
        tag = el.tag.split("}")[-1] if "}" in el.tag else el.tag
        if tag == local_name and el.text:
            results.append(el.text.strip())
    return results


def parse_amount(text):
    if not text:
        return None
    try:
        return round(float(text.replace(",", ".").replace(" ", "")), 2)
    except ValueError:
        return None


def extract_contract(entry):
    """Extrae campos clave de un entry ATOM/CODICE."""
    c = {}

    # Atom fields
    id_el = entry.find("atom:id", NS)
    c["id"] = id_el.text.strip() if id_el is not None and id_el.text else None

    link_el = entry.find("atom:link[@rel='alternate']", NS)
    if link_el is None:
        link_el = entry.find("atom:link", NS)
    c["enlace"] = link_el.get("href") if link_el is not None else None

    updated_el = entry.find("atom:updated", NS)
    c["actualizado"] = updated_el.text.strip() if updated_el is not None and updated_el.text else None

    title_el = entry.find("atom:title", NS)
    c["titulo"] = title_el.text.strip() if title_el is not None and title_el.text else None

    summary_el = entry.find("atom:summary", NS)
    c["resumen"] = summary_el.text.strip() if summary_el is not None and summary_el.text else None

    # Parse CODICE content (embedded XML in atom:content)
    content_el = entry.find("atom:content", NS)
    inner_xml = None
    if content_el is not None and content_el.text:
        try:
            inner_xml = ET.fromstring(content_el.text)
        except ET.ParseError:
            pass

    target = inner_xml if inner_xml is not None else entry

    # Extraer por nombre local de tag (independiente del namespace)
    c["expediente"] = find_text(target, "ContractFolderID")
    c["estado"] = find_text(target, "ContractFolderStatusCode")

    # Órgano contratante - buscar dentro de LocatedContractingParty
    names = find_all_text(target, "Name")
    if names:
        c["organo"] = names[0]  # Primer Name suele ser el órgano

    # Objeto del contrato
    c["objeto"] = find_text(target, "Name") if not names else None
    # Intentar ProcurementProject > Name
    for el in target.iter():
        tag = el.tag.split("}")[-1] if "}" in el.tag else el.tag
        if tag == "ProcurementProject":
            proj_name = find_text(el, "Name")
            if proj_name:
                c["objeto"] = proj_name
            break

    # Importes
    c["presupuesto_base"] = parse_amount(find_text(target, "TotalAmount"))
    c["importe_adjudicacion"] = parse_amount(find_text(target, "PayableAmount"))
    if not c["importe_adjudicacion"]:
        # A veces el importe está en TaxExclusiveAmount
        c["importe_adjudicacion"] = parse_amount(find_text(target, "TaxExclusiveAmount"))

    # Adjudicatario - buscar dentro de WinningParty
    for el in target.iter():
        tag = el.tag.split("}")[-1] if "}" in el.tag else el.tag
        if tag == "WinningParty":
            adj_name = find_text(el, "Name")
            adj_id = find_text(el, "ID")
            if adj_name:
                c["adjudicatario"] = adj_name
            if adj_id:
                c["nif_adjudicatario"] = adj_id
            break

    # NIF órgano
    for el in target.iter():
        tag = el.tag.split("}")[-1] if "}" in el.tag else el.tag
        if tag == "LocatedContractingParty":
            org_id = find_text(el, "ID")
            if org_id:
                c["nif_organo"] = org_id
            break

    # Tipo de contrato y procedimiento
    c["tipo_contrato"] = find_text(target, "TypeCode")
    c["procedimiento"] = find_text(target, "ProcedureCode")

    # Limpiar nulos
    return {k: v for k, v in c.items() if v is not None}


def parse_atom_file(xml_bytes):
    """Parsea un fichero .atom y extrae contratos."""
    contratos = []
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as e:
        print(f"    ⚠ XML parse error: {e}")
        return contratos, None

    entries = root.findall("atom:entry", NS)
    for entry in entries:
        try:
            c = extract_contract(entry)
            if c.get("titulo") or c.get("objeto") or c.get("expediente"):
                contratos.append(c)
        except Exception as e:
            continue

    # Buscar enlace a siguiente fichero atom
    next_url = None
    for link in root.findall("atom:link", NS):
        if link.get("rel") == "next":
            next_url = link.get("href")
            break

    return contratos, next_url


def download_and_parse_zip(url):
    """Descarga un ZIP y parsea todos los .atom que contiene."""
    contratos = []
    data = fetch_url(url)
    if data is None:
        return contratos

    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            atom_files = sorted([f for f in zf.namelist() if f.endswith(".atom")])
            print(f"    ZIP contiene {len(atom_files)} ficheros .atom")
            for atom_file in atom_files:
                xml_bytes = zf.read(atom_file)
                parsed, _ = parse_atom_file(xml_bytes)
                contratos.extend(parsed)
    except zipfile.BadZipFile:
        print(f"    ⚠ ZIP corrupto o no es un ZIP")
    except Exception as e:
        print(f"    ⚠ Error procesando ZIP: {e}")

    return contratos


def download_feed_pages(url, max_pages=5):
    """Descarga el feed ATOM en vivo (paginado) como fallback."""
    contratos = []
    current_url = url + ".atom"
    page = 0

    while current_url and page < max_pages:
        page += 1
        print(f"    Feed página {page}...")
        data = fetch_url(current_url)
        if data is None:
            break

        parsed, next_url = parse_atom_file(data)
        contratos.extend(parsed)
        current_url = next_url

    return contratos


def ingest_tipo(tipo, label, meses):
    """Ingesta completa de un tipo de sindicación."""
    base_url = URLS[tipo]
    all_contratos = []

    # 1. Intentar ZIPs mensuales
    print(f"\n  Descargando ZIPs mensuales ({len(meses)} meses)...")
    for ym in meses:
        url = f"{base_url}_{ym}.zip"
        print(f"    {ym}: {url}")
        contratos = download_and_parse_zip(url)
        print(f"    → {len(contratos)} contratos")
        all_contratos.extend(contratos)

    # 2. Si no conseguimos nada con ZIPs, usar el feed en vivo
    if not all_contratos:
        print(f"\n  ZIPs vacíos, usando feed en vivo como fallback...")
        all_contratos = download_feed_pages(base_url, max_pages=10)

    # 3. Deduplicar por ID
    seen = set()
    unique = []
    for c in all_contratos:
        cid = c.get("id") or c.get("expediente") or str(c)
        if cid not in seen:
            seen.add(cid)
            unique.append(c)

    print(f"\n  ✅ {label}: {len(unique)} contratos únicos (de {len(all_contratos)} totales)")
    return unique


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    timestamp = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    meses = get_month_range(MESES_HISTORICO)

    print("=" * 60)
    print(f"📋 FiscalizApp Ingestor v2 — {timestamp}")
    print(f"   Rango: {meses[0]} → {meses[-1]} ({len(meses)} meses)")
    print("=" * 60)

    # Contratos menores (donde está el fraccionamiento)
    print(f"\n{'='*60}")
    print(f"📦 CONTRATOS MENORES (sindicación 644)")
    print(f"{'='*60}")
    menores = ingest_tipo("menores", "Contratos menores", meses)

    output_men = {
        "meta": {
            "fuente": "PLACSP - Sindicación 644",
            "tipo": "contratos_menores",
            "descargado": timestamp,
            "rango_meses": f"{meses[0]}-{meses[-1]}",
            "total": len(menores),
        },
        "contratos": menores,
    }
    with open(os.path.join(OUTPUT_DIR, "menores.json"), "w", encoding="utf-8") as f:
        json.dump(output_men, f, ensure_ascii=False, indent=2)

    # Licitaciones (contratos mayores)
    print(f"\n{'='*60}")
    print(f"📦 LICITACIONES (sindicación 643)")
    print(f"{'='*60}")
    licitaciones = ingest_tipo("licitaciones", "Licitaciones", meses)

    output_lic = {
        "meta": {
            "fuente": "PLACSP - Sindicación 643",
            "tipo": "licitaciones",
            "descargado": timestamp,
            "rango_meses": f"{meses[0]}-{meses[-1]}",
            "total": len(licitaciones),
        },
        "contratos": licitaciones,
    }
    with open(os.path.join(OUTPUT_DIR, "licitaciones.json"), "w", encoding="utf-8") as f:
        json.dump(output_lic, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*60}")
    print(f"🎯 TOTAL: {len(menores)} menores + {len(licitaciones)} licitaciones")
    print(f"📁 Guardado en {OUTPUT_DIR}/")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
