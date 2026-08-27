import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Pause, Play, RotateCcw, X } from 'lucide-react'
import { usePlanner } from '../store'

const DURATIONS = [25, 45, 60]

export function FocusModal() {
  const focusTaskId = usePlanner((s) => s.focusTaskId)
  const setFocusTaskId = usePlanner((s) => s.setFocusTaskId)
  const tasks = usePlanner((s) => s.tasks)
  const toggleDone = usePlanner((s) => s.toggleDone)

  const task = tasks.find((t) => t.id === focusTaskId)

  const [total, setTotal] = useState(25 * 60)
  const [remaining, setRemaining] = useState(25 * 60)
  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState(false)
  const finishedRef = useRef(false)

  useEffect(() => {
    if (!running || finished) return
    const t = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1))
    }, 1000)
    return () => clearInterval(t)
  }, [running, finished])

  /* 倒计时归零后进入完成态 */
  useEffect(() => {
    if (remaining === 0 && running) {
      setRunning(false)
      if (!finishedRef.current) {
        finishedRef.current = true
        setFinished(true)
      }
    }
  }, [remaining, running])

  const close = () => {
    setFocusTaskId(null)
    setRunning(false)
    setFinished(false)
    finishedRef.current = false
  }

  const pickDuration = (mins: number) => {
    setTotal(mins * 60)
    setRemaining(mins * 60)
    setFinished(false)
    finishedRef.current = false
    setRunning(false)
  }

  const reset = () => {
    setRemaining(total)
    setFinished(false)
    finishedRef.current = false
    setRunning(false)
  }

  const mmss = useMemo(() => {
    const m = Math.floor(remaining / 60)
    const s = remaining % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }, [remaining])

  const C = 2 * Math.PI * 100
  const offset = finished ? 0 : C * (1 - remaining / total)

  if (!task) return null

  return (
    <div className="modal-mask" onPointerDown={close}>
      <div className="modal" onPointerDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">专注时光</div>
          <button className="modal-close" onClick={close} title="关闭">
            <X size={18} />
          </button>
        </div>

        <div className="focus-time">
          <div className="focus-dial">
            <svg viewBox="0 0 220 220">
              <circle className="focus-ring-bg" cx="110" cy="110" r="100" />
              <circle
                className="focus-ring"
                cx="110"
                cy="110"
                r="100"
                strokeDasharray={C}
                strokeDashoffset={offset}
              />
            </svg>
            <div className="focus-numbers">
              <div>
                <div className="focus-mm" style={finished ? { color: 'var(--accent-strong)' } : undefined}>
                  {finished ? '完成' : mmss}
                </div>
                <div className="focus-task">{task.title}</div>
              </div>
            </div>
          </div>

          <div className="focus-duration-row">
            {DURATIONS.map((d) => (
              <button
                key={d}
                className={`duration-chip ${!running && !finished && total === d * 60 ? 'active' : ''}`}
                onClick={() => pickDuration(d)}
              >
                {d} 分钟
              </button>
            ))}
          </div>

          <div className="focus-controls">
            {finished ? (
              <>
                <button
                  className="focus-btn"
                  onClick={() => {
                    toggleDone(task.id)
                    close()
                  }}
                >
                  <Check size={17} />
                  {task.done ? '已完成过啦' : '标记任务完成'}
                </button>
                <button className="focus-btn ghost" onClick={reset}>
                  <RotateCcw size={16} />
                  再来一轮
                </button>
              </>
            ) : (
              <>
                {running ? (
                  <button className="focus-btn" onClick={() => setRunning(false)}>
                    <Pause size={17} />
                    暂停
                  </button>
                ) : (
                  <button className="focus-btn" onClick={() => setRunning(true)}>
                    <Play size={17} />
                    开始专注
                  </button>
                )}
                <button className="focus-btn ghost" onClick={reset}>
                  <RotateCcw size={16} />
                  重置
                </button>
              </>
            )}
          </div>

          {finished && (
            <div className="focus-finish-note">
              <span style={{ fontSize: 16 }}>🌸</span>
              这一程辛苦啦，休息一下喝口水吧
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
