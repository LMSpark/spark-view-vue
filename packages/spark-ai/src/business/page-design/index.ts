/**
 * 页面设计业务域（Page Design Domain）
 *
 * 仅承载“单页面四文件编辑”运行时及其直接支撑能力。
 * 不再承担生成编排、蓝图推进、导航策划或生成后校验职责。
 */

export const PAGE_DESIGN_DOMAIN = 'page-design'

export interface PageDesignBusinessContext {
  pageId?: string
  pageName?: string
  phase?: string
}

export {
  createPageCache,
  type PageCacheHandle,
} from './page-cache'

