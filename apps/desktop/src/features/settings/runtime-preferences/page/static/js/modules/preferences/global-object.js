// Webpack module 32: global-object.
// Registration order and sparse array indices are defined in bundles.json.
(function (e, t) {
  var n;
  n = (function () {
    return this;
  })();
  try {
    n = n || new Function('return this')();
  } catch (a) {
    'object' === typeof window && (n = window);
  }
  e.exports = n;
});
