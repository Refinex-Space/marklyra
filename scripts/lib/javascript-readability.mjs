import { parse } from 'acorn';

/** Expand discarded control flow without reprinting unaffected expressions.
 * Script completion is observable through eval; only function-body completions
 * are discarded unless the caller explicitly identifies a factory fragment.
 */
export function readableJavaScript(text, { module = false, discardScriptCompletion = false } = {}) {
  const comments = [];
  const options = {
    ecmaVersion: 'latest',
    sourceType: module ? 'module' : 'script',
    preserveParens: true,
  };
  const source = parse(text, { ...options, onComment: comments });
  const isFunction = (node) =>
    ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type);
  function unwrapped(node) {
    while (node.type === 'ParenthesizedExpression') node = node.expression;
    return node;
  }

  function children(node) {
    const found = [];
    for (const value of Object.values(node)) {
      for (const child of Array.isArray(value) ? value : [value]) {
        if (child && typeof child.type === 'string') found.push(child);
      }
    }
    return found.sort((left, right) => left.start - right.start || right.end - left.end);
  }

  function checkDeclarations(node, parent) {
    if (
      node.type === 'FunctionDeclaration' &&
      parent &&
      ![
        'Program',
        'BlockStatement',
        'SwitchCase',
        'ExportDefaultDeclaration',
        'ExportNamedDeclaration',
      ].includes(parent.type)
    )
      throw new Error('Cannot normalize an Annex B function declaration outside a statement list');
    for (const child of children(node)) checkDeclarations(child, node);
  }
  checkDeclarations(source);

  function commentsBetween(start, end) {
    return comments
      .filter((comment) => comment.start >= start && comment.end <= end)
      .map((comment) => `${text.slice(comment.start, comment.end)}\n`)
      .join('');
  }

  function original(node, depth, replacements = new Map()) {
    let cursor = node.start;
    let result = '';
    for (const child of children(node)) {
      // Shorthand properties expose their key and value at the same source span.
      if (child.start < cursor) continue;
      result += text.slice(cursor, child.start);
      result += replacements.has(child) ? replacements.get(child) : render(child, depth);
      cursor = child.end;
    }
    return result + text.slice(cursor, node.end);
  }

  function discarded(expression, depth) {
    if (expression.type === 'ParenthesizedExpression') {
      if (
        !['SequenceExpression', 'LogicalExpression', 'ConditionalExpression'].includes(
          unwrapped(expression).type,
        )
      )
        return `${render(expression, depth)};`;
      return (
        commentsBetween(expression.start, expression.expression.start) +
        discarded(expression.expression, depth) +
        commentsBetween(expression.expression.end, expression.end)
      );
    }
    if (expression.type === 'SequenceExpression') {
      let result = '';
      for (let index = 0; index < expression.expressions.length; index++) {
        const part = expression.expressions[index];
        if (index)
          result += '\n' + commentsBetween(expression.expressions[index - 1].end, part.start);
        result += discarded(part, depth);
      }
      return result;
    }
    if (expression.type === 'LogicalExpression' && ['&&', '||'].includes(expression.operator)) {
      const condition = render(expression.left, depth);
      const guard = expression.operator === '&&' ? condition : `!(${condition})`;
      return `if (${guard}) {\n${commentsBetween(expression.left.end, expression.right.start)}${discarded(expression.right, depth)}\n}`;
    }
    if (expression.type === 'ConditionalExpression') {
      return `if (${render(expression.test, depth)}) {\n${commentsBetween(expression.test.end, expression.consequent.start)}${discarded(expression.consequent, depth)}} else {\n${commentsBetween(expression.consequent.end, expression.alternate.start)}${discarded(expression.alternate, depth)}\n}`;
    }
    const value = render(expression, depth);
    // A string split out of a sequence must never introduce a directive. Bare
    // object/function/class expressions must remain expression statements.
    const parenthesize =
      (expression.type === 'Literal' && typeof expression.value === 'string') ||
      ['ObjectExpression', 'FunctionExpression', 'ClassExpression'].includes(expression.type) ||
      /^(?:function\b|async\s+function\b|class\b|let\s*\[|\{)/.test(value.trimStart());
    return `${parenthesize ? `(${value})` : value};`;
  }

  function withLast(expression, depth, terminal) {
    if (expression.type === 'ParenthesizedExpression') {
      if (!['SequenceExpression', 'ConditionalExpression'].includes(unwrapped(expression).type))
        return terminal(expression);
      return (
        commentsBetween(expression.start, expression.expression.start) +
        withLast(expression.expression, depth, terminal) +
        commentsBetween(expression.expression.end, expression.end)
      );
    }
    if (expression.type === 'SequenceExpression') {
      let result = '';
      const parts = expression.expressions;
      for (let index = 0; index < parts.length; index++) {
        const part = parts[index];
        if (index) result += '\n' + commentsBetween(parts[index - 1].end, part.start);
        result +=
          index === parts.length - 1 ? withLast(part, depth, terminal) : discarded(part, depth);
      }
      return result;
    }
    return terminal(expression);
  }

  function returned(expression, depth) {
    return withLast(expression, depth, (value) => {
      if (value.type === 'ConditionalExpression') {
        return `if (${render(value.test, depth)}) {\n${commentsBetween(value.test.end, value.consequent.start)}${returned(value.consequent, depth)}} else {\n${commentsBetween(value.consequent.end, value.alternate.start)}${returned(value.alternate, depth)}\n}`;
      }
      return `return ${render(value, depth)};`;
    });
  }

  function body(statement, depth) {
    const value = render(statement, depth);
    return statement.type === 'BlockStatement' ? value : `{\n${value}\n}`;
  }

  function render(node, depth = 0) {
    if (isFunction(node)) return original(node, depth + 1);
    if (node.type === 'UnaryExpression' && node.operator === '!') {
      const operand = unwrapped(node.argument);
      if (operand.type === 'Literal' && typeof operand.value === 'number') {
        const retained = commentsBetween(node.start, node.end);
        const value = operand.value === 0 ? 'true' : 'false';
        return retained ? `(${retained}${value})` : value;
      }
    }
    if (!depth && !discardScriptCompletion) return original(node, depth);
    if (node.type === 'ExpressionStatement' && !node.directive) {
      return (
        commentsBetween(node.start, node.expression.start) +
        discarded(node.expression, depth) +
        commentsBetween(node.expression.end, node.end)
      );
    }
    if (node.type === 'ReturnStatement' && node.argument) {
      return (
        commentsBetween(node.start, node.argument.start) +
        returned(node.argument, depth) +
        commentsBetween(node.argument.end, node.end)
      );
    }
    if (node.type === 'ThrowStatement') {
      return (
        commentsBetween(node.start, node.argument.start) +
        withLast(node.argument, depth, (value) => `throw ${render(value, depth)};`) +
        commentsBetween(node.argument.end, node.end)
      );
    }
    if (node.type === 'IfStatement') {
      return withLast(node.test, depth, (condition) => {
        const replacements = new Map([
          [node.test, render(condition, depth)],
          [node.consequent, body(node.consequent, depth)],
        ]);
        if (node.alternate) replacements.set(node.alternate, body(node.alternate, depth));
        return original(node, depth, replacements);
      });
    }
    if (
      [
        'WhileStatement',
        'DoWhileStatement',
        'ForStatement',
        'ForInStatement',
        'ForOfStatement',
        'WithStatement',
      ].includes(node.type)
    ) {
      return original(node, depth, new Map([[node.body, body(node.body, depth)]]));
    }
    // A labelled expression/if can expand to several statements, while a label
    // on a loop must remain attached to that loop for labelled continue.
    if (
      node.type === 'LabeledStatement' &&
      ![
        'WhileStatement',
        'DoWhileStatement',
        'ForStatement',
        'ForInStatement',
        'ForOfStatement',
        'LabeledStatement',
        'BlockStatement',
      ].includes(node.body.type)
    ) {
      return original(node, depth, new Map([[node.body, body(node.body, depth)]]));
    }
    return original(node, depth);
  }

  const result = render(source);
  parse(result, options);
  return result;
}
