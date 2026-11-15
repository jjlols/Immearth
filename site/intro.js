export function startIntro({ sound = true, focusAfter = "#overview-title" } = {}) {
  const intro = document.querySelector("#intro");
  if (!intro) return;

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const forced = matchMedia("(forced-colors: active)").matches;
  if (reduce || forced) {
    intro.remove();
    return;
  }

  const canvas = document.querySelector("#intro-canvas");
  const skip = document.querySelector("#intro-skip");
  const ctx2d = canvas.getContext("2d");
  const root = document.querySelector("#root");
  const held = root
    ? [...root.children].filter((el) => el !== intro && !el.contains(intro))
    : [document.querySelector(".site-header"), document.querySelector("main"), document.querySelector(".site-footer")];
  held.forEach((el) => {
    if (el) el.inert = true;
  });
  document.documentElement.style.overflow = "hidden";
  skip.focus();

  const collapseAt = 1.2;
  const collapseFor = 0.8;
  const fallFor = 0.36;
  const revealFor = 1.45;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let angle = 0;
  let started = performance.now();
  let frame = 0;
  let played = false;
  const fallStart = collapseAt + collapseFor;
  const impactTime = fallStart + fallFor;
  let leaving = false;
  let audio;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function layout() {
    const globe = Math.min(width, height) * 0.22;
    const gap = Math.min(96, height * 0.12);
    const top = (height - (globe * 2 + gap)) / 2;
    return {
      cx: width / 2,
      cy: top + globe,
      globe,
      waterY: top + globe * 2 + gap,
      line: Math.min(width * 0.4, 440),
    };
  }

  function project(lat, lon, scale, box) {
    const cosLat = Math.cos(lat);
    const x = Math.cos(lon + angle) * cosLat * scale;
    const y = Math.sin(lat) * scale;
    const z = Math.sin(lon + angle) * cosLat * scale;
    return {
      x: box.cx + x * box.globe,
      y: box.cy - y * box.globe,
      z,
    };
  }

  function stroke(a, b, alpha) {
    ctx2d.beginPath();
    ctx2d.moveTo(a.x, a.y);
    ctx2d.lineTo(b.x, b.y);
    ctx2d.strokeStyle = `rgba(158, 206, 255, ${alpha})`;
    ctx2d.stroke();
  }

  function globeMesh(box, scale) {
    const segments = [];
    const step = Math.PI / 28;
    for (let lat = -60; lat <= 60; lat += 30) {
      const phi = (lat * Math.PI) / 180;
      for (let lon = 0; lon < Math.PI * 2; lon += step) {
        const a = project(phi, lon, scale, box);
        const b = project(phi, lon + step, scale, box);
        segments.push([a, b]);
      }
    }
    for (let lon = 0; lon < Math.PI * 2; lon += Math.PI / 4) {
      for (let phi = -Math.PI / 2; phi < Math.PI / 2; phi += step) {
        const a = project(phi, lon, scale, box);
        const b = project(phi + step, lon, scale, box);
        segments.push([a, b]);
      }
    }
    segments.sort((p, q) => (p[0].z + p[1].z) - (q[0].z + q[1].z));
    ctx2d.lineWidth = 1;
    segments.forEach(([a, b]) => {
      const z = (a.z + b.z) / 2;
      stroke(a, b, (0.1 + Math.max(0, z) * 0.62) * scale);
    });
    for (let lat = -60; lat <= 60; lat += 30) {
      for (let lon = 0; lon < Math.PI * 2; lon += Math.PI / 4) {
        const p = project((lat * Math.PI) / 180, lon, scale, box);
        if (p.z < 0) continue;
        ctx2d.beginPath();
        ctx2d.arc(p.x, p.y, 1.7, 0, Math.PI * 2);
        ctx2d.fillStyle = `rgba(232, 244, 255, ${0.45 + p.z * 0.55})`;
        ctx2d.fill();
      }
    }
  }

  function unlock() {
    if (!sound) return null;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audio) audio = new Ctx();
    if (audio.state === "suspended") audio.resume();
    return audio;
  }

  function playDrop() {
    const sound = unlock();
    if (!sound || sound.state !== "running" || played) return;
    played = true;
    const t = sound.currentTime;
    const body = sound.createOscillator();
    const bodyGain = sound.createGain();
    body.type = "sine";
    body.frequency.setValueAtTime(620, t);
    body.frequency.exponentialRampToValueAtTime(196, t + 0.18);
    bodyGain.gain.setValueAtTime(0.0001, t);
    bodyGain.gain.exponentialRampToValueAtTime(0.2, t + 0.012);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.46);
    body.connect(bodyGain).connect(sound.destination);
    body.start(t);
    body.stop(t + 0.48);

    const tick = sound.createOscillator();
    const tickGain = sound.createGain();
    tick.type = "sine";
    tick.frequency.setValueAtTime(1280, t);
    tick.frequency.exponentialRampToValueAtTime(640, t + 0.05);
    tickGain.gain.setValueAtTime(0.0001, t);
    tickGain.gain.exponentialRampToValueAtTime(0.07, t + 0.004);
    tickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    tick.connect(tickGain).connect(sound.destination);
    tick.start(t);
    tick.stop(t + 0.08);
  }

  function onKey(event) {
    if (event.key === "Escape" || event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      finish(true);
      return;
    }
    unlock();
  }

  function releasePage() {
    held.forEach((el) => {
      if (el) el.inert = false;
    });
    document.documentElement.style.overflow = "";
  }

  function finish(focusPage) {
    if (leaving) return;
    leaving = true;
    cancelAnimationFrame(frame);
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", resize);
    releasePage();
    intro.classList.add("is-leaving");
    window.setTimeout(() => {
      if (intro.isConnected) intro.remove();
      const target = focusPage && document.querySelector(focusAfter);
      if (target) {
        if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
        target.focus();
      }
    }, 680);
  }

  function draw(now) {
    if (leaving) return;
    try {
      drawFrame(now);
    } catch (_) {
      finish(true);
    }
  }

  function drawFrame(now) {
    const t = (now - started) / 1000;
    const dt = Math.min(0.05, (now - (draw.last || now)) / 1000);
    draw.last = now;
    const collapsing = Math.min(1, Math.max(0, (t - collapseAt) / collapseFor));
    const eased = collapsing * collapsing * (3 - 2 * collapsing);
    const scale = 1 - eased;
    const falling = Math.min(1, Math.max(0, (t - fallStart) / fallFor));
    angle += 1.15 * (1 - eased) * dt;

    const box = layout();
    ctx2d.clearRect(0, 0, width, height);
    ctx2d.fillStyle = "#071018";
    ctx2d.fillRect(0, 0, width, height);

    if (scale > 0.05) globeMesh(box, scale);

    const dotY = box.cy + (box.waterY - box.cy) * falling * falling;
    if (scale < 0.4 || falling > 0) {
      ctx2d.beginPath();
      ctx2d.arc(box.cx, scale > 0.05 ? box.cy : dotY, 2.6, 0, Math.PI * 2);
      ctx2d.fillStyle = "#eaf4ff";
      ctx2d.fill();
    }

    const lineFade = t < impactTime ? 0.7 : Math.max(0, 1 - (t - impactTime) / 0.45);
    if (lineFade > 0) {
      ctx2d.beginPath();
      ctx2d.moveTo(box.cx - box.line / 2, box.waterY);
      ctx2d.lineTo(box.cx + box.line / 2, box.waterY);
      ctx2d.strokeStyle = `rgba(158, 206, 255, ${lineFade})`;
      ctx2d.lineWidth = 1;
      ctx2d.stroke();
    }

    if (t >= impactTime && !played && t - impactTime < 0.6) playDrop();

    if (t >= impactTime) {
      const grow = Math.min(1, (t - impactTime) / revealFor);
      const open = 1 - Math.pow(1 - grow, 3);
      const radius = open * Math.hypot(width, height);
      ctx2d.save();
      ctx2d.globalCompositeOperation = "destination-out";
      const inner = Math.max(0, radius - 48);
      if (radius > inner) {
        const wash = ctx2d.createRadialGradient(box.cx, box.waterY, inner, box.cx, box.waterY, Math.max(radius, inner + 1));
        wash.addColorStop(0, "rgba(0,0,0,1)");
        wash.addColorStop(1, "rgba(0,0,0,0)");
        ctx2d.fillStyle = wash;
        ctx2d.beginPath();
        ctx2d.arc(box.cx, box.waterY, radius, 0, Math.PI * 2);
        ctx2d.fill();
      }
      ctx2d.restore();

      for (let i = 0; i < 3; i += 1) {
        const age = (t - impactTime - i * 0.12) / 1.15;
        if (age <= 0 || age >= 1) continue;
        const ripple = 1 - Math.pow(1 - age, 3);
        ctx2d.beginPath();
        ctx2d.ellipse(box.cx, box.waterY, ripple * box.line * 0.95, ripple * 18 + 2, 0, 0, Math.PI * 2);
        ctx2d.strokeStyle = `rgba(186, 224, 255, ${(1 - age) * 0.8})`;
        ctx2d.lineWidth = 1;
        ctx2d.stroke();
      }

      ctx2d.beginPath();
      ctx2d.arc(box.cx, box.waterY, Math.max(1, radius * 0.96), 0, Math.PI * 2);
      ctx2d.strokeStyle = `rgba(214, 236, 255, ${1 - grow})`;
      ctx2d.lineWidth = 1.25;
      ctx2d.stroke();

      if (grow >= 1) {
        finish(false);
        return;
      }
    }

    frame = requestAnimationFrame(draw);
  }

  function onPointer(event) {
    if (event.target === skip) return;
    finish(true);
  }
  function onSkip() {
    finish(true);
  }

  resize();
  unlock();
  window.addEventListener("resize", resize);
  intro.addEventListener("pointerdown", onPointer);
  window.addEventListener("keydown", onKey);
  skip.addEventListener("click", onSkip);
  frame = requestAnimationFrame(draw);
  return function stopIntro() {
    if (leaving) return;
    leaving = true;
    cancelAnimationFrame(frame);
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", resize);
    intro.removeEventListener("pointerdown", onPointer);
    skip.removeEventListener("click", onSkip);
    releasePage();
  };
}
