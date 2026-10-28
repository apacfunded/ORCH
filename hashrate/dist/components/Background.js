/** A ~3% film grain over the whole page: one small tiled SVG noise texture (static, cheap to composite), never an image file. */
export function mountGrain() {
    const c = document.createElement('div');
    c.id = 'grain';
    c.setAttribute('aria-hidden', 'true');
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 1 0'/></filter><rect width='180' height='180' filter='url(#n)'/></svg>`;
    c.style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    document.body.append(c);
}
/** Height of the sticky header, as a CSS variable the sticky sections offset by. */
export function trackChromeHeight() {
    const set = () => {
        const hdr = document.querySelector('.hdr');
        document.documentElement.style.setProperty('--chrome', `${hdr?.offsetHeight ?? 61}px`);
    };
    set();
    addEventListener('resize', set, { passive: true });
}
