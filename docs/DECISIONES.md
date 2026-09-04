# Registro de decisiones

Qué se decidió, qué se descartó y por qué. Sirve para no volver a discutirlo, y
para poder cambiar de opinión sabiendo qué se estaba comprando.

Fecha de partida: **2026-09-05**.

---

## El encargo

Ayudar a una persona con diabetes tipo 1 a calcular la dosis de insulina rápida
antes de cada comida. Objetivo preprandial de 100 mg/dL. La insulina lenta es
fija; la rápida exige una cuenta mental en cada comida a partir de los hidratos
de carbono de lo que se va a comer.

La pregunta explícita del encargo era: **¿base de datos local de alimentos, o
buscar los hidratos en internet?**

---

## D1. Base de datos local, no búsqueda en internet ni IA

**Decidido:** una base de datos local revisable (`web/data/alimentos.js`, 246
alimentos), ampliable desde la propia aplicación.

**Descartado:** buscar los hidratos en internet o preguntárselos a un modelo de
lenguaje en cada comida.

**Por qué.** Es la decisión de la que dependen todas las demás.

Un valor de hidratos erróneo **no se puede detectar a ojo**. Si la aplicación
dice que un plato de lentejas tiene 42 g y en realidad tiene 65, el usuario no
tiene forma de notarlo: verá un número plausible y se pinchará la dosis que
salga. En cambio, si la aplicación reconoce mal el *alimento* —dice «lentejas»
donde había «garbanzos»— el usuario lo ve inmediatamente en la lista de la
pantalla y lo corrige.

De ahí la regla que estructura todo el diseño: **el intérprete puede
equivocarse en el alimento, pero los gramos de hidratos salen siempre de una
tabla que una persona ha revisado.** Un modelo de lenguaje alucinando un valor
de hidratos es un fallo silencioso; un alimento mal reconocido es un fallo
visible.

Además: funciona sin conexión (hace falta en un restaurante con mala
cobertura), es instantáneo, es determinista —la misma comida da siempre la
misma cuenta— y no manda a ningún sitio lo que come el usuario.

**Lo que se pierde:** falta algún alimento. Se ha resuelto con la pantalla de
*Alimentos*: se añade una vez y queda para siempre, que es mejor que
preguntárselo a alguien cada día. Y sirve además para **corregir** los valores
de la base con la experiencia propia, que es lo que de verdad ajusta las dosis.

---

## D2. PWA, no aplicación nativa

**Decidido:** página web estática instalable (PWA), publicada en GitHub Pages.

**Descartado:** aplicación nativa de Android/iOS; aplicación de escritorio;
herramienta de Python con interfaz.

**Por qué.** El usuario la necesita en el bolsillo, tres o cuatro veces al día,
en la mesa. Eso descarta todo lo que no sea el móvil.

Entre PWA y nativa: coste 0 € frente a 25 € de alta en Google Play y 99 €/año
en Apple; instalación de dos toques frente a una tienda; un solo código para
iPhone y Android; y actualizar es un `git push`.

Y la razón de fondo: **una tienda de aplicaciones rechazaría un calculador de
dosis de insulina** sin certificación de producto sanitario. Una página web
personal para el propio padre es otra cosa.

**Consecuencia asumida:** JavaScript en vez de Python, que es el lenguaje
habitual del resto de las herramientas. Se compensa en D8.

---

## D3. Ningún parámetro clínico por defecto

**Decidido:** ratio, FSI y glucemia objetivo empiezan a `null`. Si falta uno,
el cálculo **se bloquea**.

**Descartado:** valores iniciales «típicos» (ratio 15, FSI 50) para que la
aplicación funcione desde el primer minuto.

**Por qué.** Sería lo más peligroso que podría hacer este programa. Un ratio
por defecto plausible produce dosis plausibles que nadie ha prescrito, y el
usuario no tiene forma de saber que está usando un número inventado. Es mejor
que no funcione y diga por qué.

Está comprobado por dos tests (`test_no_hay_parametros_clinicos_de_fabrica` y
`test_no_hay_parametros_clinicos_por_defecto`) precisamente para que a nadie se
le ocurra «arreglarlo» más adelante.

---

## D4. El cálculo se muestra desglosado, siempre

**Decidido:** cada resultado va acompañado del bolo de comida, el de
corrección, el total sin redondear, el redondeo y los tres parámetros usados.

**Descartado:** mostrar solo el número, que es más limpio.

**Por qué.** Es un calculador para alguien que **ya sabe hacer la cuenta**. Ver
el desglose le permite detectar en un segundo que los gramos de un plato no son
los que él tenía en la cabeza, que es el error más frecuente con diferencia. Un
número a secas convierte una ayuda en un oráculo.

---

## D5. Bloquear, no avisar, cuando el dato es imposible

**Decidido:** trece situaciones bloquean el cálculo (ver la tabla del README).
No sale ningún número.

**Descartado:** avisar y dar el número igualmente, dejando decidir al usuario.

**Por qué.** Un aviso se lee una vez y se ignora las siguientes. Un bloqueo,
no. Y en los casos que bloquean, el número **no tiene ningún significado**:

- **Hipoglucemia** (< 70): no se calcula, y no se muestra tachado ni en gris.
  No se calcula. Lo que toca es tratar la hipoglucemia.
- **Falta un parámetro:** cualquier número saldría de un valor inventado.
- **Hidratos > 400 g o glucemia fuera de 20–800:** son erratas de teclado, no
  comidas ni glucemias.

Dos excepciones matizadas:

- **Superar el máximo del usuario** (20 U por defecto) sí muestra el número,
  porque hace falta verlo para entender qué ha pasado, pero exige una
  confirmación explícita. Es la red que caza el 600 escrito donde iban 60.
- **Superar 100 U** es un tope duro **sin confirmación posible**. Ahí ya no hay
  interpretación benévola: algo está mal configurado.

---

## D6. La insulina activa se avisa, no se resta

**Decidido:** se calcula, se muestra y se avisa. Restarla automáticamente es un
interruptor en Ajustes, **apagado por defecto**.

**Descartado:** restarla siempre, como hacen las bombas de insulina.

**Por qué.** Restar la insulina activa es lo correcto *si el usuario maneja el
concepto*. Si su médico no le ha explicado qué es la insulina activa, la
aplicación estaría modificando su dosis por un criterio que él no ha aceptado.

Y el modelo es simple: decaimiento lineal sobre la duración de acción. Las
curvas reales de los análogos rápidos no son lineales. Para **avisar** de que
queda insulina trabajando, sobra; para **dosificar**, no da la precisión que
esa resta implicaría. La aplicación hace lo que su modelo permite hacer con
honestidad.

La insulina lenta se excluye explícitamente del cálculo: tiene otra curva
completamente distinta. Hay un test.

---

## D7. La capa de IA existe, está aislada y viene apagada

**Decidido:** `web/js/llm.js` implementa la interfaz agnóstica que pide el
marco de trabajo (una interfaz única, un adaptador por proveedor, una
factoría), funciona de verdad, y **viene desactivada**. Su alcance se limita a
proponer un alimento que falte y ayudar a leer una frase; **nunca** calcula una
dosis ni fija por sí sola un valor de hidratos.

**Descartado:** (a) no incluirla; (b) incluirla activada como vía principal de
lectura de frases.

**Por qué.** El marco de trabajo dice que si la automatización llega a ser
total, la herramienta debería poder ejecutarse en local y sin conexión. **Aquí
lo es**: el intérprete de casa lee bien las frases reales, y los hidratos ya
están en la base. La IA no aporta a lo que la aplicación hace todos los días.

Y hay un problema que no tiene arreglo desde una página web: **no puede
guardar una clave de API en secreto**. Quedaría en el teléfono, legible por
cualquiera que lo desbloquee, y el texto de la comida saldría del dispositivo.
Para el problema real —que a veces falte un alimento— la solución buena es
añadirlo a mano una vez.

Se deja el módulo porque el coste de mantener la costura es bajo y el de
recrearla más tarde, alto. Si algún día se activa de verdad, la forma correcta
es un intermediario en un servidor que guarde la clave; `.env.example` deja
apuntadas las variables.

**Cuando se usa, se usa con red:** el valor que propone se valida (0–100 g por
100 g), se presenta marcado como estimación sin verificar, y el usuario tiene
que revisarlo y guardarlo antes de que entre en ningún cálculo. Lo que la IA
nombre y no esté en la base **no se cuenta**, y se dice.

---

## D8. Los tests ejecutan el JavaScript real, no una copia en Python

**Decidido:** pytest carga `web/js/*.js` en un V8 embebido (py-mini-racer) y
prueba el código que se despliega.

**Descartado:** (a) implementación de referencia en Python probada en paralelo;
(b) tests en JavaScript con `node --test`; (c) no probar el cálculo.

**Por qué.** Para un cálculo que acaba en una jeringa, probar una copia del
código no sirve de nada: las dos implementaciones divergen y el test deja de
significar lo que dice.

`node --test` era la opción natural, pero **en este equipo no hay Node**, y
exigirlo para poder pasar los tests rompe la portabilidad que pide el marco de
trabajo. `py-mini-racer` se instala desde una rueda precompilada, sin
compilador, y solo hace falta para desarrollar: la aplicación no necesita nada.

**Lo que se gana además:** el resto del proyecto (herramientas, validador de la
base, informes) sigue siendo Python, que es el entorno habitual.

---

## D9. La base de alimentos es un `.js`, no un `.json`

**Decidido:** `window.ALIMENTOS_DB = {...}` en un archivo `.js`.

**Por qué.** Con un `.json` habría que cargarlo con `fetch`, y `fetch` sobre
`file://` está bloqueado por CORS. Con un `.js` cargado por `<script>`, **la
aplicación funciona haciendo doble clic en `index.html`**, sin servidor. Eso
vale mucho para probar cosas y para tener un plan B si GitHub Pages falla.

Sigue siendo legible desde Python quitando el envoltorio, que es lo que hacen
el validador y los tests.

---

## D10. Los datos se quedan en el teléfono

**Decidido:** todo en `localStorage`. Sin servidor, sin cuenta, sin nube.
Exportación e importación manual a JSON.

**Descartado:** sincronización en la nube, aunque fuera gratuita.

**Por qué.** Son datos de salud de una persona concreta. Sin servidor no hay
brecha de seguridad posible, ni cuenta que perder, ni política de privacidad
que escribir, ni un tercero al que confiárselos.

**Contrapartida asumida y documentada:** si se borran los datos del navegador o
se pierde el teléfono, se pierde el registro. Se compensa con la exportación, y
la guía de usuario la recomienda explícitamente. Se consideró aceptable: el
registro es útil pero no crítico, y lo crítico —los tres parámetros— está en un
papel del endocrino.

En navegación privada `localStorage` lanza excepciones. La aplicación se cae a
una copia en memoria, sigue calculando y lo dice en pantalla.

---

## D11. Voz opcional, con una salida que funciona siempre

**Decidido:** botón de micrófono cuando el navegador lo soporta; campo de texto
**siempre** visible; y un aviso en pantalla de que se puede usar el micrófono
del teclado.

**Por qué.** El reconocimiento de voz del navegador va bien en Chrome de
Android y es irregular en el Safari del iPhone, sobre todo dentro de una
aplicación instalada en la pantalla de inicio. Depender de él sería dejar la
aplicación inservible en la mitad de los teléfonos.

El **micrófono del teclado** es el mismo dictado del sistema, funciona en todos
los teléfonos y no cuesta ni una línea de código. Está dicho en la interfaz y
en la guía.

---

## D12. Las tres reglas del intérprete que salieron de fallos reales

No son refinamientos: son correcciones de errores que se encontraron probando
con frases de verdad, y cada una tiene su test con el fallo documentado.

**La regla del «bocadillo».** Hay palabras que son a la vez medida y comida.
«Un bocadillo de jamón» tomado al pie de la letra son 170 g de jamón (0,8 g de
hidratos) cuando un bocadillo son unos 56 g: **unas 5 unidades de insulina de
diferencia**. Consecuencia de diseño: las medidas específicas de un plato
(bocadillo, pincho, tableta, filete) se declaran **dentro de cada alimento**,
nunca como unidad genérica. Hay un test que impide volver a meterlas
(`test_las_unidades_genericas_son_de_verdad_genericas`).

**La regla del «a la».** «Espaguetis a la carbonara» reconocía la pasta *y* el
plato, y contaba los hidratos dos veces.

**Las guardas de longitud.** Palabras de dos o tres letras casaban por
aproximación con alimentos parecidos: «no» con *nocilla*, «se» con *setas*,
«que» con *queso*. La frase «un plato de no sé qué» producía **144 g de
hidratos de la nada**, unas 14 unidades de insulina. Ahora no se aproximan
palabras de menos de cuatro letras y lo buscado tiene que ser de tamaño
parecido a lo encontrado.

El test que cubre esto último (`test_el_ruido_no_produce_hidratos`) es el más
importante del proyecto.

---

## D13. Nunca omitir hidratos en silencio

**Decidido:** si se entiende una cantidad pero no de qué («un plato de…»), se
dice en pantalla, se marca la confianza como baja y **no se cuenta**.

**Por qué.** Se encontró probando: «cuatro croquetas y una caña» contaba las
croquetas y **la caña desaparecía sin dejar rastro**. Omitir hidratos produce
insulina de menos, que es igual de peligroso que al revés, y es peor porque es
invisible: la lista parecía completa.

Del mismo problema salió otro hallazgo, este por los tests: un alimento propio
con el valor de hidratos sin rellenar entraba en el índice y aportaba 0 g.
`Number(null)` vale 0 y es finito, así que la comprobación tiene que ser de
tipo, no de finitud. Ahora se valida en `store.js` y en `foods.js`, con los
mismos criterios, para que la pantalla y la importación de copias no puedan
divergir.

---

## D14. Qué NO hace la aplicación, a propósito

- **No sugiere ni ajusta parámetros.** Ni siquiera con el registro entero
  delante. Eso es titulación de insulina y es competencia del endocrino.
- **No interpreta tendencias ni pronostica glucemias.** No hay datos ni modelo
  para hacerlo con seriedad.
- **No cuenta grasas ni proteínas** ni corrige por el índice glucémico. Afectan,
  pero incorporarlo bien exige una complejidad que no tiene respaldo en la
  pauta del usuario.
- **No tiene en cuenta el ejercicio, el alcohol, el estrés ni la enfermedad.**
  Calcula la parte que se puede calcular; el resto es criterio del usuario.
- **No se conecta con medidores ni con sensores continuos.** No hay API abierta
  para hacerlo desde una página web, y añadiría una dependencia de hardware.

Todo esto está dicho en el README y en la guía. La regla general: **la
aplicación hace exactamente la cuenta que el usuario ya hace, y nada más.**

---

## Pendiente, por si se retoma

Nada de esto es necesario para el uso diario:

1. **Ampliar la base con la experiencia.** Lo que más mejora las dosis. Se hace
   usándola y corrigiendo desde la pantalla de *Alimentos*.
2. **Un informe para la revisión médica.** Un PDF o una hoja con el registro
   del último mes para llevar al endocrino. Sería útil y es sencillo.
3. **Gráfica de glucemias del registro.** Solo si el endocrino la pide: la
   aplicación no debe invitar a autointerpretarlas.
4. **Intermediario para la IA.** Solo si se decide que hace falta de verdad.
5. **Base de datos oficial (BEDCA/USDA).** Importar valores de una fuente
   citable en vez de tablas de referencia. Mejoraría la trazabilidad; no
   necesariamente la exactitud del plato concreto, que depende de la receta.
