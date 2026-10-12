from __future__ import annotations

import hashlib
from dataclasses import asdict, dataclass, field

SEVERITIES = ("ERROR", "WARN", "INFO")

CATEGORIES = {
    "DRC": "Basic DRC (on new revision)",
    "CAPV": "Capacitor voltage derating",
    "CONN": "Connectivity changes (A -> B)",
    "PART": "Part / value / stuffing changes (A -> B)",
    "BOM": "BOM changes (A -> B)",
    "BOMCHK": "BOM vs netlist consistency",
    "NAMING": "Naming rule",
    "NETRULE": "Netlist rules from pin names (on new revision)",
    "I2C": "I2C map (on new revision; test state, all INFO)",
}


# one line per rule: why it matters / how to check (printed in the report)
RULE_HELP = {
    "GROUND_ISLAND": "Floating ground = undefined reference. Check the IC datasheet for an internal AGND/GND tie; "
                     "otherwise add a 0R / net-tie at the IC ground pad.",
    "SINGLE_PIN_NET": "Usually a wire missing its net label or an off-page connector typo. If intentional, "
                      "name it SNN_* / NC_* so it is reported as INFO.",
    "AUTO_NET_NAME": "Tool-generated name means an unlabeled wire; the net often got split from its intended "
                     "partner. Compare with the old revision's net of the same pins.",
    "FLOATING_AFTER_DNP": "In this build every other part on the net is DNP, so the pin floats. Confirm the "
                          "datasheet allows open (internal pull / NC) or stuff a pull resistor.",
    "TWO_PIN_SHORTED": "Both pins on one net: the part does nothing. Usually a wrong net label on one side.",
    "SIMILAR_NET_NAMES": "Names that differ only by case or separator are separate nets to the netlister.",
    "TIE_BETWEEN_RAILS": "A stuffed 0R / bead / fuse shorts two different voltages.",
    "MLCC_DERATING": "Owner rule A: MLCC rating ~2 x working voltage, rounded to a common rating "
                     "(3.3V->6.3V, 5V->10V, 12V->25V, 48V->100V). Working voltage = |V(net1)-V(net2)|.",
    "NON_MLCC_RATIO": "No derating rule defined for polymer / electrolytic / tantalum yet: ratio for review.",
    "CAP_UNRESOLVED": "Net voltage could not be derived from the name. Fill rail_map_todo.csv and re-run.",
    "NET_RENAMED": "Pure rename is harmless unless the new name is tool-generated or breaks a naming rule.",
    "NET_SPLIT": "Pins left the net they shared in the old revision. Typical cause: deleted wire / lost label.",
    "NET_MERGED": "Two nets became one. Check for an accidental short via label or wire.",
    "PIN_MOVED": "Pin connected to a different net than in the old revision. Confirm against the change list.",
    "PINS_SWAPPED": "Two pins of one part exchanged nets: classic symbol/pinout error unless intended.",
    "PIN_SWAP_EQUIV": "2-pin non-polarized part flipped: electrically identical, listed for completeness.",
    "PIN_DISCONNECTED": "Pin lost its connection between revisions.",
    "PIN_CONNECTED": "Pin newly connected between revisions.",
    "PART_ADDED": "New part: confirm it is in the declared change list.",
    "PART_REMOVED": "Removed part: check what its nets depend on now (e.g. a removed net-tie).",
    "PART_SYMBOL_CHANGED": "Value / footprint change: confirm against the change list and BOM.",
    "STUFF_CHANGED": "Build option changed. A block of changes on one page usually means a circuit swap.",
    "BOM_PN_CHANGED": "Main PN changed. Same description = second-source swap; otherwise review the spec.",
    "BOM_ALT_CHANGED": "Approved alternates changed.",
    "BOM_REF_NOT_IN_NETLIST": "BOM places a part the schematic does not have.",
    "BOM_VALUE_MISMATCH": "Schematic value and BOM part disagree: one of them is wrong.",
    "BOM_MPN_NOT_FOUND": "Symbol MPN not among BOM main/alternates. Often a generic symbol; confirm pin-compatibility.",
    "BOM_QTY_MISMATCH": "BOM quantity does not match the RefDes count on the line.",
    "BOM_DUP_REFDES": "Same RefDes on two BOM lines.",
    "STRAP_PU_PD_BOTH": "Strap / address pin with both pull-up and pull-down stuffed: undefined level or a rail "
                        "short (0R both sides). Keep one side DNP.",
    "OD_NO_PULLUP": "Open-drain node with no stuffed pull-up: it can only go low. Stuff the pull-up.",
    "OD_PULLUP_OFFBOARD": "Open-drain node without an on-board pull-up that leaves through a connector: confirm the "
                          "pull-up on the other board.",
    "OD_PULLUP_UNKNOWN": "Open-drain node pulled toward a rail / net of unknown voltage: add it to rail_map.csv "
                         "or confirm the source on the other board.",
    "OD_PULLUP_STRONG": "Parallel pull-up below Rp(min) = (V - VOL) / IOL: the driver cannot reach VOL.",
    "PULLUP_OVERVOLT": "Node pulled above the receiver's own supply: check the pin's abs max / tolerance.",
    "I2C_ADDR_CONFLICT": "Two built devices decode to the same 7-bit address in one address space (mux channels "
                         "are separate spaces, buffer sides are one).",
    "I2C_PU_DUPLICATE": "More than one built pull-up on one line of one segment: keep one, DNP the other.",
    "I2C_NO_PULLUP": "Segment without a built pull-up that leaves through a connector: confirm the pull-up on the "
                     "other board.",
    "I2C_SDA_SPLIT": "Device with split SDA pins (LM5066 SDAI / SDAO) not tied together: it can write but not read "
                     "(or the reverse).",
    "I2C_ADDR_PIN_FLOAT": "Address pin left open on a part whose datasheet defines only tied states.",
    "I2C_ADDR_UNRESOLVED": "Strap state unknown or conflicting, or the state combination is not in the address table.",
    "I2C_ADDR_PART_DIFF": "Symbol, BOM main and alternates decode to different addresses with the same straps.",
    "I2C_LIB_MISSING": "Part not in config/i2c_devices.yaml (or no address table yet): strap states listed only.",
    "I2C_DECLARED_MISMATCH": "I2C block diagram (transcribed csv) disagrees with the netlist: RefDes, part, address, "
                             "series / pull-up value or DNP.",
    "I2C_UNDECLARED_DEVICE": "Built I2C device that the I2C block diagram does not show.",
    "PULLUP_BACKPOWER": "Pull-up rail stays on longer than the receiver's supply: back-power through the input ESD "
                        "diode when that rail is off.",
}


@dataclass
class Finding:
    category: str
    rule: str
    severity: str
    title: str
    detail: str = ""
    refdes: list[str] = field(default_factory=list)
    nets: list[str] = field(default_factory=list)
    pins: list[str] = field(default_factory=list)       # "R12.1"
    page: int | None = None
    page_title: str = ""
    evidence: dict = field(default_factory=dict)        # {"A": ..., "B": ...}
    status: str = ""                                    # NEW / EXISTING for DRC-type checks
    key: str = ""                                       # stable identity used for NEW/EXISTING + waivers
    id: str = ""
    related: list[str] = field(default_factory=list)    # ids of findings sharing a RefDes

    def finalize(self) -> "Finding":
        if not self.key:
            self.key = "|".join([self.rule, ",".join(sorted(self.refdes)), ",".join(sorted(self.nets)),
                                 ",".join(sorted(self.pins))])
        self.id = f"{self.category}-{hashlib.sha1(self.key.encode()).hexdigest()[:6].upper()}"
        return self

    def to_dict(self) -> dict:
        return asdict(self)


def sort_findings(fs: list[Finding]) -> list[Finding]:
    cat_order = list(CATEGORIES)
    return sorted(fs, key=lambda f: (cat_order.index(f.category) if f.category in cat_order else 99,
                                     SEVERITIES.index(f.severity), 0 if f.status == "NEW" else 1,
                                     f.page or 999, f.title))
