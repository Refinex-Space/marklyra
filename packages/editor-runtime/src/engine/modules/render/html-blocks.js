// render/html-blocks.
export default function initializeRenderHtmlBlocks(requireModule, moduleExports, moduleRecord) {
  'use strict';
  Object.defineProperty(showFramePlaceholder, 'name', { value: 'N', configurable: true });
  Object.defineProperty(isTrustedEmbedScriptUrl, 'name', { value: 'P', configurable: true });
  Object.defineProperty(sanitizeHtmlContent, 'name', { value: 'O', configurable: true });
  Object.defineProperty(readFrameDocument, 'name', { value: 'H', configurable: true });
  Object.defineProperty(updateFrameSource, 'name', { value: 'U', configurable: true });

  if (!this) {
    self;
  }
  var originalHtml,
    supportsSrcdoc,
    CodeMirror = requireModule('libraries/codemirror'),
    utilities = requireModule('shared/utilities'),
    jquery = requireModule('libraries/jquery'),
    domPurifyExport = requireModule('libraries/dom-purify-export'),
    documentModel = requireModule('model/document-model'),
    keyboardShortcuts = requireModule('editing/keyboard-shortcuts'),
    undoManager = (requireModule('render/diagrams'), requireModule('editing/undo-manager')),
    SnapFlag = undoManager.SnapFlag,
    DocumentNode = (keyboardShortcuts.map, documentModel.Node),
    INLINE_TYPE =
      (documentModel.TYPE,
      [
        'em',
        'strong',
        'small',
        'big',
        's',
        'strike',
        'cite',
        'q',
        'dfn',
        'abbr',
        'data',
        'time',
        'code',
        'var',
        'samp',
        'kbd',
        'sub',
        'sup',
        'i',
        'b',
        'mark',
        'ruby',
        'span',
        'ins',
        'del',
        'button',
        'font',
        'acronym',
        'tt',
        'progress',
        'meter',
        'svg',
        'a',
      ]),
    HIDDEN_TYPE = [
      'script',
      'style',
      'meta',
      'noscript',
      'input',
      'template',
      'head',
      'canvas',
      'link',
    ],
    ALL_INLINE_TYPE = INLINE_TYPE.concat(['img', 'a', 'br', 'wbr']),
    BLOCK_TYPE = [
      'div',
      'p',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'table',
      'figure',
      'details',
      'left',
      'right',
      'center',
      'footer',
      'header',
      'nav',
      'ol',
      'ul',
      'article',
      'address',
      'dl',
      'applet',
      'map',
      'aside',
      'audio',
      'bdo',
      'blockquote',
      'form',
      'select',
      'dialog',
      'picture',
      'embed',
      'object',
      'iframe',
      'main',
      'pre',
      'section',
      'svg',
      'textarea',
      'video',
      'template',
      'head',
      'canvas',
      'hr',
    ],
    knownTagNames = ALL_INLINE_TYPE.concat(BLOCK_TYPE).concat(HIDDEN_TYPE),
    BLOCK_OPEN_REG =
      /^\s*<(\!DOCTYPE|div|p|h[1-6]|table|figure|details|left|right|center|footer|header|nav|ol|ul|article|address|dl|applet|map|aside|audio|bdo|blockquote|form|select|dialog|picture|embed|object|iframe|main|pre|section|svg|textarea|video|template|head|canvas|base|datalist|meta|script|style|noscript|title|menu|hr)(?:(\/)|>|\s|$)/i,
    voidElementTags = ['br', 'hr', 'embed'],
    tagPatternCache = {},
    getHtmlTagPattern = Object.defineProperty(
      function (tagName) {
        if (!tagPatternCache[tagName]) {
          tagPatternCache[tagName] = new RegExp(
            '(?:<' +
              tagName +
              '(?:\\s+[a-zA-Z_:][a-zA-Z0-9:._-]*(?:\\s*=\\s*(?:[^"\'=<>`\\\0-\\ ]+|\'[^\']*\'|"[^"]*"))?)*\\s*(\\/?)>?|<(\\/)' +
              tagName +
              '\\s*[>])',
            'i',
          );
        }
        return tagPatternCache[tagName];
      },
      'name',
      { value: 'C', configurable: true },
    ),
    htmlEdited = false,
    hasCompleteHtmlBlock = Object.defineProperty(
      function (textSlice) {
        for (var localText, match, tagDepth = 0; textSlice; ) {
          if (!localText) {
            if (
              !(localText = ((match = BLOCK_OPEN_REG.exec(textSlice)) || [])[1]) ||
              voidElementTags.indexOf(localText.toLowerCase()) > -1
            ) {
              break;
            }
            tagDepth = 0;
          }
          if (!(match = getHtmlTagPattern(localText).exec(textSlice))) {
            break;
          }
          textSlice = textSlice.substring(match[0].length);
          if (match[2]) {
            tagDepth--;
          } else {
            if (!match[1]) {
              tagDepth++;
            }
          }
        }
        return tagDepth <= 0;
      },
      'name',
      { value: 'S', configurable: true },
    ),
    isCursorAtHtmlEnd = Object.defineProperty(
      function (codeMirror) {
        var cursorPosition = codeMirror.doc.getCursor();
        return (
          !cursorPosition ||
          codeMirror.doc.indexFromPos(cursorPosition) >= codeMirror.doc.getValue().length
        );
      },
      'name',
      { value: 'k', configurable: true },
    );
  class HtmlBlockController {
    constructor(inputEditor) {
      this.editor = inputEditor;
      this.bindEvent_();
      this.listenMessage();
      this.currentCm = null;
    }
    bindEvent_(unusedParameter1) {
      var mouseDownPosition,
        selectionRange,
        receiver = this,
        currentEditor = this.editor;
      jquery('#write')
        .on('mousedown', '.md-htmlblock-container', function (mouseEvent) {
          selectionRange = currentEditor.selection.getRangy();
          mouseDownPosition =
            selectionRange && selectionRange.collapsed
              ? [mouseEvent.offsetX, mouseEvent.offsetY]
              : null;
        })
        .on('click', '.md-htmlblock-container', function (keyboardEvent) {
          var eventTarget = (keyboardEvent.originalEvent.path || [])[0] || keyboardEvent.target;
          currentEditor.undo.prepCursorSnap(selectionRange);
          if (
            jquery(eventTarget).closest('a[href]').length ||
            (!keyboardEvent.ctrlKey && !keyboardEvent.metaKey)
          ) {
            if (
              jquery(eventTarget).closest(
                'a, summary, audio, video[controls]:not(.md-video-load-failed), area[href]',
              ).length
            ) {
              return;
            }
            if (
              mouseDownPosition &&
              Math.pow(mouseDownPosition[0] - keyboardEvent.offsetX, 2) +
                Math.pow(mouseDownPosition[1] - keyboardEvent.offsetY, 2) <
                16
            ) {
              receiver.startEditing(jquery(this).parent(), 'auto');
            }
          } else {
            receiver.startEditing(jquery(this).parent(), 'auto');
          }
          currentEditor.undo.endSnap();
        })
        .on('startedit', '.md-htmlblock-container', function (inputUnusedParameter1) {
          receiver.startEditing(jquery(this).parent(), 'auto');
        })
        .on('losefocus', '.md-htmlblock', function (inputUnusedParameter1) {
          receiver.stopEditing(this.getAttribute('cid'));
          if (document.activeElement != currentEditor.writingArea) {
            if (
              document.activeElement &&
              document.activeElement.closest &&
              document.activeElement.closest('.md-htmlblock')
            ) {
              return;
            }
            currentEditor.selection.scrollAdjust();
          }
        })
        .on('endfocus', '.md-htmlblock', function (inputUnusedParameter1) {
          receiver.dropEditing();
        })
        .on('mouseenter', 'video', function (inputUnusedParameter1) {
          var domNode = this;
          if (
            domNode.error &&
            domNode.error.message &&
            domNode.error.message.indexOf('ERR_CACHE_OPERATION_NOT_SUPPORTED') > -1
          ) {
            if (domNode.previousElementSibling) {
              domNode.parentElement.removeChild(domNode.previousElementSibling);
            }
            domNode.classList.remove('md-video-load-failed');
            domNode.load();
          }
          if (!domNode.error) {
            domNode.setAttribute('controls', 'controls');
          }
        })
        .on('mouseleave', 'video', function (inputUnusedParameter1) {
          if (!this.error) {
            this.removeAttribute('controls');
          }
        })
        .on('click', '.md-rawblock-tooltip-edit-btn', function (pointerEvent) {
          jquery(pointerEvent.target)
            .closest('.md-rawblock')
            .find('.md-rawblock-container')
            .trigger('startedit');
          jquery('.marklyra-tooltip').removeClass('shown');
        })
        .on('mouseenter', '.md-htmlblock-container', function (contextEvent) {
          if (File.isWK) {
            console.debug('mouseenter to HTML iframe');
            var menuItems = currentEditor.contextMenu.getMenuItemsForMac(contextEvent.target, true);
            window.bridge.callHandler('contextMenu.setItems', menuItems);
          }
        })
        .on('mouseleave', '.md-htmlblock-container', function (inputUnusedParameter1) {
          if (File.isWK) {
            console.debug('mouseleave to HTML iframe');
            window.bridge.callHandler('contextMenu.setItems', []);
          }
        })
        .on(
          'click',
          '.md-rawblock-tooltip-ok-btn',
          currentEditor.finishRawBlockEdit.bind(currentEditor),
        );
      if (File.isMac) {
        jquery('#write')
          .on('mouseenter', '.md-rawblock-tooltip', function () {
            jquery(this).closest('.md-rawblock').addClass('marklyra-hover');
          })
          .on('mouseleave', '.md-rawblock-tooltip', function () {
            var element = jquery(this).closest('.md-rawblock');
            setTimeout(function () {
              element.removeClass('marklyra-hover');
            }, 100);
          });
      }
    }
    resetVideoDom(element) {
      element.classList.remove('md-video-load-failed');
      jquery(element).prev('.md-htmlblock-panel-placeholder').remove();
    }
    getCidAndElem(nodeOrElement) {
      var nodeId = nodeOrElement,
        element = nodeOrElement;
      if ('string' == typeof nodeOrElement) {
        element = this.editor.findElemById(nodeId);
      } else {
        nodeId = element.attr('cid');
      }
      return [nodeId, element];
    }
    beforeDeleteFences(nodeId) {
      this.syncToNode(nodeId);
      this.dropEditing();
      this.currentCm = void 0;
    }
    syncToNode(nodeId) {
      var documentNode = 'string' == typeof nodeId ? this.editor.getNode(nodeId) : nodeId;
      if ((this.currentCm || {}).cid === documentNode.cid) {
        documentNode.set('text', this.currentCm.getValue());
      }
      return documentNode;
    }
    dropEditing() {
      if (this.currentCm) {
        var nodeElement = this.editor.findElemById(this.currentCm.cid),
          documentNode = this.editor.getNode(this.currentCm.cid);
        nodeElement.find('.md-htmlblock-panel').html('').hide();
        nodeElement.replaceWith(documentNode.toHTML());
        this.currentCm = void 0;
      }
    }
    stopEditing(nodeId, moveToNextBlock) {
      if (
        this.currentCm &&
        ((nodeId = nodeId || this.currentCm.cid), this.currentCm.cid === nodeId)
      ) {
        var documentNode = this.editor.getNode(this.currentCm.cid);
        if (documentNode) {
          var nodeElement = this.editor.findElemById(documentNode.cid),
            currentEditor = this.editor,
            codeMirror = this.currentCm;
          nodeElement.removeClass('md-rawblock-on-edit');
          if (!htmlEdited) {
            this.currentCm = null;
            this.syncToNode(documentNode);
            nodeElement.find('.md-htmlblock-panel').hide().html('');
            nodeElement.find('.md-rawblock-container').show();
            return void this.refreshUnder(nodeElement[0]);
          }
          var editCommand = undoManager.makeEmptyCommand();
          editCommand.undo.push({
            type: 'fences-pos',
            pos: codeMirror.getCursor(),
            id: codeMirror.cid,
          });
          editCommand.undo.push(undoManager.buildReplaceUndo(documentNode));
          this.syncToNode(documentNode);
          var parseResult = documentNode.parseFrom({
              noTop: !documentNode.get('attachTo'),
              skips: { old_code: false, pass_format: true },
            }),
            parsedNodes = parseResult[1];
          editCommand.redo.push(undoManager.buildReplaceUndo(documentNode));
          if (parsedNodes.length > 1) {
            parsedNodes = parsedNodes.slice(1);
            undoManager.addUndoForInsertArray(editCommand, parsedNodes, documentNode);
          }
          this.currentCm = null;
          nodeElement.replaceWith(parseResult[0]);
          this.refreshUnder(documentNode.cid);
          if (moveToNextBlock) {
            currentEditor.selection.jumpToNextBlock(documentNode, editCommand);
          }
          currentEditor.undo.register(editCommand);
          setTimeout(function () {
            editCommand.redo.push(currentEditor.selection.buildUndo());
          }, 100);
        } else {
          this.currentCm = void 0;
        }
      }
    }
    refreshUnder(nodeId) {
      var elements;
      if (nodeId) {
        elements = (
          'string' == typeof nodeId ? this.editor.findElemById(nodeId)[0] : nodeId
        ).querySelectorAll('iframe.md-html-iframe');
      } else {
        elements = document.querySelectorAll('iframe.md-html-iframe');
      }
      if (elements.length) {
        elements.forEach(function (item) {
          item.contentWindow.postMessage('syncHeight', '*');
        });
      }
    }
    startEditing(nodeOrElement, cursorPlacement) {
      Object.defineProperty(handleHtmlBoundaryKey, 'name', { value: 'h', configurable: true });

      if (!File.isLocked) {
        var currentCm,
          nodeAndElement = this.getCidAndElem(nodeOrElement),
          nodeId = nodeAndElement[0],
          element = nodeAndElement[1],
          currentEditor = this.editor,
          documentNode = this.editor.getNode(nodeId),
          convertHtmlToParagraph = Object.defineProperty(
            function (codeMirror) {
              var currentDocumentNode = currentEditor.getNode(codeMirror.cid),
                UndoManager = currentEditor.undo.UndoManager,
                deleteCommand = UndoManager.makeEmptyCommand();
              currentEditor.htmlBlock.beforeDeleteFences(codeMirror.cid);
              deleteCommand.undo.push({
                type: 'fences-pos',
                pos: codeMirror.getCursor(),
                id: codeMirror.cid,
              });
              UndoManager.append(
                deleteCommand,
                currentEditor.UserOp.backToParagraph(currentEditor, currentDocumentNode, false),
              );
              currentEditor.undo.register(deleteCommand);
            },
            'name',
            { value: 'u', configurable: true },
          );
        if (nodeId) {
          if (this.currentCm && this.currentCm.cid === nodeId) {
            if (currentEditor.writingArea.contains(this.currentCm.getWrapperElement())) {
              this.currentCm.focus();
              return this.currentCm;
            }
            this.currentCm = null;
          }
          if (this.currentCm) {
            this.stopEditing(this.currentCm.cid);
            window.getSelection().removeAllRanges();
          }
          element
            .find('.md-htmlblock-panel')
            .show()
            .html(
              '<div class="md-rawblock-input md-rawblock-control" contenteditable="false"></div>',
            );
          element.find('.md-rawblock-container').hide();
          element.addClass('md-rawblock-on-edit');
          this.currentCm = (function (editor) {
            htmlEdited = false;
            originalHtml = documentNode.get('text');
            var codeMirror = CodeMirror(
              element.find('.md-rawblock-input')[0],
              {
                styleSelectedText: true,
                styleActiveLine: true,
                lineWrapping: !File.option.noLineWrapping,
                maxHighlightLength: 1 / 0,
                viewportMargin: 1 / 0,
                mode: 'htmlmixed',
                placeholder: jquery.localize.getString('Input HTML here'),
                theme: ' inner null-scroll',
                autoCloseBrackets: true,
                autoCloseTags: true,
                value: originalHtml,
                lineNumbers: false,
                resetSelectionOnContextMenu: true,
                dragDrop: false,
                indentUnit: File.option.codeIndentSize,
                tabSize: File.option.codeIndentSize,
                lineWiseCopyCut: File.option.lineWiseCopyCut,
              },
              editor,
              nodeId,
            );
            codeMirror.on('blur', function (codeMirror) {
              setTimeout(function () {
                if (document.body.contains(codeMirror.getWrapperElement())) {
                  documentNode.set('text', codeMirror.getValue());
                }
              }, 0);
            });
            codeMirror.on('focus', function (unusedParameter1) {
              editor.refocus(codeMirror.cid);
            });
            codeMirror.on('changes', function (changedEditor, changes) {
              editor.fences.handleUserReplacement(changedEditor, changes);
              editor.wordCount.quickUpdate(codeMirror.cid);
              editor.selection.clearGlobalColumn();
              htmlEdited = true;
              if (File.isTypeWriterMode && !File.option.scrollWithCursor) {
                editor.selection.typeWriterScroll(codeMirror.cursorCoords(codeMirror.getCursor()));
              }
            });
            codeMirror.on('cursorActivity', function () {
              editor.fences.handleCursorActivity(codeMirror);
            });
            codeMirror.on('keydown', function (codeMirror, keyboardEvent) {
              editor.fences.onKeyDown(
                codeMirror,
                keyboardEvent,
                editor,
                convertHtmlToParagraph,
                handleHtmlBoundaryKey,
              );
            });
            return codeMirror;
          })(this.editor);
          (currentCm = this.currentCm).focus();
          currentCm.execCommand('goDocEnd');
          currentEditor.selection.scrollAdjust();
          if (cursorPlacement) {
            if ('start' == cursorPlacement) {
              this.currentCm.execCommand('goDocStart');
            } else {
              if ('end' == cursorPlacement) {
                this.currentCm.execCommand('goDocEnd');
              } else {
                if ('auto' == cursorPlacement) {
                  this.findPos(this.currentCm);
                }
              }
            }
            this.editor.refocus(documentNode.id);
          }
          return this.currentCm;
        }
      }
      function handleHtmlBoundaryKey(codeMirror, keyboardEvent) {
        if (
          isCursorAtHtmlEnd(codeMirror) &&
          (keyboardEvent.ctrlKey ||
            keyboardEvent.metaKey ||
            (!keyboardEvent.shiftKey && hasCompleteHtmlBlock(codeMirror.getValue())))
        ) {
          setTimeout(
            typeof globalThis.__MARKLYRA_HTML_CALLBACK__ === 'function'
              ? globalThis.__MARKLYRA_HTML_CALLBACK__(function () {
                  currentEditor.UserOp.insertParagraph();
                })
              : function () {
                  currentEditor.UserOp.insertParagraph();
                },
            20,
          );
          keyboardEvent.preventDefault();
          keyboardEvent.stopPropagation();
          return true;
        }
      }
    }
    findPos(codeMirror) {
      var lineCount = codeMirror.lineCount();
      if (lineCount >= 3) {
        codeMirror.setCursor(lineCount - 2, codeMirror.getLine(lineCount - 2).length);
      } else {
        if (2 == lineCount) {
          codeMirror.setCursor(lineCount - 1, 0);
        } else {
          codeMirror.setCursor(lineCount - 1, codeMirror.getLine(lineCount - 1).length);
        }
      }
    }
    listenMessage() {
      var currentEditor = this.editor;
      window.addEventListener(
        'message',
        function (messageEvent) {
          if (
            typeof globalThis.__MARKLYRA_HTML_MESSAGE__ === 'function' &&
            !globalThis.__MARKLYRA_HTML_MESSAGE__(messageEvent)
          ) {
            return;
          }
          var previewMessage = messageEvent.data,
            previewFrame = currentEditor.findElemById(previewMessage.cid).find('iframe')[0];
          if ('changeHeight' == previewMessage.msg) {
            previewFrame.height = previewMessage.height;
          }
          if ('startEditing' == previewMessage.msg) {
            jquery(previewFrame).closest('.md-rawblock-container').trigger('startedit');
          }
          if ('contextmenu' == previewMessage.msg && File.isNode) {
            forwardFrameContextMenu(previewFrame, previewMessage.event);
          }
          if ('mousedown' == previewMessage.msg && File.isNode) {
            File.editor.contextMenu.hide();
          }
        },
        false,
      );
    }
  }
  Object.defineProperty(HtmlBlockController, 'name', { value: 'E', configurable: true });
  HtmlBlockController.allowWhiteList = function () {
    if (void 0 === supportsSrcdoc) {
      var iframeElement = document.createElement('iframe');
      supportsSrcdoc = void 0 !== iframeElement.srcdoc;
      iframeElement.remove();
    }
    return supportsSrcdoc;
  };
  var exportSanitizerOptions = {
    FORBID_ATTR: [],
    ADD_ATTR: ['async', 'srcdoc', 'class', 'alt', 'for', 'title', 'charset'],
    FORBID_TAGS: [],
    ADD_TAGS: ['iframe', 'dialog', 'footer', 'style', 'template', 'svg'],
    ALLOW_DATA_ATTR: true,
    ALLOW_UNKNOWN_PROTOCOLS: true,
    forHTMLBlock: true,
    forPrint: true,
  };
  if (window.reqnode) {
    exportSanitizerOptions.ADD_TAGS.remove('iframe');
    exportSanitizerOptions.FORBID_TAGS.push('iframe');
  }
  HtmlBlockController.INLINE_CONFIG = {
    ADD_TAGS: [],
    FORBID_TAGS: ['iframe', 'dialog', 'embed', 'footer', 'object'],
    ALLOW_UNKNOWN_PROTOCOLS: true,
    ADD_ATTR: ['controls', 'allowfullscreen', 'marklyra-id', 'marklyra-class'],
  };
  HtmlBlockController.getDomPurifyConfig = function (overrides) {
    return Object.assign(
      {
        FORBID_ATTR: ['class', 'contenteditable', 'cid', 'id', 'loop', 'autoplay', 'preload'],
        ADD_ATTR: ['allowfullscreen', 'async', 'charset', 'srcdoc', 'controls'],
        ADD_TAGS: ['iframe', 'dialog', 'footer'],
        FORBID_TAGS: ['head', 'style'],
        ALLOW_DATA_ATTR: false,
        RETURN_DOM: true,
        ALLOW_UNKNOWN_PROTOCOLS: true,
        USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
      },
      overrides,
    );
  };
  var forwardFrameContextMenu = Object.defineProperty(
      function (target, pointerEvent) {
        var targetElement = jquery(target),
          offset = targetElement.offset(),
          contextEvent = new jquery.Event('contextmenu', {
            target: target,
            currentTarget: target,
            clientY: offset.top + pointerEvent.clientY,
            clientX: offset.left + pointerEvent.clientX,
          });
        targetElement.trigger(contextEvent);
      },
      'name',
      { value: '_', configurable: true },
    ),
    isPdfFrame = Object.defineProperty(
      function (frameElement) {
        return frameElement.src && /\.pdf/i.exec(new URL(frameElement.src).pathname);
      },
      'name',
      { value: 'A', configurable: true },
    );
  window.loadedWebview = function (domNode) {
    Object.defineProperty(removeFramePlaceholder, 'name', { value: 't', configurable: true });

    function removeFramePlaceholder() {
      if (
        domNode.previousElementSibling &&
        domNode.previousElementSibling.classList.contains('md-htmlblock-panel-placeholder')
      ) {
        domNode.parentElement.removeChild(domNode.previousElementSibling);
      }
    }
    if (!domNode._eventBind) {
      removeFramePlaceholder();
      domNode.addEventListener('did-start-loading', function () {
        removeFramePlaceholder();
        var divElement = document.createElement('div');
        divElement.setAttribute('class', 'md-htmlblock-panel-placeholder');
        divElement.innerHTML =
          '<div class="marklyra-lds-spinner"><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div></div>';
        domNode.parentElement.insertBefore(divElement, domNode);
      });
      domNode.addEventListener('did-stop-loading', removeFramePlaceholder);
      domNode.addEventListener('console-message', function (consoleEvent) {
        if (3 === consoleEvent.level) {
          console.error(consoleEvent.sourceId + consoleEvent.line, consoleEvent.message);
        }
      });
      domNode.addEventListener('did-fail-load', function (loadFailure) {
        domNode.previousElementSibling.textContent =
          loadFailure.errorDescription + '  ' + loadFailure.validatedURL;
      });
      domNode.addEventListener('context-menu', function (contextMenuEvent) {
        var webviewElement = jquery(domNode),
          contextEvent = new jquery.Event('contextmenu', {
            target: domNode,
            currentTarget: domNode,
            clientY: contextMenuEvent.params.y,
            clientX: contextMenuEvent.params.x,
          });
        webviewElement.trigger(contextEvent);
      });
      domNode.addEventListener('enter-html-full-screen', () => {
        JSBridge.invoke('window.enterFullscreen');
      });
      domNode.addEventListener('leave-html-full-screen', () => {
        JSBridge.invoke('window.exitFullscreen');
      });
      domNode._eventBind = true;
    }
  };
  window.remoteOnLoad = function (domNode) {
    Object.defineProperty(initializeEmbeddedFrame, 'name', { value: 't', configurable: true });

    function initializeEmbeddedFrame(frameElement) {
      var isPdf = isPdfFrame(frameElement);
      if (
        readFrameDocument(frameElement) &&
        ((frameElement.contentDocument.documentElement.oncontextmenu = function (contextEvent) {
          forwardFrameContextMenu(frameElement, contextEvent);
        }),
        frameElement.contentDocument.documentElement.addEventListener(
          'mousedown',
          function (unusedParameter1) {
            File.editor.contextMenu.hide();
          },
        ),
        '' == frameElement.height &&
          frameElement.contentDocument &&
          frameElement.contentDocument.body)
      ) {
        var innerHeight = frameElement.contentWindow.innerHeight,
          scrollHeight = frameElement.contentDocument.body.scrollHeight;
        if (
          scrollHeight != innerHeight ||
          (isPdf && frameElement.contentDocument.body.childElementCount > 4)
        ) {
          frameElement.height = Math.min(scrollHeight, 600);
        } else {
          frameElement.height = 24;
          frameElement.height = frameElement.contentDocument.body.scrollHeight;
        }
        frameElement.dataset.userHeight = frameElement.height;
      }
    }
    if (!domNode.classList.contains('md-html-iframe')) {
      if (domNode.previousElementSibling) {
        if (domNode.previousElementSibling.classList.contains('md-htmlblock-panel-placeholder')) {
          domNode.parentElement.removeChild(domNode.previousElementSibling);
        }
        if (File.isNode && domNode.contentDocument) {
          if (domNode.contentDocument.body) {
            initializeEmbeddedFrame(domNode);
          } else {
            domNode.contentDocument.addEventListener(
              'DOMContentLoaded',
              function (unusedParameter1) {
                initializeEmbeddedFrame(domNode);
              },
            );
          }
        } else {
          domNode.removeAttribute('guest-id');
        }
        updateFrameSource(domNode);
      }
    }
  };
  var text = document.querySelector('#md-htmlblock-panel-novideo-templ').text,
    currentText = document.querySelector('#md-htmlblock-panel-nohtml-templ').text;
  function showFramePlaceholder(domNode, inputText, unusedParameter3) {
    var previousElementSibling = domNode.previousElementSibling;
    inputText =
      inputText.replace('http://marklyra-app', 'MarkLyra.app').replace(/^marklyra:.+/, '') ||
      'blank';
    if (!previousElementSibling) {
      (previousElementSibling = document.createElement('div')).classList.add(
        'md-htmlblock-panel-placeholder',
      );
      domNode.parentElement.insertBefore(previousElementSibling, domNode);
    }
    previousElementSibling.innerHTML = currentText;
    previousElementSibling.querySelector('.md-resouce-error-message').textContent = inputText;
    domNode.height = Math.max((domNode.height || 0) - 0, 48);
  }
  window.videoOnError = function (domNode) {
    var divElement = document.createElement('div');
    divElement.setAttribute('class', 'md-htmlblock-panel-placeholder');
    divElement.innerHTML = text;
    divElement.querySelector('.md-resouce-error-message').textContent =
      domNode.src
        .replace('http://marklyra-app', 'MarkLyra.app')
        .replace(/^wkfile:/, 'file:')
        .replace(/^marklyra:.+/, '') || 'blank';
    domNode.parentElement.insertBefore(divElement, domNode);
    domNode.classList.add('md-video-load-failed');
  };
  var hasTrustedEmbedScript = Object.defineProperty(
    function (parentElement) {
      if (!HtmlBlockController.allowWhiteList()) {
        return false;
      }
      var elements = parentElement.querySelectorAll('script');
      return (
        1 == elements.length &&
        elements[0].parentElement == parentElement &&
        isTrustedEmbedScriptUrl(elements[0].getAttribute('src'))
      );
    },
    'name',
    { value: 'D', configurable: true },
  );
  HtmlBlockController.checkIsWhiteList = function (documentNode) {
    if (!HtmlBlockController.allowWhiteList()) {
      return false;
    }
    if ('script' == documentNode.get('style')) {
      var parsedContent = (function (inputHtml) {
        var templateElement = document.createElement('template');
        templateElement.innerHTML = inputHtml;
        return templateElement.content;
      })(documentNode.get('text'));
      if (1 == parsedContent.childElementCount) {
        var domNode = parsedContent.firstElementChild;
        return 'SCRIPT' == domNode.tagName && isTrustedEmbedScriptUrl(domNode.getAttribute('src'));
      }
    }
  };
  var trustedEmbedPatterns = {
      gist: /^https:\/\/gist\.github\.com\/.*\.js/,
      jsfiddle: /^https:\/\/jsfiddle\.net\/[a-z0-9]+\/[a-z0-9]+\/embed\/$/i,
    },
    trustedEmbedScripts = [
      'https://platform.twitter.com/widgets.js',
      'https://static.codepen.io/assets/embed/ei.js',
      'https://cssdeck.com/assets/js/embed.js',
      'https://www.instagram.com/embed.js',
      'https://s.imgur.com/min/embed.js',
      'https://speakerdeck.com/assets/embed.js',
    ];
  function isTrustedEmbedScriptUrl(searchValue) {
    searchValue = /^\/\//.exec((searchValue = searchValue || ''))
      ? 'https:' + searchValue
      : searchValue.replace(/^http:/, 'https:');
    try {
      searchValue = new URL(searchValue).href;
    } catch (error) {}
    return (
      trustedEmbedScripts.indexOf(searchValue) > -1 || !!trustedEmbedPatterns.gist.exec(searchValue)
    );
  }
  var dOMParserInstance = new DOMParser();
  function sanitizeHtmlContent(inputHtml, sanitizerOptions, skipMediaWrappers) {
    var body = (
      dOMParserInstance.parseFromString('<body>' + inputHtml + '</body>', 'text/html') || {}
    ).body;
    if (!body) {
      (body = document.createElement('body')).innerHTML = inputHtml;
    }
    if (sanitizerOptions && hasTrustedEmbedScript(body)) {
      sanitizerOptions.whitelistMode = true;
      if (sanitizerOptions.ADD_TAGS) {
        sanitizerOptions.ADD_TAGS.push('script');
      } else {
        sanitizerOptions.ADD_TAGS = ['script'];
      }
      sanitizerOptions.FORBID_ATTR = ['contenteditable'];
      sanitizerOptions.ALLOW_DATA_ATTR = true;
      body.classList.add('md-preview-body');
      return body;
    } else {
      if (skipMediaWrappers) {
        return body;
      } else {
        body.querySelectorAll("[role='wrapper']").forEach(function (item) {
          item.removeAttribute('role');
        });
        body.querySelectorAll('iframe, video').forEach(function (domNode) {
          var divElement = document.createElement('div');
          divElement.setAttribute('role', 'wrapper');
          domNode.parentElement.replaceChild(divElement, domNode);
          divElement.appendChild(domNode);
        });
        return body;
      }
    }
  }
  var guestSequence = 2;
  domPurifyExport.addHook('beforeSanitizeElements', function (element) {
    if (element.id) {
      element.setAttribute('marklyra-id', element.id);
    }
    return element;
  });
  domPurifyExport.addHook(
    'afterSanitizeAttributes',
    function (domNode, unusedParameter2, sanitizerOptions) {
      var hasStyle = domNode && domNode.nodeType == domNode.ELEMENT_NODE && domNode.style;
      if (hasStyle) {
        var imageSource = domNode.getAttribute('src');
        if (/^\/\//.exec(imageSource || '')) {
          domNode.setAttribute('src', 'https:' + imageSource);
        }
        var linkTarget = domNode.getAttribute('href');
        if (/^\/\//.exec(linkTarget || '')) {
          domNode.setAttribute('href', 'https:' + linkTarget);
        }
      }
      if (
        !sanitizerOptions.whitelistMode &&
        (hasStyle &&
          (sanitizerOptions.forHTMLBlock
            ? domNode.parentElement &&
              'BODY' == domNode.parentElement.tagName &&
              'none' == domNode.style.display &&
              (domNode.style.display = '')
            : DocumentNode.isType(domNode.style.display, 'inline', 'inline-block') ||
              (domNode.style.display = ''),
          (sanitizerOptions.forHTMLBlock &&
            !DocumentNode.isType(domNode.style.position, 'fixed', 'sticky', 'absolute')) ||
            (domNode.style.position = '')),
        sanitizerOptions.forHTMLBlock)
      ) {
        if (hasStyle) {
          if (DocumentNode.isType(domNode.tagName.toLowerCase(), 'iframe')) {
            if (!sanitizerOptions.forPrint) {
              domNode.setAttribute('guest-id', ++guestSequence);
            }
            if ((imageSource = domNode.getAttribute('src'))) {
              domNode.setAttribute('src', imageSource.replace(/^\/\//, 'https://'));
            }
            if ('iframe' == domNode.tagName.toLowerCase()) {
              domNode.setAttribute('allow-top-navigation', 'false');
              domNode.setAttribute('allow-forms', 'false');
              domNode.setAttribute('allowfullscreen', 'true');
              domNode.setAttribute('allow-popups', 'false');
              if (domNode.srcdoc) {
                return void domNode.setAttribute('sandbox', '');
              }
              if (/^data:/.exec(imageSource) && File.isMac) {
                domNode.setAttribute('sandbox', 'allow-scripts allow-same-origin');
              } else {
                if (/^(https?)?:[\\\/]/.exec(imageSource)) {
                  if (File.isMac || /^https?:/.exec(imageSource)) {
                    domNode.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups');
                  } else {
                    domNode.setAttribute('sandbox', 'allow-scripts');
                  }
                } else {
                  domNode.setAttribute('sandbox', 'allow-same-origin');
                }
              }
              if (/^marklyra/.exec(imageSource)) {
                imageSource = 'about:blank';
                domNode.src = imageSource;
              }
              if (!sanitizerOptions.forPrint) {
                domNode.setAttribute('onLoad', 'window.remoteOnLoad && window.remoteOnLoad(this)');
              }
              imageSource = domNode.getAttribute('src');
              if (File.editor.imgEdit && !/[a-z]+:/.exec(imageSource)) {
                domNode.src = File.editor.imgEdit.getAbsolutePath(imageSource, true);
              }
            }
            if (
              !sanitizerOptions.forPrint &&
              'wrapper' == domNode.parentElement.getAttribute('role')
            ) {
              var divElement = document.createElement('div');
              divElement.setAttribute('class', 'md-htmlblock-panel-placeholder');
              divElement.innerHTML =
                '<div class="marklyra-lds-spinner"><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div></div>';
              domNode.parentElement.insertBefore(divElement, domNode);
            }
          }
          if (
            DocumentNode.isType(domNode.tagName.toLowerCase(), 'video', 'audio', 'img', 'source')
          ) {
            if ((imageSource = domNode.getAttribute('src'))) {
              (function (element) {
                var currentImageSource = element.getAttribute('src');
                element.dataset.src = currentImageSource;
                if (File.editor.imgEdit) {
                  var src = File.editor.imgEdit.getAbsolutePath(currentImageSource, true);
                  if (utilities.fromExternalPath(src)) {
                    src = utilities.file2wkfile(src);
                  }
                  element.src = src;
                }
              })(domNode);
            }
          }
          if (DocumentNode.isType(domNode.tagName.toLowerCase(), 'video')) {
            if (!sanitizerOptions.forPrint) {
              domNode.setAttribute('controlsList', 'nodownload');
              domNode.setAttribute('onError', 'window.videoOnError(this)');
            }
            if (domNode.getAttribute('poster')) {
              domNode.setAttribute(
                'poster',
                editor.imgEdit.getAbsolutePath(domNode.getAttribute('poster'), true),
              );
            }
          }
          if (
            !sanitizerOptions.forPrint &&
            DocumentNode.isType(domNode.tagName.toLowerCase(), 'audio')
          ) {
            domNode.setAttribute('controlsList', 'nodownload');
            domNode.setAttribute('controls', '');
          }
        }
        return domNode;
      }
    },
  );
  document.querySelector('#marklyra-resize-temp');
  function readFrameDocument(frameElement) {
    if (File.isNode) {
      return frameElement.contentDocument;
    }
    try {
      return frameElement.contentDocument;
    } catch (error) {}
    return null;
  }
  function updateFrameSource(frameElement, unusedParameter2) {
    if (
      frameElement &&
      !frameElement.srcdoc &&
      frameElement &&
      (readFrameDocument(frameElement) || {}).body
    ) {
      if (0 !== frameElement.src.indexOf(frameElement.contentWindow.location.protocol)) {
        if ('about:blank' == frameElement.contentWindow.location.href) {
          showFramePlaceholder(frameElement, frameElement.src);
        }
        if (
          frameElement.contentDocument.body.childNodes.length +
            frameElement.contentDocument.head.childNodes.length ==
          0
        ) {
          showFramePlaceholder(frameElement, frameElement.src);
        }
      }
      frameElement.removeAttribute('guest-id');
    }
  }
  window.turnOnIframeRefreshTimer = function (guestId, unusedParameter2) {
    setTimeout(function () {
      updateFrameSource(document.querySelector("iframe[guest-id='" + guestId + "']"));
    }, 2e3);
  };
  HtmlBlockController.UNSFAE_TAGS = [
    'script',
    'video',
    'audio',
    'iframe',
    'img',
    'source',
    'form',
    'object',
    'embed',
    'applet',
    'body',
    'frameset',
    'input',
    'link',
  ];
  HtmlBlockController.convertToXHTML = function (htmlText) {
    try {
      var htmlDocument = new DOMParser().parseFromString(htmlText, 'text/html');
      return new XMLSerializer().serializeToString(htmlDocument);
    } catch (error) {}
    return htmlText;
  };
  HtmlBlockController.buildHTMLForExport = function (inputText, editor, exportTarget, ownerNode) {
    var bodyElement;
    if (!exportTarget) {
      return inputText;
    }
    if (/\s*^<(div)[^>]*\/>\s*$/.exec(inputText)) {
      return inputText.replace(/\/>\s*/, '></div>');
    }
    if (/^(<\/?(div|p)[^>]*>\s*)+$/.exec(inputText)) {
      return inputText;
    }
    var sanitizerOptions = HtmlBlockController.getDomPurifyConfig(exportSanitizerOptions);
    if ((bodyElement = sanitizeHtmlContent(inputText, sanitizerOptions, true)).firstChild) {
      (bodyElement = domPurifyExport.sanitize(bodyElement, sanitizerOptions))
        .querySelectorAll('iframe, video, audio, img')
        .forEach(function (domNode) {
          var imageSource = domNode.getAttribute('src');
          if (/^\/\//.exec(imageSource)) {
            domNode.src = 'https:' + imageSource;
          } else {
            if (exportTarget && imageSource) {
              domNode.src = window.addDateQuery(editor.imgEdit.getAbsolutePath(imageSource, true));
              if ('iframe' != domNode.tagName.toLowerCase()) {
                domNode.setAttribute('onError', "this.style.display = 'none';");
              }
            }
          }
          if (exportTarget && 'iframe' == domNode.tagName.toLowerCase()) {
            domNode.setAttribute('sandbox', '');
            domNode.setAttribute('allow-popups', 'false');
            if (/^https?:/.exec(domNode.src)) {
              domNode.setAttribute('sandbox', 'allow-scripts');
            }
          }
          if ('video' == domNode.tagName.toLowerCase()) {
            if (true === exportTarget && ownerNode) {
              var elements = editor.findElemById(ownerNode.cid).find('video');
              if (1 !== elements.length || !elements[0].videoHeight) {
                return;
              }
              var src =
                editor.imgEdit.getAbsolutePath(elements[0].getAttribute('poster'), true) ||
                HtmlBlockController.getVideoScreenshot(elements[0]);
              if (src.length > 9e4) {
                return;
              }
              var attributes = domNode.attributes,
                parentElement = domNode.parentElement,
                childIndex = Array.prototype.indexOf.call(parentElement.childNodes, domNode);
              domNode.outerHTML = '<img />';
              domNode = parentElement.children[childIndex];
              for (var itemIndex = attributes.length - 1; itemIndex >= 0; itemIndex--) {
                domNode.setAttribute(attributes[itemIndex].name, attributes[itemIndex].value);
              }
              domNode.src = src;
            } else {
              if ('epub' === exportTarget) {
                domNode.removeAttribute('controls');
                domNode.removeAttribute('controllist');
              }
            }
          }
        });
      return bodyElement.innerHTML;
    } else {
      return '';
    }
  };
  HtmlBlockController.buildHTML = function (documentNode) {
    var sanitizerOptions = HtmlBlockController.getDomPurifyConfig({ forHTMLBlock: true }),
      parsedBody = sanitizeHtmlContent(documentNode.get('text'), sanitizerOptions);
    if (parsedBody.firstChild) {
      if (
        (parsedBody = domPurifyExport.sanitize(parsedBody, sanitizerOptions)).classList.contains(
          'md-preview-body',
        )
      ) {
        return (function (element, previewHtml, nodeId) {
          element.classList.add('md-html-iframe');
          element.sandbox = 'allow-same-origin allow-scripts allow-popups';
          element.setAttribute('seamless', 'seamless');
          element.setAttribute('allow-top-navigation', 'false');
          element.setAttribute('allow-forms', 'false');
          element.setAttribute('allowfullscreen', 'true');
          element.height = 20;
          element.srcdoc =
            "<html><head><script>window.reqnode = undefined;window.require = undefined;<\/script><style type='text/css'>iframe {margin: auto;}</style></head><body>" +
            previewHtml +
            '<script>' +
            html.replace(/\s*\n\s*/g, '') +
            "\niframePreloadScript('" +
            nodeId +
            "');<\/script></body></html>";
          var outerHTML = element.outerHTML;
          element.remove();
          return outerHTML;
        })(document.createElement('iframe'), parsedBody.innerHTML, documentNode.cid);
      } else {
        parsedBody.querySelectorAll('iframe').forEach(function (domNode) {
          var guestId = domNode.getAttribute('guest-id') - 0;
          if (File.isNode) {
            var currentDomNode = document.createElement('webview');
            for (var attributeIndex in (currentDomNode.setAttribute('partition', 'iframe'),
            domNode.replaceWith(currentDomNode),
            (currentDomNode.src = domNode.src),
            domNode.attributes)) {
              let attribute = domNode.attributes.item(attributeIndex);
              currentDomNode.setAttribute(attribute.name, attribute.value);
            }
            let scriptElement = document.createElement('script');
            scriptElement.innerHTML = `var w = document.querySelector("[guest-id='${guestId}']");loadedWebview(w);`;
            currentDomNode.parentElement.appendChild(scriptElement);
            if (domNode.height) {
              currentDomNode.style.height = domNode.height + 'px';
            }
            currentDomNode.setAttribute(
              'webpreferences',
              'webViewGuestId=' + guestId + ', webviewTag=no,disableDialogs=true',
            );
            currentDomNode.setAttribute('autosize', 'autosize');
            return void currentDomNode.setAttribute('nodeintegration', false);
          }
          if ((guestId = domNode.getAttribute('guest-id') - 0) && !isNaN(guestId)) {
            var SCRIPTElement = document.createElement('SCRIPT');
            SCRIPTElement.setAttribute('data-run', 'true');
            SCRIPTElement.type = 'text/javascript';
            SCRIPTElement.text =
              'turnOnIframeRefreshTimer(' + guestId + ", '" + documentNode.cid + "')";
            domNode.parentElement.appendChild(SCRIPTElement);
          }
        });
        return parsedBody.innerHTML;
      }
    } else {
      return '';
    }
  };
  HtmlBlockController.getVideoScreenshot = function (videoElement) {
    var element = document.querySelector('#video-canvas'),
      canvasContext = element.getContext('2d');
    element.width = videoElement.videoWidth;
    element.height = videoElement.videoHeight;
    try {
      canvasContext.drawImage(
        videoElement,
        0,
        0,
        videoElement.videoWidth,
        videoElement.videoHeight,
      );
      return element.toDataURL();
    } catch (error) {
      console.warn(error);
    }
    return '';
  };
  var html = document.querySelector('#md-html-iframe-preload-temp').innerHTML;
  HtmlBlockController.autoCloseTagWhenInput = function (
    editor,
    typedCharacter,
    targetNode,
    selectionBookmark,
    pendingCommand,
    range,
  ) {
    if (
      0 !=
      ('/' === typedCharacter &&
        range.startContainer.nodeType === document.TEXT_NODE &&
        '<' ===
          range.startContainer.nodeValue.substring(range.startOffset - 1, range.startOffset) &&
        void 0)
    ) {
      var tagName = (function () {
        var precedingTag = jquery(range.startContainer.parentElement)
          .prev("[md-inline='tag']")
          .text();
        if (precedingTag && !/\/>/.exec(precedingTag)) {
          var searchValue = (/<([A-Za-z1-9]+)/.exec(precedingTag) || [])[1];
          if (knownTagNames.indexOf(searchValue) > -1) {
            return searchValue;
          } else {
            return void 0;
          }
        }
      })();
      if (tagName) {
        return (function (closingTagName) {
          if (pendingCommand) {
            editor.undo.register(pendingCommand);
          }
          var end,
            currentRange,
            domNode = document.createTextNode('/' + closingTagName + '>');
          range.insertNode(domNode);
          domNode.parentElement.normalize();
          end = closingTagName.length + 2;
          currentRange = editor.selection.rangy.createRange();
          selectionBookmark.end += end;
          selectionBookmark.start += end;
          currentRange.moveToBookmark(selectionBookmark);
          currentRange.select(currentRange.isBackward);
          if (pendingCommand) {
            pendingCommand.redo.push(editor.selection.buildUndo());
          }
          editor.undo.addSnap(targetNode.cid, SnapFlag.REPLACE);
          return true;
        })(tagName);
      } else {
        return void 0;
      }
    }
  };
  HtmlBlockController.prototype.autoCloseTagWhenInput = HtmlBlockController.autoCloseTagWhenInput;
  HtmlBlockController.BLOCK_OPEN_REG = BLOCK_OPEN_REG;
  HtmlBlockController.INLINE_TYPE = INLINE_TYPE;
  HtmlBlockController.ALL_INLINE_TYPE = ALL_INLINE_TYPE;
  HtmlBlockController.HIDDEN_TYPE = HIDDEN_TYPE;
  HtmlBlockController.NO_TEXT_BLOCK_TYPE = [
    'html',
    'body',
    'script',
    'style',
    'meta',
    'noscript',
    'template',
    'head',
    'canvas',
    'link',
  ];
  HtmlBlockController.BLOCK_TYPE = BLOCK_TYPE;
  HtmlBlockController.autoCloseTag = function (documentNode) {
    var localText = documentNode.get('text'),
      lineIndent = (/^[ \t]+/.exec(localText) || [''])[0],
      style = documentNode.get('style'),
      depth = documentNode.get('depth');
    if (!(voidElementTags.indexOf(style) > -1)) {
      for (
        depth && (localText += '\n' + lineIndent + ' '.repeat(File.option.codeIndentSize));
        depth;
      ) {
        depth--;
        localText += '\n' + lineIndent + '</' + style + '>';
      }
      documentNode.set('text', localText);
      documentNode.set('depth', 0);
    }
  };
  HtmlBlockController.getHTMLTagReg = getHtmlTagPattern;
  window.DOMPurify = domPurifyExport;
  moduleRecord.exports = HtmlBlockController;
}
