/* ---------------------------------------------------------------------------
 * INDICE Y BUSCADOR DE ALIMENTOS
 * ---------------------------------------------------------------------------
 * Monta un indice en memoria sobre `window.ALIMENTOS_DB` (mas los alimentos
 * que el usuario haya añadido) y ofrece:
 *
 *   - buscar(texto)            busqueda tolerante a erratas y a dictado
 *   - buscarExacto(texto)      coincidencia por nombre o alias normalizado
 *   - gramosDePorcion(...)     cuantos gramos son "un plato", "una rebanada"
 *   - hcDeGramos(...)          gramos de alimento -> gramos de hidratos
 *
 * Sin dependencias externas. La similitud se calcula con el coeficiente de
 * Dice sobre bigramas: barato y bastante bueno con erratas y con el texto que
 * devuelve el reconocimiento de voz.
 * ------------------------------------------------------------------------- */

(function (root) {
  'use strict';

  var BASE = root.ALIMENTOS_DB || { alimentos: [], unidades_por_defecto: {} };

  /* ------------------------------------------------------ normalizacion ---- */

  /** Minusculas, sin acentos, sin puntuacion, espacios colapsados. */
  function normalizar(texto) {
    if (texto === null || texto === undefined) return '';
    var s = String(texto).toLowerCase();
    // Descomponer y quitar diacriticos. La ñ se conserva como "n" a proposito:
    // asi "champiñones" y "champinones" (dictado, teclado sin ñ) coinciden.
    s = s.normalize ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : s;
    s = s.replace(/[^a-z0-9\s.,/]/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }

  /** Bigramas de una cadena, para el coeficiente de Dice. */
  function bigramas(s) {
    var out = [];
    var t = s.replace(/\s/g, '');
    for (var i = 0; i < t.length - 1; i++) out.push(t.substr(i, 2));
    return out;
  }

  /** Similitud 0..1 entre dos cadenas ya normalizadas. */
  function similitud(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    var A = bigramas(a), B = bigramas(b);
    if (!A.length || !B.length) return 0;
    var mapa = {}, i, k, comunes = 0;
    for (i = 0; i < A.length; i++) { k = A[i]; mapa[k] = (mapa[k] || 0) + 1; }
    for (i = 0; i < B.length; i++) { k = B[i]; if (mapa[k] > 0) { mapa[k]--; comunes++; } }
    return (2 * comunes) / (A.length + B.length);
  }

  /* --------------------------------------------------------------- indice -- */

  var alimentos = [];      // lista efectiva (base + personalizados)
  var porId = {};          // id -> alimento
  var claves = [];         // [{ clave, id, tipo:'nombre'|'alias' }]
  var porClave = {};       // clave normalizada -> [ids]
  var personalizados = [];

  /**
   * Variantes buscables de un nombre. Muchos nombres llevan una aclaracion
   * entre parentesis o varios sinonimos separados por "/":
   *
   *   "Chocolate negro (70%)"   -> tambien "chocolate negro"
   *   "Mejillones / almejas"    -> tambien "mejillones" y "almejas"
   *   "Pollo (plancha / asado)" -> tambien "pollo"
   *
   * Sin esto, escribir "chocolate negro" no daria coincidencia exacta y el
   * buscador se iria por aproximacion, que es mucho menos fiable.
   */
  function variantesDeNombre(nombre) {
    var base = String(nombre || '');
    var sinParentesis = base.replace(/\([^)]*\)/g, ' ');
    var partes = sinParentesis.split('/');
    var out = [];
    for (var i = 0; i < partes.length; i++) {
      var v = normalizar(partes[i]);
      if (v.length < 4) continue;              // fragmentos sin valor
      if (v.indexOf('de ') === 0) continue;    // "de sabores", "de cangrejo"...
      if (v === normalizar(base)) continue;    // ya se indexa como nombre
      if (out.indexOf(v) < 0) out.push(v);
    }
    return out;
  }

  function indexar() {
    alimentos = BASE.alimentos.slice();
    for (var i = 0; i < personalizados.length; i++) {
      var p = personalizados[i];
      // Un alimento personalizado con el mismo id sustituye al de la base:
      // asi el usuario puede corregir un valor que no le cuadra.
      var pos = -1;
      for (var j = 0; j < alimentos.length; j++) {
        if (alimentos[j].id === p.id) { pos = j; break; }
      }
      if (pos >= 0) alimentos[pos] = p; else alimentos.push(p);
    }

    porId = {}; claves = []; porClave = {};
    for (var a = 0; a < alimentos.length; a++) {
      var al = alimentos[a];
      porId[al.id] = al;
      var listas = [[al.nombre, 'nombre']];
      if (al.alias) for (var x = 0; x < al.alias.length; x++) listas.push([al.alias[x], 'alias']);
      var vars = variantesDeNombre(al.nombre);
      for (var v = 0; v < vars.length; v++) listas.push([vars[v], 'alias']);
      for (var l = 0; l < listas.length; l++) {
        var clave = normalizar(listas[l][0]);
        if (!clave) continue;
        claves.push({ clave: clave, id: al.id, tipo: listas[l][1], palabras: clave.split(' ').length });
        if (!porClave[clave]) porClave[clave] = [];
        if (porClave[clave].indexOf(al.id) < 0) porClave[clave].push(al.id);
      }
    }
    // Claves mas largas primero: favorece "macarrones con tomate" sobre "macarrones".
    claves.sort(function (p, q) { return q.clave.length - p.clave.length; });
  }

  /**
   * Comprueba que un alimento sea utilizable en un calculo.
   *
   * La validacion es estricta a proposito. `isFinite(Number(x))` NO sirve:
   * `Number(null)`, `Number('')` y `Number([])` valen 0, que es finito, asi
   * que un alimento con los hidratos sin rellenar se colaba en el indice y
   * aportaba 0 g de hidratos SIN AVISAR -- es decir, insulina de menos.
   */
  function esValido(a) {
    if (!a || typeof a !== 'object') return false;
    if (typeof a.id !== 'string' || !a.id) return false;
    if (typeof a.nombre !== 'string' || !a.nombre.trim()) return false;
    if (typeof a.hc100 !== 'number' || !isFinite(a.hc100)) return false;
    if (a.hc100 < 0 || a.hc100 > 100) return false;
    return true;
  }

  /** Sustituye la lista de alimentos del usuario y reconstruye el indice. */
  function registrarPersonalizados(lista) {
    personalizados = (lista || []).filter(esValido);
    indexar();
    return personalizados.length;
  }

  indexar();

  /* ------------------------------------------------------------ busquedas -- */

  /** Coincidencia exacta por nombre o alias. Devuelve el alimento o null. */
  function buscarExacto(texto) {
    var clave = normalizar(texto);
    var ids = porClave[clave];
    return ids && ids.length ? porId[ids[0]] : null;
  }

  /**
   * Busqueda tolerante. Devuelve [{ alimento, puntuacion, tipo }] ordenado.
   * `puntuacion` 1 = exacta; ~0.9 empieza por; el resto, similitud de Dice.
   */
  function buscar(texto, limite) {
    var q = normalizar(texto);
    limite = limite || 8;
    if (!q) return [];

    var puntos = {}, motivo = {}, clave = {};
    function anotar(id, p, tipo, c) {
      if (!puntos[id] || p > puntos[id]) { puntos[id] = p; motivo[id] = tipo; clave[id] = c; }
    }

    for (var i = 0; i < claves.length; i++) {
      var c = claves[i], p;
      if (c.clave === q) {
        p = 1;
      } else if (c.clave.indexOf(q) === 0) {
        // La clave empieza por lo buscado ("manz" -> "manzana").
        p = 0.90 - 0.02 * (c.clave.length - q.length) / Math.max(1, c.clave.length);
      } else if (q.indexOf(c.clave) === 0) {
        p = 0.86;
      } else if (c.clave.indexOf(q) > 0) {
        p = 0.78;
      } else {
        p = similitud(q, c.clave) * 0.75;
        if (p < 0.32) continue;
      }
      if (c.tipo === 'alias') p -= 0.01;   // a igualdad, gana el nombre oficial
      anotar(c.id, p, c.tipo, c.clave);
    }

    var salida = [];
    for (var id in puntos) {
      if (Object.prototype.hasOwnProperty.call(puntos, id)) {
        salida.push({
          alimento: porId[id],
          puntuacion: Math.round(puntos[id] * 1000) / 1000,
          tipo: motivo[id],
          clave: clave[id]
        });
      }
    }
    salida.sort(function (a, b) {
      if (b.puntuacion !== a.puntuacion) return b.puntuacion - a.puntuacion;
      return a.alimento.nombre.localeCompare(b.alimento.nombre);
    });
    return salida.slice(0, limite);
  }

  /**
   * Busca la clave MAS LARGA que coincida exactamente con el principio de una
   * lista de palabras. Es lo que permite que "macarrones con tomate" gane a
   * "macarrones". Devuelve { alimento, palabras } o null.
   */
  function buscarPrefijo(palabras, maxPalabras) {
    var tope = Math.min(maxPalabras || 4, palabras.length);
    for (var n = tope; n >= 1; n--) {
      var frase = palabras.slice(0, n).join(' ');
      var ids = porClave[frase];
      if (ids && ids.length) return { alimento: porId[ids[0]], palabras: n, exacto: true };
    }
    return null;
  }

  /* ------------------------------------------------------ porciones y HC -- */

  var UNIDADES_DEFECTO = BASE.unidades_por_defecto || {};

  /**
   * Gramos que corresponden a una medida de casa para un alimento dado.
   * Devuelve { gramos, origen: 'propia'|'generica'|'unidad'|null }.
   */
  function gramosDePorcion(alimento, unidad) {
    var u = normalizar(unidad);
    if (!alimento) return { gramos: null, origen: null };

    if (u && alimento.porciones) {
      for (var k in alimento.porciones) {
        if (normalizar(k) === u) {
          return { gramos: Number(alimento.porciones[k]), origen: 'propia' };
        }
      }
    }
    if ((u === 'unidad' || u === 'pieza' || u === '') && alimento.unidad_g) {
      return { gramos: Number(alimento.unidad_g), origen: 'unidad' };
    }
    if (u && Object.prototype.hasOwnProperty.call(UNIDADES_DEFECTO, u)) {
      return { gramos: Number(UNIDADES_DEFECTO[u]), origen: 'generica' };
    }
    return { gramos: null, origen: null };
  }

  /**
   * Porcion por defecto cuando no se dice cantidad ("he comido lentejas").
   * Prioridad: la unidad natural del alimento > su primera porcion > 100 g.
   */
  function porcionPorDefecto(alimento) {
    if (!alimento) return { gramos: null, unidad: null, origen: null };
    if (alimento.unidad_g) return { gramos: Number(alimento.unidad_g), unidad: 'unidad', origen: 'unidad' };
    if (alimento.porciones) {
      var preferidas = ['plato', 'racion', 'porcion', 'vaso', 'unidad', 'taza', 'bol'];
      for (var i = 0; i < preferidas.length; i++) {
        if (Object.prototype.hasOwnProperty.call(alimento.porciones, preferidas[i])) {
          return { gramos: Number(alimento.porciones[preferidas[i]]), unidad: preferidas[i], origen: 'propia' };
        }
      }
      for (var k in alimento.porciones) {
        if (Object.prototype.hasOwnProperty.call(alimento.porciones, k)) {
          return { gramos: Number(alimento.porciones[k]), unidad: k, origen: 'propia' };
        }
      }
    }
    return { gramos: 100, unidad: '100 g', origen: 'generica' };
  }

  /** Gramos de alimento -> gramos de hidratos de carbono. */
  function hcDeGramos(alimento, gramos) {
    if (!alimento || !isFinite(gramos)) return 0;
    return (Number(alimento.hc100) || 0) * gramos / 100;
  }

  /* ------------------------------------------------------------------ api -- */

  root.Alimentos = {
    normalizar: normalizar,
    similitud: similitud,
    buscar: buscar,
    buscarExacto: buscarExacto,
    buscarPrefijo: buscarPrefijo,
    variantesDeNombre: variantesDeNombre,
    gramosDePorcion: gramosDePorcion,
    porcionPorDefecto: porcionPorDefecto,
    hcDeGramos: hcDeGramos,
    registrarPersonalizados: registrarPersonalizados,
    esValido: esValido,
    unidadesConocidas: function () { return Object.keys(UNIDADES_DEFECTO); },
    porId: function (id) { return porId[id] || null; },
    todos: function () { return alimentos.slice(); },
    grupos: function () {
      var g = {}, out = [];
      for (var i = 0; i < alimentos.length; i++) g[alimentos[i].grupo] = true;
      for (var k in g) if (Object.prototype.hasOwnProperty.call(g, k)) out.push(k);
      return out.sort();
    },
    version: BASE.version || '0'
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
