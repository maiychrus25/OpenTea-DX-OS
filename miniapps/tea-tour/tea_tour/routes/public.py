# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Customer site under /public/<htx>. Placeholder from the foundation task; the site task replaces this file."""
from fastapi import APIRouter, Depends, Request

from tea_tour.web import page, public_htx

router = APIRouter()


@router.get("/public/{htx}")
def home(request: Request, htx: str = Depends(public_htx)):
    return page(request, "site/placeholder.html", title="Tour đồi chè")
