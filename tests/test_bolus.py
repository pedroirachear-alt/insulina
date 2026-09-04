"""Tests del motor de calculo del bolo.

Cubren, por orden de importancia:
  1. que el numero que sale es el correcto,
  2. que cuando falta un dato o el dato es absurdo, la aplicacion BLOQUEA en
     lugar de inventarse una dosis,
  3. los avisos de seguridad (hipoglucemia, glucemia alta, insulina activa).
"""

from __future__ import annotations

import pytest


# ---------------------------------------------------------------------------
# 1. El calculo correcto
# ---------------------------------------------------------------------------

def test_ejemplo_de_referencia(motor, ajustes):
    """60 g HC, glucemia 160, ratio 10, FSI 30, objetivo 100 -> 8 U."""
    r = motor.calcular({"hc_g": 60, "glucosa": 160, "momento": "comida"}, ajustes)
    assert r["ok"] is True
    assert r["bloqueo"] is None
    assert r["bolo_comida"] == pytest.approx(6.0)
    assert r["bolo_correccion"] == pytest.approx(2.0)
    assert r["total"] == 8


def test_objetivo_distinto_cambia_la_correccion(motor, ajustes):
    """Con objetivo 110 y glucemia 170 la correccion sigue siendo 2 U."""
    ajustes["objetivo"] = 110
    r = motor.calcular({"hc_g": 60, "glucosa": 170, "momento": "comida"}, ajustes)
    assert r["bolo_correccion"] == pytest.approx(2.0)
    assert r["total"] == 8


def test_en_objetivo_no_hay_correccion(motor, ajustes):
    r = motor.calcular({"hc_g": 50, "glucosa": 100, "momento": "comida"}, ajustes)
    assert r["bolo_correccion"] == pytest.approx(0.0)
    assert r["total"] == 5


def test_sin_glucemia_solo_bolo_de_comida(motor, ajustes):
    r = motor.calcular({"hc_g": 45, "momento": "comida"}, ajustes)
    assert r["ok"] is True
    assert r["bolo_correccion"] == 0
    assert r["total"] == 5  # 4.5 redondeado al mas cercano
    assert "SIN_GLUCOSA" in [a["codigo"] for a in r["avisos"]]


def test_solo_correccion_sin_comer(motor, ajustes):
    """Correccion aislada: 0 g de HC y glucemia alta."""
    r = motor.calcular({"hc_g": 0, "glucosa": 220, "momento": "comida"}, ajustes)
    assert r["ok"] is True
    assert r["bolo_comida"] == 0
    assert r["bolo_correccion"] == pytest.approx(4.0)
    assert r["total"] == 4


def test_glucemia_baja_resta_del_bolo(motor, ajustes):
    """A 70 mg/dL (justo en el umbral) la correccion es negativa y resta."""
    r = motor.calcular({"hc_g": 60, "glucosa": 70, "momento": "comida"}, ajustes)
    assert r["ok"] is True
    assert r["bolo_correccion"] == pytest.approx(-1.0)
    assert r["total"] == 5
    codigos = [a["codigo"] for a in r["avisos"]]
    assert "CORRECCION_NEGATIVA" in codigos
    assert "GLUCOSA_BAJA" in codigos


def test_correccion_negativa_desactivada(motor, ajustes):
    ajustes["permitir_correccion_negativa"] = False
    r = motor.calcular({"hc_g": 60, "glucosa": 75, "momento": "comida"}, ajustes)
    assert r["bolo_correccion"] == 0
    assert r["total"] == 6
    assert "CORRECCION_NEGATIVA_ANULADA" in [a["codigo"] for a in r["avisos"]]


def test_total_nunca_negativo(motor, ajustes):
    """Poca comida y glucemia baja: la dosis se queda en 0, no en negativo."""
    ajustes["umbral_hipo"] = 60
    r = motor.calcular({"hc_g": 5, "glucosa": 65, "momento": "comida"}, ajustes)
    assert r["ok"] is True
    assert r["total"] == 0
    assert "TOTAL_NEGATIVO" in [a["codigo"] for a in r["avisos"]]


# ---------------------------------------------------------------------------
# 2. Redondeo (la pluma solo admite pasos discretos)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "valor,paso,modo,esperado",
    [
        (6.4, 1, "cercano", 6),
        (6.5, 1, "cercano", 7),
        (6.6, 1, "cercano", 7),
        (6.9, 1, "abajo", 6),
        (6.4, 0.5, "cercano", 6.5),
        (6.24, 0.5, "cercano", 6.0),
        (6.9, 0.5, "abajo", 6.5),
        (0.3, 1, "cercano", 0),
        (0.3, 1, "abajo", 0),
        # 0.1+0.2 en coma flotante da 0.30000000000000004: no debe romper
        (0.1 + 0.2, 0.5, "cercano", 0.5),
    ],
)
def test_redondeo(motor, valor, paso, modo, esperado):
    assert motor.redondear(valor, paso, modo) == esperado


def test_paso_medias_unidades(motor, ajustes):
    ajustes["paso"] = 0.5
    r = motor.calcular({"hc_g": 62, "glucosa": 130, "momento": "comida"}, ajustes)
    # 6.2 + 1.0 = 7.2 -> 7.0 con paso 0.5
    assert r["total"] == 7.0


def test_redondeo_hacia_abajo_en_el_motor(motor, ajustes):
    ajustes["redondeo"] = "abajo"
    r = motor.calcular({"hc_g": 69, "glucosa": 160, "momento": "comida"}, ajustes)
    # 6.9 + 2.0 = 8.9 -> 8 hacia abajo
    assert r["total"] == 8


# ---------------------------------------------------------------------------
# 3. Bloqueos: cuando falta un dato o es absurdo, NO se da dosis
# ---------------------------------------------------------------------------

def test_hipoglucemia_bloquea(motor, ajustes):
    r = motor.calcular({"hc_g": 60, "glucosa": 65, "momento": "comida"}, ajustes)
    assert r["ok"] is False
    assert r["bloqueo"]["codigo"] == "HIPOGLUCEMIA"
    assert r["total"] == 0


def test_falta_el_ratio_bloquea(motor, ajustes):
    ajustes["ratio"] = None
    r = motor.calcular({"hc_g": 60, "glucosa": 160}, ajustes)
    assert r["ok"] is False
    assert r["bloqueo"]["codigo"] == "FALTA_RATIO"


def test_falta_el_fsi_con_glucemia_bloquea(motor, ajustes):
    ajustes["fsi"] = None
    r = motor.calcular({"hc_g": 60, "glucosa": 160}, ajustes)
    assert r["ok"] is False
    assert r["bloqueo"]["codigo"] == "FALTA_FSI"


def test_falta_el_fsi_sin_glucemia_no_bloquea(motor, ajustes):
    """Sin FSI se puede seguir calculando el bolo de la comida."""
    ajustes["fsi"] = None
    r = motor.calcular({"hc_g": 60}, ajustes)
    assert r["ok"] is True
    assert r["total"] == 6


def test_falta_el_objetivo_bloquea(motor, ajustes):
    ajustes["objetivo"] = None
    r = motor.calcular({"hc_g": 60, "glucosa": 160}, ajustes)
    assert r["ok"] is False
    assert r["bloqueo"]["codigo"] == "FALTA_OBJETIVO"


@pytest.mark.parametrize("ratio", [0, 0.5, 80, -10])
def test_ratio_implausible_bloquea(motor, ajustes, ratio):
    ajustes["ratio"] = ratio
    r = motor.calcular({"hc_g": 60}, ajustes)
    assert r["ok"] is False
    assert r["bloqueo"]["codigo"] in ("FALTA_RATIO", "RATIO_IMPLAUSIBLE")


@pytest.mark.parametrize("fsi", [1, 300, -30])
def test_fsi_implausible_bloquea(motor, ajustes, fsi):
    ajustes["fsi"] = fsi
    r = motor.calcular({"hc_g": 60, "glucosa": 160}, ajustes)
    assert r["ok"] is False
    assert r["bloqueo"]["codigo"] == "FSI_IMPLAUSIBLE"


@pytest.mark.parametrize("objetivo", [40, 250])
def test_objetivo_implausible_bloquea(motor, ajustes, objetivo):
    ajustes["objetivo"] = objetivo
    r = motor.calcular({"hc_g": 60, "glucosa": 160}, ajustes)
    assert r["ok"] is False
    assert r["bloqueo"]["codigo"] == "OBJETIVO_IMPLAUSIBLE"


def test_hidratos_absurdos_bloquean(motor, ajustes):
    """Errata tipica: 600 g en vez de 60 g."""
    r = motor.calcular({"hc_g": 600, "glucosa": 120}, ajustes)
    assert r["ok"] is False
    assert r["bloqueo"]["codigo"] == "HC_IMPLAUSIBLES"


def test_hidratos_negativos_bloquean(motor, ajustes):
    r = motor.calcular({"hc_g": -10}, ajustes)
    assert r["ok"] is False
    assert r["bloqueo"]["codigo"] == "HC_NEGATIVOS"


def test_sin_hidratos_bloquea(motor, ajustes):
    r = motor.calcular({}, ajustes)
    assert r["ok"] is False
    assert r["bloqueo"]["codigo"] == "FALTAN_HC"


@pytest.mark.parametrize("glucosa", [5, 900])
def test_glucemia_implausible_bloquea(motor, ajustes, glucosa):
    r = motor.calcular({"hc_g": 60, "glucosa": glucosa}, ajustes)
    assert r["ok"] is False
    assert r["bloqueo"]["codigo"] == "GLUCOSA_IMPLAUSIBLE"


def test_supera_el_maximo_de_seguridad(motor, ajustes):
    ajustes["max_u"] = 12
    r = motor.calcular({"hc_g": 180, "glucosa": 250, "momento": "comida"}, ajustes)
    assert r["ok"] is False
    assert r["bloqueo"]["codigo"] == "SUPERA_MAXIMO"
    assert r["bloqueo"]["confirmable"] is True
    # el numero sigue visible para que se entienda de donde sale
    assert r["total"] == 23


def test_dosis_absurda_no_es_confirmable(motor, ajustes):
    """Un ratio minusculo puede dar dosis letales: tope duro, sin confirmacion."""
    ajustes["ratio"] = 1
    ajustes["max_u"] = 500
    r = motor.calcular({"hc_g": 300, "glucosa": 100}, ajustes)
    assert r["ok"] is False
    assert r["bloqueo"]["codigo"] == "DOSIS_ABSURDA"
    assert r["bloqueo"].get("confirmable") is None


# ---------------------------------------------------------------------------
# 4. Avisos de seguridad
# ---------------------------------------------------------------------------

def test_glucemia_alta_avisa_de_cetonas(motor, ajustes):
    r = motor.calcular({"hc_g": 30, "glucosa": 300, "momento": "comida"}, ajustes)
    assert r["ok"] is True
    assert "GLUCOSA_ALTA" in [a["codigo"] for a in r["avisos"]]


def test_comida_muy_grande_avisa(motor, ajustes):
    ajustes["max_u"] = 40
    r = motor.calcular({"hc_g": 250, "glucosa": 100, "momento": "comida"}, ajustes)
    assert r["ok"] is True
    assert "HC_ALTOS" in [a["codigo"] for a in r["avisos"]]


def test_dosis_cero_se_avisa(motor, ajustes):
    r = motor.calcular({"hc_g": 2, "glucosa": 100, "momento": "comida"}, ajustes)
    assert r["ok"] is True
    assert r["total"] == 0
    assert "TOTAL_CERO" in [a["codigo"] for a in r["avisos"]]


# ---------------------------------------------------------------------------
# 5. Insulina activa (IOB)
# ---------------------------------------------------------------------------

def test_iob_avisa_pero_no_resta_por_defecto(motor, ajustes):
    r = motor.calcular({"hc_g": 60, "glucosa": 160, "iob_u": 3, "momento": "comida"}, ajustes)
    assert r["ok"] is True
    assert r["iob_restada"] == 0
    assert r["total"] == 8
    assert "IOB_PRESENTE" in [a["codigo"] for a in r["avisos"]]


def test_iob_se_resta_si_se_activa(motor, ajustes):
    ajustes["restar_iob"] = True
    r = motor.calcular({"hc_g": 60, "glucosa": 160, "iob_u": 3, "momento": "comida"}, ajustes)
    assert r["iob_restada"] == pytest.approx(3.0)
    assert r["total"] == 5
    assert "IOB_RESTADA" in [a["codigo"] for a in r["avisos"]]


@pytest.mark.parametrize(
    "horas,esperado",
    [(0, 6.0), (1, 4.5), (2, 3.0), (3, 1.5), (4, 0.0), (5, 0.0)],
)
def test_decaimiento_lineal_de_la_insulina(motor, horas, esperado):
    assert motor.iob_de_dosis(6, horas, 4) == pytest.approx(esperado)


def test_iob_total_suma_varios_pinchazos(motor):
    ahora = 1_700_000_000_000
    hora = 3_600_000
    registro = [
        {"ts": ahora - 1 * hora, "unidades": 4},   # queda 3.0
        {"ts": ahora - 2 * hora, "unidades": 8},   # queda 4.0
        {"ts": ahora - 9 * hora, "unidades": 10},  # ya no queda nada
    ]
    assert motor.iob_total(registro, 4, ahora) == pytest.approx(7.0)


def test_iob_ignora_registros_corruptos(motor):
    ahora = 1_700_000_000_000
    registro = [{"ts": None, "unidades": 5}, {"unidades": 5}, {"ts": ahora, "unidades": None}]
    assert motor.iob_total(registro, 4, ahora) == 0


# ---------------------------------------------------------------------------
# 6. Parametros distintos por momento del dia
# ---------------------------------------------------------------------------

def test_ratio_por_momento(motor, ajustes):
    """Es habitual necesitar mas insulina en el desayuno (ratio mas bajo)."""
    ajustes.update(
        {
            "por_momento": True,
            "ratios": {"desayuno": 8, "comida": 12, "merienda": 12, "cena": 10},
            "fsis": {"desayuno": 25, "comida": 30, "merienda": 30, "cena": 30},
        }
    )
    desayuno = motor.calcular({"hc_g": 48, "glucosa": 150, "momento": "desayuno"}, ajustes)
    comida = motor.calcular({"hc_g": 48, "glucosa": 150, "momento": "comida"}, ajustes)
    assert desayuno["ratio"] == 8
    assert desayuno["fsi"] == 25
    assert desayuno["bolo_comida"] == pytest.approx(6.0)
    assert desayuno["bolo_correccion"] == pytest.approx(2.0)
    assert desayuno["total"] == 8
    assert comida["ratio"] == 12
    assert comida["total"] == 6  # 4.0 + 1.67 = 5.67 -> 6


def test_por_momento_cae_al_valor_general_si_falta(motor, ajustes):
    ajustes.update({"por_momento": True, "ratios": {"desayuno": None}})
    r = motor.calcular({"hc_g": 60, "momento": "desayuno"}, ajustes)
    assert r["ratio"] == 10
    assert r["total"] == 6


@pytest.mark.parametrize(
    "hora,momento",
    [(7, "desayuno"), (10, "desayuno"), (14, "comida"), (18, "merienda"), (21, "cena"), (2, "cena")],
)
def test_franja_horaria(motor, hora, momento):
    assert motor.llamar("Bolus.momentoPorHora", hora) == momento


# ---------------------------------------------------------------------------
# 7. Robustez de la entrada
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("valor", ["60", "60,5", " 60 "])
def test_acepta_texto_y_coma_decimal(motor, ajustes, valor):
    r = motor.calcular({"hc_g": valor}, ajustes)
    assert r["ok"] is True
    assert r["total"] == 6


@pytest.mark.parametrize("basura", ["abc", "", "  ", None])
def test_rechaza_basura_en_los_hidratos(motor, ajustes, basura):
    r = motor.calcular({"hc_g": basura}, ajustes)
    assert r["ok"] is False
    assert r["bloqueo"]["codigo"] == "FALTAN_HC"


def test_el_desglose_explica_el_calculo(motor, ajustes):
    """El usuario tiene que poder comprobar el numero a mano."""
    r = motor.calcular({"hc_g": 60, "glucosa": 160, "momento": "comida"}, ajustes)
    conceptos = [d["concepto"] for d in r["desglose"]]
    assert "Bolo de la comida" in conceptos
    assert "Correccion por glucemia" in conceptos
    assert "Dosis a pinchar" in conceptos
    formula_comida = next(d for d in r["desglose"] if d["concepto"] == "Bolo de la comida")
    assert "60 g HC / 10 g/U" == formula_comida["formula"]


def test_no_hay_parametros_clinicos_por_defecto(motor):
    """Sin ajustes no puede salir ninguna dosis: la app no inventa nada."""
    r = motor.calcular({"hc_g": 60, "glucosa": 160}, {})
    assert r["ok"] is False
    assert r["bloqueo"]["codigo"] == "FALTA_RATIO"
