// ui/page-breaks.
// SystemJS module 42. Dependencies: none.
$__System.registerDynamic('42', [], !0, function (requireModule, moduleExports, moduleRecord) {
  'use strict';
  this || self;
  moduleRecord.exports = class {
    constructor(editor) {
      this.editor = editor;
    }
    search(context, start, wordLength, suggestionState) {
      var textSlice = context.substring(start, start + wordLength);
      return textSlice
        ? new Promise(function (resolvePromise, rejectPromise) {
            File.isMac
              ? bridge.callHandler(
                  'word.getSpellSuggestionInContext',
                  { context: context, start: start, length: wordLength },
                  function (match) {
                    (suggestionState.type = 'word'),
                      (suggestionState.token = textSlice),
                      (suggestionState.match = match),
                      (suggestionState.found = match.length),
                      (suggestionState.pageNo = 0),
                      (suggestionState.pageCnt = Math.floor((match.length - 1) / 5 + 1)),
                      resolvePromise(suggestionState);
                  },
                )
              : resolvePromise(suggestionState);
          })
        : [];
    }
  };
});
