// host/spellchecker.
// SystemJS module 4d. Dependencies: none.
$__System.registerDynamic('4d', [], !0, function (requireModule, moduleExports, moduleRecord) {
  this || self;
  var pathUtilities = reqnode('path'),
    spellcheckerCache = {},
    o = function (userWordsByLanguage) {
      spellcheckerCache = userWordsByLanguage;
    },
    a = function () {
      (this.cache = new Map()),
        (this.dictPath = this.getDictionaryPath()),
        (this.userDictPath = null),
        (this.userListProvider = null);
    };
  (a.prototype.clearCache = function () {
    var items = [];
    this.cache.forEach(function (item, itemIndex) {
      item || items.push(itemIndex);
    }),
      items.forEach(function (item) {
        this.cache.delete(item);
      }, this);
  }),
    (a.prototype.setUserDictProvider = function (userListProvider) {
      this.userListProvider && this.userListProvider.off('update', o),
        (this.userListProvider = userListProvider),
        null != userListProvider &&
          (userListProvider.on('update', o), (spellcheckerCache = userListProvider.loadUserDict()));
    }),
    (a.prototype.wrapSpellChecker = function (nativeSpellchecker, lang) {
      nativeSpellchecker.lang = lang;
      var receiver = this;
      (spellcheckerCache[lang] = spellcheckerCache[lang] || []),
        nativeSpellchecker.__proto__.add.call(nativeSpellchecker, 'MarkLyra'),
        (nativeSpellchecker.add = function (normalizedPath) {
          (normalizedPath = normalizedPath.normalize()),
            receiver.userListProvider && receiver.userListProvider.add(lang, normalizedPath);
        }),
        (nativeSpellchecker.remove = function (normalizedPath) {
          (normalizedPath = normalizedPath.normalize()),
            receiver.userListProvider && receiver.userListProvider.remove(lang, normalizedPath);
        }),
        (nativeSpellchecker.isLearned = function (searchValue) {
          return (
            (searchValue = searchValue.normalize()),
            (spellcheckerCache[lang] || []).indexOf(searchValue) > -1
          );
        }),
        (nativeSpellchecker.isMisspelled = function (normalizedPath) {
          return (
            (normalizedPath = normalizedPath.normalize()),
            nativeSpellchecker.__proto__.isMisspelled.call(nativeSpellchecker, normalizedPath) &&
              !nativeSpellchecker.isLearned(normalizedPath)
          );
        });
    }),
    (a.prototype.getSpellChecker = function (language, retryFailed) {
      var spellchecker = this.cache.get(language);
      if (null != spellchecker || (!retryFailed && this.cache.has(language))) return spellchecker;
      var nativeModule = null;
      try {
        nativeModule = reqnode(
          window.debugMode
            ? '../../launch/app/main.node'
            : `${window.dirname}/node_modules/main.node`,
        );
      } catch (error) {
        if (window.debugMode) throw error;
        return null;
      }
      var Spellchecker = nativeModule.Spellchecker,
        dictionaryLoaded = (spellchecker = new Spellchecker()).setDictionary(
          language,
          this.userDictPath || this.dictPath,
        );
      return (
        dictionaryLoaded ||
          spellchecker.isHunspell() ||
          ((spellchecker = new Spellchecker(!0)),
          (dictionaryLoaded =
            this.userDictPath && spellchecker.setDictionary(language, this.userDictPath))),
        dictionaryLoaded ||
          'en-US' != language ||
          (dictionaryLoaded = spellchecker.setDictionary(language, this.dictPath)),
        (spellchecker = dictionaryLoaded ? spellchecker : null),
        this.cache.set(language, spellchecker),
        spellchecker && this.wrapSpellChecker(spellchecker, language),
        spellchecker
      );
    }),
    (a.prototype.getUserDictionaryPath = function () {
      return this.userDictPath;
    }),
    (a.prototype.setUserDictionaryPath = function (dictionaryPath) {
      return (this.userDictPath = dictionaryPath);
    }),
    (a.prototype.getDictionaryPath = function () {
      return pathUtilities.join(
        window.dirname,
        'node_modules/spellchecker',
        'vendor',
        'hunspell_dictionaries',
      );
    }),
    (a.prototype.detectLanguageForText = function (sourceText, detectOptions) {
      return new Promise(function (resolvePromise) {
        var languageDetector = reqnode('cld');
        try {
          languageDetector.detect(sourceText, detectOptions, function (detectError, detection) {
            return detection
              ? !detection.reliable || detection.languages[0].percent < 85
                ? resolvePromise(null, 'No reliable result for lang check')
                : void resolvePromise(detection.languages[0].code, null)
              : resolvePromise(null, detectError);
          });
        } catch (error) {
          resolvePromise(null, error);
        }
      });
    }),
    (moduleRecord.exports = new a());
});
