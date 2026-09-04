"""Tests del interprete de lenguaje natural y del buscador de alimentos.

El criterio de estos tests no es "que entienda mucho", sino que:
  1. lo que entiende bien, lo cuente bien;
  2. lo que NO entiende, lo diga en voz alta y no lo cuente;
  3. no invente nunca hidratos de carbono a partir de ruido.

El punto 3 es el importante: un falso positivo aqui se convierte en unidades
de insulina de mas.
"""

from __future__ import annotations

import pytest


def total(lectura, frase):
    return lectura.interpretar(frase)["hc_total"]


def ids(res):
    return [i["id"] for i in res["items"]]


# ---------------------------------------------------------------------------
# 1. Cantidades y unidades
# ---------------------------------------------------------------------------

def test_medida_de_casa_propia_del_alimento(lectura):
    r = lectura.interpretar("dos rebanadas de pan")
    assert ids(r) == ["pan-blanco"]
    assert r["items"][0]["gramos"] == 60      # 2 x 30 g
    assert r["items"][0]["hc_g"] == 33        # 60 g al 55 %
    assert r["items"][0]["confianza"] == "alta"


def test_pieza_contada(lectura):
    r = lectura.interpretar("tres huevos")
    assert r["items"][0]["gramos"] == 180
    assert r["items"][0]["confianza"] == "alta"


def test_una_pieza_sin_numero_explicito(lectura):
    r = lectura.interpretar("una manzana")
    assert ids(r) == ["manzana"]
    assert r["items"][0]["gramos"] == 150
    assert r["items"][0]["hc_g"] == 18


@pytest.mark.parametrize(
    "frase,gramos",
    [
        ("150 gramos de arroz", 150),
        ("150 g de arroz", 150),
        ("150g de arroz", 150),
        ("150 gr de arroz", 150),
        ("0,5 kg de arroz", 500),
        ("un cuarto de kilo de arroz", 250),
        ("medio kilo de arroz", 500),
    ],
)
def test_peso_explicito(lectura, frase, gramos):
    r = lectura.interpretar(frase)
    assert r["items"][0]["gramos"] == gramos
    assert r["items"][0]["confianza"] == "alta"


@pytest.mark.parametrize(
    "frase,gramos",
    [
        ("un vaso de leche", 200),
        ("dos vasos de leche", 400),
        ("medio vaso de leche", 100),
        ("200 ml de leche", 200),
        ("medio litro de leche", 500),
    ],
)
def test_liquidos(lectura, frase, gramos):
    r = lectura.interpretar(frase)
    assert ids(r) == ["leche-entera"]
    assert r["items"][0]["gramos"] == gramos


def test_medio_plato(lectura):
    r = lectura.interpretar("medio plato de arroz")
    assert r["items"][0]["gramos"] == 100     # medio de los 200 g del plato


def test_plato_y_medio(lectura):
    r = lectura.interpretar("un plato y medio de arroz")
    assert r["items"][0]["gramos"] == 300


def test_media_docena(lectura):
    r = lectura.interpretar("media docena de huevos")
    assert r["items"][0]["gramos"] == 360     # 6 huevos de 60 g


def test_un_par(lectura):
    r = lectura.interpretar("un par de yogures")
    assert ids(r) == ["yogur-natural"]
    assert r["items"][0]["gramos"] == 250


def test_fraccion_en_cifras(lectura):
    r = lectura.interpretar("1/2 plato de lentejas")
    assert r["items"][0]["gramos"] == 125


@pytest.mark.parametrize("vaga", ["unas galletas", "unos cacahuetes"])
def test_cantidad_vaga_baja_la_confianza(lectura, vaga):
    r = lectura.interpretar(vaga)
    assert r["items"][0]["confianza"] == "baja"


# ---------------------------------------------------------------------------
# 2. Frases completas
# ---------------------------------------------------------------------------

def test_comida_completa(lectura):
    r = lectura.interpretar(
        "un plato de macarrones con tomate, dos rebanadas de pan y una manzana"
    )
    assert ids(r) == ["macarrones-tomate", "pan-blanco", "manzana"]
    assert r["hc_total"] == pytest.approx(116.0)
    assert r["confianza"] == "alta"


def test_ignora_las_muletillas_del_principio(lectura):
    for frase in [
        "un plato de lentejas",
        "voy a comer un plato de lentejas",
        "he comido un plato de lentejas",
        "hoy para cenar un plato de lentejas",
    ]:
        assert total(lectura, frase) == pytest.approx(42.5), frase


def test_plato_compuesto_gana_al_ingrediente(lectura):
    """'macarrones con tomate' es un plato, no macarrones + tomate."""
    r = lectura.interpretar("un plato de macarrones con tomate")
    assert ids(r) == ["macarrones-tomate"]


def test_regla_del_a_la_no_duplica(lectura):
    """'espaguetis a la carbonara' no debe contar pasta Y carbonara."""
    r = lectura.interpretar("espaguetis a la carbonara")
    assert ids(r) == ["carbonara"]
    assert r["hc_total"] == pytest.approx(55.0)


def test_pan_con_tomate_si_son_dos_alimentos(lectura):
    """En cambio 'pan con tomate' no esta en la base: son dos alimentos."""
    r = lectura.interpretar("pan con tomate")
    assert ids(r) == ["pan-blanco", "tomate"]


def test_regla_del_bocadillo(lectura):
    """'bocadillo' es unidad y plato a la vez; aqui manda el plato.

    Tomarlo como unidad daria 170 g de jamon (0,8 g de HC) en lugar de un
    bocadillo entero (56 g de HC): unas 5 unidades de insulina de diferencia.
    """
    r = lectura.interpretar("un bocadillo de jamon")
    assert ids(r) == ["bocadillo-jamon"]
    assert r["items"][0]["hc_g"] == pytest.approx(56.1)


def test_medio_bocadillo(lectura):
    r = lectura.interpretar("medio bocadillo de jamon")
    assert r["items"][0]["gramos"] == 85


def test_pizza_entera_y_porcion(lectura):
    assert lectura.interpretar("una pizza")["items"][0]["gramos"] == 350
    assert lectura.interpretar("una porcion de pizza")["items"][0]["gramos"] == 100


def test_nombre_entre_parentesis_casa_exacto(lectura):
    """'chocolate negro' debe casar exacto pese al '(70%)' del nombre."""
    r = lectura.interpretar("dos onzas de chocolate negro")
    assert ids(r) == ["chocolate-negro"]
    assert r["items"][0]["confianza"] == "alta"


def test_sinonimos_separados_por_barra(lectura):
    """'almejas' esta solo como segunda mitad de 'Mejillones / almejas'."""
    r = lectura.interpretar("una racion de almejas")
    assert ids(r) == ["mejillones"]


def test_negacion_con_sin(lectura):
    r = lectura.interpretar("un cafe solo sin azucar")
    assert ids(r) == ["cafe-solo"]
    assert "Azucar" in r["excluidos"]
    assert r["hc_total"] == 0


def test_negacion_de_un_alimento_con_hidratos(lectura):
    con = lectura.interpretar("una tostada con mermelada")
    sin = lectura.interpretar("una tostada sin mermelada")
    assert ids(con) == ["tostada", "mermelada"]
    assert ids(sin) == ["tostada"]
    assert sin["hc_total"] < con["hc_total"]


def test_nombre_completo_con_parentesis_casa_exacto(lectura):
    """'cafe con leche sin azucar' es literalmente el nombre del alimento."""
    r = lectura.interpretar("cafe con leche sin azucar")
    assert ids(r) == ["cafe-con-leche"]


def test_adjetivos_de_coccion_no_estorban(lectura):
    r = lectura.interpretar("dos huevos fritos")
    assert ids(r) == ["huevo"]
    assert r["items"][0]["gramos"] == 120


def test_tolera_erratas(lectura):
    """El dictado y el teclado se equivocan; el calculo no deberia caerse."""
    assert ids(lectura.interpretar("un plato de macarones con tomate")) == ["macarrones-tomate"]
    assert ids(lectura.interpretar("una manzanna")) == ["manzana"]


def test_sin_acentos_y_sin_ene(lectura):
    assert ids(lectura.interpretar("una racion de champinones")) == ["champinones"]
    assert ids(lectura.interpretar("una racion de champiñones")) == ["champinones"]
    assert ids(lectura.interpretar("un platano")) == ["platano"]
    assert ids(lectura.interpretar("un plátano")) == ["platano"]


# ---------------------------------------------------------------------------
# 3. Lo que NO se entiende: nunca en silencio, nunca inventado
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "basura",
    ["un plato de no se que", "asdfgh qwerty", "un plato de xyzabc", "no se", "", "   "],
)
def test_el_ruido_no_produce_hidratos(lectura, basura):
    """Es el test mas importante del archivo.

    Palabras de dos o tres letras casaban por aproximacion con alimentos de
    nombre parecido ("no" -> nocilla, "se" -> setas, "que" -> queso) y una
    frase sin sentido llegaba a producir 144 g de hidratos, o sea unas 14
    unidades de insulina de la nada.
    """
    r = lectura.interpretar(basura)
    assert r["hc_total"] == 0
    assert r["items"] == []
    assert r["confianza"] == "baja"
    assert r["avisos"]


def test_cantidad_sin_alimento_se_denuncia(lectura):
    """Si se entiende 'un plato' pero no de que, hay que decirlo."""
    r = lectura.interpretar("un plato de xyzabc")
    assert r["sin_alimento"]
    assert any("NO se ha contado" in a for a in r["avisos"])


def test_palabra_desconocida_en_medio_de_una_comida(lectura):
    r = lectura.interpretar("un plato de arroz y xyzabc")
    assert ids(r) == ["arroz-cocido"]
    assert "xyzabc" in r["no_reconocido"]
    assert r["confianza"] != "alta"


def test_la_confianza_es_la_peor_de_los_items(lectura):
    r = lectura.interpretar("dos rebanadas de pan y unas galletas")
    assert len(r["items"]) == 2
    assert r["items"][0]["confianza"] == "alta"
    assert r["confianza"] == "baja"


def test_confianza_baja_pide_revision(lectura):
    r = lectura.interpretar("unas galletas")
    assert any("Revisa la lista" in a for a in r["avisos"])


# ---------------------------------------------------------------------------
# 4. Buscador (la pantalla de alimentos)
# ---------------------------------------------------------------------------

def test_buscador_encuentra_por_nombre(lectura):
    res = lectura.buscar("manzana")
    assert res[0]["alimento"]["id"] == "manzana"
    assert res[0]["puntuacion"] == 1


def test_buscador_encuentra_por_alias(lectura):
    assert lectura.buscar("macarrones")[0]["alimento"]["id"] == "pasta-cocida"
    assert lectura.buscar("coca cola")[0]["alimento"]["id"] == "refresco-cola"


def test_buscador_autocompleta(lectura):
    ids_res = [r["alimento"]["id"] for r in lectura.buscar("patat", 8)]
    assert "patata-cocida" in ids_res
    assert "patata-frita" in ids_res


def test_buscador_tolera_erratas(lectura):
    assert lectura.buscar("garvanzos")[0]["alimento"]["id"] in (
        "garbanzos-cocidos",
        "garbanzos-crudos",
    )


def test_buscador_vacio(lectura):
    assert lectura.buscar("") == []


# ---------------------------------------------------------------------------
# 5. Conversion de gramos a hidratos
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "alimento_id,gramos,hc",
    [
        ("azucar", 10, 10.0),      # 100 % de hidratos
        ("pan-blanco", 100, 55.0),
        ("arroz-cocido", 200, 56.0),
        ("lechuga", 100, 1.5),
        ("pollo", 200, 0.0),
    ],
)
def test_hc_de_gramos(lectura, alimento_id, gramos, hc):
    calculado = lectura.llamar(
        "(function(id,g){return Alimentos.hcDeGramos(Alimentos.porId(id), g);})",
        alimento_id,
        gramos,
    )
    assert calculado == pytest.approx(hc)
