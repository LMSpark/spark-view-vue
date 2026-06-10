/**
 * VCM 原生 class 生命周期契约（类型说明，非强制 interface）。
 *
 * 编译器在 vite-plugin-spark-catalog 中审计；详见 docs/ai/VCM_NATIVE_CLASS_SPEC.md。
 */

/** 可 JSON 持久化的 metadata 形状由各领域定义（如 DataSetMetadata、TableMetadata）。 */
export type VcmNativeJsonMetadata = Readonly<Record<string, unknown>>

/**
 * 快照模型：必须实现实例 toJson，将当前状态导出为 metadata。
 * 参考：DataSetCrudTool.toJson、DataTable.toJson、DataView.toJson。
 */
export type VcmNativeSnapshotClass<TMetadata extends VcmNativeJsonMetadata = VcmNativeJsonMetadata> = Readonly<{
  toJson(): TMetadata
}>

/**
 * 快照工厂：从 metadata / JSON 字符串恢复实例。
 * 允许命名：fromJson | fromDataSet | reconcileFromJson | fromRuleJson（树）。
 */
export type VcmNativeSnapshotFactory<T, TMetadata extends VcmNativeJsonMetadata = VcmNativeJsonMetadata> = Readonly<{
  fromJson(json: TMetadata | Record<string, unknown> | string): T
}>

/**
 * 会话模型（project / config-page）：不导出整包 JSON；
 * 在 class JSDoc 标注 @vcmSession，编译器跳过 toJson/fromJson 门禁。
 */
export type VcmNativeSessionClass = Readonly<{
  /** 会话入口由公开 action 或构造器提供，无统一 toJson。 */
}>

/**
 * 树模型（node-tree）：经文件 API 持久化、无实例 toJson 时，
 * 在 class JSDoc 标注 @vcmFilePersisted 说明路径（如 rule.json + getFileText）。
 */
export type VcmNativeFilePersistedTreeClass = Readonly<{
  /** 恢复工厂：fromJson | fromRuleJson；持久化由 config-page 文件 action 承担。 */
}>
