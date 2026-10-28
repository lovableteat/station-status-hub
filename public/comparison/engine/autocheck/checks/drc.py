"""Basic DRC on a single design + BOM-vs-netlist consistency.

Run on both revisions; findings whose key also exists in the old revision are tagged EXISTING,
otherwise NEW, so reviewers can focus on what this revision introduced.
"""
from __future__ import annotations

import re
from collections import defaultdict

from ..findings import Finding
from ..model import Design, natkey
from ..values import close, parse_cap, parse_res


def _prefix(r: str) -> str:
    m = re.match(r"[A-Za-z_]+", r)
    return m.group(0).upper() if m else ""


def _f(d: Design, **kw) -> Finding:
    refs = kw.get("refdes", [])
    if refs and "page" not in kw:
        kw["page"] = d.page_of(refs[0])
    kw["page_title"] = d.page_title(kw.get("page"))
    return Finding(**kw).finalize()


def is_nettie(d: Design, r: str, cfg: dict) -> bool:
    """Copper net-tie / short pin: never appears in the BOM but is always 'built'."""
    g = cfg["ground"]
    pr = d.prim(r)
    if _prefix(r) in set(g["nettie_prefixes"]):
        return True
    return bool(pr and re.search(g["nettie_name_regex"], f"{pr.name} {pr.value}", re.I))


def present(d: Design, r: str, cfg: dict) -> bool:
    """Part physically exists on the built board (stuffed, copper net-tie, or test pad)."""
    return (d.stuffed(r) or is_nettie(d, r, cfg)
            or _prefix(r) in set(cfg["parts"].get("always_built_prefixes", [])))


def is_tie(d: Design, r: str, cfg: dict) -> bool:
    """Built part that forces both of its nets to (practically) the same potential."""
    pr = d.prim(r)
    if pr is None or len(pr.all_pin_numbers()) != 2:
        return False
    if is_nettie(d, r, cfg):
        return True
    if not d.stuffed(r):
        return False
    px = _prefix(r)
    g = cfg["ground"]
    if px in set(g["tie_prefixes"]):
        return True
    text = f"{pr.value} {pr.name} {d.bom[r].desc if d.bom and r in d.bom else ''}".upper()
    if "BEAD" in text:
        return True
    if px in ("R", "RS"):
        v = parse_res(pr.value)
        return v is not None and v <= float(g["tie_max_ohm"])
    return False


def tie_edges(d: Design, cfg: dict) -> list[tuple[str, str, str]]:
    edges = []
    for r in d.parts:
        if is_tie(d, r, cfg):
            ns = sorted({d.pin_net[k] for k in d.pins_of(r)})
            if len(ns) == 2:
                edges.append((ns[0], ns[1], r))
    return edges


def drc(d: Design, cfg: dict) -> list[Finding]:
    out: list[Finding] = []
    active = set(cfg["parts"]["active_prefixes"])
    auto_re = re.compile(cfg["naming"]["auto_net_regex"])
    gnd_re = re.compile(cfg["ground"]["regex"])
    nc_net = re.compile(cfg["drc"]["intentional_nc_net_regex"], re.I)
    nc_pin = re.compile(cfg["drc"]["nc_pin_name_regex"], re.I)
    mech = re.compile(cfg["parts"]["mechanical_refdes_regex"])

    for net, pins in sorted(d.nets.items()):
        refs = sorted({p[0] for p in pins}, key=natkey)
        if len(pins) == 1:
            k = pins[0]
            intended = bool(nc_net.search(net) or nc_pin.match(d.pin_name.get(k, "")))
            out.append(_f(d, category="DRC", rule="SINGLE_PIN_NET", severity="INFO" if intended else "WARN",
                          title=f"net {net} has only one pin ({k[0]}.{k[1]} {d.pin_name.get(k, '')})",
                          detail=("named as an intentional no-connect" if intended else
                                  "dangling net: missing wire / net label, or an intentional stub to document"),
                          refdes=[k[0]], nets=[net], pins=[f"{k[0]}.{k[1]}"]))
        elif cfg["drc"]["floating_after_dnp"] and (d.bom is not None or (d.ni_applies and d.ni)):
            stuffed = [p for p in pins if present(d, p[0], cfg)]
            if (len(stuffed) == 1 and _prefix(stuffed[0][0]) in active and not gnd_re.fullmatch(net)
                    and not nc_pin.match(d.pin_name.get(stuffed[0], "")) and present(d, stuffed[0][0], cfg)):
                k = stuffed[0]
                dnp = sorted({p[0] for p in pins if not present(d, p[0], cfg)}, key=natkey)
                out.append(_f(d, category="DRC", rule="FLOATING_AFTER_DNP", severity="WARN",
                              title=f"{k[0]}.{k[1]} ({d.pin_name.get(k, '')}) floats in this build: "
                                    f"every other part on {net} is DNP",
                              detail=f"DNP on this net: {', '.join(dnp)}. Confirm the pin may be left open "
                                     f"(datasheet: internal pull / NC allowed).",
                              refdes=[k[0]], nets=[net], pins=[f"{k[0]}.{k[1]}"]))
        caps = [p for p in pins if re.match(r"C\d", p[0])]
        if len(pins) >= 2 and len(caps) == len(pins) and not gnd_re.fullmatch(net) and not nc_net.search(net):
            # every pin on the net is a capacitor pin: nothing drives or uses the node (2026-10-22, B)
            crefs = sorted({p[0] for p in caps}, key=natkey)
            built = [r for r in crefs if d.stuffed(r)]
            # far ends of the caps: all on one net = parallel caps hanging on a dead rail (ERROR); different nets =
            # a series chain mid-point (high-voltage MLCC stacks, AC coupling pairs) = WARN (QA 2026-10-22)
            far = {d.pin_net[k] for r in crefs for k in d.pins_of(r) if d.pin_net[k] != net}
            sev = ("ERROR" if len(far) <= 1 else "WARN") if built else "INFO"
            # owner 2026-10-27: filter caps hung on a power symbol whose source sits elsewhere are standard practice,
            # so the rule is INFO (config drc.cap_only_severity, listed in Excel, no PDF box). Set to "auto" for the
            # ERROR / WARN / INFO split above.
            fixed = str(cfg["drc"].get("cap_only_severity", "auto")).upper()
            if fixed in ("ERROR", "WARN", "INFO"):
                sev = fixed
            out.append(_f(d, category="DRC", rule="CAP_ONLY_NET", severity=sev,
                          title=f"net {net} connects only capacitors ({len(crefs)}): no source, no load",
                          detail=f"pins: {', '.join(f'{p[0]}.{p[1]}' for p in sorted(pins, key=lambda p: natkey(p[0] + '.' + p[1])))}"
                                 + ("" if built else " (all DNP)")
                                 + ". A rail / signal label is probably wrong or a wire is missing.",
                          refdes=crefs, nets=[net], key=f"CAP_ONLY_NET|{net}"))
        if auto_re.fullmatch(net):
            out.append(_f(d, category="DRC", rule="AUTO_NET_NAME", severity=cfg["drc"].get("auto_net_severity", "INFO"),
                          title=f"unnamed net {net} (tool-generated name)",
                          detail=f"pins: {', '.join(f'{p[0]}.{p[1]}' for p in pins)}. "
                                 "Usually a wire without net label; check for a broken connection.",
                          refdes=refs[:6], nets=[net]))

    for r in sorted(d.parts, key=natkey):
        pr = d.prim(r)
        ks = d.pins_of(r)
        if mech.match(r):
            continue
        if pr and len(pr.all_pin_numbers()) == 2 and len(ks) == 2 and d.pin_net[ks[0]] == d.pin_net[ks[1]]:
            st = d.stuffed(r)
            out.append(_f(d, category="DRC", rule="TWO_PIN_SHORTED", severity="WARN" if st else "INFO",
                          title=f"{r} both pins on {d.pin_net[ks[0]]}" + ("" if st else " (DNP)"),
                          detail=f"{pr.value}: part is shorted by its own net", refdes=[r],
                          nets=[d.pin_net[ks[0]]]))

    if cfg["drc"]["similar_names"]:
        groups = defaultdict(list)
        for n in d.nets:
            groups[re.sub(r"[_\-\s]", "", n.upper())].append(n)
        for g, names in sorted(groups.items()):
            if len(names) > 1:
                out.append(_f(d, category="DRC", rule="SIMILAR_NET_NAMES", severity="WARN",
                              title="near-identical net names: " + " / ".join(sorted(names)),
                              detail="names differ only by case or separators; likely meant to be one net",
                              nets=sorted(names)))

    # ground islands: every ground-named net must reach the main ground through stuffed tie parts
    main = cfg["ground"]["main"]
    adj = defaultdict(set)
    for n1, n2, r in tie_edges(d, cfg):
        adj[n1].add(n2)
        adj[n2].add(n1)
    reach, stack = {main}, [main]
    while stack:
        for nx in adj[stack.pop()]:
            if nx not in reach:
                reach.add(nx)
                stack.append(nx)
    for net in sorted(d.nets):
        if net != main and gnd_re.fullmatch(net) and net not in reach and main in d.nets:
            pins = d.nets[net]
            act = [f"{p[0]}.{p[1]}({d.pin_name.get(p, '')})" for p in pins if _prefix(p[0]) in active]
            out.append(_f(d, category="DRC", rule="GROUND_ISLAND", severity="ERROR",
                          title=f"ground net {net} has no stuffed connection to {main}",
                          detail=f"{len(pins)} pins; active pins: {', '.join(act) or '-'}. "
                                 f"No stuffed 0R / net-tie / bead / fuse links it to {main}. "
                                 "Unless the IC ties it internally (check datasheet), this ground floats.",
                          refdes=sorted({p[0] for p in pins}, key=natkey)[:8], nets=[net, main],
                          key=f"GROUND_ISLAND|{net}"))
    return out


def bom_checks(d: Design, cfg: dict) -> list[Finding]:
    if d.bom is None:
        return []
    out: list[Finding] = []
    mech = re.compile(cfg["parts"]["mechanical_refdes_regex"])
    for rule, detail in d.bom_problems:
        out.append(_f(d, category="BOMCHK", rule=rule, severity="ERROR", title=detail.split(" (")[0],
                      detail=detail, key=f"{rule}|{detail}"))
    for ln in d.bom_links:     # bom_socket.py decisions, BOM file order
        if ln["status"] == "LINKED":
            out.append(_f(d, category="BOMCHK", rule="BOM_SOCKET_LINKED", severity="INFO",
                          title=f"BOM '{ln['token']}' ({ln['pn']}) mapped to {ln['refdes']}",
                          refdes=[ln["refdes"]],
                          detail=f"{ln['refdes']} sits on socket {ln['socket']}'s nets "
                                 f"({', '.join(ln['candidates'])}); BOM row {ln['row']}",
                          key=f"BOM_SOCKET_LINKED|{ln['token']}|{ln['refdes']}|{ln['pn']}"))
        else:
            refs = [ln["socket"]] if ln["socket"] in d.parts else []
            out.append(_f(d, category="BOMCHK", rule="BOM_REF_UNRESOLVED", severity="WARN",
                          title=f"BOM '{ln['token']}' ({ln['pn']}) not mapped to a netlist part",
                          refdes=refs,
                          detail=f"{ln['reason']}"
                                 + (f"; candidates {', '.join(ln['candidates'])}" if ln["candidates"] else "")
                                 + f"; BOM row {ln['row']}. The part it stands for counts as DNP.",
                          key=f"BOM_REF_UNRESOLVED|{ln['token']}|{ln['pn']}"))
    # company BOM vs DSN NI (2026-10-22): the BOM decides DNP, a disagreement with the schematic marking is reported
    if d.dsn_props and not d.ni_applies:
        dc = cfg.get("dnp", {}) or {}
        prop = (dc.get("dsn_property") or ["Optional"])[0]
        sev = dc.get("conflict_severity", "WARN")
        skip = set(cfg["parts"].get("always_built_prefixes", []))
        for r in sorted(d.dsn_props, key=natkey):
            if mech.match(r) or _prefix(r) in skip or is_nettie(d, r, cfg):
                continue
            val = str(d.dsn_props[r].get(prop, "")).strip()
            if r in d.ni and r in d.bom:
                out.append(_f(d, category="BOMCHK", rule="BOM_NI_CONFLICT", severity=sev,
                              title=f"{r} marked {prop}={val} on the schematic but listed in the BOM ({d.bom[r].pn})",
                              refdes=[r], detail=f"BOM row {d.bom[r].row}: {d.bom[r].desc}. The BOM decides: counted as stuffed.",
                              key=f"BOM_NI_CONFLICT|{r}"))
            elif val and r not in d.ni and r not in d.bom:
                out.append(_f(d, category="BOMCHK", rule="BOM_NI_CONFLICT", severity=sev,
                              title=f"{r} not in the BOM but the schematic marks it {prop}={val} (not NI)",
                              refdes=[r], detail="The BOM decides: counted as DNP. Either the BOM misses it or the "
                                                 "schematic should mark it NI.",
                              key=f"BOM_NI_CONFLICT|{r}"))
    for r in sorted(set(d.bom) - set(d.parts), key=natkey):
        if mech.match(r):
            continue
        it = d.bom[r]
        out.append(_f(d, category="BOMCHK", rule="BOM_REF_NOT_IN_NETLIST", severity="ERROR",
                      title=f"{r} is in BOM ({it.pn}) but not in the netlist", refdes=[r],
                      detail=f"{it.desc} | {it.spec} (BOM row {it.row})"))
    for r in sorted(set(d.bom) & set(d.parts), key=natkey):
        it, val = d.bom[r], d.value(r)
        px = _prefix(r)
        if px == "C":
            fa, va = parse_cap(val)
            fb, vb = parse_cap(it.desc)
            bad = []
            if fa and fb and not close(fa, fb):
                bad.append("capacitance")
            if va and vb and not close(va, vb):
                bad.append("voltage")
            if bad:
                out.append(_f(d, category="BOMCHK", rule="BOM_VALUE_MISMATCH", severity="ERROR",
                              title=f"{r} schematic {val} vs BOM {it.desc} ({'/'.join(bad)})", refdes=[r],
                              detail=f"BOM {it.pn} {it.desc}", evidence={"schematic": val, "BOM": it.desc}))
        elif px in ("R", "RS"):
            ra, rb = parse_res(val), parse_res(it.desc)
            if ra is not None and rb is not None and not close(ra, rb):
                out.append(_f(d, category="BOMCHK", rule="BOM_VALUE_MISMATCH", severity="ERROR",
                              title=f"{r} schematic {val} vs BOM {it.desc}", refdes=[r],
                              detail=f"BOM {it.pn}", evidence={"schematic": val, "BOM": it.desc}))
        elif px in ("U", "Q"):
            part = d.parts.get(r)
            pn_props = ((cfg.get("bomchk", {}) or {}).get("netlist_pn_props") or [])
            npn = next((part.props[p] for p in pn_props if part is not None and part.props.get(p)), "")
            if npn and (npn == it.pn or npn in {x[0] for x in it.alternates}):
                continue    # G0 2026-10-22: the netlist PN property (Concept NV_PN) proves the match; the symbol
                #             VALUE there is a spec string (CRB Q86 '1B1C1E-3906,-40V,...'), not an MPN
            pr = d.prim(r)
            mpn = (pr.value if pr else "") or (pr.name.split("_")[-1] if pr else "")
            blob = " ".join([it.desc, it.spec] + [f"{x[1]} {x[2]}" for x in it.alternates]).upper()
            if mpn and mpn.upper() not in blob:
                sub = f" (under sub-assembly {it.parent_pn}; its alternates are not itemised)" if it.parent_pn else ""
                sev = str((cfg.get("bomchk", {}) or {}).get("mpn_not_found_severity", "INFO")).upper()
                out.append(_f(d, category="BOMCHK", rule="BOM_MPN_NOT_FOUND", severity=sev,
                              title=f"{r} symbol MPN {mpn} not among BOM main/alternates", refdes=[r],
                              detail=f"BOM main {it.pn}: {it.desc} | {it.spec}{sub}",
                              key=f"BOM_MPN_NOT_FOUND|{r}|{mpn}|{it.pn}"))
    return out


def tag_new(new: list[Finding], old: list[Finding]) -> list[Finding]:
    old_keys = {f.key for f in old}
    for f in new:
        f.status = "EXISTING" if f.key in old_keys else "NEW"
    return new
