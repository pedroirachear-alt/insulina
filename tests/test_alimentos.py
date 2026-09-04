"""Integridad de la base de alimentos.

`web/data/alimentos.js` se edita a mano, y un cero de mas en un valor de
hidratos se convierte en unidades de insulina de mas. Estos tests son la red
que hay debajo de esa edicion manual: comprueban tipos, rangos, unidades
reconocibles, coherencia entre crudo y cocido, y que cada alimento se pueda
encontrar por su propio nombre.
"""

from __future__ import annotations

import json
import pathlib
import re

import pytest

RAIZ = pathlib.Path(__file__).resolve().parents[1]
ARCHIVO = RAIZ / "web" / "data" / "alimentos.js"

GRUPOS_VALIDOS = {
    "cereales", "legumbres", "tuberculos", "verduras", "frutas", "lacteos",
    "proteinas", "grasas", "bebidas", "dulces", "frutos_secos", "platos",
    "salsas", "propios",
}

# Medidas que NO pueden estar en `unidades_por_defecto`: solo tienen sentido
# para un plato concreto, no para cualquier alimento. Aplicar un
# "bocadillo = 170 g" a un plato de lentejas no significa nada, y ya provoco
# un error real (un bocadillo de jamon contado como 170 g de jamon).
UNIDADES_PROHIBIDAS_COMO_GENERICAS = {
    "bocadillo", "pincho", "tapa", "tableta", "filete", "chuleta", "pizza",
    "barra", "bola", "cucurucho", "medio", "racimo", "tajada", "bandeja",
}


def cargar() -> dict:
    """Lee el archivo JS y devuelve el objeto que asigna a `window`."""
    texto = ARCHIVO.read_text(encoding="utf-8")
    inicio = texto.index("window.ALIMENTOS_DB")
    llave = texto.index("{", inicio)
    fin = texto.rindex("}")
    cuerpo = texto[llave : fin + 1]

    # De JS a JSON: quitar comentarios, entrecomillar las claves y quitar las
    # comas sobrantes. Es fragil a proposito -- si el archivo se complica mas
    # de lo que este lector aguanta, el test falla y avisa.
    cuerpo = re.sub(r"/\*.*?\*/", "", cuerpo, flags=re.S)
    cuerpo = re.sub(r"//[^\n]*", "", cuerpo)
    cuerpo = re.sub(r'([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:', r'\1"\2":', cuerpo)
    cuerpo = re.sub(r",(\s*[}\]])", r"\1", cuerpo)
    return json.loads(cuerpo)


@pytest.fixture(scope="module")
def db() -> dict:
    return cargar()


@pytest.fixture(scope="module")
def alimentos(db) -> list:
    return db["alimentos"]


# ---------------------------------------------------------------------------
# Estructura
# ---------------------------------------------------------------------------

def test_el_archivo_se_puede_leer(db):
    assert db["alimentos"], "la base esta vacia"
    assert re.match(r"^\d+\.\d+\.\d+$", db["version"])


def test_hay_una_base_de_tamano_razonable(alimentos):
    assert len(alimentos) >= 150, f"solo {len(alimentos)} alimentos"


def test_identificadores_unicos(alimentos):
    ids = [a["id"] for a in alimentos]
    repetidos = {i for i in ids if ids.count(i) > 1}
    assert not repetidos, f"identificadores repetidos: {repetidos}"


def test_identificadores_con_formato(alimentos):
    for a in alimentos:
        assert re.match(r"^[a-z0-9-]+$", a["id"]), a["id"]


def test_campos_obligatorios(alimentos):
    for a in alimentos:
        for campo in ("id", "nombre", "grupo", "hc100", "unidad_g", "alias"):
            assert campo in a, f"{a.get('id')} le falta {campo}"
        assert isinstance(a["nombre"], str) and a["nombre"].strip()
        assert isinstance(a["alias"], list)


def test_grupos_conocidos(alimentos):
    for a in alimentos:
        assert a["grupo"] in GRUPOS_VALIDOS, f"{a['id']}: grupo {a['grupo']}"


# ---------------------------------------------------------------------------
# Rangos: aqui es donde se caza un cero de mas
# ---------------------------------------------------------------------------

def test_hidratos_en_rango(alimentos):
    for a in alimentos:
        hc = a["hc100"]
        assert isinstance(hc, (int, float)), f"{a['id']}: hc100 no es un numero"
        assert 0 <= hc <= 100, f"{a['id']}: hc100 = {hc}, fuera de 0-100"


def test_solo_el_azucar_llega_a_cien(alimentos):
    """Nada puede ser mas que hidratos puros, y casi nada llega."""
    altos = [a["id"] for a in alimentos if a["hc100"] >= 96]
    assert altos == ["azucar"], f"valores sospechosamente altos: {altos}"


def test_peso_de_la_unidad_en_rango(alimentos):
    for a in alimentos:
        u = a["unidad_g"]
        if u is None:
            continue
        assert isinstance(u, (int, float)), f"{a['id']}: unidad_g no es un numero"
        assert 0 < u <= 2000, f"{a['id']}: unidad_g = {u}"


def test_porciones_en_rango(alimentos):
    for a in alimentos:
        for unidad, gramos in (a.get("porciones") or {}).items():
            assert isinstance(gramos, (int, float)), f"{a['id']}/{unidad}: no es un numero"
            assert 0 < gramos <= 5000, f"{a['id']}/{unidad} = {gramos} g"


def test_las_porciones_de_un_alimento_son_coherentes(alimentos):
    """Una racion o un plato no pueden ser mas pequeños que una cucharada.

    "porcion" queda deliberadamente fuera de la cadena: significa "una
    monodosis comercial" y su tamaño no sigue ninguna escala -- una porcion de
    mantequilla son 10 g, menos que una cucharada, y es correcto.
    """
    cadena = ["cucharadita", "cucharada", "racion", "plato"]
    for a in alimentos:
        p = a.get("porciones") or {}
        presentes = [(u, p[u]) for u in cadena if u in p]
        for (u1, g1), (u2, g2) in zip(presentes, presentes[1:]):
            assert g1 <= g2, f"{a['id']}: {u1}={g1} g es mayor que {u2}={g2} g"
        # Y ninguna medida de bocado suelto puede pasar de una racion.
        for suelta in ("loncha", "rebanada", "onza", "terron", "rodaja"):
            if suelta in p and "racion" in p:
                assert p[suelta] <= p["racion"], (
                    f"{a['id']}: {suelta}={p[suelta]} g es mayor que racion={p['racion']} g"
                )


def test_una_unidad_declarada_coincide_con_su_porcion(alimentos):
    """Si un alimento define `unidad_g` y tambien una porcion "unidad",
    tienen que decir lo mismo, o el resultado depende de como se pregunte."""
    for a in alimentos:
        p = a.get("porciones") or {}
        if a["unidad_g"] is not None and "unidad" in p:
            assert a["unidad_g"] == p["unidad"], (
                f"{a['id']}: unidad_g={a['unidad_g']} pero porciones.unidad={p['unidad']}"
            )


# ---------------------------------------------------------------------------
# Coherencia nutricional
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "crudo,cocido",
    [
        ("arroz-crudo", "arroz-cocido"),
        ("pasta-cruda", "pasta-cocida"),
        ("lentejas-crudas", "lentejas-cocidas"),
        ("garbanzos-crudos", "garbanzos-cocidos"),
    ],
)
def test_cocido_tiene_menos_hidratos_que_crudo(alimentos, crudo, cocido):
    """Al cocer, el alimento absorbe agua: los hidratos por 100 g bajan.
    Confundir las dos formas es un error de mas del doble en la dosis."""
    porId = {a["id"]: a for a in alimentos}
    assert porId[cocido]["hc100"] < porId[crudo]["hc100"] / 1.8, (
        f"{cocido} ({porId[cocido]['hc100']}) no baja lo suficiente "
        f"respecto a {crudo} ({porId[crudo]['hc100']})"
    )


@pytest.mark.parametrize(
    "alimento_id,maximo",
    [
        ("pollo", 1), ("ternera", 1), ("cerdo", 1), ("merluza", 1),
        ("salmon", 1), ("huevo", 2), ("aceite-oliva", 1), ("agua", 0),
        ("lechuga", 3), ("espinacas", 3), ("refresco-zero", 0),
    ],
)
def test_alimentos_sin_hidratos(alimentos, alimento_id, maximo):
    """Carne, pescado, huevo, aceite y verdura de hoja no llevan hidratos.
    Si alguno aparece con un valor alto, es una errata."""
    porId = {a["id"]: a for a in alimentos}
    assert porId[alimento_id]["hc100"] <= maximo


@pytest.mark.parametrize(
    "alimento_id,esperado",
    [
        ("azucar", 100), ("pan-blanco", 55), ("arroz-cocido", 28),
        ("pasta-cocida", 25), ("patata-cocida", 17), ("manzana", 12),
        ("platano", 20), ("leche-entera", 4.7), ("lentejas-cocidas", 17),
        ("cerveza", 3.5), ("refresco-cola", 10.6),
    ],
)
def test_valores_de_referencia_no_cambian_sin_querer(alimentos, alimento_id, esperado):
    """Ancla los valores mas usados. Si cambian, que sea a proposito y con
    este test delante."""
    porId = {a["id"]: a for a in alimentos}
    assert porId[alimento_id]["hc100"] == esperado


# ---------------------------------------------------------------------------
# Unidades
# ---------------------------------------------------------------------------

def test_las_unidades_genericas_son_de_verdad_genericas(db):
    malas = set(db["unidades_por_defecto"]) & UNIDADES_PROHIBIDAS_COMO_GENERICAS
    assert not malas, (
        f"estas medidas no valen para cualquier alimento: {malas}. "
        "Declaralas dentro de cada alimento, en su `porciones`."
    )


def test_las_unidades_genericas_tienen_peso_razonable(db):
    for unidad, gramos in db["unidades_por_defecto"].items():
        assert 0 < gramos <= 1000, f"{unidad} = {gramos} g"


# ---------------------------------------------------------------------------
# Alias y busqueda
# ---------------------------------------------------------------------------

def test_alias_no_vacios(alimentos):
    for a in alimentos:
        for al in a["alias"]:
            assert isinstance(al, str) and al.strip(), f"{a['id']}: alias vacio"


def test_un_alias_no_choca_con_el_nombre_de_otro_alimento(lectura, alimentos):
    """Si el alias de A es exactamente el nombre de B, la busqueda exacta se
    vuelve impredecible: gana el que se haya indexado antes."""
    normalizar = lambda s: lectura.llamar("Alimentos.normalizar", s)
    nombres = {normalizar(a["nombre"]): a["id"] for a in alimentos}
    choques = []
    for a in alimentos:
        for al in a["alias"]:
            n = normalizar(al)
            if n in nombres and nombres[n] != a["id"]:
                choques.append((a["id"], al, nombres[n]))
    assert not choques, f"alias que pisan el nombre de otro alimento: {choques}"


def test_cada_alimento_se_encuentra_por_su_nombre(lectura, alimentos):
    """Prueba de ida y vuelta sobre la base entera: si un nombre no se
    encuentra a si mismo, el indexador lo esta destrozando."""
    fallos = []
    for a in alimentos:
        res = lectura.buscar(a["nombre"], 5)
        if not res or a["id"] not in [r["alimento"]["id"] for r in res]:
            fallos.append(a["id"])
    assert not fallos, f"no se encuentran por su nombre: {fallos}"


def test_cada_alias_encuentra_su_alimento(lectura, alimentos):
    fallos = []
    for a in alimentos:
        for al in a["alias"]:
            res = lectura.buscar(al, 8)
            if not res or a["id"] not in [r["alimento"]["id"] for r in res]:
                fallos.append((a["id"], al))
    assert not fallos, f"alias que no llevan a su alimento: {fallos}"


def test_todo_alimento_tiene_una_racion_utilizable(lectura, alimentos):
    """El lector necesita poder suponer una racion cuando no se dice
    cantidad. Si algun alimento no la tiene, saldrian 0 g de hidratos."""
    for a in alimentos:
        p = lectura.llamar(
            "(function(id){return Alimentos.porcionPorDefecto(Alimentos.porId(id));})",
            a["id"],
        )
        assert p["gramos"] and p["gramos"] > 0, f"{a['id']}: sin racion por defecto"


def test_ninguna_racion_da_una_barbaridad_de_hidratos(lectura, alimentos):
    """Una racion normal de cualquier cosa deberia quedarse por debajo de los
    150 g de hidratos. Por encima, o el valor o la racion estan mal."""
    excesivos = []
    for a in alimentos:
        p = lectura.llamar(
            "(function(id){return Alimentos.porcionPorDefecto(Alimentos.porId(id));})",
            a["id"],
        )
        hc = a["hc100"] * p["gramos"] / 100
        if hc > 150:
            excesivos.append((a["id"], round(hc, 1), p["gramos"]))
    assert not excesivos, f"raciones con demasiados hidratos: {excesivos}"
