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
