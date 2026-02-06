// shims-external.d.ts

// Lightweight module shims to satisfy typechecker for optional external libs
declare module '@form-create/element-ui' {
  const formCreate: any
  export default formCreate
  export type Rule = any
}

declare module 'vxe-table' {
  const VXETable: any
  export default VXETable
}

declare module '@vitejs/plugin-vue' {
  const pluginVue: any
  export default pluginVue
}

declare module '@syncfusion/ej2-vue-grids' {
  const ej2Grids: any
  export default ej2Grids
}



declare module 'element-plus/es/icons-vue' {
  const icons: any
  export const Loading: any
}
