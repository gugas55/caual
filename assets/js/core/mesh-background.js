// Rede de pontos e linhas ao fundo das páginas, como na Hotel Solutions, em
// azul CAUAL. É só decoração: fica atrás do conteúdo, não apanha o rato e os
// leitores de ecrã ignoram-na. Os pontos derivam devagar; com o rato por
// perto afastam-se um pouco e forma-se à volta do cursor uma coroa de
// ligações num azul mais claro.
//
// Orçamento: canvas 2D, até 100 pontos (36 em ecrãs táteis); 60 fps enquanto
// o rato se mexe, 30 fps parado, nada com o separador escondido. Com
// "reduzir movimento" desenha uma imagem fixa.
(() => {
  if (window.__meshBackground) return;
  window.__meshBackground = true;

  const BASE = "0, 96, 158"; // #00609E
  const GLOW = "38, 146, 214"; // azul claro da coroa do cursor

  const AREA_PER_NODE = 17000;
  const MIN_NODES = 18;
  const MAX_NODES = 100;
  const MAX_NODES_TOUCH = 36;
  const LINK_DISTANCE = 150;
  const LINE_ALPHA = 0.17;
  const NODE_ALPHA = 0.42;
  const NODE_RADIUS = 1.7;
  const POINTER_RADIUS = 170;
  const POINTER_LINE_ALPHA = 0.42;
  const REPEL_RADIUS = 95;
  const REPEL_FORCE = 0.12;
  const FRICTION = 0.94;
  const MIN_SPEED = 0.05;
  const MAX_SPEED = 0.16;
  const IDLE_AFTER_MS = 3000;
  const MAX_DPR = 1.5;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const coarsePointer = window.matchMedia("(pointer: coarse)");
  const pointer = { x: 0, y: 0, active: false, lastMove: 0 };

  let canvas;
  let ctx;
  let nodes = [];
  let width = 0;
  let height = 0;
  let frameId = 0;
  let lastFrame = 0;
  let resizeTimer = 0;

  const random = (min, max) => min + Math.random() * (max - min);

  function createNode(x, y) {
    const angle = random(0, Math.PI * 2);
    const speed = random(MIN_SPEED, MAX_SPEED);
    return { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, kx: 0, ky: 0 };
  }

  function targetCount() {
    const max = coarsePointer.matches ? MAX_NODES_TOUCH : MAX_NODES;
    return Math.round(Math.min(max, Math.max(MIN_NODES, (width * height) / AREA_PER_NODE)));
  }

  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const count = targetCount();
    nodes = nodes.filter((n) => n.x <= width && n.y <= height).slice(0, count);
    while (nodes.length < count) nodes.push(createNode(random(0, width), random(0, height)));
  }

  function step(frames) {
    for (const n of nodes) {
      if (pointer.active) {
        const dx = n.x - pointer.x;
        const dy = n.y - pointer.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0 && dist < REPEL_RADIUS) {
          const push = (1 - dist / REPEL_RADIUS) * REPEL_FORCE;
          n.kx += (dx / dist) * push;
          n.ky += (dy / dist) * push;
        }
      }
      n.kx *= Math.pow(FRICTION, frames);
      n.ky *= Math.pow(FRICTION, frames);
      n.x += (n.vx + n.kx) * frames;
      n.y += (n.vy + n.ky) * frames;
      if (n.x < -20) n.x = width + 20;
      else if (n.x > width + 20) n.x = -20;
      if (n.y < -20) n.y = height + 20;
      else if (n.y > height + 20) n.y = -20;
    }
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 1;

    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        if (Math.abs(dx) > LINK_DISTANCE || Math.abs(dy) > LINK_DISTANCE) continue;
        const dist = Math.hypot(dx, dy);
        if (dist > LINK_DISTANCE) continue;

        let alpha = (1 - dist / LINK_DISTANCE) * LINE_ALPHA;
        let color = BASE;
        if (pointer.active) {
          const mx = (a.x + b.x) / 2 - pointer.x;
          const my = (a.y + b.y) / 2 - pointer.y;
          const near = 1 - Math.hypot(mx, my) / POINTER_RADIUS;
          if (near > 0) {
            alpha += near * POINTER_LINE_ALPHA * (1 - dist / LINK_DISTANCE);
            color = GLOW;
          }
        }
        ctx.strokeStyle = `rgba(${color}, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    ctx.fillStyle = `rgba(${BASE}, ${NODE_ALPHA})`;
    for (const n of nodes) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, NODE_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function loop(now) {
    frameId = requestAnimationFrame(loop);
    const idle = !pointer.active || now - pointer.lastMove > IDLE_AFTER_MS;
    const minGap = idle ? 1000 / 30 : 1000 / 60;
    const elapsed = now - lastFrame;
    if (elapsed < minGap - 1) return;
    const frames = lastFrame ? Math.min(elapsed / (1000 / 60), 3) : 1;
    lastFrame = now;
    step(frames);
    draw();
  }

  function start() {
    cancelAnimationFrame(frameId);
    lastFrame = 0;
    if (reduceMotion.matches) {
      draw();
      return;
    }
    frameId = requestAnimationFrame(loop);
  }

  function init() {
    canvas = document.createElement("canvas");
    canvas.className = "mesh-canvas";
    canvas.setAttribute("aria-hidden", "true");
    ctx = canvas.getContext("2d");
    if (!ctx) return;
    document.body.prepend(canvas);
    fit();
    draw();
    setTimeout(() => {
      canvas.style.transition = "opacity 1.4s ease";
      canvas.style.opacity = "1";
    }, 30);
    start();

    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { fit(); draw(); }, 150);
    });

    window.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch") return;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.active = true;
      pointer.lastMove = performance.now();
    }, { passive: true });

    document.addEventListener("pointerleave", () => { pointer.active = false; });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) cancelAnimationFrame(frameId);
      else start();
    });

    reduceMotion.addEventListener?.("change", start);
  }

  if (document.body) init();
  else document.addEventListener("DOMContentLoaded", init);
})();
