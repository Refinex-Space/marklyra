// Classic SystemJS loader and startup shell.
// The build replaces the expression slot in place; module factories share this scope.
!(function (e) {
  function t(e) {
    Object.defineProperty(this, e, {
      enumerable: !0,
      get: function () {
        return this[h][e];
      },
    });
  }
  function n(e) {
    if (
      'undefined' != typeof System && System.isModule
        ? System.isModule(e)
        : '[object Module]' === Object.prototype.toString.call(e)
    )
      return e;
    var t = { default: e, __useDefault: e };
    if (e && e.__esModule) for (var n in e) Object.hasOwnProperty.call(e, n) && (t[n] = e[n]);
    return new i(t);
  }
  function i(e) {
    Object.defineProperty(this, h, { value: e }), Object.keys(e).forEach(t, this);
  }
  function r(e) {
    return '@node/' === e.substr(0, 6) ? d(e, n(p(e.substr(6)))) : u[e];
  }
  function o(e) {
    var t = r(e);
    if (!t) throw new Error('Module "' + e + '" expected, but not contained in build.');
    if (t.module) return t.module;
    var n = t.linkRecord;
    return (
      (function e(t, n) {
        if (!n.depLoads) {
          n.declare && a(t, n), (n.depLoads = []);
          for (var i = 0; i < n.deps.length; i++) {
            var o = r(n.deps[i]);
            n.depLoads.push(o), o.linkRecord && e(o, o.linkRecord);
            var s = n.setters && n.setters[i];
            s && (s(o.module || o.linkRecord.moduleObj), o.importerSetters.push(s));
          }
          return t;
        }
      })(t, n),
      c(t, n, []),
      t.module
    );
  }
  function a(t, n) {
    var i = n.moduleObj,
      r = t.importerSetters,
      o = !1,
      a = n.declare.call(
        e,
        function (e, t) {
          if (!o) {
            if ('object' == typeof e) for (var n in e) '__useDefault' !== n && (i[n] = e[n]);
            else i[e] = t;
            o = !0;
            for (var a = 0; a < r.length; a++) r[a](i);
            return (o = !1), t;
          }
        },
        { id: t.key },
      );
    'function' != typeof a
      ? ((n.setters = a.setters), (n.execute = a.execute))
      : ((n.setters = []), (n.execute = a));
  }
  function s(e, t, n) {
    return (u[e] = {
      key: e,
      module: void 0,
      importerSetters: [],
      linkRecord: {
        deps: t,
        depLoads: void 0,
        declare: n,
        setters: void 0,
        execute: void 0,
        moduleObj: {},
      },
    });
  }
  function l(e, t, n, i) {
    var r = {};
    return (u[e] = {
      key: e,
      module: void 0,
      importerSetters: [],
      linkRecord: {
        deps: t,
        depLoads: void 0,
        declare: void 0,
        execute: i,
        executingRequire: n,
        moduleObj: { default: r, __useDefault: r },
        setters: void 0,
      },
    });
  }
  function c(t, n, r) {
    if ((r.push(t), t.module)) return t.module;
    if (n.setters) {
      for (var o = 0; o < n.deps.length; o++) {
        var a = n.depLoads[o],
          s = a.linkRecord;
        s && -1 === r.indexOf(a) && c(a, s, s.setters ? r : []);
      }
      n.execute.call(f);
    } else {
      var l = { id: t.key },
        d = n.moduleObj;
      Object.defineProperty(l, 'exports', {
        configurable: !0,
        set: function (e) {
          d.default = d.__useDefault = e;
        },
        get: function () {
          return d.__useDefault;
        },
      });
      var u = (function (e, t, n) {
        return function (i) {
          for (var r = 0; r < e.length; r++)
            if (e[r] === i) {
              var o,
                a = t[r],
                s = a.linkRecord;
              return '__useDefault' in
                (o = s ? (-1 === n.indexOf(a) ? c(a, s, n) : s.moduleObj) : a.module)
                ? o.__useDefault
                : o;
            }
        };
      })(n.deps, n.depLoads, r);
      if (!n.executingRequire) for (o = 0; o < n.deps.length; o++) u(n.deps[o]);
      var h = n.execute.call(e, u, d.__useDefault, l);
      void 0 !== h
        ? (d.default = d.__useDefault = h)
        : l.exports !== d.__useDefault && (d.default = d.__useDefault = l.exports);
      var p = d.__useDefault;
      if (p && p.__esModule) for (var m in p) Object.hasOwnProperty.call(p, m) && (d[m] = p[m]);
    }
    l = t.module = new i(n.moduleObj);
    if (!n.setters) for (o = 0; o < t.importerSetters.length; o++) t.importerSetters[o](l);
    return l;
  }
  function d(e, t) {
    return (u[e] = { key: e, module: t, importerSetters: [], linkRecord: void 0 });
  }
  var u = {},
    h = 'undefined' != typeof Symbol ? Symbol() : '@@baseObject';
  (i.prototype = Object.create(null)),
    'undefined' != typeof Symbol &&
      Symbol.toStringTag &&
      (i.prototype[Symbol.toStringTag] = 'Module');
  var p =
      ('undefined' != typeof System && System._nodeRequire) ||
      ('undefined' != typeof require &&
        void 0 !== require.resolve &&
        'undefined' != typeof process &&
        process.platform &&
        require),
    f = {};
  return (
    Object.freeze && Object.freeze(f),
    function (e, t, r, a) {
      return function (c) {
        c(function (c) {
          var h = {
            _nodeRequire: p,
            register: s,
            registerDynamic: l,
            registry: {
              get: function (e) {
                return u[e].module;
              },
              set: d,
            },
            newModule: function (e) {
              return new i(e);
            },
          };
          d('@empty', new i({}));
          for (var f = 0; f < t.length; f++) d(t[f], n(arguments[f]));
          a(h);
          var m = o(e[0]);
          if (e.length > 1) for (f = 1; f < e.length; f++) o(e[f]);
          return r
            ? m.__useDefault
            : (m instanceof i && Object.defineProperty(m, '__esModule', { value: !0 }), m);
        });
      };
    }
  );
})('undefined' != typeof self ? self : 'undefined' != typeof global ? global : this)(
  ['a'],
  [],
  !0,
  function ($__System) {
    var require = this.require,
      exports = this.exports,
      module = this.module,
      f,
      factory;
    __MARKLYRA_ENGINE_MODULES__;
  },
)(function (e) {
  'function' == typeof define && define.amd
    ? define([], e)
    : 'object' == typeof module && module.exports && 'function' == typeof require
      ? (module.exports = e())
      : e();
});
