import { useMemo } from 'react'

interface SimpleQRCodeProps {
  value: string
  size?: number
  className?: string
}

/**
 * 轻量级二维码 SVG 生成器（无需外部依赖）
 * 基于输入值生成确定性的伪二维码图案，包含真实二维码的所有视觉特征：
 * - 三个定位角（Finder Patterns）
 * - 定时图案（Timing Patterns）
 * - 格式信息区域
 * - 数据区域用哈希种子填充
 */
export function SimpleQRCode({ value, size = 128, className }: SimpleQRCodeProps) {
  const modules = useMemo(() => generateQRModules(value), [value])
  const cellSize = size / 25

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 25 25"
      className={className}
      style={{ display: 'block' }}
    >
      <rect width="25" height="25" fill="white" />
      {modules.map((row, y) =>
        row.map((isBlack, x) =>
          isBlack ? (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width={1}
              height={1}
              fill="#0f172a"
            />
          ) : null
        )
      )}
    </svg>
  )
}

function generateQRModules(value: string): boolean[][] {
  const size = 25
  const modules: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false)
  )

  // 1. 三个定位角 (Finder Patterns) - 7x7
  // 左上角
  drawFinderPattern(modules, 0, 0)
  // 右上角
  drawFinderPattern(modules, size - 7, 0)
  // 左下角
  drawFinderPattern(modules, 0, size - 7)

  // 2. 定时图案 (Timing Patterns) - 第6行和第6列的黑白交替
  for (let i = 8; i < size - 8; i++) {
    modules[6][i] = i % 2 === 0
    modules[i][6] = i % 2 === 0
  }

  // 3. 格式信息区域预留 (保留为空白)
  // 定位角附近的格式信息区域已经被定位角覆盖

  // 4. 数据区域用基于 value 的哈希填充
  const seed = hashString(value)
  const rng = seededRandom(seed)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // 跳过定位角和定时图案区域
      if (isReservedArea(x, y, size)) continue
      modules[y][x] = rng() > 0.5
    }
  }

  return modules
}

function drawFinderPattern(modules: boolean[][], startX: number, startY: number) {
  // 7x7 定位角：外黑(7x7) → 内白(5x5) → 中心黑(3x3)
  for (let dy = 0; dy < 7; dy++) {
    for (let dx = 0; dx < 7; dx++) {
      const x = startX + dx
      const y = startY + dy
      // 外框黑
      if (dx === 0 || dx === 6 || dy === 0 || dy === 6) {
        modules[y][x] = true
      }
      // 内白 (1-5)
      else if (dx >= 1 && dx <= 5 && dy >= 1 && dy <= 5) {
        // 中心黑 (2-4)
        if (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4) {
          modules[y][x] = true
        } else {
          modules[y][x] = false
        }
      }
    }
  }
}

function isReservedArea(x: number, y: number, size: number): boolean {
  // 左上角定位角
  if (x < 9 && y < 9) return true
  // 右上角定位角
  if (x >= size - 8 && y < 9) return true
  // 左下角定位角
  if (x < 9 && y >= size - 8) return true
  // 定时图案
  if (x === 6 || y === 6) return true
  return false
}

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0
  }
  return Math.abs(hash)
}

function seededRandom(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }
}
