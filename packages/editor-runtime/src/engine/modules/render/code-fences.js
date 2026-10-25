// render/code-fences.
// SystemJS module 18. Dependencies: 20, 11, e, 26, 13, 27, 1b, 15, 1c, 25.
$__System.registerDynamic(
  '18',
  ['20', '11', 'e', '26', '13', '27', '1b', '15', '1c', '25'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    'use strict';
    this || self;
    var CodeMirror = requireModule('20'),
      utilities = requireModule('11'),
      jquery = requireModule('e'),
      documentModel = (requireModule('26'), requireModule('13')),
      keyboardShortcuts = requireModule('27'),
      diagrams = (requireModule('1b'), requireModule('15')),
      mathBlocks = requireModule('1c'),
      map = keyboardShortcuts.map;
    (Node = documentModel.Node), requireModule('25');
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
        haskell:
          '<span class="path1"></span><span class="path2"></span><span class="path3"></span>',
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
    for (var languageName of ALL)
      languageIconAliases[languageName] = languageIconAliases[languageName] || languageName;
    !(function (codeMirrorModule) {
      var delLineLeft = codeMirrorModule.commands.delLineLeft;
      codeMirrorModule.commands.delLineLeft = function (codeMirror) {
        try {
          return 0 == codeMirror.getCursor().ch
            ? codeMirrorModule.commands.delCharBefore(codeMirror)
            : delLineLeft(codeMirror);
        } catch (error) {}
      };
    })(CodeMirror);
    var m = function (languageInput, documentNode) {
      var receiver = this;
      languageInput
        .on('change blur', function () {
          this.textContent != documentNode.get('lang') &&
            receiver.tryAddLangUndo(documentNode, this);
        })
        .keydown(function (keyboardEvent) {
          var keyCode = keyboardEvent.which || keyboardEvent.keyCode;
          'Enter' == map[keyCode] && jquery(this).trigger('change');
        })
        .focus(function () {
          File.isMac && bridge.callHandler('touchBar.setFencesOnSetLang', !0);
        })
        .on('keydown', function (keyboardEvent) {
          var range,
            keyCode = keyboardEvent.keyCode || keyboardEvent.which;
          if ('Delete' == map[keyCode]) {
            if (
              !(range = receiver.editor.selection.getRangy()) ||
              range.commonAncestorContainer.parentElement != this
            )
              return !1;
            if (
              range.commonAncestorContainer == this ||
              (range.startOffset == range.endOffset && range.endOffset == this.textContent.length)
            )
              return receiver.editor.selection.moveUpOrDown(!1), !1;
          } else if ('Backspace' == map[keyCode]) {
            if (
              !(range = receiver.editor.selection.getRangy()) ||
              range.commonAncestorContainer.parentElement != this
            )
              return !1;
            if (
              range.commonAncestorContainer == this ||
              (range.startOffset == range.endOffset && 0 == range.startOffset)
            )
              return receiver.editor.selection.moveUpOrDown(!0), !1;
          } else if ('Return' == map[keyCode] || 'Enter' == map[keyCode])
            return (
              receiver.editor.autoComplete.isShown() || receiver.editor.selection.moveUpOrDown(!1),
              !1
            );
        })
        .on('paste', function (inputEvent) {
          setTimeout(function () {
            (inputEvent.target.textContent = inputEvent.target.textContent
              .replace(/(^\n+)|(\n+$)/g, '')
              .split(/\r?\n/)[0]),
              jquery(inputEvent.target).trigger('change');
          }, 0);
        })
        .on('input', function (unusedParameter1) {
          this.querySelector(':not(br)') &&
            (this.textContent = this.textContent.replace(/(^\n+)|(\n+$)/g, ''));
        }),
        this.editor.autoComplete.show(ALL, languageInput[0], void 0, {
          type: 'fences',
          render: this.autoCompleteRender,
        });
    };
    function g(language, nameOnly, canonicalLanguage) {
      if (language)
        switch (language) {
          case 'javascript':
          case 'text/javascript':
          case 'js':
            return (language = 'javascript');
          case 'json':
          case 'json5':
            return nameOnly ? language : (language = { name: 'javascript', json: !0 });
          case 'jsonld':
          case 'json-ld':
            return nameOnly ? language : 'application/ld+json';
          case 'text/typescript':
          case 'typescript':
          case 'ts':
            return nameOnly ? 'typescript' : (language = { name: 'javascript', typescript: !0 });
          case 'arkts':
            return nameOnly ? 'arkts' : (language = { name: 'javascript', typescript: !0 });
          case 'clojure':
            return language;
          case 'coffee':
          case 'coffeescript':
          case 'css':
            return language;
          case 'less':
            return nameOnly ? 'less' : 'text/x-less';
          case 'scss':
            return nameOnly ? 'scss' : (language = 'text/x-scss');
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
            return nameOnly ? language : 'xml';
          case 'haskell':
            return language;
          case 'htmlmixed':
          case 'html':
          case 'html4':
          case 'html5':
          case 'xhtml':
          case 'svg':
          case 'epub':
            return nameOnly
              ? /^html/.exec(language)
                ? 'html'
                : language
              : (language = 'htmlmixed');
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
            return nameOnly ? 'php' : 'application/x-httpd-php';
          case 'php':
          case 'php3':
          case 'php4':
          case 'php5':
          case 'php6':
            return nameOnly ? language : 'text/x-php';
          case 'cython':
            return nameOnly ? language : (language = 'text/x-cython');
          case 'py':
          case 'py2':
          case 'py3':
            language = 'python';
          case 'python2':
          case 'python3':
          case 'python':
            return nameOnly ? language : (language = 'text/x-python');
          case 'terraform':
            return nameOnly ? language : 'ruby';
          case 'ruby':
            return language;
          case 'shell':
          case 'sh':
          case 'zsh':
          case 'bash':
          case 'terminal':
            return canonicalLanguage ? 'bash' : (language = 'shell');
          case 'sql':
            return nameOnly ? language : (language = 'text/x-mariadb');
          case 'sql lite':
          case 'sqlite':
            return nameOnly ? language : (language = 'text/x-sql');
          case 'mssql':
            return nameOnly ? language : (language = 'text/x-mssql');
          case 'mysql':
            return nameOnly ? language : (language = 'text/x-mysql');
          case 'pgsql':
          case 'postgresql':
            return nameOnly ? 'postgresql' : (language = 'text/x-pgsql');
          case 'hive':
            return nameOnly ? language : (language = 'text/x-hive');
          case 'esper':
            return nameOnly ? language : (language = 'text/x-esper');
          case 'mariadb':
            return nameOnly ? language : (language = 'text/x-mariadb');
          case 'cassandra':
          case 'cql':
            return nameOnly ? language : (language = 'text/x-cassandra');
          case 'plsql':
            return nameOnly ? language : (language = 'text/x-plsql');
          case 'greenplum':
          case 'greenplum-db':
          case 'gpsql':
            return nameOnly ? language : (language = 'text/x-gpsql');
          case 'sparksql':
          case 'spark-sql':
          case 'spark sql':
            return nameOnly ? language : (language = 'text/x-sparksql');
          case 'esper':
            return nameOnly ? language : (language = 'text/x-esper');
          case 'stex':
          case 'tex':
          case 'latex':
          case 'math':
            return nameOnly ? language : 'text/x-stex';
          case 'tiddlywiki':
          case 'wiki':
            return nameOnly ? language : (language = 'tiddlywiki');
          case 'vb':
          case 'visual basic':
          case 'visualbasic':
          case 'basic':
            return nameOnly ? language : (language = 'vb');
          case 'vbscript':
          case 'velocity':
            return language;
          case 'verilog':
            return nameOnly ? language : (language = 'text/x-verilog');
          case 'systemverilog':
            return nameOnly ? language : (language = 'text/x-systemverilog');
          case 'xquery':
            return language;
          case 'yaml':
          case 'yml':
            return nameOnly ? language : 'yaml';
          case 'go':
          case 'golang':
          case 'go-lang':
            return 'go';
          case 'groovy':
          case 'nginx':
            return language;
          case 'octave':
          case 'matlab':
            return nameOnly ? language : 'text/x-octave';
          case 'c':
          case 'clike':
          case 'csrc':
            return nameOnly ? language : (language = 'text/x-csrc');
          case 'c++':
          case 'c++src':
          case 'cpp':
          case 'cc':
          case 'hpp':
          case 'h++':
          case 'h':
            return nameOnly ? language : (language = 'text/x-c++src');
          case 'obj-c':
          case 'objc':
          case 'objective c':
          case 'objective-c':
          case 'objectivec':
            return nameOnly ? language : (language = 'text/x-objectivec');
          case 'text/x-scala':
          case 'scala':
            return nameOnly ? language : (language = 'text/x-scala');
          case 'csharp':
          case 'c#':
          case 'cs':
            return nameOnly ? language : (language = 'text/x-csharp');
          case 'java':
            return nameOnly ? language : (language = 'text/x-java');
          case 'squirrel':
            return nameOnly ? language : (language = 'text/x-squirrel');
          case 'ceylon':
            return nameOnly ? language : (language = 'text/x-ceylon');
          case 'kotlin':
            return nameOnly ? language : (language = 'text/x-kotlin');
          case 'swift':
          case 'swiftui':
            return (language = 'swift');
          case 'r':
          case 'rlang':
          case 'r-lang':
            return nameOnly ? language : (language = 'text/x-rsrc');
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
            return nameOnly ? language : 'jinja2';
          case 'jinja2':
            return language;
          case 'aspx':
          case 'asp':
          case 'asp.net':
            return nameOnly ? language : (language = 'application/x-aspx');
          case 'jsp':
            return nameOnly ? language : (language = 'application/x-jsp');
          case 'erb':
            return nameOnly ? language : (language = 'application/x-erb');
          case 'ejs':
          case 'embeddedjs':
          case 'embedded javaScript':
            return nameOnly ? language : (language = 'application/x-ejs');
          case 'powershell':
          case 'bat':
          case 'batch':
          case 'cmd':
            return nameOnly ? language : 'application/x-powershell';
          case 'docker':
          case 'dockerfile':
            return nameOnly ? language : 'text/x-dockerfile';
          case 'jsx':
          case 'react':
            return nameOnly ? language : 'text/jsx';
          case 'tsx':
            return nameOnly ? language : 'text/typescript-jsx';
          case 'vue.js':
          case 'vue':
          case 'vue-template':
            return nameOnly ? language : 'script/x-vue';
          case 'nsis':
            return nameOnly ? language : 'text/x-nsis';
          case 'mathematica':
            return nameOnly ? language : 'text/x-mathematica';
          case 'tiki':
          case 'tiki wiki':
          case 'tiki-wiki':
          case 'tikiwiki':
            return 'tiki';
          case 'properties':
          case 'ini':
            return nameOnly ? language : 'text/x-properties';
          case 'livescript':
            return nameOnly ? language : 'text/x-livescript';
          case 'asm':
          case 'assembly':
          case 'nasm':
            return nameOnly ? language : 'assembly';
          case 'gas':
            return language;
          case 'toml':
            return nameOnly ? language : 'text/x-toml';
          case 'sequence':
            return 'sequence';
          case 'flow':
          case 'flowchart':
            return 'flow';
          case 'mermaid':
            return 'mermaid';
          case 'ocaml':
            return nameOnly ? language : 'text/x-ocaml';
          case 'f#':
          case 'fsharp':
            return nameOnly ? language : 'text/x-fsharp';
          case 'elm':
            return nameOnly ? language : 'text/x-elm';
          case 'pgp':
          case 'pgp-keys':
          case 'pgp-key':
          case 'pgp-signature':
          case 'asciiarmor':
          case 'ascii-armor':
          case 'ascii armor':
            return nameOnly ? language : 'application/pgp';
          case 'spreadsheet':
          case 'excel':
            return nameOnly ? language : 'text/x-spreadsheet';
          case 'elixir':
            return 'elixir';
          case 'cmake':
            return nameOnly ? language : 'text/x-cmake';
          case 'cypher':
          case 'cypher-query':
            return nameOnly ? language : 'application/x-cypher-query';
          case 'dart':
            return 'dart';
          case 'django':
            return nameOnly ? language : 'text/x-django';
          case 'dtd':
          case 'xml-dtd':
          case 'xml dtd':
          case 'xmldtd':
            return nameOnly ? language : 'application/xml-dtd';
          case 'dylan':
            return nameOnly ? language : 'text/x-dylan';
          case 'handlebars':
          case 'svelte':
            return nameOnly ? language : { name: 'handlebars', base: 'text/html' };
          case 'idl':
            return nameOnly ? language : 'text/x-idl';
          case 'webidl':
          case 'web-idl':
          case 'web idl':
            return nameOnly ? language : 'text/x-webidl';
          case 'yacas':
            return nameOnly ? language : 'text/x-yacas';
          case 'mbox':
            return nameOnly ? language : 'application/mbox';
          case 'vhdl':
            return nameOnly ? language : 'text/x-vhdl';
          case 'julia':
            return 'julia';
          case 'haxe':
            return nameOnly ? language : 'text/x-haxe';
          case 'hxml':
            return nameOnly ? language : 'text/x-hxml';
          case 'fortran':
            return nameOnly ? language : 'text/x-fortran';
          case 'protobuf':
            return nameOnly ? language : 'text/x-protobuf';
          case 'makefile':
            return nameOnly ? language : 'text/x-makefile';
          case 'tcl':
            return nameOnly ? language : 'text/x-tcl';
          case 'scheme':
            return nameOnly ? language : 'text/x-scheme';
          case 'twig':
            return nameOnly ? language : 'text/x-twig';
          case 'sas':
            return nameOnly ? language : 'text/x-sas';
          case 'pseudocode':
            return nameOnly ? language : 'text/x-pseudocode';
          case 'julia':
          case 'text/x-julia':
          case 'stylus':
          case 'cobol':
          case 'oz':
          case 'sparql':
          case 'crystal':
            return language;
          case 'asn.1':
            return nameOnly ? 'ASN.1' : (language = 'text/x-ttcn-asn');
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
            return nameOnly ? language : 'text/x-q';
          case 'v':
          case 'vlang':
          case 'v-lang':
            return 'v';
          case 'forth':
            return language;
          case 'nim':
          case 'nimrod':
            return nameOnly ? language : 'nimrod';
          case 'solidity':
            return language;
          case 'htaccess':
          case '.htaccess':
            if (nameOnly) return 'htaccess';
          case 'apache':
            return 'apache';
          case 'stata':
            return language;
          case 'smarty':
          case 'smarty2':
            return nameOnly ? language : 'smarty';
          case 'smarty3':
            return nameOnly ? language : { name: 'smarty', verson: 3 };
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
            return nameOnly ? language : 'pascal';
          case 'modelica':
            return nameOnly ? language : 'text/x-modelica';
          case 'url':
            return language;
          default:
            return '';
        }
    }
    var v = function (language) {
        var divElement = document.createElement('div');
        return (
          divElement.setAttribute('class', 'code-tooltip md-tooltip-remove'),
          divElement.setAttribute('align', 'right'),
          divElement.setAttribute('contenteditable', 'false'),
          (divElement.innerHTML =
            "<span class='marklyra-input marklyra-input-after marklyra-cm-lang-input' contenteditable tabindex='-1' autocorrect='false' placeholder='" +
            jquery.localize.getString('code language') +
            "'></span>"),
          (divElement.childNodes[0].textContent = language || ''),
          divElement
        );
      },
      y = function (text) {
        if (!text) return {};
        if ('{' != text[0] || '}' != text[text.length - 1]) return {};
        var parts = text.replace(/(^{)|(}$)/g, '').split(/\s+/);
        if (!parts || !parts.length) return {};
        var fenceOptions = {};
        return (
          parts.forEach(function (item) {
            var match;
            (match = /^[.]number((-?l)|L)ines/.exec(item))
              ? (fenceOptions.lineNumbers = !0)
              : (match = /^startFrom=['"](\d+)['"]$/.exec(item)) &&
                (fenceOptions.firstLineNumber = match[1] - 0);
          }),
          fenceOptions
        );
      };
    window.getCodeMirrorMode = function (trimmedText, rejectUnknown, nameOnly, canonicalLanguage) {
      var text = ((trimmedText = (trimmedText = trimmedText ? trimmedText.toLowerCase() : '')
          .replace(/^\s*\.*lang(uage)*-/g, '')
          .replace(/[{}]/g, '')
          .trim()).split(/[\s,]+/) || [trimmedText])[0],
        resolvedMode = g(trimmedText, nameOnly || canonicalLanguage, canonicalLanguage);
      return (
        resolvedMode ||
          trimmedText == text ||
          (resolvedMode = g(text.replace(/(^[.])|(,$)/g, ''), nameOnly, canonicalLanguage)),
        resolvedMode || (nameOnly ? text : rejectUnknown ? null : trimmedText)
      );
    };
    var textReplacements = null,
      replacementKeys = [];
    function x(codeMirror, changes) {
      if (File.isMac) {
        if (null == textReplacements)
          return (
            (textReplacements = {}),
            (replacementKeys = []),
            void bridge.callHandler('word.getTextReplacement', {}, (replacementMap) => {
              (textReplacements = replacementMap),
                (replacementKeys = Object.keys(textReplacements));
            })
          );
        if (1 == changes.length && '+input' == changes[0].origin) {
          var text = codeMirror.getWrapperElement().querySelector('textarea').value;
          text = text.substr(0, text.length - 1);
          var elements = replacementKeys.find((item) => text.endsWith(item));
          if (elements && textReplacements[elements]) {
            console.debug('handleUserReplacement', elements);
            var replacementEnd = Object.assign({}, codeMirror.getCursor('to')),
              replacementStart = Object.assign({}, replacementEnd);
            (replacementEnd.ch -= 1),
              (replacementStart.ch = replacementEnd.ch - elements.length),
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
    class C {
      constructor(inputEditor) {
        (this.getOptionsFromFencesAttr = y), (this.handleUserReplacement = x);
        var receiver = this;
        (this.editor = inputEditor),
          (this.queue = {}),
          this.cachedCharWidth,
          (this.editor.diagrams = new diagrams(inputEditor)),
          File.option.enableDiagram && (ALL = ALL.concat(diagrams.MODES)),
          File.option.gitlabMath && (ALL = ALL.concat('math')),
          (this.ALL = ALL),
          (this.autoCompleteRender = (text, isActive) =>
            `<li class="${isActive ? 'active' : ''}" data-content="${text.replace(/[']/g, '&quot;')}"><i class="marklyra-file-icon marklyra-fi-${languageIconAliases[text] || text}">${languageIconMarkup[languageIconAliases[text] || ''] || ''}</i><span>${text}</span></li>`),
          'shift+tab' === File.option.autoIndentKey ||
            File.option.shiftTabAutoIndent ||
            (CodeMirror.keyMap.default['Shift-Tab'] = 'indentLess'),
          jquery(document)
            .on('losefocus', '.md-fences', function () {
              var element = jquery(this),
                codeMirror = receiver.queue[element.attr('cid')];
              codeMirror &&
                (receiver.syncToNode(this.getAttribute('cid')),
                codeMirror.doc.setCursor(0, 0, { scroll: !1 }),
                element.find('.md-tooltip-remove').hide(),
                (element[0].style.marginBottom = ''),
                element.find('.md-fences-adv-panel').length &&
                  setTimeout(() => {
                    receiver.editor.selection.scrollAdjust();
                  }, 1));
            })
            .on('endfocus', '.md-fences', function () {
              var element = jquery(this);
              receiver.queue[element.attr('cid')] &&
                (element.find('.md-tooltip-remove').hide(), (element[0].style.marginBottom = ''));
            })
            .on('focus', '.marklyra-input', function () {
              var element = jquery(this).closest('[cid]'),
                codeMirror = receiver.queue[element.attr('cid')];
              codeMirror &&
                (receiver.syncToNode(this.getAttribute('cid')),
                codeMirror.doc.setCursor(0, 0, { scroll: !1 }));
            }),
          File.isWin &&
            ((CodeMirror.keyMap.default.End = 'goLineRight'),
            (CodeMirror.keyMap.default.Home = 'goLineLeft')),
          File.isMac &&
            bridge.registerHandler('fences.needUpdateReplaceDict', function (unusedParameter1) {
              (textReplacements = null), (replacementKeys = []);
            }),
          (this.scrollEntities = new WeakMap()),
          this.bindMouseEvents(),
          this.lazyload(),
          this.editor.diagrams.lazyload();
      }
      bindMouseEvents() {
        var receiver = this,
          currentEditor = this.editor;
        window.addEventListener(
          'mousedown',
          (unusedParameter1) => {
            receiver.isMousePressed = !0;
          },
          !0,
        ),
          window.addEventListener(
            'mouseup',
            (unusedParameter1) => {
              if (((receiver.isMousePressed = !1), receiver.cmNeedsScroll)) {
                var codeMirror = receiver.cmNeedsScroll;
                (receiver.cmNeedsScroll = null),
                  currentEditor.selection.typeWriterScroll(
                    codeMirror.cursorCoords(codeMirror.getCursor()),
                  );
              }
            },
            !0,
          ),
          (this.handleCursorActivity = (codeMirror) => {
            (receiver.cmNeedsScroll = null),
              (codeMirror.curOp && !codeMirror.curOp.scrollToPos) ||
                (File.isTypeWriterMode &&
                  File.option.scrollWithCursor &&
                  (receiver.isMousePressed
                    ? (receiver.cmNeedsScroll = codeMirror)
                    : currentEditor.selection.typeWriterScroll(
                        codeMirror.cursorCoords(codeMirror.getCursor()),
                      )));
          });
      }
      onLeaveDocument() {
        (this.queue = {}), this.intersectionObserve(null, !0);
      }
      clickEventHandled(keyboardEvent, nodeId) {
        var elementAtPoint, replayedMouseEvent, scrollY;
        this.queue[nodeId] ||
          ((scrollY = window.scrollY),
          this.getCm(nodeId),
          (scrollY -= window.scrollY),
          window.scrollBy(0, scrollY),
          (elementAtPoint = document.elementFromPoint(
            keyboardEvent.clientX,
            keyboardEvent.clientY,
          )) &&
            (keyboardEvent.stopPropagation(),
            (replayedMouseEvent = document.createEvent('MouseEvents')).initMouseEvent(
              'mousedown',
              !0,
              !0,
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
            ),
            elementAtPoint.dispatchEvent(replayedMouseEvent)),
          this.editor.refocus(nodeId));
      }
      getCm(nodeId) {
        if (this.queue[nodeId]) {
          if (jquery("[cid='" + nodeId + "'] textarea").length) return this.queue[nodeId];
          delete this.queue[nodeId];
        }
        if (!this.queue[nodeId]) return this.addCodeBlock(nodeId);
      }
      getValue(nodeId) {
        if (this.queue[nodeId]) return this.queue[nodeId].getValue();
        var blockElement = this.editor.findElemById(nodeId)[0];
        return blockElement ? blockElement.innerText : '';
      }
      onKeyDown(keyboardEvent, inputKeyboardEvent, editor, convertToParagraph, handleEnter) {
        var position,
          keyCode = inputKeyboardEvent.which || inputKeyboardEvent.keyCode,
          keyName = CodeMirror.keyName(inputKeyboardEvent),
          allowBlockNavigation =
            !inputKeyboardEvent.metaKey &&
            !inputKeyboardEvent.shiftKey &&
            !inputKeyboardEvent.ctrlKey;
        if (keyboardShortcuts.isKeySeq(inputKeyboardEvent, File.option.moveRowUpKey))
          return (
            inputKeyboardEvent.stopPropagation(),
            inputKeyboardEvent.preventDefault(),
            void keyboardEvent.execCommand('moveLineUp')
          );
        if (keyboardShortcuts.isKeySeq(inputKeyboardEvent, File.option.moveRowDownKey))
          return (
            inputKeyboardEvent.stopPropagation(),
            inputKeyboardEvent.preventDefault(),
            void keyboardEvent.execCommand('moveLineDown')
          );
        if ('Up' == CodeMirror.keyNames[keyCode]) {
          if ((position = keyboardEvent.getCursor()) && 0 == position.line) {
            if (allowBlockNavigation)
              return (
                editor.selection.moveUpOrDown(!0, inputKeyboardEvent),
                inputKeyboardEvent.codemirrorIgnore
              );
            if (
              0 == position.ch &&
              !inputKeyboardEvent.shiftKey &&
              ((File.isNode && inputKeyboardEvent.ctrlKey) ||
                (File.isMac && inputKeyboardEvent.metaKey))
            )
              return void (inputKeyboardEvent.codemirrorIgnore = !0);
          }
          inputKeyboardEvent.stopPropagation();
        } else if ('Down' == CodeMirror.keyNames[keyCode]) {
          if (
            (position = keyboardEvent.getCursor()) &&
            position.line >= keyboardEvent.lineCount() - 1
          ) {
            if (allowBlockNavigation)
              return (
                editor.selection.moveUpOrDown(!1, inputKeyboardEvent),
                inputKeyboardEvent.codemirrorIgnore
              );
            if (
              position.ch == keyboardEvent.doc.getLine(position.line).length &&
              !inputKeyboardEvent.shiftKey &&
              ((File.isNode && inputKeyboardEvent.ctrlKey) ||
                (File.isMac && inputKeyboardEvent.metaKey))
            )
              return void (inputKeyboardEvent.codemirrorIgnore = !0);
          }
          inputKeyboardEvent.stopPropagation();
        } else editor.selection.clearGlobalColumn();
        if ('Left' == CodeMirror.keyNames[keyCode]) {
          if (keyboardEvent.getSelection().length > 0) return;
          if (
            (position = keyboardEvent.doc.getCursor()) &&
            !position.line &&
            !position.ch &&
            allowBlockNavigation
          )
            return (
              editor.selection.moveUpOrDown(!0, inputKeyboardEvent, !0),
              inputKeyboardEvent.codemirrorIgnore
            );
          inputKeyboardEvent.stopPropagation();
        } else if ('Right' == CodeMirror.keyNames[keyCode]) {
          if (keyboardEvent.getSelection().length > 0) return;
          if (
            (position = keyboardEvent.doc.getCursor()) &&
            position.line >= keyboardEvent.lineCount() - 1 &&
            position.ch >= keyboardEvent.doc.getLine(position.line).length &&
            allowBlockNavigation
          )
            return (
              editor.selection.moveUpOrDown(!1, inputKeyboardEvent, !0),
              inputKeyboardEvent.codemirrorIgnore
            );
          inputKeyboardEvent.stopPropagation();
        } else if ('Backspace' == CodeMirror.keyNames[keyCode]) {
          if (
            (position = keyboardEvent.doc.getCursor()) &&
            keyboardEvent.lineCount() <= 1 &&
            !position.line &&
            !position.ch &&
            !keyboardEvent.getSelection().length
          )
            return (
              convertToParagraph(keyboardEvent),
              inputKeyboardEvent.preventDefault(),
              inputKeyboardEvent.codemirrorIgnore
            );
          inputKeyboardEvent.stopPropagation();
        } else if ('Delete' == CodeMirror.keyNames[keyCode]) {
          if ('' == keyboardEvent.getValue())
            return (
              convertToParagraph(keyboardEvent),
              inputKeyboardEvent.preventDefault(),
              inputKeyboardEvent.codemirrorIgnore
            );
          inputKeyboardEvent.stopPropagation();
        } else if ('PageDown' == CodeMirror.keyNames[keyCode]) {
          if (
            !(position = keyboardEvent.doc.getCursor(position)) ||
            keyboardEvent.doc.indexFromPos(position) >= keyboardEvent.doc.getValue().length
          )
            return (
              keyboardEvent.execCommand('goDocEnd'),
              editor.selection.moveUpOrDown(!1),
              void (inputKeyboardEvent.codemirrorIgnore = !0)
            );
        } else if ('PageUp' == CodeMirror.keyNames[keyCode]) {
          if (
            !(position = keyboardEvent.doc.getCursor()) ||
            (0 == position.line && 0 == position.ch)
          )
            return (
              keyboardEvent.execCommand('goDocStart'),
              editor.selection.moveUpOrDown(!0),
              void (inputKeyboardEvent.codemirrorIgnore = !0)
            );
        } else if (
          'Enter' == CodeMirror.keyNames[keyCode] &&
          handleEnter(keyboardEvent, inputKeyboardEvent)
        )
          return inputKeyboardEvent.codemirrorIgnore;
        (CodeMirror.keyMap.macDefault[keyName] || CodeMirror.keyMap.pcDefault[keyName]) &&
          inputKeyboardEvent.stopPropagation();
      }
      addCodeBlock(documentNode) {
        var currentEditor = this.editor,
          receiver = this;
        function r(codeMirror) {
          var currentDocumentNode = currentEditor.getNode(codeMirror.cid),
            UndoManager = currentEditor.undo.UndoManager,
            convertCommand = UndoManager.makeEmptyCommand();
          receiver.beforeDeleteFences(codeMirror.cid),
            convertCommand.undo.push({
              type: 'fences-pos',
              pos: codeMirror.getCursor(),
              id: codeMirror.cid,
            }),
            UndoManager.append(
              convertCommand,
              currentEditor.UserOp.backToParagraph(currentEditor, currentDocumentNode, !1),
            ),
            currentEditor.undo.register(convertCommand);
        }
        function s(codeMirror, keyboardEvent) {
          if (File.isMac ? keyboardEvent.metaKey : keyboardEvent.ctrlKey) {
            if (codeMirror.getSelection().length > 0) return;
            var position = codeMirror.doc.getCursor();
            if (
              codeMirror.lineCount() - 1 == position.line &&
              position.ch >= codeMirror.doc.getLine(position.line).length
            )
              return (
                currentEditor.UserOp.insertParagraph(!1),
                keyboardEvent.stopPropagation(),
                (keyboardEvent.codemirrorIgnore = !0),
                !0
              );
          }
        }
        function d(codeMirror, keyboardEvent) {
          receiver.onKeyDown(codeMirror, keyboardEvent, currentEditor, r, s);
        }
        function u(codeMirror) {
          currentEditor.refocus(documentNode.id),
            codeMirror.getWrapperElement().offsetHeight || codeMirror.refresh();
          var element = jquery(codeMirror.getWrapperElement()).closest('.md-fences');
          if (!element.find('.md-tooltip-remove').length) {
            var languageTooltip = v(element.attr('lang') || '');
            element[0].insertChildAtIndex(languageTooltip, 1),
              m.call(receiver, jquery(languageTooltip).find('.marklyra-input'), documentNode);
          }
          g(codeMirror),
            diagrams.isDiagramType(codeMirror.options.mode) &&
              currentEditor.diagrams.startPreview(codeMirror.cid),
            mathBlocks.isMathType(documentNode.get('lang')) &&
              currentEditor.diagrams.startPreview(codeMirror.cid),
            File.isMac && bridge.callHandler('touchBar.setFencesOnSetLang', !1);
        }
        function h(codeMirror, contextEvent) {
          File.isNodeHtml &&
            File.editor.contextMenu.show(contextEvent, codeMirror.getWrapperElement());
        }
        function p(codeMirror, cmChanges) {
          x(codeMirror, cmChanges),
            currentEditor.wordCount.quickUpdate(codeMirror.cid),
            currentEditor.selection.clearGlobalColumn(),
            diagrams.isDiagramType(codeMirror.options.mode) &&
              currentEditor.diagrams.updateDiagram(codeMirror.cid),
            mathBlocks.isMathType(documentNode.get('lang')) &&
              currentEditor.mathBlock.updateDiagram(codeMirror.cid),
            File.isTypeWriterMode &&
              !File.option.scrollWithCursor &&
              currentEditor.selection.typeWriterScroll(
                codeMirror.cursorCoords(codeMirror.getCursor()),
              ),
            documentNode.set('text', codeMirror.getValue()),
            cmChanges.length &&
              cmChanges[0].origin &&
              currentEditor.syncChange([
                { type: 'sync', id: codeMirror.cid, cmChanges: cmChanges },
              ]);
        }
        function f(codeMirror, selectionChange) {
          diagrams.isDiagramType(codeMirror.options.mode) &&
            selectionChange.ranges.length &&
            selectionChange.ranges[0].anchor.line != (codeMirror.getCursor() || {}).line &&
            currentEditor.diagrams.attachError(codeMirror);
        }
        function g(codeMirror, unusedParameter2) {
          codeMirror.hasFocus() &&
            (receiver.handleCursorActivity(codeMirror),
            currentEditor.wordCount.updateInSelection());
        }
        function b(unusedParameter1, event) {
          File.isTypeWriterMode && event.preventDefault();
        }
        function w(codeMirror, mouseEvent) {
          if ('TEXTAREA' !== document.activeElement.tagName) {
            var commonAncestorContainer = (currentEditor.selection.getRangy() || {})
              .commonAncestorContainer;
            if (
              commonAncestorContainer &&
              commonAncestorContainer == codeMirror.display.lineDiv &&
              codeMirror.display.lineDiv.contains(commonAncestorContainer)
            )
              return;
            mouseEvent.codemirrorIgnore = !0;
          }
        }
        if (
          ('string' == typeof documentNode && (documentNode = this.editor.getNode(documentNode)),
          documentNode)
        ) {
          if (
            !this.queue[documentNode.id] &&
            documentNode.get('type') == documentModel.TYPE.fences
          ) {
            var localElement = jquery('[cid = ' + documentNode.id + ']').removeClass('mock-cm');
            if (!localElement.length) return;
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
              styleSelectedText: !0,
              maxHighlightLength: 1 / 0,
              viewportMargin: 1 / 0,
              styleActiveLine: !0,
              autoCloseBrackets: !File.option.noPairingMatch,
              autoCloseTags: !File.option.noPairingMatch,
              theme: ' inner null-scroll',
              lineNumbers: File.option.showLineNumbersForFence,
              resetSelectionOnContextMenu: !0,
              cursorScrollMargin: 60,
              dragDrop: !1,
              indentUnit: File.option.codeIndentSize,
              tabSize: File.option.codeIndentSize,
              lineWiseCopyCut: File.option.lineWiseCopyCut,
              scrollbarStyle: 'null',
              value: documentNode.safeGetStrAttr('text'),
            };
            Object.assign(codeMirrorOptions, y(documentNode.get('lang')));
            var codeMirror = CodeMirror(
              localElement[0],
              codeMirrorOptions,
              this.editor,
              documentNode.id,
            );
            (this.queue[documentNode.id] = codeMirror),
              codeMirror.off('keydown', d),
              codeMirror.on('keydown', d),
              codeMirror.off('focus', u),
              codeMirror.on('focus', u),
              codeMirror.off('changes', p),
              codeMirror.on('changes', p),
              codeMirror.off('scrollCursorIntoView', b),
              codeMirror.on('scrollCursorIntoView', b),
              codeMirror.off('cursorActivity', g),
              codeMirror.on('cursorActivity', g),
              codeMirror.off('contextmenu', h),
              codeMirror.on('contextmenu', h),
              codeMirror.off('beforeSelectionChange', f),
              codeMirror.on('beforeSelectionChange', f),
              codeMirror.off('copy', w),
              codeMirror.on('copy', w),
              codeMirror.off('cut', w),
              codeMirror.on('cut', w),
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
                        if (hit.cid == isCm.cid && hit.isFutureCm)
                          firstHitIndex < 0 && (firstHitIndex = itemIndex),
                            (lastHitIndex = itemIndex),
                            (hit.isFutureCm = !1),
                            (hit.isCm = isCm);
                        else if (lastHitIndex > 0) break;
                      }
                      -1 != firstHitIndex &&
                        receiver.searchOn(isCm, searchStatus.searchText, searchStatus);
                    }
                  }
                }
              })(codeMirror),
              localElement
                .children('.CodeMirror')
                .attr('lang', (documentNode.get('lang') || '').toLowerCase()),
              this.modeLoaded && localElement.addClass('modeLoaded'),
              !File.option.showLineNumbersForFence &&
                codeMirrorOptions.lineNumbers &&
                localElement.addClass('md-fences-with-lineno'),
              advancedPanel.length && localElement.append(advancedPanel);
            var currentElement = localElement.closest('li');
            currentElement.length &&
              ((currentElement[0].style.display = 'block'), (currentElement[0].style.display = ''));
          }
          return this.editor.tryEnterBusyModeWithDelay(), this.queue[documentNode.id];
        }
      }
      toggleFocusedComponent() {
        var activeElement = document.activeElement,
          element = jquery(activeElement).closest('.md-fences');
        if (element.length)
          if (
            activeElement.classList &&
            activeElement.classList.contains('marklyra-cm-lang-input')
          ) {
            var nodeId = element.attr('cid'),
              codeMirror = this.getCm(nodeId),
              cursorPosition = codeMirror.getCursor();
            codeMirror.focus(), codeMirror.setCursor(cursorPosition);
          } else
            element
              .find('.CodeMirror-focused')
              .removeClass('CodeMirror-focused')
              .end()
              .find('.marklyra-input')
              .show()
              .focus();
      }
      focus(nodeOrId) {
        var nodeId = 'string' == typeof nodeOrId ? nodeOrId : nodeOrId.id;
        this.getCm(nodeId).focus();
      }
      getFocused() {
        for (var nodeId in this.queue)
          if (this.queue.hasOwnProperty(nodeId) && this.queue[nodeId].hasFocus())
            return this.queue[nodeId];
      }
      updateCodeNum() {
        for (var nodeId in this.queue) this.editor.getNode(nodeId) || delete this.queue[nodeId];
      }
      copyContent() {
        var documentNode = this.editor.getNode(null, !0),
          setClipboard = this.editor.UserOp.setClipboard,
          text = documentNode.get('text');
        setClipboard(
          `<pre lang='${documentNode.get('lang') || ''}'>${utilities.escape(text)}</pre>`,
          void 0,
          text,
          !0,
        );
      }
      formatContent(selectionOnly) {
        var codeMirror;
        if (this.editor.sourceView.inSourceMode) codeMirror = this.editor.sourceView.cm;
        else {
          var documentNode = this.editor.getNode(null, !0);
          if (
            !(codeMirror = (this.editor.findElemById(documentNode.id).find('.CodeMirror')[0] || {})
              .CodeMirror)
          )
            return void File.editor.UserOp.lessIndent(File.editor);
        }
        var selections = codeMirror.listSelections();
        selectionOnly || codeMirror.execCommand('selectAll'),
          codeMirror.execCommand('indentAuto'),
          selectionOnly || codeMirror.setSelections(selections);
      }
      syncToNode(nodeId) {
        var documentNode, codeMirror;
        (documentNode = 'string' == typeof nodeId ? this.editor.getNode(nodeId) : nodeId) &&
          ((codeMirror = this.getCm(documentNode.id)),
          documentNode.get('text') !== codeMirror.getValue() &&
            documentNode.set('text', codeMirror.getValue()));
      }
      decorateAll() {
        this.refreshEditor(!0, !1);
      }
      intersectionObserve(blockElement, intersectionObserver) {
        this.continueRenderTimer && clearTimeout(this.continueRenderTimer),
          this.intersectionObserver &&
            intersectionObserver &&
            this.intersectionObserver.disconnect();
        var receiver = this;
        blockElement &&
          (this.intersectionObserver ||
            (this.intersectionObserver = new IntersectionObserver(function (items) {
              items.forEach(function (item) {
                var timerId = receiver.scrollEntities.get(item.target);
                if ((timerId && clearTimeout(timerId), !(item.intersectionRatio <= 0))) {
                  if (File.editor.isScrolling())
                    return (
                      (timerId = setTimeout(
                        function () {
                          receiver.addCodeBlock(item.target.getAttribute('cid')),
                            receiver.intersectionObserver &&
                              receiver.intersectionObserver.unobserve(item.target),
                            receiver.scrollEntities.delete(item.target);
                        },
                        File.inBusyMode ? 1e3 : 0,
                      )),
                      void receiver.scrollEntities.set(item.target, timerId)
                    );
                  receiver.scrollEntities.delete(item.target),
                    receiver.addCodeBlock(item.target.getAttribute('cid')),
                    receiver.intersectionObserver &&
                      receiver.intersectionObserver.unobserve(item.target);
                }
              });
            })),
          this.intersectionObserver.observe(blockElement));
      }
      refreshEditor(forceCreate, refreshExisting, rootElement) {
        if (this.modeLoaded) {
          var receiver = this,
            registeredCount = 0;
          for (var currentNodeId in this.queue) {
            var nodeElement = this.editor.findElemById(currentNodeId);
            if (nodeElement.find('.CodeMirror').length && this.editor.getNode(currentNodeId)) {
              var registeredEditor = this.queue[currentNodeId];
              if (nodeElement.hasClass('modeLoaded')) refreshExisting && registeredEditor.refresh();
              else {
                var documentNode = this.editor.getNode(currentNodeId);
                registeredEditor.setOption('mode', getCodeMirrorMode(documentNode.get('lang'))),
                  registeredEditor.refresh();
              }
              registeredCount++;
            } else delete this.queue[currentNodeId];
          }
          var elements = (rootElement || document).querySelectorAll("[mdtype='fences']"),
            eagerEditorLimit = window.IntersectionObserver ? 8 : 30,
            createdCount = 0;
          elements.length != registeredCount &&
            elements.forEach(function (element) {
              var nodeId = element.getAttribute('cid');
              receiver.queue[nodeId]
                ? !rootElement && createdCount++
                : forceCreate || (!File.inBusyMode && createdCount < eagerEditorLimit)
                  ? (receiver.addCodeBlock(nodeId), createdCount++)
                  : window.IntersectionObserver && receiver.intersectionObserve(element);
            });
        }
      }
      lazyload() {
        var receiver = this;
        jquery
          .getScript(
            (File.isNode && !window.debugMode ? './lib.asar' : './lib') + '/codemirror/mode.min.js',
          )
          .then(function () {
            (receiver.modeLoaded = !0),
              console.debug('codemirror mode is loaded, refreshing editor'),
              receiver.refreshEditor(),
              receiver.editor.tryEnterBusyModeWithDelay();
          });
      }
      jumpCmEnd(nodeOrEditor) {
        var nodeId = nodeOrEditor,
          codeMirror = nodeOrEditor;
        'string' == typeof nodeId ? (codeMirror = this.getCm(nodeId)) : (nodeId = codeMirror.cid);
        var line = 0,
          characterOffset = 0;
        codeMirror &&
          ((line = codeMirror.doc.lastLine()),
          (characterOffset = codeMirror.doc.getLine(line).length),
          codeMirror.focus(),
          codeMirror.setCursor({ line: line, ch: characterOffset }));
      }
      jumpCmBegin(nodeOrEditor) {
        var codeMirror = nodeOrEditor;
        'string' == typeof codeMirror && (codeMirror = this.getCm(codeMirror)),
          codeMirror.focus(),
          codeMirror.setCursor({ line: 0, ch: 0 });
      }
      beforeDeleteFences(nodeId, items) {
        var codeMirror, documentNode;
        'string' == typeof nodeId
          ? ((codeMirror = this.queue[nodeId]), (documentNode = this.editor.getNode(nodeId)))
          : ((documentNode = nodeId), (codeMirror = this.queue[documentNode.id])),
          codeMirror &&
            (documentNode.get('text') !== codeMirror.getValue() &&
              documentNode.set('text', codeMirror.getValue()),
            codeMirror.doc.clearHistory(),
            delete this.queue[documentNode.id],
            items &&
              items.map(function (item) {
                item &&
                  (item.id == documentNode.id &&
                  item.json &&
                  item.json.content &&
                  item.json.content.type == documentModel.TYPE.fences
                    ? (item.json.content.text = documentNode.get('text'))
                    : Array.isArray(item.json) &&
                      item.json.map(function (inputItem) {
                        inputItem.id == documentNode.id &&
                          inputItem.content.type == documentModel.TYPE.fences &&
                          (inputItem.content.text = documentNode.get('text'));
                      }));
              }));
      }
      searchOn(codeMirror, text, searchOptions) {
        (this.searchStatus = this.searchStatus || {}),
          (this.searchStatus.overlay = this.searchStatus.overlay || {}),
          (this.searchStatus.queue = this.searchStatus.queue || []);
        var searchPattern = null;
        if (searchOptions.useRegexp)
          try {
            searchOptions.wholeWord && (text = `\\b${text.replace(/^\\b|\\b$/g, '')}\\b`),
              (searchPattern = new RegExp(text, searchOptions.caseSensitive ? 'g' : 'gi'));
          } catch (error) {
            return;
          }
        else
          searchPattern = searchOptions.wholeWord
            ? new RegExp(
                '\\b' + utilities.escapeRegExp(text) + '\\b',
                searchOptions.caseSensitive ? 'g' : 'gi',
              )
            : new RegExp(utilities.escapeRegExp(text), searchOptions.caseSensitive ? 'g' : 'gi');
        (this.searchStatus.overlay[codeMirror.cid || 'source'] = (function (inputSearchExp) {
          return {
            searchExp: inputSearchExp,
            token: function (stream) {
              var searchExp = this.searchExp;
              searchExp.lastIndex = stream.pos;
              var match = searchExp.exec(stream.string);
              return match && match.index == stream.pos
                ? ((stream.pos += match[0].length || 1), 'search-hit')
                : (match ? (stream.pos = match.index) : stream.skipToEnd(), null);
            },
          };
        })(searchPattern)),
          codeMirror.addOverlay(this.searchStatus.overlay[codeMirror.cid || 'source']),
          this.searchStatus.queue.push(codeMirror);
      }
      clearSearchOn(codeMirror) {
        this.searchStatus &&
          (codeMirror.removeOverlay(this.searchStatus.overlay[codeMirror.cid || 'source']),
          this.searchStatus.queue.remove(codeMirror));
      }
      clearSearchAll() {
        if (this.editor.sourceView.inSourceMode)
          return (
            this.searchStatus &&
              this.editor.sourceView.cm.removeOverlay(this.searchStatus.overlay.source),
            void (this.searchStatus = null)
          );
        this.searchStatus &&
          this.searchStatus.overlay &&
          this.searchStatus.queue.forEach(function (item) {
            this.searchStatus.overlay[item.cid] &&
              item.removeOverlay(this.searchStatus.overlay[item.cid]);
          }, this),
          (this.searchStatus = null);
      }
      renderFences(sourceText) {
        return C.renderFences(sourceText);
      }
      tryAddLangUndo(documentNode, element) {
        if (
          (element || (element = document.activeElement),
          !element.classList || !element.classList.contains('marklyra-cm-lang-input'))
        )
          return !1;
        if (
          (documentNode ||
            (documentNode = this.editor.getNode(jquery(element).closest('[cid]').attr('cid'))),
          !documentNode)
        )
          return !1;
        var previousLanguage = documentNode.get('lang') || '',
          nextLanguage = element.textContent || '';
        return (
          previousLanguage != nextLanguage &&
          (documentNode.attr('lang', nextLanguage, this.editor, !1), !0)
        );
      }
      getCodeLangSuggest(fromMenu) {
        var defaultCodeLangOption =
            (fromMenu
              ? File.option.DefaultCodeLangOptionMenu
              : File.option.DefaultCodeLangOptionCode) || 0,
          configuredLanguage = this.editor.localSettingBridge.getSetting('defaultCodeLang');
        return '__LAST' ===
          (configuredLanguage =
            File.option.defaultCodeLangOption & defaultCodeLangOption ? configuredLanguage : '')
          ? this.lastCodeLang || ''
          : configuredLanguage;
      }
      autoSuggestCodeLang(keyboardEvent) {
        var key = keyboardEvent.key;
        if ('`' != key && '~' != key) return !1;
        var element = this.editor.getMarkElem();
        if (element.attr('mdtype') == documentModel.TYPE.paragraph) {
          var suggestedLanguage = this.getCodeLangSuggest(!1);
          if (suggestedLanguage) {
            if ('``' === element.rawText() && '`' == key);
            else if ('~~' !== element.rawText() || '~' != key) return !1;
            return (
              this.editor.selection.jumpIntoElemEnd(element),
              this.editor.insertText(key),
              setTimeout(() => {
                this.editor.undo.endSnap(!0),
                  this.editor.selection.jumpIntoElemEnd(element),
                  this.editor.insertText(suggestedLanguage),
                  this.editor.brush.brushNode(element.attr('cid')),
                  editor.selection.restoreSelection(element[0], {
                    start: 3,
                    end: 3 + suggestedLanguage.length,
                  });
              }, 0),
              !0
            );
          }
        }
      }
    }
    (C.renderFencesByUpdate = function (documentNode, element, language) {
      if (
        (element.classList.remove('md-diagram'),
        element.classList.remove('md-fences-math'),
        element.classList.remove('md-fences-advanced'),
        diagrams.isDiagramType(language))
      ) {
        element.classList.add('md-diagram'), element.classList.add('md-fences-advanced');
        var nodeElement = File.editor.findElemById(documentNode.cid);
        if (nodeElement.find('textarea').val() == documentNode.get('text')) {
          var diagramPanel = nodeElement.find('.md-diagram-panel').clone()[0];
          diagramPanel && element.appendChild(diagramPanel);
        }
      }
      mathBlocks.isMathType(language) &&
        (element.classList.add('md-fences-math'),
        element.classList.add('md-fences-advanced'),
        element.setAttribute('id', 'mathjax-' + documentNode.cid));
    }),
      (C.renderFences = function (documentNode) {
        var PREElement = document.createElement('PRE');
        PREElement.classList.add('md-fences'),
          PREElement.classList.add('mock-cm'),
          PREElement.classList.add('md-end-block'),
          File.option.showLineNumbersForFence && PREElement.classList.add('md-fences-with-lineno');
        var language = documentNode.get('lang'),
          text = documentNode.get('text');
        return (
          PREElement.setAttribute('spellcheck', 'false'),
          PREElement.setAttribute('contenteditable', 'false'),
          PREElement.setAttribute('lang', language || ''),
          PREElement.setAttribute('cid', documentNode.cid),
          PREElement.setAttribute('mdtype', documentNode.get('type')),
          (PREElement.innerText = text),
          PREElement.innerText || (PREElement.innerHTML = '<br/>'),
          C.renderFencesByUpdate(documentNode, PREElement, language),
          PREElement.outerHTML
        );
      }),
      (moduleRecord.exports = C),
      (window.CodeMirror = CodeMirror),
      (window.Fences = C);
  },
);
