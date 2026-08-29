<script setup lang="ts">
import Textarea from 'primevue/textarea';
import { ref, watch, nextTick, onMounted, onBeforeUnmount, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {streamChat, cancelChat, ServiceBusyError, UnauthorizedError} from "@/api/chat.ts";
import { useToast } from 'primevue/usetoast';
import { v4 as uuidv4 } from 'uuid';
import {useChatStore} from "@/stores/chat_store.ts";
import {useConversationStore} from "@/stores/conversation_store.js";
import {useVerifyStore} from "@/stores/verify.ts";
import UploadFile from "@/components/main_chat/UploadFile.vue";
import Button from 'primevue/button';

const conversationStore = useConversationStore()
const route = useRoute()
const router = useRouter()
const store = useChatStore()
const verifyStore = useVerifyStore()
const toast = useToast()
const input = ref("")
const chat_action = ref<"chat"|"resume">("chat")
const resume_value = ref<string>("")
const isStreaming = ref(false)
const abortController = ref<AbortController | null>(null)

//需要创建对话时候生成uuid，之后只允许读取url的uuid

/*
 * 刷新 / 关标签页 / 路由切走，这里都刻意什么都不做。
 *
 * 浏览器会自己销毁在途的 fetch，前端拦不住 —— 加不加 abort 都一样。
 * 关键在后端：它的推理订阅已经和客户端连接解耦，连接断了推理照跑到
 * done 并落库，所以刷新回来能看到完整这一轮。
 *
 * 反过来说，这里**不能**调 cancelChat：那会把「刷新」当成「停止」，
 * 本轮就真的不落库了 —— 正是之前刷新后记录丢失的原因。
 */

/**
 * 用户主动停止本轮推理。
 *
 * 顺序很重要：先告诉后端停，再断本地连接。反过来的话连接先断，
 * 后端只看到一个普通的客户端断开，会按「刷新」处理 —— 继续推完并落库，
 * 停止按钮等于没按。
 */
async function stopStreaming() {
  if (!isStreaming.value) return

  const conversationId = route.params.uuid as string

  // 先停后端。await 期间按钮已经切回发送态，不会重复点
  isStreaming.value = false
  if (conversationId) {
    await cancelChat(conversationId)
  }

  // 再断本地连接
  if (abortController.value) {
    abortController.value.abort()
    abortController.value = null
  }

  // 半截回复标记为中断状态，避免它以 streaming 态留在 IndexedDB 里
  store.failAiMessage(conversationId)
  console.log("用户主动停止推理")
}

async function sendMessage() {
  const content = input.value.trim()
  if (!content) return

  // 防止重复发送
  if (isStreaming.value) {
    console.log("正在处理中，请等待当前消息完成")
    return
  }

  input.value = ''
  //实现身份校验必须
  if (!verifyStore.isVerified) {
    verifyStore.requireVerify()
    console.log("未认证，需要认证才能发起聊天")
    return
  }

  let conversationId = route.params.uuid as string

  // 修复：先生成 conversationId，再调用 appendNewConversation
  if (!conversationId) {
    conversationId = uuidv4()
    console.log("uuid—conversation id不存在正在创建", conversationId)
    conversationStore.appendNewConversation({conversation_id:conversationId,summary_content: content})
    await router.replace({
      name: 'Chat',
      params: {uuid: conversationId}
    })
  }
  console.log("uuid—conversation id已经获取到，正在发送消息", conversationId,route.params.uuid)

  isStreaming.value = true
  abortController.value = new AbortController()

  store.addHumanMessage(
      conversationId,
      content
  )

  store.createAiPlaceholder(conversationId)

  try {
    // 身份参数去掉了：后端从 JWT 取 user_id / user_name，
    // 请求体里的身份字段已不被采信
    await streamChat(
        conversationId,
        content,
        "chat",
        resume_value.value,
        (chunk) => {
          store.appendAiChunk(
              conversationId,
              chunk
          )},
        (done) => {
          store.finishAiMessage(
              conversationId
          )
          // 首轮的摘要用来更新侧边栏标题。此前那里临时填的是用户输入
          // 的原文（见上面的 appendNewConversation），现在换成模型生成的摘要
          if (done?.summary) {
            conversationStore.updateSummary(conversationId, done.summary)
          }
          isStreaming.value = false
          abortController.value = null
        },
        (err) => {
          store.failAiMessage(
              conversationId
          )
          // 用户主动取消不显示错误提示
          if (err.name !== 'AbortError') {
            notifyStreamError(err)
          }
          isStreaming.value = false
          abortController.value = null
        },
        abortController.value.signal
    )
  } catch (err: any) {
    store.failAiMessage(
        conversationId
    )
    // 用户主动取消不显示错误提示
    if (err.name !== 'AbortError') {
      notifyStreamError(err)
    }
    isStreaming.value = false
    abortController.value = null
  }
}

/**
 * 把流式错误翻译成给用户看的提示。
 *
 * 503 必须单独说清楚：那是「后台显存被占满了，等一下再试」，
 * 不是故障。混在通用错误里会让用户以为服务坏了而反复重试 ——
 * 而反复重试恰好让配额更紧张。
 */
function notifyStreamError(err: any) {
  if (err instanceof ServiceBusyError) {
    toast.add({
      severity: 'warn',
      summary: '服务繁忙',
      detail: '后台正在处理其他任务，请稍等片刻后重试',
      life: 4000,
    })
    return
  }
  if (err instanceof UnauthorizedError) {
    verifyStore.logout()
    verifyStore.requireVerify()
    return
  }
  toast.add({
    severity: 'error',
    summary: '发送失败',
    detail: err?.message ?? '请稍后重试',
    life: 4000,
  })
}

/**
 * 处理 Enter 键按下事件
 * - Enter: 发送消息
 * - Shift+Enter: 换行（不阻止默认行为）
 */
function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    sendMessage()
  }
  // Shift+Enter 不做任何处理，让 textarea 自然换行
}

const childRef = ref()

const handleToggle = (event:PointerEvent) => {
  // 直接调用子组件暴露的方法
  childRef.value.toggle(event)
}

const human_in_loop = async (decision: 'reject' | 'approve') => {
  let conversationId = route.params.uuid as string
  if (isStreaming.value) {
    console.log("正在处理中，请等待")
    return
  }

  conversationStore.human_in_the_loop.need_human_in_the_loop = false
  isStreaming.value = true
  abortController.value = new AbortController()

  // resume 时需要创建新的 AI 占位消息来接收内容
  store.createAiPlaceholder(conversationId)

  try {
    await streamChat(
        conversationId,
        "resume",
        "resume",
        decision,
        (chunk) => {
          store.appendAiChunk(
              conversationId,
              chunk
          )},
        () => {
          store.finishAiMessage(
              conversationId
          )
          isStreaming.value = false
          abortController.value = null
          // resume 这一轮不更新摘要：摘要只在首轮生成，
          // 这里的 done.summary 必然是 null
        },
        (err) => {
          store.failAiMessage(
              conversationId
          )
          // 用户主动取消不显示错误提示
          if (err.name !== 'AbortError') {
            notifyStreamError(err)
          }
          isStreaming.value = false
          abortController.value = null
        },
        abortController.value.signal
    )
  } catch (err: any) {
    store.failAiMessage(
        conversationId
    )
    // 用户主动取消不显示错误提示
    if (err.name !== 'AbortError') {
      notifyStreamError(err)
    }
    isStreaming.value = false
    abortController.value = null
  }
}



</script>

<template>
    <div v-if="conversationStore.human_in_the_loop.need_human_in_the_loop" class="bottom-15 bg-white w-full max-w-3xl rounded-2xl h-25 mb-2 px-5 flex flex-row items-center justify-evenly">
      <div class="w-full h-20 flex flex-col justify-center items-start">收到一个人机交互事件需要你确定
        <br />
        工具{{conversationStore.human_in_the_loop.tool_name}}发来了一条授权请求：{{conversationStore.human_in_the_loop.tool_description}}
      </div>
      <div class="w-25 flex flex-col justify-between h-20">
        <Button @click="human_in_loop('reject')" severity="danger" variant="outlined" class="h-9">reject</Button>
        <Button @click="human_in_loop('approve')" severity="success" variant="outlined" class="h-9">approve</Button>
      </div>
    </div>
    <div class="w-full max-w-3xl liquid-glass flex items-center justify-between">
      <div @click="handleToggle" class="m-2 shrink-0 flex flex-row self-end items-center justify-center rounded-full w-10 h-10 hover:bg-[#aaaaaa] active:bg-[#aaaaaa] cursor-pointer">
        <i class="text-[1.3rem]! pi pi-plus"></i>
        <UploadFile ref="childRef"></UploadFile>
      </div>
      <div class="min-w-0  w-full">
          <Textarea @keydown.enter="handleKeyDown" ref="textareaRef" autoResize rows="1" class="bg-transparent border border-transparent shadow-none
          p-0 pb-2 pt-2 w-full text-xl max-h-50 overflow-y-auto scrollbar-none" v-model="input" placeholder="有问题，尽管问"  />
      </div>
      <div class="flex flex-row self-end">
        <div class="m-2 flex flex-row items-center justify-center rounded-full w-10 h-10 hover:bg-[#aaaaaa] active:bg-[#aaaaaa] cursor-pointer">
          <i class="text-[1.3rem]! pi pi-microphone"></i>
        </div>
        <div
          v-if="!isStreaming"
          @click="sendMessage"
          class="m-2 flex flex-row items-center justify-center rounded-full w-10 h-10 bg-blue-500 hover:bg-[#5555ee] active:bg-[#5555ee] cursor-pointer"
        >
          <i class="text-[1.3rem]! pi pi-sparkles text-gray-200"></i>
        </div>
        <div
          v-else
          @click="stopStreaming"
          class="m-2 flex flex-row items-center justify-center rounded-full w-10 h-10 bg-gray-400 hover:bg-gray-500 active:bg-gray-500 cursor-pointer"
        >
          <i class="text-[1.3rem]! pi pi-stop text-gray-200"></i>
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
      0 5px 32px rgba(0, 0, 0, 0.12),
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