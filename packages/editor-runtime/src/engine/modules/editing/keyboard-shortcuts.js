// editing/keyboard-shortcuts.
// SystemJS module 27. Dependencies: none.
$__System.registerDynamic('27', [], !0, function (e, t, n) {
  'use strict';
  this || self;
  var i,
    r = {},
    o = { 16: !1, 18: !1, 17: !1, 91: !1 },
    a = 'all',
    s = {
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
    l = {
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
    c = function (e) {
      return l[e] || e.toUpperCase().charCodeAt(0);
    },
    d = [];
  for (i = 1; i < 20; i++) l['f' + i] = 111 + i;
  function u(e, t) {
    for (var n = e.length; n--; ) if (e[n] === t) return n;
    return -1;
  }
  function h(e, t) {
    if (e.length != t.length) return !1;
    for (var n = 0; n < e.length; n++) if (e[n] !== t[n]) return !1;
    return !0;
  }
  var p = { 16: 'shiftKey', 18: 'altKey', 17: 'ctrlKey', 91: 'metaKey' };
  function f(e) {
    for (i in o) o[i] = e[p[i]];
  }
  function m(e) {
    var t, n, i, a, l, c;
    let h = e.key;
    if (((t = e.keyCode), -1 == u(d, t) && d.push(t), (93 != t && 224 != t) || (t = 91), t in o)) {
      for (i in ((o[t] = !0), s)) s[i] == t && (g[i] = !0);
      return;
    }
    if ((f(e), !g.filter.call(this, e))) return;
    let p = r['/' === h ? h : t];
    if (p)
      for (c = v(), a = 0; a < p.length; a++)
        if ((n = p[a]).scope == c || 'all' == n.scope) {
          for (i in ((l = n.mods.length > 0), o))
            ((!o[i] && u(n.mods, +i) > -1) || (o[i] && -1 == u(n.mods, +i))) && (l = !1);
          ((0 != n.mods.length || o[16] || o[18] || o[17] || o[91]) && !l) ||
            (!1 === n.method(e, n) &&
              (e.preventDefault ? e.preventDefault() : (e.returnValue = !1),
              e.stopPropagation && e.stopPropagation(),
              e.cancelBubble && (e.cancelBubble = !0)));
        }
  }
  function g(e, t, n) {
    var i, o;
    (i = y((e = e.toLowerCase()))), void 0 === n && ((n = t), (t = 'all'));
    for (var a = 0; a < i.length; a++) {
      (o = []), (e = i[a].split('+')).length > 1 && ((o = b(e)), (e = [e[e.length - 1]]));
      let s = (e = e[0]);
      '' !== s &&
        ((e = c(e)) in r || (r[e] = []),
        s in r || (r[s] = []),
        r[e].push({ shortcut: i[a], scope: t, method: n, key: i[a], mods: o }),
        r[s].push({ shortcut: i[a], scope: t, method: n, key: i[a], mods: o }));
    }
  }
  for (i in s) g[i] = !1;
  function v() {
    return a || 'all';
  }
  function y(e) {
    var t;
    return (
      '' == (t = (e = e.replace(/\s/g, '')).split(','))[t.length - 1] && (t[t.length - 2] += ','), t
    );
  }
  function b(e) {
    for (var t = e.slice(0, e.length - 1), n = 0; n < t.length; n++) {
      let e = t[n];
      e === 'CmdOrCtrl'.toLowerCase() && (e = window.File.isMacOrMacNode ? 'command' : 'ctrl'),
        (t[n] = s[e]);
    }
    return t;
  }
  function w(e, t, n) {
    e.addEventListener
      ? e.addEventListener(t, n, !1)
      : e.attachEvent &&
        e.attachEvent('on' + t, function () {
          n(window.event);
        });
  }
  w(document, 'keydown', function (e) {
    m(e);
  }),
    w(document, 'keyup', function (e) {
      var t,
        n = e.keyCode,
        i = u(d, n);
      if ((i >= 0 && d.splice(i, 1), (93 != n && 224 != n) || (n = 91), n in o))
        for (t in ((o[n] = !1), s)) s[t] == n && (g[t] = !1);
    }),
    w(window, 'focus', function () {
      for (i in o) o[i] = !1;
      for (i in s) g[i] = !1;
    });
  var x = g;
  (n.exports = x),
    (x.setScope = function (e) {
      a = e || 'all';
    }),
    (x.getScope = v),
    (x.deleteScope = function (e) {
      var t, n, i;
      for (t in r) for (n = r[t], i = 0; i < n.length; ) n[i].scope === e ? n.splice(i, 1) : i++;
    }),
    (x.filter = function (e) {
      return !('SELECT' == (e.target || e.srcElement).tagName);
    }),
    (x.isPressed = function (e) {
      return 'string' == typeof e && (e = c(e)), -1 != u(d, e);
    }),
    (x.getPressedKeyCodes = function () {
      return d.slice(0);
    }),
    (x.unbind = function (e, t) {
      var n,
        i,
        o,
        a,
        s,
        l = [];
      for (n = y(e), a = 0; a < n.length; a++) {
        (i = n[a].split('+')).length > 1 && ((l = b(i)), (e = i[i.length - 1]));
        let d = e;
        if (((e = c(e)), void 0 === t && (t = v()), !r[e])) return;
        for (o in r[e])
          (s = r[e][o]).scope === t && h(s.mods, l) && ((r[e][o] = {}), (r[d][o] = {}));
      }
    }),
    (x.dispatchEvent = m),
    void 0 !== n && (n.exports = x);
  (x.map = {
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
  }),
    (x.functionKey = [
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
    ]),
    (x.isCommand = function (e) {
      return String.fromCharCode(e.which).length > 0 && (e.ctrlKey || e.metaKey);
    }),
    (x.getKeySeq = function (e) {
      var t = [];
      e.shiftKey && t.push('shift'),
        e.altKey && t.push('alt'),
        e.ctrlKey && t.push('ctrl'),
        e.metaKey && t.push('command');
      var n = e.key;
      return (
        -1 == ['Shift', 'Alt', 'Control', 'Meta'].indexOf(n) && t.push(n.toLowerCase()), t.join('+')
      );
    }),
    (x.isKeySeq = function (e, t) {
      return (
        x
          .getKeySeq(e)
          .split('+')
          .sort()
          .map((e) => e.replace('arrow', ''))
          .join('+') ===
        t
          .split('+')
          .sort()
          .map((e) => e.trim().toLowerCase().replace('arrow', ''))
          .join('+')
      );
    });
});
