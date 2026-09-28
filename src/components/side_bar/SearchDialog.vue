<script setup lang="ts">
/**
 * 历史对话搜索面板。
 *
 * 搜索范围是当前用户的会话标题 + 历史消息正文，由后端
 * GET /api/conversations/search 提供（见 ConversationController.search）。
 * 前端不做本地过滤 —— 侧栏的 conversation_id_list 只有标题，
 * 拿它过滤等于「只能按标题搜」，而标题是模型生成的一句摘要。
 */
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import Dialog from 'primevue/dialog'
import router from '@/router'
import http from '@/api/http'
import { useConversationStore } from '@/stores/conversation_store.ts'
import type { ConversationSearchItem } from '@/interface/search-interface.ts'

const visible = defineModel<boolean>('visible', { default: false })

const conversationStore = useConversationStore()

const keyword = ref('')
const results = ref<ConversationSearchItem[]>([])
const loading = ref(false)
const errored = ref(false)
/** 键盘导航的高亮项下标。-1 表示没有任何项被高亮。 */
const activeIndex = ref(-1)

const inputRef = useTemplateRef<HTMLInputElement>('inputRef')
const listRef = useTemplateRef<HTMLDivElement>('listRef')

/** 防抖定时器。输入每变一次就重排一次，只有最后一次会真的发请求。 */
let debounceTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 上一次请求的中止器。
 *
 * 没有它就会有竞态：输入「你好」时先发出「你」的请求，两个请求的返回顺序
 * 不保证 —— 「你」后到就会把「你好」的结果覆盖掉，表现为「结果和输入框里
 * 的词对不上」。这种 bug 只在网络抖动时出现，本地开发几乎复现不出来。
 */
let inflight: AbortController | null = null

const trimmed = computed(() => keyword.value.trim())

/** 已经输入了词、请求也回来了、但没有任何结果。三个条件都要，否则空状态会在加载中闪一下。 */
const isEmpty = computed(
  () => !loading.value && !errored.value && trimmed.value.length > 0 && results.value.length === 0,
)

async function runSearch() {
  const q = trimmed.value

  // 清空输入时把结果也清掉，否则面板里留着上一次的结果，
  // 看起来像是「空词匹配了所有会话」
  if (!q) {
    inflight?.abort()
    inflight = null
    results.value = []
    loading.value = false
    errored.value = false
    activeIndex.value = -1
    return
  }

  inflight?.abort()
  const controller = new AbortController()
  inflight = controller

  loading.value = true
  errored.value = false

  try {
    const res = await http.get<ConversationSearchItem[]>('/api/conversations/search', {
      params: { q, limit: 20 },
      signal: controller.signal,
    })

    // 这次请求已经被后来的输入取代，结果作废。
    // abort() 通常会让上面直接抛出，但请求已经返回、只是还没走到这里时不会
    if (inflight !== controller) return

    results.value = Array.isArray(res.data) ? res.data : []
    // 有结果就默认高亮第一项，回车可以直接进去
    activeIndex.value = results.value.length > 0 ? 0 : -1
  } catch (error: any) {
    if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError') return
    if (inflight !== controller) return
    console.error('搜索失败:', error)
    errored.value = true
    results.value = []
    activeIndex.value = -1
  } finally {
    if (inflight === controller) {
      loading.value = false
      inflight = null
    }
  }
}

watch(keyword, () => {
  if (debounceTimer) clearTimeout(debounceTimer)
  // 250ms：比一般的打字间隔长，又短到松手就能看到结果
  debounceTimer = setTimeout(runSearch, 250)
})

/** 打开时聚焦输入框并清空上一次的状态。 */
watch(visible, async (open) => {
  if (!open) {
    if (debounceTimer) clearTimeout(debounceTimer)
    inflight?.abort()
    inflight = null
    return
  }
  keyword.value = ''
  results.value = []
  errored.value = false
  activeIndex.value = -1
  await nextTick()
  inputRef.value?.focus()
})

/**
 * 跳到某个会话。
 *
 * 走 conversationStore.selectedItem 而不是直接 router.replace：
 * HistoryListBox 用它做 Listbox 的选中值，直接跳路由的话侧栏里
 * 那个会话不会高亮。store 里的 watch 会负责跳路由。
 */
function openConversation(item: ConversationSearchItem) {
  conversationStore.selectedItem = item.conversation_id
  visible.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (results.value.length === 0) return

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeIndex.value = (activeIndex.value + 1) % results.value.length
    scrollActiveIntoView()
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value =
      activeIndex.value <= 0 ? results.value.length - 1 : activeIndex.value - 1
    scrollActiveIntoView()
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const item = results.value[activeIndex.value]
    if (item) openConversation(item)
  }
}

/** 键盘移动高亮时把它滚进可视区，否则按到第十项就看不见了。 */
function scrollActiveIntoView() {
  nextTick(() => {
    listRef.value
      ?.querySelectorAll('[data-result-item]')
      ?.[activeIndex.value]
      ?.scrollIntoView({ block: 'nearest' })
  })
}

/**
 * 把片段里的关键词包成 <mark>。
 *
 * 必须先转义再插标签：片段是用户与模型的原文，里面完全可能有 `<script>`
 * 这样的内容，直接丢进 v-html 就是一个 XSS。转义之后再插入我们自己生成的
 * <mark>，插入点是转义结果里搜出来的，不可能落在标签内部。
 */
function highlight(text: string | null): string {
  if (!text) return ''
  const escaped = escapeHtml(text)
  const q = trimmed.value
  if (!q) return escaped

  const pattern = new RegExp(escapeRegExp(escapeHtml(q)), 'gi')
  return escaped.replace(
    pattern,
    (match) => `<mark class="bg-yellow-200 text-inherit rounded px-0.5">${match}</mark>`,
  )
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 关键词里的正则元字符要按字面量处理，否则搜 `a.b` 会匹配到 `axb`。 */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function roleLabel(role: ConversationSearchItem['matched_role']): string {
  if (role === 'HumanMessage') return '你'
  if (role === 'AiMessage') return 'AI'
  return '标题'
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    dismissable-mask
    :draggable="false"
    header="搜索对话"
    class="w-[92vw] max-w-[40rem]"
    :pt="{
      root: { class: 'rounded-2xl' },
      content: { class: 'pb-3' },
    }"
  >
    <div class="flex flex-col gap-3">
      <div class="flex flex-row items-center gap-2 border border-surface-300 rounded-xl px-3 h-11
                  focus-within:border-surface-400 dark:border-surface-600">
        <i class="pi pi-search text-[0.95rem]! text-gray-400"></i>
        <input
          ref="inputRef"
          v-model="keyword"
          type="text"
          placeholder="搜索历史对话的标题和内容"
          aria-label="搜索历史对话"
          class="flex-1 h-full bg-transparent outline-none text-[0.95rem]"
          @keydown="onKeydown"
        />
        <i v-if="loading" class="pi pi-spinner pi-spin text-[0.9rem]! text-gray-400"></i>
        <i
          v-else-if="keyword"
          class="pi pi-times text-[0.8rem]! text-gray-400 cursor-pointer hover:text-gray-600"
          role="button"
          aria-label="清空"
          @click="keyword = ''"
        ></i>
      </div>

      <div ref="listRef" class="max-h-[26rem] overflow-y-auto flex flex-col gap-1">
        <p v-if="errored" class="text-center text-[0.9rem] text-red-500 py-6">
          搜索失败，请稍后重试
        </p>
        <p v-else-if="isEmpty" class="text-center text-[0.9rem] text-gray-400 py-6">
          没有找到包含「{{ trimmed }}」的对话
        </p>
        <p v-else-if="!trimmed" class="text-center text-[0.9rem] text-gray-400 py-6">
          输入关键词开始搜索
        </p>

        <div
          v-for="(item, index) in results"
          :key="item.conversation_id"
          data-result-item
          :class="index === activeIndex ? 'bg-gray-200 dark:bg-surface-700' : 'hover:bg-gray-100 dark:hover:bg-surface-800'"
          class="flex flex-col gap-1 px-3 py-2 rounded-xl cursor-pointer"
          @click="openConversation(item)"
          @mouseenter="activeIndex = index"
        >
          <div class="flex flex-row items-center gap-2 min-w-0">
            <i class="pi pi-comment text-[0.8rem]! text-gray-400 shrink-0"></i>
            <span class="truncate text-[0.92rem] font-medium">
              {{ item.summary_content || '未命名对话' }}
            </span>
            <span
              v-if="item.match_count > 1"
              class="ml-auto shrink-0 text-[0.75rem] text-gray-400"
            >
              {{ item.match_count }} 处匹配
            </span>
          </div>
          <div v-if="item.snippet" class="flex flex-row gap-2 min-w-0 pl-5">
            <span class="shrink-0 text-[0.75rem] text-gray-400 pt-0.5">
              {{ roleLabel(item.matched_role) }}
            </span>
            <!-- eslint-disable-next-line vue/no-v-html -- highlight() 已转义，见其注释 -->
            <span class="truncate text-[0.82rem] text-gray-500" v-html="highlight(item.snippet)"></span>
          </div>
        </div>
      </div>
    </div>
  </Dialog>
</template>
