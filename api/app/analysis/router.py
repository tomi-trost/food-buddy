from fastapi import APIRouter, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from app.analysis.models import AnalysisJob
from app.analysis.photos import InvalidPhoto, normalize_photo, save_photo
from app.analysis.schemas import AnalysisJobOut
from app.analysis.tasks import analyze_photo
from app.auth.deps import CurrentUser, Session
from app.config import get_settings

router = APIRouter(prefix="/analyses", tags=["analysis"])


def to_out(job: AnalysisJob) -> AnalysisJobOut:
    return AnalysisJobOut(
        id=job.id,
        status=job.status,
        photo_url=f"/api/analyses/{job.id}/photo",
        provider=job.provider,
        result=job.result,
        error=job.error,
        created_at=job.created_at,
        finished_at=job.finished_at,
    )


async def get_own_job(session: Session, user: CurrentUser, job_id: int) -> AnalysisJob:
    job = await session.get(AnalysisJob, job_id)
    if job is None or job.household_id != user.household_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Analysis not found")
    return job


@router.post("", status_code=status.HTTP_202_ACCEPTED)
async def create_analysis(photo: UploadFile, user: CurrentUser, session: Session) -> AnalysisJobOut:
    settings = get_settings()
    max_bytes = settings.max_upload_mb * 1024 * 1024
    data = await photo.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "Photo too large")
    try:
        jpeg = normalize_photo(data, settings.photo_max_px)
    except InvalidPhoto as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc

    job = AnalysisJob(
        household_id=user.household_id,
        user_id=user.id,
        photo_path=save_photo(settings.photo_dir, user.household_id, jpeg),
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)
    await analyze_photo.defer_async(job_id=job.id)
    return to_out(job)


@router.get("/{job_id}")
async def get_analysis(job_id: int, user: CurrentUser, session: Session) -> AnalysisJobOut:
    return to_out(await get_own_job(session, user, job_id))


@router.get("/{job_id}/photo", response_class=FileResponse)
async def get_analysis_photo(job_id: int, user: CurrentUser, session: Session) -> FileResponse:
    job = await get_own_job(session, user, job_id)
    return FileResponse(get_settings().photo_dir / job.photo_path, media_type="image/jpeg")
