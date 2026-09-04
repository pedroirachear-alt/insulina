/* ---------------------------------------------------------------------------
 * DICTADO POR VOZ
 * ---------------------------------------------------------------------------
 * Envoltorio sobre la API de reconocimiento de voz del navegador.
 *
 * DONDE FUNCIONA Y DONDE NO
 * Va bien en Chrome de Android y en Chrome/Edge de escritorio. En el Safari
 * del iPhone el soporte es irregular, y dentro de una aplicacion instalada en
 * la pantalla de inicio puede no funcionar en absoluto.
 *
 * Por eso el campo de texto SIEMPRE esta visible y nunca se depende de esto.
 * Y hay una salida que funciona en todos los telefonos sin una linea de
 * codigo: el microfono del propio teclado. Si el boton de la aplicacion no
 * aparece o no responde, se toca el campo de texto y se dicta con el microfono
 * del teclado, que es el mismo reconocimiento del sistema.
 * ------------------------------------------------------------------------- */

(function (root) {
  'use strict';

  var Reconocimiento = root.SpeechRecognition || root.webkitSpeechRecognition || null;
  var sesion = null;

  function disponible() {
    return Reconocimiento !== null;
  }

  /**
   * Empieza a escuchar.
   *
   * @param {object} cb
   *   onParcial(texto)  se va llamando mientras habla
   *   onFinal(texto)    texto definitivo
   *   onError(mensaje)  error legible por una persona
   *   onFin()           siempre al terminar, con exito o sin el
   */
  function escuchar(cb) {
    cb = cb || {};
    if (!disponible()) {
      if (cb.onError) cb.onError('Este navegador no sabe escuchar. Escribe la comida o usa el microfono del teclado.');
      if (cb.onFin) cb.onFin();
      return false;
    }
    parar();

    var r = new Reconocimiento();
    r.lang = 'es-ES';
    r.continuous = false;
    r.interimResults = true;
    r.maxAlternatives = 1;

    var ultimo = '';

    r.onresult = function (ev) {
      var parcial = '', definitivo = '';
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        var t = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) definitivo += t; else parcial += t;
      }
      if (parcial && cb.onParcial) cb.onParcial(parcial);
      if (definitivo) {
        ultimo = definitivo;
        if (cb.onFinal) cb.onFinal(definitivo.trim());
      }
    };

    r.onerror = function (ev) {
      var mensajes = {
        'not-allowed': 'No has dado permiso para usar el microfono. Puedes escribir la comida.',
        'service-not-allowed': 'El navegador no permite el microfono aqui. Escribe la comida.',
        'no-speech': 'No se ha oido nada. Vuelve a intentarlo o escribelo.',
        'audio-capture': 'No se encuentra el microfono. Escribe la comida.',
        network: 'El dictado necesita conexion a internet. Sin datos, escribelo (el calculo si funciona sin conexion).',
        aborted: null   // lo ha parado el usuario: no es un error que contar
      };
      var m = Object.prototype.hasOwnProperty.call(mensajes, ev.error)
        ? mensajes[ev.error]
        : 'No se ha podido escuchar (' + ev.error + '). Escribe la comida.';
      if (m && cb.onError) cb.onError(m);
    };

    r.onend = function () {
      sesion = null;
      if (cb.onFin) cb.onFin(ultimo);
    };

    try {
      r.start();
      sesion = r;
      return true;
    } catch (e) {
      sesion = null;
      if (cb.onError) cb.onError('No se ha podido empezar a escuchar. Escribe la comida.');
      if (cb.onFin) cb.onFin();
      return false;
    }
  }

  function parar() {
    if (!sesion) return;
    try { sesion.abort(); } catch (e) {}
    sesion = null;
  }

  function escuchando() {
    return sesion !== null;
  }

  root.Voz = {
    disponible: disponible,
    escuchar: escuchar,
    parar: parar,
    escuchando: escuchando
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
