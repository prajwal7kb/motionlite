# MotionLite

A lightweight, personal 2D motion-graphics editor for Windows 11. Built with Tauri 2, React 18, TypeScript, and Canvas2D.

Think "After Effects, but tiny" — layer-based composition, keyframable properties, bezier easing, expressions, effects, and MP4 export, in ~15 MB of RAM at idle.

## Features

- **Layer-based composition** — shapes, text, image, video, audio, solid, with z-order and grouping
- **Timeline** — multi-track, clip drag/trim, keyframe drag, property channels, magnetic alignment, sticky headers
- **Keyframes** — linear / hold / bezier easing, cubic-bezier control points, non-destructive resets, navigation arrows
- **Vector shapes** — rectangle, ellipse, polygon, star, line, with drag-to-draw tools and a contextual property bar
- **Text engine** — per-layer reveal (typewriter), size, tracking, leading, alignment, fill color
- **Effects** — blur, glow, drop shadow, color correction; all parameters keyframable; save as presets
- **Expressions** — AE-style per-property JavaScript: `wiggle`, `ease`, `linear`, `noise`, `loopOut`, `random`
- **Audio** — sync-locked playback and seeking
- **Subtitles** — SRT import as timed caption layers with automatic gap closing
- **Export** — H.264 MP4 via WebCodecs, adjustable resolution / fps / bitrate, live progress
- **Presets** — save and reapply layer + effect configurations, JSON import / export

## Requirements

- Windows 11
- WebView2 Runtime (preinstalled on Windows 11)

## Setup

    npm install
    npm run tauri:dev

First run compiles the Rust shell (~2–4 min). Subsequent runs start in seconds.

## Build

    npm run tauri:build

Produces `src-tauri/target/release/motionlite.exe` and an NSIS installer.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `V` | Select tool |
| `T` | Text tool |
| `R` | Rectangle tool |
| `E` | Ellipse tool |
| `Delete` / `Backspace` | Delete selected layer(s) |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo |
| `Ctrl+S` | Save project as `.mlite` |
| `Ctrl+Wheel` | Zoom preview canvas |
| `Escape` | Return to select tool |

## Project file format

MotionLite projects are plain JSON with a `.mlite` extension. Human-readable, git-friendly, no cloud, no proprietary format.

## License

Private. Not for distribution.
