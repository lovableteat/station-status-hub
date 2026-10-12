import hashlib
from pathlib import Path


def sha256_of(path: str | Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def read_text(path: str | Path) -> str:
    """Allegro pst files are ASCII; tolerate stray bytes rather than crash."""
    raw = Path(path).read_bytes()
    for enc in ("utf-8", "cp950", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1", errors="replace")
