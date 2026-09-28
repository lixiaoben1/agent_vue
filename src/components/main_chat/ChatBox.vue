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
import AttachmentChip from "@/components/main_chat/AttachmentChip.vue";
import Button from 'primevue/button';
import {useComposerStore} from "@/stores/composer_store.ts";

const conversationStore = useConversationStore()
const composer = useComposerStore()
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
/** 按了发送但附件还在传，正在等它们落地。按钮据此显示等待态。 */
const isWaitingUploads = ref(false)

/*
 * 附件怎么到达模型：把 task_id 随请求发给后端，由后端取出文档全文
 * 拼进本轮提示词。
 *
 * 早先的做法是在这里把文件名拼进 content，理由是「文件已进向量库，
 * 让模型知道该去检索」。那个前提现在不成立了 —— 用户上传的文件不再进
 * 向量库（那会让 A 的文档被 B 检索到），rag 工具只检索管理员维护的语料。
 *
 * 也不在前端读文件内容再拼进 content：那样用户消息里会出现几十万字
 * 他自己没打的东西，气泡、历史、摘要全被污染，而后端已经有解析好的文本。
 */

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
  const typed = input.value.trim()
  // 只带附件不打字也算一条有效消息：用户传完文件直接按发送是很自然的动作。
  // 原来这里只看文本，那种情况下按发送没有任何反应
  if (!typed && !composer.hasAttachments) return

  // 防止重复发送。等上传落地期间同样要挡住
  if (isStreaming.value || isWaitingUploads.value) {
    console.log("正在处理中，请等待当前消息完成")
    return
  }

  //实现身份校验必须。放在清空输入之前 —— 原来是先清空再校验，
  //未登录时用户打的那段字就没了，登录完还得重新打一遍
  if (!verifyStore.isVerified) {
    verifyStore.requireVerify()
    console.log("未认证，需要认证才能发起聊天")
    return
  }

  /*
   * 等在途上传落地，然后才取快照。
   *
   * 不能反过来（先取快照再等）：快照里的状态会停在 uploading，
   * 而那条消息此后不再更新，用户看到一个永远「上传中」的附件。
   *
   * 也不直接拒绝用户：让他自己盯着进度条等再按一次发送，
   * 比这里替他等一下要糟。
   */
  if (composer.isUploading) {
    isWaitingUploads.value = true
    try {
      await composer.waitForUploads()
    } finally {
      isWaitingUploads.value = false
    }
  }

  /*
   * 还在解析就先别发。
   *
   * 文档内容要等解析完写进后端才取得到 —— 这时发出去，模型收不到文件内容，
   * 而用户以为它读过了，于是会得到一个基于臆测的回答。那比等一会儿糟得多。
   *
   * 不像上传那样替用户等：解析要几分钟，让按钮转那么久等于卡住界面。
   * 给一句提示让他自己决定是等还是先问别的。
   */
  if (composer.isParsing) {
    toast.add({
      severity: 'info',
      summary: '文件还在解析',
      detail: '解析完成后再发送，模型才能读到文件内容（可能需要几分钟）',
      life: 4000,
    })
    return
  }

  const attachments = composer.takeForSend()
  // 全部附件都上传失败时，takeForSend 会把它们滤掉。此时如果用户
  // 一个字也没打，就没有可发的东西了 —— 直接发一条空消息会被后端 400
  if (!typed && !attachments.length) {
    toast.add({
      severity: 'warn',
      summary: '文件未上传成功',
      detail: '文件上传失败或超时，请重新添加，或输入文字后再发送',
      life: 4000,
    })
    return
  }

  input.value = ''
  // 后端凭这些 id 取文档全文，并校验它们确实属于当前用户
  const attachmentTaskIds = attachments
    .map((file) => file.task_id)
    .filter((id): id is string => Boolean(id))

  let conversationId = route.params.uuid as string

  // 修复：先生成 conversationId，再调用 appendNewConversation
  if (!conversationId) {
    conversationId = uuidv4()
    console.log("uuid—conversation id不存在正在创建", conversationId)
    // 侧边栏标题用用户打的原文，不用 composeContent 的结果 ——
    // 那前面带一段给模型看的附件说明，做标题太长且没有信息量。
    // 只发了文件没打字时退化成文件名
    conversationStore.appendNewConversation({
      conversation_id: conversationId,
      summary_content: typed || attachments.map((file) => file.name).join('、'),
    })
    await router.replace({
      name: 'Chat',
      params: {uuid: conversationId}
    })
  }
  console.log("uuid—conversation id已经获取到，正在发送消息", conversationId,route.params.uuid)

  isStreaming.value = true
  abortController.value = new AbortController()

  // 气泡里显示用户打的原文，附件另做 chip 展示
  store.addHumanMessage(
      conversationId,
      typed,
      attachments
  )

  store.createAiPlaceholder(conversationId)

  try {
    // 身份参数去掉了：后端从 JWT 取 user_id / user_name，
    // 请求体里的身份字段已不被采信
    await streamChat(
        conversationId,
        typed,
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
        abortController.value.signal,
        attachmentTaskIds
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
    <div class="w-full max-w-3xl liquid-glass flex flex-col">
      <!--
        待发送区。这一块是修复的关键所在：附件的可见性不再依赖上传面板开着 ——
        面板关掉后附件仍然在这里，带着各自的进度和状态。
        用户随时能看到「文件在传 / 在解析 / 已入库」，不必再猜。
      -->
      <div
        v-if="composer.hasAttachments"
        class="flex flex-row flex-wrap gap-2 px-3 pt-3"
      >
        <AttachmentChip
          v-for="item of composer.attachments"
          :key="item.id"
          :name="item.name"
          :size="item.size"
          :status="item.status"
          :progress="item.progress"
          :error-message="item.error_message"
          removable
          @remove="composer.remove(item.id)"
        />
      </div>

      <div class="flex items-center justify-between">
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
          <!--
            等上传落地时按钮转圈而不是变成停止键：此刻还没有推理可停，
            显示停止键会让用户点了之后什么也没发生。
          -->
          <div
            v-if="isWaitingUploads"
            class="m-2 flex flex-row items-center justify-center rounded-full w-10 h-10 bg-blue-400 cursor-wait"
            title="正在等待文件上传完成"
          >
            <i class="text-[1.3rem]! pi pi-spin pi-spinner text-gray-200"></i>
          </div>
          <div
            v-else-if="!isStreaming"
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