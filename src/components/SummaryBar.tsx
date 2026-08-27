import { useMemo } from 'react'
import type { Task } from '../types'

interface Props {
  tasks: Task[]
}

export function SummaryBar({ tasks }: Props) {
  const doneCount = useMemo(() => tasks.filter((t) => t.done).length, [tasks])
  const scheduledCount = useMemo(
    () => tasks.filter((t) => t.start != null && !t.done).length,
    [tasks],
  )
  const inboxCount = useMemo(
    () => tasks.filter((t) => t.start == null && !t.done).length,
    [tasks],
  )
  const total = tasks.length

  const percent = total ? Math.round((doneCount / total) * 100) : 0

  return (
    <section className="summary">
      <div className="summary-item">
        <span className="summary-num">{doneCount}</span>
        <span className="summary-label">已完成</span>
      </div>
      <div className="summary-divider" />
      <div className="summary-item">
        <span className="summary-num soft">{scheduledCount}</span>
        <span className="summary-label">排程中</span>
      </div>
      <div className="summary-divider" />
      <div className="summary-item">
        <span className="summary-num soft">{inboxCount}</span>
        <span className="summary-label">待安排</span>
      </div>
      <div className="summary-divider" />
      <div className="summary-item">
        <span className="summary-num">{percent}%</span>
        <span className="summary-label">今日进度</span>
      </div>
    </section>
  )
}
