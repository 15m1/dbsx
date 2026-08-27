import { ChevronLeft, ChevronRight, Forward, RotateCcw } from 'lucide-react'
import { usePlanner } from '../store'
import { addDays, formatMonthDay, relativeLabel, todayKey, weekdayCN } from '../lib/date'

interface Props {
  onCarryOver: () => void
  onToast: (msg: string) => void
}

export function DateNav({ onCarryOver, onToast }: Props) {
  const selectedDate = usePlanner((s) => s.selectedDate)
  const setSelectedDate = usePlanner((s) => s.setSelectedDate)

  const isToday = selectedDate === todayKey()

  const shift = (delta: number) => {
    setSelectedDate(addDays(selectedDate, delta))
  }

  const backToday = () => {
    setSelectedDate(todayKey())
  }

  const handleCarry = () => {
    onCarryOver()
    onToast('未办事项已顺延到明天')
  }

  return (
    <section className="date-nav">
      <div className="date-nav-inner">
        <button className="nav-arrow" title="前一天" onClick={() => shift(-1)}>
          <ChevronLeft size={22} />
        </button>
        <div className="date-title">
          <div className={`day ${isToday ? '' : 'other'}`}>
            {formatMonthDay(selectedDate)}
          </div>
          <div className="week">
            {relativeLabel(selectedDate)} · {weekdayCN(selectedDate)}
          </div>
        </div>
        <button className="nav-arrow" title="后一天" onClick={() => shift(1)}>
          <ChevronRight size={22} />
        </button>
      </div>

      <div className="date-tools">
        {!isToday && (
          <button className="ghost-btn" onClick={backToday}>
            <RotateCcw size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
            回到今天
          </button>
        )}
        <button
          className="ghost-btn"
          title="把当日未办事项全部顺延到明天"
          onClick={handleCarry}
        >
          <Forward size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
          未办顺延
        </button>
      </div>
    </section>
  )
}
