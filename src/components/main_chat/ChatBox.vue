<script setup lang="ts">
import Textarea from 'primevue/textarea';
import { ref, watch, nextTick, onMounted, onBeforeUnmount, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {streamChat} from "@/api/chat.ts";
import axios from "axios";
import {useChatStore} from "@/stores/chat_store.ts";
import {useUserStore} from "@/stores/user_store.ts";
import {useVerifyStore} from "@/stores/verify.ts";
import UploadFile from "@/components/main_chat/UploadFile.vue";

const userStore = useUserStore()
const route = useRoute()
const router = useRouter()
const store = useChatStore()
const verifyStore = useVerifyStore()
const input = ref('')

//需要创建对话时候生成uuid，之后只允许读取url的uuid

async function sendMessage() {
  const content = input.value.trim()
  if (!content) return
  input.value = ''
  //实现身份校验必须
  if (!verifyStore.isVerified) {
    verifyStore.requireVerify()
    console.log("未认证，需要认证才能发起聊天")
    return
  }
  let conversationId = route.params.uuid as string
  if (!conversationId) {
    userStore.appendNewConversation({conversation_id:conversationId,summary_content: content})
  }
  if (!route.params.uuid) {
    conversationId = crypto.randomUUID()
    console.log("uuid—conversation id不存在正在创建", conversationId)
    await router.replace({
      name: 'Chat',
      params: {uuid: conversationId}
    })
  }
  console.log("uuid—conversation id已经获取到，正在发送消息", conversationId,route.params.uuid)

  store.addHumanMessage(
      conversationId,
      content
  )

  store.createAiPlaceholder(
      conversationId)
  try {
    await streamChat(
        conversationId,
        content,
        (chunk) => {
          store.appendAiChunk(
              conversationId,
              chunk
          )},
        () => {
          store.finishAiMessage(
              conversationId
          )},
        () => {
          store.failAiMessage(
              conversationId
          )}
    )
  } catch {
    store.failAiMessage(
        conversationId
    )}
}
const childRef = ref()

const handleToggle = (event:PointerEvent) => {
  // 直接调用子组件暴露的方法
  childRef.value.toggle(event)
}



</script>

<template>

    <div class="ml-5 mr-7.5 w-full max-w-3xl liquid-glass flex items-center justify-between">
      <div @click="handleToggle" class="m-2 shrink-0 flex flex-row self-end items-center justify-center rounded-full w-10 h-10 hover:bg-[#aaaaaa] active:bg-[#aaaaaa] cursor-pointer">
        <i class="text-[1.3rem]! pi pi-plus"></i>
        <UploadFile ref="childRef"></UploadFile>
      </div>
      <div class="min-w-0  w-full">
          <Textarea @keydown.enter.exact.prevent="sendMessage" ref="textareaRef" autoResize rows="1" class="bg-transparent border border-transparent shadow-none
          p-0 pb-2 pt-2 w-full text-xl max-h-50 overflow-y-auto scrollbar-none" v-model="input" placeholder="有问题，尽管问"  />
      </div>
      <div class="flex flex-row self-end">
        <div class="m-2 flex flex-row items-center justify-center rounded-full w-10 h-10 hover:bg-[#aaaaaa] active:bg-[#aaaaaa] cursor-pointer">
          <i class="text-[1.3rem]! pi pi-microphone"></i>
        </div>
        <div @click="sendMessage" class="m-2 flex flex-row items-center justify-center rounded-full w-10 h-10 bg-blue-500 hover:bg-[#5555ee] active:bg-[#5555ee] cursor-pointer">
          <i class="text-[1.3rem]! pi pi-sparkles text-gray-200"></i>
        </div>
      </div>

    </div>
</template>

<style scoped>

.liquid-glass {
  position: relative;
  overflow: hidden;
  background: var(--lg-bg);
  border: 1px solid var(--lg-border);
  backdrop-filter: blur(18px) saturate(1.2);
  -webkit-backdrop-filter: blur(18px) saturate(1.2);
  box-shadow:
      0 5px 10px rgba(0, 0, 0, 0.1),
      inset -10px -1px 1px rgba(255, 255, 255, 0.55);
  border-radius: 30px; /* Added base border radius */
  transition: transform 0.3s cubic-bezier(0.34, 2, 0.64, 1), background 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@media (hover: hover) and (pointer: fine)  {
.liquid-glass:hover {
  background: rgba(255, 255, 255, 0.6);
  transform: scale(1.02);
}}
@media (hover: none) {
  .liquid-glass:active {
    background: rgba(255, 255, 255, 0.6);
    transform: scale(1.02);
  }
}

</style>