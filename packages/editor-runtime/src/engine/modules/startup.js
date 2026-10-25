// startup.
// SystemJS module a. Dependencies: e, b, c, d, f, 10, 3d, 5f.
$__System.registerDynamic(
  'a',
  ['e', 'b', 'c', 'd', 'f', '10', '3d', '5f'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    this || self;
    (window.$ = requireModule('e')),
      (window.jQuery = window.$),
      (window.fastdom = requireModule('b')),
      (window.fastdomPromised = requireModule('c')),
      (fastdom = fastdom.extend(fastdomPromised)),
      fastdom.strict && fastdom.strict(!1),
      requireModule('d'),
      requireModule('f'),
      (window.NFile = window.File);
    var locale = window._options.userLocale || 'Base',
      fileController = (requireModule('10'), requireModule('3d')),
      EditorController = requireModule('5f');
    window._options && (locale = _options.locale || _options.userLocale);
    var localeOptions = { language: locale, pathPrefix: 'locales' };
    if (
      (($.localize.localeOption = localeOptions),
      $("[data-lg='Front'], [data-after-content], [marklyra-hint]").localize(
        'Front',
        localeOptions,
      ),
      window.reqnode && window._options.sidebarTab && window.innerWidth > 540)
    ) {
      var sidebarElement = document.querySelector('#marklyra-sidebar');
      sidebarElement.classList.add('open'),
        (sidebarElement.style.transition = '0s'),
        document.body.classList.add('pin-outline'),
        _options.sidebarWidth &&
          document.documentElement.style.setProperty(
            '--sidebar-width',
            _options.sidebarWidth + 'px',
          );
    }
    ($.fn.rawText = function (rawTextOption) {
      return this.length ? this[0].rawText(rawTextOption) : '';
    }),
      (window.setWritingContent = function (container, html) {
        for (; container.lastChild; ) container.removeChild(container.lastChild);
        var contentContainer = document.createElement('div');
        contentContainer.innerHTML = html;
        for (var fragment = document.createDocumentFragment(); contentContainer.firstChild; )
          fragment.appendChild(contentContainer.firstChild);
        container.appendChild(fragment);
      }),
      (window.File = fileController),
      (fileController.language = locale),
      (init = function () {
        var editor = new EditorController('#write', fileController);
        !(function (inputEditor) {
          window.getMarkdown = function () {
            return inputEditor.getMarkdown();
          };
        })(editor),
          (window.editor = editor),
          setTimeout(function () {
            (document.querySelector('#marklyra-sidebar').style.transition = ''),
              $("[data-lg='Panel']").localize('Panel', localeOptions),
              $("[data-lg='Menu']").localize('Menu', localeOptions);
          }, 20);
      }),
      (moduleExports.init = init),
      fileController.isNodeHtml || init();
  },
);
