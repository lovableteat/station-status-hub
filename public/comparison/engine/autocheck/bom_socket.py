"""Resolve BOM Ref Des entries that are not a plain RefDes, e.g. Agile "FOR J2".

Company practice (owner, 2026-10-13): a programmed part that is inserted into a socket (SPI flash in a
SOIC socket) has no placement of its own, so the BOM writes its location as "FOR <socket>". The schematic
draws the part as its own symbol stacked on the socket (OTA01: socket J2, flash J2_1, same 16 nets).

Resolution goes by netlist topology, not by naming:
  1. config bom.socket_ref_patterns (regex, group 1 = socket RefDes) recognises the token;
  2. only "distinctive" pins count: pins on ground nets (config ground.regex) or no-connect nets
     (bom.socket.ignore_net_regex) are dropped on both sides, so a screw hole on GND or a coupon full of
     GND / NC pins cannot look like the flash. Candidates = other parts with >= min_pin_ratio x the socket's
     pin count; score = max(same pin number on the same net, share of its pins on the socket's nets),
     both over distinctive pins, and the candidate needs >= min_pins distinctive pins;
  3. exactly one candidate >= match_ratio -> the BOM item gets that RefDes (INFO BOM_SOCKET_LINKED);
     none or several -> nothing is guessed, WARN BOM_REF_UNRESOLVED.
Every decision is kept in Design.bom_links for the report.
"""
from __future__ import annotations

import re

from .model import Design, natkey

DEFAULTS = {"socket_ref_patterns": [r"^FOR\s+(\S+)$"], "match_ratio": 0.8, "min_pin_ratio": 0.5, "min_pins": 3,
            "ignore_net_regex": r"^(NC|N\.C\.|DNC|NC_.*|SNN_.*)$"}


def _settings(cfg: dict) -> dict:
    s = dict(DEFAULTS)
    s.update((cfg.get("bom") or {}).get("socket") or {})
    return s


def _pinmap(d: Design, r: str) -> dict[str, str]:
    return {k[1]: d.pin_net[k] for k in d.pins_of(r)}


def candidates(d: Design, socket: str, s: dict, cfg: dict | None = None) -> list[tuple[float, str]]:
    """(score, refdes) of parts stacked on `socket`, best first, only those >= match_ratio."""
    gnd = ((cfg or {}).get("ground") or {}).get("regex") or r"^GND$"
    skip = re.compile(f"(?:{gnd})|(?:{s['ignore_net_regex']})", re.I)
    ms_all = _pinmap(d, socket)
    if not ms_all:
        return []
    ms = {n: net for n, net in ms_all.items() if not skip.match(net)}
    nets = set(ms.values())
    need = max(int(s["min_pins"]), int(len(ms_all) * float(s["min_pin_ratio"]) + 0.999))
    out = []
    for r in d.parts:
        if r == socket:
            continue
        mp_all = _pinmap(d, r)
        if len(mp_all) < need:
            continue
        mp = {n: net for n, net in mp_all.items() if not skip.match(net)}
        if len(mp) < int(s["min_pins"]):
            continue
        same = sum(1 for n, net in mp.items() if ms.get(n) == net) / len(mp)
        onnets = sum(1 for net in mp.values() if net in nets) / len(mp)
        score = max(same, onnets)
        if score >= float(s["match_ratio"]):
            out.append((round(score, 3), r))
    out.sort(key=lambda x: (-x[0], natkey(x[1])))
    return out


def resolve(d: Design, cfg: dict) -> None:
    """Map raw BOM tokens onto netlist RefDes in place (d.bom, item.refdes) and record d.bom_links."""
    if d.bom is None:
        return
    s = _settings(cfg)
    pats = [re.compile(p, re.I) for p in s["socket_ref_patterns"]]
    for it in d.bom_items:
        for tok in it.ref_tokens:
            link = {"token": tok, "pn": it.pn, "row": it.row, "socket": "", "refdes": "", "candidates": [],
                    "status": "UNRESOLVED", "reason": ""}
            m = next((p.match(tok) for p in pats if p.match(tok)), None)
            if m is None:
                link["reason"] = "no bom.socket_ref_patterns entry matches this Ref Des text"
            else:
                sock = m.group(1)
                link["socket"] = sock
                if sock not in d.parts:
                    link["reason"] = f"socket {sock} is not in the netlist"
                else:
                    cands = candidates(d, sock, s, cfg)
                    link["candidates"] = [f"{r} ({sc:.0%})" for sc, r in cands]
                    if len(cands) == 1:
                        r = cands[0][1]
                        if r in d.bom:
                            link["reason"] = f"{r} already on BOM line {d.bom[r].pn}"
                        else:
                            link.update(status="LINKED", refdes=r)
                            it.refdes.append(r)
                            d.bom[r] = it
                    elif not cands:
                        link["reason"] = (f"no part sits on {sock}'s nets with >= {float(s['match_ratio']):.0%} "
                                          f"of its pins")
                    else:
                        link["reason"] = "several parts match; not guessing"
            d.bom_links.append(link)
