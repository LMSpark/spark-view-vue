// Compatibility helper: some Vue types reference `NoInfer` helper type
// Provide a simple alias so TS won't fail during type-check.
declare type NoInfer<T> = T
