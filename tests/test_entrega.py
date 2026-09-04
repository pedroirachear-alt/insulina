"""Comprobaciones de la entrega en si.

No prueban logica: prueban que el paquete que se sube a GitHub Pages este
completo y sea coherente. Un archivo con un error de sintaxis, o una version
del service worker sin cambiar, se traducen en una aplicacion que no arranca o
que se queda con la copia vieja en el telefono, y eso en un telefono ajeno es
muy incomodo de diagnosticar.
"""

from __future__ import annotations

import json
import pathlib
import re

import pytest
from py_mini_racer import MiniRacer
# Las excepciones no estan en el paquete raiz, solo en el submodulo.
from py_mini_racer.py_mini_racer import MiniRacerBaseException

RAIZ = pathlib.Path(__file__).resolve().parents[1]
WEB = RAIZ / "web"

MODULOS = [
    "data/alimentos.js",
    "js/bolus.js",
    "js/foods.js",
    "js/parser.js",
    "js/store.js",
    "js/voice.js",
    "js/llm.js",
    "js/app.js",
    "sw.js",
]


# ---------------------------------------------------------------------------
# Sintaxis
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("modulo", MODULOS)
def test_el_javascript_es_sintacticamente_valido(modulo):
    """Compila cada archivo en V8. `app.js` y `sw.js` no se pueden ejecutar
    fuera de un navegador, asi que se envuelven en una funcion que nunca se
    llama: eso compila el cuerpo sin ejecutarlo."""
    fuente = (WEB / modulo).read_text(encoding="utf-8")
    ctx = MiniRacer()
    try:
        ctx.eval("(function(){ " + fuente + " \n});")
    except MiniRacerBaseException as e:
        pytest.fail(f"{modulo} no compila: {e}")


@pytest.mark.parametrize("modulo", MODULOS)
def test_los_archivos_estan_en_utf8_sin_bom(modulo):
    crudo = (WEB / modulo).read_bytes()
    assert not crudo.startswith(b"\xef\xbb\xbf"), f"{modulo} tiene BOM"
    crudo.decode("utf-8")  # lanza si no es UTF-8


# ---------------------------------------------------------------------------
# Que no falte nada
# ---------------------------------------------------------------------------

def test_estan_todos_los_archivos_de_la_aplicacion():
    for necesario in MODULOS + [
        "index.html", "app.css", "manifest.webmanifest",
        "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png",
    ]:
        assert (WEB / necesario).exists(), f"falta {necesario}"


def test_el_html_carga_todos_los_modulos():
    html = (WEB / "index.html").read_text(encoding="utf-8")
    for modulo in MODULOS:
        if modulo == "sw.js":
            continue  # lo registra app.js, no una etiqueta script
        assert modulo in html, f"index.html no carga {modulo}"


def test_el_orden_de_carga_respeta_las_dependencias():
    """`foods.js` necesita la base cargada, y `parser.js` necesita el indice.
    Si el orden se rompe, la aplicacion arranca sin alimentos."""
    html = (WEB / "index.html").read_text(encoding="utf-8")
    posicion = {m: html.index(m) for m in
                ["data/alimentos.js", "js/foods.js", "js/parser.js", "js/store.js", "js/app.js"]}
    assert posicion["data/alimentos.js"] < posicion["js/foods.js"]
    assert posicion["js/foods.js"] < posicion["js/parser.js"]
    assert posicion["js/foods.js"] < posicion["js/store.js"]
    assert posicion["js/app.js"] == max(posicion.values())


def test_no_hay_recursos_externos():
    """La aplicacion tiene que funcionar sin conexion y sin pedir nada a
    terceros: ni fuentes, ni CDN, ni analitica.

    Se buscan REFERENCIAS reales (`src=`, `href=`, `url()`, `@import`), no la
    simple aparicion de "https://": ese texto sale, con toda legitimidad, en
    el placeholder del campo de la URL base del proveedor de IA.
    """
    html = (WEB / "index.html").read_text(encoding="utf-8")
    css = (WEB / "app.css").read_text(encoding="utf-8")

    externas = re.findall(r'(?:src|href)\s*=\s*["\']((?:https?:)?//[^"\']*)', html)
    assert not externas, f"index.html carga recursos externos: {externas}"

    assert "@import" not in css, "app.css importa otra hoja de estilo"
    urls = re.findall(r'url\(\s*["\']?((?:https?:)?//[^)"\']*)', css)
    assert not urls, f"app.css carga recursos externos: {urls}"

    # Ni fuentes de Google ni analitica, escritas de cualquier manera.
    for texto, donde in ((html, "index.html"), (css, "app.css")):
        for prohibido in ("fonts.googleapis", "fonts.gstatic", "cdn.", "unpkg",
                          "jsdelivr", "google-analytics", "googletagmanager"):
            assert prohibido not in texto, f"{donde} referencia {prohibido}"


# ---------------------------------------------------------------------------
# Service worker y manifiesto
# ---------------------------------------------------------------------------

def test_el_service_worker_guarda_todos_los_archivos():
    sw = (WEB / "sw.js").read_text(encoding="utf-8")
    for modulo in MODULOS:
        if modulo == "sw.js":
            continue
        assert modulo in sw, f"sw.js no guarda {modulo}: no funcionaria sin conexion"
    for extra in ["index.html", "app.css", "manifest.webmanifest"]:
        assert extra in sw, f"sw.js no guarda {extra}"


def test_las_versiones_van_a_una():
    """La version del service worker, la de la aplicacion y la del paquete
    tienen que coincidir: es lo que hace que un telefono con la copia vieja
    se actualice."""
    sw = (WEB / "sw.js").read_text(encoding="utf-8")
    app = (WEB / "js" / "app.js").read_text(encoding="utf-8")
    v_sw = re.search(r"VERSION\s*=\s*'insulina-v([\d.]+)'", sw).group(1)
    v_app = re.search(r"VERSION_APP\s*=\s*'([\d.]+)'", app).group(1)
    assert v_sw == v_app, f"sw.js dice {v_sw} y app.js dice {v_app}"


def test_el_manifiesto_es_valido():
    m = json.loads((WEB / "manifest.webmanifest").read_text(encoding="utf-8"))
    assert m["name"] and m["short_name"]
    assert m["display"] == "standalone"
    assert m["lang"] == "es"
    # Rutas relativas: en GitHub Pages la aplicacion no vive en la raiz del
    # dominio, sino en /<repositorio>/.
    assert not m["start_url"].startswith("/"), "start_url absoluto rompe GitHub Pages"
    for icono in m["icons"]:
        assert not icono["src"].startswith("/")
        assert (WEB / icono["src"]).exists(), f"falta el icono {icono['src']}"
    propositos = {i.get("purpose") for i in m["icons"]}
    assert "maskable" in propositos, "hace falta un icono maskable para Android"


def test_el_html_no_usa_rutas_absolutas():
    html = (WEB / "index.html").read_text(encoding="utf-8")
    assert 'href="/' not in html
    assert 'src="/' not in html


# ---------------------------------------------------------------------------
# Advertencias que no se pueden perder
# ---------------------------------------------------------------------------

def test_la_pantalla_principal_avisa_de_que_no_es_una_indicacion_medica():
    html = (WEB / "index.html").read_text(encoding="utf-8")
    assert "no una indicacion medica" in html
    assert "aviso-legal" in html


def test_la_ayuda_con_ia_viene_apagada():
    """Si esto se activara solo, la clave de API y el texto de la comida
    saldrian del telefono sin que nadie lo haya decidido."""
    llm = (WEB / "js" / "llm.js").read_text(encoding="utf-8")
    assert re.search(r"activo:\s*false", llm), "la ayuda con IA no viene apagada"
    assert "proveedor: 'ninguno'" in llm


def test_no_hay_ninguna_clave_de_api_en_el_repositorio():
    """Ni de prueba. Una clave en el repositorio de GitHub es publica."""
    sospechosos = re.compile(r"(sk-ant-[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{32,})")
    for ruta in list(WEB.rglob("*.js")) + list(WEB.rglob("*.html")) + [WEB / "app.css"]:
        texto = ruta.read_text(encoding="utf-8")
        assert not sospechosos.search(texto), f"{ruta.name} parece contener una clave"


def test_no_se_incrusta_ningun_nombre_de_modelo_en_la_logica():
    """Los nombres de modelo cambian. Solo pueden aparecer en la tabla de
    sugerencias configurable, nunca dentro de una llamada."""
    llm = (WEB / "js" / "llm.js").read_text(encoding="utf-8")
    bloque = llm[llm.index("MODELOS_SUGERIDOS"):llm.index("/* ------------------------------------------------------------ configuracion */")]
    resto = llm.replace(bloque, "")
    for modelo in ("claude-", "gpt-", "gemini-"):
        assert modelo not in resto, f"nombre de modelo incrustado en la logica: {modelo}"
