// host/spellchecker.
export default function initializeHostSpellchecker(requireModule, moduleExports, moduleRecord) {
  if (!this) {
    self;
  }
  var pathUtilities = reqnode('path'),
    spellcheckerCache = {},
    setUserWordsByLanguage = Object.defineProperty(
      function (userWordsByLanguage) {
        spellcheckerCache = userWordsByLanguage;
      },
      'name',
      { value: 'o', configurable: true },
    ),
    Spellchecker = Object.defineProperty(
      function () {
        this.cache = new Map();
        this.dictPath = this.getDictionaryPath();
        this.userDictPath = null;
        this.userListProvider = null;
      },
      'name',
      { value: 'a', configurable: true },
    );
  Spellchecker.prototype.clearCache = function () {
    var items = [];
    this.cache.forEach(function (item, itemIndex) {
      if (!item) {
        items.push(itemIndex);
      }
    });
    items.forEach(function (item) {
      this.cache.delete(item);
    }, this);
  };
  Spellchecker.prototype.setUserDictProvider = function (userListProvider) {
    if (this.userListProvider) {
      this.userListProvider.off('update', setUserWordsByLanguage);
    }
    this.userListProvider = userListProvider;
    if (null != userListProvider) {
      userListProvider.on('update', setUserWordsByLanguage);
      spellcheckerCache = userListProvider.loadUserDict();
    }
  };
  Spellchecker.prototype.wrapSpellChecker = function (nativeSpellchecker, lang) {
    nativeSpellchecker.lang = lang;
    var receiver = this;
    spellcheckerCache[lang] = spellcheckerCache[lang] || [];
    nativeSpellchecker.__proto__.add.call(nativeSpellchecker, 'MarkLyra');
    nativeSpellchecker.add = function (normalizedPath) {
      normalizedPath = normalizedPath.normalize();
      if (receiver.userListProvider) {
        receiver.userListProvider.add(lang, normalizedPath);
      }
    };
    nativeSpellchecker.remove = function (normalizedPath) {
      normalizedPath = normalizedPath.normalize();
      if (receiver.userListProvider) {
        receiver.userListProvider.remove(lang, normalizedPath);
      }
    };
    nativeSpellchecker.isLearned = function (searchValue) {
      searchValue = searchValue.normalize();
      return (spellcheckerCache[lang] || []).indexOf(searchValue) > -1;
    };
    nativeSpellchecker.isMisspelled = function (normalizedPath) {
      normalizedPath = normalizedPath.normalize();
      return (
        nativeSpellchecker.__proto__.isMisspelled.call(nativeSpellchecker, normalizedPath) &&
        !nativeSpellchecker.isLearned(normalizedPath)
      );
    };
  };
  Spellchecker.prototype.getSpellChecker = function (language, retryFailed) {
    var spellchecker = this.cache.get(language);
    if (null != spellchecker || (!retryFailed && this.cache.has(language))) {
      return spellchecker;
    }
    var nativeModule = null;
    try {
      nativeModule = reqnode(
        window.debugMode
          ? '../../launch/app/main.node'
          : `${window.dirname}/node_modules/main.node`,
      );
    } catch (error) {
      if (window.debugMode) {
        throw error;
      }
      return null;
    }
    var Spellchecker = nativeModule.Spellchecker,
      dictionaryLoaded = (spellchecker = new Spellchecker()).setDictionary(
        language,
        this.userDictPath || this.dictPath,
      );
    if (!(dictionaryLoaded || spellchecker.isHunspell())) {
      spellchecker = new Spellchecker(true);
      dictionaryLoaded =
        this.userDictPath && spellchecker.setDictionary(language, this.userDictPath);
    }
    if (!(dictionaryLoaded || 'en-US' != language)) {
      dictionaryLoaded = spellchecker.setDictionary(language, this.dictPath);
    }
    spellchecker = dictionaryLoaded ? spellchecker : null;
    this.cache.set(language, spellchecker);
    if (spellchecker) {
      this.wrapSpellChecker(spellchecker, language);
    }
    return spellchecker;
  };
  Spellchecker.prototype.getUserDictionaryPath = function () {
    return this.userDictPath;
  };
  Spellchecker.prototype.setUserDictionaryPath = function (dictionaryPath) {
    return (this.userDictPath = dictionaryPath);
  };
  Spellchecker.prototype.getDictionaryPath = function () {
    return pathUtilities.join(
      window.dirname,
      'node_modules/spellchecker',
      'vendor',
      'hunspell_dictionaries',
    );
  };
  Spellchecker.prototype.detectLanguageForText = function (sourceText, detectOptions) {
    return new Promise(function (resolvePromise) {
      var languageDetector = reqnode('cld');
      try {
        languageDetector.detect(sourceText, detectOptions, function (detectError, detection) {
          if (detection) {
            if (!detection.reliable || detection.languages[0].percent < 85) {
              return resolvePromise(null, 'No reliable result for lang check');
            } else {
              return void resolvePromise(detection.languages[0].code, null);
            }
          } else {
            return resolvePromise(null, detectError);
          }
        });
      } catch (error) {
        resolvePromise(null, error);
      }
    });
  };
  moduleRecord.exports = new Spellchecker();
}
