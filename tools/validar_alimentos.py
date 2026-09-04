"""Revisa la base de alimentos y saca un informe.

    python tools/validar_alimentos.py
    python tools/validar_alimentos.py --buscar "pan"
    python tools/validar_alimentos.py --probar "un plato de lentejas y una manzana"

Sirve para dos cosas:

  1. Despues de añadir alimentos a mano en `web/data/alimentos.js`, comprobar
     que no se ha colado una errata antes de subir nada.
  2. Probar como lee el interprete una frase concreta, sin abrir el navegador.

Los tests de `tests/test_alimentos.py` cubren lo mismo de forma automatica;
esto es la version comoda para trabajar.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys

RAIZ = pathlib.Path(__file__).resolve().parents[1]
WEB = RAIZ / "web"


# ---------------------------------------------------------------------------
# Lectura
# ---------------------------------------------------------------------------

def cargar_base() -> dict:
    """Convierte el objeto JS de `alimentos.js` en un diccionario."""
    texto = (WEB / "data" / "alimentos.js").read_text(encoding="utf-8")
    inicio = texto.index("window.ALIMENTOS_DB")
    cuerpo = texto[texto.index("{", inicio) : texto.rindex("}") + 1]
    cuerpo = re.sub(r"/\*.*?\*/", "", cuerpo, flags=re.S)
    cuerpo = re.sub(r"//[^\n]*", "", cuerpo)
    cuerpo = re.sub(r'([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:', r'\1"\2":', cuerpo)
    cuerpo = re.sub(r",(\s*[}\]])", r"\1", cuerpo)
    return json.loads(cuerpo)


def motor_js():
    """Contexto V8 con la base, el indice y el interprete cargados."""
    try:
        from py_mini_racer import MiniRacer
    except ImportError:
        print("Hace falta py-mini-racer: pip install -r requirements-dev.txt",
              file=sys.stderr)
        raise SystemExit(2)
    ctx = MiniRacer()
    ctx.eval("var window = globalThis;")
    for modulo in ("data/alimentos.js", "js/foods.js", "js/parser.js"):
        ctx.eval((WEB / modulo).read_text(encoding="utf-8"))
    return ctx


def llamar(ctx, expresion: str, *args):
    payload = ", ".join(json.dumps(a, ensure_ascii=False) for a in args)
    return json.loads(ctx.eval(f"JSON.stringify({expresion}({payload}))"))


# ---------------------------------------------------------------------------
# Informe
# ---------------------------------------------------------------------------

def informe(base: dict) -> int:
    alimentos = base["alimentos"]
    problemas: list[str] = []
    dudas: list[str] = []

    ids = [a["id"] for a in alimentos]
    for repetido in {i for i in ids if ids.count(i) > 1}:
        problemas.append(f"identificador repetido: {repetido}")

    for a in alimentos:
        hc = a.get("hc100")
        if not isinstance(hc, (int, float)):
            problemas.append(f"{a['id']}: hc100 no es un numero ({hc!r})")
        elif not 0 <= hc <= 100:
            problemas.append(f"{a['id']}: hc100 = {hc}, fuera de 0-100")

        u = a.get("unidad_g")
        if u is not None and (not isinstance(u, (int, float)) or not 0 < u <= 2000):
            problemas.append(f"{a['id']}: unidad_g = {u!r}")

        for unidad, gramos in (a.get("porciones") or {}).items():
            if not isinstance(gramos, (int, float)) or not 0 < gramos <= 5000:
                problemas.append(f"{a['id']}/{unidad} = {gramos!r}")

        if not a.get("alias"):
            dudas.append(f"{a['id']}: sin ningun alias (se buscara solo por su nombre)")
        if not (a.get("porciones") or a.get("unidad_g")):
            dudas.append(f"{a['id']}: sin porciones ni unidad; se supondran 100 g")

    # Grupos, para ver de un vistazo si falta cubrir algo.
    grupos: dict[str, int] = {}
    for a in alimentos:
        grupos[a["grupo"]] = grupos.get(a["grupo"], 0) + 1

    print(f"Base version {base['version']} ({base['actualizado']})")
    print(f"{len(alimentos)} alimentos en {len(grupos)} grupos\n")
    for g, n in sorted(grupos.items(), key=lambda x: -x[1]):
        print(f"  {n:>4}  {g}")

    # Los diez con mas hidratos: es donde una errata hace mas daño.
    print("\nLos de mas hidratos por 100 g (donde una errata pesa mas):")
    for a in sorted(alimentos, key=lambda x: -x["hc100"])[:10]:
        print(f"  {a['hc100']:>5}  {a['nombre']}")

    if dudas:
        print(f"\n{len(dudas)} aviso(s):")
        for d in dudas:
            print(f"  · {d}")

    if problemas:
        print(f"\n{len(problemas)} PROBLEMA(S):")
        for p in problemas:
            print(f"  X {p}")
        return 1

    print("\nSin problemas.")
    return 0


def buscar(termino: str) -> int:
    ctx = motor_js()
    res = llamar(ctx, "Alimentos.buscar", termino, 12)
    if not res:
        print(f'Nada parecido a "{termino}".')
        return 1
    print(f'Resultados para "{termino}":\n')
    for r in res:
        a = r["alimento"]
        p = llamar(ctx, "(function(id){return Alimentos.porcionPorDefecto(Alimentos.porId(id));})", a["id"])
        hc = a["hc100"] * p["gramos"] / 100
        print(f"  {r['puntuacion']:.3f}  {a['nombre']}")
        print(f"          {a['hc100']} g HC/100 g · racion {p['gramos']} g "
              f"({p['unidad']}) = {hc:.1f} g HC")
    return 0


def probar(frase: str) -> int:
    ctx = motor_js()
    r = llamar(ctx, "Parser.interpretar", frase)
    print(f'Frase: "{frase}"\n')
    if not r["items"]:
        print("  No se ha reconocido ningun alimento.")
    for it in r["items"]:
        print(f"  {it['nombre']}")
        print(f"      {it['detalle']} -> {it['gramos']} g -> {it['hc_g']} g HC "
              f"[confianza {it['confianza']}]")
    print(f"\n  TOTAL: {r['hc_total']} g de hidratos (confianza {r['confianza']})")
    for a in r["avisos"]:
        print(f"  aviso: {a}")
    return 0 if r["items"] else 1


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--buscar", metavar="TEXTO", help="probar el buscador de alimentos")
    p.add_argument("--probar", metavar="FRASE", help="probar el interprete con una frase")
    args = p.parse_args()

    if args.buscar:
        return buscar(args.buscar)
    if args.probar:
        return probar(args.probar)
    return informe(cargar_base())


if __name__ == "__main__":
    raise SystemExit(main())
