// Install this compatibility library in the supplied engine environment.
export default function installLibrariesCodemirror(engineModules, vendorScope) {
  // libraries/codemirror.
  // Vendor adapter; version and local behavior are preserved.
  engineModules.define(
    'libraries/codemirror',
    [],
    true,
    function (requireModule, moduleExports, moduleRecord) {
      if (!this) {
        self;
      }
      moduleRecord.exports = (function () {
        'use strict';
        Object.defineProperty(classTest, 'name', { value: 'S', configurable: true });
        Object.defineProperty(removeChildren, 'name', { value: 'T', configurable: true });
        Object.defineProperty(removeChildrenAndAdd, 'name', { value: '_', configurable: true });
        Object.defineProperty(createElement, 'name', { value: 'A', configurable: true });
        Object.defineProperty(eltP, 'name', { value: 'M', configurable: true });
        Object.defineProperty(contains, 'name', { value: 'L', configurable: true });
        Object.defineProperty(activeElt, 'name', { value: 'N', configurable: true });
        Object.defineProperty(addClass, 'name', { value: 'D', configurable: true });
        Object.defineProperty(joinClasses, 'name', { value: 'R', configurable: true });
        Object.defineProperty(bind, 'name', { value: 'P', configurable: true });
        Object.defineProperty(copyObj, 'name', { value: 'I', configurable: true });
        Object.defineProperty(countColumn, 'name', { value: 'O', configurable: true });
        Object.defineProperty(indexOf, 'name', { value: 'H', configurable: true });
        Object.defineProperty(findColumn, 'name', { value: 'V', configurable: true });
        Object.defineProperty(spaceStr, 'name', { value: 'K', configurable: true });
        Object.defineProperty(lst, 'name', { value: 'Y', configurable: true });
        Object.defineProperty(map, 'name', { value: 'G', configurable: true });
        Object.defineProperty(nothing, 'name', { value: 'Q', configurable: true });
        Object.defineProperty(createObj, 'name', { value: 'X', configurable: true });
        Object.defineProperty(isWordCharBasic, 'name', { value: 'ee', configurable: true });
        Object.defineProperty(isWordChar, 'name', { value: 'te', configurable: true });
        Object.defineProperty(isEmpty, 'name', { value: 'ne', configurable: true });
        Object.defineProperty(isExtendingChar, 'name', { value: 're', configurable: true });
        Object.defineProperty(skipExtendingChars, 'name', { value: 'oe', configurable: true });
        Object.defineProperty(findFirst, 'name', { value: 'ae', configurable: true });
        Object.defineProperty(getLine, 'name', { value: 'se', configurable: true });
        Object.defineProperty(getBetween, 'name', { value: 'le', configurable: true });
        Object.defineProperty(getLines, 'name', { value: 'ce', configurable: true });
        Object.defineProperty(updateLineHeight, 'name', { value: 'de', configurable: true });
        Object.defineProperty(lineNo, 'name', { value: 'ue', configurable: true });
        Object.defineProperty(lineAtHeight, 'name', { value: 'he', configurable: true });
        Object.defineProperty(isLine, 'name', { value: 'pe', configurable: true });
        Object.defineProperty(lineNumberFor, 'name', { value: 'fe', configurable: true });
        Object.defineProperty(Pos, 'name', { value: 'me', configurable: true });
        Object.defineProperty(cmp, 'name', { value: 'ge', configurable: true });
        Object.defineProperty(equalCursorPos, 'name', { value: 've', configurable: true });
        Object.defineProperty(copyPos, 'name', { value: 'ye', configurable: true });
        Object.defineProperty(maxPos, 'name', { value: 'be', configurable: true });
        Object.defineProperty(minPos, 'name', { value: 'we', configurable: true });
        Object.defineProperty(clipLine, 'name', { value: 'xe', configurable: true });
        Object.defineProperty(clipPos, 'name', { value: 'Ce', configurable: true });
        Object.defineProperty(clipPosArray, 'name', { value: 'Fe', configurable: true });
        Object.defineProperty(MarkedSpan, 'name', { value: 'Ee', configurable: true });
        Object.defineProperty(getMarkedSpanFor, 'name', { value: 'Te', configurable: true });
        Object.defineProperty(removeMarkedSpan, 'name', { value: '_e', configurable: true });
        Object.defineProperty(stretchSpansOverChange, 'name', { value: 'Ae', configurable: true });
        Object.defineProperty(clearEmptySpans, 'name', { value: 'Me', configurable: true });
        Object.defineProperty(detachMarkedSpans, 'name', { value: 'Le', configurable: true });
        Object.defineProperty(attachMarkedSpans, 'name', { value: 'Ne', configurable: true });
        Object.defineProperty(extraLeft, 'name', { value: 'De', configurable: true });
        Object.defineProperty(extraRight, 'name', { value: 'Re', configurable: true });
        Object.defineProperty(compareCollapsedMarkers, 'name', { value: 'Be', configurable: true });
        Object.defineProperty(collapsedSpanAtSide, 'name', { value: 'Pe', configurable: true });
        Object.defineProperty(collapsedSpanAtStart, 'name', { value: 'Ie', configurable: true });
        Object.defineProperty(collapsedSpanAtEnd, 'name', { value: 'Oe', configurable: true });
        Object.defineProperty(conflictingCollapsedRange, 'name', {
          value: '$e',
          configurable: true,
        });
        Object.defineProperty(visualLine, 'name', { value: 'He', configurable: true });
        Object.defineProperty(visualLineNo, 'name', { value: 'Ue', configurable: true });
        Object.defineProperty(visualLineEndNo, 'name', { value: 'je', configurable: true });
        Object.defineProperty(lineIsHidden, 'name', { value: 'qe', configurable: true });
        Object.defineProperty(lineIsHiddenInner, 'name', { value: 'We', configurable: true });
        Object.defineProperty(heightAtLine, 'name', { value: 'ze', configurable: true });
        Object.defineProperty(lineLength, 'name', { value: 'Ve', configurable: true });
        Object.defineProperty(findMaxLine, 'name', { value: 'Je', configurable: true });
        Object.defineProperty(getBidiPartAt, 'name', { value: 'Ye', configurable: true });
        Object.defineProperty(getOrder, 'name', { value: 'Qe', configurable: true });
        Object.defineProperty(moveCharLogically, 'name', { value: 'Xe', configurable: true });
        Object.defineProperty(moveLogically, 'name', { value: 'Ze', configurable: true });
        Object.defineProperty(endOfLine, 'name', { value: 'et', configurable: true });
        Object.defineProperty(moveVisually, 'name', { value: 'tt', configurable: true });
        Object.defineProperty(getHandlers, 'name', { value: 'rt', configurable: true });
        Object.defineProperty(off, 'name', { value: 'ot', configurable: true });
        Object.defineProperty(signal, 'name', { value: 'at', configurable: true });
        Object.defineProperty(signalDOMEvent, 'name', { value: 'st', configurable: true });
        Object.defineProperty(signalCursorActivity, 'name', { value: 'lt', configurable: true });
        Object.defineProperty(hasHandler, 'name', { value: 'ct', configurable: true });
        Object.defineProperty(eventMixin, 'name', { value: 'dt', configurable: true });
        Object.defineProperty(e_preventDefault, 'name', { value: 'ut', configurable: true });
        Object.defineProperty(e_stopPropagation, 'name', { value: 'ht', configurable: true });
        Object.defineProperty(e_defaultPrevented, 'name', { value: 'pt', configurable: true });
        Object.defineProperty(e_stop, 'name', { value: 'ft', configurable: true });
        Object.defineProperty(e_target, 'name', { value: 'mt', configurable: true });
        Object.defineProperty(e_button, 'name', { value: 'gt', configurable: true });
        Object.defineProperty(zeroWidthElement, 'name', { value: 'wt', configurable: true });
        Object.defineProperty(hasBadBidiRects, 'name', { value: 'xt', configurable: true });
        Object.defineProperty(resolveMode, 'name', { value: 'At', configurable: true });
        Object.defineProperty(getMode, 'name', { value: 'Mt', configurable: true });
        Object.defineProperty(extendMode, 'name', { value: 'Nt', configurable: true });
        Object.defineProperty(copyState, 'name', { value: 'Dt', configurable: true });
        Object.defineProperty(innerMode, 'name', { value: 'Rt', configurable: true });
        Object.defineProperty(startState, 'name', { value: 'Bt', configurable: true });
        Object.defineProperty(highlightLine, 'name', { value: 'It', configurable: true });
        Object.defineProperty(getLineStyles, 'name', { value: 'Ot', configurable: true });
        Object.defineProperty(getStateBefore, 'name', { value: '$t', configurable: true });
        Object.defineProperty(processLine, 'name', { value: 'Ht', configurable: true });
        Object.defineProperty(callBlankLine, 'name', { value: 'Ut', configurable: true });
        Object.defineProperty(readToken, 'name', { value: 'jt', configurable: true });
        Object.defineProperty(readTokenAtPosition, 'name', { value: 'qt', configurable: true });
        Object.defineProperty(extractLineClasses, 'name', { value: 'Wt', configurable: true });
        Object.defineProperty(highlightLineTokens, 'name', { value: 'zt', configurable: true });
        Object.defineProperty(cleanUpLine, 'name', { value: 'Jt', configurable: true });
        Object.defineProperty(interpretTokenStyle, 'name', { value: 'Gt', configurable: true });
        Object.defineProperty(buildLineContent, 'name', { value: 'Qt', configurable: true });
        Object.defineProperty(defaultSpecialCharPlaceholder, 'name', {
          value: 'Xt',
          configurable: true,
        });
        Object.defineProperty(buildToken, 'name', { value: 'Zt', configurable: true });
        Object.defineProperty(buildTokenBadBidi, 'name', { value: 'en', configurable: true });
        Object.defineProperty(buildCollapsedSpan, 'name', { value: 'tn', configurable: true });
        Object.defineProperty(insertLineContent, 'name', { value: 'nn', configurable: true });
        Object.defineProperty(LineView, 'name', { value: 'rn', configurable: true });
        Object.defineProperty(buildViewArray, 'name', { value: 'on', configurable: true });
        Object.defineProperty(signalLater, 'name', { value: 'ln', configurable: true });
        Object.defineProperty(fireOrphanDelayed, 'name', { value: 'cn', configurable: true });
        Object.defineProperty(updateLineForChanges, 'name', { value: 'dn', configurable: true });
        Object.defineProperty(ensureLineWrapped, 'name', { value: 'un', configurable: true });
        Object.defineProperty(getLineContent, 'name', { value: 'hn', configurable: true });
        Object.defineProperty(updateLineText, 'name', { value: 'pn', configurable: true });
        Object.defineProperty(updateLineClasses, 'name', { value: 'fn', configurable: true });
        Object.defineProperty(updateLineGutter, 'name', { value: 'mn', configurable: true });
        Object.defineProperty(updateLineWidgets, 'name', { value: 'gn', configurable: true });
        Object.defineProperty(buildLineElement, 'name', { value: 'vn', configurable: true });
        Object.defineProperty(insertLineWidgets, 'name', { value: 'yn', configurable: true });
        Object.defineProperty(insertLineWidgetsFor, 'name', { value: 'bn', configurable: true });
        Object.defineProperty(positionLineWidget, 'name', { value: 'wn', configurable: true });
        Object.defineProperty(widgetHeight, 'name', { value: 'xn', configurable: true });
        Object.defineProperty(eventInWidget, 'name', { value: 'Cn', configurable: true });
        Object.defineProperty(paddingTop, 'name', { value: 'Fn', configurable: true });
        Object.defineProperty(paddingVert, 'name', { value: 'Sn', configurable: true });
        Object.defineProperty(paddingH, 'name', { value: 'kn', configurable: true });
        Object.defineProperty(scrollGap, 'name', { value: 'En', configurable: true });
        Object.defineProperty(displayWidth, 'name', { value: 'Tn', configurable: true });
        Object.defineProperty(displayHeight, 'name', { value: '_n', configurable: true });
        Object.defineProperty(mapFromLineView, 'name', { value: 'An', configurable: true });
        Object.defineProperty(measureChar, 'name', { value: 'Mn', configurable: true });
        Object.defineProperty(findViewForLine, 'name', { value: 'Ln', configurable: true });
        Object.defineProperty(prepareMeasureForLine, 'name', { value: 'Nn', configurable: true });
        Object.defineProperty(measureCharPrepared, 'name', { value: 'Dn', configurable: true });
        Object.defineProperty(nodeAndOffsetInLineMap, 'name', { value: 'Pn', configurable: true });
        Object.defineProperty(getUsefulRect, 'name', { value: 'In', configurable: true });
        Object.defineProperty(clearLineMeasurementCacheFor, 'name', {
          value: 'On',
          configurable: true,
        });
        Object.defineProperty(clearLineMeasurementCache, 'name', {
          value: '$n',
          configurable: true,
        });
        Object.defineProperty(clearCaches, 'name', { value: 'Hn', configurable: true });
        Object.defineProperty(pageScrollX, 'name', { value: 'Un', configurable: true });
        Object.defineProperty(pageScrollY, 'name', { value: 'jn', configurable: true });
        Object.defineProperty(intoCoordSystem, 'name', { value: 'qn', configurable: true });
        Object.defineProperty(fromCoordSystem, 'name', { value: 'Wn', configurable: true });
        Object.defineProperty(charCoords, 'name', { value: 'zn', configurable: true });
        Object.defineProperty(cursorCoords, 'name', { value: 'Vn', configurable: true });
        Object.defineProperty(estimateCoords, 'name', { value: 'Jn', configurable: true });
        Object.defineProperty(PosWithInfo, 'name', { value: 'Kn', configurable: true });
        Object.defineProperty(coordsChar, 'name', { value: 'Yn', configurable: true });
        Object.defineProperty(wrappedLineExtent, 'name', { value: 'Gn', configurable: true });
        Object.defineProperty(wrappedLineExtentChar, 'name', { value: 'Qn', configurable: true });
        Object.defineProperty(coordsCharInner, 'name', { value: 'Xn', configurable: true });
        Object.defineProperty(textHeight, 'name', { value: 'Zn', configurable: true });
        Object.defineProperty(charWidth, 'name', { value: 'ei', configurable: true });
        Object.defineProperty(getDimensions, 'name', { value: 'ti', configurable: true });
        Object.defineProperty(compensateForHScroll, 'name', { value: 'ni', configurable: true });
        Object.defineProperty(estimateHeight, 'name', { value: 'ii', configurable: true });
        Object.defineProperty(estimateLineHeights, 'name', { value: 'ri', configurable: true });
        Object.defineProperty(posFromMouse, 'name', { value: 'oi', configurable: true });
        Object.defineProperty(findViewIndex, 'name', { value: 'ai', configurable: true });
        Object.defineProperty(updateSelection, 'name', { value: 'si', configurable: true });
        Object.defineProperty(prepareSelection, 'name', { value: 'li', configurable: true });
        Object.defineProperty(drawSelectionCursor, 'name', { value: 'ci', configurable: true });
        Object.defineProperty(drawSelectionRange, 'name', { value: 'di', configurable: true });
        Object.defineProperty(restartBlink, 'name', { value: 'ui', configurable: true });
        Object.defineProperty(ensureFocus, 'name', { value: 'hi', configurable: true });
        Object.defineProperty(delayBlurEvent, 'name', { value: 'pi', configurable: true });
        Object.defineProperty(onFocus, 'name', { value: 'fi', configurable: true });
        Object.defineProperty(onBlur, 'name', { value: 'mi', configurable: true });
        Object.defineProperty(updateHeightsInViewport, 'name', { value: 'gi', configurable: true });
        Object.defineProperty(updateWidgetHeight, 'name', { value: 'vi', configurable: true });
        Object.defineProperty(visibleLines, 'name', { value: 'yi', configurable: true });
        Object.defineProperty(alignHorizontally, 'name', { value: 'bi', configurable: true });
        Object.defineProperty(maybeUpdateLineNumberWidth, 'name', {
          value: 'wi',
          configurable: true,
        });
        Object.defineProperty(calculateScrollPos, 'name', { value: 'xi', configurable: true });
        Object.defineProperty(addToScrollTop, 'name', { value: 'Ci', configurable: true });
        Object.defineProperty(ensureCursorVisible, 'name', { value: 'Fi', configurable: true });
        Object.defineProperty(scrollToCoords, 'name', { value: 'Si', configurable: true });
        Object.defineProperty(resolveScrollToPos, 'name', { value: 'ki', configurable: true });
        Object.defineProperty(scrollToCoordsRange, 'name', { value: 'Ei', configurable: true });
        Object.defineProperty(updateScrollTop, 'name', { value: 'Ti', configurable: true });
        Object.defineProperty(setScrollTop, 'name', { value: '_i', configurable: true });
        Object.defineProperty(setScrollLeft, 'name', { value: 'Ai', configurable: true });
        Object.defineProperty(measureForScrollbars, 'name', { value: 'Mi', configurable: true });
        Object.defineProperty(updateScrollbars, 'name', { value: 'Di', configurable: true });
        Object.defineProperty(updateScrollbarsInner, 'name', { value: 'Ri', configurable: true });
        Object.defineProperty(initScrollbars, 'name', { value: 'Pi', configurable: true });
        Object.defineProperty(startOperation, 'name', { value: 'Oi', configurable: true });
        Object.defineProperty(endOperation, 'name', { value: '$i', configurable: true });
        Object.defineProperty(endOperation_R1, 'name', { value: 'Hi', configurable: true });
        Object.defineProperty(endOperation_R2, 'name', { value: 'Ui', configurable: true });
        Object.defineProperty(endOperation_W2, 'name', { value: 'ji', configurable: true });
        Object.defineProperty(endOperation_finish, 'name', { value: 'qi', configurable: true });
        Object.defineProperty(runInOp, 'name', { value: 'Wi', configurable: true });
        Object.defineProperty(operation, 'name', { value: 'zi', configurable: true });
        Object.defineProperty(methodOp, 'name', { value: 'Vi', configurable: true });
        Object.defineProperty(docMethodOp, 'name', { value: 'Ji', configurable: true });
        Object.defineProperty(regChange, 'name', { value: 'Ki', configurable: true });
        Object.defineProperty(regLineChange, 'name', { value: 'Yi', configurable: true });
        Object.defineProperty(resetView, 'name', { value: 'Gi', configurable: true });
        Object.defineProperty(viewCuttingPoint, 'name', { value: 'Qi', configurable: true });
        Object.defineProperty(countDirtyView, 'name', { value: 'Xi', configurable: true });
        Object.defineProperty(startWorker, 'name', { value: 'Zi', configurable: true });
        Object.defineProperty(highlightWorker, 'name', { value: 'er', configurable: true });
        Object.defineProperty(updateDisplayIfNeeded, 'name', { value: 'nr', configurable: true });
        Object.defineProperty(postUpdateDisplay, 'name', { value: 'ir', configurable: true });
        Object.defineProperty(updateDisplaySimple, 'name', { value: 'rr', configurable: true });
        Object.defineProperty(updateGutterSpace, 'name', { value: 'or', configurable: true });
        Object.defineProperty(setDocumentHeight, 'name', { value: 'ar', configurable: true });
        Object.defineProperty(updateGutters, 'name', { value: 'sr', configurable: true });
        Object.defineProperty(setGuttersForLineNumbers, 'name', {
          value: 'lr',
          configurable: true,
        });
        Object.defineProperty(wheelEventDelta, 'name', { value: 'ur', configurable: true });
        Object.defineProperty(wheelEventPixels, 'name', { value: 'hr', configurable: true });
        Object.defineProperty(onScrollWheel, 'name', { value: 'pr', configurable: true });
        Object.defineProperty(normalizeSelection, 'name', { value: 'gr', configurable: true });
        Object.defineProperty(simpleSelection, 'name', { value: 'vr', configurable: true });
        Object.defineProperty(changeEnd, 'name', { value: 'yr', configurable: true });
        Object.defineProperty(adjustForChange, 'name', { value: 'br', configurable: true });
        Object.defineProperty(computeSelAfterChange, 'name', { value: 'wr', configurable: true });
        Object.defineProperty(offsetPos, 'name', { value: 'xr', configurable: true });
        Object.defineProperty(loadMode, 'name', { value: 'Cr', configurable: true });
        Object.defineProperty(resetModeState, 'name', { value: 'Fr', configurable: true });
        Object.defineProperty(isWholeLineUpdate, 'name', { value: 'Sr', configurable: true });
        Object.defineProperty(updateDoc, 'name', { value: 'kr', configurable: true });
        Object.defineProperty(linkedDocs, 'name', { value: 'Er', configurable: true });
        Object.defineProperty(attachDoc, 'name', { value: 'Tr', configurable: true });
        Object.defineProperty(setDirectionClass, 'name', { value: '_r', configurable: true });
        Object.defineProperty(History, 'name', { value: 'Ar', configurable: true });
        Object.defineProperty(historyChangeFromChange, 'name', { value: 'Mr', configurable: true });
        Object.defineProperty(clearSelectionEvents, 'name', { value: 'Lr', configurable: true });
        Object.defineProperty(copyEditorHistoryChange, 'name', { value: 'Nr', configurable: true });
        Object.defineProperty(buildEditorHistoryCommand, 'name', {
          value: 'Dr',
          configurable: true,
        });
        Object.defineProperty(addChangeToHistory, 'name', { value: 'Rr', configurable: true });
        Object.defineProperty(addSelectionToHistory, 'name', { value: 'Br', configurable: true });
        Object.defineProperty(pushSelectionToHistory, 'name', { value: 'Pr', configurable: true });
        Object.defineProperty(attachLocalSpans, 'name', { value: 'Ir', configurable: true });
        Object.defineProperty(removeClearedSpans, 'name', { value: 'Or', configurable: true });
        Object.defineProperty(mergeOldSpans, 'name', { value: '$r', configurable: true });
        Object.defineProperty(copyHistoryArray, 'name', { value: 'Hr', configurable: true });
        Object.defineProperty(extendRange, 'name', { value: 'Ur', configurable: true });
        Object.defineProperty(extendSelection, 'name', { value: 'jr', configurable: true });
        Object.defineProperty(extendSelections, 'name', { value: 'qr', configurable: true });
        Object.defineProperty(replaceOneSelection, 'name', { value: 'Wr', configurable: true });
        Object.defineProperty(setSimpleSelection, 'name', { value: 'zr', configurable: true });
        Object.defineProperty(setSelectionReplaceHistory, 'name', {
          value: 'Vr',
          configurable: true,
        });
        Object.defineProperty(setSelection, 'name', { value: 'Jr', configurable: true });
        Object.defineProperty(setSelectionNoUndo, 'name', { value: 'Kr', configurable: true });
        Object.defineProperty(setSelectionInner, 'name', { value: 'Yr', configurable: true });
        Object.defineProperty(reCheckSelection, 'name', { value: 'Gr', configurable: true });
        Object.defineProperty(skipAtomicInSelection, 'name', { value: 'Qr', configurable: true });
        Object.defineProperty(skipAtomicInner, 'name', { value: 'Xr', configurable: true });
        Object.defineProperty(skipAtomic, 'name', { value: 'Zr', configurable: true });
        Object.defineProperty(movePos, 'name', { value: 'eo', configurable: true });
        Object.defineProperty(selectAll, 'name', { value: 'to', configurable: true });
        Object.defineProperty(filterChange, 'name', { value: 'no', configurable: true });
        Object.defineProperty(makeChange, 'name', { value: 'io', configurable: true });
        Object.defineProperty(makeChangeInner, 'name', { value: 'ro', configurable: true });
        Object.defineProperty(makeChangeFromHistory, 'name', { value: 'oo', configurable: true });
        Object.defineProperty(shiftDoc, 'name', { value: 'ao', configurable: true });
        Object.defineProperty(makeChangeSingleDoc, 'name', { value: 'so', configurable: true });
        Object.defineProperty(replaceRange, 'name', { value: 'lo', configurable: true });
        Object.defineProperty(rebaseHistSelSingle, 'name', { value: 'co', configurable: true });
        Object.defineProperty(rebaseHistArray, 'name', { value: 'uo', configurable: true });
        Object.defineProperty(rebaseHist, 'name', { value: 'ho', configurable: true });
        Object.defineProperty(changeLine, 'name', { value: 'po', configurable: true });
        Object.defineProperty(adjustScrollWhenAboveVisible, 'name', {
          value: 'vo',
          configurable: true,
        });
        Object.defineProperty(markText, 'name', { value: 'wo', configurable: true });
        Object.defineProperty(findSharedMarkers, 'name', { value: 'Co', configurable: true });
        Object.defineProperty(detachSharedMarkers, 'name', { value: 'Fo', configurable: true });
        Object.defineProperty(onDrop, 'name', { value: 'To', configurable: true });
        Object.defineProperty(clearDragCursor, 'name', { value: '_o', configurable: true });
        Object.defineProperty(forEachCodeMirror, 'name', { value: 'Ao', configurable: true });
        Object.defineProperty(registerGlobalHandlers, 'name', { value: 'Lo', configurable: true });
        Object.defineProperty(onResize, 'name', { value: 'No', configurable: true });
        Object.defineProperty(normalizeKeyName, 'name', { value: 'Oo', configurable: true });
        Object.defineProperty(normalizeKeyMap, 'name', { value: '$o', configurable: true });
        Object.defineProperty(lookupKey, 'name', { value: 'Ho', configurable: true });
        Object.defineProperty(isModifierKey, 'name', { value: 'Uo', configurable: true });
        Object.defineProperty(keyName, 'name', { value: 'jo', configurable: true });
        Object.defineProperty(getKeyMap, 'name', { value: 'qo', configurable: true });
        Object.defineProperty(deleteNearSelection, 'name', { value: 'Wo', configurable: true });
        Object.defineProperty(lineStart, 'name', { value: 'Vo', configurable: true });
        Object.defineProperty(lineStartSmart, 'name', { value: 'Jo', configurable: true });
        Object.defineProperty(doHandleBinding, 'name', { value: 'Ko', configurable: true });
        Object.defineProperty(dispatchKey, 'name', { value: 'Go', configurable: true });
        Object.defineProperty(handleKeyBinding, 'name', { value: 'Qo', configurable: true });
        Object.defineProperty(onKeyDown, 'name', { value: 'ta', configurable: true });
        Object.defineProperty(onKeyUp, 'name', { value: 'na', configurable: true });
        Object.defineProperty(onKeyPress, 'name', { value: 'ia', configurable: true });
        Object.defineProperty(onMouseDown, 'name', { value: 'ra', configurable: true });
        Object.defineProperty(gutterEvent, 'name', { value: 'oa', configurable: true });
        Object.defineProperty(clickInGutter, 'name', { value: 'aa', configurable: true });
        Object.defineProperty(onContextMenu, 'name', { value: 'sa', configurable: true });
        Object.defineProperty(themeChanged, 'name', { value: 'la', configurable: true });
        Object.defineProperty(updateGutterGeometry, 'name', { value: 'ha', configurable: true });
        Object.defineProperty(dragDropChanged, 'name', { value: 'pa', configurable: true });
        Object.defineProperty(wrappingChanged, 'name', { value: 'fa', configurable: true });
        Object.defineProperty(CodeMirror, 'name', { value: 'ma', configurable: true });
        Object.defineProperty(indentLine, 'name', { value: 'va', configurable: true });
        Object.defineProperty(setLastCopied, 'name', { value: 'ba', configurable: true });
        Object.defineProperty(applyTextInput, 'name', { value: 'wa', configurable: true });
        Object.defineProperty(handlePaste, 'name', { value: 'xa', configurable: true });
        Object.defineProperty(triggerElectric, 'name', { value: 'Ca', configurable: true });
        Object.defineProperty(copyableRanges, 'name', { value: 'Fa', configurable: true });
        Object.defineProperty(disableBrowserMagic, 'name', { value: 'Sa', configurable: true });
        Object.defineProperty(hiddenTextarea, 'name', { value: 'ka', configurable: true });
        Object.defineProperty(findPosH, 'name', { value: 'Ea', configurable: true });
        Object.defineProperty(findPosV, 'name', { value: 'Ta', configurable: true });
        Object.defineProperty(posToDOM, 'name', { value: 'Aa', configurable: true });
        Object.defineProperty(markBadPosition, 'name', { value: 'Ma', configurable: true });
        Object.defineProperty(domToPos, 'name', { value: 'La', configurable: true });
        Object.defineProperty(domToPosInLine, 'name', { value: 'Na', configurable: true });

        var userAgent = navigator.userAgent,
          platform = navigator.platform,
          gecko = /gecko\/\d/i.test(userAgent),
          ie_upto10 = /MSIE \d/.test(userAgent),
          ie_11up = /Trident\/(?:[7-9]|\d{2,})\..*rv:(\d+)/.exec(userAgent),
          edge = /Edge\/(\d+)/.exec(userAgent),
          isInternetExplorer = ie_upto10 || ie_11up || edge,
          ie_version =
            isInternetExplorer && (ie_upto10 ? document.documentMode || 6 : +(edge || ie_11up)[1]),
          webkit = !edge && /WebKit\//.test(userAgent),
          qtwebkit = webkit && /Qt\/\d+\.\d+/.test(userAgent),
          chrome = !edge && /Chrome\//.test(userAgent),
          presto = /Opera\//.test(userAgent),
          safari = /Apple Computer/.test(navigator.vendor),
          mac_geMountainLion = /Mac OS X 1\d\D([8-9]|\d\d)\D/.test(userAgent),
          phantom = /PhantomJS/.test(userAgent),
          ios = !edge && /AppleWebKit/.test(userAgent) && /Mobile\/\w+/.test(userAgent),
          android = /Android/.test(userAgent),
          mobile =
            ios || android || /webOS|BlackBerry|Opera Mini|Opera Mobi|IEMobile/i.test(userAgent),
          mac = ios || /Mac/.test(platform),
          chromeOS = /\bCrOS\b/.test(userAgent),
          windows = /win/i.test(platform),
          presto_version = presto && userAgent.match(/Version\/(\d*\.\d*)/);
        if (presto_version) {
          presto_version = Number(presto_version[1]);
        }
        if (presto_version && presto_version >= 15) {
          presto = false;
          webkit = true;
        }
        var flipCtrlCmd =
            mac && (qtwebkit || (presto && (null == presto_version || presto_version < 12.11))),
          captureRightClick = gecko || (isInternetExplorer && ie_version >= 9);
        function classTest(cls) {
          return new RegExp('(^|\\s)' + cls + '(?:$|\\s)\\s*');
        }
        var range,
          rmClass = Object.defineProperty(
            function (node, cls) {
              var current = node.className,
                match = classTest(cls).exec(current);
              if (match) {
                var after = current.slice(match.index + match[0].length);
                node.className = current.slice(0, match.index) + (after ? match[1] + after : '');
              }
            },
            'name',
            { value: 'E', configurable: true },
          );
        function removeChildren(element) {
          for (var count = element.childNodes.length; count > 0; --count) {
            element.removeChild(element.firstChild);
          }
          return element;
        }
        function removeChildrenAndAdd(parent, content) {
          return removeChildren(parent).appendChild(content);
        }
        function createElement(tag, content, className, style) {
          var element = document.createElement(tag);
          if (className) {
            element.className = className;
          }
          if (style) {
            element.style.cssText = style;
          }
          if ('string' == typeof content) {
            element.appendChild(document.createTextNode(content));
          } else {
            if (content) {
              for (var childIndex = 0; childIndex < content.length; ++childIndex) {
                element.appendChild(content[childIndex]);
              }
            }
          }
          return element;
        }
        function eltP(tag, content, className, style) {
          var element = createElement(tag, content, className, style);
          element.setAttribute('role', 'presentation');
          return element;
        }
        function contains(parent, child) {
          if (3 == child.nodeType) {
            child = child.parentNode;
          }
          if (parent.contains) {
            return parent.contains(child);
          }
          do {
            if (11 == child.nodeType) {
              child = child.host;
            }
            if (child == parent) {
              return true;
            }
          } while ((child = child.parentNode));
        }
        function activeElt() {
          var activeElement;
          try {
            activeElement = document.activeElement;
          } catch (focusAccessError) {
            activeElement = document.body || null;
          }
          for (
            ;
            activeElement && activeElement.shadowRoot && activeElement.shadowRoot.activeElement;
          ) {
            activeElement = activeElement.shadowRoot.activeElement;
          }
          return activeElement;
        }
        function addClass(node, cls) {
          var current = node.className;
          if (!classTest(cls).test(current)) {
            node.className += (current ? ' ' : '') + cls;
          }
        }
        function joinClasses(classNames, existingClasses) {
          for (
            var classes = classNames.split(' '), classIndex = 0;
            classIndex < classes.length;
            classIndex++
          ) {
            if (classes[classIndex] && !classTest(classes[classIndex]).test(existingClasses)) {
              existingClasses += ' ' + classes[classIndex];
            }
          }
          return existingClasses;
        }
        range = document.createRange
          ? function (startNode, startOffset, endOffset, endNode) {
              var range = document.createRange();
              range.setEnd(endNode || startNode, endOffset);
              range.setStart(startNode, startOffset);
              return range;
            }
          : function (textNode, startOffset, endOffset) {
              var textRange = document.body.createTextRange();
              try {
                textRange.moveToElementText(textNode.parentNode);
              } catch (rangeError) {
                return textRange;
              }
              textRange.collapse(true);
              textRange.moveEnd('character', endOffset);
              textRange.moveStart('character', startOffset);
              return textRange;
            };
        var selectInput = Object.defineProperty(
          function (node) {
            node.select();
          },
          'name',
          { value: 'B', configurable: true },
        );
        function bind(callback) {
          var args = Array.prototype.slice.call(arguments, 1);
          return function () {
            return callback.apply(null, args);
          };
        }
        function copyObj(object, target, overwrite) {
          for (var prop in (target || (target = {}), object)) {
            if (
              !(
                !object.hasOwnProperty(prop) ||
                (false === overwrite && target.hasOwnProperty(prop))
              )
            ) {
              target[prop] = object[prop];
            }
          }
          return target;
        }
        function countColumn(string, end, tabSize, startIndex, startValue) {
          if (null == end && -1 == (end = string.search(/[^\s\u00a0]/))) {
            end = string.length;
          }
          for (var characterIndex = startIndex || 0, visualColumn = startValue || 0; ; ) {
            var nextTab = string.indexOf('\t', characterIndex);
            if (nextTab < 0 || nextTab >= end) {
              return visualColumn + (end - characterIndex);
            }
            visualColumn += nextTab - characterIndex;
            visualColumn += tabSize - (visualColumn % tabSize);
            characterIndex = nextTab + 1;
          }
        }
        if (ios) {
          selectInput = Object.defineProperty(
            function (inputElement) {
              inputElement.selectionStart = 0;
              inputElement.selectionEnd = inputElement.value.length;
            },
            'name',
            { value: 'B', configurable: true },
          );
        } else {
          if (isInternetExplorer) {
            selectInput = Object.defineProperty(
              function (inputElement) {
                try {
                  inputElement.select();
                } catch (selectionError) {}
              },
              'name',
              { value: 'B', configurable: true },
            );
          }
        }
        var Delayed = Object.defineProperty(
          function () {
            this.id = null;
          },
          'name',
          { value: '$', configurable: true },
        );
        function indexOf(array, element) {
          for (var itemIndex = 0; itemIndex < array.length; ++itemIndex) {
            if (array[itemIndex] == element) {
              return itemIndex;
            }
          }
          return -1;
        }
        Delayed.prototype.set = function (delayMs, callback) {
          clearTimeout(this.id);
          this.id = setTimeout(callback, delayMs);
        };
        var scrollerGap = 0,
          Pass = {
            toString: function () {
              return 'CodeMirror.Pass';
            },
          },
          sel_dontScroll = { scroll: false },
          sel_mouse = { origin: '*mouse' },
          sel_move = { origin: '+move' };
        function findColumn(string, goal, tabSize) {
          for (var position = 0, col = 0; ; ) {
            var nextTab = string.indexOf('\t', position);
            if (-1 == nextTab) {
              nextTab = string.length;
            }
            var skipped = nextTab - position;
            if (nextTab == string.length || col + skipped >= goal) {
              return position + Math.min(skipped, goal - col);
            }
            col += nextTab - position;
            position = nextTab + 1;
            if ((col += tabSize - (col % tabSize)) >= goal) {
              return position;
            }
          }
        }
        var spaceStrs = [''];
        function spaceStr(spaceCount) {
          for (; spaceStrs.length <= spaceCount; ) {
            spaceStrs.push(lst(spaceStrs) + ' ');
          }
          return spaceStrs[spaceCount];
        }
        function lst(items) {
          return items[items.length - 1];
        }
        function map(array, callback) {
          for (var out = [], itemIndex = 0; itemIndex < array.length; itemIndex++) {
            out[itemIndex] = callback(array[itemIndex], itemIndex);
          }
          return out;
        }
        function nothing() {}
        function createObj(base, props) {
          var inst;
          if (Object.create) {
            inst = Object.create(base);
          } else {
            nothing.prototype = base;
            inst = new nothing();
          }
          if (props) {
            copyObj(props, inst);
          }
          return inst;
        }
        var nonASCIISingleCaseWordChar =
          /[\u00df\u0587\u0590-\u05f4\u0600-\u06ff\u3040-\u309f\u30a0-\u30ff\u3400-\u4db5\u4e00-\u9fcc\uac00-\ud7af]/;
        function isWordCharBasic(character) {
          return (
            /\w/.test(character) ||
            (character > '' &&
              (character.toUpperCase() != character.toLowerCase() ||
                nonASCIISingleCaseWordChar.test(character)))
          );
        }
        function isWordChar(character, helper) {
          if (helper) {
            return (
              !!(helper.source.indexOf('\\w') > -1 && isWordCharBasic(character)) ||
              helper.test(character)
            );
          } else {
            return isWordCharBasic(character);
          }
        }
        function isEmpty(object) {
          for (var propertyName in object) {
            if (object.hasOwnProperty(propertyName) && object[propertyName]) {
              return false;
            }
          }
          return true;
        }
        var extendingChars =
          /[\u0300-\u036f\u0483-\u0489\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7\u0610-\u061a\u064b-\u065e\u0670\u06d6-\u06dc\u06de-\u06e4\u06e7\u06e8\u06ea-\u06ed\u0711\u0730-\u074a\u07a6-\u07b0\u07eb-\u07f3\u0816-\u0819\u081b-\u0823\u0825-\u0827\u0829-\u082d\u0900-\u0902\u093c\u0941-\u0948\u094d\u0951-\u0955\u0962\u0963\u0981\u09bc\u09be\u09c1-\u09c4\u09cd\u09d7\u09e2\u09e3\u0a01\u0a02\u0a3c\u0a41\u0a42\u0a47\u0a48\u0a4b-\u0a4d\u0a51\u0a70\u0a71\u0a75\u0a81\u0a82\u0abc\u0ac1-\u0ac5\u0ac7\u0ac8\u0acd\u0ae2\u0ae3\u0b01\u0b3c\u0b3e\u0b3f\u0b41-\u0b44\u0b4d\u0b56\u0b57\u0b62\u0b63\u0b82\u0bbe\u0bc0\u0bcd\u0bd7\u0c3e-\u0c40\u0c46-\u0c48\u0c4a-\u0c4d\u0c55\u0c56\u0c62\u0c63\u0cbc\u0cbf\u0cc2\u0cc6\u0ccc\u0ccd\u0cd5\u0cd6\u0ce2\u0ce3\u0d3e\u0d41-\u0d44\u0d4d\u0d57\u0d62\u0d63\u0dca\u0dcf\u0dd2-\u0dd4\u0dd6\u0ddf\u0e31\u0e34-\u0e3a\u0e47-\u0e4e\u0eb1\u0eb4-\u0eb9\u0ebb\u0ebc\u0ec8-\u0ecd\u0f18\u0f19\u0f35\u0f37\u0f39\u0f71-\u0f7e\u0f80-\u0f84\u0f86\u0f87\u0f90-\u0f97\u0f99-\u0fbc\u0fc6\u102d-\u1030\u1032-\u1037\u1039\u103a\u103d\u103e\u1058\u1059\u105e-\u1060\u1071-\u1074\u1082\u1085\u1086\u108d\u109d\u135f\u1712-\u1714\u1732-\u1734\u1752\u1753\u1772\u1773\u17b7-\u17bd\u17c6\u17c9-\u17d3\u17dd\u180b-\u180d\u18a9\u1920-\u1922\u1927\u1928\u1932\u1939-\u193b\u1a17\u1a18\u1a56\u1a58-\u1a5e\u1a60\u1a62\u1a65-\u1a6c\u1a73-\u1a7c\u1a7f\u1b00-\u1b03\u1b34\u1b36-\u1b3a\u1b3c\u1b42\u1b6b-\u1b73\u1b80\u1b81\u1ba2-\u1ba5\u1ba8\u1ba9\u1c2c-\u1c33\u1c36\u1c37\u1cd0-\u1cd2\u1cd4-\u1ce0\u1ce2-\u1ce8\u1ced\u1dc0-\u1de6\u1dfd-\u1dff\u200c\u200d\u20d0-\u20f0\u2cef-\u2cf1\u2de0-\u2dff\u302a-\u302f\u3099\u309a\ua66f-\ua672\ua67c\ua67d\ua6f0\ua6f1\ua802\ua806\ua80b\ua825\ua826\ua8c4\ua8e0-\ua8f1\ua926-\ua92d\ua947-\ua951\ua980-\ua982\ua9b3\ua9b6-\ua9b9\ua9bc\uaa29-\uaa2e\uaa31\uaa32\uaa35\uaa36\uaa43\uaa4c\uaab0\uaab2-\uaab4\uaab7\uaab8\uaabe\uaabf\uaac1\uabe5\uabe8\uabed\udc00-\udfff\ufb1e\ufe00-\ufe0f\ufe20-\ufe26\uff9e\uff9f]/;
        function isExtendingChar(character) {
          return character.charCodeAt(0) >= 768 && extendingChars.test(character);
        }
        function skipExtendingChars(str, position, dir) {
          for (
            ;
            (dir < 0 ? position > 0 : position < str.length) &&
            isExtendingChar(str.charAt(position));
          ) {
            position += dir;
          }
          return position;
        }
        function findFirst(pred, from, toIndex) {
          for (;;) {
            if (Math.abs(from - toIndex) <= 1) {
              if (pred(from)) {
                return from;
              } else {
                return toIndex;
              }
            }
            var mid = Math.floor((from + toIndex) / 2);
            if (pred(mid)) {
              toIndex = mid;
            } else {
              from = mid;
            }
          }
        }
        function getLine(documentModel, lineNumber) {
          if ((lineNumber -= documentModel.first) < 0 || lineNumber >= documentModel.size) {
            throw new Error(
              'There is no line ' + (lineNumber + documentModel.first) + ' in the document.',
            );
          }
          for (var chunk = documentModel; !chunk.lines; ) {
            for (var childIndex = 0; ; ++childIndex) {
              var child = chunk.children[childIndex],
                childSize = child.chunkSize();
              if (lineNumber < childSize) {
                chunk = child;
                break;
              }
              lineNumber -= childSize;
            }
          }
          return chunk.lines[lineNumber];
        }
        function getBetween(documentModel, start, end) {
          var out = [],
            lineNumber = start.line;
          documentModel.iter(start.line, end.line + 1, function (line) {
            var text = line.text;
            if (lineNumber == end.line) {
              text = text.slice(0, end.ch);
            }
            if (lineNumber == start.line) {
              text = text.slice(start.ch);
            }
            out.push(text);
            ++lineNumber;
          });
          return out;
        }
        function getLines(documentModel, from, toLine) {
          var out = [];
          documentModel.iter(from, toLine, function (line) {
            out.push(line.text);
          });
          return out;
        }
        function updateLineHeight(line, height) {
          var diff = height - line.height;
          if (diff) {
            for (var chunk = line; chunk; chunk = chunk.parent) {
              chunk.height += diff;
            }
          }
        }
        function lineNo(line) {
          if (null == line.parent) {
            return null;
          }
          for (
            var cur = line.parent, lineNumber = indexOf(cur.lines, line), chunk = cur.parent;
            chunk;
            cur = chunk, chunk = chunk.parent
          ) {
            for (var childIndex = 0; chunk.children[childIndex] != cur; ++childIndex) {
              lineNumber += chunk.children[childIndex].chunkSize();
            }
          }
          return lineNumber + cur.first;
        }
        function lineAtHeight(chunk, height) {
          var firstLine = chunk.first;
          e: do {
            for (var i$1 = 0; i$1 < chunk.children.length; ++i$1) {
              var child = chunk.children[i$1],
                childHeight = child.height;
              if (height < childHeight) {
                chunk = child;
                continue e;
              }
              height -= childHeight;
              firstLine += child.chunkSize();
            }
            return firstLine;
          } while (!chunk.lines);
          for (var lineIndex = 0; lineIndex < chunk.lines.length; ++lineIndex) {
            var lineHeight = chunk.lines[lineIndex].height;
            if (height < lineHeight) {
              break;
            }
            height -= lineHeight;
          }
          return firstLine + lineIndex;
        }
        function isLine(documentModel, lineNumber) {
          return (
            lineNumber >= documentModel.first &&
            lineNumber < documentModel.first + documentModel.size
          );
        }
        function lineNumberFor(options, lineNumber) {
          return String(options.lineNumberFormatter(lineNumber + options.firstLineNumber));
        }
        function Pos(line, characterOffset, sticky) {
          if (void 0 === sticky) {
            sticky = null;
          }
          if (!(this instanceof Pos)) {
            return new Pos(line, characterOffset, sticky);
          }
          this.line = line;
          this.ch = characterOffset;
          this.sticky = sticky;
        }
        function cmp(leftPosition, rightPosition) {
          return leftPosition.line - rightPosition.line || leftPosition.ch - rightPosition.ch;
        }
        function equalCursorPos(leftPosition, rightPosition) {
          return (
            leftPosition.sticky == rightPosition.sticky && 0 == cmp(leftPosition, rightPosition)
          );
        }
        function copyPos(position) {
          return Pos(position.line, position.ch);
        }
        function maxPos(leftPosition, rightPosition) {
          if (cmp(leftPosition, rightPosition) < 0) {
            return rightPosition;
          } else {
            return leftPosition;
          }
        }
        function minPos(leftPosition, rightPosition) {
          if (cmp(leftPosition, rightPosition) < 0) {
            return leftPosition;
          } else {
            return rightPosition;
          }
        }
        function clipLine(documentModel, lineNumber) {
          return Math.max(
            documentModel.first,
            Math.min(lineNumber, documentModel.first + documentModel.size - 1),
          );
        }
        function clipPos(documentModel, position) {
          if (position.line < documentModel.first) {
            return Pos(documentModel.first, 0);
          }
          var last = documentModel.first + documentModel.size - 1;
          if (position.line > last) {
            return Pos(last, getLine(documentModel, last).text.length);
          } else {
            return (function (position, linelen) {
              var characterOffset = position.ch;
              if (null == characterOffset || characterOffset > linelen) {
                return Pos(position.line, linelen);
              } else {
                if (characterOffset < 0) {
                  return Pos(position.line, 0);
                } else {
                  return position;
                }
              }
            })(position, getLine(documentModel, position.line).text.length);
          }
        }
        function clipPosArray(documentModel, array) {
          for (var out = [], positionIndex = 0; positionIndex < array.length; positionIndex++) {
            out[positionIndex] = clipPos(documentModel, array[positionIndex]);
          }
          return out;
        }
        var sawReadOnlySpans = false,
          sawCollapsedSpans = false;
        function MarkedSpan(marker, from, toOffset) {
          this.marker = marker;
          this.from = from;
          this.to = toOffset;
        }
        function getMarkedSpanFor(spans, marker) {
          if (spans) {
            for (var spanIndex = 0; spanIndex < spans.length; ++spanIndex) {
              var span = spans[spanIndex];
              if (span.marker == marker) {
                return span;
              }
            }
          }
        }
        function removeMarkedSpan(spans, span) {
          for (var remainingSpans, spanIndex = 0; spanIndex < spans.length; ++spanIndex) {
            if (spans[spanIndex] != span) {
              (remainingSpans || (remainingSpans = [])).push(spans[spanIndex]);
            }
          }
          return remainingSpans;
        }
        function stretchSpansOverChange(documentModel, change) {
          if (change.full) {
            return null;
          }
          var oldFirst =
              isLine(documentModel, change.from.line) &&
              getLine(documentModel, change.from.line).markedSpans,
            oldLast =
              isLine(documentModel, change.to.line) &&
              getLine(documentModel, change.to.line).markedSpans;
          if (!oldFirst && !oldLast) {
            return null;
          }
          var startCh = change.from.ch,
            endCh = change.to.ch,
            isInsert = 0 == cmp(change.from, change.to),
            first = (function (old, startCh, isInsert) {
              var resultSpans;
              if (old) {
                for (var spanIndex = 0; spanIndex < old.length; ++spanIndex) {
                  var span = old[spanIndex],
                    marker = span.marker;
                  if (
                    null == span.from ||
                    (marker.inclusiveLeft ? span.from <= startCh : span.from < startCh) ||
                    (span.from == startCh &&
                      'bookmark' == marker.type &&
                      (!isInsert || !span.marker.insertLeft))
                  ) {
                    var endsAfter =
                      null == span.to ||
                      (marker.inclusiveRight ? span.to >= startCh : span.to > startCh);
                    (resultSpans || (resultSpans = [])).push(
                      new MarkedSpan(marker, span.from, endsAfter ? null : span.to),
                    );
                  }
                }
              }
              return resultSpans;
            })(oldFirst, startCh, isInsert),
            last = (function (old, endCh, isInsert) {
              var resultSpans;
              if (old) {
                for (var spanIndex = 0; spanIndex < old.length; ++spanIndex) {
                  var span = old[spanIndex],
                    marker = span.marker;
                  if (
                    null == span.to ||
                    (marker.inclusiveRight ? span.to >= endCh : span.to > endCh) ||
                    (span.from == endCh &&
                      'bookmark' == marker.type &&
                      (!isInsert || span.marker.insertLeft))
                  ) {
                    var startsBefore =
                      null == span.from ||
                      (marker.inclusiveLeft ? span.from <= endCh : span.from < endCh);
                    (resultSpans || (resultSpans = [])).push(
                      new MarkedSpan(
                        marker,
                        startsBefore ? null : span.from - endCh,
                        null == span.to ? null : span.to - endCh,
                      ),
                    );
                  }
                }
              }
              return resultSpans;
            })(oldLast, endCh, isInsert),
            sameLine = 1 == change.text.length,
            offset = lst(change.text).length + (sameLine ? startCh : 0);
          if (first) {
            for (var spanIndex = 0; spanIndex < first.length; ++spanIndex) {
              var span = first[spanIndex];
              if (null == span.to) {
                var found = getMarkedSpanFor(last, span.marker);
                if (found) {
                  if (sameLine) {
                    span.to = null == found.to ? null : found.to + offset;
                  }
                } else {
                  span.to = startCh;
                }
              }
            }
          }
          if (last) {
            for (var i$1 = 0; i$1 < last.length; ++i$1) {
              var span$1 = last[i$1];
              if (null != span$1.to) {
                span$1.to += offset;
              }
              if (null == span$1.from) {
                if (!getMarkedSpanFor(first, span$1.marker)) {
                  span$1.from = offset;
                  if (sameLine) {
                    (first || (first = [])).push(span$1);
                  }
                }
              } else {
                span$1.from += offset;
                if (sameLine) {
                  (first || (first = [])).push(span$1);
                }
              }
            }
          }
          if (first) {
            first = clearEmptySpans(first);
          }
          if (last && last != first) {
            last = clearEmptySpans(last);
          }
          var newMarkers = [first];
          if (!sameLine) {
            var gapMarkers,
              lastInsertedLine = change.text.length - 2;
            if (lastInsertedLine > 0 && first) {
              for (var i$2 = 0; i$2 < first.length; ++i$2) {
                if (null == first[i$2].to) {
                  (gapMarkers || (gapMarkers = [])).push(
                    new MarkedSpan(first[i$2].marker, null, null),
                  );
                }
              }
            }
            for (var lineIndex = 0; lineIndex < lastInsertedLine; ++lineIndex) {
              newMarkers.push(gapMarkers);
            }
            newMarkers.push(last);
          }
          return newMarkers;
        }
        function clearEmptySpans(spans) {
          for (var spanIndex = 0; spanIndex < spans.length; ++spanIndex) {
            var span = spans[spanIndex];
            if (null != span.from && span.from == span.to && false !== span.marker.clearWhenEmpty) {
              spans.splice(spanIndex--, 1);
            }
          }
          if (spans.length) {
            return spans;
          } else {
            return null;
          }
        }
        function detachMarkedSpans(line) {
          var spans = line.markedSpans;
          if (spans) {
            for (var spanIndex = 0; spanIndex < spans.length; ++spanIndex) {
              spans[spanIndex].marker.detachLine(line);
            }
            line.markedSpans = null;
          }
        }
        function attachMarkedSpans(line, spans) {
          if (spans) {
            for (var spanIndex = 0; spanIndex < spans.length; ++spanIndex) {
              spans[spanIndex].marker.attachLine(line);
            }
            line.markedSpans = spans;
          }
        }
        function extraLeft(marker) {
          if (marker.inclusiveLeft) {
            return -1;
          } else {
            return 0;
          }
        }
        function extraRight(marker) {
          if (marker.inclusiveRight) {
            return 1;
          } else {
            return 0;
          }
        }
        function compareCollapsedMarkers(leftSpan, rightSpan) {
          var lenDiff = leftSpan.lines.length - rightSpan.lines.length;
          if (0 != lenDiff) {
            return lenDiff;
          }
          var aPos = leftSpan.find(),
            bPos = rightSpan.find(),
            fromCmp = cmp(aPos.from, bPos.from) || extraLeft(leftSpan) - extraLeft(rightSpan);
          if (fromCmp) {
            return -fromCmp;
          }
          var toCmp = cmp(aPos.to, bPos.to) || extraRight(leftSpan) - extraRight(rightSpan);
          return toCmp || rightSpan.id - leftSpan.id;
        }
        function collapsedSpanAtSide(line, start) {
          var found,
            sps = sawCollapsedSpans && line.markedSpans;
          if (sps) {
            for (var span = void 0, spanIndex = 0; spanIndex < sps.length; ++spanIndex) {
              if (
                (span = sps[spanIndex]).marker.collapsed &&
                null == (start ? span.from : span.to) &&
                (!found || compareCollapsedMarkers(found, span.marker) < 0)
              ) {
                found = span.marker;
              }
            }
          }
          return found;
        }
        function collapsedSpanAtStart(line) {
          return collapsedSpanAtSide(line, true);
        }
        function collapsedSpanAtEnd(line) {
          return collapsedSpanAtSide(line, false);
        }
        function conflictingCollapsedRange(documentModel, lineNo$$1, from, toLine, marker) {
          var line = getLine(documentModel, lineNo$$1),
            sps = sawCollapsedSpans && line.markedSpans;
          if (sps) {
            for (var spanIndex = 0; spanIndex < sps.length; ++spanIndex) {
              var span = sps[spanIndex];
              if (span.marker.collapsed) {
                var found = span.marker.find(0),
                  fromCmp = cmp(found.from, from) || extraLeft(span.marker) - extraLeft(marker),
                  toCmp = cmp(found.to, toLine) || extraRight(span.marker) - extraRight(marker);
                if (
                  !((fromCmp >= 0 && toCmp <= 0) || (fromCmp <= 0 && toCmp >= 0)) &&
                  ((fromCmp <= 0 &&
                    (span.marker.inclusiveRight && marker.inclusiveLeft
                      ? cmp(found.to, from) >= 0
                      : cmp(found.to, from) > 0)) ||
                    (fromCmp >= 0 &&
                      (span.marker.inclusiveRight && marker.inclusiveLeft
                        ? cmp(found.from, toLine) <= 0
                        : cmp(found.from, toLine) < 0)))
                ) {
                  return true;
                }
              }
            }
          }
        }
        function visualLine(line) {
          for (var merged; (merged = collapsedSpanAtStart(line)); ) {
            line = merged.find(-1, true).line;
          }
          return line;
        }
        function visualLineNo(documentModel, lineN) {
          var line = getLine(documentModel, lineN),
            vis = visualLine(line);
          if (line == vis) {
            return lineN;
          } else {
            return lineNo(vis);
          }
        }
        function visualLineEndNo(documentModel, lineN) {
          if (lineN > documentModel.lastLine()) {
            return lineN;
          }
          var merged,
            line = getLine(documentModel, lineN);
          if (!lineIsHidden(documentModel, line)) {
            return lineN;
          }
          for (; (merged = collapsedSpanAtEnd(line)); ) {
            line = merged.find(1, true).line;
          }
          return lineNo(line) + 1;
        }
        function lineIsHidden(documentModel, line) {
          var sps = sawCollapsedSpans && line.markedSpans;
          if (sps) {
            for (var span = void 0, spanIndex = 0; spanIndex < sps.length; ++spanIndex) {
              if ((span = sps[spanIndex]).marker.collapsed) {
                if (null == span.from) {
                  return true;
                }
                if (
                  !span.marker.widgetNode &&
                  0 == span.from &&
                  span.marker.inclusiveLeft &&
                  lineIsHiddenInner(documentModel, line, span)
                ) {
                  return true;
                }
              }
            }
          }
        }
        function lineIsHiddenInner(documentModel, line, span) {
          if (null == span.to) {
            var end = span.marker.find(1, true);
            return lineIsHiddenInner(
              documentModel,
              end.line,
              getMarkedSpanFor(end.line.markedSpans, span.marker),
            );
          }
          if (span.marker.inclusiveRight && span.to == line.text.length) {
            return true;
          }
          for (
            var otherSpan = void 0, spanIndex = 0;
            spanIndex < line.markedSpans.length;
            ++spanIndex
          ) {
            if (
              (otherSpan = line.markedSpans[spanIndex]).marker.collapsed &&
              !otherSpan.marker.widgetNode &&
              otherSpan.from == span.to &&
              (null == otherSpan.to || otherSpan.to != span.from) &&
              (otherSpan.marker.inclusiveLeft || span.marker.inclusiveRight) &&
              lineIsHiddenInner(documentModel, line, otherSpan)
            ) {
              return true;
            }
          }
        }
        function heightAtLine(lineObj) {
          for (
            var height = 0, chunk = (lineObj = visualLine(lineObj)).parent, childIndex = 0;
            childIndex < chunk.lines.length;
            ++childIndex
          ) {
            var line = chunk.lines[childIndex];
            if (line == lineObj) {
              break;
            }
            height += line.height;
          }
          for (
            var parentChunk = chunk.parent;
            parentChunk;
            parentChunk = (chunk = parentChunk).parent
          ) {
            for (var i$1 = 0; i$1 < parentChunk.children.length; ++i$1) {
              var cur = parentChunk.children[i$1];
              if (cur == chunk) {
                break;
              }
              height += cur.height;
            }
          }
          return height;
        }
        function lineLength(line) {
          if (0 == line.height) {
            return 0;
          }
          for (
            var merged, len = line.text.length, cur = line;
            (merged = collapsedSpanAtStart(cur));
          ) {
            var found = merged.find(0, true);
            cur = found.from.line;
            len += found.from.ch - found.to.ch;
          }
          for (cur = line; (merged = collapsedSpanAtEnd(cur)); ) {
            var found$1 = merged.find(0, true);
            len -= cur.text.length - found$1.from.ch;
            len += (cur = found$1.to.line).text.length - found$1.to.ch;
          }
          return len;
        }
        function findMaxLine(editor) {
          var display = editor.display,
            documentModel = editor.doc;
          display.maxLine = getLine(documentModel, documentModel.first);
          display.maxLineLength = lineLength(display.maxLine);
          display.maxLineChanged = true;
          documentModel.iter(function (line) {
            var len = lineLength(line);
            if (len > display.maxLineLength) {
              display.maxLineLength = len;
              display.maxLine = line;
            }
          });
        }
        var bidiOther = null;
        function getBidiPartAt(order, characterOffset, sticky) {
          var found;
          bidiOther = null;
          for (var spanIndex = 0; spanIndex < order.length; ++spanIndex) {
            var cur = order[spanIndex];
            if (cur.from < characterOffset && cur.to > characterOffset) {
              return spanIndex;
            }
            if (cur.to == characterOffset) {
              if (cur.from != cur.to && 'before' == sticky) {
                found = spanIndex;
              } else {
                bidiOther = spanIndex;
              }
            }
            if (cur.from == characterOffset) {
              if (cur.from != cur.to && 'before' != sticky) {
                found = spanIndex;
              } else {
                bidiOther = spanIndex;
              }
            }
          }
          if (null != found) {
            return found;
          } else {
            return bidiOther;
          }
        }
        var bidiOrdering = (function () {
          Object.defineProperty(BidiSpan, 'name', { value: 's', configurable: true });

          var lowTypes =
              'bbbbbbbbbtstwsbbbbbbbbbbbbbbssstwNN%%%NNNNNN,N,N1111111111NNNNNNNLLLLLLLLLLLLLLLLLLLLLLLLLLNNNNNNLLLLLLLLLLLLLLLLLLLLLLLLLLNNNNbbbbbbsbbbbbbbbbbbbbbbbbbbbbbbbbb,N%%%%NNNNLNNNNN%%11NLNNN1LNNNNNLLLLLLLLLLLLLLLLLLLLLLLNLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLN',
            arabicTypes =
              'nnnnnnNNr%%r,rNNmmmmmmmmmmmrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrmmmmmmmmmmmmmmmmmmmmmnnnnnnnnnn%nnrrrmrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrmmmmmmmnNmmmmmmrrmmNmmmmrr1111111111';
          var bidiRE = /[\u0590-\u05f4\u0600-\u06ff\u0700-\u08ac]/,
            isNeutral = /[stwN]/,
            isStrong = /[LRr]/,
            countsAsLeft = /[Lb1n]/,
            countsAsNum = /[1n]/;
          function BidiSpan(level, from, toOffset) {
            this.level = level;
            this.from = from;
            this.to = toOffset;
          }
          return function (str, direction) {
            var outerType = 'ltr' == direction ? 'L' : 'R';
            if (0 == str.length || ('ltr' == direction && !bidiRE.test(str))) {
              return false;
            }
            for (
              var codePoint, len = str.length, types = [], characterIndex = 0;
              characterIndex < len;
              ++characterIndex
            ) {
              types.push(
                (codePoint = str.charCodeAt(characterIndex)) <= 247
                  ? lowTypes.charAt(codePoint)
                  : 1424 <= codePoint && codePoint <= 1524
                    ? 'R'
                    : 1536 <= codePoint && codePoint <= 1785
                      ? arabicTypes.charAt(codePoint - 1536)
                      : 1774 <= codePoint && codePoint <= 2220
                        ? 'r'
                        : 8192 <= codePoint && codePoint <= 8203
                          ? 'w'
                          : 8204 == codePoint
                            ? 'b'
                            : 'L',
              );
            }
            for (var markIndex = 0, previousType = outerType; markIndex < len; ++markIndex) {
              var currentType = types[markIndex];
              if ('m' == currentType) {
                types[markIndex] = previousType;
              } else {
                previousType = currentType;
              }
            }
            for (
              var numberIndex = 0, previousStrongType = outerType;
              numberIndex < len;
              ++numberIndex
            ) {
              var numericType = types[numberIndex];
              if ('1' == numericType && 'r' == previousStrongType) {
                types[numberIndex] = 'n';
              } else {
                if (isStrong.test(numericType)) {
                  previousStrongType = numericType;
                  if ('r' == numericType) {
                    types[numberIndex] = 'R';
                  }
                }
              }
            }
            for (var i$3 = 1, prev$1 = types[0]; i$3 < len - 1; ++i$3) {
              var type$2 = types[i$3];
              if ('+' == type$2 && '1' == prev$1 && '1' == types[i$3 + 1]) {
                types[i$3] = '1';
              } else {
                if (
                  !(',' != type$2 || prev$1 != types[i$3 + 1] || ('1' != prev$1 && 'n' != prev$1))
                ) {
                  types[i$3] = prev$1;
                }
              }
              prev$1 = type$2;
            }
            for (var i$4 = 0; i$4 < len; ++i$4) {
              var type$3 = types[i$4];
              if (',' == type$3) {
                types[i$4] = 'N';
              } else {
                if ('%' == type$3) {
                  var end = void 0;
                  for (end = i$4 + 1; end < len && '%' == types[end]; ++end) {}
                  for (
                    var replace =
                        (i$4 && '!' == types[i$4 - 1]) || (end < len && '1' == types[end])
                          ? '1'
                          : 'N',
                      percentIndex = i$4;
                    percentIndex < end;
                    ++percentIndex
                  ) {
                    types[percentIndex] = replace;
                  }
                  i$4 = end - 1;
                }
              }
            }
            for (var i$5 = 0, cur$1 = outerType; i$5 < len; ++i$5) {
              var type$4 = types[i$5];
              if ('L' == cur$1 && '1' == type$4) {
                types[i$5] = 'L';
              } else {
                if (isStrong.test(type$4)) {
                  cur$1 = type$4;
                }
              }
            }
            for (var i$6 = 0; i$6 < len; ++i$6) {
              if (isNeutral.test(types[i$6])) {
                var end$1 = void 0;
                for (end$1 = i$6 + 1; end$1 < len && isNeutral.test(types[end$1]); ++end$1) {}
                for (
                  var before = 'L' == (i$6 ? types[i$6 - 1] : outerType),
                    replace$1 =
                      before == ('L' == (end$1 < len ? types[end$1] : outerType))
                        ? before
                          ? 'L'
                          : 'R'
                        : outerType,
                    j$1 = i$6;
                  j$1 < end$1;
                  ++j$1
                ) {
                  types[j$1] = replace$1;
                }
                i$6 = end$1 - 1;
              }
            }
            for (var whitespaceMatch, order = [], i$7 = 0; i$7 < len; ) {
              if (countsAsLeft.test(types[i$7])) {
                var start = i$7;
                for (++i$7; i$7 < len && countsAsLeft.test(types[i$7]); ++i$7) {}
                order.push(new BidiSpan(0, start, i$7));
              } else {
                var position = i$7,
                  insertionIndex = order.length;
                for (++i$7; i$7 < len && 'L' != types[i$7]; ++i$7) {}
                for (var j$2 = position; j$2 < i$7; ) {
                  if (countsAsNum.test(types[j$2])) {
                    if (position < j$2) {
                      order.splice(insertionIndex, 0, new BidiSpan(1, position, j$2));
                    }
                    var nstart = j$2;
                    for (++j$2; j$2 < i$7 && countsAsNum.test(types[j$2]); ++j$2) {}
                    order.splice(insertionIndex, 0, new BidiSpan(2, nstart, j$2));
                    position = j$2;
                  } else {
                    ++j$2;
                  }
                }
                if (position < i$7) {
                  order.splice(insertionIndex, 0, new BidiSpan(1, position, i$7));
                }
              }
            }
            if (1 == order[0].level && (whitespaceMatch = str.match(/^\s+/))) {
              order[0].from = whitespaceMatch[0].length;
              order.unshift(new BidiSpan(0, 0, whitespaceMatch[0].length));
            }
            if (1 == lst(order).level && (whitespaceMatch = str.match(/\s+$/))) {
              lst(order).to -= whitespaceMatch[0].length;
              order.push(new BidiSpan(0, len - whitespaceMatch[0].length, len));
            }
            if ('rtl' == direction) {
              return order.reverse();
            } else {
              return order;
            }
          };
        })();
        function getOrder(line, direction) {
          var order = line.order;
          if (null == order) {
            order = line.order = bidiOrdering(line.text, direction);
          }
          return order;
        }
        function moveCharLogically(line, characterOffset, dir) {
          var target = skipExtendingChars(line.text, characterOffset + dir, dir);
          if (target < 0 || target > line.text.length) {
            return null;
          } else {
            return target;
          }
        }
        function moveLogically(line, start, dir) {
          var characterOffset = moveCharLogically(line, start.ch, dir);
          if (null == characterOffset) {
            return null;
          } else {
            return new Pos(start.line, characterOffset, dir < 0 ? 'after' : 'before');
          }
        }
        function endOfLine(visually, editor, lineObj, lineNo, dir) {
          if (visually) {
            var order = getOrder(lineObj, editor.doc.direction);
            if (order) {
              var characterOffset,
                part = dir < 0 ? lst(order) : order[0],
                sticky = dir < 0 == (1 == part.level) ? 'after' : 'before';
              if (part.level > 0) {
                var prep = prepareMeasureForLine(editor, lineObj);
                characterOffset = dir < 0 ? lineObj.text.length - 1 : 0;
                var targetTop = measureCharPrepared(editor, prep, characterOffset).top;
                characterOffset = findFirst(
                  function (characterOffset) {
                    return measureCharPrepared(editor, prep, characterOffset).top == targetTop;
                  },
                  dir < 0 == (1 == part.level) ? part.from : part.to - 1,
                  characterOffset,
                );
                if ('before' == sticky) {
                  characterOffset = moveCharLogically(lineObj, characterOffset, 1);
                }
              } else {
                characterOffset = dir < 0 ? part.to : part.from;
              }
              return new Pos(lineNo, characterOffset, sticky);
            }
          }
          return new Pos(lineNo, dir < 0 ? lineObj.text.length : 0, dir < 0 ? 'before' : 'after');
        }
        function moveVisually(editor, line, start, dir) {
          var bidi = getOrder(line, editor.doc.direction);
          if (!bidi) {
            return moveLogically(line, start, dir);
          }
          if (start.ch >= line.text.length) {
            start.ch = line.text.length;
            start.sticky = 'before';
          } else {
            if (start.ch <= 0) {
              start.ch = 0;
              start.sticky = 'after';
            }
          }
          var partPos = getBidiPartAt(bidi, start.ch, start.sticky),
            part = bidi[partPos];
          if (
            'ltr' == editor.doc.direction &&
            part.level % 2 == 0 &&
            (dir > 0 ? part.to > start.ch : part.from < start.ch)
          ) {
            return moveLogically(line, start, dir);
          }
          var prep,
            moveCharacter = Object.defineProperty(
              function (position, dir) {
                return moveCharLogically(
                  line,
                  position instanceof Pos ? position.ch : position,
                  dir,
                );
              },
              'name',
              { value: 'l', configurable: true },
            ),
            getWrappedLineExtent = Object.defineProperty(
              function (characterOffset) {
                if (editor.options.lineWrapping) {
                  prep = prep || prepareMeasureForLine(editor, line);
                  return wrappedLineExtentChar(editor, line, prep, characterOffset);
                } else {
                  return { begin: 0, end: line.text.length };
                }
              },
              'name',
              { value: 'c', configurable: true },
            ),
            wrappedLineExtent = getWrappedLineExtent(
              'before' == start.sticky ? moveCharacter(start, -1) : start.ch,
            );
          if ('rtl' == editor.doc.direction || 1 == part.level) {
            var moveInStorageOrder = (1 == part.level) == dir < 0,
              nextCharacterOffset = moveCharacter(start, moveInStorageOrder ? 1 : -1);
            if (
              null != nextCharacterOffset &&
              (moveInStorageOrder
                ? nextCharacterOffset <= part.to && nextCharacterOffset <= wrappedLineExtent.end
                : nextCharacterOffset >= part.from &&
                  nextCharacterOffset >= wrappedLineExtent.begin)
            ) {
              var sticky = moveInStorageOrder ? 'before' : 'after';
              return new Pos(start.line, nextCharacterOffset, sticky);
            }
          }
          var searchInVisualLine = Object.defineProperty(
              function (partPos, dir, wrappedLineExtent) {
                for (
                  var getRes = Object.defineProperty(
                    function (characterOffset, moveInStorageOrder) {
                      if (moveInStorageOrder) {
                        return new Pos(start.line, moveCharacter(characterOffset, 1), 'before');
                      } else {
                        return new Pos(start.line, characterOffset, 'after');
                      }
                    },
                    'name',
                    { value: 'o', configurable: true },
                  );
                  partPos >= 0 && partPos < bidi.length;
                  partPos += dir
                ) {
                  var part = bidi[partPos],
                    moveInStorageOrder = dir > 0 == (1 != part.level),
                    characterOffset = moveInStorageOrder
                      ? wrappedLineExtent.begin
                      : moveCharacter(wrappedLineExtent.end, -1);
                  if (part.from <= characterOffset && characterOffset < part.to) {
                    return getRes(characterOffset, moveInStorageOrder);
                  }
                  characterOffset = moveInStorageOrder ? part.from : moveCharacter(part.to, -1);
                  if (
                    wrappedLineExtent.begin <= characterOffset &&
                    characterOffset < wrappedLineExtent.end
                  ) {
                    return getRes(characterOffset, moveInStorageOrder);
                  }
                }
              },
              'name',
              { value: 'f', configurable: true },
            ),
            res = searchInVisualLine(partPos + dir, dir, wrappedLineExtent);
          if (res) {
            return res;
          }
          var nextCh = dir > 0 ? wrappedLineExtent.end : moveCharacter(wrappedLineExtent.begin, -1);
          if (
            null == nextCh ||
            (dir > 0 && nextCh == line.text.length) ||
            !(res = searchInVisualLine(
              dir > 0 ? 0 : bidi.length - 1,
              dir,
              getWrappedLineExtent(nextCh),
            ))
          ) {
            return null;
          } else {
            return res;
          }
        }
        var noHandlers = [],
          addEventHandler = Object.defineProperty(
            function (emitter, type, handler) {
              if (emitter.addEventListener) {
                var eventOptions =
                  File.option.passiveEvents &&
                  ('scroll' == type || 'mousewheel' == type || 'DOMMouseScroll' == type);
                emitter.addEventListener(
                  type,
                  handler,
                  !!eventOptions && { passive: true, capture: false },
                );
              } else {
                if (emitter.attachEvent) {
                  emitter.attachEvent('on' + type, handler);
                } else {
                  var map$$1 = emitter._handlers || (emitter._handlers = {});
                  map$$1[type] = (map$$1[type] || noHandlers).concat(handler);
                }
              }
            },
            'name',
            { value: 'it', configurable: true },
          );
        function getHandlers(emitter, type) {
          return (emitter._handlers && emitter._handlers[type]) || noHandlers;
        }
        function off(emitter, type, handler) {
          if (emitter.removeEventListener) {
            emitter.removeEventListener(type, handler, false);
          } else {
            if (emitter.detachEvent) {
              emitter.detachEvent('on' + type, handler);
            } else {
              var map$$1 = emitter._handlers,
                items = map$$1 && map$$1[type];
              if (items) {
                var index = indexOf(items, handler);
                if (index > -1) {
                  map$$1[type] = items.slice(0, index).concat(items.slice(index + 1));
                }
              }
            }
          }
        }
        function signal(emitter, type) {
          var handlers = getHandlers(emitter, type);
          if (handlers.length) {
            for (
              var args = Array.prototype.slice.call(arguments, 2), handlerIndex = 0;
              handlerIndex < handlers.length;
              ++handlerIndex
            ) {
              handlers[handlerIndex].apply(null, args);
            }
          }
        }
        function signalDOMEvent(editor, event, override) {
          if ('string' == typeof event) {
            event = {
              type: event,
              preventDefault: function () {
                this.defaultPrevented = true;
              },
            };
          }
          signal(editor, override || event.type, editor, event);
          return e_defaultPrevented(event) || event.codemirrorIgnore;
        }
        function signalCursorActivity(editor) {
          var items = editor._handlers && editor._handlers.cursorActivity;
          if (items) {
            for (
              var set =
                  editor.curOp.cursorActivityHandlers || (editor.curOp.cursorActivityHandlers = []),
                handlerIndex = 0;
              handlerIndex < items.length;
              ++handlerIndex
            ) {
              if (-1 == indexOf(set, items[handlerIndex])) {
                set.push(items[handlerIndex]);
              }
            }
          }
        }
        function hasHandler(emitter, type) {
          return getHandlers(emitter, type).length > 0;
        }
        function eventMixin(ctor) {
          ctor.prototype.on = function (type, handler) {
            addEventHandler(this, type, handler);
          };
          ctor.prototype.off = function (type, handler) {
            off(this, type, handler);
          };
        }
        function e_preventDefault(event) {
          if (event.preventDefault) {
            event.preventDefault();
          } else {
            event.returnValue = false;
          }
        }
        function e_stopPropagation(event) {
          if (event.stopPropagation) {
            event.stopPropagation();
          } else {
            event.cancelBubble = true;
          }
        }
        function e_defaultPrevented(event) {
          if (null != event.defaultPrevented) {
            return event.defaultPrevented;
          } else {
            return 0 == event.returnValue;
          }
        }
        function e_stop(event) {
          e_preventDefault(event);
          e_stopPropagation(event);
        }
        function e_target(event) {
          return event.target || event.srcElement;
        }
        function e_button(event) {
          var button = event.which;
          if (null == button) {
            if (1 & event.button) {
              button = 1;
            } else {
              if (2 & event.button) {
                button = 3;
              } else {
                if (4 & event.button) {
                  button = 2;
                }
              }
            }
          }
          if (mac && event.ctrlKey && 1 == button) {
            button = 3;
          }
          return button;
        }
        var zwspSupported,
          badBidiRects,
          dragAndDrop = (function () {
            if (isInternetExplorer && ie_version < 9) {
              return false;
            }
            var div = createElement('div');
            return 'draggable' in div || 'dragDrop' in div;
          })();
        function zeroWidthElement(measure) {
          if (null == zwspSupported) {
            var test = createElement('span', '​');
            removeChildrenAndAdd(
              measure,
              createElement('span', [test, document.createTextNode('x')]),
            );
            if (0 != measure.firstChild.offsetHeight) {
              zwspSupported =
                test.offsetWidth <= 1 &&
                test.offsetHeight > 2 &&
                !(isInternetExplorer && ie_version < 8);
            }
          }
          var node = zwspSupported
            ? createElement('span', '​')
            : createElement(
                'span',
                ' ',
                null,
                'display: inline-block; width: 1px; margin-right: -1px',
              );
          node.setAttribute('cm-text', '');
          node.setAttribute('cm-zwsp', '');
          return node;
        }
        function hasBadBidiRects(measure) {
          if (null != badBidiRects) {
            return badBidiRects;
          }
          var txt = removeChildrenAndAdd(measure, document.createTextNode('AخA')),
            firstCharacterBounds = range(txt, 0, 1).getBoundingClientRect(),
            secondCharacterBounds = range(txt, 1, 2).getBoundingClientRect();
          removeChildren(measure);
          return (
            !(!firstCharacterBounds || firstCharacterBounds.left == firstCharacterBounds.right) &&
            (badBidiRects = secondCharacterBounds.right - firstCharacterBounds.right < 3)
          );
        }
        var copyEventProbe,
          splitLinesAuto =
            3 != '\n\nb'.split(/\n/).length
              ? function (string) {
                  for (
                    var position = 0, result = [], textLength = string.length;
                    position <= textLength;
                  ) {
                    var newlineIndex = string.indexOf('\n', position);
                    if (-1 == newlineIndex) {
                      newlineIndex = string.length;
                    }
                    var line = string.slice(
                        position,
                        '\r' == string.charAt(newlineIndex - 1) ? newlineIndex - 1 : newlineIndex,
                      ),
                      carriageReturnIndex = line.indexOf('\r');
                    if (-1 != carriageReturnIndex) {
                      result.push(line.slice(0, carriageReturnIndex));
                      position += carriageReturnIndex + 1;
                    } else {
                      result.push(line);
                      position = newlineIndex + 1;
                    }
                  }
                  return result;
                }
              : function (string) {
                  return (string || '').split(/\r\n?|\n/);
                },
          hasSelection = window.getSelection
            ? function (textRange) {
                try {
                  return textRange.selectionStart != textRange.selectionEnd;
                } catch (rangeError) {
                  return false;
                }
              }
            : function (textRange) {
                var range$$1;
                try {
                  range$$1 = textRange.ownerDocument.selection.createRange();
                } catch (rangeError) {}
                return (
                  !(!range$$1 || range$$1.parentElement() != textRange) &&
                  0 != range$$1.compareEndPoints('StartToEnd', range$$1)
                );
              },
          hasCopyEvent =
            'oncopy' in (copyEventProbe = createElement('div')) ||
            (copyEventProbe.setAttribute('oncopy', 'return;'),
            'function' == typeof copyEventProbe.oncopy),
          badZoomedRects = null;
        var modes = {},
          mimeModes = {};
        function resolveMode(spec) {
          if ('string' == typeof spec && mimeModes.hasOwnProperty(spec)) {
            spec = mimeModes[spec];
          } else {
            if (spec && 'string' == typeof spec.name && mimeModes.hasOwnProperty(spec.name)) {
              var found = mimeModes[spec.name];
              if ('string' == typeof found) {
                found = { name: found };
              }
              (spec = createObj(found, spec)).name = found.name;
            } else {
              if ('string' == typeof spec && /^[\w\-]+\/[\w\-]+\+xml$/.test(spec)) {
                return resolveMode('application/xml');
              }
              if ('string' == typeof spec && /^[\w\-]+\/[\w\-]+\+json$/.test(spec)) {
                return resolveMode('application/json');
              }
            }
          }
          if ('string' == typeof spec) {
            return { name: spec };
          } else {
            return spec || { name: 'null' };
          }
        }
        function getMode(options, spec) {
          spec = resolveMode(spec);
          var mfactory = modes[spec.name];
          if (!mfactory) {
            return getMode(options, 'text/plain');
          }
          var modeObj = mfactory(options, spec);
          if (modeExtensions.hasOwnProperty(spec.name)) {
            var exts = modeExtensions[spec.name];
            for (var prop in exts) {
              if (exts.hasOwnProperty(prop)) {
                if (modeObj.hasOwnProperty(prop)) {
                  modeObj['_' + prop] = modeObj[prop];
                }
                modeObj[prop] = exts[prop];
              }
            }
          }
          modeObj.name = spec.name;
          if (spec.helperType) {
            modeObj.helperType = spec.helperType;
          }
          if (spec.modeProps) {
            for (var prop$1 in spec.modeProps) {
              modeObj[prop$1] = spec.modeProps[prop$1];
            }
          }
          return modeObj;
        }
        var modeExtensions = {};
        function extendMode(mode, properties) {
          copyObj(
            properties,
            modeExtensions.hasOwnProperty(mode)
              ? modeExtensions[mode]
              : (modeExtensions[mode] = {}),
          );
        }
        function copyState(mode, state) {
          if (true === state) {
            return state;
          }
          if (mode.copyState) {
            return mode.copyState(state);
          }
          var nstate = {};
          for (var propertyName in state) {
            var val = state[propertyName];
            if (val instanceof Array) {
              val = val.concat([]);
            }
            nstate[propertyName] = val;
          }
          return nstate;
        }
        function innerMode(mode, state) {
          for (
            var info;
            mode.innerMode && (info = mode.innerMode(state)) && info.mode && info.mode != mode;
          ) {
            state = info.state;
            mode = info.mode;
          }
          if (info && !info.mode) {
            info = void 0;
          }
          return info || { mode: mode, state: state };
        }
        function startState(mode, firstArgument, secondArgument) {
          return !mode.startState || mode.startState(firstArgument, secondArgument);
        }
        var StringStream = Object.defineProperty(
          function (string, tabSize) {
            this.pos = this.start = 0;
            this.string = string;
            this.tabSize = tabSize || 8;
            this.lastColumnPos = this.lastColumnValue = 0;
            this.lineStart = 0;
          },
          'name',
          { value: 'Pt', configurable: true },
        );
        function highlightLine(editor, line, state, forceToEnd) {
          var styles = [editor.state.modeGen],
            lineClasses = {},
            lineNumber = lineNo(line);
          if ('object' == typeof state) {
            state.lineBefore = editor.getLine(lineNumber - 1);
            state.lineAfter = editor.getLine(lineNumber + 1);
          }
          highlightLineTokens(
            editor,
            line.text,
            editor.doc.mode,
            state,
            function (end, style) {
              return styles.push(end, style);
            },
            lineClasses,
            forceToEnd,
          );
          for (
            var loop = Object.defineProperty(
                function (overlayIndex) {
                  var overlay = editor.state.overlays[overlayIndex],
                    styleOffset = 1,
                    characterOffset = 0;
                  highlightLineTokens(
                    editor,
                    line.text,
                    overlay.mode,
                    'visiblespace' !== overlay.mode.name || state,
                    function (end, style) {
                      for (var start = styleOffset; characterOffset < end; ) {
                        var i_end = styles[styleOffset];
                        if (i_end > end) {
                          styles.splice(styleOffset, 1, end, styles[styleOffset + 1], i_end);
                        }
                        styleOffset += 2;
                        characterOffset = Math.min(end, i_end);
                      }
                      if (style) {
                        if (overlay.opaque) {
                          styles.splice(start, styleOffset - start, end, 'overlay ' + style);
                          styleOffset = start + 2;
                        } else {
                          for (; start < styleOffset; start += 2) {
                            var cur = styles[start + 1];
                            styles[start + 1] = (cur ? cur + ' ' : '') + 'overlay ' + style;
                          }
                        }
                      }
                    },
                    lineClasses,
                  );
                },
                'name',
                { value: 's', configurable: true },
              ),
              overlayIndex = 0;
            overlayIndex < editor.state.overlays.length;
            ++overlayIndex
          ) {
            loop(overlayIndex);
          }
          return {
            styles: styles,
            classes: lineClasses.bgClass || lineClasses.textClass ? lineClasses : null,
          };
        }
        function getLineStyles(editor, line, updateFrontier) {
          if (!line.styles || line.styles[0] != editor.state.modeGen) {
            var state = getStateBefore(editor, lineNo(line)),
              result = highlightLine(
                editor,
                line,
                line.text.length > editor.options.maxHighlightLength
                  ? copyState(editor.doc.mode, state)
                  : state,
              );
            line.stateAfter = state;
            line.styles = result.styles;
            if (result.classes) {
              line.styleClasses = result.classes;
            } else {
              if (line.styleClasses) {
                line.styleClasses = null;
              }
            }
            if (updateFrontier === editor.doc.frontier) {
              editor.doc.frontier++;
            }
          }
          return line.styles;
        }
        function getStateBefore(editor, lineNumber, precise) {
          var documentModel = editor.doc,
            display = editor.display;
          if (!documentModel.mode.startState) {
            return true;
          }
          var position = (function (editor, lineNumber, precise) {
              for (
                var minindent,
                  minline,
                  documentModel = editor.doc,
                  lim = precise ? -1 : lineNumber - (editor.doc.mode.innerMode ? 1e3 : 100),
                  search = lineNumber;
                search > lim;
                --search
              ) {
                if (search <= documentModel.first) {
                  return documentModel.first;
                }
                var line = getLine(documentModel, search - 1);
                if (line.stateAfter && (!precise || search <= documentModel.frontier)) {
                  return search;
                }
                var indented = countColumn(line.text, null, editor.options.tabSize);
                if (null == minline || minindent > indented) {
                  minline = search - 1;
                  minindent = indented;
                }
              }
              return minline;
            })(editor, lineNumber, precise),
            state =
              position > documentModel.first && getLine(documentModel, position - 1).stateAfter;
          state = state ? copyState(documentModel.mode, state) : startState(documentModel.mode);
          documentModel.iter(position, lineNumber, function (line) {
            if ('object' == typeof state) {
              state.lineBefore = editor.getLine(lineNumber - 1);
              state.lineAfter = editor.getLine(lineNumber + 1);
            }
            processLine(editor, line.text, state);
            var save =
              position == lineNumber - 1 ||
              position % 5 == 0 ||
              (position >= display.viewFrom && position < display.viewTo);
            line.stateAfter = save ? copyState(documentModel.mode, state) : null;
            ++position;
          });
          if (precise) {
            documentModel.frontier = position;
          }
          return state;
        }
        function processLine(editor, text, state, startAt) {
          var mode = editor.doc.mode,
            stream = new StringStream(text, editor.options.tabSize);
          for (
            stream.start = stream.pos = startAt || 0,
              state.lineBefore = state.lineBefore || '',
              state.lineAfter = state.lineAfter || '',
              '' == text && callBlankLine(mode, state);
            !stream.eol();
          ) {
            readToken(mode, stream, state);
            stream.start = stream.pos;
          }
        }
        function callBlankLine(mode, state) {
          if (mode.blankLine) {
            return mode.blankLine(state);
          }
          if (mode.innerMode) {
            var inner = innerMode(mode, state);
            if (inner.mode.blankLine) {
              return inner.mode.blankLine(inner.state);
            } else {
              return void 0;
            }
          }
        }
        function readToken(mode, stream, state, inner) {
          for (var attempt = 0; attempt < 10; attempt++) {
            if (inner) {
              inner[0] = innerMode(mode, state).mode;
            }
            var tokenStyle = mode.token(stream, state);
            if (stream.pos > stream.start) {
              return tokenStyle;
            }
          }
          if ('gfm' == mode.name) {
            stream.pos = stream.start + 1;
            return null;
          }
          throw new Error('Mode ' + mode.name + ' failed to advance stream.');
        }
        function readTokenAtPosition(editor, position, precise, asArray) {
          var style,
            getObj = Object.defineProperty(
              function (copy) {
                return {
                  start: stream.start,
                  end: stream.pos,
                  string: stream.current(),
                  type: style || null,
                  state: copy ? copyState(documentModel.mode, state) : state,
                };
              },
              'name',
              { value: 'o', configurable: true },
            ),
            documentModel = editor.doc,
            mode = documentModel.mode;
          position = clipPos(documentModel, position);
          var tokens,
            line = getLine(documentModel, position.line),
            state = getStateBefore(editor, position.line, precise),
            stream = new StringStream(line.text, editor.options.tabSize);
          for (asArray && (tokens = []); (asArray || stream.pos < position.ch) && !stream.eol(); ) {
            stream.start = stream.pos;
            style = readToken(mode, stream, state);
            if (asArray) {
              tokens.push(getObj(true));
            }
          }
          if (asArray) {
            return tokens;
          } else {
            return getObj();
          }
        }
        function extractLineClasses(type, output) {
          if (type) {
            for (;;) {
              var lineClass = type.match(/(?:^|\s+)line-(background-)?(\S+)/);
              if (!lineClass) {
                break;
              }
              type =
                type.slice(0, lineClass.index) + type.slice(lineClass.index + lineClass[0].length);
              var prop = lineClass[1] ? 'bgClass' : 'textClass';
              if (null == output[prop]) {
                output[prop] = lineClass[2];
              } else {
                if (!new RegExp('(?:^|s)' + lineClass[2] + '(?:$|s)').test(output[prop])) {
                  output[prop] += ' ' + lineClass[2];
                }
              }
            }
          }
          return type;
        }
        function highlightLineTokens(
          editor,
          text,
          mode,
          state,
          emitStyle,
          lineClasses,
          forceToEnd,
        ) {
          var flattenSpans = mode.flattenSpans;
          if (null == flattenSpans) {
            flattenSpans = editor.options.flattenSpans;
          }
          var style,
            curStart = 0,
            curStyle = null,
            stream = new StringStream(text, editor.options.tabSize),
            inner = editor.options.addModeClass && [null];
          for (
            '' == text && extractLineClasses(callBlankLine(mode, state), lineClasses);
            !stream.eol();
          ) {
            if (stream.pos > editor.options.maxHighlightLength) {
              flattenSpans = false;
              if (forceToEnd) {
                processLine(editor, text, state, stream.pos);
              }
              stream.pos = text.length;
              style = null;
            } else {
              style = extractLineClasses(readToken(mode, stream, state, inner), lineClasses);
            }
            if (inner) {
              var mName = inner[0].name;
              if (mName) {
                style = 'm-' + (style ? mName + ' ' + style : mName);
              }
            }
            if (!flattenSpans || curStyle != style) {
              for (; curStart < stream.start; ) {
                emitStyle((curStart = Math.min(stream.start, curStart + 5e3)), curStyle);
              }
              curStyle = style;
            }
            stream.start = stream.pos;
          }
          for (; curStart < stream.pos; ) {
            var position = Math.min(stream.pos, curStart + 5e3);
            emitStyle(position, curStyle);
            curStart = position;
          }
        }
        StringStream.prototype.eol = function () {
          return this.pos >= this.string.length;
        };
        StringStream.prototype.sol = function () {
          return this.pos == this.lineStart;
        };
        StringStream.prototype.peek = function () {
          return this.string.charAt(this.pos) || void 0;
        };
        StringStream.prototype.next = function () {
          if (this.pos < this.string.length) {
            return this.string.charAt(this.pos++);
          }
        };
        StringStream.prototype.eat = function (match) {
          var character = this.string.charAt(this.pos);
          if (
            'string' == typeof match
              ? character == match
              : character && (match.test ? match.test(character) : match(character))
          ) {
            ++this.pos;
            return character;
          }
        };
        StringStream.prototype.eatWhile = function (match) {
          for (var start = this.pos; this.eat(match); ) {}
          return this.pos > start;
        };
        StringStream.prototype.eatSpace = function () {
          for (var start = this.pos; /[\s\u00a0]/.test(this.string.charAt(this.pos)); ) {
            ++this.pos;
          }
          return this.pos > start;
        };
        StringStream.prototype.skipToEnd = function () {
          this.pos = this.string.length;
        };
        StringStream.prototype.skipTo = function (character) {
          var found = this.string.indexOf(character, this.pos);
          if (found > -1) {
            this.pos = found;
            return true;
          }
        };
        StringStream.prototype.backUp = function (characterCount) {
          this.pos -= characterCount;
        };
        StringStream.prototype.column = function () {
          if (this.lastColumnPos < this.start) {
            this.lastColumnValue = countColumn(
              this.string,
              this.start,
              this.tabSize,
              this.lastColumnPos,
              this.lastColumnValue,
            );
            this.lastColumnPos = this.start;
          }
          return (
            this.lastColumnValue -
            (this.lineStart ? countColumn(this.string, this.lineStart, this.tabSize) : 0)
          );
        };
        StringStream.prototype.indentation = function () {
          return (
            countColumn(this.string, null, this.tabSize) -
            (this.lineStart ? countColumn(this.string, this.lineStart, this.tabSize) : 0)
          );
        };
        StringStream.prototype.match = function (pattern, consume, caseInsensitive) {
          if ('string' != typeof pattern) {
            var match = this.string.slice(this.pos).match(pattern);
            if (match && match.index > 0) {
              return null;
            } else {
              if (match && false !== consume) {
                this.pos += match[0].length;
              }
              return match;
            }
          }
          var foldCase = Object.defineProperty(
            function (str) {
              if (caseInsensitive) {
                return str.toLowerCase();
              } else {
                return str;
              }
            },
            'name',
            { value: 'r', configurable: true },
          );
          if (foldCase(this.string.substr(this.pos, pattern.length)) == foldCase(pattern)) {
            if (false !== consume) {
              this.pos += pattern.length;
            }
            return true;
          }
        };
        StringStream.prototype.current = function () {
          return this.string.slice(this.start, this.pos);
        };
        StringStream.prototype.hideFirstChars = function (characterCount, inner) {
          this.lineStart += characterCount;
          try {
            return inner();
          } finally {
            this.lineStart -= characterCount;
          }
        };
        var Line = Object.defineProperty(
          function (text, markedSpans, estimateHeight) {
            this.text = text;
            attachMarkedSpans(this, markedSpans);
            this.height = estimateHeight ? estimateHeight(this) : 1;
          },
          'name',
          { value: 'Vt', configurable: true },
        );
        function cleanUpLine(line) {
          line.parent = null;
          detachMarkedSpans(line);
        }
        Line.prototype.lineNo = function () {
          return lineNo(this);
        };
        eventMixin(Line);
        var styleToClassCache = {},
          styleToClassCacheWithMode = {};
        function interpretTokenStyle(style, options) {
          if (!style || /^\s*$/.test(style)) {
            return null;
          }
          var cache = options.addModeClass ? styleToClassCacheWithMode : styleToClassCache;
          return cache[style] || (cache[style] = style.replace(/\S+/g, 'cm-$&'));
        }
        function buildLineContent(editor, lineView) {
          var content = eltP('span', null, null, webkit ? 'padding-right: .1px' : null),
            builder = {
              pre: eltP('pre', [content], 'CodeMirror-line'),
              content: content,
              col: 0,
              pos: 0,
              cm: editor,
              trailingSpace: false,
              splitSpaces: (isInternetExplorer || webkit) && editor.getOption('lineWrapping'),
            };
          lineView.measure = {};
          for (
            var styleIndex = 0;
            styleIndex <= (lineView.rest ? lineView.rest.length : 0);
            styleIndex++
          ) {
            var line = styleIndex ? lineView.rest[styleIndex - 1] : lineView.line,
              order = void 0;
            builder.pos = 0;
            builder.addToken = buildToken;
            if (
              hasBadBidiRects(editor.display.measure) &&
              (order = getOrder(line, editor.doc.direction))
            ) {
              builder.addToken = buildTokenBadBidi(builder.addToken, order);
            }
            builder.map = [];
            insertLineContent(
              line,
              builder,
              getLineStyles(
                editor,
                line,
                lineView != editor.display.externalMeasured && lineNo(line),
              ),
            );
            if (line.styleClasses) {
              if (line.styleClasses.bgClass) {
                builder.bgClass = joinClasses(line.styleClasses.bgClass, builder.bgClass || '');
              }
              if (line.styleClasses.textClass) {
                builder.textClass = joinClasses(
                  line.styleClasses.textClass,
                  builder.textClass || '',
                );
              }
            }
            if (0 == builder.map.length) {
              builder.map.push(
                0,
                0,
                builder.content.appendChild(zeroWidthElement(editor.display.measure)),
              );
            }
            if (0 == styleIndex) {
              lineView.measure.map = builder.map;
              lineView.measure.cache = {};
            } else {
              (lineView.measure.maps || (lineView.measure.maps = [])).push(builder.map);
              (lineView.measure.caches || (lineView.measure.caches = [])).push({});
            }
          }
          if (webkit) {
            var last = builder.content.lastChild;
            if (
              /\bcm-tab\b/.test(last.className) ||
              (last.querySelector && last.querySelector('.cm-tab'))
            ) {
              builder.content.className = 'cm-tab-wrap-hack';
            }
          }
          signal(editor, 'renderLine', editor, lineView.line, builder.pre);
          if (builder.pre.className) {
            builder.textClass = joinClasses(builder.pre.className, builder.textClass || '');
          }
          return builder;
        }
        function defaultSpecialCharPlaceholder(character) {
          var token = createElement('span', '•', 'cm-invalidchar');
          token.title = '\\u' + character.charCodeAt(0).toString(16);
          token.setAttribute('aria-label', token.title);
          return token;
        }
        function buildToken(builder, text, style, startStyle, endStyle, title, css) {
          if (text) {
            var content,
              displayText = builder.splitSpaces
                ? (function (text, trailingBefore) {
                    if (text.length > 1 && !/  /.test(text)) {
                      return text;
                    }
                    for (
                      var spaceBefore = trailingBefore, result = '', characterIndex = 0;
                      characterIndex < text.length;
                      characterIndex++
                    ) {
                      var character = text.charAt(characterIndex);
                      if (
                        !(
                          ' ' != character ||
                          !spaceBefore ||
                          (characterIndex != text.length - 1 &&
                            32 != text.charCodeAt(characterIndex + 1))
                        )
                      ) {
                        character = ' ';
                      }
                      result += character;
                      spaceBefore = ' ' == character;
                    }
                    return result;
                  })(text, builder.trailingSpace)
                : text,
              special = builder.cm.state.specialChars,
              mustWrap = false;
            if (special.test(text)) {
              content = document.createDocumentFragment();
              for (var position = 0; ; ) {
                special.lastIndex = position;
                var invalidCharacterMatch = special.exec(text),
                  skipped = invalidCharacterMatch
                    ? invalidCharacterMatch.index - position
                    : text.length - position;
                if (skipped) {
                  var txt = document.createTextNode(
                    displayText.slice(position, position + skipped),
                  );
                  if (isInternetExplorer && ie_version < 9) {
                    content.appendChild(createElement('span', [txt]));
                  } else {
                    content.appendChild(txt);
                  }
                  builder.map.push(builder.pos, builder.pos + skipped, txt);
                  builder.col += skipped;
                  builder.pos += skipped;
                }
                if (!invalidCharacterMatch) {
                  break;
                }
                position += skipped + 1;
                var txt$1 = void 0;
                if ('\t' == invalidCharacterMatch[0]) {
                  var tabSize = builder.cm.options.tabSize,
                    tabWidth = tabSize - (builder.col % tabSize);
                  (txt$1 = content.appendChild(
                    createElement('span', spaceStr(tabWidth), 'cm-tab'),
                  )).setAttribute('role', 'presentation');
                  txt$1.setAttribute('cm-text', '\t');
                  builder.col += tabWidth;
                } else {
                  if ('\r' == invalidCharacterMatch[0] || '\n' == invalidCharacterMatch[0]) {
                    (txt$1 = content.appendChild(
                      createElement(
                        'span',
                        '\r' == invalidCharacterMatch[0] ? '␍' : '␤',
                        'cm-invalidchar',
                      ),
                    )).setAttribute('cm-text', invalidCharacterMatch[0]);
                    builder.col += 1;
                  } else {
                    (txt$1 = builder.cm.options.specialCharPlaceholder(
                      invalidCharacterMatch[0],
                    )).setAttribute('cm-text', invalidCharacterMatch[0]);
                    if (isInternetExplorer && ie_version < 9) {
                      content.appendChild(createElement('span', [txt$1]));
                    } else {
                      content.appendChild(txt$1);
                    }
                    builder.col += 1;
                  }
                }
                builder.map.push(builder.pos, builder.pos + 1, txt$1);
                builder.pos++;
              }
            } else {
              builder.col += text.length;
              content = document.createTextNode(displayText);
              builder.map.push(builder.pos, builder.pos + text.length, content);
              if (isInternetExplorer && ie_version < 9) {
                mustWrap = true;
              }
              builder.pos += text.length;
            }
            builder.trailingSpace = 32 == displayText.charCodeAt(text.length - 1);
            if (style || startStyle || endStyle || mustWrap || css) {
              var fullStyle = style || '';
              if (startStyle) {
                fullStyle += startStyle;
              }
              if (endStyle) {
                fullStyle += endStyle;
              }
              var token = createElement('span', [content], fullStyle, css);
              if (title) {
                token.title = title;
              }
              return builder.content.appendChild(token);
            }
            builder.content.appendChild(content);
          }
        }
        function buildTokenBadBidi(inner, order) {
          return function (builder, text, style, startStyle, endStyle, title, css) {
            style = style ? style + ' cm-force-border' : 'cm-force-border';
            for (var start = builder.pos, end = start + text.length; ; ) {
              for (
                var part = void 0, styleIndex = 0;
                styleIndex < order.length &&
                !((part = order[styleIndex]).to > start && part.from <= start);
                styleIndex++
              ) {}
              if (part.to >= end) {
                return inner(builder, text, style, startStyle, endStyle, title, css);
              }
              inner(builder, text.slice(0, part.to - start), style, startStyle, null, title, css);
              startStyle = null;
              text = text.slice(part.to - start);
              start = part.to;
            }
          };
        }
        function buildCollapsedSpan(builder, size, marker, ignoreWidget) {
          var widget = !ignoreWidget && marker.widgetNode;
          if (widget) {
            builder.map.push(builder.pos, builder.pos + size, widget);
          }
          if (!ignoreWidget && builder.cm.display.input.needsContentAttribute) {
            if (!widget) {
              widget = builder.content.appendChild(document.createElement('span'));
            }
            widget.setAttribute('cm-marker', marker.id);
          }
          if (widget) {
            builder.cm.display.input.setUneditable(widget);
            builder.content.appendChild(widget);
          }
          builder.pos += size;
          builder.trailingSpace = false;
        }
        function insertLineContent(line, builder, styles) {
          var spans = line.markedSpans,
            allText = line.text,
            characterOffset = 0;
          if (spans) {
            for (
              var style,
                css,
                spanStyle,
                spanEndStyle,
                spanStartStyle,
                title,
                collapsed,
                len = allText.length,
                position = 0,
                styleIndex = 1,
                text = '',
                nextChange = 0;
              ;
            ) {
              if (nextChange == position) {
                spanStyle = spanEndStyle = spanStartStyle = title = css = '';
                collapsed = null;
                nextChange = 1 / 0;
                for (
                  var foundBookmarks = [], endStyles = void 0, spanIndex = 0;
                  spanIndex < spans.length;
                  ++spanIndex
                ) {
                  var span = spans[spanIndex],
                    marker = span.marker;
                  if ('bookmark' == marker.type && span.from == position && marker.widgetNode) {
                    foundBookmarks.push(marker);
                  } else {
                    if (
                      span.from <= position &&
                      (null == span.to ||
                        span.to > position ||
                        (marker.collapsed && span.to == position && span.from == position))
                    ) {
                      if (null != span.to && span.to != position && nextChange > span.to) {
                        nextChange = span.to;
                        spanEndStyle = '';
                      }
                      if (marker.className) {
                        spanStyle += ' ' + marker.className;
                      }
                      if (marker.css) {
                        css = (css ? css + ';' : '') + marker.css;
                      }
                      if (marker.startStyle && span.from == position) {
                        spanStartStyle += ' ' + marker.startStyle;
                      }
                      if (marker.endStyle && span.to == nextChange) {
                        (endStyles || (endStyles = [])).push(marker.endStyle, span.to);
                      }
                      if (marker.title && !title) {
                        title = marker.title;
                      }
                      if (
                        marker.collapsed &&
                        (!collapsed || compareCollapsedMarkers(collapsed.marker, marker) < 0)
                      ) {
                        collapsed = span;
                      }
                    } else {
                      if (span.from > position && nextChange > span.from) {
                        nextChange = span.from;
                      }
                    }
                  }
                }
                if (endStyles) {
                  for (var j$1 = 0; j$1 < endStyles.length; j$1 += 2) {
                    if (endStyles[j$1 + 1] == nextChange) {
                      spanEndStyle += ' ' + endStyles[j$1];
                    }
                  }
                }
                if (!collapsed || collapsed.from == position) {
                  for (var j$2 = 0; j$2 < foundBookmarks.length; ++j$2) {
                    buildCollapsedSpan(builder, 0, foundBookmarks[j$2]);
                  }
                }
                if (collapsed && (collapsed.from || 0) == position) {
                  buildCollapsedSpan(
                    builder,
                    (null == collapsed.to ? len + 1 : collapsed.to) - position,
                    collapsed.marker,
                    null == collapsed.from,
                  );
                  if (null == collapsed.to) {
                    return;
                  }
                  if (collapsed.to == position) {
                    collapsed = false;
                  }
                }
              }
              if (position >= len) {
                break;
              }
              for (var upto = Math.min(len, nextChange); ; ) {
                if (text) {
                  var end = position + text.length;
                  if (!collapsed) {
                    var tokenText = end > upto ? text.slice(0, upto - position) : text;
                    builder.addToken(
                      builder,
                      tokenText,
                      style ? style + spanStyle : spanStyle,
                      spanStartStyle,
                      position + tokenText.length == nextChange ? spanEndStyle : '',
                      title,
                      css,
                    );
                  }
                  if (end >= upto) {
                    text = text.slice(upto - position);
                    position = upto;
                    break;
                  }
                  position = end;
                  spanStartStyle = '';
                }
                text = allText.slice(characterOffset, (characterOffset = styles[styleIndex++]));
                style = interpretTokenStyle(styles[styleIndex++], builder.cm.options);
              }
            }
          } else {
            for (var i$1 = 1; i$1 < styles.length; i$1 += 2) {
              builder.addToken(
                builder,
                allText.slice(characterOffset, (characterOffset = styles[i$1])),
                interpretTokenStyle(styles[i$1 + 1], builder.cm.options),
              );
            }
          }
        }
        function LineView(documentModel, line, lineN) {
          this.line = line;
          this.rest = (function (line) {
            for (var merged, lines; (merged = collapsedSpanAtEnd(line)); ) {
              line = merged.find(1, true).line;
              (lines || (lines = [])).push(line);
            }
            return lines;
          })(line);
          this.size = this.rest ? lineNo(lst(this.rest)) - lineN + 1 : 1;
          this.node = this.text = null;
          this.hidden = lineIsHidden(documentModel, line);
        }
        function buildViewArray(editor, from, toLine) {
          for (var nextPos, array = [], position = from; position < toLine; position = nextPos) {
            var view = new LineView(editor.doc, getLine(editor.doc, position), position);
            nextPos = position + view.size;
            array.push(view);
          }
          return array;
        }
        var operationGroup = null;
        var orphanDelayedCallbacks = null;
        function signalLater(emitter, type) {
          var items = getHandlers(emitter, type);
          if (items.length) {
            var list,
              args = Array.prototype.slice.call(arguments, 2);
            if (operationGroup) {
              list = operationGroup.delayedCallbacks;
            } else {
              if (orphanDelayedCallbacks) {
                list = orphanDelayedCallbacks;
              } else {
                list = orphanDelayedCallbacks = [];
                setTimeout(fireOrphanDelayed, 0);
              }
            }
            for (
              var loop = Object.defineProperty(
                  function (handlerIndex) {
                    list.push(function () {
                      return items[handlerIndex].apply(null, args);
                    });
                  },
                  'name',
                  { value: 'o', configurable: true },
                ),
                handlerIndex = 0;
              handlerIndex < items.length;
              ++handlerIndex
            ) {
              loop(handlerIndex);
            }
          }
        }
        function fireOrphanDelayed() {
          var delayed = orphanDelayedCallbacks;
          orphanDelayedCallbacks = null;
          for (var callbackIndex = 0; callbackIndex < delayed.length; ++callbackIndex) {
            delayed[callbackIndex]();
          }
        }
        function updateLineForChanges(editor, lineView, lineN, dims) {
          for (var changeIndex = 0; changeIndex < lineView.changes.length; changeIndex++) {
            var type = lineView.changes[changeIndex];
            if ('text' == type) {
              updateLineText(editor, lineView);
            } else {
              if ('gutter' == type) {
                updateLineGutter(editor, lineView, lineN, dims);
              } else {
                if ('class' == type) {
                  updateLineClasses(editor, lineView);
                } else {
                  if ('widget' == type) {
                    updateLineWidgets(editor, lineView, dims);
                  }
                }
              }
            }
          }
          lineView.changes = null;
        }
        function ensureLineWrapped(lineView) {
          if (lineView.node == lineView.text) {
            lineView.node = createElement('div', null, null, 'position: relative');
            if (lineView.text.parentNode) {
              lineView.text.parentNode.replaceChild(lineView.node, lineView.text);
            }
            lineView.node.appendChild(lineView.text);
            if (isInternetExplorer && ie_version < 8) {
              lineView.node.style.zIndex = 2;
            }
          }
          return lineView.node;
        }
        function getLineContent(editor, lineView) {
          var ext = editor.display.externalMeasured;
          if (ext && ext.line == lineView.line) {
            editor.display.externalMeasured = null;
            lineView.measure = ext.measure;
            return ext.built;
          } else {
            return buildLineContent(editor, lineView);
          }
        }
        function updateLineText(editor, lineView) {
          var cls = lineView.text.className,
            built = getLineContent(editor, lineView);
          if (lineView.text == lineView.node) {
            lineView.node = built.pre;
          }
          lineView.text.parentNode.replaceChild(built.pre, lineView.text);
          lineView.text = built.pre;
          if (built.bgClass != lineView.bgClass || built.textClass != lineView.textClass) {
            lineView.bgClass = built.bgClass;
            lineView.textClass = built.textClass;
            updateLineClasses(editor, lineView);
          } else {
            if (cls) {
              lineView.text.className = cls;
            }
          }
        }
        function updateLineClasses(editor, lineView) {
          !(function (editor, lineView) {
            var cls = lineView.bgClass
              ? lineView.bgClass + ' ' + (lineView.line.bgClass || '')
              : lineView.line.bgClass;
            if (cls) {
              cls += ' CodeMirror-linebackground';
            }
            if (lineView.background) {
              if (cls) {
                lineView.background.className = cls;
              } else {
                lineView.background.parentNode.removeChild(lineView.background);
                lineView.background = null;
              }
            } else {
              if (cls) {
                var wrap = ensureLineWrapped(lineView);
                lineView.background = wrap.insertBefore(
                  createElement('div', null, cls),
                  wrap.firstChild,
                );
                editor.display.input.setUneditable(lineView.background);
              }
            }
          })(editor, lineView);
          if (lineView.line.wrapClass) {
            ensureLineWrapped(lineView).className = lineView.line.wrapClass;
          } else {
            if (lineView.node != lineView.text) {
              lineView.node.className = '';
            }
          }
          var textClass = lineView.textClass
            ? lineView.textClass + ' ' + (lineView.line.textClass || '')
            : lineView.line.textClass;
          lineView.text.className = textClass || '';
        }
        function updateLineGutter(editor, lineView, lineN, dims) {
          if (lineView.gutter) {
            lineView.node.removeChild(lineView.gutter);
            lineView.gutter = null;
          }
          if (lineView.gutterBackground) {
            lineView.node.removeChild(lineView.gutterBackground);
            lineView.gutterBackground = null;
          }
          if (lineView.line.gutterClass) {
            var wrap = ensureLineWrapped(lineView);
            lineView.gutterBackground = createElement(
              'div',
              null,
              'CodeMirror-gutter-background ' + lineView.line.gutterClass,
              'left: ' +
                (editor.options.fixedGutter ? dims.fixedPos : -dims.gutterTotalWidth) +
                'px; width: ' +
                dims.gutterTotalWidth +
                'px',
            );
            editor.display.input.setUneditable(lineView.gutterBackground);
            wrap.insertBefore(lineView.gutterBackground, lineView.text);
          }
          var markers = lineView.line.gutterMarkers;
          if (editor.options.lineNumbers || markers) {
            var lineNumberVisibilityClass =
                0 === lineN || lineN === editor.lineCount() - 1 || (lineN + 1) % 10 == 0
                  ? ' CodeMirror-linenumber-show'
                  : '',
              wrap$1 = ensureLineWrapped(lineView),
              gutterWrap = (lineView.gutter = createElement(
                'div',
                null,
                'CodeMirror-gutter-wrapper',
                'left: ' +
                  (editor.options.fixedGutter ? dims.fixedPos : -dims.gutterTotalWidth) +
                  'px',
              ));
            editor.display.input.setUneditable(gutterWrap);
            wrap$1.insertBefore(gutterWrap, lineView.text);
            if (lineView.line.gutterClass) {
              gutterWrap.className += ' ' + lineView.line.gutterClass;
            }
            if (!(!editor.options.lineNumbers || (markers && markers['CodeMirror-linenumbers']))) {
              lineView.lineNumber = gutterWrap.appendChild(
                createElement(
                  'div',
                  lineNumberFor(editor.options, lineN),
                  'CodeMirror-linenumber CodeMirror-gutter-elt' + lineNumberVisibilityClass,
                  'left: ' +
                    dims.gutterLeft['CodeMirror-linenumbers'] +
                    'px; width: ' +
                    editor.display.lineNumInnerWidth +
                    'px',
                ),
              );
            }
            if (markers) {
              for (
                var gutterIndex = 0;
                gutterIndex < editor.options.gutters.length;
                ++gutterIndex
              ) {
                var gutterId = editor.options.gutters[gutterIndex],
                  found = markers.hasOwnProperty(gutterId) && markers[gutterId];
                if (found) {
                  gutterWrap.appendChild(
                    createElement(
                      'div',
                      [found],
                      'CodeMirror-gutter-elt',
                      'left: ' +
                        dims.gutterLeft[gutterId] +
                        'px; width: ' +
                        dims.gutterWidth[gutterId] +
                        'px',
                    ),
                  );
                }
              }
            }
          }
        }
        function updateLineWidgets(editor, lineView, dims) {
          if (lineView.alignable) {
            lineView.alignable = null;
          }
          for (var node = lineView.node.firstChild, next = void 0; node; node = next) {
            next = node.nextSibling;
            if ('CodeMirror-linewidget' == node.className) {
              lineView.node.removeChild(node);
            }
          }
          insertLineWidgets(editor, lineView, dims);
        }
        function buildLineElement(editor, lineView, lineN, dims) {
          var built = getLineContent(editor, lineView);
          lineView.text = lineView.node = built.pre;
          if (built.bgClass) {
            lineView.bgClass = built.bgClass;
          }
          if (built.textClass) {
            lineView.textClass = built.textClass;
          }
          updateLineClasses(editor, lineView);
          updateLineGutter(editor, lineView, lineN, dims);
          insertLineWidgets(editor, lineView, dims);
          return lineView.node;
        }
        function insertLineWidgets(editor, lineView, dims) {
          insertLineWidgetsFor(editor, lineView.line, lineView, dims, true);
          if (lineView.rest) {
            for (var widgetIndex = 0; widgetIndex < lineView.rest.length; widgetIndex++) {
              insertLineWidgetsFor(editor, lineView.rest[widgetIndex], lineView, dims, false);
            }
          }
        }
        function insertLineWidgetsFor(editor, line, lineView, dims, allowAbove) {
          if (line.widgets) {
            for (
              var wrap = ensureLineWrapped(lineView), widgetIndex = 0, widgets = line.widgets;
              widgetIndex < widgets.length;
              ++widgetIndex
            ) {
              var widget = widgets[widgetIndex],
                node = createElement('div', [widget.node], 'CodeMirror-linewidget');
              if (!widget.handleMouseEvents) {
                node.setAttribute('cm-ignore-events', 'true');
              }
              positionLineWidget(widget, node, lineView, dims);
              editor.display.input.setUneditable(node);
              if (allowAbove && widget.above) {
                wrap.insertBefore(node, lineView.gutter || lineView.text);
              } else {
                wrap.appendChild(node);
              }
              signalLater(widget, 'redraw');
            }
          }
        }
        function positionLineWidget(widget, node, lineView, dims) {
          if (widget.noHScroll) {
            (lineView.alignable || (lineView.alignable = [])).push(node);
            var width = dims.wrapperWidth;
            node.style.left = dims.fixedPos + 'px';
            if (!widget.coverGutter) {
              width -= dims.gutterTotalWidth;
              node.style.paddingLeft = dims.gutterTotalWidth + 'px';
            }
            node.style.width = width + 'px';
          }
          if (widget.coverGutter) {
            node.style.zIndex = 5;
            node.style.position = 'relative';
            if (!widget.noHScroll) {
              node.style.marginLeft = -dims.gutterTotalWidth + 'px';
            }
          }
        }
        function widgetHeight(widget) {
          if (null != widget.height) {
            return widget.height;
          }
          var editor = widget.doc.cm;
          if (!editor) {
            return 0;
          }
          if (!contains(document.body, widget.node)) {
            var parentStyle = 'position: relative;';
            if (widget.coverGutter) {
              parentStyle += 'margin-left: -' + editor.display.gutters.offsetWidth + 'px;';
            }
            if (widget.noHScroll) {
              parentStyle += 'width: ' + editor.display.wrapper.clientWidth + 'px;';
            }
            removeChildrenAndAdd(
              editor.display.measure,
              createElement('div', [widget.node], null, parentStyle),
            );
          }
          return (widget.height = widget.node.parentNode.offsetHeight);
        }
        function eventInWidget(display, event, checkScrollbar) {
          for (
            var targetNode = e_target(event);
            targetNode != display.wrapper;
            targetNode = targetNode.parentNode
          ) {
            if (
              checkScrollbar &&
              targetNode == event.target &&
              targetNode == display.scroller &&
              display.scroller.scrollWidth > display.scroller.clientWidth &&
              display.scroller.getBoundingClientRect().bottom < event.clientY + 20
            ) {
              return true;
            }
            if (
              !targetNode ||
              (1 == targetNode.nodeType && 'true' == targetNode.getAttribute('cm-ignore-events')) ||
              (targetNode.parentNode == display.sizer && targetNode != display.mover)
            ) {
              return true;
            }
          }
        }
        function paddingTop(display) {
          return display.lineSpace.offsetTop;
        }
        function paddingVert(display) {
          return display.mover.offsetHeight - display.lineSpace.offsetHeight;
        }
        function paddingH(display) {
          if (display.cachedPaddingH) {
            return display.cachedPaddingH;
          }
          var measurementElement = removeChildrenAndAdd(display.measure, createElement('pre', 'x')),
            style = window.getComputedStyle
              ? window.getComputedStyle(measurementElement)
              : measurementElement.currentStyle,
            data = { left: parseInt(style.paddingLeft), right: parseInt(style.paddingRight) };
          if (!(isNaN(data.left) || isNaN(data.right))) {
            display.cachedPaddingH = data;
          }
          return data;
        }
        function scrollGap(editor) {
          return scrollerGap - editor.display.nativeBarWidth;
        }
        function displayWidth(editor) {
          return editor.display.scroller.clientWidth - scrollGap(editor) - editor.display.barWidth;
        }
        function displayHeight(editor) {
          return (
            editor.display.scroller.clientHeight - scrollGap(editor) - editor.display.barHeight
          );
        }
        function mapFromLineView(lineView, line, lineN) {
          if (lineView.line == line) {
            return { map: lineView.measure.map, cache: lineView.measure.cache };
          }
          for (var viewIndex = 0; viewIndex < lineView.rest.length; viewIndex++) {
            if (lineView.rest[viewIndex] == line) {
              return {
                map: lineView.measure.maps[viewIndex],
                cache: lineView.measure.caches[viewIndex],
              };
            }
          }
          for (var i$1 = 0; i$1 < lineView.rest.length; i$1++) {
            if (lineNo(lineView.rest[i$1]) > lineN) {
              return {
                map: lineView.measure.maps[i$1],
                cache: lineView.measure.caches[i$1],
                before: true,
              };
            }
          }
        }
        function measureChar(editor, line, characterOffset, bias) {
          return measureCharPrepared(
            editor,
            prepareMeasureForLine(editor, line),
            characterOffset,
            bias,
          );
        }
        function findViewForLine(editor, lineN) {
          if (lineN >= editor.display.viewFrom && lineN < editor.display.viewTo) {
            return editor.display.view[findViewIndex(editor, lineN)];
          }
          var ext = editor.display.externalMeasured;
          if (ext && lineN >= ext.lineN && lineN < ext.lineN + ext.size) {
            return ext;
          } else {
            return void 0;
          }
        }
        function prepareMeasureForLine(editor, line) {
          var lineN = lineNo(line),
            view = findViewForLine(editor, lineN);
          if (view && !view.text) {
            view = null;
          } else {
            if (view && view.changes) {
              updateLineForChanges(editor, view, lineN, getDimensions(editor));
              editor.curOp.forceUpdate = true;
            }
          }
          if (!view) {
            view = (function (editor, line) {
              var lineN = lineNo((line = visualLine(line))),
                view = (editor.display.externalMeasured = new LineView(editor.doc, line, lineN));
              view.lineN = lineN;
              var built = (view.built = buildLineContent(editor, view));
              view.text = built.pre;
              removeChildrenAndAdd(editor.display.lineMeasure, built.pre);
              return view;
            })(editor, line);
          }
          var info = mapFromLineView(view, line, lineN);
          return {
            line: line,
            view: view,
            rect: null,
            map: info.map,
            cache: info.cache,
            before: info.before,
            hasHeights: false,
          };
        }
        function measureCharPrepared(editor, prepared, characterOffset, bias, varHeight) {
          if (prepared.before) {
            characterOffset = -1;
          }
          var found,
            key = characterOffset + (bias || '');
          if (prepared.cache.hasOwnProperty(key)) {
            found = prepared.cache[key];
          } else {
            if (!prepared.rect) {
              prepared.rect = prepared.view.text.getBoundingClientRect();
            }
            if (!prepared.hasHeights) {
              !(function (editor, lineView, rect) {
                var wrapping = editor.options.lineWrapping,
                  curWidth = wrapping && displayWidth(editor);
                if (!lineView.measure.heights || (wrapping && lineView.measure.width != curWidth)) {
                  var heights = (lineView.measure.heights = []);
                  if (wrapping) {
                    lineView.measure.width = curWidth;
                    for (
                      var rects = lineView.text.firstChild.getClientRects(), cacheIndex = 0;
                      cacheIndex < rects.length - 1;
                      cacheIndex++
                    ) {
                      var cur = rects[cacheIndex],
                        next = rects[cacheIndex + 1];
                      if (Math.abs(cur.bottom - next.bottom) > 2) {
                        heights.push((cur.bottom + next.top) / 2 - rect.top);
                      }
                    }
                  }
                  heights.push(rect.bottom - rect.top);
                }
              })(editor, prepared.view, prepared.rect);
              prepared.hasHeights = true;
            }
            if (
              !(found = (function (editor, prepared, characterOffset, bias) {
                var rect,
                  place = nodeAndOffsetInLineMap(prepared.map, characterOffset, bias),
                  node = place.node,
                  start = place.start,
                  end = place.end,
                  collapse = place.collapse;
                if (3 == node.nodeType) {
                  for (var i$1 = 0; i$1 < 4; i$1++) {
                    for (
                      ;
                      start && isExtendingChar(prepared.line.text.charAt(place.coverStart + start));
                    ) {
                      --start;
                    }
                    for (
                      ;
                      place.coverStart + end < place.coverEnd &&
                      isExtendingChar(prepared.line.text.charAt(place.coverStart + end));
                    ) {
                      ++end;
                    }
                    if (
                      (rect =
                        isInternetExplorer &&
                        ie_version < 9 &&
                        0 == start &&
                        end == place.coverEnd - place.coverStart
                          ? node.parentNode.getBoundingClientRect()
                          : getUsefulRect(range(node, start, end).getClientRects(), bias)).left ||
                      rect.right ||
                      0 == start
                    ) {
                      break;
                    }
                    end = start;
                    start -= 1;
                    collapse = 'right';
                  }
                  if (isInternetExplorer && ie_version < 11) {
                    rect = (function (measure, rect) {
                      if (
                        !window.screen ||
                        null == screen.logicalXDPI ||
                        screen.logicalXDPI == screen.deviceXDPI ||
                        !(function (measure) {
                          if (null != badZoomedRects) {
                            return badZoomedRects;
                          }
                          var node = removeChildrenAndAdd(measure, createElement('span', 'x')),
                            normal = node.getBoundingClientRect(),
                            fromRange = range(node, 0, 1).getBoundingClientRect();
                          return (badZoomedRects = Math.abs(normal.left - fromRange.left) > 1);
                        })(measure)
                      ) {
                        return rect;
                      }
                      var scaleX = screen.logicalXDPI / screen.deviceXDPI,
                        scaleY = screen.logicalYDPI / screen.deviceYDPI;
                      return {
                        left: rect.left * scaleX,
                        right: rect.right * scaleX,
                        top: rect.top * scaleY,
                        bottom: rect.bottom * scaleY,
                      };
                    })(editor.display.measure, rect);
                  }
                } else {
                  var rects;
                  if (start > 0) {
                    collapse = bias = 'right';
                  }
                  rect =
                    editor.options.lineWrapping && (rects = node.getClientRects()).length > 1
                      ? rects['right' == bias ? rects.length - 1 : 0]
                      : node.getBoundingClientRect();
                }
                if (
                  isInternetExplorer &&
                  ie_version < 9 &&
                  !start &&
                  (!rect || (!rect.left && !rect.right))
                ) {
                  var rSpan = node.parentNode.getClientRects()[0];
                  rect = rSpan
                    ? {
                        left: rSpan.left,
                        right: rSpan.left + charWidth(editor.display),
                        top: rSpan.top,
                        bottom: rSpan.bottom,
                      }
                    : nullRect;
                }
                for (
                  var rtop = rect.top - prepared.rect.top,
                    rbot = rect.bottom - prepared.rect.top,
                    mid = (rtop + rbot) / 2,
                    heights = prepared.view.measure.heights,
                    rectIndex = 0;
                  rectIndex < heights.length - 1 && !(mid < heights[rectIndex]);
                  rectIndex++
                ) {}
                var top = rectIndex ? heights[rectIndex - 1] : 0,
                  bot = heights[rectIndex],
                  result = {
                    left: ('right' == collapse ? rect.right : rect.left) - prepared.rect.left,
                    right: ('left' == collapse ? rect.left : rect.right) - prepared.rect.left,
                    top: top,
                    bottom: bot,
                  };
                if (!(rect.left || rect.right)) {
                  result.bogus = true;
                }
                if (!editor.options.singleCursorHeightPerLine) {
                  result.rtop = rtop;
                  result.rbottom = rbot;
                }
                return result;
              })(editor, prepared, characterOffset, bias)).bogus
            ) {
              prepared.cache[key] = found;
            }
          }
          return {
            left: found.left,
            right: found.right,
            top: varHeight ? found.rtop : found.top,
            bottom: varHeight ? found.rbottom : found.bottom,
          };
        }
        var measureText,
          nullRect = { left: 0, right: 0, top: 0, bottom: 0 };
        function nodeAndOffsetInLineMap(map$$1, characterOffset, bias) {
          for (
            var node, start, end, collapse, mStart, mEnd, mapIndex = 0;
            mapIndex < map$$1.length;
            mapIndex += 3
          ) {
            mStart = map$$1[mapIndex];
            mEnd = map$$1[mapIndex + 1];
            if (characterOffset < mStart) {
              start = 0;
              end = 1;
              collapse = 'left';
            } else {
              if (characterOffset < mEnd) {
                end = (start = characterOffset - mStart) + 1;
              } else {
                if (
                  mapIndex == map$$1.length - 3 ||
                  (characterOffset == mEnd && map$$1[mapIndex + 3] > characterOffset)
                ) {
                  start = (end = mEnd - mStart) - 1;
                  if (characterOffset >= mEnd) {
                    collapse = 'right';
                  }
                }
              }
            }
            if (null != start) {
              node = map$$1[mapIndex + 2];
              if (mStart == mEnd && bias == (node.insertLeft ? 'left' : 'right')) {
                collapse = bias;
              }
              if ('left' == bias && 0 == start) {
                for (
                  ;
                  mapIndex &&
                  map$$1[mapIndex - 2] == map$$1[mapIndex - 3] &&
                  map$$1[mapIndex - 1].insertLeft;
                ) {
                  node = map$$1[2 + (mapIndex -= 3)];
                  collapse = 'left';
                }
              }
              if ('right' == bias && start == mEnd - mStart) {
                for (
                  ;
                  mapIndex < map$$1.length - 3 &&
                  map$$1[mapIndex + 3] == map$$1[mapIndex + 4] &&
                  !map$$1[mapIndex + 5].insertLeft;
                ) {
                  node = map$$1[(mapIndex += 3) + 2];
                  collapse = 'right';
                }
              }
              break;
            }
          }
          return {
            node: node,
            start: start,
            end: end,
            collapse: collapse,
            coverStart: mStart,
            coverEnd: mEnd,
          };
        }
        function getUsefulRect(rects, bias) {
          var rect = nullRect;
          if ('left' == bias) {
            for (
              var lineIndex = 0;
              lineIndex < rects.length && (rect = rects[lineIndex]).left == rect.right;
              lineIndex++
            ) {}
          } else {
            for (
              var i$1 = rects.length - 1;
              i$1 >= 0 && (rect = rects[i$1]).left == rect.right;
              i$1--
            ) {}
          }
          return rect;
        }
        function clearLineMeasurementCacheFor(lineView) {
          if (
            lineView.measure &&
            ((lineView.measure.cache = {}), (lineView.measure.heights = null), lineView.rest)
          ) {
            for (var lineIndex = 0; lineIndex < lineView.rest.length; lineIndex++) {
              lineView.measure.caches[lineIndex] = {};
            }
          }
        }
        function clearLineMeasurementCache(editor) {
          editor.display.externalMeasure = null;
          removeChildren(editor.display.lineMeasure);
          for (var mapIndex = 0; mapIndex < editor.display.view.length; mapIndex++) {
            clearLineMeasurementCacheFor(editor.display.view[mapIndex]);
          }
        }
        function clearCaches(editor) {
          clearLineMeasurementCache(editor);
          editor.display.cachedCharWidth =
            editor.display.cachedTextHeight =
            editor.display.cachedPaddingH =
              null;
          if (!editor.options.lineWrapping) {
            editor.display.maxLineChanged = true;
          }
          editor.display.lineNumChars = null;
        }
        function pageScrollX() {
          if (chrome && android) {
            return -(
              document.body.getBoundingClientRect().left -
              parseInt(getComputedStyle(document.body).marginLeft)
            );
          } else {
            return window.pageXOffset || (document.documentElement || document.body).scrollLeft;
          }
        }
        function pageScrollY() {
          if (chrome && android) {
            return -(
              document.body.getBoundingClientRect().top -
              parseInt(getComputedStyle(document.body).marginTop)
            );
          } else {
            return window.pageYOffset || (document.documentElement || document.body).scrollTop;
          }
        }
        function intoCoordSystem(editor, lineObj, rect, context, includeWidgets) {
          if (!includeWidgets && lineObj.widgets) {
            for (var lineIndex = 0; lineIndex < lineObj.widgets.length; ++lineIndex) {
              if (lineObj.widgets[lineIndex].above) {
                var size = widgetHeight(lineObj.widgets[lineIndex]);
                rect.top += size;
                rect.bottom += size;
              }
            }
          }
          if ('line' == context) {
            return rect;
          }
          if (!context) {
            context = 'local';
          }
          var yOff = heightAtLine(lineObj);
          if ('local' == context) {
            yOff += paddingTop(editor.display);
          } else {
            yOff -= editor.display.viewOffset;
          }
          if ('page' == context || 'window' == context) {
            var lOff = editor.display.lineSpace.getBoundingClientRect();
            yOff += lOff.top + ('window' == context ? 0 : pageScrollY());
            var xOff = lOff.left + ('window' == context ? 0 : pageScrollX());
            rect.left += xOff;
            rect.right += xOff;
          }
          rect.top += yOff;
          rect.bottom += yOff;
          return rect;
        }
        function fromCoordSystem(editor, coords, context) {
          if ('div' == context) {
            return coords;
          }
          var left = coords.left,
            top = coords.top;
          if ('page' == context) {
            left -= pageScrollX();
            top -= pageScrollY();
          } else {
            if ('local' == context || !context) {
              var localBox = editor.display.sizer.getBoundingClientRect();
              left += localBox.left;
              top += localBox.top;
            }
          }
          var lineSpaceBox = editor.display.lineSpace.getBoundingClientRect();
          return { left: left - lineSpaceBox.left, top: top - lineSpaceBox.top };
        }
        function charCoords(editor, position, context, lineObj, bias) {
          if (!lineObj) {
            lineObj = getLine(editor.doc, position.line);
          }
          return intoCoordSystem(
            editor,
            lineObj,
            measureChar(editor, lineObj, position.ch, bias),
            context,
          );
        }
        function cursorCoords(editor, position, context, lineObj, preparedMeasure, varHeight) {
          Object.defineProperty(get, 'name', { value: 'a', configurable: true });
          Object.defineProperty(getBidi, 'name', { value: 'd', configurable: true });

          function get(characterOffset, right) {
            var characterBounds = measureCharPrepared(
              editor,
              preparedMeasure,
              characterOffset,
              right ? 'right' : 'left',
              varHeight,
            );
            if (right) {
              characterBounds.left = characterBounds.right;
            } else {
              characterBounds.right = characterBounds.left;
            }
            return intoCoordSystem(editor, lineObj, characterBounds, context);
          }
          lineObj = lineObj || getLine(editor.doc, position.line);
          if (!preparedMeasure) {
            preparedMeasure = prepareMeasureForLine(editor, lineObj);
          }
          var order = getOrder(lineObj, editor.doc.direction),
            characterOffset = position.ch,
            sticky = position.sticky;
          if (characterOffset >= lineObj.text.length) {
            characterOffset = lineObj.text.length;
            sticky = 'before';
          } else {
            if (characterOffset <= 0) {
              characterOffset = 0;
              sticky = 'after';
            }
          }
          if (!order) {
            return get(
              'before' == sticky ? characterOffset - 1 : characterOffset,
              'before' == sticky,
            );
          }
          function getBidi(characterOffset, partPos, invert) {
            var rightToLeft = order[partPos].level % 2 != 0;
            return get(invert ? characterOffset - 1 : characterOffset, rightToLeft != invert);
          }
          var partPos = getBidiPartAt(order, characterOffset, sticky),
            other = bidiOther,
            val = getBidi(characterOffset, partPos, 'before' == sticky);
          if (null != other) {
            val.other = getBidi(characterOffset, other, 'before' != sticky);
          }
          return val;
        }
        function estimateCoords(editor, position) {
          var left = 0;
          position = clipPos(editor.doc, position);
          if (!editor.options.lineWrapping) {
            left = charWidth(editor.display) * position.ch;
          }
          var lineObj = getLine(editor.doc, position.line),
            top = heightAtLine(lineObj) + paddingTop(editor.display);
          return { left: left, right: left, top: top, bottom: top + lineObj.height };
        }
        function PosWithInfo(line, characterOffset, sticky, outside, xRel) {
          var position = Pos(line, characterOffset, sticky);
          position.xRel = xRel;
          if (outside) {
            position.outside = true;
          }
          return position;
        }
        function coordsChar(editor, x, y) {
          var documentModel = editor.doc;
          if ((y += editor.display.viewOffset) < 0) {
            return PosWithInfo(documentModel.first, 0, null, true, -1);
          }
          var lineN = lineAtHeight(documentModel, y),
            last = documentModel.first + documentModel.size - 1;
          if (lineN > last) {
            return PosWithInfo(
              documentModel.first + documentModel.size - 1,
              getLine(documentModel, last).text.length,
              null,
              true,
              1,
            );
          }
          if (x < 0) {
            x = 0;
          }
          for (var lineObj = getLine(documentModel, lineN); ; ) {
            var found = coordsCharInner(editor, lineObj, lineN, x, y),
              merged = collapsedSpanAtEnd(lineObj),
              mergedPos = merged && merged.find(0, true);
            if (
              !merged ||
              !(found.ch > mergedPos.from.ch || (found.ch == mergedPos.from.ch && found.xRel > 0))
            ) {
              return found;
            }
            lineN = lineNo((lineObj = mergedPos.to.line));
          }
        }
        function wrappedLineExtent(editor, lineObj, preparedMeasure, y) {
          var measure = Object.defineProperty(
              function (characterOffset) {
                return intoCoordSystem(
                  editor,
                  lineObj,
                  measureCharPrepared(editor, preparedMeasure, characterOffset),
                  'line',
                );
              },
              'name',
              { value: 'r', configurable: true },
            ),
            end = lineObj.text.length,
            begin = findFirst(
              function (characterOffset) {
                return measure(characterOffset - 1).bottom <= y;
              },
              end,
              0,
            );
          return {
            begin: begin,
            end: (end = findFirst(
              function (characterOffset) {
                return measure(characterOffset).top > y;
              },
              begin,
              end,
            )),
          };
        }
        function wrappedLineExtentChar(editor, lineObj, preparedMeasure, target) {
          return wrappedLineExtent(
            editor,
            lineObj,
            preparedMeasure,
            intoCoordSystem(
              editor,
              lineObj,
              measureCharPrepared(editor, preparedMeasure, target),
              'line',
            ).top,
          );
        }
        function coordsCharInner(editor, lineObj, lineNo$$1, x, y) {
          y -= heightAtLine(lineObj);
          var position,
            begin = 0,
            end = lineObj.text.length,
            preparedMeasure = prepareMeasureForLine(editor, lineObj);
          if (getOrder(lineObj, editor.doc.direction)) {
            var assign;
            if (editor.options.lineWrapping) {
              begin = (assign = wrappedLineExtent(editor, lineObj, preparedMeasure, y)).begin;
              end = assign.end;
            }
            position = new Pos(lineNo$$1, begin);
            var prevDiff,
              prevPos,
              beginLeft = cursorCoords(editor, position, 'line', lineObj, preparedMeasure).left,
              dir = beginLeft < x ? 1 : -1,
              diff = beginLeft - x;
            do {
              prevDiff = diff;
              prevPos = position;
              if (
                null == (position = moveVisually(editor, lineObj, position, dir)) ||
                position.ch < begin ||
                end <= ('before' == position.sticky ? position.ch - 1 : position.ch)
              ) {
                position = prevPos;
                break;
              }
              diff = cursorCoords(editor, position, 'line', lineObj, preparedMeasure).left - x;
            } while (dir < 0 != diff < 0 && Math.abs(diff) <= Math.abs(prevDiff));
            if (Math.abs(diff) > Math.abs(prevDiff)) {
              if (diff < 0 == prevDiff < 0) {
                throw new Error('Broke out of infinite loop in coordsCharInner');
              }
              position = prevPos;
            }
          } else {
            var characterOffset = findFirst(
              function (characterOffset) {
                var box = intoCoordSystem(
                  editor,
                  lineObj,
                  measureCharPrepared(editor, preparedMeasure, characterOffset),
                  'line',
                );
                if (box.top > y) {
                  end = Math.min(characterOffset, end);
                  return true;
                } else {
                  return (
                    !(box.bottom <= y) &&
                    (box.left > x || (!(box.right < x) && x - box.left < box.right - x))
                  );
                }
              },
              begin,
              end,
            );
            position = new Pos(
              lineNo$$1,
              (characterOffset = skipExtendingChars(lineObj.text, characterOffset, 1)),
              characterOffset == end ? 'before' : 'after',
            );
          }
          var coords = cursorCoords(editor, position, 'line', lineObj, preparedMeasure);
          if (y < coords.top || coords.bottom < y) {
            position.outside = true;
          }
          position.xRel = x < coords.left ? -1 : x > coords.right ? 1 : 0;
          return position;
        }
        function textHeight(display) {
          if (null != display.cachedTextHeight) {
            return display.cachedTextHeight;
          }
          if (null == measureText) {
            measureText = createElement('pre');
            for (var sampleIndex = 0; sampleIndex < 49; ++sampleIndex) {
              measureText.appendChild(document.createTextNode('x'));
              measureText.appendChild(createElement('br'));
            }
            measureText.appendChild(document.createTextNode('x'));
          }
          removeChildrenAndAdd(display.measure, measureText);
          var height = measureText.offsetHeight / 50;
          if (height > 3) {
            display.cachedTextHeight = height;
          }
          removeChildren(display.measure);
          return height || 1;
        }
        function charWidth(display) {
          if (null != display.cachedCharWidth) {
            return display.cachedCharWidth;
          }
          var anchor = createElement('span', 'xxxxxxxxxx'),
            pre = createElement('pre', [anchor]);
          removeChildrenAndAdd(display.measure, pre);
          var rect = anchor.getBoundingClientRect(),
            width = (rect.right - rect.left) / 10;
          if (width > 2) {
            display.cachedCharWidth = width;
          }
          return width || 10;
        }
        function getDimensions(editor) {
          for (
            var display = editor.display,
              left = {},
              width = {},
              gutterLeft = display.gutters.clientLeft,
              gutterElement = display.gutters.firstChild,
              gutterIndex = 0;
            gutterElement;
            gutterElement = gutterElement.nextSibling, ++gutterIndex
          ) {
            left[editor.options.gutters[gutterIndex]] =
              gutterElement.offsetLeft + gutterElement.clientLeft + gutterLeft;
            width[editor.options.gutters[gutterIndex]] = gutterElement.clientWidth;
          }
          return {
            fixedPos: compensateForHScroll(display),
            gutterTotalWidth: display.gutters.offsetWidth,
            gutterLeft: left,
            gutterWidth: width,
            wrapperWidth: display.wrapper.clientWidth,
          };
        }
        function compensateForHScroll(display) {
          return (
            display.scroller.getBoundingClientRect().left -
            display.sizer.getBoundingClientRect().left
          );
        }
        function estimateHeight(editor) {
          var measuredTextHeight = textHeight(editor.display),
            wrapping = editor.options.lineWrapping,
            perLine =
              wrapping &&
              Math.max(5, editor.display.scroller.clientWidth / charWidth(editor.display) - 3);
          return function (line) {
            if (lineIsHidden(editor.doc, line)) {
              return 0;
            }
            var widgetsHeight = 0;
            if (line.widgets) {
              for (var viewIndex = 0; viewIndex < line.widgets.length; viewIndex++) {
                if (line.widgets[viewIndex].height) {
                  widgetsHeight += line.widgets[viewIndex].height;
                }
              }
            }
            if (wrapping) {
              return (
                widgetsHeight + (Math.ceil(line.text.length / perLine) || 1) * measuredTextHeight
              );
            } else {
              return widgetsHeight + measuredTextHeight;
            }
          };
        }
        function estimateLineHeights(editor) {
          var documentModel = editor.doc,
            est = estimateHeight(editor);
          documentModel.iter(function (line) {
            var estHeight = est(line);
            if (estHeight != line.height) {
              updateLineHeight(line, estHeight);
            }
          });
        }
        function posFromMouse(editor, event, liberal, forRect) {
          var display = editor.display;
          if (!liberal && 'true' == e_target(event).getAttribute('cm-not-content')) {
            return null;
          }
          var x,
            y,
            space = display.lineSpace.getBoundingClientRect();
          try {
            x = event.clientX - space.left;
            y = event.clientY - space.top;
          } catch (positionError) {
            return null;
          }
          var line,
            coords = coordsChar(editor, x, y);
          if (
            forRect &&
            1 == coords.xRel &&
            (line = getLine(editor.doc, coords.line).text).length == coords.ch
          ) {
            var colDiff = countColumn(line, line.length, editor.options.tabSize) - line.length;
            coords = Pos(
              coords.line,
              Math.max(
                0,
                Math.round((x - paddingH(editor.display).left) / charWidth(editor.display)) -
                  colDiff,
              ),
            );
          }
          return coords;
        }
        function findViewIndex(editor, lineNumber) {
          if (lineNumber >= editor.display.viewTo) {
            return null;
          }
          if ((lineNumber -= editor.display.viewFrom) < 0) {
            return null;
          }
          for (
            var view = editor.display.view, childIndex = 0;
            childIndex < view.length;
            childIndex++
          ) {
            if ((lineNumber -= view[childIndex].size) < 0) {
              return childIndex;
            }
          }
        }
        function updateSelection(editor) {
          editor.display.input.showSelection(editor.display.input.prepareSelection());
        }
        function prepareSelection(editor, primary) {
          for (
            var documentModel = editor.doc,
              result = {},
              curFragment = (result.cursors = document.createDocumentFragment()),
              selFragment = (result.selection = document.createDocumentFragment()),
              rangeIndex = 0;
            rangeIndex < documentModel.sel.ranges.length;
            rangeIndex++
          ) {
            if (false !== primary || rangeIndex != documentModel.sel.primIndex) {
              var range$$1 = documentModel.sel.ranges[rangeIndex];
              if (
                !(
                  range$$1.from().line >= editor.display.viewTo ||
                  range$$1.to().line < editor.display.viewFrom
                )
              ) {
                var collapsed = range$$1.empty();
                if (collapsed || editor.options.showCursorWhenSelecting) {
                  drawSelectionCursor(editor, range$$1.head, curFragment);
                }
                if (!collapsed) {
                  drawSelectionRange(editor, range$$1, selFragment);
                }
              }
            }
          }
          return result;
        }
        function drawSelectionCursor(editor, head, output) {
          var position = cursorCoords(
              editor,
              head,
              'div',
              null,
              null,
              !editor.options.singleCursorHeightPerLine,
            ),
            cursor = output.appendChild(createElement('div', ' ', 'CodeMirror-cursor'));
          cursor.style.left = position.left + 'px';
          cursor.style.top = position.top + 'px';
          cursor.style.height =
            Math.max(0, position.bottom - position.top) * editor.options.cursorHeight + 'px';
          if (position.other) {
            var otherCursor = output.appendChild(
              createElement('div', ' ', 'CodeMirror-cursor CodeMirror-secondarycursor'),
            );
            otherCursor.style.display = '';
            otherCursor.style.left = position.other.left + 'px';
            otherCursor.style.top = position.other.top + 'px';
            otherCursor.style.height = 0.85 * (position.other.bottom - position.other.top) + 'px';
          }
        }
        function drawSelectionRange(editor, range$$1, output) {
          Object.defineProperty(add, 'name', { value: 'c', configurable: true });
          Object.defineProperty(drawForLine, 'name', { value: 'd', configurable: true });

          var display = editor.display,
            documentModel = editor.doc,
            fragment = document.createDocumentFragment(),
            padding = paddingH(editor.display),
            leftSide = padding.left,
            rightSide =
              Math.max(
                display.sizerWidth,
                editor.display.lineDiv.clientWidth - display.sizer.offsetLeft,
              ) - padding.right;
          function add(left, top, width, bottom) {
            if (top < 0) {
              top = 0;
            }
            top = Math.round(top);
            bottom = Math.round(bottom);
            fragment.appendChild(
              createElement(
                'div',
                null,
                'CodeMirror-selected',
                'position: absolute; left: ' +
                  left +
                  'px;\n                             top: ' +
                  top +
                  'px; width: ' +
                  (null == width ? rightSide - left : width) +
                  'px;\n                             height: ' +
                  (bottom - top) +
                  'px',
              ),
            );
          }
          function drawForLine(line, fromArg, toArg) {
            Object.defineProperty(coords, 'name', { value: 'h', configurable: true });

            var start,
              end,
              lineObj = getLine(documentModel, line),
              lineLen = lineObj.text.length;
            function coords(characterOffset, bias) {
              return charCoords(editor, Pos(line, characterOffset), 'div', lineObj, bias);
            }
            (function (order, from, toOffset, callback) {
              if (!order) {
                return callback(from, toOffset, 'ltr');
              }
              for (var found = false, partIndex = 0; partIndex < order.length; ++partIndex) {
                var part = order[partIndex];
                if (
                  (part.from < toOffset && part.to > from) ||
                  (from == toOffset && part.to == from)
                ) {
                  callback(
                    Math.max(part.from, from),
                    Math.min(part.to, toOffset),
                    1 == part.level ? 'rtl' : 'ltr',
                  );
                  found = true;
                }
              }
              if (!found) {
                callback(from, toOffset, 'ltr');
              }
            })(
              getOrder(lineObj, documentModel.direction),
              fromArg || 0,
              null == toArg ? lineLen : toArg,
              function (from, toOffset, dir) {
                var rightPos,
                  left,
                  right,
                  leftPos = coords(from, 'left');
                if (from == toOffset) {
                  rightPos = leftPos;
                  left = right = leftPos.left;
                } else {
                  rightPos = coords(toOffset - 1, 'right');
                  if ('rtl' == dir) {
                    var tmp = leftPos;
                    leftPos = rightPos;
                    rightPos = tmp;
                  }
                  left = leftPos.left;
                  right = rightPos.right;
                }
                if (null == fromArg && 0 == from) {
                  left = leftSide;
                }
                if (rightPos.top - leftPos.top > 3) {
                  add(left, leftPos.top, null, leftPos.bottom);
                  left = leftSide;
                  if (leftPos.bottom < rightPos.top) {
                    add(left, leftPos.bottom, null, rightPos.top);
                  }
                }
                if (null == toArg && toOffset == lineLen) {
                  right = rightSide;
                }
                if (
                  !start ||
                  leftPos.top < start.top ||
                  (leftPos.top == start.top && leftPos.left < start.left)
                ) {
                  start = leftPos;
                }
                if (
                  !end ||
                  rightPos.bottom > end.bottom ||
                  (rightPos.bottom == end.bottom && rightPos.right > end.right)
                ) {
                  end = rightPos;
                }
                if (left < leftSide + 1) {
                  left = leftSide;
                }
                add(left, rightPos.top, right - left, rightPos.bottom);
              },
            );
            return { start: start, end: end };
          }
          var sFrom = range$$1.from(),
            sTo = range$$1.to();
          if (sFrom.line == sTo.line) {
            drawForLine(sFrom.line, sFrom.ch, sTo.ch);
          } else {
            var fromLine = getLine(documentModel, sFrom.line),
              toLine = getLine(documentModel, sTo.line),
              singleVLine = visualLine(fromLine) == visualLine(toLine),
              leftEnd = drawForLine(
                sFrom.line,
                sFrom.ch,
                singleVLine ? fromLine.text.length + 1 : null,
              ).end,
              rightStart = drawForLine(sTo.line, singleVLine ? 0 : null, sTo.ch).start;
            if (singleVLine) {
              if (leftEnd.top < rightStart.top - 2) {
                add(leftEnd.right, leftEnd.top, null, leftEnd.bottom);
                add(leftSide, rightStart.top, rightStart.left, rightStart.bottom);
              } else {
                add(leftEnd.right, leftEnd.top, rightStart.left - leftEnd.right, leftEnd.bottom);
              }
            }
            if (leftEnd.bottom < rightStart.top) {
              add(leftSide, leftEnd.bottom, null, rightStart.top);
            }
          }
          output.appendChild(fragment);
        }
        function restartBlink(editor) {
          if (editor.state.focused) {
            var display = editor.display;
            clearInterval(display.blinker);
            var visible = true;
            display.cursorDiv.style.visibility = '';
            if (editor.options.cursorBlinkRate > 0) {
              display.blinker = setInterval(function () {
                return (display.cursorDiv.style.visibility = (visible = !visible) ? '' : 'hidden');
              }, editor.options.cursorBlinkRate);
            } else {
              if (editor.options.cursorBlinkRate < 0) {
                display.cursorDiv.style.visibility = 'hidden';
              }
            }
          }
        }
        function ensureFocus(editor) {
          if (!editor.state.focused) {
            editor.display.input.focus();
            onFocus(editor);
          }
        }
        function delayBlurEvent(editor) {
          editor.state.delayingBlurEvent = true;
          setTimeout(function () {
            if (editor.state.delayingBlurEvent) {
              editor.state.delayingBlurEvent = false;
              onBlur(editor);
            }
          }, 100);
        }
        function onFocus(editor, event) {
          if (editor.state.delayingBlurEvent) {
            editor.state.delayingBlurEvent = false;
          }
          if ('nocursor' != editor.options.readOnly) {
            if (!editor.state.focused) {
              signal(editor, 'focus', editor, event);
              editor.state.focused = true;
              addClass(editor.display.wrapper, 'CodeMirror-focused');
              if (!(editor.curOp || editor.display.selForContextMenu == editor.doc.sel)) {
                editor.display.input.reset();
                if (webkit) {
                  setTimeout(function () {
                    return editor.display.input.reset(true);
                  }, 20);
                }
              }
              editor.display.input.receivedFocus();
            }
            restartBlink(editor);
          }
        }
        function onBlur(editor, event) {
          if (!editor.state.delayingBlurEvent) {
            if (editor.state.focused) {
              signal(editor, 'blur', editor, event);
              editor.state.focused = false;
              rmClass(editor.display.wrapper, 'CodeMirror-focused');
            }
            clearInterval(editor.display.blinker);
            setTimeout(function () {
              if (!editor.state.focused) {
                editor.display.shift = false;
              }
            }, 150);
          }
        }
        function updateHeightsInViewport(editor) {
          for (
            var display = editor.display, prevBottom = display.lineDiv.offsetTop, widgetIndex = 0;
            widgetIndex < display.view.length;
            widgetIndex++
          ) {
            var cur = display.view[widgetIndex],
              height = void 0;
            if (!cur.hidden) {
              if (isInternetExplorer && ie_version < 8) {
                var bot = cur.node.offsetTop + cur.node.offsetHeight;
                height = bot - prevBottom;
                prevBottom = bot;
              } else {
                var box = cur.node.getBoundingClientRect();
                height = box.bottom - box.top;
              }
              var diff = cur.line.height - height;
              if (height < 2) {
                height = textHeight(display);
              }
              if (
                (diff > 0.001 || diff < -0.001) &&
                (updateLineHeight(cur.line, height), updateWidgetHeight(cur.line), cur.rest)
              ) {
                for (
                  var nestedWidgetIndex = 0;
                  nestedWidgetIndex < cur.rest.length;
                  nestedWidgetIndex++
                ) {
                  updateWidgetHeight(cur.rest[nestedWidgetIndex]);
                }
              }
            }
          }
        }
        function updateWidgetHeight(line) {
          if (line.widgets) {
            for (var lineIndex = 0; lineIndex < line.widgets.length; ++lineIndex) {
              line.widgets[lineIndex].height = line.widgets[lineIndex].node.parentNode.offsetHeight;
            }
          }
        }
        function visibleLines(display, documentModel, viewport) {
          var top =
            viewport && null != viewport.top
              ? Math.max(0, viewport.top)
              : display.scroller.scrollTop;
          top = Math.floor(top - paddingTop(display));
          var bottom =
              viewport && null != viewport.bottom
                ? viewport.bottom
                : top + display.wrapper.clientHeight,
            from = lineAtHeight(documentModel, top),
            toLine = lineAtHeight(documentModel, bottom);
          if (viewport && viewport.ensure) {
            var ensureFrom = viewport.ensure.from.line,
              ensureTo = viewport.ensure.to.line;
            if (ensureFrom < from) {
              from = ensureFrom;
              toLine = lineAtHeight(
                documentModel,
                heightAtLine(getLine(documentModel, ensureFrom)) + display.wrapper.clientHeight,
              );
            } else {
              if (Math.min(ensureTo, documentModel.lastLine()) >= toLine) {
                from = lineAtHeight(
                  documentModel,
                  heightAtLine(getLine(documentModel, ensureTo)) - display.wrapper.clientHeight,
                );
                toLine = ensureTo;
              }
            }
          }
          return { from: from, to: Math.max(toLine, from + 1) };
        }
        function alignHorizontally(editor) {
          var display = editor.display,
            view = display.view;
          if (display.alignWidgets || (display.gutters.firstChild && editor.options.fixedGutter)) {
            for (
              var comp =
                  compensateForHScroll(display) -
                  display.scroller.scrollLeft +
                  editor.doc.scrollLeft,
                gutterW = display.gutters.offsetWidth,
                left = comp + 'px',
                lineIndex = 0;
              lineIndex < view.length;
              lineIndex++
            ) {
              if (!view[lineIndex].hidden) {
                if (editor.options.fixedGutter) {
                  if (view[lineIndex].gutter) {
                    view[lineIndex].gutter.style.left = left;
                  }
                  if (view[lineIndex].gutterBackground) {
                    view[lineIndex].gutterBackground.style.left = left;
                  }
                }
                var align = view[lineIndex].alignable;
                if (align) {
                  for (var restLineIndex = 0; restLineIndex < align.length; restLineIndex++) {
                    align[restLineIndex].style.left = left;
                  }
                }
              }
            }
            if (editor.options.fixedGutter) {
              display.gutters.style.left = Math.max(0, comp + gutterW) + 'px';
            }
          }
        }
        function maybeUpdateLineNumberWidth(editor) {
          if (!editor.options.lineNumbers) {
            return false;
          }
          var documentModel = editor.doc,
            last = lineNumberFor(editor.options, documentModel.first + documentModel.size - 1),
            display = editor.display;
          if (last.length != display.lineNumChars) {
            var test = display.measure.appendChild(
                createElement(
                  'div',
                  [createElement('div', last)],
                  'CodeMirror-linenumber CodeMirror-gutter-elt',
                ),
              ),
              innerW = test.firstChild.offsetWidth,
              padding = test.offsetWidth - innerW;
            display.lineGutter.style.width = '';
            display.lineNumInnerWidth =
              Math.max(innerW, display.lineGutter.offsetWidth - padding) + padding + 2;
            display.lineNumWidth = display.lineNumInnerWidth + padding;
            display.lineNumChars = display.lineNumInnerWidth ? last.length : -1;
            display.lineGutter.style.width = display.lineNumWidth + 'px';
            updateGutterSpace(editor);
            return true;
          }
          return false;
        }
        function calculateScrollPos(editor, rect) {
          var display = editor.display,
            snapMargin = textHeight(editor.display);
          if (rect.top < 0) {
            rect.top = 0;
          }
          var screentop =
              editor.curOp && null != editor.curOp.scrollTop
                ? editor.curOp.scrollTop
                : display.scroller.scrollTop,
            screen = displayHeight(editor),
            result = {};
          if (rect.bottom - rect.top > screen) {
            rect.bottom = rect.top + screen;
          }
          var docBottom = editor.doc.height + paddingVert(display),
            atTop = rect.top < snapMargin,
            atBottom = rect.bottom > docBottom - snapMargin;
          if (rect.top < screentop) {
            result.scrollTop = atTop ? 0 : rect.top;
          } else {
            if (rect.bottom > screentop + screen) {
              var newTop = Math.min(rect.top, (atBottom ? docBottom : rect.bottom) - screen);
              if (newTop != screentop) {
                result.scrollTop = newTop;
              }
            }
          }
          var screenleft =
              editor.curOp && null != editor.curOp.scrollLeft
                ? editor.curOp.scrollLeft
                : display.scroller.scrollLeft,
            screenw =
              displayWidth(editor) - (editor.options.fixedGutter ? display.gutters.offsetWidth : 0),
            tooWide = rect.right - rect.left > screenw;
          if (tooWide) {
            rect.right = rect.left + screenw;
          }
          if (rect.left < 10) {
            result.scrollLeft = 0;
          } else {
            if (rect.left < screenleft) {
              result.scrollLeft = Math.max(0, rect.left - (tooWide ? 0 : 10));
            } else {
              if (rect.right > screenw + screenleft - 3) {
                result.scrollLeft = rect.right + (tooWide ? 0 : 10) - screenw;
              }
            }
          }
          return result;
        }
        function addToScrollTop(editor, top) {
          if (null != top) {
            resolveScrollToPos(editor);
            editor.curOp.scrollTop =
              (null == editor.curOp.scrollTop ? editor.doc.scrollTop : editor.curOp.scrollTop) +
              top;
          }
        }
        function ensureCursorVisible(editor) {
          resolveScrollToPos(editor);
          var cur = editor.getCursor(),
            from = cur,
            toScrollTop = cur;
          if (!editor.options.lineWrapping) {
            from = cur.ch ? Pos(cur.line, cur.ch - 1) : cur;
            toScrollTop = Pos(cur.line, cur.ch + 1);
          }
          editor.curOp.scrollToPos = {
            from: from,
            to: toScrollTop,
            margin: editor.options.cursorScrollMargin,
          };
        }
        function scrollToCoords(editor, x, y) {
          if (!(null == x && null == y)) {
            resolveScrollToPos(editor);
          }
          if (null != x) {
            editor.curOp.scrollLeft = x;
          }
          if (null != y) {
            editor.curOp.scrollTop = y;
          }
        }
        function resolveScrollToPos(editor) {
          var range$$1 = editor.curOp.scrollToPos;
          if (range$$1) {
            editor.curOp.scrollToPos = null;
            scrollToCoordsRange(
              editor,
              estimateCoords(editor, range$$1.from),
              estimateCoords(editor, range$$1.to),
              range$$1.margin,
            );
          }
        }
        function scrollToCoordsRange(editor, from, toScrollTop, margin) {
          var sPos = calculateScrollPos(editor, {
            left: Math.min(from.left, toScrollTop.left),
            top: Math.min(from.top, toScrollTop.top) - margin,
            right: Math.max(from.right, toScrollTop.right),
            bottom: Math.max(from.bottom, toScrollTop.bottom) + margin,
          });
          scrollToCoords(editor, sPos.scrollLeft, sPos.scrollTop);
        }
        function updateScrollTop(editor, val) {
          if (!(Math.abs(editor.doc.scrollTop - val) < 2)) {
            if (!gecko) {
              updateDisplaySimple(editor, { top: val });
            }
            setScrollTop(editor, val, true);
            if (gecko) {
              updateDisplaySimple(editor);
            }
            startWorker(editor, 100);
          }
        }
        function setScrollTop(editor, val, forceScroll) {
          val = Math.min(
            editor.display.scroller.scrollHeight - editor.display.scroller.clientHeight,
            val,
          );
          if (editor.display.scroller.scrollTop != val || forceScroll) {
            editor.doc.scrollTop = val;
            editor.display.scrollbars.setScrollTop(val);
            if (editor.display.scroller.scrollTop != val) {
              editor.display.scroller.scrollTop = val;
            }
          }
        }
        function setScrollLeft(editor, val, isScroller, forceScroll) {
          val = Math.min(
            val,
            editor.display.scroller.scrollWidth - editor.display.scroller.clientWidth,
          );
          if (
            !(
              (isScroller
                ? val == editor.doc.scrollLeft
                : Math.abs(editor.doc.scrollLeft - val) < 2) && !forceScroll
            )
          ) {
            editor.doc.scrollLeft = val;
            alignHorizontally(editor);
            if (editor.display.scroller.scrollLeft != val) {
              editor.display.scroller.scrollLeft = val;
            }
            editor.display.scrollbars.setScrollLeft(val);
          }
        }
        function measureForScrollbars(editor) {
          var display = editor.display,
            gutterW = display.gutters.offsetWidth,
            docH = Math.round(editor.doc.height + paddingVert(editor.display));
          return {
            clientHeight: display.scroller.clientHeight,
            viewHeight: display.wrapper.clientHeight,
            scrollWidth: display.scroller.scrollWidth,
            clientWidth: display.scroller.clientWidth,
            viewWidth: display.wrapper.clientWidth,
            barLeft: editor.options.fixedGutter ? gutterW : 0,
            docHeight: docH,
            scrollHeight: docH + scrollGap(editor) + display.barHeight,
            nativeBarWidth: display.nativeBarWidth,
            gutterWidth: gutterW,
          };
        }
        CodeMirror.posFromMouse = posFromMouse;
        var NativeScrollbars = Object.defineProperty(
          function (place, scroll, editor) {
            this.cm = editor;
            var vert = (this.vert = createElement(
                'div',
                [createElement('div', null, null, 'min-width: 1px')],
                'CodeMirror-vscrollbar',
              )),
              horiz = (this.horiz = createElement(
                'div',
                [createElement('div', null, null, 'height: 100%; min-height: 1px')],
                'CodeMirror-hscrollbar',
              ));
            place(vert);
            place(horiz);
            addEventHandler(vert, 'scroll', function () {
              if (vert.clientHeight) {
                scroll(vert.scrollTop, 'vertical');
              }
            });
            addEventHandler(horiz, 'scroll', function () {
              if (horiz.clientWidth) {
                scroll(horiz.scrollLeft, 'horizontal');
              }
            });
            this.checkedZeroWidth = false;
            if (isInternetExplorer && ie_version < 8) {
              this.horiz.style.minHeight = this.vert.style.minWidth = '18px';
            }
          },
          'name',
          { value: 'Li', configurable: true },
        );
        NativeScrollbars.prototype.update = function (measure) {
          var needsH = measure.scrollWidth > measure.clientWidth + 1,
            needsV = measure.scrollHeight > measure.clientHeight + 1,
            sWidth = measure.nativeBarWidth;
          this.vert.style.display = '';
          this.vert.firstChild.style.height = '0';
          if (needsH) {
            this.horiz.style.display = 'block';
            this.horiz.style.right = needsV ? sWidth + 'px' : '0';
            this.horiz.style.left = measure.barLeft + 'px';
            var totalWidth = measure.viewWidth - measure.barLeft - (needsV ? sWidth : 0);
            this.horiz.firstChild.style.width =
              Math.max(0, measure.scrollWidth - measure.clientWidth + totalWidth) + 'px';
          } else {
            this.horiz.style.display = '';
            this.horiz.firstChild.style.width = '0';
          }
          if (!this.checkedZeroWidth && measure.clientHeight > 0) {
            if (0 == sWidth) {
              this.zeroWidthHack();
            }
            this.checkedZeroWidth = true;
          }
          return { right: needsV ? sWidth : 0, bottom: needsH ? sWidth : 0 };
        };
        NativeScrollbars.prototype.setScrollLeft = function (position) {
          if (this.horiz.scrollLeft != position) {
            this.horiz.scrollLeft = position;
          }
          if (this.disableHoriz) {
            this.enableZeroWidthBar(this.horiz, this.disableHoriz, 'horiz');
          }
        };
        NativeScrollbars.prototype.setScrollTop = function (position) {
          if (this.vert.scrollTop != position) {
            this.vert.scrollTop = position;
          }
          if (this.disableVert) {
            this.enableZeroWidthBar(this.vert, this.disableVert, 'vert');
          }
        };
        NativeScrollbars.prototype.zeroWidthHack = function () {
          var caretWidth = mac && !mac_geMountainLion ? '12px' : '18px';
          this.horiz.style.height = this.vert.style.width = caretWidth;
          this.horiz.style.pointerEvents = this.vert.style.pointerEvents = 'none';
          this.disableHoriz = new Delayed();
          this.disableVert = new Delayed();
        };
        NativeScrollbars.prototype.enableZeroWidthBar = function (bar, delay, type) {
          bar.style.pointerEvents = 'auto';
          delay.set(
            1e3,
            Object.defineProperty(
              function maybeDisable() {
                var box = bar.getBoundingClientRect();
                if (
                  ('vert' == type
                    ? document.elementFromPoint(box.right - 1, (box.top + box.bottom) / 2)
                    : document.elementFromPoint((box.right + box.left) / 2, box.bottom - 1)) != bar
                ) {
                  bar.style.pointerEvents = 'none';
                } else {
                  delay.set(1e3, maybeDisable);
                }
              },
              'name',
              { value: 'i', configurable: true },
            ),
          );
        };
        NativeScrollbars.prototype.clear = function () {
          var parent = this.horiz.parentNode;
          parent.removeChild(this.horiz);
          parent.removeChild(this.vert);
        };
        var NullScrollbars = Object.defineProperty(function () {}, 'name', {
          value: 'Ni',
          configurable: true,
        });
        function updateScrollbars(editor, measure) {
          if (!measure) {
            measure = measureForScrollbars(editor);
          }
          var startWidth = editor.display.barWidth,
            startHeight = editor.display.barHeight;
          updateScrollbarsInner(editor, measure);
          for (
            var scrollbarIndex = 0;
            (scrollbarIndex < 4 && startWidth != editor.display.barWidth) ||
            startHeight != editor.display.barHeight;
            scrollbarIndex++
          ) {
            if (startWidth != editor.display.barWidth && editor.options.lineWrapping) {
              updateHeightsInViewport(editor);
            }
            updateScrollbarsInner(editor, measureForScrollbars(editor));
            startWidth = editor.display.barWidth;
            startHeight = editor.display.barHeight;
          }
        }
        function updateScrollbarsInner(editor, measure) {
          var display = editor.display,
            sizes = display.scrollbars.update(measure);
          display.sizer.style.paddingRight = (display.barWidth = sizes.right) + 'px';
          display.sizer.style.paddingBottom = (display.barHeight = sizes.bottom) + 'px';
          display.heightForcer.style.borderBottom = sizes.bottom + 'px solid transparent';
          if (sizes.right && sizes.bottom) {
            display.scrollbarFiller.style.display = 'block';
            display.scrollbarFiller.style.height = sizes.bottom + 'px';
            display.scrollbarFiller.style.width = sizes.right + 'px';
          } else {
            display.scrollbarFiller.style.display = '';
          }
          if (
            sizes.bottom &&
            editor.options.coverGutterNextToScrollbar &&
            editor.options.fixedGutter
          ) {
            display.gutterFiller.style.display = 'block';
            display.gutterFiller.style.height = sizes.bottom + 'px';
            display.gutterFiller.style.width = measure.gutterWidth + 'px';
          } else {
            display.gutterFiller.style.display = '';
          }
        }
        NullScrollbars.prototype.update = function () {
          return { bottom: 0, right: 0 };
        };
        NullScrollbars.prototype.setScrollLeft = function () {};
        NullScrollbars.prototype.setScrollTop = function () {};
        NullScrollbars.prototype.clear = function () {};
        var scrollbarModel = { native: NativeScrollbars, null: NullScrollbars };
        function initScrollbars(editor) {
          if (editor.display.scrollbars) {
            editor.display.scrollbars.clear();
            if (editor.display.scrollbars.addClass) {
              rmClass(editor.display.wrapper, editor.display.scrollbars.addClass);
            }
          }
          editor.display.scrollbars = new scrollbarModel[editor.options.scrollbarStyle](
            function (node) {
              editor.display.wrapper.insertBefore(node, editor.display.scrollbarFiller);
              addEventHandler(node, 'mousedown', function () {
                if (editor.state.focused) {
                  setTimeout(function () {
                    return editor.display.input.focus();
                  }, 0);
                }
              });
              node.setAttribute('cm-not-content', 'true');
            },
            function (position, axis) {
              if ('horizontal' == axis) {
                setScrollLeft(editor, position);
              } else {
                updateScrollTop(editor, position);
              }
            },
            editor,
          );
          if (editor.display.scrollbars.addClass) {
            addClass(editor.display.wrapper, editor.display.scrollbars.addClass);
          }
        }
        var nextOpId = 0;
        function startOperation(editor) {
          var onComplete;
          editor.curOp = {
            cm: editor,
            viewChanged: false,
            startHeight: editor.doc.height,
            forceUpdate: false,
            updateInput: null,
            typing: false,
            changeObjs: null,
            cursorActivityHandlers: null,
            cursorActivityCalled: 0,
            selectionChanged: false,
            updateMaxLine: false,
            scrollLeft: null,
            scrollTop: null,
            scrollToPos: null,
            focus: false,
            id: ++nextOpId,
          };
          onComplete = editor.curOp;
          if (operationGroup) {
            operationGroup.ops.push(onComplete);
          } else {
            onComplete.ownsGroup = operationGroup = { ops: [onComplete], delayedCallbacks: [] };
          }
        }
        function endOperation(editor) {
          !(function (operation, endCb) {
            var group = operation.ownsGroup;
            if (group) {
              try {
                !(function (group) {
                  var callbacks = group.delayedCallbacks,
                    callbackIndex = 0;
                  do {
                    for (; callbackIndex < callbacks.length; callbackIndex++) {
                      callbacks[callbackIndex].call(null);
                    }
                    for (
                      var operationIndex = 0;
                      operationIndex < group.ops.length;
                      operationIndex++
                    ) {
                      var operation = group.ops[operationIndex];
                      if (operation.cursorActivityHandlers) {
                        for (
                          ;
                          operation.cursorActivityCalled < operation.cursorActivityHandlers.length;
                        ) {
                          operation.cursorActivityHandlers[operation.cursorActivityCalled++].call(
                            null,
                            operation.cm,
                          );
                        }
                      }
                    }
                  } while (callbackIndex < callbacks.length);
                })(group);
              } finally {
                operationGroup = null;
                endCb(group);
              }
            }
          })(editor.curOp, function (group) {
            for (var operationIndex = 0; operationIndex < group.ops.length; operationIndex++) {
              group.ops[operationIndex].cm.curOp = null;
            }
            !(function (group) {
              for (
                var ops = group.ops, measurementIndex = 0;
                measurementIndex < ops.length;
                measurementIndex++
              ) {
                endOperation_R1(ops[measurementIndex]);
              }
              for (var displayIndex = 0; displayIndex < ops.length; displayIndex++) {
                (operation = ops[displayIndex]).updatedDisplay =
                  operation.mustUpdate && updateDisplayIfNeeded(operation.cm, operation.update);
              }
              var operation;
              for (var i$1 = 0; i$1 < ops.length; i$1++) {
                endOperation_R2(ops[i$1]);
              }
              for (var i$2 = 0; i$2 < ops.length; i$2++) {
                endOperation_W2(ops[i$2]);
              }
              for (var i$3 = 0; i$3 < ops.length; i$3++) {
                endOperation_finish(ops[i$3]);
              }
            })(group);
          });
        }
        function endOperation_R1(operation) {
          var editor = operation.cm,
            display = editor.display;
          !(function (editor) {
            var display = editor.display;
            if (!display.scrollbarsClipped && display.scroller.offsetWidth) {
              display.nativeBarWidth = display.scroller.offsetWidth - display.scroller.clientWidth;
              display.heightForcer.style.height = scrollGap(editor) + 'px';
              display.sizer.style.marginBottom = -display.nativeBarWidth + 'px';
              display.sizer.style.borderRightWidth = scrollGap(editor) + 'px';
              display.scrollbarsClipped = true;
            }
          })(editor);
          if (operation.updateMaxLine) {
            findMaxLine(editor);
          }
          operation.mustUpdate =
            operation.viewChanged ||
            operation.forceUpdate ||
            null != operation.scrollTop ||
            (operation.scrollToPos &&
              (operation.scrollToPos.from.line < display.viewFrom ||
                operation.scrollToPos.to.line >= display.viewTo)) ||
            (display.maxLineChanged && editor.options.lineWrapping);
          operation.update =
            operation.mustUpdate &&
            new DisplayUpdate(
              editor,
              operation.mustUpdate && { top: operation.scrollTop, ensure: operation.scrollToPos },
              operation.forceUpdate,
            );
        }
        function endOperation_R2(operation) {
          var editor = operation.cm,
            display = editor.display;
          if (operation.updatedDisplay) {
            updateHeightsInViewport(editor);
          }
          operation.barMeasure = measureForScrollbars(editor);
          if (display.maxLineChanged && !editor.options.lineWrapping) {
            operation.adjustWidthTo =
              measureChar(editor, display.maxLine, display.maxLine.text.length).left + 3;
            editor.display.sizerWidth = operation.adjustWidthTo;
            operation.barMeasure.scrollWidth = Math.max(
              display.scroller.clientWidth,
              display.sizer.offsetLeft +
                operation.adjustWidthTo +
                scrollGap(editor) +
                editor.display.barWidth,
            );
            operation.maxScrollLeft = Math.max(
              0,
              display.sizer.offsetLeft + operation.adjustWidthTo - displayWidth(editor),
            );
          }
          if (operation.updatedDisplay || operation.selectionChanged) {
            operation.preparedSelection = display.input.prepareSelection(operation.focus);
          }
        }
        function endOperation_W2(operation) {
          var editor = operation.cm;
          if (null != operation.adjustWidthTo) {
            editor.display.sizer.style.minWidth = operation.adjustWidthTo + 'px';
            if (operation.maxScrollLeft < editor.doc.scrollLeft) {
              setScrollLeft(
                editor,
                Math.min(editor.display.scroller.scrollLeft, operation.maxScrollLeft),
                true,
              );
            }
            editor.display.maxLineChanged = false;
          }
          var takeFocus =
            operation.focus &&
            operation.focus == activeElt() &&
            (!document.hasFocus || document.hasFocus());
          if (operation.preparedSelection) {
            editor.display.input.showSelection(operation.preparedSelection, takeFocus);
          }
          if (operation.updatedDisplay || operation.startHeight != editor.doc.height) {
            updateScrollbars(editor, operation.barMeasure);
          }
          if (operation.updatedDisplay) {
            setDocumentHeight(editor, operation.barMeasure);
          }
          if (operation.selectionChanged) {
            restartBlink(editor);
          }
          if (editor.state.focused && operation.updateInput) {
            editor.display.input.reset(operation.typing);
          }
          if (takeFocus) {
            ensureFocus(operation.cm);
          }
        }
        function endOperation_finish(operation) {
          var editor = operation.cm,
            display = editor.display,
            documentModel = editor.doc;
          if (operation.updatedDisplay) {
            postUpdateDisplay(editor, operation.update);
          }
          if (
            !(
              null == display.wheelStartX ||
              (null == operation.scrollTop &&
                null == operation.scrollLeft &&
                !operation.scrollToPos)
            )
          ) {
            display.wheelStartX = display.wheelStartY = null;
          }
          if (null != operation.scrollTop) {
            setScrollTop(editor, operation.scrollTop, operation.forceScroll);
          }
          if (null != operation.scrollLeft) {
            setScrollLeft(editor, operation.scrollLeft, true, true);
          }
          if (operation.scrollToPos) {
            (function (editor, cursorBounds) {
              if (!signalDOMEvent(editor, 'scrollCursorIntoView')) {
                var display = editor.display,
                  sizerBounds = display.sizer.getBoundingClientRect(),
                  alignToTop = null,
                  bottomInset =
                    File.editor.sourceView && File.editor.sourceView.inSourceMode ? 0 : 16;
                if (cursorBounds.top + sizerBounds.top < 0) {
                  alignToTop = true;
                } else {
                  if (
                    cursorBounds.bottom + sizerBounds.top >
                    (window.innerHeight || document.documentElement.clientHeight) - bottomInset
                  ) {
                    alignToTop = false;
                  } else {
                    var diagramElement = display.sizer.closest('.md-diagram, .md-math-block');
                    if (
                      diagramElement &&
                      diagramElement.getBoundingClientRect().bottom >
                        (window.innerHeight || document.documentElement.clientHeight) - bottomInset
                    ) {
                      alignToTop = false;
                    }
                  }
                }
                if (null != alignToTop && !phantom) {
                  var scrollAnchor = createElement(
                    'div',
                    '​',
                    null,
                    'position: absolute;\n                         top: ' +
                      (cursorBounds.top - display.viewOffset - paddingTop(editor.display)) +
                      'px;\n                         height: ' +
                      (cursorBounds.bottom -
                        cursorBounds.top +
                        scrollGap(editor) +
                        display.barHeight) +
                      'px;\n                         left: ' +
                      cursorBounds.left +
                      'px; width: ' +
                      Math.max(2, cursorBounds.right - cursorBounds.left) +
                      'px;',
                  );
                  editor.display.lineSpace.appendChild(scrollAnchor);
                  if (File.editor.sourceView && File.editor.sourceView.inSourceMode) {
                    scrollAnchor.scrollIntoView(alignToTop);
                  } else {
                    if (!(File.editor.fences && !File.editor.fences.isMousePressed)) {
                      if (scrollAnchor.scrollIntoViewIfNeeded) {
                        scrollAnchor.scrollIntoViewIfNeeded(false);
                      } else {
                        scrollAnchor.scrollIntoView(alignToTop);
                      }
                    }
                  }
                  editor.display.lineSpace.removeChild(scrollAnchor);
                }
              }
            })(
              editor,
              (function (editor, position, end, margin) {
                var rect;
                if (null == margin) {
                  margin = 0;
                }
                for (var attempt = 0; attempt < 5; attempt++) {
                  var changed = false,
                    coords = cursorCoords(editor, position),
                    endCoords = end && end != position ? cursorCoords(editor, end) : coords,
                    scrollPos = calculateScrollPos(
                      editor,
                      (rect = {
                        left: Math.min(coords.left, endCoords.left),
                        top: Math.min(coords.top, endCoords.top) - margin,
                        right: Math.max(coords.left, endCoords.left),
                        bottom: Math.max(coords.bottom, endCoords.bottom) + margin,
                      }),
                    ),
                    startTop = editor.doc.scrollTop,
                    startLeft = editor.doc.scrollLeft;
                  if (null != scrollPos.scrollTop) {
                    updateScrollTop(editor, scrollPos.scrollTop);
                    if (Math.abs(editor.doc.scrollTop - startTop) > 1) {
                      changed = true;
                    }
                  }
                  if (null != scrollPos.scrollLeft) {
                    setScrollLeft(editor, scrollPos.scrollLeft);
                    if (Math.abs(editor.doc.scrollLeft - startLeft) > 1) {
                      changed = true;
                    }
                  }
                  if (!changed) {
                    break;
                  }
                }
                return rect;
              })(
                editor,
                clipPos(documentModel, operation.scrollToPos.from),
                clipPos(documentModel, operation.scrollToPos.to),
                operation.scrollToPos.margin,
              ),
            );
          }
          var hidden = operation.maybeHiddenMarkers,
            unhidden = operation.maybeUnhiddenMarkers;
          if (hidden) {
            for (var eventIndex = 0; eventIndex < hidden.length; ++eventIndex) {
              if (!hidden[eventIndex].lines.length) {
                signal(hidden[eventIndex], 'hide');
              }
            }
          }
          if (unhidden) {
            for (var i$1 = 0; i$1 < unhidden.length; ++i$1) {
              if (unhidden[i$1].lines.length) {
                signal(unhidden[i$1], 'unhide');
              }
            }
          }
          if (display.wrapper.offsetHeight) {
            documentModel.scrollTop = editor.display.scroller.scrollTop;
          }
          if (operation.changeObjs) {
            signal(editor, 'changes', editor, operation.changeObjs);
          }
          if (operation.update) {
            operation.update.finish();
          }
        }
        function runInOp(editor, callback) {
          if (editor.curOp) {
            return callback();
          }
          startOperation(editor);
          try {
            return callback();
          } finally {
            endOperation(editor);
          }
        }
        function operation(editor, callback) {
          return function () {
            if (editor.curOp) {
              return callback.apply(editor, arguments);
            }
            startOperation(editor);
            try {
              return callback.apply(editor, arguments);
            } finally {
              endOperation(editor);
            }
          };
        }
        function methodOp(callback) {
          return function () {
            if (this.curOp) {
              return callback.apply(this, arguments);
            }
            startOperation(this);
            try {
              return callback.apply(this, arguments);
            } finally {
              endOperation(this);
            }
          };
        }
        function docMethodOp(callback) {
          return function () {
            var editor = this.cm;
            if (!editor || editor.curOp) {
              return callback.apply(this, arguments);
            }
            startOperation(editor);
            try {
              return callback.apply(this, arguments);
            } finally {
              endOperation(editor);
            }
          };
        }
        function regChange(editor, from, toLine, lendiff) {
          if (null == from) {
            from = editor.doc.first;
          }
          if (null == toLine) {
            toLine = editor.doc.first + editor.doc.size;
          }
          if (!lendiff) {
            lendiff = 0;
          }
          var display = editor.display;
          if (
            lendiff &&
            toLine < display.viewTo &&
            (null == display.updateLineNumbers || display.updateLineNumbers > from)
          ) {
            display.updateLineNumbers = from;
          }
          editor.curOp.viewChanged = true;
          if (from >= display.viewTo) {
            if (sawCollapsedSpans && visualLineNo(editor.doc, from) < display.viewTo) {
              resetView(editor);
            }
          } else {
            if (toLine <= display.viewFrom) {
              if (
                sawCollapsedSpans &&
                visualLineEndNo(editor.doc, toLine + lendiff) > display.viewFrom
              ) {
                resetView(editor);
              } else {
                display.viewFrom += lendiff;
                display.viewTo += lendiff;
              }
            } else {
              if (from <= display.viewFrom && toLine >= display.viewTo) {
                resetView(editor);
              } else {
                if (from <= display.viewFrom) {
                  var cut = viewCuttingPoint(editor, toLine, toLine + lendiff, 1);
                  if (cut) {
                    display.view = display.view.slice(cut.index);
                    display.viewFrom = cut.lineN;
                    display.viewTo += lendiff;
                  } else {
                    resetView(editor);
                  }
                } else {
                  if (toLine >= display.viewTo) {
                    var cut$1 = viewCuttingPoint(editor, from, from, -1);
                    if (cut$1) {
                      display.view = display.view.slice(0, cut$1.index);
                      display.viewTo = cut$1.lineN;
                    } else {
                      resetView(editor);
                    }
                  } else {
                    var cutTop = viewCuttingPoint(editor, from, from, -1),
                      cutBot = viewCuttingPoint(editor, toLine, toLine + lendiff, 1);
                    if (cutTop && cutBot) {
                      display.view = display.view
                        .slice(0, cutTop.index)
                        .concat(buildViewArray(editor, cutTop.lineN, cutBot.lineN))
                        .concat(display.view.slice(cutBot.index));
                      display.viewTo += lendiff;
                    } else {
                      resetView(editor);
                    }
                  }
                }
              }
            }
          }
          var ext = display.externalMeasured;
          if (ext) {
            if (toLine < ext.lineN) {
              ext.lineN += lendiff;
            } else {
              if (from < ext.lineN + ext.size) {
                display.externalMeasured = null;
              }
            }
          }
        }
        function regLineChange(editor, line, type) {
          editor.curOp.viewChanged = true;
          var display = editor.display,
            ext = editor.display.externalMeasured;
          if (ext && line >= ext.lineN && line < ext.lineN + ext.size) {
            display.externalMeasured = null;
          }
          if (!(line < display.viewFrom || line >= display.viewTo)) {
            var lineView = display.view[findViewIndex(editor, line)];
            if (null != lineView.node) {
              var items = lineView.changes || (lineView.changes = []);
              if (-1 == indexOf(items, type)) {
                items.push(type);
              }
            }
          }
        }
        function resetView(editor) {
          editor.display.viewFrom = editor.display.viewTo = editor.doc.first;
          editor.display.view = [];
          editor.display.viewOffset = 0;
        }
        function viewCuttingPoint(editor, oldN, newN, dir) {
          var diff,
            index = findViewIndex(editor, oldN),
            view = editor.display.view;
          if (!sawCollapsedSpans || newN == editor.doc.first + editor.doc.size) {
            return { index: index, lineN: newN };
          }
          for (
            var lineNumber = editor.display.viewFrom, viewIndex = 0;
            viewIndex < index;
            viewIndex++
          ) {
            lineNumber += view[viewIndex].size;
          }
          if (lineNumber != oldN) {
            if (dir > 0) {
              if (index == view.length - 1) {
                return null;
              }
              diff = lineNumber + view[index].size - oldN;
              index++;
            } else {
              diff = lineNumber - oldN;
            }
            oldN += diff;
            newN += diff;
          }
          for (; visualLineNo(editor.doc, newN) != newN; ) {
            if (index == (dir < 0 ? 0 : view.length - 1)) {
              return null;
            }
            newN += dir * view[index - (dir < 0 ? 1 : 0)].size;
            index += dir;
          }
          return { index: index, lineN: newN };
        }
        function countDirtyView(editor) {
          for (
            var view = editor.display.view, dirty = 0, viewIndex = 0;
            viewIndex < view.length;
            viewIndex++
          ) {
            var lineView = view[viewIndex];
            if (!(lineView.hidden || (lineView.node && !lineView.changes))) {
              ++dirty;
            }
          }
          return dirty;
        }
        function startWorker(editor, time) {
          if (editor.doc.mode.startState && editor.doc.frontier < editor.display.viewTo) {
            editor.state.highlight.set(time, bind(highlightWorker, editor));
          }
        }
        function highlightWorker(editor) {
          var documentModel = editor.doc;
          if (documentModel.frontier < documentModel.first) {
            documentModel.frontier = documentModel.first;
          }
          if (!(documentModel.frontier >= editor.display.viewTo)) {
            var end = +new Date() + editor.options.workTime,
              state = copyState(documentModel.mode, getStateBefore(editor, documentModel.frontier)),
              changedLines = [];
            documentModel.iter(
              documentModel.frontier,
              Math.min(documentModel.first + documentModel.size, editor.display.viewTo + 500),
              function (line) {
                if (documentModel.frontier >= editor.display.viewFrom) {
                  var oldStyles = line.styles,
                    tooLong = line.text.length > editor.options.maxHighlightLength,
                    highlighted = highlightLine(
                      editor,
                      line,
                      tooLong ? copyState(documentModel.mode, state) : state,
                      true,
                    );
                  line.styles = highlighted.styles;
                  var oldCls = line.styleClasses,
                    newCls = highlighted.classes;
                  if (newCls) {
                    line.styleClasses = newCls;
                  } else {
                    if (oldCls) {
                      line.styleClasses = null;
                    }
                  }
                  for (
                    var ischange =
                        !oldStyles ||
                        oldStyles.length != line.styles.length ||
                        (oldCls != newCls &&
                          (!oldCls ||
                            !newCls ||
                            oldCls.bgClass != newCls.bgClass ||
                            oldCls.textClass != newCls.textClass)),
                      widgetIndex = 0;
                    !ischange && widgetIndex < oldStyles.length;
                    ++widgetIndex
                  ) {
                    ischange = oldStyles[widgetIndex] != line.styles[widgetIndex];
                  }
                  if (ischange) {
                    changedLines.push(documentModel.frontier);
                  }
                  line.stateAfter = tooLong ? state : copyState(documentModel.mode, state);
                } else {
                  if (line.text.length <= editor.options.maxHighlightLength) {
                    processLine(editor, line.text, state);
                  }
                  line.stateAfter =
                    documentModel.frontier % 5 == 0 ? copyState(documentModel.mode, state) : null;
                }
                ++documentModel.frontier;
                if (+new Date() > end) {
                  startWorker(editor, editor.options.workDelay);
                  return true;
                }
              },
            );
            if (changedLines.length) {
              runInOp(editor, function () {
                for (var viewIndex = 0; viewIndex < changedLines.length; viewIndex++) {
                  regLineChange(editor, changedLines[viewIndex], 'text');
                }
              });
            }
          }
        }
        var DisplayUpdate = Object.defineProperty(
          function (editor, viewport, force) {
            var display = editor.display;
            this.viewport = viewport;
            this.visible = visibleLines(display, editor.doc, viewport);
            this.editorIsHidden = !display.wrapper.offsetWidth;
            this.wrapperHeight = display.wrapper.clientHeight;
            this.wrapperWidth = display.wrapper.clientWidth;
            this.oldDisplayWidth = displayWidth(editor);
            this.force = force;
            this.dims = getDimensions(editor);
            this.events = [];
          },
          'name',
          { value: 'tr', configurable: true },
        );
        function updateDisplayIfNeeded(editor, update) {
          var display = editor.display,
            documentModel = editor.doc;
          if (update.editorIsHidden) {
            resetView(editor);
            return false;
          }
          if (
            !update.force &&
            update.visible.from >= display.viewFrom &&
            update.visible.to <= display.viewTo &&
            (null == display.updateLineNumbers || display.updateLineNumbers >= display.viewTo) &&
            display.renderedView == display.view &&
            0 == countDirtyView(editor)
          ) {
            return false;
          }
          if (maybeUpdateLineNumberWidth(editor)) {
            resetView(editor);
            update.dims = getDimensions(editor);
          }
          var end = documentModel.first + documentModel.size,
            from = Math.max(
              update.visible.from - editor.options.viewportMargin,
              documentModel.first,
            ),
            toLine = Math.min(end, update.visible.to + editor.options.viewportMargin);
          if (display.viewFrom < from && from - display.viewFrom < 20) {
            from = Math.max(documentModel.first, display.viewFrom);
          }
          if (display.viewTo > toLine && display.viewTo - toLine < 20) {
            toLine = Math.min(end, display.viewTo);
          }
          if (sawCollapsedSpans) {
            from = visualLineNo(editor.doc, from);
            toLine = visualLineEndNo(editor.doc, toLine);
          }
          var different =
            from != display.viewFrom ||
            toLine != display.viewTo ||
            display.lastWrapHeight != update.wrapperHeight ||
            display.lastWrapWidth != update.wrapperWidth;
          !(function (editor, from, toLine) {
            var display = editor.display;
            if (0 == display.view.length || from >= display.viewTo || toLine <= display.viewFrom) {
              display.view = buildViewArray(editor, from, toLine);
              display.viewFrom = from;
            } else {
              if (display.viewFrom > from) {
                display.view = buildViewArray(editor, from, display.viewFrom).concat(display.view);
              } else {
                if (display.viewFrom < from) {
                  display.view = display.view.slice(findViewIndex(editor, from));
                }
              }
              display.viewFrom = from;
              if (display.viewTo < toLine) {
                display.view = display.view.concat(buildViewArray(editor, display.viewTo, toLine));
              } else {
                if (display.viewTo > toLine) {
                  display.view = display.view.slice(0, findViewIndex(editor, toLine));
                }
              }
            }
            display.viewTo = toLine;
          })(editor, from, toLine);
          display.viewOffset = heightAtLine(getLine(editor.doc, display.viewFrom));
          editor.display.mover.style.top = display.viewOffset + 'px';
          var toUpdate = countDirtyView(editor);
          if (
            !different &&
            0 == toUpdate &&
            !update.force &&
            display.renderedView == display.view &&
            (null == display.updateLineNumbers || display.updateLineNumbers >= display.viewTo)
          ) {
            return false;
          }
          var selSnapshot = (function (editor) {
            if (editor.hasFocus()) {
              return null;
            }
            var active = activeElt();
            if (!active || !contains(editor.display.lineDiv, active)) {
              return null;
            }
            var result = { activeElt: active };
            if (window.getSelection) {
              var selection = window.getSelection();
              if (
                selection.anchorNode &&
                selection.extend &&
                contains(editor.display.lineDiv, selection.anchorNode)
              ) {
                result.anchorNode = selection.anchorNode;
                result.anchorOffset = selection.anchorOffset;
                result.focusNode = selection.focusNode;
                result.focusOffset = selection.focusOffset;
              }
            }
            return result;
          })(editor);
          if (toUpdate > 4) {
            display.lineDiv.style.display = 'none';
          }
          (function (editor, updateNumbersFrom, dims) {
            Object.defineProperty(removeLineNode, 'name', { value: 's', configurable: true });

            var display = editor.display,
              lineNumbers = editor.options.lineNumbers,
              container = display.lineDiv,
              cur = container.firstChild;
            function removeLineNode(node) {
              var next = node.nextSibling;
              if (webkit && mac && editor.display.currentWheelTarget == node) {
                node.style.display = 'none';
              } else {
                node.parentNode.removeChild(node);
              }
              return next;
            }
            for (
              var view = display.view, lineN = display.viewFrom, viewIndex = 0;
              viewIndex < view.length;
              viewIndex++
            ) {
              var lineView = view[viewIndex];
              if (lineView.hidden) {
              } else {
                if (lineView.node && lineView.node.parentNode == container) {
                  for (; cur != lineView.node; ) {
                    cur = removeLineNode(cur);
                  }
                  var updateNumber =
                    lineNumbers &&
                    null != updateNumbersFrom &&
                    updateNumbersFrom <= lineN &&
                    lineView.lineNumber;
                  if (lineView.changes) {
                    if (indexOf(lineView.changes, 'gutter') > -1) {
                      updateNumber = false;
                    }
                    updateLineForChanges(editor, lineView, lineN, dims);
                  }
                  if (updateNumber) {
                    removeChildren(lineView.lineNumber);
                    lineView.lineNumber.appendChild(
                      document.createTextNode(lineNumberFor(editor.options, lineN)),
                    );
                  }
                  cur = lineView.node.nextSibling;
                } else {
                  var node = buildLineElement(editor, lineView, lineN, dims);
                  container.insertBefore(node, cur);
                }
              }
              lineN += lineView.size;
            }
            for (; cur; ) {
              cur = removeLineNode(cur);
            }
          })(editor, display.updateLineNumbers, update.dims);
          if (toUpdate > 4) {
            display.lineDiv.style.display = '';
          }
          display.renderedView = display.view;
          (function (snapshot) {
            if (
              snapshot &&
              snapshot.activeElt &&
              snapshot.activeElt != activeElt() &&
              (snapshot.activeElt.focus(),
              snapshot.anchorNode &&
                contains(document.body, snapshot.anchorNode) &&
                contains(document.body, snapshot.focusNode))
            ) {
              var selection = window.getSelection(),
                range$$1 = document.createRange();
              range$$1.setEnd(snapshot.anchorNode, snapshot.anchorOffset);
              range$$1.collapse(false);
              selection.removeAllRanges();
              selection.addRange(range$$1);
              selection.extend(snapshot.focusNode, snapshot.focusOffset);
            }
          })(selSnapshot);
          removeChildren(display.cursorDiv);
          removeChildren(display.selectionDiv);
          display.gutters.style.height = display.sizer.style.minHeight = 0;
          if (different) {
            display.lastWrapHeight = update.wrapperHeight;
            display.lastWrapWidth = update.wrapperWidth;
            startWorker(editor, 400);
          }
          display.updateLineNumbers = null;
          return true;
        }
        function postUpdateDisplay(editor, update) {
          for (
            var viewport = update.viewport, first = true;
            ((first &&
              editor.options.lineWrapping &&
              update.oldDisplayWidth != displayWidth(editor)) ||
              (viewport &&
                null != viewport.top &&
                (viewport = {
                  top: Math.min(
                    editor.doc.height + paddingVert(editor.display) - displayHeight(editor),
                    viewport.top,
                  ),
                }),
              (update.visible = visibleLines(editor.display, editor.doc, viewport)),
              !(
                update.visible.from >= editor.display.viewFrom &&
                update.visible.to <= editor.display.viewTo
              ))) &&
            updateDisplayIfNeeded(editor, update);
            first = false
          ) {
            updateHeightsInViewport(editor);
            var barMeasure = measureForScrollbars(editor);
            updateSelection(editor);
            updateScrollbars(editor, barMeasure);
            setDocumentHeight(editor, barMeasure);
          }
          update.signal(editor, 'update', editor);
          if (
            !(
              editor.display.viewFrom == editor.display.reportedViewFrom &&
              editor.display.viewTo == editor.display.reportedViewTo
            )
          ) {
            update.signal(
              editor,
              'viewportChange',
              editor,
              editor.display.viewFrom,
              editor.display.viewTo,
            );
            editor.display.reportedViewFrom = editor.display.viewFrom;
            editor.display.reportedViewTo = editor.display.viewTo;
          }
        }
        function updateDisplaySimple(editor, viewport) {
          var update = new DisplayUpdate(editor, viewport);
          if (updateDisplayIfNeeded(editor, update)) {
            updateHeightsInViewport(editor);
            postUpdateDisplay(editor, update);
            var barMeasure = measureForScrollbars(editor);
            updateSelection(editor);
            updateScrollbars(editor, barMeasure);
            setDocumentHeight(editor, barMeasure);
            update.finish();
          }
        }
        function updateGutterSpace(editor) {
          var width = editor.display.gutters.offsetWidth;
          editor.display.sizer.style.marginLeft = width + 'px';
        }
        function setDocumentHeight(editor, measure) {
          editor.display.sizer.style.minHeight = measure.docHeight + 'px';
          editor.display.heightForcer.style.top = measure.docHeight + 'px';
          editor.display.gutters.style.height =
            measure.docHeight + editor.display.barHeight + scrollGap(editor) + 'px';
        }
        function updateGutters(editor) {
          var gutters = editor.display.gutters,
            specs = editor.options.gutters;
          removeChildren(gutters);
          for (var gutterIndex = 0; gutterIndex < specs.length; ++gutterIndex) {
            var gutterClass = specs[gutterIndex],
              gElt = gutters.appendChild(
                createElement('div', null, 'CodeMirror-gutter ' + gutterClass),
              );
            if ('CodeMirror-linenumbers' == gutterClass) {
              editor.display.lineGutter = gElt;
              gElt.style.width = (editor.display.lineNumWidth || 1) + 'px';
            }
          }
          gutters.style.display = gutterIndex ? '' : 'none';
          updateGutterSpace(editor);
        }
        function setGuttersForLineNumbers(options) {
          var found = indexOf(options.gutters, 'CodeMirror-linenumbers');
          if (-1 == found && options.lineNumbers) {
            options.gutters = options.gutters.concat(['CodeMirror-linenumbers']);
          } else {
            if (found > -1 && !options.lineNumbers) {
              options.gutters = options.gutters.slice(0);
              options.gutters.splice(found, 1);
            }
          }
        }
        DisplayUpdate.prototype.signal = function (emitter, eventType) {
          if (hasHandler(emitter, eventType)) {
            this.events.push(arguments);
          }
        };
        DisplayUpdate.prototype.finish = function () {
          for (var eventIndex = 0; eventIndex < this.events.length; eventIndex++) {
            signal.apply(null, this.events[eventIndex]);
          }
        };
        var wheelSamples = 0,
          wheelPixelsPerUnit = null;
        function wheelEventDelta(event) {
          var deltaX = event.wheelDeltaX,
            deltaY = event.wheelDeltaY;
          if (null == deltaX && event.detail && event.axis == event.HORIZONTAL_AXIS) {
            deltaX = event.detail;
          }
          if (null == deltaY && event.detail && event.axis == event.VERTICAL_AXIS) {
            deltaY = event.detail;
          } else {
            if (null == deltaY) {
              deltaY = event.wheelDelta;
            }
          }
          return { x: deltaX, y: deltaY };
        }
        function wheelEventPixels(event) {
          var delta = wheelEventDelta(event);
          delta.x *= wheelPixelsPerUnit;
          delta.y *= wheelPixelsPerUnit;
          return delta;
        }
        function onScrollWheel(editor, event) {
          var delta = wheelEventDelta(event),
            deltaX = delta.x,
            deltaY = delta.y,
            display = editor.display,
            scroll = display.scroller,
            canScrollX = scroll.scrollWidth > scroll.clientWidth;
          if (deltaX && canScrollX) {
            if (deltaY && mac && webkit) {
              e: for (
                var cur = event.target, view = display.view;
                cur != scroll;
                cur = cur.parentNode
              ) {
                for (var sampleIndex = 0; sampleIndex < view.length; sampleIndex++) {
                  if (view[sampleIndex].node == cur) {
                    editor.display.currentWheelTarget = cur;
                    break e;
                  }
                }
              }
            }
            if (deltaX && !gecko && !presto && null != wheelPixelsPerUnit) {
              if (deltaX) {
                setScrollLeft(editor, Math.max(0, scroll.scrollLeft + deltaX * wheelPixelsPerUnit));
              }
              return void (display.wheelStartX = null);
            }
            if (deltaY && null != wheelPixelsPerUnit) {
              var pixels = deltaY * wheelPixelsPerUnit,
                top = editor.doc.scrollTop,
                bot = top + display.wrapper.clientHeight;
              if (pixels < 0) {
                top = Math.max(0, top + pixels - 50);
              } else {
                bot = Math.min(editor.doc.height, bot + pixels + 50);
              }
              updateDisplaySimple(editor, { top: top, bottom: bot });
            }
            if (wheelSamples < 20) {
              if (null == display.wheelStartX) {
                display.wheelStartX = scroll.scrollLeft;
                display.wheelStartY = scroll.scrollTop;
                display.wheelDX = deltaX;
                display.wheelDY = deltaY;
                setTimeout(function () {
                  if (null != display.wheelStartX) {
                    var movedX = scroll.scrollLeft - display.wheelStartX,
                      movedY = scroll.scrollTop - display.wheelStartY,
                      sample =
                        (movedY && display.wheelDY && movedY / display.wheelDY) ||
                        (movedX && display.wheelDX && movedX / display.wheelDX);
                    display.wheelStartX = display.wheelStartY = null;
                    if (sample) {
                      wheelPixelsPerUnit =
                        (wheelPixelsPerUnit * wheelSamples + sample) / (wheelSamples + 1);
                      ++wheelSamples;
                    }
                  }
                }, 200);
              } else {
                display.wheelDX += deltaX;
                display.wheelDY += deltaY;
              }
            }
          }
        }
        if (isInternetExplorer) {
          wheelPixelsPerUnit = -0.53;
        } else {
          if (gecko) {
            wheelPixelsPerUnit = 15;
          } else {
            if (chrome) {
              wheelPixelsPerUnit = -0.7;
            } else {
              if (safari) {
                wheelPixelsPerUnit = -1 / 3;
              }
            }
          }
        }
        var Selection = Object.defineProperty(
          function (ranges, primIndex) {
            this.ranges = ranges;
            this.primIndex = primIndex;
          },
          'name',
          { value: 'fr', configurable: true },
        );
        Selection.prototype.primary = function () {
          return this.ranges[this.primIndex];
        };
        Selection.prototype.equals = function (other) {
          if (other == this) {
            return true;
          }
          if (other.primIndex != this.primIndex || other.ranges.length != this.ranges.length) {
            return false;
          }
          for (var rangeIndex = 0; rangeIndex < this.ranges.length; rangeIndex++) {
            var here = this.ranges[rangeIndex],
              there = other.ranges[rangeIndex];
            if (
              !equalCursorPos(here.anchor, there.anchor) ||
              !equalCursorPos(here.head, there.head)
            ) {
              return false;
            }
          }
          return true;
        };
        Selection.prototype.deepCopy = function () {
          for (var out = [], rangeIndex = 0; rangeIndex < this.ranges.length; rangeIndex++) {
            out[rangeIndex] = new Range(
              copyPos(this.ranges[rangeIndex].anchor),
              copyPos(this.ranges[rangeIndex].head),
            );
          }
          return new Selection(out, this.primIndex);
        };
        Selection.prototype.somethingSelected = function () {
          for (var rangeIndex = 0; rangeIndex < this.ranges.length; rangeIndex++) {
            if (!this.ranges[rangeIndex].empty()) {
              return true;
            }
          }
          return false;
        };
        Selection.prototype.contains = function (position, end) {
          if (!end) {
            end = position;
          }
          for (var rangeIndex = 0; rangeIndex < this.ranges.length; rangeIndex++) {
            var range = this.ranges[rangeIndex];
            if (cmp(end, range.from()) >= 0 && cmp(position, range.to()) <= 0) {
              return rangeIndex;
            }
          }
          return -1;
        };
        var Range = Object.defineProperty(
          function (anchor, head) {
            this.anchor = anchor;
            this.head = head;
          },
          'name',
          { value: 'mr', configurable: true },
        );
        function normalizeSelection(ranges, primIndex) {
          var prim = ranges[primIndex];
          ranges.sort(function (leftRange, rightRange) {
            return cmp(leftRange.from(), rightRange.from());
          });
          primIndex = indexOf(ranges, prim);
          for (var rangeIndex = 1; rangeIndex < ranges.length; rangeIndex++) {
            var cur = ranges[rangeIndex],
              prev = ranges[rangeIndex - 1];
            if (cmp(prev.to(), cur.from()) >= 0) {
              var from = minPos(prev.from(), cur.from()),
                toPosition = maxPos(prev.to(), cur.to()),
                inv = prev.empty() ? cur.from() == cur.head : prev.from() == prev.head;
              if (rangeIndex <= primIndex) {
                --primIndex;
              }
              ranges.splice(
                --rangeIndex,
                2,
                new Range(inv ? toPosition : from, inv ? from : toPosition),
              );
            }
          }
          return new Selection(ranges, primIndex);
        }
        function simpleSelection(anchor, head) {
          return new Selection([new Range(anchor, head || anchor)], 0);
        }
        function changeEnd(change) {
          if (change.text) {
            return Pos(
              change.from.line + change.text.length - 1,
              lst(change.text).length + (1 == change.text.length ? change.from.ch : 0),
            );
          } else {
            return change.to;
          }
        }
        function adjustForChange(position, change) {
          if (cmp(position, change.from) < 0) {
            return position;
          }
          if (cmp(position, change.to) <= 0) {
            return changeEnd(change);
          }
          var line = position.line + change.text.length - (change.to.line - change.from.line) - 1,
            adjustedColumn = position.ch;
          if (position.line == change.to.line) {
            adjustedColumn += changeEnd(change).ch - change.to.ch;
          }
          return Pos(line, adjustedColumn);
        }
        function computeSelAfterChange(documentModel, change) {
          for (
            var out = [], rangeIndex = 0;
            rangeIndex < documentModel.sel.ranges.length;
            rangeIndex++
          ) {
            var range = documentModel.sel.ranges[rangeIndex],
              adjustedRange = new Range(
                adjustForChange(range.anchor, change),
                adjustForChange(range.head, change),
              );
            if (change.redoSel) {
              adjustedRange.anchor = change.from;
              if ('select' == change.redoSel) {
                adjustedRange.head.line = change.from.line;
                adjustedRange.head.ch = change.from.ch + (change.text[0] || '').length;
              }
            }
            out.push(adjustedRange);
          }
          return normalizeSelection(out, documentModel.sel.primIndex);
        }
        function offsetPos(position, old, relativePosition) {
          if (position.line == old.line) {
            return Pos(relativePosition.line, position.ch - old.ch + relativePosition.ch);
          } else {
            return Pos(relativePosition.line + (position.line - old.line), position.ch);
          }
        }
        function loadMode(editor) {
          editor.doc.mode = getMode(editor.options, editor.doc.modeOption);
          resetModeState(editor);
        }
        function resetModeState(editor) {
          editor.doc.iter(function (line) {
            if (line.stateAfter) {
              line.stateAfter = null;
            }
            if (line.styles) {
              line.styles = null;
            }
          });
          editor.doc.frontier = editor.doc.first;
          startWorker(editor, 100);
          editor.state.modeGen++;
          if (editor.curOp) {
            regChange(editor);
          }
        }
        function isWholeLineUpdate(documentModel, change) {
          return (
            0 == change.from.ch &&
            0 == change.to.ch &&
            '' == lst(change.text) &&
            (!documentModel.cm || documentModel.cm.options.wholeLineUpdateBefore)
          );
        }
        function updateDoc(documentModel, change, markedSpans, estimateHeight$$1) {
          Object.defineProperty(spansFor, 'name', { value: 'r', configurable: true });
          Object.defineProperty(update, 'name', { value: 'o', configurable: true });
          Object.defineProperty(linesFor, 'name', { value: 'a', configurable: true });

          function spansFor(lineNumber) {
            if (markedSpans) {
              return markedSpans[lineNumber];
            } else {
              return null;
            }
          }
          function update(line, text, spans) {
            !(function (line, text, markedSpans, estimateHeight) {
              line.text = text;
              if (line.stateAfter) {
                line.stateAfter = null;
              }
              if (line.styles) {
                line.styles = null;
              }
              if (null != line.order) {
                line.order = null;
              }
              detachMarkedSpans(line);
              attachMarkedSpans(line, markedSpans);
              var estHeight = estimateHeight ? estimateHeight(line) : 1;
              if (estHeight != line.height) {
                updateLineHeight(line, estHeight);
              }
            })(line, text, spans, estimateHeight$$1);
            signalLater(line, 'change', line, change);
          }
          function linesFor(start, end) {
            for (var result = [], lineNumber = start; lineNumber < end; ++lineNumber) {
              result.push(new Line(text[lineNumber], spansFor(lineNumber), estimateHeight$$1));
            }
            return result;
          }
          var from = change.from,
            changeEnd = change.to,
            text = change.text,
            firstLine = getLine(documentModel, from.line),
            lastLine = getLine(documentModel, changeEnd.line),
            lastText = lst(text),
            lastSpans = spansFor(text.length - 1),
            nlines = changeEnd.line - from.line;
          if (change.full) {
            documentModel.insert(0, linesFor(0, text.length));
            documentModel.remove(text.length, documentModel.size - text.length);
          } else {
            if (isWholeLineUpdate(documentModel, change)) {
              var added = linesFor(0, text.length - 1);
              update(lastLine, lastLine.text, lastSpans);
              if (nlines) {
                documentModel.remove(from.line, nlines);
              }
              if (added.length) {
                documentModel.insert(from.line, added);
              }
            } else {
              if (firstLine == lastLine) {
                if (1 == text.length) {
                  update(
                    firstLine,
                    firstLine.text.slice(0, from.ch) +
                      lastText +
                      firstLine.text.slice(changeEnd.ch),
                    lastSpans,
                  );
                } else {
                  var added$1 = linesFor(1, text.length - 1);
                  added$1.push(
                    new Line(
                      lastText + firstLine.text.slice(changeEnd.ch),
                      lastSpans,
                      estimateHeight$$1,
                    ),
                  );
                  update(firstLine, firstLine.text.slice(0, from.ch) + text[0], spansFor(0));
                  documentModel.insert(from.line + 1, added$1);
                }
              } else {
                if (1 == text.length) {
                  update(
                    firstLine,
                    firstLine.text.slice(0, from.ch) + text[0] + lastLine.text.slice(changeEnd.ch),
                    spansFor(0),
                  );
                  documentModel.remove(from.line + 1, nlines);
                } else {
                  update(firstLine, firstLine.text.slice(0, from.ch) + text[0], spansFor(0));
                  update(lastLine, lastText + lastLine.text.slice(changeEnd.ch), lastSpans);
                  var added$2 = linesFor(1, text.length - 1);
                  if (nlines > 1) {
                    documentModel.remove(from.line + 1, nlines - 1);
                  }
                  documentModel.insert(from.line + 1, added$2);
                }
              }
            }
          }
          signalLater(documentModel, 'change', documentModel, change);
        }
        function linkedDocs(documentModel, visitLinkedDocument, sharedHistOnly) {
          !Object.defineProperty(
            function propagate(documentModel, skip, sharedHist) {
              if (documentModel.linked) {
                for (var linkIndex = 0; linkIndex < documentModel.linked.length; ++linkIndex) {
                  var rel = documentModel.linked[linkIndex];
                  if (rel.doc != skip) {
                    var shared = sharedHist && rel.sharedHist;
                    if (!(sharedHistOnly && !shared)) {
                      visitLinkedDocument(rel.doc, shared);
                      propagate(rel.doc, documentModel, shared);
                    }
                  }
                }
              }
            },
            'name',
            { value: 'e', configurable: true },
          )(documentModel, null, true);
        }
        function attachDoc(editor, documentModel) {
          if (documentModel.cm) {
            throw new Error('This document is already in use.');
          }
          editor.doc = documentModel;
          documentModel.cm = editor;
          estimateLineHeights(editor);
          loadMode(editor);
          setDirectionClass(editor);
          if (!editor.options.lineWrapping) {
            findMaxLine(editor);
          }
          editor.options.mode = documentModel.modeOption;
          regChange(editor);
        }
        function setDirectionClass(editor) {
          ('rtl' == editor.doc.direction ? addClass : rmClass)(
            editor.display.lineDiv,
            'CodeMirror-rtl',
          );
        }
        function History(startGen) {
          this.done = [];
          this.undone = [];
          this.undoDepth = 1 / 0;
          this.lastModTime = this.lastSelTime = 0;
          this.lastOp = this.lastSelOp = null;
          this.lastOrigin = this.lastSelOrigin = null;
          this.generation = this.maxGeneration = startGen || 1;
        }
        function historyChangeFromChange(documentModel, change) {
          var histChange = {
            from: copyPos(change.from),
            to: changeEnd(change),
            text: getBetween(documentModel, change.from, change.to),
          };
          attachLocalSpans(documentModel, histChange, change.from.line, change.to.line + 1);
          linkedDocs(
            documentModel,
            function (documentModel) {
              return attachLocalSpans(
                documentModel,
                histChange,
                change.from.line,
                change.to.line + 1,
              );
            },
            true,
          );
          return histChange;
        }
        function clearSelectionEvents(array) {
          for (; array.length; ) {
            if (!lst(array).ranges) {
              break;
            }
            array.pop();
          }
        }
        function copyEditorHistoryChange(document, change) {
          if (change) {
            return {
              from: change.from,
              to: change.to,
              text: change.text,
              redoSel: !!change['spans_' + document.id],
              origin: change.origin,
            };
          } else {
            return null;
          }
        }
        function buildEditorHistoryCommand(document, change) {
          var forwardChange = copyEditorHistoryChange(document, change),
            reverseChange = copyEditorHistoryChange(
              document,
              historyChangeFromChange(document, change),
            );
          forwardChange.origin = 'undo';
          reverseChange.origin = 'undo';
          if ('+findReplace' == change.origin) {
            forwardChange.redoSel = 'select';
            reverseChange.redoSel = 'select';
          }
          return {
            undo: [{ type: 'fences', change: reverseChange, id: document.cm.cid }],
            redo: [{ type: 'fences', change: forwardChange, id: document.cm.cid }],
          };
        }
        function addChangeToHistory(document, change, selectionAfter, operationId) {
          if (change && 'undo' == change.origin) {
            document.clearHistory();
          } else {
            var history = document.history;
            history.undone.length = 0;
            var previousEvent,
              previousChange,
              timestamp = +new Date(),
              isMultilineChange = (change.text || []).length > 1;
            change.origin = change.origin || '';
            var canMerge =
              !isMultilineChange &&
              (history.lastOp == operationId ||
                (history.lastOrigin == change.origin &&
                  change.origin &&
                  (('+' == change.origin.charAt(0) &&
                    document.cm &&
                    history.lastModTime > timestamp - document.cm.options.historyEventDelay) ||
                    '*' == change.origin.charAt(0))));
            if (document.cm.editor.sourceView.inSourceMode || !document.cm.cid) {
              if (
                (canMerge =
                  canMerge &&
                  (previousEvent = (function (hist, force) {
                    if (force) {
                      clearSelectionEvents(hist.done);
                      return lst(hist.done);
                    } else {
                      if (hist.done.length && !lst(hist.done).ranges) {
                        return lst(hist.done);
                      } else {
                        if (hist.done.length > 1 && !hist.done[hist.done.length - 2].ranges) {
                          hist.done.pop();
                          return lst(hist.done);
                        } else {
                          return void 0;
                        }
                      }
                    }
                  })(history, history.lastOp == operationId)))
              ) {
                previousChange = lst(previousEvent.changes);
                if (0 == cmp(change.from, change.to) && 0 == cmp(change.from, previousChange.to)) {
                  previousChange.to = changeEnd(change);
                } else {
                  previousEvent.changes.push(historyChangeFromChange(document, change));
                }
              } else {
                var lastEvent = lst(history.done);
                for (
                  (lastEvent && lastEvent.ranges) ||
                    pushSelectionToHistory(document.sel, history.done),
                    previousEvent = {
                      changes: [historyChangeFromChange(document, change)],
                      generation: history.generation,
                    },
                    history.done.push(previousEvent);
                  history.done.length > history.undoDepth;
                ) {
                  history.done.shift();
                  if (!history.done[0].ranges) {
                    history.done.shift();
                  }
                }
              }
            } else {
              if (canMerge) {
                var previousCommand = document.cm.editor.undo.lastRegisteredOperationCommand();
                previousChange = previousCommand && (previousCommand.undo.last() || {}).change;
                if (File.isNode && File.changeCounter.withdrawAutoSaved()) {
                  canMerge = false;
                }
                var previousRedoChange =
                  previousCommand && (previousCommand.redo.last() || {}).change;
                if (previousChange && previousRedoChange) {
                  if (
                    0 == cmp(change.from, change.to) &&
                    0 == cmp(change.from, previousChange.to) &&
                    1 == previousChange.text.length
                  ) {
                    previousChange.to = changeEnd(change);
                    var insertedText = change.text[0];
                    previousRedoChange.text[previousRedoChange.text.length - 1] =
                      previousRedoChange.text[previousRedoChange.text.length - 1] +
                      (insertedText || '');
                    previousRedoChange.text = previousRedoChange.text.concat(change.text.slice(1));
                  } else {
                    if (
                      history.lastOp == operationId ||
                      (1 == previousChange.text.length && previousCommand.undo.length < 8)
                    ) {
                      var mergedCommand = buildEditorHistoryCommand(document, change);
                      previousCommand.undo.push(mergedCommand.undo[0]);
                      previousCommand.redo.push(mergedCommand.redo[0]);
                    } else {
                      canMerge = false;
                    }
                  }
                } else {
                  canMerge = false;
                }
              }
              if (!canMerge && 'setValue' != change.origin && document.cm.cid) {
                var newCommand = buildEditorHistoryCommand(document, change);
                if ('cut-line' == change.origin) {
                  let previousCursorCommand =
                    document.cm.editor.undo.lastRegisteredOperationCommand();
                  if (
                    previousCursorCommand &&
                    'fences-pos' == (previousCursorCommand.undo[0] || {}).type
                  ) {
                    previousCursorCommand.undo = previousCursorCommand.undo.concat(newCommand.undo);
                    return void (previousCursorCommand.redo = newCommand.redo);
                  }
                }
                document.cm.editor.undo.register(newCommand);
              }
            }
            history.done.push(selectionAfter);
            history.generation = ++history.maxGeneration;
            history.lastModTime = history.lastSelTime = timestamp;
            history.lastOp = history.lastSelOp = operationId;
            history.lastOrigin = history.lastSelOrigin = change.origin;
            if (!previousChange) {
              signal(document, 'historyAdded');
            }
          }
        }
        function addSelectionToHistory(documentModel, selection, opId, options) {
          var hist = documentModel.history,
            origin = options && options.origin;
          if (
            opId == hist.lastSelOp ||
            (origin &&
              hist.lastSelOrigin == origin &&
              ((hist.lastModTime == hist.lastSelTime && hist.lastOrigin == origin) ||
                (function (documentModel, origin, prev, selection) {
                  var originPrefix = origin.charAt(0);
                  return (
                    '*' == originPrefix ||
                    ('+' == originPrefix &&
                      prev.ranges.length == selection.ranges.length &&
                      prev.somethingSelected() == selection.somethingSelected() &&
                      new Date() - documentModel.history.lastSelTime <=
                        (documentModel.cm ? documentModel.cm.options.historyEventDelay : 500))
                  );
                })(documentModel, origin, lst(hist.done), selection)))
          ) {
            hist.done[hist.done.length - 1] = selection;
          } else {
            pushSelectionToHistory(selection, hist.done);
          }
          hist.lastSelTime = +new Date();
          hist.lastSelOrigin = origin;
          hist.lastSelOp = opId;
          if (options && false !== options.clearRedo) {
            clearSelectionEvents(hist.undone);
          }
        }
        function pushSelectionToHistory(selection, dest) {
          var top = lst(dest);
          if (!(top && top.ranges && top.equals(selection))) {
            dest.push(selection);
          }
        }
        function attachLocalSpans(documentModel, change, from, endLine) {
          var existing = change['spans_' + documentModel.id],
            relativeLine = 0;
          documentModel.iter(
            Math.max(documentModel.first, from),
            Math.min(documentModel.first + documentModel.size, endLine),
            function (line) {
              if (line.markedSpans) {
                (existing || (existing = change['spans_' + documentModel.id] = {}))[relativeLine] =
                  line.markedSpans;
              }
              ++relativeLine;
            },
          );
        }
        function removeClearedSpans(spans) {
          if (!spans) {
            return null;
          }
          for (var out, spanIndex = 0; spanIndex < spans.length; ++spanIndex) {
            if (spans[spanIndex].marker.explicitlyCleared) {
              if (!out) {
                out = spans.slice(0, spanIndex);
              }
            } else {
              if (out) {
                out.push(spans[spanIndex]);
              }
            }
          }
          if (out) {
            if (out.length) {
              return out;
            } else {
              return null;
            }
          } else {
            return spans;
          }
        }
        function mergeOldSpans(documentModel, change) {
          var old = (function (documentModel, change) {
              var found = change['spans_' + documentModel.id];
              if (!found) {
                return null;
              }
              for (var lineSpans = [], lineIndex = 0; lineIndex < change.text.length; ++lineIndex) {
                lineSpans.push(removeClearedSpans(found[lineIndex]));
              }
              return lineSpans;
            })(documentModel, change),
            stretched = stretchSpansOverChange(documentModel, change);
          if (!old) {
            return stretched;
          }
          if (!stretched) {
            return old;
          }
          for (var lineIndex = 0; lineIndex < old.length; ++lineIndex) {
            var oldCur = old[lineIndex],
              stretchCur = stretched[lineIndex];
            if (oldCur && stretchCur) {
              e: for (var oldSpanIndex = 0; oldSpanIndex < stretchCur.length; ++oldSpanIndex) {
                for (
                  var span = stretchCur[oldSpanIndex], newSpanIndex = 0;
                  newSpanIndex < oldCur.length;
                  ++newSpanIndex
                ) {
                  if (oldCur[newSpanIndex].marker == span.marker) {
                    continue e;
                  }
                }
                oldCur.push(span);
              }
            } else {
              if (stretchCur) {
                old[lineIndex] = stretchCur;
              }
            }
          }
          return old;
        }
        function copyHistoryArray(events, newGroup, instantiateSel) {
          for (var copy = [], eventIndex = 0; eventIndex < events.length; ++eventIndex) {
            var event = events[eventIndex];
            if (event.ranges) {
              copy.push(instantiateSel ? Selection.prototype.deepCopy.call(event) : event);
            } else {
              var changes = event.changes,
                newChanges = [];
              copy.push({ changes: newChanges });
              for (var changeIndex = 0; changeIndex < changes.length; ++changeIndex) {
                var change = changes[changeIndex],
                  spanKeyMatch = void 0;
                newChanges.push({ from: change.from, to: change.to, text: change.text });
                if (newGroup) {
                  for (var prop in change) {
                    if (
                      (spanKeyMatch = prop.match(/^spans_(\d+)$/)) &&
                      indexOf(newGroup, Number(spanKeyMatch[1])) > -1
                    ) {
                      lst(newChanges)[prop] = change[prop];
                      delete change[prop];
                    }
                  }
                }
              }
            }
          }
          return copy;
        }
        function extendRange(documentModel, range, head, other) {
          if ((documentModel.cm && documentModel.cm.display.shift) || documentModel.extend) {
            var anchor = range.anchor;
            if (other) {
              var posBefore = cmp(head, anchor) < 0;
              if (posBefore != cmp(other, anchor) < 0) {
                anchor = head;
                head = other;
              } else {
                if (posBefore != cmp(head, other) < 0) {
                  head = other;
                }
              }
            }
            return new Range(anchor, head);
          }
          return new Range(other || head, head);
        }
        function extendSelection(documentModel, head, other, options) {
          setSelection(
            documentModel,
            new Selection(
              [extendRange(documentModel, documentModel.sel.primary(), head, other)],
              0,
            ),
            options,
          );
        }
        function extendSelections(documentModel, heads, options) {
          for (
            var out = [], rangeIndex = 0;
            rangeIndex < documentModel.sel.ranges.length;
            rangeIndex++
          ) {
            out[rangeIndex] = extendRange(
              documentModel,
              documentModel.sel.ranges[rangeIndex],
              heads[rangeIndex],
              null,
            );
          }
          setSelection(
            documentModel,
            normalizeSelection(out, documentModel.sel.primIndex),
            options,
          );
        }
        function replaceOneSelection(documentModel, rangeIndex, range, options) {
          var ranges = documentModel.sel.ranges.slice(0);
          ranges[rangeIndex] = range;
          setSelection(
            documentModel,
            normalizeSelection(ranges, documentModel.sel.primIndex),
            options,
          );
        }
        function setSimpleSelection(documentModel, anchor, head, options) {
          setSelection(documentModel, simpleSelection(anchor, head), options);
        }
        function setSelectionReplaceHistory(documentModel, selection, options) {
          var done = documentModel.history.done,
            last = lst(done);
          if (last && last.ranges) {
            done[done.length - 1] = selection;
            setSelectionNoUndo(documentModel, selection, options);
          } else {
            setSelection(documentModel, selection, options);
          }
        }
        function setSelection(documentModel, selection, options) {
          setSelectionNoUndo(documentModel, selection, options);
          addSelectionToHistory(
            documentModel,
            documentModel.sel,
            documentModel.cm ? documentModel.cm.curOp.id : NaN,
            options,
          );
        }
        function setSelectionNoUndo(documentModel, selection, options) {
          if (
            hasHandler(documentModel, 'beforeSelectionChange') ||
            (documentModel.cm && hasHandler(documentModel.cm, 'beforeSelectionChange'))
          ) {
            selection = (function (documentModel, selection, options) {
              var object = {
                ranges: selection.ranges,
                update: function (newRanges) {
                  this.ranges = [];
                  for (var rangeIndex = 0; rangeIndex < newRanges.length; rangeIndex++) {
                    this.ranges[rangeIndex] = new Range(
                      clipPos(documentModel, newRanges[rangeIndex].anchor),
                      clipPos(documentModel, newRanges[rangeIndex].head),
                    );
                  }
                },
                origin: options && options.origin,
              };
              signal(documentModel, 'beforeSelectionChange', documentModel, object);
              if (documentModel.cm) {
                signal(documentModel.cm, 'beforeSelectionChange', documentModel.cm, object);
              }
              if (object.ranges != selection.ranges) {
                return normalizeSelection(object.ranges, object.ranges.length - 1);
              } else {
                return selection;
              }
            })(documentModel, selection, options);
          }
          setSelectionInner(
            documentModel,
            skipAtomicInSelection(
              documentModel,
              selection,
              (options && options.bias) ||
                (cmp(selection.primary().head, documentModel.sel.primary().head) < 0 ? -1 : 1),
              true,
            ),
          );
          if (!((options && false === options.scroll) || !documentModel.cm)) {
            ensureCursorVisible(documentModel.cm);
          }
        }
        function setSelectionInner(documentModel, selection) {
          if (!selection.equals(documentModel.sel)) {
            documentModel.sel = selection;
            if (documentModel.cm) {
              documentModel.cm.curOp.updateInput = documentModel.cm.curOp.selectionChanged = true;
              signalCursorActivity(documentModel.cm);
            }
            signalLater(documentModel, 'cursorActivity', documentModel);
          }
        }
        function reCheckSelection(documentModel) {
          setSelectionInner(
            documentModel,
            skipAtomicInSelection(documentModel, documentModel.sel, null, false),
          );
        }
        function skipAtomicInSelection(documentModel, selection, bias, mayClear) {
          for (var out, rangeIndex = 0; rangeIndex < selection.ranges.length; rangeIndex++) {
            var range = selection.ranges[rangeIndex],
              old =
                selection.ranges.length == documentModel.sel.ranges.length &&
                documentModel.sel.ranges[rangeIndex],
              newAnchor = skipAtomic(
                documentModel,
                range.anchor,
                old && old.anchor,
                bias,
                mayClear,
              ),
              newHead = skipAtomic(documentModel, range.head, old && old.head, bias, mayClear);
            if (out || newAnchor != range.anchor || newHead != range.head) {
              if (!out) {
                out = selection.ranges.slice(0, rangeIndex);
              }
              out[rangeIndex] = new Range(newAnchor, newHead);
            }
          }
          if (out) {
            return normalizeSelection(out, selection.primIndex);
          } else {
            return selection;
          }
        }
        function skipAtomicInner(documentModel, position, oldPos, dir, mayClear) {
          var line = getLine(documentModel, position.line);
          if (line.markedSpans) {
            for (var spanIndex = 0; spanIndex < line.markedSpans.length; ++spanIndex) {
              var span = line.markedSpans[spanIndex],
                marker = span.marker;
              if (
                (null == span.from ||
                  (marker.inclusiveLeft ? span.from <= position.ch : span.from < position.ch)) &&
                (null == span.to ||
                  (marker.inclusiveRight ? span.to >= position.ch : span.to > position.ch))
              ) {
                if (mayClear && (signal(marker, 'beforeCursorEnter'), marker.explicitlyCleared)) {
                  if (line.markedSpans) {
                    --spanIndex;
                    continue;
                  }
                  break;
                }
                if (!marker.atomic) {
                  continue;
                }
                if (oldPos) {
                  var near = marker.find(dir < 0 ? 1 : -1),
                    diff = void 0;
                  if (dir < 0 ? marker.inclusiveRight : marker.inclusiveLeft) {
                    near = movePos(
                      documentModel,
                      near,
                      -dir,
                      near && near.line == position.line ? line : null,
                    );
                  }
                  if (
                    near &&
                    near.line == position.line &&
                    (diff = cmp(near, oldPos)) &&
                    (dir < 0 ? diff < 0 : diff > 0)
                  ) {
                    return skipAtomicInner(documentModel, near, position, dir, mayClear);
                  }
                }
                var far = marker.find(dir < 0 ? -1 : 1);
                if (dir < 0 ? marker.inclusiveLeft : marker.inclusiveRight) {
                  far = movePos(documentModel, far, dir, far.line == position.line ? line : null);
                }
                if (far) {
                  return skipAtomicInner(documentModel, far, position, dir, mayClear);
                } else {
                  return null;
                }
              }
            }
          }
          return position;
        }
        function skipAtomic(documentModel, position, oldPos, bias, mayClear) {
          var dir = bias || 1,
            found =
              skipAtomicInner(documentModel, position, oldPos, dir, mayClear) ||
              (!mayClear && skipAtomicInner(documentModel, position, oldPos, dir, true)) ||
              skipAtomicInner(documentModel, position, oldPos, -dir, mayClear) ||
              (!mayClear && skipAtomicInner(documentModel, position, oldPos, -dir, true));
          return found || ((documentModel.cantEdit = true), Pos(documentModel.first, 0));
        }
        function movePos(documentModel, position, dir, line) {
          if (dir < 0 && 0 == position.ch) {
            if (position.line > documentModel.first) {
              return clipPos(documentModel, Pos(position.line - 1));
            } else {
              return null;
            }
          } else {
            if (
              dir > 0 &&
              position.ch == (line || getLine(documentModel, position.line)).text.length
            ) {
              if (position.line < documentModel.first + documentModel.size - 1) {
                return Pos(position.line + 1, 0);
              } else {
                return null;
              }
            } else {
              return new Pos(position.line, position.ch + dir);
            }
          }
        }
        function selectAll(editor) {
          editor.setSelection(Pos(editor.firstLine(), 0), Pos(editor.lastLine()), sel_dontScroll);
        }
        function filterChange(documentModel, change, update) {
          var object = {
            canceled: false,
            from: change.from,
            to: change.to,
            text: change.text,
            origin: change.origin,
            cancel: function () {
              return (object.canceled = true);
            },
          };
          if (update) {
            object.update = function (from, newTo, text, origin) {
              if (from) {
                object.from = clipPos(documentModel, from);
              }
              if (newTo) {
                object.to = clipPos(documentModel, newTo);
              }
              if (text) {
                object.text = text;
              }
              if (void 0 !== origin) {
                object.origin = origin;
              }
            };
          }
          signal(documentModel, 'beforeChange', documentModel, object);
          if (documentModel.cm) {
            signal(documentModel.cm, 'beforeChange', documentModel.cm, object);
          }
          if (object.canceled) {
            return null;
          } else {
            return { from: object.from, to: object.to, text: object.text, origin: object.origin };
          }
        }
        function makeChange(documentModel, change, ignoreReadOnly) {
          if (documentModel.cm) {
            if (!documentModel.cm.curOp) {
              return operation(documentModel.cm, makeChange)(documentModel, change, ignoreReadOnly);
            }
            if (documentModel.cm.state.suppressEdits) {
              return;
            }
          }
          if (
            !(
              hasHandler(documentModel, 'beforeChange') ||
              (documentModel.cm && hasHandler(documentModel.cm, 'beforeChange'))
            ) ||
            (change = filterChange(documentModel, change, true))
          ) {
            var split =
              sawReadOnlySpans &&
              !ignoreReadOnly &&
              (function (documentModel, from, rangeEnd) {
                var markers = null;
                documentModel.iter(from.line, rangeEnd.line + 1, function (line) {
                  if (line.markedSpans) {
                    for (var spanIndex = 0; spanIndex < line.markedSpans.length; ++spanIndex) {
                      var mark = line.markedSpans[spanIndex].marker;
                      if (!(!mark.readOnly || (markers && -1 != indexOf(markers, mark)))) {
                        (markers || (markers = [])).push(mark);
                      }
                    }
                  }
                });
                if (!markers) {
                  return null;
                }
                for (
                  var parts = [{ from: from, to: rangeEnd }], markerIndex = 0;
                  markerIndex < markers.length;
                  ++markerIndex
                ) {
                  for (
                    var marker = markers[markerIndex], markerRange = marker.find(0), rangeIndex = 0;
                    rangeIndex < parts.length;
                    ++rangeIndex
                  ) {
                    var range = parts[rangeIndex];
                    if (
                      !(cmp(range.to, markerRange.from) < 0 || cmp(range.from, markerRange.to) > 0)
                    ) {
                      var newParts = [rangeIndex, 1],
                        dfrom = cmp(range.from, markerRange.from),
                        dto = cmp(range.to, markerRange.to);
                      if (dfrom < 0 || (!marker.inclusiveLeft && !dfrom)) {
                        newParts.push({ from: range.from, to: markerRange.from });
                      }
                      if (dto > 0 || (!marker.inclusiveRight && !dto)) {
                        newParts.push({ from: markerRange.to, to: range.to });
                      }
                      parts.splice.apply(parts, newParts);
                      rangeIndex += newParts.length - 3;
                    }
                  }
                }
                return parts;
              })(documentModel, change.from, change.to);
            if (split) {
              for (var rangeIndex = split.length - 1; rangeIndex >= 0; --rangeIndex) {
                makeChangeInner(documentModel, {
                  from: split[rangeIndex].from,
                  to: split[rangeIndex].to,
                  text: rangeIndex ? [''] : change.text,
                });
              }
            } else {
              makeChangeInner(documentModel, change);
            }
          }
        }
        function makeChangeInner(documentModel, change) {
          if (1 != change.text.length || '' != change.text[0] || 0 != cmp(change.from, change.to)) {
            var selAfter = computeSelAfterChange(documentModel, change);
            addChangeToHistory(
              documentModel,
              change,
              selAfter,
              documentModel.cm ? documentModel.cm.curOp.id : NaN,
            );
            makeChangeSingleDoc(
              documentModel,
              change,
              selAfter,
              stretchSpansOverChange(documentModel, change),
            );
            var rebased = [];
            linkedDocs(documentModel, function (documentModel, sharedHist) {
              if (!(sharedHist || -1 != indexOf(rebased, documentModel.history))) {
                rebaseHist(documentModel.history, change);
                rebased.push(documentModel.history);
              }
              makeChangeSingleDoc(
                documentModel,
                change,
                null,
                stretchSpansOverChange(documentModel, change),
              );
            });
          }
        }
        function makeChangeFromHistory(documentModel, type, allowSelectionOnly) {
          if (!documentModel.cm || !documentModel.cm.state.suppressEdits || allowSelectionOnly) {
            for (
              var event,
                hist = documentModel.history,
                selAfter = documentModel.sel,
                source = 'undo' == type ? hist.done : hist.undone,
                dest = 'undo' == type ? hist.undone : hist.done,
                selectionIndex = 0;
              selectionIndex < source.length &&
              ((event = source[selectionIndex]),
              allowSelectionOnly ? !event.ranges || event.equals(documentModel.sel) : event.ranges);
              selectionIndex++
            ) {}
            if (selectionIndex != source.length) {
              for (hist.lastOrigin = hist.lastSelOrigin = null; (event = source.pop()).ranges; ) {
                pushSelectionToHistory(event, dest);
                if (allowSelectionOnly && !event.equals(documentModel.sel)) {
                  return void setSelection(documentModel, event, { clearRedo: false });
                }
                selAfter = event;
              }
              var antiChanges = [];
              pushSelectionToHistory(selAfter, dest);
              dest.push({ changes: antiChanges, generation: hist.generation });
              hist.generation = event.generation || ++hist.maxGeneration;
              for (
                var filter =
                    hasHandler(documentModel, 'beforeChange') ||
                    (documentModel.cm && hasHandler(documentModel.cm, 'beforeChange')),
                  loop = Object.defineProperty(
                    function (changeIndex) {
                      var change = event.changes[changeIndex];
                      change.origin = type;
                      if (filter && !filterChange(documentModel, change, false)) {
                        source.length = 0;
                        return {};
                      }
                      antiChanges.push(historyChangeFromChange(documentModel, change));
                      var after = changeIndex
                        ? computeSelAfterChange(documentModel, change)
                        : lst(source);
                      makeChangeSingleDoc(
                        documentModel,
                        change,
                        after,
                        mergeOldSpans(documentModel, change),
                      );
                      if (!changeIndex && documentModel.cm) {
                        documentModel.cm.scrollIntoView({
                          from: change.from,
                          to: changeEnd(change),
                        });
                      }
                      var rebased = [];
                      linkedDocs(documentModel, function (documentModel, sharedHist) {
                        if (!(sharedHist || -1 != indexOf(rebased, documentModel.history))) {
                          rebaseHist(documentModel.history, change);
                          rebased.push(documentModel.history);
                        }
                        makeChangeSingleDoc(
                          documentModel,
                          change,
                          null,
                          mergeOldSpans(documentModel, change),
                        );
                      });
                    },
                    'name',
                    { value: 'u', configurable: true },
                  ),
                  i$1 = event.changes.length - 1;
                i$1 >= 0;
                --i$1
              ) {
                var returned = loop(i$1);
                if (returned) {
                  return returned.v;
                }
              }
            }
          }
        }
        function shiftDoc(documentModel, distance) {
          if (
            0 != distance &&
            ((documentModel.first += distance),
            (documentModel.sel = new Selection(
              map(documentModel.sel.ranges, function (range) {
                return new Range(
                  Pos(range.anchor.line + distance, range.anchor.ch),
                  Pos(range.head.line + distance, range.head.ch),
                );
              }),
              documentModel.sel.primIndex,
            )),
            documentModel.cm)
          ) {
            regChange(
              documentModel.cm,
              documentModel.first,
              documentModel.first - distance,
              distance,
            );
            for (
              var display = documentModel.cm.display, lineNumber = display.viewFrom;
              lineNumber < display.viewTo;
              lineNumber++
            ) {
              regLineChange(documentModel.cm, lineNumber, 'gutter');
            }
          }
        }
        function makeChangeSingleDoc(documentModel, change, selAfter, spans) {
          if (documentModel.cm && !documentModel.cm.curOp) {
            return operation(documentModel.cm, makeChangeSingleDoc)(
              documentModel,
              change,
              selAfter,
              spans,
            );
          }
          if (change.to.line < documentModel.first) {
            shiftDoc(documentModel, change.text.length - 1 - (change.to.line - change.from.line));
          } else {
            if (!(change.from.line > documentModel.lastLine())) {
              if (change.from.line < documentModel.first) {
                var shift = change.text.length - 1 - (documentModel.first - change.from.line);
                shiftDoc(documentModel, shift);
                change = {
                  from: Pos(documentModel.first, 0),
                  to: Pos(change.to.line + shift, change.to.ch),
                  text: [lst(change.text)],
                  origin: change.origin,
                };
              }
              var last = documentModel.lastLine();
              if (change.to.line > last) {
                change = {
                  from: change.from,
                  to: Pos(last, getLine(documentModel, last).text.length),
                  text: [change.text[0]],
                  origin: change.origin,
                };
              }
              change.removed = getBetween(documentModel, change.from, change.to);
              if (!selAfter) {
                selAfter = computeSelAfterChange(documentModel, change);
              }
              if (documentModel.cm) {
                (function (editor, change, spans) {
                  var documentModel = editor.doc,
                    display = editor.display,
                    from = change.from,
                    changeEnd = change.to,
                    recomputeMaxLength = false,
                    checkWidthStart = from.line;
                  if (!editor.options.lineWrapping) {
                    checkWidthStart = lineNo(visualLine(getLine(documentModel, from.line)));
                    documentModel.iter(checkWidthStart, changeEnd.line + 1, function (line) {
                      if (line == display.maxLine) {
                        recomputeMaxLength = true;
                        return true;
                      }
                    });
                  }
                  if (documentModel.sel.contains(change.from, change.to) > -1) {
                    signalCursorActivity(editor);
                  }
                  updateDoc(documentModel, change, spans, estimateHeight(editor));
                  if (!editor.options.lineWrapping) {
                    documentModel.iter(
                      checkWidthStart,
                      from.line + change.text.length,
                      function (line) {
                        var len = lineLength(line);
                        if (len > display.maxLineLength) {
                          display.maxLine = line;
                          display.maxLineLength = len;
                          display.maxLineChanged = true;
                          recomputeMaxLength = false;
                        }
                      },
                    );
                    if (recomputeMaxLength) {
                      editor.curOp.updateMaxLine = true;
                    }
                  }
                  documentModel.frontier = Math.min(documentModel.frontier, from.line - 1);
                  startWorker(editor, 400);
                  var lendiff = change.text.length - (changeEnd.line - from.line) - 1;
                  if (change.full) {
                    regChange(editor);
                  } else {
                    if (
                      from.line != changeEnd.line ||
                      1 != change.text.length ||
                      isWholeLineUpdate(editor.doc, change)
                    ) {
                      regChange(editor, from.line, changeEnd.line + 1, lendiff);
                    } else {
                      regLineChange(editor, from.line, 'text');
                    }
                  }
                  var changesHandler = hasHandler(editor, 'changes'),
                    changeHandler = hasHandler(editor, 'change');
                  if (changeHandler || changesHandler) {
                    var object = {
                      from: from,
                      to: changeEnd,
                      text: change.text,
                      removed: change.removed,
                      origin: change.origin,
                    };
                    if (changeHandler) {
                      signalLater(editor, 'change', editor, object);
                    }
                    if (changesHandler) {
                      (editor.curOp.changeObjs || (editor.curOp.changeObjs = [])).push(object);
                    }
                  }
                  editor.display.selForContextMenu = null;
                })(documentModel.cm, change, spans);
              } else {
                updateDoc(documentModel, change, spans);
              }
              setSelectionNoUndo(documentModel, selAfter, sel_dontScroll);
            }
          }
        }
        function replaceRange(documentModel, code, from, rangeEnd, origin) {
          if (!rangeEnd) {
            rangeEnd = from;
          }
          if (cmp(rangeEnd, from) < 0) {
            var tmp = rangeEnd;
            rangeEnd = from;
            from = tmp;
          }
          if ('string' == typeof code) {
            code = documentModel.splitLines(code);
          }
          makeChange(documentModel, { from: from, to: rangeEnd, text: code, origin: origin });
        }
        function rebaseHistSelSingle(position, from, endLine, diff) {
          if (endLine < position.line) {
            position.line += diff;
          } else {
            if (from < position.line) {
              position.line = from;
              position.ch = 0;
            }
          }
        }
        function rebaseHistArray(array, from, endLine, diff) {
          for (var eventIndex = 0; eventIndex < array.length; ++eventIndex) {
            var sub = array[eventIndex],
              canPreserve = true;
            if (sub.ranges) {
              if (!sub.copied) {
                (sub = array[eventIndex] = sub.deepCopy()).copied = true;
              }
              for (var rangeIndex = 0; rangeIndex < sub.ranges.length; rangeIndex++) {
                rebaseHistSelSingle(sub.ranges[rangeIndex].anchor, from, endLine, diff);
                rebaseHistSelSingle(sub.ranges[rangeIndex].head, from, endLine, diff);
              }
            } else {
              for (var j$1 = 0; j$1 < sub.changes.length; ++j$1) {
                var cur = sub.changes[j$1];
                if (endLine < cur.from.line) {
                  cur.from = Pos(cur.from.line + diff, cur.from.ch);
                  cur.to = Pos(cur.to.line + diff, cur.to.ch);
                } else {
                  if (from <= cur.to.line) {
                    canPreserve = false;
                    break;
                  }
                }
              }
              if (!canPreserve) {
                array.splice(0, eventIndex + 1);
                eventIndex = 0;
              }
            }
          }
        }
        function rebaseHist(hist, change) {
          var from = change.from.line,
            endLine = change.to.line,
            diff = change.text.length - (endLine - from) - 1;
          rebaseHistArray(hist.done, from, endLine, diff);
          rebaseHistArray(hist.undone, from, endLine, diff);
        }
        function changeLine(documentModel, handle, changeType, updateLine) {
          var lineNumber = handle,
            line = handle;
          if ('number' == typeof handle) {
            line = getLine(documentModel, clipLine(documentModel, handle));
          } else {
            lineNumber = lineNo(handle);
          }
          if (null == lineNumber) {
            return null;
          } else {
            if (updateLine(line, lineNumber) && documentModel.cm) {
              regLineChange(documentModel.cm, lineNumber, changeType);
            }
            return line;
          }
        }
        Range.prototype.from = function () {
          return minPos(this.anchor, this.head);
        };
        Range.prototype.to = function () {
          return maxPos(this.anchor, this.head);
        };
        Range.prototype.empty = function () {
          return this.head.line == this.anchor.line && this.head.ch == this.anchor.ch;
        };
        var LeafChunk = Object.defineProperty(
          function (lines) {
            this.lines = lines;
            this.parent = null;
            for (var height = 0, lineIndex = 0; lineIndex < lines.length; ++lineIndex) {
              lines[lineIndex].parent = this;
              height += lines[lineIndex].height;
            }
            this.height = height;
          },
          'name',
          { value: 'fo', configurable: true },
        );
        LeafChunk.prototype.chunkSize = function () {
          return this.lines.length;
        };
        LeafChunk.prototype.removeInner = function (startIndex, removeCount) {
          for (
            var lineIndex = startIndex, endIndex = startIndex + removeCount;
            lineIndex < endIndex;
            ++lineIndex
          ) {
            var line = this.lines[lineIndex];
            this.height -= line.height;
            cleanUpLine(line);
            signalLater(line, 'delete');
          }
          this.lines.splice(startIndex, removeCount);
        };
        LeafChunk.prototype.collapse = function (lines) {
          lines.push.apply(lines, this.lines);
        };
        LeafChunk.prototype.insertInner = function (insertIndex, lines, height) {
          this.height += height;
          this.lines = this.lines
            .slice(0, insertIndex)
            .concat(lines)
            .concat(this.lines.slice(insertIndex));
          for (var lineIndex = 0; lineIndex < lines.length; ++lineIndex) {
            lines[lineIndex].parent = this;
          }
        };
        LeafChunk.prototype.iterN = function (startIndex, lineCount, visitLine) {
          for (var endIndex = startIndex + lineCount; startIndex < endIndex; ++startIndex) {
            if (visitLine(this.lines[startIndex])) {
              return true;
            }
          }
        };
        var BranchChunk = Object.defineProperty(
          function (children) {
            this.children = children;
            for (
              var size = 0, height = 0, childIndex = 0;
              childIndex < children.length;
              ++childIndex
            ) {
              var child = children[childIndex];
              size += child.chunkSize();
              height += child.height;
              child.parent = this;
            }
            this.size = size;
            this.height = height;
            this.parent = null;
          },
          'name',
          { value: 'mo', configurable: true },
        );
        BranchChunk.prototype.chunkSize = function () {
          return this.size;
        };
        BranchChunk.prototype.removeInner = function (startIndex, removeCount) {
          this.size -= removeCount;
          for (var childIndex = 0; childIndex < this.children.length; ++childIndex) {
            var child = this.children[childIndex],
              childSize = child.chunkSize();
            if (startIndex < childSize) {
              var removedCount = Math.min(removeCount, childSize - startIndex),
                oldHeight = child.height;
              child.removeInner(startIndex, removedCount);
              this.height -= oldHeight - child.height;
              if (childSize == removedCount) {
                this.children.splice(childIndex--, 1);
                child.parent = null;
              }
              if (0 == (removeCount -= removedCount)) {
                break;
              }
              startIndex = 0;
            } else {
              startIndex -= childSize;
            }
          }
          if (
            this.size - removeCount < 25 &&
            (this.children.length > 1 || !(this.children[0] instanceof LeafChunk))
          ) {
            var lines = [];
            this.collapse(lines);
            this.children = [new LeafChunk(lines)];
            this.children[0].parent = this;
          }
        };
        BranchChunk.prototype.collapse = function (lines) {
          for (var childIndex = 0; childIndex < this.children.length; ++childIndex) {
            this.children[childIndex].collapse(lines);
          }
        };
        BranchChunk.prototype.insertInner = function (insertIndex, lines, height) {
          this.size += lines.length;
          this.height += height;
          for (var childIndex = 0; childIndex < this.children.length; ++childIndex) {
            var child = this.children[childIndex],
              childSize = child.chunkSize();
            if (insertIndex <= childSize) {
              child.insertInner(insertIndex, lines, height);
              if (child.lines && child.lines.length > 50) {
                for (
                  var remaining = (child.lines.length % 25) + 25, position = remaining;
                  position < child.lines.length;
                ) {
                  var leaf = new LeafChunk(child.lines.slice(position, (position += 25)));
                  child.height -= leaf.height;
                  this.children.splice(++childIndex, 0, leaf);
                  leaf.parent = this;
                }
                child.lines = child.lines.slice(0, remaining);
                this.maybeSpill();
              }
              break;
            }
            insertIndex -= childSize;
          }
        };
        BranchChunk.prototype.maybeSpill = function () {
          if (!(this.children.length <= 10)) {
            var chunk = this;
            do {
              var spilled = chunk.children.splice(chunk.children.length - 5, 5),
                sibling = new BranchChunk(spilled);
              if (chunk.parent) {
                chunk.size -= sibling.size;
                chunk.height -= sibling.height;
                var myIndex = indexOf(chunk.parent.children, chunk);
                chunk.parent.children.splice(myIndex + 1, 0, sibling);
              } else {
                var leftChunk = new BranchChunk(chunk.children);
                leftChunk.parent = chunk;
                chunk.children = [leftChunk, sibling];
                chunk = leftChunk;
              }
              sibling.parent = chunk.parent;
            } while (chunk.children.length > 10);
            chunk.parent.maybeSpill();
          }
        };
        BranchChunk.prototype.iterN = function (startIndex, lineCount, visitLine) {
          for (var childIndex = 0; childIndex < this.children.length; ++childIndex) {
            var child = this.children[childIndex],
              childSize = child.chunkSize();
            if (startIndex < childSize) {
              var used = Math.min(lineCount, childSize - startIndex);
              if (child.iterN(startIndex, used, visitLine)) {
                return true;
              }
              if (0 == (lineCount -= used)) {
                break;
              }
              startIndex = 0;
            } else {
              startIndex -= childSize;
            }
          }
        };
        var LineWidget = Object.defineProperty(
          function (documentModel, node, options) {
            if (options) {
              for (var opt in options) {
                if (options.hasOwnProperty(opt)) {
                  this[opt] = options[opt];
                }
              }
            }
            this.doc = documentModel;
            this.node = node;
          },
          'name',
          { value: 'go', configurable: true },
        );
        function adjustScrollWhenAboveVisible(editor, line, diff) {
          if (
            heightAtLine(line) < ((editor.curOp && editor.curOp.scrollTop) || editor.doc.scrollTop)
          ) {
            addToScrollTop(editor, diff);
          }
        }
        LineWidget.prototype.clear = function () {
          var editor = this.doc.cm,
            widgets = this.line.widgets,
            line = this.line,
            lineNumber = lineNo(line);
          if (null != lineNumber && widgets) {
            for (var widgetIndex = 0; widgetIndex < widgets.length; ++widgetIndex) {
              if (widgets[widgetIndex] == this) {
                widgets.splice(widgetIndex--, 1);
              }
            }
            if (!widgets.length) {
              line.widgets = null;
            }
            var height = widgetHeight(this);
            updateLineHeight(line, Math.max(0, line.height - height));
            if (editor) {
              runInOp(editor, function () {
                adjustScrollWhenAboveVisible(editor, line, -height);
                regLineChange(editor, lineNumber, 'widget');
              });
              signalLater(editor, 'lineWidgetCleared', editor, this, lineNumber);
            }
          }
        };
        LineWidget.prototype.changed = function () {
          var this$1 = this,
            oldH = this.height,
            editor = this.doc.cm,
            line = this.line;
          this.height = null;
          var diff = widgetHeight(this) - oldH;
          if (diff) {
            updateLineHeight(line, line.height + diff);
            if (editor) {
              runInOp(editor, function () {
                editor.curOp.forceUpdate = true;
                adjustScrollWhenAboveVisible(editor, line, diff);
                signalLater(editor, 'lineWidgetChanged', editor, this$1, lineNo(line));
              });
            }
          }
        };
        eventMixin(LineWidget);
        var nextMarkerId = 0,
          TextMarker = Object.defineProperty(
            function (documentModel, type) {
              this.lines = [];
              this.type = type;
              this.doc = documentModel;
              this.id = ++nextMarkerId;
            },
            'name',
            { value: 'bo', configurable: true },
          );
        function markText(documentModel, from, rangeEnd, options, type) {
          if (options && options.shared) {
            return (function (documentModel, from, rangeEnd, options, type) {
              (options = copyObj(options)).shared = false;
              var markers = [markText(documentModel, from, rangeEnd, options, type)],
                primary = markers[0],
                widget = options.widgetNode;
              linkedDocs(documentModel, function (documentModel) {
                if (widget) {
                  options.widgetNode = widget.cloneNode(true);
                }
                markers.push(
                  markText(
                    documentModel,
                    clipPos(documentModel, from),
                    clipPos(documentModel, rangeEnd),
                    options,
                    type,
                  ),
                );
                for (var linkIndex = 0; linkIndex < documentModel.linked.length; ++linkIndex) {
                  if (documentModel.linked[linkIndex].isParent) {
                    return;
                  }
                }
                primary = lst(markers);
              });
              return new SharedTextMarker(markers, primary);
            })(documentModel, from, rangeEnd, options, type);
          }
          if (documentModel.cm && !documentModel.cm.curOp) {
            return operation(documentModel.cm, markText)(
              documentModel,
              from,
              rangeEnd,
              options,
              type,
            );
          }
          var marker = new TextMarker(documentModel, type),
            diff = cmp(from, rangeEnd);
          if (options) {
            copyObj(options, marker, false);
          }
          if (diff > 0 || (0 == diff && false !== marker.clearWhenEmpty)) {
            return marker;
          }
          if (marker.replacedWith) {
            marker.collapsed = true;
            marker.widgetNode = eltP('span', [marker.replacedWith], 'CodeMirror-widget');
            if (!options.handleMouseEvents) {
              marker.widgetNode.setAttribute('cm-ignore-events', 'true');
            }
            if (options.insertLeft) {
              marker.widgetNode.insertLeft = true;
            }
          }
          if (marker.collapsed) {
            if (
              conflictingCollapsedRange(documentModel, from.line, from, rangeEnd, marker) ||
              (from.line != rangeEnd.line &&
                conflictingCollapsedRange(documentModel, rangeEnd.line, from, rangeEnd, marker))
            ) {
              throw new Error('Inserting collapsed marker partially overlapping an existing one');
            }
            sawCollapsedSpans = true;
          }
          if (marker.addToHistory) {
            addChangeToHistory(
              documentModel,
              { from: from, to: rangeEnd, origin: 'markText' },
              documentModel.sel,
              NaN,
            );
          }
          var updateMaxLine,
            curLine = from.line,
            editor = documentModel.cm;
          documentModel.iter(curLine, rangeEnd.line + 1, function (line) {
            if (
              editor &&
              marker.collapsed &&
              !editor.options.lineWrapping &&
              visualLine(line) == editor.display.maxLine
            ) {
              updateMaxLine = true;
            }
            if (marker.collapsed && curLine != from.line) {
              updateLineHeight(line, 0);
            }
            (function (line, span) {
              line.markedSpans = line.markedSpans ? line.markedSpans.concat([span]) : [span];
              span.marker.attachLine(line);
            })(
              line,
              new MarkedSpan(
                marker,
                curLine == from.line ? from.ch : null,
                curLine == rangeEnd.line ? rangeEnd.ch : null,
              ),
            );
            ++curLine;
          });
          if (marker.collapsed) {
            documentModel.iter(from.line, rangeEnd.line + 1, function (line) {
              if (lineIsHidden(documentModel, line)) {
                updateLineHeight(line, 0);
              }
            });
          }
          if (marker.clearOnEnter) {
            addEventHandler(marker, 'beforeCursorEnter', function () {
              return marker.clear();
            });
          }
          if (marker.readOnly) {
            sawReadOnlySpans = true;
            if (documentModel.history.done.length || documentModel.history.undone.length) {
              documentModel.clearHistory();
            }
          }
          if (marker.collapsed) {
            marker.id = ++nextMarkerId;
            marker.atomic = true;
          }
          if (editor) {
            if (updateMaxLine) {
              editor.curOp.updateMaxLine = true;
            }
            if (marker.collapsed) {
              regChange(editor, from.line, rangeEnd.line + 1);
            } else {
              if (
                marker.className ||
                marker.title ||
                marker.startStyle ||
                marker.endStyle ||
                marker.css
              ) {
                for (var lineNumber = from.line; lineNumber <= rangeEnd.line; lineNumber++) {
                  regLineChange(editor, lineNumber, 'text');
                }
              }
            }
            if (marker.atomic) {
              reCheckSelection(editor.doc);
            }
            signalLater(editor, 'markerAdded', editor, marker);
          }
          return marker;
        }
        TextMarker.prototype.clear = function () {
          if (!this.explicitlyCleared) {
            var editor = this.doc.cm,
              withOp = editor && !editor.curOp;
            if (withOp) {
              startOperation(editor);
            }
            if (hasHandler(this, 'clear')) {
              var found = this.find();
              if (found) {
                signalLater(this, 'clear', found.from, found.to);
              }
            }
            for (
              var min = null, max = null, lineIndex = 0;
              lineIndex < this.lines.length;
              ++lineIndex
            ) {
              var line = this.lines[lineIndex],
                span = getMarkedSpanFor(line.markedSpans, this);
              if (editor && !this.collapsed) {
                regLineChange(editor, lineNo(line), 'text');
              } else {
                if (editor) {
                  if (null != span.to) {
                    max = lineNo(line);
                  }
                  if (null != span.from) {
                    min = lineNo(line);
                  }
                }
              }
              line.markedSpans = removeMarkedSpan(line.markedSpans, span);
              if (null == span.from && this.collapsed && !lineIsHidden(this.doc, line) && editor) {
                updateLineHeight(line, textHeight(editor.display));
              }
            }
            if (editor && this.collapsed && !editor.options.lineWrapping) {
              for (var i$1 = 0; i$1 < this.lines.length; ++i$1) {
                var visual = visualLine(this.lines[i$1]),
                  len = lineLength(visual);
                if (len > editor.display.maxLineLength) {
                  editor.display.maxLine = visual;
                  editor.display.maxLineLength = len;
                  editor.display.maxLineChanged = true;
                }
              }
            }
            if (null != min && editor && this.collapsed) {
              regChange(editor, min, max + 1);
            }
            this.lines.length = 0;
            this.explicitlyCleared = true;
            if (this.atomic && this.doc.cantEdit) {
              this.doc.cantEdit = false;
              if (editor) {
                reCheckSelection(editor.doc);
              }
            }
            if (editor) {
              signalLater(editor, 'markerCleared', editor, this, min, max);
            }
            if (withOp) {
              endOperation(editor);
            }
            if (this.parent) {
              this.parent.clear();
            }
          }
        };
        TextMarker.prototype.find = function (side, lineObj) {
          var from, endPosition;
          if (null == side && 'bookmark' == this.type) {
            side = 1;
          }
          for (var lineIndex = 0; lineIndex < this.lines.length; ++lineIndex) {
            var line = this.lines[lineIndex],
              span = getMarkedSpanFor(line.markedSpans, this);
            if (
              null != span.from &&
              ((from = Pos(lineObj ? line : lineNo(line), span.from)), -1 == side)
            ) {
              return from;
            }
            if (
              null != span.to &&
              ((endPosition = Pos(lineObj ? line : lineNo(line), span.to)), 1 == side)
            ) {
              return endPosition;
            }
          }
          return from && { from: from, to: endPosition };
        };
        TextMarker.prototype.changed = function () {
          var this$1 = this,
            position = this.find(-1, true),
            widget = this,
            editor = this.doc.cm;
          if (position && editor) {
            runInOp(editor, function () {
              var line = position.line,
                lineN = lineNo(position.line),
                view = findViewForLine(editor, lineN);
              if (view) {
                clearLineMeasurementCacheFor(view);
                editor.curOp.selectionChanged = editor.curOp.forceUpdate = true;
              }
              editor.curOp.updateMaxLine = true;
              if (!lineIsHidden(widget.doc, line) && null != widget.height) {
                var oldHeight = widget.height;
                widget.height = null;
                var dHeight = widgetHeight(widget) - oldHeight;
                if (dHeight) {
                  updateLineHeight(line, line.height + dHeight);
                }
              }
              signalLater(editor, 'markerChanged', editor, this$1);
            });
          }
        };
        TextMarker.prototype.attachLine = function (line) {
          if (!this.lines.length && this.doc.cm) {
            var operation = this.doc.cm.curOp;
            if (
              !(operation.maybeHiddenMarkers && -1 != indexOf(operation.maybeHiddenMarkers, this))
            ) {
              (operation.maybeUnhiddenMarkers || (operation.maybeUnhiddenMarkers = [])).push(this);
            }
          }
          this.lines.push(line);
        };
        TextMarker.prototype.detachLine = function (line) {
          this.lines.splice(indexOf(this.lines, line), 1);
          if (!this.lines.length && this.doc.cm) {
            var operation = this.doc.cm.curOp;
            (operation.maybeHiddenMarkers || (operation.maybeHiddenMarkers = [])).push(this);
          }
        };
        eventMixin(TextMarker);
        var SharedTextMarker = Object.defineProperty(
          function (markers, primary) {
            this.markers = markers;
            this.primary = primary;
            for (var markerIndex = 0; markerIndex < markers.length; ++markerIndex) {
              markers[markerIndex].parent = this;
            }
          },
          'name',
          { value: 'xo', configurable: true },
        );
        function findSharedMarkers(documentModel) {
          return documentModel.findMarks(
            Pos(documentModel.first, 0),
            documentModel.clipPos(Pos(documentModel.lastLine())),
            function (marker) {
              return marker.parent;
            },
          );
        }
        function detachSharedMarkers(markers) {
          for (
            var loop = Object.defineProperty(
                function (markerIndex) {
                  var marker = markers[markerIndex],
                    linked = [marker.primary.doc];
                  linkedDocs(marker.primary.doc, function (linkedDocument) {
                    return linked.push(linkedDocument);
                  });
                  for (
                    var sharedMarkerIndex = 0;
                    sharedMarkerIndex < marker.markers.length;
                    sharedMarkerIndex++
                  ) {
                    var subMarker = marker.markers[sharedMarkerIndex];
                    if (-1 == indexOf(linked, subMarker.doc)) {
                      subMarker.parent = null;
                      marker.markers.splice(sharedMarkerIndex--, 1);
                    }
                  }
                },
                'name',
                { value: 't', configurable: true },
              ),
              documentIndex = 0;
            documentIndex < markers.length;
            documentIndex++
          ) {
            loop(documentIndex);
          }
        }
        SharedTextMarker.prototype.clear = function () {
          if (!this.explicitlyCleared) {
            this.explicitlyCleared = true;
            for (var markerIndex = 0; markerIndex < this.markers.length; ++markerIndex) {
              this.markers[markerIndex].clear();
            }
            signalLater(this, 'clear');
          }
        };
        SharedTextMarker.prototype.find = function (side, lineObject) {
          return this.primary.find(side, lineObject);
        };
        eventMixin(SharedTextMarker);
        var nextDocId = 0,
          Doc = Object.defineProperty(
            function (text, mode, firstLine, lineSep, direction) {
              if (!(this instanceof Doc)) {
                return new Doc(text, mode, firstLine, lineSep, direction);
              }
              if (null == firstLine) {
                firstLine = 0;
              }
              BranchChunk.call(this, [new LeafChunk([new Line('', null)])]);
              this.first = firstLine;
              this.scrollTop = this.scrollLeft = 0;
              this.cantEdit = false;
              this.cleanGeneration = 1;
              this.frontier = firstLine;
              var start = Pos(firstLine, 0);
              this.sel = simpleSelection(start);
              this.history = new History(null);
              this.id = ++nextDocId;
              this.modeOption = mode;
              this.lineSep = lineSep;
              this.direction = 'rtl' == direction ? 'rtl' : 'ltr';
              this.extend = false;
              if ('string' == typeof text) {
                text = this.splitLines(text);
              }
              updateDoc(this, { from: start, to: start, text: text });
              setSelection(this, simpleSelection(start), sel_dontScroll);
            },
            'name',
            { value: 'ko', configurable: true },
          );
        Doc.prototype = createObj(BranchChunk.prototype, {
          constructor: Doc,
          iter: function (from, endLine, visitLine) {
            if (visitLine) {
              this.iterN(from - this.first, endLine - from, visitLine);
            } else {
              this.iterN(this.first, this.first + this.size, from);
            }
          },
          insert: function (insertLine, lines) {
            for (var height = 0, lineIndex = 0; lineIndex < lines.length; ++lineIndex) {
              height += lines[lineIndex].height;
            }
            this.insertInner(insertLine - this.first, lines, height);
          },
          remove: function (startLine, removeCount) {
            this.removeInner(startLine - this.first, removeCount);
          },
          getValue: function (lineSep) {
            var lines = getLines(this, this.first, this.first + this.size);
            if (false === lineSep) {
              return lines;
            } else {
              return lines.join(lineSep || this.lineSeparator());
            }
          },
          setValue: docMethodOp(function (text, origin) {
            var startPosition = Pos(this.first, 0),
              lastLine = this.first + this.size - 1;
            makeChange(
              this,
              {
                from: startPosition,
                to: Pos(lastLine, getLine(this, lastLine).text.length),
                text: this.splitLines(text),
                origin: origin || 'setValue',
                full: true,
              },
              true,
            );
            if (this.cm) {
              scrollToCoords(this.cm, 0, 0);
            }
            setSelection(this, simpleSelection(startPosition), sel_dontScroll);
          }),
          replaceRange: function (code, from, rangeEnd, origin) {
            replaceRange(
              this,
              code,
              (from = clipPos(this, from)),
              (rangeEnd = rangeEnd ? clipPos(this, rangeEnd) : from),
              origin,
            );
          },
          getRange: function (from, rangeEnd, lineSep) {
            var lines = getBetween(this, clipPos(this, from), clipPos(this, rangeEnd));
            if (false === lineSep) {
              return lines;
            } else {
              return lines.join(lineSep || this.lineSeparator());
            }
          },
          getLine: function (line) {
            var lineHandle = this.getLineHandle(line);
            return lineHandle && lineHandle.text;
          },
          getLineHandle: function (line) {
            if (isLine(this, line)) {
              return getLine(this, line);
            }
          },
          getLineNumber: function (line) {
            return lineNo(line);
          },
          getLineHandleVisualStart: function (line) {
            if ('number' == typeof line) {
              line = getLine(this, line);
            }
            return visualLine(line);
          },
          lineCount: function () {
            return this.size;
          },
          firstLine: function () {
            return this.first;
          },
          lastLine: function () {
            return this.first + this.size - 1;
          },
          clipPos: function (position) {
            return clipPos(this, position);
          },
          getCursor: function (start) {
            var range$$1 = this.sel.primary();
            if (null == start || 'head' == start) {
              return range$$1.head;
            } else {
              if ('anchor' == start) {
                return range$$1.anchor;
              } else {
                if ('end' == start || 'to' == start || false === start) {
                  return range$$1.to();
                } else {
                  return range$$1.from();
                }
              }
            }
          },
          listSelections: function () {
            return this.sel.ranges;
          },
          somethingSelected: function () {
            return this.sel.somethingSelected();
          },
          setCursor: docMethodOp(function (line, column, options) {
            setSimpleSelection(
              this,
              clipPos(this, 'number' == typeof line ? Pos(line, column || 0) : line),
              null,
              options,
            );
          }),
          setSelection: docMethodOp(function (anchor, head, options) {
            setSimpleSelection(this, clipPos(this, anchor), clipPos(this, head || anchor), options);
          }),
          extendSelection: docMethodOp(function (head, other, options) {
            extendSelection(this, clipPos(this, head), other && clipPos(this, other), options);
          }),
          extendSelections: docMethodOp(function (heads, options) {
            extendSelections(this, clipPosArray(this, heads), options);
          }),
          extendSelectionsBy: docMethodOp(function (range, options) {
            extendSelections(this, clipPosArray(this, map(this.sel.ranges, range)), options);
          }),
          setSelections: docMethodOp(function (ranges, primary, options) {
            if (ranges.length) {
              for (var out = [], rangeIndex = 0; rangeIndex < ranges.length; rangeIndex++) {
                out[rangeIndex] = new Range(
                  clipPos(this, ranges[rangeIndex].anchor),
                  clipPos(this, ranges[rangeIndex].head),
                );
              }
              if (null == primary) {
                primary = Math.min(ranges.length - 1, this.sel.primIndex);
              }
              setSelection(this, normalizeSelection(out, primary), options);
            }
          }),
          addSelection: docMethodOp(function (anchor, head, options) {
            var ranges = this.sel.ranges.slice(0);
            ranges.push(new Range(clipPos(this, anchor), clipPos(this, head || anchor)));
            setSelection(this, normalizeSelection(ranges, ranges.length - 1), options);
          }),
          getSelection: function (lineSep) {
            for (
              var lines, ranges = this.sel.ranges, rangeIndex = 0;
              rangeIndex < ranges.length;
              rangeIndex++
            ) {
              var selection = getBetween(this, ranges[rangeIndex].from(), ranges[rangeIndex].to());
              lines = lines ? lines.concat(selection) : selection;
            }
            if (false === lineSep) {
              return lines;
            } else {
              return lines.join(lineSep || this.lineSeparator());
            }
          },
          getSelections: function (lineSep) {
            for (
              var parts = [], ranges = this.sel.ranges, rangeIndex = 0;
              rangeIndex < ranges.length;
              rangeIndex++
            ) {
              var selection = getBetween(this, ranges[rangeIndex].from(), ranges[rangeIndex].to());
              if (false !== lineSep) {
                selection = selection.join(lineSep || this.lineSeparator());
              }
              parts[rangeIndex] = selection;
            }
            return parts;
          },
          replaceSelection: function (code, collapse, origin) {
            for (var dup = [], rangeIndex = 0; rangeIndex < this.sel.ranges.length; rangeIndex++) {
              dup[rangeIndex] = code;
            }
            this.replaceSelections(dup, collapse, origin || '+input');
          },
          replaceSelections: docMethodOp(function (code, collapse, origin) {
            for (
              var changes = [], selection = this.sel, rangeIndex = 0;
              rangeIndex < selection.ranges.length;
              rangeIndex++
            ) {
              var range$$1 = selection.ranges[rangeIndex];
              changes[rangeIndex] = {
                from: range$$1.from(),
                to: range$$1.to(),
                text: this.splitLines(code[rangeIndex]),
                origin: origin,
              };
            }
            for (
              var newSel =
                  collapse &&
                  'end' != collapse &&
                  (function (documentModel, changes, hint) {
                    for (
                      var out = [],
                        oldPrev = Pos(documentModel.first, 0),
                        newPrev = oldPrev,
                        textIndex = 0;
                      textIndex < changes.length;
                      textIndex++
                    ) {
                      var change = changes[textIndex],
                        from = offsetPos(change.from, oldPrev, newPrev),
                        adjustedEnd = offsetPos(changeEnd(change), oldPrev, newPrev);
                      oldPrev = change.to;
                      newPrev = adjustedEnd;
                      if ('around' == hint) {
                        var range = documentModel.sel.ranges[textIndex],
                          inv = cmp(range.head, range.anchor) < 0;
                        out[textIndex] = new Range(
                          inv ? adjustedEnd : from,
                          inv ? from : adjustedEnd,
                        );
                      } else {
                        out[textIndex] = new Range(from, from);
                      }
                    }
                    return new Selection(out, documentModel.sel.primIndex);
                  })(this, changes, collapse),
                i$1 = changes.length - 1;
              i$1 >= 0;
              i$1--
            ) {
              makeChange(this, changes[i$1]);
            }
            if (newSel) {
              setSelectionReplaceHistory(this, newSel);
            } else {
              if (this.cm) {
                ensureCursorVisible(this.cm);
              }
            }
          }),
          makeChange: docMethodOp(function (text) {
            makeChange(this, text);
          }),
          undo: docMethodOp(function () {
            makeChangeFromHistory(this, 'undo');
          }),
          redo: docMethodOp(function () {
            makeChangeFromHistory(this, 'redo');
          }),
          undoSelection: docMethodOp(function () {
            makeChangeFromHistory(this, 'undo', true);
          }),
          redoSelection: docMethodOp(function () {
            makeChangeFromHistory(this, 'redo', true);
          }),
          setExtending: function (val) {
            this.extend = val;
          },
          getExtending: function () {
            return this.extend;
          },
          historySize: function () {
            for (
              var hist = this.history, done = 0, undone = 0, eventIndex = 0;
              eventIndex < hist.done.length;
              eventIndex++
            ) {
              if (!hist.done[eventIndex].ranges) {
                ++done;
              }
            }
            for (var i$1 = 0; i$1 < hist.undone.length; i$1++) {
              if (!hist.undone[i$1].ranges) {
                ++undone;
              }
            }
            return { undo: done, redo: undone };
          },
          clearHistory: function () {
            this.history = new History(this.history.maxGeneration);
          },
          markClean: function () {
            this.cleanGeneration = this.changeGeneration(true);
          },
          changeGeneration: function (forceSplit) {
            if (forceSplit) {
              this.history.lastOp = this.history.lastSelOp = this.history.lastOrigin = null;
            }
            return this.history.generation;
          },
          isClean: function (gen) {
            return this.history.generation == (gen || this.cleanGeneration);
          },
          getHistory: function () {
            return {
              done: copyHistoryArray(this.history.done),
              undone: copyHistoryArray(this.history.undone),
            };
          },
          setHistory: function (histData) {
            var hist = (this.history = new History(this.history.maxGeneration));
            hist.done = copyHistoryArray(histData.done.slice(0), null, true);
            hist.undone = copyHistoryArray(histData.undone.slice(0), null, true);
          },
          setGutterMarker: docMethodOp(function (line, gutterID, value) {
            return changeLine(this, line, 'gutter', function (line) {
              var markers = line.gutterMarkers || (line.gutterMarkers = {});
              markers[gutterID] = value;
              if (!value && isEmpty(markers)) {
                line.gutterMarkers = null;
              }
              return true;
            });
          }),
          clearGutter: docMethodOp(function (gutterID) {
            var this$1 = this;
            this.iter(function (line) {
              if (line.gutterMarkers && line.gutterMarkers[gutterID]) {
                changeLine(this$1, line, 'gutter', function () {
                  line.gutterMarkers[gutterID] = null;
                  if (isEmpty(line.gutterMarkers)) {
                    line.gutterMarkers = null;
                  }
                  return true;
                });
              }
            });
          }),
          lineInfo: function (line) {
            var lineNumber;
            if ('number' == typeof line) {
              if (!isLine(this, line)) {
                return null;
              }
              lineNumber = line;
              if (!(line = getLine(this, line))) {
                return null;
              }
            } else {
              if (null == (lineNumber = lineNo(line))) {
                return null;
              }
            }
            return {
              line: lineNumber,
              handle: line,
              text: line.text,
              gutterMarkers: line.gutterMarkers,
              textClass: line.textClass,
              bgClass: line.bgClass,
              wrapClass: line.wrapClass,
              widgets: line.widgets,
            };
          },
          addLineClass: docMethodOp(function (handle, where, cls) {
            return changeLine(
              this,
              handle,
              'gutter' == where ? 'gutter' : 'class',
              function (line) {
                var prop =
                  'text' == where
                    ? 'textClass'
                    : 'background' == where
                      ? 'bgClass'
                      : 'gutter' == where
                        ? 'gutterClass'
                        : 'wrapClass';
                if (line[prop]) {
                  if (classTest(cls).test(line[prop])) {
                    return false;
                  }
                  line[prop] += ' ' + cls;
                } else {
                  line[prop] = cls;
                }
                return true;
              },
            );
          }),
          removeLineClass: docMethodOp(function (handle, where, cls) {
            return changeLine(
              this,
              handle,
              'gutter' == where ? 'gutter' : 'class',
              function (line) {
                var prop =
                    'text' == where
                      ? 'textClass'
                      : 'background' == where
                        ? 'bgClass'
                        : 'gutter' == where
                          ? 'gutterClass'
                          : 'wrapClass',
                  cur = line[prop];
                if (!cur) {
                  return false;
                }
                if (null == cls) {
                  line[prop] = null;
                } else {
                  var found = cur.match(classTest(cls));
                  if (!found) {
                    return false;
                  }
                  var end = found.index + found[0].length;
                  line[prop] =
                    cur.slice(0, found.index) +
                      (found.index && end != cur.length ? ' ' : '') +
                      cur.slice(end) || null;
                }
                return true;
              },
            );
          }),
          addLineWidget: docMethodOp(function (handle, node, options) {
            return (function (documentModel, handle, node, options) {
              var widget = new LineWidget(documentModel, node, options),
                editor = documentModel.cm;
              if (editor && widget.noHScroll) {
                editor.display.alignWidgets = true;
              }
              changeLine(documentModel, handle, 'widget', function (line) {
                var widgets = line.widgets || (line.widgets = []);
                if (null == widget.insertAt) {
                  widgets.push(widget);
                } else {
                  widgets.splice(
                    Math.min(widgets.length - 1, Math.max(0, widget.insertAt)),
                    0,
                    widget,
                  );
                }
                widget.line = line;
                if (editor && !lineIsHidden(documentModel, line)) {
                  var aboveVisible = heightAtLine(line) < documentModel.scrollTop;
                  updateLineHeight(line, line.height + widgetHeight(widget));
                  if (aboveVisible) {
                    addToScrollTop(editor, widget.height);
                  }
                  editor.curOp.forceUpdate = true;
                }
                return true;
              });
              signalLater(
                editor,
                'lineWidgetAdded',
                editor,
                widget,
                'number' == typeof handle ? handle : lineNo(handle),
              );
              return widget;
            })(this, handle, node, options);
          }),
          removeLineWidget: function (widget) {
            widget.clear();
          },
          markText: function (from, rangeEnd, options) {
            return markText(
              this,
              clipPos(this, from),
              clipPos(this, rangeEnd),
              options,
              (options && options.type) || 'range',
            );
          },
          setBookmark: function (position, options) {
            var realOpts = {
              replacedWith: options && (null == options.nodeType ? options.widget : options),
              insertLeft: options && options.insertLeft,
              clearWhenEmpty: false,
              shared: options && options.shared,
              handleMouseEvents: options && options.handleMouseEvents,
            };
            return markText(
              this,
              (position = clipPos(this, position)),
              position,
              realOpts,
              'bookmark',
            );
          },
          findMarksAt: function (position) {
            var markers = [],
              spans = getLine(this, (position = clipPos(this, position)).line).markedSpans;
            if (spans) {
              for (var spanIndex = 0; spanIndex < spans.length; ++spanIndex) {
                var span = spans[spanIndex];
                if (
                  (null == span.from || span.from <= position.ch) &&
                  (null == span.to || span.to >= position.ch)
                ) {
                  markers.push(span.marker.parent || span.marker);
                }
              }
            }
            return markers;
          },
          findMarks: function (from, rangeEnd, filter) {
            from = clipPos(this, from);
            rangeEnd = clipPos(this, rangeEnd);
            var found = [],
              lineNo$$1 = from.line;
            this.iter(from.line, rangeEnd.line + 1, function (line) {
              var spans = line.markedSpans;
              if (spans) {
                for (var spanIndex = 0; spanIndex < spans.length; spanIndex++) {
                  var span = spans[spanIndex];
                  if (
                    !(
                      (null != span.to && lineNo$$1 == from.line && from.ch >= span.to) ||
                      (null == span.from && lineNo$$1 != from.line) ||
                      (null != span.from &&
                        lineNo$$1 == rangeEnd.line &&
                        span.from >= rangeEnd.ch) ||
                      (filter && !filter(span.marker))
                    )
                  ) {
                    found.push(span.marker.parent || span.marker);
                  }
                }
              }
              ++lineNo$$1;
            });
            return found;
          },
          getAllMarks: function () {
            var markers = [];
            this.iter(function (line) {
              var sps = line.markedSpans;
              if (sps) {
                for (var spanIndex = 0; spanIndex < sps.length; ++spanIndex) {
                  if (null != sps[spanIndex].from) {
                    markers.push(sps[spanIndex].marker);
                  }
                }
              }
            });
            return markers;
          },
          posFromIndex: function (off) {
            var column,
              lineNo$$1 = this.first,
              sepSize = this.lineSeparator().length;
            this.iter(function (line) {
              var lineLength = line.text.length + sepSize;
              if (lineLength > off) {
                column = off;
                return true;
              }
              off -= lineLength;
              ++lineNo$$1;
            });
            return clipPos(this, Pos(lineNo$$1, column));
          },
          indexFromPos: function (coords) {
            var index = (coords = clipPos(this, coords)).ch;
            if (coords.line < this.first || coords.ch < 0) {
              return 0;
            }
            var sepSize = this.lineSeparator().length;
            this.iter(this.first, coords.line, function (line) {
              index += line.text.length + sepSize;
            });
            return index;
          },
          copy: function (copyHistory) {
            var documentModel = new Doc(
              getLines(this, this.first, this.first + this.size),
              this.modeOption,
              this.first,
              this.lineSep,
              this.direction,
            );
            documentModel.scrollTop = this.scrollTop;
            documentModel.scrollLeft = this.scrollLeft;
            documentModel.sel = this.sel;
            documentModel.extend = false;
            if (copyHistory) {
              documentModel.history.undoDepth = this.history.undoDepth;
              documentModel.setHistory(this.getHistory());
            }
            return documentModel;
          },
          linkedDoc: function (options) {
            if (!options) {
              options = {};
            }
            var from = this.first,
              endLine = this.first + this.size;
            if (null != options.from && options.from > from) {
              from = options.from;
            }
            if (null != options.to && options.to < endLine) {
              endLine = options.to;
            }
            var copy = new Doc(
              getLines(this, from, endLine),
              options.mode || this.modeOption,
              from,
              this.lineSep,
              this.direction,
            );
            if (options.sharedHist) {
              copy.history = this.history;
            }
            (this.linked || (this.linked = [])).push({ doc: copy, sharedHist: options.sharedHist });
            copy.linked = [{ doc: this, isParent: true, sharedHist: options.sharedHist }];
            (function (documentModel, markers) {
              for (var documentIndex = 0; documentIndex < markers.length; documentIndex++) {
                var marker = markers[documentIndex],
                  position = marker.find(),
                  mFrom = documentModel.clipPos(position.from),
                  mTo = documentModel.clipPos(position.to);
                if (cmp(mFrom, mTo)) {
                  var subMark = markText(
                    documentModel,
                    mFrom,
                    mTo,
                    marker.primary,
                    marker.primary.type,
                  );
                  marker.markers.push(subMark);
                  subMark.parent = marker;
                }
              }
            })(copy, findSharedMarkers(this));
            return copy;
          },
          unlinkDoc: function (other) {
            if (other instanceof CodeMirror) {
              other = other.doc;
            }
            if (this.linked) {
              for (var linkIndex = 0; linkIndex < this.linked.length; ++linkIndex) {
                if (this.linked[linkIndex].doc == other) {
                  this.linked.splice(linkIndex, 1);
                  other.unlinkDoc(this);
                  detachSharedMarkers(findSharedMarkers(this));
                  break;
                }
              }
            }
            if (other.history == this.history) {
              var splitIds = [other.id];
              linkedDocs(
                other,
                function (documentModel) {
                  return splitIds.push(documentModel.id);
                },
                true,
              );
              other.history = new History(null);
              other.history.done = copyHistoryArray(this.history.done, splitIds);
              other.history.undone = copyHistoryArray(this.history.undone, splitIds);
            }
          },
          iterLinkedDocs: function (visitLinkedDocument) {
            linkedDocs(this, visitLinkedDocument);
          },
          getMode: function () {
            return this.mode;
          },
          getEditor: function () {
            return this.cm;
          },
          splitLines: function (str) {
            if (this.lineSep) {
              return str.split(this.lineSep);
            } else {
              return splitLinesAuto(str);
            }
          },
          lineSeparator: function () {
            if (File.useCRLF) {
              return '\r\n';
            } else {
              return '\n';
            }
          },
          setDirection: docMethodOp(function (dir) {
            var editor;
            if ('rtl' != dir) {
              dir = 'ltr';
            }
            if (dir != this.direction) {
              this.direction = dir;
              this.iter(function (line) {
                return (line.order = null);
              });
              if (this.cm) {
                runInOp((editor = this.cm), function () {
                  setDirectionClass(editor);
                  regChange(editor);
                });
              }
            }
          }),
        });
        Doc.prototype.eachLine = Doc.prototype.iter;
        var lastDrop = 0;
        function onDrop(event) {
          var editor = this;
          clearDragCursor(editor);
          if (!signalDOMEvent(editor, event) && !eventInWidget(editor.display, event)) {
            e_preventDefault(event);
            if (isInternetExplorer) {
              lastDrop = +new Date();
            }
            var position = posFromMouse(editor, event, true),
              files = event.dataTransfer.files;
            if (position && !editor.isReadOnly()) {
              if (files && files.length && window.FileReader && window.File) {
                for (
                  var fileCount = files.length,
                    text = Array(fileCount),
                    read = 0,
                    loadFile = Object.defineProperty(
                      function (file, fileIndex) {
                        if (
                          !editor.options.allowDropFileTypes ||
                          -1 != indexOf(editor.options.allowDropFileTypes, file.type)
                        ) {
                          var reader = new FileReader();
                          reader.onload = operation(editor, function () {
                            var content = reader.result;
                            if (/[\x00-\x08\x0e-\x1f]{2}/.test(content)) {
                              content = '';
                            }
                            text[fileIndex] = content;
                            if (++read == fileCount) {
                              var change = {
                                from: (position = clipPos(editor.doc, position)),
                                to: position,
                                text: editor.doc.splitLines(text.join(editor.doc.lineSeparator())),
                                origin: 'paste',
                              };
                              makeChange(editor.doc, change);
                              setSelectionReplaceHistory(
                                editor.doc,
                                simpleSelection(position, changeEnd(change)),
                              );
                            }
                          });
                          reader.readAsText(file);
                        }
                      },
                      'name',
                      { value: 'l', configurable: true },
                    ),
                    fileIndex = 0;
                  fileIndex < fileCount;
                  ++fileIndex
                ) {
                  loadFile(files[fileIndex], fileIndex);
                }
              } else {
                if (editor.state.draggingText && editor.doc.sel.contains(position) > -1) {
                  editor.state.draggingText(event);
                  return void setTimeout(function () {
                    return editor.display.input.focus();
                  }, 20);
                }
                try {
                  var text$1 = event.dataTransfer.getData('Text');
                  if (text$1) {
                    var selected;
                    if (editor.state.draggingText && !editor.state.draggingText.copy) {
                      selected = editor.listSelections();
                    }
                    setSelectionNoUndo(editor.doc, simpleSelection(position, position));
                    if (selected) {
                      for (var i$1 = 0; i$1 < selected.length; ++i$1) {
                        replaceRange(
                          editor.doc,
                          '',
                          selected[i$1].anchor,
                          selected[i$1].head,
                          'drag',
                        );
                      }
                    }
                    editor.replaceSelection(text$1, 'around', 'paste');
                    editor.display.input.focus();
                  }
                } catch (dropError) {}
              }
            }
          }
        }
        function clearDragCursor(editor) {
          if (editor.display.dragCursor) {
            editor.display.lineSpace.removeChild(editor.display.dragCursor);
            editor.display.dragCursor = null;
          }
        }
        function forEachCodeMirror(visitEditor) {
          if (document.body.getElementsByClassName) {
            for (
              var byClass = document.body.getElementsByClassName('CodeMirror'), editorIndex = 0;
              editorIndex < byClass.length;
              editorIndex++
            ) {
              var editor = byClass[editorIndex].CodeMirror;
              if (editor) {
                visitEditor(editor);
              }
            }
          }
        }
        var globalsRegistered = false;
        function registerGlobalHandlers() {
          var resizeTimer;
          if (!globalsRegistered) {
            addEventHandler(window, 'resize', function () {
              if (null == resizeTimer) {
                resizeTimer = setTimeout(function () {
                  resizeTimer = null;
                  forEachCodeMirror(onResize);
                }, 500);
              }
            });
            addEventHandler(window, 'blur', function () {
              return forEachCodeMirror(onBlur);
            });
            globalsRegistered = true;
          }
        }
        function onResize(editor) {
          var display = editor.display;
          if (
            !(
              display.lastWrapHeight == display.wrapper.clientHeight &&
              display.lastWrapWidth == display.wrapper.clientWidth
            )
          ) {
            display.cachedCharWidth = display.cachedTextHeight = display.cachedPaddingH = null;
            display.scrollbarsClipped = false;
            editor.setSize();
          }
        }
        for (
          var keyNames = {
              3: 'Enter',
              8: 'Backspace',
              9: 'Tab',
              13: 'Enter',
              16: 'Shift',
              17: 'Ctrl',
              18: 'Alt',
              19: 'Pause',
              20: 'CapsLock',
              27: 'Esc',
              32: 'Space',
              33: 'PageUp',
              34: 'PageDown',
              35: 'End',
              36: 'Home',
              37: 'Left',
              38: 'Up',
              39: 'Right',
              40: 'Down',
              44: 'PrintScrn',
              45: 'Insert',
              46: 'Delete',
              59: ';',
              61: '=',
              91: 'Mod',
              92: 'Mod',
              93: 'Mod',
              106: '*',
              107: '=',
              109: '-',
              110: '.',
              111: '/',
              127: 'Delete',
              173: '-',
              186: ';',
              187: '=',
              188: ',',
              189: '-',
              190: '.',
              191: '/',
              192: '`',
              219: '[',
              220: '\\',
              221: ']',
              222: "'",
              63232: 'Up',
              63233: 'Down',
              63234: 'Left',
              63235: 'Right',
              63272: 'Delete',
              63273: 'Home',
              63275: 'End',
              63276: 'PageUp',
              63277: 'PageDown',
              63302: 'Insert',
            },
            digit = 0;
          digit < 10;
          digit++
        ) {
          keyNames[digit + 48] = keyNames[digit + 96] = String(digit);
        }
        for (var i$1 = 65; i$1 <= 90; i$1++) {
          keyNames[i$1] = String.fromCharCode(i$1);
        }
        for (var i$2 = 1; i$2 <= 12; i$2++) {
          keyNames[i$2 + 111] = keyNames[i$2 + 63235] = 'F' + i$2;
        }
        var keyMap = {};
        function normalizeKeyName(name) {
          var alt,
            ctrl,
            shift,
            cmd,
            parts = name.split(/-(?!$)/);
          name = parts[parts.length - 1];
          for (var modifierIndex = 0; modifierIndex < parts.length - 1; modifierIndex++) {
            var mod = parts[modifierIndex];
            if (/^(cmd|meta|m)$/i.test(mod)) {
              cmd = true;
            } else {
              if (/^a(lt)?$/i.test(mod)) {
                alt = true;
              } else {
                if (/^(c|ctrl|control)$/i.test(mod)) {
                  ctrl = true;
                } else {
                  if (!/^s(hift)?$/i.test(mod)) {
                    throw new Error('Unrecognized modifier name: ' + mod);
                  }
                  shift = true;
                }
              }
            }
          }
          if (alt) {
            name = 'Alt-' + name;
          }
          if (ctrl) {
            name = 'Ctrl-' + name;
          }
          if (cmd) {
            name = 'Cmd-' + name;
          }
          if (shift) {
            name = 'Shift-' + name;
          }
          return name;
        }
        function normalizeKeyMap(keymap) {
          var copy = {};
          for (var keyname in keymap) {
            if (keymap.hasOwnProperty(keyname)) {
              var value = keymap[keyname];
              if (/^(name|fallthrough|(de|at)tach)$/.test(keyname)) {
                continue;
              }
              if ('...' == value) {
                delete keymap[keyname];
                continue;
              }
              for (
                var keys = map(keyname.split(' '), normalizeKeyName), partIndex = 0;
                partIndex < keys.length;
                partIndex++
              ) {
                var val = void 0,
                  name = void 0;
                if (partIndex == keys.length - 1) {
                  name = keys.join(' ');
                  val = value;
                } else {
                  name = keys.slice(0, partIndex + 1).join(' ');
                  val = '...';
                }
                var prev = copy[name];
                if (prev) {
                  if (prev != val) {
                    throw new Error('Inconsistent bindings for ' + name);
                  }
                } else {
                  copy[name] = val;
                }
              }
              delete keymap[keyname];
            }
          }
          for (var prop in copy) {
            keymap[prop] = copy[prop];
          }
          return keymap;
        }
        function lookupKey(key, map$$1, handle, context) {
          var found = (map$$1 = getKeyMap(map$$1)).call ? map$$1.call(key, context) : map$$1[key];
          if (false === found) {
            return 'nothing';
          }
          if ('...' === found) {
            return 'multi';
          }
          if (null != found && handle(found)) {
            return 'handled';
          }
          if (map$$1.fallthrough) {
            if ('[object Array]' != Object.prototype.toString.call(map$$1.fallthrough)) {
              return lookupKey(key, map$$1.fallthrough, handle, context);
            }
            for (var keyMapIndex = 0; keyMapIndex < map$$1.fallthrough.length; keyMapIndex++) {
              var result = lookupKey(key, map$$1.fallthrough[keyMapIndex], handle, context);
              if (result) {
                return result;
              }
            }
          }
        }
        function isModifierKey(value) {
          var name = 'string' == typeof value ? value : keyNames[value.keyCode];
          return 'Ctrl' == name || 'Alt' == name || 'Shift' == name || 'Mod' == name;
        }
        function keyName(event, noShift) {
          if (presto && 34 == event.keyCode && event.char) {
            return false;
          }
          var base = keyNames[event.keyCode],
            name = base;
          return (
            null != name &&
            !event.altGraphKey &&
            (event.altKey && 'Alt' != base && (name = 'Alt-' + name),
            (flipCtrlCmd ? event.metaKey : event.ctrlKey) &&
              'Ctrl' != base &&
              (name = 'Ctrl-' + name),
            (flipCtrlCmd ? event.ctrlKey : event.metaKey) &&
              'Cmd' != base &&
              (name = 'Cmd-' + name),
            !noShift && event.shiftKey && 'Shift' != base && (name = 'Shift-' + name),
            name)
          );
        }
        function getKeyMap(val) {
          if ('string' == typeof val) {
            return keyMap[val];
          } else {
            return val;
          }
        }
        function deleteNearSelection(editor, compute) {
          for (
            var ranges = editor.doc.sel.ranges, kill = [], rangeIndex = 0;
            rangeIndex < ranges.length;
            rangeIndex++
          ) {
            for (
              var toKill = compute(ranges[rangeIndex]);
              kill.length && cmp(toKill.from, lst(kill).to) <= 0;
            ) {
              var replaced = kill.pop();
              if (cmp(replaced.from, toKill.from) < 0) {
                toKill.from = replaced.from;
                break;
              }
            }
            kill.push(toKill);
          }
          runInOp(editor, function () {
            for (var rangeIndex = kill.length - 1; rangeIndex >= 0; rangeIndex--) {
              replaceRange(editor.doc, '', kill[rangeIndex].from, kill[rangeIndex].to, '+delete');
            }
            ensureCursorVisible(editor);
          });
        }
        keyMap.basic = {
          Left: 'goCharLeft',
          Right: 'goCharRight',
          Up: 'goLineUp',
          Down: 'goLineDown',
          End: 'goLineEnd',
          Home: 'goLineStartSmart',
          PageUp: 'goPageUp',
          PageDown: 'goPageDown',
          Delete: 'delCharAfter',
          Backspace: 'delCharBefore',
          'Shift-Backspace': 'delCharBefore',
          Tab: 'defaultTab',
          'Shift-Tab': 'indentAuto',
          Enter: 'newlineAndIndent',
          Insert: 'toggleOverwrite',
          Esc: 'singleSelection',
        };
        keyMap.pcDefault = {
          'Ctrl-A': 'selectAll',
          'Ctrl-Up': 'goDocStart',
          'Ctrl-Down': 'goDocEnd',
          'Ctrl-Left': 'goGroupLeft',
          'Ctrl-Right': 'goGroupRight',
          'Alt-Left': 'goLineStart',
          'Alt-Right': 'goLineEnd',
          'Ctrl-Backspace': 'delGroupBefore',
          'Ctrl-Delete': 'delGroupAfter',
          'Ctrl-[': 'indentLess',
          'Ctrl-]': 'indentMore',
          'Ctrl-U': 'undoSelection',
          'Shift-Ctrl-U': 'redoSelection',
          'Alt-U': 'redoSelection',
          fallthrough: 'basic',
        };
        keyMap.emacsy = {
          'Ctrl-F': 'goCharRight',
          'Ctrl-B': 'goCharLeft',
          'Ctrl-P': 'goLineUp',
          'Ctrl-N': 'goLineDown',
          'Alt-F': 'goWordRight',
          'Alt-B': 'goWordLeft',
          'Ctrl-A': 'goLineStart',
          'Ctrl-E': 'goLineEnd',
          'Ctrl-V': 'goPageDown',
          'Shift-Ctrl-V': 'goPageUp',
          'Ctrl-D': 'delCharAfter',
          'Ctrl-H': 'delCharBefore',
          'Alt-D': 'delWordAfter',
          'Alt-Backspace': 'delWordBefore',
          'Ctrl-K': 'killLine',
          'Ctrl-T': 'transposeChars',
          'Ctrl-O': 'openLine',
        };
        keyMap.macDefault = {
          'Cmd-A': 'selectAll',
          'Cmd-Up': 'goDocStart',
          'Cmd-Down': 'goDocEnd',
          'Alt-Left': 'goGroupLeft',
          'Alt-Right': 'goGroupRight',
          'Cmd-Left': 'goLineLeft',
          'Cmd-Right': 'goLineRight',
          'Alt-Backspace': 'delGroupBefore',
          'Ctrl-Alt-Backspace': 'delGroupAfter',
          'Alt-Delete': 'delGroupAfter',
          'Cmd-[': 'indentLess',
          'Cmd-]': 'indentMore',
          'Cmd-Backspace': 'delWrappedLineLeft',
          'Cmd-Delete': 'delWrappedLineRight',
          'Cmd-U': 'undoSelection',
          'Shift-Cmd-U': 'redoSelection',
          'Ctrl-Up': 'goDocStart',
          'Ctrl-Down': 'goDocEnd',
          fallthrough: ['basic', 'emacsy'],
        };
        keyMap.default = mac ? keyMap.macDefault : keyMap.pcDefault;
        var commands = {
          selectAll: selectAll,
          singleSelection: function (editor) {
            return editor.setSelection(
              editor.getCursor('anchor'),
              editor.getCursor('head'),
              sel_dontScroll,
            );
          },
          killLine: function (editor) {
            return deleteNearSelection(editor, function (range) {
              if (range.empty()) {
                var len = getLine(editor.doc, range.head.line).text.length;
                if (range.head.ch == len && range.head.line < editor.lastLine()) {
                  return { from: range.head, to: Pos(range.head.line + 1, 0) };
                } else {
                  return { from: range.head, to: Pos(range.head.line, len) };
                }
              }
              return { from: range.from(), to: range.to() };
            });
          },
          deleteLine: function (editor) {
            return deleteNearSelection(editor, function (range) {
              return {
                from: Pos(range.from().line, 0),
                to: clipPos(editor.doc, Pos(range.to().line + 1, 0)),
              };
            });
          },
          delLineLeft: function (editor) {
            return deleteNearSelection(editor, function (range) {
              return { from: Pos(range.from().line, 0), to: range.from() };
            });
          },
          delWrappedLineLeft: function (editor) {
            return deleteNearSelection(editor, function (range) {
              var top = editor.charCoords(range.from(), 'div').top + 5;
              return { from: editor.coordsChar({ left: 0, top: top }, 'div'), to: range.to() };
            });
          },
          delWrappedLineRight: function (editor) {
            return deleteNearSelection(editor, function (range) {
              var top = editor.charCoords(range.to(), 'div').top + 5,
                rightPos = editor.coordsChar(
                  { left: editor.display.lineDiv.offsetWidth + 100, top: top },
                  'div',
                );
              return { from: range.from(), to: rightPos };
            });
          },
          undo: function (editor) {
            return editor.undo();
          },
          redo: function (editor) {
            return editor.redo();
          },
          undoSelection: function (editor) {
            return editor.undoSelection();
          },
          redoSelection: function (editor) {
            return editor.redoSelection();
          },
          goDocStart: function (editor) {
            return editor.extendSelection(Pos(editor.firstLine(), 0));
          },
          goDocEnd: function (editor) {
            return editor.extendSelection(Pos(editor.lastLine()));
          },
          goLineStart: function (editor) {
            return editor.extendSelectionsBy(
              function (range) {
                return lineStart(editor, range.head.line);
              },
              { origin: '+move', bias: 1 },
            );
          },
          goLineStartSmart: function (editor) {
            return editor.extendSelectionsBy(
              function (range) {
                return lineStartSmart(editor, range.head);
              },
              { origin: '+move', bias: 1 },
            );
          },
          goLineEnd: function (editor) {
            return editor.extendSelectionsBy(
              function (range) {
                return (function (editor, lineNumber) {
                  var logicalLine = getLine(editor.doc, lineNumber),
                    visualLine = (function (line) {
                      for (var merged; (merged = collapsedSpanAtEnd(line)); ) {
                        line = merged.find(1, true).line;
                      }
                      return line;
                    })(logicalLine);
                  if (visualLine != logicalLine) {
                    lineNumber = lineNo(visualLine);
                  }
                  return endOfLine(true, editor, logicalLine, lineNumber, -1);
                })(editor, range.head.line);
              },
              { origin: '+move', bias: -1 },
            );
          },
          goLineRight: function (editor) {
            return editor.extendSelectionsBy(function (range) {
              var top = editor.charCoords(range.head, 'div').top + 5;
              return editor.coordsChar(
                { left: editor.display.lineDiv.offsetWidth + 100, top: top },
                'div',
              );
            }, sel_move);
          },
          goLineLeft: function (editor) {
            return editor.extendSelectionsBy(function (range) {
              var top = editor.charCoords(range.head, 'div').top + 5;
              return editor.coordsChar({ left: 0, top: top }, 'div');
            }, sel_move);
          },
          goLineLeftSmart: function (editor) {
            return editor.extendSelectionsBy(function (range) {
              var top = editor.charCoords(range.head, 'div').top + 5,
                position = editor.coordsChar({ left: 0, top: top }, 'div');
              if (position.ch < editor.getLine(position.line).search(/\S/)) {
                return lineStartSmart(editor, range.head);
              } else {
                return position;
              }
            }, sel_move);
          },
          goLineUp: function (editor) {
            return editor.moveV(-1, 'line');
          },
          goLineDown: function (editor) {
            return editor.moveV(1, 'line');
          },
          goPageUp: function (editor) {
            return editor.moveV(-1, 'page');
          },
          goPageDown: function (editor) {
            return editor.moveV(1, 'page');
          },
          goCharLeft: function (editor) {
            return editor.moveH(-1, 'char');
          },
          goCharRight: function (editor) {
            return editor.moveH(1, 'char');
          },
          goColumnLeft: function (editor) {
            return editor.moveH(-1, 'column');
          },
          goColumnRight: function (editor) {
            return editor.moveH(1, 'column');
          },
          goWordLeft: function (editor) {
            return editor.moveH(-1, 'word');
          },
          goGroupRight: function (editor) {
            return editor.moveH(1, 'group');
          },
          goGroupLeft: function (editor) {
            return editor.moveH(-1, 'group');
          },
          goWordRight: function (editor) {
            return editor.moveH(1, 'word');
          },
          delCharBefore: function (editor) {
            return editor.deleteH(-1, 'char');
          },
          delCharAfter: function (editor) {
            return editor.deleteH(1, 'char');
          },
          delWordBefore: function (editor) {
            return editor.deleteH(-1, 'word');
          },
          delWordAfter: function (editor) {
            return editor.deleteH(1, 'word');
          },
          delGroupBefore: function (editor) {
            return editor.deleteH(-1, 'group');
          },
          delGroupAfter: function (editor) {
            return editor.deleteH(1, 'group');
          },
          indentAuto: function (editor) {
            return editor.indentSelection('smart');
          },
          indentMore: function (editor) {
            return editor.indentSelection('add');
          },
          indentLess: function (editor) {
            return editor.indentSelection('subtract');
          },
          insertTab: function (editor) {
            return editor.replaceSelection('\t');
          },
          insertSoftTab: function (editor) {
            for (
              var spaces = [],
                ranges = editor.listSelections(),
                tabSize = editor.options.tabSize,
                rangeIndex = 0;
              rangeIndex < ranges.length;
              rangeIndex++
            ) {
              var position = ranges[rangeIndex].from(),
                col = countColumn(editor.getLine(position.line), position.ch, tabSize);
              spaces.push(spaceStr(tabSize - (col % tabSize)));
            }
            editor.replaceSelections(spaces);
          },
          defaultTab: function (editor) {
            if (editor.somethingSelected()) {
              editor.indentSelection('add');
            } else {
              editor.execCommand('insertTab');
            }
          },
          transposeChars: function (editor) {
            return runInOp(editor, function () {
              for (
                var ranges = editor.listSelections(), newSel = [], rangeIndex = 0;
                rangeIndex < ranges.length;
                rangeIndex++
              ) {
                if (ranges[rangeIndex].empty()) {
                  var cur = ranges[rangeIndex].head,
                    line = getLine(editor.doc, cur.line).text;
                  if (line) {
                    if (cur.ch == line.length) {
                      cur = new Pos(cur.line, cur.ch - 1);
                    }
                    if (cur.ch > 0) {
                      cur = new Pos(cur.line, cur.ch + 1);
                      editor.replaceRange(
                        line.charAt(cur.ch - 1) + line.charAt(cur.ch - 2),
                        Pos(cur.line, cur.ch - 2),
                        cur,
                        '+transpose',
                      );
                    } else {
                      if (cur.line > editor.doc.first) {
                        var prev = getLine(editor.doc, cur.line - 1).text;
                        if (prev) {
                          cur = new Pos(cur.line, 1);
                          editor.replaceRange(
                            line.charAt(0) +
                              editor.doc.lineSeparator() +
                              prev.charAt(prev.length - 1),
                            Pos(cur.line - 1, prev.length - 1),
                            cur,
                            '+transpose',
                          );
                        }
                      }
                    }
                  }
                  newSel.push(new Range(cur, cur));
                }
              }
              editor.setSelections(newSel);
            });
          },
          newlineAndIndent: function (editor) {
            return runInOp(editor, function () {
              for (
                var sels = editor.listSelections(), rangeIndex = sels.length - 1;
                rangeIndex >= 0;
                rangeIndex--
              ) {
                editor.replaceRange(
                  editor.doc.lineSeparator(),
                  sels[rangeIndex].anchor,
                  sels[rangeIndex].head,
                  '+input',
                );
              }
              sels = editor.listSelections();
              for (var i$1 = 0; i$1 < sels.length; i$1++) {
                editor.indentLine(sels[i$1].from().line, null, true);
              }
              ensureCursorVisible(editor);
            });
          },
          openLine: function (editor) {
            return editor.replaceSelection('\n', 'start');
          },
          toggleOverwrite: function (editor) {
            return editor.toggleOverwrite();
          },
        };
        function lineStart(editor, lineN) {
          var line = getLine(editor.doc, lineN),
            visual = visualLine(line);
          if (visual != line) {
            lineN = lineNo(visual);
          }
          return endOfLine(true, editor, visual, lineN, 1);
        }
        function lineStartSmart(editor, position) {
          var start = lineStart(editor, position.line),
            line = getLine(editor.doc, start.line),
            order = getOrder(line, editor.doc.direction);
          if (!order || 0 == order[0].level) {
            var firstNonWS = Math.max(0, line.text.search(/\S/)),
              inWS = position.line == start.line && position.ch <= firstNonWS && position.ch;
            return Pos(start.line, inWS ? 0 : firstNonWS, start.sticky);
          }
          return start;
        }
        function doHandleBinding(editor, bound, dropShift) {
          if ('string' == typeof bound && !(bound = commands[bound])) {
            return false;
          }
          editor.display.input.ensurePolled();
          var prevShift = editor.display.shift,
            done = false;
          try {
            if (editor.isReadOnly()) {
              editor.state.suppressEdits = true;
            }
            if (dropShift) {
              editor.display.shift = false;
            }
            done = bound(editor) != Pass;
          } finally {
            editor.display.shift = prevShift;
            editor.state.suppressEdits = false;
          }
          return done;
        }
        var stopSeq = new Delayed();
        function dispatchKey(editor, name, event, handle) {
          var seq = editor.state.keySeq;
          if (seq) {
            if (isModifierKey(name)) {
              return 'handled';
            }
            stopSeq.set(50, function () {
              if (editor.state.keySeq == seq) {
                editor.state.keySeq = null;
                editor.display.input.reset();
              }
            });
            name = seq + ' ' + name;
          }
          var result = (function (editor, name, handle) {
            for (var keyMapIndex = 0; keyMapIndex < editor.state.keyMaps.length; keyMapIndex++) {
              var result = lookupKey(name, editor.state.keyMaps[keyMapIndex], handle, editor);
              if (result) {
                return result;
              }
            }
            return (
              (editor.options.extraKeys &&
                lookupKey(name, editor.options.extraKeys, handle, editor)) ||
              lookupKey(name, editor.options.keyMap, handle, editor)
            );
          })(editor, name, handle);
          if ('multi' == result) {
            editor.state.keySeq = name;
          }
          if ('handled' == result) {
            signalLater(editor, 'keyHandled', editor, name, event);
          }
          if (!('handled' != result && 'multi' != result)) {
            e_preventDefault(event);
            restartBlink(editor);
          }
          if (seq && !result && /\'$/.test(name)) {
            e_preventDefault(event);
            return true;
          } else {
            return !!result;
          }
        }
        function handleKeyBinding(editor, event) {
          var name = keyName(event, true);
          return (
            !!name &&
            (event.shiftKey && !editor.state.keySeq
              ? dispatchKey(editor, 'Shift-' + name, event, function (command) {
                  return doHandleBinding(editor, command, true);
                }) ||
                dispatchKey(editor, name, event, function (command) {
                  if ('string' == typeof command ? /^go[A-Z]/.test(command) : command.motion) {
                    return doHandleBinding(editor, command);
                  }
                })
              : dispatchKey(editor, name, event, function (command) {
                  return doHandleBinding(editor, command);
                }))
          );
        }
        var lastClick,
          lastDoubleClick,
          lastStoppedKey = null;
        function onKeyDown(event) {
          var editor = this;
          editor.curOp.focus = activeElt();
          if (37 == event.keyCode) {
            event.shiftKey;
          }
          if (!signalDOMEvent(editor, event)) {
            if (isInternetExplorer && ie_version < 11 && 27 == event.keyCode) {
              event.returnValue = false;
            }
            var code = event.keyCode;
            editor.display.shift = 16 == code || event.shiftKey;
            var handled = handleKeyBinding(editor, event);
            if (presto) {
              lastStoppedKey = handled ? code : null;
              if (
                !handled &&
                88 == code &&
                !hasCopyEvent &&
                (mac ? event.metaKey : event.ctrlKey)
              ) {
                editor.replaceSelection('', null, 'cut');
              }
            }
            if (
              !(18 != code || /\bCodeMirror-crosshair\b/.test(editor.display.lineDiv.className))
            ) {
              (function (editor) {
                Object.defineProperty(clearCrosshair, 'name', { value: 'n', configurable: true });

                var lineDiv = editor.display.lineDiv;
                function clearCrosshair(event) {
                  if (!(18 != event.keyCode && event.altKey)) {
                    rmClass(lineDiv, 'CodeMirror-crosshair');
                    off(document, 'keyup', clearCrosshair);
                    off(document, 'mouseover', clearCrosshair);
                  }
                }
                addClass(lineDiv, 'CodeMirror-crosshair');
                addEventHandler(document, 'keyup', clearCrosshair);
                addEventHandler(document, 'mouseover', clearCrosshair);
              })(editor);
            }
          }
        }
        function onKeyUp(event) {
          if (16 == event.keyCode) {
            this.doc.sel.shift = false;
          }
          signalDOMEvent(this, event);
        }
        function onKeyPress(event) {
          var editor = this;
          if (
            !(
              eventInWidget(editor.display, event) ||
              signalDOMEvent(editor, event) ||
              (event.ctrlKey && !event.altKey) ||
              (mac && event.metaKey)
            )
          ) {
            var keyCode = event.keyCode,
              charCode = event.charCode;
            if (presto && keyCode == lastStoppedKey) {
              lastStoppedKey = null;
              return void e_preventDefault(event);
            }
            if (
              !presto ||
              (event.which && !(event.which < 10)) ||
              !handleKeyBinding(editor, event)
            ) {
              var character = String.fromCharCode(null == charCode ? keyCode : charCode);
              if ('\b' != character) {
                if (
                  !(function (editor, event, character) {
                    return dispatchKey(editor, "'" + character + "'", event, function (command) {
                      return doHandleBinding(editor, command, true);
                    });
                  })(editor, event, character)
                ) {
                  editor.display.input.onKeyPress(event);
                }
              }
            }
          }
        }
        function onMouseDown(event) {
          var editor = this,
            display = editor.display;
          if (
            !(
              signalDOMEvent(editor, event) ||
              (display.activeTouch && display.input.supportsTouch())
            )
          ) {
            display.input.ensurePolled();
            display.shift = event.shiftKey;
            if (eventInWidget(display, event, 0 == editor.options.lineWrapping)) {
              if (!webkit) {
                display.scroller.draggable = false;
                setTimeout(function () {
                  return (display.scroller.draggable = true);
                }, 100);
              }
            } else {
              if (!clickInGutter(editor, event)) {
                var start = posFromMouse(editor, event);
                switch ((window.focus(), e_button(event))) {
                  case 1:
                    if (editor.state.selectingText) {
                      editor.state.selectingText(event);
                    } else {
                      if (start) {
                        (function (editor, event, start) {
                          if (isInternetExplorer) {
                            setTimeout(bind(ensureFocus, editor), 0);
                          } else {
                            editor.curOp.focus = activeElt();
                          }
                          var type,
                            now = +new Date();
                          if (
                            lastDoubleClick &&
                            lastDoubleClick.time > now - 400 &&
                            0 == cmp(lastDoubleClick.pos, start)
                          ) {
                            type = 'triple';
                          } else {
                            if (
                              lastClick &&
                              lastClick.time > now - 400 &&
                              0 == cmp(lastClick.pos, start)
                            ) {
                              type = 'double';
                              lastDoubleClick = { time: now, pos: start };
                            } else {
                              type = 'single';
                              lastClick = { time: now, pos: start };
                            }
                          }
                          var contained,
                            selection = editor.doc.sel,
                            modifier = mac ? event.metaKey : event.ctrlKey;
                          if (
                            editor.options.dragDrop &&
                            dragAndDrop &&
                            !editor.isReadOnly() &&
                            'single' == type &&
                            (contained = selection.contains(start)) > -1 &&
                            (cmp((contained = selection.ranges[contained]).from(), start) < 0 ||
                              start.xRel > 0) &&
                            (cmp(contained.to(), start) > 0 || start.xRel < 0)
                          ) {
                            (function (editor, dragStartEvent, start, modifier) {
                              var display = editor.display,
                                moved = false,
                                dragEnd = operation(editor, function (event) {
                                  if (webkit) {
                                    display.scroller.draggable = false;
                                  }
                                  editor.state.draggingText = false;
                                  off(document, 'mouseup', dragEnd);
                                  off(document, 'mousemove', mouseMove);
                                  off(display.scroller, 'dragstart', markDragging);
                                  off(display.scroller, 'drop', dragEnd);
                                  if (!moved) {
                                    e_preventDefault(event);
                                    if (!modifier) {
                                      extendSelection(editor.doc, start);
                                    }
                                    if (webkit || (isInternetExplorer && 9 == ie_version)) {
                                      setTimeout(function () {
                                        document.body.focus();
                                        display.input.focus();
                                      }, 20);
                                    } else {
                                      display.input.focus();
                                    }
                                  }
                                }),
                                mouseMove = Object.defineProperty(
                                  function (moveEvent) {
                                    moved =
                                      moved ||
                                      Math.abs(dragStartEvent.clientX - moveEvent.clientX) +
                                        Math.abs(dragStartEvent.clientY - moveEvent.clientY) >=
                                        10;
                                  },
                                  'name',
                                  { value: 'd', configurable: true },
                                ),
                                markDragging = Object.defineProperty(
                                  function () {
                                    return (moved = true);
                                  },
                                  'name',
                                  { value: 'u', configurable: true },
                                );
                              if (webkit) {
                                display.scroller.draggable = true;
                              }
                              editor.state.draggingText = dragEnd;
                              dragEnd.copy = mac ? dragStartEvent.altKey : dragStartEvent.ctrlKey;
                              if (display.scroller.dragDrop) {
                                display.scroller.dragDrop();
                              }
                              addEventHandler(document, 'mouseup', dragEnd);
                              addEventHandler(document, 'mousemove', mouseMove);
                              addEventHandler(display.scroller, 'dragstart', markDragging);
                              addEventHandler(display.scroller, 'drop', dragEnd);
                              delayBlurEvent(editor);
                              setTimeout(function () {
                                return display.input.focus();
                              }, 20);
                            })(editor, event, start, modifier);
                          } else {
                            (function (editor, event, start, type, addNew) {
                              Object.defineProperty(extend, 'name', {
                                value: 'g',
                                configurable: true,
                              });
                              Object.defineProperty(done, 'name', {
                                value: 'v',
                                configurable: true,
                              });

                              var display = editor.display,
                                documentModel = editor.doc;
                              e_preventDefault(event);
                              var ourRange,
                                ourIndex,
                                startSel = documentModel.sel,
                                ranges = startSel.ranges;
                              if (addNew && !event.shiftKey) {
                                ourIndex = documentModel.sel.contains(start);
                                ourRange =
                                  ourIndex > -1 ? ranges[ourIndex] : new Range(start, start);
                              } else {
                                ourRange = documentModel.sel.primary();
                                ourIndex = documentModel.sel.primIndex;
                              }
                              if (chromeOS ? event.shiftKey && event.metaKey : event.altKey) {
                                type = 'rect';
                                if (!addNew) {
                                  ourRange = new Range(start, start);
                                }
                                start = posFromMouse(editor, event, true, true);
                                ourIndex = -1;
                              } else {
                                if ('double' == type) {
                                  var word = editor.findWordAt(start);
                                  ourRange =
                                    editor.display.shift || documentModel.extend
                                      ? extendRange(documentModel, ourRange, word.anchor, word.head)
                                      : word;
                                } else {
                                  if ('triple' == type) {
                                    var line = new Range(
                                      Pos(start.line, 0),
                                      clipPos(documentModel, Pos(start.line + 1, 0)),
                                    );
                                    ourRange =
                                      editor.display.shift || documentModel.extend
                                        ? extendRange(
                                            documentModel,
                                            ourRange,
                                            line.anchor,
                                            line.head,
                                          )
                                        : line;
                                  } else {
                                    ourRange = extendRange(documentModel, ourRange, start);
                                  }
                                }
                              }
                              if (addNew) {
                                if (-1 == ourIndex) {
                                  ourIndex = ranges.length;
                                  setSelection(
                                    documentModel,
                                    normalizeSelection(ranges.concat([ourRange]), ourIndex),
                                    { scroll: false, origin: '*mouse' },
                                  );
                                } else {
                                  if (
                                    ranges.length > 1 &&
                                    ranges[ourIndex].empty() &&
                                    'single' == type &&
                                    !event.shiftKey
                                  ) {
                                    setSelection(
                                      documentModel,
                                      normalizeSelection(
                                        ranges
                                          .slice(0, ourIndex)
                                          .concat(ranges.slice(ourIndex + 1)),
                                        0,
                                      ),
                                      {
                                        scroll: false,
                                        origin: '*mouse',
                                      },
                                    );
                                    startSel = documentModel.sel;
                                  } else {
                                    replaceOneSelection(
                                      documentModel,
                                      ourIndex,
                                      ourRange,
                                      sel_mouse,
                                    );
                                  }
                                }
                              } else {
                                ourIndex = 0;
                                setSelection(
                                  documentModel,
                                  new Selection([ourRange], 0),
                                  sel_mouse,
                                );
                                startSel = documentModel.sel;
                              }
                              var lastPos = start;
                              var editorSize = display.wrapper.getBoundingClientRect(),
                                counter = 0;
                              function extend(event) {
                                var curCount = ++counter,
                                  cur = posFromMouse(editor, event, true, 'rect' == type);
                                if (cur) {
                                  if (0 != cmp(cur, lastPos)) {
                                    editor.curOp.focus = activeElt();
                                    (function (position) {
                                      if (0 == cmp(lastPos, position)) {
                                        return;
                                      }
                                      lastPos = position;
                                      if ('rect' == type) {
                                        for (
                                          var ranges = [],
                                            tabSize = editor.options.tabSize,
                                            anchorColumn = countColumn(
                                              getLine(documentModel, start.line).text,
                                              start.ch,
                                              tabSize,
                                            ),
                                            headColumn = countColumn(
                                              getLine(documentModel, position.line).text,
                                              position.ch,
                                              tabSize,
                                            ),
                                            startColumn = Math.min(anchorColumn, headColumn),
                                            endColumn = Math.max(anchorColumn, headColumn),
                                            lineNumber = Math.min(start.line, position.line),
                                            lastLine = Math.min(
                                              editor.lastLine(),
                                              Math.max(start.line, position.line),
                                            );
                                          lineNumber <= lastLine;
                                          lineNumber++
                                        ) {
                                          var lineText = getLine(documentModel, lineNumber).text,
                                            startCharacter = findColumn(
                                              lineText,
                                              startColumn,
                                              tabSize,
                                            );
                                          if (startColumn == endColumn) {
                                            ranges.push(
                                              new Range(
                                                Pos(lineNumber, startCharacter),
                                                Pos(lineNumber, startCharacter),
                                              ),
                                            );
                                          } else {
                                            if (lineText.length > startCharacter) {
                                              ranges.push(
                                                new Range(
                                                  Pos(lineNumber, startCharacter),
                                                  Pos(
                                                    lineNumber,
                                                    findColumn(lineText, endColumn, tabSize),
                                                  ),
                                                ),
                                              );
                                            }
                                          }
                                        }
                                        if (!ranges.length) {
                                          ranges.push(new Range(start, start));
                                        }
                                        setSelection(
                                          documentModel,
                                          normalizeSelection(
                                            startSel.ranges.slice(0, ourIndex).concat(ranges),
                                            ourIndex,
                                          ),
                                          {
                                            origin: '*mouse',
                                            scroll: false,
                                          },
                                        );
                                        editor.scrollIntoView(position);
                                      } else {
                                        var clickedRange,
                                          originalRange = ourRange,
                                          anchor = originalRange.anchor,
                                          head = position;
                                        if ('single' != type) {
                                          if (
                                            cmp(
                                              (clickedRange =
                                                'double' == type
                                                  ? editor.findWordAt(position)
                                                  : new Range(
                                                      Pos(position.line, 0),
                                                      clipPos(
                                                        documentModel,
                                                        Pos(position.line + 1, 0),
                                                      ),
                                                    )).anchor,
                                              anchor,
                                            ) > 0
                                          ) {
                                            head = clickedRange.head;
                                            anchor = minPos(
                                              originalRange.from(),
                                              clickedRange.anchor,
                                            );
                                          } else {
                                            head = clickedRange.anchor;
                                            anchor = maxPos(originalRange.to(), clickedRange.head);
                                          }
                                        }
                                        var selectionRanges = startSel.ranges.slice(0);
                                        selectionRanges[ourIndex] = new Range(
                                          clipPos(documentModel, anchor),
                                          head,
                                        );
                                        setSelection(
                                          documentModel,
                                          normalizeSelection(selectionRanges, ourIndex),
                                          sel_mouse,
                                        );
                                      }
                                    })(cur);
                                    var visible = visibleLines(display, documentModel);
                                    if (cur.line >= visible.to || cur.line < visible.from) {
                                      setTimeout(
                                        operation(editor, function () {
                                          if (counter == curCount) {
                                            extend(event);
                                          }
                                        }),
                                        150,
                                      );
                                    }
                                  } else {
                                    var outside =
                                      event.clientY < editorSize.top
                                        ? -20
                                        : event.clientY > editorSize.bottom
                                          ? 20
                                          : 0;
                                    if (outside) {
                                      setTimeout(
                                        operation(editor, function () {
                                          if (counter == curCount) {
                                            display.scroller.scrollTop += outside;
                                            extend(event);
                                          }
                                        }),
                                        50,
                                      );
                                    }
                                  }
                                }
                              }
                              function done(event) {
                                editor.state.selectingText = false;
                                counter = 1 / 0;
                                e_preventDefault(event);
                                display.input.focus();
                                off(document, 'mousemove', move);
                                off(document, 'mouseup', finishSelection);
                                if (documentModel.history) {
                                  documentModel.history.lastSelOrigin = null;
                                } else {
                                  documentModel.history = new History(null);
                                  documentModel.history.lastSelOrigin = null;
                                }
                              }
                              var move = operation(editor, function (event) {
                                  if (e_button(event)) {
                                    extend(event);
                                  } else {
                                    done(event);
                                  }
                                }),
                                finishSelection = operation(editor, done);
                              editor.state.selectingText = finishSelection;
                              addEventHandler(document, 'mousemove', move);
                              addEventHandler(document, 'mouseup', finishSelection);
                            })(editor, event, start, type, modifier);
                          }
                        })(editor, event, start);
                      } else {
                        if (e_target(event) == display.scroller) {
                          e_preventDefault(event);
                        }
                      }
                    }
                    break;
                  case 2:
                    if (webkit) {
                      editor.state.lastMiddleDown = +new Date();
                    }
                    if (start) {
                      extendSelection(editor.doc, start);
                    }
                    setTimeout(function () {
                      return display.input.focus();
                    }, 20);
                    e_preventDefault(event);
                    break;
                  case 3:
                    if (captureRightClick) {
                      onContextMenu(editor, event);
                    } else {
                      delayBlurEvent(editor);
                    }
                }
              }
            }
          }
        }
        function gutterEvent(editor, event, type, prevent) {
          var clientX, clientY;
          try {
            clientX = event.clientX;
            clientY = event.clientY;
          } catch (coordinateError) {
            return false;
          }
          if (clientX >= Math.floor(editor.display.gutters.getBoundingClientRect().right)) {
            return false;
          }
          if (prevent) {
            e_preventDefault(event);
          }
          var display = editor.display,
            lineBox = display.lineDiv.getBoundingClientRect();
          if (clientY > lineBox.bottom || !hasHandler(editor, type)) {
            return e_defaultPrevented(event);
          }
          clientY -= lineBox.top - display.viewOffset;
          for (var gutterIndex = 0; gutterIndex < editor.options.gutters.length; ++gutterIndex) {
            var gutter = display.gutters.childNodes[gutterIndex];
            if (gutter && gutter.getBoundingClientRect().right >= clientX) {
              signal(
                editor,
                type,
                editor,
                lineAtHeight(editor.doc, clientY),
                editor.options.gutters[gutterIndex],
                event,
              );
              return e_defaultPrevented(event);
            }
          }
        }
        function clickInGutter(editor, event) {
          return gutterEvent(editor, event, 'gutterClick', true);
        }
        function onContextMenu(editor, event) {
          if (
            !(
              eventInWidget(editor.display, event) ||
              (function (editor, event) {
                if (!hasHandler(editor, 'gutterContextMenu')) {
                  return false;
                }
                return gutterEvent(editor, event, 'gutterContextMenu', false);
              })(editor, event) ||
              signalDOMEvent(editor, event, 'contextmenu')
            )
          ) {
            editor.display.input.onContextMenu(event);
          }
        }
        function themeChanged(editor) {
          editor.display.wrapper.className =
            editor.display.wrapper.className.replace(/\s*cm-s-\S+/g, '') +
            editor.options.theme.replace(/(^|\s)\s*/g, ' cm-s-');
          clearCaches(editor);
        }
        var Init = {
            toString: function () {
              return 'CodeMirror.Init';
            },
          },
          defaults = {},
          optionHandlers = {};
        function updateGutterGeometry(editor) {
          updateGutters(editor);
          regChange(editor);
          alignHorizontally(editor);
        }
        function dragDropChanged(editor, value, old) {
          if (!value != !(old && old != Init)) {
            var funcs = editor.display.dragFunctions,
              toggle = value ? addEventHandler : off;
            toggle(editor.display.scroller, 'dragstart', funcs.start);
            toggle(editor.display.scroller, 'dragenter', funcs.enter);
            toggle(editor.display.scroller, 'dragover', funcs.over);
            toggle(editor.display.scroller, 'dragleave', funcs.leave);
            toggle(editor.display.scroller, 'drop', funcs.drop);
          }
        }
        function wrappingChanged(editor) {
          if (editor.options.lineWrapping) {
            addClass(editor.display.wrapper, 'CodeMirror-wrap');
            editor.display.sizer.style.minWidth = '';
            editor.display.sizerWidth = null;
          } else {
            rmClass(editor.display.wrapper, 'CodeMirror-wrap');
            findMaxLine(editor);
          }
          estimateLineHeights(editor);
          regChange(editor);
          clearCaches(editor);
          setTimeout(function () {
            return updateScrollbars(editor);
          }, 100);
        }
        function CodeMirror(place, options, hostEditor, nodeId) {
          var this$1 = this;
          if (!(this instanceof CodeMirror)) {
            return new CodeMirror(place, options, hostEditor, nodeId);
          }
          this.options = options = options ? copyObj(options) : {};
          copyObj(defaults, options, false);
          setGuttersForLineNumbers(options);
          var editorDocument = options.value;
          if ('string' == typeof editorDocument) {
            editorDocument = new Doc(
              editorDocument,
              options.mode,
              null,
              options.lineSeparator,
              options.direction,
            );
          }
          this.doc = editorDocument;
          var input = new CodeMirror.inputStyles[options.inputStyle](this),
            display = (this.display = new (function (place, documentModel, input) {
              var display = this;
              this.input = input;
              display.scrollbarFiller = createElement('div', null, 'CodeMirror-scrollbar-filler');
              display.scrollbarFiller.setAttribute('cm-not-content', 'true');
              display.gutterFiller = createElement('div', null, 'CodeMirror-gutter-filler');
              display.gutterFiller.setAttribute('cm-not-content', 'true');
              display.lineDiv = eltP('div', null, 'CodeMirror-code');
              display.selectionDiv = createElement(
                'div',
                null,
                null,
                'position: relative; z-index: 1',
              );
              display.cursorDiv = createElement('div', null, 'CodeMirror-cursors');
              display.measure = createElement('div', null, 'CodeMirror-measure');
              display.lineMeasure = createElement('div', null, 'CodeMirror-measure');
              display.lineSpace = eltP(
                'div',
                [
                  display.measure,
                  display.lineMeasure,
                  display.selectionDiv,
                  display.cursorDiv,
                  display.lineDiv,
                ],
                null,
                'position: relative; outline: none',
              );
              var lines = eltP('div', [display.lineSpace], 'CodeMirror-lines');
              display.mover = createElement('div', [lines], null, 'position: relative');
              display.sizer = createElement('div', [display.mover], 'CodeMirror-sizer');
              display.sizerWidth = null;
              display.heightForcer = createElement(
                'div',
                null,
                null,
                'position: absolute; height: ' + scrollerGap + 'px; width: 1px;',
              );
              display.gutters = createElement('div', null, 'CodeMirror-gutters');
              display.lineGutter = null;
              display.scroller = createElement(
                'div',
                [display.sizer, display.heightForcer, display.gutters],
                'CodeMirror-scroll',
              );
              display.scroller.setAttribute('tabIndex', '-1');
              display.wrapper = createElement(
                'div',
                [display.scrollbarFiller, display.gutterFiller, display.scroller],
                'CodeMirror',
              );
              if (isInternetExplorer && ie_version < 8) {
                display.gutters.style.zIndex = -1;
                display.scroller.style.paddingRight = 0;
              }
              if (!(webkit || (gecko && mobile))) {
                display.scroller.draggable = true;
              }
              if (place) {
                if (place.appendChild) {
                  place.appendChild(display.wrapper);
                } else {
                  place(display.wrapper);
                }
              }
              display.viewFrom = display.viewTo = documentModel.first;
              display.reportedViewFrom = display.reportedViewTo = documentModel.first;
              display.view = [];
              display.renderedView = null;
              display.externalMeasured = null;
              display.viewOffset = 0;
              display.lastWrapHeight = display.lastWrapWidth = 0;
              display.updateLineNumbers = null;
              display.nativeBarWidth = display.barHeight = display.barWidth = 0;
              display.scrollbarsClipped = false;
              display.lineNumWidth = display.lineNumInnerWidth = display.lineNumChars = null;
              display.alignWidgets = false;
              display.cachedCharWidth = display.cachedTextHeight = display.cachedPaddingH = null;
              display.maxLine = null;
              display.maxLineLength = 0;
              display.maxLineChanged = false;
              display.wheelDX = display.wheelDY = display.wheelStartX = display.wheelStartY = null;
              display.shift = false;
              display.selForContextMenu = null;
              display.activeTouch = null;
              input.init(display);
            })(place, editorDocument, input));
          for (var optionName in ((display.wrapper.CodeMirror = this),
          updateGutters(this),
          themeChanged(this),
          options.lineWrapping && (this.display.wrapper.className += ' CodeMirror-wrap'),
          initScrollbars(this),
          (this.state = {
            keyMaps: [],
            overlays: [],
            modeGen: 0,
            overwrite: false,
            delayingBlurEvent: false,
            focused: false,
            suppressEdits: false,
            pasteIncoming: false,
            cutIncoming: false,
            selectingText: false,
            draggingText: false,
            highlight: new Delayed(),
            keySeq: null,
            specialChars: null,
          }),
          options.autofocus && !mobile && display.input.focus(),
          isInternetExplorer &&
            ie_version < 11 &&
            setTimeout(function () {
              return this$1.display.input.reset(true);
            }, 20),
          (function (editor) {
            Object.defineProperty(finishTouch, 'name', { value: 'r', configurable: true });
            Object.defineProperty(farAway, 'name', { value: 'o', configurable: true });

            var display = editor.display;
            addEventHandler(display.scroller, 'mousedown', operation(editor, onMouseDown));
            addEventHandler(
              display.scroller,
              'dblclick',
              isInternetExplorer && ie_version < 11
                ? operation(editor, function (event) {
                    if (!signalDOMEvent(editor, event)) {
                      var position = posFromMouse(editor, event);
                      if (
                        position &&
                        !clickInGutter(editor, event) &&
                        !eventInWidget(editor.display, event)
                      ) {
                        e_preventDefault(event);
                        var word = editor.findWordAt(position);
                        extendSelection(editor.doc, word.anchor, word.head);
                      }
                    }
                  })
                : function (event) {
                    return signalDOMEvent(editor, event) || e_preventDefault(event);
                  },
            );
            if (!captureRightClick) {
              addEventHandler(display.scroller, 'contextmenu', function (event) {
                return onContextMenu(editor, event);
              });
            }
            var touchFinished,
              prevTouch = { end: 0 };
            function finishTouch() {
              if (display.activeTouch) {
                touchFinished = setTimeout(function () {
                  return (display.activeTouch = null);
                }, 1e3);
                (prevTouch = display.activeTouch).end = +new Date();
              }
            }
            function farAway(touch, other) {
              if (null == other.left) {
                return true;
              }
              var deltaX = other.left - touch.left,
                deltaY = other.top - touch.top;
              return deltaX * deltaX + deltaY * deltaY > 400;
            }
            addEventHandler(display.scroller, 'touchstart', function (event) {
              if (
                !signalDOMEvent(editor, event) &&
                !(function (event) {
                  if (1 != event.touches.length) {
                    return false;
                  }
                  var touch = event.touches[0];
                  return touch.radiusX <= 1 && touch.radiusY <= 1;
                })(event)
              ) {
                display.input.ensurePolled();
                clearTimeout(touchFinished);
                var now = +new Date();
                display.activeTouch = {
                  start: now,
                  moved: false,
                  prev: now - prevTouch.end <= 300 ? prevTouch : null,
                };
                if (1 == event.touches.length) {
                  display.activeTouch.left = event.touches[0].pageX;
                  display.activeTouch.top = event.touches[0].pageY;
                }
              }
            });
            addEventHandler(display.scroller, 'touchmove', function () {
              if (display.activeTouch) {
                display.activeTouch.moved = true;
              }
            });
            addEventHandler(display.scroller, 'touchend', function (event) {
              var touch = display.activeTouch;
              if (
                touch &&
                !eventInWidget(display, event) &&
                null != touch.left &&
                !touch.moved &&
                new Date() - touch.start < 300
              ) {
                var range,
                  position = editor.coordsChar(display.activeTouch, 'page');
                range =
                  !touch.prev || farAway(touch, touch.prev)
                    ? new Range(position, position)
                    : !touch.prev.prev || farAway(touch, touch.prev.prev)
                      ? editor.findWordAt(position)
                      : new Range(
                          Pos(position.line, 0),
                          clipPos(editor.doc, Pos(position.line + 1, 0)),
                        );
                editor.setSelection(range.anchor, range.head);
                editor.focus();
                e_preventDefault(event);
              }
              finishTouch();
            });
            addEventHandler(display.scroller, 'touchcancel', finishTouch);
            addEventHandler(display.scroller, 'scroll', function () {
              if (display.scroller.clientHeight) {
                updateScrollTop(editor, display.scroller.scrollTop);
                setScrollLeft(editor, display.scroller.scrollLeft, true);
                signal(editor, 'scroll', editor);
              }
            });
            addEventHandler(display.scroller, 'mousewheel', function (event) {
              return onScrollWheel(editor, event);
            });
            addEventHandler(display.scroller, 'DOMMouseScroll', function (event) {
              return onScrollWheel(editor, event);
            });
            addEventHandler(display.wrapper, 'scroll', function () {
              return (display.wrapper.scrollTop = display.wrapper.scrollLeft = 0);
            });
            display.dragFunctions = {
              enter: function (event) {
                if (!signalDOMEvent(editor, event)) {
                  e_stop(event);
                }
              },
              over: function (event) {
                if (!signalDOMEvent(editor, event)) {
                  !(function (editor, event) {
                    var position = posFromMouse(editor, event);
                    if (position) {
                      var frag = document.createDocumentFragment();
                      drawSelectionCursor(editor, position, frag);
                      if (!editor.display.dragCursor) {
                        editor.display.dragCursor = createElement(
                          'div',
                          null,
                          'CodeMirror-cursors CodeMirror-dragcursors',
                        );
                        editor.display.lineSpace.insertBefore(
                          editor.display.dragCursor,
                          editor.display.cursorDiv,
                        );
                      }
                      removeChildrenAndAdd(editor.display.dragCursor, frag);
                    }
                  })(editor, event);
                  e_stop(event);
                }
              },
              start: function (event) {
                return (function (editor, event) {
                  if (
                    isInternetExplorer &&
                    (!editor.state.draggingText || +new Date() - lastDrop < 100)
                  ) {
                    e_stop(event);
                  } else {
                    if (
                      !signalDOMEvent(editor, event) &&
                      !eventInWidget(editor.display, event) &&
                      (event.dataTransfer.setData('Text', editor.getSelection()),
                      (event.dataTransfer.effectAllowed = 'copyMove'),
                      event.dataTransfer.setDragImage && !safari)
                    ) {
                      var img = createElement(
                        'img',
                        null,
                        null,
                        'position: fixed; left: 0; top: 0;',
                      );
                      img.src =
                        'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
                      if (presto) {
                        img.width = img.height = 1;
                        editor.display.wrapper.appendChild(img);
                        img._top = img.offsetTop;
                      }
                      event.dataTransfer.setDragImage(img, 0, 0);
                      if (presto) {
                        img.parentNode.removeChild(img);
                      }
                    }
                  }
                })(editor, event);
              },
              drop: operation(editor, onDrop),
              leave: function (event) {
                if (!signalDOMEvent(editor, event)) {
                  clearDragCursor(editor);
                }
              },
            };
            var inp = display.input.getField();
            addEventHandler(inp, 'keyup', function (event) {
              return onKeyUp.call(editor, event);
            });
            addEventHandler(inp, 'keydown', operation(editor, onKeyDown));
            addEventHandler(inp, 'keypress', operation(editor, onKeyPress));
            addEventHandler(inp, 'focus', function (event) {
              return onFocus(editor, event);
            });
            addEventHandler(inp, 'blur', function (event) {
              return onBlur(editor, event);
            });
          })(this),
          registerGlobalHandlers(),
          startOperation(this),
          (this.curOp.forceUpdate = true),
          attachDoc(this, editorDocument),
          (options.autofocus && !mobile) || this.hasFocus()
            ? setTimeout(bind(onFocus, this), 20)
            : onBlur(this),
          optionHandlers)) {
            if (optionHandlers.hasOwnProperty(optionName)) {
              optionHandlers[optionName](this$1, options[optionName], Init);
            }
          }
          maybeUpdateLineNumberWidth(this);
          if (options.finishInit) {
            options.finishInit(this);
          }
          for (var hookIndex = 0; hookIndex < initHooks.length; ++hookIndex) {
            initHooks[hookIndex](this$1);
          }
          endOperation(this);
          if (
            webkit &&
            options.lineWrapping &&
            'optimizelegibility' == getComputedStyle(display.lineDiv).textRendering
          ) {
            display.lineDiv.style.textRendering = 'auto';
          }
          this.editor = hostEditor;
          this.cid = nodeId;
        }
        CodeMirror.defaults = defaults;
        CodeMirror.optionHandlers = optionHandlers;
        var initHooks = [];
        function indentLine(editor, lineNumber, how, aggressive) {
          var state,
            documentModel = editor.doc;
          if (null == how) {
            how = 'add';
          }
          if ('smart' == how) {
            if (documentModel.mode.indent) {
              state = getStateBefore(editor, lineNumber);
            } else {
              how = 'prev';
            }
          }
          var tabSize = editor.options.tabSize,
            line = getLine(documentModel, lineNumber),
            curSpace = countColumn(line.text, null, tabSize);
          if (line.stateAfter) {
            line.stateAfter = null;
          }
          var indentation,
            curSpaceString = line.text.match(/^\s*/)[0];
          if (aggressive || /\S/.test(line.text)) {
            if (
              'smart' == how &&
              ((indentation = documentModel.mode.indent(
                state,
                line.text.slice(curSpaceString.length),
                line.text,
              )) == Pass ||
                indentation > 150)
            ) {
              if (!aggressive) {
                return;
              }
              how = 'prev';
            }
          } else {
            indentation = 0;
            how = 'not';
          }
          var indentString = '',
            position = 0;
          if ('prev' == how) {
            if (lineNumber > documentModel.first) {
              indentation = countColumn(
                (indentString = getLine(documentModel, lineNumber - 1).text),
                null,
                tabSize,
              );
              indentString = curSpaceString ? '' : indentString.match(/^\s*/)[0];
            } else {
              indentation = 0;
            }
          } else {
            if ('add' == how) {
              indentation = curSpace + editor.options.indentUnit;
            } else {
              if ('subtract' == how) {
                indentation = curSpace - editor.options.indentUnit;
              } else {
                if ('number' == typeof how) {
                  indentation = curSpace + how;
                }
              }
            }
          }
          indentation = Math.max(0, indentation);
          if (indentString && !curSpaceString) {
          } else {
            indentString = '';
            if (editor.options.indentWithTabs) {
              for (
                var tabsRemaining = Math.floor(indentation / tabSize);
                tabsRemaining;
                --tabsRemaining
              ) {
                position += tabSize;
                indentString += '\t';
              }
            }
            if (position < indentation) {
              indentString += spaceStr(indentation - position);
            }
          }
          if (indentString != curSpaceString) {
            replaceRange(
              documentModel,
              indentString,
              Pos(lineNumber, 0),
              Pos(lineNumber, curSpaceString.length),
              '+input',
            );
            line.stateAfter = null;
            return true;
          }
          for (var i$1 = 0; i$1 < documentModel.sel.ranges.length; i$1++) {
            var range = documentModel.sel.ranges[i$1];
            if (range.head.line == lineNumber && range.head.ch < curSpaceString.length) {
              var pos$1 = Pos(lineNumber, curSpaceString.length);
              replaceOneSelection(documentModel, i$1, new Range(pos$1, pos$1));
              break;
            }
          }
        }
        CodeMirror.defineInitHook = function (initializeEditor) {
          return initHooks.push(initializeEditor);
        };
        var lastCopied = null;
        function setLastCopied(newLastCopied) {
          lastCopied = newLastCopied;
        }
        function applyTextInput(editor, inserted, deleted, selection, origin) {
          var documentModel = editor.doc;
          editor.display.shift = false;
          if (!selection) {
            selection = documentModel.sel;
          }
          var updateInput,
            paste = editor.state.pasteIncoming || 'paste' == origin,
            textLines = splitLinesAuto(inserted),
            multiPaste = null;
          if (paste && selection.ranges.length > 1) {
            if (lastCopied && lastCopied.text.join('\n') == inserted) {
              if (selection.ranges.length % lastCopied.text.length == 0) {
                multiPaste = [];
                for (var textIndex = 0; textIndex < lastCopied.text.length; textIndex++) {
                  multiPaste.push(documentModel.splitLines(lastCopied.text[textIndex]));
                }
              }
            } else {
              if (textLines.length == selection.ranges.length) {
                multiPaste = map(textLines, function (text) {
                  return [text];
                });
              }
            }
          }
          for (var i$1 = selection.ranges.length - 1; i$1 >= 0; i$1--) {
            var range$$1 = selection.ranges[i$1],
              from = range$$1.from(),
              rangeEnd = range$$1.to();
            if (range$$1.empty()) {
              if (deleted && deleted > 0) {
                from = Pos(from.line, from.ch - deleted);
              } else {
                if (editor.state.overwrite && !paste) {
                  rangeEnd = Pos(
                    rangeEnd.line,
                    Math.min(
                      getLine(documentModel, rangeEnd.line).text.length,
                      rangeEnd.ch + lst(textLines).length,
                    ),
                  );
                } else {
                  if (lastCopied && lastCopied.lineWise && lastCopied.text.join('\n') == inserted) {
                    from = rangeEnd = Pos(from.line, 0);
                  }
                }
              }
            }
            updateInput = editor.curOp.updateInput;
            var changeEvent = {
              from: from,
              to: rangeEnd,
              text: multiPaste ? multiPaste[i$1 % multiPaste.length] : textLines,
              origin: origin || (paste ? 'paste' : editor.state.cutIncoming ? 'cut' : '+input'),
            };
            makeChange(editor.doc, changeEvent);
            signalLater(editor, 'inputRead', editor, changeEvent);
          }
          if (inserted && !paste) {
            triggerElectric(editor, inserted);
          }
          ensureCursorVisible(editor);
          editor.curOp.updateInput = updateInput;
          editor.curOp.typing = true;
          editor.state.pasteIncoming = editor.state.cutIncoming = false;
        }
        function handlePaste(event, editor) {
          var pasted = event.clipboardData && event.clipboardData.getData('Text');
          if (pasted) {
            event.preventDefault();
            if (!(editor.isReadOnly() || editor.options.disableInput)) {
              runInOp(editor, function () {
                return applyTextInput(editor, pasted, 0, null, 'paste');
              });
            }
            return true;
          }
        }
        function triggerElectric(editor, inserted) {
          if (editor.options.electricChars && editor.options.smartIndent) {
            for (
              var selection = editor.doc.sel, rangeIndex = selection.ranges.length - 1;
              rangeIndex >= 0;
              rangeIndex--
            ) {
              var range$$1 = selection.ranges[rangeIndex];
              if (
                !(
                  range$$1.head.ch > 100 ||
                  (rangeIndex && selection.ranges[rangeIndex - 1].head.line == range$$1.head.line)
                )
              ) {
                var mode = editor.getModeAt(range$$1.head),
                  indented = false;
                if (mode.electricChars) {
                  for (
                    var characterIndex = 0;
                    characterIndex < mode.electricChars.length;
                    characterIndex++
                  ) {
                    if (inserted.indexOf(mode.electricChars.charAt(characterIndex)) > -1) {
                      indented = indentLine(editor, range$$1.head.line, 'smart');
                      break;
                    }
                  }
                } else {
                  if (
                    mode.electricInput &&
                    mode.electricInput.test(
                      getLine(editor.doc, range$$1.head.line).text.slice(0, range$$1.head.ch),
                    )
                  ) {
                    indented = indentLine(editor, range$$1.head.line, 'smart');
                  }
                }
                if (indented) {
                  signalLater(editor, 'electricInput', editor, range$$1.head.line);
                }
              }
            }
          }
        }
        function copyableRanges(editor) {
          for (
            var text = [], ranges = [], rangeIndex = 0;
            rangeIndex < editor.doc.sel.ranges.length;
            rangeIndex++
          ) {
            var line = editor.doc.sel.ranges[rangeIndex].head.line,
              lineRange = { anchor: Pos(line, 0), head: Pos(line + 1, 0) };
            ranges.push(lineRange);
            text.push(editor.getRange(lineRange.anchor, lineRange.head));
          }
          return { text: text, ranges: ranges };
        }
        function disableBrowserMagic(field, spellcheck) {
          field.setAttribute('autocorrect', 'off');
          field.setAttribute('autocapitalize', 'off');
          field.setAttribute('spellcheck', !!spellcheck);
        }
        function hiddenTextarea() {
          var textarea = createElement(
              'textarea',
              null,
              null,
              'position: absolute; bottom: -1em; padding: 0; width: 1px; height: 1em; outline: none',
            ),
            div = createElement(
              'div',
              [textarea],
              null,
              'overflow: hidden; position: relative; width: 3px; height: 0px;',
            );
          if (webkit) {
            textarea.style.width = '1000px';
          } else {
            textarea.setAttribute('wrap', 'off');
          }
          if (ios) {
            textarea.style.border = '1px solid black';
          }
          disableBrowserMagic(textarea);
          return div;
        }
        function findPosH(documentModel, position, dir, unit, visually) {
          Object.defineProperty(moveOnce, 'name', { value: 'l', configurable: true });

          var oldPos = position,
            origDir = dir,
            lineObj = getLine(documentModel, position.line);
          function moveOnce(boundToLine) {
            var next, nextLine;
            if (
              null ==
              (next = visually
                ? moveVisually(documentModel.cm, lineObj, position, dir)
                : moveLogically(lineObj, position, dir))
            ) {
              if (
                boundToLine ||
                (nextLine = position.line + dir) < documentModel.first ||
                nextLine >= documentModel.first + documentModel.size ||
                ((position = new Pos(nextLine, position.ch, position.sticky)),
                !(lineObj = getLine(documentModel, nextLine)))
              ) {
                return false;
              }
              position = endOfLine(visually, documentModel.cm, lineObj, position.line, dir);
            } else {
              position = next;
            }
            return true;
          }
          if ('char' == unit) {
            moveOnce();
          } else {
            if ('column' == unit) {
              moveOnce(true);
            } else {
              if ('word' == unit || 'group' == unit) {
                for (
                  var sawType = null,
                    group = 'group' == unit,
                    helper = documentModel.cm && documentModel.cm.getHelper(position, 'wordChars'),
                    first = true;
                  !(dir < 0) || moveOnce(!first);
                  first = false
                ) {
                  var cur = lineObj.text.charAt(position.ch) || '\n',
                    type = isWordChar(cur, helper)
                      ? 'w'
                      : group && '\n' == cur
                        ? 'n'
                        : !group || /\s/.test(cur)
                          ? null
                          : 'p';
                  if (!(!group || first || type)) {
                    type = 's';
                  }
                  if (sawType && sawType != type) {
                    if (dir < 0) {
                      dir = 1;
                      moveOnce();
                      position.sticky = 'after';
                    }
                    break;
                  }
                  if (type) {
                    sawType = type;
                  }
                  if (dir > 0 && !moveOnce(!first)) {
                    break;
                  }
                }
              }
            }
          }
          var result = skipAtomic(documentModel, position, oldPos, origDir, true);
          if (equalCursorPos(oldPos, result)) {
            result.hitSide = true;
          }
          return result;
        }
        function findPosV(editor, position, dir, unit) {
          var targetY,
            target,
            documentModel = editor.doc,
            targetX = position.left;
          if ('page' == unit) {
            var pageSize = Math.min(
                editor.display.wrapper.clientHeight,
                window.innerHeight || document.documentElement.clientHeight,
              ),
              moveAmount = Math.max(pageSize - 0.5 * textHeight(editor.display), 3);
            targetY = (dir > 0 ? position.bottom : position.top) + dir * moveAmount;
          } else {
            if ('line' == unit) {
              targetY = dir > 0 ? position.bottom + 3 : position.top - 3;
            }
          }
          for (; (target = coordsChar(editor, targetX, targetY)).outside; ) {
            if (dir < 0 ? targetY <= 0 : targetY >= documentModel.height) {
              target.hitSide = true;
              break;
            }
            targetY += 5 * dir;
          }
          return target;
        }
        var ContentEditableInput = Object.defineProperty(
          function (editor) {
            this.cm = editor;
            this.lastAnchorNode =
              this.lastAnchorOffset =
              this.lastFocusNode =
              this.lastFocusOffset =
                null;
            this.polling = new Delayed();
            this.composing = null;
            this.gracePeriod = false;
            this.readDOMTimeout = null;
          },
          'name',
          { value: '_a', configurable: true },
        );
        function posToDOM(editor, position) {
          var view = findViewForLine(editor, position.line);
          if (!view || view.hidden) {
            return null;
          }
          var line = getLine(editor.doc, position.line),
            info = mapFromLineView(view, line, position.line),
            order = getOrder(line, editor.doc.direction),
            bias = 'left';
          if (order) {
            bias = getBidiPartAt(order, position.ch) % 2 ? 'right' : 'left';
          }
          var result = nodeAndOffsetInLineMap(info.map, position.ch, bias);
          result.offset = 'right' == result.collapse ? result.end : result.start;
          return result;
        }
        function markBadPosition(position, bad) {
          if (bad) {
            position.bad = true;
          }
          return position;
        }
        function domToPos(editor, node, offset) {
          var lineNode;
          if (node == editor.display.lineDiv) {
            if (!(lineNode = editor.display.lineDiv.childNodes[offset])) {
              return markBadPosition(editor.clipPos(Pos(editor.display.viewTo - 1)), true);
            }
            node = null;
            offset = 0;
          } else {
            for (lineNode = node; ; lineNode = lineNode.parentNode) {
              if (!lineNode || lineNode == editor.display.lineDiv) {
                return null;
              }
              if (lineNode.parentNode && lineNode.parentNode == editor.display.lineDiv) {
                break;
              }
            }
          }
          for (var viewIndex = 0; viewIndex < editor.display.view.length; viewIndex++) {
            var lineView = editor.display.view[viewIndex];
            if (lineView.node == lineNode) {
              return domToPosInLine(lineView, node, offset);
            }
          }
        }
        function domToPosInLine(lineView, node, offset) {
          Object.defineProperty(find, 'name', { value: 'd', configurable: true });

          var wrapper = lineView.text.firstChild,
            bad = false;
          if (!node || !contains(wrapper, node)) {
            return markBadPosition(Pos(lineNo(lineView.line), 0), true);
          }
          if (
            node == wrapper &&
            ((bad = true), (node = wrapper.childNodes[offset]), (offset = 0), !node)
          ) {
            var line = lineView.rest ? lst(lineView.rest) : lineView.line;
            return markBadPosition(Pos(lineNo(line), line.text.length), bad);
          }
          var textNode = 3 == node.nodeType ? node : null,
            topNode = node;
          for (
            textNode ||
            1 != node.childNodes.length ||
            3 != node.firstChild.nodeType ||
            ((textNode = node.firstChild), offset && (offset = textNode.nodeValue.length));
            topNode.parentNode != wrapper;
          ) {
            topNode = topNode.parentNode;
          }
          var measure = lineView.measure,
            maps = measure.maps;
          function find(textNode, topNode, offset) {
            for (var mapIndex = -1; mapIndex < (maps ? maps.length : 0); mapIndex++) {
              for (
                var map$$1 = mapIndex < 0 ? measure.map : maps[mapIndex], tokenIndex = 0;
                tokenIndex < map$$1.length;
                tokenIndex += 3
              ) {
                var curNode = map$$1[tokenIndex + 2];
                if (curNode == textNode || curNode == topNode) {
                  var line = lineNo(mapIndex < 0 ? lineView.line : lineView.rest[mapIndex]),
                    column = map$$1[tokenIndex] + offset;
                  if (offset < 0 || curNode != textNode) {
                    column = map$$1[tokenIndex + (offset ? 1 : 0)];
                  }
                  return Pos(line, column);
                }
              }
            }
          }
          var found = find(textNode, topNode, offset);
          if (found) {
            return markBadPosition(found, bad);
          }
          for (
            var after = topNode.nextSibling,
              dist = textNode ? textNode.nodeValue.length - offset : 0;
            after;
            after = after.nextSibling
          ) {
            if ((found = find(after, after.firstChild, 0))) {
              return markBadPosition(Pos(found.line, found.ch - dist), bad);
            }
            dist += after.textContent.length;
          }
          for (
            var before = topNode.previousSibling, dist$1 = offset;
            before;
            before = before.previousSibling
          ) {
            if ((found = find(before, before.firstChild, -1))) {
              return markBadPosition(Pos(found.line, found.ch + dist$1), bad);
            }
            dist$1 += before.textContent.length;
          }
        }
        ContentEditableInput.prototype.init = function (display) {
          Object.defineProperty(onCopyCut, 'name', { value: 'o', configurable: true });

          var this$1 = this,
            input = this,
            editor = input.cm,
            div = (input.div = display.lineDiv);
          function onCopyCut(event) {
            if (!signalDOMEvent(editor, event)) {
              if (editor.somethingSelected()) {
                setLastCopied({ lineWise: false, text: editor.getSelections() });
                if ('cut' == event.type) {
                  editor.replaceSelection('', null, 'cut');
                }
              } else {
                if (!editor.options.lineWiseCopyCut) {
                  return;
                }
                var ranges = copyableRanges(editor);
                setLastCopied({ lineWise: true, text: ranges.text });
                if ('cut' == event.type) {
                  editor.operation(function () {
                    editor.setSelections(ranges.ranges, 0, sel_dontScroll);
                    editor.replaceSelection('', null, 'cut');
                  });
                }
              }
              if (event.clipboardData) {
                event.clipboardData.clearData();
                var content = lastCopied.text.join('\n');
                event.clipboardData.setData('Text', content);
                if (event.clipboardData.getData('Text') == content) {
                  return void event.preventDefault();
                }
              }
              var kludge = hiddenTextarea(),
                textarea = kludge.firstChild;
              editor.display.lineSpace.insertBefore(kludge, editor.display.lineSpace.firstChild);
              textarea.value = lastCopied.text.join('\n');
              var hadFocus = document.activeElement;
              selectInput(textarea);
              setTimeout(function () {
                editor.display.lineSpace.removeChild(kludge);
                hadFocus.focus();
                if (hadFocus == div) {
                  input.showPrimarySelection();
                }
              }, 50);
            }
          }
          disableBrowserMagic(div, editor.options.spellcheck);
          addEventHandler(div, 'paste', function (event) {
            if (!(signalDOMEvent(editor, event) || handlePaste(event, editor))) {
              if (ie_version <= 11) {
                setTimeout(
                  operation(editor, function () {
                    return this$1.updateFromDOM();
                  }),
                  20,
                );
              }
            }
          });
          addEventHandler(div, 'compositionstart', function (event) {
            this$1.composing = { data: event.data, done: false };
          });
          addEventHandler(div, 'compositionupdate', function (event) {
            if (!this$1.composing) {
              this$1.composing = { data: event.data, done: false };
            }
          });
          addEventHandler(div, 'compositionend', function (event) {
            if (this$1.composing) {
              if (event.data != this$1.composing.data) {
                this$1.readFromDOMSoon();
              }
              this$1.composing.done = true;
            }
          });
          addEventHandler(div, 'touchstart', function () {
            return input.forceCompositionEnd();
          });
          addEventHandler(div, 'input', function () {
            if (!this$1.composing) {
              this$1.readFromDOMSoon();
            }
          });
          addEventHandler(div, 'copy', onCopyCut);
          addEventHandler(div, 'cut', onCopyCut);
        };
        ContentEditableInput.prototype.prepareSelection = function () {
          var result = prepareSelection(this.cm, false);
          result.focus = this.cm.state.focused;
          return result;
        };
        ContentEditableInput.prototype.showSelection = function (info, takeFocus) {
          if (info && this.cm.display.view.length) {
            if (info.focus || takeFocus) {
              this.showPrimarySelection();
            }
            this.showMultipleSelections(info);
          }
        };
        ContentEditableInput.prototype.showPrimarySelection = function () {
          var selection = window.getSelection(),
            editor = this.cm,
            prim = editor.doc.sel.primary(),
            from = prim.from(),
            rangeEnd = prim.to();
          if (
            editor.display.viewTo == editor.display.viewFrom ||
            from.line >= editor.display.viewTo ||
            rangeEnd.line < editor.display.viewFrom
          ) {
            selection.removeAllRanges();
          } else {
            var curAnchor = domToPos(editor, selection.anchorNode, selection.anchorOffset),
              curFocus = domToPos(editor, selection.focusNode, selection.focusOffset);
            if (
              !curAnchor ||
              curAnchor.bad ||
              !curFocus ||
              curFocus.bad ||
              0 != cmp(minPos(curAnchor, curFocus), from) ||
              0 != cmp(maxPos(curAnchor, curFocus), rangeEnd)
            ) {
              var view = editor.display.view,
                start = (from.line >= editor.display.viewFrom && posToDOM(editor, from)) || {
                  node: view[0].measure.map[2],
                  offset: 0,
                },
                end = rangeEnd.line < editor.display.viewTo && posToDOM(editor, rangeEnd);
              if (!end) {
                var measure = view[view.length - 1].measure,
                  map$$1 = measure.maps ? measure.maps[measure.maps.length - 1] : measure.map;
                end = {
                  node: map$$1[map$$1.length - 1],
                  offset: map$$1[map$$1.length - 2] - map$$1[map$$1.length - 3],
                };
              }
              if (start && end) {
                var rng,
                  old = selection.rangeCount && selection.getRangeAt(0);
                try {
                  rng = range(start.node, start.offset, end.offset, end.node);
                } catch (selectionError) {}
                if (rng) {
                  if (!gecko && editor.state.focused) {
                    selection.collapse(start.node, start.offset);
                    if (!rng.collapsed) {
                      selection.removeAllRanges();
                      selection.addRange(rng);
                    }
                  } else {
                    selection.removeAllRanges();
                    selection.addRange(rng);
                  }
                  if (old && null == selection.anchorNode) {
                    selection.addRange(old);
                  } else {
                    if (gecko) {
                      this.startGracePeriod();
                    }
                  }
                }
                this.rememberSelection();
              } else {
                selection.removeAllRanges();
              }
            }
          }
        };
        ContentEditableInput.prototype.startGracePeriod = function () {
          var this$1 = this;
          clearTimeout(this.gracePeriod);
          this.gracePeriod = setTimeout(function () {
            this$1.gracePeriod = false;
            if (this$1.selectionChanged()) {
              this$1.cm.operation(function () {
                return (this$1.cm.curOp.selectionChanged = true);
              });
            }
          }, 20);
        };
        ContentEditableInput.prototype.showMultipleSelections = function (info) {
          removeChildrenAndAdd(this.cm.display.cursorDiv, info.cursors);
          removeChildrenAndAdd(this.cm.display.selectionDiv, info.selection);
        };
        ContentEditableInput.prototype.rememberSelection = function () {
          var selection = window.getSelection();
          this.lastAnchorNode = selection.anchorNode;
          this.lastAnchorOffset = selection.anchorOffset;
          this.lastFocusNode = selection.focusNode;
          this.lastFocusOffset = selection.focusOffset;
        };
        ContentEditableInput.prototype.selectionInEditor = function () {
          var selection = window.getSelection();
          if (!selection.rangeCount) {
            return false;
          }
          var node = selection.getRangeAt(0).commonAncestorContainer;
          return contains(this.div, node);
        };
        ContentEditableInput.prototype.focus = function () {
          if ('nocursor' != this.cm.options.readOnly) {
            if (!this.selectionInEditor()) {
              this.showSelection(this.prepareSelection(), true);
            }
            this.div.focus();
          }
        };
        ContentEditableInput.prototype.blur = function () {
          this.div.blur();
        };
        ContentEditableInput.prototype.getField = function () {
          return this.div;
        };
        ContentEditableInput.prototype.supportsTouch = function () {
          return true;
        };
        ContentEditableInput.prototype.receivedFocus = function () {
          var input = this;
          if (this.selectionInEditor()) {
            this.pollSelection();
          } else {
            runInOp(this.cm, function () {
              return (input.cm.curOp.selectionChanged = true);
            });
          }
          this.polling.set(
            this.cm.options.pollInterval,
            Object.defineProperty(
              function poll() {
                if (input.cm.state.focused) {
                  input.pollSelection();
                  input.polling.set(input.cm.options.pollInterval, poll);
                }
              },
              'name',
              { value: 't', configurable: true },
            ),
          );
        };
        ContentEditableInput.prototype.selectionChanged = function () {
          var selection = window.getSelection();
          return (
            selection.anchorNode != this.lastAnchorNode ||
            selection.anchorOffset != this.lastAnchorOffset ||
            selection.focusNode != this.lastFocusNode ||
            selection.focusOffset != this.lastFocusOffset
          );
        };
        ContentEditableInput.prototype.pollSelection = function () {
          if (null == this.readDOMTimeout && !this.gracePeriod && this.selectionChanged()) {
            var selection = window.getSelection(),
              editor = this.cm;
            if (
              android &&
              chrome &&
              this.cm.options.gutters.length &&
              (function (node) {
                for (var scan = node; scan; scan = scan.parentNode) {
                  if (/CodeMirror-gutter-wrapper/.test(scan.className)) {
                    return true;
                  }
                }
                return false;
              })(selection.anchorNode)
            ) {
              this.cm.triggerOnKeyDown({ type: 'keydown', keyCode: 8, preventDefault: Math.abs });
              this.blur();
              return void this.focus();
            }
            if (!this.composing) {
              this.rememberSelection();
              var anchor = domToPos(editor, selection.anchorNode, selection.anchorOffset),
                head = domToPos(editor, selection.focusNode, selection.focusOffset);
              if (anchor && head) {
                runInOp(editor, function () {
                  setSelection(editor.doc, simpleSelection(anchor, head), sel_dontScroll);
                  if (anchor.bad || head.bad) {
                    editor.curOp.selectionChanged = true;
                  }
                });
              }
            }
          }
        };
        ContentEditableInput.prototype.pollContent = function () {
          if (null != this.readDOMTimeout) {
            clearTimeout(this.readDOMTimeout);
            this.readDOMTimeout = null;
          }
          var fromIndex,
            fromLine,
            fromNode,
            editor = this.cm,
            display = editor.display,
            selection = editor.doc.sel.primary(),
            from = selection.from(),
            rangeEnd = selection.to();
          if (0 == from.ch && from.line > editor.firstLine()) {
            from = Pos(from.line - 1, getLine(editor.doc, from.line - 1).length);
          }
          if (
            rangeEnd.ch == getLine(editor.doc, rangeEnd.line).text.length &&
            rangeEnd.line < editor.lastLine()
          ) {
            rangeEnd = Pos(rangeEnd.line + 1, 0);
          }
          if (from.line < display.viewFrom || rangeEnd.line > display.viewTo - 1) {
            return false;
          }
          if (
            from.line == display.viewFrom ||
            0 == (fromIndex = findViewIndex(editor, from.line))
          ) {
            fromLine = lineNo(display.view[0].line);
            fromNode = display.view[0].node;
          } else {
            fromLine = lineNo(display.view[fromIndex].line);
            fromNode = display.view[fromIndex - 1].node.nextSibling;
          }
          var toLine,
            toNode,
            toIndex = findViewIndex(editor, rangeEnd.line);
          if (toIndex == display.view.length - 1) {
            toLine = display.viewTo - 1;
            toNode = display.lineDiv.lastChild;
          } else {
            toLine = lineNo(display.view[toIndex + 1].line) - 1;
            toNode = display.view[toIndex + 1].node.previousSibling;
          }
          if (!fromNode) {
            return false;
          }
          for (
            var newText = editor.doc.splitLines(
                (function (editor, from, previousLine, fromLine, toLine) {
                  Object.defineProperty(close, 'name', { value: 'l', configurable: true });
                  Object.defineProperty(addText, 'name', { value: 'c', configurable: true });
                  Object.defineProperty(walk, 'name', { value: 'd', configurable: true });

                  var text = '',
                    closing = false,
                    lineSep = editor.doc.lineSeparator();
                  function close() {
                    if (closing) {
                      text += lineSep;
                      closing = false;
                    }
                  }
                  function addText(str) {
                    if (str) {
                      close();
                      text += str;
                    }
                  }
                  function walk(node) {
                    if (1 == node.nodeType) {
                      var cmText = node.getAttribute('cm-text');
                      if (null != cmText) {
                        return void addText(cmText || node.textContent.replace(/\u200b/g, ''));
                      }
                      var range$$1,
                        markerID = node.getAttribute('cm-marker');
                      if (markerID) {
                        var found = editor.findMarks(
                          Pos(fromLine, 0),
                          Pos(toLine + 1, 0),
                          ((markerId = +markerID),
                          function (marker) {
                            return marker.id == markerId;
                          }),
                        );
                        return void (
                          found.length &&
                          (range$$1 = found[0].find()) &&
                          addText(getBetween(editor.doc, range$$1.from, range$$1.to).join(lineSep))
                        );
                      }
                      if ('false' == node.getAttribute('contenteditable')) {
                        return;
                      }
                      var isBlock = /^(pre|div|p)$/i.test(node.nodeName);
                      if (isBlock) {
                        close();
                      }
                      for (var childIndex = 0; childIndex < node.childNodes.length; childIndex++) {
                        walk(node.childNodes[childIndex]);
                      }
                      if (isBlock) {
                        closing = true;
                      }
                    } else {
                      if (3 == node.nodeType) {
                        addText(node.nodeValue);
                      }
                    }
                    var markerId;
                  }
                  for (; walk(from), from != previousLine; ) {
                    from = from.nextSibling;
                  }
                  return text;
                })(editor, fromNode, toNode, fromLine, toLine),
              ),
              oldText = getBetween(
                editor.doc,
                Pos(fromLine, 0),
                Pos(toLine, getLine(editor.doc, toLine).text.length),
              );
            newText.length > 1 && oldText.length > 1;
          ) {
            if (lst(newText) == lst(oldText)) {
              newText.pop();
              oldText.pop();
              toLine--;
            } else {
              if (newText[0] != oldText[0]) {
                break;
              }
              newText.shift();
              oldText.shift();
              fromLine++;
            }
          }
          for (
            var cutFront = 0,
              cutEnd = 0,
              newTop = newText[0],
              oldTop = oldText[0],
              maxCutFront = Math.min(newTop.length, oldTop.length);
            cutFront < maxCutFront && newTop.charCodeAt(cutFront) == oldTop.charCodeAt(cutFront);
          ) {
            ++cutFront;
          }
          for (
            var newBot = lst(newText),
              oldBot = lst(oldText),
              maxCutEnd = Math.min(
                newBot.length - (1 == newText.length ? cutFront : 0),
                oldBot.length - (1 == oldText.length ? cutFront : 0),
              );
            cutEnd < maxCutEnd &&
            newBot.charCodeAt(newBot.length - cutEnd - 1) ==
              oldBot.charCodeAt(oldBot.length - cutEnd - 1);
          ) {
            ++cutEnd;
          }
          if (1 == newText.length && 1 == oldText.length && fromLine == from.line) {
            for (
              ;
              cutFront &&
              cutFront > from.ch &&
              newBot.charCodeAt(newBot.length - cutEnd - 1) ==
                oldBot.charCodeAt(oldBot.length - cutEnd - 1);
            ) {
              cutFront--;
              cutEnd++;
            }
          }
          newText[newText.length - 1] = newBot
            .slice(0, newBot.length - cutEnd)
            .replace(/^\u200b+/, '');
          newText[0] = newText[0].slice(cutFront).replace(/\u200b+$/, '');
          var chFrom = Pos(fromLine, cutFront),
            chTo = Pos(toLine, oldText.length ? lst(oldText).length - cutEnd : 0);
          if (newText.length > 1 || newText[0] || cmp(chFrom, chTo)) {
            replaceRange(editor.doc, newText, chFrom, chTo, '+input');
            return true;
          } else {
            return void 0;
          }
        };
        ContentEditableInput.prototype.ensurePolled = function () {
          this.forceCompositionEnd();
        };
        ContentEditableInput.prototype.reset = function () {
          this.forceCompositionEnd();
        };
        ContentEditableInput.prototype.forceCompositionEnd = function () {
          if (this.composing) {
            clearTimeout(this.readDOMTimeout);
            this.composing = null;
            this.updateFromDOM();
            this.div.blur();
            this.div.focus();
          }
        };
        ContentEditableInput.prototype.readFromDOMSoon = function () {
          var this$1 = this;
          if (null == this.readDOMTimeout) {
            this.readDOMTimeout = setTimeout(function () {
              this$1.readDOMTimeout = null;
              if (this$1.composing) {
                if (!this$1.composing.done) {
                  return;
                }
                this$1.composing = null;
              }
              this$1.updateFromDOM();
            }, 80);
          }
        };
        ContentEditableInput.prototype.updateFromDOM = function () {
          var this$1 = this;
          if (!(!this.cm.isReadOnly() && this.pollContent())) {
            runInOp(this.cm, function () {
              return regChange(this$1.cm);
            });
          }
        };
        ContentEditableInput.prototype.setUneditable = function (node) {
          node.contentEditable = 'false';
        };
        ContentEditableInput.prototype.onKeyPress = function (event) {
          if (0 != event.charCode) {
            event.preventDefault();
            if (!this.cm.isReadOnly()) {
              operation(this.cm, applyTextInput)(
                this.cm,
                String.fromCharCode(null == event.charCode ? event.keyCode : event.charCode),
                0,
              );
            }
          }
        };
        ContentEditableInput.prototype.readOnlyChanged = function (val) {
          this.div.contentEditable = String('nocursor' != val);
        };
        ContentEditableInput.prototype.onContextMenu = function () {};
        ContentEditableInput.prototype.resetPosition = function () {};
        ContentEditableInput.prototype.needsContentAttribute = true;
        var TextareaInput = Object.defineProperty(
          function (editor) {
            this.cm = editor;
            this.prevInput = '';
            this.pollingFast = false;
            this.polling = new Delayed();
            this.inaccurateSelection = false;
            this.hasSelection = false;
            this.composing = null;
          },
          'name',
          { value: 'Da', configurable: true },
        );
        TextareaInput.prototype.init = function (display) {
          Object.defineProperty(prepareCopyCut, 'name', { value: 'l', configurable: true });

          var this$1 = this,
            input = this,
            editor = this.cm,
            div = (this.wrapper = hiddenTextarea()),
            textarea = (this.textarea = div.firstChild);
          function prepareCopyCut(event) {
            if (!signalDOMEvent(editor, event)) {
              if (editor.somethingSelected()) {
                setLastCopied({ lineWise: false, text: editor.getSelections() });
                if (input.inaccurateSelection) {
                  input.prevInput = '';
                  input.inaccurateSelection = false;
                  textarea.value = lastCopied.text.join('\n');
                  selectInput(textarea);
                }
              } else {
                if (!editor.options.lineWiseCopyCut) {
                  return;
                }
                var cursorPosition = editor.getCursor(),
                  ranges = copyableRanges(editor);
                setLastCopied({ lineWise: true, text: ranges.text });
                if ('cut' == event.type) {
                  if (event.clipboardData) {
                    event.clipboardData.clearData();
                    var clipboardText = lastCopied.text.join('\n');
                    event.clipboardData.setData('Text', clipboardText);
                    if (event.clipboardData.getData('Text') == clipboardText) {
                      event.preventDefault();
                      if (editor.cid) {
                        editor.editor.undo.register({
                          undo: [{ type: 'fences-pos', id: editor.cid, pos: cursorPosition }],
                          redo: [],
                        });
                      }
                      return void editor.replaceRange(
                        '',
                        ranges.ranges[0].anchor,
                        ranges.ranges[0].head,
                        'cut-line',
                      );
                    }
                  }
                  editor.setSelections(ranges.ranges, null, sel_dontScroll);
                } else {
                  input.prevInput = '';
                  textarea.value = ranges.text.join('\n');
                  selectInput(textarea);
                }
              }
              if ('cut' == event.type) {
                editor.state.cutIncoming = true;
              }
            }
          }
          display.wrapper.insertBefore(div, display.wrapper.firstChild);
          if (ios) {
            textarea.style.width = '0px';
          }
          addEventHandler(textarea, 'input', function () {
            if (isInternetExplorer && ie_version >= 9 && this$1.hasSelection) {
              this$1.hasSelection = null;
            }
            input.poll();
          });
          addEventHandler(textarea, 'paste', function (event) {
            if (!(signalDOMEvent(editor, event) || handlePaste(event, editor))) {
              editor.state.pasteIncoming = true;
              input.fastPoll();
            }
          });
          addEventHandler(textarea, 'cut', prepareCopyCut);
          addEventHandler(textarea, 'copy', prepareCopyCut);
          addEventHandler(display.scroller, 'paste', function (event) {
            if (!(eventInWidget(display, event) || signalDOMEvent(editor, event))) {
              editor.state.pasteIncoming = true;
              input.focus();
            }
          });
          addEventHandler(display.lineSpace, 'selectstart', function (event) {
            if (!eventInWidget(display, event)) {
              e_preventDefault(event);
            }
          });
          addEventHandler(textarea, 'compositionstart', function () {
            if (!(editor.getSelections().length > 1)) {
              var start = editor.getCursor('from');
              if (input.composing) {
                input.composing.range.clear();
              }
              input.composing = {
                start: start,
                range: editor.markText(start, editor.getCursor('to'), {
                  className: 'CodeMirror-composing',
                }),
              };
            }
          });
          addEventHandler(textarea, 'compositionend', function () {
            if (input.composing) {
              input.poll();
              input.composing.range.clear();
              input.composing = null;
            }
          });
        };
        TextareaInput.prototype.prepareSelection = function () {
          var editor = this.cm,
            display = editor.display,
            documentModel = editor.doc,
            result = prepareSelection(editor);
          if (editor.options.moveInputWithCursor) {
            var headPos = cursorCoords(editor, documentModel.sel.primary().head, 'div'),
              wrapOff = display.wrapper.getBoundingClientRect(),
              lineOff = display.lineDiv.getBoundingClientRect();
            result.teTop = Math.max(
              0,
              Math.min(
                display.wrapper.clientHeight - 10,
                (headPos.bottom + headPos.top) / 2 - 2 + lineOff.top - wrapOff.top,
              ),
            );
            result.teLeft = Math.max(
              0,
              Math.min(
                display.wrapper.clientWidth - 10,
                headPos.left + lineOff.left - wrapOff.left,
              ),
            );
          }
          return result;
        };
        TextareaInput.prototype.showSelection = function (drawn) {
          var display = this.cm.display;
          removeChildrenAndAdd(display.cursorDiv, drawn.cursors);
          removeChildrenAndAdd(display.selectionDiv, drawn.selection);
          if (null != drawn.teTop) {
            this.wrapper.style.top = drawn.teTop + 'px';
            this.wrapper.style.left = drawn.teLeft + 'px';
          }
        };
        TextareaInput.prototype.reset = function (typing) {
          if (!this.contextMenuPending && !this.composing) {
            var minimal,
              selected,
              editor = this.cm,
              documentModel = editor.doc;
            if (editor.somethingSelected()) {
              this.prevInput = '';
              var range$$1 = documentModel.sel.primary(),
                content = (minimal =
                  hasCopyEvent &&
                  (range$$1.to().line - range$$1.from().line > 100 ||
                    (selected = editor.getSelection()).length > 1e3))
                  ? '-'
                  : selected || editor.getSelection();
              this.textarea.value = content;
              if (editor.state.focused) {
                selectInput(this.textarea);
              }
              if (isInternetExplorer && ie_version >= 9) {
                this.hasSelection = content;
              }
            } else {
              if (!typing) {
                this.prevInput = this.textarea.value = '';
                if (isInternetExplorer && ie_version >= 9) {
                  this.hasSelection = null;
                }
              }
            }
            this.inaccurateSelection = minimal;
          }
        };
        TextareaInput.prototype.getField = function () {
          return this.textarea;
        };
        TextareaInput.prototype.supportsTouch = function () {
          return false;
        };
        TextareaInput.prototype.focus = function () {
          if ('nocursor' != this.cm.options.readOnly && (!mobile || activeElt() != this.textarea)) {
            try {
              this.textarea.focus();
            } catch (focusError) {}
          }
        };
        TextareaInput.prototype.blur = function () {
          this.textarea.blur();
        };
        TextareaInput.prototype.resetPosition = function () {
          this.wrapper.style.top = this.wrapper.style.left = 0;
        };
        TextareaInput.prototype.receivedFocus = function () {
          this.slowPoll();
        };
        TextareaInput.prototype.slowPoll = function () {
          var this$1 = this;
          if (!this.pollingFast) {
            this.polling.set(this.cm.options.pollInterval, function () {
              this$1.poll();
              if (this$1.cm.state.focused) {
                this$1.slowPoll();
              }
            });
          }
        };
        TextareaInput.prototype.fastPoll = function () {
          var missed = false,
            input = this;
          input.pollingFast = true;
          input.polling.set(
            20,
            Object.defineProperty(
              function fastPollStep() {
                if (input.poll() || missed) {
                  input.pollingFast = false;
                  input.slowPoll();
                } else {
                  missed = true;
                  input.polling.set(60, fastPollStep);
                }
              },
              'name',
              { value: 'n', configurable: true },
            ),
          );
        };
        TextareaInput.prototype.poll = function () {
          var this$1 = this,
            editor = this.cm,
            input = this.textarea,
            prevInput = this.prevInput;
          if (
            this.contextMenuPending ||
            !editor.state.focused ||
            (hasSelection(input) && !prevInput && !this.composing) ||
            editor.isReadOnly() ||
            editor.options.disableInput ||
            editor.state.keySeq
          ) {
            return false;
          }
          var text = input.value;
          if (text == prevInput && !editor.somethingSelected()) {
            return false;
          }
          if (
            (isInternetExplorer && ie_version >= 9 && this.hasSelection === text) ||
            (mac && /[\uf700-\uf7ff]/.test(text))
          ) {
            editor.display.input.reset();
            return false;
          }
          if (editor.doc.sel == editor.display.selForContextMenu) {
            var first = text.charCodeAt(0);
            if (!(8203 != first || prevInput)) {
              prevInput = '​';
            }
            if (8666 == first) {
              this.reset();
              return this.cm.execCommand('undo');
            }
          }
          for (
            var same = 0, commonLength = Math.min(prevInput.length, text.length);
            same < commonLength && prevInput.charCodeAt(same) == text.charCodeAt(same);
          ) {
            ++same;
          }
          runInOp(editor, function () {
            applyTextInput(
              editor,
              text.slice(same),
              prevInput.length - same,
              null,
              this$1.composing ? '*compose' : null,
            );
            if (text.length > 1e3 || text.indexOf('\n') > -1) {
              input.value = this$1.prevInput = '';
            } else {
              this$1.prevInput = text;
            }
            if (this$1.composing) {
              this$1.composing.range.clear();
              this$1.composing.range = editor.markText(
                this$1.composing.start,
                editor.getCursor('to'),
                {
                  className: 'CodeMirror-composing',
                },
              );
            }
          });
          return true;
        };
        TextareaInput.prototype.ensurePolled = function () {
          if (this.pollingFast && this.poll()) {
            this.pollingFast = false;
          }
        };
        TextareaInput.prototype.onKeyPress = function () {
          if (isInternetExplorer && ie_version >= 9) {
            this.hasSelection = null;
          }
          this.fastPoll();
        };
        TextareaInput.prototype.onContextMenu = function (event) {
          Object.defineProperty(prepareSelectAllHack, 'name', { value: 'y', configurable: true });
          Object.defineProperty(rehide, 'name', { value: 'b', configurable: true });

          var input = this,
            editor = input.cm,
            display = editor.display,
            textarea = input.textarea,
            position = posFromMouse(editor, event),
            scrollPos = display.scroller.scrollTop;
          if (position && !presto) {
            var scrollTop,
              scrollContainer = document.querySelector('content');
            if (webkit) {
              scrollTop = scrollContainer ? scrollContainer.scrollTop : window.scrollY;
            }
            if (
              editor.options.resetSelectionOnContextMenu &&
              -1 == editor.doc.sel.contains(position)
            ) {
              if (File.isMac) {
                var wordRange = editor.findWordAt(position);
                operation(editor, setSelection)(
                  editor.doc,
                  simpleSelection(wordRange.anchor, wordRange.head),
                  sel_dontScroll,
                );
              } else {
                operation(editor, setSelection)(
                  editor.doc,
                  simpleSelection(position),
                  sel_dontScroll,
                );
              }
            }
            var oldCSS = textarea.style.cssText,
              oldWrapperCSS = input.wrapper.style.cssText;
            input.wrapper.style.cssText = 'position: absolute';
            var wrapperBox = input.wrapper.getBoundingClientRect();
            textarea.style.cssText =
              'position: absolute; width: 30px; height: 30px;\n      top: ' +
              (event.clientY - wrapperBox.top - 5) +
              'px; left: ' +
              (event.clientX - wrapperBox.left - 5) +
              'px;\n      z-index: 1000; background: ' +
              (isInternetExplorer ? 'rgba(255, 255, 255, .05)' : 'transparent') +
              ';\n      outline: none; border-width: 0; outline: none; overflow: hidden; opacity: .05; filter: alpha(opacity=5);';
            display.input.focus();
            if (webkit) {
              setTimeout(() => {
                (scrollContainer || window).scrollTop = scrollTop;
              }, 0);
            }
            display.input.reset();
            if (!editor.somethingSelected()) {
              textarea.value = input.prevInput = ' ';
            }
            input.contextMenuPending = true;
            display.selForContextMenu = editor.doc.sel;
            clearTimeout(display.detectingSelectAll);
            if (isInternetExplorer && ie_version >= 9) {
              prepareSelectAllHack();
            }
            if (captureRightClick) {
              e_stop(event);
              var mouseup = Object.defineProperty(
                function () {
                  off(window, 'mouseup', mouseup);
                  setTimeout(rehide, 20);
                },
                'name',
                { value: 'v', configurable: true },
              );
              addEventHandler(window, 'mouseup', mouseup);
            } else {
              setTimeout(rehide, 50);
            }
          }
          function prepareSelectAllHack() {
            if (null != textarea.selectionStart) {
              var selected = editor.somethingSelected(),
                extval = '​' + (selected ? textarea.value : '');
              textarea.value = '⇚';
              textarea.value = extval;
              input.prevInput = selected ? '' : '​';
              textarea.selectionStart = 1;
              textarea.selectionEnd = extval.length;
              display.selForContextMenu = editor.doc.sel;
            }
          }
          function rehide() {
            input.contextMenuPending = false;
            input.wrapper.style.cssText = oldWrapperCSS;
            textarea.style.cssText = oldCSS;
            if (isInternetExplorer && ie_version < 9) {
              display.scrollbars.setScrollTop((display.scroller.scrollTop = scrollPos));
            }
            if (null != textarea.selectionStart) {
              if (!isInternetExplorer || (isInternetExplorer && ie_version < 9)) {
                prepareSelectAllHack();
              }
              var pollCount = 0,
                poll = Object.defineProperty(
                  function () {
                    if (
                      display.selForContextMenu == editor.doc.sel &&
                      0 == textarea.selectionStart &&
                      textarea.selectionEnd > 0 &&
                      '​' == input.prevInput
                    ) {
                      operation(editor, selectAll)(editor);
                    } else {
                      if (pollCount++ < 10) {
                        display.detectingSelectAll = setTimeout(poll, 500);
                      } else {
                        display.selForContextMenu = null;
                        display.input.reset();
                      }
                    }
                  },
                  'name',
                  { value: 'o', configurable: true },
                );
              display.detectingSelectAll = setTimeout(poll, 200);
            }
          }
        };
        TextareaInput.prototype.readOnlyChanged = function (val) {
          if (!val) {
            this.reset();
          }
        };
        TextareaInput.prototype.setUneditable = function () {};
        TextareaInput.prototype.needsContentAttribute = false;
        (function (CodeMirror) {
          Object.defineProperty(defineOption, 'name', { value: 'n', configurable: true });

          var optionHandlers = CodeMirror.optionHandlers;
          function defineOption(optionName, defaultValue, changeHandler, skipInitialization) {
            CodeMirror.defaults[optionName] = defaultValue;
            if (changeHandler) {
              optionHandlers[optionName] = skipInitialization
                ? function (editor, value, previousValue) {
                    if (previousValue != Init) {
                      changeHandler(editor, value, previousValue);
                    }
                  }
                : changeHandler;
            }
          }
          CodeMirror.defineOption = defineOption;
          CodeMirror.Init = Init;
          defineOption(
            'value',
            '',
            function (editor, value) {
              return editor.setValue(value);
            },
            true,
          );
          defineOption(
            'mode',
            null,
            function (editor, mode) {
              editor.doc.modeOption = mode;
              loadMode(editor);
            },
            true,
          );
          defineOption('indentUnit', 2, loadMode, true);
          defineOption('indentWithTabs', false);
          defineOption('smartIndent', true);
          defineOption(
            'tabSize',
            4,
            function (editor) {
              resetModeState(editor);
              clearCaches(editor);
              regChange(editor);
            },
            true,
          );
          defineOption('lineSeparator', null, function (editor, lineSeparator) {
            editor.doc.lineSep = lineSeparator;
            if (lineSeparator) {
              var separatorPositions = [],
                lineNumber = editor.doc.first;
              editor.doc.iter(function (line) {
                for (var searchOffset = 0; ; ) {
                  var separatorOffset = line.text.indexOf(lineSeparator, searchOffset);
                  if (-1 == separatorOffset) {
                    break;
                  }
                  searchOffset = separatorOffset + lineSeparator.length;
                  separatorPositions.push(Pos(lineNumber, separatorOffset));
                }
                lineNumber++;
              });
              for (
                var positionIndex = separatorPositions.length - 1;
                positionIndex >= 0;
                positionIndex--
              ) {
                replaceRange(
                  editor.doc,
                  lineSeparator,
                  separatorPositions[positionIndex],
                  Pos(
                    separatorPositions[positionIndex].line,
                    separatorPositions[positionIndex].ch + lineSeparator.length,
                  ),
                );
              }
            }
          });
          defineOption(
            'specialChars',
            /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u2028\u2029\ufeff]/g,
            function (editor, specialCharacters, previousValue) {
              editor.state.specialChars = new RegExp(
                specialCharacters.source + (specialCharacters.test('\t') ? '' : '|\t'),
                'g',
              );
              if (previousValue != Init) {
                editor.refresh();
              }
            },
          );
          defineOption(
            'specialCharPlaceholder',
            defaultSpecialCharPlaceholder,
            function (editor) {
              return editor.refresh();
            },
            true,
          );
          defineOption('electricChars', true);
          defineOption(
            'inputStyle',
            mobile ? 'contenteditable' : 'textarea',
            function () {
              throw new Error('inputStyle can not (yet) be changed in a running editor');
            },
            true,
          );
          defineOption(
            'spellcheck',
            false,
            function (editor, enabled) {
              return (editor.getInputField().spellcheck = enabled);
            },
            true,
          );
          defineOption('rtlMoveVisually', !windows);
          defineOption('wholeLineUpdateBefore', true);
          defineOption(
            'theme',
            'default',
            function (editor) {
              themeChanged(editor);
              updateGutterGeometry(editor);
            },
            true,
          );
          defineOption('keyMap', 'default', function (editor, keyMapName, previousKeyMap) {
            var keyMap = getKeyMap(keyMapName),
              oldKeyMap = previousKeyMap != Init && getKeyMap(previousKeyMap);
            if (oldKeyMap && oldKeyMap.detach) {
              oldKeyMap.detach(editor, keyMap);
            }
            if (keyMap.attach) {
              keyMap.attach(editor, oldKeyMap || null);
            }
          });
          defineOption('extraKeys', null);
          defineOption('lineWrapping', false, wrappingChanged, true);
          defineOption(
            'gutters',
            [],
            function (editor) {
              setGuttersForLineNumbers(editor.options);
              updateGutterGeometry(editor);
            },
            true,
          );
          defineOption(
            'fixedGutter',
            true,
            function (editor, enabled) {
              editor.display.gutters.style.left = enabled
                ? compensateForHScroll(editor.display) + 'px'
                : '0';
              editor.refresh();
            },
            true,
          );
          defineOption(
            'coverGutterNextToScrollbar',
            false,
            function (editor) {
              return updateScrollbars(editor);
            },
            true,
          );
          defineOption(
            'scrollbarStyle',
            'native',
            function (editor) {
              initScrollbars(editor);
              updateScrollbars(editor);
              editor.display.scrollbars.setScrollTop(editor.doc.scrollTop);
              editor.display.scrollbars.setScrollLeft(editor.doc.scrollLeft);
            },
            true,
          );
          defineOption(
            'lineNumbers',
            false,
            function (editor) {
              setGuttersForLineNumbers(editor.options);
              updateGutterGeometry(editor);
            },
            true,
          );
          defineOption('firstLineNumber', 1, updateGutterGeometry, true);
          defineOption(
            'lineNumberFormatter',
            function (lineNumber) {
              return lineNumber;
            },
            updateGutterGeometry,
            true,
          );
          defineOption('showCursorWhenSelecting', false, updateSelection, true);
          defineOption('resetSelectionOnContextMenu', true);
          defineOption('lineWiseCopyCut', true);
          defineOption('readOnly', false, function (editor, readOnly) {
            if ('nocursor' == readOnly) {
              onBlur(editor);
              editor.display.input.blur();
              editor.display.disabled = true;
            } else {
              editor.display.disabled = false;
            }
            editor.display.input.readOnlyChanged(readOnly);
          });
          defineOption(
            'disableInput',
            false,
            function (editor, enabled) {
              if (!enabled) {
                editor.display.input.reset();
              }
            },
            true,
          );
          defineOption('dragDrop', true, dragDropChanged);
          defineOption('allowDropFileTypes', null);
          defineOption('cursorBlinkRate', 530);
          defineOption('cursorScrollMargin', 0);
          defineOption('cursorHeight', 1, updateSelection, true);
          defineOption('singleCursorHeightPerLine', true, updateSelection, true);
          defineOption('workTime', 100);
          defineOption('workDelay', 100);
          defineOption('flattenSpans', true, resetModeState, true);
          defineOption('addModeClass', false, resetModeState, true);
          defineOption('pollInterval', 100);
          defineOption('undoDepth', 200, function (editor, undoDepth) {
            return (editor.doc.history.undoDepth = undoDepth);
          });
          defineOption('historyEventDelay', 1250);
          defineOption(
            'viewportMargin',
            10,
            function (editor) {
              return editor.refresh();
            },
            true,
          );
          defineOption('maxHighlightLength', 1e4, resetModeState, true);
          defineOption('moveInputWithCursor', true, function (editor, enabled) {
            if (!enabled) {
              editor.display.input.resetPosition();
            }
          });
          defineOption('tabindex', null, function (editor, tabIndex) {
            return (editor.display.input.getField().tabIndex = tabIndex || '');
          });
          defineOption('autofocus', null);
          defineOption(
            'direction',
            'ltr',
            function (editor, direction) {
              return editor.doc.setDirection(direction);
            },
            true,
          );
        })(CodeMirror);
        (function (CodeMirror) {
          var optionHandlers = CodeMirror.optionHandlers,
            helpers = (CodeMirror.helpers = {});
          CodeMirror.prototype = {
            constructor: CodeMirror,
            focus: function () {
              window.focus();
              this.display.input.focus();
            },
            setOption: function (option, value) {
              var options = this.options,
                old = options[option];
              if (!(options[option] == value && 'mode' != option)) {
                options[option] = value;
                if (optionHandlers.hasOwnProperty(option)) {
                  operation(this, optionHandlers[option])(this, value, old);
                }
                signal(this, 'optionChange', this, option);
              }
            },
            getOption: function (option) {
              return this.options[option];
            },
            getDoc: function () {
              return this.doc;
            },
            addKeyMap: function (map$$1, bottom) {
              this.state.keyMaps[bottom ? 'push' : 'unshift'](getKeyMap(map$$1));
            },
            removeKeyMap: function (map$$1) {
              for (
                var maps = this.state.keyMaps, keyMapIndex = 0;
                keyMapIndex < maps.length;
                ++keyMapIndex
              ) {
                if (maps[keyMapIndex] == map$$1 || maps[keyMapIndex].name == map$$1) {
                  maps.splice(keyMapIndex, 1);
                  return true;
                }
              }
            },
            addOverlay: methodOp(function (spec, options) {
              var mode = spec.token ? spec : CodeMirror.getMode(this.options, spec);
              if (mode.startState) {
                throw new Error('Overlays may not be stateful.');
              }
              !(function (array, value, score) {
                for (
                  var position = 0, priority = score(value);
                  position < array.length && score(array[position]) <= priority;
                ) {
                  position++;
                }
                array.splice(position, 0, value);
              })(
                this.state.overlays,
                {
                  mode: mode,
                  modeSpec: spec,
                  opaque: options && options.opaque,
                  priority: (options && options.priority) || 0,
                },
                function (overlay) {
                  return overlay.priority;
                },
              );
              this.state.modeGen++;
              regChange(this);
            }),
            removeOverlay: methodOp(function (spec) {
              for (
                var overlays = this.state.overlays, overlayIndex = 0;
                overlayIndex < overlays.length;
                ++overlayIndex
              ) {
                var cur = overlays[overlayIndex].modeSpec;
                if (cur == spec || ('string' == typeof spec && cur.name == spec)) {
                  overlays.splice(overlayIndex, 1);
                  this.state.modeGen++;
                  return void regChange(this);
                }
              }
            }),
            indentLine: methodOp(function (lineNumber, dir, aggressive) {
              if ('string' != typeof dir && 'number' != typeof dir) {
                dir =
                  null == dir
                    ? this.options.smartIndent
                      ? 'smart'
                      : 'prev'
                    : dir
                      ? 'add'
                      : 'subtract';
              }
              if (isLine(this.doc, lineNumber)) {
                indentLine(this, lineNumber, dir, aggressive);
              }
            }),
            indentSelection: methodOp(function (how) {
              for (
                var ranges = this.doc.sel.ranges, end = -1, rangeIndex = 0;
                rangeIndex < ranges.length;
                rangeIndex++
              ) {
                var range$$1 = ranges[rangeIndex];
                if (range$$1.empty()) {
                  if (range$$1.head.line > end) {
                    indentLine(this, range$$1.head.line, how, true);
                    end = range$$1.head.line;
                    if (rangeIndex == this.doc.sel.primIndex) {
                      ensureCursorVisible(this);
                    }
                  }
                } else {
                  var from = range$$1.from(),
                    rangeEnd = range$$1.to(),
                    start = Math.max(end, from.line);
                  end = Math.min(this.lastLine(), rangeEnd.line - (rangeEnd.ch ? 0 : 1)) + 1;
                  for (var lineNumber = start; lineNumber < end; ++lineNumber) {
                    indentLine(this, lineNumber, how);
                  }
                  var newRanges = this.doc.sel.ranges;
                  if (
                    0 == from.ch &&
                    ranges.length == newRanges.length &&
                    newRanges[rangeIndex].from().ch > 0
                  ) {
                    replaceOneSelection(
                      this.doc,
                      rangeIndex,
                      new Range(from, newRanges[rangeIndex].to()),
                      sel_dontScroll,
                    );
                  }
                }
              }
            }),
            getTokenAt: function (position, precise) {
              return readTokenAtPosition(this, position, precise);
            },
            getLineTokens: function (line, precise) {
              return readTokenAtPosition(this, Pos(line), precise, true);
            },
            getTokenTypeAt: function (position) {
              position = clipPos(this.doc, position);
              var type,
                styles = getLineStyles(this, getLine(this.doc, position.line)),
                before = 0,
                after = (styles.length - 1) / 2,
                column = position.ch;
              if (0 == column) {
                type = styles[2];
              } else {
                for (;;) {
                  var mid = (before + after) >> 1;
                  if ((mid ? styles[2 * mid - 1] : 0) >= column) {
                    after = mid;
                  } else {
                    if (!(styles[2 * mid + 1] < column)) {
                      type = styles[2 * mid + 2];
                      break;
                    }
                    before = mid + 1;
                  }
                }
              }
              var cut = type ? type.indexOf('overlay ') : -1;
              if (cut < 0) {
                return type;
              } else {
                if (0 == cut) {
                  return null;
                } else {
                  return type.slice(0, cut - 1);
                }
              }
            },
            getModeAt: function (position) {
              var mode = this.doc.mode;
              if (mode.innerMode) {
                return CodeMirror.innerMode(mode, this.getTokenAt(position).state).mode;
              } else {
                return mode;
              }
            },
            getHelper: function (position, type) {
              return this.getHelpers(position, type)[0];
            },
            getHelpers: function (position, type) {
              var found = [];
              if (!helpers.hasOwnProperty(type)) {
                return found;
              }
              var help = helpers[type],
                mode = this.getModeAt(position);
              if ('string' == typeof mode[type]) {
                if (help[mode[type]]) {
                  found.push(help[mode[type]]);
                }
              } else {
                if (mode[type]) {
                  for (var helperIndex = 0; helperIndex < mode[type].length; helperIndex++) {
                    var val = help[mode[type][helperIndex]];
                    if (val) {
                      found.push(val);
                    }
                  }
                } else {
                  if (mode.helperType && help[mode.helperType]) {
                    found.push(help[mode.helperType]);
                  } else {
                    if (help[mode.name]) {
                      found.push(help[mode.name]);
                    }
                  }
                }
              }
              for (var i$1 = 0; i$1 < help._global.length; i$1++) {
                var cur = help._global[i$1];
                if (cur.pred(mode, this) && -1 == indexOf(found, cur.val)) {
                  found.push(cur.val);
                }
              }
              return found;
            },
            getStateAfter: function (line, precise) {
              var documentModel = this.doc;
              return getStateBefore(
                this,
                (line = clipLine(
                  documentModel,
                  null == line ? documentModel.first + documentModel.size - 1 : line,
                )) + 1,
                precise,
              );
            },
            cursorCoords: function (start, mode) {
              var range$$1 = this.doc.sel.primary();
              return cursorCoords(
                this,
                null == start
                  ? range$$1.head
                  : 'object' == typeof start
                    ? clipPos(this.doc, start)
                    : start
                      ? range$$1.from()
                      : range$$1.to(),
                mode || 'page',
              );
            },
            charCoords: function (position, mode) {
              return charCoords(this, clipPos(this.doc, position), mode || 'page');
            },
            coordsChar: function (coords, mode) {
              return coordsChar(
                this,
                (coords = fromCoordSystem(this, coords, mode || 'page')).left,
                coords.top,
              );
            },
            lineAtHeight: function (height, mode) {
              height = fromCoordSystem(this, { top: height, left: 0 }, mode || 'page').top;
              return lineAtHeight(this.doc, height + this.display.viewOffset);
            },
            heightAtLine: function (line, mode, includeWidgets) {
              var lineObj,
                end = false;
              if ('number' == typeof line) {
                var last = this.doc.first + this.doc.size - 1;
                if (line < this.doc.first) {
                  line = this.doc.first;
                } else {
                  if (line > last) {
                    line = last;
                    end = true;
                  }
                }
                lineObj = getLine(this.doc, line);
              } else {
                lineObj = line;
              }
              return (
                intoCoordSystem(
                  this,
                  lineObj,
                  { top: 0, left: 0 },
                  mode || 'page',
                  includeWidgets || end,
                ).top + (end ? this.doc.height - heightAtLine(lineObj) : 0)
              );
            },
            defaultTextHeight: function () {
              return textHeight(this.display);
            },
            defaultCharWidth: function () {
              return charWidth(this.display);
            },
            getViewport: function () {
              return { from: this.display.viewFrom, to: this.display.viewTo };
            },
            addWidget: function (position, node, scroll, vert, horiz) {
              var editor,
                widgetRect,
                scrollAdjustment,
                display = this.display,
                top = (position = cursorCoords(this, clipPos(this.doc, position))).bottom,
                left = position.left;
              node.style.position = 'absolute';
              node.setAttribute('cm-ignore-events', 'true');
              this.display.input.setUneditable(node);
              display.sizer.appendChild(node);
              if ('over' == vert) {
                top = position.top;
              } else {
                if ('above' == vert || 'near' == vert) {
                  var vspace = Math.max(display.wrapper.clientHeight, this.doc.height),
                    hspace = Math.max(display.sizer.clientWidth, display.lineSpace.clientWidth);
                  if (
                    ('above' == vert || position.bottom + node.offsetHeight > vspace) &&
                    position.top > node.offsetHeight
                  ) {
                    top = position.top - node.offsetHeight;
                  } else {
                    if (position.bottom + node.offsetHeight <= vspace) {
                      top = position.bottom;
                    }
                  }
                  if (left + node.offsetWidth > hspace) {
                    left = hspace - node.offsetWidth;
                  }
                }
              }
              node.style.top = top + 'px';
              node.style.left = node.style.right = '';
              if ('right' == horiz) {
                left = display.sizer.clientWidth - node.offsetWidth;
                node.style.right = '0px';
              } else {
                if ('left' == horiz) {
                  left = 0;
                } else {
                  if ('middle' == horiz) {
                    left = (display.sizer.clientWidth - node.offsetWidth) / 2;
                  }
                }
                node.style.left = left + 'px';
              }
              if (scroll) {
                editor = this;
                widgetRect = {
                  left: left,
                  top: top,
                  right: left + node.offsetWidth,
                  bottom: top + node.offsetHeight,
                };
                if (null != (scrollAdjustment = calculateScrollPos(editor, widgetRect)).scrollTop) {
                  updateScrollTop(editor, scrollAdjustment.scrollTop);
                }
                if (null != scrollAdjustment.scrollLeft) {
                  setScrollLeft(editor, scrollAdjustment.scrollLeft);
                }
              }
            },
            triggerOnKeyDown: methodOp(onKeyDown),
            triggerOnKeyPress: methodOp(onKeyPress),
            triggerOnKeyUp: onKeyUp,
            execCommand: function (cmd) {
              if (commands.hasOwnProperty(cmd)) {
                return commands[cmd].call(null, this);
              }
            },
            triggerElectric: methodOp(function (text) {
              triggerElectric(this, text);
            }),
            findPosH: function (from, amount, unit, visually) {
              var direction = 1;
              if (amount < 0) {
                direction = -1;
                amount = -amount;
              }
              for (
                var cur = clipPos(this.doc, from), stepIndex = 0;
                stepIndex < amount &&
                !(cur = findPosH(this.doc, cur, direction, unit, visually)).hitSide;
                ++stepIndex
              ) {}
              return cur;
            },
            moveH: methodOp(function (dir, unit) {
              var this$1 = this;
              this.extendSelectionsBy(function (range$$1) {
                if (this$1.display.shift || this$1.doc.extend || range$$1.empty()) {
                  return findPosH(
                    this$1.doc,
                    range$$1.head,
                    dir,
                    unit,
                    this$1.options.rtlMoveVisually,
                  );
                } else {
                  if (dir < 0) {
                    return range$$1.from();
                  } else {
                    return range$$1.to();
                  }
                }
              }, sel_move);
            }),
            deleteH: methodOp(function (dir, unit) {
              var selection = this.doc.sel,
                documentModel = this.doc;
              if (selection.somethingSelected()) {
                documentModel.replaceSelection('', null, '+delete');
              } else {
                deleteNearSelection(this, function (range$$1) {
                  var other = findPosH(documentModel, range$$1.head, dir, unit, false);
                  if (dir < 0) {
                    return { from: other, to: range$$1.head };
                  } else {
                    return { from: range$$1.head, to: other };
                  }
                });
              }
            }),
            findPosV: function (from, amount, unit, goalColumn) {
              var direction = 1,
                targetColumn = goalColumn;
              if (amount < 0) {
                direction = -1;
                amount = -amount;
              }
              for (
                var cur = clipPos(this.doc, from), stepIndex = 0;
                stepIndex < amount;
                ++stepIndex
              ) {
                var coords = cursorCoords(this, cur, 'div');
                if (null == targetColumn) {
                  targetColumn = coords.left;
                } else {
                  coords.left = targetColumn;
                }
                if ((cur = findPosV(this, coords, direction, unit)).hitSide) {
                  break;
                }
              }
              return cur;
            },
            moveV: methodOp(function (dir, unit) {
              var this$1 = this,
                documentModel = this.doc,
                goals = [],
                collapse =
                  !this.display.shift &&
                  !documentModel.extend &&
                  documentModel.sel.somethingSelected();
              documentModel.extendSelectionsBy(function (range$$1) {
                if (collapse) {
                  if (dir < 0) {
                    return range$$1.from();
                  } else {
                    return range$$1.to();
                  }
                }
                var headPos = cursorCoords(this$1, range$$1.head, 'div');
                if (null != range$$1.goalColumn) {
                  headPos.left = range$$1.goalColumn;
                }
                goals.push(headPos.left);
                var position = findPosV(this$1, headPos, dir, unit);
                if ('page' == unit && range$$1 == documentModel.sel.primary()) {
                  addToScrollTop(this$1, charCoords(this$1, position, 'div').top - headPos.top);
                }
                return position;
              }, sel_move);
              if (goals.length) {
                for (
                  var rangeIndex = 0;
                  rangeIndex < documentModel.sel.ranges.length;
                  rangeIndex++
                ) {
                  documentModel.sel.ranges[rangeIndex].goalColumn = goals[rangeIndex];
                }
              }
            }),
            findWordAt: function (position) {
              var line = getLine(this.doc, position.line).text,
                start = position.ch,
                end = position.ch;
              if (line) {
                var helper = this.getHelper(position, 'wordChars');
                if (('before' != position.sticky && end != line.length) || !start) {
                  ++end;
                } else {
                  --start;
                }
                for (
                  var startChar = line.charAt(start),
                    check = isWordChar(startChar, helper)
                      ? function (node) {
                          return isWordChar(node, helper);
                        }
                      : /\s/.test(startChar)
                        ? function (character) {
                            return /\s/.test(character);
                          }
                        : function (character) {
                            return !/\s/.test(character) && !isWordChar(character);
                          };
                  start > 0 && check(line.charAt(start - 1));
                ) {
                  --start;
                }
                for (; end < line.length && check(line.charAt(end)); ) {
                  ++end;
                }
              }
              return new Range(Pos(position.line, start), Pos(position.line, end));
            },
            toggleOverwrite: function (value) {
              if (!(null != value && value == this.state.overwrite)) {
                if ((this.state.overwrite = !this.state.overwrite)) {
                  addClass(this.display.cursorDiv, 'CodeMirror-overwrite');
                } else {
                  rmClass(this.display.cursorDiv, 'CodeMirror-overwrite');
                }
                signal(this, 'overwriteToggle', this, this.state.overwrite);
              }
            },
            hasFocus: function () {
              return this.display.input.getField() == activeElt();
            },
            isReadOnly: function () {
              return !(!this.options.readOnly && !this.doc.cantEdit);
            },
            scrollTo: methodOp(function (lineNumber, widget) {
              scrollToCoords(this, lineNumber, widget);
            }),
            getScrollInfo: function () {
              var scroller = this.display.scroller;
              return {
                left: scroller.scrollLeft,
                top: scroller.scrollTop,
                height: scroller.scrollHeight - scrollGap(this) - this.display.barHeight,
                width: scroller.scrollWidth - scrollGap(this) - this.display.barWidth,
                clientHeight: displayHeight(this),
                clientWidth: displayWidth(this),
              };
            },
            scrollIntoView: methodOp(function (range$$1, margin) {
              if (null == range$$1) {
                range$$1 = { from: this.doc.sel.primary().head, to: null };
                if (null == margin) {
                  margin = this.options.cursorScrollMargin;
                }
              } else {
                if ('number' == typeof range$$1) {
                  range$$1 = { from: Pos(range$$1, 0), to: null };
                } else {
                  if (null == range$$1.from) {
                    range$$1 = { from: range$$1, to: null };
                  }
                }
              }
              if (!range$$1.to) {
                range$$1.to = range$$1.from;
              }
              range$$1.margin = margin || 0;
              if (null != range$$1.from.line) {
                (function (editor, range$$1) {
                  resolveScrollToPos(editor);
                  editor.curOp.scrollToPos = range$$1;
                })(this, range$$1);
              } else {
                scrollToCoordsRange(this, range$$1.from, range$$1.to, range$$1.margin);
              }
            }),
            setSize: methodOp(function (width, height) {
              var this$1 = this,
                interpret = Object.defineProperty(
                  function (val) {
                    if ('number' == typeof val || /^\d+$/.test(String(val))) {
                      return val + 'px';
                    } else {
                      return val;
                    }
                  },
                  'name',
                  { value: 'i', configurable: true },
                );
              if (null != width) {
                this.display.wrapper.style.width = interpret(width);
              }
              if (null != height) {
                this.display.wrapper.style.height = interpret(height);
              }
              if (this.options.lineWrapping) {
                clearLineMeasurementCache(this);
              }
              var lineNo$$1 = this.display.viewFrom;
              this.doc.iter(lineNo$$1, this.display.viewTo, function (line) {
                if (line.widgets) {
                  for (var widgetIndex = 0; widgetIndex < line.widgets.length; widgetIndex++) {
                    if (line.widgets[widgetIndex].noHScroll) {
                      regLineChange(this$1, lineNo$$1, 'widget');
                      break;
                    }
                  }
                }
                ++lineNo$$1;
              });
              this.curOp.forceUpdate = true;
              signal(this, 'refresh', this);
            }),
            operation: function (operation) {
              return runInOp(this, operation);
            },
            refresh: methodOp(function () {
              var oldHeight = this.display.cachedTextHeight;
              regChange(this);
              this.curOp.forceUpdate = true;
              clearCaches(this);
              scrollToCoords(this, this.doc.scrollLeft, this.doc.scrollTop);
              updateGutterSpace(this);
              if (null == oldHeight || Math.abs(oldHeight - textHeight(this.display)) > 0.5) {
                estimateLineHeights(this);
              }
              signal(this, 'refresh', this);
            }),
            swapDoc: methodOp(function (documentModel) {
              var old = this.doc;
              old.cm = null;
              attachDoc(this, documentModel);
              clearCaches(this);
              this.display.input.reset();
              scrollToCoords(this, documentModel.scrollLeft, documentModel.scrollTop);
              this.curOp.forceScroll = true;
              signalLater(this, 'swapDoc', this, old);
              return old;
            }),
            getInputField: function () {
              return this.display.input.getField();
            },
            getWrapperElement: function () {
              return this.display.wrapper;
            },
            getScrollerElement: function () {
              return this.display.scroller;
            },
            getGutterElement: function () {
              return this.display.gutters;
            },
          };
          eventMixin(CodeMirror);
          CodeMirror.registerHelper = function (type, name, value) {
            if (!helpers.hasOwnProperty(type)) {
              helpers[type] = CodeMirror[type] = { _global: [] };
            }
            helpers[type][name] = value;
          };
          CodeMirror.registerGlobalHelper = function (type, name, predicate, value) {
            CodeMirror.registerHelper(type, name, value);
            helpers[type]._global.push({ pred: predicate, val: value });
          };
        })(CodeMirror);
        var CodeMirrorApi,
          dontDelegate = 'iter insert remove copy getEditor constructor'.split(' ');
        for (var prop in Doc.prototype) {
          if (Doc.prototype.hasOwnProperty(prop) && indexOf(dontDelegate, prop) < 0) {
            CodeMirror.prototype[prop] = (function (method) {
              return function () {
                return method.apply(this.doc, arguments);
              };
            })(Doc.prototype[prop]);
          }
        }
        eventMixin(Doc);
        CodeMirror.inputStyles = { textarea: TextareaInput, contenteditable: ContentEditableInput };
        CodeMirror.defineMode = function (name) {
          if (!(CodeMirror.defaults.mode || 'null' == name)) {
            CodeMirror.defaults.mode = name;
          }
          (function (name, mode) {
            if (arguments.length > 2) {
              mode.dependencies = Array.prototype.slice.call(arguments, 2);
            }
            modes[name] = mode;
          }).apply(this, arguments);
        };
        CodeMirror.defineMIME = function (mime, spec) {
          mimeModes[mime] = spec;
        };
        CodeMirror.defineMode('null', function () {
          return {
            token: function (stream) {
              return stream.skipToEnd();
            },
          };
        });
        CodeMirror.defineMIME('text/plain', 'null');
        CodeMirror.defineExtension = function (name, func) {
          CodeMirror.prototype[name] = func;
        };
        CodeMirror.defineDocExtension = function (name, func) {
          Doc.prototype[name] = func;
        };
        CodeMirror.fromTextArea = function (textarea, options, hostEditor, nodeId) {
          Object.defineProperty(save, 'name', { value: 'o', configurable: true });

          (options = options ? copyObj(options) : {}).value = textarea.value;
          if (!options.tabindex && textarea.tabIndex) {
            options.tabindex = textarea.tabIndex;
          }
          if (!options.placeholder && textarea.placeholder) {
            options.placeholder = textarea.placeholder;
          }
          if (null == options.autofocus) {
            var hasFocus = activeElt();
            options.autofocus =
              hasFocus == textarea ||
              (null != textarea.getAttribute('autofocus') && hasFocus == document.body);
          }
          function save() {
            textarea.value = editor.getValue();
          }
          var realSubmit;
          if (
            textarea.form &&
            (addEventHandler(textarea.form, 'submit', save), !options.leaveSubmitMethodAlone)
          ) {
            var form = textarea.form;
            realSubmit = form.submit;
            try {
              var wrappedSubmit = (form.submit = function () {
                save();
                form.submit = realSubmit;
                form.submit();
                form.submit = wrappedSubmit;
              });
            } catch (focusError) {}
          }
          options.finishInit = function (editor) {
            editor.save = save;
            editor.getTextArea = function () {
              return textarea;
            };
            editor.toTextArea = function () {
              editor.toTextArea = isNaN;
              save();
              textarea.parentNode.removeChild(editor.getWrapperElement());
              textarea.style.display = '';
              if (textarea.form) {
                off(textarea.form, 'submit', save);
                if ('function' == typeof textarea.form.submit) {
                  textarea.form.submit = realSubmit;
                }
              }
            };
          };
          textarea.style.display = 'none';
          var editor = CodeMirror(
            function (node) {
              return textarea.parentNode.insertBefore(node, textarea.nextSibling);
            },
            options,
            hostEditor,
            nodeId,
          );
          return editor;
        };
        (CodeMirrorApi = CodeMirror).off = off;
        CodeMirrorApi.on = addEventHandler;
        CodeMirrorApi.wheelEventPixels = wheelEventPixels;
        CodeMirrorApi.Doc = Doc;
        CodeMirrorApi.splitLines = splitLinesAuto;
        CodeMirrorApi.countColumn = countColumn;
        CodeMirrorApi.findColumn = findColumn;
        CodeMirrorApi.isWordChar = isWordCharBasic;
        CodeMirrorApi.Pass = Pass;
        CodeMirrorApi.signal = signal;
        CodeMirrorApi.Line = Line;
        CodeMirrorApi.changeEnd = changeEnd;
        CodeMirrorApi.scrollbarModel = scrollbarModel;
        CodeMirrorApi.Pos = Pos;
        CodeMirrorApi.cmpPos = cmp;
        CodeMirrorApi.modes = modes;
        CodeMirrorApi.mimeModes = mimeModes;
        CodeMirrorApi.resolveMode = resolveMode;
        CodeMirrorApi.getMode = getMode;
        CodeMirrorApi.modeExtensions = modeExtensions;
        CodeMirrorApi.extendMode = extendMode;
        CodeMirrorApi.copyState = copyState;
        CodeMirrorApi.startState = startState;
        CodeMirrorApi.innerMode = innerMode;
        CodeMirrorApi.commands = commands;
        CodeMirrorApi.keyMap = keyMap;
        CodeMirrorApi.keyName = keyName;
        CodeMirrorApi.isModifierKey = isModifierKey;
        CodeMirrorApi.lookupKey = lookupKey;
        CodeMirrorApi.normalizeKeyMap = normalizeKeyMap;
        CodeMirrorApi.StringStream = StringStream;
        CodeMirrorApi.SharedTextMarker = SharedTextMarker;
        CodeMirrorApi.TextMarker = TextMarker;
        CodeMirrorApi.LineWidget = LineWidget;
        CodeMirrorApi.e_preventDefault = e_preventDefault;
        CodeMirrorApi.e_stopPropagation = e_stopPropagation;
        CodeMirrorApi.e_stop = e_stop;
        CodeMirrorApi.addClass = addClass;
        CodeMirrorApi.contains = contains;
        CodeMirrorApi.rmClass = rmClass;
        CodeMirrorApi.keyNames = keyNames;
        CodeMirror.version = '5.26.0';
        return CodeMirror;
      })();
    },
  );
}
