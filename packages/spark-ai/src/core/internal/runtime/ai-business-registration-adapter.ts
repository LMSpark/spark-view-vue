import type {
  IBusinessRegistration,
  IBusinessRegistrationData,
  IBusinessRegistrationStoreSnapshot,
  AiModuleRegistration,
  AiModuleRegistrationData,
  AiModuleRegistrationStoreSnapshot,
} from '../../protocol/runtime-contracts'

/**
 * 兼容旧 Business 注册命名与新 Module 注册主路径的内部适配器。
 *
 * Core 公共 API 仍保留 IBusiness* 类型；运行时内部只消费 AiModuleRegistration。
 */
export class AiBusinessRegistrationAdapter {
  /** 识别 Business 源是否为运行时实例（有 getFunctions 方法）。 */
  isBusinessRegistrationInstance(source: unknown): source is IBusinessRegistration {
    return typeof (source as { readonly getFunctions?: unknown }).getFunctions === 'function'
  }

  /** 判断是否为 BusinessData 格式。 */
  isBusinessRegistrationDataFormat(source: unknown): source is IBusinessRegistrationData {
    return typeof source === 'object'
      && source !== null
      && !this.isBusinessRegistrationInstance(source)
      && typeof (source as { readonly businessId?: unknown }).businessId === 'string'
      && Array.isArray((source as { readonly functions?: unknown }).functions)
      && Array.isArray((source as { readonly modules?: unknown }).modules)
  }

  /** 判断是否为 BusinessStoreSnapshot 格式。 */
  isBusinessStoreSnapshotFormat(source: unknown): source is IBusinessRegistrationStoreSnapshot {
    return typeof source === 'object'
      && source !== null
      && typeof (source as { readonly rootBusinessPath?: unknown }).rootBusinessPath === 'string'
      && typeof (source as { readonly rootModulePath?: unknown }).rootModulePath === 'string'
      && Array.isArray((source as { readonly modules?: unknown }).modules)
      && Array.isArray((source as { readonly functions?: unknown }).functions)
  }

  /** Business 源转为 Module 源（识别类型后路由到具体转换）。 */
  moduleSourceFromBusiness(
    source: IBusinessRegistration | IBusinessRegistrationData | IBusinessRegistrationStoreSnapshot,
  ): AiModuleRegistration | AiModuleRegistrationData | AiModuleRegistrationStoreSnapshot {
    if (this.isBusinessRegistrationInstance(source)) return this.businessToModuleRegistration(source)
    if (this.isBusinessStoreSnapshotFormat(source)) {
      return {
        rootModulePath: source.rootModulePath,
        modules: source.modules,
        functions: source.functions,
        usageRules: source.usageRules,
        failureModes: source.failureModes,
      }
    }
    if (this.isBusinessRegistrationDataFormat(source)) return this.businessDataToModuleData(source)
    return this.businessToModuleRegistration(source)
  }

  /** Business 实例 -> Module 实例（重命名字段 businessId -> moduleId）。 */
  businessToModuleRegistration(business: IBusinessRegistration): AiModuleRegistration {
    return {
      moduleId: business.businessId,
      name: business.name,
      description: business.prompt,
      prompt: business.prompt,
      ...(business.modules === undefined ? {} : { modules: business.modules }),
      ...(business.instanceParam === undefined ? {} : { instanceParam: business.instanceParam }),
      getFunctions: () => business.functions,
    }
  }

  /** Module 实例 -> Business 实例（反向转换）。 */
  moduleToBusinessRegistration(module: AiModuleRegistration): IBusinessRegistration {
    return {
      moduleId: module.moduleId,
      businessId: module.moduleId,
      name: module.name,
      entity: {},
      prompt: typeof module.prompt === 'string' ? module.prompt : module.description,
      functions: module.getFunctions(),
      ...(module.modules === undefined ? {} : { modules: module.modules }),
      ...(module.instanceParam === undefined ? {} : { instanceParam: module.instanceParam }),
    }
  }

  /** BusinessData -> ModuleData（字段重命名）。 */
  businessDataToModuleData(data: IBusinessRegistrationData): AiModuleRegistrationData {
    return {
      moduleId: data.businessId,
      name: data.name,
      description: data.description,
      ...(data.prompt === undefined ? {} : { prompt: data.prompt }),
      ...(data.instanceParam === undefined ? {} : { instanceParam: data.instanceParam }),
      functions: data.functions,
      modules: data.modules,
    }
  }

  /** ModuleData -> BusinessData（字段重命名）。 */
  moduleDataToBusinessData(data: AiModuleRegistrationData): IBusinessRegistrationData {
    return {
      businessId: data.moduleId,
      name: data.name,
      description: data.description,
      ...(data.prompt === undefined ? {} : { prompt: data.prompt }),
      ...(data.instanceParam === undefined ? {} : { instanceParam: data.instanceParam }),
      functions: data.functions,
      modules: data.modules,
    }
  }

  /** Module 快照 -> Business 快照（新增 rootBusinessPath 字段）。 */
  moduleStoreToBusinessStoreSnapshot(snapshot: AiModuleRegistrationStoreSnapshot): IBusinessRegistrationStoreSnapshot {
    return {
      rootBusinessPath: snapshot.rootModulePath,
      ...snapshot,
    }
  }
}

export const aiBusinessRegistrationAdapter = new AiBusinessRegistrationAdapter()
