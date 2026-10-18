import {
  type ThemeAppearance,
  type ThemeAppearanceKey,
  themeAppearance,
} from '../styles/appearance.js';

const marker = 'data-marklyra-theme-probe';

/** Split selector lists without splitting commas inside functions, strings or attributes. */
function selectors(value: string): string[] {
  const result: string[] = [];
  let start = 0;
  let nesting = 0;
  let quote = '';
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (character === '\\') {
      index++;
      continue;
    }
    if (quote) {
      if (character === quote) quote = '';
    } else if (character === '"' || character === "'") quote = character;
    else if (character === '(' || character === '[') nesting++;
    else if (character === ')' || character === ']') nesting--;
    else if (character === ',' && nesting === 0) {
      result.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  result.push(value.slice(start).trim());
  return result;
}

/** Hover has no standard DOM forcing API. Mirror only the two display properties
 * onto an owned sample, preserving selector specificity and stylesheet order.
 * Layer/scope rules are deliberately not flattened into an inaccurate cascade. */
function hoverRules(element: HTMLElement): string {
  const rules: string[] = [];
  const scope = `:where([${marker}="${element.getAttribute(marker)}"])`;
  const visit = (list: CSSRuleList) => {
    for (const rule of Array.from(list)) {
      if (rule instanceof CSSStyleRule) {
        // A var() shorthand has no expanded background-color in CSSOM until
        // computed. A separately serialized longhand takes precedence over it.
        const declarations = ['background', 'background-color', 'color']
          .map((name) => {
            const value = rule.style.getPropertyValue(name);
            return value
              ? `${name}:${value}${rule.style.getPropertyPriority(name) ? '!important' : ''}`
              : '';
          })
          .filter(Boolean)
          .join(';');
        if (!declarations) continue;
        for (const selector of selectors(rule.selectorText)) {
          // :is(:root, *) is always true with the same specificity as :hover.
          const simulated = selector.replaceAll(':hover', ':is(:root, *)');
          try {
            if (element.matches(simulated)) rules.push(`${simulated}${scope}{${declarations}}`);
          } catch {
            // Unknown/unsupported selector syntax cannot grant access or alter the live view.
          }
        }
      } else if (rule instanceof CSSMediaRule) {
        if (matchMedia(rule.conditionText).matches) visit(rule.cssRules);
      } else if (rule instanceof CSSSupportsRule) {
        if (CSS.supports(rule.conditionText)) visit(rule.cssRules);
      } else if (rule instanceof CSSImportRule) {
        if (!rule.media.mediaText || matchMedia(rule.media.mediaText).matches) {
          try {
            if (rule.styleSheet) visit(rule.styleSheet.cssRules);
          } catch {
            // Cross-origin sheets are outside this same-origin presentation projection.
          }
        }
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    if (
      sheet.disabled ||
      (sheet.ownerNode instanceof Element && sheet.ownerNode.hasAttribute(marker))
    )
      continue;
    if (sheet.media.mediaText && !matchMedia(sheet.media.mediaText).matches) continue;
    try {
      visit(sheet.cssRules);
    } catch {
      // A failed stylesheet does not prevent projecting available loaded styles.
    }
  }
  return rules.join('\n');
}

/** Read the original, hidden UI's computed presentation without touching its
 * model, view state, selection or history. Every temporary node is synchronously
 * removed, and marked before insertion so host observers can ignore the probe. */
export function readThemeAppearance(): ThemeAppearance {
  const body = document.body;
  const sidebar = document.getElementById('typora-sidebar');
  if (!body || !sidebar) return {};
  const owned: HTMLElement[] = [];
  const sample = (parent: HTMLElement, className: string, name: string) => {
    const node = document.createElement('div');
    node.className = className;
    node.setAttribute(marker, name);
    node.setAttribute('aria-hidden', 'true');
    node.inert = true;
    node.style.position = 'absolute';
    node.style.left = '0';
    node.style.top = '0';
    node.style.width = '0';
    node.style.height = '0';
    node.style.overflow = 'hidden';
    node.style.visibility = 'hidden';
    node.style.pointerEvents = 'none';
    parent.append(node);
    owned.push(node);
    return node;
  };
  const child = (parent: HTMLElement, className: string) => {
    const node = document.createElement('div');
    node.className = className;
    parent.append(node);
    return node;
  };
  try {
    const list = document.getElementById('file-library-list-children') ?? sidebar;
    const idle = sample(list, 'file-list-item', 'article');
    const filename = child(idle, 'file-list-item-file-name');
    const summary = child(idle, 'file-list-item-summary');
    const meta = child(idle, 'file-list-item-parent-loc');
    const active = sample(list, 'file-list-item active', 'article-active');
    const activeName = child(active, 'file-list-item-file-name');
    const folder = sample(list, 'show-folder-name', 'article-folder');
    const folderItem = child(folder, 'file-list-item');
    const tree = sample(
      document.getElementById('file-library-tree') ?? sidebar,
      'file-library-node file-tree-node',
      'tree',
    );
    const treeBackground = child(tree, 'file-node-background');
    const treeIcon = child(tree, 'file-node-icon fa fa-file-text-o');
    const outline = sample(
      document.getElementById('outline-content') ?? sidebar,
      'outline-h1',
      'outline',
    );
    const outlineItem = child(outline, 'outline-item');
    outlineItem.setAttribute(marker, 'outline-hover');
    const footer = document.getElementById('ty-sidebar-footer');
    const footerItem = sample(footer ?? sidebar, 'sidebar-footer-item', 'footer-hover');
    const color = sample(sidebar, '', 'color');
    // The hidden original UI does not use the desktop Host's titlebar inset.
    // Measure its native CSS context on an owned, inert fragment instead of
    // changing body classes and the live editor's layout or input state.
    const nativeContext = sample(body, 'mac-seamless-mode pin-outline', 'native-sidebar-context');
    const nativeSidebar = sidebar.cloneNode(false) as HTMLElement;
    nativeSidebar.setAttribute(marker, 'native-sidebar');
    nativeSidebar.setAttribute('aria-hidden', 'true');
    nativeSidebar.inert = true;
    nativeContext.append(nativeSidebar);
    const hoverSheet = document.createElement('style');
    hoverSheet.setAttribute(marker, 'hover-style');
    hoverSheet.textContent = `${hoverRules(outlineItem)}\n${hoverRules(footerItem)}`;
    document.head.append(hoverSheet);
    owned.push(hoverSheet);

    const result: ThemeAppearance = {};
    const put = (name: ThemeAppearanceKey, value: string) => {
      if (value.trim()) result[name] = value.trim();
    };
    const project = (
      node: Element,
      fields: Partial<Record<ThemeAppearanceKey, keyof CSSStyleDeclaration>>,
    ) => {
      const style = getComputedStyle(node);
      for (const [key, property] of Object.entries(fields)) {
        const value: unknown = style[property as keyof CSSStyleDeclaration];
        if (typeof value === 'string') put(key as ThemeAppearanceKey, value);
      }
    };
    const variableColor = (variable: string, background = false) => {
      const property = background ? 'background-color' : 'color';
      color.style.setProperty(property, `var(${variable})`);
      return getComputedStyle(color).getPropertyValue(property);
    };
    project(body, { '--marklyra-body-bg': 'backgroundColor', '--marklyra-body-text': 'color' });
    project(sidebar, {
      '--marklyra-sidebar-font-family': 'fontFamily',
      '--marklyra-sidebar-font-size': 'fontSize',
      '--marklyra-sidebar-line-height': 'lineHeight',
      '--marklyra-sidebar-font-weight': 'fontWeight',
      '--marklyra-sidebar-text': 'color',
      '--marklyra-sidebar-bg': 'backgroundColor',
    });
    project(nativeSidebar, {
      '--marklyra-sidebar-border-right': 'borderRight',
      '--marklyra-sidebar-padding-top': 'paddingTop',
      '--marklyra-sidebar-top': 'top',
    });
    const header = sidebar.querySelector('.sidebar-osx-tab');
    const tabs = header?.querySelector('.sidebar-tabs');
    if (header && tabs) {
      // WebKit may retain stale computed borders in the display:none original
      // subtree after a theme swap. Fresh shallow nodes use the current cascade.
      const nativeHeader = header.cloneNode(false) as HTMLElement;
      const nativeTabs = tabs.cloneNode(false) as HTMLElement;
      nativeHeader.append(nativeTabs);
      nativeSidebar.append(nativeHeader);
      project(nativeTabs, { '--marklyra-sidebar-header-border': 'borderBottom' });
    }
    for (const [key, variable, background] of [
      ['--marklyra-control-text', '--control-text-color', false],
      ['--marklyra-control-hover-text', '--control-text-hover-color', false],
      ['--marklyra-sidebar-item-hover-bg', '--item-hover-bg-color', true],
      ['--marklyra-sidebar-item-hover-text', '--item-hover-text-color', false],
      ['--marklyra-active-file-bg', '--active-file-bg-color', true],
      ['--marklyra-active-file-text', '--active-file-text-color', false],
      ['--marklyra-active-file-border', '--active-file-border-color', false],
    ] as const)
      put(key, variableColor(variable, background));
    if (footer) project(footer, { '--marklyra-sidebar-border': 'borderTop' });
    project(footerItem, {
      '--marklyra-sidebar-footer-hover-bg': 'backgroundColor',
      '--marklyra-sidebar-footer-hover-text': 'color',
    });
    project(idle, {
      '--marklyra-article-text': 'color',
      '--marklyra-article-opacity': 'opacity',
      '--marklyra-article-bg': 'backgroundColor',
      '--marklyra-article-border-bottom': 'borderBottom',
      '--marklyra-article-padding-top': 'paddingTop',
      '--marklyra-article-padding-bottom': 'paddingBottom',
    });
    project(filename, {
      '--marklyra-article-font-weight': 'fontWeight',
      '--marklyra-article-line-height': 'lineHeight',
    });
    project(active, {
      '--marklyra-article-selected-text': 'color',
      '--marklyra-article-selected-opacity': 'opacity',
      '--marklyra-article-selected-bg': 'backgroundColor',
    });
    project(activeName, { '--marklyra-article-selected-font-weight': 'fontWeight' });
    project(folderItem, { '--marklyra-article-folder-padding-top': 'paddingTop' });
    project(summary, {
      '--marklyra-summary-font-family': 'fontFamily',
      '--marklyra-summary-font-size': 'fontSize',
      '--marklyra-summary-line-height': 'lineHeight',
      '--marklyra-summary-height': 'height',
      '--marklyra-summary-font-weight': 'fontWeight',
      '--marklyra-summary-opacity': 'opacity',
    });
    project(meta, {
      '--marklyra-article-meta-font-family': 'fontFamily',
      '--marklyra-article-meta-line-height': 'lineHeight',
    });
    project(treeBackground, { '--marklyra-tree-row-height': 'height' });
    project(treeIcon, { '--marklyra-tree-icon-line-height': 'lineHeight' });
    project(outlineItem, {
      '--marklyra-outline-font-size': 'fontSize',
      '--marklyra-outline-line-height': 'lineHeight',
      '--marklyra-outline-font-weight': 'fontWeight',
      '--marklyra-outline-hover-bg': 'backgroundColor',
      '--marklyra-outline-hover-text': 'color',
    });
    return themeAppearance(result);
  } finally {
    for (const node of owned.reverse()) node.remove();
  }
}
