// Webpack module 24: paper-sizes.
// Registration order and sparse array indices are defined in bundles.json.
(function (moduleRecord, moduleExports, webpackRequire) {
  'use strict';
  webpackRequire.d(moduleExports, 'a', function () {
    return paperSizes;
  });
  var paperSizes = {
    A5: { name: 'A5', pt: [420, 595], mm: [148, 210] },
    A4: { name: 'A4', pt: [595, 842], mm: [210, 297] },
    A3: { name: 'A3', pt: [842, 1191], mm: [297, 420] },
    Letter: { name: 'US Letter', pt: [612, 791], mm: [216, 279] },
    Legal: { name: 'US Legal', pt: [612, 1009], mm: [216, 356] },
    Tabloid: { name: 'Tabloid', pt: [791, 1225], mm: [279, 432] },
  };
});
