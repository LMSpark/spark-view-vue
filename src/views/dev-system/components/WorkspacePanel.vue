<template>
  <div class="workspace-panel">
    <OverviewDashboard v-if="workFocus.view === 'overview'" />
    <RequirementEditor
      v-else-if="workFocus.view === 'requirement'"
      :requirement-id="workFocus.requirementId"
    />
    <ModulePlanner v-else-if="workFocus.view === 'functions'" />
    <ModuleEditor
      v-else-if="workFocus.view === 'module'"
      :module-id="workFocus.moduleId"
    />
    <NavigationEditor v-else-if="workFocus.view === 'navigation'" />
    <PageDesigner
      v-else-if="workFocus.view === 'page-design'"
      :page-id="workFocus.pageId"
    />
    <VerificationPanel v-else-if="workFocus.view === 'verification'" />
  </div>
</template>

<script setup lang="ts">
import type { WorkFocus } from '../composables/types'
import OverviewDashboard from './OverviewDashboard.vue'
import RequirementEditor from './RequirementEditor.vue'
import ModulePlanner from './ModulePlanner.vue'
import ModuleEditor from './ModuleEditor.vue'
import NavigationEditor from './NavigationEditor.vue'
import PageDesigner from './PageDesigner.vue'
import VerificationPanel from './VerificationPanel.vue'

defineProps<{
  workFocus: WorkFocus
}>()
</script>

<style scoped>
.workspace-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: auto;
  padding: 16px 20px;
}
</style>
