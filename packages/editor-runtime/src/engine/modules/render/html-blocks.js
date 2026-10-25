// render/html-blocks.
// SystemJS module 17. Dependencies: 20, 11, e, 16, 13, 27, 15, 1b.
$__System.registerDynamic(
  '17',
  ['20', '11', 'e', '16', '13', '27', '15', '1b'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    'use strict';
    this || self;
    var originalHtml,
      supportsSrcdoc,
      CodeMirror = requireModule('20'),
      utilities = requireModule('11'),
      jquery = requireModule('e'),
      domPurifyExport = requireModule('16'),
      documentModel = requireModule('13'),
      keyboardShortcuts = requireModule('27'),
      undoManager = (requireModule('15'), requireModule('1b')),
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
      C = function (tagName) {
        return (
          tagPatternCache[tagName] ||
            (tagPatternCache[tagName] = new RegExp(
              '(?:<' +
                tagName +
                '(?:\\s+[a-zA-Z_:][a-zA-Z0-9:._-]*(?:\\s*=\\s*(?:[^"\'=<>`\\\0-\\ ]+|\'[^\']*\'|"[^"]*"))?)*\\s*(\\/?)>?|<(\\/)' +
                tagName +
                '\\s*[>])',
              'i',
            )),
          tagPatternCache[tagName]
        );
      },
      htmlEdited = !1,
      S = function (textSlice) {
        for (var localText, match, tagDepth = 0; textSlice; ) {
          if (!localText) {
            if (
              !(localText = ((match = BLOCK_OPEN_REG.exec(textSlice)) || [])[1]) ||
              voidElementTags.indexOf(localText.toLowerCase()) > -1
            )
              break;
            tagDepth = 0;
          }
          if (!(match = C(localText).exec(textSlice))) break;
          (textSlice = textSlice.substring(match[0].length)),
            match[2] ? tagDepth-- : match[1] || tagDepth++;
        }
        return tagDepth <= 0;
      },
      k = function (codeMirror) {
        var cursorPosition = codeMirror.doc.getCursor();
        return (
          !cursorPosition ||
          codeMirror.doc.indexFromPos(cursorPosition) >= codeMirror.doc.getValue().length
        );
      };
    class E {
      constructor(inputEditor) {
        (this.editor = inputEditor),
          this.bindEvent_(),
          this.listenMessage(),
          (this.currentCm = null);
      }
      bindEvent_(unusedParameter1) {
        var mouseDownPosition,
          selectionRange,
          receiver = this,
          currentEditor = this.editor;
        jquery('#write')
          .on('mousedown', '.md-htmlblock-container', function (mouseEvent) {
            (selectionRange = currentEditor.selection.getRangy()),
              (mouseDownPosition =
                selectionRange && selectionRange.collapsed
                  ? [mouseEvent.offsetX, mouseEvent.offsetY]
                  : null);
          })
          .on('click', '.md-htmlblock-container', function (keyboardEvent) {
            var eventTarget = (keyboardEvent.originalEvent.path || [])[0] || keyboardEvent.target;
            if (
              (currentEditor.undo.prepCursorSnap(selectionRange),
              jquery(eventTarget).closest('a[href]').length ||
                (!keyboardEvent.ctrlKey && !keyboardEvent.metaKey))
            ) {
              if (
                jquery(eventTarget).closest(
                  'a, summary, audio, video[controls]:not(.md-video-load-failed), area[href]',
                ).length
              )
                return;
              mouseDownPosition &&
                Math.pow(mouseDownPosition[0] - keyboardEvent.offsetX, 2) +
                  Math.pow(mouseDownPosition[1] - keyboardEvent.offsetY, 2) <
                  16 &&
                receiver.startEditing(jquery(this).parent(), 'auto');
            } else receiver.startEditing(jquery(this).parent(), 'auto');
            currentEditor.undo.endSnap();
          })
          .on('startedit', '.md-htmlblock-container', function (inputUnusedParameter1) {
            receiver.startEditing(jquery(this).parent(), 'auto');
          })
          .on('losefocus', '.md-htmlblock', function (inputUnusedParameter1) {
            if (
              (receiver.stopEditing(this.getAttribute('cid')),
              document.activeElement != currentEditor.writingArea)
            ) {
              if (
                document.activeElement &&
                document.activeElement.closest &&
                document.activeElement.closest('.md-htmlblock')
              )
                return;
              currentEditor.selection.scrollAdjust();
            }
          })
          .on('endfocus', '.md-htmlblock', function (inputUnusedParameter1) {
            receiver.dropEditing();
          })
          .on('mouseenter', 'video', function (inputUnusedParameter1) {
            var domNode = this;
            domNode.error &&
              domNode.error.message &&
              domNode.error.message.indexOf('ERR_CACHE_OPERATION_NOT_SUPPORTED') > -1 &&
              (domNode.previousElementSibling &&
                domNode.parentElement.removeChild(domNode.previousElementSibling),
              domNode.classList.remove('md-video-load-failed'),
              domNode.load()),
              domNode.error || domNode.setAttribute('controls', 'controls');
          })
          .on('mouseleave', 'video', function (inputUnusedParameter1) {
            this.error || this.removeAttribute('controls');
          })
          .on('click', '.md-rawblock-tooltip-edit-btn', function (pointerEvent) {
            jquery(pointerEvent.target)
              .closest('.md-rawblock')
              .find('.md-rawblock-container')
              .trigger('startedit'),
              jquery('.marklyra-tooltip').removeClass('shown');
          })
          .on('mouseenter', '.md-htmlblock-container', function (contextEvent) {
            if (File.isWK) {
              console.debug('mouseenter to HTML iframe');
              var menuItems = currentEditor.contextMenu.getMenuItemsForMac(contextEvent.target, !0);
              window.bridge.callHandler('contextMenu.setItems', menuItems);
            }
          })
          .on('mouseleave', '.md-htmlblock-container', function (inputUnusedParameter1) {
            File.isWK &&
              (console.debug('mouseleave to HTML iframe'),
              window.bridge.callHandler('contextMenu.setItems', []));
          })
          .on(
            'click',
            '.md-rawblock-tooltip-ok-btn',
            currentEditor.finishRawBlockEdit.bind(currentEditor),
          ),
          File.isMac &&
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
      resetVideoDom(element) {
        element.classList.remove('md-video-load-failed'),
          jquery(element).prev('.md-htmlblock-panel-placeholder').remove();
      }
      getCidAndElem(nodeOrElement) {
        var nodeId = nodeOrElement,
          element = nodeOrElement;
        return (
          'string' == typeof nodeOrElement
            ? (element = this.editor.findElemById(nodeId))
            : (nodeId = element.attr('cid')),
          [nodeId, element]
        );
      }
      beforeDeleteFences(nodeId) {
        this.syncToNode(nodeId), this.dropEditing(), (this.currentCm = void 0);
      }
      syncToNode(nodeId) {
        var documentNode = 'string' == typeof nodeId ? this.editor.getNode(nodeId) : nodeId;
        return (
          (this.currentCm || {}).cid === documentNode.cid &&
            documentNode.set('text', this.currentCm.getValue()),
          documentNode
        );
      }
      dropEditing() {
        if (this.currentCm) {
          var nodeElement = this.editor.findElemById(this.currentCm.cid),
            documentNode = this.editor.getNode(this.currentCm.cid);
          nodeElement.find('.md-htmlblock-panel').html('').hide(),
            nodeElement.replaceWith(documentNode.toHTML()),
            (this.currentCm = void 0);
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
            if ((nodeElement.removeClass('md-rawblock-on-edit'), !htmlEdited))
              return (
                (this.currentCm = null),
                this.syncToNode(documentNode),
                nodeElement.find('.md-htmlblock-panel').hide().html(''),
                nodeElement.find('.md-rawblock-container').show(),
                void this.refreshUnder(nodeElement[0])
              );
            var editCommand = undoManager.makeEmptyCommand();
            editCommand.undo.push({
              type: 'fences-pos',
              pos: codeMirror.getCursor(),
              id: codeMirror.cid,
            }),
              editCommand.undo.push(undoManager.buildReplaceUndo(documentNode)),
              this.syncToNode(documentNode);
            var parseResult = documentNode.parseFrom({
                noTop: !documentNode.get('attachTo'),
                skips: { old_code: !1, pass_format: !0 },
              }),
              parsedNodes = parseResult[1];
            editCommand.redo.push(undoManager.buildReplaceUndo(documentNode)),
              parsedNodes.length > 1 &&
                ((parsedNodes = parsedNodes.slice(1)),
                undoManager.addUndoForInsertArray(editCommand, parsedNodes, documentNode)),
              (this.currentCm = null),
              nodeElement.replaceWith(parseResult[0]),
              this.refreshUnder(documentNode.cid),
              moveToNextBlock && currentEditor.selection.jumpToNextBlock(documentNode, editCommand),
              currentEditor.undo.register(editCommand),
              setTimeout(function () {
                editCommand.redo.push(currentEditor.selection.buildUndo());
              }, 100);
          } else this.currentCm = void 0;
        }
      }
      refreshUnder(nodeId) {
        var elements;
        nodeId
          ? (elements = (
              'string' == typeof nodeId ? this.editor.findElemById(nodeId)[0] : nodeId
            ).querySelectorAll('iframe.md-html-iframe'))
          : (elements = document.querySelectorAll('iframe.md-html-iframe'));
        elements.length &&
          elements.forEach(function (item) {
            item.contentWindow.postMessage('syncHeight', '*');
          });
      }
      startEditing(nodeOrElement, cursorPlacement) {
        if (!File.isLocked) {
          var currentCm,
            nodeAndElement = this.getCidAndElem(nodeOrElement),
            nodeId = nodeAndElement[0],
            element = nodeAndElement[1],
            currentEditor = this.editor,
            documentNode = this.editor.getNode(nodeId),
            u = function (codeMirror) {
              var currentDocumentNode = currentEditor.getNode(codeMirror.cid),
                UndoManager = currentEditor.undo.UndoManager,
                deleteCommand = UndoManager.makeEmptyCommand();
              currentEditor.htmlBlock.beforeDeleteFences(codeMirror.cid),
                deleteCommand.undo.push({
                  type: 'fences-pos',
                  pos: codeMirror.getCursor(),
                  id: codeMirror.cid,
                }),
                UndoManager.append(
                  deleteCommand,
                  currentEditor.UserOp.backToParagraph(currentEditor, currentDocumentNode, !1),
                ),
                currentEditor.undo.register(deleteCommand);
            };
          if (nodeId) {
            if (this.currentCm && this.currentCm.cid === nodeId) {
              if (currentEditor.writingArea.contains(this.currentCm.getWrapperElement()))
                return this.currentCm.focus(), this.currentCm;
              this.currentCm = null;
            }
            return (
              this.currentCm &&
                (this.stopEditing(this.currentCm.cid), window.getSelection().removeAllRanges()),
              element
                .find('.md-htmlblock-panel')
                .show()
                .html(
                  '<div class="md-rawblock-input md-rawblock-control" contenteditable="false"></div>',
                ),
              element.find('.md-rawblock-container').hide(),
              element.addClass('md-rawblock-on-edit'),
              (this.currentCm = (function (editor) {
                (htmlEdited = !1), (originalHtml = documentNode.get('text'));
                var codeMirror = CodeMirror(
                  element.find('.md-rawblock-input')[0],
                  {
                    styleSelectedText: !0,
                    styleActiveLine: !0,
                    lineWrapping: !File.option.noLineWrapping,
                    maxHighlightLength: 1 / 0,
                    viewportMargin: 1 / 0,
                    mode: 'htmlmixed',
                    placeholder: jquery.localize.getString('Input HTML here'),
                    theme: ' inner null-scroll',
                    autoCloseBrackets: !0,
                    autoCloseTags: !0,
                    value: originalHtml,
                    lineNumbers: !1,
                    resetSelectionOnContextMenu: !0,
                    dragDrop: !1,
                    indentUnit: File.option.codeIndentSize,
                    tabSize: File.option.codeIndentSize,
                    lineWiseCopyCut: File.option.lineWiseCopyCut,
                  },
                  editor,
                  nodeId,
                );
                return (
                  codeMirror.on('blur', function (codeMirror) {
                    setTimeout(function () {
                      document.body.contains(codeMirror.getWrapperElement()) &&
                        documentNode.set('text', codeMirror.getValue());
                    }, 0);
                  }),
                  codeMirror.on('focus', function (unusedParameter1) {
                    editor.refocus(codeMirror.cid);
                  }),
                  codeMirror.on('changes', function (changedEditor, changes) {
                    editor.fences.handleUserReplacement(changedEditor, changes),
                      editor.wordCount.quickUpdate(codeMirror.cid),
                      editor.selection.clearGlobalColumn(),
                      (htmlEdited = !0),
                      File.isTypeWriterMode &&
                        !File.option.scrollWithCursor &&
                        editor.selection.typeWriterScroll(
                          codeMirror.cursorCoords(codeMirror.getCursor()),
                        );
                  }),
                  codeMirror.on('cursorActivity', function () {
                    editor.fences.handleCursorActivity(codeMirror);
                  }),
                  codeMirror.on('keydown', function (codeMirror, keyboardEvent) {
                    editor.fences.onKeyDown(codeMirror, keyboardEvent, editor, u, h);
                  }),
                  codeMirror
                );
              })(this.editor)),
              (currentCm = this.currentCm).focus(),
              currentCm.execCommand('goDocEnd'),
              currentEditor.selection.scrollAdjust(),
              cursorPlacement &&
                ('start' == cursorPlacement
                  ? this.currentCm.execCommand('goDocStart')
                  : 'end' == cursorPlacement
                    ? this.currentCm.execCommand('goDocEnd')
                    : 'auto' == cursorPlacement && this.findPos(this.currentCm),
                this.editor.refocus(documentNode.id)),
              this.currentCm
            );
          }
        }
        function h(codeMirror, keyboardEvent) {
          if (
            k(codeMirror) &&
            (keyboardEvent.ctrlKey ||
              keyboardEvent.metaKey ||
              (!keyboardEvent.shiftKey && S(codeMirror.getValue())))
          )
            return (
              setTimeout(
                typeof globalThis.__MARKLYRA_HTML_CALLBACK__ === 'function'
                  ? globalThis.__MARKLYRA_HTML_CALLBACK__(function () {
                      currentEditor.UserOp.insertParagraph();
                    })
                  : function () {
                      currentEditor.UserOp.insertParagraph();
                    },
                20,
              ),
              keyboardEvent.preventDefault(),
              keyboardEvent.stopPropagation(),
              !0
            );
        }
      }
      findPos(codeMirror) {
        var lineCount = codeMirror.lineCount();
        lineCount >= 3
          ? codeMirror.setCursor(lineCount - 2, codeMirror.getLine(lineCount - 2).length)
          : 2 == lineCount
            ? codeMirror.setCursor(lineCount - 1, 0)
            : codeMirror.setCursor(lineCount - 1, codeMirror.getLine(lineCount - 1).length);
      }
      listenMessage() {
        var currentEditor = this.editor;
        window.addEventListener(
          'message',
          function (messageEvent) {
            if (
              typeof globalThis.__MARKLYRA_HTML_MESSAGE__ === 'function' &&
              !globalThis.__MARKLYRA_HTML_MESSAGE__(messageEvent)
            )
              return;
            var previewMessage = messageEvent.data,
              previewFrame = currentEditor.findElemById(previewMessage.cid).find('iframe')[0];
            'changeHeight' == previewMessage.msg && (previewFrame.height = previewMessage.height),
              'startEditing' == previewMessage.msg &&
                jquery(previewFrame).closest('.md-rawblock-container').trigger('startedit'),
              'contextmenu' == previewMessage.msg &&
                File.isNode &&
                _(previewFrame, previewMessage.event),
              'mousedown' == previewMessage.msg && File.isNode && File.editor.contextMenu.hide();
          },
          !1,
        );
      }
    }
    E.allowWhiteList = function () {
      if (void 0 === supportsSrcdoc) {
        var iframeElement = document.createElement('iframe');
        (supportsSrcdoc = void 0 !== iframeElement.srcdoc), iframeElement.remove();
      }
      return supportsSrcdoc;
    };
    var exportSanitizerOptions = {
      FORBID_ATTR: [],
      ADD_ATTR: ['async', 'srcdoc', 'class', 'alt', 'for', 'title', 'charset'],
      FORBID_TAGS: [],
      ADD_TAGS: ['iframe', 'dialog', 'footer', 'style', 'template', 'svg'],
      ALLOW_DATA_ATTR: !0,
      ALLOW_UNKNOWN_PROTOCOLS: !0,
      forHTMLBlock: !0,
      forPrint: !0,
    };
    window.reqnode &&
      (exportSanitizerOptions.ADD_TAGS.remove('iframe'),
      exportSanitizerOptions.FORBID_TAGS.push('iframe')),
      (E.INLINE_CONFIG = {
        ADD_TAGS: [],
        FORBID_TAGS: ['iframe', 'dialog', 'embed', 'footer', 'object'],
        ALLOW_UNKNOWN_PROTOCOLS: !0,
        ADD_ATTR: ['controls', 'allowfullscreen', 'marklyra-id', 'marklyra-class'],
      }),
      (E.getDomPurifyConfig = function (overrides) {
        return Object.assign(
          {
            FORBID_ATTR: ['class', 'contenteditable', 'cid', 'id', 'loop', 'autoplay', 'preload'],
            ADD_ATTR: ['allowfullscreen', 'async', 'charset', 'srcdoc', 'controls'],
            ADD_TAGS: ['iframe', 'dialog', 'footer'],
            FORBID_TAGS: ['head', 'style'],
            ALLOW_DATA_ATTR: !1,
            RETURN_DOM: !0,
            ALLOW_UNKNOWN_PROTOCOLS: !0,
            USE_PROFILES: { html: !0, svg: !0, svgFilters: !0, mathMl: !0 },
          },
          overrides,
        );
      });
    var _ = function (target, pointerEvent) {
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
      A = function (frameElement) {
        return frameElement.src && /\.pdf/i.exec(new URL(frameElement.src).pathname);
      };
    (window.loadedWebview = function (domNode) {
      function t() {
        domNode.previousElementSibling &&
          domNode.previousElementSibling.classList.contains('md-htmlblock-panel-placeholder') &&
          domNode.parentElement.removeChild(domNode.previousElementSibling);
      }
      domNode._eventBind ||
        (t(),
        domNode.addEventListener('did-start-loading', function () {
          t();
          var divElement = document.createElement('div');
          divElement.setAttribute('class', 'md-htmlblock-panel-placeholder'),
            (divElement.innerHTML =
              '<div class="marklyra-lds-spinner"><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div></div>'),
            domNode.parentElement.insertBefore(divElement, domNode);
        }),
        domNode.addEventListener('did-stop-loading', t),
        domNode.addEventListener('console-message', function (consoleEvent) {
          3 === consoleEvent.level &&
            console.error(consoleEvent.sourceId + consoleEvent.line, consoleEvent.message);
        }),
        domNode.addEventListener('did-fail-load', function (loadFailure) {
          domNode.previousElementSibling.textContent =
            loadFailure.errorDescription + '  ' + loadFailure.validatedURL;
        }),
        domNode.addEventListener('context-menu', function (contextMenuEvent) {
          var webviewElement = jquery(domNode),
            contextEvent = new jquery.Event('contextmenu', {
              target: domNode,
              currentTarget: domNode,
              clientY: contextMenuEvent.params.y,
              clientX: contextMenuEvent.params.x,
            });
          webviewElement.trigger(contextEvent);
        }),
        domNode.addEventListener('enter-html-full-screen', () => {
          JSBridge.invoke('window.enterFullscreen');
        }),
        domNode.addEventListener('leave-html-full-screen', () => {
          JSBridge.invoke('window.exitFullscreen');
        }),
        (domNode._eventBind = !0));
    }),
      (window.remoteOnLoad = function (domNode) {
        function t(frameElement) {
          var isPdf = A(frameElement);
          if (
            H(frameElement) &&
            ((frameElement.contentDocument.documentElement.oncontextmenu = function (contextEvent) {
              _(frameElement, contextEvent);
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
            scrollHeight != innerHeight ||
            (isPdf && frameElement.contentDocument.body.childElementCount > 4)
              ? (frameElement.height = Math.min(scrollHeight, 600))
              : ((frameElement.height = 24),
                (frameElement.height = frameElement.contentDocument.body.scrollHeight)),
              (frameElement.dataset.userHeight = frameElement.height);
          }
        }
        domNode.classList.contains('md-html-iframe') ||
          (domNode.previousElementSibling &&
            (domNode.previousElementSibling.classList.contains('md-htmlblock-panel-placeholder') &&
              domNode.parentElement.removeChild(domNode.previousElementSibling),
            File.isNode && domNode.contentDocument
              ? domNode.contentDocument.body
                ? t(domNode)
                : domNode.contentDocument.addEventListener(
                    'DOMContentLoaded',
                    function (unusedParameter1) {
                      t(domNode);
                    },
                  )
              : domNode.removeAttribute('guest-id'),
            U(domNode)));
      });
    var text = document.querySelector('#md-htmlblock-panel-novideo-templ').text,
      currentText = document.querySelector('#md-htmlblock-panel-nohtml-templ').text;
    function N(domNode, inputText, unusedParameter3) {
      var previousElementSibling = domNode.previousElementSibling;
      (inputText =
        inputText.replace('http://marklyra-app', 'MarkLyra.app').replace(/^marklyra:.+/, '') ||
        'blank'),
        previousElementSibling ||
          ((previousElementSibling = document.createElement('div')).classList.add(
            'md-htmlblock-panel-placeholder',
          ),
          domNode.parentElement.insertBefore(previousElementSibling, domNode)),
        (previousElementSibling.innerHTML = currentText),
        (previousElementSibling.querySelector('.md-resouce-error-message').textContent = inputText),
        (domNode.height = Math.max((domNode.height || 0) - 0, 48));
    }
    window.videoOnError = function (domNode) {
      var divElement = document.createElement('div');
      divElement.setAttribute('class', 'md-htmlblock-panel-placeholder'),
        (divElement.innerHTML = text),
        (divElement.querySelector('.md-resouce-error-message').textContent =
          domNode.src
            .replace('http://marklyra-app', 'MarkLyra.app')
            .replace(/^wkfile:/, 'file:')
            .replace(/^marklyra:.+/, '') || 'blank'),
        domNode.parentElement.insertBefore(divElement, domNode),
        domNode.classList.add('md-video-load-failed');
    };
    var D = function (parentElement) {
      if (!E.allowWhiteList()) return !1;
      var elements = parentElement.querySelectorAll('script');
      return (
        1 == elements.length &&
        elements[0].parentElement == parentElement &&
        P(elements[0].getAttribute('src'))
      );
    };
    E.checkIsWhiteList = function (documentNode) {
      if (!E.allowWhiteList()) return !1;
      if ('script' == documentNode.get('style')) {
        var parsedContent = (function (inputHtml) {
          var templateElement = document.createElement('template');
          return (templateElement.innerHTML = inputHtml), templateElement.content;
        })(documentNode.get('text'));
        if (1 == parsedContent.childElementCount) {
          var domNode = parsedContent.firstElementChild;
          return 'SCRIPT' == domNode.tagName && P(domNode.getAttribute('src'));
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
    function P(searchValue) {
      searchValue = /^\/\//.exec((searchValue = searchValue || ''))
        ? 'https:' + searchValue
        : searchValue.replace(/^http:/, 'https:');
      try {
        searchValue = new URL(searchValue).href;
      } catch (error) {}
      return (
        trustedEmbedScripts.indexOf(searchValue) > -1 ||
        !!trustedEmbedPatterns.gist.exec(searchValue)
      );
    }
    var dOMParserInstance = new DOMParser();
    function O(inputHtml, sanitizerOptions, skipMediaWrappers) {
      var body = (
        dOMParserInstance.parseFromString('<body>' + inputHtml + '</body>', 'text/html') || {}
      ).body;
      return (
        body || ((body = document.createElement('body')).innerHTML = inputHtml),
        sanitizerOptions && D(body)
          ? ((sanitizerOptions.whitelistMode = !0),
            sanitizerOptions.ADD_TAGS
              ? sanitizerOptions.ADD_TAGS.push('script')
              : (sanitizerOptions.ADD_TAGS = ['script']),
            (sanitizerOptions.FORBID_ATTR = ['contenteditable']),
            (sanitizerOptions.ALLOW_DATA_ATTR = !0),
            body.classList.add('md-preview-body'),
            body)
          : skipMediaWrappers
            ? body
            : (body.querySelectorAll("[role='wrapper']").forEach(function (item) {
                item.removeAttribute('role');
              }),
              body.querySelectorAll('iframe, video').forEach(function (domNode) {
                var divElement = document.createElement('div');
                divElement.setAttribute('role', 'wrapper'),
                  domNode.parentElement.replaceChild(divElement, domNode),
                  divElement.appendChild(domNode);
              }),
              body)
      );
    }
    var guestSequence = 2;
    domPurifyExport.addHook('beforeSanitizeElements', function (element) {
      return element.id && element.setAttribute('marklyra-id', element.id), element;
    }),
      domPurifyExport.addHook(
        'afterSanitizeAttributes',
        function (domNode, unusedParameter2, sanitizerOptions) {
          var hasStyle = domNode && domNode.nodeType == domNode.ELEMENT_NODE && domNode.style;
          if (hasStyle) {
            var imageSource = domNode.getAttribute('src');
            /^\/\//.exec(imageSource || '') && domNode.setAttribute('src', 'https:' + imageSource);
            var linkTarget = domNode.getAttribute('href');
            /^\/\//.exec(linkTarget || '') && domNode.setAttribute('href', 'https:' + linkTarget);
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
                if (
                  (sanitizerOptions.forPrint || domNode.setAttribute('guest-id', ++guestSequence),
                  (imageSource = domNode.getAttribute('src')) &&
                    domNode.setAttribute('src', imageSource.replace(/^\/\//, 'https://')),
                  'iframe' == domNode.tagName.toLowerCase())
                ) {
                  if (
                    (domNode.setAttribute('allow-top-navigation', 'false'),
                    domNode.setAttribute('allow-forms', 'false'),
                    domNode.setAttribute('allowfullscreen', 'true'),
                    domNode.setAttribute('allow-popups', 'false'),
                    domNode.srcdoc)
                  )
                    return void domNode.setAttribute('sandbox', '');
                  /^data:/.exec(imageSource) && File.isMac
                    ? domNode.setAttribute('sandbox', 'allow-scripts allow-same-origin')
                    : /^(https?)?:[\\\/]/.exec(imageSource)
                      ? File.isMac || /^https?:/.exec(imageSource)
                        ? domNode.setAttribute(
                            'sandbox',
                            'allow-scripts allow-same-origin allow-popups',
                          )
                        : domNode.setAttribute('sandbox', 'allow-scripts')
                      : domNode.setAttribute('sandbox', 'allow-same-origin'),
                    /^marklyra/.exec(imageSource) &&
                      ((imageSource = 'about:blank'), (domNode.src = imageSource)),
                    sanitizerOptions.forPrint ||
                      domNode.setAttribute(
                        'onLoad',
                        'window.remoteOnLoad && window.remoteOnLoad(this)',
                      ),
                    (imageSource = domNode.getAttribute('src')),
                    File.editor.imgEdit &&
                      !/[a-z]+:/.exec(imageSource) &&
                      (domNode.src = File.editor.imgEdit.getAbsolutePath(imageSource, !0));
                }
                if (
                  !sanitizerOptions.forPrint &&
                  'wrapper' == domNode.parentElement.getAttribute('role')
                ) {
                  var divElement = document.createElement('div');
                  divElement.setAttribute('class', 'md-htmlblock-panel-placeholder'),
                    (divElement.innerHTML =
                      '<div class="marklyra-lds-spinner"><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div></div>'),
                    domNode.parentElement.insertBefore(divElement, domNode);
                }
              }
              if (
                DocumentNode.isType(
                  domNode.tagName.toLowerCase(),
                  'video',
                  'audio',
                  'img',
                  'source',
                )
              )
                (imageSource = domNode.getAttribute('src')) &&
                  (function (element) {
                    var currentImageSource = element.getAttribute('src');
                    if (((element.dataset.src = currentImageSource), File.editor.imgEdit)) {
                      var src = File.editor.imgEdit.getAbsolutePath(currentImageSource, !0);
                      utilities.fromExternalPath(src) && (src = utilities.file2wkfile(src)),
                        (element.src = src);
                    }
                  })(domNode);
              DocumentNode.isType(domNode.tagName.toLowerCase(), 'video') &&
                (sanitizerOptions.forPrint ||
                  (domNode.setAttribute('controlsList', 'nodownload'),
                  domNode.setAttribute('onError', 'window.videoOnError(this)')),
                domNode.getAttribute('poster') &&
                  domNode.setAttribute(
                    'poster',
                    editor.imgEdit.getAbsolutePath(domNode.getAttribute('poster'), !0),
                  )),
                !sanitizerOptions.forPrint &&
                  DocumentNode.isType(domNode.tagName.toLowerCase(), 'audio') &&
                  (domNode.setAttribute('controlsList', 'nodownload'),
                  domNode.setAttribute('controls', ''));
            }
            return domNode;
          }
        },
      );
    document.querySelector('#marklyra-resize-temp');
    function H(frameElement) {
      if (File.isNode) return frameElement.contentDocument;
      try {
        return frameElement.contentDocument;
      } catch (error) {}
      return null;
    }
    function U(frameElement, unusedParameter2) {
      frameElement &&
        !frameElement.srcdoc &&
        frameElement &&
        (H(frameElement) || {}).body &&
        (0 !== frameElement.src.indexOf(frameElement.contentWindow.location.protocol) &&
          ('about:blank' == frameElement.contentWindow.location.href &&
            N(frameElement, frameElement.src),
          frameElement.contentDocument.body.childNodes.length +
            frameElement.contentDocument.head.childNodes.length ==
            0 && N(frameElement, frameElement.src)),
        frameElement.removeAttribute('guest-id'));
    }
    (window.turnOnIframeRefreshTimer = function (guestId, unusedParameter2) {
      setTimeout(function () {
        U(document.querySelector("iframe[guest-id='" + guestId + "']"));
      }, 2e3);
    }),
      (E.UNSFAE_TAGS = [
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
      ]),
      (E.convertToXHTML = function (htmlText) {
        try {
          var htmlDocument = new DOMParser().parseFromString(htmlText, 'text/html');
          return new XMLSerializer().serializeToString(htmlDocument);
        } catch (error) {}
        return htmlText;
      }),
      (E.buildHTMLForExport = function (inputText, editor, exportTarget, ownerNode) {
        var bodyElement;
        if (!exportTarget) return inputText;
        if (/\s*^<(div)[^>]*\/>\s*$/.exec(inputText)) return inputText.replace(/\/>\s*/, '></div>');
        if (/^(<\/?(div|p)[^>]*>\s*)+$/.exec(inputText)) return inputText;
        var sanitizerOptions = E.getDomPurifyConfig(exportSanitizerOptions);
        return (bodyElement = O(inputText, sanitizerOptions, !0)).firstChild
          ? ((bodyElement = domPurifyExport.sanitize(bodyElement, sanitizerOptions))
              .querySelectorAll('iframe, video, audio, img')
              .forEach(function (domNode) {
                var imageSource = domNode.getAttribute('src');
                if (
                  (/^\/\//.exec(imageSource)
                    ? (domNode.src = 'https:' + imageSource)
                    : exportTarget &&
                      imageSource &&
                      ((domNode.src = window.addDateQuery(
                        editor.imgEdit.getAbsolutePath(imageSource, !0),
                      )),
                      'iframe' != domNode.tagName.toLowerCase() &&
                        domNode.setAttribute('onError', "this.style.display = 'none';")),
                  exportTarget &&
                    'iframe' == domNode.tagName.toLowerCase() &&
                    (domNode.setAttribute('sandbox', ''),
                    domNode.setAttribute('allow-popups', 'false'),
                    /^https?:/.exec(domNode.src) &&
                      domNode.setAttribute('sandbox', 'allow-scripts')),
                  'video' == domNode.tagName.toLowerCase())
                )
                  if (!0 === exportTarget && ownerNode) {
                    var elements = editor.findElemById(ownerNode.cid).find('video');
                    if (1 !== elements.length || !elements[0].videoHeight) return;
                    var src =
                      editor.imgEdit.getAbsolutePath(elements[0].getAttribute('poster'), !0) ||
                      E.getVideoScreenshot(elements[0]);
                    if (src.length > 9e4) return;
                    var attributes = domNode.attributes,
                      parentElement = domNode.parentElement,
                      childIndex = Array.prototype.indexOf.call(parentElement.childNodes, domNode);
                    (domNode.outerHTML = '<img />'), (domNode = parentElement.children[childIndex]);
                    for (var itemIndex = attributes.length - 1; itemIndex >= 0; itemIndex--)
                      domNode.setAttribute(attributes[itemIndex].name, attributes[itemIndex].value);
                    domNode.src = src;
                  } else
                    'epub' === exportTarget &&
                      (domNode.removeAttribute('controls'), domNode.removeAttribute('controllist'));
              }),
            bodyElement.innerHTML)
          : '';
      }),
      (E.buildHTML = function (documentNode) {
        var sanitizerOptions = E.getDomPurifyConfig({ forHTMLBlock: !0 }),
          parsedBody = O(documentNode.get('text'), sanitizerOptions);
        return parsedBody.firstChild
          ? (parsedBody = domPurifyExport.sanitize(
              parsedBody,
              sanitizerOptions,
            )).classList.contains('md-preview-body')
            ? (function (element, previewHtml, nodeId) {
                element.classList.add('md-html-iframe'),
                  (element.sandbox = 'allow-same-origin allow-scripts allow-popups'),
                  element.setAttribute('seamless', 'seamless'),
                  element.setAttribute('allow-top-navigation', 'false'),
                  element.setAttribute('allow-forms', 'false'),
                  element.setAttribute('allowfullscreen', 'true'),
                  (element.height = 20),
                  (element.srcdoc =
                    "<html><head><script>window.reqnode = undefined;window.require = undefined;<\/script><style type='text/css'>iframe {margin: auto;}</style></head><body>" +
                    previewHtml +
                    '<script>' +
                    html.replace(/\s*\n\s*/g, '') +
                    "\niframePreloadScript('" +
                    nodeId +
                    "');<\/script></body></html>");
                var outerHTML = element.outerHTML;
                return element.remove(), outerHTML;
              })(document.createElement('iframe'), parsedBody.innerHTML, documentNode.cid)
            : (parsedBody.querySelectorAll('iframe').forEach(function (domNode) {
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
                  return (
                    (scriptElement.innerHTML = `var w = document.querySelector("[guest-id='${guestId}']");loadedWebview(w);`),
                    currentDomNode.parentElement.appendChild(scriptElement),
                    domNode.height && (currentDomNode.style.height = domNode.height + 'px'),
                    currentDomNode.setAttribute(
                      'webpreferences',
                      'webViewGuestId=' + guestId + ', webviewTag=no,disableDialogs=true',
                    ),
                    currentDomNode.setAttribute('autosize', 'autosize'),
                    void currentDomNode.setAttribute('nodeintegration', !1)
                  );
                }
                if ((guestId = domNode.getAttribute('guest-id') - 0) && !isNaN(guestId)) {
                  var SCRIPTElement = document.createElement('SCRIPT');
                  SCRIPTElement.setAttribute('data-run', 'true'),
                    (SCRIPTElement.type = 'text/javascript'),
                    (SCRIPTElement.text =
                      'turnOnIframeRefreshTimer(' + guestId + ", '" + documentNode.cid + "')"),
                    domNode.parentElement.appendChild(SCRIPTElement);
                }
              }),
              parsedBody.innerHTML)
          : '';
      }),
      (E.getVideoScreenshot = function (videoElement) {
        var element = document.querySelector('#video-canvas'),
          canvasContext = element.getContext('2d');
        (element.width = videoElement.videoWidth), (element.height = videoElement.videoHeight);
        try {
          return (
            canvasContext.drawImage(
              videoElement,
              0,
              0,
              videoElement.videoWidth,
              videoElement.videoHeight,
            ),
            element.toDataURL()
          );
        } catch (error) {
          console.warn(error);
        }
        return '';
      });
    var html = document.querySelector('#md-html-iframe-preload-temp').innerHTML;
    (E.autoCloseTagWhenInput = function (
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
            return knownTagNames.indexOf(searchValue) > -1 ? searchValue : void 0;
          }
        })();
        return tagName
          ? (function (closingTagName) {
              pendingCommand && editor.undo.register(pendingCommand);
              var end,
                currentRange,
                domNode = document.createTextNode('/' + closingTagName + '>');
              return (
                range.insertNode(domNode),
                domNode.parentElement.normalize(),
                (end = closingTagName.length + 2),
                (currentRange = editor.selection.rangy.createRange()),
                (selectionBookmark.end += end),
                (selectionBookmark.start += end),
                currentRange.moveToBookmark(selectionBookmark),
                currentRange.select(currentRange.isBackward),
                pendingCommand && pendingCommand.redo.push(editor.selection.buildUndo()),
                editor.undo.addSnap(targetNode.cid, SnapFlag.REPLACE),
                !0
              );
            })(tagName)
          : void 0;
      }
    }),
      (E.prototype.autoCloseTagWhenInput = E.autoCloseTagWhenInput),
      (E.BLOCK_OPEN_REG = BLOCK_OPEN_REG),
      (E.INLINE_TYPE = INLINE_TYPE),
      (E.ALL_INLINE_TYPE = ALL_INLINE_TYPE),
      (E.HIDDEN_TYPE = HIDDEN_TYPE),
      (E.NO_TEXT_BLOCK_TYPE = [
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
      ]),
      (E.BLOCK_TYPE = BLOCK_TYPE),
      (E.autoCloseTag = function (documentNode) {
        var localText = documentNode.get('text'),
          lineIndent = (/^[ \t]+/.exec(localText) || [''])[0],
          style = documentNode.get('style'),
          depth = documentNode.get('depth');
        if (!(voidElementTags.indexOf(style) > -1)) {
          for (
            depth && (localText += '\n' + lineIndent + ' '.repeat(File.option.codeIndentSize));
            depth;
          )
            depth--, (localText += '\n' + lineIndent + '</' + style + '>');
          documentNode.set('text', localText), documentNode.set('depth', 0);
        }
      }),
      (E.getHTMLTagReg = C),
      (window.DOMPurify = domPurifyExport),
      (moduleRecord.exports = E);
  },
);
