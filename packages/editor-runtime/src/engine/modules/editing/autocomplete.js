// editing/autocomplete.
// SystemJS module 26. Dependencies: 20, 11, e, 1b, 29, 1d.
$__System.registerDynamic(
  '26',
  ['20', '11', 'e', '1b', '29', '1d'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    'use strict';
    this || self, requireModule('20'), requireModule('11');
    var jquery = requireModule('e'),
      undoManager = requireModule('1b'),
      rangy = (requireModule('29'), requireModule('1d'));
    moduleRecord.exports = class {
      constructor(inputEditor) {
        (this.editor = inputEditor),
          (this.$container = jquery('#marklyra-auto-suggest')),
          (this.onInput = (inputEvent) => {
            this.makeVisible(),
              this.update(inputEvent.target.value || inputEvent.target.textContent || '');
          }),
          (this.onKeydown = (keyboardEvent) => {
            !1 === this.handleKeyEvents(keyboardEvent) &&
              (keyboardEvent.preventDefault(), keyboardEvent.stopPropagation());
          }),
          (this.onFocus = (unusedParameter1) => {
            this.makeVisible();
          }),
          (this.onBlur = (unusedParameter1) => {
            this.hide();
          }),
          this.initState(),
          this.bindEvents();
      }
      bindEvents() {
        this.$container.on('mousedown', 'li[data-content]', (event) => {
          event.preventDefault(), event.stopPropagation();
        }),
          this.$container.on('click', 'li[data-content]', (event) => {
            this.apply(event.target.closest('[data-content]').getAttribute('data-content')),
              event.preventDefault(),
              event.stopPropagation();
          }),
          jquery(document).on('click', (unusedParameter1) => {
            document.activeElement != this.state.anchor &&
              document.activeElement !== editor.brush.articleArea &&
              this.hide();
          });
      }
      initState() {
        this.state = { type: '', token: '', match: [], all: [], index: -1, anchor: null };
      }
      isShown() {
        return this.$container.hasClass('marklyra-show');
      }
      defaultSearchFuncWithoutExtract(queryText) {
        return this.defaultSearchFunc(queryText, !0);
      }
      defaultSearchFunc(searchValue, hideExactMatch) {
        searchValue = searchValue.trim().toLowerCase();
        var currentMatch = [];
        return (
          this.state.all.map(function (text) {
            0 == text.toLowerCase().indexOf(searchValue) && currentMatch.push(text);
          }),
          currentMatch.sort((text, inputText) =>
            text.toLowerCase().localeCompare(inputText.toLowerCase()),
          ),
          hideExactMatch && 1 == currentMatch.length && currentMatch[0] == v
            ? (this.state.match = [])
            : (this.state.match = currentMatch),
          this.state.match
        );
      }
      apply(text) {
        var domNode = this.state.anchor,
          currentEditor = this.editor;
        (text = this.state.beforeApply ? this.state.beforeApply(text) : text),
          this.hide(),
          domNode &&
            (void 0 !== domNode.nodeType
              ? function () {
                  'INPUT' == domNode.tagName
                    ? (domNode.value = text)
                    : domNode.hasAttribute('contenteditable') && (domNode.textContent = text),
                    domNode.focus(),
                    domNode.select
                      ? domNode.select()
                      : currentEditor.selection.selectAllElem(jquery(this.state.anchor)),
                    jquery(domNode).trigger('change');
                }.call(this)
              : void 0 !== domNode.start &&
                function () {
                  if (currentEditor && text) {
                    var selectionSnapshot = currentEditor.selection.buildUndo();
                    try {
                      currentEditor.brush.pause(),
                        selectionSnapshot
                          ? (currentEditor.focusCid =
                              selectionSnapshot.id || selectionSnapshot.startId)
                          : currentEditor.refocus(void 0, void 0, !0);
                      var currentDomNode = domNode,
                        range = rangy.createRange(),
                        completionCommand = undoManager.makeEmptyCommand(
                          selectionSnapshot || currentEditor.selection.buildUndo(),
                        ),
                        documentNode = currentEditor.getNode(currentEditor.focusCid);
                      if (
                        (completionCommand.undo.push(undoManager.buildReplaceUndo(documentNode)),
                        range.moveToBookmark(currentDomNode),
                        currentEditor.selection.deRange(range),
                        range.deleteContents(),
                        range.insertNode(document.createTextNode(text)),
                        (currentDomNode.start = currentDomNode.start += text.length),
                        (currentDomNode.end = currentDomNode.start),
                        currentEditor.store(currentEditor.focusCid, !0),
                        range.moveToBookmark(currentDomNode),
                        completionCommand.redo.push(undoManager.buildReplaceUndo(documentNode)),
                        currentEditor.selection.setRange(range, !0),
                        completionCommand.redo.push(currentEditor.selection.buildUndo()),
                        currentEditor.undo.register(completionCommand),
                        'fences' == this.state.type)
                      ) {
                        var splitResult = documentNode.breakOn(!1, currentEditor);
                        currentEditor
                          .findElemById(splitResult.oldCid)
                          .replaceWith(splitResult.newHtml),
                          currentEditor.selection.jumpIntoElemBegin(
                            currentEditor.findElemById(splitResult.nextFocus),
                          ),
                          currentEditor.undo.register(splitResult.command);
                      } else currentEditor.brush.addToQueue(currentEditor.focusCid, !0);
                    } catch (error) {
                      console.sendError(error);
                    }
                    currentEditor.brush.resume(!0);
                  }
                }.call(this));
      }
      postScroll() {
        var domNode = this.state.anchor,
          $container = this.$container;
        $container &&
          $container.length &&
          domNode &&
          (domNode.nodeType ? this.attachToDom(domNode) : this.initState());
      }
      show(inputMatch, domNode, initialQuery, completionOptions) {
        if (
          this.state.anchor &&
          this.state.anchor.start === domNode.start &&
          void 0 != domNode.start
        )
          return (this.state.anchor = domNode), void this.update(initialQuery);
        this.initState();
        var normalizedOptions = completionOptions || {},
          {
            render: o,
            search: searchSuggestions,
            type: completionType,
            beforeApply: currentBeforeApply,
          } = normalizedOptions;
        (this.state.all = this.state.match = inputMatch),
          (this.state.type = completionType || ''),
          (this.state.beforeApply = currentBeforeApply),
          (this.render =
            o ||
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
            }),
          (this.search = searchSuggestions || this.defaultSearchFunc),
          this.$container.css('max-height', 'none'),
          (this.state.anchor = domNode);
        var $container = this.$container;
        $container &&
          $container.length &&
          domNode &&
          (domNode.nodeType && this.attachToDom(domNode),
          void 0 !== domNode.start && this.attachToRange(domNode),
          void 0 !== initialQuery && this.update(initialQuery));
      }
      attachToRange() {
        var $container = this.$container;
        if (!this.isShown()) {
          var currentBounds = window.getSelection().getRangeAt(0).getClientRects()[0],
            bounds = document.querySelector('content').getBoundingClientRect(),
            left = currentBounds.left - 15;
          (left = left + 200 > window.innerWidth ? window.innerWidth - 200 : left),
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
            console.debug('dom removed'), jquery(inputEvent.target).off();
          });
      }
      updateDom() {
        if (0 == this.state.match.length) this.$container.removeClass('marklyra-show');
        else {
          var { match: items, index: selectedIndex, type: completionType } = this.state;
          if (
            (this.$container
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
              ),
            'none' == this.$container.css('max-height'))
          ) {
            var clientHeight = this.$container.find('li')[0].clientHeight;
            (this.state.rowHeight = clientHeight),
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
          (offsetTop < scrollOffset || offsetTop + rowHeight > 5 * rowHeight + scrollOffset) &&
            ((element = this.$container[0].querySelector(
              'li:nth-child(' + (previousIndex + 1) + ')',
            )),
            this.$container.scrollTop(element.offsetTop));
        }
      }
      update(token) {
        (this.state.token = token),
          (this.state.match = this.search(token)),
          this.state.match.length
            ? (this.state.index = Math.min(this.state.index, 0))
            : (this.state.index = -1),
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
            .addClass('marklyra-show'),
            this.update(anchor.value || anchor.textContent || '');
        }
      }
      hide() {
        this.$container.removeClass('marklyra-show');
      }
      handleKeyEvents(keyboardEvent) {
        if (this.editor.fences.autoSuggestCodeLang(keyboardEvent)) return !1;
        var { index: selectedIndex, match: matchedItems } = this.state,
          length = matchedItems.length;
        if (length && this.isShown())
          if (
            !keyboardEvent.shiftKey ||
            ('ArrowDown' != keyboardEvent.key &&
              'ArrowUp' != keyboardEvent.key &&
              'PageDown' != keyboardEvent.key &&
              'PageUp' != keyboardEvent.key &&
              'Home' != keyboardEvent.key &&
              'End' != keyboardEvent.key)
          ) {
            if ('ArrowDown' == keyboardEvent.key)
              return (
                (this.state.index =
                  selectedIndex < 0 ? 0 : Math.min(selectedIndex + 1, length - 1)),
                this.updateActive(this.state.index),
                !1
              );
            if ('ArrowUp' == keyboardEvent.key) {
              if (selectedIndex < 0) return;
              return (
                (this.state.index = Math.max(selectedIndex - 1, 0)),
                this.updateActive(Math.max(this.state.index - 4, 0)),
                !1
              );
            }
            if ('PageDown' == keyboardEvent.key)
              return (
                (this.state.index =
                  selectedIndex < 0 ? 0 : Math.min(selectedIndex + 5, length - 1)),
                this.updateActive(this.state.index),
                !1
              );
            if ('PageUp' == keyboardEvent.key) {
              if (selectedIndex < 0) return;
              return (
                (this.state.index = Math.max(selectedIndex - 5, 0)),
                this.updateActive(Math.max(this.state.index - 4, 0)),
                !1
              );
            }
            if ('End' == keyboardEvent.key)
              return (
                (this.state.index = selectedIndex < 0 ? 0 : length - 1),
                this.updateActive(length - 1),
                !1
              );
            if ('Home' == keyboardEvent.key) {
              if (selectedIndex < 0) return;
              return (this.state.index = 0), this.updateActive(0), !1;
            }
            if ('Enter' == keyboardEvent.key) {
              if (this.state.index >= 0) return this.apply(this.state.match[this.state.index]), !1;
              this.hide();
            } else if ('Escape' == keyboardEvent.key) return this.hide(), !1;
          } else this.hide();
      }
    };
  },
);
