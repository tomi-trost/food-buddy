import io
import uuid
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError


class InvalidPhoto(ValueError):
    pass


def normalize_photo(data: bytes, max_px: int) -> bytes:
    """Decode any supported image, apply EXIF rotation, shrink to max_px, return JPEG bytes."""
    try:
        with Image.open(io.BytesIO(data)) as img:
            img = ImageOps.exif_transpose(img).convert("RGB")
            img.thumbnail((max_px, max_px))
            out = io.BytesIO()
            img.save(out, format="JPEG", quality=85)
            return out.getvalue()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise InvalidPhoto("Not a readable image") from exc


def save_photo(root: Path, household_id: int, jpeg: bytes) -> str:
    """Store under <root>/<household>/<uuid>.jpg; returns the path relative to root."""
    relative = Path(str(household_id)) / f"{uuid.uuid4().hex}.jpg"
    target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(jpeg)
    return relative.as_posix()
