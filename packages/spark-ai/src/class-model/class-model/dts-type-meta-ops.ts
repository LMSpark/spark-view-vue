/**
 * DtsTypeMeta 遍历与 MethodMeta 返回类型归一化（TypeDoc 对齐）。
 */
import type { DtsTypeMeta, MethodMeta } from './types'

/** TypeDoc `SignatureReflection.type`；读侧 `returnType` 为兼容别名。 */
export function resolveMethodReturnType(method: MethodMeta): DtsTypeMeta | undefined {
  return method.type ?? method.returnType
}

/** parameters + type/returnType 完整时可从 type 树渲染完整签名。 */
export function canRenderMethodSignatureFromTypeTree(method: MethodMeta): boolean {
  return method.parameters !== undefined && resolveMethodReturnType(method) !== undefined
}

/** 收集 type 树中的 reference 名（跳过 type parameter）。 */
export function collectDtsTypeReferenceNames(typeMeta: DtsTypeMeta | undefined): readonly string[] {
  const names = new Set<string>()
  visitDtsTypeMeta(typeMeta, (node) => {
    if (node.type !== 'reference' || node.refersToTypeParameter === true) return
    names.add(node.name)
  })
  return [...names]
}

export function visitDtsTypeMeta(
  typeMeta: DtsTypeMeta | undefined,
  visit: (node: DtsTypeMeta) => void,
): void {
  if (typeMeta === undefined) return
  visit(typeMeta)
  switch (typeMeta.type) {
    case 'reference':
      for (const typeArgument of typeMeta.typeArguments ?? []) {
        visitDtsTypeMeta(typeArgument, visit)
      }
      break
    case 'array':
    case 'optional':
    case 'rest':
      visitDtsTypeMeta(typeMeta.elementType, visit)
      break
    case 'union':
    case 'intersection':
      for (const item of typeMeta.types) {
        visitDtsTypeMeta(item, visit)
      }
      break
    case 'tuple':
      for (const element of typeMeta.elements) {
        visitDtsTypeMeta(element, visit)
      }
      break
    case 'reflection':
      for (const signature of typeMeta.declaration.signatures) {
        for (const parameter of signature.parameters) {
          visitDtsTypeMeta(parameter.type, visit)
        }
        visitDtsTypeMeta(signature.type, visit)
      }
      break
    case 'intrinsic':
    case 'literal':
    case 'unknown':
      break
  }
}
