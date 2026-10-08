import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import type { ReceiptDTO } from "@/lib/dto";
import { receiptLines } from "@/lib/receipt-lines";

export const IMAGE_SIZE = { width: 1200, height: 630 };

const FONT_DIR = path.join(process.cwd(), "node_modules", "@fontsource", "ibm-plex-mono", "files");
let fonts: Promise<{ name: string; data: ArrayBuffer; weight: 400 | 600; style: "normal" }[]> | null = null;

function loadFonts() {
  fonts ??= Promise.all(
    ([400, 600] as const).map(async (weight) => {
      const buf = await readFile(path.join(FONT_DIR, `ibm-plex-mono-latin-${weight}-normal.woff`));
      return { name: "Plex", data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, weight, style: "normal" as const };
    }),
  );
  return fonts;
}

const INK = "#0b0b0b";
const MUTED = "#5a5a55";
const PAPER = "#f2f2f0";
const STAMP = "#e0344a";

// Deterministic bar widths for the barcode strip.
const BARS = [3, 1, 2, 1, 4, 1, 1, 2, 3, 1, 2, 2, 1, 3, 1, 1, 4, 2, 1, 2, 3, 1, 1, 2, 1, 4, 1, 2, 2, 1, 3, 1, 2, 1, 1, 3, 2, 1, 4, 1];

/** 1200×630 PNG of a receipt (or a "holders only" card while it is still locked). */
export async function renderReceiptImage(item: ReceiptDTO | null, lockedMinutes?: number): Promise<ImageResponse> {
  const f = await loadFonts();
  if (!item) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: INK, color: PAPER, fontFamily: "Plex" }}>
          <div style={{ display: "flex", fontSize: 28, letterSpacing: 6, color: "#a3a39e" }}>RECEIPTS</div>
          <div style={{ display: "flex", fontSize: 54, fontWeight: 600, marginTop: 24 }}>Holders are reading this one now.</div>
          <div style={{ display: "flex", fontSize: 30, marginTop: 18, color: "#a3a39e" }}>
            {lockedMinutes ? `Unlocks for everyone in ${lockedMinutes} min.` : "Unlocks for everyone soon."}
          </div>
        </div>
      ),
      { ...IMAGE_SIZE, fonts: f, headers: { "cache-control": "public, max-age=60" } },
    );
  }

  const l = receiptLines(item);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: INK, fontFamily: "Plex" }}>
        <div style={{ position: "absolute", left: 48, top: 40, display: "flex", fontSize: 22, letterSpacing: 6, color: "#a3a39e" }}>RECEIPTS</div>
        <div style={{ position: "absolute", right: 48, top: 40, display: "flex", fontSize: 22, color: "#a3a39e" }}>$RECEIPTS</div>
        <div style={{ width: 760, display: "flex", flexDirection: "column", background: PAPER, color: INK, padding: "30px 36px 26px", position: "relative" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26 }}>
            <div style={{ display: "flex", fontWeight: 600, letterSpacing: 3, color: l.stamp === "DELETED" || l.label.startsWith("COORD") ? STAMP : INK }}>{l.label}</div>
            <div style={{ display: "flex", color: MUTED }}>{l.number}</div>
          </div>
          <div style={{ display: "flex", borderTop: `5px double ${INK}`, marginTop: 12, marginBottom: 14 }} />
          {l.who ? <div style={{ display: "flex", fontSize: 26, fontWeight: 600, marginBottom: 6 }}>{l.who}</div> : null}
          {l.text ? (
            <div style={{ display: "flex", fontSize: 23, lineHeight: 1.4, color: l.struck ? "#3a3a37" : INK, whiteSpace: "pre-wrap", maxHeight: 132, overflow: "hidden" }}>{l.text}</div>
          ) : null}
          <div style={{ display: "flex", borderTop: "2px dashed #b9b9b3", marginTop: 14, marginBottom: 10 }} />
          {l.rows.map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 21, padding: "3px 0" }}>
              <div style={{ display: "flex", color: MUTED }}>{k}</div>
              <div style={{ display: "flex", fontWeight: 600 }}>{v}</div>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 14 }}>
            <div style={{ display: "flex", fontSize: 18, color: MUTED }}>{l.time}</div>
            <div style={{ display: "flex", height: 34, alignItems: "stretch" }}>
              {BARS.map((w, i) => (
                <div key={i} style={{ display: "flex", width: w * 2, marginRight: 2, background: i % 2 ? "transparent" : INK }} />
              ))}
            </div>
          </div>
          {l.stamp ? (
            <div style={{ position: "absolute", right: 40, top: 92, display: "flex", fontSize: l.stamp.length > 8 ? 26 : 40, fontWeight: 600, letterSpacing: 6, color: STAMP, border: `5px solid ${STAMP}`, borderRadius: 6, padding: "8px 16px", transform: "rotate(-8deg)", opacity: 0.9 }}>
              {l.stamp}
            </div>
          ) : null}
        </div>
      </div>
    ),
    { ...IMAGE_SIZE, fonts: f, headers: { "cache-control": "public, max-age=3600, s-maxage=86400" } },
  );
}
