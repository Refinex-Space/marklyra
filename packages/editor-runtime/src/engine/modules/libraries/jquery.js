// Install this compatibility library in the supplied engine environment.
export default function installLibrariesJquery(engineModules, vendorScope) {
  // libraries/jquery.
  // Vendor adapter; version and local behavior are preserved.
  (function (global, factory) {
    'use strict';
    if (
      'object' == typeof vendorScope.commonJsModule &&
      'object' == typeof vendorScope.commonJsModule.exports
    ) {
      vendorScope.commonJsModule.exports = global.document
        ? factory(global, true)
        : function (windowGlobal) {
            if (!windowGlobal.document) {
              throw new Error('jQuery requires a window with a document');
            }
            return factory(windowGlobal);
          };
    } else {
      factory(global);
    }
  })('undefined' != typeof window ? window : this, function (window, noGlobal) {
    'use strict';

    var items = [],
      document = window.document,
      getProto = Object.getPrototypeOf,
      slice = items.slice,
      concat = items.concat,
      push = items.push,
      indexOf = items.indexOf,
      class2type = {},
      toString = class2type.toString,
      hasOwn = class2type.hasOwnProperty,
      fnToString = hasOwn.toString,
      ObjectFunctionString = fnToString.call(Object),
      support = {},
      isFunction = function (object) {
        return 'function' == typeof object && 'number' != typeof object.nodeType;
      },
      isWindow = function (object) {
        return null != object && object === object.window;
      },
      preservedScriptAttributes = { type: true, src: true, noModule: true };
    function DOMEval(code, documentModel, node) {
      var attributeName,
        script = (documentModel = documentModel || document).createElement('script');
      script.text = code;
      if (node) {
        for (attributeName in preservedScriptAttributes) {
          if (node[attributeName]) {
            script[attributeName] = node[attributeName];
          }
        }
      }
      documentModel.head.appendChild(script).parentNode.removeChild(script);
    }
    function toType(object) {
      if (null == object) {
        return object + '';
      } else {
        if ('object' == typeof object || 'function' == typeof object) {
          return class2type[toString.call(object)] || 'object';
        } else {
          return typeof object;
        }
      }
    }
    var jQuery = function (selector, context) {
        return new jQuery.fn.init(selector, context);
      },
      rtrim = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g;
    function isArrayLike(object) {
      var length = !!object && 'length' in object && object.length,
        type = toType(object);
      return (
        !isFunction(object) &&
        !isWindow(object) &&
        ('array' === type ||
          0 === length ||
          ('number' == typeof length && length > 0 && length - 1 in object))
      );
    }
    jQuery.fn = jQuery.prototype = {
      jquery: '3.3.1',
      constructor: jQuery,
      length: 0,
      toArray: function () {
        return slice.call(this);
      },
      get: function (num) {
        if (null == num) {
          return slice.call(this);
        } else {
          if (num < 0) {
            return this[num + this.length];
          } else {
            return this[num];
          }
        }
      },
      pushStack: function (elems) {
        var ret = jQuery.merge(this.constructor(), elems);
        ret.prevObject = this;
        return ret;
      },
      each: function (callback) {
        return jQuery.each(this, callback);
      },
      map: function (callback) {
        return this.pushStack(
          jQuery.map(this, function (elem, itemIndex) {
            return callback.call(elem, itemIndex, elem);
          }),
        );
      },
      slice: function () {
        return this.pushStack(slice.apply(this, arguments));
      },
      first: function () {
        return this.eq(0);
      },
      last: function () {
        return this.eq(-1);
      },
      eq: function (index) {
        var len = this.length,
          resolvedIndex = +index + (index < 0 ? len : 0);
        return this.pushStack(
          resolvedIndex >= 0 && resolvedIndex < len ? [this[resolvedIndex]] : [],
        );
      },
      end: function () {
        return this.prevObject || this.constructor();
      },
      push: push,
      sort: items.sort,
      splice: items.splice,
    };
    jQuery.extend = jQuery.fn.extend = function () {
      var options,
        name,
        src,
        copy,
        copyIsArray,
        clone,
        target = arguments[0] || {},
        sourceIndex = 1,
        length = arguments.length,
        deep = false;
      for (
        'boolean' == typeof target &&
          ((deep = target), (target = arguments[sourceIndex] || {}), sourceIndex++),
          'object' == typeof target || isFunction(target) || (target = {}),
          sourceIndex === length && ((target = this), sourceIndex--);
        sourceIndex < length;
        sourceIndex++
      ) {
        if (null != (options = arguments[sourceIndex])) {
          for (name in options) {
            src = target[name];
            if (target !== (copy = options[name])) {
              if (
                deep &&
                copy &&
                (jQuery.isPlainObject(copy) || (copyIsArray = Array.isArray(copy)))
              ) {
                if (copyIsArray) {
                  copyIsArray = false;
                  clone = src && Array.isArray(src) ? src : [];
                } else {
                  clone = src && jQuery.isPlainObject(src) ? src : {};
                }
                target[name] = jQuery.extend(deep, clone, copy);
              } else {
                if (void 0 !== copy) {
                  target[name] = copy;
                }
              }
            }
          }
        }
      }
      return target;
    };
    jQuery.extend({
      expando: 'jQuery' + ('3.3.1' + Math.random()).replace(/\D/g, ''),
      isReady: true,
      error: function (msg) {
        throw new Error(msg);
      },
      noop: function () {},
      isPlainObject: function (object) {
        var proto, Ctor;
        return !(
          !object ||
          '[object Object]' !== toString.call(object) ||
          ((proto = getProto(object)) &&
            ('function' != typeof (Ctor = hasOwn.call(proto, 'constructor') && proto.constructor) ||
              fnToString.call(Ctor) !== ObjectFunctionString))
        );
      },
      isEmptyObject: function (object) {
        var name;
        for (name in object) {
          return false;
        }
        return true;
      },
      globalEval: function (code) {
        DOMEval(code);
      },
      each: function (object, callback) {
        var length,
          itemIndex = 0;
        if (isArrayLike(object)) {
          for (
            length = object.length;
            itemIndex < length &&
            false !== callback.call(object[itemIndex], itemIndex, object[itemIndex]);
            itemIndex++
          ) {}
        } else {
          for (itemIndex in object) {
            if (false === callback.call(object[itemIndex], itemIndex, object[itemIndex])) {
              break;
            }
          }
        }
        return object;
      },
      trim: function (text) {
        if (null == text) {
          return '';
        } else {
          return (text + '').replace(rtrim, '');
        }
      },
      makeArray: function (items, results) {
        var ret = results || [];
        if (null != items) {
          if (isArrayLike(Object(items))) {
            jQuery.merge(ret, 'string' == typeof items ? [items] : items);
          } else {
            push.call(ret, items);
          }
        }
        return ret;
      },
      inArray: function (elem, items, fromIndex) {
        if (null == items) {
          return -1;
        } else {
          return indexOf.call(items, elem, fromIndex);
        }
      },
      merge: function (first, second) {
        for (
          var len = +second.length, sourceIndex = 0, targetLength = first.length;
          sourceIndex < len;
          sourceIndex++
        ) {
          first[targetLength++] = second[sourceIndex];
        }
        first.length = targetLength;
        return first;
      },
      grep: function (elems, callback, invert) {
        for (
          var matches = [], itemIndex = 0, length = elems.length, callbackExpect = !invert;
          itemIndex < length;
          itemIndex++
        ) {
          if (!callback(elems[itemIndex], itemIndex) !== callbackExpect) {
            matches.push(elems[itemIndex]);
          }
        }
        return matches;
      },
      map: function (elems, callback, arg) {
        var length,
          value,
          itemIndex = 0,
          ret = [];
        if (isArrayLike(elems)) {
          for (length = elems.length; itemIndex < length; itemIndex++) {
            if (null != (value = callback(elems[itemIndex], itemIndex, arg))) {
              ret.push(value);
            }
          }
        } else {
          for (itemIndex in elems) {
            if (null != (value = callback(elems[itemIndex], itemIndex, arg))) {
              ret.push(value);
            }
          }
        }
        return concat.apply([], ret);
      },
      guid: 1,
      support: support,
    });
    if ('function' == typeof Symbol) {
      jQuery.fn[Symbol.iterator] = items[Symbol.iterator];
    }
    jQuery.each(
      'Boolean Number String Function Array Date RegExp Object Error Symbol'.split(' '),
      function (typeIndex, name) {
        class2type['[object ' + name + ']'] = name.toLowerCase();
      },
    );
    var Sizzle = (function (window) {
      var windowGlobal,
        support,
        Expr,
        getText,
        isXML,
        tokenize,
        compile,
        select,
        outermostContext,
        sortInput,
        hasDuplicate,
        setDocument,
        document,
        docElem,
        documentIsHTML,
        rbuggyQSA,
        rbuggyMatches,
        matches,
        contains,
        expando = 'sizzle' + 1 * new Date(),
        preferredDoc = window.document,
        dirruns = 0,
        done = 0,
        classCache = createCache(),
        tokenCache = createCache(),
        compilerCache = createCache(),
        sortOrder = function (left, right) {
          if (left === right) {
            hasDuplicate = true;
          }
          return 0;
        },
        hasOwn = {}.hasOwnProperty,
        items = [],
        pop = items.pop,
        push_native = items.push,
        push = items.push,
        slice = items.slice,
        indexOf = function (list, elem) {
          for (var itemIndex = 0, len = list.length; itemIndex < len; itemIndex++) {
            if (list[itemIndex] === elem) {
              return itemIndex;
            }
          }
          return -1;
        },
        booleans =
          'checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|loop|multiple|open|readonly|required|scoped',
        whitespace = '[\\x20\\t\\r\\n\\f]',
        identifier = '(?:\\\\.|[\\w-]|[^\0-\\xa0])+',
        attributes =
          '\\[' +
          whitespace +
          '*(' +
          identifier +
          ')(?:' +
          whitespace +
          '*([*^$|!~]?=)' +
          whitespace +
          '*(?:\'((?:\\\\.|[^\\\\\'])*)\'|"((?:\\\\.|[^\\\\"])*)"|(' +
          identifier +
          '))|)' +
          whitespace +
          '*\\]',
        pseudos =
          ':(' +
          identifier +
          ')(?:\\(((\'((?:\\\\.|[^\\\\\'])*)\'|"((?:\\\\.|[^\\\\"])*)")|((?:\\\\.|[^\\\\()[\\]]|' +
          attributes +
          ')*)|.*)\\)|)',
        rwhitespace = new RegExp(whitespace + '+', 'g'),
        rtrim = new RegExp(
          '^' + whitespace + '+|((?:^|[^\\\\])(?:\\\\.)*)' + whitespace + '+$',
          'g',
        ),
        rcomma = new RegExp('^' + whitespace + '*,' + whitespace + '*'),
        rcombinators = new RegExp(
          '^' + whitespace + '*([>+~]|' + whitespace + ')' + whitespace + '*',
        ),
        rattributeQuotes = new RegExp(
          '=' + whitespace + '*([^\\]\'"]*?)' + whitespace + '*\\]',
          'g',
        ),
        rpseudo = new RegExp(pseudos),
        ridentifier = new RegExp('^' + identifier + '$'),
        matchExpr = {
          ID: new RegExp('^#(' + identifier + ')'),
          CLASS: new RegExp('^\\.(' + identifier + ')'),
          TAG: new RegExp('^(' + identifier + '|[*])'),
          ATTR: new RegExp('^' + attributes),
          PSEUDO: new RegExp('^' + pseudos),
          CHILD: new RegExp(
            '^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\(' +
              whitespace +
              '*(even|odd|(([+-]|)(\\d*)n|)' +
              whitespace +
              '*(?:([+-]|)' +
              whitespace +
              '*(\\d+)|))' +
              whitespace +
              '*\\)|)',
            'i',
          ),
          bool: new RegExp('^(?:' + booleans + ')$', 'i'),
          needsContext: new RegExp(
            '^' +
              whitespace +
              '*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\(' +
              whitespace +
              '*((?:-\\d)?\\d*)' +
              whitespace +
              '*\\)|)(?=[^-]|$)',
            'i',
          ),
        },
        rinputs = /^(?:input|select|textarea|button)$/i,
        rheader = /^h\d$/i,
        rnative = /^[^{]+\{\s*\[native \w/,
        rquickExpr = /^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,
        rsibling = /[+~]/,
        runescape = new RegExp(
          '\\\\([\\da-f]{1,6}' + whitespace + '?|(' + whitespace + ')|.)',
          'ig',
        ),
        funescape = function (escapeMatch, escaped, escapedWhitespace) {
          var high = '0x' + escaped - 65536;
          if (high != high || escapedWhitespace) {
            return escaped;
          } else {
            if (high < 0) {
              return String.fromCharCode(high + 65536);
            } else {
              return String.fromCharCode((high >> 10) | 55296, (1023 & high) | 56320);
            }
          }
        },
        rcssescape = /([\0-\x1f\x7f]|^-?\d)|^-$|[^\0-\x1f\x7f-\uFFFF\w-]/g,
        fcssescape = function (character, asCodePoint) {
          if (asCodePoint) {
            if ('\0' === character) {
              return '�';
            } else {
              return (
                character.slice(0, -1) +
                '\\' +
                character.charCodeAt(character.length - 1).toString(16) +
                ' '
              );
            }
          } else {
            return '\\' + character;
          }
        },
        unloadHandler = function () {
          setDocument();
        },
        disabledAncestor = addCombinator(
          function (elem) {
            return true === elem.disabled && ('form' in elem || 'label' in elem);
          },
          { dir: 'parentNode', next: 'legend' },
        );
      try {
        push.apply((items = slice.call(preferredDoc.childNodes)), preferredDoc.childNodes);
        items[preferredDoc.childNodes.length].nodeType;
      } catch (error) {
        push = {
          apply: items.length
            ? function (target, els) {
                push_native.apply(target, slice.call(els));
              }
            : function (target, els) {
                for (
                  var targetIndex = target.length, sourceIndex = 0;
                  (target[targetIndex++] = els[sourceIndex++]);
                ) {}
                target.length = targetIndex - 1;
              },
        };
      }
      function Sizzle(selector, context, results, seed) {
        var quickMatch,
          groupIndex,
          elem,
          nid,
          match,
          groups,
          newSelector,
          newContext = context && context.ownerDocument,
          nodeType = context ? context.nodeType : 9;
        results = results || [];
        if (
          'string' != typeof selector ||
          !selector ||
          (1 !== nodeType && 9 !== nodeType && 11 !== nodeType)
        ) {
          return results;
        }
        if (
          !seed &&
          ((context ? context.ownerDocument || context : preferredDoc) !== document &&
            setDocument(context),
          (context = context || document),
          documentIsHTML)
        ) {
          if (11 !== nodeType && (match = rquickExpr.exec(selector))) {
            if ((quickMatch = match[1])) {
              if (9 === nodeType) {
                if (!(elem = context.getElementById(quickMatch))) {
                  return results;
                }
                if (elem.id === quickMatch) {
                  results.push(elem);
                  return results;
                }
              } else {
                if (
                  newContext &&
                  (elem = newContext.getElementById(quickMatch)) &&
                  contains(context, elem) &&
                  elem.id === quickMatch
                ) {
                  results.push(elem);
                  return results;
                }
              }
            } else {
              if (match[2]) {
                push.apply(results, context.getElementsByTagName(selector));
                return results;
              }
              if (
                (quickMatch = match[3]) &&
                support.getElementsByClassName &&
                context.getElementsByClassName
              ) {
                push.apply(results, context.getElementsByClassName(quickMatch));
                return results;
              }
            }
          }
          if (
            support.qsa &&
            !compilerCache[selector + ' '] &&
            (!rbuggyQSA || !rbuggyQSA.test(selector))
          ) {
            if (1 !== nodeType) {
              newContext = context;
              newSelector = selector;
            } else {
              if ('object' !== context.nodeName.toLowerCase()) {
                for (
                  (nid = context.getAttribute('id'))
                    ? (nid = nid.replace(rcssescape, fcssescape))
                    : context.setAttribute('id', (nid = expando)),
                    groupIndex = (groups = tokenize(selector)).length;
                  groupIndex--;
                ) {
                  groups[groupIndex] = '#' + nid + ' ' + toSelector(groups[groupIndex]);
                }
                newSelector = groups.join(',');
                newContext =
                  (rsibling.test(selector) && testContext(context.parentNode)) || context;
              }
            }
            if (newSelector) {
              try {
                push.apply(results, newContext.querySelectorAll(newSelector));
                return results;
              } catch (qsaError) {
              } finally {
                if (nid === expando) {
                  context.removeAttribute('id');
                }
              }
            }
          }
        }
        return select(selector.replace(rtrim, '$1'), context, results, seed);
      }
      function createCache() {
        var keys = [];
        return function cache(key, value) {
          if (keys.push(key + ' ') > Expr.cacheLength) {
            delete cache[keys.shift()];
          }
          return (cache[key + ' '] = value);
        };
      }
      function markFunction(callback) {
        callback[expando] = true;
        return callback;
      }
      function assert(callback) {
        var element = document.createElement('fieldset');
        try {
          return !!callback(element);
        } catch (testElement) {
          return false;
        } finally {
          if (element.parentNode) {
            element.parentNode.removeChild(element);
          }
          element = null;
        }
      }
      function addHandle(attrs, handler) {
        for (var items = attrs.split('|'), attributeIndex = items.length; attributeIndex--; ) {
          Expr.attrHandle[items[attributeIndex]] = handler;
        }
      }
      function siblingCheck(left, right) {
        var cur = right && left,
          diff =
            cur &&
            1 === left.nodeType &&
            1 === right.nodeType &&
            left.sourceIndex - right.sourceIndex;
        if (diff) {
          return diff;
        }
        if (cur) {
          for (; (cur = cur.nextSibling); ) {
            if (cur === right) {
              return -1;
            }
          }
        }
        if (left) {
          return 1;
        } else {
          return -1;
        }
      }
      function createInputPseudo(type) {
        return function (elem) {
          return 'input' === elem.nodeName.toLowerCase() && elem.type === type;
        };
      }
      function createButtonPseudo(type) {
        return function (elem) {
          var name = elem.nodeName.toLowerCase();
          return ('input' === name || 'button' === name) && elem.type === type;
        };
      }
      function createDisabledPseudo(disabled) {
        return function (elem) {
          if ('form' in elem) {
            if (elem.parentNode && false === elem.disabled) {
              if ('label' in elem) {
                if ('label' in elem.parentNode) {
                  return elem.parentNode.disabled === disabled;
                } else {
                  return elem.disabled === disabled;
                }
              } else {
                return (
                  elem.isDisabled === disabled ||
                  (elem.isDisabled !== !disabled && disabledAncestor(elem) === disabled)
                );
              }
            } else {
              return elem.disabled === disabled;
            }
          } else {
            return 'label' in elem && elem.disabled === disabled;
          }
        };
      }
      function createPositionalPseudo(callback) {
        return markFunction(function (argument) {
          argument = +argument;
          return markFunction(function (seed, matches) {
            for (
              var seedIndex,
                matchIndexes = callback([], seed.length, argument),
                matchIndex = matchIndexes.length;
              matchIndex--;
            ) {
              if (seed[(seedIndex = matchIndexes[matchIndex])]) {
                seed[seedIndex] = !(matches[seedIndex] = seed[seedIndex]);
              }
            }
          });
        });
      }
      function testContext(context) {
        return context && void 0 !== context.getElementsByTagName && context;
      }
      for (windowGlobal in ((support = Sizzle.support = {}),
      (isXML = Sizzle.isXML =
        function (elem) {
          var documentElement = elem && (elem.ownerDocument || elem).documentElement;
          return !!documentElement && 'HTML' !== documentElement.nodeName;
        }),
      (setDocument = Sizzle.setDocument =
        function (node) {
          var hasCompare,
            subWindow,
            documentModel = node ? node.ownerDocument || node : preferredDoc;
          if (
            documentModel !== document &&
            9 === documentModel.nodeType &&
            documentModel.documentElement
          ) {
            docElem = (document = documentModel).documentElement;
            documentIsHTML = !isXML(document);
            if (
              preferredDoc !== document &&
              (subWindow = document.defaultView) &&
              subWindow.top !== subWindow
            ) {
              if (subWindow.addEventListener) {
                subWindow.addEventListener('unload', unloadHandler, false);
              } else {
                if (subWindow.attachEvent) {
                  subWindow.attachEvent('onunload', unloadHandler);
                }
              }
            }
            support.attributes = assert(function (element) {
              element.className = 'i';
              return !element.getAttribute('className');
            });
            support.getElementsByTagName = assert(function (element) {
              element.appendChild(document.createComment(''));
              return !element.getElementsByTagName('*').length;
            });
            support.getElementsByClassName = rnative.test(document.getElementsByClassName);
            support.getById = assert(function (element) {
              docElem.appendChild(element).id = expando;
              return !document.getElementsByName || !document.getElementsByName(expando).length;
            });
            if (support.getById) {
              Expr.filter.ID = function (id) {
                var attrId = id.replace(runescape, funescape);
                return function (elem) {
                  return elem.getAttribute('id') === attrId;
                };
              };
              Expr.find.ID = function (id, context) {
                if (void 0 !== context.getElementById && documentIsHTML) {
                  var elem = context.getElementById(id);
                  if (elem) {
                    return [elem];
                  } else {
                    return [];
                  }
                }
              };
            } else {
              Expr.filter.ID = function (id) {
                var attrId = id.replace(runescape, funescape);
                return function (elem) {
                  var node = void 0 !== elem.getAttributeNode && elem.getAttributeNode('id');
                  return node && node.value === attrId;
                };
              };
              Expr.find.ID = function (id, context) {
                if (void 0 !== context.getElementById && documentIsHTML) {
                  var node,
                    elementIndex,
                    elems,
                    elem = context.getElementById(id);
                  if (elem) {
                    if ((node = elem.getAttributeNode('id')) && node.value === id) {
                      return [elem];
                    }
                    for (
                      elems = context.getElementsByName(id), elementIndex = 0;
                      (elem = elems[elementIndex++]);
                    ) {
                      if ((node = elem.getAttributeNode('id')) && node.value === id) {
                        return [elem];
                      }
                    }
                  }
                  return [];
                }
              };
            }
            Expr.find.TAG = support.getElementsByTagName
              ? function (tag, context) {
                  if (void 0 !== context.getElementsByTagName) {
                    return context.getElementsByTagName(tag);
                  } else {
                    if (support.qsa) {
                      return context.querySelectorAll(tag);
                    } else {
                      return void 0;
                    }
                  }
                }
              : function (tag, context) {
                  var elem,
                    tmp = [],
                    elementIndex = 0,
                    results = context.getElementsByTagName(tag);
                  if ('*' === tag) {
                    for (; (elem = results[elementIndex++]); ) {
                      if (1 === elem.nodeType) {
                        tmp.push(elem);
                      }
                    }
                    return tmp;
                  }
                  return results;
                };
            Expr.find.CLASS =
              support.getElementsByClassName &&
              function (className, context) {
                if (void 0 !== context.getElementsByClassName && documentIsHTML) {
                  return context.getElementsByClassName(className);
                }
              };
            rbuggyMatches = [];
            rbuggyQSA = [];
            if ((support.qsa = rnative.test(document.querySelectorAll))) {
              assert(function (element) {
                docElem.appendChild(element).innerHTML =
                  "<a id='" +
                  expando +
                  "'></a><select id='" +
                  expando +
                  "-\r\\' msallowcapture=''><option selected=''></option></select>";
                if (element.querySelectorAll("[msallowcapture^='']").length) {
                  rbuggyQSA.push('[*^$]=' + whitespace + '*(?:\'\'|"")');
                }
                if (!element.querySelectorAll('[selected]').length) {
                  rbuggyQSA.push('\\[' + whitespace + '*(?:value|' + booleans + ')');
                }
                if (!element.querySelectorAll('[id~=' + expando + '-]').length) {
                  rbuggyQSA.push('~=');
                }
                if (!element.querySelectorAll(':checked').length) {
                  rbuggyQSA.push(':checked');
                }
                if (!element.querySelectorAll('a#' + expando + '+*').length) {
                  rbuggyQSA.push('.#.+[+~]');
                }
              });
              assert(function (element) {
                element.innerHTML =
                  "<a href='' disabled='disabled'></a><select disabled='disabled'><option/></select>";
                var input = document.createElement('input');
                input.setAttribute('type', 'hidden');
                element.appendChild(input).setAttribute('name', 'D');
                if (element.querySelectorAll('[name=d]').length) {
                  rbuggyQSA.push('name' + whitespace + '*[*^$|!~]?=');
                }
                if (2 !== element.querySelectorAll(':enabled').length) {
                  rbuggyQSA.push(':enabled', ':disabled');
                }
                docElem.appendChild(element).disabled = true;
                if (2 !== element.querySelectorAll(':disabled').length) {
                  rbuggyQSA.push(':enabled', ':disabled');
                }
                element.querySelectorAll('*,:x');
                rbuggyQSA.push(',.*:');
              });
            }
            if (
              (support.matchesSelector = rnative.test(
                (matches =
                  docElem.matches ||
                  docElem.webkitMatchesSelector ||
                  docElem.mozMatchesSelector ||
                  docElem.oMatchesSelector ||
                  docElem.msMatchesSelector),
              ))
            ) {
              assert(function (element) {
                support.disconnectedMatch = matches.call(element, '*');
                matches.call(element, "[s!='']:x");
                rbuggyMatches.push('!=', pseudos);
              });
            }
            rbuggyQSA = rbuggyQSA.length && new RegExp(rbuggyQSA.join('|'));
            rbuggyMatches = rbuggyMatches.length && new RegExp(rbuggyMatches.join('|'));
            hasCompare = rnative.test(docElem.compareDocumentPosition);
            contains =
              hasCompare || rnative.test(docElem.contains)
                ? function (parent, child) {
                    var adown = 9 === parent.nodeType ? parent.documentElement : parent,
                      bup = child && child.parentNode;
                    return (
                      parent === bup ||
                      !(
                        !bup ||
                        1 !== bup.nodeType ||
                        !(adown.contains
                          ? adown.contains(bup)
                          : parent.compareDocumentPosition &&
                            16 & parent.compareDocumentPosition(bup))
                      )
                    );
                  }
                : function (parent, child) {
                    if (child) {
                      for (; (child = child.parentNode); ) {
                        if (child === parent) {
                          return true;
                        }
                      }
                    }
                    return false;
                  };
            sortOrder = hasCompare
              ? function (left, right) {
                  if (left === right) {
                    hasDuplicate = true;
                    return 0;
                  }
                  var compare = !left.compareDocumentPosition - !right.compareDocumentPosition;
                  return (
                    compare ||
                    (1 &
                      (compare =
                        (left.ownerDocument || left) === (right.ownerDocument || right)
                          ? left.compareDocumentPosition(right)
                          : 1) ||
                    (!support.sortDetached && right.compareDocumentPosition(left) === compare)
                      ? left === document ||
                        (left.ownerDocument === preferredDoc && contains(preferredDoc, left))
                        ? -1
                        : right === document ||
                            (right.ownerDocument === preferredDoc && contains(preferredDoc, right))
                          ? 1
                          : sortInput
                            ? indexOf(sortInput, left) - indexOf(sortInput, right)
                            : 0
                      : 4 & compare
                        ? -1
                        : 1)
                  );
                }
              : function (left, right) {
                  if (left === right) {
                    hasDuplicate = true;
                    return 0;
                  }
                  var cur,
                    ancestorIndex = 0,
                    aup = left.parentNode,
                    bup = right.parentNode,
                    leftAncestors = [left],
                    rightAncestors = [right];
                  if (!aup || !bup) {
                    if (left === document) {
                      return -1;
                    } else {
                      if (right === document) {
                        return 1;
                      } else {
                        if (aup) {
                          return -1;
                        } else {
                          if (bup) {
                            return 1;
                          } else {
                            if (sortInput) {
                              return indexOf(sortInput, left) - indexOf(sortInput, right);
                            } else {
                              return 0;
                            }
                          }
                        }
                      }
                    }
                  }
                  if (aup === bup) {
                    return siblingCheck(left, right);
                  }
                  for (cur = left; (cur = cur.parentNode); ) {
                    leftAncestors.unshift(cur);
                  }
                  for (cur = right; (cur = cur.parentNode); ) {
                    rightAncestors.unshift(cur);
                  }
                  for (; leftAncestors[ancestorIndex] === rightAncestors[ancestorIndex]; ) {
                    ancestorIndex++;
                  }
                  if (ancestorIndex) {
                    return siblingCheck(
                      leftAncestors[ancestorIndex],
                      rightAncestors[ancestorIndex],
                    );
                  } else {
                    if (leftAncestors[ancestorIndex] === preferredDoc) {
                      return -1;
                    } else {
                      if (rightAncestors[ancestorIndex] === preferredDoc) {
                        return 1;
                      } else {
                        return 0;
                      }
                    }
                  }
                };
            return document;
          } else {
            return document;
          }
        }),
      (Sizzle.matches = function (expr, elements) {
        return Sizzle(expr, null, null, elements);
      }),
      (Sizzle.matchesSelector = function (elem, expr) {
        if ((elem.ownerDocument || elem) !== document) {
          setDocument(elem);
        }
        expr = expr.replace(rattributeQuotes, "='$1']");
        if (
          support.matchesSelector &&
          documentIsHTML &&
          !compilerCache[expr + ' '] &&
          (!rbuggyMatches || !rbuggyMatches.test(expr)) &&
          (!rbuggyQSA || !rbuggyQSA.test(expr))
        ) {
          try {
            var ret = matches.call(elem, expr);
            if (
              ret ||
              support.disconnectedMatch ||
              (elem.document && 11 !== elem.document.nodeType)
            ) {
              return ret;
            }
          } catch (element) {}
        }
        return Sizzle(expr, document, null, [elem]).length > 0;
      }),
      (Sizzle.contains = function (context, elem) {
        if ((context.ownerDocument || context) !== document) {
          setDocument(context);
        }
        return contains(context, elem);
      }),
      (Sizzle.attr = function (elem, name) {
        if ((elem.ownerDocument || elem) !== document) {
          setDocument(elem);
        }
        var callback = Expr.attrHandle[name.toLowerCase()],
          val =
            callback && hasOwn.call(Expr.attrHandle, name.toLowerCase())
              ? callback(elem, name, !documentIsHTML)
              : void 0;
        if (void 0 !== val) {
          return val;
        } else {
          if (support.attributes || !documentIsHTML) {
            return elem.getAttribute(name);
          } else {
            if ((val = elem.getAttributeNode(name)) && val.specified) {
              return val.value;
            } else {
              return null;
            }
          }
        }
      }),
      (Sizzle.escape = function (selection) {
        return (selection + '').replace(rcssescape, fcssescape);
      }),
      (Sizzle.error = function (msg) {
        throw new Error('Syntax error, unrecognized expression: ' + msg);
      }),
      (Sizzle.uniqueSort = function (results) {
        var elem,
          duplicates = [],
          duplicateIndex = 0,
          itemIndex = 0;
        hasDuplicate = !support.detectDuplicates;
        sortInput = !support.sortStable && results.slice(0);
        results.sort(sortOrder);
        if (hasDuplicate) {
          for (; (elem = results[itemIndex++]); ) {
            if (elem === results[itemIndex]) {
              duplicateIndex = duplicates.push(itemIndex);
            }
          }
          for (; duplicateIndex--; ) {
            results.splice(duplicates[duplicateIndex], 1);
          }
        }
        sortInput = null;
        return results;
      }),
      (getText = Sizzle.getText =
        function (elem) {
          var node,
            ret = '',
            nodeIndex = 0,
            nodeType = elem.nodeType;
          if (nodeType) {
            if (1 === nodeType || 9 === nodeType || 11 === nodeType) {
              if ('string' == typeof elem.textContent) {
                return elem.textContent;
              }
              for (elem = elem.firstChild; elem; elem = elem.nextSibling) {
                ret += getText(elem);
              }
            } else {
              if (3 === nodeType || 4 === nodeType) {
                return elem.nodeValue;
              }
            }
          } else {
            for (; (node = elem[nodeIndex++]); ) {
              ret += getText(node);
            }
          }
          return ret;
        }),
      ((Expr = Sizzle.selectors =
        {
          cacheLength: 50,
          createPseudo: markFunction,
          match: matchExpr,
          attrHandle: {},
          find: {},
          relative: {
            '>': { dir: 'parentNode', first: true },
            ' ': { dir: 'parentNode' },
            '+': { dir: 'previousSibling', first: true },
            '~': { dir: 'previousSibling' },
          },
          preFilter: {
            ATTR: function (match) {
              match[1] = match[1].replace(runescape, funescape);
              match[3] = (match[3] || match[4] || match[5] || '').replace(runescape, funescape);
              if ('~=' === match[2]) {
                match[3] = ' ' + match[3] + ' ';
              }
              return match.slice(0, 4);
            },
            CHILD: function (match) {
              match[1] = match[1].toLowerCase();
              if ('nth' === match[1].slice(0, 3)) {
                if (!match[3]) {
                  Sizzle.error(match[0]);
                }
                match[4] = +(match[4]
                  ? match[5] + (match[6] || 1)
                  : 2 * ('even' === match[3] || 'odd' === match[3]));
                match[5] = +(match[7] + match[8] || 'odd' === match[3]);
              } else {
                if (match[3]) {
                  Sizzle.error(match[0]);
                }
              }
              return match;
            },
            PSEUDO: function (match) {
              var excess,
                unquoted = !match[6] && match[2];
              if (matchExpr.CHILD.test(match[0])) {
                return null;
              } else {
                if (match[3]) {
                  match[2] = match[4] || match[5] || '';
                } else {
                  if (
                    unquoted &&
                    rpseudo.test(unquoted) &&
                    (excess = tokenize(unquoted, true)) &&
                    (excess = unquoted.indexOf(')', unquoted.length - excess) - unquoted.length)
                  ) {
                    match[0] = match[0].slice(0, excess);
                    match[2] = unquoted.slice(0, excess);
                  }
                }
                return match.slice(0, 3);
              }
            },
          },
          filter: {
            TAG: function (nodeNameSelector) {
              var nodeName = nodeNameSelector.replace(runescape, funescape).toLowerCase();
              if ('*' === nodeNameSelector) {
                return function () {
                  return true;
                };
              } else {
                return function (elem) {
                  return elem.nodeName && elem.nodeName.toLowerCase() === nodeName;
                };
              }
            },
            CLASS: function (className) {
              var pattern = classCache[className + ' '];
              return (
                pattern ||
                ((pattern = new RegExp(
                  '(^|' + whitespace + ')' + className + '(' + whitespace + '|$)',
                )) &&
                  classCache(className, function (elem) {
                    return pattern.test(
                      ('string' == typeof elem.className && elem.className) ||
                        (void 0 !== elem.getAttribute && elem.getAttribute('class')) ||
                        '',
                    );
                  }))
              );
            },
            ATTR: function (name, operator, check) {
              return function (elem) {
                var result = Sizzle.attr(elem, name);
                if (null == result) {
                  return '!=' === operator;
                } else {
                  return (
                    !operator ||
                    ((result += ''),
                    '=' === operator
                      ? result === check
                      : '!=' === operator
                        ? result !== check
                        : '^=' === operator
                          ? check && 0 === result.indexOf(check)
                          : '*=' === operator
                            ? check && result.indexOf(check) > -1
                            : '$=' === operator
                              ? check && result.slice(-check.length) === check
                              : '~=' === operator
                                ? (' ' + result.replace(rwhitespace, ' ') + ' ').indexOf(check) > -1
                                : '|=' === operator &&
                                  (result === check ||
                                    result.slice(0, check.length + 1) === check + '-'))
                  );
                }
              };
            },
            CHILD: function (type, what, argument, first, last) {
              var simple = 'nth' !== type.slice(0, 3),
                forward = 'last' !== type.slice(-4),
                ofType = 'of-type' === what;
              if (1 === first && 0 === last) {
                return function (elem) {
                  return !!elem.parentNode;
                };
              } else {
                return function (elem, context, xml) {
                  var cache,
                    uniqueCache,
                    outerCache,
                    node,
                    nodeIndex,
                    start,
                    dir = simple !== forward ? 'nextSibling' : 'previousSibling',
                    parent = elem.parentNode,
                    name = ofType && elem.nodeName.toLowerCase(),
                    useCache = !xml && !ofType,
                    diff = false;
                  if (parent) {
                    if (simple) {
                      for (; dir; ) {
                        for (node = elem; (node = node[dir]); ) {
                          if (ofType ? node.nodeName.toLowerCase() === name : 1 === node.nodeType) {
                            return false;
                          }
                        }
                        start = dir = 'only' === type && !start && 'nextSibling';
                      }
                      return true;
                    }
                    start = [forward ? parent.firstChild : parent.lastChild];
                    if (forward && useCache) {
                      for (
                        diff =
                          (nodeIndex =
                            (cache =
                              (uniqueCache =
                                (outerCache = (node = parent)[expando] || (node[expando] = {}))[
                                  node.uniqueID
                                ] || (outerCache[node.uniqueID] = {}))[type] || [])[0] ===
                              dirruns && cache[1]) && cache[2],
                          node = nodeIndex && parent.childNodes[nodeIndex];
                        (node =
                          (++nodeIndex && node && node[dir]) ||
                          (diff = nodeIndex = 0) ||
                          start.pop());
                      ) {
                        if (1 === node.nodeType && ++diff && node === elem) {
                          uniqueCache[type] = [dirruns, nodeIndex, diff];
                          break;
                        }
                      }
                    } else {
                      if (useCache) {
                        diff = nodeIndex =
                          (cache =
                            (uniqueCache =
                              (outerCache = (node = elem)[expando] || (node[expando] = {}))[
                                node.uniqueID
                              ] || (outerCache[node.uniqueID] = {}))[type] || [])[0] === dirruns &&
                          cache[1];
                      }
                      if (false === diff) {
                        for (
                          ;
                          (node =
                            (++nodeIndex && node && node[dir]) ||
                            (diff = nodeIndex = 0) ||
                            start.pop()) &&
                          ((ofType ? node.nodeName.toLowerCase() !== name : 1 !== node.nodeType) ||
                            !++diff ||
                            (useCache &&
                              ((uniqueCache =
                                (outerCache = node[expando] || (node[expando] = {}))[
                                  node.uniqueID
                                ] || (outerCache[node.uniqueID] = {}))[type] = [dirruns, diff]),
                            node !== elem));
                        ) {}
                      }
                    }
                    return (diff -= last) === first || (diff % first == 0 && diff / first >= 0);
                  }
                };
              }
            },
            PSEUDO: function (pseudo, argument) {
              var args,
                callback =
                  Expr.pseudos[pseudo] ||
                  Expr.setFilters[pseudo.toLowerCase()] ||
                  Sizzle.error('unsupported pseudo: ' + pseudo);
              if (callback[expando]) {
                return callback(argument);
              } else {
                if (callback.length > 1) {
                  args = [pseudo, pseudo, '', argument];
                  if (Expr.setFilters.hasOwnProperty(pseudo.toLowerCase())) {
                    return markFunction(function (seed, matches) {
                      for (
                        var idx, matched = callback(seed, argument), matchCount = matched.length;
                        matchCount--;
                      ) {
                        seed[(idx = indexOf(seed, matched[matchCount]))] = !(matches[idx] =
                          matched[matchCount]);
                      }
                    });
                  } else {
                    return function (elem) {
                      return callback(elem, 0, args);
                    };
                  }
                } else {
                  return callback;
                }
              }
            },
          },
          pseudos: {
            not: markFunction(function (selector) {
              var input = [],
                results = [],
                matcher = compile(selector.replace(rtrim, '$1'));
              if (matcher[expando]) {
                return markFunction(function (seed, matches, context, xml) {
                  for (
                    var elem, unmatched = matcher(seed, null, xml, []), seedIndex = seed.length;
                    seedIndex--;
                  ) {
                    if ((elem = unmatched[seedIndex])) {
                      seed[seedIndex] = !(matches[seedIndex] = elem);
                    }
                  }
                });
              } else {
                return function (elem, context, xml) {
                  input[0] = elem;
                  matcher(input, null, xml, results);
                  input[0] = null;
                  return !results.pop();
                };
              }
            }),
            has: markFunction(function (selector) {
              return function (elem) {
                return Sizzle(selector, elem).length > 0;
              };
            }),
            contains: markFunction(function (text) {
              text = text.replace(runescape, funescape);
              return function (elem) {
                return (elem.textContent || elem.innerText || getText(elem)).indexOf(text) > -1;
              };
            }),
            lang: markFunction(function (lang) {
              if (!ridentifier.test(lang || '')) {
                Sizzle.error('unsupported lang: ' + lang);
              }
              lang = lang.replace(runescape, funescape).toLowerCase();
              return function (elem) {
                var elemLang;
                do {
                  if (
                    (elemLang = documentIsHTML
                      ? elem.lang
                      : elem.getAttribute('xml:lang') || elem.getAttribute('lang'))
                  ) {
                    return (
                      (elemLang = elemLang.toLowerCase()) === lang ||
                      0 === elemLang.indexOf(lang + '-')
                    );
                  }
                } while ((elem = elem.parentNode) && 1 === elem.nodeType);
                return false;
              };
            }),
            target: function (elem) {
              var hash = window.location && window.location.hash;
              return hash && hash.slice(1) === elem.id;
            },
            root: function (elem) {
              return elem === docElem;
            },
            focus: function (elem) {
              return (
                elem === document.activeElement &&
                (!document.hasFocus || document.hasFocus()) &&
                !!(elem.type || elem.href || ~elem.tabIndex)
              );
            },
            enabled: createDisabledPseudo(false),
            disabled: createDisabledPseudo(true),
            checked: function (elem) {
              var nodeName = elem.nodeName.toLowerCase();
              return (
                ('input' === nodeName && !!elem.checked) ||
                ('option' === nodeName && !!elem.selected)
              );
            },
            selected: function (elem) {
              if (elem.parentNode) {
                elem.parentNode.selectedIndex;
              }
              return true === elem.selected;
            },
            empty: function (elem) {
              for (elem = elem.firstChild; elem; elem = elem.nextSibling) {
                if (elem.nodeType < 6) {
                  return false;
                }
              }
              return true;
            },
            parent: function (elem) {
              return !Expr.pseudos.empty(elem);
            },
            header: function (elem) {
              return rheader.test(elem.nodeName);
            },
            input: function (elem) {
              return rinputs.test(elem.nodeName);
            },
            button: function (elem) {
              var name = elem.nodeName.toLowerCase();
              return ('input' === name && 'button' === elem.type) || 'button' === name;
            },
            text: function (elem) {
              var attr;
              return (
                'input' === elem.nodeName.toLowerCase() &&
                'text' === elem.type &&
                (null == (attr = elem.getAttribute('type')) || 'text' === attr.toLowerCase())
              );
            },
            first: createPositionalPseudo(function () {
              return [0];
            }),
            last: createPositionalPseudo(function (matchIndexes, length) {
              return [length - 1];
            }),
            eq: createPositionalPseudo(function (matchIndexes, length, argument) {
              return [argument < 0 ? argument + length : argument];
            }),
            even: createPositionalPseudo(function (matchIndexes, length) {
              for (var itemIndex = 0; itemIndex < length; itemIndex += 2) {
                matchIndexes.push(itemIndex);
              }
              return matchIndexes;
            }),
            odd: createPositionalPseudo(function (matchIndexes, length) {
              for (var itemIndex = 1; itemIndex < length; itemIndex += 2) {
                matchIndexes.push(itemIndex);
              }
              return matchIndexes;
            }),
            lt: createPositionalPseudo(function (matchIndexes, length, argument) {
              for (
                var itemIndex = argument < 0 ? argument + length : argument;
                --itemIndex >= 0;
              ) {
                matchIndexes.push(itemIndex);
              }
              return matchIndexes;
            }),
            gt: createPositionalPseudo(function (matchIndexes, length, argument) {
              for (
                var itemIndex = argument < 0 ? argument + length : argument;
                ++itemIndex < length;
              ) {
                matchIndexes.push(itemIndex);
              }
              return matchIndexes;
            }),
          },
        }).pseudos.nth = Expr.pseudos.eq),
      { radio: true, checkbox: true, file: true, password: true, image: true })) {
        Expr.pseudos[windowGlobal] = createInputPseudo(windowGlobal);
      }
      for (windowGlobal in { submit: true, reset: true }) {
        Expr.pseudos[windowGlobal] = createButtonPseudo(windowGlobal);
      }
      function setFilters() {}
      function toSelector(tokens) {
        for (
          var tokenIndex = 0, len = tokens.length, selector = '';
          tokenIndex < len;
          tokenIndex++
        ) {
          selector += tokens[tokenIndex].value;
        }
        return selector;
      }
      function addCombinator(matcher, combinator, base) {
        var dir = combinator.dir,
          skip = combinator.next,
          key = skip || dir,
          checkNonElements = base && 'parentNode' === key,
          doneName = done++;
        if (combinator.first) {
          return function (elem, context, xml) {
            for (; (elem = elem[dir]); ) {
              if (1 === elem.nodeType || checkNonElements) {
                return matcher(elem, context, xml);
              }
            }
            return false;
          };
        } else {
          return function (elem, context, xml) {
            var oldCache,
              uniqueCache,
              outerCache,
              newCache = [dirruns, doneName];
            if (xml) {
              for (; (elem = elem[dir]); ) {
                if ((1 === elem.nodeType || checkNonElements) && matcher(elem, context, xml)) {
                  return true;
                }
              }
            } else {
              for (; (elem = elem[dir]); ) {
                if (1 === elem.nodeType || checkNonElements) {
                  uniqueCache =
                    (outerCache = elem[expando] || (elem[expando] = {}))[elem.uniqueID] ||
                    (outerCache[elem.uniqueID] = {});
                  if (skip && skip === elem.nodeName.toLowerCase()) {
                    elem = elem[dir] || elem;
                  } else {
                    if (
                      (oldCache = uniqueCache[key]) &&
                      oldCache[0] === dirruns &&
                      oldCache[1] === doneName
                    ) {
                      return (newCache[2] = oldCache[2]);
                    }
                    uniqueCache[key] = newCache;
                    if ((newCache[2] = matcher(elem, context, xml))) {
                      return true;
                    }
                  }
                }
              }
            }
            return false;
          };
        }
      }
      function elementMatcher(matchers) {
        if (matchers.length > 1) {
          return function (elem, context, xml) {
            for (var matcherIndex = matchers.length; matcherIndex--; ) {
              if (!matchers[matcherIndex](elem, context, xml)) {
                return false;
              }
            }
            return true;
          };
        } else {
          return matchers[0];
        }
      }
      function condense(unmatched, map, filter, context, xml) {
        for (
          var elem,
            newUnmatched = [],
            elementIndex = 0,
            len = unmatched.length,
            mapped = null != map;
          elementIndex < len;
          elementIndex++
        ) {
          if ((elem = unmatched[elementIndex])) {
            if (!(filter && !filter(elem, context, xml))) {
              newUnmatched.push(elem);
              if (mapped) {
                map.push(elementIndex);
              }
            }
          }
        }
        return newUnmatched;
      }
      function setMatcher(preFilter, selector, matcher, postFilter, postFinder, postSelector) {
        if (postFilter && !postFilter[expando]) {
          postFilter = setMatcher(postFilter);
        }
        if (postFinder && !postFinder[expando]) {
          postFinder = setMatcher(postFinder, postSelector);
        }
        return markFunction(function (seed, results, context, xml) {
          var temp,
            elementIndex,
            elem,
            preMap = [],
            postMap = [],
            preexisting = results.length,
            elems =
              seed ||
              (function (selector, contexts, results) {
                for (
                  var contextIndex = 0, len = contexts.length;
                  contextIndex < len;
                  contextIndex++
                ) {
                  Sizzle(selector, contexts[contextIndex], results);
                }
                return results;
              })(selector || '*', context.nodeType ? [context] : context, []),
            matcherIn =
              !preFilter || (!seed && selector)
                ? elems
                : condense(elems, preMap, preFilter, context, xml),
            matcherOut = matcher
              ? postFinder || (seed ? preFilter : preexisting || postFilter)
                ? []
                : results
              : matcherIn;
          if (matcher) {
            matcher(matcherIn, matcherOut, context, xml);
          }
          if (postFilter) {
            for (
              temp = condense(matcherOut, postMap),
                postFilter(temp, [], context, xml),
                elementIndex = temp.length;
              elementIndex--;
            ) {
              if ((elem = temp[elementIndex])) {
                matcherOut[postMap[elementIndex]] = !(matcherIn[postMap[elementIndex]] = elem);
              }
            }
          }
          if (seed) {
            if (postFinder || preFilter) {
              if (postFinder) {
                for (temp = [], elementIndex = matcherOut.length; elementIndex--; ) {
                  if ((elem = matcherOut[elementIndex])) {
                    temp.push((matcherIn[elementIndex] = elem));
                  }
                }
                postFinder(null, (matcherOut = []), temp, xml);
              }
              for (elementIndex = matcherOut.length; elementIndex--; ) {
                if (
                  (elem = matcherOut[elementIndex]) &&
                  (temp = postFinder ? indexOf(seed, elem) : preMap[elementIndex]) > -1
                ) {
                  seed[temp] = !(results[temp] = elem);
                }
              }
            }
          } else {
            matcherOut = condense(
              matcherOut === results
                ? matcherOut.splice(preexisting, matcherOut.length)
                : matcherOut,
            );
            if (postFinder) {
              postFinder(null, results, matcherOut, xml);
            } else {
              push.apply(results, matcherOut);
            }
          }
        });
      }
      function matcherFromTokens(tokens) {
        for (
          var checkContext,
            matcher,
            postFilterIndex,
            len = tokens.length,
            leadingRelative = Expr.relative[tokens[0].type],
            implicitRelative = leadingRelative || Expr.relative[' '],
            tokenIndex = leadingRelative ? 1 : 0,
            matchContext = addCombinator(
              function (elem) {
                return elem === checkContext;
              },
              implicitRelative,
              true,
            ),
            matchAnyContext = addCombinator(
              function (elem) {
                return indexOf(checkContext, elem) > -1;
              },
              implicitRelative,
              true,
            ),
            matchers = [
              function (elem, context, xml) {
                var ret =
                  (!leadingRelative && (xml || context !== outermostContext)) ||
                  ((checkContext = context).nodeType
                    ? matchContext(elem, context, xml)
                    : matchAnyContext(elem, context, xml));
                checkContext = null;
                return ret;
              },
            ];
          tokenIndex < len;
          tokenIndex++
        ) {
          if ((matcher = Expr.relative[tokens[tokenIndex].type])) {
            matchers = [addCombinator(elementMatcher(matchers), matcher)];
          } else {
            if (
              (matcher = Expr.filter[tokens[tokenIndex].type].apply(
                null,
                tokens[tokenIndex].matches,
              ))[expando]
            ) {
              for (
                postFilterIndex = ++tokenIndex;
                postFilterIndex < len && !Expr.relative[tokens[postFilterIndex].type];
                postFilterIndex++
              ) {}
              return setMatcher(
                tokenIndex > 1 && elementMatcher(matchers),
                tokenIndex > 1 &&
                  toSelector(
                    tokens
                      .slice(0, tokenIndex - 1)
                      .concat({ value: ' ' === tokens[tokenIndex - 2].type ? '*' : '' }),
                  ).replace(rtrim, '$1'),
                matcher,
                tokenIndex < postFilterIndex &&
                  matcherFromTokens(tokens.slice(tokenIndex, postFilterIndex)),
                postFilterIndex < len &&
                  matcherFromTokens((tokens = tokens.slice(postFilterIndex))),
                postFilterIndex < len && toSelector(tokens),
              );
            }
            matchers.push(matcher);
          }
        }
        return elementMatcher(matchers);
      }
      function matcherFromGroupMatchers(elementMatchers, setMatchers) {
        var bySet = setMatchers.length > 0,
          byElement = elementMatchers.length > 0,
          superMatcher = function (seed, context, xml, results, outermost) {
            var elem,
              matcherIndex,
              matcher,
              matchedCount = 0,
              elementIndex = '0',
              unmatched = seed && [],
              setMatched = [],
              contextBackup = outermostContext,
              elems = seed || (byElement && Expr.find.TAG('*', outermost)),
              runIdentifier = (dirruns += null == contextBackup ? 1 : Math.random() || 0.1),
              len = elems.length;
            for (
              outermost && (outermostContext = context === document || context || outermost);
              elementIndex !== len && null != (elem = elems[elementIndex]);
              elementIndex++
            ) {
              if (byElement && elem) {
                for (
                  matcherIndex = 0,
                    context ||
                      elem.ownerDocument === document ||
                      (setDocument(elem), (xml = !documentIsHTML));
                  (matcher = elementMatchers[matcherIndex++]);
                ) {
                  if (matcher(elem, context || document, xml)) {
                    results.push(elem);
                    break;
                  }
                }
                if (outermost) {
                  dirruns = runIdentifier;
                }
              }
              if (bySet) {
                if ((elem = !matcher && elem)) {
                  matchedCount--;
                }
                if (seed) {
                  unmatched.push(elem);
                }
              }
            }
            matchedCount += elementIndex;
            if (bySet && elementIndex !== matchedCount) {
              for (matcherIndex = 0; (matcher = setMatchers[matcherIndex++]); ) {
                matcher(unmatched, setMatched, context, xml);
              }
              if (seed) {
                if (matchedCount > 0) {
                  for (; elementIndex--; ) {
                    if (!(unmatched[elementIndex] || setMatched[elementIndex])) {
                      setMatched[elementIndex] = pop.call(results);
                    }
                  }
                }
                setMatched = condense(setMatched);
              }
              push.apply(results, setMatched);
              if (
                outermost &&
                !seed &&
                setMatched.length > 0 &&
                matchedCount + setMatchers.length > 1
              ) {
                Sizzle.uniqueSort(results);
              }
            }
            if (outermost) {
              dirruns = runIdentifier;
              outermostContext = contextBackup;
            }
            return unmatched;
          };
        if (bySet) {
          return markFunction(superMatcher);
        } else {
          return superMatcher;
        }
      }
      setFilters.prototype = Expr.filters = Expr.pseudos;
      Expr.setFilters = new setFilters();
      tokenize = Sizzle.tokenize = function (selector, parseOnly) {
        var matched,
          match,
          tokens,
          type,
          soFar,
          groups,
          preFilters,
          cached = tokenCache[selector + ' '];
        if (cached) {
          if (parseOnly) {
            return 0;
          } else {
            return cached.slice(0);
          }
        }
        for (soFar = selector, groups = [], preFilters = Expr.preFilter; soFar; ) {
          for (type in ((matched && !(match = rcomma.exec(soFar))) ||
            (match && (soFar = soFar.slice(match[0].length) || soFar), groups.push((tokens = []))),
          (matched = false),
          (match = rcombinators.exec(soFar)) &&
            ((matched = match.shift()),
            tokens.push({ value: matched, type: match[0].replace(rtrim, ' ') }),
            (soFar = soFar.slice(matched.length))),
          Expr.filter)) {
            if (
              !(
                !(match = matchExpr[type].exec(soFar)) ||
                (preFilters[type] && !(match = preFilters[type](match)))
              )
            ) {
              matched = match.shift();
              tokens.push({ value: matched, type: type, matches: match });
              soFar = soFar.slice(matched.length);
            }
          }
          if (!matched) {
            break;
          }
        }
        if (parseOnly) {
          return soFar.length;
        } else {
          if (soFar) {
            return Sizzle.error(selector);
          } else {
            return tokenCache(selector, groups).slice(0);
          }
        }
      };
      compile = Sizzle.compile = function (selector, match) {
        var groupIndex,
          setMatchers = [],
          elementMatchers = [],
          cached = compilerCache[selector + ' '];
        if (!cached) {
          for (match || (match = tokenize(selector)), groupIndex = match.length; groupIndex--; ) {
            if ((cached = matcherFromTokens(match[groupIndex]))[expando]) {
              setMatchers.push(cached);
            } else {
              elementMatchers.push(cached);
            }
          }
          (cached = compilerCache(
            selector,
            matcherFromGroupMatchers(elementMatchers, setMatchers),
          )).selector = selector;
        }
        return cached;
      };
      select = Sizzle.select = function (selector, context, results, seed) {
        var tokenIndex,
          tokens,
          token,
          type,
          find,
          compiled = 'function' == typeof selector && selector,
          match = !seed && tokenize((selector = compiled.selector || selector));
        results = results || [];
        if (1 === match.length) {
          if (
            (tokens = match[0] = match[0].slice(0)).length > 2 &&
            'ID' === (token = tokens[0]).type &&
            9 === context.nodeType &&
            documentIsHTML &&
            Expr.relative[tokens[1].type]
          ) {
            if (
              !(context = (Expr.find.ID(token.matches[0].replace(runescape, funescape), context) ||
                [])[0])
            ) {
              return results;
            }
            if (compiled) {
              context = context.parentNode;
            }
            selector = selector.slice(tokens.shift().value.length);
          }
          for (
            tokenIndex = matchExpr.needsContext.test(selector) ? 0 : tokens.length;
            tokenIndex-- && ((token = tokens[tokenIndex]), !Expr.relative[(type = token.type)]);
          ) {
            if (
              (find = Expr.find[type]) &&
              (seed = find(
                token.matches[0].replace(runescape, funescape),
                (rsibling.test(tokens[0].type) && testContext(context.parentNode)) || context,
              ))
            ) {
              tokens.splice(tokenIndex, 1);
              if (!(selector = seed.length && toSelector(tokens))) {
                push.apply(results, seed);
                return results;
              }
              break;
            }
          }
        }
        (compiled || compile(selector, match))(
          seed,
          context,
          !documentIsHTML,
          results,
          !context || (rsibling.test(selector) && testContext(context.parentNode)) || context,
        );
        return results;
      };
      support.sortStable = expando.split('').sort(sortOrder).join('') === expando;
      support.detectDuplicates = !!hasDuplicate;
      setDocument();
      support.sortDetached = assert(function (element) {
        return 1 & element.compareDocumentPosition(document.createElement('fieldset'));
      });
      if (
        !assert(function (element) {
          element.innerHTML = "<a href='#'></a>";
          return '#' === element.firstChild.getAttribute('href');
        })
      ) {
        addHandle('type|href|height|width', function (elem, name, isXML) {
          if (!isXML) {
            return elem.getAttribute(name, 'type' === name.toLowerCase() ? 1 : 2);
          }
        });
      }
      if (
        !(
          support.attributes &&
          assert(function (element) {
            element.innerHTML = '<input/>';
            element.firstChild.setAttribute('value', '');
            return '' === element.firstChild.getAttribute('value');
          })
        )
      ) {
        addHandle('value', function (elem, name, isXML) {
          if (!isXML && 'input' === elem.nodeName.toLowerCase()) {
            return elem.defaultValue;
          }
        });
      }
      if (
        !assert(function (element) {
          return null == element.getAttribute('disabled');
        })
      ) {
        addHandle(booleans, function (elem, name, isXML) {
          var val;
          if (!isXML) {
            if (true === elem[name]) {
              return name.toLowerCase();
            } else {
              if ((val = elem.getAttributeNode(name)) && val.specified) {
                return val.value;
              } else {
                return null;
              }
            }
          }
        });
      }
      return Sizzle;
    })(window);
    jQuery.find = Sizzle;
    jQuery.expr = Sizzle.selectors;
    jQuery.expr[':'] = jQuery.expr.pseudos;
    jQuery.uniqueSort = jQuery.unique = Sizzle.uniqueSort;
    jQuery.text = Sizzle.getText;
    jQuery.isXMLDoc = Sizzle.isXML;
    jQuery.contains = Sizzle.contains;
    jQuery.escapeSelector = Sizzle.escape;
    var dir = function (elem, dir, until) {
        for (
          var matched = [], truncate = void 0 !== until;
          (elem = elem[dir]) && 9 !== elem.nodeType;
        ) {
          if (1 === elem.nodeType) {
            if (truncate && jQuery(elem).is(until)) {
              break;
            }
            matched.push(elem);
          }
        }
        return matched;
      },
      siblings = function (firstNode, elem) {
        for (var matched = []; firstNode; firstNode = firstNode.nextSibling) {
          if (1 === firstNode.nodeType && firstNode !== elem) {
            matched.push(firstNode);
          }
        }
        return matched;
      },
      rneedsContext = jQuery.expr.match.needsContext;
    function nodeName(elem, name) {
      return elem.nodeName && elem.nodeName.toLowerCase() === name.toLowerCase();
    }
    var rsingleTag = /^<([a-z][^\/\0>:\x20\t\r\n\f]*)[\x20\t\r\n\f]*\/?>(?:<\/\1>|)$/i;
    function winnow(elements, qualifier, not) {
      if (isFunction(qualifier)) {
        return jQuery.grep(elements, function (elem, elementIndex) {
          return !!qualifier.call(elem, elementIndex, elem) !== not;
        });
      } else {
        if (qualifier.nodeType) {
          return jQuery.grep(elements, function (elem) {
            return (elem === qualifier) !== not;
          });
        } else {
          if ('string' != typeof qualifier) {
            return jQuery.grep(elements, function (elem) {
              return indexOf.call(qualifier, elem) > -1 !== not;
            });
          } else {
            return jQuery.filter(qualifier, elements, not);
          }
        }
      }
    }
    jQuery.filter = function (expr, elems, not) {
      var elem = elems[0];
      if (not) {
        expr = ':not(' + expr + ')';
      }
      if (1 === elems.length && 1 === elem.nodeType) {
        if (jQuery.find.matchesSelector(elem, expr)) {
          return [elem];
        } else {
          return [];
        }
      } else {
        return jQuery.find.matches(
          expr,
          jQuery.grep(elems, function (elem) {
            return 1 === elem.nodeType;
          }),
        );
      }
    };
    jQuery.fn.extend({
      find: function (selector) {
        var elementIndex,
          ret,
          len = this.length,
          self = this;
        if ('string' != typeof selector) {
          return this.pushStack(
            jQuery(selector).filter(function () {
              for (elementIndex = 0; elementIndex < len; elementIndex++) {
                if (jQuery.contains(self[elementIndex], this)) {
                  return true;
                }
              }
            }),
          );
        }
        for (ret = this.pushStack([]), elementIndex = 0; elementIndex < len; elementIndex++) {
          jQuery.find(selector, self[elementIndex], ret);
        }
        if (len > 1) {
          return jQuery.uniqueSort(ret);
        } else {
          return ret;
        }
      },
      filter: function (selector) {
        return this.pushStack(winnow(this, selector || [], false));
      },
      not: function (selector) {
        return this.pushStack(winnow(this, selector || [], true));
      },
      is: function (selector) {
        return !!winnow(
          this,
          'string' == typeof selector && rneedsContext.test(selector)
            ? jQuery(selector)
            : selector || [],
          false,
        ).length;
      },
    });
    var rootjQuery,
      rquickExpr = /^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]+))$/;
    (jQuery.fn.init = function (selector, context, root) {
      var match, elem;
      if (!selector) {
        return this;
      }
      root = root || rootjQuery;
      if ('string' == typeof selector) {
        if (
          !(match =
            '<' === selector[0] && '>' === selector[selector.length - 1] && selector.length >= 3
              ? [null, selector, null]
              : rquickExpr.exec(selector)) ||
          (!match[1] && context)
        ) {
          if (!context || context.jquery) {
            return (context || root).find(selector);
          } else {
            return this.constructor(context).find(selector);
          }
        }
        if (match[1]) {
          context = context instanceof jQuery ? context[0] : context;
          jQuery.merge(
            this,
            jQuery.parseHTML(
              match[1],
              context && context.nodeType ? context.ownerDocument || context : document,
              true,
            ),
          );
          if (rsingleTag.test(match[1]) && jQuery.isPlainObject(context)) {
            for (match in context) {
              if (isFunction(this[match])) {
                this[match](context[match]);
              } else {
                this.attr(match, context[match]);
              }
            }
          }
          return this;
        }
        if ((elem = document.getElementById(match[2]))) {
          this[0] = elem;
          this.length = 1;
        }
        return this;
      }
      if (selector.nodeType) {
        this[0] = selector;
        this.length = 1;
        return this;
      } else {
        if (isFunction(selector)) {
          if (void 0 !== root.ready) {
            return root.ready(selector);
          } else {
            return selector(jQuery);
          }
        } else {
          return jQuery.makeArray(selector, this);
        }
      }
    }).prototype = jQuery.fn;
    rootjQuery = jQuery(document);
    var rparentsprev = /^(?:parents|prev(?:Until|All))/,
      guaranteedUnique = { children: true, contents: true, next: true, prev: true };
    function sibling(cur, dir) {
      for (; (cur = cur[dir]) && 1 !== cur.nodeType; ) {}
      return cur;
    }
    jQuery.fn.extend({
      has: function (target) {
        var targets = jQuery(target, this),
          targetCount = targets.length;
        return this.filter(function () {
          for (var targetIndex = 0; targetIndex < targetCount; targetIndex++) {
            if (jQuery.contains(this, targets[targetIndex])) {
              return true;
            }
          }
        });
      },
      closest: function (selectors, context) {
        var cur,
          elementIndex = 0,
          elementCount = this.length,
          matched = [],
          targets = 'string' != typeof selectors && jQuery(selectors);
        if (!rneedsContext.test(selectors)) {
          for (; elementIndex < elementCount; elementIndex++) {
            for (cur = this[elementIndex]; cur && cur !== context; cur = cur.parentNode) {
              if (
                cur.nodeType < 11 &&
                (targets
                  ? targets.index(cur) > -1
                  : 1 === cur.nodeType && jQuery.find.matchesSelector(cur, selectors))
              ) {
                matched.push(cur);
                break;
              }
            }
          }
        }
        return this.pushStack(matched.length > 1 ? jQuery.uniqueSort(matched) : matched);
      },
      index: function (elem) {
        if (elem) {
          if ('string' == typeof elem) {
            return indexOf.call(jQuery(elem), this[0]);
          } else {
            return indexOf.call(this, elem.jquery ? elem[0] : elem);
          }
        } else {
          if (this[0] && this[0].parentNode) {
            return this.first().prevAll().length;
          } else {
            return -1;
          }
        }
      },
      add: function (selector, context) {
        return this.pushStack(
          jQuery.uniqueSort(jQuery.merge(this.get(), jQuery(selector, context))),
        );
      },
      addBack: function (selector) {
        return this.add(null == selector ? this.prevObject : this.prevObject.filter(selector));
      },
    });
    jQuery.each(
      {
        parent: function (elem) {
          var parent = elem.parentNode;
          if (parent && 11 !== parent.nodeType) {
            return parent;
          } else {
            return null;
          }
        },
        parents: function (elem) {
          return dir(elem, 'parentNode');
        },
        parentsUntil: function (elem, unusedIndex, until) {
          return dir(elem, 'parentNode', until);
        },
        next: function (elem) {
          return sibling(elem, 'nextSibling');
        },
        prev: function (elem) {
          return sibling(elem, 'previousSibling');
        },
        nextAll: function (elem) {
          return dir(elem, 'nextSibling');
        },
        prevAll: function (elem) {
          return dir(elem, 'previousSibling');
        },
        nextUntil: function (elem, unusedIndex, until) {
          return dir(elem, 'nextSibling', until);
        },
        prevUntil: function (elem, unusedIndex, until) {
          return dir(elem, 'previousSibling', until);
        },
        siblings: function (elem) {
          return siblings((elem.parentNode || {}).firstChild, elem);
        },
        children: function (elem) {
          return siblings(elem.firstChild);
        },
        contents: function (elem) {
          if (nodeName(elem, 'iframe')) {
            return elem.contentDocument;
          } else {
            if (nodeName(elem, 'template')) {
              elem = elem.content || elem;
            }
            return jQuery.merge([], elem.childNodes);
          }
        },
      },
      function (name, callback) {
        jQuery.fn[name] = function (until, selector) {
          var matched = jQuery.map(this, callback, until);
          if ('Until' !== name.slice(-5)) {
            selector = until;
          }
          if (selector && 'string' == typeof selector) {
            matched = jQuery.filter(selector, matched);
          }
          if (this.length > 1) {
            if (!guaranteedUnique[name]) {
              jQuery.uniqueSort(matched);
            }
            if (rparentsprev.test(name)) {
              matched.reverse();
            }
          }
          return this.pushStack(matched);
        };
      },
    );
    var rnothtmlwhite = /[^\x20\t\r\n\f]+/g;
    function Identity(value) {
      return value;
    }
    function Thrower(error) {
      throw error;
    }
    function adoptValue(value, resolve, reject, noValue) {
      var method;
      try {
        if (value && isFunction((method = value.promise))) {
          method.call(value).done(resolve).fail(reject);
        } else {
          if (value && isFunction((method = value.then))) {
            method.call(value, resolve, reject);
          } else {
            resolve.apply(void 0, [value].slice(noValue));
          }
        }
      } catch (value) {
        reject.apply(void 0, [value]);
      }
    }
    jQuery.Callbacks = function (options) {
      options =
        'string' == typeof options
          ? (function (options) {
              var object = {};
              jQuery.each(options.match(rnothtmlwhite) || [], function (flagIndex, flag) {
                object[flag] = true;
              });
              return object;
            })(options)
          : jQuery.extend({}, options);
      var firing,
        memory,
        fired,
        locked,
        list = [],
        queue = [],
        firingIndex = -1,
        fire = function () {
          for (
            locked = locked || options.once, fired = firing = true;
            queue.length;
            firingIndex = -1
          ) {
            for (memory = queue.shift(); ++firingIndex < list.length; ) {
              if (false === list[firingIndex].apply(memory[0], memory[1]) && options.stopOnFalse) {
                firingIndex = list.length;
                memory = false;
              }
            }
          }
          if (!options.memory) {
            memory = false;
          }
          firing = false;
          if (locked) {
            list = memory ? [] : '';
          }
        },
        self = {
          add: function () {
            if (list) {
              if (memory && !firing) {
                firingIndex = list.length - 1;
                queue.push(memory);
              }
              (function add(args) {
                jQuery.each(args, function (callbackIndex, arg) {
                  if (isFunction(arg)) {
                    if (!(options.unique && self.has(arg))) {
                      list.push(arg);
                    }
                  } else {
                    if (arg && arg.length && 'string' !== toType(arg)) {
                      add(arg);
                    }
                  }
                });
              })(arguments);
              if (memory && !firing) {
                fire();
              }
            }
            return this;
          },
          remove: function () {
            jQuery.each(arguments, function (methodIndex, arg) {
              for (var index; (index = jQuery.inArray(arg, list, index)) > -1; ) {
                list.splice(index, 1);
                if (index <= firingIndex) {
                  firingIndex--;
                }
              }
            });
            return this;
          },
          has: function (callback) {
            if (callback) {
              return jQuery.inArray(callback, list) > -1;
            } else {
              return list.length > 0;
            }
          },
          empty: function () {
            if (list) {
              list = [];
            }
            return this;
          },
          disable: function () {
            locked = queue = [];
            list = memory = '';
            return this;
          },
          disabled: function () {
            return !list;
          },
          lock: function () {
            locked = queue = [];
            if (!(memory || firing)) {
              list = memory = '';
            }
            return this;
          },
          locked: function () {
            return !!locked;
          },
          fireWith: function (context, args) {
            if (!locked) {
              args = [context, (args = args || []).slice ? args.slice() : args];
              queue.push(args);
              if (!firing) {
                fire();
              }
            }
            return this;
          },
          fire: function () {
            self.fireWith(this, arguments);
            return this;
          },
          fired: function () {
            return !!fired;
          },
        };
      return self;
    };
    jQuery.extend({
      Deferred: function (func) {
        var tuples = [
            ['notify', 'progress', jQuery.Callbacks('memory'), jQuery.Callbacks('memory'), 2],
            [
              'resolve',
              'done',
              jQuery.Callbacks('once memory'),
              jQuery.Callbacks('once memory'),
              0,
              'resolved',
            ],
            [
              'reject',
              'fail',
              jQuery.Callbacks('once memory'),
              jQuery.Callbacks('once memory'),
              1,
              'rejected',
            ],
          ],
          state = 'pending',
          promise = {
            state: function () {
              return state;
            },
            always: function () {
              deferred.done(arguments).fail(arguments);
              return this;
            },
            catch: function (callback) {
              return promise.then(null, callback);
            },
            pipe: function () {
              var fns = arguments;
              return jQuery
                .Deferred(function (newDefer) {
                  jQuery.each(tuples, function (handlerIndex, tuple) {
                    var callback = isFunction(fns[tuple[4]]) && fns[tuple[4]];
                    deferred[tuple[1]](function () {
                      var returned = callback && callback.apply(this, arguments);
                      if (returned && isFunction(returned.promise)) {
                        returned
                          .promise()
                          .progress(newDefer.notify)
                          .done(newDefer.resolve)
                          .fail(newDefer.reject);
                      } else {
                        newDefer[tuple[0] + 'With'](this, callback ? [returned] : arguments);
                      }
                    });
                  });
                  fns = null;
                })
                .promise();
            },
            then: function (onFulfilled, onRejected, onProgress) {
              var maxDepth = 0;
              function resolve(depth, deferred, handler, special) {
                return function () {
                  var that = this,
                    args = arguments,
                    mightThrow = function () {
                      var returned, then;
                      if (!(depth < maxDepth)) {
                        if ((returned = handler.apply(that, args)) === deferred.promise()) {
                          throw new TypeError('Thenable self-resolution');
                        }
                        then =
                          returned &&
                          ('object' == typeof returned || 'function' == typeof returned) &&
                          returned.then;
                        if (isFunction(then)) {
                          if (special) {
                            then.call(
                              returned,
                              resolve(maxDepth, deferred, Identity, special),
                              resolve(maxDepth, deferred, Thrower, special),
                            );
                          } else {
                            maxDepth++;
                            then.call(
                              returned,
                              resolve(maxDepth, deferred, Identity, special),
                              resolve(maxDepth, deferred, Thrower, special),
                              resolve(maxDepth, deferred, Identity, deferred.notifyWith),
                            );
                          }
                        } else {
                          if (handler !== Identity) {
                            that = void 0;
                            args = [returned];
                          }
                          (special || deferred.resolveWith)(that, args);
                        }
                      }
                    },
                    process = special
                      ? mightThrow
                      : function () {
                          try {
                            mightThrow();
                          } catch (error) {
                            if (jQuery.Deferred.exceptionHook) {
                              jQuery.Deferred.exceptionHook(error, process.stackTrace);
                            }
                            if (depth + 1 >= maxDepth) {
                              if (handler !== Thrower) {
                                that = void 0;
                                args = [error];
                              }
                              deferred.rejectWith(that, args);
                            }
                          }
                        };
                  if (depth) {
                    process();
                  } else {
                    if (jQuery.Deferred.getStackHook) {
                      process.stackTrace = jQuery.Deferred.getStackHook();
                    }
                    window.setTimeout(process);
                  }
                };
              }
              return jQuery
                .Deferred(function (newDefer) {
                  tuples[0][3].add(
                    resolve(
                      0,
                      newDefer,
                      isFunction(onProgress) ? onProgress : Identity,
                      newDefer.notifyWith,
                    ),
                  );
                  tuples[1][3].add(
                    resolve(0, newDefer, isFunction(onFulfilled) ? onFulfilled : Identity),
                  );
                  tuples[2][3].add(
                    resolve(0, newDefer, isFunction(onRejected) ? onRejected : Thrower),
                  );
                })
                .promise();
            },
            promise: function (object) {
              if (null != object) {
                return jQuery.extend(object, promise);
              } else {
                return promise;
              }
            },
          },
          deferred = {};
        jQuery.each(tuples, function (tupleIndex, tuple) {
          var list = tuple[2],
            stateString = tuple[5];
          promise[tuple[1]] = list.add;
          if (stateString) {
            list.add(
              function () {
                state = stateString;
              },
              tuples[3 - tupleIndex][2].disable,
              tuples[3 - tupleIndex][3].disable,
              tuples[0][2].lock,
              tuples[0][3].lock,
            );
          }
          list.add(tuple[3].fire);
          deferred[tuple[0]] = function () {
            deferred[tuple[0] + 'With'](this === deferred ? void 0 : this, arguments);
            return this;
          };
          deferred[tuple[0] + 'With'] = list.fireWith;
        });
        promise.promise(deferred);
        if (func) {
          func.call(deferred, deferred);
        }
        return deferred;
      },
      when: function (singleValue) {
        var remaining = arguments.length,
          remainingCount = remaining,
          resolveContexts = Array(remainingCount),
          resolveValues = slice.call(arguments),
          master = jQuery.Deferred(),
          updateFunc = function (resolutionIndex) {
            return function (value) {
              resolveContexts[resolutionIndex] = this;
              resolveValues[resolutionIndex] = arguments.length > 1 ? slice.call(arguments) : value;
              if (!--remaining) {
                master.resolveWith(resolveContexts, resolveValues);
              }
            };
          };
        if (
          remaining <= 1 &&
          (adoptValue(
            singleValue,
            master.done(updateFunc(remainingCount)).resolve,
            master.reject,
            !remaining,
          ),
          'pending' === master.state() ||
            isFunction(resolveValues[remainingCount] && resolveValues[remainingCount].then))
        ) {
          return master.then();
        }
        for (; remainingCount--; ) {
          adoptValue(resolveValues[remainingCount], updateFunc(remainingCount), master.reject);
        }
        return master.promise();
      },
    });
    var rerrorNames = /^(Eval|Internal|Range|Reference|Syntax|Type|URI)Error$/;
    jQuery.Deferred.exceptionHook = function (error, stack) {
      if (window.console && window.console.warn && error && rerrorNames.test(error.name)) {
        window.console.warn('jQuery.Deferred exception: ' + error.message, error.stack, stack);
      }
    };
    jQuery.readyException = function (error) {
      window.setTimeout(function () {
        throw error;
      });
    };
    var readyList = jQuery.Deferred();
    function completed() {
      document.removeEventListener('DOMContentLoaded', completed);
      window.removeEventListener('load', completed);
      jQuery.ready();
    }
    jQuery.fn.ready = function (callback) {
      readyList.then(callback).catch(function (error) {
        jQuery.readyException(error);
      });
      return this;
    };
    jQuery.extend({
      isReady: false,
      readyWait: 1,
      ready: function (wait) {
        if (!(true === wait ? --jQuery.readyWait : jQuery.isReady)) {
          jQuery.isReady = true;
          if (!(true !== wait && --jQuery.readyWait > 0)) {
            readyList.resolveWith(document, [jQuery]);
          }
        }
      },
    });
    jQuery.ready.then = readyList.then;
    if (
      'complete' === document.readyState ||
      ('loading' !== document.readyState && !document.documentElement.doScroll)
    ) {
      window.setTimeout(jQuery.ready);
    } else {
      document.addEventListener('DOMContentLoaded', completed);
      window.addEventListener('load', completed);
    }
    var access = function (elems, callback, key, value, chainable, emptyGet, raw) {
        var elementIndex = 0,
          len = elems.length,
          bulk = null == key;
        if ('object' === toType(key)) {
          for (elementIndex in ((chainable = true), key)) {
            access(elems, callback, elementIndex, key[elementIndex], true, emptyGet, raw);
          }
        } else {
          if (
            void 0 !== value &&
            ((chainable = true),
            isFunction(value) || (raw = true),
            bulk &&
              (raw
                ? (callback.call(elems, value), (callback = null))
                : ((bulk = callback),
                  (callback = function (elem, key, value) {
                    return bulk.call(jQuery(elem), value);
                  }))),
            callback)
          ) {
            for (; elementIndex < len; elementIndex++) {
              callback(
                elems[elementIndex],
                key,
                raw
                  ? value
                  : value.call(
                      elems[elementIndex],
                      elementIndex,
                      callback(elems[elementIndex], key),
                    ),
              );
            }
          }
        }
        if (chainable) {
          return elems;
        } else {
          if (bulk) {
            return callback.call(elems);
          } else {
            if (len) {
              return callback(elems[0], key);
            } else {
              return emptyGet;
            }
          }
        }
      },
      rmsPrefix = /^-ms-/,
      rdashAlpha = /-([a-z])/g;
    function fcamelCase(all, letter) {
      return letter.toUpperCase();
    }
    function camelCase(string) {
      return string.replace(rmsPrefix, 'ms-').replace(rdashAlpha, fcamelCase);
    }
    var acceptData = function (owner) {
      return 1 === owner.nodeType || 9 === owner.nodeType || !+owner.nodeType;
    };
    function Data() {
      this.expando = jQuery.expando + Data.uid++;
    }
    Data.uid = 1;
    Data.prototype = {
      cache: function (owner) {
        var value = owner[this.expando];
        if (!value) {
          value = {};
          if (acceptData(owner)) {
            if (owner.nodeType) {
              owner[this.expando] = value;
            } else {
              Object.defineProperty(owner, this.expando, { value: value, configurable: true });
            }
          }
        }
        return value;
      },
      set: function (owner, data, value) {
        var prop,
          cache = this.cache(owner);
        if ('string' == typeof data) {
          cache[camelCase(data)] = value;
        } else {
          for (prop in data) {
            cache[camelCase(prop)] = data[prop];
          }
        }
        return cache;
      },
      get: function (owner, key) {
        if (void 0 === key) {
          return this.cache(owner);
        } else {
          return owner[this.expando] && owner[this.expando][camelCase(key)];
        }
      },
      access: function (owner, key, value) {
        if (void 0 === key || (key && 'string' == typeof key && void 0 === value)) {
          return this.get(owner, key);
        } else {
          this.set(owner, key, value);
          if (void 0 !== value) {
            return value;
          } else {
            return key;
          }
        }
      },
      remove: function (owner, key) {
        var keyIndex,
          cache = owner[this.expando];
        if (void 0 !== cache) {
          if (void 0 !== key) {
            keyIndex = (key = Array.isArray(key)
              ? key.map(camelCase)
              : (key = camelCase(key)) in cache
                ? [key]
                : key.match(rnothtmlwhite) || []).length;
            for (; keyIndex--; ) {
              delete cache[key[keyIndex]];
            }
          }
          if (void 0 === key || jQuery.isEmptyObject(cache)) {
            if (owner.nodeType) {
              owner[this.expando] = void 0;
            } else {
              delete owner[this.expando];
            }
          }
        }
      },
      hasData: function (owner) {
        var cache = owner[this.expando];
        return void 0 !== cache && !jQuery.isEmptyObject(cache);
      },
    };
    var dataPriv = new Data(),
      dataUser = new Data(),
      rbrace = /^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,
      rmultiDash = /[A-Z]/g;
    function dataAttr(elem, key, data) {
      var name;
      if (void 0 === data && 1 === elem.nodeType) {
        name = 'data-' + key.replace(rmultiDash, '-$&').toLowerCase();
        if ('string' == typeof (data = elem.getAttribute(name))) {
          try {
            data = (function (data) {
              return (
                'true' === data ||
                ('false' !== data &&
                  ('null' === data
                    ? null
                    : data === +data + ''
                      ? +data
                      : rbrace.test(data)
                        ? JSON.parse(data)
                        : data))
              );
            })(data);
          } catch (element) {}
          dataUser.set(elem, key, data);
        } else {
          data = void 0;
        }
      }
      return data;
    }
    jQuery.extend({
      hasData: function (elem) {
        return dataUser.hasData(elem) || dataPriv.hasData(elem);
      },
      data: function (elem, name, data) {
        return dataUser.access(elem, name, data);
      },
      removeData: function (elem, name) {
        dataUser.remove(elem, name);
      },
      _data: function (elem, name, data) {
        return dataPriv.access(elem, name, data);
      },
      _removeData: function (elem, name) {
        dataPriv.remove(elem, name);
      },
    });
    jQuery.fn.extend({
      data: function (key, value) {
        var attributeIndex,
          name,
          data,
          elem = this[0],
          attrs = elem && elem.attributes;
        if (void 0 === key) {
          if (
            this.length &&
            ((data = dataUser.get(elem)),
            1 === elem.nodeType && !dataPriv.get(elem, 'hasDataAttrs'))
          ) {
            for (attributeIndex = attrs.length; attributeIndex--; ) {
              if (
                attrs[attributeIndex] &&
                0 === (name = attrs[attributeIndex].name).indexOf('data-')
              ) {
                name = camelCase(name.slice(5));
                dataAttr(elem, name, data[name]);
              }
            }
            dataPriv.set(elem, 'hasDataAttrs', true);
          }
          return data;
        }
        if ('object' == typeof key) {
          return this.each(function () {
            dataUser.set(this, key);
          });
        } else {
          return access(
            this,
            function (value) {
              var data;
              if (elem && void 0 === value) {
                if (void 0 !== (data = dataUser.get(elem, key))) {
                  return data;
                }
                if (void 0 !== (data = dataAttr(elem, key))) {
                  return data;
                }
              } else {
                this.each(function () {
                  dataUser.set(this, key, value);
                });
              }
            },
            null,
            value,
            arguments.length > 1,
            null,
            true,
          );
        }
      },
      removeData: function (key) {
        return this.each(function () {
          dataUser.remove(this, key);
        });
      },
    });
    jQuery.extend({
      queue: function (elem, type, data) {
        var queue;
        if (elem) {
          type = (type || 'fx') + 'queue';
          queue = dataPriv.get(elem, type);
          if (data) {
            if (!queue || Array.isArray(data)) {
              queue = dataPriv.access(elem, type, jQuery.makeArray(data));
            } else {
              queue.push(data);
            }
          }
          return queue || [];
        }
      },
      dequeue: function (elem, type) {
        type = type || 'fx';
        var queue = jQuery.queue(elem, type),
          startLength = queue.length,
          callback = queue.shift(),
          hooks = jQuery._queueHooks(elem, type);
        if ('inprogress' === callback) {
          callback = queue.shift();
          startLength--;
        }
        if (callback) {
          if ('fx' === type) {
            queue.unshift('inprogress');
          }
          delete hooks.stop;
          callback.call(
            elem,
            function () {
              jQuery.dequeue(elem, type);
            },
            hooks,
          );
        }
        if (!startLength && hooks) {
          hooks.empty.fire();
        }
      },
      _queueHooks: function (elem, type) {
        var key = type + 'queueHooks';
        return (
          dataPriv.get(elem, key) ||
          dataPriv.access(elem, key, {
            empty: jQuery.Callbacks('once memory').add(function () {
              dataPriv.remove(elem, [type + 'queue', key]);
            }),
          })
        );
      },
    });
    jQuery.fn.extend({
      queue: function (type, data) {
        var setter = 2;
        if ('string' != typeof type) {
          data = type;
          type = 'fx';
          setter--;
        }
        if (arguments.length < setter) {
          return jQuery.queue(this[0], type);
        } else {
          if (void 0 === data) {
            return this;
          } else {
            return this.each(function () {
              var queue = jQuery.queue(this, type, data);
              jQuery._queueHooks(this, type);
              if ('fx' === type && 'inprogress' !== queue[0]) {
                jQuery.dequeue(this, type);
              }
            });
          }
        }
      },
      dequeue: function (type) {
        return this.each(function () {
          jQuery.dequeue(this, type);
        });
      },
      clearQueue: function (type) {
        return this.queue(type || 'fx', []);
      },
      promise: function (type, object) {
        var tmp,
          count = 1,
          defer = jQuery.Deferred(),
          elements = this,
          elementCount = this.length,
          resolve = function () {
            if (!--count) {
              defer.resolveWith(elements, [elements]);
            }
          };
        for (
          'string' != typeof type && ((object = type), (type = void 0)), type = type || 'fx';
          elementCount--;
        ) {
          if ((tmp = dataPriv.get(elements[elementCount], type + 'queueHooks')) && tmp.empty) {
            count++;
            tmp.empty.add(resolve);
          }
        }
        resolve();
        return defer.promise(object);
      },
    });
    var pnum = /[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/.source,
      rcssNum = new RegExp('^(?:([+-])=|)(' + pnum + ')([a-z%]*)$', 'i'),
      cssExpand = ['Top', 'Right', 'Bottom', 'Left'],
      isHiddenWithinTree = function (elem, element) {
        return (
          'none' === (elem = element || elem).style.display ||
          ('' === elem.style.display &&
            jQuery.contains(elem.ownerDocument, elem) &&
            'none' === jQuery.css(elem, 'display'))
        );
      },
      swap = function (elem, options, callback, args) {
        var ret,
          name,
          old = {};
        for (name in options) {
          old[name] = elem.style[name];
          elem.style[name] = options[name];
        }
        for (name in ((ret = callback.apply(elem, args || [])), options)) {
          elem.style[name] = old[name];
        }
        return ret;
      };
    function adjustCSS(elem, prop, valueParts, tween) {
      var adjusted,
        scale,
        maxIterations = 20,
        currentValue = tween
          ? function () {
              return tween.cur();
            }
          : function () {
              return jQuery.css(elem, prop, '');
            },
        initial = currentValue(),
        unit = (valueParts && valueParts[3]) || (jQuery.cssNumber[prop] ? '' : 'px'),
        initialInUnit =
          (jQuery.cssNumber[prop] || ('px' !== unit && +initial)) &&
          rcssNum.exec(jQuery.css(elem, prop));
      if (initialInUnit && initialInUnit[3] !== unit) {
        for (
          initial /= 2, unit = unit || initialInUnit[3], initialInUnit = +initial || 1;
          maxIterations--;
        ) {
          jQuery.style(elem, prop, initialInUnit + unit);
          if ((1 - scale) * (1 - (scale = currentValue() / initial || 0.5)) <= 0) {
            maxIterations = 0;
          }
          initialInUnit /= scale;
        }
        initialInUnit *= 2;
        jQuery.style(elem, prop, initialInUnit + unit);
        valueParts = valueParts || [];
      }
      if (valueParts) {
        initialInUnit = +initialInUnit || +initial || 0;
        adjusted = valueParts[1]
          ? initialInUnit + (valueParts[1] + 1) * valueParts[2]
          : +valueParts[2];
        if (tween) {
          tween.unit = unit;
          tween.start = initialInUnit;
          tween.end = adjusted;
        }
      }
      return adjusted;
    }
    var defaultDisplayMap = {};
    function getDefaultDisplay(elem) {
      var temp,
        documentModel = elem.ownerDocument,
        nodeName = elem.nodeName,
        display = defaultDisplayMap[nodeName];
      return (
        display ||
        ((temp = documentModel.body.appendChild(documentModel.createElement(nodeName))),
        (display = jQuery.css(temp, 'display')),
        temp.parentNode.removeChild(temp),
        'none' === display && (display = 'block'),
        (defaultDisplayMap[nodeName] = display),
        display)
      );
    }
    function showHide(elements, show) {
      for (
        var display, elem, values = [], index = 0, length = elements.length;
        index < length;
        index++
      ) {
        if ((elem = elements[index]).style) {
          display = elem.style.display;
          if (show) {
            if ('none' === display) {
              values[index] = dataPriv.get(elem, 'display') || null;
              if (!values[index]) {
                elem.style.display = '';
              }
            }
            if ('' === elem.style.display && isHiddenWithinTree(elem)) {
              values[index] = getDefaultDisplay(elem);
            }
          } else {
            if ('none' !== display) {
              values[index] = 'none';
              dataPriv.set(elem, 'display', display);
            }
          }
        }
      }
      for (index = 0; index < length; index++) {
        if (null != values[index]) {
          elements[index].style.display = values[index];
        }
      }
      return elements;
    }
    jQuery.fn.extend({
      show: function () {
        return showHide(this, true);
      },
      hide: function () {
        return showHide(this);
      },
      toggle: function (state) {
        if ('boolean' == typeof state) {
          if (state) {
            return this.show();
          } else {
            return this.hide();
          }
        } else {
          return this.each(function () {
            if (isHiddenWithinTree(this)) {
              jQuery(this).show();
            } else {
              jQuery(this).hide();
            }
          });
        }
      },
    });
    var rcheckableType = /^(?:checkbox|radio)$/i,
      rtagName = /<([a-z][^\/\0>\x20\t\r\n\f]+)/i,
      rscriptType = /^$|^module$|\/(?:java|ecma)script/i,
      wrapMap = {
        option: [1, "<select multiple='multiple'>", '</select>'],
        thead: [1, '<table>', '</table>'],
        col: [2, '<table><colgroup>', '</colgroup></table>'],
        tr: [2, '<table><tbody>', '</tbody></table>'],
        td: [3, '<table><tbody><tr>', '</tr></tbody></table>'],
        _default: [0, '', ''],
      };
    function getAll(context, tag) {
      var ret;
      ret =
        void 0 !== context.getElementsByTagName
          ? context.getElementsByTagName(tag || '*')
          : void 0 !== context.querySelectorAll
            ? context.querySelectorAll(tag || '*')
            : [];
      if (void 0 === tag || (tag && nodeName(context, tag))) {
        return jQuery.merge([context], ret);
      } else {
        return ret;
      }
    }
    function setGlobalEval(elems, refElements) {
      for (
        var scriptIndex = 0, scriptCount = elems.length;
        scriptIndex < scriptCount;
        scriptIndex++
      ) {
        dataPriv.set(
          elems[scriptIndex],
          'globalEval',
          !refElements || dataPriv.get(refElements[scriptIndex], 'globalEval'),
        );
      }
    }
    wrapMap.optgroup = wrapMap.option;
    wrapMap.tbody = wrapMap.tfoot = wrapMap.colgroup = wrapMap.caption = wrapMap.thead;
    wrapMap.th = wrapMap.td;
    var rhtml = /<|&#?\w+;/;
    function buildFragment(elems, context, scripts, selection, ignored) {
      for (
        var elem,
          tmp,
          tag,
          wrap,
          contains,
          wrapperDepth,
          fragment = context.createDocumentFragment(),
          nodes = [],
          elementIndex = 0,
          elementCount = elems.length;
        elementIndex < elementCount;
        elementIndex++
      ) {
        if ((elem = elems[elementIndex]) || 0 === elem) {
          if ('object' === toType(elem)) {
            jQuery.merge(nodes, elem.nodeType ? [elem] : elem);
          } else {
            if (rhtml.test(elem)) {
              for (
                tmp = tmp || fragment.appendChild(context.createElement('div')),
                  tag = (rtagName.exec(elem) || ['', ''])[1].toLowerCase(),
                  wrap = wrapMap[tag] || wrapMap._default,
                  tmp.innerHTML = wrap[1] + jQuery.htmlPrefilter(elem) + wrap[2],
                  wrapperDepth = wrap[0];
                wrapperDepth--;
              ) {
                tmp = tmp.lastChild;
              }
              jQuery.merge(nodes, tmp.childNodes);
              (tmp = fragment.firstChild).textContent = '';
            } else {
              nodes.push(context.createTextNode(elem));
            }
          }
        }
      }
      for (fragment.textContent = '', elementIndex = 0; (elem = nodes[elementIndex++]); ) {
        if (selection && jQuery.inArray(elem, selection) > -1) {
          if (ignored) {
            ignored.push(elem);
          }
        } else {
          contains = jQuery.contains(elem.ownerDocument, elem);
          tmp = getAll(fragment.appendChild(elem), 'script');
          if (contains) {
            setGlobalEval(tmp);
          }
          if (scripts) {
            for (wrapperDepth = 0; (elem = tmp[wrapperDepth++]); ) {
              if (rscriptType.test(elem.type || '')) {
                scripts.push(elem);
              }
            }
          }
        }
      }
      return fragment;
    }
    !(function () {
      var div = document.createDocumentFragment().appendChild(document.createElement('div')),
        input = document.createElement('input');
      input.setAttribute('type', 'radio');
      input.setAttribute('checked', 'checked');
      input.setAttribute('name', 't');
      div.appendChild(input);
      support.checkClone = div.cloneNode(true).cloneNode(true).lastChild.checked;
      div.innerHTML = '<textarea>x</textarea>';
      support.noCloneChecked = !!div.cloneNode(true).lastChild.defaultValue;
    })();
    var documentElement = document.documentElement,
      rkeyEvent = /^key/,
      rmouseEvent = /^(?:mouse|pointer|contextmenu|drag|drop)|click/,
      rtypenamespace = /^([^.]*)(?:\.(.+)|)/;
    function returnTrue() {
      return true;
    }
    function returnFalse() {
      return false;
    }
    function safeActiveElement() {
      try {
        return document.activeElement;
      } catch (error) {}
    }
    function on(elem, types, selector, data, callback, one) {
      var origFn, type;
      if ('object' == typeof types) {
        for (type in ('string' != typeof selector &&
          ((data = data || selector), (selector = void 0)),
        types)) {
          on(elem, type, selector, data, types[type], one);
        }
        return elem;
      }
      if (null == data && null == callback) {
        callback = selector;
        data = selector = void 0;
      } else {
        if (null == callback) {
          if ('string' == typeof selector) {
            callback = data;
            data = void 0;
          } else {
            callback = data;
            data = selector;
            selector = void 0;
          }
        }
      }
      if (false === callback) {
        callback = returnFalse;
      } else {
        if (!callback) {
          return elem;
        }
      }
      if (1 === one) {
        origFn = callback;
        (callback = function (event) {
          jQuery().off(event);
          return origFn.apply(this, arguments);
        }).guid = origFn.guid || (origFn.guid = jQuery.guid++);
      }
      return elem.each(function () {
        jQuery.event.add(this, types, callback, data, selector);
      });
    }
    jQuery.event = {
      global: {},
      add: function (elem, types, handler, data, selector) {
        var handleObjIn,
          eventHandle,
          tmp,
          events,
          typeIndex,
          handleObj,
          special,
          handlers,
          type,
          namespaces,
          origType,
          elemData = dataPriv.get(elem);
        if (elemData) {
          for (
            handler.handler &&
              ((handler = (handleObjIn = handler).handler), (selector = handleObjIn.selector)),
              selector && jQuery.find.matchesSelector(documentElement, selector),
              handler.guid || (handler.guid = jQuery.guid++),
              (events = elemData.events) || (events = elemData.events = {}),
              (eventHandle = elemData.handle) ||
                (eventHandle = elemData.handle =
                  function (event) {
                    if (void 0 !== jQuery && jQuery.event.triggered !== event.type) {
                      return jQuery.event.dispatch.apply(elem, arguments);
                    } else {
                      return void 0;
                    }
                  }),
              typeIndex = (types = (types || '').match(rnothtmlwhite) || ['']).length;
            typeIndex--;
          ) {
            type = origType = (tmp = rtypenamespace.exec(types[typeIndex]) || [])[1];
            namespaces = (tmp[2] || '').split('.').sort();
            if (type) {
              special = jQuery.event.special[type] || {};
              type = (selector ? special.delegateType : special.bindType) || type;
              special = jQuery.event.special[type] || {};
              handleObj = jQuery.extend(
                {
                  type: type,
                  origType: origType,
                  data: data,
                  handler: handler,
                  guid: handler.guid,
                  selector: selector,
                  needsContext: selector && jQuery.expr.match.needsContext.test(selector),
                  namespace: namespaces.join('.'),
                },
                handleObjIn,
              );
              if (!(handlers = events[type])) {
                (handlers = events[type] = []).delegateCount = 0;
                if (
                  !(
                    special.setup &&
                    false !== special.setup.call(elem, data, namespaces, eventHandle)
                  )
                ) {
                  if (elem.addEventListener) {
                    elem.addEventListener(type, eventHandle);
                  }
                }
              }
              if (special.add) {
                special.add.call(elem, handleObj);
                if (!handleObj.handler.guid) {
                  handleObj.handler.guid = handler.guid;
                }
              }
              if (selector) {
                handlers.splice(handlers.delegateCount++, 0, handleObj);
              } else {
                handlers.push(handleObj);
              }
              jQuery.event.global[type] = true;
            }
          }
        }
      },
      remove: function (elem, types, handler, selector, mappedTypes) {
        var handlerIndex,
          origCount,
          tmp,
          events,
          typeIndex,
          handleObj,
          special,
          handlers,
          type,
          namespaces,
          origType,
          elemData = dataPriv.hasData(elem) && dataPriv.get(elem);
        if (elemData && (events = elemData.events)) {
          for (
            typeIndex = (types = (types || '').match(rnothtmlwhite) || ['']).length;
            typeIndex--;
          ) {
            type = origType = (tmp = rtypenamespace.exec(types[typeIndex]) || [])[1];
            namespaces = (tmp[2] || '').split('.').sort();
            if (type) {
              for (
                special = jQuery.event.special[type] || {},
                  handlers =
                    events[(type = (selector ? special.delegateType : special.bindType) || type)] ||
                    [],
                  tmp =
                    tmp[2] && new RegExp('(^|\\.)' + namespaces.join('\\.(?:.*\\.|)') + '(\\.|$)'),
                  origCount = handlerIndex = handlers.length;
                handlerIndex--;
              ) {
                handleObj = handlers[handlerIndex];
                if (
                  !(
                    (!mappedTypes && origType !== handleObj.origType) ||
                    (handler && handler.guid !== handleObj.guid) ||
                    (tmp && !tmp.test(handleObj.namespace)) ||
                    (selector &&
                      selector !== handleObj.selector &&
                      ('**' !== selector || !handleObj.selector))
                  )
                ) {
                  handlers.splice(handlerIndex, 1);
                  if (handleObj.selector) {
                    handlers.delegateCount--;
                  }
                  if (special.remove) {
                    special.remove.call(elem, handleObj);
                  }
                }
              }
              if (origCount && !handlers.length) {
                if (
                  !(
                    special.teardown &&
                    false !== special.teardown.call(elem, namespaces, elemData.handle)
                  )
                ) {
                  jQuery.removeEvent(elem, type, elemData.handle);
                }
                delete events[type];
              }
            } else {
              for (type in events) {
                jQuery.event.remove(elem, type + types[typeIndex], handler, selector, true);
              }
            }
          }
          if (jQuery.isEmptyObject(events)) {
            dataPriv.remove(elem, 'handle events');
          }
        }
      },
      dispatch: function (nativeEvent) {
        var groupIndex,
          handlerIndex,
          handlerResult,
          matched,
          handleObj,
          handlerQueue,
          event = jQuery.event.fix(nativeEvent),
          args = new Array(arguments.length),
          handlers = (dataPriv.get(this, 'events') || {})[event.type] || [],
          special = jQuery.event.special[event.type] || {};
        for (args[0] = event, groupIndex = 1; groupIndex < arguments.length; groupIndex++) {
          args[groupIndex] = arguments[groupIndex];
        }
        event.delegateTarget = this;
        if (!special.preDispatch || false !== special.preDispatch.call(this, event)) {
          for (
            handlerQueue = jQuery.event.handlers.call(this, event, handlers), groupIndex = 0;
            (matched = handlerQueue[groupIndex++]) && !event.isPropagationStopped();
          ) {
            for (
              event.currentTarget = matched.elem, handlerIndex = 0;
              (handleObj = matched.handlers[handlerIndex++]) &&
              !event.isImmediatePropagationStopped();
            ) {
              if (!(event.rnamespace && !event.rnamespace.test(handleObj.namespace))) {
                event.handleObj = handleObj;
                event.data = handleObj.data;
                if (
                  void 0 !==
                    (handlerResult = (
                      (jQuery.event.special[handleObj.origType] || {}).handle || handleObj.handler
                    ).apply(matched.elem, args)) &&
                  false === (event.result = handlerResult)
                ) {
                  event.preventDefault();
                  event.stopPropagation();
                }
              }
            }
          }
          if (special.postDispatch) {
            special.postDispatch.call(this, event);
          }
          return event.result;
        }
      },
      handlers: function (event, handlers) {
        var handlerIndex,
          handleObj,
          selection,
          matchedHandlers,
          matchedSelectors,
          handlerQueue = [],
          delegateCount = handlers.delegateCount,
          cur = event.target;
        if (delegateCount && cur.nodeType && !('click' === event.type && event.button >= 1)) {
          for (; cur !== this; cur = cur.parentNode || this) {
            if (1 === cur.nodeType && ('click' !== event.type || true !== cur.disabled)) {
              for (
                matchedHandlers = [], matchedSelectors = {}, handlerIndex = 0;
                handlerIndex < delegateCount;
                handlerIndex++
              ) {
                if (
                  void 0 ===
                  matchedSelectors[
                    (selection = (handleObj = handlers[handlerIndex]).selector + ' ')
                  ]
                ) {
                  matchedSelectors[selection] = handleObj.needsContext
                    ? jQuery(selection, this).index(cur) > -1
                    : jQuery.find(selection, this, null, [cur]).length;
                }
                if (matchedSelectors[selection]) {
                  matchedHandlers.push(handleObj);
                }
              }
              if (matchedHandlers.length) {
                handlerQueue.push({ elem: cur, handlers: matchedHandlers });
              }
            }
          }
        }
        cur = this;
        if (delegateCount < handlers.length) {
          handlerQueue.push({ elem: cur, handlers: handlers.slice(delegateCount) });
        }
        return handlerQueue;
      },
      addProp: function (name, hook) {
        Object.defineProperty(jQuery.Event.prototype, name, {
          enumerable: true,
          configurable: true,
          get: isFunction(hook)
            ? function () {
                if (this.originalEvent) {
                  return hook(this.originalEvent);
                }
              }
            : function () {
                if (this.originalEvent) {
                  return this.originalEvent[name];
                }
              },
          set: function (value) {
            Object.defineProperty(this, name, {
              enumerable: true,
              configurable: true,
              writable: true,
              value: value,
            });
          },
        });
      },
      fix: function (originalEvent) {
        if (originalEvent[jQuery.expando]) {
          return originalEvent;
        } else {
          return new jQuery.Event(originalEvent);
        }
      },
      special: {
        load: { noBubble: true },
        focus: {
          trigger: function () {
            if (this !== safeActiveElement() && this.focus) {
              this.focus();
              return false;
            }
          },
          delegateType: 'focusin',
        },
        blur: {
          trigger: function () {
            if (this === safeActiveElement() && this.blur) {
              this.blur();
              return false;
            }
          },
          delegateType: 'focusout',
        },
        click: {
          trigger: function () {
            if ('checkbox' === this.type && this.click && nodeName(this, 'input')) {
              this.click();
              return false;
            }
          },
          _default: function (event) {
            return nodeName(event.target, 'a');
          },
        },
        beforeunload: {
          postDispatch: function (event) {
            if (void 0 !== event.result && event.originalEvent) {
              event.originalEvent.returnValue = event.result;
            }
          },
        },
      },
    };
    jQuery.removeEvent = function (elem, type, handle) {
      if (elem.removeEventListener) {
        elem.removeEventListener(type, handle);
      }
    };
    jQuery.Event = function (src, props) {
      if (!(this instanceof jQuery.Event)) {
        return new jQuery.Event(src, props);
      }
      if (src && src.type) {
        this.originalEvent = src;
        this.type = src.type;
        this.isDefaultPrevented =
          src.defaultPrevented || (void 0 === src.defaultPrevented && false === src.returnValue)
            ? returnTrue
            : returnFalse;
        this.target = src.target && 3 === src.target.nodeType ? src.target.parentNode : src.target;
        this.currentTarget = src.currentTarget;
        this.relatedTarget = src.relatedTarget;
      } else {
        this.type = src;
      }
      if (props) {
        jQuery.extend(this, props);
      }
      this.timeStamp = (src && src.timeStamp) || Date.now();
      this[jQuery.expando] = true;
    };
    jQuery.Event.prototype = {
      constructor: jQuery.Event,
      isDefaultPrevented: returnFalse,
      isPropagationStopped: returnFalse,
      isImmediatePropagationStopped: returnFalse,
      isSimulated: false,
      preventDefault: function () {
        var originalEvent = this.originalEvent;
        this.isDefaultPrevented = returnTrue;
        if (originalEvent && !this.isSimulated) {
          originalEvent.preventDefault();
        }
      },
      stopPropagation: function () {
        var originalEvent = this.originalEvent;
        this.isPropagationStopped = returnTrue;
        if (originalEvent && !this.isSimulated) {
          originalEvent.stopPropagation();
        }
      },
      stopImmediatePropagation: function () {
        var originalEvent = this.originalEvent;
        this.isImmediatePropagationStopped = returnTrue;
        if (originalEvent && !this.isSimulated) {
          originalEvent.stopImmediatePropagation();
        }
        this.stopPropagation();
      },
    };
    jQuery.each(
      {
        altKey: true,
        bubbles: true,
        cancelable: true,
        changedTouches: true,
        ctrlKey: true,
        detail: true,
        eventPhase: true,
        metaKey: true,
        pageX: true,
        pageY: true,
        shiftKey: true,
        view: true,
        char: true,
        charCode: true,
        key: true,
        keyCode: true,
        button: true,
        buttons: true,
        clientX: true,
        clientY: true,
        offsetX: true,
        offsetY: true,
        pointerId: true,
        pointerType: true,
        screenX: true,
        screenY: true,
        targetTouches: true,
        toElement: true,
        touches: true,
        which: function (event) {
          var button = event.button;
          if (null == event.which && rkeyEvent.test(event.type)) {
            if (null != event.charCode) {
              return event.charCode;
            } else {
              return event.keyCode;
            }
          } else {
            if (!event.which && void 0 !== button && rmouseEvent.test(event.type)) {
              if (1 & button) {
                return 1;
              } else {
                if (2 & button) {
                  return 3;
                } else {
                  if (4 & button) {
                    return 2;
                  } else {
                    return 0;
                  }
                }
              }
            } else {
              return event.which;
            }
          }
        },
      },
      jQuery.event.addProp,
    );
    jQuery.each(
      {
        mouseenter: 'mouseover',
        mouseleave: 'mouseout',
        pointerenter: 'pointerover',
        pointerleave: 'pointerout',
      },
      function (orig, fix) {
        jQuery.event.special[orig] = {
          delegateType: fix,
          bindType: fix,
          handle: function (event) {
            var ret,
              related = event.relatedTarget,
              handleObj = event.handleObj;
            if (!(related && (related === this || jQuery.contains(this, related)))) {
              event.type = handleObj.origType;
              ret = handleObj.handler.apply(this, arguments);
              event.type = fix;
            }
            return ret;
          },
        };
      },
    );
    jQuery.fn.extend({
      on: function (types, selector, data, callback) {
        return on(this, types, selector, data, callback);
      },
      one: function (types, selector, data, callback) {
        return on(this, types, selector, data, callback, 1);
      },
      off: function (types, selector, callback) {
        var handleObj, type;
        if (types && types.preventDefault && types.handleObj) {
          handleObj = types.handleObj;
          jQuery(types.delegateTarget).off(
            handleObj.namespace
              ? handleObj.origType + '.' + handleObj.namespace
              : handleObj.origType,
            handleObj.selector,
            handleObj.handler,
          );
          return this;
        }
        if ('object' == typeof types) {
          for (type in types) {
            this.off(type, selector, types[type]);
          }
          return this;
        }
        if (!(false !== selector && 'function' != typeof selector)) {
          callback = selector;
          selector = void 0;
        }
        if (false === callback) {
          callback = returnFalse;
        }
        return this.each(function () {
          jQuery.event.remove(this, types, callback, selector);
        });
      },
    });
    var rxhtmlTag =
        /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([a-z][^\/\0>\x20\t\r\n\f]*)[^>]*)\/>/gi,
      rnoInnerhtml = /<script|<style|<link/i,
      rchecked = /checked\s*(?:[^=]|=\s*.checked.)/i,
      rcleanScript = /^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g;
    function manipulationTarget(elem, content) {
      return (
        (nodeName(elem, 'table') &&
          nodeName(11 !== content.nodeType ? content : content.firstChild, 'tr') &&
          jQuery(elem).children('tbody')[0]) ||
        elem
      );
    }
    function disableScript(elem) {
      elem.type = (null !== elem.getAttribute('type')) + '/' + elem.type;
      return elem;
    }
    function restoreScript(elem) {
      if ('true/' === (elem.type || '').slice(0, 5)) {
        elem.type = elem.type.slice(5);
      } else {
        elem.removeAttribute('type');
      }
      return elem;
    }
    function cloneCopyEvent(src, dest) {
      var handlerIndex, handlerCount, type, pdataOld, pdataCur, udataOld, udataCur, events;
      if (1 === dest.nodeType) {
        if (
          dataPriv.hasData(src) &&
          ((pdataOld = dataPriv.access(src)),
          (pdataCur = dataPriv.set(dest, pdataOld)),
          (events = pdataOld.events))
        ) {
          for (type in (delete pdataCur.handle, (pdataCur.events = {}), events)) {
            for (
              handlerIndex = 0, handlerCount = events[type].length;
              handlerIndex < handlerCount;
              handlerIndex++
            ) {
              jQuery.event.add(dest, type, events[type][handlerIndex]);
            }
          }
        }
        if (dataUser.hasData(src)) {
          udataOld = dataUser.access(src);
          udataCur = jQuery.extend({}, udataOld);
          dataUser.set(dest, udataCur);
        }
      }
    }
    function fixInput(src, dest) {
      var nodeName = dest.nodeName.toLowerCase();
      if ('input' === nodeName && rcheckableType.test(src.type)) {
        dest.checked = src.checked;
      } else {
        if (!('input' !== nodeName && 'textarea' !== nodeName)) {
          dest.defaultValue = src.defaultValue;
        }
      }
    }
    function domManip(collection, args, callback, ignored) {
      args = concat.apply([], args);
      var fragment,
        first,
        scripts,
        hasScripts,
        node,
        documentModel,
        elementIndex = 0,
        elementCount = collection.length,
        iNoClone = elementCount - 1,
        value = args[0],
        valueIsFunction = isFunction(value);
      if (
        valueIsFunction ||
        (elementCount > 1 &&
          'string' == typeof value &&
          !support.checkClone &&
          rchecked.test(value))
      ) {
        return collection.each(function (index) {
          var self = collection.eq(index);
          if (valueIsFunction) {
            args[0] = value.call(this, index, self.html());
          }
          domManip(self, args, callback, ignored);
        });
      }
      if (
        elementCount &&
        ((first = (fragment = buildFragment(
          args,
          collection[0].ownerDocument,
          false,
          collection,
          ignored,
        )).firstChild),
        1 === fragment.childNodes.length && (fragment = first),
        first || ignored)
      ) {
        for (
          hasScripts = (scripts = jQuery.map(getAll(fragment, 'script'), disableScript)).length;
          elementIndex < elementCount;
          elementIndex++
        ) {
          node = fragment;
          if (elementIndex !== iNoClone) {
            node = jQuery.clone(node, true, true);
            if (hasScripts) {
              jQuery.merge(scripts, getAll(node, 'script'));
            }
          }
          callback.call(collection[elementIndex], node, elementIndex);
        }
        if (hasScripts) {
          for (
            documentModel = scripts[scripts.length - 1].ownerDocument,
              jQuery.map(scripts, restoreScript),
              elementIndex = 0;
            elementIndex < hasScripts;
            elementIndex++
          ) {
            node = scripts[elementIndex];
            if (
              rscriptType.test(node.type || '') &&
              !dataPriv.access(node, 'globalEval') &&
              jQuery.contains(documentModel, node)
            ) {
              if (node.src && 'module' !== (node.type || '').toLowerCase()) {
                if (jQuery._evalUrl) {
                  jQuery._evalUrl(node.src);
                }
              } else {
                DOMEval(node.textContent.replace(rcleanScript, ''), documentModel, node);
              }
            }
          }
        }
      }
      return collection;
    }
    function remove(elem, selector, keepData) {
      for (
        var node, nodes = selector ? jQuery.filter(selector, elem) : elem, elementIndex = 0;
        null != (node = nodes[elementIndex]);
        elementIndex++
      ) {
        if (!(keepData || 1 !== node.nodeType)) {
          jQuery.cleanData(getAll(node));
        }
        if (node.parentNode) {
          if (keepData && jQuery.contains(node.ownerDocument, node)) {
            setGlobalEval(getAll(node, 'script'));
          }
          node.parentNode.removeChild(node);
        }
      }
      return elem;
    }
    jQuery.extend({
      htmlPrefilter: function (html) {
        return html.replace(rxhtmlTag, '<$1></$2>');
      },
      clone: function (elem, dataAndEvents, deepDataAndEvents) {
        var elementIndex,
          elementCount,
          srcElements,
          destElements,
          clone = elem.cloneNode(true),
          inPage = jQuery.contains(elem.ownerDocument, elem);
        if (
          !(
            support.noCloneChecked ||
            (1 !== elem.nodeType && 11 !== elem.nodeType) ||
            jQuery.isXMLDoc(elem)
          )
        ) {
          for (
            destElements = getAll(clone),
              elementIndex = 0,
              elementCount = (srcElements = getAll(elem)).length;
            elementIndex < elementCount;
            elementIndex++
          ) {
            fixInput(srcElements[elementIndex], destElements[elementIndex]);
          }
        }
        if (dataAndEvents) {
          if (deepDataAndEvents) {
            for (
              srcElements = srcElements || getAll(elem),
                destElements = destElements || getAll(clone),
                elementIndex = 0,
                elementCount = srcElements.length;
              elementIndex < elementCount;
              elementIndex++
            ) {
              cloneCopyEvent(srcElements[elementIndex], destElements[elementIndex]);
            }
          } else {
            cloneCopyEvent(elem, clone);
          }
        }
        if ((destElements = getAll(clone, 'script')).length > 0) {
          setGlobalEval(destElements, !inPage && getAll(elem, 'script'));
        }
        return clone;
      },
      cleanData: function (elems) {
        for (
          var data, elem, type, special = jQuery.event.special, elementIndex = 0;
          void 0 !== (elem = elems[elementIndex]);
          elementIndex++
        ) {
          if (acceptData(elem)) {
            if ((data = elem[dataPriv.expando])) {
              if (data.events) {
                for (type in data.events) {
                  if (special[type]) {
                    jQuery.event.remove(elem, type);
                  } else {
                    jQuery.removeEvent(elem, type, data.handle);
                  }
                }
              }
              elem[dataPriv.expando] = void 0;
            }
            if (elem[dataUser.expando]) {
              elem[dataUser.expando] = void 0;
            }
          }
        }
      },
    });
    jQuery.fn.extend({
      detach: function (selector) {
        return remove(this, selector, true);
      },
      remove: function (selector) {
        return remove(this, selector);
      },
      text: function (value) {
        return access(
          this,
          function (value) {
            if (void 0 === value) {
              return jQuery.text(this);
            } else {
              return this.empty().each(function () {
                if (!(1 !== this.nodeType && 11 !== this.nodeType && 9 !== this.nodeType)) {
                  this.textContent = value;
                }
              });
            }
          },
          null,
          value,
          arguments.length,
        );
      },
      append: function () {
        return domManip(this, arguments, function (elem) {
          if (!(1 !== this.nodeType && 11 !== this.nodeType && 9 !== this.nodeType)) {
            manipulationTarget(this, elem).appendChild(elem);
          }
        });
      },
      prepend: function () {
        return domManip(this, arguments, function (elem) {
          if (1 === this.nodeType || 11 === this.nodeType || 9 === this.nodeType) {
            var target = manipulationTarget(this, elem);
            target.insertBefore(elem, target.firstChild);
          }
        });
      },
      before: function () {
        return domManip(this, arguments, function (elem) {
          if (this.parentNode) {
            this.parentNode.insertBefore(elem, this);
          }
        });
      },
      after: function () {
        return domManip(this, arguments, function (elem) {
          if (this.parentNode) {
            this.parentNode.insertBefore(elem, this.nextSibling);
          }
        });
      },
      empty: function () {
        for (var elem, elementIndex = 0; null != (elem = this[elementIndex]); elementIndex++) {
          if (1 === elem.nodeType) {
            jQuery.cleanData(getAll(elem, false));
            elem.textContent = '';
          }
        }
        return this;
      },
      clone: function (dataAndEvents, deepDataAndEvents) {
        dataAndEvents = null != dataAndEvents && dataAndEvents;
        deepDataAndEvents = null == deepDataAndEvents ? dataAndEvents : deepDataAndEvents;
        return this.map(function () {
          return jQuery.clone(this, dataAndEvents, deepDataAndEvents);
        });
      },
      html: function (value) {
        return access(
          this,
          function (value) {
            var elem = this[0] || {},
              elementIndex = 0,
              elementCount = this.length;
            if (void 0 === value && 1 === elem.nodeType) {
              return elem.innerHTML;
            }
            if (
              'string' == typeof value &&
              !rnoInnerhtml.test(value) &&
              !wrapMap[(rtagName.exec(value) || ['', ''])[1].toLowerCase()]
            ) {
              value = jQuery.htmlPrefilter(value);
              try {
                for (; elementIndex < elementCount; elementIndex++) {
                  if (1 === (elem = this[elementIndex] || {}).nodeType) {
                    jQuery.cleanData(getAll(elem, false));
                    elem.innerHTML = value;
                  }
                }
                elem = 0;
              } catch (error) {}
            }
            if (elem) {
              this.empty().append(value);
            }
          },
          null,
          value,
          arguments.length,
        );
      },
      replaceWith: function () {
        var ignored = [];
        return domManip(
          this,
          arguments,
          function (elem) {
            var parent = this.parentNode;
            if (jQuery.inArray(this, ignored) < 0) {
              jQuery.cleanData(getAll(this));
              if (parent) {
                parent.replaceChild(elem, this);
              }
            }
          },
          ignored,
        );
      },
    });
    jQuery.each(
      {
        appendTo: 'append',
        prependTo: 'prepend',
        insertBefore: 'before',
        insertAfter: 'after',
        replaceAll: 'replaceWith',
      },
      function (name, original) {
        jQuery.fn[name] = function (selector) {
          for (
            var elems,
              ret = [],
              insert = jQuery(selector),
              last = insert.length - 1,
              targetIndex = 0;
            targetIndex <= last;
            targetIndex++
          ) {
            elems = targetIndex === last ? this : this.clone(true);
            jQuery(insert[targetIndex])[original](elems);
            push.apply(ret, elems.get());
          }
          return this.pushStack(ret);
        };
      },
    );
    var rnumnonpx = new RegExp('^(' + pnum + ')(?!px)[a-z%]+$', 'i'),
      getStyles = function (elem) {
        var view = elem.ownerDocument.defaultView;
        if (!(view && view.opener)) {
          view = window;
        }
        return view.getComputedStyle(elem);
      },
      rboxStyle = new RegExp(cssExpand.join('|'), 'i');
    function curCSS(elem, name, computed) {
      var width,
        minWidth,
        maxWidth,
        ret,
        style = elem.style;
      if ((computed = computed || getStyles(elem))) {
        if (
          !(
            '' !== (ret = computed.getPropertyValue(name) || computed[name]) ||
            jQuery.contains(elem.ownerDocument, elem)
          )
        ) {
          ret = jQuery.style(elem, name);
        }
        if (!support.pixelBoxStyles() && rnumnonpx.test(ret) && rboxStyle.test(name)) {
          width = style.width;
          minWidth = style.minWidth;
          maxWidth = style.maxWidth;
          style.minWidth = style.maxWidth = style.width = ret;
          ret = computed.width;
          style.width = width;
          style.minWidth = minWidth;
          style.maxWidth = maxWidth;
        }
      }
      if (void 0 !== ret) {
        return ret + '';
      } else {
        return ret;
      }
    }
    function addGetHookIf(conditionFn, hookFn) {
      return {
        get: function () {
          if (!conditionFn()) {
            return (this.get = hookFn).apply(this, arguments);
          }
          delete this.get;
        },
      };
    }
    !(function () {
      function computeStyleTests() {
        if (div) {
          container.style.cssText =
            'position:absolute;left:-11111px;width:60px;margin-top:1px;padding:0;border:0';
          div.style.cssText =
            'position:relative;display:block;box-sizing:border-box;overflow:scroll;margin:auto;border:1px;padding:1px;width:60%;top:1%';
          documentElement.appendChild(container).appendChild(div);
          var divStyle = window.getComputedStyle(div);
          pixelPositionVal = '1%' !== divStyle.top;
          reliableMarginLeftVal = 12 === roundPixelMeasures(divStyle.marginLeft);
          div.style.right = '60%';
          pixelBoxStylesVal = 36 === roundPixelMeasures(divStyle.right);
          boxSizingReliableVal = 36 === roundPixelMeasures(divStyle.width);
          div.style.position = 'absolute';
          scrollboxSizeVal = 36 === div.offsetWidth || 'absolute';
          documentElement.removeChild(container);
          div = null;
        }
      }
      function roundPixelMeasures(measure) {
        return Math.round(parseFloat(measure));
      }
      var pixelPositionVal,
        boxSizingReliableVal,
        scrollboxSizeVal,
        pixelBoxStylesVal,
        reliableMarginLeftVal,
        container = document.createElement('div'),
        div = document.createElement('div');
      if (div.style) {
        div.style.backgroundClip = 'content-box';
        div.cloneNode(true).style.backgroundClip = '';
        support.clearCloneStyle = 'content-box' === div.style.backgroundClip;
        jQuery.extend(support, {
          boxSizingReliable: function () {
            computeStyleTests();
            return boxSizingReliableVal;
          },
          pixelBoxStyles: function () {
            computeStyleTests();
            return pixelBoxStylesVal;
          },
          pixelPosition: function () {
            computeStyleTests();
            return pixelPositionVal;
          },
          reliableMarginLeft: function () {
            computeStyleTests();
            return reliableMarginLeftVal;
          },
          scrollboxSize: function () {
            computeStyleTests();
            return scrollboxSizeVal;
          },
        });
      }
    })();
    var rdisplayswap = /^(none|table(?!-c[ea]).+)/,
      rcustomProp = /^--/,
      cssShow = { position: 'absolute', visibility: 'hidden', display: 'block' },
      cssNormalTransform = { letterSpacing: '0', fontWeight: '400' },
      cssPrefixes = ['Webkit', 'Moz', 'ms'],
      emptyStyle = document.createElement('div').style;
    function finalPropName(name) {
      var ret = jQuery.cssProps[name];
      if (!ret) {
        ret = jQuery.cssProps[name] =
          (function (name) {
            if (name in emptyStyle) {
              return name;
            }
            for (
              var capName = name[0].toUpperCase() + name.slice(1), prefixIndex = cssPrefixes.length;
              prefixIndex--;
            ) {
              if ((name = cssPrefixes[prefixIndex] + capName) in emptyStyle) {
                return name;
              }
            }
          })(name) || name;
      }
      return ret;
    }
    function setPositiveNumber(elem, value, subtract) {
      var matches = rcssNum.exec(value);
      if (matches) {
        return Math.max(0, matches[2] - (subtract || 0)) + (matches[3] || 'px');
      } else {
        return value;
      }
    }
    function boxModelAdjustment(elem, dimension, box, isBorderBox, styles, computedVal) {
      var sideIndex = 'width' === dimension ? 1 : 0,
        extra = 0,
        delta = 0;
      if (box === (isBorderBox ? 'border' : 'content')) {
        return 0;
      }
      for (; sideIndex < 4; sideIndex += 2) {
        if ('margin' === box) {
          delta += jQuery.css(elem, box + cssExpand[sideIndex], true, styles);
        }
        if (isBorderBox) {
          if ('content' === box) {
            delta -= jQuery.css(elem, 'padding' + cssExpand[sideIndex], true, styles);
          }
          if ('margin' !== box) {
            delta -= jQuery.css(elem, 'border' + cssExpand[sideIndex] + 'Width', true, styles);
          }
        } else {
          delta += jQuery.css(elem, 'padding' + cssExpand[sideIndex], true, styles);
          if ('padding' !== box) {
            delta += jQuery.css(elem, 'border' + cssExpand[sideIndex] + 'Width', true, styles);
          } else {
            extra += jQuery.css(elem, 'border' + cssExpand[sideIndex] + 'Width', true, styles);
          }
        }
      }
      if (!isBorderBox && computedVal >= 0) {
        delta += Math.max(
          0,
          Math.ceil(
            elem['offset' + dimension[0].toUpperCase() + dimension.slice(1)] -
              computedVal -
              delta -
              extra -
              0.5,
          ),
        );
      }
      return delta;
    }
    function getWidthOrHeight(elem, dimension, extra) {
      var styles = getStyles(elem),
        val = curCSS(elem, dimension, styles),
        isBorderBox = 'border-box' === jQuery.css(elem, 'boxSizing', false, styles),
        valueIsBorderBox = isBorderBox;
      if (rnumnonpx.test(val)) {
        if (!extra) {
          return val;
        }
        val = 'auto';
      }
      valueIsBorderBox =
        valueIsBorderBox && (support.boxSizingReliable() || val === elem.style[dimension]);
      if (
        'auto' === val ||
        (!parseFloat(val) && 'inline' === jQuery.css(elem, 'display', false, styles))
      ) {
        val = elem['offset' + dimension[0].toUpperCase() + dimension.slice(1)];
        valueIsBorderBox = true;
      }
      return (
        (val = parseFloat(val) || 0) +
        boxModelAdjustment(
          elem,
          dimension,
          extra || (isBorderBox ? 'border' : 'content'),
          valueIsBorderBox,
          styles,
          val,
        ) +
        'px'
      );
    }
    function Tween(elem, options, prop, end, easing) {
      return new Tween.prototype.init(elem, options, prop, end, easing);
    }
    jQuery.extend({
      cssHooks: {
        opacity: {
          get: function (elem, computed) {
            if (computed) {
              var ret = curCSS(elem, 'opacity');
              if ('' === ret) {
                return '1';
              } else {
                return ret;
              }
            }
          },
        },
      },
      cssNumber: {
        animationIterationCount: true,
        columnCount: true,
        fillOpacity: true,
        flexGrow: true,
        flexShrink: true,
        fontWeight: true,
        lineHeight: true,
        opacity: true,
        order: true,
        orphans: true,
        widows: true,
        zIndex: true,
        zoom: true,
      },
      cssProps: {},
      style: function (elem, name, value, extra) {
        if (elem && 3 !== elem.nodeType && 8 !== elem.nodeType && elem.style) {
          var ret,
            type,
            hooks,
            origName = camelCase(name),
            isCustomProp = rcustomProp.test(name),
            style = elem.style;
          if (!isCustomProp) {
            name = finalPropName(origName);
          }
          hooks = jQuery.cssHooks[name] || jQuery.cssHooks[origName];
          if (void 0 === value) {
            if (hooks && 'get' in hooks && void 0 !== (ret = hooks.get(elem, false, extra))) {
              return ret;
            } else {
              return style[name];
            }
          }
          if ('string' == (type = typeof value) && (ret = rcssNum.exec(value)) && ret[1]) {
            value = adjustCSS(elem, name, ret);
            type = 'number';
          }
          if (null != value && value == value) {
            if ('number' === type) {
              value += (ret && ret[3]) || (jQuery.cssNumber[origName] ? '' : 'px');
            }
            if (!(support.clearCloneStyle || '' !== value || 0 !== name.indexOf('background'))) {
              style[name] = 'inherit';
            }
            if (!(hooks && 'set' in hooks && void 0 === (value = hooks.set(elem, value, extra)))) {
              if (isCustomProp) {
                style.setProperty(name, value);
              } else {
                style[name] = value;
              }
            }
          }
        }
      },
      css: function (elem, name, extra, styles) {
        var val,
          num,
          hooks,
          origName = camelCase(name);
        if (!rcustomProp.test(name)) {
          name = finalPropName(origName);
        }
        if ((hooks = jQuery.cssHooks[name] || jQuery.cssHooks[origName]) && 'get' in hooks) {
          val = hooks.get(elem, true, extra);
        }
        if (void 0 === val) {
          val = curCSS(elem, name, styles);
        }
        if ('normal' === val && name in cssNormalTransform) {
          val = cssNormalTransform[name];
        }
        if ('' === extra || extra) {
          num = parseFloat(val);
          if (true === extra || isFinite(num)) {
            return num || 0;
          } else {
            return val;
          }
        } else {
          return val;
        }
      },
    });
    jQuery.each(['height', 'width'], function (propertyIndex, dimension) {
      jQuery.cssHooks[dimension] = {
        get: function (elem, computed, extra) {
          if (computed) {
            if (
              !rdisplayswap.test(jQuery.css(elem, 'display')) ||
              (elem.getClientRects().length && elem.getBoundingClientRect().width)
            ) {
              return getWidthOrHeight(elem, dimension, extra);
            } else {
              return swap(elem, cssShow, function () {
                return getWidthOrHeight(elem, dimension, extra);
              });
            }
          }
        },
        set: function (elem, value, extra) {
          var matches,
            styles = getStyles(elem),
            isBorderBox = 'border-box' === jQuery.css(elem, 'boxSizing', false, styles),
            subtract = extra && boxModelAdjustment(elem, dimension, extra, isBorderBox, styles);
          if (isBorderBox && support.scrollboxSize() === styles.position) {
            subtract -= Math.ceil(
              elem['offset' + dimension[0].toUpperCase() + dimension.slice(1)] -
                parseFloat(styles[dimension]) -
                boxModelAdjustment(elem, dimension, 'border', false, styles) -
                0.5,
            );
          }
          if (subtract && (matches = rcssNum.exec(value)) && 'px' !== (matches[3] || 'px')) {
            elem.style[dimension] = value;
            value = jQuery.css(elem, dimension);
          }
          return setPositiveNumber(0, value, subtract);
        },
      };
    });
    jQuery.cssHooks.marginLeft = addGetHookIf(
      support.reliableMarginLeft,
      function (elem, computed) {
        if (computed) {
          return (
            (parseFloat(curCSS(elem, 'marginLeft')) ||
              elem.getBoundingClientRect().left -
                swap(elem, { marginLeft: 0 }, function () {
                  return elem.getBoundingClientRect().left;
                })) + 'px'
          );
        }
      },
    );
    jQuery.each({ margin: '', padding: '', border: 'Width' }, function (prefix, suffix) {
      jQuery.cssHooks[prefix + suffix] = {
        expand: function (value) {
          for (
            var sideIndex = 0,
              expanded = {},
              parts = 'string' == typeof value ? value.split(' ') : [value];
            sideIndex < 4;
            sideIndex++
          ) {
            expanded[prefix + cssExpand[sideIndex] + suffix] =
              parts[sideIndex] || parts[sideIndex - 2] || parts[0];
          }
          return expanded;
        },
      };
      if ('margin' !== prefix) {
        jQuery.cssHooks[prefix + suffix].set = setPositiveNumber;
      }
    });
    jQuery.fn.extend({
      css: function (name, value) {
        return access(
          this,
          function (elem, name, value) {
            var styles,
              len,
              map = {},
              propertyIndex = 0;
            if (Array.isArray(name)) {
              for (
                styles = getStyles(elem), len = name.length;
                propertyIndex < len;
                propertyIndex++
              ) {
                map[name[propertyIndex]] = jQuery.css(elem, name[propertyIndex], false, styles);
              }
              return map;
            }
            if (void 0 !== value) {
              return jQuery.style(elem, name, value);
            } else {
              return jQuery.css(elem, name);
            }
          },
          name,
          value,
          arguments.length > 1,
        );
      },
    });
    jQuery.Tween = Tween;
    Tween.prototype = {
      constructor: Tween,
      init: function (elem, options, prop, end, easing, unit) {
        this.elem = elem;
        this.prop = prop;
        this.easing = easing || jQuery.easing._default;
        this.options = options;
        this.start = this.now = this.cur();
        this.end = end;
        this.unit = unit || (jQuery.cssNumber[prop] ? '' : 'px');
      },
      cur: function () {
        var hooks = Tween.propHooks[this.prop];
        if (hooks && hooks.get) {
          return hooks.get(this);
        } else {
          return Tween.propHooks._default.get(this);
        }
      },
      run: function (percent) {
        var eased,
          hooks = Tween.propHooks[this.prop];
        if (this.options.duration) {
          this.pos = eased = jQuery.easing[this.easing](
            percent,
            this.options.duration * percent,
            0,
            1,
            this.options.duration,
          );
        } else {
          this.pos = eased = percent;
        }
        this.now = (this.end - this.start) * eased + this.start;
        if (this.options.step) {
          this.options.step.call(this.elem, this.now, this);
        }
        if (hooks && hooks.set) {
          hooks.set(this);
        } else {
          Tween.propHooks._default.set(this);
        }
        return this;
      },
    };
    Tween.prototype.init.prototype = Tween.prototype;
    Tween.propHooks = {
      _default: {
        get: function (tween) {
          var result;
          if (
            1 !== tween.elem.nodeType ||
            (null != tween.elem[tween.prop] && null == tween.elem.style[tween.prop])
          ) {
            return tween.elem[tween.prop];
          } else {
            if ((result = jQuery.css(tween.elem, tween.prop, '')) && 'auto' !== result) {
              return result;
            } else {
              return 0;
            }
          }
        },
        set: function (tween) {
          if (jQuery.fx.step[tween.prop]) {
            jQuery.fx.step[tween.prop](tween);
          } else {
            if (
              1 !== tween.elem.nodeType ||
              (null == tween.elem.style[jQuery.cssProps[tween.prop]] &&
                !jQuery.cssHooks[tween.prop])
            ) {
              tween.elem[tween.prop] = tween.now;
            } else {
              jQuery.style(tween.elem, tween.prop, tween.now + tween.unit);
            }
          }
        },
      },
    };
    Tween.propHooks.scrollTop = Tween.propHooks.scrollLeft = {
      set: function (tween) {
        if (tween.elem.nodeType && tween.elem.parentNode) {
          tween.elem[tween.prop] = tween.now;
        }
      },
    };
    jQuery.easing = {
      linear: function (progress) {
        return progress;
      },
      swing: function (progress) {
        return 0.5 - Math.cos(progress * Math.PI) / 2;
      },
      _default: 'swing',
    };
    jQuery.fx = Tween.prototype.init;
    jQuery.fx.step = {};
    var fxNow,
      inProgress,
      rfxtypes = /^(?:toggle|show|hide)$/,
      rrun = /queueHooks$/;
    function schedule() {
      if (inProgress) {
        if (false === document.hidden && window.requestAnimationFrame) {
          window.requestAnimationFrame(schedule);
        } else {
          window.setTimeout(schedule, jQuery.fx.interval);
        }
        jQuery.fx.tick();
      }
    }
    function createFxNow() {
      window.setTimeout(function () {
        fxNow = void 0;
      });
      return (fxNow = Date.now());
    }
    function genFx(type, includeWidth) {
      var which,
        sideIndex = 0,
        attrs = { height: type };
      for (includeWidth = includeWidth ? 1 : 0; sideIndex < 4; sideIndex += 2 - includeWidth) {
        attrs['margin' + (which = cssExpand[sideIndex])] = attrs['padding' + which] = type;
      }
      if (includeWidth) {
        attrs.opacity = attrs.width = type;
      }
      return attrs;
    }
    function createTween(value, prop, animation) {
      for (
        var tween,
          collection = (Animation.tweeners[prop] || []).concat(Animation.tweeners['*']),
          index = 0,
          length = collection.length;
        index < length;
        index++
      ) {
        if ((tween = collection[index].call(animation, prop, value))) {
          return tween;
        }
      }
    }
    function Animation(elem, properties, options) {
      var result,
        stopped,
        index = 0,
        length = Animation.prefilters.length,
        deferred = jQuery.Deferred().always(function () {
          delete tick.elem;
        }),
        tick = function () {
          if (stopped) {
            return false;
          }
          for (
            var currentTime = fxNow || createFxNow(),
              remaining = Math.max(0, animation.startTime + animation.duration - currentTime),
              percent = 1 - (remaining / animation.duration || 0),
              index = 0,
              length = animation.tweens.length;
            index < length;
            index++
          ) {
            animation.tweens[index].run(percent);
          }
          deferred.notifyWith(elem, [animation, percent, remaining]);
          if (percent < 1 && length) {
            return remaining;
          } else {
            if (!length) {
              deferred.notifyWith(elem, [animation, 1, 0]);
            }
            deferred.resolveWith(elem, [animation]);
            return false;
          }
        },
        animation = deferred.promise({
          elem: elem,
          props: jQuery.extend({}, properties),
          opts: jQuery.extend(true, { specialEasing: {}, easing: jQuery.easing._default }, options),
          originalProperties: properties,
          originalOptions: options,
          startTime: fxNow || createFxNow(),
          duration: options.duration,
          tweens: [],
          createTween: function (prop, end) {
            var tween = jQuery.Tween(
              elem,
              animation.opts,
              prop,
              end,
              animation.opts.specialEasing[prop] || animation.opts.easing,
            );
            animation.tweens.push(tween);
            return tween;
          },
          stop: function (gotoEnd) {
            var index = 0,
              length = gotoEnd ? animation.tweens.length : 0;
            if (stopped) {
              return this;
            }
            for (stopped = true; index < length; index++) {
              animation.tweens[index].run(1);
            }
            if (gotoEnd) {
              deferred.notifyWith(elem, [animation, 1, 0]);
              deferred.resolveWith(elem, [animation, gotoEnd]);
            } else {
              deferred.rejectWith(elem, [animation, gotoEnd]);
            }
            return this;
          },
        }),
        props = animation.props;
      for (
        (function (properties, specialEasing) {
          var propertyName, camelName, easing, value, hook;
          for (propertyName in properties) {
            easing = specialEasing[(camelName = camelCase(propertyName))];
            value = properties[propertyName];
            if (Array.isArray(value)) {
              easing = value[1];
              value = properties[propertyName] = value[0];
            }
            if (propertyName !== camelName) {
              properties[camelName] = value;
              delete properties[propertyName];
            }
            if ((hook = jQuery.cssHooks[camelName]) && 'expand' in hook) {
              for (propertyName in ((value = hook.expand(value)),
              delete properties[camelName],
              value)) {
                if (!(propertyName in properties)) {
                  properties[propertyName] = value[propertyName];
                  specialEasing[propertyName] = easing;
                }
              }
            } else {
              specialEasing[camelName] = easing;
            }
          }
        })(props, animation.opts.specialEasing);
        index < length;
        index++
      ) {
        if ((result = Animation.prefilters[index].call(animation, elem, props, animation.opts))) {
          if (isFunction(result.stop)) {
            jQuery._queueHooks(animation.elem, animation.opts.queue).stop =
              result.stop.bind(result);
          }
          return result;
        }
      }
      jQuery.map(props, createTween, animation);
      if (isFunction(animation.opts.start)) {
        animation.opts.start.call(elem, animation);
      }
      animation
        .progress(animation.opts.progress)
        .done(animation.opts.done, animation.opts.complete)
        .fail(animation.opts.fail)
        .always(animation.opts.always);
      jQuery.fx.timer(
        jQuery.extend(tick, { elem: elem, anim: animation, queue: animation.opts.queue }),
      );
      return animation;
    }
    jQuery.Animation = jQuery.extend(Animation, {
      tweeners: {
        '*': [
          function (prop, value) {
            var tween = this.createTween(prop, value);
            adjustCSS(tween.elem, prop, rcssNum.exec(value), tween);
            return tween;
          },
        ],
      },
      tweener: function (props, callback) {
        if (isFunction(props)) {
          callback = props;
          props = ['*'];
        } else {
          props = props.match(rnothtmlwhite);
        }
        for (var prop, index = 0, length = props.length; index < length; index++) {
          prop = props[index];
          Animation.tweeners[prop] = Animation.tweeners[prop] || [];
          Animation.tweeners[prop].unshift(callback);
        }
      },
      prefilters: [
        function (elem, props, opts) {
          var prop,
            value,
            toggle,
            hooks,
            oldfire,
            propTween,
            restoreDisplay,
            display,
            isBox = 'width' in props || 'height' in props,
            anim = this,
            orig = {},
            style = elem.style,
            hidden = elem.nodeType && isHiddenWithinTree(elem),
            dataShow = dataPriv.get(elem, 'fxshow');
          for (prop in (opts.queue ||
            (null == (hooks = jQuery._queueHooks(elem, 'fx')).unqueued &&
              ((hooks.unqueued = 0),
              (oldfire = hooks.empty.fire),
              (hooks.empty.fire = function () {
                if (!hooks.unqueued) {
                  oldfire();
                }
              })),
            hooks.unqueued++,
            anim.always(function () {
              anim.always(function () {
                hooks.unqueued--;
                if (!jQuery.queue(elem, 'fx').length) {
                  hooks.empty.fire();
                }
              });
            })),
          props)) {
            value = props[prop];
            if (rfxtypes.test(value)) {
              delete props[prop];
              toggle = toggle || 'toggle' === value;
              if (value === (hidden ? 'hide' : 'show')) {
                if ('show' !== value || !dataShow || void 0 === dataShow[prop]) {
                  continue;
                }
                hidden = true;
              }
              orig[prop] = (dataShow && dataShow[prop]) || jQuery.style(elem, prop);
            }
          }
          if ((propTween = !jQuery.isEmptyObject(props)) || !jQuery.isEmptyObject(orig)) {
            for (prop in (isBox &&
              1 === elem.nodeType &&
              ((opts.overflow = [style.overflow, style.overflowX, style.overflowY]),
              null == (restoreDisplay = dataShow && dataShow.display) &&
                (restoreDisplay = dataPriv.get(elem, 'display')),
              'none' === (display = jQuery.css(elem, 'display')) &&
                (restoreDisplay
                  ? (display = restoreDisplay)
                  : (showHide([elem], true),
                    (restoreDisplay = elem.style.display || restoreDisplay),
                    (display = jQuery.css(elem, 'display')),
                    showHide([elem]))),
              ('inline' === display || ('inline-block' === display && null != restoreDisplay)) &&
                'none' === jQuery.css(elem, 'float') &&
                (propTween ||
                  (anim.done(function () {
                    style.display = restoreDisplay;
                  }),
                  null == restoreDisplay &&
                    ((display = style.display),
                    (restoreDisplay = 'none' === display ? '' : display))),
                (style.display = 'inline-block'))),
            opts.overflow &&
              ((style.overflow = 'hidden'),
              anim.always(function () {
                style.overflow = opts.overflow[0];
                style.overflowX = opts.overflow[1];
                style.overflowY = opts.overflow[2];
              })),
            (propTween = false),
            orig)) {
              if (!propTween) {
                if (dataShow) {
                  if ('hidden' in dataShow) {
                    hidden = dataShow.hidden;
                  }
                } else {
                  dataShow = dataPriv.access(elem, 'fxshow', { display: restoreDisplay });
                }
                if (toggle) {
                  dataShow.hidden = !hidden;
                }
                if (hidden) {
                  showHide([elem], true);
                }
                anim.done(function () {
                  for (prop in (hidden || showHide([elem]),
                  dataPriv.remove(elem, 'fxshow'),
                  orig)) {
                    jQuery.style(elem, prop, orig[prop]);
                  }
                });
              }
              propTween = createTween(hidden ? dataShow[prop] : 0, prop, anim);
              if (!(prop in dataShow)) {
                dataShow[prop] = propTween.start;
                if (hidden) {
                  propTween.end = propTween.start;
                  propTween.start = 0;
                }
              }
            }
          }
        },
      ],
      prefilter: function (callback, prepend) {
        if (prepend) {
          Animation.prefilters.unshift(callback);
        } else {
          Animation.prefilters.push(callback);
        }
      },
    });
    jQuery.speed = function (speed, easing, callback) {
      var opt =
        speed && 'object' == typeof speed
          ? jQuery.extend({}, speed)
          : {
              complete: callback || (!callback && easing) || (isFunction(speed) && speed),
              duration: speed,
              easing: (callback && easing) || (easing && !isFunction(easing) && easing),
            };
      if (jQuery.fx.off) {
        opt.duration = 0;
      } else {
        if ('number' != typeof opt.duration) {
          if (opt.duration in jQuery.fx.speeds) {
            opt.duration = jQuery.fx.speeds[opt.duration];
          } else {
            opt.duration = jQuery.fx.speeds._default;
          }
        }
      }
      if (!(null != opt.queue && true !== opt.queue)) {
        opt.queue = 'fx';
      }
      opt.old = opt.complete;
      opt.complete = function () {
        if (isFunction(opt.old)) {
          opt.old.call(this);
        }
        if (opt.queue) {
          jQuery.dequeue(this, opt.queue);
        }
      };
      return opt;
    };
    jQuery.fn.extend({
      fadeTo: function (speed, opacity, easing, callback) {
        return this.filter(isHiddenWithinTree)
          .css('opacity', 0)
          .show()
          .end()
          .animate({ opacity: opacity }, speed, easing, callback);
      },
      animate: function (prop, speed, easing, callback) {
        var empty = jQuery.isEmptyObject(prop),
          optall = jQuery.speed(speed, easing, callback),
          doAnimation = function () {
            var anim = Animation(this, jQuery.extend({}, prop), optall);
            if (empty || dataPriv.get(this, 'finish')) {
              anim.stop(true);
            }
          };
        doAnimation.finish = doAnimation;
        if (empty || false === optall.queue) {
          return this.each(doAnimation);
        } else {
          return this.queue(optall.queue, doAnimation);
        }
      },
      stop: function (type, clearQueue, gotoEnd) {
        var stopQueue = function (hooks) {
          var stop = hooks.stop;
          delete hooks.stop;
          stop(gotoEnd);
        };
        if ('string' != typeof type) {
          gotoEnd = clearQueue;
          clearQueue = type;
          type = void 0;
        }
        if (clearQueue && false !== type) {
          this.queue(type || 'fx', []);
        }
        return this.each(function () {
          var dequeue = true,
            index = null != type && type + 'queueHooks',
            timers = jQuery.timers,
            data = dataPriv.get(this);
          if (index) {
            if (data[index] && data[index].stop) {
              stopQueue(data[index]);
            }
          } else {
            for (index in data) {
              if (data[index] && data[index].stop && rrun.test(index)) {
                stopQueue(data[index]);
              }
            }
          }
          for (index = timers.length; index--; ) {
            if (!(timers[index].elem !== this || (null != type && timers[index].queue !== type))) {
              timers[index].anim.stop(gotoEnd);
              dequeue = false;
              timers.splice(index, 1);
            }
          }
          if (!(!dequeue && gotoEnd)) {
            jQuery.dequeue(this, type);
          }
        });
      },
      finish: function (type) {
        if (false !== type) {
          type = type || 'fx';
        }
        return this.each(function () {
          var index,
            data = dataPriv.get(this),
            queue = data[type + 'queue'],
            hooks = data[type + 'queueHooks'],
            timers = jQuery.timers,
            length = queue ? queue.length : 0;
          for (
            data.finish = true,
              jQuery.queue(this, type, []),
              hooks && hooks.stop && hooks.stop.call(this, true),
              index = timers.length;
            index--;
          ) {
            if (timers[index].elem === this && timers[index].queue === type) {
              timers[index].anim.stop(true);
              timers.splice(index, 1);
            }
          }
          for (index = 0; index < length; index++) {
            if (queue[index] && queue[index].finish) {
              queue[index].finish.call(this);
            }
          }
          delete data.finish;
        });
      },
    });
    jQuery.each(['toggle', 'show', 'hide'], function (effectIndex, name) {
      var cssFn = jQuery.fn[name];
      jQuery.fn[name] = function (speed, easing, callback) {
        if (null == speed || 'boolean' == typeof speed) {
          return cssFn.apply(this, arguments);
        } else {
          return this.animate(genFx(name, true), speed, easing, callback);
        }
      };
    });
    jQuery.each(
      {
        slideDown: genFx('show'),
        slideUp: genFx('hide'),
        slideToggle: genFx('toggle'),
        fadeIn: { opacity: 'show' },
        fadeOut: { opacity: 'hide' },
        fadeToggle: { opacity: 'toggle' },
      },
      function (name, props) {
        jQuery.fn[name] = function (speed, easing, callback) {
          return this.animate(props, speed, easing, callback);
        };
      },
    );
    jQuery.timers = [];
    jQuery.fx.tick = function () {
      var timer,
        timerIndex = 0,
        timers = jQuery.timers;
      for (fxNow = Date.now(); timerIndex < timers.length; timerIndex++) {
        if (!((timer = timers[timerIndex])() || timers[timerIndex] !== timer)) {
          timers.splice(timerIndex--, 1);
        }
      }
      if (!timers.length) {
        jQuery.fx.stop();
      }
      fxNow = void 0;
    };
    jQuery.fx.timer = function (timer) {
      jQuery.timers.push(timer);
      jQuery.fx.start();
    };
    jQuery.fx.interval = 13;
    jQuery.fx.start = function () {
      if (!inProgress) {
        inProgress = true;
        schedule();
      }
    };
    jQuery.fx.stop = function () {
      inProgress = null;
    };
    jQuery.fx.speeds = { slow: 600, fast: 200, _default: 400 };
    jQuery.fn.delay = function (time, type) {
      time = (jQuery.fx && jQuery.fx.speeds[time]) || time;
      type = type || 'fx';
      return this.queue(type, function (next, hooks) {
        var timeout = window.setTimeout(next, time);
        hooks.stop = function () {
          window.clearTimeout(timeout);
        };
      });
    };
    (function () {
      var input = document.createElement('input'),
        opt = document.createElement('select').appendChild(document.createElement('option'));
      input.type = 'checkbox';
      support.checkOn = '' !== input.value;
      support.optSelected = opt.selected;
      (input = document.createElement('input')).value = 't';
      input.type = 'radio';
      support.radioValue = 't' === input.value;
    })();
    var boolHook,
      attrHandle = jQuery.expr.attrHandle;
    jQuery.fn.extend({
      attr: function (name, value) {
        return access(this, jQuery.attr, name, value, arguments.length > 1);
      },
      removeAttr: function (name) {
        return this.each(function () {
          jQuery.removeAttr(this, name);
        });
      },
    });
    jQuery.extend({
      attr: function (elem, name, value) {
        var ret,
          hooks,
          nType = elem.nodeType;
        if (3 !== nType && 8 !== nType && 2 !== nType) {
          if (void 0 === elem.getAttribute) {
            return jQuery.prop(elem, name, value);
          } else {
            if (!(1 === nType && jQuery.isXMLDoc(elem))) {
              hooks =
                jQuery.attrHooks[name.toLowerCase()] ||
                (jQuery.expr.match.bool.test(name) ? boolHook : void 0);
            }
            if (void 0 !== value) {
              if (null === value) {
                return void jQuery.removeAttr(elem, name);
              } else {
                if (hooks && 'set' in hooks && void 0 !== (ret = hooks.set(elem, value, name))) {
                  return ret;
                } else {
                  elem.setAttribute(name, value + '');
                  return value;
                }
              }
            } else {
              if (hooks && 'get' in hooks && null !== (ret = hooks.get(elem, name))) {
                return ret;
              } else {
                if (null == (ret = jQuery.find.attr(elem, name))) {
                  return void 0;
                } else {
                  return ret;
                }
              }
            }
          }
        }
      },
      attrHooks: {
        type: {
          set: function (elem, value) {
            if (!support.radioValue && 'radio' === value && nodeName(elem, 'input')) {
              var val = elem.value;
              elem.setAttribute('type', value);
              if (val) {
                elem.value = val;
              }
              return value;
            }
          },
        },
      },
      removeAttr: function (elem, value) {
        var name,
          attributeIndex = 0,
          attrNames = value && value.match(rnothtmlwhite);
        if (attrNames && 1 === elem.nodeType) {
          for (; (name = attrNames[attributeIndex++]); ) {
            elem.removeAttribute(name);
          }
        }
      },
    });
    boolHook = {
      set: function (elem, value, name) {
        if (false === value) {
          jQuery.removeAttr(elem, name);
        } else {
          elem.setAttribute(name, name);
        }
        return name;
      },
    };
    jQuery.each(jQuery.expr.match.bool.source.match(/\w+/g), function (attributeIndex, name) {
      var getter = attrHandle[name] || jQuery.find.attr;
      attrHandle[name] = function (elem, name, isXML) {
        var ret,
          handle,
          lowercaseName = name.toLowerCase();
        if (!isXML) {
          handle = attrHandle[lowercaseName];
          attrHandle[lowercaseName] = ret;
          ret = null != getter(elem, name, isXML) ? lowercaseName : null;
          attrHandle[lowercaseName] = handle;
        }
        return ret;
      };
    });
    var rfocusable = /^(?:input|select|textarea|button)$/i,
      rclickable = /^(?:a|area)$/i;
    function stripAndCollapse(value) {
      return (value.match(rnothtmlwhite) || []).join(' ');
    }
    function getClass(elem) {
      return (elem.getAttribute && elem.getAttribute('class')) || '';
    }
    function classesToArray(value) {
      if (Array.isArray(value)) {
        return value;
      } else {
        return ('string' == typeof value && value.match(rnothtmlwhite)) || [];
      }
    }
    jQuery.fn.extend({
      prop: function (name, value) {
        return access(this, jQuery.prop, name, value, arguments.length > 1);
      },
      removeProp: function (name) {
        return this.each(function () {
          delete this[jQuery.propFix[name] || name];
        });
      },
    });
    jQuery.extend({
      prop: function (elem, name, value) {
        var ret,
          hooks,
          nType = elem.nodeType;
        if (3 !== nType && 8 !== nType && 2 !== nType) {
          if (!(1 === nType && jQuery.isXMLDoc(elem))) {
            name = jQuery.propFix[name] || name;
            hooks = jQuery.propHooks[name];
          }
          if (void 0 !== value) {
            if (hooks && 'set' in hooks && void 0 !== (ret = hooks.set(elem, value, name))) {
              return ret;
            } else {
              return (elem[name] = value);
            }
          } else {
            if (hooks && 'get' in hooks && null !== (ret = hooks.get(elem, name))) {
              return ret;
            } else {
              return elem[name];
            }
          }
        }
      },
      propHooks: {
        tabIndex: {
          get: function (elem) {
            var tabindex = jQuery.find.attr(elem, 'tabindex');
            if (tabindex) {
              return parseInt(tabindex, 10);
            } else {
              if (rfocusable.test(elem.nodeName) || (rclickable.test(elem.nodeName) && elem.href)) {
                return 0;
              } else {
                return -1;
              }
            }
          },
        },
      },
      propFix: { for: 'htmlFor', class: 'className' },
    });
    if (!support.optSelected) {
      jQuery.propHooks.selected = {
        get: function (elem) {
          var parent = elem.parentNode;
          if (parent && parent.parentNode) {
            parent.parentNode.selectedIndex;
          }
          return null;
        },
        set: function (elem) {
          var parent = elem.parentNode;
          if (parent) {
            parent.selectedIndex;
            if (parent.parentNode) {
              parent.parentNode.selectedIndex;
            }
          }
        },
      };
    }
    jQuery.each(
      [
        'tabIndex',
        'readOnly',
        'maxLength',
        'cellSpacing',
        'cellPadding',
        'rowSpan',
        'colSpan',
        'useMap',
        'frameBorder',
        'contentEditable',
      ],
      function () {
        jQuery.propFix[this.toLowerCase()] = this;
      },
    );
    jQuery.fn.extend({
      addClass: function (value) {
        var classes,
          elem,
          cur,
          curValue,
          clazz,
          classIndex,
          finalValue,
          elementIndex = 0;
        if (isFunction(value)) {
          return this.each(function (elementIndex) {
            jQuery(this).addClass(value.call(this, elementIndex, getClass(this)));
          });
        }
        if ((classes = classesToArray(value)).length) {
          for (; (elem = this[elementIndex++]); ) {
            curValue = getClass(elem);
            if ((cur = 1 === elem.nodeType && ' ' + stripAndCollapse(curValue) + ' ')) {
              for (classIndex = 0; (clazz = classes[classIndex++]); ) {
                if (cur.indexOf(' ' + clazz + ' ') < 0) {
                  cur += clazz + ' ';
                }
              }
              if (curValue !== (finalValue = stripAndCollapse(cur))) {
                elem.setAttribute('class', finalValue);
              }
            }
          }
        }
        return this;
      },
      removeClass: function (value) {
        var classes,
          elem,
          cur,
          curValue,
          clazz,
          classIndex,
          finalValue,
          elementIndex = 0;
        if (isFunction(value)) {
          return this.each(function (elementIndex) {
            jQuery(this).removeClass(value.call(this, elementIndex, getClass(this)));
          });
        }
        if (!arguments.length) {
          return this.attr('class', '');
        }
        if ((classes = classesToArray(value)).length) {
          for (; (elem = this[elementIndex++]); ) {
            curValue = getClass(elem);
            if ((cur = 1 === elem.nodeType && ' ' + stripAndCollapse(curValue) + ' ')) {
              for (classIndex = 0; (clazz = classes[classIndex++]); ) {
                for (; cur.indexOf(' ' + clazz + ' ') > -1; ) {
                  cur = cur.replace(' ' + clazz + ' ', ' ');
                }
              }
              if (curValue !== (finalValue = stripAndCollapse(cur))) {
                elem.setAttribute('class', finalValue);
              }
            }
          }
        }
        return this;
      },
      toggleClass: function (value, stateVal) {
        var type = typeof value,
          isValidValue = 'string' === type || Array.isArray(value);
        if ('boolean' == typeof stateVal && isValidValue) {
          if (stateVal) {
            return this.addClass(value);
          } else {
            return this.removeClass(value);
          }
        } else {
          if (isFunction(value)) {
            return this.each(function (elementIndex) {
              jQuery(this).toggleClass(
                value.call(this, elementIndex, getClass(this), stateVal),
                stateVal,
              );
            });
          } else {
            return this.each(function () {
              var className, classIndex, self, classNames;
              if (isValidValue) {
                for (
                  classIndex = 0, self = jQuery(this), classNames = classesToArray(value);
                  (className = classNames[classIndex++]);
                ) {
                  if (self.hasClass(className)) {
                    self.removeClass(className);
                  } else {
                    self.addClass(className);
                  }
                }
              } else {
                if (!(void 0 !== value && 'boolean' !== type)) {
                  if ((className = getClass(this))) {
                    dataPriv.set(this, '__className__', className);
                  }
                  if (this.setAttribute) {
                    this.setAttribute(
                      'class',
                      className || false === value ? '' : dataPriv.get(this, '__className__') || '',
                    );
                  }
                }
              }
            });
          }
        }
      },
      hasClass: function (selector) {
        var className,
          elem,
          elementIndex = 0;
        for (className = ' ' + selector + ' '; (elem = this[elementIndex++]); ) {
          if (
            1 === elem.nodeType &&
            (' ' + stripAndCollapse(getClass(elem)) + ' ').indexOf(className) > -1
          ) {
            return true;
          }
        }
        return false;
      },
    });
    var rreturn = /\r/g;
    jQuery.fn.extend({
      val: function (value) {
        var hooks,
          ret,
          valueIsFunction,
          elem = this[0];
        if (arguments.length) {
          valueIsFunction = isFunction(value);
          return this.each(function (elementIndex) {
            var val;
            if (1 === this.nodeType) {
              if (
                null ==
                (val = valueIsFunction ? value.call(this, elementIndex, jQuery(this).val()) : value)
              ) {
                val = '';
              } else {
                if ('number' == typeof val) {
                  val += '';
                } else {
                  if (Array.isArray(val)) {
                    val = jQuery.map(val, function (value) {
                      if (null == value) {
                        return '';
                      } else {
                        return value + '';
                      }
                    });
                  }
                }
              }
              if (
                !(
                  (hooks =
                    jQuery.valHooks[this.type] || jQuery.valHooks[this.nodeName.toLowerCase()]) &&
                  'set' in hooks &&
                  void 0 !== hooks.set(this, val, 'value')
                )
              ) {
                this.value = val;
              }
            }
          });
        } else {
          if (elem) {
            if (
              (hooks =
                jQuery.valHooks[elem.type] || jQuery.valHooks[elem.nodeName.toLowerCase()]) &&
              'get' in hooks &&
              void 0 !== (ret = hooks.get(elem, 'value'))
            ) {
              return ret;
            } else {
              if ('string' == typeof (ret = elem.value)) {
                return ret.replace(rreturn, '');
              } else {
                if (null == ret) {
                  return '';
                } else {
                  return ret;
                }
              }
            }
          } else {
            return void 0;
          }
        }
      },
    });
    jQuery.extend({
      valHooks: {
        option: {
          get: function (elem) {
            var val = jQuery.find.attr(elem, 'value');
            if (null != val) {
              return val;
            } else {
              return stripAndCollapse(jQuery.text(elem));
            }
          },
        },
        select: {
          get: function (elem) {
            var value,
              option,
              optionIndex,
              options = elem.options,
              index = elem.selectedIndex,
              one = 'select-one' === elem.type,
              values = one ? null : [],
              max = one ? index + 1 : options.length;
            for (
              optionIndex = index < 0 ? max : one ? index : 0;
              optionIndex < max;
              optionIndex++
            ) {
              if (
                ((option = options[optionIndex]).selected || optionIndex === index) &&
                !option.disabled &&
                (!option.parentNode.disabled || !nodeName(option.parentNode, 'optgroup'))
              ) {
                value = jQuery(option).val();
                if (one) {
                  return value;
                }
                values.push(value);
              }
            }
            return values;
          },
          set: function (elem, value) {
            for (
              var optionSet,
                option,
                options = elem.options,
                values = jQuery.makeArray(value),
                optionIndex = options.length;
              optionIndex--;
            ) {
              if (
                ((option = options[optionIndex]).selected =
                  jQuery.inArray(jQuery.valHooks.option.get(option), values) > -1)
              ) {
                optionSet = true;
              }
            }
            if (!optionSet) {
              elem.selectedIndex = -1;
            }
            return values;
          },
        },
      },
    });
    jQuery.each(['radio', 'checkbox'], function () {
      jQuery.valHooks[this] = {
        set: function (elem, value) {
          if (Array.isArray(value)) {
            return (elem.checked = jQuery.inArray(jQuery(elem).val(), value) > -1);
          }
        },
      };
      if (!support.checkOn) {
        jQuery.valHooks[this].get = function (elem) {
          if (null === elem.getAttribute('value')) {
            return 'on';
          } else {
            return elem.value;
          }
        };
      }
    });
    support.focusin = 'onfocusin' in window;
    var rfocusMorph = /^(?:focusinfocus|focusoutblur)$/,
      stopPropagationCallback = function (event) {
        event.stopPropagation();
      };
    jQuery.extend(jQuery.event, {
      trigger: function (event, data, elem, onlyHandlers) {
        var eventPathIndex,
          cur,
          tmp,
          bubbleType,
          ontype,
          handle,
          special,
          lastElement,
          eventPath = [elem || document],
          type = hasOwn.call(event, 'type') ? event.type : event,
          namespaces = hasOwn.call(event, 'namespace') ? event.namespace.split('.') : [];
        cur = lastElement = tmp = elem = elem || document;
        if (
          3 !== elem.nodeType &&
          8 !== elem.nodeType &&
          !rfocusMorph.test(type + jQuery.event.triggered) &&
          (type.indexOf('.') > -1 &&
            ((type = (namespaces = type.split('.')).shift()), namespaces.sort()),
          (ontype = type.indexOf(':') < 0 && 'on' + type),
          ((event = event[jQuery.expando]
            ? event
            : new jQuery.Event(type, 'object' == typeof event && event)).isTrigger = onlyHandlers
            ? 2
            : 3),
          (event.namespace = namespaces.join('.')),
          (event.rnamespace = event.namespace
            ? new RegExp('(^|\\.)' + namespaces.join('\\.(?:.*\\.|)') + '(\\.|$)')
            : null),
          (event.result = void 0),
          event.target || (event.target = elem),
          (data = null == data ? [event] : jQuery.makeArray(data, [event])),
          (special = jQuery.event.special[type] || {}),
          onlyHandlers || !special.trigger || false !== special.trigger.apply(elem, data))
        ) {
          if (!onlyHandlers && !special.noBubble && !isWindow(elem)) {
            for (
              bubbleType = special.delegateType || type,
                rfocusMorph.test(bubbleType + type) || (cur = cur.parentNode);
              cur;
              cur = cur.parentNode
            ) {
              eventPath.push(cur);
              tmp = cur;
            }
            if (tmp === (elem.ownerDocument || document)) {
              eventPath.push(tmp.defaultView || tmp.parentWindow || window);
            }
          }
          for (
            eventPathIndex = 0;
            (cur = eventPath[eventPathIndex++]) && !event.isPropagationStopped();
          ) {
            lastElement = cur;
            event.type = eventPathIndex > 1 ? bubbleType : special.bindType || type;
            if (
              (handle =
                (dataPriv.get(cur, 'events') || {})[event.type] && dataPriv.get(cur, 'handle'))
            ) {
              handle.apply(cur, data);
            }
            if ((handle = ontype && cur[ontype]) && handle.apply && acceptData(cur)) {
              event.result = handle.apply(cur, data);
              if (false === event.result) {
                event.preventDefault();
              }
            }
          }
          event.type = type;
          if (
            !(
              onlyHandlers ||
              event.isDefaultPrevented() ||
              (special._default && false !== special._default.apply(eventPath.pop(), data)) ||
              !acceptData(elem)
            )
          ) {
            if (ontype && isFunction(elem[type]) && !isWindow(elem)) {
              if ((tmp = elem[ontype])) {
                elem[ontype] = null;
              }
              jQuery.event.triggered = type;
              if (event.isPropagationStopped()) {
                lastElement.addEventListener(type, stopPropagationCallback);
              }
              elem[type]();
              if (event.isPropagationStopped()) {
                lastElement.removeEventListener(type, stopPropagationCallback);
              }
              jQuery.event.triggered = void 0;
              if (tmp) {
                elem[ontype] = tmp;
              }
            }
          }
          return event.result;
        }
      },
      simulate: function (type, elem, event) {
        var simulatedEvent = jQuery.extend(new jQuery.Event(), event, {
          type: type,
          isSimulated: true,
        });
        jQuery.event.trigger(simulatedEvent, null, elem);
      },
    });
    jQuery.fn.extend({
      trigger: function (type, data) {
        return this.each(function () {
          jQuery.event.trigger(type, data, this);
        });
      },
      triggerHandler: function (type, data) {
        var elem = this[0];
        if (elem) {
          return jQuery.event.trigger(type, data, elem, true);
        }
      },
    });
    if (!support.focusin) {
      jQuery.each({ focus: 'focusin', blur: 'focusout' }, function (orig, fix) {
        var handler = function (event) {
          jQuery.event.simulate(fix, event.target, jQuery.event.fix(event));
        };
        jQuery.event.special[fix] = {
          setup: function () {
            var documentModel = this.ownerDocument || this,
              attaches = dataPriv.access(documentModel, fix);
            if (!attaches) {
              documentModel.addEventListener(orig, handler, true);
            }
            dataPriv.access(documentModel, fix, (attaches || 0) + 1);
          },
          teardown: function () {
            var documentModel = this.ownerDocument || this,
              attaches = dataPriv.access(documentModel, fix) - 1;
            if (attaches) {
              dataPriv.access(documentModel, fix, attaches);
            } else {
              documentModel.removeEventListener(orig, handler, true);
              dataPriv.remove(documentModel, fix);
            }
          },
        };
      });
    }
    var location = window.location,
      nonce = Date.now(),
      rquery = /\?/;
    jQuery.parseXML = function (data) {
      var xml;
      if (!data || 'string' != typeof data) {
        return null;
      }
      try {
        xml = new window.DOMParser().parseFromString(data, 'text/xml');
      } catch (error) {
        xml = void 0;
      }
      if (!(xml && !xml.getElementsByTagName('parsererror').length)) {
        jQuery.error('Invalid XML: ' + data);
      }
      return xml;
    };
    var rbracket = /\[\]$/,
      rCRLF = /\r?\n/g,
      rsubmitterTypes = /^(?:submit|button|image|reset|file)$/i,
      rsubmittable = /^(?:input|select|textarea|keygen)/i;
    function buildParams(prefix, object, traditional, add) {
      var name;
      if (Array.isArray(object)) {
        jQuery.each(object, function (itemIndex, item) {
          if (traditional || rbracket.test(prefix)) {
            add(prefix, item);
          } else {
            buildParams(
              prefix + '[' + ('object' == typeof item && null != item ? itemIndex : '') + ']',
              item,
              traditional,
              add,
            );
          }
        });
      } else {
        if (traditional || 'object' !== toType(object)) {
          add(prefix, object);
        } else {
          for (name in object) {
            buildParams(prefix + '[' + name + ']', object[name], traditional, add);
          }
        }
      }
    }
    jQuery.param = function (input, traditional) {
      var prefix,
        parameters = [],
        add = function (key, valueOrFunction) {
          var value = isFunction(valueOrFunction) ? valueOrFunction() : valueOrFunction;
          parameters[parameters.length] =
            encodeURIComponent(key) + '=' + encodeURIComponent(null == value ? '' : value);
        };
      if (Array.isArray(input) || (input.jquery && !jQuery.isPlainObject(input))) {
        jQuery.each(input, function () {
          add(this.name, this.value);
        });
      } else {
        for (prefix in input) {
          buildParams(prefix, input[prefix], traditional, add);
        }
      }
      return parameters.join('&');
    };
    jQuery.fn.extend({
      serialize: function () {
        return jQuery.param(this.serializeArray());
      },
      serializeArray: function () {
        return this.map(function () {
          var elements = jQuery.prop(this, 'elements');
          if (elements) {
            return jQuery.makeArray(elements);
          } else {
            return this;
          }
        })
          .filter(function () {
            var type = this.type;
            return (
              this.name &&
              !jQuery(this).is(':disabled') &&
              rsubmittable.test(this.nodeName) &&
              !rsubmitterTypes.test(type) &&
              (this.checked || !rcheckableType.test(type))
            );
          })
          .map(function (elementIndex, elem) {
            var val = jQuery(this).val();
            if (null == val) {
              return null;
            } else {
              if (Array.isArray(val)) {
                return jQuery.map(val, function (val) {
                  return { name: elem.name, value: val.replace(rCRLF, '\r\n') };
                });
              } else {
                return { name: elem.name, value: val.replace(rCRLF, '\r\n') };
              }
            }
          })
          .get();
      },
    });
    var r20 = /%20/g,
      rhash = /#.*$/,
      rantiCache = /([?&])_=[^&]*/,
      rheaders = /^(.*?):[ \t]*([^\r\n]*)$/gm,
      rlocalProtocol = /^(?:GET|HEAD)$/,
      protocolRelativePattern = /^\/\//,
      prefilters = {},
      transports = {},
      allMimeTypes = '*/'.concat('*'),
      originAnchor = document.createElement('a');
    function addToPrefiltersOrTransports(structure) {
      return function (dataTypeExpression, handler) {
        if ('string' != typeof dataTypeExpression) {
          handler = dataTypeExpression;
          dataTypeExpression = '*';
        }
        var dataType,
          dataTypeIndex = 0,
          dataTypes = dataTypeExpression.toLowerCase().match(rnothtmlwhite) || [];
        if (isFunction(handler)) {
          for (; (dataType = dataTypes[dataTypeIndex++]); ) {
            if ('+' === dataType[0]) {
              dataType = dataType.slice(1) || '*';
              (structure[dataType] = structure[dataType] || []).unshift(handler);
            } else {
              (structure[dataType] = structure[dataType] || []).push(handler);
            }
          }
        }
      };
    }
    function inspectPrefiltersOrTransports(structure, options, originalOptions, jqXHR) {
      var inspected = {},
        seekingTransport = structure === transports;
      function inspectDataType(dataType) {
        var selectedTransport;
        inspected[dataType] = true;
        jQuery.each(structure[dataType] || [], function (handlerIndex, prefilterOrFactory) {
          var dataTypeOrTransport = prefilterOrFactory(options, originalOptions, jqXHR);
          if (
            'string' != typeof dataTypeOrTransport ||
            seekingTransport ||
            inspected[dataTypeOrTransport]
          ) {
            if (seekingTransport) {
              return !(selectedTransport = dataTypeOrTransport);
            } else {
              return void 0;
            }
          } else {
            options.dataTypes.unshift(dataTypeOrTransport);
            inspectDataType(dataTypeOrTransport);
            return false;
          }
        });
        return selectedTransport;
      }
      return inspectDataType(options.dataTypes[0]) || (!inspected['*'] && inspectDataType('*'));
    }
    function extendAjaxOptions(target, source) {
      var key,
        deepOptions,
        flatOptions = jQuery.ajaxSettings.flatOptions || {};
      for (key in source) {
        if (void 0 !== source[key]) {
          (flatOptions[key] ? target : deepOptions || (deepOptions = {}))[key] = source[key];
        }
      }
      if (deepOptions) {
        jQuery.extend(true, target, deepOptions);
      }
      return target;
    }
    originAnchor.href = location.href;
    jQuery.extend({
      active: 0,
      lastModified: {},
      etag: {},
      ajaxSettings: {
        url: location.href,
        type: 'GET',
        isLocal: /^(?:about|app|app-storage|.+-extension|file|res|widget):$/.test(
          location.protocol,
        ),
        global: true,
        processData: true,
        async: true,
        contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
        accepts: {
          '*': allMimeTypes,
          text: 'text/plain',
          html: 'text/html',
          xml: 'application/xml, text/xml',
          json: 'application/json, text/javascript',
        },
        contents: { xml: /\bxml\b/, html: /\bhtml/, json: /\bjson\b/ },
        responseFields: { xml: 'responseXML', text: 'responseText', json: 'responseJSON' },
        converters: {
          '* text': String,
          'text html': true,
          'text json': JSON.parse,
          'text xml': jQuery.parseXML,
        },
        flatOptions: { url: true, context: true },
      },
      ajaxSetup: function (target, settings) {
        if (settings) {
          return extendAjaxOptions(extendAjaxOptions(target, jQuery.ajaxSettings), settings);
        } else {
          return extendAjaxOptions(jQuery.ajaxSettings, target);
        }
      },
      ajaxPrefilter: addToPrefiltersOrTransports(prefilters),
      ajaxTransport: addToPrefiltersOrTransports(transports),
      ajax: function (url, options) {
        if ('object' == typeof url) {
          options = url;
          url = void 0;
        }
        options = options || {};
        var transport,
          cacheUrl,
          rawResponseHeaders,
          responseHeaders,
          timeoutTimer,
          urlAnchor,
          completed,
          fireGlobalEvents,
          headerName,
          uncachedSuffix,
          settings = jQuery.ajaxSetup({}, options),
          callbackContext = settings.context || settings,
          globalEventContext =
            settings.context && (callbackContext.nodeType || callbackContext.jquery)
              ? jQuery(callbackContext)
              : jQuery.event,
          deferred = jQuery.Deferred(),
          completeDeferred = jQuery.Callbacks('once memory'),
          statusCodeCallbacks = settings.statusCode || {},
          requestHeaders = {},
          requestHeaderNames = {},
          abortStatus = 'canceled',
          jqXHR = {
            readyState: 0,
            getResponseHeader: function (headerName) {
              var headerMatch;
              if (completed) {
                if (!responseHeaders) {
                  for (responseHeaders = {}; (headerMatch = rheaders.exec(rawResponseHeaders)); ) {
                    responseHeaders[headerMatch[1].toLowerCase()] = headerMatch[2];
                  }
                }
                headerMatch = responseHeaders[headerName.toLowerCase()];
              }
              if (null == headerMatch) {
                return null;
              } else {
                return headerMatch;
              }
            },
            getAllResponseHeaders: function () {
              if (completed) {
                return rawResponseHeaders;
              } else {
                return null;
              }
            },
            setRequestHeader: function (headerName, value) {
              if (null == completed) {
                headerName = requestHeaderNames[headerName.toLowerCase()] =
                  requestHeaderNames[headerName.toLowerCase()] || headerName;
                requestHeaders[headerName] = value;
              }
              return this;
            },
            overrideMimeType: function (mimeType) {
              if (null == completed) {
                settings.mimeType = mimeType;
              }
              return this;
            },
            statusCode: function (callbacks) {
              var statusCode;
              if (callbacks) {
                if (completed) {
                  jqXHR.always(callbacks[jqXHR.status]);
                } else {
                  for (statusCode in callbacks) {
                    statusCodeCallbacks[statusCode] = [
                      statusCodeCallbacks[statusCode],
                      callbacks[statusCode],
                    ];
                  }
                }
              }
              return this;
            },
            abort: function (statusText) {
              var finalStatusText = statusText || abortStatus;
              if (transport) {
                transport.abort(finalStatusText);
              }
              completeRequest(0, finalStatusText);
              return this;
            },
          };
        deferred.promise(jqXHR);
        settings.url = ((url || settings.url || location.href) + '').replace(
          protocolRelativePattern,
          location.protocol + '//',
        );
        settings.type = options.method || options.type || settings.method || settings.type;
        settings.dataTypes = (settings.dataType || '*').toLowerCase().match(rnothtmlwhite) || [''];
        if (null == settings.crossDomain) {
          urlAnchor = document.createElement('a');
          try {
            urlAnchor.href = settings.url;
            urlAnchor.href = urlAnchor.href;
            settings.crossDomain =
              originAnchor.protocol + '//' + originAnchor.host !=
              urlAnchor.protocol + '//' + urlAnchor.host;
          } catch (error) {
            settings.crossDomain = true;
          }
        }
        if (settings.data && settings.processData && 'string' != typeof settings.data) {
          settings.data = jQuery.param(settings.data, settings.traditional);
        }
        inspectPrefiltersOrTransports(prefilters, settings, options, jqXHR);
        if (completed) {
          return jqXHR;
        }
        for (headerName in ((fireGlobalEvents = jQuery.event && settings.global) &&
          0 == jQuery.active++ &&
          jQuery.event.trigger('ajaxStart'),
        (settings.type = settings.type.toUpperCase()),
        (settings.hasContent = !rlocalProtocol.test(settings.type)),
        (cacheUrl = settings.url.replace(rhash, '')),
        settings.hasContent
          ? settings.data &&
            settings.processData &&
            0 === (settings.contentType || '').indexOf('application/x-www-form-urlencoded') &&
            (settings.data = settings.data.replace(r20, '+'))
          : ((uncachedSuffix = settings.url.slice(cacheUrl.length)),
            settings.data &&
              (settings.processData || 'string' == typeof settings.data) &&
              ((cacheUrl += (rquery.test(cacheUrl) ? '&' : '?') + settings.data),
              delete settings.data),
            false === settings.cache &&
              ((cacheUrl = cacheUrl.replace(rantiCache, '$1')),
              (uncachedSuffix =
                (rquery.test(cacheUrl) ? '&' : '?') + '_=' + nonce++ + uncachedSuffix)),
            (settings.url = cacheUrl + uncachedSuffix)),
        settings.ifModified &&
          (jQuery.lastModified[cacheUrl] &&
            jqXHR.setRequestHeader('If-Modified-Since', jQuery.lastModified[cacheUrl]),
          jQuery.etag[cacheUrl] && jqXHR.setRequestHeader('If-None-Match', jQuery.etag[cacheUrl])),
        ((settings.data && settings.hasContent && false !== settings.contentType) ||
          options.contentType) &&
          jqXHR.setRequestHeader('Content-Type', settings.contentType),
        jqXHR.setRequestHeader(
          'Accept',
          settings.dataTypes[0] && settings.accepts[settings.dataTypes[0]]
            ? settings.accepts[settings.dataTypes[0]] +
                ('*' !== settings.dataTypes[0] ? ', ' + allMimeTypes + '; q=0.01' : '')
            : settings.accepts['*'],
        ),
        settings.headers)) {
          jqXHR.setRequestHeader(headerName, settings.headers[headerName]);
        }
        if (
          settings.beforeSend &&
          (false === settings.beforeSend.call(callbackContext, jqXHR, settings) || completed)
        ) {
          return jqXHR.abort();
        }
        abortStatus = 'abort';
        completeDeferred.add(settings.complete);
        jqXHR.done(settings.success);
        jqXHR.fail(settings.error);
        if ((transport = inspectPrefiltersOrTransports(transports, settings, options, jqXHR))) {
          jqXHR.readyState = 1;
          if (fireGlobalEvents) {
            globalEventContext.trigger('ajaxSend', [jqXHR, settings]);
          }
          if (completed) {
            return jqXHR;
          }
          if (settings.async && settings.timeout > 0) {
            timeoutTimer = window.setTimeout(function () {
              jqXHR.abort('timeout');
            }, settings.timeout);
          }
          try {
            completed = false;
            transport.send(requestHeaders, completeRequest);
          } catch (error) {
            if (completed) {
              throw error;
            }
            completeRequest(-1, error);
          }
        } else {
          completeRequest(-1, 'No Transport');
        }
        function completeRequest(status, nativeStatusText, responses, headers) {
          var isSuccess,
            success,
            error,
            response,
            modifiedHeader,
            statusText = nativeStatusText;
          if (!completed) {
            completed = true;
            if (timeoutTimer) {
              window.clearTimeout(timeoutTimer);
            }
            transport = void 0;
            rawResponseHeaders = headers || '';
            jqXHR.readyState = status > 0 ? 4 : 0;
            isSuccess = (status >= 200 && status < 300) || 304 === status;
            if (responses) {
              response = (function (settings, jqXHR, responses) {
                for (
                  var contentType,
                    dataType,
                    finalDataType,
                    firstDataType,
                    contents = settings.contents,
                    dataTypes = settings.dataTypes;
                  '*' === dataTypes[0];
                ) {
                  dataTypes.shift();
                  if (void 0 === contentType) {
                    contentType = settings.mimeType || jqXHR.getResponseHeader('Content-Type');
                  }
                }
                if (contentType) {
                  for (dataType in contents) {
                    if (contents[dataType] && contents[dataType].test(contentType)) {
                      dataTypes.unshift(dataType);
                      break;
                    }
                  }
                }
                if (dataTypes[0] in responses) {
                  finalDataType = dataTypes[0];
                } else {
                  for (dataType in responses) {
                    if (!dataTypes[0] || settings.converters[dataType + ' ' + dataTypes[0]]) {
                      finalDataType = dataType;
                      break;
                    }
                    if (!firstDataType) {
                      firstDataType = dataType;
                    }
                  }
                  finalDataType = finalDataType || firstDataType;
                }
                if (finalDataType) {
                  if (finalDataType !== dataTypes[0]) {
                    dataTypes.unshift(finalDataType);
                  }
                  return responses[finalDataType];
                }
              })(settings, jqXHR, responses);
            }
            response = (function (settings, response, jqXHR, isSuccess) {
              var converterKey,
                currentType,
                converter,
                converterTypes,
                previousType,
                converters = {},
                dataTypes = settings.dataTypes.slice();
              if (dataTypes[1]) {
                for (converter in settings.converters) {
                  converters[converter.toLowerCase()] = settings.converters[converter];
                }
              }
              for (currentType = dataTypes.shift(); currentType; ) {
                if (settings.responseFields[currentType]) {
                  jqXHR[settings.responseFields[currentType]] = response;
                }
                if (!previousType && isSuccess && settings.dataFilter) {
                  response = settings.dataFilter(response, settings.dataType);
                }
                previousType = currentType;
                if ((currentType = dataTypes.shift())) {
                  if ('*' === currentType) {
                    currentType = previousType;
                  } else {
                    if ('*' !== previousType && previousType !== currentType) {
                      if (
                        !(converter =
                          converters[previousType + ' ' + currentType] ||
                          converters['* ' + currentType])
                      ) {
                        for (converterKey in converters) {
                          if (
                            (converterTypes = converterKey.split(' '))[1] === currentType &&
                            (converter =
                              converters[previousType + ' ' + converterTypes[0]] ||
                              converters['* ' + converterTypes[0]])
                          ) {
                            if (true === converter) {
                              converter = converters[converterKey];
                            } else {
                              if (true !== converters[converterKey]) {
                                currentType = converterTypes[0];
                                dataTypes.unshift(converterTypes[1]);
                              }
                            }
                            break;
                          }
                        }
                      }
                      if (true !== converter) {
                        if (converter && settings.throws) {
                          response = converter(response);
                        } else {
                          try {
                            response = converter(response);
                          } catch (error) {
                            return {
                              state: 'parsererror',
                              error: converter
                                ? error
                                : 'No conversion from ' + previousType + ' to ' + currentType,
                            };
                          }
                        }
                      }
                    }
                  }
                }
              }
              return { state: 'success', data: response };
            })(settings, response, jqXHR, isSuccess);
            if (isSuccess) {
              if (settings.ifModified) {
                if ((modifiedHeader = jqXHR.getResponseHeader('Last-Modified'))) {
                  jQuery.lastModified[cacheUrl] = modifiedHeader;
                }
                if ((modifiedHeader = jqXHR.getResponseHeader('etag'))) {
                  jQuery.etag[cacheUrl] = modifiedHeader;
                }
              }
              if (204 === status || 'HEAD' === settings.type) {
                statusText = 'nocontent';
              } else {
                if (304 === status) {
                  statusText = 'notmodified';
                } else {
                  statusText = response.state;
                  success = response.data;
                  isSuccess = !(error = response.error);
                }
              }
            } else {
              error = statusText;
              if (!(!status && statusText)) {
                statusText = 'error';
                if (status < 0) {
                  status = 0;
                }
              }
            }
            jqXHR.status = status;
            jqXHR.statusText = (nativeStatusText || statusText) + '';
            if (isSuccess) {
              deferred.resolveWith(callbackContext, [success, statusText, jqXHR]);
            } else {
              deferred.rejectWith(callbackContext, [jqXHR, statusText, error]);
            }
            jqXHR.statusCode(statusCodeCallbacks);
            statusCodeCallbacks = void 0;
            if (fireGlobalEvents) {
              globalEventContext.trigger(isSuccess ? 'ajaxSuccess' : 'ajaxError', [
                jqXHR,
                settings,
                isSuccess ? success : error,
              ]);
            }
            completeDeferred.fireWith(callbackContext, [jqXHR, statusText]);
            if (fireGlobalEvents) {
              globalEventContext.trigger('ajaxComplete', [jqXHR, settings]);
              if (!--jQuery.active) {
                jQuery.event.trigger('ajaxStop');
              }
            }
          }
        }
        return jqXHR;
      },
      getJSON: function (url, data, callback) {
        return jQuery.get(url, data, callback, 'json');
      },
      getScript: function (url, callback) {
        return jQuery.get(url, void 0, callback, 'script');
      },
    });
    jQuery.each(['get', 'post'], function (methodIndex, method) {
      jQuery[method] = function (url, data, callback, dataType) {
        if (isFunction(data)) {
          dataType = dataType || callback;
          callback = data;
          data = void 0;
        }
        return jQuery.ajax(
          jQuery.extend(
            { url: url, type: method, dataType: dataType, data: data, success: callback },
            jQuery.isPlainObject(url) && url,
          ),
        );
      };
    });
    jQuery._evalUrl = function (url) {
      return jQuery.ajax({
        url: url,
        type: 'GET',
        dataType: 'script',
        cache: true,
        async: false,
        global: false,
        throws: true,
      });
    };
    jQuery.fn.extend({
      wrapAll: function (html) {
        var wrapper;
        if (this[0]) {
          if (isFunction(html)) {
            html = html.call(this[0]);
          }
          wrapper = jQuery(html, this[0].ownerDocument).eq(0).clone(true);
          if (this[0].parentNode) {
            wrapper.insertBefore(this[0]);
          }
          wrapper
            .map(function () {
              for (var deepestChild = this; deepestChild.firstElementChild; ) {
                deepestChild = deepestChild.firstElementChild;
              }
              return deepestChild;
            })
            .append(this);
        }
        return this;
      },
      wrapInner: function (html) {
        if (isFunction(html)) {
          return this.each(function (elementIndex) {
            jQuery(this).wrapInner(html.call(this, elementIndex));
          });
        } else {
          return this.each(function () {
            var element = jQuery(this),
              contents = element.contents();
            if (contents.length) {
              contents.wrapAll(html);
            } else {
              element.append(html);
            }
          });
        }
      },
      wrap: function (html) {
        var isHtmlFunction = isFunction(html);
        return this.each(function (elementIndex) {
          jQuery(this).wrapAll(isHtmlFunction ? html.call(this, elementIndex) : html);
        });
      },
      unwrap: function (selector) {
        this.parent(selector)
          .not('body')
          .each(function () {
            jQuery(this).replaceWith(this.childNodes);
          });
        return this;
      },
    });
    jQuery.expr.pseudos.hidden = function (element) {
      return !jQuery.expr.pseudos.visible(element);
    };
    jQuery.expr.pseudos.visible = function (element) {
      return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
    };
    jQuery.ajaxSettings.xhr = function () {
      try {
        return new window.XMLHttpRequest();
      } catch (error) {}
    };
    var xhrSuccessStatus = { 0: 200, 1223: 204 },
      xhrSupported = jQuery.ajaxSettings.xhr();
    support.cors = !!xhrSupported && 'withCredentials' in xhrSupported;
    support.ajax = xhrSupported = !!xhrSupported;
    jQuery.ajaxTransport(function (options) {
      var callback, errorCallback;
      if (support.cors || (xhrSupported && !options.crossDomain)) {
        return {
          send: function (headers, complete) {
            var headerName,
              xhr = options.xhr();
            xhr.open(options.type, options.url, options.async, options.username, options.password);
            if (options.xhrFields) {
              for (headerName in options.xhrFields) {
                xhr[headerName] = options.xhrFields[headerName];
              }
            }
            for (headerName in (options.mimeType &&
              xhr.overrideMimeType &&
              xhr.overrideMimeType(options.mimeType),
            options.crossDomain ||
              headers['X-Requested-With'] ||
              (headers['X-Requested-With'] = 'XMLHttpRequest'),
            headers)) {
              xhr.setRequestHeader(headerName, headers[headerName]);
            }
            callback = function (eventType) {
              return function () {
                if (callback) {
                  callback =
                    errorCallback =
                    xhr.onload =
                    xhr.onerror =
                    xhr.onabort =
                    xhr.ontimeout =
                    xhr.onreadystatechange =
                      null;
                  if ('abort' === eventType) {
                    xhr.abort();
                  } else {
                    if ('error' === eventType) {
                      if ('number' != typeof xhr.status) {
                        complete(0, 'error');
                      } else {
                        complete(xhr.status, xhr.statusText);
                      }
                    } else {
                      complete(
                        xhrSuccessStatus[xhr.status] || xhr.status,
                        xhr.statusText,
                        'text' !== (xhr.responseType || 'text') ||
                          'string' != typeof xhr.responseText
                          ? { binary: xhr.response }
                          : { text: xhr.responseText },
                        xhr.getAllResponseHeaders(),
                      );
                    }
                  }
                }
              };
            };
            xhr.onload = callback();
            errorCallback = xhr.onerror = xhr.ontimeout = callback('error');
            if (void 0 !== xhr.onabort) {
              xhr.onabort = errorCallback;
            } else {
              xhr.onreadystatechange = function () {
                if (4 === xhr.readyState) {
                  window.setTimeout(function () {
                    if (callback) {
                      errorCallback();
                    }
                  });
                }
              };
            }
            callback = callback('abort');
            try {
              xhr.send((options.hasContent && options.data) || null);
            } catch (error) {
              if (callback) {
                throw error;
              }
            }
          },
          abort: function () {
            if (callback) {
              callback();
            }
          },
        };
      }
    });
    jQuery.ajaxPrefilter(function (options) {
      if (options.crossDomain) {
        options.contents.script = false;
      }
    });
    jQuery.ajaxSetup({
      accepts: {
        script:
          'text/javascript, application/javascript, application/ecmascript, application/x-ecmascript',
      },
      contents: { script: /\b(?:java|ecma)script\b/ },
      converters: {
        'text script': function (text) {
          jQuery.globalEval(text);
          return text;
        },
      },
    });
    jQuery.ajaxPrefilter('script', function (options) {
      if (void 0 === options.cache) {
        options.cache = false;
      }
      if (options.crossDomain) {
        options.type = 'GET';
      }
    });
    jQuery.ajaxTransport('script', function (options) {
      var script, callback;
      if (options.crossDomain) {
        return {
          send: function (headers, complete) {
            script = jQuery('<script>')
              .prop({ charset: options.scriptCharset, src: options.url })
              .on(
                'load error',
                (callback = function (event) {
                  script.remove();
                  callback = null;
                  if (event) {
                    complete('error' === event.type ? 404 : 200, event.type);
                  }
                }),
              );
            document.head.appendChild(script[0]);
          },
          abort: function () {
            if (callback) {
              callback();
            }
          },
        };
      }
    });
    var recycledCallbacks = [],
      rnoContent = /(=)\?(?=&|$)|\?\?/;
    jQuery.ajaxSetup({
      jsonp: 'callback',
      jsonpCallback: function () {
        var callbackName = recycledCallbacks.pop() || jQuery.expando + '_' + nonce++;
        this[callbackName] = true;
        return callbackName;
      },
    });
    jQuery.ajaxPrefilter('json jsonp', function (settings, originalSettings, jqXHR) {
      var callbackName,
        overwritten,
        responseContainer,
        jsonProperty =
          false !== settings.jsonp &&
          (rnoContent.test(settings.url)
            ? 'url'
            : 'string' == typeof settings.data &&
              0 === (settings.contentType || '').indexOf('application/x-www-form-urlencoded') &&
              rnoContent.test(settings.data) &&
              'data');
      if (jsonProperty || 'jsonp' === settings.dataTypes[0]) {
        callbackName = settings.jsonpCallback = isFunction(settings.jsonpCallback)
          ? settings.jsonpCallback()
          : settings.jsonpCallback;
        if (jsonProperty) {
          settings[jsonProperty] = settings[jsonProperty].replace(rnoContent, '$1' + callbackName);
        } else {
          if (false !== settings.jsonp) {
            settings.url +=
              (rquery.test(settings.url) ? '&' : '?') + settings.jsonp + '=' + callbackName;
          }
        }
        settings.converters['script json'] = function () {
          if (!responseContainer) {
            jQuery.error(callbackName + ' was not called');
          }
          return responseContainer[0];
        };
        settings.dataTypes[0] = 'json';
        overwritten = window[callbackName];
        window[callbackName] = function () {
          responseContainer = arguments;
        };
        jqXHR.always(function () {
          if (void 0 === overwritten) {
            jQuery(window).removeProp(callbackName);
          } else {
            window[callbackName] = overwritten;
          }
          if (settings[callbackName]) {
            settings.jsonpCallback = originalSettings.jsonpCallback;
            recycledCallbacks.push(callbackName);
          }
          if (responseContainer && isFunction(overwritten)) {
            overwritten(responseContainer[0]);
          }
          responseContainer = overwritten = void 0;
        });
        return 'script';
      }
    });
    support.createHTMLDocument = (function () {
      var body = document.implementation.createHTMLDocument('').body;
      body.innerHTML = '<form></form><form></form>';
      return 2 === body.childNodes.length;
    })();
    jQuery.parseHTML = function (data, context, keepScripts) {
      if ('string' != typeof data) {
        return [];
      } else {
        if ('boolean' == typeof context) {
          keepScripts = context;
          context = false;
        }
        if (!context) {
          if (support.createHTMLDocument) {
            (singleTag = (context = document.implementation.createHTMLDocument('')).createElement(
              'base',
            )).href = document.location.href;
            context.head.appendChild(singleTag);
          } else {
            context = document;
          }
        }
        scripts = rsingleTag.exec(data);
        parsedNodes = !keepScripts && [];
        if (scripts) {
          return [context.createElement(scripts[1])];
        } else {
          scripts = buildFragment([data], context, parsedNodes);
          if (parsedNodes && parsedNodes.length) {
            jQuery(parsedNodes).remove();
          }
          return jQuery.merge([], scripts.childNodes);
        }
      }
      var singleTag, scripts, parsedNodes;
    };
    jQuery.fn.load = function (url, params, callback) {
      var selector,
        method,
        response,
        elements = this,
        separatorIndex = url.indexOf(' ');
      if (separatorIndex > -1) {
        selector = stripAndCollapse(url.slice(separatorIndex));
        url = url.slice(0, separatorIndex);
      }
      if (isFunction(params)) {
        callback = params;
        params = void 0;
      } else {
        if (params && 'object' == typeof params) {
          method = 'POST';
        }
      }
      if (elements.length > 0) {
        jQuery
          .ajax({ url: url, type: method || 'GET', dataType: 'html', data: params })
          .done(function (responseText) {
            response = arguments;
            elements.html(
              selector
                ? jQuery('<div>').append(jQuery.parseHTML(responseText)).find(selector)
                : responseText,
            );
          })
          .always(
            callback &&
              function (jqXHR, status) {
                elements.each(function () {
                  callback.apply(this, response || [jqXHR.responseText, status, jqXHR]);
                });
              },
          );
      }
      return this;
    };
    jQuery.each(
      ['ajaxStart', 'ajaxStop', 'ajaxComplete', 'ajaxError', 'ajaxSuccess', 'ajaxSend'],
      function (eventIndex, eventType) {
        jQuery.fn[eventType] = function (handler) {
          return this.on(eventType, handler);
        };
      },
    );
    jQuery.expr.pseudos.animated = function (element) {
      return jQuery.grep(jQuery.timers, function (timer) {
        return element === timer.elem;
      }).length;
    };
    jQuery.offset = {
      setOffset: function (element, options, elementIndex) {
        var currentPosition,
          currentLeft,
          currentCssTop,
          currentTop,
          currentOffset,
          currentCssLeft,
          position = jQuery.css(element, 'position'),
          elementCollection = jQuery(element),
          properties = {};
        if ('static' === position) {
          element.style.position = 'relative';
        }
        currentOffset = elementCollection.offset();
        currentCssTop = jQuery.css(element, 'top');
        currentCssLeft = jQuery.css(element, 'left');
        if (
          ('absolute' === position || 'fixed' === position) &&
          (currentCssTop + currentCssLeft).indexOf('auto') > -1
        ) {
          currentTop = (currentPosition = elementCollection.position()).top;
          currentLeft = currentPosition.left;
        } else {
          currentTop = parseFloat(currentCssTop) || 0;
          currentLeft = parseFloat(currentCssLeft) || 0;
        }
        if (isFunction(options)) {
          options = options.call(element, elementIndex, jQuery.extend({}, currentOffset));
        }
        if (null != options.top) {
          properties.top = options.top - currentOffset.top + currentTop;
        }
        if (null != options.left) {
          properties.left = options.left - currentOffset.left + currentLeft;
        }
        if ('using' in options) {
          options.using.call(element, properties);
        } else {
          elementCollection.css(properties);
        }
      },
    };
    jQuery.fn.extend({
      offset: function (options) {
        if (arguments.length) {
          if (void 0 === options) {
            return this;
          } else {
            return this.each(function (elementIndex) {
              jQuery.offset.setOffset(this, options, elementIndex);
            });
          }
        }
        var rect,
          view,
          element = this[0];
        if (element) {
          if (element.getClientRects().length) {
            rect = element.getBoundingClientRect();
            view = element.ownerDocument.defaultView;
            return { top: rect.top + view.pageYOffset, left: rect.left + view.pageXOffset };
          } else {
            return { top: 0, left: 0 };
          }
        } else {
          return void 0;
        }
      },
      position: function () {
        if (this[0]) {
          var offsetParent,
            offset,
            ownerDocument,
            element = this[0],
            parentOffset = { top: 0, left: 0 };
          if ('fixed' === jQuery.css(element, 'position')) {
            offset = element.getBoundingClientRect();
          } else {
            for (
              offset = this.offset(),
                ownerDocument = element.ownerDocument,
                offsetParent = element.offsetParent || ownerDocument.documentElement;
              offsetParent &&
              (offsetParent === ownerDocument.body ||
                offsetParent === ownerDocument.documentElement) &&
              'static' === jQuery.css(offsetParent, 'position');
            ) {
              offsetParent = offsetParent.parentNode;
            }
            if (offsetParent && offsetParent !== element && 1 === offsetParent.nodeType) {
              (parentOffset = jQuery(offsetParent).offset()).top += jQuery.css(
                offsetParent,
                'borderTopWidth',
                true,
              );
              parentOffset.left += jQuery.css(offsetParent, 'borderLeftWidth', true);
            }
          }
          return {
            top: offset.top - parentOffset.top - jQuery.css(element, 'marginTop', true),
            left: offset.left - parentOffset.left - jQuery.css(element, 'marginLeft', true),
          };
        }
      },
      offsetParent: function () {
        return this.map(function () {
          for (
            var offsetParent = this.offsetParent;
            offsetParent && 'static' === jQuery.css(offsetParent, 'position');
          ) {
            offsetParent = offsetParent.offsetParent;
          }
          return offsetParent || documentElement;
        });
      },
    });
    jQuery.each(
      { scrollLeft: 'pageXOffset', scrollTop: 'pageYOffset' },
      function (method, property) {
        var isTop = 'pageYOffset' === property;
        jQuery.fn[method] = function (value) {
          return access(
            this,
            function (element, method, value) {
              var view;
              if (isWindow(element)) {
                view = element;
              } else {
                if (9 === element.nodeType) {
                  view = element.defaultView;
                }
              }
              if (void 0 === value) {
                if (view) {
                  return view[property];
                } else {
                  return element[method];
                }
              }
              if (view) {
                view.scrollTo(isTop ? view.pageXOffset : value, isTop ? value : view.pageYOffset);
              } else {
                element[method] = value;
              }
            },
            method,
            value,
            arguments.length,
          );
        };
      },
    );
    jQuery.each(['top', 'left'], function (propertyIndex, property) {
      jQuery.cssHooks[property] = addGetHookIf(support.pixelPosition, function (element, computed) {
        if (computed) {
          computed = curCSS(element, property);
          if (rnumnonpx.test(computed)) {
            return jQuery(element).position()[property] + 'px';
          } else {
            return computed;
          }
        }
      });
    });
    jQuery.each({ Height: 'height', Width: 'width' }, function (dimensionName, dimension) {
      jQuery.each(
        { padding: 'inner' + dimensionName, content: dimension, '': 'outer' + dimensionName },
        function (defaultExtra, method) {
          jQuery.fn[method] = function (margin, value) {
            var chainable = arguments.length && (defaultExtra || 'boolean' != typeof margin),
              extra = defaultExtra || (true === margin || true === value ? 'margin' : 'border');
            return access(
              this,
              function (element, dimension, value) {
                var documentElement;
                if (isWindow(element)) {
                  if (0 === method.indexOf('outer')) {
                    return element['inner' + dimensionName];
                  } else {
                    return element.document.documentElement['client' + dimensionName];
                  }
                } else {
                  if (9 === element.nodeType) {
                    documentElement = element.documentElement;
                    return Math.max(
                      element.body['scroll' + dimensionName],
                      documentElement['scroll' + dimensionName],
                      element.body['offset' + dimensionName],
                      documentElement['offset' + dimensionName],
                      documentElement['client' + dimensionName],
                    );
                  } else {
                    if (void 0 === value) {
                      return jQuery.css(element, dimension, extra);
                    } else {
                      return jQuery.style(element, dimension, value, extra);
                    }
                  }
                }
              },
              dimension,
              chainable ? margin : void 0,
              chainable,
            );
          };
        },
      );
    });
    jQuery.each(
      'blur focus focusin focusout resize scroll click dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave change select submit keydown keypress keyup contextmenu'.split(
        ' ',
      ),
      function (eventIndex, eventType) {
        jQuery.fn[eventType] = function (data, handler) {
          if (arguments.length > 0) {
            return this.on(eventType, null, data, handler);
          } else {
            return this.trigger(eventType);
          }
        };
      },
    );
    jQuery.fn.extend({
      hover: function (enterHandler, leaveHandler) {
        return this.mouseenter(enterHandler).mouseleave(leaveHandler || enterHandler);
      },
    });
    jQuery.fn.extend({
      bind: function (types, data, handler) {
        return this.on(types, null, data, handler);
      },
      unbind: function (types, handler) {
        return this.off(types, null, handler);
      },
      delegate: function (selector, types, data, handler) {
        return this.on(types, selector, data, handler);
      },
      undelegate: function (selector, types, handler) {
        if (1 === arguments.length) {
          return this.off(selector, '**');
        } else {
          return this.off(types, selector || '**', handler);
        }
      },
    });
    jQuery.proxy = function (callback, context) {
      var temporary, args, proxy;
      if ('string' == typeof context) {
        temporary = callback[context];
        context = callback;
        callback = temporary;
      }
      if (isFunction(callback)) {
        args = slice.call(arguments, 2);
        (proxy = function () {
          return callback.apply(context || this, args.concat(slice.call(arguments)));
        }).guid = callback.guid = callback.guid || jQuery.guid++;
        return proxy;
      }
    };
    jQuery.holdReady = function (hold) {
      if (hold) {
        jQuery.readyWait++;
      } else {
        jQuery.ready(true);
      }
    };
    jQuery.isArray = Array.isArray;
    jQuery.parseJSON = JSON.parse;
    jQuery.nodeName = nodeName;
    jQuery.isFunction = isFunction;
    jQuery.isWindow = isWindow;
    jQuery.camelCase = camelCase;
    jQuery.type = toType;
    jQuery.now = Date.now;
    jQuery.isNumeric = function (value) {
      var valueType = jQuery.type(value);
      return (
        ('number' === valueType || 'string' === valueType) && !isNaN(value - parseFloat(value))
      );
    };
    engineModules.define(
      'libraries/jquery',
      [],
      false,
      function (requireModule, moduleExports, moduleRecord) {
        return function () {
          return jQuery;
        }.call(this);
      },
    );
    var previousJQuery = window.jQuery,
      previousDollar = window.$;
    jQuery.noConflict = function (deep) {
      if (window.$ === jQuery) {
        window.$ = previousDollar;
      }
      if (deep && window.jQuery === jQuery) {
        window.jQuery = previousJQuery;
      }
      return jQuery;
    };
    if (!noGlobal) {
      window.jQuery = window.$ = jQuery;
    }
    return jQuery;
  });
}
