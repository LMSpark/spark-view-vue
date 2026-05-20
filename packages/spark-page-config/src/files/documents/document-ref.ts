export type PageFileDocumentListener = () => void

export class PageConfigValueRef<T> {
  private current: T

  private readonly onChange: PageFileDocumentListener | undefined

  constructor(initialValue: T, onChange?: PageFileDocumentListener) {
    this.current = initialValue
    this.onChange = onChange
  }

  get value(): T {
    return this.current
  }

  set value(next: T) {
    if (Object.is(this.current, next)) return
    this.current = next
    this.onChange?.()
  }
}

export class PageConfigComputedValue<T> {
  private readonly getter: () => T

  constructor(getter: () => T) {
    this.getter = getter
  }

  get value(): T {
    return this.getter()
  }
}

export class PageConfigDocumentChangeNotifier {
  readonly revision = new PageConfigValueRef(0)

  private readonly listeners = new Set<PageFileDocumentListener>()

  readonly notify = (): void => {
    this.revision.value += 1
    for (const listener of this.listeners) {
      listener()
    }
  }

  subscribe(listener: PageFileDocumentListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}
