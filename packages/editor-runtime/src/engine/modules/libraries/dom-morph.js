// Install this compatibility library in the supplied engine environment.
export default function installLibrariesDomMorph(engineModules, vendorScope) {
  // libraries/dom-morph.
  // Vendor adapter; version and local behavior are preserved.
  engineModules.define(
    'libraries/dom-morph',
    [],
    true,
    function (requireModule, moduleExports, moduleRecord) {
      if (!this) {
        self;
      }
      var fragmentRange,
        HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml',
        ownerDocument = 'undefined' == typeof document ? void 0 : document,
        probeElement = ownerDocument
          ? ownerDocument.body || ownerDocument.createElement('div')
          : {},
        hasAttribute = probeElement.hasAttributeNS
          ? function (element, namespace, attributeName) {
              return element.hasAttributeNS(namespace, attributeName);
            }
          : probeElement.hasAttribute
            ? function (element, namespace, attributeName) {
                return element.hasAttribute(attributeName);
              }
            : function (element, namespace, attributeName) {
                return null != element.getAttributeNode(namespace, attributeName);
              };
      function sameNodeName(fromNode, toNode) {
        var fromName = fromNode.nodeName,
          toName = toNode.nodeName;
        return (
          fromName === toName ||
          (!!(toNode.actualize && fromName.charCodeAt(0) < 91 && toName.charCodeAt(0) > 90) &&
            fromName === toName.toUpperCase())
        );
      }
      function syncBooleanAttribute(fromElement, toElement, attributeName) {
        if (fromElement[attributeName] !== toElement[attributeName]) {
          fromElement[attributeName] = toElement[attributeName];
          if (fromElement[attributeName]) {
            fromElement.setAttribute(attributeName, '');
          } else {
            fromElement.removeAttribute(attributeName, '');
          }
        }
      }
      var specialElementHandlers = {
          OPTION: function (fromElement, toElement) {
            syncBooleanAttribute(fromElement, toElement, 'selected');
          },
          INPUT: function (fromElement, toElement) {
            syncBooleanAttribute(fromElement, toElement, 'checked');
            syncBooleanAttribute(fromElement, toElement, 'disabled');
            if (fromElement.value !== toElement.value) {
              fromElement.value = toElement.value;
            }
            if (!hasAttribute(toElement, null, 'value')) {
              fromElement.removeAttribute('value');
            }
          },
          TEXTAREA: function (fromElement, toElement) {
            var value = toElement.value;
            if (fromElement.value !== value) {
              fromElement.value = value;
            }
            var textNode = fromElement.firstChild;
            if (textNode) {
              var oldValue = textNode.nodeValue;
              if (oldValue == value || (!value && oldValue == fromElement.placeholder)) {
                return;
              }
              textNode.nodeValue = value;
            }
          },
          SELECT: function (fromElement, toElement) {
            if (!hasAttribute(toElement, null, 'multiple')) {
              for (var selectedIndex = 0, child = toElement.firstChild; child; ) {
                var nodeName = child.nodeName;
                if (nodeName && 'OPTION' === nodeName.toUpperCase()) {
                  if (hasAttribute(child, null, 'selected')) {
                    selectedIndex;
                    break;
                  }
                  selectedIndex++;
                }
                child = child.nextSibling;
              }
              fromElement.selectedIndex = selectedIndex;
            }
          },
        },
        ELEMENT_NODE = 1,
        TEXT_NODE = 3,
        COMMENT_NODE = 8;
      function noop() {}
      function defaultNodeKey(node) {
        return node.id;
      }
      var morphDom = (function (morphAttributes) {
        return function (fromNode, toNode, options) {
          if (!options) {
            options = {};
          }
          if ('string' == typeof toNode) {
            if ('#document' === fromNode.nodeName || 'HTML' === fromNode.nodeName) {
              var html = toNode;
              (toNode = ownerDocument.createElement('html')).innerHTML = html;
            } else {
              htmlFragment = toNode;
              if (!fragmentRange && ownerDocument.createRange) {
                (fragmentRange = ownerDocument.createRange()).selectNode(ownerDocument.body);
              }
              if (fragmentRange && fragmentRange.createContextualFragment) {
                fragment = fragmentRange.createContextualFragment(htmlFragment);
              } else {
                (fragment = ownerDocument.createElement('body')).innerHTML = htmlFragment;
              }
              toNode = fragment.childNodes[0];
            }
          }
          var htmlFragment,
            fragment,
            keyedRemovals,
            getNodeKey = options.getNodeKey || defaultNodeKey,
            onBeforeNodeAdded = options.onBeforeNodeAdded || noop,
            onNodeAdded = options.onNodeAdded || noop,
            onBeforeElementUpdated = options.onBeforeElUpdated || noop,
            onElementUpdated = options.onElUpdated || noop,
            onBeforeNodeDiscarded = options.onBeforeNodeDiscarded || noop,
            onNodeDiscarded = options.onNodeDiscarded || noop,
            onBeforeChildrenUpdated = options.onBeforeElChildrenUpdated || noop,
            childrenOnly = true === options.childrenOnly,
            keyedNodes = {};
          function queueKeyedRemoval(nodeKey) {
            if (keyedRemovals) {
              keyedRemovals.push(nodeKey);
            } else {
              keyedRemovals = [nodeKey];
            }
          }
          function removeNode(node, parent, skipKeyedNodes) {
            if (false !== onBeforeNodeDiscarded(node)) {
              if (parent) {
                parent.removeChild(node);
              }
              onNodeDiscarded(node);
              (function discardDescendants(node, skipKeyedNodes) {
                if (node.nodeType === ELEMENT_NODE) {
                  for (var child = node.firstChild; child; ) {
                    var nodeKey = void 0;
                    if (skipKeyedNodes && (nodeKey = getNodeKey(child))) {
                      queueKeyedRemoval(nodeKey);
                    } else {
                      onNodeDiscarded(child);
                      if (child.firstChild) {
                        discardDescendants(child, skipKeyedNodes);
                      }
                    }
                    child = child.nextSibling;
                  }
                }
              })(node, skipKeyedNodes);
            }
          }
          function handleAddedNode(node) {
            onNodeAdded(node);
            for (var child = node.firstChild; child; ) {
              var nextSibling = child.nextSibling,
                nodeKey = getNodeKey(child);
              if (nodeKey) {
                var matchedNode = keyedNodes[nodeKey];
                if (matchedNode && sameNodeName(child, matchedNode)) {
                  child.parentNode.replaceChild(matchedNode, child);
                  morphElement(matchedNode, child);
                }
              }
              handleAddedNode(child);
              child = nextSibling;
            }
          }
          function morphElement(fromElement, toElement, childrenOnly) {
            var fromKey,
              toKey = getNodeKey(toElement);
            if (toKey) {
              delete keyedNodes[toKey];
            }
            if (!toNode.isSameNode || !toNode.isSameNode(fromNode)) {
              if (!childrenOnly) {
                if (false === onBeforeElementUpdated(fromElement, toElement)) {
                  return;
                }
                morphAttributes(fromElement, toElement);
                onElementUpdated(fromElement);
                if (false === onBeforeChildrenUpdated(fromElement, toElement)) {
                  return;
                }
              }
              if ('TEXTAREA' !== fromElement.nodeName) {
                var toChildKey,
                  fromNextSibling,
                  toNextSibling,
                  matchedNode,
                  toChild = toElement.firstChild,
                  fromChild = fromElement.firstChild;
                e: for (; toChild; ) {
                  for (
                    toNextSibling = toChild.nextSibling, toChildKey = getNodeKey(toChild);
                    fromChild;
                  ) {
                    fromNextSibling = fromChild.nextSibling;
                    if (toChild.isSameNode && toChild.isSameNode(fromChild)) {
                      toChild = toNextSibling;
                      fromChild = fromNextSibling;
                      continue e;
                    }
                    fromKey = getNodeKey(fromChild);
                    var fromNodeType = fromChild.nodeType,
                      compatible = void 0;
                    if (fromNodeType === toChild.nodeType) {
                      if (fromNodeType === ELEMENT_NODE) {
                        if (toChildKey) {
                          if (toChildKey !== fromKey) {
                            if ((matchedNode = keyedNodes[toChildKey])) {
                              if (fromChild.nextSibling === matchedNode) {
                                compatible = false;
                              } else {
                                fromElement.insertBefore(matchedNode, fromChild);
                                fromNextSibling = fromChild.nextSibling;
                                if (fromKey) {
                                  queueKeyedRemoval(fromKey);
                                } else {
                                  removeNode(fromChild, fromElement, true);
                                }
                                fromChild = matchedNode;
                              }
                            } else {
                              compatible = false;
                            }
                          }
                        } else {
                          if (fromKey) {
                            compatible = false;
                          }
                        }
                        if (
                          (compatible = false !== compatible && sameNodeName(fromChild, toChild))
                        ) {
                          if ('svg' == fromChild.tagName && 'svg' == toChild.tagName) {
                            compatible = fromChild.innerHTML == toChild.innerHTML;
                          } else {
                            morphElement(fromChild, toChild);
                          }
                        }
                      } else {
                        if (!(fromNodeType !== TEXT_NODE && fromNodeType != COMMENT_NODE)) {
                          compatible = true;
                          if (fromChild.nodeValue !== toChild.nodeValue) {
                            fromChild.nodeValue = toChild.nodeValue;
                          }
                        }
                      }
                    }
                    if (compatible) {
                      toChild = toNextSibling;
                      fromChild = fromNextSibling;
                      continue e;
                    }
                    if (fromKey) {
                      queueKeyedRemoval(fromKey);
                    } else {
                      removeNode(fromChild, fromElement, true);
                    }
                    fromChild = fromNextSibling;
                  }
                  if (
                    toChildKey &&
                    (matchedNode = keyedNodes[toChildKey]) &&
                    sameNodeName(matchedNode, toChild)
                  ) {
                    fromElement.appendChild(matchedNode);
                    morphElement(matchedNode, toChild);
                  } else {
                    var addedNode = onBeforeNodeAdded(toChild);
                    if (false !== addedNode) {
                      if (addedNode) {
                        toChild = addedNode;
                      }
                      if (toChild.actualize) {
                        toChild = toChild.actualize(fromElement.ownerDocument || ownerDocument);
                      }
                      fromElement.appendChild(toChild);
                      handleAddedNode(toChild);
                    }
                  }
                  toChild = toNextSibling;
                  fromChild = fromNextSibling;
                }
                for (; fromChild; ) {
                  fromNextSibling = fromChild.nextSibling;
                  if ((fromKey = getNodeKey(fromChild))) {
                    queueKeyedRemoval(fromKey);
                  } else {
                    removeNode(fromChild, fromElement, true);
                  }
                  fromChild = fromNextSibling;
                }
              }
              var specialHandler = specialElementHandlers[fromElement.nodeName];
              if (specialHandler) {
                specialHandler(fromElement, toElement);
              }
            }
          }
          !(function indexKeyedNodes(node) {
            if (node.nodeType === ELEMENT_NODE) {
              for (var child = node.firstChild; child; ) {
                var nodeKey = getNodeKey(child);
                if (nodeKey) {
                  keyedNodes[nodeKey] = child;
                }
                indexKeyedNodes(child);
                child = child.nextSibling;
              }
            }
          })(fromNode);
          var replacementTagName,
            replacementNamespace,
            morphedNode = fromNode,
            fromNodeType = morphedNode.nodeType,
            toNodeType = toNode.nodeType;
          if (!childrenOnly) {
            if (fromNodeType === ELEMENT_NODE) {
              if (toNodeType === ELEMENT_NODE) {
                if (!sameNodeName(fromNode, toNode)) {
                  onNodeDiscarded(fromNode);
                  morphedNode = (function (sourceNode, targetNode) {
                    for (var child = sourceNode.firstChild; child; ) {
                      var nextSibling = child.nextSibling;
                      targetNode.appendChild(child);
                      child = nextSibling;
                    }
                    return targetNode;
                  })(
                    fromNode,
                    ((replacementTagName = toNode.nodeName),
                    (replacementNamespace = toNode.namespaceURI) &&
                    replacementNamespace !== HTML_NAMESPACE
                      ? ownerDocument.createElementNS(replacementNamespace, replacementTagName)
                      : ownerDocument.createElement(replacementTagName)),
                  );
                }
              } else {
                morphedNode = toNode;
              }
            } else {
              if (fromNodeType === TEXT_NODE || fromNodeType === COMMENT_NODE) {
                if (toNodeType === fromNodeType) {
                  if (morphedNode.nodeValue !== toNode.nodeValue) {
                    morphedNode.nodeValue = toNode.nodeValue;
                  }
                  return morphedNode;
                }
                morphedNode = toNode;
              }
            }
          }
          if (morphedNode === toNode) {
            onNodeDiscarded(fromNode);
          } else {
            morphElement(morphedNode, toNode, childrenOnly);
            if (keyedRemovals) {
              for (
                var removalIndex = 0, removalCount = keyedRemovals.length;
                removalIndex < removalCount;
                removalIndex++
              ) {
                var discardedNode = keyedNodes[keyedRemovals[removalIndex]];
                if (discardedNode) {
                  removeNode(discardedNode, discardedNode.parentNode, false);
                }
              }
            }
          }
          if (!childrenOnly && morphedNode !== fromNode && fromNode.parentNode) {
            if (morphedNode.actualize) {
              morphedNode = morphedNode.actualize(fromNode.ownerDocument || ownerDocument);
            }
            fromNode.parentNode.replaceChild(morphedNode, fromNode);
          }
          return morphedNode;
        };
      })(function (fromElement, toElement) {
        var attributeIndex,
          attribute,
          attributeName,
          namespace,
          attributeValue,
          attributes = toElement.attributes;
        for (attributeIndex = attributes.length - 1; attributeIndex >= 0; --attributeIndex) {
          attributeName = (attribute = attributes[attributeIndex]).name;
          namespace = attribute.namespaceURI;
          attributeValue = attribute.value;
          if (namespace) {
            attributeName = attribute.localName || attributeName;
            if (fromElement.getAttributeNS(namespace, attributeName) !== attributeValue) {
              fromElement.setAttributeNS(namespace, attributeName, attributeValue);
            }
          } else {
            if (fromElement.getAttribute(attributeName) !== attributeValue) {
              fromElement.setAttribute(attributeName, attributeValue);
            }
          }
        }
        for (
          attributeIndex = (attributes = fromElement.attributes).length - 1;
          attributeIndex >= 0;
          --attributeIndex
        ) {
          if (false !== (attribute = attributes[attributeIndex]).specified) {
            attributeName = attribute.name;
            if ((namespace = attribute.namespaceURI)) {
              attributeName = attribute.localName || attributeName;
              if (!hasAttribute(toElement, namespace, attributeName)) {
                fromElement.removeAttributeNS(namespace, attributeName);
              }
            } else {
              if (!hasAttribute(toElement, null, attributeName)) {
                fromElement.removeAttribute(attributeName);
              }
            }
          }
        }
      });
      moduleRecord.exports = morphDom;
    },
  );
}
