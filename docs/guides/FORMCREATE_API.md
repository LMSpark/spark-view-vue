# Form-Create API 完全指南

> 本文档整理了项目中使用的 form-create API，包括实际用例和最佳实践。

## 📚 目录

1. [API 实例获取](#api-实例获取)
2. [核心方法](#核心方法)
3. [Rule 操作](#rule-操作)
4. [组件操作](#组件操作)
5. [表单数据](#表单数据)
6. [事件系统](#事件系统)
7. [高级用法](#高级用法)
8. [实战示例](#实战示例)

---

## API 实例获取

### 方式1：通过 $api() 辅助函数（推荐）

```javascript
import { $api } from '@/utils/page-helpers/common.js'

export function handleSubmit() {
  const api = $api()
  if (!api) {
    console.warn('API 未初始化')
    return
  }
  
  // 使用 API
  api.submit()
}
```

### 方式2：通过全局变量

```javascript
export function handleClick() {
  const api = window.__formApi__
  // 使用 API
}
```

### 方式3：在 mounted 回调中

```javascript
// DynamicPage.vue 中已自动处理
const onFormMounted = (api) => {
  formApi.value = api
  window.__formApi__ = api
}
```

---

## 核心方法

### 1. 表单提交与验证

#### `api.submit(success, fail)`
提交表单并触发验证。

```javascript
export function handleSubmit() {
  const api = $api()
  
  api.submit(
    (formData, api) => {
      console.log('✅ 表单验证通过:', formData)
      // 提交到服务器
      submitToServer(formData)
    },
    (fail) => {
      console.log('❌ 表单验证失败:', fail)
    }
  )
}
```

#### `api.validate(callback)`
手动触发验证，不提交。

```javascript
export function handleValidate() {
  const api = $api()
  
  api.validate((valid) => {
    if (valid) {
      console.log('✅ 验证通过')
    } else {
      console.log('❌ 验证失败')
    }
  })
}
```

#### `api.validateField(field, callback)`
验证单个字段。

```javascript
export function handleValidateEmail() {
  const api = $api()
  
  api.validateField('email', (valid, msg) => {
    if (valid) {
      console.log('✅ 邮箱格式正确')
    } else {
      console.log('❌ 邮箱格式错误:', msg)
    }
  })
}
```

---

### 2. 表单重置

#### `api.resetFields()`
重置所有字段到初始值。

```javascript
export function handleReset() {
  const api = $api()
  api.resetFields()
  console.log('✅ 表单已重置')
}
```

#### `api.clearValidateState(fields?)`
清除验证状态（不重置值）。

```javascript
export function handleClearValidate() {
  const api = $api()
  
  // 清除所有验证状态
  api.clearValidateState()
  
  // 清除指定字段验证状态
  api.clearValidateState(['email', 'password'])
}
```

---

### 3. 表单数据操作

#### `api.formData()`
获取表单数据（响应式）。

```javascript
export function handleGetData() {
  const api = $api()
  const data = api.formData()
  console.log('表单数据:', data)
}
```

#### `api.getValue(field)`
获取单个字段值。

```javascript
export function handleGetEmail() {
  const api = $api()
  const email = api.getValue('email')
  console.log('邮箱:', email)
}
```

#### `api.setValue(field, value)`
设置单个字段值。

```javascript
export function handleSetEmail() {
  const api = $api()
  api.setValue('email', 'new@example.com')
}

// 批量设置
export function handleSetMultiple() {
  const api = $api()
  api.setValue({
    email: 'new@example.com',
    name: '张三'
  })
}
```

#### `api.changeValue(field, value)`
修改字段值（触发 change 事件）。

```javascript
export function handleChangeValue() {
  const api = $api()
  api.changeValue('status', 'active')
}
```

---

## Rule 操作

### 1. 获取 Rules

#### `api.rule`
获取所有 rule 配置。

```javascript
export function handleGetRules() {
  const api = $api()
  console.log('所有 rules:', api.rule)
}
```

#### `api.getRule(field)`
获取指定字段的 rule。

```javascript
export function handleGetFieldRule() {
  const api = $api()
  const emailRule = api.getRule('email')
  console.log('邮箱字段规则:', emailRule)
}
```

---

### 2. 修改 Rules

#### `api.updateRule(field, rule)`
更新字段的 rule 配置。

```javascript
export function handleUpdateRule() {
  const api = $api()
  
  api.updateRule('email', {
    props: {
      disabled: true,
      placeholder: '已禁用'
    }
  })
}
```

#### `api.updateRules(rules)`
批量更新多个字段的 rule。

```javascript
export function handleUpdateMultipleRules() {
  const api = $api()
  
  api.updateRules({
    email: { props: { disabled: true } },
    name: { props: { readonly: true } }
  })
}
```

#### `api.mergeRule(field, rule)`
合并 rule 配置（不覆盖）。

```javascript
export function handleMergeRule() {
  const api = $api()
  
  api.mergeRule('email', {
    props: {
      maxlength: 50  // 只添加这个属性，不影响其他
    }
  })
}
```

---

### 3. 动态添加/删除字段

#### `api.append(rule, after?, child?)`
添加新字段。

```javascript
export function handleAddField() {
  const api = $api()
  
  // 在表单末尾添加
  api.append({
    type: 'el-input',
    field: 'newField',
    title: '新字段',
    value: ''
  })
  
  // 在 email 字段后添加
  api.append(newRule, 'email')
}
```

#### `api.prepend(rule, after?, child?)`
在表单开头添加字段。

```javascript
export function handlePrependField() {
  const api = $api()
  
  api.prepend({
    type: 'el-alert',
    props: {
      title: '提示',
      type: 'info',
      closable: false
    }
  })
}
```

#### `api.remove(field)`
删除字段。

```javascript
export function handleRemoveField() {
  const api = $api()
  api.remove('email')
}
```

#### `api.removeField(field)`
删除字段（同 remove）。

```javascript
export function handleRemoveField() {
  const api = $api()
  api.removeField('email')
}
```

---

## 组件操作

### 1. 显示/隐藏组件

#### `api.hidden(hidden, fields?)`
隐藏/显示字段。

```javascript
// 隐藏单个字段
export function handleHideEmail() {
  const api = $api()
  api.hidden(true, 'email')  // 隐藏
  api.hidden(false, 'email') // 显示
}

// 隐藏多个字段
export function handleHideMultiple() {
  const api = $api()
  api.hidden(true, ['email', 'phone'])
}

// 隐藏所有字段
export function handleHideAll() {
  const api = $api()
  api.hidden(true)
}
```

#### `api.visibility(visibility, fields?)`
控制字段可见性（占位）。

```javascript
export function handleVisibility() {
  const api = $api()
  
  // visibility: hidden（不显示但占位）
  api.visibility(false, 'email')
  
  // display: none（不显示不占位）
  api.hidden(true, 'email')
}
```

---

### 2. 禁用/启用组件

#### `api.disabled(disabled, fields?)`
禁用/启用字段。

```javascript
// 禁用单个字段
export function handleDisableEmail() {
  const api = $api()
  api.disabled(true, 'email')  // 禁用
  api.disabled(false, 'email') // 启用
}

// 禁用多个字段
export function handleDisableMultiple() {
  const api = $api()
  api.disabled(true, ['email', 'phone'])
}
```

#### `api.readonly(readonly, fields?)`
设置只读。

```javascript
export function handleReadonly() {
  const api = $api()
  api.readonly(true, 'email')
}
```

---

### 3. 获取组件实例

#### `api.el(field)`
获取组件实例。

```javascript
export function handleGetComponent() {
  const api = $api()
  const inputComponent = api.el('email')
  
  if (inputComponent) {
    // 直接调用组件方法
    inputComponent.focus()
  }
}

// 用于 el-table
export function handleTableAction() {
  const api = $api()
  const tableComponent = api.el('myTable')
  
  if (tableComponent) {
    tableComponent.clearSelection()
    tableComponent.toggleRowSelection(row, true)
  }
}
```

---

## 表单数据

### 1. 获取数据

#### `api.formData()`
获取表单数据（响应式对象）。

```javascript
export function handleGetData() {
  const api = $api()
  const data = api.formData()
  
  // 直接修改会触发响应式更新
  data.email = 'new@example.com'
}
```

#### `api.form`
获取表单数据（只读）。

```javascript
export function handleGetForm() {
  const api = $api()
  console.log('表单数据:', api.form)
}
```

---

### 2. 设置数据

#### `api.setValue(field, value)` 或 `api.setValue(values)`
设置字段值（不触发 change 事件）。

```javascript
// 单个字段
api.setValue('email', 'test@example.com')

// 多个字段
api.setValue({
  email: 'test@example.com',
  name: '张三',
  age: 25
})
```

#### `api.changeValue(field, value)`
修改字段值（触发 change 事件）。

```javascript
api.changeValue('status', 'active')
```

#### `api.setFormData(data)`
批量设置表单数据。

```javascript
export function handleSetFormData() {
  const api = $api()
  
  api.setFormData({
    email: 'test@example.com',
    name: '张三',
    phone: '13800138000'
  })
}
```

---

## 事件系统

### 1. 监听事件

#### `api.on(event, callback)`
监听 form-create 事件。

```javascript
export function __init__() {
  const api = $api()
  
  // 监听表单挂载完成
  api.on('mounted', () => {
    console.log('✅ 表单挂载完成')
  })
  
  // 监听字段值变化
  api.on('change', (field, value) => {
    console.log(`字段 ${field} 变化:`, value)
  })
}
```

#### 常用事件

| 事件名 | 触发时机 | 参数 |
|--------|---------|------|
| `mounted` | 表单挂载完成 | `(api)` |
| `change` | 字段值变化 | `(field, value, origin)` |
| `submit` | 表单提交 | `(formData, api)` |
| `reload-rule` | 规则重新加载 | `(api)` |

---

### 2. 移除事件监听

#### `api.off(event, callback?)`
移除事件监听。

```javascript
const handleChange = (field, value) => {
  console.log('change:', field, value)
}

// 添加监听
api.on('change', handleChange)

// 移除特定监听
api.off('change', handleChange)

// 移除所有 change 监听
api.off('change')
```

---

## 高级用法

### 1. 刷新表单

#### `api.refresh()`
刷新表单（重新渲染）。

```javascript
export function handleRefresh() {
  const api = $api()
  api.refresh()
  console.log('✅ 表单已刷新')
}
```

**注意**：在我们的框架中，优先使用 `$rebindRules()` 而不是 `api.refresh()`，因为 rebind 会重新绑定数据。

---

### 2. 重载规则

#### `api.reload(rules)`
重新加载整个表单规则。

```javascript
export function handleReload() {
  const api = $api()
  
  const newRules = [
    {
      type: 'el-input',
      field: 'username',
      title: '用户名',
      value: ''
    }
  ]
  
  api.reload(newRules)
}
```

---

### 3. 获取配置

#### `api.options`
获取 form-create 配置选项。

```javascript
export function handleGetOptions() {
  const api = $api()
  console.log('form-create 配置:', api.options)
}
```

#### `api.config`
获取全局配置。

```javascript
export function handleGetConfig() {
  const api = $api()
  console.log('全局配置:', api.config)
}
```

---

## 实战示例

### 示例1：动态表单（根据用户类型显示不同字段）

```javascript
import { $api, $data } from '@/utils/page-helpers/common.js'

export function handleUserTypeChange(userType) {
  const api = $api()
  
  if (userType === 'company') {
    // 企业用户：显示公司信息
    api.hidden(false, ['companyName', 'taxNumber'])
    api.hidden(true, 'personalId')
  } else {
    // 个人用户：显示身份证号
    api.hidden(true, ['companyName', 'taxNumber'])
    api.hidden(false, 'personalId')
  }
}
```

---

### 示例2：表单联动（省市区选择）

```javascript
export function handleProvinceChange(provinceId) {
  const api = $api()
  
  // 加载城市列表
  const cities = getCitiesByProvince(provinceId)
  
  // 更新城市下拉选项
  api.updateRule('city', {
    props: {
      options: cities
    }
  })
  
  // 重置城市和区县
  api.setValue({
    city: '',
    district: ''
  })
  
  // 禁用区县选择
  api.disabled(true, 'district')
}

export function handleCityChange(cityId) {
  const api = $api()
  
  if (cityId) {
    const districts = getDistrictsByCity(cityId)
    
    api.updateRule('district', {
      props: {
        options: districts
      }
    })
    
    api.disabled(false, 'district')
  }
}
```

---

### 示例3：表单验证增强

```javascript
export function handleCustomValidate() {
  const api = $api()
  
  api.validate((valid) => {
    if (!valid) {
      ElMessage.error('请检查表单填写')
      return
    }
    
    // 自定义业务验证
    const data = api.formData()
    
    if (data.password !== data.confirmPassword) {
      ElMessage.error('两次密码不一致')
      return
    }
    
    if (data.age < 18) {
      ElMessage.error('年龄必须大于18岁')
      return
    }
    
    // 提交表单
    handleSubmit(data)
  })
}
```

---

### 示例4：动态添加表单项（多个联系人）

```javascript
let contactIndex = 0

export function handleAddContact() {
  const api = $api()
  
  contactIndex++
  
  api.append([
    {
      type: 'el-input',
      field: `contact_name_${contactIndex}`,
      title: `联系人${contactIndex}姓名`,
      value: ''
    },
    {
      type: 'el-input',
      field: `contact_phone_${contactIndex}`,
      title: `联系人${contactIndex}电话`,
      value: ''
    }
  ])
}

export function handleRemoveContact(index) {
  const api = $api()
  api.remove(`contact_name_${index}`)
  api.remove(`contact_phone_${index}`)
}
```

---

### 示例5：获取表格组件并操作

```javascript
export function handleSelectAllRows() {
  const api = $api()
  const tableComponent = api.el('myTable')
  
  if (!tableComponent) {
    console.warn('表格组件未找到')
    return
  }
  
  // 调用 el-table 的方法
  tableComponent.toggleAllSelection()
}

export function handleClearSelection() {
  const api = $api()
  const tableComponent = api.el('myTable')
  
  if (tableComponent) {
    tableComponent.clearSelection()
  }
}
```

---

## 框架集成最佳实践

### 1. 与 DataSet 配合使用

```javascript
import { $api, $data, $dataSet } from '@/utils/page-helpers/common.js'

export function handleLoadUserData() {
  const api = $api()
  const dataSet = $dataSet()
  
  // 从 DataSet 获取当前行
  const usersTable = dataSet.getTable('Users')
  const currentUser = usersTable.currentRow
  
  if (currentUser) {
    // 填充表单
    api.setValue({
      name: currentUser.name,
      email: currentUser.email,
      phone: currentUser.phone
    })
  }
}
```

---

### 2. 使用 $rebindRules() 而不是 api.refresh()

```javascript
import { $rebindRules } from '@/utils/page-helpers/common.js'

export function handleUpdateUI() {
  const pageData = $data()
  
  // 修改页面数据
  pageData.showAdvanced = true
  
  // ✅ 推荐：使用框架提供的 rebindRules
  $rebindRules()
  
  // ❌ 不推荐：使用 api.refresh()（不会重新绑定 dataKey）
  // $api().refresh()
}
```

---

### 3. 事件处理器中访问 API

```javascript
// rule.json 中
{
  "type": "el-button",
  "on": {
    "click": "handleSubmit"  // 字符串形式
  }
}

// script.js 中
export function handleSubmit() {
  const api = $api()  // 通过辅助函数获取
  
  api.submit((data) => {
    console.log('提交数据:', data)
  })
}
```

---

## 常见问题

### Q1: API 未初始化？

**问题**：调用 `$api()` 返回 `null`

**原因**：表单尚未挂载完成

**解决**：
```javascript
export function handleClick() {
  const api = $api()
  if (!api) {
    console.warn('API 未初始化，请等待表单挂载')
    return
  }
  // 使用 API
}
```

---

### Q2: setValue 不生效？

**问题**：调用 `api.setValue()` 后值没有更新

**原因**：可能是字段名不存在或拼写错误

**调试**：
```javascript
export function debugSetValue() {
  const api = $api()
  
  // 检查字段是否存在
  const rule = api.getRule('email')
  if (!rule) {
    console.error('字段 email 不存在')
    return
  }
  
  // 设置值
  api.setValue('email', 'test@example.com')
  
  // 验证是否设置成功
  console.log('新值:', api.getValue('email'))
}
```

---

### Q3: 如何监听所有字段变化？

```javascript
export function __init__() {
  const api = $api()
  
  api.on('change', (field, value) => {
    console.log(`字段 ${field} 变化为:`, value)
    
    // 处理联动逻辑
    if (field === 'province') {
      handleProvinceChange(value)
    }
  })
}
```

---

## 参考资源

- [form-create 官方文档](http://www.form-create.com/v3/)
- [Element Plus 组件文档](https://element-plus.org/)
- [项目架构文档](../architecture/README_ARCHITECTURE.md)
- [DataSet 使用指南](../dataset/DATASET_CRUD_GUIDE.md)

---

## 总结

form-create API 核心能力：

| 能力 | 关键 API | 使用频率 |
|------|---------|----------|
| **表单数据** | `setValue()`, `getValue()`, `formData()` | ⭐⭐⭐⭐⭐ |
| **字段控制** | `hidden()`, `disabled()`, `readonly()` | ⭐⭐⭐⭐⭐ |
| **动态表单** | `append()`, `remove()`, `updateRule()` | ⭐⭐⭐⭐ |
| **表单验证** | `validate()`, `validateField()` | ⭐⭐⭐⭐ |
| **组件操作** | `el()` | ⭐⭐⭐ |
| **事件监听** | `on()`, `off()` | ⭐⭐⭐ |
| **表单重置** | `resetFields()`, `clearValidateState()` | ⭐⭐⭐ |

**框架集成建议**：
- ✅ 使用 `$api()` 辅助函数获取 API
- ✅ 使用 `$rebindRules()` 而不是 `api.refresh()`
- ✅ 配合 DataSet 实现数据驱动
- ✅ 在 `__init__()` 中初始化事件监听
- ❌ 避免频繁调用 `api.refresh()`
- ❌ 避免直接修改 `api.rule`（使用 `updateRule()`）
