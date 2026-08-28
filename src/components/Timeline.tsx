import { useEffect, useRef, useState } from 'react'
import { Check, Play, Trash2, X } from 'lucide-react'
import { usePlanner } from '../store'
import type { Task } from '../types'
import { DAY_START, DAY_END, HOURS, pad2, minToLabel } from '../lib/time'
import { todayKey } from '../lib/date'
import { ColorPicker } from './ColorPicker'

interface Props {
  tasks: Task[] // 已排程（当天）
  onFocus: (id: string) => void
}

interface DragInfo {
  mode: 'move' | 'resize' | 'create'
  taskId?: string
  startX: number
  startY: number
  origStart: number
  origDuration: number
  moved: boolean
}

const HEIGHT = DAY_END - DAY_START // 1080
const HALF_HOURS: number[] = Array.from(
  { length: (DAY_END - DAY_START) / 30 - 1 },
  (_, i) => DAY_START + 30 * (i + 1),
)

export function Timeline({ tasks, onFocus }: Props) {
  const selectedDate = usePlanner((s) => s.selectedDate)
  const dragging = usePlanner((s) => s.dragging)
  const setDragging = usePlanner((s) => s.setDragging)
  const addTask = usePlanner((s) => s.addTask)
  const updateTask = usePlanner((s) => s.updateTask)
  const deleteTask = usePlanner((s) => s.deleteTask)
  const toggleDone = usePlanner((s) => s.toggleDone)
  const scheduleTask = usePlanner((s) => s.scheduleTask)

  const scrollRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragInfo | null>(null)
  const dragPreview = useRef<{ id: string; start: number; duration: number } | null>(null)
  const dropPreviewRef = useRef<{ start: number; duration: number } | null>(null)
  const [, setForceTick] = useState(0)
  /* 让拖拽闭包始终拿到最新选中日期 */
  const selectedDateRef = useRef(selectedDate)
  selectedDateRef.current = selectedDate

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editTime, setEditTime] = useState('06:00')
  const [editEnd, setEditEnd] = useState('07:00')
  const [editDuration, setEditDuration] = useState('60')
  /* 编辑态重复规则：'none' | 'daily' | 'weekly' | 'monthly' */
  const [editRepeat, setEditRepeat] = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none')
  /* 编辑态标签（逗号分隔输入） */
  const [editTags, setEditTags] = useState('')
  /* 编辑态卡片容器，用于判断失焦后焦点是否仍在卡片内 */
  const editCardRef = useRef<HTMLDivElement>(null)
  const [dropPreview, setDropPreview] = useState<{ start: number; duration: number } | null>(null)
  const [now, setNow] = useState(() => Date.now())
  /* 让拖拽闭包始终拿到最新编辑中的卡片 id */
  const editingIdRef = useRef(editingId)
  editingIdRef.current = editingId

  /* 现在时间线：仅当天 */
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  /* 打开时把滚动定位到"现在"附近 */
  useEffect(() => {
    if (todayKey() === selectedDateRef.current) {
      const mins = new Date().getHours() * 60 + new Date().getMinutes()
      if (mins >= DAY_START && mins < DAY_END) {
        const el = scrollRef.current
        if (el) el.scrollTop = Math.max(0, mins - DAY_START - el.clientHeight / 3)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const nowDate = new Date(now)
  const nowMins = nowDate.getHours() * 60 + nowDate.getMinutes()
  const isToday = selectedDate === todayKey()
  const showNowLine = isToday && nowMins >= DAY_START && nowMins < DAY_END

  /* 拖拽任务或新建 */
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      const track = trackRef.current
      if (!track) return
      const rect = track.getBoundingClientRect()
      const scrollTop = scrollRef.current?.scrollTop ?? 0
      const y = e.clientY - rect.top + scrollTop
      const minute = Math.round(y) + DAY_START

      if (d.mode === 'move' && d.taskId) {
        // 只有移动超过阈值才算"拖动"，否则视为点击（进入编辑），避免误触搬家
        if (!d.moved) {
          if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 8) return
          d.moved = true
        }
        const start = Math.min(
          Math.max(DAY_START, minute),
          DAY_END - Math.max(d.origDuration, 15),
        )
        dragPreview.current = { id: d.taskId, start, duration: d.origDuration }
        // 移动时实时同步到开始时间输入框
        setEditTime(toHHMM(start))
        setEditEnd(toHHMM(Math.min(DAY_END, start + d.origDuration)))
        setForceTick((n) => n + 1)
      } else if (d.mode === 'resize' && d.taskId) {
        const endMin = Math.min(DAY_END, Math.max(DAY_START, minute))
        const duration = Math.min(
          DAY_END - d.origStart,
          Math.max(15, endMin - d.origStart),
        )
        dragPreview.current = { id: d.taskId, start: d.origStart, duration }
        // 同步到编辑态时长输入框，避免提交时被旧值覆盖
        setEditDuration(String(duration))
        setEditEnd(toHHMM(Math.min(DAY_END, d.origStart + duration)))
        setForceTick((n) => n + 1)
      } else if (d.mode === 'create') {
        const diff = Math.abs(e.clientY - d.startY)
        if (diff > 6) d.moved = true
        if (d.moved) {
          const end = Math.max(DAY_START, minute)
          const start = Math.min(d.origStart, end)
          const duration = Math.max(30, end - start)
          dragPreview.current = {
            id: 'create-preview',
            start: Math.max(DAY_START, start),
            duration,
          }
          setForceTick((n) => n + 1)
        }
      }
    }

    const onUp = () => {
      const d = dragRef.current
      if (!d) return
      const p = dragPreview.current

      if (d.mode === 'create' && d.moved && p && p.id === 'create-preview') {
        createAt(p.start, p.duration)
      } else if (d.mode === 'resize' && d.taskId && p) {
        scheduleTask(d.taskId, p.start, p.duration)
      } else if (d.mode === 'move' && d.taskId) {
        if (d.moved && p) scheduleTask(d.taskId, p.start, p.duration)
        else startEditing(d.taskId)
      } else if (d.mode === 'create' && !d.moved) {
        const track = trackRef.current
        if (track) {
          const rect = track.getBoundingClientRect()
          const scrollTop = scrollRef.current?.scrollTop ?? 0
          const y = d.startY - rect.top + scrollTop
          createAt(Math.round(y) + DAY_START, 60)
        }
      }

      dragRef.current = null
      dragPreview.current = null
      setForceTick((n) => n + 1)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  const createAt = (minute: number, duration: number) => {
    // 若上一个新建卡片还没输入标题，先清掉它，避免空卡片残留
    const prevId = editingIdRef.current
    if (prevId) {
      const prev = usePlanner.getState().tasks.find((t) => t.id === prevId)
      if (prev && !prev.title.trim()) deleteTask(prevId)
    }
    const start = Math.min(Math.max(DAY_START, minute), DAY_END - duration)
    const id = addTask({ date: selectedDateRef.current, title: '', start, duration })
    setEditingId(id)
    setEditTitle('')
    // 让时间/时长框反映本次点击的位置，避免提交时用残留的旧值覆盖
    setEditTime(toHHMM(start))
    setEditEnd(toHHMM(Math.min(DAY_END, start + duration)))
    setEditDuration(String(duration))
    setEditRepeat('none')
    setEditTags('')
  }

  /* 从收集箱拖入（pointer 事件，触摸/鼠标通用） */
  useEffect(() => {
    if (!dragging || dragging.from !== 'inbox') return
    const onMove = (e: PointerEvent) => {
      const track = trackRef.current
      if (!track) return
      const rect = track.getBoundingClientRect()
      const inTrack = e.clientY >= rect.top && e.clientY <= rect.bottom
      if (!inTrack) {
        dropPreviewRef.current = null
        setDropPreview(null)
        return
      }
      const scrollTop = scrollRef.current?.scrollTop ?? 0
      const y = e.clientY - rect.top + scrollTop
      const raw = Math.round(y) + DAY_START
      const start = Math.round((raw - 15) / 30) * 30 // 对齐 30 分钟
      const clamped = Math.min(Math.max(DAY_START, start), DAY_END - 60)
      dropPreviewRef.current = { start: clamped, duration: 60 }
      setDropPreview(dropPreviewRef.current)
    }
    const onUp = (e: PointerEvent) => {
      const track = trackRef.current
      const p = dropPreviewRef.current
      if (track && p) {
        const rect = track.getBoundingClientRect()
        const inTrack = e.clientY >= rect.top && e.clientY <= rect.bottom
        if (inTrack) scheduleTask(dragging.taskId, p.start, p.duration)
      }
      dropPreviewRef.current = null
      setDropPreview(null)
      setDragging(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragging, scheduleTask, setDragging])

  const startDrag = (e: React.PointerEvent, t: Task, mode: 'move' | 'resize') => {
    // 点击输入框/按钮/把手时不进入拖拽，避免影响聚焦
    if ((e.target as HTMLElement).closest('input, textarea, select, button')) return
    e.preventDefault()
    e.stopPropagation()
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      /* 合成/失效指针下忽略指针捕获，拖拽逻辑仍可用 */
    }
    dragRef.current = {
      mode,
      taskId: t.id,
      startX: e.clientX,
      startY: e.clientY,
      origStart: t.start ?? DAY_START,
      origDuration: t.duration,
      moved: false,
    }
  }

  const startEditing = (id: string) => {
    const s = usePlanner.getState()
    const t = s.tasks.find((x) => x.id === id)
    if (!t) return
    const start = t.start ?? DAY_START
    const duration = t.duration
    setEditingId(id)
    setEditTitle(t.title)
    setEditTime(toHHMM(start))
    setEditEnd(toHHMM(Math.min(DAY_END, start + duration)))
    setEditDuration(String(duration))
    setEditRepeat(t.repeat?.freq ?? 'none')
    setEditTags(t.tags?.join('、') ?? '')
  }

  /* 分钟 -> "HH:MM"（time 输入框要求小时补零，如 06:00） */
  const toHHMM = (mins: number): string =>
    `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`

  /* 解析用户输入的时间，兼容 "06:00"、"6:00"、"0600"、"600"、"6" 等写法 */
  const parseTime = (raw: string): number | null => {
    const s = raw.trim()
    if (!s) return null
    let h = 0
    let m = 0
    if (s.includes(':')) {
      const parts = s.split(':')
      if (parts.length !== 2) return null
      h = Number(parts[0])
      m = Number(parts[1])
    } else {
      const digits = s.replace(/\D/g, '')
      if (!digits) return null
      if (digits.length <= 2) h = Number(digits)
      else {
        m = Number(digits.slice(-2))
        h = Number(digits.slice(0, -2))
      }
    }
    if (!Number.isInteger(h) || !Number.isInteger(m)) return null
    if (h > 23 || m > 59 || m < 0) return null
    const start = h * 60 + m
    if (start < DAY_START || start >= DAY_END) return null
    return start
  }

  /* 失焦后仅当焦点确实离开当前卡片时才提交，避免标题框切到时间框时误退出 */
  const handleBlur = (id: string) => {
    setTimeout(() => {
      const el = editCardRef.current
      if (el && el.contains(document.activeElement)) return
      commitEdit(id)
    }, 0)
  }

  /* 保存当前编辑（供全局点击外部检测复用最新闭包） */
  const commitRef = useRef<() => void>(() => {})
  commitRef.current = () => commitEdit(editingIdRef.current ?? '')

  /* 点击卡片外任意处（含其他卡片/空白/时间轴）→ 自动保存当前编辑 */
  useEffect(() => {
    if (!editingId) return
    const onPointerDown = (e: PointerEvent) => {
      const el = editCardRef.current
      if (el && el.contains(e.target as Node)) return
      /* pointerup 前先保存，避免创建新卡/切卡时丢失已输入内容 */
      commitRef.current()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [editingId])

  /* 开始时间变化：保持时长不变，联动结束时间 */
  const onEditStartChange = (v: string) => {
    setEditTime(v.replace(/[^0-9:]/g, ''))
    const st = parseTime(v)
    const du = Math.round(Number(editDuration))
    const dur = Number.isFinite(du) && du >= 15 ? du : 60
    if (st != null) setEditEnd(toHHMM(Math.min(DAY_END, st + dur)))
  }

  /* 结束时间变化：推算时长，联动开始时间（若开始非法则不动） */
  const onEditEndChange = (v: string) => {
    setEditEnd(v.replace(/[^0-9:]/g, ''))
    const st = parseTime(editTime)
    const en = parseTime(v)
    if (st != null && en != null && en > st) {
      setEditDuration(String(Math.min(en - st, DAY_END - DAY_START)))
      // 结束受限于 DAY_END，封顶
      setEditEnd(toHHMM(Math.min(en, DAY_END)))
    }
  }

  /* 时长变化：联动结束时间 */
  const onEditDurationChange = (v: string) => {
    const clean = v.replace(/\D/g, '')
    setEditDuration(clean)
    const st = parseTime(editTime)
    const du = Math.round(Number(clean))
    const dur = Number.isFinite(du) && du >= 15 ? du : 60
    if (st != null) setEditEnd(toHHMM(Math.min(DAY_END, st + dur)))
  }

  const commitEdit = (id: string) => {
    const title = editTitle.trim()
    if (!title) {
      deleteTask(id)
      setEditingId(null)
      return
    }
    const start = parseTime(editTime)
    const end = parseTime(editEnd)
    const durInput = Math.round(Number(editDuration))
    let duration = Number.isFinite(durInput) && durInput >= 15 ? durInput : 60
    if (start != null && end != null && end > start) {
      duration = end - start
    }
    duration = Math.min(Math.max(15, duration), DAY_END - DAY_START)
    const patch: Partial<Task> = { title }
    if (start != null) {
      patch.start = Math.max(DAY_START, Math.min(start, DAY_END - duration))
      patch.duration = duration
    }
    // 重复规则
    const freq = editRepeat
    const prev = usePlanner.getState().tasks.find((x) => x.id === id)
    if (freq === 'none') {
      patch.repeat = undefined
      if (prev?.repeat) patch.lastGenerated = undefined
    } else if (prev?.repeat?.freq !== freq) {
      // 新设/修改重复频率：保留原日期为锚点开始计算
      patch.repeat = { freq, until: prev?.repeat?.until ?? null }
      patch.lastGenerated = prev?.lastGenerated ?? prev?.date ?? selectedDateRef.current
    }
    // 标签：按顿号/逗号切分、去重、去空
    const tags = editTags
      .split(/[、,，]/)
      .map((s) => s.trim())
      .filter(Boolean)
    patch.tags = tags.length ? Array.from(new Set(tags)) : undefined
    updateTask(id, patch)
    setEditingId(null)
  }

  const startCreateDrag = (e: React.PointerEvent) => {
    const track = trackRef.current
    if (!track || (e.target as HTMLElement).closest('.tl-card')) return
    e.preventDefault()
    try {
      track.setPointerCapture(e.pointerId)
    } catch {
      /* 合成/失效指针下忽略指针捕获，拖拽逻辑仍可用 */
    }
    dragRef.current = {
      mode: 'create',
      startX: e.clientX,
      startY: e.clientY,
      origStart: Math.max(DAY_START, Math.round(e.clientY - track.getBoundingClientRect().top + (scrollRef.current?.scrollTop ?? 0)) + DAY_START),
      origDuration: 60,
      moved: false,
    }
  }

  const renderCreatePreview = () => {
    if (!dragPreview.current || dragPreview.current.id !== 'create-preview') return null
    const p = dragPreview.current
    return (
      <div
        className="tl-preview"
        style={{
          top: p.start - DAY_START,
          height: Math.max(p.duration, 30),
        }}
      />
    )
  }

  return (
    <section className="timeline-wrap">
      <div className="timeline-top">
        <div className="timeline-title">日程时间轴</div>
        <div className="timeline-legend">
          <span>
            <span className="legend-dot now" />
            现在
          </span>
          <span>
            <span className="legend-dot done" />
            已完成
          </span>
          <span>点击空白处添加 · 拖动调整</span>
        </div>
      </div>

      <div className="timeline-scroll" ref={scrollRef}>
        <div className="timeline" style={{ height: HEIGHT }}>
          <div className="timecol">
            {HOURS.map((m) => (
              <span className="time-label" key={m} style={{ top: m - DAY_START }}>
                {minToLabel(m)}
              </span>
            ))}
          </div>

          <div className="track" ref={trackRef} onPointerDown={startCreateDrag}>
            {HOURS.map((m) => (
              <div
                key={m}
                className="hour-line"
                style={{ top: m - DAY_START }}
              />
            ))}
            {HALF_HOURS.map((m) => (
              <div
                key={m}
                className="half-line"
                style={{ top: m - DAY_START }}
              />
            ))}

            {showNowLine && <div className="now-line" style={{ top: nowMins - DAY_START }} />}

            {tasks.length === 0 && (
              <div className="tl-empty">
                <span className="big">🖋</span>
                在这条时间线上
                <br />
                安排今天的每一个时段
              </div>
            )}

            {tasks.map((t) => {
              const pv = dragPreview.current?.id === t.id ? dragPreview.current : null
              const start = pv?.start ?? t.start ?? DAY_START
              const duration = pv?.duration ?? t.duration
              const isEditing = editingId === t.id
              const end = start + duration
              // 时间段重叠检测：与任意其他已排程任务区间相交
              const overlaps = tasks.some((o) => {
                if (o.id === t.id) return false
                const os = o.start ?? DAY_START
                const oe = os + o.duration
                return start < oe && os < end
              })
              return (
                <div
                  key={t.id}
                  className={`tl-card ${t.done ? 'done' : ''} ${pv ? 'dragging' : ''} ${isEditing ? 'editing' : ''} ${overlaps ? 'tl-overlap' : ''}`}
                  data-color={t.color}
                  style={{ top: start - DAY_START, height: isEditing ? Math.max(duration, 156) : Math.max(duration, 64) }}
                  onPointerDown={(e) => startDrag(e, t, 'move')}
                >
                  {isEditing ? (
                    <div className="tl-card-edit" ref={editCardRef}>
                      <div className="tl-edit-head">
                        <input
                          className="tl-edit-title"
                          autoFocus
                          value={editTitle}
                          placeholder="给这个时段起个名字…"
                          onChange={(e) => setEditTitle(e.target.value)}
                          onBlur={() => handleBlur(t.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitEdit(t.id)
                            if (e.key === 'Escape') {
                              if (!editTitle.trim()) deleteTask(t.id)
                              setEditingId(null)
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="tl-edit-close"
                          title="删除这个时段"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteTask(t.id)
                            setEditingId(null)
                          }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <div className="tl-edit-row">
                        <input
                          className="tl-edit-time"
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          maxLength={5}
                          placeholder="06:00"
                          value={editTime}
                          onChange={(e) => onEditStartChange(e.target.value)}
                          onBlur={() => handleBlur(t.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitEdit(t.id)
                          }}
                        />
                        <span className="tl-edit-dash">–</span>
                        <input
                          className="tl-edit-end"
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          maxLength={5}
                          placeholder="07:00"
                          value={editEnd}
                          onChange={(e) => onEditEndChange(e.target.value)}
                          onBlur={() => handleBlur(t.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitEdit(t.id)
                          }}
                        />
                        <span className="tl-edit-unit-dot">·</span>
                        <input
                          className="tl-edit-duration"
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          maxLength={3}
                          placeholder="60"
                          value={editDuration}
                          onChange={(e) => onEditDurationChange(e.target.value)}
                          onBlur={() => handleBlur(t.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitEdit(t.id)
                          }}
                        />
                        <span className="tl-edit-unit">分钟</span>
                        <ColorPicker
                          value={t.color}
                          onChange={(c) => updateTask(t.id, { color: c })}
                        />
                      </div>
                      <div className="tl-edit-extras">
                        <div className="tl-repeat-chip">
                          {(['none', 'daily', 'weekly', 'monthly'] as const).map(
                            (f) => (
                              <button
                                key={f}
                                type="button"
                                className={`tl-repeat-opt ${
                                  editRepeat === f ? 'active' : ''
                                }`}
                                title={
                                  f === 'none'
                                    ? '不重复'
                                    : f === 'daily'
                                      ? '每天'
                                      : f === 'weekly'
                                        ? '每周'
                                        : '每月'
                                }
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setEditRepeat(f)
                                }}
                              >
                                {f === 'none'
                                  ? '不重复'
                                  : f === 'daily'
                                    ? '每天'
                                    : f === 'weekly'
                                      ? '每周'
                                      : '每月'}
                              </button>
                            ),
                          )}
                        </div>
                        <input
                          className="tl-edit-tags"
                          type="text"
                          placeholder="标签，用逗号分隔"
                          value={editTags}
                          onChange={(e) => setEditTags(e.target.value)}
                          onBlur={() => handleBlur(t.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitEdit(t.id)
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="tl-card-title">
                        {t.title}
                        {t.repeat && (
                          <button
                            type="button"
                            className="tl-repeat-badge"
                            title="重复任务（勾选完成会自动排到下一次）"
                            onPointerDown={(e) => e.stopPropagation()}
                          >
                            {t.repeat.freq === 'daily'
                              ? '每天'
                              : t.repeat.freq === 'weekly'
                                ? '每周'
                                : '每月'}
                          </button>
                        )}
                      </div>
                      <div className="tl-card-time">
                        {minToLabel(start)} – {minToLabel(start + duration)}
                        <span style={{ opacity: 0.7 }}> · {duration} 分钟</span>
                      </div>
                      {t.tags && t.tags.length > 0 && (
                        <div className="tl-card-tags">
                          {t.tags.map((tag, i) => (
                            <span className="tl-tag" key={`${tag}-${i}`}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="tl-card-mini-actions">
                        <button
                          className="task-action"
                          title="开始专注"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation()
                            onFocus(t.id)
                          }}
                        >
                          <Play size={13} />
                        </button>
                        <button
                          className="task-action"
                          title={t.done ? '取消完成' : '标记完成'}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleDone(t.id)
                          }}
                        >
                          <Check size={14} />
                        </button>
                        <button
                          className="task-action"
                          title="删除"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteTask(t.id)
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <div
                        className="tl-resize"
                        title="拖动调整时长"
                        onPointerDown={(e) => {
                          e.stopPropagation()
                          startDrag(e, t, 'resize')
                        }}
                      />
                    </>
                  )}
                  {isEditing && (
                    <div
                      className="tl-resize"
                      title="拖动调整时长"
                      onPointerDown={(e) => {
                        e.stopPropagation()
                        startDrag(e, t, 'resize')
                      }}
                    />
                  )}
                </div>
              )
            })}

            {dropPreview && (
              <div
                className="tl-preview"
                style={{
                  top: dropPreview.start - DAY_START,
                  height: dropPreview.duration,
                }}
              />
            )}
            {renderCreatePreview()}
          </div>
        </div>
      </div>
    </section>
  )
}
