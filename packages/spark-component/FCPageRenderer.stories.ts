/**
 * FCPageRenderer Stories
 *
 * 演示 SPARK 页面渲染引擎（form-create 驱动）的三种典型用法：
 *   1. HelloWorld   — 纯 HTML 文本渲染
 *   2. FormExample  — 动态表单（输入 + 下拉 + 提交按钮）
 *   3. DataTable    — 数据绑定表格（el-table）
 *
 * 所有 story 均使用内联 pageConfig，无需服务器。
 */
import type { Meta, StoryObj } from '@storybook/vue3'
import { FCPageRenderer } from '@spark-view/spark-component'
import type { PageConfig } from '@spark-view/spark-component'

const meta: Meta<typeof FCPageRenderer> = {
  title: 'SPARK / FCPageRenderer',
  component: FCPageRenderer,
  tags: ['autodocs'],
  argTypes: {
    pageConfig: { control: false },
  },
}

export default meta
type Story = StoryObj<typeof FCPageRenderer>

// ─── 1. HelloWorld ───────────────────────────────────────────────────────────
const helloConfig: PageConfig = {
  pageId: 'hello-world',
  rule: [
    {
      type: 'div',
      style: { padding: '32px', fontFamily: 'sans-serif', textAlign: 'center' },
      children: [
        {
          type: 'h2',
          style: { color: '#409eff', marginBottom: '12px' },
          children: ['👋 Hello, SPARK!'],
        },
        {
          type: 'p',
          style: { color: '#606266' },
          children: ['这是由 FCPageRenderer 根据 JSON 规则渲染的页面。'],
        },
      ],
    },
  ],
  data: {},
  script: '',
  css: '',
}

export const HelloWorld: Story = {
  args: { pageConfig: helloConfig },
}

// ─── 2. FormExample ──────────────────────────────────────────────────────────
const formScript = `
function handleSubmit() {
  const values = $api.formData()
  ElMessage.success('提交成功: ' + JSON.stringify(values))
}
function handleReset() {
  $api.resetFields()
  ElMessage.info('已重置')
}
`

const formConfig: PageConfig = {
  pageId: 'form-example',
  rule: [
    {
      type: 'el-card',
      props: { header: '用户信息表单', shadow: 'never' },
      style: { margin: '16px', maxWidth: '480px' },
      children: [
        {
          type: 'input',
          field: 'username',
          title: '用户名',
          value: '',
          props: { placeholder: '请输入用户名', clearable: true },
          validate: [{ required: true, message: '用户名不能为空', trigger: 'submit' }],
        },
        {
          type: 'input',
          field: 'email',
          title: '邮箱',
          value: '',
          props: { placeholder: 'example@spark.dev', clearable: true },
          validate: [
            { required: true, message: '邮箱不能为空', trigger: 'submit' },
            { type: 'email', message: '格式不正确', trigger: 'submit' },
          ],
        },
        {
          type: 'select',
          field: 'role',
          title: '角色',
          value: 'developer',
          options: [
            { label: '开发者', value: 'developer' },
            { label: '测试', value: 'tester' },
            { label: '管理员', value: 'admin' },
          ],
        },
        {
          type: 'div',
          style: { marginTop: '16px', display: 'flex', gap: '8px' },
          children: [
            {
              type: 'el-button',
              props: { type: 'primary' },
              on: { click: 'handleSubmit' },
              children: ['提交'],
            },
            {
              type: 'el-button',
              on: { click: 'handleReset' },
              children: ['重置'],
            },
          ],
        },
      ],
    },
  ],
  data: {},
  script: formScript,
  css: '',
}

export const FormExample: Story = {
  args: { pageConfig: formConfig },
}

// ─── 3. DataTable ─────────────────────────────────────────────────────────────
const tableConfig: PageConfig = {
  pageId: 'data-table',
  rule: [
    {
      type: 'el-card',
      props: { header: '成员列表', shadow: 'never' },
      style: { margin: '16px' },
      children: [
        {
          type: 'el-table',
          dataKey: 'members',
          props: { border: true, stripe: true, size: 'small' },
          children: [
            { type: 'el-table-column', props: { prop: 'id',   label: 'ID',   width: '60' } },
            { type: 'el-table-column', props: { prop: 'name', label: '姓名', width: '120' } },
            { type: 'el-table-column', props: { prop: 'role', label: '角色', width: '100' } },
            { type: 'el-table-column', props: { prop: 'team', label: '团队' } },
          ],
        },
      ],
    },
  ],
  data: {
    members: [
      { id: 1, name: '张三', role: '前端工程师', team: '前端团队' },
      { id: 2, name: '李四', role: '后端工程师', team: '后端团队' },
      { id: 3, name: '王五', role: '测试工程师', team: '测试团队' },
      { id: 4, name: '赵六', role: '架构师',     team: '研发中心' },
    ],
  },
  script: '',
  css: `
    .spark-page-container {
      font-family: 'PingFang SC', sans-serif;
    }
  `,
}

export const DataTable: Story = {
  args: { pageConfig: tableConfig },
}
