# AULA S350 PRO — web control panel

A browser replacement for the AULA S350 PRO Windows driver. It talks to the mouse directly over
WebHID, so every change is stored on the mouse itself.

**Needs** Chrome, Edge or Opera on a desktop OS (WebHID). Close the AULA desktop driver first.

## Features

- **Buttons** – remap all six buttons and both wheel directions: mouse buttons, any keyboard key or
  key combo, media keys, DPI / profile / polling / lighting controls, horizontal scroll, shortcuts
  (copy, paste, Win+D …), double click, rapid fire, and your own macros.
- **DPI** – 8 stages with on/off, value (sensor-accurate steps), colour, and the active stage.
- **Lighting** – all 9 effects with brightness, speed, direction, 7 colours and power-saving mode.
- **Macros** – record keys, clicks and scrolls with timing, edit delays, play N times / while held / toggle.
- **Performance** – polling rate, debounce, angle snapping, ripple control, motion smoothing,
  lift-off distance (sensors that support it), sleep, deep sleep, wake on movement.
- **Profiles** – switch between Office, Game I and Game II; export, import and reset a profile.
- Live status: active DPI stage and pressed buttons update as you use the mouse.
- Demo mode to explore without a mouse.

## Run locally

Any static file server works, e.g.

```
python -m http.server 8000
```

then open http://localhost:8000. WebHID needs `localhost` or HTTPS.

## How it was built

The protocol was reverse-engineered from the vendor driver; see [PROTOCOL.md](PROTOCOL.md).
`js/data.js` is generated from the driver's `DeviceFeature.ini` (sensor DPI tables, lighting
capabilities) and `ResetMouseConfig.json` (defaults).
