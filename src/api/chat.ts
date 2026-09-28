import { fetchEventSource } from '@microsoft/fetch-event-source'
import { useConversationStore } from "@/stores/conversation_store.ts";
import http, { getToken } from "@/api/http";

/**
 * 请求后端停止一轮在途推理。
 *
 * 必须在 abort 掉 SSE 连接**之前**调用。原因：断开连接本身不能表达
 * 「停止」—— 刷新页面同样是断开，而那时我们要的是后端把这一轮推完并
 * 落库。两种意图在 TCP 层没有区别，所以停止只能靠这个额外的请求来说明。
 *
 * 失败不抛：调用方紧接着就要 abort，停止的用户意图不该因为这个请求
 * 失败而卡住。代价是后端可能继续把这一轮推完并落库 —— 那是可接受的
 * 降级（多一条历史），比按钮点了没反应好。
 */
export async function cancelChat(conversationId: string): Promise<void> {
  try {
    await http.post(`/api/chat/cancel/${conversationId}`)
  } catch (e) {
    console.warn('请求停止推理失败，后端可能会把本轮推完', e)
  }
}

/** 服务繁忙（显存配额已满）。调用方据此提示用户稍后重试，而不是当成网络错误。 */
export class ServiceBusyError extends Error {
  constructor(message = '服务繁忙，请稍后重试') {
    super(message)
    this.name = 'ServiceBusyError'
  }
}

/** 未认证。token 过期或无效。 */
export class UnauthorizedError extends Error {
  constructor(message = '登录已过期，请重新登录') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

/**
 * done 事件负载，对应后端的 ChatDonePayload。
 *
 * 后端收到它就把这一轮落库了，前端不需要再发落库请求 ——
 * 业务库写入已收归后端一处。这里拿到它主要有两个用途：
 * 首轮的 summary 用来更新侧边栏标题；interrupted 用来区分
 * 「正常结束」与「等用户确认」。
 */
export interface ChatDone {
  text: string
  reasoning: string
  human_content: string
  summary: string | null
  interrupted: boolean
}

/**
 * 发起一轮对话。
 *
 * 与重构前的三处差别：
 *   1. 带 Authorization 头。身份不再放在请求体里 —— 后端从 JWT 取，
 *      请求体里的 user_id / user_name 已经不被采信，所以这里也不发了。
 *   2. 多了 done 事件。它带完整结果，后端据此落库。
 *   3. 503 表示显存配额已满，是可重试的正常状态，不是故障。
 *
 * @param abortSignal 可选的取消信号，用于主动终止请求
 */
export async function streamChat(
  conversationId: string,
  message: string,
  chat_action: "resume" | "chat",
  resume_value: string,
  onChunk: (
    msg: {
      type: 'reasoning' | 'text'
      content: string
    }
  ) => void,
  onFinish: (done?: ChatDone) => void,
  onError: (err: any) => void,
  abortSignal?: AbortSignal,
  /**
   * 本轮引用的上传文件（ingest_task_record 的 task_id）。
   *
   * 后端据此从 session_document 取出解析好的文本，拼进这一轮的提示词。
   * 只发 id 不发内容：文档可能有几十万字，而后端已经有解析结果 ——
   * 前端再传一遍是白跑一趟带宽，也会让用户消息里出现他没打过的内容。
   *
   * 这些 id 不是凭据：后端取文档时会同时匹配 JWT 里的 user_id，
   * 拿别人的 task_id 过来什么也读不到。
   */
  attachmentTaskIds?: string[]
) {
  let textBuffer = ''
  let reasoningBuffer = ''
  let flushTimer: number | null = null
  // done 事件先存下来，等 onclose 时一起交给调用方 ——
  // 那时缓冲区已经 flush 完，界面状态是一致的
  let donePayload: ChatDone | undefined

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
  const clearFlushTimer = () => {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
  }

  // 在函数内部获取 store 实例，避免模块级别初始化导致的 pinia 未就绪错误
  const conversationStore = useConversationStore()

  // 用户主动取消时的处理
  if (abortSignal?.aborted) {
    onError(new Error('请求已取消'))
    return
  }

  await fetchEventSource('/api/chat', {
    method: 'POST',
    openWhenHidden: true,
    signal: abortSignal,
    headers: {
      'Content-Type': 'application/json',
      // fetchEventSource 不走 axios，所以拦截器帮不上忙，要手工加
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({
      conversation_id: conversationId,
      content: message,
      chat_action: chat_action,
      resume_value: resume_value,
      attachment_task_ids: attachmentTaskIds ?? []
    }),
    async onopen(response) {
      if (response.ok) {
        console.log('SSE连接成功')
        return
      }
      // 这些状态码必须在这里分辨清楚。默认行为是抛一个笼统的
      // 「连接失败」，前端无法区分「配额满了稍后重试」和「真的挂了」，
      // 只能给用户一个没用的报错。
      if (response.status === 503) {
        throw new ServiceBusyError()
      }
      if (response.status === 401) {
        throw new UnauthorizedError()
      }
      let detail = ''
      try {
        detail = (await response.json())?.message ?? ''
      } catch {
        // 错误体不是 JSON，忽略
      }
      throw new Error(detail || `连接失败（${response.status}）`)
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
        case 'interrupt': {
          const { action_requests, review_configs } = JSON.parse(msg.data)[0].value
          conversationStore.human_in_the_loop.tool_name = action_requests?.[0]?.name ?? ""
          conversationStore.human_in_the_loop.tool_description = action_requests?.[0]?.description ?? ""
          conversationStore.human_in_the_loop.tool_args = action_requests?.[0]?.args ?? {}
          conversationStore.human_in_the_loop.allowed_decisions = review_configs?.[0]?.allowed_decisions ?? []
          if (conversationStore.human_in_the_loop.tool_name) {
            conversationStore.human_in_the_loop.need_human_in_the_loop = true
          }
          break
        }
        case 'done':
          // 本轮结束。后端已据此落库，这里只留给调用方更新界面
          donePayload = JSON.parse(msg.data) as ChatDone
          break
        case 'error':
          // 后端补的具名事件。没有它的话流会静默截断，
          // 与「网络断了」完全无法区分
          flush()
          clearFlushTimer()
          onError(new Error(JSON.parse(msg.data)))
          break
      }
    },
    onclose() {
      flush()
      clearFlushTimer()
      onFinish(donePayload)
    },
    onerror(err) {
      clearFlushTimer()
      // 抛出去让 fetchEventSource 停止重试。它默认会自动重连，
      // 而配额满、token 过期这类情况重连只是把同一个错误再撞一次
      onError(err)
      throw err
    }
  })
}
