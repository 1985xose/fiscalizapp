#!/usr/bin/env python3
"""Merge v2 — copia TODAS las listas detalladas del parsed.json"""
import json, re
from pathlib import Path

GRUPO_NORM = {
    'GP': 'PP', 'GS': 'PSOE', 'GVOX': 'Vox', 'GSUMAR': 'Sumar',
    'GR': 'ERC', 'GEH BILDU': 'EH Bildu', 'GV': 'PNV',
    'GJxCAT': 'Junts', 'GMx': 'Mixto',
}

def slug_apellidos(s):
    return re.sub(r'[^A-Z0-9]+', ' ', s).strip()

parsed = json.loads(Path("congreso_xv_parsed.json").read_text(encoding='utf-8'))
indice = json.loads(Path("congreso_xv_indice.json").read_text(encoding='utf-8'))

print(f"Parsed: {len(parsed['diputados'])}")
print(f"Indice: {len(indice['diputados'])}")

indice_por_apell = {}
for d in indice['diputados']:
    indice_por_apell[slug_apellidos(d['apellidos_norm'])] = d

diputados_final = []
sin_match = 0
for p in parsed['diputados']:
    key = slug_apellidos(p['apellidos_norm'])
    info_idx = indice_por_apell.get(key)
    bienes = p.get('bienes', {})
    
    d = {
        'apellidos_norm': p['apellidos_norm'],
        'nombre_completo': bienes.get('nombre_completo'),
    }
    
    if info_idx:
        d['apellidos'] = info_idx['apellidos']
        d['nombre'] = info_idx['nombre']
        d['grupo'] = info_idx.get('grupo')
        d['partido_norm'] = GRUPO_NORM.get(info_idx.get('grupo'), 'Otros')
        if info_idx.get('bienes'):
            b0 = info_idx['bienes'][0]
            d['expediente_bienes'] = b0['expte']
            d['pagina_bienes_inicio'] = b0['pagina_inicio']
            d['pagina_bienes_fin'] = b0['pagina_fin']
        if info_idx.get('intereses'):
            i0 = info_idx['intereses'][0]
            d['expediente_intereses'] = i0['expte']
            d['pagina_intereses_inicio'] = i0['pagina_inicio']
            d['pagina_intereses_fin'] = i0['pagina_fin']
    else:
        sin_match += 1
        d['apellidos'] = p['apellidos_norm']
        d['nombre'] = ''
        d['grupo'] = None
        d['partido_norm'] = 'Otros'
    
    # FALLBACK NOMBRE
    if not d['nombre_completo']:
        if d.get('nombre') and d.get('apellidos'):
            d['nombre_completo'] = d['nombre'] + ' ' + d['apellidos']
        else:
            d['nombre_completo'] = d.get('apellidos') or p['apellidos_norm']
    
    # Datos OCR
    d['estado_civil'] = bienes.get('estado_civil')
    d['regimen_economico'] = bienes.get('regimen_economico')
    d['circunscripcion'] = bienes.get('circunscripcion')
    
    # LISTAS COMPLETAS (lo que faltaba)
    d['rentas'] = bienes.get('rentas', [])
    d['rentas_total'] = bienes.get('rentas_total', 0) or 0
    d['irpf'] = bienes.get('irpf')
    d['inmuebles_urbanos'] = bienes.get('inmuebles_urbanos', [])
    d['inmuebles_rusticos'] = bienes.get('inmuebles_rusticos', [])
    d['inmuebles_urbanos_n'] = bienes.get('inmuebles_urbanos_n', 0)
    d['inmuebles_rusticos_n'] = bienes.get('inmuebles_rusticos_n', 0)
    d['inmuebles_total'] = bienes.get('inmuebles_total', 0)
    d['depositos'] = bienes.get('depositos', [])
    d['depositos_total'] = bienes.get('depositos_total', 0) or 0
    d['otros_bienes'] = bienes.get('otros_bienes', [])
    d['otros_bienes_total'] = bienes.get('otros_bienes_total', 0) or 0
    d['vehiculos'] = bienes.get('vehiculos', [])
    d['vehiculos_n'] = bienes.get('vehiculos_n', 0)
    d['deudas'] = bienes.get('deudas', [])
    d['deudas_total'] = bienes.get('deudas_total', 0) or 0
    
    d['n_declaraciones_publicadas'] = bienes.get('n_declaraciones', 1)
    d['es_modificacion'] = bienes.get('es_modificacion', False)
    d['version_publicada'] = bienes.get('version_publicada', 0)
    d['tiene_intereses'] = p.get('tiene_intereses', False)
    
    diputados_final.append(d)

from collections import Counter
c = Counter(d['partido_norm'] for d in diputados_final)
print(f"\nDistribución por partido:")
for p, n in c.most_common(): print(f"  {n:3d}  {p}")

total_inm = sum(len(d.get('inmuebles_urbanos',[])) + len(d.get('inmuebles_rusticos',[])) for d in diputados_final)
total_dep = sum(len(d.get('depositos',[])) for d in diputados_final)
print(f"\nListas: {total_inm} inmuebles + {total_dep} depósitos detallados")

output = {
    'meta': {
        'fuente': 'BOCG-15-D-10 + índice',
        'url_pdf': 'https://www.congreso.es/public_oficiales/L15/CONG/BOCG/D/BOCG-15-D-10.PDF',
        'total_diputados': len(diputados_final),
        'metodo': 'OCR Tesseract sobre BOCG',
    },
    'diputados': sorted(diputados_final, key=lambda d: (d['partido_norm'], d['apellidos'])),
}
Path("congreso_xv.json").write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding='utf-8')
print(f"\n✅ congreso_xv.json guardado")
