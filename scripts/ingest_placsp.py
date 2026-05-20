#!/usr/bin/env python3
"""
FiscalizApp — Ingestor de contratos de la PLACSP
Descarga y parsea los feeds ATOM de la Plataforma de Contratación del Sector Público.

Sindicaciones:
  643 = Licitaciones (contratos mayores, excluye menores)
  644 = Contratos menores

Formato: CODICE 2.07 sobre ATOM 1.0 (RFC 4287)
"""

import json
import os
import ssl
import sys
import urllib.request
from datetime import datetime, timedelta
from xml.etree import ElementTree as ET

# Namespaces CODICE/ATOM utilizados por la PLACSP
NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "cbc": "urn:dgpe:names:draft:codice-place-ext:schema:xsd:CommonBasicComponents-2",
    "cac": "urn:dgpe:names:draft:codice-place-ext:schema:xsd:CommonAggregateComponents-2",
    "cbc-place": "urn:dgpe:names:draft:codice-place-ext:schema:xsd:CommonBasicComponents-2",
    "cac-place": "urn:dgpe:names:draft:codice-place-ext:schema:xsd:CommonAggregateComponents-2",
    # UBL namespaces (usados en algunas versiones)
    "cbc2": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
    "cac2": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
}

# URLs de sindicación
FEED_LICITACIONES = "https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom"
FEED_MENORES = "https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_644/contratosMenoresPerfilesContratanteCompleto3.atom"

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "contratos")

# Máximo de páginas a recorrer por feed (cada página ~500 entries)
MAX_PAGES = 3


def fetch_url(url):
    """Descarga una URL manejando SSL como la PLACSP necesita."""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(url, headers={"User-Agent": "FiscalizApp/1.0"})
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=60) as resp:
            return resp.read()
    except Exception as e:
        print(f"  ⚠ Error descargando {url}: {e}")
        return None


def safe_text(element, path, namespaces=NS):
    """Extrae texto de un elemento XML de forma segura."""
    if element is None:
        return None
    # Intentar con diferentes namespaces ya que PLACSP mezcla versiones
    for prefix_set in [namespaces, {}]:
        el = element.find(path, prefix_set)
        if el is not None and el.text:
            return el.text.strip()
    return None


def parse_amount(element, path):
    """Extrae un importe como float."""
    text = safe_text(element, path)
    if text:
        try:
            return round(float(text.replace(",", ".")), 2)
        except ValueError:
            pass
    return None


def extract_entry_licitacion(entry):
    """Extrae campos clave de un entry de licitación."""
    # El contenido real está dentro de atom:content o directamente en el entry
    # La estructura PLACSP envuelve el ContractFolderStatus en atom:content

    contract = {}

    # ID y enlace
    id_el = entry.find("atom:id", NS)
    contract["id"] = id_el.text.strip() if id_el is not None else None

    link_el = entry.find("atom:link[@rel='alternate']", NS)
    if link_el is None:
        link_el = entry.find("atom:link", NS)
    contract["enlace"] = link_el.get("href") if link_el is not None else None

    updated_el = entry.find("atom:updated", NS)
    contract["actualizado"] = updated_el.text.strip() if updated_el is not None else None

    # Título (suele contener el objeto del contrato)
    title_el = entry.find("atom:title", NS)
    contract["titulo"] = title_el.text.strip() if title_el is not None else None

    # Summary contiene info útil en texto plano
    summary_el = entry.find("atom:summary", NS)
    contract["resumen"] = summary_el.text.strip() if summary_el is not None else None

    # Intentar parsear el contenido XML embebido
    content_el = entry.find("atom:content", NS)
    if content_el is not None and content_el.text:
        try:
            inner = ET.fromstring(content_el.text)
            _parse_codice(inner, contract)
        except ET.ParseError:
            pass
    else:
        # A veces el contenido CODICE está directamente en el entry
        _parse_codice(entry, contract)

    return contract


def _parse_codice(root, contract):
    """Parsea campos CODICE del XML de un contrato."""
    # Estos XPaths cubren las variantes conocidas de la PLACSP
    paths = {
        "expediente": [
            ".//cbc:ContractFolderID",
            ".//cbc2:ContractFolderID",
        ],
        "estado": [
            ".//cbc:ContractFolderStatusCode",
            ".//cbc2:ContractFolderStatusCode",
        ],
        "organo": [
            ".//cac:LocatedContractingParty/cac:Party/cac:PartyName/cbc:Name",
            ".//cac2:LocatedContractingParty/cac2:Party/cac2:PartyName/cbc2:Name",
            ".//cac:LocatedContractingParty//cbc:Name",
        ],
        "objeto": [
            ".//cac:ProcurementProject/cbc:Name",
            ".//cac2:ProcurementProject/cbc2:Name",
        ],
        "presupuesto_base": [
            ".//cac:ProcurementProject/cac:BudgetAmount/cbc:TotalAmount",
            ".//cac2:ProcurementProject/cac2:BudgetAmount/cbc2:TotalAmount",
        ],
        "importe_adjudicacion": [
            ".//cac:TenderResult/cac:AwardedTenderedProject/cbc:TotalAmount",
            ".//cac:TenderResult//cbc:PayableAmount",
            ".//cac2:TenderResult//cbc2:PayableAmount",
        ],
        "adjudicatario": [
            ".//cac:TenderResult/cac:WinningParty/cac:PartyName/cbc:Name",
            ".//cac2:TenderResult/cac2:WinningParty/cac2:PartyName/cbc2:Name",
            ".//cac:TenderResult//cac:WinningParty//cbc:Name",
        ],
        "tipo_contrato": [
            ".//cac:ProcurementProject/cbc:TypeCode",
            ".//cbc:TypeCode",
        ],
        "procedimiento": [
            ".//cac:TenderingProcess/cbc:ProcedureCode",
            ".//cbc:ProcedureCode",
        ],
        "nif_adjudicatario": [
            ".//cac:TenderResult/cac:WinningParty/cac:PartyIdentification/cbc:ID",
            ".//cac:TenderResult//cac:PartyIdentification/cbc:ID",
        ],
        "nif_organo": [
            ".//cac:LocatedContractingParty/cac:Party/cac:PartyIdentification/cbc:ID",
        ],
    }

    for campo, xpaths in paths.items():
        for xpath in xpaths:
            try:
                el = root.find(xpath, NS)
                if el is not None and el.text:
                    val = el.text.strip()
                    if campo in ("presupuesto_base", "importe_adjudicacion"):
                        try:
                            val = round(float(val.replace(",", ".")), 2)
                        except ValueError:
                            continue
                    if val:
                        contract[campo] = val
                        break
            except Exception:
                continue


def parse_feed(url, max_pages=MAX_PAGES):
    """Recorre un feed ATOM paginado y extrae contratos."""
    contratos = []
    page = 0
    current_url = url

    while current_url and page < max_pages:
        page += 1
        print(f"  Descargando página {page}: {current_url[:80]}...")
        data = fetch_url(current_url)
        if data is None:
            break

        try:
            root = ET.fromstring(data)
        except ET.ParseError as e:
            print(f"  ⚠ Error parseando XML: {e}")
            break

        entries = root.findall("atom:entry", NS)
        print(f"  → {len(entries)} entries encontrados")

        for entry in entries:
            try:
                contrato = extract_entry_licitacion(entry)
                if contrato.get("titulo") or contrato.get("objeto") or contrato.get("expediente"):
                    contratos.append(contrato)
            except Exception as e:
                print(f"  ⚠ Error procesando entry: {e}")
                continue

        # Buscar siguiente página
        current_url = None
        for link in root.findall("atom:link", NS):
            if link.get("rel") == "next":
                current_url = link.get("href")
                break

    return contratos


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    timestamp = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")

    # 1. Licitaciones (contratos mayores)
    print("=" * 60)
    print("📋 Descargando licitaciones (sindicación 643)...")
    print("=" * 60)
    licitaciones = parse_feed(FEED_LICITACIONES, max_pages=2)
    print(f"\n✅ {len(licitaciones)} licitaciones extraídas")

    output_lic = {
        "meta": {
            "fuente": "PLACSP - Sindicación 643",
            "tipo": "licitaciones",
            "descargado": timestamp,
            "total": len(licitaciones),
            "url": FEED_LICITACIONES,
        },
        "contratos": licitaciones,
    }
    with open(os.path.join(OUTPUT_DIR, "licitaciones.json"), "w", encoding="utf-8") as f:
        json.dump(output_lic, f, ensure_ascii=False, indent=2)

    # 2. Contratos menores
    print("\n" + "=" * 60)
    print("📋 Descargando contratos menores (sindicación 644)...")
    print("=" * 60)
    menores = parse_feed(FEED_MENORES, max_pages=3)
    print(f"\n✅ {len(menores)} contratos menores extraídos")

    output_men = {
        "meta": {
            "fuente": "PLACSP - Sindicación 644",
            "tipo": "contratos_menores",
            "descargado": timestamp,
            "total": len(menores),
            "url": FEED_MENORES,
        },
        "contratos": menores,
    }
    with open(os.path.join(OUTPUT_DIR, "menores.json"), "w", encoding="utf-8") as f:
        json.dump(output_men, f, ensure_ascii=False, indent=2)

    print(f"\n🎯 Total: {len(licitaciones)} licitaciones + {len(menores)} menores")
    print(f"📁 Guardado en {OUTPUT_DIR}/")


if __name__ == "__main__":
    main()
