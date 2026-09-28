import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

/**
 * 显示设置 store。
 *
 * 持久化到 localStorage（不用 sessionStorage：这类偏好应该跨会话保留）。
 * 变更时立即应用：暗色模式切 class，字体大小改 CSS 变量。
 */
export const useSettingsStore = defineStore('settings', () => {
  const darkMode = ref(false)
  const showReasoning = ref(true)
  const fontSize = ref(14)
  const compactView = ref(false)

  /** 应用暗色模式。操作 DOM，所以只在浏览器环境跑。 */
  function applyDarkMode() {
    if (typeof document === 'undefined') return
    if (darkMode.value) {
      document.documentElement.classList.add('my-app-dark')
    } else {
      document.documentElement.classList.remove('my-app-dark')
    }
  }

  /** 应用字体大小。用 CSS 变量，让所有消息继承。 */
  function applyFontSize() {
    if (typeof document === 'undefined') return
    document.documentElement.style.setProperty('--message-font-size', `${fontSize.value}px`)
  }

  /** 初次加载配置。在 main.ts mount 之后调，避免 SSR 问题。 */
  function loadSettings() {
    try {
      const saved = localStorage.getItem('app-settings')
      if (saved) {
        const parsed = JSON.parse(saved)
        darkMode.value = parsed.darkMode ?? false
        showReasoning.value = parsed.showReasoning ?? true
        fontSize.value = parsed.fontSize ?? 14
        compactView.value = parsed.compactView ?? false
      }
    } catch (e) {
      console.warn('加载显示设置失败，使用默认值', e)
    }
    // 读完立即应用，否则刷新后第一帧会闪烁
    applyDarkMode()
    applyFontSize()
  }

  /** 保存到 localStorage。变更时自动调。 */
  function saveSettings() {
    try {
      localStorage.setItem('app-settings', JSON.stringify({
        darkMode: darkMode.value,
        showReasoning: showReasoning.value,
        fontSize: fontSize.value,
        compactView: compactView.value,
      }))
    } catch (e) {
      console.warn('保存显示设置失败', e)
    }
  }

  /** 切换暗色模式。 */
  function toggleDarkMode() {
    darkMode.value = !darkMode.value
  }

  // 任一设置变更时自动保存 + 应用
  watch([darkMode, showReasoning, fontSize, compactView], () => {
    saveSettings()
    applyDarkMode()
    applyFontSize()
  })

  return {
    darkMode,
    showReasoning,
    fontSize,
    compactView,
    toggleDarkMode,
    loadSettings,
  }
})
