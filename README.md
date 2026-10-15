# BOUNCE RETURN (jagadesan-bounce)

A high-precision, one-button arcade bouncing game built with vanilla HTML5, CSS3, and modern JavaScript.

![Bounce Return Preview](assets/face-success.png)

## 🌐 Live URLs

- **Vercel**: [https://jagadesan-bounce.vercel.app](https://jagadesan-bounce.vercel.app)
- **GitHub Pages**: [https://hariganesh712.github.io/jagadesan-bounce/](https://hariganesh712.github.io/jagadesan-bounce/)

## 🎮 How to Play

- **Controls**: Click, Tap anywhere, or press **Spacebar** / **W** / **ArrowUp** to bounce upward.
- **Goal**: Navigate through the futuristic neon gates.
- **Scoring**: Each gate successfully passed awards **+1 point**.
- **Rules**: Colliding with a gate pillar, ceiling, or floor triggers Game Over.

## 🔊 Audio Design

- **Player Press / Bounce**: `VISHWANTH.mp3` triggers with 2.0x amplified loudness on every bounce, restarting from the beginning.
- **Gate Pass**: 100% silent (visual particles and score increment only).
- **Failure**: `JAGADESAN.mp3` plays once upon collision with 2.0x amplified loudness.
- **Master Limiter**: Dynamics compressor prevents audio clipping or distortion across desktop and mobile devices.

## 📁 Project Structure

```text
jagadesan-bounce/
├── index.html       # Semantic HTML5 container & controls
├── style.css        # Responsive dark cinematic theme & mobile viewport handling
├── game.js          # Core 60 FPS physics engine, state machine, Web Audio
├── vercel.json      # Vercel deployment configuration (project: jagadesan-bounce)
├── README.md        # Documentation and live links
└── assets/
    ├── face-success.png
    ├── face-failure.png
    ├── JAGADESAN.mp3
    └── VISHWANTH.mp3
```
