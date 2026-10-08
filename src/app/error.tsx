"use client";

/** Shown when a page fails on the server (e.g. the database isn't connected yet or is briefly unreachable). */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="wrap page">
      <div className="lockcard">
        <h1 style={{ margin: "0 0 10px", fontSize: 28 }}>The printer is jammed.</h1>
        <p className="dim" style={{ margin: "0 0 20px" }}>
          Receipts couldn&apos;t load this page just now. It&apos;s usually back within a minute.
        </p>
        <button type="button" className="btn btn--primary" onClick={() => reset()}>
          Try again
        </button>
      </div>
    </div>
  );
}
