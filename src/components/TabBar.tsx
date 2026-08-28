import { LayoutGrid, StickyNote } from 'lucide-react'

export type PageKey = 'today' | 'notes'

interface Props {
  page: PageKey
  onChange: (p: PageKey) => void
}

export function TabBar({ page, onChange }: Props) {
  return (
    <nav className="tab-bar">
      <button
        className={`tab-item ${page === 'today' ? 'active' : ''}`}
        onClick={() => onChange('today')}
      >
        <LayoutGrid size={19} />
        <span>今日手账</span>
      </button>
      <button
        className={`tab-item ${page === 'notes' ? 'active' : ''}`}
        onClick={() => onChange('notes')}
      >
        <StickyNote size={19} />
        <span>灵感墙</span>
      </button>
    </nav>
  )
}