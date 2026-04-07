export { default as RendererTabs } from './RendererTabs/index.js'
export type { RendererTabsApi } from './RendererTabs/index.js'
export { default as RendererTabPane } from './RendererTabPane.vue'
export { default as RendererCollapse } from './RendererCollapse/index.js'
export type { RendererCollapseApi } from './RendererCollapse/index.js'
export { default as RendererCollapseItem } from './RendererCollapseItem.vue'
export { default as RendererDialog } from './RendererDialog/index.js'
export type { RendererDialogApi } from './RendererDialog/index.js'
export { default as RendererDrawer } from './RendererDrawer/index.js'
export type { RendererDrawerApi } from './RendererDrawer/index.js'
export { default as RendererSteps } from './RendererSteps/index.js'
export type { RendererStepsApi } from './RendererSteps/index.js'
export { default as RendererStepItem } from './RendererStepItem.vue'
export { default as RendererSection } from './RendererSection/index.js'
export type { RendererSectionApi } from './RendererSection/index.js'
export { default as RendererToolbar } from './RendererToolbar.vue'
export { default as RendererCard } from './RendererCard.vue'
export { default as RendererSpace } from './RendererSpace.vue'
export { default as RendererDivider } from './RendererDivider.vue'
export { default as RendererButton } from './RendererButton.vue'
export { default as RendererLink } from './RendererLink.vue'
export { default as RendererPageHeader } from './RendererPageHeader.vue'
export { default as RendererDropdown } from './RendererDropdown.vue'
export { default as RendererTooltip } from './RendererTooltip.vue'
export { default as RendererPopover } from './RendererPopover.vue'
export { default as RendererPopconfirm } from './RendererPopconfirm.vue'
export { default as RendererTour } from './RendererTour.vue'
export { default as RendererAnchor } from './RendererAnchor.vue'
export { default as RendererAnchorLink } from './RendererAnchorLink.vue'

// ── Passthrough（工厂生成，替代独立 .vue 文件）──
import { createPassthrough } from '../../create-passthrough.js'

export const RendererButtonGroup = createPassthrough('el-button-group', 'r-button-group')
export const RendererContainer = createPassthrough('el-container', 'r-container')
export const RendererMain = createPassthrough('el-main', 'r-main')
export const RendererAside = createPassthrough('el-aside', 'r-aside', { propAliases: { asideWidth: 'width' }, propDefaults: { asideWidth: '300px' } })
export const RendererLayoutHeader = createPassthrough('el-header', 'r-layout-header', { propAliases: { headerHeight: 'height' }, propDefaults: { headerHeight: '60px' } })
export const RendererLayoutFooter = createPassthrough('el-footer', 'r-layout-footer', { propAliases: { footerHeight: 'height' }, propDefaults: { footerHeight: '60px' } })
export const RendererRow = createPassthrough('el-row', 'r-row')
export const RendererCol = createPassthrough('el-col', 'r-col')
export const RendererAffix = createPassthrough('el-affix', 'r-affix')
export const RendererBacktop = createPassthrough('el-backtop', 'r-backtop')
export const RendererScrollbar = createPassthrough('el-scrollbar', 'r-scrollbar')
export const RendererCarousel = createPassthrough('el-carousel', 'r-carousel')
export const RendererCarouselItem = createPassthrough('el-carousel-item', 'r-carousel-item')
export const RendererWatermark = createPassthrough('el-watermark', 'r-watermark')