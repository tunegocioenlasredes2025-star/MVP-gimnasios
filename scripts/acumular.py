#!/usr/bin/env python3
"""
Acumulador de cuentas de Instagram de ferreterias.

Uso:
    python3 scripts/acumular.py nuevos.json      # agrega y deduplica
    python3 scripts/acumular.py --stats          # muestra el conteo

El archivo maestro es data/ferreterias_ig.json y cada entrada es:
    {"ig": "@usuario", "nombre": "...", "donde": "...", "prov": "..."}

La deduplicacion es por handle normalizado (minuscula, sin arroba).
"""

import json
import os
import sys

DB = os.path.join(os.path.dirname(__file__), "..", "data", "ferreterias_ig.json")
DB = os.path.normpath(DB)


def cargar():
    if not os.path.exists(DB):
        return []
    with open(DB, encoding="utf-8") as f:
        return json.load(f)


def clave(entrada):
    return entrada["ig"].lstrip("@").strip().lower()


def guardar(entradas):
    os.makedirs(os.path.dirname(DB), exist_ok=True)
    with open(DB, "w", encoding="utf-8") as f:
        json.dump(entradas, f, ensure_ascii=False, indent=1)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return

    actuales = cargar()

    if sys.argv[1] == "--stats":
        por_prov = {}
        for e in actuales:
            por_prov[e.get("prov", "?")] = por_prov.get(e.get("prov", "?"), 0) + 1
        print(f"TOTAL: {len(actuales)}")
        for prov, n in sorted(por_prov.items(), key=lambda x: -x[1]):
            print(f"  {prov}: {n}")
        return

    with open(sys.argv[1], encoding="utf-8") as f:
        nuevos = json.load(f)

    vistos = {clave(e) for e in actuales}
    agregados = 0
    for e in nuevos:
        k = clave(e)
        if k in vistos:
            continue
        vistos.add(k)
        actuales.append(e)
        agregados += 1

    guardar(actuales)
    print(f"+{agregados} nuevos | total {len(actuales)} | repetidos {len(nuevos) - agregados}")


if __name__ == "__main__":
    main()
