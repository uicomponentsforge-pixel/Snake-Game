/* ==========================================================================
   Snake — Arcade Edition
   Vanilla JS, canvas-rendered, no dependencies.
   Structured as a single IIFE so nothing leaks into the global scope.
   ========================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   *  Constants
   * ------------------------------------------------------------------ */

  const GRID_SIZE = 20;          // 20 x 20 playable cells
  const BASE_RESOLUTION = 480;   // logical canvas pixels (before DPR scaling)
  const CELL = BASE_RESOLUTION / GRID_SIZE;

  const DIFFICULTY = {
    easy:   { start: 170, min: 95,  step: 6, threshold: 60 },
    normal: { start: 135, min: 68,  step: 7, threshold: 50 },
    hard:   { start: 105, min: 52,  step: 8, threshold: 40 },
  };

  const POINTS_PER_FOOD = 10;
  const FOODS_PER_MULTIPLIER_STEP = 5; // every N foods, score multiplier rises
  const MAX_MULTIPLIER = 4;

  const DIRS = {
    up:    { x: 0, y: -1 },
    down:  { x: 0, y: 1 },
    left:  { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  const KEY_TO_DIR = {
    ArrowUp: 'up', w: 'up', W: 'up',
    ArrowDown: 'down', s: 'down', S: 'down',
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
  };

  const HIGH_SCORE_KEY = 'snakeArcade.highScore';
  const SOUND_KEY = 'snakeArcade.soundOn';

  /* ------------------------------------------------------------------ *
   *  DOM references
   * ------------------------------------------------------------------ */

  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');

  const scoreEl = document.getElementById('score');
  const highScoreEl = document.getElementById('highScore');
  const speedTierEl = document.getElementById('speedTier');

  const difficultySelect = document.getElementById('difficulty');
  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const restartBtn = document.getElementById('restartBtn');
  const soundToggle = document.getElementById('soundToggle');

  const idleOverlay = document.getElementById('idleOverlay');
  const pauseOverlay = document.getElementById('pauseOverlay');
  const countdownOverlay = document.getElementById('countdownOverlay');
  const countdownNumber = document.getElementById('countdownNumber');
  const gameOverOverlay = document.getElementById('gameOverOverlay');
  const finalScoreEl = document.getElementById('finalScore');
  const finalHighScoreEl = document.getElementById('finalHighScore');
  const newHighScoreBanner = document.getElementById('newHighScoreBanner');

  const dpad = document.querySelector('.dpad');

  /* ------------------------------------------------------------------ *
   *  Mutable game state (kept in one object to avoid stray globals)
   * ------------------------------------------------------------------ */

  const state = {
    snake: [],
    prevSnake: [],
    direction: DIRS.right,
    directionQueue: [],
    food: null,
    score: 0,
    highScore: 0,
    foodsEaten: 0,
    multiplier: 1,
    speedTier: 1,
    moveInterval: DIFFICULTY.normal.start,
    difficulty: 'normal',
    running: false,
    paused: false,
    gameOver: false,
    counting: false,
    particles: [],
    accumulator: 0,
    lastTime: 0,
  };

  /* ------------------------------------------------------------------ *
   *  Sound engine (Web Audio API — no external audio files)
   * ------------------------------------------------------------------ */

  const sound = (function createSoundEngine() {
    let ctxAudio = null;
    let enabled = localStorage.getItem(SOUND_KEY) !== 'off';

    function getContext() {
      if (!ctxAudio) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        ctxAudio = new AudioCtx();
      }
      if (ctxAudio.state === 'suspended') ctxAudio.resume();
      return ctxAudio;
    }

    function tone(freq, duration, type, startGain, delay) {
      if (!enabled) return;
      const audioCtx = getContext();
      const t0 = audioCtx.currentTime + (delay || 0);
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(startGain || 0.18, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.02);
    }

    return {
      eat() {
        tone(660, 0.08, 'square', 0.15);
        tone(880, 0.09, 'square', 0.12, 0.05);
      },
      gameOver() {
        tone(330, 0.18, 'sawtooth', 0.16);
        tone(220, 0.22, 'sawtooth', 0.14, 0.14);
        tone(140, 0.3, 'sawtooth', 0.12, 0.3);
      },
      click() {
        tone(500, 0.05, 'triangle', 0.1);
      },
      highScore() {
        [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, 'square', 0.13, i * 0.09));
      },
      isEnabled() {
        return enabled;
      },
      setEnabled(value) {
        enabled = value;
        localStorage.setItem(SOUND_KEY, enabled ? 'on' : 'off');
      },
    };
  })();

  /* ------------------------------------------------------------------ *
   *  Setup: canvas resolution (device-pixel-ratio aware for crispness)
   * ------------------------------------------------------------------ */

  function setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = BASE_RESOLUTION * dpr;
    canvas.height = BASE_RESOLUTION * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ------------------------------------------------------------------ *
   *  High score persistence
   * ------------------------------------------------------------------ */

  function loadHighScore() {
    const stored = parseInt(localStorage.getItem(HIGH_SCORE_KEY), 10);
    state.highScore = Number.isFinite(stored) ? stored : 0;
    highScoreEl.textContent = state.highScore;
  }

  function saveHighScoreIfNeeded() {
    if (state.score > state.highScore) {
      state.highScore = state.score;
      localStorage.setItem(HIGH_SCORE_KEY, String(state.highScore));
      return true;
    }
    return false;
  }

  /* ------------------------------------------------------------------ *
   *  Game setup / reset
   * ------------------------------------------------------------------ */

  function resetState() {
    const mid = Math.floor(GRID_SIZE / 2);
    state.snake = [
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid },
      { x: mid - 3, y: mid },
    ];
    state.prevSnake = state.snake.map((seg) => ({ ...seg }));
    state.direction = DIRS.right;
    state.directionQueue = [];
    state.score = 0;
    state.foodsEaten = 0;
    state.multiplier = 1;
    state.speedTier = 1;
    state.particles = [];
    state.accumulator = 0;

    const settings = DIFFICULTY[state.difficulty];
    state.moveInterval = settings.start;

    state.running = false;
    state.paused = false;
    state.gameOver = false;
    state.counting = false;

    state.food = spawnFood();

    updateHud();
  }

  function spawnFood() {
    const occupied = new Set(state.snake.map((seg) => `${seg.x},${seg.y}`));
    const freeCells = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        const key = `${x},${y}`;
        if (!occupied.has(key)) freeCells.push({ x, y });
      }
    }
    // Board full (snake fills every cell) — extremely unlikely, but handle gracefully.
    if (freeCells.length === 0) return null;
    return freeCells[Math.floor(Math.random() * freeCells.length)];
  }

  /* ------------------------------------------------------------------ *
   *  HUD updates
   * ------------------------------------------------------------------ */

  function updateHud() {
    scoreEl.textContent = state.score;
    highScoreEl.textContent = state.highScore;
    speedTierEl.textContent = `×${state.speedTier}`;
  }

  function bumpStat(el) {
    el.classList.remove('bump');
    // Force reflow so the animation can retrigger on consecutive foods.
    void el.offsetWidth;
    el.classList.add('bump');
  }

  /* ------------------------------------------------------------------ *
   *  Input handling
   * ------------------------------------------------------------------ */

  function queueDirection(dirName) {
    const proposed = DIRS[dirName];
    if (!proposed) return;

    const reference =
      state.directionQueue.length > 0
        ? state.directionQueue[state.directionQueue.length - 1]
        : state.direction;

    const isOpposite = proposed.x === -reference.x && proposed.y === -reference.y;
    const isSame = proposed.x === reference.x && proposed.y === reference.y;

    if (isOpposite || isSame) return;
    if (state.directionQueue.length >= 2) return;

    state.directionQueue.push(proposed);

    // Any directional input while idle starts the game.
    if (!state.running && !state.gameOver && !state.counting) {
      beginCountdown();
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === ' ') {
      e.preventDefault();
      togglePause();
      return;
    }
    if (e.key === 'Enter' && state.gameOver) {
      e.preventDefault();
      restartGame();
      return;
    }
    const dirName = KEY_TO_DIR[e.key];
    if (dirName) {
      e.preventDefault();
      if (state.paused || state.gameOver) return;
      queueDirection(dirName);
    }
  });

  dpad.addEventListener('click', (e) => {
    const btn = e.target.closest('.dpad-btn');
    if (!btn) return;
    if (state.paused || state.gameOver) return;
    queueDirection(btn.dataset.dir);
  });

  /* ------------------------------------------------------------------ *
   *  Flow control: start / pause / restart / countdown
   * ------------------------------------------------------------------ */

  function beginCountdown() {
    if (state.counting || state.running) return;
    state.counting = true;
    idleOverlay.classList.add('overlay--hidden');
    countdownOverlay.classList.remove('overlay--hidden');

    let count = 3;
    countdownNumber.textContent = count;
    sound.click();

    const tick = () => {
      count -= 1;
      if (count > 0) {
        countdownNumber.textContent = count;
        countdownNumber.style.animation = 'none';
        void countdownNumber.offsetWidth;
        countdownNumber.style.animation = '';
        setTimeout(tick, 650);
      } else {
        countdownOverlay.classList.add('overlay--hidden');
        launchGame();
      }
    };
    setTimeout(tick, 650);
  }

  function launchGame() {
    state.counting = false;
    state.running = true;
    state.paused = false;
    state.accumulator = 0;
    state.lastTime = performance.now();
    startBtn.disabled = true;
    startBtn.textContent = '▶ Running';
    pauseBtn.disabled = false;
    difficultySelect.disabled = true;
  }

  function togglePause() {
    if (!state.running || state.gameOver || state.counting) return;
    state.paused = !state.paused;
    pauseBtn.textContent = state.paused ? '▶ Resume' : '⏸ Pause';
    pauseOverlay.classList.toggle('overlay--hidden', !state.paused);
    sound.click();
    if (!state.paused) {
      // Avoid a large delta jump after resuming.
      state.lastTime = performance.now();
      state.accumulator = 0;
    }
  }

  function endGame() {
    state.running = false;
    state.gameOver = true;
    sound.gameOver();

    const isNewHigh = saveHighScoreIfNeeded();
    updateHud();

    finalScoreEl.textContent = state.score;
    finalHighScoreEl.textContent = state.highScore;
    newHighScoreBanner.classList.toggle('overlay--hidden', !isNewHigh);
    if (isNewHigh) {
      setTimeout(() => sound.highScore(), 250);
    }

    gameOverOverlay.classList.remove('overlay--hidden');

    startBtn.disabled = false;
    startBtn.textContent = '▶ Start';
    pauseBtn.disabled = true;
    pauseBtn.textContent = '⏸ Pause';
    difficultySelect.disabled = false;
  }

  function restartGame() {
    sound.click();
    gameOverOverlay.classList.add('overlay--hidden');
    pauseOverlay.classList.add('overlay--hidden');
    idleOverlay.classList.remove('overlay--hidden');
    resetState();
    startBtn.disabled = false;
    startBtn.textContent = '▶ Start';
    pauseBtn.disabled = true;
  }

  /* ------------------------------------------------------------------ *
   *  Simulation step (runs once per moveInterval)
   * ------------------------------------------------------------------ */

  function step() {
    if (state.directionQueue.length > 0) {
      state.direction = state.directionQueue.shift();
    }

    state.prevSnake = state.snake.map((seg) => ({ ...seg }));

    const head = state.snake[0];
    const newHead = { x: head.x + state.direction.x, y: head.y + state.direction.y };

    // Wall collision.
    if (newHead.x < 0 || newHead.x >= GRID_SIZE || newHead.y < 0 || newHead.y >= GRID_SIZE) {
      endGame();
      return;
    }

    // Self collision. The tail cell is about to move away unless the snake
    // is growing this tick, so it's excluded from the check in that case.
    const willGrow = state.food && newHead.x === state.food.x && newHead.y === state.food.y;
    const bodyToCheck = willGrow ? state.snake : state.snake.slice(0, -1);
    const hitsSelf = bodyToCheck.some((seg) => seg.x === newHead.x && seg.y === newHead.y);
    if (hitsSelf) {
      endGame();
      return;
    }

    state.snake.unshift(newHead);

    if (willGrow) {
      handleFoodEaten();
    } else {
      state.snake.pop();
    }
  }

  function handleFoodEaten() {
    state.foodsEaten += 1;
    state.multiplier = Math.min(
      MAX_MULTIPLIER,
      1 + Math.floor(state.foodsEaten / FOODS_PER_MULTIPLIER_STEP)
    );
    state.score += POINTS_PER_FOOD * state.multiplier;

    spawnParticles(state.food);
    sound.eat();

    state.food = spawnFood();
    if (!state.food) {
      // Snake fills the entire board — the player has "won".
      endGame();
      return;
    }

    applySpeedRamp();
    updateHud();
    bumpStat(scoreEl);
  }

  function applySpeedRamp() {
    const settings = DIFFICULTY[state.difficulty];
    const tier = Math.min(
      Math.floor((settings.start - settings.min) / settings.step) + 1,
      Math.floor(state.score / settings.threshold) + 1
    );
    if (tier !== state.speedTier) {
      state.speedTier = tier;
      bumpStat(speedTierEl);
    }
    state.moveInterval = Math.max(settings.min, settings.start - (tier - 1) * settings.step);
  }

  /* ------------------------------------------------------------------ *
   *  Particles (food-eaten pop effect)
   * ------------------------------------------------------------------ */

  function spawnParticles(cell) {
    const cx = cell.x * CELL + CELL / 2;
    const cy = cell.y * CELL + CELL / 2;
    const colors = ['#ff6b81', '#ffc466', '#5eead4'];
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI * 2 * i) / 10 + Math.random() * 0.4;
      const speed = 1.4 + Math.random() * 1.8;
      state.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 2.5 + Math.random() * 2,
        alpha: 1,
        color: colors[i % colors.length],
      });
    }
  }

  function updateParticles() {
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.alpha -= 0.045;
      if (p.alpha <= 0) state.particles.splice(i, 1);
    }
  }

  /* ------------------------------------------------------------------ *
   *  Rendering
   * ------------------------------------------------------------------ */

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function drawGrid() {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.lineWidth = 1;
    for (let i = 1; i < GRID_SIZE; i++) {
      const pos = i * CELL;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, BASE_RESOLUTION);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(BASE_RESOLUTION, pos);
      ctx.stroke();
    }
  }

  function drawFood() {
    if (!state.food) return;
    const cx = state.food.x * CELL + CELL / 2;
    const cy = state.food.y * CELL + CELL / 2;
    const pulse = 1 + Math.sin(performance.now() / 180) * 0.08;
    const r = (CELL / 2 - 4) * pulse;

    ctx.save();
    ctx.shadowColor = 'rgba(255, 107, 129, 0.75)';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#ff6b81';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Small highlight for a glossy look.
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.arc(cx - r * 0.35, cy - r * 0.35, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function roundedRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawSnake(t) {
    const len = state.snake.length;
    for (let i = len - 1; i >= 0; i--) {
      const seg = state.snake[i];
      const prev = state.prevSnake[i] || seg;
      const x = lerp(prev.x, seg.x, t) * CELL;
      const y = lerp(prev.y, seg.y, t) * CELL;

      const isHead = i === 0;
      const fade = 1 - (i / len) * 0.45; // tail gently darkens
      const pad = isHead ? 1.5 : 2.5;

      ctx.save();
      if (isHead) {
        ctx.shadowColor = 'rgba(94, 234, 212, 0.65)';
        ctx.shadowBlur = 14;
        ctx.fillStyle = '#5eead4';
      } else {
        ctx.fillStyle = `rgba(94, 234, 212, ${fade.toFixed(2)})`;
      }
      roundedRect(x + pad, y + pad, CELL - pad * 2, CELL - pad * 2, isHead ? 8 : 6);
      ctx.fill();
      ctx.restore();

      if (isHead) {
        drawEyes(x, y);
      }
    }
  }

  function drawEyes(x, y) {
    const dir = state.direction;
    const eyeOffset = CELL * 0.22;
    const cx = x + CELL / 2;
    const cy = y + CELL / 2;

    // Perpendicular offset so the two eyes sit side-by-side relative to travel direction.
    const perpX = -dir.y;
    const perpY = dir.x;

    const forwardX = cx + dir.x * eyeOffset;
    const forwardY = cy + dir.y * eyeOffset;

    ctx.fillStyle = '#0d0b16';
    [-1, 1].forEach((side) => {
      const ex = forwardX + perpX * eyeOffset * 0.6 * side;
      const ey = forwardY + perpY * eyeOffset * 0.6 * side;
      ctx.beginPath();
      ctx.arc(ex, ey, 1.8, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawParticles() {
    state.particles.forEach((p) => {
      ctx.save();
      ctx.globalAlpha = Math.max(p.alpha, 0);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function render(t) {
    ctx.clearRect(0, 0, BASE_RESOLUTION, BASE_RESOLUTION);
    drawGrid();
    drawFood();
    drawSnake(t);
    drawParticles();
  }

  /* ------------------------------------------------------------------ *
   *  Main loop
   * ------------------------------------------------------------------ */

  function loop(timestamp) {
    requestAnimationFrame(loop);

    if (!state.lastTime) state.lastTime = timestamp;
    const delta = timestamp - state.lastTime;
    state.lastTime = timestamp;

    if (state.running && !state.paused && !state.gameOver) {
      state.accumulator += delta;
      while (state.accumulator >= state.moveInterval) {
        step();
        state.accumulator -= state.moveInterval;
        if (!state.running) {
          state.accumulator = 0;
          break;
        }
      }
      updateParticles();
      const t = state.running ? state.accumulator / state.moveInterval : 1;
      render(t);
    } else {
      updateParticles();
      render(1);
    }
  }

  /* ------------------------------------------------------------------ *
   *  Button wiring
   * ------------------------------------------------------------------ */

  startBtn.addEventListener('click', () => {
    if (state.running || state.counting || state.gameOver) return;
    sound.click();
    beginCountdown();
  });

  pauseBtn.addEventListener('click', togglePause);

  restartBtn.addEventListener('click', restartGame);

  difficultySelect.addEventListener('change', (e) => {
    state.difficulty = e.target.value;
    if (!state.running) {
      resetState();
    }
  });

  soundToggle.addEventListener('click', () => {
    const next = !sound.isEnabled();
    sound.setEnabled(next);
    soundToggle.setAttribute('aria-pressed', String(next));
    if (next) sound.click();
  });

  /* ------------------------------------------------------------------ *
   *  Init
   * ------------------------------------------------------------------ */

  function init() {
    setupCanvas();
    loadHighScore();
    soundToggle.setAttribute('aria-pressed', String(sound.isEnabled()));
    state.difficulty = difficultySelect.value;
    resetState();
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', setupCanvas);

  init();
})();
