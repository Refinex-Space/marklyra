// Install this compatibility library in the supplied engine environment.
export default function installLibrariesRangy(engineModules, vendorScope) {
  // libraries/rangy.
  // Vendor adapter; version and local behavior are preserved.
  engineModules.define(
    'libraries/rangy',
    [],
    true,
    function (requireModule, moduleExports, moduleRecord) {
      'use strict';
      if (!this) {
        self;
      }
      var rangy = (function (global) {
        var OBJECT = 'object',
          FUNCTION = 'function',
          UNDEFINED = 'undefined',
          domRangeProperties = [
            'startContainer',
            'startOffset',
            'endContainer',
            'endOffset',
            'collapsed',
            'commonAncestorContainer',
          ],
          domRangeMethods = [
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
          textRangeProperties = [
            'boundingHeight',
            'boundingLeft',
            'boundingTop',
            'boundingWidth',
            'htmlText',
            'text',
          ],
          textRangeMethods = [
            'collapse',
            'compareEndPoints',
            'duplicate',
            'moveToElementText',
            'parentElement',
            'select',
            'setEndPoint',
            'getBoundingClientRect',
          ];
        function isHostMethod(hostObject, propertyName) {
          var propertyType = typeof hostObject[propertyName];
          return (
            propertyType == FUNCTION ||
            !(propertyType != OBJECT || !hostObject[propertyName]) ||
            'unknown' == propertyType
          );
        }
        function isHostObject(hostObject, propertyName) {
          return !(typeof hostObject[propertyName] != OBJECT || !hostObject[propertyName]);
        }
        function isHostProperty(hostObject, propertyName) {
          return typeof hostObject[propertyName] != UNDEFINED;
        }
        function createMultiplePropertyTest(testFunc) {
          return function (hostObject, props) {
            for (var propertyIndex = props.length; propertyIndex--; ) {
              if (!testFunc(hostObject, props[propertyIndex])) {
                return false;
              }
            }
            return true;
          };
        }
        var areHostMethods = createMultiplePropertyTest(isHostMethod),
          areHostObjects = createMultiplePropertyTest(isHostObject),
          areHostProperties = createMultiplePropertyTest(isHostProperty);
        function isTextRange(range) {
          return (
            range &&
            areHostMethods(range, textRangeMethods) &&
            areHostProperties(range, textRangeProperties)
          );
        }
        function getBody(doc) {
          if (isHostObject(doc, 'body')) {
            return doc.body;
          } else {
            return doc.getElementsByTagName('body')[0];
          }
        }
        var addListener,
          modules = {},
          api = {
            version: '1.3alpha.20140716',
            initialized: false,
            supported: true,
            util: {
              isHostMethod: isHostMethod,
              isHostObject: isHostObject,
              isHostProperty: isHostProperty,
              areHostMethods: areHostMethods,
              areHostObjects: areHostObjects,
              areHostProperties: areHostProperties,
              isTextRange: isTextRange,
              getBody: getBody,
            },
            features: {},
            modules: modules,
            config: { alertOnFail: true, alertOnWarn: false, preferTextRange: false },
          };
        function consoleLog(msg) {
          if (isHostObject(window, 'console') && isHostMethod(window.console, 'log')) {
            window.console.log(msg);
          }
        }
        function alertOrLog(msg, shouldAlert) {
          if (shouldAlert) {
            window.alert(msg);
          } else {
            consoleLog(msg);
          }
        }
        function fail(reason) {
          api.initialized = true;
          api.supported = false;
          alertOrLog(
            'Rangy is not supported on this page in your browser. Reason: ' + reason,
            api.config.alertOnFail,
          );
        }
        api.fail = fail;
        api.warn = function (msg) {
          alertOrLog('Rangy warning: ' + msg, api.config.alertOnWarn);
        };
        if (!{}.hasOwnProperty) {
          fail('hasOwnProperty not supported');
        } else {
          api.util.extend = function (obj, props, deep) {
            var targetValue, sourceValue;
            for (var propertyName in props) {
              if (props.hasOwnProperty(propertyName)) {
                targetValue = obj[propertyName];
                sourceValue = props[propertyName];
                if (
                  deep &&
                  null !== targetValue &&
                  'object' == typeof targetValue &&
                  null !== sourceValue &&
                  'object' == typeof sourceValue
                ) {
                  api.util.extend(targetValue, sourceValue, true);
                }
                obj[propertyName] = sourceValue;
              }
            }
            if (props.hasOwnProperty('toString')) {
              obj.toString = props.toString;
            }
            return obj;
          };
        }
        (function () {
          var testElement = document.createElement('div');
          testElement.appendChild(document.createElement('span'));
          var toArray,
            slice = [].slice;
          try {
            if (1 == slice.call(testElement.childNodes, 0)[0].nodeType) {
              toArray = function (arrayLike) {
                return slice.call(arrayLike, 0);
              };
            }
          } catch (error) {}
          if (!toArray) {
            toArray = function (arrayLike) {
              for (
                var arr = [], itemIndex = 0, itemCount = arrayLike.length;
                itemIndex < itemCount;
                ++itemIndex
              ) {
                arr[itemIndex] = arrayLike[itemIndex];
              }
              return arr;
            };
          }
          api.util.toArray = toArray;
        })();
        if (isHostMethod(document, 'addEventListener')) {
          addListener = function (obj, eventType, listener) {
            obj.addEventListener(eventType, listener, false);
          };
        } else {
          if (isHostMethod(document, 'attachEvent')) {
            addListener = function (obj, eventType, listener) {
              obj.attachEvent('on' + eventType, listener);
            };
          } else {
            fail('Document does not have required addEventListener or attachEvent method');
          }
        }
        api.util.addListener = addListener;
        var initListeners = [];
        function getErrorDesc(error) {
          return error.message || error.description || String(error);
        }
        function init() {
          if (!api.initialized) {
            var testRange,
              implementsDomRange = false,
              implementsTextRange = false;
            if (isHostMethod(document, 'createRange')) {
              testRange = document.createRange();
              if (
                areHostMethods(testRange, domRangeMethods) &&
                areHostProperties(testRange, domRangeProperties)
              ) {
                implementsDomRange = true;
              }
            }
            var body = getBody(document);
            if (body && 'body' == body.nodeName.toLowerCase()) {
              if (
                body &&
                isHostMethod(body, 'createTextRange') &&
                isTextRange((testRange = body.createTextRange()))
              ) {
                implementsTextRange = true;
              }
              if (implementsDomRange || implementsTextRange) {
                var module;
                for (var moduleName in ((api.initialized = true),
                (api.features = {
                  implementsDomRange: implementsDomRange,
                  implementsTextRange: implementsTextRange,
                }),
                modules)) {
                  if ((module = modules[moduleName]) instanceof Module) {
                    module.init(module, api);
                  }
                }
                for (
                  var listenerIndex = 0, listenerCount = initListeners.length;
                  listenerIndex < listenerCount;
                  ++listenerIndex
                ) {
                  try {
                    initListeners[listenerIndex](api);
                  } catch (error) {
                    consoleLog(
                      'Rangy init listener threw an exception. Continuing. Detail: ' +
                        getErrorDesc(error),
                    );
                  }
                }
              } else {
                fail('Neither Range nor TextRange are available');
              }
            } else {
              fail('No body element found');
            }
          }
        }
        api.init = init;
        api.addInitListener = function (listener) {
          if (api.initialized) {
            listener(api);
          } else {
            initListeners.push(listener);
          }
        };
        var createMissingNativeApiListeners = [];
        function Module(name, dependencies, initializer) {
          this.name = name;
          this.dependencies = dependencies;
          this.initialized = false;
          this.supported = false;
          this.initializer = initializer;
        }
        function createModule(isCore, name, dependencies, initFunc) {
          var newModule = new Module(name, dependencies, function (module) {
            if (!module.initialized) {
              module.initialized = true;
              try {
                initFunc(api, module);
                module.supported = true;
              } catch (error) {
                consoleLog("Module '" + name + "' failed to load: " + getErrorDesc(error));
              }
            }
          });
          modules[name] = newModule;
        }
        function RangePrototype() {}
        api.addCreateMissingNativeApiListener = function (listener) {
          createMissingNativeApiListeners.push(listener);
        };
        api.createMissingNativeApi = function (win) {
          win = win || window;
          init();
          for (
            var listenerIndex = 0, listenerCount = createMissingNativeApiListeners.length;
            listenerIndex < listenerCount;
            ++listenerIndex
          ) {
            createMissingNativeApiListeners[listenerIndex](win);
          }
        };
        Module.prototype = {
          init: function (unusedModule) {
            for (
              var requiredModule,
                moduleName,
                requiredModuleNames = this.dependencies || [],
                dependencyIndex = 0,
                dependencyCount = requiredModuleNames.length;
              dependencyIndex < dependencyCount;
              ++dependencyIndex
            ) {
              moduleName = requiredModuleNames[dependencyIndex];
              if (!((requiredModule = modules[moduleName]) && requiredModule instanceof Module)) {
                throw new Error("required module '" + moduleName + "' not found");
              }
              requiredModule.init();
              if (!requiredModule.supported) {
                throw new Error("required module '" + moduleName + "' not supported");
              }
            }
            this.initializer(this);
          },
          fail: function (reason) {
            this.initialized = true;
            this.supported = false;
            throw new Error("Module '" + this.name + "' failed to load: " + reason);
          },
          warn: function (msg) {
            api.warn('Module ' + this.name + ': ' + msg);
          },
          deprecationNotice: function (deprecated, replacement) {
            api.warn(
              'DEPRECATED: ' +
                deprecated +
                ' in module ' +
                this.name +
                'is deprecated. Please use ' +
                replacement +
                ' instead',
            );
          },
          createError: function (msg) {
            return new Error('Error in Rangy ' + this.name + ' module: ' + msg);
          },
        };
        api.createModule = function (name) {
          var initializer, dependencies;
          if (2 == arguments.length) {
            initializer = arguments[1];
            dependencies = [];
          } else {
            initializer = arguments[2];
            dependencies = arguments[1];
          }
          createModule(0, name, dependencies, initializer);
        };
        api.createCoreModule = function (name, dependencies, initFunc) {
          createModule(0, name, dependencies, initFunc);
        };
        api.RangePrototype = RangePrototype;
        api.rangePrototype = new RangePrototype();
        api.selectionPrototype = new (function () {})();
        var docReady = false,
          loadHandler = function (event) {
            if (!docReady) {
              docReady = true;
              if (!api.initialized) {
                init();
              }
            }
          };
        if (typeof window != UNDEFINED) {
          if (typeof document != UNDEFINED) {
            if (isHostMethod(document, 'addEventListener')) {
              document.addEventListener('DOMContentLoaded', loadHandler, false);
            }
            addListener(window, 'load', loadHandler);
            return api;
          }
          fail('No document found');
        } else {
          fail('No window found');
        }
      })();
      rangy.createCoreModule('DomUtil', [], function (api, module) {
        var UNDEF = 'undefined',
          util = api.util;
        if (
          !util.areHostMethods(document, [
            'createDocumentFragment',
            'createElement',
            'createTextNode',
          ])
        ) {
          module.fail('document missing a Node creation method');
        }
        if (!util.isHostMethod(document, 'getElementsByTagName')) {
          module.fail('document missing getElementsByTagName method');
        }
        var testElement = document.createElement('div');
        if (
          !util.areHostMethods(
            testElement,
            ['insertBefore', 'appendChild', 'cloneNode'] ||
              !util.areHostObjects(testElement, [
                'previousSibling',
                'nextSibling',
                'childNodes',
                'parentNode',
              ]),
          )
        ) {
          module.fail('Incomplete Element implementation');
        }
        if (!util.isHostProperty(testElement, 'innerHTML')) {
          module.fail('Element is missing innerHTML property');
        }
        var textNode = document.createTextNode('test');
        if (
          !util.areHostMethods(
            textNode,
            ['splitText', 'deleteData', 'insertData', 'appendData', 'cloneNode'] ||
              !util.areHostObjects(testElement, [
                'previousSibling',
                'nextSibling',
                'childNodes',
                'parentNode',
              ]) ||
              !util.areHostProperties(textNode, ['data']),
          )
        ) {
          module.fail('Incomplete Text Node implementation');
        }
        var arrayContains = function (arr, val) {
          for (var itemIndex = arr.length; itemIndex--; ) {
            if (arr[itemIndex] === val) {
              return true;
            }
          }
          return false;
        };
        function getNodeIndex(node) {
          for (var siblingIndex = 0; (node = node.previousSibling); ) {
            ++siblingIndex;
          }
          return siblingIndex;
        }
        function getCommonAncestor(node1, node2) {
          var ancestor,
            ancestors = [];
          for (ancestor = node1; ancestor; ancestor = ancestor.parentNode) {
            ancestors.push(ancestor);
          }
          for (ancestor = node2; ancestor; ancestor = ancestor.parentNode) {
            if (arrayContains(ancestors, ancestor)) {
              return ancestor;
            }
          }
          return null;
        }
        function isAncestorOf(ancestor, descendant, selfIsAncestor) {
          for (
            var currentAncestor = selfIsAncestor ? descendant : descendant.parentNode;
            currentAncestor;
          ) {
            if (currentAncestor === ancestor) {
              return true;
            }
            currentAncestor = currentAncestor.parentNode;
          }
          return false;
        }
        function getClosestAncestorIn(node, ancestor, selfIsAncestor) {
          for (
            var parent, currentAncestor = selfIsAncestor ? node : node.parentNode;
            currentAncestor;
          ) {
            if ((parent = currentAncestor.parentNode) === ancestor) {
              return currentAncestor;
            }
            currentAncestor = parent;
          }
          return null;
        }
        function isCharacterDataNode(node) {
          var nodeType = node.nodeType;
          return 3 == nodeType || 4 == nodeType || 8 == nodeType;
        }
        function insertAfter(node, precedingNode) {
          var nextNode = precedingNode.nextSibling,
            parent = precedingNode.parentNode;
          if (nextNode) {
            parent.insertBefore(node, nextNode);
          } else {
            parent.appendChild(node);
          }
          return node;
        }
        function getDocument(node) {
          if (9 == node.nodeType) {
            return node;
          }
          if (typeof node.ownerDocument != UNDEF) {
            return node.ownerDocument;
          }
          if (typeof node.document != UNDEF) {
            return node.document;
          }
          if (node.parentNode) {
            return getDocument(node.parentNode);
          }
          throw module.createError('getDocument: no document found for node');
        }
        function getWindow(node) {
          var ownerDocument = getDocument(node);
          if (typeof ownerDocument.defaultView != UNDEF) {
            return ownerDocument.defaultView;
          }
          if (typeof ownerDocument.parentWindow != UNDEF) {
            return ownerDocument.parentWindow;
          }
          throw module.createError('Cannot get a window object for node');
        }
        function getIframeDocument(iframeEl) {
          if (typeof iframeEl.contentDocument != UNDEF) {
            return iframeEl.contentDocument;
          }
          if (typeof iframeEl.contentWindow != UNDEF) {
            return iframeEl.contentWindow.document;
          }
          throw module.createError(
            'getIframeDocument: No Document object found for iframe element',
          );
        }
        function isWindow(obj) {
          return obj && util.isHostMethod(obj, 'setTimeout') && util.isHostObject(obj, 'document');
        }
        var getComputedStyleProperty,
          crashyTextNodes = false;
        function isBrokenNode(node) {
          try {
            node.parentNode;
            return false;
          } catch (error) {
            return true;
          }
        }
        function inspectNode(node) {
          if (!node) {
            return '[No node]';
          }
          if (crashyTextNodes && isBrokenNode(node)) {
            return '[Broken node]';
          }
          if (isCharacterDataNode(node)) {
            return '"' + node.data + '"';
          }
          if (1 == node.nodeType) {
            var idAttr = node.id ? ' id="' + node.id + '"' : '';
            return (
              '<' +
              node.nodeName +
              idAttr +
              '>[index:' +
              getNodeIndex(node) +
              ',length:' +
              node.childNodes.length +
              '][' +
              (node.innerHTML || '[innerHTML not supported]').slice(0, 25) +
              ']'
            );
          }
          return node.nodeName;
        }
        function NodeIterator(root) {
          this.root = root;
          this._next = root;
        }
        function DomPosition(node, offset) {
          this.node = node;
          this.offset = offset;
        }
        function DOMException(codeName) {
          this.code = this[codeName];
          this.codeName = codeName;
          this.message = '[rangy] DOMException: ' + this.codeName;
          if ('captureStackTrace' in Error) {
            Error.captureStackTrace(this, DOMException);
          } else {
            this.stack = new Error().stack;
          }
        }
        !(function () {
          var testElement = document.createElement('b');
          testElement.innerHTML = '1';
          var textNode = testElement.firstChild;
          testElement.innerHTML = '<br>';
          crashyTextNodes = isBrokenNode(textNode);
          api.features.crashyTextNodes = crashyTextNodes;
        })();
        if (typeof window.getComputedStyle != UNDEF) {
          getComputedStyleProperty = function (element, propName) {
            return getWindow(element).getComputedStyle(element, null)[propName];
          };
        } else {
          if (typeof document.documentElement.currentStyle != UNDEF) {
            getComputedStyleProperty = function (element, propName) {
              return element.currentStyle[propName];
            };
          } else {
            module.fail('No means of obtaining computed style properties found');
          }
        }
        NodeIterator.prototype = {
          _current: null,
          hasNext: function () {
            return !!this._next;
          },
          next: function () {
            var child,
              next,
              currentNode = (this._current = this._next);
            if (this._current) {
              if ((child = currentNode.firstChild)) {
                this._next = child;
              } else {
                for (
                  next = null;
                  currentNode !== this.root && !(next = currentNode.nextSibling);
                ) {
                  currentNode = currentNode.parentNode;
                }
                this._next = next;
              }
            }
            return this._current;
          },
          detach: function () {
            this._current = this._next = this.root = null;
          },
        };
        DomPosition.prototype = {
          equals: function (pos) {
            return !!pos && this.node === pos.node && this.offset == pos.offset;
          },
          inspect: function () {
            return '[DomPosition(' + inspectNode(this.node) + ':' + this.offset + ')]';
          },
          toString: function () {
            return this.inspect();
          },
        };
        DOMException.prototype = {
          INDEX_SIZE_ERR: 1,
          HIERARCHY_REQUEST_ERR: 3,
          WRONG_DOCUMENT_ERR: 4,
          NO_MODIFICATION_ALLOWED_ERR: 7,
          NOT_FOUND_ERR: 8,
          NOT_SUPPORTED_ERR: 9,
          INVALID_STATE_ERR: 11,
          INVALID_NODE_TYPE_ERR: 24,
        };
        api.dom = {
          arrayContains: arrayContains,
          isHtmlNamespace: function (node) {
            var namespace;
            return (
              typeof node.namespaceURI == UNDEF ||
              null === (namespace = node.namespaceURI) ||
              'http://www.w3.org/1999/xhtml' == namespace
            );
          },
          parentElement: function (node) {
            var parent = node.parentNode;
            if (1 == parent.nodeType) {
              return parent;
            } else {
              return null;
            }
          },
          getNodeIndex: getNodeIndex,
          getNodeLength: function (node) {
            switch (node.nodeType) {
              case 7:
              case 10:
                return 0;
              case 3:
              case 8:
                return node.length;
              default:
                return node.childNodes.length;
            }
          },
          getCommonAncestor: getCommonAncestor,
          isAncestorOf: isAncestorOf,
          isOrIsAncestorOf: function (ancestor, descendant) {
            return isAncestorOf(ancestor, descendant, true);
          },
          getClosestAncestorIn: getClosestAncestorIn,
          isCharacterDataNode: isCharacterDataNode,
          isTextOrCommentNode: function (node) {
            if (!node) {
              return false;
            }
            var nodeType = node.nodeType;
            return 3 == nodeType || 8 == nodeType;
          },
          insertAfter: insertAfter,
          splitDataNode: function (node, index, positionsToPreserve) {
            var newNode = node.cloneNode(false);
            newNode.deleteData(0, index);
            node.deleteData(index, node.length - index);
            insertAfter(newNode, node);
            if (positionsToPreserve) {
              for (
                var position, positionIndex = 0;
                (position = positionsToPreserve[positionIndex++]);
              ) {
                if (position.node == node && position.offset > index) {
                  position.node = newNode;
                  position.offset -= index;
                } else {
                  if (position.node == node.parentNode && position.offset > getNodeIndex(node)) {
                    ++position.offset;
                  }
                }
              }
            }
            return newNode;
          },
          getDocument: getDocument,
          getWindow: getWindow,
          getIframeWindow: function (iframeEl) {
            if (typeof iframeEl.contentWindow != UNDEF) {
              return iframeEl.contentWindow;
            }
            if (typeof iframeEl.contentDocument != UNDEF) {
              return iframeEl.contentDocument.defaultView;
            }
            throw module.createError('getIframeWindow: No Window object found for iframe element');
          },
          getIframeDocument: getIframeDocument,
          getBody: util.getBody,
          isWindow: isWindow,
          getContentDocument: function (obj, module, methodName) {
            var doc;
            if (obj) {
              if (util.isHostProperty(obj, 'nodeType')) {
                doc =
                  1 == obj.nodeType && 'iframe' == obj.tagName.toLowerCase()
                    ? getIframeDocument(obj)
                    : getDocument(obj);
              } else {
                if (isWindow(obj)) {
                  doc = obj.document;
                }
              }
            } else {
              doc = document;
            }
            if (!doc) {
              throw module.createError(
                methodName + '(): Parameter must be a Window object or DOM node',
              );
            }
            return doc;
          },
          getRootContainer: function (node) {
            for (var parent; (parent = node.parentNode); ) {
              node = parent;
            }
            return node;
          },
          comparePoints: function (nodeA, offsetA, nodeB, offsetB) {
            var nodeC, root, childA, childB, sibling;
            if (nodeA == nodeB) {
              if (offsetA === offsetB) {
                return 0;
              } else {
                if (offsetA < offsetB) {
                  return -1;
                } else {
                  return 1;
                }
              }
            }
            if ((nodeC = getClosestAncestorIn(nodeB, nodeA, true))) {
              if (offsetA <= getNodeIndex(nodeC)) {
                return -1;
              } else {
                return 1;
              }
            }
            if ((nodeC = getClosestAncestorIn(nodeA, nodeB, true))) {
              if (getNodeIndex(nodeC) < offsetB) {
                return -1;
              } else {
                return 1;
              }
            }
            if (!(root = getCommonAncestor(nodeA, nodeB))) {
              throw new Error('comparePoints error: nodes have no common ancestor');
            }
            if (
              (childA = nodeA === root ? root : getClosestAncestorIn(nodeA, root, true)) ===
              (childB = nodeB === root ? root : getClosestAncestorIn(nodeB, root, true))
            ) {
              throw module.createError(
                'comparePoints got to case 4 and childA and childB are the same!',
              );
            }
            for (sibling = root.firstChild; sibling; ) {
              if (sibling === childA) {
                return -1;
              }
              if (sibling === childB) {
                return 1;
              }
              sibling = sibling.nextSibling;
            }
          },
          isBrokenNode: isBrokenNode,
          inspectNode: inspectNode,
          getComputedStyleProperty: getComputedStyleProperty,
          fragmentFromNodeChildren: function (node) {
            for (
              var child, fragment = getDocument(node).createDocumentFragment();
              (child = node.firstChild);
            ) {
              fragment.appendChild(child);
            }
            return fragment;
          },
          createIterator: function (root) {
            return new NodeIterator(root);
          },
          DomPosition: DomPosition,
        };
        api.DOMException = DOMException;
      });
      rangy.createCoreModule('DomRange', ['DomUtil'], function (api, module) {
        var dom = api.dom,
          util = api.util,
          DomPosition = dom.DomPosition,
          DOMException = api.DOMException,
          isCharacterDataNode = dom.isCharacterDataNode,
          getNodeIndex = dom.getNodeIndex,
          isOrIsAncestorOf = dom.isOrIsAncestorOf,
          getDocument = dom.getDocument,
          comparePoints = dom.comparePoints,
          splitDataNode = dom.splitDataNode,
          getClosestAncestorIn = dom.getClosestAncestorIn,
          getNodeLength = dom.getNodeLength,
          arrayContains = dom.arrayContains,
          getRootContainer = dom.getRootContainer,
          crashyTextNodes = api.features.crashyTextNodes;
        function isNonTextPartiallySelected(node, range) {
          return (
            3 != node.nodeType &&
            (isOrIsAncestorOf(node, range.startContainer) ||
              isOrIsAncestorOf(node, range.endContainer))
          );
        }
        function getRangeDocument(range) {
          return range.document || getDocument(range.startContainer);
        }
        function getBoundaryBeforeNode(node) {
          return new DomPosition(node.parentNode, getNodeIndex(node));
        }
        function getBoundaryAfterNode(node) {
          return new DomPosition(node.parentNode, getNodeIndex(node) + 1);
        }
        function insertNodeAtPosition(node, container, offset) {
          var firstNodeInserted = 11 == node.nodeType ? node.firstChild : node;
          if (isCharacterDataNode(container)) {
            if (offset == container.length) {
              dom.insertAfter(node, container);
            } else {
              container.parentNode.insertBefore(
                node,
                0 == offset ? container : splitDataNode(container, offset),
              );
            }
          } else {
            if (offset >= container.childNodes.length) {
              container.appendChild(node);
            } else {
              container.insertBefore(node, container.childNodes[offset]);
            }
          }
          return firstNodeInserted;
        }
        function rangesIntersect(rangeA, rangeB, touchingIsIntersecting) {
          assertRangeValid(rangeA);
          assertRangeValid(rangeB);
          if (getRangeDocument(rangeB) != getRangeDocument(rangeA)) {
            throw new DOMException('WRONG_DOCUMENT_ERR');
          }
          var startComparison = comparePoints(
              rangeA.startContainer,
              rangeA.startOffset,
              rangeB.endContainer,
              rangeB.endOffset,
            ),
            endComparison = comparePoints(
              rangeA.endContainer,
              rangeA.endOffset,
              rangeB.startContainer,
              rangeB.startOffset,
            );
          if (touchingIsIntersecting) {
            return startComparison <= 0 && endComparison >= 0;
          } else {
            return startComparison < 0 && endComparison > 0;
          }
        }
        function iterateSubtree(rangeIterator, func, iteratorState) {
          var nodeIterator, descendant, node, subRangeIterator;
          for (iteratorState = iteratorState || { stop: false }; (node = rangeIterator.next()); ) {
            if (rangeIterator.isPartiallySelectedSubtree()) {
              if (false === func(node)) {
                return void (iteratorState.stop = true);
              }
              iterateSubtree(
                (subRangeIterator = rangeIterator.getSubtreeIterator()),
                func,
                iteratorState,
              );
              subRangeIterator.detach();
              if (iteratorState.stop) {
                return;
              }
            } else {
              for (nodeIterator = dom.createIterator(node); (descendant = nodeIterator.next()); ) {
                if (false === func(descendant)) {
                  return void (iteratorState.stop = true);
                }
              }
            }
          }
        }
        function deleteSubtree(iterator) {
          for (var subIterator; iterator.next(); ) {
            if (iterator.isPartiallySelectedSubtree()) {
              deleteSubtree((subIterator = iterator.getSubtreeIterator()));
              subIterator.detach();
            } else {
              iterator.remove();
            }
          }
        }
        function extractSubtree(iterator) {
          for (
            var node, subIterator, frag = getRangeDocument(iterator.range).createDocumentFragment();
            (node = iterator.next());
          ) {
            if (iterator.isPartiallySelectedSubtree()) {
              node = node.cloneNode(false);
              subIterator = iterator.getSubtreeIterator();
              node.appendChild(extractSubtree(subIterator));
              subIterator.detach();
            } else {
              iterator.remove();
            }
            if (10 == node.nodeType) {
              throw new DOMException('HIERARCHY_REQUEST_ERR');
            }
            frag.appendChild(node);
          }
          return frag;
        }
        function inspect(range) {
          return (
            '[' +
            (void 0 === range.getName ? 'Range' : range.getName()) +
            '(' +
            dom.inspectNode(range.startContainer) +
            ':' +
            range.startOffset +
            ', ' +
            dom.inspectNode(range.endContainer) +
            ':' +
            range.endOffset +
            ')]'
          );
        }
        function RangeIterator(range, clonePartiallySelectedTextNodes) {
          this.range = range;
          this.clonePartiallySelectedTextNodes = clonePartiallySelectedTextNodes;
          if (!range.collapsed) {
            this.sc = range.startContainer;
            this.so = range.startOffset;
            this.ec = range.endContainer;
            this.eo = range.endOffset;
            var root = range.commonAncestorContainer;
            if (this.sc === this.ec && isCharacterDataNode(this.sc)) {
              this.isSingleCharacterDataNode = true;
              this._first = this._last = this._next = this.sc;
            } else {
              this._first = this._next =
                this.sc !== root || isCharacterDataNode(this.sc)
                  ? getClosestAncestorIn(this.sc, root, true)
                  : this.sc.childNodes[this.so];
              this._last =
                this.ec !== root || isCharacterDataNode(this.ec)
                  ? getClosestAncestorIn(this.ec, root, true)
                  : this.ec.childNodes[this.eo - 1];
            }
          }
        }
        RangeIterator.prototype = {
          _current: null,
          _next: null,
          _first: null,
          _last: null,
          isSingleCharacterDataNode: false,
          reset: function () {
            this._current = null;
            this._next = this._first;
          },
          hasNext: function () {
            return !!this._next;
          },
          next: function () {
            var current = (this._current = this._next);
            if (current) {
              this._next = current !== this._last ? current.nextSibling : null;
              if (isCharacterDataNode(current) && this.clonePartiallySelectedTextNodes) {
                if (current === this.ec) {
                  (current = current.cloneNode(true)).deleteData(this.eo, current.length - this.eo);
                }
                if (this._current === this.sc) {
                  (current = current.cloneNode(true)).deleteData(0, this.so);
                }
              }
            }
            return current;
          },
          remove: function () {
            var start,
              end,
              current = this._current;
            if (!isCharacterDataNode(current) || (current !== this.sc && current !== this.ec)) {
              if (current.parentNode) {
                current.parentNode.removeChild(current);
              }
            } else {
              if (
                (start = current === this.sc ? this.so : 0) !=
                (end = current === this.ec ? this.eo : current.length)
              ) {
                current.deleteData(start, end - start);
              }
            }
          },
          isPartiallySelectedSubtree: function () {
            return isNonTextPartiallySelected(this._current, this.range);
          },
          getSubtreeIterator: function () {
            var subRange;
            if (this.isSingleCharacterDataNode) {
              (subRange = this.range.cloneRange()).collapse(false);
            } else {
              subRange = new Range(getRangeDocument(this.range));
              var current = this._current,
                startContainer = current,
                startOffset = 0,
                endContainer = current,
                endOffset = getNodeLength(current);
              if (isOrIsAncestorOf(current, this.sc)) {
                startContainer = this.sc;
                startOffset = this.so;
              }
              if (isOrIsAncestorOf(current, this.ec)) {
                endContainer = this.ec;
                endOffset = this.eo;
              }
              updateBoundaries(subRange, startContainer, startOffset, endContainer, endOffset);
            }
            return new RangeIterator(subRange, this.clonePartiallySelectedTextNodes);
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
        var beforeAfterNodeTypes = [1, 3, 4, 5, 7, 8, 10],
          rootContainerNodeTypes = [2, 9, 11],
          insertableNodeTypes = [1, 3, 4, 5, 7, 8, 10, 11],
          surroundNodeTypes = [1, 3, 4, 5, 7, 8];
        function createAncestorFinder(nodeTypes) {
          return function (node, selfIsAncestor) {
            for (var nodeType, ancestor = selfIsAncestor ? node : node.parentNode; ancestor; ) {
              nodeType = ancestor.nodeType;
              if (arrayContains(nodeTypes, nodeType)) {
                return ancestor;
              }
              ancestor = ancestor.parentNode;
            }
            return null;
          };
        }
        var getDocumentOrFragmentContainer = createAncestorFinder([9, 11]),
          getReadonlyAncestor = createAncestorFinder([5, 6, 10, 12]),
          getDocTypeNotationEntityAncestor = createAncestorFinder([6, 10, 12]);
        function assertNoDocTypeNotationEntityAncestor(node, allowSelf) {
          if (getDocTypeNotationEntityAncestor(node, allowSelf)) {
            throw new DOMException('INVALID_NODE_TYPE_ERR');
          }
        }
        function assertValidNodeType(node, invalidTypes) {
          if (!arrayContains(invalidTypes, node.nodeType)) {
            throw new DOMException('INVALID_NODE_TYPE_ERR');
          }
        }
        function assertValidOffset(node, offset) {
          if (
            offset < 0 ||
            offset > (isCharacterDataNode(node) ? node.length : node.childNodes.length)
          ) {
            throw new DOMException('INDEX_SIZE_ERR');
          }
        }
        function assertSameDocumentOrFragment(node1, node2) {
          if (
            getDocumentOrFragmentContainer(node1, true) !==
            getDocumentOrFragmentContainer(node2, true)
          ) {
            throw new DOMException('WRONG_DOCUMENT_ERR');
          }
        }
        function assertNodeNotReadOnly(node) {
          if (getReadonlyAncestor(node, true)) {
            throw new DOMException('NO_MODIFICATION_ALLOWED_ERR');
          }
        }
        function assertNode(node, codeName) {
          if (!node) {
            throw new DOMException(codeName);
          }
        }
        function isOrphan(node) {
          return (
            (crashyTextNodes && dom.isBrokenNode(node)) ||
            (!arrayContains(rootContainerNodeTypes, node.nodeType) &&
              !getDocumentOrFragmentContainer(node, true))
          );
        }
        function isValidOffset(node, offset) {
          return offset <= (isCharacterDataNode(node) ? node.length : node.childNodes.length);
        }
        function isRangeValid(range) {
          return (
            !!range.startContainer &&
            !!range.endContainer &&
            !isOrphan(range.startContainer) &&
            !isOrphan(range.endContainer) &&
            isValidOffset(range.startContainer, range.startOffset) &&
            isValidOffset(range.endContainer, range.endOffset)
          );
        }
        function assertRangeValid(range) {
          if (!isRangeValid(range)) {
            throw new Error(
              'Range error: Range is no longer valid after DOM mutation (' + range.inspect() + ')',
            );
          }
        }
        var styleEl = document.createElement('style'),
          htmlParsingConforms = false;
        try {
          styleEl.innerHTML = '<b>x</b>';
          htmlParsingConforms = 3 == styleEl.firstChild.nodeType;
        } catch (error) {}
        api.features.htmlParsingConforms = htmlParsingConforms;
        var createContextualFragment = htmlParsingConforms
          ? function (fragmentStr) {
              var node = this.startContainer,
                doc = getDocument(node);
              if (!node) {
                throw new DOMException('INVALID_STATE_ERR');
              }
              var contextElement = null;
              if (1 == node.nodeType) {
                contextElement = node;
              } else {
                if (isCharacterDataNode(node)) {
                  contextElement = dom.parentElement(node);
                }
              }
              (contextElement =
                null === contextElement ||
                ('HTML' == contextElement.nodeName &&
                  dom.isHtmlNamespace(getDocument(contextElement).documentElement) &&
                  dom.isHtmlNamespace(contextElement))
                  ? doc.createElement('body')
                  : contextElement.cloneNode(false)).innerHTML = fragmentStr;
              return dom.fragmentFromNodeChildren(contextElement);
            }
          : function (fragmentStr) {
              var bodyElement = getRangeDocument(this).createElement('body');
              bodyElement.innerHTML = fragmentStr;
              return dom.fragmentFromNodeChildren(bodyElement);
            };
        function splitRangeBoundaries(range, positionsToPreserve) {
          assertRangeValid(range);
          var startContainer = range.startContainer,
            startOffset = range.startOffset,
            endContainer = range.endContainer,
            endOffset = range.endOffset,
            startEndSame = startContainer === endContainer;
          if (
            isCharacterDataNode(endContainer) &&
            endOffset > 0 &&
            endOffset < endContainer.length
          ) {
            splitDataNode(endContainer, endOffset, positionsToPreserve);
          }
          if (
            isCharacterDataNode(startContainer) &&
            startOffset > 0 &&
            startOffset < startContainer.length
          ) {
            startContainer = splitDataNode(startContainer, startOffset, positionsToPreserve);
            if (startEndSame) {
              endOffset -= startOffset;
              endContainer = startContainer;
            } else {
              if (
                endContainer == startContainer.parentNode &&
                endOffset >= getNodeIndex(startContainer)
              ) {
                endOffset++;
              }
            }
            startOffset = 0;
          }
          range.setStartAndEnd(startContainer, startOffset, endContainer, endOffset);
        }
        var rangeProperties = [
            'startContainer',
            'startOffset',
            'endContainer',
            'endOffset',
            'collapsed',
            'commonAncestorContainer',
          ],
          s2s = 0,
          s2e = 1,
          e2e = 2,
          e2s = 3,
          n_b = 0,
          n_a = 1,
          n_b_a = 2,
          n_i = 3;
        function copyComparisonConstantsToObject(obj) {
          obj.START_TO_START = s2s;
          obj.START_TO_END = s2e;
          obj.END_TO_END = e2e;
          obj.END_TO_START = e2s;
          obj.NODE_BEFORE = n_b;
          obj.NODE_AFTER = n_a;
          obj.NODE_BEFORE_AND_AFTER = n_b_a;
          obj.NODE_INSIDE = n_i;
        }
        function copyComparisonConstants(constructor) {
          copyComparisonConstantsToObject(constructor);
          copyComparisonConstantsToObject(constructor.prototype);
        }
        function createRangeContentRemover(remover, boundaryUpdater) {
          return function () {
            assertRangeValid(this);
            var boundary,
              startContainer = this.startContainer,
              startOffset = this.startOffset,
              root = this.commonAncestorContainer,
              iterator = new RangeIterator(this, true);
            if (startContainer !== root) {
              startContainer = (boundary = getBoundaryAfterNode(
                getClosestAncestorIn(startContainer, root, true),
              )).node;
              startOffset = boundary.offset;
            }
            iterateSubtree(iterator, assertNodeNotReadOnly);
            iterator.reset();
            var returnValue = remover(iterator);
            iterator.detach();
            boundaryUpdater(this, startContainer, startOffset, startContainer, startOffset);
            return returnValue;
          };
        }
        function createPrototypeRange(constructor, boundaryUpdater) {
          function createBeforeAfterNodeSetter(isBefore, isStart) {
            return function (node) {
              assertValidNodeType(node, beforeAfterNodeTypes);
              assertValidNodeType(getRootContainer(node), rootContainerNodeTypes);
              var boundary = (isBefore ? getBoundaryBeforeNode : getBoundaryAfterNode)(node);
              (isStart ? setRangeStart : setRangeEnd)(this, boundary.node, boundary.offset);
            };
          }
          function setRangeStart(range, node, offset) {
            var endContainer = range.endContainer,
              endOffset = range.endOffset;
            if (!(node === range.startContainer && offset === range.startOffset)) {
              if (
                !(
                  getRootContainer(node) == getRootContainer(endContainer) &&
                  1 != comparePoints(node, offset, endContainer, endOffset)
                )
              ) {
                endContainer = node;
                endOffset = offset;
              }
              boundaryUpdater(range, node, offset, endContainer, endOffset);
            }
          }
          function setRangeEnd(range, node, offset) {
            var startContainer = range.startContainer,
              startOffset = range.startOffset;
            if (!(node === range.endContainer && offset === range.endOffset)) {
              if (
                !(
                  getRootContainer(node) == getRootContainer(startContainer) &&
                  -1 != comparePoints(node, offset, startContainer, startOffset)
                )
              ) {
                startContainer = node;
                startOffset = offset;
              }
              boundaryUpdater(range, startContainer, startOffset, node, offset);
            }
          }
          var RangePrototypeBridge = function () {};
          RangePrototypeBridge.prototype = api.rangePrototype;
          constructor.prototype = new RangePrototypeBridge();
          util.extend(constructor.prototype, {
            setStart: function (node, offset) {
              assertNoDocTypeNotationEntityAncestor(node, true);
              assertValidOffset(node, offset);
              setRangeStart(this, node, offset);
            },
            setEnd: function (node, offset) {
              assertNoDocTypeNotationEntityAncestor(node, true);
              assertValidOffset(node, offset);
              setRangeEnd(this, node, offset);
            },
            setStartAndEnd: function () {
              var args = arguments,
                startContainer = args[0],
                startOffset = args[1],
                endContainer = startContainer,
                endOffset = startOffset;
              switch (args.length) {
                case 3:
                  endOffset = args[2];
                  break;
                case 4:
                  endContainer = args[2];
                  endOffset = args[3];
              }
              boundaryUpdater(this, startContainer, startOffset, endContainer, endOffset);
            },
            setBoundary: function (node, offset, isStart) {
              this['set' + (isStart ? 'Start' : 'End')](node, offset);
            },
            setStartBefore: createBeforeAfterNodeSetter(true, true),
            setStartAfter: createBeforeAfterNodeSetter(false, true),
            setEndBefore: createBeforeAfterNodeSetter(true, false),
            setEndAfter: createBeforeAfterNodeSetter(false, false),
            collapse: function (isStart) {
              assertRangeValid(this);
              if (isStart) {
                boundaryUpdater(
                  this,
                  this.startContainer,
                  this.startOffset,
                  this.startContainer,
                  this.startOffset,
                );
              } else {
                boundaryUpdater(
                  this,
                  this.endContainer,
                  this.endOffset,
                  this.endContainer,
                  this.endOffset,
                );
              }
            },
            selectNodeContents: function (node) {
              assertNoDocTypeNotationEntityAncestor(node, true);
              boundaryUpdater(this, node, 0, node, getNodeLength(node));
            },
            selectNode: function (node) {
              assertNoDocTypeNotationEntityAncestor(node, false);
              assertValidNodeType(node, beforeAfterNodeTypes);
              var start = getBoundaryBeforeNode(node),
                end = getBoundaryAfterNode(node);
              boundaryUpdater(this, start.node, start.offset, end.node, end.offset);
            },
            extractContents: createRangeContentRemover(extractSubtree, boundaryUpdater),
            deleteContents: createRangeContentRemover(deleteSubtree, boundaryUpdater),
            canSurroundContents: function () {
              assertRangeValid(this);
              assertNodeNotReadOnly(this.startContainer);
              assertNodeNotReadOnly(this.endContainer);
              var iterator = new RangeIterator(this, true),
                boundariesInvalid =
                  (iterator._first && isNonTextPartiallySelected(iterator._first, this)) ||
                  (iterator._last && isNonTextPartiallySelected(iterator._last, this));
              iterator.detach();
              return !boundariesInvalid;
            },
            splitBoundaries: function () {
              splitRangeBoundaries(this);
            },
            splitBoundariesPreservingPositions: function (positionsToPreserve) {
              splitRangeBoundaries(this, positionsToPreserve);
            },
            normalizeBoundaries: function () {
              assertRangeValid(this);
              var startContainer = this.startContainer,
                startOffset = this.startOffset,
                endContainer = this.endContainer,
                endOffset = this.endOffset,
                mergeForward = function (node) {
                  var sibling = node.nextSibling;
                  if (sibling && sibling.nodeType == node.nodeType) {
                    endContainer = node;
                    endOffset = node.length;
                    node.appendData(sibling.data);
                    sibling.parentNode.removeChild(sibling);
                  }
                },
                mergeBackward = function (node) {
                  var sibling = node.previousSibling;
                  if (sibling && sibling.nodeType == node.nodeType) {
                    startContainer = node;
                    var nodeLength = node.length;
                    startOffset = sibling.length;
                    node.insertData(0, sibling.data);
                    sibling.parentNode.removeChild(sibling);
                    if (startContainer == endContainer) {
                      endOffset += startOffset;
                      endContainer = startContainer;
                    } else {
                      if (endContainer == node.parentNode) {
                        var nodeIndex = getNodeIndex(node);
                        if (endOffset == nodeIndex) {
                          endContainer = node;
                          endOffset = nodeLength;
                        } else {
                          if (endOffset > nodeIndex) {
                            endOffset--;
                          }
                        }
                      }
                    }
                  }
                },
                normalizeStart = true;
              if (isCharacterDataNode(endContainer)) {
                if (endContainer.length == endOffset) {
                  mergeForward(endContainer);
                }
              } else {
                if (endOffset > 0) {
                  var endNode = endContainer.childNodes[endOffset - 1];
                  if (endNode && isCharacterDataNode(endNode)) {
                    mergeForward(endNode);
                  }
                }
                normalizeStart = !this.collapsed;
              }
              if (normalizeStart) {
                if (isCharacterDataNode(startContainer)) {
                  if (0 == startOffset) {
                    mergeBackward(startContainer);
                  }
                } else {
                  if (startOffset < startContainer.childNodes.length) {
                    var startNode = startContainer.childNodes[startOffset];
                    if (startNode && isCharacterDataNode(startNode)) {
                      mergeBackward(startNode);
                    }
                  }
                }
              } else {
                startContainer = endContainer;
                startOffset = endOffset;
              }
              boundaryUpdater(this, startContainer, startOffset, endContainer, endOffset);
            },
            collapseToPoint: function (node, offset) {
              assertNoDocTypeNotationEntityAncestor(node, true);
              assertValidOffset(node, offset);
              this.setStartAndEnd(node, offset);
            },
          });
          copyComparisonConstants(constructor);
        }
        function updateCollapsedAndCommonAncestor(range) {
          range.collapsed =
            range.startContainer === range.endContainer && range.startOffset === range.endOffset;
          range.commonAncestorContainer = range.collapsed
            ? range.startContainer
            : dom.getCommonAncestor(range.startContainer, range.endContainer);
        }
        function updateBoundaries(range, startContainer, startOffset, endContainer, endOffset) {
          range.startContainer = startContainer;
          range.startOffset = startOffset;
          range.endContainer = endContainer;
          range.endOffset = endOffset;
          range.document = dom.getDocument(startContainer);
          updateCollapsedAndCommonAncestor(range);
        }
        function Range(doc) {
          this.startContainer = doc;
          this.startOffset = 0;
          this.endContainer = doc;
          this.endOffset = 0;
          this.document = doc;
          updateCollapsedAndCommonAncestor(this);
        }
        util.extend(api.rangePrototype, {
          compareBoundaryPoints: function (how, range) {
            var nodeA, offsetA, nodeB, offsetB;
            assertRangeValid(this);
            assertSameDocumentOrFragment(this.startContainer, range.startContainer);
            var prefixA = how == e2s || how == s2s ? 'start' : 'end',
              prefixB = how == s2e || how == s2s ? 'start' : 'end';
            nodeA = this[prefixA + 'Container'];
            offsetA = this[prefixA + 'Offset'];
            nodeB = range[prefixB + 'Container'];
            offsetB = range[prefixB + 'Offset'];
            return comparePoints(nodeA, offsetA, nodeB, offsetB);
          },
          insertNode: function (node) {
            assertRangeValid(this);
            assertValidNodeType(node, insertableNodeTypes);
            assertNodeNotReadOnly(this.startContainer);
            if (isOrIsAncestorOf(node, this.startContainer)) {
              throw new DOMException('HIERARCHY_REQUEST_ERR');
            }
            var firstNodeInserted = insertNodeAtPosition(
              node,
              this.startContainer,
              this.startOffset,
            );
            this.setStartBefore(firstNodeInserted);
          },
          cloneContents: function () {
            var clone, frag;
            assertRangeValid(this);
            if (this.collapsed) {
              return getRangeDocument(this).createDocumentFragment();
            }
            if (
              this.startContainer === this.endContainer &&
              isCharacterDataNode(this.startContainer)
            ) {
              (clone = this.startContainer.cloneNode(true)).data = clone.data.slice(
                this.startOffset,
                this.endOffset,
              );
              (frag = getRangeDocument(this).createDocumentFragment()).appendChild(clone);
              return frag;
            }
            var iterator = new RangeIterator(this, true);
            clone = (function cloneSubtree(iterator) {
              for (
                var partiallySelected,
                  node,
                  subIterator,
                  frag = getRangeDocument(iterator.range).createDocumentFragment();
                (node = iterator.next());
              ) {
                partiallySelected = iterator.isPartiallySelectedSubtree();
                node = node.cloneNode(!partiallySelected);
                if (partiallySelected) {
                  subIterator = iterator.getSubtreeIterator();
                  node.appendChild(cloneSubtree(subIterator));
                  subIterator.detach();
                }
                if (10 == node.nodeType) {
                  throw new DOMException('HIERARCHY_REQUEST_ERR');
                }
                frag.appendChild(node);
              }
              return frag;
            })(iterator);
            iterator.detach();
            return clone;
          },
          canSurroundContents: function () {
            assertRangeValid(this);
            assertNodeNotReadOnly(this.startContainer);
            assertNodeNotReadOnly(this.endContainer);
            var iterator = new RangeIterator(this, true),
              boundariesInvalid =
                (iterator._first && isNonTextPartiallySelected(iterator._first, this)) ||
                (iterator._last && isNonTextPartiallySelected(iterator._last, this));
            iterator.detach();
            return !boundariesInvalid;
          },
          surroundContents: function (node) {
            assertValidNodeType(node, surroundNodeTypes);
            if (!this.canSurroundContents()) {
              throw new DOMException('INVALID_STATE_ERR');
            }
            var content = this.extractContents();
            if (node.hasChildNodes()) {
              for (; node.lastChild; ) {
                node.removeChild(node.lastChild);
              }
            }
            insertNodeAtPosition(node, this.startContainer, this.startOffset);
            node.appendChild(content);
            this.selectNode(node);
          },
          cloneRange: function () {
            assertRangeValid(this);
            for (
              var prop,
                clonedRange = new Range(getRangeDocument(this)),
                propertyIndex = rangeProperties.length;
              propertyIndex--;
            ) {
              clonedRange[(prop = rangeProperties[propertyIndex])] = this[prop];
            }
            clonedRange.isBackward = this.isBackward;
            return clonedRange;
          },
          toString: function () {
            assertRangeValid(this);
            var startContainer = this.startContainer;
            if (startContainer === this.endContainer && isCharacterDataNode(startContainer)) {
              if (3 == startContainer.nodeType || 4 == startContainer.nodeType) {
                return startContainer.data.slice(this.startOffset, this.endOffset);
              } else {
                return '';
              }
            }
            var textParts = [],
              iterator = new RangeIterator(this, true);
            iterateSubtree(iterator, function (node) {
              if (!(3 != node.nodeType && 4 != node.nodeType)) {
                textParts.push(node.data);
              }
            });
            iterator.detach();
            return textParts.join('');
          },
          compareNode: function (node) {
            assertRangeValid(this);
            var parent = node.parentNode,
              nodeIndex = getNodeIndex(node);
            if (!parent) {
              throw new DOMException('NOT_FOUND_ERR');
            }
            var startComparison = this.comparePoint(parent, nodeIndex),
              endComparison = this.comparePoint(parent, nodeIndex + 1);
            if (startComparison < 0) {
              if (endComparison > 0) {
                return n_b_a;
              } else {
                return n_b;
              }
            } else {
              if (endComparison > 0) {
                return n_a;
              } else {
                return n_i;
              }
            }
          },
          comparePoint: function (node, offset) {
            assertRangeValid(this);
            assertNode(node, 'HIERARCHY_REQUEST_ERR');
            assertSameDocumentOrFragment(node, this.startContainer);
            if (comparePoints(node, offset, this.startContainer, this.startOffset) < 0) {
              return -1;
            } else {
              if (comparePoints(node, offset, this.endContainer, this.endOffset) > 0) {
                return 1;
              } else {
                return 0;
              }
            }
          },
          createContextualFragment: createContextualFragment,
          toHtml: function () {
            assertRangeValid(this);
            var container = this.commonAncestorContainer.parentNode.cloneNode(false);
            container.appendChild(this.cloneContents());
            return container.innerHTML;
          },
          intersectsNode: function (node, touchingIsIntersecting) {
            assertRangeValid(this);
            assertNode(node, 'NOT_FOUND_ERR');
            if (getDocument(node) !== getRangeDocument(this)) {
              return false;
            }
            var parent = node.parentNode,
              offset = getNodeIndex(node);
            assertNode(parent, 'NOT_FOUND_ERR');
            var startComparison = comparePoints(parent, offset, this.endContainer, this.endOffset),
              endComparison = comparePoints(
                parent,
                offset + 1,
                this.startContainer,
                this.startOffset,
              );
            if (touchingIsIntersecting) {
              return startComparison <= 0 && endComparison >= 0;
            } else {
              return startComparison < 0 && endComparison > 0;
            }
          },
          isPointInRange: function (node, offset) {
            assertRangeValid(this);
            assertNode(node, 'HIERARCHY_REQUEST_ERR');
            assertSameDocumentOrFragment(node, this.startContainer);
            return (
              comparePoints(node, offset, this.startContainer, this.startOffset) >= 0 &&
              comparePoints(node, offset, this.endContainer, this.endOffset) <= 0
            );
          },
          intersectsRange: function (range) {
            return rangesIntersect(this, range, false);
          },
          intersectsOrTouchesRange: function (range) {
            return rangesIntersect(this, range, true);
          },
          intersection: function (range) {
            if (this.intersectsRange(range)) {
              var startComparison = comparePoints(
                  this.startContainer,
                  this.startOffset,
                  range.startContainer,
                  range.startOffset,
                ),
                endComparison = comparePoints(
                  this.endContainer,
                  this.endOffset,
                  range.endContainer,
                  range.endOffset,
                ),
                intersectionRange = this.cloneRange();
              if (-1 == startComparison) {
                intersectionRange.setStart(range.startContainer, range.startOffset);
              }
              if (1 == endComparison) {
                intersectionRange.setEnd(range.endContainer, range.endOffset);
              }
              return intersectionRange;
            }
            return null;
          },
          union: function (range) {
            if (this.intersectsOrTouchesRange(range)) {
              var unionRange = this.cloneRange();
              if (
                -1 ==
                comparePoints(
                  range.startContainer,
                  range.startOffset,
                  this.startContainer,
                  this.startOffset,
                )
              ) {
                unionRange.setStart(range.startContainer, range.startOffset);
              }
              if (
                1 ==
                comparePoints(
                  range.endContainer,
                  range.endOffset,
                  this.endContainer,
                  this.endOffset,
                )
              ) {
                unionRange.setEnd(range.endContainer, range.endOffset);
              }
              return unionRange;
            }
            throw new DOMException('Ranges do not intersect');
          },
          containsNode: function (node, allowPartial) {
            try {
              if (allowPartial) {
                return this.intersectsNode(node, false);
              } else {
                return this.compareNode(node) == n_i;
              }
            } catch (node) {
              console.sendError(node);
              return false;
            }
          },
          containsNodeContents: function (node) {
            return (
              this.comparePoint(node, 0) >= 0 && this.comparePoint(node, getNodeLength(node)) <= 0
            );
          },
          containsRange: function (range) {
            var intersection = this.intersection(range);
            return null !== intersection && range.equals(intersection);
          },
          containsNodeText: function (node) {
            var nodeRange = this.cloneRange();
            nodeRange.selectNode(node);
            var textNodes = nodeRange.getNodes([3]);
            if (textNodes.length > 0) {
              nodeRange.setStart(textNodes[0], 0);
              var lastTextNode = textNodes.pop();
              nodeRange.setEnd(lastTextNode, lastTextNode.length);
              return this.containsRange(nodeRange);
            }
            return this.containsNodeContents(node);
          },
          getNodes: function (nodeTypes, filter) {
            assertRangeValid(this);
            return (function (range, nodeTypes, filter) {
              var nodeTypePattern,
                filterNodeTypes = !(!nodeTypes || !nodeTypes.length),
                filterNodes = !!filter;
              if (filterNodeTypes) {
                nodeTypePattern = new RegExp('^(' + nodeTypes.join('|') + ')$');
              }
              var nodes = [];
              iterateSubtree(new RangeIterator(range, false), function (node) {
                if (
                  (!filterNodeTypes || nodeTypePattern.test(node.nodeType)) &&
                  (!filterNodes || filter(node))
                ) {
                  var startContainer = range.startContainer;
                  if (
                    node != startContainer ||
                    !isCharacterDataNode(startContainer) ||
                    range.startOffset != startContainer.length
                  ) {
                    var endContainer = range.endContainer;
                    if (
                      !(
                        node == endContainer &&
                        isCharacterDataNode(endContainer) &&
                        0 == range.endOffset
                      )
                    ) {
                      nodes.push(node);
                    }
                  }
                }
              });
              return nodes;
            })(this, nodeTypes, filter);
          },
          getDocument: function () {
            return getRangeDocument(this);
          },
          collapseBefore: function (node) {
            this.setEndBefore(node);
            this.collapse(false);
          },
          collapseAfter: function (node) {
            this.setStartAfter(node);
            this.collapse(true);
          },
          getBookmark: function (containerNode, omitMathSuffix) {
            if (!containerNode) {
              return {};
            }
            function visibleTextLength(range) {
              var fragment = range.cloneContents();
              if (fragment.querySelector('mjx-container, text, ruby')) {
                for (
                  var renderedElements = fragment.querySelectorAll(
                      `mjx-container, svg, ruby${omitMathSuffix ? ',.md-math-after-sym' : ''}`,
                    ),
                    elementIndex = 0;
                  elementIndex < renderedElements.length;
                  elementIndex++
                ) {
                  if (renderedElements[elementIndex].parentElement) {
                    renderedElements[elementIndex].parentElement.removeChild(
                      renderedElements[elementIndex],
                    );
                  }
                }
                return fragment.textContent.length;
              }
              return range.toString().length;
            }
            var rangeDocument = getRangeDocument(this),
              containerRange = api.createRange(rangeDocument);
            containerNode = containerNode || dom.getBody(rangeDocument);
            containerRange.selectNodeContents(containerNode);
            var intersection = this.intersection(containerRange),
              renderedElementCount = containerNode.querySelectorAll(
                'mjx-container, text, ruby',
              ).length,
              startOffset = 0,
              endOffset = 0;
            if (intersection) {
              containerRange.setEnd(intersection.startContainer, intersection.startOffset);
              endOffset =
                (startOffset = renderedElementCount
                  ? visibleTextLength(containerRange)
                  : containerRange.toString().length) +
                (renderedElementCount
                  ? visibleTextLength(intersection)
                  : intersection.toString().length);
            }
            return { start: startOffset, end: endOffset, containerNode: containerNode };
          },
          moveToBookmark: function (bookmark) {
            var containerNode = bookmark.containerNode,
              textOffset = 0;
            this.setStart(containerNode, 0);
            this.collapse(true);
            for (
              var node,
                nextOffset,
                childIndex,
                childNodes,
                nodeStack = [containerNode],
                foundStart = false,
                foundEnd = false;
              !foundEnd && (node = nodeStack.pop());
            ) {
              if (3 == node.nodeType) {
                nextOffset = textOffset + node.length;
                if (!foundStart && bookmark.start >= textOffset && bookmark.start <= nextOffset) {
                  this.setStart(node, bookmark.start - textOffset);
                  foundStart = true;
                }
                if (foundStart && bookmark.end >= textOffset && bookmark.end <= nextOffset) {
                  this.setEnd(node, bookmark.end - textOffset);
                  foundEnd = true;
                }
                textOffset = nextOffset;
              } else {
                if (!/^(MJX\-CONTAINER|text|RUBY)$/i.exec(node.tagName || '')) {
                  for (childIndex = (childNodes = node.childNodes).length; childIndex--; ) {
                    nodeStack.push(childNodes[childIndex]);
                  }
                }
              }
            }
          },
          getName: function () {
            return 'DomRange';
          },
          equals: function (range) {
            return Range.rangesEqual(this, range);
          },
          isValid: function () {
            return isRangeValid(this);
          },
          inspect: function () {
            return inspect(this);
          },
          detach: function () {},
        });
        createPrototypeRange(Range, updateBoundaries);
        util.extend(Range, {
          rangeProperties: rangeProperties,
          RangeIterator: RangeIterator,
          copyComparisonConstants: copyComparisonConstants,
          createPrototypeRange: createPrototypeRange,
          inspect: inspect,
          getRangeDocument: getRangeDocument,
          rangesEqual: function (rangeA, rangeB) {
            return (
              rangeA.startContainer === rangeB.startContainer &&
              rangeA.startOffset === rangeB.startOffset &&
              rangeA.endContainer === rangeB.endContainer &&
              rangeA.endOffset === rangeB.endOffset
            );
          },
        });
        api.DomRange = Range;
      });
      rangy.createCoreModule('WrappedRange', ['DomRange'], function (api, module) {
        var WrappedRange,
          WrappedTextRange,
          dom = api.dom,
          util = api.util,
          DomPosition = dom.DomPosition,
          DomRange = api.DomRange,
          getBody = dom.getBody,
          getContentDocument = dom.getContentDocument,
          isCharacterDataNode = dom.isCharacterDataNode;
        if (api.features.implementsDomRange) {
          (function () {
            var rangePrototype,
              createBoundarySetter,
              rangeProperties = DomRange.rangeProperties;
            function updateRangeProperties(range) {
              for (var propertyName, propertyIndex = rangeProperties.length; propertyIndex--; ) {
                range[(propertyName = rangeProperties[propertyIndex])] =
                  range.nativeRange[propertyName];
              }
              range.collapsed =
                range.startContainer === range.endContainer &&
                range.startOffset === range.endOffset;
            }
            WrappedRange = function (range) {
              if (!range) {
                throw module.createError('WrappedRange: Range must be specified');
              }
              this.nativeRange = range;
              updateRangeProperties(this);
            };
            DomRange.createPrototypeRange(
              WrappedRange,
              function (range, startContainer, startOffset, endContainer, endOffset) {
                var startMoved =
                    range.startContainer !== startContainer || range.startOffset != startOffset,
                  endMoved = range.endContainer !== endContainer || range.endOffset != endOffset,
                  nativeRangeDifferent = !range.equals(range.nativeRange);
                if (startMoved || endMoved || nativeRangeDifferent) {
                  range.setEnd(endContainer, endOffset);
                  range.setStart(startContainer, startOffset);
                }
              },
            );
            (rangePrototype = WrappedRange.prototype).selectNode = function (node) {
              this.nativeRange.selectNode(node);
              updateRangeProperties(this);
            };
            rangePrototype.cloneContents = function () {
              return this.nativeRange.cloneContents();
            };
            rangePrototype.surroundContents = function (node) {
              this.nativeRange.surroundContents(node);
              updateRangeProperties(this);
            };
            rangePrototype.collapse = function (isStart) {
              this.nativeRange.collapse(isStart);
              updateRangeProperties(this);
            };
            rangePrototype.cloneRange = function () {
              var clonedRange = new WrappedRange(this.nativeRange.cloneRange());
              clonedRange.isBackward = this.isBackward;
              return clonedRange;
            };
            rangePrototype.refresh = function () {
              updateRangeProperties(this);
            };
            rangePrototype.toString = function () {
              return this.nativeRange.toString();
            };
            var testTextNode = document.createTextNode('test');
            getBody(document).appendChild(testTextNode);
            var testRange = document.createRange();
            testRange.setStart(testTextNode, 0);
            testRange.setEnd(testTextNode, 0);
            try {
              testRange.setStart(testTextNode, 1);
              rangePrototype.setStart = function (node, offset) {
                this.nativeRange.setStart(node, offset);
                updateRangeProperties(this);
              };
              rangePrototype.setEnd = function (node, offset) {
                this.nativeRange.setEnd(node, offset);
                updateRangeProperties(this);
              };
              createBoundarySetter = function (name) {
                return function (node) {
                  this.nativeRange[name](node);
                  updateRangeProperties(this);
                };
              };
            } catch (error) {
              rangePrototype.setStart = function (node, offset) {
                try {
                  this.nativeRange.setStart(node, offset);
                } catch (error) {
                  this.nativeRange.setEnd(node, offset);
                  this.nativeRange.setStart(node, offset);
                }
                updateRangeProperties(this);
              };
              rangePrototype.setEnd = function (node, offset) {
                try {
                  this.nativeRange.setEnd(node, offset);
                } catch (error) {
                  this.nativeRange.setStart(node, offset);
                  this.nativeRange.setEnd(node, offset);
                }
                updateRangeProperties(this);
              };
              createBoundarySetter = function (name, oppositeName) {
                return function (node) {
                  try {
                    this.nativeRange[name](node);
                  } catch (error) {
                    this.nativeRange[oppositeName](node);
                    this.nativeRange[name](node);
                  }
                  updateRangeProperties(this);
                };
              };
            }
            rangePrototype.setStartBefore = createBoundarySetter('setStartBefore', 'setEndBefore');
            rangePrototype.setStartAfter = createBoundarySetter('setStartAfter', 'setEndAfter');
            rangePrototype.setEndBefore = createBoundarySetter('setEndBefore', 'setStartBefore');
            rangePrototype.setEndAfter = createBoundarySetter('setEndAfter', 'setStartAfter');
            rangePrototype.selectNodeContents = function (node) {
              this.setStartAndEnd(node, 0, dom.getNodeLength(node));
            };
            testRange.selectNodeContents(testTextNode);
            testRange.setEnd(testTextNode, 3);
            var comparisonRange = document.createRange();
            comparisonRange.selectNodeContents(testTextNode);
            comparisonRange.setEnd(testTextNode, 4);
            comparisonRange.setStart(testTextNode, 2);
            if (
              -1 == testRange.compareBoundaryPoints(testRange.START_TO_END, comparisonRange) &&
              1 == testRange.compareBoundaryPoints(testRange.END_TO_START, comparisonRange)
            ) {
              rangePrototype.compareBoundaryPoints = function (comparisonType, sourceRange) {
                if (
                  comparisonType ==
                  (sourceRange = sourceRange.nativeRange || sourceRange).START_TO_END
                ) {
                  comparisonType = sourceRange.END_TO_START;
                } else {
                  if (comparisonType == sourceRange.END_TO_START) {
                    comparisonType = sourceRange.START_TO_END;
                  }
                }
                return this.nativeRange.compareBoundaryPoints(comparisonType, sourceRange);
              };
            } else {
              rangePrototype.compareBoundaryPoints = function (type, range) {
                return this.nativeRange.compareBoundaryPoints(type, range.nativeRange || range);
              };
            }
            var testContainer = document.createElement('div');
            testContainer.innerHTML = '123';
            var testContentNode = testContainer.firstChild,
              body = getBody(document);
            body.appendChild(testContainer);
            testRange.setStart(testContentNode, 1);
            testRange.setEnd(testContentNode, 2);
            testRange.deleteContents();
            if ('13' == testContentNode.data) {
              rangePrototype.deleteContents = function () {
                this.nativeRange.deleteContents();
                updateRangeProperties(this);
              };
              rangePrototype.extractContents = function () {
                var frag = this.nativeRange.extractContents();
                updateRangeProperties(this);
                return frag;
              };
            }
            body.removeChild(testContainer);
            body = null;
            if (util.isHostMethod(testRange, 'createContextualFragment')) {
              rangePrototype.createContextualFragment = function (fragmentStr) {
                return this.nativeRange.createContextualFragment(fragmentStr);
              };
            }
            getBody(document).removeChild(testTextNode);
            rangePrototype.getName = function () {
              return 'WrappedRange';
            };
            api.WrappedRange = WrappedRange;
            api.createNativeRange = function (doc) {
              return (doc = getContentDocument(doc, module, 'createNativeRange')).createRange();
            };
          })();
        }
        if (api.features.implementsTextRange) {
          var getTextRangeBoundaryPosition = function (
              textRange,
              wholeRangeContainer,
              isStart,
              isCollapsed,
              startInfo,
            ) {
              var workingRange = textRange.duplicate();
              workingRange.collapse(isStart);
              var containerElement = workingRange.parentElement();
              if (!dom.isOrIsAncestorOf(wholeRangeContainer, containerElement)) {
                containerElement = wholeRangeContainer;
              }
              if (!containerElement.canHaveHTML) {
                var elementPosition = new DomPosition(
                  containerElement.parentNode,
                  dom.getNodeIndex(containerElement),
                );
                return {
                  boundaryPosition: elementPosition,
                  nodeInfo: {
                    nodeIndex: elementPosition.offset,
                    containerElement: elementPosition.node,
                  },
                };
              }
              var markerElement = dom.getDocument(containerElement).createElement('span');
              if (markerElement.parentNode) {
                markerElement.parentNode.removeChild(markerElement);
              }
              for (
                var comparison,
                  previousNode,
                  nextNode,
                  boundaryPosition,
                  boundaryTextNode,
                  comparisonType = isStart ? 'StartToStart' : 'StartToEnd',
                  lowerIndex =
                    startInfo && startInfo.containerElement == containerElement
                      ? startInfo.nodeIndex
                      : 0,
                  childCount = containerElement.childNodes.length,
                  upperIndex = childCount,
                  nodeIndex = upperIndex;
                nodeIndex == childCount
                  ? containerElement.appendChild(markerElement)
                  : containerElement.insertBefore(
                      markerElement,
                      containerElement.childNodes[nodeIndex],
                    ),
                  workingRange.moveToElementText(markerElement),
                  0 != (comparison = workingRange.compareEndPoints(comparisonType, textRange)) &&
                    lowerIndex != upperIndex;
              ) {
                if (-1 == comparison) {
                  if (upperIndex == lowerIndex + 1) {
                    break;
                  }
                  lowerIndex = nodeIndex;
                } else {
                  upperIndex = upperIndex == lowerIndex + 1 ? lowerIndex : nodeIndex;
                }
                nodeIndex = Math.floor((lowerIndex + upperIndex) / 2);
                containerElement.removeChild(markerElement);
              }
              boundaryTextNode = markerElement.nextSibling;
              if (-1 == comparison && boundaryTextNode && isCharacterDataNode(boundaryTextNode)) {
                var characterOffset;
                workingRange.setEndPoint(isStart ? 'EndToStart' : 'EndToEnd', textRange);
                if (/[\r\n]/.test(boundaryTextNode.data)) {
                  var characterRange = workingRange.duplicate(),
                    normalizedTextLength = characterRange.text.replace(/\r\n/g, '\r').length;
                  for (
                    characterOffset = characterRange.moveStart('character', normalizedTextLength);
                    -1 ==
                    (comparison = characterRange.compareEndPoints('StartToEnd', characterRange));
                  ) {
                    characterOffset++;
                    characterRange.moveStart('character', 1);
                  }
                } else {
                  characterOffset = workingRange.text.length;
                }
                boundaryPosition = new DomPosition(boundaryTextNode, characterOffset);
              } else {
                previousNode = (isCollapsed || !isStart) && markerElement.previousSibling;
                boundaryPosition =
                  (nextNode = (isCollapsed || isStart) && markerElement.nextSibling) &&
                  isCharacterDataNode(nextNode)
                    ? new DomPosition(nextNode, 0)
                    : previousNode && isCharacterDataNode(previousNode)
                      ? new DomPosition(previousNode, previousNode.data.length)
                      : new DomPosition(containerElement, dom.getNodeIndex(markerElement));
              }
              markerElement.parentNode.removeChild(markerElement);
              return {
                boundaryPosition: boundaryPosition,
                nodeInfo: { nodeIndex: nodeIndex, containerElement: containerElement },
              };
            },
            createBoundaryTextRange = function (position, isStart) {
              var referenceNode,
                containerElement,
                markerElement,
                childNodes,
                offset = position.offset,
                ownerDocument = dom.getDocument(position.node),
                textRange = getBody(ownerDocument).createTextRange(),
                isCharacterData = isCharacterDataNode(position.node);
              if (isCharacterData) {
                containerElement = (referenceNode = position.node).parentNode;
              } else {
                referenceNode =
                  offset < (childNodes = position.node.childNodes).length
                    ? childNodes[offset]
                    : null;
                containerElement = position.node;
              }
              (markerElement = ownerDocument.createElement('span')).innerHTML = '&#feff;';
              if (referenceNode) {
                containerElement.insertBefore(markerElement, referenceNode);
              } else {
                containerElement.appendChild(markerElement);
              }
              textRange.moveToElementText(markerElement);
              textRange.collapse(!isStart);
              containerElement.removeChild(markerElement);
              if (isCharacterData) {
                textRange[isStart ? 'moveStart' : 'moveEnd']('character', offset);
              }
              return textRange;
            };
          (WrappedTextRange = function (textRange) {
            this.textRange = textRange;
            this.refresh();
          }).prototype = new DomRange(document);
          WrappedTextRange.prototype.refresh = function () {
            var startPosition,
              endPosition,
              startBoundary,
              textRange,
              wholeRangeContainer = (function (textRange) {
                var parentElement = textRange.parentElement(),
                  collapsedRange = textRange.duplicate();
                collapsedRange.collapse(true);
                var startContainer = collapsedRange.parentElement();
                (collapsedRange = textRange.duplicate()).collapse(false);
                var endContainer = collapsedRange.parentElement(),
                  commonAncestor =
                    startContainer == endContainer
                      ? startContainer
                      : dom.getCommonAncestor(startContainer, endContainer);
                if (commonAncestor == parentElement) {
                  return commonAncestor;
                } else {
                  return dom.getCommonAncestor(parentElement, commonAncestor);
                }
              })(this.textRange);
            if (0 == (textRange = this.textRange).compareEndPoints('StartToEnd', textRange)) {
              endPosition = startPosition = getTextRangeBoundaryPosition(
                this.textRange,
                wholeRangeContainer,
                true,
                true,
              ).boundaryPosition;
            } else {
              startPosition = (startBoundary = getTextRangeBoundaryPosition(
                this.textRange,
                wholeRangeContainer,
                true,
                false,
              )).boundaryPosition;
              endPosition = getTextRangeBoundaryPosition(
                this.textRange,
                wholeRangeContainer,
                false,
                false,
                startBoundary.nodeInfo,
              ).boundaryPosition;
            }
            this.setStart(startPosition.node, startPosition.offset);
            this.setEnd(endPosition.node, endPosition.offset);
          };
          WrappedTextRange.prototype.getName = function () {
            return 'WrappedTextRange';
          };
          DomRange.copyComparisonConstants(WrappedTextRange);
          WrappedTextRange.rangeToTextRange = function (range) {
            if (range.collapsed) {
              return createBoundaryTextRange(
                new DomPosition(range.startContainer, range.startOffset),
                true,
              );
            }
            var startRange = createBoundaryTextRange(
                new DomPosition(range.startContainer, range.startOffset),
                true,
              ),
              endRange = createBoundaryTextRange(
                new DomPosition(range.endContainer, range.endOffset),
                false,
              ),
              textRange = getBody(DomRange.getRangeDocument(range)).createTextRange();
            textRange.setEndPoint('StartToStart', startRange);
            textRange.setEndPoint('EndToEnd', endRange);
            return textRange;
          };
          api.WrappedTextRange = WrappedTextRange;
          if (!api.features.implementsDomRange || api.config.preferTextRange) {
            var globalObject = (function () {
              return this;
            })();
            if (void 0 === globalObject.Range) {
              globalObject.Range = WrappedTextRange;
            }
            api.createNativeRange = function (doc) {
              doc = getContentDocument(doc, module, 'createNativeRange');
              return getBody(doc).createTextRange();
            };
            api.WrappedRange = WrappedTextRange;
          }
        }
        api.createRange = function (doc) {
          doc = getContentDocument(doc, module, 'createRange');
          return new api.WrappedRange(api.createNativeRange(doc));
        };
        api.createRangyRange = function (doc) {
          doc = getContentDocument(doc, module, 'createRangyRange');
          return new DomRange(doc);
        };
        api.createIframeRange = function (iframeEl) {
          module.deprecationNotice('createIframeRange()', 'createRange(iframeEl)');
          return api.createRange(iframeEl);
        };
        api.createIframeRangyRange = function (iframeEl) {
          module.deprecationNotice('createIframeRangyRange()', 'createRangyRange(iframeEl)');
          return api.createRangyRange(iframeEl);
        };
        api.addCreateMissingNativeApiListener(function (targetWindow) {
          var doc = targetWindow.document;
          if (void 0 === doc.createRange) {
            doc.createRange = function () {
              return api.createRange(doc);
            };
          }
          doc = targetWindow = null;
        });
      });
      rangy.createCoreModule(
        'WrappedSelection',
        ['DomRange', 'WrappedRange'],
        function (api, module) {
          api.config.checkSelectionRanges = true;
          var getNativeSelection,
            isSelectionCollapsed,
            dom = api.dom,
            util = api.util,
            isHostMethod = util.isHostMethod,
            DomRange = api.DomRange,
            WrappedRange = api.WrappedRange,
            DOMException = api.DOMException,
            DomPosition = dom.DomPosition,
            features = api.features,
            getDocument = dom.getDocument,
            getBody = dom.getBody,
            rangesEqual = DomRange.rangesEqual;
          function isDirectionBackward(dir) {
            if ('string' == typeof dir) {
              return /^backward(s)?$/i.test(dir);
            } else {
              return !!dir;
            }
          }
          function getWindow(win, methodName) {
            if (win) {
              if (dom.isWindow(win)) {
                return win;
              }
              if (win instanceof WrappedSelection) {
                return win.win;
              }
              var doc = dom.getContentDocument(win, module, methodName);
              return dom.getWindow(doc);
            }
            return window;
          }
          function getDocSelection(winParam) {
            return getWindow(winParam, 'getDocSelection').document.selection;
          }
          function winSelectionIsBackward(sel) {
            var backward = false;
            if (sel.anchorNode) {
              backward =
                1 ==
                dom.comparePoints(sel.anchorNode, sel.anchorOffset, sel.focusNode, sel.focusOffset);
            }
            return backward;
          }
          var supportsWindowSelection = isHostMethod(window, 'getSelection'),
            supportsDocumentSelection = util.isHostObject(document, 'selection');
          features.implementsWinGetSelection = supportsWindowSelection;
          features.implementsDocSelection = supportsDocumentSelection;
          var useDocumentSelection =
            supportsDocumentSelection && (!supportsWindowSelection || api.config.preferTextRange);
          if (useDocumentSelection) {
            getNativeSelection = getDocSelection;
            api.isSelectionValid = function (winParam) {
              var doc = getWindow(winParam, 'isSelectionValid').document,
                nativeSel = doc.selection;
              return (
                'None' != nativeSel.type ||
                getDocument(nativeSel.createRange().parentElement()) == doc
              );
            };
          } else {
            if (supportsWindowSelection) {
              getNativeSelection = function (winParam) {
                return getWindow(winParam, 'getWinSelection').getSelection();
              };
              api.isSelectionValid = function () {
                return true;
              };
            } else {
              module.fail('Neither document.selection or window.getSelection() detected.');
            }
          }
          api.getNativeSelection = getNativeSelection;
          var testSelection = getNativeSelection(),
            testRange = api.createNativeRange(document),
            body = getBody(document),
            hasAnchorAndFocus = util.areHostProperties(testSelection, [
              'anchorNode',
              'focusNode',
              'anchorOffset',
              'focusOffset',
            ]);
          features.selectionHasAnchorAndFocus = hasAnchorAndFocus;
          var selectionHasExtend = isHostMethod(testSelection, 'extend');
          features.selectionHasExtend = selectionHasExtend;
          var hasRangeCount = 'number' == typeof testSelection.rangeCount;
          features.selectionHasRangeCount = hasRangeCount;
          var addRangeBackwardToNative = selectionHasExtend
            ? function (nativeSelection, range) {
                var doc = DomRange.getRangeDocument(range),
                  endRange = api.createRange(doc);
                endRange.collapseToPoint(range.endContainer, range.endOffset);
                nativeSelection.addRange(getNativeRange(endRange));
                nativeSelection.extend(range.startContainer, range.startOffset);
              }
            : null;
          if (
            util.areHostMethods(testSelection, ['addRange', 'getRangeAt', 'removeAllRanges']) &&
            'number' == typeof testSelection.rangeCount &&
            features.implementsDomRange
          ) {
            (function () {
              var nativeSelection = window.getSelection();
              if (nativeSelection) {
                for (
                  var rangeCount = nativeSelection.rangeCount,
                    savedRanges = [],
                    wasBackward = winSelectionIsBackward(nativeSelection),
                    rangeIndex = 0;
                  rangeIndex < rangeCount;
                  ++rangeIndex
                ) {
                  savedRanges[rangeIndex] = nativeSelection.getRangeAt(rangeIndex);
                }
                for (rangeIndex = 0; rangeIndex < rangeCount; ++rangeIndex) {
                  if (0 == rangeIndex && wasBackward) {
                    if (addRangeBackwardToNative) {
                      addRangeBackwardToNative(nativeSelection, savedRanges[rangeIndex]);
                    } else {
                      api.warn(
                        'Rangy initialization: original selection was backwards but selection has been restored forwards because the browser does not support Selection.extend',
                      );
                      nativeSelection.addRange(savedRanges[rangeIndex]);
                    }
                  } else {
                    nativeSelection.addRange(savedRanges[rangeIndex]);
                  }
                }
              }
            })();
          }
          features.selectionSupportsMultipleRanges = false;
          features.collapsedNonEditableSelectionsSupported = true;
          var testControlRange,
            getNativeRangeAt,
            supportsControlRange = false;
          function updateAnchorAndFocusFromRange(sel, range, backward) {
            var anchorPrefix = backward ? 'end' : 'start',
              focusPrefix = backward ? 'start' : 'end';
            sel.anchorNode = range[anchorPrefix + 'Container'];
            sel.anchorOffset = range[anchorPrefix + 'Offset'];
            sel.focusNode = range[focusPrefix + 'Container'];
            sel.focusOffset = range[focusPrefix + 'Offset'];
          }
          function updateEmptySelection(sel) {
            sel.anchorNode = sel.focusNode = null;
            sel.anchorOffset = sel.focusOffset = 0;
            sel.rangeCount = 0;
            sel.isCollapsed = true;
            sel._ranges.length = 0;
          }
          function getNativeRange(range) {
            var nativeRange;
            if (range instanceof DomRange) {
              (nativeRange = api.createNativeRange(range.getDocument())).setEnd(
                range.endContainer,
                range.endOffset,
              );
              nativeRange.setStart(range.startContainer, range.startOffset);
            } else {
              if (range instanceof WrappedRange) {
                nativeRange = range.nativeRange;
              } else {
                if (
                  features.implementsDomRange &&
                  range instanceof dom.getWindow(range.startContainer).Range
                ) {
                  nativeRange = range;
                }
              }
            }
            return nativeRange;
          }
          function getSingleElementFromRange(range) {
            var nodes = range.getNodes();
            if (
              !(function (nodes) {
                if (!nodes.length || 1 != nodes[0].nodeType) {
                  return false;
                }
                for (
                  var nodeIndex = 1, nodeCount = nodes.length;
                  nodeIndex < nodeCount;
                  ++nodeIndex
                ) {
                  if (!dom.isAncestorOf(nodes[0], nodes[nodeIndex])) {
                    return false;
                  }
                }
                return true;
              })(nodes)
            ) {
              throw module.createError(
                'getSingleElementFromRange: range ' +
                  range.inspect() +
                  ' did not consist of a single element',
              );
            }
            return nodes[0];
          }
          function isTextRangeObject(range) {
            return !!range && void 0 !== range.text;
          }
          function updateFromTextRange(sel, range) {
            var wrappedRange = new WrappedRange(range);
            sel._ranges = [wrappedRange];
            updateAnchorAndFocusFromRange(sel, wrappedRange, false);
            sel.rangeCount = 1;
            sel.isCollapsed = wrappedRange.collapsed;
          }
          function refreshControlSelection(selection) {
            selection._ranges.length = 0;
            if ('None' == selection.docSelection.type) {
              updateEmptySelection(selection);
            } else {
              var controlRange = selection.docSelection.createRange();
              if (isTextRangeObject(controlRange)) {
                updateFromTextRange(selection, controlRange);
              } else {
                selection.rangeCount = controlRange.length;
                for (
                  var wrappedRange,
                    ownerDocument = getDocument(controlRange.item(0)),
                    elementIndex = 0;
                  elementIndex < selection.rangeCount;
                  ++elementIndex
                ) {
                  (wrappedRange = api.createRange(ownerDocument)).selectNode(
                    controlRange.item(elementIndex),
                  );
                  selection._ranges.push(wrappedRange);
                }
                selection.isCollapsed = 1 == selection.rangeCount && selection._ranges[0].collapsed;
                updateAnchorAndFocusFromRange(
                  selection,
                  selection._ranges[selection.rangeCount - 1],
                  false,
                );
              }
            }
          }
          function addRangeToControlSelection(selection, range) {
            for (
              var previousControlRange = selection.docSelection.createRange(),
                selectedElement = getSingleElementFromRange(range),
                ownerDocument = getDocument(previousControlRange.item(0)),
                controlRange = getBody(ownerDocument).createControlRange(),
                elementIndex = 0,
                elementCount = previousControlRange.length;
              elementIndex < elementCount;
              ++elementIndex
            ) {
              controlRange.add(previousControlRange.item(elementIndex));
            }
            try {
              controlRange.add(selectedElement);
            } catch (error) {
              throw module.createError(
                'addRange(): Element within the specified Range could not be added to control selection (does it have layout?)',
              );
            }
            newControlrange.select(range.isBackward);
            refreshControlSelection(selection);
          }
          function WrappedSelection(selection, docSelection, win) {
            this.nativeSelection = selection;
            this.docSelection = docSelection;
            this._ranges = [];
            this.win = win;
            this.refresh();
          }
          function deleteProperties(sel) {
            sel.win = sel.anchorNode = sel.focusNode = sel._ranges = null;
            sel.rangeCount = sel.anchorOffset = sel.focusOffset = 0;
            sel.detached = true;
          }
          if (body && isHostMethod(body, 'createControlRange')) {
            testControlRange = body.createControlRange();
            if (util.areHostProperties(testControlRange, ['item', 'add'])) {
              supportsControlRange = true;
            }
          }
          features.implementsControlRange = supportsControlRange;
          isSelectionCollapsed = hasAnchorAndFocus
            ? function (sel) {
                return sel.anchorNode === sel.focusNode && sel.anchorOffset === sel.focusOffset;
              }
            : function (error) {
                return !!error.rangeCount && error.getRangeAt(error.rangeCount - 1).collapsed;
              };
          if (isHostMethod(testSelection, 'getRangeAt')) {
            getNativeRangeAt = function (sel, index) {
              try {
                return sel.getRangeAt(index);
              } catch (error) {
                return null;
              }
            };
          } else {
            if (hasAnchorAndFocus) {
              getNativeRangeAt = function (sel) {
                var doc = getDocument(sel.anchorNode),
                  range = api.createRange(doc);
                range.setStartAndEnd(
                  sel.anchorNode,
                  sel.anchorOffset,
                  sel.focusNode,
                  sel.focusOffset,
                );
                if (range.collapsed !== this.isCollapsed) {
                  range.setStartAndEnd(
                    sel.focusNode,
                    sel.focusOffset,
                    sel.anchorNode,
                    sel.anchorOffset,
                  );
                }
                return range;
              };
            }
          }
          WrappedSelection.prototype = api.selectionPrototype;
          var selectionCache = [];
          function actOnCachedSelection(targetWindow, action) {
            for (
              var cacheEntry, cachedSelection, cacheIndex = selectionCache.length;
              cacheIndex--;
            ) {
              cachedSelection = (cacheEntry = selectionCache[cacheIndex]).selection;
              if ('deleteAll' == action) {
                deleteProperties(cachedSelection);
              } else {
                if (cacheEntry.win == targetWindow) {
                  if ('delete' == action) {
                    selectionCache.splice(cacheIndex, 1);
                    return true;
                  } else {
                    return cachedSelection;
                  }
                }
              }
            }
            if ('deleteAll' == action) {
              selectionCache.length = 0;
            }
            return null;
          }
          var getSelection = function (targetWindow) {
            if (targetWindow && targetWindow instanceof WrappedSelection) {
              targetWindow.refresh();
              return targetWindow;
            }
            var selection = actOnCachedSelection(
                (targetWindow = getWindow(targetWindow, 'getNativeSelection')),
              ),
              nativeSelection = getNativeSelection(targetWindow),
              documentSelection = supportsDocumentSelection ? getDocSelection(targetWindow) : null;
            if (selection) {
              selection.nativeSelection = nativeSelection;
              selection.docSelection = documentSelection;
              selection.refresh();
            } else {
              selection = new WrappedSelection(nativeSelection, documentSelection, targetWindow);
              selectionCache.push({ win: targetWindow, selection: selection });
            }
            return selection;
          };
          api.getSelection = getSelection;
          api.getIframeSelection = function (iframeEl) {
            module.deprecationNotice('getIframeSelection()', 'getSelection(iframeEl)');
            return api.getSelection(dom.getIframeWindow(iframeEl));
          };
          var refreshSelection,
            selectionPrototype = WrappedSelection.prototype;
          function createControlSelection(selection, ranges) {
            for (
              var selectedElement,
                ownerDocument = getDocument(ranges[0].startContainer),
                controlRange = getBody(ownerDocument).createControlRange(),
                rangeIndex = 0,
                rangeCount = ranges.length;
              rangeIndex < rangeCount;
              ++rangeIndex
            ) {
              selectedElement = getSingleElementFromRange(ranges[rangeIndex]);
              try {
                controlRange.add(selectedElement);
              } catch (error) {
                throw module.createError(
                  'setRanges(): Element within one of the specified Ranges could not be added to control selection (does it have layout?)',
                );
              }
            }
            controlrange.select(range.isBackward);
            refreshControlSelection(selection);
          }
          if (
            !useDocumentSelection &&
            hasAnchorAndFocus &&
            util.areHostMethods(testSelection, ['removeAllRanges', 'addRange'])
          ) {
            selectionPrototype.removeAllRanges = function () {
              this.nativeSelection.removeAllRanges();
              updateEmptySelection(this);
            };
            var addRangeBackward = function (sel, range) {
              addRangeBackwardToNative(sel.nativeSelection, range);
              sel.refresh();
            };
            selectionPrototype.addRange = hasRangeCount
              ? function (range, direction) {
                  var previousRangeCount;
                  if (
                    supportsControlRange &&
                    supportsDocumentSelection &&
                    'Control' == this.docSelection.type
                  ) {
                    addRangeToControlSelection(this, range);
                  } else {
                    if (isDirectionBackward(direction) && selectionHasExtend) {
                      addRangeBackward(this, range);
                    } else {
                      this.removeAllRanges();
                      previousRangeCount = 0;
                      this.nativeSelection.addRange(getNativeRange(range).cloneRange());
                      this.rangeCount = this.nativeSelection.rangeCount;
                      if (this.rangeCount == previousRangeCount + 1) {
                        if (api.config.checkSelectionRanges) {
                          var nativeRange = getNativeRangeAt(
                            this.nativeSelection,
                            this.rangeCount - 1,
                          );
                          if (nativeRange && !rangesEqual(nativeRange, range)) {
                            range = new WrappedRange(nativeRange);
                          }
                        }
                        this._ranges[this.rangeCount - 1] = range;
                        updateAnchorAndFocusFromRange(
                          this,
                          range,
                          isNativeSelectionBackward(this.nativeSelection),
                        );
                        this.isCollapsed = isSelectionCollapsed(this);
                      } else {
                        this.refresh();
                      }
                    }
                  }
                }
              : function (range, direction) {
                  if (isDirectionBackward(direction) && selectionHasExtend) {
                    addRangeBackward(this, range);
                  } else {
                    this.nativeSelection.addRange(getNativeRange(range));
                    this.refresh();
                  }
                };
            selectionPrototype.setRanges = function (ranges) {
              if (supportsControlRange && ranges.length > 1) {
                createControlSelection(this, ranges);
              } else {
                this.removeAllRanges();
                for (
                  var rangeIndex = 0, rangeCount = ranges.length;
                  rangeIndex < rangeCount;
                  ++rangeIndex
                ) {
                  this.addRange(ranges[rangeIndex]);
                }
              }
            };
          } else {
            if (
              !(
                isHostMethod(testSelection, 'empty') &&
                isHostMethod(testRange, 'select') &&
                supportsControlRange &&
                useDocumentSelection
              )
            ) {
              module.fail('No means of selecting a Range or TextRange was found');
              return false;
            }
            selectionPrototype.removeAllRanges = function () {
              try {
                this.docSelection.empty();
                if ('None' != this.docSelection.type) {
                  var ownerDocument;
                  if (this.anchorNode) {
                    ownerDocument = getDocument(this.anchorNode);
                  } else {
                    if ('Control' == this.docSelection.type) {
                      var controlRange = this.docSelection.createRange();
                      if (controlRange.length) {
                        ownerDocument = getDocument(controlRange.item(0));
                      }
                    }
                  }
                  if (ownerDocument) {
                    getBody(ownerDocument).createTextRange();
                    textrange.select(range.isBackward);
                    this.docSelection.empty();
                  }
                }
              } catch (error) {}
              updateEmptySelection(this);
            };
            selectionPrototype.addRange = function (range) {
              if ('Control' == this.docSelection.type) {
                addRangeToControlSelection(this, range);
              } else {
                api.WrappedTextRange.rangeToTextRange(range).select();
                this._ranges[0] = range;
                this.rangeCount = 1;
                this.isCollapsed = this._ranges[0].collapsed;
                updateAnchorAndFocusFromRange(this, range, false);
              }
            };
            selectionPrototype.setRanges = function (ranges) {
              this.removeAllRanges();
              var rangeCount = ranges.length;
              if (rangeCount > 1) {
                createControlSelection(this, ranges);
              } else {
                if (rangeCount) {
                  this.addRange(ranges[0]);
                }
              }
            };
          }
          selectionPrototype.getRangeAt = function (index) {
            if (index < 0 || index >= this.rangeCount) {
              throw new DOMException('INDEX_SIZE_ERR');
            }
            return this._ranges[index].cloneRange();
          };
          if (useDocumentSelection) {
            refreshSelection = function (selection) {
              var textRange;
              if (api.isSelectionValid(selection.win)) {
                textRange = selection.docSelection.createRange();
              } else {
                (textRange = getBody(selection.win.document).createTextRange()).collapse(true);
              }
              if ('Control' == selection.docSelection.type) {
                refreshControlSelection(selection);
              } else {
                if (isTextRangeObject(textRange)) {
                  updateFromTextRange(selection, textRange);
                } else {
                  updateEmptySelection(selection);
                }
              }
            };
          } else {
            if (
              isHostMethod(testSelection, 'getRangeAt') &&
              'number' == typeof testSelection.rangeCount
            ) {
              refreshSelection = function (selection) {
                if (
                  supportsControlRange &&
                  supportsDocumentSelection &&
                  'Control' == selection.docSelection.type
                ) {
                  refreshControlSelection(selection);
                } else {
                  selection._ranges.length = selection.rangeCount =
                    selection.nativeSelection.rangeCount;
                  if (selection.rangeCount) {
                    for (
                      var rangeIndex = 0, rangeCount = selection.rangeCount;
                      rangeIndex < rangeCount;
                      ++rangeIndex
                    ) {
                      selection._ranges[rangeIndex] = new api.WrappedRange(
                        selection.nativeSelection.getRangeAt(rangeIndex),
                      );
                    }
                    updateAnchorAndFocusFromRange(
                      selection,
                      selection._ranges[selection.rangeCount - 1],
                      isNativeSelectionBackward(selection.nativeSelection),
                    );
                    selection.isCollapsed = isSelectionCollapsed(selection);
                  } else {
                    updateEmptySelection(selection);
                  }
                }
              };
            } else {
              if (
                !hasAnchorAndFocus ||
                'boolean' != typeof testSelection.isCollapsed ||
                'boolean' != typeof testRange.collapsed ||
                !features.implementsDomRange
              ) {
                module.fail(
                  "No means of obtaining a Range or TextRange from the user's selection was found",
                );
                return false;
              }
              refreshSelection = function (selection) {
                var range,
                  nativeSelection = selection.nativeSelection;
                if (nativeSelection.anchorNode) {
                  range = getNativeRangeAt(nativeSelection, 0);
                  selection._ranges = [range];
                  selection.rangeCount = 1;
                  (function (sel) {
                    var nativeSel = sel.nativeSelection;
                    sel.anchorNode = nativeSel.anchorNode;
                    sel.anchorOffset = nativeSel.anchorOffset;
                    sel.focusNode = nativeSel.focusNode;
                    sel.focusOffset = nativeSel.focusOffset;
                  })(selection);
                  selection.isCollapsed = isSelectionCollapsed(selection);
                } else {
                  updateEmptySelection(selection);
                }
              };
            }
          }
          selectionPrototype.refresh = function (checkForChanges) {
            var oldRanges = checkForChanges ? this._ranges.slice(0) : null,
              oldAnchorNode = this.anchorNode,
              oldAnchorOffset = this.anchorOffset;
            refreshSelection(this);
            if (checkForChanges) {
              var rangeIndex = oldRanges.length;
              if (rangeIndex != this._ranges.length) {
                return true;
              }
              if (this.anchorNode != oldAnchorNode || this.anchorOffset != oldAnchorOffset) {
                return true;
              }
              for (; rangeIndex--; ) {
                if (!rangesEqual(oldRanges[rangeIndex], this._ranges[rangeIndex])) {
                  return true;
                }
              }
              return false;
            }
          };
          var isNativeSelectionBackward,
            removeRangeFromSelection = function (selection, removedRange) {
              var ranges = selection.getAllRanges();
              selection.removeAllRanges();
              for (
                var rangeIndex = 0, rangeCount = ranges.length;
                rangeIndex < rangeCount;
                ++rangeIndex
              ) {
                if (!rangesEqual(removedRange, ranges[rangeIndex])) {
                  selection.addRange(ranges[rangeIndex]);
                }
              }
              if (!selection.rangeCount) {
                updateEmptySelection(selection);
              }
            };
          function assertNodeInSameDocument(sel, node) {
            if (sel.win.document != getDocument(node)) {
              throw new DOMException('WRONG_DOCUMENT_ERR');
            }
          }
          function createSelectionBoundarySetter(isStart) {
            return function (node, offset) {
              var range;
              if (this.rangeCount) {
                (range = this.getRangeAt(0))['set' + (isStart ? 'Start' : 'End')](node, offset);
              } else {
                (range = api.createRange(this.win.document)).setStartAndEnd(node, offset);
              }
              this.setSingleRange(range, this.isBackward());
            };
          }
          function inspectSelection(selection) {
            var ranges = [],
              anchorPosition = new DomPosition(selection.anchorNode, selection.anchorOffset),
              focusPosition = new DomPosition(selection.focusNode, selection.focusOffset),
              selectionName =
                'function' == typeof selection.getName ? selection.getName() : 'Selection';
            if (void 0 !== selection.rangeCount) {
              for (
                var rangeIndex = 0, rangeCount = selection.rangeCount;
                rangeIndex < rangeCount;
                ++rangeIndex
              ) {
                ranges[rangeIndex] = DomRange.inspect(selection.getRangeAt(rangeIndex));
              }
            }
            return (
              '[' +
              selectionName +
              '(Ranges: ' +
              ranges.join(', ') +
              ')(anchor: ' +
              anchorPosition.inspect() +
              ', focus: ' +
              focusPosition.inspect() +
              ']'
            );
          }
          selectionPrototype.removeRange = supportsControlRange
            ? function (range) {
                if ('Control' == this.docSelection.type) {
                  for (
                    var previousControlRange = this.docSelection.createRange(),
                      removedElement = getSingleElementFromRange(range),
                      ownerDocument = getDocument(previousControlRange.item(0)),
                      controlRange = getBody(ownerDocument).createControlRange(),
                      removed = false,
                      elementIndex = 0,
                      elementCount = previousControlRange.length;
                    elementIndex < elementCount;
                    ++elementIndex
                  ) {
                    if (previousControlRange.item(elementIndex) !== removedElement || removed) {
                      controlRange.add(previousControlRange.item(elementIndex));
                    } else {
                      removed = true;
                    }
                  }
                  newControlrange.select(range.isBackward);
                  refreshControlSelection(this);
                } else {
                  removeRangeFromSelection(this, range);
                }
              }
            : function (error) {
                removeRangeFromSelection(this, error);
              };
          if (!useDocumentSelection && hasAnchorAndFocus && features.implementsDomRange) {
            isNativeSelectionBackward = winSelectionIsBackward;
            selectionPrototype.isBackward = function () {
              return isNativeSelectionBackward(this);
            };
          } else {
            isNativeSelectionBackward = selectionPrototype.isBackward = function () {
              return false;
            };
          }
          selectionPrototype.isBackwards = selectionPrototype.isBackward;
          selectionPrototype.toString = function () {
            for (
              var textParts = [], rangeIndex = 0, rangeCount = this.rangeCount;
              rangeIndex < rangeCount;
              ++rangeIndex
            ) {
              textParts[rangeIndex] = '' + this._ranges[rangeIndex];
            }
            return textParts.join('');
          };
          selectionPrototype.collapse = function (node, offset) {
            assertNodeInSameDocument(this, node);
            var range = api.createRange(node);
            range.collapseToPoint(node, offset);
            this.setSingleRange(range);
            this.isCollapsed = true;
          };
          selectionPrototype.collapseToStart = function () {
            if (!this.rangeCount) {
              throw new DOMException('INVALID_STATE_ERR');
            }
            var range = this._ranges[0];
            this.collapse(range.startContainer, range.startOffset);
          };
          selectionPrototype.collapseToEnd = function () {
            if (!this.rangeCount) {
              throw new DOMException('INVALID_STATE_ERR');
            }
            var range = this._ranges[this.rangeCount - 1];
            this.collapse(range.endContainer, range.endOffset);
          };
          selectionPrototype.selectAllChildren = function (node) {
            assertNodeInSameDocument(this, node);
            var range = api.createRange(node);
            range.selectNodeContents(node);
            this.setSingleRange(range);
          };
          selectionPrototype.deleteFromDocument = function () {
            if (
              supportsControlRange &&
              supportsDocumentSelection &&
              'Control' == this.docSelection.type
            ) {
              for (
                var selectedElement, controlRange = this.docSelection.createRange();
                controlRange.length;
              ) {
                selectedElement = controlRange.item(0);
                controlRange.remove(selectedElement);
                selectedElement.parentNode.removeChild(selectedElement);
              }
              this.refresh();
            } else {
              if (this.rangeCount) {
                var ranges = this.getAllRanges();
                if (ranges.length) {
                  this.removeAllRanges();
                  for (
                    var rangeIndex = 0, rangeCount = ranges.length;
                    rangeIndex < rangeCount;
                    ++rangeIndex
                  ) {
                    ranges[rangeIndex].deleteContents();
                  }
                  this.addRange(ranges[rangeCount - 1]);
                }
              }
            }
          };
          selectionPrototype.eachRange = function (func, returnValue) {
            for (
              var rangeIndex = 0, rangeCount = this._ranges.length;
              rangeIndex < rangeCount;
              ++rangeIndex
            ) {
              if (func(this.getRangeAt(rangeIndex))) {
                return returnValue;
              }
            }
          };
          selectionPrototype.getAllRanges = function () {
            var ranges = [];
            this.eachRange(function (range) {
              ranges.push(range);
            });
            return ranges;
          };
          selectionPrototype.setSingleRange = function (range, direction) {
            this.removeAllRanges();
            this.addRange(range, direction);
          };
          selectionPrototype.callMethodOnEachRange = function (methodName, params) {
            var results = [];
            this.eachRange(function (range) {
              results.push(range[methodName].apply(range, params));
            });
            return results;
          };
          selectionPrototype.setStart = createSelectionBoundarySetter(true);
          selectionPrototype.setEnd = createSelectionBoundarySetter(false);
          api.rangePrototype.select = function (direction) {
            getSelection(this.getDocument()).setSingleRange(this, direction);
          };
          selectionPrototype.changeEachRange = function (func) {
            var ranges = [],
              backward = this.isBackward();
            this.eachRange(function (range) {
              func(range);
              ranges.push(range);
            });
            this.removeAllRanges();
            if (backward && 1 == ranges.length) {
              this.addRange(ranges[0], 'backward');
            } else {
              this.setRanges(ranges);
            }
          };
          selectionPrototype.containsNode = function (node, allowPartial) {
            return this.eachRange(function (range) {
              return range.containsNode(node, allowPartial);
            }, true);
          };
          selectionPrototype.getBookmark = function (containerNode) {
            return {
              backward: this.isBackward(),
              rangeBookmarks: this.callMethodOnEachRange('getBookmark', [containerNode]),
            };
          };
          selectionPrototype.moveToBookmark = function (bookmark) {
            for (
              var rangeBookmark, range, ranges = [], bookmarkIndex = 0;
              (rangeBookmark = bookmark.rangeBookmarks[bookmarkIndex++]);
            ) {
              (range = api.createRange(this.win)).moveToBookmark(rangeBookmark);
              ranges.push(range);
            }
            if (bookmark.backward) {
              this.setSingleRange(ranges[0], 'backward');
            } else {
              this.setRanges(ranges);
            }
          };
          selectionPrototype.toHtml = function () {
            return this.callMethodOnEachRange('toHtml').join('');
          };
          selectionPrototype.getName = function () {
            return 'WrappedSelection';
          };
          selectionPrototype.inspect = function () {
            return inspectSelection(this);
          };
          selectionPrototype.detach = function () {
            actOnCachedSelection(this.win, 'delete');
            deleteProperties(this);
          };
          WrappedSelection.detachAll = function () {
            actOnCachedSelection(null, 'deleteAll');
          };
          WrappedSelection.inspect = inspectSelection;
          WrappedSelection.isDirectionBackward = isDirectionBackward;
          api.Selection = WrappedSelection;
          api.selectionPrototype = selectionPrototype;
          api.addCreateMissingNativeApiListener(function (win) {
            if (void 0 === win.getSelection) {
              win.getSelection = function () {
                return getSelection(win);
              };
            }
            win = null;
          });
        },
      );
      moduleRecord.exports = rangy;
    },
  );
}
