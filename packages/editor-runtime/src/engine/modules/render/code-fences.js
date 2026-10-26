// render/code-fences.
export default function initializeRenderCodeFences(requireModule, moduleExports, moduleRecord) {
  'use strict';

  if (!this) {
    self;
  }
  var CodeMirror = requireModule('libraries/codemirror'),
    utilities = requireModule('shared/utilities'),
    jquery = requireModule('libraries/jquery'),
    documentModel = (requireModule('editing/autocomplete'), requireModule('model/document-model')),
    keyboardShortcuts = requireModule('editing/keyboard-shortcuts'),
    diagrams = (requireModule('editing/undo-manager'), requireModule('render/diagrams')),
    mathBlocks = requireModule('render/math-blocks'),
    map = keyboardShortcuts.map;
  Node = documentModel.Node;
  requireModule('codemirror/editor-extensions');
  var ALL = [
      'js',
      'javascript',
      'java',
      'json',
      'typescript',
      'ts',
      'clojure',
      'coffeescript',
      'css',
      'less',
      'scss',
      'gfm',
      'markdown',
      'xaml',
      'xml',
      'haskell',
      'html',
      'lua',
      'lisp',
      'commonlisp',
      'pascal',
      'perl',
      'perl6',
      'php',
      'php+HTML',
      'python',
      'cython',
      'ruby',
      'shell',
      'sh',
      'sql',
      'sqlite',
      'mssql',
      'mysql',
      'CQL',
      'mariadb',
      'cassandra',
      'plsql',
      'tiddlywiki',
      'wiki',
      'vb',
      'basic',
      'visual basic',
      'vbscript',
      'velocity',
      'verilog',
      'xquery',
      'yaml',
      'go',
      'groovy',
      'nginx',
      'octave',
      'c',
      'clike',
      'c++',
      'cpp',
      'objc',
      'objective-c',
      'csharp',
      'c#',
      'squirrel',
      'ceylon',
      'kotlin',
      'tex',
      'latex',
      'swift',
      'scala',
      'R',
      'D',
      'diff',
      'erlang',
      'http',
      'jade',
      'rst',
      'rust',
      'jinja2',
      'reStructuredText',
      'asp',
      'jsp',
      'erb',
      'ejs',
      'embeddedjs',
      'powershell',
      'dockerfile',
      'jsx',
      'tsx',
      'react',
      'vue',
      'nsis',
      'mathematica',
      'tiki wiki',
      'properties',
      'ini',
      'livescript',
      'assembly',
      'gas',
      'toml',
      'matlab',
      'ocaml',
      'F#',
      'fsharp',
      'elm',
      'pgp',
      'asciiarmor',
      'spreadsheet',
      'elixir',
      'cmake',
      'cypher',
      'dart',
      'django',
      'dtd',
      'xml-dtd',
      'dylan',
      'handlebars',
      'idl',
      'web-idl',
      'yacas',
      'mbox',
      'vhdl',
      'julia',
      'haxe',
      'hxml',
      'fortran',
      'protobuf',
      'makefile',
      'tcl',
      'scheme',
      'twig',
      'bash',
      'SAS',
      'pseudocode',
      'stylus',
      'cobol',
      'oz',
      'SPARQL',
      'crystal',
      'ASN.1',
      'gherkin',
      'smalltalk',
      'turtle',
      'glsl',
      'apl',
      'ABAP',
      'q',
      'v',
      'forth',
      'nim',
      'solidity',
      'htaccess',
      'postgresql',
      'hive',
      'stata',
      'systemverilog',
      'smarty',
      'yara',
      'pug',
      'svelte',
      'pegjs',
      'cmd',
      'bat',
      'modelica',
      'structured text',
      'url',
    ].sort((text, inputText) => text.toLowerCase().localeCompare(inputText.toLowerCase())),
    languageIconMarkup = {
      clojure:
        '<span class="path1"></span><span class="path2"></span><span class="path3"></span><span class="path4"></span><span class="path5"></span>',
      ceylon: '<span class="path1"></span><span class="path2"></span>',
      dart: '<span class="path1"></span><span class="path2"></span><span class="path3"></span><span class="path4"></span>',
      fsharp: '<span class="path1"></span><span class="path2"></span><span class="path3"></span>',
      cmake: '<span class="path1"></span><span class="path2"></span><span class="path3"></span>',
      cython:
        '<span class="path1"></span><span class="path2"></span><span class="path3"></span><span class="path4"></span>',
      dockerfile:
        '<span class="path1"></span><span class="path2"></span><span class="path3"></span><span class="path4"></span>',
      elm: '<span class="path1"></span><span class="path2"></span><span class="path3"></span><span class="path4"></span><span class="path5"></span><span class="path6"></span><span class="path7"></span>',
      haskell: '<span class="path1"></span><span class="path2"></span><span class="path3"></span>',
      haxe: '<span class="path1"></span><span class="path2"></span><span class="path3"></span><span class="path4"></span><span class="path5"></span><span class="path6"></span><span class="path7"></span><span class="path8"></span><span class="path9"></span><span class="path10"></span><span class="path11"></span><span class="path12"></span><span class="path13"></span>',
      julia: '<span class="path1"></span><span class="path2"></span><span class="path3"></span>',
      jsp: '<span class="path1"></span><span class="path2"></span><span class="path3"></span><span class="path4"></span>',
      matlab: '<span class="path1"></span><span class="path2"></span><span class="path3"></span>',
      python: '<span class="path1"></span><span class="path2"></span>',
      protobuf:
        '<span class="path1"></span><span class="path2"></span><span class="path3"></span><span class="path4"></span><span class="path5"></span><span class="path6"></span><span class="path7"></span><span class="path8"></span>',
      vue: '<span class="path1"></span><span class="path2"></span>',
      sparql: '<span class="path1"></span><span class="path2"></span>',
      squirrel:
        '<span class="path1"></span><span class="path2"></span><span class="path3"></span><span class="path4"></span><span class="path5"></span><span class="path6"></span><span class="path7"></span><span class="path8"></span><span class="path9"></span>',
      xquery: '<span class="path1"></span><span class="path2"></span>',
      v: '<span class="path1"></span><span class="path2"></span>',
      toml: '<span class="path1"></span><span class="path2"></span><span class="path3"></span>',
      vhdl: '<span class="path1"></span><span class="path2"></span>',
      wiki: '<span class="path1"></span><span class="path2"></span><span class="path3"></span><span class="path4"></span><span class="path5"></span><span class="path6"></span><span class="path7"></span><span class="path8"></span><span class="path9"></span><span class="path10"></span><span class="path11"></span><span class="path12"></span><span class="path13"></span><span class="path14"></span><span class="path15"></span><span class="path16"></span><span class="path17"></span><span class="path18"></span><span class="path19"></span><span class="path20"></span><span class="path21"></span><span class="path22"></span><span class="path23"></span><span class="path24"></span><span class="path25"></span><span class="path26"></span><span class="path27"></span><span class="path28"></span><span class="path29"></span><span class="path30"></span><span class="path31"></span><span class="path32"></span><span class="path33"></span>',
    },
    languageIconAliases = {
      js: 'javascript',
      'c#': 'csharp',
      'c++': 'cpp',
      'objective-c': 'objectivec',
      'php+HTML': 'php',
      latex: 'tex',
      math: 'tex',
      zsh: 'console',
      bash: 'console',
      cmd: 'console',
      bat: 'console',
      sh: 'console',
      shell: 'console',
      jsx: 'react',
      asciiarmor: 'key',
      pgp: 'key',
      sql: 'database',
      sqlite: 'database',
      mssql: 'database',
      mysql: 'database',
      postgresql: 'database',
      hive: 'database',
      stata: 'database',
      CQL: 'database',
      mariadb: 'database',
      cassandra: 'database',
      plsql: 'database',
      clike: 'c',
      coffeescript: 'coffee',
      'F#': 'fsharp',
      commonlisp: 'lisp',
      cypher: 'database',
      dtd: 'xml',
      D: 'd',
      embeddedjs: 'ejs',
      gfm: 'markdown',
      gas: 'assembly',
      flow: 'none',
      hxml: 'haxe',
      jinja2: 'jinja',
      mbox: 'email',
      nsis: 'makefile',
      objc: 'objectivec',
      octave: 'matlab',
      Q: 'q',
      perl6: 'perl',
      properties: 'ini',
      SAS: 'sas',
      spreadsheet: 'table',
      SPARQL: 'sparql',
      R: 'r',
      tsx: 'typescript',
      ts: 'typescript',
      basic: 'vb',
      vbscript: 'vb',
      'visual basic': 'vb',
      'xml-dtd': 'xml',
      tiddlywiki: 'wiki',
      'tiki wiki': 'wiki',
      mermaid: 'diagram',
      flow: 'diagram',
      sequence: 'diagram',
      htaccess: 'credits',
      ABAP: 'credits',
      'ASN.1': 'credits',
      dylan: 'credits',
      gherkin: 'credits',
      idl: 'credits',
      jade: 'credits',
      mathematica: 'credits',
      oz: 'credits',
      pascal: 'credits',
      pseudocode: 'credits',
      rst: 'credits',
      reStructuredText: 'credits',
      turtle: 'credits',
      'web-idl': 'credits',
      yacas: 'credits',
      systemverilog: 'verilog',
      smalltalk: 'credits',
      yara: 'credits',
      pug: 'credits',
      pegjs: 'credits',
      modelica: 'credits',
      'structured text': 'credits',
      url: 'http',
    };
  for (var languageName of ALL) {
    languageIconAliases[languageName] = languageIconAliases[languageName] || languageName;
  }
  !(function (codeMirrorModule) {
    var delLineLeft = codeMirrorModule.commands.delLineLeft;
    codeMirrorModule.commands.delLineLeft = function (codeMirror) {
      try {
        if (0 == codeMirror.getCursor().ch) {
          return codeMirrorModule.commands.delCharBefore(codeMirror);
        } else {
          return delLineLeft(codeMirror);
        }
      } catch (error) {}
    };
  })(CodeMirror);
  var bindLanguageInput = function (languageInput, documentNode) {
    var receiver = this;
    languageInput
      .on('change blur', function () {
        if (this.textContent != documentNode.get('lang')) {
          receiver.tryAddLangUndo(documentNode, this);
        }
      })
      .keydown(function (keyboardEvent) {
        var keyCode = keyboardEvent.which || keyboardEvent.keyCode;
        if ('Enter' == map[keyCode]) {
          jquery(this).trigger('change');
        }
      })
      .focus(function () {
        if (File.isMac) {
          bridge.callHandler('touchBar.setFencesOnSetLang', true);
        }
      })
      .on('keydown', function (keyboardEvent) {
        var range,
          keyCode = keyboardEvent.keyCode || keyboardEvent.which;
        if ('Delete' == map[keyCode]) {
          if (
            !(range = receiver.editor.selection.getRangy()) ||
            range.commonAncestorContainer.parentElement != this
          ) {
            return false;
          }
          if (
            range.commonAncestorContainer == this ||
            (range.startOffset == range.endOffset && range.endOffset == this.textContent.length)
          ) {
            receiver.editor.selection.moveUpOrDown(false);
            return false;
          }
        } else {
          if ('Backspace' == map[keyCode]) {
            if (
              !(range = receiver.editor.selection.getRangy()) ||
              range.commonAncestorContainer.parentElement != this
            ) {
              return false;
            }
            if (
              range.commonAncestorContainer == this ||
              (range.startOffset == range.endOffset && 0 == range.startOffset)
            ) {
              receiver.editor.selection.moveUpOrDown(true);
              return false;
            }
          } else {
            if ('Return' == map[keyCode] || 'Enter' == map[keyCode]) {
              if (!receiver.editor.autoComplete.isShown()) {
                receiver.editor.selection.moveUpOrDown(false);
              }
              return false;
            }
          }
        }
      })
      .on('paste', function (inputEvent) {
        setTimeout(function () {
          inputEvent.target.textContent = inputEvent.target.textContent
            .replace(/(^\n+)|(\n+$)/g, '')
            .split(/\r?\n/)[0];
          jquery(inputEvent.target).trigger('change');
        }, 0);
      })
      .on('input', function (unusedParameter1) {
        if (this.querySelector(':not(br)')) {
          this.textContent = this.textContent.replace(/(^\n+)|(\n+$)/g, '');
        }
      });
    this.editor.autoComplete.show(ALL, languageInput[0], void 0, {
      type: 'fences',
      render: this.autoCompleteRender,
    });
  };
  function resolveCodeMirrorMode(language, nameOnly, canonicalLanguage) {
    if (language) {
      switch (language) {
        case 'javascript':
        case 'text/javascript':
        case 'js':
          return (language = 'javascript');
        case 'json':
        case 'json5':
          if (nameOnly) {
            return language;
          } else {
            return (language = { name: 'javascript', json: true });
          }
        case 'jsonld':
        case 'json-ld':
          if (nameOnly) {
            return language;
          } else {
            return 'application/ld+json';
          }
        case 'text/typescript':
        case 'typescript':
        case 'ts':
          if (nameOnly) {
            return 'typescript';
          } else {
            return (language = { name: 'javascript', typescript: true });
          }
        case 'arkts':
          if (nameOnly) {
            return 'arkts';
          } else {
            return (language = { name: 'javascript', typescript: true });
          }
        case 'clojure':
          return language;
        case 'coffee':
        case 'coffeescript':
        case 'css':
          return language;
        case 'less':
          if (nameOnly) {
            return 'less';
          } else {
            return 'text/x-less';
          }
        case 'scss':
          if (nameOnly) {
            return 'scss';
          } else {
            return (language = 'text/x-scss');
          }
        case 'gfm':
        case 'github flavored markdown':
          return (language = 'gfm');
        case 'markdown':
        case 'md':
        case 'mkd':
          return language;
        case 'xml':
        case 'xaml':
        case 'mjml':
        case 'xul':
        case 'enml':
          if (nameOnly) {
            return language;
          } else {
            return 'xml';
          }
        case 'haskell':
          return language;
        case 'htmlmixed':
        case 'html':
        case 'html4':
        case 'html5':
        case 'xhtml':
        case 'svg':
        case 'epub':
          if (nameOnly) {
            if (/^html/.exec(language)) {
              return 'html';
            } else {
              return language;
            }
          } else {
            return (language = 'htmlmixed');
          }
        case 'lua':
          return language;
        case 'lisp':
        case 'commonlisp':
        case 'common lisp':
          return (language = 'commonlisp');
        case 'pascal':
          return language;
        case 'perl':
        case 'perl5':
        case 'perl4':
        case 'perl3':
        case 'perl2':
          return 'perl';
        case 'perl6':
          return language;
        case 'php+html':
          if (nameOnly) {
            return 'php';
          } else {
            return 'application/x-httpd-php';
          }
        case 'php':
        case 'php3':
        case 'php4':
        case 'php5':
        case 'php6':
          if (nameOnly) {
            return language;
          } else {
            return 'text/x-php';
          }
        case 'cython':
          if (nameOnly) {
            return language;
          } else {
            return (language = 'text/x-cython');
          }
        case 'py':
        case 'py2':
        case 'py3':
          language = 'python';
        case 'python2':
        case 'python3':
        case 'python':
          if (nameOnly) {
            return language;
          } else {
            return (language = 'text/x-python');
          }
        case 'terraform':
          if (nameOnly) {
            return language;
          } else {
            return 'ruby';
          }
        case 'ruby':
          return language;
        case 'shell':
        case 'sh':
        case 'zsh':
        case 'bash':
        case 'terminal':
          if (canonicalLanguage) {
            return 'bash';
          } else {
            return (language = 'shell');
          }
        case 'sql':
          if (nameOnly) {
            return language;
          } else {
            return (language = 'text/x-mariadb');
          }
        case 'sql lite':
        case 'sqlite':
          if (nameOnly) {
            return language;
          } else {
            return (language = 'text/x-sql');
          }
        case 'mssql':
          if (nameOnly) {
            return language;
          } else {
            return (language = 'text/x-mssql');
          }
        case 'mysql':
          if (nameOnly) {
            return language;
          } else {
            return (language = 'text/x-mysql');
          }
        case 'pgsql':
        case 'postgresql':
          if (nameOnly) {
            return 'postgresql';
          } else {
            return (language = 'text/x-pgsql');
          }
        case 'hive':
          if (nameOnly) {
            return language;
          } else {
            return (language = 'text/x-hive');
          }
        case 'esper':
          if (nameOnly) {
            return language;
          } else {
            return (language = 'text/x-esper');
          }
        case 'mariadb':
          if (nameOnly) {
            return language;
          } else {
            return (language = 'text/x-mariadb');
          }
        case 'cassandra':
        case 'cql':
          if (nameOnly) {
            return language;
          } else {
            return (language = 'text/x-cassandra');
          }
        case 'plsql':
          if (nameOnly) {
            return language;
          } else {
            return (language = 'text/x-plsql');
          }
        case 'greenplum':
        case 'greenplum-db':
        case 'gpsql':
          if (nameOnly) {
            return language;
          } else {
            return (language = 'text/x-gpsql');
          }
        case 'sparksql':
        case 'spark-sql':
        case 'spark sql':
          if (nameOnly) {
            return language;
          } else {
            return (language = 'text/x-sparksql');
          }
        // biome-ignore lint/suspicious/noDuplicateCase: Preserve the existing language dispatch order during source conversion.
        case 'esper':
          if (nameOnly) {
            return language;
          } else {
            return (language = 'text/x-esper');
          }
        case 'stex':
        case 'tex':
        case 'latex':
        case 'math':
          if (nameOnly) {
            return language;
          } else {
            return 'text/x-stex';
          }
        case 'tiddlywiki':
        case 'wiki':
          if (nameOnly) {
            return language;
          } else {
            return (language = 'tiddlywiki');
          }
        case 'vb':
        case 'visual basic':
        case 'visualbasic':
        case 'basic':
          if (nameOnly) {
            return language;
          } else {
            return (language = 'vb');
          }
        case 'vbscript':
        case 'velocity':
          return language;
        case 'verilog':
          if (nameOnly) {
            return language;
          } else {
            return (language = 'text/x-verilog');
          }
        case 'systemverilog':
          if (nameOnly) {
            return language;
          } else {
            return (language = 'text/x-systemverilog');
          }
        case 'xquery':
          return language;
        case 'yaml':
        case 'yml':
          if (nameOnly) {
            return language;
          } else {
            return 'yaml';
          }
        case 'go':
        case 'golang':
        case 'go-lang':
          return 'go';
        case 'groovy':
        case 'nginx':
          return language;
        case 'octave':
        case 'matlab':
          if (nameOnly) {
            return language;
          } else {
            return 'text/x-octave';
          }
        case 'c':
        case 'clike':
        case 'csrc':
          if (nameOnly) {
            return language;
          } else {
            return (language = 'text/x-csrc');
          }
        case 'c++':
        case 'c++src':
        case 'cpp':
        case 'cc':
        case 'hpp':
        case 'h++':
        case 'h':
          if (nameOnly) {
            return language;
          } else {
            return (language = 'text/x-c++src');
          }
        case 'obj-c':
        case 'objc':
        case 'objective c':
        case 'objective-c':
        case 'objectivec':
          if (nameOnly) {
            return language;
          } else {
            return (language = 'text/x-objectivec');
          }
        case 'text/x-scala':
        case 'scala':
          if (nameOnly) {
            return language;
          } else {
            return (language = 'text/x-scala');
          }
        case 'csharp':
        case 'c#':
        case 'cs':
          if (nameOnly) {
            return language;
          } else {
            return (language = 'text/x-csharp');
          }
        case 'java':
          if (nameOnly) {
            return language;
          } else {
            return (language = 'text/x-java');
          }
        case 'squirrel':
          if (nameOnly) {
            return language;
          } else {
            return (language = 'text/x-squirrel');
          }
        case 'ceylon':
          if (nameOnly) {
            return language;
          } else {
            return (language = 'text/x-ceylon');
          }
        case 'kotlin':
          if (nameOnly) {
            return language;
          } else {
            return (language = 'text/x-kotlin');
          }
        case 'swift':
        case 'swiftui':
          return (language = 'swift');
        case 'r':
        case 'rlang':
        case 'r-lang':
          if (nameOnly) {
            return language;
          } else {
            return (language = 'text/x-rsrc');
          }
        case 'd':
        case 'dlang':
        case 'd-lang':
        case 'diff':
        case 'erlang':
        case 'http':
        case 'jade':
          return language;
        case 'rst':
        case 'restructuredtext':
          return (language = 'rst');
        case 'rust':
          return language;
        case 'jinja':
          if (nameOnly) {
            return language;
          } else {
            return 'jinja2';
          }
        case 'jinja2':
          return language;
        case 'aspx':
        case 'asp':
        case 'asp.net':
          if (nameOnly) {
            return language;
          } else {
            return (language = 'application/x-aspx');
          }
        case 'jsp':
          if (nameOnly) {
            return language;
          } else {
            return (language = 'application/x-jsp');
          }
        case 'erb':
          if (nameOnly) {
            return language;
          } else {
            return (language = 'application/x-erb');
          }
        case 'ejs':
        case 'embeddedjs':
        case 'embedded javaScript':
          if (nameOnly) {
            return language;
          } else {
            return (language = 'application/x-ejs');
          }
        case 'powershell':
        case 'bat':
        case 'batch':
        case 'cmd':
          if (nameOnly) {
            return language;
          } else {
            return 'application/x-powershell';
          }
        case 'docker':
        case 'dockerfile':
          if (nameOnly) {
            return language;
          } else {
            return 'text/x-dockerfile';
          }
        case 'jsx':
        case 'react':
          if (nameOnly) {
            return language;
          } else {
            return 'text/jsx';
          }
        case 'tsx':
          if (nameOnly) {
            return language;
          } else {
            return 'text/typescript-jsx';
          }
        case 'vue.js':
        case 'vue':
        case 'vue-template':
          if (nameOnly) {
            return language;
          } else {
            return 'script/x-vue';
          }
        case 'nsis':
          if (nameOnly) {
            return language;
          } else {
            return 'text/x-nsis';
          }
        case 'mathematica':
          if (nameOnly) {
            return language;
          } else {
            return 'text/x-mathematica';
          }
        case 'tiki':
        case 'tiki wiki':
        case 'tiki-wiki':
        case 'tikiwiki':
          return 'tiki';
        case 'properties':
        case 'ini':
          if (nameOnly) {
            return language;
          } else {
            return 'text/x-properties';
          }
        case 'livescript':
          if (nameOnly) {
            return language;
          } else {
            return 'text/x-livescript';
          }
        case 'asm':
        case 'assembly':
        case 'nasm':
          if (nameOnly) {
            return language;
          } else {
            return 'assembly';
          }
        case 'gas':
          return language;
        case 'toml':
          if (nameOnly) {
            return language;
          } else {
            return 'text/x-toml';
          }
        case 'sequence':
          return 'sequence';
        case 'flow':
        case 'flowchart':
          return 'flow';
        case 'mermaid':
          return 'mermaid';
        case 'ocaml':
          if (nameOnly) {
            return language;
          } else {
            return 'text/x-ocaml';
          }
        case 'f#':
        case 'fsharp':
          if (nameOnly) {
            return language;
          } else {
            return 'text/x-fsharp';
          }
        case 'elm':
          if (nameOnly) {
            return language;
          } else {
            return 'text/x-elm';
          }
        case 'pgp':
        case 'pgp-keys':
        case 'pgp-key':
        case 'pgp-signature':
        case 'asciiarmor':
        case 'ascii-armor':
        case 'ascii armor':
          if (nameOnly) {
            return language;
          } else {
            return 'application/pgp';
          }
        case 'spreadsheet':
        case 'excel':
          if (nameOnly) {
            return language;
          } else {
            return 'text/x-spreadsheet';
          }
        case 'elixir':
          return 'elixir';
        case 'cmake':
          if (nameOnly) {
            return language;
          } else {
            return 'text/x-cmake';
          }
        case 'cypher':
        case 'cypher-query':
          if (nameOnly) {
            return language;
          } else {
            return 'application/x-cypher-query';
          }
        case 'dart':
          return 'dart';
        case 'django':
          if (nameOnly) {
            return language;
          } else {
            return 'text/x-django';
          }
        case 'dtd':
        case 'xml-dtd':
        case 'xml dtd':
        case 'xmldtd':
          if (nameOnly) {
            return language;
          } else {
            return 'application/xml-dtd';
          }
        case 'dylan':
          if (nameOnly) {
            return language;
          } else {
            return 'text/x-dylan';
          }
        case 'handlebars':
        case 'svelte':
          if (nameOnly) {
            return language;
          } else {
            return { name: 'handlebars', base: 'text/html' };
          }
        case 'idl':
          if (nameOnly) {
            return language;
          } else {
            return 'text/x-idl';
          }
        case 'webidl':
        case 'web-idl':
        case 'web idl':
          if (nameOnly) {
            return language;
          } else {
            return 'text/x-webidl';
          }
        case 'yacas':
          if (nameOnly) {
            return language;
          } else {
            return 'text/x-yacas';
          }
        case 'mbox':
          if (nameOnly) {
            return language;
          } else {
            return 'application/mbox';
          }
        case 'vhdl':
          if (nameOnly) {
            return language;
          } else {
            return 'text/x-vhdl';
          }
        case 'julia':
          return 'julia';
        case 'haxe':
          if (nameOnly) {
            return language;
          } else {
            return 'text/x-haxe';
          }
        case 'hxml':
          if (nameOnly) {
            return language;
          } else {
            return 'text/x-hxml';
          }
        case 'fortran':
          if (nameOnly) {
            return language;
          } else {
            return 'text/x-fortran';
          }
        case 'protobuf':
          if (nameOnly) {
            return language;
          } else {
            return 'text/x-protobuf';
          }
        case 'makefile':
          if (nameOnly) {
            return language;
          } else {
            return 'text/x-makefile';
          }
        case 'tcl':
          if (nameOnly) {
            return language;
          } else {
            return 'text/x-tcl';
          }
        case 'scheme':
          if (nameOnly) {
            return language;
          } else {
            return 'text/x-scheme';
          }
        case 'twig':
          if (nameOnly) {
            return language;
          } else {
            return 'text/x-twig';
          }
        case 'sas':
          if (nameOnly) {
            return language;
          } else {
            return 'text/x-sas';
          }
        case 'pseudocode':
          if (nameOnly) {
            return language;
          } else {
            return 'text/x-pseudocode';
          }
        // biome-ignore lint/suspicious/noDuplicateCase: Preserve the existing language dispatch order during source conversion.
        case 'julia':
        case 'text/x-julia':
        case 'stylus':
        case 'cobol':
        case 'oz':
        case 'sparql':
        case 'crystal':
          return language;
        case 'asn.1':
          if (nameOnly) {
            return 'ASN.1';
          } else {
            return (language = 'text/x-ttcn-asn');
          }
        case 'gherkin':
        case 'smalltalk':
        case 'turtle':
          return language;
        case 'glsl':
        case 'Open GL Shading Language':
          return (language = 'glsl');
        case 'apl':
        case 'abap':
          return language;
        case 'q':
        case 'qlang':
        case 'q-lang':
          if (nameOnly) {
            return language;
          } else {
            return 'text/x-q';
          }
        case 'v':
        case 'vlang':
        case 'v-lang':
          return 'v';
        case 'forth':
          return language;
        case 'nim':
        case 'nimrod':
          if (nameOnly) {
            return language;
          } else {
            return 'nimrod';
          }
        case 'solidity':
          return language;
        case 'htaccess':
        case '.htaccess':
          if (nameOnly) {
            return 'htaccess';
          }
        case 'apache':
          return 'apache';
        case 'stata':
          return language;
        case 'smarty':
        case 'smarty2':
          if (nameOnly) {
            return language;
          } else {
            return 'smarty';
          }
        case 'smarty3':
          if (nameOnly) {
            return language;
          } else {
            return { name: 'smarty', verson: 3 };
          }
        case 'yara':
        case 'pug':
          return language;
        case 'pegjs':
        case 'peg-js':
        case 'peg.js':
          return 'pegjs';
        case 'plc':
        case 'st':
        case 'stx':
        case 'structured text':
        case 'structured-text':
          if (nameOnly) {
            return language;
          } else {
            return 'pascal';
          }
        case 'modelica':
          if (nameOnly) {
            return language;
          } else {
            return 'text/x-modelica';
          }
        case 'url':
          return language;
        default:
          return '';
      }
    }
  }
  var createLanguageTooltip = function (language) {
      var divElement = document.createElement('div');
      divElement.setAttribute('class', 'code-tooltip md-tooltip-remove');
      divElement.setAttribute('align', 'right');
      divElement.setAttribute('contenteditable', 'false');
      divElement.innerHTML =
        "<span class='marklyra-input marklyra-input-after marklyra-cm-lang-input' contenteditable tabindex='-1' autocorrect='false' placeholder='" +
        jquery.localize.getString('code language') +
        "'></span>";
      divElement.childNodes[0].textContent = language || '';
      return divElement;
    },
    parseFenceAttributes = function (text) {
      if (!text) {
        return {};
      }
      if ('{' != text[0] || '}' != text[text.length - 1]) {
        return {};
      }
      var parts = text.replace(/(^{)|(}$)/g, '').split(/\s+/);
      if (!parts || !parts.length) {
        return {};
      }
      var fenceOptions = {};
      parts.forEach(function (item) {
        var match;
        if ((match = /^[.]number((-?l)|L)ines/.exec(item))) {
          fenceOptions.lineNumbers = true;
        } else {
          if ((match = /^startFrom=['"](\d+)['"]$/.exec(item))) {
            fenceOptions.firstLineNumber = match[1] - 0;
          }
        }
      });
      return fenceOptions;
    };
  window.getCodeMirrorMode = function (trimmedText, rejectUnknown, nameOnly, canonicalLanguage) {
    var text = ((trimmedText = (trimmedText = trimmedText ? trimmedText.toLowerCase() : '')
        .replace(/^\s*\.*lang(uage)*-/g, '')
        .replace(/[{}]/g, '')
        .trim()).split(/[\s,]+/) || [trimmedText])[0],
      resolvedMode = resolveCodeMirrorMode(
        trimmedText,
        nameOnly || canonicalLanguage,
        canonicalLanguage,
      );
    if (!(resolvedMode || trimmedText == text)) {
      resolvedMode = resolveCodeMirrorMode(
        text.replace(/(^[.])|(,$)/g, ''),
        nameOnly,
        canonicalLanguage,
      );
    }
    return resolvedMode || (nameOnly ? text : rejectUnknown ? null : trimmedText);
  };
  var textReplacements = null,
    replacementKeys = [];
  function applyTextReplacement(codeMirror, changes) {
    if (File.isMac) {
      if (null == textReplacements) {
        textReplacements = {};
        replacementKeys = [];
        return void bridge.callHandler('word.getTextReplacement', {}, (replacementMap) => {
          textReplacements = replacementMap;
          replacementKeys = Object.keys(textReplacements);
        });
      }
      if (1 == changes.length && '+input' == changes[0].origin) {
        var text = codeMirror.getWrapperElement().querySelector('textarea').value;
        text = text.substr(0, text.length - 1);
        var elements = replacementKeys.find((item) => text.endsWith(item));
        if (elements && textReplacements[elements]) {
          console.debug('handleUserReplacement', elements);
          var replacementEnd = Object.assign({}, codeMirror.getCursor('to')),
            replacementStart = Object.assign({}, replacementEnd);
          replacementEnd.ch -= 1;
          replacementStart.ch = replacementEnd.ch - elements.length;
          codeMirror.doc.replaceRange(
            textReplacements[elements],
            replacementStart,
            replacementEnd,
            '+replaceText',
          );
        }
      }
    }
  }
  class CodeFenceController {
    constructor(inputEditor) {
      this.getOptionsFromFencesAttr = parseFenceAttributes;
      this.handleUserReplacement = applyTextReplacement;
      var receiver = this;
      this.editor = inputEditor;
      this.queue = {};
      this.cachedCharWidth;
      this.editor.diagrams = new diagrams(inputEditor);
      if (File.option.enableDiagram) {
        ALL = ALL.concat(diagrams.MODES);
      }
      if (File.option.gitlabMath) {
        ALL = ALL.concat('math');
      }
      this.ALL = ALL;
      this.autoCompleteRender = (text, isActive) =>
        `<li class="${isActive ? 'active' : ''}" data-content="${text.replace(/[']/g, '&quot;')}"><i class="marklyra-file-icon marklyra-fi-${languageIconAliases[text] || text}">${languageIconMarkup[languageIconAliases[text] || ''] || ''}</i><span>${text}</span></li>`;
      if (!('shift+tab' === File.option.autoIndentKey || File.option.shiftTabAutoIndent)) {
        CodeMirror.keyMap.default['Shift-Tab'] = 'indentLess';
      }
      jquery(document)
        .on('losefocus', '.md-fences', function () {
          var element = jquery(this),
            codeMirror = receiver.queue[element.attr('cid')];
          if (codeMirror) {
            receiver.syncToNode(this.getAttribute('cid'));
            codeMirror.doc.setCursor(0, 0, { scroll: false });
            element.find('.md-tooltip-remove').hide();
            element[0].style.marginBottom = '';
            if (element.find('.md-fences-adv-panel').length) {
              setTimeout(() => {
                receiver.editor.selection.scrollAdjust();
              }, 1);
            }
          }
        })
        .on('endfocus', '.md-fences', function () {
          var element = jquery(this);
          if (receiver.queue[element.attr('cid')]) {
            element.find('.md-tooltip-remove').hide();
            element[0].style.marginBottom = '';
          }
        })
        .on('focus', '.marklyra-input', function () {
          var element = jquery(this).closest('[cid]'),
            codeMirror = receiver.queue[element.attr('cid')];
          if (codeMirror) {
            receiver.syncToNode(this.getAttribute('cid'));
            codeMirror.doc.setCursor(0, 0, { scroll: false });
          }
        });
      if (File.isWin) {
        CodeMirror.keyMap.default.End = 'goLineRight';
        CodeMirror.keyMap.default.Home = 'goLineLeft';
      }
      if (File.isMac) {
        bridge.registerHandler('fences.needUpdateReplaceDict', function (unusedParameter1) {
          textReplacements = null;
          replacementKeys = [];
        });
      }
      this.scrollEntities = new WeakMap();
      this.bindMouseEvents();
      this.lazyload();
      this.editor.diagrams.lazyload();
    }
    bindMouseEvents() {
      var receiver = this,
        currentEditor = this.editor;
      window.addEventListener(
        'mousedown',
        (unusedParameter1) => {
          receiver.isMousePressed = true;
        },
        true,
      );
      window.addEventListener(
        'mouseup',
        (unusedParameter1) => {
          receiver.isMousePressed = false;
          if (receiver.cmNeedsScroll) {
            var codeMirror = receiver.cmNeedsScroll;
            receiver.cmNeedsScroll = null;
            currentEditor.selection.typeWriterScroll(
              codeMirror.cursorCoords(codeMirror.getCursor()),
            );
          }
        },
        true,
      );
      this.handleCursorActivity = (codeMirror) => {
        receiver.cmNeedsScroll = null;
        if (!(codeMirror.curOp && !codeMirror.curOp.scrollToPos)) {
          if (File.isTypeWriterMode && File.option.scrollWithCursor) {
            if (receiver.isMousePressed) {
              receiver.cmNeedsScroll = codeMirror;
            } else {
              currentEditor.selection.typeWriterScroll(
                codeMirror.cursorCoords(codeMirror.getCursor()),
              );
            }
          }
        }
      };
    }
    onLeaveDocument() {
      this.queue = {};
      this.intersectionObserve(null, true);
    }
    clickEventHandled(keyboardEvent, nodeId) {
      var elementAtPoint, replayedMouseEvent, scrollY;
      if (!this.queue[nodeId]) {
        scrollY = window.scrollY;
        this.getCm(nodeId);
        scrollY -= window.scrollY;
        window.scrollBy(0, scrollY);
        if (
          (elementAtPoint = document.elementFromPoint(keyboardEvent.clientX, keyboardEvent.clientY))
        ) {
          keyboardEvent.stopPropagation();
          (replayedMouseEvent = document.createEvent('MouseEvents')).initMouseEvent(
            'mousedown',
            true,
            true,
            elementAtPoint.ownerDocument.defaultView,
            1,
            keyboardEvent.screenX,
            keyboardEvent.screenY,
            keyboardEvent.clientX,
            keyboardEvent.clientY,
            keyboardEvent.ctrlKey,
            keyboardEvent.altKey,
            keyboardEvent.shiftKey,
            keyboardEvent.metaKey,
            keyboardEvent.button,
          );
          elementAtPoint.dispatchEvent(replayedMouseEvent);
        }
        this.editor.refocus(nodeId);
      }
    }
    getCm(nodeId) {
      if (this.queue[nodeId]) {
        if (jquery("[cid='" + nodeId + "'] textarea").length) {
          return this.queue[nodeId];
        }
        delete this.queue[nodeId];
      }
      if (!this.queue[nodeId]) {
        return this.addCodeBlock(nodeId);
      }
    }
    getValue(nodeId) {
      if (this.queue[nodeId]) {
        return this.queue[nodeId].getValue();
      }
      var blockElement = this.editor.findElemById(nodeId)[0];
      if (blockElement) {
        return blockElement.innerText;
      } else {
        return '';
      }
    }
    onKeyDown(keyboardEvent, inputKeyboardEvent, editor, convertToParagraph, handleEnter) {
      var position,
        keyCode = inputKeyboardEvent.which || inputKeyboardEvent.keyCode,
        keyName = CodeMirror.keyName(inputKeyboardEvent),
        allowBlockNavigation =
          !inputKeyboardEvent.metaKey &&
          !inputKeyboardEvent.shiftKey &&
          !inputKeyboardEvent.ctrlKey;
      if (keyboardShortcuts.isKeySeq(inputKeyboardEvent, File.option.moveRowUpKey)) {
        inputKeyboardEvent.stopPropagation();
        inputKeyboardEvent.preventDefault();
        return void keyboardEvent.execCommand('moveLineUp');
      }
      if (keyboardShortcuts.isKeySeq(inputKeyboardEvent, File.option.moveRowDownKey)) {
        inputKeyboardEvent.stopPropagation();
        inputKeyboardEvent.preventDefault();
        return void keyboardEvent.execCommand('moveLineDown');
      }
      if ('Up' == CodeMirror.keyNames[keyCode]) {
        if ((position = keyboardEvent.getCursor()) && 0 == position.line) {
          if (allowBlockNavigation) {
            editor.selection.moveUpOrDown(true, inputKeyboardEvent);
            return inputKeyboardEvent.codemirrorIgnore;
          }
          if (
            0 == position.ch &&
            !inputKeyboardEvent.shiftKey &&
            ((File.isNode && inputKeyboardEvent.ctrlKey) ||
              (File.isMac && inputKeyboardEvent.metaKey))
          ) {
            return void (inputKeyboardEvent.codemirrorIgnore = true);
          }
        }
        inputKeyboardEvent.stopPropagation();
      } else {
        if ('Down' == CodeMirror.keyNames[keyCode]) {
          if (
            (position = keyboardEvent.getCursor()) &&
            position.line >= keyboardEvent.lineCount() - 1
          ) {
            if (allowBlockNavigation) {
              editor.selection.moveUpOrDown(false, inputKeyboardEvent);
              return inputKeyboardEvent.codemirrorIgnore;
            }
            if (
              position.ch == keyboardEvent.doc.getLine(position.line).length &&
              !inputKeyboardEvent.shiftKey &&
              ((File.isNode && inputKeyboardEvent.ctrlKey) ||
                (File.isMac && inputKeyboardEvent.metaKey))
            ) {
              return void (inputKeyboardEvent.codemirrorIgnore = true);
            }
          }
          inputKeyboardEvent.stopPropagation();
        } else {
          editor.selection.clearGlobalColumn();
        }
      }
      if ('Left' == CodeMirror.keyNames[keyCode]) {
        if (keyboardEvent.getSelection().length > 0) {
          return;
        }
        if (
          (position = keyboardEvent.doc.getCursor()) &&
          !position.line &&
          !position.ch &&
          allowBlockNavigation
        ) {
          editor.selection.moveUpOrDown(true, inputKeyboardEvent, true);
          return inputKeyboardEvent.codemirrorIgnore;
        }
        inputKeyboardEvent.stopPropagation();
      } else {
        if ('Right' == CodeMirror.keyNames[keyCode]) {
          if (keyboardEvent.getSelection().length > 0) {
            return;
          }
          if (
            (position = keyboardEvent.doc.getCursor()) &&
            position.line >= keyboardEvent.lineCount() - 1 &&
            position.ch >= keyboardEvent.doc.getLine(position.line).length &&
            allowBlockNavigation
          ) {
            editor.selection.moveUpOrDown(false, inputKeyboardEvent, true);
            return inputKeyboardEvent.codemirrorIgnore;
          }
          inputKeyboardEvent.stopPropagation();
        } else {
          if ('Backspace' == CodeMirror.keyNames[keyCode]) {
            if (
              (position = keyboardEvent.doc.getCursor()) &&
              keyboardEvent.lineCount() <= 1 &&
              !position.line &&
              !position.ch &&
              !keyboardEvent.getSelection().length
            ) {
              convertToParagraph(keyboardEvent);
              inputKeyboardEvent.preventDefault();
              return inputKeyboardEvent.codemirrorIgnore;
            }
            inputKeyboardEvent.stopPropagation();
          } else {
            if ('Delete' == CodeMirror.keyNames[keyCode]) {
              if ('' == keyboardEvent.getValue()) {
                convertToParagraph(keyboardEvent);
                inputKeyboardEvent.preventDefault();
                return inputKeyboardEvent.codemirrorIgnore;
              }
              inputKeyboardEvent.stopPropagation();
            } else {
              if ('PageDown' == CodeMirror.keyNames[keyCode]) {
                if (
                  !(position = keyboardEvent.doc.getCursor(position)) ||
                  keyboardEvent.doc.indexFromPos(position) >= keyboardEvent.doc.getValue().length
                ) {
                  keyboardEvent.execCommand('goDocEnd');
                  editor.selection.moveUpOrDown(false);
                  return void (inputKeyboardEvent.codemirrorIgnore = true);
                }
              } else {
                if ('PageUp' == CodeMirror.keyNames[keyCode]) {
                  if (
                    !(position = keyboardEvent.doc.getCursor()) ||
                    (0 == position.line && 0 == position.ch)
                  ) {
                    keyboardEvent.execCommand('goDocStart');
                    editor.selection.moveUpOrDown(true);
                    return void (inputKeyboardEvent.codemirrorIgnore = true);
                  }
                } else {
                  if (
                    'Enter' == CodeMirror.keyNames[keyCode] &&
                    handleEnter(keyboardEvent, inputKeyboardEvent)
                  ) {
                    return inputKeyboardEvent.codemirrorIgnore;
                  }
                }
              }
            }
          }
        }
      }
      if (CodeMirror.keyMap.macDefault[keyName] || CodeMirror.keyMap.pcDefault[keyName]) {
        inputKeyboardEvent.stopPropagation();
      }
    }
    addCodeBlock(documentNode) {
      var currentEditor = this.editor,
        receiver = this;
      function convertFenceToParagraph(codeMirror) {
        var currentDocumentNode = currentEditor.getNode(codeMirror.cid),
          UndoManager = currentEditor.undo.UndoManager,
          convertCommand = UndoManager.makeEmptyCommand();
        receiver.beforeDeleteFences(codeMirror.cid);
        convertCommand.undo.push({
          type: 'fences-pos',
          pos: codeMirror.getCursor(),
          id: codeMirror.cid,
        });
        UndoManager.append(
          convertCommand,
          currentEditor.UserOp.backToParagraph(currentEditor, currentDocumentNode, false),
        );
        currentEditor.undo.register(convertCommand);
      }
      function handleFenceBoundaryKey(codeMirror, keyboardEvent) {
        if (File.isMac ? keyboardEvent.metaKey : keyboardEvent.ctrlKey) {
          if (codeMirror.getSelection().length > 0) {
            return;
          }
          var position = codeMirror.doc.getCursor();
          if (
            codeMirror.lineCount() - 1 == position.line &&
            position.ch >= codeMirror.doc.getLine(position.line).length
          ) {
            currentEditor.UserOp.insertParagraph(false);
            keyboardEvent.stopPropagation();
            keyboardEvent.codemirrorIgnore = true;
            return true;
          }
        }
      }
      function handleFenceKeyDown(codeMirror, keyboardEvent) {
        receiver.onKeyDown(
          codeMirror,
          keyboardEvent,
          currentEditor,
          convertFenceToParagraph,
          handleFenceBoundaryKey,
        );
      }
      function handleFenceFocus(codeMirror) {
        currentEditor.refocus(documentNode.id);
        if (!codeMirror.getWrapperElement().offsetHeight) {
          codeMirror.refresh();
        }
        var element = jquery(codeMirror.getWrapperElement()).closest('.md-fences');
        if (!element.find('.md-tooltip-remove').length) {
          var languageTooltip = createLanguageTooltip(element.attr('lang') || '');
          element[0].insertChildAtIndex(languageTooltip, 1);
          bindLanguageInput.call(
            receiver,
            jquery(languageTooltip).find('.marklyra-input'),
            documentNode,
          );
        }
        handleFenceCursorActivity(codeMirror);
        if (diagrams.isDiagramType(codeMirror.options.mode)) {
          currentEditor.diagrams.startPreview(codeMirror.cid);
        }
        if (mathBlocks.isMathType(documentNode.get('lang'))) {
          currentEditor.diagrams.startPreview(codeMirror.cid);
        }
        if (File.isMac) {
          bridge.callHandler('touchBar.setFencesOnSetLang', false);
        }
      }
      function handleFenceContextMenu(codeMirror, contextEvent) {
        if (File.isNodeHtml) {
          File.editor.contextMenu.show(contextEvent, codeMirror.getWrapperElement());
        }
      }
      function handleFenceChanges(codeMirror, cmChanges) {
        applyTextReplacement(codeMirror, cmChanges);
        currentEditor.wordCount.quickUpdate(codeMirror.cid);
        currentEditor.selection.clearGlobalColumn();
        if (diagrams.isDiagramType(codeMirror.options.mode)) {
          currentEditor.diagrams.updateDiagram(codeMirror.cid);
        }
        if (mathBlocks.isMathType(documentNode.get('lang'))) {
          currentEditor.mathBlock.updateDiagram(codeMirror.cid);
        }
        if (File.isTypeWriterMode && !File.option.scrollWithCursor) {
          currentEditor.selection.typeWriterScroll(codeMirror.cursorCoords(codeMirror.getCursor()));
        }
        documentNode.set('text', codeMirror.getValue());
        if (cmChanges.length && cmChanges[0].origin) {
          currentEditor.syncChange([{ type: 'sync', id: codeMirror.cid, cmChanges: cmChanges }]);
        }
      }
      function handleFenceSelectionChange(codeMirror, selectionChange) {
        if (
          diagrams.isDiagramType(codeMirror.options.mode) &&
          selectionChange.ranges.length &&
          selectionChange.ranges[0].anchor.line != (codeMirror.getCursor() || {}).line
        ) {
          currentEditor.diagrams.attachError(codeMirror);
        }
      }
      function handleFenceCursorActivity(codeMirror, unusedParameter2) {
        if (codeMirror.hasFocus()) {
          receiver.handleCursorActivity(codeMirror);
          currentEditor.wordCount.updateInSelection();
        }
      }
      function preventTypewriterScroll(unusedParameter1, event) {
        if (File.isTypeWriterMode) {
          event.preventDefault();
        }
      }
      function handleFenceMouseDown(codeMirror, mouseEvent) {
        if ('TEXTAREA' !== document.activeElement.tagName) {
          var commonAncestorContainer = (currentEditor.selection.getRangy() || {})
            .commonAncestorContainer;
          if (
            commonAncestorContainer &&
            commonAncestorContainer == codeMirror.display.lineDiv &&
            codeMirror.display.lineDiv.contains(commonAncestorContainer)
          ) {
            return;
          }
          mouseEvent.codemirrorIgnore = true;
        }
      }
      if ('string' == typeof documentNode) {
        documentNode = this.editor.getNode(documentNode);
      }
      if (documentNode) {
        if (!this.queue[documentNode.id] && documentNode.get('type') == documentModel.TYPE.fences) {
          var localElement = jquery('[cid = ' + documentNode.id + ']').removeClass('mock-cm');
          if (!localElement.length) {
            return;
          }
          var advancedPanel = localElement.find('.md-fences-adv-panel').clone();
          localElement.addClass('marklyra-contain-cm').html('');
          var mode = getCodeMirrorMode(documentNode.get('lang'));
          console.debug(
            'init codemirror [' +
              documentNode.id +
              '] ' +
              mode +
              ' mode loaded? ' +
              this.modeLoaded,
          );
          var codeMirrorOptions = {
            lineWrapping: !File.option.noLineWrapping,
            mode: mode,
            styleSelectedText: true,
            maxHighlightLength: 1 / 0,
            viewportMargin: 1 / 0,
            styleActiveLine: true,
            autoCloseBrackets: !File.option.noPairingMatch,
            autoCloseTags: !File.option.noPairingMatch,
            theme: ' inner null-scroll',
            lineNumbers: File.option.showLineNumbersForFence,
            resetSelectionOnContextMenu: true,
            cursorScrollMargin: 60,
            dragDrop: false,
            indentUnit: File.option.codeIndentSize,
            tabSize: File.option.codeIndentSize,
            lineWiseCopyCut: File.option.lineWiseCopyCut,
            scrollbarStyle: 'null',
            value: documentNode.safeGetStrAttr('text'),
          };
          Object.assign(codeMirrorOptions, parseFenceAttributes(documentNode.get('lang')));
          var codeMirror = CodeMirror(
            localElement[0],
            codeMirrorOptions,
            this.editor,
            documentNode.id,
          );
          this.queue[documentNode.id] = codeMirror;
          codeMirror.off('keydown', handleFenceKeyDown);
          codeMirror.on('keydown', handleFenceKeyDown);
          codeMirror.off('focus', handleFenceFocus);
          codeMirror.on('focus', handleFenceFocus);
          codeMirror.off('changes', handleFenceChanges);
          codeMirror.on('changes', handleFenceChanges);
          codeMirror.off('scrollCursorIntoView', preventTypewriterScroll);
          codeMirror.on('scrollCursorIntoView', preventTypewriterScroll);
          codeMirror.off('cursorActivity', handleFenceCursorActivity);
          codeMirror.on('cursorActivity', handleFenceCursorActivity);
          codeMirror.off('contextmenu', handleFenceContextMenu);
          codeMirror.on('contextmenu', handleFenceContextMenu);
          codeMirror.off('beforeSelectionChange', handleFenceSelectionChange);
          codeMirror.on('beforeSelectionChange', handleFenceSelectionChange);
          codeMirror.off('copy', handleFenceMouseDown);
          codeMirror.on('copy', handleFenceMouseDown);
          codeMirror.off('cut', handleFenceMouseDown);
          codeMirror.on('cut', handleFenceMouseDown);
          (function (isCm) {
            if (currentEditor.searchPanel) {
              var searchStatus = currentEditor.searchPanel.searchStatus;
              if (searchStatus) {
                var hits = searchStatus.hits;
                if (hits.length && !(hits.length > currentEditor.searchPanel.MAX_HITS_COUNT)) {
                  for (
                    var firstHitIndex = -1, lastHitIndex = -1, itemIndex = 0;
                    itemIndex < hits.length;
                    itemIndex++
                  ) {
                    let hit = hits[itemIndex];
                    if (hit.cid == isCm.cid && hit.isFutureCm) {
                      if (firstHitIndex < 0) {
                        firstHitIndex = itemIndex;
                      }
                      lastHitIndex = itemIndex;
                      hit.isFutureCm = false;
                      hit.isCm = isCm;
                    } else {
                      if (lastHitIndex > 0) {
                        break;
                      }
                    }
                  }
                  if (-1 != firstHitIndex) {
                    receiver.searchOn(isCm, searchStatus.searchText, searchStatus);
                  }
                }
              }
            }
          })(codeMirror);
          localElement
            .children('.CodeMirror')
            .attr('lang', (documentNode.get('lang') || '').toLowerCase());
          if (this.modeLoaded) {
            localElement.addClass('modeLoaded');
          }
          if (!File.option.showLineNumbersForFence && codeMirrorOptions.lineNumbers) {
            localElement.addClass('md-fences-with-lineno');
          }
          if (advancedPanel.length) {
            localElement.append(advancedPanel);
          }
          var currentElement = localElement.closest('li');
          if (currentElement.length) {
            currentElement[0].style.display = 'block';
            currentElement[0].style.display = '';
          }
        }
        this.editor.tryEnterBusyModeWithDelay();
        return this.queue[documentNode.id];
      }
    }
    toggleFocusedComponent() {
      var activeElement = document.activeElement,
        element = jquery(activeElement).closest('.md-fences');
      if (element.length) {
        if (activeElement.classList && activeElement.classList.contains('marklyra-cm-lang-input')) {
          var nodeId = element.attr('cid'),
            codeMirror = this.getCm(nodeId),
            cursorPosition = codeMirror.getCursor();
          codeMirror.focus();
          codeMirror.setCursor(cursorPosition);
        } else {
          element
            .find('.CodeMirror-focused')
            .removeClass('CodeMirror-focused')
            .end()
            .find('.marklyra-input')
            .show()
            .focus();
        }
      }
    }
    focus(nodeOrId) {
      var nodeId = 'string' == typeof nodeOrId ? nodeOrId : nodeOrId.id;
      this.getCm(nodeId).focus();
    }
    getFocused() {
      for (var nodeId in this.queue) {
        if (this.queue.hasOwnProperty(nodeId) && this.queue[nodeId].hasFocus()) {
          return this.queue[nodeId];
        }
      }
    }
    updateCodeNum() {
      for (var nodeId in this.queue) {
        if (!this.editor.getNode(nodeId)) {
          delete this.queue[nodeId];
        }
      }
    }
    copyContent() {
      var documentNode = this.editor.getNode(null, true),
        setClipboard = this.editor.UserOp.setClipboard,
        text = documentNode.get('text');
      setClipboard(
        `<pre lang='${documentNode.get('lang') || ''}'>${utilities.escape(text)}</pre>`,
        void 0,
        text,
        true,
      );
    }
    formatContent(selectionOnly) {
      var codeMirror;
      if (this.editor.sourceView.inSourceMode) {
        codeMirror = this.editor.sourceView.cm;
      } else {
        var documentNode = this.editor.getNode(null, true);
        if (
          !(codeMirror = (this.editor.findElemById(documentNode.id).find('.CodeMirror')[0] || {})
            .CodeMirror)
        ) {
          return void File.editor.UserOp.lessIndent(File.editor);
        }
      }
      var selections = codeMirror.listSelections();
      if (!selectionOnly) {
        codeMirror.execCommand('selectAll');
      }
      codeMirror.execCommand('indentAuto');
      if (!selectionOnly) {
        codeMirror.setSelections(selections);
      }
    }
    syncToNode(nodeId) {
      var documentNode, codeMirror;
      if ((documentNode = 'string' == typeof nodeId ? this.editor.getNode(nodeId) : nodeId)) {
        codeMirror = this.getCm(documentNode.id);
        if (documentNode.get('text') !== codeMirror.getValue()) {
          documentNode.set('text', codeMirror.getValue());
        }
      }
    }
    decorateAll() {
      this.refreshEditor(true, false);
    }
    intersectionObserve(blockElement, intersectionObserver) {
      if (this.continueRenderTimer) {
        clearTimeout(this.continueRenderTimer);
      }
      if (this.intersectionObserver && intersectionObserver) {
        this.intersectionObserver.disconnect();
      }
      var receiver = this;
      if (blockElement) {
        if (!this.intersectionObserver) {
          this.intersectionObserver = new IntersectionObserver(function (items) {
            items.forEach(function (item) {
              var timerId = receiver.scrollEntities.get(item.target);
              if (timerId) {
                clearTimeout(timerId);
              }
              if (!(item.intersectionRatio <= 0)) {
                if (File.editor.isScrolling()) {
                  timerId = setTimeout(
                    function () {
                      receiver.addCodeBlock(item.target.getAttribute('cid'));
                      if (receiver.intersectionObserver) {
                        receiver.intersectionObserver.unobserve(item.target);
                      }
                      receiver.scrollEntities.delete(item.target);
                    },
                    File.inBusyMode ? 1e3 : 0,
                  );
                  return void receiver.scrollEntities.set(item.target, timerId);
                }
                receiver.scrollEntities.delete(item.target);
                receiver.addCodeBlock(item.target.getAttribute('cid'));
                if (receiver.intersectionObserver) {
                  receiver.intersectionObserver.unobserve(item.target);
                }
              }
            });
          });
        }
        this.intersectionObserver.observe(blockElement);
      }
    }
    refreshEditor(forceCreate, refreshExisting, rootElement) {
      if (this.modeLoaded) {
        var receiver = this,
          registeredCount = 0;
        for (var currentNodeId in this.queue) {
          var nodeElement = this.editor.findElemById(currentNodeId);
          if (nodeElement.find('.CodeMirror').length && this.editor.getNode(currentNodeId)) {
            var registeredEditor = this.queue[currentNodeId];
            if (nodeElement.hasClass('modeLoaded')) {
              if (refreshExisting) {
                registeredEditor.refresh();
              }
            } else {
              var documentNode = this.editor.getNode(currentNodeId);
              registeredEditor.setOption('mode', getCodeMirrorMode(documentNode.get('lang')));
              registeredEditor.refresh();
            }
            registeredCount++;
          } else {
            delete this.queue[currentNodeId];
          }
        }
        var elements = (rootElement || document).querySelectorAll("[mdtype='fences']"),
          eagerEditorLimit = window.IntersectionObserver ? 8 : 30,
          createdCount = 0;
        if (elements.length != registeredCount) {
          elements.forEach(function (element) {
            var nodeId = element.getAttribute('cid');
            if (receiver.queue[nodeId]) {
              if (!rootElement) {
                createdCount++;
              }
            } else {
              if (forceCreate || (!File.inBusyMode && createdCount < eagerEditorLimit)) {
                receiver.addCodeBlock(nodeId);
                createdCount++;
              } else {
                if (window.IntersectionObserver) {
                  receiver.intersectionObserve(element);
                }
              }
            }
          });
        }
      }
    }
    lazyload() {
      var receiver = this;
      jquery
        .getScript(
          (File.isNode && !window.debugMode ? './lib.asar' : './lib') + '/codemirror/mode.min.js',
        )
        .then(function () {
          receiver.modeLoaded = true;
          console.debug('codemirror mode is loaded, refreshing editor');
          receiver.refreshEditor();
          receiver.editor.tryEnterBusyModeWithDelay();
        });
    }
    jumpCmEnd(nodeOrEditor) {
      var nodeId = nodeOrEditor,
        codeMirror = nodeOrEditor;
      if ('string' == typeof nodeId) {
        codeMirror = this.getCm(nodeId);
      } else {
        nodeId = codeMirror.cid;
      }
      var line = 0,
        characterOffset = 0;
      if (codeMirror) {
        line = codeMirror.doc.lastLine();
        characterOffset = codeMirror.doc.getLine(line).length;
        codeMirror.focus();
        codeMirror.setCursor({ line: line, ch: characterOffset });
      }
    }
    jumpCmBegin(nodeOrEditor) {
      var codeMirror = nodeOrEditor;
      if ('string' == typeof codeMirror) {
        codeMirror = this.getCm(codeMirror);
      }
      codeMirror.focus();
      codeMirror.setCursor({ line: 0, ch: 0 });
    }
    beforeDeleteFences(nodeId, items) {
      var codeMirror, documentNode;
      if ('string' == typeof nodeId) {
        codeMirror = this.queue[nodeId];
        documentNode = this.editor.getNode(nodeId);
      } else {
        documentNode = nodeId;
        codeMirror = this.queue[documentNode.id];
      }
      if (codeMirror) {
        if (documentNode.get('text') !== codeMirror.getValue()) {
          documentNode.set('text', codeMirror.getValue());
        }
        codeMirror.doc.clearHistory();
        delete this.queue[documentNode.id];
        if (items) {
          items.map(function (item) {
            if (item) {
              if (
                item.id == documentNode.id &&
                item.json &&
                item.json.content &&
                item.json.content.type == documentModel.TYPE.fences
              ) {
                item.json.content.text = documentNode.get('text');
              } else {
                if (Array.isArray(item.json)) {
                  item.json.map(function (inputItem) {
                    if (
                      inputItem.id == documentNode.id &&
                      inputItem.content.type == documentModel.TYPE.fences
                    ) {
                      inputItem.content.text = documentNode.get('text');
                    }
                  });
                }
              }
            }
          });
        }
      }
    }
    searchOn(codeMirror, text, searchOptions) {
      this.searchStatus = this.searchStatus || {};
      this.searchStatus.overlay = this.searchStatus.overlay || {};
      this.searchStatus.queue = this.searchStatus.queue || [];
      var searchPattern = null;
      if (searchOptions.useRegexp) {
        try {
          if (searchOptions.wholeWord) {
            text = `\\b${text.replace(/^\\b|\\b$/g, '')}\\b`;
          }
          searchPattern = new RegExp(text, searchOptions.caseSensitive ? 'g' : 'gi');
        } catch (error) {
          return;
        }
      } else {
        searchPattern = searchOptions.wholeWord
          ? new RegExp(
              '\\b' + utilities.escapeRegExp(text) + '\\b',
              searchOptions.caseSensitive ? 'g' : 'gi',
            )
          : new RegExp(utilities.escapeRegExp(text), searchOptions.caseSensitive ? 'g' : 'gi');
      }
      this.searchStatus.overlay[codeMirror.cid || 'source'] = (function (inputSearchExp) {
        return {
          searchExp: inputSearchExp,
          token: function (stream) {
            var searchExp = this.searchExp;
            searchExp.lastIndex = stream.pos;
            var match = searchExp.exec(stream.string);
            if (match && match.index == stream.pos) {
              stream.pos += match[0].length || 1;
              return 'search-hit';
            } else {
              if (match) {
                stream.pos = match.index;
              } else {
                stream.skipToEnd();
              }
              return null;
            }
          },
        };
      })(searchPattern);
      codeMirror.addOverlay(this.searchStatus.overlay[codeMirror.cid || 'source']);
      this.searchStatus.queue.push(codeMirror);
    }
    clearSearchOn(codeMirror) {
      if (this.searchStatus) {
        codeMirror.removeOverlay(this.searchStatus.overlay[codeMirror.cid || 'source']);
        this.searchStatus.queue.remove(codeMirror);
      }
    }
    clearSearchAll() {
      if (this.editor.sourceView.inSourceMode) {
        if (this.searchStatus) {
          this.editor.sourceView.cm.removeOverlay(this.searchStatus.overlay.source);
        }
        return void (this.searchStatus = null);
      }
      if (this.searchStatus && this.searchStatus.overlay) {
        this.searchStatus.queue.forEach(function (item) {
          if (this.searchStatus.overlay[item.cid]) {
            item.removeOverlay(this.searchStatus.overlay[item.cid]);
          }
        }, this);
      }
      this.searchStatus = null;
    }
    renderFences(sourceText) {
      return CodeFenceController.renderFences(sourceText);
    }
    tryAddLangUndo(documentNode, element) {
      if (!element) {
        element = document.activeElement;
      }
      if (!element.classList || !element.classList.contains('marklyra-cm-lang-input')) {
        return false;
      }
      if (!documentNode) {
        documentNode = this.editor.getNode(jquery(element).closest('[cid]').attr('cid'));
      }
      if (!documentNode) {
        return false;
      }
      var previousLanguage = documentNode.get('lang') || '',
        nextLanguage = element.textContent || '';
      return (
        previousLanguage != nextLanguage &&
        (documentNode.attr('lang', nextLanguage, this.editor, false), true)
      );
    }
    getCodeLangSuggest(fromMenu) {
      var defaultCodeLangOption =
          (fromMenu
            ? File.option.DefaultCodeLangOptionMenu
            : File.option.DefaultCodeLangOptionCode) || 0,
        configuredLanguage = this.editor.localSettingBridge.getSetting('defaultCodeLang');
      if (
        '__LAST' ===
        (configuredLanguage =
          File.option.defaultCodeLangOption & defaultCodeLangOption ? configuredLanguage : '')
      ) {
        return this.lastCodeLang || '';
      } else {
        return configuredLanguage;
      }
    }
    autoSuggestCodeLang(keyboardEvent) {
      var key = keyboardEvent.key;
      if ('`' != key && '~' != key) {
        return false;
      }
      var element = this.editor.getMarkElem();
      if (element.attr('mdtype') == documentModel.TYPE.paragraph) {
        var suggestedLanguage = this.getCodeLangSuggest(false);
        if (suggestedLanguage) {
          if ('``' === element.rawText() && '`' == key) {
          } else {
            if ('~~' !== element.rawText() || '~' != key) {
              return false;
            }
          }
          this.editor.selection.jumpIntoElemEnd(element);
          this.editor.insertText(key);
          setTimeout(() => {
            this.editor.undo.endSnap(true);
            this.editor.selection.jumpIntoElemEnd(element);
            this.editor.insertText(suggestedLanguage);
            this.editor.brush.brushNode(element.attr('cid'));
            editor.selection.restoreSelection(element[0], {
              start: 3,
              end: 3 + suggestedLanguage.length,
            });
          }, 0);
          return true;
        }
      }
    }
  }

  CodeFenceController.renderFencesByUpdate = function (documentNode, element, language) {
    element.classList.remove('md-diagram');
    element.classList.remove('md-fences-math');
    element.classList.remove('md-fences-advanced');
    if (diagrams.isDiagramType(language)) {
      element.classList.add('md-diagram');
      element.classList.add('md-fences-advanced');
      var nodeElement = File.editor.findElemById(documentNode.cid);
      if (nodeElement.find('textarea').val() == documentNode.get('text')) {
        var diagramPanel = nodeElement.find('.md-diagram-panel').clone()[0];
        if (diagramPanel) {
          element.appendChild(diagramPanel);
        }
      }
    }
    if (mathBlocks.isMathType(language)) {
      element.classList.add('md-fences-math');
      element.classList.add('md-fences-advanced');
      element.setAttribute('id', 'mathjax-' + documentNode.cid);
    }
  };
  CodeFenceController.renderFences = function (documentNode) {
    var PREElement = document.createElement('PRE');
    PREElement.classList.add('md-fences');
    PREElement.classList.add('mock-cm');
    PREElement.classList.add('md-end-block');
    if (File.option.showLineNumbersForFence) {
      PREElement.classList.add('md-fences-with-lineno');
    }
    var language = documentNode.get('lang'),
      text = documentNode.get('text');
    PREElement.setAttribute('spellcheck', 'false');
    PREElement.setAttribute('contenteditable', 'false');
    PREElement.setAttribute('lang', language || '');
    PREElement.setAttribute('cid', documentNode.cid);
    PREElement.setAttribute('mdtype', documentNode.get('type'));
    PREElement.innerText = text;
    if (!PREElement.innerText) {
      PREElement.innerHTML = '<br/>';
    }
    CodeFenceController.renderFencesByUpdate(documentNode, PREElement, language);
    return PREElement.outerHTML;
  };
  moduleRecord.exports = CodeFenceController;
  window.CodeMirror = CodeMirror;
  window.Fences = CodeFenceController;
}
