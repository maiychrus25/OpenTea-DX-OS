# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Back office: tours, photos, departures, settings. Placeholder from the foundation task; the catalogue task replaces it."""
from fastapi import APIRouter, Depends, Request

from tea_tour.claims import Claims
from tea_tour.web import page, role

router = APIRouter()


@router.get("/tours")
def tours(request: Request, claims: Claims = Depends(role("manager"))):
    return page(request, "admin/placeholder.html", title="Tour", active_tab="tours", htx=claims.htx_code)
