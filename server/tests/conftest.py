import sys
from pathlib import Path

# `python -m pytest tests` from server/ already has server/ on sys.path; a bare `pytest` invocation does not.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
