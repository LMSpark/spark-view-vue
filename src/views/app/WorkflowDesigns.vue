<!--
@module app:views/app/WorkflowDesigns
职责：提供工作流设计稿的可视化编辑入口，连接 Dify-like JSON graph、文件保存 API 与 workflow definition 发布。
边界：只处理设计态 JSON，不执行 Agent workflow 运行时。
AI用途：需要验证 workflow 编辑器如何配置业务节点、ClassModel model context 或步骤线投影时，用本页面定位。
-->
<template>
  <div class="workflow-design-page">
    <div class="workflow-design-shell" :style="workflowShellStyle">
      <aside class="workflow-design-sidebar" :class="{ 'is-collapsed': leftPanelCollapsed }">
        <button
          v-if="leftPanelCollapsed"
          type="button"
          class="workflow-sidebar-collapsed-button"
          title="展开设计列表"
          @click="leftPanelCollapsed = false"
        >
          <span>设计</span>
          <strong>{{ designs.length }}</strong>
        </button>
        <template v-else>
          <div class="panel-heading workflow-list-heading">
            <span>工作流设计</span>
            <span class="workflow-list-heading-actions">
              <el-tag size="small" type="info">{{ designs.length }}</el-tag>
              <el-button link size="small" @click="leftPanelCollapsed = true">收起</el-button>
            </span>
          </div>
          <el-skeleton v-if="loadingList && designs.length === 0" :rows="6" animated />
          <el-empty v-else-if="designs.length === 0" description="暂无工作流设计" />
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
        </template>
      </aside>

      <div
        class="layout-resize-handle"
        :class="{ 'is-disabled': leftPanelCollapsed }"
        title="Resize workflow list"
        role="separator"
        aria-orientation="vertical"
        @pointerdown.prevent="startLayoutResize($event, 'left')"
      />

      <main class="workflow-design-canvas">
        <div v-if="currentDocument" class="canvas-toolbar">
          <div class="document-title">
            <span class="document-title-label">工作流设计</span>
            <span class="document-title-id">{{ currentDocument.workflow.id }}</span>
            <el-tag size="small">{{ currentDocument.kind }}</el-tag>
            <el-tag size="small" :type="hasUnsavedChanges ? 'warning' : 'success'">
              {{ hasUnsavedChanges ? 'unsaved' : 'saved' }}
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
                  :title="panel.role === 'main' ? 'Main graph collapsed' : 'Child graph collapsed'"
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
                      <el-tag size="small" type="info">连线 {{ linesForGraph(panel.graphView).length }}</el-tag>
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

                    <div
                      v-if="selectedNodeInGraph(panel.graphView) && selectedNode?.isBusinessNode === true && selectedClassModelOption"
                      class="graph-class-model-strip"
                    >
                      <span class="class-model-pin" aria-hidden="true"></span>
                      <strong>ClassModel</strong>
                      <span class="graph-class-model-strip-badge">{{ selectedClassModelOption.kind }}</span>
                      <span class="graph-class-model-strip-badge">attributes {{ selectedClassModelOption.attributes.length }}</span>
                      <span class="graph-class-model-strip-badge">actions {{ selectedClassModelOption.methods.length }}</span>
                      <span class="graph-class-model-strip-spacer" />
                      <el-button link size="small" :icon="DocumentCopy" @click="openClassModelDrawer">
                        知识抽屉
                      </el-button>
                      <el-button
                        link
                        size="small"
                        :loading="classModelLoading"
                        :icon="Refresh"
                        @click="refreshClassModelOptions"
                      >
                        刷新
                      </el-button>
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
                        @edge-double-click="event => handlePanelFlowEdgeDoubleClick(event, panel.graphView)"
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
                          }" @dblclick.stop="openNodeEditor(data.viewKey)">
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
                            <span v-if="data.isBusinessNode" class="tool-name tool-name--pinned">
                              <span class="class-model-pin" aria-hidden="true"></span>
                              <span>{{ data.modelClassName }}</span>
                            </span>
                            <small v-if="data.modelDocText" class="node-jsdoc">{{ data.modelDocText }}</small>
                            <span v-if="data.validationActionName" class="tool-name tool-name--pinned">
                              <span class="class-model-pin" aria-hidden="true"></span>
                              <span>{{ data.validationActionName }}</span>
                            </span>
                            <small v-if="data.validationActionDocText" class="node-jsdoc">{{ data.validationActionDocText }}</small>
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
                title="Resize graph split"
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
        title="Resize properties"
        role="separator"
        aria-orientation="vertical"
        @pointerdown.prevent="startLayoutResize($event, 'right')"
      />

      <aside class="workflow-design-editor workflow-tool-sidebar">
        <div class="panel-heading">
          <span>工具栏</span>
          <el-tag v-if="selectedLine" size="small" type="warning">连线</el-tag>
          <el-tag
            v-else-if="selectedNode"
            size="small"
            :type="selectedNode.isBusinessNode ? 'success' : selectedNode.isBoundaryNode ? 'info' : 'warning'"
          >
            {{ selectedNode.nodeType }}
          </el-tag>
        </div>

        <section class="workflow-tool-group workflow-tool-group--actions">
          <h3>流程级</h3>
          <div class="workflow-tool-button-grid">
            <el-button :icon="Refresh" :loading="loadingList" @click="loadDesigns">刷新</el-button>
            <el-button type="primary" :icon="DocumentAdd" @click="openCreateDialog">新建</el-button>
            <el-button :icon="DocumentCopy" :disabled="currentDocument === null" @click="copyJson">复制 JSON</el-button>
            <el-button
              :icon="RefreshLeft"
              :loading="autoLayoutSaving"
              :disabled="!canAutoLayout"
              @click="autoLayoutCurrentDesign"
            >
              自动排版
            </el-button>
            <el-button :icon="DocumentCopy" :loading="openingDefinition" :disabled="!canOpenDefinition" @click="openDefinitionEditor">
              Definition
            </el-button>
            <el-button type="success" :icon="Upload" :loading="saving" :disabled="!canSave" @click="saveCurrentDesign">
              保存
            </el-button>
            <el-button type="primary" :icon="Upload" :loading="publishing" :disabled="!canPublish" @click="publishCurrentDefinition">
              发布
            </el-button>
          </div>
        </section>

        <section class="workflow-tool-group">
          <h3>节点级</h3>
          <div v-if="selectedNode" class="workflow-tool-selection">
            <strong>{{ selectedNode.title }}</strong>
            <span>{{ selectedNode.id }}</span>
            <span>{{ selectedNode.scopePath }}</span>
          </div>
          <div v-else class="workflow-tool-empty">未选择节点</div>
          <el-button
            :icon="DocumentAdd"
            :disabled="currentMainGraphView === null"
            @click="openNodeCreateDialogForCurrentGraph"
          >
            Add business node
          </el-button>
          <el-button :icon="DocumentCopy" :disabled="selectedNode === null" @click="openPropertiesDrawer">
            打开属性
          </el-button>
          <el-button type="danger" :icon="Delete" :disabled="selectedNode === null" @click="deleteSelectedNode">
            删除节点
          </el-button>
        </section>

        <section class="workflow-tool-group">
          <h3>连线级</h3>
          <div v-if="selectedLine" class="workflow-tool-selection">
            <strong>{{ selectedLine.id }}</strong>
            <span>{{ selectedLine.fromNodeId }} -> {{ selectedLine.toNodeId }}</span>
            <span>{{ selectedLine.scopePath }}</span>
          </div>
          <div v-else class="workflow-tool-empty">未选择连线</div>
          <el-button :icon="DocumentCopy" :disabled="selectedLine === null" @click="openPropertiesDrawer">
            打开属性
          </el-button>
          <el-button type="danger" :icon="Delete" :disabled="selectedLine === null" @click="deleteSelectedLine">
            删除连线
          </el-button>
        </section>

        <template v-if="selectedLine !== null && false">
          <details class="editor-section collapsible-section" open>
            <summary>连线信息</summary>
            <div class="collapsible-body">
              <el-descriptions :column="1" size="small" border>
                <el-descriptions-item label="ID">{{ selectedLine?.id }}</el-descriptions-item>
                <el-descriptions-item label="Scope">{{ selectedLine?.scopePath }}</el-descriptions-item>
                <el-descriptions-item label="From">{{ selectedLine?.fromNodeId }}</el-descriptions-item>
                <el-descriptions-item label="To">{{ selectedLine?.toNodeId }}</el-descriptions-item>
              </el-descriptions>
            </div>
          </details>

          <details class="editor-section collapsible-section" open>
            <summary>连线编辑</summary>
            <div class="collapsible-body">
              <el-form label-position="top">
                <el-form-item label="From Node">
                  <select v-model="lineFromNodeText" class="native-select" @change="markEditorDirty">
                    <option v-for="node in selectedLineGraphNodes" :key="node.key" :value="node.id">
                      {{ node.title }} / {{ node.id }}
                    </option>
                  </select>
                </el-form-item>
                <el-row :gutter="8">
                  <el-col :span="12">
                    <el-form-item label="From Model">
                      <el-input v-model="lineFromModelText" @input="markEditorDirty" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="From Member">
                      <el-input v-model="lineFromMemberText" @input="markEditorDirty" />
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-form-item label="To Node">
                  <select v-model="lineToNodeText" class="native-select" @change="markEditorDirty">
                    <option v-for="node in selectedLineGraphNodes" :key="node.key" :value="node.id">
                      {{ node.title }} / {{ node.id }}
                    </option>
                  </select>
                </el-form-item>
                <el-row :gutter="8">
                  <el-col :span="12">
                    <el-form-item label="To Model">
                      <el-input v-model="lineToModelText" @input="markEditorDirty" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="To Member">
                      <el-input v-model="lineToMemberText" @input="markEditorDirty" />
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-row :gutter="8">
                  <el-col :span="12">
                    <el-form-item label="Type">
                      <el-input v-model="lineTypeText" @input="markEditorDirty" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="Relation">
                      <el-input v-model="lineRelationText" @input="markEditorDirty" />
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-row :gutter="8">
                  <el-col :span="12">
                    <el-form-item label="From Dock">
                      <el-input v-model="lineFromDockText" @input="markEditorDirty" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="To Dock">
                      <el-input v-model="lineToDockText" @input="markEditorDirty" />
                    </el-form-item>
                  </el-col>
                </el-row>
              </el-form>
              <div class="editor-actions" style="justify-content: space-between">
                <el-button :icon="CircleCheck" @click="applyLineEditorToSelected">应用连线</el-button>
                <el-button type="danger" :icon="Delete" @click="deleteSelectedLine">删除连线</el-button>
              </div>
            </div>
          </details>
        </template>

        <template v-if="selectedNode !== null && false">
          <details class="editor-section collapsible-section" open>
            <summary>节点信息</summary>
            <div class="collapsible-body">
                <el-descriptions :column="1" size="small" border>
                  <el-descriptions-item label="ID">{{ selectedNode?.id }}</el-descriptions-item>
                  <el-descriptions-item label="Scope">{{ selectedNode?.scopePath }}</el-descriptions-item>
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

          <details v-if="selectedNode?.nodeType === 'loop'" class="editor-section collapsible-section" open>
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
            v-if="selectedNode?.isBusinessNode === true"
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
                    <option :value="modelClassText">{{ modelClassText || 'unbound' }}</option>
                    <option v-for="item in classModelOptions" :key="item.kind" :value="item.kind">
                      {{ item.kind }}
                    </option>
                  </select>
                </el-form-item>
                <el-form-item label="Completion Class">
                  <el-input v-model="validationActionClassText" @input="markEditorDirty" />
                </el-form-item>
                <el-form-item label="Completion Member">
                  <select v-model="validationActionNameText" class="native-select" @change="markEditorDirty">
                    <option :value="validationActionNameText">{{ validationActionNameText || 'unbound' }}</option>
                    <option v-for="method in selectedClassModelMethods" :key="method.name" :value="method.name">
                      {{ method.name }}
                    </option>
                  </select>
                </el-form-item>
              </el-form>
              <el-alert v-if="classModelError" :title="classModelError" type="error" :closable="false" />
              <div v-if="selectedClassModelOption" class="class-model-catalog">
                <strong>{{ selectedClassModelOption?.kind }}</strong>
                <span>attributes {{ selectedClassModelOption?.attributes.length }}</span>
                <span>actions {{ selectedClassModelOption?.methods.length }}</span>
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

        </template>
      </aside>
    </div>

    <el-drawer
      v-model="propertiesDrawerVisible"
      class="properties-drawer"
      direction="rtl"
      :size="'33vw'"
      :title="propertiesDrawerTitle"
    >
      <template v-if="selectedLine">
        <details class="editor-section collapsible-section" open>
          <summary>连线信息</summary>
          <div class="collapsible-body">
            <el-descriptions :column="1" size="small" border>
              <el-descriptions-item label="ID">{{ selectedLine.id }}</el-descriptions-item>
              <el-descriptions-item label="Scope">{{ selectedLine.scopePath }}</el-descriptions-item>
              <el-descriptions-item label="From">{{ selectedLine.fromNodeId }}</el-descriptions-item>
              <el-descriptions-item label="To">{{ selectedLine.toNodeId }}</el-descriptions-item>
            </el-descriptions>
          </div>
        </details>

        <details class="editor-section collapsible-section" open>
          <summary>连线编辑</summary>
          <div class="collapsible-body">
            <el-form label-position="top">
              <el-form-item label="From Node">
                <select v-model="lineFromNodeText" class="native-select" @change="handleLineEditorChange">
                  <option v-for="node in selectedLineGraphNodes" :key="node.key" :value="node.id">
                    {{ node.title }} / {{ node.id }}
                  </option>
                </select>
              </el-form-item>
              <el-row :gutter="8">
                <el-col :span="12">
                  <el-form-item label="From Model">
                    <select v-model="lineFromModelText" class="native-select" @change="handleLineEditorChange">
                      <option
                        v-for="option in lineModelOptions(lineFromNodeText, lineFromModelText)"
                        :key="option"
                        :value="option"
                      >
                        {{ option }}
                      </option>
                    </select>
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="From Member">
                    <select v-model="lineFromMemberText" class="native-select" @change="handleLineEditorChange">
                      <option
                        v-for="option in lineMemberOptions(lineFromNodeText, lineFromMemberText)"
                        :key="option"
                        :value="option"
                      >
                        {{ option }}
                      </option>
                    </select>
                  </el-form-item>
                </el-col>
              </el-row>
              <el-form-item label="To Node">
                <select v-model="lineToNodeText" class="native-select line-to-node-select" @change="handleLineEditorChange">
                  <option v-for="node in selectedLineGraphNodes" :key="node.key" :value="node.id">
                    {{ node.title }} / {{ node.id }}
                  </option>
                </select>
              </el-form-item>
              <el-row :gutter="8">
                <el-col :span="12">
                  <el-form-item label="To Model">
                    <select v-model="lineToModelText" class="native-select" @change="handleLineEditorChange">
                      <option
                        v-for="option in lineModelOptions(lineToNodeText, lineToModelText)"
                        :key="option"
                        :value="option"
                      >
                        {{ option }}
                      </option>
                    </select>
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="To Member">
                    <select v-model="lineToMemberText" class="native-select" @change="handleLineEditorChange">
                      <option
                        v-for="option in lineMemberOptions(lineToNodeText, lineToMemberText)"
                        :key="option"
                        :value="option"
                      >
                        {{ option }}
                      </option>
                    </select>
                  </el-form-item>
                </el-col>
              </el-row>
              <el-row :gutter="8">
                <el-col :span="12">
                  <el-form-item label="Type">
                    <el-input v-model="lineTypeText" @input="handleLineEditorChange" />
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="Relation">
                    <el-input v-model="lineRelationText" @input="handleLineEditorChange" />
                  </el-form-item>
                </el-col>
              </el-row>
            </el-form>
            <div class="editor-actions" style="justify-content: space-between">
              <el-button type="danger" :icon="Delete" @click="deleteSelectedLine">删除连线</el-button>
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
              <el-form-item label="Exit Node">
                <select v-model="loopExitNodeText" class="native-select" @change="markEditorDirty">
                  <option v-for="node in selectedLineGraphNodes" :key="node.key" :value="node.id">
                    {{ node.title }} / {{ node.id }}
                  </option>
                </select>
              </el-form-item>
            </el-form>
          </div>
        </details>

        <template v-if="selectedNode.isBusinessNode">
          <details class="editor-section collapsible-section" open>
            <summary>ClassModel</summary>
            <div class="collapsible-body class-model-editor">
              <el-form label-position="top">
                <el-form-item label="Root Class">
                  <select v-model="modelRootClassText" class="native-select" @change="handleBusinessNodeStructuredChange">
                    <option v-for="option in rootClassOptions" :key="option" :value="option">{{ option }}</option>
                  </select>
                </el-form-item>
                <el-form-item label="Model Class">
                  <select v-model="modelClassText" class="native-select" @change="handleModelClassSelectionChange">
                    <option v-for="option in modelClassOptions" :key="option" :value="option">{{ option }}</option>
                  </select>
                </el-form-item>
                <el-form-item label="Completion Class">
                  <select
                    v-model="validationActionClassText"
                    class="native-select"
                    @change="handleBusinessNodeStructuredChange"
                  >
                    <option v-for="option in modelClassOptions" :key="option" :value="option">{{ option }}</option>
                  </select>
                </el-form-item>
                <el-form-item label="Completion Member">
                  <select
                    v-model="validationActionNameText"
                    class="native-select"
                    @change="handleBusinessNodeStructuredChange"
                  >
                    <option v-for="option in completionMemberOptions" :key="option" :value="option">{{ option }}</option>
                  </select>
                </el-form-item>
              </el-form>
              <el-alert v-if="classModelError" :title="classModelError" type="error" :closable="false" />
              <div v-if="selectedClassModelOption" class="class-model-catalog">
                <strong>{{ selectedClassModelOption?.kind }}</strong>
                <span>attributes {{ selectedClassModelOption?.attributes.length }}</span>
                <span>actions {{ selectedClassModelOption?.methods.length }}</span>
              </div>
              <pre v-if="classModelGuideText" class="class-model-guide">{{ classModelGuideText }}</pre>
              <div class="editor-actions">
                <el-button :loading="classModelLoading" :icon="Refresh" @click="refreshClassModelOptions">
                  刷新知识
                </el-button>
                <el-button :loading="classModelLoading" :icon="DocumentCopy" @click="loadValidationActionGuide">
                  Action Guide
                </el-button>
              </div>
            </div>
          </details>

          <details class="editor-section collapsible-section" open>
            <summary>输入</summary>
            <div class="collapsible-body structured-editor">
              <div
                v-for="row in businessInputRows"
                :key="row.id"
                class="structured-field-row structured-field-row--inputs"
              >
                <select v-model="row.path" class="native-select structured-field-path" @change="handleBusinessNodeStructuredChange">
                  <option v-for="option in structuredPathOptions(businessInputRows)" :key="option" :value="option">
                    {{ option }}
                  </option>
                </select>
                <select v-model="row.valueKind" class="native-select structured-field-kind" @change="handleBusinessNodeStructuredChange">
                  <option value="reference">引用</option>
                  <option value="text">文本</option>
                  <option value="number">数字</option>
                  <option value="boolean">布尔</option>
                </select>
                <select
                  v-if="row.valueKind === 'reference'"
                  v-model="row.valueText"
                  class="native-select structured-field-value"
                  @change="handleBusinessNodeStructuredChange"
                >
                  <option v-for="option in structuredValueOptions(row)" :key="option" :value="option">{{ option }}</option>
                </select>
                <input
                  v-else-if="row.valueKind === 'boolean'"
                  v-model="row.valueBoolean"
                  class="structured-checkbox"
                  type="checkbox"
                  @change="handleBusinessNodeStructuredChange"
                >
                <el-input v-else v-model="row.valueText" class="structured-field-value" @input="handleBusinessNodeStructuredChange" />
                <el-button link type="danger" :icon="Delete" @click="removeStructuredFieldRow(businessInputRows, row)">
                  删除
                </el-button>
              </div>
              <el-button :icon="DocumentAdd" @click="addStructuredFieldRow(businessInputRows, 'input')">添加输入</el-button>
            </div>
          </details>

          <details class="editor-section collapsible-section" open>
            <summary>输出</summary>
            <div class="collapsible-body structured-editor">
              <div
                v-for="row in businessOutputRows"
                :key="row.id"
                class="structured-field-row structured-field-row--outputs"
              >
                <select v-model="row.path" class="native-select structured-field-path" @change="handleBusinessNodeStructuredChange">
                  <option v-for="option in structuredPathOptions(businessOutputRows)" :key="option" :value="option">
                    {{ option }}
                  </option>
                </select>
                <select v-model="row.valueKind" class="native-select structured-field-kind" @change="handleBusinessNodeStructuredChange">
                  <option value="reference">引用</option>
                  <option value="text">文本</option>
                  <option value="number">数字</option>
                  <option value="boolean">布尔</option>
                </select>
                <select
                  v-if="row.valueKind === 'reference'"
                  v-model="row.valueText"
                  class="native-select structured-field-value"
                  @change="handleBusinessNodeStructuredChange"
                >
                  <option v-for="option in structuredValueOptions(row)" :key="option" :value="option">{{ option }}</option>
                </select>
                <input
                  v-else-if="row.valueKind === 'boolean'"
                  v-model="row.valueBoolean"
                  class="structured-checkbox"
                  type="checkbox"
                  @change="handleBusinessNodeStructuredChange"
                >
                <el-input v-else v-model="row.valueText" class="structured-field-value" @input="handleBusinessNodeStructuredChange" />
                <el-button link type="danger" :icon="Delete" @click="removeStructuredFieldRow(businessOutputRows, row)">
                  删除
                </el-button>
              </div>
              <el-button :icon="DocumentAdd" @click="addStructuredFieldRow(businessOutputRows, 'output')">添加输出</el-button>
            </div>
          </details>

          <details class="editor-section collapsible-section" open>
            <summary>LLM 任务</summary>
            <div class="collapsible-body structured-editor">
              <el-form label-position="top">
                <el-form-item label="Goal">
                  <el-input v-model="taskGoalText" type="textarea" :rows="2" @input="handleBusinessNodeStructuredChange" />
                </el-form-item>
              </el-form>
              <strong>Requirements</strong>
              <div v-for="row in taskRequirementRows" :key="row.id" class="structured-field-row">
                <select v-model="row.path" class="native-select structured-field-path" @change="handleBusinessNodeStructuredChange">
                  <option v-for="option in structuredPathOptions(taskRequirementRows)" :key="option" :value="option">
                    {{ option }}
                  </option>
                </select>
                <select v-model="row.valueKind" class="native-select structured-field-kind" @change="handleBusinessNodeStructuredChange">
                  <option value="reference">引用</option>
                  <option value="text">文本</option>
                  <option value="number">数字</option>
                  <option value="boolean">布尔</option>
                </select>
                <select
                  v-if="row.valueKind === 'reference'"
                  v-model="row.valueText"
                  class="native-select structured-field-value"
                  @change="handleBusinessNodeStructuredChange"
                >
                  <option v-for="option in structuredValueOptions(row)" :key="option" :value="option">{{ option }}</option>
                </select>
                <el-input v-else v-model="row.valueText" class="structured-field-value" @input="handleBusinessNodeStructuredChange" />
                <el-button link type="danger" :icon="Delete" @click="removeStructuredFieldRow(taskRequirementRows, row)">删除</el-button>
              </div>
              <el-button :icon="DocumentAdd" @click="addStructuredFieldRow(taskRequirementRows, 'task.requirement')">添加需求</el-button>
              <strong>Context Inputs</strong>
              <div v-for="row in taskContextInputRows" :key="row.id" class="structured-field-row">
                <select v-model="row.path" class="native-select structured-field-path" @change="handleBusinessNodeStructuredChange">
                  <option v-for="option in structuredPathOptions(taskContextInputRows)" :key="option" :value="option">
                    {{ option }}
                  </option>
                </select>
                <select v-model="row.valueKind" class="native-select structured-field-kind" @change="handleBusinessNodeStructuredChange">
                  <option value="reference">引用</option>
                  <option value="text">文本</option>
                  <option value="number">数字</option>
                  <option value="boolean">布尔</option>
                </select>
                <select
                  v-if="row.valueKind === 'reference'"
                  v-model="row.valueText"
                  class="native-select structured-field-value"
                  @change="handleBusinessNodeStructuredChange"
                >
                  <option v-for="option in structuredValueOptions(row)" :key="option" :value="option">{{ option }}</option>
                </select>
                <el-input v-else v-model="row.valueText" class="structured-field-value" @input="handleBusinessNodeStructuredChange" />
                <el-button link type="danger" :icon="Delete" @click="removeStructuredFieldRow(taskContextInputRows, row)">删除</el-button>
              </div>
              <el-button :icon="DocumentAdd" @click="addStructuredFieldRow(taskContextInputRows, 'task.context')">添加上下文</el-button>
            </div>
          </details>

          <details class="editor-section collapsible-section" open>
            <summary>知识和调用</summary>
            <div class="collapsible-body structured-editor">
              <strong>Allowed Actions</strong>
              <div v-for="card in allowedActionCards" :key="card.id" class="structured-card">
                <select v-model="card.value" class="native-select" @change="handleBusinessNodeStructuredChange">
                  <option v-for="option in completionMemberOptions" :key="option" :value="option">{{ option }}</option>
                </select>
                <el-button link type="danger" :icon="Delete" @click="removeSelectCard(allowedActionCards, card)">删除</el-button>
              </div>
              <el-button :icon="DocumentAdd" @click="addSelectCard(allowedActionCards, completionMemberOptions, 'knowledge.action')">
                添加 Action
              </el-button>
              <strong>Readable Attributes</strong>
              <div v-for="card in readableAttributeCards" :key="card.id" class="structured-card">
                <select v-model="card.value" class="native-select" @change="handleBusinessNodeStructuredChange">
                  <option v-for="option in modelAttributeOptions" :key="option" :value="option">{{ option }}</option>
                </select>
                <el-button link type="danger" :icon="Delete" @click="removeSelectCard(readableAttributeCards, card)">删除</el-button>
              </div>
              <el-button :icon="DocumentAdd" @click="addSelectCard(readableAttributeCards, modelAttributeOptions, 'knowledge.attribute')">
                添加属性
              </el-button>
              <el-form label-position="top">
                <el-form-item label="Function Calling Mode">
                  <select v-model="functionCallingModeText" class="native-select" @change="handleBusinessNodeStructuredChange">
                    <option value="freeWithinModelContext">freeWithinModelContext</option>
                    <option value="restricted">restricted</option>
                    <option value="disabled">disabled</option>
                  </select>
                </el-form-item>
              </el-form>
            </div>
          </details>

          <details class="editor-section collapsible-section" open>
            <summary>校验</summary>
            <div class="collapsible-body structured-editor">
              <el-descriptions :column="1" size="small" border>
                <el-descriptions-item label="Status">{{ validationStatusText || 'draft' }}</el-descriptions-item>
              </el-descriptions>
              <strong>Input Projection</strong>
              <div v-for="row in validationInputProjectionRows" :key="row.id" class="structured-field-row">
                <select v-model="row.path" class="native-select structured-field-path" @change="handleBusinessNodeStructuredChange">
                  <option v-for="option in structuredPathOptions(validationInputProjectionRows)" :key="option" :value="option">
                    {{ option }}
                  </option>
                </select>
                <select v-model="row.valueKind" class="native-select structured-field-kind" @change="handleBusinessNodeStructuredChange">
                  <option value="reference">引用</option>
                  <option value="text">文本</option>
                  <option value="number">数字</option>
                  <option value="boolean">布尔</option>
                </select>
                <select
                  v-if="row.valueKind === 'reference'"
                  v-model="row.valueText"
                  class="native-select structured-field-value"
                  @change="handleBusinessNodeStructuredChange"
                >
                  <option v-for="option in structuredValueOptions(row)" :key="option" :value="option">{{ option }}</option>
                </select>
                <el-input v-else v-model="row.valueText" class="structured-field-value" @input="handleBusinessNodeStructuredChange" />
                <el-button link type="danger" :icon="Delete" @click="removeStructuredFieldRow(validationInputProjectionRows, row)">删除</el-button>
              </div>
              <el-button :icon="DocumentAdd" @click="addStructuredFieldRow(validationInputProjectionRows, 'validation.input')">添加输入投影</el-button>
              <strong>Expected Result</strong>
              <div v-for="row in validationExpectedResultRows" :key="row.id" class="structured-field-row">
                <select v-model="row.path" class="native-select structured-field-path" @change="handleBusinessNodeStructuredChange">
                  <option v-for="option in structuredPathOptions(validationExpectedResultRows)" :key="option" :value="option">
                    {{ option }}
                  </option>
                </select>
                <select v-model="row.valueKind" class="native-select structured-field-kind" @change="handleBusinessNodeStructuredChange">
                  <option value="reference">引用</option>
                  <option value="text">文本</option>
                  <option value="number">数字</option>
                  <option value="boolean">布尔</option>
                </select>
                <el-input v-model="row.valueText" class="structured-field-value" @input="handleBusinessNodeStructuredChange" />
                <el-button link type="danger" :icon="Delete" @click="removeStructuredFieldRow(validationExpectedResultRows, row)">删除</el-button>
              </div>
              <el-button :icon="DocumentAdd" @click="addStructuredFieldRow(validationExpectedResultRows, 'validation.expected')">添加期望结果</el-button>
              <strong>Issues</strong>
              <pre class="readonly-json-preview">{{ validationIssuesPreview }}</pre>
            </div>
          </details>

          <details class="editor-section collapsible-section" open>
            <summary>能力</summary>
            <div class="collapsible-body structured-editor">
              <details v-for="card in capabilityCards" :key="card.id" class="structured-card" open>
                <summary>{{ card.title || card.id }}</summary>
                <el-form label-position="top">
                  <el-form-item label="Title">
                    <el-input v-model="card.title" @input="handleBusinessNodeStructuredChange" />
                  </el-form-item>
                  <el-form-item label="Scope">
                    <select v-model="card.scope" class="native-select" @change="handleBusinessNodeStructuredChange">
                      <option value="node">node</option>
                      <option value="workflow">workflow</option>
                    </select>
                  </el-form-item>
                  <el-form-item label="Description">
                    <el-input v-model="card.description" type="textarea" :rows="2" @input="handleBusinessNodeStructuredChange" />
                  </el-form-item>
                </el-form>
                <el-button link type="danger" :icon="Delete" @click="removeCapabilityCard(card)">删除能力</el-button>
              </details>
              <el-button :icon="DocumentAdd" @click="addCapabilityCard">添加能力</el-button>
            </div>
          </details>

          <details class="editor-section collapsible-section">
            <summary>运行时只读</summary>
            <div class="collapsible-body structured-editor">
              <strong>State</strong>
              <pre class="readonly-json-preview">{{ runtimeStatePreview }}</pre>
              <strong>Result</strong>
              <pre class="readonly-json-preview">{{ runtimeResultPreview }}</pre>
            </div>
          </details>

          <details class="editor-section collapsible-section">
            <summary>JSON 只读预览</summary>
            <pre class="readonly-json-preview">{{ modelJsonText }}</pre>
          </details>
        </template>

      </template>
    </el-drawer>

    <el-drawer
      v-model="classModelDrawerVisible"
      class="class-model-drawer"
      direction="rtl"
      :size="'33vw'"
      title="ClassModel 知识"
    >
      <template v-if="selectedClassModelOption">
        <div class="class-model-doc-panel class-model-drawer-doc-panel">
          <section class="class-model-doc-item">
            <div class="class-model-doc-title">
              <span class="class-model-pin" aria-hidden="true"></span>
              <strong>{{ selectedClassModelOption.kind }}</strong>
            </div>
            <pre>{{ classModelDocText(selectedClassModelOption) }}</pre>
          </section>
          <section v-if="selectedClassModelOption.constructorSignature" class="class-model-doc-item">
            <div class="class-model-doc-title">
              <span class="class-model-pin" aria-hidden="true"></span>
              <strong>constructor</strong>
            </div>
            <code>{{ selectedClassModelOption.constructorSignature.signature }}</code>
            <pre>{{ classModelDocText(selectedClassModelOption.constructorSignature) }}</pre>
          </section>
          <section v-if="selectedValidationActionOption" class="class-model-doc-item">
            <div class="class-model-doc-title">
              <span class="class-model-pin" aria-hidden="true"></span>
              <strong>{{ selectedValidationActionOption.name }}</strong>
            </div>
            <code>{{ selectedValidationActionOption.signature }}</code>
            <pre>{{ classModelDocText(selectedValidationActionOption) }}</pre>
          </section>
          <details class="class-model-doc-group" open>
            <summary>Attributes {{ selectedClassModelOption.attributes.length }}</summary>
            <section
              v-for="attribute in selectedClassModelOption.attributes"
              :key="attribute.name"
              class="class-model-doc-item"
            >
              <div class="class-model-doc-title">
                <span class="class-model-pin" aria-hidden="true"></span>
                <strong>{{ attribute.name }}</strong>
                <code>{{ attribute.typeText }}</code>
              </div>
              <pre>{{ classModelDocText(attribute) }}</pre>
            </section>
          </details>
          <details class="class-model-doc-group" open>
            <summary>Actions {{ selectedClassModelOption.methods.length }}</summary>
            <section
              v-for="method in selectedClassModelOption.methods"
              :key="method.name"
              class="class-model-doc-item"
            >
              <div class="class-model-doc-title">
                <span class="class-model-pin" aria-hidden="true"></span>
                <strong>{{ method.name }}</strong>
              </div>
              <code>{{ method.signature }}</code>
              <pre>{{ classModelDocText(method) }}</pre>
            </section>
          </details>
        </div>
      </template>
      <el-empty v-else description="未加载 ClassModel" />
    </el-drawer>

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
            {{ definitionDirty ? 'unsaved' : 'saved' }}
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
  Upload,
} from '@element-plus/icons-vue'
import {
  addWorkflowDesignLine,
  autoLayoutWorkflowDesignGraphs,
  collectWorkflowDesignNodes,
  collectWorkflowDesignLines,
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
  removeWorkflowDesignLine,
  removeWorkflowDesignNode,
  saveWorkflowDefinition,
  saveWorkflowDesign,
  updateWorkflowDesignLine,
  type WorkflowDesignCapability,
  type WorkflowDesignDocument,
  type WorkflowDesignLineEndpoint,
  type WorkflowDesignLineView,
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
  modelDocText: string
  validationActionName: string
  validationActionDocText: string
}

type WorkflowFlowEdgeData = {
  edgeKey: string
}

type ClassModelMethodOption = {
  name: string
  jsdoc: string
  summary: string
  signature: string
}

type ClassModelAttributeOption = {
  name: string
  jsdoc: string
  summary: string
  typeText: string
}

type ClassModelConstructorOption = {
  jsdoc: string
  summary: string
  signature: string
}

type ClassModelOption = {
  kind: string
  jsdoc: string
  summary: string
  constructorSignature: ClassModelConstructorOption | null
  attributes: ClassModelAttributeOption[]
  methods: ClassModelMethodOption[]
}

type WorkflowFlowNode = Node<WorkflowFlowNodeData, Record<string, never>, 'workflow'>
type WorkflowFlowEdge = Edge<WorkflowFlowEdgeData>

type LineEndpointPatchValidationCommand = Readonly<{
  line: WorkflowDesignLineView
  from: WorkflowDesignLineEndpoint
  to: WorkflowDesignLineEndpoint
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

type StructuredValueKind = 'text' | 'number' | 'boolean' | 'reference'

type StructuredFieldRow = {
  id: string
  path: string
  valueKind: StructuredValueKind
  valueText: string
  valueBoolean: boolean
}

type StructuredSelectCard = {
  id: string
  value: string
}

type StructuredCapabilityCard = {
  id: string
  title: string
  scope: string
  description: string
  inputRows: StructuredFieldRow[]
  outputRows: StructuredFieldRow[]
  constraintCards: StructuredSelectCard[]
}

type ApplyStructuredEditorOptions = {
  silent?: boolean
}

const MIN_LEFT_PANEL_WIDTH = 220
const MAX_LEFT_PANEL_WIDTH = 480
const COLLAPSED_LEFT_PANEL_WIDTH = 48
const MIN_RIGHT_PANEL_WIDTH = 200
const MAX_RIGHT_PANEL_WIDTH = 320
const GRAPH_SPLIT_MIN_RATIO = 22
const GRAPH_SPLIT_MAX_RATIO = 78
const GRAPH_SPLIT_SNAP_RATIO = 12
const GRAPH_SPLIT_STORAGE_PREFIX = 'spark.workflow-design.graph-split.'
const UNREADABLE_WORKFLOW_DESIGN_STATUS = 'unreadable'
const UNREADABLE_WORKFLOW_DESIGN_FALLBACK_ERROR = '设计稿格式不兼容或文件不可读'
let structuredEditorId = 0

const designs = ref<WorkflowDesignSummary[]>([])
const currentWorkflowId = ref('')
const currentTimestamp = ref('')
const currentDocument = ref<WorkflowDesignDocument | null>(null)
const selectedNodeKey = ref('')
const selectedLineKey = ref('')
const propertiesDrawerVisible = ref(false)
const classModelDrawerVisible = ref(false)
const leftPanelCollapsed = ref(false)
const layoutResizeState = ref<LayoutResizeState | null>(null)
const graphSplitResizeState = ref<GraphSplitResizeState | null>(null)
const leftPanelWidth = ref(280)
const rightPanelWidth = ref(240)
const currentMainGraphKey = ref('workflow.graph')
const currentChildGraphKey = ref('')
const graphSplitRatio = ref(48)
const graphSplitCollapsed = ref<GraphSplitCollapse>(null)

const loadingList = ref(false)
const opening = ref(false)
const saving = ref(false)
const autoLayoutSaving = ref(false)
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
const modelRootClassText = ref('')
const modelClassText = ref('')
const validationActionClassText = ref('')
const validationActionNameText = ref('')
const classModelLoading = ref(false)
const classModelError = ref('')
const classModelGuideText = ref('')
const classModelOptions = ref<ClassModelOption[]>([])
const classModelLoadedRootText = ref('')
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
const lineFromNodeText = ref('')
const lineFromModelText = ref('')
const lineFromMemberText = ref('')
const lineToNodeText = ref('')
const lineToModelText = ref('')
const lineToMemberText = ref('')
const lineTypeText = ref('')
const lineFromDockText = ref('')
const lineToDockText = ref('')
const lineRelationText = ref('')
const businessInputRows = ref<StructuredFieldRow[]>([])
const businessOutputRows = ref<StructuredFieldRow[]>([])
const taskGoalText = ref('')
const taskRequirementRows = ref<StructuredFieldRow[]>([])
const taskContextInputRows = ref<StructuredFieldRow[]>([])
const allowedActionCards = ref<StructuredSelectCard[]>([])
const readableAttributeCards = ref<StructuredSelectCard[]>([])
const functionCallingModeText = ref('freeWithinModelContext')
const functionCallingConstraintCards = ref<StructuredSelectCard[]>([])
const structuredResultRows = ref<StructuredFieldRow[]>([])
const handoffToValidationValue = ref(true)
const validationInputProjectionRows = ref<StructuredFieldRow[]>([])
const validationExpectedResultRows = ref<StructuredFieldRow[]>([])
const validationStatusText = ref('')
const capabilityCards = ref<StructuredCapabilityCard[]>([])
const runtimeStatePreview = ref('{}')
const runtimeResultPreview = ref('{}')
const validationIssuesPreview = ref('[]')

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
const lineViews = computed(() => currentDocument.value === null ? [] : collectWorkflowDesignLines(currentDocument.value))
const businessNodes = computed(() => allNodes.value.filter(node => node.isBusinessNode))
const selectedNode = computed(() => allNodes.value.find(node => node.key === selectedNodeKey.value) ?? null)
const selectedLine = computed(() => lineViews.value.find(line => line.key === selectedLineKey.value) ?? null)
const selectedClassModelOption = computed(() => {
  return classModelOptions.value.find(item => item.kind === modelClassText.value.trim()) ?? null
})
const selectedClassModelMethods = computed(() => selectedClassModelOption.value?.methods ?? [])
const selectedValidationClassModelOption = computed(() => {
  return classModelOptions.value.find(item => item.kind === validationActionClassText.value.trim())
    ?? selectedClassModelOption.value
})
const selectedValidationActionOption = computed(() => {
  const methodName = validationActionNameText.value.trim()
  if (methodName.length === 0) return null
  return selectedValidationClassModelOption.value?.methods.find(method => method.name === methodName) ?? null
})
const propertiesDrawerTitle = computed(() => {
  if (selectedLine.value !== null) return `连线属性 / ${selectedLine.value.id}`
  if (selectedNode.value !== null) return `节点属性 / ${selectedNode.value.title}`
  return 'Properties'
})
const selectedLineGraphNodes = computed(() => {
  const line = selectedLine.value
  if (line === null) return []
  return allNodes.value.filter(node => node.graph === line.graph)
})
const rootClassOptions = computed(() => {
  const runtimeRoot = currentDocument.value?.workflow.runtimeBinding?.modelProjectionRef?.rootClassName
  return uniqueTexts([
    typeof runtimeRoot === 'string' ? runtimeRoot : '',
    modelRootClassText.value,
  ])
})
const modelClassOptions = computed(() => {
  return uniqueTexts([
    modelClassText.value,
    validationActionClassText.value,
    ...classModelOptions.value.map(item => item.kind),
  ])
})
const completionMemberOptions = computed(() => {
  return uniqueTexts([
    validationActionNameText.value,
    ...(selectedValidationClassModelOption.value?.methods ?? selectedClassModelMethods.value).map(method => method.name),
  ])
})
const modelAttributeOptions = computed(() => {
  return uniqueTexts(selectedClassModelOption.value?.attributes.map(attribute => attribute.name) ?? [])
})
const workflowVariableOptions = computed(() => {
  return uniqueTexts(currentDocument.value?.workflow.variables?.map(variable => variable.name) ?? [])
})
const structuredBasePathOptions = computed(() => {
  return uniqueTexts([
    ...workflowVariableOptions.value,
    ...modelAttributeOptions.value,
    ...selectedLineGraphNodes.value.flatMap(node => recordKeys(node.node.data?.outputs)),
  ])
})
const structuredReferenceOptions = computed(() => {
  const selected = selectedNode.value
  const incomingReferenceOptions = selected === null
    ? []
    : lineViews.value
      .filter(line => line.graph === selected.graph && line.toNodeId === selected.id)
      .flatMap(line => referenceOptionsForNodeId(line.fromNodeId, line.graph))
  return uniqueTexts([
    ...workflowVariableOptions.value.map(name => `{{ start.${name} }}`),
    ...modelAttributeOptions.value.map(name => `$model.${name}`),
    ...incomingReferenceOptions,
    ...allStructuredRows().map(row => row.valueText),
  ])
})
const workflowShellStyle = computed<CSSProperties>(() => {
  const leftWidth = leftPanelCollapsed.value ? COLLAPSED_LEFT_PANEL_WIDTH : leftPanelWidth.value
  const leftHandleWidth = leftPanelCollapsed.value ? 0 : 12
  return {
    gridTemplateColumns: `${leftWidth}px ${leftHandleWidth}px minmax(520px, 1fr) 8px ${rightPanelWidth.value}px`,
  }
})
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
const canAutoLayout = computed(() => canSave.value && !saving.value && !autoLayoutSaving.value)
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
    ensureSelectedNodeClassModelKnowledge()
  },
  { immediate: true },
)

watch(
  () => selectedLine.value?.key ?? '',
  () => syncLineEditorFromSelected(),
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
    selectedLineKey.value = ''
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
    await ElMessageBox.confirm(`确定删除工作流设计稿 ${normalizedWorkflowId}？`, '删除设计稿', {
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
      selectedLineKey.value = ''
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

function openNodeCreateDialogForCurrentGraph(): void {
  const graphView = currentMainGraphView.value
  if (graphView === null) return
  openNodeCreateDialog(graphView, 'node')
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
  selectedLineKey.value = ''
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
    await ElMessageBox.confirm(`确定删除节点 ${view.title}？相关连线也会被删除。`, '删除节点', {
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
  if (result.removedLines.length > 0) markWorkflowDesignDirty(document, `${view.scopePath}.lines`)
  selectedNodeKey.value = ''
  selectedLineKey.value = ''
  editorDirty.value = false
  ElMessage.success('节点已删除')
}

function startLayoutResize(event: PointerEvent, side: 'left' | 'right'): void {
  if (side === 'left' && leftPanelCollapsed.value) return
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
  selectedLineKey.value = ''
  selectedNodeKey.value = child.graph.nodes[0] !== undefined ? `${child.scopePath}:${child.graph.nodes[0].id}` : ''
  normalizeChildGraphSelection()
}

function returnMainGraphToParent(): void {
  const main = currentMainGraphView.value
  const parent = currentMainParentGraphView.value
  if (main === null || parent === null) return
  currentMainGraphKey.value = parent.key
  currentChildGraphKey.value = main.key
  selectedLineKey.value = ''
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
    && typeof value['modelDocText'] === 'string'
    && typeof value['validationActionName'] === 'string'
    && typeof value['validationActionDocText'] === 'string'
}

function isWorkflowFlowEdgeData(value: unknown): value is WorkflowFlowEdgeData {
  return isJsonRecord(value) && typeof value['edgeKey'] === 'string'
}

function readFlowEdgeFromEvent(value: unknown): WorkflowFlowEdge | null {
  if (!isJsonRecord(value)) return null
  const edge = value['edge']
  if (!isJsonRecord(edge) || typeof edge['id'] !== 'string' || typeof edge['source'] !== 'string' || typeof edge['target'] !== 'string') {
    return null
  }
  const data = edge['data']
  if (!isWorkflowFlowEdgeData(data)) return null
  return {
    id: edge['id'],
    source: edge['source'],
    target: edge['target'],
    data,
  }
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function uniqueTexts(values: readonly unknown[]): string[] {
  const result: string[] = []
  for (const value of values) {
    if (typeof value !== 'string') continue
    const normalized = value.trim()
    if (normalized.length > 0 && !result.includes(normalized)) result.push(normalized)
  }
  return result
}

function nextStructuredEditorId(prefix: string): string {
  structuredEditorId += 1
  return `${prefix}.${structuredEditorId}`
}

function recordKeys(value: unknown): string[] {
  return isJsonRecord(value) ? Object.keys(value).filter(key => key.trim().length > 0) : []
}

function allStructuredRows(): StructuredFieldRow[] {
  return [
    ...businessInputRows.value,
    ...businessOutputRows.value,
    ...taskRequirementRows.value,
    ...taskContextInputRows.value,
    ...structuredResultRows.value,
    ...validationInputProjectionRows.value,
    ...validationExpectedResultRows.value,
    ...capabilityCards.value.flatMap(card => [...card.inputRows, ...card.outputRows]),
  ]
}

function structuredPathOptions(rows: readonly StructuredFieldRow[]): string[] {
  return uniqueTexts([...structuredBasePathOptions.value, ...rows.map(row => row.path)])
}

function structuredValueOptions(row: StructuredFieldRow): string[] {
  return uniqueTexts([row.valueText, ...structuredReferenceOptions.value])
}

function lineModelOptions(nodeId: string, currentValue: string): string[] {
  const node = selectedLineGraphNodes.value.find(item => item.id === nodeId)
  if (node === undefined || node.isBoundaryNode) return uniqueTexts([currentValue, '$workflow'])
  const data = node.node.data
  const models = Array.isArray(data?.models) ? data.models.filter(isJsonRecord) : []
  return uniqueTexts([
    currentValue,
    ...models.map(model => readTextField(model, 'id')),
  ])
}

function lineMemberOptions(nodeId: string, currentValue: string): string[] {
  const line = selectedLine.value
  const graph = line?.graph
  const node = graph?.nodes.find(item => item.id === nodeId)
  if (node === undefined) return uniqueTexts([currentValue])
  return uniqueTexts([currentValue, ...referenceMemberOptionsForNode(node)])
}

function referenceOptionsForNodeId(nodeId: string, graph: WorkflowDesignGraphView['graph']): string[] {
  const node = graph.nodes.find(item => item.id === nodeId)
  if (node === undefined) return []
  return referenceMemberOptionsForNode(node).map(member => `{{ ${node.id}.${member} }}`)
}

function referenceMemberOptionsForNode(node: WorkflowDesignNodeView['node']): string[] {
  const nodeType = typeof node.data?.type === 'string' ? node.data.type : node.type
  if (nodeType === 'start') {
    return workflowVariableOptions.value
  }
  if (nodeType === 'output') {
    return recordKeys(node.data?.outputs)
  }
  return uniqueTexts([
    ...recordKeys(node.data?.outputs),
    ...modelAttributeOptions.value,
  ])
}

function structuredRowsFromRecord(value: unknown, prefix: string): StructuredFieldRow[] {
  if (!isJsonRecord(value)) return []
  const rows: StructuredFieldRow[] = []
  collectStructuredRows(value, '', rows, prefix)
  return rows
}

function collectStructuredRows(
  value: unknown,
  path: string,
  rows: StructuredFieldRow[],
  prefix: string,
): void {
  if (isJsonRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      collectStructuredRows(child, path.length === 0 ? key : `${path}.${key}`, rows, prefix)
    }
    return
  }
  if (Array.isArray(value)) {
    for (const [index, child] of value.entries()) {
      collectStructuredRows(child, path.length === 0 ? String(index) : `${path}.${index}`, rows, prefix)
    }
    return
  }
  rows.push(structuredRowFromValue(path, value, prefix))
}

function structuredRowFromValue(path: string, value: unknown, prefix: string): StructuredFieldRow {
  if (typeof value === 'boolean') {
    return {
      id: nextStructuredEditorId(prefix),
      path,
      valueKind: 'boolean',
      valueText: '',
      valueBoolean: value,
    }
  }
  if (typeof value === 'number') {
    return {
      id: nextStructuredEditorId(prefix),
      path,
      valueKind: 'number',
      valueText: Number.isFinite(value) ? String(value) : '0',
      valueBoolean: false,
    }
  }
  const text = typeof value === 'string' ? value : String(value ?? '')
  return {
    id: nextStructuredEditorId(prefix),
    path,
    valueKind: text.includes('{{') || text.startsWith('$') ? 'reference' : 'text',
    valueText: text,
    valueBoolean: false,
  }
}

function structuredRowsToRecord(rows: readonly StructuredFieldRow[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const row of rows) {
    const path = row.path.trim()
    if (path.length === 0) continue
    assignStructuredPath(result, path.split('.'), structuredRowValue(row))
  }
  return result
}

function structuredRowValue(row: StructuredFieldRow): unknown {
  if (row.valueKind === 'boolean') return row.valueBoolean
  if (row.valueKind === 'number') {
    const value = Number(row.valueText)
    return Number.isFinite(value) ? value : 0
  }
  return row.valueText
}

function assignStructuredPath(target: Record<string, unknown>, parts: string[], value: unknown): void {
  let cursor = target
  for (const [index, part] of parts.entries()) {
    if (part.length === 0) return
    if (index === parts.length - 1) {
      cursor[part] = value
      return
    }
    const existing = cursor[part]
    if (isJsonRecord(existing)) {
      cursor = existing
    } else {
      const created: Record<string, unknown> = {}
      cursor[part] = created
      cursor = created
    }
  }
}

function structuredCardsFromStrings(value: unknown, prefix: string): StructuredSelectCard[] {
  return Array.isArray(value)
    ? value
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map(item => ({ id: nextStructuredEditorId(prefix), value: item.trim() }))
    : []
}

function structuredCardsToStrings(cards: readonly StructuredSelectCard[]): string[] {
  return uniqueTexts(cards.map(card => card.value))
}

function capabilityCardsFromData(value: unknown): StructuredCapabilityCard[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isJsonRecord)
    .map((capability): StructuredCapabilityCard => ({
      id: readTextField(capability, 'id') || nextStructuredEditorId('capability'),
      title: readTextField(capability, 'title'),
      scope: readTextField(capability, 'scope') || 'node',
      description: readTextField(capability, 'description'),
      inputRows: structuredRowsFromRecord(capability['inputs'], 'capability.input'),
      outputRows: structuredRowsFromRecord(capability['outputs'], 'capability.output'),
      constraintCards: structuredCardsFromStrings(capability['constraints'], 'capability.constraint'),
    }))
}

function capabilityCardsToData(cards: readonly StructuredCapabilityCard[]): WorkflowDesignCapability[] {
  return cards.map(card => ({
    id: card.id,
    title: card.title,
    scope: card.scope,
    description: card.description,
    inputs: structuredRowsToRecord(card.inputRows),
    outputs: structuredRowsToRecord(card.outputRows),
    constraints: structuredCardsToStrings(card.constraintCards),
  }))
}

function dockHandle(dock: number | undefined, fallback: string): string {
  return typeof dock === 'number' && Number.isInteger(dock) && dock >= 0 ? `dock-${dock}` : fallback
}

function dockFromHandle(handle: string | null | undefined): number | undefined {
  if (typeof handle !== 'string' || handle.trim().length === 0) return undefined
  const match = /^dock-(\d+)$/u.exec(handle.trim())
  if (match !== null) return Number(match[1])
  const parsed = Number(handle)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined
}

function readDockText(dock: unknown): string {
  return typeof dock === 'number' && Number.isInteger(dock) && dock >= 0 ? String(dock) : ''
}

function parseDockText(value: string): number | undefined {
  const text = value.trim()
  if (text.length === 0) return undefined
  const parsed = Number(text)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined
}

function withConnectionEndpoint(
  endpoint: WorkflowDesignLineEndpoint,
  nodeId: string,
  handle: string | null | undefined,
): WorkflowDesignLineEndpoint {
  const { dock: _dock, ...rest } = endpoint
  const dock = dockFromHandle(handle)
  return {
    ...rest,
    nodeId,
    modelId: rest.modelId.trim().length > 0 ? rest.modelId : '$workflow',
    memberName: rest.memberName.trim().length > 0 ? rest.memberName : 'value',
    ...(dock === undefined ? {} : { dock }),
  }
}

function lineViewKey(graphView: WorkflowDesignGraphView, line: WorkflowDesignLineView['line']): string {
  const view = lineViews.value.find(item => item.graph === graphView.graph && item.line === line)
  if (view !== undefined) return view.key
  const index = graphView.graph.lines.indexOf(line)
  return `${graphView.scopePath}:line:${line.id ?? index}`
}

function createEditorLineEndpoint(
  nodeId: string,
  modelId: string,
  memberName: string,
  dockText: string,
): WorkflowDesignLineEndpoint {
  const dock = parseDockText(dockText)
  return {
    nodeId,
    modelId,
    memberName,
    ...(dock === undefined ? {} : { dock }),
  }
}

function isSameLineEndpoint(left: WorkflowDesignLineEndpoint, right: WorkflowDesignLineEndpoint): boolean {
  return left.nodeId === right.nodeId
    && left.modelId === right.modelId
    && left.memberName === right.memberName
}

function selectNode(key: string): void {
  if (key === selectedNodeKey.value) return
  if (editorDirty.value && !applySelectedDraft({ silent: false })) return
  selectedLineKey.value = ''
  selectedNodeKey.value = key
}

function selectLine(key: string): void {
  if (editorDirty.value && !applySelectedDraft({ silent: false })) return
  selectedNodeKey.value = ''
  selectedLineKey.value = key
}

function openNodeEditor(key: string): void {
  selectNode(key)
  if (selectedNodeKey.value === key) openPropertiesDrawer()
}

function openLineEditor(key: string): void {
  selectLine(key)
  if (selectedLineKey.value === key) openPropertiesDrawer()
}

function selectedNodeInGraph(graphView: WorkflowDesignGraphView | null): boolean {
  const node = selectedNode.value
  return graphView !== null && node !== null && node.graph === graphView.graph
}

function openPropertiesDrawer(): void {
  if (selectedNode.value === null && selectedLine.value === null) return
  propertiesDrawerVisible.value = true
  if (selectedNode.value?.isBusinessNode === true && classModelOptions.value.length === 0) {
    void refreshClassModelOptions()
  }
}

function openClassModelDrawer(): void {
  if (selectedClassModelOption.value === null) return
  classModelDrawerVisible.value = true
}

function handleLineEditorChange(): void {
  void applyLineEditorToSelected({ silent: true })
}

function nodesForGraph(graphView: WorkflowDesignGraphView): WorkflowDesignNodeView[] {
  return allNodes.value.filter(node => node.graph === graphView.graph)
}

function linesForGraph(graphView: WorkflowDesignGraphView): WorkflowDesignLineView[] {
  return lineViews.value.filter(line => line.graph === graphView.graph)
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
        modelDocText: readBusinessNodeModelDocText(view),
        validationActionName: readBusinessNodeValidationActionName(view),
        validationActionDocText: readBusinessNodeValidationActionDocText(view),
      },
    }
  })
}

function flowEdgesForGraph(graphView: WorkflowDesignGraphView): WorkflowFlowEdge[] {
  return linesForGraph(graphView).map((line) => {
    return {
      id: line.id,
      source: line.from.nodeId,
      target: line.to.nodeId,
      sourceHandle: dockHandle(line.from.dock, 'source'),
      targetHandle: dockHandle(line.to.dock, 'target'),
      data: {
        edgeKey: line.key,
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

function handlePanelFlowEdgeDoubleClick(event: unknown, graphView: WorkflowDesignGraphView | null): void {
  if (graphView === null) return
  const edge = readFlowEdgeFromEvent(event)
  const edgeData = edge?.data
  if (!isWorkflowFlowEdgeData(edgeData)) return
  const line = lineViews.value.find(item => item.key === edgeData.edgeKey)
  if (line !== undefined && line.graph === graphView.graph) openLineEditor(line.key)
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
        const edgeView = lineViews.value.find(e => e.graph === graphView.graph && e.id === change.id)
        if (edgeView) selectLine(edgeView.key)
      } else {
        const edgeView = selectedLine.value
        if (edgeView?.id === change.id && edgeView.graph === graphView.graph) selectedLineKey.value = ''
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
  const fromNodeId = connection.source.trim()
  const toNodeId = connection.target.trim()
  if (fromNodeId.length === 0 || toNodeId.length === 0) {
    ElMessage.warning('连线必须包含 From 和 To')
    return
  }
  if (fromNodeId === toNodeId) {
    ElMessage.warning('不能连接节点自身')
    return
  }

  const line = addWorkflowDesignLine(graphView.graph, fromNodeId, toNodeId)
  updateWorkflowDesignLine(line, {
    from: withConnectionEndpoint(line.from, fromNodeId, connection.sourceHandle),
    to: withConnectionEndpoint(line.to, toNodeId, connection.targetHandle),
  })
  markWorkflowDesignDirty(document, `${graphView.scopePath}.lines`)
  selectLine(lineViewKey(graphView, line))
  ElMessage.success('连线已创建')
}

function handleFlowEdgeUpdate(event: EdgeUpdateEvent, graphView: WorkflowDesignGraphView): void {
  const document = currentDocument.value
  if (document === null) return
  const data = event.edge.data
  if (!isWorkflowFlowEdgeData(data)) return
  const line = lineViews.value.find(item => item.key === data.edgeKey)
  if (line === undefined || line.graph !== graphView.graph) return

  const fromNodeId = event.connection.source.trim()
  const toNodeId = event.connection.target.trim()
  const from = withConnectionEndpoint(line.from, fromNodeId, event.connection.sourceHandle)
  const to = withConnectionEndpoint(line.to, toNodeId, event.connection.targetHandle)
  if (!validateLineEndpointPatch({ line, from, to, options: { silent: false } })) return

  updateWorkflowDesignLine(line.line, {
    from,
    to,
  })
  markWorkflowDesignDirty(document, `${line.scopePath}.lines`)
  editorDirty.value = false
  ElMessage.success('连线端点已更新')
  syncLineEditorFromSelected()
}

function deleteSelectedLine(): void {
  const line = selectedLine.value
  const document = currentDocument.value
  if (line === null || document === null) return
  if (!removeWorkflowDesignLine(line.graph, line.line)) return
  markWorkflowDesignDirty(document, `${line.scopePath}.lines`)
  selectedLineKey.value = ''
  ElMessage.success('连线已删除')
}

function validateLineEndpointPatch(command: LineEndpointPatchValidationCommand): boolean {
  const { line, from, to, options } = command
  const nodeIds = new Set(allNodes.value.filter(node => node.graph === line.graph).map(node => node.id))
  if (
    from.nodeId.length === 0
    || from.modelId.length === 0
    || from.memberName.length === 0
    || to.nodeId.length === 0
    || to.modelId.length === 0
    || to.memberName.length === 0
  ) {
    if (options.silent !== true) ElMessage.warning('连线必须填写 From/To 的 Node、Model 和 Member')
    return false
  }
  if (!nodeIds.has(from.nodeId) || !nodeIds.has(to.nodeId)) {
    if (options.silent !== true) ElMessage.warning('From/To Node 必须是当前 graph/subGraph 内的节点')
    return false
  }
  if (from.nodeId === to.nodeId) {
    if (options.silent !== true) ElMessage.warning('连线不能指向节点自身')
    return false
  }
  const duplicated = line.graph.lines.some(item => item !== line.line && isSameLineEndpoint(item.from, from) && isSameLineEndpoint(item.to, to))
  if (duplicated) {
    if (options.silent !== true) ElMessage.warning('同一 graph/subGraph 内已存在相同 From -> To 成员连线')
    return false
  }
  return true
}

function applyLineEditorToSelected(options: { silent?: boolean } = {}): boolean {
  const line = selectedLine.value
  const document = currentDocument.value
  if (line === null || document === null) return true

  const from = createEditorLineEndpoint(
    String(lineFromNodeText.value ?? '').trim(),
    String(lineFromModelText.value ?? '').trim(),
    String(lineFromMemberText.value ?? '').trim(),
    lineFromDockText.value,
  )
  const to = createEditorLineEndpoint(
    String(lineToNodeText.value ?? '').trim(),
    String(lineToModelText.value ?? '').trim(),
    String(lineToMemberText.value ?? '').trim(),
    lineToDockText.value,
  )
  if (!validateLineEndpointPatch({ line, from, to, options })) return false

  updateWorkflowDesignLine(line.line, {
    from,
    to,
    type: String(lineTypeText.value ?? '').trim() || 'custom',
    relation: String(lineRelationText.value ?? '').trim() || 'sequence',
  })
  markWorkflowDesignDirty(document, `${line.scopePath}.lines`)
  editorDirty.value = false
  if (options.silent !== true) ElMessage.success('连线已更新')
  return true
}

function markEditorDirty(): void {
  editorDirty.value = true
}

function clearBusinessNodeStructuredEditor(): void {
  businessInputRows.value = []
  businessOutputRows.value = []
  taskGoalText.value = ''
  taskRequirementRows.value = []
  taskContextInputRows.value = []
  allowedActionCards.value = []
  readableAttributeCards.value = []
  functionCallingModeText.value = 'freeWithinModelContext'
  functionCallingConstraintCards.value = []
  structuredResultRows.value = []
  handoffToValidationValue.value = true
  validationInputProjectionRows.value = []
  validationExpectedResultRows.value = []
  validationStatusText.value = ''
  capabilityCards.value = []
  runtimeStatePreview.value = '{}'
  runtimeResultPreview.value = '{}'
  validationIssuesPreview.value = '[]'
}

function syncEditorFromSelected(): void {
  const view = selectedNode.value
  editorDirty.value = false
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
    clearBusinessNodeStructuredEditor()
    return
  }
  nodeTypeText.value = view.nodeType
  nodeTitleText.value = view.title
  nodeDescText.value = typeof view.node.data?.desc === 'string' ? view.node.data.desc : ''
  modelJsonText.value = shouldEditNodeConfig(view) ? formatJson(view.node.data ?? {}) : '{}'
  syncBusinessModelEditorFromSelected(view)
  syncBusinessNodeStructuredEditorFromSelected(view)
  const loop = view.node.data?.loop
  loopModeText.value = typeof loop?.mode === 'string' && loop.mode.length > 0 ? loop.mode : 'progressive'
  loopMaxCountValue.value = typeof loop?.maxLoopCount === 'number' && Number.isFinite(loop.maxLoopCount) ? loop.maxLoopCount : 1
  const exitNodeId = typeof loop?.exitNodeId === 'string' && loop.exitNodeId.length > 0 ? loop.exitNodeId : '-'
  loopExitNodeText.value = exitNodeId === '-' ? '' : exitNodeId
}

function syncLineEditorFromSelected(): void {
  const line = selectedLine.value
  editorDirty.value = false
  if (line === null) {
    lineFromNodeText.value = ''
    lineFromModelText.value = ''
    lineFromMemberText.value = ''
    lineToNodeText.value = ''
    lineToModelText.value = ''
    lineToMemberText.value = ''
    lineTypeText.value = ''
    lineFromDockText.value = ''
    lineToDockText.value = ''
    lineRelationText.value = ''
    return
  }
  lineFromNodeText.value = line.from.nodeId
  lineFromModelText.value = line.from.modelId
  lineFromMemberText.value = line.from.memberName
  lineToNodeText.value = line.to.nodeId
  lineToModelText.value = line.to.modelId
  lineToMemberText.value = line.to.memberName
  lineTypeText.value = typeof line.line.type === 'string' ? line.line.type : 'custom'
  lineFromDockText.value = readDockText(line.from.dock)
  lineToDockText.value = readDockText(line.to.dock)
  const relation = line.line.data?.['relation']
  lineRelationText.value = typeof relation === 'string' ? relation : 'sequence'
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
  const model = readPrimaryBusinessNodeModel(view.node.data)
  const completion = isJsonRecord(model?.['completion']) ? model['completion'] : undefined
  modelRootClassText.value = readTextField(model, 'rootClassName')
  modelClassText.value = readTextField(model, 'className')
  validationActionClassText.value = modelClassText.value
  validationActionNameText.value = readTextField(completion, 'memberName')
  classModelError.value = ''
  classModelGuideText.value = ''
}

function syncBusinessNodeStructuredEditorFromSelected(view: WorkflowDesignNodeView): void {
  if (!view.isBusinessNode) {
    clearBusinessNodeStructuredEditor()
    return
  }
  const data = isJsonRecord(view.node.data) ? view.node.data : {}
  businessInputRows.value = structuredRowsFromRecord(data['inputs'], 'input')
  businessOutputRows.value = structuredRowsFromRecord(data['outputs'], 'output')
  const llm = isJsonRecord(data['llm']) ? data['llm'] : {}
  const task = isJsonRecord(llm['task']) ? llm['task'] : {}
  taskGoalText.value = readTextField(task, 'goal')
  taskRequirementRows.value = structuredRowsFromRecord(task['requirements'], 'task.requirement')
  taskContextInputRows.value = structuredRowsFromRecord(task['contextInputs'], 'task.context')
  const knowledge = isJsonRecord(llm['knowledge']) ? llm['knowledge'] : {}
  allowedActionCards.value = structuredCardsFromStrings(knowledge['allowedActions'], 'knowledge.action')
  readableAttributeCards.value = structuredCardsFromStrings(knowledge['readableAttributes'], 'knowledge.attribute')
  const functionCalling = isJsonRecord(llm['functionCalling']) ? llm['functionCalling'] : {}
  functionCallingModeText.value = readTextField(functionCalling, 'mode') || 'freeWithinModelContext'
  functionCallingConstraintCards.value = structuredCardsFromStrings(functionCalling['constraints'], 'function.constraint')
  const output = isJsonRecord(llm['output']) ? llm['output'] : {}
  structuredResultRows.value = structuredRowsFromRecord(output['structuredResult'], 'output.structured')
  handoffToValidationValue.value = typeof output['handoffToValidation'] === 'boolean'
    ? output['handoffToValidation']
    : true
  const validation = isJsonRecord(data['validation']) ? data['validation'] : {}
  const action = isJsonRecord(validation['action']) ? validation['action'] : {}
  validationActionClassText.value = readTextField(action, 'className') || validationActionClassText.value
  validationActionNameText.value = readTextField(action, 'actionName') || validationActionNameText.value
  validationInputProjectionRows.value = structuredRowsFromRecord(action['inputProjection'], 'validation.input')
  validationExpectedResultRows.value = structuredRowsFromRecord(action['expectedResult'], 'validation.expected')
  validationStatusText.value = readTextField(validation, 'status')
  validationIssuesPreview.value = formatJson(Array.isArray(validation['issues']) ? validation['issues'] : [])
  capabilityCards.value = capabilityCardsFromData(data['capabilities'])
  runtimeStatePreview.value = formatJson(isJsonRecord(data['state']) ? data['state'] : {})
  runtimeResultPreview.value = formatJson(isJsonRecord(data['result']) ? data['result'] : {})
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
  const model = readPrimaryBusinessNodeModel(view.node.data)
  if (!isJsonRecord(model)) return 'unbound model'
  const className = model['className']
  return typeof className === 'string' && className.trim().length > 0 ? className.trim() : 'unbound model'
}

function readBusinessNodeValidationActionName(view: WorkflowDesignNodeView): string {
  if (!view.isBusinessNode) return ''
  const model = readPrimaryBusinessNodeModel(view.node.data)
  const completion = isJsonRecord(model?.['completion']) ? model['completion'] : undefined
  const memberName = isJsonRecord(completion) ? completion['memberName'] : undefined
  return typeof memberName === 'string' && memberName.trim().length > 0 ? memberName.trim() : ''
}

function readBusinessNodeModelDocText(view: WorkflowDesignNodeView): string {
  const className = readBusinessNodeModelClassName(view)
  const option = classModelOptions.value.find(item => item.kind === className)
  return option === undefined ? '' : shortClassModelDocText(option)
}

function readBusinessNodeValidationActionDocText(view: WorkflowDesignNodeView): string {
  const className = readBusinessNodeModelClassName(view)
  const actionName = readBusinessNodeValidationActionName(view)
  const option = classModelOptions.value.find(item => item.kind === className)
  const method = option?.methods.find(item => item.name === actionName)
  return method === undefined ? '' : shortClassModelDocText(method)
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
        jsdoc: readTextField(model, 'jsdoc'),
        summary: readTextField(model, 'summary'),
        constructorSignature: readConstructorOption(model['constructorSignature']),
        attributes: readAttributeOptions(model['attributes']),
        methods: readMethodOptions(model['methods']),
      }
    })
    .filter((item): item is ClassModelOption => item !== null)
}

function readConstructorOption(value: unknown): ClassModelConstructorOption | null {
  if (!isJsonRecord(value)) return null
  const signature = readTextField(value, 'signature')
  if (signature.length === 0) return null
  return {
    jsdoc: readTextField(value, 'jsdoc'),
    summary: readTextField(value, 'summary'),
    signature,
  }
}

function readAttributeOptions(value: unknown): ClassModelAttributeOption[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isJsonRecord)
    .map((attribute): ClassModelAttributeOption | null => {
      const name = readTextField(attribute, 'name')
      if (name.length === 0) return null
      return {
        name,
        jsdoc: readTextField(attribute, 'jsdoc'),
        summary: readTextField(attribute, 'summary'),
        typeText: readTextField(attribute, 'typeText'),
      }
    })
    .filter((item): item is ClassModelAttributeOption => item !== null)
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
        jsdoc: readTextField(method, 'jsdoc'),
        summary: readTextField(method, 'summary'),
        signature: readTextField(method, 'signature'),
      }
    })
    .filter((item): item is ClassModelMethodOption => item !== null)
}

function readTextField(value: unknown, field: string): string {
  if (!isJsonRecord(value)) return ''
  const text = value[field]
  return typeof text === 'string' ? text.trim() : ''
}

function classModelDocText(item: Readonly<{ jsdoc?: string; summary?: string }>): string {
  const jsdoc = typeof item.jsdoc === 'string' ? item.jsdoc.trim() : ''
  if (jsdoc.length > 0) return jsdoc
  const summary = typeof item.summary === 'string' ? item.summary.trim() : ''
  return summary.length > 0 ? summary : 'No JSDoc.'
}

function shortClassModelDocText(item: Readonly<{ jsdoc?: string; summary?: string }>): string {
  const line = classModelDocText(item).split('\n').map(part => part.trim()).find(part => part.length > 0) ?? ''
  return line.length > 96 ? `${line.slice(0, 95)}...` : line
}

function readPrimaryBusinessNodeModel(data: unknown): Record<string, unknown> | null {
  if (!isJsonRecord(data)) return null
  const models = data['models']
  if (Array.isArray(models) && isJsonRecord(models[0])) return models[0]
  const legacyModel = data['model']
  return isJsonRecord(legacyModel) ? legacyModel : null
}

function ensurePrimaryBusinessNodeModel(data: Record<string, unknown>, nodeId: string): Record<string, unknown> {
  const models = Array.isArray(data['models']) ? [...data['models']] : []
  const primary = isJsonRecord(models[0]) ? models[0] : {}
  if (readTextField(primary, 'id').length === 0) primary['id'] = `${nodeId}.model`
  if (readTextField(primary, 'sourceRef').length === 0) primary['sourceRef'] = '$'
  models[0] = primary
  data['models'] = models
  delete data['model']
  return primary
}

function handleBusinessNodeStructuredChange(): void {
  applyBusinessNodeStructuredEditorToSelected({ silent: true })
}

function addStructuredFieldRow(rows: StructuredFieldRow[], prefix: string): void {
  const path = structuredPathOptions(rows)[0] ?? ''
  rows.push({
    id: nextStructuredEditorId(prefix),
    path,
    valueKind: 'reference',
    valueText: structuredReferenceOptions.value[0] ?? '',
    valueBoolean: false,
  })
  handleBusinessNodeStructuredChange()
}

function removeStructuredFieldRow(rows: StructuredFieldRow[], row: StructuredFieldRow): void {
  const index = rows.indexOf(row)
  if (index >= 0) rows.splice(index, 1)
  handleBusinessNodeStructuredChange()
}

function addSelectCard(cards: StructuredSelectCard[], options: readonly string[], prefix: string): void {
  cards.push({
    id: nextStructuredEditorId(prefix),
    value: options[0] ?? '',
  })
  handleBusinessNodeStructuredChange()
}

function removeSelectCard(cards: StructuredSelectCard[], card: StructuredSelectCard): void {
  const index = cards.indexOf(card)
  if (index >= 0) cards.splice(index, 1)
  handleBusinessNodeStructuredChange()
}

function addCapabilityCard(): void {
  capabilityCards.value.push({
    id: nextStructuredEditorId('capability'),
    title: 'Capability',
    scope: 'node',
    description: '',
    inputRows: [],
    outputRows: [],
    constraintCards: [],
  })
  handleBusinessNodeStructuredChange()
}

function removeCapabilityCard(card: StructuredCapabilityCard): void {
  const index = capabilityCards.value.indexOf(card)
  if (index >= 0) capabilityCards.value.splice(index, 1)
  handleBusinessNodeStructuredChange()
}

function applyBusinessNodeStructuredEditorToSelected(options: ApplyStructuredEditorOptions = {}): boolean {
  const view = selectedNode.value
  const document = currentDocument.value
  if (view === null || document === null || !view.isBusinessNode) return true
  view.node.data ??= {}
  const data = view.node.data
  const primaryModel = ensurePrimaryBusinessNodeModel(data, view.id)
  primaryModel['rootClassName'] = modelRootClassText.value.trim()
  primaryModel['className'] = modelClassText.value.trim()
  const completionMemberName = validationActionNameText.value.trim()
  if (completionMemberName.length > 0) {
    const completion = isJsonRecord(primaryModel['completion']) ? primaryModel['completion'] : {}
    primaryModel['completion'] = {
      ...completion,
      memberName: completionMemberName,
      returnContract: 'boolean-or-reason',
    }
  } else {
    delete primaryModel['completion']
  }
  data.inputs = structuredRowsToRecord(businessInputRows.value)
  data.outputs = structuredRowsToRecord(businessOutputRows.value)
  data.llm = {
    task: {
      goal: taskGoalText.value.trim(),
      requirements: structuredRowsToRecord(taskRequirementRows.value),
      contextInputs: structuredRowsToRecord(taskContextInputRows.value),
    },
    knowledge: {
      rootClassName: modelRootClassText.value.trim(),
      className: modelClassText.value.trim(),
      allowedActions: structuredCardsToStrings(allowedActionCards.value),
      readableAttributes: structuredCardsToStrings(readableAttributeCards.value),
    },
    functionCalling: {
      mode: functionCallingModeText.value.trim() || 'freeWithinModelContext',
      constraints: structuredCardsToStrings(functionCallingConstraintCards.value),
    },
    output: {
      structuredResult: structuredRowsToRecord(structuredResultRows.value),
      handoffToValidation: handoffToValidationValue.value,
    },
  }
  const existingValidation = isJsonRecord(data.validation) ? data.validation : {}
  data.validation = {
    ...existingValidation,
    action: {
      className: validationActionClassText.value.trim() || modelClassText.value.trim(),
      actionName: validationActionNameText.value.trim(),
      inputProjection: structuredRowsToRecord(validationInputProjectionRows.value),
      expectedResult: structuredRowsToRecord(validationExpectedResultRows.value),
    },
  }
  data.capabilities = capabilityCardsToData(capabilityCards.value)
  modelJsonText.value = formatJson(data)
  markWorkflowDesignDirty(document, `${view.scopePath}.${view.id}.data`)
  editorDirty.value = false
  if (options.silent !== true) ElMessage.success('节点配置已更新')
  return true
}

function applyBusinessModelEditorToSelected(options: { silent?: boolean } = {}): boolean {
  return applyBusinessNodeStructuredEditorToSelected(options)
}

function handleModelClassSelectionChange(): void {
  if (validationActionClassText.value.trim().length === 0) {
    validationActionClassText.value = modelClassText.value.trim()
  }
  handleBusinessNodeStructuredChange()
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
    classModelLoadedRootText.value = rootClassName
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

function ensureSelectedNodeClassModelKnowledge(): void {
  if (selectedNode.value?.isBusinessNode !== true || classModelLoading.value) return
  const rootClassName = modelRootClassText.value.trim()
  if (rootClassName.length === 0 || rootClassName === classModelLoadedRootText.value) return
  void refreshClassModelOptions()
}

async function loadValidationActionGuide(): Promise<void> {
  const rootClassName = modelRootClassText.value.trim()
  const className = validationActionClassText.value.trim() || modelClassText.value.trim()
  const methodName = validationActionNameText.value.trim()
  if (rootClassName.length === 0 || className.length === 0 || methodName.length === 0) {
    classModelError.value = 'Root Class, completion class and completion member are required.'
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
  if (selectedLine.value !== null) return applyLineEditorToSelected(options)
  const view = selectedNode.value
  if (view === null) {
    editorDirty.value = false
    return true
  }
  if (shouldEditNodeConfig(view)) {
    applyNodeBasicEditorToSelected()
    return applyBusinessNodeStructuredEditorToSelected({ silent: true })
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

async function autoLayoutCurrentDesign(): Promise<void> {
  const document = currentDocument.value
  if (document === null || currentWorkflowId.value.length === 0) return
  if (!applySelectedDraft({ silent: true })) return

  const result = autoLayoutWorkflowDesignGraphs(document)
  for (const graph of result.graphs) {
    if (graph.changedNodePositions) markWorkflowDesignDirty(document, `${graph.scopePath}.nodes`)
    if (graph.changedViewport) markWorkflowDesignDirty(document, `${graph.scopePath}.viewport`)
  }
  if (!result.changed && !hasUnsavedChanges.value) {
    ElMessage.info('当前工作流图已无需自动排版')
    return
  }

  autoLayoutSaving.value = true
  try {
    await saveCurrentDesign()
  } finally {
    autoLayoutSaving.value = false
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
    ElMessage.info('definition.json 不存在，已根据当前设计生成本地草稿')
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
    await ElMessageBox.confirm('当前工作流设计有未保存更改，是否继续并丢弃这些更改？', '切换工作流设计', {
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
    await ElMessageBox.confirm('当前 definition.json 有未保存更改，是否继续并丢弃这些更改？', '切换工作流设计', {
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
  padding: 12px;
  background: #f6f8fb;
}

.workflow-design-shell {
  display: grid;
  min-height: calc(100vh - 88px);
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

.workflow-design-sidebar.is-collapsed {
  display: grid;
  place-items: start center;
  padding: 8px 4px;
  overflow: hidden;
}

.workflow-sidebar-collapsed-button {
  display: grid;
  width: 36px;
  min-height: 92px;
  place-items: center;
  gap: 8px;
  padding: 8px 4px;
  border: 1px solid #dbe3ee;
  border-radius: 8px;
  color: #334155;
  cursor: pointer;
  background: #f8fafc;
}

.workflow-sidebar-collapsed-button span {
  writing-mode: vertical-rl;
  letter-spacing: 0;
}

.workflow-sidebar-collapsed-button strong {
  color: #0f766e;
  font-size: 12px;
}

.workflow-tool-sidebar {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
}

.workflow-tool-sidebar .panel-heading {
  margin-bottom: 2px;
}

.workflow-tool-group {
  display: grid;
  gap: 6px;
  padding: 8px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
}

.workflow-tool-group h3 {
  margin: 0 0 2px;
  color: #334155;
  font-size: 12px;
  font-weight: 700;
}

.workflow-tool-group :deep(.el-button) {
  width: 100%;
  justify-content: center;
  margin-left: 0;
  min-height: 28px;
  padding: 5px 6px;
  font-size: 12px;
}

.workflow-tool-button-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.workflow-tool-empty {
  padding: 7px 8px;
  border: 1px dashed #cbd5e1;
  border-radius: 6px;
  color: #94a3b8;
  font-size: 12px;
  text-align: center;
  background: #ffffff;
}

.workflow-tool-selection {
  display: grid;
  gap: 3px;
  padding: 6px;
  border: 1px solid #dbe3ee;
  border-radius: 6px;
  background: #ffffff;
}

.workflow-tool-selection strong,
.workflow-tool-selection span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-tool-selection strong {
  color: #111827;
  font-size: 13px;
}

.workflow-tool-selection span {
  color: #64748b;
  font-size: 12px;
}

.layout-resize-handle {
  align-self: stretch;
  cursor: col-resize;
  transition: background 0.16s ease;
}

.layout-resize-handle:hover {
  background: linear-gradient(90deg, transparent 4px, #cbd5e1 4px, #cbd5e1 8px, transparent 8px);
}

.layout-resize-handle.is-disabled {
  cursor: default;
  pointer-events: none;
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

.workflow-list-heading-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
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

.document-title-label {
  flex: 0 0 auto;
}

.document-title-id {
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
  content: ">";
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

.graph-node-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
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

.graph-class-model-strip {
  display: flex;
  min-height: 32px;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin: -2px 0 10px;
  padding: 6px 8px;
  border: 1px solid #dbe3ee;
  border-radius: 8px;
  background: #f8fafc;
  color: #334155;
  font-size: 12px;
}

.graph-class-model-strip strong {
  color: #111827;
}

.graph-class-model-strip-badge {
  padding: 3px 8px;
  border: 1px solid #dbe3ee;
  border-radius: 999px;
  background: #ffffff;
}

.graph-class-model-strip-spacer {
  flex: 1 1 auto;
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

.tool-name--pinned {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.tool-name--pinned .class-model-pin {
  width: 7px;
  height: 7px;
  border-width: 1px;
  box-shadow: none;
}

.node-jsdoc {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
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
.class-model-editor,
.structured-editor,
.properties-summary {
  display: grid;
  gap: 10px;
}

.properties-drawer :deep(.el-drawer__body),
.class-model-drawer :deep(.el-drawer__body) {
  overflow: auto;
  padding-top: 8px;
}

.structured-field-row,
.structured-card {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.structured-field-row {
  grid-template-columns: minmax(160px, 1fr) 130px minmax(220px, 2fr) auto;
  align-items: center;
}

.structured-card {
  padding: 10px;
  border: 1px solid #dbe3ee;
  border-radius: 8px;
  background: #f8fafc;
}

.structured-checkbox {
  width: 18px;
  height: 18px;
}

.class-model-catalog {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  color: #334155;
  font-size: 12px;
}

.class-model-pin {
  width: 9px;
  height: 9px;
  border: 2px solid #0f766e;
  border-radius: 50%;
  background: #ccfbf1;
  box-shadow: 0 0 0 2px #f0fdfa;
}

.class-model-doc-panel {
  display: grid;
  max-height: 420px;
  overflow: auto;
  gap: 8px;
  padding: 8px;
  border: 1px solid #dbe3ee;
  border-radius: 6px;
  background: #f8fafc;
}

.class-model-drawer-doc-panel {
  grid-template-columns: 1fr;
  max-height: none;
  padding: 0;
  border: 0;
  background: transparent;
}

.class-model-doc-group {
  display: grid;
  gap: 8px;
}

.class-model-doc-group > summary,
.class-model-doc-title {
  color: #334155;
  font-size: 12px;
  font-weight: 700;
}

.class-model-doc-item {
  display: grid;
  gap: 5px;
  padding: 8px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #ffffff;
}

.class-model-doc-title {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.class-model-doc-item code {
  color: #0f766e;
  font-size: 12px;
  white-space: normal;
  overflow-wrap: anywhere;
}

.class-model-doc-item pre {
  margin: 0;
  color: #475569;
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
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

.readonly-json-preview {
  max-height: 260px;
  overflow: auto;
  padding: 10px;
  border: 1px solid #dbe3ee;
  border-radius: 6px;
  background: #f8fafc;
  color: #0f172a;
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
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
