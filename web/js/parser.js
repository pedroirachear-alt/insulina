/* ---------------------------------------------------------------------------
 * INTERPRETE DE LENGUAJE NATURAL  ·  "que voy a comer" -> gramos de hidratos
 * ---------------------------------------------------------------------------
 * Convierte frases como
 *
 *     "un plato de macarrones con tomate, dos rebanadas de pan y una manzana"
 *
 * en una lista de alimentos con cantidad, gramos e hidratos de carbono.
 *
 * DECISION DE DISEÑO IMPORTANTE
 * Este modulo solo INTERPRETA la frase. Los gramos de hidratos SIEMPRE salen
 * de la base de alimentos (`foods.js`), nunca de aqui y nunca de un modelo de
 * lenguaje. Asi, el peor fallo posible es reconocer mal un alimento --que el
 * usuario ve y corrige en la pantalla-- y no un valor de hidratos inventado
 * que nadie puede detectar a ojo.
 *
 * Funciona entero sin conexion. No necesita ninguna clave de API.
 * ------------------------------------------------------------------------- */

(function (root) {
  'use strict';

  var A = root.Alimentos;

  /* --------------------------------------------------------- vocabulario -- */

  var PALABRAS_NUMERO = {
    medio: 0.5, media: 0.5, mitad: 0.5,
    un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
    siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13,
    catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18,
    diecinueve: 19, veinte: 20, veinticinco: 25, treinta: 30, cuarenta: 40,
    cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
    cien: 100, ciento: 100, doscientos: 200, trescientos: 300
  };

  /* Cantidades vagas: se aceptan, pero marcan el item como poco fiable. */
  var PALABRAS_VAGAS = { unos: 1, unas: 1, algun: 1, alguna: 1, varios: 3, varias: 3 };

  /* Unidades de peso y volumen -> factor a gramos.
   * Los mililitros se tratan como gramos (densidad ~1). Vale para leche, zumo,
   * cerveza, refrescos y caldo, que es todo lo liquido de la base. */
  var UNIDADES_PESO = {
    g: 1, gr: 1, grs: 1, gramo: 1, gramos: 1,
    ml: 1, mililitro: 1, mililitros: 1, cc: 1, cl: 10,
    kg: 1000, kilo: 1000, kilos: 1000, kilogramo: 1000, kilogramos: 1000,
    l: 1000, litro: 1000, litros: 1000
  };

  /* Palabras que no aportan nada al calculo y se saltan sin avisar. */
  /* Ojo: "sobre" NO va aqui (es una unidad: un sobre de azucar), ni "unos"
   * ni "unas" (se tratan como cantidad vaga). */
  var RELLENO = {
    de: 1, del: 1, la: 1, el: 1, los: 1, las: 1, al: 1, a: 1, con: 1,
    y: 1, e: 1, mas: 1, tambien: 1, ademas: 1, en: 1, muy: 1, bien: 1,
    aproximadamente: 1, poco: 1, algo: 1, tipo: 1
  };

  /* Formas verbales y muletillas del principio de la frase. */
  var ARRANQUE = {
    hoy: 1, ahora: 1, luego: 1, despues: 1, me: 1, voy: 1, a: 1, quiero: 1,
    he: 1, estoy: 1, vamos: 1, para: 1, comer: 1, comido: 1, como: 1,
    cenar: 1, cenado: 1, ceno: 1, desayunar: 1, desayunado: 1, desayuno: 1,
    merendar: 1, merendado: 1, tomar: 1, tomado: 1, tomo: 1, picar: 1,
    picado: 1, comiendo: 1, cenando: 1, desayunando: 1, pues: 1, bueno: 1
  };

  /* Adjetivos de coccion o tamaño que sobran cuando el alimento ya se ha
   * reconocido. Se ignoran en silencio en vez de darlos por no reconocidos. */
  var ADJETIVOS = {
    frito: 1, fritos: 1, frita: 1, fritas: 1, cocido: 1, cocidos: 1,
    cocida: 1, cocidas: 1, hervido: 1, hervidos: 1, hervida: 1, hervidas: 1,
    asado: 1, asados: 1, asada: 1, asadas: 1, plancha: 1, horno: 1,
    crudo: 1, crudos: 1, cruda: 1, crudas: 1, natural: 1, naturales: 1,
    entero: 1, entera: 1, enteros: 1, enteras: 1, pequeno: 1, pequena: 1,
    pequenos: 1, pequenas: 1, grande: 1, grandes: 1, mediano: 1, mediana: 1,
    caliente: 1, frio: 1, fria: 1, templado: 1, casero: 1, casera: 1,
    rehogado: 1, salteado: 1, guisado: 1, alinada: 1, alinado: 1,
    troceado: 1, troceada: 1, pelado: 1, pelada: 1, rallado: 1, rallada: 1
  };

  var UMBRAL_MULTI = 0.55;   // similitud minima para frases de 2+ palabras
  var UMBRAL_SIMPLE = 0.62;  // ... y para palabras sueltas (mas exigente)
  var LONGITUD_MINIMA = 4;   // no se aproximan palabras de 3 letras o menos
  var PROPORCION_MINIMA = 0.5; // lo buscado y lo encontrado, de tamaño parecido

  /* Todas las unidades de casa reconocibles: las genericas mas cualquiera que
   * algun alimento defina en sus `porciones`. Se indexan con su plural. */
  var UNIDADES_CASA = (function () {
    var set = {}, i, k;
    var genericas = A.unidadesConocidas();
    for (i = 0; i < genericas.length; i++) set[A.normalizar(genericas[i])] = true;
    var todos = A.todos();
    for (i = 0; i < todos.length; i++) {
      var p = todos[i].porciones;
      if (!p) continue;
      for (k in p) if (Object.prototype.hasOwnProperty.call(p, k)) set[A.normalizar(k)] = true;
    }
    // Indice singular + plural -> forma canonica (singular).
    var mapa = {};
    for (k in set) {
      if (!Object.prototype.hasOwnProperty.call(set, k)) continue;
      mapa[k] = k;
      var ultima = k.charAt(k.length - 1);
      var plural = 'aeiou'.indexOf(ultima) >= 0 ? k + 's' : k + 'es';
      if (!mapa[plural]) mapa[plural] = k;
    }
    return mapa;
  })();

  /* ------------------------------------------------------ preprocesamiento -- */

  /** Normaliza, protege los decimales y deja una frase limpia de puntuacion. */
  function preparar(texto) {
    var s = A.normalizar(texto);
    s = s.replace(/(\d)[.,](\d)/g, '$1_DEC_$2');
    s = s.replace(/[.,;]/g, ' ');
    s = s.replace(/_DEC_/g, '.');
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }

  /** Convierte "150g" en "150 g" para que el tokenizador los separe. */
  function separarNumeroYUnidad(s) {
    return s.replace(/(\d)\s*(kg|kilos?|kilogramos?|gramos?|grs?|g|mililitros?|ml|cc|cl|litros?|l)\b/g, '$1 $2');
  }

  function tokenizar(texto) {
    var s = separarNumeroYUnidad(preparar(texto));
    if (!s) return [];
    var t = s.split(' ');
    // Quitar las muletillas del principio.
    var i = 0;
    while (i < t.length && ARRANQUE[t[i]]) i++;
    return t.slice(i);
  }

  /** Interpreta un token como numero: "3", "0.5", "1/2", "dos", "medio". */
  function comoNumero(token) {
    if (token === undefined || token === null) return null;
    if (/^\d+(\.\d+)?$/.test(token)) return { valor: Number(token), vago: false };
    var frac = /^(\d+)\/(\d+)$/.exec(token);
    if (frac && Number(frac[2]) !== 0) {
      return { valor: Number(frac[1]) / Number(frac[2]), vago: false };
    }
    if (Object.prototype.hasOwnProperty.call(PALABRAS_NUMERO, token)) {
      return { valor: PALABRAS_NUMERO[token], vago: false };
    }
    if (Object.prototype.hasOwnProperty.call(PALABRAS_VAGAS, token)) {
      return { valor: PALABRAS_VAGAS[token], vago: true };
    }
    return null;
  }

  /* ------------------------------------------------- lectura de cantidades -- */

  /**
   * Lee, a partir de `i`, un bloque de cantidad: numero + unidad opcional.
   * Devuelve { cantidad, vago, unidad, factor_peso, i } con el cursor movido.
   */
  function leerCantidad(t, i) {
    var r = { cantidad: null, vago: false, unidad: null, factor_peso: null,
              i: i, i_unidad: null };

    // "un cuarto de", "tres cuartos de", "un par de"
    if (t[i] === 'un' && (t[i + 1] === 'cuarto')) { r.cantidad = 0.25; r.i = i + 2; }
    else if (t[i] === 'tres' && t[i + 1] === 'cuartos') { r.cantidad = 0.75; r.i = i + 2; }
    else if (t[i] === 'un' && t[i + 1] === 'par') { r.cantidad = 2; r.i = i + 2; }
    else {
      var n = comoNumero(t[i]);
      if (n) { r.cantidad = n.valor; r.vago = n.vago; r.i = i + 1; }
    }

    // "y medio" / "y media" justo detras del numero
    if (r.cantidad !== null && t[r.i] === 'y' && (t[r.i + 1] === 'medio' || t[r.i + 1] === 'media')) {
      r.cantidad += 0.5; r.i += 2;
    }

    // "media docena de huevos"
    if (r.cantidad !== null && (t[r.i] === 'docena' || t[r.i] === 'docenas')) {
      r.cantidad *= 12; r.i += 1;
    }

    // El "de" de "un cuarto DE kilo": va antes de la unidad.
    while (t[r.i] === 'de' || t[r.i] === 'del') r.i += 1;

    // Unidad: primero de peso/volumen, luego medida de casa.
    var u = t[r.i];
    if (u && Object.prototype.hasOwnProperty.call(UNIDADES_PESO, u)) {
      r.factor_peso = UNIDADES_PESO[u]; r.unidad = u; r.i_unidad = r.i; r.i += 1;
      if (r.cantidad === null) r.cantidad = 1;
    } else if (u && Object.prototype.hasOwnProperty.call(UNIDADES_CASA, u)) {
      r.unidad = UNIDADES_CASA[u]; r.i_unidad = r.i; r.i += 1;
      if (r.cantidad === null) r.cantidad = 1;
      // "un plato y medio de..."
      if (t[r.i] === 'y' && (t[r.i + 1] === 'medio' || t[r.i + 1] === 'media')) {
        r.cantidad += 0.5; r.i += 2;
      }
    }

    // El "de" de "un plato DE macarrones" o "150 g DE arroz".
    while (t[r.i] === 'de' || t[r.i] === 'del') r.i += 1;
    return r;
  }

  /* ------------------------------------------------------ lectura de comida -- */

  /**
   * Busca un alimento a partir de `i`. Prueba primero coincidencia exacta con
   * la frase mas larga posible y, si falla, similitud sobre ventanas de 3, 2 y
   * 1 palabras. Devuelve { alimento, palabras, puntuacion } o null.
   */
  /** Palabra que nunca puede cerrar el nombre de un alimento. */
  function esFuncional(palabra) {
    if (!palabra) return true;
    return !!(RELLENO[palabra] || ADJETIVOS[palabra] || palabra === 'sin' ||
              UNIDADES_CASA[palabra] || UNIDADES_PESO[palabra] ||
              comoNumero(palabra) !== null);
  }

  function leerAlimento(t, i) {
    var resto = t.slice(i, i + 5);
    if (!resto.length) return null;

    var exacto = A.buscarPrefijo(resto, 5);
    if (exacto) {
      return { alimento: exacto.alimento, palabras: exacto.palabras, puntuacion: 1 };
    }

    /* A partir de aqui ya no hay coincidencia exacta, solo aproximada. Es el
     * terreno donde se cometen los errores caros, asi que se exige bastante:
     *
     *  - nada de aproximar palabras de tres letras o menos: "no" casaria con
     *    "nocilla", "se" con "setas" y "que" con "queso", y una frase sin
     *    sentido acabaria produciendo una dosis de insulina;
     *  - lo buscado y el nombre encontrado deben tener tamaño parecido, por
     *    el mismo motivo.
     *
     * Los alimentos de nombre corto (pan, te, uva, miel) no se pierden: esos
     * ya los ha resuelto la busqueda exacta de `buscarPrefijo`. */
    var mejor = null;
    for (var n = Math.min(3, resto.length); n >= 1; n--) {
      var frase = resto.slice(0, n).join(' ');
      if (n === 1 && (RELLENO[frase] || ADJETIVOS[frase] || UNIDADES_CASA[frase])) continue;
      if (frase.replace(/\s/g, '').length < LONGITUD_MINIMA) continue;
      // Una ventana no puede terminar en palabra funcional: "tostada sin" se
      // parece muchisimo a "tostadas", y tragarse el "sin" anularia la
      // negacion de "una tostada SIN mermelada".
      if (n >= 2 && esFuncional(resto[n - 1])) continue;
      var cand = A.buscar(frase, 1);
      if (!cand.length) continue;
      var umbral = n >= 2 ? UMBRAL_MULTI : UMBRAL_SIMPLE;
      if (cand[0].puntuacion < umbral) continue;
      var lq = frase.length, lc = (cand[0].clave || '').length;
      if (Math.min(lq, lc) / Math.max(lq, lc) < PROPORCION_MINIMA) continue;
      // Se prefiere la ventana mas larga; a igualdad de longitud, mas puntuacion.
      if (!mejor || n > mejor.palabras ||
          (n === mejor.palabras && cand[0].puntuacion > mejor.puntuacion)) {
        mejor = { alimento: cand[0].alimento, palabras: n, puntuacion: cand[0].puntuacion };
      }
    }
    return mejor;
  }

  function confianzaDeCoincidencia(p) {
    if (p >= 0.86) return 'alta';
    if (p >= 0.70) return 'media';
    return 'baja';
  }

  var ORDEN_CONFIANZA = { alta: 3, media: 2, baja: 1 };
  function peor(a, b) { return ORDEN_CONFIANZA[a] <= ORDEN_CONFIANZA[b] ? a : b; }

  /* ------------------------------------------------------------ resolucion -- */

  /**
   * Traduce cantidad + unidad + alimento a gramos de alimento.
   * Devuelve { gramos, detalle, confianza }.
   */
  function resolverGramos(alimento, cant) {
    // 1. Peso o volumen explicito: es el caso mas fiable.
    if (cant.factor_peso) {
      return {
        gramos: cant.cantidad * cant.factor_peso,
        detalle: cant.cantidad + ' ' + cant.unidad,
        confianza: 'alta'
      };
    }

    // 2. Medida de casa dicha por el usuario.
    if (cant.unidad) {
      var p = A.gramosDePorcion(alimento, cant.unidad);
      if (p.gramos) {
        return {
          gramos: cant.cantidad * p.gramos,
          detalle: cant.cantidad + ' ' + cant.unidad + (cant.cantidad === 1 ? '' : 's'),
          confianza: p.origen === 'generica' ? 'media' : 'alta'
        };
      }
      // Unidad que ese alimento no reconoce: se usa su porcion natural.
      var d0 = A.porcionPorDefecto(alimento);
      return {
        gramos: cant.cantidad * d0.gramos,
        detalle: cant.cantidad + ' ' + cant.unidad + ' (tomado como ' + d0.unidad + ')',
        confianza: 'baja'
      };
    }

    // 3. Solo un numero: son piezas ("dos manzanas", "tres huevos").
    if (cant.cantidad !== null) {
      var pu = A.gramosDePorcion(alimento, 'unidad');
      if (pu.gramos && (pu.origen === 'unidad' || pu.origen === 'propia')) {
        return {
          gramos: cant.cantidad * pu.gramos,
          detalle: cant.cantidad + (cant.cantidad === 1 ? ' unidad' : ' unidades'),
          confianza: cant.vago ? 'baja' : 'alta'
        };
      }
      var d1 = A.porcionPorDefecto(alimento);
      return {
        gramos: cant.cantidad * d1.gramos,
        detalle: cant.cantidad + ' x ' + d1.unidad,
        confianza: cant.vago ? 'baja' : 'media'
      };
    }

    // 4. No se ha dicho cantidad: se asume una racion normal.
    var d2 = A.porcionPorDefecto(alimento);
    return {
      gramos: d2.gramos,
      detalle: '1 ' + d2.unidad + ' (supuesto)',
      confianza: 'media'
    };
  }

  /* -------------------------------------------------------------- interprete -- */

  /**
   * Interpreta una frase completa.
   *
   * @param {string} texto  lo que ha dicho o escrito el usuario
   * @returns {object}
   *   items          [{ id, nombre, cantidad, unidad, gramos, hc_g, hc100,
   *                     confianza, detalle, texto }]
   *   hc_total       gramos de hidratos de toda la comida
   *   no_reconocido  palabras que no se han sabido interpretar
   *   excluidos      alimentos descartados por un "sin ..."
   *   confianza      la peor de todos los items
   */
  function interpretar(texto) {
    var t = tokenizar(texto);
    var res = {
      texto: String(texto || ''),
      items: [],
      hc_total: 0,
      no_reconocido: [],
      sin_alimento: [],
      excluidos: [],
      avisos: [],
      confianza: 'alta'
    };
    if (!t.length) {
      res.avisos.push('No se ha entendido nada. Prueba a decirlo de otra manera, por ejemplo: "un plato de arroz y una manzana".');
      res.confianza = 'baja';
      return res;
    }

    var i = 0, guarda = 0;
    while (i < t.length && guarda++ < 400) {

      // "sin azucar", "sin pan": se descarta el alimento que venga detras.
      if (t[i] === 'sin') {
        var negado = leerAlimento(t, i + 1);
        if (negado) {
          res.excluidos.push(negado.alimento.nombre);
          i += 1 + negado.palabras;
        } else {
          i += 1;
        }
        continue;
      }

      if (RELLENO[t[i]] || ADJETIVOS[t[i]]) { i += 1; continue; }

      var cant = leerCantidad(t, i);
      var j = cant.i;

      // Saltar relleno y adjetivos entre la cantidad y el alimento.
      while (j < t.length && (RELLENO[t[j]] || ADJETIVOS[t[j]])) j += 1;

      var enc = leerAlimento(t, j);

      /* ------------------------------------------------------------------
       * La regla del "bocadillo".
       *
       * Algunas palabras son a la vez medida y comida: "un bocadillo de
       * jamon" no son 170 g de jamon (0,8 g de HC), son un bocadillo entero
       * (unos 56 g de HC). Un error de este tipo, en insulina, es de varias
       * unidades. Se corrige en dos pasos:
       *
       *   a) si desde la palabra-unidad arranca un nombre de alimento de dos
       *      o mas palabras, gana el alimento;
       *   b) si no, y la unidad no cuadra con el alimento encontrado (queda
       *      en confianza baja), se reinterpreta la unidad como alimento.
       * ---------------------------------------------------------------- */
      if (cant.i_unidad !== null && !cant.factor_peso) {
        var desdeUnidad = t.slice(cant.i_unidad, cant.i_unidad + 5);
        var directo = A.buscarPrefijo(desdeUnidad, 5);
        var reinterpretar = false;

        if (directo && directo.palabras >= 2) {
          reinterpretar = true;                                    // caso (a)
        } else if (directo && enc) {
          var prueba = resolverGramos(enc.alimento, cant);
          if (prueba.confianza === 'baja') reinterpretar = true;   // caso (b)
        } else if (directo && !enc) {
          reinterpretar = true;
        }

        if (reinterpretar) {
          var finAnterior = enc ? j + enc.palabras : cant.i;
          enc = { alimento: directo.alimento, palabras: directo.palabras, puntuacion: 1 };
          j = cant.i_unidad;
          cant = { cantidad: cant.cantidad, vago: cant.vago, unidad: null,
                   factor_peso: null, i: cant.i_unidad, i_unidad: null,
                   fin_minimo: finAnterior };
        }
      }

      /* ------------------------------------------------------------------
       * La regla del "a la".
       *
       * En "espaguetis a la carbonara" el primer alimento reconocido es la
       * pasta y el segundo el plato entero: contar los dos duplicaria los
       * hidratos. Cuando detras de un ingrediente viene "a la ..." o "al ..."
       * y eso nombra un plato completo, gana el plato.
       * ---------------------------------------------------------------- */
      if (enc && enc.alimento.grupo !== 'platos') {
        var k = j + enc.palabras, w = -1;
        if (t[k] === 'a' && (t[k + 1] === 'la' || t[k + 1] === 'el')) w = k + 2;
        else if (t[k] === 'al') w = k + 1;
        if (w > 0 && w < t.length) {
          var plato = A.buscarPrefijo(t.slice(w, w + 4), 4);
          if (plato && plato.alimento.grupo === 'platos') {
            enc = { alimento: plato.alimento, palabras: (w - j) + plato.palabras, puntuacion: 1 };
          }
        }
      }

      if (!enc) {
        /* Se habia entendido una cantidad pero no a que alimento se referia
         * ("un plato de ...", "una racion de ..."). Esto NO puede pasar en
         * silencio: serian hidratos que desaparecen del calculo. */
        if (cant.cantidad !== null && cant.unidad) {
          var frase = t.slice(i, Math.min(cant.i + 2, t.length)).join(' ');
          if (res.sin_alimento.indexOf(frase) < 0) res.sin_alimento.push(frase);
          i = Math.max(cant.i, i + 1);
          continue;
        }
        // Palabra suelta que no se ha sabido interpretar.
        if (!RELLENO[t[i]] && !ADJETIVOS[t[i]] && comoNumero(t[i]) === null &&
            !UNIDADES_CASA[t[i]] && !UNIDADES_PESO[t[i]] && t[i] !== 'sin') {
          if (res.no_reconocido.indexOf(t[i]) < 0) res.no_reconocido.push(t[i]);
        }
        i += 1;
        continue;
      }

      var al = enc.alimento;
      var g = resolverGramos(al, cant);
      var hc = A.hcDeGramos(al, g.gramos);
      var conf = peor(confianzaDeCoincidencia(enc.puntuacion), g.confianza);

      res.items.push({
        id: al.id,
        nombre: al.nombre,
        grupo: al.grupo,
        hc100: al.hc100,
        cantidad: Math.round(g.gramos * 10) / 10,   // gramos de alimento
        gramos: Math.round(g.gramos * 10) / 10,
        unidad: cant.unidad || null,
        detalle: g.detalle,
        hc_g: Math.round(hc * 10) / 10,
        confianza: conf,
        puntuacion: enc.puntuacion,
        texto: t.slice(i, j + enc.palabras).join(' ')
      });

      i = j + enc.palabras;
      // Si se ha reinterpretado, hay que consumir tambien lo que la lectura
      // anterior habia absorbido ("...de jamon"), o saldria un item duplicado.
      if (cant.fin_minimo && cant.fin_minimo > i) i = cant.fin_minimo;
    }

    // Total y confianza global.
    var total = 0;
    for (var k = 0; k < res.items.length; k++) {
      total += res.items[k].hc_g;
      res.confianza = peor(res.confianza, res.items[k].confianza);
    }
    res.hc_total = Math.round(total * 10) / 10;

    /* Una palabra sin entender puede ser un plato entero que se ha quedado
     * fuera del total, asi que la lectura no puede darse por buena. */
    if (res.no_reconocido.length) res.confianza = peor(res.confianza, 'media');
    if (res.sin_alimento.length) res.confianza = 'baja';

    if (!res.items.length) {
      res.confianza = 'baja';
      res.avisos.push('No se ha reconocido ningun alimento. Escribelo con otras palabras o busca los alimentos a mano.');
    }
    if (res.sin_alimento.length) {
      res.avisos.push('Has dicho una cantidad pero no se ha entendido de que: "' +
                      res.sin_alimento.join('", "') + '". NO se ha contado. Añadelo a mano.');
    }
    if (res.no_reconocido.length) {
      res.avisos.push('No se han entendido estas palabras: ' + res.no_reconocido.join(', ') +
                      '. Comprueba que no falte nada en la lista.');
    }
    if (res.excluidos.length) {
      res.avisos.push('Descartado por un "sin": ' + res.excluidos.join(', ') + '.');
    }
    if (res.confianza !== 'alta' && res.items.length) {
      res.avisos.push('Revisa la lista antes de calcular: hay alimentos o cantidades de las que la aplicacion no esta segura.');
    }

    return res;
  }

  /* -------------------------------------------------------------------- api -- */

  root.Parser = {
    interpretar: interpretar,
    tokenizar: tokenizar,
    preparar: preparar,
    comoNumero: comoNumero,
    leerCantidad: leerCantidad,
    leerAlimento: leerAlimento,
    resolverGramos: resolverGramos,
    esFuncional: esFuncional,
    UNIDADES_CASA: UNIDADES_CASA,
    UNIDADES_PESO: UNIDADES_PESO
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
