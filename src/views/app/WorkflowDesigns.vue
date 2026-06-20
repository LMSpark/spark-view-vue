<!--
@module app:views/app/WorkflowDesigns
职责：提供工作流设计稿的可视化编辑入口，连接 Dify-like JSON graph、文件保存 API 与 workflow definition 发布。
边界：只处理设计态 JSON，不执行 Agent workflow 运行时。
AI用途：需要验证 workflow 编辑器如何配置业务节点、ClassModel model context 或步骤线投影时，用本页面定位。
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
        <el-button :icon="DocumentCopy" :loading="openingDefinition" :disabled="!canOpenDefinition" @click="openDefinitionEditor">
          Definition
        </el-button>
        <el-button type="success" :icon="Upload" :loading="saving" :disabled="!canSave" @click="saveCurrentDesign">
          保存
        </el-button>
        <el-button type="primary" :icon="Upload" :loading="publishing" :disabled="!canPublish" @click="publishCurrentDefinition">
          发布
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
            :class="{
              'is-active': item.workflowId === currentWorkflowId,
              'is-unreadable': isUnreadableDesign(item),
            }"
            :title="workflowDesignListItemTitle(item)"
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
              <el-tag size="small" :type="isUnreadableDesign(item) ? 'danger' : 'success'">
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
            <span>{{ currentDocument.workflow.id }}</span>
            <el-tag size="small">{{ currentDocument.kind }}</el-tag>
            <el-tag size="small" :type="hasUnsavedChanges ? 'warning' : 'success'">
              {{ hasUnsavedChanges ? '未保存' : '已保存' }}
            </el-tag>
          </div>
          <div class="document-stats">
            <span>节点 {{ allNodes.length }}</span>
            <span>业务节点 {{ businessNodes.length }}</span>
            <span v-if="currentTimestamp">ts {{ currentTimestamp }}</span>
          </div>
        </div>

        <el-empty v-if="currentDocument === null && !opening" description="选择或新建工作流" />
        <el-skeleton v-else-if="opening" :rows="12" animated />

        <template v-else-if="currentDocument">
          <section
            v-if="currentMainGraphView"
            class="graph-split"
            :class="{
              'is-top-collapsed': graphSplitCollapsed === 'top',
              'is-bottom-collapsed': graphSplitCollapsed === 'bottom' || currentChildGraphView === null,
            }"
            :style="graphSplitStyle"
          >
            <template v-for="panel in graphSplitPanels" :key="panel.key">
              <section
                class="graph-split-pane graph-section"
                :class="[
                  `graph-split-pane--${panel.role}`,
                  { 'is-collapsed': panel.collapsed },
                ]"
              >
                <button
                  v-if="panel.collapsed"
                  type="button"
                  class="graph-collapse-edge"
                  :title="panel.role === 'main' ? '主图已折叠' : '子图已折叠'"
                  @click="resetGraphSplit"
                />

                <template v-else-if="panel.graphView">
                  <div class="section-label graph-panel-label">
                    <span class="section-title">{{ graphPanelTitle(panel) }}</span>
                    <span class="section-label-actions" @click.stop>
                      <select
                        v-if="panel.role === 'child' && mainChildGraphOptions.length > 1"
                        v-model="currentChildGraphKey"
                        class="native-select graph-child-select"
                        title="选择下部子图"
                      >
                        <option v-for="child in mainChildGraphOptions" :key="child.key" :value="child.key">
                          {{ child.title }}
                        </option>
                      </select>
                      <el-tag v-if="panel.graphView.carrier === 'loop'" size="small" type="warning">循环分组</el-tag>
                      <el-tag size="small" type="info">节点 {{ nodesForGraph(panel.graphView).length }}</el-tag>
                      <el-tag size="small" type="info">连线 {{ edgesForGraph(panel.graphView).length }}</el-tag>
                      <el-button
                        v-if="panel.role === 'main' && currentMainParentGraphView"
                        link
                        size="small"
                        :icon="ArrowUp"
                        @click.stop.prevent="returnMainGraphToParent"
                      >
                        回父级
                      </el-button>
                      <el-button
                        v-if="panel.role === 'child'"
                        link
                        size="small"
                        :icon="ArrowDown"
                        @click.stop.prevent="promoteChildGraphToMain"
                      >
                        提升为 main
                      </el-button>
                      <el-button
                        link
                        size="small"
                        :icon="DocumentAdd"
                        @click.stop.prevent="openNodeCreateDialog(panel.graphView, 'node')"
                      >
                        加业务节点
                      </el-button>
                    </span>
                  </div>

                  <div class="graph-panel-body">
                    <div
                      v-if="panel.graphView.carrier === 'loop'"
                      class="loop-group-meta"
                      role="group"
                      aria-label="循环分组配置摘要"
                    >
                      <span>owner {{ panel.graphView.ownerNodeId }}</span>
                      <span>mode {{ panel.graphView.ownerNode?.data?.loop?.mode || 'progressive' }}</span>
                      <span>max {{ panel.graphView.ownerNode?.data?.loop?.maxLoopCount ?? 1 }}</span>
                      <span>exit {{ panel.graphView.ownerNode?.data?.loop?.exitNodeId || '-' }}</span>
                    </div>

                    <div class="workflow-flow-shell graph-panel-flow">
                      <VueFlow
                        :id="flowId(panel.graphView)"
                        class="workflow-flow"
                        :class="{ 'workflow-flow--subgraph': panel.graphView.carrier !== 'root' }"
                        :nodes="flowNodesForGraph(panel.graphView)"
                        :edges="flowEdgesForGraph(panel.graphView)"
                        :default-viewport="flowDefaultViewport(panel.graphView)"
                        :connection-mode="ConnectionMode.Strict"
                        :connection-line-type="ConnectionLineType.SmoothStep"
                        :default-edge-options="flowDefaultEdgeOptions"
                        :edges-updatable="true"
                        :delete-key-code="null"
                        :min-zoom="0.3"
                        :max-zoom="1.6"
                        @nodes-change="changes => handlePanelFlowNodesChange(changes, panel.graphView)"
                        @node-drag-stop="handleFlowNodeDragStop"
                        @edges-change="changes => handlePanelFlowEdgesChange(changes, panel.graphView)"
                        @edge-update="event => handlePanelFlowEdgeUpdate(event, panel.graphView)"
                        @connect="connection => handlePanelFlowConnect(connection, panel.graphView)"
                        @viewport-change-end="viewport => handlePanelFlowViewportChangeEnd(viewport, panel.graphView)"
                      >
                        <Background pattern-color="#dbe3ee" :gap="24" />
                        <Controls position="bottom-left" />
                        <MiniMap pannable zoomable />

                        <template #node-workflow="{ data, selected, id }">
                          <div class="workflow-node" :class="{
                            'is-selected': selected || selectedNodeKey === data.viewKey,
                            'is-business': data.isBusinessNode,
                            'is-boundary': data.isBoundaryNode,
                            'is-loop': data.nodeType === 'loop',
                          }">
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
                            <span class="node-kind">{{ data.nodeType }}</span>
                            <strong>{{ data.title }}</strong>
                            <small>{{ data.scopePath }} / {{ id }}</small>
                            <span v-if="data.isBusinessNode" class="tool-name">{{ data.modelClassName }}</span>
                            <span v-if="data.validationActionName" class="tool-name">{{ data.validationActionName }}</span>
                          </div>
                        </template>
                      </VueFlow>
                    </div>
                  </div>
                </template>
              </section>

              <div
                v-if="panel.role === 'main'"
                class="graph-splitter"
                title="拖拽调整上下图区域"
                role="separator"
                aria-orientation="horizontal"
                @pointerdown.prevent="startGraphSplitResize"
              >
                <span class="graph-splitter-line" />
                <span class="graph-splitter-actions" @pointerdown.stop>
                  <el-button
                    link
                    size="small"
                    :icon="ArrowUp"
                    :disabled="currentChildGraphView === null"
                    @click.stop.prevent="collapseGraphSplit('top')"
                  >
                    上折
                  </el-button>
                  <el-button link size="small" :icon="RefreshLeft" @click.stop.prevent="resetGraphSplit">
                    复位
                  </el-button>
                  <el-button link size="small" :icon="ArrowDown" @click.stop.prevent="collapseGraphSplit('bottom')">
                    下折
                  </el-button>
                </span>
                <span class="graph-splitter-line" />
              </div>
            </template>
          </section>
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
          <el-tag
            v-else-if="selectedNode"
            size="small"
            :type="selectedNode.isBusinessNode ? 'success' : selectedNode.isBoundaryNode ? 'info' : 'warning'"
          >
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
              <div class="editor-actions" style="justify-content: space-between">
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
                      <el-input-number v-model="nodeX" :step="20" controls-position="right" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="Y">
                      <el-input-number v-model="nodeY" :step="20" controls-position="right" />
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

          <details
            v-if="selectedNode.isBusinessNode"
            class="editor-section collapsible-section"
            open
          >
            <summary>ClassModel</summary>
            <div class="collapsible-body class-model-editor">
              <el-form label-position="top">
                <el-form-item label="Root Class">
                  <el-input v-model="modelRootClassText" @input="markEditorDirty" />
                </el-form-item>
                <el-form-item label="Model Class">
                  <select v-model="modelClassText" class="native-select" @change="handleModelClassSelectionChange">
                    <option :value="modelClassText">{{ modelClassText || '未绑定' }}</option>
                    <option v-for="item in classModelOptions" :key="item.kind" :value="item.kind">
                      {{ item.kind }}
                    </option>
                  </select>
                </el-form-item>
                <el-form-item label="Validation Class">
                  <el-input v-model="validationActionClassText" @input="markEditorDirty" />
                </el-form-item>
                <el-form-item label="Validation Action">
                  <select v-model="validationActionNameText" class="native-select" @change="markEditorDirty">
                    <option :value="validationActionNameText">{{ validationActionNameText || '未绑定' }}</option>
                    <option v-for="method in selectedClassModelMethods" :key="method.name" :value="method.name">
                      {{ method.name }}
                    </option>
                  </select>
                </el-form-item>
              </el-form>
              <el-alert v-if="classModelError" :title="classModelError" type="error" :closable="false" />
              <div v-if="selectedClassModelOption" class="class-model-catalog">
                <strong>{{ selectedClassModelOption.kind }}</strong>
                <span>attributes {{ selectedClassModelOption.attributes.length }}</span>
                <span>actions {{ selectedClassModelOption.methods.length }}</span>
              </div>
              <pre v-if="classModelGuideText" class="class-model-guide">{{ classModelGuideText }}</pre>
              <div class="editor-actions">
                <el-button :loading="classModelLoading" :icon="Refresh" @click="refreshClassModelOptions">
                  刷新知识
                </el-button>
                <el-button :loading="classModelLoading" :icon="DocumentCopy" @click="loadValidationActionGuide">
                  Action Guide
                </el-button>
                <el-button :icon="CircleCheck" @click="applyBusinessModelEditorToSelected">
                  应用模型绑定
                </el-button>
              </div>
            </div>
          </details>

          <details
            v-if="shouldEditNodeConfig(selectedNode)"
            class="editor-section collapsible-section"
            open
          >
            <summary>节点配置 JSON</summary>
            <div class="collapsible-body node-editor-form">
              <el-form label-position="top">
                <el-form-item label="data JSON">
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
                <el-button :icon="CircleCheck" @click="applyEditorToSelected">应用节点配置</el-button>
              </div>
            </div>
          </details>

          <details class="editor-section collapsible-section">
            <summary>危险操作</summary>
            <div class="collapsible-body editor-actions">
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
            <option value="node">Business Node</option>
            <option value="start">Start</option>
            <option value="output">Output</option>
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
      </el-form>
      <template #footer>
        <el-button @click="nodeCreateDialogVisible = false">取消</el-button>
        <el-button type="primary" :icon="DocumentAdd" @click="createNodeInSelectedGraph">创建节点</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-if="definitionDialogVisible"
      v-model="definitionDialogVisible"
      title="Agent Workflow Definition"
      width="760px"
    >
      <div class="definition-editor">
        <div class="definition-editor-meta">
          <span>{{ currentWorkflowId }}</span>
          <el-tag size="small">{{ definitionTimestamp ? `ts ${definitionTimestamp}` : 'local' }}</el-tag>
          <el-tag size="small" :type="definitionDirty ? 'warning' : 'success'">
            {{ definitionDirty ? '未保存' : '已保存' }}
          </el-tag>
        </div>
        <el-input
          v-model="definitionJsonText"
          class="definition-json-input"
          type="textarea"
          :rows="22"
          @input="markDefinitionDirty"
        />
      </div>
      <template #footer>
        <el-button @click="definitionDialogVisible = false">关闭</el-button>
        <el-button
          type="primary"
          :icon="Upload"
          :loading="savingDefinition"
          :disabled="!canSaveDefinition"
          @click="saveCurrentDefinition"
        >
          保存 Definition
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * @description 工作流设计稿可视化编辑页。编辑 Dify-like graph 中的业务节点和步骤线，并通过后端文件 API 保存 design.json。
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
  type EdgeChange,
  type EdgeUpdateEvent,
  type Node,
  type NodeChange,
  type NodeDragEvent,
  type ViewportTransform,
} from '@vue-flow/core'
import { MiniMap } from '@vue-flow/minimap'
import {
  createWorkerDtsClassModelKnowledgeProvider,
  type ClassModelKnowledgeProvider,
} from '@spark-appworks/spark-ai/class-model'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import {
  ArrowDown,
  ArrowUp,
  CircleCheck,
  Delete,
  DocumentAdd,
  DocumentCopy,
  FolderOpened,
  Refresh,
  RefreshLeft,
  Share,
  Upload,
} from '@element-plus/icons-vue'
import {
  addWorkflowDesignEdge,
  collectWorkflowDesignNodes,
  collectWorkflowDesignEdges,
  collectWorkflowDesignGraphs,
  createWorkflowDesign,
  createAgentWorkflowDefinitionFromDesign,
  createWorkflowDesignNode,
  deleteWorkflowDesign,
  formatJson,
  isWorkflowDefinitionNotFoundError,
  listWorkflowDesigns,
  markWorkflowDesignDirty,
  markWorkflowDesignSaved,
  parseAgentWorkflowDefinitionJson,
  publishWorkflowDefinition,
  readWorkflowDefinition,
  readWorkflowDesign,
  removeWorkflowDesignEdge,
  removeWorkflowDesignNode,
  saveWorkflowDefinition,
  saveWorkflowDesign,
  updateWorkflowDesignEdge,
  type WorkflowDesignDocument,
  type WorkflowDesignEdgeView,
  type WorkflowDesignGraphView,
  type WorkflowDesignNodeView,
  type WorkflowDesignNodeCreateKind,
  type WorkflowDesignSummary,
} from '@/services/workflow-designs'
import { getDtsClassModelManifestUrl } from '@/class-model-artifacts/artifact-urls'

type LayoutResizeState = {
  side: 'left' | 'right'
  startClientX: number
  startLeftWidth: number
  startRightWidth: number
}

type GraphSplitCollapse = 'top' | 'bottom' | null

type GraphSplitResizeState = {
  containerTop: number
  containerHeight: number
  moved: boolean
}

type GraphSplitPanel = {
  key: string
  role: 'main' | 'child'
  graphView: WorkflowDesignGraphView | null
  collapsed: boolean
}

type WorkflowFlowNodeData = {
  viewKey: string
  title: string
  nodeType: string
  scopePath: string
  isBusinessNode: boolean
  isBoundaryNode: boolean
  modelClassName: string
  validationActionName: string
}

type WorkflowFlowEdgeData = {
  edgeKey: string
}

type ClassModelMethodOption = {
  name: string
  summary: string
  signature: string
}

type ClassModelOption = {
  kind: string
  summary: string
  attributes: string[]
  methods: ClassModelMethodOption[]
}

type WorkflowFlowNode = Node<WorkflowFlowNodeData, Record<string, never>, 'workflow'>
type WorkflowFlowEdge = Edge<WorkflowFlowEdgeData>

type EdgeEndpointPatchValidationCommand = Readonly<{
  edge: WorkflowDesignEdgeView
  source: string
  target: string
  options: {
    silent?: boolean
  }
}>

type NodeCreateForm = {
  graphKey: string
  nodeKind: WorkflowDesignNodeCreateKind
  id: string
  title: string
  desc: string
}

const MIN_LEFT_PANEL_WIDTH = 220
const MAX_LEFT_PANEL_WIDTH = 480
const MIN_RIGHT_PANEL_WIDTH = 300
const MAX_RIGHT_PANEL_WIDTH = 560
const GRAPH_SPLIT_MIN_RATIO = 22
const GRAPH_SPLIT_MAX_RATIO = 78
const GRAPH_SPLIT_SNAP_RATIO = 12
const GRAPH_SPLIT_STORAGE_PREFIX = 'spark.workflow-design.graph-split.'
const UNREADABLE_WORKFLOW_DESIGN_STATUS = 'unreadable'
const UNREADABLE_WORKFLOW_DESIGN_FALLBACK_ERROR = '设计稿格式不兼容或文件不可读'

const designs = ref<WorkflowDesignSummary[]>([])
const currentWorkflowId = ref('')
const currentTimestamp = ref('')
const currentDocument = ref<WorkflowDesignDocument | null>(null)
const selectedNodeKey = ref('')
const selectedEdgeKey = ref('')
const layoutResizeState = ref<LayoutResizeState | null>(null)
const graphSplitResizeState = ref<GraphSplitResizeState | null>(null)
const leftPanelWidth = ref(280)
const rightPanelWidth = ref(360)
const currentMainGraphKey = ref('workflow.graph')
const currentChildGraphKey = ref('')
const graphSplitRatio = ref(48)
const graphSplitCollapsed = ref<GraphSplitCollapse>(null)

const loadingList = ref(false)
const opening = ref(false)
const saving = ref(false)
const publishing = ref(false)
const openingDefinition = ref(false)
const savingDefinition = ref(false)
const creating = ref(false)
const createDialogVisible = ref(false)
const nodeCreateDialogVisible = ref(false)
const definitionDialogVisible = ref(false)
const editorDirty = ref(false)
const definitionTimestamp = ref('')
const definitionJsonText = ref('{}')
const definitionDirty = ref(false)

const nodeTypeText = ref('')
const nodeTitleText = ref('')
const nodeDescText = ref('')
const modelJsonText = ref('{}')
const modelJsonError = ref('')
const modelRootClassText = ref('')
const modelClassText = ref('')
const validationActionClassText = ref('')
const validationActionNameText = ref('')
const classModelLoading = ref(false)
const classModelError = ref('')
const classModelGuideText = ref('')
const classModelOptions = ref<ClassModelOption[]>([])
const nodeX = computed({
  get: () => selectedNode.value?.node.position?.x ?? 0,
  set: (value: number) => { applyNodePosition(value, nodeY.value) },
})
const nodeY = computed({
  get: () => selectedNode.value?.node.position?.y ?? 0,
  set: (value: number) => { applyNodePosition(nodeX.value, value) },
})
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
  nodeKind: 'node',
  id: '',
  title: '',
  desc: '',
})

const allNodes = computed(() => currentDocument.value === null ? [] : collectWorkflowDesignNodes(currentDocument.value))
const graphViews = computed(() => currentDocument.value === null ? [] : collectWorkflowDesignGraphs(currentDocument.value))
const edgeViews = computed(() => currentDocument.value === null ? [] : collectWorkflowDesignEdges(currentDocument.value))
const businessNodes = computed(() => allNodes.value.filter(node => node.isBusinessNode))
const selectedNode = computed(() => allNodes.value.find(node => node.key === selectedNodeKey.value) ?? null)
const selectedEdge = computed(() => edgeViews.value.find(edge => edge.key === selectedEdgeKey.value) ?? null)
const selectedClassModelOption = computed(() => {
  return classModelOptions.value.find(item => item.kind === modelClassText.value.trim()) ?? null
})
const selectedClassModelMethods = computed(() => selectedClassModelOption.value?.methods ?? [])
const selectedEdgeGraphNodes = computed(() => {
  const edge = selectedEdge.value
  if (edge === null) return []
  return allNodes.value.filter(node => node.graph === edge.graph)
})
const workflowShellStyle = computed<CSSProperties>(() => ({
  gridTemplateColumns: `${leftPanelWidth.value}px 12px minmax(520px, 1fr) 12px ${rightPanelWidth.value}px`,
}))
const rootGraphView = computed(() => graphViews.value[0] ?? null)
const currentMainGraphView = computed(() => {
  return graphViews.value.find(view => view.key === currentMainGraphKey.value)
    ?? rootGraphView.value
})
const currentMainParentGraphView = computed(() => {
  const main = currentMainGraphView.value
  if (main === null || main.depth === 0) return null
  return graphViews.value.find((view) => {
    return view.depth === main.depth - 1 && main.scopePath.startsWith(`${view.scopePath}.`)
  }) ?? null
})
const mainChildGraphOptions = computed(() => {
  const main = currentMainGraphView.value
  if (main === null) return []
  return graphViews.value.filter((view) => {
    return view.depth === main.depth + 1 && view.scopePath.startsWith(`${main.scopePath}.`)
  })
})
const currentChildGraphView = computed(() => {
  return mainChildGraphOptions.value.find(view => view.key === currentChildGraphKey.value)
    ?? mainChildGraphOptions.value[0]
    ?? null
})
const graphSplitPanels = computed<GraphSplitPanel[]>(() => {
  const main = currentMainGraphView.value
  if (main === null) return []
  const child = currentChildGraphView.value
  return [
    {
      key: 'main',
      role: 'main',
      graphView: main,
      collapsed: graphSplitCollapsed.value === 'top',
    },
    {
      key: 'child',
      role: 'child',
      graphView: child,
      collapsed: graphSplitCollapsed.value === 'bottom' || child === null,
    },
  ]
})
const graphSplitStyle = computed<CSSProperties>(() => {
  if (graphSplitCollapsed.value === 'top') {
    return { gridTemplateRows: '8px 18px minmax(260px, 1fr)' }
  }
  if (graphSplitCollapsed.value === 'bottom' || currentChildGraphView.value === null) {
    return { gridTemplateRows: 'minmax(300px, 1fr) 18px 8px' }
  }
  return {
    gridTemplateRows: `minmax(220px, ${graphSplitRatio.value}fr) 18px minmax(220px, ${100 - graphSplitRatio.value}fr)`,
  }
})
const flowDefaultEdgeOptions: DefaultEdgeOptions = {
  type: 'smoothstep',
  markerEnd: MarkerType.ArrowClosed,
  interactionWidth: 18,
}
const canSave = computed(() => currentDocument.value !== null && currentWorkflowId.value.length > 0 && !opening.value)
const canPublish = computed(() => canSave.value && !saving.value && !publishing.value)
const canOpenDefinition = computed(() => canSave.value && !openingDefinition.value)
const canSaveDefinition = computed(() => (
  currentWorkflowId.value.length > 0
  && definitionJsonText.value.trim().length > 0
  && !savingDefinition.value
))
const hasUnsavedChanges = computed(() => {
  const status = currentDocument.value?.x_spark.draft?.['status']
  return (typeof status === 'string' ? status : 'draft') === 'dirty' || editorDirty.value
})

watch(
  () => selectedNode.value?.key ?? '',
  () => {
    syncEditorFromSelected()
    syncChildGraphFromSelectedMainNode()
  },
  { immediate: true },
)

watch(
  () => selectedEdge.value?.key ?? '',
  () => syncEdgeEditorFromSelected(),
  { immediate: true },
)

watch(
  () => graphViews.value.map(view => view.key).join('|'),
  () => normalizeGraphNavigation(),
  { immediate: true },
)

watch(
  () => currentMainGraphView.value?.key ?? '',
  () => normalizeChildGraphSelection(),
)

onMounted(async () => {
  await loadDesigns()
  await openInitialDesign()
})

onBeforeUnmount(() => {
  stopLayoutResize()
  stopGraphSplitResize()
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

async function openInitialDesign(): Promise<void> {
  if (designs.value.length === 0 || currentWorkflowId.value.length > 0) return
  const firstReadableDesign = designs.value.find(item => !isUnreadableDesign(item))
  if (firstReadableDesign !== undefined) {
    await openDesign(firstReadableDesign.workflowId)
    return
  }
  ElMessage.warning('当前设计稿均不可打开，请新建工作流或删除旧设计稿')
}

async function openDesign(workflowId: string): Promise<void> {
  const normalizedWorkflowId = workflowId.trim()
  if (normalizedWorkflowId.length === 0) return
  const summary = findWorkflowDesignSummary(normalizedWorkflowId)
  if (isUnreadableDesign(summary)) {
    ElMessage.error(`设计稿不可打开: ${workflowDesignErrorMessage(summary)}`)
    return
  }
  if (normalizedWorkflowId !== currentWorkflowId.value) {
    if (!await confirmDiscardEditorDraft()) return
    if (!await confirmDiscardDefinitionDraft()) return
  }

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
    resetDefinitionEditor()
    selectedEdgeKey.value = ''
    currentMainGraphKey.value = 'workflow.graph'
    currentChildGraphKey.value = ''
    loadGraphSplitState(normalizedWorkflowId)
    const nodes = collectWorkflowDesignNodes(result.document)
    selectedNodeKey.value = nodes.find(node => node.isBusinessNode)?.key
      ?? nodes[0]?.key
      ?? ''
  } catch (error: unknown) {
    ElMessage.error(`打开失败: ${errorMessage(error)}`)
  } finally {
    opening.value = false
  }
}

function findWorkflowDesignSummary(workflowId: string): WorkflowDesignSummary | undefined {
  return designs.value.find(item => item.workflowId === workflowId)
}

function isUnreadableDesign(item: WorkflowDesignSummary | undefined): boolean {
  return item?.status === UNREADABLE_WORKFLOW_DESIGN_STATUS
}

function workflowDesignErrorMessage(item: WorkflowDesignSummary | undefined): string {
  const message = item?.error?.trim()
  return message && message.length > 0 ? message : UNREADABLE_WORKFLOW_DESIGN_FALLBACK_ERROR
}

function workflowDesignListItemTitle(item: WorkflowDesignSummary): string {
  return isUnreadableDesign(item) ? workflowDesignErrorMessage(item) : item.title || item.workflowId
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
      resetDefinitionEditor()
    }
    await loadDesigns()
    ElMessage.success('设计稿已删除')
  } catch (error: unknown) {
    if (error !== 'cancel') ElMessage.error(`删除失败: ${errorMessage(error)}`)
  }
}

function openNodeCreateDialog(graphView: WorkflowDesignGraphView, nodeKind: WorkflowDesignNodeCreateKind): void {
  if (editorDirty.value && !applySelectedDraft({ silent: false })) return
  nodeCreateForm.value = {
    graphKey: graphView.key,
    nodeKind,
    id: defaultCreateNodeId(nodeKind),
    title: defaultCreateNodeTitle(nodeKind),
    desc: '',
  }
  nodeCreateDialogVisible.value = true
}

function syncNodeCreateKindDefaults(): void {
  const form = nodeCreateForm.value
  form.id = defaultCreateNodeId(form.nodeKind)
  form.title = defaultCreateNodeTitle(form.nodeKind)
}

function defaultCreateNodeId(nodeKind: WorkflowDesignNodeCreateKind): string {
  if (nodeKind === 'node') return 'node.model'
  if (nodeKind === 'start') return 'start'
  if (nodeKind === 'output') return 'output'
  return 'node.model'
}

function defaultCreateNodeTitle(nodeKind: WorkflowDesignNodeCreateKind): string {
  if (nodeKind === 'node') return 'Business Node'
  if (nodeKind === 'start') return 'Start'
  if (nodeKind === 'output') return 'Output'
  return 'Business Node'
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
  if ((view.nodeType === 'start' || view.nodeType === 'output') && allNodes.value.filter(node => node.nodeType === view.nodeType).length <= 1) {
    ElMessage.warning('至少保留一个 start 和 output 节点')
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
    leftPanelWidth.value = Math.min(MAX_LEFT_PANEL_WIDTH, Math.max(MIN_LEFT_PANEL_WIDTH, Math.round(state.startLeftWidth + deltaX)))
  } else {
    rightPanelWidth.value = Math.min(MAX_RIGHT_PANEL_WIDTH, Math.max(MIN_RIGHT_PANEL_WIDTH, Math.round(state.startRightWidth - deltaX)))
  }
  event.preventDefault()
}

function stopLayoutResize(): void {
  window.document.removeEventListener('pointermove', handleLayoutResizeMove)
  window.document.removeEventListener('pointerup', stopLayoutResize)
  layoutResizeState.value = null
}

function normalizeGraphNavigation(): void {
  const root = rootGraphView.value
  if (root === null) {
    currentMainGraphKey.value = 'workflow.graph'
    currentChildGraphKey.value = ''
    return
  }
  if (!graphViews.value.some(view => view.key === currentMainGraphKey.value)) {
    currentMainGraphKey.value = root.key
  }
  normalizeChildGraphSelection()
}

function normalizeChildGraphSelection(): void {
  const children = mainChildGraphOptions.value
  if (children.length === 0) {
    currentChildGraphKey.value = ''
    graphSplitCollapsed.value = 'bottom'
    return
  }
  if (!children.some(view => view.key === currentChildGraphKey.value)) {
    currentChildGraphKey.value = children[0]?.key ?? ''
  }
  if (graphSplitCollapsed.value === 'bottom') graphSplitCollapsed.value = null
}

function syncChildGraphFromSelectedMainNode(): void {
  const selected = selectedNode.value
  const main = currentMainGraphView.value
  if (selected === null || main === null || selected.graph !== main.graph) return
  const child = mainChildGraphOptions.value.find(view => view.ownerNode === selected.node)
  currentChildGraphKey.value = child?.key ?? mainChildGraphOptions.value[0]?.key ?? ''
  if (currentChildGraphKey.value.length > 0 && graphSplitCollapsed.value === 'bottom') {
    graphSplitCollapsed.value = null
  }
}

function promoteChildGraphToMain(): void {
  const child = currentChildGraphView.value
  if (child === null) return
  currentMainGraphKey.value = child.key
  currentChildGraphKey.value = ''
  selectedEdgeKey.value = ''
  selectedNodeKey.value = child.graph.nodes[0] !== undefined ? `${child.scopePath}:${child.graph.nodes[0].id}` : ''
  normalizeChildGraphSelection()
}

function returnMainGraphToParent(): void {
  const main = currentMainGraphView.value
  const parent = currentMainParentGraphView.value
  if (main === null || parent === null) return
  currentMainGraphKey.value = parent.key
  currentChildGraphKey.value = main.key
  selectedEdgeKey.value = ''
  selectedNodeKey.value = main.ownerNodeId !== undefined ? `${parent.scopePath}:${main.ownerNodeId}` : ''
  if (graphSplitCollapsed.value === 'bottom') graphSplitCollapsed.value = null
}

function graphPanelTitle(panel: GraphSplitPanel): string {
  const graphView = panel.graphView
  if (graphView === null) return panel.role === 'main' ? 'Main Graph' : 'Child Graph'
  return panel.role === 'main' ? `Main / ${graphView.title}` : `Child / ${graphView.title}`
}

function startGraphSplitResize(event: PointerEvent): void {
  if (editorDirty.value && !applySelectedDraft({ silent: false })) return
  const currentTarget = event.currentTarget
  const shell = currentTarget instanceof HTMLElement ? currentTarget.closest('.graph-split') : null
  const rect = shell instanceof HTMLElement ? shell.getBoundingClientRect() : null
  graphSplitResizeState.value = {
    containerTop: rect?.top ?? 0,
    containerHeight: rect !== null && rect.height > 0 ? rect.height : 720,
    moved: false,
  }
  window.document.addEventListener('pointermove', handleGraphSplitResizeMove)
  window.document.addEventListener('pointerup', handleGraphSplitResizeEnd, { once: true })
}

function handleGraphSplitResizeMove(event: PointerEvent): void {
  const state = graphSplitResizeState.value
  if (state === null) return
  const rawRatio = ((event.clientY - state.containerTop) / state.containerHeight) * 100
  state.moved = true
  if (rawRatio <= GRAPH_SPLIT_SNAP_RATIO && currentChildGraphView.value !== null) {
    graphSplitCollapsed.value = 'top'
  } else if (rawRatio >= 100 - GRAPH_SPLIT_SNAP_RATIO) {
    graphSplitCollapsed.value = 'bottom'
  } else {
    graphSplitCollapsed.value = null
    graphSplitRatio.value = Math.min(
      GRAPH_SPLIT_MAX_RATIO,
      Math.max(GRAPH_SPLIT_MIN_RATIO, Math.round(rawRatio)),
    )
  }
  event.preventDefault()
}

function handleGraphSplitResizeEnd(): void {
  if (graphSplitResizeState.value?.moved === true) saveGraphSplitState()
  stopGraphSplitResize()
}

function stopGraphSplitResize(): void {
  window.document.removeEventListener('pointermove', handleGraphSplitResizeMove)
  window.document.removeEventListener('pointerup', handleGraphSplitResizeEnd)
  graphSplitResizeState.value = null
}

function collapseGraphSplit(side: Exclude<GraphSplitCollapse, null>): void {
  if (side === 'top' && currentChildGraphView.value === null) return
  graphSplitCollapsed.value = side
  saveGraphSplitState()
}

function resetGraphSplit(): void {
  graphSplitRatio.value = 48
  graphSplitCollapsed.value = currentChildGraphView.value === null ? 'bottom' : null
  saveGraphSplitState()
}

function loadGraphSplitState(workflowId: string): void {
  const raw = window.localStorage.getItem(graphSplitStorageKey(workflowId))
  if (raw === null) {
    graphSplitRatio.value = 48
    graphSplitCollapsed.value = null
    return
  }
  try {
    const value: unknown = JSON.parse(raw)
    if (!isJsonRecord(value)) throw new Error('Graph split state must be an object.')
    const ratio = value['ratio']
    graphSplitRatio.value = typeof ratio === 'number' && Number.isFinite(ratio)
      ? Math.min(GRAPH_SPLIT_MAX_RATIO, Math.max(GRAPH_SPLIT_MIN_RATIO, Math.round(ratio)))
      : 48
    const collapsed = value['collapsed']
    graphSplitCollapsed.value = collapsed === 'top' || collapsed === 'bottom' ? collapsed : null
  } catch {
    graphSplitRatio.value = 48
    graphSplitCollapsed.value = null
  }
}

function saveGraphSplitState(): void {
  if (currentWorkflowId.value.length === 0) return
  window.localStorage.setItem(graphSplitStorageKey(currentWorkflowId.value), JSON.stringify({
    ratio: graphSplitRatio.value,
    collapsed: graphSplitCollapsed.value,
  }))
}

function graphSplitStorageKey(workflowId: string): string {
  return `${GRAPH_SPLIT_STORAGE_PREFIX}${workflowId}`
}

function isWorkflowFlowNodeData(value: unknown): value is WorkflowFlowNodeData {
  return isJsonRecord(value)
    && typeof value['viewKey'] === 'string'
    && typeof value['title'] === 'string'
    && typeof value['nodeType'] === 'string'
    && typeof value['scopePath'] === 'string'
    && typeof value['isBusinessNode'] === 'boolean'
    && typeof value['isBoundaryNode'] === 'boolean'
    && typeof value['modelClassName'] === 'string'
    && typeof value['validationActionName'] === 'string'
}

function isWorkflowFlowEdgeData(value: unknown): value is WorkflowFlowEdgeData {
  return isJsonRecord(value) && typeof value['edgeKey'] === 'string'
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
    return {
      id: view.id,
      type: 'workflow',
      position: { x: view.node.position?.x ?? 0, y: view.node.position?.y ?? 0 },
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
      data: {
        viewKey: view.key,
        title: view.title,
        nodeType: view.nodeType,
        scopePath: view.scopePath,
        isBusinessNode: view.isBusinessNode,
        isBoundaryNode: view.isBoundaryNode,
        modelClassName: readBusinessNodeModelClassName(view),
        validationActionName: readBusinessNodeValidationActionName(view),
      },
    }
  })
}

function flowEdgesForGraph(graphView: WorkflowDesignGraphView): WorkflowFlowEdge[] {
  return edgesForGraph(graphView).map((edge) => {
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.edge.sourceHandle ?? 'source',
      targetHandle: edge.edge.targetHandle ?? 'target',
      data: {
        edgeKey: edge.key,
      },
    }
  })
}

function flowDefaultViewport(graphView: WorkflowDesignGraphView): ViewportTransform {
  const vp = graphView.graph.viewport
  return {
    x: vp?.x ?? 0,
    y: vp?.y ?? 0,
    zoom: vp?.zoom ?? 1,
  }
}

function handlePanelFlowNodesChange(changes: NodeChange[], graphView: WorkflowDesignGraphView | null): void {
  if (graphView === null) return
  handleFlowNodesChange(changes, graphView)
}

function handlePanelFlowEdgesChange(changes: EdgeChange[], graphView: WorkflowDesignGraphView | null): void {
  if (graphView === null) return
  handleFlowEdgesChange(changes, graphView)
}

function handlePanelFlowEdgeUpdate(event: EdgeUpdateEvent, graphView: WorkflowDesignGraphView | null): void {
  if (graphView === null) return
  handleFlowEdgeUpdate(event, graphView)
}

function handlePanelFlowConnect(connection: Connection, graphView: WorkflowDesignGraphView | null): void {
  if (graphView === null) return
  handleFlowConnect(connection, graphView)
}

function handlePanelFlowViewportChangeEnd(
  viewport: ViewportTransform,
  graphView: WorkflowDesignGraphView | null,
): void {
  if (graphView === null) return
  handleFlowViewportChangeEnd(viewport, graphView)
}

function handleFlowNodesChange(changes: NodeChange[], graphView: WorkflowDesignGraphView): void {
  for (const change of changes) {
    if (change.type === 'select') {
      if (change.selected) {
        selectNode(`${graphView.scopePath}:${change.id}`)
      } else if (selectedNodeKey.value === `${graphView.scopePath}:${change.id}`) {
        selectedNodeKey.value = ''
      }
    }
  }
}

function handleFlowEdgesChange(changes: EdgeChange[], graphView: WorkflowDesignGraphView): void {
  for (const change of changes) {
    if (change.type === 'select') {
      if (change.selected) {
        const edgeView = edgeViews.value.find(e => e.graph === graphView.graph && e.id === change.id)
        if (edgeView) selectEdge(edgeView.key)
      } else {
        const edgeView = selectedEdge.value
        if (edgeView?.id === change.id && edgeView.graph === graphView.graph) selectedEdgeKey.value = ''
      }
    }
  }
}

function handleFlowViewportChangeEnd(viewport: ViewportTransform, graphView: WorkflowDesignGraphView): void {
  const document = currentDocument.value
  if (document === null) return
  graphView.graph.viewport ??= {}
  graphView.graph.viewport.x = Math.round(viewport.x)
  graphView.graph.viewport.y = Math.round(viewport.y)
  graphView.graph.viewport.zoom = Math.round(viewport.zoom * 100) / 100
  markWorkflowDesignDirty(document, `${graphView.scopePath}.viewport`)
}

function handleFlowNodeDragStop(event: NodeDragEvent): void {
  const data = event.node.data
  if (!isWorkflowFlowNodeData(data)) return
  const view = allNodes.value.find(node => node.key === data.viewKey)
  const document = currentDocument.value
  if (view === undefined || document === null) return

  view.node.position ??= {}
  view.node.position.x = Math.max(0, Math.round(event.node.position.x / 10) * 10)
  view.node.position.y = Math.max(0, Math.round(event.node.position.y / 10) * 10)
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
    const existingView = edgeViews.value.find(view => view.edge === existing)
    selectedEdgeKey.value = existingView?.key ?? `${graphView.scopePath}:${existing.id ?? existing.source}`
    ElMessage.info('连线已存在')
    return
  }

  const edge = addWorkflowDesignEdge(graphView.graph, source, target)
  updateWorkflowDesignEdge(edge, {
    sourceHandle: connection.sourceHandle ?? 'source',
    targetHandle: connection.targetHandle ?? 'target',
  })
  markWorkflowDesignDirty(document, `${graphView.scopePath}.edges`)
  selectEdge(`${graphView.scopePath}:${edge.id ?? `${edge.source}.${edge.target}`}`)
  ElMessage.success('连线已创建')
}

function handleFlowEdgeUpdate(event: EdgeUpdateEvent, graphView: WorkflowDesignGraphView): void {
  const document = currentDocument.value
  if (document === null) return
  const data = event.edge.data
  if (!isWorkflowFlowEdgeData(data)) return
  const edge = edgeViews.value.find(item => item.key === data.edgeKey)
  if (edge === undefined || edge.graph !== graphView.graph) return

  const source = event.connection.source.trim()
  const target = event.connection.target.trim()
  if (!validateEdgeEndpointPatch({ edge, source, target, options: { silent: false } })) return

  updateWorkflowDesignEdge(edge.edge, {
    source,
    target,
    sourceHandle: event.connection.sourceHandle ?? 'source',
    targetHandle: event.connection.targetHandle ?? 'target',
  })
  markWorkflowDesignDirty(document, `${edge.scopePath}.edges`)
  editorDirty.value = false
  ElMessage.success('连线端点已更新')
  syncEdgeEditorFromSelected()
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

function validateEdgeEndpointPatch(command: EdgeEndpointPatchValidationCommand): boolean {
  const { edge, source, target, options } = command
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
  if (!validateEdgeEndpointPatch({ edge, source, target, options })) return false

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
    modelRootClassText.value = ''
    modelClassText.value = ''
    validationActionClassText.value = ''
    validationActionNameText.value = ''
    classModelError.value = ''
    classModelGuideText.value = ''
    loopModeText.value = ''
    loopMaxCountValue.value = 10
    loopExitNodeText.value = ''
    return
  }
  nodeTypeText.value = view.nodeType
  nodeTitleText.value = view.title
  nodeDescText.value = typeof view.node.data?.desc === 'string' ? view.node.data.desc : ''
  modelJsonText.value = shouldEditNodeConfig(view) ? formatJson(view.node.data ?? {}) : '{}'
  syncBusinessModelEditorFromSelected(view)
  const loop = view.node.data?.loop
  loopModeText.value = typeof loop?.mode === 'string' && loop.mode.length > 0 ? loop.mode : 'progressive'
  loopMaxCountValue.value = typeof loop?.maxLoopCount === 'number' && Number.isFinite(loop.maxLoopCount) ? loop.maxLoopCount : 1
  const exitNodeId = typeof loop?.exitNodeId === 'string' && loop.exitNodeId.length > 0 ? loop.exitNodeId : '-'
  loopExitNodeText.value = exitNodeId === '-' ? '' : exitNodeId
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

function syncBusinessModelEditorFromSelected(view: WorkflowDesignNodeView): void {
  if (!view.isBusinessNode) {
    modelRootClassText.value = ''
    modelClassText.value = ''
    validationActionClassText.value = ''
    validationActionNameText.value = ''
    classModelError.value = ''
    classModelGuideText.value = ''
    return
  }
  const model = view.node.data?.model
  modelRootClassText.value = readTextField(model, 'rootClassName')
  modelClassText.value = readTextField(model, 'className')
  const validation = view.node.data?.validation
  const action = isJsonRecord(validation) ? validation['action'] : undefined
  validationActionClassText.value = readTextField(action, 'className') || modelClassText.value
  validationActionNameText.value = readTextField(action, 'actionName')
  classModelError.value = ''
  classModelGuideText.value = ''
}

function applyNodePosition(x: number, y: number): void {
  const view = selectedNode.value
  const document = currentDocument.value
  if (view === null || document === null) return
  view.node.position ??= {}
  view.node.position.x = Number.isFinite(x) ? x : 0
  view.node.position.y = Number.isFinite(y) ? y : 0
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

function shouldEditNodeConfig(view: WorkflowDesignNodeView): boolean {
  return view.isBusinessNode
}

function readBusinessNodeModelClassName(view: WorkflowDesignNodeView): string {
  if (!view.isBusinessNode) return ''
  const model = view.node.data?.model
  if (!isJsonRecord(model)) return 'unbound model'
  const className = model['className']
  return typeof className === 'string' && className.trim().length > 0 ? className.trim() : 'unbound model'
}

function readBusinessNodeValidationActionName(view: WorkflowDesignNodeView): string {
  if (!view.isBusinessNode) return ''
  const validation = view.node.data?.validation
  if (!isJsonRecord(validation)) return ''
  const action = validation['action']
  if (!isJsonRecord(action)) return ''
  const actionName = action['actionName']
  return typeof actionName === 'string' && actionName.trim().length > 0 ? actionName.trim() : ''
}

function createClassModelKnowledgeProvider(rootClassName: string): ClassModelKnowledgeProvider {
  return createWorkerDtsClassModelKnowledgeProvider({
    workerUrl: new URL('../../services/class-model-knowledge.worker.ts', import.meta.url),
    dtsClassModelManifestUrl: getDtsClassModelManifestUrl(),
    rootClassName,
  })
}

function readClassModelOptions(value: unknown): ClassModelOption[] {
  if (!isJsonRecord(value) || !Array.isArray(value['models'])) return []
  return value['models']
    .filter(isJsonRecord)
    .map((model): ClassModelOption | null => {
      const kind = readTextField(model, 'kind') || readTextField(model, 'name')
      if (kind.length === 0) return null
      return {
        kind,
        summary: readTextField(model, 'summary'),
        attributes: readNamedItems(model['attributes']),
        methods: readMethodOptions(model['methods']),
      }
    })
    .filter((item): item is ClassModelOption => item !== null)
}

function readNamedItems(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isJsonRecord)
    .map(item => readTextField(item, 'name'))
    .filter(item => item.length > 0)
}

function readMethodOptions(value: unknown): ClassModelMethodOption[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isJsonRecord)
    .map((method): ClassModelMethodOption | null => {
      const name = readTextField(method, 'name')
      if (name.length === 0) return null
      return {
        name,
        summary: readTextField(method, 'summary'),
        signature: readTextField(method, 'signature'),
      }
    })
    .filter((item): item is ClassModelMethodOption => item !== null)
}

function normalizeBusinessNodeValidationEditorValue(value: unknown): Record<string, unknown> {
  const validation = isJsonRecord(value) ? { ...value } : {}
  validation['action'] = isJsonRecord(validation['action']) ? { ...validation['action'] } : {}
  return validation
}

function normalizeBusinessNodeLlmEditorValue(value: unknown): Record<string, unknown> {
  const llm = isJsonRecord(value) ? { ...value } : {}
  llm['task'] = isJsonRecord(llm['task']) ? llm['task'] : {}
  llm['knowledge'] = isJsonRecord(llm['knowledge']) ? { ...llm['knowledge'] } : {}
  llm['functionCalling'] = isJsonRecord(llm['functionCalling']) ? llm['functionCalling'] : {
    mode: 'freeWithinModelContext',
  }
  llm['output'] = isJsonRecord(llm['output']) ? llm['output'] : {}
  return llm
}

function readTextField(value: unknown, field: string): string {
  if (!isJsonRecord(value)) return ''
  const text = value[field]
  return typeof text === 'string' ? text.trim() : ''
}

function applyEditorToSelected(options: { silent?: boolean } = {}): boolean {
  const view = selectedNode.value
  const document = currentDocument.value
  if (view === null || document === null || !shouldEditNodeConfig(view)) return true

  let parsed: unknown
  try {
    parsed = JSON.parse(modelJsonText.value.trim().length > 0 ? modelJsonText.value : '{}')
  } catch (error: unknown) {
    modelJsonError.value = `JSON 无效: ${errorMessage(error)}`
    if (options.silent !== true) ElMessage.warning(modelJsonError.value)
    return false
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    modelJsonError.value = '节点配置 JSON 必须是对象'
    if (options.silent !== true) ElMessage.warning(modelJsonError.value)
    return false
  }

  applyNodeBasicEditorToSelected()
  view.node.data ??= {}
  Object.assign(view.node.data, parsed)
  view.node.data.type = nodeTypeText.value.trim() || view.nodeType || view.node.type || 'custom'
  view.node.data.title = nodeTitleText.value.trim() || view.id
  view.node.data.desc = nodeDescText.value.trim()
  markWorkflowDesignDirty(document, `${view.scopePath}.${view.id}.data`)
  editorDirty.value = false
  modelJsonError.value = ''
  if (options.silent !== true) ElMessage.success('已应用到节点')
  return true
}

function applyBusinessModelEditorToSelected(options: { silent?: boolean } = {}): boolean {
  const view = selectedNode.value
  const document = currentDocument.value
  if (view === null || document === null || !view.isBusinessNode) return true
  view.node.data ??= {}
  view.node.data.model = {
    rootClassName: modelRootClassText.value.trim(),
    className: modelClassText.value.trim(),
    contextPath: readTextField(view.node.data.model, 'contextPath') || '$',
  }
  view.node.data.validation = normalizeBusinessNodeValidationEditorValue(view.node.data.validation)
  const validation = view.node.data.validation
  const action = isJsonRecord(validation['action']) ? validation['action'] : {}
  validation['action'] = {
    ...action,
    className: validationActionClassText.value.trim() || modelClassText.value.trim(),
    actionName: validationActionNameText.value.trim(),
    inputProjection: isJsonRecord(action['inputProjection']) ? action['inputProjection'] : {},
    expectedResult: isJsonRecord(action['expectedResult']) ? action['expectedResult'] : {},
  }
  view.node.data.llm = normalizeBusinessNodeLlmEditorValue(view.node.data.llm)
  const llm = view.node.data.llm
  llm['knowledge'] = {
    ...(isJsonRecord(llm['knowledge']) ? llm['knowledge'] : {}),
    rootClassName: modelRootClassText.value.trim(),
    className: modelClassText.value.trim(),
  }
  modelJsonText.value = formatJson(view.node.data)
  markWorkflowDesignDirty(document, `${view.scopePath}.${view.id}.data`)
  editorDirty.value = false
  if (options.silent !== true) ElMessage.success('模型绑定已应用')
  return true
}

function handleModelClassSelectionChange(): void {
  if (validationActionClassText.value.trim().length === 0) {
    validationActionClassText.value = modelClassText.value.trim()
  }
  markEditorDirty()
}

async function refreshClassModelOptions(): Promise<void> {
  const rootClassName = modelRootClassText.value.trim()
  if (rootClassName.length === 0) {
    classModelError.value = 'Root Class 不能为空'
    return
  }
  classModelLoading.value = true
  classModelError.value = ''
  classModelGuideText.value = ''
  try {
    const provider = createClassModelKnowledgeProvider(rootClassName)
    const result = await provider.query({ includeMembers: true })
    classModelOptions.value = readClassModelOptions(result)
    if (modelClassText.value.trim().length === 0 && classModelOptions.value[0] !== undefined) {
      modelClassText.value = classModelOptions.value[0].kind
      validationActionClassText.value = modelClassText.value
    }
  } catch (error: unknown) {
    classModelError.value = `ClassModel 读取失败: ${errorMessage(error)}`
  } finally {
    classModelLoading.value = false
  }
}

async function loadValidationActionGuide(): Promise<void> {
  const rootClassName = modelRootClassText.value.trim()
  const className = validationActionClassText.value.trim() || modelClassText.value.trim()
  const methodName = validationActionNameText.value.trim()
  if (rootClassName.length === 0 || className.length === 0 || methodName.length === 0) {
    classModelError.value = 'Root Class、Validation Class、Validation Action 都不能为空'
    return
  }
  classModelLoading.value = true
  classModelError.value = ''
  try {
    const provider = createClassModelKnowledgeProvider(rootClassName)
    classModelGuideText.value = await provider.methodGuide({
      kind: className,
      methodName,
    })
  } catch (error: unknown) {
    classModelError.value = `Action Guide 读取失败: ${errorMessage(error)}`
  } finally {
    classModelLoading.value = false
  }
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
  if (shouldEditNodeConfig(view)) {
    if (!applyEditorToSelected(options)) return false
    return applyBusinessModelEditorToSelected({ silent: true })
  }
  if (view.nodeType === 'loop') return applyLoopEditorToSelected(options)
  applyNodeBasicEditorToSelected()
  editorDirty.value = false
  if (options.silent !== true) ElMessage.success('节点已更新')
  return true
}

async function saveCurrentDesign(): Promise<boolean> {
  const document = currentDocument.value
  if (document === null || currentWorkflowId.value.length === 0) return false
  if (!applySelectedDraft({ silent: true })) return false

  saving.value = true
  try {
    markWorkflowDesignSaved(document)
    const result = await saveWorkflowDesign(currentWorkflowId.value, document)
    currentTimestamp.value = result.timestamp
    editorDirty.value = false
    await loadDesigns()
    ElMessage.success('设计稿已保存')
    return true
  } catch (error: unknown) {
    ElMessage.error(`保存失败: ${errorMessage(error)}`)
    return false
  } finally {
    saving.value = false
  }
}

async function openDefinitionEditor(): Promise<void> {
  const workflowId = currentWorkflowId.value
  if (workflowId.length === 0) return
  if (!applySelectedDraft({ silent: true })) return

  openingDefinition.value = true
  try {
    const result = await readWorkflowDefinition(workflowId, definitionTimestamp.value)
    if (result.definition !== undefined) {
      definitionTimestamp.value = result.timestamp
      definitionJsonText.value = formatJson(result.definition)
      definitionDirty.value = false
    } else {
      ElMessage.info('definition.json 未变化')
    }
    definitionDialogVisible.value = true
  } catch (error: unknown) {
    if (!isWorkflowDefinitionNotFoundError(error) || currentDocument.value === null) {
      ElMessage.error(`打开 Definition 失败: ${errorMessage(error)}`)
      return
    }
    const sourceDocument = await readFreshDesignForDefinitionDraft(workflowId)
    const definition = createAgentWorkflowDefinitionFromDesign(sourceDocument)
    definitionTimestamp.value = ''
    definitionJsonText.value = formatJson(definition)
    definitionDirty.value = true
    definitionDialogVisible.value = true
    ElMessage.info('definition.json 不存在，已从当前设计稿生成本地草稿')
  } finally {
    openingDefinition.value = false
  }
}

function markDefinitionDirty(): void {
  definitionDirty.value = true
}

async function readFreshDesignForDefinitionDraft(workflowId: string): Promise<WorkflowDesignDocument> {
  const openedDocument = currentDocument.value
  if (openedDocument === null) {
    throw new Error('当前设计稿未打开')
  }
  if (hasUnsavedChanges.value) {
    return openedDocument
  }
  try {
    const result = await readWorkflowDesign(workflowId)
    if (result.document !== undefined) {
      currentTimestamp.value = result.timestamp
      currentDocument.value = result.document
      return result.document
    }
  } catch {
    // Best-effort refresh only; keep the already-open design if the API is unavailable.
  }
  return currentDocument.value ?? openedDocument
}

async function saveCurrentDefinition(): Promise<void> {
  const workflowId = currentWorkflowId.value
  if (workflowId.length === 0) return

  let definition
  try {
    definition = parseAgentWorkflowDefinitionJson(definitionJsonText.value)
  } catch (error: unknown) {
    ElMessage.error(`Definition JSON 无效: ${errorMessage(error)}`)
    return
  }

  savingDefinition.value = true
  try {
    const result = await saveWorkflowDefinition(workflowId, definition)
    definitionTimestamp.value = result.timestamp
    definitionJsonText.value = formatJson(definition)
    definitionDirty.value = false
    ElMessage.success('definition.json 已保存')
  } catch (error: unknown) {
    ElMessage.error(`保存 Definition 失败: ${errorMessage(error)}`)
  } finally {
    savingDefinition.value = false
  }
}

async function publishCurrentDefinition(): Promise<void> {
  const document = currentDocument.value
  const workflowId = currentWorkflowId.value
  if (document === null || workflowId.length === 0) return
  if (!applySelectedDraft({ silent: true })) return
  if (hasUnsavedChanges.value && !await saveCurrentDesign()) return

  const definition = createAgentWorkflowDefinitionFromDesign(document)
  if (definition.x_spark.validation.status === 'invalid') {
    const firstIssue = definition.x_spark.validation.issues.find(issue => issue.severity === 'error')
    ElMessage.error(`发布失败: ${firstIssue?.message ?? 'definition 校验未通过'}`)
    return
  }

  publishing.value = true
  try {
    const result = await publishWorkflowDefinition(workflowId, definition)
    definitionTimestamp.value = result.timestamp
    definitionJsonText.value = formatJson(definition)
    definitionDirty.value = false
    definitionDialogVisible.value = true
    ElMessage.success('definition.json 已发布')
  } catch (error: unknown) {
    ElMessage.error(`发布失败: ${errorMessage(error)}`)
  } finally {
    publishing.value = false
  }
}

function resetDefinitionEditor(): void {
  definitionDialogVisible.value = false
  definitionTimestamp.value = ''
  definitionJsonText.value = '{}'
  definitionDirty.value = false
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

async function confirmDiscardDefinitionDraft(): Promise<boolean> {
  if (!definitionDialogVisible.value || !definitionDirty.value) return true
  try {
    await ElMessageBox.confirm('当前 definition.json 有未保存内容，继续会丢弃这些内容。', '切换设计稿', {
      type: 'warning',
      confirmButtonText: '继续',
      cancelButtonText: '取消',
    })
    definitionDirty.value = false
    return true
  } catch {
    return false
  }
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

.workflow-list-item.is-unreadable {
  border-color: #fecaca;
  background: #fff7f7;
}

.workflow-list-item.is-unreadable:hover {
  border-color: #dc2626;
  background: #fff1f2;
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

.graph-split {
  display: grid;
  height: calc(100vh - 216px);
  min-height: 640px;
}

.graph-split-pane {
  display: flex;
  min-height: 0;
  margin-bottom: 0;
  overflow: hidden;
  flex-direction: column;
}

.graph-split-pane.is-collapsed {
  min-height: 8px;
}

.graph-collapse-edge {
  width: 100%;
  height: 8px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  cursor: pointer;
  background: #cbd5e1;
}

.graph-splitter {
  display: grid;
  grid-template-columns: minmax(24px, 1fr) auto minmax(24px, 1fr);
  align-items: center;
  gap: 8px;
  min-height: 18px;
  cursor: row-resize;
}

.graph-splitter-line {
  height: 1px;
  background: #dbe3ee;
}

.graph-splitter-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 6px;
  border: 1px solid #dbe3ee;
  border-radius: 999px;
  background: #ffffff;
  box-shadow: 0 1px 2px rgb(15 23 42 / 6%);
}

.graph-panel-label {
  flex: 0 0 auto;
}

.graph-panel-body {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
}

.graph-panel-flow {
  flex: 1 1 auto;
  min-height: 220px;
}

.graph-child-select {
  width: 180px;
  min-height: 26px;
  font-size: 12px;
}

.collapsible-section > summary {
  list-style: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 7px;
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

.workflow-flow {
  width: 100%;
  height: 100%;
  min-height: 260px;
}

.graph-split .workflow-flow {
  min-height: 0;
}

.workflow-flow--subgraph {
  min-height: 520px;
}

.graph-split .workflow-flow--subgraph {
  min-height: 0;
}

.workflow-node {
  display: grid;
  align-content: start;
  min-width: 0;
  border: 1px solid #dbe3ee;
  border-radius: 8px;
  text-align: left;
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

.workflow-node.is-business {
  background: #f4fbf9;
}

.workflow-node.is-boundary {
  background: #f5f9ff;
}

.workflow-node.is-loop {
  background: #fff7ed;
}

.node-kind,
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

.node-kind {
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
  margin-bottom: 10px;
  color: #334155;
  font-size: 12px;
  font-weight: 700;
}

.node-editor-form,
.loop-editor-form,
.class-model-editor {
  display: grid;
  gap: 10px;
}

.class-model-catalog {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  color: #334155;
  font-size: 12px;
}

.class-model-guide {
  max-height: 220px;
  overflow: auto;
  padding: 10px;
  border: 1px solid #dbe3ee;
  border-radius: 6px;
  background: #f8fafc;
  color: #0f172a;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
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

.definition-editor {
  display: grid;
  gap: 12px;
}

.definition-editor-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  color: #334155;
  font-size: 13px;
}

.definition-json-input :deep(textarea) {
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.55;
}

.editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
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

  .graph-split {
    height: auto;
    min-height: 720px;
  }
}
</style>
