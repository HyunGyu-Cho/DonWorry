// 시연용 외부 화면 주소 — 환경 설정에 있을 때만 버튼을 보여 준다 (운영 환경에서는 비워 둠)
// Mailpit = 시연 PC에서 돌아가는 가짜 메일함 (docker compose up -d mailpit)
export const MAILPIT_URL: string | undefined = import.meta.env.VITE_MAILPIT_URL || undefined
