// codemirror/lint.
export default function initializeCodemirrorLint(requireModule, moduleExports, moduleRecord) {
  if (!this) {
    self;
  }
  var CodeMirror = requireModule('libraries/codemirror'),
    lintGutterId = 'CodeMirror-lint-markers';
  function removeElement(element) {
    if (element.parentNode) {
      element.parentNode.removeChild(element);
    }
  }
  function showLintTooltip(mouseEvent, content, targetElement) {
    var tooltip = (function (mouseEvent, content) {
      var tooltipElement = document.createElement('div');
      function moveTooltip(mouseEvent) {
        if (!tooltipElement.parentNode) {
          return CodeMirror.off(document, 'mousemove', moveTooltip);
        }
        tooltipElement.style.top =
          Math.max(0, mouseEvent.clientY - tooltipElement.offsetHeight - 5) + 'px';
        tooltipElement.style.left = mouseEvent.clientX + 5 + 'px';
      }
      tooltipElement.className = 'CodeMirror-lint-tooltip';
      tooltipElement.appendChild(content.cloneNode(true));
      document.body.appendChild(tooltipElement);
      CodeMirror.on(document, 'mousemove', moveTooltip);
      moveTooltip(mouseEvent);
      if (null != tooltipElement.style.opacity) {
        tooltipElement.style.opacity = 1;
      }
      return tooltipElement;
    })(mouseEvent, content);
    function hideTooltip() {
      var fadingTooltip;
      CodeMirror.off(targetElement, 'mouseout', hideTooltip);
      if (tooltip) {
        if ((fadingTooltip = tooltip).parentNode) {
          if (null == fadingTooltip.style.opacity) {
            removeElement(fadingTooltip);
          }
          fadingTooltip.style.opacity = 0;
          setTimeout(function () {
            removeElement(fadingTooltip);
          }, 600);
        }
        tooltip = null;
      }
    }
    var targetCheckTimer = setInterval(function () {
      if (tooltip) {
        for (var ancestor = targetElement; ; ancestor = ancestor.parentNode) {
          if (ancestor && 11 == ancestor.nodeType) {
            ancestor = ancestor.host;
          }
          if (ancestor == document.body) {
            return;
          }
          if (!ancestor) {
            hideTooltip();
            break;
          }
        }
      }
      if (!tooltip) {
        return clearInterval(targetCheckTimer);
      }
    }, 400);
    CodeMirror.on(targetElement, 'mouseout', hideTooltip);
  }
  function LintState(editor, options, hasGutter) {
    this.marked = [];
    this.options = options;
    this.timeout = null;
    this.hasGutter = hasGutter;
    this.onMouseOver = function (mouseEvent) {
      !(function (editor, mouseEvent) {
        var targetElement = mouseEvent.target || mouseEvent.srcElement;
        if (!/\bCodeMirror-lint-mark-/.test(targetElement.className)) {
          return;
        }
        for (
          var bounds = targetElement.getBoundingClientRect(),
            centerX = (bounds.left + bounds.right) / 2,
            centerY = (bounds.top + bounds.bottom) / 2,
            markers = editor.findMarksAt(
              editor.coordsChar({ left: centerX, top: centerY }, 'client'),
            ),
            annotations = [],
            markerIndex = 0;
          markerIndex < markers.length;
          ++markerIndex
        ) {
          var annotation = markers[markerIndex].__annotation;
          if (annotation) {
            annotations.push(annotation);
          }
        }
        if (annotations.length) {
          (function (annotations, mouseEvent) {
            for (
              var targetElement = mouseEvent.target || mouseEvent.srcElement,
                content = document.createDocumentFragment(),
                annotationIndex = 0;
              annotationIndex < annotations.length;
              annotationIndex++
            ) {
              var annotation = annotations[annotationIndex];
              content.appendChild(createAnnotationMessage(annotation));
            }
            showLintTooltip(mouseEvent, content, targetElement);
          })(annotations, mouseEvent);
        }
      })(editor, mouseEvent);
    };
    this.waitingFor = 0;
  }
  function clearLintMarkers(editor) {
    var lintState = editor.state.lint;
    if (lintState.hasGutter) {
      editor.clearGutter(lintGutterId);
    }
    for (var markerIndex = 0; markerIndex < lintState.marked.length; ++markerIndex) {
      lintState.marked[markerIndex].clear();
    }
    lintState.marked.length = 0;
  }
  function createGutterMarker(content, severity, multipleAnnotations, tooltips) {
    var marker = document.createElement('div'),
      tooltipTarget = marker;
    marker.className = 'CodeMirror-lint-marker-' + severity;
    if (multipleAnnotations) {
      (tooltipTarget = marker.appendChild(document.createElement('div'))).className =
        'CodeMirror-lint-marker-multiple';
    }
    if (0 != tooltips) {
      CodeMirror.on(tooltipTarget, 'mouseover', function (mouseEvent) {
        showLintTooltip(mouseEvent, content, tooltipTarget);
      });
    }
    return marker;
  }
  function createAnnotationMessage(annotation) {
    var severity = annotation.severity;
    if (!severity) {
      severity = 'error';
    }
    var messageElement = document.createElement('div');
    messageElement.className = 'CodeMirror-lint-message-' + severity;
    messageElement.appendChild(document.createTextNode(annotation.message));
    return messageElement;
  }
  function startLinting(editor) {
    var options = editor.state.lint.options,
      lintOptions = options.options || options,
      getAnnotations = options.getAnnotations || editor.getHelper(CodeMirror.Pos(0, 0), 'lint');
    if (getAnnotations) {
      if (options.async || getAnnotations.async) {
        !(function (editor, getAnnotations, lintOptions) {
          var lintState = editor.state.lint,
            requestId = ++lintState.waitingFor;
          function cancelStaleRequest() {
            requestId = -1;
            editor.off('change', cancelStaleRequest);
          }
          editor.on('change', cancelStaleRequest);
          getAnnotations(
            editor.getValue(),
            function (annotations, legacyAnnotations) {
              editor.off('change', cancelStaleRequest);
              if (lintState.waitingFor == requestId) {
                if (legacyAnnotations && annotations instanceof CodeMirror) {
                  annotations = legacyAnnotations;
                }
                updateLinting(editor, annotations);
              }
            },
            lintOptions,
            editor,
          );
        })(editor, getAnnotations, lintOptions);
      } else {
        var result = getAnnotations(editor.getValue(), lintOptions, editor);
        if (!result) {
          return;
        }
        if (result.then) {
          result.then(function (annotations) {
            updateLinting(editor, annotations);
          });
        } else {
          updateLinting(editor, result);
        }
      }
    }
  }
  function updateLinting(editor, annotations) {
    clearLintMarkers(editor);
    for (
      var previousSeverity,
        lintState = editor.state.lint,
        options = lintState.options,
        annotationsByLine = (function (annotations) {
          for (
            var groupedAnnotations = [], annotationIndex = 0;
            annotationIndex < annotations.length;
            ++annotationIndex
          ) {
            var annotation = annotations[annotationIndex],
              lineNumber = annotation.from.line;
            (groupedAnnotations[lineNumber] || (groupedAnnotations[lineNumber] = [])).push(
              annotation,
            );
          }
          return groupedAnnotations;
        })(annotations),
        lineNumber = 0;
      lineNumber < annotationsByLine.length;
      ++lineNumber
    ) {
      var lineAnnotations = annotationsByLine[lineNumber];
      if (lineAnnotations) {
        for (
          var lineSeverity = null,
            gutterContent = lintState.hasGutter && document.createDocumentFragment(),
            annotationIndex = 0;
          annotationIndex < lineAnnotations.length;
          ++annotationIndex
        ) {
          var annotation = lineAnnotations[annotationIndex],
            severity = annotation.severity;
          if (!severity) {
            severity = 'error';
          }
          lineSeverity = 'error' == (previousSeverity = lineSeverity) ? previousSeverity : severity;
          if (options.formatAnnotation) {
            annotation = options.formatAnnotation(annotation);
          }
          if (lintState.hasGutter) {
            gutterContent.appendChild(createAnnotationMessage(annotation));
          }
          if (annotation.to) {
            lintState.marked.push(
              editor.markText(annotation.from, annotation.to, {
                className: 'CodeMirror-lint-mark-' + severity,
                __annotation: annotation,
              }),
            );
          }
        }
        if (lintState.hasGutter) {
          editor.setGutterMarker(
            lineNumber,
            lintGutterId,
            createGutterMarker(
              gutterContent,
              lineSeverity,
              lineAnnotations.length > 1,
              lintState.options.tooltips,
            ),
          );
        }
      }
    }
    if (options.onUpdateLinting) {
      options.onUpdateLinting(annotations, annotationsByLine, editor);
    }
  }
  function scheduleLinting(editor) {
    var lintState = editor.state.lint;
    if (lintState) {
      clearTimeout(lintState.timeout);
      lintState.timeout = setTimeout(function () {
        startLinting(editor);
      }, lintState.options.delay || 500);
    }
  }
  CodeMirror.defineOption('lint', false, function (editor, options, previousValue) {
    if (previousValue && previousValue != CodeMirror.Init) {
      clearLintMarkers(editor);
      if (false !== editor.state.lint.options.lintOnChange) {
        editor.off('change', scheduleLinting);
      }
      CodeMirror.off(editor.getWrapperElement(), 'mouseover', editor.state.lint.onMouseOver);
      clearTimeout(editor.state.lint.timeout);
      delete editor.state.lint;
    }
    if (options) {
      for (
        var gutters = editor.getOption('gutters'), hasGutter = false, gutterIndex = 0;
        gutterIndex < gutters.length;
        ++gutterIndex
      ) {
        if (gutters[gutterIndex] == lintGutterId) {
          hasGutter = true;
        }
      }
      var lintState = (editor.state.lint = new LintState(
        editor,
        (configuredOptions = options) instanceof Function
          ? { getAnnotations: configuredOptions }
          : ((configuredOptions && true !== configuredOptions) || (configuredOptions = {}),
            configuredOptions),
        hasGutter,
      ));
      if (false !== lintState.options.lintOnChange) {
        editor.on('change', scheduleLinting);
      }
      if (0 != lintState.options.tooltips && 'gutter' != lintState.options.tooltips) {
        CodeMirror.on(editor.getWrapperElement(), 'mouseover', lintState.onMouseOver);
      }
      startLinting(editor);
    }
    var configuredOptions;
  });
  CodeMirror.defineExtension('performLint', function () {
    if (this.state.lint) {
      startLinting(this);
    }
  });
  CodeMirror.clearMarks = clearLintMarkers;
  CodeMirror.updateLinting = updateLinting;
}
