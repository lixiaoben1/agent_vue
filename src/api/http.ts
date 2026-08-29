/**
 * 全局 axios 实例。所有业务请求都该用它，不要直接 import axios。
 *
 * 它做两件裸 axios 不做的事：
 *   1. 自动带上 JWT（Authorization: Bearer）
 *   2. 收到 401 时清掉本地身份并弹出登录框
 *
 * === 为什么现在需要 token ===
 *
 * 重构前身份完全由前端自证：登录成功只拿到一个 user_id 存进 sessionStorage，
 * 之后每个请求把 user_id 放进请求体，后端照单全收 —— 改一个数字就能读写
 * 别人的会话。现在后端（Spring Boot）从 JWT 里取身份，请求体里的
 * user_id 字段已经不再被采信。
 */
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

/** sessionStorage 的键名。与 pinia 持久化用的键分开，token 单独存。 */
const TOKEN_KEY = 'agent_jwt'

export function getToken(): string {
  return sessionStorage.getItem(TOKEN_KEY) ?? ''
}

export function setToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY)
}

/**
 * 401 的处理回调，由 main.ts 注入。
 *
 * 这里不直接 import useVerifyStore：那会形成
 * http.ts → verify store → http.ts 的循环依赖。循环依赖在 Vite 下不一定
 * 报错，而是让其中一个模块拿到 undefined —— 症状是「axios 实例莫名是空的」。
 */
let onUnauthorized: (() => void) | null = null

export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler
}

export const http = axios.create({
  // 不设 baseURL：开发期由 vite proxy 把 /api 转给后端，
  // 生产期同源部署。写死地址会让两种环境必须改代码
  timeout: 30_000,
})

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

http.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // token 过期或无效。清掉本地身份，否则界面会显示「已登录」
      // 但每个请求都失败 —— 用户看不出该重新登录
      clearToken()
      onUnauthorized?.()
    }
    return Promise.reject(error)
  },
)

export default http
