// model/document-model.
export default function initializeModelDocumentModel(requireModule, moduleExports, moduleRecord) {
  'use strict';
  var hostGlobal = this || self,
    utilities = requireModule('shared/utilities'),
    blockTypes = {
      paragraph: 'paragraph',
      heading: 'heading',
      blockquote: 'blockquote',
      fences: 'fences',
      hr: 'hr',
      def_link: 'def_link',
      def_footnote: 'def_footnote',
      table: 'table',
      raw_edit: 'raw_edit',
      meta_block: 'meta_block',
      math_block: 'math_block',
      html_block: 'html_block',
      list: 'list',
      toc: 'toc',
      iframe: 'iframe',
    },
    containerTypes = {
      list_item: 'list_item',
      table_row: 'table_row',
      table_cell: 'table_cell',
      alert_title: 'alert_title',
    },
    NodeType = {};
  Object.assign(NodeType, blockTypes, containerTypes, {
    tab: 'tab',
    plain: 'plain',
    strong: 'strong',
    em: 'em',
    code: 'code',
    underline: 'underline',
    escape: 'escape',
    autolink: 'autolink',
    reflink: 'reflink',
    refimg: 'refimg',
    link: 'link',
    url: 'url',
    br: 'br',
    tag: 'tag',
    comment: 'comment',
    atag: 'atag',
    imgtag: 'imgtag',
    del: 'del',
    todo: 'todo',
    image: 'image',
    footnote: 'footnote',
    attr: 'attr',
    emoji: 'emoji',
    inline_math: 'inline_math',
    subscript: 'subscript',
    superscript: 'superscript',
    linebreak: 'linebreak',
    highlight: 'highlight',
    html_entity: 'html_entity',
    pants: 'pants',
    emptyline: 'emptyline',
    softbreak: 'softbreak',
    html_inline: 'html_inline',
    ruby: 'ruby',
    alert_text: 'alert_text',
  });
  var nextNodeSequence = 0,
    createNodeId = Object.defineProperty(
      function () {
        return 'n' + nextNodeSequence++;
      },
      'name',
      { value: 'c', configurable: true },
    );
  class DocumentNode {
    constructor(attributes) {
      attributes = attributes || {};
      this.attributes = {};
      var nodeId = attributes.id || attributes.cid || createNodeId();
      if (!(attributes.id || attributes.cid)) {
        this.set('id', nodeId);
      }
      if (DocumentNode.pool.has(nodeId)) {
        console.warn('Duplicate Model');
      }
      DocumentNode.pool.set(nodeId, this);
      this.set(attributes);
      if (void 0 == attributes.text) {
        this.set('text', this.get('text') || '');
      }
      if (!attributes.children) {
        this.set('children', new NodeCollection());
      }
    }
    isBlock(includeVirtual) {
      return DocumentNode.isBlock(this.get('type'), includeVirtual);
    }
    isTopBlock() {
      return this.get('attachTo') && !this.get('parent');
    }
    isVirtualBlock() {
      return DocumentNode.isVirtualBlock(this.get('type'));
    }
    getClosetBlock(includeVirtual) {
      if (this.isBlock(includeVirtual)) {
        return this;
      } else {
        return this.get('parent').getClosetBlock(includeVirtual);
      }
    }
    getTopBlock() {
      if (this.isTopBlock()) {
        return this;
      } else {
        return this.get('parent').getTopBlock();
      }
    }
    isInline() {
      return !this.isBlock(true);
    }
    getLastChild() {
      var lastChild;
      try {
        lastChild = this.get('children').at(this.get('children').length - 1);
      } catch (error) {
        return null;
      }
      if (lastChild) {
        return lastChild.getLastBrother(false);
      } else {
        return null;
      }
    }
    getFirstChild() {
      var firstChild;
      try {
        firstChild = this.get('children').at(0);
      } catch (error) {
        return null;
      }
      return firstChild && firstChild.getFirstBrother();
    }
    escapedMark(text) {
      return text.replace(/\*/g, '*').replace(/_/g, '_').replace(/`/g, '`');
    }
    isLoose(updateTightFlag) {
      Object.defineProperty(hasLooseListContent, 'name', { value: 't', configurable: true });

      function hasLooseListContent(documentNode) {
        for (
          var currentDocumentNode = documentNode.getFirstChild(),
            paragraphCount = 0,
            nestedListCount = 0;
          currentDocumentNode;
        ) {
          if (DocumentNode.isType(currentDocumentNode, NodeType.paragraph)) {
            paragraphCount++;
          } else {
            if (!DocumentNode.isType(currentDocumentNode, NodeType.list)) {
              return true;
            }
            if (
              DocumentNode.isType(currentDocumentNode.get('after'), NodeType.paragraph) ||
              currentDocumentNode.isLoose()
            ) {
              return true;
            }
            nestedListCount++;
          }
          currentDocumentNode = currentDocumentNode.get('after');
        }
        return !(paragraphCount <= 1 && nestedListCount <= 1);
      }
      for (
        var firstChild = this.getFirstChild(), localDocumentNode = firstChild, loose = false;
        localDocumentNode;
      ) {
        if (hasLooseListContent(localDocumentNode)) {
          loose = true;
          break;
        }
        localDocumentNode = localDocumentNode.get('after');
      }
      if (updateTightFlag) {
        for (localDocumentNode = firstChild; localDocumentNode; ) {
          localDocumentNode.set('tight', !loose);
          localDocumentNode = localDocumentNode.get('after');
        }
      }
      return loose;
    }
    safeGetStrAttr(attributeName, escapeAttribute) {
      if ('href-title' == attributeName) {
        return this.safeGetStrAttr('href') + ' ' + this.safeGetStrAttr('title');
      }
      var attributeValue = this.get(attributeName) ? this.get(attributeName) : '';
      if (escapeAttribute) {
        return utilities.escape(attributeValue);
      } else {
        return attributeValue;
      }
    }
    replaceWith(replacementNode) {
      if (replacementNode.id != this.id) {
        if (replacementNode.get('after')) {
          replacementNode.get('after').set('before', replacementNode.get('before'));
        }
        if (replacementNode.get('before')) {
          replacementNode.get('before').set('after', replacementNode.get('after'));
        }
        replacementNode.set('parent', this.get('parent'));
        replacementNode.set('before', this.get('before'));
        replacementNode.set('after', this.get('after'));
        this.remove();
      }
    }
    canContainBlock(includeTables) {
      return DocumentNode.canContainBlock(this.get('type'), includeTables);
    }
    canNotDirectEdit() {
      return DocumentNode.isType(
        this,
        NodeType.hr,
        NodeType.math_block,
        NodeType.list,
        NodeType.list_item,
        NodeType.toc,
      );
    }
    getText(escapeHeading, separator) {
      var textParts = [],
        children = this.get('children');
      separator = separator || '';
      if (this.canContainBlock(true) || (children && children.length > 0)) {
        children.sortedForEach(function (childNode) {
          textParts.push(childNode.getText(escapeHeading));
        });
        textParts = textParts.join(separator);
        this.unset('text');
      } else {
        if (this.get('type') == NodeType.def_link) {
          return this.get('href') + (this.get('title') || '');
        }
        textParts = this.get('text') || '';
        if (escapeHeading && DocumentNode.isType(this, NodeType.heading, NodeType.paragraph)) {
          textParts = utilities.escapeHead(textParts);
        }
      }
      return textParts;
    }
    getNthChild(inputChildIndex) {
      try {
        for (
          var documentNode = this.getFirstChild(), childIndex = 0;
          documentNode && childIndex < inputChildIndex;
        ) {
          childIndex++;
          documentNode = documentNode.get('after');
        }
        return documentNode;
      } catch (error) {}
      return null;
    }
    getChildIndex() {
      for (var documentNode = this.get('before'), siblingIndex = 0; documentNode; ) {
        documentNode = documentNode.get('before');
        siblingIndex++;
      }
      return siblingIndex;
    }
    getVeryFirst(fromEnd) {
      if (0 == this.get('children').length) {
        return this;
      } else {
        return (fromEnd ? this.getLastChild() : this.getFirstChild()).getVeryFirst(fromEnd);
      }
    }
    getFirstBrother() {
      return this.getLastBrother(true);
    }
    getLastBrother(backward, stopAtTopLevel, visitedTopLevel) {
      var direction = backward ? 'before' : 'after';
      if (this.isTopBlock()) {
        var blocks = this.get('in').blocks;
        if (stopAtTopLevel) {
          return null;
        }
        if (!visitedTopLevel && blocks.length) {
          return blocks.at(backward ? 0 : blocks.length - 1).getLastBrother(backward, false, true);
        }
      }
      if (this.get(direction)) {
        for (var siblingNode = this.attributes[direction]; siblingNode.attributes[direction]; ) {
          siblingNode = siblingNode.attributes[direction];
        }
        return siblingNode.getLastBrother(backward, stopAtTopLevel, true);
      }
      return this;
    }
    getVeryFirstBrotherIncludeTopBlock(backward) {
      return this.getVeryFirstBrother(backward, true);
    }
    getVeryFirstBrother(backward, includeTopLevel) {
      var direction = backward ? 'before' : 'after';
      if (!includeTopLevel && this.isTopBlock()) {
        return null;
      } else {
        if (!this.get(direction) && this.get('parent')) {
          return this.get('parent').getVeryFirstBrother(backward, includeTopLevel);
        } else {
          if (this.get(direction)) {
            return this.get(direction).getVeryFirst(backward);
          } else {
            return null;
          }
        }
      }
    }
    getClosetParagraphLevel() {
      return this;
    }
    contains(documentNode) {
      return (
        !!documentNode && (this.id == documentNode.id || this.contains(documentNode.get('parent')))
      );
    }
    closest() {
      for (
        var nodeType = this.get('type'), itemIndex = 0;
        itemIndex < arguments.length;
        itemIndex++
      ) {
        if (nodeType == arguments[itemIndex]) {
          return this;
        }
      }
      var parentNode = this.get('parent');
      if (parentNode) {
        return DocumentNode.prototype.closest.apply(parentNode, arguments);
      } else {
        return null;
      }
    }
    isDeleted() {
      return void 0 == this.attributes;
    }
    _delete(keepChildren) {
      if (keepChildren) {
        console.debug(`${this.cid} delete ${keepChildren ? '(keepChildren)' : ''}`);
      }
      if (this.attributes) {
        this.set('in', null);
        if (keepChildren) {
          this.get('children')
            .toArray()
            .map(function (item) {
              item.attributes.parent = null;
            });
        } else {
          this.clearChildren();
        }
      }
      DocumentNode.pool.delete(this.cid);
      this.attributes = void 0;
    }
    detach() {
      var previousNode = this.get('before'),
        nextNode = this.get('after');
      if (previousNode) {
        previousNode.attributes.after = nextNode;
      }
      if (nextNode) {
        nextNode.attributes.before = previousNode;
      }
      this.attributes.before = void 0;
      this.attributes.after = void 0;
      this.set('parent', null);
      this.set('attachTo', null);
    }
    remove(keepChildren) {
      this.detach();
      this._delete(keepChildren);
    }
    _appendOrPrepend(childNode, prepend) {
      if (childNode == this) {
        throw Error('trying to append this into this');
      }
      if (!childNode) {
        return childNode;
      }
      childNode.detach();
      var edgeChild = prepend ? this.getFirstChild() : this.getLastChild();
      if (edgeChild) {
        if (prepend) {
          edgeChild.addBefore(childNode);
        } else {
          edgeChild.addAfter(childNode);
        }
      } else {
        childNode.set('parent', this);
        childNode.set('in', this.get('in'));
      }
      return childNode;
    }
    prependChild(childNode) {
      return this._appendOrPrepend(childNode, true);
    }
    appendChild(childNode) {
      return this._appendOrPrepend(childNode, false);
    }
    appendChildrenTillEnd(firstNode) {
      for (var nextNode, documentNode = firstNode; documentNode; ) {
        nextNode = documentNode.get('after');
        this.appendChild(documentNode);
        documentNode = nextNode;
      }
    }
    addAfter(node) {
      if (node == this) {
        throw Error('trying to insert this after this');
      }
      node.detach();
      var after = this.get('after') || void 0;
      this.attributes.after = node;
      node.attributes.after = after;
      if (after) {
        after.attributes.before = node;
        node.attributes.noCloseTag = void 0;
      }
      node.attributes.before = this;
      node.set({
        parent: this.get('parent'),
        attachTo: this.get('attachTo'),
        in: this.get('in'),
      });
      this.attributes.noCloseTag = void 0;
      return node;
    }
    addBefore(node) {
      if (node == this) {
        throw Error('trying to insert this before this');
      }
      node.detach();
      var previousSibling = this.get('before') || void 0;
      if (previousSibling) {
        previousSibling.addAfter(node);
      } else {
        node.attributes.after = this;
        this.attributes.before = node;
        node.set({
          parent: this.get('parent'),
          attachTo: this.get('attachTo'),
          in: this.get('in'),
        });
        node.attributes.noCloseTag = void 0;
      }
      return node;
    }
    addAfterTillEnd(firstNode, lastNode) {
      for (
        var nextNode,
          receiver = this,
          documentNode = firstNode,
          stopNode = lastNode && lastNode.get('after');
        documentNode && documentNode != stopNode;
      ) {
        nextNode = documentNode.get('after');
        receiver.addAfter(documentNode);
        receiver = documentNode;
        documentNode = nextNode;
      }
    }
    addBeforeTillEnd(firstNode, lastNode) {
      var nextNode = firstNode.get('after');
      this.addBefore(firstNode);
      if (firstNode != lastNode && lastNode) {
        firstNode.addAfterTillEnd(nextNode, lastNode);
      }
    }
    addArrayAfter(nodes, preserveIndentation) {
      if (nodes && nodes.length) {
        var receiver = this;
        nodes.forEach((item) => {
          receiver.addAfter(item);
          receiver = item;
        });
        if (!preserveIndentation) {
          clearAutomaticListIndents(nodes[0], nodes.last());
        }
      }
    }
    addArrayBefore(nodes, preserveIndentation) {
      if (nodes && nodes.length) {
        for (var receiver = this, itemIndex = nodes.length - 1; itemIndex >= 0; itemIndex--) {
          let childNode = nodes[itemIndex];
          receiver.addBefore(childNode);
          receiver = childNode;
        }
        if (!preserveIndentation) {
          clearAutomaticListIndents(nodes[0], nodes.last());
        }
      }
    }
    clearChildren() {
      this.get('children').forEach(function (item) {
        item.remove();
      });
    }
    get(attributeName) {
      if (!this.attributes) {
        let errorInstance = new Error(
          `attributes for node has been deleted (${File.option.appVersion})`,
        );
        if (hostGlobal.debugMode) {
          throw errorInstance;
        }
        try {
          throw errorInstance;
        } catch (error) {
          window.Reporter.error(error);
        }
        console.sendError('attributes for node has been deleted', true);
        return null;
      }
      var text = this.attributes[attributeName];
      switch (attributeName) {
        case 'text':
          text = text || '';
          if (DocumentNode.isType(this, NodeType.math_block)) {
            text = text.replace(/^(\w*)\$\$(\w*)$/m, '$1\\$$$$$2');
          }
          return text;
        default:
          return text;
      }
    }
    set(keyOrAttributes, value) {
      var searchValue,
        currentDocumentNode,
        receiver = this,
        currentDocumentMap = this.get('in');
      if ('string' == typeof keyOrAttributes) {
        switch (((currentDocumentNode = this.get(keyOrAttributes)), keyOrAttributes)) {
          case 'parent':
            if (currentDocumentNode && currentDocumentNode.attributes) {
              currentDocumentNode.get('children').remove(this);
            }
            if (value) {
              value.get('children').add(this);
            }
            break;
          case 'before':
            if (
              currentDocumentNode &&
              currentDocumentNode.attributes &&
              currentDocumentNode.attributes.after == this
            ) {
              currentDocumentNode.attributes.after = null;
            }
            if (value) {
              var nextAttributes = value.attributes.after && value.attributes.after.attributes;
              if (nextAttributes && nextAttributes.before == value) {
                nextAttributes.before = null;
              }
              value.attributes.after = this;
              value.attributes.noCloseTag = void 0;
            }
            break;
          case 'after':
            if (
              currentDocumentNode &&
              currentDocumentNode.attributes &&
              currentDocumentNode.attributes.before == this
            ) {
              currentDocumentNode.attributes.before = null;
            }
            if (value) {
              var previousAttributes =
                value.attributes.before && value.attributes.before.attributes;
              if (previousAttributes && previousAttributes.after == value) {
                previousAttributes.after = null;
              }
              value.attributes.before = this;
              this.attributes.noCloseTag = void 0;
            }
            break;
          case 'attachTo':
            if (currentDocumentNode) {
              currentDocumentNode.blocks.remove(this);
            }
            if (value) {
              value.blocks.add(this);
            }
            break;
          case 'in':
            if (currentDocumentNode == value) {
              break;
            }
            var attachTo = this.get('attachTo');
            if (currentDocumentNode) {
              currentDocumentNode.foot_list.remove(this);
              currentDocumentNode.link_list.remove(this);
              currentDocumentNode.allNodes.remove(this);
              this.set('attachTo', null);
            }
            if (value) {
              if (this.get('type') != NodeType.def_footnote || value.foot_list.get(this.id)) {
                if (!(this.get('type') != NodeType.def_link || value.link_list.get(this.id))) {
                  value.link_list.push(this);
                }
              } else {
                value.foot_list.push(this);
              }
              value.allNodes.add(this);
              if (attachTo) {
                this.set('attachTo', attachTo);
              }
            }
            (this.get('children') || []).map((item) => {
              item.set('in', value);
            });
            break;
          case 'id':
            if (value) {
              this.id = value;
              this.cid = value;
            }
            break;
          case 'ref':
            value = value ? (value + '').replace(/\u200b/gi, '').replace(/\\?\]/gi, '\\]') : value;
            break;
          case 'href':
            value =
              value && this.get('type') === NodeType.def_link
                ? (value || '').replace(/\[|\]|"]/gi, '')
                : value;
            break;
          case 'title':
            break;
          case 'type':
            if (value != currentDocumentNode) {
              items.forEach(function (item) {
                this.attributes[item] = void 0;
              }, this);
              this.attributes.ahead = void 0;
              this.attributes.tail = void 0;
              this.attributes.mathLabel = void 0;
              this.attributes.mathEqLabel = void 0;
            }
            break;
          case 'text':
            value = value ? value.replace(/^\u200b/, '') : value;
            (function (newText) {
              if (this.get('type') == NodeType.table_cell && void 0 !== this.attributes.text) {
                if (newText != this.attributes.text) {
                  DocumentNode.tryResetTable(this.closest(NodeType.table));
                }
                var textLengthDelta = (newText || '').length - (this.attributes.text || '').length;
                if (textLengthDelta) {
                  var marginLeft = this.attributes.marginLeft,
                    marginRight = this.attributes.marginRight,
                    removedPadding = 0;
                  if (marginLeft) {
                    if (marginRight.length > marginLeft.length) {
                      removedPadding = Math.min(marginRight.length - 1, textLengthDelta);
                      marginRight = marginRight.substring(0, marginRight.length - removedPadding);
                      textLengthDelta -= removedPadding;
                    }
                    if (textLengthDelta > 0 && marginLeft.length > marginRight.length) {
                      removedPadding = Math.min(marginLeft.length - 1, textLengthDelta);
                      marginLeft = marginLeft.substring(0, marginLeft.length - removedPadding);
                    }
                    if (!marginRight && marginLeft.length) {
                      marginRight = ' ';
                      marginLeft = ' ';
                    }
                    this.attributes.marginLeft = marginLeft;
                    this.attributes.marginRight = marginRight;
                  }
                }
              }
            }).call(this, value);
            this.attributes.empty = void 0;
            break;
          case 'style':
            !(function (documentNode) {
              if (
                documentNode &&
                documentNode.attributes &&
                !documentNode.get('type') != NodeType.list &&
                documentNode.attributes.style
              ) {
                for (var localDocumentNode = documentNode.getFirstChild(); localDocumentNode; ) {
                  localDocumentNode.unset('userIndent');
                  localDocumentNode = localDocumentNode.get('after');
                }
              }
            })(this);
        }
        this.attributes[keyOrAttributes] = value;
        (function () {
          var documentMap = this.get('in') || currentDocumentMap,
            headingChanged =
              ('type' === keyOrAttributes && currentDocumentNode === NodeType.heading) ||
              (this.get('type') == NodeType.heading &&
                DocumentNode.isType(keyOrAttributes, 'depth', 'text', 'parent', 'before', 'after'));
          if (documentMap && documentMap.toc && currentDocumentNode != value && headingChanged) {
            if ('text' != keyOrAttributes || File._onInitParse) {
              documentMap.toc.refresh(false);
            } else {
              setTimeout(function () {
                if (!receiver.isDeleted()) {
                  documentMap.toc.updateHeaderText(receiver);
                }
              }, 10);
            }
          }
          if (this.get('type') === NodeType.def_link && currentDocumentNode != value) {
            if ('ref' === keyOrAttributes) {
              File.editor.imgEdit.willUpdateImgRef(currentDocumentNode);
              File.editor.imgEdit.willUpdateImgRef(value);
            } else {
              if ('text' === keyOrAttributes) {
                File.editor.imgEdit.willUpdateImgRef(this.get('ref'));
              }
            }
          }
          if (
            documentMap &&
            documentMap.toc &&
            'type' == keyOrAttributes &&
            value == NodeType.toc
          ) {
            setTimeout(function () {
              documentMap.toc.refresh();
            }, 20);
          }
        }).call(this);
        (function () {
          var documentMap = this.get('in') || currentDocumentMap;
          if ('type' === keyOrAttributes && documentMap) {
            if (currentDocumentNode === NodeType.def_footnote) {
              documentMap.foot_list.remove(this);
            }
            if (currentDocumentNode === NodeType.def_link) {
              documentMap.link_list.remove(this);
            }
            if (value === NodeType.def_footnote) {
              documentMap.foot_list.push(this);
            }
            if (value === NodeType.def_link) {
              documentMap.link_list.push(this);
            }
          }
          if (
            'ref' == keyOrAttributes &&
            currentDocumentNode !== value &&
            this.get('type') == NodeType.def_footnote
          ) {
            setTimeout(function () {
              if (File.editor && File.editor.docMenu) {
                File.editor.docMenu.refreshFootnoteReverseLink();
              }
            }, 10);
          }
        }).call(this);
        (function () {
          if (this.get('attachTo')) {
            if (
              (this.get('type') == NodeType.meta_block && 'text' == keyOrAttributes) ||
              ('type' == keyOrAttributes &&
                (currentDocumentNode == NodeType.meta_block || value == NodeType.meta_block))
            ) {
              File.onMetaDataChanged(!File._onInitParse);
            }
          } else {
            if (this.get('type') == NodeType.meta_block && value && 'attachTo' == keyOrAttributes) {
              File.onMetaDataChanged(!File._onInitParse);
            }
          }
        }).call(this);
      } else {
        for (searchValue in (this.id || keyOrAttributes.id || (keyOrAttributes.id = createNodeId()),
        keyOrAttributes.id && this.set('id', keyOrAttributes.id),
        keyOrAttributes.in && this.set('in', keyOrAttributes.in),
        keyOrAttributes.attachTo && this.set('attachTo', keyOrAttributes.attachTo),
        keyOrAttributes.type && this.set('type', keyOrAttributes.type),
        keyOrAttributes)) {
          if (
            -1 == ['id', 'in', 'attachTo', 'type', 'marginLeft', 'marginRight'].indexOf(searchValue)
          ) {
            DocumentNode.prototype.set.call(this, searchValue, keyOrAttributes[searchValue]);
          }
        }
        if (void 0 !== keyOrAttributes.marginLeft) {
          this.set('marginLeft', keyOrAttributes.marginLeft);
          this.set('marginRight', keyOrAttributes.marginRight);
        }
      }
      return this;
    }
    unset(attributeName) {
      this.set(attributeName, void 0);
    }
  }
  Object.defineProperty(DocumentNode, 'name', { value: 'd', configurable: true });
  var clearAutomaticListIndents = Object.defineProperty(
      function (documentNode, lastNode) {
        var currentDocumentNode = documentNode,
          parentNode = documentNode.get('parent');
        if (
          parentNode &&
          !parentNode.isDeleted() &&
          DocumentNode.isType(documentNode, NodeType.list_item) &&
          parentNode.get('style') == DocumentNode.ListType.ol &&
          !parentNode.get('isFixed')
        ) {
          for (; currentDocumentNode && currentDocumentNode != lastNode; ) {
            currentDocumentNode.unset('userIndent');
            currentDocumentNode = currentDocumentNode.get('after');
          }
        }
      },
      'name',
      { value: 'u', configurable: true },
    ),
    items = [
      'depth',
      'lang',
      'pattern',
      'patternEnd',
      'align',
      'style',
      'displayStyle',
      'checked',
      'alt',
      'attr',
      'prespace',
      'subindent',
      'markindent',
      'marginLeft',
      'marginRight',
      'alignText',
      'userText',
      'userIndent',
      'isFixed',
      'tagBefore',
      'tagAfter',
      'noCloseTag',
      'empty',
      'alert',
      'legacyMath',
    ];
  DocumentNode.property = [
    'text',
    'type',
    'ahead',
    'tail',
    'header',
    'href',
    'title',
    'ref',
    'start',
    'width',
    'height',
  ].concat(items);
  DocumentNode.isBlock = function (nodeType, includeVirtual) {
    return blockTypes[nodeType] || (includeVirtual && containerTypes[nodeType]);
  };
  DocumentNode.isVirtualBlock = function (nodeType) {
    return containerTypes[nodeType];
  };
  DocumentNode.canContainBlock = function (nodeType, includeTables) {
    return (
      nodeType == NodeType.blockquote ||
      nodeType == NodeType.list ||
      nodeType == NodeType.list_item ||
      (includeTables && (nodeType == NodeType.table_row || nodeType == NodeType.table))
    );
  };
  DocumentNode.noChangeLine = function (node) {
    for (var documentNode = node; documentNode; ) {
      if (
        DocumentNode.isType(node, NodeType.table_cell, NodeType.def_footnote, NodeType.def_link)
      ) {
        return true;
      }
      documentNode = documentNode.get('parent');
    }
    return false;
  };
  DocumentNode.isType = function (nodeOrType) {
    if (null !== nodeOrType && void 0 !== nodeOrType && false !== nodeOrType) {
      var resolvedType =
        'object' == typeof nodeOrType && nodeOrType.attributes
          ? nodeOrType.attributes.type
          : nodeOrType;
      if (arguments[1] instanceof Array) {
        return DocumentNode.isType.apply(null, [resolvedType].concat(arguments[1]));
      }
      for (var itemIndex = 1; itemIndex < arguments.length; itemIndex++) {
        if (resolvedType == arguments[itemIndex]) {
          return true;
        }
      }
      return !(arguments.length > 1) && void 0;
    }
  };
  DocumentNode.sortArray = function (nodes) {
    if (!nodes.length) {
      return [];
    }
    const currentItems = [];
    for (var documentNode = nodes[0].getFirstBrother(); documentNode; ) {
      if (nodes.indexOf(documentNode) >= -1) {
        currentItems.push(documentNode);
      }
      documentNode = documentNode.get('after');
    }
    return currentItems;
  };
  var NodeCollection = Object.defineProperty(
    function () {
      this.reset();
      Object.defineProperty(this, 'length', {
        get: function () {
          return this._set.length;
        },
      });
    },
    'name',
    { value: 'p', configurable: true },
  );
  NodeCollection.prototype.get = function (nodeId) {
    return this._map.get(nodeId);
  };
  NodeCollection.prototype.add = function (node) {
    if (node.cid) {
      this._map.set(node.cid, node);
    }
    this._set.push(node);
  };
  NodeCollection.prototype.remove = function (node) {
    if (node.cid) {
      var existingNode = this._map.get(node.cid);
      if (existingNode && existingNode !== node) {
        this._set.remove(existingNode);
      }
      this._map.delete(node.cid);
    }
    this._set.remove(node);
  };
  NodeCollection.prototype.at = function (index) {
    return this._set[index];
  };
  NodeCollection.prototype.first = function () {
    return this._set[0];
  };
  NodeCollection.prototype.sortedFirst = function () {
    for (var documentNode = this.first(); documentNode && documentNode.get('before'); ) {
      documentNode = documentNode.get('before');
    }
    return documentNode;
  };
  NodeCollection.prototype.toArray = function () {
    return this._set.clone();
  };
  NodeCollection.prototype.reset = function () {
    this._set = [];
    this._map = new Map();
  };
  NodeCollection.prototype.forEach = function (callback, receiver) {
    this._set.clone().forEach(callback, receiver);
  };
  NodeCollection.prototype.map = function (callback, receiver) {
    return this._set.clone().map(callback, receiver);
  };
  NodeCollection.prototype.sortedForEach = function (callback, receiver) {
    for (var documentNode = this.sortedFirst(); documentNode; ) {
      var nextNode = documentNode.get('after');
      callback.call(receiver, documentNode);
      documentNode = nextNode;
    }
  };
  NodeCollection.prototype.update = function (updatedNode) {
    if (updatedNode.cid) {
      this._map.set(updatedNode.cid, updatedNode);
    }
  };
  NodeCollection.prototype.indexOf = function (targetNode) {
    for (var nodeIndex = 0, documentNode = this.sortedFirst(); documentNode; ) {
      if (targetNode == documentNode) {
        return nodeIndex;
      }
      documentNode = documentNode.get('after');
      nodeIndex++;
    }
    return -1;
  };
  DocumentNode.pool = new Map();
  window.NodeDef = DocumentNode;
  var nodeCollectionUtilities = {
      toHTML: function (collection, renderContext) {
        var textParts = [],
          lineSeparator = '';
        if (collection.length) {
          var isArray = collection instanceof Array,
            documentNode = isArray ? collection[0] : collection.at(0);
          if (!isArray) {
            for (; documentNode.get('before'); ) {
              documentNode = documentNode.get('before');
            }
          }
          if (File.option.ignoreLineBreak) {
            lineSeparator = '\n';
          }
          do {
            textParts.push(documentNode.toHTML(void 0, void 0, renderContext));
            documentNode = documentNode.get('after');
          } while (documentNode && (!isArray || collection.indexOf(documentNode) > -1));
        }
        return textParts.join(lineSeparator || '');
      },
    },
    DocumentMap = Object.defineProperty(
      function () {
        this.blocks = new NodeCollection();
        this.allNodes = new NodeCollection();
        this.foot_list = [];
        this.link_list = [];
      },
      'name',
      { value: 'm', configurable: true },
    );
  DocumentMap.prototype.storeToJson = function () {
    return {
      blocks: this.blocks.map(function (item) {
        return item.storeToJson();
      }),
      nid: nextNodeSequence,
    };
  };
  DocumentMap.prototype.restoreFromJson = function (snapshot) {
    this.reset();
    snapshot.blocks
      .map(function (item) {
        return DocumentNode.readFromJson(item, this, true);
      }, this)
      .map(function (item, itemIndex) {
        item.set('before', this.allNodes.get(snapshot.blocks[itemIndex].relation.before_id));
        item.set('after', this.allNodes.get(snapshot.blocks[itemIndex].relation.after_id));
      }, this);
    nextNodeSequence = snapshot.nid - 0;
    if (this.toc) {
      this.toc.refresh(true, true);
    }
  };
  DocumentMap.prototype.get = function (key) {
    switch (key) {
      case 'allNodes':
        return this.allNodes;
      case 'blocks':
        return this.blocks;
    }
  };
  DocumentMap.prototype.reset = function (unusedParameter1, resetIdentityPool) {
    if (File.editor && this == File.editor.nodeMap) {
      console.sendLog('reset NodeMap');
    }
    this.blocks.forEach(function (item) {
      item.remove();
    });
    this.blocks.reset();
    if (hostGlobal.debugMode && this.allNodes.length) {
      console.warn('nodeMap not clean');
    }
    if (this.allNodes.length) {
      DocumentNode.pool = new Map();
    }
    this.allNodes.reset();
    if (this.foot_list instanceof Array) {
      this.foot_list = [];
      this.link_list = [];
    } else {
      this.foot_list.reset();
      this.link_list.reset();
    }
    if (resetIdentityPool) {
      nextNodeSequence = 0;
      DocumentNode.pool = new Map();
    }
    if (window.File.editor && File.editor.mathBlock) {
      File.editor.mathBlock.cleanUpAMS();
    }
  };
  DocumentMap.prototype.getFirst = function () {
    return this.blocks.sortedFirst();
  };
  DocumentMap.prototype.getLast = function () {
    if (this.blocks.length > 0) {
      var lastBlock = this.blocks.at(this.blocks.length - 1);
      return (lastBlock = lastBlock.getLastBrother(false));
    }
    return null;
  };
  DocumentNode.backToParagraphBeforeDelete = [
    NodeType.heading,
    NodeType.def_footnote,
    NodeType.def_link,
    NodeType.meta_block,
    NodeType.fences,
  ];
  DocumentNode.ListType = { ol: 'ol', ul: 'ul', task: 'tasklist' };
  moduleExports.Node = DocumentNode;
  moduleExports.NodeMap = DocumentMap;
  moduleExports.NodeCollection = NodeCollection;
  moduleExports.NodeCollectionUtils = nodeCollectionUtilities;
  moduleExports.TYPE = NodeType;
  DocumentNode.TYPE = NodeType;
}
