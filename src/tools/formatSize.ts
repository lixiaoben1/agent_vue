/**
 * 字节数转人类可读的体积。
 *
 * 抽出来是因为上传面板、输入框待发送区、消息气泡三处都要显示体积，
 * 原先只有 UploadFile.vue 里有一份局部实现，另两处会各抄一遍。
 */
const UNITS = ['B', 'KB', 'MB', 'GB'] as const

export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'

  const k = 1024
  // 夹在数组范围内：50MB 上限下取不到 GB 以上，但 clamp 一次
  // 就不用担心以后放宽上限时这里越界取到 undefined
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    UNITS.length - 1,
  )
  const value = parseFloat((bytes / Math.pow(k, i)).toFixed(1))
  return `${value} ${UNITS[i] ?? 'B'}`
}
