// ui/localization.
export default function initializeUiLocalization(requireModule, moduleExports, moduleRecord) {
  if (!this) {
    self;
  }
  !(function (jquery) {
    var normalizeLanguage;
    normalizeLanguage = function (language) {
      return language;
    };
    jquery.defaultLanguage = normalizeLanguage(
      navigator.languages && navigator.languages.length > 0
        ? navigator.languages[0]
        : navigator.language || navigator.userLanguage,
    );
    jquery.localize = function (namespace, options) {
      var applyTranslations,
        deferred,
        fileExtension,
        translations,
        loadTranslationFile,
        language,
        requestTranslations,
        applyElementTranslation,
        applyObjectTranslation,
        applyImageTranslation,
        applyInputTranslation,
        applyOptionGroupTranslation,
        deliverTranslations,
        buildLanguagePattern,
        applyTranslatedAttribute,
        applyTranslatedText,
        lookupTranslation,
        elements;
      if (null == options) {
        options = {};
      }
      elements = this;
      translations = {};
      fileExtension = options.fileExtension || 'json';
      deferred = jquery.Deferred();
      requestTranslations = function (namespace, language, attempt) {
        switch ((null == attempt && (attempt = 1), attempt)) {
          case 1:
            translations = {};
            return loadTranslationFile(
              language + '.lproj/' + namespace + '.' + fileExtension,
              namespace,
              language,
              attempt,
            );
          default:
            return deferred.resolve();
        }
      };
      loadTranslationFile = function (resourceUrl, namespace, language, attempt) {
        var requestOptions, retryTranslationLoad, acceptTranslationData;
        if (null != options.pathPrefix) {
          resourceUrl = options.pathPrefix + '/' + resourceUrl;
        }
        acceptTranslationData = function (loadedTranslations) {
          jquery.extend(translations, loadedTranslations);
          deliverTranslations(translations);
          return requestTranslations(namespace, language, attempt + 1);
        };
        retryTranslationLoad = function () {
          if (2 === attempt && language.indexOf('-') > -1) {
            return requestTranslations(namespace, language, attempt + 1);
          } else {
            if (options.fallback && options.fallback !== language) {
              return requestTranslations(namespace, options.fallback);
            } else {
              return void 0;
            }
          }
        };
        if (jquery.localize.data[namespace]) {
          return acceptTranslationData(jquery.localize.data[namespace]);
        } else {
          requestOptions = {
            url: resourceUrl,
            dataType: 'json',
            async: true,
            timeout: null != options.timeout ? options.timeout : 500,
            success: acceptTranslationData,
            error: retryTranslationLoad,
          };
          if ('file:' === window.location.protocol) {
            requestOptions.error = function (response) {
              return acceptTranslationData(
                response.responseText ? jquery.parseJSON(response.responseText) : {},
              );
            };
          }
          return jquery.ajax(requestOptions);
        }
      };
      deliverTranslations = function (loadedTranslations) {
        if (null != options.callback) {
          return options.callback(loadedTranslations, applyTranslations);
        } else {
          return applyTranslations(loadedTranslations);
        }
      };
      applyTranslations = function (loadedTranslations) {
        jquery.localize.data[namespace] = loadedTranslations;
        return elements.each(function () {
          var element, translationKey, translation;
          translationKey = (
            (element = jquery(this)).data('localize') ||
            element.data('afterContent') ||
            element.attr('marklyra-hint') ||
            ''
          ).replace(/\\n/g, '\n');
          if ((translation = lookupTranslation(translationKey, loadedTranslations))) {
            return applyElementTranslation(element, translationKey, translation);
          }
        });
      };
      applyElementTranslation = function (element, translationKey, translation) {
        if (element.is('input')) {
          applyInputTranslation(element, translationKey, translation);
        } else {
          if (element.is('textarea')) {
            applyInputTranslation(element, translationKey, translation);
          } else {
            if (element.is('img')) {
              applyImageTranslation(element, translationKey, translation);
            } else {
              if (element.is('optgroup')) {
                applyOptionGroupTranslation(element, translationKey, translation);
              }
            }
          }
        }
        if (element[0].hasAttribute('data-after-content')) {
          element.attr('data-after-content', translation);
        } else {
          if (element[0].hasAttribute('marklyra-hint')) {
            element.attr('marklyra-hint', translation).attr('aria-label', translation);
          } else {
            if (element[0].hasAttribute('data-lt')) {
              element.html(translation);
            } else {
              if (jquery.isPlainObject(translation)) {
                return applyObjectTranslation(element, translation);
              }
              element.text(translation);
            }
          }
        }
      };
      applyInputTranslation = function (element, translationKey, translation) {
        var placeholder;
        placeholder = jquery.isPlainObject(translation) ? translation.value : translation;
        if (element.is('[placeholder]')) {
          return element.attr('placeholder', placeholder);
        }
      };
      applyObjectTranslation = function (element, translation) {
        applyTranslatedAttribute(element, 'title', translation);
        return applyTranslatedText(element, 'text', translation);
      };
      applyOptionGroupTranslation = function (element, translationKey, translation) {
        return element.attr('label', translation);
      };
      applyImageTranslation = function (element, translationKey, translation) {
        applyTranslatedAttribute(element, 'alt', translation);
        return applyTranslatedAttribute(element, 'src', translation);
      };
      lookupTranslation = function (translationKey, translations) {
        if (!translationKey) {
          return '';
        }
        if (translations[translationKey]) {
          return translations[translationKey];
        }
        if (/((\.\.\.)|(…))$/.exec(translationKey)) {
          return (
            (translations[(translationKey = translationKey.replace(/((\.\.\.)|(…))$/, ''))] ||
              translationKey) + '…'
          );
        } else {
          return translationKey;
        }
      };
      applyTranslatedAttribute = function (element, attributeName, translation) {
        if (null != (translation = lookupTranslation(attributeName, translation))) {
          return element.attr(attributeName, translation);
        }
      };
      applyTranslatedText = function (element, textKey, translation) {
        if (null != (translation = lookupTranslation(textKey, translation))) {
          return element.text(translation);
        }
      };
      buildLanguagePattern = function (languages) {
        var language;
        if ('string' == typeof languages) {
          return '^' + languages + '$';
        } else {
          if (null != languages.length) {
            return (function () {
              var languageIndex, languageCount, patterns;
              for (
                patterns = [], languageIndex = 0, languageCount = languages.length;
                languageIndex < languageCount;
                languageIndex++
              ) {
                language = languages[languageIndex];
                patterns.push(buildLanguagePattern(language));
              }
              return patterns;
            })().join('|');
          } else {
            return languages;
          }
        }
      };
      language = normalizeLanguage(options.language ? options.language : jquery.defaultLanguage);
      if (options.skipLanguage && language.match(buildLanguagePattern(options.skipLanguage))) {
        deferred.resolve();
      } else {
        requestTranslations(namespace, language, 1);
      }
      elements.localizePromise = deferred;
      return elements;
    };
    jquery.fn.localize = jquery.localize;
    jquery.localize.getString = function (translationKey, namespace) {
      let translations = jquery.localize.data[namespace || 'Front'] || {};
      if (translationKey) {
        if (translations[translationKey]) {
          return translations[translationKey];
        } else {
          if (/((\.\.\.)|(…))$/.exec(translationKey)) {
            return (
              (translations[(translationKey = translationKey.replace(/((\.\.\.)|(…))$/, ''))] ||
                translationKey) + '…'
            );
          } else {
            return translationKey;
          }
        }
      } else {
        return '';
      }
    };
    jquery.localize.isLoaded = function (namespace) {
      return !!jquery.localize.data[namespace || 'Front'];
    };
    jquery.localize.data = {};
  })(requireModule('libraries/jquery'));
}
