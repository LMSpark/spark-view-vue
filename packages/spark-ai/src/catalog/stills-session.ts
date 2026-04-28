import componentCatalogJson from './component-catalog.json'
import type { ComponentCatalog } from './types'
import { projectStillsCatalog } from './catalog-projections'
import {
  createBareSession,
  type CreateSessionOptions,
} from '../core/stills/domain'
import type { IStillSession } from '../core/stills/types'

export const DEFAULT_STILLS_SESSION_CATALOG = projectStillsCatalog(componentCatalogJson as ComponentCatalog)

export function createSession(options?: CreateSessionOptions): IStillSession {
  return createBareSession({
    catalog: DEFAULT_STILLS_SESSION_CATALOG,
    ...(options ?? {}),
  })
}