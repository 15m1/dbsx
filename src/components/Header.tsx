import { Database, Moon, Sparkles, Sun } from 'lucide-react'
import { usePlanner } from '../store'
import type { Theme } from '../types'

interface Props {
  onOpenData: () => void
  onOpenAi: () => void
}

export function Header({ onOpenData, onOpenAi }: Props) {
  const theme = usePlanner((s) => s.theme)
  const setTheme = usePlanner((s) => s.setTheme)

  const toggleTheme = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
  }

  return (
    <header className="app-header">
      <div className="logo">
        <span className="logo-mark">拾光</span>
        <div>
          <div className="logo-name">每日时光手账</div>
          <div className="logo-sub">DAY PLANNER · 本子里的每一天</div>
        </div>
      </div>
      <div className="header-actions">
        <button
          className="icon-btn ai-btn"
          title="AI 添加任务"
          aria-label="AI 添加"
          onClick={onOpenAi}
        >
          <Sparkles size={19} />
        </button>
        <button
          className="icon-btn"
          title={theme === 'light' ? '切换到深夜模式' : '切换到日间模式'}
          aria-label="切换主题"
          onClick={toggleTheme}
        >
          {theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}
        </button>
        <button
          className="icon-btn"
          title="备份与导入数据"
          aria-label="数据管理"
          onClick={onOpenData}
        >
          <Database size={19} />
        </button>
      </div>
    </header>
  )
}
