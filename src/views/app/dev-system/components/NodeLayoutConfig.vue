<template>
  <div>
    <el-divider content-position="left">布局配置</el-divider>
    <el-form-item v-if="flags.isDirectoryNode.value" label="子项布局" class="fi fi--wide">
      <el-radio-group v-model="state.editForm.childPlacement" @change="state.markNavDirty">
        <el-radio-button value="">默认</el-radio-button>
        <el-radio-button value="header">header</el-radio-button>
        <el-radio-button value="sidebar">sidebar</el-radio-button>
        <el-radio-button value="toolbar">toolbar</el-radio-button>
        <el-radio-button value="user-menu">user-menu</el-radio-button>
        <el-radio-button value="parent">parent</el-radio-button>
        <el-radio-button value="flat">flat</el-radio-button>
      </el-radio-group>
    </el-form-item>
    <el-form-item label="排序号" class="fi fi--narrow">
      <el-input-number v-model="state.editForm.order" :min="0" :max="999" @change="state.markNavDirty" />
    </el-form-item>
  </div>
</template>

<script setup lang="ts">
import type { DevState } from '../useDevState'
import { useNodeKindFlags } from '../composables/useNodeKindFlags'

const props = defineProps<{ state: DevState }>()

const flags = useNodeKindFlags(props.state)
</script>
