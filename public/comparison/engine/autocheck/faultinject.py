"""Fault injection: copy a revision folder, plant N known faults in the netlist/BOM text files,
and write an answer key. Comparing original -> mutated must report every planted fault
(recall) and nothing else (no unexplained findings). This measures the checker, not the board.

Fault types
  MOVE_PIN        one node moved to another net                expect CONN finding with that pin
  DISCONNECT_PIN  one node deleted                             expect PIN_DISCONNECTED
  SWAP_IC_PINS    two IC pins exchange nets                    expect CONN findings with both pins
  RENAME_NET      net renamed                                  expect NET_RENAMED
  CHANGE_VALUE    part re-pointed to another primitive         expect PART_SYMBOL_CHANGED
  REMOVE_PART     part deleted from pstxprt + its nodes        expect PART_REMOVED
  DNP_PART        RefDes removed from its BOM line             expect STUFF_CHANGED
"""
from __future__ import annotations

import json
import random
import re
import shutil
from pathlib import Path

from .loader import classify, files_in

_NODE = re.compile(r"NODE_NAME[ \t]+(\S+)[ \t]+(\S+)[ \t]*\n[^\n]*\n[^\n]*:;\n?")


class NetText:
    """Round-trippable view of pstxnet.dat."""

    def __init__(self, text: str):
        self.nl = "\r\n" if "\r\n" in text else "\n"
        t = text.replace("\r\n", "\n")
        parts = re.split(r"(?m)^(?=NET_NAME\s*$)", t)
        self.head = parts[0]
        self.blocks = []  # [name, header, [node_text...], trailer]
        for p in parts[1:]:
            name = re.match(r"NET_NAME\s*\n'((?:[^']|'')*)'", p).group(1)
            first = _NODE.search(p)
            header = p[:first.start()] if first else p
            nodes = [m.group(0) for m in _NODE.finditer(p)]
            last = list(_NODE.finditer(p))
            trailer = p[last[-1].end():] if last else ""
            self.blocks.append([name, header, nodes, trailer])

    def text(self) -> str:
        s = self.head + "".join(h + "".join(n if n.endswith("\n") else n + "\n" for n in ns) + tr
                                for _, h, ns, tr in self.blocks)
        return s.replace("\n", self.nl) if self.nl != "\n" else s

    def find(self, refdes: str, pin: str):
        for bi, (_, _, ns, _) in enumerate(self.blocks):
            for ni, n in enumerate(ns):
                m = _NODE.match(n)
                if m and m.group(1) == refdes and m.group(2) == pin:
                    return bi, ni
        return None


def _nodes(nt: NetText):
    out = []
    for bi, (name, _, ns, _) in enumerate(nt.blocks):
        for n in ns:
            m = _NODE.match(n)
            out.append((m.group(1), m.group(2), name, bi))
    return out


def inject(src: str | Path, dst: str | Path, n: int = 30, seed: int = 1) -> list[dict]:
    src, dst = Path(src), Path(dst)
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst)
    f = classify(files_in(dst))
    rnd = random.Random(seed)

    net_raw = f["pstxnet"].read_bytes().decode("latin-1")
    prt_raw = f["pstxprt"].read_bytes().decode("latin-1")
    nt = NetText(net_raw)
    bom_raw = f["bom"].read_bytes() if "bom" in f else None
    bom_txt = bom_raw.decode("cp950") if bom_raw else None

    prims = re.findall(r"(?m)^PART_NAME\s*\n\s*(\S+)\s+'([^']*)'", prt_raw.replace("\r\n", "\n"))
    prim_of = dict(prims)
    big = {name for name, _, ns, _ in nt.blocks if len(ns) > 12}
    used: set[str] = set()
    key: list[dict] = []
    kinds = ["MOVE_PIN", "DISCONNECT_PIN", "SWAP_IC_PINS", "RENAME_NET", "CHANGE_VALUE", "REMOVE_PART",
             "DNP_PART"]

    def pick_node(pred=lambda r, p, net: True):
        cands = [x for x in _nodes(nt) if x[0] not in used and x[2] not in big and pred(*x[:3])
                 and len(nt.blocks[x[3]][2]) >= 3]
        return rnd.choice(cands) if cands else None

    attempts = 0
    while len(key) < n and attempts < n * 20:
        attempts += 1
        kind = kinds[len(key) % len(kinds)]
        if kind == "MOVE_PIN":
            x = pick_node()
            if not x:
                continue
            r, p, net, bi = x
            targets = [i for i, b in enumerate(nt.blocks) if b[0] != net and b[0] not in big and len(b[2]) >= 2]
            ti = rnd.choice(targets)
            bi_, ni = nt.find(r, p)
            node = nt.blocks[bi_][2].pop(ni)
            nt.blocks[ti][2].append(node)
            key.append({"kind": kind, "refdes": [r], "pins": [f"{r}.{p}"], "nets": [net, nt.blocks[ti][0]]})
        elif kind == "DISCONNECT_PIN":
            x = pick_node()
            if not x:
                continue
            r, p, net, _ = x
            bi_, ni = nt.find(r, p)
            nt.blocks[bi_][2].pop(ni)
            key.append({"kind": kind, "refdes": [r], "pins": [f"{r}.{p}"], "nets": [net]})
        elif kind == "SWAP_IC_PINS":
            ics = sorted({x[0] for x in _nodes(nt) if x[0].startswith("U") and x[0] not in used})
            rnd.shuffle(ics)
            done = False
            for u in ics:
                pins = [x for x in _nodes(nt) if x[0] == u and x[2] not in big]
                pairs = [(a, b) for a in pins for b in pins if a[1] < b[1] and a[2] != b[2]]
                if not pairs:
                    continue
                a, b = rnd.choice(pairs)
                ia, ib = nt.find(u, a[1]), nt.find(u, b[1])
                na, nb = nt.blocks[ia[0]][2][ia[1]], nt.blocks[ib[0]][2][ib[1]]
                nt.blocks[ia[0]][2][ia[1]], nt.blocks[ib[0]][2][ib[1]] = nb, na
                key.append({"kind": kind, "refdes": [u], "pins": [f"{u}.{a[1]}", f"{u}.{b[1]}"],
                            "nets": [a[2], b[2]]})
                used.add(u)
                done = True
                break
            if not done:
                continue
            continue
        elif kind == "RENAME_NET":
            cands = [b for b in nt.blocks if b[0] not in big and len(b[2]) >= 2
                     and not ({_NODE.match(n).group(1) for n in b[2]} & used)]
            if not cands:
                continue
            b = rnd.choice(cands)
            old, new = b[0], f"{b[0]}_INJ{len(key)}"
            b[1] = b[1].replace(f"'{old}'", f"'{new}'", 1)
            b[0] = new
            key.append({"kind": kind, "refdes": [], "pins": [], "nets": [old, new]})
            used |= {_NODE.match(n).group(1) for n in b[2]}
            continue
        elif kind == "CHANGE_VALUE":
            pre = rnd.choice(["C", "R"])
            cands = [r for r, pr in prims if r.startswith(pre) and r[1:2].isdigit() and r not in used]
            if not cands:
                continue
            r = rnd.choice(cands)
            alt = sorted({pr for rr, pr in prims if rr.startswith(pre) and rr[1:2].isdigit()} - {prim_of[r]})
            newp = rnd.choice(alt)
            prt_raw = re.sub(rf"(?m)^(PART_NAME\s*\r?\n\s*{re.escape(r)}\s+')[^']*'",
                             lambda m: m.group(1) + newp + "'", prt_raw, count=1)
            key.append({"kind": kind, "refdes": [r], "pins": [], "nets": []})
            used.add(r)
            continue
        elif kind == "REMOVE_PART":
            cands = [r for r, _ in prims if r not in used and r[:1] in "CRD" and r[1:2].isdigit()]
            r = rnd.choice(cands)
            prt_raw = re.sub(rf"(?ms)^PART_NAME\s*\r?\n\s*{re.escape(r)}\s+'.*?(?=^PART_NAME|\Z)", "", prt_raw, count=1)
            for blk in nt.blocks:
                blk[2] = [x for x in blk[2] if _NODE.match(x).group(1) != r]
            key.append({"kind": kind, "refdes": [r], "pins": [], "nets": []})
        elif kind == "DNP_PART":
            if bom_txt is None:
                continue
            refs = re.findall(r">\s*([A-Z]+\d+(?:,[A-Z]+\d+)*)\s*<", bom_txt)
            singles = [s for s in refs if "," in s]
            if not singles:
                continue
            cell = rnd.choice(singles)
            lst = cell.split(",")
            r = rnd.choice([x for x in lst if x not in used] or lst)
            if r in used:
                continue
            newcell = ",".join(x for x in lst if x != r)
            bom_txt = bom_txt.replace(f">{cell}<", f">{newcell}<", 1)
            key.append({"kind": kind, "refdes": [r], "pins": [], "nets": [],
                        "side_effect": "BOM_QTY_MISMATCH"})
        used.update(key[-1]["refdes"])

    f["pstxnet"].write_bytes(nt.text().encode("latin-1"))
    f["pstxprt"].write_bytes(prt_raw.encode("latin-1"))
    if bom_txt is not None:
        f["bom"].write_bytes(bom_txt.encode("cp950"))
    (dst / "fault_key.json").write_text(json.dumps(key, indent=1), encoding="utf-8")
    return key


EXPECT = {
    "MOVE_PIN": ("CONN", None), "DISCONNECT_PIN": ("CONN", "PIN_DISCONNECTED"), "SWAP_IC_PINS": ("CONN", None),
    "RENAME_NET": ("CONN", "NET_RENAMED"), "CHANGE_VALUE": ("PART", "PART_SYMBOL_CHANGED"),
    "REMOVE_PART": ("PART", "PART_REMOVED"), "DNP_PART": ("PART", "STUFF_CHANGED"),
}


def score(key: list[dict], findings) -> dict:
    """Recall over planted faults + list of change findings not explained by any fault."""
    change = [f for f in findings if f.category in ("CONN", "PART", "BOM")]
    hit, missed, explained = 0, [], set()
    for k in key:
        cat, rule = EXPECT[k["kind"]]
        ok = False
        for f in change:
            if f.category != cat or (rule and f.rule != rule):
                continue
            if k["pins"] and set(k["pins"]) <= set(f.pins) | _pins_in(f):
                ok = True
            elif not k["pins"] and k["refdes"] and set(k["refdes"]) & set(f.refdes):
                ok = True
            elif k["kind"] == "RENAME_NET" and k["nets"][0] in f.nets:
                ok = True
            if ok:
                explained.add(f.id)
                break
        if ok:
            hit += 1
        else:
            missed.append(k)
    # findings on any faulted refdes / net count as explained (secondary effects of the same fault)
    touched_r = {r for k in key for r in k["refdes"]}
    touched_n = {n for k in key for n in k["nets"]}
    # PIN_ISOLATED (2026-10-22): a pin left alone because its old companion was removed / moved is the same fault
    unexplained = [f for f in change if f.id not in explained
                   and not (set(f.refdes) & touched_r) and not (set(f.nets) & touched_n)
                   and not (set((f.evidence or {}).get("A_parts", [])) & touched_r)]
    return {"planted": len(key), "detected": hit, "recall": hit / len(key) if key else 1.0,
            "missed": missed, "unexplained": [f"{f.rule}: {f.title}" for f in unexplained]}


def _pins_in(f) -> set[str]:
    return set(re.findall(r"\b[A-Z]+\d+\.[A-Za-z0-9]+\b", f.title + " " + f.detail))
