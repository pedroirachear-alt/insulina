/* ---------------------------------------------------------------------------
 * SERVICE WORKER
 * ---------------------------------------------------------------------------
 * Guarda la aplicacion entera en el telefono para que funcione SIN CONEXION.
 * No es un adorno: hace falta calcular la dosis en un restaurante con mala
 * cobertura, en el campo o con los datos agotados.
 *
 * Estrategia:
 *   - navegacion (abrir la aplicacion): red primero, y si falla, la copia
 *     guardada. Asi una version nueva entra en cuanto hay conexion.
 *   - todo lo demas: copia guardada primero, que es instantanea, y se
 *     refresca en segundo plano.
 *
 * Al subir una version nueva hay que cambiar VERSION: es lo que fuerza a
 * tirar la cache vieja.
 * ------------------------------------------------------------------------- */

var VERSION = 'insulina-v1.0.0';

var ARCHIVOS = [
  './',
  'index.html',
  'app.css',
  'manifest.webmanifest',
  'data/alimentos.js',
  'js/bolus.js',
  'js/foods.js',
  'js/parser.js',
  'js/store.js',
  'js/voice.js',
  'js/llm.js',
  'js/app.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png'
];

self.addEventListener('install', function (ev) {
  ev.waitUntil(
    caches.open(VERSION).then(function (cache) {
      // `addAll` falla en bloque si un solo archivo falla; se piden de uno en
      // uno para que un fallo suelto no deje la aplicacion sin cache.
      return Promise.all(ARCHIVOS.map(function (url) {
        return cache.add(new Request(url, { cache: 'reload' })).catch(function () {
          return null;
        });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(
    caches.keys().then(function (nombres) {
      return Promise.all(nombres.map(function (n) {
        return n === VERSION ? null : caches.delete(n);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (ev) {
  var pet = ev.request;
  if (pet.method !== 'GET') return;

  var url = new URL(pet.url);
  // Nada de cachear otros dominios: si se activa la ayuda con IA, sus
  // peticiones van siempre a la red.
  if (url.origin !== self.location.origin) return;

  if (pet.mode === 'navigate') {
    ev.respondWith(
      fetch(pet).then(function (r) {
        var copia = r.clone();
        caches.open(VERSION).then(function (c) { c.put(pet, copia); });
        return r;
      }).catch(function () {
        return caches.match(pet).then(function (r) {
          return r || caches.match('index.html') || caches.match('./');
        });
      })
    );
    return;
  }

  ev.respondWith(
    caches.match(pet).then(function (guardado) {
      var red = fetch(pet).then(function (r) {
        if (r && r.ok) {
          var copia = r.clone();
          caches.open(VERSION).then(function (c) { c.put(pet, copia); });
        }
        return r;
      }).catch(function () { return guardado; });
      return guardado || red;
    })
  );
});
