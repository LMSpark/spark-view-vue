import componentCatalogJson from './component-catalog.json'
import type { ComponentCatalog } from './types'
import { projectStillsCatalog } from './catalog-projections'
import {
  createSession as createCoreSession,
  type CreateSessionOptions,
} from '../core/stills/domain'
import type { IStillSession } from '../core/stills/types'

export const DEFAULT_STILLS_SESSION_CATALOG = projectStillsCatalog(componentCatalogJson as ComponentCatalog)

export function createStillsSession(options?: CreateSessionOptions): IStillSession {
  return createCoreSession({
    catalog: DEFAULT_STILLS_SESSION_CATALOG,
    ...(options ?? {}),
  })
}