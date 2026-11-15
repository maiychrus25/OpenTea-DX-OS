# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Back office: overview, bookings, payments, customers, reviews, reports. Placeholder from the foundation task; the sales task replaces it."""
from fastapi import APIRouter, Depends, Request

from tea_tour.claims import Claims
from tea_tour.store import core
from tea_tour.web import open_db, page, role

router = APIRouter()


@router.get("/")
def overview(request: Request, claims: Claims = Depends(role("manager"))):
    with open_db() as conn:
        core.sweep(conn, claims.htx_code)  # opening the overview frees expired holds (spec 7.2)
    return page(request, "admin/placeholder.html", title="Tổng quan", active_tab="overview", htx=claims.htx_code)
