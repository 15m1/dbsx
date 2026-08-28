/** 时间轴常量与换算 */

/** 时间轴从 0:00 开始（全天） */
export const DAY_START = 0
/** 到 24:00 结束 */
export const DAY_END = 24 * 60
export const DAY_MINUTES = DAY_END - DAY_START

/** 像素与分钟 1:1 映射：1 分钟 = 1px，每小时 60px */
export const MINUTE_PX = 1

export const HOURS: number[] = Array.from(
  { length: DAY_END - DAY_START },
  (_, i) => DAY_START + i,
).filter((m) => m % 60 === 0)

/** 360 -> "6:00" */
export function minToLabel(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}:${pad2(m)}`
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function clampMinute(mins: number): number {
  return Math.min(DAY_END, Math.max(DAY_START, Math.round(mins)))
}

/** 格式化时长：90 -> "1.5 小时"，45 -> "45 分钟" */
export function durationLabel(mins: number): string {
  if (mins < 60) return `${mins} 分钟`
  const h = mins / 60
  return `${Number.isInteger(h) ? h : h.toFixed(1)} 小时`
}
