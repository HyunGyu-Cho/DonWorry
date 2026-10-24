// 화면에 보일 값을 사람 말로 바꾼다 (화면 원칙: docs/frontend/screen-principles.md)
// React 없이 순수 함수만 둔다 — node 테스트가 직접 불러온다
// 날짜는 한국 시간 기준

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const KST = 9 * HOUR

// 65만 원 · 3만 8,000원 · 1,250만 원 · 900원 — 만 원 단위는 "만", 그 아래는 쉼표
export function koreanWon(amount: number): string {
  const sign = amount < 0 ? '−' : ''
  const abs = Math.abs(Math.round(amount))
  const man = Math.floor(abs / 10_000)
  const rest = abs % 10_000
  const fmt = (n: number) => new Intl.NumberFormat('ko-KR').format(n)
  if (man === 0) return `${sign}${fmt(rest)}원`
  if (rest === 0) return `${sign}${fmt(man)}만 원`
  return `${sign}${fmt(man)}만 ${fmt(rest)}원`
}

const kstParts = (date: Date) => {
  const d = new Date(date.getTime() + KST)
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
    hh: String(d.getUTCHours()).padStart(2, '0'),
    mm: String(d.getUTCMinutes()).padStart(2, '0'),
  }
}

// 방금 · 3분 전 · 2시간 전(같은 날) · 오늘 09:10 · 어제 14:02 · 10월 20일 · 2025년 10월 20일
export function relativeTime(iso: string, now: Date = new Date()): string {
  const at = new Date(iso)
  const diff = now.getTime() - at.getTime()
  const a = kstParts(at)
  const n = kstParts(now)
  const sameDay = a.y === n.y && a.m === n.m && a.d === n.d
  if (diff >= 0 && diff < MINUTE) return '방금'
  if (diff >= 0 && diff < HOUR) return `${Math.floor(diff / MINUTE)}분 전`
  if (sameDay && diff >= 0 && diff < 3 * HOUR) return `${Math.floor(diff / HOUR)}시간 전`
  if (sameDay) return `오늘 ${a.hh}:${a.mm}`
  const yesterday = kstParts(new Date(now.getTime() - 24 * HOUR))
  if (a.y === yesterday.y && a.m === yesterday.m && a.d === yesterday.d) {
    return `어제 ${a.hh}:${a.mm}`
  }
  if (a.y === n.y) return `${a.m}월 ${a.d}일`
  return `${a.y}년 ${a.m}월 ${a.d}일`
}

// "1173" → "끝자리 1173 카드", 모르면 "카드"
export function cardName(last4: string | null): string {
  return last4 && /^\d{4}$/.test(last4) ? `끝자리 ${last4} 카드` : '카드'
}

const COUNTRY: Record<string, string> = {
  KR: '한국',
  US: '미국',
  JP: '일본',
  CN: '중국',
  DE: '독일',
  NL: '네덜란드',
  RU: '러시아',
  VN: '베트남',
  GB: '영국',
  SG: '싱가포르',
}

// ISO 국가 코드 → 나라 이름, 모르면 "해외"
export function countryName(code: string | null): string {
  if (!code) return '알 수 없는 나라'
  return COUNTRY[code.toUpperCase()] ?? '해외'
}

// 서버가 준 설명(label)만 쓴다. 없으면 IP 원문을 내보내지 않는다 (원문은 펼치기 안에서만)
export function placeName(label: string | null | undefined): string {
  return label?.trim() ? label.trim() : '확인되지 않은 접속 위치'
}

// 650000, 40000 → "평소의 16배". 1.5배 미만이면 "평소 수준", 기준이 없으면 null
export function timesUsual(value: number, usual: number | null): string | null {
  if (!usual || usual <= 0) return null
  const ratio = value / usual
  if (ratio < 1.5) return '평소 수준'
  return `평소의 ${ratio < 10 ? Math.round(ratio * 10) / 10 : Math.round(ratio)}배`
}
