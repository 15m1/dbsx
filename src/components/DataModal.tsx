import { useRef } from 'react'
import { Download, Trash2, Upload, X } from 'lucide-react'
import { usePlanner, sanitizeTasks, sanitizeNotes } from '../store'
import { todayKey } from '../lib/date'

interface Props {
  onClose: () => void
  onToast: (msg: string) => void
}

export function DataModal({ onClose, onToast }: Props) {
  const importData = usePlanner((s) => s.importData)
  const fileRef = useRef<HTMLInputElement>(null)

  const exportJson = () => {
    const raw = localStorage.getItem('day-planner-storage')
    if (!raw) {
      onToast('还没有可导出的数据')
      return
    }
    const blob = new Blob([raw], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `拾光手账-备份-${todayKey()}.json`
    a.click()
    URL.revokeObjectURL(url)
    onToast('已导出备份文件（含手账+灵感墙）')
  }

  const handleFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result))
        const state = data?.state ?? data
        const tasks = sanitizeTasks(state?.tasks)
        if (!tasks) throw new Error('格式不对')
        // notes/trashNotes 可能来自旧备份（没这个字段）→ 允许为空数组
        const notes = sanitizeNotes(state?.notes) ?? []
        const trashNotes = sanitizeNotes(state?.trashNotes) ?? []
        if (typeof state.theme === 'string') {
          importData(tasks, state.theme === 'dark' ? 'dark' : 'light', notes, trashNotes)
        } else {
          importData(tasks, undefined, notes, trashNotes)
        }
        onToast(`数据导入成功（${tasks.length} 条任务 / ${notes.length} 张便签）`)
        onClose()
      } catch {
        onToast('导入失败：不是有效的备份文件')
      }
    }
    reader.readAsText(file)
  }

  const clearAll = () => {
    if (!window.confirm('确定要清空所有数据吗？包括手账任务、灵感便签和回收站，此操作不可恢复，建议先导出备份。')) return
    usePlanner.setState({ tasks: [], notes: [], trashNotes: [] })
    onToast('所有数据已清空')
    onClose()
  }

  return (
    <div className="modal-mask" onPointerDown={onClose}>
      <div className="modal" onPointerDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">数据与备份</div>
          <button className="modal-close" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </div>

        <div className="data-actions">
          <div className="data-row">
            <button className="data-btn" onClick={exportJson}>
              <Download size={16} />
              导出备份
            </button>
            <button className="data-btn" onClick={() => fileRef.current?.click()}>
              <Upload size={16} />
              导入备份
            </button>
          </div>
          <div className="data-row">
            <button className="data-btn danger" onClick={clearAll}>
              <Trash2 size={16} />
              清空所有数据
            </button>
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
            e.target.value = ''
          }}
        />

        <div className="data-note">
          所有数据仅保存在这台设备的浏览器里，不会上传任何云端。
          <br />
          换设备或清理浏览器前，记得先「导出备份」；换好后用「导入备份」恢复。
        </div>
      </div>
    </div>
  )
}
