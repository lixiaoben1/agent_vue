import { defineStore } from 'pinia';
import { ref } from 'vue';
import axios from "axios";


interface VerifyResponse {
  status: string;
  user_id: string;
  user_name: string;
}

export const useVerifyStore = defineStore('verify', () => {
  const visible = ref(false);
  const username = ref<string>('');
  const user_id = ref<string>('');
  const password = ref<string>('');
  const isVerified = ref(false);

  function requireVerify() {
    visible.value = true;
  }
  async function verify(username:string,password:string): Promise<VerifyResponse> {
    const result = await axios.post('/api/request_user_verify', {
      user_name : username,
      password: password,
    })

    return result.data
  }

  function logout() {
    isVerified.value = false;
    username.value = '';
    user_id.value = '';
    password.value = '';
  }

  return {visible, requireVerify,verify, username,password,user_id,isVerified,logout};
}, {
  // ✅ 只需声明配置，无需手写 watch/read
  persist: {
    storage: sessionStorage,       // 指定为 sessionStorage
    pick: ['username', 'user_id', 'isVerified'],
  }
});