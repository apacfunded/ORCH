// ============================================================
// SHARED SUBSCRIPTION MANAGER
// Ref-counted channels so 30 cards share one upstream subscription
// instead of opening 30 sockets. Emits are batched per animation frame.
// ============================================================
export class SubscriptionHub {
    constructor() {
        this.channels = new Map();
    }
    /**
     * Subscribe to a keyed channel. `open` is called once when the first listener
     * joins and must return a teardown; it is called when the last listener leaves.
     */
    subscribe(key, open, listener) {
        let ch = this.channels.get(key);
        if (!ch) {
            const created = { listeners: new Set(), pending: [], scheduled: false, teardown: null };
            ch = created;
            this.channels.set(key, created);
            created.teardown = open((v) => this.emit(key, v));
        }
        ch.listeners.add(listener);
        return () => {
            const c = this.channels.get(key);
            if (!c)
                return;
            c.listeners.delete(listener);
            if (c.listeners.size === 0) {
                c.teardown?.();
                this.channels.delete(key);
            }
        };
    }
    emit(key, value) {
        const ch = this.channels.get(key);
        if (!ch)
            return;
        ch.pending.push(value);
        if (ch.scheduled)
            return;
        ch.scheduled = true;
        const flush = () => {
            ch.scheduled = false;
            const batch = ch.pending;
            ch.pending = [];
            // Only the latest value per frame matters for price-like streams,
            // but trades must all be delivered. Deliver all; listeners are cheap.
            for (const v of batch)
                for (const l of ch.listeners)
                    l(v);
        };
        if (typeof requestAnimationFrame === "function" && document.visibilityState === "visible") {
            requestAnimationFrame(flush);
        }
        else {
            setTimeout(flush, 16);
        }
    }
    listenerCount(key) {
        return this.channels.get(key)?.listeners.size ?? 0;
    }
}
export const hub = new SubscriptionHub();
