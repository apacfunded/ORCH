"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReceiptDTO } from "@/lib/dto";
import type { Tier } from "@/lib/gate";
import { ReceiptCard } from "./ReceiptCard";

const TABS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "deleted", label: "Deleted" },
  { key: "edits", label: "Edits" },
  { key: "shills", label: "Coordinated" },
  { key: "calls", label: "Calls" },
  { key: "accounts", label: "Accounts" },
];

const POLL_MS = 20_000;

interface FeedResponse {
  items: ReceiptDTO[];
  locked: number;
  tier: Tier;
  delayMinutes: number;
}

export function FeedClient(props: { initialItems: ReceiptDTO[]; initialLocked: number; tier: Tier; delayMinutes: number; gateOpen: boolean }) {
  const [filter, setFilter] = useState("all");
  const [items, setItems] = useState(props.initialItems);
  const [locked, setLocked] = useState(props.initialLocked);
  const [tier, setTier] = useState<Tier>(props.tier);
  const [hasMore, setHasMore] = useState(props.initialItems.length >= 30);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offline, setOffline] = useState(false);
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const load = useCallback(async (f: string, before?: number): Promise<FeedResponse | null> => {
    try {
      const qs = new URLSearchParams({ filter: f });
      if (before) qs.set("before", String(before));
      const res = await fetch(`/api/feed?${qs}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setOffline(false);
      return (await res.json()) as FeedResponse;
    } catch {
      setOffline(true);
      return null;
    }
  }, []);

  // Poll for new receipts and merge them on top.
  useEffect(() => {
    const id = setInterval(async () => {
      if (document.hidden) return;
      const f = filterRef.current;
      const data = await load(f);
      if (!data || filterRef.current !== f) return;
      setTier(data.tier);
      setLocked(data.locked);
      setItems((prev) => {
        const top = prev[0]?.id ?? 0;
        const fresh = data.items.filter((i) => i.id > top);
        return fresh.length ? [...fresh, ...prev] : prev;
      });
    }, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  async function changeFilter(f: string) {
    if (f === filter) return;
    setFilter(f);
    const data = await load(f);
    if (!data) return;
    setItems(data.items);
    setLocked(data.locked);
    setHasMore(data.items.length >= 30);
  }

  async function loadMore() {
    const last = items[items.length - 1];
    if (!last) return;
    setLoadingMore(true);
    const data = await load(filter, last.id);
    setLoadingMore(false);
    if (!data) return;
    setItems((prev) => [...prev, ...data.items]);
    setHasMore(data.items.length >= 30);
  }

  const live = tier !== "public";

  return (
    <section className="feed" aria-labelledby="feed-title">
      <div className="feed__bar">
        <h2 id="feed-title" className="feed__title">
          Feed
          <span className={`badge ${live ? "badge--live" : "badge--delayed"}`}>
            {live ? "LIVE" : `DELAYED ${props.delayMinutes} MIN`}
          </span>
        </h2>
        <div className="tabs" role="tablist" aria-label="Filter receipts">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={filter === t.key}
              className={`tab${filter === t.key ? " tab--on" : ""}`}
              onClick={() => changeFilter(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {!live && locked > 0 ? (
        <p className="locked">
          <span className="locked__icon" aria-hidden="true" />
          {locked} newer {locked === 1 ? "receipt is" : "receipts are"} live for holders now.{" "}
          {props.gateOpen
            ? `Hold $RECEIPTS and connect your wallet to see them, or wait ${props.delayMinutes} minutes.`
            : `Everyone sees them after ${props.delayMinutes} minutes. Live access opens to holders at launch.`}
        </p>
      ) : null}
      {offline ? <p className="feed__note" role="status">Reconnecting… showing the last receipts we loaded.</p> : null}

      {items.length === 0 ? (
        <div className="empty">
          <p className="empty__title">No receipts here yet.</p>
          <p className="empty__body">The worker checks the watchlist every few minutes. New receipts print here automatically.</p>
        </div>
      ) : (
        <div className="feed__grid">
          {items.map((item) => (
            <ReceiptCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {hasMore && items.length > 0 ? (
        <div className="feed__more">
          <button type="button" className="btn btn--ghost" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load older receipts"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
