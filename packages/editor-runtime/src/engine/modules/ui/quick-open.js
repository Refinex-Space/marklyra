// ui/quick-open.
export default function initializeUiQuickOpen(requireModule, moduleExports, moduleRecord) {
  'use strict';

  if (!this) {
    self;
  }
  var inlineLexer,
    text,
    utilities = requireModule('shared/utilities'),
    jquery = requireModule('libraries/jquery'),
    rangy = requireModule('libraries/rangy'),
    dialogs = (requireModule('editing/keyboard-shortcuts').map, requireModule('ui/dialogs')),
    documentModel = requireModule('model/document-model'),
    NodeType = (documentModel.Node, documentModel.TYPE),
    outline = requireModule('ui/outline'),
    timerId = null,
    renderQuickOpenOutline = function (tableOfContents) {
      var outlineHtml = '',
        items = [];
      try {
        !(function (headingNodes) {
          for (var itemIndex = 0; itemIndex < headingNodes.length; itemIndex++) {
            if (!headingNodes[itemIndex].isDeleted()) {
              documentNode = headingNodes[itemIndex];
              outlineHtml +=
                "<li class='outline-item-wrapper outline-h" +
                documentNode.get('depth') +
                "'><div class='outline-item'><span class='outline-expander'></span><span class='outline-label' data-ref='" +
                documentNode.cid +
                "'>" +
                inlineLexer.output(documentNode.get('text')) +
                "</span></div><ul class='outline-children'>";
              items.push(documentNode.get('depth'));
              var nextHeadingDepth =
                headingNodes[itemIndex + 1] && !headingNodes[itemIndex + 1].isDeleted()
                  ? headingNodes[itemIndex + 1].get('depth')
                  : 1;
              if (nextHeadingDepth <= headingNodes[itemIndex].get('depth')) {
                for (; items.last() && items.last() >= nextHeadingDepth; ) {
                  outlineHtml += '</ul></li>';
                  items.pop();
                }
              }
            }
          }
          var documentNode;
        })(tableOfContents.headers);
      } catch (error) {
        if (window.debugMode) {
          console.warn(error.stack);
        }
        outlineHtml = '';
      }
      return outlineHtml;
    };
  function setOutlineExpansion(outlineRoot, expandTopLevel) {
    for (
      var elements = outlineRoot.find('.outline-item-wrapper'), itemIndex = 0;
      itemIndex < elements.length;
      itemIndex++
    ) {
      if (elements[itemIndex].querySelector('.outline-item-wrapper')) {
        if (expandTopLevel && elements[itemIndex].classList.contains('outline-h1')) {
          elements[itemIndex].classList.add('outline-item-open');
        }
      } else {
        elements[itemIndex].classList.add('outline-item-signle');
        elements[itemIndex].classList.add('outline-item-single');
      }
    }
  }
  moduleRecord.exports = class {
    constructor(parent) {
      this.editor = parent.editor;
      this.parent = parent;
      this.headerStr =
        "h1, h2, h3, h4, h5, h6, [mdlike='h1'], [mdlike='h2'], [mdlike='h3'], [mdlike='h4'], [mdlike='h5'], [mdlike='h6']";
      inlineLexer = outline.getTocInlineLexer();
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
          if (receiver.parent.isOutlineShown()) {
            searchQuery = this.value;
            if (receiver.searchTimer) {
              clearTimeout(receiver.searchTimer);
            }
            receiver.searchTimer = setTimeout(function () {
              receiver.search(searchQuery);
            });
          }
        });
    }
    bindEventForToc() {
      var editor = this.editor;
      jquery(document)
        .on('mousedown', '.md-toc-inner', function (mouseEvent) {
          if (1 === mouseEvent.which) {
            var attributeValue = this.parentElement.getAttribute('data-ref'),
              nodeElement = editor.findElemById(attributeValue);
            editor.store();
            editor.selection.jumpIntoElemEnd(nodeElement);
            editor.selection.scrollAdjust(nodeElement, 10);
            return false;
          }
        })
        .on('mousedown', '.md-delete-toc', function (mouseEvent) {
          if (1 === mouseEvent.which) {
            editor.UserOp.deleteSelectable(editor, jquery(this).closest('.md-toc'));
          }
        })
        .on('click', '#md-notification .close-btn', function (unusedParameter1) {
          document.body.classList.remove('marklyra-show-notification');
        })
        .on('click', '#md-notification .marklyra-icon-close-btn', function (unusedParameter1) {
          document.body.classList.remove('marklyra-show-notification');
        });
    }
    toggleSearch() {
      if (this.isShown_) {
        this.hideSearch();
      } else {
        this.showSearch();
      }
    }
    expandAll() {
      jquery('#outline-content .outline-item-wrapper').addClass('outline-item-open');
    }
    collapseAll() {
      jquery('#outline-content .outline-item-wrapper').removeClass('outline-item-open');
    }
    useCollapsibleOutline() {
      JSBridge.putSetting('can_collapse_outline_panel', true);
      File.setCanCollapsePinnedOutline(true);
      jquery('#outline-content>.outline-item-wrapper').addClass('outline-item-open');
      this.highlightVisibleHeader();
    }
    useFlatOutline() {
      JSBridge.putSetting('can_collapse_outline_panel', false);
      File.setCanCollapsePinnedOutline(false);
    }
    bindContext() {
      var receiver = this;
      jquery('#outline-menu').on('mousedown', '[data-key]', function (mouseEvent) {
        var attributeValue = this.getAttribute('data-action');
        if (attributeValue && 1 == mouseEvent.which) {
          jquery('.context-menu').removeClass('show').find('.active').removeClass('active');
          setTimeout(function () {
            switch (attributeValue) {
              case 'highlight':
                receiver.highlightVisibleHeader(void 0, void 0, true, true);
                break;
              case 'filter':
                receiver.toggleSearch();
                break;
              case 'expand-all':
                receiver.expandAll();
                return false;
              case 'collapse-all':
                receiver.collapseAll();
                return false;
              case 'collapsible-outline':
                receiver.useCollapsibleOutline();
                break;
              case 'flat-outline':
                receiver.useFlatOutline();
                return false;
              default:
                return;
            }
          }, 0);
          receiver.editor.restoreLastCursor(null, true);
        }
      });
      jquery('#outline-content').on('contextmenu', function (pointerEvent) {
        receiver.editor.lastCursor = receiver.editor.selection.buildUndo();
        var collapsible = !document.body.classList.contains('no-collapse-outline');
        jquery('#write').blur();
        jquery('.context-menu').removeClass('show').find('.active').removeClass('active');
        var contextMenu = jquery('#outline-menu').addClass('show');
        if (collapsible && !receiver.isShown_) {
          contextMenu.find("[data-action='flat-outline'] a").removeClass('state-on');
          contextMenu.find("[data-action='collapsible-outline'] a").addClass('state-on');
          contextMenu.find('[data-collapse]').show();
        } else {
          contextMenu.find("[data-action='flat-outline'] a").addClass('state-on');
          contextMenu.find("[data-action='collapsible-outline'] a").removeClass('state-on');
          contextMenu.find('[data-collapse]').hide();
        }
        if (receiver.isShown_) {
          contextMenu.find("[data-action='filter'] a").addClass('state-on');
          contextMenu.find('[data-view]').hide();
        } else {
          contextMenu.find("[data-action='filter'] a").removeClass('state-on');
          contextMenu.find('[data-view]').show();
        }
        var innerHeight = contextMenu.height() + 48,
          menuLeft =
            pointerEvent.clientX > window.innerWidth - 220
              ? window.innerWidth - 220
              : pointerEvent.clientX,
          menuTop =
            pointerEvent.clientY > window.innerHeight - innerHeight
              ? window.innerHeight - innerHeight
              : pointerEvent.clientY - jquery('#top-titlebar').height() + 8;
        contextMenu.css({ top: menuTop + 'px', left: menuLeft + 'px' });
        return false;
      });
    }
    bindEventForOutline() {
      var receiver = this,
        editor = this.editor;
      jquery(document)
        .on('click', '.outline-expander', function (unusedParameter1) {
          var attributeValue = this.nextElementSibling.getAttribute('data-ref');
          jquery(".outline-label[data-ref='" + attributeValue + "']")
            .parent()
            .parent()
            .toggleClass('outline-item-open');
          return false;
        })
        .on('click', '.outline-item', function (unusedParameter1) {
          var attributeValue = this.querySelector('.outline-label').getAttribute('data-ref'),
            nodeElement = editor.findElemById(attributeValue);
          receiver.autoHideOutline();
          editor.focusAndRestorePos();
          editor.selection.scrollAdjust(nodeElement, 10);
          if (File.isFocusMode) {
            editor.updateFocusMode(false);
          }
          this.parentElement.classList.add('outline-item-open');
          return false;
        })
        .on('post-wheel', 'content', function (unusedParameter1) {
          if (document.querySelector('.dropmenu.open') && !File.editor.sourceView.inSourceMode) {
            receiver.highlightVisibleHeaderWithDelay();
          }
        })
        .on('click', '#close-outline-btn, #close-sidebar-btn', function () {
          editor.focusAndRestorePos();
          receiver.hideOutline();
          return false;
        })
        .on('click', '#pin-outline-btn', function () {
          editor.focusAndRestorePos();
          editor.library.showSidebar('outline');
          return false;
        })
        .on('click', '#unpin-outline-btn', function () {
          editor.focusAndRestorePos();
          editor.library.hideSidebar();
          receiver.showOutline();
          return false;
        });
      document.querySelector('#sidebar-content').addEventListener(
        'mousewheel',
        function () {
          if (timerId) {
            clearTimeout(timerId);
          }
        },
        !!File.option.passiveEvents && { passive: true },
      );
    }
    bindEvents() {
      this.bindEventForToc();
      this.bindEventForOutline();
      this.bindEventForSearch();
      if (File.isNodeHtml) {
        this.bindContext();
      }
    }
    showSearch() {
      if (this.parent.isOutlineShown()) {
        this.isShown_ = true;
        var element = jquery('#marklyra-sidebar'),
          elements = element.find('#file-library-search-input');
        if (!element.hasClass('marklyra-show-outline-filter')) {
          elements.attr('placeholder', jquery.localize.getString('Filter', 'Front'));
          if (File.isNodeHtml) {
            elements.css('width', 'calc(100% - 18px)');
            element.find('#close-outline-filter-btn').show();
          }
          element.addClass('marklyra-show-outline-filter');
          if (text != elements.val()) {
            elements.val('');
          }
          if (elements.val()) {
            elements.select();
          } else {
            elements.focus();
          }
        }
      }
    }
    hideSearch() {
      if (this.isShown_) {
        this.isShown_ = false;
        if (this.searchTimer) {
          clearTimeout(this.searchTimer);
        }
        jquery('#marklyra-sidebar').removeClass('marklyra-show-outline-filter');
        this.clearSearch();
      }
    }
    isSearchShown() {
      return this.isShown_;
    }
    clearSearch(keepFilterState) {
      if (this.searchTimer) {
        clearTimeout(this.searchTimer);
      }
      this.searchTimer = null;
      var element = jquery('#marklyra-sidebar');
      if (!keepFilterState) {
        element.removeClass('marklyra-on-outline-filter');
      }
      element.find('.marklyra-outline-hit').replaceWith(function () {
        return this.innerHTML;
      });
      element.find('.outline-item.select').removeClass('select');
      document.querySelectorAll('#outline-content .outline-label').forEach(function (domNode) {
        domNode.parentElement.classList.remove('marklyra-outline-miss');
      });
    }
    search(inputText) {
      text = inputText;
      if (inputText.trim().length) {
        this.clearSearch(true);
        var element = document.querySelector('#outline-content'),
          regex = new RegExp(utilities.escapeRegExp(inputText), 'i');
        element.querySelectorAll('.outline-label').forEach(function (domNode) {
          var match;
          if ((match = regex.exec(domNode.textContent))) {
            domNode.parentElement.classList.remove('marklyra-outline-miss');
            if (match[0] && match[0].trim().length) {
              var range = rangy.createRange();
              range.moveToBookmark({
                containerNode: domNode,
                start: match.index,
                end: match.index + match[0].length,
              });
              dialogs.markRange(range, 'marklyra-outline-hit');
            }
          } else {
            domNode.parentElement.classList.add('marklyra-outline-miss');
          }
        });
        jquery('#marklyra-sidebar').addClass('marklyra-on-outline-filter');
        this.searchTimer = null;
      } else {
        this.clearSearch();
      }
    }
    updateOutlineHtml(tableOfContents, forceRefresh) {
      if (forceRefresh || document.body.classList.contains('pin-outline')) {
        var element = document.querySelector('#outline-content'),
          nextOutlineHtml = renderQuickOpenOutline(tableOfContents),
          scrollTop = element.scrollTop,
          collapsible = !document.body.classList.contains('no-collapse-outline'),
          items = [],
          wasEmpty = 0 == element.innerHTML.trim().length;
        html = element.innerHTML;
        comparisonHtml = nextOutlineHtml;
        previousOutline = jquery(jquery.parseHTML('<div>' + html + '<div>')[0]);
        nextOutline = jquery(jquery.parseHTML('<div>' + comparisonHtml + '<div>')[0]);
        previousOutline
          .find('.outline-item-open, .outline-active, .outline-item-active')
          .removeClass('outline-item-open')
          .removeClass('outline-item-active')
          .removeClass('outline-active');
        if (previousOutline.html() == nextOutline.html()) {
          return void (forceRefresh && collapsible && setOutlineExpansion(jquery(element)));
        }
        if (collapsible && !wasEmpty) {
          jquery(element)
            .find('.outline-item-open>.outline-item>.outline-label')
            .map(function () {
              items.push(this.getAttribute('data-ref'));
            });
        }
        element.innerHTML = renderQuickOpenOutline(tableOfContents);
        element.scrollTop = scrollTop;
        if (collapsible) {
          setOutlineExpansion(jquery(element));
          jquery(element.querySelector('.outline-active'))
            .parents('.outline-item-wrapper:not(.outline-item-single)')
            .addClass('outline-item-open');
          if (wasEmpty) {
            if (1 == element.children.length) {
              element.children[0].classList.add('outline-item-open');
            }
          } else {
            items.forEach(function (item) {
              var domNode = element.querySelector("[data-ref='" + item + "']");
              if (domNode) {
                if (
                  !(domNode = domNode.parentElement.parentElement).classList.contains(
                    'outline-item-single',
                  )
                ) {
                  domNode.classList.add('outline-item-open');
                }
              }
            });
          }
        }
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
              1 === compareHeadingWithViewport(candidateHeadings[candidateHeadings.length - 1])
                ? 0
                : candidateHeadings.length - 1;
            upperIndex - lowerIndex > 1 && null == activeIndex;
          ) {
            var middleIndex = Math.floor((lowerIndex + upperIndex) / 2),
              viewportRelation = compareHeadingWithViewport(candidateHeadings[middleIndex]);
            if (1 == viewportRelation) {
              upperIndex = middleIndex;
            } else {
              if (-1 == viewportRelation) {
                lowerIndex = middleIndex;
              } else {
                activeIndex = findFirstVisibleHeading(middleIndex);
              }
            }
          }
          if (null == activeIndex) {
            activeIndex = lowerIndex;
          }
          if (activeIndex < candidateHeadings.length) {
            jquery('.outline-item-active').removeClass('outline-item-active');
            localElement = jquery('#outline-content .outline-label')
              .removeClass('outline-active')
              .filter("[data-ref='" + candidateHeadings[activeIndex].getAttribute('cid') + "']")
              .addClass('outline-active')
              .parent()
              .addClass('outline-item-active');
            var collapsible = !document.body.classList.contains('no-collapse-outline');
            if (flashActive) {
              localElement.addClass('blink-area');
              setTimeout(function () {
                localElement.removeClass('blink-area');
              }, 2e3);
            }
            if (collapsible) {
              if (expandAncestors) {
                for (var element = localElement; element.length; ) {
                  element.addClass('outline-item-open');
                  element = element.parent().closest('.outline-item-wrapper');
                }
              } else {
                var currentElement = localElement.closest('.outline-item-open>.outline-children'),
                  activeOutlineElement = localElement[0];
                if (!currentElement.length) {
                  currentElement = jquery('#outline-content');
                }
                if (currentElement.length) {
                  localElement = currentElement
                    .children()
                    .filter(function () {
                      return this == activeOutlineElement || this.contains(activeOutlineElement);
                    })
                    .find('.outline-label')
                    .first()
                    .addClass('outline-active')
                    .parent()
                    .addClass('outline-item-active');
                }
              }
            }
            !(function (outlineItem) {
              if (
                (!receiver.editor.library || receiver.editor.library.isOutlineShown()) &&
                outlineItem.length
              ) {
                var relativeTop,
                  scrollTop,
                  domNode = jquery('#outline-content:visible')[0];
                if (domNode) {
                  if (!File.isNodeHtml) {
                    domNode = domNode.parentElement;
                  }
                  if ((relativeTop = outlineItem.offset().top - jquery(domNode).offset().top) < 0) {
                    scrollTop = relativeTop - 200 + domNode.scrollTop;
                  } else {
                    if (relativeTop > domNode.offsetHeight - 20) {
                      scrollTop = relativeTop + 200 - domNode.offsetHeight + domNode.scrollTop;
                    }
                  }
                  if (void 0 !== scrollTop) {
                    domNode.scrollTop = scrollTop;
                  }
                }
              }
            })(localElement);
          }
        }
        timerId = null;
      }
      function compareHeadingWithViewport(headingElement) {
        var scrollOffset = jquery('content').scrollTop(),
          offsetTop = headingElement.offsetTop;
        if (offsetTop < scrollOffset) {
          return -1;
        } else {
          if (offsetTop > scrollOffset + window.innerHeight) {
            return 1;
          } else {
            return 0;
          }
        }
      }
      function findFirstVisibleHeading(itemIndex) {
        for (
          itemIndex--;
          candidateHeadings[itemIndex] &&
          0 == compareHeadingWithViewport(candidateHeadings[itemIndex]);
        ) {
          itemIndex--;
        }
        return itemIndex + 1;
      }
    }
    highlightVisibleHeaderWithDelay(headingElements) {
      if (timerId) {
        clearTimeout(timerId);
      }
      timerId = setTimeout(
        () => {
          this.highlightVisibleHeader(headingElements);
        },
        File.inBusyMode ? 200 : 100,
      );
    }
    renderOutline() {
      var outlineHtml = renderQuickOpenOutline(this.editor.nodeMap.toc),
        outlineRoot = jquery('.outline-content');
      outlineRoot.html(outlineHtml);
      setOutlineExpansion(outlineRoot, true);
      if (this.editor.mathInline) {
        this.editor.mathInline.renderInToc();
      }
      if (this.expandedOutlineItem) {
        this.expandedOutlineItem.forEach(function (item) {
          try {
            outlineRoot
              .find("[data-ref='" + item + "']")
              .parent()
              .parent()
              .addClass('outline-item-open');
          } catch (error) {}
        });
        this.expandedOutlineItem = null;
      } else {
        var element = outlineRoot.children();
        if (element.length < 20) {
          element.addClass('.outline-item-open');
        }
      }
    }
    moveUpOrDown(moveUp) {
      var element,
        collapsible = !document.body.classList.contains('no-collapse-outline'),
        currentElement = document.querySelector('#outline-content'),
        elements = currentElement.querySelectorAll('.outline-item:not(.marklyra-outline-miss)'),
        domNode = currentElement.querySelector('.select');
      if (!domNode && (domNode = currentElement.querySelector('.outline-active'))) {
        if (!(domNode = domNode.parentElement).classList.contains('marklyra-outline-miss')) {
          return void domNode.classList.add('select');
        }
        domNode = null;
      }
      if (domNode) {
        if (
          (element = (function findAdjacentOutlineItem(currentItem, filterActive) {
            var currentIndex = Array.prototype.indexOf.call(elements, currentItem),
              currentDomNode = elements[moveUp ? currentIndex - 1 : currentIndex + 1] || null;
            if (!currentDomNode || filterActive || !collapsible) {
              return currentDomNode;
            }
            var parentElement = currentDomNode.parentElement.parentElement.parentElement;
            if (
              parentElement.classList.contains('outline-item-open') ||
              !parentElement.classList.contains('outline-item-wrapper')
            ) {
              return currentDomNode;
            } else {
              return findAdjacentOutlineItem(currentDomNode, filterActive);
            }
          })(domNode, document.querySelector('#marklyra-sidebar.marklyra-on-outline-filter')))
        ) {
          domNode.classList.remove('select');
          element.classList.add('select');
        }
      } else {
        if ((domNode = elements[0])) {
          domNode.classList.add('select');
        }
      }
    }
    onEnterKey(keyboardEvent) {
      var trimmedText = keyboardEvent.target.value.trim(),
        domNode = document.querySelector('.outline-item.select');
      if (domNode && text == trimmedText) {
        jquery(domNode).children('.outline-label').trigger('click');
        if (!domNode.parentElement.classList.contains('outline-item-open')) {
          jquery(domNode).children('.outline-expander').trigger('click');
        }
        setTimeout(function () {
          keyboardEvent.target.focus();
        }, 0);
      } else {
        this.search(trimmedText);
      }
    }
    showOutline() {
      if (this.editor.library.isSidebarShown()) {
        jquery('#toc-content')
          .html(jquery('#outline-content').html())
          .find('.outline-active, .outline-item-active')
          .removeClass('outline-active')
          .removeClass('outline-item-active');
      } else {
        this.renderOutline();
      }
      jquery('.dropdown-menu.open, .dropdown-menu.show').removeClass('open').removeClass('show');
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
      ) {
        this.expandedOutlineItem.push(elements[itemIndex].getAttribute('data-ref'));
      }
      return this.expandedOutlineItem;
    }
    hideOutline(unusedParameter1) {
      this.storeOutline();
      document.querySelector('#toc-dropmenu').classList.remove('open');
    }
    autoHideOutline() {
      if (document.querySelector('#toc-dropmenu').classList.contains('open')) {
        this.hideOutline();
      }
    }
    toggleOutline() {
      if (document.querySelector('#toc-dropmenu.open')) {
        this.hideOutline();
      } else {
        this.showOutline();
      }
    }
    getHeaderMatrix(plainText) {
      var items = [];
      this.editor.nodeMap.toc.headers.map(function (documentNode) {
        var headingText =
            documentNode.get('type') == NodeType.heading
              ? documentNode.get('text')
              : documentNode.getText().replace(/(^#+)|(#+$)/g, ''),
          renderedTitle = inlineLexer.output(headingText);
        if (plainText) {
          renderedTitle = jquery.parseHTML('<div>' + renderedTitle + '<div>')[0].textContent;
        }
        items.push([documentNode.get('depth') - 0, renderedTitle, documentNode.cid]);
      });
      return items;
    }
  };
}
