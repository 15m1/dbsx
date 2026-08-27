/** 日期工具：统一使用本地时区与 YYYY-MM-DD 字符串键 */

export function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function todayKey(): string {
  return toDateKey(new Date())
}

export function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(key: string, delta: number): string {
  const d = parseKey(key)
  d.setDate(d.getDate() + delta)
  return toDateKey(d)
}

/** 8 月 27 日 */
export function formatMonthDay(key: string): string {
  const d = parseKey(key)
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

const WEEK = ['日', '一', '二', '三', '四', '五', '六']

/** 星期三 */
export function weekdayCN(key: string): string {
  return `星期${WEEK[parseKey(key).getDay()]}`
}

/** 相对今天的中文描述：今天 / 明天 / 昨天 / 日期 */
export function relativeLabel(key: string): string {
  const today = todayKey()
  if (key === today) return '今天'
  if (key === addDays(today, 1)) return '明天'
  if (key === addDays(today, -1)) return '昨天'
  return formatMonthDay(key)
}
