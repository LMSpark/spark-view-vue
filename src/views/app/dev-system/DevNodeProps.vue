<template>
  <div class="dev-node-props">
    <el-alert
      v-if="isSystemRootDirectory"
      type="warning"
      :closable="false"
      show-icon
      class="system-dir-alert"
      title="系统模块（固定分组）不可删除、不可改类型、不可改层级；仅可编辑子项"
    />
    <el-form :model="state.editForm" :disabled="isSystemRootDirectory" label-width="100px" size="default" class="node-form">
      <!-- 基础信息 -->
      <el-divider content-position="left">基础信息</el-divider>
      <el-form-item label="ID" class="fi fi--wide">
        <el-input v-model="state.editForm.id" placeholder="唯一标识" @change="state.markNavDirty" />
      </el-form-item>
      <el-form-item label="标题" class="fi fi--wide">
        <el-input v-model="state.editForm.title" placeholder="显示名称" @change="state.markNavDirty" />
      </el-form-item>
      <div class="fi-inline-row">
        <el-form-item label="图标" class="fi fi--narrow fi-inline-row__icon">
          <IconPicker
            v-model="state.editForm.icon"
            class="icon-picker-compact"
            placeholder="选择图标"
            width="220"
            @update:model-value="state.markNavDirty"
          />
        </el-form-item>
        <el-form-item label="节点类别" class="fi fi--medium fi-inline-row__type">
          <el-radio-group v-model="state.editForm.nodeKind" class="type-radio-group" @change="state.handleNodeKindChange">
            <el-radio-button value="system-directory">系统模块</el-radio-button>
            <el-radio-button value="module" :disabled="moduleKindDisabled">模块</el-radio-button>
            <el-radio-button value="system-page">系统页面</el-radio-button>
            <el-radio-button value="page">普通页面</el-radio-button>
            <el-radio-button value="link">超链接</el-radio-button>
            <el-radio-button value="sub-page">子页面</el-radio-button>
          </el-radio-group>
        </el-form-item>
      </div>
      <el-form-item label="描述" class="fi fi--wide">
        <el-input
          v-model="state.editForm.description"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 5 }"
          placeholder="节点描述（AI 语义 + tooltip）"
          @change="state.markNavDirty"
        />
      </el-form-item>

      <!-- 路由 & 关联页面 -->
      <el-divider content-position="left">路由 & 关联页面</el-divider>
      <el-form-item v-if="showTargetSelector" label="目标" class="fi fi--wide">
        <el-select
          v-model="targetValue"
          filterable
          allow-create
          clearable
          :placeholder="targetPlaceholder"
        >
          <template v-if="isSystemPageNode">
            <el-option-group label="路由">
              <el-option
                v-for="opt in systemRouteTargetOptions"
                :key="opt.value"
                :value="opt.value"
                :label="opt.label"
              />
            </el-option-group>
            <el-option-group label="动作">
              <el-option
                v-for="opt in actionTargetOptions"
                :key="opt.value"
                :value="opt.value"
                :label="opt.label"
              />
            </el-option-group>
          </template>
          <template v-else>
            <el-option
              v-for="opt in pageTargetOptions"
              :key="opt.value"
              :value="opt.value"
              :label="opt.label"
            />
          </template>
        </el-select>
      </el-form-item>
      <!-- 路径有效性提示 -->
      <el-form-item v-if="showPathStatus && pathStatus" label="" label-width="0" class="path-status-item">
        <el-tag :type="pathStatus.type" size="small" disable-transitions>
          <NavIcon :name="pathStatus.icon" :size="12" /> {{ pathStatus.text }}
        </el-tag>
      </el-form-item>
      <el-form-item v-if="isDirectoryNode" label="" label-width="0" class="path-status-item">
        <el-tag type="info" size="small" disable-transitions>
          <NavIcon name="InfoFilled" :size="12" /> 当前节点类型无需路由选择或页面选择
        </el-tag>
      </el-form-item>
      <el-form-item v-if="isLinkNode" label="超链接" class="fi fi--wide">
        <div class="link-url-row">
          <el-input
            v-model="state.editForm.path"
            placeholder="https://..."
            @change="state.onLinkUrlChanged"
          />
          <el-button
            :loading="state.linkProbeLoading.value"
            @click="state.probeLinkTarget"
          >
            检测嵌入
          </el-button>
        </div>
      </el-form-item>
      <el-form-item v-if="isLinkNode" label="渲染方式" class="fi fi--wide">
        <el-radio-group v-model="state.editForm.linkTarget" @change="state.markNavDirty">
          <el-radio-button value="iframe">内嵌 iframe</el-radio-button>
          <el-radio-button value="new-tab">新标签打开</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item v-if="isLinkNode && state.linkProbeInfo.value" label="检测结果" class="fi fi--wide">
        <el-tag :type="state.linkProbeInfo.value.embeddable ? 'success' : 'warning'" size="small" disable-transitions>
          {{ state.linkProbeInfo.value.embeddable ? '可嵌入' : '禁止嵌入' }}
        </el-tag>
        <span class="switch-item__hint" style="margin-left: 8px">{{ state.linkProbeInfo.value.reason }}</span>
      </el-form-item>
      <el-form-item v-if="isDirectoryNode" label="重定向" class="fi fi--wide">
        <el-input v-model="state.editForm.redirect" placeholder="组节点默认跳转路径" @change="state.markNavDirty" />
      </el-form-item>
      <el-form-item v-if="isSubPageNode" label="父页面" class="fi fi--medium">
        <el-select v-model="state.editForm.parentPageId" clearable placeholder="选择所属父页面" @change="state.markNavDirty">
          <el-option v-for="opt in parentPageOptions" :key="opt.id" :label="opt.label" :value="opt.id" />
        </el-select>
      </el-form-item>

      <!-- 布局配置 -->
      <el-divider content-position="left">布局配置</el-divider>
      <el-form-item label="子项布局" class="fi fi--wide">
        <el-radio-group v-model="state.editForm.childPlacement" @change="state.markNavDirty">
          <el-radio-button value="">默认</el-radio-button>
          <el-radio-button value="header">header</el-radio-button>
          <el-radio-button value="sidebar">sidebar</el-radio-button>
          <el-radio-button value="toolbar">toolbar</el-radio-button>
          <el-radio-button value="user-menu">user-menu</el-radio-button>
          <el-radio-button value="parent">parent</el-radio-button>
          <el-radio-button value="flat">flat</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="后置分割线" class="switch-item fi fi--medium">
        <el-switch v-model="state.editForm.dividerAfter" @change="state.markNavDirty" />
        <span class="switch-item__hint">在当前节点后显示分割线</span>
      </el-form-item>
      <el-form-item label="排序号" class="fi fi--narrow">
        <el-input-number v-model="state.editForm.order" :min="0" :max="999" @change="state.markNavDirty" />
      </el-form-item>

      <!-- 状态控制 -->
      <el-divider content-position="left">状态控制</el-divider>
      <el-form-item label="隐藏" class="switch-item">
        <el-switch v-model="state.editForm.hidden" :disabled="isSubPageNode" @change="state.markNavDirty" />
        <span class="switch-item__hint">
          {{ isSubPageNode ? '子页面固定为隐藏（true 持久化）' : '在导航中不展示该节点（仅 true 持久化，false 为默认值不落库）' }}
        </span>
      </el-form-item>
      <el-form-item label="禁用" class="switch-item">
        <el-switch v-model="state.editForm.disabled" @change="state.markNavDirty" />
        <span class="switch-item__hint">保留显示但不可点击（仅 true 持久化，false 为默认值不落库）</span>
      </el-form-item>

      <!-- 模块上下文 -->
      <el-divider content-position="left">模块上下文（Context）</el-divider>
      <el-form-item label="启用上下文" class="switch-item">
        <el-switch v-model="state.hasContext.value" @change="state.toggleContext" />
        <span class="switch-item__hint">启用后可配置下拉上下文选项</span>
      </el-form-item>
      <template v-if="state.hasContext.value">
        <el-form-item label="选项列表" class="fi fi--wide">
          <div class="context-items">
            <div v-for="(item, idx) in state.contextItems.value" :key="idx" class="context-item-row">
              <el-input v-model="item.id" class="context-item-row__id" placeholder="ID" @change="state.markNavDirty" />
              <el-input v-model="item.title" class="context-item-row__title" placeholder="显示名称" @change="state.markNavDirty" />
              <el-button size="small" link type="danger" @click="state.removeContextItem(idx)">
                <NavIcon name="CloseBold" :size="12" />
              </el-button>
            </div>
            <el-button size="small" type="primary" link @click="state.addContextItem">
              <NavIcon name="Plus" :size="12" /> 新增选项
            </el-button>
          </div>
        </el-form-item>
        <el-form-item label="占位文字" class="fi fi--medium">
          <el-input v-model="state.contextConfig.placeholder" placeholder="请选择" @change="state.markNavDirty" />
        </el-form-item>
        <el-form-item label="默认值" class="fi fi--medium">
          <el-input v-model="state.contextConfig.defaultValue" placeholder="默认选中的 ID" @change="state.markNavDirty" />
        </el-form-item>
        <el-form-item label="URL 参数名" class="fi fi--medium">
          <el-input v-model="state.contextConfig.paramName" placeholder="同步到 route.query 的键名" @change="state.markNavDirty" />
        </el-form-item>
      </template>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { NavNode, NavNodeKind } from '@spark-view/spark-app'
import type { DevState } from './useDevState'
import IconPicker from '@/components/IconPicker.vue'
import NavIcon from '@/components/NavIcon.vue'
import { getVuePageOptions, VUE_PAGE_MAP } from '@/config/vue-page-map'

const props = defineProps<{ state: DevState }>()
defineEmits<{ createPage: [] }>()

const isSystemRootDirectory = computed(() => props.state.isSystemRootDirectory(props.state.selectedNode.value))
const moduleKindDisabled = computed(() => !props.state.canUseModuleNodeKind(props.state.selectedNode.value))

function inferNodeKind(node: NavNode): NavNodeKind {
  if (node.nodeKind !== undefined) return node.nodeKind
  if (node.childPlacement === 'toolbar' || node.childPlacement === 'user-menu') return 'system-directory'
  if (node.linkTarget === 'iframe' || node.linkTarget === 'new-tab') return 'link'
  return 'page'
}

const isDirectoryNode = computed(() => {
  const kind = props.state.editForm.nodeKind
  return kind === 'system-directory' || kind === 'module'
})

const isSystemPageNode = computed(() => props.state.editForm.nodeKind === 'system-page')
const isPageNode = computed(() => props.state.editForm.nodeKind === 'page')
const isLinkNode = computed(() => props.state.editForm.nodeKind === 'link')
const isSubPageNode = computed(() => props.state.editForm.nodeKind === 'sub-page')
const showPathStatus = computed(() => isSystemPageNode.value || isPageNode.value)
const showTargetSelector = computed(() => isSystemPageNode.value || isPageNode.value)

interface TargetOption {
  value: string
  label: string
}

const actionTargetOptions: TargetOption[] = [
  { value: 'action:ai-design', label: '动作 · AI 协同设计' },
  { value: 'action:ai-chat', label: '动作 · AI 对话' },
  { value: 'action:search', label: '动作 · 搜索' },
  { value: 'action:fullscreen', label: '动作 · 全屏' },
  { value: 'action:notifications', label: '动作 · 通知' },
  { value: 'action:theme-toggle', label: '动作 · 主题切换' },
]

/** 已知动作标识符集合（用于反向查找 path 是否为 action） */
const ACTION_VALUES = new Set(actionTargetOptions.map(o => o.value.replace(/^action:/, '')))

interface VuePathOption {
  path: string
  title: string
  displayTitle: string
  extra: string
}

function collectPathTitles(nodes: NavNode[], map: Map<string, string>) {
  for (const node of nodes) {
    const path = node.path ?? ''
    const title = node.title ?? ''
    if (path && title && !map.has(path)) {
      map.set(path, title)
    }
    if (Array.isArray(node.children)) {
      collectPathTitles(node.children, map)
    }
  }
}

const navPathTitleMap = computed(() => {
  const map = new Map<string, string>()
  collectPathTitles(props.state.treeData.value, map)
  return map
})

const vuePageOptions = computed<VuePathOption[]>(() => {
  return getVuePageOptions().map((opt) => {
    const navTitle = navPathTitleMap.value.get(opt.path)
    const displayTitle = navTitle ?? opt.title
    const extra = navTitle && navTitle !== opt.title ? `组件: ${opt.title}` : ''
    return {
      path: opt.path,
      title: opt.title,
      displayTitle,
      extra,
    }
  })
})

const systemRouteTargetOptions = computed<TargetOption[]>(() =>
  vuePageOptions.value.map((opt) => ({
    value: `route:${opt.path}`,
    label: `路由 · ${opt.displayTitle}（${opt.path}）${opt.extra ? ` · ${opt.extra}` : ''}`,
  })),
)

const configPageOptions = computed(() => {
  return props.state.pageList.value
    .filter((p) => String(p['pageType'] ?? 'config') !== 'system-page')
    .map((p) => {
      const pageId = String(p['pageId'] ?? '')
      const path = String(p['path'] ?? `/${pageId}`)
      const title = String(p['title'] ?? pageId)
      return { path, title }
    })
})

const pageTargetOptions = computed<TargetOption[]>(() =>
  configPageOptions.value.map((opt) => ({
    value: `page:${opt.path}`,
    label: `页面 · ${opt.title}（${opt.path}）`,
  })),
)

const targetPlaceholder = computed(() => {
  if (isSystemPageNode.value) return '选择系统页面路由或动作'
  return '选择普通页面（配置页）'
})

function applyTargetSelection(value: string) {
  if (isSystemPageNode.value) {
    if (!value) {
      props.state.editForm.path = ''
      props.state.markNavDirty()
      props.state.clearFiles()
      return
    }
    if (value.startsWith('action:')) {
      props.state.editForm.path = value.replace(/^action:/, '')
      props.state.markNavDirty()
      props.state.clearFiles()
      return
    }
    const routePath = value.replace(/^route:/, '')
    props.state.editForm.path = routePath
    props.state.handlePathChange(routePath)
    return
  }

  if (isPageNode.value) {
    if (!value) {
      props.state.editForm.path = ''
      props.state.markNavDirty()
      props.state.clearFiles()
      return
    }
    const pagePath = value.replace(/^page:/, '')
    props.state.editForm.path = pagePath
    props.state.handlePathChange(pagePath)
  }
}

const targetValue = computed<string>({
  get() {
    if (isSystemPageNode.value) {
      const path = props.state.editForm.path
      if (!path) return ''
      if (ACTION_VALUES.has(path)) return `action:${path}`
      return `route:${path}`
    }
    if (isPageNode.value) {
      return props.state.editForm.path ? `page:${props.state.editForm.path}` : ''
    }
    return ''
  },
  set(value) {
    applyTargetSelection(value)
  },
})

interface ParentPageOption {
  id: string
  label: string
}

function collectParentPageOptions(nodes: NavNode[], selectedId: string, options: ParentPageOption[]) {
  for (const node of nodes) {
    const nodeKind = inferNodeKind(node)
    if (node.id !== selectedId && (nodeKind === 'page' || nodeKind === 'system-page')) {
      const suffix = node.path ? `（${node.path}）` : ''
      options.push({ id: node.id, label: `${node.title}${suffix}` })
    }
    if (Array.isArray(node.children)) {
      collectParentPageOptions(node.children, selectedId, options)
    }
  }
}

const parentPageOptions = computed(() => {
  const options: ParentPageOption[] = []
  collectParentPageOptions(props.state.treeData.value, props.state.editForm.id, options)
  return options
})

/** 路径有效性状态：检查当前路径是否匹配 vue-component 映射或配置页面 */
const pathStatus = computed(() => {
  if (!showPathStatus.value) return null
  const path = props.state.editForm.path
  if (!path) {
    return null
  }

  if (isSystemPageNode.value) {
    if (ACTION_VALUES.has(path)) {
      return {
        type: 'info' as const,
        icon: 'InfoFilled',
        text: `当前目标为动作：${path}`,
      }
    }
    if (path in VUE_PAGE_MAP) {
      const entry = VUE_PAGE_MAP[path]!
      const nodeTitle = props.state.editForm.title.trim()
      if (nodeTitle && nodeTitle !== entry.title) {
        return {
          type: 'info' as const,
          icon: 'InfoFilled',
          text: `组件页为「${entry.title}」，当前导航标题为「${nodeTitle}」（允许不同）`,
        }
      }
      return { type: 'success' as const, icon: 'SuccessFilled', text: `匹配 Vue 组件：${entry.title}` }
    }
    return { type: 'warning' as const, icon: 'WarningFilled', text: `路径 ${path} 未在 VUE_PAGE_MAP 中注册` }
  }

  // config 页面：检查 pageList 中是否存在对应的 pageId
  const pageId = path.replace(/^\/+/, '')
  if (!pageId) return null
  const exists = props.state.pageList.value.some(
    (p: Record<string, unknown>) => String(p['pageId'] ?? '') === pageId,
  )
  if (exists) {
    return { type: 'success' as const, icon: 'SuccessFilled', text: `配置页面已存在：${pageId}` }
  }
  return { type: 'danger' as const, icon: 'CircleCloseFilled', text: `配置页面不存在：${pageId}（需先创建）` }
})
</script>

<style scoped>
.dev-node-props {
  padding: 12px 16px 20px;
  overflow: auto;
  height: 100%;
  background: var(--el-bg-color);
}

.system-dir-alert {
  margin-bottom: 12px;
}

.node-form {
  max-width: 960px;
  --fi-wide: 100%;
  --fi-medium: 520px;
  --fi-narrow: 240px;
}

.node-form :deep(.fi .el-form-item__content > *) {
  width: 100%;
}

.node-form :deep(.fi--wide .el-form-item__content > *) {
  max-width: var(--fi-wide);
}

.node-form :deep(.fi--medium .el-form-item__content > *) {
  max-width: var(--fi-medium);
}

.node-form :deep(.fi--narrow .el-form-item__content > *) {
  max-width: var(--fi-narrow);
}

.switch-item :deep(.el-form-item__content) {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.switch-item__hint {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}

.path-status-item {
  margin-top: -4px;
}

.path-status-item :deep(.el-form-item__content) {
  justify-content: flex-start;
}

.context-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  padding: 10px;
  border: 1px dashed var(--el-border-color);
  border-radius: 8px;
  background: var(--el-fill-color-extra-light);
}

.context-item-row {
  display: grid;
  grid-template-columns: minmax(140px, 180px) minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}

.context-item-row__id,
.context-item-row__title {
  width: 100%;
}

.icon-picker-compact {
  width: 100%;
}

.fi-inline-row {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.fi-inline-row__icon {
  flex: 0 0 var(--fi-narrow);
}

.fi-inline-row__type {
  flex: 1;
  min-width: 0;
}

.link-url-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dev-node-props :deep(.el-tag) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.dev-node-props :deep(.el-form-item) {
  margin-bottom: 14px;
}

.dev-node-props :deep(.el-form-item__label) {
  color: var(--el-text-color-secondary);
  font-weight: 600;
}

.dev-node-props :deep(.el-divider--horizontal) {
  margin: 22px 0 14px;
}

.dev-node-props :deep(.el-divider__text) {
  font-size: 13px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  letter-spacing: 0.2px;
}

.dev-node-props :deep(.el-input),
.dev-node-props :deep(.el-select),
.dev-node-props :deep(.el-input-number) {
  width: 100%;
}

.dev-node-props :deep(.el-radio-group) {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(88px, 1fr));
  gap: 6px;
  width: 100%;
}

.dev-node-props :deep(.el-radio-button) {
  margin: 0;
  width: 100%;
}

.dev-node-props :deep(.el-radio-button__inner) {
  border-left: 1px solid var(--el-border-color) !important;
  border-radius: 6px !important;
  width: 100%;
  text-align: center;
}

.dev-node-props :deep(.el-input-number) {
  max-width: 220px;
}

.dev-node-props :deep(.type-radio-group) {
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
}

.dev-node-props :deep(.type-radio-group .el-radio-button__inner) {
  min-height: 34px;
  padding: 8px 6px;
  font-size: 12px;
  line-height: 1.2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 1200px) {
  .dev-node-props {
    padding: 10px 12px 16px;
  }

  .dev-node-props :deep(.type-radio-group) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .fi-inline-row {
    flex-direction: column;
    gap: 0;
  }

  .fi-inline-row__icon,
  .fi-inline-row__type {
    flex: 1 1 auto;
  }

  .node-form {
    --fi-medium: 100%;
    --fi-narrow: 100%;
  }

  .switch-item__hint {
    display: none;
  }
}
</style>
