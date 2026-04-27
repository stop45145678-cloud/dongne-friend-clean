export type SpiritTitle = {
  min: number
  max: number
  title: string
  spirit: string
  className: string
  desc: string
}

export const spiritTitles: SpiritTitle[] = [
  { min: 100, max: Infinity, title: '엔젤', spirit: '👼', className: 'angel', desc: '최고의 온기를 가진 특별한 존재!' },
  { min: 50, max: 99.999, title: '천사의 날개', spirit: '🪽', className: 'wing', desc: '천사 같은 따뜻한 마음의 소유자!' },
  { min: 40, max: 49.999, title: '선한 사람', spirit: '🔥', className: 'good', desc: '선한 마음으로 주변을 따뜻하게 만드는 사람!' },
  { min: 37, max: 39.999, title: '따뜻한 사람', spirit: '🔥', className: 'warm', desc: '함께 있으면 기분이 따뜻해지는 사람!' },
  { min: 33, max: 36.999, title: '차분한 사람', spirit: '💧', className: 'calm', desc: '차분하고 안정감 있는 편안한 사람!' },
  { min: 20, max: 32.999, title: '차가운 사람', spirit: '❄️', className: 'cold', desc: '아직 온기가 조금 부족한 신비로운 사람!' },
  { min: -100, max: 19.999, title: '악마', spirit: '😈', className: 'devil', desc: '조금 더 따뜻해질 수 있어요.' },
]

export function getSpiritTitle(warmth: number) {
  return spiritTitles.find((item) => warmth >= item.min && warmth <= item.max) ?? spiritTitles[spiritTitles.length - 1]
}

export function clampWarmth(warmth: number) {
  return Math.max(-100, Math.min(100, warmth))
}

export function warmthPercent(warmth: number) {
  return ((clampWarmth(warmth) + 100) / 200) * 100
}
