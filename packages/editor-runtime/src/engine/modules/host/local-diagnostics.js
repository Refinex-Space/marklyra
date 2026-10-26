// host/local-diagnostics.
export default function initializeHostLocalDiagnostics(requireModule, moduleExports, moduleRecord) {
  var hostGlobal = this || self;
  var LocalDiagnostics = function () {
    this.sendInterval = -1;
    this.lastSend = 0;
    this.initialized = false;
  };
  LocalDiagnostics.prototype.record = function (messageOrError) {
    try {
      if (!messageOrError) {
        return;
      }
      console.debug('string' == typeof messageOrError ? messageOrError : messageOrError.message);
    } catch (error) {}
  };
  LocalDiagnostics.prototype.error = function () {};
  LocalDiagnostics.prototype.sanitizeDom = function (domNode) {
    var domDescription = '<dom>';
    if (domNode) {
      if (domNode.nodeType !== domNode.ELEMENT_NODE) {
        domDescription += '[nodeType=' + domNode.nodeType + ']';
      } else {
        domDescription += domNode.tagName;
        if (domNode.getAttribute('cid')) {
          domDescription += '[cid=' + domNode.getAttribute('cid') + ']';
          domDescription += '[type=' + domNode.getAttribute('mdtype') + ']';
          domDescription += '[class=' + domNode.getAttribute('class') + ']';
        }
      }
      return domDescription;
    } else {
      return domDescription + 'null';
    }
  };
  LocalDiagnostics.prototype.assert = function (condition) {
    if (hostGlobal.debugMode && !condition) {
      throw new Error('assert fail');
    }
  };
  LocalDiagnostics.prototype.fullValidate = function (debugMode) {
    if (hostGlobal.debugMode || debugMode) {
      var firstBlock = File.editor.nodeMap.blocks.sortedFirst(),
        element = document.querySelector(`[cid="${firstBlock.cid}"]`);
      try {
        validateSiblingSequence(element, firstBlock);
      } catch (error) {
        window.alert('error');
        throw error;
      }
    }
    function validateSiblingSequence(firstElement, firstNode) {
      var currentElement = firstElement,
        documentNode = firstNode;
      if (
        firstElement.previousElementSibling &&
        firstElement.previousElementSibling.getAttribute('cid')
      ) {
        console.log(firstNode);
        console.error(firstElement);
        throw new Error(`fullValidate fail under ${documentNode.cid}`);
      }
      for (; documentNode; ) {
        if ('table_row' == documentNode.get('type') || 'table_row' == documentNode.get('type')) {
          return;
        }
        validateNodeElementPair(currentElement, documentNode);
        documentNode = documentNode.get('after');
        currentElement = currentElement.nextElementSibling;
      }
      if (currentElement) {
        console.error(currentElement);
        throw new Error(`fullValidate fail for ${currentElement.getAttribute('cid')}`);
      }
    }
    function validateNodeElementPair(inputElement, documentNode) {
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
          ) {
            throw new Error(`no children for ${nodeType} ${documentNode.cid}`);
          }
          if (inputElement.querySelector('[cid]')) {
            console.log(documentNode);
            console.error(inputElement);
            throw new Error(`fullValidate under for ${documentNode.cid}`);
          }
          return true;
        }
        return validateSiblingSequence(
          inputElement.querySelector(`[cid="${firstChild.cid}"]`),
          firstChild,
        );
      }
      console.log(documentNode);
      console.error(inputElement);
      throw new Error(`fullValidate fail for ${documentNode.cid}`);
    }
  };
  LocalDiagnostics.prototype.sanitizeData = function () {};
  LocalDiagnostics.prototype.install = function () {
    this.initialized = false;
  };
  LocalDiagnostics.prototype.processDom = function (sourceElements) {
    try {
      var sanitizedElements = sourceElements.clone();
      sanitizedElements
        .find('[cid]')
        .removeAttr('class')
        .removeAttr('contentediable')
        .filter(function () {
          return !this.querySelector('[cid]');
        })
        .html(function () {
          return this.getAttribute('cid');
        });
      return sanitizedElements.html();
    } catch (error) {
      LocalDiagnostics.error(error);
    }
  };
  LocalDiagnostics.prototype.buildNodeSnip = function () {
    return File.editor.nodeMap.blocks.map(function serializeDiagnosticNode(documentNode) {
      if (documentNode.isDeleted()) {
        return '[node deleted]';
      }
      var children = [];
      documentNode.get('children').sortedForEach((childNode) => {
        children.push(serializeDiagnosticNode(childNode));
      });
      return { cid: documentNode.cid, type: documentNode.get('type'), children: children };
    });
  };
  var dateInstance = new Date();
  LocalDiagnostics.prototype.buildExtraDebugInfo = async function () {
    var htmlSnip, nodeSnip, msg, memory;
    htmlSnip = this.processDom($('#write'));
    try {
      nodeSnip = this.buildNodeSnip();
    } catch (error) {
      msg = error.stack;
    }
    if (File.isNode) {
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
  };
  LocalDiagnostics.prototype.reportLogicError = function (diagnosticMessage, detail) {
    var errorInstance = new Error('[logic error]');
    errorInstance.stack = diagnosticMessage + '\t' + errorInstance.stack.split('\n').join('\n');
    console.sendError(`[logic error] ${diagnosticMessage}`, true);
    this.buildExtraDebugInfo().then((extra) => {
      extra.detail = detail;
      this.error(errorInstance, { extra: extra });
    });
    File.showDataLostError();
  };
  var Reporter = new LocalDiagnostics();
  moduleExports.Reporter = Reporter;
  window.Reporter = Reporter;
  function DiagnosticBuffer() {
    this.pinpoint = null;
    this.buffers = [];
    this.loadLib = Promise.resolve();
  }
  DiagnosticBuffer.prototype.install = function () {};
  DiagnosticBuffer.prototype.record = function () {};
  DiagnosticBuffer.prototype.updateContext = function () {};
  DiagnosticBuffer.prototype.updateLocation = function () {};
  DiagnosticBuffer.prototype.flush = function () {};
  DiagnosticBuffer.prototype.start = async function () {};
  var Analytics = new DiagnosticBuffer();
  moduleExports.Analytics = Analytics;
  window.Analytics = Analytics;
}
