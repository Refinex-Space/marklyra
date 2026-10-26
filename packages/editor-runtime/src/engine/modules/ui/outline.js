// ui/outline.
export default function initializeUiOutline(requireModule, moduleExports, moduleRecord) {
  'use strict';
  Object.defineProperty(getOutlineInlineLexer, 'name', { value: 'g', configurable: true });
  Object.defineProperty(matchMetadataProperty, 'name', { value: 'b', configurable: true });

  if (!this) {
    self;
  }
  var utilities = requireModule('shared/utilities'),
    documentModel = requireModule('model/document-model'),
    DocumentNode = documentModel.Node,
    NodeType = documentModel.TYPE,
    jquery = requireModule('libraries/jquery'),
    markdownParser = requireModule('model/markdown-parser'),
    fileIntegration =
      (requireModule('editing/selection').rangy, requireModule('host/file-integration')),
    undoManager = requireModule('editing/undo-manager'),
    recovery = requireModule('document/recovery'),
    inlineDecoration = requireModule('render/inline-decoration');
  class ReferenceNodeCollection {
    constructor() {
      this.reset();
      Object.defineProperty(this, 'length', {
        get: function () {
          return this._set.length;
        },
      });
    }
    get(key) {
      return this._map.get(key);
    }
    add(node) {
      if (node.cid) {
        this._map.set(node.cid, node);
      }
      this._set.push(node);
    }
    push(node) {
      this.add(node);
    }
    remove(node) {
      if (node.cid) {
        var existingNode = this._map.get(node.cid);
        this._map.delete(node.cid);
        if (existingNode) {
          this._set.remove(existingNode);
        }
      }
      this._set.remove(node);
    }
    reset() {
      this._set = [];
      this._map = new Map();
    }
    forEach(callback, receiver) {
      this._set.clone().forEach(callback, receiver);
    }
    indexOf(targetNode) {
      for (var nodeIndex = 0, documentNode = this.sortedFirst(); documentNode; ) {
        if (targetNode == documentNode) {
          return nodeIndex;
        }
        documentNode = documentNode.get('after');
        nodeIndex++;
      }
      return -1;
    }
    getNodeByRef(reference) {
      for (let definitionNode of this._set) {
        if (
          utilities.escape(definitionNode.get('ref')).toLowerCase() ==
          utilities.escape(reference).toLowerCase()
        ) {
          return definitionNode;
        }
      }
    }
    getFootHTMLByRef(reference, syncDefinition) {
      var documentNode = this.getNodeByRef(reference);
      if (documentNode) {
        if (syncDefinition) {
          File.editor.store(documentNode.cid, true);
        }
        return (
          "<div class='code-tooltip md-tooltip-remove md-hover-tip md-f-tooltip' contenteditable='false'><div class='md-arrow' /><div class='code-tooltip-content'>" +
          editor.brush.inline.output(documentNode.get('text')) +
          '</div></div>'
        );
      } else {
        return null;
      }
    }
    getHrefByRef(reference, syncDefinition, rawValue) {
      var documentNode = this.getNodeByRef(reference);
      if (documentNode && syncDefinition) {
        File.editor.store(documentNode.cid, true);
      }
      var linkTarget = documentNode ? documentNode.get('href') : void 0;
      if (rawValue) {
        return linkTarget;
      } else {
        if (linkTarget) {
          return utilities.escape(linkTarget);
        } else {
          return void 0;
        }
      }
    }
  }
  Object.defineProperty(ReferenceNodeCollection, 'name', { value: 'p', configurable: true });
  var outlineInlineLexer,
    renderOutlineInlineToken = Object.defineProperty(
      function (token) {
        switch (token.type) {
          case NodeType.strong:
            return '<strong>' + token.inner + '</strong>';
          case NodeType.em:
            return '<em>' + token.inner + '</em>';
          case NodeType.code:
            return '<code>' + utilities.escape(token.text) + '</code>';
          case NodeType.plain:
            return utilities.escape(token.text);
          case NodeType.tag:
            return '';
          case NodeType.imgtag:
          case NodeType.refimg:
          case NodeType.image:
            return '';
          case NodeType.inline_math:
            return inlineDecoration.decorateAsExport(token, { forPrint: true });
          case NodeType.underline:
            return '<u>' + token.inner + '</u>';
          case NodeType.del:
            return '<del>' + token.inner + '</del>';
          case NodeType.footnote:
            return '';
          case NodeType.escape:
            return utilities.escape(token.text);
          case NodeType.highlight:
            return '<mark>' + token.inner + '</mark>';
          case NodeType.superscript:
            return '<sup>' + token.inner + '</sup>';
          case NodeType.subscript:
            return '<sub>' + token.inner + '</sub>';
          case NodeType.linebreak:
            return '';
          case NodeType.tab:
            return '<span>' + token.inner + '</span>';
          default:
            return token.inner || utilities.escape(token.text || '');
        }
      },
      'name',
      { value: 'm', configurable: true },
    );
  function getOutlineInlineLexer() {
    if (!outlineInlineLexer) {
      outlineInlineLexer = new markdownParser.InlineLexer(null, renderOutlineInlineToken);
    }
    return outlineInlineLexer;
  }
  class TableOfContents {
    constructor(documentMap) {
      this.nodeMap = documentMap;
      this.refresh();
      this.delay = 300;
      this.refreshTimeout = null;
    }
    remove(searchValue) {
      var headerIndex = this.headers.indexOf(searchValue);
      if (headerIndex > -1) {
        this.headers.splice(headerIndex, 1);
      }
    }
    updateHeaderText(documentNode) {
      if (
        !this.refreshTimeout &&
        !File._onInitPars &&
        this.headers &&
        -1 != this.headers.indexOf(documentNode)
      ) {
        var headingHtml = outlineInlineLexer.output(documentNode.get('text'));
        jquery(".md-toc-item[data-ref='" + documentNode.cid + "']")
          .children('.md-toc-inner')
          .html(headingHtml);
        jquery("#outline-content .outline-label[data-ref='" + documentNode.cid + "']").html(
          headingHtml,
        );
        if (window.File && File.editor && File.editor.mathInline) {
          File.editor.mathInline.renderInToc();
        }
      }
    }
    refresh(immediate, skipHtmlUpdate) {
      Object.defineProperty(collectHeadings, 'name', { value: 'i', configurable: true });

      if (!File._onInitParse) {
        var receiver = this;
        if (this.refreshTimeout) {
          clearTimeout(this.refreshTimeout);
        }
        this.refreshTimeout = null;
        if (immediate) {
          collectHeadings.call(receiver);
        } else {
          this.refreshTimeout = setTimeout(function () {
            collectHeadings.call(receiver);
          }, this.delay);
        }
      }
      function collectHeadings() {
        var documentNode = this.nodeMap.getFirst();
        for (this.headers = []; documentNode; ) {
          if (DocumentNode.isType(documentNode, DocumentNode.TYPE.heading)) {
            this.headers.push(documentNode);
          } else {
            if (
              File.option.expandSimpleBlock &&
              DocumentNode.isType(documentNode, DocumentNode.TYPE.paragraph) &&
              documentNode.get('depth')
            ) {
              this.headers.push(documentNode);
            }
          }
          documentNode = documentNode.get('after');
        }
        if (!skipHtmlUpdate) {
          this.updateHTML();
        }
        this.refreshTimeout = null;
      }
    }
    getTocInnerHTML() {
      var tocHtml = '';
      (this.headers || []).map(function (item) {
        var documentNode, text;
        if (!item.isDeleted()) {
          tocHtml +=
            ((text = (documentNode = item).get('text')),
            DocumentNode.isType(documentNode, DocumentNode.TYPE.paragraph) &&
              (text = documentNode.getText().replace(/(^#+\s*)|(#+\s*$)|\n.*/, '')),
            "<span role='listitem' class='md-toc-item md-toc-h" +
              documentNode.get('depth') +
              "' data-ref='" +
              documentNode.cid +
              "'><a class='md-toc-inner'>" +
              outlineInlineLexer.output(text) +
              '</a></span>');
        }
      });
      return tocHtml;
    }
    updateHTML(forceRefresh) {
      var itemIndex = 0,
        elements = document.querySelectorAll('.md-toc-content');
      if (elements.length > 0) {
        var html = this.getTocInnerHTML();
        for (itemIndex = 0; itemIndex < elements.length; itemIndex++) {
          if (elements[itemIndex].innerHTML != html) {
            elements[itemIndex].innerHTML = html;
          }
        }
      }
      if (File.editor.library) {
        File.editor.library.outline.updateOutlineHtml(this, forceRefresh);
      }
      if (File.editor.mathInline) {
        File.editor.mathInline.renderInToc();
      }
      File.editor.tryEnterBusyModeWithDelay();
    }
  }
  Object.defineProperty(TableOfContents, 'name', { value: 'v', configurable: true });
  class OutlineController {
    constructor(inputEditor) {
      var receiver = this;
      getOutlineInlineLexer();
      this.expandedOutlineItem = [];
      inputEditor.nodeMap.foot_list = new ReferenceNodeCollection();
      inputEditor.nodeMap.link_list = new ReferenceNodeCollection();
      inputEditor.nodeMap.toc = new TableOfContents(inputEditor.nodeMap);
      this.editor = inputEditor;
      (function () {
        Object.defineProperty(scheduleTooltipHide, 'name', { value: 'r', configurable: true });

        var tooltipHovered,
          focusCid,
          currentEditor = receiver.editor;
        function scheduleTooltipHide() {
          tooltipHovered = false;
          setTimeout(function () {
            if (!tooltipHovered) {
              jquery('.md-f-tooltip').remove();
            }
          }, 500);
        }
        setTimeout(function () {
          jquery(document)
            .on('mouseenter mousemove', '.md-footnote', function () {
              if (!tooltipHovered || focusCid !== currentEditor.focusCid) {
                if (
                  window.getSelection().anchorNode &&
                  this.contains(window.getSelection().anchorNode.parentElement)
                ) {
                  return;
                }
                tooltipHovered = true;
                focusCid = currentEditor.focusCid;
                receiver.showTooltipForSup(jquery(this));
              }
            })
            .on('mouseleave', '.md-footnote', scheduleTooltipHide)
            .on('mouseenter', '.md-f-tooltip', function () {
              tooltipHovered = true;
            })
            .on('mouseleave', '.md-f-tooltip', scheduleTooltipHide);
        }, 300);
      })();
      this.registerBridge();
    }
    registerBridge() {
      if (File.isMac) {
        var receiver = this;
        bridge.registerHandler('docMenu.getLocalRootUrl', function (unusedParameter1, reply) {
          reply(receiver.getLocalRootUrl() || '');
        });
        bridge.registerHandler('docMenu.removeProperty', function (propertyName, reply) {
          receiver.removeProperty(propertyName);
          if (reply) {
            reply();
          }
        });
      }
    }
    getAttrByElem(element) {
      if (element.hasClass('md-def-name')) {
        return 'ref';
      } else {
        if (element.hasClass('md-def-content')) {
          if (element.hasClass('md-def-url')) {
            return 'href';
          } else {
            return 'text';
          }
        } else {
          if (element.hasClass('md-def-title')) {
            return 'title';
          } else {
            return void 0;
          }
        }
      }
    }
    addEmptyDef(ref, type) {
      Object.defineProperty(insertMissingReference, 'name', { value: 'i', configurable: true });

      var currentEditor = this.editor;
      function insertMissingReference(anchorElement) {
        var documentNode = currentEditor.findNodeByElem(anchorElement),
          insertCommand = currentEditor.undo.UndoManager.makeEmptyCommand();
        documentNode.addAfter(new DocumentNode({ type: type, ref: ref, url: '', text: '' }));
        currentEditor.undo.UndoManager.addUndoForInsert(insertCommand, documentNode.get('after'));
        anchorElement.after(documentNode.get('after').toHTML());
        currentEditor.selection.jumpIntoElemBegin(anchorElement.next().find('.md-def-content'));
        insertCommand.redo.push(currentEditor.selection.buildUndo());
        currentEditor.undo.register(insertCommand);
        currentEditor.refocus();
      }
      currentEditor.undo.endSnap(true);
      var lastDefinition = jquery(currentEditor.sessionStr)
        .find(type == DocumentNode.TYPE.def_link ? '.md-def-link' : '.md-def-footnote')
        .last();
      if (!lastDefinition.length || lastDefinition.nextAll(':not(.footnotes)').length) {
        insertMissingReference(jquery(currentEditor.sessionStr).children().last());
      } else {
        insertMissingReference(lastDefinition);
      }
    }
    jumpToFootnote(definitionElement, referenceIndex) {
      this.editor.undo.endSnap(true);
      var text = definitionElement.find('.md-def-name').text() || '',
        referenceElement = jquery(
          ".md-footnote[data-ref='" + utilities.escape(text.trim()).toLowerCase() + "']",
        )[referenceIndex];
      if (referenceElement) {
        var selection = this.editor.selection;
        selection.jumpIntoElemEnd(definitionElement);
        var navigationCommand = undoManager.makeEmptyCommand(selection.buildUndo());
        selection.jumpInto(jquery(referenceElement), 0);
        selection.scrollAdjust(void 0, 100);
        navigationCommand.redo.push(selection.buildUndo());
        navigationCommand.cursorOnly = true;
        this.editor.undo.register(navigationCommand);
        this.editor.refocus();
      }
    }
    jumpToFootnoteDef(referenceElement) {
      var currentEditor = this.editor;
      currentEditor.undo.endSnap(true);
      if (referenceElement.length) {
        var referenceText = referenceElement.find('.md-text').text() || '',
          definitionNode = currentEditor.nodeMap.foot_list.getNodeByRef(referenceText, true);
        if (definitionNode) {
          currentEditor.selection.jumpIntoElemEnd(referenceElement);
          var navigationCommand = undoManager.makeEmptyCommand(currentEditor.selection.buildUndo());
          currentEditor.selection.jumpIntoElemEnd(currentEditor.findElemById(definitionNode.cid));
          currentEditor.selection.scrollAdjust(void 0, 100);
          navigationCommand.redo.push(currentEditor.selection.buildUndo());
          navigationCommand.cursorOnly = true;
          currentEditor.undo.register(navigationCommand);
          currentEditor.refocus();
        } else {
          this.showTooltipForSup(referenceElement);
        }
      }
    }
    refreshFootnoteReverseLink(element) {
      if (!File.inBusyMode) {
        try {
          if (element && !element.querySelector('.md-footnote, .md-def-footnote')) {
            return;
          }
          for (
            var currentEditor = this.editor,
              elements = document.querySelectorAll('#write .md-footnote'),
              referenceCounts = {},
              itemIndex = 0;
            itemIndex < elements.length;
            itemIndex++
          ) {
            var trimmedText = (elements[itemIndex].getAttribute('data-ref') || '').trim();
            referenceCounts[trimmedText] = (referenceCounts[trimmedText] || 0) + 1;
          }
          currentEditor.nodeMap.foot_list.forEach((documentNode) => {
            var referenceCount =
                referenceCounts[
                  utilities.escape((documentNode.get('ref') || '').trim()).toLowerCase()
                ] || 0,
              nodeElement = currentEditor.findElemById(documentNode.cid);
            if (nodeElement.length && nodeElement.hasClass('md-def-footnote')) {
              for (
                var currentElements = nodeElement.find('.md-reverse-footnote-area'),
                  text = currentElements.html() || '',
                  currentText = '',
                  backLinkTitle = jquery.localize.getString('back to document', 'Front'),
                  referenceIndex = 0;
                referenceIndex < referenceCount;
                referenceIndex++
              ) {
                currentText +=
                  " <a class='reversefootnote' title='" +
                  backLinkTitle +
                  "' data-index='" +
                  referenceIndex +
                  "'>↩</a>";
              }
              if (currentText && !currentElements.length) {
                nodeElement
                  .find('.md-def-content')
                  .after(
                    "<span class='md-reverse-footnote-area' contenteditable='false'>" +
                      currentText +
                      '</span>',
                  );
              } else {
                if (currentElements.length && !currentText) {
                  currentElements.remove();
                } else {
                  if (text.replace(/[\s'"]/g, '') != currentText.replace(/[\s'"]/g, '')) {
                    currentElements.html(currentText);
                  }
                }
              }
            }
          });
        } catch (error) {
          console.sendError(error);
        }
      }
    }
    showTooltipForSup(referenceElement) {
      var tooltipHtml,
        tooltipElement,
        currentEditor = this.editor;
      if (referenceElement.length) {
        var referenceText = referenceElement.find('.md-text').text();
        tooltipHtml = currentEditor.nodeMap.foot_list.getFootHTMLByRef(referenceText, true);
        jquery('.md-tooltip-remove').remove();
        if (tooltipHtml) {
          tooltipElement = jquery(jquery.parseHTML(tooltipHtml)[0]);
          jquery('body').append(tooltipElement);
        } else {
          if (!File.isLocked) {
            tooltipHtml =
              "<div class='code-tooltip md-tooltip-remove md-hover-tip md-f-tooltip' contenteditable='false'><div class='md-arrow' /><div class='code-tooltip-content'><span class='fa text-warning fa-exclamation-triangle' title='warning' aria-hidden='true' /> " +
              jquery.localize
                .getString(
                  'Need to define the reference footnote <b>{0}</b> with syntax <a>[^{1}]: www.example.com</a>',
                )
                .format(referenceText, referenceText)
                .trim() +
              ' </div></div>';
            tooltipElement = jquery(jquery.parseHTML(tooltipHtml)[0]);
            jquery('body').append(tooltipElement);
            tooltipElement
              .find('.code-tooltip-content a')
              .unbind('click')
              .click(function () {
                currentEditor.docMenu.addEmptyDef(referenceText, documentModel.TYPE.def_footnote);
              });
          }
        }
        this.editor.EditHelper.fixPopoverPosition(referenceElement, tooltipElement);
      }
    }
    getLocalRootUrl(documentOnly) {
      if (File.isTextBundle()) {
        if (File.bundle.filePath) {
          return fileIntegration.getCurrentFilePath();
        } else {
          return recovery.assetsParentForUntitled();
        }
      }
      if (File.isTextPack()) {
        return File.bundle.unzipFolder || '';
      }
      var rootUrl = null,
        documentNode = this.getMetaNode();
      if (documentNode) {
        rootUrl = (/^\s*marklyra-root-url\s*:\s*(.*)$/im.exec(documentNode.get('text')) || [])[1];
      }
      if (!(rootUrl || documentOnly || !this.editor.localSettingBridge)) {
        rootUrl = this.editor.localSettingBridge.getSetting('marklyra-root-url') || null;
      }
      if (rootUrl) {
        var documentPath = fileIntegration.getCurrentFilePath();
        if (!utilities.isAbsolutePath(rootUrl) && documentPath) {
          return utilities.getAbsolutePath(documentPath, rootUrl);
        } else {
          return rootUrl;
        }
      }
      return null;
    }
    buildMetaMap() {
      Object.defineProperty(parseMetadataValue, 'name', { value: 'o', configurable: true });
      Object.defineProperty(readIndentedMetadataLines, 'name', { value: 'a', configurable: true });

      var documentNode = this.getMetaNode(),
        propertyPattern = /^\s*([^\s\[\{:]+)\s*:\s*(.*)$/,
        quotedPropertyPattern = /^\s*(\"([^"]+)\"|\'([^']+)\')\s*:\s*(.*)/,
        commentPattern = /^\s*#/,
        metadata = {};
      function parseMetadataValue(text) {
        var match;
        if ((match = text.match(/^\s*\[(.*)\]\s*$/))) {
          return match[1].split(/\s*,\s*/).map(parseMetadataValue);
        }
        if ((match = text.match(/^\s*\{(.*)\}\s*$/))) {
          var inlineObject = {};
          match[1].split(/\s*,\s*/).forEach((inputText) => {
            var parts = inputText.split(/\s*:\s*/);
            if (2 == parts.length) {
              inlineObject[parts[0]] = parts[1];
            }
          });
          if (Object.keys(inlineObject).length) {
            return inlineObject;
          }
        }
        if (/^"/.exec(text)) {
          return text
            .replace(/^"/, '')
            .replace(/"$/, '')
            .replace(/\n\n/g, '\n')
            .replace(/\\\n/g, '')
            .replace(/\n/g, ' ')
            .replace(/\\n/g, '\n');
        } else {
          if (/^'/.exec(text)) {
            return text
              .replace(/^'/, '')
              .replace(/'$/, '')
              .replace(/\n\n/g, '\n')
              .replace(/''/g, "'")
              .replace(/\n/g, ' ');
          } else {
            return text.trim();
          }
        }
      }
      function readIndentedMetadataLines(sourceLines, itemIndex, searchValue) {
        for (var items = []; itemIndex < sourceLines.length; ) {
          let text = sourceLines[itemIndex];
          if (0 != text.indexOf(searchValue) && text.trim().length) {
            break;
          }
          items.push(text.substr(searchValue.length));
          itemIndex++;
        }
        return [items, itemIndex];
      }
      if (documentNode) {
        if (
          'string' ==
          typeof (metadata = Object.defineProperty(
            function parseMetadataSection(sourceLines) {
              for (
                var propertyName, match, itemIndex = 0, sectionValues = {}, openQuote = false;
                itemIndex < sourceLines.length;
                itemIndex++
              ) {
                var text = sourceLines[itemIndex];
                if (text.match(commentPattern)) {
                } else {
                  if (!openQuote && (match = /^\s+/.exec(text))) {
                    var indentPrefix = match[0],
                      blockScalarMarker = '';
                    if ((match = /^\s*([\|\>])\s*$/.exec(sectionValues[propertyName] || ''))) {
                      blockScalarMarker = match[1];
                    }
                    if (
                      (indentedBlock = readIndentedMetadataLines(
                        sourceLines,
                        itemIndex,
                        indentPrefix,
                      ))[1] -
                        1 >
                      itemIndex
                    ) {
                      itemIndex = indentedBlock[1] - 1;
                    }
                    sectionValues[(propertyName = propertyName || '')] =
                      '|' == blockScalarMarker
                        ? indentedBlock[0].join('\n')
                        : '>' == blockScalarMarker
                          ? indentedBlock[0]
                              .map((inputText) =>
                                inputText.trim() ? inputText.trim() + ' ' : '\n',
                              )
                              .join('')
                              .trim()
                          : parseMetadataSection(indentedBlock[0]);
                  } else {
                    if ((match = /^[-+]\s/.exec(text))) {
                      var indentedBlock;
                      openQuote = false;
                      if (
                        (indentedBlock = readIndentedMetadataLines(
                          sourceLines,
                          itemIndex + 1,
                          (indentPrefix = match[0].replace(/^[-+]/, ' ')),
                        ))[1] -
                          1 >
                        itemIndex
                      ) {
                        itemIndex = indentedBlock[1] - 1;
                      }
                      sectionValues[(propertyName = propertyName || '')] =
                        sectionValues[propertyName] || [];
                      if (sectionValues[propertyName].push) {
                        sectionValues[propertyName].push(
                          parseMetadataSection(
                            [text.substr(indentPrefix.length)].concat(indentedBlock[0]),
                          ),
                        );
                      }
                    } else {
                      if ((match = quotedPropertyPattern.exec(text))) {
                        openQuote = false;
                        propertyName = match[2] || match[3] || '';
                        sectionValues[propertyName] = match[4].trim();
                        if (
                          (match = /^["']/.exec(sectionValues[propertyName])) &&
                          sectionValues[propertyName][sectionValues[propertyName].length - 1] !=
                            match[0]
                        ) {
                          openQuote = match[0];
                        }
                      } else {
                        if ((match = propertyPattern.exec(text))) {
                          openQuote = false;
                          propertyName = match[1];
                          sectionValues[propertyName] = match[2].trim();
                          if (
                            (match = /^["']/.exec(sectionValues[propertyName])) &&
                            sectionValues[propertyName][sectionValues[propertyName].length - 1] !=
                              match[0]
                          ) {
                            openQuote = match[0];
                          }
                        } else {
                          propertyName = propertyName || '';
                          text = text.trim();
                          if (sectionValues[propertyName]) {
                            sectionValues[propertyName] += '\n' + text;
                          } else {
                            sectionValues[propertyName] = text;
                          }
                          if (text[text.length - 1] == openQuote) {
                            openQuote = false;
                          }
                        }
                      }
                    }
                  }
                }
              }
              if (1 == Object.keys(sectionValues).length && void 0 !== sectionValues['']) {
                return sectionValues[''];
              } else {
                Object.keys(sectionValues).map((item) => {
                  if ('string' == typeof sectionValues[item]) {
                    sectionValues[item] = parseMetadataValue(sectionValues[item]);
                  }
                });
                return sectionValues;
              }
            },
            'name',
            { value: 'e', configurable: true },
          )((documentNode.get('text') || '').split(/\r|\n|\r\n/g)))
        ) {
          return {};
        }
        if (metadata instanceof Array) {
          return {};
        }
        delete metadata[''];
      }
      return metadata;
    }
    getMetaNode() {
      var firstNode = this.editor.nodeMap.getFirst();
      if (DocumentNode.isType(firstNode, NodeType.meta_block)) {
        return firstNode;
      } else {
        return null;
      }
    }
    getValueInMeta(propertyName, documentNode) {
      if ((documentNode = documentNode || this.getMetaNode())) {
        var text = (new RegExp('^s*' + propertyName + 's*:s*(.*)$', 'mi').exec(
          documentNode.get('text'),
        ) || [])[1];
        if (text) {
          return text.trim();
        } else {
          return text;
        }
      }
      return null;
    }
    writeProperty(propertyName, propertyValue) {
      this.editor.undo.endSnap(true);
      var documentNode = this.editor.docMenu.getMetaNode(),
        selectionSnapshot = this.editor.selection.buildUndo() || {},
        propertyCommand = undoManager.makeEmptyCommand(selectionSnapshot),
        propertyLine = propertyName + ': ' + propertyValue,
        selectionInMetadata =
          documentNode &&
          selectionSnapshot &&
          (selectionSnapshot.id || selectionSnapshot.startId) == documentNode.id,
        updatedSelection = jquery.extend({}, selectionSnapshot),
        start = 0;
      if (documentNode) {
        propertyCommand.undo.push(undoManager.buildReplaceUndo(documentNode));
        var text = documentNode.get('text'),
          propertyMatch = matchMetadataProperty(propertyName, text);
        if (propertyMatch) {
          if (updatedSelection.start > propertyMatch.index + propertyMatch[0].length) {
            start = propertyLine.length - propertyMatch[0].length;
          } else {
            if (updatedSelection.start > propertyMatch.index) {
              start = updatedSelection.start - propertyMatch.index + propertyLine.length;
            }
          }
          updatedSelection.end = updatedSelection.start = updatedSelection.start - start;
          var regex = new RegExp('^s*' + propertyName + 's*:s*(.*)$', 'mi');
          documentNode.set('text', text.replace(regex, propertyLine));
        } else {
          documentNode.set('text', text ? text.replace(/\n?$/, '\n' + propertyLine) : propertyLine);
        }
        propertyCommand.redo.push(undoManager.buildReplaceUndo(documentNode));
        this.editor.findElemById(documentNode.cid).replaceWith(documentNode.toHTML());
        if (selectionInMetadata) {
          this.editor.undo.exeCommand(updatedSelection);
        }
      } else {
        var insertedMetadata = this.editor.stylize.insertMetaBlock(true, propertyLine);
        if (!insertedMetadata) {
          return;
        }
        documentNode = insertedMetadata.node;
        undoManager.append(propertyCommand, insertedMetadata.command);
        this.editor.findElemById(documentNode.get('after').cid).before(documentNode.toHTML());
      }
      propertyCommand.redo.push(updatedSelection);
      this.editor.undo.register(propertyCommand);
    }
    removeProperty(propertyName, deferRegistration) {
      this.editor.undo.endSnap(true);
      var documentNode = this.editor.docMenu.getMetaNode(),
        selectionSnapshot = this.editor.selection.buildUndo(),
        propertyCommand = undoManager.makeEmptyCommand(selectionSnapshot),
        selectionInMetadata =
          !!selectionSnapshot &&
          (selectionSnapshot.id || selectionSnapshot.startId) == (documentNode || {}).id,
        regex = new RegExp('^s*' + propertyName + 's*:s*(.*)$', 'mi'),
        updatedSelection = jquery.extend({}, selectionSnapshot || void 0),
        start = 0;
      if (documentNode) {
        propertyCommand.undo.push(undoManager.buildReplaceUndo(documentNode));
        if (selectionInMetadata) {
          var propertyMatch = matchMetadataProperty(propertyName, documentNode.get('text'));
          if (propertyMatch) {
            if (updatedSelection.start > propertyMatch.index + propertyMatch[0].length) {
              start = propertyMatch[0].length;
            } else {
              if (updatedSelection.start > propertyMatch.index) {
                start = updatedSelection.start - propertyMatch.index;
              }
            }
            updatedSelection.end = updatedSelection.start = updatedSelection.start - start;
          }
        }
        documentNode.set('text', documentNode.get('text').replace(regex, ''));
        propertyCommand.redo.push(undoManager.buildReplaceUndo(documentNode));
        this.editor.findElemById(documentNode.cid).replaceWith(documentNode.toHTML());
        propertyCommand.redo.push(updatedSelection);
        if (selectionInMetadata) {
          this.editor.undo.exeCommand(updatedSelection);
        }
        if (!deferRegistration) {
          this.editor.undo.register(propertyCommand);
        }
      }
      return propertyCommand;
    }
  }
  Object.defineProperty(OutlineController, 'name', { value: 'y', configurable: true });
  function matchMetadataProperty(propertyName, metadataText) {
    return new RegExp('^s*' + propertyName + 's*:s*(.*)$', 'mig').exec(metadataText);
  }
  OutlineController.getTocInlineLexer = getOutlineInlineLexer;
  moduleRecord.exports = OutlineController;
}
