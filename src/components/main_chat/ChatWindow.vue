<script setup lang="ts">
import { VList } from "virtua/vue";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import HumanMessage from "@/components/main_chat/message_type/HumanMessage.vue";
import AiMessage from "@/components/main_chat/message_type/AiMessage.vue";
import {useChatStore} from "@/stores/chat_store.ts";
import {useRoute} from "vue-router";
import {useThrottleFn} from "@/tools/throttleFn.ts";


const route = useRoute()


const chatStore = useChatStore()

const currentConversationId = computed(() => { const id = route.params.uuid
  // console.log("聊天对话窗口监视到conversation id发生变化，获取到全新的id：", id)
  // 防御性处理：如果意外拿到数组，取第一个元素
  return (Array.isArray(id) ? id[0] : id) || ''})

const messages = computed(() => {
  // console.log("store数据变化, 准备更新聊天对话记录")
  return (chatStore.messages[currentConversationId.value] ?? [])
})
//监听uuid变化，读取历史记录从本地或者indexedDB
watch(
    currentConversationId,
    async (newId) => {
      if (!newId) return //
      await chatStore.loadHistory(newId)
      scrollToBottom()
    },
    { immediate: true }
)

const listRef = ref<any>()
const autoScroll = ref(true)

const isAtBottom = defineModel('isAtBottom')




const onScrollEnd = () => {
  const list = listRef.value
  if (!list) return
  const distance = list.scrollSize - list.scrollOffset - list.viewportSize

  isAtBottom.value = distance <= 120;


}

function scrollToBottom() {
  const list = listRef.value
  if (!list) return
  const lastIndex = messages.value.length - 1
  if (lastIndex < 0) return
  list.scrollToIndex(lastIndex, { align: 'end',
    // smooth: true
  })
}

function streamScrollToBottom() {
  const list = listRef.value
  if (!list) return

  list.scrollTo(list.scrollSize, { align: 'end',
    // smooth: true
  })
}

const debouncedScroll = useThrottleFn(streamScrollToBottom, 200)

// 滚动事件
watch(messages, () => {
      if (!autoScroll.value) return
      debouncedScroll()
    },
    { deep: true }
)
defineExpose({ scrollToBottom })
</script>

<template>
  <VList
      ref="listRef"
      :data="messages"
      class="h-full w-full scrollbar-none"
      :overscan="8"
      @scroll="onScrollEnd"
  >
    <template #default="{ item, index }">
      <div :key="item.id">
        <HumanMessage
            v-if="item.role === 'HumanMessage'"
            :content="item.content"
            :is-first="index === 0"
        />
        <AiMessage
            v-else
            :content="item.content"
            :reasoning="item.reasoning"
            :status="item.status"
            :is-last="index === messages.length - 1"
        />
      </div>
    </template>
  </VList>
</template>

<style scoped>
/*:deep(.vue-recycle-scroller__item-wrapper){*/
/*  display: flex !important;*/
/*  flex-direction: row !important;*/
/*  width: 100vw !important;*/
/*  background-color: #0b1018 !important;*/
/*}*/
</style>