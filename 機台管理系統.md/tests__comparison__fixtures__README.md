> 集中副本；原始路徑：`tests/comparison/fixtures/README.md`；程式參考基準：`0b0dee080f02ceb8d58b38744fabe3b5d5f4bcfd`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# Synthetic browser QA inputs

Select the `A` folder and `B` folder in the comparison workspace, use labels `A` / `B`, and run with the default rules. Each revision contains `pstxnet.dat`, `pstxprt.dat`, `pstchip.dat` and `bom.csv`; B also contains `schematic.pdf`. This is invented test circuitry, with no company data. The PDF was generated with the original `autocheck.fakeschem.make_fake_schematic` and seed 1.

Four parts: C1 is a 1uF / 6.3V MLCC, U1 is a TMP451 on a 3.3V I²C bus, and R1/R2 are 2.2K pullups. B moves C1.1 from P3V3 to P12V. Original stable tracker rows are:

| Key | Severity | Status |
| --- | --- | --- |
| `MLCC_DERATING\|C1` | ERROR | NEW |
| `SINGLE_PIN_NET\|P12V` | WARN | NEW |
| `NET_SPLIT\|C1.1` | WARN | CHANGE |

Both revisions intentionally omit a DSN, so page-title warnings are expected. The B PDF has extractable part labels and supports actual annotation/sidecar output. Use a tracker reply for `MLCC_DERATING|C1` to validate export and reopen persistence.
