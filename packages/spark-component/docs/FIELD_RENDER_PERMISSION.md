# 字段渲染与数据权限匹配

展示如何在组件中实现字段级渲染与数据权限的匹配。

## 职责划分

**后端职责：权限裁决**
- 决定用户对每个字段有什么权限
- 随数据返回字段权限信息（editableFields、hiddenFields、maskedFields）
- 验证所有提交的数据是否符合权限

**前端职责：权限渲染**
- 根据后端返回的权限信息控制字段的显示/隐藏
- 根据权限信息控制字段的可编辑/只读状态
- 应用脱敏规则显示敏感数据

**重要提示：**
- 前端只负责 UI 渲染，不做权限裁决
- 用户绕过前端限制时，后端必须拦截
- 所有数据提交后端必须验证字段权限

## 核心概念

### 1. 字段配置（IFieldRenderConfig）
定义字段的基础渲染行为：
- `field`: 字段名
- `visible`: 基础可见性
- `editable`: 基础可编辑性
- `maskRule`: 自定义脱敏规则

### 2. 数据权限（IInstancePermission）
从后端返回，控制字段的实际权限：
- `editableFields`: 可编辑字段列表
- `hiddenFields`: 不可见字段列表
- `maskedFields`: 脱敏字段列表

### 3. 渲染状态（IFieldRenderState）
运行时计算的最终状态，**权限优先于配置**

## 权限优先级规则

```
1. hiddenFields（权限） > visible（配置）
2. editableFields（权限） > editable（配置）
3. maskedFields（权限） > maskRule（配置）
```

## 示例 1：Grid 组件中使用

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { 
  checkPermission,
  computeFieldStates,
  createPermissionChecker,
  type IFieldRenderConfig,
  type IFieldRenderState,
  type IPermissionDataRow
} from '@spark-view/spark-component'

// 字段配置
const fieldConfigs: IFieldRenderConfig[] = [
  { field: 'id', title: 'ID', visible: true, editable: false },
  { field: 'name', title: '姓名', visible: true, editable: true },
  { field: 'phone', title: '手机号', visible: true, editable: true },
  { field: 'email', title: '邮箱', visible: true, editable: true },
  { field: 'salary', title: '薪资', visible: true, editable: false }
]

// 数据（包含权限）
const data = ref<IPermissionDataRow[]>([
  {
    id: 1,
    name: "张三",
    phone: "13800138000",
    email: "zhangsan@example.com",
    salary: 8000,
    _perm: {
      allowDelete: false,
      editableFields: ["name", "email"],  // 只能编辑姓名和邮箱
      maskedFields: ["phone", "salary"]    // 手机号和薪资脱敏
    }
  }
])

// 权限检查器
const checker = createPermissionChecker()

// 计算每行的字段渲染状态
const computeRowFieldStates = (row: IPermissionDataRow) => {
  return computeFieldStates(fieldConfigs, row, checker)
}

// 获取某行的字段状态
const getFieldState = (row: IPermissionDataRow, field: string): IFieldRenderState | undefined => {
  const states = computeRowFieldStates(row)
  return states.find(s => s.field === field)
}
</script>

<template>
  <div>
    <!-- Grid 示例 -->
    <table>
      <thead>
        <tr>
          <th v-for="config in fieldConfigs" :key="config.field">
            {{ config.title }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in data" :key="row.id">
          <td v-for="config in fieldConfigs" :key="config.field">
            <template v-if="getFieldState(row, config.field)?.visible">
              <!-- 可编辑字段 -->
              <input
                v-if="getFieldState(row, config.field)?.editable"
                :value="getFieldState(row, config.field)?.displayValue"
              />
              <!-- 只读字段 -->
              <span v-else>
                {{ getFieldState(row, config.field)?.displayValue }}
              </span>
            </template>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
```

## 示例 2：Form 组件中使用

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { 
  computeFieldStates,
  createPermissionChecker,
  type IFieldRenderConfig,
  type IPermissionDataRow
} from '@spark-view/spark-component'

const fieldConfigs: IFieldRenderConfig[] = [
  { field: 'name', title: '姓名', editable: true },
  { field: 'phone', title: '手机号', editable: true },
  { field: 'password', title: '密码', editable: true },
  { field: 'salary', title: '薪资', editable: false }
]

const formData = ref<IPermissionDataRow>({
  name: "李四",
  phone: "13900139000",
  password: "",
  salary: 10000,
  _perm: {
    editableFields: ["name", "password"],  // 只能编辑姓名和密码
    hiddenFields: ["password"],            // 密码不显示
    maskedFields: ["phone", "salary"]      // 手机号和薪资脱敏
  }
})

const checker = createPermissionChecker()
const fieldStates = computed(() => 
  computeFieldStates(fieldConfigs, formData.value, checker)
)
</script>

<template>
  <form>
    <div v-for="state in fieldStates" :key="state.field">
      <!-- 可见字段 -->
      <div v-if="state.visible" class="form-item">
        <label>{{ fieldConfigs.find(c => c.field === state.field)?.title }}</label>
        
        <!-- 可编辑 -->
        <input
          v-if="state.editable"
          v-model="formData[state.field]"
          :type="state.field === 'password' ? 'password' : 'text'"
        />
        
        <!-- 只读 -->
        <span v-else>{{ state.displayValue }}</span>
      </div>
    </div>
  </form>
</template>
```

## 示例 3：动态列配置

```typescript
import { 
  filterVisibleFields,
  createPermissionChecker,
  type IFieldRenderConfig,
  type IPermissionDataRow
} from '@spark-view/spark-component'

// 所有字段配置
const allFields: IFieldRenderConfig[] = [
  { field: 'id', title: 'ID' },
  { field: 'name', title: '姓名' },
  { field: 'phone', title: '手机号' },
  { field: 'email', title: '邮箱' },
  { field: 'salary', title: '薪资' },
  { field: 'idCard', title: '身份证' }
]

// 数据行
const row: IPermissionDataRow = {
  id: 1,
  name: "王五",
  phone: "13700137000",
  email: "wangwu@example.com",
  salary: 12000,
  idCard: "330106199001011234",
  _perm: {
    editableFields: ["name", "email"],
    hiddenFields: ["salary", "idCard"],  // 薪资和身份证隐藏
    maskedFields: ["phone"]
  }
}

const checker = createPermissionChecker()

// 过滤出可见字段
const visibleFields = filterVisibleFields(allFields, row, checker)
// 结果：[id, name, phone, email]（排除了 salary 和 idCard）

console.log('可见字段:', visibleFields.map(f => f.field))
// 输出: ['id', 'name', 'phone', 'email']
```

## 示例 4：自定义脱敏规则

```typescript
import { 
  computeFieldState,
  createPermissionChecker,
  type IFieldRenderConfig,
  type IPermissionDataRow
} from '@spark-view/spark-component'

const config: IFieldRenderConfig = {
  field: 'bankCard',
  title: '银行卡号',
  visible: true,
  // 自定义脱敏规则（如果权限未指定脱敏，使用此规则）
  maskRule: (value) => {
    const str = String(value)
    if (str.length <= 8) return str
    return str.substring(0, 4) + '****' + str.substring(str.length - 4)
  }
}

const row: IPermissionDataRow = {
  bankCard: "6222021234567890123",
  _perm: {
    editableFields: [],
    maskedFields: []  // 未指定脱敏
  }
}

const checker = createPermissionChecker()
const state = computeFieldState(config, row, checker)

console.log(state.displayValue)
// 输出: "6222****0123"（使用自定义脱敏规则）
```

## 示例 5：组件封装

```vue
<!-- PermissionField.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { 
  computeFieldState,
  createPermissionChecker,
  type IFieldRenderConfig,
  type IPermissionDataRow
} from '@spark-view/spark-component'

const props = defineProps<{
  config: IFieldRenderConfig
  row: IPermissionDataRow
}>()

const checker = createPermissionChecker()
const state = computed(() => 
  computeFieldState(props.config, props.row, checker)
)
</script>

<template>
  <div v-if="state.visible" class="permission-field">
    <!-- 可编辑 -->
    <input 
      v-if="state.editable"
      :value="state.rawValue"
      @input="$emit('update', $event.target.value)"
    />
    
    <!-- 只读 -->
    <span v-else :class="{ 'masked': state.visibility === 'masked' }">
      {{ state.displayValue }}
    </span>
  </div>
</template>

<style scoped>
.masked {
  color: #999;
  font-style: italic;
}
</style>
```

使用封装的组件：

```vue
<template>
  <PermissionField
    v-for="config in fieldConfigs"
    :key="config.field"
    :config="config"
    :row="currentRow"
    @update="handleFieldUpdate(config.field, $event)"
  />
</template>
```

## 权限计算流程

```
1. 读取字段配置（IFieldRenderConfig）
   ↓
2. 读取数据权限（row._perm）
   ↓
3. 计算可见性
   - 检查 hiddenFields → Hidden
   - 检查 maskedFields → Masked
   - 默认 → Visible
   ↓
4. 应用配置的 visible
   - 权限 Hidden → 不可见
   - 配置 visible=false → 不可见
   - 其他 → 可见
   ↓
5. 计算可编辑性
   - 检查 editableFields → true/false
   ↓
6. 应用配置的 editable
   - 权限不可编辑 → 不可编辑
   - 配置 editable=false → 不可编辑
   - 其他 → 可编辑
   ↓
7. 计算显示值
   - Masked → 应用脱敏规则
   - Visible → 原始值
   - Hidden → 不显示
   ↓
8. 返回 IFieldRenderState
```

## API 总结

### 类型
- `IFieldRenderConfig`: 字段配置
- `IFieldRenderState`: 字段渲染状态
- `IFieldRenderHelper`: 渲染助手接口

### 方法
- `computeFieldState(config, row, checker)`: 计算单个字段状态
- `computeFieldStates(configs, row, checker)`: 批量计算字段状态
- `filterVisibleFields(configs, row, checker)`: 过滤可见字段

### 快捷方式
```typescript
import { 
  computeFieldState, 
  computeFieldStates, 
  filterVisibleFields 
} from '@spark-view/spark-component'
```
