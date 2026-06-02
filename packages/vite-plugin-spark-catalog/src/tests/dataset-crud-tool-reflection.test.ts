import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { generateModuleAbilityMetadata } from '../module-metadata-generator'

const root = resolve(import.meta.dirname, '../../../..')
const dataSetCrudToolSource = 'packages/spark-data/src/dataset-crud-tool.ts'

describe('DataSetCrudTool metadata reflection', () => {
  it('keeps public documented methods and generated metadata aligned without method tags', () => {
    const sourceFile = readSourceFile(dataSetCrudToolSource)
    const classNode = findClass(sourceFile, 'DataSetCrudTool')
    const publicMethods = readPublicInstanceMethods(sourceFile, classNode)

    const result = generateModuleAbilityMetadata(root, {
      sources: [dataSetCrudToolSource],
      outFile: 'unused/ability.json',
      moduleOutFile: 'unused/module.json',
      writeFiles: false,
    })

    const generatedActions = result.moduleMetadata
      .find(module => module.rootApi.kind === 'dataset')
      ?.rootApi.actions.map(action => action.name) ?? []
    const publicMethodNames = publicMethods.map(method => method.name)
    const ignoredMethodNames = publicMethods
      .filter(method => hasJsDocTag(sourceFile, method.node, 'vcmIgnore'))
      .map(method => method.name)
    const expectedActionNames = publicMethods
      .filter(method => readJsDocSummary(method.node).length > 0)
      .filter(method => !ignoredMethodNames.includes(method.name))
      .map(method => method.name)

    expect({
      publicMethodCount: publicMethodNames.length,
      ignoredMethodCount: ignoredMethodNames.length,
      generatedActionCount: generatedActions.length,
      publicMethodsWithoutSummary: publicMethods
        .filter(method => readJsDocSummary(method.node).length === 0)
        .map(method => method.name),
      generatedActionsWithoutPublicMethod: generatedActions.filter(action => !expectedActionNames.includes(action)),
      publicMethodsNotGenerated: expectedActionNames.filter(name => !generatedActions.includes(name)),
    }).toEqual({
      publicMethodCount: 51,
      ignoredMethodCount: 0,
      generatedActionCount: 51,
      publicMethodsWithoutSummary: [],
      generatedActionsWithoutPublicMethod: [],
      publicMethodsNotGenerated: [],
    })
  })
})

type ReflectedMethod = Readonly<{
  name: string
  node: ts.MethodDeclaration
}>

function readSourceFile(path: string): ts.SourceFile {
  const absolutePath = resolve(root, path)
  return ts.createSourceFile(absolutePath, readFileSync(absolutePath, 'utf8'), ts.ScriptTarget.ES2020, true)
}

function findClass(sourceFile: ts.SourceFile, className: string): ts.ClassDeclaration {
  const classNode = sourceFile.statements.find((node): node is ts.ClassDeclaration =>
    ts.isClassDeclaration(node) && node.name?.text === className)
  if (classNode === undefined) {
    throw new Error(`Class not found: ${className}`)
  }
  return classNode
}

function readPublicInstanceMethods(
  sourceFile: ts.SourceFile,
  classNode: ts.ClassDeclaration,
): readonly ReflectedMethod[] {
  return classNode.members
    .filter(ts.isMethodDeclaration)
    .filter(method => isPublicInstanceMember(method))
    .map(method => ({
      name: method.name.getText(sourceFile),
      node: method,
    }))
}

function isPublicInstanceMember(node: ts.MethodDeclaration): boolean {
  return !node.modifiers?.some((modifier: ts.ModifierLike) =>
    modifier.kind === ts.SyntaxKind.PrivateKeyword
    || modifier.kind === ts.SyntaxKind.ProtectedKeyword
    || modifier.kind === ts.SyntaxKind.StaticKeyword)
}

function hasJsDocTag(sourceFile: ts.SourceFile, node: ts.Node, tagName: string): boolean {
  return ts.getJSDocTags(node).some(tag => tag.tagName.getText(sourceFile) === tagName)
}

function readJsDocSummary(node: ts.Node): string {
  const docs = ts.getJSDocCommentsAndTags(node).filter(ts.isJSDoc)
  const comment = docs.at(-1)?.comment
  if (comment === undefined) return ''
  if (typeof comment === 'string') return comment.trim()
  return comment.map(part => part.getText()).join('').trim()
}
