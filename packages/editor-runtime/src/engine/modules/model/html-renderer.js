// model/html-renderer.
export default function initializeModelHtmlRenderer(requireModule, moduleExports, moduleRecord) {
  if (!this) {
    self;
  }
  var documentModel = requireModule('model/document-model'),
    DocumentNode = documentModel.Node,
    NodeType = (documentModel.NodeMap, documentModel.TYPE),
    utilities = (documentModel.NodeCollectionUtils, requireModule('shared/utilities')),
    htmlBlocks =
      (requireModule('render/diagrams'),
      requireModule('libraries/dom-purify-export'),
      requireModule('render/html-blocks')),
    codeFences = requireModule('render/code-fences'),
    markdownParser = requireModule('model/markdown-parser'),
    html = document.querySelector('#md-rawblock-tooltip-templ').innerHTML;
  DocumentNode.prototype.toHTML = function (contentOverride, searchValue, renderContext) {
    var documentMap;
    renderContext = renderContext || {};
    var headingTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
    function renderNodeContent(documentNode) {
      var text,
        children = documentNode.get('children');
      if (void 0 !== contentOverride && null !== contentOverride) {
        return contentOverride;
      } else {
        if (children && children.length > 0) {
          return documentModel.NodeCollectionUtils.toHTML(children, renderContext);
        } else {
          text = documentNode.safeGetStrAttr('text');
          if (
            DocumentNode.isType(documentNode, NodeType.paragraph) &&
            /^\u200b( {4}|\t)/g.exec(text)
          ) {
            text = text.replace(/^\u200b( {4}|\t)/g, '$1');
            documentNode.set('text', text);
          }
          documentNode.cursorDiff = [];
          if (
            DocumentNode.isType(documentNode, NodeType.paragraph) &&
            renderContext.focus === documentNode.id
          ) {
            return markdownParser.brushContent(
              documentNode.safeGetStrAttr('text'),
              new markdownParser.InlineLexer(),
              false,
              documentNode,
              documentNode.cursorDiff,
              [],
            );
          } else {
            return markdownParser.parseInline(
              documentNode.safeGetStrAttr('text'),
              {
                attr: !DocumentNode.isType(documentNode, NodeType.heading),
                alert:
                  DocumentNode.isType(documentNode, NodeType.paragraph) &&
                  DocumentNode.isType(documentNode.get('parent'), NodeType.blockquote) &&
                  documentNode.get('parent').get('alert') &&
                  !documentNode.get('before'),
              },
              documentNode.cursorDiff,
            );
          }
        }
      }
    }
    function buildNodeAttributes(inputDocumentNode) {
      var editable = (function (documentNode) {
          try {
            if (
              DocumentNode.isType(
                documentNode,
                NodeType.fences,
                NodeType.hr,
                NodeType.def_link,
                NodeType.def_footnote,
                NodeType.table,
                NodeType.math_block,
              )
            ) {
              return false;
            }
            if (
              DocumentNode.isType(documentNode, NodeType.list_item) &&
              documentNode.get('style') == DocumentNode.ListType.task
            ) {
              return false;
            }
            if (documentNode.canContainBlock() || documentNode.isDeleted()) {
              return;
            }
            if (File.inBusyMode) {
              return 0 == documentNode.get('children').length || void 0;
            } else {
              return (
                0 == documentNode.get('children').length ||
                DocumentNode.isType(documentNode.get('parent'), NodeType.list_item) ||
                void 0
              );
            }
          } catch (error) {}
        })(inputDocumentNode),
        editableAttribute = editable
          ? " contenteditable='true' "
          : false === editable
            ? " contenteditable='false' "
            : '',
        markdownTagAttribute = searchValue ? "mdlike='" + searchValue + "' " : ' ',
        nodeAttributes =
          " cid = '" +
          inputDocumentNode.id +
          "' mdtype = '" +
          inputDocumentNode.get('type') +
          "' " +
          editableAttribute +
          markdownTagAttribute;
      if ((inputDocumentNode.get('text') || '').length > 1e4) {
        nodeAttributes += " spellcheck='false' ";
      }
      return nodeAttributes;
    }
    switch (
      (File.option.expandSimpleBlock &&
        DocumentNode.isType(this, NodeType.paragraph) &&
        (headingTags.indexOf(searchValue) > -1
          ? this.set('depth', headingTags.indexOf(searchValue) + 1)
          : this.unset('depth')),
      this.get('type'))
    ) {
      case NodeType.meta_block:
        var currentText = this.get('text') || '';
        if (currentText.match(/^\n/g)) {
          currentText = currentText.replace(/^\n/g, '\n\n');
        }
        return (
          '<pre ' +
          buildNodeAttributes(this) +
          " class='md-meta-block md-end-block' >" +
          utilities.escape(currentText, false, true) +
          '\n</pre>'
        );
      case NodeType.paragraph:
        return (
          '<p ' +
          buildNodeAttributes(this) +
          " class='md-end-block md-p'>" +
          renderNodeContent(this) +
          '</p>'
        );
      case NodeType.raw_edit:
        return (
          "<p class='rawedit' contenteditable ='true' spellcheck='false' " +
          buildNodeAttributes(this) +
          '>' +
          this.safeGetStrAttr('text', true) +
          '</p>'
        );
      case NodeType.heading:
        return (
          '<h' +
          this.get('depth') +
          buildNodeAttributes(this) +
          "class='md-end-block md-heading' >" +
          renderNodeContent(this) +
          '</h' +
          this.get('depth') +
          '>'
        );
      case NodeType.blockquote:
        if (
          DocumentNode.isType(this.get('alert'), 'note', 'warning', 'important', 'tip', 'caution')
        ) {
          return (
            `<div class="md-alert md-alert-${this.get('alert')}" ` +
            buildNodeAttributes(this) +
            '>' +
            renderNodeContent(this) +
            '</div>'
          );
        } else {
          return (
            '<blockquote ' +
            buildNodeAttributes(this) +
            ' >' +
            renderNodeContent(this) +
            '</blockquote>'
          );
        }
      case NodeType.list:
        var style = this.get('style'),
          listMarkerAttribute = ((
            this.get('pattern') ||
            DocumentNode.UL_DEFAULT_START[File.option.ulStyle] ||
            '-'
          ).match(/[*+-]/) || [])[0];
        listMarkerAttribute = " data-mark='" + listMarkerAttribute + "' ";
        if (style == DocumentNode.ListType.ol) {
          var listStartAttribute = '' === this.get('start') ? void 0 : this.get('start') - 0;
          return (
            "<ol class='ol-list' " +
            (listStartAttribute =
              Number.isNaN(listStartAttribute) || 1 == listStartAttribute
                ? ''
                : "start='" + this.get('start') + "' ") +
            buildNodeAttributes(this) +
            ' >' +
            renderNodeContent(this) +
            '</ol>'
          );
        }
        return (
          "<ul class='ul-list' " +
          buildNodeAttributes(this) +
          listMarkerAttribute +
          ' >' +
          renderNodeContent(this) +
          '</ul>'
        );
      case NodeType.list_item:
        if (this.get('parent') && this.get('style') === DocumentNode.ListType.task) {
          return (
            "<li class='md-list-item task-list-item  md-task-list-item task-list-" +
            (this.get('checked') ? 'done' : 'not-done') +
            " ' " +
            buildNodeAttributes(this) +
            "><input type='checkbox' " +
            (this.get('checked') ? 'checked' : '') +
            '></input>' +
            renderNodeContent(this) +
            '</li>'
          );
        } else {
          return (
            "<li class='md-list-item' " +
            buildNodeAttributes(this) +
            ' >' +
            renderNodeContent(this) +
            '</li>'
          );
        }
      case NodeType.fences:
        return codeFences.renderFences(this);
      case NodeType.hr:
        return (
          "<div tabindex='-1' contenteditable='false' " +
          buildNodeAttributes(this) +
          " class='md-hr md-end-block' ><hr /></div>"
        );
      case NodeType.def_footnote:
        return (
          "<div class='footnotes md-def-footnote md-end-block' contenteditable='false'" +
          buildNodeAttributes(this) +
          "><span class='md-def-name' contenteditable='true'>" +
          utilities.escape(this.get('ref') ? this.get('ref') : '​') +
          "</span><span class='md-def-split md-def-f' contenteditable='false' >&nbsp;</span><span class='md-def-content' contenteditable='true'>" +
          renderNodeContent(this) +
          '</span></div>'
        );
      case NodeType.def_link:
        return (
          "<div class='footnotes md-def-link md-end-block' contenteditable='false'" +
          buildNodeAttributes(this) +
          "><span class='md-def-name' contenteditable='true'>" +
          utilities.escape(this.get('ref') ? this.get('ref') : '​') +
          "</span><span class='md-def-split md-def-f' contenteditable='false' >&nbsp;</span><span class='md-def-content md-def-url md-auto-disp' href='#' contenteditable='true'>" +
          utilities.escape(this.get('href')) +
          "</span><span class='md-def-split md-auto-hide' contenteditable='false'>&nbsp;</span><span class='md-def-title md-auto-disp md-auto-hide' contenteditable='true'>" +
          utilities.escape(this.get('title')) +
          '</span></div>'
        );
      case NodeType.table:
        for (
          var tableHtml =
              "<figure class='md-table-fig table-figure' contenteditable='false' " +
              buildNodeAttributes(this) +
              "><table class='md-table'>",
            currentDocumentNode = this.getFirstChild();
          currentDocumentNode;
        ) {
          if (currentDocumentNode.get('before')) {
            tableHtml += currentDocumentNode.toHTML();
          } else {
            tableHtml += '<thead>' + currentDocumentNode.toHTML() + '</thead><tbody>';
          }
          if (!(currentDocumentNode = currentDocumentNode.get('after'))) {
            tableHtml += '</tbody>';
          }
        }
        return (tableHtml += '</table></figure>');
      case NodeType.table_row:
        tableHtml = "<tr class='md-end-block' " + buildNodeAttributes(this) + '>';
        currentDocumentNode = this.getFirstChild();
        var alignmentAttribute,
          columnAlignments = this.get('parent').get('align') || [],
          itemIndex = 0,
          cellTag = this.get('before') ? 'td' : 'th';
        for (
          this.get('parent').get('align') || this.get('parent').set('align', []);
          currentDocumentNode;
        ) {
          tableHtml +=
            '<' +
            cellTag +
            (alignmentAttribute = (alignmentAttribute = columnAlignments[itemIndex])
              ? " style='text-align:" + alignmentAttribute + ";' "
              : '') +
            '>' +
            currentDocumentNode.toHTML() +
            '</' +
            cellTag +
            '>';
          currentDocumentNode = currentDocumentNode.get('after');
          itemIndex++;
        }
        return (tableHtml += '</tr>');
      case NodeType.table_cell:
        return (
          "<span contenteditable='true' class='td-span' " +
          buildNodeAttributes(this) +
          '>' +
          renderNodeContent(this) +
          '</span>'
        );
      case NodeType.math_block:
        var mathContentHtml,
          mathAttributes = '';
        let mathRenderer = File.editor && File.editor.mathBlock;
        if (mathRenderer && mathRenderer.cache[this.get('text')]) {
          let element = mathRenderer.cache[this.get('text')];
          mathRenderer.cache[this.get('text')] = void 0;
          mathContentHtml = `<div class='md-rawblock-container md-math-container math-jax-postprocess' tabindex='-1'>${element.inner}</div>`;
          mathAttributes = element.attr;
        } else {
          if (
            renderContext.mathCount < 8 &&
            mathRenderer &&
            !File.option.autoNumberingForMath &&
            mathRenderer.isMathJaxReady()
          ) {
            renderContext.mathCount++;
            var renderedMath = mathRenderer.renderTex(this.get('text'), {}, true);
            mathContentHtml = `<div class='md-rawblock-container md-math-container math-jax-postprocess' tabindex='-1'>${renderedMath.dom.outerHTML}</div>`;
            mathAttributes = `data-math-tag-before="${renderedMath.mathTagBefore}" data-math-tag-after="${renderedMath.mathTagAfter}" data-math-labels="${utilities.escape(renderedMath.mathLabels)}"`;
          } else {
            mathContentHtml =
              "<div class='md-rawblock-container md-math-container math-jax-preprocess' tabindex='-1'>$$<br/>" +
              utilities.escape(this.get('text')) +
              '<br/>$$</div>';
          }
        }
        return (
          "<div contenteditable='false' spellcheck='false' class='mathjax-block md-end-block md-math-block md-rawblock' id='mathjax-" +
          this.cid +
          "' " +
          buildNodeAttributes(this) +
          ` ${mathAttributes}>` +
          html.replace('{type}', $.localize.getString('Math', 'Menu')) +
          mathContentHtml +
          '</div>'
        );
      case NodeType.toc:
        documentMap = this.get('in');
        return (
          "<div contenteditable='false' spellcheck='false' tabindex='-1' class='md-toc md-end-block' " +
          buildNodeAttributes(this) +
          "><div class='md-tooltip-hide md-toc-tooltip'><span>" +
          $.localize.getString('Table of Contents') +
          "</span> <button type='button' class='btn md-delete-toc'><span class='marklyra-icon marklyra-delete'></span></button></div><p class='md-toc-content' role='list'>" +
          (documentMap.toc ? documentMap.toc.getTocInnerHTML() : '') +
          '</p></div>'
        );
      case NodeType.html_block:
        if (
          htmlBlocks.HIDDEN_TYPE.indexOf(this.get('displayStyle') || this.get('style')) > -1 &&
          !htmlBlocks.checkIsWhiteList(this)
        ) {
          return (
            "<div contenteditable='false' spellcheck='false' class='md-htmlblock md-rawblock md-end-block' " +
            buildNodeAttributes(this) +
            '>' +
            html.replace('{type}', 'HTML') +
            "<div class='md-htmlblock-panel md-rawblock-control' style='display:none;' contenteditable='false'></div><div class='md-htmlblock-container md-rawblock-container md-raw-html-src' contenteditable='false'><div class='md-raw-html-src-content'>" +
            utilities.escape(this.get('text')) +
            '</div></div></div>'
          );
        } else {
          return (
            "<div contenteditable='false' spellcheck='false' class='md-htmlblock md-rawblock md-end-block' " +
            buildNodeAttributes(this) +
            "><span style='position:absolute;'>​</span>" +
            html.replace('{type}', 'HTML') +
            "<div class='md-htmlblock-panel md-rawblock-control' style='display:none;' contenteditable='false;'></div><div class='md-htmlblock-container md-rawblock-container' tabindex='-1' contenteditable='false'>" +
            htmlBlocks.buildHTML(this) +
            "</div><span style='position:absolute;'>​</span></div>"
          );
        }
      default:
        return '<p ' + buildNodeAttributes(this) + '>unknow type: ' + this.get('type') + '</p>';
    }
  };
}
