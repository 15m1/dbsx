import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRightCircle,
  CheckCheck,
  Circle,
  Copy,
  GripVertical,
  Hash,
  ListChecks,
  Pin,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { usePlanner, randomColor } from '../store'
import type { Note, TaskColor } from '../types'
import { ColorPicker } from './ColorPicker'
import { todayKey } from '../lib/date'

const COLORS: TaskColor[] = [
  'apricot',
  'terracotta',
  'moss',
  'mist',
  'rose',
  'lavender',
]

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 计算“删除于 X 天前 / 今天 / 昨天” */
function formatAgo(ts: number): string {
  const diff = Date.now() - ts
  const day = 24 * 60 * 60 * 1000
  if (diff < day) return '今天'
  if (diff < 2 * day) return '昨天'
  const days = Math.floor(diff / day)
  if (days < 30) return `${days} 天前`
  return `${Math.floor(days / 30)} 个月前`
}

/** 把 text 里的 #标签 渲染成高亮光标的样式（把 #xxx 包成 span），同时保留换行。 */
function renderText(text: string): ReactNode[] {
  const lines = text.split('\n')
  const out: ReactNode[] = []
  lines.forEach((line, li) => {
    const parts: ReactNode[] = []
    const regex = /(#[^\s#，,。.!！?？;；:：、\t]{1,30})/g
    let last = 0
    let m: RegExpExecArray | null
    let keyIdx = 0
    while ((m = regex.exec(line)) !== null) {
      if (m.index > last) parts.push(line.slice(last, m.index))
      parts.push(
        <span key={`${li}-${keyIdx++}`} className="note-tag-inline">
          {m[0]}
        </span>,
      )
      last = m.index + m[0].length
    }
    if (last < line.length) parts.push(line.slice(last))
    out.push(...parts)
    if (li < lines.length - 1) out.push('\n')
  })
  return out
}

/** 按下未激活的指针信息（等待移动阈值超过后升级为拖拽） */
interface PendingPointer {
  id: string
  pointerId: number
  startX: number
  startY: number
  active: boolean
}

/** 进行中的拖拽（全部由 React 状态驱动渲染，不做手动 DOM class/clone） */
interface DragState {
  id: string
  pinned: boolean
  /** ghost 左上角（视口坐标） */
  x: number
  y: number
  /** 指针相对卡片左上角的偏移 */
  ox: number
  oy: number
  /** 卡片尺寸 */
  w: number
  h: number
}

/** 拖拽中的组内渲染顺序（置顶组 / 普通组），实时让位重排只改这个，松手才提交 store */
interface DragOrder {
  pinned: string[]
  normal: string[]
}

export function NotesPage() {
  const notes = usePlanner((s) => s.notes)
  const trashNotes = usePlanner((s) => s.trashNotes)
  const addNote = usePlanner((s) => s.addNote)
  const updateNote = usePlanner((s) => s.updateNote)
  const deleteNote = usePlanner((s) => s.deleteNote)
  const restoreNote = usePlanner((s) => s.restoreNote)
  const purgeNote = usePlanner((s) => s.purgeNote)
  const emptyTrash = usePlanner((s) => s.emptyTrash)
  const pruneTrash = usePlanner((s) => s.pruneTrash)
  const setNoteOrder = usePlanner((s) => s.setNoteOrder)
  const bulkTrashNotes = usePlanner((s) => s.bulkTrashNotes)
  const bulkSetPinned = usePlanner((s) => s.bulkSetPinned)
  const bulkSetColor = usePlanner((s) => s.bulkSetColor)
  const addTask = usePlanner((s) => s.addTask)

  const [draft, setDraft] = useState('')
  const [draftColor, setDraftColor] = useState<TaskColor>(randomColor())
  const [keyword, setKeyword] = useState('')
  const [filterColor, setFilterColor] = useState<TaskColor | 'all'>('all')
  const [filterTag, setFilterTag] = useState<string | 'all'>('all')
  const [editing, setEditing] = useState<Note | null>(null)
  const [editText, setEditText] = useState('')
  const [trashOpen, setTrashOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const editRef = useRef<HTMLTextAreaElement>(null)

  /* ---------- 拖拽排序状态 ---------- */
  const pendingRef = useRef<PendingPointer | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  /** drag 的 ref 镜像：document 级监听器里读取最新拖拽状态（写穿同步，不经 React 提交） */
  const dragRef = useRef<DragState | null>(null)
  /** 拖拽中的组内渲染顺序（实时让位重排）；ref 镜像保证每帧读最新 */
  const dragOrderRef = useRef<DragOrder | null>(null)
  const [dragOrder, setDragOrder] = useState<DragOrder | null>(null)
  /** rAF 句柄：指针移动按帧节流，避免高频 setState */
  const rafId = useRef(0)
  /** ghost 容器的 DOM 引用：位置用 rAF 直接改 style，不走 React 渲染（避免每帧重渲染卡顿） */
  const ghostRef = useRef<HTMLDivElement>(null)
  /** 交换防抖：记录上次交换时目标卡片中心，ghost 需移开足够距离才允许下一次交换，避免来回抖动 */
  const lastSwapCenter = useRef<{ x: number; y: number } | null>(null)
  const notesRef = useRef(notes)
  notesRef.current = notes
  const suppressClick = useRef(false)

  /* 挂载时清理 30 天前的回收站便签 */
  useEffect(() => {
    pruneTrash()
  }, [pruneTrash])

  const showToast = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 1800)
  }

  /* ---------- 排序：尊重数组顺序（拖拽结果），置顶分组 ---------- */
  const allTags = useMemo(() => {
    const counter = new Map<string, number>()
    for (const n of notes) {
      for (const t of n.tags ?? []) {
        counter.set(t, (counter.get(t) ?? 0) + 1)
      }
    }
    return [...counter.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([t]) => t)
  }, [notes])

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return notes.filter((n) => {
      if (filterColor !== 'all' && n.color !== filterColor) return false
      if (filterTag !== 'all') {
        if (!n.tags?.includes(filterTag)) return false
      }
      if (kw && !n.text.toLowerCase().includes(kw)) return false
      return true
    })
  }, [notes, keyword, filterColor, filterTag])

  const pinnedNotes = useMemo(() => filtered.filter((n) => n.pinned), [filtered])
  const normalNotes = useMemo(() => filtered.filter((n) => !n.pinned), [filtered])

  /* 渲染时优先用拖拽中的组内顺序（实时让位）；无拖拽则用 store 顺序 */
  const notesById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes])
  const renderPinned = useMemo(() => {
    if (!dragOrder) return pinnedNotes
    return dragOrder.pinned
      .map((id) => notesById.get(id))
      .filter((n): n is Note => !!n)
  }, [dragOrder, pinnedNotes, notesById])
  const renderNormal = useMemo(() => {
    if (!dragOrder) return normalNotes
    return dragOrder.normal
      .map((id) => notesById.get(id))
      .filter((n): n is Note => !!n)
  }, [dragOrder, normalNotes, notesById])

  const filteringActive =
    keyword.trim() !== '' || filterColor !== 'all' || filterTag !== 'all'

  /* ---------- 批量选择 ---------- */
  const selectedCount = selectedIds.size
  const allVisibleSelected =
    filtered.length > 0 && filtered.every((n) => selectedIds.has(n.id))

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllVisible = () => {
    if (allVisibleSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(filtered.map((n) => n.id)))
  }

  const exitSelection = () => {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }

  const startSelection = () => {
    setEditing(null)
    setSelectionMode(true)
    setSelectedIds(new Set())
  }

  /** 批量置顶：选中项若全为置顶则取消置顶，否则全部置顶 */
  const bulkPin = () => {
    if (!selectedCount) return
    const ids = [...selectedIds]
    const allPinned = ids.every((id) => notesRef.current.find((n) => n.id === id)?.pinned)
    bulkSetPinned(ids, !allPinned)
    showToast(allPinned ? `已取消 ${ids.length} 张置顶` : `已置顶 ${ids.length} 张`)
    setSelectedIds(new Set())
  }

  const bulkColor = (color: TaskColor) => {
    if (!selectedCount) return
    bulkSetColor([...selectedIds], color)
    showToast(`已为 ${selectedIds.size} 张换色`)
    setSelectedIds(new Set())
  }

  const bulkDelete = () => {
    if (!selectedCount) return
    if (!window.confirm(`确定删除选中的 ${selectedIds.size} 张便签吗？删除后可在回收站恢复。`)) return
    bulkTrashNotes([...selectedIds])
    showToast(`已删除 ${selectedIds.size} 张（可在回收站恢复）`)
    exitSelection()
  }

  /* ---------- 拖拽实现（全部 React 状态驱动，杜绝手动 DOM 与渲染失步） ---------- */
  /** 墙上所有真实卡片元素（排除 ghost 内的卡片） */
  const wallCards = (): HTMLElement[] =>
    Array.from(document.querySelectorAll<HTMLElement>('.note-card')).filter(
      (el) => !el.closest('.note-ghost') && el.dataset.noteId,
    )

  /** 初始化拖拽：记录当前组内顺序作为渲染基线（ghost 跟随指针，其他卡片实时让位） */
  const initDragOrder = () => {
    const order: DragOrder = {
      pinned: notesRef.current.filter((n) => n.pinned).map((n) => n.id),
      normal: notesRef.current.filter((n) => !n.pinned).map((n) => n.id),
    }
    dragOrderRef.current = order
    setDragOrder(order)
  }

  /**
   * 计算被拖卡片正压在哪张卡片上（Android 主屏式拖动交换）。
   * 只有 ghost 中心确实落在某张卡片的矩形内（含少量容差）才返回该卡片，
   * 处于间隙时不交换——交换都是明确的“压上去”，杜绝连环交换/闪烁。
   */
  const computeSwapTarget = (): string | null => {
    const d = dragRef.current
    if (!d) return null
    const gx = d.x + d.w / 2
    const gy = d.y + d.h / 2
    // 同组卡片（排除自身）
    const els: HTMLElement[] = []
    wallCards().forEach((el) => {
      const id = el.dataset.noteId
      const n = id ? notesRef.current.find((x) => x.id === id) : undefined
      if (n && n.pinned === d.pinned && id !== d.id) els.push(el)
    })
    // 命中：ghost 中心在卡片矩形内（向外扩 10px 容差）
    for (const el of els) {
      const r = el.getBoundingClientRect()
      if (gx >= r.left - 10 && gx <= r.right + 10 && gy >= r.top - 10 && gy <= r.bottom + 10) {
        return el.dataset.noteId!
      }
    }
    return null
  }

  /** 应用交换：被拖卡片与目标卡片在组内顺序中互换，其余卡片不动（瞬时生效，无位置动画） */
  const applySwap = () => {
    const d = dragRef.current
    if (!d || !dragOrderRef.current) return
    const targetId = computeSwapTarget()
    if (!targetId || targetId === d.id) return
    const order = dragOrderRef.current
    const groupKey: 'pinned' | 'normal' = d.pinned ? 'pinned' : 'normal'
    const arr = order[groupKey]
    const ai = arr.indexOf(d.id)
    const bi = arr.indexOf(targetId)
    if (ai < 0 || bi < 0 || ai === bi) return
    // 交换防抖：ghost 中心需离开上次交换点足够距离才允许下一次交换，避免来回抖动
    if (lastSwapCenter.current) {
      const gx = d.x + d.w / 2
      const gy = d.y + d.h / 2
      const moved = Math.hypot(gx - lastSwapCenter.current.x, gy - lastSwapCenter.current.y)
      const selfEl = document.querySelector<HTMLElement>(`[data-note-id="${d.id}"]`)
      const h = selfEl ? selfEl.getBoundingClientRect().height : 60
      const minMove = Math.min(h * 0.3, 40)
      if (moved < minMove) return
    }
    const next = arr.slice()
    next[ai] = arr[bi]
    next[bi] = arr[ai]
    const nextOrder = { ...order, [groupKey]: next }
    dragOrderRef.current = nextOrder // 写穿：不等 React 提交，立即可读
    // 记录上次交换点（目标卡片交换前的位置中心），作为下次交换的防抖基准
    const bEl = document.querySelector<HTMLElement>(`[data-note-id="${targetId}"]`)
    const br = bEl ? bEl.getBoundingClientRect() : null
    lastSwapCenter.current = br
      ? { x: br.left + br.width / 2, y: br.top + br.height / 2 }
      : { x: d.x + d.w / 2, y: d.y + d.h / 2 }
    setDragOrder(nextOrder)
  }

  const cleanupDrag = () => {
    if (rafId.current) {
      cancelAnimationFrame(rafId.current)
      rafId.current = 0
    }
    document.body.classList.remove('note-dragging')
    document.removeEventListener('pointermove', onDocMove)
    document.removeEventListener('pointerup', onDocUp)
    document.removeEventListener('pointercancel', onDocUp)
    pendingRef.current = null
    dragRef.current = null // 写穿清理
    setDrag(null)
    window.setTimeout(() => {
      suppressClick.current = false
    }, 60)
  }

  const beginDrag = (ev: PointerEvent) => {
    const p = pendingRef.current
    if (!p) return
    const cardEl = document.querySelector<HTMLElement>(`[data-note-id="${p.id}"]`)
    if (!cardEl) return
    // 防御：清除上一轮可能残留的动画，避免卡片卡在偏移位置
    wallCards().forEach((el) => el.getAnimations().forEach((a) => a.cancel()))
    const rect = cardEl.getBoundingClientRect()
    const note = notesRef.current.find((n) => n.id === p.id)
    if (!note) return
    suppressClick.current = true
    document.body.classList.add('note-dragging')
    const initial: DragState = {
      id: p.id,
      pinned: note.pinned,
      x: rect.left,
      y: rect.top,
      ox: ev.clientX - rect.left,
      oy: ev.clientY - rect.top,
      w: rect.width,
      h: rect.height,
    }
    dragRef.current = initial // 写穿：不等 React 提交，立即可读
    setDrag(initial)
    initDragOrder()
    // 交换防抖基线：从按下位置开始，拖动足够距离才触发第一次交换
    lastSwapCenter.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }

  /** 松手：把拖拽中的最终组内顺序提交到 store */
  const finalizeDrag = () => {
    const d = dragRef.current
    const order = dragOrderRef.current
    if (d && order) {
      const groupKey: 'pinned' | 'normal' = d.pinned ? 'pinned' : 'normal'
      const orderedIds = order[groupKey]
      const cur = notesRef.current.filter((n) => n.pinned === d.pinned).map((n) => n.id)
      const changed =
        cur.length !== orderedIds.length || cur.some((id, i) => id !== orderedIds[i])
      if (changed) setNoteOrder(orderedIds)
    }
    cleanupDrag()
    dragOrderRef.current = null
    setDragOrder(null)
  }

  /** 每帧（rAF）：只做交换检测，与 ghost 跟手分离，避免 React 重渲染阻塞拖拽 */
  const dragTick = () => {
    rafId.current = 0
    const d = dragRef.current
    if (!d) return
    applySwap()
  }

  /** 直接改 ghost 的 transform（走合成器，不触发 reflow），保证跟手 */
  const moveGhost = (x: number, y: number) => {
    const ghost = ghostRef.current
    if (ghost) ghost.style.transform = `translate(${x}px, ${y}px)`
  }

  const onDocMove = (ev: PointerEvent) => {
    const p = pendingRef.current
    if (!p || p.pointerId !== ev.pointerId) return
    if (!p.active) {
      if (Math.hypot(ev.clientX - p.startX, ev.clientY - p.startY) > 6) {
        p.active = true
        beginDrag(ev)
      }
      return
    }
    const d = dragRef.current
    if (!d) return
    const x = ev.clientX - d.ox
    const y = ev.clientY - d.oy
    // 写穿最新位置
    dragRef.current = { ...d, x, y }
    // ghost 同步跟手（不触发 React 渲染）
    moveGhost(x, y)
    // 换位检测按帧节流，独立于 ghost 移动
    if (!rafId.current) {
      rafId.current = requestAnimationFrame(dragTick)
    }
  }

  const onDocUp = (ev: PointerEvent) => {
    const p = pendingRef.current
    if (!p || p.pointerId !== ev.pointerId) return
    finalizeDrag()
  }

  const onHandlePointerDown = (e: React.PointerEvent, note: Note) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (filteringActive) return // 筛选/搜索时不允许拖动排序
    e.preventDefault()
    e.stopPropagation()
    pendingRef.current = {
      id: note.id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
    }
    document.addEventListener('pointermove', onDocMove)
    document.addEventListener('pointerup', onDocUp)
    document.addEventListener('pointercancel', onDocUp)
  }

  /* ---------- 便签增删改 ---------- */
  const submit = () => {
    const text = draft.trim()
    if (!text) return
    addNote(text, draftColor)
    setDraft('')
    setDraftColor(randomColor())
  }

  const openEdit = (n: Note) => {
    if (suppressClick.current) return
    setEditing(n)
    setEditText(n.text)
    requestAnimationFrame(() => editRef.current?.focus())
  }

  const saveEdit = () => {
    if (!editing) return
    const text = editText.trim()
    if (text) updateNote(editing.id, { text })
    else {
      deleteNote(editing.id) // 空内容 → 回收站
      showToast('已移到回收站')
    }
    setEditing(null)
  }

  const doDelete = () => {
    if (!editing) return
    if (!window.confirm('删除后可在回收站恢复，确定删除这张便签吗？')) return
    deleteNote(editing.id)
    setEditing(null)
    showToast('已移到回收站')
  }

  const convertToTask = () => {
    if (!editing) return
    const title = editing.text.trim().replace(/\n+/g, ' ').slice(0, 80) || '来自灵感墙'
    addTask({
      date: todayKey(),
      title,
      color: editing.color,
      tags: editing.tags?.length ? editing.tags : undefined,
    })
    showToast('已转到今日手账收集箱')
    setEditing(null)
  }

  const copyText = async () => {
    if (!editing) return
    try {
      await navigator.clipboard.writeText(editing.text)
      showToast('已复制到剪贴板')
    } catch {
      showToast('复制失败')
    }
  }

  const pinnedCount = pinnedNotes.length
  const normalCount = normalNotes.length

  return (
    <section className="notes-page">
      <div className="notes-head">
        <div className="notes-title">
          <span className="notes-title-big">灵感便签墙</span>
          <span className="notes-count">{notes.length} 张</span>
          {notes.length > 0 && pinnedCount > 0 && (
            <span className="notes-count pinned-count">📌 {pinnedCount} 置顶</span>
          )}
          {allTags.length > 0 && (
            <span className="notes-count tag-count">
              <Hash size={11} style={{ verticalAlign: '-2px' }} /> {allTags.length} 个标签
            </span>
          )}
          {notes.length > 0 && (
            <button
              className={`trash-btn select-btn ${selectionMode ? 'active' : ''}`}
              onClick={selectionMode ? exitSelection : startSelection}
              title={selectionMode ? '退出批量选择' : '批量选择'}
            >
              {selectionMode ? (
                <X size={14} />
              ) : (
                <ListChecks size={14} />
              )}
              {selectionMode ? `已选 ${selectedCount}` : '选择'}
            </button>
          )}
          {!selectionMode && (
            <button
              className="trash-btn"
              onClick={() => setTrashOpen(true)}
              title="回收站（30 天内可恢复）"
            >
              <Trash2 size={14} />
              回收站
              {trashNotes.length > 0 && (
                <span className="trash-badge">{trashNotes.length}</span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* 输入区 */}
      <div className="notes-compose">
        <textarea
          className="notes-input"
          rows={2}
          placeholder="随手记下一个灵感、一句话、一个想法…（用 #标签 自动分类，比如 #读书 #idea）"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <div className="notes-compose-bar">
          <ColorPicker value={draftColor} onChange={setDraftColor} />
          <button className="focus-btn" onClick={submit} disabled={!draft.trim()}>
            <Plus size={15} />
            贴上去
          </button>
        </div>
      </div>

      {/* 工具条：搜索 + 颜色筛选 + 标签筛选 */}
      <div className="notes-toolbar">
        <label className="notes-search">
          <Search size={14} />
          <input
            placeholder="搜索灵感…（文字/标签）"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </label>
        <div className="notes-filters">
          <button
            className={`notes-filter-dot all ${filterColor === 'all' ? 'active' : ''}`}
            title="全部颜色"
            onClick={() => setFilterColor('all')}
          />
          {COLORS.map((c) => (
            <button
              key={c}
              className={`notes-filter-dot ${filterColor === c ? 'active' : ''}`}
              data-color={c}
              title={c}
              onClick={() => setFilterColor(c)}
            />
          ))}
        </div>
      </div>

      {/* 标签条 */}
      {allTags.length > 0 && (
        <div className="notes-tags-bar">
          <button
            className={`note-tag-pill ${filterTag === 'all' ? 'active' : ''}`}
            onClick={() => setFilterTag('all')}
          >
            全部
          </button>
          {allTags.map((t) => (
            <button
              key={t}
              className={`note-tag-pill ${filterTag === t ? 'active' : ''}`}
              onClick={() => setFilterTag(filterTag === t ? 'all' : t)}
            >
              #{t}
              <span className="note-tag-num">
                {notes.filter((n) => n.tags?.includes(t)).length}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* 便签墙 */}
      {filtered.length === 0 ? (
        <div className="notes-empty">
          <span className="big">📌</span>
          {notes.length === 0 ? (
            <>
              灵感墙还空着
              <br />
              把冒出来的好点子贴上来吧
            </>
          ) : (
            <>
              没有符合条件的便签
              <br />
              {(filterColor !== 'all' || filterTag !== 'all' || keyword) && (
                <button
                  className="ghost-btn small"
                  style={{ marginTop: 10 }}
                  onClick={() => {
                    setFilterColor('all')
                    setFilterTag('all')
                    setKeyword('')
                  }}
                >
                  清除筛选
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          {/* 置顶区 */}
          {pinnedCount > 0 && (
            <div className="notes-section">
              <div className="notes-section-title">
                <Pin size={13} /> 置顶便签 <em>（{pinnedCount}）</em>
              </div>
              <div className="notes-wall">
                {renderPinned.map((n, i) => (
                  <NoteCardView
                    key={n.id}
                    note={n}
                    index={i}
                    isDragging={drag?.id === n.id}
                    dragDisabled={filteringActive || selectionMode}
                    selectionMode={selectionMode}
                    selected={selectedIds.has(n.id)}
                    onToggleSelect={toggleSelect}
                    onEdit={openEdit}
                    onHandleDown={onHandlePointerDown}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 普通区 */}
          {normalCount > 0 && (
            <div className="notes-section">
              {pinnedCount > 0 && <div className="notes-divider" />}
              <div className="notes-section-title">
                {pinnedCount > 0 ? '其他灵感' : '最近灵感'} <em>（{normalCount}）</em>
              </div>
              <div className="notes-wall">
                {renderNormal.map((n, i) => (
                  <NoteCardView
                    key={n.id}
                    note={n}
                    index={pinnedCount + i}
                    isDragging={drag?.id === n.id}
                    dragDisabled={filteringActive || selectionMode}
                    selectionMode={selectionMode}
                    selected={selectedIds.has(n.id)}
                    onToggleSelect={toggleSelect}
                    onEdit={openEdit}
                    onHandleDown={onHandlePointerDown}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* 拖拽 ghost：React 渲染的跟随指针副本（原卡片隐藏占位，不产生 DOM 克隆残留） */}
      {drag &&
        (() => {
          const note = notes.find((n) => n.id === drag.id)
          if (!note) return null
          return (
            <div
              ref={ghostRef}
              className="note-ghost"
              style={{ transform: `translate(${drag.x}px, ${drag.y}px)`, width: drag.w }}
            >
              <NoteCardView
                note={note}
                index={0}
                isDragging={false}
                ghosted
                dragDisabled
                selectionMode={false}
                selected={false}
                onToggleSelect={() => {}}
                onEdit={() => {}}
                onHandleDown={() => {}}
              />
            </div>
          )
        })()}

      {/* 编辑弹层 */}
      {editing && (
        <div className="modal-mask" onPointerDown={() => saveEdit()}>
          <div
            className="modal note-edit-modal"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div className="modal-title">编辑便签</div>
              <button className="modal-close" onClick={saveEdit} title="关闭并保存">
                <X size={18} />
              </button>
            </div>
            <textarea
              ref={editRef}
              className="note-edit-text"
              rows={6}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  saveEdit()
                }
              }}
              placeholder="写点什么…留空会自动删除这张便签（Ctrl/⌘+Enter 快速保存）"
            />
            <div className="note-edit-meta">
              <span>
                创建 {formatTime(editing.createdAt)}
                {editing.updatedAt && editing.updatedAt !== editing.createdAt && (
                  <> · 更新 {formatTime(editing.updatedAt)}</>
                )}
              </span>
              {editing.tags && editing.tags.length > 0 && (
                <span className="note-tags-inline-line">
                  {editing.tags.map((t) => (
                    <span key={t} className="note-tag-chip">#{t}</span>
                  ))}
                </span>
              )}
            </div>
            <div className="note-edit-actions">
              <ColorPicker
                value={editing.color}
                onChange={(c) => updateNote(editing.id, { color: c })}
              />
              <div className="note-edit-buttons">
                <button
                  className="ghost-btn"
                  onClick={() => {
                    updateNote(editing.id, { pinned: !editing.pinned })
                  }}
                >
                  <Pin size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
                  {editing.pinned ? '取消置顶' : '置顶'}
                </button>
                <button className="ghost-btn" onClick={copyText} title="复制文字">
                  <Copy size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
                  复制
                </button>
                <button
                  className="ghost-btn accent"
                  onClick={convertToTask}
                  title="转为今日手账任务"
                >
                  <ArrowRightCircle
                    size={13}
                    style={{ verticalAlign: '-2px', marginRight: 5 }}
                  />
                  转为任务
                </button>
                <button className="ghost-btn danger" onClick={doDelete} title="删除（可恢复）">
                  <Trash2 size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
                  删除
                </button>
                <button className="focus-btn" onClick={saveEdit}>
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 回收站弹层 */}
      {trashOpen && (
        <TrashModal
          notes={trashNotes}
          onClose={() => setTrashOpen(false)}
          onRestore={(id) => {
            restoreNote(id)
            showToast('已恢复')
          }}
          onPurge={(id) => {
            if (window.confirm('彻底删除后无法恢复，确定删除吗？')) purgeNote(id)
          }}
          onEmpty={() => {
            if (window.confirm('确定清空回收站吗？此操作不可恢复。')) {
              emptyTrash()
              showToast('回收站已清空')
            }
          }}
        />
      )}

      {/* 批量操作栏 */}
      {selectionMode && (
        <div className="bulk-bar">
          <button
            className="bulk-bar-item bulk-close"
            onClick={exitSelection}
            title="退出批量选择"
          >
            <X size={16} />
            <span>{selectedCount}</span>
          </button>
          <button
            className="bulk-bar-item"
            onClick={selectAllVisible}
            title={allVisibleSelected ? '取消全选' : '全选'}
          >
            <CheckCheck size={15} />
            <span>{allVisibleSelected ? '取消全选' : '全选'}</span>
          </button>
          <button
            className="bulk-bar-item"
            onClick={bulkPin}
            title="批量置顶 / 取消置顶"
          >
            <Pin size={15} />
            <span>置顶</span>
          </button>
          <div className="bulk-colors" title="批量换色">
            {COLORS.map((c) => (
              <button
                key={c}
                className="bulk-color-dot"
                data-color={c}
                onClick={() => bulkColor(c)}
                title="批量换色"
              />
            ))}
          </div>
          <button className="bulk-bar-item bulk-danger" onClick={bulkDelete} title="批量删除">
            <Trash2 size={15} />
            <span>删除</span>
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && <div className="toast-float">{toast}</div>}
    </section>
  )
}

/* ============== 子组件：单张便签卡片 ============== */

function NoteCardView({
  note,
  index,
  isDragging,
  dragDisabled,
  ghosted = false,
  selectionMode,
  selected,
  onToggleSelect,
  onEdit,
  onHandleDown,
}: {
  note: Note
  index: number
  isDragging: boolean
  dragDisabled: boolean
  /** 作为拖拽 ghost 渲染（不挂 data-note-id，避免命中检测误匹配） */
  ghosted?: boolean
  selectionMode: boolean
  selected: boolean
  onToggleSelect: (id: string) => void
  onEdit: (n: Note) => void
  onHandleDown: (e: React.PointerEvent, n: Note) => void
}) {
  const rotation = ghosted ? -1.5 : ((index % 7) - 3) * 0.7
  return (
    <div
      className={`note-card ${note.pinned ? 'pinned' : ''} ${isDragging ? 'dragging' : ''} ${
        selectionMode ? (selected ? 'selected' : 'unselected') : ''
      }`}
      data-note-id={ghosted ? undefined : note.id}
      data-color={note.color}
      style={{ '--rot': `${rotation}deg` } as React.CSSProperties}
      onClick={() => (selectionMode ? onToggleSelect(note.id) : onEdit(note))}
    >
      {/* 批量选择指示圈 */}
      {selectionMode && (
        <span className="note-select-badge">
          {selected ? <CheckCheck size={13} /> : <Circle size={13} />}
        </span>
      )}
      <div className="note-text">{renderText(note.text)}</div>
      {note.tags && note.tags.length > 0 && (
        <div className="note-tags">
          {note.tags.map((t) => (
            <span key={t} className="note-tag-chip">
              #{t}
            </span>
          ))}
        </div>
      )}
      <div className="note-foot">
        <span>{formatTime(note.updatedAt ?? note.createdAt)}</span>
        <span className="note-foot-right">
          {note.pinned && <Pin size={12} />}
          {!dragDisabled && (
            <span
              className="note-grip"
              title="按住拖动排序"
              onPointerDown={(e) => onHandleDown(e, note)}
              onClick={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
            >
              <GripVertical size={13} />
            </span>
          )}
        </span>
      </div>
    </div>
  )
}

/* ============== 子组件：回收站弹层 ============== */

function TrashModal({
  notes,
  onClose,
  onRestore,
  onPurge,
  onEmpty,
}: {
  notes: Note[]
  onClose: () => void
  onRestore: (id: string) => void
  onPurge: (id: string) => void
  onEmpty: () => void
}) {
  return (
    <div className="modal-mask" onPointerDown={onClose}>
      <div className="modal trash-modal" onPointerDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">回收站</div>
          <button className="modal-close" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </div>

        {notes.length === 0 ? (
          <div className="notes-empty trash-empty">
            <span className="big">🗑️</span>
            回收站是空的
          </div>
        ) : (
          <>
            <div className="trash-list">
              {notes.map((n) => (
                <div key={n.id} className="trash-item" data-color={n.color}>
                  <div className="trash-item-text">
                    <div className="trash-item-body">{renderText(n.text)}</div>
                    <div className="trash-item-meta">
                      删除于 {formatAgo(n.deletedAt ?? n.createdAt)}
                      {n.tags && n.tags.length > 0 && (
                        <span className="trash-item-tags">
                          {n.tags.map((t) => (
                            <span key={t} className="note-tag-chip">#{t}</span>
                          ))}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="trash-item-actions">
                    <button
                      className="ghost-btn small"
                      onClick={() => onRestore(n.id)}
                      title="恢复"
                    >
                      <RotateCcw size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                      恢复
                    </button>
                    <button
                      className="ghost-btn small danger"
                      onClick={() => onPurge(n.id)}
                      title="彻底删除"
                    >
                      <Trash2 size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="trash-foot">
              <span className="trash-hint">超过 30 天自动清理</span>
              <button className="ghost-btn small danger" onClick={onEmpty}>
                清空回收站
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
