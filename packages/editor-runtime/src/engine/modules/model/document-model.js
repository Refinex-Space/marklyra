// model/document-model.
// SystemJS module 13. Dependencies: 11.
$__System.registerDynamic('13', ['11'], !0, function (requireModule, moduleExports, moduleRecord) {
  'use strict';
  var hostGlobal = this || self,
    utilities = requireModule('11'),
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
    c = function () {
      return 'n' + nextNodeSequence++;
    };
  class d {
    constructor(attributes) {
      (attributes = attributes || {}), (this.attributes = {});
      var nodeId = attributes.id || attributes.cid || c();
      attributes.id || attributes.cid || this.set('id', nodeId),
        d.pool.has(nodeId) && console.warn('Duplicate Model'),
        d.pool.set(nodeId, this),
        this.set(attributes),
        void 0 == attributes.text && this.set('text', this.get('text') || ''),
        attributes.children || this.set('children', new p());
    }
    isBlock(includeVirtual) {
      return d.isBlock(this.get('type'), includeVirtual);
    }
    isTopBlock() {
      return this.get('attachTo') && !this.get('parent');
    }
    isVirtualBlock() {
      return d.isVirtualBlock(this.get('type'));
    }
    getClosetBlock(includeVirtual) {
      return this.isBlock(includeVirtual)
        ? this
        : this.get('parent').getClosetBlock(includeVirtual);
    }
    getTopBlock() {
      return this.isTopBlock() ? this : this.get('parent').getTopBlock();
    }
    isInline() {
      return !this.isBlock(!0);
    }
    getLastChild() {
      var lastChild;
      try {
        lastChild = this.get('children').at(this.get('children').length - 1);
      } catch (error) {
        return null;
      }
      return lastChild ? lastChild.getLastBrother(!1) : null;
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
      function t(documentNode) {
        for (
          var currentDocumentNode = documentNode.getFirstChild(),
            paragraphCount = 0,
            nestedListCount = 0;
          currentDocumentNode;
        ) {
          if (d.isType(currentDocumentNode, NodeType.paragraph)) paragraphCount++;
          else {
            if (!d.isType(currentDocumentNode, NodeType.list)) return !0;
            if (
              d.isType(currentDocumentNode.get('after'), NodeType.paragraph) ||
              currentDocumentNode.isLoose()
            )
              return !0;
            nestedListCount++;
          }
          currentDocumentNode = currentDocumentNode.get('after');
        }
        return !(paragraphCount <= 1 && nestedListCount <= 1);
      }
      for (
        var firstChild = this.getFirstChild(), localDocumentNode = firstChild, loose = !1;
        localDocumentNode;
      ) {
        if (t(localDocumentNode)) {
          loose = !0;
          break;
        }
        localDocumentNode = localDocumentNode.get('after');
      }
      if (updateTightFlag)
        for (localDocumentNode = firstChild; localDocumentNode; )
          localDocumentNode.set('tight', !loose),
            (localDocumentNode = localDocumentNode.get('after'));
      return loose;
    }
    safeGetStrAttr(attributeName, escapeAttribute) {
      if ('href-title' == attributeName)
        return this.safeGetStrAttr('href') + ' ' + this.safeGetStrAttr('title');
      var attributeValue = this.get(attributeName) ? this.get(attributeName) : '';
      return escapeAttribute ? utilities.escape(attributeValue) : attributeValue;
    }
    replaceWith(replacementNode) {
      replacementNode.id != this.id &&
        (replacementNode.get('after') &&
          replacementNode.get('after').set('before', replacementNode.get('before')),
        replacementNode.get('before') &&
          replacementNode.get('before').set('after', replacementNode.get('after')),
        replacementNode.set('parent', this.get('parent')),
        replacementNode.set('before', this.get('before')),
        replacementNode.set('after', this.get('after')),
        this.remove());
    }
    canContainBlock(includeTables) {
      return d.canContainBlock(this.get('type'), includeTables);
    }
    canNotDirectEdit() {
      return d.isType(
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
      if (
        ((separator = separator || ''),
        this.canContainBlock(!0) || (children && children.length > 0))
      )
        children.sortedForEach(function (childNode) {
          textParts.push(childNode.getText(escapeHeading));
        }),
          (textParts = textParts.join(separator)),
          this.unset('text');
      else {
        if (this.get('type') == NodeType.def_link)
          return this.get('href') + (this.get('title') || '');
        (textParts = this.get('text') || ''),
          escapeHeading &&
            d.isType(this, NodeType.heading, NodeType.paragraph) &&
            (textParts = utilities.escapeHead(textParts));
      }
      return textParts;
    }
    getNthChild(inputChildIndex) {
      try {
        for (
          var documentNode = this.getFirstChild(), childIndex = 0;
          documentNode && childIndex < inputChildIndex;
        )
          childIndex++, (documentNode = documentNode.get('after'));
        return documentNode;
      } catch (error) {}
      return null;
    }
    getChildIndex() {
      for (var documentNode = this.get('before'), siblingIndex = 0; documentNode; )
        (documentNode = documentNode.get('before')), siblingIndex++;
      return siblingIndex;
    }
    getVeryFirst(fromEnd) {
      return 0 == this.get('children').length
        ? this
        : (fromEnd ? this.getLastChild() : this.getFirstChild()).getVeryFirst(fromEnd);
    }
    getFirstBrother() {
      return this.getLastBrother(!0);
    }
    getLastBrother(backward, stopAtTopLevel, visitedTopLevel) {
      var direction = backward ? 'before' : 'after';
      if (this.isTopBlock()) {
        var blocks = this.get('in').blocks;
        if (stopAtTopLevel) return null;
        if (!visitedTopLevel && blocks.length)
          return blocks.at(backward ? 0 : blocks.length - 1).getLastBrother(backward, !1, !0);
      }
      if (this.get(direction)) {
        for (var siblingNode = this.attributes[direction]; siblingNode.attributes[direction]; )
          siblingNode = siblingNode.attributes[direction];
        return siblingNode.getLastBrother(backward, stopAtTopLevel, !0);
      }
      return this;
    }
    getVeryFirstBrotherIncludeTopBlock(backward) {
      return this.getVeryFirstBrother(backward, !0);
    }
    getVeryFirstBrother(backward, includeTopLevel) {
      var direction = backward ? 'before' : 'after';
      return !includeTopLevel && this.isTopBlock()
        ? null
        : !this.get(direction) && this.get('parent')
          ? this.get('parent').getVeryFirstBrother(backward, includeTopLevel)
          : this.get(direction)
            ? this.get(direction).getVeryFirst(backward)
            : null;
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
      )
        if (nodeType == arguments[itemIndex]) return this;
      var parentNode = this.get('parent');
      return parentNode ? d.prototype.closest.apply(parentNode, arguments) : null;
    }
    isDeleted() {
      return void 0 == this.attributes;
    }
    _delete(keepChildren) {
      keepChildren && console.debug(`${this.cid} delete ${keepChildren ? '(keepChildren)' : ''}`),
        this.attributes &&
          (this.set('in', null),
          keepChildren
            ? this.get('children')
                .toArray()
                .map(function (item) {
                  item.attributes.parent = null;
                })
            : this.clearChildren()),
        d.pool.delete(this.cid),
        (this.attributes = void 0);
    }
    detach() {
      var previousNode = this.get('before'),
        nextNode = this.get('after');
      previousNode && (previousNode.attributes.after = nextNode),
        nextNode && (nextNode.attributes.before = previousNode),
        (this.attributes.before = void 0),
        (this.attributes.after = void 0),
        this.set('parent', null),
        this.set('attachTo', null);
    }
    remove(keepChildren) {
      this.detach(), this._delete(keepChildren);
    }
    _appendOrPrepend(childNode, prepend) {
      if (childNode == this) throw Error('trying to append this into this');
      if (!childNode) return childNode;
      childNode.detach();
      var edgeChild = prepend ? this.getFirstChild() : this.getLastChild();
      return (
        edgeChild
          ? prepend
            ? edgeChild.addBefore(childNode)
            : edgeChild.addAfter(childNode)
          : (childNode.set('parent', this), childNode.set('in', this.get('in'))),
        childNode
      );
    }
    prependChild(childNode) {
      return this._appendOrPrepend(childNode, !0);
    }
    appendChild(childNode) {
      return this._appendOrPrepend(childNode, !1);
    }
    appendChildrenTillEnd(firstNode) {
      for (var nextNode, documentNode = firstNode; documentNode; )
        (nextNode = documentNode.get('after')),
          this.appendChild(documentNode),
          (documentNode = nextNode);
    }
    addAfter(node) {
      if (node == this) throw Error('trying to insert this after this');
      node.detach();
      var after = this.get('after') || void 0;
      return (
        (this.attributes.after = node),
        (node.attributes.after = after),
        after && ((after.attributes.before = node), (node.attributes.noCloseTag = void 0)),
        (node.attributes.before = this),
        node.set({
          parent: this.get('parent'),
          attachTo: this.get('attachTo'),
          in: this.get('in'),
        }),
        (this.attributes.noCloseTag = void 0),
        node
      );
    }
    addBefore(node) {
      if (node == this) throw Error('trying to insert this before this');
      node.detach();
      var previousSibling = this.get('before') || void 0;
      return (
        previousSibling
          ? previousSibling.addAfter(node)
          : ((node.attributes.after = this),
            (this.attributes.before = node),
            node.set({
              parent: this.get('parent'),
              attachTo: this.get('attachTo'),
              in: this.get('in'),
            }),
            (node.attributes.noCloseTag = void 0)),
        node
      );
    }
    addAfterTillEnd(firstNode, lastNode) {
      for (
        var nextNode,
          receiver = this,
          documentNode = firstNode,
          stopNode = lastNode && lastNode.get('after');
        documentNode && documentNode != stopNode;
      )
        (nextNode = documentNode.get('after')),
          receiver.addAfter(documentNode),
          (receiver = documentNode),
          (documentNode = nextNode);
    }
    addBeforeTillEnd(firstNode, lastNode) {
      var nextNode = firstNode.get('after');
      this.addBefore(firstNode),
        firstNode != lastNode && lastNode && firstNode.addAfterTillEnd(nextNode, lastNode);
    }
    addArrayAfter(nodes, preserveIndentation) {
      if (nodes && nodes.length) {
        var receiver = this;
        nodes.forEach((item) => {
          receiver.addAfter(item), (receiver = item);
        }),
          !preserveIndentation && u(nodes[0], nodes.last());
      }
    }
    addArrayBefore(nodes, preserveIndentation) {
      if (nodes && nodes.length) {
        for (var receiver = this, itemIndex = nodes.length - 1; itemIndex >= 0; itemIndex--) {
          let childNode = nodes[itemIndex];
          receiver.addBefore(childNode), (receiver = childNode);
        }
        !preserveIndentation && u(nodes[0], nodes.last());
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
        if (hostGlobal.debugMode) throw errorInstance;
        try {
          throw errorInstance;
        } catch (error) {
          window.Reporter.error(error);
        }
        return console.sendError('attributes for node has been deleted', !0), null;
      }
      var text = this.attributes[attributeName];
      switch (attributeName) {
        case 'text':
          return (
            (text = text || ''),
            d.isType(this, NodeType.math_block) &&
              (text = text.replace(/^(\w*)\$\$(\w*)$/m, '$1\\$$$$$2')),
            text
          );
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
            currentDocumentNode &&
              currentDocumentNode.attributes &&
              currentDocumentNode.get('children').remove(this),
              value && value.get('children').add(this);
            break;
          case 'before':
            if (
              (currentDocumentNode &&
                currentDocumentNode.attributes &&
                currentDocumentNode.attributes.after == this &&
                (currentDocumentNode.attributes.after = null),
              value)
            ) {
              var nextAttributes = value.attributes.after && value.attributes.after.attributes;
              nextAttributes && nextAttributes.before == value && (nextAttributes.before = null),
                (value.attributes.after = this),
                (value.attributes.noCloseTag = void 0);
            }
            break;
          case 'after':
            if (
              (currentDocumentNode &&
                currentDocumentNode.attributes &&
                currentDocumentNode.attributes.before == this &&
                (currentDocumentNode.attributes.before = null),
              value)
            ) {
              var previousAttributes =
                value.attributes.before && value.attributes.before.attributes;
              previousAttributes &&
                previousAttributes.after == value &&
                (previousAttributes.after = null),
                (value.attributes.before = this),
                (this.attributes.noCloseTag = void 0);
            }
            break;
          case 'attachTo':
            currentDocumentNode && currentDocumentNode.blocks.remove(this),
              value && value.blocks.add(this);
            break;
          case 'in':
            if (currentDocumentNode == value) break;
            var attachTo = this.get('attachTo');
            currentDocumentNode &&
              (currentDocumentNode.foot_list.remove(this),
              currentDocumentNode.link_list.remove(this),
              currentDocumentNode.allNodes.remove(this),
              this.set('attachTo', null)),
              value &&
                (this.get('type') != NodeType.def_footnote || value.foot_list.get(this.id)
                  ? this.get('type') != NodeType.def_link ||
                    value.link_list.get(this.id) ||
                    value.link_list.push(this)
                  : value.foot_list.push(this),
                value.allNodes.add(this),
                attachTo && this.set('attachTo', attachTo)),
              (this.get('children') || []).map((item) => {
                item.set('in', value);
              });
            break;
          case 'id':
            value && ((this.id = value), (this.cid = value));
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
            value != currentDocumentNode &&
              (items.forEach(function (item) {
                this.attributes[item] = void 0;
              }, this),
              (this.attributes.ahead = void 0),
              (this.attributes.tail = void 0),
              (this.attributes.mathLabel = void 0),
              (this.attributes.mathEqLabel = void 0));
            break;
          case 'text':
            (value = value ? value.replace(/^\u200b/, '') : value),
              function (newText) {
                if (this.get('type') == NodeType.table_cell && void 0 !== this.attributes.text) {
                  newText != this.attributes.text && d.tryResetTable(this.closest(NodeType.table));
                  var textLengthDelta =
                    (newText || '').length - (this.attributes.text || '').length;
                  if (textLengthDelta) {
                    var marginLeft = this.attributes.marginLeft,
                      marginRight = this.attributes.marginRight,
                      removedPadding = 0;
                    marginLeft &&
                      (marginRight.length > marginLeft.length &&
                        ((removedPadding = Math.min(marginRight.length - 1, textLengthDelta)),
                        (marginRight = marginRight.substring(
                          0,
                          marginRight.length - removedPadding,
                        )),
                        (textLengthDelta -= removedPadding)),
                      textLengthDelta > 0 &&
                        marginLeft.length > marginRight.length &&
                        ((removedPadding = Math.min(marginLeft.length - 1, textLengthDelta)),
                        (marginLeft = marginLeft.substring(0, marginLeft.length - removedPadding))),
                      !marginRight &&
                        marginLeft.length &&
                        ((marginRight = ' '), (marginLeft = ' ')),
                      (this.attributes.marginLeft = marginLeft),
                      (this.attributes.marginRight = marginRight));
                  }
                }
              }.call(this, value),
              (this.attributes.empty = void 0);
            break;
          case 'style':
            !(function (documentNode) {
              if (
                documentNode &&
                documentNode.attributes &&
                !documentNode.get('type') != NodeType.list &&
                documentNode.attributes.style
              )
                for (var localDocumentNode = documentNode.getFirstChild(); localDocumentNode; )
                  localDocumentNode.unset('userIndent'),
                    (localDocumentNode = localDocumentNode.get('after'));
            })(this);
        }
        (this.attributes[keyOrAttributes] = value),
          function () {
            var documentMap = this.get('in') || currentDocumentMap,
              headingChanged =
                ('type' === keyOrAttributes && currentDocumentNode === NodeType.heading) ||
                (this.get('type') == NodeType.heading &&
                  d.isType(keyOrAttributes, 'depth', 'text', 'parent', 'before', 'after'));
            documentMap &&
              documentMap.toc &&
              currentDocumentNode != value &&
              headingChanged &&
              ('text' != keyOrAttributes || File._onInitParse
                ? documentMap.toc.refresh(!1)
                : setTimeout(function () {
                    receiver.isDeleted() || documentMap.toc.updateHeaderText(receiver);
                  }, 10)),
              this.get('type') === NodeType.def_link &&
                currentDocumentNode != value &&
                ('ref' === keyOrAttributes
                  ? (File.editor.imgEdit.willUpdateImgRef(currentDocumentNode),
                    File.editor.imgEdit.willUpdateImgRef(value))
                  : 'text' === keyOrAttributes &&
                    File.editor.imgEdit.willUpdateImgRef(this.get('ref'))),
              documentMap &&
                documentMap.toc &&
                'type' == keyOrAttributes &&
                value == NodeType.toc &&
                setTimeout(function () {
                  documentMap.toc.refresh();
                }, 20);
          }.call(this),
          function () {
            var documentMap = this.get('in') || currentDocumentMap;
            'type' === keyOrAttributes &&
              documentMap &&
              (currentDocumentNode === NodeType.def_footnote && documentMap.foot_list.remove(this),
              currentDocumentNode === NodeType.def_link && documentMap.link_list.remove(this),
              value === NodeType.def_footnote && documentMap.foot_list.push(this),
              value === NodeType.def_link && documentMap.link_list.push(this)),
              'ref' == keyOrAttributes &&
                currentDocumentNode !== value &&
                this.get('type') == NodeType.def_footnote &&
                setTimeout(function () {
                  File.editor &&
                    File.editor.docMenu &&
                    File.editor.docMenu.refreshFootnoteReverseLink();
                }, 10);
          }.call(this),
          function () {
            this.get('attachTo')
              ? ((this.get('type') == NodeType.meta_block && 'text' == keyOrAttributes) ||
                  ('type' == keyOrAttributes &&
                    (currentDocumentNode == NodeType.meta_block ||
                      value == NodeType.meta_block))) &&
                File.onMetaDataChanged(!File._onInitParse)
              : this.get('type') == NodeType.meta_block &&
                value &&
                'attachTo' == keyOrAttributes &&
                File.onMetaDataChanged(!File._onInitParse);
          }.call(this);
      } else {
        for (searchValue in (this.id || keyOrAttributes.id || (keyOrAttributes.id = c()),
        keyOrAttributes.id && this.set('id', keyOrAttributes.id),
        keyOrAttributes.in && this.set('in', keyOrAttributes.in),
        keyOrAttributes.attachTo && this.set('attachTo', keyOrAttributes.attachTo),
        keyOrAttributes.type && this.set('type', keyOrAttributes.type),
        keyOrAttributes))
          -1 ==
            ['id', 'in', 'attachTo', 'type', 'marginLeft', 'marginRight'].indexOf(searchValue) &&
            d.prototype.set.call(this, searchValue, keyOrAttributes[searchValue]);
        void 0 !== keyOrAttributes.marginLeft &&
          (this.set('marginLeft', keyOrAttributes.marginLeft),
          this.set('marginRight', keyOrAttributes.marginRight));
      }
      return this;
    }
    unset(attributeName) {
      this.set(attributeName, void 0);
    }
  }
  var u = function (documentNode, lastNode) {
      var currentDocumentNode = documentNode,
        parentNode = documentNode.get('parent');
      if (
        parentNode &&
        !parentNode.isDeleted() &&
        d.isType(documentNode, NodeType.list_item) &&
        parentNode.get('style') == d.ListType.ol &&
        !parentNode.get('isFixed')
      )
        for (; currentDocumentNode && currentDocumentNode != lastNode; )
          currentDocumentNode.unset('userIndent'),
            (currentDocumentNode = currentDocumentNode.get('after'));
    },
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
  (d.property = [
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
  ].concat(items)),
    (d.isBlock = function (nodeType, includeVirtual) {
      return blockTypes[nodeType] || (includeVirtual && containerTypes[nodeType]);
    }),
    (d.isVirtualBlock = function (nodeType) {
      return containerTypes[nodeType];
    }),
    (d.canContainBlock = function (nodeType, includeTables) {
      return (
        nodeType == NodeType.blockquote ||
        nodeType == NodeType.list ||
        nodeType == NodeType.list_item ||
        (includeTables && (nodeType == NodeType.table_row || nodeType == NodeType.table))
      );
    }),
    (d.noChangeLine = function (node) {
      for (var documentNode = node; documentNode; ) {
        if (d.isType(node, NodeType.table_cell, NodeType.def_footnote, NodeType.def_link))
          return !0;
        documentNode = documentNode.get('parent');
      }
      return !1;
    }),
    (d.isType = function (nodeOrType) {
      if (null !== nodeOrType && void 0 !== nodeOrType && !1 !== nodeOrType) {
        var resolvedType =
          'object' == typeof nodeOrType && nodeOrType.attributes
            ? nodeOrType.attributes.type
            : nodeOrType;
        if (arguments[1] instanceof Array)
          return d.isType.apply(null, [resolvedType].concat(arguments[1]));
        for (var itemIndex = 1; itemIndex < arguments.length; itemIndex++)
          if (resolvedType == arguments[itemIndex]) return !0;
        return !(arguments.length > 1) && void 0;
      }
    }),
    (d.sortArray = function (nodes) {
      if (!nodes.length) return [];
      const currentItems = [];
      for (var documentNode = nodes[0].getFirstBrother(); documentNode; )
        nodes.indexOf(documentNode) >= -1 && currentItems.push(documentNode),
          (documentNode = documentNode.get('after'));
      return currentItems;
    });
  var p = function () {
    this.reset(),
      Object.defineProperty(this, 'length', {
        get: function () {
          return this._set.length;
        },
      });
  };
  (p.prototype.get = function (nodeId) {
    return this._map.get(nodeId);
  }),
    (p.prototype.add = function (node) {
      node.cid && this._map.set(node.cid, node), this._set.push(node);
    }),
    (p.prototype.remove = function (node) {
      if (node.cid) {
        var existingNode = this._map.get(node.cid);
        existingNode && existingNode !== node && this._set.remove(existingNode),
          this._map.delete(node.cid);
      }
      this._set.remove(node);
    }),
    (p.prototype.at = function (index) {
      return this._set[index];
    }),
    (p.prototype.first = function () {
      return this._set[0];
    }),
    (p.prototype.sortedFirst = function () {
      for (var documentNode = this.first(); documentNode && documentNode.get('before'); )
        documentNode = documentNode.get('before');
      return documentNode;
    }),
    (p.prototype.toArray = function () {
      return this._set.clone();
    }),
    (p.prototype.reset = function () {
      (this._set = []), (this._map = new Map());
    }),
    (p.prototype.forEach = function (callback, receiver) {
      this._set.clone().forEach(callback, receiver);
    }),
    (p.prototype.map = function (callback, receiver) {
      return this._set.clone().map(callback, receiver);
    }),
    (p.prototype.sortedForEach = function (callback, receiver) {
      for (var documentNode = this.sortedFirst(); documentNode; ) {
        var nextNode = documentNode.get('after');
        callback.call(receiver, documentNode), (documentNode = nextNode);
      }
    }),
    (p.prototype.update = function (updatedNode) {
      updatedNode.cid && this._map.set(updatedNode.cid, updatedNode);
    }),
    (p.prototype.indexOf = function (targetNode) {
      for (var nodeIndex = 0, documentNode = this.sortedFirst(); documentNode; ) {
        if (targetNode == documentNode) return nodeIndex;
        (documentNode = documentNode.get('after')), nodeIndex++;
      }
      return -1;
    }),
    (d.pool = new Map()),
    (window.NodeDef = d);
  var nodeCollectionUtilities = {
      toHTML: function (collection, renderContext) {
        var textParts = [],
          lineSeparator = '';
        if (collection.length) {
          var isArray = collection instanceof Array,
            documentNode = isArray ? collection[0] : collection.at(0);
          if (!isArray)
            for (; documentNode.get('before'); ) documentNode = documentNode.get('before');
          File.option.ignoreLineBreak && (lineSeparator = '\n');
          do {
            textParts.push(documentNode.toHTML(void 0, void 0, renderContext)),
              (documentNode = documentNode.get('after'));
          } while (documentNode && (!isArray || collection.indexOf(documentNode) > -1));
        }
        return textParts.join(lineSeparator || '');
      },
    },
    m = function () {
      (this.blocks = new p()),
        (this.allNodes = new p()),
        (this.foot_list = []),
        (this.link_list = []);
    };
  (m.prototype.storeToJson = function () {
    return {
      blocks: this.blocks.map(function (item) {
        return item.storeToJson();
      }),
      nid: nextNodeSequence,
    };
  }),
    (m.prototype.restoreFromJson = function (snapshot) {
      this.reset(),
        snapshot.blocks
          .map(function (item) {
            return d.readFromJson(item, this, !0);
          }, this)
          .map(function (item, itemIndex) {
            item.set('before', this.allNodes.get(snapshot.blocks[itemIndex].relation.before_id)),
              item.set('after', this.allNodes.get(snapshot.blocks[itemIndex].relation.after_id));
          }, this),
        (nextNodeSequence = snapshot.nid - 0),
        this.toc && this.toc.refresh(!0, !0);
    }),
    (m.prototype.get = function (key) {
      switch (key) {
        case 'allNodes':
          return this.allNodes;
        case 'blocks':
          return this.blocks;
      }
    }),
    (m.prototype.reset = function (unusedParameter1, resetIdentityPool) {
      File.editor && this == File.editor.nodeMap && console.sendLog('reset NodeMap'),
        this.blocks.forEach(function (item) {
          item.remove();
        }),
        this.blocks.reset(),
        hostGlobal.debugMode && this.allNodes.length && console.warn('nodeMap not clean'),
        this.allNodes.length && (d.pool = new Map()),
        this.allNodes.reset(),
        this.foot_list instanceof Array
          ? ((this.foot_list = []), (this.link_list = []))
          : (this.foot_list.reset(), this.link_list.reset()),
        resetIdentityPool && ((nextNodeSequence = 0), (d.pool = new Map())),
        window.File.editor && File.editor.mathBlock && File.editor.mathBlock.cleanUpAMS();
    }),
    (m.prototype.getFirst = function () {
      return this.blocks.sortedFirst();
    }),
    (m.prototype.getLast = function () {
      if (this.blocks.length > 0) {
        var lastBlock = this.blocks.at(this.blocks.length - 1);
        return (lastBlock = lastBlock.getLastBrother(!1));
      }
      return null;
    }),
    (d.backToParagraphBeforeDelete = [
      NodeType.heading,
      NodeType.def_footnote,
      NodeType.def_link,
      NodeType.meta_block,
      NodeType.fences,
    ]),
    (d.ListType = { ol: 'ol', ul: 'ul', task: 'tasklist' }),
    (moduleExports.Node = d),
    (moduleExports.NodeMap = m),
    (moduleExports.NodeCollection = p),
    (moduleExports.NodeCollectionUtils = nodeCollectionUtilities),
    (moduleExports.TYPE = NodeType),
    (d.TYPE = NodeType);
});
