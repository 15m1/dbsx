import { useEffect, useRef, useState } from 'react'
import { Check, Play, Trash2 } from 'lucide-react'
import { usePlanner } from '../store'
import type { Task } from '../types'
import { DAY_START, DAY_END, HOURS, minToLabel } from '../lib/time'
import { todayKey } from '../lib/date'

interface Props {
  tasks: Task[] // 已排程（当天）
  onFocus: (id: string) => void
}

interface DragInfo {
  mode: 'move' | 'resize' | 'create'
  taskId?: string
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
        const start = Math.min(
          Math.max(DAY_START, minute),
          DAY_END - Math.max(d.origDuration, 15),
        )
        dragPreview.current = { id: d.taskId, start, duration: d.origDuration }
        setForceTick((n) => n + 1)
      } else if (d.mode === 'resize' && d.taskId) {
        const endMin = Math.min(DAY_END, Math.max(DAY_START, minute))
        const duration = Math.min(
          DAY_END - d.origStart,
          Math.max(15, endMin - d.origStart),
        )
        dragPreview.current = { id: d.taskId, start: d.origStart, duration }
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
            start: Math.min(DAY_START, start),
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
      } else if ((d.mode === 'move' || d.mode === 'resize') && d.taskId && p) {
        scheduleTask(d.taskId, p.start, p.duration)
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
      startY: e.clientY,
      origStart: t.start ?? DAY_START,
      origDuration: t.duration,
      moved: false,
    }
  }

  const commitEdit = (id: string) => {
    const title = editTitle.trim()
    if (title) updateTask(id, { title })
    else deleteTask(id)
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
              return (
                <div
                  key={t.id}
                  className={`tl-card ${t.done ? 'done' : ''} ${pv ? 'dragging' : ''}`}
                  data-color={t.color}
                  style={{ top: start - DAY_START, height: Math.max(duration, 30) }}
                  onPointerDown={(e) => startDrag(e, t, 'move')}
                >
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editTitle}
                      placeholder="给这个时段起个名字…"
                      style={{
                        width: '100%',
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'inherit',
                        fontFamily: 'inherit',
                      }}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onPointerDown={(e) => e.stopPropagation()}
                      onBlur={() => commitEdit(t.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitEdit(t.id)
                        if (e.key === 'Escape') {
                          if (!editTitle.trim()) deleteTask(t.id)
                          setEditingId(null)
                        }
                      }}
                    />
                  ) : (
                    <>
                      <div className="tl-card-title">{t.title}</div>
                      <div className="tl-card-time">
                        {minToLabel(start)} – {minToLabel(start + duration)}
                        <span style={{ opacity: 0.7 }}> · {duration} 分钟</span>
                      </div>
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
