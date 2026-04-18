/**
 * bg-canvas.js — Unified Animated Background System
 * Modes: 'popup' | 'block' | 'reward'
 * Usage: <script src="bg-canvas.js" data-bg-mode="block"></script>
 *
 * Listens for: window CustomEvent 'bg-mode-change' { detail: { mode } }
 * to hot-swap visual intensity without a page reload.
 */
(function () {
  'use strict';

  /* ── Mode configs ────────────────────────────────────────────────────── */
  const MODES = {
    popup: {
      blobCount: 4,
      particleCount: 38,
      blobOpacity: 0.09,
      particleOpacity: 0.33,
      glowColor: '34,211,238',
      accentColor: '139,92,246',
      speed: 0.19,
      blobSize: [90, 160],
    },
    block: {
      blobCount: 5,
      particleCount: 30,
      blobOpacity: 0.07,
      particleOpacity: 0.22,
      glowColor: '56,189,248',
      accentColor: '99,102,241',
      speed: 0.12,
      blobSize: [110, 200],
    },
    reward: {
      blobCount: 6,
      particleCount: 55,
      blobOpacity: 0.13,
      particleOpacity: 0.44,
      glowColor: '34,211,238',
      accentColor: '167,139,250',
      speed: 0.26,
      blobSize: [80, 150],
    },
  };

  /* ── Performance heuristic ───────────────────────────────────────────── */
  function isLowPerf() {
    const cores = navigator.hardwareConcurrency || 4;
    const mem   = navigator.deviceMemory || 8;
    return cores <= 2 || mem < 4;
  }

  /* ── Helpers ─────────────────────────────────────────────────────────── */
  function rand(min, max) { return min + Math.random() * (max - min); }

  /* ── Main init ───────────────────────────────────────────────────────── */
  function init() {
    const scriptEl = document.currentScript ||
      document.querySelector('script[data-bg-mode]');
    const rawMode  = (scriptEl && scriptEl.getAttribute('data-bg-mode')) || 'block';
    const initMode = MODES[rawMode] ? rawMode : 'block';

    /* Shared mutable config – blobs/particles read this every frame */
    let cfg = Object.assign({}, MODES[initMode]);
    const isPopup = initMode === 'popup';

    /* Live mode-swap (e.g. block → reward on timer end) */
    window.addEventListener('bg-mode-change', (e) => {
      const next = e.detail && e.detail.mode;
      if (MODES[next]) Object.assign(cfg, MODES[next]);
    });

    /* ── Canvas element ────────────────────────────────────────────────── */
    const canvas = document.createElement('canvas');
    canvas.id = 'bg-anim-canvas';
    Object.assign(canvas.style, {
      position: 'fixed', inset: '0', width: '100vw', height: '100vh',
      zIndex: '-10', pointerEvents: 'none', display: 'block',
    });
    document.body.insertBefore(canvas, document.body.firstChild);

    /* ── Grain overlay ─────────────────────────────────────────────────── */
    const grain = document.createElement('div');
    grain.id = 'bg-grain';
    /* Inline SVG turbulence noise – zero external requests */
    const noiseSvg =
      `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E` +
      `%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E` +
      `%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;
    Object.assign(grain.style, {
      position: 'fixed', inset: '0', zIndex: '-9', pointerEvents: 'none',
      opacity: '0.032',
      backgroundImage: noiseSvg,
      backgroundSize: '160px 160px',
    });
    document.body.insertBefore(grain, canvas.nextSibling);

    /* ── Static fallback for low-perf ─────────────────────────────────── */
    if (isLowPerf()) {
      canvas.style.background =
        `radial-gradient(ellipse at 30% 40%, rgba(${cfg.glowColor},0.18) 0%, transparent 60%),` +
        `radial-gradient(ellipse at 75% 65%, rgba(${cfg.accentColor},0.12) 0%, transparent 55%),` +
        `#0a0f1e`;
      return;
    }

    const ctx  = canvas.getContext('2d');
    let W = 0, H = 0;
    const mouse = { x: -9999, y: -9999 };
    let animId;

    function resize() {
      W = canvas.width  = canvas.offsetWidth  || window.innerWidth;
      H = canvas.height = canvas.offsetHeight || window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });

    /* Cursor tracking only on full-page screens */
    if (!isPopup) {
      window.addEventListener('mousemove', (e) => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
      }, { passive: true });
    }

    /* ── Blob class ──────────────────────────────────────────────────── */
    function makeBlob(initial) {
      return {
        x: rand(0, W || 800),
        y: initial ? rand(0, H || 600) : rand(-200, -50),
        r: rand(cfg.blobSize[0], cfg.blobSize[1]),
        vx: (Math.random() - 0.5) * cfg.speed,
        vy: (Math.random() - 0.5) * cfg.speed,
        color: Math.random() < 0.5 ? cfg.glowColor : cfg.accentColor,
        phase: rand(0, Math.PI * 2),
        phaseSpeed: rand(0.003, 0.007),
      };
    }

    function updateBlob(b) {
      b.phase += b.phaseSpeed;
      b.vx += (Math.random() - 0.5) * 0.008;
      b.vy += (Math.random() - 0.5) * 0.008;
      b.vx *= 0.998;
      b.vy *= 0.998;
      /* Soft cursor repulsion */
      if (!isPopup) {
        const dx = b.x - mouse.x, dy = b.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const repel = Math.max(0, 200 - dist) / 200;
        b.vx += (dx / dist) * repel * 0.16;
        b.vy += (dy / dist) * repel * 0.16;
      }
      b.x += b.vx;
      b.y += b.vy;
      const pad = b.r + 60;
      if (b.x < -pad) b.x = W + pad;
      if (b.x > W + pad) b.x = -pad;
      if (b.y < -pad) b.y = H + pad;
      if (b.y > H + pad) b.y = -pad;
    }

    function drawBlob(b) {
      const pulse  = 1 + 0.06 * Math.sin(b.phase);
      const radius = b.r * pulse;
      /* Use current cfg opacity so live mode-swap takes visual effect */
      const op  = cfg.blobOpacity;
      const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, radius);
      grad.addColorStop(0, `rgba(${b.color},${op})`);
      grad.addColorStop(1, `rgba(${b.color},0)`);
      ctx.beginPath();
      ctx.arc(b.x, b.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    /* ── Particle class ──────────────────────────────────────────────── */
    function makeParticle(initial) {
      return {
        x: rand(0, W || 800),
        y: initial ? rand(0, H || 600) : (H || 600) + 10,
        size: rand(0.8, 2.2),
        vx: (Math.random() - 0.5) * cfg.speed * 0.7,
        vy: -(0.18 + Math.random() * cfg.speed * 0.7),
        color: Math.random() < 0.6 ? cfg.glowColor : cfg.accentColor,
        baseAlpha: rand(0.08, cfg.particleOpacity),
        life: Math.random() * 300,            // stagger starts
        maxLife: rand(220, 500),
        currentAlpha: 0,
      };
    }

    function updateParticle(p) {
      p.life++;
      p.vx += (Math.random() - 0.5) * 0.012;
      p.vx *= 0.995;
      /* Cursor displacement: gentle attraction close-range, subtle push far-range */
      if (!isPopup) {
        const dx = mouse.x - p.x, dy = mouse.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist < 70) {
          /* Very close — slight push away for distortion effect */
          p.vx -= (dx / dist) * 0.04;
          p.vy -= (dy / dist) * 0.04;
        } else if (dist < 120) {
          /* Mid-range — soft drift toward cursor */
          p.vx += (dx / dist) * 0.04;
          p.vy += (dy / dist) * 0.04;
        }
      }
      p.x += p.vx;
      p.y += p.vy;
      const progress   = (p.life % p.maxLife) / p.maxLife;
      p.currentAlpha   = p.baseAlpha * Math.sin(progress * Math.PI);
      if (p.life >= p.maxLife ||
          p.y < -20 || p.x < -20 || p.x > W + 20) {
        Object.assign(p, makeParticle(false));
      }
    }

    function drawParticle(p) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.color},${p.currentAlpha})`;
      ctx.fill();
    }

    /* ── Cursor glow ring ────────────────────────────────────────────── */
    function drawCursorGlow() {
      if (isPopup || mouse.x < 0 || mouse.x > W) return;
      const grad = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 88);
      grad.addColorStop(0, `rgba(${cfg.glowColor},0.07)`);
      grad.addColorStop(1, `rgba(${cfg.glowColor},0)`);
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, 88, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    /* ── Object pools ────────────────────────────────────────────────── */
    const maxBlobs     = Math.max(...Object.values(MODES).map(m => m.blobCount));
    const maxParticles = Math.max(...Object.values(MODES).map(m => m.particleCount));
    const blobs     = Array.from({ length: maxBlobs },     (_, i) => makeBlob(true));
    const particles = Array.from({ length: maxParticles }, (_, i) => makeParticle(true));

    /* ── Render loop ─────────────────────────────────────────────────── */
    let lastTs = 0;
    function frame(ts) {
      const dt = ts - lastTs;
      lastTs   = ts;
      if (dt > 120) { animId = requestAnimationFrame(frame); return; }

      ctx.clearRect(0, 0, W, H);

      /* Base gradient */
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, '#090e1c');
      bg.addColorStop(1, '#0f172a');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      /* Draw active blobs only up to current cfg count */
      for (let i = 0; i < cfg.blobCount; i++) {
        updateBlob(blobs[i]);
        drawBlob(blobs[i]);
      }

      /* Draw active particles */
      for (let i = 0; i < cfg.particleCount; i++) {
        updateParticle(particles[i]);
        drawParticle(particles[i]);
      }

      drawCursorGlow();

      animId = requestAnimationFrame(frame);
    }

    /* Pause when tab hidden */
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        cancelAnimationFrame(animId);
      } else {
        lastTs = 0;
        animId = requestAnimationFrame(frame);
      }
    });

    animId = requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
