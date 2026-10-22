"""I2C map (2026-10-12, owner request, TEST STATE: every rule INFO, severities in config i2c.severity).

Purpose (owner): check that the final circuit still matches the I2C block diagram it was designed from.
Derived from netlist + BOM + config/i2c_devices.yaml only; no datasheet text and no AI at run time.

  bus      = SDA lines + SCL lines that belong together, joined through ANY 0R / R <= series_max (built or DNP),
             never across a rail; a DNP 0R keeps the branch on the map (greyed) but splits the segments.
  segment  = one NetGraph node: nets joined by BUILT ties / series R. Pull-ups are counted per segment and line.
  device   = IC with an SDA / SCL pin (config i2c.sda_pin / scl_pin) or a library mux / buffer port.
  scope    = address space: SDA segments, merged across library 'buffer' parts; a 'mux' channel is its own scope.
  address  = library entry of the part (symbol VALUE, BOM main / alternates), strap state read per address pin.

Out of scope (owner 2026-10-12): bus capacitance, Rp min / max, rise time, speed checks (speed is a label).
"""
from __future__ import annotations

import csv
import re
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from ..findings import Finding
from ..model import Design, natkey
from ..values import parse_res_loose
from .drc import _prefix, is_nettie, present
from .netrules import NetGraph

LIB_DEFAULT = Path(__file__).resolve().parent.parent.parent / "config" / "i2c_devices.yaml"
# Entries RD added from an uploaded datasheet (autocheck i2c-accept / UI page "I2C 位址庫"). Searched BEFORE the built-in
# file, so a signed table for a part the built-in file only lists empty (MP5926) takes effect.
LIB_USER_DEFAULT = LIB_DEFAULT.parent / "i2c_devices_user.yaml"
DATASHEETS_DEFAULT = LIB_DEFAULT.parent.parent / "datasheets"
RULES = ("I2C_ADDR_RESERVED", "I2C_ADDR_CONFLICT", "I2C_PU_DUPLICATE", "I2C_NO_PULLUP", "I2C_SDA_SPLIT", "I2C_ADDR_PIN_FLOAT",
         "I2C_ADDR_UNRESOLVED", "I2C_ADDR_PART_DIFF", "I2C_LIB_MISSING", "I2C_DECLARED_MISMATCH",
         "I2C_UNDECLARED_DEVICE", "I2C_SECOND_SOURCE_UNCHECKED")
DECLARED_FIELDS = ["kind", "label", "refdes", "mpn", "addr7", "net", "value", "rail", "dnp", "note"]


# ------------------------------------------------------------------ library
@dataclass
class LibEntry:
    name: str
    rx: re.Pattern
    addr_pins: list[list[str]]
    float_ok: bool
    table: dict[str, int] | None
    base: int | None
    fmax: int | None
    kind: str
    verified: bool
    src: str
    raw: dict
    float_as: str = ""        # datasheet: an open pin reads as this state (M24C02 E pins read as 0)
    fixed: int | None = None  # one factory address, no address pin (TMP451 0x4C)
    origin: str = "內建"      # 內建 (config/i2c_devices.yaml) | 使用者簽核 (i2c_devices_user.yaml)

    def decode(self, states: list[str]) -> tuple[int | None, str]:
        """(address, problem). problem: '' | 'float' | 'unresolved' | 'no_table'."""
        if self.fixed is not None:
            return self.fixed, ""
        if self.float_as:
            states = [self.float_as if x == "Z" else x for x in states]
        if self.base is not None:
            if all(s in ("0", "1") for s in states):
                v = 0
                for s in states:
                    v = v * 2 + int(s)
                return self.base + v, ""
            if "Z" in states and not self.float_ok:
                return None, "float"
            return None, "unresolved"
        if not self.table:
            return None, "no_table"
        key = " ".join(states)
        if key in self.table:
            return self.table[key], ""
        if "Z" in states and not self.float_ok:
            return None, "float"
        return None, "unresolved"


def _int(v) -> int:
    """0x4C (YAML int) or "0x4C" (text, user library) or 76 / "076" (decimal)."""
    if isinstance(v, int):
        return v
    t = str(v).strip()
    return int(t, 16) if t.lower().startswith("0x") else int(t, 10)


def _entry(e: dict, origin: str) -> LibEntry:
    pins = [[x] if isinstance(x, str) else list(x) for x in (e.get("addr_pins") or [])]
    tab = e.get("table")
    verified = bool(e.get("verified", True))
    if origin != "內建" and not (str(e.get("signed_by") or "").strip() and str(e.get("signed_date") or "").strip()):
        verified = False                       # a user entry counts only after an RD signed it
    return LibEntry(
        name=str(e["name"]), rx=re.compile(str(e["mpn"]), re.I), addr_pins=pins,
        float_ok=bool(e.get("float_ok", False)),
        table={str(k).strip(): _int(v) for k, v in tab.items()} if isinstance(tab, dict) else None,
        base=_int(e["base"]) if e.get("base") is not None else None,
        fmax=int(e["fmax_khz"]) if e.get("fmax_khz") else None, kind=str(e.get("kind", "device")),
        verified=verified, src=str(e.get("src") or ""), raw=e,
        float_as=str(e.get("float_as") or ""),
        fixed=_int(e["fixed"]) if e.get("fixed") is not None else None, origin=origin)


def lib_paths(cfg: dict) -> tuple[Path, Path]:
    """(built-in library, user library) from config i2c.library / i2c.user_library (relative to config/)."""
    ic = cfg.get("i2c", {}) or {}
    out = []
    for key, dflt in (("library", LIB_DEFAULT), ("user_library", LIB_USER_DEFAULT)):
        v = ic.get(key)
        p = Path(v) if v else dflt
        out.append(p if p.is_absolute() else LIB_DEFAULT.parent / p)
    return out[0], out[1]


def datasheets_dir(cfg: dict) -> Path:
    v = (cfg.get("i2c", {}) or {}).get("datasheets_dir")
    p = Path(v) if v else DATASHEETS_DEFAULT
    return p if p.is_absolute() else LIB_DEFAULT.parent.parent / p


LIB_WARNINGS: list[str] = []      # problems found by the last load_library() (bad user entries are skipped, not fatal)


def load_library(cfg: dict, path: str | Path | None = None) -> list[LibEntry]:
    """Signed user entries first (they override an empty built-in entry such as MP5926), then the built-in file,
    then UNSIGNED user entries (they can never hide a verified built-in table; shown as 未驗證 only when nothing else
    matches). `path` = one explicit library file (tests): only that file is read.
    A malformed user entry is skipped with a warning in LIB_WARNINGS; the built-in file must load cleanly."""
    LIB_WARNINGS.clear()
    if path:
        files = [(Path(path), "內建")]
    else:
        builtin, user = lib_paths(cfg)
        files = [(user, "使用者簽核"), (builtin, "內建")]
    signed, base, unsigned = [], [], []
    for p, origin in files:
        if not p.is_file():
            continue
        try:
            data = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
        except yaml.YAMLError as x:
            if origin == "內建":
                raise
            LIB_WARNINGS.append(f"{p.name}: yaml 格式錯，整個使用者庫略過 ({x})")
            continue
        if not isinstance(data, dict):
            if origin == "內建":
                raise ValueError(f"{p}: top level must be 'devices: [...]'")
            LIB_WARNINGS.append(f"{p.name}: 最上層要是 devices: [...]，整個使用者庫略過")
            continue
        items = data.get("devices")
        if items is None:
            items = []
        if not isinstance(items, list):
            if origin == "內建":
                raise ValueError(f"{p}: devices must be a list")
            LIB_WARNINGS.append(f"{p.name}: devices 要是清單，整個使用者庫略過")
            continue
        for i, e in enumerate(items, 1):
            try:
                if not isinstance(e, dict):
                    raise ValueError("不是一筆 entry")
                ent = _entry(e, origin)
                for alts in ent.addr_pins:
                    if not all(isinstance(a, str) and a.strip() for a in alts):
                        raise ValueError("addr_pins 有空的腳名")
            except Exception as x:              # noqa: BLE001  one bad hand-edited entry must not drop the I2C map
                if origin == "內建":
                    raise
                LIB_WARNINGS.append(f"{p.name} 第 {i} 筆 ({(e or {}).get('name', '?') if isinstance(e, dict) else '?'}) 略過：{x}")
                continue
            (base if origin == "內建" else signed if ent.verified else unsigned).append(ent)
    return signed + base + unsigned


# ------------------------------------------------------------------ data
@dataclass
class Decode:
    source: str               # symbol / BOM main / BOM alt
    text: str                 # the MPN / description that matched
    lib: str
    addr: int | None
    problem: str
    verified: bool


@dataclass
class Device:
    refdes: str
    symbol: str               # symbol VALUE
    bom: str                  # BOM main "PN desc"
    built: bool
    kind: str = "device"
    lib: str = ""
    lib_src: str = ""
    states: str = ""          # strap states, MSB first, e.g. "Z 1 1"
    pin_states: list[str] = field(default_factory=list)   # "ADR2=Z"
    addr: int | None = None
    addr_note: str = ""       # why no address / unverified
    verified: bool = True
    fmax: int | None = None
    decodes: list[Decode] = field(default_factory=list)
    unmatched: list[tuple[str, str]] = field(default_factory=list)   # (source, text) found in no library entry
    sda_pins: list[str] = field(default_factory=list)     # "U31.12 SDA"
    scl_pins: list[str] = field(default_factory=list)
    sda_seg: list[str] = field(default_factory=list)      # segment ids of the SDA pins
    scl_seg: list[str] = field(default_factory=list)
    scope: str = ""
    bus: str = ""
    series: list[str] = field(default_factory=list)       # "SDA R432 33.2ohm" (series / 0R part on the branch)
    page: int | None = None
    change: str = ""          # vs A: new / changed / same / ''
    change_note: str = ""     # what changed vs A
    strap: list[str] = field(default_factory=list)        # built strap parts per address pin "A0: R12 10Kohm -> GND"
    strap_dnp: list[str] = field(default_factory=list)    # DNP strap parts (shown grey)
    line_nets: list[tuple[str, str]] = field(default_factory=list)   # (line, net) of every line pin, mux channels too
    sda_nets: list[str] = field(default_factory=list)     # net at each upstream SDA / SCL pin (branch label on the diagram)
    scl_nets: list[str] = field(default_factory=list)
    bom_spec: str = ""        # BOM main spec, raw (Agile "Mfr: MPN; ..."); 陽春版 block diagram box only

    @property
    def addr_txt(self) -> str:
        if self.addr is None:
            return ""
        return f"0x{self.addr:02X}" + ("" if self.verified else " (未驗證)")


@dataclass
class Segment:
    sid: str
    line: str                 # SDA / SCL
    nets: list[str]
    built_pullups: list[str]  # "R1016 2.21Kohm -> 3V3_STBY"
    dnp_pullups: list[str]
    connectors: list[str]     # "CN3.B5 PETN0"
    devices: list[str]        # RefDes with a line pin on the segment
    links: list[str]          # series parts inside the segment (built)
    scope: str = ""


@dataclass
class Bus:
    bid: str
    sda_nets: list[str]
    scl_nets: list[str]
    segments: list[Segment]
    devices: list[str]
    connectors: list[str]
    dnp_links: list[str]      # DNP 0R / series R inside the bus (branch drawn greyed)
    speed: str = ""
    parent: str = ""          # "U12 ch3" for a mux channel bus
    conn_pins: list[tuple[str, str, str]] = field(default_factory=list)   # (line, net, "CN3.B5 PETN0") off-board pins
    # 2026-10-13 陽春版 block diagram only (report/i2c_block_diagram.py): pins of ICs that are NOT I2C devices of this bus
    # (e.g. BMC ball GPIOX3_SDA9_... whose name the sda_pin regex does not take) = the upstream end, plus their VALUE
    host_pins: list[tuple[str, str, str]] = field(default_factory=list)   # (line, net, "U1.G7 GPIOX3_SDA9_...")
    part_values: dict[str, str] = field(default_factory=dict)            # RefDes -> symbol VALUE (conn + host parts)
    # 陽春版 topology (_block_topology): upstream pin -> trunk per line [net, "R686 22R", net, ...]; the trunk is the first
    # net with a device pin or a fork; a part whose far net is a dead-end device net stays on that device's branch
    end_chain: dict[str, list[str]] = field(default_factory=dict)
    pu_net: dict[str, str] = field(default_factory=dict)  # pull-up RefDes -> the bus net it sits on
    branches: dict[tuple[str, str], list[str]] = field(default_factory=dict)  # (RefDes, line) -> parts trunk -> pin


# ------------------------------------------------------------------ helpers
def _rx(cfg: dict, key: str, default: str) -> re.Pattern:
    return re.compile((cfg.get("i2c", {}) or {}).get(key) or default, re.I)


def _norm(s: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (s or "").upper())


def _candidates(d: Design, r: str) -> list[tuple[str, str]]:
    """(source, text): BOM main first (the part actually mounted), then the symbol, then BOM alternates."""
    out = []
    it = d.bom.get(r) if d.bom else None
    if it is not None:
        out.append(("BOM 主料", f"{it.pn} {it.desc} {it.spec}".strip()))
    out.append(("symbol", d.value(r)))
    if it is not None:
        for pn, desc, spec in it.alternates:
            out.append(("BOM 替代料", f"{pn} {desc} {spec}".strip()))
    return [(s, t) for s, t in out if t]


def _match(lib: list[LibEntry], text: str) -> LibEntry | None:
    for e in lib:
        if e.rx.search(text):
            return e
    return None


class _UF:
    def __init__(self, items):
        self.p = {x: x for x in items}

    def find(self, x):
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a, b):
        a, b = self.find(a), self.find(b)
        if a != b:
            if natkey(str(b)) < natkey(str(a)):
                a, b = b, a
            self.p[b] = a


def _sev(cfg: dict, rule: str) -> str:
    return str(((cfg.get("i2c", {}) or {}).get("severity", {}) or {}).get(rule, "INFO")).upper()


def _f(d: Design, cfg: dict, rule: str, **kw) -> Finding:
    refs = kw.get("refdes", [])
    if refs and "page" not in kw:
        kw["page"] = d.page_of(refs[0])
    kw["page_title"] = d.page_title(kw.get("page"))
    return Finding(category="I2C", rule=rule, severity=_sev(cfg, rule), **kw).finalize()


# ------------------------------------------------------------------ build
def build_map(d: Design, cfg: dict, g: NetGraph, lib: list[LibEntry] | None = None) -> dict:
    """Derived I2C map of one design. Returns {"buses", "devices", "segments", "scopes"} (dataclasses)."""
    lib = lib if lib is not None else load_library(cfg)
    sda_rx = _rx(cfg, "sda_pin", r"SDA|SDAI|SDAO")
    scl_rx = _rx(cfg, "scl_pin", r"SCL")
    ic_px = g.ic_px

    # library entry of each IC (main = first candidate that matches: BOM main, symbol, alternates)
    main_entry: dict[str, LibEntry | None] = {}
    for r in sorted(d.parts, key=natkey):
        if _prefix(r) not in ic_px:
            continue
        ent = None
        for _, t in _candidates(d, r):
            ent = _match(lib, t)
            if ent:
                break
        main_entry[r] = ent

    # line pins: (refdes, pin) -> (line, port) ; port '' upstream, 'ch<n>' mux channel, 'side<x>' buffer side
    line_pins: dict[tuple[str, str], tuple[str, str]] = {}
    for k in sorted(d.pin_net, key=lambda k: (natkey(k[0]), natkey(k[1]))):
        r = k[0]
        if _prefix(r) not in ic_px:
            continue
        name = d.pin_name.get(k, "")
        ent = main_entry.get(r)
        if ent is not None and ent.kind == "mux":
            for line, key in (("SDA", "channel_sda"), ("SCL", "channel_scl")):
                m = re.fullmatch(ent.raw.get(key, "(?!)"), name, re.I)
                if m:
                    line_pins[k] = (line, f"ch{m.group(1)}")
        if ent is not None and ent.kind == "buffer":
            for line, key in (("SDA", "side_sda"), ("SCL", "side_scl")):
                m = re.fullmatch(ent.raw.get(key, "(?!)"), name, re.I)
                if m:
                    line_pins[k] = (line, f"side{m.group(1).upper()}")
        if k in line_pins:
            continue
        if sda_rx.fullmatch(name):
            line_pins[k] = ("SDA", "")
        elif scl_rx.fullmatch(name):
            line_pins[k] = ("SCL", "")
    if not line_pins:
        return {"buses": [], "devices": {}, "segments": {}, "scopes": {}}

    # design-level connectivity: every 2-pin tie / R <= series_max, built or DNP, never across a rail
    uf = _UF(sorted(d.nets))
    dnp_link: dict[str, tuple[str, str]] = {}
    link_nn: dict[str, tuple[str, str]] = {}      # every link part (built or DNP) -> its two nets (陽春版 topology)
    tie_px = set(cfg["ground"].get("tie_prefixes", []))
    for r in sorted(d.parts, key=natkey):
        nn = g._two_nets(r)
        if not nn or g.is_rail(nn[0]) or g.is_rail(nn[1]):
            continue
        ohm = g.res_ohm(r)
        if not (_prefix(r) in tie_px or is_nettie(d, r, cfg) or (ohm is not None and ohm <= g.series_max)):
            continue
        uf.union(nn[0], nn[1])
        link_nn[r] = nn
        if not present(d, r, cfg):
            dnp_link[r] = nn

    # line components (design level) that carry a line pin; pair SDA / SCL components into buses by device
    comp_line: dict[str, str] = {}
    for k, (line, _) in line_pins.items():
        comp_line.setdefault(uf.find(d.pin_net[k]), line)
    pair = _UF(sorted(comp_line, key=natkey))
    by_port: dict[tuple[str, str], dict[str, str]] = defaultdict(dict)
    for k, (line, port) in line_pins.items():
        by_port[(k[0], port)].setdefault(line, uf.find(d.pin_net[k]))
    for (_, _), lines in sorted(by_port.items(), key=lambda t: (natkey(t[0][0]), t[0][1])):
        if "SDA" in lines and "SCL" in lines:
            pair.union(lines["SDA"], lines["SCL"])
    comp_nets: dict[str, list[str]] = defaultdict(list)
    for n in sorted(d.nets, key=natkey):
        root = uf.find(n)
        if root in comp_line:
            comp_nets[root].append(n)

    # segments (built connectivity = NetGraph nodes) per line component
    segments: dict[str, Segment] = {}
    seg_of_net: dict[str, str] = {}
    for root in sorted(comp_nets, key=natkey):
        line = comp_line[root]
        nodes = []
        for n in comp_nets[root]:
            nd = g.node_of.get(n)
            if nd is not None and all(nd is not x for x in nodes):
                nodes.append(nd)
        for nd in sorted(nodes, key=lambda x: natkey(x.rep)):
            sid = f"{line}:{_hub(d, nd)}"
            ups = [p for p in nd.pulls if p.v is None or p.v > 0]
            conns = [f"{r}.{p} {d.pin_name.get((r, p), '')}".strip() for r, p in nd.pins if _prefix(r) in g.off_px]
            devs = sorted({r for (r, p) in nd.pins if (r, p) in line_pins}, key=natkey)
            seg = Segment(sid=sid, line=line, nets=sorted(nd.nets, key=natkey),
                          built_pullups=[p.text(d) for p in ups if p.built],
                          dnp_pullups=[p.text(d) for p in ups if not p.built],
                          connectors=conns, devices=devs, links=sorted(nd.links, key=natkey))
            seg._node = nd  # type: ignore[attr-defined]
            segments[sid] = seg
            for n in nd.nets:
                seg_of_net[n] = sid

    # devices
    devices: dict[str, Device] = {}
    for k, (line, port) in sorted(line_pins.items(), key=lambda t: (natkey(t[0][0]), natkey(t[0][1]))):
        r = k[0]
        if r not in devices:
            it = d.bom.get(r) if d.bom else None
            ent = main_entry.get(r)
            devices[r] = Device(refdes=r, symbol=d.value(r), bom=f"{it.pn} {it.desc}".strip() if it else "",
                                bom_spec=(it.spec or "") if it else "",
                                built=present(d, r, cfg), kind=ent.kind if ent else "device",
                                lib=ent.name if ent else "", lib_src=ent.src if ent else "",
                                fmax=ent.fmax if ent else None, page=d.page_of(r))
        dv = devices[r]
        txt = f"{r}.{k[1]} {d.pin_name.get(k, '')}" + (f" [{port}]" if port else "")
        sid = seg_of_net.get(d.pin_net[k], "")
        net = d.pin_net[k]
        if (line, net) not in dv.line_nets:
            dv.line_nets.append((line, net))
        if line == "SDA":
            if net not in dv.sda_nets and not port.startswith("ch"):
                dv.sda_nets.append(net)
            dv.sda_pins.append(txt)
            # a mux's channel pins are downstream address spaces, not the mux's own bus
            if sid and not port.startswith("ch") and sid not in dv.sda_seg:
                dv.sda_seg.append(sid)
        else:
            if net not in dv.scl_nets and not port.startswith("ch"):
                dv.scl_nets.append(net)
            dv.scl_pins.append(txt)
            if sid and not port.startswith("ch") and sid not in dv.scl_seg:
                dv.scl_seg.append(sid)

    # series / 0R parts right at each device pin (the branch resistor on the block diagram), built or DNP
    # speed fix 2026-10-21 (HANDOVER 0p15): two-net parts indexed by net once, in natkey order (was a sort + scan of
    # every part for every device pin); the loop below visits the same parts in the same order
    two_on_net: dict[str, list[tuple[str, tuple[str, str]]]] = {}
    for x in sorted(d.parts, key=natkey):
        nn = g._two_nets(x)
        if nn:
            for n_ in nn:
                two_on_net.setdefault(n_, []).append((x, nn))
    for r, dv in devices.items():
        for k, (line, port) in line_pins.items():
            if k[0] != r:
                continue
            n = d.pin_net[k]
            for x, nn in two_on_net.get(n, ()):
                if x == r:
                    continue
                other = nn[1] if nn[0] == n else nn[0]
                if uf.find(other) != uf.find(n) or g.is_rail(other):
                    continue
                txt = f"{line} {x} {d.value(x)}" + ("" if present(d, x, cfg) else " [DNP]")
                if txt not in dv.series:
                    dv.series.append(txt)

    # address scopes: SDA segments; buffer sides merge, mux channels stay apart
    sda_sids = sorted((s for s in segments if s.startswith("SDA:")), key=natkey)
    scope = _UF(sda_sids)
    for r, dv in sorted(devices.items(), key=lambda t: natkey(t[0])):
        if dv.kind == "buffer" and dv.built:
            sids = [seg_of_net.get(d.pin_net[k]) for k, (ln, pt) in line_pins.items()
                    if k[0] == r and ln == "SDA" and pt.startswith("side")]
            sids = [s for s in sids if s]
            for s in sids[1:]:
                scope.union(sids[0], s)
    for s in sda_sids:
        segments[s].scope = scope.find(s)
    for dv in devices.values():
        up = [s for s in dv.sda_seg if s in segments]
        dv.scope = scope.find(up[0]) if up else ""

    # strap states + address
    for r, dv in sorted(devices.items(), key=lambda t: natkey(t[0])):
        _decode_device(d, cfg, g, lib, dv, segments)

    # buses
    buses: list[Bus] = []
    groups: dict[str, list[str]] = defaultdict(list)
    for root in comp_nets:
        groups[pair.find(root)].append(root)
    for gi, roots in sorted(groups.items(), key=lambda t: natkey(_bus_name(comp_nets, comp_line, t[1], d))):
        sda = sorted({n for rt in roots if comp_line[rt] == "SDA" for n in comp_nets[rt]}, key=natkey)
        scl = sorted({n for rt in roots if comp_line[rt] == "SCL" for n in comp_nets[rt]}, key=natkey)
        segs = [s for s in sorted(segments.values(), key=lambda s: (s.line != "SDA", natkey(s.sid)))
                if seg_of_net.get(s.nets[0]) and uf.find(s.nets[0]) in roots]
        devs = sorted({x for s in segs for x in s.devices}, key=natkey)
        conns = sorted({c for s in segs for c in s.connectors}, key=natkey)
        nets = set(sda) | set(scl)
        dl = sorted((r for r, nn in dnp_link.items() if nn[0] in nets), key=natkey)
        bid = _bus_name(comp_nets, comp_line, roots, d)
        b = Bus(bid=bid, sda_nets=sda, scl_nets=scl, segments=segs, devices=devs, connectors=conns, dnp_links=dl)
        b.conn_pins = sorted({(s.line, d.pin_net[k], f"{k[0]}.{k[1]} {d.pin_name.get(k, '')}".strip())
                              for s in segs for k in s._node.pins if _prefix(k[0]) in g.off_px},  # type: ignore[attr-defined]
                             key=lambda t: (t[0] != "SDA", natkey(t[1]), natkey(t[2])))
        b.host_pins = sorted({(s.line, d.pin_net[k], f"{k[0]}.{k[1]} {d.pin_name.get(k, '')}".strip())
                              for s in segs for k in s._node.pins  # type: ignore[attr-defined]
                              if _prefix(k[0]) in ic_px and k not in line_pins and k[0] not in devs},
                             key=lambda t: (t[0] != "SDA", natkey(t[1]), natkey(t[2])))
        b.part_values = {r: d.value(r) for r in sorted({p.split(".", 1)[0] for _, _, p in b.conn_pins + b.host_pins},
                                                        key=natkey)}
        for s in segs:
            for p in s._node.pulls:  # type: ignore[attr-defined]
                nn = g._two_nets(p.r)
                if nn:
                    b.pu_net[p.r] = nn[0] if nn[1] == p.net else nn[1]
        fm = [devices[x].fmax for x in devs if devices[x].built and devices[x].fmax]
        unknown = [x for x in devs if devices[x].built and not devices[x].fmax]
        b.speed = (f"{min(fm)} kHz" if fm else "?") + (f" (未知: {', '.join(unknown)})" if unknown and fm else "")
        for x in devs:
            devices[x].bus = bid
        # mux channel parent
        for x in devs:
            for k, (ln, pt) in line_pins.items():
                if k[0] == x and pt.startswith("ch") and d.pin_net[k] in nets and devices[x].kind == "mux":
                    b.parent = f"{x} {pt}"
        _block_topology(d, cfg, b, devs, line_pins, link_nn)   # after b.parent: a mux channel bus starts at the mux
        buses.append(b)
    return {"buses": buses, "devices": devices, "segments": segments,
            "scopes": {s: segments[s].scope for s in sda_sids}}


def _block_topology(d: Design, cfg: dict, b: Bus, devs: list[str], line_pins: dict, link_nn: dict) -> None:
    """Bus.end_chain / Bus.branches for the 陽春版 block diagram (report/i2c_block_diagram.py). Graph = bus nets joined
    by link parts (0R / R <= series_max / ties, built or DNP). Root = first upstream pin net (connector, then other IC);
    walk while the net has no device pin and exactly one unused link, but never consume a link whose far net is a
    dead-end net of ONE device (that resistor is drawn on the device's branch, as on a hand-drawn diagram). Trunk = where the
    walk stops (no upstream: the busiest segment's hub). Branch of a device = BFS path trunk -> its pin net.
    Drawing only: findings / csv / the detailed map never read these fields."""
    def txt(r: str) -> str:
        return f"{r} {d.value(r)}" + ("" if present(d, r, cfg) else " [DNP]")
    for ln in ("SDA", "SCL"):
        nets = set(b.sda_nets if ln == "SDA" else b.scl_nets)
        adj: dict[str, list[tuple[str, str]]] = defaultdict(list)
        for r in sorted(link_nn, key=natkey):
            a, c = link_nn[r]
            if a in nets and c in nets:
                adj[a].append((r, c))
                adj[c].append((r, a))
        mux, _, port = b.parent.partition(" ")
        dpin: dict[str, list[str]] = defaultdict(list)
        for k, (l2, _) in sorted(line_pins.items(), key=lambda t: (natkey(t[0][0]), natkey(t[0][1]))):
            if l2 == ln and k[0] in devs and k[0] != mux and d.pin_net[k] in nets and d.pin_net[k] not in dpin[k[0]]:
                dpin[k[0]].append(d.pin_net[k])
        dev_nets = {n for v in dpin.values() for n in v}
        if mux:   # mux channel bus: the upstream end is the mux's own channel pin
            ups = [d.pin_net[k] for k, (l2, pt) in sorted(line_pins.items(), key=lambda t: natkey(t[0][1]))
                   if k[0] == mux and pt == port and l2 == ln and d.pin_net[k] in nets]
        else:
            ups = [net for l2, net, _ in b.conn_pins + b.host_pins if l2 == ln]
        used: set[str] = set()
        if ups:
            root = ups[0]
            chain, cur = [root], root
            while cur not in dev_nets and len(used) < 20:
                nxt = [(r, o) for r, o in adj[cur] if r not in used]
                if len(nxt) != 1:
                    break
                r, o = nxt[0]
                if o in dev_nets and not [q for q, _ in adj[o] if q != r] \
                        and sum(o in v for v in dpin.values()) == 1:
                    break       # dead end with ONE device: keep that resistor on the device's branch
                used.add(r)
                chain += [txt(r), o]
                cur = o
            b.end_chain[ln] = chain
        else:
            segs = sorted((sg for sg in b.segments if sg.line == ln), key=lambda sg: (-len(sg.devices), natkey(sg.sid)))
            if not segs:
                continue
            cur = segs[0].sid.split(":", 1)[1]
        parent: dict[str, tuple[str, str] | None] = {cur: None}
        queue = [cur]
        while queue:
            n = queue.pop(0)
            for r, o in adj[n]:
                if r in used or o in parent:
                    continue
                parent[o] = (r, n)
                queue.append(o)
        for x in devs:
            reach = [n for n in dpin.get(x, []) if n in parent]
            if not reach:
                continue    # not reachable from the trunk (split line): the drawing falls back to Device.series
            path: list[str] = []
            n = reach[0] if reach else None
            while n is not None and parent[n] is not None:
                r, n = parent[n]
                path.append(txt(r))
            b.branches[(x, ln)] = path[::-1]


def _hub(d: Design, nd) -> str:
    named = [n for n in nd.nets if not re.match(r"^N\d+$", n)]
    if not named:
        return sorted(nd.nets, key=natkey)[0]
    return sorted(named, key=lambda n: (-len(d.nets.get(n, [])), natkey(n)))[0]


def _bus_name(comp_nets, comp_line, roots, d: Design) -> str:
    """Bus id = the busiest named SDA net (most pins), e.g. I2C_SDA_SLAVE."""
    nets = [n for rt in roots if comp_line[rt] == "SDA" for n in comp_nets[rt]] or \
           [n for rt in roots for n in comp_nets[rt]]
    named = [n for n in nets if not re.match(r"^N\d+$", n)] or nets
    return sorted(named, key=lambda n: (-len(d.nets.get(n, [])), natkey(n)))[0]


def _strap_state(d: Design, g: NetGraph, k, own_sda: set[str], own_scl: set[str]) -> str:
    n = d.pin_net[k]
    if n in own_sda:
        return "SDA"
    if n in own_scl:
        return "SCL"
    if g.is_rail(n):
        v = g.voltage(n)
        return "0" if v == 0 else ("1" if v is not None else "?")
    nd = g.node_of.get(n)
    if nd is None:
        return "Z"
    if any(n2 in own_sda for n2 in nd.nets):
        return "SDA"
    if any(n2 in own_scl for n2 in nd.nets):
        return "SCL"
    ups = [p for p in nd.pulls if p.built and (p.v is None or p.v > 0)]
    downs = [p for p in nd.pulls if p.built and p.v == 0]
    if ups and downs:
        return "X"
    if ups:
        return "1" if all(p.v is not None for p in ups) else "?"
    if downs:
        return "0"
    # no pull: tied to its own SDA / SCL through a bigger R, or driven by another part (CPLD GPIO) = not a float
    hops = g.hop_nets(nd)
    if any(h in own_sda for h in hops):
        return "SDA"
    if any(h in own_scl for h in hops):
        return "SCL"
    passive = {"C"} | set(g.cfg["parts"].get("always_built_prefixes", []))
    others = [x for x in nd.pins if x != k and x[0] != k[0] and _prefix(x[0]) not in passive
              and present(d, x[0], g.cfg)]
    if hops or others:
        return "?"
    return "Z"


def _strap_parts(d: Design, g: NetGraph, k, own_sda: set[str], own_scl: set[str]) -> tuple[list[str], list[str]]:
    """Resistors that set one address pin: pulls to a rail / GND on the pin's node and built R to its own SDA / SCL.
    (built, dnp) texts "R12 10Kohm -> GND"; a pin tied straight to a rail = "直連 <rail>"."""
    n = d.pin_net[k]
    if g.is_rail(n):
        return [f"直連 {n}"], []
    if n in own_sda or n in own_scl:
        return [f"直連 {n}"], []
    nd = g.node_of.get(n)
    if nd is None:
        return [], []
    built = [p.text(d) for p in nd.pulls if p.built]
    dnp = [p.text(d) for p in nd.pulls if not p.built]
    for r in sorted(d.parts, key=natkey):                 # R to its own SDA / SCL, built or DNP
        nn = g._two_nets(r)
        if not nn or _prefix(r) not in g.res_px:
            continue
        for x, y in (nn, nn[::-1]):
            if x in nd.nets and y not in nd.nets and (y in own_sda or y in own_scl):
                on = present(d, r, g.cfg)
                t = f"{r} {d.value(r)} -> {y}" + ("" if on else " [DNP]")
                if t not in built and t not in dnp:
                    (built if on else dnp).append(t)
    return built, dnp


def _decode_device(d: Design, cfg: dict, g: NetGraph, lib: list[LibEntry], dv: Device, segments) -> None:
    own_sda = {n for s in dv.sda_seg for n in segments[s].nets}
    own_scl = {n for s in dv.scl_seg for n in segments[s].nets}
    pins = {d.pin_name.get(k, "").upper(): k for k in d.pins_of(dv.refdes)}
    seen = set()
    for src, text in _candidates(d, dv.refdes):
        ent = _match(lib, text)
        if ent is None:
            if (src, text) not in dv.unmatched and text not in {t for _, t in dv.unmatched}:
                dv.unmatched.append((src, text))
            continue
        if ent.name in seen:
            continue
        seen.add(ent.name)
        states, pstates = [], []
        for alts in ent.addr_pins:
            k = next((pins[a.upper()] for a in alts if a.upper() in pins), None)
            s = _strap_state(d, g, k, own_sda, own_scl) if k else "?"
            states.append(s)
            pname = d.pin_name.get(k, alts[0]) if k else alts[0]
            pstates.append(f"{pname}={s}")
            if k and not dv.decodes:
                sb, sd = _strap_parts(d, g, k, own_sda, own_scl)
                dv.strap += [f"{pname}: {t}" for t in sb]
                dv.strap_dnp += [f"{pname}: {t}" for t in sd]
        addr, prob = ent.decode(states) if (ent.addr_pins or ent.fixed is not None) else (None, "no_addr")
        dv.decodes.append(Decode(src, text, ent.name, addr, prob, ent.verified))
        if len(dv.decodes) == 1:
            dv.states, dv.pin_states = " ".join(states), pstates
            dv.addr, dv.verified = addr, ent.verified
            dv.addr_note = {"": "" if ent.verified else "位址表未驗證", "float": "位址腳浮接",
                            "unresolved": "strap 狀態不在位址表", "no_table": "庫裡還沒有位址表",
                            "no_addr": "無位址 (repeater)"}[prob]
    if not dv.decodes:
        dv.addr_note = "料號不在 I2C 庫"
        # still show the strap states of pins that look like address pins (config pin_roles.strap)
        rx = g.roles.rx.get("strap")
        ps = []
        for k in d.pins_of(dv.refdes):
            nm = d.pin_name.get(k, "")
            if rx is not None and rx.fullmatch(nm):
                ps.append(f"{nm}={_strap_state(d, g, k, own_sda, own_scl)}")
                sb, sd = _strap_parts(d, g, k, own_sda, own_scl)
                dv.strap += [f"{nm}: {t}" for t in sb]
                dv.strap_dnp += [f"{nm}: {t}" for t in sd]
        dv.pin_states = ps
        dv.states = " ".join(p.split("=", 1)[1] for p in ps)


# ------------------------------------------------------------------ rules
def i2c_rules(d: Design, cfg: dict, m: dict) -> list[Finding]:
    out: list[Finding] = []
    devs: dict[str, Device] = m["devices"]
    built = {r: x for r, x in devs.items() if x.built}

    # address conflict per scope
    by_scope: dict[tuple[str, int], list[str]] = defaultdict(list)
    for r, dv in sorted(built.items(), key=lambda t: natkey(t[0])):
        if dv.addr is not None and dv.scope:
            by_scope[(dv.scope, dv.addr)].append(r)
    for (sc, a), rs in sorted(by_scope.items(), key=lambda t: (natkey(t[0][0]), t[0][1])):
        if len(rs) > 1:
            out.append(_f(d, cfg, "I2C_ADDR_CONFLICT", title=f"0x{a:02X}: {', '.join(rs)} 同一個位址空間",
                          detail="\n".join(f"{r}: {devs[r].symbol} | {' '.join(devs[r].pin_states)}" for r in rs)
                          + f"\n位址空間 (SDA segment): {sc.split(':', 1)[1]}",
                          refdes=rs, nets=[sc.split(":", 1)[1]]))

    # reserved addresses (checklist #74): ranges from config i2c.reserved_addr7, spec UM10204 table 4
    rsv = [(int(a), int(b)) for a, b in ((cfg.get("i2c", {}) or {}).get("reserved_addr7") or [])]
    for r, dv in sorted(built.items(), key=lambda t: natkey(t[0])):
        if dv.addr is not None and any(a <= dv.addr <= b for a, b in rsv):
            out.append(_f(d, cfg, "I2C_ADDR_RESERVED", title=f"{r}: 0x{dv.addr:02X} 是 I2C 保留位址",
                          detail=f"{dv.symbol} | {' '.join(dv.pin_states) or '-'}\n保留區間 (7-bit): "
                                 + ", ".join(f"0x{a:02X}..0x{b:02X}" for a, b in rsv)
                                 + "\nUM10204 table 4：general call / START byte / CBUS / Hs-mode / device ID / 10-bit。改 strap 避開。",
                          refdes=[r], nets=[dv.scope.split(":", 1)[1]] if dv.scope else []))

    for sid, seg in sorted(m["segments"].items(), key=lambda t: natkey(t[0])):
        net = sid.split(":", 1)[1]
        if len(seg.built_pullups) > 1:
            refs = [p.split(" ", 1)[0] for p in seg.built_pullups]
            out.append(_f(d, cfg, "I2C_PU_DUPLICATE", title=f"{net} ({seg.line}): {len(refs)} 顆 pull-up 同時上件",
                          detail="pull-ups: " + "; ".join(seg.built_pullups) + "\nsegment nets: " + ", ".join(seg.nets),
                          refdes=refs, nets=[net] + [n for n in seg.nets if n != net]))
        has_ic = any(devs[x].built for x in seg.devices if x in devs)
        # owner scope: no pull-up AND leaves through a connector. A segment with a built IC pin is A2's job
        # (OD_NO_PULLUP / OD_PULLUP_OFFBOARD); a segment with nothing built (DNP branch) is not a bus at all.
        if not seg.built_pullups and not has_ic and seg.connectors:
            where = "經連接器出板: " + ", ".join(seg.connectors)
            out.append(_f(d, cfg, "I2C_NO_PULLUP", title=f"{net} ({seg.line}): 板上沒有上件的 pull-up",
                          detail=where + ("\nDNP pull-ups: " + "; ".join(seg.dnp_pullups) if seg.dnp_pullups else "")
                          + "\nsegment nets: " + ", ".join(seg.nets),
                          refdes=sorted({c.split(".", 1)[0] for c in seg.connectors}, key=natkey),
                          nets=[net] + [n for n in seg.nets if n != net]))

    for r, dv in sorted(built.items(), key=lambda t: natkey(t[0])):
        if len(dv.sda_seg) > 1 and dv.kind == "device":
            out.append(_f(d, cfg, "I2C_SDA_SPLIT", title=f"{r} 的 SDA 腳不在同一條 segment",
                          detail="SDA pins: " + "; ".join(dv.sda_pins) + "\nsegments: " +
                          ", ".join(s.split(":", 1)[1] for s in dv.sda_seg), refdes=[r],
                          pins=[p.split(" ", 1)[0] for p in dv.sda_pins]))
        main = dv.decodes[0] if dv.decodes else None
        if main is None:
            out.append(_f(d, cfg, "I2C_LIB_MISSING", title=f"{r} {dv.symbol}: 料號不在 I2C 庫，只列 strap 狀態",
                          detail=f"symbol {dv.symbol} | BOM {dv.bom or '-'} | " + (" ".join(dv.pin_states) or "-")
                          + "\n" + _upload_hint(cfg, [t for _, t in _candidates(d, r)]), refdes=[r]))
            continue
        if main.problem == "no_table":
            out.append(_f(d, cfg, "I2C_LIB_MISSING", title=f"{r} {main.lib}: 庫裡還沒有位址表，只列 strap 狀態",
                          detail=f"{' '.join(dv.pin_states)}\n" + _upload_hint(cfg, [t for _, t in _candidates(d, r)]),
                          refdes=[r]))
        elif main.problem == "float":
            out.append(_f(d, cfg, "I2C_ADDR_PIN_FLOAT", title=f"{r} {main.lib}: 位址腳浮接 (datasheet 不允許)",
                          detail=" ".join(dv.pin_states) + f"\n{dv.lib_src}", refdes=[r]))
        elif main.problem == "unresolved":
            out.append(_f(d, cfg, "I2C_ADDR_UNRESOLVED", title=f"{r} {main.lib}: 位址解不出來",
                          detail=" ".join(dv.pin_states) + "\nX = 上下拉同時上件，? = 電壓不明的 rail，或狀態組合不在位址表",
                          refdes=[r]))
        usable = [x for x in dv.decodes if x.verified and x.problem != "no_table" and x.problem != "no_addr"]
        outcomes = {(f"0x{x.addr:02X}" if x.addr is not None else x.problem) for x in usable}
        if len(outcomes) > 1:
            out.append(_f(d, cfg, "I2C_ADDR_PART_DIFF", title=f"{r}: 主料 / symbol / 替代料解出的位址不同",
                          detail="\n".join(f"{x.source} {x.text} -> {x.lib}: "
                                           + (f"0x{x.addr:02X}" if x.addr is not None else x.problem)
                                           for x in dv.decodes) + "\n" + " ".join(dv.pin_states),
                          refdes=[r]))
        if dv.unmatched:
            # second source: a BOM main / alternate (or the symbol) the library does not know is not checked at all.
            # Its strap legality is unknown (NCT75 has no SDA / SCL state, TMP1075 has).
            used = main
            out.append(_f(d, cfg, "I2C_SECOND_SOURCE_UNCHECKED",
                          title=f"{r}: " + "、".join(f"{s} {t.split(' ', 1)[0]}" for s, t in dv.unmatched)
                          + " 不在 I2C 庫，strap 沒對它檢查",
                          detail="\n".join(f"{s}: {t} -> 庫裡沒有這顆" for s, t in dv.unmatched)
                          + f"\n目前位址依 {used.source} {used.text} -> {used.lib}"
                          + "\n描述沒寫料號 (例：只寫 EEPROM 2Kb) 時請在 BOM 補 MPN；有料號就上傳 datasheet 補庫",
                          refdes=[r]))
    # DNP parts: an illegal open address pin is a trap for whoever stuffs the part later (U603 INA3221 A0 open)
    for r, dv in sorted(devs.items(), key=lambda t: natkey(t[0])):
        if dv.built or not dv.decodes or dv.decodes[0].problem != "float":
            continue
        out.append(_f(d, cfg, "I2C_ADDR_PIN_FLOAT", title=f"{r} {dv.decodes[0].lib} (DNP): 位址腳浮接 (datasheet 不允許)，上件前要補 strap",
                      detail=" ".join(dv.pin_states) + f"\n{dv.lib_src}", refdes=[r]))
    return out


def _upload_hint(cfg: dict, texts: list[str]) -> str:
    """Where to drop the datasheet, and whether one is already there for this part."""
    folder = datasheets_dir(cfg)
    have = matching_datasheets(folder, texts)
    if have:
        return ("datasheet 已在 " + ", ".join(p.name for p in have)
                + "：到 UI「I2C 位址庫」產生候選規則，RD 核對後簽核 (或 autocheck i2c-draft)")
    try:
        shown = str(folder.relative_to(LIB_DEFAULT.parent.parent.parent))   # "AutoCheck/datasheets", same on every PC
    except ValueError:
        shown = str(folder)
    return (f"把 datasheet PDF 放進 {shown} (檔名用料號，例 MP5926GF.pdf)，"
            "再到 UI「I2C 位址庫」產生候選規則，RD 核對後簽核")


def matching_datasheets(folder: Path, texts: list[str]) -> list[Path]:
    """PDFs in `folder` whose file stem (>= 5 chars, letters / digits only) appears in one of the part texts."""
    if not folder.is_dir():
        return []
    norm = [_norm(t) for t in texts]
    out = []
    for p in sorted(folder.glob("*.pdf")):
        st = _norm(p.stem)
        if len(st) >= 5 and any(st in t for t in norm):
            out.append(p)
    return out


# ------------------------------------------------------------------ declared (I2C block diagram, transcribed)
def load_declared(path: str | Path | None) -> list[dict]:
    if not path or not Path(path).exists():
        return []
    with open(path, newline="", encoding="utf-8-sig") as f:
        rows = []
        rd = csv.DictReader(f)
        heads = {(h or "").strip().lower(): h for h in (rd.fieldnames or [])}
        miss = [k for k in ("kind", "refdes", "net") if k not in heads]
        if miss:
            raise ValueError(f"{Path(path).name}: 缺欄位 {', '.join(miss)} (需要 {', '.join(DECLARED_FIELDS)})")
        for row in rd:
            r = {k: (row.get(heads.get(k, k)) or "").strip() for k in DECLARED_FIELDS}
            if r["kind"] and not r["kind"].startswith("#"):
                r["kind"] = r["kind"].lower()
                rows.append(r)
        return rows


def _mpn_ok(decl: str, texts: list[str]) -> bool:
    """Same base part: the declared MPN up to its last digit (LM5066IPMHX -> LM5066) must start a word of the
    symbol / BOM text and not be followed by another digit. Package / grade suffixes pass; TCA9535 vs TCA9539 and
    PCA9548 vs PCA9546 do not (QA 2026-10-12)."""
    tok = _norm(re.split(r"[-/ ]", (decl or "").strip())[0])   # ordering suffix after '-' / '/' is grade / package
    if not tok:
        return True
    m = re.match(r"^(.*\d)", tok)
    core = m.group(1) if m else tok
    for t in texts:
        for w in re.split(r"[^A-Za-z0-9]+", t.upper()):
            if w.startswith(core) and not w[len(core):len(core) + 1].isdigit():
                return True
    return False


def _yes(s: str) -> bool:
    return s.strip().upper() in ("Y", "YES", "1", "TRUE", "DNP", "X")


def compare_declared(d: Design, cfg: dict, g: NetGraph, m: dict, decl: list[dict]) -> tuple[list[dict], list[Finding]]:
    """Each declared row -> one result row (結果 OK / 不符 / 無法驗證) and, when 不符, one finding keyed on the
    actual part (the part on the declared nets, else the declared RefDes)."""
    rows, out = [], []
    devs: dict[str, Device] = m["devices"]
    net_dev: dict[str, list[str]] = defaultdict(list)
    for r, dv in devs.items():
        for p in dv.sda_pins + dv.scl_pins:
            if "[ch" in p:                 # a mux's channel pin is not "the device on that net" (QA 2026-10-12)
                continue
            rd, pin = p.split(" ", 1)[0].rsplit(".", 1)
            net_dev[d.pin_net[(rd, pin)]].append(r)
    declared_devs = set()
    for i, row in enumerate(decl, 1):
        kind = row["kind"]
        probs, unk, actual = [], [], []
        if kind == "device":
            nets = [n.strip() for n in re.split(r"[;,/ ]+", row["net"]) if n.strip()]
            for n in nets:
                if n not in d.nets:
                    probs.append(f"net {n} 不存在")
            on_nets = sorted({r for n in nets for r in net_dev.get(n, [])}, key=natkey)
            ref = row["refdes"]
            if ref:
                declared_devs.add(ref)
            else:
                probs.append("圖上沒寫 RefDes (轉錄檔這列不完整)")
            if ref and ref not in d.parts:
                probs.append(f"{ref} 不存在")
            if ref in on_nets:
                # a DNP second-source footprint on the same nets (U83 under U36) is not the declared device
                others = [r for r in on_nets if r != ref and devs[r].built]
                actual = [ref]
                if others:
                    probs.append(f"同一組 net 另有上件的 {', '.join(others)}")
            elif on_nets:
                built_on = [r for r in on_nets if devs[r].built] or on_nets
                actual = built_on
                if ref:
                    probs.append(f"圖上寫 {ref}，netlist 上 {'/'.join(nets)} 接的是 {', '.join(built_on)}")
            else:
                actual = [ref] if ref in d.parts else []
            for r in actual:
                declared_devs.add(r)
                dv = devs.get(r)
                if dv is None:
                    unk.append(f"{r} 沒有 I2C 腳")
                    continue
                texts = [t for _, t in _candidates(d, r)]
                if row["mpn"] and not _mpn_ok(row["mpn"], texts):
                    probs.append(f"料號：圖上 {row['mpn']}，實際 symbol {dv.symbol} / BOM {dv.bom or '-'}")
                if row["addr7"]:
                    try:
                        want = int(row["addr7"], 16)
                    except ValueError:
                        want = None
                        unk.append(f"addr7 '{row['addr7']}' 看不懂")
                    if want is not None:
                        if dv.addr is None:
                            unk.append(f"{r} 位址無法驗證 ({dv.addr_note or '?'}；strap {' '.join(dv.pin_states)})")
                        elif not dv.verified:
                            unk.append(f"{r} 位址 {dv.addr_txt}，位址表未驗證")
                        elif dv.addr != want:
                            probs.append(f"位址：圖上 0x{want:02X}，netlist 解出 {dv.addr_txt} ({' '.join(dv.pin_states)})")
                want_dnp = _yes(row["dnp"])
                if want_dnp != (not dv.built):
                    probs.append(f"{r} 圖上{'標 DNP' if want_dnp else '沒標 DNP'}，BOM {'有上件' if dv.built else '沒有 (DNP)'}")
        elif kind in ("series", "pullup"):
            net = row["net"]
            if net not in d.nets:
                probs.append(f"net {net} 不存在")
            else:
                want_v = parse_res_loose(row["value"]) if row["value"] else None
                want_dnp = _yes(row["dnp"])
                cands = []
                for r in sorted(d.parts, key=natkey):
                    nn = g._two_nets(r)
                    if not nn or net not in nn or _prefix(r) not in g.res_px | set(cfg["ground"].get("tie_prefixes", [])):
                        continue
                    other = nn[1] if nn[0] == net else nn[0]
                    is_pu = g.is_rail(other) and g.voltage(other) != 0
                    if kind == "pullup" and not is_pu:
                        continue
                    if kind == "pullup" and row["rail"] and other != row["rail"]:
                        continue
                    if kind == "series" and g.is_rail(other):
                        continue
                    cands.append((r, other))
                actual = [r for r, _ in cands]
                if not cands:
                    probs.append(f"{net} 上找不到{'pull-up' if kind == 'pullup' else '串接件'}")
                else:
                    def okv(r):
                        v = g.res_ohm(r)
                        if want_v is None:
                            return True
                        if v is None:
                            return want_v == 0 and is_nettie(d, r, cfg)
                        return abs(v - want_v) <= max(0.5, 0.011 * want_v)
                    match = [r for r, _ in cands if okv(r) and (present(d, r, cfg) != want_dnp)]
                    if not match:
                        why = []
                        for r, o in cands:
                            bits = []
                            if not okv(r):
                                bits.append(f"值：圖上 {row['value'] or '?'}，netlist {d.value(r)}")
                            if present(d, r, cfg) == want_dnp:
                                bits.append("圖上標 DNP，BOM 有上件" if want_dnp else "圖上沒標 DNP，BOM 沒有 (DNP)")
                            why.append(f"{r} (-> {o}) " + "，".join(bits))
                        probs.append("; ".join(why))
                    else:
                        actual = match
        elif kind == "connector":
            for n in [n.strip() for n in re.split(r"[;,/ ]+", row["net"]) if n.strip()]:
                if n not in d.nets:
                    probs.append(f"net {n} 不存在")
        else:
            unk.append(f"kind '{kind}' 看不懂 (device / series / pullup / connector)")
        verdict = "不符" if probs else ("無法驗證" if unk else "OK")
        rows.append({"no": i, **row, "actual": ", ".join(actual), "verdict": verdict,
                     "why": "；".join(probs + unk)})
        if probs:
            refs = actual or ([row["refdes"]] if row["refdes"] else [])
            label = row["label"] or row["refdes"] or row["net"]
            out.append(_f(d, cfg, "I2C_DECLARED_MISMATCH", title=f"I2C 圖 #{i} {label}: " + probs[0],
                          detail="\n".join(probs) + f"\n圖上: {kind} {row['refdes']} {row['mpn']} {row['addr7']} "
                                 f"{row['net']} {row['value']}{' DNP' if _yes(row['dnp']) else ''}",
                          refdes=refs or [f"I2C_ROW{i}"], nets=[n for n in re.split(r"[;,/ ]+", row["net"]) if n]))
    for r, dv in sorted(devs.items(), key=lambda t: natkey(t[0])):
        if dv.built and r not in declared_devs:
            out.append(_f(d, cfg, "I2C_UNDECLARED_DEVICE", title=f"{r} {dv.symbol} 有上件，I2C 圖上沒有",
                          detail=f"bus {dv.bus} | {dv.addr_txt or dv.addr_note} | {' '.join(dv.pin_states)}",
                          refdes=[r]))
    return rows, out


# ------------------------------------------------------------------ entry points
def i2c_map(d: Design, cfg: dict, g: NetGraph, declared: list[dict] | None = None,
            lib: list[LibEntry] | None = None) -> tuple[dict, list[Finding]]:
    """(map, findings). map adds "declared" (comparison rows) when a declared table is given."""
    m = build_map(d, cfg, g, lib)
    fs = i2c_rules(d, cfg, m) if m["devices"] else []
    m["declared"] = []
    if declared:
        rows, extra = compare_declared(d, cfg, g, m, declared)
        m["declared"] = rows
        fs += extra
    return m, fs


def mark_changes(mb: dict, ma: dict | None) -> None:
    """Device change status A -> B (keyed on RefDes): new / changed (part, address, stuffing) / same."""
    if not ma:
        return
    da: dict[str, Device] = ma.get("devices", {})
    for r, dv in mb.get("devices", {}).items():
        a = da.get(r)
        if a is None:
            dv.change = "new"
        elif (a.symbol, a.bom, a.addr, a.built) != (dv.symbol, dv.bom, dv.addr, dv.built):
            dv.change = "changed"
            what = []
            if a.symbol != dv.symbol:
                what.append(f"symbol {a.symbol} -> {dv.symbol}")
            if a.bom != dv.bom:
                what.append(f"BOM {a.bom or '-'} -> {dv.bom or '-'}")
            if a.addr != dv.addr:
                what.append(f"位址 {a.addr_txt or '?'} -> {dv.addr_txt or '?'}")
            if a.built != dv.built:
                what.append("上件 -> DNP" if a.built else "DNP -> 上件")
            dv.change_note = "; ".join(what)
        else:
            dv.change = "same"
    mb["removed"] = sorted((r for r in da if r not in mb.get("devices", {})), key=natkey)


def table_rows(m: dict, a_label: str = "A") -> list[dict]:
    """One row per (bus, device) for the Excel sheet / CSV."""
    rows = []
    devs: dict[str, Device] = m.get("devices", {})
    chg = {"new": f"新增 (vs {a_label})", "changed": f"變更 (vs {a_label})", "same": "", "": ""}
    for b in m.get("buses", []):
        for r in b.devices:
            dv = devs[r]
            rows.append({
                "bus": b.bid, "speed": b.speed, "refdes": r, "symbol": dv.symbol, "bom": dv.bom,
                "built": "Y" if dv.built else "DNP", "kind": dv.kind, "addr7": dv.addr_txt,
                "addr8": (f"0x{dv.addr * 2:02X} / 0x{dv.addr * 2 + 1:02X}" if dv.addr is not None else ""),
                "states": " ".join(dv.pin_states), "note": dv.addr_note, "lib": dv.lib,
                "addr_line": (" ".join(dv.pin_states) or "-") + " → " + (dv.addr_txt or "?"),
                "strap": "; ".join(dv.strap), "strap_dnp": "; ".join(dv.strap_dnp),
                "sda": "; ".join(dv.sda_pins), "scl": "; ".join(dv.scl_pins),
                "sda_seg": ", ".join(s.split(":", 1)[1] for s in dv.sda_seg),
                "scope": dv.scope.split(":", 1)[1] if dv.scope else "", "series": "; ".join(dv.series),
                "page": dv.page,
                "change": chg.get(dv.change, dv.change) + (f": {dv.change_note}" if dv.change_note else ""),
            })
    return rows
