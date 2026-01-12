# Form-Create 学习路线图

> **系统化学习 Form-Create 的完整指南**  
> 从入门到精通的进阶路线

## 📋 目录

- [学习路线总览](#学习路线总览)
- [第1阶段：入门基础（1-2天）](#第1阶段入门基础1-2天)
- [第2阶段：核心掌握（3-5天)](#第2阶段核心掌握3-5天)
- [第3阶段：高级进阶（5-7天）](#第3阶段高级进阶5-7天)
- [第4阶段：专家级（持续）](#第4阶段专家级持续)
- [官方特性对照表](#官方特性对照表)
- [常见问题速查](#常见问题速查)
- [实战项目清单](#实战项目清单)

---

## 学习路线总览

```
入门基础 (1-2天)
    ↓
核心掌握 (3-5天)
    ↓
高级进阶 (5-7天)
    ↓
专家级应用 (持续)
```

**总时长**: 约 10-14 天达到熟练使用水平

---

## 第1阶段：入门基础（1-2天）

### 目标
✅ 了解 Form-Create 基本概念  
✅ 能够创建简单表单  
✅ 掌握基础 API 使用

### 学习内容

#### Day 1 上午：快速上手

**核心概念**：
- Form-Create 是什么
- Rule 规则对象结构
- type、field、title、value 四大核心属性

**实践项目**：
```javascript
// 创建第一个表单
const rules = [
  {
    type: 'input',
    field: 'username',
    title: '用户名',
    value: '',
    props: { placeholder: '请输入用户名' }
  },
  {
    type: 'input',
    field: 'email',
    title: '邮箱',
    value: '',
    props: { placeholder: '请输入邮箱', type: 'email' }
  }
];

const api = formCreate.create(rules, {
  onSubmit: (formData) => {
    console.log('提交数据', formData);
  }
});
```

**输出**：能够独立创建包含 3-5 个字段的基础表单

#### Day 1 下午：组件类型

**核心组件**：
- input（文本输入框）
- select（下拉选择）
- radio（单选框）
- checkbox（复选框）
- datePicker（日期选择）
- inputNumber（数字输入）
- switch（开关）

**实践项目**：
```javascript
// 用户注册表单
const registerRules = [
  { type: 'input', field: 'username', title: '用户名' },
  { type: 'input', field: 'password', title: '密码', props: { type: 'password' } },
  { type: 'input', field: 'email', title: '邮箱', props: { type: 'email' } },
  { type: 'select', field: 'gender', title: '性别', options: [
    { label: '男', value: 'male' },
    { label: '女', value: 'female' }
  ]},
  { type: 'datePicker', field: 'birthday', title: '生日' },
  { type: 'checkbox', field: 'interests', title: '兴趣爱好', options: [
    { label: '运动', value: 'sports' },
    { label: '音乐', value: 'music' },
    { label: '阅读', value: 'reading' }
  ]}
];
```

**输出**：掌握 7 种常用组件的使用

#### Day 2 上午：API 基础操作

**核心 API**：
- `api.formData()` - 获取表单数据
- `api.getValue(field)` - 获取字段值
- `api.setValue(field, value)` - 设置字段值
- `api.validate()` - 表单验证
- `api.submit()` - 提交表单
- `api.resetFields()` - 重置表单

**实践练习**：
```javascript
// 获取数据
const formData = api.formData();
console.log('表单数据', formData);

// 设置数据
api.setValue('username', 'admin');

// 批量设置
api.setValue({
  username: 'admin',
  email: 'admin@example.com'
});

// 验证后提交
api.validate().then(() => {
  api.submit();
});
```

**输出**：能够使用 API 操作表单数据

#### Day 2 下午：表单验证

**验证规则**：
- required（必填）
- min/max（长度范围）
- type（类型验证）
- pattern（正则表达式）
- validator（自定义验证）

**实践项目**：
```javascript
{
  type: 'input',
  field: 'username',
  title: '用户名',
  validate: [
    { required: true, message: '请输入用户名' },
    { min: 3, max: 20, message: '长度在 3 到 20 个字符' },
    { pattern: /^[a-zA-Z0-9_]+$/, message: '只能包含字母、数字和下划线' }
  ]
}
```

**输出**：能够为表单添加完整的验证规则

### 阶段检验

**必答题**：
1. Rule 对象必须包含哪些属性？
2. 如何获取和设置表单字段值？
3. 如何为字段添加验证规则？
4. 如何提交表单并处理验证？

**实战项目**：创建一个完整的用户注册表单
- 包含：用户名、密码、邮箱、性别、生日、兴趣爱好
- 要求：所有字段都有验证规则
- 功能：提交时验证，通过后打印数据

---

## 第2阶段：核心掌握（3-5天）

### 目标
✅ 掌握所有常用 API  
✅ 理解组件联动机制  
✅ 能够处理复杂表单场景

### 学习内容

#### Day 3：规则操作 API

**核心方法**：
- `api.getRule(field)` - 获取规则
- `api.updateRule(field, rule)` - 更新规则
- `api.mergeRule(field, rule)` - 合并规则
- `api.append(rule, field?)` - 追加组件
- `api.prepend(rule, field?)` - 插入组件
- `api.removeField(field)` - 删除组件

**实践项目**：动态表单
```javascript
// 动态添加字段
function addField() {
  api.append({
    type: 'input',
    field: `field_${Date.now()}`,
    title: '新字段',
    value: ''
  });
}

// 动态删除字段
function removeField(field) {
  api.removeField(field);
}

// 动态修改字段属性
function toggleDisabled(field) {
  const rule = api.getRule(field);
  api.mergeRule(field, {
    props: { disabled: !rule.props.disabled }
  });
}
```

**输出**：能够动态增删改表单字段

#### Day 4：组件联动

**Control 配置**：
```javascript
{
  type: 'radio',
  field: 'userType',
  title: '用户类型',
  value: 'personal',
  options: [
    { label: '个人', value: 'personal' },
    { label: '企业', value: 'company' }
  ],
  control: [
    {
      // 当选择 'company' 时显示公司信息字段
      value: 'company',
      rule: ['companyName', 'taxNumber']
    }
  ]
}
```

**实践场景**：
1. 条件显示/隐藏字段
2. 条件必填验证
3. 条件禁用字段
4. 动态加载新组件

**输出**：掌握 Control 配置的 4 种常见用法

#### Day 5：显示控制与事件

**显示控制**：
- `hidden` vs `display`
- `disabled` 状态管理
- 条件渲染策略

**事件系统**：
```javascript
{
  type: 'input',
  field: 'username',
  inject: true,
  on: {
    focus({ api }) {
      console.log('获得焦点');
    },
    blur({ api }) {
      console.log('失去焦点');
    },
    change({ api }, value) {
      console.log('值变化', value);
      // 联动其他字段
      if (value.length > 10) {
        api.hidden(false, 'longNameTip');
      }
    }
  }
}
```

**输出**：能够处理组件事件并实现字段联动

#### Day 6-7：复杂场景实战

**项目1：多步骤表单**
- 3个步骤：基本信息、详细信息、确认信息
- 步骤切换验证
- 进度条显示

**项目2：级联选择**
- 省市区三级联动
- 动态加载下级选项
- 清空下级数据

**项目3：可编辑表格**
- 使用 group 组件
- 行内验证
- 动态增删行

**输出**：完成 3 个复杂场景项目

### 阶段检验

**必答题**：
1. updateRule 和 mergeRule 有什么区别？
2. Control 配置可以实现哪些联动效果？
3. hidden 和 display 的区别是什么？
4. 如何在组件事件中访问 API？

**实战项目**：创建一个多步骤问卷表单
- 至少 3 个步骤
- 每个步骤包含 5+ 个字段
- 步骤间数据保留
- 最后一步显示所有数据供确认

---

## 第3阶段：高级进阶（5-7天）

### 目标
✅ 掌握自定义扩展  
✅ 理解内部机制  
✅ 性能优化技巧

### 学习内容

#### Day 8：自定义组件

**创建自定义组件**：
```vue
<!-- MyCustomInput.vue -->
<script setup>
const props = defineProps({
  modelValue: [String, Number],
  formCreateInject: Object
});

const emit = defineEmits(['update:modelValue']);

const { api, rule, field } = props.formCreateInject;

const handleInput = (value) => {
  emit('update:modelValue', value);
};
</script>

<template>
  <div class="custom-input">
    <el-input :model-value="modelValue" @input="handleInput" />
    <div class="help-text">{{ rule.props.helpText }}</div>
  </div>
</template>
```

**注册组件**：
```javascript
formCreate.component('myCustomInput', MyCustomInput);

// 使用
{
  type: 'myCustomInput',
  field: 'custom',
  title: '自定义输入框',
  props: { helpText: '这是帮助文本' }
}
```

**输出**：能够创建和使用自定义组件

#### Day 9：自定义属性（Effect）

**创建 Effect**：
```javascript
const autoSaveEffect = {
  name: 'autoSave',
  
  // 值变化时触发
  value({ value }, rule, api) {
    // 防抖保存
    clearTimeout(rule._saveTimer);
    rule._saveTimer = setTimeout(() => {
      this.save(rule.field, value, api);
    }, 1000);
  },
  
  // 保存方法
  async save(field, value, api) {
    try {
      await fetch('/api/auto-save', {
        method: 'POST',
        body: JSON.stringify({ field, value })
      });
      console.log(`${field} 自动保存成功`);
    } catch (error) {
      console.error('自动保存失败', error);
    }
  }
};

formCreate.register(autoSaveEffect);

// 使用
{
  type: 'input',
  field: 'content',
  title: '内容',
  $autoSave: true
}
```

**内置 Effect 深度使用**：
- `$required` - 必填验证
- `$fetch` - 远程数据加载
- `$loadData` - 静态数据关联
- `$componentValidate` - 组件内验证

**输出**：能够创建自定义 Effect 扩展表单能力

#### Day 10：数据管理与流转

**外部数据管理**：
```javascript
// 设置共享数据
api.setData('userConfig', {
  theme: 'dark',
  language: 'zh-CN'
});

// 监听数据变化
api.watchData((get, changed) => {
  if (changed) {
    const config = get('userConfig');
    // 更新其他组件
  }
});

// 刷新关联组件
api.refreshData('userConfig');
```

**子表单管理**：
```javascript
// 获取所有子表单 API
const subApis = api.getSubForm('addresses');

// 遍历操作
subApis.forEach((subApi, index) => {
  console.log(`子表单 ${index}:`, subApi.formData());
});

// 访问层级关系
console.log('父表单:', subApi.parent);
console.log('顶层表单:', subApi.top);
console.log('同级表单:', subApi.siblings);
```

**输出**：掌握数据管理和子表单操作

#### Day 11-12：性能优化

**优化技巧**：

1. **批量操作**：
```javascript
// ❌ 错误：多次触发渲染
api.setValue('field1', 'value1');
api.setValue('field2', 'value2');

// ✅ 正确：批量设置
api.setValue({
  field1: 'value1',
  field2: 'value2'
});

// ✅ 延迟刷新
api.nextRefresh(() => {
  // 批量操作...
});
```

2. **组件缓存**：
```javascript
{
  type: 'input',
  field: 'username',
  name: 'usernameInput'  // 使用 name 标识，启用缓存
}
```

3. **条件渲染**：
```javascript
// 使用 hidden 而不是 display（不渲染 DOM）
{
  type: 'input',
  field: 'field1',
  hidden: true  // 推荐
}
```

4. **懒加载组件**：
```javascript
formCreate.component('heavyComponent', 
  () => import('./HeavyComponent.vue')
);
```

**输出**：能够优化表单性能

#### Day 13-14：高级项目实战

**项目1：复杂表单设计器**
- 拖拽添加组件
- 实时预览
- 规则 JSON 导出

**项目2：动态问卷系统**
- 题型：单选、多选、填空、评分
- 条件跳转
- 数据统计

**项目3：工作流表单**
- 多步骤审批
- 条件分支
- 表单状态管理

**输出**：完成 3 个高级项目

### 阶段检验

**必答题**：
1. 如何创建自定义组件并集成到 Form-Create？
2. Effect 的生命周期有哪些钩子？
3. 如何优化包含 100+ 字段的大型表单？
4. 子表单如何访问父表单 API？

**实战项目**：创建一个表单设计器
- 左侧组件库
- 中间画布（可拖拽）
- 右侧属性编辑
- 底部代码预览（JSON）
- 支持导入导出

---

## 第4阶段：专家级（持续）

### 目标
✅ 深入理解内部实现  
✅ 贡献开源社区  
✅ 解决疑难问题

### 学习内容

#### 源码阅读

**核心模块**：
1. **规则解析器**（Rule Parser）
2. **组件渲染器**（Component Renderer）
3. **验证引擎**（Validation Engine）
4. **事件系统**（Event Bus）
5. **API 层**（API Layer）

**阅读路线**：
```
src/
  ├── core/           # 核心逻辑
  │   ├── rule.js     # 规则处理
  │   ├── api.js      # API 实现
  │   └── render.js   # 渲染逻辑
  ├── components/     # 内置组件
  ├── validator/      # 验证器
  └── utils/          # 工具函数
```

#### 高级话题

1. **自定义验证器开发**
2. **插件系统设计**
3. **多语言支持**
4. **表单序列化与反序列化**
5. **与后端集成方案**

#### 社区贡献

- 提交 Issue
- 修复 Bug
- 提交 PR
- 编写文档
- 分享案例

---

## 官方特性对照表

| 特性分类 | 子特性 | 学习阶段 | 重要程度 | 使用频率 |
|---------|--------|---------|---------|---------|
| **基础组件** | input | 入门 | ⭐⭐⭐⭐⭐ | 极高 |
| | select | 入门 | ⭐⭐⭐⭐⭐ | 极高 |
| | radio/checkbox | 入门 | ⭐⭐⭐⭐⭐ | 极高 |
| | datePicker | 入门 | ⭐⭐⭐⭐ | 高 |
| | upload | 核心 | ⭐⭐⭐⭐ | 高 |
| | cascader | 核心 | ⭐⭐⭐ | 中 |
| | tree | 核心 | ⭐⭐⭐ | 中 |
| | rate/slider | 核心 | ⭐⭐ | 低 |
| **数据操作** | getValue/setValue | 入门 | ⭐⭐⭐⭐⭐ | 极高 |
| | formData() | 入门 | ⭐⭐⭐⭐⭐ | 极高 |
| | coverValue | 核心 | ⭐⭐⭐ | 中 |
| **规则操作** | getRule | 核心 | ⭐⭐⭐⭐⭐ | 极高 |
| | updateRule | 核心 | ⭐⭐⭐⭐⭐ | 极高 |
| | mergeRule | 核心 | ⭐⭐⭐⭐ | 高 |
| | append/prepend | 核心 | ⭐⭐⭐⭐ | 高 |
| | removeField | 核心 | ⭐⭐⭐⭐ | 高 |
| **显示控制** | hidden | 核心 | ⭐⭐⭐⭐⭐ | 极高 |
| | display | 核心 | ⭐⭐⭐ | 中 |
| | disabled | 核心 | ⭐⭐⭐⭐⭐ | 极高 |
| **验证** | validate | 入门 | ⭐⭐⭐⭐⭐ | 极高 |
| | validateField | 核心 | ⭐⭐⭐⭐ | 高 |
| | updateValidate | 核心 | ⭐⭐⭐⭐ | 高 |
| | clearValidateState | 核心 | ⭐⭐⭐⭐ | 高 |
| **表单操作** | submit | 入门 | ⭐⭐⭐⭐⭐ | 极高 |
| | resetFields | 入门 | ⭐⭐⭐⭐ | 高 |
| | refresh | 核心 | ⭐⭐⭐ | 中 |
| | reload | 核心 | ⭐⭐⭐ | 中 |
| **组件实例** | el | 核心 | ⭐⭐⭐⭐ | 高 |
| | method/exec | 高级 | ⭐⭐⭐ | 中 |
| | trigger | 高级 | ⭐⭐ | 低 |
| **事件系统** | on/once/off | 核心 | ⭐⭐⭐⭐⭐ | 极高 |
| | emit | 高级 | ⭐⭐⭐ | 中 |
| | bus | 高级 | ⭐⭐⭐ | 中 |
| **组件联动** | control | 核心 | ⭐⭐⭐⭐⭐ | 极高 |
| | computed | 高级 | ⭐⭐⭐⭐ | 高 |
| **自定义扩展** | 自定义组件 | 高级 | ⭐⭐⭐⭐ | 高 |
| | Effect 扩展 | 高级 | ⭐⭐⭐⭐ | 高 |
| | API 扩展 | 专家 | ⭐⭐⭐ | 中 |
| **数据管理** | setData/getData | 高级 | ⭐⭐⭐⭐ | 高 |
| | watchData | 高级 | ⭐⭐⭐ | 中 |
| | 子表单 API | 高级 | ⭐⭐⭐⭐ | 高 |
| **高级组件** | group（子表单） | 核心 | ⭐⭐⭐⭐ | 高 |
| | subForm（分组） | 核心 | ⭐⭐⭐ | 中 |
| | frame（框架组件） | 高级 | ⭐⭐⭐ | 中 |
| **性能优化** | 组件缓存 | 高级 | ⭐⭐⭐⭐ | 高 |
| | 批量操作 | 高级 | ⭐⭐⭐⭐ | 高 |
| | 懒加载 | 专家 | ⭐⭐⭐ | 中 |

**图例**：
- ⭐⭐⭐⭐⭐ 必须掌握
- ⭐⭐⭐⭐ 推荐掌握
- ⭐⭐⭐ 建议了解
- ⭐⭐ 可选学习

---

## 常见问题速查

### Q1: 如何动态添加/删除表单字段？

```javascript
// 添加字段
api.append({
  type: 'input',
  field: 'newField',
  title: '新字段'
}, 'afterField');  // 在 afterField 后面添加

// 删除字段
api.removeField('fieldName');
```

### Q2: 如何实现字段联动？

```javascript
// 方式1: 使用 control 配置
{
  type: 'radio',
  field: 'type',
  control: [
    {
      value: 'optionA',
      rule: ['field1', 'field2']  // 显示这些字段
    }
  ]
}

// 方式2: 使用事件
{
  type: 'input',
  field: 'trigger',
  on: {
    change({ api }, value) {
      if (value === 'show') {
        api.hidden(false, 'targetField');
      }
    }
  }
}
```

### Q3: 如何获取/设置表单数据？

```javascript
// 获取全部数据
const allData = api.formData();

// 获取单个字段
const value = api.getValue('field');

// 设置单个字段
api.setValue('field', 'value');

// 批量设置
api.setValue({
  field1: 'value1',
  field2: 'value2'
});
```

### Q4: 如何添加表单验证？

```javascript
{
  type: 'input',
  field: 'username',
  validate: [
    { required: true, message: '必填' },
    { min: 3, max: 20, message: '长度 3-20' },
    {
      validator(rule, value, callback) {
        if (value === 'admin') {
          callback(new Error('不能使用 admin'));
        } else {
          callback();
        }
      }
    }
  ]
}
```

### Q5: 如何处理表单提交？

```javascript
// 方式1: 使用 submit
api.submit()
  .then(formData => {
    console.log('提交数据', formData);
  })
  .catch(() => {
    console.log('验证失败');
  });

// 方式2: 先验证后手动提交
api.validate()
  .then(() => {
    const data = api.formData();
    // 发送请求...
  });
```

### Q6: 如何动态修改组件属性？

```javascript
// 获取规则
const rule = api.getRule('field');

// 修改属性（浅合并）
api.updateRule('field', {
  props: { disabled: true }
});

// 深度合并（推荐）
api.mergeRule('field', {
  props: {
    disabled: true  // 只修改 disabled，保留其他 props
  }
});
```

### Q7: 如何创建多步骤表单？

```javascript
const steps = [
  { title: '步骤1', rules: [/* ... */] },
  { title: '步骤2', rules: [/* ... */] },
  { title: '步骤3', rules: [/* ... */] }
];

const currentStep = ref(0);

// 下一步
async function nextStep() {
  const valid = await api.validate();
  if (valid && currentStep.value < steps.length - 1) {
    currentStep.value++;
    api.reload(steps[currentStep.value].rules);
  }
}

// 上一步
function prevStep() {
  if (currentStep.value > 0) {
    currentStep.value--;
    api.reload(steps[currentStep.value].rules);
  }
}
```

### Q8: 如何实现级联选择？

```javascript
{
  type: 'select',
  field: 'province',
  on: {
    change({ api }, provinceCode) {
      // 加载城市
      fetch(`/api/cities?province=${provinceCode}`)
        .then(res => res.json())
        .then(cities => {
          api.updateRule('city', {
            options: cities.map(c => ({ label: c.name, value: c.code })),
            props: { disabled: false }
          });
          api.setValue('city', '');
        });
    }
  }
}
```

### Q9: 如何处理文件上传？

```javascript
{
  type: 'upload',
  field: 'avatar',
  title: '头像',
  props: {
    action: '/api/upload',
    listType: 'picture-card',
    limit: 1,
    onSuccess: (response, file) => {
      console.log('上传成功', response);
    },
    onError: (error) => {
      console.error('上传失败', error);
    }
  }
}
```

### Q10: 如何优化大型表单性能？

```javascript
// 1. 使用 name 属性启用组件缓存
{ type: 'input', field: 'field1', name: 'input1' }

// 2. 批量操作
api.setValue({
  field1: 'value1',
  field2: 'value2',
  field3: 'value3'
});

// 3. 使用 nextRefresh 延迟刷新
api.nextRefresh(() => {
  // 批量修改...
});

// 4. 使用 hidden 而不是 display
{ type: 'input', field: 'field1', hidden: true }
```

---

## 实战项目清单

### 入门级（1-2天完成1个）

1. ✅ **用户注册表单**
   - 用户名、密码、邮箱、手机号
   - 完整验证规则
   - 提交成功提示

2. ✅ **问卷调查表**
   - 单选、多选、文本输入
   - 评分、日期选择
   - 数据收集与展示

3. ✅ **个人信息表单**
   - 姓名、性别、生日、地址
   - 头像上传
   - 编辑与保存

### 中级（3-5天完成1个）

4. ⭐ **多步骤注册向导**
   - 3步：基本信息、详细信息、确认
   - 步骤间验证
   - 数据持久化

5. ⭐ **动态表单生成器**
   - 从 JSON 配置生成表单
   - 支持 10+ 种组件类型
   - 数据导出

6. ⭐ **级联地址选择**
   - 省市区三级联动
   - 异步加载数据
   - 数据回填

7. ⭐ **可编辑数据表格**
   - 使用 group 组件
   - 行内编辑
   - 动态增删行
   - 批量保存

### 高级（5-7天完成1个）

8. 🔥 **表单设计器**
   - 拖拽添加组件
   - 属性配置面板
   - 实时预览
   - JSON 导入导出

9. 🔥 **工作流审批表单**
   - 多步骤流程
   - 条件分支
   - 审批历史
   - 状态管理

10. 🔥 **复杂问卷系统**
    - 20+ 题型
    - 条件跳转
    - 逻辑计算
    - 数据统计分析

11. 🔥 **后台管理表单集**
    - 用户管理表单
    - 权限配置表单
    - 内容编辑表单
    - 设置表单

### 专家级（持续挑战）

12. 💎 **低代码表单平台**
    - 可视化设计器
    - 组件市场
    - 模板库
    - 表单发布与管理

13. 💎 **智能表单引擎**
    - AI 辅助生成表单
    - 智能验证
    - 自动填充
    - 数据分析

---

## 学习资源

### 官方资源
- 📘 [官方文档](http://www.form-create.com/v3/)
- 🎓 [在线示例](http://www.form-create.com/v3/guide/demo)
- 💻 [GitHub 仓库](https://github.com/xaboy/form-create)

### 本项目资源
- 📖 [深度学习指南](./FORMCREATE_ADVANCED.md)
- 📚 [API 完整文档](./FORMCREATE_API.md)
- 🚀 [快速参考](./FORMCREATE_API_QUICK.md)
- 🧪 [实战演示](../pages-config/formcreate-api/)

### 学习建议

1. **循序渐进**：按阶段学习，不要跳跃
2. **动手实践**：每学一个知识点立即写代码验证
3. **项目驱动**：通过实际项目巩固知识
4. **总结复盘**：每个阶段结束写学习笔记
5. **社区交流**：遇到问题及时查文档或提问

### 时间规划建议

| 学习强度 | 每日学习时间 | 完成入门 | 达到熟练 |
|---------|------------|---------|---------|
| 全职学习 | 8 小时/天 | 2 天 | 7-10 天 |
| 兼职学习 | 4 小时/天 | 4 天 | 14-20 天 |
| 业余学习 | 2 小时/天 | 7 天 | 30 天 |

---

**祝学习顺利！**🎉

如有问题，欢迎查阅：
- [FORMCREATE_ADVANCED.md](./FORMCREATE_ADVANCED.md) - 深度学习指南
- [FORMCREATE_API.md](./FORMCREATE_API.md) - 完整 API 参考
- [FORMCREATE_API_QUICK.md](./FORMCREATE_API_QUICK.md) - 快速查阅手册
