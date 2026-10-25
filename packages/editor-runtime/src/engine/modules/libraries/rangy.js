// libraries/rangy.
// SystemJS module 1d. Dependencies: none.
$__System.registerDynamic('1d', [], !0, function (e, t, n) {
  'use strict';
  this || self;
  var i = (function (e) {
    var t = 'object',
      n = 'function',
      i = 'undefined',
      r = [
        'startContainer',
        'startOffset',
        'endContainer',
        'endOffset',
        'collapsed',
        'commonAncestorContainer',
      ],
      o = [
        'setStart',
        'setStartBefore',
        'setStartAfter',
        'setEnd',
        'setEndBefore',
        'setEndAfter',
        'collapse',
        'selectNode',
        'selectNodeContents',
        'compareBoundaryPoints',
        'deleteContents',
        'extractContents',
        'cloneContents',
        'insertNode',
        'surroundContents',
        'cloneRange',
        'toString',
        'detach',
      ],
      a = ['boundingHeight', 'boundingLeft', 'boundingTop', 'boundingWidth', 'htmlText', 'text'],
      s = [
        'collapse',
        'compareEndPoints',
        'duplicate',
        'moveToElementText',
        'parentElement',
        'select',
        'setEndPoint',
        'getBoundingClientRect',
      ];
    function l(e, i) {
      var r = typeof e[i];
      return r == n || !(r != t || !e[i]) || 'unknown' == r;
    }
    function c(e, n) {
      return !(typeof e[n] != t || !e[n]);
    }
    function d(e, t) {
      return typeof e[t] != i;
    }
    function u(e) {
      return function (t, n) {
        for (var i = n.length; i--; ) if (!e(t, n[i])) return !1;
        return !0;
      };
    }
    var h = u(l),
      p = u(c),
      f = u(d);
    function m(e) {
      return e && h(e, s) && f(e, a);
    }
    function g(e) {
      return c(e, 'body') ? e.body : e.getElementsByTagName('body')[0];
    }
    var v,
      y = {},
      b = {
        version: '1.3alpha.20140716',
        initialized: !1,
        supported: !0,
        util: {
          isHostMethod: l,
          isHostObject: c,
          isHostProperty: d,
          areHostMethods: h,
          areHostObjects: p,
          areHostProperties: f,
          isTextRange: m,
          getBody: g,
        },
        features: {},
        modules: y,
        config: { alertOnFail: !0, alertOnWarn: !1, preferTextRange: !1 },
      };
    function w(e) {
      c(window, 'console') && l(window.console, 'log') && window.console.log(e);
    }
    function x(e, t) {
      t ? window.alert(e) : w(e);
    }
    function C(e) {
      (b.initialized = !0),
        (b.supported = !1),
        x(
          'Rangy is not supported on this page in your browser. Reason: ' + e,
          b.config.alertOnFail,
        );
    }
    (b.fail = C),
      (b.warn = function (e) {
        x('Rangy warning: ' + e, b.config.alertOnWarn);
      }),
      !{}.hasOwnProperty
        ? C('hasOwnProperty not supported')
        : (b.util.extend = function (e, t, n) {
            var i, r;
            for (var o in t)
              t.hasOwnProperty(o) &&
                ((i = e[o]),
                (r = t[o]),
                n &&
                  null !== i &&
                  'object' == typeof i &&
                  null !== r &&
                  'object' == typeof r &&
                  b.util.extend(i, r, !0),
                (e[o] = r));
            return t.hasOwnProperty('toString') && (e.toString = t.toString), e;
          }),
      (function () {
        var e = document.createElement('div');
        e.appendChild(document.createElement('span'));
        var t,
          n = [].slice;
        try {
          1 == n.call(e.childNodes, 0)[0].nodeType &&
            (t = function (e) {
              return n.call(e, 0);
            });
        } catch (e) {}
        t ||
          (t = function (e) {
            for (var t = [], n = 0, i = e.length; n < i; ++n) t[n] = e[n];
            return t;
          }),
          (b.util.toArray = t);
      })(),
      l(document, 'addEventListener')
        ? (v = function (e, t, n) {
            e.addEventListener(t, n, !1);
          })
        : l(document, 'attachEvent')
          ? (v = function (e, t, n) {
              e.attachEvent('on' + t, n);
            })
          : C('Document does not have required addEventListener or attachEvent method'),
      (b.util.addListener = v);
    var F = [];
    function S(e) {
      return e.message || e.description || String(e);
    }
    function k() {
      if (!b.initialized) {
        var e,
          t = !1,
          n = !1;
        l(document, 'createRange') &&
          ((e = document.createRange()), h(e, o) && f(e, r) && (t = !0));
        var i = g(document);
        if (i && 'body' == i.nodeName.toLowerCase())
          if ((i && l(i, 'createTextRange') && m((e = i.createTextRange())) && (n = !0), t || n)) {
            var a;
            for (var s in ((b.initialized = !0),
            (b.features = { implementsDomRange: t, implementsTextRange: n }),
            y))
              (a = y[s]) instanceof T && a.init(a, b);
            for (var c = 0, d = F.length; c < d; ++c)
              try {
                F[c](b);
              } catch (e) {
                w('Rangy init listener threw an exception. Continuing. Detail: ' + S(e));
              }
          } else C('Neither Range nor TextRange are available');
        else C('No body element found');
      }
    }
    (b.init = k),
      (b.addInitListener = function (e) {
        b.initialized ? e(b) : F.push(e);
      });
    var E = [];
    function T(e, t, n) {
      (this.name = e),
        (this.dependencies = t),
        (this.initialized = !1),
        (this.supported = !1),
        (this.initializer = n);
    }
    function _(e, t, n, i) {
      var r = new T(t, n, function (e) {
        if (!e.initialized) {
          e.initialized = !0;
          try {
            i(b, e), (e.supported = !0);
          } catch (e) {
            w("Module '" + t + "' failed to load: " + S(e));
          }
        }
      });
      y[t] = r;
    }
    function A() {}
    (b.addCreateMissingNativeApiListener = function (e) {
      E.push(e);
    }),
      (b.createMissingNativeApi = function (e) {
        (e = e || window), k();
        for (var t = 0, n = E.length; t < n; ++t) E[t](e);
      }),
      (T.prototype = {
        init: function (e) {
          for (var t, n, i = this.dependencies || [], r = 0, o = i.length; r < o; ++r) {
            if (((n = i[r]), !((t = y[n]) && t instanceof T)))
              throw new Error("required module '" + n + "' not found");
            if ((t.init(), !t.supported))
              throw new Error("required module '" + n + "' not supported");
          }
          this.initializer(this);
        },
        fail: function (e) {
          throw (
            ((this.initialized = !0),
            (this.supported = !1),
            new Error("Module '" + this.name + "' failed to load: " + e))
          );
        },
        warn: function (e) {
          b.warn('Module ' + this.name + ': ' + e);
        },
        deprecationNotice: function (e, t) {
          b.warn(
            'DEPRECATED: ' +
              e +
              ' in module ' +
              this.name +
              'is deprecated. Please use ' +
              t +
              ' instead',
          );
        },
        createError: function (e) {
          return new Error('Error in Rangy ' + this.name + ' module: ' + e);
        },
      }),
      (b.createModule = function (e) {
        var t, n;
        2 == arguments.length
          ? ((t = arguments[1]), (n = []))
          : ((t = arguments[2]), (n = arguments[1])),
          _(0, e, n, t);
      }),
      (b.createCoreModule = function (e, t, n) {
        _(0, e, t, n);
      }),
      (b.RangePrototype = A),
      (b.rangePrototype = new A()),
      (b.selectionPrototype = new (function () {})());
    var M = !1,
      L = function (e) {
        M || ((M = !0), b.initialized || k());
      };
    if (typeof window != i) {
      if (typeof document != i)
        return (
          l(document, 'addEventListener') && document.addEventListener('DOMContentLoaded', L, !1),
          v(window, 'load', L),
          b
        );
      C('No document found');
    } else C('No window found');
  })();
  i.createCoreModule('DomUtil', [], function (e, t) {
    var n = 'undefined',
      i = e.util;
    i.areHostMethods(document, ['createDocumentFragment', 'createElement', 'createTextNode']) ||
      t.fail('document missing a Node creation method'),
      i.isHostMethod(document, 'getElementsByTagName') ||
        t.fail('document missing getElementsByTagName method');
    var r = document.createElement('div');
    i.areHostMethods(
      r,
      ['insertBefore', 'appendChild', 'cloneNode'] ||
        !i.areHostObjects(r, ['previousSibling', 'nextSibling', 'childNodes', 'parentNode']),
    ) || t.fail('Incomplete Element implementation'),
      i.isHostProperty(r, 'innerHTML') || t.fail('Element is missing innerHTML property');
    var o = document.createTextNode('test');
    i.areHostMethods(
      o,
      ['splitText', 'deleteData', 'insertData', 'appendData', 'cloneNode'] ||
        !i.areHostObjects(r, ['previousSibling', 'nextSibling', 'childNodes', 'parentNode']) ||
        !i.areHostProperties(o, ['data']),
    ) || t.fail('Incomplete Text Node implementation');
    var a = function (e, t) {
      for (var n = e.length; n--; ) if (e[n] === t) return !0;
      return !1;
    };
    function s(e) {
      for (var t = 0; (e = e.previousSibling); ) ++t;
      return t;
    }
    function l(e, t) {
      var n,
        i = [];
      for (n = e; n; n = n.parentNode) i.push(n);
      for (n = t; n; n = n.parentNode) if (a(i, n)) return n;
      return null;
    }
    function c(e, t, n) {
      for (var i = n ? t : t.parentNode; i; ) {
        if (i === e) return !0;
        i = i.parentNode;
      }
      return !1;
    }
    function d(e, t, n) {
      for (var i, r = n ? e : e.parentNode; r; ) {
        if ((i = r.parentNode) === t) return r;
        r = i;
      }
      return null;
    }
    function u(e) {
      var t = e.nodeType;
      return 3 == t || 4 == t || 8 == t;
    }
    function h(e, t) {
      var n = t.nextSibling,
        i = t.parentNode;
      return n ? i.insertBefore(e, n) : i.appendChild(e), e;
    }
    function p(e) {
      if (9 == e.nodeType) return e;
      if (typeof e.ownerDocument != n) return e.ownerDocument;
      if (typeof e.document != n) return e.document;
      if (e.parentNode) return p(e.parentNode);
      throw t.createError('getDocument: no document found for node');
    }
    function f(e) {
      var i = p(e);
      if (typeof i.defaultView != n) return i.defaultView;
      if (typeof i.parentWindow != n) return i.parentWindow;
      throw t.createError('Cannot get a window object for node');
    }
    function m(e) {
      if (typeof e.contentDocument != n) return e.contentDocument;
      if (typeof e.contentWindow != n) return e.contentWindow.document;
      throw t.createError('getIframeDocument: No Document object found for iframe element');
    }
    function g(e) {
      return e && i.isHostMethod(e, 'setTimeout') && i.isHostObject(e, 'document');
    }
    var v,
      y = !1;
    function b(e) {
      try {
        return e.parentNode, !1;
      } catch (e) {
        return !0;
      }
    }
    function w(e) {
      if (!e) return '[No node]';
      if (y && b(e)) return '[Broken node]';
      if (u(e)) return '"' + e.data + '"';
      if (1 == e.nodeType) {
        var t = e.id ? ' id="' + e.id + '"' : '';
        return (
          '<' +
          e.nodeName +
          t +
          '>[index:' +
          s(e) +
          ',length:' +
          e.childNodes.length +
          '][' +
          (e.innerHTML || '[innerHTML not supported]').slice(0, 25) +
          ']'
        );
      }
      return e.nodeName;
    }
    function x(e) {
      (this.root = e), (this._next = e);
    }
    function C(e, t) {
      (this.node = e), (this.offset = t);
    }
    function F(e) {
      (this.code = this[e]),
        (this.codeName = e),
        (this.message = '[rangy] DOMException: ' + this.codeName),
        'captureStackTrace' in Error
          ? Error.captureStackTrace(this, F)
          : (this.stack = new Error().stack);
    }
    !(function () {
      var t = document.createElement('b');
      t.innerHTML = '1';
      var n = t.firstChild;
      (t.innerHTML = '<br>'), (y = b(n)), (e.features.crashyTextNodes = y);
    })(),
      typeof window.getComputedStyle != n
        ? (v = function (e, t) {
            return f(e).getComputedStyle(e, null)[t];
          })
        : typeof document.documentElement.currentStyle != n
          ? (v = function (e, t) {
              return e.currentStyle[t];
            })
          : t.fail('No means of obtaining computed style properties found'),
      (x.prototype = {
        _current: null,
        hasNext: function () {
          return !!this._next;
        },
        next: function () {
          var e,
            t,
            n = (this._current = this._next);
          if (this._current)
            if ((e = n.firstChild)) this._next = e;
            else {
              for (t = null; n !== this.root && !(t = n.nextSibling); ) n = n.parentNode;
              this._next = t;
            }
          return this._current;
        },
        detach: function () {
          this._current = this._next = this.root = null;
        },
      }),
      (C.prototype = {
        equals: function (e) {
          return !!e && this.node === e.node && this.offset == e.offset;
        },
        inspect: function () {
          return '[DomPosition(' + w(this.node) + ':' + this.offset + ')]';
        },
        toString: function () {
          return this.inspect();
        },
      }),
      (F.prototype = {
        INDEX_SIZE_ERR: 1,
        HIERARCHY_REQUEST_ERR: 3,
        WRONG_DOCUMENT_ERR: 4,
        NO_MODIFICATION_ALLOWED_ERR: 7,
        NOT_FOUND_ERR: 8,
        NOT_SUPPORTED_ERR: 9,
        INVALID_STATE_ERR: 11,
        INVALID_NODE_TYPE_ERR: 24,
      }),
      (e.dom = {
        arrayContains: a,
        isHtmlNamespace: function (e) {
          var t;
          return (
            typeof e.namespaceURI == n ||
            null === (t = e.namespaceURI) ||
            'http://www.w3.org/1999/xhtml' == t
          );
        },
        parentElement: function (e) {
          var t = e.parentNode;
          return 1 == t.nodeType ? t : null;
        },
        getNodeIndex: s,
        getNodeLength: function (e) {
          switch (e.nodeType) {
            case 7:
            case 10:
              return 0;
            case 3:
            case 8:
              return e.length;
            default:
              return e.childNodes.length;
          }
        },
        getCommonAncestor: l,
        isAncestorOf: c,
        isOrIsAncestorOf: function (e, t) {
          return c(e, t, !0);
        },
        getClosestAncestorIn: d,
        isCharacterDataNode: u,
        isTextOrCommentNode: function (e) {
          if (!e) return !1;
          var t = e.nodeType;
          return 3 == t || 8 == t;
        },
        insertAfter: h,
        splitDataNode: function (e, t, n) {
          var i = e.cloneNode(!1);
          if ((i.deleteData(0, t), e.deleteData(t, e.length - t), h(i, e), n))
            for (var r, o = 0; (r = n[o++]); )
              r.node == e && r.offset > t
                ? ((r.node = i), (r.offset -= t))
                : r.node == e.parentNode && r.offset > s(e) && ++r.offset;
          return i;
        },
        getDocument: p,
        getWindow: f,
        getIframeWindow: function (e) {
          if (typeof e.contentWindow != n) return e.contentWindow;
          if (typeof e.contentDocument != n) return e.contentDocument.defaultView;
          throw t.createError('getIframeWindow: No Window object found for iframe element');
        },
        getIframeDocument: m,
        getBody: i.getBody,
        isWindow: g,
        getContentDocument: function (e, t, n) {
          var r;
          if (
            (e
              ? i.isHostProperty(e, 'nodeType')
                ? (r = 1 == e.nodeType && 'iframe' == e.tagName.toLowerCase() ? m(e) : p(e))
                : g(e) && (r = e.document)
              : (r = document),
            !r)
          )
            throw t.createError(n + '(): Parameter must be a Window object or DOM node');
          return r;
        },
        getRootContainer: function (e) {
          for (var t; (t = e.parentNode); ) e = t;
          return e;
        },
        comparePoints: function (e, n, i, r) {
          var o, a, c, u, h;
          if (e == i) return n === r ? 0 : n < r ? -1 : 1;
          if ((o = d(i, e, !0))) return n <= s(o) ? -1 : 1;
          if ((o = d(e, i, !0))) return s(o) < r ? -1 : 1;
          if (!(a = l(e, i))) throw new Error('comparePoints error: nodes have no common ancestor');
          if ((c = e === a ? a : d(e, a, !0)) === (u = i === a ? a : d(i, a, !0)))
            throw t.createError('comparePoints got to case 4 and childA and childB are the same!');
          for (h = a.firstChild; h; ) {
            if (h === c) return -1;
            if (h === u) return 1;
            h = h.nextSibling;
          }
        },
        isBrokenNode: b,
        inspectNode: w,
        getComputedStyleProperty: v,
        fragmentFromNodeChildren: function (e) {
          for (var t, n = p(e).createDocumentFragment(); (t = e.firstChild); ) n.appendChild(t);
          return n;
        },
        createIterator: function (e) {
          return new x(e);
        },
        DomPosition: C,
      }),
      (e.DOMException = F);
  }),
    i.createCoreModule('DomRange', ['DomUtil'], function (e, t) {
      var n = e.dom,
        i = e.util,
        r = n.DomPosition,
        o = e.DOMException,
        a = n.isCharacterDataNode,
        s = n.getNodeIndex,
        l = n.isOrIsAncestorOf,
        c = n.getDocument,
        d = n.comparePoints,
        u = n.splitDataNode,
        h = n.getClosestAncestorIn,
        p = n.getNodeLength,
        f = n.arrayContains,
        m = n.getRootContainer,
        g = e.features.crashyTextNodes;
      function v(e, t) {
        return 3 != e.nodeType && (l(e, t.startContainer) || l(e, t.endContainer));
      }
      function y(e) {
        return e.document || c(e.startContainer);
      }
      function b(e) {
        return new r(e.parentNode, s(e));
      }
      function w(e) {
        return new r(e.parentNode, s(e) + 1);
      }
      function x(e, t, i) {
        var r = 11 == e.nodeType ? e.firstChild : e;
        return (
          a(t)
            ? i == t.length
              ? n.insertAfter(e, t)
              : t.parentNode.insertBefore(e, 0 == i ? t : u(t, i))
            : i >= t.childNodes.length
              ? t.appendChild(e)
              : t.insertBefore(e, t.childNodes[i]),
          r
        );
      }
      function C(e, t, n) {
        if ((z(e), z(t), y(t) != y(e))) throw new o('WRONG_DOCUMENT_ERR');
        var i = d(e.startContainer, e.startOffset, t.endContainer, t.endOffset),
          r = d(e.endContainer, e.endOffset, t.startContainer, t.startOffset);
        return n ? i <= 0 && r >= 0 : i < 0 && r > 0;
      }
      function F(e, t, i) {
        var r, o, a, s;
        for (i = i || { stop: !1 }; (a = e.next()); )
          if (e.isPartiallySelectedSubtree()) {
            if (!1 === t(a)) return void (i.stop = !0);
            if ((F((s = e.getSubtreeIterator()), t, i), s.detach(), i.stop)) return;
          } else
            for (r = n.createIterator(a); (o = r.next()); )
              if (!1 === t(o)) return void (i.stop = !0);
      }
      function S(e) {
        for (var t; e.next(); )
          e.isPartiallySelectedSubtree()
            ? (S((t = e.getSubtreeIterator())), t.detach())
            : e.remove();
      }
      function k(e) {
        for (var t, n, i = y(e.range).createDocumentFragment(); (t = e.next()); ) {
          if (
            (e.isPartiallySelectedSubtree()
              ? ((t = t.cloneNode(!1)),
                (n = e.getSubtreeIterator()),
                t.appendChild(k(n)),
                n.detach())
              : e.remove(),
            10 == t.nodeType)
          )
            throw new o('HIERARCHY_REQUEST_ERR');
          i.appendChild(t);
        }
        return i;
      }
      function E(e) {
        return (
          '[' +
          (void 0 === e.getName ? 'Range' : e.getName()) +
          '(' +
          n.inspectNode(e.startContainer) +
          ':' +
          e.startOffset +
          ', ' +
          n.inspectNode(e.endContainer) +
          ':' +
          e.endOffset +
          ')]'
        );
      }
      function T(e, t) {
        if (((this.range = e), (this.clonePartiallySelectedTextNodes = t), !e.collapsed)) {
          (this.sc = e.startContainer),
            (this.so = e.startOffset),
            (this.ec = e.endContainer),
            (this.eo = e.endOffset);
          var n = e.commonAncestorContainer;
          this.sc === this.ec && a(this.sc)
            ? ((this.isSingleCharacterDataNode = !0),
              (this._first = this._last = this._next = this.sc))
            : ((this._first = this._next =
                this.sc !== n || a(this.sc) ? h(this.sc, n, !0) : this.sc.childNodes[this.so]),
              (this._last =
                this.ec !== n || a(this.ec) ? h(this.ec, n, !0) : this.ec.childNodes[this.eo - 1]));
        }
      }
      T.prototype = {
        _current: null,
        _next: null,
        _first: null,
        _last: null,
        isSingleCharacterDataNode: !1,
        reset: function () {
          (this._current = null), (this._next = this._first);
        },
        hasNext: function () {
          return !!this._next;
        },
        next: function () {
          var e = (this._current = this._next);
          return (
            e &&
              ((this._next = e !== this._last ? e.nextSibling : null),
              a(e) &&
                this.clonePartiallySelectedTextNodes &&
                (e === this.ec && (e = e.cloneNode(!0)).deleteData(this.eo, e.length - this.eo),
                this._current === this.sc && (e = e.cloneNode(!0)).deleteData(0, this.so))),
            e
          );
        },
        remove: function () {
          var e,
            t,
            n = this._current;
          !a(n) || (n !== this.sc && n !== this.ec)
            ? n.parentNode && n.parentNode.removeChild(n)
            : (e = n === this.sc ? this.so : 0) != (t = n === this.ec ? this.eo : n.length) &&
              n.deleteData(e, t - e);
        },
        isPartiallySelectedSubtree: function () {
          return v(this._current, this.range);
        },
        getSubtreeIterator: function () {
          var e;
          if (this.isSingleCharacterDataNode) (e = this.range.cloneRange()).collapse(!1);
          else {
            e = new ue(y(this.range));
            var t = this._current,
              n = t,
              i = 0,
              r = t,
              o = p(t);
            l(t, this.sc) && ((n = this.sc), (i = this.so)),
              l(t, this.ec) && ((r = this.ec), (o = this.eo)),
              de(e, n, i, r, o);
          }
          return new T(e, this.clonePartiallySelectedTextNodes);
        },
        detach: function () {
          this.range =
            this._current =
            this._next =
            this._first =
            this._last =
            this.sc =
            this.so =
            this.ec =
            this.eo =
              null;
        },
      };
      var _ = [1, 3, 4, 5, 7, 8, 10],
        A = [2, 9, 11],
        M = [1, 3, 4, 5, 7, 8, 10, 11],
        L = [1, 3, 4, 5, 7, 8];
      function N(e) {
        return function (t, n) {
          for (var i, r = n ? t : t.parentNode; r; ) {
            if (((i = r.nodeType), f(e, i))) return r;
            r = r.parentNode;
          }
          return null;
        };
      }
      var D = N([9, 11]),
        R = N([5, 6, 10, 12]),
        B = N([6, 10, 12]);
      function P(e, t) {
        if (B(e, t)) throw new o('INVALID_NODE_TYPE_ERR');
      }
      function I(e, t) {
        if (!f(t, e.nodeType)) throw new o('INVALID_NODE_TYPE_ERR');
      }
      function O(e, t) {
        if (t < 0 || t > (a(e) ? e.length : e.childNodes.length)) throw new o('INDEX_SIZE_ERR');
      }
      function $(e, t) {
        if (D(e, !0) !== D(t, !0)) throw new o('WRONG_DOCUMENT_ERR');
      }
      function H(e) {
        if (R(e, !0)) throw new o('NO_MODIFICATION_ALLOWED_ERR');
      }
      function U(e, t) {
        if (!e) throw new o(t);
      }
      function j(e) {
        return (g && n.isBrokenNode(e)) || (!f(A, e.nodeType) && !D(e, !0));
      }
      function q(e, t) {
        return t <= (a(e) ? e.length : e.childNodes.length);
      }
      function W(e) {
        return (
          !!e.startContainer &&
          !!e.endContainer &&
          !j(e.startContainer) &&
          !j(e.endContainer) &&
          q(e.startContainer, e.startOffset) &&
          q(e.endContainer, e.endOffset)
        );
      }
      function z(e) {
        if (!W(e))
          throw new Error(
            'Range error: Range is no longer valid after DOM mutation (' + e.inspect() + ')',
          );
      }
      var V = document.createElement('style'),
        J = !1;
      try {
        (V.innerHTML = '<b>x</b>'), (J = 3 == V.firstChild.nodeType);
      } catch (e) {}
      e.features.htmlParsingConforms = J;
      var K = J
        ? function (e) {
            var t = this.startContainer,
              i = c(t);
            if (!t) throw new o('INVALID_STATE_ERR');
            var r = null;
            return (
              1 == t.nodeType ? (r = t) : a(t) && (r = n.parentElement(t)),
              ((r =
                null === r ||
                ('HTML' == r.nodeName &&
                  n.isHtmlNamespace(c(r).documentElement) &&
                  n.isHtmlNamespace(r))
                  ? i.createElement('body')
                  : r.cloneNode(!1)).innerHTML = e),
              n.fragmentFromNodeChildren(r)
            );
          }
        : function (e) {
            var t = y(this).createElement('body');
            return (t.innerHTML = e), n.fragmentFromNodeChildren(t);
          };
      function Y(e, t) {
        z(e);
        var n = e.startContainer,
          i = e.startOffset,
          r = e.endContainer,
          o = e.endOffset,
          l = n === r;
        a(r) && o > 0 && o < r.length && u(r, o, t),
          a(n) &&
            i > 0 &&
            i < n.length &&
            ((n = u(n, i, t)),
            l ? ((o -= i), (r = n)) : r == n.parentNode && o >= s(n) && o++,
            (i = 0)),
          e.setStartAndEnd(n, i, r, o);
      }
      var G = [
          'startContainer',
          'startOffset',
          'endContainer',
          'endOffset',
          'collapsed',
          'commonAncestorContainer',
        ],
        Q = 0,
        X = 1,
        Z = 2,
        ee = 3,
        te = 0,
        ne = 1,
        ie = 2,
        re = 3;
      function oe(e) {
        (e.START_TO_START = Q),
          (e.START_TO_END = X),
          (e.END_TO_END = Z),
          (e.END_TO_START = ee),
          (e.NODE_BEFORE = te),
          (e.NODE_AFTER = ne),
          (e.NODE_BEFORE_AND_AFTER = ie),
          (e.NODE_INSIDE = re);
      }
      function ae(e) {
        oe(e), oe(e.prototype);
      }
      function se(e, t) {
        return function () {
          z(this);
          var n,
            i = this.startContainer,
            r = this.startOffset,
            o = this.commonAncestorContainer,
            a = new T(this, !0);
          i !== o && ((i = (n = w(h(i, o, !0))).node), (r = n.offset)), F(a, H), a.reset();
          var s = e(a);
          return a.detach(), t(this, i, r, i, r), s;
        };
      }
      function le(t, n) {
        function r(e, t) {
          return function (n) {
            I(n, _), I(m(n), A);
            var i = (e ? b : w)(n);
            (t ? o : l)(this, i.node, i.offset);
          };
        }
        function o(e, t, i) {
          var r = e.endContainer,
            o = e.endOffset;
          (t === e.startContainer && i === e.startOffset) ||
            ((m(t) == m(r) && 1 != d(t, i, r, o)) || ((r = t), (o = i)), n(e, t, i, r, o));
        }
        function l(e, t, i) {
          var r = e.startContainer,
            o = e.startOffset;
          (t === e.endContainer && i === e.endOffset) ||
            ((m(t) == m(r) && -1 != d(t, i, r, o)) || ((r = t), (o = i)), n(e, r, o, t, i));
        }
        var c = function () {};
        (c.prototype = e.rangePrototype),
          (t.prototype = new c()),
          i.extend(t.prototype, {
            setStart: function (e, t) {
              P(e, !0), O(e, t), o(this, e, t);
            },
            setEnd: function (e, t) {
              P(e, !0), O(e, t), l(this, e, t);
            },
            setStartAndEnd: function () {
              var e = arguments,
                t = e[0],
                i = e[1],
                r = t,
                o = i;
              switch (e.length) {
                case 3:
                  o = e[2];
                  break;
                case 4:
                  (r = e[2]), (o = e[3]);
              }
              n(this, t, i, r, o);
            },
            setBoundary: function (e, t, n) {
              this['set' + (n ? 'Start' : 'End')](e, t);
            },
            setStartBefore: r(!0, !0),
            setStartAfter: r(!1, !0),
            setEndBefore: r(!0, !1),
            setEndAfter: r(!1, !1),
            collapse: function (e) {
              z(this),
                e
                  ? n(
                      this,
                      this.startContainer,
                      this.startOffset,
                      this.startContainer,
                      this.startOffset,
                    )
                  : n(this, this.endContainer, this.endOffset, this.endContainer, this.endOffset);
            },
            selectNodeContents: function (e) {
              P(e, !0), n(this, e, 0, e, p(e));
            },
            selectNode: function (e) {
              P(e, !1), I(e, _);
              var t = b(e),
                i = w(e);
              n(this, t.node, t.offset, i.node, i.offset);
            },
            extractContents: se(k, n),
            deleteContents: se(S, n),
            canSurroundContents: function () {
              z(this), H(this.startContainer), H(this.endContainer);
              var e = new T(this, !0),
                t = (e._first && v(e._first, this)) || (e._last && v(e._last, this));
              return e.detach(), !t;
            },
            splitBoundaries: function () {
              Y(this);
            },
            splitBoundariesPreservingPositions: function (e) {
              Y(this, e);
            },
            normalizeBoundaries: function () {
              z(this);
              var e = this.startContainer,
                t = this.startOffset,
                i = this.endContainer,
                r = this.endOffset,
                o = function (e) {
                  var t = e.nextSibling;
                  t &&
                    t.nodeType == e.nodeType &&
                    ((i = e), (r = e.length), e.appendData(t.data), t.parentNode.removeChild(t));
                },
                l = function (n) {
                  var o = n.previousSibling;
                  if (o && o.nodeType == n.nodeType) {
                    e = n;
                    var a = n.length;
                    if (
                      ((t = o.length), n.insertData(0, o.data), o.parentNode.removeChild(o), e == i)
                    )
                      (r += t), (i = e);
                    else if (i == n.parentNode) {
                      var l = s(n);
                      r == l ? ((i = n), (r = a)) : r > l && r--;
                    }
                  }
                },
                c = !0;
              if (a(i)) i.length == r && o(i);
              else {
                if (r > 0) {
                  var d = i.childNodes[r - 1];
                  d && a(d) && o(d);
                }
                c = !this.collapsed;
              }
              if (c) {
                if (a(e)) 0 == t && l(e);
                else if (t < e.childNodes.length) {
                  var u = e.childNodes[t];
                  u && a(u) && l(u);
                }
              } else (e = i), (t = r);
              n(this, e, t, i, r);
            },
            collapseToPoint: function (e, t) {
              P(e, !0), O(e, t), this.setStartAndEnd(e, t);
            },
          }),
          ae(t);
      }
      function ce(e) {
        (e.collapsed = e.startContainer === e.endContainer && e.startOffset === e.endOffset),
          (e.commonAncestorContainer = e.collapsed
            ? e.startContainer
            : n.getCommonAncestor(e.startContainer, e.endContainer));
      }
      function de(e, t, i, r, o) {
        (e.startContainer = t),
          (e.startOffset = i),
          (e.endContainer = r),
          (e.endOffset = o),
          (e.document = n.getDocument(t)),
          ce(e);
      }
      function ue(e) {
        (this.startContainer = e),
          (this.startOffset = 0),
          (this.endContainer = e),
          (this.endOffset = 0),
          (this.document = e),
          ce(this);
      }
      i.extend(e.rangePrototype, {
        compareBoundaryPoints: function (e, t) {
          var n, i, r, o;
          z(this), $(this.startContainer, t.startContainer);
          var a = e == ee || e == Q ? 'start' : 'end',
            s = e == X || e == Q ? 'start' : 'end';
          return (
            (n = this[a + 'Container']),
            (i = this[a + 'Offset']),
            (r = t[s + 'Container']),
            (o = t[s + 'Offset']),
            d(n, i, r, o)
          );
        },
        insertNode: function (e) {
          if ((z(this), I(e, M), H(this.startContainer), l(e, this.startContainer)))
            throw new o('HIERARCHY_REQUEST_ERR');
          var t = x(e, this.startContainer, this.startOffset);
          this.setStartBefore(t);
        },
        cloneContents: function () {
          var e, t;
          if ((z(this), this.collapsed)) return y(this).createDocumentFragment();
          if (this.startContainer === this.endContainer && a(this.startContainer))
            return (
              ((e = this.startContainer.cloneNode(!0)).data = e.data.slice(
                this.startOffset,
                this.endOffset,
              )),
              (t = y(this).createDocumentFragment()).appendChild(e),
              t
            );
          var n = new T(this, !0);
          return (
            (e = (function e(t) {
              for (var n, i, r, a = y(t.range).createDocumentFragment(); (i = t.next()); ) {
                if (
                  ((n = t.isPartiallySelectedSubtree()),
                  (i = i.cloneNode(!n)),
                  n && ((r = t.getSubtreeIterator()), i.appendChild(e(r)), r.detach()),
                  10 == i.nodeType)
                )
                  throw new o('HIERARCHY_REQUEST_ERR');
                a.appendChild(i);
              }
              return a;
            })(n)),
            n.detach(),
            e
          );
        },
        canSurroundContents: function () {
          z(this), H(this.startContainer), H(this.endContainer);
          var e = new T(this, !0),
            t = (e._first && v(e._first, this)) || (e._last && v(e._last, this));
          return e.detach(), !t;
        },
        surroundContents: function (e) {
          if ((I(e, L), !this.canSurroundContents())) throw new o('INVALID_STATE_ERR');
          var t = this.extractContents();
          if (e.hasChildNodes()) for (; e.lastChild; ) e.removeChild(e.lastChild);
          x(e, this.startContainer, this.startOffset), e.appendChild(t), this.selectNode(e);
        },
        cloneRange: function () {
          z(this);
          for (var e, t = new ue(y(this)), n = G.length; n--; ) t[(e = G[n])] = this[e];
          return (t.isBackward = this.isBackward), t;
        },
        toString: function () {
          z(this);
          var e = this.startContainer;
          if (e === this.endContainer && a(e))
            return 3 == e.nodeType || 4 == e.nodeType
              ? e.data.slice(this.startOffset, this.endOffset)
              : '';
          var t = [],
            n = new T(this, !0);
          return (
            F(n, function (e) {
              (3 != e.nodeType && 4 != e.nodeType) || t.push(e.data);
            }),
            n.detach(),
            t.join('')
          );
        },
        compareNode: function (e) {
          z(this);
          var t = e.parentNode,
            n = s(e);
          if (!t) throw new o('NOT_FOUND_ERR');
          var i = this.comparePoint(t, n),
            r = this.comparePoint(t, n + 1);
          return i < 0 ? (r > 0 ? ie : te) : r > 0 ? ne : re;
        },
        comparePoint: function (e, t) {
          return (
            z(this),
            U(e, 'HIERARCHY_REQUEST_ERR'),
            $(e, this.startContainer),
            d(e, t, this.startContainer, this.startOffset) < 0
              ? -1
              : d(e, t, this.endContainer, this.endOffset) > 0
                ? 1
                : 0
          );
        },
        createContextualFragment: K,
        toHtml: function () {
          z(this);
          var e = this.commonAncestorContainer.parentNode.cloneNode(!1);
          return e.appendChild(this.cloneContents()), e.innerHTML;
        },
        intersectsNode: function (e, t) {
          if ((z(this), U(e, 'NOT_FOUND_ERR'), c(e) !== y(this))) return !1;
          var n = e.parentNode,
            i = s(e);
          U(n, 'NOT_FOUND_ERR');
          var r = d(n, i, this.endContainer, this.endOffset),
            o = d(n, i + 1, this.startContainer, this.startOffset);
          return t ? r <= 0 && o >= 0 : r < 0 && o > 0;
        },
        isPointInRange: function (e, t) {
          return (
            z(this),
            U(e, 'HIERARCHY_REQUEST_ERR'),
            $(e, this.startContainer),
            d(e, t, this.startContainer, this.startOffset) >= 0 &&
              d(e, t, this.endContainer, this.endOffset) <= 0
          );
        },
        intersectsRange: function (e) {
          return C(this, e, !1);
        },
        intersectsOrTouchesRange: function (e) {
          return C(this, e, !0);
        },
        intersection: function (e) {
          if (this.intersectsRange(e)) {
            var t = d(this.startContainer, this.startOffset, e.startContainer, e.startOffset),
              n = d(this.endContainer, this.endOffset, e.endContainer, e.endOffset),
              i = this.cloneRange();
            return (
              -1 == t && i.setStart(e.startContainer, e.startOffset),
              1 == n && i.setEnd(e.endContainer, e.endOffset),
              i
            );
          }
          return null;
        },
        union: function (e) {
          if (this.intersectsOrTouchesRange(e)) {
            var t = this.cloneRange();
            return (
              -1 == d(e.startContainer, e.startOffset, this.startContainer, this.startOffset) &&
                t.setStart(e.startContainer, e.startOffset),
              1 == d(e.endContainer, e.endOffset, this.endContainer, this.endOffset) &&
                t.setEnd(e.endContainer, e.endOffset),
              t
            );
          }
          throw new o('Ranges do not intersect');
        },
        containsNode: function (e, t) {
          try {
            return t ? this.intersectsNode(e, !1) : this.compareNode(e) == re;
          } catch (e) {
            return console.sendError(e), !1;
          }
        },
        containsNodeContents: function (e) {
          return this.comparePoint(e, 0) >= 0 && this.comparePoint(e, p(e)) <= 0;
        },
        containsRange: function (e) {
          var t = this.intersection(e);
          return null !== t && e.equals(t);
        },
        containsNodeText: function (e) {
          var t = this.cloneRange();
          t.selectNode(e);
          var n = t.getNodes([3]);
          if (n.length > 0) {
            t.setStart(n[0], 0);
            var i = n.pop();
            return t.setEnd(i, i.length), this.containsRange(t);
          }
          return this.containsNodeContents(e);
        },
        getNodes: function (e, t) {
          return (
            z(this),
            (function (e, t, n) {
              var i,
                r = !(!t || !t.length),
                o = !!n;
              r && (i = new RegExp('^(' + t.join('|') + ')$'));
              var s = [];
              return (
                F(new T(e, !1), function (t) {
                  if ((!r || i.test(t.nodeType)) && (!o || n(t))) {
                    var l = e.startContainer;
                    if (t != l || !a(l) || e.startOffset != l.length) {
                      var c = e.endContainer;
                      (t == c && a(c) && 0 == e.endOffset) || s.push(t);
                    }
                  }
                }),
                s
              );
            })(this, e, t)
          );
        },
        getDocument: function () {
          return y(this);
        },
        collapseBefore: function (e) {
          this.setEndBefore(e), this.collapse(!1);
        },
        collapseAfter: function (e) {
          this.setStartAfter(e), this.collapse(!0);
        },
        getBookmark: function (t, i) {
          if (!t) return {};
          function r(e) {
            var t = e.cloneContents();
            if (t.querySelector('mjx-container, text, ruby')) {
              for (
                var n = t.querySelectorAll(
                    `mjx-container, svg, ruby${i ? ',.md-math-after-sym' : ''}`,
                  ),
                  r = 0;
                r < n.length;
                r++
              )
                n[r].parentElement && n[r].parentElement.removeChild(n[r]);
              return t.textContent.length;
            }
            return e.toString().length;
          }
          var o = y(this),
            a = e.createRange(o);
          (t = t || n.getBody(o)), a.selectNodeContents(t);
          var s = this.intersection(a),
            l = t.querySelectorAll('mjx-container, text, ruby').length,
            c = 0,
            d = 0;
          return (
            s &&
              (a.setEnd(s.startContainer, s.startOffset),
              (d = (c = l ? r(a) : a.toString().length) + (l ? r(s) : s.toString().length))),
            { start: c, end: d, containerNode: t }
          );
        },
        moveToBookmark: function (e) {
          var t = e.containerNode,
            n = 0;
          this.setStart(t, 0), this.collapse(!0);
          for (var i, r, o, a, s = [t], l = !1, c = !1; !c && (i = s.pop()); )
            if (3 == i.nodeType)
              (r = n + i.length),
                !l && e.start >= n && e.start <= r && (this.setStart(i, e.start - n), (l = !0)),
                l && e.end >= n && e.end <= r && (this.setEnd(i, e.end - n), (c = !0)),
                (n = r);
            else if (!/^(MJX\-CONTAINER|text|RUBY)$/i.exec(i.tagName || ''))
              for (o = (a = i.childNodes).length; o--; ) s.push(a[o]);
        },
        getName: function () {
          return 'DomRange';
        },
        equals: function (e) {
          return ue.rangesEqual(this, e);
        },
        isValid: function () {
          return W(this);
        },
        inspect: function () {
          return E(this);
        },
        detach: function () {},
      }),
        le(ue, de),
        i.extend(ue, {
          rangeProperties: G,
          RangeIterator: T,
          copyComparisonConstants: ae,
          createPrototypeRange: le,
          inspect: E,
          getRangeDocument: y,
          rangesEqual: function (e, t) {
            return (
              e.startContainer === t.startContainer &&
              e.startOffset === t.startOffset &&
              e.endContainer === t.endContainer &&
              e.endOffset === t.endOffset
            );
          },
        }),
        (e.DomRange = ue);
    }),
    i.createCoreModule('WrappedRange', ['DomRange'], function (e, t) {
      var n,
        i,
        r = e.dom,
        o = e.util,
        a = r.DomPosition,
        s = e.DomRange,
        l = r.getBody,
        c = r.getContentDocument,
        d = r.isCharacterDataNode;
      if (
        (e.features.implementsDomRange &&
          (function () {
            var i,
              a,
              d = s.rangeProperties;
            function u(e) {
              for (var t, n = d.length; n--; ) e[(t = d[n])] = e.nativeRange[t];
              e.collapsed = e.startContainer === e.endContainer && e.startOffset === e.endOffset;
            }
            (n = function (e) {
              if (!e) throw t.createError('WrappedRange: Range must be specified');
              (this.nativeRange = e), u(this);
            }),
              s.createPrototypeRange(n, function (e, t, n, i, r) {
                var o = e.startContainer !== t || e.startOffset != n,
                  a = e.endContainer !== i || e.endOffset != r,
                  s = !e.equals(e.nativeRange);
                (o || a || s) && (e.setEnd(i, r), e.setStart(t, n));
              }),
              ((i = n.prototype).selectNode = function (e) {
                this.nativeRange.selectNode(e), u(this);
              }),
              (i.cloneContents = function () {
                return this.nativeRange.cloneContents();
              }),
              (i.surroundContents = function (e) {
                this.nativeRange.surroundContents(e), u(this);
              }),
              (i.collapse = function (e) {
                this.nativeRange.collapse(e), u(this);
              }),
              (i.cloneRange = function () {
                var e = new n(this.nativeRange.cloneRange());
                return (e.isBackward = this.isBackward), e;
              }),
              (i.refresh = function () {
                u(this);
              }),
              (i.toString = function () {
                return this.nativeRange.toString();
              });
            var h = document.createTextNode('test');
            l(document).appendChild(h);
            var p = document.createRange();
            p.setStart(h, 0), p.setEnd(h, 0);
            try {
              p.setStart(h, 1),
                (i.setStart = function (e, t) {
                  this.nativeRange.setStart(e, t), u(this);
                }),
                (i.setEnd = function (e, t) {
                  this.nativeRange.setEnd(e, t), u(this);
                }),
                (a = function (e) {
                  return function (t) {
                    this.nativeRange[e](t), u(this);
                  };
                });
            } catch (e) {
              (i.setStart = function (e, t) {
                try {
                  this.nativeRange.setStart(e, t);
                } catch (n) {
                  this.nativeRange.setEnd(e, t), this.nativeRange.setStart(e, t);
                }
                u(this);
              }),
                (i.setEnd = function (e, t) {
                  try {
                    this.nativeRange.setEnd(e, t);
                  } catch (n) {
                    this.nativeRange.setStart(e, t), this.nativeRange.setEnd(e, t);
                  }
                  u(this);
                }),
                (a = function (e, t) {
                  return function (n) {
                    try {
                      this.nativeRange[e](n);
                    } catch (i) {
                      this.nativeRange[t](n), this.nativeRange[e](n);
                    }
                    u(this);
                  };
                });
            }
            (i.setStartBefore = a('setStartBefore', 'setEndBefore')),
              (i.setStartAfter = a('setStartAfter', 'setEndAfter')),
              (i.setEndBefore = a('setEndBefore', 'setStartBefore')),
              (i.setEndAfter = a('setEndAfter', 'setStartAfter')),
              (i.selectNodeContents = function (e) {
                this.setStartAndEnd(e, 0, r.getNodeLength(e));
              }),
              p.selectNodeContents(h),
              p.setEnd(h, 3);
            var f = document.createRange();
            f.selectNodeContents(h),
              f.setEnd(h, 4),
              f.setStart(h, 2),
              -1 == p.compareBoundaryPoints(p.START_TO_END, f) &&
              1 == p.compareBoundaryPoints(p.END_TO_START, f)
                ? (i.compareBoundaryPoints = function (e, t) {
                    return (
                      e == (t = t.nativeRange || t).START_TO_END
                        ? (e = t.END_TO_START)
                        : e == t.END_TO_START && (e = t.START_TO_END),
                      this.nativeRange.compareBoundaryPoints(e, t)
                    );
                  })
                : (i.compareBoundaryPoints = function (e, t) {
                    return this.nativeRange.compareBoundaryPoints(e, t.nativeRange || t);
                  });
            var m = document.createElement('div');
            m.innerHTML = '123';
            var g = m.firstChild,
              v = l(document);
            v.appendChild(m),
              p.setStart(g, 1),
              p.setEnd(g, 2),
              p.deleteContents(),
              '13' == g.data &&
                ((i.deleteContents = function () {
                  this.nativeRange.deleteContents(), u(this);
                }),
                (i.extractContents = function () {
                  var e = this.nativeRange.extractContents();
                  return u(this), e;
                })),
              v.removeChild(m),
              (v = null),
              o.isHostMethod(p, 'createContextualFragment') &&
                (i.createContextualFragment = function (e) {
                  return this.nativeRange.createContextualFragment(e);
                }),
              l(document).removeChild(h),
              (i.getName = function () {
                return 'WrappedRange';
              }),
              (e.WrappedRange = n),
              (e.createNativeRange = function (e) {
                return (e = c(e, t, 'createNativeRange')).createRange();
              });
          })(),
        e.features.implementsTextRange)
      ) {
        var u = function (e, t, n, i, o) {
            var s = e.duplicate();
            s.collapse(n);
            var l = s.parentElement();
            if ((r.isOrIsAncestorOf(t, l) || (l = t), !l.canHaveHTML)) {
              var c = new a(l.parentNode, r.getNodeIndex(l));
              return {
                boundaryPosition: c,
                nodeInfo: { nodeIndex: c.offset, containerElement: c.node },
              };
            }
            var u = r.getDocument(l).createElement('span');
            u.parentNode && u.parentNode.removeChild(u);
            for (
              var h,
                p,
                f,
                m,
                g,
                v = n ? 'StartToStart' : 'StartToEnd',
                y = o && o.containerElement == l ? o.nodeIndex : 0,
                b = l.childNodes.length,
                w = b,
                x = w;
              x == b ? l.appendChild(u) : l.insertBefore(u, l.childNodes[x]),
                s.moveToElementText(u),
                0 != (h = s.compareEndPoints(v, e)) && y != w;
            ) {
              if (-1 == h) {
                if (w == y + 1) break;
                y = x;
              } else w = w == y + 1 ? y : x;
              (x = Math.floor((y + w) / 2)), l.removeChild(u);
            }
            if (((g = u.nextSibling), -1 == h && g && d(g))) {
              var C;
              if ((s.setEndPoint(n ? 'EndToStart' : 'EndToEnd', e), /[\r\n]/.test(g.data))) {
                var F = s.duplicate(),
                  S = F.text.replace(/\r\n/g, '\r').length;
                for (
                  C = F.moveStart('character', S);
                  -1 == (h = F.compareEndPoints('StartToEnd', F));
                )
                  C++, F.moveStart('character', 1);
              } else C = s.text.length;
              m = new a(g, C);
            } else
              (p = (i || !n) && u.previousSibling),
                (m =
                  (f = (i || n) && u.nextSibling) && d(f)
                    ? new a(f, 0)
                    : p && d(p)
                      ? new a(p, p.data.length)
                      : new a(l, r.getNodeIndex(u)));
            return (
              u.parentNode.removeChild(u),
              { boundaryPosition: m, nodeInfo: { nodeIndex: x, containerElement: l } }
            );
          },
          h = function (e, t) {
            var n,
              i,
              o,
              a,
              s = e.offset,
              c = r.getDocument(e.node),
              u = l(c).createTextRange(),
              h = d(e.node);
            return (
              h
                ? (i = (n = e.node).parentNode)
                : ((n = s < (a = e.node.childNodes).length ? a[s] : null), (i = e.node)),
              ((o = c.createElement('span')).innerHTML = '&#feff;'),
              n ? i.insertBefore(o, n) : i.appendChild(o),
              u.moveToElementText(o),
              u.collapse(!t),
              i.removeChild(o),
              h && u[t ? 'moveStart' : 'moveEnd']('character', s),
              u
            );
          };
        if (
          (((i = function (e) {
            (this.textRange = e), this.refresh();
          }).prototype = new s(document)),
          (i.prototype.refresh = function () {
            var e,
              t,
              n,
              i,
              o = (function (e) {
                var t = e.parentElement(),
                  n = e.duplicate();
                n.collapse(!0);
                var i = n.parentElement();
                (n = e.duplicate()).collapse(!1);
                var o = n.parentElement(),
                  a = i == o ? i : r.getCommonAncestor(i, o);
                return a == t ? a : r.getCommonAncestor(t, a);
              })(this.textRange);
            0 == (i = this.textRange).compareEndPoints('StartToEnd', i)
              ? (t = e = u(this.textRange, o, !0, !0).boundaryPosition)
              : ((e = (n = u(this.textRange, o, !0, !1)).boundaryPosition),
                (t = u(this.textRange, o, !1, !1, n.nodeInfo).boundaryPosition)),
              this.setStart(e.node, e.offset),
              this.setEnd(t.node, t.offset);
          }),
          (i.prototype.getName = function () {
            return 'WrappedTextRange';
          }),
          s.copyComparisonConstants(i),
          (i.rangeToTextRange = function (e) {
            if (e.collapsed) return h(new a(e.startContainer, e.startOffset), !0);
            var t = h(new a(e.startContainer, e.startOffset), !0),
              n = h(new a(e.endContainer, e.endOffset), !1),
              i = l(s.getRangeDocument(e)).createTextRange();
            return i.setEndPoint('StartToStart', t), i.setEndPoint('EndToEnd', n), i;
          }),
          (e.WrappedTextRange = i),
          !e.features.implementsDomRange || e.config.preferTextRange)
        ) {
          var p = (function () {
            return this;
          })();
          void 0 === p.Range && (p.Range = i),
            (e.createNativeRange = function (e) {
              return (e = c(e, t, 'createNativeRange')), l(e).createTextRange();
            }),
            (e.WrappedRange = i);
        }
      }
      (e.createRange = function (n) {
        return (n = c(n, t, 'createRange')), new e.WrappedRange(e.createNativeRange(n));
      }),
        (e.createRangyRange = function (e) {
          return (e = c(e, t, 'createRangyRange')), new s(e);
        }),
        (e.createIframeRange = function (n) {
          return (
            t.deprecationNotice('createIframeRange()', 'createRange(iframeEl)'), e.createRange(n)
          );
        }),
        (e.createIframeRangyRange = function (n) {
          return (
            t.deprecationNotice('createIframeRangyRange()', 'createRangyRange(iframeEl)'),
            e.createRangyRange(n)
          );
        }),
        e.addCreateMissingNativeApiListener(function (t) {
          var n = t.document;
          void 0 === n.createRange &&
            (n.createRange = function () {
              return e.createRange(n);
            }),
            (n = t = null);
        });
    }),
    i.createCoreModule('WrappedSelection', ['DomRange', 'WrappedRange'], function (e, t) {
      e.config.checkSelectionRanges = !0;
      var n,
        i,
        r = e.dom,
        o = e.util,
        a = o.isHostMethod,
        s = e.DomRange,
        l = e.WrappedRange,
        c = e.DOMException,
        d = r.DomPosition,
        u = e.features,
        h = r.getDocument,
        p = r.getBody,
        f = s.rangesEqual;
      function m(e) {
        return 'string' == typeof e ? /^backward(s)?$/i.test(e) : !!e;
      }
      function g(e, n) {
        if (e) {
          if (r.isWindow(e)) return e;
          if (e instanceof H) return e.win;
          var i = r.getContentDocument(e, t, n);
          return r.getWindow(i);
        }
        return window;
      }
      function v(e) {
        return g(e, 'getDocSelection').document.selection;
      }
      function y(e) {
        var t = !1;
        return (
          e.anchorNode &&
            (t = 1 == r.comparePoints(e.anchorNode, e.anchorOffset, e.focusNode, e.focusOffset)),
          t
        );
      }
      var b = a(window, 'getSelection'),
        w = o.isHostObject(document, 'selection');
      (u.implementsWinGetSelection = b), (u.implementsDocSelection = w);
      var x = w && (!b || e.config.preferTextRange);
      x
        ? ((n = v),
          (e.isSelectionValid = function (e) {
            var t = g(e, 'isSelectionValid').document,
              n = t.selection;
            return 'None' != n.type || h(n.createRange().parentElement()) == t;
          }))
        : b
          ? ((n = function (e) {
              return g(e, 'getWinSelection').getSelection();
            }),
            (e.isSelectionValid = function () {
              return !0;
            }))
          : t.fail('Neither document.selection or window.getSelection() detected.'),
        (e.getNativeSelection = n);
      var C = n(),
        F = e.createNativeRange(document),
        S = p(document),
        k = o.areHostProperties(C, ['anchorNode', 'focusNode', 'anchorOffset', 'focusOffset']);
      u.selectionHasAnchorAndFocus = k;
      var E = a(C, 'extend');
      u.selectionHasExtend = E;
      var T = 'number' == typeof C.rangeCount;
      u.selectionHasRangeCount = T;
      var _ = E
        ? function (t, n) {
            var i = s.getRangeDocument(n),
              r = e.createRange(i);
            r.collapseToPoint(n.endContainer, n.endOffset),
              t.addRange(R(r)),
              t.extend(n.startContainer, n.startOffset);
          }
        : null;
      o.areHostMethods(C, ['addRange', 'getRangeAt', 'removeAllRanges']) &&
        'number' == typeof C.rangeCount &&
        u.implementsDomRange &&
        (function () {
          var t = window.getSelection();
          if (t) {
            for (var n = t.rangeCount, i = [], r = y(t), o = 0; o < n; ++o) i[o] = t.getRangeAt(o);
            for (o = 0; o < n; ++o)
              0 == o && r
                ? _
                  ? _(t, i[o])
                  : (e.warn(
                      'Rangy initialization: original selection was backwards but selection has been restored forwards because the browser does not support Selection.extend',
                    ),
                    t.addRange(i[o]))
                : t.addRange(i[o]);
          }
        })(),
        (u.selectionSupportsMultipleRanges = !1),
        (u.collapsedNonEditableSelectionsSupported = !0);
      var A,
        M,
        L = !1;
      function N(e, t, n) {
        var i = n ? 'end' : 'start',
          r = n ? 'start' : 'end';
        (e.anchorNode = t[i + 'Container']),
          (e.anchorOffset = t[i + 'Offset']),
          (e.focusNode = t[r + 'Container']),
          (e.focusOffset = t[r + 'Offset']);
      }
      function D(e) {
        (e.anchorNode = e.focusNode = null),
          (e.anchorOffset = e.focusOffset = 0),
          (e.rangeCount = 0),
          (e.isCollapsed = !0),
          (e._ranges.length = 0);
      }
      function R(t) {
        var n;
        return (
          t instanceof s
            ? ((n = e.createNativeRange(t.getDocument())).setEnd(t.endContainer, t.endOffset),
              n.setStart(t.startContainer, t.startOffset))
            : t instanceof l
              ? (n = t.nativeRange)
              : u.implementsDomRange && t instanceof r.getWindow(t.startContainer).Range && (n = t),
          n
        );
      }
      function B(e) {
        var n = e.getNodes();
        if (
          !(function (e) {
            if (!e.length || 1 != e[0].nodeType) return !1;
            for (var t = 1, n = e.length; t < n; ++t) if (!r.isAncestorOf(e[0], e[t])) return !1;
            return !0;
          })(n)
        )
          throw t.createError(
            'getSingleElementFromRange: range ' +
              e.inspect() +
              ' did not consist of a single element',
          );
        return n[0];
      }
      function P(e) {
        return !!e && void 0 !== e.text;
      }
      function I(e, t) {
        var n = new l(t);
        (e._ranges = [n]), N(e, n, !1), (e.rangeCount = 1), (e.isCollapsed = n.collapsed);
      }
      function O(t) {
        if (((t._ranges.length = 0), 'None' == t.docSelection.type)) D(t);
        else {
          var n = t.docSelection.createRange();
          if (P(n)) I(t, n);
          else {
            t.rangeCount = n.length;
            for (var i, r = h(n.item(0)), o = 0; o < t.rangeCount; ++o)
              (i = e.createRange(r)).selectNode(n.item(o)), t._ranges.push(i);
            (t.isCollapsed = 1 == t.rangeCount && t._ranges[0].collapsed),
              N(t, t._ranges[t.rangeCount - 1], !1);
          }
        }
      }
      function $(e, n) {
        for (
          var i = e.docSelection.createRange(),
            r = B(n),
            o = h(i.item(0)),
            a = p(o).createControlRange(),
            s = 0,
            l = i.length;
          s < l;
          ++s
        )
          a.add(i.item(s));
        try {
          a.add(r);
        } catch (e) {
          throw t.createError(
            'addRange(): Element within the specified Range could not be added to control selection (does it have layout?)',
          );
        }
        newControlrange.select(n.isBackward), O(e);
      }
      function H(e, t, n) {
        (this.nativeSelection = e),
          (this.docSelection = t),
          (this._ranges = []),
          (this.win = n),
          this.refresh();
      }
      function U(e) {
        (e.win = e.anchorNode = e.focusNode = e._ranges = null),
          (e.rangeCount = e.anchorOffset = e.focusOffset = 0),
          (e.detached = !0);
      }
      S &&
        a(S, 'createControlRange') &&
        ((A = S.createControlRange()), o.areHostProperties(A, ['item', 'add']) && (L = !0)),
        (u.implementsControlRange = L),
        (i = k
          ? function (e) {
              return e.anchorNode === e.focusNode && e.anchorOffset === e.focusOffset;
            }
          : function (e) {
              return !!e.rangeCount && e.getRangeAt(e.rangeCount - 1).collapsed;
            }),
        a(C, 'getRangeAt')
          ? (M = function (e, t) {
              try {
                return e.getRangeAt(t);
              } catch (e) {
                return null;
              }
            })
          : k &&
            (M = function (t) {
              var n = h(t.anchorNode),
                i = e.createRange(n);
              return (
                i.setStartAndEnd(t.anchorNode, t.anchorOffset, t.focusNode, t.focusOffset),
                i.collapsed !== this.isCollapsed &&
                  i.setStartAndEnd(t.focusNode, t.focusOffset, t.anchorNode, t.anchorOffset),
                i
              );
            }),
        (H.prototype = e.selectionPrototype);
      var j = [];
      function q(e, t) {
        for (var n, i, r = j.length; r--; )
          if (((i = (n = j[r]).selection), 'deleteAll' == t)) U(i);
          else if (n.win == e) return 'delete' == t ? (j.splice(r, 1), !0) : i;
        return 'deleteAll' == t && (j.length = 0), null;
      }
      var W = function (e) {
        if (e && e instanceof H) return e.refresh(), e;
        var t = q((e = g(e, 'getNativeSelection'))),
          i = n(e),
          r = w ? v(e) : null;
        return (
          t
            ? ((t.nativeSelection = i), (t.docSelection = r), t.refresh())
            : ((t = new H(i, r, e)), j.push({ win: e, selection: t })),
          t
        );
      };
      (e.getSelection = W),
        (e.getIframeSelection = function (n) {
          return (
            t.deprecationNotice('getIframeSelection()', 'getSelection(iframeEl)'),
            e.getSelection(r.getIframeWindow(n))
          );
        });
      var z,
        V = H.prototype;
      function J(e, n) {
        for (
          var i, r = h(n[0].startContainer), o = p(r).createControlRange(), a = 0, s = n.length;
          a < s;
          ++a
        ) {
          i = B(n[a]);
          try {
            o.add(i);
          } catch (e) {
            throw t.createError(
              'setRanges(): Element within one of the specified Ranges could not be added to control selection (does it have layout?)',
            );
          }
        }
        controlrange.select(range.isBackward), O(e);
      }
      if (!x && k && o.areHostMethods(C, ['removeAllRanges', 'addRange'])) {
        V.removeAllRanges = function () {
          this.nativeSelection.removeAllRanges(), D(this);
        };
        var K = function (e, t) {
          _(e.nativeSelection, t), e.refresh();
        };
        (V.addRange = T
          ? function (t, n) {
              var r;
              if (L && w && 'Control' == this.docSelection.type) $(this, t);
              else if (m(n) && E) K(this, t);
              else if (
                (this.removeAllRanges(),
                (r = 0),
                this.nativeSelection.addRange(R(t).cloneRange()),
                (this.rangeCount = this.nativeSelection.rangeCount),
                this.rangeCount == r + 1)
              ) {
                if (e.config.checkSelectionRanges) {
                  var o = M(this.nativeSelection, this.rangeCount - 1);
                  o && !f(o, t) && (t = new l(o));
                }
                (this._ranges[this.rangeCount - 1] = t),
                  N(this, t, Y(this.nativeSelection)),
                  (this.isCollapsed = i(this));
              } else this.refresh();
            }
          : function (e, t) {
              m(t) && E ? K(this, e) : (this.nativeSelection.addRange(R(e)), this.refresh());
            }),
          (V.setRanges = function (e) {
            if (L && e.length > 1) J(this, e);
            else {
              this.removeAllRanges();
              for (var t = 0, n = e.length; t < n; ++t) this.addRange(e[t]);
            }
          });
      } else {
        if (!(a(C, 'empty') && a(F, 'select') && L && x))
          return t.fail('No means of selecting a Range or TextRange was found'), !1;
        (V.removeAllRanges = function () {
          try {
            if ((this.docSelection.empty(), 'None' != this.docSelection.type)) {
              var e;
              if (this.anchorNode) e = h(this.anchorNode);
              else if ('Control' == this.docSelection.type) {
                var t = this.docSelection.createRange();
                t.length && (e = h(t.item(0)));
              }
              if (e) {
                p(e).createTextRange();
                textrange.select(range.isBackward), this.docSelection.empty();
              }
            }
          } catch (e) {}
          D(this);
        }),
          (V.addRange = function (t) {
            'Control' == this.docSelection.type
              ? $(this, t)
              : (e.WrappedTextRange.rangeToTextRange(t).select(),
                (this._ranges[0] = t),
                (this.rangeCount = 1),
                (this.isCollapsed = this._ranges[0].collapsed),
                N(this, t, !1));
          }),
          (V.setRanges = function (e) {
            this.removeAllRanges();
            var t = e.length;
            t > 1 ? J(this, e) : t && this.addRange(e[0]);
          });
      }
      if (
        ((V.getRangeAt = function (e) {
          if (e < 0 || e >= this.rangeCount) throw new c('INDEX_SIZE_ERR');
          return this._ranges[e].cloneRange();
        }),
        x)
      )
        z = function (t) {
          var n;
          e.isSelectionValid(t.win)
            ? (n = t.docSelection.createRange())
            : (n = p(t.win.document).createTextRange()).collapse(!0),
            'Control' == t.docSelection.type ? O(t) : P(n) ? I(t, n) : D(t);
        };
      else if (a(C, 'getRangeAt') && 'number' == typeof C.rangeCount)
        z = function (t) {
          if (L && w && 'Control' == t.docSelection.type) O(t);
          else if (
            ((t._ranges.length = t.rangeCount = t.nativeSelection.rangeCount), t.rangeCount)
          ) {
            for (var n = 0, r = t.rangeCount; n < r; ++n)
              t._ranges[n] = new e.WrappedRange(t.nativeSelection.getRangeAt(n));
            N(t, t._ranges[t.rangeCount - 1], Y(t.nativeSelection)), (t.isCollapsed = i(t));
          } else D(t);
        };
      else {
        if (
          !k ||
          'boolean' != typeof C.isCollapsed ||
          'boolean' != typeof F.collapsed ||
          !u.implementsDomRange
        )
          return (
            t.fail(
              "No means of obtaining a Range or TextRange from the user's selection was found",
            ),
            !1
          );
        z = function (e) {
          var t,
            n = e.nativeSelection;
          n.anchorNode
            ? ((t = M(n, 0)),
              (e._ranges = [t]),
              (e.rangeCount = 1),
              (function (e) {
                var t = e.nativeSelection;
                (e.anchorNode = t.anchorNode),
                  (e.anchorOffset = t.anchorOffset),
                  (e.focusNode = t.focusNode),
                  (e.focusOffset = t.focusOffset);
              })(e),
              (e.isCollapsed = i(e)))
            : D(e);
        };
      }
      V.refresh = function (e) {
        var t = e ? this._ranges.slice(0) : null,
          n = this.anchorNode,
          i = this.anchorOffset;
        if ((z(this), e)) {
          var r = t.length;
          if (r != this._ranges.length) return !0;
          if (this.anchorNode != n || this.anchorOffset != i) return !0;
          for (; r--; ) if (!f(t[r], this._ranges[r])) return !0;
          return !1;
        }
      };
      var Y,
        G = function (e, t) {
          var n = e.getAllRanges();
          e.removeAllRanges();
          for (var i = 0, r = n.length; i < r; ++i) f(t, n[i]) || e.addRange(n[i]);
          e.rangeCount || D(e);
        };
      function Q(e, t) {
        if (e.win.document != h(t)) throw new c('WRONG_DOCUMENT_ERR');
      }
      function X(t) {
        return function (n, i) {
          var r;
          this.rangeCount
            ? (r = this.getRangeAt(0))['set' + (t ? 'Start' : 'End')](n, i)
            : (r = e.createRange(this.win.document)).setStartAndEnd(n, i),
            this.setSingleRange(r, this.isBackward());
        };
      }
      function Z(e) {
        var t = [],
          n = new d(e.anchorNode, e.anchorOffset),
          i = new d(e.focusNode, e.focusOffset),
          r = 'function' == typeof e.getName ? e.getName() : 'Selection';
        if (void 0 !== e.rangeCount)
          for (var o = 0, a = e.rangeCount; o < a; ++o) t[o] = s.inspect(e.getRangeAt(o));
        return (
          '[' +
          r +
          '(Ranges: ' +
          t.join(', ') +
          ')(anchor: ' +
          n.inspect() +
          ', focus: ' +
          i.inspect() +
          ']'
        );
      }
      (V.removeRange = L
        ? function (e) {
            if ('Control' == this.docSelection.type) {
              for (
                var t = this.docSelection.createRange(),
                  n = B(e),
                  i = h(t.item(0)),
                  r = p(i).createControlRange(),
                  o = !1,
                  a = 0,
                  s = t.length;
                a < s;
                ++a
              )
                t.item(a) !== n || o ? r.add(t.item(a)) : (o = !0);
              newControlrange.select(e.isBackward), O(this);
            } else G(this, e);
          }
        : function (e) {
            G(this, e);
          }),
        !x && k && u.implementsDomRange
          ? ((Y = y),
            (V.isBackward = function () {
              return Y(this);
            }))
          : (Y = V.isBackward =
              function () {
                return !1;
              }),
        (V.isBackwards = V.isBackward),
        (V.toString = function () {
          for (var e = [], t = 0, n = this.rangeCount; t < n; ++t) e[t] = '' + this._ranges[t];
          return e.join('');
        }),
        (V.collapse = function (t, n) {
          Q(this, t);
          var i = e.createRange(t);
          i.collapseToPoint(t, n), this.setSingleRange(i), (this.isCollapsed = !0);
        }),
        (V.collapseToStart = function () {
          if (!this.rangeCount) throw new c('INVALID_STATE_ERR');
          var e = this._ranges[0];
          this.collapse(e.startContainer, e.startOffset);
        }),
        (V.collapseToEnd = function () {
          if (!this.rangeCount) throw new c('INVALID_STATE_ERR');
          var e = this._ranges[this.rangeCount - 1];
          this.collapse(e.endContainer, e.endOffset);
        }),
        (V.selectAllChildren = function (t) {
          Q(this, t);
          var n = e.createRange(t);
          n.selectNodeContents(t), this.setSingleRange(n);
        }),
        (V.deleteFromDocument = function () {
          if (L && w && 'Control' == this.docSelection.type) {
            for (var e, t = this.docSelection.createRange(); t.length; )
              (e = t.item(0)), t.remove(e), e.parentNode.removeChild(e);
            this.refresh();
          } else if (this.rangeCount) {
            var n = this.getAllRanges();
            if (n.length) {
              this.removeAllRanges();
              for (var i = 0, r = n.length; i < r; ++i) n[i].deleteContents();
              this.addRange(n[r - 1]);
            }
          }
        }),
        (V.eachRange = function (e, t) {
          for (var n = 0, i = this._ranges.length; n < i; ++n) if (e(this.getRangeAt(n))) return t;
        }),
        (V.getAllRanges = function () {
          var e = [];
          return (
            this.eachRange(function (t) {
              e.push(t);
            }),
            e
          );
        }),
        (V.setSingleRange = function (e, t) {
          this.removeAllRanges(), this.addRange(e, t);
        }),
        (V.callMethodOnEachRange = function (e, t) {
          var n = [];
          return (
            this.eachRange(function (i) {
              n.push(i[e].apply(i, t));
            }),
            n
          );
        }),
        (V.setStart = X(!0)),
        (V.setEnd = X(!1)),
        (e.rangePrototype.select = function (e) {
          W(this.getDocument()).setSingleRange(this, e);
        }),
        (V.changeEachRange = function (e) {
          var t = [],
            n = this.isBackward();
          this.eachRange(function (n) {
            e(n), t.push(n);
          }),
            this.removeAllRanges(),
            n && 1 == t.length ? this.addRange(t[0], 'backward') : this.setRanges(t);
        }),
        (V.containsNode = function (e, t) {
          return this.eachRange(function (n) {
            return n.containsNode(e, t);
          }, !0);
        }),
        (V.getBookmark = function (e) {
          return {
            backward: this.isBackward(),
            rangeBookmarks: this.callMethodOnEachRange('getBookmark', [e]),
          };
        }),
        (V.moveToBookmark = function (t) {
          for (var n, i, r = [], o = 0; (n = t.rangeBookmarks[o++]); )
            (i = e.createRange(this.win)).moveToBookmark(n), r.push(i);
          t.backward ? this.setSingleRange(r[0], 'backward') : this.setRanges(r);
        }),
        (V.toHtml = function () {
          return this.callMethodOnEachRange('toHtml').join('');
        }),
        (V.getName = function () {
          return 'WrappedSelection';
        }),
        (V.inspect = function () {
          return Z(this);
        }),
        (V.detach = function () {
          q(this.win, 'delete'), U(this);
        }),
        (H.detachAll = function () {
          q(null, 'deleteAll');
        }),
        (H.inspect = Z),
        (H.isDirectionBackward = m),
        (e.Selection = H),
        (e.selectionPrototype = V),
        e.addCreateMissingNativeApiListener(function (e) {
          void 0 === e.getSelection &&
            (e.getSelection = function () {
              return W(e);
            }),
            (e = null);
        });
    }),
    (n.exports = i);
});
