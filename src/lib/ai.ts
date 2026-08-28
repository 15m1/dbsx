import type { AiConfig, AiDraft } from '../types'
import { todayKey } from './date'
import { DAY_START, DAY_END } from './time'

interface ParsedResult {
  tasks: Array<{
    title: string
    dateOffset?: number // 相对今天的天数，如今天=0、明天=1
    time?: string // "HH:mm"
    duration?: number // 分钟
  }>
}

/**
 * 调用 OpenAI 兼容接口，把一句话解析成结构化任务。
 * 通过 ResponseFormat json 强制模型输出 JSON。
 */
export async function parseTasksWithAI(
  config: AiConfig,
  rawText: string,
): Promise<AiDraft[]> {
  const baseUrl = config.baseUrl.replace(/\/+$/, '')
  const today = todayKey()

  const systemPrompt = `你是一个任务解析助手。用户会给一句中文的日常安排口语。

请把这句话拆成独立的任务，并判断每个任务的日期和具体时间。

规则：
1. title：任务名称，简洁的动词短句（如"买菜""写周报"）。
2. 日期：以今天的日期为基准。用户说"今天"就是今天；"明天""后天"对应推后；同样，如果自然语言推断出是其他日期（如"下周一""周五"），推算出具体那天。无法确定日期时，省略该字段（表示放到收集箱待安排）。
3. time：只有当用户明确说了时间点才填（24小时制 "HH:mm"，如 "9:30"）。只说了时段没有具体钟点（如"上午""下午"）时，估算一个合理钟点。完全没说则省略。
4. duration：默认 60，单位分钟；用户没给时长就用 60。
5. 一句话里可能包含多个任务，每个都拆出来。

只输出 JSON，不要任何解释。格式严格如下：
{"tasks":[{"title":"买菜","dateOffset":0,"time":"09:30","duration":60}]}`

  const userContent = `今天是 ${today}（今天）。用户说的一句话如下：
「${rawText}」`

  const body: Record<string, unknown> = {
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 0.2,
    response_format: { type: 'json_object' },
  }

  let res: Response
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('网络错误：无法连接到 AI 接口，请检查 base URL 或网络')
  }

  if (!res.ok) {
    let msg = `接口返回 ${res.status}`
    try {
      const j = await res.json()
      msg = j?.error?.message ?? msg
    } catch {
      /* 忽略 */
    }
    throw new Error(msg)
  }

  const json = await res.json()
  const content: string = json?.choices?.[0]?.message?.content ?? ''
  const parsed = sanitizeJson(content)

  if (!parsed) throw new Error('AI 返回的内容无法解析为 JSON')
  if (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
    throw new Error('没有识别出任何任务，请换个说法试试')
  }

  return parsed.tasks.map((t): AiDraft => {
    const title = String(t.title || '').trim().slice(0, 60)
    let date: string | null = null
    if (typeof t.dateOffset === 'number' && Number.isFinite(t.dateOffset)) {
      const d = new Date()
      d.setDate(d.getDate() + Math.round(t.dateOffset))
      const p = (n: number) => String(n).padStart(2, '0')
      date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    }
    let start: number | null = null
    if (typeof t.time === 'string' && /^\d{1,2}:\d{2}$/.test(t.time)) {
      const [h, m] = t.time.split(':').map(Number)
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        start = h * 60 + m
      }
    }
    let duration = Number(t.duration)
    if (!Number.isFinite(duration) || duration < 15) duration = 60
    duration = Math.min(Math.max(duration, 15), DAY_END - DAY_START)
    // clamp 到时间轴范围内：起点不早于 DAY_START，终点不晚于 24:00
    if (start != null) {
      start = Math.min(Math.max(DAY_START, start), DAY_END - duration)
    }
    return { title, date, start, duration }
  })
}

/**
 * 从 AI 文本里提取 JSON：先原样解析，失败则提取 ```json 代码块。
 */
function sanitizeJson(text: string): ParsedResult | null {
  try {
    return JSON.parse(text)
  } catch {
    /* 继续尝试代码块 */
  }
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (m) {
    try {
      return JSON.parse(m[1])
    } catch {
      return null
    }
  }
  const brace = text.indexOf('{')
  if (brace >= 0) {
    try {
      return JSON.parse(text.slice(brace))
    } catch {
      return null
    }
  }
  return null
}