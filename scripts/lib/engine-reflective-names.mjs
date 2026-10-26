import ts from 'typescript';
import { analyze, bindingStructure } from './javascript-bindings.mjs';

/** Keep descriptive names in maintained source without adding name-restoration
 * calls to editing hot paths. Only explicit, fixed name descriptors are lowered.
 * Lexical alpha-equivalence is checked after removing those exact descriptors;
 * unsafe name collisions retain the original source operation.
 */
export function compileReflectiveNames(text, file = 'engine.js') {
  if (!text.includes('defineProperty') || !/['"]name['"]/.test(text))
    return { code: text, eliminated: 0, retained: 0 };
  const analysis = analyze(file, text);
  const candidates = new Map();
  const unwrap = (node) => {
    while (node && ts.isParenthesizedExpression(node)) node = node.expression;
    return node;
  };
  const bindingOf = (identifier) =>
    analysis.bySymbol.get(analysis.checker.getSymbolAtLocation(identifier));
  const classObservesInitialization = (node) =>
    node.members.some(
      (member) =>
        (member.name && ts.isComputedPropertyName(member.name)) ||
        ts.isClassStaticBlockDeclaration(member) ||
        (member.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword) &&
          (member.initializer || member.name?.text === 'name')),
    );
  const hasGlobalBinding = (binding) => {
    // Named expressions have a private self binding, even in a global initializer.
    if (
      (ts.isFunctionExpression(binding.decl) || ts.isClassExpression(binding.decl)) &&
      binding.decl.name
    )
      return false;
    for (let parent = binding.decl.parent; parent; parent = parent.parent) {
      if (ts.isFunctionLike(parent)) return false;
      if (ts.isSourceFile(parent)) return true;
    }
    return true;
  };
  const isAnonymous = (value) => {
    const expression = value && unwrap(value);
    return (
      expression &&
      (ts.isFunctionExpression(expression) ||
        ts.isArrowFunction(expression) ||
        ts.isClassExpression(expression)) &&
      !expression.name
    );
  };
  const fixedDescriptors = new Map();
  for (const call of analysis.nodes) {
    if (
      !ts.isCallExpression(call) ||
      call.questionDotToken ||
      !ts.isPropertyAccessExpression(call.expression) ||
      call.expression.questionDotToken ||
      !ts.isIdentifier(call.expression.expression) ||
      call.expression.expression.text !== 'Object' ||
      analysis.checker.getSymbolAtLocation(call.expression.expression) ||
      call.expression.name.text !== 'defineProperty' ||
      call.arguments.length !== 3 ||
      !ts.isStringLiteral(call.arguments[1]) ||
      call.arguments[1].text !== 'name'
    )
      continue;
    const descriptor = call.arguments[2];
    if (!ts.isObjectLiteralExpression(descriptor) || descriptor.properties.length !== 2) continue;
    const [value, configurable] = descriptor.properties;
    if (
      !ts.isPropertyAssignment(value) ||
      value.name.getText(analysis.source) !== 'value' ||
      !ts.isStringLiteral(value.initializer) ||
      !ts.isPropertyAssignment(configurable) ||
      configurable.name.getText(analysis.source) !== 'configurable' ||
      configurable.initializer.kind !== ts.SyntaxKind.TrueKeyword
    )
      continue;
    const runtimeName = value.initializer.text;
    fixedDescriptors.set(call, runtimeName);
  }
  const descriptorCount = fixedDescriptors.size;
  // Direct eval can observe a declaration from a nested scope, even when it
  // does not occur in the declared function itself. Keep the whole file intact.
  if (
    analysis.nodes.some(
      (node) =>
        ts.isWithStatement(node) ||
        (ts.isCallExpression(node) &&
          ts.isIdentifier(unwrap(node.expression)) &&
          unwrap(node.expression).text === 'eval'),
    )
  )
    return { code: text, eliminated: 0, retained: descriptorCount };
  for (const [call, runtimeName] of fixedDescriptors) {
    if (!/^[A-Za-z_$][\w$]*$/.test(runtimeName)) continue;
    const target = unwrap(call.arguments[0]);
    let binding;
    let removals;
    if (ts.isIdentifier(target) && ts.isExpressionStatement(call.parent)) {
      binding = bindingOf(target);
      if (
        !binding ||
        !(ts.isFunctionDeclaration(binding.decl) || ts.isClassDeclaration(binding.decl))
      )
        continue;
      const statements = binding.decl.parent.statements;
      if (!statements || call.parent.parent !== binding.decl.parent) continue;
      const index = statements.indexOf(call.parent);
      if (ts.isClassDeclaration(binding.decl)) {
        if (statements[index - 1] !== binding.decl || classObservesInitialization(binding.decl))
          continue;
      } else if (
        statements
          .slice(0, index)
          .some(
            (statement) =>
              !ts.isExpressionStatement(statement) ||
              !(
                ts.isStringLiteral(statement.expression) ||
                fixedDescriptors.has(statement.expression)
              ),
          )
      )
        continue;
      removals = [
        // An empty statement keeps a following string out of the directive prologue.
        { start: call.parent.getStart(analysis.source), end: call.parent.end, value: ';' },
      ];
    } else if (
      ts.isFunctionExpression(target) ||
      ts.isArrowFunction(target) ||
      ts.isClassExpression(target)
    ) {
      if (ts.isClassExpression(target) && classObservesInitialization(target)) continue;
      if (target.name) binding = bindingOf(target.name);
      else {
        let owner = call;
        while (ts.isParenthesizedExpression(owner.parent)) owner = owner.parent;
        const parent = owner.parent;
        if (
          ts.isVariableDeclaration(parent) &&
          parent.initializer === owner &&
          ts.isIdentifier(parent.name)
        )
          binding = bindingOf(parent.name);
        else if (
          ts.isBinaryExpression(parent) &&
          parent.right === owner &&
          parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isIdentifier(parent.left)
        )
          binding = bindingOf(parent.left);
      }
      if (!binding) continue;
      // Renaming the binding must not change the inferred name of an earlier
      // or later anonymous assignment which has no matching descriptor.
      if (
        isAnonymous(binding.decl.initializer) ||
        binding.occurrences.some((identifier) => {
          const parent = identifier.parent;
          return (
            ts.isBinaryExpression(parent) &&
            parent.left === identifier &&
            parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            isAnonymous(parent.right)
          );
        })
      )
        continue;
      removals = [
        {
          start: call.getStart(analysis.source),
          end: target.getStart(analysis.source),
          value: '(',
        },
        { start: target.end, end: call.end, value: ')' },
      ];
    } else continue;
    if (binding.directEval || binding.dynamicScope || hasGlobalBinding(binding)) continue;
    const entry = candidates.get(binding.id);
    if (entry && entry.runtimeName !== runtimeName)
      throw new Error(`Conflicting reflected names in ${file}:${binding.line}`);
    candidates.set(binding.id, {
      binding,
      runtimeName,
      removals: [...(entry?.removals ?? []), ...removals],
      operations: (entry?.operations ?? 0) + 1,
    });
  }
  if (!candidates.size) return { code: text, eliminated: 0, retained: descriptorCount };
  const apply = (edits) => {
    let result = text;
    for (const edit of edits.sort((a, b) => b.start - a.start || b.end - a.end))
      result = result.slice(0, edit.start) + edit.value + result.slice(edit.end);
    return result;
  };
  const selected = new Map(candidates);
  function lower(entries) {
    const removals = entries.flatMap((entry) => entry.removals);
    const renamed = entries
      .flatMap(({ binding, runtimeName }) =>
        binding.occurrences.map((node) => ({
          start: node.getStart(analysis.source),
          end: node.end,
          value: ts.isShorthandPropertyAssignment(node.parent)
            ? `${binding.oldName}: ${runtimeName}`
            : runtimeName,
        })),
      )
      .filter(
        (edit) =>
          !removals.some((removal) => edit.start >= removal.start && edit.end <= removal.end),
      );
    const readable = apply([...removals]);
    const compiled = apply([...removals, ...renamed]);
    const before = analyze(file, readable);
    const after = analyze(file, compiled);
    const equivalent =
      JSON.stringify(bindingStructure(before)) === JSON.stringify(bindingStructure(after));
    return { compiled, equivalent };
  }
  // A semantic name can legitimately be used by a newly named inner binding.
  // Retaining the explicit descriptor is safer than capturing that reference.
  let lowered;
  try {
    lowered = lower([...selected.values()]);
  } catch {
    lowered = { equivalent: false };
  }
  if (!lowered.equivalent) {
    selected.clear();
    for (const [id, entry] of candidates) {
      const attempt = [...selected.values(), entry];
      try {
        const result = lower(attempt);
        if (result.equivalent) {
          selected.set(id, entry);
          lowered = result;
        }
      } catch {
        /* Preserve the explicit runtime operation on lexical conflicts. */
      }
    }
  }
  if (!selected.size)
    return {
      code: text,
      eliminated: 0,
      retained: descriptorCount,
    };
  const eliminated = [...selected.values()].reduce((sum, entry) => sum + entry.operations, 0);
  return {
    code: lowered.compiled,
    eliminated,
    retained: descriptorCount - eliminated,
  };
}
