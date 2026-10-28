import type { Metadata } from "next";
import { Suspense } from "react";

import { checkCanDeleteAccount } from "@opendocs/shared/account/service";

import { requireServerSession } from "@/lib/auth/session";
import { getProfileSettings } from "@/lib/workspaces/cached";

import { ProfileClient } from "./profile-client";

export const metadata: Metadata = { title: "Profile" };

function ProfileSkeleton() {
  return (
    <div className="w-full min-h-full">
      <div className="max-w-[1000px] mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-10 flex flex-col gap-[32px]">
        <div className="flex flex-col gap-0.5">
          <div className="h-[30px] bg-gray-100 rounded w-48 animate-pulse" />
          <div className="h-[24px] bg-gray-100 rounded w-72 animate-pulse mt-2" />
        </div>
        <div className="bg-white rounded-xl border border-[#e5e5e5] p-6">
          <div className="animate-pulse space-y-6">
            <div className="flex gap-8">
              <div className="w-[280px] shrink-0">
                <div className="h-4 bg-gray-100 rounded w-24" />
              </div>
              <div className="flex-1 flex items-center gap-4">
                <div className="w-16 h-16 bg-gray-100 rounded-full" />
                <div className="h-4 bg-gray-100 rounded w-24" />
              </div>
            </div>
            <div className="h-px bg-[#e5e5e5]" />
            <div className="flex gap-8">
              <div className="w-[280px] shrink-0">
                <div className="h-4 bg-gray-100 rounded w-24" />
              </div>
              <div className="flex-1">
                <div className="h-10 bg-gray-100 rounded w-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

async function ProfileContent() {
  const session = await requireServerSession();
  const [profile, deleteCheck] = await Promise.all([
    getProfileSettings(session.user.id),
    checkCanDeleteAccount(session.user.id),
  ]);

  return (
    <ProfileClient
      initial={{
        username: profile?.username ?? "",
        fullName: profile?.fullName ?? "",
        avatarUrl: profile?.profilePictureUrl ?? null,
      }}
      deleteCheck={deleteCheck}
    />
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <ProfileContent />
    </Suspense>
  );
}
