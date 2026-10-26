// editing/keyboard-shortcuts.
export default function initializeEditingKeyboardShortcuts(
  requireModule,
  moduleExports,
  moduleRecord,
) {
  'use strict';
  Object.defineProperty(findLastIndex, 'name', { value: 'u', configurable: true });
  Object.defineProperty(sameModifiers, 'name', { value: 'h', configurable: true });
  Object.defineProperty(updateModifierStates, 'name', { value: 'f', configurable: true });
  Object.defineProperty(dispatchKeyboardEvent, 'name', { value: 'm', configurable: true });
  Object.defineProperty(registerShortcut, 'name', { value: 'g', configurable: true });
  Object.defineProperty(getCurrentScope, 'name', { value: 'v', configurable: true });
  Object.defineProperty(splitShortcuts, 'name', { value: 'y', configurable: true });
  Object.defineProperty(parseModifierCodes, 'name', { value: 'b', configurable: true });
  Object.defineProperty(listenForEvent, 'name', { value: 'w', configurable: true });

  if (!this) {
    self;
  }
  var keyIndex,
    shortcutHandlers = {},
    modifierStates = { 16: false, 18: false, 17: false, 91: false },
    currentScope = 'all',
    modifierKeyCodes = {
      '⇧': 16,
      shift: 16,
      '⌥': 18,
      alt: 18,
      option: 18,
      '⌃': 17,
      ctrl: 17,
      control: 17,
      '⌘': 91,
      command: 91,
    },
    namedKeyCodes = {
      backspace: 8,
      tab: 9,
      clear: 12,
      enter: 13,
      return: 13,
      esc: 27,
      escape: 27,
      space: 32,
      left: 37,
      up: 38,
      right: 39,
      down: 40,
      del: 46,
      delete: 46,
      home: 36,
      end: 35,
      pageup: 33,
      pagedown: 34,
      ',': 188,
      '.': 190,
      '/': 191,
      '`': 192,
      '-': 189,
      '=': 187,
      ';': 186,
      "'": 222,
      '[': 219,
      ']': 221,
      '\\': 220,
    },
    resolveKeyCode = Object.defineProperty(
      function (keyName) {
        return namedKeyCodes[keyName] || keyName.toUpperCase().charCodeAt(0);
      },
      'name',
      { value: 'c', configurable: true },
    ),
    pressedKeyCodes = [];
  for (keyIndex = 1; keyIndex < 20; keyIndex++) {
    namedKeyCodes['f' + keyIndex] = 111 + keyIndex;
  }
  function findLastIndex(values, searchValue) {
    for (var valueIndex = values.length; valueIndex--; ) {
      if (values[valueIndex] === searchValue) {
        return valueIndex;
      }
    }
    return -1;
  }
  function sameModifiers(leftModifiers, rightModifiers) {
    if (leftModifiers.length != rightModifiers.length) {
      return false;
    }
    for (var modifierIndex = 0; modifierIndex < leftModifiers.length; modifierIndex++) {
      if (leftModifiers[modifierIndex] !== rightModifiers[modifierIndex]) {
        return false;
      }
    }
    return true;
  }
  var modifierEventProperties = { 16: 'shiftKey', 18: 'altKey', 17: 'ctrlKey', 91: 'metaKey' };
  function updateModifierStates(keyboardEvent) {
    for (keyIndex in modifierStates) {
      modifierStates[keyIndex] = keyboardEvent[modifierEventProperties[keyIndex]];
    }
  }
  function dispatchKeyboardEvent(keyboardEvent) {
    var keyCode, shortcut, modifierCode, handlerIndex, modifiersMatch, activeScope;
    let keyName = keyboardEvent.key;
    keyCode = keyboardEvent.keyCode;
    if (-1 == findLastIndex(pressedKeyCodes, keyCode)) {
      pressedKeyCodes.push(keyCode);
    }
    if (!(93 != keyCode && 224 != keyCode)) {
      keyCode = 91;
    }
    if (keyCode in modifierStates) {
      for (modifierCode in ((modifierStates[keyCode] = true), modifierKeyCodes)) {
        if (modifierKeyCodes[modifierCode] == keyCode) {
          registerShortcut[modifierCode] = true;
        }
      }
      return;
    }
    updateModifierStates(keyboardEvent);
    if (!registerShortcut.filter.call(this, keyboardEvent)) {
      return;
    }
    let handlers = shortcutHandlers['/' === keyName ? keyName : keyCode];
    if (handlers) {
      for (
        activeScope = getCurrentScope(), handlerIndex = 0;
        handlerIndex < handlers.length;
        handlerIndex++
      ) {
        if ((shortcut = handlers[handlerIndex]).scope == activeScope || 'all' == shortcut.scope) {
          for (modifierCode in ((modifiersMatch = shortcut.mods.length > 0), modifierStates)) {
            if (
              (!modifierStates[modifierCode] && findLastIndex(shortcut.mods, +modifierCode) > -1) ||
              (modifierStates[modifierCode] && -1 == findLastIndex(shortcut.mods, +modifierCode))
            ) {
              modifiersMatch = false;
            }
          }
          if (
            !(
              (0 != shortcut.mods.length ||
                modifierStates[16] ||
                modifierStates[18] ||
                modifierStates[17] ||
                modifierStates[91]) &&
              !modifiersMatch
            )
          ) {
            if (false === shortcut.method(keyboardEvent, shortcut)) {
              if (keyboardEvent.preventDefault) {
                keyboardEvent.preventDefault();
              } else {
                keyboardEvent.returnValue = false;
              }
              if (keyboardEvent.stopPropagation) {
                keyboardEvent.stopPropagation();
              }
              if (keyboardEvent.cancelBubble) {
                keyboardEvent.cancelBubble = true;
              }
            }
          }
        }
      }
    }
  }
  function registerShortcut(shortcutText, scope, handler) {
    var shortcutList, modifiers;
    shortcutList = splitShortcuts((shortcutText = shortcutText.toLowerCase()));
    if (void 0 === handler) {
      handler = scope;
      scope = 'all';
    }
    for (var shortcutIndex = 0; shortcutIndex < shortcutList.length; shortcutIndex++) {
      modifiers = [];
      if ((shortcutText = shortcutList[shortcutIndex].split('+')).length > 1) {
        modifiers = parseModifierCodes(shortcutText);
        shortcutText = [shortcutText[shortcutText.length - 1]];
      }
      let keyName = (shortcutText = shortcutText[0]);
      if ('' !== keyName) {
        if (!((shortcutText = resolveKeyCode(shortcutText)) in shortcutHandlers)) {
          shortcutHandlers[shortcutText] = [];
        }
        if (!(keyName in shortcutHandlers)) {
          shortcutHandlers[keyName] = [];
        }
        shortcutHandlers[shortcutText].push({
          shortcut: shortcutList[shortcutIndex],
          scope: scope,
          method: handler,
          key: shortcutList[shortcutIndex],
          mods: modifiers,
        });
        shortcutHandlers[keyName].push({
          shortcut: shortcutList[shortcutIndex],
          scope: scope,
          method: handler,
          key: shortcutList[shortcutIndex],
          mods: modifiers,
        });
      }
    }
  }
  for (keyIndex in modifierKeyCodes) {
    registerShortcut[keyIndex] = false;
  }
  function getCurrentScope() {
    return currentScope || 'all';
  }
  function splitShortcuts(shortcutText) {
    var shortcutList;
    if (
      '' ==
      (shortcutList = (shortcutText = shortcutText.replace(/\s/g, '')).split(','))[
        shortcutList.length - 1
      ]
    ) {
      shortcutList[shortcutList.length - 2] += ',';
    }
    return shortcutList;
  }
  function parseModifierCodes(keyParts) {
    for (
      var modifiers = keyParts.slice(0, keyParts.length - 1), modifierIndex = 0;
      modifierIndex < modifiers.length;
      modifierIndex++
    ) {
      let modifierName = modifiers[modifierIndex];
      if (modifierName === 'CmdOrCtrl'.toLowerCase()) {
        modifierName = window.File.isMacOrMacNode ? 'command' : 'ctrl';
      }
      modifiers[modifierIndex] = modifierKeyCodes[modifierName];
    }
    return modifiers;
  }
  function listenForEvent(target, eventType, handler) {
    if (target.addEventListener) {
      target.addEventListener(eventType, handler, false);
    } else {
      if (target.attachEvent) {
        target.attachEvent('on' + eventType, function () {
          handler(window.event);
        });
      }
    }
  }
  listenForEvent(document, 'keydown', function (keyboardEvent) {
    dispatchKeyboardEvent(keyboardEvent);
  });
  listenForEvent(document, 'keyup', function (keyboardEvent) {
    var modifierName,
      keyCode = keyboardEvent.keyCode,
      pressedKeyIndex = findLastIndex(pressedKeyCodes, keyCode);
    if (pressedKeyIndex >= 0) {
      pressedKeyCodes.splice(pressedKeyIndex, 1);
    }
    if (!(93 != keyCode && 224 != keyCode)) {
      keyCode = 91;
    }
    if (keyCode in modifierStates) {
      for (modifierName in ((modifierStates[keyCode] = false), modifierKeyCodes)) {
        if (modifierKeyCodes[modifierName] == keyCode) {
          registerShortcut[modifierName] = false;
        }
      }
    }
  });
  listenForEvent(window, 'focus', function () {
    for (keyIndex in modifierStates) {
      modifierStates[keyIndex] = false;
    }
    for (keyIndex in modifierKeyCodes) {
      registerShortcut[keyIndex] = false;
    }
  });
  var keyboardShortcuts = registerShortcut;
  moduleRecord.exports = keyboardShortcuts;
  keyboardShortcuts.setScope = function (scope) {
    currentScope = scope || 'all';
  };
  keyboardShortcuts.getScope = getCurrentScope;
  keyboardShortcuts.deleteScope = function (scope) {
    var keyCode, handlers, handlerIndex;
    for (keyCode in shortcutHandlers) {
      for (
        handlers = shortcutHandlers[keyCode], handlerIndex = 0;
        handlerIndex < handlers.length;
      ) {
        if (handlers[handlerIndex].scope === scope) {
          handlers.splice(handlerIndex, 1);
        } else {
          handlerIndex++;
        }
      }
    }
  };
  keyboardShortcuts.filter = function (keyboardEvent) {
    return !('SELECT' == (keyboardEvent.target || keyboardEvent.srcElement).tagName);
  };
  keyboardShortcuts.isPressed = function (keyNameOrCode) {
    if ('string' == typeof keyNameOrCode) {
      keyNameOrCode = resolveKeyCode(keyNameOrCode);
    }
    return -1 != findLastIndex(pressedKeyCodes, keyNameOrCode);
  };
  keyboardShortcuts.getPressedKeyCodes = function () {
    return pressedKeyCodes.slice(0);
  };
  keyboardShortcuts.unbind = function (shortcutText, scope) {
    var shortcutList,
      keyParts,
      handlerIndex,
      shortcutIndex,
      shortcut,
      modifiers = [];
    for (
      shortcutList = splitShortcuts(shortcutText), shortcutIndex = 0;
      shortcutIndex < shortcutList.length;
      shortcutIndex++
    ) {
      if ((keyParts = shortcutList[shortcutIndex].split('+')).length > 1) {
        modifiers = parseModifierCodes(keyParts);
        shortcutText = keyParts[keyParts.length - 1];
      }
      let keyName = shortcutText;
      shortcutText = resolveKeyCode(shortcutText);
      if (void 0 === scope) {
        scope = getCurrentScope();
      }
      if (!shortcutHandlers[shortcutText]) {
        return;
      }
      for (handlerIndex in shortcutHandlers[shortcutText]) {
        if (
          (shortcut = shortcutHandlers[shortcutText][handlerIndex]).scope === scope &&
          sameModifiers(shortcut.mods, modifiers)
        ) {
          shortcutHandlers[shortcutText][handlerIndex] = {};
          shortcutHandlers[keyName][handlerIndex] = {};
        }
      }
    }
  };
  keyboardShortcuts.dispatchEvent = dispatchKeyboardEvent;
  if (void 0 !== moduleRecord) {
    moduleRecord.exports = keyboardShortcuts;
  }
  keyboardShortcuts.map = {
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
    91: 'Command',
    107: '=',
    109: '-',
    127: 'Delete',
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
  };
  keyboardShortcuts.functionKey = [
    'Command',
    'Ctrl',
    'Shift',
    'Alt',
    'Home',
    'End',
    'PageUp',
    'PageDown',
    'CapsLock',
    'Esc',
    'PrintScrn',
    'Insert',
    'Pause',
  ];
  keyboardShortcuts.isCommand = function (keyboardEvent) {
    return (
      String.fromCharCode(keyboardEvent.which).length > 0 &&
      (keyboardEvent.ctrlKey || keyboardEvent.metaKey)
    );
  };
  keyboardShortcuts.getKeySeq = function (keyboardEvent) {
    var keyParts = [];
    if (keyboardEvent.shiftKey) {
      keyParts.push('shift');
    }
    if (keyboardEvent.altKey) {
      keyParts.push('alt');
    }
    if (keyboardEvent.ctrlKey) {
      keyParts.push('ctrl');
    }
    if (keyboardEvent.metaKey) {
      keyParts.push('command');
    }
    var keyName = keyboardEvent.key;
    if (-1 == ['Shift', 'Alt', 'Control', 'Meta'].indexOf(keyName)) {
      keyParts.push(keyName.toLowerCase());
    }
    return keyParts.join('+');
  };
  keyboardShortcuts.isKeySeq = function (keyboardEvent, shortcutText) {
    return (
      keyboardShortcuts
        .getKeySeq(keyboardEvent)
        .split('+')
        .sort()
        .map((keyPart) => keyPart.replace('arrow', ''))
        .join('+') ===
      shortcutText
        .split('+')
        .sort()
        .map((keyPart) => keyPart.trim().toLowerCase().replace('arrow', ''))
        .join('+')
    );
  };
}
