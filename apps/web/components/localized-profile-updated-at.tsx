"use client";

import { useEffect, useState } from "react";

type LocalizedProfileUpdatedAtProps = {
  updatedAtIso: string;
  serverFallback: string;
  isRecent: boolean;
};

export function LocalizedProfileUpdatedAt({
  updatedAtIso,
  serverFallback,
  isRecent,
}: LocalizedProfileUpdatedAtProps) {
  const [display, setDisplay] = useState(serverFallback);

  useEffect(() => {
    const parsed = new Date(updatedAtIso);
    if (Number.isNaN(parsed.getTime())) return;

    try {
      const formatter = new Intl.DateTimeFormat(
        undefined,
        isRecent
          ? { dateStyle: "medium", timeStyle: "short" }
          : { dateStyle: "long" },
      );
      setDisplay(formatter.format(parsed));
    } catch {
      // Keep the server fallback if the browser cannot format it.
    }
  }, [updatedAtIso, isRecent]);

  return <>{display}</>;
}
