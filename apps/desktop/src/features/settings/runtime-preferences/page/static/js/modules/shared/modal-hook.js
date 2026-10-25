// Webpack module 19: modal-hook.
// Registration order and sparse array indices are defined in bundles.json.
(function (e, t, n) {
  'use strict';
  var r =
      (this && this.__assign) ||
      function () {
        return (r =
          Object.assign ||
          function (e) {
            for (var t, n = 1, r = arguments.length; n < r; n++)
              for (var o in (t = arguments[n]))
                Object.prototype.hasOwnProperty.call(t, o) && (e[o] = t[o]);
            return e;
          }).apply(this, arguments);
      },
    o =
      (this && this.__rest) ||
      function (e, t) {
        var n = {};
        for (var r in e)
          Object.prototype.hasOwnProperty.call(e, r) && t.indexOf(r) < 0 && (n[r] = e[r]);
        if (null != e && 'function' === typeof Object.getOwnPropertySymbols) {
          var o = 0;
          for (r = Object.getOwnPropertySymbols(e); o < r.length; o++)
            t.indexOf(r[o]) < 0 &&
              Object.prototype.propertyIsEnumerable.call(e, r[o]) &&
              (n[r[o]] = e[r[o]]);
        }
        return n;
      },
    i =
      (this && this.__importDefault) ||
      function (e) {
        return e && e.__esModule ? e : { default: e };
      };
  Object.defineProperty(t, '__esModule', { value: !0 });
  var l = n(0),
    a = n(10),
    u = i(n(47));
  (t.errorMessage1 =
    'You must either add a `ref` to the element you are interacting with or pass an `event` to openPortal(e) or togglePortal(e).'),
    (t.default = function (e) {
      void 0 === e && (e = {});
      var n = e.closeOnOutsideClick,
        i = void 0 === n || n,
        c = e.closeOnEsc,
        s = void 0 === c || c,
        f = e.bindTo,
        d = e.isOpen,
        p = void 0 !== d && d,
        h = e.onOpen,
        m = e.onClose,
        y = e.onPortalClick,
        v = o(e, [
          'closeOnOutsideClick',
          'closeOnEsc',
          'bindTo',
          'isOpen',
          'onOpen',
          'onClose',
          'onPortalClick',
        ]),
        g = u.default(),
        b = g.isServer,
        w = g.isBrowser,
        k = l.useState(p),
        E = k[0],
        x = k[1],
        T = l.useRef(E),
        S = l.useCallback(function (e) {
          (T.current = e), x(e);
        }, []),
        C = l.useRef(),
        _ = l.useRef(w ? document.createElement('div') : null);
      l.useEffect(
        function () {
          w && !_.current && (_.current = document.createElement('div'));
        },
        [w, _],
      );
      var P = l.useMemo(
          function () {
            if (!b) return (f && a.findDOMNode(f)) || document.body;
          },
          [b, f],
        ),
        O = function (e) {
          if (!e) return { portal: _, targetEl: C, event: e };
          var t = e || {};
          t.persist && t.persist(), (t.portal = _), (t.targetEl = C), (t.event = e);
          var n = e.currentTarget;
          return !C.current && n && n !== document && (C.current = t.currentTarget), t;
        },
        N = Object.entries(v).reduce(function (e, t) {
          var n = t[0],
            r = t[1];
          return (
            (e[n] = function (e) {
              b || r(O(e));
            }),
            e
          );
        }, {}),
        R = l.useCallback(
          function (e) {
            if (!b) {
              var n = O(e);
              if (null == C.current)
                throw (
                  (setTimeout(function () {
                    return S(!0);
                  }, 0),
                  Error(t.errorMessage1))
                );
              h && h(n), S(!0);
            }
          },
          [b, _, S, C, h],
        ),
        z = l.useCallback(
          function (e) {
            if (!b) {
              var t = O(e);
              m && T.current && m(t), T.current && S(!1);
            }
          },
          [b, m, S],
        ),
        I = l.useCallback(
          function (e) {
            return T.current ? z(e) : R(e);
          },
          [z, R],
        ),
        M = l.useCallback(
          function (e) {
            return 'Escape' === e.key && s ? z(e) : void 0;
          },
          [s, z],
        ),
        D = l.useCallback(
          function (e) {
            var t = function (t) {
              return t.current.contains(e.target);
            };
            t(_) || 0 !== e.button || !T.current || t(C) || (i && z(e));
          },
          [b, z, i, _],
        ),
        j = l.useCallback(
          function (e) {
            if (!b && _.current instanceof HTMLElement) {
              var t = O(e);
              _.current.contains(t.target) && y && y(t), D(e);
            }
          },
          [D],
        ),
        A = l.useRef({});
      l.useEffect(
        function () {
          if (!b && P instanceof HTMLElement && _.current instanceof HTMLElement) {
            var e = { onScroll: 'scroll', onWheel: 'wheel' },
              t = _.current;
            return (
              P.appendChild(_.current),
              Object.entries(e).forEach(function (e) {
                var t = e[0],
                  n = e[1];
                v[t] &&
                  ((A.current[t] = function (e) {
                    return v[t](O(e));
                  }),
                  document.addEventListener(n, A.current[t]));
              }),
              document.addEventListener('keydown', M),
              document.addEventListener('mousedown', j),
              function () {
                Object.entries(e).forEach(function (e) {
                  var t = e[0],
                    n = e[1];
                  v[t] && (document.removeEventListener(n, A.current[t]), delete A.current[t]);
                }),
                  document.removeEventListener('keydown', M),
                  document.removeEventListener('mousedown', j),
                  P.removeChild(t);
              }
            );
          }
        },
        [b, D, M, P, _],
      );
      var L = l.useCallback(
        function (e) {
          var t = e.children;
          return null != _.current ? a.createPortal(t, _.current) : null;
        },
        [_],
      );
      return Object.assign(
        [R, z, T.current, L, I, C, _],
        r(
          r(
            {
              isOpen: T.current,
              openPortal: R,
              ref: C,
              closePortal: z,
              togglePortal: I,
              Portal: L,
              portalRef: _,
            },
            N,
          ),
          { bind: r({ ref: C }, N) },
        ),
      );
    });
});
