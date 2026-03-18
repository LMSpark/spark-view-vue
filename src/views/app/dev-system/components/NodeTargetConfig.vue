<template>
  <div>
    <el-divider content-position="left">{{ flags.routeSectionLabel.value }}</el-divider>

    <!-- 目标选择器（system-page / system-action / page） -->
    <el-form-item v-if="flags.showTargetSelector.value" label="目标" class="fi fi--wide">
      <el-select
        v-model="targetValue"
        filterable
        allow-create
        clearable
        :placeholder="targetPlaceholder"
      >
        <template v-if="flags.isSystemPageNode.value">
          <el-option-group label="路由">
            <el-option
              v-for="opt in systemRouteTargetOptions"
              :key="opt.value"
              :value="opt.value"
              :label="opt.label"
            />
          </el-option-group>
        </template>
        <template v-else-if="flags.isSystemActionNode.value">
          <el-option
            v-for="opt in actionTargetOptions"
            :key="opt.value"
            :value="opt.value"
            :label="opt.label"
          />
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
    <el-form-item v-if="flags.showPathStatus.value && pathStatus" label="" label-width="0" class="path-status-item">
      <el-tag :type="pathStatus.type" size="small" disable-transitions>
        <NavIcon :name="pathStatus.icon" :size="12" /> {{ pathStatus.text }}
      </el-tag>
    </el-form-item>
    <el-form-item v-if="flags.isDirectoryNode.value" label="" label-width="0" class="path-status-item">
      <el-tag type="info" size="small" disable-transitions>
        <NavIcon name="InfoFilled" :size="12" /> 当前节点类型无需路由选择或页面选择
      </el-tag>
    </el-form-item>

    <!-- 超链接（link 节点） -->
    <el-form-item v-if="flags.isLinkNode.value" label="超链接" class="fi fi--wide">
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
    <el-form-item v-if="flags.isLinkNode.value" label="渲染方式" class="fi fi--wide">
      <el-radio-group v-model="state.editForm.linkTarget" @change="state.markNavDirty">
        <el-radio-button value="iframe">内嵌 iframe</el-radio-button>
        <el-radio-button value="new-tab">新标签打开</el-radio-button>
      </el-radio-group>
    </el-form-item>
    <el-form-item v-if="flags.isLinkNode.value && state.linkProbeInfo.value" label="检测结果" class="fi fi--wide">
      <el-tag :type="state.linkProbeInfo.value.embeddable ? 'success' : 'warning'" size="small" disable-transitions>
        {{ state.linkProbeInfo.value.embeddable ? '可嵌入' : '禁止嵌入' }}
      </el-tag>
      <span class="hint-text" style="margin-left: 8px">{{ state.linkProbeInfo.value.reason }}</span>
    </el-form-item>

    <!-- 重定向（目录/模块节点） -->
    <el-form-item v-if="flags.isDirectoryNode.value" label="重定向" class="fi fi--wide">
      <el-input v-model="state.editForm.redirect" placeholder="组节点默认跳转路径" @change="state.markNavDirty" />
    </el-form-item>

    <!-- 父页面（子页面节点） -->
    <el-form-item v-if="flags.isSubPageNode.value" label="父页面" class="fi fi--medium">
      <el-select v-model="state.editForm.parentPageId" clearable placeholder="选择所属父页面" @change="state.markNavDirty">
        <el-option v-for="opt in parentPageOptions" :key="opt.id" :label="opt.label" :value="opt.id" />
      </el-select>
    </el-form-item>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { NavNode, NavNodeKind } from '@spark-view/spark-app'
import type { DevState } from '../useDevState'
import { useNodeKindFlags } from '../composables/useNodeKindFlags'
import { NavIcon } from '@spark-view/spark-app'
import { getVuePageOptions, VUE_PAGE_MAP } from '@/config/vue-page-map'

const props = defineProps<{ state: DevState }>()
const flags = useNodeKindFlags(props.state)

// ── 目标选项 ──

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
    return { path: opt.path, title: opt.title, displayTitle, extra }
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
  if (flags.isSystemPageNode.value) return '选择系统页面路由'
  if (flags.isSystemActionNode.value) return '选择系统动作'
  return '选择普通页面（配置页）'
})

// ── 目标选择双向绑定 ──

function applyTargetSelection(value: string) {
  if (flags.isSystemPageNode.value) {
    if (!value) {
      props.state.editForm.path = ''
      props.state.markNavDirty()
      props.state.clearFiles()
      return
    }
    const routePath = value.replace(/^route:/, '')
    props.state.editForm.path = routePath
    props.state.handlePathChange(routePath)
    return
  }

  if (flags.isSystemActionNode.value) {
    if (!value) {
      props.state.editForm.path = ''
      props.state.markNavDirty()
      return
    }
    props.state.editForm.path = value.replace(/^action:/, '')
    props.state.markNavDirty()
    return
  }

  if (flags.isPageNode.value) {
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
    if (flags.isSystemPageNode.value) {
      const path = props.state.editForm.path
      return path ? `route:${path}` : ''
    }
    if (flags.isSystemActionNode.value) {
      const path = props.state.editForm.path
      return path ? `action:${path}` : ''
    }
    if (flags.isPageNode.value) {
      return props.state.editForm.path ? `page:${props.state.editForm.path}` : ''
    }
    return ''
  },
  set(value) {
    applyTargetSelection(value)
  },
})

// ── 父页面选项（sub-page 用） ──

interface ParentPageOption {
  id: string
  label: string
}

function inferNodeKind(node: NavNode): NavNodeKind {
  if (node.nodeKind !== undefined) return node.nodeKind
  if (node.childPlacement === 'toolbar' || node.childPlacement === 'user-menu') return 'system-directory'
  if (node.linkTarget === 'iframe' || node.linkTarget === 'new-tab') return 'link'
  return 'page'
}

function collectParentPageOptions(nodes: NavNode[], selectedId: string, options: ParentPageOption[]) {
  for (const node of nodes) {
    const nodeKind = inferNodeKind(node)
    if (node.id !== selectedId && (nodeKind === 'page' || nodeKind === 'system-page' || nodeKind === 'system-action')) {
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

// ── 路径有效性状态 ──

const pathStatus = computed(() => {
  if (!flags.showPathStatus.value) return null
  const path = props.state.editForm.path
  if (!path) return null

  if (flags.isSystemActionNode.value) {
    const knownAction = actionTargetOptions.find(o => o.value === `action:${path}`)
    if (knownAction) {
      return { type: 'success' as const, icon: 'SuccessFilled', text: `已知动作：${path}` }
    }
    return { type: 'info' as const, icon: 'InfoFilled', text: `自定义动作标识符：${path}` }
  }

  if (flags.isSystemPageNode.value) {
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

  // 配置页面：检查 pageList
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
.link-url-row {
  display: flex;
  gap: 8px;
  width: 100%;
}
.hint-text {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}
.path-status-item {
  margin-top: -4px;
}
.path-status-item :deep(.el-form-item__content) {
  justify-content: flex-start;
}
</style>
