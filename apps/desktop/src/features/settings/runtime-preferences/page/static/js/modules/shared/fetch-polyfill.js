// Webpack module 22: fetch-polyfill.
// Registration order and sparse array indices are defined in bundles.json.
(function (e, t, n) {
  'use strict';
  n.d(t, 'a', function () {
    return _;
  });
  var r =
      ('undefined' !== typeof globalThis && globalThis) ||
      ('undefined' !== typeof self && self) ||
      ('undefined' !== typeof r && r),
    o = 'URLSearchParams' in r,
    i = 'Symbol' in r && 'iterator' in Symbol,
    l =
      'FileReader' in r &&
      'Blob' in r &&
      (function () {
        try {
          return new Blob(), !0;
        } catch (e) {
          return !1;
        }
      })(),
    a = 'FormData' in r,
    u = 'ArrayBuffer' in r;
  if (u)
    var c = [
        '[object Int8Array]',
        '[object Uint8Array]',
        '[object Uint8ClampedArray]',
        '[object Int16Array]',
        '[object Uint16Array]',
        '[object Int32Array]',
        '[object Uint32Array]',
        '[object Float32Array]',
        '[object Float64Array]',
      ],
      s =
        ArrayBuffer.isView ||
        function (e) {
          return e && c.indexOf(Object.prototype.toString.call(e)) > -1;
        };
  function f(e) {
    if (
      ('string' !== typeof e && (e = String(e)), /[^a-z0-9\-#$%&'*+.^_`|~!]/i.test(e) || '' === e)
    )
      throw new TypeError('Invalid character in header field name');
    return e.toLowerCase();
  }
  function d(e) {
    return 'string' !== typeof e && (e = String(e)), e;
  }
  function p(e) {
    var t = {
      next: function () {
        var t = e.shift();
        return { done: void 0 === t, value: t };
      },
    };
    return (
      i &&
        (t[Symbol.iterator] = function () {
          return t;
        }),
      t
    );
  }
  function h(e) {
    (this.map = {}),
      e instanceof h
        ? e.forEach(function (e, t) {
            this.append(t, e);
          }, this)
        : Array.isArray(e)
          ? e.forEach(function (e) {
              this.append(e[0], e[1]);
            }, this)
          : e &&
            Object.getOwnPropertyNames(e).forEach(function (t) {
              this.append(t, e[t]);
            }, this);
  }
  function m(e) {
    if (e.bodyUsed) return Promise.reject(new TypeError('Already read'));
    e.bodyUsed = !0;
  }
  function y(e) {
    return new Promise(function (t, n) {
      (e.onload = function () {
        t(e.result);
      }),
        (e.onerror = function () {
          n(e.error);
        });
    });
  }
  function v(e) {
    var t = new FileReader(),
      n = y(t);
    return t.readAsArrayBuffer(e), n;
  }
  function g(e) {
    if (e.slice) return e.slice(0);
    var t = new Uint8Array(e.byteLength);
    return t.set(new Uint8Array(e)), t.buffer;
  }
  function b() {
    return (
      (this.bodyUsed = !1),
      (this._initBody = function (e) {
        var t;
        (this.bodyUsed = this.bodyUsed),
          (this._bodyInit = e),
          e
            ? 'string' === typeof e
              ? (this._bodyText = e)
              : l && Blob.prototype.isPrototypeOf(e)
                ? (this._bodyBlob = e)
                : a && FormData.prototype.isPrototypeOf(e)
                  ? (this._bodyFormData = e)
                  : o && URLSearchParams.prototype.isPrototypeOf(e)
                    ? (this._bodyText = e.toString())
                    : u && l && (t = e) && DataView.prototype.isPrototypeOf(t)
                      ? ((this._bodyArrayBuffer = g(e.buffer)),
                        (this._bodyInit = new Blob([this._bodyArrayBuffer])))
                      : u && (ArrayBuffer.prototype.isPrototypeOf(e) || s(e))
                        ? (this._bodyArrayBuffer = g(e))
                        : (this._bodyText = e = Object.prototype.toString.call(e))
            : (this._bodyText = ''),
          this.headers.get('content-type') ||
            ('string' === typeof e
              ? this.headers.set('content-type', 'text/plain;charset=UTF-8')
              : this._bodyBlob && this._bodyBlob.type
                ? this.headers.set('content-type', this._bodyBlob.type)
                : o &&
                  URLSearchParams.prototype.isPrototypeOf(e) &&
                  this.headers.set(
                    'content-type',
                    'application/x-www-form-urlencoded;charset=UTF-8',
                  ));
      }),
      l &&
        ((this.blob = function () {
          var e = m(this);
          if (e) return e;
          if (this._bodyBlob) return Promise.resolve(this._bodyBlob);
          if (this._bodyArrayBuffer) return Promise.resolve(new Blob([this._bodyArrayBuffer]));
          if (this._bodyFormData) throw new Error('could not read FormData body as blob');
          return Promise.resolve(new Blob([this._bodyText]));
        }),
        (this.arrayBuffer = function () {
          if (this._bodyArrayBuffer) {
            var e = m(this);
            return (
              e ||
              (ArrayBuffer.isView(this._bodyArrayBuffer)
                ? Promise.resolve(
                    this._bodyArrayBuffer.buffer.slice(
                      this._bodyArrayBuffer.byteOffset,
                      this._bodyArrayBuffer.byteOffset + this._bodyArrayBuffer.byteLength,
                    ),
                  )
                : Promise.resolve(this._bodyArrayBuffer))
            );
          }
          return this.blob().then(v);
        })),
      (this.text = function () {
        var e = m(this);
        if (e) return e;
        if (this._bodyBlob)
          return (function (e) {
            var t = new FileReader(),
              n = y(t);
            return t.readAsText(e), n;
          })(this._bodyBlob);
        if (this._bodyArrayBuffer)
          return Promise.resolve(
            (function (e) {
              for (var t = new Uint8Array(e), n = new Array(t.length), r = 0; r < t.length; r++)
                n[r] = String.fromCharCode(t[r]);
              return n.join('');
            })(this._bodyArrayBuffer),
          );
        if (this._bodyFormData) throw new Error('could not read FormData body as text');
        return Promise.resolve(this._bodyText);
      }),
      a &&
        (this.formData = function () {
          return this.text().then(E);
        }),
      (this.json = function () {
        return this.text().then(JSON.parse);
      }),
      this
    );
  }
  (h.prototype.append = function (e, t) {
    (e = f(e)), (t = d(t));
    var n = this.map[e];
    this.map[e] = n ? n + ', ' + t : t;
  }),
    (h.prototype.delete = function (e) {
      delete this.map[f(e)];
    }),
    (h.prototype.get = function (e) {
      return (e = f(e)), this.has(e) ? this.map[e] : null;
    }),
    (h.prototype.has = function (e) {
      return this.map.hasOwnProperty(f(e));
    }),
    (h.prototype.set = function (e, t) {
      this.map[f(e)] = d(t);
    }),
    (h.prototype.forEach = function (e, t) {
      for (var n in this.map) this.map.hasOwnProperty(n) && e.call(t, this.map[n], n, this);
    }),
    (h.prototype.keys = function () {
      var e = [];
      return (
        this.forEach(function (t, n) {
          e.push(n);
        }),
        p(e)
      );
    }),
    (h.prototype.values = function () {
      var e = [];
      return (
        this.forEach(function (t) {
          e.push(t);
        }),
        p(e)
      );
    }),
    (h.prototype.entries = function () {
      var e = [];
      return (
        this.forEach(function (t, n) {
          e.push([n, t]);
        }),
        p(e)
      );
    }),
    i && (h.prototype[Symbol.iterator] = h.prototype.entries);
  var w = ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'POST', 'PUT'];
  function k(e, t) {
    if (!(this instanceof k))
      throw new TypeError(
        'Please use the "new" operator, this DOM object constructor cannot be called as a function.',
      );
    var n = (t = t || {}).body;
    if (e instanceof k) {
      if (e.bodyUsed) throw new TypeError('Already read');
      (this.url = e.url),
        (this.credentials = e.credentials),
        t.headers || (this.headers = new h(e.headers)),
        (this.method = e.method),
        (this.mode = e.mode),
        (this.signal = e.signal),
        n || null == e._bodyInit || ((n = e._bodyInit), (e.bodyUsed = !0));
    } else this.url = String(e);
    if (
      ((this.credentials = t.credentials || this.credentials || 'same-origin'),
      (!t.headers && this.headers) || (this.headers = new h(t.headers)),
      (this.method = (function (e) {
        var t = e.toUpperCase();
        return w.indexOf(t) > -1 ? t : e;
      })(t.method || this.method || 'GET')),
      (this.mode = t.mode || this.mode || null),
      (this.signal = t.signal || this.signal),
      (this.referrer = null),
      ('GET' === this.method || 'HEAD' === this.method) && n)
    )
      throw new TypeError('Body not allowed for GET or HEAD requests');
    if (
      (this._initBody(n),
      ('GET' === this.method || 'HEAD' === this.method) &&
        ('no-store' === t.cache || 'no-cache' === t.cache))
    ) {
      var r = /([?&])_=[^&]*/;
      if (r.test(this.url)) this.url = this.url.replace(r, '$1_=' + new Date().getTime());
      else {
        this.url += (/\?/.test(this.url) ? '&' : '?') + '_=' + new Date().getTime();
      }
    }
  }
  function E(e) {
    var t = new FormData();
    return (
      e
        .trim()
        .split('&')
        .forEach(function (e) {
          if (e) {
            var n = e.split('='),
              r = n.shift().replace(/\+/g, ' '),
              o = n.join('=').replace(/\+/g, ' ');
            t.append(decodeURIComponent(r), decodeURIComponent(o));
          }
        }),
      t
    );
  }
  function x(e) {
    var t = new h();
    return (
      e
        .replace(/\r?\n[\t ]+/g, ' ')
        .split(/\r?\n/)
        .forEach(function (e) {
          var n = e.split(':'),
            r = n.shift().trim();
          if (r) {
            var o = n.join(':').trim();
            t.append(r, o);
          }
        }),
      t
    );
  }
  function T(e, t) {
    if (!(this instanceof T))
      throw new TypeError(
        'Please use the "new" operator, this DOM object constructor cannot be called as a function.',
      );
    t || (t = {}),
      (this.type = 'default'),
      (this.status = void 0 === t.status ? 200 : t.status),
      (this.ok = this.status >= 200 && this.status < 300),
      (this.statusText = 'statusText' in t ? t.statusText : ''),
      (this.headers = new h(t.headers)),
      (this.url = t.url || ''),
      this._initBody(e);
  }
  (k.prototype.clone = function () {
    return new k(this, { body: this._bodyInit });
  }),
    b.call(k.prototype),
    b.call(T.prototype),
    (T.prototype.clone = function () {
      return new T(this._bodyInit, {
        status: this.status,
        statusText: this.statusText,
        headers: new h(this.headers),
        url: this.url,
      });
    }),
    (T.error = function () {
      var e = new T(null, { status: 0, statusText: '' });
      return (e.type = 'error'), e;
    });
  var S = [301, 302, 303, 307, 308];
  T.redirect = function (e, t) {
    if (-1 === S.indexOf(t)) throw new RangeError('Invalid status code');
    return new T(null, { status: t, headers: { location: e } });
  };
  var C = r.DOMException;
  try {
    new C();
  } catch (P) {
    ((C = function (e, t) {
      (this.message = e), (this.name = t);
      var n = Error(e);
      this.stack = n.stack;
    }).prototype = Object.create(Error.prototype)),
      (C.prototype.constructor = C);
  }
  function _(e, t) {
    return new Promise(function (n, o) {
      var i = new k(e, t);
      if (i.signal && i.signal.aborted) return o(new C('Aborted', 'AbortError'));
      var a = new XMLHttpRequest();
      function c() {
        a.abort();
      }
      (a.onload = function () {
        var e = {
          status: a.status,
          statusText: a.statusText,
          headers: x(a.getAllResponseHeaders() || ''),
        };
        e.url = 'responseURL' in a ? a.responseURL : e.headers.get('X-Request-URL');
        var t = 'response' in a ? a.response : a.responseText;
        setTimeout(function () {
          n(new T(t, e));
        }, 0);
      }),
        (a.onerror = function () {
          setTimeout(function () {
            o(new TypeError('Network request failed'));
          }, 0);
        }),
        (a.ontimeout = function () {
          setTimeout(function () {
            o(new TypeError('Network request failed'));
          }, 0);
        }),
        (a.onabort = function () {
          setTimeout(function () {
            o(new C('Aborted', 'AbortError'));
          }, 0);
        }),
        a.open(
          i.method,
          (function (e) {
            try {
              return '' === e && r.location.href ? r.location.href : e;
            } catch (t) {
              return e;
            }
          })(i.url),
          !0,
        ),
        'include' === i.credentials
          ? (a.withCredentials = !0)
          : 'omit' === i.credentials && (a.withCredentials = !1),
        'responseType' in a &&
          (l
            ? (a.responseType = 'blob')
            : u &&
              i.headers.get('Content-Type') &&
              -1 !== i.headers.get('Content-Type').indexOf('application/octet-stream') &&
              (a.responseType = 'arraybuffer')),
        !t || 'object' !== typeof t.headers || t.headers instanceof h
          ? i.headers.forEach(function (e, t) {
              a.setRequestHeader(t, e);
            })
          : Object.getOwnPropertyNames(t.headers).forEach(function (e) {
              a.setRequestHeader(e, d(t.headers[e]));
            }),
        i.signal &&
          (i.signal.addEventListener('abort', c),
          (a.onreadystatechange = function () {
            4 === a.readyState && i.signal.removeEventListener('abort', c);
          })),
        a.send('undefined' === typeof i._bodyInit ? null : i._bodyInit);
    });
  }
  (_.polyfill = !0), r.fetch || ((r.fetch = _), (r.Headers = h), (r.Request = k), (r.Response = T));
});
