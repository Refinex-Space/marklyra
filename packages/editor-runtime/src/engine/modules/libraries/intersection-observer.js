// libraries/intersection-observer.
// SystemJS module 5b. Dependencies: none.
$__System.registerDynamic('5b', [], !1, function (e, t, n) {
  var i = $__System.registry.get('@@global-helpers').prepareGlobal(n.id, null, null);
  return (
    (function (e, t) {
      'use strict';
      if (
        'IntersectionObserver' in e &&
        'IntersectionObserverEntry' in e &&
        'intersectionRatio' in e.IntersectionObserverEntry.prototype
      )
        'isIntersecting' in e.IntersectionObserverEntry.prototype ||
          Object.defineProperty(e.IntersectionObserverEntry.prototype, 'isIntersecting', {
            get: function () {
              return this.intersectionRatio > 0;
            },
          });
      else {
        var n = [];
        (r.prototype.THROTTLE_TIMEOUT = 100),
          (r.prototype.POLL_INTERVAL = null),
          (r.prototype.USE_MUTATION_OBSERVER = !0),
          (r.prototype.observe = function (e) {
            if (
              !this._observationTargets.some(function (t) {
                return t.element == e;
              })
            ) {
              if (!e || 1 != e.nodeType) throw new Error('target must be an Element');
              this._registerInstance(),
                this._observationTargets.push({ element: e, entry: null }),
                this._monitorIntersections(),
                this._checkForIntersections();
            }
          }),
          (r.prototype.unobserve = function (e) {
            (this._observationTargets = this._observationTargets.filter(function (t) {
              return t.element != e;
            })),
              this._observationTargets.length ||
                (this._unmonitorIntersections(), this._unregisterInstance());
          }),
          (r.prototype.disconnect = function () {
            (this._observationTargets = []),
              this._unmonitorIntersections(),
              this._unregisterInstance();
          }),
          (r.prototype.takeRecords = function () {
            var e = this._queuedEntries.slice();
            return (this._queuedEntries = []), e;
          }),
          (r.prototype._initThresholds = function (e) {
            var t = e || [0];
            return (
              Array.isArray(t) || (t = [t]),
              t.sort().filter(function (e, t, n) {
                if ('number' != typeof e || isNaN(e) || e < 0 || e > 1)
                  throw new Error('threshold must be a number between 0 and 1 inclusively');
                return e !== n[t - 1];
              })
            );
          }),
          (r.prototype._parseRootMargin = function (e) {
            var t = (e || '0px').split(/\s+/).map(function (e) {
              var t = /^(-?\d*\.?\d+)(px|%)$/.exec(e);
              if (!t) throw new Error('rootMargin must be specified in pixels or percent');
              return { value: parseFloat(t[1]), unit: t[2] };
            });
            return (t[1] = t[1] || t[0]), (t[2] = t[2] || t[0]), (t[3] = t[3] || t[1]), t;
          }),
          (r.prototype._monitorIntersections = function () {
            this._monitoringIntersections ||
              ((this._monitoringIntersections = !0),
              this.POLL_INTERVAL
                ? (this._monitoringInterval = setInterval(
                    this._checkForIntersections,
                    this.POLL_INTERVAL,
                  ))
                : (o(e, 'resize', this._checkForIntersections, !0),
                  o(t, 'scroll', this._checkForIntersections, !0),
                  this.USE_MUTATION_OBSERVER &&
                    'MutationObserver' in e &&
                    ((this._domObserver = new MutationObserver(this._checkForIntersections)),
                    this._domObserver.observe(t, {
                      attributes: !0,
                      childList: !0,
                      characterData: !0,
                      subtree: !0,
                    }))));
          }),
          (r.prototype._unmonitorIntersections = function () {
            this._monitoringIntersections &&
              ((this._monitoringIntersections = !1),
              clearInterval(this._monitoringInterval),
              (this._monitoringInterval = null),
              a(e, 'resize', this._checkForIntersections, !0),
              a(t, 'scroll', this._checkForIntersections, !0),
              this._domObserver && (this._domObserver.disconnect(), (this._domObserver = null)));
          }),
          (r.prototype._checkForIntersections = function () {
            var t = this._rootIsInDom(),
              n = t
                ? this._getRootRect()
                : { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
            this._observationTargets.forEach(function (r) {
              var o = r.element,
                a = s(o),
                l = this._rootContainsTarget(o),
                c = r.entry,
                d = t && l && this._computeTargetAndRootIntersection(o, n),
                u = (r.entry = new i({
                  time: e.performance && performance.now && performance.now(),
                  target: o,
                  boundingClientRect: a,
                  rootBounds: n,
                  intersectionRect: d,
                }));
              c
                ? t && l
                  ? this._hasCrossedThreshold(c, u) && this._queuedEntries.push(u)
                  : c && c.isIntersecting && this._queuedEntries.push(u)
                : this._queuedEntries.push(u);
            }, this),
              this._queuedEntries.length && this._callback(this.takeRecords(), this);
          }),
          (r.prototype._computeTargetAndRootIntersection = function (n, i) {
            if ('none' != e.getComputedStyle(n).display) {
              for (var r, o, a, l, d, u, h, p, f = s(n), m = c(n), g = !1; !g; ) {
                var v = null,
                  y = 1 == m.nodeType ? e.getComputedStyle(m) : {};
                if ('none' == y.display) return;
                if (
                  (m == this.root || m == t
                    ? ((g = !0), (v = i))
                    : m != t.body &&
                      m != t.documentElement &&
                      'visible' != y.overflow &&
                      (v = s(m)),
                  v &&
                    ((r = v),
                    (o = f),
                    (a = Math.max(r.top, o.top)),
                    (l = Math.min(r.bottom, o.bottom)),
                    (d = Math.max(r.left, o.left)),
                    (u = Math.min(r.right, o.right)),
                    (p = l - a),
                    !(f = (h = u - d) >= 0 &&
                      p >= 0 && { top: a, bottom: l, left: d, right: u, width: h, height: p })))
                )
                  break;
                m = c(m);
              }
              return f;
            }
          }),
          (r.prototype._getRootRect = function () {
            var e;
            if (this.root) e = s(this.root);
            else {
              var n = t.documentElement,
                i = t.body;
              e = {
                top: 0,
                left: 0,
                right: n.clientWidth || i.clientWidth,
                width: n.clientWidth || i.clientWidth,
                bottom: n.clientHeight || i.clientHeight,
                height: n.clientHeight || i.clientHeight,
              };
            }
            return this._expandRectByRootMargin(e);
          }),
          (r.prototype._expandRectByRootMargin = function (e) {
            var t = this._rootMarginValues.map(function (t, n) {
                return 'px' == t.unit ? t.value : (t.value * (n % 2 ? e.width : e.height)) / 100;
              }),
              n = {
                top: e.top - t[0],
                right: e.right + t[1],
                bottom: e.bottom + t[2],
                left: e.left - t[3],
              };
            return (n.width = n.right - n.left), (n.height = n.bottom - n.top), n;
          }),
          (r.prototype._hasCrossedThreshold = function (e, t) {
            var n = e && e.isIntersecting ? e.intersectionRatio || 0 : -1,
              i = t.isIntersecting ? t.intersectionRatio || 0 : -1;
            if (n !== i)
              for (var r = 0; r < this.thresholds.length; r++) {
                var o = this.thresholds[r];
                if (o == n || o == i || o < n != o < i) return !0;
              }
          }),
          (r.prototype._rootIsInDom = function () {
            return !this.root || l(t, this.root);
          }),
          (r.prototype._rootContainsTarget = function (e) {
            return l(this.root || t, e);
          }),
          (r.prototype._registerInstance = function () {
            n.indexOf(this) < 0 && n.push(this);
          }),
          (r.prototype._unregisterInstance = function () {
            var e = n.indexOf(this);
            -1 != e && n.splice(e, 1);
          }),
          (e.IntersectionObserver = r),
          (e.IntersectionObserverEntry = i);
      }
      function i(e) {
        (this.time = e.time),
          (this.target = e.target),
          (this.rootBounds = e.rootBounds),
          (this.boundingClientRect = e.boundingClientRect),
          (this.intersectionRect = e.intersectionRect || {
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            width: 0,
            height: 0,
          }),
          (this.isIntersecting = !!e.intersectionRect);
        var t = this.boundingClientRect,
          n = t.width * t.height,
          i = this.intersectionRect,
          r = i.width * i.height;
        this.intersectionRatio = n ? Number((r / n).toFixed(4)) : this.isIntersecting ? 1 : 0;
      }
      function r(e, t) {
        var n,
          i,
          r,
          o = t || {};
        if ('function' != typeof e) throw new Error('callback must be a function');
        if (o.root && 1 != o.root.nodeType) throw new Error('root must be an Element');
        (this._checkForIntersections =
          ((n = this._checkForIntersections.bind(this)),
          (i = this.THROTTLE_TIMEOUT),
          (r = null),
          function () {
            r ||
              (r = setTimeout(function () {
                n(), (r = null);
              }, i));
          })),
          (this._callback = e),
          (this._observationTargets = []),
          (this._queuedEntries = []),
          (this._rootMarginValues = this._parseRootMargin(o.rootMargin)),
          (this.thresholds = this._initThresholds(o.threshold)),
          (this.root = o.root || null),
          (this.rootMargin = this._rootMarginValues
            .map(function (e) {
              return e.value + e.unit;
            })
            .join(' '));
      }
      function o(e, t, n, i) {
        'function' == typeof e.addEventListener
          ? e.addEventListener(t, n, i || !1)
          : 'function' == typeof e.attachEvent && e.attachEvent('on' + t, n);
      }
      function a(e, t, n, i) {
        'function' == typeof e.removeEventListener
          ? e.removeEventListener(t, n, i || !1)
          : 'function' == typeof e.detatchEvent && e.detatchEvent('on' + t, n);
      }
      function s(e) {
        var t;
        try {
          t = e.getBoundingClientRect();
        } catch (e) {}
        return t
          ? ((t.width && t.height) ||
              (t = {
                top: t.top,
                right: t.right,
                bottom: t.bottom,
                left: t.left,
                width: t.right - t.left,
                height: t.bottom - t.top,
              }),
            t)
          : { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
      }
      function l(e, t) {
        for (var n = t; n; ) {
          if (n == e) return !0;
          n = c(n);
        }
        return !1;
      }
      function c(e) {
        var t = e.parentNode;
        return t && 11 == t.nodeType && t.host
          ? t.host
          : t && t.assignedSlot
            ? t.assignedSlot.parentNode
            : t;
      }
    })(window, document),
    i()
  );
});
