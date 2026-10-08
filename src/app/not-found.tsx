import Link from "next/link";

export default function NotFound() {
  return (
    <div className="wrap page">
      <div className="lockcard">
        <h1 style={{ margin: "0 0 10px", fontSize: 28 }}>No receipt for that.</h1>
        <p className="dim" style={{ margin: "0 0 20px" }}>The page or account isn&apos;t here. It may have been renamed.</p>
        <Link className="btn btn--primary" href="/">Back to the feed</Link>
      </div>
    </div>
  );
}
