import { useEffect, useMemo, useRef, useState } from 'react'
import { Header } from './components/Header'
import { DateNav } from './components/DateNav'
import { SummaryBar } from './components/SummaryBar'
import { Inbox } from './components/Inbox'
import { Timeline } from './components/Timeline'
import { FocusModal } from './components/FocusModal'
import { DataModal } from './components/DataModal'
import { AiAddModal } from './components/AiAddModal'
import { usePlanner } from './store'

function App() {
  const tasks = usePlanner((s) => s.tasks)
  const theme = usePlanner((s) => s.theme)
  const selectedDate = usePlanner((s) => s.selectedDate)
  const carryOver = usePlanner((s) => s.carryOver)
  const setFocusTaskId = usePlanner((s) => s.setFocusTaskId)

  const [dataOpen, setDataOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const dayTasks = useMemo(
    () => tasks.filter((t) => t.date === selectedDate),
    [tasks, selectedDate],
  )
  const scheduled = useMemo(() => dayTasks.filter((t) => t.start != null), [dayTasks])
  const inboxTasks = useMemo(() => dayTasks.filter((t) => t.start == null), [dayTasks])

  const showToast = (msg: string) => {
    setToast(msg)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2200)
  }

  return (
    <div className="app">
      <Header onOpenData={() => setDataOpen(true)} onOpenAi={() => setAiOpen(true)} />

      <DateNav
        onCarryOver={() => carryOver(selectedDate)}
        onToast={showToast}
      />

      <SummaryBar tasks={dayTasks} />

      <main className="workspace">
        <Inbox tasks={inboxTasks} onFocus={setFocusTaskId} />
        <Timeline tasks={scheduled} onFocus={setFocusTaskId} />
      </main>

      <FocusModal />
      {dataOpen && <DataModal onClose={() => setDataOpen(false)} onToast={showToast} />}
      {aiOpen && <AiAddModal onClose={() => setAiOpen(false)} onToast={showToast} />}

      <div className={`toast ${toast ? 'show' : ''}`}>{toast}</div>
    </div>
  )
}

export default App
