interface BaseEvent {
  type: EventType
  conversationId: string
  messageId: string
  responseTime: string
}
export type EventType =
  | "start"
  | "reasoning"
  | "content"
  | "tool_call"
  | "tool_result"
  | "citation"
  | "file"
  | "done"
  | "error"

export interface StartEvent extends BaseEvent {
  type: "start"
}
export interface ReasoningEvent extends BaseEvent {
  type: "reasoning"
  data: string
}
export interface ContentEvent extends BaseEvent {
  type: "content"
  data: string
}
export interface ToolCallEvent extends BaseEvent {
  type: "tool_call"
  toolCallId: string
  toolName: string
  arguments: Record<string, any>
}
export interface ToolResultEvent extends BaseEvent {
  type: "tool_result"
  toolCallId: string
  result: any
}
export interface CitationEvent extends BaseEvent {
  type: "citation"
  citations: Citation[]
}
export interface Citation extends BaseEvent {
  id: string
  title: string
  source: string
  url?: string
}

export interface FileEvent extends BaseEvent {
  type: "file"
  file: {
    name: string
    url: string
    size: number
  }
}

export interface DoneEvent extends BaseEvent {
  type: "done"
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export interface ErrorEvent extends BaseEvent {
  type: "error"
  message: string
}

// export type ChatResponse =
//   | StartEvent
//   | ReasoningEvent
//   | ContentEvent
//   | ToolCallEvent
//   | ToolResultEvent
//   | CitationEvent
//   | FileEvent
//   | DoneEvent
//   | ErrorEvent

export interface  ChatResponseInterface{
  turn_index: number
  role: 'HumanMessage' | 'AiMessage'
  content: string
  reasoning?:string
  created_at?: string
  conversation_id: string
}

export interface  ResponseConversationIdInterface{
  summary_content: string
  conversation_id: string
}
