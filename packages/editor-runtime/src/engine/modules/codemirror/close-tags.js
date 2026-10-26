// codemirror/close-tags.
export default function initializeCodemirrorCloseTags(requireModule, moduleExports, moduleRecord) {
  if (!this) {
    self;
  }
  var CodeMirror = requireModule('libraries/codemirror');
  !(function () {
    CodeMirror.defineOption('autoCloseTags', false, function (editor, options, previousValue) {
      if (previousValue != CodeMirror.Init && previousValue) {
        editor.removeKeyMap('autoCloseTags');
      }
      if (options) {
        var keyMap = { name: 'autoCloseTags' };
        if ('object' != typeof options || options.whenClosing) {
          keyMap["'/'"] = function (editor) {
            return (function (editor) {
              if (editor.getOption('disableInput')) {
                return CodeMirror.Pass;
              } else {
                return completeClosingTag(editor, true);
              }
            })(editor);
          };
        }
        if ('object' != typeof options || options.whenOpening) {
          keyMap["'>'"] = function (editor) {
            return (function (editor) {
              if (editor.getOption('disableInput')) {
                return CodeMirror.Pass;
              }
              for (
                var selections = editor.listSelections(), insertions = [], selectionIndex = 0;
                selectionIndex < selections.length;
                selectionIndex++
              ) {
                if (!selections[selectionIndex].empty()) {
                  return CodeMirror.Pass;
                }
                var cursor = selections[selectionIndex].head,
                  token = editor.getTokenAt(cursor),
                  innerMode = CodeMirror.innerMode(editor.getMode(), token.state),
                  xmlState = innerMode.state;
                if ('xml' != innerMode.mode.name || !xmlState.tagName) {
                  return CodeMirror.Pass;
                }
                var options = editor.getOption('autoCloseTags'),
                  htmlMode = 'html' == innerMode.mode.configuration,
                  dontCloseTags =
                    ('object' == typeof options && options.dontCloseTags) ||
                    (htmlMode && htmlVoidTags),
                  indentTags =
                    ('object' == typeof options && options.indentTags) ||
                    (htmlMode && htmlIndentTags),
                  tagName = xmlState.tagName;
                if (token.end > cursor.ch) {
                  tagName = tagName.slice(0, tagName.length - token.end + cursor.ch);
                }
                var lowerTagName = tagName.toLowerCase();
                if (
                  !tagName ||
                  ('string' == token.type &&
                    (token.end != cursor.ch ||
                      !/[\"\']/.test(token.string.charAt(token.string.length - 1)) ||
                      1 == token.string.length)) ||
                  ('tag' == token.type && 'closeTag' == xmlState.type) ||
                  token.string.indexOf('/') == token.string.length - 1 ||
                  (dontCloseTags && indexOfTag(dontCloseTags, lowerTagName) > -1) ||
                  hasClosingTag(editor, tagName, cursor, xmlState, true)
                ) {
                  return CodeMirror.Pass;
                }
                var indentClosingTag = indentTags && indexOfTag(indentTags, lowerTagName) > -1;
                insertions[selectionIndex] = {
                  indent: indentClosingTag,
                  text: '>' + (indentClosingTag ? '\n\n' : '') + '</' + tagName + '>',
                  newPos: indentClosingTag
                    ? CodeMirror.Pos(cursor.line + 1, 0)
                    : CodeMirror.Pos(cursor.line, cursor.ch + 1),
                };
              }
              for (
                var selectionIndex = selections.length - 1;
                selectionIndex >= 0;
                selectionIndex--
              ) {
                var insertion = insertions[selectionIndex];
                editor.replaceRange(
                  insertion.text,
                  selections[selectionIndex].head,
                  selections[selectionIndex].anchor,
                  '+insert',
                );
                var nextSelections = editor.listSelections().slice(0);
                nextSelections[selectionIndex] = {
                  head: insertion.newPos,
                  anchor: insertion.newPos,
                };
                editor.setSelections(nextSelections);
                if (insertion.indent) {
                  editor.indentLine(insertion.newPos.line, null, true);
                  editor.indentLine(insertion.newPos.line + 1, null, true);
                }
              }
            })(editor);
          };
        }
        editor.addKeyMap(keyMap);
      }
    });
    var htmlVoidTags = [
        'area',
        'base',
        'br',
        'col',
        'command',
        'embed',
        'hr',
        'img',
        'input',
        'keygen',
        'link',
        'meta',
        'param',
        'source',
        'track',
        'wbr',
      ],
      htmlIndentTags = [
        'applet',
        'blockquote',
        'body',
        'button',
        'div',
        'dl',
        'fieldset',
        'form',
        'frameset',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'head',
        'html',
        'iframe',
        'layer',
        'legend',
        'object',
        'ol',
        'p',
        'select',
        'table',
        'ul',
      ];
    function completeClosingTag(editor, afterSlash) {
      for (
        var selections = editor.listSelections(),
          closingTags = [],
          tagPrefix = afterSlash ? '/' : '</',
          selectionIndex = 0;
        selectionIndex < selections.length;
        selectionIndex++
      ) {
        if (!selections[selectionIndex].empty()) {
          return CodeMirror.Pass;
        }
        var closingTag,
          cursor = selections[selectionIndex].head,
          token = editor.getTokenAt(cursor),
          innerMode = CodeMirror.innerMode(editor.getMode(), token.state),
          xmlState = innerMode.state;
        if (
          afterSlash &&
          ('string' == token.type || '<' != token.string.charAt(0) || token.start != cursor.ch - 1)
        ) {
          return CodeMirror.Pass;
        }
        if ('xml' != innerMode.mode.name) {
          if ('htmlmixed' == editor.getMode().name && 'javascript' == innerMode.mode.name) {
            closingTag = tagPrefix + 'script';
          } else {
            if ('htmlmixed' != editor.getMode().name || 'css' != innerMode.mode.name) {
              return CodeMirror.Pass;
            }
            closingTag = tagPrefix + 'style';
          }
        } else {
          if (
            !xmlState.context ||
            !xmlState.context.tagName ||
            hasClosingTag(editor, xmlState.context.tagName, cursor, xmlState)
          ) {
            return CodeMirror.Pass;
          }
          closingTag = tagPrefix + xmlState.context.tagName;
        }
        if ('>' != editor.getLine(cursor.line).charAt(token.end)) {
          closingTag += '>';
        }
        closingTags[selectionIndex] = closingTag;
      }
      editor.replaceSelections(closingTags);
      selections = editor.listSelections();
      for (selectionIndex = 0; selectionIndex < selections.length; selectionIndex++) {
        if (
          selectionIndex == selections.length - 1 ||
          selections[selectionIndex].head.line < selections[selectionIndex + 1].head.line
        ) {
          editor.indentLine(selections[selectionIndex].head.line);
        }
      }
    }
    function indexOfTag(tags, tagName) {
      if (tags.indexOf) {
        return tags.indexOf(tagName);
      }
      for (var tagIndex = 0, tagCount = tags.length; tagIndex < tagCount; ++tagIndex) {
        if (tags[tagIndex] == tagName) {
          return tagIndex;
        }
      }
      return -1;
    }
    function hasClosingTag(editor, tagName, cursor, xmlState, includeCurrentTag) {
      if (!CodeMirror.scanForClosingTag) {
        return false;
      }
      var scanEndLine = Math.min(editor.lastLine() + 1, cursor.line + 500),
        closingTag = CodeMirror.scanForClosingTag(editor, cursor, null, scanEndLine);
      if (!closingTag || closingTag.tag != tagName) {
        return false;
      }
      for (
        var context = xmlState.context, matchingDepth = includeCurrentTag ? 1 : 0;
        context && context.tagName == tagName;
        context = context.prev
      ) {
        ++matchingDepth;
      }
      cursor = closingTag.to;
      for (var depth = 1; depth < matchingDepth; depth++) {
        var nextClosingTag = CodeMirror.scanForClosingTag(editor, cursor, null, scanEndLine);
        if (!nextClosingTag || nextClosingTag.tag != tagName) {
          return false;
        }
        cursor = nextClosingTag.to;
      }
      return true;
    }
    CodeMirror.commands.closeTag = function (editor) {
      return completeClosingTag(editor);
    };
  })();
}
