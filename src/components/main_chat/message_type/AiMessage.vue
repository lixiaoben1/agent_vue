<script setup lang="ts">
// import { MarkdownCodeBlockNode, setCustomComponents} from 'markstream-vue'
// setCustomComponents({ code_block: MarkdownCodeBlockNode})
import 'markstream-vue/index.css'
import MarkdownRender from 'markstream-vue'
import { computed, onMounted, onUnmounted, ref, watch } from "vue"

const isOpen = ref(false)
const isStreaming = computed(() => props.status === 'streaming')

const props = defineProps<{
  content: string
  reasoning?: string
  status?: 'streaming' | 'complete' | 'error'
  isLast?: boolean
}>()

const contentText = computed(() => props.content || '')
const reasoningText = computed(() => {
  if (!props.reasoning) return ''
  // 仅处理引用块格式，不包含 content
  // console.log(props.reasoning)
  return props.reasoning
})

watch(
    () => props.status,
    (newStatus) => {
      if (newStatus === 'streaming') {
        isOpen.value = true
      } else if (newStatus === 'complete' || newStatus === 'error') {
        isOpen.value = false
      }
    },
    { immediate: true } // 组件挂载时也根据初始 status 设置正确状态
)

</script>

<template>
    <div class="flex flex-col justify-between py-2 text-black">
      <details :open="isOpen" class="group/reasoning">
        <summary class="cursor-pointer select-none text-sm text-gray-500 hover:text-gray-700 transition-colors list-none flex items-center gap-1">
          <i class="pi pi-chevron-right transition-transform duration-200 group-open/reasoning:rotate-90 text-sm"></i>
          查看思考过程...
        </summary>
        <div class="pl-2 border-l-2 border-gray-200 text-gray-500">
          <MarkdownRender
              custom-id="reasoning"
              :content="reasoningText"
              :final="!isStreaming"
              :smooth-streaming="isStreaming ? 'auto' : false"
              :fade="!isStreaming"
              :typewriter="isStreaming"
              :max-live-nodes="isStreaming ? 0 : undefined"
          />
        </div>
      </details>
      <div>
        <MarkdownRender
            custom-id="chat"
            :content="contentText"
            :final="!isStreaming"
            :smooth-streaming="isStreaming ? 'auto' : false"
            :fade="!isStreaming"
            :typewriter="isStreaming"
            :max-live-nodes="isStreaming ? 0 : undefined"
        />
      </div>

      <div v-show="!isStreaming" class="h-7 flex justify-start mt-2  ">
        <div class="flex justify-center items-center h-7 w-7  hover:bg-gray-200 rounded-lg">
          <i class="pi pi-clone text-gray-500 text-sm"></i>
        </div>
        <div class="flex justify-center items-center h-7 w-7  hover:bg-gray-200 rounded-lg ">
          <i class="pi pi-thumbs-up text-gray-500 text-sm"></i>
        </div>
        <div class="flex justify-center items-center h-7 w-7  hover:bg-gray-200 rounded-lg">
          <i class="pi pi-thumbs-down text-gray-500 text-sm"></i>
        </div>
        <div class="flex justify-center items-center h-7 w-7  hover:bg-gray-200 rounded-lg">
          <i class="pi pi-share-alt text-gray-500 text-sm"></i>
        </div>
        <div class="flex justify-center items-center h-7 w-7  hover:bg-gray-200 rounded-lg">
          <i class="pi pi-sync text-gray-500 text-sm"></i>
        </div>
        <div class="flex justify-center items-center h-7 w-7  hover:bg-gray-200 rounded-lg">
          <i class="pi pi-ellipsis-h text-gray-500 text-sm"></i>
        </div>
      </div>
    </div>
  <div v-show="isLast" class="h-30"></div>

</template>

<style scoped>

</style>