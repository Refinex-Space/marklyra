// ui/quick-open.
// SystemJS module 53. Dependencies: 11, e, 1d, 27, 29, 13, 52.
$__System.registerDynamic(
  '53',
  ['11', 'e', '1d', '27', '29', '13', '52'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    'use strict';
    this || self;
    var inlineLexer,
      text,
      utilities = requireModule('11'),
      jquery = requireModule('e'),
      rangy = requireModule('1d'),
      dialogs = (requireModule('27').map, requireModule('29')),
      documentModel = requireModule('13'),
      NodeType = (documentModel.Node, documentModel.TYPE),
      outline = requireModule('52'),
      timerId = null,
      p = function (tableOfContents) {
        var outlineHtml = '',
          items = [];
        try {
          !(function (headingNodes) {
            for (var itemIndex = 0; itemIndex < headingNodes.length; itemIndex++)
              if (!headingNodes[itemIndex].isDeleted()) {
                (documentNode = headingNodes[itemIndex]),
                  (outlineHtml +=
                    "<li class='outline-item-wrapper outline-h" +
                    documentNode.get('depth') +
                    "'><div class='outline-item'><span class='outline-expander'></span><span class='outline-label' data-ref='" +
                    documentNode.cid +
                    "'>" +
                    inlineLexer.output(documentNode.get('text')) +
                    "</span></div><ul class='outline-children'>"),
                  items.push(documentNode.get('depth'));
                var nextHeadingDepth =
                  headingNodes[itemIndex + 1] && !headingNodes[itemIndex + 1].isDeleted()
                    ? headingNodes[itemIndex + 1].get('depth')
                    : 1;
                if (nextHeadingDepth <= headingNodes[itemIndex].get('depth'))
                  for (; items.last() && items.last() >= nextHeadingDepth; )
                    (outlineHtml += '</ul></li>'), items.pop();
              }
            var documentNode;
          })(tableOfContents.headers);
        } catch (error) {
          window.debugMode && console.warn(error.stack), (outlineHtml = '');
        }
        return outlineHtml;
      };
    function f(outlineRoot, expandTopLevel) {
      for (
        var elements = outlineRoot.find('.outline-item-wrapper'), itemIndex = 0;
        itemIndex < elements.length;
        itemIndex++
      )
        elements[itemIndex].querySelector('.outline-item-wrapper')
          ? expandTopLevel &&
            elements[itemIndex].classList.contains('outline-h1') &&
            elements[itemIndex].classList.add('outline-item-open')
          : (elements[itemIndex].classList.add('outline-item-signle'),
            elements[itemIndex].classList.add('outline-item-single'));
    }
    moduleRecord.exports = class {
      constructor(parent) {
        (this.editor = parent.editor),
          (this.parent = parent),
          (this.headerStr =
            "h1, h2, h3, h4, h5, h6, [mdlike='h1'], [mdlike='h2'], [mdlike='h3'], [mdlike='h4'], [mdlike='h5'], [mdlike='h6']"),
          (inlineLexer = outline.getTocInlineLexer()),
          this.bindEvents();
      }
      bindEventForSearch() {
        var receiver = this;
        jquery('#marklyra-sidebar')
          .on('click', '#close-outline-filter-btn', function () {
            receiver.hideSearch();
          })
          .on('input', '#file-library-search-input', function () {
            var searchQuery;
            receiver.parent.isOutlineShown() &&
              ((searchQuery = this.value),
              receiver.searchTimer && clearTimeout(receiver.searchTimer),
              (receiver.searchTimer = setTimeout(function () {
                receiver.search(searchQuery);
              })));
          });
      }
      bindEventForToc() {
        var editor = this.editor;
        jquery(document)
          .on('mousedown', '.md-toc-inner', function (mouseEvent) {
            if (1 === mouseEvent.which) {
              var attributeValue = this.parentElement.getAttribute('data-ref'),
                nodeElement = editor.findElemById(attributeValue);
              return (
                editor.store(),
                editor.selection.jumpIntoElemEnd(nodeElement),
                editor.selection.scrollAdjust(nodeElement, 10),
                !1
              );
            }
          })
          .on('mousedown', '.md-delete-toc', function (mouseEvent) {
            1 === mouseEvent.which &&
              editor.UserOp.deleteSelectable(editor, jquery(this).closest('.md-toc'));
          })
          .on('click', '#md-notification .close-btn', function (unusedParameter1) {
            document.body.classList.remove('marklyra-show-notification');
          })
          .on('click', '#md-notification .marklyra-icon-close-btn', function (unusedParameter1) {
            document.body.classList.remove('marklyra-show-notification');
          });
      }
      toggleSearch() {
        this.isShown_ ? this.hideSearch() : this.showSearch();
      }
      expandAll() {
        jquery('#outline-content .outline-item-wrapper').addClass('outline-item-open');
      }
      collapseAll() {
        jquery('#outline-content .outline-item-wrapper').removeClass('outline-item-open');
      }
      useCollapsibleOutline() {
        JSBridge.putSetting('can_collapse_outline_panel', !0),
          File.setCanCollapsePinnedOutline(!0),
          jquery('#outline-content>.outline-item-wrapper').addClass('outline-item-open'),
          this.highlightVisibleHeader();
      }
      useFlatOutline() {
        JSBridge.putSetting('can_collapse_outline_panel', !1), File.setCanCollapsePinnedOutline(!1);
      }
      bindContext() {
        var receiver = this;
        jquery('#outline-menu').on('mousedown', '[data-key]', function (mouseEvent) {
          var attributeValue = this.getAttribute('data-action');
          attributeValue &&
            1 == mouseEvent.which &&
            (jquery('.context-menu').removeClass('show').find('.active').removeClass('active'),
            setTimeout(function () {
              switch (attributeValue) {
                case 'highlight':
                  receiver.highlightVisibleHeader(void 0, void 0, !0, !0);
                  break;
                case 'filter':
                  receiver.toggleSearch();
                  break;
                case 'expand-all':
                  return receiver.expandAll(), !1;
                case 'collapse-all':
                  return receiver.collapseAll(), !1;
                case 'collapsible-outline':
                  receiver.useCollapsibleOutline();
                  break;
                case 'flat-outline':
                  return receiver.useFlatOutline(), !1;
                default:
                  return;
              }
            }, 0),
            receiver.editor.restoreLastCursor(null, !0));
        }),
          jquery('#outline-content').on('contextmenu', function (pointerEvent) {
            receiver.editor.lastCursor = receiver.editor.selection.buildUndo();
            var collapsible = !document.body.classList.contains('no-collapse-outline');
            jquery('#write').blur(),
              jquery('.context-menu').removeClass('show').find('.active').removeClass('active');
            var contextMenu = jquery('#outline-menu').addClass('show');
            collapsible && !receiver.isShown_
              ? (contextMenu.find("[data-action='flat-outline'] a").removeClass('state-on'),
                contextMenu.find("[data-action='collapsible-outline'] a").addClass('state-on'),
                contextMenu.find('[data-collapse]').show())
              : (contextMenu.find("[data-action='flat-outline'] a").addClass('state-on'),
                contextMenu.find("[data-action='collapsible-outline'] a").removeClass('state-on'),
                contextMenu.find('[data-collapse]').hide()),
              receiver.isShown_
                ? (contextMenu.find("[data-action='filter'] a").addClass('state-on'),
                  contextMenu.find('[data-view]').hide())
                : (contextMenu.find("[data-action='filter'] a").removeClass('state-on'),
                  contextMenu.find('[data-view]').show());
            var innerHeight = contextMenu.height() + 48,
              menuLeft =
                pointerEvent.clientX > window.innerWidth - 220
                  ? window.innerWidth - 220
                  : pointerEvent.clientX,
              menuTop =
                pointerEvent.clientY > window.innerHeight - innerHeight
                  ? window.innerHeight - innerHeight
                  : pointerEvent.clientY - jquery('#top-titlebar').height() + 8;
            return contextMenu.css({ top: menuTop + 'px', left: menuLeft + 'px' }), !1;
          });
      }
      bindEventForOutline() {
        var receiver = this,
          editor = this.editor;
        jquery(document)
          .on('click', '.outline-expander', function (unusedParameter1) {
            var attributeValue = this.nextElementSibling.getAttribute('data-ref');
            return (
              jquery(".outline-label[data-ref='" + attributeValue + "']")
                .parent()
                .parent()
                .toggleClass('outline-item-open'),
              !1
            );
          })
          .on('click', '.outline-item', function (unusedParameter1) {
            var attributeValue = this.querySelector('.outline-label').getAttribute('data-ref'),
              nodeElement = editor.findElemById(attributeValue);
            return (
              receiver.autoHideOutline(),
              editor.focusAndRestorePos(),
              editor.selection.scrollAdjust(nodeElement, 10),
              File.isFocusMode && editor.updateFocusMode(!1),
              this.parentElement.classList.add('outline-item-open'),
              !1
            );
          })
          .on('post-wheel', 'content', function (unusedParameter1) {
            document.querySelector('.dropmenu.open') &&
              !File.editor.sourceView.inSourceMode &&
              receiver.highlightVisibleHeaderWithDelay();
          })
          .on('click', '#close-outline-btn, #close-sidebar-btn', function () {
            return editor.focusAndRestorePos(), receiver.hideOutline(), !1;
          })
          .on('click', '#pin-outline-btn', function () {
            return editor.focusAndRestorePos(), editor.library.showSidebar('outline'), !1;
          })
          .on('click', '#unpin-outline-btn', function () {
            return (
              editor.focusAndRestorePos(), editor.library.hideSidebar(), receiver.showOutline(), !1
            );
          }),
          document.querySelector('#sidebar-content').addEventListener(
            'mousewheel',
            function () {
              timerId && clearTimeout(timerId);
            },
            !!File.option.passiveEvents && { passive: !0 },
          );
      }
      bindEvents() {
        this.bindEventForToc(),
          this.bindEventForOutline(),
          this.bindEventForSearch(),
          File.isNodeHtml && this.bindContext();
      }
      showSearch() {
        if (this.parent.isOutlineShown()) {
          this.isShown_ = !0;
          var element = jquery('#marklyra-sidebar'),
            elements = element.find('#file-library-search-input');
          element.hasClass('marklyra-show-outline-filter') ||
            (elements.attr('placeholder', jquery.localize.getString('Filter', 'Front')),
            File.isNodeHtml &&
              (elements.css('width', 'calc(100% - 18px)'),
              element.find('#close-outline-filter-btn').show()),
            element.addClass('marklyra-show-outline-filter'),
            text != elements.val() && elements.val(''),
            elements.val() ? elements.select() : elements.focus());
        }
      }
      hideSearch() {
        this.isShown_ &&
          ((this.isShown_ = !1),
          this.searchTimer && clearTimeout(this.searchTimer),
          jquery('#marklyra-sidebar').removeClass('marklyra-show-outline-filter'),
          this.clearSearch());
      }
      isSearchShown() {
        return this.isShown_;
      }
      clearSearch(keepFilterState) {
        this.searchTimer && clearTimeout(this.searchTimer), (this.searchTimer = null);
        var element = jquery('#marklyra-sidebar');
        keepFilterState || element.removeClass('marklyra-on-outline-filter'),
          element.find('.marklyra-outline-hit').replaceWith(function () {
            return this.innerHTML;
          }),
          element.find('.outline-item.select').removeClass('select'),
          document.querySelectorAll('#outline-content .outline-label').forEach(function (domNode) {
            domNode.parentElement.classList.remove('marklyra-outline-miss');
          });
      }
      search(inputText) {
        if (((text = inputText), inputText.trim().length)) {
          this.clearSearch(!0);
          var element = document.querySelector('#outline-content'),
            regex = new RegExp(utilities.escapeRegExp(inputText), 'i');
          element.querySelectorAll('.outline-label').forEach(function (domNode) {
            var match;
            if ((match = regex.exec(domNode.textContent))) {
              if (
                (domNode.parentElement.classList.remove('marklyra-outline-miss'),
                match[0] && match[0].trim().length)
              ) {
                var range = rangy.createRange();
                range.moveToBookmark({
                  containerNode: domNode,
                  start: match.index,
                  end: match.index + match[0].length,
                }),
                  dialogs.markRange(range, 'marklyra-outline-hit');
              }
            } else domNode.parentElement.classList.add('marklyra-outline-miss');
          }),
            jquery('#marklyra-sidebar').addClass('marklyra-on-outline-filter'),
            (this.searchTimer = null);
        } else this.clearSearch();
      }
      updateOutlineHtml(tableOfContents, forceRefresh) {
        if (forceRefresh || document.body.classList.contains('pin-outline')) {
          var element = document.querySelector('#outline-content'),
            nextOutlineHtml = p(tableOfContents),
            scrollTop = element.scrollTop,
            collapsible = !document.body.classList.contains('no-collapse-outline'),
            items = [],
            wasEmpty = 0 == element.innerHTML.trim().length;
          if (
            ((html = element.innerHTML),
            (comparisonHtml = nextOutlineHtml),
            (previousOutline = jquery(jquery.parseHTML('<div>' + html + '<div>')[0])),
            (nextOutline = jquery(jquery.parseHTML('<div>' + comparisonHtml + '<div>')[0])),
            previousOutline
              .find('.outline-item-open, .outline-active, .outline-item-active')
              .removeClass('outline-item-open')
              .removeClass('outline-item-active')
              .removeClass('outline-active'),
            previousOutline.html() == nextOutline.html())
          )
            return void (forceRefresh && collapsible && f(jquery(element)));
          collapsible &&
            !wasEmpty &&
            jquery(element)
              .find('.outline-item-open>.outline-item>.outline-label')
              .map(function () {
                items.push(this.getAttribute('data-ref'));
              }),
            (element.innerHTML = p(tableOfContents)),
            (element.scrollTop = scrollTop),
            collapsible &&
              (f(jquery(element)),
              jquery(element.querySelector('.outline-active'))
                .parents('.outline-item-wrapper:not(.outline-item-single)')
                .addClass('outline-item-open'),
              wasEmpty
                ? 1 == element.children.length &&
                  element.children[0].classList.add('outline-item-open')
                : items.forEach(function (item) {
                    var domNode = element.querySelector("[data-ref='" + item + "']");
                    domNode &&
                      ((domNode = domNode.parentElement.parentElement).classList.contains(
                        'outline-item-single',
                      ) ||
                        domNode.classList.add('outline-item-open'));
                  })),
            this.highlightVisibleHeader();
        }
        var html, comparisonHtml, previousOutline, nextOutline;
      }
      highlightVisibleHeader(headingElements, preferredIndex, expandAncestors, flashActive) {
        if (document.querySelector('#marklyra-sidebar.open')) {
          var localElement,
            receiver = this,
            editor = this.editor,
            candidateHeadings =
              headingElements || jquery(editor.writingArea).children(this.headerStr),
            lowerIndex = 0,
            upperIndex = candidateHeadings.length - 1,
            activeIndex = void 0 === preferredIndex ? null : preferredIndex;
          if (candidateHeadings.length) {
            for (
              lowerIndex =
                1 === b(candidateHeadings[candidateHeadings.length - 1])
                  ? 0
                  : candidateHeadings.length - 1;
              upperIndex - lowerIndex > 1 && null == activeIndex;
            ) {
              var middleIndex = Math.floor((lowerIndex + upperIndex) / 2),
                viewportRelation = b(candidateHeadings[middleIndex]);
              1 == viewportRelation
                ? (upperIndex = middleIndex)
                : -1 == viewportRelation
                  ? (lowerIndex = middleIndex)
                  : (activeIndex = w(middleIndex));
            }
            if (
              (null == activeIndex && (activeIndex = lowerIndex),
              activeIndex < candidateHeadings.length)
            ) {
              jquery('.outline-item-active').removeClass('outline-item-active'),
                (localElement = jquery('#outline-content .outline-label')
                  .removeClass('outline-active')
                  .filter("[data-ref='" + candidateHeadings[activeIndex].getAttribute('cid') + "']")
                  .addClass('outline-active')
                  .parent()
                  .addClass('outline-item-active'));
              var collapsible = !document.body.classList.contains('no-collapse-outline');
              if (
                (flashActive &&
                  (localElement.addClass('blink-area'),
                  setTimeout(function () {
                    localElement.removeClass('blink-area');
                  }, 2e3)),
                collapsible)
              )
                if (expandAncestors)
                  for (var element = localElement; element.length; )
                    element.addClass('outline-item-open'),
                      (element = element.parent().closest('.outline-item-wrapper'));
                else {
                  var currentElement = localElement.closest('.outline-item-open>.outline-children'),
                    activeOutlineElement = localElement[0];
                  currentElement.length || (currentElement = jquery('#outline-content')),
                    currentElement.length &&
                      (localElement = currentElement
                        .children()
                        .filter(function () {
                          return (
                            this == activeOutlineElement || this.contains(activeOutlineElement)
                          );
                        })
                        .find('.outline-label')
                        .first()
                        .addClass('outline-active')
                        .parent()
                        .addClass('outline-item-active'));
                }
              !(function (outlineItem) {
                if (
                  (!receiver.editor.library || receiver.editor.library.isOutlineShown()) &&
                  outlineItem.length
                ) {
                  var relativeTop,
                    scrollTop,
                    domNode = jquery('#outline-content:visible')[0];
                  domNode &&
                    (File.isNodeHtml || (domNode = domNode.parentElement),
                    (relativeTop = outlineItem.offset().top - jquery(domNode).offset().top) < 0
                      ? (scrollTop = relativeTop - 200 + domNode.scrollTop)
                      : relativeTop > domNode.offsetHeight - 20 &&
                        (scrollTop = relativeTop + 200 - domNode.offsetHeight + domNode.scrollTop),
                    void 0 !== scrollTop && (domNode.scrollTop = scrollTop));
                }
              })(localElement);
            }
          }
          timerId = null;
        }
        function b(headingElement) {
          var scrollOffset = jquery('content').scrollTop(),
            offsetTop = headingElement.offsetTop;
          return offsetTop < scrollOffset
            ? -1
            : offsetTop > scrollOffset + window.innerHeight
              ? 1
              : 0;
        }
        function w(itemIndex) {
          for (itemIndex--; candidateHeadings[itemIndex] && 0 == b(candidateHeadings[itemIndex]); )
            itemIndex--;
          return itemIndex + 1;
        }
      }
      highlightVisibleHeaderWithDelay(headingElements) {
        timerId && clearTimeout(timerId),
          (timerId = setTimeout(
            () => {
              this.highlightVisibleHeader(headingElements);
            },
            File.inBusyMode ? 200 : 100,
          ));
      }
      renderOutline() {
        var outlineHtml = p(this.editor.nodeMap.toc),
          outlineRoot = jquery('.outline-content');
        if (
          (outlineRoot.html(outlineHtml),
          f(outlineRoot, !0),
          this.editor.mathInline && this.editor.mathInline.renderInToc(),
          this.expandedOutlineItem)
        )
          this.expandedOutlineItem.forEach(function (item) {
            try {
              outlineRoot
                .find("[data-ref='" + item + "']")
                .parent()
                .parent()
                .addClass('outline-item-open');
            } catch (error) {}
          }),
            (this.expandedOutlineItem = null);
        else {
          var element = outlineRoot.children();
          element.length < 20 && element.addClass('.outline-item-open');
        }
      }
      moveUpOrDown(moveUp) {
        var element,
          collapsible = !document.body.classList.contains('no-collapse-outline'),
          currentElement = document.querySelector('#outline-content'),
          elements = currentElement.querySelectorAll('.outline-item:not(.marklyra-outline-miss)'),
          domNode = currentElement.querySelector('.select');
        if (!domNode && (domNode = currentElement.querySelector('.outline-active'))) {
          if (!(domNode = domNode.parentElement).classList.contains('marklyra-outline-miss'))
            return void domNode.classList.add('select');
          domNode = null;
        }
        domNode
          ? (element = (function t(currentItem, filterActive) {
              var currentIndex = Array.prototype.indexOf.call(elements, currentItem),
                currentDomNode = elements[moveUp ? currentIndex - 1 : currentIndex + 1] || null;
              if (!currentDomNode || filterActive || !collapsible) return currentDomNode;
              var parentElement = currentDomNode.parentElement.parentElement.parentElement;
              return parentElement.classList.contains('outline-item-open') ||
                !parentElement.classList.contains('outline-item-wrapper')
                ? currentDomNode
                : t(currentDomNode, filterActive);
            })(domNode, document.querySelector('#marklyra-sidebar.marklyra-on-outline-filter'))) &&
            (domNode.classList.remove('select'), element.classList.add('select'))
          : (domNode = elements[0]) && domNode.classList.add('select');
      }
      onEnterKey(keyboardEvent) {
        var trimmedText = keyboardEvent.target.value.trim(),
          domNode = document.querySelector('.outline-item.select');
        domNode && text == trimmedText
          ? (jquery(domNode).children('.outline-label').trigger('click'),
            domNode.parentElement.classList.contains('outline-item-open') ||
              jquery(domNode).children('.outline-expander').trigger('click'),
            setTimeout(function () {
              keyboardEvent.target.focus();
            }, 0))
          : this.search(trimmedText);
      }
      showOutline() {
        this.editor.library.isSidebarShown()
          ? jquery('#toc-content')
              .html(jquery('#outline-content').html())
              .find('.outline-active, .outline-item-active')
              .removeClass('outline-active')
              .removeClass('outline-item-active')
          : this.renderOutline(),
          jquery('.dropdown-menu.open, .dropdown-menu.show')
            .removeClass('open')
            .removeClass('show'),
          document.querySelector('#toc-dropmenu').classList.add('open');
      }
      storeOutline() {
        this.expandedOutlineItem = [];
        for (
          var elements = document.querySelectorAll(
              '.outline-item-open:not(.outline-h1)>.outline-item>.outline-label',
            ),
            itemIndex = 0;
          itemIndex < elements.length;
          itemIndex++
        )
          this.expandedOutlineItem.push(elements[itemIndex].getAttribute('data-ref'));
        return this.expandedOutlineItem;
      }
      hideOutline(unusedParameter1) {
        this.storeOutline(), document.querySelector('#toc-dropmenu').classList.remove('open');
      }
      autoHideOutline() {
        document.querySelector('#toc-dropmenu').classList.contains('open') && this.hideOutline();
      }
      toggleOutline() {
        document.querySelector('#toc-dropmenu.open') ? this.hideOutline() : this.showOutline();
      }
      getHeaderMatrix(plainText) {
        var items = [];
        return (
          this.editor.nodeMap.toc.headers.map(function (documentNode) {
            var headingText =
                documentNode.get('type') == NodeType.heading
                  ? documentNode.get('text')
                  : documentNode.getText().replace(/(^#+)|(#+$)/g, ''),
              renderedTitle = inlineLexer.output(headingText);
            plainText &&
              (renderedTitle = jquery.parseHTML('<div>' + renderedTitle + '<div>')[0].textContent),
              items.push([documentNode.get('depth') - 0, renderedTitle, documentNode.cid]);
          }),
          items
        );
      }
    };
  },
);
