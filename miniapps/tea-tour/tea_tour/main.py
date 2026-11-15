# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Mini-app tea-tour 1.0: customer site, back office and guide pages on one container (spec 5 to 7).

The gateway strips /apps/tea-tour; the prefix comes back through uvicorn's --root-path. Writes are POST + 303.
"""
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import PlainTextResponse
from starlette.exceptions import HTTPException

from tea_tour.routes import admin_catalog, admin_sales, guide, public
from tea_tour.routes import assets as asset_routes
from tea_tour.web import ERRORS, page, _route_path

ROUTERS = (asset_routes.router, public.router, admin_catalog.router, admin_sales.router, guide.router)


def error_page(request: Request, status: int):
    template = "site/message.html" if _route_path(request).startswith("/public/") else "message.html"
    return page(request, template, status, message=ERRORS.get(status, "Có lỗi xảy ra. Vui lòng thử lại sau."))


def create_app() -> FastAPI:
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException):
        return error_page(request, exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def bad_path(request: Request, exc: RequestValidationError):
        # Only path ids are typed (form fields are read as text), so a validation error is a page that does not exist.
        return error_page(request, 404)

    @app.exception_handler(Exception)
    async def server_error(request: Request, exc: Exception):
        # Starlette re-raises after this response, so uvicorn still logs the traceback; the guest never sees it.
        return error_page(request, 500)

    @app.get("/healthz", response_class=PlainTextResponse)
    def healthz():
        return "ok"

    for router in ROUTERS:
        app.include_router(router)
    return app


app = create_app()
