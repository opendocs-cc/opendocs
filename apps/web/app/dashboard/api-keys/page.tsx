import type { Metadata } from "next";
import { Suspense } from "react";

import { requireServerSession } from "@/lib/auth/session";
import { listApiKeys } from "@opendocs/shared/api-keys/service";

import { formatDate } from "@/lib/format-date";

import { ApiKeysClient } from "./api-keys-client";

export const metadata: Metadata = { title: "API keys" };

function ApiKeysSkeleton() {
  return (
    <div className="w-full min-h-full">
      <div className="max-w-[1000px] mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-10 flex flex-col gap-[32px]">
        <div className="flex flex-col md:flex-row gap-8">
          <div className="md:w-[280px] shrink-0">
            <div className="h-[30px] bg-gray-100 rounded w-32 animate-pulse" />
            <div className="h-[20px] bg-gray-100 rounded w-56 animate-pulse mt-3" />
          </div>
          <div className="flex-1">
            <div className="bg-white rounded-xl border border-[#e5e5e5] p-6">
              <div className="animate-pulse space-y-4">
                <div className="flex justify-end">
                  <div className="h-10 bg-gray-100 rounded w-28" />
                </div>
                <div className="h-20 bg-gray-100 rounded" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

async function ApiKeysContent() {
  const session = await requireServerSession();
  const keys = await listApiKeys(session.user.id);

  return (
    <ApiKeysClient
      initialKeys={keys.map((k) => ({
        id: k.id,
        label: k.label,
        keyHint: k.keyHint,
        createdAt: formatDate(k.createdAt),
        lastUsedAt: k.lastUsedAt
          ? formatDate(k.lastUsedAt)
          : null,
      }))}
    />
  );
}

export default function ApiKeysPage() {
  return (
    <Suspense fallback={<ApiKeysSkeleton />}>
      <ApiKeysContent />
    </Suspense>
  );
}
