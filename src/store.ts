import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  AiConfig,
  DragState,
  RepeatRule,
  Task,
  TaskColor,
  Theme,
} from './types'
import { addDays, parseKey, toDateKey, todayKey } from './lib/date'

const COLOR_POOL: TaskColor[] = [
  'apricot',
  'terracotta',
  'moss',
  'mist',
  'rose',
  'lavender',
]

/** AI 默认配置（OpenAI 兼容），用户可在界面内修改，存本地 */
export const DEFAULT_AI_CONFIG: AiConfig = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
}

export function randomColor(): TaskColor {
  return COLOR_POOL[Math.floor(Math.random() * COLOR_POOL.length)]
}

const VALID_COLORS = new Set<string>(COLOR_POOL)
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * 白名单校验导入数据：仅接受结构正确的任务字段，
 * 丢弃/修正异常值，防止损坏或恶意备份文件破坏应用状态。
 */
export function sanitizeTasks(raw: unknown): Task[] | null {
  if (!Array.isArray(raw)) return null
  const out: Task[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null
    const o = item as Record<string, unknown>
    if (typeof o.title !== 'string' || typeof o.date !== 'string') return null
    if (!DATE_KEY_RE.test(o.date)) return null
    const start = o.start == null ? null : Number(o.start)
    if (o.start != null && !Number.isFinite(start)) return null
    const duration = Number(o.duration)
    if (!Number.isFinite(duration) || duration < 15) return null
    const color =
      typeof o.color === 'string' && VALID_COLORS.has(o.color)
        ? (o.color as TaskColor)
        : randomColor()
    const id = typeof o.id === 'string' && o.id ? o.id : genId()
    const done = o.done === true
    const createdAt = typeof o.createdAt === 'number' ? o.createdAt : Date.now()
    const tags = Array.isArray(o.tags)
      ? (o.tags as unknown[]).filter((v): v is string => typeof v === 'string')
      : undefined
    const repeat =
      o.repeat && typeof o.repeat === 'object'
        ? sanitizeRepeat(o.repeat)
        : undefined
    const lastGenerated =
      typeof o.lastGenerated === 'string' && DATE_KEY_RE.test(o.lastGenerated)
        ? o.lastGenerated
        : undefined
    out.push({
      id,
      title: o.title,
      date: o.date,
      start: start == null ? null : Math.round(Math.min(24 * 60, start)),
      duration: Math.round(Math.min(24 * 60, duration)),
      color,
      done,
      tags,
      repeat,
      lastGenerated,
      createdAt,
    })
  }
  return out
}

function sanitizeRepeat(raw: unknown): RepeatRule | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const freq = o.freq
  if (freq !== 'daily' && freq !== 'weekly' && freq !== 'monthly') return undefined
  const until = typeof o.until === 'string' && DATE_KEY_RE.test(o.until) ? o.until : null
  return { freq, until }
}

/** 返回 fromKey 之后紧随本次出现日期的下一个重复日期（不含 fromKey 本身） */
export function nextOccurrence(freq: RepeatRule['freq'], fromKey: string): string {
  const d = parseKey(fromKey)
  if (freq === 'daily') {
    d.setDate(d.getDate() + 1)
  } else if (freq === 'weekly') {
    d.setDate(d.getDate() + 7)
  } else {
    // monthly：保留"日"，跨月后若该日不存在则取当月最后一天
    const day = d.getDate()
    d.setDate(1)
    d.setMonth(d.getMonth() + 1)
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    d.setDate(Math.min(day, lastDay))
  }
  return toDateKey(d)
}

let idCounter = 0
function genId(): string {
  idCounter += 1
  return `t-${Date.now().toString(36)}-${idCounter}-${Math.random()
    .toString(36)
    .slice(2, 6)}`
}

interface PlannerState {
  tasks: Task[]
  theme: Theme
  selectedDate: string
  dragging: DragState | null
  focusTaskId: string | null
  aiConfig: AiConfig

  setTheme: (theme: Theme) => void
  setSelectedDate: (date: string) => void
  setDragging: (d: DragState | null) => void
  setFocusTaskId: (id: string | null) => void
  setAiConfig: (config: AiConfig) => void

  addTask: (p: {
    date: string
    title: string
    start?: number | null
    duration?: number
    color?: TaskColor
    tags?: string[]
    repeat?: RepeatRule
  }) => string
  updateTask: (id: string, patch: Partial<Task>) => void
  deleteTask: (id: string) => void
  toggleDone: (id: string) => void
  /** 把收集箱任务排到时间轴 */
  scheduleTask: (id: string, start: number, duration?: number) => void
  /** 拖放排序：把 fromId 移动到 toId 之前（仅限同一未排程集合内） */
  reorderTask: (fromId: string, toId: string) => void
  /** 当日未完成任务顺延到次日 */
  carryOver: (fromKey: string) => void
  /** 导入数据（覆盖全部） */
  importData: (tasks: Task[], theme?: Theme) => void
}

export const usePlanner = create<PlannerState>()(
  persist(
    (set) => ({
      tasks: [],
      theme: 'light',
      selectedDate: todayKey(),
      dragging: null,
      focusTaskId: null,
      aiConfig: DEFAULT_AI_CONFIG,

      setTheme: (theme) => set({ theme }),
      setSelectedDate: (selectedDate) => set({ selectedDate }),
      setDragging: (dragging) => set({ dragging }),
      setFocusTaskId: (focusTaskId) => set({ focusTaskId }),
      setAiConfig: (aiConfig) => set({ aiConfig }),

      addTask: (p) => {
        const id = genId()
        set((s) => ({
          tasks: [
            ...s.tasks,
            {
              id,
              title: p.title,
              date: p.date,
              start: p.start ?? null,
              duration: p.duration ?? 60,
              color: p.color ?? randomColor(),
              done: false,
              tags: p.tags,
              repeat: p.repeat,
              lastGenerated: p.repeat ? p.date : undefined,
              createdAt: Date.now(),
            },
          ],
        }))
        return id
      },

      updateTask: (id, patch) =>
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        })),

      deleteTask: (id) =>
        set((s) => ({
          tasks: s.tasks.filter((t) => t.id !== id),
          focusTaskId: s.focusTaskId === id ? null : s.focusTaskId,
        })),

      toggleDone: (id) =>
        set((s) => {
          const t = s.tasks.find((x) => x.id === id)
          if (!t) return s
          // 重复任务：勾选完成 → 推进到下一次出现；取消完成 → 恢复本日
          if (t.repeat) {
            const next = nextOccurrence(t.repeat.freq, t.date)
            // 已到最后一次（有 until 且 next 超期）→ 结束循环，只标记完成
            if (t.repeat.until && next > t.repeat.until) {
              return {
                tasks: s.tasks.map((x) =>
                  x.id === id ? { ...x, done: !x.done } : x,
                ),
              }
            }
            return {
              tasks: s.tasks.map((x) =>
                x.id === id
                  ? { ...x, done: false, date: next, lastGenerated: next }
                  : x,
              ),
            }
          }
          return {
            tasks: s.tasks.map((x) => (x.id === id ? { ...x, done: !x.done } : x)),
          }
        }),

      scheduleTask: (id, start, duration) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id
              ? {
                  ...t,
                  start: Math.round(start),
                  duration: Math.max(15, Math.round(duration ?? t.duration)),
                }
              : t,
          ),
        })),

      reorderTask: (fromId, toId) =>
        set((s) => {
          if (fromId === toId) return s
          const next = s.tasks.slice()
          const fromIdx = next.findIndex((t) => t.id === fromId)
          const toIdx = next.findIndex((t) => t.id === toId)
          if (fromIdx < 0 || toIdx < 0) return s
          // 限制：仅同一 date 且都未排程时才允许重排
          const from = next[fromIdx]
          const to = next[toIdx]
          if (from.date !== to.date || from.start != null || to.start != null) {
            return s
          }
          const [item] = next.splice(fromIdx, 1)
          const target = next.findIndex((t) => t.id === toId)
          next.splice(target, 0, item)
          return { tasks: next }
        }),

      carryOver: (fromKey) =>
        set((s) => {
          const toKey = addDays(fromKey, 1)
          // 移动：未完成事项从当天迁到次日，当天不再保留（重复任务自行推进，不随顺延）
          return {
            tasks: s.tasks.map((t) =>
              t.date === fromKey && !t.done && !t.repeat
                ? { ...t, date: toKey }
                : t,
            ),
          }
        }),

      importData: (tasks, theme) => set({ tasks, theme: theme ?? 'light' }),
    }),
    {
      name: 'day-planner-storage',
      partialize: (s) => ({
        tasks: s.tasks,
        theme: s.theme,
        aiConfig: s.aiConfig,
      }),
    },
  ),
)
