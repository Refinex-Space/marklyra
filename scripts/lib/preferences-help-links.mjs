function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) for (const child of value) walk(child, visit);
    else if (value && typeof value === 'object') walk(value, visit);
  }
}

const isLearnMore = (node) =>
  node?.type === 'CallExpression' && node.arguments[0]?.value === 'Learn More…';

/** Omit only the default help-link label; descriptive hints and other links survive. */
export function preferenceHelpLinkEdits(source, ast) {
  const edits = [];
  let fallbackLinks = 0;
  let warningLinks = 0;
  walk(ast, (node) => {
    if (node.type !== 'CallExpression' || node.callee?.property?.name !== 'createElement') return;
    const [component, props, child] = node.arguments;
    if (component?.name === 'C' && props?.type === 'ObjectExpression') {
      const text = props.properties.find((property) => property.key?.name === 'text')?.value;
      if (text?.type !== 'LogicalExpression' || text.operator !== '||' || !isLearnMore(text.right))
        return;
      const description = source.slice(text.left.start, text.left.end);
      const original = source.slice(node.start, node.end);
      const render =
        original.slice(0, text.start - node.start) +
        description +
        original.slice(text.end - node.start);
      edits.push({ start: node.start, end: node.end, text: `(${description}?${render}:null)` });
      fallbackLinks++;
    } else if (component?.value === 'a' && node.arguments.length === 3 && isLearnMore(child)) {
      edits.push({ start: node.start, end: node.end, text: 'null' });
      warningLinks++;
    }
  });
  if (fallbackLinks !== 2 || warningLinks !== 1)
    throw new Error('Unexpected original Preferences help-link structure');
  return edits;
}
