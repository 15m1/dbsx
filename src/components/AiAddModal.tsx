import { useMemo, useRef, useState } from 'react'
import { Check, Loader2, Settings2, Sparkles, Trash2, X } from 'lucide-react'
import { usePlanner } from '../store'
import { parseTasksWithAI } from '../lib/ai'
import type { AiConfig, AiDraft } from '../types'
import { formatMonthDay, todayKey } from '../lib/date'

interface Props {
  onClose: () => void
  onToast: (msg: string) => void
}

export function AiAddModal({ onClose, onToast }: Props) {
  const aiConfig = usePlanner((s) => s.aiConfig)
  const setAiConfig = usePlanner((s) => s.setAiConfig)
  const addTask = usePlanner((s) => s.addTask)

  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [drafts, setDrafts] = useState<AiDraft[] | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [cfgDraft, setCfgDraft] = useState<AiConfig>(aiConfig)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const today = todayKey()

  const presets: Array<{ label: string; value: AiConfig }> = useMemo(
    () => [
      {
        label: 'DeepSeek',
        value: {
          baseUrl: 'https://api.deepseek.com',
          apiKey: '',
          model: 'deepseek-v4-flash',
        },
      },
      {
        label: 'OpenAI',
        value: { baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini' },
      },
      {
        label: '小米 MiMo 按量',
        value: {
          baseUrl: 'https://api.xiaomimimo.com/v1',
          apiKey: '',
          model: 'mimo-v2.5-pro',
        },
      },
      {
        label: 'MiMo Token Plan',
        value: {
          baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
          apiKey: '',
          model: 'mimo-v2.5-pro',
        },
      },
    ],
    [],
  )

  const applyPreset = (value: AiConfig) => {
    setCfgDraft((prev) => ({ ...value, apiKey: prev.apiKey }))
  }

  const saveSettings = () => {
    setAiConfig(cfgDraft)
    setShowSettings(false)
    onToast('AI 配置已保存')
  }

  const run = async () => {
    const text = input.trim()
    if (!text) {
      onToast('先输入一句话，比如「明天上午9点开会」')
      return
    }
    if (!aiConfig.apiKey) {
      setShowSettings(true)
      onToast('请先在设置里填写 API Key')
      return
    }
    setLoading(true)
    setDrafts(null)
    try {
      const list = await parseTasksWithAI(aiConfig, text)
      if (list.length === 0) throw new Error('没有识别出任务')
      setDrafts(list)
    } catch (e) {
      onToast(e instanceof Error ? e.message : '解析失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const removeDraft = (i: number) => {
    setDrafts((d) => (d ? d.filter((_, idx) => idx !== i) : d))
  }

  const confirmAdd = () => {
    if (!drafts || drafts.length === 0) return
    let added = 0
    for (const d of drafts) {
      const title = d.title
      if (!title) continue
      addTask({
        date: d.date ?? today,
        title,
        start: d.start,
        duration: d.duration,
      })
      added++
    }
    onToast(`已添加 ${added} 条`)
    onClose()
  }

  const draftLabel = (d: AiDraft) => {
    const dateStr = d.date ? formatMonthDay(d.date) : '待安排'
    const timeStr = d.start != null ? minToLabel2(d.start) : ''
    const timePart = timeStr ? ` ${timeStr}` : ''
    return `${dateStr}${timePart} · ${d.duration} 分钟`
  }

  return (
    <div className="modal-mask" onPointerDown={onClose}>
      <div className="modal ai-modal" onPointerDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={20} style={{ color: 'var(--accent-strong)' }} />
            AI 添加
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="modal-close"
              title="AI 接口设置"
              onClick={() => setShowSettings((s) => !s)}
            >
              <Settings2 size={17} />
            </button>
            <button className="modal-close" onClick={onClose} title="关闭">
              <X size={18} />
            </button>
          </div>
        </div>

        {showSettings ? (
          <div className="ai-settings">
            <div className="ai-presets">
              {presets.map((p) => (
                <button
                  key={p.label}
                  className="ghost-btn"
                  onClick={() => applyPreset(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <label className="ai-field">
              <span>接口地址 (Base URL)</span>
              <input
                value={cfgDraft.baseUrl}
                placeholder="https://api.openai.com/v1"
                onChange={(e) => setCfgDraft((c) => ({ ...c, baseUrl: e.target.value }))}
              />
            </label>
            <label className="ai-field">
              <span>API Key</span>
              <input
                type="password"
                value={cfgDraft.apiKey}
                placeholder="sk-..."
                onChange={(e) => setCfgDraft((c) => ({ ...c, apiKey: e.target.value }))}
              />
            </label>
            <label className="ai-field">
              <span>模型 (Model)</span>
              <input
                value={cfgDraft.model}
                placeholder="gpt-4o-mini"
                onChange={(e) => setCfgDraft((c) => ({ ...c, model: e.target.value }))}
              />
            </label>
            <div className="ai-settings-actions">
              <button className="focus-btn" onClick={saveSettings}>
                保存配置
              </button>
            </div>
            <div className="data-note">
              Key 只保存在这台浏览器里，仅随对话发给所填的接口地址，不会上传，也不会进仓库。
            </div>
          </div>
        ) : loading ? (
          <div className="ai-loading">
            <Loader2 size={26} className="spin" style={{ color: 'var(--accent-strong)' }} />
            <p>AI 正在拆解你的安排…</p>
          </div>
        ) : drafts ? (
          <>
            <div className="ai-preview-head">
              <span>识别出 {drafts.length} 条，确认后加入</span>
            </div>
            <div className="ai-draft-list">
              {drafts.map((d, i) => (
                <div className="ai-draft" key={i}>
                  <div className="ai-draft-main">
                    <button
                      className="task-check ai-check"
                      onClick={() => removeDraft(i)}
                      title="移除这条"
                    >
                      <Check size={14} strokeWidth={3.5} />
                    </button>
                    <div>
                      <div className="ai-draft-title">{d.title}</div>
                      <div className="ai-draft-meta">{draftLabel(d)}</div>
                    </div>
                  </div>
                  <button
                    className="task-action"
                    onClick={() => removeDraft(i)}
                    title="移除"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
            <div className="ai-settings-actions">
              <button className="focus-btn ghost" onClick={() => setDrafts(null)}>
                重新输入
              </button>
              <button className="focus-btn" onClick={confirmAdd}>
                添加 {drafts.length} 条
              </button>
            </div>
          </>
        ) : (
          <>
            <textarea
              ref={inputRef}
              className="ai-input"
              placeholder={'用一句话安排今天，比如：\n明天上午9点开周会，下午2点写周报，晚上买点菜'}
              value={input}
              rows={4}
              onChange={(e) => setInput(e.target.value)}
            />
            <div className="ai-settings-actions">
              <button className="focus-btn" onClick={run} disabled={!input.trim()}>
                <Sparkles size={15} />
                开始识别
              </button>
            </div>
            <div className="ai-hint">
              支持「今天 / 明天 / 后天 / 下周一」等，也支持具体钟点「9:30」。
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function minToLabel2(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}