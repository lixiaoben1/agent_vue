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
