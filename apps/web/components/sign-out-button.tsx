"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        setIsPending(true);
        startTransition(async () => {
          await authClient.signOut();
          router.push("/");
          router.refresh();
          setIsPending(false);
        });
      }}
      style={{
        border: "1px solid var(--od-border)",
        borderRadius: "999px",
        background: "rgba(255,255,255,0.8)",
        padding: "0.65rem 0.9rem",
        cursor: "pointer",
        color: "var(--od-text)",
      }}
    >
      {isPending ? "Signing out..." : "Sign out"}
    </button>
  );
}
