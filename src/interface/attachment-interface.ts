/**
 * 附件在前端的两种形态。
 *
 * 分成两个类型是因为它们的生命周期不同：ComposerAttachment 活在输入框上方的
 * 待发送区，会随上传进度不断变化；MessageAttachment 是发送那一刻的快照，
 * 要跟着消息一起进 IndexedDB，所以只留能安全持久化的字段
 * （不含 AbortController、不含进度百分比）。
 */

/**
 * 附件状态。注意 uploading 与 parsing 是两件事：
 *   uploading  文件正在往服务器传，有百分比
 *   parsing    已经传完并入队，后台 Docling + 向量化要跑几分钟，没有百分比
 * 把两者合成一个「处理中」会让用户在几分钟的静默里以为界面卡住了。
 */
export type AttachmentStatus =
  | 'uploading'
  | 'parsing'
  | 'ready'
  | 'duplicate'
  | 'error'

/** 随消息持久化的附件快照。 */
export interface MessageAttachment {
  name: string
  size: number
  status: AttachmentStatus
  /**
   * 解析任务 id。留着它是为了让已发出的消息也能跟上后续状态变化 ——
   * 用户发完消息文件可能还在解析，chip 上要能从「解析中」变成「已入库」。
   */
  task_id?: string
  error_message?: string
}
