# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import io
import os
import urllib.parse

import pytest
from PIL import Image

from tea_tour import media, qr


def encode(image, fmt="JPEG", **kw) -> bytes:
    out = io.BytesIO()
    image.save(out, fmt, **kw)
    return out.getvalue()


def decode(data: bytes) -> Image.Image:
    image = Image.open(io.BytesIO(data))
    image.load()
    return image


def test_a_renamed_text_file_is_refused():
    assert media.process_image(b"hello, I am not a picture" * 100) is media.ImageRefusal.NOT_AN_IMAGE
    assert media.process_image(b"") is media.ImageRefusal.NOT_AN_IMAGE
    assert media.process_image(b"<svg xmlns='http://www.w3.org/2000/svg'/>") is media.ImageRefusal.NOT_AN_IMAGE


def test_a_gif_is_refused_because_only_jpeg_png_webp_are_accepted():
    assert media.process_image(encode(Image.new("RGB", (50, 50), "red"), "GIF")) is media.ImageRefusal.NOT_AN_IMAGE


def test_six_megabytes_is_refused_before_anything_else():
    assert media.process_image(os.urandom(6 * 1024 * 1024)) is media.ImageRefusal.TOO_BIG
    just_under = b"\xff\xd8" + b"0" * (5 * 1024 * 1024 - 2)
    assert media.process_image(just_under) is media.ImageRefusal.NOT_AN_IMAGE  # past the size gate, not an image


def test_twenty_megapixels_is_refused_on_the_declared_size_without_decoding(monkeypatch):
    big = encode(Image.new("L", (5000, 4000), 128), "PNG")  # tiny file, 20 megapixels declared
    assert len(big) < media.MAX_BYTES

    def forbidden(self, *args, **kwargs):
        raise AssertionError("the pixels were decoded before the size check")

    monkeypatch.setattr(Image.Image, "load", forbidden)
    assert media.process_image(big) is media.ImageRefusal.TOO_MANY_PIXELS


def test_exactly_sixteen_megapixels_is_accepted():
    flat = encode(Image.new("L", (4000, 4000), 90), "JPEG", quality=50)
    result = media.process_image(flat)
    assert isinstance(result, media.ProcessedImage) and max(result.width, result.height) == 1600


def test_png_and_webp_are_held_to_six_megapixels_because_they_cannot_be_decoded_smaller():
    assert isinstance(media.process_image(encode(Image.new("L", (3000, 2000), 9), "PNG")), media.ProcessedImage)
    assert media.process_image(encode(Image.new("L", (3001, 2000), 9), "PNG")) is media.ImageRefusal.TOO_MANY_PIXELS
    assert media.process_image(encode(Image.new("RGB", (4000, 2000), 9), "WEBP")) is media.ImageRefusal.TOO_MANY_PIXELS
    assert isinstance(media.process_image(encode(Image.new("L", (4000, 2000), 9), "JPEG")), media.ProcessedImage)


def test_a_truncated_jpeg_is_refused():
    whole = encode(Image.effect_noise((600, 400), 80).convert("RGB"))
    assert media.process_image(whole[: len(whole) // 2]) is media.ImageRefusal.NOT_AN_IMAGE


def test_long_edges_are_at_most_1600_and_640_and_small_images_are_not_enlarged():
    result = media.process_image(encode(Image.new("RGB", (3000, 2000), (20, 120, 60))))
    assert (result.width, result.height) == (1600, 1067)
    assert decode(result.large).size == (1600, 1067)
    assert max(decode(result.thumb).size) == 640
    small = media.process_image(encode(Image.new("RGB", (300, 200), (20, 120, 60))))
    assert decode(small.large).size == (300, 200) and decode(small.thumb).size == (300, 200)


def test_outputs_are_jpeg_without_any_metadata_gps_included():
    image = Image.new("RGB", (800, 600), (200, 30, 30))
    exif = Image.Exif()
    exif[0x010F] = "SecretCameraMaker"
    exif[0x8825] = {1: "N", 2: (21.0, 1.0, 12.0), 3: "E", 4: (105.0, 50.0, 30.0)}  # GPS IFD
    original = encode(image, "JPEG", exif=exif.tobytes(), icc_profile=b"x" * 40)
    assert b"SecretCameraMaker" in original  # the input really carries it
    result = media.process_image(original)
    for data in (result.large, result.thumb):
        assert data[:2] == b"\xff\xd8" and b"Exif" not in data and b"SecretCameraMaker" not in data
        reopened = Image.open(io.BytesIO(data))
        assert reopened.format == "JPEG" and len(reopened.getexif()) == 0 and "icc_profile" not in reopened.info


def test_exif_orientation_is_applied():
    wide = Image.new("RGB", (400, 200), (10, 100, 10))
    exif = Image.Exif()
    exif[0x0112] = 6  # rotate 90 degrees clockwise to display
    result = media.process_image(encode(wide, "JPEG", exif=exif.tobytes()))
    assert (result.width, result.height) == (200, 400)


def test_png_with_alpha_becomes_a_jpeg_on_white():
    rgba = Image.new("RGBA", (100, 100), (255, 0, 0, 0))  # fully transparent red
    rgba.paste((0, 0, 255, 255), (0, 0, 50, 100))          # opaque blue on the left half
    result = media.process_image(encode(rgba, "PNG"))
    flat = decode(result.large).convert("RGB")
    assert flat.getpixel((90, 50)) == pytest.approx((255, 255, 255), abs=3)
    assert flat.getpixel((10, 50))[2] > 200 and flat.getpixel((10, 50))[0] < 60


def test_palette_png_with_transparency_and_webp_work():
    palette = Image.new("P", (40, 40), 0)
    palette.info["transparency"] = 0
    assert isinstance(media.process_image(encode(palette, "PNG", transparency=0)), media.ProcessedImage)
    assert isinstance(media.process_image(encode(Image.new("RGB", (90, 60), "green"), "WEBP")), media.ProcessedImage)


def test_refusal_messages_are_vietnamese_sentences():
    assert {r.message for r in media.ImageRefusal} == {"Tệp ảnh tối đa 5 MB.", "Tệp này không phải ảnh JPEG, PNG hoặc WebP.",
                                                       "Ảnh quá lớn: JPEG tối đa 16 triệu điểm ảnh, PNG và WebP tối đa 6 triệu điểm ảnh (khoảng 3000 x 2000)."}


def test_qr_data_uri_is_an_image_without_a_style_attribute():
    uri = qr.qr_data_uri("00020101021238570010A000000727")
    assert uri.startswith("data:image/svg+xml")
    body = urllib.parse.unquote(uri.split(",", 1)[1])
    assert "<svg" in body and "style" not in body.lower() and "<script" not in body.lower()
    assert qr.qr_data_uri("a") != qr.qr_data_uri("b")


def test_ticket_text():
    assert qr.ticket_text("TC", "K7M2QX9A") == "OPENTEA-TOUR:TC:K7M2QX9A"
