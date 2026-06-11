<!--
@module app:views/app/dev-system/components/NodeAgentGateConfig
app 的 views/app/dev-system/components/NodeAgentGateConfig 模块。
该 DTS shard 当前不导出 ClassModel symbol。
-->
<template>
  <div v-if="showGateFields">
    <el-divider content-position="left">AI 闸门</el-divider>
    <el-alert
      type="info"
      :closable="false"
      show-icon
      class="gate-hint"
      title="pageDesign Agent 读取 planningStatus / implGate；未放行时 runner fail-fast。"
    />
    <el-form-item label="策划状态" class="fi fi--wide">
      <el-select
        v-model="planningStatusModel"
        clearable
        placeholder="自动（按功能描述推断）"
        @change="state.markNavDirty"
      >
        <el-option label="策划初稿 planning_draft" value="planning_draft" />
        <el-option label="策划定稿 planning_confirmed" value="planning_confirmed" />
      </el-select>
    </el-form-item>
    <el-form-item label="实现闸门" class="fi fi--wide">
      <el-select
        v-model="implGateModel"
        clearable
        placeholder="默认开放（过渡期）"
        @change="state.markNavDirty"
      >
        <el-option label="关闭 closed" value="closed" />
        <el-option label="放行 open" value="open" />
      </el-select>
    </el-form-item>
    <el-form-item label="上游契约" class="fi fi--wide">
      <el-switch
        v-model="state.navEditDto.upstreamContractsSatisfied"
        active-text="已就绪"
        inactive-text="未就绪"
        @change="state.markNavDirty"
      />
    </el-form-item>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { DevState } from '../useDevState'
import { useNodeKindFlags } from '../composables/useNodeKindFlags'

const props = defineProps<{
  state: DevState
}>()

const flags = useNodeKindFlags(props.state)
const showGateFields = computed(() => flags.isPageNode.value || flags.isSubPageNode.value)

const planningStatusModel = computed({
  get: () => props.state.navEditDto.planningStatus ?? '',
  set: (value: '' | 'planning_draft' | 'planning_confirmed') => {
    props.state.navEditDto.planningStatus = value === '' ? undefined : value
  },
})

const implGateModel = computed({
  get: () => props.state.navEditDto.implGate ?? '',
  set: (value: '' | 'closed' | 'open') => {
    props.state.navEditDto.implGate = value === '' ? undefined : value
  },
})
</script>

<style scoped>
.gate-hint {
  margin-bottom: 12px;
}
</style>
