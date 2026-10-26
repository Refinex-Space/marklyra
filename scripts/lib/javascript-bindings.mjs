import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'acorn';
import ts from 'typescript';

const compilerOptions = {
  allowJs: true,
  checkJs: false,
  noLib: true,
  noResolve: true,
  target: ts.ScriptTarget.ESNext,
};

/** Build lexical symbols without loading dependencies or executing the input. */
export function analyze(file, text = fs.readFileSync(file, 'utf8')) {
  let sourceType = 'script';
  try {
    parse(text, { ecmaVersion: 'latest', sourceType });
  } catch (scriptError) {
    // Maintained engine factories are ES module source; classic vendor adapters
    // retain script parsing (including their original strict/sloppy boundary).
    try {
      parse(text, { ecmaVersion: 'latest', sourceType: 'module' });
      sourceType = 'module';
    } catch {
      throw scriptError;
    }
  }
  const filename = path.resolve(file);
  const source = ts.createSourceFile(
    filename,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const compilerHost = ts.createCompilerHost(compilerOptions);
  compilerHost.getSourceFile = (requestedFile) =>
    path.resolve(requestedFile) === filename ? source : undefined;
  const program = ts.createProgram([filename], compilerOptions, compilerHost);
  const checker = program.getTypeChecker();
  const bindings = [];
  const bySymbol = new Map();
  const nodes = [];
  const identifiers = [];
  const evalCalls = [];
  const withStatements = [];
  function visit(node) {
    nodes.push(node);
    if (ts.isIdentifier(node)) identifiers.push(node);
    if (ts.isWithStatement(node)) withStatements.push(node);
    if (ts.isCallExpression(node)) {
      let callee = node.expression;
      while (ts.isParenthesizedExpression(callee)) callee = callee.expression;
      if (ts.isIdentifier(callee) && callee.text === 'eval') evalCalls.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  function isBindingDeclaration(identifier) {
    const parent = identifier.parent;
    return (
      parent.name === identifier &&
      (ts.isVariableDeclaration(parent) ||
        ts.isParameter(parent) ||
        ts.isBindingElement(parent) ||
        ts.isFunctionDeclaration(parent) ||
        ts.isFunctionExpression(parent) ||
        ts.isClassDeclaration(parent) ||
        ts.isClassExpression(parent))
    );
  }
  for (const identifier of identifiers) {
    if (!isBindingDeclaration(identifier)) continue;
    const symbol = checker.getSymbolAtLocation(identifier);
    if (!symbol) throw new Error(`Unresolved declaration ${file}:${identifier.getStart()}`);
    let binding = bySymbol.get(symbol);
    if (!binding) {
      binding = {
        id: bindings.length,
        oldName: identifier.text,
        nameNode: identifier,
        decl: identifier.parent,
        symbol,
        occurrences: [],
        declarations: [],
        line: source.getLineAndCharacterOfPosition(identifier.getStart()).line + 1,
      };
      bindings.push(binding);
      bySymbol.set(symbol, binding);
    }
    binding.declarations.push(identifier);
  }
  function referenceSymbol(identifier) {
    const parent = identifier.parent;
    if (ts.isPropertyAccessExpression(parent) && parent.name === identifier) return;
    if (
      (ts.isPropertyAssignment(parent) ||
        ts.isMethodDeclaration(parent) ||
        ts.isGetAccessorDeclaration(parent) ||
        ts.isSetAccessorDeclaration(parent)) &&
      parent.name === identifier
    )
      return;
    if (ts.isBindingElement(parent) && parent.propertyName === identifier) return;
    if (
      ts.isLabeledStatement(parent) ||
      ts.isBreakStatement(parent) ||
      ts.isContinueStatement(parent)
    )
      return;
    if (ts.isShorthandPropertyAssignment(parent) && parent.name === identifier)
      return checker.getShorthandAssignmentValueSymbol(parent);
    return checker.getSymbolAtLocation(identifier);
  }
  for (const identifier of identifiers) {
    const binding = bySymbol.get(referenceSymbol(identifier));
    if (binding) binding.occurrences.push(identifier);
  }
  function parentFunction(node) {
    for (let parent = node.parent; parent; parent = parent.parent)
      if (ts.isFunctionLike(parent)) return parent;
    return source;
  }
  function isAnonymousFunction(expression) {
    while (expression && ts.isParenthesizedExpression(expression))
      expression = expression.expression;
    return Boolean(
      expression &&
        (ts.isFunctionExpression(expression) ||
          ts.isArrowFunction(expression) ||
          ts.isClassExpression(expression)) &&
        !expression.name,
    );
  }
  for (const binding of bindings) {
    binding.scope = parentFunction(binding.nameNode);
    binding.directEval = evalCalls.some((call) => {
      for (let parent = call; parent; parent = parent.parent)
        if (parent === binding.scope) return true;
      return false;
    });
    binding.dynamicScope = withStatements.some((statement) => {
      for (let parent = statement; parent; parent = parent.parent)
        if (parent === binding.scope) return true;
      return false;
    });
    binding.named =
      ts.isFunctionDeclaration(binding.decl) ||
      ts.isFunctionExpression(binding.decl) ||
      ts.isClassDeclaration(binding.decl) ||
      ts.isClassExpression(binding.decl);
    binding.inferredName =
      isAnonymousFunction(binding.decl.initializer) ||
      binding.occurrences.some(
        (identifier) =>
          ts.isBinaryExpression(identifier.parent) &&
          identifier.parent.left === identifier &&
          isAnonymousFunction(identifier.parent.right),
      );
  }
  return {
    file,
    text,
    sourceType,
    source,
    checker,
    bindings,
    bySymbol,
    nodes,
    identifiers,
    referenceSymbol,
    parentFunction,
  };
}

export function context(analysis, binding) {
  const scope = binding.scope;
  const parent = scope.parent;
  if (scope.name) return scope.name.getText(analysis.source);
  if (parent && ts.isBinaryExpression(parent) && parent.right === scope)
    return parent.left.getText(analysis.source);
  if (parent && (ts.isPropertyAssignment(parent) || ts.isVariableDeclaration(parent)))
    return parent.name.getText(analysis.source);
  if (parent && ts.isCallExpression(parent))
    return `${parent.expression.getText(analysis.source)} callback`;
  return 'module/callback';
}

/** Normalize only lexical bindings. Property keys, free names, literals, operators
 * and statement order remain observable and are compared exactly. */
export function bindingStructure(analysis) {
  const references = new Map();
  for (const binding of analysis.bindings)
    for (const node of binding.occurrences)
      references.set(node.getStart(analysis.source), binding.id);
  function normalize(node, keyPosition = false) {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map((item) => normalize(item));
    if (node.type === 'Identifier')
      return {
        type: node.type,
        name:
          !keyPosition && references.has(node.start)
            ? `binding:${references.get(node.start)}`
            : node.name,
      };
    // The formatter may reassociate a chain of the same short-circuit operator.
    if (node.type === 'LogicalExpression') {
      const operands = [];
      const flatten = (child) => {
        if (child.type === node.type && child.operator === node.operator) {
          flatten(child.left);
          flatten(child.right);
        } else operands.push(normalize(child));
      };
      flatten(node);
      return { type: node.type, operator: node.operator, operands };
    }
    return Object.fromEntries(
      Object.entries(node)
        .filter(([key]) => !['start', 'end', 'raw'].includes(key))
        .map(([key, value]) => [
          key,
          key === 'shorthand' && node.type === 'Property'
            ? false
            : normalize(value, key === 'key' && !node.computed),
        ]),
    );
  }
  return normalize(
    parse(analysis.text, { ecmaVersion: 'latest', sourceType: analysis.sourceType }),
  );
}

/** Fail closed on capture, changed globals/keys/operations or observable names. */
export function verifyBindingRenames(file, before, after) {
  const original = analyze(file, before);
  const renamed = analyze(file, after);
  if (original.bindings.length !== renamed.bindings.length)
    throw new Error(`Binding count changed: ${file}`);
  for (const [index, binding] of original.bindings.entries()) {
    const current = renamed.bindings[index];
    if (
      (binding.directEval || binding.dynamicScope || binding.named || binding.inferredName) &&
      current.oldName !== binding.oldName
    )
      throw new Error(
        `Observable binding name changed: ${file}:${binding.line} ${binding.oldName}`,
      );
  }
  if (JSON.stringify(bindingStructure(original)) !== JSON.stringify(bindingStructure(renamed)))
    throw new Error(`Lexical binding or program structure changed: ${file}`);
  return original.bindings.filter(
    (binding, index) => binding.oldName !== renamed.bindings[index].oldName,
  ).length;
}
