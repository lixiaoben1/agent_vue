import {defineStore} from "pinia";
import {reactive, ref} from "vue";
import http from "@/api/http";
import {useVerifyStore} from "@/stores/verify.ts";

interface HistoryList{
  summary_content:string
  conversation_id:string
}

interface HumanInTheLoop{
  need_human_in_the_loop:boolean,
  tool_name:string,
  tool_description:string,
  tool_args:Record<string, any>,
  allowed_decisions:string[],
}




export const useConversationStore = defineStore('conversation_store', () => {
  const selectedItem = ref()
  const conversation_id_list = ref<HistoryList[]>([])
  const human_in_the_loop: HumanInTheLoop = reactive({
    need_human_in_the_loop:false,
    tool_name:"",
    tool_description:"",
    tool_args:{},
    allowed_decisions:[],
  })
  const fetch_history_list = async () => {
    const verifyStore = useVerifyStore()
    try {
      if (!verifyStore.isVerified) {
        console.log("未认证，不允许获取历史list")
        return
      }
      // POST /api/request_conversation_list → GET /api/conversations
      //
      // 请求体里的 user_id / user_name 去掉了：身份由 Authorization 头里的
      // JWT 提供，后端不再采信请求体里的身份字段。
      const res = await http.get(`/api/conversations`);
      console.log("获取历史list成功");
      // 后端已按 id 倒序返回（最新在前），不再需要 reverse()。
      // 留着 reverse 会把顺序反过来，表现为「新会话跑到列表最底下」
      conversation_id_list.value = res.data || []
    } catch (error: any) {
      console.error(`❌获取历史记录list失败:`, error);
    }
  };
  function appendNewConversation(contents:HistoryList) {
    conversation_id_list.value.unshift(contents);
  }

  /**
   * 更新会话标题。
   *
   * 首轮的摘要由模型生成、随 done 事件回传，比新建会话时临时填的
   * 用户输入原文可读得多（原文可能是一整段话）。
   */
  function updateSummary(conversationId: string, summary: string) {
    const target = conversation_id_list.value.find(
      (item) => item.conversation_id === conversationId,
    );
    if (target) {
      target.summary_content = summary;
    }
  }

  /**
   * 从列表里移掉一个会话。
   *
   * 本地移除而不是重新拉一次列表：删除接口返回 204 时后端已经删完了，
   * 再发一次请求只是多一个来回。同时把 selectedItem 清掉 ——
   * 留着一个指向已删会话的选中值会让 Listbox 高亮一个不存在的项。
   */
  function removeConversation(conversationId: string) {
    conversation_id_list.value = conversation_id_list.value.filter(
      (item) => item.conversation_id !== conversationId,
    );
    if (selectedItem.value === conversationId) {
      selectedItem.value = undefined;
    }
  }

  return { selectedItem,fetch_history_list,conversation_id_list,appendNewConversation,updateSummary,removeConversation,human_in_the_loop }
}, {
  persist: {
    storage: sessionStorage,
    pick: ['human_in_the_loop'],
  }
})