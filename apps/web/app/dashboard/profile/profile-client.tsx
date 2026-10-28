"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/components/dashboard/page-header";
import Link from "next/link";
import { Upload, X, FileImage, AlertTriangle, Check } from "lucide-react";
import { toast } from "sonner";

import type { DeleteAccountCheck } from "@opendocs/shared/account/service";

import { API_BASE_URL } from "@/lib/config/api";
import { FormRow } from "@/components/form-row";
import { authClient } from "@/lib/auth-client";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2 MB
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 32;

type ProfileClientProps = {
  initial: {
    username: string;
    fullName: string;
    avatarUrl: string | null;
  };
  deleteCheck: DeleteAccountCheck;
};

export function ProfileClient({ initial, deleteCheck }: ProfileClientProps) {
  const router = useRouter();

  // ---- Name ----
  const [fullName, setFullName] = useState(initial.fullName);
  const [savedFullName, setSavedFullName] = useState(initial.fullName);
  const [saving, setSaving] = useState(false);

  // ---- Username ----
  // We track "saved" separately from "current input" so the Save button can
  // be disabled until the user actually changes something. Availability is
  // checked with a 400ms debounce — same cadence as onboarding.
  const [username, setUsername] = useState(initial.username);
  const [savedUsername, setSavedUsername] = useState(initial.username);
  const [usernameAvailable, setUsernameAvailable] =
    useState<boolean | null>(null);
  const [usernameCheckReason, setUsernameCheckReason] =
    useState<string | null>(null);
  const usernameCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkUsernameAvailability = useCallback(
    (value: string, currentSaved: string) => {
      if (usernameCheckTimer.current) clearTimeout(usernameCheckTimer.current);
      // No-op rename — the user typed back what they already had. Don't
      // ping the server, and clear any stale "Available" / "Taken" hint.
      if (value.toLowerCase() === currentSaved.toLowerCase()) {
        setUsernameAvailable(null);
        setUsernameCheckReason(null);
        return;
      }
      if (!value || value.length < 3) {
        setUsernameAvailable(null);
        setUsernameCheckReason(null);
        return;
      }
      usernameCheckTimer.current = setTimeout(async () => {
        try {
          const res = await fetch(
            `${API_BASE_URL}/api/v1/usernames/check?username=${encodeURIComponent(value)}`,
            { credentials: "include" },
          );
          const data = (await res.json()) as {
            available: boolean;
            reason?: string | null;
          };
          setUsernameAvailable(data.available);
          setUsernameCheckReason(
            data.available
              ? null
              : data.reason === "reserved"
                ? "That username is reserved."
                : data.reason === "invalid"
                  ? "Use lowercase letters, numbers, hyphens, or underscores (3-32 chars)."
                  : "That username is already taken.",
          );
        } catch {
          setUsernameAvailable(null);
          setUsernameCheckReason(null);
        }
      }, 400);
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (usernameCheckTimer.current) clearTimeout(usernameCheckTimer.current);
    };
  }, []);

  // ---- Delete account ----
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/account`, {
        method: "DELETE",
        credentials: "include",
      });

      if (res.status === 204) {
        await authClient.signOut().catch(() => {});
        window.location.href = "/account-deleted";
        return;
      }

      const body = (await res.json().catch(() => null)) as
        | { code?: string }
        | null;
      if (res.status === 409 && body?.code) {
        // State changed server-side since page load — refresh to re-fetch
        // the pre-flight check and show the right modal variant.
        toast.error(
          "Your account state changed. Please reload the page to continue.",
        );
        router.refresh();
      } else {
        toast.error("Failed to delete account");
      }
      setDeleteModalOpen(false);
      setDeleteConfirmInput("");
    } catch {
      toast.error("Failed to delete account");
    } finally {
      setDeleting(false);
    }
  };

  // ---- Avatar ----
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initial.avatarUrl);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const usernameChanged =
    username.trim().toLowerCase() !== savedUsername.toLowerCase();
  const usernameTooShort =
    usernameChanged &&
    username.length > 0 &&
    username.length < MIN_USERNAME_LENGTH;
  const usernameSaveable =
    usernameChanged &&
    username.length >= MIN_USERNAME_LENGTH &&
    usernameAvailable !== false;
  const hasChanges = fullName !== savedFullName || usernameSaveable;

  const displayName = fullName || savedUsername;
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // ---- Save profile ----
  // Username and full name go through different endpoints (the username
  // change has stricter validation + uniqueness on the server). We fan
  // both updates out in parallel and only show "Profile updated" when
  // every requested change succeeded; failures surface inline with the
  // specific error so the user knows which field to fix.
  const handleSave = async () => {
    setSaving(true);
    try {
      const tasks: Promise<void>[] = [];

      if (fullName !== savedFullName) {
        tasks.push(
          (async () => {
            const response = await fetch(`${API_BASE_URL}/api/v1/profile`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ fullName: fullName || null }),
            });
            if (!response.ok) throw new Error("Failed to update name");
            setSavedFullName(fullName);
          })(),
        );
      }

      if (usernameSaveable) {
        tasks.push(
          (async () => {
            const response = await fetch(
              `${API_BASE_URL}/api/v1/profile/username`,
              {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: username.trim() }),
              },
            );
            if (!response.ok) {
              const body = (await response.json().catch(() => null)) as
                | { message?: string; error?: string }
                | null;
              throw new Error(body?.message ?? "Failed to update username");
            }
            const body = (await response.json()) as {
              profile?: { username?: string };
            };
            const updated = body.profile?.username ?? username.trim().toLowerCase();
            setSavedUsername(updated);
            setUsername(updated);
            setUsernameAvailable(null);
            setUsernameCheckReason(null);
          })(),
        );
      }

      await Promise.all(tasks);
      toast.success("Profile updated");
      // Refresh the server component so the rest of the dashboard
      // (sidebar handle, attribution links) picks up the new username.
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update profile",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setFullName(savedFullName);
    setUsername(savedUsername);
    setUsernameAvailable(null);
    setUsernameCheckReason(null);
  };

  // ---- Avatar upload ----
  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      return "Please upload a JPEG, PNG, or WebP image.";
    }
    if (file.size > MAX_AVATAR_SIZE) {
      return "Image must be under 2 MB.";
    }
    return null;
  };

  const handleAvatarUpload = async (file: File) => {
    const error = validateFile(file);
    if (error) {
      toast.error(error);
      return;
    }
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(
        `${API_BASE_URL}/api/v1/profile/avatar/upload`,
        {
          method: "POST",
          credentials: "include",
          body: formData,
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        if (res.status === 503 || body?.error === "storage_not_configured") {
          throw new Error(
            "Image storage is not configured on the server yet.",
          );
        }
        if (res.status === 413) {
          throw new Error("Image must be under 2 MB.");
        }
        throw new Error(body?.message ?? "Upload failed");
      }
      const data = (await res.json()) as { profilePictureUrl: string };
      setAvatarUrl(data.profilePictureUrl);
      toast.success("Profile picture updated");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to upload picture",
      );
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/profile`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profilePictureUrl: null }),
      });
      if (!res.ok) throw new Error();
      setAvatarUrl(null);
      toast.success("Profile picture removed");
    } catch {
      toast.error("Failed to remove picture");
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleAvatarUpload(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleAvatarUpload(file);
    e.target.value = "";
  };

  return (
    <div className="w-full min-h-full">
      <div className="max-w-[1000px] mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-10 flex flex-col gap-[32px]">
        {/* Header */}
        <PageHeader title="Profile" description="How you appear to your teammates and on the documents you publish." />

        {/* Settings Card */}
        <div className="bg-white rounded-xl border border-[#e5e5e5] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]">
          <div className="p-4 sm:p-6">
            {/* ---- Profile picture ---- */}
            <FormRow
              title="Profile picture"
              description="Upload a profile picture. Used for your avatar across the workspace."
            >
              <div className="flex items-start gap-4">
                {/* Preview / upload zone */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative w-[72px] h-[72px] rounded-full border-2 flex items-center justify-center overflow-hidden transition-all flex-shrink-0 cursor-pointer ${
                    dragOver
                      ? "border-[#7F56D9] bg-[#F9F5FF]"
                      : avatarUrl
                        ? "border-[#e5e5e5]"
                        : "border-dashed border-[#d4d4d4] bg-gray-50 hover:border-[#a3a3a3]"
                  }`}
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Profile picture"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-lg font-medium text-[#a3a3a3]">
                      {initials}
                    </span>
                  )}
                  {uploading && (
                    <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                      <div className="w-5 h-5 border-2 border-gray-300 border-t-[#7F56D9] rounded-full animate-spin" />
                    </div>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                <div className="flex flex-col gap-2 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="flex items-center gap-2 px-3 py-1.5 border border-[#d4d4d4] rounded-[8px] text-[14px] font-medium text-[#404040] hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      {avatarUrl ? "Replace" : "Upload"}
                    </button>
                    {avatarUrl && (
                      <button
                        onClick={handleRemoveAvatar}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-[#d4d4d4] rounded-[8px] text-[14px] font-medium text-[#404040] hover:bg-gray-50 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                        Remove
                      </button>
                    )}
                  </div>
                  <p className="text-[13px] text-[#a3a3a3]">
                    JPG, PNG or WebP. Max 2 MB.
                  </p>
                </div>
              </div>
            </FormRow>

            {/* ---- Username ---- */}
            <FormRow
              title="Username"
              description="Your username is used for attribution on documents."
            >
              <div className="max-w-[320px]">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => {
                    // Mirror the onboarding constraints — only allow the
                    // characters the schema permits, lowercased. Doing this
                    // in the input keeps the live "Available" indicator
                    // honest instead of waiting for the server to reject.
                    const sanitized = e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9_-]/g, "")
                      .slice(0, MAX_USERNAME_LENGTH);
                    setUsername(sanitized);
                    checkUsernameAvailability(sanitized, savedUsername);
                  }}
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full border border-[#d4d4d4] rounded-[8px] px-[14px] py-[10px] text-[14px] text-[#171717] placeholder:text-[#737373] outline-none focus:border-[#6941c6] focus:ring-4 focus:ring-[#f4ebff] transition-all"
                />
                {usernameChanged &&
                  username.length >= MIN_USERNAME_LENGTH &&
                  usernameAvailable === true && (
                    <p className="text-[12px] text-green-600 mt-1.5 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Available
                    </p>
                  )}
                {usernameTooShort && (
                  <p className="text-[12px] text-[#DC2626] mt-1.5">
                    Username must be at least 3 characters.
                  </p>
                )}
                {usernameChanged && usernameAvailable === false && usernameCheckReason && (
                  <p className="text-[12px] text-[#DC2626] mt-1.5">
                    {usernameCheckReason}
                  </p>
                )}
                {!usernameChanged && (
                  <p className="text-[12px] text-[#737373] mt-1.5">
                    Lowercase letters, numbers, hyphens, and underscores. 3-32 characters.
                  </p>
                )}
              </div>
            </FormRow>

            {/* ---- Full name ---- */}
            <FormRow
              title="Full name"
              description="Your display name shown alongside your username."
            >
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full name"
                autoComplete="off"
                className="w-full max-w-[320px] border border-[#d4d4d4] rounded-[8px] px-[14px] py-[10px] text-[14px] text-[#171717] placeholder:text-[#737373] outline-none focus:border-[#6941c6] focus:ring-4 focus:ring-[#f4ebff] transition-all"
              />
            </FormRow>
          </div>

          {/* Footer */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 px-4 sm:px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] rounded-b-xl">
            <button
              onClick={handleReset}
              disabled={!hasChanges}
              className="w-full sm:w-auto px-4 py-2 border border-[#d4d4d4] rounded-[8px] text-[14px] font-medium text-[#404040] hover:bg-white transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className="w-full sm:w-auto bg-[#7F56D9] hover:bg-[#6941C6] text-white rounded-[8px] px-4 py-2 text-[14px] font-semibold transition-colors disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>

        {/* Danger zone */}
        <div className="bg-white rounded-xl border border-[#FDA29B] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]">
          <div className="px-4 sm:px-6 py-4 border-b border-[#FEE4E2] bg-[#FFFBFA] rounded-t-xl">
            <h2 className="text-[16px] font-semibold text-[#B42318]">
              Danger zone
            </h2>
          </div>
          <div className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex flex-col gap-1 min-w-0">
              <h3 className="text-[14px] font-semibold text-[#171717]">
                Delete account
              </h3>
              <p className="text-[14px] text-[#525252]">
                Permanently delete your account and all associated data. This
                cannot be undone.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setDeleteConfirmInput("");
                setDeleteModalOpen(true);
              }}
              className="w-full sm:w-auto shrink-0 bg-[#DC2626] hover:bg-[#b91c1c] text-white rounded-[8px] px-4 py-2 text-[14px] font-semibold transition-colors"
            >
              Delete account
            </button>
          </div>
        </div>
      </div>

      <DeleteAccountModal
        open={deleteModalOpen}
        onOpenChange={(open) => {
          setDeleteModalOpen(open);
          if (!open) setDeleteConfirmInput("");
        }}
        deleteCheck={deleteCheck}
        confirmInput={deleteConfirmInput}
        onConfirmInputChange={setDeleteConfirmInput}
        deleting={deleting}
        onConfirm={handleDeleteAccount}
      />
    </div>
  );
}

type DeleteAccountModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deleteCheck: DeleteAccountCheck;
  confirmInput: string;
  onConfirmInputChange: (value: string) => void;
  deleting: boolean;
  onConfirm: () => void;
};

function DeleteAccountModal({
  open,
  onOpenChange,
  deleteCheck,
  confirmInput,
  onConfirmInputChange,
  deleting,
  onConfirm,
}: DeleteAccountModalProps) {
  const confirmMatches = confirmInput === "delete";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="dashboard-light">
        {deleteCheck.canDelete === false &&
        deleteCheck.reason === "active_plan" ? (
          <>
            <AlertDialogHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#FEF0C7] border border-[#FEDF89] flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-[#B54708]" />
                </div>
                <AlertDialogTitle>Cancel your plan first</AlertDialogTitle>
              </div>
              <AlertDialogDescription>
                You have an active subscription. Please cancel it in Billing
                before deleting your account. Your account will remain active
                until the current billing period ends.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="w-full sm:w-auto px-4 py-2 border border-[#d4d4d4] rounded-[8px] text-[14px] font-medium text-[#404040] hover:bg-gray-50"
              >
                Cancel
              </button>
              <Link
                href="/dashboard/billing"
                className="w-full sm:w-auto bg-[#7F56D9] hover:bg-[#6941C6] text-white rounded-[8px] px-4 py-2 text-[14px] font-semibold text-center"
              >
                Go to billing
              </Link>
            </AlertDialogFooter>
          </>
        ) : deleteCheck.canDelete === false &&
          deleteCheck.reason === "team_workspace_with_members" ? (
          <>
            <AlertDialogHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#FEF0C7] border border-[#FEDF89] flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-[#B54708]" />
                </div>
                <AlertDialogTitle>Remove team members first</AlertDialogTitle>
              </div>
              <AlertDialogDescription asChild>
                <div className="text-[14px] text-[#525252] space-y-2">
                  <p>
                    You own team workspace
                    {deleteCheck.workspaces.length === 1 ? " " : "s "}
                    with other members:
                  </p>
                  <ul className="list-disc pl-5">
                    {deleteCheck.workspaces.map((w) => (
                      <li key={w.id}>
                        <span className="font-medium text-[#171717]">
                          {w.name}
                        </span>{" "}
                        — {w.memberCount}{" "}
                        {w.memberCount === 1 ? "member" : "members"}
                      </li>
                    ))}
                  </ul>
                  <p>
                    Remove all members (or delete the workspace) before deleting
                    your account. Ownership transfer is not yet supported.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="w-full sm:w-auto px-4 py-2 border border-[#d4d4d4] rounded-[8px] text-[14px] font-medium text-[#404040] hover:bg-gray-50"
              >
                Cancel
              </button>
              <Link
                href="/dashboard/workspace"
                className="w-full sm:w-auto bg-[#7F56D9] hover:bg-[#6941C6] text-white rounded-[8px] px-4 py-2 text-[14px] font-semibold text-center"
              >
                Go to workspace settings
              </Link>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#FEE4E2] border border-[#FECDCA] flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-[#B42318]" />
                </div>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              </div>
              <AlertDialogDescription asChild>
                <div className="text-[14px] text-[#525252] space-y-2">
                  <p>
                    This action is permanent and cannot be undone. All your
                    workspaces, posts, API keys, and settings will be deleted
                    immediately.
                  </p>
                  <p>
                    Type{" "}
                    <span className="font-mono font-semibold text-[#171717]">
                      delete
                    </span>{" "}
                    below to confirm.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <input
              type="text"
              value={confirmInput}
              onChange={(e) => onConfirmInputChange(e.target.value)}
              placeholder="delete"
              autoComplete="off"
              disabled={deleting}
              className="w-full border border-[#d4d4d4] rounded-[8px] px-[14px] py-[10px] text-[14px] text-[#171717] placeholder:text-[#a3a3a3] outline-none focus:border-[#DC2626] focus:ring-4 focus:ring-[#FEE4E2] transition-all"
            />
            <AlertDialogFooter>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={deleting}
                className="w-full sm:w-auto px-4 py-2 border border-[#d4d4d4] rounded-[8px] text-[14px] font-medium text-[#404040] hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={!confirmMatches || deleting}
                className="w-full sm:w-auto bg-[#DC2626] hover:bg-[#b91c1c] text-white rounded-[8px] px-4 py-2 text-[14px] font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {deleting ? "Deleting..." : "Delete my account"}
              </button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
