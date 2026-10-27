import json
import re
from dataclasses import dataclass, field

from app.agent.llm import LlmMessage
from app.schemas.report import PaymentFraudDraft, ReportDraft

# 근거 검사 (#92) — 보고서에 쓴 출처 · 숫자 · 결제 번호가 이번 조사에서 받은 증거에 있는지 본다
# 뜻이 맞는지는 보지 않는다. 확인할 수 있는 것(출처 이름 · 금액 · 배수 · 건수 · 번호)만

# 원 · 만 원 · 배 · 건이 붙은 숫자. 점수(점) · 날짜는 보지 않는다 (★3)
_NUMBER = re.compile(r"(\d[\d,]*(?:\.\d+)?)\s*(만\s*원|원|배|건)")
# "결제 57" 처럼 번호를 쓴 곳. "결제 5건" · "결제 2번" 같은 개수는 뺀다
_PAYMENT_NO = re.compile(r"결제\s*(?:번호\s*)?#?(\d+)(?![\d,.]|\s*(?:건|번|원|만|배|회|%))")

# 배수는 반올림 차이만 같은 값으로 본다 (16.25배 ↔ 16.3배)
_RATIO_TOLERANCE = 0.051


# 알림 문장에 쓰는 창구 이름 — Spring ReportTool 라벨과 같다 (직원이 읽는 화면)
TOOL_LABELS = {
    "get_fds_evidence": "FDS 점수 · 적중 Rule",
    "get_payment_history": "고객 과거 결제",
    "get_payment_authentication": "카드 인증 · 승인 정보",
    "get_security_events": "로그인 · 기기 기록",
    "get_order_context": "주문 · 구매자 정보",
    "find_similar_cases": "비슷한 사건",
}


@dataclass
class GroundingResult:
    problems: list[str] = field(default_factory=list)
    # 받고도 보고서에 한 번도 출처로 쓰지 않은 창구 — 다시 쓰게 하지 않고 알림만 (★4)
    unused: list[str] = field(default_factory=list)


def check_grounding(
    draft: ReportDraft, messages: list[LlmMessage], payment_ids: list[int]
) -> GroundingResult:
    results = received(messages)
    # 증거 수집 끝 신호(#94)는 증거가 아니다
    ready = {
        name
        for name, body in results.items()
        if body.get("ready") is True and name != "finish_evidence"
    }
    numbers, counts = _evidence_numbers(results)
    result = GroundingResult()

    points = [*draft.risk_points, *draft.normal_points]
    for point in points:
        if not any(name in point.source for name in ready):
            result.problems.append(f"'{point.title}'의 출처 {point.source}는 받은 증거가 아님")

    texts = [draft.verdict, draft.summary, *(r.label for r in draft.recommendations)]
    texts += [f"{p.title} {p.detail}" for p in points]
    if isinstance(draft, PaymentFraudDraft):
        texts += [a.reason for a in draft.payment_advice]
    known_payments = {str(pid) for pid in payment_ids}
    for text in texts:
        for raw, unit in _NUMBER.findall(text):
            if not _grounded(raw, unit, numbers, counts):
                result.problems.append(f"'{raw}{unit.replace(' ', '')}'가 증거에 없음")
        for number in _PAYMENT_NO.findall(text):
            if number not in known_payments:
                result.problems.append(f"결제 {number}은 이 사건 결제가 아님")

    cited = " ".join(p.source for p in points)
    result.unused = [
        name
        for name in sorted(ready)
        if name not in cited and _has_data(results[name]) and name != "get_case_payments"
    ]
    result.problems = list(dict.fromkeys(result.problems))
    return result


# 대화에 쌓인 창구 결과 (창구 이름 → Spring 응답). 읽을 수 없는 결과는 받지 못한 것으로 본다
def received(messages: list[LlmMessage]) -> dict[str, dict[str, object]]:
    results: dict[str, dict[str, object]] = {}
    for message in messages:
        if message.role != "tool" or message.tool_name is None:
            continue
        try:
            parsed = json.loads(message.content)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            results[message.tool_name] = parsed
    return results


def _has_data(body: dict[str, object]) -> bool:
    data = body.get("data")
    return isinstance(data, list) and len(data) > 0


# 받은 증거 속 모든 숫자 + 목록 길이(건수) + 사건 결제 금액 합계
def _evidence_numbers(results: dict[str, dict[str, object]]) -> tuple[set[float], set[int]]:
    numbers: set[float] = set()
    counts: set[int] = set()

    def walk(value: object) -> None:
        if isinstance(value, bool):
            return
        if isinstance(value, int | float):
            numbers.add(float(value))
        elif isinstance(value, dict):
            for item in value.values():
                walk(item)
        elif isinstance(value, list):
            counts.add(len(value))
            for item in value:
                walk(item)

    for name, body in results.items():
        if body.get("ready") is not True:
            continue
        walk(body.get("data"))
        if name == "get_case_payments" and isinstance(body.get("data"), list):
            amounts = [r.get("amount") for r in body["data"] if isinstance(r, dict)]
            numbers.add(float(sum(a for a in amounts if isinstance(a, int))))
    return numbers, counts


def _grounded(raw: str, unit: str, numbers: set[float], counts: set[int]) -> bool:
    value = float(raw.replace(",", ""))
    unit = unit.replace(" ", "")
    if unit == "건":
        return value in numbers or int(value) in counts
    if unit == "배":
        return any(abs(value - n) <= _RATIO_TOLERANCE for n in numbers)
    amount = value * 10_000 if unit == "만원" else value
    # "4만 원"처럼 만 원 단위로 줄여 쓴 값은 그 단위 반올림까지 같은 값으로 본다
    # "4만 원대"처럼 정수 만 원이면 반올림한 만 원 단위까지 같은 값으로 본다 (43,000원 → 4만 원)
    if unit == "만원":
        whole = value.is_integer()
        return any(
            n == amount
            or round(n / 10_000, 1) == round(value, 1)
            or (whole and round(n / 10_000) == value)
            for n in numbers
        )
    return amount in numbers
