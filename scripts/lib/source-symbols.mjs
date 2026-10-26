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
export function analyzeSource(file, text = fs.readFileSync(file, 'utf8')) {
  let sourceType = 'script';
  try {
    parse(text, { ecmaVersion: 'latest', sourceType });
  } catch (scriptError) {
    // Accept both ES modules and classic scripts without changing directive semantics.
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
  const identifiers = [];
  function visit(node) {
    if (ts.isIdentifier(node)) identifiers.push(node);
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
        name: identifier.text,
        decl: identifier.parent,
        occurrences: [],
      };
      bindings.push(binding);
      bySymbol.set(symbol, binding);
    }
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
  return {
    source,
    checker,
    bindings,
    bySymbol,
  };
}
