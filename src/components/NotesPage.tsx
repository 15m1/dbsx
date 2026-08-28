import { useMemo, useRef, useState } from 'react'
import { Pin, Plus, Search, Trash2, X } from 'lucide-react'
import { usePlanner } from '../store'
import type { Note, TaskColor } from '../types'
import { ColorPicker } from './ColorPicker'

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

export function NotesPage() {
  const notes = usePlanner((s) => s.notes)
  const addNote = usePlanner((s) => s.addNote)
  const updateNote = usePlanner((s) => s.updateNote)
  const deleteNote = usePlanner((s) => s.deleteNote)

  const [draft, setDraft] = useState('')
  const [draftColor, setDraftColor] = useState<TaskColor>('apricot')
  const [keyword, setKeyword] = useState('')
  const [filterColor, setFilterColor] = useState<TaskColor | 'all'>('all')
  const [editing, setEditing] = useState<Note | null>(null)
  const [editText, setEditText] = useState('')
  const editRef = useRef<HTMLTextAreaElement>(null)

  const sorted = useMemo(() => {
    const list = [...notes]
    list.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return b.createdAt - a.createdAt
    })
    return list
  }, [notes])

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return sorted.filter((n) => {
      if (filterColor !== 'all' && n.color !== filterColor) return false
      if (kw && !n.text.toLowerCase().includes(kw)) return false
      return true
    })
  }, [sorted, keyword, filterColor])

  const submit = () => {
    const text = draft.trim()
    if (!text) return
    addNote(text, draftColor)
    setDraft('')
  }

  const openEdit = (n: Note) => {
    setEditing(n)
    setEditText(n.text)
    requestAnimationFrame(() => editRef.current?.focus())
  }

  const saveEdit = () => {
    if (!editing) return
    const text = editText.trim()
    if (text) updateNote(editing.id, { text })
    else deleteNote(editing.id)
    setEditing(null)
  }

  return (
    <section className="notes-page">
      <div className="notes-head">
        <div className="notes-title">
          <span className="notes-title-big">灵感便签墙</span>
          <span className="notes-count">{notes.length} 张</span>
        </div>
      </div>

      {/* 输入区 */}
      <div className="notes-compose">
        <textarea
          className="notes-input"
          rows={2}
          placeholder="随手记下一个灵感、一句话、一个想法…"
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

      {/* 工具条：搜索 + 颜色筛选 */}
      <div className="notes-toolbar">
        <label className="notes-search">
          <Search size={14} />
          <input
            placeholder="搜索灵感…"
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
            <>没有符合条件的便签</>
          )}
        </div>
      ) : (
        <div className="notes-wall">
          {filtered.map((n, i) => (
            <div
              key={n.id}
              className={`note-card ${n.pinned ? 'pinned' : ''}`}
              data-color={n.color}
              style={{ transform: `rotate(${((i % 5) - 2) * 0.8}deg)` }}
              onClick={() => openEdit(n)}
            >
              <div className="note-text">{n.text}</div>
              <div className="note-foot">
                <span>{formatTime(n.createdAt)}</span>
                {n.pinned && <Pin size={12} />}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 编辑弹层 */}
      {editing && (
        <div className="modal-mask" onPointerDown={() => saveEdit()}>
          <div
            className="modal note-edit-modal"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div className="modal-title">编辑便签</div>
              <button className="modal-close" onClick={saveEdit} title="关闭">
                <X size={18} />
              </button>
            </div>
            <textarea
              ref={editRef}
              className="note-edit-text"
              rows={5}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  saveEdit()
                }
              }}
            />
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
                <button
                  className="ghost-btn danger"
                  onClick={() => {
                    deleteNote(editing.id)
                    setEditing(null)
                  }}
                >
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
    </section>
  )
}