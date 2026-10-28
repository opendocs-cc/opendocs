/**
 * Starting text for the free tools. Short, and each one shows off what the
 * renderer does well (tables, callouts, code), so the first click on
 * Publish or Convert gives something worth sharing.
 */

export const PUBLISH_SAMPLE = `# Launch checklist

A short plan for shipping the new onboarding flow on Thursday.

> [!NOTE]
> Edit this text, or paste your own Markdown, then press Publish. You get a link anyone can open for 24 hours.

## Owners

| Task | Owner | Status |
| --- | --- | --- |
| Final copy review | Maya | Done |
| Load test the signup API | Jonas | In progress |
| Announcement post | Priya | Not started |

## Rollout

1. Ship behind the \`new_onboarding\` flag.
2. Turn it on for 10% of signups and watch the funnel.
3. Go to 100% if completion holds.

\`\`\`bash
opendocs publish launch-checklist.md --export pdf
\`\`\`
`;

export const AI_ANSWER_SAMPLE = `## Comparing three ways to store user sessions

Here's a quick comparison of the common options, with a recommendation at the end.

| Option | Speed | Scales across servers | Revocation |
| --- | --- | --- | --- |
| Signed cookies | Fast | Yes | Hard |
| Database table | Moderate | Yes | Easy |
| Redis | Fast | Yes | Easy |

### When to pick each

- **Signed cookies** suit small apps with no need to log people out remotely.
- **A database table** is the simplest choice when you already run Postgres.
- **Redis** is worth it once session reads show up in your latency budget.

\`\`\`ts
// Express + Redis, with a 7-day expiry
app.use(session({
  store: new RedisStore({ client: redis }),
  secret: process.env.SESSION_SECRET,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 },
}));
\`\`\`

**Recommendation:** start with the database table, and move to Redis when you need to.
`;

export const README_SAMPLE = `# tinyqueue

A small, fast job queue for Node.js backed by Postgres.

## Install

\`\`\`bash
npm install tinyqueue
\`\`\`

## Usage

\`\`\`js
import { Queue } from "tinyqueue";

const queue = new Queue(process.env.DATABASE_URL);
await queue.add("send-email", { to: "dana@example.com" });
queue.work("send-email", async (job) => sendEmail(job.data));
\`\`\`

## Options

| Option | Default | Description |
| --- | --- | --- |
| \`concurrency\` | \`1\` | Jobs processed at once |
| \`retries\` | \`3\` | Attempts before a job fails |
| \`backoff\` | \`"exponential"\` | Delay between attempts |

## License

MIT
`;

export const TABLE_SAMPLE = `| Region | Q1 | Q2 | Q3 | Change |
| :--- | ---: | ---: | ---: | :---: |
| North America | $1.20M | $1.35M | $1.52M | +27% |
| Europe | $0.84M | $0.91M | $1.02M | +21% |
| Asia Pacific | $0.47M | $0.58M | $0.71M | +51% |
| **Total** | **$2.51M** | **$2.84M** | **$3.25M** | **+29%** |
`;

/** True when the text has a GitHub-style table (a header and a separator row). */
export function hasMarkdownTable(markdown: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/m.test(markdown);
}
