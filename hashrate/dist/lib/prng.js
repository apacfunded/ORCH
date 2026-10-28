/** Seeded random numbers so demo data looks the same on every load. */
export function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
export const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
export const between = (r, a, b) => a + r() * (b - a);
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
/** Fake addresses: always start with "Demo" (valid base58, unlike "DEMO") so they're never mistaken for real ones. */
export function demoAddress(r, len = 44) {
    let s = 'Demo';
    while (s.length < len)
        s += B58[Math.floor(r() * 58)];
    return s;
}
