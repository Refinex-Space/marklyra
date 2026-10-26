// Install this compatibility library in the supplied engine environment.
export default function installLibrariesDomPurifyRuntime(engineModules, vendorScope) {
  // libraries/dom-purify-runtime.
  // Shared vendor state is installed in the explicit main.js initialization order.
  vendorScope.sanitizerFactory = function createSanitizer() {
    'use strict';

    var freezeTagList =
        Object.freeze ||
        function (value) {
          return value;
        },
      htmlTags = freezeTagList([
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
      svgTags = freezeTagList([
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
      svgFilterTags = freezeTagList([
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
      mathTags = freezeTagList([
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
      textTags = freezeTagList(['#text']),
      freezeAttributeList =
        Object.freeze ||
        function (value) {
          return value;
        },
      htmlAttributes = freezeAttributeList([
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
      svgAttributes = freezeAttributeList([
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
      mathAttributes = freezeAttributeList([
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
      xmlAttributes = freezeAttributeList([
        'xlink:href',
        'xml:id',
        'xlink:title',
        'xml:space',
        'xmlns:xlink',
      ]),
      hasOwnProperty = Object.hasOwnProperty,
      setPrototypeOf = Object.setPrototypeOf,
      applyUtility = ('undefined' != typeof Reflect && Reflect).apply;
    function addToSet(set, array) {
      if (setPrototypeOf) {
        setPrototypeOf(set, null);
      }
      for (var itemIndex = array.length; itemIndex--; ) {
        var element = array[itemIndex];
        if ('string' == typeof element) {
          var lowercaseElement = element.toLowerCase();
          if (lowercaseElement !== element) {
            if (!Object.isFrozen(array)) {
              array[itemIndex] = lowercaseElement;
            }
            element = lowercaseElement;
          }
        }
        set[element] = true;
      }
      return set;
    }
    function clone(object) {
      var newObject = {},
        property = void 0;
      for (property in object) {
        if (applyUtility(hasOwnProperty, object, [property])) {
          newObject[property] = object[property];
        }
      }
      return newObject;
    }
    if (!applyUtility) {
      applyUtility = function (fun, thisValue, args) {
        return fun.apply(thisValue, args);
      };
    }
    var seal =
        Object.seal ||
        function (value) {
          return value;
        },
      mustachePattern = seal(/\{\{[\s\S]*|[\s\S]*\}\}/gm),
      templatePattern = seal(/<%[\s\S]*|[\s\S]*%>/gm),
      dataAttributePattern = seal(/^data-[\-\w.\u00B7-\uFFFF]/),
      ariaAttributePattern = seal(/^aria-[\-\w]+$/),
      allowedUriPattern = seal(
        /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
      ),
      scriptOrDataPattern = seal(/^(?:\w+script|data):/i),
      attributeWhitespacePattern = seal(
        /[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205f\u3000]/g,
      ),
      _typeof =
        'function' == typeof Symbol && 'symbol' == typeof Symbol.iterator
          ? function (value) {
              return typeof value;
            }
          : function (value) {
              if (
                value &&
                'function' == typeof Symbol &&
                value.constructor === Symbol &&
                value !== Symbol.prototype
              ) {
                return 'symbol';
              } else {
                return typeof value;
              }
            };
    function toArray(iterable) {
      if (Array.isArray(iterable)) {
        for (
          var itemIndex = 0, copy = Array(iterable.length);
          itemIndex < iterable.length;
          itemIndex++
        ) {
          copy[itemIndex] = iterable[itemIndex];
        }
        return copy;
      }
      return Array.from(iterable);
    }
    var applyFunction = ('undefined' != typeof Reflect && Reflect).apply,
      arraySlice = Array.prototype.slice,
      freezeObject = Object.freeze,
      getGlobal = function () {
        if ('undefined' == typeof window) {
          return null;
        } else {
          return window;
        }
      };
    if (!applyFunction) {
      applyFunction = function (fun, thisValue, args) {
        return fun.apply(thisValue, args);
      };
    }
    var _createTrustedTypesPolicy = function (trustedTypes, document) {
      if (
        'object' !== (void 0 === trustedTypes ? 'undefined' : _typeof(trustedTypes)) ||
        'function' != typeof trustedTypes.createPolicy
      ) {
        return null;
      }
      var suffix = null;
      if (document.currentScript && document.currentScript.hasAttribute('data-tt-policy-suffix')) {
        suffix = document.currentScript.getAttribute('data-tt-policy-suffix');
      }
      var policyName = 'dompurify' + (suffix ? '#' + suffix : '');
      try {
        return trustedTypes.createPolicy(policyName, {
          createHTML: function (html) {
            return html;
          },
        });
      } catch (error) {
        console.warn('TrustedTypes policy ' + policyName + ' could not be created.');
        return null;
      }
    };
    return (function createDOMPurify() {
      var window = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : getGlobal(),
        DOMPurify = function (root) {
          return createDOMPurify(root);
        };
      DOMPurify.version = '2.0.7';
      DOMPurify.removed = [];
      if (!window || !window.document || 9 !== window.document.nodeType) {
        DOMPurify.isSupported = false;
        return DOMPurify;
      }
      var originalDocument = window.document,
        useDOMParser = false,
        removeTitle = false,
        document = window.document,
        DocumentFragment = window.DocumentFragment,
        HTMLTemplateElement = window.HTMLTemplateElement,
        Node = window.Node,
        NodeFilter = window.NodeFilter,
        NativeNamedNodeMap = window.NamedNodeMap,
        NamedNodeMap =
          void 0 === NativeNamedNodeMap
            ? window.NamedNodeMap || window.MozNamedAttrMap
            : NativeNamedNodeMap,
        Text = window.Text,
        Comment = window.Comment,
        DOMParser = window.DOMParser,
        TrustedTypes = window.TrustedTypes;
      if ('function' == typeof HTMLTemplateElement) {
        var template = document.createElement('template');
        if (template.content && template.content.ownerDocument) {
          document = template.content.ownerDocument;
        }
      }
      var trustedTypesPolicy = _createTrustedTypesPolicy(TrustedTypes, originalDocument),
        emptyHTML = trustedTypesPolicy ? trustedTypesPolicy.createHTML('') : '',
        sourceDocument = document,
        implementation = sourceDocument.implementation,
        createNodeIterator = sourceDocument.createNodeIterator,
        getElementsByTagName = sourceDocument.getElementsByTagName,
        createDocumentFragment = sourceDocument.createDocumentFragment,
        importNode = originalDocument.importNode,
        hooks = {};
      DOMPurify.isSupported =
        implementation &&
        void 0 !== implementation.createHTMLDocument &&
        9 !== document.documentMode;
      var MUSTACHE_EXPR = mustachePattern,
        ERB_EXPR = templatePattern,
        DATA_ATTR = dataAttributePattern,
        ARIA_ATTR = ariaAttributePattern,
        IS_SCRIPT_OR_DATA = scriptOrDataPattern,
        ATTR_WHITESPACE = attributeWhitespacePattern,
        IS_ALLOWED_URI = allowedUriPattern,
        ALLOWED_TAGS = null,
        DEFAULT_ALLOWED_TAGS = addToSet(
          {},
          [].concat(
            toArray(htmlTags),
            toArray(svgTags),
            toArray(svgFilterTags),
            toArray(mathTags),
            toArray(textTags),
          ),
        ),
        ALLOWED_ATTR = null,
        DEFAULT_ALLOWED_ATTR = addToSet(
          {},
          [].concat(
            toArray(htmlAttributes),
            toArray(svgAttributes),
            toArray(mathAttributes),
            toArray(xmlAttributes),
          ),
        ),
        FORBID_TAGS = null,
        FORBID_ATTR = null,
        ALLOW_ARIA_ATTR = true,
        ALLOW_DATA_ATTR = true,
        ALLOW_UNKNOWN_PROTOCOLS = false,
        SAFE_FOR_JQUERY = false,
        SAFE_FOR_TEMPLATES = false,
        WHOLE_DOCUMENT = false,
        SET_CONFIG = false,
        FORCE_BODY = false,
        RETURN_DOM = false,
        RETURN_DOM_FRAGMENT = false,
        RETURN_DOM_IMPORT = false,
        RETURN_TRUSTED_TYPE = false,
        SANITIZE_DOM = true,
        KEEP_CONTENT = true,
        IN_PLACE = false,
        USE_PROFILES = {},
        FORBID_CONTENTS = addToSet({}, [
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
        DATA_URI_TAGS = addToSet({}, ['audio', 'video', 'img', 'source', 'image', 'iframe']),
        URI_SAFE_ATTRIBUTES = null,
        DEFAULT_URI_SAFE_ATTRIBUTES = addToSet({}, [
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
        CONFIG = null,
        formElement = document.createElement('form'),
        _parseConfig = function (cfg) {
          if (!(CONFIG && CONFIG === cfg)) {
            if (!(cfg && 'object' === (void 0 === cfg ? 'undefined' : _typeof(cfg)))) {
              cfg = {};
            }
            ALLOWED_TAGS =
              'ALLOWED_TAGS' in cfg ? addToSet({}, cfg.ALLOWED_TAGS) : DEFAULT_ALLOWED_TAGS;
            ALLOWED_ATTR =
              'ALLOWED_ATTR' in cfg ? addToSet({}, cfg.ALLOWED_ATTR) : DEFAULT_ALLOWED_ATTR;
            URI_SAFE_ATTRIBUTES =
              'ADD_URI_SAFE_ATTR' in cfg
                ? addToSet(clone(DEFAULT_URI_SAFE_ATTRIBUTES), cfg.ADD_URI_SAFE_ATTR)
                : DEFAULT_URI_SAFE_ATTRIBUTES;
            FORBID_TAGS = 'FORBID_TAGS' in cfg ? addToSet({}, cfg.FORBID_TAGS) : {};
            FORBID_ATTR = 'FORBID_ATTR' in cfg ? addToSet({}, cfg.FORBID_ATTR) : {};
            USE_PROFILES = 'USE_PROFILES' in cfg && cfg.USE_PROFILES;
            ALLOW_ARIA_ATTR = false !== cfg.ALLOW_ARIA_ATTR;
            ALLOW_DATA_ATTR = false !== cfg.ALLOW_DATA_ATTR;
            ALLOW_UNKNOWN_PROTOCOLS = cfg.ALLOW_UNKNOWN_PROTOCOLS || false;
            SAFE_FOR_JQUERY = cfg.SAFE_FOR_JQUERY || false;
            SAFE_FOR_TEMPLATES = cfg.SAFE_FOR_TEMPLATES || false;
            WHOLE_DOCUMENT = cfg.WHOLE_DOCUMENT || false;
            RETURN_DOM = cfg.RETURN_DOM || false;
            RETURN_DOM_FRAGMENT = cfg.RETURN_DOM_FRAGMENT || false;
            RETURN_DOM_IMPORT = cfg.RETURN_DOM_IMPORT || false;
            RETURN_TRUSTED_TYPE = cfg.RETURN_TRUSTED_TYPE || false;
            FORCE_BODY = cfg.FORCE_BODY || false;
            SANITIZE_DOM = false !== cfg.SANITIZE_DOM;
            KEEP_CONTENT = false !== cfg.KEEP_CONTENT;
            IN_PLACE = cfg.IN_PLACE || false;
            IS_ALLOWED_URI = cfg.ALLOWED_URI_REGEXP || IS_ALLOWED_URI;
            if (SAFE_FOR_TEMPLATES) {
              ALLOW_DATA_ATTR = false;
            }
            if (RETURN_DOM_FRAGMENT) {
              RETURN_DOM = true;
            }
            if (USE_PROFILES) {
              ALLOWED_TAGS = addToSet({}, [].concat(toArray(textTags)));
              ALLOWED_ATTR = [];
              if (true === USE_PROFILES.html) {
                addToSet(ALLOWED_TAGS, htmlTags);
                addToSet(ALLOWED_ATTR, htmlAttributes);
              }
              if (true === USE_PROFILES.svg) {
                addToSet(ALLOWED_TAGS, svgTags);
                addToSet(ALLOWED_ATTR, svgAttributes);
                addToSet(ALLOWED_ATTR, xmlAttributes);
              }
              if (true === USE_PROFILES.svgFilters) {
                addToSet(ALLOWED_TAGS, svgFilterTags);
                addToSet(ALLOWED_ATTR, svgAttributes);
                addToSet(ALLOWED_ATTR, xmlAttributes);
              }
              if (true === USE_PROFILES.mathMl) {
                addToSet(ALLOWED_TAGS, mathTags);
                addToSet(ALLOWED_ATTR, mathAttributes);
                addToSet(ALLOWED_ATTR, xmlAttributes);
              }
            }
            if (cfg.ADD_TAGS) {
              if (ALLOWED_TAGS === DEFAULT_ALLOWED_TAGS) {
                ALLOWED_TAGS = clone(ALLOWED_TAGS);
              }
              addToSet(ALLOWED_TAGS, cfg.ADD_TAGS);
            }
            if (cfg.ADD_ATTR) {
              if (ALLOWED_ATTR === DEFAULT_ALLOWED_ATTR) {
                ALLOWED_ATTR = clone(ALLOWED_ATTR);
              }
              addToSet(ALLOWED_ATTR, cfg.ADD_ATTR);
            }
            if (cfg.ADD_URI_SAFE_ATTR) {
              addToSet(URI_SAFE_ATTRIBUTES, cfg.ADD_URI_SAFE_ATTR);
            }
            if (KEEP_CONTENT) {
              ALLOWED_TAGS['#text'] = true;
            }
            if (WHOLE_DOCUMENT) {
              addToSet(ALLOWED_TAGS, ['html', 'head', 'body']);
            }
            if (ALLOWED_TAGS.table) {
              addToSet(ALLOWED_TAGS, ['tbody']);
              delete FORBID_TAGS.tbody;
            }
            if (freezeObject) {
              freezeObject(cfg);
            }
            CONFIG = cfg;
          }
        },
        _forceRemove = function (node) {
          DOMPurify.removed.push({ element: node });
          try {
            node.parentNode.removeChild(node);
          } catch (error) {
            node.outerHTML = emptyHTML;
          }
        },
        _removeAttribute = function (name, node) {
          try {
            DOMPurify.removed.push({ attribute: node.getAttributeNode(name), from: node });
          } catch (error) {
            DOMPurify.removed.push({ attribute: null, from: node });
          }
          node.removeAttribute(name);
        },
        _initDocument = function (dirty) {
          var doc = void 0,
            leadingWhitespace = void 0;
          if (FORCE_BODY) {
            dirty = '<remove></remove>' + dirty;
          } else {
            var matches = dirty.match(/^[\s]+/);
            if ((leadingWhitespace = matches && matches[0])) {
              dirty = dirty.slice(leadingWhitespace.length);
            }
          }
          if (useDOMParser) {
            try {
              doc = new DOMParser().parseFromString(dirty, 'text/html');
            } catch (error) {}
          }
          if (removeTitle) {
            addToSet(FORBID_TAGS, ['title']);
          }
          if (!doc || !doc.documentElement) {
            var body = (doc = implementation.createHTMLDocument('')).body;
            body.parentNode.removeChild(body.parentNode.firstElementChild);
            body.outerHTML = trustedTypesPolicy ? trustedTypesPolicy.createHTML(dirty) : dirty;
          }
          if (dirty && leadingWhitespace) {
            doc.body.insertBefore(
              document.createTextNode(leadingWhitespace),
              doc.body.childNodes[0] || null,
            );
          }
          return getElementsByTagName.call(doc, WHOLE_DOCUMENT ? 'html' : 'body')[0];
        };
      if (DOMPurify.isSupported) {
        (function () {
          try {
            if (
              _initDocument(
                '<svg><p><textarea><img src="</textarea><img src=x abc=1//">',
              ).querySelector('svg img')
            ) {
              useDOMParser = true;
            }
          } catch (error) {}
        })();
        (function () {
          try {
            var doc = _initDocument('<x/><title>&lt;/title&gt;&lt;img&gt;');
            if (/<\/title/.test(doc.querySelector('title').innerHTML)) {
              removeTitle = true;
            }
          } catch (error) {}
        })();
      }
      var _createIterator = function (root) {
          return createNodeIterator.call(
            root.ownerDocument || root,
            root,
            NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_TEXT,
            function () {
              return NodeFilter.FILTER_ACCEPT;
            },
            false,
          );
        },
        _isNode = function (obj) {
          if ('object' === (void 0 === Node ? 'undefined' : _typeof(Node))) {
            return obj instanceof Node;
          } else {
            return (
              obj &&
              'object' === (void 0 === obj ? 'undefined' : _typeof(obj)) &&
              'number' == typeof obj.nodeType &&
              'string' == typeof obj.nodeName
            );
          }
        },
        _executeHook = function (entryPoint, currentNode, data) {
          if (hooks[entryPoint]) {
            hooks[entryPoint].forEach(function (hook) {
              hook.call(DOMPurify, currentNode, data, CONFIG);
            });
          }
        },
        _sanitizeElements = function (currentNode) {
          var inspectedNode,
            sanitizedText = void 0;
          _executeHook('beforeSanitizeElements', currentNode, null);
          if (
            !(
              (inspectedNode = currentNode) instanceof Text ||
              inspectedNode instanceof Comment ||
              ('string' == typeof inspectedNode.nodeName &&
                'string' == typeof inspectedNode.textContent &&
                'function' == typeof inspectedNode.removeChild &&
                inspectedNode.attributes instanceof NamedNodeMap &&
                'function' == typeof inspectedNode.removeAttribute &&
                'function' == typeof inspectedNode.setAttribute &&
                'string' == typeof inspectedNode.namespaceURI)
            )
          ) {
            _forceRemove(currentNode);
            return true;
          }
          var tagName = currentNode.nodeName.toLowerCase();
          _executeHook('uponSanitizeElement', currentNode, {
            tagName: tagName,
            allowedTags: ALLOWED_TAGS,
          });
          if (
            ('svg' === tagName || 'math' === tagName) &&
            0 !== currentNode.querySelectorAll('p, br').length
          ) {
            _forceRemove(currentNode);
            return true;
          }
          if (!ALLOWED_TAGS[tagName] || FORBID_TAGS[tagName]) {
            if (
              KEEP_CONTENT &&
              !FORBID_CONTENTS[tagName] &&
              'function' == typeof currentNode.insertAdjacentHTML
            ) {
              try {
                var htmlToInsert = currentNode.innerHTML;
                currentNode.insertAdjacentHTML(
                  'AfterEnd',
                  trustedTypesPolicy ? trustedTypesPolicy.createHTML(htmlToInsert) : htmlToInsert,
                );
              } catch (error) {}
            }
            _forceRemove(currentNode);
            return true;
          }
          if ('noscript' === tagName && /<\/noscript/i.test(currentNode.innerHTML)) {
            _forceRemove(currentNode);
            return true;
          } else {
            if ('noembed' === tagName && /<\/noembed/i.test(currentNode.innerHTML)) {
              _forceRemove(currentNode);
              return true;
            } else {
              if (
                !(
                  !SAFE_FOR_JQUERY ||
                  currentNode.firstElementChild ||
                  (currentNode.content && currentNode.content.firstElementChild) ||
                  !/</g.test(currentNode.textContent)
                )
              ) {
                DOMPurify.removed.push({ element: currentNode.cloneNode() });
                if (currentNode.innerHTML) {
                  currentNode.innerHTML = currentNode.innerHTML.replace(/</g, '&lt;');
                } else {
                  currentNode.innerHTML = currentNode.textContent.replace(/</g, '&lt;');
                }
              }
              if (SAFE_FOR_TEMPLATES && 3 === currentNode.nodeType) {
                sanitizedText = (sanitizedText = (sanitizedText = currentNode.textContent).replace(
                  MUSTACHE_EXPR,
                  ' ',
                )).replace(ERB_EXPR, ' ');
                if (currentNode.textContent !== sanitizedText) {
                  DOMPurify.removed.push({ element: currentNode.cloneNode() });
                  currentNode.textContent = sanitizedText;
                }
              }
              _executeHook('afterSanitizeElements', currentNode, null);
              return false;
            }
          }
        },
        _isValidAttribute = function (lcTag, lcName, value) {
          if (
            SANITIZE_DOM &&
            ('id' === lcName || 'name' === lcName) &&
            (value in document || value in formElement)
          ) {
            return false;
          }
          if (ALLOW_DATA_ATTR && DATA_ATTR.test(lcName)) {
          } else {
            if (ALLOW_ARIA_ATTR && ARIA_ATTR.test(lcName)) {
            } else {
              if (!ALLOWED_ATTR[lcName] || FORBID_ATTR[lcName]) {
                return false;
              }
              if (URI_SAFE_ATTRIBUTES[lcName]) {
              } else {
                if (IS_ALLOWED_URI.test(value.replace(ATTR_WHITESPACE, ''))) {
                } else {
                  if (
                    ('src' !== lcName && 'xlink:href' !== lcName && 'href' !== lcName) ||
                    'script' === lcTag ||
                    0 !== value.indexOf('data:') ||
                    !DATA_URI_TAGS[lcTag]
                  ) {
                    if (
                      ALLOW_UNKNOWN_PROTOCOLS &&
                      !IS_SCRIPT_OR_DATA.test(value.replace(ATTR_WHITESPACE, ''))
                    ) {
                    } else {
                      if (value) {
                        return false;
                      }
                    }
                  }
                }
              }
            }
          }
          return true;
        },
        _sanitizeAttributes = function (currentNode) {
          var attr = void 0,
            value = void 0,
            lcName = void 0,
            idAttr = void 0,
            attributeIndex = void 0;
          _executeHook('beforeSanitizeAttributes', currentNode, null);
          var attributes = currentNode.attributes;
          if (attributes) {
            var hookEvent = {
              attrName: '',
              attrValue: '',
              keepAttr: true,
              allowedAttributes: ALLOWED_ATTR,
            };
            for (attributeIndex = attributes.length; attributeIndex--; ) {
              var attributeRecord = (attr = attributes[attributeIndex]),
                name = attributeRecord.name,
                namespaceURI = attributeRecord.namespaceURI;
              value = attr.value.trim();
              lcName = name.toLowerCase();
              hookEvent.attrName = lcName;
              hookEvent.attrValue = value;
              hookEvent.keepAttr = true;
              _executeHook('uponSanitizeAttribute', currentNode, hookEvent);
              value = hookEvent.attrValue;
              if ('name' === lcName && 'IMG' === currentNode.nodeName && attributes.id) {
                idAttr = attributes.id;
                attributes = applyFunction(arraySlice, attributes, []);
                _removeAttribute('id', currentNode);
                _removeAttribute(name, currentNode);
                if (attributes.indexOf(idAttr) > attributeIndex) {
                  currentNode.setAttribute('id', idAttr.value);
                }
              } else {
                if (
                  'INPUT' === currentNode.nodeName &&
                  'type' === lcName &&
                  'file' === value &&
                  hookEvent.keepAttr &&
                  (ALLOWED_ATTR[lcName] || !FORBID_ATTR[lcName])
                ) {
                  continue;
                }
                if ('id' === name) {
                  currentNode.setAttribute(name, '');
                }
                _removeAttribute(name, currentNode);
              }
              if (hookEvent.keepAttr) {
                if (
                  /svg|math/i.test(currentNode.namespaceURI) &&
                  new RegExp('</(' + Object.keys(FORBID_CONTENTS).join('|') + ')', 'i').test(value)
                ) {
                  _removeAttribute(name, currentNode);
                } else {
                  if (SAFE_FOR_TEMPLATES) {
                    value = (value = value.replace(MUSTACHE_EXPR, ' ')).replace(ERB_EXPR, ' ');
                  }
                  var lcTag = currentNode.nodeName.toLowerCase();
                  if (_isValidAttribute(lcTag, lcName, value)) {
                    try {
                      if (namespaceURI) {
                        currentNode.setAttributeNS(namespaceURI, name, value);
                      } else {
                        currentNode.setAttribute(name, value);
                      }
                      DOMPurify.removed.pop();
                    } catch (error) {}
                  }
                }
              }
            }
            _executeHook('afterSanitizeAttributes', currentNode, null);
          }
        },
        _sanitizeShadowDOM = function _sanitizeShadowDOM(fragment) {
          var shadowNode = void 0,
            shadowIterator = _createIterator(fragment);
          for (
            _executeHook('beforeSanitizeShadowDOM', fragment, null);
            (shadowNode = shadowIterator.nextNode());
          ) {
            _executeHook('uponSanitizeShadowNode', shadowNode, null);
            if (!_sanitizeElements(shadowNode)) {
              if (shadowNode.content instanceof DocumentFragment) {
                _sanitizeShadowDOM(shadowNode.content);
              }
              _sanitizeAttributes(shadowNode);
            }
          }
          _executeHook('afterSanitizeShadowDOM', fragment, null);
        };
      DOMPurify.sanitize = function (dirty, cfg) {
        var body = void 0,
          importedNode = void 0,
          currentNode = void 0,
          oldNode = void 0,
          returnNode = void 0;
        if (!dirty) {
          dirty = '\x3c!--\x3e';
        }
        if ('string' != typeof dirty && !_isNode(dirty)) {
          if ('function' != typeof dirty.toString) {
            throw new TypeError('toString is not a function');
          }
          if ('string' != typeof (dirty = dirty.toString())) {
            throw new TypeError('dirty is not a string, aborting');
          }
        }
        if (!DOMPurify.isSupported) {
          if (
            'object' === _typeof(window.toStaticHTML) ||
            'function' == typeof window.toStaticHTML
          ) {
            if ('string' == typeof dirty) {
              return window.toStaticHTML(dirty);
            }
            if (_isNode(dirty)) {
              return window.toStaticHTML(dirty.outerHTML);
            }
          }
          return dirty;
        }
        if (!SET_CONFIG) {
          _parseConfig(cfg);
        }
        DOMPurify.removed = [];
        if (IN_PLACE) {
        } else {
          if (dirty instanceof Node) {
            if (
              1 ===
                (importedNode = (body = _initDocument('\x3c!--\x3e')).ownerDocument.importNode(
                  dirty,
                  true,
                )).nodeType &&
              'BODY' === importedNode.nodeName
            ) {
              body = importedNode;
            } else {
              if ('HTML' === importedNode.nodeName) {
                body = importedNode;
              } else {
                body.appendChild(importedNode);
              }
            }
          } else {
            if (
              !RETURN_DOM &&
              !SAFE_FOR_TEMPLATES &&
              !WHOLE_DOCUMENT &&
              RETURN_TRUSTED_TYPE &&
              -1 === dirty.indexOf('<')
            ) {
              if (trustedTypesPolicy) {
                return trustedTypesPolicy.createHTML(dirty);
              } else {
                return dirty;
              }
            }
            if (!(body = _initDocument(dirty))) {
              if (RETURN_DOM) {
                return null;
              } else {
                return emptyHTML;
              }
            }
          }
        }
        if (body && FORCE_BODY) {
          _forceRemove(body.firstChild);
        }
        for (
          var nodeIterator = _createIterator(IN_PLACE ? dirty : body);
          (currentNode = nodeIterator.nextNode());
        ) {
          if (
            !(
              (3 === currentNode.nodeType && currentNode === oldNode) ||
              _sanitizeElements(currentNode)
            )
          ) {
            if (currentNode.content instanceof DocumentFragment) {
              _sanitizeShadowDOM(currentNode.content);
            }
            _sanitizeAttributes(currentNode);
            oldNode = currentNode;
          }
        }
        oldNode = null;
        if (IN_PLACE) {
          return dirty;
        }
        if (RETURN_DOM) {
          if (RETURN_DOM_FRAGMENT) {
            for (returnNode = createDocumentFragment.call(body.ownerDocument); body.firstChild; ) {
              returnNode.appendChild(body.firstChild);
            }
          } else {
            returnNode = body;
          }
          if (RETURN_DOM_IMPORT) {
            returnNode = importNode.call(originalDocument, returnNode, true);
          }
          return returnNode;
        }
        var serializedHTML = WHOLE_DOCUMENT ? body.outerHTML : body.innerHTML;
        if (SAFE_FOR_TEMPLATES) {
          serializedHTML = (serializedHTML = serializedHTML.replace(MUSTACHE_EXPR, ' ')).replace(
            ERB_EXPR,
            ' ',
          );
        }
        if (trustedTypesPolicy && RETURN_TRUSTED_TYPE) {
          return trustedTypesPolicy.createHTML(serializedHTML);
        } else {
          return serializedHTML;
        }
      };
      DOMPurify.setConfig = function (cfg) {
        _parseConfig(cfg);
        SET_CONFIG = true;
      };
      DOMPurify.clearConfig = function () {
        CONFIG = null;
        SET_CONFIG = false;
      };
      DOMPurify.isValidAttribute = function (tag, attr, value) {
        if (!CONFIG) {
          _parseConfig({});
        }
        var lcTag = tag.toLowerCase(),
          lcName = attr.toLowerCase();
        return _isValidAttribute(lcTag, lcName, value);
      };
      DOMPurify.addHook = function (entryPoint, hookFunction) {
        if ('function' == typeof hookFunction) {
          hooks[entryPoint] = hooks[entryPoint] || [];
          hooks[entryPoint].push(hookFunction);
        }
      };
      DOMPurify.removeHook = function (entryPoint) {
        if (hooks[entryPoint]) {
          hooks[entryPoint].pop();
        }
      };
      DOMPurify.removeHooks = function (entryPoint) {
        if (hooks[entryPoint]) {
          hooks[entryPoint] = [];
        }
      };
      DOMPurify.removeAllHooks = function () {
        hooks = {};
      };
      return DOMPurify;
    })();
  };
}
