"""Genera los iconos de la aplicacion.

Se generan con codigo, y no a mano, para que sean reproducibles y para no
guardar binarios opacos en el repositorio: si hay que cambiar el color o el
dibujo, se cambia aqui y se vuelve a ejecutar.

    python tools/hacer_iconos.py

Requiere Pillow (esta en requirements-dev.txt; la aplicacion en si no necesita
Python para nada).
"""

from __future__ import annotations

import pathlib

from PIL import Image, ImageDraw

RAIZ = pathlib.Path(__file__).resolve().parents[1]
DESTINO = RAIZ / "web" / "icons"

FONDO = (11, 107, 143)      # el --principal de la hoja de estilo
GOTA = (255, 255, 255)
TAMANOS = (192, 512)


def dibujar_gota(d: ImageDraw.ImageDraw, cx: float, cy: float, alto: float) -> None:
    """Dibuja una gota: un circulo abajo y una punta triangular arriba."""
    radio = alto * 0.32
    centro_y = cy + alto * 0.18
    d.ellipse(
        [cx - radio, centro_y - radio, cx + radio, centro_y + radio],
        fill=GOTA,
    )
    # La punta arranca justo dentro del circulo para que no se vea la costura.
    d.polygon(
        [
            (cx, cy - alto * 0.5),
            (cx - radio * 0.99, centro_y + radio * 0.10),
            (cx + radio * 0.99, centro_y + radio * 0.10),
        ],
        fill=GOTA,
    )


def icono(tamano: int, margen_seguro: bool = False) -> Image.Image:
    """Un icono cuadrado.

    `margen_seguro` deja la gota dentro del 80 % central, que es lo que exige
    un icono "maskable" de Android para que no se recorte al enmascararlo.
    """
    # Se dibuja al cuadruple y se reduce: asi los bordes salen suaves sin
    # depender de ningun antialiasing del dibujante.
    escala = 4
    lado = tamano * escala
    img = Image.new("RGBA", (lado, lado), FONDO + (255,))
    d = ImageDraw.Draw(img)

    if not margen_seguro:
        # Esquinas redondeadas para el icono normal.
        mascara = Image.new("L", (lado, lado), 0)
        ImageDraw.Draw(mascara).rounded_rectangle(
            [0, 0, lado - 1, lado - 1], radius=int(lado * 0.22), fill=255
        )
        fondo = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
        fondo.paste(img, (0, 0), mascara)
        img = fondo
        d = ImageDraw.Draw(img)

    alto_gota = lado * (0.44 if margen_seguro else 0.56)
    dibujar_gota(d, lado / 2, lado / 2, alto_gota)
    return img.resize((tamano, tamano), Image.LANCZOS)


def main() -> None:
    DESTINO.mkdir(parents=True, exist_ok=True)
    escritos = []
    for t in TAMANOS:
        ruta = DESTINO / f"icon-{t}.png"
        icono(t).save(ruta, "PNG", optimize=True)
        escritos.append(ruta)
    ruta = DESTINO / "icon-maskable-512.png"
    icono(512, margen_seguro=True).save(ruta, "PNG", optimize=True)
    escritos.append(ruta)

    for r in escritos:
        print(f"{r.relative_to(RAIZ)}  ({r.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
