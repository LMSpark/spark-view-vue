<template>
  <div v-if="flags.isDirectoryNode.value">
    <el-divider content-position="left">布局配置</el-divider>
    <el-form-item label="子项布局" class="fi fi--wide">
      <el-radio-group v-model="state.editForm.childPlacement" @change="state.markNavDirty">
        <el-radio-button
          v-for="option in CHILD_PLACEMENT_OPTIONS"
          :key="option.value || '__default__'"
          :value="option.value"
        >
          {{ option.label }}
        </el-radio-button>
      </el-radio-group>
    </el-form-item>
  </div>
</template>

<script setup lang="ts">
import type { DevState } from '../useDevState'
import { useNodeKindFlags } from '../composables/useNodeKindFlags'
import { CHILD_PLACEMENT_OPTIONS } from '../childPlacementLabels'

const props = defineProps<{ state: DevState }>()

const flags = useNodeKindFlags(props.state)
</script>
