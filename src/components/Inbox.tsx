import { useEffect, useRef, useState } from 'react'
import { Check, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { usePlanner } from '../store'
import type { Task } from '../types'

interface Props {
  tasks: Task[]
  onFocus: (id: string) => void
}

export function Inbox({ tasks, onFocus }: Props) {
  const addTask = usePlanner((s) => s.addTask)
  const updateTask = usePlanner((s) => s.updateTask)
  const deleteTask = usePlanner((s) => s.deleteTask)
  const toggleDone = usePlanner((s) => s.toggleDone)
  const setDragging = usePlanner((s) => s.setDragging)
  const selectedDate = usePlanner((s) => s.selectedDate)

  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const editRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId) editRef.current?.focus()
  }, [editingId])

  const submitDraft = () => {
    const title = draft.trim()
    if (!title) return
    addTask({ date: selectedDate, title })
    setDraft('')
  }

  const startEdit = (t: Task) => {
    setEditingId(t.id)
    setEditingText(t.title)
  }

  const commitEdit = (id: string) => {
    const title = editingText.trim()
    // 空标题视为取消编辑，保留原标题，避免保存空任务
    if (title) updateTask(id, { title })
    setEditingId(null)
  }

  const cancelEdit = () => setEditingId(null)

  return (
    <aside className="inbox">
      <div className="inbox-head">
        <div className="inbox-title">
          收集箱
          <span className="inbox-count">{tasks.length}</span>
        </div>
      </div>

      <div className="inbox-input">
        <input
          value={draft}
          placeholder="想到什么，先记下来…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitDraft()
          }}
        />
        <button className="inbox-add" title="添加事项" onClick={submitDraft}>
          <Plus size={19} />
        </button>
      </div>

      <div className="inbox-list">
        {tasks.length === 0 && (
          <div className="inbox-empty">
            <span className="big">✎</span>
            本子还空着
            <br />
            把要做的事记下来吧
          </div>
        )}

        {tasks.map((t) =>
          editingId === t.id ? (
            <div className="task-card" key={t.id} data-color={t.color}>
              <input
                ref={editRef}
                value={editingText}
                style={{ width: '100%' }}
                className="inbox-edit-input"
                onChange={(e) => setEditingText(e.target.value)}
                onBlur={() => commitEdit(t.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit(t.id)
                  if (e.key === 'Escape') cancelEdit()
                }}
              />
            </div>
          ) : (
            <div
              className={`task-card ${t.done ? 'done' : ''}`}
              key={t.id}
              data-color={t.color}
              draggable
              onDragStart={(e) => {
                e.dataTransfer?.setData('application/x-task', t.id)
                if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
                setDragging({ taskId: t.id, from: 'inbox' })
                ;(e.currentTarget as HTMLElement).classList.add('dragging-src')
              }}
              onDragEnd={(e) => {
                setDragging(null)
                ;(e.currentTarget as HTMLElement).classList.remove('dragging-src')
              }}
            >
              <div className="task-title">
                <button
                  className="task-check"
                  title={t.done ? '标记为未完成' : '标记完成'}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleDone(t.id)
                  }}
                >
                  <Check size={15} strokeWidth={3.5} />
                </button>
                <span style={{ flex: 1, paddingTop: 3 }}>{t.title}</span>
              </div>
              <div className="task-actions">
                <button
                  className="task-action"
                  title="开始专注"
                  onClick={(e) => {
                    e.stopPropagation()
                    onFocus(t.id)
                  }}
                >
                  <Play size={14} />
                </button>
                <button
                  className="task-action"
                  title="编辑标题"
                  onClick={(e) => {
                    e.stopPropagation()
                    startEdit(t)
                  }}
                >
                  <Pencil size={13} />
                </button>
                <button
                  className="task-action"
                  title="删除"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteTask(t.id)
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ),
        )}
      </div>

      <div className="inbox-hint">把卡片拖到右侧时间轴，安排它的时段</div>
    </aside>
  )
}
