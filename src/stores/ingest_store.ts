import { defineStore } from 'pinia'
import { ref } from 'vue'
import http from '@/api/http'

/** 与后端 IngestTaskResponse 对应。 */
export interface IngestTask {
  task_id: string
  file_name: string
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'DUPLICATE'
  chunk_count: number | null
  error_message: string | null
  created_at: string
  updated_at: string
  /**
   * 解析结果的去向。
   *   SESSION 用户上传，只作本次对话的上下文，不进向量库
   *   CORPUS  管理员导入的语料，进向量库，所有对话可检索
   *
   * 界面上两者的文案必须分开说 —— 把 SESSION 说成「已入知识库」
   * 是对数据去向的错误承诺。
   */
  target?: 'SESSION' | 'CORPUS'
}

/** 到了这三个状态就不会再变，前端该停止轮询。 */
const TERMINAL_STATUSES = ['SUCCESS', 'FAILED', 'DUPLICATE']

/**
 * 轮询间隔。3 秒是权衡结果：解析要几分钟，1 秒轮询只是白发请求；
 * 10 秒又让用户觉得界面卡住了。
 */
const POLL_INTERVAL_MS = 3_000

/**
 * 单个任务的轮询上限，防止无限轮询。
 *
 * 取 GPU_INGEST_LEASE_SECONDS（默认 1800s）的量级 —— 任务排队加解析
 * 最长就是这个数。超了说明消费者进程没起来或者卡死了，
 * 继续轮下去只是徒劳。
 */
const MAX_POLLS = 600

/**
 * 文件解析任务进度。
 *
 * 为什么需要轮询而不是等上传响应：上传接口返回时文件只是落了盘、
 * 进了队列，解析要几分钟才完成。同步等会让请求超时，而且用户会关页面 ——
 * 任务不能因此丢，所以状态在数据库里，前端凭 task_id 查。
 */
export const useIngestStore = defineStore('ingest_store', () => {
  const tasks = ref<Record<string, IngestTask>>({})
  /** 各任务的定时器，卸载时要清掉，否则组件销毁后还在发请求。 */
  const timers = new Map<string, number>()
  /** 停止标志，防止 stopAll 后正在飞行的请求回调创建新定时器 */
  const stopped = ref(false)

  /** 开始跟踪一个刚提交的任务。 */
  function track(taskId: string, fileName: string) {
    // 恢复轮询状态（用户可能重新打开页面或重新上传）
    stopped.value = false

    tasks.value[taskId] = {
      task_id: taskId,
      file_name: fileName,
      status: 'PENDING',
      chunk_count: null,
      error_message: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    poll(taskId, 0)
  }

  function poll(taskId: string, attempt: number) {
    // 已经停止，不再创建新的定时器
    if (stopped.value) return

    if (attempt >= MAX_POLLS) {
      const task = tasks.value[taskId]
      if (task) {
        task.status = 'FAILED'
        task.error_message = '等待超时，解析服务可能未运行'
      }
      return
    }

    const timer = window.setTimeout(async () => {
      timers.delete(taskId)

      // 再次检查停止标志，防止定时器触发时已经 stopAll
      if (stopped.value) return

      try {
        const res = await http.get<IngestTask>(`/api/ingest/tasks/${taskId}`)
        tasks.value[taskId] = res.data

        if (!TERMINAL_STATUSES.includes(res.data.status)) {
          poll(taskId, attempt + 1)
        }
      } catch (error: any) {
        // 404 说明任务不存在（或不属于当前用户），不用再轮
        if (error?.response?.status === 404) {
          delete tasks.value[taskId]
          return
        }
        // 其他错误可能是网络抖动，继续轮
        poll(taskId, attempt + 1)
      }
    }, POLL_INTERVAL_MS)

    timers.set(taskId, timer)
  }

  /** 拉取当前用户的历史任务，供打开面板时展示。 */
  async function fetchTasks(limit = 20) {
    // 恢复轮询状态
    stopped.value = false

    try {
      const res = await http.get<IngestTask[]>('/api/ingest/tasks', {
        params: { limit },
      })
      res.data.forEach((task) => {
        tasks.value[task.task_id] = task
        // 未到终态的任务要接着轮 —— 用户刷新过页面，
        // 之前的定时器已经随页面一起消失了
        if (!TERMINAL_STATUSES.includes(task.status) && !timers.has(task.task_id)) {
          poll(task.task_id, 0)
        }
      })
    } catch (error) {
      console.error('获取解析任务列表失败:', error)
    }
  }

  /** 清掉全部定时器。页面卸载时调用，否则会留下持续发请求的定时器。 */
  function stopAll() {
    stopped.value = true
    timers.forEach((timer) => clearTimeout(timer))
    timers.clear()
  }

  function dismiss(taskId: string) {
    const timer = timers.get(taskId)
    if (timer) {
      clearTimeout(timer)
      timers.delete(taskId)
    }
    delete tasks.value[taskId]
  }

  return { tasks, track, fetchTasks, stopAll, dismiss }
})
