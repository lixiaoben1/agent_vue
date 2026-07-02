export interface ChatRequest {
  name: string
  user_id: string
  conversation_id: string
  message_id: string
  content: string
  attachments?: Attachment[]
  options?: ChatOptions
}
export interface Attachment {
  id: string
  type: string
  name: string
  url: string
}
export interface ChatOptions {
  model?: string
  temperature?: number
  maxTokens?: number
  stream?: boolean
}