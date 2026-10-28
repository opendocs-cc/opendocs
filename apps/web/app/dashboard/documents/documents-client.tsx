"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Eye,
  Edit,
  Lock,
  Trash2,
  X,
  Plus,
  CloudUpload,
  Info,
  Search,
  Folder,
  Link2,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/dashboard/page-header";

import {
  publishDocumentAction,
  deleteDocumentAction,
  changeVisibilityAction,
  bulkDeleteDocumentsAction,
  bulkChangeVisibilityAction,
} from "./actions";

import { clientLabel } from "@/lib/client-labels";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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

type Visibility = "private" | "workspace" | "restricted" | "public";

type Post = {
  id: string;
  title: string;
  slug: string;
  url: string;
  /** Absolute link for View and Copy link (custom domain or opendocs.cc). */
  publicUrl?: string | null;
  visibility: Visibility;
  /** False once unpublished: offline, kept, and only deletable. */
  isPublished?: boolean;
  updatedAt: string;
  /** ISO timestamps used for sorting; `updatedAt` is the display string. */
  updatedAtIso: string;
  publishedAtIso: string;
  projectId: string;
  summary: string;
  tags: string[];
  /** Agent that published the current version, e.g. "claude-code". */
  client?: string | null;
};

/** Rows rendered per "Load more" step. */
const PAGE_SIZE = 25;

type DocumentSort = "updated" | "oldest" | "created" | "title";

const DOCUMENT_SORT_LABELS: Record<DocumentSort, string> = {
  updated: "Last updated",
  oldest: "Least recently updated",
  created: "Newest first",
  title: "Title A–Z",
};

const VISIBILITY_FILTERS = ["all", "public", "workspace", "restricted", "private"] as const;
type VisibilityFilter = (typeof VISIBILITY_FILTERS)[number];

function parseSort(value: string | null): DocumentSort {
  return value && value in DOCUMENT_SORT_LABELS ? (value as DocumentSort) : "updated";
}

function parseVisibilityFilter(value: string | null): VisibilityFilter {
  return VISIBILITY_FILTERS.includes(value as VisibilityFilter)
    ? (value as VisibilityFilter)
    : "all";
}

function formatListDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

/** Case-insensitive match of every search word against title, URL and tags. */
function matchesQuery(post: Post, query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = [post.title, post.url, post.summary, ...post.tags.map((t) => `#${t}`)]
    .join(" ")
    .toLowerCase();
  return words.every((word) => haystack.includes(word));
}

type ProjectOption = {
  id: string;
  name: string;
  slug: string;
  isDefault: boolean;
  postCount: number;
};

const visibilityConfig = {
  private: { label: "Private", dotColor: "bg-[#D0D5DD]" },
  workspace: { label: "Workspace", dotColor: "bg-[#36BFFA]" },
  restricted: { label: "Restricted", dotColor: "bg-[#FDB022]" },
  public: { label: "Public", dotColor: "bg-[#12B76A]" },
};

// The server-serializable shape of the document quota. `limit` /
// `remaining` arrive as `null` for plans with no cap (Pro/Team) since
// `Infinity` doesn't survive a server→client JSON boundary.
type DocumentQuotaProp = {
  plan: "free" | "pro" | "team";
  limit: number | null;
  used: number;
  remaining: number | null;
};

type DocumentsClientProps = {
  workspaceId: string;
  allowPublicDocuments: boolean;
  initialPosts: Post[];
  projects: ProjectOption[];
  quota: DocumentQuotaProp;
};

export function DocumentsClient({
  workspaceId,
  allowPublicDocuments,
  initialPosts,
  projects,
  quota,
}: DocumentsClientProps) {
  const defaultProjectId =
    projects.find((project) => project.isDefault)?.id ?? projects[0]?.id ?? "";
  const showProjectSelect = projects.length > 1;

  // Publish form state
  const [newDoc, setNewDoc] = useState({
    title: "",
    content: "",
    visibility: "workspace" as Visibility,
    tagsInput: "",
    projectId: defaultProjectId,
  });
  const [isPending, setIsPending] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  // Dialog states
  const [publicConfirmOpen, setPublicConfirmOpen] = useState(false);
  const [visibilityDialogOpen, setVisibilityDialogOpen] = useState(false);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [tempVisibility, setTempVisibility] = useState<Visibility>("workspace");

  // Create/Edit dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Delete confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Multi-select state. `selected` is keyed by post id (not by index)
  // so it survives "Load more" — adding rows below doesn't disturb the
  // selection above. `bulkActionMode` tells the existing visibility /
  // delete dialogs which handler to fire on confirm: a single-row
  // action vs. the bulk wrapper. Keeping one set of dialogs (rather
  // than parallel single + bulk dialogs) keeps the UI footprint flat
  // and avoids "two confirms doing almost the same thing" drift.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkActionMode, setBulkActionMode] = useState<
    "delete" | "visibility" | null
  >(null);
  const [isBulkActing, setIsBulkActing] = useState(false);
  const [bulkPublicVisibilityConfirmOpen, setBulkPublicVisibilityConfirmOpen] =
    useState(false);

  // Local posts state (for optimistic deletes) and pagination
  const [posts, setPosts] = useState(initialPosts);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // "Copy link" copies the link readers should get: the workspace's custom
  // domain when it has one, opendocs.cc otherwise.
  const copyDocumentLink = async (doc: Post) => {
    const link = doc.publicUrl ?? `${window.location.origin}${doc.url}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  // Search / filter / sort. Initialised from the URL so a filtered view
  // survives a reload and can be shared; kept in sync with
  // `history.replaceState` below (no server round-trip, no history spam).
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [projectFilter, setProjectFilter] = useState(() => {
    const value = searchParams.get("project");
    return value && projects.some((p) => p.id === value) ? value : "all";
  });
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>(() =>
    parseVisibilityFilter(searchParams.get("visibility")),
  );
  const [sort, setSort] = useState<DocumentSort>(() => parseSort(searchParams.get("sort")));
  const searchInputRef = useRef<HTMLInputElement>(null);
  const projectNames = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );

  // Live document count, initialized from the server snapshot. We
  // increment on successful publishes / decrement on deletes so the
  // pre-check reflects what the user has done since the page loaded
  // without forcing a full server round-trip.
  const [documentsUsed, setDocumentsUsed] = useState(quota.used);
  const quotaLimit = quota.limit; // null when unlimited
  const quotaRemaining =
    quotaLimit === null ? null : Math.max(0, quotaLimit - documentsUsed);
  const hasQuota = quotaLimit !== null;

  // File upload ref and drag state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isBulkUploading, setIsBulkUploading] = useState(false);

  // Bulk upload modal state — shown between file-select and the actual
  // upload loop so the user can set visibility + tags for the whole
  // batch instead of uploading 50 files as `workspace` with no tags and
  // editing each one after the fact.
  const [bulkUploadDialogOpen, setBulkUploadDialogOpen] = useState(false);
  const [pendingBulkFiles, setPendingBulkFiles] = useState<File[]>([]);
  const [bulkVisibility, setBulkVisibility] = useState<Visibility>("workspace");
  const [bulkTagsInput, setBulkTagsInput] = useState("");
  const [bulkProjectId, setBulkProjectId] = useState(defaultProjectId);
  const [bulkPublicConfirmOpen, setBulkPublicConfirmOpen] = useState(false);

  const MAX_UPLOAD_FILES = 50;

  const readFileAsText = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
      reader.readAsText(file);
    });

  const handleFilesSelected = async (files: File[]) => {
    const mdFiles = files.filter((f) => f.name.endsWith(".md"));
    const skipped = files.length - mdFiles.length;

    if (skipped > 0) {
      toast.error(`${skipped} file${skipped > 1 ? "s" : ""} skipped — only .md files are allowed`);
    }

    if (mdFiles.length === 0) return;

    if (mdFiles.length > MAX_UPLOAD_FILES) {
      toast.error(`You can upload up to ${MAX_UPLOAD_FILES} files at a time`);
      return;
    }

    // Plan-limit pre-check: reject the whole drop up front so we don't
    // publish 3 of 10 and then fail mid-way. The server enforces this
    // for real; this is just a UX shortcut (no HTTP round-trip wasted).
    if (hasQuota && quotaRemaining !== null && mdFiles.length > quotaRemaining) {
      toast.error(
        `Uploading ${mdFiles.length} file${mdFiles.length === 1 ? "" : "s"} would exceed your ${quota.plan} plan's ${quotaLimit}-document limit. You have ${quotaRemaining} slot${quotaRemaining === 1 ? "" : "s"} left.`,
      );
      return;
    }

    // Single file → open publish dialog for editing
    if (mdFiles.length === 1) {
      const content = await readFileAsText(mdFiles[0]);
      const title = mdFiles[0].name.replace(/\.md$/, "");
      setNewDoc({
        title,
        content,
        visibility: "workspace",
        tagsInput: "",
        projectId: defaultProjectId,
      });
      setPublishError(null);
      setCreateDialogOpen(true);
      return;
    }

    // Multiple files → open the bulk upload modal so the user can set
    // visibility + tags for the whole batch. The actual upload loop
    // happens in `doBulkUpload` once they confirm.
    setPendingBulkFiles(mdFiles);
    setBulkVisibility("workspace");
    setBulkTagsInput("");
    setBulkProjectId(defaultProjectId);
    setBulkUploadDialogOpen(true);
  };

  // The actual bulk upload loop — kicked off from the bulk-upload modal's
  // Confirm button. Pulled out of `handleFilesSelected` so we can route
  // the user through the visibility/tags chooser first.
  const doBulkUpload = async (
    files: File[],
    visibility: Visibility,
    tags: string[],
    projectId: string,
  ) => {
    setIsBulkUploading(true);
    const toastId = toast.loading(`Publishing 0 of ${files.length} documents...`);
    const newPosts: Post[] = [];
    let failed = 0;
    let hitLimit = false;

    for (let i = 0; i < files.length; i++) {
      toast.loading(`Publishing ${i + 1} of ${files.length} documents...`, { id: toastId });
      try {
        const content = await readFileAsText(files[i]);
        const title = files[i].name.replace(/\.md$/, "");
        const result = await publishDocumentAction({
          title,
          markdown: content,
          workspaceId,
          projectId: projectId || undefined,
          visibility,
          confirmPublic: visibility === "public",
          tags,
        });

        if ("error" in result) {
          // The plan cap was hit mid-batch (e.g. client `quotaRemaining`
          // was stale). Stop now — no point wasting round-trips on
          // guaranteed failures.
          if (result.error === "document_limit") {
            hitLimit = true;
            break;
          }
          failed++;
          continue;
        }

        newPosts.push({
          id: result.id!,
          title: result.title!,
          slug: result.slug!,
          url: result.url!,
          publicUrl: result.publicUrl ?? null,
          visibility: (result.visibility as Visibility) ?? visibility,
          updatedAt: formatListDate(new Date()),
          updatedAtIso: new Date().toISOString(),
          publishedAtIso: new Date().toISOString(),
          projectId: projectId || defaultProjectId,
          summary: "",
          tags: result.tags ?? tags,
        });
      } catch {
        failed++;
      }
    }

    // Update the list once after all uploads
    if (newPosts.length > 0) {
      setPosts((prev) => [...newPosts, ...prev]);
      setDocumentsUsed((prev) => prev + newPosts.length);
    }

    toast.dismiss(toastId);
    if (hitLimit) {
      toast.error(
        `Stopped at ${newPosts.length} of ${files.length} — you hit your ${quota.plan} plan's ${quotaLimit}-document limit.`,
      );
    } else if (failed === 0) {
      toast.success(
        `${newPosts.length} document${newPosts.length === 1 ? "" : "s"} published`,
      );
    } else {
      toast.success(`${newPosts.length} published, ${failed} failed`);
    }
    setIsBulkUploading(false);
  };

  // The Confirm click path for the bulk upload modal. Public visibility
  // goes through an extra "are you sure?" step that mirrors the single
  // publish flow — the server requires `confirmPublic: true` per
  // request, but that's a machine guard; this is the human one.
  const handleBulkConfirm = () => {
    if (bulkVisibility === "public") {
      setBulkPublicConfirmOpen(true);
      return;
    }
    runBulkUpload();
  };

  const runBulkUpload = () => {
    const files = pendingBulkFiles;
    const tags = bulkTagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const visibility = bulkVisibility;
    const projectId = bulkProjectId;
    setBulkUploadDialogOpen(false);
    setBulkPublicConfirmOpen(false);
    setPendingBulkFiles([]);
    setBulkTagsInput("");
    setBulkProjectId(defaultProjectId);
    void doBulkUpload(files, visibility, tags, projectId);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) handleFilesSelected(files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) handleFilesSelected(files);
    // Reset so the same file(s) can be re-selected
    e.target.value = "";
  };

  const handlePublish = () => {
    if (!newDoc.content.trim()) {
      toast.error("Content is required");
      return;
    }

    if (newDoc.visibility === "public") {
      setPublicConfirmOpen(true);
      return;
    }

    doPublish();
  };

  const doPublish = () => {
    setIsPending(true);
    setPublishError(null);

    startTransition(async () => {
      try {
        const result = await publishDocumentAction({
          title: newDoc.title || undefined,
          markdown: newDoc.content,
          workspaceId,
          projectId: newDoc.projectId || undefined,
          visibility: newDoc.visibility,
          confirmPublic: newDoc.visibility === "public",
          tags: newDoc.tagsInput
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        });

        if ("error" in result) {
          if (result.error === "document_limit") {
            throw new Error(
              `Your ${result.plan} plan allows ${result.limit} published documents. You're at ${result.used}.`,
            );
          }
          throw new Error(
            typeof result.error === "string"
              ? result.error
              : "Unable to publish.",
          );
        }

        // Add new document to the list immediately
        const newPost: Post = {
          id: result.id!,
          title: result.title!,
          slug: result.slug!,
          url: result.url!,
          publicUrl: result.publicUrl ?? null,
          visibility: (newDoc.visibility as Visibility),
          updatedAt: formatListDate(new Date()),
          updatedAtIso: new Date().toISOString(),
          publishedAtIso: new Date().toISOString(),
          projectId: newDoc.projectId || defaultProjectId,
          summary: "",
          tags: result.tags ?? [],
        };
        setPosts((prev) => [newPost, ...prev]);
        setDocumentsUsed((prev) => prev + 1);

        setNewDoc({
          title: "",
          content: "",
          visibility: "workspace",
          tagsInput: "",
          projectId: defaultProjectId,
        });
        setCreateDialogOpen(false);
        toast.success("Document published successfully");
      } catch (err) {
        setPublishError(
          err instanceof Error ? err.message : "Something went wrong.",
        );
      } finally {
        setIsPending(false);
      }
    });
  };

  const [isSavingVisibility, setIsSavingVisibility] = useState(false);

  const handleChangeVisibility = (post: Post) => {
    setEditingDocId(post.id);
    setTempVisibility(post.visibility);
    setVisibilityDialogOpen(true);
  };

  const handleSaveVisibility = async () => {
    // Branch: bulk-mode saves go through the bulk wrapper (with a
    // public-confirm step), single-row saves keep the original path.
    if (bulkActionMode === "visibility") {
      if (tempVisibility === "public") {
        setBulkPublicVisibilityConfirmOpen(true);
        return;
      }
      await runBulkVisibilityChange(tempVisibility);
      return;
    }

    if (!editingDocId) return;
    setIsSavingVisibility(true);
    try {
      const result = await changeVisibilityAction(editingDocId, tempVisibility);
      if ("error" in result) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "Unable to change visibility.",
        );
      }
      setPosts((prev) =>
        prev.map((p) =>
          p.id === editingDocId
            ? { ...p, visibility: tempVisibility, publicUrl: result.publicUrl ?? p.publicUrl }
            : p,
        ),
      );
      setVisibilityDialogOpen(false);
      toast.success("Visibility updated");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update visibility",
      );
    } finally {
      setIsSavingVisibility(false);
    }
  };

  const handleOpenDeleteConfirm = (docId: string) => {
    setDeletingDocId(docId);
    setDeleteConfirmOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingDocId) return;
    setIsDeleting(true);
    try {
      const result = await deleteDocumentAction(deletingDocId);
      if ("error" in result) {
        throw new Error(
          typeof result.error === "string" ? result.error : "Unable to delete.",
        );
      }
      setPosts((prev) => prev.filter((p) => p.id !== deletingDocId));
      // Free up a quota slot optimistically. The server truth is
      // re-fetched on next page load if this drifts (e.g. the
      // deleted post was somehow not counted).
      setDocumentsUsed((prev) => Math.max(0, prev - 1));
      toast.success("Document deleted");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete document",
      );
    } finally {
      setIsDeleting(false);
      setDeleteConfirmOpen(false);
      setDeletingDocId(null);
    }
  };

  // ---------------------------------------------------------------
  // Multi-select helpers
  // ---------------------------------------------------------------

  // Visible posts = those rendered above the "Load more" line. The
  // header checkbox's checked / indeterminate state and the "select
  // all" toggle both operate on this slice (not the full list) — the
  // user's mental model is "what I can see right now".
  const filteredPosts = useMemo(() => {
    const matching = posts.filter(
      (post) =>
        (projectFilter === "all" || post.projectId === projectFilter) &&
        (visibilityFilter === "all" || post.visibility === visibilityFilter) &&
        matchesQuery(post, query),
    );
    const byTitle = (a: Post, b: Post) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true });
    return matching.sort((a, b) => {
      switch (sort) {
        case "oldest":
          return a.updatedAtIso.localeCompare(b.updatedAtIso);
        case "created":
          return b.publishedAtIso.localeCompare(a.publishedAtIso);
        case "title":
          return byTitle(a, b);
        default:
          return b.updatedAtIso.localeCompare(a.updatedAtIso);
      }
    });
  }, [posts, projectFilter, visibilityFilter, query, sort]);
  const hasActiveFilters =
    query.trim() !== "" || projectFilter !== "all" || visibilityFilter !== "all";

  const resetFilters = () => {
    setQuery("");
    setProjectFilter("all");
    setVisibilityFilter("all");
    setVisibleCount(PAGE_SIZE);
  };

  // Mirror the filters into the URL without triggering navigation.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const entries: Array<[string, string, string]> = [
      ["q", query.trim(), ""],
      ["project", projectFilter, "all"],
      ["visibility", visibilityFilter, "all"],
      ["sort", sort, "updated"],
    ];
    for (const [key, value, fallback] of entries) {
      if (value && value !== fallback) params.set(key, value);
      else params.delete(key);
    }
    const search = params.toString();
    const next = `${window.location.pathname}${search ? `?${search}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(window.history.state, "", next);
    }
  }, [query, projectFilter, visibilityFilter, sort]);

  // "/" jumps to the search field, like most list UIs.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }
      event.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const visiblePosts = useMemo(
    () => filteredPosts.slice(0, visibleCount),
    [filteredPosts, visibleCount],
  );
  const visibleIds = useMemo(
    () => visiblePosts.map((p) => p.id),
    [visiblePosts],
  );
  const selectedCount = selected.size;
  // For the header checkbox tri-state: checked when every visible row
  // is selected, indeterminate when some are. Using `every` over the
  // visible slice (not the full list) keeps the toggle predictable
  // when there are still rows hidden behind "Load more".
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someVisibleSelected =
    !allVisibleSelected && visibleIds.some((id) => selected.has(id));

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        // Clear only the currently-visible IDs — preserves any
        // selections from above the "Load more" line if the user
        // scrolled back up.
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  // Open the existing visibility dialog in bulk mode. We seed
  // `tempVisibility` with `workspace` (the most common target) rather
  // than the visibility of any single row — when the user has 12 rows
  // selected with mixed visibilities, "current value" is undefined.
  const handleOpenBulkVisibility = () => {
    if (selected.size === 0) return;
    setBulkActionMode("visibility");
    setEditingDocId(null);
    setTempVisibility("workspace");
    setVisibilityDialogOpen(true);
  };

  const handleOpenBulkDelete = () => {
    if (selected.size === 0) return;
    setBulkActionMode("delete");
    setDeletingDocId(null);
    setDeleteConfirmOpen(true);
  };

  const runBulkDelete = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setIsBulkActing(true);
    try {
      const result = await bulkDeleteDocumentsAction(ids);
      if ("error" in result && !("succeeded" in result)) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "Unable to delete.",
        );
      }
      const succeeded = new Set(result.succeeded ?? []);
      const failedCount = result.failed?.length ?? 0;
      setPosts((prev) => prev.filter((p) => !succeeded.has(p.id)));
      setDocumentsUsed((prev) => Math.max(0, prev - succeeded.size));
      // Drop succeeded IDs from selection but keep the failed ones
      // checked so the user can retry without re-selecting them.
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of succeeded) next.delete(id);
        return next;
      });
      if (failedCount === 0) {
        toast.success(
          `${succeeded.size} document${succeeded.size === 1 ? "" : "s"} deleted`,
        );
      } else {
        toast.success(
          `${succeeded.size} deleted, ${failedCount} failed`,
        );
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete documents",
      );
    } finally {
      setIsBulkActing(false);
      setDeleteConfirmOpen(false);
      setBulkActionMode(null);
    }
  };

  const runBulkVisibilityChange = async (visibility: Visibility) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setIsBulkActing(true);
    try {
      const result = await bulkChangeVisibilityAction(ids, visibility);
      if ("error" in result && !("succeeded" in result)) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "Unable to change visibility.",
        );
      }
      const succeeded = new Set(result.succeeded ?? []);
      const failedCount = result.failed?.length ?? 0;
      const publicUrls = "publicUrls" in result ? (result.publicUrls ?? {}) : {};
      setPosts((prev) =>
        prev.map((p) =>
          succeeded.has(p.id)
            ? { ...p, visibility, publicUrl: publicUrls[p.id] ?? p.publicUrl }
            : p,
        ),
      );
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of succeeded) next.delete(id);
        return next;
      });
      if (failedCount === 0) {
        toast.success(
          `Visibility updated for ${succeeded.size} document${succeeded.size === 1 ? "" : "s"}`,
        );
      } else {
        toast.success(
          `${succeeded.size} updated, ${failedCount} failed`,
        );
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update visibility",
      );
    } finally {
      setIsBulkActing(false);
      setVisibilityDialogOpen(false);
      setBulkPublicVisibilityConfirmOpen(false);
      setBulkActionMode(null);
    }
  };

  return (
    <div className="w-full max-w-[1000px] mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-10 flex flex-col gap-[32px]">

      <PageHeader
        title="Documents"
        description="Everything published to this workspace, by you, your teammates and your agents."
        actions={
      <button
        onClick={() => {
          setNewDoc({
            title: "",
            content: "",
            visibility: "workspace",
            tagsInput: "",
            projectId: defaultProjectId,
          });
          setPublishError(null);
          setCreateDialogOpen(true);
        }}
        className="w-full sm:w-auto flex items-center justify-center gap-1.5 bg-[#7F56D9] hover:bg-[#6941C6] text-white text-[14px] font-semibold px-4 py-2 rounded-[8px] transition-colors shadow-sm border border-[#7F56D9]"
      >
        <Plus className="w-4 h-4" strokeWidth={2} />
        New document
      </button>
        }
      />

      {/* Upload Zone */}
      <div
        onClick={() => !isBulkUploading && fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`bg-white relative rounded-[12px] shrink-0 w-full shadow-sm transition-colors border border-dashed ${
          isBulkUploading
            ? "border-[#e5e5e5] opacity-60 cursor-wait"
            : isDragging
              ? "border-[#7F56D9] bg-[#f9f5ff] cursor-pointer"
              : "border-[#e5e5e5] hover:bg-gray-50 cursor-pointer"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".md"
          multiple
          onChange={handleFileInputChange}
          className="hidden"
        />
        <div className="flex flex-col items-center w-full">
          {/* Full-size drop zone while the workspace is empty; a slim
              bar once there are documents so the list stays above the
              fold. Both are the same click/drop target. */}
          <div
            className={`flex w-full ${
              posts.length > 0
                ? "flex-row items-center justify-center gap-[12px] px-[16px] py-[14px] sm:px-[24px]"
                : "flex-col items-center gap-[12px] px-[24px] py-[48px]"
            }`}
          >
            <div className="rounded-[8px] shrink-0 size-[40px] bg-white border border-[#e5e5e5] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] flex items-center justify-center">
              <CloudUpload className="w-[20px] h-[20px] text-[#404040]" strokeWidth={1.67} />
            </div>
            <div
              className={`flex flex-col gap-[4px] ${
                posts.length > 0 ? "items-start" : "items-center w-full"
              }`}
            >
              <div
                className={`flex flex-wrap gap-[4px] items-start ${
                  posts.length > 0 ? "" : "justify-center w-full"
                }`}
              >
                <span className="font-semibold leading-[20px] text-[#6941c6] text-[14px] whitespace-nowrap">
                  Click to upload
                </span>
                <span className="font-normal leading-[20px] text-[#525252] text-[14px] whitespace-nowrap">
                  or drag and drop
                </span>
              </div>
              <p
                className={`font-normal leading-[18px] text-[#525252] text-[12px] ${
                  posts.length > 0 ? "" : "text-center w-full"
                }`}
              >
                Markdown files (.md) — up to {MAX_UPLOAD_FILES} at a time
              </p>
              {hasQuota && (
                <p
                  className={`font-normal leading-[18px] text-[#525252] text-[12px] ${
                    posts.length > 0 ? "" : "text-center w-full"
                  }`}
                >
                  {documentsUsed} of {quotaLimit} documents used on your {quota.plan} plan
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Documents Table */}
      <div className="bg-white rounded-[12px] w-full shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] border border-[#e5e5e5] overflow-hidden flex flex-col">
        {/* Table Title — swaps to a contextual bulk-action toolbar when
            one or more rows are selected. We keep both header h2 + the
            description rendered when nothing is selected so the card
            looks identical to before. The toolbar replaces the
            description (not the title) on selection so the user
            doesn't lose the section anchor. */}
        <div className="flex flex-col gap-[4px] items-start px-[24px] py-[20px] w-full border-b border-[#e5e5e5]">
          <div className="flex flex-wrap items-center justify-between gap-[12px] w-full">
            <h2 className="font-semibold leading-[28px] text-[#171717] text-[18px]">
              Published documents
            </h2>
            {selectedCount > 0 && (
              <div className="flex flex-wrap items-center gap-[8px]">
                <span className="text-[14px] font-medium text-[#404040]">
                  {selectedCount} selected
                </span>
                <span aria-hidden className="text-[#d4d4d4]">·</span>
                <button
                  type="button"
                  onClick={handleOpenBulkVisibility}
                  disabled={isBulkActing}
                  className="inline-flex items-center gap-[6px] px-[10px] py-[6px] rounded-[6px] border border-[#d4d4d4] bg-white shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] hover:bg-[#fafafa] transition-colors text-[13px] font-semibold text-[#404040] disabled:opacity-60"
                >
                  <Lock className="w-[14px] h-[14px]" strokeWidth={1.67} />
                  Change visibility
                </button>
                <button
                  type="button"
                  onClick={handleOpenBulkDelete}
                  disabled={isBulkActing}
                  className="inline-flex items-center gap-[6px] px-[10px] py-[6px] rounded-[6px] border border-[#FECDCA] bg-white shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] hover:bg-[#FEF3F2] transition-colors text-[13px] font-semibold text-[#B42318] disabled:opacity-60"
                >
                  <Trash2 className="w-[14px] h-[14px]" strokeWidth={1.67} />
                  Delete
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  disabled={isBulkActing}
                  className="text-[13px] font-medium text-[#737373] hover:text-[#171717] transition-colors px-[6px] disabled:opacity-60"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
          {selectedCount === 0 && (
            <p className="font-normal leading-[20px] text-[#525252] text-[14px] w-full">
              All markdown files that have been published to this workspace.
            </p>
          )}
        </div>

        {/* Search, filters and sort. Everything runs client-side over
            the already-loaded list, so it is instant; the state is
            mirrored into the URL (see the effect above). */}
        {posts.length > 0 && (
          <div className="flex flex-col gap-[10px] px-[16px] sm:px-[24px] py-[14px] border-b border-[#e5e5e5] lg:flex-row lg:items-center">
            <label className="relative flex-1 min-w-0">
              <span className="sr-only">Search documents</span>
              <Search
                className="pointer-events-none absolute left-[12px] top-1/2 -translate-y-1/2 w-[16px] h-[16px] text-[#a3a3a3]"
                strokeWidth={1.75}
                aria-hidden
              />
              <input
                ref={searchInputRef}
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setVisibleCount(PAGE_SIZE);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && query) {
                    e.preventDefault();
                    setQuery("");
                  }
                }}
                placeholder="Search by title, URL or #tag"
                autoComplete="off"
                className="w-full h-[38px] rounded-[8px] border border-[#d4d4d4] bg-white pl-[36px] pr-[44px] text-[14px] text-[#171717] placeholder:text-[#a3a3a3] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] outline-none transition-all focus:border-[#6941c6] focus:ring-4 focus:ring-[#f4ebff] [&::-webkit-search-cancel-button]:hidden"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-[8px] top-1/2 -translate-y-1/2 rounded-[6px] p-[4px] text-[#a3a3a3] hover:bg-[#f5f5f5] hover:text-[#404040] transition-colors"
                  aria-label="Clear search"
                >
                  <X className="w-[14px] h-[14px]" strokeWidth={2} />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-[10px] top-1/2 -translate-y-1/2 hidden sm:inline-flex h-[20px] items-center rounded-[4px] border border-[#e5e5e5] bg-[#fafafa] px-[6px] font-mono text-[11px] text-[#737373]">
                  /
                </kbd>
              )}
            </label>
            <div className="grid grid-cols-2 gap-[8px] sm:flex sm:items-center">
              {showProjectSelect && (
                <Select
                  value={projectFilter}
                  onValueChange={(value: string) => {
                    setProjectFilter(value);
                    setVisibleCount(PAGE_SIZE);
                  }}
                >
                  <SelectTrigger
                    aria-label="Filter by project"
                    className="h-[38px] w-full sm:w-[176px] rounded-[8px] border-[#d4d4d4] bg-white px-[12px] text-[14px] font-medium text-[#171717] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] focus:border-[#6941c6] focus:ring-4 focus:ring-[#f4ebff]"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dashboard-light">
                    <SelectItem value="all">All projects</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                        <span className="ml-1.5 text-[#a3a3a3] tabular-nums">
                          {posts.filter((p) => p.projectId === project.id).length}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select
                value={visibilityFilter}
                onValueChange={(value: string) => {
                  setVisibilityFilter(parseVisibilityFilter(value));
                  setVisibleCount(PAGE_SIZE);
                }}
              >
                <SelectTrigger
                  aria-label="Filter by visibility"
                  className="h-[38px] w-full sm:w-[148px] rounded-[8px] border-[#d4d4d4] bg-white px-[12px] text-[14px] font-medium text-[#171717] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] focus:border-[#6941c6] focus:ring-4 focus:ring-[#f4ebff]"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dashboard-light">
                  <SelectItem value="all">Any visibility</SelectItem>
                  {VISIBILITY_FILTERS.filter((v) => v !== "all").map((value) => (
                    <SelectItem key={value} value={value}>
                      {visibilityConfig[value].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={sort}
                onValueChange={(value: string) => setSort(parseSort(value))}
              >
                <SelectTrigger
                  aria-label="Sort documents"
                  className={`h-[38px] w-full sm:w-[196px] rounded-[8px] border-[#d4d4d4] bg-white px-[12px] text-[14px] font-medium text-[#171717] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] focus:border-[#6941c6] focus:ring-4 focus:ring-[#f4ebff] ${
                    showProjectSelect ? "col-span-2 sm:col-span-1" : ""
                  }`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dashboard-light">
                  {(Object.keys(DOCUMENT_SORT_LABELS) as DocumentSort[]).map((value) => (
                    <SelectItem key={value} value={value}>
                      {DOCUMENT_SORT_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        {posts.length > 0 && hasActiveFilters && (
          <div className="flex items-center justify-between gap-[12px] px-[16px] sm:px-[24px] py-[8px] border-b border-[#e5e5e5] bg-[#fcfcfd] text-[13px] text-[#525252]">
            <span className="tabular-nums" aria-live="polite">
              {filteredPosts.length === 1
                ? "1 matching document"
                : `${filteredPosts.length} matching documents`}{" "}
              <span className="text-[#a3a3a3]">of {posts.length}</span>
            </span>
            <button
              type="button"
              onClick={resetFilters}
              className="font-medium text-[#6941c6] hover:text-[#53389E] transition-colors"
            >
              Clear filters
            </button>
          </div>
        )}

        {/* Table Content */}
        <div className="w-full flex flex-col">
          {/* Column Headers — hidden on mobile (rows stack with title-on-top, meta-below) */}
          <div className="hidden sm:grid w-full grid-cols-[52px_1fr_120px_140px_132px] items-center bg-[#fafafa] border-b border-[#e5e5e5] h-[44px]">
            <div className="pl-[24px] pr-[16px] flex items-center">
              <Checkbox
                checked={
                  allVisibleSelected
                    ? true
                    : someVisibleSelected
                      ? "indeterminate"
                      : false
                }
                onCheckedChange={toggleAllVisible}
                aria-label={
                  allVisibleSelected
                    ? "Deselect all visible documents"
                    : "Select all visible documents"
                }
              />
            </div>
            <div className="pr-[12px] flex items-center min-w-0">
              <span className="font-medium leading-[18px] text-[#525252] text-[12px] uppercase tracking-wider">
                Title
              </span>
            </div>
            <div className="px-[12px] flex items-center">
              <span className="font-medium leading-[18px] text-[#525252] text-[12px] uppercase tracking-wider">
                Visibility
              </span>
            </div>
            <div className="px-[12px] flex items-center">
              <span className="font-medium leading-[18px] text-[#525252] text-[12px] uppercase tracking-wider">
                Last updated
              </span>
            </div>
            <div className="px-[12px] pr-[24px] flex items-center justify-end">
              <span className="font-medium leading-[18px] text-[#525252] text-[12px] uppercase tracking-wider">
                Actions
              </span>
            </div>
          </div>

          {/* Rows */}
          {posts.length === 0 ? (
            <div className="px-[24px] py-[48px] text-center">
              <p className="text-[14px] text-[#737373]">
                No documents yet. Upload your first document to get started.
              </p>
            </div>
          ) : filteredPosts.length === 0 ? (
            <div className="flex flex-col items-center gap-[6px] px-[24px] py-[48px] text-center">
              <p className="text-[14px] font-medium text-[#171717]">
                {query.trim()
                  ? `No documents match “${query.trim()}”`
                  : "No documents match these filters"}
              </p>
              <p className="text-[13px] text-[#737373]">
                Try a different search, or{" "}
                <button
                  type="button"
                  onClick={resetFilters}
                  className="font-medium text-[#6941c6] hover:text-[#53389E] hover:underline"
                >
                  clear the filters
                </button>
                .
              </p>
            </div>
          ) : (
            <>
              {visiblePosts.map((doc, idx, visible) => {
                const isRowSelected = selected.has(doc.id);
                return (
                <div
                  key={doc.id}
                  data-state={isRowSelected ? "selected" : undefined}
                  className={`w-full relative flex flex-col gap-1 pl-[48px] pr-[24px] py-[16px] sm:p-0 sm:grid sm:grid-cols-[52px_1fr_120px_140px_132px] sm:gap-0 sm:items-center sm:min-h-[64px] transition-colors ${
                    isRowSelected
                      ? "bg-[#f9f5ff] hover:bg-[#f4ebff]"
                      : "hover:bg-[#fafafa]"
                  } ${
                    idx !== visible.length - 1
                      ? "border-b border-[#e5e5e5]"
                      : ""
                  }`}
                >
                  {/* Selection checkbox — absolute on mobile (top-left
                      mirroring the absolute Actions block on the right);
                      grid cell on desktop. The desktop cell carries
                      its own `pr-[16px]` so the checkbox sits a
                      comfortable distance from the title text rather
                      than crowding it. */}
                  <div className="absolute left-4 top-[18px] sm:static sm:pl-[24px] sm:pr-[16px] flex items-center">
                    <Checkbox
                      checked={isRowSelected}
                      onCheckedChange={() => toggleSelected(doc.id)}
                      aria-label={`Select ${doc.title}`}
                    />
                  </div>
                  {/* Title — full row on mobile (right-padded to clear
                      absolute Actions); column 2 on desktop. Spans are
                      explicitly `block` so `truncate` actually clips
                      with an ellipsis — Tailwind's truncate utility
                      doesn't set `display`, so on a bare inline span
                      the `overflow:hidden` is a no-op and very long
                      titles would push the row sideways. */}
                  <div className="pr-[120px] sm:pl-0 sm:pr-[12px] sm:py-[12px] flex flex-col items-start min-w-0 w-full overflow-hidden">
                    <span className="flex w-full min-w-0 items-center gap-2">
                      <span className="block min-w-0 font-medium text-[14px] text-[#171717] leading-[20px] truncate">
                        {doc.title}
                      </span>
                      {doc.isPublished === false ? (
                        <span
                          className="shrink-0 rounded bg-[#f5f5f5] px-1.5 py-[1px] text-[11px] font-medium text-[#525252] ring-1 ring-inset ring-[#e5e5e5]"
                          title="Unpublished: the link no longer works. Delete it to free the URL."
                        >
                          Offline
                        </span>
                      ) : null}
                    </span>
                    <span className="flex w-full min-w-0 items-center gap-2 font-normal text-[13px] text-[#737373] leading-[18px]">
                      {showProjectSelect && projectNames.get(doc.projectId) ? (
                        <button
                          type="button"
                          onClick={() => {
                            setProjectFilter(doc.projectId);
                            setVisibleCount(PAGE_SIZE);
                          }}
                          className="inline-flex shrink-0 items-center gap-1 rounded-[4px] text-[#525252] hover:text-[#6941c6] transition-colors"
                          title={`Show only ${projectNames.get(doc.projectId)}`}
                        >
                          <Folder className="w-[12px] h-[12px]" strokeWidth={1.75} aria-hidden />
                          <span className="max-w-[140px] truncate">
                            {projectNames.get(doc.projectId)}
                          </span>
                        </button>
                      ) : null}
                      <span className="block min-w-0 truncate">
                        {doc.publicUrl ? doc.publicUrl.replace(/^https?:\/\//, "") : doc.url}
                      </span>
                      {clientLabel(doc.client) ? (
                        <span
                          className="shrink-0 rounded bg-[#F4EBFF] px-1.5 py-[1px] text-[11px] font-medium text-[#6941C6]"
                          title="Agent that published the latest version"
                        >
                          via {clientLabel(doc.client)}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  {/* Mobile-only meta line — visibility label + last-updated below the title */}
                  <div className="sm:hidden flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[#737373]">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className={`inline-block w-[6px] h-[6px] rounded-full shrink-0 ${
                          doc.visibility === "public" && !allowPublicDocuments
                            ? "bg-[#FDB022]"
                            : visibilityConfig[doc.visibility].dotColor
                        }`}
                      />
                      <span>{visibilityConfig[doc.visibility].label}</span>
                    </span>
                    <span aria-hidden className="text-[#d4d4d4]">·</span>
                    <span>Updated {doc.updatedAt}</span>
                  </div>
                  {/* Visibility — desktop only */}
                  <div className="hidden sm:flex px-[12px] items-center gap-[6px]">
                    {doc.visibility === "public" && !allowPublicDocuments ? (
                      <>
                        <span className="inline-block w-[8px] h-[8px] rounded-full shrink-0 bg-[#FDB022]" />
                        <span className="font-normal text-[14px] text-[#525252]">
                          Public
                        </span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">
                              <Info className="w-[14px] h-[14px] text-[#FDB022]" strokeWidth={2} />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            Public posts are hidden because your workspace doesn&apos;t allow public documents. Enable it in Workspace settings.
                          </TooltipContent>
                        </Tooltip>
                      </>
                    ) : (
                      <>
                        <span
                          className={`inline-block w-[8px] h-[8px] rounded-full shrink-0 ${
                            visibilityConfig[doc.visibility].dotColor
                          }`}
                        />
                        <span className="font-normal text-[14px] text-[#525252]">
                          {visibilityConfig[doc.visibility].label}
                        </span>
                      </>
                    )}
                  </div>
                  {/* Last updated — desktop only */}
                  <div className="hidden sm:flex px-[12px] items-center">
                    <span className="font-normal text-[14px] text-[#525252]">
                      {doc.updatedAt}
                    </span>
                  </div>
                  {/* Actions — absolute top-right on mobile, grid cell on desktop */}
                  <div className="absolute top-3 right-4 sm:static sm:px-[12px] sm:pr-[24px] flex items-center justify-end gap-[4px]">
                    {/* An unpublished document has no live page and its
                        visibility can't change; it can only be deleted. */}
                    {doc.isPublished !== false ? (
                      <>
                        <a
                          href={doc.publicUrl ?? doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center rounded-[6px] p-[6px] text-[#737373] hover:text-[#171717] hover:bg-[#f5f5f5] transition-colors"
                          title="View"
                        >
                          <Eye className="w-[16px] h-[16px]" strokeWidth={1.67} />
                        </a>
                        <button
                          type="button"
                          onClick={() => void copyDocumentLink(doc)}
                          className="inline-flex items-center justify-center rounded-[6px] p-[6px] text-[#737373] hover:text-[#171717] hover:bg-[#f5f5f5] transition-colors"
                          title="Copy link"
                          aria-label="Copy link"
                        >
                          <Link2 className="w-[16px] h-[16px]" strokeWidth={1.67} />
                        </button>
                        <button
                          onClick={() => handleChangeVisibility(doc)}
                          className="inline-flex items-center justify-center rounded-[6px] p-[6px] text-[#737373] hover:text-[#171717] hover:bg-[#f5f5f5] transition-colors"
                          title="Edit visibility"
                        >
                          <Edit className="w-[16px] h-[16px]" strokeWidth={1.67} />
                        </button>
                      </>
                    ) : null}
                    <button
                      onClick={() => handleOpenDeleteConfirm(doc.id)}
                      className="inline-flex items-center justify-center rounded-[6px] p-[6px] text-[#737373] hover:text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-[16px] h-[16px]" strokeWidth={1.67} />
                    </button>
                  </div>
                </div>
                );
              })}
              {filteredPosts.length > visibleCount && (
                <div className="px-[24px] py-[12px] border-t border-[#e5e5e5]">
                  <button
                    onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
                    className="w-full text-center text-[14px] font-medium text-[#6941c6] hover:text-[#53389E] py-[8px] rounded-[8px] hover:bg-[#fafafa] transition-colors"
                  >
                    Load more ({filteredPosts.length - visibleCount} remaining)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Create / Publish Document Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="dashboard-light max-w-[min(480px,calc(100vw-32px))] max-h-[90vh] overflow-y-auto p-0 border-none bg-transparent shadow-none [&>button:last-child]:hidden outline-none">
          <div className="bg-white flex flex-col items-center overflow-clip rounded-[16px] shadow-[0px_20px_24px_-4px_rgba(0,0,0,0.08),0px_8px_8px_-4px_rgba(0,0,0,0.03),0px_3px_3px_-1.5px_rgba(0,0,0,0.04)] w-full">
            {/* Dialog Header */}
            <div className="flex flex-col items-center w-full relative">
              <div className="w-full">
                <div className="flex flex-col gap-[16px] items-start pt-[24px] px-[24px] w-full">
                  <div className="rounded-[8px] size-[40px] bg-white border border-[#d4d4d4] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] flex items-center justify-center">
                    <CloudUpload className="w-[20px] h-[20px] text-[#404040]" strokeWidth={1.67} />
                  </div>
                  <div className="flex flex-col gap-[2px] items-start w-full">
                    <DialogTitle className="font-semibold leading-[24px] text-[#171717] text-[16px] w-full">
                      Add document
                    </DialogTitle>
                    <DialogDescription className="font-normal leading-[20px] text-[#525252] text-[14px] w-full">
                      By default the visibility of your document is set to your workspace.
                    </DialogDescription>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setCreateDialogOpen(false)}
                className="absolute flex items-center justify-center p-[8px] right-[16px] rounded-[8px] size-[36px] top-[16px] hover:bg-gray-100 transition-colors"
              >
                <X className="w-[20px] h-[20px] text-[#A3A3A3]" strokeWidth={1.67} />
              </button>
              <div className="h-[20px] w-full" />
            </div>

            {/* Form Fields */}
            <div className="w-full px-[24px]">
              <div className="flex flex-col gap-[16px] w-full">
                {/* Title */}
                <div className="flex flex-col gap-[6px] w-full">
                  <label className="font-medium leading-[20px] text-[#404040] text-[14px]">
                    Title (optional)
                  </label>
                  <div className="bg-white rounded-[8px] w-full border border-[#d4d4d4] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] focus-within:ring-4 focus-within:ring-[#f4ebff] focus-within:border-[#6941c6] transition-all overflow-hidden">
                    <input
                      type="text"
                      placeholder="Inferred from content if blank"
                      value={newDoc.title}
                      onChange={(e) =>
                        setNewDoc({ ...newDoc, title: e.target.value })
                      }
                      autoComplete="off"
                      className="w-full px-[12px] py-[8px] bg-transparent border-none outline-none font-normal text-[16px] text-[#171717] placeholder:text-[#737373]"
                    />
                  </div>
                </div>

                {showProjectSelect && (
                  <div className="flex flex-col gap-[6px] w-full">
                    <label className="font-medium leading-[20px] text-[#404040] text-[14px]">
                      Project
                    </label>
                    <Select
                      value={newDoc.projectId}
                      onValueChange={(projectId) =>
                        setNewDoc({ ...newDoc, projectId })
                      }
                    >
                      <SelectTrigger className="bg-white rounded-[8px] w-full border border-[#d4d4d4] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] focus:ring-4 focus:ring-[#f4ebff] focus:border-[#6941c6] transition-all h-auto px-[12px] py-[8px] text-[16px] font-medium text-[#171717]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="dashboard-light max-h-[260px]">
                        {projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                            {project.isDefault ? " (Default)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Tags + Visibility row */}
                <div className="flex flex-col sm:flex-row gap-[16px] items-start w-full">
                  <div className="flex flex-[1_0_0] flex-col gap-[6px] items-start">
                    <label className="font-medium leading-[20px] text-[#404040] text-[14px]">
                      Tags (optional)
                    </label>
                    <div className="bg-white rounded-[8px] w-full border border-[#d4d4d4] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] focus-within:ring-4 focus-within:ring-[#f4ebff] focus-within:border-[#6941c6] transition-all overflow-hidden">
                      <input
                        type="text"
                        placeholder="Comma separated tags"
                        value={newDoc.tagsInput}
                        onChange={(e) =>
                          setNewDoc({ ...newDoc, tagsInput: e.target.value })
                        }
                        autoComplete="off"
                        className="w-full px-[12px] py-[8px] bg-transparent border-none outline-none font-normal text-[16px] text-[#171717] placeholder:text-[#737373]"
                      />
                    </div>
                  </div>

                  <div className="flex flex-[1_0_0] flex-col gap-[6px] items-start">
                    <label className="font-medium leading-[20px] text-[#404040] text-[14px]">
                      Visibility
                    </label>
                    <Select
                      value={newDoc.visibility}
                      onValueChange={(v: Visibility) =>
                        setNewDoc({ ...newDoc, visibility: v })
                      }
                    >
                      <SelectTrigger className="bg-white rounded-[8px] w-full border border-[#d4d4d4] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] focus:ring-4 focus:ring-[#f4ebff] focus:border-[#6941c6] transition-all h-auto px-[12px] py-[8px] text-[16px] font-medium text-[#171717]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="dashboard-light">
                        <SelectItem value="private">Private</SelectItem>
                        <SelectItem value="workspace">Workspace</SelectItem>
                        <SelectItem value="public">Public</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Content textarea */}
                <div className="flex flex-col gap-[0px] w-full border border-[#d4d4d4] rounded-[12px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] bg-white overflow-hidden focus-within:ring-4 focus-within:ring-[#f4ebff] focus-within:border-[#6941c6] transition-all">
                  <textarea
                    placeholder="# Your document title&#10;&#10;Start writing your content here..."
                    value={newDoc.content}
                    onChange={(e) =>
                      setNewDoc({ ...newDoc, content: e.target.value })
                    }
                    className="w-full min-h-[144px] p-[16px] bg-transparent border-none outline-none resize-none font-mono text-[14px] text-[#171717] placeholder:text-[#737373]"
                  />
                </div>

                {publishError && (
                  <p className="text-[13px] text-[#DC2626]">{publishError}</p>
                )}
              </div>
            </div>

            {/* Action button */}
            <div className="flex flex-col items-start pt-[32px] pb-[24px] px-[24px] w-full">
              <button
                type="button"
                onClick={handlePublish}
                disabled={isPending}
                className="w-full flex items-center justify-center bg-[#7F56D9] hover:bg-[#6941C6] disabled:opacity-60 text-white text-[14px] font-semibold px-4 py-2.5 rounded-[8px] transition-colors shadow-sm border border-[#7F56D9]"
              >
                {isPending ? "Publishing..." : "Publish document"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Visibility Dialog — used for both single-row and bulk
          visibility changes. Copy + button label adapt based on
          `bulkActionMode`; the dialog itself stays one component so
          we don't render two parallel dialogs. */}
      <Dialog
        open={visibilityDialogOpen}
        onOpenChange={(open) => {
          setVisibilityDialogOpen(open);
          if (!open && bulkActionMode === "visibility") {
            setBulkActionMode(null);
          }
        }}
      >
        <DialogContent className="dashboard-light max-w-[min(400px,calc(100vw-32px))] max-h-[90vh] overflow-y-auto p-0 border-none bg-transparent shadow-none [&>button:last-child]:hidden outline-none">
          <div className="bg-white flex flex-col overflow-clip rounded-[16px] shadow-[0px_20px_24px_-4px_rgba(0,0,0,0.08),0px_8px_8px_-4px_rgba(0,0,0,0.03),0px_3px_3px_-1.5px_rgba(0,0,0,0.04)] w-full">
            {/* Header */}
            <div className="relative w-full">
              <div className="flex flex-col gap-[16px] items-start pt-[24px] px-[24px] w-full">
                <div className="rounded-[8px] size-[40px] bg-white border border-[#d4d4d4] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] flex items-center justify-center">
                  <Lock className="w-[20px] h-[20px] text-[#404040]" strokeWidth={1.67} />
                </div>
                <div className="flex flex-col gap-[2px] items-start w-full">
                  <DialogTitle className="font-semibold leading-[24px] text-[#171717] text-[16px] w-full">
                    {bulkActionMode === "visibility"
                      ? `Change visibility for ${selectedCount} document${selectedCount === 1 ? "" : "s"}`
                      : "Change Visibility"}
                  </DialogTitle>
                  <p className="font-normal leading-[20px] text-[#525252] text-[14px] w-full">
                    {bulkActionMode === "visibility"
                      ? "This will be applied to every selected document."
                      : "Control who can access this document."}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setVisibilityDialogOpen(false)}
                className="absolute flex items-center justify-center p-[8px] right-[16px] rounded-[8px] size-[36px] top-[16px] hover:bg-gray-100 transition-colors"
              >
                <X className="w-[20px] h-[20px] text-[#A3A3A3]" strokeWidth={1.67} />
              </button>
            </div>

            {/* Select */}
            <div className="px-[24px] pt-[20px]">
              <div className="flex flex-col gap-[6px] w-full">
                <label className="font-medium leading-[20px] text-[#404040] text-[14px]">
                  Visibility Level
                </label>
                <Select
                  value={tempVisibility}
                  onValueChange={(v: Visibility) => setTempVisibility(v)}
                >
                  <SelectTrigger className="bg-white rounded-[8px] w-full border border-[#d4d4d4] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] focus:ring-4 focus:ring-[#f4ebff] focus:border-[#6941c6] transition-all h-auto px-[12px] py-[8px] text-[16px] font-medium text-[#171717]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dashboard-light">
                    <SelectItem value="private">Private (Author only)</SelectItem>
                    <SelectItem value="workspace">Workspace (Team members)</SelectItem>
                    <SelectItem value="public">Public (Anyone)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-[12px] items-start pt-[32px] pb-[24px] px-[24px] w-full">
              <button
                onClick={() => setVisibilityDialogOpen(false)}
                className="flex-[1_0_0] flex items-center justify-center px-[14px] py-[10px] rounded-[8px] border border-[#d4d4d4] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] bg-white hover:bg-gray-50 transition-colors text-[14px] font-semibold text-[#404040]"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveVisibility}
                disabled={isSavingVisibility || isBulkActing}
                className="flex-[1_0_0] flex items-center justify-center px-[14px] py-[10px] rounded-[8px] bg-[#7F56D9] hover:bg-[#6941C6] text-white text-[14px] font-semibold transition-colors shadow-sm border border-[#7F56D9] disabled:opacity-60"
              >
                {bulkActionMode === "visibility"
                  ? isBulkActing
                    ? "Updating..."
                    : `Update ${selectedCount} document${selectedCount === 1 ? "" : "s"}`
                  : isSavingVisibility
                    ? "Saving..."
                    : "Save Changes"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation — used for both single-row and bulk
          deletes. Branches on `bulkActionMode` to render the right
          copy and route the confirm to the right handler. */}
      <AlertDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          setDeleteConfirmOpen(open);
          if (!open && bulkActionMode === "delete") {
            setBulkActionMode(null);
          }
        }}
      >
        <AlertDialogContent className="dashboard-light max-w-[min(400px,calc(100vw-32px))] max-h-[90vh] overflow-y-auto p-0 border-none bg-transparent shadow-none">
          <div className="bg-white flex flex-col items-center overflow-clip rounded-[16px] shadow-[0px_20px_24px_-4px_rgba(0,0,0,0.08),0px_8px_8px_-4px_rgba(0,0,0,0.03),0px_3px_3px_-1.5px_rgba(0,0,0,0.04)] w-full">
            {/* Header */}
            <div className="relative w-full">
              <div className="flex flex-col gap-[16px] items-start pt-[24px] px-[24px] w-full">
                <div className="rounded-[8px] size-[40px] bg-white border border-[#d4d4d4] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] flex items-center justify-center">
                  <Trash2 className="w-[20px] h-[20px] text-[#DC2626]" strokeWidth={1.67} />
                </div>
                <div className="flex flex-col gap-[2px] items-start w-full">
                  <AlertDialogHeader className="p-0 space-y-0">
                    <AlertDialogTitle className="font-semibold leading-[24px] text-[#171717] text-[16px] w-full text-left">
                      {bulkActionMode === "delete"
                        ? `Delete ${selectedCount} document${selectedCount === 1 ? "" : "s"}`
                        : "Delete document"}
                    </AlertDialogTitle>
                    <AlertDialogDescription className="font-normal leading-[20px] text-[#525252] text-[14px] w-full text-left">
                      {bulkActionMode === "delete"
                        ? `Are you sure you want to delete ${selectedCount === 1 ? "this document" : `these ${selectedCount} documents`}? This action cannot be undone.`
                        : "Are you sure you want to delete this document? This action cannot be undone."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                </div>
              </div>
              <button
                onClick={() => setDeleteConfirmOpen(false)}
                className="absolute flex items-center justify-center p-[8px] right-[16px] rounded-[8px] size-[36px] top-[16px] hover:bg-gray-100 transition-colors"
              >
                <X className="w-[20px] h-[20px] text-[#A3A3A3]" strokeWidth={1.67} />
              </button>
            </div>

            {/* Footer */}
            <AlertDialogFooter className="flex-row gap-[12px] pt-[32px] pb-[24px] px-[24px] w-full sm:justify-stretch">
              <AlertDialogCancel className="flex-[1_0_0] mt-0 flex items-center justify-center px-[14px] py-[10px] rounded-[8px] border border-[#d4d4d4] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] bg-white hover:bg-gray-50 transition-colors text-[14px] font-semibold text-[#404040]">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  // Radix's AlertDialogAction auto-closes on click. We
                  // intercept and route to the bulk handler when in
                  // bulk mode — `runBulkDelete` handles its own close
                  // after the loop completes (so the user sees a
                  // loading state instead of an instant dismiss).
                  if (bulkActionMode === "delete") {
                    e.preventDefault();
                    void runBulkDelete();
                    return;
                  }
                  handleDelete();
                }}
                disabled={isDeleting || isBulkActing}
                className="flex-[1_0_0] flex items-center justify-center px-[14px] py-[10px] rounded-[8px] bg-[#DC2626] hover:bg-[#b91c1c] text-white text-[14px] font-semibold transition-colors border-none shadow-sm disabled:opacity-60"
              >
                {bulkActionMode === "delete"
                  ? isBulkActing
                    ? "Deleting..."
                    : `Delete ${selectedCount} document${selectedCount === 1 ? "" : "s"}`
                  : isDeleting
                    ? "Deleting..."
                    : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Public Confirmation */}
      <AlertDialog open={publicConfirmOpen} onOpenChange={setPublicConfirmOpen}>
        <AlertDialogContent className="dashboard-light max-w-[min(400px,calc(100vw-32px))] max-h-[90vh] overflow-y-auto p-0 border-none bg-transparent shadow-none">
          <div className="bg-white flex flex-col items-center overflow-clip rounded-[16px] shadow-[0px_20px_24px_-4px_rgba(0,0,0,0.08),0px_8px_8px_-4px_rgba(0,0,0,0.03),0px_3px_3px_-1.5px_rgba(0,0,0,0.04)] w-full">
            {/* Header */}
            <div className="relative w-full">
              <div className="flex flex-col gap-[16px] items-start pt-[24px] px-[24px] w-full">
                <div className="rounded-[8px] size-[40px] bg-white border border-[#d4d4d4] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] flex items-center justify-center">
                  <Eye className="w-[20px] h-[20px] text-[#404040]" strokeWidth={1.67} />
                </div>
                <div className="flex flex-col gap-[2px] items-start w-full">
                  <AlertDialogHeader className="p-0 space-y-0">
                    <AlertDialogTitle className="font-semibold leading-[24px] text-[#171717] text-[16px] w-full text-left">
                      Make Document Public?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="font-normal leading-[20px] text-[#525252] text-[14px] w-full text-left">
                      This document will be accessible to anyone with the link. Are you sure you want to continue?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                </div>
              </div>
              <button
                onClick={() => setPublicConfirmOpen(false)}
                className="absolute flex items-center justify-center p-[8px] right-[16px] rounded-[8px] size-[36px] top-[16px] hover:bg-gray-100 transition-colors"
              >
                <X className="w-[20px] h-[20px] text-[#A3A3A3]" strokeWidth={1.67} />
              </button>
            </div>

            {/* Footer */}
            <AlertDialogFooter className="flex-row gap-[12px] pt-[32px] pb-[24px] px-[24px] w-full sm:justify-stretch">
              <AlertDialogCancel className="flex-[1_0_0] mt-0 flex items-center justify-center px-[14px] py-[10px] rounded-[8px] border border-[#d4d4d4] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] bg-white hover:bg-gray-50 transition-colors text-[14px] font-semibold text-[#404040]">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setPublicConfirmOpen(false);
                  doPublish();
                }}
                className="flex-[1_0_0] flex items-center justify-center px-[14px] py-[10px] rounded-[8px] bg-[#7F56D9] hover:bg-[#6941C6] text-white text-[14px] font-semibold transition-colors border-none shadow-sm"
              >
                Make Public
              </AlertDialogAction>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Upload Dialog — shown when the user selects 2+ .md files.
          Mirrors the Add Document modal's visual pattern but replaces
          Title + Content with a preview of the filenames about to go up. */}
      <Dialog
        open={bulkUploadDialogOpen}
        onOpenChange={(open) => {
          setBulkUploadDialogOpen(open);
          if (!open) {
            setPendingBulkFiles([]);
            setBulkTagsInput("");
            setBulkProjectId(defaultProjectId);
          }
        }}
      >
        <DialogContent className="dashboard-light max-w-[min(480px,calc(100vw-32px))] max-h-[90vh] overflow-y-auto p-0 border-none bg-transparent shadow-none [&>button:last-child]:hidden outline-none">
          <div className="bg-white flex flex-col items-center overflow-clip rounded-[16px] shadow-[0px_20px_24px_-4px_rgba(0,0,0,0.08),0px_8px_8px_-4px_rgba(0,0,0,0.03),0px_3px_3px_-1.5px_rgba(0,0,0,0.04)] w-full">
            {/* Dialog Header */}
            <div className="flex flex-col items-center w-full relative">
              <div className="w-full">
                <div className="flex flex-col gap-[16px] items-start pt-[24px] px-[24px] w-full">
                  <div className="rounded-[8px] size-[40px] bg-white border border-[#d4d4d4] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] flex items-center justify-center">
                    <CloudUpload className="w-[20px] h-[20px] text-[#404040]" strokeWidth={1.67} />
                  </div>
                  <div className="flex flex-col gap-[2px] items-start w-full">
                    <DialogTitle className="font-semibold leading-[24px] text-[#171717] text-[16px] w-full">
                      Upload {pendingBulkFiles.length} document
                      {pendingBulkFiles.length === 1 ? "" : "s"}
                    </DialogTitle>
                    <DialogDescription className="font-normal leading-[20px] text-[#525252] text-[14px] w-full">
                      Set visibility and tags for every document in this batch.
                    </DialogDescription>
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  setBulkUploadDialogOpen(false);
                  setPendingBulkFiles([]);
                  setBulkTagsInput("");
                  setBulkProjectId(defaultProjectId);
                }}
                className="absolute flex items-center justify-center p-[8px] right-[16px] rounded-[8px] size-[36px] top-[16px] hover:bg-gray-100 transition-colors"
              >
                <X className="w-[20px] h-[20px] text-[#A3A3A3]" strokeWidth={1.67} />
              </button>
              <div className="h-[20px] w-full" />
            </div>

            {/* Form Fields */}
            <div className="w-full px-[24px]">
              <div className="flex flex-col gap-[16px] w-full">
                {showProjectSelect && (
                  <div className="flex flex-col gap-[6px] w-full">
                    <label className="font-medium leading-[20px] text-[#404040] text-[14px]">
                      Project
                    </label>
                    <Select
                      value={bulkProjectId}
                      onValueChange={setBulkProjectId}
                    >
                      <SelectTrigger className="bg-white rounded-[8px] w-full border border-[#d4d4d4] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] focus:ring-4 focus:ring-[#f4ebff] focus:border-[#6941c6] transition-all h-auto px-[12px] py-[8px] text-[16px] font-medium text-[#171717]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="dashboard-light max-h-[260px]">
                        {projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                            {project.isDefault ? " (Default)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Tags + Visibility row */}
                <div className="flex flex-col sm:flex-row gap-[16px] items-start w-full">
                  <div className="flex flex-[1_0_0] flex-col gap-[6px] items-start">
                    <label className="font-medium leading-[20px] text-[#404040] text-[14px]">
                      Tags (optional)
                    </label>
                    <div className="bg-white rounded-[8px] w-full border border-[#d4d4d4] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] focus-within:ring-4 focus-within:ring-[#f4ebff] focus-within:border-[#6941c6] transition-all overflow-hidden">
                      <input
                        type="text"
                        placeholder="Applied to all files"
                        value={bulkTagsInput}
                        onChange={(e) => setBulkTagsInput(e.target.value)}
                        autoComplete="off"
                        className="w-full px-[12px] py-[8px] bg-transparent border-none outline-none font-normal text-[16px] text-[#171717] placeholder:text-[#737373]"
                      />
                    </div>
                  </div>

                  <div className="flex flex-[1_0_0] flex-col gap-[6px] items-start">
                    <label className="font-medium leading-[20px] text-[#404040] text-[14px]">
                      Visibility
                    </label>
                    <Select
                      value={bulkVisibility}
                      onValueChange={(v: Visibility) => setBulkVisibility(v)}
                    >
                      <SelectTrigger className="bg-white rounded-[8px] w-full border border-[#d4d4d4] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] focus:ring-4 focus:ring-[#f4ebff] focus:border-[#6941c6] transition-all h-auto px-[12px] py-[8px] text-[16px] font-medium text-[#171717]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="dashboard-light">
                        <SelectItem value="private">Private</SelectItem>
                        <SelectItem value="workspace">Workspace</SelectItem>
                        <SelectItem value="public">Public</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Filename preview — compact stack of chips so the user
                    can eyeball the batch before it publishes. Capped at 6
                    visible rows with a "+N more" footer so 50 files don't
                    push the confirm button below the fold. */}
                <div className="flex flex-col gap-[6px] w-full">
                  <label className="font-medium leading-[20px] text-[#404040] text-[14px]">
                    Files
                  </label>
                  <div className="flex flex-col gap-[4px] w-full border border-[#d4d4d4] rounded-[8px] bg-[#fafafa] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] p-[8px] max-h-[180px] overflow-y-auto">
                    {pendingBulkFiles.slice(0, 6).map((f, i) => (
                      <div
                        key={`${f.name}-${i}`}
                        className="flex items-center gap-[8px] px-[8px] py-[6px] rounded-[6px] bg-white border border-[#e5e5e5]"
                      >
                        <CloudUpload
                          className="w-[14px] h-[14px] text-[#737373] shrink-0"
                          strokeWidth={1.67}
                        />
                        <span className="font-mono text-[13px] text-[#404040] truncate">
                          {f.name}
                        </span>
                      </div>
                    ))}
                    {pendingBulkFiles.length > 6 && (
                      <div className="px-[8px] py-[4px] text-[12px] text-[#737373]">
                        + {pendingBulkFiles.length - 6} more
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-[12px] items-start pt-[32px] pb-[24px] px-[24px] w-full">
              <button
                type="button"
                onClick={() => {
                  setBulkUploadDialogOpen(false);
                  setPendingBulkFiles([]);
                  setBulkTagsInput("");
                  setBulkProjectId(defaultProjectId);
                }}
                className="flex-[1_0_0] flex items-center justify-center px-[14px] py-[10px] rounded-[8px] border border-[#d4d4d4] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] bg-white hover:bg-gray-50 transition-colors text-[14px] font-semibold text-[#404040]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkConfirm}
                disabled={pendingBulkFiles.length === 0}
                className="flex-[1_0_0] flex items-center justify-center bg-[#7F56D9] hover:bg-[#6941C6] disabled:opacity-60 text-white text-[14px] font-semibold px-[14px] py-[10px] rounded-[8px] transition-colors shadow-sm border border-[#7F56D9]"
              >
                Upload {pendingBulkFiles.length} document
                {pendingBulkFiles.length === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Public Confirmation — same shape as the single-publish
          public confirm, but fires when the user picks "Public" in the
          bulk dialog. Kept separate so cancelling returns them to the
          bulk dialog with their selections intact instead of dropping
          them back to a blank dashboard. */}
      <AlertDialog
        open={bulkPublicConfirmOpen}
        onOpenChange={setBulkPublicConfirmOpen}
      >
        <AlertDialogContent className="dashboard-light max-w-[min(400px,calc(100vw-32px))] max-h-[90vh] overflow-y-auto p-0 border-none bg-transparent shadow-none">
          <div className="bg-white flex flex-col items-center overflow-clip rounded-[16px] shadow-[0px_20px_24px_-4px_rgba(0,0,0,0.08),0px_8px_8px_-4px_rgba(0,0,0,0.03),0px_3px_3px_-1.5px_rgba(0,0,0,0.04)] w-full">
            {/* Header */}
            <div className="relative w-full">
              <div className="flex flex-col gap-[16px] items-start pt-[24px] px-[24px] w-full">
                <div className="rounded-[8px] size-[40px] bg-white border border-[#d4d4d4] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] flex items-center justify-center">
                  <Eye className="w-[20px] h-[20px] text-[#404040]" strokeWidth={1.67} />
                </div>
                <div className="flex flex-col gap-[2px] items-start w-full">
                  <AlertDialogHeader className="p-0 space-y-0">
                    <AlertDialogTitle className="font-semibold leading-[24px] text-[#171717] text-[16px] w-full text-left">
                      Publish {pendingBulkFiles.length} document
                      {pendingBulkFiles.length === 1 ? "" : "s"} publicly?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="font-normal leading-[20px] text-[#525252] text-[14px] w-full text-left">
                      Every document in this batch will be accessible to anyone with the link. Are you sure?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                </div>
              </div>
              <button
                onClick={() => setBulkPublicConfirmOpen(false)}
                className="absolute flex items-center justify-center p-[8px] right-[16px] rounded-[8px] size-[36px] top-[16px] hover:bg-gray-100 transition-colors"
              >
                <X className="w-[20px] h-[20px] text-[#A3A3A3]" strokeWidth={1.67} />
              </button>
            </div>

            {/* Footer */}
            <AlertDialogFooter className="flex-row gap-[12px] pt-[32px] pb-[24px] px-[24px] w-full sm:justify-stretch">
              <AlertDialogCancel className="flex-[1_0_0] mt-0 flex items-center justify-center px-[14px] py-[10px] rounded-[8px] border border-[#d4d4d4] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] bg-white hover:bg-gray-50 transition-colors text-[14px] font-semibold text-[#404040]">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={runBulkUpload}
                className="flex-[1_0_0] flex items-center justify-center px-[14px] py-[10px] rounded-[8px] bg-[#7F56D9] hover:bg-[#6941C6] text-white text-[14px] font-semibold transition-colors border-none shadow-sm"
              >
                Make all public
              </AlertDialogAction>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Visibility → Public Confirmation — fires when the user
          picks "Public" inside the bulk visibility dialog. Same shape
          as the single-row public confirm so the experience is
          consistent. Cancelling here returns the user to the bulk
          visibility dialog with their selection intact. */}
      <AlertDialog
        open={bulkPublicVisibilityConfirmOpen}
        onOpenChange={setBulkPublicVisibilityConfirmOpen}
      >
        <AlertDialogContent className="dashboard-light max-w-[min(400px,calc(100vw-32px))] max-h-[90vh] overflow-y-auto p-0 border-none bg-transparent shadow-none">
          <div className="bg-white flex flex-col items-center overflow-clip rounded-[16px] shadow-[0px_20px_24px_-4px_rgba(0,0,0,0.08),0px_8px_8px_-4px_rgba(0,0,0,0.03),0px_3px_3px_-1.5px_rgba(0,0,0,0.04)] w-full">
            <div className="relative w-full">
              <div className="flex flex-col gap-[16px] items-start pt-[24px] px-[24px] w-full">
                <div className="rounded-[8px] size-[40px] bg-white border border-[#d4d4d4] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] flex items-center justify-center">
                  <Eye className="w-[20px] h-[20px] text-[#404040]" strokeWidth={1.67} />
                </div>
                <div className="flex flex-col gap-[2px] items-start w-full">
                  <AlertDialogHeader className="p-0 space-y-0">
                    <AlertDialogTitle className="font-semibold leading-[24px] text-[#171717] text-[16px] w-full text-left">
                      Make {selectedCount} document{selectedCount === 1 ? "" : "s"} public?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="font-normal leading-[20px] text-[#525252] text-[14px] w-full text-left">
                      Every selected document will be accessible to anyone with the link. Are you sure?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                </div>
              </div>
              <button
                onClick={() => setBulkPublicVisibilityConfirmOpen(false)}
                className="absolute flex items-center justify-center p-[8px] right-[16px] rounded-[8px] size-[36px] top-[16px] hover:bg-gray-100 transition-colors"
              >
                <X className="w-[20px] h-[20px] text-[#A3A3A3]" strokeWidth={1.67} />
              </button>
            </div>

            <AlertDialogFooter className="flex-row gap-[12px] pt-[32px] pb-[24px] px-[24px] w-full sm:justify-stretch">
              <AlertDialogCancel className="flex-[1_0_0] mt-0 flex items-center justify-center px-[14px] py-[10px] rounded-[8px] border border-[#d4d4d4] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] bg-white hover:bg-gray-50 transition-colors text-[14px] font-semibold text-[#404040]">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  void runBulkVisibilityChange("public");
                }}
                disabled={isBulkActing}
                className="flex-[1_0_0] flex items-center justify-center px-[14px] py-[10px] rounded-[8px] bg-[#7F56D9] hover:bg-[#6941C6] text-white text-[14px] font-semibold transition-colors border-none shadow-sm disabled:opacity-60"
              >
                {isBulkActing ? "Updating..." : "Make all public"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
