import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import http from '@/api/http'

/** 与 Java 的 AdminDashboardResponse 对应（SNAKE_CASE）。 */
export interface InferringSession {
  user_id: string
  user_name: string
  conversation_id: string
  /** 已跑了多久。-1 表示取不到开始时刻。 */
  elapsed_seconds: number
}

export interface UploadStage {
  session_pending: number
  session_running: number
  session_success: number
  session_failed: number
  corpus_pending: number
  corpus_running: number
  corpus_success: number
  corpus_failed: number
}

export interface CorpusStats {
  /** Chroma 里的 chunk 数，-1 表示读取失败。 */
  chunk_count: number
  /** md5_record 行数，即导入过的文件数。-1 表示读取失败。 */
  file_count: number
  collection: string
}

export interface GpuStats {
  /** null 表示 Redis 不可达。 */
  available_permits: number | null
  effective_total_permits: number | null
  configured_total_permits: number
}

export interface TaskBrief {
  task_id: string
  user_id: string
  user_name: string
  file_name: string
  status: string
  target: 'SESSION' | 'CORPUS'
  chunk_count: number | null
  error_message: string | null
  updated_at: string | null
}

export interface AccountStats {
  total_users: number
  /**
   * 管理员数。注册接口产不出管理员，所以这个数字只可能因为有人直接改
   * 数据库而变化 —— 它变大就是个该注意的信号。
   */
  admin_users: number
  /** 还能用来注册的码数，也就是当前敞开的注册入口数量。 */
  active_keys: number
  used_keys: number
}

export interface DashboardSnapshot {
  online_users: Record<string, string>
  inferring: InferringSession[]
  upload_stage: UploadStage
  corpus: CorpusStats
  gpu: GpuStats
  recent_tasks: TaskBrief[]
  accounts: AccountStats
  generated_at: number
}

export interface InviteKey {
  id: number
  /** 明文前 8 位，用来在列表里认出是哪个码。 */
  key_prefix: string
  /**
   * 完整明文密钥。
   *
   * **只在生成那一次的响应里有值**，列表接口永远是 null —— 后端只存
   * SHA-256，明文不落库。所以生成后必须让管理员当场复制走。
   */
  plain_key: string | null
  note: string | null
  status: 'ACTIVE' | 'USED' | 'EXPIRED' | 'REVOKED'
  created_by: string
  used_by_name: string | null
  created_at: string
  expires_at: string | null
  used_at: string | null
}

/** 看板轮询间隔。5 秒足够看出变化，又不至于让后端每秒被扫一遍 Redis 键。 */
const POLL_INTERVAL_MS = 5_000

/**
 * 管理看板数据。
 *
 * 轮询而不是 SSE：看板要的是周期性快照，不是事件流。SSE 要多维护一条
 * 长连接和断线重连，而这里晚 5 秒看到变化完全可以接受。
 */
export const useAdminStore = defineStore('admin', () => {
  const snapshot = ref<DashboardSnapshot | null>(null)
  const loading = ref(false)
  /**
   * 上一次拉取的错误。
   *
   * 单独存而不是直接弹 toast：看板是每 5 秒拉一次的，网络断开时
   * toast 会一秒一个堆满屏幕。放在页面上显示一行更合适。
   */
  const error = ref<string>('')
  /** 403/404 说明当前账号不是管理员，据此停止轮询并给出说明。 */
  const forbidden = ref(false)

  let timer: number | null = null

  const onlineCount = computed(
    () => Object.keys(snapshot.value?.online_users ?? {}).length,
  )

  async function fetchSnapshot() {
    loading.value = true
    try {
      const res = await http.get<DashboardSnapshot>('/api/admin/dashboard')
      snapshot.value = res.data
      error.value = ''
      forbidden.value = false
    } catch (e: any) {
      const status = e?.response?.status
      // 后端对非管理员统一返回 404（不返回 403，避免向普通用户
      // 宣告管理接口的存在），所以这两个码都按「无权限」处理
      if (status === 404 || status === 403) {
        forbidden.value = true
        stopPolling()
        error.value = '当前账号没有管理权限'
      } else {
        error.value = status
          ? `拉取失败（HTTP ${status}）`
          : '拉取失败，检查后端是否在运行'
      }
    } finally {
      loading.value = false
    }
  }

  function startPolling() {
    stopPolling()
    fetchSnapshot()
    timer = window.setInterval(fetchSnapshot, POLL_INTERVAL_MS)
  }

  /** 组件卸载时必须调用，否则定时器会在离开页面后继续发请求。 */
  function stopPolling() {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }

  // -----------------------------------------------------------------
  // 邀请码
  // -----------------------------------------------------------------

  const inviteKeys = ref<InviteKey[]>([])
  const keysLoading = ref(false)
  /**
   * 刚生成出来的明文密钥。
   *
   * 单独存一份而不是混进 inviteKeys 列表：它是唯一一次能看到明文的机会
   * （库里只有哈希），需要在界面上单独醒目地展示并提供复制。混在列表里
   * 一刷新就没了，而用户可能还没抄下来。
   */
  const freshKey = ref<InviteKey | null>(null)

  async function fetchInviteKeys() {
    keysLoading.value = true
    try {
      const res = await http.get<InviteKey[]>('/api/admin/invite-keys', {
        params: { limit: 50 },
      })
      inviteKeys.value = res.data
    } catch (e: any) {
      const status = e?.response?.status
      if (status === 404 || status === 403) forbidden.value = true
    } finally {
      keysLoading.value = false
    }
  }

  /**
   * 生成一个新码。返回值含明文，调用方负责让管理员复制走。
   *
   * 生成后顺手刷新列表，让新码出现在下面的记录里（列表里只有前缀）。
   */
  async function createInviteKey(note: string, validDays: number | null) {
    const res = await http.post<InviteKey>('/api/admin/invite-keys', {
      note: note || null,
      valid_days: validDays,
    })
    freshKey.value = res.data
    await fetchInviteKeys()
    return res.data
  }

  async function revokeInviteKey(id: number) {
    await http.delete(`/api/admin/invite-keys/${id}`)
    // 作废后本地那条的 status 还是 ACTIVE，必须重拉 ——
    // 否则界面上它看着仍然可用，而实际已经失效
    await fetchInviteKeys()
  }

  /** 关掉明文展示。用户点了「我已复制」之后调用。 */
  function dismissFreshKey() {
    freshKey.value = null
  }

  return {
    snapshot,
    loading,
    error,
    forbidden,
    onlineCount,
    fetchSnapshot,
    startPolling,
    stopPolling,

    inviteKeys,
    keysLoading,
    freshKey,
    fetchInviteKeys,
    createInviteKey,
    revokeInviteKey,
    dismissFreshKey,
  }
})
