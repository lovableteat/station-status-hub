"""Root-cause short / open detection between two revisions (2026-10-22, owner request after the TPM test kit).

The pin-level diff (diff.py) reports moves per (old net, new net) pair, so one wiring mistake can come out as two
NET_SPLIT / PIN_MOVED WARNs plus two SINGLE_PIN_NET WARNs without ever saying "short". This module looks one level up:

  super-net  nets joined by built tie parts (drc.tie_edges: 0R / fuse / bead / net-tie) and built series resistors
             <= netrules.series_max_ohm between two non-ground, non-rail nets (a pull-up to a rail is never joined).
  NET_SHORTED   one B super-net is the home of >= 2 A super-nets that were separate in A. Home = the B super-net with a
                strict plurality (no tie) and >= 2 of the old super-net's pins; old super-nets with < 2 pins have none
                (pin swaps, single pin moves, a flipped series R on 2-pin nets and an ECO wire to a stub never qualify). Severity: ground with
                non-ground, two rails of different voltage, or two signals each carrying an active-part pin -> ERROR;
                same-voltage rails or signals without active pins on both sides -> WARN; ground with ground -> INFO.
  PIN_ISOLATED  a built pin had built company in A (its A super-net had other pins of built parts) and is alone in B. Active part
                (parts.active_prefixes) -> ERROR, otherwise WARN. Intentional NC net / pin names are skipped.
Only pins of parts present in both revisions count. Every finding lists the diff / DRC findings of the same root cause
in its detail ('same root cause'); those keep their own rows (regression rule: old findings never change).
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict

from ..findings import Finding
from ..model import Design, natkey
from ..values import net_voltage_from_name, parse_res
from .capv import _legacy_prefix_volt
from .drc import present, tie_edges


class _UF:
    def __init__(self):
        self.p: dict[str, str] = {}

    def find(self, x: str) -> str:
        self.p.setdefault(x, x)
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a: str, b: str) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            if rb < ra:
                ra, rb = rb, ra
            self.p[rb] = ra


def _volt(net: str, cfg: dict, bl: set[str]) -> float | None:
    v = net_voltage_from_name(net, bl)
    return v if v is not None else _legacy_prefix_volt(net, bl, cfg)


def _verified(net: str, bl: set[str]) -> bool:
    return net_voltage_from_name(net, bl) is not None


def super_nets(d: Design, cfg: dict, allow: set[str] | None = None) -> tuple[dict[str, str], set[str]]:
    """(net -> super-net representative, parts that joined). allow: only these parts may join (B side uses A's
    joiners, so a 0R newly stuffed in B is a build option, not a short)."""
    gnd = re.compile(cfg["ground"]["regex"])
    bl = {x.upper() for x in cfg["net_voltage"]["blacklist"]}
    smax = float((cfg.get("netrules", {}) or {}).get("series_max_ohm", 100))
    uf = _UF()
    for n in d.nets:
        uf.find(n)
    used: set[str] = set()
    for n1, n2, r in tie_edges(d, cfg):
        if allow is None or r in allow:
            uf.union(n1, n2)
            used.add(r)
    for r in d.parts:
        if not re.match(r"R\d", r) or not d.stuffed(r) or (allow is not None and r not in allow):
            continue
        ks = d.pins_of(r)
        pr = d.prim(r)
        if pr is None or len(pr.all_pin_numbers()) != 2 or len(ks) != 2:
            continue
        n1, n2 = d.pin_net[ks[0]], d.pin_net[ks[1]]
        if n1 == n2 or gnd.fullmatch(n1) or gnd.fullmatch(n2):
            continue
        if _volt(n1, cfg, bl) is not None or _volt(n2, cfg, bl) is not None:
            continue
        ohm = parse_res(d.value(r))
        if ohm is not None and ohm <= smax:
            uf.union(n1, n2)
            used.add(r)
    return {n: uf.find(n) for n in d.nets}, used


def _kind(nets: set[str], cfg: dict) -> tuple[str, float | None, bool]:
    """(ground / rail / signal, voltage, voltage from a legacy VDD_ / VCC_ name only = unverified)."""
    gnd = re.compile(cfg["ground"]["regex"])
    bl = {x.upper() for x in cfg["net_voltage"]["blacklist"]}
    if any(gnd.fullmatch(n) for n in nets):
        return "ground", 0.0, False
    vs = sorted({v for v in (_volt(n, cfg, bl) for n in nets) if v is not None})
    if vs:
        return "rail", vs[0], not any(_verified(n, bl) for n in nets)
    return "signal", None, False


def _pin(k) -> str:
    return f"{k[0]}.{k[1]}"


def short_open(a: Design, b: Design, cfg: dict, prior: list[Finding] | None = None) -> list[Finding]:
    active = {p.upper() for p in cfg["parts"]["active_prefixes"]}
    nc_net = re.compile(cfg["drc"]["intentional_nc_net_regex"], re.I)
    nc_pin = re.compile(cfg["drc"]["nc_pin_name_regex"], re.I)
    sa, joiners = super_nets(a, cfg)
    sb, _ = super_nets(b, cfg, allow=joiners)
    a_root_pins: dict[str, list] = defaultdict(list)
    for n, ps in a.nets.items():
        a_root_pins[sa[n]].extend(ps)
    common = sorted(set(a.parts) & set(b.parts), key=natkey)
    keys = [k for r in common for k in a.pins_of(r) if k in b.pin_net]

    def px(r: str) -> str:
        m = re.match(r"[A-Za-z_]+", r)
        return m.group(0).upper() if m else ""

    a_members: dict[str, list] = defaultdict(list)
    for k in keys:
        a_members[sa[a.pin_net[k]]].append(k)
    b_size: Counter = Counter(sb[b.pin_net[k]] for k in b.pin_net)
    out: list[Finding] = []
    prior = prior or []

    def same_cause(pins: set[str], nets: set[str]) -> list[str]:
        hit = []
        for f in prior:
            if f.rule in ("NET_SPLIT", "NET_MERGED", "PIN_MOVED", "PIN_DISCONNECTED", "PIN_CONNECTED", "PINS_SWAPPED"):
                if set(f.pins) & pins:
                    hit.append(f"{f.rule} {f.title}")
            elif f.rule == "SINGLE_PIN_NET" and set(f.pins) & pins:
                hit.append(f"{f.rule} {f.title}")
        return sorted(set(hit))

    # ------------------------------------------------------------------ shorts
    # home = the B super-net holding a strict majority-by-count of the old super-net's pins, and at least 2 of them:
    # a tie (2-pin net whose series R flipped) or a 1-pin stub newly wired (ECO) has no home (QA 2026-10-22 #5)
    home: dict[str, str] = {}
    for root, ks in a_members.items():
        if len(ks) < 2:
            continue
        c = Counter(sb[b.pin_net[k]] for k in ks).most_common()
        if c[0][1] < 2 or (len(c) > 1 and c[1][1] == c[0][1]):
            continue
        home[root] = c[0][0]
    by_home: dict[str, list[str]] = defaultdict(list)
    for root, h in home.items():
        a_nets = {n for n in a.nets if sa[n] == root}
        if all(nc_net.search(n) for n in a_nets):
            continue                                    # intentional no-connect stubs never "short"
        by_home[h].append(root)
    for h, roots in sorted(by_home.items()):
        if len(roots) < 2:
            continue
        groups = []
        for root in sorted(roots):
            nets = {n for n in a.nets if sa[n] == root}
            ks = [k for k in a_members[root] if sb[b.pin_net[k]] == h]
            act = [k for k in ks if px(k[0]) in active and present(b, k[0], cfg)]
            groups.append((root, nets, ks, act, *_kind(nets, cfg)))
        kinds = {g[4] for g in groups}
        if kinds == {"ground"}:
            sev = "INFO"
        elif "ground" in kinds:
            sev = "ERROR"
        elif kinds == {"rail"}:
            # different voltages = ERROR, unless a voltage rests on a legacy name only (never ERROR on a guess)
            sev = "ERROR" if len({g[5] for g in groups}) > 1 and not any(g[6] for g in groups) else "WARN"
        else:
            sev = "ERROR" if sum(1 for g in groups if g[3]) >= 2 else "WARN"
        names = [min(g[1], key=lambda n: (bool(re.fullmatch(r"N\d+", n)), n)) for g in groups]
        pins = sorted({_pin(k) for g in groups for k in (g[3] or g[2])}, key=natkey)
        b_nets = sorted({n for n in b.nets if sb[n] == h})
        refs = sorted({k[0] for g in groups for k in g[2]}, key=natkey)   # every part on the moved side
        lines = [f"old {g[0]} ({g[4]}{'' if g[5] is None else f' {g[5]:g} V'}{' 未驗證' if g[6] else ''}): "
                 + ", ".join(f"{_pin(k)} ({a.pin_name.get(k, '')})" for k in sorted(g[3] or g[2],
                                                                                     key=lambda k: natkey(_pin(k))))
                 for g in groups]
        cause = same_cause({_pin(k) for g in groups for k in g[2]} | {p for p in pins}, set(b_nets))
        # owner 2026-10-27: the title must be readable against the NEW drawing: old names are gone there, so name the
        # new net and the IC pins (with pin names) that each old net brought in. English detail unchanged.
        new_named = [n for n in b_nets if not re.fullmatch(r"N\d+", n)] or b_nets
        sides = []
        for g in groups:
            shown = sorted(g[3] or g[2], key=lambda k: natkey(_pin(k)))[:4]
            sides.append(f"舊 {min(g[1], key=lambda n: (bool(re.fullmatch(r'N\d+', n)), n))} 側 "
                         + "、".join(f"{_pin(k)}" + (f" ({a.pin_name[k]})" if a.pin_name.get(k) else "") for k in shown))
        title_zh = (f"{' 與 '.join(names)} 在新版併成同一條 net {'/'.join(new_named)}："
                    + "；".join(sides) + " 接在一起")
        out.append(Finding(
            category="CONN", rule="NET_SHORTED", severity=sev,
            title=title_zh,
            detail="\n".join(lines) + f"\nnew super-net: {', '.join(b_nets)} (joined through 0R / bead / series R"
                   f" <= {(cfg.get('netrules', {}) or {}).get('series_max_ohm', 100)} ohm)"
                   + (("\nsame root cause: " + "; ".join(cause)) if cause else ""),
            refdes=refs, nets=sorted(set(names) | set(b_nets)), pins=pins,
            page=b.page_of(refs[0]) if refs else None,
            page_title=b.page_title(b.page_of(refs[0])) if refs else "",
            # sides: per old net, the parts that moved with it (annotate boxes the new net's label nearest to them,
            # one per side, no part box; owner 2026-10-27)
            evidence={"A": names, "B": b_nets, "new": new_named[0],
                      "sides": [{"old": n, "parts": sorted({k[0] for k in g[2]}, key=natkey)}
                                for n, g in zip(names, groups)],
                      # B-full root-cause grouping (2026-10-27): every pin that moved into the short and every old net
                      # name per side (names keeps one per side), so tracking.link_root_causes can claim the diff / DRC
                      # rows of the same cause. Finding.pins / title / detail unchanged.
                      "pins": sorted({_pin(k) for g in groups for k in g[2]}, key=natkey),
                      "old_nets": [sorted(g[1]) for g in groups]},
            key="NET_SHORTED|" + ",".join(sorted(names))).finalize())

    # ------------------------------------------------------------------ isolated pins
    for root, ks in sorted(a_members.items()):
        for k in sorted(ks, key=lambda k: natkey(_pin(k))):
            nb = b.pin_net[k]
            if b_size[sb[nb]] != 1 or not present(b, k[0], cfg):
                continue
            a_net = a.pin_net[k]
            a_mates = [p for p in a_root_pins[root] if p != k and present(a, p[0], cfg)]   # DNP mates: was alone
            if not a_mates or nc_net.search(nb) or nc_net.search(a_net) or nc_pin.match(b.pin_name.get(k, "")):
                continue
            sev = "ERROR" if px(k[0]) in active else "WARN"
            mates = sorted({_pin(p) for p in a_mates}, key=natkey)
            cause = same_cause({_pin(k)} | set(mates), {nb, a_net})
            pg = b.page_of(k[0])
            out.append(Finding(
                category="CONN", rule="PIN_ISOLATED", severity=sev,
                title=(f"{_pin(k)} ({b.pin_name.get(k, '')}) lost every connection: "
                       + (f"{nb} now has no other pin" if nb == a_net else f"was on {a_net}, now alone on {nb}")),
                detail=f"old companions: {', '.join(mates[:12])}{' ...' if len(mates) > 12 else ''}"
                       + (("\nsame root cause: " + "; ".join(cause)) if cause else ""),
                refdes=[k[0]], nets=sorted({a_net, nb}), pins=[_pin(k)], page=pg, page_title=b.page_title(pg),
                evidence={"A": a_net, "B": nb, "A_parts": sorted({p[0] for p in a_mates}, key=natkey)},
                key=f"PIN_ISOLATED|{_pin(k)}").finalize())
    return out
