import "dotenv/config";
import { deleteExpiredAnonymousDocs } from "@opendocs/shared/anonymous/service";
import { deleteExpiredBridgeRecords } from "@opendocs/shared/custom-domains/bridge";
import { recheckDueCustomDomains } from "@opendocs/shared/custom-domains/service";
import { registerTelegramWebhook } from "@opendocs/shared/notifications/telegram";
import { createApp } from "./app";
import { createInternalApp } from "./internal";

const port = parseInt(process.env.PORT ?? "4000", 10);
const app = createApp();

app.listen(port, () => {
  console.log(`OpenDocs API server running on port ${port}`);
});

// Internal endpoints (Caddy's tls-ask) on a port that's never published or
// proxied; see src/internal.ts.
const internalPort = parseInt(process.env.INTERNAL_PORT ?? "4001", 10);
createInternalApp().listen(internalPort, () => {
  console.log(`OpenDocs internal server running on port ${internalPort}`);
});

// The owner's Telegram bot (signup and payment notifications); a no-op
// unless TELEGRAM_* is set and this is production.
void registerTelegramWebhook(process.env.API_URL);

// Anonymous docs are hidden as soon as they expire (reads check
// `expires_at`); this sweep just reclaims the rows.
const ANONYMOUS_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
function sweepExpiredAnonymousDocs() {
  deleteExpiredAnonymousDocs()
    .then((count) => {
      if (count > 0) console.log(`[anonymous] Deleted ${count} expired document(s).`);
    })
    .catch((err) => console.error("[anonymous] Cleanup failed:", err));
}
sweepExpiredAnonymousDocs();
setInterval(sweepExpiredAnonymousDocs, ANONYMOUS_CLEANUP_INTERVAL_MS).unref();

// Custom domains: each domain's DNS is re-checked every 6 hours (three
// failures in a row stop it serving; see custom-domains/service.ts). The
// loop wakes every 15 minutes, with jitter, and checks whatever is due, so
// restarts and deploys don't reset anyone's schedule. One API instance runs
// in production; a second one would only check some domains twice.
const CUSTOM_DOMAIN_LOOP_MS = 15 * 60 * 1000;
function checkCustomDomains() {
  recheckDueCustomDomains()
    .then((summary) => {
      if (summary.checked > 0) {
        console.log(
          `[custom-domains] Checked ${summary.checked}: ${summary.activated} activated, ${summary.recovered} recovered, ${summary.misconfigured} misconfigured.`,
        );
      }
    })
    .catch((err) => console.error("[custom-domains] Re-check failed:", err))
    .then(() => deleteExpiredBridgeRecords())
    .catch((err) => console.error("[custom-domains] Clean-up failed:", err))
    .finally(() => {
      const jitter = Math.round((Math.random() - 0.5) * 5 * 60 * 1000);
      setTimeout(checkCustomDomains, CUSTOM_DOMAIN_LOOP_MS + jitter).unref();
    });
}
setTimeout(checkCustomDomains, 30_000 + Math.round(Math.random() * 60_000)).unref();
