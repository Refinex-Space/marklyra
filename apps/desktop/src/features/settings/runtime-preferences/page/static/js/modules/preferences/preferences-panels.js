// Webpack module 36: preferences-panels.
// Registration order and sparse array indices are defined in bundles.json.
(function (moduleRecord, moduleExports, webpackRequire) {
  'use strict';
  var objectSpread = webpackRequire(6),
    assertThisInitialized = webpackRequire(11),
    objectWithoutProperties = webpackRequire(3),
    classCallCheck = webpackRequire(15),
    createClass = webpackRequire(16),
    inherits = webpackRequire(18),
    possibleConstructorReturn = webpackRequire(17),
    react = webpackRequire(0),
    reactDefault = webpackRequire.n(react),
    reactDom = webpackRequire(10),
    reactDomDefault = webpackRequire.n(reactDom),
    localization = (webpackRequire(30), webpackRequire(46), webpackRequire(1)),
    searchAndPlatform = webpackRequire(4),
    icons = webpackRequire(8),
    controls = webpackRequire(2),
    imageUploader = webpackRequire(34);
  function v() {
    var component = this;
    return reactDefault.a.createElement(
      controls.o,
      { active: 5 == this.state.activeTab, 'data-index': '5' },
      this.panelHeader('Appearance'),
      reactDefault.a.createElement(controls.d, { visible: window.isMac }, null),
      reactDefault.a.createElement(controls.d, { forWin: !0, visible: window.isMacNode }, null),
      reactDefault.a.createElement(
        controls.k,
        { title: 'Font Size' },
        reactDefault.a.createElement(controls.g, {
          value: !!this.getValue('useCustomFontSize'),
          customValue: this.getValue('customFontSize'),
          onChange: this.onChange,
        }),
      ),
      reactDefault.a.createElement(
        controls.k,
        { title: 'Zoom' },
        reactDefault.a.createElement(
          controls.d,
          { forMac: !0 },
          reactDefault.a.createElement(controls.v, {
            rows: [
              [
                reactDefault.a.createElement(controls.r, {
                  keyName: 'zoomFactor',
                  optionsList: [
                    [0.5, '50%'],
                    [0.67, '67%'],
                    [0.8, '80%'],
                    [0.9, '90%'],
                    ['_seperator'],
                    [1, '100%'],
                    ['_seperator'],
                    [1.1, '110%'],
                    [1.25, '125%'],
                    [1.5, '150%'],
                    [1.75, '175%'],
                    [2, '200%'],
                  ],
                  value: this.getValue('zoomFactor') || 1,
                  onChange: this.onChange,
                }),
                reactDefault.a.createElement(controls.b, {
                  label: 'Reset to Default',
                  onClick: function () {
                    component.onChange('zoomFactor', 1);
                  },
                }),
              ],
            ],
          }),
        ),
        reactDefault.a.createElement(
          controls.d,
          { forWin: !0, forLinux: !0 },
          reactDefault.a.createElement(controls.v, {
            rows: [
              [
                reactDefault.a.createElement(controls.r, {
                  keyName: 'zoomLevel',
                  optionsList: [
                    [-3, '57%'],
                    [-2, '69%'],
                    [-1, '83%'],
                    ['_seperator'],
                    [0, '100%'],
                    ['_seperator'],
                    [1, '120%'],
                    [2, '144%'],
                    [3, '172%'],
                    [4, '207%'],
                    [5, '248%'],
                    [6, '298%'],
                  ],
                  value: this.getValue('zoomLevel') || 0,
                  onChange: this.onChange,
                }),
                reactDefault.a.createElement(controls.b, {
                  label: 'Reset to Default',
                  onClick: function () {
                    component.onChange('zoomLevel', 0);
                  },
                }),
              ],
            ],
          }),
        ),
        reactDefault.a.createElement(controls.c, {
          label: Object(localization.a)('Zoom when using mouse wheel and holding %@ key').replace(
            '%@',
            window.isMac ? 'Command' : 'Ctrl',
          ),
          keyName: 'zoomByMouse',
          checked: !!this.getValue('zoomByMouse'),
          onChange: this.onChange,
        }),
      ),
      reactDefault.a.createElement(
        controls.d,
        { forMac: !0 },
        reactDefault.a.createElement(
          controls.k,
          { title: 'Word Count' },
          reactDefault.a.createElement(controls.c, {
            label: 'Always Show Word Count',
            keyName: 'always_show_wordcount',
            checked: !!this.getValue('always_show_wordcount'),
            onChange: this.onChange,
          }),
          reactDefault.a.createElement(
            controls.q,
            { style: { marginBottom: '0' }, keyWords: ['Reading Speed'] },
            reactDefault.a.createElement(controls.t, { label: 'Reading Speed' }),
            ':',
            reactDefault.a.createElement(controls.n, {
              keyName: 'wordsPerMinute',
              style: { width: '60px', margin: '0 8px', paddingLeft: '8px' },
              value: this.getValue('wordsPerMinute') || 382,
              onChange: this.onChange,
              size: 3,
              min: 1,
              max: 999,
            }),
            reactDefault.a.createElement(controls.t, {
              label: 'words / min',
              style: { width: '60px', marginRight: '12px' },
            }),
            reactDefault.a.createElement(controls.s, {
              label: 'Reset to Default',
              onClick: function () {
                component.resetWordsPerMinute();
              },
              options: {
                120: '120  words/minute (Slow)',
                240: '240  words/minute (Medium)',
                382: '382  words/minute (Fast)',
              },
              onExtra: function (readingSpeed) {
                component.resetWordsPerMinute(readingSpeed - 0);
              },
            }),
          ),
        ),
      ),
      reactDefault.a.createElement(
        controls.d,
        { forWin: !0, forLinux: !0 },
        reactDefault.a.createElement(
          controls.k,
          { title: 'Status Bar' },
          reactDefault.a.createElement(controls.c, {
            label: 'Show status bar',
            keyName: 'showStatusBar',
            checked: !!this.getValue('showStatusBar'),
            onChange: this.onChange,
          }),
        ),
        reactDefault.a.createElement(
          controls.k,
          { title: 'Word Count' },
          reactDefault.a.createElement(
            controls.q,
            { style: { marginTop: '-4px' } },
            reactDefault.a.createElement(controls.t, { label: 'Reading Speed' }),
            ':\xa0\xa0',
            reactDefault.a.createElement(controls.n, {
              keyName: 'wordsPerMinute',
              style: { width: '60px', margin: '0 8px 0 0', paddingLeft: '8px' },
              value: this.getValue('wordsPerMinute') || 382,
              onChange: this.onChange,
              size: 3,
              min: 1,
              max: 999,
            }),
            reactDefault.a.createElement(controls.t, {
              label: 'words / min',
              style: { width: '60px', marginRight: '12px' },
            }),
            reactDefault.a.createElement(controls.s, {
              label: 'Reset to Default',
              onClick: function () {
                component.resetWordsPerMinute();
              },
              options: {
                120: '120  words/minute (Slow)',
                240: '240  words/minute (Medium)',
                382: '382  words/minute (Fast)',
              },
              onExtra: function (readingSpeed) {
                component.resetWordsPerMinute(readingSpeed - 0);
              },
            }),
          ),
        ),
      ),
      reactDefault.a.createElement(
        controls.k,
        { title: 'Themes', hintLink: 'https://github.com/Refinex-Space/marklyra' },
        (function () {
          var currentItems = component.getValue('allThemes') || [];
          if (
            (window.isNode ||
              window.__MARKLYRA_SETTINGS_BRIDGE__ ||
              (currentItems = ['themeA', 'themeB']),
            !currentItems.length)
          )
            return null;
          var currentOptions = {};
          currentItems.forEach(function (text) {
            currentOptions[text] = text
              .replace(/\.css$/, '')
              .replace(
                /(^|-|_)(\w)/g,
                function (unusedParameter1, wordSeparator, initialCharacter, unusedParameter4) {
                  return (wordSeparator ? ' ' : '') + initialCharacter.toUpperCase();
                },
              );
          });
          var canUseDarkTheme = window.isNode || window._options.canUseDarkMode,
            checked = canUseDarkTheme && !!component.getValue('useSeparateDarkTheme'),
            rows = [
              [
                reactDefault.a.createElement(controls.t, {
                  label: checked ? 'Light Theme' : 'Theme',
                }),
                reactDefault.a.createElement(controls.r, {
                  onChange: component.onChange,
                  keyName: 'theme',
                  value: component.getValue('theme'),
                  options: currentOptions,
                }),
              ],
            ];
          return (
            checked &&
              rows.push([
                reactDefault.a.createElement(controls.t, { label: 'Dark Theme' }),
                reactDefault.a.createElement(controls.r, {
                  onChange: component.onChange,
                  keyName: 'darkTheme',
                  value: component.getValue('darkTheme') || component.getValue('theme'),
                  options: currentOptions,
                }),
              ]),
            reactDefault.a.createElement(
              reactDefault.a.Fragment,
              null,
              reactDefault.a.createElement(controls.v, { rows: rows }),
              canUseDarkTheme
                ? reactDefault.a.createElement(controls.c, {
                    label: 'Use separate theme in dark mode',
                    keyName: 'useSeparateDarkTheme',
                    checked: checked,
                    onChange: component.onChange,
                    hint: 'Supported on macOS \u2265 10.15 or Windows 10 \u2265 1903',
                  })
                : null,
            )
          );
        })(),
        reactDefault.a.createElement(
          controls.q,
          { keyWords: ['Open Theme Folder', 'MarkLyra Project'], style: { marginTop: '6px' } },
          reactDefault.a.createElement(
            'span',
            { style: { minWidth: '40%', display: 'inline-block', marginRight: '8px' } },
            reactDefault.a.createElement(controls.b, {
              label: 'Open Theme Folder',
              onClick: function () {
                window.Setting.openFolder(component.getValue('currentThemeFolder'));
              },
            }),
          ),
          reactDefault.a.createElement(controls.b, {
            label: 'MarkLyra Project',
            onClick: function () {
              window.Setting.openLink('https://github.com/Refinex-Space/marklyra');
            },
          }),
        ),
      ),
    );
  }
  var arrayLikeToArray = webpackRequire(28);
  var unsupportedIterableToArray = webpackRequire(25);
  function E(e) {
    return (
      (function (e) {
        if (Array.isArray(e)) return Object(arrayLikeToArray.a)(e);
      })(e) ||
      (function (e) {
        if ('undefined' !== typeof Symbol && Symbol.iterator in Object(e)) return Array.from(e);
      })(e) ||
      Object(unsupportedIterableToArray.a)(e) ||
      (function () {
        throw new TypeError(
          'Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.',
        );
      })()
    );
  }
  var slicedToArray = webpackRequire(5),
    paperSizes = webpackRequire(24),
    defaultThemeOptions = { '': 'Current Theme' },
    themeOptions = defaultThemeOptions,
    N = function (excludeDarkThemes) {
      var themeLabels = { '': Object(localization.a)('Current Theme') },
        currentItems = this.getValue('allThemes') || [];
      return (
        window.isNode ||
          window.__MARKLYRA_SETTINGS_BRIDGE__ ||
          (currentItems = ['themeA', 'themeB']),
        currentItems.length
          ? (currentItems.forEach(function (text) {
              (excludeDarkThemes && (text.indexOf('night') > -1 || text.indexOf('dark') > -1)) ||
                (themeLabels[
                  text
                    .replace(/\.css$/, '')
                    .toLowerCase()
                    .replace(/ /g, '-')
                ] = text
                  .replace(/\.css$/, '')
                  .replace(
                    /(^|-|_)(\w)/g,
                    function (unusedParameter1, wordSeparator, initialCharacter, unusedParameter4) {
                      return (wordSeparator ? ' ' : '') + initialCharacter.toUpperCase();
                    },
                  ));
            }),
            themeLabels)
          : null
      );
    },
    pageExportFields = {
      paper: { type: 'paper', label: 'Paper Size', default: window.isMac ? '' : 'A4' },
      exportTheme: {
        type: 'themeSelect',
        excludeDark: !1,
        label: 'Theme',
        hint: 'Change this option to specify a separated theme for export.',
      },
      splitPages: {
        type: 'checkbox',
        label: 'Page Break',
        checkboxLabel: 'Page Break Between Top Headings',
      },
      header: {
        type: 'string',
        label: 'Header',
        default: '',
        placeholder: 'None',
        presetOptions: ['${title}', '${author}', '${pageNo}', '${today}'],
        hintLink: 'https://github.com/Refinex-Space/marklyra',
      },
      footer: {
        type: 'string',
        label: 'Footer',
        default: '',
        placeholder: 'None',
        presetOptions: [
          '${title}',
          'No. ${pageNo} / ${totalPages}',
          'Written in MarkLyra',
          'CONFIDENTIAL',
        ],
        hintLink: 'https://github.com/Refinex-Space/marklyra',
      },
      author: {
        type: 'string',
        label: 'Author',
        placeholder: 'Empty',
        hintLink: 'https://github.com/Refinex-Space/marklyra',
      },
      appendBody: {
        type: 'textarea',
        label: 'Append Extra Content (HTML)',
        hintLink: 'https://github.com/Refinex-Space/marklyra',
      },
      allowPerFileSetting: {
        type: 'checkbox',
        label: 'General',
        checkboxLabel: 'Read and overwrite export settings from YAML front matters',
        hintLink: 'https://github.com/Refinex-Space/marklyra',
      },
    },
    htmlInjectionFields = {
      appendHead: {
        type: 'textarea',
        label: 'Append in <head />',
        hintLink: 'https://github.com/Refinex-Space/marklyra',
      },
      appendBody: {
        type: 'textarea',
        label: 'Append in <body />',
        hintLink: 'https://github.com/Refinex-Space/marklyra',
      },
      allowPerFileSetting: {
        type: 'checkbox',
        label: 'General',
        checkboxLabel: 'Read and overwrite export settings from YAML front matters',
        hintLink: 'https://github.com/Refinex-Space/marklyra',
      },
      openExportLocation: !0,
    },
    htmlExportFields = Object(objectSpread.a)(
      {
        sidebar: {
          type: 'checkbox',
          checkboxLabel: 'Include Outline Sidebar',
          label: 'Outline',
          dictGroup: 'Menu',
        },
        exportTheme: {
          type: 'themeSelect',
          label: 'Theme',
          hint: 'Change this option to specify a separated theme for export.',
        },
      },
      htmlInjectionFields,
    ),
    imageExportFields = {
      imageWidth: { label: 'Width', type: 'number', unit: 'px', default: 640, withReset: !0 },
      quality: {
        label: 'Image Quality',
        valueType: 'number',
        type: 'select',
        default: 0,
        options: { 0: 'Auto', 1: 'Medium', 2: 'High', 3: 'Best' },
        hintLink: 'https://github.com/Refinex-Space/marklyra',
      },
      fontSize: {
        label: 'Font Size',
        type: 'group',
        content: [
          {
            key: 'useThemeFontSize',
            type: 'radio',
            valueType: 'number',
            options: { 0: 'Use custom font size', 1: 'Use theme font size' },
            default: 0,
          },
          {
            key: 'imageFontSize',
            type: 'number',
            style: window.__MARKLYRA_SETTINGS_BRIDGE__ ? { marginTop: 8 } : void 0,
            unit: 'px',
            default: 24,
            withReset: !0,
            visible: function (exportConfig) {
              return !exportConfig.useThemeFontSize;
            },
          },
        ],
      },
      exportTheme: {
        type: 'themeSelect',
        label: 'Theme',
        hint: 'Change this option to specify a separated theme for export.',
      },
    },
    commandExportFields = {
      command: {
        type: 'string',
        label: 'Command',
        placeholder: "e.g: git commit -am 'save'; git push;",
        hintLink: 'https://github.com/Refinex-Space/marklyra',
      },
      'command-warning': {
        type: 'dom',
        render: function (renderProps) {
          var app = renderProps.app;
          return reactDefault.a.createElement(controls.w, {
            text: 'You are using the Snap version, it may have limited access to your local executables.',
            link: 'Snap',
            app: app,
          });
        },
        label: ' ',
        visible: function (exportConfig) {
          return (
            window.process &&
            'marklyra' == window.process.env.SNAP_NAME &&
            (exportConfig.command || '').trim().length
          );
        },
      },
      saveDialog: {
        type: 'select',
        label: 'Show Save File Dialog',
        options: {
          '': 'Do not popup save file dialog',
          saveFile: 'Select file path to save',
          saveFolder: 'Select folder path to save',
        },
      },
      extensions: {
        type: 'string',
        label: 'Target File Extensions (separate by whitespace)',
        visible: function (exportConfig) {
          return 'saveFile' == exportConfig.saveDialog;
        },
      },
    },
    extraArgumentFields = {
      extraArguments: {
        default: '',
        type: 'string',
        label: 'Extra Arguments',
        hintLink: 'https://github.com/Refinex-Space/marklyra',
      },
    },
    targetFormatFields = {
      targetFormat: {
        label: 'Target Format',
        type: 'string',
        placeholder: '',
        suggest: [
          'asciidoc',
          'asciidoctor',
          'beamer',
          'bibtex',
          'biblatex',
          'commonmark',
          'commonmark_x',
          'context',
          'csljson',
          'docbook',
          'docbook4',
          'docbook5',
          'docx',
          'dokuwiki',
          'epub',
          'epub2',
          'epub3',
          'fb2',
          'gfm',
          'markdown_github',
          'haddock',
          'html',
          'html4',
          'html5',
          'icml',
          'ipynb',
          'jats_archiving',
          'jats_articleauthoring',
          'jats_publishing',
          'jats',
          'jira',
          'json',
          'latex',
          'man',
          'markdown',
          'markdown_mmd',
          'markdown_phpextra',
          'markdown_strict',
          'mediawiki',
          'ms',
          'muse',
          'native',
          'odt',
          'opml',
          'opendocument',
          'org',
          'pdf',
          'plain',
          'pptx',
          'rst',
          'rtf',
          'texinfo',
          'textile',
          'slideous',
          'slidy',
          'dzslides',
          'revealjs',
          's5',
          'tei',
          'xwiki',
          'zimwiki',
        ],
      },
      hintLink: 'https://github.com/Refinex-Space/marklyra',
    },
    customPandocFields = Object(objectSpread.a)(
      {
        arg: {
          default: '-f native -s -o ${outputPath}',
          type: 'string',
          label: 'Arguments',
          disabled: !0,
        },
        targetFormat: {
          label: 'Target Format',
          type: 'string',
          placeholder: 'auto detect based on target file path',
          suggest: [
            'pdf',
            'docx',
            'odt',
            'rtf',
            'epub',
            'latex',
            'mediawiki',
            'rst',
            'textile',
            'opml',
          ],
          onChange: function (text, setField) {
            text && text.trim()
              ? setField('arg', '-f native -s -o ${outputPath} -t ' + text)
              : setField('arg', '-f native -s -o ${outputPath}');
          },
          hintLink: 'https://github.com/Refinex-Space/marklyra',
        },
        extensions: {
          label: 'Target File Extensions (separate by whitespace)',
          type: 'string',
          placeholder: 'e.g: .text .asciidoc or leave this empty',
        },
        raw: {
          label: 'Raw Type',
          type: 'select',
          options: {
            '': 'Auto',
            html: 'html',
            mediawiki: 'mediawiki',
            rst: 'rst',
            textile: 'textile',
            latex: 'latex',
            docx: 'docx',
            opml: 'opml',
          },
          hintLink: 'https://github.com/Refinex-Space/marklyra',
        },
      },
      extraArgumentFields,
    ),
    pdfExportFields = Object(objectSpread.a)(
      Object(objectSpread.a)(
        {
          arg: {
            default: '-f native -s -o ${outputPath}',
            type: 'string',
            label: 'Arguments',
            disabled: !0,
          },
          'pdf-engine': {
            label: 'PDF Engine',
            type: 'string',
            arg: '--pdf-engine',
            suggest: [
              'pdflatex',
              'lualatex',
              'xelatex',
              'latexmk',
              'tectonic',
              'wkhtmltopdf',
              'weasyprint',
              'prince',
              'context',
              'pdfroff',
            ],
            onChange: function (unusedParameter1, setField, exportConfig) {
              setField(
                'arg',
                '-f native -s -o ${outputPath}' +
                  ((exportConfig.engine || '').trim()
                    ? ' --pdf-engine='.concat(JSON.stringify(exportConfig['pdf-engine']))
                    : '') +
                  ((exportConfig.template || '').trim()
                    ? ' --template='.concat(exportConfig.template)
                    : ''),
              );
            },
            hintLink: 'https://github.com/Refinex-Space/marklyra',
          },
          template: {
            type: 'file',
            extension: 'tex latex context ms html',
            label: 'Template',
            arg: '--template',
            onChange: function (unusedParameter1, setField, exportConfig) {
              setField(
                'arg',
                '-f native -s -o ${outputPath}' +
                  ((exportConfig.engine || '').trim()
                    ? ' --pdf-engine='.concat(exportConfig['pdf-engine'])
                    : '') +
                  ((exportConfig.template || '').trim()
                    ? ' --template='.concat(exportConfig.template)
                    : ''),
              );
            },
            hintLink: 'https://github.com/Refinex-Space/marklyra',
          },
        },
        extraArgumentFields,
      ),
      {},
      { author: { type: 'string', label: 'Author', placeholder: 'Empty' } },
    ),
    docxExportFields = Object(objectSpread.a)(
      Object(objectSpread.a)(
        {
          arg: {
            default: '-f native -s -o ${outputPath} -t docx',
            type: 'string',
            label: 'Arguments',
            disabled: !0,
          },
        },
        extraArgumentFields,
      ),
      {},
      {
        'reference-doc': {
          type: 'file',
          extension: 'docx',
          label: 'Style Reference',
          arg: '--reference-doc',
          onChange: function (referenceDocument, setField, unusedParameter3) {
            setField(
              'arg',
              '-f native -s -o ${outputPath} -t docx' +
                ((referenceDocument || '').trim()
                  ? ' --reference-doc '.concat(JSON.stringify(referenceDocument))
                  : ''),
            );
          },
          hintLink: 'https://github.com/Refinex-Space/marklyra',
        },
      },
    ),
    odtExportFields = Object(objectSpread.a)(
      Object(objectSpread.a)(
        {
          arg: {
            default: '-f native -s -o ${outputPath} -t odt',
            type: 'string',
            label: 'Arguments',
            disabled: !0,
          },
        },
        extraArgumentFields,
      ),
      {},
      {
        template: {
          type: 'file',
          extension: 'opendocument',
          label: 'Template',
          onChange: function (templatePath, setField, unusedParameter3) {
            setField(
              'arg',
              '-f native -s -o ${outputPath} -t odt' +
                ((templatePath || '').trim()
                  ? ' --template '.concat(JSON.stringify(templatePath))
                  : ''),
            );
          },
          hintLink: 'https://github.com/Refinex-Space/marklyra',
        },
      },
    ),
    rtfExportFields = Object(objectSpread.a)(
      {
        arg: {
          default: '-f native -s -o ${outputPath} -t rtf',
          type: 'string',
          label: 'Arguments',
          disabled: !0,
        },
      },
      extraArgumentFields,
    ),
    epubExportFields = Object(objectSpread.a)(
      Object(objectSpread.a)(
        {
          arg: {
            default: '-f native -s -o ${outputPath} -t epub',
            type: 'string',
            label: 'Arguments',
            disabled: !0,
          },
        },
        extraArgumentFields,
      ),
      {},
      {
        css: {
          type: 'file',
          extension: 'css',
          label: 'Custom CSS',
          onChange: function (unusedParameter1, setField, exportConfig) {
            setField(
              'arg',
              '-f native -s -o ${outputPath} -t epub' +
                ((exportConfig.css || '').trim()
                  ? ' --css '.concat(JSON.stringify(exportConfig.css))
                  : '') +
                ((exportConfig['toc-depth'] || '').trim()
                  ? ' --toc-depth='.concat(exportConfig['toc-depth'])
                  : ''),
            );
          },
          hintLink: 'https://github.com/Refinex-Space/marklyra',
        },
        'toc-depth': {
          label: 'Chapter Level in Outline',
          type: 'select',
          options: { 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6' },
          default: 3,
          onChange: function (unusedParameter1, setField, exportConfig) {
            setField(
              'arg',
              '-f native -s -o ${outputPath} -t epub' +
                ((exportConfig.css || '').trim()
                  ? ' --css='.concat(JSON.stringify(exportConfig.css))
                  : '') +
                ((exportConfig['toc-depth'] || '').trim()
                  ? ' --toc-depth='.concat(exportConfig['toc-depth'])
                  : ''),
            );
          },
          hintLink: 'https://github.com/Refinex-Space/marklyra',
        },
      },
    ),
    latexExportFields = Object(objectSpread.a)(
      {
        arg: {
          default: '-f native -s -o ${outputPath} -t latex',
          type: 'string',
          label: 'Arguments',
          disabled: !0,
        },
      },
      extraArgumentFields,
    ),
    mediawikiExportFields = Object(objectSpread.a)(
      {
        arg: {
          default: '-f native -s -o ${outputPath} -t mediawiki',
          type: 'string',
          label: 'Arguments',
          disabled: !0,
        },
      },
      extraArgumentFields,
    ),
    rstExportFields = Object(objectSpread.a)(
      {
        arg: {
          default: '-f native -s -o ${outputPath} -t rst',
          type: 'string',
          label: 'Arguments',
          disabled: !0,
        },
      },
      extraArgumentFields,
    ),
    textileExportFields = Object(objectSpread.a)(
      {
        arg: {
          default: '-f native -s -o ${outputPath} -t textile',
          type: 'string',
          label: 'Arguments',
          disabled: !0,
        },
      },
      extraArgumentFields,
    ),
    opmlExportFields = Object(objectSpread.a)(
      {
        arg: {
          default: '-f native -s -o ${outputPath} -t opml',
          type: 'string',
          label: 'Arguments',
          disabled: !0,
        },
      },
      extraArgumentFields,
    ),
    G = function (exportConfig) {
      return '-f native -s -o ${outputPath} -t '
        .concat(exportConfig.variants || 'markdown', '\n        ')
        .concat(
          exportConfig.hardLineWrap ? '--columns='.concat(exportConfig.columns || 130) : '',
          '\n        ',
        )
        .concat(exportConfig.eol ? '--eol='.concat(exportConfig.eol || 'native') : '', '\n        ')
        .concat(
          exportConfig.tab
            ? 'tab' === exportConfig.tab
              ? '--preserve-tabs'
              : '--tab-stop='.concat(exportConfig.tab || 4)
            : '',
          '\n        ',
        )
        .concat(exportConfig.ascii ? '--ascii' : '', '\n        ')
        .concat(exportConfig['reference-links'] ? '--reference-links' : '', '\n        ')
        .concat(
          exportConfig['reference-location']
            ? '--reference-location='.concat(exportConfig['reference-location'] || 'document')
            : '',
          '\n        ',
        )
        .concat(
          exportConfig['markdown-headings']
            ? '--markdown-headings='.concat(exportConfig['markdown-headings'] || 'atx')
            : '',
          '\n        ',
        )
        .concat(
          exportConfig.webtex
            ? '--webtex=https://latex.codecogs.com/'.concat(
                exportConfig['webtex-format'] || 'png',
                '.latex',
              )
            : '',
          '\n        ',
        )
        .replace(/\s+/g, ' ');
    },
    markdownExportFields = Object(objectSpread.a)(
      {
        arg: {
          default: '-f native -s -o ${outputPath} -t markdown',
          type: 'string',
          label: 'Arguments',
          disabled: !0,
        },
        variants: {
          type: 'select',
          label: 'Markdown Variants',
          options: {
            '': 'Pandoc Markdown',
            markdown_phpextra: 'PHP Markdown Extra',
            markdown_mmd: 'MultiMarkdown',
            markdown_strict: 'Original Unextended Markdown',
            commonmark: 'CommonMark',
            gfm: 'Github-Flavored Markdown',
            commonmark_x: 'CommonMark with many pandoc extensions',
          },
          onChange: function (unusedParameter1, setField, exportConfig) {
            setField('arg', G(exportConfig));
          },
        },
        hardLineWrap: {
          default: !1,
          type: 'checkbox',
          label: 'Line Wrap',
          checkboxLabel: 'Hard line wrap',
          hintLink: 'https://github.com/Refinex-Space/marklyra',
        },
        columns: {
          default: 130,
          type: 'number',
          label: 'Text Column Width',
          onChange: function (unusedParameter1, setField, exportConfig) {
            setField('arg', G(exportConfig));
          },
          visible: function (exportConfig) {
            return exportConfig.hardLineWrap;
          },
        },
        eol: {
          default: '',
          type: 'select',
          label: 'Line Endings',
          dictGroup: 'Menu',
          options: {
            '': 'Auto (based on current OS)',
            crlf: 'Windows Line Endings (CRLF)',
            lf: 'Unix Line Endings (LF)',
          },
          optionsDict: 'Menu',
          onChange: function (unusedParameter1, setField, exportConfig) {
            setField('arg', G(exportConfig));
          },
        },
        tab: {
          default: '',
          type: 'select',
          label: 'Indent',
          options: {
            tab: 'Preserve tabs',
            2: '2 spaces per tab',
            3: '3 spaces per tab',
            '': '4 spaces per tab',
          },
          onChange: function (unusedParameter1, setField, exportConfig) {
            setField('arg', G(exportConfig));
          },
        },
        ascii: {
          default: !1,
          type: 'checkbox',
          label: 'Unicode Characters',
          checkboxLabel: 'Use only ASCII characters in output',
          onChange: function (unusedParameter1, setField, exportConfig) {
            setField('arg', G(exportConfig));
          },
          hintLink: 'https://github.com/Refinex-Space/marklyra',
        },
        'reference-links': {
          default: !1,
          type: 'checkbox',
          label: 'Link Reference',
          dictGroup: 'Menu',
          checkboxLabel: 'Use reference-style links rather than inline links',
          onChange: function (unusedParameter1, setField, exportConfig) {
            setField('arg', G(exportConfig));
          },
          hintLink: 'https://pandoc.org/MANUAL.html#option--reference-links',
        },
        'reference-location': {
          default: !1,
          type: 'select',
          label: 'Footnotes and References Location',
          options: {
            '': 'End of document',
            block: 'End of current (top-level) block',
            section: 'End of current section',
          },
          onChange: function (unusedParameter1, setField, exportConfig) {
            setField('arg', G(exportConfig));
          },
          hintLink: 'https://pandoc.org/MANUAL.html#option--reference-location',
        },
        'markdown-headings': {
          default: '',
          type: 'select',
          label: 'Heading Style',
          options: { '': 'Auto', atx: 'atx (#)', setext: 'setext (===)' },
          onChange: function (unusedParameter1, setField, exportConfig) {
            setField('arg', G(exportConfig));
          },
        },
        webtex: {
          default: !1,
          type: 'checkbox',
          label: 'Math',
          dictGroup: 'Menu',
          checkboxLabel: 'Convert TeX formulas to web images',
          onChange: function (unusedParameter1, setField, exportConfig) {
            setField('arg', G(exportConfig));
          },
          hintLink: 'https://pandoc.org/MANUAL.html#option--webtex',
        },
        'webtex-format': {
          default: 'png',
          type: 'select',
          label: 'Image Format',
          options: { '': 'png', svg: 'svg' },
          onChange: function (unusedParameter1, setField, exportConfig) {
            setField('arg', G(exportConfig));
          },
          visible: function (exportConfig) {
            return exportConfig.webtex;
          },
        },
      },
      extraArgumentFields,
    ),
    Q = function (format) {
      switch (format) {
        case 'pdf':
          return pageExportFields;
        case 'latex-pdf':
          return pdfExportFields;
        case 'html':
          return htmlExportFields;
        case 'html-plain':
          return htmlInjectionFields;
        case 'image':
          return imageExportFields;
        case 'docx':
          return docxExportFields;
        case 'odt':
          return odtExportFields;
        case 'rtf':
          return rtfExportFields;
        case 'epub':
          return epubExportFields;
        case 'latex':
          return latexExportFields;
        case 'wiki':
          return mediawikiExportFields;
        case 'rst':
          return rstExportFields;
        case 'textile':
          return textileExportFields;
        case 'opml':
          return opmlExportFields;
        case 'markdown':
          return markdownExportFields;
        case 'native':
          return targetFormatFields;
        case 'pandoc':
          return customPandocFields;
        case 'custom':
          return commandExportFields;
      }
    },
    exportFormats = [
      { name: 'Word (.docx)', type: 'docx', key: 'docx' },
      { name: 'OpenOffice', type: 'odt', key: 'odt' },
      { name: 'RTF', type: 'rtf', key: 'rtf' },
      { name: 'Epub', type: 'epub', key: 'epub' },
      { name: 'LaTeX', type: 'latex', key: 'latex' },
      { name: 'Media Wiki', type: 'wiki', key: 'wiki' },
      { name: 'reStructuredText', type: 'rst', key: 'rst' },
      { name: 'Textile', type: 'textile', key: 'textile' },
      { name: 'OPML', type: 'opml', key: 'opml' },
    ],
    K = function (tabProps) {
      var label = tabProps.label,
        active = tabProps.active,
        onClick = tabProps.onClick,
        onRename = tabProps.onRename,
        rename = tabProps.rename,
        tab = tabProps.tab,
        searchQuery = reactDefault.a.useContext(searchAndPlatform.a),
        searchClass =
          Object(searchAndPlatform.c)(searchQuery, label) ||
          Object(searchAndPlatform.c)(searchQuery, tab)
            ? ' search-hit'
            : '';
      if (!searchClass) {
        var fieldSchema = Q(tab),
          currentItems = fieldSchema
            ? Object.values(fieldSchema).map(function (inputItem) {
                return inputItem.label;
              })
            : [
                'Pandoc Path',
                'Default Folder for Exported File',
                'Open exported file location',
                'After Export',
              ];
        'pdf' == tab && (currentItems = currentItems.concat(['Margin', 'Width x Height'])),
          (searchClass = Object(searchAndPlatform.d)(searchQuery, currentItems)
            ? ' search-hit'
            : '') ||
            (searchClass = Object(searchAndPlatform.d)(
              searchQuery,
              currentItems.map(function (inputItem) {
                return Object(localization.a)(
                  inputItem,
                  'Outline' === inputItem ? 'Menu' : 'Panel',
                );
              }),
            )
              ? ' search-hit'
              : '');
      }
      var d = function (event) {
        var nextLabel = event.target.value.trim().replace(/[&\u2192]/g, '');
        nextLabel.length
          ? onRename(tab, nextLabel)
          : (event.target.select(), event.preventDefault(), event.stopPropagation());
      };
      return rename && active == tab
        ? reactDefault.a.createElement('input', {
            className: 'export-item',
            type: 'text',
            defaultValue: label,
            autoFocus: 'autofocus',
            onFocus: function (focusEvent) {
              focusEvent.target.select();
            },
            onKeyDown: function (keyboardEvent) {
              13 == keyboardEvent.keyCode && d(keyboardEvent);
            },
            onBlur: d,
          })
        : reactDefault.a.createElement(
            'span',
            {
              className: 'export-item' + (active == tab ? ' active' : '') + searchClass,
              onClick: function () {
                onClick(tab);
              },
            },
            label,
          );
    },
    Y = function (folderProps) {
      var keyName = folderProps.keyName,
        folderValue = folderProps.value,
        onChange = folderProps.onChange,
        defaultValue = folderProps.defaultValue;
      folderProps.validatePath;
      return reactDefault.a.createElement(
        'div',
        { className: 'row text-input' },
        reactDefault.a.createElement('input', {
          type: 'text',
          className: !folderValue && defaultValue ? 'default-value-input' : '',
          value: folderValue || defaultValue || '',
          onChange: function (changeEvent) {
            onChange(keyName, changeEvent.target.value);
          },
        }),
        reactDefault.a.createElement(controls.i, {
          hint: Object(localization.a)('Select custom folder'),
          icon: 'folder',
          style: { marginLeft: '1ch', cursor: 'pointer' },
          onClick: function () {
            var initialDirectory =
              /^[\/]/.exec(folderValue) || /^[a-z]+:\\/i.exec(folderValue) ? folderValue : null;
            window.Setting.selectFolder(initialDirectory, function (selectedDirectory) {
              selectedDirectory && onChange(keyName, selectedDirectory);
            });
          },
          hintPosition: 'bottom',
        }),
      );
    },
    X = function (app, groupKey) {
      return function (fieldKey, fieldValue) {
        var previousConfig = app.getValue('export.' + groupKey) || {},
          nextConfig = Object.assign({}, previousConfig);
        (nextConfig[fieldKey] = fieldValue), app.onChange('export.' + groupKey, nextConfig);
      };
    },
    Z = function (panelProps) {
      var app = panelProps.app,
        generalConfig = app.getValue('export.general') || {};
      return reactDefault.a.createElement(
        'div',
        null,
        reactDefault.a.createElement(
          controls.k,
          { title: 'Default Folder for Exported File' },
          reactDefault.a.createElement(controls.r, {
            keyName: 'exportFolder',
            value: generalConfig.exportFolder || '',
            onChange: X(app, 'general'),
            options: {
              '': 'Auto',
              same: 'Same folder with current file',
              custom: 'Custom location',
            },
          }),
          'custom' === generalConfig.exportFolder
            ? reactDefault.a.createElement(Y, {
                keyName: 'customExportPath',
                value: generalConfig.customExportPath,
                defaultValue: window.Setting.documentPath(),
                onChange: X(app, 'general'),
              })
            : null,
        ),
        reactDefault.a.createElement(
          controls.k,
          {
            highlight: 'pandoc-setting-group' === app.state.highlightId,
            title: 'Pandoc Path',
            hintLink: 'https://github.com/Refinex-Space/marklyra',
          },
          reactDefault.a.createElement(
            'div',
            { className: 'row text-input' },
            reactDefault.a.createElement(controls.e, {
              keyName: 'pandocPath',
              value: app.getValue('pandocPath'),
              placeholder: Object(localization.a)('(Auto Detect)'),
              onChange: app.onChange,
              defaultPath: window.isWin ? 'C:\\Program Files\\Pandoc\\pandoc.exe' : '',
              option: {
                name: Object(localization.a)('Executable'),
                extensions: [window.isWin ? 'exe' : '*'],
              },
            }),
          ),
        ),
        reactDefault.a.createElement(
          controls.k,
          { title: 'After Export' },
          reactDefault.a.createElement(controls.c, {
            label: 'Open exported file location',
            keyName: 'openExportLocation',
            checked: !!generalConfig.openExportLocation,
            onChange: X(app, 'general'),
          }),
        ),
      );
    },
    ee = function (value, fallbackValue) {
      return void 0 === value ? fallbackValue : value;
    },
    te = function (panelProps) {
      var app = panelProps.app,
        groupId = panelProps.groupId,
        generalConfig = app.getValue('export.general') || {},
        conf = app.getValue('export.' + groupId) || {},
        schema =
          (
            (app.getValue('customExport') || exportFormats).find(function (inputItem) {
              return inputItem.key === groupId;
            }) || {}
          ).type || groupId,
        fieldSchema = Q(conf.schema || schema);
      if (!fieldSchema) return null;
      var runCommand = window.process && 'marklyra' == window.process.env.SNAP_NAME,
        snapWarning =
          runCommand &&
          reactDefault.a.createElement(controls.w, {
            text: 'You are using the Snap version, it may have limited access to your local executables.',
            link: 'Snap',
            app: app,
          });
      return reactDefault.a.createElement(
        'div',
        null,
        Object.keys(fieldSchema).map(function (key) {
          var inputSchema = fieldSchema[key];
          return inputSchema && inputSchema.type
            ? inputSchema.visible && !inputSchema.visible(conf)
              ? null
              : reactDefault.a.createElement(
                  controls.k,
                  {
                    key: key,
                    dictGroup: inputSchema.dictGroup,
                    title: inputSchema.label || key.charAt(0).toUpperCase() + key.slice(1),
                    hintLink: inputSchema.hintLink,
                  },
                  'group' == inputSchema.type
                    ? inputSchema.content.map(function (inputInputSchema) {
                        return inputInputSchema.visible && !inputInputSchema.visible(conf)
                          ? null
                          : reactDefault.a.createElement(ie, {
                              app: app,
                              groupId: groupId,
                              conf: conf,
                              key: inputInputSchema.key,
                              keyName: inputInputSchema.key,
                              inputSchema: inputInputSchema,
                            });
                      })
                    : reactDefault.a.createElement(ie, {
                        app: app,
                        groupId: groupId,
                        conf: conf,
                        inputSchema: inputSchema,
                        keyName: key,
                      }),
                )
            : null;
        }),
        'custom' == schema
          ? reactDefault.a.createElement(
              controls.k,
              { title: 'After Export' },
              reactDefault.a.createElement(controls.c, {
                label: 'Show command output',
                keyName: 'showOutput',
                checked: !!ee(conf.showOutput),
                onChange: X(app, groupId),
              }),
              conf.saveDialog
                ? reactDefault.a.createElement(controls.c, {
                    label: 'Open exported file location',
                    keyName: 'openExportLocation',
                    checked: !!ee(
                      conf.openExportLocation,
                      generalConfig.openExportLocation,
                      fieldSchema.openExportLocation,
                    ),
                    onChange: X(app, groupId),
                  })
                : null,
              'saveFile' == conf.saveDialog
                ? reactDefault.a.createElement(controls.c, {
                    label: 'Open exported file',
                    keyName: 'openExportFile',
                    checked: !!conf.openExportFile,
                    onChange: X(app, groupId),
                  })
                : null,
            )
          : reactDefault.a.createElement(
              controls.k,
              { title: 'After Export' },
              reactDefault.a.createElement(controls.c, {
                label: 'Open exported file location',
                keyName: 'openExportLocation',
                checked: !!ee(
                  conf.openExportLocation,
                  generalConfig.openExportLocation,
                  fieldSchema.openExportLocation,
                ),
                onChange: X(app, groupId),
              }),
              reactDefault.a.createElement(controls.c, {
                label: 'Open exported file',
                keyName: 'openExportFile',
                checked: !!conf.openExportFile,
                onChange: X(app, groupId),
              }),
              reactDefault.a.createElement(controls.c, {
                label: 'Run command',
                keyName: 'runCommand',
                checked: !!conf.runCommand,
                onChange: X(app, groupId),
                style: { marginBottom: 4 },
              }),
              conf.runCommand && runCommand ? snapWarning : null,
              conf.runCommand
                ? reactDefault.a.createElement(ie, {
                    groupId: groupId,
                    app: app,
                    keyName: 'runCommandStr',
                    conf: conf,
                    inputSchema: {
                      default: '',
                      placeholder: Object(localization.a)('Command'),
                      type: 'string',
                      label: '',
                      presetOptions: [
                        window.isMac
                          ? 'pbcopy < "${outputPath}"'
                          : window.isWin
                            ? 'type -selection clipboard -i "${outputPath}"'
                            : 'xclip -selection clipboard -i "${outputPath}"',
                        'git add "${outputPath}"',
                      ],
                    },
                  })
                : null,
              conf.runCommand
                ? reactDefault.a.createElement(controls.c, {
                    label: 'Show command output',
                    keyName: 'showOutput',
                    checked: !!ee(conf.showOutput),
                    onChange: X(app, groupId),
                  })
                : null,
            ),
      );
    },
    ne = function (inputProps) {
      var keyName = inputProps.keyName,
        searchValue = inputProps.value,
        suggest = inputProps.suggest,
        placeholder = inputProps.placeholder,
        onChange = inputProps.onChange,
        disabled = inputProps.disabled,
        presetOptions = inputProps.presetOptions,
        indent = inputProps.indent,
        extraProps = Object(objectWithoutProperties.a)(inputProps, [
          'keyName',
          'value',
          'suggest',
          'placeholder',
          'onChange',
          'disabled',
          'presetOptions',
          'indent',
        ]),
        presetControl = null;
      if (presetOptions) {
        var presetLabels = {};
        presetOptions.map(function (inputItem) {
          return (presetLabels[inputItem] = inputItem);
        }),
          (presetControl = reactDefault.a.createElement(
            reactDefault.a.Fragment,
            null,
            reactDefault.a.createElement(controls.i, { icon: 'dot-3' }),
            reactDefault.a.createElement(
              'select',
              {
                onChange: function (changeEvent) {
                  '_none' === changeEvent.target.value
                    ? onChange(keyName, '')
                    : changeEvent.target.value && onChange(keyName, changeEvent.target.value);
                },
                value:
                  presetOptions.indexOf(searchValue) > -1
                    ? searchValue
                    : searchValue
                      ? ''
                      : '_none',
              },
              reactDefault.a.createElement(
                'option',
                { value: '' },
                Object(localization.a)('Custom'),
              ),
              presetOptions.map(function (key) {
                return reactDefault.a.createElement('option', { key: key, value: key }, key);
              }),
              reactDefault.a.createElement(
                'option',
                { value: '_none' },
                Object(localization.a)('None'),
              ),
            ),
          ));
      }
      return reactDefault.a.createElement(
        'div',
        { className: 'row text-input', style: indent ? { paddingLeft: indent } : void 0 },
        suggest
          ? reactDefault.a.createElement(
              controls.l,
              Object.assign(
                {
                  value: searchValue,
                  onChange: function (nextValue) {
                    return onChange(keyName, nextValue);
                  },
                  candidates: suggest,
                  placeholder: placeholder,
                },
                extraProps,
              ),
            )
          : reactDefault.a.createElement(
              'input',
              Object.assign(
                {
                  type: 'text',
                  value: searchValue,
                  onChange: function (changeEvent) {
                    return onChange(keyName, changeEvent.target.value);
                  },
                  disabled: disabled,
                  placeholder: Object(localization.a)(placeholder),
                },
                extraProps,
              ),
            ),
        presetControl || null,
      );
    },
    ae = function (textareaProps) {
      var keyName = textareaProps.keyName,
        textValue = textareaProps.value,
        onChange = textareaProps.onChange,
        extraProps = Object(objectWithoutProperties.a)(textareaProps, [
          'keyName',
          'value',
          'onChange',
        ]);
      return reactDefault.a.createElement(
        'div',
        { className: 'row text-input' },
        reactDefault.a.createElement(
          'textarea',
          Object.assign(
            {
              type: 'text',
              value: textValue || '',
              onChange: function (changeEvent) {
                return onChange(keyName, changeEvent.target.value);
              },
              style: {
                width: '100%',
                height: '80px',
                lineHeight: 1.3,
                fontSize: '0.9em',
                fontFamily: 'monospace',
              },
            },
            extraProps,
          ),
        ),
      );
    },
    oe = function (paperProps) {
      var keyName = paperProps.keyName,
        selectedPaper = paperProps.value,
        conf = paperProps.conf,
        onChange = paperProps.onChange,
        paperCode = selectedPaper,
        dimensionsMm = (paperSizes.a[paperCode] || {}).mm || conf[keyName + '.custom'],
        currentOptions = {};
      window.isMac && (currentOptions[''] = 'Default'),
        Object.keys(paperSizes.a).forEach(function (inputItem) {
          return (currentOptions[inputItem] = paperSizes.a[inputItem].name);
        });
      var readOnly = 'custom' != selectedPaper,
        style = {};
      readOnly && (style.background = 'transparent'),
        (currentOptions.custom = Object(localization.a)('Custom')),
        (dimensionsMm = dimensionsMm || [210, 297]);
      var u = function (dimensionInput) {
          var dimensionValue = dimensionInput - 0;
          return isNaN(dimensionValue) && (dimensionValue = 0), dimensionValue;
        },
        d = function (fieldKey, fallbackValue) {
          var configuredValue = conf[fieldKey];
          return '' === configuredValue || void 0 === configuredValue
            ? fallbackValue
            : configuredValue;
        },
        rows = [],
        marginMode = conf[keyName + '.margin'] || '';
      return (
        rows.push([
          'Margin',
          reactDefault.a.createElement(controls.r, {
            keyName: keyName + '.margin',
            value: marginMode,
            onChange: onChange,
            options: {
              '': Object(localization.a)('Default'),
              custom: Object(localization.a)('Custom'),
            },
          }),
        ]),
        'custom' == marginMode &&
          ['Top', 'Bottom', 'Left', 'Right'].forEach(function (inputItem) {
            rows.push([
              reactDefault.a.createElement(controls.t, { label: 'Margin ' + inputItem }),
              reactDefault.a.createElement(
                'span',
                null,
                reactDefault.a.createElement('input', {
                  type: 'number',
                  value: d(keyName + '.margin' + inputItem, 16),
                  onChange: function (changeEvent) {
                    return onChange(keyName + '.margin' + inputItem, u(changeEvent.target.value));
                  },
                }),
                ' mm',
              ),
            ]);
          }),
        rows.push([
          'Width x Height',
          reactDefault.a.createElement(
            'span',
            null,
            reactDefault.a.createElement('input', {
              type: 'number',
              value: dimensionsMm[0],
              readOnly: readOnly,
              style: style,
              onChange: function (changeEvent) {
                return onChange(keyName + '.custom', [
                  u(changeEvent.target.value),
                  dimensionsMm[1],
                ]);
              },
            }),
            ' mm x ',
            ' ',
            reactDefault.a.createElement('input', {
              type: 'number',
              value: dimensionsMm[1],
              readOnly: readOnly,
              style: style,
              onChange: function (changeEvent) {
                return onChange(keyName + '.custom', [
                  dimensionsMm[0],
                  u(changeEvent.target.value),
                ]);
              },
            }),
            ' mm',
          ),
        ]),
        reactDefault.a.createElement(
          reactDefault.a.Fragment,
          null,
          reactDefault.a.createElement(controls.r, {
            keyName: keyName,
            value: selectedPaper,
            onChange: onChange,
            options: currentOptions,
          }),
          reactDefault.a.createElement(controls.v, { rows: rows }),
        )
      );
    },
    ie = function (fieldProps) {
      var app = fieldProps.app,
        groupId = fieldProps.groupId,
        conf = fieldProps.conf,
        keyName = fieldProps.keyName,
        inputSchema = fieldProps.inputSchema,
        extraProps = Object(objectWithoutProperties.a)(fieldProps, [
          'app',
          'groupId',
          'conf',
          'keyName',
          'inputSchema',
        ]),
        onChange = reactDefault.a.useCallback(X(app, groupId), [app, groupId]);
      switch (
        (reactDefault.a.useEffect(
          function () {
            inputSchema.onChange && inputSchema.onChange(conf[keyName], onChange, conf);
          },
          [conf[keyName]],
        ),
        inputSchema.type)
      ) {
        case 'themeSelect':
          inputSchema.options = inputSchema.excludeDark ? themeOptions : defaultThemeOptions;
        case 'select':
          var hint = (inputSchema.hint || '')
            .split('\ue333')
            .map(function (inputItem) {
              return Object(localization.a)(inputItem);
            })
            .join(' ');
          return reactDefault.a.createElement(controls.r, {
            keyName: keyName,
            value: conf[keyName] || inputSchema.default,
            onChange: onChange,
            options: inputSchema.options,
            hint: hint,
          });
        case 'radio':
          return reactDefault.a.createElement(controls.p, {
            keyName: keyName,
            value: conf[keyName] || inputSchema.default,
            onChange: onChange,
            options: inputSchema.options,
            hint: hint,
            type: inputSchema.valueType,
          });
        case 'string':
          var textValue = conf[keyName] || inputSchema.default;
          return (
            textValue instanceof Array && (textValue = textValue.join(' ')),
            reactDefault.a.createElement(
              ne,
              Object.assign(
                {
                  keyName: keyName,
                  value: textValue || '',
                  onChange: onChange,
                  placeholder: inputSchema.placeholder,
                  disabled: inputSchema.disabled,
                  presetOptions: inputSchema.presetOptions,
                  suggest: inputSchema.suggest,
                  spellCheck: !1,
                },
                extraProps,
              ),
            )
          );
        case 'paper':
          var paperValue = conf[keyName] || inputSchema.default;
          return reactDefault.a.createElement(oe, {
            keyName: keyName,
            value: paperValue,
            conf: conf,
            onChange: onChange,
          });
        case 'textarea':
          return reactDefault.a.createElement(ae, {
            keyName: keyName,
            value: conf[keyName] || inputSchema.default || '',
            onChange: onChange,
            spellCheck: !1,
          });
        case 'checkbox':
          var storedBoolean = !(!conf[keyName] && !inputSchema.default);
          return reactDefault.a.createElement(controls.c, {
            label: inputSchema.checkboxLabel || inputSchema.label,
            keyName: keyName,
            checked: inputSchema.reverse ? !storedBoolean : storedBoolean,
            onChange: onChange,
            reverse: inputSchema.reverse,
          });
        case 'number':
          return reactDefault.a.createElement(
            'div',
            { className: 'row', style: inputSchema.style },
            reactDefault.a.createElement(controls.n, {
              keyName: keyName,
              value: conf[keyName] || inputSchema.default,
              onChange: onChange,
            }),
            ' ',
            inputSchema.unit,
            ' ',
            inputSchema.withReset
              ? reactDefault.a.createElement(controls.b, {
                  style: { marginLeft: '24px' },
                  label: 'Reset to Default',
                  onClick: function () {
                    onChange(keyName, inputSchema.default);
                  },
                })
              : null,
          );
        case 'file':
          return reactDefault.a.createElement(
            'div',
            { className: 'row text-input' },
            reactDefault.a.createElement(controls.e, {
              keyName: keyName,
              value: conf[keyName] || inputSchema.default,
              onChange: onChange,
              option: {
                name: Object(localization.a)(inputSchema.label),
                extensions: inputSchema.extension.split(' '),
              },
            }),
          );
        case 'dom':
          return inputSchema.render({ app: app });
      }
      return null;
    },
    localItems = [
      { name: 'PDF (MarkLyra / Webkit)', type: 'pdf' },
      { name: 'PDF (LaTeX / Pandoc)', type: 'latex-pdf' },
      { name: 'HTML', type: 'html' },
      { name: 'HTML (without Styles)', type: 'html-plain' },
      { name: 'Image', type: 'image' },
    ].concat(exportFormats, [
      { name: 'Markdown (Other Spec)', type: 'markdown' },
      { name: 'Native (Pandoc)', type: 'native' },
      { name: 'Pandoc', type: 'pandoc' },
      { name: 'Custom', type: 'custom' },
    ]),
    le = function (panelProps) {
      var app = panelProps.app,
        tabState = reactDefault.a.useState('general'),
        tabPair = Object(slicedToArray.a)(tabState, 2),
        key = tabPair[0],
        onClick = tabPair[1],
        renameState = reactDefault.a.useState(!1),
        renamePair = Object(slicedToArray.a)(renameState, 2),
        rename = renamePair[0],
        setRenaming = renamePair[1],
        templateState = reactDefault.a.useState(null),
        templatePair = Object(slicedToArray.a)(templateState, 2),
        templateIndex = templatePair[0],
        setTemplateIndex = templatePair[1];
      reactDefault.a.useEffect(
        function () {
          'pandoc-setting-group' == app.state.highlightId && onClick('general');
        },
        [app.state.highlightId],
      );
      var ActiveExportPanel = 'general' == key ? Z : te,
        builtInGroups = ['general', 'pdf', 'html', 'html-plain', 'image'],
        disabled = builtInGroups.indexOf(key) > -1,
        currentItems = app.getValue('customExport') || exportFormats,
        x = function () {
          var currentKey,
            template = localItems[templateIndex],
            nameIndex = builtInGroups.indexOf(template.type) > -1 ? 1 : 0;
          for (
            currentItems = E(currentItems);
            (currentKey = template.type + (nameIndex || '')),
              currentItems.find(function (inputItem) {
                return inputItem.key === currentKey;
              });
          )
            nameIndex++;
          var createdGroup = {
            key: currentKey,
            name: template.name + (nameIndex ? '-' + nameIndex : ''),
            type: template.type,
          };
          currentItems.push(createdGroup),
            app.onChange('customExport', currentItems),
            setTemplateIndex(null),
            onClick(currentKey),
            setRenaming(!0);
        },
        O = function (inputKey, name) {
          ((currentItems = E(currentItems)).find(function (inputItem) {
            return inputItem.key === inputKey;
          }).name = name),
            app.onChange('customExport', currentItems),
            setRenaming(!1);
        },
        S = function () {
          setRenaming(!1);
        },
        mappedItems = currentItems.map(function (inputItem) {
          return inputItem.key;
        }),
        atFirstItem = mappedItems.indexOf(key) <= 0,
        atLastItem = mappedItems.indexOf(key) >= mappedItems.length - 1;
      return reactDefault.a.createElement(
        'div',
        { className: 'export-config' },
        reactDefault.a.createElement(
          'div',
          {
            style: {
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '100%',
              padding: window.isMac ? '32px 0 8px 16px' : '0',
            },
          },
          reactDefault.a.createElement(
            'ul',
            { className: 'export-items-list' },
            reactDefault.a.createElement(
              'li',
              null,
              reactDefault.a.createElement(K, {
                label: Object(localization.a)('General'),
                tab: 'general',
                onClick: onClick,
                active: key,
              }),
            ),
            reactDefault.a.createElement('li', { className: 'separator' }),
            reactDefault.a.createElement(
              'li',
              null,
              reactDefault.a.createElement(K, {
                label: 'PDF',
                tab: 'pdf',
                onClick: onClick,
                active: key,
              }),
              reactDefault.a.createElement(K, {
                label: 'HTML',
                tab: 'html',
                onClick: onClick,
                active: key,
              }),
              reactDefault.a.createElement(K, {
                label: 'HTML (without Styles)',
                tab: 'html-plain',
                onClick: onClick,
                active: key,
              }),
              reactDefault.a.createElement(K, {
                label: 'Image',
                tab: 'image',
                onClick: onClick,
                active: key,
              }),
            ),
            reactDefault.a.createElement('li', { className: 'separator' }),
            currentItems.map(function (inputItem) {
              return reactDefault.a.createElement(K, {
                key: inputItem.key,
                label: inputItem.name,
                tab: inputItem.key,
                onClick: onClick,
                active: key,
                rename: rename,
                onRename: O,
                onCancelRename: S,
              });
            }),
          ),
          reactDefault.a.createElement(
            'div',
            { className: 'export-items-list-control' },
            reactDefault.a.createElement(controls.i, {
              icon: 'plus',
              hint: Object(localization.a)('Add'),
              hintPosition: 'top',
              onClick: function (clickEvent) {
                setTemplateIndex(0);
              },
            }),
            reactDefault.a.createElement(controls.i, {
              icon: 'minus',
              hint: Object(localization.a)('Delete'),
              hintPosition: 'top',
              disabled: disabled,
              onClick: function () {
                window.Setting.showConfirm(
                  Object(localization.a)('Delete this export option ?', 'Panel'),
                ).then(function (result) {
                  if (result) {
                    var removedIndex = currentItems.findIndex(function (inputItem) {
                        return inputItem.key === key;
                      }),
                      removedGroup = (currentItems = E(currentItems)).splice(removedIndex, 1)[0];
                    app.onChange('customExport', currentItems),
                      app.onChange('export.'.concat(removedGroup.key), {}),
                      onClick('general');
                  }
                });
              },
            }),
            reactDefault.a.createElement(controls.i, {
              style: { float: 'right' },
              icon: 'pencil',
              hint: Object(localization.a)('Rename'),
              hintPosition: 'top',
              onClick: function () {
                setRenaming(!0);
              },
              disabled: disabled || rename,
            }),
            reactDefault.a.createElement(controls.i, {
              style: { float: 'right' },
              icon: 'down',
              hint: Object(localization.a)('Move Down'),
              hintPosition: 'top',
              disabled: disabled || atLastItem,
              onClick: function () {
                var itemIndex = currentItems.findIndex(function (inputItem) {
                  return inputItem.key === key;
                });
                if (itemIndex < currentItems.length - 1) {
                  var movedGroup = currentItems[itemIndex];
                  (currentItems = E(currentItems)).splice(itemIndex, 1),
                    currentItems.splice(itemIndex + 1, 0, movedGroup),
                    app.onChange('customExport', currentItems);
                }
              },
            }),
            reactDefault.a.createElement(controls.i, {
              style: { float: 'right' },
              icon: 'up',
              hint: Object(localization.a)('Move Up'),
              hintPosition: 'top',
              disabled: disabled || atFirstItem,
              onClick: function () {
                var itemIndex = currentItems.findIndex(function (inputItem) {
                  return inputItem.key === key;
                });
                if (itemIndex > 0) {
                  var movedGroup = currentItems[itemIndex];
                  (currentItems = E(currentItems)).splice(itemIndex, 1),
                    currentItems.splice(itemIndex - 1, 0, movedGroup),
                    app.onChange('customExport', currentItems);
                }
              },
            }),
          ),
        ),
        reactDefault.a.createElement(
          'div',
          {
            style: Object(objectSpread.a)(
              { flex: 2, overflow: 'auto' },
              window.isMac
                ? { padding: '32px 4px 8px 0px', height: '100vh' }
                : { maxHeight: '100%' },
            ),
          },
          reactDefault.a.createElement(
            'div',
            { className: 'export-detail' },
            reactDefault.a.createElement(ActiveExportPanel, { app: app, groupId: key }),
          ),
        ),
        null == templateIndex
          ? null
          : (function () {
              var currentOptions = {};
              return (
                localItems.forEach(function (inputItem, itemIndex) {
                  currentOptions[itemIndex] = inputItem.name;
                }),
                reactDefault.a.createElement(
                  controls.m,
                  {
                    title: 'Add From a Template',
                    className: 'modal-s',
                    footer: reactDefault.a.createElement(
                      'div',
                      null,
                      reactDefault.a.createElement(
                        'button',
                        { className: 'btn btn-primary', onClick: x },
                        Object(localization.a)('Add'),
                      ),
                      reactDefault.a.createElement(
                        'button',
                        {
                          className: 'btn btn-default',
                          onClick: function () {
                            setTemplateIndex(null);
                          },
                        },
                        Object(localization.a)('Cancel'),
                      ),
                    ),
                  },
                  reactDefault.a.createElement(controls.r, {
                    options: currentOptions,
                    value: templateIndex,
                    onChange: function (unusedParameter1, templateIndex) {
                      setTemplateIndex(templateIndex);
                    },
                  }),
                )
              );
            })(),
      );
    };
  function ce() {
    return (
      (defaultThemeOptions = N.call(this)),
      (themeOptions = N.call(this, !0)),
      reactDefault.a.createElement(
        controls.o,
        {
          active: 4 == this.state.activeTab,
          'data-index': '4',
          style: {
            padding: 0,
            height: '100%',
            flex: 1,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          },
        },
        this.panelHeader('Export', 'Menu'),
        reactDefault.a.createElement(le, { app: this }),
      )
    );
  }
  function se() {
    var registrationPanel,
      licenseControls,
      disabled = this.getValue('devVersion') && !this.getValue('hasLicense');
    (licenseControls = this.getValue('hasLicense')
      ? reactDefault.a.createElement(
          reactDefault.a.Fragment,
          null,
          reactDefault.a.createElement(
            controls.q,
            null,
            Object(localization.a)('Your MarkLyra has been activated.'),
          ),
          reactDefault.a.createElement(
            controls.q,
            {
              keyWords: ['License', 'Registration', 'Activation', 'Activate'],
              style: { marginTop: '6px' },
            },
            reactDefault.a.createElement(
              'span',
              { style: { display: 'inline-block', marginRight: '8px' } },
              reactDefault.a.createElement(controls.b, {
                label: Object(localization.a)('Detail', 'Welcome'),
                onClick: window.Setting.showLicense,
              }),
            ),
          ),
        )
      : reactDefault.a.createElement(
          reactDefault.a.Fragment,
          null,
          reactDefault.a.createElement(
            controls.q,
            null,
            Object(localization.a)('Your MarkLyra is not activated.'),
          ),
          reactDefault.a.createElement(
            controls.q,
            {
              keyWords: ['License', 'Registration', 'Activation', 'Activate'],
              style: { marginTop: '6px' },
            },
            reactDefault.a.createElement(
              'span',
              { style: { display: 'inline-block', marginRight: '8px' } },
              reactDefault.a.createElement(controls.b, {
                label: Object(localization.a)('Buy License', 'Welcome'),
                onClick: function () {
                  window.Setting.openLink('https://github.com/Refinex-Space/marklyra#purchase');
                },
              }),
            ),
            reactDefault.a.createElement(controls.b, {
              type: 'primary',
              label: Object(localization.a)('Enter License', 'Welcome'),
              onClick: window.Setting.showLicense,
            }),
          ),
        )),
      (registrationPanel = reactDefault.a.createElement(
        controls.k,
        {
          title: Object(localization.a)('Registration / Activation', 'Menu'),
          contentStyle: { background: '#8f8f8f1a', paddingTop: 8, paddingBottom: 8 },
        },
        licenseControls,
      ));
    var unusedValue = (
      (window.isNode ? window._options.userLocale : window._options.locale) || 'base'
    ).toLowerCase();
    return reactDefault.a.createElement(
      controls.o,
      { active: 6 == this.state.activeTab, 'data-index': '0' },
      this.panelHeader('General'),
      reactDefault.a.createElement(
        'div',
        { className: 'settings-general-preferences' },
        reactDefault.a.createElement(
          controls.k,
          {
            title: '应用偏好',
            keyWords: [
              'Language',
              '语言',
              'Quit',
              '退出',
              'Shortcut Keys',
              '快捷键',
              'Enable Debug',
              '调试',
            ],
          },
          reactDefault.a.createElement(controls.v, {
            rows: [
              [
                '界面语言',
                reactDefault.a.createElement(controls.r, {
                  keyName: 'userLanguage',
                  value: this.getValue('userLanguage') || '',
                  onChange: this.onChange,
                  options: { '': 'System Language', Base: 'English', 'zh-Hans': '简体中文' },
                }),
              ],
              [
                '快捷键',
                reactDefault.a.createElement(controls.b, {
                  label: 'Custom Shortcut Keys',
                  onClick: function () {
                    window.Setting.openLink('https://github.com/Refinex-Space/marklyra');
                  },
                }),
              ],
            ],
          }),
          window.isMac
            ? reactDefault.a.createElement(controls.c, {
                label: 'Quit MarkLyra when last window is closed',
                keyName: 'quitAfterWindowClose',
                checked: !!this.getValue('quitAfterWindowClose'),
                onChange: this.onChange,
              })
            : null,
          reactDefault.a.createElement(controls.c, {
            keyName: 'debugMode',
            label: 'Enable Debug',
            checked: !!this.getValue('debugMode'),
            onChange: this.onChange,
            hint: '开启后可检查应用界面、控制台和网络请求。macOS：⌘⌥I（Command + Option + I）；Windows：Ctrl + Shift + I。关闭后停用调试入口；Windows 已打开的面板请手动关闭。',
          }),
          reactDefault.a.createElement(
            controls.d,
            { forLinux: !0, forWin: !0 },
            reactDefault.a.createElement(
              controls.q,
              { keyWords: ['Open Advanced Settings', 'Reset Advanced Settings'] },
              reactDefault.a.createElement(controls.b, {
                label: 'Open Advanced Settings',
                onClick: this.onOpenAdvancedSettings,
                style: { marginRight: '16px' },
              }),
              reactDefault.a.createElement(controls.b, {
                label: 'Reset Advanced Settings',
                onClick: this.onResetAdvancedSettings,
              }),
            ),
          ),
          window.isWin
            ? reactDefault.a.createElement(
                reactDefault.a.Fragment,
                null,
                reactDefault.a.createElement(
                  controls.q,
                  null,
                  reactDefault.a.createElement(controls.b, {
                    label: 'Add "Markdown" to "New" context menu in Windows Explorer',
                    onClick: function () {
                      window.Setting.invokeWithUserFeedback('registry.addNewMarkdown');
                    },
                    style: { minWidth: '80%', textAlign: 'left' },
                  }),
                  reactDefault.a.createElement(controls.b, {
                    label: 'Delete items from "New" context menu in Windows Explorer',
                    onClick: function () {
                      window.Setting.invokeWithUserFeedback('registry.removeNewMarkdown');
                    },
                    style: { minWidth: '80%', textAlign: 'left' },
                  }),
                  reactDefault.a.createElement(controls.h, {
                    hintLink: 'https://github.com/Refinex-Space/marklyra',
                  }),
                ),
              )
            : null,
        ),
      ),
      reactDefault.a.createElement(
        'div',
        { className: 'settings-general-about' },
        reactDefault.a.createElement(
          controls.k,
          {
            title: '关于 MarkLyra',
            keyWords: [
              'MarkLyra',
              'GitHub',
              '仓库',
              '版本',
              '更新',
              '开源',
              '免费',
              'Apache',
              'License',
              '许可',
            ],
          },
          reactDefault.a.createElement(
            'div',
            { className: 'settings-about-brand' },
            reactDefault.a.createElement(
              'div',
              null,
              reactDefault.a.createElement(
                'span',
                { className: 'settings-about-eyebrow' },
                '为写作，保持自由',
              ),
              reactDefault.a.createElement('h2', null, 'MarkLyra'),
              reactDefault.a.createElement(
                'p',
                { className: 'settings-about-tagline' },
                reactDefault.a.createElement('span', null, '永久免费 · 开放源代码'),
                reactDefault.a.createElement(
                  'button',
                  {
                    type: 'button',
                    className: 'settings-about-github',
                    'data-marklyra-open-repository': 'true',
                    title: 'GitHub · Refinex-Space/marklyra',
                    'aria-label': '打开 MarkLyra GitHub 仓库',
                  },
                  reactDefault.a.createElement(
                    'span',
                    { className: 'icon icon-github-circled', 'aria-hidden': 'true' },
                    '',
                  ),
                ),
              ),
            ),
            reactDefault.a.createElement(
              'span',
              { className: 'settings-about-license' },
              'Apache 2.0',
            ),
          ),
          reactDefault.a.createElement(
            'div',
            { className: 'row settings-about-version' },
            reactDefault.a.createElement(
              'span',
              null,
              '当前版本 ',
              reactDefault.a.createElement('strong', null, window.__MARKLYRA_PRODUCT_VERSION__),
            ),
            reactDefault.a.createElement(
              'button',
              {
                type: 'button',
                className: 'btn btn-default',
                'data-marklyra-update-check': 'true',
              },
              '检查更新',
            ),
          ),
          reactDefault.a.createElement(controls.c, {
            keyName: 'enableAutoUpdate',
            onChange: this.onChange,
            checked: !1 !== this.getValue('enableAutoUpdate') || disabled,
            disabled: disabled,
            label: 'Check updates automatically',
            hint: disabled ? 'MarkLyra activation is required to change this.' : '',
          }),
          reactDefault.a.createElement(
            'p',
            { className: 'settings-about-legal' },
            'MarkLyra 自有代码采用 Apache 2.0；第三方组件遵循各自许可。',
          ),
        ),
      ),
    );
  }
  function ue() {
    return reactDefault.a.createElement(
      controls.o,
      { active: 1 == this.state.activeTab, 'data-index': '1' },
      this.panelHeader('Editor'),
      reactDefault.a.createElement(
        'div',
        { className: 'panel-content-hint row', style: { marginLeft: 0 } },
        Object(localization.a)('(Some options will be applied after restart.)'),
      ),
      reactDefault.a.createElement(controls.j, {
        onChange: this.onChange,
        indentSize: this.getValue('indentSize'),
        prettyIndent: !!this.getValue('prettyIndent'),
      }),
      reactDefault.a.createElement(
        controls.k,
        { title: 'Auto Pair' },
        reactDefault.a.createElement(controls.c, {
          keyName: 'no_pairing_match',
          onChange: this.onChange,
          checked: !this.getValue('no_pairing_match'),
          label: 'Auto pair brackets and quotes',
          reverse: !0,
        }),
        reactDefault.a.createElement(controls.c, {
          keyName: 'match_pari_markdown',
          onChange: this.onChange,
          checked: !!this.getValue('match_pari_markdown') && !this.getValue('no_pairing_match'),
          label: 'Auto pair common Markdown syntax',
          disabled: this.getValue('no_pairing_match'),
        }),
      ),
      reactDefault.a.createElement(
        controls.k,
        { title: 'Auto Complete' },
        reactDefault.a.createElement(controls.c, {
          keyName: 'noEmojiAutoComplete',
          onChange: this.onChange,
          checked: !this.getValue('noEmojiAutoComplete'),
          label: 'Enable autocomplete for Emojis',
          reverse: !0,
        }),
      ),
      reactDefault.a.createElement(
        controls.k,
        { title: 'Live Rendering' },
        reactDefault.a.createElement(controls.c, {
          keyName: 'auto_expand_block',
          onChange: this.onChange,
          checked: !!this.getValue('auto_expand_block'),
          label: 'Display source for simple blocks\\n(including headings, etc.) on focus',
        }),
      ),
      reactDefault.a.createElement(
        controls.k,
        { title: 'Default Copy Behavior', hint: window.isMac ? '( \u2318C )' : '(ctrl+c)' },
        reactDefault.a.createElement(controls.c, {
          keyName: 'copy_markdown_by_default',
          onChange: this.onChange,
          checked: !!this.getValue('copy_markdown_by_default'),
          label: 'Copy Markdown source as plain text',
        }),
        reactDefault.a.createElement(controls.c, {
          keyName: 'lineWiseCopyCut',
          onChange: this.onChange,
          checked: !!this.getValue('lineWiseCopyCut'),
          label:
            'Copy or cut the whole lines that have cursors on them, if there is no selection when doing copy / cut.',
        }),
      ),
      window.isMac
        ? null
        : reactDefault.a.createElement(
            controls.k,
            { title: 'Default Line Ending', hint: 'Line ending for new file', breakBeforeHint: !0 },
            reactDefault.a.createElement(controls.p, {
              keyName: 'line_ending_crlf',
              type: 'boolean',
              options: { false: 'LF (Unix Style)', true: 'CRLF (Windows Style)' },
              onChange: this.onChange,
              value: !!this.getValue('line_ending_crlf'),
            }),
          ),
      reactDefault.a.createElement(
        controls.d,
        { forWin: !0, forLinux: !0 },
        reactDefault.a.createElement(
          controls.k,
          {
            title: 'Spell Check',
            breakBeforeHint: !0,
            hint: Object(localization.a)('(Default spell check option)', 'Front'),
          },
          reactDefault.a.createElement(controls.r, {
            keyName: 'preset_spell_check',
            options: {
              auto: Object(localization.a)('Auto Detect Language', 'Front'),
              disabled: Object(localization.a)('Disable Spell Check', 'Front'),
              _seperator: '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500',
              'en-US': 'English (US)',
              'en-GB': 'English (UK)',
              cs: '\u010ce\u0161tina',
              da: 'Dansk',
              de: 'Deutsch',
              es: 'Espa\xf1ol',
              el: '\u0395\u03bb\u03bb\u03b7\u03bd\u03b9\u03ba\u03ac',
              fr: 'Fran\xe7ais',
              gl: 'Galego',
              hr: 'Hrvatski',
              it: 'Italiano',
              ro: 'Limba Rom\xe2n\u0103',
              nl: 'Nederlands',
              hu: 'Magyar',
              ms: 'Orang Melayu',
              pl: 'Polski',
              'pt-BR': 'Portugu\xeas (Brasil)',
              pt: 'Portugu\xeas (Portugal)',
              ru: '\u0420\u0443\u0301\u0441\u0441\u043a\u0438\u0439',
              'de-CH': 'Schweizerdeutsch',
              sk: 'Sloven\u010dina',
              sl: 'Sloven\u0161\u010dina',
              sv: 'Svenska',
              vi: 'Ti\u1ebfng Vi\u1ec7t',
              tr: 'T\xfcrk\xe7e',
              uk: '\u0423\u043a\u0440\u0430\u0457\u043d\u0441\u044c\u043a\u0430 \u043c\u043e\u0432\u0430',
              fa: '\u0641\u0627\u0631\u0633\u06cc',
              ar: '\u0627\u0644\u0639\u0631\u0628\u064a\u0629',
              ko: '\ud55c\uad6d\uc5b4',
              zh: '\u4e2d\u6587',
              ja: '\u65e5\u672c\u8a9e',
              'he-IL': '\u05e2\u05b4\u05d1\u05b0\u05e8\u05b4\u05d9\u05ea',
            },
            onChange: this.onChange,
            value: this.getValue('preset_spell_check'),
          }),
        ),
      ),
      reactDefault.a.createElement(
        controls.k,
        { title: 'Typewriter Mode' },
        reactDefault.a.createElement(controls.c, {
          keyName: 'no_mid_caret',
          onChange: this.onChange,
          checked: !this.getValue('no_mid_caret'),
          label: 'Always keep caret in middle of screen\\nwhen typewriter mode is enabled',
          reverse: !0,
        }),
        null,
      ),
    );
  }
  function pe() {
    var component = this,
      disabled =
        !this.getValue('SmartyPantsOnRendering') &&
        (this.getValue('smartDash') || this.getValue('smartQuote')),
      mathNumberingMode = this.getValue('auto_numbering_for_math') || '';
    return (
      1 == mathNumberingMode && (mathNumberingMode = 'all'),
      reactDefault.a.createElement(
        controls.o,
        { active: 3 == this.state.activeTab, 'data-index': '3' },
        this.panelHeader('Markdown'),
        reactDefault.a.createElement(
          'div',
          { className: 'panel-content-hint row', style: { marginLeft: 0 } },
          Object(localization.a)('(Following preferences will be applied after restart.)'),
        ),
        reactDefault.a.createElement(
          controls.k,
          {
            title: 'Syntax Preference',
            breakBeforeHint: !0,
            hint: 'only apply to quotes and lists created from menu bar or hybrid view',
          },
          reactDefault.a.createElement(controls.v, {
            rows: [
              [
                reactDefault.a.createElement(controls.c, {
                  checked: !!this.getValue('strict_mode'),
                  keyName: 'strict_mode',
                  onChange: this.onChange,
                  label: 'Strict Mode',
                }),
                reactDefault.a.createElement(controls.h, {
                  hintLink: 'https://github.com/Refinex-Space/marklyra',
                  inlineHint: !0,
                }),
                'Strict Mode',
              ],
              [
                'Heading Style',
                reactDefault.a.createElement(controls.r, {
                  onChange: this.onChange,
                  keyName: 'heading_style',
                  value: this.getValue('heading_style') || 0,
                  type: 'number',
                  options: {
                    0: 'atx (#)',
                    2: 'atx with suffix (# \u22ef #)',
                    1: 'setext (===)',
                    3: 'variable-width setext (=====)',
                  },
                }),
              ],
              [
                'Unordered List',
                reactDefault.a.createElement(controls.r, {
                  onChange: this.onChange,
                  keyName: 'ul_style',
                  value: this.getValue('ul_style') || 0,
                  type: 'number',
                  options: { 0: '-', 1: '+', 2: '*' },
                }),
              ],
              [
                'Ordered List',
                reactDefault.a.createElement(controls.r, {
                  onChange: this.onChange,
                  keyName: 'ol_style',
                  value: this.getValue('ol_style') || 0,
                  type: 'number',
                  options: {
                    0: '1. \u22ef 2. \u22ef 3. \u22ef',
                    1: '1. \u22ef 1. \u22ef 1. \u22ef',
                  },
                }),
              ],
            ],
          }),
        ),
        reactDefault.a.createElement(
          controls.k,
          { title: 'Syntax Support' },
          reactDefault.a.createElement(controls.c, {
            keyName: 'noAutoLink',
            label: 'Auto Links (e.g: https://github.com/Refinex-Space/marklyra)',
            checked: !this.getValue('noAutoLink'),
            onChange: this.onChange,
            reverse: !0,
            hint: 'When enabled, MarkLyra will auto recognize and highlight URLs (e.g: https://github.com/Refinex-Space/marklyra or https://github.com/Refinex-Space/marklyra/issues) in text.',
          }),
          reactDefault.a.createElement(controls.c, {
            highlight: 'math-syntax-toggle-group' === this.state.highlightId,
            keyName: 'enable_inline_math',
            label: 'Inline Math  (e.g: $\\LaTeX$)',
            checked: !!this.getValue('enable_inline_math'),
            onChange: this.onChange,
          }),
          reactDefault.a.createElement(controls.c, {
            keyName: 'enable_subscript',
            label: 'Subscript    (e.g: H~2~O)',
            checked: !!this.getValue('enable_subscript'),
            onChange: this.onChange,
          }),
          reactDefault.a.createElement(controls.c, {
            keyName: 'enable_superscript',
            label: 'Superscript (e.g: X^2^)',
            checked: !!this.getValue('enable_superscript'),
            onChange: this.onChange,
          }),
          reactDefault.a.createElement(controls.c, {
            keyName: 'enable_highlight',
            label: 'Highlight     (e.g: ==key==)',
            checked: !!this.getValue('enable_highlight'),
            onChange: this.onChange,
          }),
          reactDefault.a.createElement(controls.c, {
            keyName: 'enableAlert',
            label: 'Github Style Alert',
            checked: !!this.getValue('enableAlert'),
            onChange: this.onChange,
          }),
          reactDefault.a.createElement(controls.c, {
            keyName: 'enable_diagram',
            label: 'Diagrams',
            checked: !!this.getValue('enable_diagram'),
            onChange: this.onChange,
            hint: '(Sequence, Flowchart and Mermaid)',
            inlineHint: !0,
          }),
        ),
        reactDefault.a.createElement(
          controls.k,
          {
            highlight: 'smart-punctuation-group' === this.state.highlightId,
            title: 'Smart Punctuation',
            hintLink: 'https://github.com/Refinex-Space/marklyra',
            dictGroup: 'Menu',
            inlineHint: !0,
            breakBeforeHint: !0,
          },
          reactDefault.a.createElement(controls.r, {
            keyName: 'SmartyPantsOnRendering',
            optionsDict: 'Menu',
            options: { false: 'Convert on Input', true: 'Convert on Rendering' },
            value: !!this.getValue('SmartyPantsOnRendering'),
            onChange: this.onChange,
            type: 'boolean',
            hint: '<div><strong>Convert on Input</strong>: Input ASCII dashes or quotes, converted and saved as curly quotes or unicode dashes.<br/><strong>Convert on Rendering</strong>: Input and saved as ASCII dashes or quotes, render as curly quotes or unicode dashes.</div>',
          }),
          window.isMac
            ? reactDefault.a.createElement(controls.c, {
                keyName: 'smartQuote',
                label: 'Smart Quotes',
                checked: !!this.getValue('smartQuote'),
                onChange: this.onChange,
                dictGroup: 'Menu',
                hint: 'You could set quote patterns in System Preferences \u2192 Keyboard \u2192 Text. If it is changed, MarkLyra will need a restart to apply it.',
              })
            : reactDefault.a.createElement(
                controls.q,
                { keyWords: ['Smart Quotes'], style: { height: '29px' } },
                reactDefault.a.createElement(controls.c, {
                  keyName: 'smartQuote',
                  label: 'Smart Quotes',
                  checked: !!this.getValue('smartQuote'),
                  onChange: this.onChange,
                  dictGroup: 'Menu',
                  isCell: !0,
                  style: { display: 'inline-block', margin: '2px 0 0 0' },
                }),
                reactDefault.a.createElement(controls.r, {
                  disabled: !this.getValue('smartQuote'),
                  options: {
                    '\u201c\u201d': '\u201cabc\u201d',
                    '\u201e\u201c': '\u201eabc\u201c',
                    '\u201e\u201d': '\u201eabc\u201d',
                    '\u201d\u201d': '\u201dabc\u201d',
                    '\xab\xbb': '\xababc\xbb',
                    '\xab  \xbb': '\xab abc \xbb',
                    '\xbb\xab': '\xbbabc\xab',
                    '""': '"abc"',
                  },
                  isCell: !0,
                  value: (function () {
                    var text = component.getValue('userQuotesArray');
                    return text ? text[0] + text[1] : '\u201c\u201d';
                  })(),
                  keyName: 'userQuotesArray',
                  onChange: function (unusedParameter1, inputText) {
                    var text = component.getValue('userQuotesArray');
                    text || (text = ['\u201c', '\u201d', '\u2018', '\u2019']),
                      (text[0] = inputText.substr(0, inputText.length / 2)),
                      (text[1] = inputText.substr(inputText.length / 2)),
                      component.onChange('userQuotesArray', text);
                  },
                }),
                reactDefault.a.createElement(controls.r, {
                  disabled: !this.getValue('smartQuote'),
                  options: {
                    '\u2018\u2019': '\u2018abc\u2019',
                    '\u201a\u2018': '\u201aabc\u2018',
                    '\u201a\u2019': '\u201aabc\u2019',
                    '\u2019\u2019': '\u2019abc\u2019',
                    '\u2039\u203a': '\u2039abc\u203a',
                    '\u2039 \u203a': '\u2039 abc \u203a',
                    '\u203a\u2039': '\u203aabc\u2039',
                    "''": "'abc'",
                  },
                  isCell: !0,
                  value: (function () {
                    var text = component.getValue('userQuotesArray');
                    return text ? text[2] + text[3] : '\u2018\u2019';
                  })(),
                  keyName: 'userQuotesArray',
                  onChange: function (unusedParameter1, inputText) {
                    var text = component.getValue('userQuotesArray');
                    text || (text = ['\u201c', '\u201d', '\u2018', '\u2019']),
                      (text[2] = inputText.substr(0, inputText.length / 2)),
                      (text[3] = inputText.substr(inputText.length / 2)),
                      component.onChange('userQuotesArray', text);
                  },
                }),
              ),
          reactDefault.a.createElement(controls.c, {
            keyName: 'smartDash',
            label: 'Smart Dashes',
            checked: !!this.getValue('smartDash'),
            onChange: this.onChange,
            dictGroup: 'Menu',
          }),
          !window.isMac && this.getValue('smartDash')
            ? reactDefault.a.createElement(controls.r, {
                keyName: 'twoHyphensToEm',
                options: {
                  false: 'Convert -- to \u2013 (en dash), and --- to \u2014 (em dash)',
                  true: 'Convert -- and --- to \u2014 (em dash)',
                },
                value: !!this.getValue('twoHyphensToEm'),
                type: 'boolean',
                onChange: this.onChange,
              })
            : null,
          reactDefault.a.createElement(controls.c, {
            label: 'Remap Unicode Punctuation on Parse',
            dictGroup: 'Menu',
            hint: "<div>Recognize unicode punctuations as ASCII ones when parse markdown, e.g:<br/> <pre> \u300b blockquote \u2192 > blockquote <br/> [link](src \u2019title\u2019) \u2192 [link](src 'title')</pre>It will be turned on automatically if smart quotes/dashes will be converted on input.<div>",
            keyName: 'remapPunctuation',
            checked: !!this.getValue('remapPunctuation') || disabled,
            onChange: this.onChange,
            disabled: disabled,
          }),
        ),
        reactDefault.a.createElement(
          controls.k,
          { title: 'Code Fences' },
          reactDefault.a.createElement(controls.c, {
            label: 'Display line numbers for code fences',
            keyName: 'show_line_numbers_for_fence',
            checked: !!this.getValue('show_line_numbers_for_fence'),
            onChange: this.onChange,
          }),
          reactDefault.a.createElement(controls.c, {
            label: 'Auto wrap long lines',
            keyName: 'no_line_wrapping',
            checked: !this.getValue('no_line_wrapping'),
            onChange: this.onChange,
            reverse: !0,
          }),
          reactDefault.a.createElement(controls.c, {
            label: 'Use Shift+Tab to auto indent selected code',
            keyName: 'shiftTabAutoIndent',
            checked: this.getValue('shiftTabAutoIndent'),
            onChange: this.onChange,
            hint: 'When disabled, Shift+Tab will outdent selected code or current line. When enabled, Shift+Tab will auto apply indentation for selected code or current line in code blocks.',
          }),
          reactDefault.a.createElement(controls.v, {
            rows: [
              [
                'Indent Size for Code',
                reactDefault.a.createElement(controls.r, {
                  keyName: 'codeIndentSize',
                  onChange: this.onChange,
                  value: this.getValue('codeIndentSize') || 4,
                  options: { 2: '2', 3: '3', 4: '4', 5: '5' },
                }),
              ],
              [
                'Default Code Language',
                reactDefault.a.createElement(controls.r, {
                  keyName: 'defaultCodeLang',
                  value: this.getValue('defaultCodeLang') || '',
                  onChange: this.onChange,
                  optionsList: (function (items, current) {
                    var options = items.map(function (item, index) {
                      return typeof item === 'string'
                        ? [index === 0 ? '' : item, item]
                        : [item.key, item.label];
                    });
                    if (
                      current &&
                      !options.some(function (option) {
                        return option[0] === current;
                      })
                    )
                      options.push([current, current]);
                    return options;
                  })(
                    [
                      Object(localization.a)('(None)'),
                      { key: '__LAST', label: Object(localization.a)('Last Used') },
                    ].concat(
                      [
                        'js',
                        'javascript',
                        'java',
                        'json',
                        'ts',
                        'typescript',
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
                      ].sort(function (text, inputText) {
                        return text.toLowerCase().localeCompare(inputText.toLowerCase());
                      }),
                    ),
                    this.getValue('defaultCodeLang'),
                  ),
                }),
              ],
              [
                'Apply Default Code Language When',
                reactDefault.a.createElement(controls.r, {
                  keyName: 'defaultCodeLangOption',
                  value: this.getValue('defaultCodeLangOption') || 1,
                  options: {
                    1: 'When add code fences via Markdown',
                    2: 'When add code fences via Menubar',
                    3: 'Both',
                  },
                  onChange: function (settingKey, numericValue) {
                    (numericValue -= 0),
                      isNaN(numericValue) && (numericValue = 1),
                      component.onChange(settingKey, numericValue);
                  },
                }),
                null,
              ],
            ],
          }),
        ),
        reactDefault.a.createElement(
          controls.k,
          {
            title: 'Math',
            dictGroup: 'Menu',
            hintLink: 'https://github.com/Refinex-Space/marklyra',
          },
          reactDefault.a.createElement(controls.c, {
            highlight: 'math-syntax-toggle-group' === this.state.highlightId,
            keyName: 'enable_inline_math',
            label: 'Inline Math  (e.g: $\\LaTeX$)',
            checked: !!this.getValue('enable_inline_math'),
            onChange: this.onChange,
          }),
          reactDefault.a.createElement(controls.c, {
            highlight: 'math-syntax-toggle-group' === this.state.highlightId,
            keyName: 'noLegacyMath',
            reverse: !0,
            label: 'LaTeX Math Delimiter \\( \\) \\[ \\]',
            checked: !this.getValue('noLegacyMath'),
            onChange: this.onChange,
          }),
          reactDefault.a.createElement(controls.c, {
            highlight: 'math-syntax-toggle-group' === this.state.highlightId,
            keyName: 'gitlabMath',
            label: 'Code Block Math  (```math code block)',
            checked: !!this.getValue('gitlabMath'),
            onChange: this.onChange,
          }),
          reactDefault.a.createElement(controls.c, {
            keyName: 'noDisplayLinesInMath',
            checked: !this.getValue('noDisplayLinesInMath'),
            label: 'Apply Line Break at \\\\ and \\\\newline',
            onChange: this.onChange,
            hintLink: 'https://github.com/Refinex-Space/marklyra',
            reverse: !0,
          }),
          reactDefault.a.createElement(controls.c, {
            keyName: 'allowPhysicsConflict',
            checked: !!this.getValue('allowPhysicsConflict'),
            label: 'Enable physics package',
            onChange: this.onChange,
            hint: 'Physics package will redefine some latex macros, such as \\\\div, \\\\Re, etc.',
          }),
          reactDefault.a.createElement('br', null),
          reactDefault.a.createElement(controls.v, {
            style: { marginTop: 0 },
            rows: [
              [
                'Auto Numbering Math Equations',
                reactDefault.a.createElement(controls.r, {
                  keyName: 'auto_numbering_for_math',
                  value: mathNumberingMode,
                  options: {
                    '': 'No Automatic Equation Numbering',
                    ams: 'Use AMS Numbering Rules',
                    all: 'Auto Numbering for All Math Equations',
                  },
                  onChange: this.onChange,
                }),
                'https://github.com/Refinex-Space/marklyra',
              ],
              [
                'When copy / export as HTML (without style)',
                reactDefault.a.createElement(controls.r, {
                  keyName: 'mathFormatOnCopy',
                  value: this.getValue('mathFormatOnCopy') || 'svg',
                  options: { svg: 'Use Rendered SVG', latex: 'Use LaTeX Source' },
                  onChange: this.onChange,
                }),
                '<div>Take effects when export as HTML (without styles) or copy as HTML code, or copy without theme style.<br/>When <strong>Use LaTeX Source</strong> is selected, MarkLyra will put the raw LaTeX source (e.g: $X^2$),<br/>When <strong>Use Rendered SVG</strong> is selected, the rendered SVG will be used, if you paste to other app, SVG may get ignored.</div>',
              ],
            ],
          }),
          null,
        ),
        reactDefault.a.createElement(
          controls.k,
          {
            title: 'Whitespace / Line Break',
            hintLink: 'https://github.com/Refinex-Space/marklyra',
            breakBeforeHint: !0,
          },
          reactDefault.a.createElement(controls.c, {
            label: 'Indent first line of paragraphs',
            dictGroup: 'Menu',
            keyName: 'indentFirstLine',
            onChange: this.onChange,
            checked: !!this.getValue('indentFirstLine'),
            hint: 'These options can also be changed under "Edit\u2192Whitespace and Line Breaks" menu',
          }),
          reactDefault.a.createElement(
            reactDefault.a.Fragment,
            null,
            reactDefault.a.createElement(controls.c, {
              isCell: false,
              label: 'Visible <br/>',
              dictGroup: 'Menu',
              keyName: 'hideBrAndLineBreak',
              onChange: this.onChange,
              checked: !this.getValue('hideBrAndLineBreak'),
              reverse: !0,
            }),
            reactDefault.a.createElement(controls.v, {
              className: 'whitespace-table-input',
              rows: [
                [
                  'When Writing',
                  reactDefault.a.createElement(controls.r, {
                    keyName: 'ignoreLineBreak',
                    value: !!this.getValue('ignoreLineBreak'),
                    type: 'boolean',
                    options: {
                      false: 'Preserve sequential whitespace and single line break',
                      true: 'Ignore sequential whitespace and single line break',
                    },
                    onChange: this.onChange,
                  }),
                ],
                [
                  'Export / Print',
                  reactDefault.a.createElement(controls.r, {
                    keyName: 'preLinebreakOnExport',
                    value: !!this.getValue('preLinebreakOnExport'),
                    type: 'boolean',
                    options: {
                      true: 'Preserve sequential whitespace and single line break',
                      false: 'Ignore sequential whitespace and single line break',
                    },
                    onChange: this.onChange,
                  }),
                ],
              ],
            }),
          ),
        ),
      )
    );
  }
  var de = function (extensionProps) {
    var extensionValue = extensionProps.value,
      onChange = extensionProps.onChange,
      extensionMode =
        ['md', 'markdown', 'text'].indexOf(extensionValue || 'md') > -1 ? extensionValue : 'custom',
      defaultValue = 'custom' === extensionValue ? '' : extensionValue,
      customExtensionControl =
        'custom' === extensionMode
          ? reactDefault.a.createElement(controls.v, {
              rows: [
                [
                  Object(localization.a)('Custom Extension:'),
                  reactDefault.a.createElement('input', {
                    type: 'text',
                    style: { paddingLeft: '4px', flexGrow: '1', width: '90%' },
                    defaultValue: defaultValue,
                    placeholder: Object(localization.a)('e.g: %@').replace('%@', 'txt'),
                    onChange: function (unusedParameter1) {},
                    onBlur: function (blurEvent) {
                      var normalizedExtension = (
                        (/^\.?[a-z0-9_-]+(\.[a-z0-9_-]+)*/.exec(
                          blurEvent.target.value.toLowerCase().trim(),
                        ) || [])[0] || ''
                      ).replace(/^\./, '');
                      onChange('defaultExtension', normalizedExtension);
                    },
                  }),
                  Object(localization.a)('Following extensions are supported: %@').replace(
                    '%@',
                    'md, markdown, mmd, mdown, mkd, mdwn, mdtxt, mdtext, txt, text, rmd, rmarkdown.',
                  ),
                ],
              ],
            })
          : null;
    return reactDefault.a.createElement(
      reactDefault.a.Fragment,
      null,
      reactDefault.a.createElement(controls.r, {
        keyName: 'defaultExtension',
        value: extensionMode,
        onChange: function (settingKey, extensionValue) {
          onChange(settingKey, extensionValue || '');
        },
        options: {
          '': 'Markdown (.md)',
          markdown: 'Markdown (.markdown)',
          text: 'Text File (.text)',
          custom: 'Custom',
        },
      }),
      customExtensionControl,
    );
  };
  function me() {
    var component = this;
    return reactDefault.a.createElement(
      controls.o,
      { active: 0 == this.state.activeTab, 'data-index': '0' },
      this.panelHeader('Files'),
      reactDefault.a.createElement(
        controls.k,
        { title: 'On Launch' },
        reactDefault.a.createElement(controls.r, {
          keyName: 'restoreWhenLaunch',
          value: this.getValue('restoreWhenLaunch'),
          onChange: this.onChangeLaunchAction,
          options: {
            0: 'Open new file',
            1: 'Restore last closed folders',
            2: 'Restore last closed files and folders',
            3: 'Open custom folder',
          },
          hint: window.isMac
            ? 'This option may be overridden by "Close windows when quitting an application" in System Preferences'
            : null,
        }),
        reactDefault.a.createElement(controls.f, {
          hidden: this.getValue('restoreWhenLaunch') + '' != '3',
          keyName: 'pinFolder',
          value: this.getValue('pinFolder'),
          onChange: this.onChange,
        }),
      ),
      null,
      reactDefault.a.createElement(
        controls.k,
        { title: 'Default File Type / Extension' },
        reactDefault.a.createElement(de, {
          value: this.getValue('defaultExtension'),
          onChange: this.onChange,
        }),
      ),
      reactDefault.a.createElement(
        controls.k,
        { title: 'Save & Recover' },
        window.isNodeHtml
          ? reactDefault.a.createElement(controls.c, {
              label: 'Auto Save',
              keyName: 'enableAutoSave',
              checked: !!this.getValue('enableAutoSave'),
              onChange: this.onChange,
            })
          : null,
        reactDefault.a.createElement(controls.c, {
          label: 'Save without asking when\\nswitch files on side panel',
          keyName: 'save_file_on_switch',
          checked:
            !!this.getValue('save_file_on_switch') ||
            (window.isMac && !this.getValue('NSCloseAlwaysConfirmsChanges')) ||
            (window.isNodeHtml && !!this.getValue('enableAutoSave')),
          disabled:
            !!this.getValue('enableAutoSave') ||
            (window.isMac && !this.getValue('NSCloseAlwaysConfirmsChanges')),
          onChange: this.onChange,
          hint: window.isMac
            ? Object(localization.a)(
                'Edited files will be saved without asking when switch files in left panel. \nWhen "Ask to keep changes when closing documents" is disabled in System Preference, this is always enabled.',
              )
            : null,
        }),
        window.isNodeHtml
          ? reactDefault.a.createElement(
              controls.q,
              { keyWords: ['Recover Unsaved Drafts'] },
              reactDefault.a.createElement(controls.b, {
                label: 'Recover Unsaved Drafts',
                onClick: window.Setting.openUnsavedDraft,
              }),
            )
          : null,
      ),
      reactDefault.a.createElement(
        controls.k,
        { title: 'Recent Locations', dictGroup: 'Menu' },
        reactDefault.a.createElement(controls.c, {
          label: 'Record recent files and folders',
          keyName: 'noRecentFiles',
          checked: !this.getValue('noRecentFiles'),
          onChange: this.onChange,
          reverse: !0,
          hintLink: 'https://github.com/Refinex-Space/marklyra',
        }),
        reactDefault.a.createElement(
          controls.q,
          null,
          reactDefault.a.createElement(controls.b, {
            label: 'Clear Recent Folders and Files',
            onClick: function () {
              window.Setting.invoke('setting.askForClearRecentDocuments');
            },
          }),
        ),
      ),
      reactDefault.a.createElement(
        controls.k,
        { title: 'When drop file / folder into MarkLyra' },
        reactDefault.a.createElement(controls.v, {
          rows: [
            [
              'When drop folder',
              reactDefault.a.createElement(controls.r, {
                keyName: 'actionWhenDropFolder',
                value: this.getValue('actionWhenDropFolder'),
                onChange: function (settingKey, settingValue) {
                  component.onChange(settingKey, settingValue);
                },
                options: { '': 'Open in MarkLyra', link: 'Insert Folder Link' },
              }),
            ],
            [
              'When drop markdown file',
              reactDefault.a.createElement(controls.r, {
                keyName: 'actionWhenDropFile',
                value: this.getValue('actionWhenDropFile'),
                onChange: function (settingKey, settingValue) {
                  component.onChange(settingKey, settingValue);
                },
                options: { '': 'Open in MarkLyra', link: 'Insert File Link' },
              }),
            ],
            [
              'When drop files that can be imported',
              reactDefault.a.createElement(controls.r, {
                keyName: 'actionWhenDropImport',
                value: this.getValue('actionWhenDropImport'),
                onChange: function (settingKey, settingValue) {
                  component.onChange(settingKey, settingValue);
                },
                options: { '': 'Import File', link: 'Insert File Link' },
              }),
            ],
          ],
        }),
      ),
    );
  }
  var tabNames = ['Files', 'Editor', 'Image', 'Markdown', 'Export', 'Appearance', 'General'],
    sidebarIcons = {
      Files: reactDefault.a.createElement(
        'span',
        { className: 'icon', style: { overflow: 'visible' } },
        reactDefault.a.createElement(icons.g, { style: { overflow: 'visible' } }),
      ),
      Markdown: reactDefault.a.createElement(
        'span',
        { className: 'icon', style: { overflow: 'visible' } },
        reactDefault.a.createElement(icons.k, { style: { overflow: 'visible' } }),
      ),
      Editor: reactDefault.a.createElement(
        'span',
        { className: 'icon', style: { overflow: 'visible' } },
        reactDefault.a.createElement(icons.d, { style: { overflow: 'visible' } }),
      ),
      Appearance: reactDefault.a.createElement(
        'span',
        { className: 'icon', style: { overflow: 'visible' } },
        reactDefault.a.createElement(icons.l, { style: { overflow: 'visible' } }),
      ),
      Export: reactDefault.a.createElement(
        'span',
        { className: 'icon', style: { overflow: 'visible' } },
        reactDefault.a.createElement(icons.f, { style: { overflow: 'visible' } }),
      ),
      Image: reactDefault.a.createElement(
        'span',
        { className: 'icon', style: { overflow: 'visible' } },
        reactDefault.a.createElement(icons.j, { style: { overflow: 'visible' } }),
      ),
      General: reactDefault.a.createElement(
        'span',
        { className: 'icon', style: { overflow: 'visible' } },
        reactDefault.a.createElement(icons.h, { style: { overflow: 'visible' } }),
      ),
      About: reactDefault.a.createElement(
        'span',
        { className: 'icon', style: { overflow: 'visible' } },
        reactDefault.a.createElement(icons.a, {
          style: { marginTop: '1px', display: 'block', zoom: 0.9 },
        }),
      ),
    },
    PreferencesErrorBoundary = (function (BaseComponent) {
      Object(inherits.a)(n, BaseComponent);
      var constructParent = Object(possibleConstructorReturn.a)(n);
      function n() {
        return Object(classCallCheck.a)(this, n), constructParent.apply(this, arguments);
      }
      return (
        Object(createClass.a)(n, [
          {
            key: 'getSnapshotBeforeUpdate',
            value: function (unusedParameter1, unusedParameter2) {
              return reactDomDefault.a.findDOMNode(this).classList.contains('no-search-hit');
            },
          },
          {
            key: 'componentDidUpdate',
            value: function (unusedParameter1, unusedParameter2, hadNoSearchMatch) {
              if (hadNoSearchMatch)
                return reactDomDefault.a.findDOMNode(this).classList.add('no-search-hit');
            },
          },
          {
            key: 'render',
            value: function () {
              var props = this.props,
                label = props.label,
                active = props.active,
                onClick = props.onClick,
                extraProps = Object(objectWithoutProperties.a)(props, [
                  'label',
                  'active',
                  'onClick',
                ]);
              return reactDefault.a.createElement(
                'span',
                Object.assign(
                  { className: 'nav-group-item ' + (active ? 'active' : ''), onClick: onClick },
                  extraProps,
                ),
                (window.isMac && sidebarIcons[label]) || null,
                Object(localization.a)(
                  label,
                  'Image' == label || 'Export' == label || 'My License' == label ? 'Menu' : void 0,
                ),
              );
            },
          },
        ]),
        n
      );
    })(reactDefault.a.PureComponent),
    be = function (sidebarProps) {
      var activeTab = sidebarProps.activeTab,
        onSwitchTab = sidebarProps.onSwitchTab,
        onSearch = sidebarProps.onSearch;
      return reactDefault.a.createElement(
        'ul',
        { className: 'list-group' },
        reactDefault.a.createElement(
          'li',
          { className: 'list-group-header' },
          reactDefault.a.createElement(searchAndPlatform.b, { onSearch: onSearch }),
        ),
        reactDefault.a.createElement(
          'li',
          { className: 'list-group-content' },
          tabNames.map(function (label, itemIndex) {
            return reactDefault.a.createElement(PreferencesErrorBoundary, {
              label: label,
              key: itemIndex,
              'data-index': itemIndex,
              active: activeTab == itemIndex,
              onClick: function () {
                onSwitchTab(itemIndex);
              },
            });
          }),
        ),
      );
    },
    PreferencesWindow = (function (BaseComponent) {
      Object(inherits.a)(n, BaseComponent);
      var constructParent = Object(possibleConstructorReturn.a)(n);
      function n(props) {
        var instance;
        return (
          Object(classCallCheck.a)(this, n),
          ((instance = constructParent.call(this, props)).state = {
            activeTab: 0,
            search: '',
            highlightId: '',
          }),
          (instance.onChange = instance.onChange.bind(Object(assertThisInitialized.a)(instance))),
          (instance.onSwitchTab = instance.onSwitchTab.bind(
            Object(assertThisInitialized.a)(instance),
          )),
          (instance.onSearch = instance.onSearch.bind(Object(assertThisInitialized.a)(instance))),
          (instance.getValue = instance.getValue.bind(Object(assertThisInitialized.a)(instance))),
          (instance.resetWordsPerMinute = instance.resetWordsPerMinute.bind(
            Object(assertThisInitialized.a)(instance),
          )),
          (instance.onChangeLaunchAction = instance.onChangeLaunchAction.bind(
            Object(assertThisInitialized.a)(instance),
          )),
          (instance.onResetDialogWarning = instance.onResetDialogWarning.bind(
            Object(assertThisInitialized.a)(instance),
          )),
          (instance.container = reactDefault.a.createRef()),
          (window.makeHighlight = instance.makeHighlight.bind(
            Object(assertThisInitialized.a)(instance),
          )),
          instance
        );
      }
      return (
        Object(createClass.a)(n, [
          {
            key: 'makeHighlight',
            value: function (highlightId) {
              var component = this,
                highlightState = { highlightId: highlightId };
              'image-setting-group' == highlightId &&
                this.setState(Object(objectSpread.a)({ activeTab: 2 }, highlightState)),
                'smart-punctuation-group' == highlightId &&
                  this.setState(Object(objectSpread.a)({ activeTab: 3 }, highlightState)),
                'pandoc-setting-group' == highlightId &&
                  this.setState(Object(objectSpread.a)({ activeTab: 4 }, highlightState)),
                'export-setting-group' == highlightId && this.setState({ activeTab: 4 }),
                'math-syntax-toggle-group' == highlightId &&
                  this.setState(Object(objectSpread.a)({ activeTab: 3 }, highlightState)),
                setTimeout(function () {
                  component.setState({ highlightId: '' });
                }, 4e3);
            },
          },
          {
            key: 'getValue',
            value: function (propertyKey, stateKey, fallbackValue) {
              return (
                (stateKey = stateKey || propertyKey),
                void 0 !== this.state[stateKey]
                  ? void 0 === this.state[stateKey]
                    ? fallbackValue
                    : this.state[stateKey]
                  : void 0 === this.props[propertyKey]
                    ? fallbackValue
                    : this.props[stateKey]
              );
            },
          },
          {
            key: 'componentDidUpdate',
            value: function (previousProps, previousState) {
              if (previousProps === this.props) {
                if (previousState.search != this.state.search) {
                  var search = this.state.search,
                    currentCurrent = this.container.current;
                  if (search.trim()) {
                    var elements = currentCurrent.querySelectorAll('.content'),
                      currentItems = Array.prototype.slice.call(elements),
                      matchesPerTab = [],
                      activeTab = -1;
                    currentItems.forEach(function (element) {
                      var tabIndex = element.getAttribute('data-index') - 0;
                      if (!isNaN(tabIndex)) {
                        var matchCount =
                          element.querySelectorAll('.search-hit').length -
                          element.querySelectorAll('.search-hit .search-hit').length;
                        matchesPerTab[tabIndex] = matchCount;
                        var currentElement = currentCurrent.querySelector(
                          ".nav-group-item[data-index='" + tabIndex + "']",
                        );
                        if (currentElement) {
                          var classList = currentElement.classList;
                          matchCount > 0
                            ? ((activeTab =
                                activeTab < 0 ? tabIndex : Math.min(activeTab, tabIndex)),
                              classList.remove('no-search-hit'))
                            : classList.add('no-search-hit');
                        }
                      }
                    }),
                      currentCurrent.classList.add('on-performance-search'),
                      matchesPerTab[this.state.activeTab] ||
                        this.setState({ activeTab: activeTab });
                  } else
                    currentCurrent.classList.remove('on-performance-search'),
                      this.state.activeTab < 0 && this.setState({ activeTab: 0 });
                }
              } else
                this.setState(
                  Object(objectSpread.a)({ activeTab: this.state.activeTab }, this.props),
                );
            },
          },
          {
            key: 'onSwitchTab',
            value: function (activeTab) {
              this.setState({ activeTab: activeTab });
            },
          },
          {
            key: 'onSearch',
            value: function (search) {
              this.setState({ search: search });
            },
          },
          {
            key: 'resetWordsPerMinute',
            value: function (readingSpeed) {
              this.onChange('wordsPerMinute', readingSpeed || 382);
            },
          },
          {
            key: 'onChange',
            value: function (settingKey, settingValue) {
              return window.__MARKLYRA_SETTINGS_CHANGE__(this, settingKey, settingValue);
            },
          },
          {
            key: 'argsFromString',
            value: function (commandLine) {
              if (!(commandLine || '').trim()) return null;
              for (
                var match,
                  tokenPattern =
                    /("[^"\\]*(?:\\[\S\s][^"\\]*)*"|'[^'\\]*(?:\\[\S\s][^'\\]*)*'|\/[^\/\\]*(?:\\[\S\s][^\/\\]*)*\/[gimy]*(?=\s|$)|(?:\\\s|\S)+)/g,
                  currentItems = [];
                (match = tokenPattern.exec(commandLine));
              ) {
                var text = match[0].replace(/\\(\s)/g, '$1');
                /"$/.exec(text)
                  ? (text = text.replace(/(^|[^\\])"/g, '$1'))
                  : /'$/.exec(text) && (text = text.replace(/(^|[^\\])'/g, '$1')),
                  currentItems.push(text);
              }
              return currentItems;
            },
          },
          {
            key: 'onChangeExtraActions',
            value: function (settingKey, useMirrorInCN) {
              if (
                settingKey &&
                ('image_uploader' !== settingKey || 'picgo-intro' != useMirrorInCN)
              ) {
                var text,
                  Setting = window.Setting;
                switch (
                  (useMirrorInCN &&
                  useMirrorInCN.extraArguments &&
                  'string' === typeof useMirrorInCN.extraArguments
                    ? Setting.put(
                        settingKey,
                        Object(objectSpread.a)(
                          Object(objectSpread.a)({}, useMirrorInCN),
                          {},
                          { extraArguments: this.argsFromString(useMirrorInCN.extraArguments) },
                        ),
                      )
                    : Setting.put(settingKey, useMirrorInCN),
                  settingKey)
                ) {
                  case 'WebKitDeveloperExtras':
                    Setting.updateEnableDebug(useMirrorInCN);
                    break;
                  case 'use_seamless_window':
                    Setting.updateWindowStyle(useMirrorInCN);
                    break;
                  case 'useCustomFontSize':
                    Setting.execCommand(
                      'File.option.useCustomFontSize=%@'.replace(
                        '%@',
                        useMirrorInCN ? 'true' : 'false',
                      ),
                    ),
                      useMirrorInCN
                        ? Setting.execCommand(
                            "document.body.parentElement.style.fontSize = '" +
                              (this.getValue('customFontSize') || 14) +
                              "px'",
                          )
                        : Setting.execCommand("document.body.parentElement.style.fontSize = ''");
                    break;
                  case 'customFontSize':
                    this.getValue('useCustomFontSize') &&
                      (Setting.execCommand(
                        'File.option.customFontSize=%@'.replace('%@', useMirrorInCN),
                      ),
                      Setting.execCommand(
                        "document.body.parentElement.style.fontSize = '" +
                          (useMirrorInCN || 14) +
                          "px'",
                      ));
                    break;
                  case 'always_show_wordcount':
                    Setting.updateAlwaysShowWordCount(useMirrorInCN);
                    break;
                  case 'wordsPerMinute':
                    Setting.put('customWordsPerMinute', !0),
                      Setting.execCommand(
                        'File.option.customWordsPerMinute = true; File.option.wordsPerMinute = $2;'.replace(
                          '$2',
                          useMirrorInCN,
                        ),
                      );
                    break;
                  case 'can_collapse_outline_panel':
                    Setting.execCommand(
                      'File.setCanCollapsePinnedOutline(%@);'.replace('%@', useMirrorInCN),
                    );
                    break;
                  case 'indentSize':
                    Setting.execCommand('File.setIndentSize(%@);'.replace('%@', useMirrorInCN));
                    break;
                  case 'prettyIndent':
                    Setting.execCommand(
                      'File.option.prettyIndent = %@;'.replace('%@', useMirrorInCN),
                    );
                    break;
                  case 'no_pairing_match':
                    Setting.execCommand(
                      'File.option.noPairingMatch = %@;'.replace('%@', useMirrorInCN),
                    );
                    break;
                  case 'noEmojiAutoComplete':
                    Setting.execCommand(
                      'File.option.noEmojiAutoComplete = %@;'.replace('%@', useMirrorInCN),
                    );
                    break;
                  case 'match_pari_markdown':
                    Setting.execCommand(
                      'File.option.autoPairExtendSymbol = %@;'.replace('%@', useMirrorInCN),
                    );
                    break;
                  case 'auto_expand_block':
                    Setting.execCommand(
                      'File.option.expandSimpleBlock = %@;'.replace('%@', useMirrorInCN),
                    );
                    break;
                  case 'copy_markdown_by_default':
                    Setting.execCommand(
                      'File.option.copyMarkdownByDefault = %@;'.replace('%@', useMirrorInCN),
                    );
                    break;
                  case 'lineWiseCopyCut':
                    Setting.execCommand(
                      'File.option.lineWiseCopyCut = %@;'.replace('%@', useMirrorInCN),
                    );
                    break;
                  case 'no_mid_caret':
                    Setting.execCommand(
                      'File.option.scrollWithCursor = %@;'.replace('%@', !useMirrorInCN),
                    );
                    break;
                  case 'image_save_location':
                    'custom' !== useMirrorInCN
                      ? Setting.updateImageSaveLocation(useMirrorInCN)
                      : (text = this.getValue('custom_image_save_location')) &&
                        text.trim().length &&
                        Setting.execCommand(
                          'File.setDefaultImageStorage(%@)'.replace(
                            '%@',
                            JSON.stringify(text.trim()),
                          ),
                        );
                    break;
                  case 'custom_image_save_location':
                    useMirrorInCN.trim().length &&
                      Setting.execCommand(
                        'File.setDefaultImageStorage(%@)'.replace(
                          '%@',
                          JSON.stringify(useMirrorInCN.trim()),
                        ),
                      );
                    break;
                  case 'picgo_app_path':
                    useMirrorInCN.trim().length &&
                      Setting.execCommand(
                        'File.option.picgoAppPath=%@'.replace(
                          '%@',
                          JSON.stringify(useMirrorInCN.trim()),
                        ),
                      );
                    break;
                  case 'piclistAppPath':
                    useMirrorInCN.trim().length &&
                      Setting.execCommand(
                        'File.option.piclistAppPath=%@'.replace(
                          '%@',
                          JSON.stringify(useMirrorInCN.trim()),
                        ),
                      );
                    break;
                  case 'image_uploader':
                    Setting.execCommand(
                      'File.option.imageUploader=%@'.replace(
                        '%@',
                        JSON.stringify(useMirrorInCN.trim()),
                      ),
                    );
                    break;
                  case 'custom_image_uploader':
                    Setting.execCommand(
                      'File.option.customImageUploader=%@'.replace(
                        '%@',
                        JSON.stringify(useMirrorInCN.trim()),
                      ),
                    );
                    break;
                  case 'no_image_move_for_local':
                    Setting.execCommand(
                      'File.option.applyImageMoveForLocal = %@'.replace('%@', !useMirrorInCN),
                    );
                    break;
                  case 'apply_image_move_for_web':
                    Setting.execCommand(
                      'File.option.applyImageMoveForWeb = %@'.replace('%@', useMirrorInCN),
                    );
                    break;
                  case 'use_relative_path_for_img':
                    Setting.execCommand(
                      'File.option.useRelativePathForImg = %@'.replace('%@', useMirrorInCN),
                    );
                    break;
                  case 'relativePathWithDot':
                    Setting.execCommand(
                      'File.option.relativePathWithDot = %@'.replace('%@', useMirrorInCN),
                    );
                    break;
                  case 'allow_image_upload':
                    Setting.execCommand(
                      'File.option.allowImageUpload = %@'.replace('%@', useMirrorInCN),
                    );
                    break;
                  case 'heading_style':
                    Setting.execCommand(
                      'File.option.headingStyle = %@'.replace('%@', useMirrorInCN),
                    );
                    break;
                  case 'ul_style':
                    Setting.execCommand('File.option.ulStyle = %@'.replace('%@', useMirrorInCN));
                    break;
                  case 'ol_style':
                    Setting.execCommand('File.option.olStyle = %@'.replace('%@', useMirrorInCN));
                    break;
                  case 'smartQuote':
                    Setting.setSmartQuote(useMirrorInCN);
                    break;
                  case 'smartDash':
                    Setting.setSmartDash(useMirrorInCN);
                    break;
                  case 'SmartyPantsOnRendering':
                    Setting.setConvertOnRendering(useMirrorInCN);
                    break;
                  case 'remapPunctuation':
                    Setting.setRemapPunctuation(useMirrorInCN);
                    break;
                  case 'userQuotesArray':
                    Setting.execCommand(
                      'File.option.userQuotesArray = %@'.replace(
                        '%@',
                        JSON.stringify(useMirrorInCN),
                      ),
                    );
                    break;
                  case 'codeIndentSize':
                    Setting.execCommand(
                      'File.option.codeIndentSize = %@'.replace('%@', useMirrorInCN),
                    );
                    break;
                  case 'ignoreLineBreak':
                    Setting.execCommand(
                      'File.setIgnoreLineBreak(%@, true)'.replace('%@', useMirrorInCN),
                    );
                    break;
                  case 'preLinebreakOnExport':
                    Setting.execCommand(
                      'File.option.preLinebreakOnExport = %@'.replace('%@', useMirrorInCN),
                    );
                    break;
                  case 'showStatusBar':
                    Setting.execCommand(
                      useMirrorInCN
                        ? function () {
                            document.body.classList.add('show-footer'),
                              document.body.classList.remove('hide-footer');
                          }
                        : function () {
                            document.body.classList.remove('show-footer'),
                              document.body.classList.add('hide-footer');
                          },
                    );
                    break;
                  case 'debug':
                    Setting.execCommand(
                      useMirrorInCN
                        ? 'function() {$("[data-group=\'dev-tool\']").show();}'
                        : 'function() {$("[data-group=\'dev-tool\']").hide();}',
                    );
                    break;
                  case 'preset_spell_check':
                    Setting.evaluateInHost(
                      "File.option.presetSpellCheck = '" +
                        useMirrorInCN +
                        "';File.editor.spellChecker.setLangMode('" +
                        useMirrorInCN +
                        "');",
                    );
                    break;
                  case 'line_ending_crlf':
                    Setting.execCommand(
                      'function(){File.option.preferCRLF = ' + useMirrorInCN + ';}',
                    );
                    break;
                  case 'enableAutoSave':
                    Setting.execCommand(
                      'function(){File.option.enableAutoSave = ' + useMirrorInCN + ';}',
                    );
                    break;
                  case 'save_file_on_switch':
                    window.isNode &&
                      Setting.execCommand(
                        'function(){File.option.saveFileOnSwitch = ' + useMirrorInCN + ';}',
                      );
                    break;
                  case 'indentFirstLine':
                    Setting.execCommand('File.setIndentFirstLine(' + useMirrorInCN + ', true);');
                    break;
                  case 'hideBrAndLineBreak':
                    Setting.execCommand('File.setHideBrAndLineBreak(' + useMirrorInCN + ', true);');
                    break;
                  case 'autoEscapeImageURL':
                    Setting.execCommand('File.option.autoEscapeImageURL=' + useMirrorInCN + ';');
                    break;
                  case 'mathFormatOnCopy':
                    Setting.evaluateInHost(
                      "File.option.mathFormatOnCopy = '" + useMirrorInCN + "';",
                    );
                    break;
                  case 'image_uploader':
                    Setting.execCommand(
                      'File.option.imageUploader = ' + JSON.stringify(useMirrorInCN) + ';',
                    );
                    break;
                  case 'custom_image_uploader':
                    Setting.execCommand(
                      'File.option.customImageUploader = ' + JSON.stringify(useMirrorInCN) + ';',
                    );
                    break;
                  case 'theme':
                    Setting.setTheme(useMirrorInCN, !1);
                    break;
                  case 'darkTheme':
                    Setting.setTheme(useMirrorInCN, !0);
                    break;
                  case 'useSeparateDarkTheme':
                    window.isNode && Setting.invoke('theme.setThemeSource', 'system'),
                      Setting.setTheme(this.getValue('theme'), !1);
                    break;
                  case 'pandocPath':
                    Setting.execCommand(
                      'File.option.pandocPath = ' + JSON.stringify(useMirrorInCN) + ';',
                    );
                    break;
                  case 'shiftTabAutoIndent':
                    !0 === useMirrorInCN || 'true' === useMirrorInCN
                      ? Setting.execCommand(
                          'CodeMirror.keyMap.default["Shift-Tab"] = "indentAuto";',
                        )
                      : Setting.execCommand(
                          'CodeMirror.keyMap.default["Shift-Tab"] = "indentLess";',
                        );
                    break;
                  case 'customExport':
                    Setting.reloadExportMenu();
                    break;
                  case 'defaultExtension':
                    Setting.execCommand(
                      'File.setDefaultExtension(' +
                        JSON.stringify(
                          'custom' === useMirrorInCN ? '' : useMirrorInCN.replace(/^\./, ''),
                        ) +
                        ');',
                    );
                    break;
                  case 'actionWhenDropFolder':
                    Setting.execCommand(
                      'File.option.actionWhenDropFolder = ' + JSON.stringify(useMirrorInCN) + ';',
                    );
                    break;
                  case 'actionWhenDropFile':
                    Setting.execCommand(
                      'File.option.actionWhenDropFile = ' + JSON.stringify(useMirrorInCN) + ';',
                    );
                    break;
                  case 'actionWhenDropImport':
                    Setting.execCommand(
                      'File.option.actionWhenDropImport = ' + JSON.stringify(useMirrorInCN) + ';',
                    );
                    break;
                  case 'useMirrorInCN':
                    window.useMirrorInCN = useMirrorInCN;
                    break;
                  case 'defaultCodeLang':
                    Setting.execCommand(
                      'File.option.defaultCodeLang = ' + JSON.stringify(useMirrorInCN) + ';',
                    );
                    break;
                  case 'defaultCodeLangOption':
                    Setting.execCommand(
                      'File.option.defaultCodeLangOption = ' + useMirrorInCN + ';',
                    );
                    break;
                  case 'zoomLevel':
                    Setting.execCommand(
                      'window.ClientCommand && ClientCommand.setZoomLevel(' + useMirrorInCN + ')',
                    );
                    break;
                  case 'zoomFactor':
                    Setting.invoke('setZoom', useMirrorInCN);
                    break;
                  case 'zoomByMouse':
                    Setting.execCommand('File.option.zoomByMouse = ' + useMirrorInCN + ';');
                }
              }
            },
          },
          {
            key: 'imageFolderIsInvalid',
            value: function (inputText) {
              if (/^\.\.?[\/\\]/.exec((inputText = inputText || ''))) return !1;
              var substringLength = inputText.indexOf('${filename}'),
                text = inputText;
              return (
                substringLength > -1 && (text = inputText.substr(0, substringLength)),
                text
                  ? '/' == text
                    ? Object(localization.a)('Cannot use root path.')
                    : !window.Setting.existsDir(text) &&
                      Object(localization.a)(
                        'Folder not exist at %@, please input another path.',
                      ).replace('%@', text)
                  : Object(localization.a)('Please input the folder path for images.')
              );
            },
          },
          {
            key: 'onChangeLaunchAction',
            value: function (settingKey, modeValue) {
              var component = this;
              if (3 == modeValue) {
                var text = this.getValue('pinFolder');
                text
                  ? this.onChange(settingKey, modeValue)
                  : window.Setting.selectFolder(null, function (selectedFolder) {
                      selectedFolder &&
                        ((text = selectedFolder),
                        component.onChange('pinFolder', text),
                        component.onChange(settingKey, modeValue));
                    });
              } else this.onChange(settingKey, modeValue);
            },
          },
          {
            key: 'onResetDialogWarning',
            value: function () {
              this.onChange('noWarnigForMoveFile', !1),
                this.onChange('noWarnigForMoveFileToList', !1),
                this.onChange('noWarnigForDeleteFile', !1),
                this.onChange('pass_upload_confirm', !1),
                this.onChange('noWarnigForTypeWriterMode', !1),
                this.onChange('noWarnigForFocusMode', !1),
                this.onChange('noHintForOpenLink', !1),
                this.onChange('noHintForUnibody', !1),
                this.onChange('noWarnigUploadDisabled', !1),
                this.onChange('noWarningForExportOverwrite', !1),
                this.onChange('noWarningForDeleteImage', !1),
                this.onChange('noWarningForMoveImage', !1),
                this.onChange('noWarningForUpdateImageReference', !1),
                window.Setting.execCommand(
                  'File.option.noWarnigForMoveFile = false; File.option.noWarnigForMoveFileToList = false; File.option.noWarnigForDeleteFile = false; File.option.pass_upload_confirm = false; File.option.noWarnigForTypeWriterMode = false; File.option.noWarnigForFocusMode = false; File.option.noHintForOpenLink = false; File.option.noHintForUnibody = false; File.option.noWarnigUploadDisabled = false; File.option.noWarningForExportOverwrite = false;File.option.noWarningForDeleteImage=false;File.option.noWarningForMoveImage=false;File.option.noWarningForUpdateImageReference=false;',
                ),
                window.Setting.showAlert(
                  Object(localization.a)('Dialog warnings have been reset.'),
                );
            },
          },
          {
            key: 'onOpenAdvancedSettings',
            value: function () {
              var configDirectory = window.Setting.userDataPath() + '/conf',
                userConfigPath = configDirectory + '/conf.user.json';
              window.require('fs-plus').isFileSync(userConfigPath)
                ? window.isWin
                  ? window.Setting.openFolder(configDirectory)
                  : window.Setting.openFolder(userConfigPath)
                : window.Setting.doResetAdvancedSettings(!0);
            },
          },
          {
            key: 'onResetAdvancedSettings',
            value: function () {
              window.Setting.showConfirm(
                Object(localization.a)('Revert advanced setting file to default one ?', 'Front'),
              ).then(function (result) {
                result && window.Setting.doResetAdvancedSettings();
              });
            },
          },
          {
            key: 'noFondPanel',
            value: function () {
              return reactDefault.a.createElement(
                controls.o,
                {
                  active: -1 == this.state.activeTab,
                  style: { display: 'flex', alignItems: 'center', marginTop: '40%' },
                },
                reactDefault.a.createElement(
                  'div',
                  { style: { textAlign: 'center', margin: 'auto' } },
                  Object(localization.a)('No results found for "%@"').replace(
                    '%@',
                    this.state.search,
                  ),
                ),
              );
            },
          },
          {
            key: 'panelHeader',
            value: function (isNodeHtml) {
              return window.isNodeHtml && isNodeHtml
                ? reactDefault.a.createElement(
                    'h3',
                    { className: 'panel-header' },
                    Object(localization.a)(isNodeHtml),
                  )
                : null;
            },
          },
          {
            key: 'render',
            value: function () {
              return reactDefault.a.createElement(
                searchAndPlatform.a.Provider,
                { value: this.state.search },
                reactDefault.a.createElement(
                  'div',
                  { className: 'window' },
                  window.isNodeHtml ? reactDefault.a.createElement(controls.x, null) : null,
                  reactDefault.a.createElement(
                    'div',
                    { className: 'window-content' },
                    reactDefault.a.createElement(
                      'div',
                      { className: 'pane-group', ref: this.container },
                      reactDefault.a.createElement(
                        'div',
                        { className: 'pane-sm sidebar' },
                        reactDefault.a.createElement(be, {
                          activeTab: this.state.activeTab,
                          onSwitchTab: this.onSwitchTab,
                          onSearch: this.onSearch,
                        }),
                      ),
                      reactDefault.a.createElement(
                        'div',
                        { className: 'pane' },
                        this.noFondPanel(),
                        me.call(this),
                        v.call(this),
                        ue.call(this),
                        imageUploader.a.call(this),
                        pe.call(this),
                        ce.call(this),
                        se.call(this),
                      ),
                    ),
                  ),
                ),
              );
            },
          },
        ]),
        n
      );
    })(react.Component);
  moduleExports.a = PreferencesWindow;
});
