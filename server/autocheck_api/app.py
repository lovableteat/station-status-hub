"""HTTP front for the AutoCheck engine: 比對系統 can send its work here instead of running it in the browser.

Routes (all under ``/api/autocheck``):

* ``GET /health`` — engine revision, limits and whether a token is required.
* ``POST /{run|tracker|library|datasheet}`` — multipart form: a ``request`` JSON field whose file entries are
  ``{"path": ..., "part": "f0"}`` references, plus one file part per reference. The JSON response is the bridge
  result; binary artifacts carry base64 ``bytes``.

Environment: ``AUTOCHECK_ENGINE_DIR`` (defaults to the repository's ``public/comparison``), ``AUTOCHECK_API_TOKEN``
(when set, requests need ``Authorization: Bearer <token>``) and ``AUTOCHECK_ALLOWED_ORIGINS`` (comma list, default ``*``).
"""
from __future__ import annotations

import hmac
import json
import logging
import os
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.datastructures import UploadFile

from . import __version__
from .engine import KINDS, LIMITS, Engine, RequestError

DEFAULT_DIR = Path(__file__).resolve().parents[2] / "public" / "comparison"
log = logging.getLogger("autocheck_api")


def create_app(engine_dir: Path | str | None = None, token: str | None = None, origins: str | None = None) -> FastAPI:
    engine = Engine(engine_dir or os.environ.get("AUTOCHECK_ENGINE_DIR") or DEFAULT_DIR)
    token = os.environ.get("AUTOCHECK_API_TOKEN", "") if token is None else token
    origins = os.environ.get("AUTOCHECK_ALLOWED_ORIGINS", "*") if origins is None else origins
    allowed = [origin.strip() for origin in origins.split(",") if origin.strip()]
    app = FastAPI(title="AutoCheck API", version=__version__, docs_url=None, redoc_url=None, openapi_url=None)
    app.add_middleware(CORSMiddleware, allow_origins=allowed, allow_methods=["GET", "POST"],
                       allow_headers=["Authorization", "Content-Type"], max_age=600)
    app.state.engine = engine

    def authorize(request: Request, required: bool) -> None:
        if not token:
            return
        header = request.headers.get("authorization", "")
        if not header and not required:
            return
        if not hmac.compare_digest(header.encode("utf-8"), f"Bearer {token}".encode("utf-8")):
            raise HTTPException(401, "API token 不正確或未提供")

    @app.get("/api/autocheck/health")
    async def health(request: Request) -> dict:
        authorize(request, required=False)
        return {"ok": True, "service": "autocheck-api", "version": __version__, "engine": engine.info,
                "limits": LIMITS, "auth": "token" if token else "none"}

    @app.post("/api/autocheck/{kind}")
    async def dispatch(kind: str, request: Request) -> JSONResponse:
        authorize(request, required=True)
        if kind not in KINDS:
            raise HTTPException(404, "不支援的 AutoCheck 工作")
        try:
            form = await request.form(max_files=LIMITS["count"] + 1, max_fields=16, max_part_size=32 * 1024 * 1024)
        except TypeError:  # older Starlette without max_part_size
            form = await request.form(max_files=LIMITS["count"] + 1, max_fields=16)
        raw = form.get("request")
        if not isinstance(raw, str):
            raise HTTPException(400, "缺少 request 欄位")
        try:
            payload = json.loads(raw)
        except ValueError:
            raise HTTPException(400, "request 欄位不是有效的 JSON")
        parts: dict[str, bytes] = {}
        for name, value in form.multi_items():
            if isinstance(value, UploadFile):
                parts[name] = await value.read()
        started = time.monotonic()
        try:
            result = await run_in_threadpool(engine.run, kind, payload, parts)
        except RequestError as error:
            raise HTTPException(400, str(error))
        except ValueError as error:  # the bridge raises ValueError for input the user can fix
            raise HTTPException(400, str(error))
        except Exception as error:
            log.exception("%s failed", kind)
            raise HTTPException(500, f"{type(error).__name__}: {error}")
        log.info("%s finished in %.1fs (%d parts)", kind, time.monotonic() - started, len(parts))
        return JSONResponse(result)

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, error: HTTPException) -> JSONResponse:
        return JSONResponse({"error": error.detail}, status_code=error.status_code)

    return app


app = create_app()
