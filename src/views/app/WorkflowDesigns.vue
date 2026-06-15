<!--
@module app:views/app/WorkflowDesigns
职责：提供工作流设计稿的可视化编辑入口，连接 Dify-like JSON graph、文件保存 API 与节点级单模型编辑。
边界：只处理设计态 JSON，不执行 Agent workflow 运行时。
AI用途：需要验证业务工厂 workflow 编辑器如何把 single_model_edit 工具节点映射到 UI 时，用本页面定位。
-->
<template>
  <div class="workflow-design-page">
    <el-page-header content="工作流设计" @back="$router.go(-1)">
      <template #icon>
        <el-icon><Share /></el-icon>
      </template>
      <template #extra>
        <el-button :icon="Refresh" :loading="loadingList" @click="loadDesigns">刷新</el-button>
        <el-button type="primary" :icon="DocumentAdd" @click="openCreateDialog">新建</el-button>
        <el-button :icon="DocumentCopy" :disabled="currentDocument === null" @click="copyJson">复制 JSON</el-button>
        <el-button type="success" :icon="Upload" :loading="saving" :disabled="!canSave" @click="saveCurrentDesign">
          保存
        </el-button>
      </template>
    </el-page-header>

    <div class="workflow-design-shell" :style="workflowShellStyle">
      <aside class="workflow-design-sidebar">
        <div class="panel-heading">
          <span>设计稿</span>
          <el-tag size="small" type="info">{{ designs.length }}</el-tag>
        </div>
        <el-skeleton v-if="loadingList && designs.length === 0" :rows="6" animated />
        <el-empty v-else-if="designs.length === 0" description="暂无设计稿" />
        <div v-else class="workflow-list">
          <div
            v-for="item in designs"
            :key="item.workflowId"
            class="workflow-list-item"
            :class="{ 'is-active': item.workflowId === currentWorkflowId }"
            role="button"
            tabindex="0"
            @click="openDesign(item.workflowId)"
            @keydown.enter.prevent="openDesign(item.workflowId)"
          >
            <div class="workflow-list-main">
              <strong>{{ item.title || item.workflowId }}</strong>
              <span>{{ item.workflowId }}</span>
            </div>
            <div class="workflow-list-meta">
              <el-tag size="small" :type="item.status === 'unreadable' ? 'danger' : 'success'">
                {{ item.status || 'draft' }}
              </el-tag>
              <span>{{ item.version ? `v${item.version}` : 'v1' }}</span>
            </div>
            <div class="workflow-list-actions">
              <el-button link size="small" :icon="FolderOpened" @click.stop="openDesign(item.workflowId)">
                打开
              </el-button>
              <el-button link size="small" type="danger" :icon="Delete" @click.stop="deleteDesign(item.workflowId)">
                删除
              </el-button>
            </div>
          </div>
        </div>
      </aside>

      <div
        class="layout-resize-handle"
        title="拖拽调整设计稿区域"
        role="separator"
        aria-orientation="vertical"
        @pointerdown.prevent="startLayoutResize($event, 'left')"
      />

      <main class="workflow-design-canvas">
        <div v-if="currentDocument" class="canvas-toolbar">
          <div class="document-title">
            <span>{{ currentDocument.app.name }}</span>
            <el-tag size="small">{{ currentDocument.kind }}</el-tag>
            <el-tag size="small" :type="hasUnsavedChanges ? 'warning' : 'success'">
              {{ hasUnsavedChanges ? '未保存' : '已保存' }}
            </el-tag>
          </div>
          <div class="document-stats">
            <span>节点 {{ allNodes.length }}</span>
            <span>工具 {{ singleModelNodes.length }}</span>
            <span v-if="currentTimestamp">ts {{ currentTimestamp }}</span>
          </div>
        </div>

        <el-empty v-if="currentDocument === null && !opening" description="选择或新建工作流" />
        <el-skeleton v-else-if="opening" :rows="12" animated />

        <template v-else-if="currentDocument">
          <details
            v-for="graphView in graphViews"
            :key="graphView.key"
            class="graph-section collapsible-section"
            :class="{ 'is-loop-group': graphView.carrier === 'loop' }"
            open
          >
            <summary class="section-label">
              <span class="section-title">{{ graphView.title }}</span>
              <span class="section-label-actions" @click.stop>
                <el-tag v-if="graphView.carrier === 'loop'" size="small" type="warning">循环分组</el-tag>
                <el-tag size="small" type="info">节点 {{ nodesForGraph(graphView).length }}</el-tag>
                <el-tag size="small" type="info">连线 {{ edgesForGraph(graphView).length }}</el-tag>
                <el-button
                  link
                  size="small"
                  :icon="DocumentAdd"
                  @click.stop.prevent="openNodeCreateDialog(graphView, 'tool')"
                >
                  加工具
                </el-button>
                <el-button
                  link
                  size="small"
                  :icon="DocumentAdd"
                  @click.stop.prevent="openNodeCreateDialog(graphView, 'loop')"
                >
                  加循环
                </el-button>
                <el-button
                  link
                  size="small"
                  :icon="DocumentAdd"
                  @click.stop.prevent="openNodeCreateDialog(graphView, 'custom')"
                >
                  加节点
                </el-button>
              </span>
            </summary>

            <div class="collapsible-body">
              <div
                v-if="graphView.carrier === 'loop'"
                class="loop-group-meta"
                role="group"
                aria-label="循环分组配置摘要"
              >
                <span>owner {{ graphView.ownerNodeId }}</span>
                <span>mode {{ loopMode(graphView.ownerNode) }}</span>
                <span>max {{ loopMaxCount(graphView.ownerNode) }}</span>
                <span>exit {{ loopExitNodeId(graphView.ownerNode) }}</span>
              </div>

              <div class="workflow-flow-shell" :style="flowShellStyle(graphView, nodesForGraph(graphView))">
                <VueFlow
                  :id="flowId(graphView)"
                  class="workflow-flow"
                  :class="{ 'workflow-flow--subgraph': graphView.carrier !== 'root' }"
                  :nodes="flowNodesForGraph(graphView)"
                  :edges="flowEdgesForGraph(graphView)"
                  :default-viewport="flowDefaultViewport(graphView)"
                  :connection-mode="ConnectionMode.Strict"
                  :connection-line-type="ConnectionLineType.SmoothStep"
                  :default-edge-options="flowDefaultEdgeOptions"
                  :edges-updatable="true"
                  :nodes-draggable="true"
                  :nodes-connectable="true"
                  :elements-selectable="true"
                  :fit-view-on-init="false"
                  :auto-pan-on-connect="true"
                  :auto-pan-on-node-drag="true"
                  :delete-key-code="null"
                  :min-zoom="0.3"
                  :max-zoom="1.6"
                  @node-click="handleFlowNodeClick"
                  @node-drag-stop="handleFlowNodeDragStop"
                  @edge-click="handleFlowEdgeClick"
                  @edge-update="event => handleFlowEdgeUpdate(event, graphView)"
                  @connect="connection => handleFlowConnect(connection, graphView)"
                >
                  <Background pattern-color="#dbe3ee" :gap="24" />
                  <Controls position="bottom-left" />
                  <MiniMap pannable zoomable />

                  <template #node-workflow="{ data, selected }">
                    <div class="workflow-node" :class="flowNodeClass(data, selected)">
                      <Handle
                        id="target"
                        type="target"
                        :position="Position.Left"
                        :title="`连到 ${data.title}`"
                      />
                      <Handle
                        id="source"
                        type="source"
                        :position="Position.Right"
                        :title="`从 ${data.title} 连线`"
                      />
                      <span class="node-kind">{{ data.phaseId || data.nodeType }}</span>
                      <strong>{{ data.title }}</strong>
                      <small>{{ data.sectionPath || data.id }}</small>
                      <span v-if="data.isSingleModelEditTool" class="tool-name">single_model_edit</span>
                    </div>
                  </template>
                </VueFlow>
                <button
                  type="button"
                  class="graph-resize-handle"
                  title="拖拽调整区域大小"
                  @pointerdown.stop.prevent="startGraphResize($event, graphView)"
                />
              </div>
            </div>
          </details>
        </template>
      </main>

      <div
        class="layout-resize-handle"
        title="拖拽调整属性区域"
        role="separator"
        aria-orientation="vertical"
        @pointerdown.prevent="startLayoutResize($event, 'right')"
      />

      <aside class="workflow-design-editor">
        <div class="panel-heading">
          <span>属性</span>
          <el-tag v-if="selectedEdge" size="small" type="warning">连线</el-tag>
          <el-tag v-else-if="selectedNode" size="small" :type="selectedNode.isSingleModelEditTool ? 'success' : 'info'">
            {{ selectedNode.nodeType }}
          </el-tag>
        </div>

        <el-empty v-if="selectedNode === null && selectedEdge === null" description="未选择节点或连线" />

        <template v-else-if="selectedEdge">
          <details class="editor-section collapsible-section" open>
            <summary>连线信息</summary>
            <div class="collapsible-body">
              <el-descriptions :column="1" size="small" border>
                <el-descriptions-item label="ID">{{ selectedEdge.id }}</el-descriptions-item>
                <el-descriptions-item label="Scope">{{ selectedEdge.scopePath }}</el-descriptions-item>
                <el-descriptions-item label="Source">{{ selectedEdge.source }}</el-descriptions-item>
                <el-descriptions-item label="Target">{{ selectedEdge.target }}</el-descriptions-item>
              </el-descriptions>
            </div>
          </details>

          <details class="editor-section collapsible-section" open>
            <summary>连线编辑</summary>
            <div class="collapsible-body">
              <el-form label-position="top">
                <el-form-item label="Source">
                  <select v-model="edgeSourceText" class="native-select" @change="markEditorDirty">
                    <option v-for="node in selectedEdgeGraphNodes" :key="node.key" :value="node.id">
                      {{ node.title }} / {{ node.id }}
                    </option>
                  </select>
                </el-form-item>
                <el-form-item label="Target">
                  <select v-model="edgeTargetText" class="native-select" @change="markEditorDirty">
                    <option v-for="node in selectedEdgeGraphNodes" :key="node.key" :value="node.id">
                      {{ node.title }} / {{ node.id }}
                    </option>
                  </select>
                </el-form-item>
                <el-row :gutter="8">
                  <el-col :span="12">
                    <el-form-item label="Type">
                      <el-input v-model="edgeTypeText" @input="markEditorDirty" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="Relation">
                      <el-input v-model="edgeRelationText" @input="markEditorDirty" />
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-row :gutter="8">
                  <el-col :span="12">
                    <el-form-item label="Source Handle">
                      <el-input v-model="edgeSourceHandleText" @input="markEditorDirty" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="Target Handle">
                      <el-input v-model="edgeTargetHandleText" @input="markEditorDirty" />
                    </el-form-item>
                  </el-col>
                </el-row>
              </el-form>
              <div class="editor-actions split-actions">
                <el-button :icon="CircleCheck" @click="applyEdgeEditorToSelected">应用连线</el-button>
                <el-button type="danger" :icon="Delete" @click="deleteSelectedEdge">删除连线</el-button>
              </div>
            </div>
          </details>
        </template>

        <template v-else-if="selectedNode">
          <details class="editor-section collapsible-section" open>
            <summary>节点信息</summary>
            <div class="collapsible-body">
              <el-descriptions :column="1" size="small" border>
                <el-descriptions-item label="ID">{{ selectedNode.id }}</el-descriptions-item>
                <el-descriptions-item label="Scope">{{ selectedNode.scopePath }}</el-descriptions-item>
                <el-descriptions-item v-if="selectedNode.phaseId" label="Phase">{{ selectedNode.phaseId }}</el-descriptions-item>
                <el-descriptions-item v-if="selectedNode.sectionPath" label="Section">{{ selectedNode.sectionPath }}</el-descriptions-item>
                <el-descriptions-item v-if="selectedNode.publishPath" label="Publish">{{ selectedNode.publishPath }}</el-descriptions-item>
              </el-descriptions>
            </div>
          </details>

          <details class="editor-section collapsible-section" open>
            <summary>基础编辑</summary>
            <div class="collapsible-body">
              <el-form label-position="top">
                <el-form-item label="Type">
                  <el-input v-model="nodeTypeText" @input="markEditorDirty" />
                </el-form-item>
                <el-form-item label="标题">
                  <el-input v-model="nodeTitleText" @input="markEditorDirty" />
                </el-form-item>
                <el-form-item label="描述">
                  <el-input v-model="nodeDescText" type="textarea" :rows="2" @input="markEditorDirty" />
                </el-form-item>
              </el-form>
              <div class="editor-actions">
                <el-button :icon="CircleCheck" @click="applySelectedDraft">应用节点</el-button>
              </div>
            </div>
          </details>

          <details class="editor-section collapsible-section" open>
            <summary>位置</summary>
            <div class="collapsible-body position-editor">
              <el-form label-position="top">
                <el-row :gutter="8">
                  <el-col :span="12">
                    <el-form-item label="X">
                      <el-input-number v-model="nodeX" :step="20" controls-position="right" @change="applyNodePosition" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="Y">
                      <el-input-number v-model="nodeY" :step="20" controls-position="right" @change="applyNodePosition" />
                    </el-form-item>
                  </el-col>
                </el-row>
              </el-form>
            </div>
          </details>

          <details v-if="selectedNode.nodeType === 'loop'" class="editor-section collapsible-section" open>
            <summary>循环分组</summary>
            <div class="collapsible-body loop-editor-form">
              <el-form label-position="top">
                <el-form-item label="Mode">
                  <el-input v-model="loopModeText" @input="markEditorDirty" />
                </el-form-item>
                <el-row :gutter="8">
                  <el-col :span="12">
                    <el-form-item label="Max Loop Count">
                      <el-input-number
                        v-model="loopMaxCountValue"
                        :min="1"
                        :step="1"
                        controls-position="right"
                        @change="markEditorDirty"
                      />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="Exit Node">
                      <el-input v-model="loopExitNodeText" @input="markEditorDirty" />
                    </el-form-item>
                  </el-col>
                </el-row>
              </el-form>
              <div class="editor-actions">
                <el-button :icon="CircleCheck" @click="applyLoopEditorToSelected">应用循环配置</el-button>
              </div>
            </div>
          </details>

          <details v-if="selectedNode.isSingleModelEditTool" class="editor-section collapsible-section" open>
            <summary>single_model_edit 工具</summary>
            <div class="collapsible-body node-editor-form">
              <el-form label-position="top">
                <el-form-item label="Model JSON">
                  <el-input
                    v-model="modelJsonText"
                    class="model-json-input"
                    type="textarea"
                    :rows="18"
                    spellcheck="false"
                    @input="markEditorDirty"
                  />
                </el-form-item>
              </el-form>
              <el-alert v-if="modelJsonError" :title="modelJsonError" type="error" :closable="false" />
              <div class="editor-actions">
                <el-button :icon="CircleCheck" @click="applyEditorToSelected">应用工具节点</el-button>
              </div>
            </div>
          </details>

          <details class="editor-section collapsible-section">
            <summary>危险操作</summary>
            <div class="collapsible-body danger-actions">
              <el-button type="danger" :icon="Delete" @click="deleteSelectedNode">删除节点</el-button>
            </div>
          </details>
        </template>
      </aside>
    </div>

    <el-dialog v-model="createDialogVisible" title="新建工作流设计稿" width="460px">
      <el-form label-position="top">
        <el-form-item label="Workflow ID">
          <el-input v-model="createForm.workflowId" />
        </el-form-item>
        <el-form-item label="名称">
          <el-input v-model="createForm.title" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="createDesign">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="nodeCreateDialogVisible" title="新增节点" width="520px">
      <el-form label-position="top">
        <el-form-item label="目标分区">
          <el-input v-model="nodeCreateForm.graphKey" disabled />
        </el-form-item>
        <el-form-item label="节点类型">
          <select v-model="nodeCreateForm.nodeKind" class="native-select" @change="syncNodeCreateKindDefaults">
            <option value="tool">single_model_edit 工具</option>
            <option value="loop">循环分组</option>
            <option value="start">Start</option>
            <option value="end">End</option>
            <option value="exit-loop">Exit Loop</option>
            <option value="custom">Custom</option>
          </select>
        </el-form-item>
        <el-form-item label="节点 ID">
          <el-input v-model="nodeCreateForm.id" />
        </el-form-item>
        <el-form-item label="标题">
          <el-input v-model="nodeCreateForm.title" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="nodeCreateForm.desc" type="textarea" :rows="2" />
        </el-form-item>
        <template v-if="nodeCreateForm.nodeKind === 'tool'">
          <el-row :gutter="8">
            <el-col :span="12">
              <el-form-item label="Phase ID">
                <el-input v-model="nodeCreateForm.phaseId" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="Section Path">
                <el-input v-model="nodeCreateForm.sectionPath" />
              </el-form-item>
            </el-col>
          </el-row>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="nodeCreateDialogVisible = false">取消</el-button>
        <el-button type="primary" :icon="DocumentAdd" @click="createNodeInSelectedGraph">创建节点</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * @description 工作流设计稿可视化编辑页。将 Dify-like graph 中的 single_model_edit tool node 映射成节点编辑器，并通过后端文件 API 保存 design.json。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import {
  ConnectionLineType,
  ConnectionMode,
  Handle,
  MarkerType,
  Position,
  VueFlow,
  type Connection,
  type DefaultEdgeOptions,
  type Edge,
  type EdgeMouseEvent,
  type EdgeUpdateEvent,
  type Node,
  type NodeDragEvent,
  type NodeMouseEvent,
  type ViewportTransform,
} from '@vue-flow/core'
import { MiniMap } from '@vue-flow/minimap'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import {
  CircleCheck,
  Delete,
  DocumentAdd,
  DocumentCopy,
  FolderOpened,
  Refresh,
  Share,
  Upload,
} from '@element-plus/icons-vue'
import {
  addWorkflowDesignEdge,
  collectWorkflowDesignNodes,
  collectWorkflowDesignEdges,
  collectWorkflowDesignGraphs,
  createWorkflowDesign,
  createWorkflowDesignNode,
  deleteWorkflowDesign,
  formatJson,
  getSingleModelEditValue,
  listWorkflowDesigns,
  markWorkflowDesignDirty,
  markWorkflowDesignSaved,
  readWorkflowDesign,
  removeWorkflowDesignEdge,
  removeWorkflowDesignNode,
  saveWorkflowDesign,
  setSingleModelEditValue,
  updateWorkflowDesignEdge,
  type WorkflowDesignDocument,
  type WorkflowDesignEdgeView,
  type WorkflowDesignGraphView,
  type WorkflowDesignNodeView,
  type WorkflowDesignNodeCreateKind,
  type WorkflowDesignSummary,
} from '@/services/workflow-designs'

type LayoutResizeState = {
  side: 'left' | 'right'
  startClientX: number
  startLeftWidth: number
  startRightWidth: number
}

type GraphResizeState = {
  scopePath: string
  graph: WorkflowDesignGraphView['graph']
  startClientX: number
  startClientY: number
  startWidth: number
  startHeight: number
  moved: boolean
}

type WorkflowFlowNodeData = {
  viewKey: string
  id: string
  title: string
  nodeType: string
  scopePath: string
  phaseId?: string
  sectionPath?: string
  isSingleModelEditTool: boolean
}

type WorkflowFlowEdgeData = {
  edgeKey: string
  scopePath: string
}

type WorkflowFlowNode = Node<WorkflowFlowNodeData, Record<string, never>, 'workflow'>
type WorkflowFlowEdge = Edge<WorkflowFlowEdgeData>

type NodeCreateForm = {
  graphKey: string
  nodeKind: WorkflowDesignNodeCreateKind
  id: string
  title: string
  desc: string
  phaseId: string
  sectionPath: string
}

const NODE_WIDTH = 190
const NODE_HEIGHT = 116
const ROOT_NODE_HEIGHT = 92
const MIN_LEFT_PANEL_WIDTH = 220
const MAX_LEFT_PANEL_WIDTH = 480
const MIN_RIGHT_PANEL_WIDTH = 300
const MAX_RIGHT_PANEL_WIDTH = 560
const MIN_GRAPH_REGION_WIDTH = 420
const MIN_GRAPH_REGION_HEIGHT = 220

const designs = ref<WorkflowDesignSummary[]>([])
const currentWorkflowId = ref('')
const currentTimestamp = ref('')
const currentDocument = ref<WorkflowDesignDocument | null>(null)
const selectedNodeKey = ref('')
const selectedEdgeKey = ref('')
const layoutResizeState = ref<LayoutResizeState | null>(null)
const graphResizeState = ref<GraphResizeState | null>(null)
const leftPanelWidth = ref(280)
const rightPanelWidth = ref(360)

const loadingList = ref(false)
const opening = ref(false)
const saving = ref(false)
const creating = ref(false)
const createDialogVisible = ref(false)
const nodeCreateDialogVisible = ref(false)
const editorDirty = ref(false)

const nodeTypeText = ref('')
const nodeTitleText = ref('')
const nodeDescText = ref('')
const modelJsonText = ref('{}')
const modelJsonError = ref('')
const nodeX = ref(0)
const nodeY = ref(0)
const loopModeText = ref('')
const loopMaxCountValue = ref(10)
const loopExitNodeText = ref('')
const edgeSourceText = ref('')
const edgeTargetText = ref('')
const edgeTypeText = ref('')
const edgeSourceHandleText = ref('')
const edgeTargetHandleText = ref('')
const edgeRelationText = ref('')

const createForm = ref({
  workflowId: '',
  title: '',
})

const nodeCreateForm = ref<NodeCreateForm>({
  graphKey: '',
  nodeKind: 'tool',
  id: '',
  title: '',
  desc: '',
  phaseId: '',
  sectionPath: '',
})

const allNodes = computed(() => currentDocument.value === null ? [] : collectWorkflowDesignNodes(currentDocument.value))
const graphViews = computed(() => currentDocument.value === null ? [] : collectWorkflowDesignGraphs(currentDocument.value))
const edgeViews = computed(() => currentDocument.value === null ? [] : collectWorkflowDesignEdges(currentDocument.value))
const singleModelNodes = computed(() => allNodes.value.filter(node => node.isSingleModelEditTool))
const selectedNode = computed(() => allNodes.value.find(node => node.key === selectedNodeKey.value) ?? null)
const selectedEdge = computed(() => edgeViews.value.find(edge => edge.key === selectedEdgeKey.value) ?? null)
const selectedEdgeGraphNodes = computed(() => {
  const edge = selectedEdge.value
  if (edge === null) return []
  return allNodes.value.filter(node => node.graph === edge.graph)
})
const workflowShellStyle = computed<CSSProperties>(() => ({
  gridTemplateColumns: `${leftPanelWidth.value}px 12px minmax(520px, 1fr) 12px ${rightPanelWidth.value}px`,
}))
const flowDefaultEdgeOptions: DefaultEdgeOptions = {
  type: ConnectionLineType.SmoothStep,
  markerEnd: MarkerType.ArrowClosed,
  interactionWidth: 18,
  updatable: true,
}
const canSave = computed(() => currentDocument.value !== null && currentWorkflowId.value.length > 0 && !opening.value)
const draftStatus = computed(() => {
  const status = currentDocument.value?.x_spark.draft?.['status']
  return typeof status === 'string' ? status : 'draft'
})
const hasUnsavedChanges = computed(() => draftStatus.value === 'dirty' || editorDirty.value)

watch(
  () => selectedNode.value?.key ?? '',
  () => syncEditorFromSelected(),
  { immediate: true },
)

watch(
  () => selectedEdge.value?.key ?? '',
  () => syncEdgeEditorFromSelected(),
  { immediate: true },
)

onMounted(async () => {
  await loadDesigns()
  if (designs.value.length > 0 && currentWorkflowId.value.length === 0) {
    await openDesign(designs.value[0]?.workflowId ?? '')
  }
})

onBeforeUnmount(() => {
  stopLayoutResize()
  stopGraphResize()
})

async function loadDesigns(): Promise<void> {
  loadingList.value = true
  try {
    designs.value = await listWorkflowDesigns()
  } catch (error: unknown) {
    ElMessage.error(`加载工作流设计稿失败: ${errorMessage(error)}`)
  } finally {
    loadingList.value = false
  }
}

async function openDesign(workflowId: string): Promise<void> {
  const normalizedWorkflowId = workflowId.trim()
  if (normalizedWorkflowId.length === 0) return
  if (normalizedWorkflowId !== currentWorkflowId.value && !await confirmDiscardEditorDraft()) return

  opening.value = true
  try {
    const result = await readWorkflowDesign(normalizedWorkflowId)
    if (result.document === undefined) {
      ElMessage.info('设计稿未变化')
      return
    }
    currentWorkflowId.value = normalizedWorkflowId
    currentTimestamp.value = result.timestamp
    currentDocument.value = result.document
    selectedEdgeKey.value = ''
    selectedNodeKey.value = collectWorkflowDesignNodes(result.document).find(node => node.isSingleModelEditTool)?.key
      ?? collectWorkflowDesignNodes(result.document)[0]?.key
      ?? ''
  } catch (error: unknown) {
    ElMessage.error(`打开失败: ${errorMessage(error)}`)
  } finally {
    opening.value = false
  }
}

function openCreateDialog(): void {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
  createForm.value = {
    workflowId: `agent.workflow.${stamp}`,
    title: 'Agent Workflow',
  }
  createDialogVisible.value = true
}

async function createDesign(): Promise<void> {
  const workflowId = createForm.value.workflowId.trim()
  const title = createForm.value.title.trim()
  if (workflowId.length === 0) {
    ElMessage.warning('请输入 Workflow ID')
    return
  }
  creating.value = true
  try {
    await createWorkflowDesign({ workflowId, title: title || workflowId })
    createDialogVisible.value = false
    await loadDesigns()
    await openDesign(workflowId)
    ElMessage.success('设计稿已创建')
  } catch (error: unknown) {
    ElMessage.error(`创建失败: ${errorMessage(error)}`)
  } finally {
    creating.value = false
  }
}

async function deleteDesign(workflowId: string): Promise<void> {
  const normalizedWorkflowId = workflowId.trim()
  if (normalizedWorkflowId.length === 0) return
  try {
    await ElMessageBox.confirm(`确定删除「${normalizedWorkflowId}」？`, '删除设计稿', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    await deleteWorkflowDesign(normalizedWorkflowId)
    if (currentWorkflowId.value === normalizedWorkflowId) {
      currentWorkflowId.value = ''
      currentTimestamp.value = ''
      currentDocument.value = null
      selectedNodeKey.value = ''
      selectedEdgeKey.value = ''
    }
    await loadDesigns()
    ElMessage.success('设计稿已删除')
  } catch (error: unknown) {
    if (error !== 'cancel') ElMessage.error(`删除失败: ${errorMessage(error)}`)
  }
}

function openNodeCreateDialog(graphView: WorkflowDesignGraphView, nodeKind: WorkflowDesignNodeCreateKind): void {
  if (editorDirty.value && !applySelectedDraft({ silent: false })) return
  const phaseIndex = singleModelNodes.value.length
  nodeCreateForm.value = {
    graphKey: graphView.key,
    nodeKind,
    id: defaultCreateNodeId(nodeKind, phaseIndex),
    title: defaultCreateNodeTitle(nodeKind, phaseIndex),
    desc: '',
    phaseId: nodeKind === 'tool' ? `F${phaseIndex}` : '',
    sectionPath: nodeKind === 'tool' ? `factory.custom${phaseIndex}` : '',
  }
  nodeCreateDialogVisible.value = true
}

function syncNodeCreateKindDefaults(): void {
  const phaseIndex = singleModelNodes.value.length
  const form = nodeCreateForm.value
  form.id = defaultCreateNodeId(form.nodeKind, phaseIndex)
  form.title = defaultCreateNodeTitle(form.nodeKind, phaseIndex)
  form.phaseId = form.nodeKind === 'tool' ? `F${phaseIndex}` : ''
  form.sectionPath = form.nodeKind === 'tool' ? `factory.custom${phaseIndex}` : ''
}

function createNodeInSelectedGraph(): void {
  const document = currentDocument.value
  if (document === null) return
  const form = nodeCreateForm.value
  const graphView = graphViews.value.find(view => view.key === form.graphKey)
  if (graphView === undefined) {
    ElMessage.warning('请选择有效的 graph/subGraph')
    return
  }

  const node = createWorkflowDesignNode(graphView.graph, {
    nodeKind: form.nodeKind,
    id: form.id.trim(),
    title: form.title.trim(),
    desc: form.desc.trim(),
    phaseId: form.phaseId.trim(),
    sectionPath: form.sectionPath.trim(),
  })
  markWorkflowDesignDirty(document, `${graphView.scopePath}.nodes`)
  nodeCreateDialogVisible.value = false
  selectedEdgeKey.value = ''
  selectedNodeKey.value = `${graphView.scopePath}:${node.id}`
  ElMessage.success('节点已创建')
}

async function deleteSelectedNode(): Promise<void> {
  const view = selectedNode.value
  const document = currentDocument.value
  if (view === null || document === null) return
  if (view.isSingleModelEditTool && singleModelNodes.value.length <= 1) {
    ElMessage.warning('至少保留一个 single_model_edit 工具节点')
    return
  }

  try {
    await ElMessageBox.confirm(`确定删除节点「${view.title}」？相关连线会一并删除。`, '删除节点', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }

  const result = removeWorkflowDesignNode(view.graph, view.id)
  if (!result.removed) return
  markWorkflowDesignDirty(document, `${view.scopePath}.nodes`)
  if (result.removedEdges.length > 0) markWorkflowDesignDirty(document, `${view.scopePath}.edges`)
  selectedNodeKey.value = ''
  selectedEdgeKey.value = ''
  editorDirty.value = false
  ElMessage.success('节点已删除')
}

function startLayoutResize(event: PointerEvent, side: 'left' | 'right'): void {
  layoutResizeState.value = {
    side,
    startClientX: event.clientX,
    startLeftWidth: leftPanelWidth.value,
    startRightWidth: rightPanelWidth.value,
  }
  window.document.addEventListener('pointermove', handleLayoutResizeMove)
  window.document.addEventListener('pointerup', stopLayoutResize, { once: true })
}

function handleLayoutResizeMove(event: PointerEvent): void {
  const state = layoutResizeState.value
  if (state === null) return
  const deltaX = event.clientX - state.startClientX
  if (state.side === 'left') {
    leftPanelWidth.value = clamp(state.startLeftWidth + deltaX, MIN_LEFT_PANEL_WIDTH, MAX_LEFT_PANEL_WIDTH)
  } else {
    rightPanelWidth.value = clamp(state.startRightWidth - deltaX, MIN_RIGHT_PANEL_WIDTH, MAX_RIGHT_PANEL_WIDTH)
  }
  event.preventDefault()
}

function stopLayoutResize(): void {
  window.document.removeEventListener('pointermove', handleLayoutResizeMove)
  window.document.removeEventListener('pointerup', stopLayoutResize)
  layoutResizeState.value = null
}

function selectNode(key: string): void {
  if (key === selectedNodeKey.value) return
  if (editorDirty.value && !applySelectedDraft({ silent: false })) return
  selectedEdgeKey.value = ''
  selectedNodeKey.value = key
}

function selectEdge(key: string): void {
  if (editorDirty.value && !applySelectedDraft({ silent: false })) return
  selectedNodeKey.value = ''
  selectedEdgeKey.value = key
}

function defaultCreateNodeId(nodeKind: WorkflowDesignNodeCreateKind, phaseIndex: number): string {
  if (nodeKind === 'tool') return `phase.F${phaseIndex}`
  if (nodeKind === 'loop') return 'loop.group'
  if (nodeKind === 'start') return 'start'
  if (nodeKind === 'end') return 'end'
  if (nodeKind === 'exit-loop') return 'loop.exit'
  return 'node.custom'
}

function defaultCreateNodeTitle(nodeKind: WorkflowDesignNodeCreateKind, phaseIndex: number): string {
  if (nodeKind === 'tool') return `Single Model Edit F${phaseIndex}`
  if (nodeKind === 'loop') return 'Loop Group'
  if (nodeKind === 'start') return 'Start'
  if (nodeKind === 'end') return 'End'
  if (nodeKind === 'exit-loop') return 'Exit Loop'
  return 'Custom Node'
}

function nodesForGraph(graphView: WorkflowDesignGraphView): WorkflowDesignNodeView[] {
  return allNodes.value.filter(node => node.graph === graphView.graph)
}

function edgesForGraph(graphView: WorkflowDesignGraphView): WorkflowDesignEdgeView[] {
  return edgeViews.value.filter(edge => edge.graph === graphView.graph)
}

function flowId(graphView: WorkflowDesignGraphView): string {
  return `workflow-flow-${graphView.key.replace(/[^\w-]/gu, '-')}`
}

function flowNodesForGraph(graphView: WorkflowDesignGraphView): WorkflowFlowNode[] {
  return nodesForGraph(graphView).map((view) => {
    const dimensions = nodeDimensions(view)
    return {
      id: view.id,
      type: 'workflow',
      position: nodePosition(view),
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
      draggable: true,
      selectable: true,
      connectable: true,
      width: dimensions.width,
      height: dimensions.height,
      data: createFlowNodeData(view),
    }
  })
}

function flowEdgesForGraph(graphView: WorkflowDesignGraphView): WorkflowFlowEdge[] {
  return edgesForGraph(graphView).map((edge) => {
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: typeof edge.edge.sourceHandle === 'string' ? edge.edge.sourceHandle : 'source',
      targetHandle: typeof edge.edge.targetHandle === 'string' ? edge.edge.targetHandle : 'target',
      selectable: true,
      data: {
        edgeKey: edge.key,
        scopePath: edge.scopePath,
      },
    }
  })
}

function createFlowNodeData(view: WorkflowDesignNodeView): WorkflowFlowNodeData {
  return {
    viewKey: view.key,
    id: view.id,
    title: view.title,
    nodeType: view.nodeType,
    scopePath: view.scopePath,
    isSingleModelEditTool: view.isSingleModelEditTool,
    ...(view.phaseId !== undefined ? { phaseId: view.phaseId } : {}),
    ...(view.sectionPath !== undefined ? { sectionPath: view.sectionPath } : {}),
  }
}

function flowNodeClass(data: WorkflowFlowNodeData, selected: boolean): Record<string, boolean> {
  return {
    'is-selected': selected || selectedNodeKey.value === data.viewKey,
    'is-tool': data.isSingleModelEditTool,
    'is-loop': data.nodeType === 'loop',
    'is-exit': data.nodeType === 'exit-loop',
  }
}

function flowDefaultViewport(graphView: WorkflowDesignGraphView): ViewportTransform {
  const viewport = graphView.graph.viewport
  return {
    x: typeof viewport?.x === 'number' && Number.isFinite(viewport.x) ? viewport.x : 0,
    y: typeof viewport?.y === 'number' && Number.isFinite(viewport.y) ? viewport.y : 0,
    zoom: typeof viewport?.zoom === 'number' && Number.isFinite(viewport.zoom) ? viewport.zoom : 1,
  }
}

function flowShellStyle(
  graphView: WorkflowDesignGraphView,
  nodes: readonly WorkflowDesignNodeView[],
): CSSProperties {
  const contentSize = flowShellSize(nodes)
  const width = readGraphViewportNumber(graphView, 'uiWidth')
  const height = readGraphViewportNumber(graphView, 'uiHeight') ?? contentSize.height
  return {
    ...(width !== undefined ? { width: `${width}px` } : {}),
    height: `${Math.max(MIN_GRAPH_REGION_HEIGHT, height)}px`,
  }
}

function flowShellSize(nodes: readonly WorkflowDesignNodeView[]): { width: number; height: number } {
  const maxX = Math.max(760, ...nodes.map(node => nodePosition(node).x + nodeDimensions(node).width + 80))
  const maxY = Math.max(260, ...nodes.map(node => nodePosition(node).y + nodeDimensions(node).height + 80))
  return { width: maxX, height: maxY }
}

function readGraphViewportNumber(graphView: WorkflowDesignGraphView, key: string): number | undefined {
  const value = graphView.graph.viewport?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function startGraphResize(event: PointerEvent, graphView: WorkflowDesignGraphView): void {
  if (editorDirty.value && !applySelectedDraft({ silent: false })) return
  const shell = (event.currentTarget as HTMLElement | null)?.closest('.workflow-flow-shell')
  const contentSize = flowShellSize(nodesForGraph(graphView))
  const measuredWidth = shell instanceof HTMLElement && shell.clientWidth > 0 ? shell.clientWidth : contentSize.width
  const measuredHeight = shell instanceof HTMLElement && shell.clientHeight > 0 ? shell.clientHeight : contentSize.height
  graphResizeState.value = {
    scopePath: graphView.scopePath,
    graph: graphView.graph,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startWidth: measuredWidth,
    startHeight: measuredHeight,
    moved: false,
  }
  window.document.addEventListener('pointermove', handleGraphResizeMove)
  window.document.addEventListener('pointerup', handleGraphResizeEnd, { once: true })
}

function handleGraphResizeMove(event: PointerEvent): void {
  const state = graphResizeState.value
  if (state === null) return
  const deltaX = event.clientX - state.startClientX
  const deltaY = event.clientY - state.startClientY
  if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) state.moved = true
  state.graph.viewport ??= {}
  state.graph.viewport['uiWidth'] = clamp(state.startWidth + deltaX, MIN_GRAPH_REGION_WIDTH, 2200)
  state.graph.viewport['uiHeight'] = clamp(state.startHeight + deltaY, MIN_GRAPH_REGION_HEIGHT, 1800)
  event.preventDefault()
}

function handleGraphResizeEnd(): void {
  const state = graphResizeState.value
  if (state?.moved === true && currentDocument.value !== null) {
    markWorkflowDesignDirty(currentDocument.value, `${state.scopePath}.viewport`)
  }
  stopGraphResize()
}

function stopGraphResize(): void {
  window.document.removeEventListener('pointermove', handleGraphResizeMove)
  window.document.removeEventListener('pointerup', handleGraphResizeEnd)
  graphResizeState.value = null
}

function nodePosition(view: WorkflowDesignNodeView): { x: number; y: number } {
  const position = view.node.position
  return {
    x: typeof position?.x === 'number' && Number.isFinite(position.x) ? position.x : 0,
    y: typeof position?.y === 'number' && Number.isFinite(position.y) ? position.y : 0,
  }
}

function nodeDimensions(view: WorkflowDesignNodeView): { width: number; height: number } {
  if (view.depth === 0 && view.nodeType !== 'loop') return { width: NODE_WIDTH, height: ROOT_NODE_HEIGHT }
  return { width: NODE_WIDTH, height: NODE_HEIGHT }
}

function handleFlowNodeClick(event: NodeMouseEvent): void {
  const data = event.node.data as WorkflowFlowNodeData
  selectNode(data.viewKey)
}

function handleFlowEdgeClick(event: EdgeMouseEvent): void {
  const data = event.edge.data as WorkflowFlowEdgeData
  selectEdge(data.edgeKey)
}

function handleFlowNodeDragStop(event: NodeDragEvent): void {
  const data = event.node.data as WorkflowFlowNodeData
  const view = allNodes.value.find(node => node.key === data.viewKey)
  const document = currentDocument.value
  if (view === undefined || document === null) return

  const nextX = Math.max(0, Math.round(event.node.position.x / 10) * 10)
  const nextY = Math.max(0, Math.round(event.node.position.y / 10) * 10)
  view.node.position ??= {}
  view.node.position.x = nextX
  view.node.position.y = nextY
  selectedEdgeKey.value = ''
  selectedNodeKey.value = view.key
  nodeX.value = nextX
  nodeY.value = nextY
  markWorkflowDesignDirty(document, `${view.scopePath}.${view.id}.position`)
}

function handleFlowConnect(connection: Connection, graphView: WorkflowDesignGraphView): void {
  const document = currentDocument.value
  if (document === null) return
  const source = connection.source.trim()
  const target = connection.target.trim()
  if (source.length === 0 || target.length === 0) {
    ElMessage.warning('连线必须包含 Source 和 Target')
    return
  }
  if (source === target) {
    ElMessage.warning('不能连接节点自身')
    return
  }
  const existing = graphView.graph.edges.find(edge => edge.source === source && edge.target === target)
  if (existing !== undefined) {
    selectedNodeKey.value = ''
    selectedEdgeKey.value = workflowEdgeKey(graphView, existing)
    ElMessage.info('连线已存在')
    return
  }

  const edge = addWorkflowDesignEdge(graphView.graph, source, target)
  updateWorkflowDesignEdge(edge, {
    sourceHandle: connection.sourceHandle ?? 'source',
    targetHandle: connection.targetHandle ?? 'target',
  })
  markWorkflowDesignDirty(document, `${graphView.scopePath}.edges`)
  selectedNodeKey.value = ''
  selectedEdgeKey.value = workflowEdgeKey(graphView, edge)
  ElMessage.success('连线已创建')
}

function handleFlowEdgeUpdate(event: EdgeUpdateEvent, graphView: WorkflowDesignGraphView): void {
  const document = currentDocument.value
  if (document === null) return
  const data = event.edge.data as WorkflowFlowEdgeData
  const edge = edgeViews.value.find(item => item.key === data.edgeKey)
  if (edge === undefined || edge.graph !== graphView.graph) return

  const source = event.connection.source.trim()
  const target = event.connection.target.trim()
  if (!validateEdgeEndpointPatch(edge, source, target, { silent: false })) return

  updateWorkflowDesignEdge(edge.edge, {
    source,
    target,
    sourceHandle: event.connection.sourceHandle ?? 'source',
    targetHandle: event.connection.targetHandle ?? 'target',
  })
  markWorkflowDesignDirty(document, `${edge.scopePath}.edges`)
  selectedNodeKey.value = ''
  selectedEdgeKey.value = edge.key
  edgeSourceText.value = source
  edgeTargetText.value = target
  edgeSourceHandleText.value = event.connection.sourceHandle ?? 'source'
  edgeTargetHandleText.value = event.connection.targetHandle ?? 'target'
  editorDirty.value = false
  ElMessage.success('连线端点已更新')
}

function workflowEdgeKey(
  graphView: WorkflowDesignGraphView,
  edge: WorkflowDesignEdgeView['edge'],
): string {
  const index = graphView.graph.edges.indexOf(edge)
  const id = typeof edge.id === 'string' && edge.id.length > 0 ? edge.id : `edge.${index}`
  return `${graphView.scopePath}:${id}`
}

function loopMode(ownerNode: WorkflowDesignNodeView['node'] | undefined): string {
  const mode = ownerNode?.data?.loop?.mode
  return typeof mode === 'string' && mode.length > 0 ? mode : 'progressive'
}

function loopMaxCount(ownerNode: WorkflowDesignNodeView['node'] | undefined): number {
  const maxLoopCount = ownerNode?.data?.loop?.maxLoopCount
  return typeof maxLoopCount === 'number' && Number.isFinite(maxLoopCount) ? maxLoopCount : 1
}

function loopExitNodeId(ownerNode: WorkflowDesignNodeView['node'] | undefined): string {
  const exitNodeId = ownerNode?.data?.loop?.exitNodeId
  return typeof exitNodeId === 'string' && exitNodeId.length > 0 ? exitNodeId : '-'
}

function deleteSelectedEdge(): void {
  const edge = selectedEdge.value
  const document = currentDocument.value
  if (edge === null || document === null) return
  if (!removeWorkflowDesignEdge(edge.graph, edge.edge)) return
  markWorkflowDesignDirty(document, `${edge.scopePath}.edges`)
  selectedEdgeKey.value = ''
  ElMessage.success('连线已删除')
}

function validateEdgeEndpointPatch(
  edge: WorkflowDesignEdgeView,
  source: string,
  target: string,
  options: { silent?: boolean } = {},
): boolean {
  const nodeIds = new Set(allNodes.value.filter(node => node.graph === edge.graph).map(node => node.id))
  if (source.length === 0 || target.length === 0) {
    if (options.silent !== true) ElMessage.warning('连线必须填写 Source 和 Target')
    return false
  }
  if (!nodeIds.has(source) || !nodeIds.has(target)) {
    if (options.silent !== true) ElMessage.warning('Source/Target 必须是当前 graph/subGraph 内的节点')
    return false
  }
  if (source === target) {
    if (options.silent !== true) ElMessage.warning('连线不能指向节点自身')
    return false
  }
  const duplicated = edge.graph.edges.some(item => item !== edge.edge && item.source === source && item.target === target)
  if (duplicated) {
    if (options.silent !== true) ElMessage.warning('同一 graph/subGraph 内已存在相同 Source -> Target 连线')
    return false
  }
  return true
}

function applyEdgeEditorToSelected(options: { silent?: boolean } = {}): boolean {
  const edge = selectedEdge.value
  const document = currentDocument.value
  if (edge === null || document === null) return true

  const source = edgeSourceText.value.trim()
  const target = edgeTargetText.value.trim()
  if (!validateEdgeEndpointPatch(edge, source, target, options)) return false

  updateWorkflowDesignEdge(edge.edge, {
    source,
    target,
    sourceHandle: edgeSourceHandleText.value.trim() || 'source',
    targetHandle: edgeTargetHandleText.value.trim() || 'target',
    type: edgeTypeText.value.trim() || 'custom',
    relation: edgeRelationText.value.trim() || 'sequence',
  })
  markWorkflowDesignDirty(document, `${edge.scopePath}.edges`)
  editorDirty.value = false
  if (options.silent !== true) ElMessage.success('连线已更新')
  return true
}

function markEditorDirty(): void {
  editorDirty.value = true
  modelJsonError.value = ''
}

function syncEditorFromSelected(): void {
  const view = selectedNode.value
  editorDirty.value = false
  modelJsonError.value = ''
  if (view === null) {
    nodeTypeText.value = ''
    nodeTitleText.value = ''
    nodeDescText.value = ''
    modelJsonText.value = '{}'
    nodeX.value = 0
    nodeY.value = 0
    loopModeText.value = ''
    loopMaxCountValue.value = 10
    loopExitNodeText.value = ''
    return
  }
  const position = nodePosition(view)
  nodeX.value = position.x
  nodeY.value = position.y
  nodeTypeText.value = view.nodeType
  nodeTitleText.value = view.title
  nodeDescText.value = typeof view.node.data?.desc === 'string' ? view.node.data.desc : ''
  modelJsonText.value = view.isSingleModelEditTool ? formatJson(getSingleModelEditValue(view.node)) : '{}'
  loopModeText.value = loopMode(view.node)
  loopMaxCountValue.value = loopMaxCount(view.node)
  loopExitNodeText.value = loopExitNodeId(view.node) === '-' ? '' : loopExitNodeId(view.node)
}

function syncEdgeEditorFromSelected(): void {
  const edge = selectedEdge.value
  editorDirty.value = false
  modelJsonError.value = ''
  if (edge === null) {
    edgeSourceText.value = ''
    edgeTargetText.value = ''
    edgeTypeText.value = ''
    edgeSourceHandleText.value = ''
    edgeTargetHandleText.value = ''
    edgeRelationText.value = ''
    return
  }
  edgeSourceText.value = edge.source
  edgeTargetText.value = edge.target
  edgeTypeText.value = typeof edge.edge.type === 'string' ? edge.edge.type : 'custom'
  edgeSourceHandleText.value = typeof edge.edge.sourceHandle === 'string' ? edge.edge.sourceHandle : 'source'
  edgeTargetHandleText.value = typeof edge.edge.targetHandle === 'string' ? edge.edge.targetHandle : 'target'
  const relation = edge.edge.data?.['relation']
  edgeRelationText.value = typeof relation === 'string' ? relation : 'sequence'
}

function applyNodePosition(): void {
  const view = selectedNode.value
  const document = currentDocument.value
  if (view === null || document === null) return
  view.node.position ??= {}
  view.node.position.x = Number.isFinite(nodeX.value) ? nodeX.value : 0
  view.node.position.y = Number.isFinite(nodeY.value) ? nodeY.value : 0
  markWorkflowDesignDirty(document, `${view.scopePath}.${view.id}.position`)
}

function applyNodeBasicEditorToSelected(): boolean {
  const view = selectedNode.value
  const document = currentDocument.value
  if (view === null || document === null) return true
  view.node.data ??= {}
  view.node.data.type = nodeTypeText.value.trim() || view.nodeType || view.node.type || 'custom'
  view.node.data.title = nodeTitleText.value.trim() || view.id
  view.node.data.desc = nodeDescText.value.trim()
  markWorkflowDesignDirty(document, `${view.scopePath}.${view.id}.data`)
  return true
}

function applyEditorToSelected(options: { silent?: boolean } = {}): boolean {
  const view = selectedNode.value
  const document = currentDocument.value
  if (view === null || document === null || !view.isSingleModelEditTool) return true

  let parsed: unknown
  try {
    parsed = JSON.parse(modelJsonText.value.trim().length > 0 ? modelJsonText.value : '{}')
  } catch (error: unknown) {
    modelJsonError.value = `JSON 无效: ${errorMessage(error)}`
    if (options.silent !== true) ElMessage.warning(modelJsonError.value)
    return false
  }

  if (!isJsonObject(parsed)) {
    modelJsonError.value = 'Model JSON 必须是对象'
    if (options.silent !== true) ElMessage.warning(modelJsonError.value)
    return false
  }

  applyNodeBasicEditorToSelected()
  setSingleModelEditValue(view.node, parsed)
  markWorkflowDesignDirty(document, `${view.scopePath}.${view.id}.data.model.value`)
  editorDirty.value = false
  modelJsonError.value = ''
  if (options.silent !== true) ElMessage.success('已应用到节点')
  return true
}

function applyLoopEditorToSelected(options: { silent?: boolean } = {}): boolean {
  const view = selectedNode.value
  const document = currentDocument.value
  if (view === null || document === null || view.nodeType !== 'loop') return true
  applyNodeBasicEditorToSelected()
  view.node.data ??= {}
  view.node.data.loop ??= {}
  view.node.data.loop.mode = loopModeText.value.trim() || 'progressive'
  view.node.data.loop.maxLoopCount = Number.isFinite(loopMaxCountValue.value)
    ? Math.max(1, Math.trunc(loopMaxCountValue.value))
    : 1
  view.node.data.loop.exitNodeId = loopExitNodeText.value.trim() || 'loop.exit'
  markWorkflowDesignDirty(document, `${view.scopePath}.${view.id}.data.loop`)
  editorDirty.value = false
  if (options.silent !== true) ElMessage.success('循环配置已应用')
  return true
}

function applySelectedDraft(options: { silent?: boolean } = {}): boolean {
  if (selectedEdge.value !== null) return applyEdgeEditorToSelected(options)
  const view = selectedNode.value
  if (view === null) {
    editorDirty.value = false
    return true
  }
  if (view.isSingleModelEditTool) return applyEditorToSelected(options)
  if (view.nodeType === 'loop') return applyLoopEditorToSelected(options)
  applyNodeBasicEditorToSelected()
  editorDirty.value = false
  if (options.silent !== true) ElMessage.success('节点已更新')
  return true
}

async function saveCurrentDesign(): Promise<void> {
  const document = currentDocument.value
  if (document === null || currentWorkflowId.value.length === 0) return
  if (!applySelectedDraft({ silent: true })) return

  saving.value = true
  try {
    markWorkflowDesignSaved(document)
    const result = await saveWorkflowDesign(currentWorkflowId.value, document)
    currentTimestamp.value = result.timestamp
    editorDirty.value = false
    await loadDesigns()
    ElMessage.success('设计稿已保存')
  } catch (error: unknown) {
    ElMessage.error(`保存失败: ${errorMessage(error)}`)
  } finally {
    saving.value = false
  }
}

async function copyJson(): Promise<void> {
  if (currentDocument.value === null) return
  try {
    await navigator.clipboard.writeText(formatJson(currentDocument.value))
    ElMessage.success('JSON 已复制')
  } catch (error: unknown) {
    ElMessage.error(`复制失败: ${errorMessage(error)}`)
  }
}

async function confirmDiscardEditorDraft(): Promise<boolean> {
  if (!hasUnsavedChanges.value) return true
  try {
    await ElMessageBox.confirm('当前设计稿有未保存内容，继续会丢弃这些内容。', '切换设计稿', {
      type: 'warning',
      confirmButtonText: '继续',
      cancelButtonText: '取消',
    })
    editorDirty.value = false
    return true
  } catch {
    return false
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message
  return String(error)
}
</script>

<style scoped>
.workflow-design-page {
  min-height: 100%;
  padding: 16px;
  background: #f6f8fb;
}

.workflow-design-shell {
  display: grid;
  gap: 0;
  margin-top: 16px;
  min-height: calc(100vh - 132px);
}

.workflow-design-sidebar,
.workflow-design-canvas,
.workflow-design-editor {
  min-width: 0;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  background: #ffffff;
}

.workflow-design-sidebar,
.workflow-design-editor {
  padding: 12px;
  overflow: auto;
}

.layout-resize-handle {
  align-self: stretch;
  cursor: col-resize;
  background: transparent;
  transition: background 0.16s ease;
}

.layout-resize-handle:hover {
  background: linear-gradient(90deg, transparent 4px, #cbd5e1 4px, #cbd5e1 8px, transparent 8px);
}

.workflow-design-canvas {
  padding: 14px;
  overflow: auto;
}

.panel-heading,
.canvas-toolbar,
.section-label,
.workflow-list-meta,
.workflow-list-actions,
.document-title,
.document-stats {
  display: flex;
  align-items: center;
}

.panel-heading {
  justify-content: space-between;
  margin-bottom: 12px;
  color: #1f2937;
  font-weight: 650;
}

.workflow-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.workflow-list-item {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid #dbe3ee;
  border-radius: 8px;
  cursor: pointer;
  background: #ffffff;
  transition: border-color 0.16s ease, background 0.16s ease;
}

.workflow-list-item:hover,
.workflow-list-item.is-active {
  border-color: #0f766e;
  background: #eefaf7;
}

.workflow-list-main {
  display: grid;
  gap: 2px;
}

.workflow-list-main strong {
  overflow: hidden;
  color: #111827;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-list-main span,
.workflow-list-meta span,
.document-stats span {
  color: #64748b;
  font-size: 12px;
}

.workflow-list-meta,
.workflow-list-actions {
  justify-content: space-between;
  gap: 8px;
}

.canvas-toolbar {
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e5e7eb;
}

.document-title {
  min-width: 0;
  gap: 8px;
  color: #111827;
  font-weight: 700;
}

.document-title > span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-stats {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.graph-section {
  margin-bottom: 16px;
}

.collapsible-section > summary {
  list-style: none;
  cursor: pointer;
}

.collapsible-section > summary::-webkit-details-marker {
  display: none;
}

.collapsible-section > summary::before {
  content: "▸";
  flex: 0 0 auto;
  color: #64748b;
  transition: transform 0.16s ease;
}

.collapsible-section[open] > summary::before {
  transform: rotate(90deg);
}

.collapsible-body {
  min-width: 0;
}

.section-label {
  justify-content: flex-start;
  gap: 8px;
  margin-bottom: 10px;
  color: #334155;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.section-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.section-label-actions {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  margin-left: auto;
}

.loop-group-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: -2px 0 10px;
  color: #92400e;
  font-size: 12px;
}

.loop-group-meta span {
  padding: 3px 8px;
  border: 1px solid #fed7aa;
  border-radius: 999px;
  background: #fff7ed;
}

.workflow-flow-shell {
  position: relative;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fbfdff;
}

.graph-resize-handle {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  cursor: nwse-resize;
  background:
    linear-gradient(135deg, transparent 0 48%, #94a3b8 48% 55%, transparent 55%),
    linear-gradient(135deg, transparent 0 62%, #94a3b8 62% 69%, transparent 69%);
}

.workflow-flow {
  width: 100%;
  height: 100%;
  min-height: 260px;
}

.workflow-flow--subgraph {
  min-height: 520px;
}

.workflow-node {
  display: grid;
  align-content: start;
  min-width: 0;
  border: 1px solid #dbe3ee;
  border-radius: 8px;
  text-align: left;
  cursor: pointer;
  background: #ffffff;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
  width: 190px;
  min-height: 92px;
  padding: 12px;
  gap: 6px;
  cursor: grab;
  user-select: none;
}

.workflow-node:hover {
  border-color: #2563eb;
  box-shadow: 0 8px 20px rgb(15 23 42 / 8%);
  transform: translateY(-1px);
}

.workflow-node.is-selected {
  border-color: #0f766e;
  box-shadow: 0 0 0 2px rgb(15 118 110 / 18%);
}

.workflow-node.is-tool {
  background: #f4fbf9;
}

.workflow-node.is-loop {
  background: #fff7ed;
}

.workflow-node.is-exit {
  background: #f8fafc;
}

.node-kind,
.phase-badge,
.tool-name {
  width: fit-content;
  max-width: 100%;
  overflow: hidden;
  border-radius: 999px;
  color: #334155;
  font-size: 11px;
  font-weight: 700;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-kind,
.phase-badge {
  padding: 0 8px;
  background: #e8eef6;
}

.tool-name {
  padding: 0 7px;
  background: #dcfce7;
  color: #166534;
}

.workflow-node strong {
  overflow-wrap: anywhere;
  color: #111827;
  font-size: 14px;
  line-height: 18px;
}

.workflow-node small {
  overflow-wrap: anywhere;
  color: #64748b;
  font-size: 12px;
  line-height: 16px;
}

.editor-section {
  padding: 10px 0;
  border-top: 1px solid #e5e7eb;
}

.editor-section:first-of-type {
  border-top: 0;
  padding-top: 0;
}

.editor-section > summary {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 10px;
  color: #334155;
  font-size: 12px;
  font-weight: 700;
}

.node-editor-form {
  display: grid;
  gap: 10px;
}

.position-editor {
  margin-top: 0;
}

.loop-editor-form {
  display: grid;
  gap: 10px;
}

.editor-subtitle {
  color: #334155;
  font-size: 12px;
  font-weight: 700;
}

.position-editor :deep(.el-input-number) {
  width: 100%;
}

.native-select {
  width: 100%;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  color: #1f2937;
  background: #ffffff;
}

.model-json-input :deep(textarea) {
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.55;
}

.editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.split-actions {
  justify-content: space-between;
}

.danger-actions,
.edge-editor-actions {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 1180px) {
  .workflow-design-shell {
    grid-template-columns: 240px minmax(420px, 1fr);
  }

  .workflow-design-editor {
    grid-column: 1 / -1;
  }
}

@media (max-width: 820px) {
  .workflow-design-page {
    padding: 10px;
  }

  .workflow-design-shell {
    grid-template-columns: 1fr;
  }

  .workflow-flow-shell {
    max-width: calc(100vw - 20px);
  }
}
</style>
