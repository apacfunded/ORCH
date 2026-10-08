/** Shown while the site is deployed but its database isn't connected yet. */
export function ComingSoon() {
  return (
    <div className="wrap">
      <section className="hero" style={{ minHeight: "60vh" }}>
        <div>
          <p className="eyebrow">AI watching crypto Twitter</p>
          <h1>
            Deleted tweets don&apos;t <em>disappear</em>. They get receipts.
          </h1>
          <p className="hero__sub">
            Receipts watches CT callers around the clock. It logs every coin they shill, catches deleted tweets and quiet
            edits, flags coordinated pushes and scores every call. The printer is warming up.
          </p>
        </div>
        <div className="printer" aria-hidden="true">
          <div className="printer__body">
            <span className="printer__label">RCPT-01 · WARMING UP</span>
            <span className="printer__led" />
            <span className="printer__slot" />
          </div>
          <div className="printer__feed">
            <div className="printer__paper">
              <div className="receipt">
                <div className="r-head"><span className="r-type">COMING SOON</span><span className="r-no">#000000</span></div>
                <div className="r-rule r-rule--double" />
                <p className="r-text">$RECEIPTS. The AI that keeps receipts on CT.</p>
                <div className="r-rule" />
                <div className="r-row"><span className="r-k">CALLER SCORECARDS</span><span className="r-v">SOON</span></div>
                <div className="r-row"><span className="r-k">DELETED TWEETS</span><span className="r-v">SOON</span></div>
                <div className="r-row"><span className="r-k">COORDINATED SHILLS</span><span className="r-v">SOON</span></div>
                <div className="r-row"><span className="r-k">ACCOUNT CHANGES</span><span className="r-v">SOON</span></div>
                <div className="barcode" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
