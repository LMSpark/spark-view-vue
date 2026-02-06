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

declare module '@syncfusion/ej2-vue-buttons' {
  const ej2Buttons: any
  export default ej2Buttons
}

declare module '@syncfusion/ej2-vue-dropdowns' {
  const ej2Dropdowns: any
  export default ej2Dropdowns
}

declare module '@syncfusion/ej2-vue-inputs' {
  const ej2Inputs: any
  export default ej2Inputs
}

declare module '@syncfusion/ej2-vue-navigations' {
  const ej2Navigations: any
  export default ej2Navigations
}

declare module '@syncfusion/ej2-vue-popups' {
  const ej2Popups: any
  export default ej2Popups
}

declare module '@syncfusion/ej2-vue-calendars' {
  const ej2Calendars: any
  export default ej2Calendars
}

declare module '@syncfusion/ej2-vue-lists' {
  const ej2Lists: any
  export default ej2Lists
}

declare module 'element-plus/es/icons-vue' {
  const icons: any
  export const Loading: any
}
