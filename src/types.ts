export type Theme = 'light' | 'dark'

/** 便签/任务卡片的暖色色板 key */
export type TaskColor =
  | 'apricot' // 杏黄
  | 'terracotta' // 陶土
  | 'moss' // 苔绿
  | 'mist' // 雾蓝
  | 'rose' // 玫瑰
  | 'lavender' // 淡紫

export interface Task {
  id: string
  title: string
  /** 归属日期 YYYY-MM-DD */
  date: string
  /** 开始分钟（当日 6:00=360 起算），null 表示未排程（在收集箱） */
  start: number | null
  /** 持续分钟，默认 60 */
  duration: number
  color: TaskColor
  done: boolean
  note?: string
  createdAt: number
}

export interface DragState {
  taskId: string
  /** inbox = 从收集箱拖出；timeline = 在时间轴内拖动 */
  from: 'inbox' | 'timeline'
}

/** AI 添加功能：OpenAI 兼容接口配置（baseURL / apiKey / model 可配） */
export interface AiConfig {
  /** 例如 https://api.openai.com/v1，Mimo/其他厂商改成自己的地址 */
  baseUrl: string
  apiKey: string
  model: string
}

/** AI 识别出的任务结果（预览阶段，尚未入库） */
export interface AiDraft {
  title: string
  /** YYYY-MM-DD；无明确日期时为 null，落到收集箱 */
  date: string | null
  /** 当日分钟数（6:00=360）；无明确时间时为 null，不排程 */
  start: number | null
  duration: number
}
