# Product spec: offline mode

Owner: Product, Arcwell | Status: Ready for build | Target: v4.2

## Problem

Field technicians lose signal in basements, plant rooms and rural sites. Today the Arcwell app shows a blank screen and loses any notes they started. Support logged 312 tickets about this last quarter.

## Goals

- Open the last 50 viewed work orders with no connection.
- Let technicians write notes and take photos offline, then sync automatically.
- Never lose work, even if the app is closed before it syncs.

## Non-goals

- Creating new work orders offline. Dispatch stays online-only for now.
- Offline maps.

## How it works

Work orders are cached in an encrypted local store when they are opened. Changes made offline are queued as events and replayed in order when the device reconnects.

```ts
type OfflineEvent = {
  id: string;
  workOrderId: string;
  kind: "note" | "photo" | "status";
  createdAt: string;
  payload: unknown;
};
```

## Requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| OFF-1 | Cache opened work orders for 14 days | Must |
| OFF-2 | Queue notes, photos and status changes offline | Must |
| OFF-3 | Show a clear offline banner and pending count | Must |
| OFF-4 | Resolve conflicts by keeping both notes | Should |

## Open questions

1. How large can the photo queue grow before we warn the technician?
2. Do customers need a setting to turn caching off for compliance reasons?
