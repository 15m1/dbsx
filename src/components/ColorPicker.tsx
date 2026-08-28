import type { TaskColor } from '../types'

const COLORS: TaskColor[] = [
  'apricot',
  'terracotta',
  'moss',
  'mist',
  'rose',
  'lavender',
]

interface Props {
  value: TaskColor
  onChange: (c: TaskColor) => void
}

/** 卡片颜色选择器：一组色块，点击即改色 */
export function ColorPicker({ value, onChange }: Props) {
  return (
    <div className="color-picker">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className={`color-dot ${value === c ? 'active' : ''}`}
          data-color={c}
          title={c}
          onClick={(e) => {
            e.stopPropagation()
            onChange(c)
          }}
        />
      ))}
    </div>
  )
}