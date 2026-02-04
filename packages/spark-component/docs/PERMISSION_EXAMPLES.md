# 权限系统使用示例

展示如何在 SPARK 组件中使用权限系统。

## 后端数据格式

```typescript
// 模型级权限（表级）
// 说明：导出和批量删除通过实例级权限计算，无需在模型级定义
const response = {
  rows: [...],
  permission: {
    allowCreate: true,      // 允许新增
    allowImport: false      // 不允许导入
  }
}

// 实例级权限（行级）
const user = {
  id: 1,
  name: "张三",
  phone: "13800138000",
  idCard: "330106199001011234",
  email: "zhangsan@example.com",
  salary: 8000,
  
  // 权限字段
  _perm: {
    allowDelete: false,                     // 不允许删除
    editableFields: ["name", "email"],      // name 和 email 可编辑，其他字段只读
    maskedFields: ["phone", "idCard"],      // 手机号和身份证脱敏
    hiddenFields: []                        // 无隐藏字段
  }
}
```

## 示例 1：Grid 组件使用权限

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { 
  checkPermission, 
  filterByPermission,
  type IPermissionDataSet,
  type IPermissionDataRow 
} from '@spark-view/spark-component'

const props = defineProps<{
  dataSource: IPermissionDataSet
}>()

// 获取模型权限
const modelPermission = computed(() => props.dataSource.permission)

// 检查是否可新增
const canCreate = computed(() => 
  checkPermission.canCreate(modelPermission.value)
)

// 过滤出可删除的行
const deletableRows = computed(() => 
  filterByPermission.deletableRows(props.dataSource.rows)
)

// 应用脱敏
const maskedRows = computed(() => 
  filterByPermission.applyMaskingToAll(props.dataSource.rows)
)

// 处理新增
function handleCreate() {
  if (!canCreate.value) {
    ElMessage.warning('无新增权限')
    return
  }
  // 执行新增逻辑
}

// 处理删除
function handleDelete(row: IPermissionDataRow) {
  if (!checkPermission.canDelete(row)) {
    ElMessage.warning('无删除权限')
    return
  }
  // 执行删除逻辑
}

// 处理编辑
function handleEdit(row: IPermissionDataRow) {
  if (!checkPermission.canEdit(row)) {
    ElMessage.warning('无编辑权限')
    return
  }
  // 执行编辑逻辑
}

// 检查字段是否可编辑
function isFieldEditable(field: string, row: IPermissionDataRow): boolean {
  return checkPermission.isFieldEditable(field, row)
}
</script>

<template>
  <div>
    <!-- 工具栏 -->
    <div class="toolbar">
      <el-button 
        v-if="canCreate" 
        type="primary" 
        @click="handleCreate"
      >
        新增
      </el-button>
      <el-button 
        :disabled="deletableRows.length === 0"
        @click="handleBatchDelete"
      >
        批量删除 ({{ deletableRows.length }})
      </el-button>
    </div>

    <!-- 表格 -->
    <el-table :data="maskedRows">
      <el-table-column prop="name" label="姓名" />
      <el-table-column prop="phone" label="手机号" />
      <el-table-column prop="email" label="邮箱" />
      
      <el-table-column label="操作" width="200">
        <template #default="{ row }">
          <el-button 
            link 
            type="primary"
            :disabled="!checkPermission.canEdit(row)"
            @click="handleEdit(row)"
          >
            编辑
          </el-button>
          <el-button 
            link 
            type="danger"
            :disabled="!checkPermission.canDelete(row)"
            @click="handleDelete(row)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>
```

## 示例 2：Form 组件使用权限

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { 
  checkPermission,
  type IPermissionDataRow 
} from '@spark-view/spark-component'

const props = defineProps<{
  data: IPermissionDataRow
}>()

// 获取可编辑字段列表
const editableFields = computed(() => {
  const perm = props.data._perm
  if (perm?.editableFields && perm.editableFields.length > 0) {
    return perm.editableFields
  }
  return Object.keys(props.data).filter(
    key => !key.startsWith('_') && 
           checkPermission.isFieldEditable(key, props.data)
  )
})

// 检查字段是否只读
function isReadonly(field: string): boolean {
  return !checkPermission.isFieldEditable(field, props.data)
}

// 检查字段是否可见
function isVisible(field: string): boolean {
  return checkPermission.isFieldVisible(field, props.data)
}
</script>

<template>
  <el-form :model="data">
    <el-form-item 
      v-if="isVisible('name')" 
      label="姓名"
    >
      <el-input 
        v-model="data.name" 
        :readonly="isReadonly('name')"
      />
    </el-form-item>

    <el-form-item 
      v-if="isVisible('phone')" 
      label="手机号"
    >
      <el-input 
        v-model="data.phone" 
        :readonly="isReadonly('phone')"
      />
    </el-form-item>

    <el-form-item 
      v-if="isVisible('salary')" 
      label="薪资"
    >
      <el-input 
        v-model="data.salary" 
        :readonly="isReadonly('salary')"
      />
    </el-form-item>
  </el-form>
</template>
```

## 示例 3：页面脚本中使用

```javascript
// public/pages-config/users/script.js

function __init__() {
  const dataSet = $dataSet
  const users = dataSet.getTable('Users')
  
  // 监听数据加载成功
  dataSet.on('loadSuccess', ({ tableName }) => {
    if (tableName === 'Users') {
      console.log('用户数据加载完成')
      
      // 检查权限
      const modelPerm = $data.permission
      if (modelPerm?.allowCreate === false) {
        // 隐藏新增按钮
        const createBtn = document.querySelector('#btnCreate')
        if (createBtn) {
          createBtn.style.display = 'none'
        }
      }
    }
  })
}

// 处理编辑按钮点击
function handleEdit(row) {
  // 检查实例权限（editableFields 有值即可编辑）
  const editableFields = row._perm?.editableFields || []
  if (editableFields.length === 0) {
    ElMessage.warning('此用户不允许编辑')
    return
  }
  
  console.log('可编辑字段:', editableFields)
  
  // 打开编辑对话框
  $data.editDialog = {
    visible: true,
    data: row,
    editableFields
  }
}

// 处理删除按钮点击
function handleDelete(row) {
  // 检查实例权限
  if (row._perm?.allowDelete === false) {
    ElMessage.warning('此用户不允许删除')
    return
  }
  
  ElMessageBox.confirm(
    `确定删除用户 "${row.name}" 吗？`,
    '确认删除',
    {
      type: 'warning'
    }
  ).then(() => {
    // 执行删除逻辑
    const users = $dataSet.getTable('Users')
    users.deleteRow(row)
    ElMessage.success('删除成功')
  })
}

// 批量删除
function handleBatchDelete() {
  const users = $dataSet.getTable('Users')
  const selectedRows = users.selectedRows || []
  
  // 过滤出可删除的行
  const deletableRows = selectedRows.filter(
    row => row._perm?.allowDelete !== false
  )
  
  if (deletableRows.length === 0) {
    ElMessage.warning('没有可删除的用户')
    return
  }
  
  if (deletableRows.length < selectedRows.length) {
    ElMessage.warning(
      `选中 ${selectedRows.length} 个用户，其中 ${deletableRows.length} 个可删除`
    )
  }
  
  ElMessageBox.confirm(
    `确定删除选中的 ${deletableRows.length} 个用户吗？`,
    '批量删除',
    {
      type: 'warning'
    }
  ).then(() => {
    // 执行批量删除
    deletableRows.forEach(row => {
      users.deleteRow(row)
    })
    ElMessage.success(`已删除 ${deletableRows.length} 个用户`)
  })
}
```

## 示例 4：自定义脱敏规则

```typescript
import { 
  PermissionChecker, 
  type IPermissionDataRow,
  type IFieldPermission,
  FieldVisibility 
} from '@spark-view/spark-component'

// 扩展权限检查器，添加自定义脱敏规则
class CustomPermissionChecker extends PermissionChecker {
  maskFieldValue(field: string, value: any, row: IPermissionDataRow): string {
    // 自定义脱敏逻辑
    if (field === 'salary') {
      // 薪资脱敏：显示范围
      const salary = Number(value)
      if (salary < 5000) return '0-5K'
      if (salary < 10000) return '5K-10K'
      if (salary < 20000) return '10K-20K'
      return '20K+'
    }
    
    // 其他字段使用默认规则
    return super.maskFieldValue(field, value, row)
  }
}

// 使用自定义检查器
const checker = new CustomPermissionChecker()
const maskedSalary = checker.maskFieldValue('salary', 8000, user)
console.log(maskedSalary) // "5K-10K"
```

## 示例 5：组件能力系统集成

```typescript
// SparkEJ2Grid.vue
import { useSparkComponent } from '@spark-view/spark-component'
import { 
  createPermissionChecker, 
  createPermissionFilter,
  type IDataComponent,
  type IComponentPermission 
} from '@spark-view/spark-component'

const { provide } = useSparkComponent({
  id: props.id,
  type: 'spark-ej2-grid'
})

const checker = createPermissionChecker()
const filter = createPermissionFilter()
const permission = ref<IComponentPermission>({
  visible: true,
  disabled: false,
  readonly: false
})

// 提供权限管理能力
provide('permissionManager', {
  implementation: {
    getPermission: () => permission.value,
    
    updatePermission: (newPerm: Partial<IComponentPermission>) => {
      Object.assign(permission.value, newPerm)
    },
    
    check: checker,
    filter: filter
  }
})

// 提供数据组件能力
provide('dataComponent', {
  implementation: {
    async refresh() {
      // 刷新数据逻辑
    },
    
    async reload() {
      // 重新加载数据逻辑
    },
    
    show() {
      permission.value.visible = true
    },
    
    hide() {
      permission.value.visible = false
    },
    
    setReadonly(readonly: boolean) {
      permission.value.readonly = readonly
    },
    
    setDisabled(disabled: boolean) {
      permission.value.disabled = disabled
    },
    
    getPermission() {
      return permission.value
    },
    
    setPermission(newPerm: Partial<IComponentPermission>) {
      Object.assign(permission.value, newPerm)
    }
  } as IDataComponent
})
```

## 权限数据流

```
┌─────────────┐
│   后端 API   │
└──────┬──────┘
       │
       │ 返回数据 + 权限
       ▼
┌─────────────────────┐
│   PageRenderer       │
│   加载 pagedata.json │
└──────┬──────────────┘
       │
       │ 初始化 DataSet
       ▼
┌─────────────────────┐
│   DataSet.tables    │
│   rows 包含 _perm   │
└──────┬──────────────┘
       │
       │ 数据绑定
       ▼
┌─────────────────────┐
│   Grid 组件         │
│   应用权限控制      │
└─────────────────────┘
       │
       ├─→ 隐藏新增按钮（allowCreate: false）
       ├─→ 禁用删除按钮（allowDelete: false）
       ├─→ 字段可编辑（editableFields）
       └─→ 字段脱敏（maskedFields）
```

## 最佳实践

1. **权限字段命名约定**
   - 使用 `_perm` 作为实例权限字段名
   - 使用 `permission` 作为模型权限字段名

2. **默认值原则**
   - 未指定权限时，默认允许所有操作
   - 显式设置 `false` 才禁用

3. **前端校验 + 后端验证**
   - 前端权限只是 UI 控制，不能替代后端验证
   - 后端必须二次验证所有操作权限

4. **性能优化**
   - 大数据量时，使用计算属性缓存权限检查结果
   - 避免在循环中重复调用权限检查

5. **错误处理**
   - 权限不足时，给用户明确的提示
   - 记录权限拒绝日志，便于审计
