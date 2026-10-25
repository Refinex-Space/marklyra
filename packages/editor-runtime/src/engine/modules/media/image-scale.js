// media/image-scale.
// SystemJS module 2e. Dependencies: 11.
$__System.registerDynamic('2e', ['11'], !0, function (requireModule, moduleExports, moduleRecord) {
  this || self;
  var utilities = requireModule('11');
  moduleExports.getImageScaleByElection = function (pathname) {
    if (!window.File || File.inBusyMode) return Promise.resolve(1);
    var fileSystem = reqnode('fs'),
      parse = reqnode('url').parse,
      dateInstance = new Date();
    function o(pngBytes) {
      for (var chunkOffset = 8; chunkOffset < (pngBytes || []).length; ) {
        var chunkTypeOffset = chunkOffset + 4,
          chunkDataOffset = chunkOffset + 8,
          chunkDataEnd = chunkOffset + 8 + pngBytes.readUInt32BE(chunkOffset),
          nextChunkOffset = chunkDataEnd + 4,
          chunkType = pngBytes.toString('ascii', chunkTypeOffset, chunkDataOffset),
          slice = pngBytes.slice(chunkDataOffset, chunkDataEnd);
        if ('pHYs' == chunkType) {
          var pixelsPerMeter = slice.readUInt32BE(0);
          return (
            console.debug('took ' + (new Date() - dateInstance) + 'ms'),
            Math.round(0.0254 * pixelsPerMeter) / 72 || 1
          );
        }
        if (new Date() - dateInstance > 1e3) return 1;
        chunkOffset = nextChunkOffset;
      }
      return 1;
    }
    function a(jpegBytes) {
      for (var hasStartMarker, segmentOffset = 0; segmentOffset < jpegBytes.length - 4; ) {
        var markerPrefix = jpegBytes[segmentOffset],
          markerType = jpegBytes[segmentOffset + 1];
        if (((segmentOffset += 2), 255 != markerPrefix)) return 1;
        if (!hasStartMarker) {
          if ((hasStartMarker = 216 == markerType)) continue;
          return 1;
        }
        if (224 == markerType) {
          var densityUnitOffset = segmentOffset + 2 + 5 + 1 + 1;
          return 0 != jpegBytes[densityUnitOffset] && 1 != jpegBytes[densityUnitOffset]
            ? 1
            : Math.round(
                jpegBytes.slice(densityUnitOffset + 1, densityUnitOffset + 1 + 2).readUInt16BE(0) /
                  72,
              );
        }
        if (218 == markerType) return 1;
        if (new Date() - dateInstance > 1e3) return 1;
        segmentOffset += jpegBytes.slice(segmentOffset, segmentOffset + 2).readUInt16BE(0);
      }
      return 1;
    }
    return new Promise(function (resolvePromise, rejectPromise) {
      try {
        if (/^file:/.exec(pathname)) {
          (pathname = parse(pathname).pathname),
            (pathname = utilities.decodeFromEscapedURL(pathname));
          var text = (/\.([^.\\\/]+)$/.exec(pathname) || [])[1] || '';
          fileSystem.readFile(pathname, function (inputError, fileContent) {
            inputError || !fileContent
              ? resolvePromise(1)
              : 'png' == text.toLowerCase()
                ? resolvePromise(o(fileContent))
                : ('jpg' != text.toLowerCase() && 'jpeg' != text.toLowerCase()) ||
                  resolvePromise(a(fileContent));
          });
        } else
          /^https?:/.exec(pathname) &&
            JSBridge.invoke('url.request', pathname).then((result) => {
              if (result) {
                var imageBytes,
                  { type: imageFormat, data: items } = result;
                imageFormat ||
                  ((pathname = parse(pathname).pathname),
                  (pathname = utilities.decodeFromEscapedURL(pathname)),
                  (imageFormat = (/\.([^.\\\/]+)$/.exec(pathname) || [])[1] || '')),
                  /png/i.exec(imageFormat)
                    ? ((imageBytes = Buffer.concat(
                        items
                          .filter(function (item) {
                            return !!item;
                          })
                          .map(function (item) {
                            return Buffer.from(item);
                          }),
                      )),
                      resolvePromise(o(imageBytes)))
                    : /jpe?g/i.exec(imageFormat) &&
                      ((imageBytes = Buffer.from(items[0])), resolvePromise(a(imageBytes)));
              } else resolvePromise(1);
            });
      } catch (error) {
        resolvePromise(1);
      }
    });
  };
});
