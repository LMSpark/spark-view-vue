# Form-Create API 快速参考

> 快速查阅常用 API，详细文档见 [FORMCREATE_API.md](./FORMCREATE_API.md)

## 🚀 API 获取

```javascript
import { $api } from '@/utils/page-helpers/common.js'

const api = $api()  // 获取 API 实例
```

---

## 📊 表单数据

| API | 说明 | 示例 |
|-----|------|------|
| `api.formData()` | 获取表单数据（响应式） | `const data = api.formData()` |
| `api.getValue(field)` | 获取单个字段值 | `const email = api.getValue('email')` |
| `api.setValue(field, value)` | 设置单个字段值 | `api.setValue('email', 'test@example.com')` |
| `api.setValue(values)` | 批量设置值 | `api.setValue({ email: '...', name: '...' })` |
| `api.changeValue(field, value)` | 修改值（触发事件） | `api.changeValue('status', 'active')` |

---

## 🎛️ 字段控制

| API | 说明 | 示例 |
|-----|------|------|
| `api.hidden(hidden, fields)` | 隐藏/显示字段 | `api.hidden(true, 'email')` |
| `api.disabled(disabled, fields)` | 禁用/启用字段 | `api.disabled(true, ['email', 'phone'])` |
| `api.readonly(readonly, fields)` | 只读字段 | `api.readonly(true, 'email')` |
| `api.visibility(visible, fields)` | 可见性（占位） | `api.visibility(false, 'email')` |

---

## 📝 Rule 操作

| API | 说明 | 示例 |
|-----|------|------|
| `api.getRule(field)` | 获取字段规则 | `const rule = api.getRule('email')` |
| `api.updateRule(field, rule)` | 更新规则 | `api.updateRule('email', { props: { disabled: true } })` |
| `api.mergeRule(field, rule)` | 合并规则 | `api.mergeRule('email', { props: { maxlength: 50 } })` |
| `api.append(rule, after?)` | 添加字段 | `api.append({ type: 'el-input', field: 'newField' })` |
| `api.remove(field)` | 删除字段 | `api.remove('email')` |

---

## ✅ 表单验证

| API | 说明 | 示例 |
|-----|------|------|
| `api.validate(callback)` | 验证表单 | `api.validate((valid) => { ... })` |
| `api.validateField(field, callback)` | 验证单个字段 | `api.validateField('email', (valid, msg) => { ... })` |
| `api.submit(success, fail)` | 提交表单 | `api.submit((data) => { ... }, (fail) => { ... })` |
| `api.clearValidateState(fields?)` | 清除验证状态 | `api.clearValidateState()` |
| `api.resetFields()` | 重置表单 | `api.resetFields()` |

---

## 🔧 组件操作

| API | 说明 | 示例 |
|-----|------|------|
| `api.el(field)` | 获取组件实例 | `const input = api.el('email')` |
| `api.refresh()` | 刷新表单 | `api.refresh()` |
| `api.reload(rules)` | 重载规则 | `api.reload(newRules)` |

---

## 📡 事件监听

| API | 说明 | 示例 |
|-----|------|------|
| `api.on(event, callback)` | 监听事件 | `api.on('change', (field, value) => { ... })` |
| `api.off(event, callback?)` | 移除监听 | `api.off('change')` |

**常用事件**：
- `mounted` - 表单挂载完成
- `change` - 字段值变化
- `submit` - 表单提交

---

## 🎯 实战示例

### 1. 动态显示/隐藏字段

```javascript
export function handleUserTypeChange(userType) {
  const api = $api()
  
  if (userType === 'company') {
    api.hidden(false, ['companyName', 'taxNumber'])
    api.hidden(true, 'personalId')
  } else {
    api.hidden(true, ['companyName', 'taxNumber'])
    api.hidden(false, 'personalId')
  }
}
```

---

### 2. 表单验证与提交

```javascript
export function handleSubmit() {
  const api = $api()
  
  api.submit(
    (formData) => {
      console.log('✅ 验证通过:', formData)
      // 提交到服务器
      submitToServer(formData)
    },
    (errors) => {
      console.log('❌ 验证失败:', errors)
      ElMessage.error('请检查表单填写')
    }
  )
}
```

---

### 3. 批量设置表单值

```javascript
export function handleLoadData(userData) {
  const api = $api()
  
  api.setValue({
    name: userData.name,
    email: userData.email,
    phone: userData.phone
  })
  
  ElMessage.success('数据加载完成')
}
```

---

### 4. 更新字段属性

```javascript
export function handleUpdatePlaceholder() {
  const api = $api()
  
  api.updateRule('email', {
    props: {
      placeholder: '请输入新的邮箱地址',
      disabled: false
    }
  })
}
```

---

### 5. 获取组件实例并操作

```javascript
export function handleFocusEmail() {
  const api = $api()
  const emailInput = api.el('email')
  
  if (emailInput) {
    emailInput.focus()  // 调用 el-input 的方法
  }
}

// 操作 el-table
export function handleClearSelection() {
  const api = $api()
  const tableComponent = api.el('myTable')
  
  if (tableComponent) {
    tableComponent.clearSelection()
  }
}
```

---

### 6. 监听字段变化

```javascript
export function __init__() {
  const api = $api()
  
  api.on('change', (field, value) => {
    console.log(`字段 ${field} 变化为:`, value)
    
    // 联动逻辑
    if (field === 'province') {
      loadCities(value)
    }
  })
}
```

---

## ⚠️ 注意事项

### 1. API 初始化检查

```javascript
export function handleClick() {
  const api = $api()
  if (!api) {
    console.warn('API 未初始化')
    return
  }
  // 使用 API
}
```

---

### 2. 框架集成建议

```javascript
// ✅ 推荐：使用框架提供的 $rebindRules
import { $rebindRules } from '@/utils/page-helpers/common.js'
$rebindRules()

// ❌ 不推荐：使用 api.refresh()（不会重新绑定 dataKey）
api.refresh()
```

---

### 3. 字段名必须存在

```javascript
// ❌ 错误：字段名不存在
api.setValue('nonexistent', 'value')

// ✅ 正确：先检查字段是否存在
const rule = api.getRule('email')
if (rule) {
  api.setValue('email', 'test@example.com')
}
```

---

## 🔗 相关文档

- [完整 API 文档](./FORMCREATE_API.md) - 详细说明和高级用法
- [Form-Create 官方文档](http://www.form-create.com/v3/)
- [Element Plus 组件文档](https://element-plus.org/)
- [演示页面](/formcreate-api) - 在线交互式演示

---

## 📱 快速查阅

### 最常用 API Top 10

1. `api.setValue()` - 设置字段值
2. `api.getValue()` - 获取字段值
3. `api.formData()` - 获取所有数据
4. `api.hidden()` - 隐藏/显示字段
5. `api.disabled()` - 禁用/启用字段
6. `api.updateRule()` - 更新字段规则
7. `api.validate()` - 验证表单
8. `api.submit()` - 提交表单
9. `api.el()` - 获取组件实例
10. `api.on()` - 监听事件

---

**提示**: 访问 `/formcreate-api` 页面体验交互式演示！
