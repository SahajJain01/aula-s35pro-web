# AULA S350 PRO configuration protocol

Recovered from the vendor driver `狼蛛AULA-S350PRO.exe` (PDB name *YXT Mouse Demo*, SHA-256
`71e51971…63ec`) with REA/Ghidra, then confirmed against a live S350 PRO (2.4 GHz receiver,
mouse firmware 2.3.0007, receiver 2.3.0004, sensor PAW3311).

Addresses below are functions in that executable.

## Transport

| | |
|---|---|
| Vendor ID | `0xB6A4` |
| Product IDs | `0x4000/0x4090/0x40A0/0x40B0` wired, `0x4001/0x4091/0x40A1/0x40B1` 2.4 GHz receiver |
| Config collection | usage page `0xFF01`, usage 1, **feature report 6**, 41 bytes |
| Status collection | usage page `0xFF00`, usage 1, input report 5, 17 bytes |

Every command is one `SetFeature(6)` (`0x480cc0`). Reads are followed by `GetFeature(6)` (`0x481060`).

```
request : [06] 00 00 CMD SEQ SUB ADDR_LO ADDR_HI LEN DATA… (padded to 41 bytes)
response: [06] 00 00 CMD SEQ SUB ADDR_LO ADDR_HI LEN DATA…  (read commands only)
```

`SEQ` increments per packet and is echoed. Read commands are the write command with bit 7 set.
A response with `LEN = 0` means "not ready / mouse asleep"; the vendor retries up to 5 times.
Writes are not acknowledged. Payloads are at most 32 bytes; longer blobs are written in 32-byte chunks at
increasing `ADDR`.

## Commands

| Write | Read | Sub / addr | Payload |
|---|---|---|---|
| — | `81` | — | `[status, battery %, sensor chip index]` |
| `02` | `82` | sub 1 | 4 × u16 BE per-profile "random" sync tags (driver bookkeeping) |
| `02` | `82` | sub 2 | active profile `0–2` |
| `02` | `82` | sub 3 | sleep timeout, u16 LE seconds (UI 1–30 min) |
| `02` | `82` | sub 4 | deep-sleep timeout, u16 LE seconds (UI 1–30 min) |
| `02` | `82` | sub 5 | sensor flags: bit0 angle snapping, bit1 ripple control (jitter correction on chip 12), bit7 motion smoothing |
| `02` | `82` | sub 6 | lift-off distance (chips 6/12: 1 mm = 0, 2 mm = 2; chip 7: 1 mm = 2, 2 mm = 3; others fixed 0) |
| — | `82` | sub 7 | charge counter |
| `03` | `83` | — | report interval: `8/4/2/1` = 125/250/500/1000 Hz (8 kHz models use 125 µs units) |
| `04` | `84` | addr = slot × 4 | 4-byte button binding, 16 slots |
| `05` | `85` | addr = idx × 4 | 4-byte wheel binding (0 = up, 1 = down) |
| `06` | `86` | — | DPI: `[enable mask, active stage (1-based), 8 × u16 LE sensor register, u16 extra]` |
| `07` | `87` | — | 8 × DPI colour `[G, R, B]` |
| `08` | `88` | sub = slot, addr = offset | macro, ≤ 512 bytes |
| `09` | `89` | addr = n × 25 | lighting record (see below) |
| `0A` | `8A` | sub 2 | debounce ms (UI 1–20) |
| `0A` | `8A` | sub 6 | wake on movement (0/1) |
| — | `F0` | sub 1 / 2 | firmware version string / build id |
| — | `F1` | sub 1 | receiver firmware version |

Profile-specific data (rate, DPI, buttons, wheel, lighting, macros) always refers to the **active** profile;
switch with `02/sub 2` first. Hardware button slots on the S350 PRO: 0 left, 1 wheel click, 2 right, 3 back,
4 forward, 5 DPI (slot 6 = hidden LED button).

### DPI

Stages hold sensor register values, not DPI. The driver converts with per-sensor tables from
`DeviceFeature.ini` (`[ChipN]`), selected by the chip index from command `81`. Chip 8 = PAW3311,
100–12000 DPI in steps of 100 (e.g. 1200 → 13, 12000 → 143).

### Button bindings (`0x477830`)

| Bytes | Action |
|---|---|
| `00 00 00 00` | disabled |
| `01 mask` | mouse button: 01 left, 02 right, 04 middle, 08 back, 10 forward |
| `02 usage` | keyboard key (HID usage) |
| `04 lo hi` | consumer control usage (e.g. `E9 00` vol+, `CD 00` play/pause, `92 01` calculator) |
| `05 01` / `05 81` | wheel up / down |
| `0B 01` / `0B 81` | horizontal scroll right / left |
| `06 03` | polling-rate cycle |
| `07 01` / `07 04` | lighting mode cycle / lighting on-off |
| `08 01/02/03` | DPI + / − / cycle |
| `09 01/02/03` | profile next / previous / cycle; `09 04 n` = profile n |
| `0A mode slot` | play macro stored in `slot`; mode 0 = N times, 1 = while held, 2 = toggle |

The driver always stores a button's macro in the macro slot with the same number as the button.
Shortcuts (copy, paste, Win+D …), double click and rapid fire are ordinary macros.

### Macros (`0x481590` writer, `0x481f40` reader)

```
[repeat u16 LE][body length u16 LE] events…
key / mouse : code, (release ? 0x80 : 0) | delay        delay 0–127 ms
              code, release ? FF : 7F, FF, d24           delay = 127 + d24
wheel       : FD, delta, 00, delay                       delay 0–255 ms
              FD, delta, 00, FF, FF, d24                 delay = 255 + d24
move        : FE, delay, x16, y16                        delay 0–255 ms
              FE, FF, x16, y16, FF, d24                  delay = 255 + d24
```

Keys use HID usages `04–E7`; mouse buttons inside macros are `E8` left, `E9` right, `EA` middle,
`EB` back, `EC` forward. Delays are the wait after the event.

### Lighting (`0x481ae0`)

Record 0: `[mode, u16 aux]`. Mode byte = `0x80 | n`, plus `0x40` for power saving (lights off while moving).
n: 1 Constant, 2 Flowing water, 3 Mono water, 4 DPI breathing, 5 Cycle breathing, 6 Enraptured,
7 Neon, 8 Ambilight, 9 Off.

Record n (addr n × 25): `[speed 1–7, direction, 6 − brightness(1–6), colour enable mask, 7 × [G, R, B]]`.
Which controls apply to which effect comes from `[LEDEN]` in `DeviceFeature.ini`.

### Status report (input report 5)

`[online, buttons lo, buttons hi, –, –, profile, rate, DPI stage (1-based), lighting mode, …]`.
`online = 0` means the receiver can't reach the mouse.
