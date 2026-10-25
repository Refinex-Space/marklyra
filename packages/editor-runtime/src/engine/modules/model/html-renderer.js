// model/html-renderer.
// SystemJS module 14. Dependencies: 13, 11, 15, 16, 17, 18, 19.
$__System.registerDynamic(
  '14',
  ['13', '11', '15', '16', '17', '18', '19'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    this || self;
    var documentModel = requireModule('13'),
      DocumentNode = documentModel.Node,
      NodeType = (documentModel.NodeMap, documentModel.TYPE),
      utilities = (documentModel.NodeCollectionUtils, requireModule('11')),
      htmlBlocks = (requireModule('15'), requireModule('16'), requireModule('17')),
      codeFences = requireModule('18'),
      markdownParser = requireModule('19'),
      html = document.querySelector('#md-rawblock-tooltip-templ').innerHTML;
    DocumentNode.prototype.toHTML = function (contentOverride, searchValue, renderContext) {
      var documentMap;
      renderContext = renderContext || {};
      var headingTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
      function p(documentNode) {
        var text,
          children = documentNode.get('children');
        return void 0 !== contentOverride && null !== contentOverride
          ? contentOverride
          : children && children.length > 0
            ? documentModel.NodeCollectionUtils.toHTML(children, renderContext)
            : ((text = documentNode.safeGetStrAttr('text')),
              DocumentNode.isType(documentNode, NodeType.paragraph) &&
                /^\u200b( {4}|\t)/g.exec(text) &&
                ((text = text.replace(/^\u200b( {4}|\t)/g, '$1')), documentNode.set('text', text)),
              (documentNode.cursorDiff = []),
              DocumentNode.isType(documentNode, NodeType.paragraph) &&
              renderContext.focus === documentNode.id
                ? markdownParser.brushContent(
                    documentNode.safeGetStrAttr('text'),
                    new markdownParser.InlineLexer(),
                    !1,
                    documentNode,
                    documentNode.cursorDiff,
                    [],
                  )
                : markdownParser.parseInline(
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
                  ));
      }
      function f(inputDocumentNode) {
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
              )
                return !1;
              if (
                DocumentNode.isType(documentNode, NodeType.list_item) &&
                documentNode.get('style') == DocumentNode.ListType.task
              )
                return !1;
              if (documentNode.canContainBlock() || documentNode.isDeleted()) return;
              return File.inBusyMode
                ? 0 == documentNode.get('children').length || void 0
                : 0 == documentNode.get('children').length ||
                    DocumentNode.isType(documentNode.get('parent'), NodeType.list_item) ||
                    void 0;
            } catch (error) {}
          })(inputDocumentNode),
          editableAttribute = editable
            ? " contenteditable='true' "
            : !1 === editable
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
        return (
          (inputDocumentNode.get('text') || '').length > 1e4 &&
            (nodeAttributes += " spellcheck='false' "),
          nodeAttributes
        );
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
          return (
            currentText.match(/^\n/g) && (currentText = currentText.replace(/^\n/g, '\n\n')),
            '<pre ' +
              f(this) +
              " class='md-meta-block md-end-block' >" +
              utilities.escape(currentText, !1, !0) +
              '\n</pre>'
          );
        case NodeType.paragraph:
          return '<p ' + f(this) + " class='md-end-block md-p'>" + p(this) + '</p>';
        case NodeType.raw_edit:
          return (
            "<p class='rawedit' contenteditable ='true' spellcheck='false' " +
            f(this) +
            '>' +
            this.safeGetStrAttr('text', !0) +
            '</p>'
          );
        case NodeType.heading:
          return (
            '<h' +
            this.get('depth') +
            f(this) +
            "class='md-end-block md-heading' >" +
            p(this) +
            '</h' +
            this.get('depth') +
            '>'
          );
        case NodeType.blockquote:
          return DocumentNode.isType(
            this.get('alert'),
            'note',
            'warning',
            'important',
            'tip',
            'caution',
          )
            ? `<div class="md-alert md-alert-${this.get('alert')}" ` +
                f(this) +
                '>' +
                p(this) +
                '</div>'
            : '<blockquote ' + f(this) + ' >' + p(this) + '</blockquote>';
        case NodeType.list:
          var style = this.get('style'),
            listMarkerAttribute = ((
              this.get('pattern') ||
              DocumentNode.UL_DEFAULT_START[File.option.ulStyle] ||
              '-'
            ).match(/[*+-]/) || [])[0];
          if (
            ((listMarkerAttribute = " data-mark='" + listMarkerAttribute + "' "),
            style == DocumentNode.ListType.ol)
          ) {
            var listStartAttribute = '' === this.get('start') ? void 0 : this.get('start') - 0;
            return (
              "<ol class='ol-list' " +
              (listStartAttribute =
                Number.isNaN(listStartAttribute) || 1 == listStartAttribute
                  ? ''
                  : "start='" + this.get('start') + "' ") +
              f(this) +
              ' >' +
              p(this) +
              '</ol>'
            );
          }
          return "<ul class='ul-list' " + f(this) + listMarkerAttribute + ' >' + p(this) + '</ul>';
        case NodeType.list_item:
          return this.get('parent') && this.get('style') === DocumentNode.ListType.task
            ? "<li class='md-list-item task-list-item  md-task-list-item task-list-" +
                (this.get('checked') ? 'done' : 'not-done') +
                " ' " +
                f(this) +
                "><input type='checkbox' " +
                (this.get('checked') ? 'checked' : '') +
                '></input>' +
                p(this) +
                '</li>'
            : "<li class='md-list-item' " + f(this) + ' >' + p(this) + '</li>';
        case NodeType.fences:
          return codeFences.renderFences(this);
        case NodeType.hr:
          return (
            "<div tabindex='-1' contenteditable='false' " +
            f(this) +
            " class='md-hr md-end-block' ><hr /></div>"
          );
        case NodeType.def_footnote:
          return (
            "<div class='footnotes md-def-footnote md-end-block' contenteditable='false'" +
            f(this) +
            "><span class='md-def-name' contenteditable='true'>" +
            utilities.escape(this.get('ref') ? this.get('ref') : '​') +
            "</span><span class='md-def-split md-def-f' contenteditable='false' >&nbsp;</span><span class='md-def-content' contenteditable='true'>" +
            p(this) +
            '</span></div>'
          );
        case NodeType.def_link:
          return (
            "<div class='footnotes md-def-link md-end-block' contenteditable='false'" +
            f(this) +
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
                f(this) +
                "><table class='md-table'>",
              currentDocumentNode = this.getFirstChild();
            currentDocumentNode;
          )
            currentDocumentNode.get('before')
              ? (tableHtml += currentDocumentNode.toHTML())
              : (tableHtml += '<thead>' + currentDocumentNode.toHTML() + '</thead><tbody>'),
              (currentDocumentNode = currentDocumentNode.get('after')) || (tableHtml += '</tbody>');
          return (tableHtml += '</table></figure>');
        case NodeType.table_row:
          (tableHtml = "<tr class='md-end-block' " + f(this) + '>'),
            (currentDocumentNode = this.getFirstChild());
          var alignmentAttribute,
            columnAlignments = this.get('parent').get('align') || [],
            itemIndex = 0,
            cellTag = this.get('before') ? 'td' : 'th';
          for (
            this.get('parent').get('align') || this.get('parent').set('align', []);
            currentDocumentNode;
          )
            (tableHtml +=
              '<' +
              cellTag +
              (alignmentAttribute = (alignmentAttribute = columnAlignments[itemIndex])
                ? " style='text-align:" + alignmentAttribute + ";' "
                : '') +
              '>' +
              currentDocumentNode.toHTML() +
              '</' +
              cellTag +
              '>'),
              (currentDocumentNode = currentDocumentNode.get('after')),
              itemIndex++;
          return (tableHtml += '</tr>');
        case NodeType.table_cell:
          return (
            "<span contenteditable='true' class='td-span' " + f(this) + '>' + p(this) + '</span>'
          );
        case NodeType.math_block:
          var mathContentHtml,
            mathAttributes = '';
          let mathRenderer = File.editor && File.editor.mathBlock;
          if (mathRenderer && mathRenderer.cache[this.get('text')]) {
            let element = mathRenderer.cache[this.get('text')];
            (mathRenderer.cache[this.get('text')] = void 0),
              (mathContentHtml = `<div class='md-rawblock-container md-math-container math-jax-postprocess' tabindex='-1'>${element.inner}</div>`),
              (mathAttributes = element.attr);
          } else if (
            renderContext.mathCount < 8 &&
            mathRenderer &&
            !File.option.autoNumberingForMath &&
            mathRenderer.isMathJaxReady()
          ) {
            renderContext.mathCount++;
            var renderedMath = mathRenderer.renderTex(this.get('text'), {}, !0);
            (mathContentHtml = `<div class='md-rawblock-container md-math-container math-jax-postprocess' tabindex='-1'>${renderedMath.dom.outerHTML}</div>`),
              (mathAttributes = `data-math-tag-before="${renderedMath.mathTagBefore}" data-math-tag-after="${renderedMath.mathTagAfter}" data-math-labels="${utilities.escape(renderedMath.mathLabels)}"`);
          } else
            mathContentHtml =
              "<div class='md-rawblock-container md-math-container math-jax-preprocess' tabindex='-1'>$$<br/>" +
              utilities.escape(this.get('text')) +
              '<br/>$$</div>';
          return (
            "<div contenteditable='false' spellcheck='false' class='mathjax-block md-end-block md-math-block md-rawblock' id='mathjax-" +
            this.cid +
            "' " +
            f(this) +
            ` ${mathAttributes}>` +
            html.replace('{type}', $.localize.getString('Math', 'Menu')) +
            mathContentHtml +
            '</div>'
          );
        case NodeType.toc:
          return (
            (documentMap = this.get('in')),
            "<div contenteditable='false' spellcheck='false' tabindex='-1' class='md-toc md-end-block' " +
              f(this) +
              "><div class='md-tooltip-hide md-toc-tooltip'><span>" +
              $.localize.getString('Table of Contents') +
              "</span> <button type='button' class='btn md-delete-toc'><span class='marklyra-icon marklyra-delete'></span></button></div><p class='md-toc-content' role='list'>" +
              (documentMap.toc ? documentMap.toc.getTocInnerHTML() : '') +
              '</p></div>'
          );
        case NodeType.html_block:
          return htmlBlocks.HIDDEN_TYPE.indexOf(this.get('displayStyle') || this.get('style')) >
            -1 && !htmlBlocks.checkIsWhiteList(this)
            ? "<div contenteditable='false' spellcheck='false' class='md-htmlblock md-rawblock md-end-block' " +
                f(this) +
                '>' +
                html.replace('{type}', 'HTML') +
                "<div class='md-htmlblock-panel md-rawblock-control' style='display:none;' contenteditable='false'></div><div class='md-htmlblock-container md-rawblock-container md-raw-html-src' contenteditable='false'><div class='md-raw-html-src-content'>" +
                utilities.escape(this.get('text')) +
                '</div></div></div>'
            : "<div contenteditable='false' spellcheck='false' class='md-htmlblock md-rawblock md-end-block' " +
                f(this) +
                "><span style='position:absolute;'>​</span>" +
                html.replace('{type}', 'HTML') +
                "<div class='md-htmlblock-panel md-rawblock-control' style='display:none;' contenteditable='false;'></div><div class='md-htmlblock-container md-rawblock-container' tabindex='-1' contenteditable='false'>" +
                htmlBlocks.buildHTML(this) +
                "</div><span style='position:absolute;'>​</span></div>";
        default:
          return '<p ' + f(this) + '>unknow type: ' + this.get('type') + '</p>';
      }
    };
  },
);
