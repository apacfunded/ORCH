// ============================================================
// BACKGROUND — the "commodity field".
// Thousands of particles drifting in a flow field, repelled by the cursor,
// tinted toward whichever commodity the user is hovering, over a slowly
// scrolling perspective "trading floor" grid. WebGL points with a canvas2D
// fallback; paused when the tab is hidden; static gradient under reduced motion.
// ============================================================
import { h } from "../lib/dom.js";
import { isMobile, reducedMotion } from "../lib/motion.js";
const hex = (s) => {
    const n = parseInt(s.replace("#", ""), 16);
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
};
const GOLD = hex("#e6b84a");
const SILVER = hex("#c7d1dc");
const CRIMSON = hex("#e0344a");
const PALETTE = [CRIMSON, CRIMSON, CRIMSON, CRIMSON, GOLD, SILVER, SILVER, hex("#9cff3d"), hex("#b5793f"), hex("#d08a7a"), hex("#5b4b8a")];
export function background() {
    const el = h("div", { id: "bg", "aria-hidden": "true" });
    const floor = h("canvas", { class: "floor" });
    const canvas = h("canvas", { class: "field" });
    const grain = h("div", { class: "grain" });
    el.append(floor, canvas, grain);
    if (reducedMotion()) {
        el.style.background = "radial-gradient(1200px 600px at 70% -10%, rgba(224,52,74,.14), transparent 60%), radial-gradient(800px 500px at 10% 100%, rgba(199,209,220,.06), transparent 60%)";
        canvas.remove();
        floor.remove();
        return { el, tint() { }, destroy() { } };
    }
    const count = isMobile() ? 900 : 2600;
    const px = new Float32Array(count * 2);
    const vel = new Float32Array(count * 2);
    const col = new Float32Array(count * 3);
    const base = new Float32Array(count * 3);
    const size = new Float32Array(count);
    let w = 1, hgt = 1, dpr = 1;
    let mouse = { x: -9999, y: -9999, active: false };
    let tintTarget = null;
    let tintAmt = 0;
    let tintCur = CRIMSON;
    let running = true;
    let raf = 0;
    let t0 = performance.now();
    const seed = () => {
        for (let i = 0; i < count; i++) {
            px[i * 2] = Math.random() * w;
            px[i * 2 + 1] = Math.random() * hgt;
            const c = PALETTE[Math.floor(Math.random() * PALETTE.length)];
            base[i * 3] = c.r;
            base[i * 3 + 1] = c.g;
            base[i * 3 + 2] = c.b;
            col[i * 3] = c.r;
            col[i * 3 + 1] = c.g;
            col[i * 3 + 2] = c.b;
            size[i] = (0.6 + Math.random() * 1.8) * dpr;
        }
    };
    const resize = () => {
        dpr = Math.min(2, window.devicePixelRatio || 1);
        w = window.innerWidth;
        hgt = window.innerHeight;
        canvas.width = w * dpr;
        canvas.height = hgt * dpr;
        floor.width = w * dpr;
        floor.height = hgt * dpr;
        if (gl)
            gl.viewport(0, 0, canvas.width, canvas.height);
    };
    // ---------- WebGL ----------
    const gl = canvas.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: true });
    let prog = null;
    let posBuf = null;
    let colBuf = null;
    let sizeBuf = null;
    let aPos = 0, aCol = 0, aSize = 0;
    let uRes = null;
    let uMouse = null;
    const ctx2d = gl ? null : canvas.getContext("2d");
    if (gl) {
        const vs = `attribute vec2 p; attribute vec3 c; attribute float s; uniform vec2 res; uniform vec3 mouse; varying vec3 vc; varying float va;
      void main(){ vec2 z = (p / res) * 2.0 - 1.0; gl_Position = vec4(z.x, -z.y, 0.0, 1.0);
      float d = distance(p, mouse.xy); float glow = mouse.z * smoothstep(220.0, 0.0, d);
      gl_PointSize = s * (1.0 + glow * 1.6); vc = c; va = 0.35 + glow * 0.6; }`;
        const fs = `precision mediump float; varying vec3 vc; varying float va;
      void main(){ vec2 q = gl_PointCoord - 0.5; float r = length(q); float a = smoothstep(0.5, 0.15, r) * va; gl_FragColor = vec4(vc * a, a); }`;
        const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
        prog = gl.createProgram();
        gl.attachShader(prog, mk(gl.VERTEX_SHADER, vs));
        gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(prog);
        gl.useProgram(prog);
        aPos = gl.getAttribLocation(prog, "p");
        aCol = gl.getAttribLocation(prog, "c");
        aSize = gl.getAttribLocation(prog, "s");
        uRes = gl.getUniformLocation(prog, "res");
        uMouse = gl.getUniformLocation(prog, "mouse");
        posBuf = gl.createBuffer();
        colBuf = gl.createBuffer();
        sizeBuf = gl.createBuffer();
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }
    resize();
    seed();
    // ---------- floor grid ----------
    let floorOff = 0;
    const drawFloor = (dt) => {
        const c = floor.getContext("2d");
        if (!c)
            return;
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.clearRect(0, 0, w, hgt);
        floorOff = (floorOff + dt * 0.02) % 40;
        const horizon = hgt * 0.62;
        const cx = w / 2;
        c.save();
        const g = c.createLinearGradient(0, horizon, 0, hgt);
        g.addColorStop(0, "rgba(224,52,74,0)");
        g.addColorStop(1, "rgba(224,52,74,0.07)");
        c.fillStyle = g;
        c.fillRect(0, horizon, w, hgt - horizon);
        c.strokeStyle = "rgba(224,52,74,0.08)";
        c.lineWidth = 1;
        // vertical lines converging
        for (let i = -14; i <= 14; i++) {
            c.beginPath();
            c.moveTo(cx + i * 28, horizon);
            c.lineTo(cx + i * 220, hgt + 40);
            c.stroke();
        }
        // horizontal lines moving toward viewer
        for (let k = 0; k < 14; k++) {
            const z = (k * 40 + floorOff) / (14 * 40);
            const y = horizon + Math.pow(z, 2.2) * (hgt - horizon + 40);
            c.globalAlpha = Math.min(1, z * 1.4);
            c.beginPath();
            c.moveTo(0, y);
            c.lineTo(w, y);
            c.stroke();
        }
        c.restore();
    };
    // ---------- step ----------
    const step = (now) => {
        raf = 0;
        if (!running)
            return;
        const dt = Math.min(50, now - t0);
        t0 = now;
        const tt = now * 0.00012;
        tintAmt += ((tintTarget ? 1 : 0) - tintAmt) * 0.04;
        if (tintTarget)
            tintCur = { r: tintCur.r + (tintTarget.r - tintCur.r) * 0.06, g: tintCur.g + (tintTarget.g - tintCur.g) * 0.06, b: tintCur.b + (tintTarget.b - tintCur.b) * 0.06 };
        for (let i = 0; i < count; i++) {
            let x = px[i * 2], y = px[i * 2 + 1];
            // flow field
            const a = Math.sin(x * 0.0021 + tt) * 1.7 + Math.cos(y * 0.0017 - tt * 1.3) * 1.3;
            vel[i * 2] += Math.cos(a) * 0.012 * dt;
            vel[i * 2 + 1] += Math.sin(a) * 0.012 * dt;
            // cursor repulsion
            if (mouse.active) {
                const dx = x - mouse.x, dy = y - mouse.y;
                const d2 = dx * dx + dy * dy;
                if (d2 < 160 * 160 && d2 > 1) {
                    const f = (1 - Math.sqrt(d2) / 160) * 0.9;
                    vel[i * 2] += (dx / Math.sqrt(d2)) * f;
                    vel[i * 2 + 1] += (dy / Math.sqrt(d2)) * f;
                }
            }
            vel[i * 2] *= 0.93;
            vel[i * 2 + 1] *= 0.93;
            x += vel[i * 2];
            y += vel[i * 2 + 1];
            if (x < -10)
                x = w + 10;
            else if (x > w + 10)
                x = -10;
            if (y < -10)
                y = hgt + 10;
            else if (y > hgt + 10)
                y = -10;
            px[i * 2] = x;
            px[i * 2 + 1] = y;
            col[i * 3] = base[i * 3] + (tintCur.r - base[i * 3]) * tintAmt * 0.8;
            col[i * 3 + 1] = base[i * 3 + 1] + (tintCur.g - base[i * 3 + 1]) * tintAmt * 0.8;
            col[i * 3 + 2] = base[i * 3 + 2] + (tintCur.b - base[i * 3 + 2]) * tintAmt * 0.8;
        }
        drawFloor(dt);
        if (gl && prog) {
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.uniform2f(uRes, w, hgt);
            gl.uniform3f(uMouse, mouse.x, mouse.y, mouse.active ? 1 : 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
            gl.bufferData(gl.ARRAY_BUFFER, px, gl.DYNAMIC_DRAW);
            gl.enableVertexAttribArray(aPos);
            gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
            gl.bufferData(gl.ARRAY_BUFFER, col, gl.DYNAMIC_DRAW);
            gl.enableVertexAttribArray(aCol);
            gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 0, 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuf);
            gl.bufferData(gl.ARRAY_BUFFER, size, gl.STATIC_DRAW);
            gl.enableVertexAttribArray(aSize);
            gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, 0, 0);
            gl.drawArrays(gl.POINTS, 0, count);
        }
        else if (ctx2d) {
            ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx2d.clearRect(0, 0, w, hgt);
            for (let i = 0; i < count; i++) {
                ctx2d.fillStyle = `rgba(${(col[i * 3] * 255) | 0},${(col[i * 3 + 1] * 255) | 0},${(col[i * 3 + 2] * 255) | 0},0.4)`;
                ctx2d.fillRect(px[i * 2], px[i * 2 + 1], size[i] / dpr, size[i] / dpr);
            }
        }
        raf = requestAnimationFrame(step);
    };
    const onMove = (e) => { mouse = { x: e.clientX, y: e.clientY, active: true }; };
    const onLeave = () => { mouse.active = false; };
    const onVis = () => {
        running = document.visibilityState === "visible";
        if (running && !raf) {
            t0 = performance.now();
            raf = requestAnimationFrame(step);
        }
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVis);
    raf = requestAnimationFrame(step);
    return {
        el,
        tint(color) { tintTarget = color ? hex(color) : null; },
        destroy() {
            running = false;
            if (raf)
                cancelAnimationFrame(raf);
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerleave", onLeave);
            window.removeEventListener("resize", resize);
            document.removeEventListener("visibilitychange", onVis);
        },
    };
}
