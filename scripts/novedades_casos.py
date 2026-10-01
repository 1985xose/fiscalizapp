#!/usr/bin/env python3
"""
FiscalizApp — Novedades automáticas de los casos de corrupción

Para cada caso de data/casos-corrupcion.json consulta el RSS de Google News
(y Bing News como respaldo) y guarda las noticias recientes en
data/casos-novedades.json. La parte curada (descripción, estado, cronología)
NO se toca. La web muestra las novedades bajo cada caso y marca los casos
cuyas noticias apuntan a un cambio de estado judicial, para revisarlos.

Uso
  python scripts/novedades_casos.py            # todos los casos
  python scripts/novedades_casos.py zapatero   # solo los ids que contengan el texto
"""
import json, os, re, sys, time, urllib.parse, urllib.request, html
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from xml.etree import ElementTree as ET

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(os.path.dirname(SCRIPT_DIR), "data")
CASOS = os.path.join(DATA_DIR, "casos-corrupcion.json")
SALIDA = os.path.join(DATA_DIR, "casos-novedades.json")

DIAS_VENTANA = 120      # noticias más antiguas que esto se descartan
MAX_POR_CASO = 6
PAUSA = 1.5             # segundos entre consultas
UA = "Mozilla/5.0 (compatible; FiscalizApp/1.0; +https://1985xose.github.io/fiscalizapp/)"

# Consultas afinadas para los casos cuyo nombre no coincide con cómo lo llama la prensa.
# Para el resto se usa "caso <nombre>" u "operación <nombre>".
CONSULTAS = {
    "zapatero-plus-ultra": '"Plus Ultra" Zapatero',
    "koldo-mascarillas": '"caso Koldo"',
    "mediador": '"Santos Cerdán"',
    "ere-andalucia": '"los ERE" Andalucía',
    "delcy-rodriguez": 'Ábalos "Delcy Rodríguez"',
    "aldama-hidrocarburos": 'Aldama hidrocarburos',
    "kitchen": '"Kitchen" Villarejo',
    "barcenas": '"Bárcenas" caja b',
    "barcenas-papeles": '"papeles de Bárcenas"',
    "caso-3-percent": '"caso 3%" Convergència',
    "gonzalez-amador": '"González Amador"',
    "fiscal-general": '"García Ortiz" fiscal',
    "pujol": 'Pujol Ferrusola juicio',
    "gal": '"caso GAL"',
    "fondos-reservados": '"fondos reservados" Vera',
    "cesid-perote": 'CESID Perote escuchas',
    "tarjetas-black": '"tarjetas black"',
    "tandem-villarejo": '"caso Tándem" Villarejo',
    "montoro": '"caso Montoro"',
    "fabra-naranjax": '"Carlos Fabra" caso',
    "imelsa-rus": '"caso Imelsa"',
    "las-teresitas": '"Las Teresitas" caso',
    "de-miguel": '"caso De Miguel" PNV',
    "erial": '"caso Erial" Zaplana',
    "pequeno-nicolas": '"Pequeño Nicolás"',
    "david-sanchez": '"David Sánchez" hermano juicio',
    "begona-gomez": '"Begoña Gómez"',
    "estevill": 'Estevill juez caso',
}

# Palabras que sugieren un cambio de estado judicial, para marcar el caso a revisar
CLAVES_ESTADO = [
    "sentencia", "condena", "condenad", "absuel", "absolu", "archiv", "sobrese",
    "imputa", "procesa", "juicio oral", "apertura de juicio", "banquillo", "detenid",
    "prisión", "cárcel", "Supremo", "recurso", "fiscalía pide", "fiscal pide",
    "declara como", "indulto", "inhabilit", "multa",
]


def log(m=""):
    print(m, flush=True)

def consulta_para(caso):
    cid = caso["id"]
    if cid in CONSULTAS:
        return CONSULTAS[cid]
    nombre = caso.get("nombre", "")
    nombre = re.sub(r"\(.*?\)", "", nombre).split("/")[0].strip()
    m = re.match(r"^(Caso|Operación)\s+(.+)$", nombre, re.I)
    if m:
        return f'"{m.group(1).lower()} {m.group(2).strip()}"'
    return f'"{nombre}"'

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/rss+xml, application/xml, text/xml, */*"})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read()

def parse_rss(xml_bytes):
    root = ET.fromstring(xml_bytes)
    items = []
    for it in root.iter("item"):
        t = (it.findtext("title") or "").strip()
        link = (it.findtext("link") or "").strip()
        pub = (it.findtext("pubDate") or "").strip()
        desc = (it.findtext("description") or "")
        src = it.findtext("source") or ""
        fecha = None
        try:
            fecha = parsedate_to_datetime(pub)
            if fecha.tzinfo is None:
                fecha = fecha.replace(tzinfo=timezone.utc)
        except Exception:
            pass
        # Google News pone "Titular - Medio" en el título
        if not src and " - " in t:
            t, src = t.rsplit(" - ", 1)
        desc = html.unescape(re.sub(r"<[^>]+>", " ", desc))
        desc = re.sub(r"\s+", " ", desc).strip()[:300]
        items.append({"titulo": html.unescape(t), "enlace": link, "medio": src.strip(), "fecha": fecha, "resumen": desc})
    return items

def buscar(consulta):
    q = urllib.parse.quote(consulta)
    fuentes = [
        ("google", f"https://news.google.com/rss/search?q={q}&hl=es&gl=ES&ceid=ES:es"),
        ("bing", f"https://www.bing.com/news/search?q={q}&format=rss&setlang=es&cc=es"),
    ]
    for nombre, url in fuentes:
        try:
            items = parse_rss(fetch(url))
            return items, nombre
        except Exception as e:
            log(f"    {nombre} falló: {str(e)[:80]}")
    return [], None

def alerta_estado(texto):
    t = texto.lower()
    return [k for k in CLAVES_ESTADO if k.lower() in t]


def main():
    filtro = sys.argv[1].lower() if len(sys.argv) > 1 else None
    with open(CASOS, "r", encoding="utf-8") as f:
        d = json.load(f)
    casos = d["casos"]
    fecha_curado = d.get("meta", {}).get("actualizado", "")
    limite = datetime.now(timezone.utc) - timedelta(days=DIAS_VENTANA)

    previo = {}
    if os.path.exists(SALIDA):
        try:
            previo = json.load(open(SALIDA, encoding="utf-8")).get("casos", {})
        except Exception:
            previo = {}

    salida, con_novedades, a_revisar = {}, 0, 0
    for c in casos:
        cid = c["id"]
        if filtro and filtro not in cid:
            salida[cid] = previo.get(cid, {})
            continue
        consulta = consulta_para(c)
        log(f"\n🔎 {cid}  →  {consulta}")
        items, fuente = buscar(consulta)
        time.sleep(PAUSA)

        vistos, noticias = set(), []
        for it in sorted(items, key=lambda x: x["fecha"] or datetime.min.replace(tzinfo=timezone.utc), reverse=True):
            if not it["fecha"] or it["fecha"] < limite:
                continue
            k = re.sub(r"\W+", " ", it["titulo"]).strip().lower()[:70]
            if k in vistos:
                continue
            vistos.add(k)
            claves = alerta_estado(it["titulo"] + " " + it["resumen"])
            noticias.append({
                "fecha": it["fecha"].strftime("%Y-%m-%d"),
                "titulo": it["titulo"],
                "medio": it["medio"],
                "enlace": it["enlace"],
                "claves": claves,
            })
            if len(noticias) >= MAX_POR_CASO:
                break

        posteriores = [n for n in noticias if n["fecha"] > fecha_curado] if fecha_curado else noticias
        revisar = any(n["claves"] for n in posteriores)
        if noticias:
            con_novedades += 1
        if revisar:
            a_revisar += 1
        salida[cid] = {
            "consulta": consulta,
            "fuente": fuente,
            "noticias": noticias,
            "ultima_noticia": noticias[0]["fecha"] if noticias else None,
            "posteriores_a_revision": len(posteriores),
            "revisar": revisar,
        }
        log(f"    {len(noticias)} noticias ({fuente}), {len(posteriores)} posteriores a la revisión manual" + ("  ⚠ REVISAR" if revisar else ""))

    resultado = {
        "meta": {
            "generado": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
            "fecha_revision_manual": fecha_curado,
            "ventana_dias": DIAS_VENTANA,
            "casos_con_noticias": con_novedades,
            "casos_a_revisar": a_revisar,
            "nota": "Noticias recogidas automáticamente de agregadores. No sustituyen a la cronología verificada de cada caso.",
        },
        "casos": salida,
    }
    with open(SALIDA, "w", encoding="utf-8") as f:
        json.dump(resultado, f, ensure_ascii=False, indent=2)
    log(f"\n✅ {con_novedades} casos con noticias, {a_revisar} marcados para revisar → {SALIDA}")


if __name__ == "__main__":
    main()
