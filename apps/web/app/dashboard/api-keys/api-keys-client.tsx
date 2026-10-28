"use client";

import { useState } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { formatDate } from "@/lib/format-date";
import { Plus, Copy, Trash2, Key, X, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { createApiKeyAction, revokeApiKeyAction } from "./actions";

type ApiKeyRow = {
  id: string;
  label: string;
  keyHint: string;
  createdAt: string;
  lastUsedAt: string | null;
};

type ApiKeysClientProps = {
  initialKeys: ApiKeyRow[];
};

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
      <div className="relative z-10 w-full max-w-[480px] max-h-[calc(100vh-32px)] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

export function ApiKeysClient({ initialKeys }: ApiKeysClientProps) {
  const [apiKeys, setApiKeys] = useState<ApiKeyRow[]>(initialKeys);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [addStep, setAddStep] = useState<"name" | "success">("name");
  const [newKeyName, setNewKeyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [revokeKeyId, setRevokeKeyId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  const handleOpenAddModal = () => {
    setAddStep("name");
    setNewKeyName("");
    setCreateDialogOpen(true);
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) {
      toast.error("Please enter a name for the API key");
      return;
    }

    setCreating(true);
    try {
      const result = await createApiKeyAction(newKeyName);

      if ("error" in result) {
        throw new Error(result.error);
      }

      setNewlyCreatedKey(result.plaintext);
      setApiKeys([
        ...apiKeys,
        {
          id: result.id,
          label: result.label,
          keyHint: result.keyHint,
          createdAt: formatDate(result.createdAt),
          lastUsedAt: null,
        },
      ]);
      setAddStep("success");
      setNewKeyName("");
    } catch {
      toast.error("Failed to create API key");
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeKey = async () => {
    if (!revokeKeyId) return;

    setRevoking(true);
    try {
      const result = await revokeApiKeyAction(revokeKeyId);

      if ("error" in result) {
        throw new Error(result.error);
      }

      setApiKeys(apiKeys.filter((key) => key.id !== revokeKeyId));
      setRevokeKeyId(null);
      toast.success("API key revoked");
    } catch {
      toast.error("Failed to revoke API key");
    } finally {
      setRevoking(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const handleCopyAndClose = () => {
    if (newlyCreatedKey) {
      copyToClipboard(newlyCreatedKey);
    }
    setCreateDialogOpen(false);
    setNewlyCreatedKey(null);
  };

  return (
    <div className="max-w-[1000px] mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-10 flex flex-col gap-[32px]">
      <PageHeader
        title="API keys"
        description={
          <>
            Keys let the CLI and your agents publish to OpenDocs as you. Treat them like passwords.{" "}
            <a
              href="https://docs.opendocs.cc"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[#6941c6] hover:text-[#53389E]"
            >
              API docs&nbsp;→
            </a>
          </>
        }
        actions={
          <button
            onClick={handleOpenAddModal}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 bg-[#7F56D9] hover:bg-[#6941C6] text-white text-[14px] font-semibold px-4 py-2 rounded-[8px] transition-colors shadow-sm border border-[#7F56D9]"
          >
            <Plus className="w-4 h-4" strokeWidth={2} />
            Add API key
          </button>
        }
      />

      <div className="w-full h-px bg-[#e5e5e5]" />

      {/* Content Section - Two Column Layout */}
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-[32px]">
        {/* Left Column - Description */}
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[14px] font-semibold text-[#404040] leading-[20px]">
            Your API keys
          </h2>
          <p className="text-[14px] text-[#525252] font-normal leading-[20px] max-w-[240px]">
            You can add and remove API keys whenever you like. Please keep your
            API keys secure.
          </p>
        </div>

        {/* Right Column - Table */}
        <div className="bg-white border border-[#E5E5E5] rounded-[12px] overflow-hidden shadow-sm">
          {apiKeys.length === 0 ? (
            <div className="py-12 px-6 text-center">
              <p className="text-[14px] text-[#525252]">
                No API keys yet. Create one to get started.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[#FAFAFA] border-b border-[#E5E5E5]">
                  <tr>
                    <th
                      scope="col"
                      className="pl-[20px] pr-[12px] sm:pr-[24px] py-[12px] text-[#525252] font-medium text-[12px] leading-[18px] uppercase tracking-wider"
                    >
                      Name
                    </th>
                    <th
                      scope="col"
                      className="hidden sm:table-cell px-[24px] py-[12px] text-[#525252] font-medium text-[12px] leading-[18px] uppercase tracking-wider w-[136px] whitespace-nowrap"
                    >
                      Date added
                    </th>
                    <th
                      scope="col"
                      className="px-[12px] sm:px-[24px] py-[12px] text-[#525252] font-medium text-[12px] leading-[18px] uppercase tracking-wider sm:w-[151px] whitespace-nowrap"
                    >
                      Last used
                    </th>
                    <th scope="col" className="w-[56px] sm:w-[66px] bg-[#FAFAFA]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E5E5]">
                  {apiKeys.map((apiKey) => (
                    <tr
                      key={apiKey.id}
                      className="hover:bg-[#FAFAFA] transition-colors"
                    >
                      <td className="pl-[20px] pr-[12px] sm:pr-[24px] py-[16px] align-top sm:align-middle">
                        <div className="flex flex-col leading-[20px] min-w-0">
                          <span className="font-medium text-[#171717] text-[14px] break-words">
                            {apiKey.label}
                          </span>
                          <span className="font-normal text-[#525252] text-[13px] sm:text-[14px] break-all">
                            od_live_{"*".repeat(8)}
                            {apiKey.keyHint}
                          </span>
                        </div>
                      </td>
                      <td className="hidden sm:table-cell px-[24px] py-[16px] whitespace-nowrap">
                        <span className="font-normal text-[#525252] text-[14px] leading-[20px]">
                          {apiKey.createdAt}
                        </span>
                      </td>
                      <td className="px-[12px] sm:px-[24px] py-[16px] whitespace-nowrap align-top sm:align-middle">
                        <span className="font-normal text-[#525252] text-[13px] sm:text-[14px] leading-[20px]">
                          {apiKey.lastUsedAt ?? "Never"}
                        </span>
                      </td>
                      <td className="pr-[16px] pl-[8px] py-[16px] text-right align-top sm:align-middle">
                        <button
                          onClick={() => setRevokeKeyId(apiKey.id)}
                          className="text-[#A3A3A3] hover:text-[#DC2626] transition-colors p-[6px] rounded-[6px] hover:bg-gray-100 flex items-center justify-center ml-auto"
                          title="Delete key"
                        >
                          <Trash2
                            className="w-[16px] h-[16px]"
                            strokeWidth={1.5}
                          />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add / Success Modal */}
      <ModalOverlay
        isOpen={createDialogOpen}
        onClose={() => {
          if (addStep !== "success") {
            setCreateDialogOpen(false);
          }
        }}
      >
        <div className="bg-white content-stretch flex flex-col items-center overflow-clip relative rounded-[16px] shadow-[0px_20px_24px_-4px_rgba(0,0,0,0.08),0px_8px_8px_-4px_rgba(0,0,0,0.03),0px_3px_3px_-1.5px_rgba(0,0,0,0.04)] size-full w-full">
          {addStep === "name" ? (
            <>
              {/* Header */}
              <div className="content-stretch flex flex-col items-center relative shrink-0 w-full">
                <div className="relative shrink-0 w-full">
                  <div className="content-stretch flex flex-col gap-[16px] items-start pt-[24px] px-[24px] relative w-full">
                    <div className="relative rounded-[8px] shrink-0 size-[40px]">
                      <div
                        aria-hidden="true"
                        className="absolute bg-white inset-0 pointer-events-none rounded-[8px]"
                      />
                      <div className="overflow-clip relative rounded-[inherit] size-full">
                        <div className="absolute left-[10px] overflow-clip size-[20px] top-[10px] text-[#404040]">
                          <Key className="w-5 h-5" strokeWidth={1.67} />
                        </div>
                      </div>
                      <div className="absolute inset-0 pointer-events-none rounded-[inherit] shadow-[inset_0px_0px_0px_1px_rgba(0,0,0,0.18),inset_0px_-2px_0px_0px_rgba(0,0,0,0.05)]" />
                      <div
                        aria-hidden="true"
                        className="absolute border border-[#d4d4d4] border-solid inset-0 pointer-events-none rounded-[8px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]"
                      />
                    </div>

                    <div className="content-stretch flex flex-col gap-[2px] items-start relative shrink-0 w-full">
                      <p className="font-semibold leading-[24px] relative shrink-0 text-[#171717] text-[16px] w-full">
                        Please enter your API key name
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setCreateDialogOpen(false)}
                  className="absolute content-stretch flex items-center justify-center overflow-clip p-[8px] right-[16px] rounded-[8px] size-[36px] top-[16px] hover:bg-gray-100 transition-colors"
                >
                  <div className="overflow-clip relative shrink-0 size-[20px] text-[#A3A3A3]">
                    <X className="w-5 h-5" strokeWidth={1.67} />
                  </div>
                </button>
                <div className="h-[20px] shrink-0 w-full" />
              </div>

              {/* Form Content */}
              <div className="relative shrink-0 w-full">
                <div className="content-stretch flex flex-col items-start px-[24px] relative w-full">
                  <div className="content-stretch flex flex-col gap-[16px] items-start relative shrink-0 w-full">
                    <div className="content-stretch flex flex-col gap-[6px] items-start relative shrink-0 w-full">
                      <div className="content-stretch flex gap-[2px] items-start relative shrink-0">
                        <label
                          htmlFor="keyName"
                          className="font-medium leading-[20px] relative shrink-0 text-[#404040] text-[14px]"
                        >
                          Name
                        </label>
                      </div>
                      <div className="bg-white relative rounded-[8px] shrink-0 w-full">
                        <div
                          aria-hidden="true"
                          className="absolute border border-[#d4d4d4] border-solid inset-0 pointer-events-none rounded-[8px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]"
                        />
                        <div className="flex flex-row items-center size-full relative z-10">
                          <div className="content-stretch flex gap-[8px] items-center relative w-full">
                            <input
                              id="keyName"
                              type="text"
                              placeholder="e.g., Production Server, CI/CD Pipeline"
                              value={newKeyName}
                              onChange={(e) => setNewKeyName(e.target.value)}
                              onKeyDown={(e) =>
                                e.key === "Enter" && handleCreateKey()
                              }
                              className="flex-[1_0_0] font-normal leading-[24px] px-[12px] py-[8px] min-h-px min-w-px overflow-hidden relative text-[#171717] text-[16px] text-left w-full outline-none bg-transparent rounded-[8px] focus:border-[#6941c6] focus:ring-4 focus:ring-[#f4ebff]"
                              autoFocus
                              autoComplete="off"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="content-stretch flex flex-col items-start pt-[32px] relative shrink-0 w-full">
                <div className="relative shrink-0 w-full">
                  <div className="content-stretch flex gap-[12px] items-start pb-[24px] px-[24px] relative w-full">
                    <button
                      onClick={() => setCreateDialogOpen(false)}
                      className="flex-[1_0_0] min-h-px min-w-px relative rounded-[8px] hover:bg-gray-50 transition-colors"
                    >
                      <div
                        aria-hidden="true"
                        className="absolute bg-white inset-0 pointer-events-none rounded-[8px] opacity-0"
                      />
                      <div className="flex flex-row items-center justify-center overflow-clip rounded-[inherit] size-full relative z-10">
                        <div className="content-stretch flex gap-[4px] items-center justify-center px-[14px] py-[10px] relative w-full">
                          <div className="content-stretch flex items-center justify-center px-[2px] relative shrink-0">
                            <p className="font-semibold leading-[20px] relative shrink-0 text-[#404040] text-[14px]">
                              Cancel
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="absolute inset-0 pointer-events-none rounded-[inherit] shadow-[inset_0px_0px_0px_1px_rgba(0,0,0,0.18),inset_0px_-2px_0px_0px_rgba(0,0,0,0.05)]" />
                      <div
                        aria-hidden="true"
                        className="absolute border border-[#d4d4d4] border-solid inset-0 pointer-events-none rounded-[8px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]"
                      />
                    </button>
                    <button
                      onClick={handleCreateKey}
                      disabled={creating}
                      className="flex-1 bg-[#7F56D9] hover:bg-[#6941C6] text-white text-[14px] font-semibold px-4 py-2.5 rounded-[8px] transition-colors shadow-sm border border-[#7F56D9] disabled:opacity-50"
                    >
                      {creating ? "Creating..." : "Add Key"}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Success State */}
              {/* Header */}
              <div className="content-stretch flex flex-col items-center relative shrink-0 w-full">
                <div className="relative shrink-0 w-full">
                  <div className="content-stretch flex flex-col gap-[16px] items-start pt-[24px] px-[24px] relative w-full">
                    <div className="relative rounded-[8px] shrink-0 size-[40px]">
                      <div
                        aria-hidden="true"
                        className="absolute bg-white inset-0 pointer-events-none rounded-[8px]"
                      />
                      <div className="overflow-clip relative rounded-[inherit] size-full">
                        <div className="absolute left-[10px] overflow-clip size-[20px] top-[10px] text-[#404040]">
                          <CheckCircle2
                            className="w-5 h-5"
                            strokeWidth={1.67}
                          />
                        </div>
                      </div>
                      <div className="absolute inset-0 pointer-events-none rounded-[inherit] shadow-[inset_0px_0px_0px_1px_rgba(0,0,0,0.18),inset_0px_-2px_0px_0px_rgba(0,0,0,0.05)]" />
                      <div
                        aria-hidden="true"
                        className="absolute border border-[#d4d4d4] border-solid inset-0 pointer-events-none rounded-[8px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]"
                      />
                    </div>

                    <div className="content-stretch flex flex-col gap-[2px] items-start relative shrink-0 w-full">
                      <p className="font-semibold leading-[24px] relative shrink-0 text-[#171717] text-[16px] w-full mb-1">
                        API Key created
                      </p>
                      <p className="font-normal leading-[20px] relative shrink-0 text-[#525252] text-[14px] w-full">
                        Your API Key has been created. Please copy the key and
                        save it securely.{" "}
                        <span className="font-bold text-[#171717]">
                          You&apos;ll never see this key again after closing this
                          modal.
                        </span>
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleCopyAndClose}
                  className="absolute content-stretch flex items-center justify-center overflow-clip p-[8px] right-[16px] rounded-[8px] size-[36px] top-[16px] hover:bg-gray-100 transition-colors"
                >
                  <div className="overflow-clip relative shrink-0 size-[20px] text-[#A3A3A3]">
                    <X className="w-5 h-5" strokeWidth={1.67} />
                  </div>
                </button>
                <div className="h-[20px] shrink-0 w-full" />
              </div>

              {/* Key Display */}
              <div className="relative shrink-0 w-full px-[24px]">
                <div className="flex flex-col gap-[6px] w-full">
                  <label className="font-medium leading-[20px] text-[#404040] text-[14px]">
                    API Key
                  </label>
                  <div className="flex items-start gap-0 w-full border border-[#d4d4d4] rounded-[8px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] bg-white overflow-hidden">
                    {/* The secret is shown in full and wraps freely on mobile so users
                        can verify the value without horizontal scrolling. */}
                    <code className="flex-1 font-mono text-[13px] leading-[20px] px-[12px] py-[10px] text-[#171717] bg-transparent break-all min-w-0 select-all">
                      {newlyCreatedKey ?? ""}
                    </code>
                    <button
                      onClick={() => {
                        if (newlyCreatedKey) {
                          copyToClipboard(newlyCreatedKey);
                        }
                      }}
                      className="shrink-0 flex items-center justify-center w-[40px] h-[40px] text-[#A3A3A3] hover:text-[#525252] hover:bg-[#fafafa] transition-colors rounded-r-[7px]"
                      title="Copy to clipboard"
                    >
                      <Copy className="w-4 h-4" strokeWidth={1.67} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="content-stretch flex flex-col items-start pt-[32px] relative shrink-0 w-full">
                <div className="relative shrink-0 w-full">
                  <div className="content-stretch flex gap-[12px] items-start pb-[24px] px-[24px] relative w-full">
                    <button
                      onClick={handleCopyAndClose}
                      className="w-full flex-1 bg-[#7F56D9] hover:bg-[#6941C6] text-white text-[14px] font-semibold px-4 py-2.5 rounded-[8px] transition-colors shadow-sm border border-[#7F56D9]"
                    >
                      Copy to clipboard & Close modal
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </ModalOverlay>

      {/* Delete Key Modal */}
      <ModalOverlay
        isOpen={revokeKeyId !== null}
        onClose={() => setRevokeKeyId(null)}
      >
        <div className="bg-white content-stretch flex flex-col items-center overflow-clip relative rounded-[16px] shadow-[0px_20px_24px_-4px_rgba(0,0,0,0.08),0px_8px_8px_-4px_rgba(0,0,0,0.03),0px_3px_3px_-1.5px_rgba(0,0,0,0.04)] size-full w-full">
          {/* Header */}
          <div className="content-stretch flex flex-col items-center relative shrink-0 w-full">
            <div className="relative shrink-0 w-full">
              <div className="content-stretch flex flex-col gap-[16px] items-start pt-[24px] px-[24px] relative w-full">
                <div className="relative rounded-[8px] shrink-0 size-[40px]">
                  <div
                    aria-hidden="true"
                    className="absolute bg-white inset-0 pointer-events-none rounded-[8px]"
                  />
                  <div className="overflow-clip relative rounded-[inherit] size-full">
                    <div className="absolute left-[10px] overflow-clip size-[20px] top-[10px] text-[#DC2626]">
                      <Trash2 className="w-5 h-5" strokeWidth={1.67} />
                    </div>
                  </div>
                  <div className="absolute inset-0 pointer-events-none rounded-[inherit] shadow-[inset_0px_0px_0px_1px_rgba(0,0,0,0.18),inset_0px_-2px_0px_0px_rgba(0,0,0,0.05)]" />
                  <div
                    aria-hidden="true"
                    className="absolute border border-[#d4d4d4] border-solid inset-0 pointer-events-none rounded-[8px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]"
                  />
                </div>

                <div className="content-stretch flex flex-col gap-[2px] items-start relative shrink-0 w-full">
                  <p className="font-semibold leading-[24px] relative shrink-0 text-[#171717] text-[16px] w-full">
                    Delete API key
                  </p>
                  <p className="font-normal leading-[20px] relative shrink-0 text-[#525252] text-[14px] w-full">
                    Are you sure you want to delete this key? Any applications
                    using this key will lose access. This action cannot be
                    undone.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setRevokeKeyId(null)}
              className="absolute content-stretch flex items-center justify-center overflow-clip p-[8px] right-[16px] rounded-[8px] size-[36px] top-[16px] hover:bg-gray-100 transition-colors"
            >
              <div className="overflow-clip relative shrink-0 size-[20px] text-[#A3A3A3]">
                <X className="w-5 h-5" strokeWidth={1.67} />
              </div>
            </button>
          </div>

          {/* Actions */}
          <div className="content-stretch flex flex-col items-start pt-[32px] relative shrink-0 w-full">
            <div className="relative shrink-0 w-full">
              <div className="content-stretch flex gap-[12px] items-start pb-[24px] px-[24px] relative w-full">
                <button
                  onClick={() => setRevokeKeyId(null)}
                  className="flex-[1_0_0] min-h-px min-w-px relative rounded-[8px] hover:bg-gray-50 transition-colors"
                >
                  <div
                    aria-hidden="true"
                    className="absolute bg-white inset-0 pointer-events-none rounded-[8px] opacity-0"
                  />
                  <div className="flex flex-row items-center justify-center overflow-clip rounded-[inherit] size-full relative z-10">
                    <div className="content-stretch flex gap-[4px] items-center justify-center px-[14px] py-[10px] relative w-full">
                      <div className="content-stretch flex items-center justify-center px-[2px] relative shrink-0">
                        <p className="font-semibold leading-[20px] relative shrink-0 text-[#404040] text-[14px]">
                          Cancel
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="absolute inset-0 pointer-events-none rounded-[inherit] shadow-[inset_0px_0px_0px_1px_rgba(0,0,0,0.18),inset_0px_-2px_0px_0px_rgba(0,0,0,0.05)]" />
                  <div
                    aria-hidden="true"
                    className="absolute border border-[#d4d4d4] border-solid inset-0 pointer-events-none rounded-[8px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]"
                  />
                </button>
                <button
                  onClick={handleRevokeKey}
                  disabled={revoking}
                  className="flex-[1_0_0] min-h-px min-w-px relative rounded-[8px] hover:bg-[#b91c1c] transition-colors disabled:opacity-50"
                >
                  <div
                    aria-hidden="true"
                    className="absolute bg-[#dc2626] inset-0 pointer-events-none rounded-[8px]"
                  />
                  <div className="flex flex-row items-center justify-center overflow-clip rounded-[inherit] size-full relative z-10">
                    <div className="content-stretch flex gap-[4px] items-center justify-center px-[14px] py-[10px] relative w-full">
                      <div className="content-stretch flex items-center justify-center px-[2px] relative shrink-0">
                        <p className="font-semibold leading-[20px] relative shrink-0 text-white text-[14px]">
                          {revoking ? "Deleting..." : "Delete"}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="absolute inset-0 pointer-events-none rounded-[inherit] shadow-[inset_0px_0px_0px_1px_rgba(0,0,0,0.18),inset_0px_-2px_0px_0px_rgba(0,0,0,0.05)]" />
                  <div
                    aria-hidden="true"
                    className="absolute border-2 border-[rgba(255,255,255,0.12)] border-solid inset-0 pointer-events-none rounded-[8px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]"
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </ModalOverlay>
    </div>
  );
}
