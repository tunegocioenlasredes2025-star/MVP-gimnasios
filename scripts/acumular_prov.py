#!/usr/bin/env python3
"""
Acumulador de proveedores del rubro ferretero (empresas a las que se les
puede ofrecer pauta porque le venden al ferretero).

Uso:
    python3 scripts/acumular_prov.py nuevos.json
    python3 scripts/acumular_prov.py --stats

Cada entrada:
    {"ig": "@usuario", "nombre": "...", "rubro": "...", "donde": "...", "info": "..."}
"""

import json
import os
import sys

DB = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "data", "proveedores_ig.json")
)


def cargar():
    if not os.path.exists(DB):
        return []
    with open(DB, encoding="utf-8") as f:
        return json.load(f)


def clave(e):
    return e["ig"].lstrip("@").strip().lower()


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return

    actuales = cargar()

    if sys.argv[1] == "--stats":
        por_rubro = {}
        for e in actuales:
            por_rubro[e.get("rubro", "?")] = por_rubro.get(e.get("rubro", "?"), 0) + 1
        print(f"TOTAL: {len(actuales)}")
        for rubro, n in sorted(por_rubro.items(), key=lambda x: -x[1]):
            print(f"  {rubro}: {n}")
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

    os.makedirs(os.path.dirname(DB), exist_ok=True)
    with open(DB, "w", encoding="utf-8") as f:
        json.dump(actuales, f, ensure_ascii=False, indent=1)

    print(f"+{agregados} nuevos | total {len(actuales)} | repetidos {len(nuevos) - agregados}")


if __name__ == "__main__":
    main()
