"""Lanza todas las comprobaciones del proyecto.

    python run_tests.py

Ejecuta pytest sobre `tests/` --que a su vez ejecuta el JavaScript real de
`web/js/` dentro de V8-- y añade una comprobacion rapida del arbol de
archivos. Devuelve 0 si todo esta bien y 1 si no, para poder engancharlo a un
hook de git o a la accion de GitHub.
"""

from __future__ import annotations

import subprocess
import sys
import pathlib

RAIZ = pathlib.Path(__file__).resolve().parent

IMPRESCINDIBLES = [
    "web/index.html",
    "web/app.css",
    "web/sw.js",
    "web/manifest.webmanifest",
    "web/data/alimentos.js",
    "web/js/bolus.js",
    "web/js/foods.js",
    "web/js/parser.js",
    "web/js/store.js",
    "web/js/voice.js",
    "web/js/llm.js",
    "web/js/app.js",
    "web/icons/icon-192.png",
    "web/icons/icon-512.png",
    "README.md",
    "docs/GUIA_USUARIO.md",
    "docs/FLUJO_TRABAJO.md",
    "docs/DECISIONES.md",
]


def comprobar_arbol() -> list[str]:
    return [f for f in IMPRESCINDIBLES if not (RAIZ / f).exists()]


def main() -> int:
    print("== Archivos ==")
    faltan = comprobar_arbol()
    if faltan:
        for f in faltan:
            print(f"  FALTA  {f}")
        print(f"\n{len(faltan)} archivo(s) imprescindible(s) sin encontrar.")
        return 1
    print(f"  {len(IMPRESCINDIBLES)} archivos imprescindibles, todos presentes.")

    print("\n== Tests ==")
    res = subprocess.run(
        [sys.executable, "-m", "pytest", "tests/", "-q"],
        cwd=RAIZ,
    )
    if res.returncode != 0:
        print("\nHay tests en rojo. NO subas la aplicacion asi: el calculo va a "
              "una jeringa.")
        return 1

    print("\nTodo en verde.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
