// startup.
export default function initializeStartup(requireModule, moduleExports, moduleRecord) {
  if (!this) {
    self;
  }
  window.$ = requireModule('libraries/jquery');
  window.jQuery = window.$;
  window.fastdom = requireModule('libraries/fastdom');
  window.fastdomPromised = requireModule('libraries/fastdom-promised');
  fastdom = fastdom.extend(fastdomPromised);
  if (fastdom.strict) {
    fastdom.strict(false);
  }
  requireModule('ui/localization');
  requireModule('libraries/bootstrap-widgets');
  window.NFile = window.File;
  var locale = window._options.userLocale || 'Base',
    fileController =
      (requireModule('host/clipboard-bridge'), requireModule('document/file-controller')),
    EditorController = requireModule('editor-controller');
  if (window._options) {
    locale = _options.locale || _options.userLocale;
  }
  var localeOptions = { language: locale, pathPrefix: 'locales' };
  $.localize.localeOption = localeOptions;
  $("[data-lg='Front'], [data-after-content], [marklyra-hint]").localize('Front', localeOptions);
  if (window.reqnode && window._options.sidebarTab && window.innerWidth > 540) {
    var sidebarElement = document.querySelector('#marklyra-sidebar');
    sidebarElement.classList.add('open');
    sidebarElement.style.transition = '0s';
    document.body.classList.add('pin-outline');
    if (_options.sidebarWidth) {
      document.documentElement.style.setProperty('--sidebar-width', _options.sidebarWidth + 'px');
    }
  }
  $.fn.rawText = function (rawTextOption) {
    if (this.length) {
      return this[0].rawText(rawTextOption);
    } else {
      return '';
    }
  };
  window.setWritingContent = function (container, html) {
    for (; container.lastChild; ) {
      container.removeChild(container.lastChild);
    }
    var contentContainer = document.createElement('div');
    contentContainer.innerHTML = html;
    for (var fragment = document.createDocumentFragment(); contentContainer.firstChild; ) {
      fragment.appendChild(contentContainer.firstChild);
    }
    container.appendChild(fragment);
  };
  window.File = fileController;
  fileController.language = locale;
  init = function () {
    var editor = new EditorController('#write', fileController);
    !(function (inputEditor) {
      window.getMarkdown = function () {
        return inputEditor.getMarkdown();
      };
    })(editor);
    window.editor = editor;
    setTimeout(function () {
      document.querySelector('#marklyra-sidebar').style.transition = '';
      $("[data-lg='Panel']").localize('Panel', localeOptions);
      $("[data-lg='Menu']").localize('Menu', localeOptions);
    }, 20);
  };
  moduleExports.init = init;
  if (!fileController.isNodeHtml) {
    init();
  }
}
