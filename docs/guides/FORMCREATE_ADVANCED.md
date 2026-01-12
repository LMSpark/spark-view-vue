# Form-Create 深度学习指南

> **基于官方文档 v3 的完整深度教程**  
> 涵盖高级特性、复杂场景、最佳实践

## 📚 目录

1. [核心概念深度解析](#1-核心概念深度解析)
2. [API 完整参考](#2-api-完整参考)
3. [高级特性详解](#3-高级特性详解)
4. [组件联动机制](#4-组件联动机制)
5. [自定义扩展系统](#5-自定义扩展系统)
6. [表单验证体系](#6-表单验证体系)
7. [数据管理与流转](#7-数据管理与流转)
8. [事件系统](#8-事件系统)
9. [性能优化](#9-性能优化)
10. [复杂场景实战](#10-复杂场景实战)

---

## 1. 核心概念深度解析

### 1.1 Form-Create 架构设计

```
表单层次结构:
┌─────────────────────────────────────────┐
│   FormCreate Instance (顶层 API)        │
├─────────────────────────────────────────┤
│   Options (全局配置)                     │
│   - 表单全局参数                         │
│   - 组件默认配置                         │
│   - 事件处理器                          │
├─────────────────────────────────────────┤
│   Rules (生成规则数组)                   │
│   - Rule1: { type, field, props, ... }  │
│   - Rule2: { type, field, props, ... }  │
│   - Rule3: 子表单/分组                   │
├─────────────────────────────────────────┤
│   Vue Components (渲染层)               │
│   - 基于规则动态生成组件                 │
│   - 双向数据绑定                        │
└─────────────────────────────────────────┘
```

### 1.2 Rule 规则对象详解

#### 完整的 Rule 结构

```typescript
interface Rule {
  // 【必填】组件类型
  type: 'input' | 'select' | 'checkbox' | 'radio' | ... | ComponentType;
  
  // 【必填】字段名（数据绑定 key）
  field: string;
  
  // 【必填】字段标题
  title: string;
  
  // 【可选】初始值
  value?: any;
  
  // 【可选】组件 props（透传给 UI 组件）
  props?: Record<string, any>;
  
  // 【可选】验证规则
  validate?: Array<ValidateRule>;
  
  // 【可选】组件事件处理
  on?: Record<string, Function>;
  
  // 【可选】组件插槽内容
  children?: Rule[] | Array<{ type: 'template'; slot: string; template: string }>;
  
  // 【可选】控制逻辑（联动）
  control?: Control[];
  
  // 【可选】自定义属性扩展
  effect?: Record<string, any> | { [key: string]: any };
  
  // 【可选】组件 ref 引用名
  name?: string;
  
  // 【可选】条件渲染
  hidden?: boolean;
  display?: boolean;
  
  // 【可选】禁用状态
  disabled?: boolean;
  
  // 【可选】栅格布局配置
  col?: { span?: number; offset?: number; push?: number; pull?: number };
  
  // 【可选】包裹容器配置
  wrap?: { labelCol?: object; wrapperCol?: object; colon?: boolean };
  
  // 【可选】前缀/后缀组件
  prefix?: Rule | string;
  suffix?: Rule | string;
  
  // 【可选】计算属性
  computed?: Record<string, ComputedFn>;
  
  // 【可选】生命周期钩子
  mounted?: (inject: InjectArg) => void;
  
  // 【可选】远程数据加载
  $fetch?: FetchOption;
  
  // 【可选】静态数据关联
  $loadData?: string;
  
  // 【可选】必填验证（快捷方式）
  $required?: boolean | { message: string };
  
  // 【可选】组件内部验证
  $componentValidate?: boolean;
}
```

### 1.3 API 对象层级关系

```typescript
interface API {
  // ========== 属性 ==========
  config: Options;              // 全局配置
  form: Object;                 // 表单数据对象
  rule: Rule[];                 // 生成规则数组
  parent?: API;                 // 父表单 API（子表单场景）
  top?: API;                    // 最顶层表单 API
  children: API[];              // 子表单 API 数组
  index?: number;               // 当前表单索引（子表单场景）
  siblings?: API[];             // 同级表单数组
  
  // ========== 核心方法 ==========
  
  // --- 数据操作 ---
  formData(): Object;                      // 获取表单数据
  formData(fields: string[]): Object;      // 获取指定字段数据
  getValue(field: string): any;            // 获取字段值
  setValue(field: string, value: any): void;
  setValue(formData: Object): void;
  coverValue(formData: Object): void;      // 覆盖表单数据（不触发验证）
  
  // --- 规则操作 ---
  getRule(id: string): Rule;               // 获取规则（field/name）
  updateRule(field: string, rule: Partial<Rule>): void;
  mergeRule(field: string, rule: Partial<Rule>): void;  // 深度合并
  append(rule: Rule, field?: string, child?: boolean): void;
  prepend(rule: Rule, field?: string, child?: boolean): void;
  removeField(field: string): Rule;
  removeRule(rule: Rule): Rule;
  
  // --- 显示控制 ---
  hidden(hidden: boolean, field?: string | string[]): void;
  display(display: boolean, field?: string | string[]): void;
  disabled(disabled: boolean, field?: string | string[]): void;
  
  // --- 验证 ---
  validate(callback?: Function): Promise<any>;
  validateField(field: string, callback?: Function): Promise<any>;
  clearValidateState(fields?: string | string[], clearSub?: boolean): void;
  updateValidate(field: string, validate: Object[], merge?: boolean): void;
  
  // --- 表单操作 ---
  submit(success?: Function, fail?: Function): Promise<any>;
  resetFields(fields?: string | string[]): void;
  refresh(): void;                         // 重新渲染表单
  reload(rules: Rule[]): void;            // 重新加载规则
  
  // --- 组件操作 ---
  el(id: string): any;                    // 获取组件实例
  method(id: string, name: string): Function;
  exec(id: string, name: string, ...args): any;
  trigger(id: string, event: string, ...args): void;
  
  // --- 事件管理 ---
  on(event: string | string[], callback: Function): this;
  once(event: string | string[], callback: Function): this;
  off(event?: string | string[], callback?: Function): this;
  emit(event: string, ...args): void;
  
  // --- 数据管理 ---
  setData(id: string, value?: any): void;
  getData(id: string, defaultValue?: any): any;
  refreshData(id: string): void;
  watchData(fn: WatchFn): Function;
  
  // --- 异步操作 ---
  nextTick(fn: Function): void;
  nextRefresh(fn: Function): void;
  deferSyncValue(fn: Function, autoSync?: boolean): void;
  
  // --- 子表单 ---
  getSubForm(field: string): API | API[];
}
```

---

## 2. API 完整参考

### 2.1 数据操作 API

#### formData() - 获取表单数据

```javascript
// 获取全部数据
const allData = api.formData();
// { username: 'admin', age: 25, email: 'admin@example.com' }

// 获取指定字段
const partialData = api.formData(['username', 'email']);
// { username: 'admin', email: 'admin@example.com' }

// 等价于 api.form
console.log(api.form === api.formData()); // true
```

#### getValue() / setValue() - 字段值操作

```javascript
// 获取单个字段值
const username = api.getValue('username');

// 设置单个字段
api.setValue('username', 'newAdmin');

// 批量设置（合并）
api.setValue({
  username: 'newAdmin',
  age: 30
});

// 覆盖全部数据（不触发验证）
api.coverValue({
  username: 'admin',
  age: 25,
  email: 'new@example.com'
});
```

### 2.2 规则操作 API

#### getRule() - 获取规则对象

```javascript
// 通过 field 获取
const rule = api.getRule('username');

// 通过 name 获取（ref引用名）
const ruleByName = api.getRule('usernameInput');

// 获取原始规则（未处理）
const originRule = api.getRule('username', true);

// 获取最终渲染规则
const renderRule = api.getRenderRule('username');
```

#### updateRule() / mergeRule() - 更新规则

```javascript
// 完全替换规则属性
api.updateRule('username', {
  props: { disabled: true, placeholder: '请输入用户名' }
});

// 深度合并规则（推荐）
api.mergeRule('username', {
  props: {
    disabled: true  // 只更新 disabled，保留其他 props
  }
});

// 批量更新
api.updateRule({
  username: { props: { disabled: true } },
  email: { props: { disabled: true } }
});
```

#### append() / prepend() - 动态添加组件

```javascript
const newRule = {
  type: 'input',
  field: 'newField',
  title: '新字段',
  value: '',
  props: { placeholder: '请输入' }
};

// 追加到表单末尾
api.append(newRule);

// 追加到指定字段后
api.append(newRule, 'username');

// 追加为指定字段的子组件
api.append(newRule, 'parentField', true);

// 插入到表单开头
api.prepend(newRule);

// 插入到指定字段前
api.prepend(newRule, 'username');
```

#### removeField() / removeRule() - 删除组件

```javascript
// 通过 field 删除
const removedRule = api.removeField('username');

// 通过 Rule 对象删除
api.removeRule(rule);

// 删除多个字段（遍历）
['field1', 'field2', 'field3'].forEach(field => {
  api.removeField(field);
});
```

### 2.3 显示控制 API

#### hidden() - 隐藏/显示（不占位）

```javascript
// 隐藏整个表单
api.hidden(true);

// 隐藏单个字段
api.hidden(true, 'username');

// 隐藏多个字段
api.hidden(true, ['username', 'email']);

// 显示字段
api.hidden(false, 'username');

// 获取隐藏状态
const isHidden = api.hiddenStatus('username');
```

#### display() - 显示控制（占位）

```javascript
// 控制显示（保留DOM，visibility: hidden）
api.display(false, 'username');

// 获取显示状态
const isDisplay = api.displayStatus('username');
```

#### disabled() - 禁用/启用

```javascript
// 禁用整个表单
api.disabled(true);

// 禁用单个字段
api.disabled(true, 'username');

// 禁用多个字段
api.disabled(true, ['username', 'email']);

// 启用字段
api.disabled(false, 'username');
```

### 2.4 验证 API

#### validate() - 全表单验证

```javascript
// Promise 方式
api.validate()
  .then(formData => {
    console.log('验证通过', formData);
    // 提交表单...
  })
  .catch(errors => {
    console.error('验证失败', errors);
  });

// Callback 方式
api.validate((valid, errors) => {
  if (valid) {
    console.log('验证通过');
  } else {
    console.log('验证失败', errors);
  }
});
```

#### validateField() - 单字段验证

```javascript
api.validateField('username')
  .then(() => console.log('用户名验证通过'))
  .catch(err => console.error('用户名验证失败', err));
```

#### clearValidateState() - 清除验证状态

```javascript
// 清除全部验证状态
api.clearValidateState();

// 清除单个字段
api.clearValidateState('username');

// 清除多个字段
api.clearValidateState(['username', 'email']);

// 清除包括子表单
api.clearValidateState(undefined, true);
```

#### updateValidate() - 动态更新验证规则

```javascript
// 替换验证规则
api.updateValidate('username', [
  { required: true, message: '用户名必填' },
  { min: 3, message: '最少3个字符' }
]);

// 合并验证规则（保留原有）
api.updateValidate('username', [
  { pattern: /^[a-zA-Z]+$/, message: '只能包含字母' }
], true);

// 批量更新
api.updateValidates({
  username: [{ required: true }],
  email: [{ type: 'email' }]
});
```

### 2.5 表单操作 API

#### submit() - 提交表单

```javascript
// 基础提交（先验证后执行）
api.submit()
  .then(formData => {
    console.log('提交成功', formData);
    // 发送请求...
  })
  .catch(api => {
    console.log('验证失败，不提交');
  });

// 带回调的提交
api.submit(
  (formData, api) => {
    // 验证通过回调
    console.log('提交数据', formData);
  },
  (api) => {
    // 验证失败回调
    console.log('验证失败');
  }
);

// 监听提交事件（全局）
api.onSubmit((formData, api) => {
  console.log('表单提交', formData);
});
```

#### resetFields() - 重置表单

```javascript
// 重置全部字段
api.resetFields();

// 重置单个字段
api.resetFields('username');

// 重置多个字段
api.resetFields(['username', 'email']);
```

#### refresh() - 刷新表单

```javascript
// 强制重新渲染
api.refresh();

// 回调后刷新
api.nextRefresh(() => {
  // 执行操作...
  api.setValue('username', 'newValue');
});

// 刷新全局配置
api.refreshOptions();
```

#### reload() - 重新加载规则

```javascript
const newRules = [
  { type: 'input', field: 'newField1', title: '字段1' },
  { type: 'input', field: 'newField2', title: '字段2' }
];

api.reload(newRules);  // 完全替换表单规则
```

### 2.6 组件实例 API

#### el() - 获取组件实例

```javascript
// 获取表单项组件实例
const inputRef = api.el('username');

// 调用 Element Plus 组件方法
inputRef.focus();

// 获取表单容器实例
const formEl = api.formEl();

// 获取表单项包裹容器
const wrapEl = api.wrapEl('username');
```

#### method() / exec() - 调用组件方法

```javascript
// 获取方法引用
const focusMethod = api.method('username', 'focus');
focusMethod();

// 直接执行（推荐）
api.exec('username', 'focus');

// 带参数执行
api.exec('username', 'setValue', 'newValue');
```

#### trigger() - 触发组件事件

```javascript
// 手动触发事件
api.trigger('username', 'focus');
api.trigger('username', 'change', 'newValue');
```

### 2.7 事件管理 API

#### on() / once() / off() - 事件订阅

```javascript
// 监听单个事件
api.on('change', (field, value, api) => {
  console.log(`${field} 值变化为: ${value}`);
});

// 监听多个事件
api.on(['mounted', 'change'], (eventName, ...args) => {
  console.log('事件触发', eventName, args);
});

// 一次性监听
api.once('mounted', (api) => {
  console.log('表单初始化完成');
});

// 取消监听
const handler = (field, value) => { /* ... */ };
api.on('change', handler);
api.off('change', handler);

// 取消所有监听
api.off();
```

#### emit() - 触发自定义事件

```javascript
// 触发事件
api.emit('customEvent', { data: 'value' });

// 配合监听使用
api.on('customEvent', (data) => {
  console.log('收到自定义事件', data);
});
```

#### bus - 全局事件总线

```javascript
// 全局事件发布
api.bus.$emit('globalEvent', data);

// 全局事件订阅
api.bus.$on('globalEvent', (data) => {
  console.log('全局事件', data);
});

// 取消全局订阅
api.bus.$off('globalEvent', handler);
```

### 2.8 数据管理 API

#### setData() / getData() - 外部数据

```javascript
// 设置外部数据（用于组件间通信）
api.setData('sharedData', { count: 0 });

// 获取外部数据
const data = api.getData('sharedData');

// 带默认值
const data = api.getData('sharedData', { count: 0 });

// 监听数据变化
const unwatch = api.watchData((get, changed) => {
  const sharedData = get('sharedData');
  if (changed) {
    console.log('数据变化', sharedData);
  }
});

// 取消监听
unwatch();

// 刷新关联组件
api.refreshData('sharedData');
```

### 2.9 异步操作 API

#### nextTick() - 下一帧执行

```javascript
api.nextTick((api) => {
  // 表单渲染完成后执行
  console.log('DOM 已更新');
  const el = api.el('username');
  el.focus();
});
```

#### nextRefresh() - 回调后刷新

```javascript
api.nextRefresh(() => {
  // 批量修改
  api.setValue('field1', 'value1');
  api.setValue('field2', 'value2');
  api.setValue('field3', 'value3');
  // 自动刷新
});
```

#### deferSyncValue() - 延迟同步

```javascript
api.deferSyncValue(() => {
  api.setValue('field1', 'value1');
  api.setValue('field2', 'value2');
}, true);  // autoSync = true 自动同步
```

### 2.10 按钮控制 API

```javascript
// 提交按钮
api.btn.loading(true);           // 加载状态
api.btn.disabled(true);          // 禁用
api.btn.show(false);             // 隐藏
api.submitBtnProps({ type: 'primary', size: 'large' });

// 重置按钮
api.resetBtn.loading(false);
api.resetBtn.disabled(false);
api.resetBtn.show(true);
api.resetBtnProps({ type: 'default' });
```

---

## 3. 高级特性详解

### 3.1 组件生命周期

```javascript
const rule = {
  type: 'input',
  field: 'username',
  title: '用户名',
  
  // 组件挂载后
  mounted(inject) {
    console.log('组件挂载', inject.api, inject.rule);
    inject.api.setValue('username', 'defaultUser');
  }
};
```

**生命周期事件（全局）**：

```javascript
api.on('mounted', (api) => {
  console.log('表单挂载完成');
});

api.on('change', (field, value, api) => {
  console.log(`${field} 值变化: ${value}`);
});

api.on('submit', (formData, api) => {
  console.log('表单提交', formData);
});
```

### 3.2 双向数据绑定

Form-Create 自动实现表单数据与视图的双向绑定：

```javascript
// 方式1: 通过 api 修改（触发响应式）
api.setValue('username', 'newUser');

// 方式2: 直接修改 form 对象（Vue 3 响应式）
api.form.username = 'newUser';

// 方式3: 通过 v-model（组件内部）
const formData = ref({});
// <form-create v-model="formData" />
formData.value.username = 'newUser';
```

### 3.3 计算属性（Computed）

```javascript
const rule = {
  type: 'input',
  field: 'fullName',
  title: '全名',
  
  computed: {
    // 计算 value
    value(api) {
      const firstName = api.getValue('firstName');
      const lastName = api.getValue('lastName');
      return `${firstName} ${lastName}`;
    },
    
    // 计算 props
    props(api) {
      const isAdmin = api.getValue('role') === 'admin';
      return {
        disabled: !isAdmin,
        placeholder: isAdmin ? '请输入全名' : '无权限'
      };
    }
  }
};
```

### 3.4 组件内获取上下文（Inject）

**在自定义组件中**：

```vue
<script setup>
const props = defineProps({
  formCreateInject: Object
});

const { api, rule, field, options } = props.formCreateInject;

// 使用 api 操作表单
const setValue = (value) => {
  api.setValue(field, value);
};

// 获取其他字段值
const otherValue = api.getValue('otherField');
</script>
```

---

## 4. 组件联动机制

### 4.1 Control 配置详解

```typescript
type Control = {
  // 触发条件
  value?: any;
  condition?: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'in' | 'notIn' | 
               'on' | 'notOn' | 'between' | 'notBetween' | 'empty' | 'notEmpty' | 'pattern';
  handle?: (val: any, api: API) => boolean;
  
  // 控制方法
  method?: 'hidden' | 'if' | 'display' | 'disabled' | 'enabled' | 'required';
  
  // 控制目标
  rule?: string[] | Rule[];
  append?: string;   // 追加到指定字段后
  prepend?: string;  // 插入到指定字段前
  child?: boolean;   // 作为子组件
};
```

### 4.2 联动场景示例

#### 场景1: 条件显示字段

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
      value: 'company',
      rule: ['companyName', 'taxNumber']  // 企业类型时显示
    }
  ]
},
{
  type: 'input',
  field: 'companyName',
  title: '公司名称',
  hidden: true  // 默认隐藏
},
{
  type: 'input',
  field: 'taxNumber',
  title: '税号',
  hidden: true
}
```

#### 场景2: 动态必填验证

```javascript
{
  type: 'input',
  field: 'trigger',
  title: '触发器',
  control: [
    {
      value: 'required',
      method: 'required',
      rule: ['targetField']
    }
  ]
},
{
  type: 'input',
  field: 'targetField',
  title: '目标字段'
}
```

#### 场景3: 值区间控制

```javascript
{
  type: 'inputNumber',
  field: 'score',
  title: '评分',
  control: [
    {
      value: [0, 60],
      condition: 'between',
      rule: [{ type: 'input', field: 'reason', title: '不及格原因' }]
    }
  ]
}
```

#### 场景4: 自定义条件

```javascript
{
  type: 'input',
  field: 'password',
  title: '密码',
  control: [
    {
      handle(val, api) {
        // 自定义逻辑: 密码长度 < 6 时显示提示
        return val.length < 6;
      },
      rule: [
        { type: 'alert', props: { type: 'warning', message: '密码强度不足' } }
      ]
    }
  ]
}
```

### 4.3 多条件联动

```javascript
{
  type: 'inputNumber',
  field: 'age',
  title: '年龄',
  control: [
    {
      value: 18,
      condition: '<',
      method: 'disabled',
      rule: ['drivingLicense']
    },
    {
      value: 60,
      condition: '>',
      method: 'display',
      rule: ['retirementPlan']
    }
  ]
}
```

---

## 5. 自定义扩展系统

### 5.1 自定义组件扩展

**注册自定义组件**：

```javascript
import formCreate from '@form-create/element-ui';
import MyCustomComponent from './MyCustomComponent.vue';

formCreate.component('myCustom', MyCustomComponent);

// 使用
const rule = {
  type: 'myCustom',
  field: 'customField',
  title: '自定义组件',
  props: {
    customProp: 'value'
  }
};
```

**自定义表单组件（带 v-model）**：

```vue
<!-- MyFormComponent.vue -->
<script setup>
const props = defineProps({
  modelValue: [String, Number],
  formCreateInject: Object
});

const emit = defineEmits(['update:modelValue']);

const handleChange = (val) => {
  emit('update:modelValue', val);
};
</script>

<template>
  <el-input :model-value="modelValue" @input="handleChange" />
</template>
```

### 5.2 自定义属性扩展（Effect）

**定义 Effect**：

```javascript
const fetchEffect = {
  name: 'fetch',
  
  // 初始化时加载数据
  async load({ value }, rule, api) {
    const { url, method = 'GET', params } = value;
    
    try {
      const response = await fetch(url, {
        method,
        body: method === 'POST' ? JSON.stringify(params) : undefined
      });
      const data = await response.json();
      
      // 更新组件选项
      rule.options = data.map(item => ({
        label: item.name,
        value: item.id
      }));
      
      api.sync(rule);  // 同步到视图
    } catch (error) {
      console.error('数据加载失败', error);
    }
  },
  
  // 属性值变化时重新加载
  watch({ value }, rule, api) {
    this.load({ value }, rule, api);
  }
};

// 注册
formCreate.register(fetchEffect);

// 使用
const rule = {
  type: 'select',
  field: 'category',
  title: '分类',
  effect: {
    fetch: {
      url: '/api/categories',
      method: 'GET'
    }
  }
};

// 简写方式
const rule = {
  type: 'select',
  field: 'category',
  title: '分类',
  $fetch: { url: '/api/categories' }
};
```

**内置 Effect 示例**：

```javascript
// 1. 必填验证
{
  type: 'input',
  field: 'username',
  title: '用户名',
  $required: true  // 或 $required: { message: '请输入用户名' }
}

// 2. 远程数据加载
{
  type: 'select',
  field: 'city',
  title: '城市',
  $fetch: {
    url: '/api/cities',
    method: 'GET',
    onSuccess(data, rule, api) {
      rule.options = data.map(item => ({ label: item.name, value: item.id }));
    }
  }
}

// 3. 静态数据关联
{
  type: 'select',
  field: 'product',
  title: '产品',
  $loadData: 'productList'  // 关联 api.setData('productList', [...])
}

// 4. 组件内部验证
{
  type: 'customComponent',
  field: 'customField',
  title: '自定义字段',
  $componentValidate: true  // 调用组件内部的 validate() 方法
}
```

### 5.3 扩展 API 方法

```javascript
formCreate.extendApi((api) => {
  // 添加自定义方法
  api.myCustomMethod = function(param) {
    console.log('Custom method called', param);
    // 可以访问 this (api 实例)
    this.setValue('someField', param);
  };
  
  // 添加工具方法
  api.batchSetValue = function(data) {
    Object.entries(data).forEach(([field, value]) => {
      this.setValue(field, value);
    });
  };
});

// 使用
api.myCustomMethod('test');
api.batchSetValue({ field1: 'value1', field2: 'value2' });
```

---

## 6. 表单验证体系

### 6.1 验证规则详解

```javascript
{
  type: 'input',
  field: 'username',
  title: '用户名',
  validate: [
    // 必填
    { required: true, message: '请输入用户名', trigger: 'blur' },
    
    // 长度范围
    { min: 3, max: 20, message: '长度在 3 到 20 个字符', trigger: 'blur' },
    
    // 正则表达式
    { pattern: /^[a-zA-Z0-9_]+$/, message: '只能包含字母、数字和下划线', trigger: 'blur' },
    
    // 自定义验证器
    {
      validator(rule, value, callback) {
        if (value.includes('admin')) {
          callback(new Error('用户名不能包含 admin'));
        } else {
          callback();
        }
      },
      trigger: 'blur'
    },
    
    // 异步验证
    {
      asyncValidator(rule, value) {
        return new Promise((resolve, reject) => {
          fetch(`/api/check-username?name=${value}`)
            .then(res => res.json())
            .then(data => {
              if (data.exists) {
                reject('用户名已存在');
              } else {
                resolve();
              }
            });
        });
      },
      trigger: 'blur'
    }
  ]
}
```

### 6.2 内置验证类型

```javascript
// 类型验证
{ type: 'string', message: '必须是字符串' }
{ type: 'number', message: '必须是数字' }
{ type: 'boolean', message: '必须是布尔值' }
{ type: 'method', message: '必须是函数' }
{ type: 'regexp', message: '必须是正则表达式' }
{ type: 'integer', message: '必须是整数' }
{ type: 'float', message: '必须是浮点数' }
{ type: 'array', message: '必须是数组' }
{ type: 'object', message: '必须是对象' }
{ type: 'enum', enum: ['a', 'b'], message: '必须是 a 或 b' }
{ type: 'date', message: '必须是日期' }
{ type: 'url', message: '必须是 URL' }
{ type: 'hex', message: '必须是十六进制' }
{ type: 'email', message: '必须是邮箱' }

// 范围验证
{ len: 10, message: '长度必须是 10' }
{ min: 3, message: '最小长度 3' }
{ max: 20, message: '最大长度 20' }
{ range: [3, 20], message: '长度在 3 到 20 之间' }
```

### 6.3 动态验证规则

```javascript
// 运行时更新验证规则
api.updateValidate('username', [
  { required: true, message: '用户名必填' },
  { min: 5, message: '最少5个字符' }
]);

// 合并验证规则（保留原有）
api.updateValidate('username', [
  { pattern: /^[a-zA-Z]+$/, message: '只能包含字母' }
], true);

// 批量更新
api.updateValidates({
  username: [{ required: true }],
  email: [{ type: 'email' }],
  phone: [{ pattern: /^1[3-9]\d{9}$/ }]
});
```

---

## 7. 数据管理与流转

### 7.1 表单数据流

```
用户输入 → 组件 v-model → Rule.value → api.form → 验证 → 提交
         ↑                                           ↓
         ← api.setValue() ← 业务逻辑 ← onChange 事件 ←
```

### 7.2 外部数据管理

```javascript
// 设置外部数据（用于跨组件共享）
api.setData('sharedConfig', {
  theme: 'dark',
  language: 'zh-CN'
});

// 在规则中关联外部数据
{
  type: 'select',
  field: 'theme',
  title: '主题',
  $loadData: 'sharedConfig',
  update(value, rule, api) {
    // 外部数据变化时触发
    const config = api.getData('sharedConfig');
    rule.value = config.theme;
  }
}

// 监听外部数据变化
api.watchData((get, changed) => {
  if (changed) {
    const config = get('sharedConfig');
    console.log('配置变化', config);
  }
});

// 手动刷新关联组件
api.refreshData('sharedConfig');
```

### 7.3 子表单数据管理

```javascript
// 子表单配置
{
  type: 'group',
  field: 'addresses',
  title: '地址列表',
  value: [
    { province: '北京', city: '北京市', district: '朝阳区' }
  ],
  props: {
    max: 5,
    min: 1,
    rules: [
      { type: 'input', field: 'province', title: '省份' },
      { type: 'input', field: 'city', title: '城市' },
      { type: 'input', field: 'district', title: '区县' }
    ]
  }
}

// 获取子表单 API
const subFormApis = api.getSubForm('addresses');

subFormApis.forEach((subApi, index) => {
  console.log(`第 ${index + 1} 个子表单数据:`, subApi.formData());
});

// 访问子表单层级
const topApi = subApi.top;     // 最顶层表单
const parentApi = subApi.parent; // 父表单
const siblingsApis = subApi.siblings; // 同级表单
```

---

## 8. 事件系统

### 8.1 表单事件

```javascript
// mounted - 表单挂载完成
api.on('mounted', (api) => {
  console.log('表单初始化完成');
});

// change - 字段值变化
api.on('change', (field, value, api) => {
  console.log(`${field} 变化: ${value}`);
});

// submit - 表单提交
api.on('submit', (formData, api) => {
  console.log('表单提交', formData);
});

// control - 联动规则生效
api.on('control', (field, rule, api) => {
  console.log(`${field} 触发联动`, rule);
});

// removeField - 字段移除
api.on('removeField', (field, rule, api) => {
  console.log(`${field} 被移除`);
});

// reload - 规则重新加载
api.on('reload', (rules, api) => {
  console.log('规则重新加载', rules);
});
```

### 8.2 组件事件

**在规则中配置**：

```javascript
{
  type: 'input',
  field: 'username',
  title: '用户名',
  inject: true,  // 注入 api
  on: {
    // 原生事件
    focus({ api, rule, self }) {
      console.log('输入框获得焦点');
      api.setValue('focusCount', api.getValue('focusCount') + 1);
    },
    
    blur({ api, rule }) {
      console.log('输入框失去焦点');
    },
    
    // Element Plus 组件事件
    input({ api }, value) {
      console.log('输入中', value);
    },
    
    change({ api }, value) {
      console.log('值变化', value);
    }
  }
}
```

### 8.3 自定义事件

```javascript
// 触发自定义事件
api.emit('customEvent', { data: 'value' });

// 监听自定义事件
api.on('customEvent', (data) => {
  console.log('收到事件', data);
});

// 跨组件通信（使用 bus）
api.bus.$emit('global:userLogin', { userId: 123 });

api.bus.$on('global:userLogin', (data) => {
  console.log('用户登录', data);
});
```

---

## 9. 性能优化

### 9.1 组件缓存

Form-Create 内置组件缓存机制，避免不必要的重新渲染：

```javascript
// 使用 name 属性标识组件（会被缓存）
{
  type: 'input',
  field: 'username',
  title: '用户名',
  name: 'usernameInput'  // 缓存 key
}
```

### 9.2 批量操作优化

```javascript
// ❌ 不好的做法：多次触发渲染
api.setValue('field1', 'value1');
api.setValue('field2', 'value2');
api.setValue('field3', 'value3');

// ✅ 好的做法：批量设置
api.setValue({
  field1: 'value1',
  field2: 'value2',
  field3: 'value3'
});

// ✅ 使用 nextRefresh 延迟刷新
api.nextRefresh(() => {
  api.setValue('field1', 'value1');
  api.setValue('field2', 'value2');
  // ...批量操作
});
```

### 9.3 条件渲染 vs 显示控制

```javascript
// hidden: true - 不渲染 DOM（性能更好）
{
  type: 'input',
  field: 'field1',
  hidden: true
}

// display: false - 渲染 DOM 但隐藏（visibility: hidden）
{
  type: 'input',
  field: 'field2',
  display: false
}
```

### 9.4 懒加载组件

```javascript
// 按需加载大组件
formCreate.component('heavyComponent', () => import('./HeavyComponent.vue'));

// 使用
{
  type: 'heavyComponent',
  field: 'heavy',
  hidden: true  // 默认隐藏，需要时再显示
}
```

---

## 10. 复杂场景实战

### 10.1 动态表单（根据数据生成）

```javascript
function generateRules(config) {
  return config.fields.map(fieldConfig => {
    const baseRule = {
      type: fieldConfig.type,
      field: fieldConfig.field,
      title: fieldConfig.title,
      value: fieldConfig.defaultValue,
      props: fieldConfig.props || {}
    };
    
    if (fieldConfig.required) {
      baseRule.validate = [
        { required: true, message: `请输入${fieldConfig.title}` }
      ];
    }
    
    if (fieldConfig.options) {
      baseRule.options = fieldConfig.options;
    }
    
    return baseRule;
  });
}

// 使用
const config = {
  fields: [
    { type: 'input', field: 'username', title: '用户名', required: true },
    { type: 'input', field: 'email', title: '邮箱', required: true },
    {
      type: 'select',
      field: 'role',
      title: '角色',
      options: [
        { label: '管理员', value: 'admin' },
        { label: '用户', value: 'user' }
      ]
    }
  ]
};

const rules = generateRules(config);
```

### 10.2 多步骤表单

```javascript
const steps = [
  {
    title: '基本信息',
    rules: [
      { type: 'input', field: 'username', title: '用户名' },
      { type: 'input', field: 'email', title: '邮箱' }
    ]
  },
  {
    title: '详细信息',
    rules: [
      { type: 'input', field: 'phone', title: '电话' },
      { type: 'input', field: 'address', title: '地址' }
    ]
  },
  {
    title: '确认信息',
    rules: [
      {
        type: 'div',
        children: [
          { type: 'template', template: '<div>请确认您的信息</div>' }
        ]
      }
    ]
  }
];

const currentStep = ref(0);
const currentRules = computed(() => steps[currentStep.value].rules);

// 下一步
const nextStep = async () => {
  const valid = await api.validate();
  if (valid) {
    if (currentStep.value < steps.length - 1) {
      currentStep.value++;
      api.reload(currentRules.value);
    } else {
      // 提交表单
      api.submit();
    }
  }
};

// 上一步
const prevStep = () => {
  if (currentStep.value > 0) {
    currentStep.value--;
    api.reload(currentRules.value);
  }
};
```

### 10.3 级联选择（省市区）

```javascript
{
  type: 'select',
  field: 'province',
  title: '省份',
  props: {
    placeholder: '请选择省份'
  },
  on: {
    change({ api }, provinceCode) {
      // 加载城市列表
      api.updateRule('city', {
        props: { loading: true }
      });
      
      fetch(`/api/cities?province=${provinceCode}`)
        .then(res => res.json())
        .then(cities => {
          api.updateRule('city', {
            options: cities.map(c => ({ label: c.name, value: c.code })),
            props: { disabled: false, loading: false }
          });
          
          // 清空城市和区县
          api.setValue('city', '');
          api.setValue('district', '');
          api.updateRule('district', {
            options: [],
            props: { disabled: true }
          });
        });
    }
  }
},
{
  type: 'select',
  field: 'city',
  title: '城市',
  props: {
    disabled: true,
    placeholder: '请先选择省份'
  },
  on: {
    change({ api }, cityCode) {
      // 加载区县列表
      fetch(`/api/districts?city=${cityCode}`)
        .then(res => res.json())
        .then(districts => {
          api.updateRule('district', {
            options: districts.map(d => ({ label: d.name, value: d.code })),
            props: { disabled: false }
          });
          api.setValue('district', '');
        });
    }
  }
},
{
  type: 'select',
  field: 'district',
  title: '区县',
  props: {
    disabled: true,
    placeholder: '请先选择城市'
  }
}
```

### 10.4 表格内嵌表单（可编辑表格）

```javascript
{
  type: 'group',
  field: 'tableData',
  title: '用户列表',
  value: [
    { username: 'user1', age: 25, role: 'admin' },
    { username: 'user2', age: 30, role: 'user' }
  ],
  props: {
    rules: [
      {
        type: 'input',
        field: 'username',
        title: '用户名',
        col: { span: 8 },
        validate: [{ required: true }]
      },
      {
        type: 'inputNumber',
        field: 'age',
        title: '年龄',
        col: { span: 8 },
        props: { min: 0, max: 120 }
      },
      {
        type: 'select',
        field: 'role',
        title: '角色',
        col: { span: 8 },
        options: [
          { label: '管理员', value: 'admin' },
          { label: '用户', value: 'user' }
        ]
      }
    ]
  }
}
```

### 10.5 条件渲染复杂表单

```javascript
{
  type: 'radio',
  field: 'accountType',
  title: '账户类型',
  value: 'personal',
  options: [
    { label: '个人账户', value: 'personal' },
    { label: '企业账户', value: 'company' },
    { label: '组织账户', value: 'organization' }
  ],
  control: [
    {
      value: 'personal',
      rule: [
        { type: 'input', field: 'realName', title: '真实姓名' },
        { type: 'input', field: 'idCard', title: '身份证号' }
      ]
    },
    {
      value: 'company',
      rule: [
        { type: 'input', field: 'companyName', title: '公司名称' },
        { type: 'input', field: 'taxNumber', title: '税号' },
        { type: 'input', field: 'legalPerson', title: '法人代表' }
      ]
    },
    {
      value: 'organization',
      rule: [
        { type: 'input', field: 'orgName', title: '组织名称' },
        { type: 'input', field: 'regNumber', title: '注册号' }
      ]
    }
  ]
}
```

---

## 📖 扩展阅读

- [官方文档](http://www.form-create.com/v3/)
- [GitHub 仓库](https://github.com/xaboy/form-create)
- [API 完整列表](http://www.form-create.com/v3/instance/)
- [组件库](http://www.form-create.com/v3/guide/)
- [在线示例](http://www.form-create.com/v3/guide/demo)

---

## 🎯 学习建议

1. **先掌握核心概念** → Rule 结构、API 对象、生命周期
2. **熟练使用基础 API** → setValue、getValue、validate、submit
3. **理解组件联动机制** → Control 配置、条件渲染
4. **探索高级特性** → 自定义组件、Effect 扩展、事件系统
5. **实战项目应用** → 多步骤表单、动态表单、复杂验证

---

**版本**: Form-Create v3  
**更新时间**: 2026-01-12  
**作者**: AI Learning Assistant
