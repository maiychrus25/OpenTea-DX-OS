# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Static files and photos. Each is reachable under the public prefix, the manager prefix and the guide prefix,
because the gateway decides by prefix who may call: /public/ anyone, / managers, /guide farmers."""
import re
from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from starlette.exceptions import HTTPException

from tea_tour import assets
from tea_tour.claims import Claims
from tea_tour.store import media as media_store
from tea_tour.web import db, public_htx, role

router = APIRouter()
MEDIA_NAME = re.compile(r"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-(large|thumb)\.jpg")
STATIC_HEADERS = {"cache-control": assets.CACHE_CONTROL, "x-content-type-options": "nosniff"}
# A photo never changes under its id, but a protected one must not be shared between viewers by a cache.
PUBLIC_MEDIA_HEADERS = {**STATIC_HEADERS}
PRIVATE_MEDIA_HEADERS = {"cache-control": "private, max-age=3600", "x-content-type-options": "nosniff"}


def static_file(name: str) -> Response:
    asset = assets.ASSETS.get(name)
    if asset is None:
        raise HTTPException(404)
    return Response(asset.body, media_type=asset.content_type, headers=STATIC_HEADERS)


def photo(conn, htx: str, name: str, public: bool) -> Response:
    match = MEDIA_NAME.fullmatch(name)
    if match is None:
        raise HTTPException(404)
    data = media_store.get_image(conn, htx, UUID(match.group(1)), match.group(2), public)
    if data is None:
        raise HTTPException(404)
    return Response(data, media_type="image/jpeg", headers=PUBLIC_MEDIA_HEADERS if public else PRIVATE_MEDIA_HEADERS)


@router.get("/public/{htx}/assets/{name:path}")
def public_asset(name: str, htx: str = Depends(public_htx)):
    return static_file(name)


@router.get("/assets/{name:path}")
def manager_asset(name: str, claims: Claims = Depends(role("manager"))):
    return static_file(name)


@router.get("/guide/assets/{name:path}")
def guide_asset(name: str, claims: Claims = Depends(role("farmer"))):
    return static_file(name)


@router.get("/public/{htx}/media/{name}")
def public_media(name: str, htx: str = Depends(public_htx), conn=Depends(db)):
    """Only a photo of a PUBLISHED tour, or the cooperative's cover image; anything else is not found."""
    return photo(conn, htx, name, public=True)


@router.get("/media/{name}")
def manager_media(name: str, claims: Claims = Depends(role("manager")), conn=Depends(db)):
    """Any photo of the manager's own cooperative, drafts included."""
    return photo(conn, claims.htx_code, name, public=False)
