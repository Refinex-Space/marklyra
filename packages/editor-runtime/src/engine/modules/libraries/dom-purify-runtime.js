// libraries/dom-purify-runtime.
// Shared initialization expression; its position in bundles.json is significant.
factory = function () {
  'use strict';
  var e =
      Object.freeze ||
      function (e) {
        return e;
      },
    t = e([
      'a',
      'abbr',
      'acronym',
      'address',
      'area',
      'article',
      'aside',
      'audio',
      'b',
      'bdi',
      'bdo',
      'big',
      'blink',
      'blockquote',
      'body',
      'br',
      'button',
      'canvas',
      'caption',
      'center',
      'cite',
      'code',
      'col',
      'colgroup',
      'content',
      'data',
      'datalist',
      'dd',
      'decorator',
      'del',
      'details',
      'dfn',
      'dir',
      'div',
      'dl',
      'dt',
      'element',
      'em',
      'fieldset',
      'figcaption',
      'figure',
      'font',
      'footer',
      'form',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'head',
      'header',
      'hgroup',
      'hr',
      'html',
      'i',
      'img',
      'input',
      'ins',
      'kbd',
      'label',
      'legend',
      'li',
      'main',
      'map',
      'mark',
      'marquee',
      'menu',
      'menuitem',
      'meter',
      'nav',
      'nobr',
      'ol',
      'optgroup',
      'option',
      'output',
      'p',
      'pre',
      'progress',
      'q',
      'rp',
      'rt',
      'ruby',
      's',
      'samp',
      'section',
      'select',
      'shadow',
      'small',
      'source',
      'spacer',
      'span',
      'strike',
      'strong',
      'style',
      'sub',
      'summary',
      'sup',
      'table',
      'tbody',
      'td',
      'template',
      'textarea',
      'tfoot',
      'th',
      'thead',
      'time',
      'tr',
      'track',
      'tt',
      'u',
      'ul',
      'var',
      'video',
      'wbr',
    ]),
    n = e([
      'svg',
      'a',
      'altglyph',
      'altglyphdef',
      'altglyphitem',
      'animatecolor',
      'animatemotion',
      'animatetransform',
      'audio',
      'canvas',
      'circle',
      'clippath',
      'defs',
      'desc',
      'ellipse',
      'filter',
      'font',
      'g',
      'glyph',
      'glyphref',
      'hkern',
      'image',
      'line',
      'lineargradient',
      'marker',
      'mask',
      'metadata',
      'mpath',
      'path',
      'pattern',
      'polygon',
      'polyline',
      'radialgradient',
      'rect',
      'stop',
      'style',
      'switch',
      'symbol',
      'text',
      'textpath',
      'title',
      'tref',
      'tspan',
      'video',
      'view',
      'vkern',
    ]),
    i = e([
      'feBlend',
      'feColorMatrix',
      'feComponentTransfer',
      'feComposite',
      'feConvolveMatrix',
      'feDiffuseLighting',
      'feDisplacementMap',
      'feDistantLight',
      'feFlood',
      'feFuncA',
      'feFuncB',
      'feFuncG',
      'feFuncR',
      'feGaussianBlur',
      'feMerge',
      'feMergeNode',
      'feMorphology',
      'feOffset',
      'fePointLight',
      'feSpecularLighting',
      'feSpotLight',
      'feTile',
      'feTurbulence',
    ]),
    r = e([
      'math',
      'menclose',
      'merror',
      'mfenced',
      'mfrac',
      'mglyph',
      'mi',
      'mlabeledtr',
      'mmultiscripts',
      'mn',
      'mo',
      'mover',
      'mpadded',
      'mphantom',
      'mroot',
      'mrow',
      'ms',
      'mspace',
      'msqrt',
      'mstyle',
      'msub',
      'msup',
      'msubsup',
      'mtable',
      'mtd',
      'mtext',
      'mtr',
      'munder',
      'munderover',
    ]),
    o = e(['#text']),
    a =
      Object.freeze ||
      function (e) {
        return e;
      },
    s = a([
      'accept',
      'action',
      'align',
      'alt',
      'autocomplete',
      'background',
      'bgcolor',
      'border',
      'cellpadding',
      'cellspacing',
      'checked',
      'cite',
      'class',
      'clear',
      'color',
      'cols',
      'colspan',
      'controls',
      'coords',
      'crossorigin',
      'datetime',
      'default',
      'dir',
      'disabled',
      'download',
      'enctype',
      'face',
      'for',
      'headers',
      'height',
      'hidden',
      'high',
      'href',
      'hreflang',
      'id',
      'integrity',
      'ismap',
      'label',
      'lang',
      'list',
      'loop',
      'low',
      'max',
      'maxlength',
      'media',
      'method',
      'min',
      'minlength',
      'multiple',
      'name',
      'noshade',
      'novalidate',
      'nowrap',
      'open',
      'optimum',
      'pattern',
      'placeholder',
      'poster',
      'preload',
      'pubdate',
      'radiogroup',
      'readonly',
      'rel',
      'required',
      'rev',
      'reversed',
      'role',
      'rows',
      'rowspan',
      'spellcheck',
      'scope',
      'selected',
      'shape',
      'size',
      'sizes',
      'span',
      'srclang',
      'start',
      'src',
      'srcset',
      'step',
      'style',
      'summary',
      'tabindex',
      'title',
      'type',
      'usemap',
      'valign',
      'value',
      'width',
      'xmlns',
    ]),
    l = a([
      'accent-height',
      'accumulate',
      'additive',
      'alignment-baseline',
      'ascent',
      'attributename',
      'attributetype',
      'azimuth',
      'basefrequency',
      'baseline-shift',
      'begin',
      'bias',
      'by',
      'class',
      'clip',
      'clip-path',
      'clip-rule',
      'color',
      'color-interpolation',
      'color-interpolation-filters',
      'color-profile',
      'color-rendering',
      'cx',
      'cy',
      'd',
      'dx',
      'dy',
      'diffuseconstant',
      'direction',
      'display',
      'divisor',
      'dur',
      'edgemode',
      'elevation',
      'end',
      'fill',
      'fill-opacity',
      'fill-rule',
      'filter',
      'filterunits',
      'flood-color',
      'flood-opacity',
      'font-family',
      'font-size',
      'font-size-adjust',
      'font-stretch',
      'font-style',
      'font-variant',
      'font-weight',
      'fx',
      'fy',
      'g1',
      'g2',
      'glyph-name',
      'glyphref',
      'gradientunits',
      'gradienttransform',
      'height',
      'href',
      'id',
      'image-rendering',
      'in',
      'in2',
      'k',
      'k1',
      'k2',
      'k3',
      'k4',
      'kerning',
      'keypoints',
      'keysplines',
      'keytimes',
      'lang',
      'lengthadjust',
      'letter-spacing',
      'kernelmatrix',
      'kernelunitlength',
      'lighting-color',
      'local',
      'marker-end',
      'marker-mid',
      'marker-start',
      'markerheight',
      'markerunits',
      'markerwidth',
      'maskcontentunits',
      'maskunits',
      'max',
      'mask',
      'media',
      'method',
      'mode',
      'min',
      'name',
      'numoctaves',
      'offset',
      'operator',
      'opacity',
      'order',
      'orient',
      'orientation',
      'origin',
      'overflow',
      'paint-order',
      'path',
      'pathlength',
      'patterncontentunits',
      'patterntransform',
      'patternunits',
      'points',
      'preservealpha',
      'preserveaspectratio',
      'primitiveunits',
      'r',
      'rx',
      'ry',
      'radius',
      'refx',
      'refy',
      'repeatcount',
      'repeatdur',
      'restart',
      'result',
      'rotate',
      'scale',
      'seed',
      'shape-rendering',
      'specularconstant',
      'specularexponent',
      'spreadmethod',
      'stddeviation',
      'stitchtiles',
      'stop-color',
      'stop-opacity',
      'stroke-dasharray',
      'stroke-dashoffset',
      'stroke-linecap',
      'stroke-linejoin',
      'stroke-miterlimit',
      'stroke-opacity',
      'stroke',
      'stroke-width',
      'style',
      'surfacescale',
      'tabindex',
      'targetx',
      'targety',
      'transform',
      'text-anchor',
      'text-decoration',
      'text-rendering',
      'textlength',
      'type',
      'u1',
      'u2',
      'unicode',
      'values',
      'viewbox',
      'visibility',
      'version',
      'vert-adv-y',
      'vert-origin-x',
      'vert-origin-y',
      'width',
      'word-spacing',
      'wrap',
      'writing-mode',
      'xchannelselector',
      'ychannelselector',
      'x',
      'x1',
      'x2',
      'xmlns',
      'y',
      'y1',
      'y2',
      'z',
      'zoomandpan',
    ]),
    c = a([
      'accent',
      'accentunder',
      'align',
      'bevelled',
      'close',
      'columnsalign',
      'columnlines',
      'columnspan',
      'denomalign',
      'depth',
      'dir',
      'display',
      'displaystyle',
      'encoding',
      'fence',
      'frame',
      'height',
      'href',
      'id',
      'largeop',
      'length',
      'linethickness',
      'lspace',
      'lquote',
      'mathbackground',
      'mathcolor',
      'mathsize',
      'mathvariant',
      'maxsize',
      'minsize',
      'movablelimits',
      'notation',
      'numalign',
      'open',
      'rowalign',
      'rowlines',
      'rowspacing',
      'rowspan',
      'rspace',
      'rquote',
      'scriptlevel',
      'scriptminsize',
      'scriptsizemultiplier',
      'selection',
      'separator',
      'separators',
      'stretchy',
      'subscriptshift',
      'supscriptshift',
      'symmetric',
      'voffset',
      'width',
      'xmlns',
    ]),
    d = a(['xlink:href', 'xml:id', 'xlink:title', 'xml:space', 'xmlns:xlink']),
    u = Object.hasOwnProperty,
    h = Object.setPrototypeOf,
    p = ('undefined' != typeof Reflect && Reflect).apply;
  function f(e, t) {
    h && h(e, null);
    for (var n = t.length; n--; ) {
      var i = t[n];
      if ('string' == typeof i) {
        var r = i.toLowerCase();
        r !== i && (Object.isFrozen(t) || (t[n] = r), (i = r));
      }
      e[i] = !0;
    }
    return e;
  }
  function m(e) {
    var t = {},
      n = void 0;
    for (n in e) p(u, e, [n]) && (t[n] = e[n]);
    return t;
  }
  p ||
    (p = function (e, t, n) {
      return e.apply(t, n);
    });
  var g =
      Object.seal ||
      function (e) {
        return e;
      },
    v = g(/\{\{[\s\S]*|[\s\S]*\}\}/gm),
    y = g(/<%[\s\S]*|[\s\S]*%>/gm),
    b = g(/^data-[\-\w.\u00B7-\uFFFF]/),
    w = g(/^aria-[\-\w]+$/),
    x = g(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),
    C = g(/^(?:\w+script|data):/i),
    F = g(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205f\u3000]/g),
    S =
      'function' == typeof Symbol && 'symbol' == typeof Symbol.iterator
        ? function (e) {
            return typeof e;
          }
        : function (e) {
            return e &&
              'function' == typeof Symbol &&
              e.constructor === Symbol &&
              e !== Symbol.prototype
              ? 'symbol'
              : typeof e;
          };
  function k(e) {
    if (Array.isArray(e)) {
      for (var t = 0, n = Array(e.length); t < e.length; t++) n[t] = e[t];
      return n;
    }
    return Array.from(e);
  }
  var E = ('undefined' != typeof Reflect && Reflect).apply,
    T = Array.prototype.slice,
    _ = Object.freeze,
    A = function () {
      return 'undefined' == typeof window ? null : window;
    };
  E ||
    (E = function (e, t, n) {
      return e.apply(t, n);
    });
  var M = function (e, t) {
    if ('object' !== (void 0 === e ? 'undefined' : S(e)) || 'function' != typeof e.createPolicy)
      return null;
    var n = null;
    t.currentScript &&
      t.currentScript.hasAttribute('data-tt-policy-suffix') &&
      (n = t.currentScript.getAttribute('data-tt-policy-suffix'));
    var i = 'dompurify' + (n ? '#' + n : '');
    try {
      return e.createPolicy(i, {
        createHTML: function (e) {
          return e;
        },
      });
    } catch (e) {
      return console.warn('TrustedTypes policy ' + i + ' could not be created.'), null;
    }
  };
  return (function e() {
    var a = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : A(),
      u = function (t) {
        return e(t);
      };
    if (((u.version = '2.0.7'), (u.removed = []), !a || !a.document || 9 !== a.document.nodeType))
      return (u.isSupported = !1), u;
    var h = a.document,
      p = !1,
      g = !1,
      L = a.document,
      N = a.DocumentFragment,
      D = a.HTMLTemplateElement,
      R = a.Node,
      B = a.NodeFilter,
      P = a.NamedNodeMap,
      I = void 0 === P ? a.NamedNodeMap || a.MozNamedAttrMap : P,
      O = a.Text,
      $ = a.Comment,
      H = a.DOMParser,
      U = a.TrustedTypes;
    if ('function' == typeof D) {
      var j = L.createElement('template');
      j.content && j.content.ownerDocument && (L = j.content.ownerDocument);
    }
    var q = M(U, h),
      W = q ? q.createHTML('') : '',
      z = L,
      V = z.implementation,
      J = z.createNodeIterator,
      K = z.getElementsByTagName,
      Y = z.createDocumentFragment,
      G = h.importNode,
      Q = {};
    u.isSupported = V && void 0 !== V.createHTMLDocument && 9 !== L.documentMode;
    var X = v,
      Z = y,
      ee = b,
      te = w,
      ne = C,
      ie = F,
      re = x,
      oe = null,
      ae = f({}, [].concat(k(t), k(n), k(i), k(r), k(o))),
      se = null,
      le = f({}, [].concat(k(s), k(l), k(c), k(d))),
      ce = null,
      de = null,
      ue = !0,
      he = !0,
      pe = !1,
      fe = !1,
      me = !1,
      ge = !1,
      ve = !1,
      ye = !1,
      be = !1,
      we = !1,
      xe = !1,
      Ce = !1,
      Fe = !0,
      Se = !0,
      ke = !1,
      Ee = {},
      Te = f({}, [
        'annotation-xml',
        'audio',
        'colgroup',
        'desc',
        'foreignobject',
        'head',
        'iframe',
        'math',
        'mi',
        'mn',
        'mo',
        'ms',
        'mtext',
        'noembed',
        'noframes',
        'plaintext',
        'script',
        'style',
        'svg',
        'template',
        'thead',
        'title',
        'video',
        'xmp',
      ]),
      _e = f({}, ['audio', 'video', 'img', 'source', 'image', 'iframe']),
      Ae = null,
      Me = f({}, [
        'alt',
        'class',
        'for',
        'id',
        'label',
        'name',
        'pattern',
        'placeholder',
        'summary',
        'title',
        'value',
        'style',
        'xmlns',
      ]),
      Le = null,
      Ne = L.createElement('form'),
      De = function (e) {
        (Le && Le === e) ||
          ((e && 'object' === (void 0 === e ? 'undefined' : S(e))) || (e = {}),
          (oe = 'ALLOWED_TAGS' in e ? f({}, e.ALLOWED_TAGS) : ae),
          (se = 'ALLOWED_ATTR' in e ? f({}, e.ALLOWED_ATTR) : le),
          (Ae = 'ADD_URI_SAFE_ATTR' in e ? f(m(Me), e.ADD_URI_SAFE_ATTR) : Me),
          (ce = 'FORBID_TAGS' in e ? f({}, e.FORBID_TAGS) : {}),
          (de = 'FORBID_ATTR' in e ? f({}, e.FORBID_ATTR) : {}),
          (Ee = 'USE_PROFILES' in e && e.USE_PROFILES),
          (ue = !1 !== e.ALLOW_ARIA_ATTR),
          (he = !1 !== e.ALLOW_DATA_ATTR),
          (pe = e.ALLOW_UNKNOWN_PROTOCOLS || !1),
          (fe = e.SAFE_FOR_JQUERY || !1),
          (me = e.SAFE_FOR_TEMPLATES || !1),
          (ge = e.WHOLE_DOCUMENT || !1),
          (be = e.RETURN_DOM || !1),
          (we = e.RETURN_DOM_FRAGMENT || !1),
          (xe = e.RETURN_DOM_IMPORT || !1),
          (Ce = e.RETURN_TRUSTED_TYPE || !1),
          (ye = e.FORCE_BODY || !1),
          (Fe = !1 !== e.SANITIZE_DOM),
          (Se = !1 !== e.KEEP_CONTENT),
          (ke = e.IN_PLACE || !1),
          (re = e.ALLOWED_URI_REGEXP || re),
          me && (he = !1),
          we && (be = !0),
          Ee &&
            ((oe = f({}, [].concat(k(o)))),
            (se = []),
            !0 === Ee.html && (f(oe, t), f(se, s)),
            !0 === Ee.svg && (f(oe, n), f(se, l), f(se, d)),
            !0 === Ee.svgFilters && (f(oe, i), f(se, l), f(se, d)),
            !0 === Ee.mathMl && (f(oe, r), f(se, c), f(se, d))),
          e.ADD_TAGS && (oe === ae && (oe = m(oe)), f(oe, e.ADD_TAGS)),
          e.ADD_ATTR && (se === le && (se = m(se)), f(se, e.ADD_ATTR)),
          e.ADD_URI_SAFE_ATTR && f(Ae, e.ADD_URI_SAFE_ATTR),
          Se && (oe['#text'] = !0),
          ge && f(oe, ['html', 'head', 'body']),
          oe.table && (f(oe, ['tbody']), delete ce.tbody),
          _ && _(e),
          (Le = e));
      },
      Re = function (e) {
        u.removed.push({ element: e });
        try {
          e.parentNode.removeChild(e);
        } catch (t) {
          e.outerHTML = W;
        }
      },
      Be = function (e, t) {
        try {
          u.removed.push({ attribute: t.getAttributeNode(e), from: t });
        } catch (e) {
          u.removed.push({ attribute: null, from: t });
        }
        t.removeAttribute(e);
      },
      Pe = function (e) {
        var t = void 0,
          n = void 0;
        if (ye) e = '<remove></remove>' + e;
        else {
          var i = e.match(/^[\s]+/);
          (n = i && i[0]) && (e = e.slice(n.length));
        }
        if (p)
          try {
            t = new H().parseFromString(e, 'text/html');
          } catch (e) {}
        if ((g && f(ce, ['title']), !t || !t.documentElement)) {
          var r = (t = V.createHTMLDocument('')).body;
          r.parentNode.removeChild(r.parentNode.firstElementChild),
            (r.outerHTML = q ? q.createHTML(e) : e);
        }
        return (
          e && n && t.body.insertBefore(L.createTextNode(n), t.body.childNodes[0] || null),
          K.call(t, ge ? 'html' : 'body')[0]
        );
      };
    u.isSupported &&
      ((function () {
        try {
          Pe('<svg><p><textarea><img src="</textarea><img src=x abc=1//">').querySelector(
            'svg img',
          ) && (p = !0);
        } catch (e) {}
      })(),
      (function () {
        try {
          var e = Pe('<x/><title>&lt;/title&gt;&lt;img&gt;');
          /<\/title/.test(e.querySelector('title').innerHTML) && (g = !0);
        } catch (e) {}
      })());
    var Ie = function (e) {
        return J.call(
          e.ownerDocument || e,
          e,
          B.SHOW_ELEMENT | B.SHOW_COMMENT | B.SHOW_TEXT,
          function () {
            return B.FILTER_ACCEPT;
          },
          !1,
        );
      },
      Oe = function (e) {
        return 'object' === (void 0 === R ? 'undefined' : S(R))
          ? e instanceof R
          : e &&
              'object' === (void 0 === e ? 'undefined' : S(e)) &&
              'number' == typeof e.nodeType &&
              'string' == typeof e.nodeName;
      },
      $e = function (e, t, n) {
        Q[e] &&
          Q[e].forEach(function (e) {
            e.call(u, t, n, Le);
          });
      },
      He = function (e) {
        var t,
          n = void 0;
        if (
          ($e('beforeSanitizeElements', e, null),
          !(
            (t = e) instanceof O ||
            t instanceof $ ||
            ('string' == typeof t.nodeName &&
              'string' == typeof t.textContent &&
              'function' == typeof t.removeChild &&
              t.attributes instanceof I &&
              'function' == typeof t.removeAttribute &&
              'function' == typeof t.setAttribute &&
              'string' == typeof t.namespaceURI)
          ))
        )
          return Re(e), !0;
        var i = e.nodeName.toLowerCase();
        if (
          ($e('uponSanitizeElement', e, { tagName: i, allowedTags: oe }),
          ('svg' === i || 'math' === i) && 0 !== e.querySelectorAll('p, br').length)
        )
          return Re(e), !0;
        if (!oe[i] || ce[i]) {
          if (Se && !Te[i] && 'function' == typeof e.insertAdjacentHTML)
            try {
              var r = e.innerHTML;
              e.insertAdjacentHTML('AfterEnd', q ? q.createHTML(r) : r);
            } catch (e) {}
          return Re(e), !0;
        }
        return 'noscript' === i && /<\/noscript/i.test(e.innerHTML)
          ? (Re(e), !0)
          : 'noembed' === i && /<\/noembed/i.test(e.innerHTML)
            ? (Re(e), !0)
            : (!fe ||
                e.firstElementChild ||
                (e.content && e.content.firstElementChild) ||
                !/</g.test(e.textContent) ||
                (u.removed.push({ element: e.cloneNode() }),
                e.innerHTML
                  ? (e.innerHTML = e.innerHTML.replace(/</g, '&lt;'))
                  : (e.innerHTML = e.textContent.replace(/</g, '&lt;'))),
              me &&
                3 === e.nodeType &&
                ((n = (n = (n = e.textContent).replace(X, ' ')).replace(Z, ' ')),
                e.textContent !== n &&
                  (u.removed.push({ element: e.cloneNode() }), (e.textContent = n))),
              $e('afterSanitizeElements', e, null),
              !1);
      },
      Ue = function (e, t, n) {
        if (Fe && ('id' === t || 'name' === t) && (n in L || n in Ne)) return !1;
        if (he && ee.test(t));
        else if (ue && te.test(t));
        else {
          if (!se[t] || de[t]) return !1;
          if (Ae[t]);
          else if (re.test(n.replace(ie, '')));
          else if (
            ('src' !== t && 'xlink:href' !== t && 'href' !== t) ||
            'script' === e ||
            0 !== n.indexOf('data:') ||
            !_e[e]
          )
            if (pe && !ne.test(n.replace(ie, '')));
            else if (n) return !1;
        }
        return !0;
      },
      je = function (e) {
        var t = void 0,
          n = void 0,
          i = void 0,
          r = void 0,
          o = void 0;
        $e('beforeSanitizeAttributes', e, null);
        var a = e.attributes;
        if (a) {
          var s = { attrName: '', attrValue: '', keepAttr: !0, allowedAttributes: se };
          for (o = a.length; o--; ) {
            var l = (t = a[o]),
              c = l.name,
              d = l.namespaceURI;
            if (
              ((n = t.value.trim()),
              (i = c.toLowerCase()),
              (s.attrName = i),
              (s.attrValue = n),
              (s.keepAttr = !0),
              $e('uponSanitizeAttribute', e, s),
              (n = s.attrValue),
              'name' === i && 'IMG' === e.nodeName && a.id)
            )
              (r = a.id),
                (a = E(T, a, [])),
                Be('id', e),
                Be(c, e),
                a.indexOf(r) > o && e.setAttribute('id', r.value);
            else {
              if (
                'INPUT' === e.nodeName &&
                'type' === i &&
                'file' === n &&
                s.keepAttr &&
                (se[i] || !de[i])
              )
                continue;
              'id' === c && e.setAttribute(c, ''), Be(c, e);
            }
            if (s.keepAttr)
              if (
                /svg|math/i.test(e.namespaceURI) &&
                new RegExp('</(' + Object.keys(Te).join('|') + ')', 'i').test(n)
              )
                Be(c, e);
              else {
                me && (n = (n = n.replace(X, ' ')).replace(Z, ' '));
                var h = e.nodeName.toLowerCase();
                if (Ue(h, i, n))
                  try {
                    d ? e.setAttributeNS(d, c, n) : e.setAttribute(c, n), u.removed.pop();
                  } catch (e) {}
              }
          }
          $e('afterSanitizeAttributes', e, null);
        }
      },
      qe = function e(t) {
        var n = void 0,
          i = Ie(t);
        for ($e('beforeSanitizeShadowDOM', t, null); (n = i.nextNode()); )
          $e('uponSanitizeShadowNode', n, null),
            He(n) || (n.content instanceof N && e(n.content), je(n));
        $e('afterSanitizeShadowDOM', t, null);
      };
    return (
      (u.sanitize = function (e, t) {
        var n = void 0,
          i = void 0,
          r = void 0,
          o = void 0,
          s = void 0;
        if ((e || (e = '\x3c!--\x3e'), 'string' != typeof e && !Oe(e))) {
          if ('function' != typeof e.toString) throw new TypeError('toString is not a function');
          if ('string' != typeof (e = e.toString()))
            throw new TypeError('dirty is not a string, aborting');
        }
        if (!u.isSupported) {
          if ('object' === S(a.toStaticHTML) || 'function' == typeof a.toStaticHTML) {
            if ('string' == typeof e) return a.toStaticHTML(e);
            if (Oe(e)) return a.toStaticHTML(e.outerHTML);
          }
          return e;
        }
        if ((ve || De(t), (u.removed = []), ke));
        else if (e instanceof R)
          1 === (i = (n = Pe('\x3c!--\x3e')).ownerDocument.importNode(e, !0)).nodeType &&
          'BODY' === i.nodeName
            ? (n = i)
            : 'HTML' === i.nodeName
              ? (n = i)
              : n.appendChild(i);
        else {
          if (!be && !me && !ge && Ce && -1 === e.indexOf('<')) return q ? q.createHTML(e) : e;
          if (!(n = Pe(e))) return be ? null : W;
        }
        n && ye && Re(n.firstChild);
        for (var l = Ie(ke ? e : n); (r = l.nextNode()); )
          (3 === r.nodeType && r === o) ||
            He(r) ||
            (r.content instanceof N && qe(r.content), je(r), (o = r));
        if (((o = null), ke)) return e;
        if (be) {
          if (we) for (s = Y.call(n.ownerDocument); n.firstChild; ) s.appendChild(n.firstChild);
          else s = n;
          return xe && (s = G.call(h, s, !0)), s;
        }
        var c = ge ? n.outerHTML : n.innerHTML;
        return me && (c = (c = c.replace(X, ' ')).replace(Z, ' ')), q && Ce ? q.createHTML(c) : c;
      }),
      (u.setConfig = function (e) {
        De(e), (ve = !0);
      }),
      (u.clearConfig = function () {
        (Le = null), (ve = !1);
      }),
      (u.isValidAttribute = function (e, t, n) {
        Le || De({});
        var i = e.toLowerCase(),
          r = t.toLowerCase();
        return Ue(i, r, n);
      }),
      (u.addHook = function (e, t) {
        'function' == typeof t && ((Q[e] = Q[e] || []), Q[e].push(t));
      }),
      (u.removeHook = function (e) {
        Q[e] && Q[e].pop();
      }),
      (u.removeHooks = function (e) {
        Q[e] && (Q[e] = []);
      }),
      (u.removeAllHooks = function () {
        Q = {};
      }),
      u
    );
  })();
};
