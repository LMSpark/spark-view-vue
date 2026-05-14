import rawComponentCatalogJson from './component-catalog.json'
import { projectFrameworkNeutralCatalog } from './catalog-projections'
import type { ComponentCatalog } from './types'

export const RAW_COMPONENT_CATALOG_JSON = rawComponentCatalogJson as unknown as ComponentCatalog

export const COMPONENT_CATALOG_JSON = projectFrameworkNeutralCatalog(RAW_COMPONENT_CATALOG_JSON)
