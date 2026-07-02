export function useThrottleFn<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastExecTime = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  return function (this: any, ...args: Parameters<T>) {
    const now = Date.now()
    const remaining = delay - (now - lastExecTime)
    if (remaining <= 0) {
      // ✅ 超过间隔，立即执行
      if (timer) {clearTimeout(timer)
        timer = null}
      lastExecTime = now
      fn.apply(this, args)
    } else if (!timer) {
      // ✅ 间隔内未执行过，设置尾调用定时器
      // 保证最后一次触发不会被丢弃
      timer = setTimeout(() => {
        lastExecTime = Date.now()
        timer = null
        fn.apply(this, args)
      }, remaining)}}}