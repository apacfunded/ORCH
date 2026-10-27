/** Deterministic PRNG (mulberry32) so demo data and screenshots are reproducible. */
export class PRNG {
    constructor(seed) {
        this.s = seed >>> 0;
    }
    next() {
        let t = (this.s += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    range(min, max) {
        return min + (max - min) * this.next();
    }
    int(min, max) {
        return Math.floor(this.range(min, max + 1));
    }
    pick(arr) {
        return arr[Math.floor(this.next() * arr.length)];
    }
    /** Approximately normal, mean 0, sd 1. */
    gauss() {
        let u = 0;
        let v = 0;
        while (u === 0)
            u = this.next();
        while (v === 0)
            v = this.next();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
    chance(p) {
        return this.next() < p;
    }
}
export function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
