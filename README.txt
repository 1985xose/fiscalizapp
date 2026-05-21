=================================================================
FiscalizApp v5.1.0 — Congresistas XV con UI RICA
=================================================================

CAMBIOS vs v5.0.0:
- Tarjetas ahora muestran listas detalladas de inmuebles, depósitos,
  rentas, vehículos, deudas (igual que en senadores)
- Cada inmueble con tipo, ubicación, año, %, derecho, forma adquisición
- Buscador amplio: busca también en descripciones de bienes
- Circunscripción visible en card principal y como filtro

DESPLIEGUE:

1. Aplicar el ZIP:
   fiscalizapp-deploy.sh --no-serve

2. Antes de pushear, generar el JSON mergeado:
   cd ~/fiscalizapp/data
   cp ~/congreso_xv_indice.json .
   cp ../merge_congreso.py .
   python3 merge_congreso.py
   rm congreso_xv_parsed.json congreso_xv_indice.json
   cd ..
   rm merge_congreso.py README.txt

3. Push:
   git add -A && git commit -m "v5.1.0 congresistas UI rica" && git push
