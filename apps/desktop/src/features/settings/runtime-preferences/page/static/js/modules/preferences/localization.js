// Webpack module 1: localization.
// Registration order and sparse array indices are defined in bundles.json.
(function (moduleRecord, moduleExports, webpackRequire) {
  'use strict';
  webpackRequire.d(moduleExports, 'a', function () {
    return a;
  });
  var a = function (text, dictionaryGroup) {
    return text
      ? window.Dict
        ? ((text = text.replace(/([^\\])\\n/g, '$1\n').replace(/\\\\n/, '&#92;n')),
          /((\.\.\.)|(\u2026))$/.exec(text)
            ? window.Dict.get(text.replace(/((\.\.\.)|(\u2026))$/, ''), dictionaryGroup)
                .replace(/\n/g, ' ')
                .replace(/&#92;/g, '\\') + '\u2026'
            : window.Dict.get(text, dictionaryGroup).replace(/\n/g, ' ').replace(/&#92;/g, '\\'))
        : text
      : '';
  };
});
