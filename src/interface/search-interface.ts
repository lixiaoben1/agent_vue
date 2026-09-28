/**
 * 搜索结果项。字段名与后端 ConversationSearchResponse 对齐
 * （后端 Jackson 全局 SNAKE_CASE，所以这里也是下划线）。
 */
export interface ConversationSearchItem {
  conversation_id: string
  summary_content: string
  /** 命中消息的角色。null 表示只有会话标题命中、正文没命中。 */
  matched_role: 'HumanMessage' | 'AiMessage' | null
  /** 关键词周围的片段，已由服务端截取。null 同上。 */
  snippet: string | null
  matched_turn_index: number | null
  matched_created_at: string | null
  /** 该会话内命中的消息条数。只命中标题时为 0。 */
  match_count: number
}
