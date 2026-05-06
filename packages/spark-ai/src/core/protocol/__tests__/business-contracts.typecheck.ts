import type {
  AiCoreExecuteFunctionCallOptions,
  IBusinessDefinition,
  IFunctionDefinition,
  IModule,
  ModuleRuntime,
} from '../business-contracts'

type StrictBusinessId = 'strictBusiness'
type OtherBusinessId = 'otherBusiness'
type FormModuleId = 'form'
type ReviewModuleId = 'review'
type SubmitFunctionId = 'submit'

interface StrictRuntime extends ModuleRuntime {
  ready: boolean
}

const submitFunction: IFunctionDefinition<unknown, { submitted: boolean }, StrictBusinessId, FormModuleId, SubmitFunctionId, StrictRuntime> = {
  functionId: 'submit',
  description: 'Submit the strict form.',
  paramsSchema: { type: 'object', properties: {} },
  execute(_args, context) {
    const action: 'strictBusiness@form@submit' = context.action
    const moduleId: FormModuleId = context.moduleId
    context.moduleRuntime.ready = true
    return { submitted: true, action, moduleId }
  },
}

const reviewFunction: IFunctionDefinition<unknown, unknown, StrictBusinessId, ReviewModuleId, SubmitFunctionId, StrictRuntime> = {
  functionId: 'submit',
  description: 'Submit the strict review.',
  paramsSchema: { type: 'object', properties: {} },
  execute() {
    return null
  },
}

const otherBusinessModule: IModule<ModuleRuntime, OtherBusinessId, FormModuleId> = {
  moduleId: 'form',
  name: 'Other form',
  description: 'Other business form module.',
  createRuntime: () => ({}),
  getPrompt: () => 'Other business prompt.',
  getInstance: () => null,
  getFunctions: () => [],
}

export const strictModule: IModule<StrictRuntime, StrictBusinessId, FormModuleId> = {
  moduleId: 'form',
  name: 'Strict form',
  description: 'Strict business form module.',
  createRuntime: () => ({ ready: false }),
  getPrompt: () => 'Strict business prompt.',
  getInstance: () => null,
  getFunctions: () => [submitFunction],
}

export const strictBusiness: IBusinessDefinition<StrictBusinessId> = {
  businessId: 'strictBusiness',
  name: 'Strict business',
  description: 'Strict business definition.',
  modules: [strictModule],
}

export const validActionOption: AiCoreExecuteFunctionCallOptions = {
  instanceId: 'instance-1',
  action: 'strictBusiness@form@submit',
  args: {},
}

export const invalidActionOption: AiCoreExecuteFunctionCallOptions = {
  instanceId: 'instance-1',
  // @ts-expect-error AiCore accepts only business@module@function action addresses.
  action: 'strictBusiness@form',
  args: {},
}

export const invalidModuleId: IModule<StrictRuntime, StrictBusinessId, FormModuleId> = {
  // @ts-expect-error A form module definition cannot advertise a review module id.
  moduleId: 'review',
  name: 'Strict form',
  description: 'Strict business form module.',
  createRuntime: () => ({ ready: false }),
  getPrompt: () => 'Strict business prompt.',
  getInstance: () => null,
  getFunctions: () => [submitFunction],
}

export const invalidFunctionList: ReadonlyArray<IFunctionDefinition<unknown, unknown, StrictBusinessId, FormModuleId>> = [
  // @ts-expect-error A review-module function cannot be exposed from a form module.
  reviewFunction,
]

export const invalidBusiness: IBusinessDefinition<StrictBusinessId> = {
  businessId: 'strictBusiness',
  name: 'Strict business',
  description: 'Strict business definition.',
  modules: [
    // @ts-expect-error A strictBusiness definition cannot register an otherBusiness module.
    otherBusinessModule,
  ],
}
