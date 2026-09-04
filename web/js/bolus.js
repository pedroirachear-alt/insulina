/* ---------------------------------------------------------------------------
 * MOTOR DE CALCULO DEL BOLO DE INSULINA RAPIDA
 * ---------------------------------------------------------------------------
 * Modulo PURO: no toca el DOM, no lee ni escribe almacenamiento, no hace red.
 * Toda la logica de decision vive aqui para poder testearla exhaustivamente
 * desde pytest (ver tests/test_bolus.py, que ejecuta ESTE MISMO archivo en un
 * motor JavaScript, no una reimplementacion).
 *
 * FORMULAS (las estandar de terapia bolo-basal):
 *   bolo de comida     = HC (g) / ratio I:C
 *   bolo de correccion = (glucemia - objetivo) / FSI
 *   total              = bolo de comida + bolo de correccion [- insulina activa]
 *
 * Los tres parametros (ratio, FSI, objetivo) son ESTRICTAMENTE INDIVIDUALES y
 * los prescribe el equipo de endocrinologia. Este modulo NO tiene valores
 * clinicos por defecto: si faltan, bloquea el calculo.
 * ------------------------------------------------------------------------- */

(function (root) {
  'use strict';

  /* ---------------------------------------------------------------- limites */

  /* Rangos de plausibilidad. No son criterio clinico: solo cazan erratas de
   * teclado (un 600 donde iban 60 g) antes de que lleguen a una jeringa. */
  var LIMITES = {
    hc_max: 400,            // g de HC en una sola ingesta
    hc_aviso: 200,          // por encima de esto, avisar
    glucosa_min: 20,        // mg/dL fisiologicamente posible
    glucosa_max: 800,
    ratio_min: 1,           // g de HC por unidad
    ratio_max: 60,
    fsi_min: 5,             // mg/dL por unidad
    fsi_max: 200,
    objetivo_min: 70,
    objetivo_max: 180,
    dosis_absoluta_max: 100 // tope duro, por encima nunca se devuelve dosis
  };

  /* Ajustes tecnicos por defecto (NO clinicos). Los clinicos --ratio, FSI y
   * objetivo-- se dejan a null a proposito: los introduce el usuario. */
  var AJUSTES_DEFECTO = {
    objetivo: null,                    // mg/dL, prepandrial
    ratio: null,                       // g de HC que cubre 1 U
    fsi: null,                         // mg/dL que baja 1 U
    por_momento: false,                // usar ratio/FSI distintos por comida
    ratios: { desayuno: null, comida: null, merienda: null, cena: null },
    fsis: { desayuno: null, comida: null, merienda: null, cena: null },
    paso: 1,                           // resolucion de la pluma: 1 U o 0.5 U
    redondeo: 'cercano',               // 'cercano' | 'abajo'
    max_u: 20,                         // tope de seguridad por dosis
    umbral_hipo: 70,                   // por debajo: no se calcula dosis
    umbral_alto: 250,                  // por encima: avisar de cetonas
    permitir_correccion_negativa: true,
    restar_iob: false,                 // restar insulina activa automaticamente
    duracion_insulina_h: 4             // duracion de accion de la rapida
  };

  var MOMENTOS = ['desayuno', 'comida', 'merienda', 'cena'];

  /* ------------------------------------------------------------- utilidades */

  /** Redondea a multiplos de `paso`, evitando la basura del coma flotante. */
  function redondear(valor, paso, modo) {
    if (!isFinite(valor)) return NaN;
    if (!(paso > 0)) return valor;
    var n = Math.round((valor / paso) * 1e10) / 1e10;
    var k = (modo === 'abajo') ? Math.floor(n) : Math.round(n);
    return Math.round(k * paso * 1e10) / 1e10;
  }

  /** Redondeo a n decimales, para mostrar (nunca para dosificar). */
  function dec(valor, n) {
    if (!isFinite(valor)) return NaN;
    var f = Math.pow(10, n === undefined ? 2 : n);
    return Math.round(valor * f) / f;
  }

  /** Convierte a numero finito o devuelve null. Acepta la coma decimal. */
  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v).trim().replace(',', '.');
    if (s === '') return null;
    var n = Number(s);
    return isFinite(n) ? n : null;
  }

  /** Franja horaria a partir de una hora (0-23). */
  function momentoPorHora(hora) {
    if (hora >= 5 && hora < 11) return 'desayuno';
    if (hora >= 11 && hora < 17) return 'comida';
    if (hora >= 17 && hora < 20) return 'merienda';
    return 'cena';
  }

  /** Franja horaria a partir de un Date (o de "ahora"). */
  function momentoAhora(fecha) {
    return momentoPorHora((fecha || new Date()).getHours());
  }

  /* --------------------------------------------------------- insulina activa */

  /**
   * Insulina activa (IOB) restante de una dosis pasada, con decaimiento
   * LINEAL sobre la duracion de accion.
   *
   * Es un modelo deliberadamente simple y algo conservador. Las curvas reales
   * de los analogos rapidos no son lineales; sirve para AVISAR de que queda
   * insulina trabajando, no para dosificar con precision de bomba.
   */
  function iobDeDosis(unidades, horasTranscurridas, duracionH) {
    var u = num(unidades), h = num(horasTranscurridas), d = num(duracionH);
    if (u === null || u <= 0) return 0;
    if (h === null || h < 0) return 0;
    if (d === null || d <= 0) return 0;
    if (h >= d) return 0;
    return u * (1 - h / d);
  }

  /**
   * Insulina activa total a partir del registro de dosis rapidas previas.
   * `registro`: [{ ts: epoch_ms, unidades: n }]  ·  `ahoraMs`: epoch_ms
   */
  function iobTotal(registro, duracionH, ahoraMs) {
    if (!registro || !registro.length) return 0;
    var ahora = ahoraMs || Date.now();
    var total = 0;
    for (var i = 0; i < registro.length; i++) {
      var r = registro[i];
      if (!r || !r.ts) continue;
      var horas = (ahora - r.ts) / 3600000;
      total += iobDeDosis(r.unidades, horas, duracionH);
    }
    return dec(total, 2);
  }

  /* -------------------------------------------------- resolucion de ajustes */

  /** Mezcla los ajustes recibidos sobre los valores por defecto. */
  function normalizarAjustes(ajustes) {
    var a = {}, k;
    for (k in AJUSTES_DEFECTO) {
      if (Object.prototype.hasOwnProperty.call(AJUSTES_DEFECTO, k)) a[k] = AJUSTES_DEFECTO[k];
    }
    a.ratios = { desayuno: null, comida: null, merienda: null, cena: null };
    a.fsis = { desayuno: null, comida: null, merienda: null, cena: null };
    if (ajustes) {
      for (k in ajustes) {
        if (!Object.prototype.hasOwnProperty.call(ajustes, k)) continue;
        if (k === 'ratios' || k === 'fsis') continue;
        a[k] = ajustes[k];
      }
      if (ajustes.ratios) for (k in ajustes.ratios) a.ratios[k] = num(ajustes.ratios[k]);
      if (ajustes.fsis) for (k in ajustes.fsis) a.fsis[k] = num(ajustes.fsis[k]);
    }
    a.objetivo = num(a.objetivo);
    a.ratio = num(a.ratio);
    a.fsi = num(a.fsi);
    a.paso = num(a.paso) || 1;
    a.max_u = num(a.max_u);
    a.umbral_hipo = num(a.umbral_hipo);
    a.umbral_alto = num(a.umbral_alto);
    a.duracion_insulina_h = num(a.duracion_insulina_h) || 4;
    if (a.redondeo !== 'abajo') a.redondeo = 'cercano';
    return a;
  }

  /** Ratio y FSI efectivos para el momento del dia indicado. */
  function parametrosDelMomento(a, momento) {
    var m = MOMENTOS.indexOf(momento) >= 0 ? momento : null;
    var ratio = a.ratio, fsi = a.fsi;
    if (a.por_momento && m) {
      if (a.ratios[m] !== null && a.ratios[m] !== undefined) ratio = a.ratios[m];
      if (a.fsis[m] !== null && a.fsis[m] !== undefined) fsi = a.fsis[m];
    }
    return { ratio: num(ratio), fsi: num(fsi), momento: m };
  }

  /* ------------------------------------------------------------- validacion */

  /** Comprueba que los parametros clinicos existan y sean plausibles. */
  function validarAjustes(a, p, necesitaCorreccion) {
    if (p.ratio === null) {
      return { codigo: 'FALTA_RATIO',
               mensaje: 'Falta el ratio insulina/hidratos. Introducelo en Ajustes con el valor que te haya dado tu medico.' };
    }
    if (p.ratio < LIMITES.ratio_min || p.ratio > LIMITES.ratio_max) {
      return { codigo: 'RATIO_IMPLAUSIBLE',
               mensaje: 'El ratio (' + p.ratio + ' g/U) esta fuera del rango razonable de ' +
                        LIMITES.ratio_min + ' a ' + LIMITES.ratio_max + ' g/U. Revisa Ajustes.' };
    }
    if (necesitaCorreccion) {
      if (a.objetivo === null) {
        return { codigo: 'FALTA_OBJETIVO',
                 mensaje: 'Falta la glucemia objetivo. Introducela en Ajustes.' };
      }
      if (a.objetivo < LIMITES.objetivo_min || a.objetivo > LIMITES.objetivo_max) {
        return { codigo: 'OBJETIVO_IMPLAUSIBLE',
                 mensaje: 'El objetivo (' + a.objetivo + ' mg/dL) esta fuera del rango de ' +
                          LIMITES.objetivo_min + ' a ' + LIMITES.objetivo_max + '. Revisa Ajustes.' };
      }
      if (p.fsi === null) {
        return { codigo: 'FALTA_FSI',
                 mensaje: 'Falta el factor de sensibilidad (FSI). Introducelo en Ajustes, o deja la glucemia en blanco para calcular solo el bolo de la comida.' };
      }
      if (p.fsi < LIMITES.fsi_min || p.fsi > LIMITES.fsi_max) {
        return { codigo: 'FSI_IMPLAUSIBLE',
                 mensaje: 'El FSI (' + p.fsi + ' mg/dL/U) esta fuera del rango de ' +
                          LIMITES.fsi_min + ' a ' + LIMITES.fsi_max + '. Revisa Ajustes.' };
      }
    }
    return null;
  }

  /* ------------------------------------------------------------- el calculo */

  /**
   * Calcula el bolo de insulina rapida.
   *
   * @param {object} entrada
   *        hc_g     {number}  gramos de hidratos que se van a comer (obligatorio, >= 0)
   *        glucosa  {number?} glucemia actual en mg/dL; si falta, no hay correccion
   *        iob_u    {number?} insulina activa estimada, en unidades
   *        momento  {string?} 'desayuno' | 'comida' | 'merienda' | 'cena'
   * @param {object} ajustes  ver AJUSTES_DEFECTO
   * @returns {object} resultado con ok / bloqueo / avisos / desglose / total
   */
  function calcular(entrada, ajustes) {
    entrada = entrada || {};
    var a = normalizarAjustes(ajustes);

    var res = {
      ok: false,
      bloqueo: null,
      avisos: [],
      hc_g: null,
      glucosa: null,
      momento: null,
      ratio: null,
      fsi: null,
      objetivo: a.objetivo,
      bolo_comida: 0,
      bolo_correccion: 0,
      iob_u: 0,
      iob_restada: 0,
      total_bruto: 0,
      total: 0,
      paso: a.paso,
      desglose: []
    };

    function avisar(nivel, codigo, mensaje) {
      res.avisos.push({ nivel: nivel, codigo: codigo, mensaje: mensaje });
    }
    function bloquear(codigo, mensaje) {
      res.ok = false;
      res.bloqueo = { codigo: codigo, mensaje: mensaje };
      return res;
    }

    /* --- hidratos ------------------------------------------------------- */
    var hc = num(entrada.hc_g);
    if (hc === null) {
      return bloquear('FALTAN_HC', 'No hay hidratos de carbono que calcular. Anota la comida primero.');
    }
    if (hc < 0) {
      return bloquear('HC_NEGATIVOS', 'Los hidratos de carbono no pueden ser negativos.');
    }
    if (hc > LIMITES.hc_max) {
      return bloquear('HC_IMPLAUSIBLES',
        'Has introducido ' + dec(hc, 0) + ' g de hidratos. Eso supera el limite de seguridad de ' +
        LIMITES.hc_max + ' g y casi seguro es una errata. Revisa la comida.');
    }
    res.hc_g = hc;

    /* --- glucemia ------------------------------------------------------- */
    var g = num(entrada.glucosa);
    if (g !== null && (g < LIMITES.glucosa_min || g > LIMITES.glucosa_max)) {
      return bloquear('GLUCOSA_IMPLAUSIBLE',
        'La glucemia de ' + dec(g, 0) + ' mg/dL esta fuera del rango medible (' +
        LIMITES.glucosa_min + '-' + LIMITES.glucosa_max + '). Vuelve a mirar el medidor.');
    }
    res.glucosa = g;

    /* --- HIPOGLUCEMIA: se para todo ------------------------------------- */
    if (g !== null && a.umbral_hipo !== null && g < a.umbral_hipo) {
      return bloquear('HIPOGLUCEMIA',
        'Glucemia de ' + dec(g, 0) + ' mg/dL: estas en hipoglucemia (por debajo de ' +
        a.umbral_hipo + '). NO se calcula insulina. Trata primero la hipoglucemia segun la pauta ' +
        'de tu medico y vuelve a medir antes de pincharte.');
    }

    /* --- momento del dia, ratio y FSI ----------------------------------- */
    var momento = entrada.momento || momentoAhora();
    var p = parametrosDelMomento(a, momento);
    res.momento = p.momento || momento;
    res.ratio = p.ratio;
    res.fsi = p.fsi;

    var necesitaCorreccion = (g !== null);
    var errAjustes = validarAjustes(a, p, necesitaCorreccion);
    if (errAjustes) return bloquear(errAjustes.codigo, errAjustes.mensaje);

    /* --- bolo de comida -------------------------------------------------- */
    res.bolo_comida = hc / p.ratio;
    res.desglose.push({
      concepto: 'Bolo de la comida',
      formula: dec(hc, 0) + ' g HC / ' + p.ratio + ' g/U',
      valor: dec(res.bolo_comida, 2)
    });

    /* --- bolo de correccion ---------------------------------------------- */
    if (necesitaCorreccion) {
      var corr = (g - a.objetivo) / p.fsi;
      if (corr < 0 && !a.permitir_correccion_negativa) {
        avisar('info', 'CORRECCION_NEGATIVA_ANULADA',
          'Estas por debajo del objetivo, pero la resta por glucemia baja esta desactivada en Ajustes.');
        corr = 0;
      }
      res.bolo_correccion = corr;
      res.desglose.push({
        concepto: 'Correccion por glucemia',
        formula: '(' + dec(g, 0) + ' - ' + a.objetivo + ') mg/dL / ' + p.fsi + ' mg/dL/U',
        valor: dec(corr, 2)
      });
      if (corr < 0) {
        avisar('aviso', 'CORRECCION_NEGATIVA',
          'Estas por debajo del objetivo (' + dec(g, 0) + ' < ' + a.objetivo +
          '), asi que se resta insulina del bolo de la comida.');
      }
      if (a.umbral_alto !== null && g > a.umbral_alto) {
        avisar('aviso', 'GLUCOSA_ALTA',
          'Glucemia de ' + dec(g, 0) + ' mg/dL. Por encima de ' + a.umbral_alto +
          ' conviene mirar cetonas y seguir la pauta que te haya dado tu medico.');
      }
      if (g >= a.umbral_hipo && g < a.objetivo - 10) {
        avisar('aviso', 'GLUCOSA_BAJA',
          'Glucemia de ' + dec(g, 0) + ' mg/dL: baja aunque no sea hipoglucemia. Ten cuidado y ' +
          'vuelve a medir despues de comer.');
      }
    } else {
      res.desglose.push({
        concepto: 'Correccion por glucemia',
        formula: 'sin glucemia introducida',
        valor: 0
      });
      avisar('info', 'SIN_GLUCOSA',
        'No has introducido la glucemia, asi que solo se ha calculado el bolo de la comida, sin correccion.');
    }

    /* --- insulina activa ------------------------------------------------- */
    var iob = num(entrada.iob_u) || 0;
    if (iob < 0) iob = 0;
    res.iob_u = dec(iob, 2);
    if (iob > 0) {
      if (a.restar_iob) {
        res.iob_restada = iob;
        res.desglose.push({
          concepto: 'Insulina activa que se resta',
          formula: 'quedan ' + dec(iob, 2) + ' U de pinchazos recientes',
          valor: -dec(iob, 2)
        });
        avisar('info', 'IOB_RESTADA',
          'Se han restado ' + dec(iob, 2) + ' U de insulina que todavia esta actuando.');
      } else {
        avisar('aviso', 'IOB_PRESENTE',
          'Cuidado: quedan unas ' + dec(iob, 2) + ' U de insulina rapida actuando de un pinchazo ' +
          'reciente. La aplicacion NO las ha restado. Si vas a corregir, valoralo con tu medico.');
      }
    }

    /* --- total ----------------------------------------------------------- */
    var bruto = res.bolo_comida + res.bolo_correccion - res.iob_restada;
    if (bruto < 0) {
      avisar('aviso', 'TOTAL_NEGATIVO',
        'El calculo sale negativo: la comida no cubre lo baja que tienes la glucemia. ' +
        'La dosis queda en 0 U. Valora tomar algo de hidratos sin pincharte.');
      bruto = 0;
    }
    res.total_bruto = dec(bruto, 2);
    res.desglose.push({
      concepto: 'Total antes de redondear',
      formula: 'suma de lo anterior',
      valor: dec(bruto, 2)
    });

    var total = redondear(bruto, a.paso, a.redondeo);
    res.total = total;
    res.desglose.push({
      concepto: 'Dosis a pinchar',
      formula: 'redondeado ' + (a.redondeo === 'abajo' ? 'hacia abajo' : 'al mas cercano') +
               ' en pasos de ' + a.paso + ' U',
      valor: total
    });

    /* --- topes de seguridad ---------------------------------------------- */
    if (total > LIMITES.dosis_absoluta_max) {
      return bloquear('DOSIS_ABSURDA',
        'El calculo da ' + total + ' U, por encima del tope absoluto de ' +
        LIMITES.dosis_absoluta_max + ' U. Hay algo mal en los datos. NO te pinches: revisa los ajustes.');
    }
    if (a.max_u !== null && total > a.max_u) {
      res.ok = false;
      res.bloqueo = {
        codigo: 'SUPERA_MAXIMO',
        mensaje: 'El calculo da ' + total + ' U, mas que tu maximo de seguridad de ' + a.max_u +
                 ' U por pinchazo. Comprueba los hidratos y la glucemia. Si de verdad es correcto, ' +
                 'confirmalo expresamente o consulta con tu medico.',
        confirmable: true
      };
      return res;
    }

    if (hc > LIMITES.hc_aviso) {
      avisar('aviso', 'HC_ALTOS',
        dec(hc, 0) + ' g de hidratos es una comida muy grande. Comprueba que no te hayas equivocado.');
    }
    if (total === 0) {
      avisar('info', 'TOTAL_CERO',
        'El calculo da 0 U: no hace falta insulina rapida para esto.');
    }

    res.ok = true;
    return res;
  }

  /* ------------------------------------------------------------------ export */

  root.Bolus = {
    calcular: calcular,
    redondear: redondear,
    iobDeDosis: iobDeDosis,
    iobTotal: iobTotal,
    momentoPorHora: momentoPorHora,
    momentoAhora: momentoAhora,
    normalizarAjustes: normalizarAjustes,
    parametrosDelMomento: parametrosDelMomento,
    num: num,
    dec: dec,
    AJUSTES_DEFECTO: AJUSTES_DEFECTO,
    LIMITES: LIMITES,
    MOMENTOS: MOMENTOS
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
