"""Infraestructura de test.

La aplicacion es JavaScript (una PWA estatica). Para no mantener dos
implementaciones del calculo --lo que abriria la puerta a que divergieran-- los
tests ejecutan EL MISMO archivo `web/js/*.js` que se despliega, dentro de un
motor V8 embebido (py-mini-racer). Lo que se prueba aqui es exactamente lo que
corre en el telefono.
"""

from __future__ import annotations

import json
import pathlib
from typing import Any

import pytest
from py_mini_racer import MiniRacer

RAIZ = pathlib.Path(__file__).resolve().parents[1]
WEB = RAIZ / "web"


class ContextoJS:
    """Envoltorio comodo sobre un contexto V8 con los modulos de la app."""

    def __init__(self, *modulos: str) -> None:
        self.ctx = MiniRacer()
        # En el navegador los modulos se cuelgan de `window`; en V8 aislado no
        # existe, asi que lo apuntamos a globalThis antes de cargar nada.
        self.ctx.eval("var window = globalThis; var self = globalThis;")
        for modulo in modulos:
            ruta = WEB / modulo
            if not ruta.exists():
                raise FileNotFoundError(f"no existe el modulo {ruta}")
            self.ctx.eval(ruta.read_text(encoding="utf-8"))

    def llamar(self, expresion_js: str, *args: Any) -> Any:
        """Llama a una funcion JS con argumentos Python y devuelve el resultado."""
        payload = ", ".join(json.dumps(a, ensure_ascii=False) for a in args)
        return json.loads(self.ctx.eval(f"JSON.stringify({expresion_js}({payload}))"))

    def eval(self, codigo: str) -> Any:
        return self.ctx.eval(codigo)


class MotorBolo(ContextoJS):
    """Acceso tipado al motor de calculo."""

    def __init__(self) -> None:
        super().__init__("js/bolus.js")

    def calcular(self, entrada: dict, ajustes: dict) -> dict:
        return self.llamar("Bolus.calcular", entrada, ajustes)

    def redondear(self, valor: float, paso: float, modo: str) -> float:
        return self.llamar("Bolus.redondear", valor, paso, modo)

    def iob_de_dosis(self, u: float, horas: float, duracion: float) -> float:
        return self.llamar("Bolus.iobDeDosis", u, horas, duracion)

    def iob_total(self, registro: list, duracion: float, ahora_ms: int) -> float:
        return self.llamar("Bolus.iobTotal", registro, duracion, ahora_ms)


class MotorLectura(ContextoJS):
    """Acceso al parser de lenguaje natural (necesita la base de alimentos)."""

    def __init__(self) -> None:
        super().__init__("data/alimentos.js", "js/foods.js", "js/parser.js")

    def interpretar(self, texto: str) -> dict:
        return self.llamar("Parser.interpretar", texto)

    def buscar(self, texto: str, limite: int = 5) -> list:
        return self.llamar("Alimentos.buscar", texto, limite)


class MotorAlmacen(ContextoJS):
    """Acceso a `store.js` con un `localStorage` simulado.

    V8 aislado no tiene navegador, asi que se le inyecta el minimo que usa el
    modulo. `romper=True` hace que lance excepciones, para probar el caso de
    la navegacion privada, donde hasta leer el almacenamiento falla.
    """

    def __init__(self, romper: bool = False) -> None:
        self.ctx = MiniRacer()
        self.ctx.eval("var window = globalThis; var self = globalThis;")
        self.ctx.eval(
            """
            globalThis.__ls = {};
            globalThis.__romper = %s;
            globalThis.localStorage = {
              getItem: function (k) {
                if (globalThis.__romper) throw new Error('bloqueado');
                return Object.prototype.hasOwnProperty.call(globalThis.__ls, k)
                  ? globalThis.__ls[k] : null;
              },
              setItem: function (k, v) {
                if (globalThis.__romper) throw new Error('bloqueado');
                globalThis.__ls[k] = String(v);
              },
              removeItem: function (k) {
                if (globalThis.__romper) throw new Error('bloqueado');
                delete globalThis.__ls[k];
              }
            };
            """
            % ("true" if romper else "false")
        )
        for modulo in ("js/bolus.js", "data/alimentos.js", "js/foods.js", "js/store.js"):
            self.ctx.eval((WEB / modulo).read_text(encoding="utf-8"))
        self.ctx.eval("Store.inicializar();")

    # --- ajustes ---------------------------------------------------------
    def ajustes(self) -> dict:
        return self.llamar("Store.ajustes")

    def guardar_ajustes(self, nuevos: dict) -> dict:
        return self.llamar("Store.guardarAjustes", nuevos)

    def esta_configurado(self) -> bool:
        return self.llamar("Store.estaConfigurado")

    # --- registro --------------------------------------------------------
    def anotar(self, entrada: dict) -> dict:
        return self.llamar("Store.anotar", entrada)

    def registro(self) -> list:
        return self.llamar("Store.registro")

    def borrar_anotacion(self, id_: str) -> int:
        return self.llamar("Store.borrarAnotacion", id_)

    def iob_actual(self, ahora_ms: int) -> float:
        return self.llamar("Store.iobActual", ahora_ms)

    # --- alimentos y comidas --------------------------------------------
    def guardar_alimento(self, alimento: dict) -> list:
        return self.llamar("Store.guardarAlimentoPropio", alimento)

    def alimentos_propios(self) -> list:
        return self.llamar("Store.alimentosPropios")

    def borrar_alimento(self, id_: str) -> list:
        return self.llamar("Store.borrarAlimentoPropio", id_)

    def buscar(self, texto: str, limite: int = 5) -> list:
        return self.llamar("Alimentos.buscar", texto, limite)

    def anotar_pendiente(self, texto, hc=None):
        return self.llamar("Store.anotarPendiente", texto, hc)

    def pendientes(self) -> list:
        return self.llamar("Store.pendientes")

    def borrar_pendiente(self, id_: str) -> int:
        return self.llamar("Store.borrarPendiente", id_)

    def pendientes_en_texto(self) -> str:
        return self.ctx.eval("Store.pendientesEnTexto()")

    def guardar_comida(self, comida: dict) -> list:
        return self.llamar("Store.guardarComida", comida)

    def comidas(self) -> list:
        return self.llamar("Store.comidas")

    # --- copias ----------------------------------------------------------
    def exportar(self) -> str:
        return self.ctx.eval("Store.exportar()")

    def importar(self, texto: str, modo: str) -> dict:
        return self.llamar("Store.importar", texto, modo)

    def borrar_todo(self) -> None:
        self.ctx.eval("Store.borrarTodo()")

    def persistente(self) -> bool:
        return self.llamar("Store.persistente")


@pytest.fixture
def motor() -> MotorBolo:
    return MotorBolo()


@pytest.fixture
def almacen() -> MotorAlmacen:
    return MotorAlmacen()


@pytest.fixture
def lectura() -> MotorLectura:
    return MotorLectura()


# Ajustes clinicos de ejemplo usados en la mayoria de tests. NO son una
# recomendacion: son los numeros del ejemplo de la documentacion.
AJUSTES_EJEMPLO: dict = {
    "objetivo": 100,
    "ratio": 10,
    "fsi": 30,
    "paso": 1,
    "redondeo": "cercano",
    "max_u": 20,
    "umbral_hipo": 70,
    "umbral_alto": 250,
}


@pytest.fixture
def ajustes() -> dict:
    return dict(AJUSTES_EJEMPLO)
