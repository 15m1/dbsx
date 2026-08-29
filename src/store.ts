import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  AiConfig,
  DragState,
  Note,
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

/** 从文本中解析 #标签（支持中英文，空格/#/换行/标点结尾） */
export function extractTags(text: string): string[] {
  if (!text) return []
  const matches = text.match(/#([^\s#，,。.!！?？;；:：、\n\r\t]{1,30})/g)
  if (!matches) return []
  const set = new Set<string>()
  for (const m of matches) {
    const tag = m.slice(1).trim()
    if (tag) set.add(tag)
  }
  return [...set]
}

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

/** Notes 白名单校验导入 */
export function sanitizeNotes(raw: unknown): Note[] | null {
  if (!Array.isArray(raw)) return null
  const out: Note[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const text = typeof o.text === 'string' ? o.text : ''
    if (!text) continue
    const color =
      typeof o.color === 'string' && VALID_COLORS.has(o.color)
        ? (o.color as TaskColor)
        : randomColor()
    const pinned = o.pinned === true
    const id = typeof o.id === 'string' && o.id ? o.id : genId()
    const createdAt =
      typeof o.createdAt === 'number' && Number.isFinite(o.createdAt)
        ? o.createdAt
        : Date.now()
    const updatedAt =
      typeof o.updatedAt === 'number' && Number.isFinite(o.updatedAt)
        ? o.updatedAt
        : undefined
    const deletedAt =
      typeof o.deletedAt === 'number' && Number.isFinite(o.deletedAt)
        ? o.deletedAt
        : undefined
    const tags = Array.isArray(o.tags)
      ? (o.tags as unknown[])
          .filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length <= 30)
          .slice(0, 20)
      : extractTags(text)
    out.push({ id, text, color, pinned, tags, createdAt, updatedAt, deletedAt })
  }
  return out
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
  notes: Note[]
  /** 回收站（被删除的便签，30 天内可恢复） */
  trashNotes: Note[]

  setTheme: (theme: Theme) => void
  setSelectedDate: (date: string) => void
  setDragging: (d: DragState | null) => void
  setFocusTaskId: (id: string | null) => void
  setAiConfig: (config: AiConfig) => void

  addNote: (text: string, color?: TaskColor) => string
  updateNote: (id: string, patch: Partial<Note>) => void
  /** 删除便签：移入回收站（可恢复） */
  deleteNote: (id: string) => void
  /** 恢复回收站里的便签 */
  restoreNote: (id: string) => void
  /** 从回收站彻底删除 */
  purgeNote: (id: string) => void
  /** 清空回收站 */
  emptyTrash: () => void
  /** 清理超过 30 天的回收站便签 */
  pruneTrash: () => void
  /** 拖拽排序：把 fromId 移到 toId 之前（null=移到末尾）；仅同组（同 pinned）生效 */
  reorderNotes: (fromId: string, toId: string | null) => void
  /** 整体重排某组（置顶/普通）便签：按 orderedIds 顺序；仅同组生效，异组相对位置不变 */
  setNoteOrder: (orderedIds: string[]) => void
  /** 批量删除：一批便签移入回收站 */
  bulkTrashNotes: (ids: string[]) => void
  /** 批量置顶/取消置顶 */
  bulkSetPinned: (ids: string[], pinned: boolean) => void
  /** 批量换色 */
  bulkSetColor: (ids: string[], color: TaskColor) => void

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
  /** 导入数据（覆盖全部）；notes/trashNotes 可选 */
  importData: (tasks: Task[], theme?: Theme, notes?: Note[], trashNotes?: Note[]) => void
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
      notes: [],
      trashNotes: [],

      setTheme: (theme) => set({ theme }),
      setSelectedDate: (selectedDate) => set({ selectedDate }),
      setDragging: (dragging) => set({ dragging }),
      setFocusTaskId: (focusTaskId) => set({ focusTaskId }),
      setAiConfig: (aiConfig) => set({ aiConfig }),

      addNote: (text, color) => {
        const id = genId()
        const now = Date.now()
        const tags = extractTags(text)
        set((s) => ({
          notes: [
            {
              id,
              text,
              color: color ?? randomColor(),
              pinned: false,
              createdAt: now,
              updatedAt: now,
              tags,
            },
            ...s.notes,
          ],
        }))
        return id
      },
      updateNote: (id, patch) =>
        set((s) => ({
          notes: s.notes.map((n) => {
            if (n.id !== id) return n
            const next: Note = { ...n, ...patch }
            // 如果修改了 text，重新解析 tags + 更新 updatedAt
            if (patch.text !== undefined) {
              next.tags = extractTags(patch.text)
              next.updatedAt = Date.now()
            } else if (Object.keys(patch).length > 0) {
              next.updatedAt = Date.now()
            }
            return next
          }),
        })),
      deleteNote: (id) =>
        set((s) => {
          const target = s.notes.find((n) => n.id === id)
          if (!target) return s
          const trashed: Note = { ...target, deletedAt: Date.now() }
          return {
            notes: s.notes.filter((n) => n.id !== id),
            trashNotes: [trashed, ...s.trashNotes],
          }
        }),

      restoreNote: (id) =>
        set((s) => {
          const target = s.trashNotes.find((n) => n.id === id)
          if (!target) return s
          const { deletedAt: _del, ...rest } = target
          return {
            trashNotes: s.trashNotes.filter((n) => n.id !== id),
            notes: [rest, ...s.notes],
          }
        }),

      purgeNote: (id) =>
        set((s) => ({
          trashNotes: s.trashNotes.filter((n) => n.id !== id),
        })),

      emptyTrash: () => set({ trashNotes: [] }),

      pruneTrash: () =>
        set((s) => {
          const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
          const remaining = s.trashNotes.filter((n) => (n.deletedAt ?? 0) >= cutoff)
          return remaining.length === s.trashNotes.length ? s : { trashNotes: remaining }
        }),

      reorderNotes: (fromId, toId) =>
        set((s) => {
          const fromIdx = s.notes.findIndex((n) => n.id === fromId)
          if (fromIdx < 0) return s
          const from = s.notes[fromIdx]
          const next = s.notes.slice()
          next.splice(fromIdx, 1)
          if (toId === null) {
            // 移到同组末尾
            let lastIdx = next.length
            for (let i = next.length - 1; i >= 0; i--) {
              if (next[i].pinned === from.pinned) {
                lastIdx = i + 1
                break
              }
            }
            next.splice(lastIdx, 0, from)
          } else {
            const toIdx = next.findIndex((n) => n.id === toId)
            if (toIdx < 0) return s
            // 仅同组内排序（置顶/普通不能互拖）
            if (next[toIdx].pinned !== from.pinned) return s
            next.splice(toIdx, 0, from)
          }
          return { notes: next }
        }),

      setNoteOrder: (orderedIds) =>
        set((s) => {
          if (!orderedIds.length) return s
          const first = s.notes.find((n) => n.id === orderedIds[0])
          if (!first) return s
          const pinned = first.pinned
          const byId = new Map(s.notes.map((n) => [n.id, n]))
          const ordered = orderedIds
            .map((id) => byId.get(id))
            .filter((n): n is Note => !!n)
          if (ordered.length !== orderedIds.length) return s
          const cur = s.notes.filter((n) => n.pinned === pinned).map((n) => n.id)
          if (cur.length !== ordered.length) return s
          const same = cur.every((id, i) => id === ordered[i])
          if (same) return s
          // 遍历原数组：目标组卡片替换为重排后的顺序，异组保持原相对位置
          const next: Note[] = []
          let idx = 0
          for (const n of s.notes) {
            if (n.pinned === pinned) {
              if (idx < ordered.length) next.push(ordered[idx++])
            } else {
              next.push(n)
            }
          }
          if (idx < ordered.length) next.push(...ordered.slice(idx))
          return { notes: next }
        }),

      bulkTrashNotes: (ids) =>
        set((s) => {
          const idSet = new Set(ids)
          const trashed = s.notes
            .filter((n) => idSet.has(n.id))
            .map((n) => ({ ...n, deletedAt: Date.now() }))
          if (!trashed.length) return s
          return {
            notes: s.notes.filter((n) => !idSet.has(n.id)),
            trashNotes: [...trashed, ...s.trashNotes],
          }
        }),

      bulkSetPinned: (ids, pinned) =>
        set((s) => {
          const idSet = new Set(ids)
          const now = Date.now()
          return {
            notes: s.notes.map((n) =>
              idSet.has(n.id) ? { ...n, pinned, updatedAt: now } : n,
            ),
          }
        }),

      bulkSetColor: (ids, color) =>
        set((s) => {
          const idSet = new Set(ids)
          const now = Date.now()
          return {
            notes: s.notes.map((n) =>
              idSet.has(n.id) ? { ...n, color, updatedAt: now } : n,
            ),
          }
        }),

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

      importData: (tasks, theme, notes, trashNotes) =>
        set({
          tasks,
          theme: theme ?? 'light',
          notes: notes ?? [],
          trashNotes: trashNotes ?? [],
        }),
    }),
    {
      name: 'day-planner-storage',
      partialize: (s) => ({
        tasks: s.tasks,
        notes: s.notes,
        trashNotes: s.trashNotes,
        theme: s.theme,
        aiConfig: s.aiConfig,
      }),
    },
  ),
)
