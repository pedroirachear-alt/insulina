/* ---------------------------------------------------------------------------
 * CAPA DE IA  ·  OPCIONAL Y DESACTIVADA POR DEFECTO
 * ---------------------------------------------------------------------------
 * La aplicacion funciona entera sin esto. Este modulo es una AYUDA para dos
 * casos concretos, y para nada mas:
 *
 *   1. sugerirAlimento(nombre)  un alimento que no esta en la base: la IA
 *                               propone hidratos por 100 g y una racion
 *                               tipica. Es un BORRADOR que el usuario tiene
 *                               que revisar y guardar. NUNCA entra directo en
 *                               un calculo de insulina.
 *   2. interpretar(texto)       una frase que el lector de casa no ha sabido
 *                               leer. La IA solo devuelve PARES
 *                               (alimento, cantidad); los gramos de hidratos
 *                               los sigue poniendo la base local.
 *
 * LO QUE ESTE MODULO NO HACE, A PROPOSITO
 * No calcula dosis, no toca los parametros clinicos y no puede fijar por si
 * solo un valor de hidratos que acabe en una jeringa. Un valor inventado por
 * un modelo de lenguaje no se distingue a ojo de uno correcto; un alimento
 * mal reconocido, si, porque aparece en la lista de la pantalla.
 *
 * AGNOSTICO DE PROVEEDOR (apartado 6 del prompt de trabajo)
 * Interfaz unica `ClienteLLM.generar(prompt, opciones)`, un adaptador por
 * proveedor y una factoria que elige segun configuracion. El resto de la
 * aplicacion no importa ningun SDK ni conoce ningun nombre de modelo.
 *
 * AVISO DE SEGURIDAD, SIN ADORNOS
 * Una pagina web no puede guardar una clave de API en secreto. Si se activa
 * esto, la clave queda en el telefono y cualquiera con el telefono
 * desbloqueado --o con las herramientas de desarrollo-- puede leerla. Ademas,
 * el texto de la comida sale del dispositivo hacia el proveedor. Por eso viene
 * apagado y la guia de usuario recomienda dejarlo apagado.
 * ------------------------------------------------------------------------- */

(function (root) {
  'use strict';

  var CLAVE_CONFIG = 'insulina.llm';

  var CONFIG_DEFECTO = {
    activo: false,
    proveedor: 'ninguno',      // 'ninguno' | 'anthropic' | 'openai'
    modelo: '',
    clave: '',
    base_url: '',              // para endpoints compatibles con OpenAI
    tiempo_maximo_ms: 20000
  };

  /* Modelo por defecto de cada proveedor. Configurable siempre: aqui no se
   * incrusta nada en la logica (apartado 11 del prompt de trabajo). */
  var MODELOS_SUGERIDOS = {
    anthropic: 'claude-opus-5',
    openai: ''                 // sin valor por defecto: lo pone el usuario
  };

  /* ------------------------------------------------------------ configuracion */

  function config() {
    var c = {}, k;
    for (k in CONFIG_DEFECTO) {
      if (Object.prototype.hasOwnProperty.call(CONFIG_DEFECTO, k)) c[k] = CONFIG_DEFECTO[k];
    }
    try {
      var g = JSON.parse(root.localStorage.getItem(CLAVE_CONFIG) || '{}');
      for (k in g) if (Object.prototype.hasOwnProperty.call(g, k)) c[k] = g[k];
    } catch (e) { /* sin almacenamiento: se queda en los valores por defecto */ }
    if (!c.modelo && MODELOS_SUGERIDOS[c.proveedor]) c.modelo = MODELOS_SUGERIDOS[c.proveedor];
    return c;
  }

  function guardarConfig(nueva) {
    var c = config(), k;
    for (k in nueva) if (Object.prototype.hasOwnProperty.call(nueva, k)) c[k] = nueva[k];
    try { root.localStorage.setItem(CLAVE_CONFIG, JSON.stringify(c)); } catch (e) {}
    return c;
  }

  function disponible() {
    var c = config();
    return !!(c.activo && c.proveedor !== 'ninguno' && c.clave && c.modelo);
  }

  /* ------------------------------------------------------------- adaptadores */

  /* Contrato unico que consume el resto del modulo:
   *
   *     generar(prompt, { sistema, maxTokens }) -> Promise<string>
   *
   * Cada adaptador traduce esto a su API y normaliza los errores. Se usa
   * `fetch` directamente y no un SDK: la aplicacion es una pagina estatica sin
   * empaquetador ni instalacion de dependencias, que es justo lo que la hace
   * portable y desplegable en GitHub Pages.
   */

  function esperarConTiempoMaximo(promesa, ms) {
    return new Promise(function (resolver, rechazar) {
      var reloj = setTimeout(function () {
        rechazar(new Error('La IA no ha contestado en ' + Math.round(ms / 1000) + ' segundos.'));
      }, ms);
      promesa.then(
        function (v) { clearTimeout(reloj); resolver(v); },
        function (e) { clearTimeout(reloj); rechazar(e); }
      );
    });
  }

  function errorDeRespuesta(estado, cuerpo) {
    if (estado === 401 || estado === 403) return new Error('La clave de API no es valida o no tiene permiso.');
    if (estado === 429) return new Error('El proveedor ha limitado las peticiones. Prueba en un rato.');
    if (estado >= 500) return new Error('El proveedor tiene un problema (' + estado + '). Prueba mas tarde.');
    var detalle = '';
    try {
      var j = JSON.parse(cuerpo);
      detalle = (j.error && (j.error.message || j.error.type)) || '';
    } catch (e) { detalle = String(cuerpo || '').slice(0, 200); }
    return new Error('Error ' + estado + ' del proveedor' + (detalle ? ': ' + detalle : '.'));
  }

  /** Adaptador de Anthropic (Claude), API de mensajes. */
  function clienteAnthropic(c) {
    return {
      nombre: 'anthropic',
      generar: function (prompt, opciones) {
        opciones = opciones || {};
        var cuerpo = {
          model: c.modelo,
          max_tokens: opciones.maxTokens || 1024,
          messages: [{ role: 'user', content: prompt }]
        };
        if (opciones.sistema) cuerpo.system = opciones.sistema;

        return fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': c.clave,
            'anthropic-version': '2023-06-01',
            // Sin esta cabecera el navegador bloquea la peticion por CORS.
            // Su nombre lo dice todo: exponer la clave en el cliente es
            // justamente lo que se advierte arriba.
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify(cuerpo)
        }).then(function (r) {
          return r.text().then(function (txt) {
            if (!r.ok) throw errorDeRespuesta(r.status, txt);
            var j = JSON.parse(txt);
            var salida = '';
            for (var i = 0; i < (j.content || []).length; i++) {
              if (j.content[i].type === 'text') salida += j.content[i].text;
            }
            return salida;
          });
        });
      }
    };
  }

  /** Adaptador para OpenAI y para cualquier endpoint compatible. */
  function clienteOpenAI(c) {
    var base = (c.base_url || 'https://api.openai.com/v1').replace(/\/+$/, '');
    return {
      nombre: 'openai',
      generar: function (prompt, opciones) {
        opciones = opciones || {};
        var mensajes = [];
        if (opciones.sistema) mensajes.push({ role: 'system', content: opciones.sistema });
        mensajes.push({ role: 'user', content: prompt });

        return fetch(base + '/chat/completions', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer ' + c.clave
          },
          body: JSON.stringify({
            model: c.modelo,
            max_completion_tokens: opciones.maxTokens || 1024,
            messages: mensajes
          })
        }).then(function (r) {
          return r.text().then(function (txt) {
            if (!r.ok) throw errorDeRespuesta(r.status, txt);
            var j = JSON.parse(txt);
            return (j.choices && j.choices[0] && j.choices[0].message &&
                    j.choices[0].message.content) || '';
          });
        });
      }
    };
  }

  /** Factoria: devuelve el adaptador que toque, o null si no hay nada activo. */
  function cliente() {
    var c = config();
    if (!disponible()) return null;
    if (c.proveedor === 'anthropic') return clienteAnthropic(c);
    if (c.proveedor === 'openai') return clienteOpenAI(c);
    return null;
  }

  /* --------------------------------------------------------------- utilidades */

  /** Extrae el primer objeto JSON de una respuesta que puede traer adornos. */
  function extraerJSON(texto) {
    if (!texto) return null;
    var s = String(texto).replace(/```json/gi, '```').replace(/```/g, '').trim();
    var i = s.indexOf('{'), j = s.lastIndexOf('}');
    if (i < 0 || j <= i) return null;
    try { return JSON.parse(s.slice(i, j + 1)); } catch (e) { return null; }
  }

  function numeroFinito(v) {
    var n = Number(String(v === null || v === undefined ? '' : v).replace(',', '.'));
    return isFinite(n) ? n : null;
  }

  /* ------------------------------------------------------- sugerir un alimento */

  var SISTEMA_ALIMENTO =
    'Eres una tabla de composicion de alimentos. Respondes SOLO con un objeto ' +
    'JSON, sin texto alrededor. Trabajas con cocina española. Si no conoces el ' +
    'alimento con razonable seguridad, devuelve {"conocido": false}.';

  /**
   * Propone los hidratos de un alimento que no esta en la base.
   *
   * IMPORTANTE: lo que devuelve es un BORRADOR para que el usuario lo revise y
   * lo guarde en su lista. No se usa en ningun calculo hasta que el usuario lo
   * haya guardado explicitamente.
   *
   * @returns {Promise<object|null>} { nombre, hc100, racion_g, racion_nombre,
   *                                   nota, fuente:'ia' }  o null
   */
  function sugerirAlimento(nombre) {
    var cli = cliente();
    if (!cli) return Promise.reject(new Error('La ayuda con IA no esta activada.'));

    var prompt =
      'Alimento: "' + String(nombre).slice(0, 120) + '".\n\n' +
      'Devuelve este JSON exacto:\n' +
      '{"conocido": true, "nombre": "<nombre corto>", ' +
      '"hc100": <gramos de hidratos de carbono disponibles por 100 g de ' +
      'alimento listo para comer, numero>, ' +
      '"racion_g": <peso en gramos de una racion normal de una persona, numero>, ' +
      '"racion_nombre": "<plato|racion|unidad|vaso|rebanada|porcion>", ' +
      '"nota": "<una frase sobre de que receta o preparacion partes>"}';

    return esperarConTiempoMaximo(
      cli.generar(prompt, { sistema: SISTEMA_ALIMENTO, maxTokens: 400 }),
      config().tiempo_maximo_ms
    ).then(function (txt) {
      var j = extraerJSON(txt);
      if (!j || j.conocido === false) return null;

      var hc = numeroFinito(j.hc100);
      var racion = numeroFinito(j.racion_g);
      // Validacion de plausibilidad: nada de valores imposibles, aunque el
      // modelo insista. Ningun alimento pasa de 100 g de HC por 100 g.
      if (hc === null || hc < 0 || hc > 100) return null;
      if (racion === null || racion <= 0 || racion > 2000) racion = 100;

      return {
        nombre: String(j.nombre || nombre).slice(0, 60),
        hc100: Math.round(hc * 10) / 10,
        racion_g: Math.round(racion),
        racion_nombre: String(j.racion_nombre || 'racion').slice(0, 20),
        nota: String(j.nota || '').slice(0, 200),
        fuente: 'ia'
      };
    });
  }

  /* ------------------------------------------------- interpretar una frase */

  var SISTEMA_FRASE =
    'Separas una frase sobre comida en alimentos y cantidades. Respondes SOLO ' +
    'con un objeto JSON, sin texto alrededor. NO calculas hidratos de carbono ' +
    'ni insulina: de eso se encarga otro programa.';

  /**
   * Descompone una frase en pares (alimento, cantidad). Los hidratos los sigue
   * poniendo la base local: aqui solo se pide ayuda con el idioma.
   *
   * @returns {Promise<object>} { items:[{nombre, cantidad, unidad}], nota }
   */
  function interpretarFrase(texto) {
    var cli = cliente();
    if (!cli) return Promise.reject(new Error('La ayuda con IA no esta activada.'));

    var prompt =
      'Frase: "' + String(texto).slice(0, 400) + '".\n\n' +
      'Devuelve este JSON exacto:\n' +
      '{"items": [{"nombre": "<alimento en singular, sin cantidad>", ' +
      '"cantidad": <numero>, "unidad": "<g|ml|plato|racion|unidad|vaso|' +
      'rebanada|loncha|cucharada|porcion|lata|copa>"}]}\n\n' +
      'Un objeto por alimento. Si la frase nombra un plato compuesto ' +
      '(por ejemplo "macarrones con tomate"), ponlo como UN solo alimento.';

    return esperarConTiempoMaximo(
      cli.generar(prompt, { sistema: SISTEMA_FRASE, maxTokens: 700 }),
      config().tiempo_maximo_ms
    ).then(function (txt) {
      var j = extraerJSON(txt);
      var entrada = (j && j.items) || [];
      var items = [];
      for (var i = 0; i < entrada.length && i < 25; i++) {
        var it = entrada[i] || {};
        if (!it.nombre) continue;
        var cant = numeroFinito(it.cantidad);
        items.push({
          nombre: String(it.nombre).slice(0, 60),
          cantidad: (cant !== null && cant > 0 && cant < 10000) ? cant : 1,
          unidad: String(it.unidad || '').slice(0, 20)
        });
      }
      return { items: items, nota: 'Interpretado con ayuda de IA. Revisalo.' };
    });
  }

  /**
   * Traduce lo que ha entendido la IA a items reales de la base local.
   * Los alimentos que la base no conozca se devuelven aparte, para que el
   * usuario los añada a mano: no se cuentan hasta entonces.
   */
  function resolverContraBase(lectura) {
    var A = root.Alimentos, items = [], desconocidos = [], total = 0;
    if (!A) return { items: [], desconocidos: [], hc_total: 0 };

    for (var i = 0; i < lectura.items.length; i++) {
      var it = lectura.items[i];
      var cand = A.buscar(it.nombre, 1);
      if (!cand.length || cand[0].puntuacion < 0.62) {
        desconocidos.push(it.nombre);
        continue;
      }
      var al = cand[0].alimento, gramos = null;
      var u = A.normalizar(it.unidad);
      if (u === 'g' || u === 'ml' || u === 'gramos') {
        gramos = it.cantidad;
      } else {
        var p = A.gramosDePorcion(al, u);
        if (p.gramos) gramos = it.cantidad * p.gramos;
        else gramos = it.cantidad * A.porcionPorDefecto(al).gramos;
      }
      var hc = A.hcDeGramos(al, gramos);
      total += hc;
      items.push({
        id: al.id, nombre: al.nombre, grupo: al.grupo, hc100: al.hc100,
        gramos: Math.round(gramos * 10) / 10,
        cantidad: Math.round(gramos * 10) / 10,
        unidad: it.unidad || null,
        detalle: it.cantidad + ' ' + (it.unidad || 'racion') + ' (via IA)',
        hc_g: Math.round(hc * 10) / 10,
        confianza: 'media',
        puntuacion: cand[0].puntuacion,
        texto: it.nombre
      });
    }
    return {
      items: items,
      desconocidos: desconocidos,
      hc_total: Math.round(total * 10) / 10
    };
  }

  /** Comprobacion de configuracion, para el boton "Probar" de Ajustes. */
  function probar() {
    var cli = cliente();
    if (!cli) return Promise.reject(new Error('Falta configurar proveedor, modelo o clave.'));
    return esperarConTiempoMaximo(
      cli.generar('Responde solo con la palabra: correcto', { maxTokens: 20 }),
      config().tiempo_maximo_ms
    ).then(function (t) {
      return { ok: true, respuesta: String(t).trim().slice(0, 60) };
    });
  }

  /* -------------------------------------------------------------------- api */

  root.LLM = {
    config: config,
    guardarConfig: guardarConfig,
    disponible: disponible,
    cliente: cliente,
    probar: probar,
    sugerirAlimento: sugerirAlimento,
    interpretarFrase: interpretarFrase,
    resolverContraBase: resolverContraBase,
    extraerJSON: extraerJSON,
    MODELOS_SUGERIDOS: MODELOS_SUGERIDOS,
    CONFIG_DEFECTO: CONFIG_DEFECTO
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
