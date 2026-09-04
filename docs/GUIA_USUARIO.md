# Guía de uso

Esta guía está escrita para la persona que va a usar la aplicación todos los
días. Se puede imprimir.

---

## Lo primero: qué hace y qué no hace

La aplicación hace **la misma cuenta que ya haces de cabeza** antes de cada
comida, pero sin que tengas que hacerla:

- suma los hidratos de carbono de lo que vas a comer,
- los divide por tu ratio,
- añade la corrección si la glucemia está alta,
- y te dice cuántas unidades de insulina rápida salen.

**Lo que no hace:** decidir por ti. Te muestra la cuenta entera para que la
puedas comprobar. Si algo no te cuadra, hazle caso a tu criterio y a lo que te
haya dicho tu médico, no a la aplicación.

---

## Instalarla en el móvil

Solo hay que hacerlo una vez.

**Si tienes Android:**

1. Abre la dirección en **Chrome**.
2. Toca el menú de los tres puntos (arriba a la derecha).
3. Toca **«Añadir a pantalla de inicio»** y confirma.

**Si tienes iPhone:**

1. Abre la dirección en **Safari** (tiene que ser Safari).
2. Toca el botón de compartir, el cuadrado con la flecha hacia arriba.
3. Baja y toca **«Añadir a pantalla de inicio»**.

Ya tienes el icono azul con la gota en la pantalla del móvil. Se abre como
cualquier otra aplicación y **funciona sin internet**.

---

## Preparación: los tres números de tu pauta (solo una vez)

Antes del primer uso hay que meter tus datos. Hasta que estén, la aplicación no
calcula nada: es a propósito.

Entra en **Ajustes** (el engranaje, abajo a la derecha) y rellena:

| Qué | Qué significa | Ejemplo |
|---|---|---|
| **Glucemia objetivo** | La cifra a la que quieres llegar antes de comer | 100 |
| **Ratio** | Cuántos gramos de hidratos cubre 1 unidad de rápida | 10 |
| **FSI** | Cuántos mg/dL te baja 1 unidad de rápida | 30 |

> **Estos tres números los pone tu endocrino.** No los cambies por tu cuenta ni
> los saques de internet: son distintos en cada persona, y en la misma persona
> cambian con el tiempo. Si no los sabes, pregúntalos en la próxima revisión.

Luego pulsa **«Guardar los ajustes»**.

Si necesitas números distintos según la comida (es habitual necesitar más
insulina en el desayuno), marca **«Uso valores distintos según la comida»** y
rellena los que cambien. Los que dejes en blanco usan el valor general.

### Lo demás de Ajustes

Ya viene puesto con valores prudentes; no hace falta tocarlo. Por si acaso:

- **Escalón de la pluma:** unidades enteras o medias unidades, según tu pluma.
- **Máximo por pinchazo:** 20 U. Si sale más, la aplicación se para y te pide
  que compruebes los datos. Es la red que caza un error de teclado.
- **Hipoglucemia por debajo de:** 70. Por debajo de esa cifra no da dosis.
- **Restar la insulina que sigue actuando:** viene **desactivado**. Así la
  aplicación te *avisa* de que queda insulina trabajando pero no toca la
  dosis. Actívalo solo si tu médico te ha explicado cómo se usa.
- **Tus insulinas:** los nombres y la dosis de la lenta, solo para tenerlo
  apuntado.

---

## El día a día: calcular una dosis

### 1. Dile qué vas a comer

En la pantalla **Calcular**, escribe o dicta la comida como se la contarías a
alguien:

> *un plato de macarrones con tomate, dos rebanadas de pan y una manzana*

Para dictar, toca el **botón del micrófono** azul y habla. Cuando termines, la
aplicación lee la frase sola.

> **Si el micrófono no aparece o no funciona:** toca el cuadro de texto y usa
> el **micrófono del teclado del móvil**, el que sale al lado de la barra
> espaciadora. Es el mismo dictado del teléfono y funciona siempre.

Luego pulsa **«Leer la comida»**.

**Cómo le puedes hablar.** Entiende medidas de casa y pesos:

| Puedes decir | Lo entiende como |
|---|---|
| un plato de arroz | 200 g de arroz cocido |
| medio plato de lentejas | 125 g |
| un plato y medio de arroz | 300 g |
| dos rebanadas de pan | 60 g |
| una manzana / tres huevos | por piezas |
| 150 gramos de pasta | el peso exacto |
| un cuarto de kilo de patatas | 250 g |
| un vaso de leche | 200 ml |
| una lata de coca cola | 330 ml |
| dos onzas de chocolate negro | 16 g |
| media docena de huevos | 6 huevos |
| un bocadillo de jamón | el bocadillo entero |
| una caña / un tercio | cerveza |
| **un café solo sin azúcar** | el azúcar lo descarta («sin») |

También aguanta faltas y lo que el dictado entienda mal: «macarones» encuentra
«macarrones».

### 2. **Comprueba la lista** (este paso es el importante)

Aparece la lista de lo que ha entendido, con los gramos y los hidratos de cada
cosa:

```
Macarrones con tomate     [ 250 ]   65 g
Pan blanco (barra)        [  60 ]   33 g
Manzana                   [ 150 ]   18 g
                    Hidratos de carbono: 116 g
```

- Si un plato era más grande o más pequeño, **cambia los gramos** en el cuadro.
  El total se recalcula solo.
- Si ha entendido algo que no era, tócale la **✕** y quítalo.
- Si falta algo, pulsa **«Añadir un alimento»** y búscalo.

Fíjate en las etiquetas de color:

- **«revisar»** (naranja): ha supuesto la cantidad. Comprueba que sea la tuya.
- **«dudoso»** (rojo): no está seguro del alimento o de la cantidad. Míralo
  bien.

Y lee los avisos que salgan arriba. Si dice que no ha entendido una palabra,
**eso no está contado**: añádelo a mano.

### 3. Pon la glucemia

Escribe la cifra que te acabe de dar el medidor.

**Si la dejas en blanco**, calcula solo la insulina de la comida, sin
corrección. Es lo correcto cuando no te has medido.

El **momento** (desayuno, comida, merienda, cena) lo pone según la hora;
cámbialo si no coincide.

### 4. Calcular

Pulsa **«Calcular la dosis»**. Sale el número grande y, debajo, de dónde viene:

```
Bolo de la comida        116 g HC / 10 g/U        11,6 U
Corrección por glucemia  (160 − 100) / 30          2,0 U
Total antes de redondear                          13,6 U
Dosis a pinchar          redondeado a 1 U          14 U
```

**Comprueba la cuenta.** Es un minuto y es la razón de que esté ahí.

### 5. Apúntalo

Después de pincharte, pulsa **«Ya me lo he pinchado: apuntarlo»**. Así queda en
el registro y la aplicación sabe cuánta insulina te queda actuando.

---

## Cuando la aplicación se para

No es un error: es a propósito. Estas son las razones y qué hacer.

### «Estás en hipoglucemia»

La glucemia está por debajo de 70. **No da ninguna dosis.** Trata la
hipoglucemia como te haya dicho tu médico, vuelve a medirte y entonces calcula.

### «Falta el ratio / el FSI / la glucemia objetivo»

No están puestos en Ajustes. Pulsa el botón que te lleva allí.

### «El cálculo da X U, más que tu máximo de 20 U»

Ha salido una dosis alta. **Casi siempre es un error de teclado** (un 600 donde
iban 60 g, o un 1600 de glucemia). Comprueba los hidratos y la glucemia.

Si de verdad la comida era así de grande y el número es correcto, hay un botón
para confirmarlo expresamente. Antes de tocarlo, mira la cuenta con calma.

### «Hay algo mal en los datos. NO te pinches»

Ha salido una dosis imposible. Es un fallo de configuración: revisa Ajustes,
sobre todo el ratio.

### «Has introducido X g de hidratos»

Más de 400 g en una comida. Es una errata: revisa la lista.

### «Has dicho una cantidad pero no se ha entendido de qué»

Ha entendido «un plato de…» pero no de qué. **Eso no está contado.** Búscalo en
la pantalla de Alimentos y añádelo.

---

## Los avisos (no paran el cálculo, pero hay que leerlos)

- **«Quedan unas X U de insulina rápida actuando»** — te pinchaste hace poco.
  La aplicación **no** lo ha restado. Si vas a corregir una glucemia alta, ten
  cuidado con juntar dos correcciones seguidas.
- **«Por encima de 250 conviene mirar cetonas»** — sigue la pauta de tu médico.
- **«Estás por debajo del objetivo, así que se resta insulina»** — normal
  cuando la glucemia está algo baja pero no en hipoglucemia.
- **«El cálculo sale negativo»** — la comida no cubre lo baja que tienes la
  glucemia. Deja la dosis en 0 y valora comer algo sin pincharte.
- **«Revisa la lista antes de calcular»** — hay alimentos de los que no está
  seguro.

---

## Si falta un alimento, o un valor no te cuadra

Es normal y tiene arreglo definitivo. Ve a **Alimentos**:

1. **Búscalo primero**, puede estar con otro nombre.
2. Si no está, en **«Añadir o corregir un alimento»** pon:
   - el **nombre** con el que lo vas a llamar,
   - los **hidratos por 100 g** (vienen en la etiqueta del producto, en
     «hidratos de carbono»),
   - lo que pesa **una ración** tuya en gramos.
3. **«Guardar el alimento»**.

A partir de ese momento la aplicación lo reconoce por su nombre para siempre.

**Para corregir un valor que no te cuadra:** haz lo mismo con el nombre exacto
que ya tiene. El tuyo manda sobre el de la base. Si por experiencia sabes que
«un plato de arroz» en tu casa te sube más de lo que dice la aplicación, este
es el sitio donde arreglarlo.

---

## Las comidas de siempre

Si desayunas casi siempre lo mismo, no hace falta dictarlo cada día:

1. Prepara la comida como siempre y comprueba la lista.
2. Pulsa **«Guardar esta comida»** y ponle un nombre («Desayuno de siempre»).
3. A partir de entonces aparece como un botón en la pantalla de Calcular: un
   toque y ya está la lista puesta.

---

## El registro

En la pantalla **Registro** está todo lo apuntado: la hora, los hidratos, la
glucemia, la comida y las unidades. Arriba, el resumen del día.

**«Apuntar aparte»** sirve para la insulina lenta de cada día, o para dejar una
nota («he andado una hora»).

Para borrar una línea equivocada, la **✕** de su derecha.

### Copia de seguridad (hazla de vez en cuando)

Todo se guarda **solo en este teléfono**. No hay copia en internet: es lo que
hace que tus datos no salgan de aquí, pero también significa que **si borras
los datos del navegador o pierdes el teléfono, se pierde el registro**.

En **Registro → «Descargar copia»** se guarda un archivo. Mándatelo por correo
o guárdalo donde guardes tus cosas. Con **«Cargar una copia»** se recupera, y
sirve también para pasarlo a un teléfono nuevo.

---

## Preguntas que salen siempre

**¿Necesito internet?**
No. Una vez instalada funciona sin conexión. Lo único que necesita internet es
el dictado por voz; escribiendo funciona todo.

**¿Se enteran mis datos en algún sitio?**
No. No hay servidor, ni cuenta, ni registro. Todo se queda en el navegador de
tu teléfono. Solo saldría algo si activases la ayuda con IA en Ajustes, que
viene apagada y no hace falta.

**¿Puedo usarla en el ordenador y en el móvil?**
Sí, pero son independientes: cada uno guarda sus propios datos. Se pasan con
exportar e importar.

**¿Y si me equivoco al meter algo?**
Cambia los gramos, quita lo que sobre o vacía la lista y empieza otra vez.
Nada queda apuntado hasta que pulsas «apuntarlo».

**La aplicación dice un número y yo esperaba otro.**
Mira el desglose. Casi siempre es que los gramos de un plato no son los que
tú tenías en la cabeza: cámbialos en la lista. Si el desglose está bien y el
resultado te sigue chirriando, hazle caso a tu experiencia y coméntalo en la
próxima revisión.

---

## Y lo más importante

Esto es una calculadora, no un médico. Los tres números que la hacen funcionar
son los que te ha dado tu endocrino, y solo él los puede cambiar. Comprueba
siempre la cuenta antes de pincharte, y ante cualquier duda sigue tu pauta.
