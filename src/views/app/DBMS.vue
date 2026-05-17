<template>
  <div class="dbms-page">
    <div class="dbms-header">
      <div class="header-info">
        <h2>数据库管理</h2>
        <span class="subtitle">服务器 → 数据库 → 表（层级元数据管理）</span>
      </div>
      <div class="header-actions">
        <el-button type="primary" :icon="Plus" @click="openCreateServer">注册服务器</el-button>
      </div>
    </div>

    <div class="context-strip" aria-label="当前数据库管理层级">
      <div :class="['context-card', { active: selectedServer }]">
        <span class="context-label">01 服务器</span>
        <strong>{{ selectedServer?.SERVER_NAME ?? '未选择服务器' }}</strong>
        <span>{{ servers.length }} 个服务器</span>
      </div>
      <div :class="['context-card', { active: selectedDatabase, disabled: !selectedServer }]">
        <span class="context-label">02 数据库</span>
        <strong>{{ selectedDatabase?.DATABASE_NAME ?? '未选择数据库' }}</strong>
        <span>{{ selectedServer ? databases.length + ' 个数据库' : '待选择服务器' }}</span>
      </div>
      <div :class="['context-card', { active: selectedDatabase, disabled: !selectedDatabase }]">
        <span class="context-label">03 数据表</span>
        <strong>{{ selectedDatabase ? selectedDatabase.DATABASE_NAME : '未选择数据库' }}</strong>
        <span>{{ selectedDatabase ? tables.length + ' 张表' : '待选择数据库' }}</span>
      </div>
    </div>

    <div class="dbms-body">
      <!-- 服务器列表 -->
      <div class="panel panel-left">
        <div class="panel-header">
          <div class="panel-heading">
            <div class="panel-title-row">
              <span class="panel-index">01</span>
              <span class="panel-title">数据库服务器</span>
            </div>
            <div class="panel-meta">{{ loading.servers ? '加载中' : servers.length + ' 个服务器' }}</div>
          </div>
        </div>
        <div class="panel-body">
          <div v-if="loading.servers" class="loading"><el-icon class="is-loading"><Loading /></el-icon></div>
          <div v-else-if="!servers.length" class="empty">暂无服务器</div>
          <div
            v-for="srv in servers"
            :key="srv.ID"
            :class="['list-item', { active: selectedServer?.ID === srv.ID }]"
            @click="selectServer(srv)"
          >
            <div class="item-main">
              <span class="item-name" :title="srv.SERVER_NAME">{{ srv.SERVER_NAME }}</span>
              <div class="item-tags">
                <el-tag size="small" :type="isolationTagType(srv.ISOLATION_MODE)">
                  {{ isolationModeLabel(srv.ISOLATION_MODE) }}
                </el-tag>
              </div>
            </div>
            <div class="item-sub">{{ srv.HOST }}:{{ srv.PORT }} ({{ srv.DB_TYPE }})</div>
            <div class="item-actions" v-if="selectedServer?.ID === srv.ID">
              <el-button size="small" text @click.stop="testServerConnection(srv)" :loading="testingId === srv.ID">测试</el-button>
              <el-button size="small" text type="danger" @click.stop="deleteServerConfirm(srv)">删除</el-button>
            </div>
          </div>
        </div>
      </div>

      <!-- 数据库列表 -->
      <div class="panel panel-center">
        <div class="panel-header">
          <div class="panel-heading">
            <div class="panel-title-row">
              <span class="panel-index">02</span>
              <span class="panel-title">数据库</span>
            </div>
            <div class="panel-meta">
              {{ selectedServer ? selectedServer.SERVER_NAME + ' · ' + databases.length + ' 个数据库' : '待选择服务器' }}
            </div>
          </div>
          <el-button v-if="selectedServer" size="small" type="primary" :icon="Plus" @click="openCreateDatabase">注册数据库</el-button>
        </div>
        <div class="panel-body">
          <div v-if="!selectedServer" class="empty">请先选择服务器</div>
          <div v-else-if="loading.databases" class="loading"><el-icon class="is-loading"><Loading /></el-icon></div>
          <div v-else-if="!databases.length" class="empty">暂无数据库</div>
          <div
            v-for="db in databases"
            :key="db.ID"
            :class="['list-item', { active: selectedDatabase?.ID === db.ID }]"
            @click="selectDatabase(db)"
          >
            <div class="item-main">
              <span class="item-name" :title="db.DATABASE_NAME">{{ db.DATABASE_NAME }}</span>
              <div class="item-tags">
                <el-tag size="small" :type="isolationTagType(db.ISOLATION_MODE)">
                  {{ isolationModeLabel(db.ISOLATION_MODE) }}
                </el-tag>
                <el-tag size="small" :type="db.CONNECTION_MODE === 'JNDI_XA' ? 'success' : 'info'">
                  {{ db.CONNECTION_MODE === 'JNDI_XA' ? 'JNDI XA' : '直连' }}
                </el-tag>
              </div>
            </div>
            <div class="item-sub" v-if="db.CONNECTION_MODE === 'JNDI_XA'">{{ db.JNDI_NAME }}</div>
            <div class="item-actions" v-if="selectedDatabase?.ID === db.ID">
              <el-button size="small" text type="danger" @click.stop="deleteDatabaseConfirm(db)">删除</el-button>
            </div>
          </div>
        </div>
      </div>

      <!-- 表列表 -->
      <div class="panel panel-right">
        <div class="panel-header">
          <div class="panel-heading">
            <div class="panel-title-row">
              <span class="panel-index">03</span>
              <span class="panel-title">数据表</span>
            </div>
            <div class="panel-meta">
              {{ selectedDatabase ? selectedDatabase.DATABASE_NAME + ' · ' + tables.length + ' 张表' : '待选择数据库' }}
            </div>
          </div>
          <el-button v-if="selectedDatabase" size="small" type="primary" :icon="Plus" @click="openCreateTable">创建表</el-button>
        </div>
        <div class="panel-body">
          <div v-if="!selectedDatabase" class="empty">请先选择数据库</div>
          <div v-else-if="loading.tables" class="loading"><el-icon class="is-loading"><Loading /></el-icon></div>
          <div v-else-if="!tables.length" class="empty">暂无数据表</div>
          <div v-for="tbl in tables" :key="tbl.id" class="list-item">
            <div class="item-main">
              <span class="item-name" :title="tbl.tableName">{{ tbl.tableName }}</span>
              <div class="item-tags">
                <el-tag size="small" :type="isolationTagType(tbl.isolationMode)">
                  {{ isolationModeLabel(tbl.isolationMode) }}
                </el-tag>
              </div>
            </div>
            <div class="item-sub">{{ tbl.physicalTableName }}</div>
            <div class="item-actions">
              <el-button size="small" text @click="viewTableRelation(tbl)">关系</el-button>
              <el-button size="small" text type="danger" @click="deleteTableConfirm(tbl)">删除</el-button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 注册服务器 Dialog -->
    <el-dialog v-model="dlgServer.visible" title="注册数据库服务器" width="540px" @closed="resetServerForm">
      <el-form :model="dlgServer.form" label-width="100px">
        <el-form-item label="服务器名称"><el-input v-model="dlgServer.form.serverName" placeholder="如：生产主库" /></el-form-item>
        <el-form-item label="主机地址"><el-input v-model="dlgServer.form.host" placeholder="192.168.1.10" /></el-form-item>
        <el-form-item label="端口"><el-input-number v-model="dlgServer.form.port" :min="1" :max="65535" /></el-form-item>
        <el-form-item label="数据库类型">
          <el-select v-model="dlgServer.form.dbType"><el-option label="MySQL" value="mysql" /><el-option label="PostgreSQL" value="postgresql" /></el-select>
        </el-form-item>
        <el-form-item label="用户名"><el-input v-model="dlgServer.form.username" /></el-form-item>
        <el-form-item label="密码"><el-input v-model="dlgServer.form.password" type="password" show-password /></el-form-item>
        <el-form-item label="隔离模式" v-if="isPlatformAdmin">
          <el-radio-group v-model="dlgServer.form.isolationMode">
            <el-radio v-for="option in isolationModeOptions" :key="option.value" :value="option.value">{{ option.label }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="归属租户" v-if="dlgServer.form.isolationMode !== 'TENANT_SHARED'">
          {{ currentTenant }}（自动）
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlgServer.visible = false">取消</el-button>
        <el-button @click="testNewConnection" :loading="testingNew">测试连接</el-button>
        <el-button type="primary" @click="submitCreateServer" :loading="dlgServer.loading">注册</el-button>
      </template>
    </el-dialog>

    <!-- 注册数据库 Dialog -->
    <el-dialog v-model="dlgDb.visible" title="注册数据库" width="500px" @closed="resetDbForm">
      <el-form :model="dlgDb.form" label-width="100px">
        <el-form-item label="服务器">{{ selectedServer?.SERVER_NAME }} ({{ selectedServer?.HOST }}:{{ selectedServer?.PORT }})</el-form-item>
        <el-form-item label="数据库名"><el-input v-model="dlgDb.form.databaseName" placeholder="如：spark_crm" /></el-form-item>
        <el-form-item label="操作">
          <el-radio-group v-model="dlgDb.form.createNew">
            <el-radio :value="false">连接已有</el-radio>
            <el-radio :value="true">新建数据库</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="隔离模式">
          <el-radio-group v-model="dlgDb.form.isolationMode">
            <el-radio v-for="option in databaseIsolationOptions" :key="option.value" :value="option.value">{{ option.label }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="连接模式">
          <el-radio-group v-model="dlgDb.form.connectionMode">
            <el-radio value="DIRECT">直连</el-radio>
            <el-radio value="JNDI_XA">JNDI XA</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="JNDI 名称" v-if="dlgDb.form.connectionMode === 'JNDI_XA'">
          <el-input v-model="dlgDb.form.jndiName" placeholder="java:/jdbc/SparkOrdersXa" />
        </el-form-item>
        <template v-if="dlgDb.form.createNew">
          <el-form-item label="字符集"><el-input v-model="dlgDb.form.charset" placeholder="utf8mb4" /></el-form-item>
          <el-form-item label="排序规则"><el-input v-model="dlgDb.form.collation" placeholder="utf8mb4_unicode_ci" /></el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="dlgDb.visible = false">取消</el-button>
        <el-button type="primary" @click="submitCreateDatabase" :loading="dlgDb.loading">注册</el-button>
      </template>
    </el-dialog>

    <!-- 创建表 Dialog -->
    <el-dialog v-model="dlgTable.visible" title="创建数据表" width="600px" @closed="resetTableForm">
      <el-form :model="dlgTable.form" label-width="120px">
        <el-form-item label="逻辑表名"><el-input v-model="dlgTable.form.tableName" placeholder="如：CustomerOrders" /></el-form-item>
        <el-form-item label="物理表名（可选）"><el-input v-model="dlgTable.form.physicalTableName" placeholder="留空自动生成" /></el-form-item>
        <el-form-item label="隔离模式">
          <el-radio-group v-model="dlgTable.form.isolationMode">
            <el-radio v-for="option in tableIsolationOptions" :key="option.value" :value="option.value">{{ option.label }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="字段列表">
          <div v-for="(col, idx) in dlgTable.form.columns" :key="idx" class="column-row">
            <el-input v-model="col.name" placeholder="字段名" size="small" style="width: 140px" />
            <el-select v-model="col.type" size="small" style="width: 100px">
              <el-option label="String" value="string" /><el-option label="Integer" value="integer" />
              <el-option label="Number" value="number" /><el-option label="Boolean" value="boolean" />
              <el-option label="Date" value="date" /><el-option label="DateTime" value="datetime" />
              <el-option label="Text" value="text" />
            </el-select>
            <el-input-number v-model="col.maxLength" :min="0" :max="65535" size="small" placeholder="长度" style="width: 100px" />
            <el-checkbox v-model="col.primaryKey" size="small">PK</el-checkbox>
            <el-checkbox v-model="col.required" size="small">必填</el-checkbox>
            <el-button size="small" type="danger" :icon="Delete" circle @click="dlgTable.form.columns.splice(idx, 1)" />
          </div>
          <el-button size="small" @click="addColumn">+ 添加字段</el-button>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlgTable.visible = false">取消</el-button>
        <el-button type="primary" @click="submitCreateTable" :loading="dlgTable.loading">创建</el-button>
      </template>
    </el-dialog>

    <!-- 表关系 Dialog -->
    <el-dialog v-model="dlgRelation.visible" title="表关系管理" width="650px" @closed="resetRelationForm">
      <div class="relation-db-hint">数据库: {{ selectedDatabase?.DATABASE_NAME }}</div>
      <div class="relation-list" v-if="relations.length">
        <div v-for="rel in relations" :key="rel.ID" class="relation-row">
          <span class="rel-name">{{ rel.RELATION_NAME }}</span>
          <span class="rel-arrow">{{ rel.parentTableName }}.{{ rel.PARENT_FIELD }} → {{ rel.childTableName }}.{{ rel.CHILD_FIELD }}</span>
          <el-button size="small" type="danger" text @click="deleteRelation(rel.ID)">删除</el-button>
        </div>
      </div>
      <div v-else class="empty">暂无表关系</div>
      <el-divider />
      <div class="relation-form">
        <div class="rel-form-title">添加关系</div>
        <div class="rel-form-row">
          <el-select v-model="dlgRelation.form.parentTableId" placeholder="父表" size="small" style="width: 160px" @change="onParentTableChange">
            <el-option v-for="tbl in tables" :key="tbl.id" :label="tbl.tableName" :value="tbl.id" />
          </el-select>
          <span>.</span>
          <el-select v-model="dlgRelation.form.parentField" placeholder="字段" size="small" style="width: 140px">
            <el-option v-for="col in parentColumns" :key="col.name" :label="col.name" :value="col.name" />
          </el-select>
          <span style="margin: 0 6px">→</span>
          <el-select v-model="dlgRelation.form.childTableId" placeholder="子表" size="small" style="width: 160px" @change="onChildTableChange">
            <el-option v-for="tbl in tables" :key="tbl.id" :label="tbl.tableName" :value="tbl.id" />
          </el-select>
          <span>.</span>
          <el-select v-model="dlgRelation.form.childField" placeholder="字段" size="small" style="width: 140px">
            <el-option v-for="col in childColumns" :key="col.name" :label="col.name" :value="col.name" />
          </el-select>
          <el-button size="small" type="primary" @click="submitCreateRelation" :loading="dlgRelation.loading">创建</el-button>
        </div>
      </div>
      <template #footer>
        <el-button @click="dlgRelation.visible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { Plus, Loading, Delete } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getUser } from '@/services/auth'
import { http } from '@/services/http'
import { parseTenantScope } from '@/services/tenant-scope'

interface DbmsServer {
  ID: number
  SERVER_NAME: string
  HOST: string
  PORT: number
  DB_TYPE: string
  ISOLATION_MODE: IsolationMode
}

interface DbmsDatabase {
  ID: number
  SERVER_ID: number
  DATABASE_NAME: string
  ISOLATION_MODE: IsolationMode
  CONNECTION_MODE?: 'DIRECT' | 'JNDI_XA'
  JNDI_NAME?: string | null
}

interface DbmsColumn {
  name: string
  type?: string
  maxLength?: number | null
  primaryKey?: boolean
  required?: boolean
}

interface DbmsTable {
  id: number
  tableName: string
  physicalTableName?: string
  isolationMode: IsolationMode
  columns?: DbmsColumn[]
}

interface DbmsRelation {
  ID: number
  RELATION_NAME: string
  parentTableName: string
  PARENT_FIELD: string
  childTableName: string
  CHILD_FIELD: string
}

interface ApiMessage {
  success?: boolean
  message?: string
  error?: string
}

interface DatabaseCreatePayload {
  serverId: number
  databaseName: string
  isolationMode: IsolationMode
  createNew: boolean
  connectionMode: string
  jndiName?: string
  charset?: string
  collation?: string
}

interface TableCreatePayload {
  tableName: string
  databaseId: number
  isolationMode: IsolationMode
  columns: ColumnForm[]
  physicalTableName?: string
}

type IsolationMode = 'TENANT_SHARED' | 'TENANT_ISOLATED' | 'PROJECT_SHARED' | 'PROJECT_ISOLATED'
type TagType = 'primary' | 'success' | 'warning' | 'info' | 'danger'

const isolationModeOptions: Array<{ value: IsolationMode; label: string }> = [
  { value: 'TENANT_SHARED', label: '租户共享' },
  { value: 'TENANT_ISOLATED', label: '租户隔离' },
  { value: 'PROJECT_SHARED', label: '工程共享' },
  { value: 'PROJECT_ISOLATED', label: '工程隔离' },
]

const isolationModeRanks: Record<IsolationMode, number> = {
  TENANT_SHARED: 0,
  TENANT_ISOLATED: 1,
  PROJECT_SHARED: 2,
  PROJECT_ISOLATED: 3,
}

function isolationModeLabel(mode: string | undefined): string {
  const option = isolationModeOptions.find((item) => item.value === mode)
  return option?.label ?? `未知模式: ${mode ?? '空'}`
}

function isolationTagType(mode: string | undefined): TagType {
  if (mode === 'TENANT_SHARED') return 'success'
  if (mode === 'TENANT_ISOLATED') return 'warning'
  if (mode === 'PROJECT_SHARED') return 'info'
  if (mode === 'PROJECT_ISOLATED') return 'primary'
  return 'danger'
}

function isolationRank(mode: string | undefined): number | null {
  if (!mode || !(mode in isolationModeRanks)) return null
  return isolationModeRanks[mode as IsolationMode]
}

function childIsolationOptions(parentMode: string | undefined) {
  const parentRank = isolationRank(parentMode)
  if (parentRank === null) return []
  return isolationModeOptions.filter((option) => isolationModeRanks[option.value] >= parentRank)
}

function canContainIsolation(parentMode: string | undefined, childMode: string | undefined): boolean {
  const parentRank = isolationRank(parentMode)
  const childRank = isolationRank(childMode)
  return parentRank !== null && childRank !== null && childRank >= parentRank
}

const databaseIsolationOptions = computed(() => childIsolationOptions(selectedServer.value?.ISOLATION_MODE))
const tableIsolationOptions = computed(() => childIsolationOptions(selectedDatabase.value?.ISOLATION_MODE))

// ── 当前上下文 ──
const route = useRoute()
const user = computed(() => getUser())
const isPlatformAdmin = computed(() => {
  const roles = user.value?.roles
  return user.value?.tenantId === 'platform' && (roles?.includes('platform_admin') ?? false)
})
const currentTenant = computed(() => {
  const scoped = parseTenantScope(route.path)
  if (isPlatformAdmin.value && scoped) return scoped.tenantId
  if (!user.value?.tenantId) throw new Error('缺少 tenantId，无法加载 DBMS')
  return user.value.tenantId
})
const currentProject = computed(() => {
  const scoped = parseTenantScope(route.path)
  if (isPlatformAdmin.value && scoped) return scoped.projectId
  if (!user.value?.defaultProjectId) throw new Error('缺少 projectId，无法加载 DBMS')
  return user.value.defaultProjectId
})

const scopePath = computed(() => `/api/tenants/${currentTenant.value}/projects/${currentProject.value}`)

function apiErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message
  if (error && typeof error === 'object') {
    const response = (error as { response?: unknown }).response
    if (response && typeof response === 'object') {
      const payload = response as Record<string, unknown>
      const message = payload['error'] ?? payload['message']
      if (typeof message === 'string' && message.trim().length > 0) return message
    }
  }
  return String(error)
}

// ── 状态 ──
const loading = reactive({ servers: false, databases: false, tables: false })
const testingId = ref<number | null>(null)
const testingNew = ref(false)

const servers = ref<DbmsServer[]>([])
const databases = ref<DbmsDatabase[]>([])
const tables = ref<DbmsTable[]>([])
const relations = ref<DbmsRelation[]>([])

const selectedServer = ref<DbmsServer | null>(null)
const selectedDatabase = ref<DbmsDatabase | null>(null)

// ── 数据加载 ──
async function loadServers() {
  loading.servers = true
  try {
    servers.value = await http.get<DbmsServer[]>('/api/servers')
    if (selectedServer.value && !servers.value.some((srv) => srv.ID === selectedServer.value?.ID)) {
      selectedServer.value = null
      selectedDatabase.value = null
      databases.value = []
      tables.value = []
      relations.value = []
    }
  } catch (error) {
    ElMessage.error(`加载服务器失败: ${apiErrorMessage(error)}`)
    servers.value = []
  } finally { loading.servers = false }
}

async function loadDatabases() {
  if (!selectedServer.value) return
  const serverId = selectedServer.value.ID
  loading.databases = true
  try {
    const rows = await http.get<DbmsDatabase[]>(`${scopePath.value}/databases`, { serverId })
    if (selectedServer.value?.ID === serverId) databases.value = rows
  } catch (error) {
    if (selectedServer.value?.ID === serverId) {
      ElMessage.error(`加载数据库失败: ${apiErrorMessage(error)}`)
      databases.value = []
    }
  } finally { loading.databases = false }
}

async function loadTables() {
  if (!selectedDatabase.value) return
  const databaseId = selectedDatabase.value.ID
  loading.tables = true
  try {
    const rows = await http.get<DbmsTable[]>(`${scopePath.value}/data-model/tables`, { databaseId })
    if (selectedDatabase.value?.ID === databaseId) tables.value = rows
  } catch (error) {
    if (selectedDatabase.value?.ID === databaseId) {
      ElMessage.error(`加载数据表失败: ${apiErrorMessage(error)}`)
      tables.value = []
    }
  } finally { loading.tables = false }
}

async function loadRelations() {
  if (!selectedDatabase.value) return
  const databaseId = selectedDatabase.value.ID
  try {
    const rows = await http.get<DbmsRelation[]>(`${scopePath.value}/table-relations`, { databaseId })
    if (selectedDatabase.value?.ID === databaseId) relations.value = rows
  } catch (error) {
    if (selectedDatabase.value?.ID === databaseId) {
      ElMessage.error(`加载表关系失败: ${apiErrorMessage(error)}`)
      relations.value = []
    }
  }
}

// ── 选择 ──
function selectServer(srv: DbmsServer) {
  selectedServer.value = srv
  selectedDatabase.value = null
  databases.value = []
  tables.value = []
  relations.value = []
  void loadDatabases()
}

function selectDatabase(db: DbmsDatabase) {
  selectedDatabase.value = db
  tables.value = []
  relations.value = []
  void loadTables()
  void loadRelations()
}

// ── 服务器 Dialog ──
const dlgServer = reactive({
  visible: false,
  loading: false,
  form: { serverName: '', host: '', port: 3306, dbType: 'mysql', username: '', password: '', isolationMode: 'TENANT_ISOLATED' as IsolationMode }
})

function resetServerForm() {
  dlgServer.form = { serverName: '', host: '', port: 3306, dbType: 'mysql', username: '', password: '', isolationMode: 'TENANT_ISOLATED' }
}

function openCreateServer() {
  resetServerForm()
  dlgServer.visible = true
}

async function testNewConnection() {
  testingNew.value = true
  try {
    const data = await http.post<ApiMessage>('/api/servers/test-new', dlgServer.form)
    if (data.success) ElMessage.success('连接成功')
    else ElMessage.warning(data.message || '连接失败')
  } catch (error) { ElMessage.error(`测试请求失败: ${apiErrorMessage(error)}`) }
  finally { testingNew.value = false }
}

async function submitCreateServer() {
  dlgServer.loading = true
  try {
    await http.post<DbmsServer>('/api/servers', dlgServer.form)
    ElMessage.success('服务器注册成功')
    dlgServer.visible = false
    void loadServers()
  } catch (error) {
    ElMessage.error(`注册失败: ${apiErrorMessage(error)}`)
  } finally { dlgServer.loading = false }
}

async function testServerConnection(srv: DbmsServer) {
  testingId.value = srv.ID
  try {
    const data = await http.post<ApiMessage>(`/api/servers/${srv.ID}/test`)
    if (data.success) ElMessage.success('连接成功')
    else ElMessage.warning(data.message || '连接失败')
  } catch (error) {
    ElMessage.error(`测试失败: ${apiErrorMessage(error)}`)
  } finally { testingId.value = null }
}

async function deleteServerConfirm(srv: DbmsServer) {
  try {
    await ElMessageBox.confirm(`确定删除服务器 "${srv.SERVER_NAME}"？`, '确认删除', { type: 'warning' })
    await http.delete(`/api/servers/${srv.ID}`)
    ElMessage.success('已删除')
    if (selectedServer.value?.ID === srv.ID) {
      selectedServer.value = null
      selectedDatabase.value = null
      databases.value = []
      tables.value = []
      relations.value = []
    }
    void loadServers()
  } catch (error) {
    if (error instanceof Error && error.message === 'cancel') return
    ElMessage.error(`删除失败: ${apiErrorMessage(error)}`)
  }
}

// ── 数据库 Dialog ──
const dlgDb = reactive({
  visible: false,
  loading: false,
  form: { databaseName: '', createNew: false, isolationMode: 'PROJECT_ISOLATED' as IsolationMode, connectionMode: 'DIRECT', jndiName: '', charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' }
})

function resetDbForm() {
  dlgDb.form = { databaseName: '', createNew: false, isolationMode: 'PROJECT_ISOLATED', connectionMode: 'DIRECT', jndiName: '', charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' }
}

function openCreateDatabase() {
  resetDbForm()
  const first = databaseIsolationOptions.value[0]
  if (first) dlgDb.form.isolationMode = first.value
  dlgDb.visible = true
}

async function submitCreateDatabase() {
  dlgDb.loading = true
  try {
    const server = selectedServer.value
    if (!server) {
      ElMessage.warning('请先选择服务器')
      return
    }
    if (!canContainIsolation(server.ISOLATION_MODE, dlgDb.form.isolationMode)) {
      ElMessage.error('数据库隔离模式不能比服务器更宽')
      return
    }
    const body: DatabaseCreatePayload = {
      serverId: server.ID,
      databaseName: dlgDb.form.databaseName,
      isolationMode: dlgDb.form.isolationMode,
      createNew: dlgDb.form.createNew,
      connectionMode: dlgDb.form.connectionMode
    }
    if (dlgDb.form.connectionMode === 'JNDI_XA') body.jndiName = dlgDb.form.jndiName
    if (dlgDb.form.createNew) {
      body.charset = dlgDb.form.charset
      body.collation = dlgDb.form.collation
    }
    await http.post<DbmsDatabase>(`${scopePath.value}/databases`, body)
    ElMessage.success('数据库注册成功')
    dlgDb.visible = false
    void loadDatabases()
  } catch (error) {
    ElMessage.error(`注册失败: ${apiErrorMessage(error)}`)
  } finally { dlgDb.loading = false }
}

async function deleteDatabaseConfirm(db: DbmsDatabase) {
  try {
    await ElMessageBox.confirm(
      `确定删除数据库 "${db.DATABASE_NAME}"？`,
      '确认删除',
      { type: 'warning' }
    )
    await http.delete(`${scopePath.value}/databases/${db.ID}`, { dropPhysical: false })
    ElMessage.success('已删除')
    if (selectedDatabase.value?.ID === db.ID) {
      selectedDatabase.value = null
      tables.value = []
      relations.value = []
    }
    void loadDatabases()
  } catch (error) {
    if (error instanceof Error && error.message === 'cancel') return
    ElMessage.error(`删除失败: ${apiErrorMessage(error)}`)
  }
}

// ── 表 Dialog ──
interface ColumnForm { name: string; type: string; maxLength: number | null; primaryKey: boolean; required: boolean }
const dlgTable = reactive({
  visible: false,
  loading: false,
  form: { tableName: '', physicalTableName: '', isolationMode: 'PROJECT_ISOLATED' as IsolationMode, columns: [] as ColumnForm[] }
})

function resetTableForm() {
  dlgTable.form = { tableName: '', physicalTableName: '', isolationMode: 'PROJECT_ISOLATED', columns: [{ name: 'id', type: 'integer', maxLength: null, primaryKey: true, required: true }] }
}

function addColumn() {
  dlgTable.form.columns.push({ name: '', type: 'string', maxLength: 255, primaryKey: false, required: false })
}

function openCreateTable() {
  resetTableForm()
  const first = tableIsolationOptions.value[0]
  if (first) dlgTable.form.isolationMode = first.value
  dlgTable.visible = true
}

async function submitCreateTable() {
  dlgTable.loading = true
  try {
    const database = selectedDatabase.value
    if (!database) {
      ElMessage.warning('请先选择数据库')
      return
    }
    if (!canContainIsolation(database.ISOLATION_MODE, dlgTable.form.isolationMode)) {
      ElMessage.error('表隔离模式不能比数据库更宽')
      return
    }
    const body: TableCreatePayload = {
      tableName: dlgTable.form.tableName,
      databaseId: database.ID,
      isolationMode: dlgTable.form.isolationMode,
      columns: dlgTable.form.columns.map(c => ({ name: c.name, type: c.type, maxLength: c.maxLength, primaryKey: c.primaryKey, required: c.required }))
    }
    if (dlgTable.form.physicalTableName) body.physicalTableName = dlgTable.form.physicalTableName
    await http.post<DbmsTable>(`${scopePath.value}/data-model/tables`, body)
    ElMessage.success('表创建成功')
    dlgTable.visible = false
    void loadTables()
  } catch (error) {
    ElMessage.error(`创建失败: ${apiErrorMessage(error)}`)
  } finally { dlgTable.loading = false }
}

async function deleteTableConfirm(tbl: DbmsTable) {
  try {
    await ElMessageBox.confirm(`确定删除表 "${tbl.tableName}"？`, '确认删除', { type: 'warning' })
    await http.delete(`${scopePath.value}/data-model/tables/${encodeURIComponent(tbl.tableName)}`, { dropPhysical: false })
    ElMessage.success('已删除')
    void loadTables()
    void loadRelations()
  } catch (error) {
    if (error instanceof Error && error.message === 'cancel') return
    ElMessage.error(`删除失败: ${apiErrorMessage(error)}`)
  }
}

// ── 表关系 Dialog ──
const dlgRelation = reactive({
  visible: false,
  loading: false,
  form: { parentTableId: null as number | null, parentField: '', childTableId: null as number | null, childField: '' }
})
const parentColumns = ref<DbmsColumn[]>([])
const childColumns = ref<DbmsColumn[]>([])

function resetRelationForm() {
  dlgRelation.form = { parentTableId: null, parentField: '', childTableId: null, childField: '' }
  parentColumns.value = []
  childColumns.value = []
}

async function viewTableRelation(_tbl: DbmsTable) {
  await loadRelations()
  dlgRelation.visible = true
}

async function fetchTableColumns(tableId: number): Promise<DbmsColumn[]> {
  const tbl = tables.value.find((t) => t.id === tableId)
  if (!tbl) return []
  try {
    const full = await http.get<DbmsTable>(`${scopePath.value}/data-model/tables/${encodeURIComponent(tbl.tableName)}`)
    return (full.columns as DbmsColumn[]) ?? []
  } catch (error) {
    ElMessage.error(`加载字段失败: ${apiErrorMessage(error)}`)
    return []
  }
}

async function onParentTableChange(tableId: number) {
  parentColumns.value = await fetchTableColumns(tableId)
}

async function onChildTableChange(tableId: number) {
  childColumns.value = await fetchTableColumns(tableId)
}

async function submitCreateRelation() {
  const database = selectedDatabase.value
  if (!database) {
    ElMessage.warning('请先选择数据库')
    return
  }
  if (!dlgRelation.form.parentTableId || !dlgRelation.form.childTableId || !dlgRelation.form.parentField || !dlgRelation.form.childField) {
    ElMessage.warning('请填写完整的表关系信息')
    return
  }
  dlgRelation.loading = true
  try {
    await http.post<DbmsRelation>(`${scopePath.value}/table-relations`, {
      ...dlgRelation.form,
      databaseId: database.ID
    })
    ElMessage.success('表关系创建成功')
    resetRelationForm()
    void loadRelations()
  } catch (error) {
    ElMessage.error(`创建失败: ${apiErrorMessage(error)}`)
  } finally { dlgRelation.loading = false }
}

async function deleteRelation(id: number) {
  try {
    await http.delete(`${scopePath.value}/table-relations/${id}`)
    ElMessage.success('已删除')
    void loadRelations()
  } catch (error) {
    ElMessage.error(`删除失败: ${apiErrorMessage(error)}`)
  }
}

// ── 初始化 ──
onMounted(() => {
  void loadServers()
})
</script>

<style scoped>
.dbms-page {
  --dbms-text: #172033;
  --dbms-muted: #6f7d90;
  --dbms-border: #dce5f1;
  --dbms-panel: #ffffff;
  --dbms-accent: #2563eb;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-sizing: border-box;
  padding: 20px 24px 18px;
  color: var(--dbms-text);
  background: #f3f6fa;
}

.dbms-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.header-info {
  min-width: 0;
}

.dbms-header h2 {
  margin: 0;
  color: var(--dbms-text);
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: 0;
}

.subtitle {
  display: block;
  margin-top: 6px;
  color: var(--dbms-muted);
  font-size: 13px;
  line-height: 1.4;
}

.header-actions {
  flex-shrink: 0;
}

.context-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.context-card {
  position: relative;
  display: grid;
  min-width: 0;
  gap: 4px;
  overflow: hidden;
  padding: 12px 14px 12px 16px;
  border: 1px solid var(--dbms-border);
  border-radius: 8px;
  background: var(--dbms-panel);
  box-shadow: 0 10px 28px rgb(24 39 75 / 5%);
}

.context-card::before {
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: 0;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: #14b8a6;
  content: '';
}

.context-card:nth-child(2)::before {
  background: #3b82f6;
}

.context-card:nth-child(3)::before {
  background: #f59e0b;
}

.context-card.active {
  border-color: #9cc8ff;
  box-shadow: 0 12px 30px rgb(37 99 235 / 10%);
}

.context-card.disabled {
  color: #98a3b3;
  background: #f8fafc;
}

.context-label {
  color: #54708f;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
}

.context-card strong {
  overflow: hidden;
  color: var(--dbms-text);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.context-card.disabled strong {
  color: #8a96a6;
}

.context-card > span:last-child {
  overflow: hidden;
  color: var(--dbms-muted);
  font-size: 12px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dbms-body {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(260px, 0.95fr) minmax(300px, 1fr) minmax(360px, 1.05fr);
  gap: 14px;
  min-height: 0;
}

.panel {
  display: flex;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  flex-direction: column;
  border: 1px solid var(--dbms-border);
  border-radius: 8px;
  background: var(--dbms-panel);
  box-shadow: 0 14px 34px rgb(24 39 75 / 6%);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 68px;
  padding: 13px 14px;
  border-bottom: 1px solid var(--dbms-border);
  background: linear-gradient(180deg, #fbfcfe 0%, #f6f8fb 100%);
}

.panel-heading {
  min-width: 0;
}

.panel-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.panel-index {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: #e8f2ff;
  color: var(--dbms-accent);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.panel-left .panel-index {
  color: #0f766e;
  background: #e7f8f4;
}

.panel-right .panel-index {
  color: #b45309;
  background: #fff4df;
}

.panel-title {
  overflow: hidden;
  color: var(--dbms-text);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel-meta {
  overflow: hidden;
  margin-top: 5px;
  color: var(--dbms-muted);
  font-size: 12px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel-header :deep(.el-button) {
  flex-shrink: 0;
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px;
  background: linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%);
}

.list-item {
  position: relative;
  overflow: hidden;
  padding: 12px 13px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: #ffffff;
  cursor: pointer;
  transition: border-color .15s ease, background .15s ease, box-shadow .15s ease, transform .15s ease;
}

.list-item + .list-item {
  margin-top: 8px;
}

.list-item:hover {
  border-color: #cdddf0;
  background: #fbfdff;
  box-shadow: 0 8px 20px rgb(24 39 75 / 7%);
  transform: translateY(-1px);
}

.list-item.active {
  border-color: #7eb8f4;
  background: linear-gradient(90deg, #eef7ff 0%, #ffffff 78%);
  box-shadow: inset 0 0 0 1px rgb(64 158 255 / 18%), 0 10px 22px rgb(37 99 235 / 9%);
}

.list-item.active::before {
  position: absolute;
  top: 10px;
  bottom: 10px;
  left: 0;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--dbms-accent);
  content: '';
}

.panel-right .list-item {
  cursor: default;
}

.item-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.item-name {
  overflow: hidden;
  min-width: 0;
  color: #263244;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-tags {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.item-tags :deep(.el-tag) {
  flex-shrink: 0;
  border-radius: 4px;
  font-weight: 600;
}

.item-sub {
  overflow: hidden;
  margin-top: 6px;
  color: var(--dbms-muted);
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-actions {
  display: flex;
  gap: 6px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #edf2f7;
}

.item-actions :deep(.el-button) {
  font-weight: 600;
}

.loading,
.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 128px;
  border: 1px dashed #d8e2ee;
  border-radius: 8px;
  color: var(--dbms-muted);
  background: #f8fafc;
  font-size: 13px;
}

.loading .el-icon {
  font-size: 18px;
}

.column-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.relation-list {
  max-height: 200px;
  overflow-y: auto;
}

.relation-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid #f0f0f0;
}

.rel-name {
  min-width: 120px;
  font-weight: 500;
}

.rel-arrow {
  flex: 1;
  color: #606266;
  font-size: 13px;
}

.relation-db-hint {
  margin-bottom: 8px;
  color: var(--dbms-muted);
  font-size: 13px;
}

.rel-form-title {
  margin-bottom: 8px;
  font-weight: 600;
}

.rel-form-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

@media (max-width: 1200px) {
  .dbms-page {
    padding: 16px;
  }

  .dbms-body {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  .panel {
    min-height: 320px;
  }
}

@media (max-width: 760px) {
  .dbms-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .context-strip {
    grid-template-columns: 1fr;
  }

  .panel-header {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
