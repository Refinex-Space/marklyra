// ui/page-breaks.
export default function initializeUiPageBreaks(requireModule, moduleExports, moduleRecord) {
  'use strict';
  if (!this) {
    self;
  }
  moduleRecord.exports = class {
    constructor(editor) {
      this.editor = editor;
    }
    search(context, start, wordLength, suggestionState) {
      var textSlice = context.substring(start, start + wordLength);
      if (textSlice) {
        return new Promise(function (resolvePromise, rejectPromise) {
          if (File.isMac) {
            bridge.callHandler(
              'word.getSpellSuggestionInContext',
              { context: context, start: start, length: wordLength },
              function (match) {
                suggestionState.type = 'word';
                suggestionState.token = textSlice;
                suggestionState.match = match;
                suggestionState.found = match.length;
                suggestionState.pageNo = 0;
                suggestionState.pageCnt = Math.floor((match.length - 1) / 5 + 1);
                resolvePromise(suggestionState);
              },
            );
          } else {
            resolvePromise(suggestionState);
          }
        });
      } else {
        return [];
      }
    }
  };
}
