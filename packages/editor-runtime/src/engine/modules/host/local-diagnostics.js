// host/local-diagnostics.
// SystemJS module 38. Dependencies: none.
$__System.registerDynamic('38', [], !0, function (requireModule, moduleExports, moduleRecord) {
  var hostGlobal = this || self;
  var s = function () {
    (this.sendInterval = -1), (this.lastSend = 0), (this.initialized = !1);
  };
  (s.prototype.record = function (messageOrError) {
    try {
      if (!messageOrError) return;
      console.debug('string' == typeof messageOrError ? messageOrError : messageOrError.message);
    } catch (error) {}
  }),
    (s.prototype.error = function () {}),
    (s.prototype.sanitizeDom = function (domNode) {
      var domDescription = '<dom>';
      return domNode
        ? (domNode.nodeType !== domNode.ELEMENT_NODE
            ? (domDescription += '[nodeType=' + domNode.nodeType + ']')
            : ((domDescription += domNode.tagName),
              domNode.getAttribute('cid') &&
                ((domDescription += '[cid=' + domNode.getAttribute('cid') + ']'),
                (domDescription += '[type=' + domNode.getAttribute('mdtype') + ']'),
                (domDescription += '[class=' + domNode.getAttribute('class') + ']'))),
          domDescription)
        : domDescription + 'null';
    }),
    (s.prototype.assert = function (condition) {
      if (hostGlobal.debugMode && !condition) throw new Error('assert fail');
    }),
    (s.prototype.fullValidate = function (debugMode) {
      if (hostGlobal.debugMode || debugMode) {
        var firstBlock = File.editor.nodeMap.blocks.sortedFirst(),
          element = document.querySelector(`[cid="${firstBlock.cid}"]`);
        try {
          r(element, firstBlock);
        } catch (error) {
          throw (window.alert('error'), error);
        }
      }
      function r(firstElement, firstNode) {
        var currentElement = firstElement,
          documentNode = firstNode;
        if (
          firstElement.previousElementSibling &&
          firstElement.previousElementSibling.getAttribute('cid')
        )
          throw (
            (console.log(firstNode),
            console.error(firstElement),
            new Error(`fullValidate fail under ${documentNode.cid}`))
          );
        for (; documentNode; ) {
          if ('table_row' == documentNode.get('type') || 'table_row' == documentNode.get('type'))
            return;
          o(currentElement, documentNode),
            (documentNode = documentNode.get('after')),
            (currentElement = currentElement.nextElementSibling);
        }
        if (currentElement)
          throw (
            (console.error(currentElement),
            new Error(`fullValidate fail for ${currentElement.getAttribute('cid')}`))
          );
      }
      function o(inputElement, documentNode) {
        var nodeType = inputElement.getAttribute('mdtype');
        if (
          nodeType == documentNode.get('type') &&
          inputElement.getAttribute('cid') == documentNode.cid
        ) {
          var firstChild = documentNode.getFirstChild();
          if (!firstChild) {
            if (
              'list' == nodeType ||
              'list_item' == nodeType ||
              'blockquote' == nodeType ||
              'table' == nodeType.substring(0, 'table'.length)
            )
              throw new Error(`no children for ${nodeType} ${documentNode.cid}`);
            if (inputElement.querySelector('[cid]'))
              throw (
                (console.log(documentNode),
                console.error(inputElement),
                new Error(`fullValidate under for ${documentNode.cid}`))
              );
            return !0;
          }
          return r(inputElement.querySelector(`[cid="${firstChild.cid}"]`), firstChild);
        }
        throw (
          (console.log(documentNode),
          console.error(inputElement),
          new Error(`fullValidate fail for ${documentNode.cid}`))
        );
      }
    }),
    (s.prototype.sanitizeData = function () {}),
    (s.prototype.install = function () {
      this.initialized = !1;
    }),
    (s.prototype.processDom = function (sourceElements) {
      try {
        var sanitizedElements = sourceElements.clone();
        return (
          sanitizedElements
            .find('[cid]')
            .removeAttr('class')
            .removeAttr('contentediable')
            .filter(function () {
              return !this.querySelector('[cid]');
            })
            .html(function () {
              return this.getAttribute('cid');
            }),
          sanitizedElements.html()
        );
      } catch (error) {
        s.error(error);
      }
    }),
    (s.prototype.buildNodeSnip = function () {
      return File.editor.nodeMap.blocks.map(function e(documentNode) {
        if (documentNode.isDeleted()) return '[node deleted]';
        var children = [];
        return (
          documentNode.get('children').sortedForEach((childNode) => {
            children.push(e(childNode));
          }),
          { cid: documentNode.cid, type: documentNode.get('type'), children: children }
        );
      });
    });
  var dateInstance = new Date();
  (s.prototype.buildExtraDebugInfo = async function () {
    var htmlSnip, nodeSnip, msg, memory;
    htmlSnip = this.processDom($('#write'));
    try {
      nodeSnip = this.buildNodeSnip();
    } catch (error) {
      msg = error.stack;
    }
    if (File.isNode)
      try {
        const process = hostGlobal.process,
          memoryResults = await Promise.all([
            process.getSystemMemoryInfo(),
            process.getProcessMemoryInfo(),
            process.getBlinkMemoryInfo(),
          ]);
        memory = { system: memoryResults[0], process: memoryResults[1], blink: memoryResults[2] };
      } catch (currentError) {
        msg = msg + '\n' + currentError.stack;
      }
    return {
      htmlSnip: htmlSnip,
      nodeSnip: nodeSnip,
      memory: memory,
      enableAutoSave: File.option.enableAutoSave,
      useIME: File.editor.useIMEKeyboard,
      inBusyMode: File.inBusyMode,
      timePass: new Date() - dateInstance,
      msg: msg,
    };
  }),
    (s.prototype.reportLogicError = function (diagnosticMessage, detail) {
      var errorInstance = new Error('[logic error]');
      (errorInstance.stack = diagnosticMessage + '\t' + errorInstance.stack.split('\n').join('\n')),
        console.sendError(`[logic error] ${diagnosticMessage}`, !0),
        this.buildExtraDebugInfo().then((extra) => {
          (extra.detail = detail), this.error(errorInstance, { extra: extra });
        }),
        File.showDataLostError();
    });
  var Reporter = new s();
  (moduleExports.Reporter = Reporter), (window.Reporter = Reporter);
  function m() {
    (this.pinpoint = null), (this.buffers = []), (this.loadLib = Promise.resolve());
  }
  m.prototype.install = function () {};
  m.prototype.record = function () {};
  m.prototype.updateContext = function () {};
  m.prototype.updateLocation = function () {};
  m.prototype.flush = function () {};
  m.prototype.start = async function () {};
  var Analytics = new m();
  (moduleExports.Analytics = Analytics), (window.Analytics = Analytics);
});
