"""Revision-to-revision diff (A = old, e.g. EVT; B = new, e.g. DVT).

Keys: pin = (RefDes, pin number). RefDes is frozen between revisions by company rule.
Nets are matched between A and B by pin-set overlap, never by name, so that one root cause
(rename / split / merge / moved pin group) produces one finding instead of one per pin.
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict

from ..findings import Finding
from ..model import Design, natkey
from ..values import close, parse_cap, parse_res


def _pin(k) -> str:
    return f"{k[0]}.{k[1]}"


def _page(b: Design, a: Design, refs) -> tuple[int | None, str]:
    for r in refs:
        if r in b.parts:
            return b.page_of(r), b.page_title(b.page_of(r))
    for r in refs:
        if r in a.parts:
            return a.page_of(r), a.page_title(a.page_of(r)) + " (old rev)"
    return None, ""


def _f(a, b, **kw) -> Finding:
    refs = kw.get("refdes", [])
    pg, title = _page(b, a, refs)
    kw.setdefault("page", pg)
    kw.setdefault("page_title", title)
    return Finding(**kw).finalize()


def _best_match(src: dict[str, list], dst_pin_net: dict) -> dict[str, str]:
    """Map every src net to its counterpart dst net.

    1. Same name wins whenever the same-named dst net still shares at least one pin
       (names are stable in practice; this keeps the residual side of a split anchored).
    2. Otherwise (name vanished = rename/merge) take the dst net holding most of its pins.
    """
    out = {}
    for net, pins in src.items():
        c = Counter(dst_pin_net[p] for p in pins if p in dst_pin_net)
        if not c:
            continue
        if net in c:
            out[net] = net
            continue
        top = max(c.values())
        out[net] = sorted(n for n, v in c.items() if v == top)[0]
    return out


def _prefix(refdes: str) -> str:
    m = re.match(r"[A-Za-z_]+", refdes)
    return m.group(0).upper() if m else ""


def _norm_desc(s: str) -> str:
    return re.sub(r"[\s()]+", "", (s or "").upper())


def diff_designs(a: Design, b: Design, cfg: dict) -> list[Finding]:
    out: list[Finding] = []
    sym = set(cfg["parts"]["symmetric_prefixes"])

    # ------------------------------------------------------------ parts
    removed = sorted(set(a.parts) - set(b.parts), key=natkey)
    added = sorted(set(b.parts) - set(a.parts), key=natkey)
    for r in removed:
        pins = [f"{_pin(k)}={a.pin_net[k]}" for k in a.pins_of(r)]
        out.append(_f(a, b, category="PART", rule="PART_REMOVED", severity="WARN",
                      title=f"{r} removed from schematic",
                      detail=f"{a.value(r)} ({a.parts[r].primitive}); was connected: " + ", ".join(pins),
                      refdes=[r], nets=sorted({a.pin_net[k] for k in a.pins_of(r)}),
                      evidence={"A": a.parts[r].primitive, "B": None}))
    for r in added:
        pins = [f"{_pin(k)}={b.pin_net[k]}" for k in b.pins_of(r)]
        out.append(_f(a, b, category="PART", rule="PART_ADDED", severity="WARN",
                      title=f"{r} added to schematic",
                      detail=f"{b.value(r)} ({b.parts[r].primitive}); connected: " + ", ".join(pins),
                      refdes=[r], nets=sorted({b.pin_net[k] for k in b.pins_of(r)}),
                      evidence={"A": None, "B": b.parts[r].primitive}))

    common = sorted(set(a.parts) & set(b.parts), key=natkey)
    for r in common:
        pa, pb = a.parts[r].primitive, b.parts[r].primitive
        if pa != pb:
            va, vb = a.value(r), b.value(r)
            ja, jb = (a.prim(r).jedec if a.prim(r) else ""), (b.prim(r).jedec if b.prim(r) else "")
            bits = []
            if va != vb:
                bits.append(f"VALUE {va} -> {vb}")
            if ja != jb:
                bits.append(f"footprint {ja} -> {jb}")
            if not bits:
                bits.append("symbol changed, VALUE/footprint unchanged")
            sev = "WARN"
            kind = "value"
            if r[:1] == "C":
                fa, voa = parse_cap(va)
                fb, vob = parse_cap(vb)
                if voa and vob and vob < voa:
                    bits.append(f"rated voltage DOWN {voa:g}V -> {vob:g}V")
            elif r[:1] == "R" and close(parse_res(va), parse_res(vb)) and ja == jb:
                sev, kind = "INFO", "cosmetic"
            out.append(_f(a, b, category="PART", rule="PART_SYMBOL_CHANGED", severity=sev,
                          title=f"{r} {va} -> {vb}" if va != vb else f"{r} symbol/footprint changed",
                          detail="; ".join(bits) + f" [{kind}]", refdes=[r],
                          evidence={"A": pa, "B": pb}))
        sa, sb = a.stuffed(r), b.stuffed(r)
        if a.bom is not None and b.bom is not None and sa != sb:
            out.append(_f(a, b, category="PART", rule="STUFF_CHANGED", severity="WARN",
                          title=f"{r} {'DNP -> stuffed' if sb else 'stuffed -> DNP'}",
                          detail=f"{b.value(r) or a.value(r)}; "
                                 + (f"BOM B: {b.bom[r].pn} {b.bom[r].desc}" if sb else f"BOM A: {a.bom[r].pn} {a.bom[r].desc}"),
                          refdes=[r], evidence={"A": "stuffed" if sa else "DNP", "B": "stuffed" if sb else "DNP"}))

    # ------------------------------------------------------------ BOM
    if a.bom is not None and b.bom is not None:
        for r in sorted(set(a.bom) & set(b.bom), key=natkey):
            ia, ib = a.bom[r], b.bom[r]
            if ia.pn == ib.pn:
                if {x[0] for x in ia.alternates} != {x[0] for x in ib.alternates}:
                    add = sorted({x[0] for x in ib.alternates} - {x[0] for x in ia.alternates})
                    rem = sorted({x[0] for x in ia.alternates} - {x[0] for x in ib.alternates})
                    out.append(_f(a, b, category="BOM", rule="BOM_ALT_CHANGED", severity="INFO",
                                  title=f"{r} alternates changed ({ib.pn})",
                                  detail=f"added {add or '-'}; removed {rem or '-'}", refdes=[r],
                                  key=f"BOM_ALT_CHANGED|{ib.pn}|{','.join(add)}|{','.join(rem)}"))
                continue
            same_spec = _norm_desc(ia.desc) == _norm_desc(ib.desc)
            was_alt = ib.pn in {x[0] for x in ia.alternates}
            sev = "INFO" if (same_spec or was_alt) else "WARN"
            why = "same description (second-source swap)" if same_spec else (
                "new main PN was an approved alternate in A" if was_alt else "description changed")
            out.append(_f(a, b, category="BOM", rule="BOM_PN_CHANGED", severity=sev,
                          title=f"{r} main PN {ia.pn} -> {ib.pn}",
                          detail=f"A: {ia.desc} | {ia.spec}\nB: {ib.desc} | {ib.spec}\n{why}",
                          refdes=[r], evidence={"A": ia.pn, "B": ib.pn}))
        # collapse identical BOM_PN_CHANGED (same A->B PN pair) into one finding per pair
        out = _collapse_bom(out)

    # ------------------------------------------------------------ connectivity
    out += _diff_connectivity(a, b, sym)
    return out


def _collapse_bom(fs: list[Finding]) -> list[Finding]:
    keep, groups = [], defaultdict(list)
    for f in fs:
        if f.rule in ("BOM_PN_CHANGED", "BOM_ALT_CHANGED"):
            groups[(f.rule, f.title.split(" ", 1)[1], f.detail)].append(f)
        else:
            keep.append(f)
    for (rule, _t, _d), g in groups.items():
        g.sort(key=lambda f: natkey(f.refdes[0]))
        f0 = g[0]
        refs = [x.refdes[0] for x in g]
        if len(g) > 1:
            f0.title = f"{len(g)} parts: " + f0.title.split(" ", 1)[1]
            f0.detail = f"RefDes: {', '.join(refs)}\n" + f0.detail
        f0.refdes = refs
        f0.key = f"{rule}|{f0.evidence.get('A')}|{f0.evidence.get('B')}|" + (f0.key if rule == "BOM_ALT_CHANGED" else "")
        f0.finalize()
        keep.append(f0)
    return keep


def _diff_connectivity(a: Design, b: Design, sym: set[str]) -> list[Finding]:
    out: list[Finding] = []
    a2b = _best_match(a.nets, b.pin_net)
    b2a = _best_match(b.nets, a.pin_net)

    def mapped(na, nb):
        return a2b.get(na) == nb and b2a.get(nb) == na

    # renames: mutually matched nets whose name differs (membership changes reported separately)
    both_parts = set(a.parts) & set(b.parts)
    for na, nb in sorted(a2b.items()):
        if na == nb or not mapped(na, nb):
            continue
        sa = {p for p in a.nets[na] if p[0] in both_parts}
        sb = {p for p in b.nets[nb] if p[0] in both_parts}
        auto = bool(re.fullmatch(r"N\d+", nb))
        same = sa == sb
        out.append(_f(a, b, category="CONN", rule="NET_RENAMED",
                      severity="WARN" if (auto or not same) else "INFO",
                      title=f"net {na} renamed to {nb}" + (" (auto-generated name!)" if auto else ""),
                      detail=(f"{len(sb)} pins, identical membership" if same
                              else f"membership also changed: {len(sa)} -> {len(sb)} pins (see pin findings)"),
                      nets=[na, nb], refdes=sorted({p[0] for p in sb}, key=natkey)[:6]))

    # per-pin moves
    moves: dict[tuple[str, str], list] = defaultdict(list)
    for k in set(a.pin_net) & set(b.pin_net):
        na, nb = a.pin_net[k], b.pin_net[k]
        if not mapped(na, nb):
            moves[(na, nb)].append(k)

    # pin swap on one part: pin p X->Y and pin q Y->X  => one root cause.
    # 2-pin non-polarized part: electrically equivalent (INFO). Anything else: real swap (WARN).
    swapped = set()
    by_ref: dict[str, list] = defaultdict(list)
    for (na, nb), ks in moves.items():
        for k in ks:
            by_ref[k[0]].append((k, na, nb))
    for r in sorted(by_ref, key=natkey):
        lst = by_ref[r]
        for i, (k1, x1, y1) in enumerate(lst):
            if k1 in swapped:
                continue
            for k2, x2, y2 in lst[i + 1:]:
                if k2 in swapped or not (x1 == y2 and y1 == x2):
                    continue
                swapped |= {k1, k2}
                pr = b.prim(r)
                equiv = _prefix(r) in sym and pr is not None and len(pr.all_pin_numbers()) == 2
                pins = sorted([k1, k2], key=lambda k: natkey(k[1]))
                x1, y1 = a.pin_net[pins[0]], a.pin_net[pins[1]]     # title follows pin order, not set iteration order
                desc = ", ".join(f"{_pin(k)} ({b.pin_name.get(k, '')}) {a.pin_net[k]} -> {b.pin_net[k]}" for k in pins)
                out.append(_f(a, b, category="CONN", rule="PIN_SWAP_EQUIV" if equiv else "PINS_SWAPPED",
                              severity="INFO" if equiv else "WARN",
                              title=(f"{r} pins swapped between {x1} / {y1} (electrically equivalent)" if equiv
                                     else f"{r} pins {pins[0][1]} and {pins[1][1]} swapped nets ({x1} <-> {y1})"),
                              detail=("2-pin non-polarized part; connection unchanged electrically. " if equiv else "")
                                     + desc,
                              refdes=[r], nets=sorted([x1, y1]), pins=[_pin(k) for k in pins]))
                break

    for (na, nb), ks in sorted(moves.items()):
        ks = sorted((k for k in ks if k not in swapped), key=lambda k: (natkey(k[0]), natkey(k[1])))
        if not ks:
            continue
        a_rest = [p for p in a.nets[na] if p in b.pin_net and p not in ks]
        nb_is_new = nb not in a.nets and b2a.get(nb) == na
        if not a_rest and nb in b.nets and len(b.nets[nb]) > len(ks):
            rule, title = "NET_MERGED", f"net {na} merged into {nb}"
        elif a_rest and nb_is_new:
            rule, title = "NET_SPLIT", f"net {na} split: {len(ks)} pin(s) now on {nb}"
        else:
            rule, title = "PIN_MOVED", f"{len(ks)} pin(s) moved {na} -> {nb}"
        sev = "WARN"
        auto = bool(re.fullmatch(r"N\d+", nb))
        if auto:
            title += " (auto-generated net name)"
        left = [_pin(p) for p in a_rest]
        out.append(_f(a, b, category="CONN", rule=rule, severity=sev, title=title,
                      detail=("pins: " + ", ".join(f"{_pin(k)} ({b.pin_name.get(k, '')})" for k in ks)
                              + (f"\npins remaining on {na}: {', '.join(left)}" if rule == "NET_SPLIT" else "")),
                      refdes=sorted({k[0] for k in ks}, key=natkey), nets=[na, nb],
                      pins=[_pin(k) for k in ks], evidence={"A": na, "B": nb}))

    # pins connected only in one revision (part present in both)
    for k in sorted(set(a.pin_net) - set(b.pin_net)):
        if k[0] in b.parts:
            out.append(_f(a, b, category="CONN", rule="PIN_DISCONNECTED", severity="WARN",
                          title=f"{_pin(k)} ({a.pin_name.get(k, '')}) no longer connected (was {a.pin_net[k]})",
                          refdes=[k[0]], nets=[a.pin_net[k]], pins=[_pin(k)]))
    for k in sorted(set(b.pin_net) - set(a.pin_net)):
        if k[0] in a.parts:
            out.append(_f(a, b, category="CONN", rule="PIN_CONNECTED", severity="WARN",
                          title=f"{_pin(k)} ({b.pin_name.get(k, '')}) newly connected to {b.pin_net[k]}",
                          refdes=[k[0]], nets=[b.pin_net[k]], pins=[_pin(k)]))
    return out
