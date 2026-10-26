// Install this compatibility library in the supplied engine environment.
export default function installLibrariesIntersectionObserver(engineModules, vendorScope) {
  // libraries/intersection-observer.
  // Vendor adapter; version and local behavior are preserved.
  engineModules.define(
    'libraries/intersection-observer',
    [],
    false,
    function (requireModule, moduleExports, moduleRecord) {
      var restoreGlobals = engineModules.registry
        .get('runtime/global-helpers')
        .prepareGlobal(moduleRecord.id, null, null);
      (function (windowGlobal, documentGlobal) {
        'use strict';
        Object.defineProperty(IntersectionEntry, 'name', { value: 'i', configurable: true });
        Object.defineProperty(IntersectionObserverPolyfill, 'name', {
          value: 'r',
          configurable: true,
        });
        Object.defineProperty(addEvent, 'name', { value: 'o', configurable: true });
        Object.defineProperty(removeEvent, 'name', { value: 'a', configurable: true });
        Object.defineProperty(getBoundingClientRect, 'name', { value: 's', configurable: true });
        Object.defineProperty(containsDeep, 'name', { value: 'l', configurable: true });
        Object.defineProperty(getParentNode, 'name', { value: 'c', configurable: true });

        if (
          'IntersectionObserver' in windowGlobal &&
          'IntersectionObserverEntry' in windowGlobal &&
          'intersectionRatio' in windowGlobal.IntersectionObserverEntry.prototype
        ) {
          if (!('isIntersecting' in windowGlobal.IntersectionObserverEntry.prototype)) {
            Object.defineProperty(
              windowGlobal.IntersectionObserverEntry.prototype,
              'isIntersecting',
              {
                get: function () {
                  return this.intersectionRatio > 0;
                },
              },
            );
          }
        } else {
          var observerRegistry = [];
          IntersectionObserverPolyfill.prototype.THROTTLE_TIMEOUT = 100;
          IntersectionObserverPolyfill.prototype.POLL_INTERVAL = null;
          IntersectionObserverPolyfill.prototype.USE_MUTATION_OBSERVER = true;
          IntersectionObserverPolyfill.prototype.observe = function (target) {
            if (
              !this._observationTargets.some(function (observation) {
                return observation.element == target;
              })
            ) {
              if (!target || 1 != target.nodeType) {
                throw new Error('target must be an Element');
              }
              this._registerInstance();
              this._observationTargets.push({ element: target, entry: null });
              this._monitorIntersections();
              this._checkForIntersections();
            }
          };
          IntersectionObserverPolyfill.prototype.unobserve = function (target) {
            this._observationTargets = this._observationTargets.filter(function (observation) {
              return observation.element != target;
            });
            if (!this._observationTargets.length) {
              this._unmonitorIntersections();
              this._unregisterInstance();
            }
          };
          IntersectionObserverPolyfill.prototype.disconnect = function () {
            this._observationTargets = [];
            this._unmonitorIntersections();
            this._unregisterInstance();
          };
          IntersectionObserverPolyfill.prototype.takeRecords = function () {
            var entries = this._queuedEntries.slice();
            this._queuedEntries = [];
            return entries;
          };
          IntersectionObserverPolyfill.prototype._initThresholds = function (threshold) {
            var thresholds = threshold || [0];
            if (!Array.isArray(thresholds)) {
              thresholds = [thresholds];
            }
            return thresholds.sort().filter(function (value, index, values) {
              if ('number' != typeof value || isNaN(value) || value < 0 || value > 1) {
                throw new Error('threshold must be a number between 0 and 1 inclusively');
              }
              return value !== values[index - 1];
            });
          };
          IntersectionObserverPolyfill.prototype._parseRootMargin = function (rootMargin) {
            var margins = (rootMargin || '0px').split(/\s+/).map(function (margin) {
              var parts = /^(-?\d*\.?\d+)(px|%)$/.exec(margin);
              if (!parts) {
                throw new Error('rootMargin must be specified in pixels or percent');
              }
              return { value: parseFloat(parts[1]), unit: parts[2] };
            });
            margins[1] = margins[1] || margins[0];
            margins[2] = margins[2] || margins[0];
            margins[3] = margins[3] || margins[1];
            return margins;
          };
          IntersectionObserverPolyfill.prototype._monitorIntersections = function () {
            if (!this._monitoringIntersections) {
              this._monitoringIntersections = true;
              if (this.POLL_INTERVAL) {
                this._monitoringInterval = setInterval(
                  this._checkForIntersections,
                  this.POLL_INTERVAL,
                );
              } else {
                addEvent(windowGlobal, 'resize', this._checkForIntersections, true);
                addEvent(documentGlobal, 'scroll', this._checkForIntersections, true);
                if (this.USE_MUTATION_OBSERVER && 'MutationObserver' in windowGlobal) {
                  this._domObserver = new MutationObserver(this._checkForIntersections);
                  this._domObserver.observe(documentGlobal, {
                    attributes: true,
                    childList: true,
                    characterData: true,
                    subtree: true,
                  });
                }
              }
            }
          };
          IntersectionObserverPolyfill.prototype._unmonitorIntersections = function () {
            if (this._monitoringIntersections) {
              this._monitoringIntersections = false;
              clearInterval(this._monitoringInterval);
              this._monitoringInterval = null;
              removeEvent(windowGlobal, 'resize', this._checkForIntersections, true);
              removeEvent(documentGlobal, 'scroll', this._checkForIntersections, true);
              if (this._domObserver) {
                this._domObserver.disconnect();
                this._domObserver = null;
              }
            }
          };
          IntersectionObserverPolyfill.prototype._checkForIntersections = function () {
            var rootIsInDom = this._rootIsInDom(),
              rootRect = rootIsInDom
                ? this._getRootRect()
                : { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
            this._observationTargets.forEach(function (observation) {
              var target = observation.element,
                targetRect = getBoundingClientRect(target),
                rootContainsTarget = this._rootContainsTarget(target),
                oldEntry = observation.entry,
                intersectionRect =
                  rootIsInDom &&
                  rootContainsTarget &&
                  this._computeTargetAndRootIntersection(target, rootRect),
                newEntry = (observation.entry = new IntersectionEntry({
                  time: windowGlobal.performance && performance.now && performance.now(),
                  target: target,
                  boundingClientRect: targetRect,
                  rootBounds: rootRect,
                  intersectionRect: intersectionRect,
                }));
              if (oldEntry) {
                if (rootIsInDom && rootContainsTarget) {
                  if (this._hasCrossedThreshold(oldEntry, newEntry)) {
                    this._queuedEntries.push(newEntry);
                  }
                } else {
                  if (oldEntry && oldEntry.isIntersecting) {
                    this._queuedEntries.push(newEntry);
                  }
                }
              } else {
                this._queuedEntries.push(newEntry);
              }
            }, this);
            if (this._queuedEntries.length) {
              this._callback(this.takeRecords(), this);
            }
          };
          IntersectionObserverPolyfill.prototype._computeTargetAndRootIntersection = function (
            target,
            rootRect,
          ) {
            if ('none' != windowGlobal.getComputedStyle(target).display) {
              for (
                var ancestorRect,
                  previousRect,
                  top,
                  bottom,
                  left,
                  right,
                  width,
                  height,
                  intersectionRect = getBoundingClientRect(target),
                  parent = getParentNode(target),
                  atRoot = false;
                !atRoot;
              ) {
                var parentRect = null,
                  parentStyle = 1 == parent.nodeType ? windowGlobal.getComputedStyle(parent) : {};
                if ('none' == parentStyle.display) {
                  return;
                }
                if (parent == this.root || parent == documentGlobal) {
                  atRoot = true;
                  parentRect = rootRect;
                } else {
                  if (
                    parent != documentGlobal.body &&
                    parent != documentGlobal.documentElement &&
                    'visible' != parentStyle.overflow
                  ) {
                    parentRect = getBoundingClientRect(parent);
                  }
                }
                if (
                  parentRect &&
                  ((ancestorRect = parentRect),
                  (previousRect = intersectionRect),
                  (top = Math.max(ancestorRect.top, previousRect.top)),
                  (bottom = Math.min(ancestorRect.bottom, previousRect.bottom)),
                  (left = Math.max(ancestorRect.left, previousRect.left)),
                  (right = Math.min(ancestorRect.right, previousRect.right)),
                  (height = bottom - top),
                  !(intersectionRect = (width = right - left) >= 0 &&
                    height >= 0 && {
                      top: top,
                      bottom: bottom,
                      left: left,
                      right: right,
                      width: width,
                      height: height,
                    }))
                ) {
                  break;
                }
                parent = getParentNode(parent);
              }
              return intersectionRect;
            }
          };
          IntersectionObserverPolyfill.prototype._getRootRect = function () {
            var rootRect;
            if (this.root) {
              rootRect = getBoundingClientRect(this.root);
            } else {
              var documentElement = documentGlobal.documentElement,
                body = documentGlobal.body;
              rootRect = {
                top: 0,
                left: 0,
                right: documentElement.clientWidth || body.clientWidth,
                width: documentElement.clientWidth || body.clientWidth,
                bottom: documentElement.clientHeight || body.clientHeight,
                height: documentElement.clientHeight || body.clientHeight,
              };
            }
            return this._expandRectByRootMargin(rootRect);
          };
          IntersectionObserverPolyfill.prototype._expandRectByRootMargin = function (rect) {
            var margins = this._rootMarginValues.map(function (margin, sideIndex) {
                if ('px' == margin.unit) {
                  return margin.value;
                } else {
                  return (margin.value * (sideIndex % 2 ? rect.width : rect.height)) / 100;
                }
              }),
              expandedRect = {
                top: rect.top - margins[0],
                right: rect.right + margins[1],
                bottom: rect.bottom + margins[2],
                left: rect.left - margins[3],
              };
            expandedRect.width = expandedRect.right - expandedRect.left;
            expandedRect.height = expandedRect.bottom - expandedRect.top;
            return expandedRect;
          };
          IntersectionObserverPolyfill.prototype._hasCrossedThreshold = function (
            oldEntry,
            newEntry,
          ) {
            var oldRatio =
                oldEntry && oldEntry.isIntersecting ? oldEntry.intersectionRatio || 0 : -1,
              newRatio = newEntry.isIntersecting ? newEntry.intersectionRatio || 0 : -1;
            if (oldRatio !== newRatio) {
              for (
                var thresholdIndex = 0;
                thresholdIndex < this.thresholds.length;
                thresholdIndex++
              ) {
                var threshold = this.thresholds[thresholdIndex];
                if (
                  threshold == oldRatio ||
                  threshold == newRatio ||
                  threshold < oldRatio != threshold < newRatio
                ) {
                  return true;
                }
              }
            }
          };
          IntersectionObserverPolyfill.prototype._rootIsInDom = function () {
            return !this.root || containsDeep(documentGlobal, this.root);
          };
          IntersectionObserverPolyfill.prototype._rootContainsTarget = function (target) {
            return containsDeep(this.root || documentGlobal, target);
          };
          IntersectionObserverPolyfill.prototype._registerInstance = function () {
            if (observerRegistry.indexOf(this) < 0) {
              observerRegistry.push(this);
            }
          };
          IntersectionObserverPolyfill.prototype._unregisterInstance = function () {
            var observerIndex = observerRegistry.indexOf(this);
            if (-1 != observerIndex) {
              observerRegistry.splice(observerIndex, 1);
            }
          };
          windowGlobal.IntersectionObserver = IntersectionObserverPolyfill;
          windowGlobal.IntersectionObserverEntry = IntersectionEntry;
        }
        function IntersectionEntry(entry) {
          this.time = entry.time;
          this.target = entry.target;
          this.rootBounds = entry.rootBounds;
          this.boundingClientRect = entry.boundingClientRect;
          this.intersectionRect = entry.intersectionRect || {
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            width: 0,
            height: 0,
          };
          this.isIntersecting = !!entry.intersectionRect;
          var targetRect = this.boundingClientRect,
            targetArea = targetRect.width * targetRect.height,
            intersectionRect = this.intersectionRect,
            intersectionArea = intersectionRect.width * intersectionRect.height;
          this.intersectionRatio = targetArea
            ? Number((intersectionArea / targetArea).toFixed(4))
            : this.isIntersecting
              ? 1
              : 0;
        }
        function IntersectionObserverPolyfill(callback, options) {
          var checkIntersections,
            throttleTimeout,
            timerId,
            observerOptions = options || {};
          if ('function' != typeof callback) {
            throw new Error('callback must be a function');
          }
          if (observerOptions.root && 1 != observerOptions.root.nodeType) {
            throw new Error('root must be an Element');
          }
          this._checkForIntersections =
            ((checkIntersections = this._checkForIntersections.bind(this)),
            (throttleTimeout = this.THROTTLE_TIMEOUT),
            (timerId = null),
            function () {
              if (!timerId) {
                timerId = setTimeout(function () {
                  checkIntersections();
                  timerId = null;
                }, throttleTimeout);
              }
            });
          this._callback = callback;
          this._observationTargets = [];
          this._queuedEntries = [];
          this._rootMarginValues = this._parseRootMargin(observerOptions.rootMargin);
          this.thresholds = this._initThresholds(observerOptions.threshold);
          this.root = observerOptions.root || null;
          this.rootMargin = this._rootMarginValues
            .map(function (margin) {
              return margin.value + margin.unit;
            })
            .join(' ');
        }
        function addEvent(target, type, callback, capture) {
          if ('function' == typeof target.addEventListener) {
            target.addEventListener(type, callback, capture || false);
          } else {
            if ('function' == typeof target.attachEvent) {
              target.attachEvent('on' + type, callback);
            }
          }
        }
        function removeEvent(target, type, callback, capture) {
          if ('function' == typeof target.removeEventListener) {
            target.removeEventListener(type, callback, capture || false);
          } else {
            if ('function' == typeof target.detatchEvent) {
              target.detatchEvent('on' + type, callback);
            }
          }
        }
        function getBoundingClientRect(element) {
          var rect;
          try {
            rect = element.getBoundingClientRect();
          } catch (error) {}
          if (rect) {
            if (!(rect.width && rect.height)) {
              rect = {
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                left: rect.left,
                width: rect.right - rect.left,
                height: rect.bottom - rect.top,
              };
            }
            return rect;
          } else {
            return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
          }
        }
        function containsDeep(parent, child) {
          for (var node = child; node; ) {
            if (node == parent) {
              return true;
            }
            node = getParentNode(node);
          }
          return false;
        }
        function getParentNode(node) {
          var parent = node.parentNode;
          if (parent && 11 == parent.nodeType && parent.host) {
            return parent.host;
          } else {
            if (parent && parent.assignedSlot) {
              return parent.assignedSlot.parentNode;
            } else {
              return parent;
            }
          }
        }
      })(window, document);
      return restoreGlobals();
    },
  );
}
