import { fetchEventSource } from '@microsoft/fetch-event-source'
import type {ChatRequest} from '@/interface/request-interface.ts'

export async function streamChat(
  conversationId: string,
  message: string,
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
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      user_name:"lixiaoben",
      user_id:"521584",
      conversation_id: conversationId,
      content:message
    }),
    async onopen(response) {
      if (!response.ok) {
        throw new Error('连接失败')
      }
      console.log('SSE连接成功')
    },
    onmessage(msg) {
      if (!msg.data) return
      switch (msg.event) {
        case 'reasoning':
          reasoningBuffer += JSON.parse(msg.data)
          scheduleFlush()
          break
        case 'text':
          textBuffer += JSON.parse(msg.data)
          scheduleFlush()
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