import ts from 'typescript';
import { analyzeSource } from './source-symbols.mjs';

/** A factory's dependency reader is a static import boundary. Prevent aliases,
 * reflection or forwarding from hiding a dependency from its declared graph.
 */
export function verifyFactoryDependencies(file, text, descriptor) {
  const analysis = analyzeSource(file, text);
  const declaration = analysis.source.statements[0];
  if (!ts.isFunctionDeclaration(declaration) || !declaration.name?.text.startsWith('initialize'))
    throw new Error(`Engine factory needs a descriptive initialize name: ${file}`);
  const parameter = declaration.parameters[0]?.name;
  if (!parameter || !ts.isIdentifier(parameter))
    throw new Error(`Missing dependency reader: ${file}`);
  const symbol = analysis.checker.getSymbolAtLocation(parameter);
  const binding = analysis.bySymbol.get(symbol);
  if (!binding) throw new Error(`Unresolved dependency reader: ${file}`);
  const allowed = new Set(descriptor.dependencies);
  for (const reference of binding.occurrences) {
    if (reference === parameter) continue;
    const call = reference.parent;
    if (
      !ts.isCallExpression(call) ||
      call.expression !== reference ||
      call.questionDotToken ||
      call.arguments.length !== 1 ||
      !ts.isStringLiteral(call.arguments[0]) ||
      !allowed.has(call.arguments[0].text)
    )
      throw new Error(
        `Undeclared, indirect or dynamic engine dependency: ${file}:${analysis.source.getLineAndCharacterOfPosition(reference.getStart()).line + 1}`,
      );
  }
}
