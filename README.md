# 🐍 Snake — Arcade Edition

A modern, arcade-inspired Snake game built with vanilla HTML5, CSS, and JavaScript. Designed with smooth canvas rendering, synth sound effects using the Web Audio API, dynamic speed scaling, particle effects, high score persistence, and responsive controls (keyboard and touch D-pad).

---

## ✨ Features

- **Arcade Aesthetic**: Dark, neon-infused cabinet theme with glowing grid and crisp visual feedback.
- **Canvas Rendering**: Device-pixel-ratio (DPR) aware canvas rendering for smooth, high-DPI crisp visuals and fluid interpolation.
- **Synthesized Sound Engine**: Audio synthesized on-the-fly using the HTML5 Web Audio API (no external audio files required). Includes toggleable sound setting.
- **Gameplay Progression**:
  - **Dynamic Speed Ramping**: Speed increases as your score grows based on difficulty settings.
  - **Score Multipliers**: Consecutive food items collected increase the score multiplier (up to 4x).
  - **Particle Burst Effects**: Visual particle burst upon eating food items.
  - **Difficulty Levels**: Select between Easy, Normal, and Hard difficulties.
- **High Score Tracking**: LocalStorage persistence keeps track of your best score across sessions.
- **Responsive & Touch Friendly**:
  - Works on Desktop and Mobile.
  - On-screen touch D-pad automatically available on mobile/touch devices.

---

## 🎮 How to Play

### Controls

- **Movement**: <kbd>Arrow Keys</kbd> or <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd>
- **Pause / Resume**: <kbd>Space</kbd>
- **Restart Game**: <kbd>Enter</kbd> (when Game Over)
- **Mobile Controls**: Tap the on-screen directional D-pad buttons.

---

## 📂 Project Structure

```
.
├── index.html   # Main HTML structure, HUD, overlays, and controls layout
├── style.css    # Styling, layout, animations, color palette, and responsive design
└── script.js    # Game logic, state management, canvas loop, audio synthesizer, and input handlers
```

---

## 🚀 Running Locally

Because this project uses vanilla web technologies without build tools or external dependencies, you can run it directly in any modern web browser:

1. **Clone or download** this repository.
2. Open `index.html` directly in your web browser, or serve it using a simple static file server:

```bash
# Example using Python 3
python3 -m http.server 8000
```

Then navigate to `http://localhost:8000` in your web browser.

---

## 📜 License

This project is open source and free to use.
