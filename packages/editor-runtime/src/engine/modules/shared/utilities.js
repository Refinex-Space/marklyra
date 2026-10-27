// shared/utilities.
export default function initializeSharedUtilities(requireModule, moduleExports, moduleRecord) {
  'use strict';
  if (!this) {
    self;
  }
  var whitespaceTextPattern = /^[\s\u200b]+$/,
    isEmptyValue = function (value) {
      return null == value || void 0 == value || '' === value || '​' === value;
    },
    escapeHtmlText = function (inputValue, escapeMarkdown, unusedParameter3) {
      if (null == inputValue || void 0 == inputValue || '' == inputValue) {
        return '';
      } else {
        if ('string' != typeof inputValue && 'number' != typeof inputValue) {
          return inputValue;
        } else {
          inputValue = (inputValue + '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
          if (escapeMarkdown) {
            inputValue = escapeMarkdownText(inputValue);
          }
          return inputValue;
        }
      }
    },
    escapeMarkdownText = function (text) {
      return text.replace(/[[\]~`*\\$<]/g, '\\$&').replace(/(\b_)|(_(?=\s))/g, '\\$&');
    },
    urlPattern = /^\s*(([\w-_]+:\/\/)|(www\.)|\w*\/)[\w-.\/?%&=:@]*/i,
    imageUrlPattern =
      /^\s*(([\w-_]+:\/\/)|(www\.)|\w*\/)?[\w-.\/?%&=:@]+(\.jpe?g|png|gif|webp|svg|tiff)/i,
    replaceWholeWord = function (text, searchPattern, replacement) {
      return text.replace(new RegExp('\\b' + searchPattern + '\\b', 'gi'), replacement);
    },
    formatTime = function (date, includeSeconds) {
      var hours = date.getHours() + '',
        minutes = date.getMinutes() + '',
        seconds = date.getSeconds() + '';
      return (
        (hours.length < 2 ? '0' : '') +
        hours +
        ':' +
        (minutes.length < 2 ? '0' : '') +
        minutes +
        (includeSeconds ? (seconds.length < 2 ? '0' : '') + seconds : '')
      );
    },
    resolveRelativePath = function (text, inputText, baseIsDirectory) {
      if (!text) {
        return inputText;
      }
      inputText = inputText || '';
      var parts = text.split(/[\\\/]/g),
        currentParts = inputText.split(/[\\\/]/g);
      if (!baseIsDirectory) {
        parts.pop();
      }
      for (var itemIndex = 0; itemIndex < currentParts.length; itemIndex++) {
        if ('.' != currentParts[itemIndex]) {
          if ('..' == currentParts[itemIndex]) {
            parts.pop();
          } else {
            parts.push(currentParts[itemIndex]);
          }
        }
      }
      return parts.join('/');
    },
    escapeRegexPattern = function (text) {
      return text.replace(/[\-\\\{\}\*\+\?\|\^\$\.\[\]\(\)\#]/g, '\\$&');
    };
  String.prototype.replaceExact = function (searchPattern, replacement) {
    return replaceWholeWord(this, searchPattern, replacement);
  };
  String.prototype.repeat = function (repeatCount) {
    if (!$.isNumeric(repeatCount) || repeatCount < 0) {
      repeatCount = 0;
    }
    return new Array(repeatCount - 0 + 1).join(this);
  };
  String.prototype.startsWith =
    String.prototype.startsWith ||
    function (prefix) {
      return this.match('^' + prefix) === prefix;
    };
  String.prototype.endsWith =
    String.prototype.endsWith ||
    function (suffix) {
      return this.match(suffix + '$') === suffix;
    };
  String.prototype.format = function () {
    var argumentsValue = arguments;
    return this.replace(/\{\d+\}/g, function (placeholderToken) {
      return argumentsValue[placeholderToken.match(/\d+/)];
    });
  };
  String.prototype.trim = function () {
    return this.replace(/^\s+|\s+$/g, '');
  };
  for (
    var diacriticGroups = [
        { base: 'A', letters: 'AⒶＡÀÁÂẦẤẪẨÃĀĂẰẮẴẲȦǠÄǞẢÅǺǍȀȂẠẬẶḀĄȺⱯ' },
        { base: 'AA', letters: 'Ꜳ' },
        { base: 'AE', letters: 'ÆǼǢ' },
        { base: 'AO', letters: 'Ꜵ' },
        { base: 'AU', letters: 'Ꜷ' },
        { base: 'AV', letters: 'ꜸꜺ' },
        { base: 'AY', letters: 'Ꜽ' },
        { base: 'B', letters: 'BⒷＢḂḄḆɃƂƁ' },
        { base: 'C', letters: 'CⒸＣĆĈĊČÇḈƇȻꜾ' },
        { base: 'D', letters: 'DⒹＤḊĎḌḐḒḎĐƋƊƉꝹ' },
        { base: 'DZ', letters: 'ǱǄ' },
        { base: 'Dz', letters: 'ǲǅ' },
        { base: 'E', letters: 'EⒺＥÈÉÊỀẾỄỂẼĒḔḖĔĖËẺĚȄȆẸỆȨḜĘḘḚƐƎ' },
        { base: 'F', letters: 'FⒻＦḞƑꝻ' },
        { base: 'G', letters: 'GⒼＧǴĜḠĞĠǦĢǤƓꞠꝽꝾ' },
        { base: 'H', letters: 'HⒽＨĤḢḦȞḤḨḪĦⱧⱵꞍ' },
        { base: 'I', letters: 'IⒾＩÌÍÎĨĪĬİÏḮỈǏȈȊỊĮḬƗ' },
        { base: 'J', letters: 'JⒿＪĴɈ' },
        { base: 'K', letters: 'KⓀＫḰǨḲĶḴƘⱩꝀꝂꝄꞢ' },
        { base: 'L', letters: 'LⓁＬĿĹĽḶḸĻḼḺŁȽⱢⱠꝈꝆꞀ' },
        { base: 'LJ', letters: 'Ǉ' },
        { base: 'Lj', letters: 'ǈ' },
        { base: 'M', letters: 'MⓂＭḾṀṂⱮƜ' },
        { base: 'N', letters: 'NⓃＮǸŃÑṄŇṆŅṊṈȠƝꞐꞤ' },
        { base: 'NJ', letters: 'Ǌ' },
        { base: 'Nj', letters: 'ǋ' },
        { base: 'O', letters: 'OⓄＯÒÓÔỒỐỖỔÕṌȬṎŌṐṒŎȮȰÖȪỎŐǑȌȎƠỜỚỠỞỢỌỘǪǬØǾƆƟꝊꝌ' },
        { base: 'OI', letters: 'Ƣ' },
        { base: 'OO', letters: 'Ꝏ' },
        { base: 'OU', letters: 'Ȣ' },
        { base: 'OE', letters: 'Œ' },
        { base: 'oe', letters: 'œ' },
        { base: 'P', letters: 'PⓅＰṔṖƤⱣꝐꝒꝔ' },
        { base: 'Q', letters: 'QⓆＱꝖꝘɊ' },
        { base: 'R', letters: 'RⓇＲŔṘŘȐȒṚṜŖṞɌⱤꝚꞦꞂ' },
        { base: 'S', letters: 'SⓈＳẞŚṤŜṠŠṦṢṨȘŞⱾꞨꞄ' },
        { base: 'T', letters: 'TⓉＴṪŤṬȚŢṰṮŦƬƮȾꞆ' },
        { base: 'TZ', letters: 'Ꜩ' },
        { base: 'U', letters: 'UⓊＵÙÚÛŨṸŪṺŬÜǛǗǕǙỦŮŰǓȔȖƯỪỨỮỬỰỤṲŲṶṴɄ' },
        { base: 'V', letters: 'VⓋＶṼṾƲꝞɅ' },
        { base: 'VY', letters: 'Ꝡ' },
        { base: 'W', letters: 'WⓌＷẀẂŴẆẄẈⱲ' },
        { base: 'X', letters: 'XⓍＸẊẌ' },
        { base: 'Y', letters: 'YⓎＹỲÝŶỸȲẎŸỶỴƳɎỾ' },
        { base: 'Z', letters: 'ZⓏＺŹẐŻŽẒẔƵȤⱿⱫꝢ' },
        { base: 'a', letters: 'aⓐａẚàáâầấẫẩãāăằắẵẳȧǡäǟảåǻǎȁȃạậặḁąⱥɐ' },
        { base: 'aa', letters: 'ꜳ' },
        { base: 'ae', letters: 'æǽǣ' },
        { base: 'ao', letters: 'ꜵ' },
        { base: 'au', letters: 'ꜷ' },
        { base: 'av', letters: 'ꜹꜻ' },
        { base: 'ay', letters: 'ꜽ' },
        { base: 'b', letters: 'bⓑｂḃḅḇƀƃɓ' },
        { base: 'c', letters: 'cⓒｃćĉċčçḉƈȼꜿↄ' },
        { base: 'd', letters: 'dⓓｄḋďḍḑḓḏđƌɖɗꝺ' },
        { base: 'dz', letters: 'ǳǆ' },
        { base: 'e', letters: 'eⓔｅèéêềếễểẽēḕḗĕėëẻěȅȇẹệȩḝęḙḛɇɛǝ' },
        { base: 'f', letters: 'fⓕｆḟƒꝼ' },
        { base: 'g', letters: 'gⓖｇǵĝḡğġǧģǥɠꞡᵹꝿ' },
        { base: 'h', letters: 'hⓗｈĥḣḧȟḥḩḫẖħⱨⱶɥ' },
        { base: 'hv', letters: 'ƕ' },
        { base: 'i', letters: 'iⓘｉìíîĩīĭïḯỉǐȉȋịįḭɨı' },
        { base: 'j', letters: 'jⓙｊĵǰɉ' },
        { base: 'k', letters: 'kⓚｋḱǩḳķḵƙⱪꝁꝃꝅꞣ' },
        { base: 'l', letters: 'lⓛｌŀĺľḷḹļḽḻſłƚɫⱡꝉꞁꝇ' },
        { base: 'lj', letters: 'ǉ' },
        { base: 'm', letters: 'mⓜｍḿṁṃɱɯ' },
        { base: 'n', letters: 'nⓝｎǹńñṅňṇņṋṉƞɲŉꞑꞥ' },
        { base: 'nj', letters: 'ǌ' },
        { base: 'o', letters: 'oⓞｏòóôồốỗổõṍȭṏōṑṓŏȯȱöȫỏőǒȍȏơờớỡởợọộǫǭøǿɔꝋꝍɵ' },
        { base: 'oi', letters: 'ƣ' },
        { base: 'ou', letters: 'ȣ' },
        { base: 'oo', letters: 'ꝏ' },
        { base: 'p', letters: 'pⓟｐṕṗƥᵽꝑꝓꝕ' },
        { base: 'q', letters: 'qⓠｑɋꝗꝙ' },
        { base: 'r', letters: 'rⓡｒŕṙřȑȓṛṝŗṟɍɽꝛꞧꞃ' },
        { base: 's', letters: 'sⓢｓßśṥŝṡšṧṣṩșşȿꞩꞅẛ' },
        { base: 't', letters: 'tⓣｔṫẗťṭțţṱṯŧƭʈⱦꞇ' },
        { base: 'tz', letters: 'ꜩ' },
        { base: 'u', letters: 'uⓤｕùúûũṹūṻŭüǜǘǖǚủůűǔȕȗưừứữửựụṳųṷṵʉ' },
        { base: 'v', letters: 'vⓥｖṽṿʋꝟʌ' },
        { base: 'vy', letters: 'ꝡ' },
        { base: 'w', letters: 'wⓦｗẁẃŵẇẅẘẉⱳ' },
        { base: 'x', letters: 'xⓧｘẋẍ' },
        { base: 'y', letters: 'yⓨｙỳýŷỹȳẏÿỷẙỵƴɏỿ' },
        { base: 'z', letters: 'zⓩｚźẑżžẓẕƶȥɀⱬꝣ' },
      ],
      diacriticLookup = {},
      currentItemIndex = 0;
    currentItemIndex < diacriticGroups.length;
    currentItemIndex++
  ) {
    for (
      var letters = diacriticGroups[currentItemIndex].letters, localItemIndex = 0;
      localItemIndex < letters.length;
      localItemIndex++
    ) {
      diacriticLookup[letters[localItemIndex]] = diacriticGroups[currentItemIndex].base;
    }
  }
  var escapeSequences = {
      '\b': '\\b',
      '\t': '\\t',
      '\n': '\\n',
      '\f': '\\f',
      '\r': '\\r',
      '"': '\\"',
      "'": "\\'",
      '\\': '\\\\',
    },
    getPathBaseName = function (text) {
      if (File.isMac) {
        return (text.replace(/[\/]+$/, '').split('/') || []).last();
      } else {
        return reqnode('path').basename(text);
      }
    },
    getFileName = getPathBaseName,
    htmlEntities = {
      '&newline;': null,
      '&tab;': '\t',
      '&copy;': '©',
      '&amp;': '&',
      '&gt': '>',
      '&lt': '<',
      '&num;': '#',
    },
    textareaElement = document.createElement('textarea'),
    combiningCharacterRanges = [
      [768, 879],
      [1155, 1158],
      [1160, 1161],
      [1425, 1469],
      [1471, 1471],
      [1473, 1474],
      [1476, 1477],
      [1479, 1479],
      [1536, 1539],
      [1552, 1557],
      [1611, 1630],
      [1648, 1648],
      [1750, 1764],
      [1767, 1768],
      [1770, 1773],
      [1807, 1807],
      [1809, 1809],
      [1840, 1866],
      [1958, 1968],
      [2027, 2035],
      [2305, 2306],
      [2364, 2364],
      [2369, 2376],
      [2381, 2381],
      [2385, 2388],
      [2402, 2403],
      [2433, 2433],
      [2492, 2492],
      [2497, 2500],
      [2509, 2509],
      [2530, 2531],
      [2561, 2562],
      [2620, 2620],
      [2625, 2626],
      [2631, 2632],
      [2635, 2637],
      [2672, 2673],
      [2689, 2690],
      [2748, 2748],
      [2753, 2757],
      [2759, 2760],
      [2765, 2765],
      [2786, 2787],
      [2817, 2817],
      [2876, 2876],
      [2879, 2879],
      [2881, 2883],
      [2893, 2893],
      [2902, 2902],
      [2946, 2946],
      [3008, 3008],
      [3021, 3021],
      [3134, 3136],
      [3142, 3144],
      [3146, 3149],
      [3157, 3158],
      [3260, 3260],
      [3263, 3263],
      [3270, 3270],
      [3276, 3277],
      [3298, 3299],
      [3393, 3395],
      [3405, 3405],
      [3530, 3530],
      [3538, 3540],
      [3542, 3542],
      [3633, 3633],
      [3636, 3642],
      [3655, 3662],
      [3761, 3761],
      [3764, 3769],
      [3771, 3772],
      [3784, 3789],
      [3864, 3865],
      [3893, 3893],
      [3895, 3895],
      [3897, 3897],
      [3953, 3966],
      [3968, 3972],
      [3974, 3975],
      [3984, 3991],
      [3993, 4028],
      [4038, 4038],
      [4141, 4144],
      [4146, 4146],
      [4150, 4151],
      [4153, 4153],
      [4184, 4185],
      [4448, 4607],
      [4959, 4959],
      [5906, 5908],
      [5938, 5940],
      [5970, 5971],
      [6002, 6003],
      [6068, 6069],
      [6071, 6077],
      [6086, 6086],
      [6089, 6099],
      [6109, 6109],
      [6155, 6157],
      [6313, 6313],
      [6432, 6434],
      [6439, 6440],
      [6450, 6450],
      [6457, 6459],
      [6679, 6680],
      [6912, 6915],
      [6964, 6964],
      [6966, 6970],
      [6972, 6972],
      [6978, 6978],
      [7019, 7027],
      [7616, 7626],
      [7678, 7679],
      [8203, 8207],
      [8234, 8238],
      [8288, 8291],
      [8298, 8303],
      [8400, 8431],
      [12330, 12335],
      [12441, 12442],
      [43014, 43014],
      [43019, 43019],
      [43045, 43046],
      [64286, 64286],
      [65024, 65039],
      [65056, 65059],
      [65279, 65279],
      [65529, 65531],
      [68097, 68099],
      [68101, 68102],
      [68108, 68111],
      [68152, 68154],
      [68159, 68159],
      [119143, 119145],
      [119155, 119170],
      [119173, 119179],
      [119210, 119213],
      [119362, 119364],
      [917505, 917505],
      [917536, 917631],
      [917760, 917999],
    ],
    characterWidthOptions = { nul: 0, control: 0, tabSize: 4 };
  var getCodePointWidth = function (codePoint, widthOptions) {
    if (0 === codePoint) {
      return widthOptions.nul;
    } else {
      if (9 === codePoint) {
        return widthOptions.tabSize;
      } else {
        if (codePoint < 32 || (codePoint >= 127 && codePoint < 160)) {
          return widthOptions.control;
        } else {
          if (
            (function (codePoint) {
              var middleIndex,
                lowerIndex = 0,
                upperIndex = combiningCharacterRanges.length - 1;
              if (
                codePoint < combiningCharacterRanges[0][0] ||
                codePoint > combiningCharacterRanges[upperIndex][1]
              ) {
                return false;
              }
              for (; upperIndex >= lowerIndex; ) {
                middleIndex = Math.floor((lowerIndex + upperIndex) / 2);
                if (codePoint > combiningCharacterRanges[middleIndex][1]) {
                  lowerIndex = middleIndex + 1;
                } else {
                  if (!(codePoint < combiningCharacterRanges[middleIndex][0])) {
                    return true;
                  }
                  upperIndex = middleIndex - 1;
                }
              }
              return false;
            })(codePoint)
          ) {
            return 0;
          } else {
            return (
              1 +
              (codePoint >= 4352 &&
                (codePoint <= 4447 ||
                  9001 == codePoint ||
                  9002 == codePoint ||
                  (codePoint >= 11904 && codePoint <= 42191 && 12351 != codePoint) ||
                  (codePoint >= 44032 && codePoint <= 55203) ||
                  (codePoint >= 63744 && codePoint <= 64255) ||
                  (codePoint >= 65040 && codePoint <= 65049) ||
                  (codePoint >= 65072 && codePoint <= 65135) ||
                  (codePoint >= 65280 && codePoint <= 65376) ||
                  (codePoint >= 65504 && codePoint <= 65510) ||
                  (codePoint >= 131072 && codePoint <= 196605) ||
                  (codePoint >= 196608 && codePoint <= 262141)))
            );
          }
        }
      }
    }
  };
  var resolveInternalResourceUrl = function (text) {
    if (0 == text.indexOf('http://marklyra-app/')) {
      return _options.appPath + '/' + text.substring('http://marklyra-app/'.length);
    } else {
      if (0 == text.indexOf('http://marklyra-theme/')) {
        return (
          'file://' +
          _options.currentThemeFolder +
          '/' +
          text.substring('http://marklyra-theme/'.length)
        );
      } else {
        return text;
      }
    }
  };
  moduleExports.orDefault = function (value, fallbackValue) {
    if (null === value || void 0 === value) {
      return fallbackValue;
    } else {
      return value;
    }
  };
  var pathSeparator = window.reqnode && 'win32' == process.platform ? '\\' : '/',
    isMac = !!''.normalize;
  moduleExports.isSamePath = function (normalizedPath, inputNormalizedPath) {
    if (File.isMac && isMac) {
      normalizedPath = (normalizedPath || '').normalize();
      inputNormalizedPath = (inputNormalizedPath || '').normalize();
    }
    if (JSBridge.fsCaseInsensitive()) {
      return normalizedPath.toLowerCase() == inputNormalizedPath.toLowerCase();
    } else {
      return normalizedPath == inputNormalizedPath;
    }
  };
  moduleExports.isAncestorPathOf = function (text, inputText) {
    if (JSBridge.fsCaseInsensitive()) {
      return 0 == inputText.toLowerCase().indexOf(text.toLowerCase() + pathSeparator);
    } else {
      return 0 == inputText.indexOf(text + pathSeparator);
    }
  };
  var decodeUriSafely = function (encodedUrl) {
    try {
      encodedUrl = decodeURI(encodedUrl);
    } catch (error) {}
    return encodedUrl;
  };
  moduleExports.decodeFromEscapedURL = decodeUriSafely;
  moduleExports.decodeFromEscapedPath = function (encodedPath) {
    try {
      var decodedPath = /[\\\/]/.exec(encodedPath) ? '//' : decodeURIComponent(encodedPath);
      encodedPath = /[\\\/]/.exec(decodedPath)
        ? decodeURI(encodedPath).replace(/%40/g, '@')
        : decodedPath;
    } catch (error) {
      try {
        encodedPath = decodeURI(encodedPath).replace(/%40/g, '@');
      } catch (currentError) {}
    }
    return encodedPath;
  };
  moduleExports.normalize = function (sourceText, normalizationForm) {
    if (!sourceText.normalize) {
      requireModule('libraries/unicode-normalization');
    }
    return sourceText.normalize(normalizationForm);
  };
  moduleExports.titleToAnchor = function (text) {
    return text
      .toLowerCase()
      .trim()
      .replace(/—/g, '㌾㌾㌾')
      .replace(/–/g, '㌾㌾')
      .replace(/[\s-]/g, '㌾')
      .replace(/\p{P}|\+|=/gu, '')
      .replace(/\u333e/g, '-');
  };
  moduleExports.floatToPercent = function (ratio) {
    return Math.round(100 * ratio) + '%';
  };
  moduleExports.dateToNumberString = function (date) {
    function padTwoDigits(number) {
      if (number < 10) {
        return '0' + number;
      } else {
        return number;
      }
    }
    var milliseconds;
    return (
      '' +
      date.getFullYear() +
      padTwoDigits(date.getMonth() + 1) +
      padTwoDigits(date.getDate()) +
      padTwoDigits(date.getHours()) +
      padTwoDigits(date.getMinutes()) +
      padTwoDigits(date.getSeconds()) +
      ((milliseconds = padTwoDigits(date.getMilliseconds())) < 100
        ? '0' + milliseconds
        : milliseconds)
    );
  };
  moduleExports.escapeShell = function (items) {
    var textParts = [];
    items.forEach(function (item) {
      item = JSON.stringify(item);
      textParts.push(item);
    });
    return textParts.join(' ');
  };
  moduleExports.truncate = function (text, maxLength, ellipsis) {
    if (text.length <= maxLength) {
      return text;
    }
    var retainedLength = maxLength - (ellipsis = ellipsis || '…').length,
      substringLength = Math.ceil(retainedLength / 2),
      suffixLength = Math.floor(retainedLength / 2);
    return text.substr(0, substringLength) + ellipsis + text.substr(text.length - suffixLength);
  };
  var stripPathParameters = function (text) {
    return text.replace(/#[^.\/\\]+$/, '').replace(/\?[^\/\\]+/, '');
  };
  moduleExports.trimPathParam = stripPathParameters;
  moduleExports.absolutePathFrom = function (fileUrl) {
    var text = (fileUrl || '').replace(/^(wk)*file:(\/\/)*/, '');
    if (File.isWin) {
      text = text.replace(/^[\/\\]+/, '');
    }
    if (!/^[a-z]+:/.exec(text)) {
      text = decodeUriSafely(text);
      text = (text = stripPathParameters(text)).replace(/%23/g, '#');
    }
    return text;
  };
  moduleExports.compareVersion = function (parts, inputParts) {
    var itemIndex, sharedPartCount, versionDifference;
    for (
      parts = parts.split('.'),
        inputParts = inputParts.split('.'),
        sharedPartCount = Math.min(parts.length, inputParts.length),
        itemIndex = 0;
      itemIndex < sharedPartCount;
      itemIndex++
    ) {
      if (
        0 !==
        (versionDifference = parseInt(parts[itemIndex], 10) - parseInt(inputParts[itemIndex], 10))
      ) {
        return versionDifference;
      }
    }
    return parts.length - inputParts.length;
  };
  moduleExports.capitalize = function (text) {
    if (text.length <= 1) {
      return text.toUpperCase();
    } else {
      return text[0].toUpperCase() + text.substr(1);
    }
  };
  moduleExports.capitalizeEachWord = function (text) {
    return text
      .split(' ')
      .map((inputText) => (inputText[0] || '').toUpperCase() + inputText.substring(1))
      .join(' ');
  };
  moduleExports.hashCode = function (text) {
    var hashValue = 0;
    if (!text) {
      return hashValue;
    }
    for (var characterIndex = 0; characterIndex < text.length; characterIndex++) {
      hashValue = (hashValue << 5) - hashValue + text.charCodeAt(characterIndex);
      hashValue &= hashValue;
    }
    return hashValue;
  };
  var temporarySequence = 0;
  moduleExports.tempString = function () {
    temporarySequence++;
    return new Date() - 0 + '-' + temporarySequence;
  };
  moduleExports.IMG_REG = /\.(png|jpg|jpeg|jfif|svg|gif|bmp|webp|tiff)$/i;
  moduleExports.VIDEO_REG = /\.(mp4|webm|mkv|flv|avi|mov|wmv|rm|rmvb|m4p|mpe?g|mpv|ogg)$/i;
  moduleExports.AUDIO_REG = /\.(mp3|vox|wav|wma|w4a|m4p|wave|flac|aac)$/i;
  moduleExports.decodeHtmlEntity = function (html) {
    var decodedEntity = htmlEntities[html];
    if (!decodedEntity) {
      textareaElement.innerHTML = html;
      if ((decodedEntity = textareaElement.value) != html) {
        htmlEntities[html] = decodedEntity;
      } else {
        decodedEntity = null;
      }
    }
    return decodedEntity;
  };
  moduleExports.formateDateTime = function (date) {
    return (
      date.getFullYear() +
      '/' +
      (date.getMonth() + 1) +
      '/' +
      date.getDate() +
      '  ' +
      formatTime(date)
    );
  };
  moduleExports.formateTimeOnly = formatTime;
  moduleExports.formateDateOnly = function (date) {
    return date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate();
  };
  moduleExports.insert = function (text, endOffset, insertedText) {
    if (endOffset < (text = text || '').length) {
      return text.substring(0, endOffset) + insertedText + text.substring(endOffset);
    } else {
      return text + insertedText;
    }
  };
  /** Recover smart double quotes around an image's numeric zoom style for display.
   * Keep the original markup in the document; do not relax general HTML parsing. */
  moduleExports.imageZoomMarkup = function (source) {
    if (!/^<img\s/i.test(source)) return source;
    return source.replace(
      /^(<img(?:\s+[a-zA-Z_:][a-zA-Z0-9:._-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*?\s+style\s*=\s*)["“”](\s*zoom\s*:\s*(?:\d+(?:\.\d+)?|\.\d+)%?\s*;?\s*)["“”](?=\s|\/?>)/i,
      '$1"$2"',
    );
  };
  moduleExports.escape = function (inputValue, escapeMarkdown, unusedParameter3) {
    return (inputValue = escapeHtmlText(inputValue, escapeMarkdown));
  };
  moduleExports.escapeForPreWrap = escapeHtmlText;
  moduleExports.unescape = function (escapedValue) {
    if (null == escapedValue || void 0 == escapedValue || '' == escapedValue) {
      return '';
    } else {
      return (escapedValue + '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
    }
  };
  moduleExports.escapeHead = function (text) {
    return text.replace(
      /(^ *)((#+)|(\+ +)|(\- +)|(\* +)|(\d+(\.|\)) +)|(```|~~~)|(>)|(-+\s*$))/,
      '$1\\$2',
    );
  };
  moduleExports.escapeMark = escapeMarkdownText;
  moduleExports.escapeSelector = function (selectorText) {
    if (window.CSS && CSS.escape) {
      return CSS.escape(selectorText);
    } else {
      return $.escapeSelector(selectorText);
    }
  };
  moduleExports.escapeStringReplace = function (text) {
    return text.replace(/\$/g, '$$$$');
  };
  moduleExports.escapeRegExp = escapeRegexPattern;
  moduleExports.unicodeEscapesToPCRE2 = function (text) {
    for (
      var unicodeEscapePattern = /((?:[^\\]|^)(?:\\\\)*)\\u([a-z0-9]{4})(?!\d)/g;
      text.match(unicodeEscapePattern);
    ) {
      text = text.replace(unicodeEscapePattern, '$1\\x{$2}');
    }
    return text;
  };
  moduleExports.replaceAll = function (text, searchValue, replacement) {
    if (text.replaceAll) {
      return text.replaceAll(searchValue, replacement);
    } else {
      return text.replace(new RegExp(escapeRegexPattern(searchValue), 'g'), replacement);
    }
  };
  moduleExports.isDefined = function (value) {
    return null !== value && void 0 !== value;
  };
  moduleExports.isNullOrEmpty = isEmptyValue;
  moduleExports.isNotNullOrEmpty = function (value) {
    return !isEmptyValue(value);
  };
  moduleExports.isNullOrBlank = function (value) {
    return null == value || void 0 == value || '' === value || whitespaceTextPattern.exec(value);
  };
  moduleExports.replaceExact = replaceWholeWord;
  moduleExports.splitExact = function (text, separatorPattern) {
    return text.split(new RegExp('\\b' + separatorPattern + '\\b', 'gi'));
  };
  moduleExports.trimArr = function (lines) {
    if (lines && lines.length) {
      for (
        var itemIndex = 0, lastNonblankIndex = lines.length - 1;
        0 === lines[itemIndex].trim().length && itemIndex < lastNonblankIndex;
      ) {
        itemIndex++;
      }
      for (; lastNonblankIndex > itemIndex && 0 === lines[lastNonblankIndex].trim().length; ) {
        lastNonblankIndex--;
      }
      return lines.slice(itemIndex, lastNonblankIndex + 1);
    }
    return lines;
  };
  moduleExports.isURL = function (urlText) {
    return !(!urlPattern.exec(urlText) && !/\s*mailto:/.exec(urlText));
  };
  moduleExports.isImg = function (urlText) {
    return !!imageUrlPattern.exec(urlText);
  };
  moduleExports.camelize = function (text) {
    return text.replace(/(?:^|_|-)(\w)/g, function (unusedParameter1, inputText, matchOffset) {
      if (0 == matchOffset) {
        return inputText.toLowerCase();
      } else {
        return inputText.toUpperCase();
      }
    });
  };
  moduleExports.getRelativePath = function (text, inputText, targetIsDirectory, explicitDotPrefix) {
    if (!text) {
      return inputText;
    }
    var relativePath;
    explicitDotPrefix = targetIsDirectory || explicitDotPrefix;
    if (File.isNode) {
      relativePath = reqnode('path').relative(text, inputText);
      if (explicitDotPrefix && !relativePath.match(/^\.\.?\//)) {
        relativePath = './' + relativePath;
      }
      return relativePath;
    }
    text = text.replace(/\\\\/g, '/').replace(/^\.\//, '');
    var targetDirectory,
      parts = (inputText = inputText.replace(/\\\\/g, '/')).split(/\//g),
      currentParts = text.split(/\//g),
      targetFileName = '',
      relativePrefix = '';
    for (
      targetIsDirectory || (targetFileName = parts.pop()),
        '' == currentParts.last() && currentParts.pop(),
        '' == currentParts[0] && currentParts.shift(),
        '' == parts[0] && parts.shift(),
        targetDirectory = parts.join('/');
      0 !== targetDirectory.indexOf(currentParts.join('/'));
    ) {
      currentParts.pop();
      relativePrefix += '../';
    }
    var slice = parts.slice(currentParts.length);
    if (slice.length) {
      relativePrefix += slice.join('/') + '/';
    }
    relativePath = (relativePrefix + targetFileName).replace(/\/$/, '');
    if (explicitDotPrefix && !relativePath.match(/^\.\.?\//)) {
      relativePath = './' + relativePath;
    }
    return relativePath;
  };
  moduleExports.getAbsolutePath = resolveRelativePath;
  moduleExports.ensureAbsolutePath = function (basePath, text, baseIsDirectory) {
    if (File.isWin && /^[A-Z]{1,2}:/i.exec(text)) {
      return text;
    } else {
      if (/^~[\/\\]/.exec(text)) {
        return File.option.userPath + text.substr(1);
      } else {
        if (/^[\/\\]/.exec(text)) {
          return text;
        } else {
          if (basePath) {
            return resolveRelativePath(basePath, text, baseIsDirectory);
          } else {
            return null;
          }
        }
      }
    }
  };
  moduleExports.realPathForTextBundle = function (text) {
    if (File.isWin && /^[A-Z]{1,2}:/i.exec(text)) {
      return text;
    } else {
      if (/^~[\/\\]/.exec(text)) {
        return File.option.userPath + text.substr(1);
      } else {
        if (/^[\/\\]/.exec(text)) {
          return text;
        } else {
          if (File.bundle.unzipFolder && File.isTextPack() && /^assets[\/\\]/.exec(text)) {
            return resolveRelativePath(File.bundle.unzipFolder, text, true);
          } else {
            return resolveRelativePath(
              File.bundle.filePath || File.bundle.originalPath,
              text,
              File.isTextBundle() || File.isTextPack(),
            );
          }
        }
      }
    }
  };
  moduleExports.getAbsoluteURL = function (text, inputText) {
    if (!inputText) {
      return '';
    }
    var normalizedUrl = inputText.replace(/^[\\\/]{2}/, 'http://');
    text = text || '';
    if (normalizedUrl.match(/^[^:]+:\/\//)) {
      return normalizedUrl;
    } else {
      if (normalizedUrl.match(/^[\\\/]/)) {
        return text.replace(/(^[^:]+:\/\/[^\/]+)\/.*/, '$1' + inputText);
      } else {
        return resolveRelativePath(text, normalizedUrl);
      }
    }
  };
  moduleExports.isAbsolutePath = function (pathText) {
    return (
      !(!File.isWin || !/^[A-Z]{1,2}:/i.exec(pathText)) ||
      !!/^~[\/\\]/.exec(pathText) ||
      !!/^[\/\\]/.exec(pathText)
    );
  };
  moduleExports.getFilePathFromMacProxy = resolveInternalResourceUrl;
  moduleExports.getFilePathFromProxy = function (proxyUrl) {
    if (File.isMac) {
      return resolveInternalResourceUrl(proxyUrl);
    } else {
      if (File.isNode && /^marklyra:\/\//.exec(proxyUrl)) {
        return (function (text) {
          if (/^marklyra:\/\//.exec(text)) {
            try {
              text = decodeURI(text);
            } catch (error) {}
            var textSlice = text.substr(9 + 'app/'.length);
            if (/^userData/.exec(textSlice)) {
              textSlice = textSlice.replace(
                /^userData/,
                window._options.userDataPath.replace(/\\/g, '\\\\'),
              );
            }
            if (/current-theme\.css$/.exec(textSlice)) {
              textSlice = textSlice.replace(/current-theme\.css$/, File.option.curTheme);
            }
            if (/^typemark/i.exec(textSlice)) {
              textSlice = textSlice.replace(/^typemark/, window.dirname);
            }
            return (textSlice = textSlice.replace(/[?#][^\\\/]*$/, ''));
          }
          return text;
        })(proxyUrl);
      } else {
        return proxyUrl;
      }
    }
  };
  moduleExports.useOrDefault = function (text, fallbackValue) {
    if (text.trim().length) {
      return text;
    } else {
      return fallbackValue;
    }
  };
  moduleExports.removeDiacritics = function (sourceText) {
    return (sourceText || '').replace(/[^\u0000-\u007E]/g, function (character) {
      return diacriticLookup[character] || character;
    });
  };
  moduleExports.escapeInQuote = function (text) {
    return text
      .replace(/["'\\\b\t\n\f\r]/g, function (escapedCharacter) {
        return escapeSequences[escapedCharacter];
      })
      .replace(/\u200b/g, '');
  };
  moduleExports.pathByDeleteLastComponent = function (separator) {
    if (File.isMac) {
      return separator.split('/').slice(0, -1).join('/');
    } else {
      return reqnode('path').join(separator, '..');
    }
  };
  moduleExports.getFolder = getPathBaseName;
  moduleExports.getFileName = getFileName;
  moduleExports.date2NaturalLang = function (date, capitalizeYesterday) {
    var dateLabel,
      hours,
      minutes,
      month,
      dayOfMonth,
      dateInstance = new Date(),
      elapsedSeconds = (dateInstance - date) / 1e3;
    if (elapsedSeconds < 30) {
      dateLabel = 'just now';
    } else {
      if (elapsedSeconds < 60) {
        dateLabel = '1 minutes ago';
      } else {
        if (elapsedSeconds < 3600) {
          dateLabel = Math.floor((elapsedSeconds + 30) / 60).toString() + ' minutes ago';
        } else {
          if (elapsedSeconds < 18e3 && dateInstance.getDay() == date.getDay()) {
            hours = date.getHours();
            minutes = date.getMinutes();
            dateLabel = [(hours > 9 ? '' : '0') + hours, (minutes > 9 ? '' : '0') + minutes].join(
              ':',
            );
          } else {
            if (elapsedSeconds < 172800 && dateInstance.getDay() == (date.getDay() + 1) % 7) {
              dateLabel = capitalizeYesterday ? 'Yesterday' : 'yesterday';
            } else {
              if (elapsedSeconds < 518400) {
                dateLabel = Math.floor(elapsedSeconds / 86400) + ' days ago';
              } else {
                if (dateInstance.getYear() == date.getYear()) {
                  dayOfMonth = date.getDate();
                  dateLabel =
                    [
                      'Jan',
                      'Feb',
                      'Mar',
                      'Apr',
                      'May',
                      'Jun',
                      'Jul',
                      'Aug',
                      'Sep',
                      'Oct',
                      'Nov',
                      'Dec',
                    ][date.getMonth()] +
                    ' ' +
                    (dayOfMonth > 9 ? '' : '0') +
                    dayOfMonth;
                } else {
                  month = date.getMonth() + 1;
                  dayOfMonth = date.getDate();
                  dateLabel = [
                    date.getFullYear(),
                    (month > 9 ? '' : '0') + month,
                    (dayOfMonth > 9 ? '' : '0') + dayOfMonth,
                  ].join('-');
                }
              }
            }
          }
        }
      }
    }
    return dateLabel;
  };
  moduleExports.abbreviatingWithTilde = function (text) {
    var userPath = File.option.userPath;
    if (File.isWin) {
      return text;
    }
    if (userPath && 0 == text.indexOf(userPath + '/')) {
      return '~' + text.substring(userPath.length);
    } else {
      return text;
    }
  };
  moduleExports.naturalCompare = function (normalizedText, inputNormalizedText) {
    normalizedText = normalizedText.toLowerCase();
    inputNormalizedText = inputNormalizedText.toLowerCase();
    var tokenPattern = /([.,\s+-]+|\d+)/,
      numericPrefixPattern = /^\d/,
      monthNamesPattern =
        /^(?:(jan(?:uary)?)|(feb(?:ruary)?)|(mar(?:ch)?)|(apr(?:il))|(may)|(jun(?:e)?)|(jul(?:y)?)|(aug(?:ust)?)|(sep(?:tember)?)|(oct(?:ober)?)|(nov(?:ember)?)|(dec(?:ember)?))$/;
    function getMonthIndex(monthToken, patternToMatch) {
      if (patternToMatch.exec(monthToken)) {
        return Array.from(monthNamesPattern.exec(monthToken)).findIndex(function (item, itemIndex) {
          return itemIndex > 0 && !!item;
        });
      } else {
        return -1;
      }
    }
    function splitNaturalSortTokens(text) {
      return text.split(tokenPattern).filter(function (item) {
        return !!item;
      });
    }
    function compareNaturalSortTokens(leftToken, rightToken) {
      if (leftToken == rightToken) {
        return 0;
      }
      var leftNumeric = !!numericPrefixPattern.exec(leftToken),
        rightNumeric = !!numericPrefixPattern.exec(rightToken);
      if (leftNumeric && rightNumeric) {
        return Number(leftToken) - Number(rightToken);
      }
      if (leftNumeric || rightNumeric) {
        if (leftNumeric) {
          return 1;
        } else {
          return -1;
        }
      }
      var leftMonth = getMonthIndex(leftToken, monthNamesPattern),
        rightMonth = getMonthIndex(rightToken, monthNamesPattern);
      if (leftMonth > 0 && rightMonth > 0) {
        return leftMonth - rightMonth;
      } else {
        return leftToken.localeCompare(rightToken);
      }
    }
    var leftTokens = splitNaturalSortTokens(normalizedText),
      rightTokens = splitNaturalSortTokens(inputNormalizedText),
      sharedTokenCount = Math.min(leftTokens.length, rightTokens.length);
    for (currentItemIndex = 0; currentItemIndex < sharedTokenCount; currentItemIndex++) {
      var comparison = compareNaturalSortTokens(
        leftTokens[currentItemIndex],
        rightTokens[currentItemIndex],
      );
      if (0 != comparison) {
        return comparison;
      }
    }
    return leftTokens.length - rightTokens.length;
  };
  moduleExports.wcswidth = function (text) {
    if (!text) {
      return 0;
    }
    var codePoint,
      lowSurrogate,
      characterWidth,
      totalWidth = 0;
    if ('string' != typeof text) {
      return getCodePointWidth(text, characterWidthOptions);
    }
    for (var characterIndex = 0; characterIndex < text.length; characterIndex++) {
      if ((codePoint = text.charCodeAt(characterIndex)) >= 55296 && codePoint <= 56319) {
        if ((lowSurrogate = text.charCodeAt(++characterIndex)) >= 56320 && lowSurrogate <= 57343) {
          codePoint = 1024 * (codePoint - 55296) + (lowSurrogate - 56320) + 65536;
        } else {
          characterIndex--;
        }
      }
      if ((characterWidth = getCodePointWidth(codePoint, characterWidthOptions)) < 0) {
        return -1;
      }
      totalWidth += characterWidth;
    }
    return totalWidth;
  };
  moduleExports.removeInvalidPathCh = function (text) {
    return text
      .replace(/[\u200b\u0000~\u0019\u007f~\u009f\\\/<>:"|?*]/g, '')
      .replace(/[\t\r\n]/g, ' ')
      .replace(/([ .]+)$/, '');
  };
  moduleExports.isFullUrl = function (urlText) {
    return /^([a-z][a-z0-9+\-.]+):([^\/\/]{2}|\/{2})/i.exec(urlText);
  };
  moduleExports.fromExternalPath = function (unusedParameter1) {
    return false;
  };
  moduleExports.file2wkfile = function (fileUrl) {
    return (fileUrl || '').replace(/^file:/i, 'wkfile:');
  };
  moduleExports.wkfile2file = function (fileUrl) {
    return (fileUrl || '').replace(/^wkfile:/i, 'file:');
  };
  moduleExports.escapeURL = function (text) {
    text = text || '';
    return encodeURI(text.replace(/\\/g, '/'))
      .replace(/'/g, '%27')
      .replace(/"/g, '%22')
      .replace(/#/g, '%23');
  };
  moduleExports.findLine = function (text, characterOffset) {
    for (
      var parts = text.split(/\n/), itemIndex = 0, start = 0;
      characterOffset > 0 &&
      itemIndex < parts.length &&
      characterOffset > start + parts[itemIndex].length;
    ) {
      start += parts[itemIndex].length + 1;
      itemIndex++;
    }
    return { line: parts[itemIndex] || '', start: start };
  };
  moduleExports.isUTF8 = function (bytes) {
    for (var byteIndex = 0, scanLimit = Math.min(bytes.length, 12e3); byteIndex < scanLimit; ) {
      if (bytes[byteIndex] <= 126) {
        byteIndex += 1;
      } else {
        if (
          194 <= bytes[byteIndex] &&
          bytes[byteIndex] <= 223 &&
          128 <= bytes[byteIndex + 1] &&
          bytes[byteIndex + 1] <= 191
        ) {
          byteIndex += 2;
        } else {
          if (
            (224 == bytes[byteIndex] &&
              160 <= bytes[byteIndex + 1] &&
              bytes[byteIndex + 1] <= 191 &&
              128 <= bytes[byteIndex + 2] &&
              bytes[byteIndex + 2] <= 191) ||
            (((225 <= bytes[byteIndex] && bytes[byteIndex] <= 236) ||
              238 == bytes[byteIndex] ||
              239 == bytes[byteIndex]) &&
              128 <= bytes[byteIndex + 1] &&
              bytes[byteIndex + 1] <= 191 &&
              128 <= bytes[byteIndex + 2] &&
              bytes[byteIndex + 2] <= 191) ||
            (237 == bytes[byteIndex] &&
              128 <= bytes[byteIndex + 1] &&
              bytes[byteIndex + 1] <= 159 &&
              128 <= bytes[byteIndex + 2] &&
              bytes[byteIndex + 2] <= 191)
          ) {
            byteIndex += 3;
          } else {
            if (
              !(
                (240 == bytes[byteIndex] &&
                  144 <= bytes[byteIndex + 1] &&
                  bytes[byteIndex + 1] <= 191 &&
                  128 <= bytes[byteIndex + 2] &&
                  bytes[byteIndex + 2] <= 191 &&
                  128 <= bytes[byteIndex + 3] &&
                  bytes[byteIndex + 3] <= 191) ||
                (241 <= bytes[byteIndex] &&
                  bytes[byteIndex] <= 243 &&
                  128 <= bytes[byteIndex + 1] &&
                  bytes[byteIndex + 1] <= 191 &&
                  128 <= bytes[byteIndex + 2] &&
                  bytes[byteIndex + 2] <= 191 &&
                  128 <= bytes[byteIndex + 3] &&
                  bytes[byteIndex + 3] <= 191) ||
                (244 == bytes[byteIndex] &&
                  128 <= bytes[byteIndex + 1] &&
                  bytes[byteIndex + 1] <= 143 &&
                  128 <= bytes[byteIndex + 2] &&
                  bytes[byteIndex + 2] <= 191 &&
                  128 <= bytes[byteIndex + 3] &&
                  bytes[byteIndex + 3] <= 191)
              )
            ) {
              return false;
            }
            byteIndex += 4;
          }
        }
      }
    }
    return true;
  };
  moduleExports.WESTERN_WORD_SPLITTER =
    /([<>\u3040-\uABFF\uD7A4-\uFAFF\s!-#%-\*,-\/:;\+\?@\[-\]\{\}\xA1\xA7\xAB\xB6\xB7\xBB\xBF\u037E\u0387\u055A-\u055F\u0589\u058A\u05BE\u05C0\u05C3\u05C6\u05F3\u05F4\u0609\u060A\u060C\u060D\u061B\u061E\u061F\u066A-\u066D\u06D4\u0700-\u070D\u07F7-\u07F9\u0830-\u083E\u085E\u0964\u0965\u0970\u09FD\u0AF0\u0DF4\u0E4F\u0E5A\u0E5B\u0F04-\u0F12\u0F14\u0F3A-\u0F3D\u0F85\u0FD0-\u0FD4\u0FD9\u0FDA\u104A-\u104F\u10FB\u1360-\u1368\u1400\u166D\u166E\u169B\u169C\u16EB-\u16ED\u1735\u1736\u17D4-\u17D6\u17D8-\u17DA\u1800-\u180A\u1944\u1945\u1A1E\u1A1F\u1AA0-\u1AA6\u1AA8-\u1AAD\u1B5A-\u1B60\u1BFC-\u1BFF\u1C3B-\u1C3F\u1C7E\u1C7F\u1CC0-\u1CC7\u1CD3\u2010-\u2027\u2030-\u2043\u2045-\u2051\u2053-\u205E\u207D\u207E\u208D\u208E\u2308-\u230B\u2329\u232A\u2768-\u2775\u27C5\u27C6\u27E6-\u27EF\u2983-\u2998\u29D8-\u29DB\u29FC\u29FD\u2CF9-\u2CFC\u2CFE\u2CFF\u2D70\u2E00-\u2E2E\u2E30-\u2E49\u3001-\u3003\u3008-\u3011\u3014-\u301F\u3030\u303D\u30A0\u30FB\uA4FE\uA4FF\uA60D-\uA60F\uA673\uA67E\uA6F2-\uA6F7\uA874-\uA877\uA8CE\uA8CF\uA8F8-\uA8FA\uA8FC\uA92E\uA92F\uA95F\uA9C1-\uA9CD\uA9DE\uA9DF\uAA5C-\uAA5F\uAADE\uAADF\uAAF0\uAAF1\uABEB\uFD3E\uFD3F\uFE10-\uFE19\uFE30-\uFE52\uFE54-\uFE61\uFE63\uFE68\uFE6A\uFE6B\uFF01-\uFF03\uFF05-\uFF0A\uFF0C-\uFF0F\uFF1A\uFF1B\uFF1F\uFF20\uFF3B-\uFF3D\uFF3F\uFF5B\uFF5D\uFF5F-\uFF65])/;
  moduleExports.WESTERN_WORD_SPLITTER_SPELLCHECKER =
    /([_<>\u3040-\uABFF\uD7A4-\uFAFF\s!-#%-\*,-\/:;\+\?@\[-\]\{\}\xA1\xA7\xAB\xB6\xB7\xBB\xBF\u037E\u0387\u055A-\u055F\u0589\u058A\u05BE\u05C0\u05C3\u05C6\u05F3\u05F4\u0609\u060A\u060C\u060D\u061B\u061E\u061F\u066A-\u066D\u06D4\u0700-\u070D\u07F7-\u07F9\u0830-\u083E\u085E\u0964\u0965\u0970\u09FD\u0AF0\u0DF4\u0E4F\u0E5A\u0E5B\u0F04-\u0F12\u0F14\u0F3A-\u0F3D\u0F85\u0FD0-\u0FD4\u0FD9\u0FDA\u104A-\u104F\u10FB\u1360-\u1368\u1400\u166D\u166E\u169B\u169C\u16EB-\u16ED\u1735\u1736\u17D4-\u17D6\u17D8-\u17DA\u1800-\u180A\u1944\u1945\u1A1E\u1A1F\u1AA0-\u1AA6\u1AA8-\u1AAD\u1B5A-\u1B60\u1BFC-\u1BFF\u1C3B-\u1C3F\u1C7E\u1C7F\u1CC0-\u1CC7\u1CD3\u2010-\u2027\u2030-\u2043\u2045-\u2051\u2053-\u205E\u207D\u207E\u208D\u208E\u2308-\u230B\u2329\u232A\u2768-\u2775\u27C5\u27C6\u27E6-\u27EF\u2983-\u2998\u29D8-\u29DB\u29FC\u29FD\u2CF9-\u2CFC\u2CFE\u2CFF\u2D70\u2E00-\u2E2E\u2E30-\u2E49\u3001-\u3003\u3008-\u3011\u3014-\u301F\u3030\u303D\u30A0\u30FB\uA4FE\uA4FF\uA60D-\uA60F\uA673\uA67E\uA6F2-\uA6F7\uA874-\uA877\uA8CE\uA8CF\uA8F8-\uA8FA\uA8FC\uA92E\uA92F\uA95F\uA9C1-\uA9CD\uA9DE\uA9DF\uAA5C-\uAA5F\uAADE\uAADF\uAAF0\uAAF1\uABEB\uFD3E\uFD3F\uFE10-\uFE19\uFE30-\uFE52\uFE54-\uFE61\uFE63\uFE68\uFE6A\uFE6B\uFF01-\uFF03\uFF05-\uFF0A\uFF0C-\uFF0F\uFF1A\uFF1B\uFF1F\uFF20\uFF3B-\uFF3D\uFF3F\uFF5B\uFF5D\uFF5F-\uFF65])/;
  moduleExports.NOT_WORD =
    /^[\s!-#%-\*,-\/:;\?@\[-\]\{\}\xA1\xA7\xAB\xB6\xB7\xBB\xBF\u037E\u0387\u055A-\u055F\u0589\u058A\u05BE\u05C0\u05C3\u05C6\u05F3\u05F4\u0609\u060A\u060C\u060D\u061B\u061E\u061F\u066A-\u066D\u06D4\u0700-\u070D\u07F7-\u07F9\u0830-\u083E\u085E\u0964\u0965\u0970\u09FD\u0AF0\u0DF4\u0E4F\u0E5A\u0E5B\u0F04-\u0F12\u0F14\u0F3A-\u0F3D\u0F85\u0FD0-\u0FD4\u0FD9\u0FDA\u104A-\u104F\u10FB\u1360-\u1368\u1400\u166D\u166E\u169B\u169C\u16EB-\u16ED\u1735\u1736\u17D4-\u17D6\u17D8-\u17DA\u1800-\u180A\u1944\u1945\u1A1E\u1A1F\u1AA0-\u1AA6\u1AA8-\u1AAD\u1B5A-\u1B60\u1BFC-\u1BFF\u1C3B-\u1C3F\u1C7E\u1C7F\u1CC0-\u1CC7\u1CD3\u2010-\u2027\u2030-\u2043\u2045-\u2051\u2053-\u205E\u207D\u207E\u208D\u208E\u2308-\u230B\u2329\u232A\u2768-\u2775\u27C5\u27C6\u27E6-\u27EF\u2983-\u2998\u29D8-\u29DB\u29FC\u29FD\u2CF9-\u2CFC\u2CFE\u2CFF\u2D70\u2E00-\u2E2E\u2E30-\u2E49\u3001-\u3003\u3008-\u3011\u3014-\u301F\u3030\u303D\u30A0\u30FB\uA4FE\uA4FF\uA60D-\uA60F\uA673\uA67E\uA6F2-\uA6F7\uA874-\uA877\uA8CE\uA8CF\uA8F8-\uA8FA\uA8FC\uA92E\uA92F\uA95F\uA9C1-\uA9CD\uA9DE\uA9DF\uAA5C-\uAA5F\uAADE\uAADF\uAAF0\uAAF1\uABEB\uFD3E\uFD3F\uFE10-\uFE19\uFE30-\uFE52\uFE54-\uFE61\uFE63\uFE68\uFE6A\uFE6B\uFF01-\uFF03\uFF05-\uFF0A\uFF0C-\uFF0F\uFF1A\uFF1B\uFF1F\uFF20\uFF3B-\uFF3D\uFF3F\uFF5B\uFF5D\uFF5F-\uFF65]/;
  moduleExports.WORD_LETTER =
    /[\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u052F\u0531-\u0556\u0559\u0561-\u0587\u05D0-\u05EA\u05F0-\u05F2\u0620-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u0860-\u086A\u08A0-\u08B4\u08B6-\u08BD\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0980\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u09FC\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0AF9\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D\u0C58-\u0C5A\u0C60\u0C61\u0C80\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D54-\u0D56\u0D5F-\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F5\u13F8-\u13FD\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16F1-\u16F8\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1877\u1880-\u1884\u1887-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191E\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1C80-\u1C88\u1CE9-\u1CEC\u1CEE-\u1CF1\u1CF5\u1CF6\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2183\u2184\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2E2F\u3005\u3006\u3031-\u3035\u303B\u303C\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312E\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FEA\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B\uA640-\uA66E\uA67F-\uA69D\uA6A0-\uA6E5\uA717-\uA71F\uA722-\uA788\uA78B-\uA7AE\uA7B0-\uA7B7\uA7F7-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA8FD\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uA9E0-\uA9E4\uA9E6-\uA9EF\uA9FA-\uA9FE\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA7E-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB65\uAB70-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]/;
}
