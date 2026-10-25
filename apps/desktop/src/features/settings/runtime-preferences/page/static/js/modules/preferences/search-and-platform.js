// Webpack module 4: search-and-platform.
// Registration order and sparse array indices are defined in bundles.json.
(function (moduleRecord, moduleExports, webpackRequire) {
  'use strict';
  webpackRequire.d(moduleExports, 'c', function () {
    return d;
  }),
    webpackRequire.d(moduleExports, 'd', function () {
      return m;
    }),
    webpackRequire.d(moduleExports, 'a', function () {
      return SettingsSearchContext;
    }),
    webpackRequire.d(moduleExports, 'b', function () {
      return h;
    });
  var slicedToArray = webpackRequire(5),
    toConsumableArray = webpackRequire(21),
    react = webpackRequire(0),
    reactDefault = webpackRequire.n(react),
    localization = webpackRequire(1),
    keyboardShortcuts = webpackRequire(13),
    SettingsSearchContext = reactDefault.a.createContext(''),
    timerId = null,
    p = function (queryValue, searchCallback) {
      return (
        timerId && (clearTimeout(timerId), (timerId = null)),
        (timerId = setTimeout(function () {
          (timerId = null), searchCallback(queryValue);
        }, 100)),
        queryValue
      );
    },
    d = function (text, inputText, dictionaryGroup) {
      if (!text || !inputText) return !1;
      if (inputText.toLowerCase().indexOf(text.toLowerCase()) > -1) return !0;
      if (
        'Base' !== (window.Setting.locale() || 'Base') &&
        Object(localization.a)(inputText, dictionaryGroup)
          .toLowerCase()
          .indexOf(text.toLowerCase()) > -1
      )
        return !0;
      return !1;
    },
    m = function (searchQuery, searchableLabels, dictionaryGroup) {
      if (!searchQuery) return !1;
      var iteration,
        labelIterator = Object(toConsumableArray.a)(searchableLabels);
      try {
        for (labelIterator.s(); !(iteration = labelIterator.n()).done; ) {
          var labelText = iteration.value;
          if (d(searchQuery, labelText, dictionaryGroup)) return !0;
        }
      } catch (error) {
        labelIterator.e(error);
      } finally {
        labelIterator.f();
      }
      return !1;
    },
    h = function (searchProps) {
      var onSearch = searchProps.onSearch,
        ref = reactDefault.a.useRef(null),
        queryState = reactDefault.a.useState(
          (Object(keyboardShortcuts.a)(
            window.isMac ? 'command+f' : 'ctrl+f',
            function (event, unusedParameter2) {
              event.preventDefault(), window.searchOnPreferencePanel();
            },
          ),
          ''),
        ),
        queryStatePair = Object(slicedToArray.a)(queryState, 2),
        queryText = queryStatePair[0],
        setQueryText = queryStatePair[1];
      return (
        (window.searchOnPreferencePanel = function () {
          ref.current && (ref.current.focus(), ref.current.select());
        }),
        reactDefault.a.createElement(
          'div',
          { style: { position: 'relative' }, className: queryText ? ' show-clear-icon' : '' },
          reactDefault.a.createElement('input', {
            ref: ref,
            className: 'search-input',
            type: 'search',
            placeholder: Object(localization.a)('Search for\u2026', 'Panel'),
            value: queryText,
            onChange: function (changeEvent) {
              setQueryText(p(changeEvent.target.value, onSearch));
            },
          }),
          reactDefault.a.createElement('span', {
            className: 'clear-btn-icon icon icon-cancel-circled',
            onMouseDown: function (mouseEvent) {
              setQueryText(p('', onSearch)),
                mouseEvent.preventDefault(),
                mouseEvent.stopPropagation();
            },
          }),
        )
      );
    };
});
