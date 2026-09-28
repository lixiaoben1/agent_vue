import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import http, { clearToken, getToken, setToken } from '@/api/http';

/**
 * 登录响应。对应 Java 的 LoginResponse。
 *
 * 与重构前的差别：**没有 status 字段了**。原接口无论成败都返回 200，
 * 靠一个 status 字符串（'success' / 'username not exist' / 'password error'）
 * 区分，前端要逐个字符串比对。现在失败就是 HTTP 401，走 catch 分支。
 *
 * 顺带一个安全上的改进：不再区分「用户名不存在」和「密码错误」——
 * 那等于提供了一个用户名枚举接口。现在统一是「用户名或密码错误」。
 */
interface LoginResponse {
  token: string;
  user_id: string;
  user_name: string;
  /**
   * USER 或 ADMIN。
   *
   * 只用来决定要不要显示管理入口，**不是权限**。把它改成 ADMIN 也只是
   * 让自己多看到一个按钮 —— 每个管理接口都会由后端 AdminGuard 现查
   * 数据库拦下来，非管理员一律 404。
   */
  role: string;
  expires_in_minutes: number;
}

export const useVerifyStore = defineStore('verify', () => {
  const visible = ref(false);
  const username = ref<string>('需要登陆');
  const user_id = ref<string>('');
  const password = ref<string>('');
  const isVerified = ref(false);
  /** 见 LoginResponse.role 的注释：只控制入口可见性，不是权限。 */
  const role = ref<string>('USER');
  const isAdmin = computed(() => role.value === 'ADMIN');

  function requireVerify() {
    visible.value = true;
  }

  /**
   * 登录。成功后 token 存进 sessionStorage，由 http 拦截器自动带上。
   *
   * 失败会抛出 axios 错误（401），调用方在 catch 里处理 ——
   * 不再返回 status 字符串让调用方比对。
   */
  async function verify(name: string, pwd: string): Promise<LoginResponse> {
    const result = await http.post<LoginResponse>('/api/auth/login', {
      user_name: name,
      password: pwd,
    });
    return applySession(result.data);
  }

  /**
   * 凭邀请码注册。成功后直接就是登录态 —— 后端注册接口会一并签发 token，
   * 让用户注册完还要再手工登录一次是多余的一步。
   *
   * 失败抛 axios 错误（400），调用方在 catch 里按 message 提示：
   * 用户名被占、邀请码无效/已用/已过期/已作废，这几种原因对用户意味着
   * 不同的下一步，所以后端是分开给文案的。
   */
  async function register(
    name: string,
    pwd: string,
    inviteKey: string,
  ): Promise<LoginResponse> {
    const result = await http.post<LoginResponse>('/api/auth/register', {
      user_name: name,
      password: pwd,
      invite_key: inviteKey,
    });
    return applySession(result.data);
  }

  /** 登录与注册的成功路径完全相同，抽出来免得两处各写一遍漏掉某个字段。 */
  function applySession(data: LoginResponse): LoginResponse {
    setToken(data.token);
    username.value = data.user_name;
    user_id.value = data.user_id;
    role.value = data.role ?? 'USER';
    isVerified.value = true;
    visible.value = false;
    return data;
  }

  /**
   * 用已有 token 换回身份，供刷新页面后恢复登录态。
   *
   * 必须有这一步：isVerified 是持久化到 sessionStorage 的，但 token 可能
   * 已经过期（JWT_TTL_MINUTES 默认 120 分钟）。不校验的话界面显示已登录，
   * 而每个请求都 401 —— 用户只看到「什么都加载不出来」。
   */
  async function restoreSession(): Promise<boolean> {
    if (!getToken()) {
      isVerified.value = false;
      return false;
    }
    try {
      const result = await http.get<{
        user_id: string;
        user_name: string;
        role: string;
      }>('/api/auth/me');
      username.value = result.data.user_name;
      user_id.value = result.data.user_id;
      role.value = result.data.role ?? 'USER';
      isVerified.value = true;
      return true;
    } catch {
      // 401 时拦截器已经清了 token，这里只需同步本地状态
      logout();
      return false;
    }
  }

  function logout() {
    clearToken();
    isVerified.value = false;
    username.value = '需要登陆';
    user_id.value = '';
    password.value = '';
    // 角色必须一起清：留着 ADMIN 会让下一个在同一浏览器登录的普通用户
    // 看到管理入口。他点进去会被后端 404 拦住，但那是个纯粹的困惑来源
    role.value = 'USER';
  }

  return {
    visible,
    requireVerify,
    verify,
    register,
    restoreSession,
    username,
    password,
    user_id,
    isVerified,
    role,
    isAdmin,
    logout,
  };
}, {
  persist: {
    storage: sessionStorage,
    // token 不在这里持久化 —— 它由 api/http.ts 单独管理。
    // 放进 pinia 的持久化里会让它跟着 store 的结构变化走，
    // 而拦截器需要一个稳定的读取位置
    pick: ['username', 'user_id', 'isVerified', 'role'],
  }
});
