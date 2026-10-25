// codemirror/lint.
// SystemJS module 24. Dependencies: 20.
$__System.registerDynamic('24', ['20'], !0, function (e, t, n) {
  this || self;
  var i = e('20'),
    r = 'CodeMirror-lint-markers';
  function o(e) {
    e.parentNode && e.parentNode.removeChild(e);
  }
  function a(e, t, n) {
    var r = (function (e, t) {
      var n = document.createElement('div');
      function r(e) {
        if (!n.parentNode) return i.off(document, 'mousemove', r);
        (n.style.top = Math.max(0, e.clientY - n.offsetHeight - 5) + 'px'),
          (n.style.left = e.clientX + 5 + 'px');
      }
      return (
        (n.className = 'CodeMirror-lint-tooltip'),
        n.appendChild(t.cloneNode(!0)),
        document.body.appendChild(n),
        i.on(document, 'mousemove', r),
        r(e),
        null != n.style.opacity && (n.style.opacity = 1),
        n
      );
    })(e, t);
    function a() {
      var e;
      i.off(n, 'mouseout', a),
        r &&
          ((e = r).parentNode &&
            (null == e.style.opacity && o(e),
            (e.style.opacity = 0),
            setTimeout(function () {
              o(e);
            }, 600)),
          (r = null));
    }
    var s = setInterval(function () {
      if (r)
        for (var e = n; ; e = e.parentNode) {
          if ((e && 11 == e.nodeType && (e = e.host), e == document.body)) return;
          if (!e) {
            a();
            break;
          }
        }
      if (!r) return clearInterval(s);
    }, 400);
    i.on(n, 'mouseout', a);
  }
  function s(e, t, n) {
    (this.marked = []),
      (this.options = t),
      (this.timeout = null),
      (this.hasGutter = n),
      (this.onMouseOver = function (t) {
        !(function (e, t) {
          var n = t.target || t.srcElement;
          if (!/\bCodeMirror-lint-mark-/.test(n.className)) return;
          for (
            var i = n.getBoundingClientRect(),
              r = (i.left + i.right) / 2,
              o = (i.top + i.bottom) / 2,
              s = e.findMarksAt(e.coordsChar({ left: r, top: o }, 'client')),
              l = [],
              c = 0;
            c < s.length;
            ++c
          ) {
            var u = s[c].__annotation;
            u && l.push(u);
          }
          l.length &&
            (function (e, t) {
              for (
                var n = t.target || t.srcElement, i = document.createDocumentFragment(), r = 0;
                r < e.length;
                r++
              ) {
                var o = e[r];
                i.appendChild(d(o));
              }
              a(t, i, n);
            })(l, t);
        })(e, t);
      }),
      (this.waitingFor = 0);
  }
  function l(e) {
    var t = e.state.lint;
    t.hasGutter && e.clearGutter(r);
    for (var n = 0; n < t.marked.length; ++n) t.marked[n].clear();
    t.marked.length = 0;
  }
  function c(e, t, n, r) {
    var o = document.createElement('div'),
      s = o;
    return (
      (o.className = 'CodeMirror-lint-marker-' + t),
      n &&
        ((s = o.appendChild(document.createElement('div'))).className =
          'CodeMirror-lint-marker-multiple'),
      0 != r &&
        i.on(s, 'mouseover', function (t) {
          a(t, e, s);
        }),
      o
    );
  }
  function d(e) {
    var t = e.severity;
    t || (t = 'error');
    var n = document.createElement('div');
    return (
      (n.className = 'CodeMirror-lint-message-' + t),
      n.appendChild(document.createTextNode(e.message)),
      n
    );
  }
  function u(e) {
    var t = e.state.lint.options,
      n = t.options || t,
      r = t.getAnnotations || e.getHelper(i.Pos(0, 0), 'lint');
    if (r)
      if (t.async || r.async)
        !(function (e, t, n) {
          var r = e.state.lint,
            o = ++r.waitingFor;
          function a() {
            (o = -1), e.off('change', a);
          }
          e.on('change', a),
            t(
              e.getValue(),
              function (t, n) {
                e.off('change', a), r.waitingFor == o && (n && t instanceof i && (t = n), h(e, t));
              },
              n,
              e,
            );
        })(e, r, n);
      else {
        var o = r(e.getValue(), n, e);
        if (!o) return;
        o.then
          ? o.then(function (t) {
              h(e, t);
            })
          : h(e, o);
      }
  }
  function h(e, t) {
    l(e);
    for (
      var n,
        i = e.state.lint,
        o = i.options,
        a = (function (e) {
          for (var t = [], n = 0; n < e.length; ++n) {
            var i = e[n],
              r = i.from.line;
            (t[r] || (t[r] = [])).push(i);
          }
          return t;
        })(t),
        s = 0;
      s < a.length;
      ++s
    ) {
      var u = a[s];
      if (u) {
        for (
          var h = null, p = i.hasGutter && document.createDocumentFragment(), f = 0;
          f < u.length;
          ++f
        ) {
          var m = u[f],
            g = m.severity;
          g || (g = 'error'),
            (h = 'error' == (n = h) ? n : g),
            o.formatAnnotation && (m = o.formatAnnotation(m)),
            i.hasGutter && p.appendChild(d(m)),
            m.to &&
              i.marked.push(
                e.markText(m.from, m.to, {
                  className: 'CodeMirror-lint-mark-' + g,
                  __annotation: m,
                }),
              );
        }
        i.hasGutter && e.setGutterMarker(s, r, c(p, h, u.length > 1, i.options.tooltips));
      }
    }
    o.onUpdateLinting && o.onUpdateLinting(t, a, e);
  }
  function p(e) {
    var t = e.state.lint;
    t &&
      (clearTimeout(t.timeout),
      (t.timeout = setTimeout(function () {
        u(e);
      }, t.options.delay || 500)));
  }
  i.defineOption('lint', !1, function (e, t, n) {
    if (
      (n &&
        n != i.Init &&
        (l(e),
        !1 !== e.state.lint.options.lintOnChange && e.off('change', p),
        i.off(e.getWrapperElement(), 'mouseover', e.state.lint.onMouseOver),
        clearTimeout(e.state.lint.timeout),
        delete e.state.lint),
      t)
    ) {
      for (var o = e.getOption('gutters'), a = !1, c = 0; c < o.length; ++c) o[c] == r && (a = !0);
      var d = (e.state.lint = new s(
        e,
        (h = t) instanceof Function ? { getAnnotations: h } : ((h && !0 !== h) || (h = {}), h),
        a,
      ));
      !1 !== d.options.lintOnChange && e.on('change', p),
        0 != d.options.tooltips &&
          'gutter' != d.options.tooltips &&
          i.on(e.getWrapperElement(), 'mouseover', d.onMouseOver),
        u(e);
    }
    var h;
  }),
    i.defineExtension('performLint', function () {
      this.state.lint && u(this);
    }),
    (i.clearMarks = l),
    (i.updateLinting = h);
});
