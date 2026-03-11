import { ref, computed, watch } from 'vue'

// ── Color utilities ──

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

function rgbToHex(r: number, g: number, b: number): string {
  const hex = [r, g, b]
    .map(v =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
  return `#${hex}`
}

/** Mix two hex colors: weight=1 → all c1, weight=0 → all c2 */
function mixColor(c1: string, c2: string, weight: number): string {
  const [r1, g1, b1] = hexToRgb(c1)
  const [r2, g2, b2] = hexToRgb(c2)
  return rgbToHex(
    r1 * weight + r2 * (1 - weight),
    g1 * weight + g2 * (1 - weight),
    b1 * weight + b2 * (1 - weight),
  )
}

// ── Preset definitions ──

export interface PrimaryPreset {
  name: string
  color: string
}

export interface NavColorSet {
  headerBg: string
  sidebarBg: string
  textColor: string
}

export interface NavPreset {
  name: string
  color: string
  light: NavColorSet
  dark: NavColorSet
}

export const PRIMARY_PRESETS: readonly PrimaryPreset[] = [
  { name: '默认蓝', color: '#409eff' },
  { name: '极光紫', color: '#722ed1' },
  { name: '翡翠绿', color: '#52c41a' },
  { name: '中国红', color: '#f5222d' },
  { name: '日落橙', color: '#fa8c16' },
  { name: '青碧', color: '#13c2c2' },
  { name: '品红', color: '#eb2f96' },
]

export const NAV_PRESETS: readonly NavPreset[] = [
  {
    name: '经典蓝',
    color: '#001529',
    light: { headerBg: '#001529', sidebarBg: '#001529', textColor: '#ffffffd9' },
    dark: { headerBg: '#001529', sidebarBg: '#001529', textColor: '#ffffffd9' },
  },
  {
    name: '雅致灰',
    color: '#304156',
    light: { headerBg: '#304156', sidebarBg: '#304156', textColor: '#ffffffd9' },
    dark: { headerBg: '#263445', sidebarBg: '#263445', textColor: '#e5eaf3d9' },
  },
  {
    name: '海洋蓝',
    color: '#003a75',
    light: { headerBg: '#003a75', sidebarBg: '#003a75', textColor: '#ffffffd9' },
    dark: { headerBg: '#002a55', sidebarBg: '#002a55', textColor: '#e5eaf3d9' },
  },
  {
    name: '幽紫',
    color: '#2f1e4e',
    light: { headerBg: '#2f1e4e', sidebarBg: '#2f1e4e', textColor: '#ffffffd9' },
    dark: { headerBg: '#231740', sidebarBg: '#231740', textColor: '#e5eaf3d9' },
  },
  {
    name: '纯白',
    color: '#ffffff',
    light: { headerBg: '#ffffff', sidebarBg: '#ffffff', textColor: '#303133' },
    dark: { headerBg: '#1d1d1d', sidebarBg: '#1d1d1d', textColor: '#e5eaf3d9' },
  },
]

// ── Singleton state ──

const STORAGE_KEY = 'spark-color-scheme'

interface SchemeState {
  primaryColor: string
  navIndex: number
}

function loadState(): SchemeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SchemeState>
      return {
        primaryColor: typeof parsed.primaryColor === 'string' ? parsed.primaryColor : '#409eff',
        navIndex: typeof parsed.navIndex === 'number' ? parsed.navIndex : 0,
      }
    }
  } catch {
    // ignore
  }
  return { primaryColor: '#409eff', navIndex: 0 }
}

const FALLBACK_NAV: NavPreset = {
  name: '经典蓝',
  color: '#001529',
  light: { headerBg: '#001529', sidebarBg: '#001529', textColor: '#ffffffd9' },
  dark: { headerBg: '#001529', sidebarBg: '#001529', textColor: '#ffffffd9' },
}

const _state = ref<SchemeState>(loadState())
let _initialized = false

// ── Apply helpers ──

function applyPrimaryColor(color: string, isDark: boolean) {
  const el = document.documentElement
  const mixBase = isDark ? '#141414' : '#ffffff'

  el.style.setProperty('--el-color-primary', color)
  for (const level of [3, 5, 7, 8, 9]) {
    el.style.setProperty(
      `--el-color-primary-light-${level}`,
      mixColor(color, mixBase, 1 - level / 10),
    )
  }
  el.style.setProperty('--el-color-primary-dark-2', mixColor(color, '#000000', 0.8))
}

function applyNavColors(preset: NavPreset, isDark: boolean) {
  const el = document.documentElement
  const colors = isDark ? preset.dark : preset.light
  el.style.setProperty('--spark-header-bg', colors.headerBg)
  el.style.setProperty('--spark-header-text', colors.textColor)
  el.style.setProperty('--spark-sidebar-bg', colors.sidebarBg)
  el.style.setProperty('--spark-sidebar-text', colors.textColor)
}

function getIsDark(): boolean {
  return document.documentElement.classList.contains('dark')
}

function applyAll() {
  const isDark = getIsDark()
  applyPrimaryColor(_state.value.primaryColor, isDark)
  applyNavColors(NAV_PRESETS[_state.value.navIndex] ?? FALLBACK_NAV, isDark)
}

// ── Composable ──

export function useColorScheme() {
  if (!_initialized) {
    _initialized = true
    const isDark = ref(getIsDark())
    const observer = new MutationObserver(() => {
      isDark.value = getIsDark()
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    watch(isDark, () => applyAll())
    applyAll()
  }

  function setPrimaryColor(color: string) {
    _state.value = { ..._state.value, primaryColor: color }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_state.value))
    applyPrimaryColor(color, getIsDark())
  }

  function setNavPreset(index: number) {
    _state.value = { ..._state.value, navIndex: index }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_state.value))
    applyNavColors(NAV_PRESETS[index] ?? FALLBACK_NAV, getIsDark())
  }

  return {
    primaryColor: computed(() => _state.value.primaryColor),
    navPresetIndex: computed(() => _state.value.navIndex),
    currentNavPreset: computed((): NavPreset => NAV_PRESETS[_state.value.navIndex] ?? FALLBACK_NAV),
    setPrimaryColor,
    setNavPreset,
  }
}
