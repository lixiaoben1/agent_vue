import { defineStore } from 'pinia'
import type {
  ChatResponseInterface
} from '@/interface/response-interface.ts'
import { get, set } from "idb-keyval"
import router from "@/router";
import { ref, toRaw } from "vue"
import http from "@/api/http";
import {useVerifyStore} from "@/stores/verify.ts";
import { v4 as uuidv4 } from 'uuid';
import type {
  AttachmentStatus,
  MessageAttachment,
} from '@/interface/attachment-interface'
export interface ChatMessage {
  id: string
  role: 'HumanMessage' | 'AiMessage'
  conversation_id: string
  reasoning?: string
  content: string
  created_at: string
  status?: 'streaming' | 'complete' | 'error'
  /**
   * 随消息一起发出的附件。
   *
   * 只存在于本地：服务端的 conversation_history_record 没有附件列，
   * 历史接口也不会回传它。所以 revalidate 时要把本地这份接回去 ——
   * 否则与服务端核对一次，第一条带文件的消息上的附件就没了。
   */
  attachments?: MessageAttachment[]
}

/** 服务端 HistoryItemResponse 的形状。字段名与 ChatMessage 对不齐，需要归一化。 */
interface HistoryItemResponse {
  role: 'HumanMessage' | 'AiMessage'
  content: string
  reasoning?: string
  message_id?: string
  turn_index?: number
  created_at?: string
}

export const useChatStore = defineStore('chat', () => {
  const messages = ref<Record<string, ChatMessage[]>>({})
  const loadedIds = ref<Set<string>>(new Set())
  /** 正在流式输出的会话。服务端数据不能覆盖它们，否则会把在途回复抹掉。 */
  const streamingIds = ref<Set<string>>(new Set())
  /** 正在请求中的会话，用于去重并发的 loadHistory。 */
  const inFlight = new Set<string>()
  /** 「等后端把这一轮写完」的轮询定时器。 */
  const pendingTimers = new Map<string, number>()

  /**
   * 把服务端返回的历史项归一化成 ChatMessage。
   *
   * 必须做这一步：服务端给的是 message_id，没有 id / conversation_id / status。
   * 原实现把响应直接赋给 messages，于是这些消息的 id 是 undefined ——
   * ChatWindow 用 id 做 v-for 的 key，虚拟列表会复用错节点，
   * 表现为滚动时消息内容串位。
   *
   * id **不能**用 message_id：那一列存的是 user_name（见 Java 侧
   * ConversationHistoryRecord 的注释，列名与内容不符是历史遗留），
   * 于是同一个用户的所有消息会拿到同一个 id —— 正是上面那段注释想避免的
   * 串位问题，只是换了个成因。这里一律用 conversation + 轮次 + 角色 合成，
   * 它在一个会话内唯一且稳定（同一轮的 human 与 ai 各一条）。
   */
  function normalize(items: HistoryItemResponse[], conversationId: string): ChatMessage[] {
    return items.map((item, index) => ({
      id: `${conversationId}:${item.turn_index ?? index}:${item.role}:${index}`,
      role: item.role,
      conversation_id: conversationId,
      content: item.content ?? '',
      reasoning: item.reasoning ?? '',
      created_at: item.created_at ?? new Date().toISOString(),
      status: 'complete' as const,
    }))
  }

  /**
   * 把本地记着的附件接回服务端返回的消息上。
   *
   * 为什么需要这一步：附件信息只存在于前端（历史表没有附件列，
   * 上传与对话是两条独立链路）。revalidate 是「服务端为准」地整体替换列表，
   * 不接回去的话，与服务端核对一次之后，那条带文件的消息就只剩文字了 ——
   * 而 revalidate 在每次进入会话时都会跑。
   *
   * 按「第几条用户消息」对应，不按内容或 id 匹配：服务端落库的 human_content
   * 来自模型实际收到的输入，中间件压缩改写过历史时它与本地原文可能不一致，
   * 按内容匹配会漏。而顺序是稳定的 —— 两侧都是同一串对话的同一个顺序。
   */
  function carryOverAttachments(
    conversationId: string,
    normalized: ChatMessage[],
  ): ChatMessage[] {
    const local = messages.value[conversationId]
    if (!local?.length) return normalized

    const localAttachments = local
      .filter((msg) => msg.role === 'HumanMessage')
      .map((msg) => msg.attachments)

    let humanIndex = 0
    for (const msg of normalized) {
      if (msg.role !== 'HumanMessage') continue
      const carried = localAttachments[humanIndex++]
      if (carried?.length) {
        msg.attachments = carried
      }
    }
    return normalized
  }

  /**
   * 标记 / 清除「这一轮的回复还没落库」。
   *
   * 存 sessionStorage 而不是内存：它要跨页面刷新存活 —— 用途正是让刷新
   * 后的页面知道「后端此刻可能仍在推这一轮」，从而去等它。
   */
  function markPending(conversationId: string) {
    try {
      sessionStorage.setItem(`chat_pending:${conversationId}`, Date.now().toString())
    } catch {
      // 隐私模式下 sessionStorage 可能不可写。等待逻辑退化为不等待，
      // 用户手动刷新一次即可看到，不值得为此中断流程
    }
  }

  function clearPending(conversationId: string) {
    try {
      sessionStorage.removeItem(`chat_pending:${conversationId}`)
    } catch { /* 同上 */ }
  }

  /** 这一轮是否可能仍在后端推理中。超过 15 分钟视为早已放弃，不再等。 */
  function hasFreshPending(conversationId: string): boolean {
    try {
      const at = sessionStorage.getItem(`chat_pending:${conversationId}`)
      if (!at) return false
      return Date.now() - Number(at) < 15 * 60 * 1000
    } catch {
      return false
    }
  }
  /**
   * 初始化会话
   */
  function initConversation(conversationId: string) {
    if (!messages.value[conversationId]) {
      messages.value[conversationId] = []
    }
  }

  /**
   * 用户消息
   */
  function addHumanMessage(
    conversationId: string,
    content: string,
    attachments?: MessageAttachment[]
  ) {
    initConversation(conversationId)

    messages.value[conversationId]?.push({
      id: uuidv4(),
      role: 'HumanMessage',
      conversation_id: conversationId,
      content,
      created_at: new Date().toISOString(),
      status: 'complete',
      // 空数组不写：会让每条无附件的消息都多带一个字段进 IndexedDB，
      // 也让模板里的 v-if 判断多一种情况
      ...(attachments?.length ? { attachments } : {}),
    })
    saveToCache(conversationId)
  }

  /**
   * 更新某个附件的解析状态，扫全部会话。
   *
   * 扫全部而不是只扫当前会话：用户发完消息就切走是很常见的，
   * 而解析要几分钟 —— 那条消息上的 chip 该在他切回来时显示正确状态。
   * task_id 是 UUID，跨会话不会撞。
   *
   * 由 composer store 的 ingest 监听调用。
   */
  function updateAttachmentStatus(
    taskId: string,
    status: AttachmentStatus,
    errorMessage?: string,
  ) {
    for (const [conversationId, list] of Object.entries(messages.value)) {
      let touched = false
      for (const msg of list ?? []) {
        for (const attachment of msg.attachments ?? []) {
          if (attachment.task_id !== taskId) continue
          if (attachment.status === status && attachment.error_message === errorMessage) {
            continue
          }
          attachment.status = status
          attachment.error_message = errorMessage
          touched = true
        }
      }
      // 只有真的变了才写盘：这个函数由一个 deep watch 驱动，
      // 每次轮询回来都会调一遍，无条件写盘等于每 3 秒一次无谓的 IndexedDB 写入
      if (touched) saveToCache(conversationId)
    }
  }

  /**
   * AI占位消息
   */
  function createAiPlaceholder(
    conversationId: string
  ) {
    initConversation(conversationId)

    const aiMsg: ChatMessage = {
      id: uuidv4(),
      role: 'AiMessage',
      conversation_id: conversationId,
      content: '',
      reasoning: '',
      created_at: new Date().toISOString(),
      status: 'streaming'
    }

    messages.value[conversationId]?.push(aiMsg)

    // 从这一刻起，服务端数据不能覆盖本地 —— 在途回复只存在于内存里
    streamingIds.value.add(conversationId)
    // 刷新后靠这个标记知道「后端可能还在推这一轮」，从而去等它落库
    markPending(conversationId)

    return aiMsg.id
  }

  /**
   * 流式追加
   */
  function appendAiChunk(
    conversationId: string,
    chunk: {type:"reasoning"|"text", content: string},
  )  {
    const list = messages.value[conversationId]
    if (!list?.length) return

    const lastMsg = list[list.length - 1]
    if (lastMsg?.role !== 'AiMessage') return
    if (chunk.type === "reasoning") {
      lastMsg.reasoning += chunk.content
    } else {
      lastMsg.content += chunk.content
    }
  }

  /**
   * AI结束
   */
  function finishAiMessage(
    conversationId: string
  ) {
    // 先解除流式标记再判断内容：放在早退之后的话，一旦走进早退分支，
    // 这个会话就永远留在 streamingIds 里，此后所有与服务端的核对
    // 都会被跳过 —— 界面从此不再更新，且没有任何报错
    streamingIds.value.delete(conversationId)
    clearPending(conversationId)

    const list = messages.value[conversationId]

    if (!list?.length) return

    const lastMsg = list[list.length - 1]

    if (lastMsg?.role !== 'AiMessage') return

    lastMsg.status = 'complete'
    saveToCache(conversationId)
  }

  /**
   * AI异常
   */
  function failAiMessage(
    conversationId: string
  ) {
    // 同 finishAiMessage：清理必须在早退之前，否则会话被永久标记为流式中
    streamingIds.value.delete(conversationId)
    // 主动停止 / 报错的一轮后端不会落库，没什么可等
    clearPending(conversationId)

    const list = messages.value[conversationId]

    if (!list?.length) return

    const lastMsg = list[list.length - 1]

    if (lastMsg?.role !== 'AiMessage') return

    lastMsg.status = 'error'
    saveToCache(conversationId)
  }

  /**
   * 拉取历史
   */
  async function loadHistory(
    conversationId: string
  ) {
    // 在函数内部获取 verifyStore，避免模块级别初始化
    const verifyStore = useVerifyStore()

    if (!verifyStore.isVerified) {
      console.log("未认证，不允许获取当前conversationid的",conversationId,"历史记录")
      await router.replace('/chat');
      return
    }
    // 先用缓存把界面填上（快），再向服务端核对（准）—— stale-while-revalidate。
    //
    // 原实现是「缓存命中就 return」，那意味着一个会话在本会话期内只可能
    // 从缓存读一次，服务端后来写进去的东西前端永远看不到。而恰好有一条
    // 很常见的路径会产生这种偏差：流式输出期间刷新页面 —— 后端把这一轮
    // 推完并落库了，但缓存里存的是刷新前的样子。缓存自己无法判断
    // 「服务端是不是已经比我新」，所以唯一可靠的做法是每次都去核对。
    if (!messages.value[conversationId]) {
      try {
        const cached = await get<ChatMessage[]>(`chat:${conversationId}`)
        if (cached && cached.length > 0) {
          messages.value[conversationId] = cached
          console.log(`⚡ [${conversationId}] 先用 IndexedDB 渲染，随后与服务端核对`)
        }
      } catch (e) {
        console.warn('IndexedDB 读取失败，直接走网络请求', e)
      }
    }

    await revalidate(conversationId)
  }

  /**
   * 与服务端核对一个会话的历史，服务端为准。
   *
   * 两处刻意的例外，都是为了不把用户正看着的东西弄没：
   *   - 该会话正在流式输出：在途回复只存在于内存里，服务端还没有它
   *   - 服务端返回空：新会话刚发出第一条消息时会这样，此时本地那条
   *     用户消息是唯一的真相
   */
  async function revalidate(conversationId: string) {
    if (streamingIds.value.has(conversationId)) return
    if (inFlight.has(conversationId)) return
    inFlight.add(conversationId)

    try {
      // 后端会校验会话归属：不是自己的会话返回 404（原实现只按
      // conversation_id 查，知道 id 就能拉走任意用户的全部历史）
      const res = await http.get<HistoryItemResponse[]>(
        `/api/conversations/${conversationId}/history`,
      )
      if (!Array.isArray(res.data) || res.data.length === 0) {
        console.log(`[History] ${conversationId} 服务端暂无数据，保留本地`)
        schedulePendingRecheck(conversationId)
        return
      }

      // 流式输出可能在 await 期间开始了，此时不能覆盖
      if (streamingIds.value.has(conversationId)) return

      // 附件只存在于本地，替换列表前先把它们记下来接回去
      messages.value[conversationId] = carryOverAttachments(
        conversationId,
        normalize(res.data, conversationId),
      )
      loadedIds.value.add(conversationId)
      saveToCache(conversationId)
      console.log(`✅ [${conversationId}] 已与服务端同步，共 ${res.data.length} 条`)

      schedulePendingRecheck(conversationId)
    } catch (error: any) {
      if (error.response?.status === 404) {
        // 新建对话必然 404，正常空状态
        console.log(`💬 [${conversationId}] 新对话或无历史记录`)
        return
      }
      // 网络断开 / 500：保留缓存内容，用户至少还能看到上次的对话
      console.error(`❌ [${conversationId}] 获取历史记录失败，沿用本地缓存:`, error)
    } finally {
      inFlight.delete(conversationId)
    }
  }

  /**
   * 后端可能仍在推这一轮，隔几秒再核对一次。
   *
   * 解决的是一个时序问题：用户在流式输出期间刷新，此刻后端还没推完，
   * 前端这一次请求自然拿不到这一轮 —— 但再等一会儿它就落库了。没有这个
   * 重试的话，用户必须自己再刷新一次才能看到，而他并不知道要刷。
   *
   * 只在 createAiPlaceholder 留下的 pending 标记还新鲜时才等，所以：
   * 主动停止（failAiMessage 清了标记）不等，历史会话不等，
   * 放弃很久的一轮也不等。
   */
  function schedulePendingRecheck(conversationId: string, attempt = 0) {
    const MAX_ATTEMPTS = 100  // × 3s ≈ 5 分钟，与 GPU 租约同量级
    const INTERVAL_MS = 3_000

    const existing = pendingTimers.get(conversationId)
    if (existing) {
      clearTimeout(existing)
      pendingTimers.delete(conversationId)
    }

    if (!hasFreshPending(conversationId)) return
    if (attempt >= MAX_ATTEMPTS) {
      console.log(`[History] ${conversationId} 等待后端落库超时，停止重试`)
      clearPending(conversationId)
      return
    }
    // 最后一条已经是 AI 回复，说明这一轮到了
    const list = messages.value[conversationId]
    if (list?.length && list[list.length - 1]?.role === 'AiMessage') {
      clearPending(conversationId)
      return
    }

    const timer = window.setTimeout(() => {
      pendingTimers.delete(conversationId)
      revalidate(conversationId).then(() =>
        schedulePendingRecheck(conversationId, attempt + 1),
      )
    }, INTERVAL_MS)
    pendingTimers.set(conversationId, timer)
  }

  /** 清掉全部等待定时器。页面卸载时调用。 */
  function stopPendingRechecks() {
    pendingTimers.forEach((timer) => clearTimeout(timer))
    pendingTimers.clear()
  }


  function saveToCache(conversationId: string) {
    const list = messages.value[conversationId]
    if (!list) return
    const rawList = toRaw(list)
    console.log("成功写入indexedDB")
    set(`chat:${conversationId}`, rawList).catch((err) => {
      console.warn(`IndexedDB 写入失败 [${conversationId}]`, err)
    })
  }

  return {
    messages,

    initConversation,

    addHumanMessage,

    updateAttachmentStatus,

    createAiPlaceholder,

    appendAiChunk,

    finishAiMessage,

    failAiMessage,

    loadHistory,

    revalidate,

    stopPendingRechecks
  }
})
