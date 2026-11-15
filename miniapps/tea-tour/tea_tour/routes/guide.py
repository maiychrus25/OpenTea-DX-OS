# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Guide pages under /guide. Placeholder from the foundation task; the guide task replaces it."""
from fastapi import APIRouter, Depends, Request

from tea_tour.claims import Claims
from tea_tour.web import page, role

router = APIRouter()


@router.get("/guide")
def schedule(request: Request, claims: Claims = Depends(role("farmer"))):
    return page(request, "placeholder.html", title="Lịch dẫn tour")
