import json, base64, os, subprocess, time, sys
from playwright.sync_api import sync_playwright
os.chdir('/home/user/drip')
durs_audio = json.load(open('adur.json'))  # seconds
durs = []
for i, a in enumerate(durs_audio):
    extra = 0.9 if i in (0, 7) else 0.75
    d = a + extra
    if i == 5: d = max(d, 6.5)
    durs.append(int(d * 1000))
if durs[7] < 4000: durs[7] = 4000
os.makedirs('frames', exist_ok=True)
for f in os.listdir('frames'): os.remove('frames/' + f)
frames = []
with sync_playwright() as p:
    b = p.chromium.launch(args=['--disable-web-security', '--autoplay-policy=no-user-gesture-required'])
    ctx = b.new_context(viewport={'width': 1920, 'height': 1080}, device_scale_factor=1)
    pg = ctx.new_page()
    pg.goto('http://localhost:8000/stage.html')
    pg.wait_for_timeout(4500)
    cdp = ctx.new_cdp_session(pg)
    def on_frame(ev):
        n = len(frames)
        fn = f'frames/{n:05d}.jpg'
        open(fn, 'wb').write(base64.b64decode(ev['data']))
        frames.append((ev['metadata']['timestamp'], fn))
        try: cdp.send('Page.screencastFrameAck', {'sessionId': ev['sessionId']})
        except Exception: pass
    cdp.on('Page.screencastFrame', on_frame)
    cdp.send('Page.startScreencast', {'format': 'jpeg', 'quality': 92, 'maxWidth': 1920, 'maxHeight': 1080, 'everyNthFrame': 1})
    pg.wait_for_timeout(300)
    pg.evaluate('d => { window.run(d); }', durs)
    total = sum(durs)
    t_end = time.time() + total / 1000 + 4
    while time.time() < t_end:
        pg.wait_for_timeout(250)
        if pg.evaluate('!!window.done'):
            pg.wait_for_timeout(400); break
    marks = pg.evaluate('window.marks')
    cdp.send('Page.stopScreencast')
    b.close()
frames.sort()
t0 = frames[0][0]
json.dump({'durs': durs, 'marks': [(m / 1000 - t0) for m in marks], 'nframes': len(frames), 'span': frames[-1][0] - t0}, open('timing.json', 'w'))
with open('list.txt', 'w') as f:
    for i, (ts, fn) in enumerate(frames):
        nxt = frames[i + 1][0] if i + 1 < len(frames) else ts + 0.6
        f.write(f"file '{fn}'\nduration {max(0.001, nxt - ts):.4f}\n")
    f.write(f"file '{frames[-1][1]}'\n")
print(json.dumps(json.load(open('timing.json'))))
