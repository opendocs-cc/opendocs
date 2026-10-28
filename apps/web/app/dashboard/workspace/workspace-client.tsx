"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  Download,
  X,
  FileImage,
  Check,
  Loader2,
  Lock,
  Sparkles,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { HexColorPicker } from "react-colorful";
import { toast } from "sonner";

import { API_BASE_URL } from "@/lib/config/api";
import {
  BRANDING_PRESETS,
  assessBrandColor,
  findMatchingPreset,
  mixWithWhite,
  type BrandingPreset,
} from "@/lib/branding-presets";
import { previewFontFamily } from "@/lib/export-font-faces";
import { FormRow } from "@/components/form-row";
import { CustomDomainCard } from "./custom-domain-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { SettingsCard } from "@/components/dashboard/settings-card";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { instanceHost } from "@opendocs/shared/config/instance";
import {
  EXPORT_FONTS,
  DEFAULT_EXPORT_FONT_ID,
  FREE_PLAN_EXPORT_DEFAULTS,
  normalizeWorkspaceSlug,
} from "@opendocs/shared/workspaces/validation";
// Same reason as `profile-sort-control.tsx`: avoid the barrel so we
// don't transitively pull `posts/service` → R2 storage → `node:crypto`
// into the client bundle.
import {
  POST_SORT_LABELS,
  POST_SORT_VALUES,
  DEFAULT_POST_SORT,
  parsePostSort,
  type PostSort,
} from "@opendocs/shared/posts/sort";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---- Preset brand colors ----
// Kept in lockstep with `THEMES` in doc-converter/app/themes.py. The
// converter is explicit that accent colors should be the *deepest usable*
// shade of their hue family (Untitled UI 800/900, sometimes 950) because
// long-form PDF/DOCX reading calms down on darker accents and gets
// garish on bright 600-tier shades. The UI picker must offer the same
// palette so what the user sees here is what they get in their exports.
//
// Users can still pick any hex via the custom color input below — these
// are just one-click presets.
const PRESET_COLORS = [
  { hex: "#1D2939", label: "Charcoal" }, // Gray 800
  { hex: "#14306E", label: "Navy" }, // Oxford Blue
  { hex: "#194185", label: "Blue" }, // Blue 900
  { hex: "#2E1C5C", label: "Purple" }, // Purple 950 (OpenDocs default)
  { hex: "#6F1574", label: "Berry" }, // Fuchsia 900
  { hex: "#7A271A", label: "Crimson" }, // Error 900
  { hex: "#772917", label: "Mahogany" }, // Orange-dark 900
  { hex: "#054F31", label: "Forest" }, // Success 900
] as const;

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_LOGO_SIZE = 2 * 1024 * 1024; // 2 MB

type WorkspaceClientProps = {
  initial: {
    id: string;
    name: string;
    slug: string;
    allowPublicDocuments: boolean;
    defaultSort: string;
    bio: string | null;
    brandColor: string;
    logoUrl: string | null;
    showLogoInExports: boolean;
    exportFontMain: string | null;
    exportFooterEnabled: boolean;
    exportFooterCompanyName: string | null;
    exportFooterTagline: string | null;
    exportFooterLinkUrl: string | null;
    exportFooterLinkLabel: string | null;
    role: "owner" | "admin" | "member";
    tier: "free" | "pro" | "team";
    deletionPreview: {
      workspaceId: string;
      name: string;
      slug: string;
      documentCount: number;
      memberCount: number;
      pendingInviteCount: number;
      apiKeyCount: number;
      canDelete: boolean;
      reason?: "not_owner" | "last_workspace";
    } | null;
  };
};

// Small Pro badge rendered next to gated setting titles. The purple pill
// matches the brand accent so it reads as a call to action without
// shouting — pair it with a disabled control + upgrade modal so the gate
// is obvious before the user clicks anything.
function ProBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#F4EBFF] text-[#6941C6] text-[10px] font-semibold uppercase tracking-wider"
      title="Pro feature"
    >
      <Sparkles className="w-2.5 h-2.5" />
      Pro
    </span>
  );
}

// Which Pro-only setting the user just tried to interact with — drives the
// copy in the upgrade modal so it feels specific instead of generic. On
// Free the export footer and the custom domain are locked; the rest of
// branding is open.
type UpgradeFeature = "footer" | "custom_domain";

const UPGRADE_FEATURE_COPY: Record<
  UpgradeFeature,
  { title: string; description: string }
> = {
  footer: {
    title: "Custom export footer is a Pro feature",
    description:
      "Free workspaces keep the \"Made with OpenDocs\" footer on exports. Upgrade to Pro to use your own company name, tagline, and link, or turn the footer off.",
  },
  custom_domain: {
    title: "Custom domains are a Pro feature",
    description:
      `Pro and Team workspaces can serve their documents on their own domain, like notes.yourcompany.com, with ${instanceHost()} links redirecting there. Upgrade to Pro to connect one.`,
  },
};

export function WorkspaceClient({ initial }: WorkspaceClientProps) {
  const router = useRouter();
  const isAdmin = initial.role === "owner" || initial.role === "admin";
  // Public posts and the default sort change what every visitor sees, so
  // the server keeps them with the owner alone.
  const isOwner = initial.role === "owner";
  const isFreePlan = initial.tier === "free";

  // Upgrade prompt — shown when a Free user clicks a gated control.
  // `upgradeFeature` drives the copy; `null` closes the modal.
  const [upgradeFeature, setUpgradeFeature] = useState<UpgradeFeature | null>(
    null,
  );
  const openUpgradeModal = (feature: UpgradeFeature) =>
    setUpgradeFeature(feature);

  // ---- Name ----
  const [workspaceName, setWorkspaceName] = useState(initial.name);
  const [editedName, setEditedName] = useState(initial.name);
  const [savingName, setSavingName] = useState(false);

  // ---- Slug (workspace ID — the URL segment) ----
  // Pattern: identical UX to onboarding. Three states:
  // - savedSlug is what the DB actually has.
  // - slugInput is what's in the input right now.
  // - slugCheck tracks async availability lookups (debounced).
  // The "Save" button opens a warning dialog because a slug change rewrites
  // every post URL under the workspace — we want admins to confirm.
  const [savedSlug, setSavedSlug] = useState(initial.slug);
  const [slugInput, setSlugInput] = useState(initial.slug);
  const [slugCheck, setSlugCheck] = useState<
    | { status: "idle" }
    | { status: "checking" }
    | { status: "available" }
    | { status: "unavailable"; reason: string }
  >({ status: "idle" });
  const [slugConfirmOpen, setSlugConfirmOpen] = useState(false);
  const [savingSlug, setSavingSlug] = useState(false);

  // ---- Public documents ----
  const [allowPublicDocuments, setAllowPublicDocuments] = useState(
    initial.allowPublicDocuments,
  );
  const [togglingPublic, setTogglingPublic] = useState(false);

  // ---- Default sort ----
  // Initial value is validated through `parsePostSort` so a hand-edited
  // DB row with a stale sort key degrades to the global default in the
  // UI rather than rendering as an empty select.
  const [defaultSort, setDefaultSort] = useState<PostSort>(
    parsePostSort(initial.defaultSort) ?? DEFAULT_POST_SORT,
  );
  const [savingDefaultSort, setSavingDefaultSort] = useState(false);

  // ---- Workspace bio ----
  const [bio, setBio] = useState(initial.bio ?? "");
  const [savedBio, setSavedBio] = useState(initial.bio ?? "");
  const [savingBio, setSavingBio] = useState(false);

  // ---- Brand color ----
  // Every plan can brand its exports; only the footer is Pro.
  const initialBrandColor = initial.brandColor;
  const [brandColor, setBrandColor] = useState(initialBrandColor);
  const [customColorInput, setCustomColorInput] = useState(
    PRESET_COLORS.some((p) => p.hex === initialBrandColor)
      ? "#7F56D9"
      : initialBrandColor,
  );
  const [savingColor, setSavingColor] = useState(false);
  const isCustomColor = !PRESET_COLORS.some((p) => p.hex === brandColor);
  // Popover-based custom color picker. We defer the save until the
  // popover closes (or the user hits Enter in the hex field) so we don't
  // fire an API call on every pixel of the saturation pad drag.
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  // ---- Logo ----
  const [logoUrl, setLogoUrl] = useState<string | null>(initial.logoUrl);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- Logo in exports ----
  const [showLogoInExports, setShowLogoInExports] = useState(initial.showLogoInExports);
  const [togglingExportLogo, setTogglingExportLogo] = useState(false);

  // ---- Export font ----
  const [exportFont, setExportFont] = useState<string>(
    initial.exportFontMain ?? DEFAULT_EXPORT_FONT_ID,
  );
  const [savingFont, setSavingFont] = useState(false);

  // ---- Branding presets ----
  // A preset is a saved brand color + export font pair; applying one
  // writes both settings through their existing endpoints.
  const [applyingPresetId, setApplyingPresetId] = useState<string | null>(
    null,
  );
  const activePreset = findMatchingPreset(brandColor, exportFont);

  // ---- Export footer ----
  // Free workspaces are pinned to the OpenDocs-branded footer values (see
  // FREE_PLAN_EXPORT_DEFAULTS). Pro/Team show whatever's saved in the DB.
  const freeFooter = FREE_PLAN_EXPORT_DEFAULTS;
  const [footerEnabled, setFooterEnabled] = useState(
    isFreePlan ? freeFooter.exportFooterEnabled : initial.exportFooterEnabled,
  );
  const [footerCompanyName, setFooterCompanyName] = useState(
    isFreePlan
      ? freeFooter.exportFooterCompanyName
      : (initial.exportFooterCompanyName ?? ""),
  );
  const [footerTagline, setFooterTagline] = useState(
    isFreePlan
      ? freeFooter.exportFooterTagline
      : (initial.exportFooterTagline ?? ""),
  );
  const [footerLinkUrl, setFooterLinkUrl] = useState(
    isFreePlan
      ? freeFooter.exportFooterLinkUrl
      : (initial.exportFooterLinkUrl ?? ""),
  );
  const [footerLinkLabel, setFooterLinkLabel] = useState(
    isFreePlan
      ? freeFooter.exportFooterLinkLabel
      : (initial.exportFooterLinkLabel ?? ""),
  );
  const [savedFooter, setSavedFooter] = useState({
    companyName: isFreePlan
      ? freeFooter.exportFooterCompanyName
      : (initial.exportFooterCompanyName ?? ""),
    tagline: isFreePlan
      ? freeFooter.exportFooterTagline
      : (initial.exportFooterTagline ?? ""),
    linkUrl: isFreePlan
      ? freeFooter.exportFooterLinkUrl
      : (initial.exportFooterLinkUrl ?? ""),
    linkLabel: isFreePlan
      ? freeFooter.exportFooterLinkLabel
      : (initial.exportFooterLinkLabel ?? ""),
  });
  const [savingFooter, setSavingFooter] = useState(false);
  const [togglingFooter, setTogglingFooter] = useState(false);
  const hasFooterChanges =
    footerCompanyName !== savedFooter.companyName ||
    footerTagline !== savedFooter.tagline ||
    footerLinkUrl !== savedFooter.linkUrl ||
    footerLinkLabel !== savedFooter.linkLabel;

  // ---- Delete workspace ----
  const deletionPreview = initial.deletionPreview;
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [deletingWorkspace, setDeletingWorkspace] = useState(false);
  const canOpenDeleteDialog =
    initial.role === "owner" && Boolean(deletionPreview?.canDelete);
  const deleteConfirmationMatches =
    deleteConfirmInput.trim() === deletionPreview?.slug;

  // Derive if anything changed (for the save/reset footer)
  const hasChanges = editedName !== workspaceName || bio !== savedBio;

  // Links like /dashboard/workspace#export-branding (Home's getting-started
  // step): the dashboard scrolls inside <main>, which the browser's own
  // fragment scroll doesn't move.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, []);

  // Debounced slug availability check. Mirrors the onboarding picker: fire
  // 300ms after the last keystroke, skip the roundtrip if the input matches
  // the saved value (that's always "available" for us), and abort if the
  // user types again before the response lands.
  useEffect(() => {
    const normalized = normalizeWorkspaceSlug(slugInput);
    if (normalized === savedSlug) {
      setSlugCheck({ status: "idle" });
      return;
    }
    if (!normalized) {
      setSlugCheck({ status: "idle" });
      return;
    }
    setSlugCheck({ status: "checking" });
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/workspace/check-slug?slug=${encodeURIComponent(normalized)}`,
          { credentials: "include", signal: controller.signal },
        );
        if (!res.ok) throw new Error();
        const data = (await res.json()) as {
          available: boolean;
          reason?: string;
        };
        if (data.available) {
          setSlugCheck({ status: "available" });
        } else {
          setSlugCheck({
            status: "unavailable",
            reason: data.reason ?? "Unavailable",
          });
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setSlugCheck({ status: "idle" });
      }
    }, 300);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [slugInput, savedSlug]);

  // ---------- Handlers ----------

  const handleSave = async () => {
    if (!editedName.trim()) {
      toast.error("Workspace name cannot be empty");
      return;
    }
    setSavingName(true);
    try {
      // Save name if changed
      if (editedName !== workspaceName) {
        const res = await fetch(`${API_BASE_URL}/api/v1/workspace`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId: initial.id, name: editedName }),
        });
        if (!res.ok) throw new Error();
        setWorkspaceName(editedName);
      }

      // Save bio if changed
      if (bio !== savedBio) {
        const res = await fetch(`${API_BASE_URL}/api/v1/workspace/bio`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: initial.id,
            bio: bio.trim() || null,
          }),
        });
        if (!res.ok) throw new Error();
        setSavedBio(bio);
      }

      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSavingName(false);
    }
  };

  const handleReset = () => {
    setEditedName(workspaceName);
    setBio(savedBio);
  };

  const handleTogglePublicDocs = async (checked: boolean) => {
    setTogglingPublic(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/workspace/public-documents`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId: initial.id, allowed: checked }),
        },
      );
      if (!res.ok) throw new Error();
      setAllowPublicDocuments(checked);
      toast.success(
        checked ? "Public documents enabled" : "Public documents disabled",
      );
    } catch {
      toast.error("Failed to update setting");
    } finally {
      setTogglingPublic(false);
    }
  };

  // Save the default sort and optimistically update the local state.
  // On failure we revert so the select doesn't drift from the
  // server's truth — a quiet failure here would mean the workspace
  // visitor still sees the old order, which is more confusing than
  // just bouncing the dropdown back.
  const handleChangeDefaultSort = async (value: PostSort) => {
    const previous = defaultSort;
    setDefaultSort(value);
    setSavingDefaultSort(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/workspace/default-sort`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: initial.id, value }),
      });
      if (!res.ok) throw new Error();
      toast.success("Default sort updated");
    } catch {
      setDefaultSort(previous);
      toast.error("Failed to update default sort");
    } finally {
      setSavingDefaultSort(false);
    }
  };

  // ---- Brand color ----
  const saveBrandColor = async (hex: string) => {
    setSavingColor(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/workspace/brand-color`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: initial.id, color: hex }),
      });
      if (!res.ok) throw new Error();
      setBrandColor(hex);
      toast.success("Brand color updated");
    } catch {
      toast.error("Failed to update brand color");
    } finally {
      setSavingColor(false);
    }
  };

  const handlePresetClick = (hex: string) => {
    if (!isAdmin || savingColor) return;
    saveBrandColor(hex);
  };

  const handleCustomColorChange = (hex: string) => {
    setCustomColorInput(hex);
  };

  const handleCustomColorCommit = () => {
    if (!isAdmin || savingColor) return;
    const cleaned = customColorInput.trim();
    if (/^#[0-9A-Fa-f]{6}$/.test(cleaned)) {
      saveBrandColor(cleaned);
    }
  };

  // ---- Sample PDF ----
  // A real export of a built-in document with the saved branding, so the
  // effect of each setting is one click away.
  const [downloadingSample, setDownloadingSample] = useState(false);
  const handleDownloadSample = async () => {
    setDownloadingSample(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/workspace/branding/sample.pdf?workspaceId=${encodeURIComponent(initial.id)}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`status ${res.status}`);
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `${savedSlug}-branding-sample.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      toast.error("Couldn't create the sample PDF. Try again in a moment.");
    } finally {
      setDownloadingSample(false);
    }
  };

  // ---- Logo upload ----
  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      return "Please upload a JPEG, PNG, or WebP image.";
    }
    if (file.size > MAX_LOGO_SIZE) {
      return "Image must be under 2 MB.";
    }
    return null;
  };

  const handleLogoUpload = async (file: File) => {
    const error = validateFile(file);
    if (error) {
      toast.error(error);
      return;
    }
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("workspaceId", initial.id);
      formData.append("file", file);
      const res = await fetch(`${API_BASE_URL}/api/v1/workspace/logo/upload`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        if (res.status === 503 || body?.error === "storage_not_configured") {
          throw new Error("Image storage is not configured on the server yet.");
        }
        if (res.status === 403) {
          throw new Error("Only admins can change the workspace logo.");
        }
        if (res.status === 413) {
          throw new Error("Image must be under 2 MB.");
        }
        throw new Error(body?.message ?? "Upload failed");
      }
      const data = (await res.json()) as { logoUrl: string };
      setLogoUrl(data.logoUrl);
      toast.success("Logo updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload logo");
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/workspace/logo`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: initial.id, logoUrl: null }),
      });
      if (!res.ok) throw new Error();
      setLogoUrl(null);
      toast.success("Logo removed");
    } catch {
      toast.error("Failed to remove logo");
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleLogoUpload(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleLogoUpload(file);
    e.target.value = "";
  };

  // ---- Slug (workspace ID) ----
  const handleSlugSave = async () => {
    if (!isAdmin) return;
    const normalized = normalizeWorkspaceSlug(slugInput);
    if (!normalized || normalized === savedSlug) return;
    if (slugCheck.status === "unavailable") return;
    setSavingSlug(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/workspace/slug`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: initial.id, slug: normalized }),
      });
      const data = (await res.json().catch(() => null)) as {
        slug?: string;
        error?: string;
        message?: string;
      } | null;
      if (!res.ok) {
        const msg =
          res.status === 403
            ? "Only workspace owners and admins can change the workspace ID."
            : res.status === 409
              ? "That workspace ID is already taken."
              : (data?.message ?? "Failed to update workspace ID.");
        throw new Error(msg);
      }
      const newSlug = data?.slug ?? normalized;
      setSavedSlug(newSlug);
      setSlugInput(newSlug);
      setSlugConfirmOpen(false);
      toast.success("Workspace ID updated");
      // Re-fetch server-rendered chrome (nav, URL previews elsewhere) so
      // every place that shows the old slug picks up the new one.
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update workspace ID",
      );
    } finally {
      setSavingSlug(false);
    }
  };

  // ---- Export font ----
  const handleFontChange = async (fontId: string) => {
    if (!isAdmin || savingFont || fontId === exportFont) return;
    setSavingFont(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/workspace/export-font`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: initial.id, font: fontId }),
      });
      if (!res.ok) throw new Error();
      setExportFont(fontId);
      toast.success("Export font updated");
    } catch {
      toast.error("Failed to update export font");
    } finally {
      setSavingFont(false);
    }
  };

  // ---- Branding presets ----
  const handleApplyPreset = async (preset: BrandingPreset) => {
    if (!isAdmin || applyingPresetId) return;
    if (activePreset?.id === preset.id) return;
    setApplyingPresetId(preset.id);
    try {
      if (brandColor.toLowerCase() !== preset.brandColor.toLowerCase()) {
        const res = await fetch(`${API_BASE_URL}/api/v1/workspace/brand-color`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: initial.id,
            color: preset.brandColor,
          }),
        });
        if (!res.ok) throw new Error();
        setBrandColor(preset.brandColor);
      }
      if (exportFont !== preset.fontId) {
        const res = await fetch(`${API_BASE_URL}/api/v1/workspace/export-font`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId: initial.id, font: preset.fontId }),
        });
        if (!res.ok) throw new Error();
        setExportFont(preset.fontId);
      }
      toast.success(`${preset.name} preset applied`);
    } catch {
      toast.error("Couldn't apply the preset. Please try again.");
    } finally {
      setApplyingPresetId(null);
    }
  };

  // ---- Export footer ----
  const handleToggleFooter = async (checked: boolean) => {
    if (!isAdmin) return;
    if (isFreePlan) {
      openUpgradeModal("footer");
      return;
    }
    setTogglingFooter(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/workspace/export-footer`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: initial.id,
            enabled: checked,
            companyName: footerCompanyName || null,
            tagline: footerTagline || null,
            linkUrl: footerLinkUrl || null,
            linkLabel: footerLinkLabel || null,
          }),
        },
      );
      if (!res.ok) throw new Error();
      setFooterEnabled(checked);
      toast.success(checked ? "Footer enabled" : "Footer disabled");
    } catch {
      toast.error("Failed to update footer setting");
    } finally {
      setTogglingFooter(false);
    }
  };

  const handleSaveFooter = async () => {
    if (!isAdmin || savingFooter) return;
    if (isFreePlan) {
      openUpgradeModal("footer");
      return;
    }
    setSavingFooter(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/workspace/export-footer`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: initial.id,
            enabled: footerEnabled,
            companyName: footerCompanyName || null,
            tagline: footerTagline || null,
            linkUrl: footerLinkUrl || null,
            linkLabel: footerLinkLabel || null,
          }),
        },
      );
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        message?: string;
        issues?: unknown;
      } | null;
      if (!res.ok) {
        throw new Error(data?.message ?? "Failed to save footer settings");
      }
      setSavedFooter({
        companyName: footerCompanyName,
        tagline: footerTagline,
        linkUrl: footerLinkUrl,
        linkLabel: footerLinkLabel,
      });
      toast.success("Footer settings saved");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save footer settings",
      );
    } finally {
      setSavingFooter(false);
    }
  };

  // ---- Logo in exports ----
  const handleToggleExportLogo = async (checked: boolean) => {
    setTogglingExportLogo(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/workspace/logo-in-exports`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId: initial.id, show: checked }),
        },
      );
      if (!res.ok) throw new Error();
      setShowLogoInExports(checked);
      toast.success(
        checked ? "Logo will appear in exports" : "Logo hidden from exports",
      );
    } catch {
      toast.error("Failed to update setting");
    } finally {
      setTogglingExportLogo(false);
    }
  };

  const handleDeleteWorkspace = async () => {
    if (!deletionPreview || !deleteConfirmationMatches) return;
    setDeletingWorkspace(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/workspace`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: initial.id,
          confirmSlug: deleteConfirmInput.trim(),
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | {
            success?: true;
            nextWorkspaceId?: string;
            error?: string;
          }
        | null;

      if (!res.ok || !data?.success || !data.nextWorkspaceId) {
        const message =
          data?.error === "last_workspace"
            ? "Create or join another workspace before deleting this one."
            : data?.error === "confirmation_mismatch"
              ? "Type the workspace ID exactly to confirm deletion."
              : data?.error === "forbidden"
                ? "Only the workspace owner can delete this workspace."
                : "Failed to delete workspace";
        throw new Error(message);
      }

      await fetch("/api/workspace/switch", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: data.nextWorkspaceId }),
      }).catch(() => null);

      toast.success("Workspace deleted");
      setDeleteDialogOpen(false);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete workspace",
      );
    } finally {
      setDeletingWorkspace(false);
    }
  };

  return (
    <>
      <div className="w-full min-h-full">
        <div className="max-w-[1000px] mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-10 flex flex-col gap-[32px]">
          {/* Header */}
          <PageHeader title="Workspace settings" description="Settings for everyone in this workspace." />

          <SettingsCard
            title="General"
            description="The workspace's name, web address, logo and bio."
            footer={
              <>
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
                  disabled={!hasChanges || savingName || !isAdmin}
                  className="w-full sm:w-auto bg-[#7F56D9] hover:bg-[#6941C6] text-white rounded-[8px] px-4 py-2 text-[14px] font-semibold transition-colors disabled:opacity-60"
                >
                  {savingName ? "Saving..." : "Save changes"}
                </button>
              </div>
              </>
            }
          >
            {/* ---- Workspace name ---- */}
            <FormRow
              title="Workspace name"
              description="This is the display name of your workspace."
            >
              <input
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                disabled={!isAdmin}
                autoComplete="off"
                className="w-full max-w-[320px] border border-[#d4d4d4] rounded-[8px] px-[14px] py-[10px] text-[16px] text-[#171717] placeholder:text-[#737373] outline-none focus:border-[#6941c6] focus:ring-4 focus:ring-[#f4ebff] transition-all disabled:bg-gray-50 disabled:text-[#a3a3a3] disabled:cursor-not-allowed"
              />
              {!isAdmin && (
                <p className="text-[13px] text-[#a3a3a3] mt-1.5">
                  Only workspace owners and admins can change the name.
                </p>
              )}
            </FormRow>

            {/* ---- Workspace ID (slug) ---- */}
            <FormRow
              title="Workspace ID"
              description="Your workspace ID is the first segment of every document URL. It must be unique across OpenDocs and uses lowercase letters, numbers, hyphens, and underscores only."
            >
              <div className="flex flex-col gap-2 max-w-[420px]">
                <div className="relative">
                  <input
                    type="text"
                    value={slugInput}
                    onChange={(e) =>
                      setSlugInput(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9_-]/g, ""),
                      )
                    }
                    disabled={!isAdmin || savingSlug}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="my-workspace"
                    className="w-full border border-[#d4d4d4] rounded-[8px] px-[14px] py-[10px] pr-[40px] text-[16px] font-mono text-[#171717] placeholder:text-[#737373] outline-none focus:border-[#6941c6] focus:ring-4 focus:ring-[#f4ebff] transition-all disabled:bg-gray-50 disabled:text-[#a3a3a3] disabled:cursor-not-allowed"
                  />
                  {/* Inline availability indicator */}
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {slugCheck.status === "checking" && (
                      <Loader2 className="w-4 h-4 text-[#a3a3a3] animate-spin" />
                    )}
                    {slugCheck.status === "available" && (
                      <Check className="w-4 h-4 text-[#16A34A]" />
                    )}
                    {slugCheck.status === "unavailable" && (
                      <X className="w-4 h-4 text-[#DC2626]" />
                    )}
                  </div>
                </div>

                {/* URL preview — matches onboarding */}
                <div className="px-3 py-2.5 bg-[#fafafa] border border-[#e5e5e5] rounded-lg">
                  <p className="text-[13px] text-[#525252] font-mono break-all sm:break-normal">
                    {instanceHost()}/
                    <span className="text-[#7F56D9] font-semibold">
                      {slugInput || savedSlug || "your-workspace"}
                    </span>
                    /your-doc
                  </p>
                </div>

                {slugCheck.status === "unavailable" && (
                  <p className="text-[13px] text-[#DC2626]">
                    {slugCheck.reason}
                  </p>
                )}

                {isAdmin && (
                  <div className="flex flex-wrap items-center gap-3 mt-1">
                    <button
                      type="button"
                      onClick={() => setSlugConfirmOpen(true)}
                      disabled={
                        savingSlug ||
                        slugCheck.status !== "available" ||
                        normalizeWorkspaceSlug(slugInput) === savedSlug
                      }
                      className="w-full sm:w-auto bg-[#7F56D9] hover:bg-[#6941C6] text-white rounded-[8px] px-4 py-2 text-[14px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {savingSlug ? "Saving..." : "Change workspace ID"}
                    </button>
                    {normalizeWorkspaceSlug(slugInput) !== savedSlug && (
                      <button
                        type="button"
                        onClick={() => setSlugInput(savedSlug)}
                        disabled={savingSlug}
                        className="text-[14px] text-[#525252] hover:text-[#171717] transition-colors disabled:opacity-50"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                )}

                {!isAdmin && (
                  <p className="text-[13px] text-[#a3a3a3] mt-1">
                    Only workspace owners and admins can change the workspace
                    ID.
                  </p>
                )}
              </div>
            </FormRow>

            {/* ---- Workspace logo ---- */}
            <FormRow
              title="Workspace logo"
              description="Upload a square logo. Used as your workspace identity and optionally in exported PDFs and Word documents."
            >
              <div className="flex items-start gap-4">
                {/* Preview / upload zone */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (isAdmin) setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={isAdmin ? handleFileDrop : undefined}
                  onClick={() => isAdmin && fileInputRef.current?.click()}
                  className={`relative w-[72px] h-[72px] rounded-xl border-2 flex items-center justify-center overflow-hidden transition-all flex-shrink-0 ${
                    isAdmin ? "cursor-pointer" : "cursor-default"
                  } ${
                    dragOver
                      ? "border-[#7F56D9] bg-[#F9F5FF]"
                      : logoUrl
                        ? "border-[#e5e5e5]"
                        : "border-dashed border-[#d4d4d4] bg-gray-50 hover:border-[#a3a3a3]"
                  }`}
                >
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt="Workspace logo"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <FileImage className="w-6 h-6 text-[#a3a3a3]" />
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
                      disabled={!isAdmin || uploading}
                      className="flex items-center gap-2 px-3 py-1.5 border border-[#d4d4d4] rounded-[8px] text-[14px] font-medium text-[#404040] hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      {logoUrl ? "Replace" : "Upload"}
                    </button>
                    {logoUrl && (
                      <button
                        onClick={handleRemoveLogo}
                        disabled={!isAdmin}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-[#d4d4d4] rounded-[8px] text-[14px] font-medium text-[#404040] hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

            {/* ---- Workspace bio ---- */}
            <FormRow
              title="Workspace bio"
              description="A short description for this workspace. Shown on the workspace profile to people who can access it."
            >
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                disabled={!isAdmin}
                placeholder="Tell members and visitors what this workspace is about..."
                maxLength={500}
                rows={3}
                className="w-full max-w-[480px] border border-[#d4d4d4] rounded-[8px] px-[14px] py-[10px] text-[16px] text-[#171717] placeholder:text-[#737373] outline-none focus:border-[#6941c6] focus:ring-4 focus:ring-[#f4ebff] transition-all resize-none disabled:bg-gray-50 disabled:text-[#a3a3a3] disabled:cursor-not-allowed"
              />
              <p className="text-[13px] text-[#a3a3a3] mt-1">
                {bio.length}/500 characters
              </p>
              {!isAdmin && (
                <p className="text-[13px] text-[#a3a3a3] mt-1">
                  Only workspace owners and admins can edit the bio.
                </p>
              )}
            </FormRow>
          </SettingsCard>

          <SettingsCard
            title="Sharing"
            description="Who can see this workspace's documents, and how its public page lists them."
          >
            {/* ---- Public documents ---- */}
            <FormRow
              title="Allow public posts"
              description="Controls whether documents can be published publicly and whether your workspace profile is visible to anyone on the web."
              align="center"
            >
              <div className="flex items-center gap-3">
                <Switch
                  checked={allowPublicDocuments}
                  onCheckedChange={handleTogglePublicDocs}
                  disabled={!isOwner || togglingPublic}
                  className="data-[state=checked]:bg-[#7F56D9]"
                />
                <span className="text-[14px] text-[#525252]">
                  {allowPublicDocuments ? "Enabled" : "Disabled"}
                </span>
              </div>
              {!isOwner && (
                <p className="text-[13px] text-[#a3a3a3] mt-2">
                  Only the workspace owner can change this.
                </p>
              )}
              {!allowPublicDocuments && (
                <p className="text-[13px] text-amber-600 mt-2">
                  Your workspace profile is private. Only workspace members
                  can access documents. Enable to make your profile public and
                  allow public document sharing.
                </p>
              )}
            </FormRow>

            {/* ---- Default article sort ----
              Workspace-wide default applied when a visitor lands on
              /{workspace} without a `?sort=` URL override. The
              profile page uses this as the second tier of its sort
              cascade (URL → this → global default), so visitors see
              whatever the owner picked here unless they explicitly
              deviate via the dropdown above the article list. */}
            <FormRow
              title="Default article sort"
              description="The order articles appear in on your workspace profile. Visitors can override this from the sort dropdown above the article list."
              align="center"
            >
              {/* Trigger styled to match the form-field aesthetic
                used elsewhere in the dashboard (documents publish
                dialog, etc.) — `#d4d4d4` border, soft shadow,
                `#f4ebff` purple focus ring. The default shadcn
                trigger looked too minimal next to the surrounding
                rich settings rows. */}
              <Select
                value={defaultSort}
                onValueChange={(v: string) => {
                  const parsed = parsePostSort(v);
                  if (parsed) void handleChangeDefaultSort(parsed);
                }}
                disabled={!isOwner || savingDefaultSort}
              >
                <SelectTrigger className="w-full max-w-[280px] h-auto rounded-[8px] border-[#d4d4d4] bg-white px-[12px] py-[8px] text-[14px] font-medium text-[#171717] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] focus:border-[#6941c6] focus:ring-4 focus:ring-[#f4ebff] transition-all">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dashboard-light">
                  {POST_SORT_VALUES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {POST_SORT_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isOwner && (
                <p className="text-[13px] text-[#a3a3a3] mt-1">
                  Only the workspace owner can change this.
                </p>
              )}
            </FormRow>
          </SettingsCard>

          <SettingsCard
            id="export-branding"
            title="Export branding"
            description="How PDF and Word exports from this workspace look. Agents use the same settings."
            action={
              <button
                type="button"
                onClick={handleDownloadSample}
                disabled={downloadingSample}
                className="inline-flex w-full items-center justify-center gap-2 rounded-[8px] border border-[#d4d4d4] bg-white px-3.5 py-2 text-[14px] font-semibold text-[#404040] shadow-sm transition-colors hover:bg-[#fafafa] disabled:opacity-60 sm:w-auto"
              >
                {downloadingSample ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {downloadingSample ? "Creating PDF…" : "Download sample PDF"}
              </button>
            }
          >
            {/* ---- Logo in exports ---- */}
            <FormRow
              title="Show logo in exports"
              description="When enabled, your workspace logo will appear in the top-right corner of exported PDFs and Word documents."
            >
              <div className="flex items-center gap-3">
                <Switch
                  checked={showLogoInExports}
                  onCheckedChange={handleToggleExportLogo}
                  disabled={!isAdmin || togglingExportLogo}
                  className="data-[state=checked]:bg-[#7F56D9]"
                />
                <span className="text-[14px] text-[#525252]">
                  {showLogoInExports ? "Enabled" : "Disabled"}
                </span>
              </div>
              {!logoUrl && showLogoInExports && (
                <p className="text-[13px] text-amber-600 mt-2">
                  Upload a logo above for it to appear in exports.
                </p>
              )}
            </FormRow>
            {/* ---- Branding presets ----
              Curated brand color + font pairs. Each card previews a
              document heading, body copy and a table header in the
              preset's accent and typeface, roughly as the converter
              renders them. Picking one updates the two settings below. */}
            <FormRow
              title="Branding presets"
              description="Start from a tested color and font pairing for your PDF and Word exports. You can fine-tune the brand color and font below."
            >
              <div
                role="radiogroup"
                aria-label="Branding presets"
                className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-3 gap-3"
              >
                {BRANDING_PRESETS.map((preset) => {
                  const isActive = activePreset?.id === preset.id;
                  const isApplying = applyingPresetId === preset.id;
                  const font = EXPORT_FONTS.find((f) => f.id === preset.fontId);
                  const fontFamily = previewFontFamily(
                    preset.fontId,
                    font?.cssStack ?? "sans-serif",
                  );
                  const tint = mixWithWhite(preset.brandColor, 0.94);
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      disabled={!isAdmin || Boolean(applyingPresetId)}
                      onClick={() => handleApplyPreset(preset)}
                      className={`group relative flex flex-col overflow-hidden rounded-[12px] border text-left transition-all duration-200 disabled:cursor-not-allowed active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#f4ebff] ${
                        isActive
                          ? "border-[#7F56D9] ring-2 ring-[#F4EBFF]"
                          : "border-[#e5e5e5] hover:border-[#d4d4d4] hover:shadow-[0px_4px_12px_-4px_rgba(16,24,40,0.12)]"
                      } ${applyingPresetId && !isApplying ? "opacity-60" : ""}`}
                    >
                      {/* Mini document page */}
                      <div
                        className="border-b border-[#f0f0f0] bg-[#fcfcfc] px-3 pt-3 pb-2.5"
                        style={{ fontFamily }}
                        aria-hidden
                      >
                        <div className="rounded-[6px] bg-white px-3 py-2.5 shadow-[0px_1px_2px_rgba(16,24,40,0.06)] ring-1 ring-black/[0.04]">
                          <p
                            className="text-[15px] font-semibold leading-tight"
                            style={{ color: preset.brandColor }}
                          >
                            Quarterly review
                          </p>
                          <p className="mt-1 text-[10.5px] leading-[1.45] text-[#404040]">
                            Revenue grew 18% across{" "}
                            <span
                              className="underline underline-offset-2"
                              style={{ color: preset.brandColor }}
                            >
                              two new regions
                            </span>
                            .
                          </p>
                          <div className="mt-2 overflow-hidden rounded-[3px] text-[9.5px] leading-none">
                            <div
                              className="flex justify-between px-1.5 py-[5px] font-semibold text-white"
                              style={{ backgroundColor: preset.brandColor }}
                            >
                              <span>Metric</span>
                              <span>Q3</span>
                            </div>
                            <div
                              className="flex justify-between px-1.5 py-[5px] text-[#404040]"
                              style={{ backgroundColor: tint }}
                            >
                              <span>ARR</span>
                              <span className="tabular-nums">$4.2M</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-1 flex-col gap-0.5 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[14px] font-semibold text-[#171717]">
                            {preset.name}
                          </span>
                          {isApplying ? (
                            <Loader2 className="h-4 w-4 animate-spin text-[#7F56D9]" />
                          ) : isActive ? (
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#7F56D9]">
                              <Check className="h-2.5 w-2.5 text-white" />
                            </span>
                          ) : null}
                        </div>
                        <p className="text-[12px] leading-[17px] text-[#737373]">
                          {preset.description}
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-[#a3a3a3]">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: preset.brandColor }}
                          />
                          {font?.label ?? preset.fontId}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
              {!isAdmin && (
                <p className="text-[13px] text-[#a3a3a3] mt-3">
                  Only workspace owners and admins can change branding.
                </p>
              )}
            </FormRow>

            {/* ---- Brand color ---- */}
            {/*
            The custom color picker uses a Radix Popover + react-colorful
            instead of the browser's native <input type="color">. Three
            reasons: (1) the native picker popup is OS-level and lands at
            unpredictable positions, (2) clicking a hidden `sr-only` color
            input can force the browser to scroll the page to bring it
            into view — that was the "scroll past the bottom" bug on this
            screen, and (3) the popover palette matches the rest of the
            dashboard visually. We defer the network save until the
            popover closes so dragging on the saturation pad doesn't fire
            an API call per pixel.
          */}
            <FormRow
              title="Brand color"
              description="Select or customize your brand color. This color is used as the accent in exported PDFs and Word documents — headings, links, and decorative elements."
              align="center"
            >
              <div className="flex flex-col gap-3">
                {/* Preset swatches */}
                <div className="flex items-center gap-2.5 flex-wrap">
                  {PRESET_COLORS.map((preset) => {
                    const isSelected = brandColor === preset.hex;
                    return (
                      <button
                        key={preset.hex}
                        title={preset.label}
                        disabled={!isAdmin || savingColor}
                        onClick={() => handlePresetClick(preset.hex)}
                        className={`w-8 h-8 rounded-full transition-all disabled:cursor-not-allowed ${
                          isSelected
                            ? "ring-2 ring-offset-2 ring-[#7F56D9] scale-110"
                            : "hover:scale-110"
                        }`}
                        style={{ backgroundColor: preset.hex }}
                      />
                    );
                  })}

                  {/* Divider */}
                  <div className="w-px h-6 bg-[#e5e5e5] mx-1" />

                  {/* Custom color (Popover-based picker) */}
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[14px] text-[#525252]"
                      style={{ paddingRight: "8px" }}
                    >
                      Custom
                    </span>
                    <Popover
                      open={colorPickerOpen}
                      onOpenChange={(next) => {
                        setColorPickerOpen(next);
                        // Commit on close so we only hit the API once.
                        if (!next) handleCustomColorCommit();
                      }}
                    >
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          disabled={!isAdmin}
                          aria-label="Pick custom color"
                          className={`w-8 h-8 rounded-full border-2 transition-all disabled:cursor-not-allowed ${
                            isCustomColor
                              ? "ring-2 ring-offset-2 ring-[#7F56D9] scale-110 border-transparent"
                              : "border-[#d4d4d4] hover:scale-110"
                          }`}
                          style={{
                            backgroundColor: isCustomColor
                              ? brandColor
                              : customColorInput,
                          }}
                        />
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        sideOffset={8}
                        className="dashboard-light w-auto p-3"
                      >
                        <HexColorPicker
                          color={
                            isCustomColor ? brandColor : customColorInput
                          }
                          onChange={handleCustomColorChange}
                        />
                        <div className="mt-3 flex items-center gap-2">
                          <span className="text-[13px] text-[#525252]">
                            Hex
                          </span>
                          <input
                            type="text"
                            value={
                              isCustomColor
                                ? brandColor.toUpperCase()
                                : customColorInput.toUpperCase()
                            }
                            onChange={(e) => {
                              let v = e.target.value;
                              if (!v.startsWith("#")) v = "#" + v;
                              handleCustomColorChange(v.slice(0, 7));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleCustomColorCommit();
                                setColorPickerOpen(false);
                              }
                            }}
                            disabled={!isAdmin}
                            maxLength={7}
                            autoComplete="off"
                            className="flex-1 border border-[#d4d4d4] rounded-[8px] px-[10px] py-[6px] text-[14px] font-mono text-[#171717] outline-none focus:border-[#6941c6] focus:ring-4 focus:ring-[#f4ebff] transition-all disabled:bg-gray-50 disabled:text-[#a3a3a3] disabled:cursor-not-allowed"
                          />
                        </div>
                      </PopoverContent>
                    </Popover>
                    {/* Hex label next to the trigger so the current value is
                      always visible without opening the popover. */}
                    {/* <span className="text-[13px] font-mono text-[#525252] tabular-nums">
                    {(isCustomColor
                      ? brandColor
                      : customColorInput
                    ).toUpperCase()}
                  </span> */}
                  </div>
                </div>

                {savingColor && (
                  <p className="text-[13px] text-[#a3a3a3]">Saving...</p>
                )}
                {/* Same rule the API enforces for agents: the brand color
                    is heading text on white and the background behind
                    white table-header text, so it has to be dark. */}
                {(() => {
                    const { contrast, level } = assessBrandColor(brandColor);
                    if (level === "great") return null;
                    return (
                      <p
                        className={`text-[13px] ${
                          level === "too_light" ? "text-[#B42318]" : "text-amber-700"
                        }`}
                      >
                        {level === "too_light"
                          ? `Too light for exports (${contrast}:1 on white): headings fade and white table-header text becomes hard to read. Pick a darker shade.`
                          : `Readable (${contrast}:1 on white), but a darker shade of this hue reads better in long documents.`}
                      </p>
                    );
                  })()}
              </div>
            </FormRow>

            {/* ---- Export font ---- */}
            {/*
            Card grid instead of a <select>: the whole point of picking a
            font is to see what it looks like before committing. Each card
            renders a preview string in its own cssStack so the choice is
            grounded in reality — LibreOffice will render the exact string
            in the exported PDF using the picked font.
          */}
            <FormRow
              title="Export font"
              description="The default font used in exported PDFs and Word documents. Applies to all documents in this workspace."
            >
              <div className="grid grid-cols-2 gap-3 max-w-[480px]">
                {EXPORT_FONTS.map((font) => {
                  const isSelected = exportFont === font.id;
                  return (
                    <button
                      key={font.id}
                      type="button"
                      disabled={!isAdmin || savingFont}
                      onClick={() => handleFontChange(font.id)}
                      className={`text-left border rounded-xl p-4 transition-all disabled:cursor-not-allowed ${
                        isSelected
                          ? "border-[#7F56D9] bg-[#F9F5FF] ring-2 ring-[#F4EBFF]"
                          : "border-[#e5e5e5] hover:border-[#d4d4d4] bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div
                          className="text-[20px] text-[#171717] leading-none"
                          style={{
                            fontFamily: previewFontFamily(font.id, font.cssStack),
                          }}
                        >
                          Aa
                        </div>
                        {isSelected && (
                          <div className="w-4 h-4 rounded-full bg-[#7F56D9] flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 text-white" />
                          </div>
                        )}
                      </div>
                      <p
                        className="text-[15px] font-semibold text-[#171717]"
                        style={{
                          fontFamily: previewFontFamily(font.id, font.cssStack),
                        }}
                      >
                        {font.label}
                      </p>
                      <p className="text-[12px] text-[#737373] mt-0.5">
                        {font.description}
                      </p>
                    </button>
                  );
                })}
              </div>
              {savingFont && (
                <p className="text-[13px] text-[#a3a3a3] mt-3">Saving...</p>
              )}
              {!isAdmin && (
                <p className="text-[13px] text-[#a3a3a3] mt-3">
                  Only workspace owners and admins can change the export font.
                </p>
              )}
            </FormRow>

            {/* ---- Export footer ---- */}
            {/*
            Configures the paragraph at the bottom of every exported PDF /
            DOCX. Line 1 is the company name (defaults to workspace name).
            Line 2 is the tagline + optional linked attribution ("Made with
            opendocs - opendocs.cc"-style). Turning the whole thing off
            blanks all three fields so the converter skips the paragraph.
          */}
            <FormRow
              title="Export footer"
              description="Customize the footer paragraph that appears at the bottom of every exported PDF and Word document."
              titleBadge={isFreePlan ? <ProBadge /> : null}
            >
              <div className="flex flex-col gap-4 max-w-[480px]">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={footerEnabled}
                    onCheckedChange={handleToggleFooter}
                    disabled={!isAdmin || togglingFooter}
                    className="data-[state=checked]:bg-[#7F56D9]"
                  />
                  <span className="text-[14px] text-[#525252]">
                    {footerEnabled ? "Footer enabled" : "Footer hidden"}
                  </span>
                </div>

                {footerEnabled && (
                  <div className="flex flex-col gap-3">
                    <div>
                      <label className="text-[13px] font-medium text-[#404040] block mb-1">
                        Company name
                      </label>
                      <input
                        type="text"
                        value={footerCompanyName}
                        onChange={(e) => setFooterCompanyName(e.target.value)}
                        disabled={!isAdmin}
                        placeholder={workspaceName}
                        maxLength={120}
                        autoComplete="off"
                        className="w-full border border-[#d4d4d4] rounded-[8px] px-[14px] py-[10px] text-[14px] text-[#171717] placeholder:text-[#737373] outline-none focus:border-[#6941c6] focus:ring-4 focus:ring-[#f4ebff] transition-all disabled:bg-gray-50 disabled:text-[#a3a3a3] disabled:cursor-not-allowed"
                      />
                      <p className="text-[12px] text-[#a3a3a3] mt-1">
                        Line 1 of the footer. Defaults to the workspace name.
                      </p>
                    </div>

                    <div>
                      <label className="text-[13px] font-medium text-[#404040] block mb-1">
                        Tagline
                      </label>
                      <input
                        type="text"
                        value={footerTagline}
                        onChange={(e) => setFooterTagline(e.target.value)}
                        disabled={!isAdmin}
                        placeholder="Made with opendocs"
                        maxLength={120}
                        autoComplete="off"
                        className="w-full border border-[#d4d4d4] rounded-[8px] px-[14px] py-[10px] text-[14px] text-[#171717] placeholder:text-[#737373] outline-none focus:border-[#6941c6] focus:ring-4 focus:ring-[#f4ebff] transition-all disabled:bg-gray-50 disabled:text-[#a3a3a3] disabled:cursor-not-allowed"
                      />
                      <p className="text-[12px] text-[#a3a3a3] mt-1">
                        Line 2 of the footer. Leave blank to skip.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[13px] font-medium text-[#404040] block mb-1">
                          Link URL
                        </label>
                        <input
                          type="url"
                          value={footerLinkUrl}
                          onChange={(e) => setFooterLinkUrl(e.target.value)}
                          disabled={!isAdmin}
                          placeholder="https://example.com"
                          maxLength={2048}
                          autoComplete="off"
                          className="w-full border border-[#d4d4d4] rounded-[8px] px-[14px] py-[10px] text-[14px] text-[#171717] placeholder:text-[#737373] outline-none focus:border-[#6941c6] focus:ring-4 focus:ring-[#f4ebff] transition-all disabled:bg-gray-50 disabled:text-[#a3a3a3] disabled:cursor-not-allowed"
                        />
                      </div>
                      <div>
                        <label className="text-[13px] font-medium text-[#404040] block mb-1">
                          Link label
                        </label>
                        <input
                          type="text"
                          value={footerLinkLabel}
                          onChange={(e) => setFooterLinkLabel(e.target.value)}
                          disabled={!isAdmin}
                          placeholder="example.com"
                          maxLength={120}
                          autoComplete="off"
                          className="w-full border border-[#d4d4d4] rounded-[8px] px-[14px] py-[10px] text-[14px] text-[#171717] placeholder:text-[#737373] outline-none focus:border-[#6941c6] focus:ring-4 focus:ring-[#f4ebff] transition-all disabled:bg-gray-50 disabled:text-[#a3a3a3] disabled:cursor-not-allowed"
                        />
                      </div>
                    </div>

                    {/* Live preview of the footer paragraph */}
                    <div className="mt-2 px-4 py-3 bg-[#fafafa] border border-[#e5e5e5] rounded-lg">
                      <p className="text-[11px] uppercase tracking-wider text-[#a3a3a3] mb-1.5">
                        Preview
                      </p>
                      <p className="text-[13px] text-[#171717] font-semibold">
                        {footerCompanyName || workspaceName}
                      </p>
                      <p className="text-[12px] text-[#737373] mt-0.5">
                        {footerTagline || (
                          <span className="italic">tagline</span>
                        )}
                        {footerLinkUrl && (
                          <>
                            {footerTagline ? " — " : ""}
                            <span className="underline">
                              {footerLinkLabel || footerLinkUrl}
                            </span>
                          </>
                        )}
                      </p>
                    </div>

                    {isAdmin && (
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={handleSaveFooter}
                          disabled={savingFooter || !hasFooterChanges}
                          className="w-full sm:w-auto bg-[#7F56D9] hover:bg-[#6941C6] text-white rounded-[8px] px-4 py-2 text-[14px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {savingFooter ? "Saving..." : "Save footer"}
                        </button>
                        {hasFooterChanges && (
                          <button
                            type="button"
                            onClick={() => {
                              setFooterCompanyName(savedFooter.companyName);
                              setFooterTagline(savedFooter.tagline);
                              setFooterLinkUrl(savedFooter.linkUrl);
                              setFooterLinkLabel(savedFooter.linkLabel);
                            }}
                            disabled={savingFooter}
                            className="text-[14px] text-[#525252] hover:text-[#171717] transition-colors disabled:opacity-50"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {!isAdmin && (
                  <p className="text-[13px] text-[#a3a3a3]">
                    Only workspace owners and admins can change footer
                    settings.
                  </p>
                )}
              </div>
            </FormRow>
          </SettingsCard>

          <CustomDomainCard
            workspaceId={initial.id}
            workspaceSlug={savedSlug}
            isAdmin={isAdmin}
            isFreePlan={isFreePlan}
            proBadge={<ProBadge />}
            onUpgrade={() => openUpgradeModal("custom_domain")}
          />

          {/* Danger zone */}
          <div className="bg-white rounded-xl border border-[#fecaca] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]">
            <div className="p-4 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fef2f2]">
                    <AlertTriangle className="h-5 w-5 text-[#dc2626]" />
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold uppercase tracking-wide text-[#dc2626]">
                      Danger zone
                    </p>
                    <h2 className="mt-1 text-[16px] font-semibold text-[#171717]">
                      Delete workspace
                    </h2>
                    <p className="mt-1 max-w-[620px] text-[14px] leading-[20px] text-[#525252]">
                      Permanently delete this workspace, its documents, team
                      memberships, pending invites, comments, API keys, and
                      settings. This cannot be undone.
                    </p>
                    {deletionPreview?.reason === "last_workspace" && (
                      <p className="mt-3 rounded-lg border border-[#fed7aa] bg-[#fffbeb] px-3 py-2 text-[13px] leading-[19px] text-[#92400e]">
                        You cannot delete your only workspace. Create or join
                        another workspace first, or delete your account from
                        Profile settings.
                      </p>
                    )}
                    {initial.role !== "owner" && (
                      <p className="mt-3 rounded-lg border border-[#e5e5e5] bg-[#fafafa] px-3 py-2 text-[13px] leading-[19px] text-[#737373]">
                        Only the workspace owner can delete this workspace.
                      </p>
                    )}
                    {initial.tier !== "free" && (
                      <p className="mt-3 text-[13px] leading-[19px] text-[#737373]">
                        Deleting a workspace does not cancel or downgrade your
                        OpenDocs plan. Manage billing separately if you no
                        longer need paid capacity.
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setDeleteConfirmInput("");
                    setDeleteDialogOpen(true);
                  }}
                  disabled={!canOpenDeleteDialog}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-[8px] border border-[#fca5a5] bg-white px-4 py-2 text-[14px] font-semibold text-[#b91c1c] transition-colors hover:bg-[#fef2f2] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete workspace
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/*
        Slug change confirmation — all existing post URLs will break. Lives
        OUTSIDE the min-h-full wrapper on purpose: Radix's Dialog Root mounts
        a bit of invisible state-machine DOM around `{children}` (focus
        scope, etc.) even when closed, which otherwise shows up in main's
        scrollHeight and leaves a dead whitespace gap below the card.
        Conditional mount is belt-and-braces for the same reason.
      */}
      {slugConfirmOpen && (
        <AlertDialog open={slugConfirmOpen} onOpenChange={setSlugConfirmOpen}>
          <AlertDialogContent className="dashboard-light">
            <AlertDialogHeader>
              <AlertDialogTitle>Change workspace ID?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <p>
                    Every document URL in this workspace will change. Links
                    you&apos;ve already shared to{" "}
                    <span className="font-mono text-[#171717]">
                      {instanceHost()}/{savedSlug}/…
                    </span>{" "}
                    will stop working.
                  </p>
                  <div className="rounded-lg border border-[#e5e5e5] bg-[#fafafa] p-3 font-mono text-[13px]">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 sm:gap-3">
                      <span className="text-[#737373] shrink-0">Before</span>
                      <span className="text-[#171717] break-all sm:text-right">
                        {instanceHost()}/
                        <span className="font-semibold">{savedSlug}</span>
                        /your-doc
                      </span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 sm:gap-3 mt-2 sm:mt-1">
                      <span className="text-[#737373] shrink-0">After</span>
                      <span className="text-[#171717] break-all sm:text-right">
                        {instanceHost()}/
                        <span className="font-semibold text-[#7F56D9]">
                          {normalizeWorkspaceSlug(slugInput)}
                        </span>
                        /your-doc
                      </span>
                    </div>
                  </div>
                  <p>
                    Update any published references (embeds, bookmarks, docs
                    that link to these URLs) before continuing. Only do this if
                    you&apos;re sure.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={savingSlug}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  // Don't auto-close — we close once the network call resolves.
                  e.preventDefault();
                  handleSlugSave();
                }}
                disabled={savingSlug}
                className="bg-[#7F56D9] hover:bg-[#6941C6]"
              >
                {savingSlug ? "Changing…" : "Yes, change workspace ID"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {deleteDialogOpen && deletionPreview && (
        <AlertDialog
          open={deleteDialogOpen}
          onOpenChange={(next) => {
            if (deletingWorkspace) return;
            setDeleteDialogOpen(next);
            if (!next) setDeleteConfirmInput("");
          }}
        >
          <AlertDialogContent className="dashboard-light">
            <AlertDialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-full bg-[#fef2f2] flex items-center justify-center">
                  <Trash2 className="w-4 h-4 text-[#dc2626]" />
                </div>
                <AlertDialogTitle>Delete this workspace?</AlertDialogTitle>
              </div>
              <AlertDialogDescription asChild>
                <div className="space-y-4">
                  <p>
                    This permanently deletes{" "}
                    <span className="font-semibold text-[#171717]">
                      {deletionPreview.name}
                    </span>{" "}
                    and everything inside it. This action cannot be undone.
                  </p>
                  <div className="grid grid-cols-2 gap-2 rounded-lg border border-[#e5e5e5] bg-[#fafafa] p-3 text-[13px]">
                    <div>
                      <span className="block text-[#737373]">Documents</span>
                      <span className="font-semibold text-[#171717]">
                        {deletionPreview.documentCount}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[#737373]">Members</span>
                      <span className="font-semibold text-[#171717]">
                        {deletionPreview.memberCount}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[#737373]">
                        Pending invites
                      </span>
                      <span className="font-semibold text-[#171717]">
                        {deletionPreview.pendingInviteCount}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[#737373]">API keys</span>
                      <span className="font-semibold text-[#171717]">
                        {deletionPreview.apiKeyCount}
                      </span>
                    </div>
                  </div>
                  <label className="block">
                    <span className="text-[13px] font-medium text-[#404040]">
                      Type{" "}
                      <span className="font-mono text-[#171717]">
                        {deletionPreview.slug}
                      </span>{" "}
                      to confirm.
                    </span>
                    <input
                      type="text"
                      value={deleteConfirmInput}
                      onChange={(e) => setDeleteConfirmInput(e.target.value)}
                      disabled={deletingWorkspace}
                      autoComplete="off"
                      spellCheck={false}
                      className="mt-2 w-full border border-[#d4d4d4] rounded-[8px] px-[14px] py-[10px] text-[14px] font-mono text-[#171717] outline-none focus:border-[#dc2626] focus:ring-4 focus:ring-[#fee2e2] transition-all disabled:bg-gray-50 disabled:text-[#a3a3a3] disabled:cursor-not-allowed"
                    />
                  </label>
                  {initial.tier !== "free" && (
                    <p className="rounded-lg border border-[#fed7aa] bg-[#fffbeb] px-3 py-2 text-[13px] leading-[19px] text-[#92400e]">
                      This does not cancel or downgrade your paid plan. Manage
                      billing separately if you no longer need the capacity.
                    </p>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deletingWorkspace}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleDeleteWorkspace();
                }}
                disabled={!deleteConfirmationMatches || deletingWorkspace}
                className="bg-[#dc2626] hover:bg-[#b91c1c]"
              >
                {deletingWorkspace ? "Deleting…" : "Delete workspace"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/*
        Upgrade prompt — shown when a Free user clicks a Pro-gated setting.
        Copy is feature-specific (see UPGRADE_FEATURE_COPY) so it reads as
        a direct explanation rather than a generic paywall. Primary CTA
        routes to /dashboard/billing where the full plan picker lives.
      */}
      {upgradeFeature && (
        <AlertDialog
          open={upgradeFeature !== null}
          onOpenChange={(next) => {
            if (!next) setUpgradeFeature(null);
          }}
        >
          <AlertDialogContent className="dashboard-light">
            <AlertDialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-full bg-[#F4EBFF] flex items-center justify-center">
                  <Lock className="w-4 h-4 text-[#6941C6]" />
                </div>
                <AlertDialogTitle>
                  {UPGRADE_FEATURE_COPY[upgradeFeature].title}
                </AlertDialogTitle>
              </div>
              <AlertDialogDescription>
                {UPGRADE_FEATURE_COPY[upgradeFeature].description}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setUpgradeFeature(null);
                  router.push("/dashboard/billing");
                }}
                className="bg-[#7F56D9] hover:bg-[#6941C6]"
              >
                Upgrade to Pro
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
