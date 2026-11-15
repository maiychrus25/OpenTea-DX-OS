# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Photo processing (spec 7.7): a refused upload, or two clean JPEGs. The container has 256 MB and half a CPU."""
import io
from dataclasses import dataclass
from enum import Enum

from PIL import Image, ImageFile, ImageOps

MAX_BYTES = 5 * 1024 * 1024
MAX_PIXELS = 16_000_000  # JPEG: decoded at reduced size (draft), about 60 MB at the limit
# PNG and WebP cannot be decoded smaller: measured in the app container (256 MB, the app itself needs about 70 MB),
# 16 megapixels peak at 116 MB (PNG RGB), 177 MB (PNG RGBA) and over 256 MB (WebP), so they are held to 6 megapixels.
MAX_PIXELS_LOSSLESS = 6_000_000
LARGE_EDGE = 1600
THUMB_EDGE = 640
QUALITY = 82
FORMATS = ("JPEG", "PNG", "WEBP")

Image.MAX_IMAGE_PIXELS = MAX_PIXELS * 2  # our own check below runs first; this is only Pillow's backstop
ImageFile.LOAD_TRUNCATED_IMAGES = False


class ImageRefusal(Enum):
    TOO_BIG = "Tệp ảnh tối đa 5 MB."
    NOT_AN_IMAGE = "Tệp này không phải ảnh JPEG, PNG hoặc WebP."
    TOO_MANY_PIXELS = "Ảnh quá lớn: JPEG tối đa 16 triệu điểm ảnh, PNG và WebP tối đa 6 triệu điểm ảnh (khoảng 3000 x 2000)."

    @property
    def message(self) -> str:
        return self.value


@dataclass(frozen=True)
class ProcessedImage:
    large: bytes  # JPEG, long edge at most 1600 px
    thumb: bytes  # JPEG, long edge at most 640 px
    width: int  # of large
    height: int


def _jpeg(image: Image.Image) -> bytes:
    out = io.BytesIO()
    # No exif=, icc_profile= or info: nothing of the original metadata (GPS included) is written.
    image.save(out, "JPEG", quality=QUALITY, optimize=True, progressive=True)
    return out.getvalue()


def process_image(data: bytes) -> ProcessedImage | ImageRefusal:
    if len(data) > MAX_BYTES:
        return ImageRefusal.TOO_BIG
    try:
        image = Image.open(io.BytesIO(data))  # reads the header only
        if image.format not in FORMATS:
            return ImageRefusal.NOT_AN_IMAGE
        limit = MAX_PIXELS if image.format == "JPEG" else MAX_PIXELS_LOSSLESS
        if image.width * image.height > limit:  # the size the file declares, checked before any decoding
            return ImageRefusal.TOO_MANY_PIXELS
        if image.format == "JPEG":
            image.draft("RGB", (LARGE_EDGE, LARGE_EDGE))  # the decoder scales down by 2, 4 or 8 while reading
        image.load()
        ImageOps.exif_transpose(image, in_place=True)
        # Shrink before any colour conversion or flattening: those copy the whole picture, and a 16-megapixel PNG or
        # WebP is 48 to 64 MB decoded, which two or three copies would push past the container's 256 MB.
        if image.mode == "P":
            image = image.convert("RGBA" if "transparency" in image.info else "RGB")
        elif image.mode not in ("RGB", "RGBA", "L", "LA"):
            image = image.convert("RGB")
        image.thumbnail((LARGE_EDGE, LARGE_EDGE), Image.Resampling.LANCZOS)
        if image.mode in ("RGBA", "LA"):
            rgba = image.convert("RGBA")
            image = Image.new("RGB", rgba.size, (255, 255, 255))
            image.paste(rgba, mask=rgba.getchannel("A"))
        else:
            image = image.convert("RGB")
        large, width, height = _jpeg(image), image.width, image.height
        image.thumbnail((THUMB_EDGE, THUMB_EDGE), Image.Resampling.LANCZOS)
        return ProcessedImage(large, _jpeg(image), width, height)
    except Image.DecompressionBombError:
        return ImageRefusal.TOO_MANY_PIXELS
    except (OSError, SyntaxError, ValueError, EOFError, Image.UnidentifiedImageError):
        return ImageRefusal.NOT_AN_IMAGE
