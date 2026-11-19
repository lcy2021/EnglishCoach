"use client";

import { useEffect, useRef } from "react";

type Pt = { x: number; y: number };
type Glyph = {
  ch: string;
  node: Text;
  offset: number;
  from: Pt;
  ctrl: Pt;
  delay: number;
  dur: number;
  rot: number;
  font: string;
};

const MAX_GLYPHS = 48;
const WAIT_FOR_TARGET_MS = 3000;

/**
 * Throw generated text from the coach panel into the page element that shows it.
 * `key` is a `data-deliver="<key>"` element; `text` is the generated field (used to find the exact characters).
 */
export function throwText(key: string, text: string) {
  window.dispatchEvent(new CustomEvent("english-coach:throw-text", { detail: { key, text } }));
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const bez = (a: Pt, c: Pt, b: Pt, t: number): Pt => ({
  x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
  y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t * t * b.y,
});

function charCenter(node: Text, offset: number): Pt | null {
  if (!node.isConnected || offset >= node.length) return null;
  const range = document.createRange();
  range.setStart(node, offset);
  range.setEnd(node, offset + 1);
  const r = range.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
}

/** Find the generated field inside the target element(s) and pick characters spread evenly across it. */
function pickChars(els: HTMLElement[], field: string): { ch: string; node: Text; offset: number }[] {
  const want = field.replace(/\s+/g, "");
  const view = document.querySelector(".stage")?.getBoundingClientRect();
  const all: { ch: string; node: Text; offset: number }[] = [];
  for (const el of els) {
    const slots: { ch: string; node: Text; offset: number }[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      for (let i = 0; i < node.data.length; i++) {
        if (!/\s/.test(node.data[i])) slots.push({ ch: node.data[i], node, offset: i });
      }
    }
    const at = want ? slots.map((s) => s.ch).join("").indexOf(want) : -1;
    const own = at >= 0 ? slots.slice(at, at + want.length) : slots;
    for (const item of own) {
      if (all.length >= 1500) break;
      if (!/[\p{L}\p{N}]/u.test(item.ch)) continue;
      const c = charCenter(item.node, item.offset);
      if (!c) continue;
      const top = view?.top ?? 0;
      const bottom = view?.bottom ?? window.innerHeight;
      if (c.y < top + 6 || c.y > bottom - 6 || c.x < 0 || c.x > window.innerWidth) continue;
      all.push(item);
    }
  }
  if (all.length <= MAX_GLYPHS) return all;
  return Array.from({ length: MAX_GLYPHS }, (_, i) => all[Math.floor(((i + 0.5) * all.length) / MAX_GLYPHS)]);
}

export function TextThrow() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let stopCurrent: (() => void) | null = null;

    const run = (key: string, text: string) => {
      stopCurrent?.();
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      // Hold the target back right away so it doesn't flash before the text arrives.
      const style = document.createElement("style");
      style.textContent = `[data-deliver="${key}"]:not([data-delivered]){visibility:hidden}`;
      document.head.appendChild(style);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;

      const begin = performance.now();
      let raf = 0;
      let els: HTMLElement[] = [];
      let glyphs: Glyph[] | null = null;
      let startAt = 0;
      let revealed = false;
      let revealedAt = 0;
      let cleanedUp = false;

      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        cancelAnimationFrame(raf);
        style.remove();
        document.querySelectorAll("[data-delivered]").forEach((el) => el.removeAttribute("data-delivered"));
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (stopCurrent === cleanup) stopCurrent = null;
      };
      stopCurrent = cleanup;

      const reveal = () => {
        if (revealed) return;
        revealed = true;
        revealedAt = performance.now();
        for (const el of els) {
          el.setAttribute("data-delivered", "");
          el.animate({ opacity: [0, 1] }, { duration: 220, easing: "ease-out" });
        }
        window.setTimeout(cleanup, 260);
      };

      const frame = (now: number) => {
        if (cleanedUp) return;
        if (!glyphs) {
          els = [...document.querySelectorAll<HTMLElement>(`[data-deliver="${key}"]`)];
          if (els.length === 0) {
            if (now - begin > WAIT_FOR_TARGET_MS) return cleanup();
            raf = requestAnimationFrame(frame);
            return;
          }
          const coach = document.querySelector(".coach")?.getBoundingClientRect();
          const origin = coach ?? new DOMRect(window.innerWidth - 40, window.innerHeight * 0.4, 30, window.innerHeight * 0.3);
          const picked = pickChars(els, text);
          glyphs = picked.map(({ ch, node, offset }) => {
            const to = charCenter(node, offset) ?? { x: origin.left, y: origin.top };
            const from: Pt = { x: origin.left + origin.width * rand(0.15, 0.8), y: origin.top + origin.height * rand(0.45, 0.85) };
            const cs = getComputedStyle(node.parentElement!);
            return {
              ch,
              node,
              offset,
              from,
              ctrl: { x: (from.x + to.x) / 2 + rand(-40, 40), y: Math.min(from.y, to.y) - rand(60, 160) },
              delay: rand(0, 0.5),
              dur: rand(0.5, 0.7),
              rot: rand(-1.2, 1.2),
              font: `700 ${cs.fontSize} ${cs.fontFamily}`,
            };
          });
          startAt = now;
          if (glyphs.length === 0) {
            reveal();
            return;
          }
        }

        const t = (now - startAt) / 1000;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        let landed = 0;
        for (const g of glyphs) {
          const k = Math.min(1, Math.max(0, (t - g.delay) / g.dur));
          if (k >= 1) landed++;
          if (t < g.delay) continue;
          // the target spot is re-read every frame so it stays correct while the page is still settling
          const to = charCenter(g.node, g.offset);
          if (!to) continue;
          const p = bez(g.from, g.ctrl, to, easeOut(k));
          const fade = revealedAt ? Math.max(0, 1 - (now - revealedAt) / 260) : 1;
          // comet trail: a few fading cyan -> violet sparks behind the glyph while it flies
          if (k < 1) {
            for (let i = 1; i <= 5; i++) {
              const tp = bez(g.from, g.ctrl, to, easeOut(Math.max(0, k - i * 0.04)));
              ctx.fillStyle = `hsla(${190 + i * 22},95%,65%,${0.5 - i * 0.09})`;
              ctx.beginPath();
              ctx.arc(tp.x, tp.y, 4.5 - i * 0.6, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(g.rot * (1 - k));
          const sc = 1 + 0.3 * (1 - k);
          ctx.scale(sc, sc);
          ctx.font = g.font;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.globalAlpha = fade;
          if (k < 1) {
            ctx.shadowColor = "#a78bfa";
            ctx.shadowBlur = 14;
          }
          // neon: white outline, cyan -> violet gradient fill
          const half = Math.max(10, parseFloat(g.font.split(" ")[1]) / 2);
          const grad = ctx.createLinearGradient(-half, -half, half, half);
          grad.addColorStop(0, "#06b6d4");
          grad.addColorStop(1, "#7c3aed");
          ctx.lineWidth = 4;
          ctx.lineJoin = "round";
          ctx.strokeStyle = "rgba(255,255,255,0.95)";
          ctx.strokeText(g.ch, 0, 0);
          ctx.shadowBlur = 0;
          ctx.fillStyle = grad;
          ctx.fillText(g.ch, 0, 0);
          ctx.restore();
        }
        if (!revealed && (landed === glyphs.length || t > 2)) {
          reveal();
        }
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    };

    const handler = (event: Event) => {
      const d = (event as CustomEvent<{ key: string; text: string }>).detail;
      if (d?.key) run(d.key, d.text ?? "");
    };
    window.addEventListener("english-coach:throw-text", handler);
    return () => {
      window.removeEventListener("english-coach:throw-text", handler);
      stopCurrent?.();
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-[60]" />;
}
