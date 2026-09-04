"""Tests del almacenamiento local.

Importa por dos motivos:
  1. de aqui sale la insulina activa, que alimenta un aviso de seguridad;
  2. aqui vive el registro del usuario, y perderlo o corromperlo al importar
     una copia seria un destrozo sin arreglo.
"""

from __future__ import annotations

import json

import pytest

from conftest import MotorAlmacen

HORA = 3_600_000
AHORA = 1_700_000_000_000


# ---------------------------------------------------------------------------
# Ajustes
# ---------------------------------------------------------------------------

def test_no_hay_parametros_clinicos_de_fabrica(almacen):
    """Lo mas importante de este archivo: la aplicacion no viene con un
    ratio, un FSI ni un objetivo puestos. Un valor por defecto plausible
    seria peligrosisimo, porque calcularia dosis sin que nadie las haya
    prescrito."""
    a = almacen.ajustes()
    assert a["objetivo"] is None
    assert a["ratio"] is None
    assert a["fsi"] is None
    assert almacen.esta_configurado() is False


def test_los_limites_tecnicos_si_vienen_puestos(almacen):
    a = almacen.ajustes()
    assert a["paso"] == 1
    assert a["max_u"] == 20
    assert a["umbral_hipo"] == 70
    assert a["umbral_alto"] == 250
    assert a["duracion_insulina_h"] == 4
    assert a["restar_iob"] is False       # decision clinica: apagado
    assert a["permitir_correccion_negativa"] is True


def test_guardar_y_recuperar(almacen):
    almacen.guardar_ajustes({"objetivo": 100, "ratio": 12, "fsi": 35, "paso": 0.5})
    a = almacen.ajustes()
    assert (a["objetivo"], a["ratio"], a["fsi"], a["paso"]) == (100, 12, 35, 0.5)
    assert almacen.esta_configurado() is True


def test_guardar_no_pisa_lo_que_no_se_toca(almacen):
    almacen.guardar_ajustes({"objetivo": 100, "ratio": 10, "max_u": 15})
    almacen.guardar_ajustes({"ratio": 11})
    a = almacen.ajustes()
    assert a["ratio"] == 11
    assert a["objetivo"] == 100
    assert a["max_u"] == 15


def test_ratios_por_momento_se_guardan_uno_a_uno(almacen):
    almacen.guardar_ajustes({"por_momento": True, "ratios": {"desayuno": 8}})
    almacen.guardar_ajustes({"ratios": {"cena": 12}})
    r = almacen.ajustes()["ratios"]
    assert r["desayuno"] == 8
    assert r["cena"] == 12
    assert r["comida"] is None


def test_configurado_con_solo_ratios_por_momento(almacen):
    almacen.guardar_ajustes(
        {"objetivo": 100, "por_momento": True, "ratios": {"desayuno": 9}}
    )
    assert almacen.esta_configurado() is True


def test_sin_objetivo_no_esta_configurado(almacen):
    almacen.guardar_ajustes({"ratio": 10, "fsi": 30})
    assert almacen.esta_configurado() is False


# ---------------------------------------------------------------------------
# Registro
# ---------------------------------------------------------------------------

def test_anotar_pone_identificador_y_hora(almacen):
    e = almacen.anotar({"tipo": "rapida", "unidades": 6})
    assert e["id"]
    assert e["ts"] > 0
    assert len(almacen.registro()) == 1


def test_el_registro_queda_ordenado_por_hora(almacen):
    almacen.anotar({"ts": AHORA, "unidades": 3})
    almacen.anotar({"ts": AHORA - 5 * HORA, "unidades": 1})
    almacen.anotar({"ts": AHORA - 2 * HORA, "unidades": 2})
    unidades = [e["unidades"] for e in almacen.registro()]
    assert unidades == [1, 2, 3]


def test_borrar_una_anotacion(almacen):
    e1 = almacen.anotar({"unidades": 4})
    almacen.anotar({"unidades": 5})
    assert almacen.borrar_anotacion(e1["id"]) == 1
    assert [x["unidades"] for x in almacen.registro()] == [5]


def test_borrar_algo_que_no_existe_no_rompe(almacen):
    almacen.anotar({"unidades": 4})
    assert almacen.borrar_anotacion("no-existe") == 0
    assert len(almacen.registro()) == 1


# ---------------------------------------------------------------------------
# Insulina activa: de aqui sale un aviso de seguridad
# ---------------------------------------------------------------------------

def test_insulina_activa_de_un_pinchazo_reciente(almacen):
    almacen.guardar_ajustes({"duracion_insulina_h": 4})
    almacen.anotar({"ts": AHORA - 1 * HORA, "tipo": "rapida", "unidades": 8})
    assert almacen.iob_actual(AHORA) == pytest.approx(6.0)   # queda el 75 %


def test_la_insulina_vieja_ya_no_cuenta(almacen):
    almacen.guardar_ajustes({"duracion_insulina_h": 4})
    almacen.anotar({"ts": AHORA - 5 * HORA, "tipo": "rapida", "unidades": 10})
    assert almacen.iob_actual(AHORA) == 0


def test_la_insulina_lenta_no_cuenta_como_activa(almacen):
    """La lenta tiene otra curva completamente distinta: meterla en el
    calculo de insulina activa de la rapida seria un error grave."""
    almacen.guardar_ajustes({"duracion_insulina_h": 4})
    almacen.anotar({"ts": AHORA - 1 * HORA, "tipo": "lenta", "unidades": 20})
    assert almacen.iob_actual(AHORA) == 0


def test_las_notas_no_cuentan_como_insulina(almacen):
    almacen.anotar({"ts": AHORA, "tipo": "nota", "nota": "he andado una hora"})
    assert almacen.iob_actual(AHORA) == 0


def test_varios_pinchazos_se_suman(almacen):
    almacen.guardar_ajustes({"duracion_insulina_h": 4})
    almacen.anotar({"ts": AHORA - 1 * HORA, "tipo": "rapida", "unidades": 4})
    almacen.anotar({"ts": AHORA - 3 * HORA, "tipo": "rapida", "unidades": 8})
    assert almacen.iob_actual(AHORA) == pytest.approx(5.0)   # 3.0 + 2.0


def test_la_duracion_configurada_se_respeta(almacen):
    almacen.guardar_ajustes({"duracion_insulina_h": 6})
    almacen.anotar({"ts": AHORA - 3 * HORA, "tipo": "rapida", "unidades": 6})
    assert almacen.iob_actual(AHORA) == pytest.approx(3.0)   # mitad de 6 h


# ---------------------------------------------------------------------------
# Alimentos propios
# ---------------------------------------------------------------------------

def test_un_alimento_propio_entra_en_la_busqueda(almacen):
    almacen.guardar_alimento({
        "id": "propio-empanada", "nombre": "Empanada de mi madre",
        "grupo": "propios", "hc100": 28, "unidad_g": 120,
        "alias": [], "porciones": {"racion": 120},
    })
    res = almacen.buscar("empanada de mi madre", 3)
    assert res[0]["alimento"]["id"] == "propio-empanada"
    assert res[0]["alimento"]["hc100"] == 28


def test_un_alimento_propio_puede_corregir_uno_de_la_base(almacen):
    """Si el usuario no esta de acuerdo con un valor, manda el suyo."""
    antes = almacen.buscar("pan blanco", 1)[0]["alimento"]["hc100"]
    almacen.guardar_alimento({
        "id": "pan-blanco", "nombre": "Pan blanco (barra)", "grupo": "cereales",
        "hc100": 48, "unidad_g": None, "alias": ["pan"],
        "porciones": {"rebanada": 35},
    })
    despues = almacen.buscar("pan blanco", 1)[0]["alimento"]["hc100"]
    assert antes == 55
    assert despues == 48


def test_borrar_un_alimento_propio_lo_saca_del_indice(almacen):
    almacen.guardar_alimento({
        "id": "propio-x", "nombre": "Tarta rarisima de calabaza", "grupo": "propios",
        "hc100": 30, "unidad_g": 100, "alias": [], "porciones": {},
    })
    assert almacen.buscar("tarta rarisima de calabaza", 1)[0]["alimento"]["id"] == "propio-x"
    almacen.borrar_alimento("propio-x")
    res = almacen.buscar("tarta rarisima de calabaza", 1)
    assert not res or res[0]["alimento"]["id"] != "propio-x"


@pytest.mark.parametrize(
    "malo",
    [
        {"id": "propio-malo", "nombre": "Sin hidratos", "hc100": None},
        {"id": "propio-malo", "nombre": "Vacio", "hc100": ""},
        {"id": "propio-malo", "nombre": "Texto", "hc100": "veinte"},
        {"id": "propio-malo", "nombre": "Negativo", "hc100": -5},
        {"id": "propio-malo", "nombre": "Imposible", "hc100": 150},
        {"id": "propio-malo", "nombre": "", "hc100": 20},
        {"id": "propio-malo", "nombre": "Racion absurda", "hc100": 20, "unidad_g": 99999},
    ],
)
def test_se_rechaza_un_alimento_mal_definido(almacen, malo):
    """Un alimento sin un valor de hidratos utilizable NO puede entrar.

    Si entra, aporta 0 g de hidratos al total sin que nadie lo note, o sea
    insulina de MENOS. `Number(null)` y `Number('')` valen 0 y son finitos,
    asi que la comprobacion tiene que ser de tipo, no de finitud.
    """
    r = almacen.guardar_alimento(malo)
    assert r["ok"] is False
    assert r["motivo"]
    ids = [a["id"] for a in almacen.llamar("Alimentos.todos")]
    assert "propio-malo" not in ids
    assert almacen.alimentos_propios() == []


def test_un_alimento_bien_definido_se_acepta(almacen):
    r = almacen.guardar_alimento({
        "id": "propio-bueno", "nombre": "Cosa buena", "grupo": "propios",
        "hc100": 0, "unidad_g": 100, "alias": [], "porciones": {},
    })
    assert r["ok"] is True
    assert len(almacen.alimentos_propios()) == 1


def test_una_copia_con_alimentos_corruptos_no_los_mete(almacen):
    """Una copia editada a mano no puede colar un alimento invalido."""
    copia = json.dumps({
        "aplicacion": "control-insulina",
        "ajustes": {}, "registro": [], "comidas": [],
        "alimentos": [
            {"id": "propio-ok", "nombre": "Valido", "grupo": "propios",
             "hc100": 25, "unidad_g": 100, "alias": [], "porciones": {}},
            {"id": "propio-roto", "nombre": "Roto", "hc100": None},
        ],
    })
    assert almacen.importar(copia, "reemplazar")["ok"] is True
    ids = [a["id"] for a in almacen.llamar("Alimentos.todos")]
    assert "propio-ok" in ids
    assert "propio-roto" not in ids


def test_identificador_generado_no_choca(almacen):
    a = almacen.llamar("Store.idParaNombre", "Empanada de mi madre")
    assert a == "propio-empanada-de-mi-madre"
    almacen.guardar_alimento({
        "id": a, "nombre": "Empanada de mi madre", "grupo": "propios",
        "hc100": 28, "unidad_g": 120, "alias": [], "porciones": {},
    })
    b = almacen.llamar("Store.idParaNombre", "Empanada de mi madre")
    assert b != a and b.startswith("propio-empanada-de-mi-madre")


# ---------------------------------------------------------------------------
# Comidas guardadas
# ---------------------------------------------------------------------------

def test_guardar_y_recuperar_una_comida(almacen):
    almacen.guardar_comida({
        "nombre": "Desayuno de siempre", "hc_g": 42,
        "items": [{"id": "pan-blanco", "nombre": "Pan", "hc100": 55, "gramos": 60}],
    })
    c = almacen.comidas()
    assert len(c) == 1
    assert c[0]["nombre"] == "Desayuno de siempre"
    assert c[0]["id"]


def test_guardar_la_misma_comida_la_actualiza(almacen):
    almacen.guardar_comida({"id": "c1", "nombre": "Cena", "hc_g": 30, "items": []})
    almacen.guardar_comida({"id": "c1", "nombre": "Cena ligera", "hc_g": 20, "items": []})
    c = almacen.comidas()
    assert len(c) == 1
    assert c[0]["nombre"] == "Cena ligera"


# ---------------------------------------------------------------------------
# Copias de seguridad
# ---------------------------------------------------------------------------

def test_exportar_lleva_todo(almacen):
    almacen.guardar_ajustes({"objetivo": 100, "ratio": 10, "fsi": 30})
    almacen.anotar({"ts": AHORA, "tipo": "rapida", "unidades": 7})
    almacen.guardar_comida({"nombre": "Cena", "hc_g": 30, "items": []})
    d = json.loads(almacen.exportar())
    assert d["aplicacion"] == "control-insulina"
    assert d["ajustes"]["ratio"] == 10
    assert len(d["registro"]) == 1
    assert len(d["comidas"]) == 1
    assert d["exportado"]


def test_importar_reemplazando(almacen):
    almacen.guardar_ajustes({"objetivo": 100, "ratio": 10})
    almacen.anotar({"ts": AHORA, "unidades": 1})
    copia = almacen.exportar()

    otro = MotorAlmacen()
    otro.anotar({"ts": AHORA - HORA, "unidades": 99})
    r = otro.importar(copia, "reemplazar")
    assert r["ok"] is True
    assert [e["unidades"] for e in otro.registro()] == [1]
    assert otro.ajustes()["ratio"] == 10


def test_importar_fusionando_no_duplica(almacen):
    almacen.anotar({"id": "r-uno", "ts": AHORA, "unidades": 1})
    copia = almacen.exportar()
    r = almacen.importar(copia, "fusionar")
    assert r["ok"] is True
    assert r["importadas"] == 0
    assert len(almacen.registro()) == 1


def test_importar_fusionando_añade_lo_que_falta(almacen):
    almacen.anotar({"id": "r-uno", "ts": AHORA, "unidades": 1})
    copia = almacen.exportar()

    otro = MotorAlmacen()
    otro.anotar({"id": "r-dos", "ts": AHORA - HORA, "unidades": 2})
    r = otro.importar(copia, "fusionar")
    assert r["importadas"] == 1
    assert sorted(e["unidades"] for e in otro.registro()) == [1, 2]


def test_importar_un_archivo_ajeno_se_rechaza(almacen):
    almacen.anotar({"ts": AHORA, "unidades": 5})
    r = almacen.importar('{"aplicacion": "otra-cosa", "registro": []}', "reemplazar")
    assert r["ok"] is False
    assert len(almacen.registro()) == 1, "no debe tocar nada al rechazar"


def test_importar_basura_se_rechaza(almacen):
    almacen.anotar({"ts": AHORA, "unidades": 5})
    r = almacen.importar("esto no es json", "reemplazar")
    assert r["ok"] is False
    assert len(almacen.registro()) == 1


def test_borrar_todo(almacen):
    almacen.guardar_ajustes({"objetivo": 100, "ratio": 10})
    almacen.anotar({"ts": AHORA, "unidades": 5})
    almacen.guardar_alimento({
        "id": "propio-z", "nombre": "Cosa", "grupo": "propios",
        "hc100": 10, "unidad_g": 100, "alias": [], "porciones": {},
    })
    almacen.borrar_todo()
    assert almacen.registro() == []
    assert almacen.alimentos_propios() == []
    assert almacen.ajustes()["ratio"] is None


# ---------------------------------------------------------------------------
# Navegacion privada: el almacenamiento lanza excepciones
# ---------------------------------------------------------------------------

def test_sin_almacenamiento_la_aplicacion_sigue_funcionando():
    """En navegacion privada hasta leer `localStorage` lanza. La aplicacion
    tiene que seguir calculando: se cae a una copia en memoria y lo dice."""
    a = MotorAlmacen(romper=True)
    assert a.persistente() is False
    a.guardar_ajustes({"objetivo": 100, "ratio": 10})
    assert a.ajustes()["ratio"] == 10       # funciona dentro de la sesion
    a.anotar({"ts": AHORA, "tipo": "rapida", "unidades": 6})
    assert len(a.registro()) == 1
    assert a.iob_actual(AHORA) == pytest.approx(6.0)


def test_con_almacenamiento_lo_dice_tambien(almacen):
    assert almacen.persistente() is True
