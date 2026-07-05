import { fetchEventSource } from '@microsoft/fetch-event-source'
import {useConversationStore} from "@/stores/conversation_store.ts";

const conversationStore = useConversationStore()

export async function streamChat(
  conversationId: string,
  username: string,
  user_id: string,
  message: string,
  chat_action:"resume"|"chat",
  resume_value:string,
  onChunk: (
    msg: {
      type: 'reasoning' | 'text'
      content: string
    }
  ) => void,
  onFinish: () => void,
  onError: (err: any) => void
) {
  let textBuffer = ''
  let reasoningBuffer = ''
  let flushTimer: number | null = null
  const flush = () => {
    if (reasoningBuffer) {
      onChunk({
        type: 'reasoning',
        content: reasoningBuffer
      })
      reasoningBuffer = ''
    }
    if (textBuffer) {
      onChunk({
        type: 'text',
        content: textBuffer
      })
      textBuffer = ''
    }
  }
  const scheduleFlush = () => {
    if (flushTimer) return
    flushTimer = window.setTimeout(() => {
      flush()
      flushTimer = null
    }, 50)
  }
  await fetchEventSource('/api/chat', {
    method: 'POST',
    openWhenHidden: true,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      user_name:username,
      user_id:user_id,
      conversation_id: conversationId,
      content:message,
      chat_action:chat_action,
      resume_value:resume_value
    }),
    async onopen(response) {
      if (!response.ok) {
        throw new Error('连接失败')
      }
      console.log('SSE连接成功')
    },
    onmessage(msg) {
      if (!msg.data || msg.data === 'null') return
      switch (msg.event) {
        case 'reasoning':
          reasoningBuffer += JSON.parse(msg.data)
          scheduleFlush()
          break
        case 'text':
          textBuffer += JSON.parse(msg.data)
          scheduleFlush()
          break
        case 'interrupt':
          const {action_requests,review_configs} = JSON.parse(msg.data)[0].value
          conversationStore.human_in_the_loop.tool_name = action_requests?.[0]?.name ?? ""
          conversationStore.human_in_the_loop.tool_description = action_requests?.[0]?.description ?? ""
          conversationStore.human_in_the_loop.tool_args = action_requests?.[0]?.args ?? {}
          conversationStore.human_in_the_loop.allowed_decisions = review_configs?.[0]?.allowed_decisions ?? []
          if (conversationStore.human_in_the_loop.tool_name){
            conversationStore.human_in_the_loop.need_human_in_the_loop = true
          }
          console.log(conversationStore.human_in_the_loop.tool_name,'------',conversationStore.human_in_the_loop.tool_description)
          break
      }
    },
    onclose() {
      flush()
      if (flushTimer) {
        clearTimeout(flushTimer)
      }
      onFinish()
    },
    onerror(err) {
      if (flushTimer) {
        clearTimeout(flushTimer)
      }
      onError(err)
      throw err
    }
  })
}