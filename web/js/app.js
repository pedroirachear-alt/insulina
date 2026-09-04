/* ---------------------------------------------------------------------------
 * CONTROLADOR DE LA INTERFAZ
 * ---------------------------------------------------------------------------
 * Une las piezas: lee la pantalla, llama a los modulos y pinta el resultado.
 * Aqui NO hay ni una formula: el calculo vive entero en `bolus.js` y los
 * hidratos en `foods.js`. Esta separacion es la que permite testear lo que
 * importa sin abrir un navegador.
 * ------------------------------------------------------------------------- */

(function () {
  'use strict';

  var VERSION_APP = '1.1.0';

  var $ = function (id) { return document.getElementById(id); };
  var MOMENTOS = ['desayuno', 'comida', 'merienda', 'cena'];
  var NOMBRE_MOMENTO = {
    desayuno: 'Desayuno', comida: 'Comida', merienda: 'Merienda', cena: 'Cena'
  };

  /* Estado de la pantalla de calculo. */
  var items = [];              // alimentos de la comida actual
  var ultimoCalculo = null;    // resultado de Bolus.calcular
  var maximoConfirmado = false; // el usuario ha aceptado pasar de su tope

  /* ---------------------------------------------------------------- avisos -- */

  var relojMensaje = null;
  function mensaje(texto) {
    var m = $('mensaje-flotante');
    m.textContent = texto;
    m.hidden = false;
    if (relojMensaje) clearTimeout(relojMensaje);
    relojMensaje = setTimeout(function () { m.hidden = true; }, 3200);
  }

  function escapar(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function nota(clase, texto) {
    return '<div class="nota ' + clase + '">' + escapar(texto) + '</div>';
  }

  function numeroDe(elemento) {
    return Bolus.num(elemento.value);
  }

  /* ------------------------------------------------------------ navegacion -- */

  var TITULOS = {
    calcular: 'Calcular la dosis',
    registro: 'Registro',
    alimentos: 'Alimentos',
    ajustes: 'Ajustes'
  };

  function irA(vista) {
    ['calcular', 'registro', 'alimentos', 'ajustes'].forEach(function (v) {
      $('vista-' + v).hidden = (v !== vista);
    });
    var botones = document.querySelectorAll('.barra button[data-vista]');
    for (var i = 0; i < botones.length; i++) {
      if (botones[i].getAttribute('data-vista') === vista) {
        botones[i].setAttribute('aria-current', 'page');
      } else {
        botones[i].removeAttribute('aria-current');
      }
    }
    $('titulo-vista').textContent = TITULOS[vista] || '';
    window.scrollTo(0, 0);
    if (vista === 'registro') pintarRegistro();
    if (vista === 'alimentos') { pintarPendientes(); pintarPropios(); pintarComidas(); }
    if (vista === 'calcular') { comprobarConfiguracion(); pintarIOB(); }
  }

  /* ------------------------------------------------------ lista de alimentos */

  /**
   * Recalcula los hidratos de un item.
   *
   * Un item `directo` es el que el usuario ha puesto a mano porque la
   * aplicacion no conocia el alimento: ahi `hc_g` ES el dato, no se deduce de
   * gramos por `hc100`. Es el camino que permite no quedarse nunca bloqueado
   * por un alimento que falte.
   */
  function recalcularItem(it) {
    if (it.directo) { it.gramos = null; it.cantidad = null; return; }
    it.hc_g = Math.round((Number(it.hc100) || 0) * it.gramos / 1000) / 10;
    it.cantidad = it.gramos;
  }

  function totalHC() {
    var t = 0;
    for (var i = 0; i < items.length; i++) t += items[i].hc_g;
    return Math.round(t * 10) / 10;
  }

  function pintarItems() {
    var ul = $('lista-items');
    $('tarjeta-items').classList.toggle('oculto', items.length === 0);
    ul.innerHTML = '';

    items.forEach(function (it, indice) {
      var li = document.createElement('li');
      var marca = '';
      if (it.confianza === 'media') marca = '<span class="marca-confianza c-media">revisar</span>';
      if (it.confianza === 'baja') marca = '<span class="marca-confianza c-baja">dudoso</span>';

      if (it.directo) {
        // Los hidratos son el dato: el cuadro editable son gramos de HC.
        li.innerHTML =
          '<div class="cuerpo">' +
            '<div class="nombre">' + escapar(it.nombre) +
              '<span class="marca-confianza c-media">a mano</span></div>' +
            '<div class="detalle">' + escapar(it.detalle || '') + '</div>' +
          '</div>' +
          '<input class="gramos" type="number" inputmode="numeric" min="0" max="400" step="1" ' +
            'value="' + it.hc_g + '" aria-label="Gramos de hidratos de ' + escapar(it.nombre) + '">' +
          '<span class="hc">g HC</span>' +
          '<button class="quitar" type="button" aria-label="Quitar ' + escapar(it.nombre) + '">&times;</button>';
      } else {
        li.innerHTML =
          '<div class="cuerpo">' +
            '<div class="nombre">' + escapar(it.nombre) + marca + '</div>' +
            '<div class="detalle">' + escapar(it.detalle || '') +
              ' · ' + escapar(it.hc100) + ' g HC por 100 g</div>' +
          '</div>' +
          '<input class="gramos" type="number" inputmode="numeric" min="0" max="5000" step="1" ' +
            'value="' + it.gramos + '" aria-label="Gramos de ' + escapar(it.nombre) + '">' +
          '<span class="hc"><span class="valor-hc">' + it.hc_g + '</span> g</span>' +
          '<button class="quitar" type="button" aria-label="Quitar ' + escapar(it.nombre) + '">&times;</button>';
      }

      li.querySelector('.gramos').addEventListener('input', function (ev) {
        var v = Bolus.num(ev.target.value);
        if (v === null || v < 0) v = 0;
        if (it.directo) {
          it.hc_g = Math.round(v * 10) / 10;
        } else {
          it.gramos = v;
          recalcularItem(it);
          li.querySelector('.valor-hc').textContent = it.hc_g;
        }
        $('hc-total').textContent = totalHC();
        limpiarResultado();
      });

      li.querySelector('.quitar').addEventListener('click', function () {
        items.splice(indice, 1);
        pintarItems();
        limpiarResultado();
      });

      ul.appendChild(li);
    });

    $('hc-total').textContent = totalHC();
  }

  function limpiarResultado() {
    ultimoCalculo = null;
    maximoConfirmado = false;
    $('zona-resultado').innerHTML = '';
  }

  /* ----------------------------------------------------------- leer comida -- */

  function leerComida() {
    var texto = $('texto-comida').value.trim();
    if (!texto) { mensaje('Escribe o dicta primero que vas a comer.'); return; }

    var r = Parser.interpretar(texto);
    items = r.items.slice();
    pintarItems();
    limpiarResultado();

    var html = '';
    (r.avisos || []).forEach(function (a) {
      var clase = (r.confianza === 'baja') ? 'n-aviso' : 'n-info';
      html += nota(clase, a);
    });

    /* Lo que no se ha entendido se APUNTA. No se pierde: queda en la lista de
     * pendientes con las veces que ha aparecido, para añadirlo a la base mas
     * adelante. Y se ofrece ponerlo a mano ahora mismo, para que un alimento
     * que falte no deje al usuario bloqueado. */
    var sinResolver = (r.no_reconocido || []).concat(r.sin_alimento || []);
    for (var n = 0; n < sinResolver.length; n++) {
      Store.anotarPendiente(sinResolver[n], null, texto);
    }
    if (sinResolver.length) {
      pintarPendientes();
      html += '<button type="button" class="b-pequeno" id="b-mano-rapido">' +
              'Poner a mano los hidratos de "' + escapar(sinResolver[0]) + '"</button>';
    }

    if (!r.items.length && LLM.disponible()) {
      html += '<button type="button" class="b-pequeno" id="b-leer-ia">Probar a leerlo con la IA</button>';
    }
    $('avisos-lectura').innerHTML = html;

    var bMano = $('b-mano-rapido');
    if (bMano) {
      bMano.addEventListener('click', function () {
        $('detalle-a-mano').open = true;
        $('mano-nombre').value = sinResolver[0];
        $('mano-hc').value = '';
        $('mano-hc').focus();
        $('detalle-a-mano').scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }

    var bIA = $('b-leer-ia');
    if (bIA) bIA.addEventListener('click', function () { leerConIA(texto); });

    if (r.items.length) {
      mensaje(r.items.length + (r.items.length === 1 ? ' alimento' : ' alimentos') +
              ' · ' + r.hc_total + ' g de hidratos');
    }
  }

  function leerConIA(texto) {
    var b = $('b-leer-ia');
    if (b) { b.disabled = true; b.textContent = 'Preguntando...'; }
    LLM.interpretarFrase(texto).then(function (lectura) {
      var res = LLM.resolverContraBase(lectura);
      if (!res.items.length) {
        $('avisos-lectura').innerHTML = nota('n-aviso',
          'La IA tampoco lo ha sabido resolver contra la base de alimentos. Añade el alimento a mano.');
        return;
      }
      items = res.items.slice();
      pintarItems();
      var html = nota('n-aviso', 'Leido con ayuda de IA. Comprueba la lista con cuidado.');
      if (res.desconocidos.length) {
        html += nota('n-peligro', 'Estos no estan en tu base y NO se han contado: ' +
                     res.desconocidos.join(', ') + '. Añadelos en la pantalla de Alimentos.');
      }
      $('avisos-lectura').innerHTML = html;
    }).catch(function (e) {
      $('avisos-lectura').innerHTML = nota('n-peligro', 'No se ha podido usar la IA: ' + e.message);
    });
  }

  /* ------------------------------------------------------------------- voz -- */

  function configurarVoz() {
    var b = $('b-microfono');
    if (!Voz.disponible()) {
      b.classList.add('oculto');
      $('pista-voz').textContent =
        'Este navegador no tiene dictado propio. Toca el cuadro de texto y usa el microfono del teclado del telefono.';
      return;
    }
    b.addEventListener('click', function () {
      if (Voz.escuchando()) { Voz.parar(); return; }
      var base = $('texto-comida').value.trim();
      b.classList.add('escuchando');
      b.setAttribute('aria-label', 'Parar de escuchar');
      Voz.escuchar({
        onParcial: function (t) { $('texto-comida').value = (base ? base + ' ' : '') + t; },
        onFinal: function (t) { $('texto-comida').value = (base ? base + ' ' : '') + t; },
        onError: function (m) { mensaje(m); },
        onFin: function (t) {
          b.classList.remove('escuchando');
          b.setAttribute('aria-label', 'Dictar la comida con el microfono');
          if (t) leerComida();
        }
      });
    });
  }

  /* -------------------------------------------------------------- calcular -- */

  function calcular() {
    var a = Store.ajustes();
    var entrada = {
      hc_g: totalHC(),
      glucosa: numeroDe($('glucosa')),
      momento: $('momento').value,
      iob_u: Store.iobActual()
    };
    if (!items.length && entrada.glucosa === null) {
      mensaje('Necesito la comida o la glucemia para calcular algo.');
      return;
    }
    // Sin comida pero con glucemia: es una correccion suelta, es valido.
    if (!items.length) entrada.hc_g = 0;

    var r = Bolus.calcular(entrada, a);
    ultimoCalculo = r;
    pintarResultado(r, a);
    $('zona-resultado').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function pintarResultado(r, a) {
    var html = '';

    if (r.bloqueo && !(maximoConfirmado && r.bloqueo.codigo === 'SUPERA_MAXIMO')) {
      html += '<div class="bloqueo">' +
                '<div class="titulo">No se da una dosis</div>' +
                '<p>' + escapar(r.bloqueo.mensaje) + '</p>' +
              '</div>';
      if (r.bloqueo.confirmable) {
        html += '<button type="button" class="b-peligro" id="b-confirmar-max" ' +
                'style="width:100%; margin-top:.75rem">He comprobado los datos: ver la dosis de ' +
                r.total + ' U</button>';
      }
      if (r.bloqueo.codigo === 'FALTA_RATIO' || r.bloqueo.codigo === 'FALTA_FSI' ||
          r.bloqueo.codigo === 'FALTA_OBJETIVO' || r.bloqueo.codigo === 'RATIO_IMPLAUSIBLE' ||
          r.bloqueo.codigo === 'FSI_IMPLAUSIBLE' || r.bloqueo.codigo === 'OBJETIVO_IMPLAUSIBLE') {
        html += '<button type="button" class="b-principal" data-ir-a="ajustes" ' +
                'style="margin-top:.75rem">Ir a Ajustes</button>';
      }
      $('zona-resultado').innerHTML = html;
      engancharResultado(r, a);
      return;
    }

    /* --- la dosis ---------------------------------------------------- */
    html += '<div class="dosis">' +
              '<div class="rotulo">Insulina rapida a pincharse</div>' +
              '<div class="cifra">' + r.total + '</div>' +
              '<div class="unidades">' + (r.total === 1 ? 'unidad' : 'unidades') + '</div>' +
              (a.insulina_rapida ? '<div class="insulina">' + escapar(a.insulina_rapida) + '</div>' : '') +
            '</div>';

    if (maximoConfirmado && r.bloqueo) {
      html += nota('n-peligro', 'Has confirmado una dosis por encima de tu maximo de ' +
                   a.max_u + ' U. Vuelve a comprobar los hidratos y la glucemia.');
    }

    /* --- avisos ------------------------------------------------------ */
    (r.avisos || []).forEach(function (av) {
      html += nota(av.nivel === 'aviso' ? 'n-aviso' : 'n-info', av.mensaje);
    });

    /* --- desglose ---------------------------------------------------- */
    html += '<details open><summary>Como sale ese numero</summary><table class="desglose">';
    (r.desglose || []).forEach(function (d) {
      html += '<tr><td>' + escapar(d.concepto) +
              '<div class="formula">' + escapar(d.formula) + '</div></td>' +
              '<td>' + d.valor + ' U</td></tr>';
    });
    html += '</table>';
    html += '<p class="pista" style="margin-top:.5rem">Ratio ' + r.ratio + ' g/U' +
            (r.fsi !== null ? ' · FSI ' + r.fsi + ' mg/dL/U' : '') +
            ' · objetivo ' + r.objetivo + ' mg/dL · ' + NOMBRE_MOMENTO[r.momento] + '</p>';
    html += '</details>';

    /* --- apuntar ----------------------------------------------------- */
    html += '<button type="button" class="b-principal" id="b-apuntar-dosis" ' +
            'style="margin-top:1rem">Ya me lo he pinchado: apuntarlo</button>';

    $('zona-resultado').innerHTML = html;
    engancharResultado(r, a);
  }

  function engancharResultado(r, a) {
    var bMax = $('b-confirmar-max');
    if (bMax) {
      bMax.addEventListener('click', function () {
        maximoConfirmado = true;
        pintarResultado(r, a);
      });
    }
    var bApuntar = $('b-apuntar-dosis');
    if (bApuntar) {
      bApuntar.addEventListener('click', function () { apuntarDosis(r); });
    }
    var irAjustes = $('zona-resultado').querySelector('[data-ir-a]');
    if (irAjustes) {
      irAjustes.addEventListener('click', function () { irA('ajustes'); });
    }
  }

  function apuntarDosis(r) {
    Store.anotar({
      tipo: 'rapida',
      unidades: r.total,
      hc_g: r.hc_g,
      glucosa: r.glucosa,
      momento: r.momento,
      items: items.map(function (it) {
        return { nombre: it.nombre, gramos: it.gramos, hc_g: it.hc_g };
      }),
      calculo: {
        bolo_comida: Bolus.dec(r.bolo_comida, 2),
        bolo_correccion: Bolus.dec(r.bolo_correccion, 2),
        ratio: r.ratio, fsi: r.fsi, objetivo: r.objetivo,
        iob_u: r.iob_u, iob_restada: r.iob_restada
      }
    });
    mensaje('Apuntado: ' + r.total + ' U');
    items = [];
    $('texto-comida').value = '';
    $('glucosa').value = '';
    $('avisos-lectura').innerHTML = '';
    pintarItems();
    limpiarResultado();
    pintarIOB();
  }

  /* ------------------------------------------------------- insulina activa -- */

  function pintarIOB() {
    var iob = Store.iobActual();
    var caja = $('aviso-iob');
    if (!(iob > 0.1)) { caja.classList.add('oculto'); return; }
    var a = Store.ajustes();
    caja.classList.remove('oculto');
    caja.textContent = 'Quedan unas ' + iob + ' U de insulina rapida actuando de un pinchazo reciente. ' +
      (a.restar_iob ? 'Se restaran de la dosis.' : 'La aplicacion NO las resta: tenlo en cuenta.');
  }

  /* -------------------------------------------------------------- registro -- */

  function fechaCorta(ts) {
    var d = new Date(ts);
    return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  function horaCorta(ts) {
    var d = new Date(ts);
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  function pintarRegistro() {
    var reg = Store.registro();
    var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    var hc = 0, u = 0, n = 0;
    reg.forEach(function (e) {
      if (e.ts < hoy.getTime()) return;
      if (e.hc_g) hc += e.hc_g;
      if (e.tipo === 'rapida' && e.unidades) { u += e.unidades; n++; }
    });
    $('res-hc').textContent = Math.round(hc);
    $('res-u').textContent = Math.round(u * 10) / 10;
    $('res-n').textContent = n;

    var caja = $('lista-registro');
    if (!reg.length) {
      caja.innerHTML = '<p class="vacio">Todavia no hay nada apuntado.</p>';
      return;
    }

    var html = '', diaActual = '';
    for (var i = reg.length - 1; i >= 0; i--) {
      var e = reg[i];
      var dia = fechaCorta(e.ts);
      if (dia !== diaActual) { html += '<div class="dia">' + escapar(dia) + '</div>'; diaActual = dia; }

      var detalle = [];
      if (e.hc_g) detalle.push(Math.round(e.hc_g) + ' g HC');
      if (e.glucosa) detalle.push(e.glucosa + ' mg/dL');
      if (e.momento) detalle.push(NOMBRE_MOMENTO[e.momento] || e.momento);
      var comida = (e.items || []).map(function (it) { return it.nombre; }).join(', ');

      var etiqueta = e.tipo === 'lenta' ? 'lenta' : (e.tipo === 'nota' ? 'nota' : 'rapida');

      html += '<div class="anotacion">' +
                '<span class="hora">' + horaCorta(e.ts) + '</span>' +
                '<span class="cuerpo">' +
                  '<strong>' + etiqueta + '</strong>' +
                  (detalle.length ? ' · ' + escapar(detalle.join(' · ')) : '') +
                  (comida ? '<div class="comida">' + escapar(comida) + '</div>' : '') +
                  (e.nota ? '<div class="comida">' + escapar(e.nota) + '</div>' : '') +
                '</span>' +
                '<span class="u">' + (e.unidades ? e.unidades + ' U' : '') + '</span>' +
                '<button class="quitar" type="button" data-borrar="' + escapar(e.id) +
                  '" aria-label="Borrar esta anotacion">&times;</button>' +
              '</div>';
    }
    caja.innerHTML = html;

    var botones = caja.querySelectorAll('[data-borrar]');
    for (var j = 0; j < botones.length; j++) {
      botones[j].addEventListener('click', function (ev) {
        var id = ev.currentTarget.getAttribute('data-borrar');
        if (!window.confirm('Borrar esta anotacion del registro?')) return;
        Store.borrarAnotacion(id);
        pintarRegistro();
        pintarIOB();
      });
    }
  }

  function apuntarAparte() {
    var u = numeroDe($('apunte-u'));
    var tipo = $('apunte-tipo').value;
    var texto = $('apunte-nota').value.trim();
    if (tipo !== 'nota' && (u === null || u <= 0)) {
      mensaje('Pon cuantas unidades.');
      return;
    }
    if (tipo === 'nota' && !texto) { mensaje('Escribe la nota.'); return; }
    Store.anotar({ tipo: tipo, unidades: tipo === 'nota' ? null : u, nota: texto });
    $('apunte-u').value = ''; $('apunte-nota').value = '';
    mensaje('Apuntado.');
    pintarRegistro();
    pintarIOB();
  }

  /* ------------------------------------------------------------- alimentos -- */

  function pintarBusqueda() {
    var q = $('buscar-alimento').value.trim();
    var ul = $('resultados-alimentos');
    if (!q) { ul.innerHTML = ''; return; }
    var res = Alimentos.buscar(q, 12);
    if (!res.length) {
      ul.innerHTML = '<li><p class="vacio">Nada parecido. Añadelo abajo con tu propio valor.</p></li>';
      $('nuevo-nombre').value = q;
      return;
    }
    var html = '';
    res.forEach(function (r) {
      var al = r.alimento;
      var p = Alimentos.porcionPorDefecto(al);
      var hc = Math.round(Alimentos.hcDeGramos(al, p.gramos) * 10) / 10;
      html += '<li><button type="button" data-id="' + escapar(al.id) + '">' +
                '<span class="nombre">' + escapar(al.nombre) +
                  (al.id.indexOf('propio-') === 0 ? ' <span class="propio">mio</span>' : '') +
                '</span>' +
                '<span class="valor">' + al.hc100 + ' g/100 g · ' + p.gramos + ' g = ' + hc + ' g HC</span>' +
              '</button></li>';
    });
    ul.innerHTML = html;

    var botones = ul.querySelectorAll('[data-id]');
    for (var i = 0; i < botones.length; i++) {
      botones[i].addEventListener('click', function (ev) {
        anadirPorId(ev.currentTarget.getAttribute('data-id'));
      });
    }
  }

  function anadirPorId(id) {
    var al = Alimentos.porId(id);
    if (!al) return;
    var p = Alimentos.porcionPorDefecto(al);
    var it = {
      id: al.id, nombre: al.nombre, grupo: al.grupo, hc100: al.hc100,
      gramos: p.gramos, cantidad: p.gramos, unidad: p.unidad,
      detalle: '1 ' + p.unidad + ' (a mano)', hc_g: 0, confianza: 'alta',
      puntuacion: 1, texto: al.nombre
    };
    recalcularItem(it);
    items.push(it);
    pintarItems();
    limpiarResultado();
    mensaje(al.nombre + ' añadido · ' + it.hc_g + ' g HC');
    irA('calcular');
  }

  function guardarAlimento() {
    var nombre = $('nuevo-nombre').value.trim();
    var hc100 = numeroDe($('nuevo-hc100'));
    var racion = numeroDe($('nuevo-racion'));
    var existente = Alimentos.buscarExacto(nombre);
    var id = (existente && existente.id.indexOf('propio-') === 0)
      ? existente.id
      : Store.idParaNombre(nombre);

    var nuevo = {
      id: id, nombre: nombre, grupo: 'propios', hc100: hc100,
      unidad_g: racion, alias: [], porciones: { racion: racion, unidad: racion }
    };
    // Las reglas estan en Store, para que la pantalla y la importacion de
    // copias no puedan divergir.
    var r = Store.guardarAlimentoPropio(nuevo);
    if (!r.ok) { mensaje(r.motivo); return; }
    $('nuevo-nombre').value = ''; $('nuevo-hc100').value = ''; $('nuevo-racion').value = '';
    $('sugerencia-ia').classList.add('oculto');
    /* Si estaba en la lista de pendientes, ya no lo esta: acaba de entrar en
     * la base. Es lo que cierra el circulo. */
    var pend = Store.pendientes();
    for (var i = 0; i < pend.length; i++) {
      if (Alimentos.normalizar(pend[i].texto) === Alimentos.normalizar(nombre)) {
        Store.borrarPendiente(pend[i].id);
      }
    }

    mensaje('Guardado. Ya se puede usar por su nombre.');
    pintarPendientes();
    pintarPropios();
    pintarBusqueda();
  }

  function pintarPropios() {
    var lista = Store.alimentosPropios();
    var ul = $('lista-propios');
    if (!lista.length) {
      ul.innerHTML = '<li><p class="vacio">Todavia no has añadido ninguno.</p></li>';
      return;
    }
    var html = '';
    lista.forEach(function (al) {
      html += '<li><div class="cuerpo">' +
                '<div class="nombre">' + escapar(al.nombre) + '</div>' +
                '<div class="detalle">' + al.hc100 + ' g HC por 100 g · racion de ' +
                  (al.unidad_g || 100) + ' g</div>' +
              '</div>' +
              '<button class="quitar" type="button" data-borrar-al="' + escapar(al.id) +
                '" aria-label="Borrar ' + escapar(al.nombre) + '">&times;</button></li>';
    });
    ul.innerHTML = html;
    var botones = ul.querySelectorAll('[data-borrar-al]');
    for (var i = 0; i < botones.length; i++) {
      botones[i].addEventListener('click', function (ev) {
        Store.borrarAlimentoPropio(ev.currentTarget.getAttribute('data-borrar-al'));
        pintarPropios(); pintarBusqueda();
        mensaje('Borrado.');
      });
    }
  }

  function sugerirConIA() {
    var nombre = $('nuevo-nombre').value.trim();
    if (!nombre) { mensaje('Escribe primero el nombre del alimento.'); return; }
    var caja = $('sugerencia-ia');
    caja.classList.remove('oculto');
    caja.className = 'nota n-info';
    caja.textContent = 'Preguntando a la IA...';
    LLM.sugerirAlimento(nombre).then(function (s) {
      if (!s) {
        caja.className = 'nota n-aviso';
        caja.textContent = 'La IA no ha sabido dar un valor fiable. Ponlo tu a mano.';
        return;
      }
      $('nuevo-hc100').value = s.hc100;
      $('nuevo-racion').value = s.racion_g;
      caja.className = 'nota n-aviso';
      caja.innerHTML = '<strong>Estimacion de la IA, sin verificar.</strong>' +
        '<p class="pista">' + escapar(s.hc100) + ' g de HC por 100 g · racion de ' +
        escapar(s.racion_g) + ' g. ' + escapar(s.nota) + '</p>' +
        '<p class="pista">Comprueba que tenga sentido antes de guardarlo. Si no estas seguro, ' +
        'mira la etiqueta del producto o preguntale a tu educadora.</p>';
    }).catch(function (e) {
      caja.className = 'nota n-peligro';
      caja.textContent = 'No se ha podido preguntar: ' + e.message;
    });
  }

  /* ------------------------------------------------- hidratos a mano ------ */

  /**
   * Añade a la comida unos hidratos puestos a mano.
   *
   * Es la valvula de escape del sistema: si falta un alimento, el usuario pone
   * el numero que calcularia de cabeza --que es lo que ha hecho toda la vida--
   * y sigue adelante. Ademas queda apuntado como pendiente CON ese valor, que
   * es la mejor pista sobre cuanto lleva de verdad ese plato.
   */
  function anadirAMano() {
    var nombre = $('mano-nombre').value.trim();
    var hc = numeroDe($('mano-hc'));
    if (!nombre) { mensaje('Pon que es, para que quede apuntado.'); return; }
    if (hc === null || hc < 0 || hc > 400) {
      mensaje('Pon los gramos de hidratos, entre 0 y 400.');
      return;
    }

    items.push({
      id: null, nombre: nombre, grupo: 'a mano', hc100: null,
      directo: true, gramos: null, cantidad: null, unidad: null,
      detalle: 'hidratos puestos a mano', hc_g: Math.round(hc * 10) / 10,
      confianza: 'alta', puntuacion: 1, texto: nombre
    });
    Store.anotarPendiente(nombre, hc, $('texto-comida').value.trim() || null);

    $('mano-nombre').value = '';
    $('mano-hc').value = '';
    pintarItems();
    limpiarResultado();
    pintarPendientes();
    mensaje(nombre + ': ' + hc + ' g HC. Apuntado para añadirlo a la base.');
  }

  /* --------------------------------------------- pendientes de la base --- */

  function pintarPendientes() {
    var lista = Store.pendientes();
    $('tarjeta-pendientes').classList.toggle('oculto', !lista.length);
    if (!lista.length) { $('lista-pendientes').innerHTML = ''; return; }

    var html = '';
    lista.forEach(function (pe) {
      // Ojo: `detalle` se inserta como HTML (lleva un <br>), asi que cada
      // trozo que venga del usuario se escapa aqui, uno a uno.
      var detalle = pe.veces + (pe.veces === 1 ? ' vez' : ' veces');
      if (pe.hc_estimado !== null && pe.hc_estimado !== undefined) {
        detalle += ' · se pusieron ' + pe.hc_estimado + ' g HC';
      }
      if (pe.contexto && pe.contexto !== pe.texto) {
        detalle += '<br>de: "' + escapar(pe.contexto) + '"';
      }
      html += '<li><div class="cuerpo">' +
                '<div class="nombre">' + escapar(pe.texto) + '</div>' +
                '<div class="detalle">' + detalle + '</div>' +
              '</div>' +
              '<button class="b-pequeno" type="button" data-resolver="' + escapar(pe.id) +
                '">Añadirlo</button>' +
              '<button class="quitar" type="button" data-borrar-pe="' + escapar(pe.id) +
                '" aria-label="Quitar de la lista">&times;</button></li>';
    });
    $('lista-pendientes').innerHTML = html;

    var resolver = $('lista-pendientes').querySelectorAll('[data-resolver]');
    for (var i = 0; i < resolver.length; i++) {
      resolver[i].addEventListener('click', function (ev) {
        var id = ev.currentTarget.getAttribute('data-resolver');
        var lista2 = Store.pendientes(), pe = null;
        for (var j = 0; j < lista2.length; j++) if (lista2[j].id === id) pe = lista2[j];
        if (!pe) return;
        // Se rellena el formulario de abajo. El valor por 100 g hay que
        // ponerlo a mano: es justamente el dato que la aplicacion no tiene.
        $('nuevo-nombre').value = pe.texto;
        $('nuevo-hc100').value = '';
        $('nuevo-racion').value = '';
        $('nuevo-nombre').scrollIntoView({ behavior: 'smooth', block: 'center' });
        $('nuevo-hc100').focus();
        mensaje(pe.hc_estimado !== null && pe.hc_estimado !== undefined
          ? 'Se pusieron ' + pe.hc_estimado + ' g HC por racion. Para el valor por 100 g, mira la etiqueta.'
          : 'Mira la etiqueta del producto para los hidratos por 100 g.');
      });
    }

    var borrar = $('lista-pendientes').querySelectorAll('[data-borrar-pe]');
    for (var k = 0; k < borrar.length; k++) {
      borrar[k].addEventListener('click', function (ev) {
        Store.borrarPendiente(ev.currentTarget.getAttribute('data-borrar-pe'));
        pintarPendientes();
      });
    }
  }

  /**
   * Manda la lista de pendientes. Tres caminos, del mejor al que siempre
   * funciona: el compartir del propio movil, el portapapeles, y dejar el texto
   * a la vista para copiarlo a mano.
   */
  function compartirPendientes() {
    var texto = Store.pendientesEnTexto();
    var caja = $('texto-pendientes');

    function aLaVista(aviso) {
      caja.value = texto;
      caja.classList.remove('oculto');
      caja.select();
      mensaje(aviso);
    }

    if (navigator.share) {
      navigator.share({ title: 'Alimentos pendientes', text: texto })
        .catch(function () { aLaVista('Copia el texto y mandalo.'); });
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(function () {
        mensaje('Lista copiada. Pegala en un mensaje.');
      }).catch(function () { aLaVista('Copia el texto y mandalo.'); });
      return;
    }
    aLaVista('Copia el texto y mandalo.');
  }

  /* ------------------------------------------------------ comidas guardadas */

  function guardarComidaActual() {
    if (!items.length) { mensaje('No hay nada en la lista.'); return; }
    var nombre = window.prompt('Nombre para esta comida:', 'Desayuno de siempre');
    if (!nombre) return;
    Store.guardarComida({
      nombre: nombre.trim().slice(0, 40),
      hc_g: totalHC(),
      items: items.map(function (it) {
        return { id: it.id, nombre: it.nombre, hc100: it.hc100, gramos: it.gramos, detalle: it.detalle };
      })
    });
    mensaje('Comida guardada.');
    pintarChipsComidas();
    pintarComidas();
  }

  function cargarComida(id) {
    var lista = Store.comidas(), c = null;
    for (var i = 0; i < lista.length; i++) if (lista[i].id === id) c = lista[i];
    if (!c) return;
    items = c.items.map(function (g) {
      var it = {
        id: g.id, nombre: g.nombre, hc100: g.hc100, gramos: g.gramos,
        cantidad: g.gramos, unidad: null, detalle: g.detalle || 'comida guardada',
        hc_g: 0, confianza: 'alta', puntuacion: 1, texto: g.nombre
      };
      recalcularItem(it);
      return it;
    });
    pintarItems();
    limpiarResultado();
    $('avisos-lectura').innerHTML = '';
    mensaje(c.nombre + ' · ' + totalHC() + ' g HC');
  }

  function pintarChipsComidas() {
    var lista = Store.comidas();
    $('mis-comidas-rapido').classList.toggle('oculto', !lista.length);
    var caja = $('chips-comidas');
    caja.innerHTML = '';
    lista.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = c.nombre + ' · ' + Math.round(c.hc_g) + ' g';
      b.addEventListener('click', function () { cargarComida(c.id); });
      caja.appendChild(b);
    });
  }

  function pintarComidas() {
    var lista = Store.comidas();
    var ul = $('lista-comidas');
    if (!lista.length) {
      ul.innerHTML = '<li><p class="vacio">Ninguna todavia. Guarda una desde la pantalla de calcular.</p></li>';
      return;
    }
    var html = '';
    lista.forEach(function (c) {
      html += '<li><div class="cuerpo">' +
                '<div class="nombre">' + escapar(c.nombre) + '</div>' +
                '<div class="detalle">' + Math.round(c.hc_g) + ' g HC · ' +
                  escapar(c.items.map(function (i) { return i.nombre; }).join(', ')) + '</div>' +
              '</div>' +
              '<button class="quitar" type="button" data-borrar-co="' + escapar(c.id) +
                '" aria-label="Borrar ' + escapar(c.nombre) + '">&times;</button></li>';
    });
    ul.innerHTML = html;
    var botones = ul.querySelectorAll('[data-borrar-co]');
    for (var i = 0; i < botones.length; i++) {
      botones[i].addEventListener('click', function (ev) {
        Store.borrarComida(ev.currentTarget.getAttribute('data-borrar-co'));
        pintarComidas(); pintarChipsComidas();
      });
    }
  }

  /* --------------------------------------------------------------- ajustes -- */

  function pintarMomentos() {
    var caja = $('rejilla-momentos');
    var a = Store.ajustes();
    var html = '';
    MOMENTOS.forEach(function (m) {
      html += '<div><label for="a-ratio-' + m + '">Ratio en ' + NOMBRE_MOMENTO[m].toLowerCase() + '</label>' +
              '<input type="number" id="a-ratio-' + m + '" inputmode="decimal" min="1" max="60" step="0.5" ' +
              'value="' + (a.ratios[m] === null ? '' : a.ratios[m]) + '"></div>' +
              '<div><label for="a-fsi-' + m + '">FSI en ' + NOMBRE_MOMENTO[m].toLowerCase() + '</label>' +
              '<input type="number" id="a-fsi-' + m + '" inputmode="decimal" min="5" max="200" step="1" ' +
              'value="' + (a.fsis[m] === null ? '' : a.fsis[m]) + '"></div>';
    });
    caja.innerHTML = html;
  }

  function cargarAjustes() {
    var a = Store.ajustes();
    $('a-objetivo').value = a.objetivo === null ? '' : a.objetivo;
    $('a-ratio').value = a.ratio === null ? '' : a.ratio;
    $('a-fsi').value = a.fsi === null ? '' : a.fsi;
    $('a-por-momento').checked = !!a.por_momento;
    $('zona-por-momento').classList.toggle('oculto', !a.por_momento);
    $('a-paso').value = String(a.paso);
    $('a-redondeo').value = a.redondeo;
    $('a-max').value = a.max_u === null ? '' : a.max_u;
    $('a-hipo').value = a.umbral_hipo === null ? '' : a.umbral_hipo;
    $('a-alto').value = a.umbral_alto === null ? '' : a.umbral_alto;
    $('a-duracion').value = a.duracion_insulina_h;
    $('a-corr-negativa').checked = !!a.permitir_correccion_negativa;
    $('a-restar-iob').checked = !!a.restar_iob;
    $('a-rapida').value = a.insulina_rapida || '';
    $('a-lenta').value = a.insulina_lenta || '';
    $('a-dosis-lenta').value = a.dosis_lenta === null ? '' : a.dosis_lenta;
    $('a-hora-lenta').value = a.hora_lenta || '';
    pintarMomentos();

    var c = LLM.config();
    $('ia-activo').checked = !!c.activo;
    $('ia-proveedor').value = c.proveedor;
    $('ia-modelo').value = c.modelo || '';
    $('ia-clave').value = c.clave || '';
    $('ia-base').value = c.base_url || '';

    $('version-app').textContent = VERSION_APP;
    $('version-db').textContent = Alimentos.version;
    $('aviso-sin-almacenamiento').classList.toggle('oculto', Store.persistente());
  }

  function guardarAjustes() {
    var ratios = {}, fsis = {};
    MOMENTOS.forEach(function (m) {
      var r = $('a-ratio-' + m), f = $('a-fsi-' + m);
      ratios[m] = r ? Bolus.num(r.value) : null;
      fsis[m] = f ? Bolus.num(f.value) : null;
    });

    var nuevos = {
      objetivo: numeroDe($('a-objetivo')),
      ratio: numeroDe($('a-ratio')),
      fsi: numeroDe($('a-fsi')),
      por_momento: $('a-por-momento').checked,
      ratios: ratios, fsis: fsis,
      paso: Number($('a-paso').value),
      redondeo: $('a-redondeo').value,
      max_u: numeroDe($('a-max')),
      umbral_hipo: numeroDe($('a-hipo')),
      umbral_alto: numeroDe($('a-alto')),
      duracion_insulina_h: numeroDe($('a-duracion')),
      permitir_correccion_negativa: $('a-corr-negativa').checked,
      restar_iob: $('a-restar-iob').checked,
      insulina_rapida: $('a-rapida').value.trim(),
      insulina_lenta: $('a-lenta').value.trim(),
      dosis_lenta: numeroDe($('a-dosis-lenta')),
      hora_lenta: $('a-hora-lenta').value
    };

    /* Se avisa de lo que falta, pero se guarda igual: es mas util poder
     * rellenarlo en dos ratos que perder lo escrito. El bloqueo del calculo
     * lo hace el motor, que es donde importa. */
    var faltan = [];
    if (nuevos.objetivo === null) faltan.push('la glucemia objetivo');
    if (nuevos.ratio === null && !nuevos.por_momento) faltan.push('el ratio');
    if (nuevos.max_u === null) nuevos.max_u = 20;
    if (nuevos.umbral_hipo === null) nuevos.umbral_hipo = 70;
    if (nuevos.umbral_alto === null) nuevos.umbral_alto = 250;
    if (!nuevos.duracion_insulina_h) nuevos.duracion_insulina_h = 4;

    Store.guardarAjustes(nuevos);
    cargarAjustes();
    comprobarConfiguracion();
    limpiarResultado();
    mensaje(faltan.length ? 'Guardado, pero falta ' + faltan.join(' y ') + '.' : 'Ajustes guardados.');
  }

  function comprobarConfiguracion() {
    $('falta-configurar').classList.toggle('oculto', Store.estaConfigurado());
    var momento = Bolus.momentoAhora();
    if (!$('momento').dataset.tocado) $('momento').value = momento;
    $('b-sugerir-ia').classList.toggle('oculto', !LLM.disponible());
  }

  /* --------------------------------------------------------- exportar datos */

  function exportar() {
    var texto = Store.exportar();
    var blob = new Blob([texto], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var d = new Date();
    a.href = url;
    a.download = 'insulina-' + d.getFullYear() +
      ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    mensaje('Copia descargada.');
  }

  function importar(archivo) {
    var lector = new FileReader();
    lector.onload = function () {
      var modo = window.confirm(
        'Aceptar = FUSIONAR con lo que ya tienes.\nCancelar = REEMPLAZAR todo por el archivo.'
      ) ? 'fusionar' : 'reemplazar';
      var r = Store.importar(String(lector.result), modo);
      mensaje(r.ok ? (r.mensaje + ' ' + (r.importadas || 0) + ' anotaciones.') : r.mensaje);
      if (r.ok) {
        cargarAjustes(); pintarRegistro(); pintarPropios();
        pintarChipsComidas(); pintarPendientes();
      }
    };
    lector.onerror = function () { mensaje('No se ha podido leer el archivo.'); };
    lector.readAsText(archivo);
  }

  /* ------------------------------------------------------------- arranque -- */

  function conectar() {
    var botones = document.querySelectorAll('.barra button[data-vista]');
    for (var i = 0; i < botones.length; i++) {
      botones[i].addEventListener('click', function (ev) {
        irA(ev.currentTarget.getAttribute('data-vista'));
      });
    }
    var irAjustes = document.querySelectorAll('#falta-configurar [data-ir-a]');
    for (var j = 0; j < irAjustes.length; j++) {
      irAjustes[j].addEventListener('click', function () { irA('ajustes'); });
    }

    $('b-leer').addEventListener('click', leerComida);
    $('b-calcular').addEventListener('click', calcular);
    $('b-vaciar').addEventListener('click', function () {
      items = []; $('texto-comida').value = ''; $('avisos-lectura').innerHTML = '';
      pintarItems(); limpiarResultado();
    });
    $('b-anadir-alimento').addEventListener('click', function () { irA('alimentos'); });
    $('b-guardar-comida').addEventListener('click', guardarComidaActual);
    $('glucosa').addEventListener('input', limpiarResultado);
    $('momento').addEventListener('change', function (ev) {
      ev.target.dataset.tocado = '1';
      limpiarResultado();
    });

    $('b-apuntar').addEventListener('click', apuntarAparte);
    $('b-exportar').addEventListener('click', exportar);
    $('b-exportar-2').addEventListener('click', exportar);
    $('b-importar').addEventListener('click', function () { $('archivo-importar').click(); });
    $('archivo-importar').addEventListener('change', function (ev) {
      if (ev.target.files && ev.target.files[0]) importar(ev.target.files[0]);
      ev.target.value = '';
    });

    $('b-a-mano').addEventListener('click', anadirAMano);
    $('mano-hc').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') anadirAMano();
    });
    $('b-compartir-pendientes').addEventListener('click', compartirPendientes);
    $('b-vaciar-pendientes').addEventListener('click', function () {
      if (!window.confirm('Se borra la lista de alimentos pendientes. Hazlo solo si ya se han añadido a la base. Seguro?')) return;
      var lista = Store.pendientes();
      for (var i = 0; i < lista.length; i++) Store.borrarPendiente(lista[i].id);
      pintarPendientes();
      $('texto-pendientes').classList.add('oculto');
      mensaje('Lista vaciada.');
    });

    $('buscar-alimento').addEventListener('input', pintarBusqueda);
    $('b-guardar-alimento').addEventListener('click', guardarAlimento);
    $('b-sugerir-ia').addEventListener('click', sugerirConIA);

    $('b-guardar-ajustes').addEventListener('click', guardarAjustes);
    $('a-por-momento').addEventListener('change', function (ev) {
      $('zona-por-momento').classList.toggle('oculto', !ev.target.checked);
    });

    $('b-guardar-ia').addEventListener('click', function () {
      LLM.guardarConfig({
        activo: $('ia-activo').checked,
        proveedor: $('ia-proveedor').value,
        modelo: $('ia-modelo').value.trim(),
        clave: $('ia-clave').value.trim(),
        base_url: $('ia-base').value.trim()
      });
      comprobarConfiguracion();
      mensaje('Configuracion de IA guardada.');
    });
    $('ia-proveedor').addEventListener('change', function (ev) {
      var sug = LLM.MODELOS_SUGERIDOS[ev.target.value];
      if (sug && !$('ia-modelo').value.trim()) $('ia-modelo').value = sug;
    });
    $('b-probar-ia').addEventListener('click', function () {
      var caja = $('estado-ia');
      caja.className = 'nota n-info';
      caja.textContent = 'Probando...';
      LLM.guardarConfig({
        activo: true,
        proveedor: $('ia-proveedor').value,
        modelo: $('ia-modelo').value.trim(),
        clave: $('ia-clave').value.trim(),
        base_url: $('ia-base').value.trim()
      });
      LLM.probar().then(function (r) {
        caja.className = 'nota n-bien';
        caja.textContent = 'Funciona. Ha contestado: "' + r.respuesta + '"';
      }).catch(function (e) {
        caja.className = 'nota n-peligro';
        caja.textContent = e.message;
      });
    });

    $('b-borrar-todo').addEventListener('click', function () {
      if (!window.confirm('Se borran los ajustes, el registro y tus alimentos. No hay vuelta atras. Seguro?')) return;
      if (!window.confirm('Ultima comprobacion: de verdad quieres borrarlo TODO?')) return;
      Store.borrarTodo();
      items = [];
      cargarAjustes(); pintarItems(); pintarRegistro(); pintarPropios();
      pintarComidas(); pintarChipsComidas(); pintarPendientes();
      limpiarResultado(); comprobarConfiguracion();
      mensaje('Borrado.');
    });

    window.addEventListener('online', pintarEstadoRed);
    window.addEventListener('offline', pintarEstadoRed);
  }

  function pintarEstadoRed() {
    $('aviso-sin-conexion').classList.toggle('oculto', navigator.onLine !== false);
  }

  function registrarServicio() {
    // Solo con http/https: desde file:// no hay service worker (ni hace falta,
    // porque ya esta todo en local).
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    navigator.serviceWorker.register('sw.js').catch(function () {
      /* sin cache offline; la aplicacion sigue funcionando con conexion */
    });
  }

  function arrancar() {
    Store.inicializar();
    conectar();
    configurarVoz();
    cargarAjustes();
    pintarItems();
    pintarChipsComidas();
    pintarPendientes();
    pintarIOB();
    pintarEstadoRed();
    comprobarConfiguracion();
    irA('calcular');
    registrarServicio();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arrancar);
  } else {
    arrancar();
  }

})();
