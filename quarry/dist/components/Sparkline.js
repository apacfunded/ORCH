// Lightweight canvas sparkline. Throttled to ~4 fps, paused off-screen or when the tab is hidden.
import { h, whenVisible } from "../lib/dom.js";
import { reducedMotion } from "../lib/motion.js";
export function sparkline(values, opts = {}) {
    const el = h("canvas", { class: `spark ${opts.cls ?? ""}`.trim(), "aria-hidden": "true" });
    let data = values.slice(-60);
    let target = [...data];
    let shown = [...data];
    let color = opts.color ?? "#e6b84a";
    let visible = false;
    let raf = 0;
    let last = 0;
    let dirty = true;
    const draw = () => {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = el.clientWidth || 80;
        const hgt = el.clientHeight || 30;
        if (el.width !== w * dpr || el.height !== hgt * dpr) {
            el.width = w * dpr;
            el.height = hgt * dpr;
        }
        const ctx = el.getContext("2d");
        if (!ctx)
            return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, hgt);
        if (shown.length < 2)
            return;
        const min = Math.min(...shown);
        const max = Math.max(...shown);
        const span = max - min || max * 0.01 || 1;
        const pad = 3;
        const px = (i) => (i / (shown.length - 1)) * w;
        const py = (v) => hgt - pad - ((v - min) / span) * (hgt - pad * 2);
        const up = shown[shown.length - 1] >= shown[0];
        const c = color === "auto" ? (up ? "#58d68d" : "#ff8a5c") : color;
        ctx.beginPath();
        ctx.moveTo(px(0), py(shown[0]));
        for (let i = 1; i < shown.length; i++) {
            const x0 = px(i - 1), y0 = py(shown[i - 1]), x1 = px(i), y1 = py(shown[i]);
            const cx = (x0 + x1) / 2;
            ctx.bezierCurveTo(cx, y0, cx, y1, x1, y1);
        }
        if (opts.fill !== false) {
            const g = ctx.createLinearGradient(0, 0, 0, hgt);
            g.addColorStop(0, c + "55");
            g.addColorStop(1, c + "00");
            ctx.lineTo(w, hgt);
            ctx.lineTo(0, hgt);
            ctx.closePath();
            ctx.fillStyle = g;
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(px(0), py(shown[0]));
            for (let i = 1; i < shown.length; i++) {
                const x0 = px(i - 1), y0 = py(shown[i - 1]), x1 = px(i), y1 = py(shown[i]);
                const cx = (x0 + x1) / 2;
                ctx.bezierCurveTo(cx, y0, cx, y1, x1, y1);
            }
        }
        ctx.strokeStyle = c;
        ctx.lineWidth = 1.6;
        ctx.lineJoin = "round";
        if (opts.glow) {
            ctx.shadowColor = c;
            ctx.shadowBlur = 8;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        // head dot
        ctx.beginPath();
        ctx.arc(px(shown.length - 1), py(shown[shown.length - 1]), 2, 0, Math.PI * 2);
        ctx.fillStyle = c;
        ctx.fill();
    };
    const loop = (t) => {
        raf = 0;
        if (!visible)
            return;
        // ease shown -> target so new points slide in
        let moving = false;
        if (!reducedMotion()) {
            for (let i = 0; i < target.length; i++) {
                const d = target[i] - (shown[i] ?? target[i]);
                if (Math.abs(d) > Math.abs(target[i]) * 1e-5)
                    moving = true;
                shown[i] = (shown[i] ?? target[i]) + d * 0.35;
            }
            shown.length = target.length;
        }
        else {
            shown = [...target];
        }
        if (dirty || moving) {
            if (t - last > 240) {
                draw();
                last = t;
                dirty = false;
            }
            raf = requestAnimationFrame(loop);
        }
    };
    const kick = () => {
        if (visible && !raf)
            raf = requestAnimationFrame(loop);
    };
    const stopVis = whenVisible(el, (v) => {
        visible = v;
        if (v) {
            dirty = true;
            kick();
        }
    });
    return {
        el,
        push(v) {
            target.push(v);
            if (target.length > 60) {
                target.shift();
                shown.shift();
            }
            dirty = true;
            kick();
        },
        setData(vs) {
            target = vs.slice(-60);
            if (shown.length !== target.length)
                shown = [...target];
            dirty = true;
            kick();
        },
        setColor(c) {
            color = c;
            dirty = true;
            kick();
        },
        destroy() {
            stopVis();
            if (raf)
                cancelAnimationFrame(raf);
        },
    };
}
