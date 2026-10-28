"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

import { authClient } from "@/lib/auth-client";

export function InviteSignOutButton({ invitePath }: { invitePath: string }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        setIsPending(true);
        startTransition(async () => {
          await authClient.signOut();
          router.push(invitePath);
          router.refresh();
        });
      }}
      disabled={isPending}
      style={{
        border: 0,
        borderRadius: "8px",
        background: "var(--od-accent)",
        color: "#fff",
        cursor: isPending ? "default" : "pointer",
        fontWeight: 600,
        padding: "0.75rem 1rem",
      }}
    >
      {isPending ? "Signing out..." : "Sign out and accept invite"}
    </button>
  );
}
