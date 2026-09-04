/* ---------------------------------------------------------------------------
 * ALMACENAMIENTO LOCAL
 * ---------------------------------------------------------------------------
 * Todo se guarda en el `localStorage` del propio telefono:
 *
 *   - los ajustes (ratio, FSI, objetivo, insulina lenta...),
 *   - el registro de comidas y pinchazos,
 *   - los alimentos que el usuario corrija o añada,
 *   - las comidas guardadas ("el desayuno de siempre").
 *
 * NADA SALE DEL TELEFONO. No hay servidor, ni cuenta, ni copia en la nube.
 * Son datos de salud: la unica forma de que salgan es que el usuario pulse
 * "Exportar" y comparta el archivo el mismo.
 *
 * Contrapartida honesta: si se borran los datos del navegador o se pierde el
 * telefono, se pierde el registro. Por eso hay exportacion a JSON y la guia de
 * usuario recomienda hacerlo de vez en cuando.
 * ------------------------------------------------------------------------- */

(function (root) {
  'use strict';

  var PREFIJO = 'insulina.';
  var CLAVES = {
    ajustes: PREFIJO + 'ajustes',
    registro: PREFIJO + 'registro',
    alimentos: PREFIJO + 'alimentos',
    comidas: PREFIJO + 'comidas',
    version: PREFIJO + 'version'
  };
  var VERSION_DATOS = 1;
  var MAX_REGISTRO = 2000;   // unos 2 años de 3 comidas al dia

  /* ------------------------------------------------------- acceso protegido */

  /* En navegacion privada, o con las cookies bloqueadas, el simple hecho de
   * leer `localStorage` lanza una excepcion. La aplicacion tiene que seguir
   * funcionando: se cae a una copia en memoria y se avisa por pantalla. */
  var memoria = {};
  var persistente = (function () {
    try {
      var k = PREFIJO + 'prueba';
      root.localStorage.setItem(k, '1');
      root.localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  })();

  function leerCrudo(clave) {
    if (!persistente) return memoria[clave] === undefined ? null : memoria[clave];
    try { return root.localStorage.getItem(clave); } catch (e) { return null; }
  }

  function escribirCrudo(clave, valor) {
    if (!persistente) { memoria[clave] = valor; return true; }
    try { root.localStorage.setItem(clave, valor); return true; }
    catch (e) {
      // Cuota agotada: lo mas probable es que el registro haya crecido mucho.
      memoria[clave] = valor;
      return false;
    }
  }

  function leerJSON(clave, porDefecto) {
    var s = leerCrudo(clave);
    if (!s) return porDefecto;
    try {
      var v = JSON.parse(s);
      return (v === null || v === undefined) ? porDefecto : v;
    } catch (e) {
      return porDefecto;
    }
  }

  function escribirJSON(clave, valor) {
    return escribirCrudo(clave, JSON.stringify(valor));
  }

  /* ---------------------------------------------------------------- ajustes */

  /* Los ajustes tecnicos tienen valor por defecto; los CLINICOS (ratio, FSI y
   * objetivo) se quedan a null hasta que el usuario los introduzca. */
  var AJUSTES_INICIALES = {
    objetivo: null,
    ratio: null,
    fsi: null,
    por_momento: false,
    ratios: { desayuno: null, comida: null, merienda: null, cena: null },
    fsis: { desayuno: null, comida: null, merienda: null, cena: null },
    paso: 1,
    redondeo: 'cercano',
    max_u: 20,
    umbral_hipo: 70,
    umbral_alto: 250,
    permitir_correccion_negativa: true,
    restar_iob: false,
    duracion_insulina_h: 4,
    // Informativos, para tenerlo todo en un sitio y que salga en el registro.
    insulina_rapida: '',
    insulina_lenta: '',
    dosis_lenta: null,
    hora_lenta: '',
    configurado: false
  };

  function ajustes() {
    var g = leerJSON(CLAVES.ajustes, {});
    var a = {}, k;
    for (k in AJUSTES_INICIALES) {
      if (Object.prototype.hasOwnProperty.call(AJUSTES_INICIALES, k)) a[k] = AJUSTES_INICIALES[k];
    }
    a.ratios = { desayuno: null, comida: null, merienda: null, cena: null };
    a.fsis = { desayuno: null, comida: null, merienda: null, cena: null };
    for (k in g) {
      if (!Object.prototype.hasOwnProperty.call(g, k)) continue;
      if (k === 'ratios' || k === 'fsis') {
        for (var m in g[k]) if (Object.prototype.hasOwnProperty.call(g[k], m)) a[k][m] = g[k][m];
      } else {
        a[k] = g[k];
      }
    }
    return a;
  }

  function guardarAjustes(nuevos) {
    var a = ajustes(), k;
    for (k in nuevos) {
      if (!Object.prototype.hasOwnProperty.call(nuevos, k)) continue;
      if (k === 'ratios' || k === 'fsis') {
        for (var m in nuevos[k]) if (Object.prototype.hasOwnProperty.call(nuevos[k], m)) a[k][m] = nuevos[k][m];
      } else {
        a[k] = nuevos[k];
      }
    }
    a.configurado = (a.ratio !== null && a.objetivo !== null) ||
                    (a.por_momento && a.objetivo !== null);
    escribirJSON(CLAVES.ajustes, a);
    return a;
  }

  /** true cuando ya se puede calcular algo. */
  function estaConfigurado() {
    var a = ajustes();
    if (a.objetivo === null) return false;
    if (a.ratio !== null) return true;
    if (a.por_momento) {
      for (var m in a.ratios) {
        if (Object.prototype.hasOwnProperty.call(a.ratios, m) && a.ratios[m] !== null) return true;
      }
    }
    return false;
  }

  /* --------------------------------------------------------------- registro */

  /**
   * Una anotacion del registro:
   *   { id, ts, momento, hc_g, glucosa, unidades, tipo:'rapida'|'lenta'|'nota',
   *     items:[...], nota, calculo:{...} }
   */
  function registro() {
    var r = leerJSON(CLAVES.registro, []);
    return Array.isArray(r) ? r : [];
  }

  function anotar(entrada) {
    var r = registro();
    var e = entrada || {};
    e.id = e.id || ('r' + Date.now() + '-' + Math.random().toString(36).slice(2, 7));
    e.ts = e.ts || Date.now();
    e.tipo = e.tipo || 'rapida';
    r.push(e);
    r.sort(function (a, b) { return a.ts - b.ts; });
    if (r.length > MAX_REGISTRO) r = r.slice(r.length - MAX_REGISTRO);
    escribirJSON(CLAVES.registro, r);
    return e;
  }

  function borrarAnotacion(id) {
    var r = registro(), fuera = [];
    for (var i = 0; i < r.length; i++) if (r[i].id !== id) fuera.push(r[i]);
    escribirJSON(CLAVES.registro, fuera);
    return r.length - fuera.length;
  }

  /** Anotaciones de los ultimos `horas`, de mas reciente a mas antigua. */
  function registroReciente(horas, ahoraMs) {
    var ahora = ahoraMs || Date.now();
    var desde = ahora - (horas || 24) * 3600000;
    var r = registro(), out = [];
    for (var i = r.length - 1; i >= 0; i--) if (r[i].ts >= desde) out.push(r[i]);
    return out;
  }

  /**
   * Insulina rapida que todavia esta actuando, segun los pinchazos anotados.
   * Necesita `bolus.js` cargado.
   */
  function iobActual(ahoraMs) {
    var a = ajustes();
    var dur = a.duracion_insulina_h || 4;
    var r = registro(), dosis = [];
    var ahora = ahoraMs || Date.now();
    for (var i = 0; i < r.length; i++) {
      if (r[i].tipo !== 'rapida') continue;
      if (!(r[i].unidades > 0)) continue;
      if (ahora - r[i].ts > dur * 3600000) continue;
      dosis.push({ ts: r[i].ts, unidades: r[i].unidades });
    }
    if (!root.Bolus) return 0;
    return root.Bolus.iobTotal(dosis, dur, ahora);
  }

  /* ------------------------------------------------------ alimentos propios */

  function alimentosPropios() {
    var a = leerJSON(CLAVES.alimentos, []);
    return Array.isArray(a) ? a : [];
  }

  /**
   * Comprueba un alimento antes de guardarlo. Devuelve { ok, motivo }.
   * Las reglas viven aqui para que la pantalla y la importacion de copias
   * apliquen exactamente las mismas.
   */
  function validarAlimento(a) {
    if (!a || typeof a !== 'object') return { ok: false, motivo: 'No hay alimento.' };
    if (typeof a.nombre !== 'string' || !a.nombre.trim()) {
      return { ok: false, motivo: 'Falta el nombre.' };
    }
    if (typeof a.hc100 !== 'number' || !isFinite(a.hc100)) {
      return { ok: false, motivo: 'Los hidratos por 100 g tienen que ser un numero.' };
    }
    if (a.hc100 < 0 || a.hc100 > 100) {
      return { ok: false, motivo: 'Los hidratos por 100 g tienen que estar entre 0 y 100.' };
    }
    if (a.unidad_g !== null && a.unidad_g !== undefined) {
      if (typeof a.unidad_g !== 'number' || !isFinite(a.unidad_g) ||
          a.unidad_g <= 0 || a.unidad_g > 2000) {
        return { ok: false, motivo: 'La racion tiene que estar entre 1 y 2000 g.' };
      }
    }
    return { ok: true, motivo: '' };
  }

  /**
   * Guarda o corrige un alimento del usuario. Un alimento invalido NO se
   * guarda: dejarlo entrar significaria que aporta 0 g de hidratos sin que
   * nadie se de cuenta, o sea insulina de menos.
   */
  function guardarAlimentoPropio(alimento) {
    var v = validarAlimento(alimento);
    if (!v.ok) return { ok: false, motivo: v.motivo, lista: alimentosPropios() };

    var lista = alimentosPropios(), i, encontrado = false;
    for (i = 0; i < lista.length; i++) {
      if (lista[i].id === alimento.id) { lista[i] = alimento; encontrado = true; break; }
    }
    if (!encontrado) lista.push(alimento);
    escribirJSON(CLAVES.alimentos, lista);
    if (root.Alimentos) root.Alimentos.registrarPersonalizados(lista);
    return { ok: true, motivo: '', lista: lista };
  }

  function borrarAlimentoPropio(id) {
    var lista = alimentosPropios(), fuera = [];
    for (var i = 0; i < lista.length; i++) if (lista[i].id !== id) fuera.push(lista[i]);
    escribirJSON(CLAVES.alimentos, fuera);
    if (root.Alimentos) root.Alimentos.registrarPersonalizados(fuera);
    return fuera;
  }

  /** Genera un id valido y libre a partir de un nombre. */
  function idParaNombre(nombre) {
    var base = (root.Alimentos ? root.Alimentos.normalizar(nombre) : String(nombre).toLowerCase())
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'alimento';
    var id = 'propio-' + base, n = 2;
    var usados = {};
    var lista = alimentosPropios();
    for (var i = 0; i < lista.length; i++) usados[lista[i].id] = true;
    while (usados[id]) { id = 'propio-' + base + '-' + n; n++; }
    return id;
  }

  /* ------------------------------------------------------ comidas guardadas */

  /** { id, nombre, items:[...], hc_g } — "el desayuno de siempre". */
  function comidas() {
    var c = leerJSON(CLAVES.comidas, []);
    return Array.isArray(c) ? c : [];
  }

  function guardarComida(comida) {
    var lista = comidas(), i, encontrado = false;
    comida.id = comida.id || ('c' + Date.now());
    for (i = 0; i < lista.length; i++) {
      if (lista[i].id === comida.id) { lista[i] = comida; encontrado = true; break; }
    }
    if (!encontrado) lista.push(comida);
    escribirJSON(CLAVES.comidas, lista);
    return lista;
  }

  function borrarComida(id) {
    var lista = comidas(), fuera = [];
    for (var i = 0; i < lista.length; i++) if (lista[i].id !== id) fuera.push(lista[i]);
    escribirJSON(CLAVES.comidas, fuera);
    return fuera;
  }

  /* ------------------------------------------------- exportar e importar */

  function exportar() {
    return JSON.stringify({
      aplicacion: 'control-insulina',
      version_datos: VERSION_DATOS,
      exportado: new Date().toISOString(),
      ajustes: ajustes(),
      registro: registro(),
      alimentos: alimentosPropios(),
      comidas: comidas()
    }, null, 2);
  }

  /**
   * Importa una copia. `modo`:
   *   'reemplazar' -> deja exactamente lo del archivo
   *   'fusionar'   -> añade lo que falte del registro y de las listas
   * Devuelve { ok, mensaje, importadas }.
   */
  function importar(texto, modo) {
    var datos;
    try { datos = JSON.parse(texto); }
    catch (e) { return { ok: false, mensaje: 'El archivo no es un JSON valido.' }; }
    if (!datos || datos.aplicacion !== 'control-insulina') {
      return { ok: false, mensaje: 'Ese archivo no es una copia de esta aplicacion.' };
    }

    var nuevas = 0;
    if (modo === 'reemplazar') {
      escribirJSON(CLAVES.ajustes, datos.ajustes || {});
      escribirJSON(CLAVES.registro, datos.registro || []);
      escribirJSON(CLAVES.alimentos, datos.alimentos || []);
      escribirJSON(CLAVES.comidas, datos.comidas || []);
      nuevas = (datos.registro || []).length;
    } else {
      if (datos.ajustes) guardarAjustes(datos.ajustes);
      var actual = registro(), vistos = {}, i;
      for (i = 0; i < actual.length; i++) vistos[actual[i].id] = true;
      var entrantes = datos.registro || [];
      for (i = 0; i < entrantes.length; i++) {
        if (!vistos[entrantes[i].id]) { actual.push(entrantes[i]); nuevas++; }
      }
      actual.sort(function (a, b) { return a.ts - b.ts; });
      escribirJSON(CLAVES.registro, actual);

      var props = alimentosPropios();
      var entrantesAl = datos.alimentos || [];
      for (i = 0; i < entrantesAl.length; i++) guardarAlimentoPropio(entrantesAl[i]);
      var entrantesCo = datos.comidas || [];
      for (i = 0; i < entrantesCo.length; i++) guardarComida(entrantesCo[i]);
    }

    if (root.Alimentos) root.Alimentos.registrarPersonalizados(alimentosPropios());
    escribirCrudo(CLAVES.version, String(VERSION_DATOS));
    return { ok: true, mensaje: 'Copia importada.', importadas: nuevas };
  }

  function borrarTodo() {
    for (var k in CLAVES) {
      if (!Object.prototype.hasOwnProperty.call(CLAVES, k)) continue;
      if (persistente) { try { root.localStorage.removeItem(CLAVES[k]); } catch (e) {} }
      delete memoria[CLAVES[k]];
    }
    if (root.Alimentos) root.Alimentos.registrarPersonalizados([]);
  }

  /* Al arrancar, los alimentos propios entran en el indice de busqueda. */
  function inicializar() {
    escribirCrudo(CLAVES.version, String(VERSION_DATOS));
    if (root.Alimentos) root.Alimentos.registrarPersonalizados(alimentosPropios());
  }

  /* -------------------------------------------------------------------- api */

  root.Store = {
    persistente: function () { return persistente; },
    ajustes: ajustes,
    guardarAjustes: guardarAjustes,
    estaConfigurado: estaConfigurado,
    registro: registro,
    registroReciente: registroReciente,
    anotar: anotar,
    borrarAnotacion: borrarAnotacion,
    iobActual: iobActual,
    alimentosPropios: alimentosPropios,
    guardarAlimentoPropio: guardarAlimentoPropio,
    validarAlimento: validarAlimento,
    borrarAlimentoPropio: borrarAlimentoPropio,
    idParaNombre: idParaNombre,
    comidas: comidas,
    guardarComida: guardarComida,
    borrarComida: borrarComida,
    exportar: exportar,
    importar: importar,
    borrarTodo: borrarTodo,
    inicializar: inicializar,
    AJUSTES_INICIALES: AJUSTES_INICIALES,
    VERSION_DATOS: VERSION_DATOS
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
