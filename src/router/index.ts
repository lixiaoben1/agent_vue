import { createRouter, createWebHistory } from 'vue-router'
import SideBar from '../views/SideBar.vue'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'root',
    component: SideBar,
    children: [
      {
        path: 'chat/:uuid?',
        name: 'Chat',
        component: () => import('../views/MainChat.vue'),
      },
    ],
  },
  {
    /**
     * 管理看板。
     *
     * 放在 SideBar 之外（不是它的子路由）：看板不需要聊天界面 ——
     * 会话列表、新建对话、输入框在这里都没有用，留着只是占掉 16rem 宽度
     * 并让人以为这个页面还能顺手聊两句。
     *
     * 代价是从看板回对话要走一个显式的「返回」按钮，页面右上角有。
     *
     * 刻意**不加**路由守卫。守卫只能依据前端存的 role，而那个值来自
     * JWT claim 且用户能改 sessionStorage —— 一道能被绕过的检查会给人
     * 「已经保护住了」的错觉。真正的拦截在后端：每个 /api/admin/**
     * 请求由 AdminGuard 现查数据库确认角色，非管理员一律 404。
     * 所以这个页面允许任何人打开，但打开后只会看到「没有管理权限」。
     */
    path: '/admin',
    name: 'Admin',
    component: () => import('../views/AdminDashboard.vue'),
  },
  // {
  //   path: '/chat',
  //   name: 'about',
  //   component: () => import('../views/MainChat.vue'),
  // },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,

})

export default router
