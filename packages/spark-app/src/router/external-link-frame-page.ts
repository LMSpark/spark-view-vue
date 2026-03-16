import { computed, defineComponent, h } from 'vue'
import { useRoute } from 'vue-router'

const rootStyle: Record<string, string> = {
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  WebkitOverflowScrolling: 'touch',
}

const toolbarStyle: Record<string, string> = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 12px',
  borderBottom: '1px solid var(--el-border-color)',
  background: 'var(--el-fill-color-light)',
  flex: '0 0 auto',
}

const urlTextStyle: Record<string, string> = {
  flex: '1',
  minWidth: '0',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: 'var(--el-text-color-regular)',
  fontSize: '13px',
}

const openButtonStyle: Record<string, string> = {
  flex: '0 0 auto',
  border: '1px solid var(--el-border-color)',
  background: 'var(--el-bg-color)',
  color: 'var(--el-text-color-primary)',
  borderRadius: '6px',
  padding: '4px 10px',
  cursor: 'pointer',
  fontSize: '12px',
}

const frameWrapStyle: Record<string, string> = {
  flex: '1 1 auto',
  minHeight: '0',
  overflow: 'auto',
}

const frameStyle: Record<string, string> = {
  width: '100%',
  height: '100%',
  minHeight: '100%',
  display: 'block',
  border: '0',
  overflow: 'auto',
}

const emptyStyle: Record<string, string> = {
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--el-text-color-secondary)',
}

export const ExternalLinkFramePage = defineComponent({
  name: 'SparkExternalLinkFramePage',
  setup() {
    const route = useRoute()

    const sourceUrl = computed(() => {
      const metaUrl = route.meta['externalUrl']
      if (typeof metaUrl === 'string' && metaUrl.trim() !== '') return metaUrl.trim()

      const queryUrl = route.query['url']
      if (typeof queryUrl === 'string' && queryUrl.trim() !== '') return queryUrl.trim()

      return ''
    })

    function openInNewTab() {
      if (sourceUrl.value === '') return
      window.open(sourceUrl.value, '_blank', 'noopener,noreferrer')
    }

    return () => {
      if (sourceUrl.value === '') {
        return h('div', { style: emptyStyle }, '未配置超链接地址')
      }

      return h('div', { style: rootStyle }, [
        h('div', { style: toolbarStyle }, [
          h('span', { style: urlTextStyle, title: sourceUrl.value }, sourceUrl.value),
          h('button', { type: 'button', style: openButtonStyle, onClick: openInNewTab }, '新标签打开'),
        ]),
        h('div', { style: frameWrapStyle }, [
          h('iframe', {
            src: sourceUrl.value,
            style: frameStyle,
            loading: 'lazy',
            scrolling: 'auto',
          }),
        ]),
      ])
    }
  },
})
