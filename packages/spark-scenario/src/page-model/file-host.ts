import type {
  PageModelCommitResult,
  PageModelFileName,
  PageModelFileTexts,
  PageModelHost,
  PageModelHostKey,
} from './contracts'
import { createMemoryPageModelHost } from './memory-host'

export interface PageModelFileStorage {
  readText: (name: PageModelFileName) => Promise<string>
  writeAllAtomically: (files: PageModelFileTexts) => Promise<readonly PageModelFileName[]>
}

export interface FilePageModelHostOptions {
  key: PageModelHostKey
  storage: PageModelFileStorage
  files?: PageModelFileTexts
}

async function readStorageFiles(storage: PageModelFileStorage): Promise<PageModelFileTexts> {
  const [ruleJson, pageDataJson, script, style] = await Promise.all([
    storage.readText('rule.json'),
    storage.readText('pagedata.json'),
    storage.readText('script.js'),
    storage.readText('style.css'),
  ])
  return {
    'rule.json': ruleJson,
    'pagedata.json': pageDataJson,
    'script.js': script,
    'style.css': style,
  }
}

export async function createFilePageModelHost(options: FilePageModelHostOptions): Promise<PageModelHost> {
  const files = options.files ?? await readStorageFiles(options.storage)
  const host = createMemoryPageModelHost({ key: options.key, files, mode: 'headless' })

  async function commit(): Promise<PageModelCommitResult> {
    const validation = host.validate()
    if (!validation.ok) {
      host.setFlowState({
        ...host.getFlowState(),
        validated: false,
        committed: false,
        lastValidation: validation,
        updatedAt: new Date().toISOString(),
      })
      return {
        ok: false,
        mode: 'headless',
        filesWritten: [],
        error: validation.issues.map((issue) => issue.message).join('；'),
      }
    }

    try {
      const filesWritten = await options.storage.writeAllAtomically(host.readAllFiles())
      await host.commit()
      return { ok: true, mode: 'headless', filesWritten }
    } catch (error) {
      return {
        ok: false,
        mode: 'headless',
        filesWritten: [],
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  return {
    ...host,
    commit,
  }
}
