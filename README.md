# Calculadora de bolo de insulina rápida

Aplicación web (PWA) que calcula la dosis de insulina rápida a partir de lo que
se va a comer. Se le dice o se le escribe la comida en lenguaje normal
—«un plato de macarrones con tomate, dos rebanadas de pan y una manzana»—, ella
cuenta los hidratos de carbono y aplica las fórmulas de la terapia bolo-basal.

Funciona **sin conexión**, se instala en el móvil desde el navegador y **los
datos no salen del teléfono**.

---

## Antes de nada: qué es y qué no es esto

**Es** una ayuda al cálculo mental que ya hace el usuario. Muestra la operación
desglosada para que pueda comprobarla.

**No es** una indicación médica, ni un producto sanitario, ni sustituye el
criterio del equipo de endocrinología.

Tres reglas de diseño que no se negocian:

1. **Los parámetros clínicos los pone el médico.** El ratio insulina/hidratos,
   el factor de sensibilidad y la glucemia objetivo son estrictamente
   individuales. La aplicación **no trae ningún valor por defecto** y **no
   calcula nada** hasta que estén introducidos. Un valor por defecto plausible
   sería lo más peligroso que podría hacer este programa.
2. **El cálculo se ve entero.** Nunca un número a secas: siempre el bolo de la
   comida, el de corrección, el total y el redondeo, con sus operaciones.
3. **Los hidratos salen de una base de datos revisable**, nunca de una búsqueda
   en internet ni de un modelo de lenguaje. Un valor de hidratos inventado no
   se distingue a ojo de uno correcto; un alimento mal reconocido, sí, porque
   aparece en la lista de la pantalla.

Uso personal. **No lo publiquéis como producto ni como aplicación en una
tienda**: en la Unión Europea, el software que recomienda dosis de un
medicamento entra en el reglamento de productos sanitarios (MDR 2017/745,
regla 11), que es un mundo entero de certificación.

---

## Cómo se usa (resumen)

1. **Ajustes** → se introducen los tres parámetros de la pauta.
2. **Calcular** → se dicta o se escribe la comida y se pulsa *Leer la comida*.
3. Se **comprueba la lista** que aparece: se corrigen gramos o se quita lo que
   sobre. Lo marcado en naranja («revisar») o rojo («dudoso») es donde la
   aplicación no está segura.
4. Se pone la **glucemia** de ahora (opcional: sin ella solo se calcula la
   insulina de la comida).
5. **Calcular la dosis** → sale el número y de dónde viene.
6. **Apuntarlo** después de pincharse, para que quede el registro y para que la
   aplicación sepa cuánta insulina sigue actuando.

La guía completa, en lenguaje llano y pensada para imprimir, está en
[docs/GUIA_USUARIO.md](docs/GUIA_USUARIO.md).

---

## Las fórmulas

```
bolo de comida     = hidratos (g) ÷ ratio I:C
bolo de corrección = (glucemia − objetivo) ÷ FSI
dosis              = bolo de comida + bolo de corrección [− insulina activa]
```

Con ratio 10, FSI 30, objetivo 100, 116 g de hidratos y glucemia 160:

```
116 ÷ 10            = 11,6 U
(160 − 100) ÷ 30    =  2,0 U
                      ------
                      13,6 U  →  14 U (redondeo a unidades enteras)
```

### Barreras de seguridad

| Situación | Qué hace la aplicación |
|---|---|
| Glucemia por debajo del umbral de hipoglucemia (70 por defecto) | **Bloquea.** No muestra ninguna dosis; manda tratar la hipoglucemia primero |
| Falta el ratio, el FSI o el objetivo | **Bloquea** y lleva a Ajustes |
| Ratio, FSI u objetivo fuera de rango razonable | **Bloquea** |
| Dosis por encima del máximo configurado (20 U por defecto) | **Bloquea** y exige una confirmación explícita |
| Dosis por encima de 100 U (tope duro) | **Bloquea sin posibilidad de confirmar** |
| Hidratos por encima de 400 g | **Bloquea**: es una errata de teclado |
| Glucemia fuera de 20–800 mg/dL | **Bloquea**: es una errata de teclado |
| Glucemia por encima de 250 | Avisa de mirar cetonas |
| Queda insulina rápida actuando | **Avisa** y dice cuánta. Por defecto **no la resta**: eso es una decisión clínica |
| El total sale negativo | Lo deja en 0 U y sugiere tomar hidratos |
| No se entiende una palabra, o se entiende una cantidad pero no de qué | Lo dice y **no lo cuenta** (nunca omite hidratos en silencio) |
| Palabras sin sentido | 0 g de hidratos y aviso. Nunca inventa un valor |

---

## Por qué una web y no una aplicación nativa

Fue una decisión deliberada, no una comodidad:

| | PWA (esto) | App nativa |
|---|---|---|
| Coste | 0 € | 25 € de alta en Google Play, 99 €/año en Apple |
| Instalación | Se abre la dirección y «Añadir a pantalla de inicio» | Tienda, revisión, actualizaciones |
| Sin conexión | Sí (service worker) | Sí |
| Privacidad | Los datos no salen del navegador | Igual, si se hace bien |
| Actualizar | Un push a `main` | Nueva versión y revisión de la tienda |
| Funciona en iPhone y Android | Sí, el mismo código | Dos desarrollos |

Y una razón de fondo: una tienda de aplicaciones **rechazaría** un calculador
de dosis de insulina sin certificación de producto sanitario. Una página web
personal para el propio padre es otra cosa.

---

## Estructura

```
00_INSULINA/
├── web/                        ← ESTO es la aplicación (lo que se publica)
│   ├── index.html              única página; cuatro pantallas
│   ├── app.css                 estilos (sin fuentes ni CSS externos)
│   ├── manifest.webmanifest    para poder instalarla en el móvil
│   ├── sw.js                   service worker: funcionamiento sin conexión
│   ├── data/alimentos.js       BASE DE ALIMENTOS (246 alimentos)
│   ├── icons/                  iconos, generados con tools/hacer_iconos.py
│   └── js/
│       ├── bolus.js            EL CÁLCULO. Módulo puro, sin DOM ni red
│       ├── foods.js            índice y buscador de alimentos
│       ├── parser.js           lenguaje natural → alimentos y cantidades
│       ├── store.js            almacenamiento local (ajustes, registro)
│       ├── voice.js            dictado por voz
│       ├── llm.js              capa de IA OPCIONAL (apagada por defecto)
│       └── app.js              interfaz; aquí no hay ni una fórmula
├── tests/                      246 tests con pytest
├── tools/                      utilidades de desarrollo
├── docs/                       guía de usuario, flujo de trabajo, decisiones
├── .github/workflows/pages.yml publica web/ en GitHub Pages
├── requirements.txt            vacío: la aplicación no necesita nada
└── requirements-dev.txt        pytest, py-mini-racer, pillow
```

La separación importa: **`bolus.js` no toca el DOM, ni el almacenamiento, ni la
red.** Es lo que permite probar el cálculo exhaustivamente.

---

## Desarrollo

Python **3.11 o superior** (desarrollado con 3.13). Solo para los tests y las
herramientas: la aplicación no necesita Python.

```bash
python -m venv .venv
.venv\Scripts\pip install -r requirements-dev.txt
```

### Verlo en local

```bash
.venv\Scripts\python -m http.server 8770 --directory web
```

Y abrir <http://127.0.0.1:8770>.

También se puede abrir `web/index.html` haciendo doble clic. Está pensado para
que funcione desde `file://`: la base de alimentos es un `.js` cargado con
`<script>` y no un `.json` con `fetch` (que CORS bloquea sobre `file://`), y en
toda la ruta de arranque no hay ni una petición de red.

Dos salvedades sobre `file://`, dichas con precisión:

- El **service worker** no se registra (hay una comprobación de protocolo), y
  no hace falta: ya está todo en local.
- Algunos navegadores **restringen `localStorage`** en el origen `file://`. Si
  ocurre, la aplicación calcula igual pero no recuerda nada al cerrar, y lo
  avisa en pantalla. Para usarla de verdad, mejor servida por HTTP.

O sea: `file://` sirve para echarle un ojo rápido; para usarla, GitHub Pages o
el servidor local de arriba.

### Tests

```bash
.venv\Scripts\python run_tests.py
```

Los tests **ejecutan el JavaScript real de `web/js/` dentro de V8**
(py-mini-racer), no una reimplementación en Python. Para un cálculo que acaba
en una jeringa, probar una copia del código no sirve: hay que probar el que se
despliega.

| Archivo | Qué cubre |
|---|---|
| `tests/test_bolus.py` | el cálculo, los bloqueos y los avisos |
| `tests/test_parser.py` | la lectura de frases y el buscador |
| `tests/test_alimentos.py` | integridad de la base de alimentos |
| `tests/test_store.py` | ajustes, registro, insulina activa y copias |
| `tests/test_entrega.py` | que el paquete a publicar esté completo |

### Herramientas

```bash
# Informe de la base de alimentos (erratas, rangos, avisos)
.venv\Scripts\python tools/validar_alimentos.py

# Probar el buscador
.venv\Scripts\python tools/validar_alimentos.py --buscar "pan"

# Probar el intérprete con una frase
.venv\Scripts\python tools/validar_alimentos.py --probar "un plato de lentejas y una manzana"

# Regenerar los iconos
.venv\Scripts\python tools/hacer_iconos.py
```

---

## Publicarlo en GitHub Pages

1. Crear un repositorio en GitHub (puede ser **público**: no contiene ningún
   dato personal, todo se queda en el teléfono). Nunca subir las copias
   exportadas por la aplicación: son datos de salud y ya están en
   `.gitignore`.

2. Subir el proyecto:

   ```bash
   git remote add origin https://github.com/<usuario>/<repo>.git
   git push -u origin main
   ```

3. En GitHub: **Settings → Pages → Source: GitHub Actions**.

4. El workflow `.github/workflows/pages.yml` publica la carpeta `web/` en cada
   push a `main`, **pasando antes los tests**. Si están en rojo, no publica.

5. La dirección será `https://<usuario>.github.io/<repo>/`.

### Instalarlo en el móvil

- **Android (Chrome):** abrir la dirección → menú (⋮) → *Añadir a pantalla de
  inicio*.
- **iPhone (Safari):** abrir la dirección → botón de compartir → *Añadir a
  pantalla de inicio*. Tiene que ser Safari; desde Chrome en iOS no aparece la
  opción.

Queda con su icono, se abre a pantalla completa y funciona sin conexión.

### Actualizar

Al cambiar la aplicación hay que subir el número de versión **en los dos
sitios**: `VERSION` en `web/sw.js` y `VERSION_APP` en `web/js/app.js`. Es lo
que hace que un teléfono con la copia guardada se actualice. Hay un test que lo
comprueba (`test_las_versiones_van_a_una`).

---

## La base de alimentos

246 alimentos de cocina española, en `web/data/alimentos.js`:

```js
{id:"pan-blanco", nombre:"Pan blanco (barra)", grupo:"cereales", hc100:55,
 unidad_g:null, alias:["pan","barra de pan","baguette"],
 porciones:{rebanada:30, bocadillo:100, barra:250}},
```

- `hc100` — gramos de hidratos por 100 g de alimento **listo para comer**
- `unidad_g` — peso de «una unidad» cuando se cuenta por piezas (una manzana)
- `porciones` — medidas de casa de ese alimento concreto
- `alias` — cómo lo puede llamar el usuario

**Los valores son de referencia.** La comida real varía: la receta, el punto de
cocción, la marca y el tamaño del plato cambian el resultado con facilidad un
10–20 %. Conviene ajustarlos con la experiencia y, si se puede, con la
educadora en diabetes.

Se amplía de dos maneras:

- **Desde la aplicación** (pantalla *Alimentos*): lo que se añada ahí se guarda
  en el teléfono y tiene prioridad. Sirve también para **corregir** un valor de
  la base con el que no se esté de acuerdo. Es la vía normal.
- **Editando el archivo**, para que quede para todos. Después,
  `python tools/validar_alimentos.py` y `python run_tests.py`.

---

## La capa de IA (opcional, apagada, no recomendada)

La aplicación **no necesita ninguna IA**: el intérprete de frases funciona
entero en el teléfono y sin conexión.

`web/js/llm.js` existe porque en algún momento puede apetecer, y está aislado
con una interfaz única (`generar(prompt, opciones)`), un adaptador por
proveedor (Anthropic, OpenAI y cualquier endpoint compatible) y una factoría
que elige según configuración. El resto del código no conoce ningún proveedor
ni ningún nombre de modelo.

Si se activa, solo hace dos cosas:

1. **Proponer** hidratos para un alimento que no esté en la base. Es un
   borrador que el usuario revisa y guarda; se valida que el valor sea posible
   (0–100 g por 100 g) y **nunca entra directo en un cálculo**.
2. Ayudar a **leer** una frase que el intérprete de casa no haya entendido. Los
   gramos de hidratos los sigue poniendo la base local; lo que la IA nombre y
   no esté en la base **no se cuenta**, y se dice.

Nunca calcula la dosis.

**Por qué viene apagada y por qué no se recomienda:** una página web no puede
guardar una clave de API en secreto. Quedaría en el teléfono y cualquiera que
lo desbloquee podría leerla. Y el texto de la comida saldría del dispositivo
hacia el proveedor. Para el caso de uso real —que a veces falte un alimento—
la solución buena es añadirlo a mano una vez y que quede para siempre.

Si algún día se quisiera de verdad, la forma correcta es un intermediario en un
servidor que guarde la clave; `.env.example` deja apuntadas las variables.

---

## Limitaciones, dichas claramente

- **Los valores de hidratos son de tabla**, no de la comida concreta del plato.
- **La insulina activa usa un modelo lineal simple.** Sirve para *avisar* de
  que queda insulina trabajando, no para dosificar con precisión de bomba. Por
  eso, por defecto, avisa pero no resta.
- **No tiene en cuenta el ejercicio, el alcohol, el estrés, la enfermedad ni la
  grasa de la comida**, y todos ellos afectan a la glucemia. La aplicación
  calcula la parte que se puede calcular; el resto es criterio del usuario y de
  su médico.
- **Si se borran los datos del navegador, se pierde el registro.** No hay copia
  en la nube, y es a propósito. Hay que descargar una copia de vez en cuando
  (*Registro → Descargar copia*).
- **El dictado por voz depende del navegador.** Va bien en Chrome de Android;
  en el Safari del iPhone es irregular. Siempre queda el micrófono del propio
  teclado, que funciona en todos los teléfonos.
- **No hay sincronización entre dispositivos.** Cada teléfono es independiente;
  se mueve con exportar e importar.

---

## Documentación

- [docs/GUIA_USUARIO.md](docs/GUIA_USUARIO.md) — cómo se usa, en lenguaje llano
- [docs/FLUJO_TRABAJO.md](docs/FLUJO_TRABAJO.md) — cómo funciona por dentro
- [docs/DECISIONES.md](docs/DECISIONES.md) — qué se decidió y por qué
