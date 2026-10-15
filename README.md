# BOUNCE RETURN

A high-precision, one-button arcade bouncing game built with vanilla HTML5, CSS3, and modern JavaScript.

![Bounce Return Preview](assets/face-success.png)

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

## 🚀 Deployment

This project requires **no build tools**, **no npm dependencies**, and **no backend**. It is immediately deployable:

### Vercel
1. Install Vercel CLI (`npm i -g vercel`) or import the repo directly at [vercel.com](https://vercel.com).
2. Run `vercel` in the project root.

### Netlify
1. Drag and drop the `bounce-return` directory into [app.netlify.com/drop](https://app.netlify.com/drop).
2. Or connect your Git repository; publish directory is `./`.

### GitHub Pages
1. Push the code to a GitHub repository.
2. Go to **Settings** > **Pages** > select branch `main` and root `/`.
3. Save and your game is live!

## 📁 Project Structure

```text
bounce-return/
├── index.html       # Semantic HTML5 container & controls
├── style.css        # Responsive dark cinematic theme & mobile viewport handling
├── game.js          # Core 60 FPS physics engine, state machine, Web Audio
├── README.md        # Documentation and deployment guide
└── assets/
    ├── face-success.png
    ├── face-failure.png
    ├── JAGADESAN.mp3
    └── VISHWANTH.mp3
```
