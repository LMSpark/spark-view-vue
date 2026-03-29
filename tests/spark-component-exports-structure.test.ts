import { describe, expect, it } from 'vitest'
import {
  containerComposables,
  containerDataComponents,
  containerNonDataComponents,
  fieldDataComponents,
  fieldNonDataComponents,
  containerDataComponentComposables,
  containerNonDataComponentComposables,
  fieldDataComponentComposables,
  fieldNonDataComponentComposables,
  containerDataComponentSupport,
  fieldDataComponentSupport,
} from '../packages/spark-component/src/index'

function sortedKeys(record: object): string[] {
  return Object.keys(record).sort((left, right) => left.localeCompare(right))
}

describe('spark-component export structure', () => {
  it('exposes stable grouped component namespaces', () => {
    expect({
      containerDataComponents: sortedKeys(containerDataComponents),
      containerNonDataComponents: sortedKeys(containerNonDataComponents),
      fieldDataComponents: sortedKeys(fieldDataComponents),
      fieldNonDataComponents: sortedKeys(fieldNonDataComponents),
    }).toMatchInlineSnapshot(`
      {
        "containerDataComponents": [
          "RendererDataScope",
          "RendererDetail",
          "RendererFieldScope",
          "RendererForm",
          "RendererList",
          "RendererListItemScope",
          "RendererTable",
          "RendererTree",
        ],
        "containerNonDataComponents": [
          "RendererCollapse",
          "RendererCollapseItem",
          "RendererDialog",
          "RendererDrawer",
          "RendererSection",
          "RendererStepItem",
          "RendererSteps",
          "RendererTabPane",
          "RendererTabs",
          "RendererToolbar",
        ],
        "fieldDataComponents": [
          "FieldCascader",
          "FieldCheckbox",
          "FieldCheckboxGroup",
          "FieldColor",
          "FieldDate",
          "FieldDeptPicker",
          "FieldEntityPicker",
          "FieldFileBrowser",
          "FieldFilePath",
          "FieldHtmlEditor",
          "FieldIcon",
          "FieldImage",
          "FieldMultiSelect",
          "FieldNumber",
          "FieldProductPicker",
          "FieldRadio",
          "FieldRate",
          "FieldSelect",
          "FieldSlider",
          "FieldSwitch",
          "FieldText",
          "FieldTextarea",
          "FieldTransfer",
          "FieldTreeSelect",
          "FieldUpload",
          "FieldUserPicker",
        ],
        "fieldNonDataComponents": [
          "FieldColumnGroup",
          "FieldContextRenderer",
          "FieldTreeNodeSummary",
        ],
      }
    `)
  })

  it('exposes stable grouped composable and support namespaces', () => {
    expect({
      containerDataComponentComposables: sortedKeys(containerDataComponentComposables),
      containerNonDataComponentComposables: sortedKeys(containerNonDataComponentComposables),
      fieldDataComponentComposables: sortedKeys(fieldDataComponentComposables),
      fieldNonDataComponentComposables: sortedKeys(fieldNonDataComponentComposables),
      containerDataComponentSupport: sortedKeys(containerDataComponentSupport),
      fieldDataComponentSupport: sortedKeys(fieldDataComponentSupport),
    }).toMatchInlineSnapshot(`
      {
        "containerDataComponentComposables": [
          "useContainerActions",
          "useContainerContextData",
          "useContainerDataSource",
          "useContainerDataSourceEffects",
          "useContainerSlots",
          "useContainerToolbar",
          "useDataScope",
          "useFormDetailContainer",
          "useModuleContext",
          "useTableFilters",
        ],
        "containerDataComponentSupport": [
          "createBuiltinActionHandler",
          "createCurrentRowSlotScope",
          "createRowActionSlotScope",
          "createToolbarSlotScope",
          "getBuiltinActionLabel",
          "getBuiltinButtonClass",
          "getBuiltinButtonLink",
          "getBuiltinButtonPlain",
          "getBuiltinButtonSize",
          "getBuiltinButtonText",
          "getBuiltinButtonType",
          "getSelectedRows",
          "isActionDisplayed",
          "isBuiltinAction",
          "isBuiltinActionDisabled",
          "isModelActionAllowed",
          "isRowActionAllowed",
        ],
        "containerNonDataComponentComposables": [
          "normalizeGridGap",
          "normalizeSpan",
          "useCompositeItemGrid",
          "useContainerGrid",
          "useContainerToolbar",
        ],
        "fieldDataComponentComposables": [
          "useControlledFieldChange",
          "useFieldActionMode",
          "useFieldContext",
          "useFieldOptions",
          "useFieldPermission",
          "useFileFieldActions",
          "useOptionField",
          "useSelectorFieldActions",
        ],
        "fieldDataComponentSupport": [
          "columnToFormRules",
          "createPickerPreset",
          "toElFormRules",
        ],
        "fieldNonDataComponentComposables": [
          "useResolvedFieldContext",
        ],
      }
    `)
  })

  it('exposes event support utilities from containerComposables', () => {
    expect(Object.keys(containerComposables)).toEqual(expect.arrayContaining([
      'useEventDefaults',
      'runControlledInteraction',
      'createInteractionControl',
      'createCancelledCrudResult',
    ]))
  })
})