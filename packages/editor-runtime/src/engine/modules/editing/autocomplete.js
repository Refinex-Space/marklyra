// editing/autocomplete.
export default function initializeEditingAutocomplete(requireModule, moduleExports, moduleRecord) {
  'use strict';
  if (!this) {
    self;
  }
  requireModule('libraries/codemirror');
  requireModule('shared/utilities');
  var jquery = requireModule('libraries/jquery'),
    undoManager = requireModule('editing/undo-manager'),
    rangy = (requireModule('ui/dialogs'), requireModule('libraries/rangy'));
  moduleRecord.exports = class {
    constructor(inputEditor) {
      this.editor = inputEditor;
      this.$container = jquery('#marklyra-auto-suggest');
      this.onInput = (inputEvent) => {
        this.makeVisible();
        this.update(inputEvent.target.value || inputEvent.target.textContent || '');
      };
      this.onKeydown = (keyboardEvent) => {
        if (false === this.handleKeyEvents(keyboardEvent)) {
          keyboardEvent.preventDefault();
          keyboardEvent.stopPropagation();
        }
      };
      this.onFocus = (unusedParameter1) => {
        this.makeVisible();
      };
      this.onBlur = (unusedParameter1) => {
        this.hide();
      };
      this.initState();
      this.bindEvents();
    }
    bindEvents() {
      this.$container.on('mousedown', 'li[data-content]', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      this.$container.on('click', 'li[data-content]', (event) => {
        this.apply(event.target.closest('[data-content]').getAttribute('data-content'));
        event.preventDefault();
        event.stopPropagation();
      });
      jquery(document).on('click', (unusedParameter1) => {
        if (
          document.activeElement != this.state.anchor &&
          document.activeElement !== editor.brush.articleArea
        ) {
          this.hide();
        }
      });
    }
    initState() {
      this.state = { type: '', token: '', match: [], all: [], index: -1, anchor: null };
    }
    isShown() {
      return this.$container.hasClass('marklyra-show');
    }
    defaultSearchFuncWithoutExtract(queryText) {
      return this.defaultSearchFunc(queryText, true);
    }
    defaultSearchFunc(searchValue, hideExactMatch) {
      searchValue = searchValue.trim().toLowerCase();
      var currentMatch = [];
      this.state.all.map(function (text) {
        if (0 == text.toLowerCase().indexOf(searchValue)) {
          currentMatch.push(text);
        }
      });
      currentMatch.sort((text, inputText) =>
        text.toLowerCase().localeCompare(inputText.toLowerCase()),
      );
      if (hideExactMatch && 1 == currentMatch.length && currentMatch[0] == v) {
        this.state.match = [];
      } else {
        this.state.match = currentMatch;
      }
      return this.state.match;
    }
    apply(text) {
      var domNode = this.state.anchor,
        currentEditor = this.editor;
      text = this.state.beforeApply ? this.state.beforeApply(text) : text;
      this.hide();
      if (domNode) {
        if (void 0 !== domNode.nodeType) {
          (function () {
            if ('INPUT' == domNode.tagName) {
              domNode.value = text;
            } else {
              if (domNode.hasAttribute('contenteditable')) {
                domNode.textContent = text;
              }
            }
            domNode.focus();
            if (domNode.select) {
              domNode.select();
            } else {
              currentEditor.selection.selectAllElem(jquery(this.state.anchor));
            }
            jquery(domNode).trigger('change');
          }).call(this);
        } else {
          if (void 0 !== domNode.start) {
            (function () {
              if (currentEditor && text) {
                var selectionSnapshot = currentEditor.selection.buildUndo();
                try {
                  currentEditor.brush.pause();
                  if (selectionSnapshot) {
                    currentEditor.focusCid = selectionSnapshot.id || selectionSnapshot.startId;
                  } else {
                    currentEditor.refocus(void 0, void 0, true);
                  }
                  var currentDomNode = domNode,
                    range = rangy.createRange(),
                    completionCommand = undoManager.makeEmptyCommand(
                      selectionSnapshot || currentEditor.selection.buildUndo(),
                    ),
                    documentNode = currentEditor.getNode(currentEditor.focusCid);
                  completionCommand.undo.push(undoManager.buildReplaceUndo(documentNode));
                  range.moveToBookmark(currentDomNode);
                  currentEditor.selection.deRange(range);
                  range.deleteContents();
                  range.insertNode(document.createTextNode(text));
                  currentDomNode.start = currentDomNode.start += text.length;
                  currentDomNode.end = currentDomNode.start;
                  currentEditor.store(currentEditor.focusCid, true);
                  range.moveToBookmark(currentDomNode);
                  completionCommand.redo.push(undoManager.buildReplaceUndo(documentNode));
                  currentEditor.selection.setRange(range, true);
                  completionCommand.redo.push(currentEditor.selection.buildUndo());
                  currentEditor.undo.register(completionCommand);
                  if ('fences' == this.state.type) {
                    var splitResult = documentNode.breakOn(false, currentEditor);
                    currentEditor.findElemById(splitResult.oldCid).replaceWith(splitResult.newHtml);
                    currentEditor.selection.jumpIntoElemBegin(
                      currentEditor.findElemById(splitResult.nextFocus),
                    );
                    currentEditor.undo.register(splitResult.command);
                  } else {
                    currentEditor.brush.addToQueue(currentEditor.focusCid, true);
                  }
                } catch (error) {
                  console.sendError(error);
                }
                currentEditor.brush.resume(true);
              }
            }).call(this);
          }
        }
      }
    }
    postScroll() {
      var domNode = this.state.anchor,
        $container = this.$container;
      if ($container && $container.length && domNode) {
        if (domNode.nodeType) {
          this.attachToDom(domNode);
        } else {
          this.initState();
        }
      }
    }
    show(inputMatch, domNode, initialQuery, completionOptions) {
      if (
        this.state.anchor &&
        this.state.anchor.start === domNode.start &&
        void 0 != domNode.start
      ) {
        this.state.anchor = domNode;
        return void this.update(initialQuery);
      }
      this.initState();
      var normalizedOptions = completionOptions || {},
        {
          render: renderSuggestion,
          search: searchSuggestions,
          type: completionType,
          beforeApply: currentBeforeApply,
        } = normalizedOptions;
      this.state.all = this.state.match = inputMatch;
      this.state.type = completionType || '';
      this.state.beforeApply = currentBeforeApply;
      this.render =
        renderSuggestion ||
        function (text, isActive) {
          return (
            "<li class='" +
            (isActive ? 'active' : '') +
            '\' data-content="' +
            text.replace(/[']/g, '&quot;') +
            '" > ' +
            text +
            '</span></li>'
          );
        };
      this.search = searchSuggestions || this.defaultSearchFunc;
      this.$container.css('max-height', 'none');
      this.state.anchor = domNode;
      var $container = this.$container;
      if ($container && $container.length && domNode) {
        if (domNode.nodeType) {
          this.attachToDom(domNode);
        }
        if (void 0 !== domNode.start) {
          this.attachToRange(domNode);
        }
        if (void 0 !== initialQuery) {
          this.update(initialQuery);
        }
      }
    }
    attachToRange() {
      var $container = this.$container;
      if (!this.isShown()) {
        var currentBounds = window.getSelection().getRangeAt(0).getClientRects()[0],
          bounds = document.querySelector('content').getBoundingClientRect(),
          left = currentBounds.left - 15;
        left = left + 200 > window.innerWidth ? window.innerWidth - 200 : left;
        $container
          .css({
            top:
              currentBounds.bottom +
              (window._shouldFixFontGlitch ? jquery('content').scrollTop() - bounds.top : 0),
            left: left,
            right: 'auto',
          })
          .addClass('marklyra-show');
      }
    }
    attachToDom(anchorElement) {
      jquery(anchorElement)
        .off('input', this.onInput)
        .on('input', this.onInput)
        .off('keydown', this.onKeydown)
        .on('keydown', this.onKeydown)
        .on('blur', this.onBlur)
        .on('remove', function (inputEvent) {
          console.debug('dom removed');
          jquery(inputEvent.target).off();
        });
    }
    updateDom() {
      if (0 == this.state.match.length) {
        this.$container.removeClass('marklyra-show');
      } else {
        var { match: items, index: selectedIndex, type: completionType } = this.state;
        this.$container
          .addClass('marklyra-show')
          .html(
            "<ul class='auto-suggest-for-" +
              (completionType || 'common') +
              "'>%@</ul>".replace(
                '%@',
                items
                  .map((item, itemIndex) => this.render(item, itemIndex == selectedIndex))
                  .join(''),
              ),
          );
        if ('none' == this.$container.css('max-height')) {
          var clientHeight = this.$container.find('li')[0].clientHeight;
          this.state.rowHeight = clientHeight;
          this.$container.css('max-height', 5 * clientHeight + 12 + 'px');
        }
      }
    }
    updateActive(previousIndex) {
      this.$container.find('.active').removeClass('active');
      var rowHeight = this.state.rowHeight;
      if (this.state.index >= 0) {
        var element,
          activeItem = this.$container
            .find('li:nth-child(' + (this.state.index + 1) + ')')
            .addClass('active'),
          scrollOffset = this.$container.scrollTop(),
          offsetTop = activeItem[0].offsetTop;
        if (offsetTop < scrollOffset || offsetTop + rowHeight > 5 * rowHeight + scrollOffset) {
          element = this.$container[0].querySelector('li:nth-child(' + (previousIndex + 1) + ')');
          this.$container.scrollTop(element.offsetTop);
        }
      }
    }
    update(token) {
      this.state.token = token;
      this.state.match = this.search(token);
      if (this.state.match.length) {
        this.state.index = Math.min(this.state.index, 0);
      } else {
        this.state.index = -1;
      }
      this.updateDom();
    }
    makeVisible() {
      if (
        this.state.anchor &&
        this.state.match.length &&
        !this.$container.hasClass('marklyra-show') &&
        void 0 !== this.state.anchor.nodeType
      ) {
        var anchor = this.state.anchor,
          bounds = anchor.getClientRects()[0];
        this.$container
          .css({
            top: bounds.bottom + 6,
            left: bounds.left,
            minWidth: bounds.right - bounds.left + 'px',
          })
          .addClass('marklyra-show');
        this.update(anchor.value || anchor.textContent || '');
      }
    }
    hide() {
      this.$container.removeClass('marklyra-show');
    }
    handleKeyEvents(keyboardEvent) {
      if (this.editor.fences.autoSuggestCodeLang(keyboardEvent)) {
        return false;
      }
      var { index: selectedIndex, match: matchedItems } = this.state,
        length = matchedItems.length;
      if (length && this.isShown()) {
        if (
          !keyboardEvent.shiftKey ||
          ('ArrowDown' != keyboardEvent.key &&
            'ArrowUp' != keyboardEvent.key &&
            'PageDown' != keyboardEvent.key &&
            'PageUp' != keyboardEvent.key &&
            'Home' != keyboardEvent.key &&
            'End' != keyboardEvent.key)
        ) {
          if ('ArrowDown' == keyboardEvent.key) {
            this.state.index = selectedIndex < 0 ? 0 : Math.min(selectedIndex + 1, length - 1);
            this.updateActive(this.state.index);
            return false;
          }
          if ('ArrowUp' == keyboardEvent.key) {
            if (selectedIndex < 0) {
              return;
            }
            this.state.index = Math.max(selectedIndex - 1, 0);
            this.updateActive(Math.max(this.state.index - 4, 0));
            return false;
          }
          if ('PageDown' == keyboardEvent.key) {
            this.state.index = selectedIndex < 0 ? 0 : Math.min(selectedIndex + 5, length - 1);
            this.updateActive(this.state.index);
            return false;
          }
          if ('PageUp' == keyboardEvent.key) {
            if (selectedIndex < 0) {
              return;
            }
            this.state.index = Math.max(selectedIndex - 5, 0);
            this.updateActive(Math.max(this.state.index - 4, 0));
            return false;
          }
          if ('End' == keyboardEvent.key) {
            this.state.index = selectedIndex < 0 ? 0 : length - 1;
            this.updateActive(length - 1);
            return false;
          }
          if ('Home' == keyboardEvent.key) {
            if (selectedIndex < 0) {
              return;
            }
            this.state.index = 0;
            this.updateActive(0);
            return false;
          }
          if ('Enter' == keyboardEvent.key) {
            if (this.state.index >= 0) {
              this.apply(this.state.match[this.state.index]);
              return false;
            }
            this.hide();
          } else {
            if ('Escape' == keyboardEvent.key) {
              this.hide();
              return false;
            }
          }
        } else {
          this.hide();
        }
      }
    }
  };
}
