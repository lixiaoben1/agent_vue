import { defineStore } from 'pinia'
import type {
  ChatResponseInterface
} from '@/interface/response-interface.ts'
import { get, set } from "idb-keyval"
import router from "@/router";
import { ref, toRaw } from "vue"
import axios from "axios";
import {useVerifyStore} from "@/stores/verify.ts";
const verifyStore = useVerifyStore()
export interface ChatMessage {
  id: string
  role: 'HumanMessage' | 'AiMessage'
  conversation_id: string
  reasoning?: string
  content: string
  created_at: string
  status?: 'streaming' | 'complete' | 'error'
}

export const useChatStore = defineStore('chat', () => {
  const messages = ref<Record<string, ChatMessage[]>>({})
  const loadedIds = ref<Set<string>>(new Set())
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
    content: string
  ) {
    initConversation(conversationId)

    messages.value[conversationId]?.push({
      id: crypto.randomUUID(),
      role: 'HumanMessage',
      conversation_id: conversationId,
      content,
      created_at: new Date().toISOString(),
      status: 'complete'
    })
    saveToCache(conversationId)
  }

  /**
   * AI占位消息
   */
  function createAiPlaceholder(
    conversationId: string
  ) {
    initConversation(conversationId)

    const aiMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'AiMessage',
      conversation_id: conversationId,
      content: '',
      created_at: new Date().toISOString(),
      status: 'streaming'
    }

    messages.value[conversationId]?.push(aiMsg)

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

    if (!verifyStore.isVerified) {
      console.log("未认证，不允许获取当前conversationid的",conversationId,"历史记录")
      await router.replace('/chat');
      return
    }
    if (loadedIds.value.has(conversationId)) return

    // 🆕 2. IndexedDB 命中，恢复到内存并标记已加载
    try {
      const cached = await get<ChatMessage[]>(`chat:${conversationId}`)
      if (cached && cached.length > 0) {
        messages.value[conversationId] = cached
        loadedIds.value.add(conversationId)
        console.log(`✅ [${conversationId}] 从 IndexedDB 恢复`)
        return
      }
    } catch (e) {
      console.warn('IndexedDB 读取失败，降级到网络请求', e) // 🆕 无痕模式等场景兜底
    }

    // 🆕 3. 都未命中，走原始网络请求

    try {
      const res = await axios.post(`/api/request_history`, { conversation_id: conversationId });
      console.log("正在从服务器拉取的历史记录",res.data.length);
      if (!res.data || !Array.isArray(res.data) || res.data.length === 0) {
        console.log(`[History] conversationId=${conversationId} 返回数据为空或格式异常，跳过本次更新`, res.data)
      return
      }
      // ✅ 只有成功拿到数据（含新对话的空数组）才会执行以下三步
      messages.value[conversationId] = res.data;
      loadedIds.value.add(conversationId);
      saveToCache(conversationId);
    } catch (error: any) {
      // 🆕 新建对话必然 404，视为正常空状态，静默处理
      if (error.response?.status === 404) {
        console.log(`💬 [${conversationId}] 新对话或无历史记录`);
        return;
      } else {
        // ⚠️ 网络断开 / 500 等真实错误，打印日志并提前退出
        console.error(`❌ [${conversationId}] 获取历史记录失败:`, error);
        return;
      }
    }


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

    createAiPlaceholder,

    appendAiChunk,

    finishAiMessage,

    failAiMessage,

    loadHistory
  }
})
