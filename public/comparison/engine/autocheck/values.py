"""Value string parsing: capacitance/voltage, resistance, net-name voltage."""
from __future__ import annotations

import re

_MULT = {"P": 1e-12, "N": 1e-9, "U": 1e-6, "µ": 1e-6, "M": 1e-3, "": 1.0}
_CAP = re.compile(r"([\d.]+)\s*([PNUµM]?)F\b", re.I)
_VOLT = re.compile(r"([\d.]+)\s*V\b", re.I)
_CAPV = re.compile(r"([\d.]+)\s*([PNUµ])F\s*/\s*([\d.]+)\s*V", re.I)


def parse_cap(text: str) -> tuple[float | None, float | None]:
    """'0.1UF/16V' -> (1e-7, 16.0); 'MLCC 0.1UF/16V(0402)X7R 10%' -> same."""
    t = text or ""
    m = _CAPV.search(t)
    if m:
        return float(m.group(1)) * _MULT[m.group(2).upper()], float(m.group(3))
    c = _CAP.search(t)
    v = _VOLT.search(t)
    farad = float(c.group(1)) * _MULT[c.group(2).upper()] if c else None
    volt = float(v.group(1)) if v else None
    return farad, volt


_RES = re.compile(r"([\d.]+)\s*(m|K|M|G)?\s*(?:ohm|Ω|R\b)", re.I)


def parse_res(text: str) -> float | None:
    """'100KOHM' -> 1e5; '0.3mohm' -> 3e-4; 'RES FILM 12.7Kohm 1/16W' -> 12700."""
    m = _RES.search(text or "")
    if not m:
        return None
    unit = m.group(2) or ""
    mult = {"": 1.0, "k": 1e3, "K": 1e3, "M": 1e6, "G": 1e9, "m": 1e-3}[unit]
    # 'M' is ambiguous (mega vs milli). Lowercase m = milli; uppercase M = mega.
    return float(m.group(1)) * mult


_IND = re.compile(r"(?<![\w.\-])([\d.]+)\s*([PNUµM])H(?![A-Za-z])", re.I)   # '10uH8.6A' OK; unit prefix required
#                                                                         (board inductors; 'SOT23-6H' is no inductance)


def parse_ind(text: str) -> float | None:
    """'15uH' -> 1.5e-5; 'INDUCTOR 10uH8.6A20%' -> 1e-5 (first H token; G0 2026-10-22). 'MH' = milli-henry."""
    m = _IND.search(text or "")
    if not m:
        return None
    try:
        return float(m.group(1)) * _MULT[m.group(2).upper()]
    except ValueError:
        return None


def close(a: float | None, b: float | None, rel: float = 0.01) -> bool:
    if a is None or b is None:
        return a is b
    if a == b:
        return True
    return abs(a - b) <= rel * max(abs(a), abs(b))


def fmt_cap(f: float | None) -> str:
    if f is None:
        return "?"
    for unit, m in (("uF", 1e-6), ("nF", 1e-9), ("pF", 1e-12)):
        if f >= m * 0.999:
            return f"{f / m:g}{unit}"
    return f"{f:g}F"


# ---------------------------------------------------------------- net voltage
_VTOK = re.compile(r"^P?(\d+)V(\d*)$")


def voltage_token(tok: str) -> float | None:
    m = _VTOK.match(tok)
    if not m:
        return None
    whole, frac = m.group(1), m.group(2)
    return float(f"{whole}.{frac}") if frac else float(whole)


def net_voltage_from_name(name: str, blacklist: set[str]) -> float | None:
    """Return rail voltage encoded in the net name, or None when ambiguous.

    A voltage token (3V3, P12V, 4V85, 48V) qualifies only when no token in the name is a
    signal/derived-supply word (EN, PG, FB, SW, SENSE, PVCC, ...). Ambiguous names return
    None on purpose: an unresolved net is reported for the user to fill in rail_map.csv;
    a wrongly resolved net would silently pass or fail a capacitor.
    """
    toks = [t for t in re.split(r"[_\-\s]+", name.upper()) if t]
    volts = [voltage_token(t) for t in toks]
    idx = [i for i, v in enumerate(volts) if v is not None]
    if len(idx) != 1:
        return None
    vi = idx[0]
    for i, t in enumerate(toks):
        if i == vi:
            continue
        base = re.sub(r"\d+$", "", t)  # DIV2 -> DIV, COMP1 -> COMP
        if t in SUPPLY_WORDS or base in SUPPLY_WORDS:
            # '4V85_VDD' names the VDD rail itself; '12V_STBY_PVCC' is a controller's own supply
            if i == vi + 1:
                continue
            return None
        if t in blacklist or base in blacklist:
            return None
    return volts[vi]


SUPPLY_WORDS = {"VCC", "PVCC", "VDD", "VDDA", "AVDD", "DVDD", "VDDIO", "BIAS"}


_RKM = re.compile(r"^(\d+)([RKMGrkm])(\d+)$")              # 4K7, 2K2, 1R5, 1M2
_RSUF = re.compile(r"^(\d+(?:\.\d+)?)([RKMGrkm]?)$")       # 10K, 4.7k, 47R, 1M, 100


def parse_res_loose(text: str) -> float | None:
    """parse_res plus the RKM / bare-suffix styles other libraries use ('10K', '4K7', '2K2 1%', '1M', '47R',
    '100'). Used by the netlist rules only; the older checks keep parse_res so their results stay as reviewed.
    Here an upper-case M is mega (resistor values); milli must be written 'm' or 'mohm'."""
    v = parse_res(text)
    if v is not None:
        return v
    toks = (text or "").split()
    if not toks:
        return None
    tok = toks[0]
    if len(toks) > 1 and re.fullmatch(r"\d+(?:\.\d+)?", tok) and re.fullmatch(r"[RKMGrkm]", toks[1]):
        tok += toks[1]                       # '10 K'
    if re.fullmatch(r"\d{3,4}", tok):
        return None                          # '472' / '1002': EIA code or plain ohms? ambiguous, do not guess
    mult = {"": 1.0, "R": 1.0, "r": 1.0, "K": 1e3, "k": 1e3, "M": 1e6, "G": 1e9, "m": 1e-3}
    m = _RKM.match(tok)
    if m:
        return float(f"{m.group(1)}.{m.group(3)}") * mult[m.group(2)]
    m = _RSUF.match(tok)
    if m:
        return float(m.group(1)) * mult[m.group(2)]
    return None
