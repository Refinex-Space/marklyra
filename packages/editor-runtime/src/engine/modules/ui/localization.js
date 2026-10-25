// ui/localization.
// SystemJS module d. Dependencies: e.
$__System.registerDynamic('d', ['e'], !0, function (e, t, n) {
  this || self;
  !(function (e) {
    var t;
    (t = function (e) {
      return e;
    }),
      (e.defaultLanguage = t(
        navigator.languages && navigator.languages.length > 0
          ? navigator.languages[0]
          : navigator.language || navigator.userLanguage,
      )),
      (e.localize = function (n, i) {
        var r, o, a, s, l, c, d, u, h, p, f, m, g, v, y, b, w, x;
        return (
          null == i && (i = {}),
          (x = this),
          (s = {}),
          (a = i.fileExtension || 'json'),
          (o = e.Deferred()),
          (d = function (e, t, n) {
            switch ((null == n && (n = 1), n)) {
              case 1:
                return (s = {}), l(t + '.lproj/' + e + '.' + a, e, t, n);
              default:
                return o.resolve();
            }
          }),
          (l = function (t, n, r, o) {
            var a, l, c;
            return (
              null != i.pathPrefix && (t = i.pathPrefix + '/' + t),
              (c = function (t) {
                return e.extend(s, t), g(s), d(n, r, o + 1);
              }),
              (l = function () {
                return 2 === o && r.indexOf('-') > -1
                  ? d(n, r, o + 1)
                  : i.fallback && i.fallback !== r
                    ? d(n, i.fallback)
                    : void 0;
              }),
              e.localize.data[n]
                ? c(e.localize.data[n])
                : ((a = {
                    url: t,
                    dataType: 'json',
                    async: !0,
                    timeout: null != i.timeout ? i.timeout : 500,
                    success: c,
                    error: l,
                  }),
                  'file:' === window.location.protocol &&
                    (a.error = function (t) {
                      return c(t.responseText ? e.parseJSON(t.responseText) : {});
                    }),
                  e.ajax(a))
            );
          }),
          (g = function (e) {
            return null != i.callback ? i.callback(e, r) : r(e);
          }),
          (r = function (t) {
            return (
              (e.localize.data[n] = t),
              x.each(function () {
                var n, i, r;
                if (
                  ((i = (
                    (n = e(this)).data('localize') ||
                    n.data('afterContent') ||
                    n.attr('marklyra-hint') ||
                    ''
                  ).replace(/\\n/g, '\n')),
                  (r = w(i, t)))
                )
                  return u(n, i, r);
              })
            );
          }),
          (u = function (t, n, i) {
            if (
              (t.is('input')
                ? f(t, n, i)
                : t.is('textarea')
                  ? f(t, n, i)
                  : t.is('img')
                    ? p(t, n, i)
                    : t.is('optgroup') && m(t, n, i),
              t[0].hasAttribute('data-after-content'))
            )
              t.attr('data-after-content', i);
            else if (t[0].hasAttribute('marklyra-hint'))
              t.attr('marklyra-hint', i).attr('aria-label', i);
            else if (t[0].hasAttribute('data-lt')) t.html(i);
            else {
              if (e.isPlainObject(i)) return h(t, i);
              t.text(i);
            }
          }),
          (f = function (t, n, i) {
            var r;
            if (((r = e.isPlainObject(i) ? i.value : i), t.is('[placeholder]')))
              return t.attr('placeholder', r);
          }),
          (h = function (e, t) {
            return y(e, 'title', t), b(e, 'text', t);
          }),
          (m = function (e, t, n) {
            return e.attr('label', n);
          }),
          (p = function (e, t, n) {
            return y(e, 'alt', n), y(e, 'src', n);
          }),
          (w = function (e, t) {
            if (!e) return '';
            if (t[e]) return t[e];
            return /((\.\.\.)|(…))$/.exec(e)
              ? (t[(e = e.replace(/((\.\.\.)|(…))$/, ''))] || e) + '…'
              : e;
          }),
          (y = function (e, t, n) {
            if (null != (n = w(t, n))) return e.attr(t, n);
          }),
          (b = function (e, t, n) {
            if (null != (n = w(t, n))) return e.text(n);
          }),
          (v = function (e) {
            var t;
            return 'string' == typeof e
              ? '^' + e + '$'
              : null != e.length
                ? (function () {
                    var n, i, r;
                    for (r = [], n = 0, i = e.length; n < i; n++) (t = e[n]), r.push(v(t));
                    return r;
                  })().join('|')
                : e;
          }),
          (c = t(i.language ? i.language : e.defaultLanguage)),
          i.skipLanguage && c.match(v(i.skipLanguage)) ? o.resolve() : d(n, c, 1),
          (x.localizePromise = o),
          x
        );
      }),
      (e.fn.localize = e.localize),
      (e.localize.getString = function (t, n) {
        let i = e.localize.data[n || 'Front'] || {};
        return t
          ? i[t]
            ? i[t]
            : /((\.\.\.)|(…))$/.exec(t)
              ? (i[(t = t.replace(/((\.\.\.)|(…))$/, ''))] || t) + '…'
              : t
          : '';
      }),
      (e.localize.isLoaded = function (t) {
        return !!e.localize.data[t || 'Front'];
      }),
      (e.localize.data = {});
  })(e('e'));
});
