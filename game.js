/**
 * ============================================================================
 * BOUNCE RETURN - Core Game Engine
 * A high-precision arcade bouncing ball game.
 * Vanilla JavaScript (Canvas 2D, Web Audio API, Responsive Scaling)
 * ============================================================================
 */

(function () {
  'use strict';

  // --------------------------------------------------------------------------
  // CONSTANTS & GAME TUNING
  // --------------------------------------------------------------------------
  const CANVAS_WIDTH = 720;
  const CANVAS_HEIGHT = 420;

  // Physics tuning (normalized to 60 FPS delta)
  const GRAVITY = 0.34;
  const BOUNCE_VELOCITY = -6.8;
  const MAX_FALL_VELOCITY = 9.2;
  const INITIAL_HORIZ_SPEED = 2.25;
  const MAX_HORIZ_SPEED = 3.5;

  // Ball properties
  const PLAY_BALL_X = 150;
  const BALL_RADIUS = 24;
  const COLLISION_RADIUS = 21.5; // Precision arcade feel with fair tolerance

  // Gate configuration
  const GATE_WIDTH = 28;
  const INITIAL_GAP_SIZE = 128;
  const MIN_GAP_SIZE = 106;
  const GATE_SPACING = 255;
  const FIRST_GATE_X = 580;

  // Game States
  const STATE_START = 'START';
  const STATE_PLAYING = 'PLAYING';
  const STATE_GAMEOVER = 'GAMEOVER';

  // Local storage key
  const STORAGE_KEY = 'bounce_return_best_score_v1';

  // --------------------------------------------------------------------------
  // AUDIO MANAGER (Web Audio API with 2.0x Gain & Brickwall Limiter)
  // Audio mapping:
  // PLAYER PRESS -> VISHWANTH.mp3 (restarted on every press, 2x volume)
  // GATE PASS    -> SILENT (no sound)
  // FAILURE      -> JAGADESAN.mp3 (once per failure, 2x volume)
  // --------------------------------------------------------------------------
  class AudioManager {
    constructor() {
      this.isMuted = false;
      this.isUnlocked = false;
      this.audioCtx = null;
      this.masterCompressor = null;
      this.bounceBuffer = null;
      this.failureBuffer = null;

      // HTML5 Audio fallback instances
      this.htmlBounce = new Audio('assets/VISHWANTH.mp3');
      this.htmlFailure = new Audio('assets/JAGADESAN.mp3');
      this.htmlBounce.preload = 'auto';
      this.htmlFailure.preload = 'auto';

      this.activeBounceNode = null;
      this.activeBounceGain = null;

      this.initWebAudio();
    }

    initWebAudio() {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          this.audioCtx = new AudioContextClass();

          // Transparent Dynamics Compressor / Limiter:
          // Enables 2.0x amplification without digital clipping or distortion
          this.masterCompressor = this.audioCtx.createDynamicsCompressor();
          this.masterCompressor.threshold.setValueAtTime(-1.0, this.audioCtx.currentTime);
          this.masterCompressor.knee.setValueAtTime(0, this.audioCtx.currentTime);
          this.masterCompressor.ratio.setValueAtTime(20, this.audioCtx.currentTime);
          this.masterCompressor.attack.setValueAtTime(0.002, this.audioCtx.currentTime);
          this.masterCompressor.release.setValueAtTime(0.1, this.audioCtx.currentTime);
          this.masterCompressor.connect(this.audioCtx.destination);

          this.loadAudioBuffer('assets/VISHWANTH.mp3', (buf) => (this.bounceBuffer = buf));
          this.loadAudioBuffer('assets/JAGADESAN.mp3', (buf) => (this.failureBuffer = buf));
        }
      } catch (e) {
        console.warn('Web Audio API unavailable, using HTML5 Audio fallback.', e);
      }
    }

    loadAudioBuffer(url, callback) {
      fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.arrayBuffer();
        })
        .then((arrayBuffer) => this.audioCtx.decodeAudioData(arrayBuffer))
        .then((decodedBuffer) => callback(decodedBuffer))
        .catch((err) => {
          console.warn(`Could not preload audio buffer for ${url}:`, err);
        });
    }

    unlock() {
      if (this.isUnlocked) return;
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().then(() => {
          this.isUnlocked = true;
        }).catch(() => {});
      } else {
        this.isUnlocked = true;
      }
    }

    // Play ONLY when player presses/clicks/taps/Space to bounce.
    // Every single player press triggers VISHWANTH.mp3, restarting from the beginning.
    playBounce() {
      if (this.isMuted) return;
      this.unlock();

      // Stop previous instance immediately so it restarts from the beginning
      if (this.activeBounceNode) {
        try {
          this.activeBounceNode.stop();
          this.activeBounceNode.disconnect();
        } catch (e) {}
        this.activeBounceNode = null;
        this.activeBounceGain = null;
      }

      // Web Audio API playback with 2.0x amplification & limiter protection
      if (this.audioCtx && this.bounceBuffer && this.audioCtx.state === 'running') {
        try {
          const source = this.audioCtx.createBufferSource();
          const gainNode = this.audioCtx.createGain();

          source.buffer = this.bounceBuffer;
          source.playbackRate.value = 1.0;
          gainNode.gain.value = 2.0; // 2x perceived volume

          source.connect(gainNode);
          gainNode.connect(this.masterCompressor || this.audioCtx.destination);

          source.start(0);
          this.activeBounceNode = source;
          this.activeBounceGain = gainNode;
          return;
        } catch (e) {
          console.warn('Web Audio bounce playback error:', e);
        }
      }

      // Fallback HTML5 Audio: restart from beginning
      try {
        this.htmlBounce.pause();
        this.htmlBounce.currentTime = 0;
        this.htmlBounce.volume = 1.0;
        this.htmlBounce.play().catch(() => {});
      } catch (e) {}
    }

    // Play ONLY when the player fails (gate hit or boundary collision).
    // Plays exactly once per failure with 2.0x amplification.
    playGameOver() {
      if (this.isMuted) return;
      this.unlock();

      // Immediately stop any lingering bounce audio
      if (this.activeBounceNode) {
        try {
          this.activeBounceNode.stop();
          this.activeBounceNode.disconnect();
        } catch (e) {}
        this.activeBounceNode = null;
        this.activeBounceGain = null;
      }

      // Web Audio API playback with 2.0x amplification & limiter protection
      if (this.audioCtx && this.failureBuffer && this.audioCtx.state === 'running') {
        try {
          const source = this.audioCtx.createBufferSource();
          const gainNode = this.audioCtx.createGain();

          source.buffer = this.failureBuffer;
          source.playbackRate.value = 1.0;
          gainNode.gain.value = 2.0; // 2x perceived volume

          source.connect(gainNode);
          gainNode.connect(this.masterCompressor || this.audioCtx.destination);

          source.start(0);
          return;
        } catch (e) {
          console.warn('Web Audio failure playback error:', e);
        }
      }

      // Fallback HTML5 Audio
      try {
        this.htmlFailure.pause();
        this.htmlFailure.currentTime = 0;
        this.htmlFailure.volume = 1.0;
        this.htmlFailure.play().catch(() => {});
      } catch (e) {}
    }

    toggleMute() {
      this.isMuted = !this.isMuted;
      if (this.isMuted) {
        if (this.activeBounceNode) {
          try {
            this.activeBounceNode.stop();
          } catch (e) {}
          this.activeBounceNode = null;
        }
        try {
          this.htmlBounce.pause();
          this.htmlFailure.pause();
        } catch (e) {}
      }
      return this.isMuted;
    }
  }

  // --------------------------------------------------------------------------
  // ASSET LOADER
  // --------------------------------------------------------------------------
  class AssetLoader {
    constructor() {
      this.successImg = new Image();
      this.failureImg = new Image();

      this.successLoaded = false;
      this.failureLoaded = false;

      this.successImg.onload = () => {
        this.successLoaded = true;
      };
      this.failureImg.onload = () => {
        this.failureLoaded = true;
      };

      this.successImg.src = 'assets/face-success.png';
      this.failureImg.src = 'assets/face-failure.png';
    }

    isReady() {
      return this.successLoaded && this.failureLoaded;
    }
  }

  // --------------------------------------------------------------------------
  // PARTICLE SYSTEM
  // --------------------------------------------------------------------------
  class ParticleSystem {
    constructor() {
      this.particles = [];
      this.rings = [];
      this.floatingTexts = [];
    }

    reset() {
      this.particles.length = 0;
      this.rings.length = 0;
      this.floatingTexts.length = 0;
    }

    // Expanding shockwave ring on bounce
    spawnBounceRing(x, y) {
      this.rings.push({
        x,
        y,
        radius: 12,
        maxRadius: 44,
        alpha: 0.8,
        color: '56, 189, 248',
      });
    }

    // Ball movement trail particles
    spawnTrail(x, y) {
      this.particles.push({
        x: x - BALL_RADIUS * 0.7 + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 8,
        vx: -(1.2 + Math.random() * 1.5),
        vy: (Math.random() - 0.5) * 0.8,
        size: 3 + Math.random() * 3,
        alpha: 0.6,
        decay: 0.035 + Math.random() * 0.02,
        color: Math.random() > 0.4 ? '56, 189, 248' : '168, 85, 247',
      });
    }

    // Gate cleared celebration burst (Visual only - silent)
    spawnGateClearBurst(x, y) {
      for (let i = 0; i < 22; i++) {
        const angle = (Math.PI * 2 * i) / 22 + (Math.random() - 0.5) * 0.3;
        const speed = 2.0 + Math.random() * 4.2;
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 3.5 + Math.random() * 3.5,
          alpha: 1.0,
          decay: 0.025 + Math.random() * 0.02,
          color: Math.random() > 0.3 ? '56, 189, 248' : '250, 204, 21',
        });
      }

      this.rings.push({
        x,
        y,
        radius: 10,
        maxRadius: 65,
        alpha: 0.95,
        color: '56, 189, 248',
      });

      this.floatingTexts.push({
        x,
        y: y - 10,
        text: '+1',
        alpha: 1.0,
        vy: -1.4,
      });
    }

    // Collision failure burst
    spawnFailureBurst(x, y) {
      for (let i = 0; i < 30; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2.5 + Math.random() * 5.0;
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 4 + Math.random() * 4,
          alpha: 1.0,
          decay: 0.02 + Math.random() * 0.02,
          color: Math.random() > 0.5 ? '239, 68, 68' : '249, 115, 22',
        });
      }
    }

    update(dt) {
      // Particles update
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.alpha -= p.decay * dt;
        p.size *= Math.pow(0.98, dt);
        if (p.alpha <= 0 || p.size <= 0.4) {
          this.particles.splice(i, 1);
        }
      }

      // Rings update
      for (let i = this.rings.length - 1; i >= 0; i--) {
        const r = this.rings[i];
        r.radius += (r.maxRadius - r.radius) * 0.14 * dt;
        r.alpha -= 0.035 * dt;
        if (r.alpha <= 0 || r.radius >= r.maxRadius - 1) {
          this.rings.splice(i, 1);
        }
      }

      // Floating text update
      for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
        const t = this.floatingTexts[i];
        t.y += t.vy * dt;
        t.alpha -= 0.022 * dt;
        if (t.alpha <= 0) {
          this.floatingTexts.splice(i, 1);
        }
      }
    }

    draw(ctx) {
      ctx.save();

      // Draw rings
      for (const r of this.rings) {
        ctx.beginPath();
        ctx.arc(r.x, r.y, Math.max(1, r.radius), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${r.color}, ${Math.max(0, r.alpha)})`;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // Draw particles
      for (const p of this.particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.size), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.color}, ${Math.max(0, p.alpha)})`;
        ctx.shadowColor = `rgba(${p.color}, ${p.alpha * 0.6})`;
        ctx.shadowBlur = 6;
        ctx.fill();
      }

      // Draw floating score text
      ctx.font = '900 22px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      for (const t of this.floatingTexts) {
        ctx.shadowColor = 'rgba(56, 189, 248, 0.8)';
        ctx.shadowBlur = 10;
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, t.alpha)})`;
        ctx.fillText(t.text, t.x, t.y);
      }

      ctx.restore();
    }
  }

  // --------------------------------------------------------------------------
  // BACKGROUND & PARALLAX ENVIRONMENT
  // --------------------------------------------------------------------------
  class Background {
    constructor() {
      this.stars = [];
      this.initStars();
      this.gridOffset = 0;
    }

    initStars() {
      for (let i = 0; i < 48; i++) {
        this.stars.push({
          x: Math.random() * CANVAS_WIDTH,
          y: Math.random() * CANVAS_HEIGHT,
          radius: 0.75 + Math.random() * 1.5,
          speed: 0.3 + Math.random() * 0.7,
          alpha: 0.25 + Math.random() * 0.65,
        });
      }
    }

    update(dt, worldSpeed) {
      for (const star of this.stars) {
        star.x -= star.speed * (worldSpeed / INITIAL_HORIZ_SPEED) * dt;
        if (star.x < 0) {
          star.x = CANVAS_WIDTH + Math.random() * 10;
          star.y = Math.random() * CANVAS_HEIGHT;
        }
      }

      this.gridOffset = (this.gridOffset + worldSpeed * 0.6 * dt) % 40;
    }

    draw(ctx) {
      ctx.save();

      // Deep cinematic backdrop gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      bgGrad.addColorStop(0, '#0a101f');
      bgGrad.addColorStop(0.5, '#060a14');
      bgGrad.addColorStop(1, '#03050a');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Parallax stars
      for (const star of this.stars) {
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(186, 230, 253, ${star.alpha})`;
        ctx.fill();
      }

      // Neon rails
      this.drawBoundaries(ctx);

      ctx.restore();
    }

    drawBoundaries(ctx) {
      ctx.save();

      // Top ceiling neon rail
      const topGrad = ctx.createLinearGradient(0, 0, 0, 8);
      topGrad.addColorStop(0, 'rgba(56, 189, 248, 0.55)');
      topGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = topGrad;
      ctx.fillRect(0, 0, CANVAS_WIDTH, 8);

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 1);
      ctx.lineTo(CANVAS_WIDTH, 1);
      ctx.stroke();

      // Bottom floor neon rail
      const botGrad = ctx.createLinearGradient(0, CANVAS_HEIGHT, 0, CANVAS_HEIGHT - 8);
      botGrad.addColorStop(0, 'rgba(56, 189, 248, 0.55)');
      botGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = botGrad;
      ctx.fillRect(0, CANVAS_HEIGHT - 8, CANVAS_WIDTH, 8);

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, CANVAS_HEIGHT - 1);
      ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT - 1);
      ctx.stroke();

      ctx.restore();
    }
  }

  // --------------------------------------------------------------------------
  // GATE MANAGER (Procedural Fair Gate Generation & Collision Detection)
  // --------------------------------------------------------------------------
  class GateManager {
    constructor() {
      this.gates = [];
      this.lastGateX = 0;
      this.lastGapY = CANVAS_HEIGHT / 2;
    }

    reset() {
      this.gates = [];
      this.lastGateX = FIRST_GATE_X;
      this.lastGapY = CANVAS_HEIGHT / 2;
      for (let i = 0; i < 3; i++) {
        this.spawnGate(0);
      }
    }

    spawnGate(score) {
      const gapSize = Math.max(MIN_GAP_SIZE, INITIAL_GAP_SIZE - score * 0.75);

      const minGapCenter = 45 + gapSize / 2;
      const maxGapCenter = CANVAS_HEIGHT - (45 + gapSize / 2);

      const maxDelta = 90;
      const targetMin = Math.max(minGapCenter, this.lastGapY - maxDelta);
      const targetMax = Math.min(maxGapCenter, this.lastGapY + maxDelta);

      const gapCenterY = targetMin + Math.random() * (targetMax - targetMin);

      const gate = {
        x: this.lastGateX,
        gapY: gapCenterY,
        gapSize: gapSize,
        width: GATE_WIDTH,
        passed: false,
        pulseTimer: 0,
      };

      this.gates.push(gate);
      this.lastGateX += GATE_SPACING;
      this.lastGapY = gapCenterY;
    }

    update(dt, worldSpeed, score, ball, particleSystem, onScoreIncrement) {
      // Move gates left
      for (let i = this.gates.length - 1; i >= 0; i--) {
        const gate = this.gates[i];
        gate.x -= worldSpeed * dt;

        if (gate.pulseTimer > 0) {
          gate.pulseTimer = Math.max(0, gate.pulseTimer - 0.05 * dt);
        }

        // Check if player successfully passed this gate
        // GATE PASS IS COMPLETELY SILENT - NO AUDIO
        if (!gate.passed && ball.x > gate.x + gate.width) {
          gate.passed = true;
          gate.pulseTimer = 1.0;
          particleSystem.spawnGateClearBurst(gate.x + gate.width / 2, gate.gapY);
          onScoreIncrement();
        }

        // Remove offscreen gates
        if (gate.x + gate.width < -40) {
          this.gates.splice(i, 1);
        }
      }

      this.lastGateX -= worldSpeed * dt;

      while (this.lastGateX < CANVAS_WIDTH + GATE_SPACING) {
        this.spawnGate(score);
      }
    }

    // Accurate Circle vs AABB (Upper & Lower Pillars + Ceiling & Floor)
    checkCollision(ball) {
      const bx = ball.x;
      const by = ball.y;
      const r = COLLISION_RADIUS;

      // Boundary collision check (ceiling and floor)
      if (by - r <= 2 || by + r >= CANVAS_HEIGHT - 2) {
        return true;
      }

      for (const gate of this.gates) {
        if (bx + r < gate.x || bx - r > gate.x + gate.width) {
          continue;
        }

        const topPillarBottom = gate.gapY - gate.gapSize / 2;
        const bottomPillarTop = gate.gapY + gate.gapSize / 2;

        // Upper pillar rectangle
        if (this.circleRectCollide(bx, by, r, gate.x, 0, gate.width, topPillarBottom)) {
          return true;
        }

        // Lower pillar rectangle
        if (this.circleRectCollide(bx, by, r, gate.x, bottomPillarTop, gate.width, CANVAS_HEIGHT - bottomPillarTop)) {
          return true;
        }
      }

      return false;
    }

    circleRectCollide(cx, cy, r, rx, ry, rw, rh) {
      const closestX = Math.max(rx, Math.min(cx, rx + rw));
      const closestY = Math.max(ry, Math.min(cy, ry + rh));
      const dx = cx - closestX;
      const dy = cy - closestY;
      return dx * dx + dy * dy < r * r;
    }

    draw(ctx) {
      ctx.save();

      for (const gate of this.gates) {
        if (gate.x + gate.width < -10 || gate.x > CANVAS_WIDTH + 10) continue;

        const topH = gate.gapY - gate.gapSize / 2;
        const botY = gate.gapY + gate.gapSize / 2;
        const botH = CANVAS_HEIGHT - botY;

        const isPulsing = gate.pulseTimer > 0;
        const accentColor = isPulsing ? '#38bdf8' : '#0284c7';
        const glowColor = isPulsing ? 'rgba(56, 189, 248, 0.85)' : 'rgba(14, 165, 233, 0.35)';

        // Draw Upper Pillar
        this.drawPillar(ctx, gate.x, 0, gate.width, topH, true, accentColor, glowColor);

        // Draw Lower Pillar
        this.drawPillar(ctx, gate.x, botY, gate.width, botH, false, accentColor, glowColor);

        // Subtle energy beam connector in the gap
        ctx.strokeStyle = isPulsing ? 'rgba(56, 189, 248, 0.45)' : 'rgba(56, 189, 248, 0.12)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(gate.x + gate.width / 2, topH);
        ctx.lineTo(gate.x + gate.width / 2, botY);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.restore();
    }

    drawPillar(ctx, x, y, w, h, isTop, accentColor, glowColor) {
      if (h <= 0) return;

      ctx.save();

      const grad = ctx.createLinearGradient(x, 0, x + w, 0);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(0.3, '#1e293b');
      grad.addColorStop(0.7, '#334155');
      grad.addColorStop(1, '#0f172a');

      ctx.fillStyle = grad;
      ctx.beginPath();
      if (isTop) {
        ctx.roundRect(x, y, w, h, [0, 0, 8, 8]);
      } else {
        ctx.roundRect(x, y, w, h, [8, 8, 0, 0]);
      }
      ctx.fill();

      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 2;
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 8;
      ctx.stroke();

      const capY = isTop ? y + h - 6 : y;
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.roundRect(x + 2, capY, w - 4, 6, [3, 3, 3, 3]);
      ctx.fill();

      ctx.restore();
    }
  }

  // --------------------------------------------------------------------------
  // PLAYER BALL
  // --------------------------------------------------------------------------
  class Player {
    constructor(assetLoader) {
      this.assetLoader = assetLoader;
      this.reset();
    }

    reset() {
      this.x = PLAY_BALL_X;
      this.y = CANVAS_HEIGHT / 2;
      this.vy = 0;
      this.radius = BALL_RADIUS;
      this.rotation = 0;
      this.squashX = 1.0;
      this.squashY = 1.0;
      this.trailTimer = 0;
    }

    // Called on every player bounce press
    bounce(audioManager, particleSystem) {
      this.vy = BOUNCE_VELOCITY;
      this.squashX = 0.82;
      this.squashY = 1.25;

      particleSystem.spawnBounceRing(this.x, this.y);
      // Play VISHWANTH.mp3 on press (restarting from beginning, 2x gain)
      audioManager.playBounce();
    }

    update(dt, worldSpeed, particleSystem) {
      this.vy += GRAVITY * dt;
      if (this.vy > MAX_FALL_VELOCITY) {
        this.vy = MAX_FALL_VELOCITY;
      }
      this.y += this.vy * dt;

      this.rotation += 0.045 * (worldSpeed / INITIAL_HORIZ_SPEED) * dt;

      this.squashX += (1.0 - this.squashX) * 0.2 * dt;
      this.squashY += (1.0 - this.squashY) * 0.2 * dt;

      this.trailTimer += dt;
      if (this.trailTimer >= 2.0) {
        this.trailTimer = 0;
        particleSystem.spawnTrail(this.x, this.y);
      }
    }

    draw(ctx, isGameOver) {
      this.drawBallAt(ctx, this.x, this.y, this.radius, this.rotation, this.squashX, this.squashY, isGameOver);
    }

    // Modular rendering function for ball face with object-fit: cover and 3D spherical lighting
    drawBallAt(ctx, cx, cy, r, rot, sx, sy, isFailure) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.scale(sx, sy);

      // Outer drop shadow & colored neon aura
      ctx.save();
      ctx.shadowColor = isFailure ? 'rgba(239, 68, 68, 0.65)' : 'rgba(56, 189, 248, 0.55)';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.restore();

      // Circular Clipping Mask for Face Image
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.clip();

      const img = isFailure ? this.assetLoader.failureImg : this.assetLoader.successImg;

      if (img && img.complete && img.naturalWidth > 0) {
        const iw = img.naturalWidth;
        const ih = img.naturalHeight;

        // Perfect object-fit: cover implementation without distortion
        let srcX = 0;
        let srcY = 0;
        let sWidth = iw;
        let sHeight = ih;

        if (iw > ih) {
          sWidth = ih;
          sHeight = ih;
          srcX = (iw - ih) / 2;
          srcY = 0;
        } else {
          sWidth = iw;
          sHeight = iw;
          srcX = 0;
          srcY = (ih - iw) / 2;
        }

        ctx.drawImage(img, srcX, srcY, sWidth, sHeight, -r, -r, r * 2, r * 2);
      } else {
        ctx.fillStyle = isFailure ? '#dc2626' : '#0284c7';
        ctx.fill();
      }

      // 3D Spherical Radial Highlight Overlay
      const lightGrad = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
      lightGrad.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
      lightGrad.addColorStop(0.55, 'rgba(255, 255, 255, 0)');
      lightGrad.addColorStop(1, isFailure ? 'rgba(153, 27, 27, 0.55)' : 'rgba(15, 23, 42, 0.5)');

      ctx.fillStyle = lightGrad;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore(); // End Circular Clip

      // Sleek Metallic / Neon Accent Border Ring
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = isFailure ? '#ef4444' : '#38bdf8';
      ctx.stroke();

      ctx.restore();
    }
  }

  // --------------------------------------------------------------------------
  // GAME APPLICATION CONTROLLER
  // --------------------------------------------------------------------------
  class BounceReturnGame {
    constructor() {
      this.canvas = document.getElementById('game-canvas');
      this.ctx = this.canvas.getContext('2d');

      this.audioManager = new AudioManager();
      this.assetLoader = new AssetLoader();
      this.particleSystem = new ParticleSystem();
      this.background = new Background();
      this.gateManager = new GateManager();
      this.player = new Player(this.assetLoader);

      this.state = STATE_START;
      this.score = 0;
      this.bestScore = this.loadBestScore();
      this.isNewBest = false;

      // Delta time calculation
      this.lastTimestamp = performance.now();
      this.worldSpeed = INITIAL_HORIZ_SPEED;

      // Screen shake effect
      this.shakeIntensity = 0;
      this.shakeDecay = 0.9;

      // Cooldown timer to prevent accidental restart spam
      this.gameOverCooldown = 0;
      this.lastInputTime = 0;

      // Interactive UI button bounds on canvas
      this.startBtnBounds = { x: 260, y: 250, w: 200, h: 48 };
      this.restartBtnBounds = { x: 245, y: 288, w: 230, h: 48 };

      this.setupDOMControls();
      this.setupInputHandlers();

      // Start animation loop
      requestAnimationFrame((t) => this.loop(t));
    }

    loadBestScore() {
      try {
        const val = localStorage.getItem(STORAGE_KEY);
        return val ? parseInt(val, 10) || 0 : 0;
      } catch (e) {
        return 0; // Graceful fallback
      }
    }

    saveBestScore(val) {
      this.bestScore = val;
      try {
        localStorage.setItem(STORAGE_KEY, val.toString());
      } catch (e) {}
    }

    setupDOMControls() {
      const audioBtn = document.getElementById('audio-toggle-btn');
      const soundOnIcon = document.getElementById('sound-on-icon');
      const soundOffIcon = document.getElementById('sound-off-icon');

      if (audioBtn) {
        audioBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const muted = this.audioManager.toggleMute();
          if (muted) {
            soundOnIcon.classList.add('hidden');
            soundOffIcon.classList.remove('hidden');
          } else {
            soundOnIcon.classList.remove('hidden');
            soundOffIcon.classList.add('hidden');
          }
        });
      }

      const fullscreenBtn = document.getElementById('fullscreen-btn');
      if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
          } else {
            document.exitFullscreen().catch(() => {});
          }
        });
      }
    }

    setupInputHandlers() {
      const handleAction = (e) => {
        if (e) {
          if (e.target && e.target.closest('#top-controls')) {
            return; // Don't trigger bounce when tapping mute or fullscreen buttons
          }
          if (e.cancelable) {
            e.preventDefault();
          }
        }

        const now = performance.now();
        // Prevent duplicate synthetic events (e.g. pointerdown followed by click)
        if (now - this.lastInputTime < 35) {
          return;
        }
        this.lastInputTime = now;

        this.triggerInteraction();
      };

      // Listen on wrapper so mobile taps anywhere in the game container area register instantly
      const gameWrapper = document.getElementById('game-wrapper');
      if (gameWrapper) {
        gameWrapper.addEventListener('pointerdown', handleAction, { passive: false });
      } else {
        this.canvas.addEventListener('pointerdown', handleAction, { passive: false });
      }

      // Keyboard Controls (Spacebar / ArrowUp / W)
      window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' || e.code === 'ArrowUp' || e.key === ' ' || e.code === 'KeyW') {
          e.preventDefault();
          if (e.repeat) return; // Prevent duplicate events from key repeat
          this.triggerInteraction();
        }
      });

      // Prevent accidental scrolling & rubber-banding on touch devices
      window.addEventListener(
        'touchmove',
        (e) => {
          if (e.cancelable) e.preventDefault();
        },
        { passive: false }
      );
    }

    triggerInteraction() {
      // First interaction unlocks browser audio
      this.audioManager.unlock();

      if (this.state === STATE_START) {
        this.startGame();
      } else if (this.state === STATE_PLAYING) {
        this.player.bounce(this.audioManager, this.particleSystem);
      } else if (this.state === STATE_GAMEOVER) {
        if (this.gameOverCooldown <= 0) {
          this.startGame(); // Immediate restart
        }
      }
    }

    startGame() {
      this.state = STATE_PLAYING;
      this.score = 0;
      this.isNewBest = false;
      this.worldSpeed = INITIAL_HORIZ_SPEED;
      this.gateManager.reset();
      this.particleSystem.reset();
      this.player.reset();
      // Start gameplay with immediate upward bounce and VISHWANTH.mp3 sound
      this.player.bounce(this.audioManager, this.particleSystem);
    }

    // Called on failure (gate hit or boundary collision)
    // Guaranteed to execute exactly ONCE per failure
    triggerGameOver() {
      if (this.state === STATE_GAMEOVER) return;

      this.state = STATE_GAMEOVER;
      this.gameOverCooldown = 0.35; // 350ms cooldown before restart is allowed
      this.shakeIntensity = 12.0; // Trigger screen shake

      if (this.score > this.bestScore) {
        this.isNewBest = true;
        this.saveBestScore(this.score);
      }

      // Play JAGADESAN.mp3 exactly once per failure
      this.audioManager.playGameOver();
      this.particleSystem.spawnFailureBurst(this.player.x, this.player.y);
    }

    onGatePassed() {
      this.score++;
      if (this.score > this.bestScore) {
        this.saveBestScore(this.score);
        this.isNewBest = true;
      }
      // Smooth world speed increase as score builds
      this.worldSpeed = Math.min(MAX_HORIZ_SPEED, INITIAL_HORIZ_SPEED + this.score * 0.04);
    }

    // Main Game Loop (Delta-Time Normalized)
    loop(timestamp) {
      let rawDelta = (timestamp - this.lastTimestamp) / 1000;
      this.lastTimestamp = timestamp;

      // Cap delta time to prevent physics explosions after tab unfocus
      if (rawDelta > 0.08) rawDelta = 0.08;
      const dt = rawDelta * 60; // 1.0 at 60 FPS

      this.update(dt, timestamp);
      this.draw(timestamp);

      requestAnimationFrame((t) => this.loop(t));
    }

    update(dt, timestamp) {
      if (this.shakeIntensity > 0.1) {
        this.shakeIntensity *= Math.pow(this.shakeDecay, dt);
      } else {
        this.shakeIntensity = 0;
      }

      if (this.state === STATE_START) {
        this.background.update(dt, INITIAL_HORIZ_SPEED * 0.4);
        this.particleSystem.update(dt);
      } else if (this.state === STATE_PLAYING) {
        this.background.update(dt, this.worldSpeed);
        this.player.update(dt, this.worldSpeed, this.particleSystem);
        this.gateManager.update(
          dt,
          this.worldSpeed,
          this.score,
          this.player,
          this.particleSystem,
          () => this.onGatePassed()
        );
        this.particleSystem.update(dt);

        // Check collision with boundaries or gates
        if (this.gateManager.checkCollision(this.player)) {
          this.triggerGameOver();
        }
      } else if (this.state === STATE_GAMEOVER) {
        if (this.gameOverCooldown > 0) {
          this.gameOverCooldown -= dt / 60;
        }
        this.particleSystem.update(dt);
      }
    }

    draw(timestamp) {
      this.ctx.save();

      // Apply Screen Shake
      if (this.shakeIntensity > 0) {
        const shakeX = (Math.random() - 0.5) * this.shakeIntensity;
        const shakeY = (Math.random() - 0.5) * this.shakeIntensity;
        this.ctx.translate(shakeX, shakeY);
      }

      // Draw Environment
      this.background.draw(this.ctx);

      // Draw Gates
      if (this.state !== STATE_START) {
        this.gateManager.draw(this.ctx);
      }

      // Draw Particles & Rings
      this.particleSystem.draw(this.ctx);

      // Draw in-game Player Ball during PLAYING or GAMEOVER
      if (this.state === STATE_PLAYING || this.state === STATE_GAMEOVER) {
        const isOver = this.state === STATE_GAMEOVER;
        this.player.draw(this.ctx, isOver);
      }

      // Draw State UI Overlays
      if (this.state === STATE_START) {
        this.drawStartScreen(timestamp);
      } else if (this.state === STATE_PLAYING) {
        this.drawPlayingHUD();
      } else if (this.state === STATE_GAMEOVER) {
        this.drawGameOverScreen(timestamp);
      }

      this.ctx.restore();
    }

    // ------------------------------------------------------------------------
    // UI SCREENS
    // ------------------------------------------------------------------------

    drawStartScreen(timestamp) {
      const ctx = this.ctx;
      ctx.save();

      // Title: BOUNCE RETURN
      ctx.font = '900 46px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';

      // Title Glow
      ctx.shadowColor = 'rgba(56, 189, 248, 0.75)';
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#ffffff';
      ctx.fillText('BOUNCE RETURN', CANVAS_WIDTH / 2, 78);

      ctx.shadowBlur = 0;

      // Subtitle / Brand badge
      ctx.font = '700 12px system-ui, -apple-system, sans-serif';
      ctx.letterSpacing = '0.18em';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('PRECISION ONE-BUTTON ARCADE', CANVAS_WIDTH / 2, 102);

      // Hero Center Showcase Ball with smiling face
      const heroY = 168 + Math.sin(timestamp * 0.0035) * 8;
      const heroRot = Math.sin(timestamp * 0.002) * 0.12;
      const heroSquashX = 1.0 + Math.cos(timestamp * 0.0035) * 0.04;
      const heroSquashY = 1.0 - Math.cos(timestamp * 0.0035) * 0.04;
      this.player.drawBallAt(ctx, CANVAS_WIDTH / 2, heroY, 28, heroRot, heroSquashX, heroSquashY, false);

      // Best Score indicator if previously played
      if (this.bestScore > 0) {
        ctx.font = '600 13px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`BEST SCORE: ${this.bestScore}`, CANVAS_WIDTH / 2, 222);
      }

      // Pulsing "CLICK TO PLAY" Button
      const pulse = 1.0 + Math.sin(timestamp * 0.005) * 0.035;
      const btn = this.startBtnBounds;

      ctx.save();
      ctx.translate(CANVAS_WIDTH / 2, btn.y + btn.h / 2);
      ctx.scale(pulse, pulse);

      const btnGrad = ctx.createLinearGradient(0, -btn.h / 2, 0, btn.h / 2);
      btnGrad.addColorStop(0, '#0284c7');
      btnGrad.addColorStop(1, '#0369a1');

      ctx.shadowColor = 'rgba(56, 189, 248, 0.6)';
      ctx.shadowBlur = 16;
      ctx.fillStyle = btnGrad;
      ctx.beginPath();
      ctx.roundRect(-btn.w / 2, -btn.h / 2, btn.w, btn.h, 24);
      ctx.fill();

      ctx.strokeStyle = '#7dd3fc';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.font = '800 17px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('CLICK TO PLAY', 0, 1);
      ctx.restore();

      // Small instruction
      ctx.font = '500 13px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#64748b';
      ctx.textAlign = 'center';
      ctx.fillText('Click / Tap / Space to bounce', CANVAS_WIDTH / 2, 340);

      ctx.restore();
    }

    drawPlayingHUD() {
      const ctx = this.ctx;
      ctx.save();

      // Large Clean Score (Top Center)
      ctx.font = '900 52px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(this.score.toString(), CANVAS_WIDTH / 2, 68);

      // Best Score indicator (Top Left)
      ctx.font = '600 13px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(148, 163, 184, 0.75)';
      ctx.fillText(`BEST  ${Math.max(this.score, this.bestScore)}`, 24, 32);

      ctx.restore();
    }

    drawGameOverScreen(timestamp) {
      const ctx = this.ctx;
      ctx.save();

      // Dark cinematic vignette overlay
      ctx.fillStyle = 'rgba(3, 7, 18, 0.75)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Showcase the failure face prominently on the game over screen
      const faceBadgeY = 62;
      this.player.drawBallAt(ctx, CANVAS_WIDTH / 2, faceBadgeY, 26, 0, 1.0, 1.0, true);

      // GAME OVER Text
      ctx.font = '900 38px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(239, 68, 68, 0.85)';
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#ef4444';
      ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, 128);

      ctx.shadowBlur = 0;

      // Stats Panel Box
      const panelW = 280;
      const panelH = 100;
      const panelX = (CANVAS_WIDTH - panelW) / 2;
      const panelY = 152;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.beginPath();
      ctx.roundRect(panelX, panelY, panelW, panelH, 16);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Score Display
      ctx.font = '800 15px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('SCORE', CANVAS_WIDTH / 2 - 65, panelY + 36);

      ctx.font = '900 32px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(this.score.toString(), CANVAS_WIDTH / 2 - 65, panelY + 74);

      // Best Display
      ctx.font = '800 15px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('BEST', CANVAS_WIDTH / 2 + 65, panelY + 36);

      ctx.font = '900 32px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = this.isNewBest ? '#fbbf24' : '#ffffff';
      ctx.fillText(this.bestScore.toString(), CANVAS_WIDTH / 2 + 65, panelY + 74);

      if (this.isNewBest) {
        ctx.font = '800 11px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#fbbf24';
        ctx.fillText('★ NEW BEST ★', CANVAS_WIDTH / 2 + 65, panelY + 93);
      }

      // Pulsing "CLICK TO PLAY AGAIN" Button
      const pulse = 1.0 + Math.sin(timestamp * 0.006) * 0.035;
      const btn = this.restartBtnBounds;

      ctx.save();
      ctx.translate(CANVAS_WIDTH / 2, btn.y + btn.h / 2);
      ctx.scale(pulse, pulse);

      const btnGrad = ctx.createLinearGradient(0, -btn.h / 2, 0, btn.h / 2);
      btnGrad.addColorStop(0, '#0284c7');
      btnGrad.addColorStop(1, '#0369a1');

      ctx.shadowColor = 'rgba(56, 189, 248, 0.55)';
      ctx.shadowBlur = 14;
      ctx.fillStyle = btnGrad;
      ctx.beginPath();
      ctx.roundRect(-btn.w / 2, -btn.h / 2, btn.w, btn.h, 24);
      ctx.fill();

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.font = '800 16px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('CLICK TO PLAY AGAIN', 0, 1);
      ctx.restore();

      ctx.restore();
    }
  }

  // --------------------------------------------------------------------------
  // INITIALIZATION ON DOM READY
  // --------------------------------------------------------------------------
  window.addEventListener('DOMContentLoaded', () => {
    window.__bounceReturnGame = new BounceReturnGame();
  });
})();
