"""Hosts the user's AutoCheck engine the way the browser worker does.

The website normally runs ``public/comparison`` inside the browser (Pyodide). This module loads the same engine files,
verifies them against ``engine/manifest.json``, executes the same three adapter scripts and calls the same
``autocheck_dispatch`` contract, so a server run and a browser run give the same rows, workbook and reports.
Every request gets a private temporary folder that is deleted afterwards; nothing is kept on the server.
"""
from __future__ import annotations

import base64
import hashlib
import json
import logging
import re
import shutil
import sys
import tempfile
import threading
import unicodedata
from pathlib import Path
from typing import Any, Callable

LIMITS = {"count": 1000, "file": 64 * 1024 * 1024, "total": 128 * 1024 * 1024}
LIMIT_MESSAGE = "輸入超過限制（1000 個檔案、單檔 64 MiB、總計 128 MiB）"
TEXT_LIMIT = 2 * 1024 * 1024
ADAPTERS = ("browser_compat.py", "power_tree_compat.py", "browser_bridge.py")
KINDS = ("run", "tracker", "library", "datasheet")
OPTION_KEYS = ("config", "railMap", "railDomain", "i2cDeclared", "library")
TEXT_OPTIONS = ("config", "library")
log = logging.getLogger("autocheck_api")


class RequestError(ValueError):
    """A request the browser worker would also have rejected before reaching the engine (HTTP 400)."""


def valid_path(path: Any) -> str:
    # Mirrors validPath() in autocheck.worker.js; these paths are written under a temporary folder.
    if not isinstance(path, str) or not path or len(path) > 4096 or re.search(r"[\x00-\x1f:]", path):
        raise RequestError("檔案路徑無效")
    normalized = unicodedata.normalize("NFC", path.replace("\\", "/"))
    if any(part in ("", ".", "..") for part in normalized.split("/")):
        raise RequestError("檔案路徑不可包含絕對路徑或上層目錄")
    return normalized


class Inputs:
    """Resolves ``{"path": ..., "part": ...}`` references against the uploaded parts with the worker's limits."""

    def __init__(self, parts: dict[str, bytes]):
        self.parts = parts
        self.count = 0
        self.bytes = 0

    def _add(self, size: int, single: bool = True) -> None:
        self.count += 1
        self.bytes += size
        if (single and size > LIMITS["file"]) or self.bytes > LIMITS["total"] or self.count > LIMITS["count"]:
            raise RequestError(LIMIT_MESSAGE)

    def files(self, value: Any) -> list[tuple[str, bytes]]:
        if not isinstance(value, list):
            raise RequestError("檔案清單格式無效")
        seen: set[str] = set()
        resolved = []
        for item in value:
            path = valid_path(item.get("path") if isinstance(item, dict) else None)
            data = self.parts.get(item.get("part")) if isinstance(item.get("part"), str) else None
            if data is None:
                raise RequestError(f"{path} 缺少檔案內容")
            key = path.lower()
            if key in seen:
                raise RequestError(f"重複檔案路徑：{path}")
            seen.add(key)
            self._add(len(data))
            resolved.append((path, data))
        return resolved

    def text(self, value: Any, key: str) -> str:
        size = len(value.encode("utf-8")) if isinstance(value, str) else -1
        if size < 0 or key not in TEXT_OPTIONS or size > TEXT_LIMIT:
            raise RequestError(f"{key} 格式或大小無效")
        self._add(size, single=False)
        return value


def _write(root: Path, folder: str, path: str, data: bytes) -> str:
    target = root / folder / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return str(target)


def materialize(kind: str, payload: Any, parts: dict[str, bytes], root: Path) -> dict:
    """Validates a request exactly like validateRequest() + writeInputs() in the worker and writes its files under root."""
    if not isinstance(payload, dict):
        raise RequestError("工作內容格式無效")
    inputs = Inputs(parts)
    if kind == "run":
        a = [_write(root, "a", path, data) for path, data in inputs.files(payload.get("a"))]
        b = [_write(root, "b", path, data) for path, data in inputs.files(payload.get("b"))]
        options = payload.get("options") or {}
        if not isinstance(options, dict):
            raise RequestError("工作內容格式無效")
        out = dict(options)
        out["datasheets"] = [_write(root, "datasheets", path, data) for path, data in inputs.files(options.get("datasheets") or [])]
        for key in OPTION_KEYS:
            if options.get(key) is None:
                continue
            if isinstance(options[key], str):
                out[key] = inputs.text(options[key], key)
            else:
                (path, data), = inputs.files([options[key]])
                out[key] = {"file": _write(root, f"options/{key}", path, data)}
        return {**payload, "a": a, "b": b, "options": out, "root": str(root)}
    if kind == "datasheet":
        (path, data), = inputs.files([payload.get("file")])
        return {**payload, "file": _write(root, "datasheets", path, data), "root": str(root)}
    if kind == "tracker":
        template = payload.get("template")
        data = parts.get(template.get("part")) if isinstance(template, dict) and isinstance(template.get("part"), str) else None
        if data is None or len(data) > LIMITS["file"]:
            raise RequestError("Excel 範本格式或大小無效")
        rows = payload.get("rows")
        if not isinstance(rows, list) or len(rows) > 100000:
            raise RequestError("追蹤列格式或數量無效")
        return {**payload, "template": _write(root, "tracker", "template.xlsx", data), "root": str(root)}
    if kind == "library":
        for key in ("yaml", "entryYaml"):
            value = payload.get(key)
            if value is not None and (not isinstance(value, str) or len(value.encode("utf-8")) > TEXT_LIMIT):
                raise RequestError("使用者位址 YAML 格式或大小無效")
        return {**payload, "root": str(root)}
    raise RequestError("不支援的 AutoCheck 工作")


def _encoded(artifact: dict) -> dict:
    path = Path(artifact.pop("path"))
    artifact["bytes"] = base64.b64encode(path.read_bytes()).decode("ascii")
    return artifact


def collect(kind: str, result: Any) -> Any:
    """Replaces artifact paths (temporary files) with base64 bytes, as the worker transfers ArrayBuffers."""
    if kind == "run":
        result["artifacts"] = [_encoded(artifact) for artifact in result["artifacts"]]
    elif kind == "tracker":
        result = _encoded(result)
    return result


class Engine:
    """One engine per process; requests run one at a time because the bridge keeps per-run state in os.environ."""

    def __init__(self, comparison_dir: Path | str):
        self.dir = Path(comparison_dir).resolve()
        manifest = self.dir / "engine" / "manifest.json"
        if not manifest.is_file():
            raise RuntimeError(f"找不到 AutoCheck 引擎：{manifest}")
        self.manifest = json.loads(manifest.read_text(encoding="utf-8"))
        self._lock = threading.Lock()
        self._dispatch: Callable[[str, Callable[[str], None]], str] | None = None

    @property
    def info(self) -> dict:
        return {"revision": self.manifest.get("revision"), "version": self.manifest.get("version"),
                "files": len(self.manifest.get("files", []))}

    def verify(self) -> None:
        """Same integrity check as the worker: every deployed engine file must match the manifest hash."""
        for entry in self.manifest["files"]:
            path = self.dir / "engine" / valid_path(entry["path"])
            if hashlib.sha256(path.read_bytes()).hexdigest() != entry["sha256"]:
                raise RuntimeError(f"AutoCheck 原始碼完整性驗證失敗：{entry['path']}")
        for name in ADAPTERS:
            if not (self.dir / name).is_file():
                raise RuntimeError(f"找不到 Python 瀏覽器橋接：{name}")

    def load(self) -> None:
        with self._lock:
            if self._dispatch is not None:
                return
            self.verify()
            for stream in (sys.stdout, sys.stderr):
                # The engine prints ⚠ and Chinese; a cp950 console must not turn that into a failed request.
                if hasattr(stream, "reconfigure"):
                    stream.reconfigure(errors="replace")
            engine_dir = str(self.dir / "engine")
            if engine_dir not in sys.path:
                sys.path.insert(0, engine_dir)
            namespace: dict[str, Any] = {"__name__": "autocheck_bridge", "__file__": str(self.dir / ADAPTERS[-1])}
            for name in ADAPTERS:
                source = (self.dir / name).read_text(encoding="utf-8")
                exec(compile(source, str(self.dir / name), "exec"), namespace)
            self._dispatch = namespace["autocheck_dispatch"]
            log.info("AutoCheck engine %s loaded from %s", self.info["revision"], self.dir)

    def run(self, kind: str, payload: Any, parts: dict[str, bytes], progress: Callable[[str], None] | None = None) -> Any:
        if kind not in KINDS:
            raise RequestError("不支援的 AutoCheck 工作")
        if self._dispatch is None:
            self.load()
        with self._lock:
            root = Path(tempfile.mkdtemp(prefix="autocheck-"))
            try:
                prepared = materialize(kind, payload, parts, root)
                request = json.dumps({"type": kind, "payload": prepared}, ensure_ascii=False)
                result = json.loads(self._dispatch(request, progress or (lambda message: None)))
                return collect(kind, result)
            finally:
                shutil.rmtree(root, ignore_errors=True)
