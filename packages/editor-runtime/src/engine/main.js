// The source entry owns dependency registration and initialization order.
import { createEngineLoader } from './module-loader.js';
import installSharedGlobalHelpers from './modules/shared/global-helpers.js';
import installLibrariesFastdom from './modules/libraries/fastdom.js';
import installLibrariesFastdomPromised from './modules/libraries/fastdom-promised.js';
import initializeUiLocalization from './modules/ui/localization.js';
import installLibrariesBootstrapWidgets from './modules/libraries/bootstrap-widgets.js';
import initializeHostClipboardBridge from './modules/host/clipboard-bridge.js';
import initializeModelMarkdownSerializer from './modules/model/markdown-serializer.js';
import initializeModelHtmlRenderer from './modules/model/html-renderer.js';
import initializeModelNodeEditing from './modules/model/node-editing.js';
import initializeCodemirrorSelectionMarkers from './modules/codemirror/selection-markers.js';
import initializeCodemirrorCloseBrackets from './modules/codemirror/close-brackets.js';
import initializeCodemirrorCloseTags from './modules/codemirror/close-tags.js';
import initializeCodemirrorOverlayMode from './modules/codemirror/overlay-mode.js';
import initializeCodemirrorLint from './modules/codemirror/lint.js';
import initializeCodemirrorEditorExtensions from './modules/codemirror/editor-extensions.js';
import initializeRenderCodeFences from './modules/render/code-fences.js';
import initializeRenderInlineMath from './modules/render/inline-math.js';
import initializeRenderBrushQueue from './modules/render/brush-queue.js';
import initializeEditingAutocomplete from './modules/editing/autocomplete.js';
import initializeMediaImageScale from './modules/media/image-scale.js';
import initializeMediaImageEditor from './modules/media/image-editor.js';
import initializeDocumentOptions from './modules/document/options.js';
import initializeDocumentFileSnapshot from './modules/document/file-snapshot.js';
import initializeDocumentTextBundle from './modules/document/text-bundle.js';
import initializeDocumentFileWriter from './modules/document/file-writer.js';
import installLibrariesErrorReporterRuntime from './modules/libraries/error-reporter-runtime.js';
import installLibrariesErrorReporterExport from './modules/libraries/error-reporter-export.js';
import initializeHostLocalDiagnostics from './modules/host/local-diagnostics.js';
import initializeDocumentFileController from './modules/document/file-controller.js';
import initializeDocumentEditingState from './modules/document/editing-state.js';
import initializeUiFindReplace from './modules/ui/find-replace.js';
import initializeUiWordCount from './modules/ui/word-count.js';
import initializeUiPageBreaks from './modules/ui/page-breaks.js';
import initializeExportHtml from './modules/export/html.js';
import initializeExportPrintAndImages from './modules/export/print-and-images.js';
import initializeExportPandoc from './modules/export/pandoc.js';
import initializeExportController from './modules/export/controller.js';
import initializeCodemirrorActiveLine from './modules/codemirror/active-line.js';
import initializeCodemirrorMarkdownOverlay from './modules/codemirror/markdown-overlay.js';
import initializeEditingSourceMode from './modules/editing/source-mode.js';
import initializeDocumentProjectSettings from './modules/document/project-settings.js';
import initializeUiFolderSearch from './modules/ui/folder-search.js';
import initializeUiContextMenu from './modules/ui/context-menu.js';
import initializeHostSpellchecker from './modules/host/spellchecker.js';
import initializeUiSpelling from './modules/ui/spelling.js';
import installLibrariesDomMorph from './modules/libraries/dom-morph.js';
import initializeUiFileTree from './modules/ui/file-tree.js';
import initializeUiFileList from './modules/ui/file-list.js';
import initializeEditingSelection from './modules/editing/selection.js';
import initializeUiOutline from './modules/ui/outline.js';
import initializeUiQuickOpen from './modules/ui/quick-open.js';
import initializeEditingTableRowMove from './modules/editing/table-row-move.js';
import initializeEditingFormatting from './modules/editing/formatting.js';
import initializeEditingListIndent from './modules/editing/list-indent.js';
import initializeEditingCharacterPairs from './modules/editing/character-pairs.js';
import initializeEditingDeletion from './modules/editing/deletion.js';
import initializeEditingClipboard from './modules/editing/clipboard.js';
import initializeEditingUserOperations from './modules/editing/user-operations.js';
import installLibrariesIntersectionObserver from './modules/libraries/intersection-observer.js';
import initializeHostEnvironment from './modules/host/environment.js';
import initializeUiDocumentMenu from './modules/ui/document-menu.js';
import initializeEditingTableEditor from './modules/editing/table-editor.js';
import initializeDocumentRecovery from './modules/document/recovery.js';
import initializeMediaAssetStorage from './modules/media/asset-storage.js';
import initializeRenderInlineDecoration from './modules/render/inline-decoration.js';
import initializeEditingEmoji from './modules/editing/emoji.js';
import installLibrariesRangy from './modules/libraries/rangy.js';
import initializeEditingSmartQuotes from './modules/editing/smart-quotes.js';
import initializeModelMarkdownParser from './modules/model/markdown-parser.js';
import installLibrariesDomPurifyRuntime from './modules/libraries/dom-purify-runtime.js';
import installLibrariesDomPurifyExport from './modules/libraries/dom-purify-export.js';
import installLibrariesCodemirror from './modules/libraries/codemirror.js';
import initializeRenderMathBlocks from './modules/render/math-blocks.js';
import initializeRenderDiagrams from './modules/render/diagrams.js';
import initializeEditingUndoManager from './modules/editing/undo-manager.js';
import initializeRenderHtmlBlocks from './modules/render/html-blocks.js';
import initializeModelHtmlParser from './modules/model/html-parser.js';
import initializeMediaActions from './modules/media/actions.js';
import initializeModelDocumentModel from './modules/model/document-model.js';
import installLibrariesUnicodeNormalization from './modules/libraries/unicode-normalization.js';
import initializeSharedUtilities from './modules/shared/utilities.js';
import initializeUiDialogs from './modules/ui/dialogs.js';
import initializeHostFileIntegration from './modules/host/file-integration.js';
import initializeEditingKeyboardShortcuts from './modules/editing/keyboard-shortcuts.js';
import initializeUiFileSearchResults from './modules/ui/file-search-results.js';
import installLibrariesJquery from './modules/libraries/jquery.js';
import initializeUiSidebar from './modules/ui/sidebar.js';
import initializeEditorController from './modules/editor-controller.js';
import initializeStartup from './modules/startup.js';

const hostGlobal =
  typeof self !== 'undefined' ? self : typeof global !== 'undefined' ? global : globalThis;

createEngineLoader(hostGlobal)(['startup'], [], true, function installEngineModules(engineModules) {
  const environment = {
    nativeRequire: hostGlobal.require,
    commonJsExports: hostGlobal.exports,
    commonJsModule: hostGlobal.module,
    errorReporterFactory: undefined,
    sanitizerFactory: undefined,
  };
  installSharedGlobalHelpers.call(hostGlobal, engineModules, environment);
  installLibrariesFastdom.call(hostGlobal, engineModules, environment);
  installLibrariesFastdomPromised.call(hostGlobal, engineModules, environment);
  engineModules.define('ui/localization', ['libraries/jquery'], true, initializeUiLocalization);
  installLibrariesBootstrapWidgets.call(hostGlobal, engineModules, environment);
  engineModules.define(
    'host/clipboard-bridge',
    ['shared/utilities'],
    true,
    initializeHostClipboardBridge,
  );
  engineModules.define(
    'model/markdown-serializer',
    ['model/document-model', 'shared/utilities'],
    true,
    initializeModelMarkdownSerializer,
  );
  engineModules.define(
    'model/html-renderer',
    [
      'model/document-model',
      'shared/utilities',
      'render/diagrams',
      'libraries/dom-purify-export',
      'render/html-blocks',
      'render/code-fences',
      'model/markdown-parser',
    ],
    true,
    initializeModelHtmlRenderer,
  );
  engineModules.define(
    'model/node-editing',
    [
      'model/document-model',
      'shared/utilities',
      'editing/undo-manager',
      'render/diagrams',
      'render/math-blocks',
      'libraries/rangy',
      'editing/smart-quotes',
    ],
    true,
    initializeModelNodeEditing,
  );
  engineModules.define(
    'codemirror/selection-markers',
    ['libraries/codemirror'],
    true,
    initializeCodemirrorSelectionMarkers,
  );
  engineModules.define(
    'codemirror/close-brackets',
    ['libraries/codemirror'],
    true,
    initializeCodemirrorCloseBrackets,
  );
  engineModules.define(
    'codemirror/close-tags',
    ['libraries/codemirror'],
    true,
    initializeCodemirrorCloseTags,
  );
  engineModules.define(
    'codemirror/overlay-mode',
    ['libraries/codemirror'],
    true,
    initializeCodemirrorOverlayMode,
  );
  engineModules.define('codemirror/lint', ['libraries/codemirror'], true, initializeCodemirrorLint);
  engineModules.define(
    'codemirror/editor-extensions',
    [
      'libraries/codemirror',
      'codemirror/selection-markers',
      'codemirror/close-brackets',
      'codemirror/close-tags',
      'codemirror/overlay-mode',
      'codemirror/lint',
    ],
    true,
    initializeCodemirrorEditorExtensions,
  );
  engineModules.define(
    'render/code-fences',
    [
      'libraries/codemirror',
      'shared/utilities',
      'libraries/jquery',
      'editing/autocomplete',
      'model/document-model',
      'editing/keyboard-shortcuts',
      'editing/undo-manager',
      'render/diagrams',
      'render/math-blocks',
      'codemirror/editor-extensions',
    ],
    true,
    initializeRenderCodeFences,
  );
  engineModules.define(
    'render/inline-math',
    [
      'libraries/jquery',
      'model/document-model',
      'editing/undo-manager',
      'editing/keyboard-shortcuts',
      'ui/dialogs',
      'media/actions',
      'shared/utilities',
      'libraries/rangy',
    ],
    true,
    initializeRenderInlineMath,
  );
  engineModules.define(
    'render/brush-queue',
    [
      'host/environment',
      'shared/utilities',
      'model/markdown-parser',
      'model/document-model',
      'editing/formatting',
      'editing/undo-manager',
      'media/actions',
      'libraries/rangy',
    ],
    true,
    initializeRenderBrushQueue,
  );
  engineModules.define(
    'editing/autocomplete',
    [
      'libraries/codemirror',
      'shared/utilities',
      'libraries/jquery',
      'editing/undo-manager',
      'ui/dialogs',
      'libraries/rangy',
    ],
    true,
    initializeEditingAutocomplete,
  );
  engineModules.define('media/image-scale', ['shared/utilities'], true, initializeMediaImageScale);
  engineModules.define(
    'media/image-editor',
    [
      'libraries/jquery',
      'model/document-model',
      'editing/user-operations',
      'render/inline-decoration',
      'editing/selection',
      'editing/undo-manager',
      'ui/dialogs',
      'shared/utilities',
      'host/file-integration',
      'media/image-scale',
      'media/asset-storage',
      'media/actions',
      'document/recovery',
      'render/html-blocks',
    ],
    true,
    initializeMediaImageEditor,
  );
  engineModules.define(
    'document/options',
    [
      'libraries/jquery',
      'shared/utilities',
      'editing/undo-manager',
      'host/environment',
      'ui/dialogs',
      'host/file-integration',
      'ui/document-menu',
      'host/local-diagnostics',
      'document/recovery',
    ],
    true,
    initializeDocumentOptions,
  );
  engineModules.define(
    'document/file-snapshot',
    [
      'libraries/jquery',
      'shared/utilities',
      'host/environment',
      'ui/dialogs',
      'host/file-integration',
      'media/asset-storage',
      'document/text-bundle',
      'document/recovery',
      'document/file-writer',
      'host/local-diagnostics',
    ],
    true,
    initializeDocumentFileSnapshot,
  );
  engineModules.define(
    'document/text-bundle',
    ['media/asset-storage', 'shared/utilities', 'document/recovery'],
    true,
    initializeDocumentTextBundle,
  );
  engineModules.define('document/file-writer', [], true, initializeDocumentFileWriter);
  installLibrariesErrorReporterRuntime.call(hostGlobal, engineModules, environment);
  installLibrariesErrorReporterExport.call(hostGlobal, engineModules, environment);
  engineModules.define('host/local-diagnostics', [], true, initializeHostLocalDiagnostics);
  engineModules.define(
    'document/file-controller',
    [
      'libraries/jquery',
      'shared/utilities',
      'editing/undo-manager',
      'model/document-model',
      'host/environment',
      'ui/dialogs',
      'host/file-integration',
      'document/options',
      'document/editing-state',
      'document/file-snapshot',
      'media/asset-storage',
      'document/text-bundle',
      'ui/document-menu',
      'document/recovery',
      'model/html-parser',
      'document/file-writer',
      'host/local-diagnostics',
    ],
    true,
    initializeDocumentFileController,
  );
  engineModules.define(
    'document/editing-state',
    [
      'libraries/jquery',
      'shared/utilities',
      'editing/undo-manager',
      'model/document-model',
      'host/environment',
      'ui/dialogs',
      'editing/user-operations',
      'media/actions',
      'model/html-parser',
    ],
    true,
    initializeDocumentEditingState,
  );
  engineModules.define(
    'ui/find-replace',
    [
      'shared/utilities',
      'libraries/rangy',
      'editing/keyboard-shortcuts',
      'libraries/codemirror',
      'model/markdown-parser',
      'model/document-model',
      'render/inline-decoration',
      'ui/dialogs',
    ],
    true,
    initializeUiFindReplace,
  );
  engineModules.define(
    'ui/word-count',
    ['shared/utilities', 'libraries/jquery', 'model/document-model'],
    true,
    initializeUiWordCount,
  );
  engineModules.define('ui/page-breaks', [], true, initializeUiPageBreaks);
  engineModules.define(
    'export/html',
    [
      'model/document-model',
      'shared/utilities',
      'render/math-blocks',
      'render/diagrams',
      'model/markdown-parser',
      'render/html-blocks',
      'host/file-integration',
      'media/actions',
      'ui/dialogs',
    ],
    true,
    initializeExportHtml,
  );
  engineModules.define(
    'export/print-and-images',
    ['ui/dialogs', 'shared/utilities', 'host/file-integration'],
    true,
    initializeExportPrintAndImages,
  );
  engineModules.define(
    'export/pandoc',
    ['shared/utilities', 'ui/dialogs', 'host/file-integration', 'document/recovery'],
    true,
    initializeExportPandoc,
  );
  engineModules.define(
    'export/controller',
    [
      'model/document-model',
      'shared/utilities',
      'model/markdown-parser',
      'render/inline-decoration',
      'export/html',
      'ui/dialogs',
      'render/html-blocks',
      'render/diagrams',
      'render/math-blocks',
      'host/file-integration',
      'media/actions',
      'libraries/jquery',
      'export/print-and-images',
      'export/pandoc',
      'host/environment',
    ],
    true,
    initializeExportController,
  );
  engineModules.define(
    'codemirror/active-line',
    ['libraries/codemirror'],
    true,
    initializeCodemirrorActiveLine,
  );
  engineModules.define(
    'codemirror/markdown-overlay',
    ['libraries/codemirror'],
    true,
    initializeCodemirrorMarkdownOverlay,
  );
  engineModules.define(
    'editing/source-mode',
    [
      'libraries/codemirror',
      'codemirror/active-line',
      'codemirror/markdown-overlay',
      'libraries/jquery',
      'model/document-model',
      'shared/utilities',
      'model/markdown-parser',
      'editing/undo-manager',
    ],
    true,
    initializeEditingSourceMode,
  );
  engineModules.define(
    'document/project-settings',
    ['host/file-integration', 'shared/utilities'],
    true,
    initializeDocumentProjectSettings,
  );
  engineModules.define(
    'ui/folder-search',
    ['libraries/jquery', 'shared/utilities', 'editing/keyboard-shortcuts', 'host/file-integration'],
    true,
    initializeUiFolderSearch,
  );
  engineModules.define(
    'ui/context-menu',
    [
      'editing/keyboard-shortcuts',
      'model/document-model',
      'editing/formatting',
      'editing/user-operations',
      'media/actions',
      'shared/utilities',
      'editing/undo-manager',
    ],
    true,
    initializeUiContextMenu,
  );
  engineModules.define('host/spellchecker', [], true, initializeHostSpellchecker);
  engineModules.define(
    'ui/spelling',
    [
      'host/environment',
      'libraries/jquery',
      'host/file-integration',
      'editing/keyboard-shortcuts',
      'host/spellchecker',
    ],
    true,
    initializeUiSpelling,
  );
  installLibrariesDomMorph.call(hostGlobal, engineModules, environment);
  engineModules.define(
    'ui/file-tree',
    [
      'shared/utilities',
      'model/document-model',
      'host/file-integration',
      'document/recovery',
      'ui/dialogs',
      'libraries/jquery',
      'libraries/dom-morph',
    ],
    true,
    initializeUiFileTree,
  );
  engineModules.define(
    'ui/file-list',
    [
      'shared/utilities',
      'model/document-model',
      'host/file-integration',
      'document/recovery',
      'editing/keyboard-shortcuts',
      'ui/dialogs',
      'media/actions',
      'libraries/jquery',
    ],
    true,
    initializeUiFileList,
  );
  engineModules.define(
    'editing/selection',
    [
      'shared/utilities',
      'libraries/jquery',
      'libraries/rangy',
      'libraries/codemirror',
      'model/document-model',
      'editing/keyboard-shortcuts',
    ],
    true,
    initializeEditingSelection,
  );
  engineModules.define(
    'ui/outline',
    [
      'shared/utilities',
      'model/document-model',
      'libraries/jquery',
      'model/markdown-parser',
      'editing/selection',
      'host/file-integration',
      'editing/undo-manager',
      'document/recovery',
      'render/inline-decoration',
    ],
    true,
    initializeUiOutline,
  );
  engineModules.define(
    'ui/quick-open',
    [
      'shared/utilities',
      'libraries/jquery',
      'libraries/rangy',
      'editing/keyboard-shortcuts',
      'ui/dialogs',
      'model/document-model',
      'ui/outline',
    ],
    true,
    initializeUiQuickOpen,
  );
  engineModules.define(
    'editing/table-row-move',
    [
      'libraries/jquery',
      'model/document-model',
      'editing/undo-manager',
      'host/environment',
      'ui/document-menu',
      'editing/keyboard-shortcuts',
    ],
    true,
    initializeEditingTableRowMove,
  );
  engineModules.define(
    'editing/formatting',
    [
      'host/environment',
      'shared/utilities',
      'model/document-model',
      'editing/undo-manager',
      'libraries/rangy',
      'model/markdown-parser',
      'ui/document-menu',
    ],
    true,
    initializeEditingFormatting,
  );
  engineModules.define(
    'editing/list-indent',
    ['shared/utilities', 'model/document-model', 'editing/undo-manager', 'libraries/rangy'],
    true,
    initializeEditingListIndent,
  );
  engineModules.define(
    'editing/character-pairs',
    [
      'shared/utilities',
      'model/document-model',
      'editing/undo-manager',
      'libraries/rangy',
      'editing/smart-quotes',
    ],
    true,
    initializeEditingCharacterPairs,
  );
  engineModules.define(
    'editing/deletion',
    [
      'shared/utilities',
      'model/document-model',
      'editing/undo-manager',
      'editing/table-editor',
      'editing/formatting',
      'editing/list-indent',
      'editing/character-pairs',
    ],
    true,
    initializeEditingDeletion,
  );
  engineModules.define(
    'editing/clipboard',
    [
      'shared/utilities',
      'model/document-model',
      'editing/undo-manager',
      'libraries/rangy',
      'model/markdown-parser',
      'editing/table-editor',
      'model/html-parser',
      'editing/formatting',
      'editing/emoji',
      'render/html-blocks',
      'host/file-integration',
      'editing/deletion',
      'media/actions',
    ],
    true,
    initializeEditingClipboard,
  );
  engineModules.define(
    'editing/user-operations',
    [
      'shared/utilities',
      'model/document-model',
      'editing/undo-manager',
      'libraries/rangy',
      'model/markdown-parser',
      'editing/table-editor',
      'host/file-integration',
      'model/html-parser',
      'editing/deletion',
      'editing/list-indent',
      'editing/character-pairs',
      'editing/smart-quotes',
      'editing/table-row-move',
      'editing/clipboard',
    ],
    true,
    initializeEditingUserOperations,
  );
  installLibrariesIntersectionObserver.call(hostGlobal, engineModules, environment);
  engineModules.define(
    'host/environment',
    ['libraries/jquery', 'libraries/intersection-observer'],
    true,
    initializeHostEnvironment,
  );
  engineModules.define(
    'ui/document-menu',
    ['editing/undo-manager', 'model/document-model', 'host/environment'],
    true,
    initializeUiDocumentMenu,
  );
  engineModules.define(
    'editing/table-editor',
    [
      'libraries/jquery',
      'model/document-model',
      'editing/undo-manager',
      'host/environment',
      'ui/document-menu',
      'editing/keyboard-shortcuts',
    ],
    true,
    initializeEditingTableEditor,
  );
  engineModules.define(
    'document/recovery',
    ['shared/utilities', 'host/file-integration', 'ui/dialogs'],
    true,
    initializeDocumentRecovery,
  );
  engineModules.define(
    'media/asset-storage',
    ['shared/utilities', 'host/file-integration', 'document/recovery'],
    true,
    initializeMediaAssetStorage,
  );
  engineModules.define(
    'render/inline-decoration',
    [
      'shared/utilities',
      'model/document-model',
      'ui/dialogs',
      'host/file-integration',
      'media/asset-storage',
      'libraries/dom-purify-export',
      'render/html-blocks',
      'media/actions',
    ],
    true,
    initializeRenderInlineDecoration,
  );
  engineModules.define('editing/emoji', ['libraries/jquery'], true, initializeEditingEmoji);
  installLibrariesRangy.call(hostGlobal, engineModules, environment);
  engineModules.define(
    'editing/smart-quotes',
    ['shared/utilities', 'model/document-model', 'editing/undo-manager', 'libraries/rangy'],
    true,
    initializeEditingSmartQuotes,
  );
  engineModules.define(
    'model/markdown-parser',
    [
      'shared/utilities',
      'model/document-model',
      'render/inline-decoration',
      'editing/undo-manager',
      'editing/emoji',
      'render/html-blocks',
      'editing/smart-quotes',
    ],
    true,
    initializeModelMarkdownParser,
  );
  installLibrariesDomPurifyRuntime.call(hostGlobal, engineModules, environment);
  installLibrariesDomPurifyExport.call(hostGlobal, engineModules, environment);
  installLibrariesCodemirror.call(hostGlobal, engineModules, environment);
  engineModules.define(
    'render/math-blocks',
    [
      'libraries/codemirror',
      'libraries/jquery',
      'model/document-model',
      'editing/undo-manager',
      'shared/utilities',
      'media/actions',
      'editing/keyboard-shortcuts',
    ],
    true,
    initializeRenderMathBlocks,
  );
  engineModules.define(
    'render/diagrams',
    [
      'libraries/codemirror',
      'shared/utilities',
      'libraries/jquery',
      'model/document-model',
      'render/math-blocks',
    ],
    true,
    initializeRenderDiagrams,
  );
  engineModules.define(
    'editing/undo-manager',
    ['shared/utilities', 'model/document-model'],
    true,
    initializeEditingUndoManager,
  );
  engineModules.define(
    'render/html-blocks',
    [
      'libraries/codemirror',
      'shared/utilities',
      'libraries/jquery',
      'libraries/dom-purify-export',
      'model/document-model',
      'editing/keyboard-shortcuts',
      'render/diagrams',
      'editing/undo-manager',
    ],
    true,
    initializeRenderHtmlBlocks,
  );
  engineModules.define(
    'model/html-parser',
    [
      'shared/utilities',
      'model/document-model',
      'editing/table-editor',
      'model/markdown-parser',
      'render/html-blocks',
      'libraries/jquery',
    ],
    true,
    initializeModelHtmlParser,
  );
  engineModules.define(
    'media/actions',
    [
      'libraries/jquery',
      'model/document-model',
      'shared/utilities',
      'media/asset-storage',
      'document/recovery',
      'editing/user-operations',
      'model/html-parser',
      'editing/keyboard-shortcuts',
    ],
    true,
    initializeMediaActions,
  );
  engineModules.define(
    'model/document-model',
    ['shared/utilities'],
    true,
    initializeModelDocumentModel,
  );
  installLibrariesUnicodeNormalization.call(hostGlobal, engineModules, environment);
  engineModules.define(
    'shared/utilities',
    ['libraries/unicode-normalization'],
    true,
    initializeSharedUtilities,
  );
  engineModules.define(
    'ui/dialogs',
    ['libraries/jquery', 'model/document-model', 'shared/utilities'],
    true,
    initializeUiDialogs,
  );
  engineModules.define(
    'host/file-integration',
    ['shared/utilities', 'media/asset-storage', 'media/actions', 'ui/dialogs'],
    true,
    initializeHostFileIntegration,
  );
  engineModules.define('editing/keyboard-shortcuts', [], true, initializeEditingKeyboardShortcuts);
  engineModules.define(
    'ui/file-search-results',
    ['shared/utilities', 'libraries/jquery', 'host/file-integration', 'editing/keyboard-shortcuts'],
    true,
    initializeUiFileSearchResults,
  );
  installLibrariesJquery.call(hostGlobal, engineModules, environment);
  engineModules.define(
    'ui/sidebar',
    [
      'shared/utilities',
      'model/document-model',
      'ui/dialogs',
      'host/file-integration',
      'document/recovery',
      'media/asset-storage',
      'editing/keyboard-shortcuts',
      'ui/file-tree',
      'ui/file-list',
      'ui/quick-open',
      'ui/file-search-results',
      'libraries/jquery',
    ],
    true,
    initializeUiSidebar,
  );
  engineModules.define(
    'editor-controller',
    [
      'host/environment',
      'libraries/jquery',
      'shared/utilities',
      'model/document-model',
      'model/markdown-parser',
      'model/markdown-serializer',
      'model/html-renderer',
      'model/node-editing',
      'render/code-fences',
      'render/math-blocks',
      'render/inline-math',
      'render/brush-queue',
      'editing/autocomplete',
      'editing/selection',
      'ui/dialogs',
      'render/html-blocks',
      'editing/table-editor',
      'media/image-editor',
      'editing/undo-manager',
      'editing/keyboard-shortcuts',
      'editing/user-operations',
      'media/actions',
      'document/recovery',
      'document/file-controller',
      'document/editing-state',
      'ui/outline',
      'editing/formatting',
      'ui/find-replace',
      'editing/emoji',
      'ui/word-count',
      'ui/page-breaks',
      'export/controller',
      'editing/source-mode',
      'host/file-integration',
      'document/project-settings',
      'ui/folder-search',
      'ui/context-menu',
      'ui/spelling',
      'ui/sidebar',
    ],
    true,
    initializeEditorController,
  );
  engineModules.define(
    'startup',
    [
      'libraries/jquery',
      'libraries/fastdom',
      'libraries/fastdom-promised',
      'ui/localization',
      'libraries/bootstrap-widgets',
      'host/clipboard-bridge',
      'document/file-controller',
      'editor-controller',
    ],
    true,
    initializeStartup,
  );
})(function publishEngine(initialize) {
  if (typeof define === 'function' && define.amd) {
    define([], initialize);
  } else if (typeof module === 'object' && module.exports && typeof require === 'function') {
    module.exports = initialize();
  } else {
    initialize();
  }
});
