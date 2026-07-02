import {defineStore} from "pinia";
import { ref } from "vue";
import axios from "axios";
import {useVerifyStore} from "@/stores/verify.ts";

interface HistoryList{
  summary_content:string
  conversation_id:string
}




export const useUserStore = defineStore('user_store', () => {
  const selectedItem = ref()
  const conversation_id_list = ref<HistoryList[]>([])
  const fetch_history_list = async () => {
    const verifyStore = useVerifyStore()
    try {
      if (!verifyStore.isVerified) {
        console.log("未认证，不允许获取历史list")
        return
      }
      const res = await axios.post(`/api/request_conversation_list`, {
        user_id: verifyStore.user_id,
        user_name: verifyStore.username,
      });
      console.log("获取历史list成功");
      conversation_id_list.value = (res.data || []).reverse()
    } catch (error: any) {
      console.error(`❌获取历史记录list失败:`, error);
    }
  };
  function appendNewConversation(contents:HistoryList) {
    conversation_id_list.value.unshift(contents);
  }

  return { selectedItem,fetch_history_list,conversation_id_list,appendNewConversation }
})