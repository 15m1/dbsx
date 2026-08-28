import { useEffect, useMemo, useRef, useState } from 'react'
import { Header } from './components/Header'
import { DateNav } from './components/DateNav'
import { SummaryBar } from './components/SummaryBar'
import { Inbox } from './components/Inbox'
import { Timeline } from './components/Timeline'
import { FocusModal } from './components/FocusModal'
import { DataModal } from './components/DataModal'
import { AiAddModal } from './components/AiAddModal'
import { NotesPage } from './components/NotesPage'
import { TabBar, type PageKey } from './components/TabBar'
import { usePlanner } from './store'

function App() {
  const tasks = usePlanner((s) => s.tasks)
  const theme = usePlanner((s) => s.theme)
  const selectedDate = usePlanner((s) => s.selectedDate)
  const carryOver = usePlanner((s) => s.carryOver)
  const setFocusTaskId = usePlanner((s) => s.setFocusTaskId)

  const [page, setPage] = useState<PageKey>('today')
  const [dataOpen, setDataOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [activeTag, setActiveTag] = useState<string>('all')
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const dayTasks = useMemo(
    () => tasks.filter((t) => t.date === selectedDate),
    [tasks, selectedDate],
  )

  /* 收集当天出现的全部标签，用于过滤栏 */
  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const t of dayTasks) for (const tag of t.tags ?? []) set.add(tag)
    return Array.from(set)
  }, [dayTasks])

  const filteredDay = useMemo(() => {
    if (!activeTag || activeTag === 'all') return dayTasks
    return dayTasks.filter((t) => t.tags?.includes(activeTag))
  }, [dayTasks, activeTag])

  const scheduled = useMemo(
    () => filteredDay.filter((t) => t.start != null),
    [filteredDay],
  )
  const inboxTasks = useMemo(
    () => filteredDay.filter((t) => t.start == null),
    [filteredDay],
  )

  const showToast = (msg: string) => {
    setToast(msg)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2200)
  }

  return (
    <div className="app">
      <Header onOpenData={() => setDataOpen(true)} onOpenAi={() => setAiOpen(true)} />

      {page === 'today' ? (
        <>
          <DateNav
            onCarryOver={() => carryOver(selectedDate)}
            onToast={showToast}
          />

          <SummaryBar tasks={filteredDay} />

          {allTags.length > 0 && (
            <div className="tag-filter">
              <button
                className={`tag-filter-chip ${activeTag === 'all' ? 'active' : ''}`}
                onClick={() => setActiveTag('all')}
              >
                全部
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  className={`tag-filter-chip ${activeTag === tag ? 'active' : ''}`}
                  onClick={() => setActiveTag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          <main className="workspace">
            <Inbox tasks={inboxTasks} onFocus={setFocusTaskId} />
            <Timeline tasks={scheduled} onFocus={setFocusTaskId} />
          </main>
        </>
      ) : (
        <main className="notes-main">
          <NotesPage />
        </main>
      )}

      <FocusModal />
      {dataOpen && <DataModal onClose={() => setDataOpen(false)} onToast={showToast} />}
      {aiOpen && <AiAddModal onClose={() => setAiOpen(false)} onToast={showToast} />}

      <TabBar page={page} onChange={setPage} />

      <div className={`toast ${toast ? 'show' : ''}`}>{toast}</div>
    </div>
  )
}

export default App
