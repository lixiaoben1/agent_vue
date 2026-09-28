import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { getToken } from '@/api/http'
import { useIngestStore } from '@/stores/ingest_store'
import { useChatStore } from '@/stores/chat_store'
import type {
  AttachmentStatus,
  MessageAttachment,
} from '@/interface/attachment-interface'

/**
 * 待发送区里的一个附件。
 *
 * 与 MessageAttachment 的差别是这里带着上传期的瞬时状态（进度、xhr），
 * 那些字段不能进 IndexedDB —— xhr 不可序列化，进度在重启后也无意义。
 */
export interface ComposerAttachment {
  /** 本地 id。task_id 要等上传成功才有，而列表从选中文件那一刻就要渲染。 */
  id: string
  name: string
  size: number
  status: AttachmentStatus
  /** 0–100，仅 uploading 期间有意义。 */
  progress: number
  task_id?: string
  error_message?: string
}

/** 与后端 ALLOWED_FILE_TYPES 一致。前端先拦一道，让用户不必等一趟请求。 */
const ALLOWED_EXTENSIONS = ['txt', 'pdf', 'md', 'docx']
/** 与后端 MAX_UPLOAD_SIZE_MB=50 一致。前端更严只是早点告知，更松会白跑一趟拿 413。 */
const MAX_FILE_SIZE = 50 * 1024 * 1024
/** 与后端 MAX_FILES_PER_REQUEST 一致。 */
const MAX_ATTACHMENTS = 10

/** 上传成功的响应项，对应 Java 的 IngestTaskResponse（SNAKE_CASE）。 */
interface UploadedTask {
  task_id: string
  file_name: string
  status: string
}

/**
 * 输入框的待发送区：附件的唯一状态归属地。
 *
 * === 为什么必须是 store，而不是 UploadFile.vue 的组件内状态 ===
 *
 * PrimeVue 的 Popover 把插槽内容放在 v-if 里（popover/index.mjs 的 render），
 * 面板一关整棵子树就卸载。原实现把文件列表和上传都交给 FileUpload 组件自己管，
 * 于是「点空白处关掉面板」等于销毁了 FileUpload —— 已选文件没了，
 * 它内部那个 XMLHttpRequest 也随之失去归属（浏览器可能仍在传，但没人再看
 * 它的 progress 事件），重新打开面板看到的是一个空面板。用户完全无法判断
 * 文件到底传上去了没有。
 *
 * 把 File 对象和 xhr 都提到 store 里之后，面板只是这份状态的一个视图，
 * 关掉它不影响任何在途上传。
 *
 * === 为什么自己发 XHR，不用 FileUpload 的内置上传 ===
 *
 * 内置上传的 xhr 建在组件实例上，且进度只通过组件内部的 progress 状态暴露。
 * 组件一卸载这些就都拿不到了。自己发还顺带解决了两件事：
 *   - 一个文件一个请求，某个文件失败不影响其它文件（内置实现是一次
 *     多文件请求，后端一个文件类型不合法就整个 400）
 *   - 能给出每个文件各自的进度，而不是一整批的合计进度
 */
export const useComposerStore = defineStore('composer', () => {
  const attachments = ref<ComposerAttachment[]>([])
  /** 在途请求，按附件 id 存。取消上传要能找到对应那一个。 */
  const xhrs = new Map<string, XMLHttpRequest>()

  const hasAttachments = computed(() => attachments.value.length > 0)
  const isUploading = computed(() =>
    attachments.value.some((item) => item.status === 'uploading'),
  )
  /**
   * 还有文件在后台解析。
   *
   * 与 isUploading 分开：上传是几秒，解析是几分钟。发送流程会等上传，
   * 但不能等解析 —— 那要让用户对着按钮转好几分钟。所以解析中时提示
   * 用户「文件还没准备好」，让他自己决定是等还是先发。
   *
   * 这一步是必要的：文档内容要等解析完写进 session_document 之后，
   * 后端才取得到。解析未完成就发送，模型收不到文件内容，
   * 而用户以为它看到了 —— 那会得到一个基于臆测的回答。
   */
  const isParsing = computed(() =>
    attachments.value.some((item) => item.status === 'parsing'),
  )

  function find(id: string) {
    return attachments.value.find((item) => item.id === id)
  }

  /**
   * 前端侧校验。返回错误文案，null 表示通过。
   *
   * 这里拒绝的都是后端也会拒绝的情况，纯粹为了让用户立刻知道，
   * 而不是等文件传完几十兆之后才收到 400。
   */
  function validate(file: File): string | null {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return `不支持的文件类型，仅支持 ${ALLOWED_EXTENSIONS.join(' / ')}`
    }
    if (file.size > MAX_FILE_SIZE) {
      return '文件超过 50MB'
    }
    if (file.size === 0) {
      return '文件是空的'
    }
    return null
  }

  /**
   * 加入文件并立刻开始上传。
   *
   * 立刻上传（而不是等用户点一个 Upload 按钮）是这次改动的一部分：
   * 用户的心智模型是「选了文件就在传了」，多一个按钮只会让人以为
   * 选完就完事了，然后发消息时文件根本还没上去。
   *
   * @returns 被拒绝的文件及原因，调用方据此提示
   */
  function addFiles(files: File[]): Array<{ name: string; reason: string }> {
    const rejected: Array<{ name: string; reason: string }> = []

    for (const file of files) {
      if (attachments.value.length >= MAX_ATTACHMENTS) {
        rejected.push({ name: file.name, reason: `一条消息最多 ${MAX_ATTACHMENTS} 个文件` })
        continue
      }
      // 同名同大小视为同一个文件。用户点两次「选择文件」很容易选到同一个
      const duplicated = attachments.value.some(
        (item) => item.name === file.name && item.size === file.size,
      )
      if (duplicated) {
        rejected.push({ name: file.name, reason: '已经在列表里了' })
        continue
      }

      const reason = validate(file)
      if (reason) {
        rejected.push({ name: file.name, reason })
        continue
      }

      const attachment: ComposerAttachment = {
        id: uuidv4(),
        name: file.name,
        size: file.size,
        status: 'uploading',
        progress: 0,
      }
      attachments.value.push(attachment)
      upload(attachment.id, file)
    }

    return rejected
  }

  /**
   * 单文件上传。用 XMLHttpRequest 而不是 axios/fetch —— 只有它能给出
   * 上传方向的进度事件（fetch 的 ReadableStream 上传在浏览器里仍不通用，
   * axios 的 onUploadProgress 底层也是 XHR）。
   */
  function upload(id: string, file: File) {
    const xhr = new XMLHttpRequest()
    xhrs.set(id, xhr)

    const formData = new FormData()
    // 字段名必须是 files，与后端 @RequestParam("files") 对应
    formData.append('files', file)

    xhr.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable) return
      const item = find(id)
      if (!item) return
      // 上限 99：100% 要留给「服务器已确认收到」。传完最后一个字节到
      // 后端落盘完成之间还有一段时间，提前显示 100% 然后卡住最让人困惑
      item.progress = Math.min(99, Math.round((event.loaded / event.total) * 100))
    })

    xhr.addEventListener('load', () => {
      xhrs.delete(id)
      const item = find(id)
      if (!item) return

      if (xhr.status >= 200 && xhr.status < 300) {
        onUploaded(item, xhr.responseText)
      } else {
        item.status = 'error'
        item.error_message = extractError(xhr)
      }
    })

    xhr.addEventListener('error', () => {
      xhrs.delete(id)
      const item = find(id)
      if (!item) return
      item.status = 'error'
      item.error_message = '网络错误，请重试'
    })

    // abort 不写成错误：那是用户自己点的移除，此时附件已经从列表里删掉了
    xhr.addEventListener('abort', () => {
      xhrs.delete(id)
    })

    xhr.open('POST', '/api/upload')
    // XHR 不走 axios 拦截器，Authorization 必须手工加，少了它一律 401
    const token = getToken()
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    }
    xhr.send(formData)
  }

  /**
   * 上传成功。注意「上传成功」不等于「可以检索了」：
   * 后端只是落盘 + 写一行 PENDING + 投队列，解析要几分钟。
   * 所以这里转到 parsing 而不是 ready，并把 task_id 交给 ingest store 去轮。
   */
  function onUploaded(item: ComposerAttachment, responseText: string) {
    let tasks: UploadedTask[]
    try {
      tasks = JSON.parse(responseText)
    } catch {
      item.status = 'error'
      item.error_message = '响应解析失败'
      return
    }

    const task = tasks[0]
    if (!task) {
      item.status = 'error'
      item.error_message = '服务端未返回任务信息'
      return
    }

    item.progress = 100
    item.task_id = task.task_id

    if (task.status === 'DUPLICATE') {
      // 此前已入库，没有解析任务要等 —— 对用户来说这与「已就绪」等效
      item.status = 'duplicate'
      return
    }

    item.status = 'parsing'
    // 交给 ingest store 轮询。它已经处理了终态停止、404、页面刷新后续轮
    useIngestStore().track(task.task_id, task.file_name)
  }

  /** 从 xhr 里挖出一句能给用户看的话。 */
  function extractError(xhr: XMLHttpRequest): string {
    if (xhr.status === 401) return '登录已过期，请重新登录'
    if (xhr.status === 413) return '文件超过服务器限制'
    try {
      return JSON.parse(xhr.responseText)?.message ?? '上传失败，请重试'
    } catch {
      // 错误体不是 JSON（比如 nginx 的 413 页面），用默认文案
      return '上传失败，请重试'
    }
  }

  /** 移除一个附件。在途请求要 abort，否则文件还会继续往上传。 */
  function remove(id: string) {
    const xhr = xhrs.get(id)
    if (xhr) {
      xhr.abort()
      xhrs.delete(id)
    }
    const item = find(id)
    if (item?.task_id) {
      // 已经在解析队列里的任务不撤（后端没有撤单接口），只是不再跟踪它。
      // 文件确实会被解析入库 —— 对 RAG 来说无害，用户下次也能检索到
      useIngestStore().dismiss(item.task_id)
    }
    attachments.value = attachments.value.filter((one) => one.id !== id)
  }

  /** 重试一个失败的附件需要原始 File，而 File 不留在 store 里 —— 让用户重选。 */
  function clear() {
    xhrs.forEach((xhr) => xhr.abort())
    xhrs.clear()
    attachments.value = []
  }

  /**
   * 等所有在途上传落地（成功或失败）。
   *
   * 用户可能在文件还在传的时候就按了发送。此时不该拒绝他 ——
   * 拒绝等于让他自己盯着进度条等。这里让发送流程等一下，
   * 界面上按钮会显示等待态。
   *
   * 必须有超时上限：XHR 默认不设 timeout，连接卡死（比如切了网络）时
   * load / error 两个事件都不会来，isUploading 就永远是 true ——
   * 发送按钮会一直转圈，用户连重试都做不到。超时后按当前状态照常发送，
   * 卡住的那个附件此时是 uploading 状态，会被当作没传成功处理。
   */
  function waitForUploads(timeoutMs = 120_000): Promise<void> {
    if (!isUploading.value) return Promise.resolve()
    return new Promise((resolve) => {
      const finish = () => {
        stop()
        clearTimeout(timer)
        resolve()
      }
      const timer = window.setTimeout(() => {
        // 卡住的请求要断掉，否则它还占着连接，且之后回来的 load 事件
        // 会把一个用户已经发过的附件改成 parsing
        attachments.value
          .filter((item) => item.status === 'uploading')
          .forEach((item) => {
            xhrs.get(item.id)?.abort()
            xhrs.delete(item.id)
            item.status = 'error'
            item.error_message = '上传超时，请重试'
          })
        finish()
      }, timeoutMs)
      const stop = watch(isUploading, (uploading) => {
        if (!uploading) finish()
      })
    })
  }

  /**
   * 取出随消息持久化的快照，并清空待发送区。
   *
   * 只带能安全序列化的字段：progress 与 xhr 都留在 store 里。
   *
   * 排掉 error 和 uploading 两种状态：
   *   - error：那个文件根本没传上去，显示在已发出的消息里等于骗用户
   *   - uploading：调用方已经 await 过 waitForUploads，还停在这个状态
   *     只有一种来源 —— 等待超时。这种附件没有 task_id，进了消息就会
   *     永远停在「上传中 x%」，因为不再有任何东西会更新它
   */
  function takeForSend(): MessageAttachment[] {
    const snapshot: MessageAttachment[] = attachments.value
      .filter((item) => item.status !== 'error' && item.status !== 'uploading')
      .map((item) => ({
        name: item.name,
        size: item.size,
        status: item.status,
        ...(item.task_id ? { task_id: item.task_id } : {}),
      }))
    clear()
    return snapshot
  }

  /**
   * 把解析进度同步到两处：待发送区，以及已经发出去的消息。
   *
   * 放在这个 store 里是为了不让 chat store 和 ingest store 互相知道对方
   * （那会形成一条没必要的依赖边）。这个 watch 建在 pinia 的作用域里，
   * 跟应用同寿命 —— 不会因为某个组件卸载而停掉，而这正是需要的：
   * 用户可能在解析期间切到别的会话。
   */
  const ingestStore = useIngestStore()
  const chatStore = useChatStore()
  watch(
    () => ingestStore.tasks,
    (tasks) => {
      for (const task of Object.values(tasks)) {
        const status = mapIngestStatus(task.status)
        if (!status) continue

        const item = attachments.value.find((one) => one.task_id === task.task_id)
        if (item) {
          item.status = status
          item.error_message = task.error_message ?? undefined
        }
        chatStore.updateAttachmentStatus(
          task.task_id,
          status,
          task.error_message ?? undefined,
        )
      }
    },
    { deep: true },
  )

  /** 后端任务状态 → 附件状态。PENDING/RUNNING 对用户都是「解析中」。 */
  function mapIngestStatus(status: string): AttachmentStatus | null {
    switch (status) {
      case 'PENDING':
      case 'RUNNING':
        return 'parsing'
      case 'SUCCESS':
        return 'ready'
      case 'DUPLICATE':
        return 'duplicate'
      case 'FAILED':
        return 'error'
      default:
        return null
    }
  }

  return {
    attachments,
    hasAttachments,
    isUploading,
    isParsing,
    addFiles,
    remove,
    clear,
    waitForUploads,
    takeForSend,
    MAX_ATTACHMENTS,
    ALLOWED_EXTENSIONS,
  }
})
