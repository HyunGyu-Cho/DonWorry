import secrets
from typing import Annotated
from uuid import UUID

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    Header,
    HTTPException,
    Query,
    Request,
    status,
)

from app.config import Settings
from app.schemas.investigation import AcceptedResponse, InvestigationRequest, InvestigationResult
from app.service.investigations import InvestigationService


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_service(request: Request) -> InvestigationService:
    return request.app.state.investigation_service


# 서비스 간 키 확인 (ADR-0009 결정 1). 키를 설정하지 않았으면 열어 두지 않고 막는다
def require_service_key(
    settings: Annotated[Settings, Depends(get_settings)],
    x_service_key: Annotated[str | None, Header()] = None,
) -> None:
    if not settings.service_key:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "서비스 키가 설정되지 않았습니다")
    if x_service_key is None or not secrets.compare_digest(x_service_key, settings.service_key):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "서비스 키가 맞지 않습니다")


router = APIRouter(prefix="/investigations", dependencies=[Depends(require_service_key)])


# 바로 202로 답하고 조사는 응답 뒤에 돌린다 (Spring은 트랜잭션 밖에서 부르고 기다리지 않는다)
@router.post("", status_code=status.HTTP_202_ACCEPTED)
def accept(
    body: InvestigationRequest,
    background: BackgroundTasks,
    service: Annotated[InvestigationService, Depends(get_service)],
) -> AcceptedResponse:
    accepted, is_new = service.accept(body)
    if is_new:
        background.add_task(service.run, body)
    return accepted


# 콜백이 오지 않았을 때 Spring이 복구용으로 묻는다. attemptId가 현재 시도와 다르면 없는 것으로 본다
@router.get("/{report_id}")
def find(
    report_id: int,
    service: Annotated[InvestigationService, Depends(get_service)],
    attempt_id: Annotated[UUID | None, Query(alias="attemptId")] = None,
) -> InvestigationResult:
    result = service.find(report_id, attempt_id)
    if result is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "해당 조사 시도가 없습니다")
    return result
