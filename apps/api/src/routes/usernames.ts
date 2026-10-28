import { Router } from "express";
import { eq } from "drizzle-orm";

import { getDbOrThrow } from "@opendocs/shared/db/guards";
import { usernames } from "@opendocs/shared/db/schema";
import { RESERVED_USERNAMES, normalizeUsername, usernameSchema } from "@opendocs/shared/usernames";

const router = Router();

router.get("/usernames/check", async (req, res, next) => {
  try {
    const rawUsername = (req.query.username as string) ?? "";
    const normalized = normalizeUsername(rawUsername);
    const parsed = usernameSchema.safeParse(normalized);

    if (!parsed.success) {
      res.json({
        available: false,
        normalized,
        reason: "invalid",
      });
      return;
    }

    if (RESERVED_USERNAMES.has(normalized)) {
      res.json({
        available: false,
        normalized,
        reason: "reserved",
      });
      return;
    }

    const database = getDbOrThrow();
    const [existing] = await database
      .select({ id: usernames.id })
      .from(usernames)
      .where(eq(usernames.normalizedUsername, normalized))
      .limit(1);

    res.json({
      available: !existing,
      normalized,
      reason: null,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
