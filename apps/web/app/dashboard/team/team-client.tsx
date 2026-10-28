"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Mail,
  Trash2,
  X,
  Plus,
  RefreshCw,
  Shield,
  Sparkles,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

import { PageHeader } from "@/components/dashboard/page-header";
import { API_BASE_URL } from "@/lib/config/api";

type TeamMember = {
  id: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: "owner" | "admin" | "member";
  joinedAt: string;
};

type PendingInvite = {
  id: string;
  email: string;
  role: "admin" | "member";
  invitedAt: string;
  invitedByName: string;
};

type TeamClientProps = {
  currentUserId: string;
  currentUserRole: "owner" | "admin" | "member";
  workspaceId: string;
  members: TeamMember[];
  invitations: PendingInvite[];
  stats: {
    totalMembers: number;
    pendingInvites: number;
    admins: number;
  };
};

type InviteRow = {
  email: string;
  role: "admin" | "member";
  error: string | null;
};

type InviteErrorResponse = {
  error?: string;
  plan?: string;
  limit?: number;
};

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function ModalOverlay({
  children,
  isOpen,
  onClose,
}: {
  children: React.ReactNode;
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div
        className="fixed inset-0 bg-black/40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-[400px] max-h-[calc(100vh-32px)] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

export function TeamClient({
  currentUserId,
  currentUserRole,
  workspaceId,
  members: initialMembers,
  invitations: initialInvitations,
  stats: initialStats,
}: TeamClientProps) {
  const router = useRouter();
  const [members, setMembers] = useState<TeamMember[]>(initialMembers);
  const [invitations, setInvitations] =
    useState<PendingInvite[]>(initialInvitations);
  const [stats, setStats] = useState(initialStats);

  // Multi-row invite state
  const [inviteRows, setInviteRows] = useState<InviteRow[]>([
    { email: "", role: "member", error: null },
  ]);
  const [inviting, setInviting] = useState(false);

  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [memberLimitNudge, setMemberLimitNudge] = useState<{
    plan?: string;
    limit?: number;
  } | null>(null);

  // Admin promotion confirmation
  const [promoteConfirm, setPromoteConfirm] = useState<{
    memberId: string;
    memberName: string;
  } | null>(null);

  const isOwner = currentUserRole === "owner";
  const isAdmin = currentUserRole === "admin" || isOwner;

  const memberToRemove = members.find((m) => m.id === confirmRemoveId);

  // ---- Invite helpers ----

  const handleInviteEmailChange = (index: number, value: string) => {
    setInviteRows((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, email: value, error: null } : row,
      ),
    );
  };

  const handleInviteRoleChange = (index: number, role: "admin" | "member") => {
    setInviteRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, role } : row)),
    );
  };

  const handleAddInviteRow = () => {
    setInviteRows((prev) => [...prev, { email: "", role: "member", error: null }]);
  };

  const handleRemoveInviteRow = (index: number) => {
    setInviteRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSendInvites = async () => {
    // Validate all rows
    let hasErrors = false;
    const validated = inviteRows.map((row) => {
      const email = row.email.trim().toLowerCase();
      if (!email) {
        return { ...row, error: null }; // skip empty rows
      }
      if (!EMAIL_REGEX.test(email)) {
        hasErrors = true;
        return { ...row, error: "Enter a valid email address" };
      }
      return { ...row, email, error: null };
    });

    const rowsToSend = validated.filter((row) => row.email.trim());
    if (rowsToSend.length === 0) {
      setInviteRows(
        validated.map((row) =>
          !row.email.trim() && !row.error
            ? { ...row, error: "Enter an email address" }
            : row,
        ),
      );
      return;
    }

    if (hasErrors) {
      setInviteRows(validated);
      return;
    }

    setInviteRows(validated);
    setInviting(true);

    let sent = 0;
    let failed = 0;
    const newInvitations: PendingInvite[] = [];
    const updatedRows = [...validated];

    for (let i = 0; i < validated.length; i++) {
      const row = validated[i];
      const email = row.email.trim().toLowerCase();
      if (!email) continue;

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/v1/workspace/team/invite`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, role: row.role, workspaceId }),
          },
        );

        if (!response.ok) {
          const data = (await response
            .json()
            .catch(() => ({}))) as InviteErrorResponse;
          failed++;
          const errorMessages: Record<string, string> = {
            already_member: "Already a team member",
            already_invited: "Already invited",
            invite_limit: "Too many pending invitations",
            member_limit: "Member limit reached for this plan. Upgrade to invite more.",
            forbidden: "You don't have permission",
          };
          if (data.error === "member_limit") {
            setMemberLimitNudge({ plan: data.plan, limit: data.limit });
          }
          updatedRows[i] = {
            ...row,
            error: errorMessages[data.error as string] ?? "Failed to send",
          };
          continue;
        }

        const data = await response.json();
        newInvitations.push(data.invitation);
        sent++;
        // Clear this row on success
        updatedRows[i] = { email: "", role: "member", error: null };
      } catch {
        failed++;
        updatedRows[i] = { ...row, error: "Failed to send" };
      }
    }

    // Update invitations list
    if (newInvitations.length > 0) {
      setInvitations((prev) => [...newInvitations, ...prev]);
      setStats((prev) => ({
        ...prev,
        pendingInvites: prev.pendingInvites + newInvitations.length,
      }));
    }

    // Clean up rows — keep rows with errors, remove empty success rows, keep at least one
    const remaining = updatedRows.filter(
      (row) => row.email.trim() || row.error,
    );
    setInviteRows(
      remaining.length > 0
        ? remaining
        : [{ email: "", role: "member", error: null }],
    );

    if (sent > 0 && failed === 0) {
      toast.success(
        `Invitation${sent > 1 ? "s" : ""} sent to ${sent} team member${sent > 1 ? "s" : ""}`,
      );
    } else if (sent > 0 && failed > 0) {
      toast.success(`${sent} sent, ${failed} failed — check errors below`);
    } else if (failed > 0) {
      toast.error("Failed to send invitations — check errors below");
    }

    setInviting(false);
  };

  // ---- Invitation management ----

  const handleResendInvite = async (inviteId: string, email: string) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/workspace/team/invitations/${inviteId}/resend`,
        { method: "POST", credentials: "include" },
      );

      if (!response.ok) throw new Error();
      toast.success(`Invitation resent to ${email}`);
    } catch {
      toast.error("Failed to resend invitation");
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/workspace/team/invitations/${inviteId}`,
        { method: "DELETE", credentials: "include" },
      );

      if (!response.ok) throw new Error();
      setInvitations((prev) => prev.filter((i) => i.id !== inviteId));
      setStats((prev) => ({
        ...prev,
        pendingInvites: Math.max(0, prev.pendingInvites - 1),
      }));
      toast.success("Invitation cancelled");
    } catch {
      toast.error("Failed to cancel invitation");
    }
  };

  // ---- Role change ----

  const handleChangeRole = async (
    memberId: string,
    newRole: "admin" | "member",
  ) => {
    // If promoting to admin, show confirmation
    if (newRole === "admin") {
      const member = members.find((m) => m.id === memberId);
      setPromoteConfirm({
        memberId,
        memberName: member?.name ?? "this member",
      });
      return;
    }

    await doChangeRole(memberId, newRole);
  };

  const doChangeRole = async (memberId: string, newRole: "admin" | "member") => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/workspace/team/members/${memberId}/role`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: newRole }),
        },
      );

      if (!response.ok) {
        const data = await response.json();
        if (data.error === "forbidden") {
          toast.error("You don't have permission to change this role");
        } else {
          toast.error("Failed to change role");
        }
        return;
      }

      const data = await response.json();
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, ...data.member } : m)),
      );

      const member = members.find((m) => m.id === memberId);
      toast.success(`${member?.name}'s role changed to ${newRole}`);

      setStats((prev) => ({
        ...prev,
        admins:
          newRole === "admin" ? prev.admins + 1 : Math.max(0, prev.admins - 1),
      }));
    } catch {
      toast.error("Failed to change role");
    }
  };

  const handleConfirmPromote = async () => {
    if (!promoteConfirm) return;
    await doChangeRole(promoteConfirm.memberId, "admin");
    setPromoteConfirm(null);
  };

  // ---- Remove member ----

  const handleRemoveMember = async () => {
    if (!confirmRemoveId) return;
    setRemoving(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/workspace/team/members/${confirmRemoveId}`,
        { method: "DELETE", credentials: "include" },
      );

      if (!response.ok) {
        const data = await response.json();
        if (data.error === "forbidden") {
          toast.error("You don't have permission to remove this member");
        } else {
          toast.error("Failed to remove member");
        }
        return;
      }

      const removed = members.find((m) => m.id === confirmRemoveId);
      setMembers((prev) => prev.filter((m) => m.id !== confirmRemoveId));
      setStats((prev) => ({
        ...prev,
        totalMembers: Math.max(0, prev.totalMembers - 1),
        admins:
          removed?.role === "admin" || removed?.role === "owner"
            ? Math.max(0, prev.admins - 1)
            : prev.admins,
      }));
      toast.success(`${removed?.name} removed from team`);
    } catch {
      toast.error("Failed to remove member");
    } finally {
      setRemoving(false);
      setConfirmRemoveId(null);
    }
  };

  return (
    <div className="max-w-[1000px] mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-10 flex flex-col gap-[32px]">
      <PageHeader
        title="Team"
        description="Invite people to this workspace and choose what each of them can do."
      />

      <div className="w-full h-px bg-[#e5e5e5]" />

      {/* Invite Section — admin/owner only */}
      {isAdmin && (
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-8 pb-8 border-b border-[#e5e5e5]">
          <div>
            <h2 className="text-[14px] font-semibold text-[#171717] mb-1.5">
              Invite team members
            </h2>
            <p className="text-[14px] text-[#525252] leading-relaxed pr-4">
              Get your projects up and running faster by inviting your team to
              collaborate.
            </p>
          </div>
          <div className="max-w-xl">
            <div className="space-y-3">
              {inviteRows.map((row, index) => (
                <div key={index}>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                    <div className="relative w-full sm:flex-1">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#737373]" />
                      <input
                        type="email"
                        placeholder="you@example.com"
                        value={row.email}
                        onChange={(e) =>
                          handleInviteEmailChange(index, e.target.value)
                        }
                        onKeyDown={(e) =>
                          e.key === "Enter" && handleSendInvites()
                        }
                        autoComplete="off"
                        className={`w-full pl-9 pr-4 py-2 text-[14px] border rounded-[8px] focus:outline-none focus:ring-2 text-[#171717] placeholder:text-[#a3a3a3] shadow-sm bg-white transition-colors ${
                          row.error
                            ? "border-[#DC2626] focus:ring-[#DC2626]/20 focus:border-[#DC2626]"
                            : "border-[#d4d4d4] focus:ring-[#7F56D9] focus:border-[#7F56D9]"
                        }`}
                      />
                    </div>
                    {/* Role select + remove button — stay grouped on the same mobile row;
                        unwrap into the parent flex on sm+ via display:contents */}
                    <div className="flex gap-2 sm:gap-3 sm:contents">
                      <div className="flex-1 sm:w-[120px] sm:flex-none sm:shrink-0">
                        <Select
                          value={row.role}
                          onValueChange={(v) =>
                            handleInviteRoleChange(index, v as "admin" | "member")
                          }
                        >
                          <SelectTrigger className="w-full h-auto px-3 py-2 text-[14px] border border-[#d4d4d4] rounded-[8px] bg-white shadow-sm font-medium text-[#171717] focus:ring-2 focus:ring-[#7F56D9] focus:border-[#7F56D9]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="dashboard-light">
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {inviteRows.length > 1 && (
                        <button
                          onClick={() => handleRemoveInviteRow(index)}
                          className="shrink-0 w-[40px] h-[40px] sm:w-[36px] sm:h-[36px] flex items-center justify-center text-[#a3a3a3] hover:text-[#525252] hover:bg-[#fafafa] rounded-[8px] transition-colors"
                          title="Remove row"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  {row.error && (
                    <p className="text-[12px] text-[#DC2626] mt-1 ml-1">
                      {row.error}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mt-4">
              <button
                onClick={handleAddInviteRow}
                disabled={inviting}
                className="flex items-center gap-1.5 text-[13px] font-medium text-[#525252] hover:text-[#171717] transition-colors disabled:opacity-50 self-start sm:self-auto"
              >
                <Plus className="w-4 h-4" />
                Add another
              </button>
              <button
                onClick={handleSendInvites}
                disabled={inviting}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#7F56D9] hover:bg-[#6941C6] disabled:opacity-50 text-white text-[14px] font-semibold px-4 py-2.5 rounded-[8px] transition-colors shadow-sm border border-[#7F56D9]"
              >
                <Mail className="w-4 h-4 opacity-70" />
                {inviting ? "Sending..." : "Send invites"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Team Members Section */}
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-8">
        <div>
          <h2 className="text-[14px] font-semibold text-[#171717] mb-1.5">
            Team members
          </h2>
          <p className="text-[14px] text-[#525252] leading-relaxed pr-4">
            Manage your existing team and change roles/permissions.
          </p>
        </div>
        <div>
          <div className="border border-[#e5e5e5] rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-left text-sm whitespace-nowrap border-collapse">
              <thead className="bg-[#fafafa] border-b border-[#e5e5e5]">
                <tr>
                  <th
                    scope="col"
                    className="pl-5 py-3 text-left text-[12px] font-medium text-[#525252] uppercase tracking-wider"
                  >
                    Name
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-3 text-left text-[12px] font-medium text-[#525252] uppercase tracking-wider hidden sm:table-cell"
                  >
                    Email
                  </th>
                  <th
                    scope="col"
                    className="hidden sm:table-cell px-3 py-3 w-28 text-left text-[12px] font-medium text-[#525252] uppercase tracking-wider"
                  >
                    Role
                  </th>
                  <th scope="col" className="px-5 py-3 w-20">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e5e5e5] bg-white">
                {/* Active members */}
                {members.map((member) => (
                  <tr
                    key={member.id}
                    className="hover:bg-[#fafafa] transition-colors"
                  >
                    <td className="pl-5 pr-3 py-4">
                      <div className="flex items-center gap-3 min-w-0">
                        {member.image ? (
                          <img
                            src={member.image}
                            alt={member.name}
                            className="w-10 h-10 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-[#F2F4F7] flex items-center justify-center text-[#475467] font-medium text-sm border border-[#e5e5e5] shrink-0">
                            {getInitials(member.name)}
                          </div>
                        )}
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium text-[#171717] text-[14px] truncate">
                            {member.name}
                          </span>
                          {/* Mobile-only role surface (the Role column is hidden on mobile) */}
                          <span className="sm:hidden text-[12px] text-[#737373] capitalize">
                            {member.role}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-4 text-[#525252] text-[14px] hidden sm:table-cell">
                      {member.email}
                    </td>
                    <td className="hidden sm:table-cell px-3 py-4">
                      {isAdmin &&
                      member.role !== "owner" &&
                      member.userId !== currentUserId ? (
                        <div className="w-[100px]">
                          <Select
                            value={member.role}
                            onValueChange={(v) =>
                              handleChangeRole(member.id, v as "admin" | "member")
                            }
                            disabled={member.role === "admin" && !isOwner}
                          >
                            <SelectTrigger className="w-full h-auto px-2 py-1 text-[13px] border border-[#e5e5e5] rounded-md bg-white text-[#525252] focus:ring-2 focus:ring-[#7F56D9] disabled:opacity-60 disabled:cursor-not-allowed">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="dashboard-light">
                              <SelectItem value="member">Member</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <span className="text-[#525252] text-[14px] capitalize">
                          {member.role}
                        </span>
                      )}
                    </td>
                    <td className="px-3 sm:px-5 py-4 text-right">
                      {isAdmin &&
                        member.role !== "owner" &&
                        member.userId !== currentUserId &&
                        (member.role === "member" ||
                          (member.role === "admin" && isOwner)) && (
                          <button
                            onClick={() => setConfirmRemoveId(member.id)}
                            className="inline-flex items-center justify-center min-h-[36px] min-w-[36px] text-[#DC2626] hover:text-[#b91c1c] transition-colors rounded-md hover:bg-red-50"
                            title="Remove member"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                    </td>
                  </tr>
                ))}

                {/* Pending invitations inline */}
                {invitations.map((invite) => (
                  <tr
                    key={`invite-${invite.id}`}
                    className="hover:bg-[#fafafa] transition-colors bg-[#fafafa]/50"
                  >
                    <td className="pl-5 pr-3 py-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-[#F2F4F7] flex items-center justify-center text-[#475467] shrink-0 border border-dashed border-[#d4d4d4]">
                          <Mail className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[14px] text-[#171717] truncate">
                            {invite.email}
                          </span>
                          <span className="text-[11px] text-[#7F56D9] font-medium">
                            Pending invite
                            {/* Surface role on mobile since the Role column is hidden */}
                            <span className="sm:hidden text-[#737373] capitalize">
                              {" "}· {invite.role}
                            </span>
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-4 text-[#525252] text-[14px] hidden sm:table-cell">
                      {invite.email}
                    </td>
                    <td className="hidden sm:table-cell px-3 py-4">
                      <span className="text-[#525252] text-[14px] capitalize">
                        {invite.role}
                      </span>
                    </td>
                    <td className="px-3 sm:px-5 py-4 text-right">
                      {isAdmin && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() =>
                              handleResendInvite(invite.id, invite.email)
                            }
                            className="inline-flex items-center justify-center min-h-[36px] min-w-[36px] text-[#7F56D9] hover:text-[#6941C6] transition-colors rounded-md hover:bg-purple-50"
                            title="Resend invitation"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleCancelInvite(invite.id)}
                            className="inline-flex items-center justify-center min-h-[36px] min-w-[36px] text-[#DC2626] hover:text-[#b91c1c] transition-colors rounded-md hover:bg-red-50"
                            title="Cancel invitation"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Remove confirmation modal */}
      <ModalOverlay
        isOpen={confirmRemoveId !== null}
        onClose={() => !removing && setConfirmRemoveId(null)}
      >
        <div className="bg-white flex flex-col overflow-clip rounded-[16px] shadow-[0px_20px_24px_-4px_rgba(0,0,0,0.08),0px_8px_8px_-4px_rgba(0,0,0,0.03),0px_3px_3px_-1.5px_rgba(0,0,0,0.04)] w-full">
          <div className="relative w-full">
            <div className="flex flex-col gap-[16px] items-start pt-[24px] px-[24px]">
              <div className="relative rounded-[8px] w-[40px] h-[40px] border border-[#d4d4d4] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] flex items-center justify-center">
                <Trash2
                  className="w-5 h-5 text-[#DC2626]"
                  strokeWidth={1.67}
                />
              </div>
              <div className="flex flex-col gap-[2px] w-full">
                <p className="font-semibold leading-[24px] text-[#171717] text-[16px]">
                  Remove team member
                </p>
                <p className="font-normal leading-[20px] text-[#525252] text-[14px]">
                  Are you sure you want to remove{" "}
                  <strong>{memberToRemove?.name}</strong> from your team? They
                  will lose access to all workspace documents.
                </p>
              </div>
            </div>
            <button
              onClick={() => !removing && setConfirmRemoveId(null)}
              className="absolute flex items-center justify-center p-[8px] right-[16px] rounded-[8px] w-[36px] h-[36px] top-[16px] hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5 text-[#A3A3A3]" strokeWidth={1.67} />
            </button>
          </div>
          <div className="flex gap-[12px] items-start pt-[32px] pb-[24px] px-[24px]">
            <button
              onClick={() => !removing && setConfirmRemoveId(null)}
              className="flex-1 relative rounded-[8px] border border-[#d4d4d4] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] hover:bg-[#fafafa] transition-colors"
            >
              <div className="flex items-center justify-center px-[14px] py-[10px]">
                <span className="font-semibold leading-[20px] text-[#404040] text-[14px]">
                  Cancel
                </span>
              </div>
            </button>
            <button
              onClick={handleRemoveMember}
              disabled={removing}
              className="flex-1 relative rounded-[8px] bg-[#DC2626] hover:bg-[#b91c1c] disabled:opacity-50 transition-colors shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]"
            >
              <div className="flex items-center justify-center px-[14px] py-[10px]">
                <span className="font-semibold leading-[20px] text-white text-[14px]">
                  {removing ? "Removing..." : "Remove"}
                </span>
              </div>
            </button>
          </div>
        </div>
      </ModalOverlay>

      {/* Admin promotion confirmation modal */}
      <ModalOverlay
        isOpen={promoteConfirm !== null}
        onClose={() => setPromoteConfirm(null)}
      >
        <div className="bg-white flex flex-col overflow-clip rounded-[16px] shadow-[0px_20px_24px_-4px_rgba(0,0,0,0.08),0px_8px_8px_-4px_rgba(0,0,0,0.03),0px_3px_3px_-1.5px_rgba(0,0,0,0.04)] w-full">
          <div className="relative w-full">
            <div className="flex flex-col gap-[16px] items-start pt-[24px] px-[24px]">
              <div className="relative rounded-[8px] w-[40px] h-[40px] border border-[#d4d4d4] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] flex items-center justify-center">
                <Shield
                  className="w-5 h-5 text-[#7F56D9]"
                  strokeWidth={1.67}
                />
              </div>
              <div className="flex flex-col gap-[2px] w-full">
                <p className="font-semibold leading-[24px] text-[#171717] text-[16px]">
                  Promote to Admin
                </p>
                <p className="font-normal leading-[20px] text-[#525252] text-[14px]">
                  Are you sure you want to make{" "}
                  <strong>{promoteConfirm?.memberName}</strong> an admin? Admins
                  can invite and remove members, change roles, and manage
                  workspace settings.
                </p>
              </div>
            </div>
            <button
              onClick={() => setPromoteConfirm(null)}
              className="absolute flex items-center justify-center p-[8px] right-[16px] rounded-[8px] w-[36px] h-[36px] top-[16px] hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5 text-[#A3A3A3]" strokeWidth={1.67} />
            </button>
          </div>
          <div className="flex gap-[12px] items-start pt-[32px] pb-[24px] px-[24px]">
            <button
              onClick={() => setPromoteConfirm(null)}
              className="flex-1 relative rounded-[8px] border border-[#d4d4d4] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] hover:bg-[#fafafa] transition-colors"
            >
              <div className="flex items-center justify-center px-[14px] py-[10px]">
                <span className="font-semibold leading-[20px] text-[#404040] text-[14px]">
                  Cancel
                </span>
              </div>
            </button>
            <button
              onClick={handleConfirmPromote}
              className="flex-1 relative rounded-[8px] bg-[#7F56D9] hover:bg-[#6941C6] transition-colors shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]"
            >
              <div className="flex items-center justify-center px-[14px] py-[10px]">
                <span className="font-semibold leading-[20px] text-white text-[14px]">
                  Promote to Admin
                </span>
              </div>
            </button>
          </div>
        </div>
      </ModalOverlay>

      {/* Member-limit upgrade nudge */}
      <ModalOverlay
        isOpen={memberLimitNudge !== null}
        onClose={() => setMemberLimitNudge(null)}
      >
        <div className="dashboard-light bg-white flex flex-col overflow-clip rounded-[16px] shadow-[0px_20px_24px_-4px_rgba(0,0,0,0.08),0px_8px_8px_-4px_rgba(0,0,0,0.03),0px_3px_3px_-1.5px_rgba(0,0,0,0.04)] w-full">
          <div className="relative w-full">
            <div className="flex flex-col gap-[16px] items-start pt-[24px] px-[24px]">
              <div className="rounded-[8px] size-[40px] bg-[#F9F5FF] border border-[#E9D7FE] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] flex items-center justify-center">
                <Sparkles
                  className="w-5 h-5 text-[#7F56D9]"
                  strokeWidth={1.67}
                />
              </div>
              <div className="flex flex-col gap-[2px] w-full">
                <p className="font-semibold leading-[24px] text-[#171717] text-[16px]">
                  Upgrade to invite more teammates
                </p>
                <p className="font-normal leading-[20px] text-[#525252] text-[14px]">
                  This workspace has reached its current member limit
                  {memberLimitNudge?.limit ? ` of ${memberLimitNudge.limit}` : ""}.
                  Upgrade to {memberLimitNudge?.plan === "pro" ? "Team" : "Pro"} to
                  invite more collaborators and keep growing your workspace.
                </p>
              </div>
            </div>
            <button
              onClick={() => setMemberLimitNudge(null)}
              className="absolute flex items-center justify-center p-[8px] right-[16px] rounded-[8px] w-[36px] h-[36px] top-[16px] hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-[#A3A3A3]" strokeWidth={1.67} />
            </button>
          </div>
          <div className="flex gap-[12px] items-start pt-[24px] pb-[24px] px-[24px]">
            <button
              onClick={() => setMemberLimitNudge(null)}
              className="flex-1 relative rounded-[8px] border border-[#d4d4d4] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] hover:bg-[#fafafa] transition-colors"
            >
              <div className="flex items-center justify-center px-[14px] py-[10px]">
                <span className="font-semibold leading-[20px] text-[#404040] text-[14px]">
                  Maybe later
                </span>
              </div>
            </button>
            <button
              onClick={() => {
                setMemberLimitNudge(null);
                router.push("/dashboard/billing");
              }}
              className="flex-1 relative rounded-[8px] bg-[#7F56D9] hover:bg-[#6941C6] transition-colors shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]"
            >
              <div className="flex items-center justify-center px-[14px] py-[10px]">
                <span className="font-semibold leading-[20px] text-white text-[14px]">
                  Upgrade to {memberLimitNudge?.plan === "pro" ? "Team" : "Pro"}
                </span>
              </div>
            </button>
          </div>
        </div>
      </ModalOverlay>
    </div>
  );
}
