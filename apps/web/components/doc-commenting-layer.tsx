"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { usePlatformIsMac } from "@/lib/use-platform";

import "./doc-commenting-layer.css";

type DocCommentingLayerProps = {
  postId: string;
  canComment: boolean;
  isViewerSignedIn: boolean;
};

type ApiComment = {
  id: string;
  postId: string;
  parentCommentId: string | null;
  authorUserId: string;
  authorUsername: string | null;
  authorFullName: string | null;
  authorAvatarUrl: string | null;
  body: string;
  quotedText: string | null;
  anchorBefore: string | null;
  anchorAfter: string | null;
  startOffset: number | null;
  endOffset: number | null;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

type ResolvedAnchor = {
  startOffset: number;
  endOffset: number;
};

type ThreadView = {
  root: ApiComment;
  replies: ApiComment[];
  anchor: ResolvedAnchor | null;
  status: "active" | "resolved" | "orphaned";
};

const ANCHOR_CONTEXT_LEN = 30;

function setThreadHighlightHover(threadId: string, hovered: boolean) {
  document
    .querySelectorAll<HTMLElement>("[data-od-comment-highlight]")
    .forEach((el) => {
      if (el.dataset.odCommentHighlight === threadId) {
        el.classList.toggle("is-hovered", hovered);
      }
    });
}

function rectForSelectionBubble(range: Range): {
  x: number;
  y: number;
  placement: "above" | "below";
} | null {
  const rects = Array.from(range.getClientRects()).filter(
    (rect) => rect.width > 0 && rect.height > 0,
  );
  const first = rects[0] ?? range.getBoundingClientRect();
  const last = rects[rects.length - 1] ?? first;
  if (first.width === 0 && first.height === 0) return null;

  const viewportPadding = 16;
  const x = Math.min(
    window.innerWidth - viewportPadding,
    Math.max(viewportPadding, first.left + first.width / 2),
  );

  if (first.top >= 64) {
    return {
      x,
      y: first.top - 10,
      placement: "above",
    };
  }

  return {
    x,
    y: last.bottom + 10,
    placement: "below",
  };
}

/**
 * Walks the article DOM and produces:
 *   - the concatenated plain text (used for offset math)
 *   - an ordered list of text-node ranges so we can map an offset
 *     interval back to a real DOM range when wrapping highlights.
 *
 * We include every selectable text node in the article body — headings,
 * table cells, inline formatting, and code/preformatted blocks. The
 * product rule is simple: if a reader can highlight visible article
 * text, they can attach a comment to it.
 */
function collectTextNodes(root: HTMLElement) {
  const nodes: Array<{ node: Text; start: number; end: number }> = [];
  let cursor = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.nodeValue && node.nodeValue.length > 0
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  let current = walker.nextNode() as Text | null;
  while (current) {
    const len = current.nodeValue?.length ?? 0;
    nodes.push({ node: current, start: cursor, end: cursor + len });
    cursor += len;
    current = walker.nextNode() as Text | null;
  }

  let plain = "";
  for (const item of nodes) {
    plain += item.node.nodeValue ?? "";
  }
  return { nodes, plain };
}

function offsetsForRange(
  range: Range,
  textNodes: ReturnType<typeof collectTextNodes>["nodes"],
): { startOffset: number; endOffset: number } | null {
  let startOffset: number | null = null;
  let endOffset: number | null = null;

  for (const item of textNodes) {
    if (!range.intersectsNode(item.node)) {
      continue;
    }

    const localStart =
      item.node === range.startContainer ? range.startOffset : 0;
    const localEnd =
      item.node === range.endContainer ? range.endOffset : item.node.length;

    if (startOffset === null) {
      startOffset = item.start + localStart;
    }
    endOffset = item.start + localEnd;
  }

  if (startOffset === null || endOffset === null || startOffset === endOffset) {
    return null;
  }
  return { startOffset, endOffset };
}

function rangeForOffsets(
  startOffset: number,
  endOffset: number,
  textNodes: ReturnType<typeof collectTextNodes>["nodes"],
): Range | null {
  let startNode: Text | null = null;
  let startInNode = 0;
  let endNode: Text | null = null;
  let endInNode = 0;
  for (const item of textNodes) {
    if (
      startNode === null &&
      startOffset >= item.start &&
      startOffset <= item.end
    ) {
      startNode = item.node;
      startInNode = startOffset - item.start;
    }
    if (
      endNode === null &&
      endOffset >= item.start &&
      endOffset <= item.end
    ) {
      endNode = item.node;
      endInNode = endOffset - item.start;
    }
    if (startNode && endNode) break;
  }
  if (!startNode || !endNode) return null;

  const range = document.createRange();
  try {
    range.setStart(startNode, startInNode);
    range.setEnd(endNode, endInNode);
  } catch {
    return null;
  }
  return range;
}

/**
 * Tries the cheap path (raw offsets) first, then a fingerprint
 * fallback that re-locates the quoted text using its before/after
 * context so a re-published doc keeps its highlights even when the
 * markdown around the comment shifted.
 */
function resolveAnchor(
  comment: ApiComment,
  plainText: string,
): ResolvedAnchor | null {
  if (
    comment.startOffset !== null &&
    comment.endOffset !== null &&
    comment.quotedText &&
    plainText.slice(comment.startOffset, comment.endOffset) ===
      comment.quotedText
  ) {
    return {
      startOffset: comment.startOffset,
      endOffset: comment.endOffset,
    };
  }

  if (!comment.quotedText) return null;

  const before = comment.anchorBefore ?? "";
  const after = comment.anchorAfter ?? "";
  const haystack = plainText;
  const needle = comment.quotedText;

  // Search candidate occurrences and score each by how well its
  // surrounding context matches the stored before/after fingerprints.
  // Pick the highest-scoring candidate; fall back to first match.
  let best: { index: number; score: number } | null = null;
  let from = 0;
  while (from <= haystack.length) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) break;
    const candBefore = haystack.slice(Math.max(0, idx - before.length), idx);
    const candAfter = haystack.slice(
      idx + needle.length,
      idx + needle.length + after.length,
    );
    let score = 0;
    if (before && candBefore.endsWith(before.slice(-Math.min(20, before.length)))) {
      score += 2;
    }
    if (after && candAfter.startsWith(after.slice(0, Math.min(20, after.length)))) {
      score += 2;
    }
    if (!best || score > best.score) best = { index: idx, score };
    from = idx + 1;
  }

  if (!best) return null;
  return {
    startOffset: best.index,
    endOffset: best.index + needle.length,
  };
}

/**
 * Wraps a [start, end) plain-text offset range by creating one span
 * per intersected text node, returning the spans + click cleanups.
 * Splits across element boundaries cleanly so a selection that runs
 * from one paragraph into the next still renders a single visual
 * highlight (made of N adjacent spans, one per paragraph segment).
 */
function wrapOffsetRange(
  startOffset: number,
  endOffset: number,
  textNodes: ReturnType<typeof collectTextNodes>["nodes"],
  threadId: string,
  className: string,
  onClick: (threadId: string) => void,
): Array<{ wrapper: HTMLSpanElement; cleanup: () => void }> {
  const wraps: Array<{ wrapper: HTMLSpanElement; cleanup: () => void }> = [];

  for (const item of textNodes) {
    if (item.end <= startOffset || item.start >= endOffset) continue;

    const localStart = Math.max(0, startOffset - item.start);
    const localEnd = Math.min(
      item.node.length,
      endOffset - item.start,
    );
    if (localEnd <= localStart) continue;

    const subRange = document.createRange();
    try {
      subRange.setStart(item.node, localStart);
      subRange.setEnd(item.node, localEnd);
    } catch {
      continue;
    }

    try {
      const wrapper = document.createElement("span");
      wrapper.dataset.odCommentHighlight = threadId;
      wrapper.className = className;
      const handler = (event: MouseEvent) => {
        event.stopPropagation();
        onClick(threadId);
      };
      const hoverIn = () => setThreadHighlightHover(threadId, true);
      const hoverOut = () => setThreadHighlightHover(threadId, false);
      wrapper.addEventListener("click", handler);
      wrapper.addEventListener("mouseenter", hoverIn);
      wrapper.addEventListener("mouseleave", hoverOut);
      // surroundContents on a single-text-node range never throws,
      // because there are no element boundaries to straddle.
      subRange.surroundContents(wrapper);
      wraps.push({
        wrapper,
        cleanup: () => {
          wrapper.removeEventListener("click", handler);
          wrapper.removeEventListener("mouseenter", hoverIn);
          wrapper.removeEventListener("mouseleave", hoverOut);
        },
      });
    } catch {
      // Defensive — if anything still throws (e.g. the text node is
      // already wrapped by a longer overlapping highlight), skip
      // this segment. The thread still appears in the sidebar.
    }
  }

  return wraps;
}

/**
 * Wraps every active thread's anchor range in a span so it renders as
 * a subtle highlight. We rebuild from scratch on every comment-set
 * change rather than diffing — the article body is small enough that
 * a fresh pass per refresh is cheaper than a stable-id diff and keeps
 * the code easy to reason about.
 */
function applyHighlights(
  root: HTMLElement,
  threads: ThreadView[],
  activeThreadId: string | null,
  onClick: (threadId: string) => void,
): () => void {
  // Strip prior highlights first.
  const prior = root.querySelectorAll("[data-od-comment-highlight]");
  prior.forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
    parent.normalize();
  });

  const { nodes } = collectTextNodes(root);
  const cleanups: Array<() => void> = [];

  // Sort longest-first so overlapping selections wrap the outer
  // range before any nested ones — nested wraps then live inside the
  // outer span without disturbing its boundaries.
  const ordered = [...threads].sort((a, b) => {
    const al = a.anchor ? a.anchor.endOffset - a.anchor.startOffset : 0;
    const bl = b.anchor ? b.anchor.endOffset - b.anchor.startOffset : 0;
    return bl - al;
  });

  for (const thread of ordered) {
    if (!thread.anchor) continue;

    // Many real selections cross element boundaries — e.g. a span
    // that runs from the end of one paragraph into the next, or from
    // a heading into its body. `Range.surroundContents()` throws on
    // those because a single span can't legally wrap content split
    // across non-text parents. So we slice the global offset range
    // into per-text-node sub-ranges and wrap each individually. The
    // visual result is identical to a single wrap.
    const wraps = wrapOffsetRange(
      thread.anchor.startOffset,
      thread.anchor.endOffset,
      nodes,
      thread.root.id,
      `od-comment-highlight${
        activeThreadId === thread.root.id ? " is-active" : ""
      }${thread.status === "resolved" ? " is-resolved" : ""}`,
      onClick,
    );

    if (wraps.length === 0) continue;
    cleanups.push(...wraps.map((w) => w.cleanup));

    // After wrapping, re-collect so subsequent inner wraps target
    // the right text nodes (the wrappers now sit in the tree).
    const refresh = collectTextNodes(root);
    nodes.length = 0;
    nodes.push(...refresh.nodes);
  }

  return () => {
    cleanups.forEach((fn) => fn());
  };
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function authorDisplay(comment: ApiComment): string {
  return (
    comment.authorFullName ||
    comment.authorUsername ||
    "Workspace member"
  );
}

function authorInitial(comment: ApiComment): string {
  return authorDisplay(comment).charAt(0).toUpperCase();
}

/**
 * `Cmd+Enter` (Mac) / `Ctrl+Enter` (Win/Linux) is the de-facto "send"
 * chord across nearly every chat UI — Slack, Discord, GitHub. We
 * preventDefault so the textarea doesn't also insert a newline and
 * then call `submit()` if the body is non-empty and we're not already
 * mid-flight.
 */
function isSubmitChord(event: React.KeyboardEvent<HTMLTextAreaElement>) {
  return (event.metaKey || event.ctrlKey) && event.key === "Enter";
}

export function DocCommentingLayer({
  postId,
  canComment,
  isViewerSignedIn,
}: DocCommentingLayerProps) {
  const [comments, setComments] = useState<ApiComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  // `closing` keeps the panel mounted for one animation cycle after
  // the viewer dismisses it, so the slide-out keyframe has time to
  // play before React removes the node from the DOM. The panel reads
  // `is-closing` while this is true and then unmounts.
  const [closing, setClosing] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [pendingAnchor, setPendingAnchor] = useState<{
    startOffset: number;
    endOffset: number;
    quotedText: string;
    anchorBefore: string;
    anchorAfter: string;
  } | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [replyBodies, setReplyBodies] = useState<Record<string, string>>({});
  const [documentComposerOpen, setDocumentComposerOpen] = useState(false);
  const [submittingNewComment, setSubmittingNewComment] = useState(false);
  const [submittingReplyThreadId, setSubmittingReplyThreadId] = useState<string | null>(null);
  const [resolvingThreadId, setResolvingThreadId] = useState<string | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [bubble, setBubble] = useState<{
    x: number;
    y: number;
    placement: "above" | "below";
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  // Tracks which comment row is currently showing the inline
  // "Confirm delete?" affordance. Replaces a native `window.confirm()`
  // dialog — the browser dialog wasn't fitting the rest of the panel
  // chrome and felt jarring; doing it in-panel keeps the delete flow
  // consistent with the rest of the comment UI.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const articleRootRef = useRef<HTMLElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  // Reference to the no-anchor draft textarea so the ⌘⌥M / Ctrl+Alt+M
  // keyboard shortcut can drop the caret into it when the panel is
  // opened without a text selection.
  const noAnchorDraftRef = useRef<HTMLTextAreaElement | null>(null);
  const isMac = usePlatformIsMac();
  const newCommentShortcut = isMac ? "⌘⌥M" : "Ctrl+Alt+M";
  // Send-shortcut label for the textarea Submit hint. Mirrors the
  // ⌘+Enter (Mac) / Ctrl+Enter (Windows/Linux) keybind that the
  // textareas listen for. Using the ↵ glyph keeps the badge tight
  // even on narrow widths.
  const submitShortcut = isMac ? "⌘↵" : "Ctrl+↵";

  // Animated close: paint the slide-out frame, then unmount once the
  // animation finishes. Duration is kept in sync with the
  // `od-comment-slide-out` keyframe in the CSS — bump both if you
  // want a longer dismiss.
  const closePanel = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }
    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
      setPendingAnchor(null);
      setActiveThreadId(null);
      setPendingDeleteId(null);
      closeTimerRef.current = null;
    }, 180);
  }, []);

  // Intentionally DO NOT page-lock scroll while the panel is open.
  // The UX we want is:
  //   - mouse over the panel → panel scrolls, article stays put
  //   - mouse over the article → article scrolls, panel stays put
  // A blanket `html/body { overflow: hidden }` breaks the second half
  // because the article can't scroll either. Instead we rely on the
  // panel body's `overscroll-behavior: contain` (CSS) to keep the
  // wheel contained inside the panel when the cursor is over it, and
  // a non-passive wheel listener below as a belt-and-suspenders
  // fallback for the case where the panel has nothing to scroll —
  // in that case `contain` alone still lets the wheel bubble to the
  // article because the browser never "handled" it.
  useEffect(() => {
    if (!open) return;
    const panel = document.querySelector<HTMLElement>(".od-comment-panel");
    if (!panel) return;
    function onWheel(event: WheelEvent) {
      const body = panel?.querySelector<HTMLElement>(".od-comment-panel__body");
      if (!body) return;
      const canScroll = body.scrollHeight > body.clientHeight;
      // If the panel body has no scrollable content, the wheel would
      // otherwise bubble out and scroll the article underneath —
      // which looks like the sidebar is a transparent passthrough.
      // Eat the event so the panel feels opaque to wheel input.
      if (!canScroll) {
        event.preventDefault();
      }
    }
    panel.addEventListener("wheel", onWheel, { passive: false });
    return () => panel.removeEventListener("wheel", onWheel);
  }, [open]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  // The header pill (`CommentsTrigger`) lives well above this
  // component in the tree — outside the article shell — so we bridge
  // them with a window event instead of hoisting state. When the
  // pill fires `od-open-comments`, we open the panel; when our
  // comment set changes, we publish the active-thread count back so
  // the pill can show its badge.
  useEffect(() => {
    function onOpenRequest() {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setClosing(false);
      setOpen(true);
    }
    window.addEventListener("od-open-comments", onOpenRequest);
    return () => window.removeEventListener("od-open-comments", onOpenRequest);
  }, []);

  // Locate the article body once on mount. We don't own it (it's
  // rendered via dangerouslySetInnerHTML by the shell), so we poke at
  // the DOM through the data-attribute marker the shell puts on it.
  useEffect(() => {
    articleRootRef.current = document.querySelector<HTMLElement>(
      "[data-od-comment-root]",
    );
  }, []);

  const loadComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        cache: "no-store",
      });
      if (!res.ok) {
        if (res.status === 403) {
          // Restricted post we can't see — bail silently. Shouldn't
          // happen in practice because the page wouldn't have rendered
          // for an outsider, but we don't want to spam the console.
          setLoading(false);
          return;
        }
        throw new Error(`Failed (${res.status})`);
      }
      const json: { comments: ApiComment[] } = await res.json();
      setComments(json.comments);
    } catch (err) {
      console.error("[comments] load failed", err);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  // Refresh on window focus — readers expect to see new threads after
  // tabbing away. Stops short of a websocket; if the doc is quiet
  // there's no chatter, and if it's busy a focus event is the
  // moment a reader actually looks at the doc again.
  useEffect(() => {
    function onFocus() {
      void loadComments();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadComments]);

  // Lookup the viewer's user id once so we can show edit/delete
  // affordances on their own comments. better-auth exposes the
  // session via `/api/auth/get-session` (a JSON endpoint).
  useEffect(() => {
    if (!isViewerSignedIn) return;
    fetch("/api/auth/get-session", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((session) => {
        if (session?.user?.id) setCurrentUserId(session.user.id);
      })
      .catch(() => {
        // Non-critical — edit/delete buttons just won't render.
      });
  }, [isViewerSignedIn]);

  // Group comments into threads (top-level + replies), order by
  // creation time, and pre-resolve their anchors against the current
  // article DOM so the sidebar can render highlight badges.
  const threads = useMemo<ThreadView[]>(() => {
    if (!articleRootRef.current) return [];
    const { plain } = collectTextNodes(articleRootRef.current);
    const byId = new Map<string, ApiComment>();
    const replies = new Map<string, ApiComment[]>();
    const roots: ApiComment[] = [];
    for (const c of comments) byId.set(c.id, c);
    for (const c of comments) {
      if (c.parentCommentId) {
        const list = replies.get(c.parentCommentId) ?? [];
        list.push(c);
        replies.set(c.parentCommentId, list);
      } else {
        roots.push(c);
      }
    }
    return roots
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .map<ThreadView>((root) => {
        const anchor = resolveAnchor(root, plain);
        return {
          root,
          replies: (replies.get(root.id) ?? []).sort(
            (a, b) =>
              new Date(a.createdAt).getTime() -
              new Date(b.createdAt).getTime(),
          ),
          anchor,
          status: root.resolvedAt
            ? "resolved"
            : anchor
              ? "active"
              : "orphaned",
        };
      });
  }, [comments]);

  // (Re-)apply highlight wrapping whenever threads or the active
  // thread change. The cleanup tears down event listeners; the
  // wrapper spans are stripped at the start of the next pass.
  useEffect(() => {
    const root = articleRootRef.current;
    if (!root) return;
    const cleanup = applyHighlights(root, threads, activeThreadId, (id) => {
      setActiveThreadId(id);
      setOpen(true);
      setPendingAnchor(null);
    });
    return cleanup;
  }, [threads, activeThreadId]);

  // Selection bubble: when the viewer drags-selects text inside the
  // article, surface a small "Comment" floater above the selection.
  useEffect(() => {
    if (!canComment) return;
    const root = articleRootRef.current;
    if (!root) return;

    let frame: number | null = null;
    function updateBubbleFromSelection() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setBubble(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const safeRoot = articleRootRef.current;
      if (!safeRoot) return;
      if (!safeRoot.contains(range.commonAncestorContainer)) {
        setBubble(null);
        return;
      }
      const { nodes, plain } = collectTextNodes(safeRoot);
      const offsets = offsetsForRange(range, nodes);
      if (
        !offsets ||
        !plain.slice(offsets.startOffset, offsets.endOffset).trim()
      ) {
        setBubble(null);
        return;
      }
      const rect = rectForSelectionBubble(range);
      if (!rect) {
        setBubble(null);
        return;
      }
      setBubble(rect);
    }

    function scheduleBubbleUpdate() {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
      frame = window.requestAnimationFrame(() => {
        frame = null;
        updateBubbleFromSelection();
      });
    }

    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("touchend", scheduleBubbleUpdate);
    document.addEventListener("keyup", scheduleBubbleUpdate);
    document.addEventListener("selectionchange", scheduleBubbleUpdate);
    function onMouseUp() {
      scheduleBubbleUpdate();
    }
    return () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("touchend", scheduleBubbleUpdate);
      document.removeEventListener("keyup", scheduleBubbleUpdate);
      document.removeEventListener("selectionchange", scheduleBubbleUpdate);
    };
  }, [canComment]);

  const captureAnchorFromSelection = useCallback(() => {
    const root = articleRootRef.current;
    if (!root) return false;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return false;

    const { nodes, plain } = collectTextNodes(root);
    const offsets = offsetsForRange(range, nodes);
    if (!offsets) return false;
    const quoted = plain.slice(offsets.startOffset, offsets.endOffset).trim();
    if (!quoted) return false;

    const before = plain.slice(
      Math.max(0, offsets.startOffset - ANCHOR_CONTEXT_LEN),
      offsets.startOffset,
    );
    const after = plain.slice(
      offsets.endOffset,
      offsets.endOffset + ANCHOR_CONTEXT_LEN,
    );

    setPendingAnchor({
      startOffset: offsets.startOffset,
      endOffset: offsets.endOffset,
      quotedText: quoted,
      anchorBefore: before,
      anchorAfter: after,
    });
    setOpen(true);
    setActiveThreadId(null);
    setBubble(null);
    sel.removeAllRanges();
    return true;
  }, []);

  // Keyboard shortcuts:
  //   ⌘⌥M (Mac) / Ctrl+Alt+M (Win/Linux) → start a comment on the
  //     current selection (or open the general composer if nothing
  //     is selected). We match on `event.code === "KeyM"` rather
  //     than `event.key` because Option+M on macOS produces "µ"
  //     (Greek mu) on US layouts — a `key === "m"` check would
  //     never fire. Readers who can't comment get the same chord to
  //     open and close the thread list, which is what the header
  //     pill's hint promises them.
  //   ESC → close the panel if it's open. Standard "dismiss" chord
  //     so a reader who opened the panel by accident or finished
  //     reading a thread doesn't have to reach for the close button.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && open && !closing) {
        event.preventDefault();
        closePanel();
        return;
      }

      const isComboMac = event.metaKey && event.altKey;
      const isComboWin = event.ctrlKey && event.altKey;
      if (!(isComboMac || isComboWin)) return;
      if (event.code !== "KeyM") return;
      if (!canComment) {
        // Same rule as the pill: nothing to open without active threads.
        if (!threads.some((thread) => thread.status !== "resolved")) return;
        event.preventDefault();
        if (open && !closing) closePanel();
        else if (!open) setOpen(true);
        return;
      }
      event.preventDefault();
      const captured = captureAnchorFromSelection();
      if (!captured) {
        setOpen(true);
        setActiveThreadId(null);
        setDocumentComposerOpen(true);
        // Drop the caret into the doc-wide composer so the user can
        // start typing immediately. rAF gives React a frame to mount
        // the textarea before we try to focus it.
        window.requestAnimationFrame(() => {
          noAnchorDraftRef.current?.focus();
        });
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [canComment, captureAnchorFromSelection, open, closing, closePanel, threads]);

  const submitNew = async () => {
    const body = draftBody.trim();
    if (!body) return;
    setSubmittingNewComment(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body,
          anchor: pendingAnchor
            ? {
                quotedText: pendingAnchor.quotedText,
                anchorBefore: pendingAnchor.anchorBefore,
                anchorAfter: pendingAnchor.anchorAfter,
                startOffset: pendingAnchor.startOffset,
                endOffset: pendingAnchor.endOffset,
              }
            : null,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.message ?? "Failed to post comment");
      }
      const json: { comment: ApiComment } = await res.json();
      setComments((prev) => [...prev, json.comment]);
      setDraftBody("");
      setPendingAnchor(null);
      setDocumentComposerOpen(false);
      setActiveThreadId(json.comment.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post comment");
    } finally {
      setSubmittingNewComment(false);
    }
  };

  const submitReply = async (parentId: string) => {
    const body = (replyBodies[parentId] ?? "").trim();
    if (!body) return;
    setSubmittingReplyThreadId(parentId);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body, parentCommentId: parentId }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.message ?? "Failed to reply");
      }
      const json: { comment: ApiComment } = await res.json();
      setComments((prev) => [...prev, json.comment]);
      setReplyBodies((prev) => ({ ...prev, [parentId]: "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reply");
    } finally {
      setSubmittingReplyThreadId(null);
    }
  };

  const toggleResolve = async (rootId: string, resolved: boolean) => {
    setResolvingThreadId(rootId);
    setError(null);
    try {
      const res = await fetch(`/api/comments/${rootId}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resolved }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.message ?? "Failed to update");
      }
      const json: { comment: ApiComment } = await res.json();
      setComments((prev) =>
        prev.map((c) => (c.id === json.comment.id ? json.comment : c)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setResolvingThreadId(null);
    }
  };

  const removeComment = async (id: string) => {
    setPendingDeleteId(null);
    setDeletingCommentId(id);
    setError(null);
    try {
      const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.message ?? "Failed to delete");
      }
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeletingCommentId(null);
    }
  };

  const activeThreads = threads.filter((t) => t.status !== "resolved");
  const resolvedCount = threads.length - activeThreads.length;

  // Publish the active count to the header pill. We dispatch on every
  // change rather than memoizing — the count is a single number and a
  // string-equal CustomEvent fires in microseconds.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("od-comments-count", {
        detail: { active: activeThreads.length },
      }),
    );
  }, [activeThreads.length]);

  return (
    <>
      {bubble && canComment ? (
        <button
          type="button"
          className="od-comment-bubble"
          data-placement={bubble.placement}
          style={{
            left: `${bubble.x}px`,
            top: `${bubble.y}px`,
          }}
          onMouseDown={(event) => {
            event.preventDefault();
            captureAnchorFromSelection();
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Comment
        </button>
      ) : null}

      {open ? (
        <aside
          className={`od-comment-panel${closing ? " is-closing" : ""}`}
          aria-label="Document comments"
        >
          <header className="od-comment-panel__header">
            <div className="od-comment-panel__title">
              <strong>Comments</strong>
              <span className="od-comment-panel__count">
                {activeThreads.length} active
                {resolvedCount > 0 ? ` · ${resolvedCount} resolved` : ""}
              </span>
            </div>
            <button
              type="button"
              className="od-comment-panel__close"
              onClick={closePanel}
              aria-label="Close comments (Esc)"
              title="Close (Esc)"
            >
              <kbd className="od-comment-panel__close-hint" aria-hidden="true">
                Esc
              </kbd>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </header>

          {error ? (
            <div className="od-comment-panel__error">{error}</div>
          ) : null}

          <div className="od-comment-panel__body">
            {pendingAnchor && canComment ? (
              <div className="od-comment-card od-comment-card--draft">
                <blockquote className="od-comment-card__quote">
                  &ldquo;{pendingAnchor.quotedText}&rdquo;
                </blockquote>
                <textarea
                  className="od-comment-card__textarea"
                  value={draftBody}
                  onChange={(event) => setDraftBody(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      isSubmitChord(event) &&
                      !submittingNewComment &&
                      draftBody.trim()
                    ) {
                      event.preventDefault();
                      void submitNew();
                    }
                  }}
                  placeholder="Add a comment…"
                  rows={3}
                  autoFocus
                />
                <div className="od-comment-card__actions">
                  <button
                    type="button"
                    className="od-comment-btn-ghost"
                    onClick={() => {
                      setPendingAnchor(null);
                      setDraftBody("");
                    }}
                    disabled={submittingNewComment}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="od-comment-btn-primary"
                    onClick={submitNew}
                    disabled={submittingNewComment || !draftBody.trim()}
                  >
                    {submittingNewComment ? (
                      "Posting…"
                    ) : (
                      <>
                        Comment
                        <kbd
                          className="od-comment-btn-primary__hint"
                          aria-hidden="true"
                        >
                          {submitShortcut}
                        </kbd>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : null}

            {!pendingAnchor && canComment ? (
              documentComposerOpen || draftBody ? (
                <div className="od-comment-card od-comment-card--draft">
                  <textarea
                    ref={noAnchorDraftRef}
                    className="od-comment-card__textarea"
                    value={draftBody}
                    onChange={(event) => setDraftBody(event.target.value)}
                    onKeyDown={(event) => {
                      if (
                        isSubmitChord(event) &&
                        !submittingNewComment &&
                        draftBody.trim()
                      ) {
                        event.preventDefault();
                        void submitNew();
                      }
                    }}
                    placeholder="Add a comment to the whole document…"
                    rows={2}
                    autoFocus
                  />
                  <div className="od-comment-card__actions">
                    <span className="od-comment-card__hint">
                      Tip: select text in the doc, then {newCommentShortcut}
                    </span>
                    <button
                      type="button"
                      className="od-comment-btn-ghost"
                      onClick={() => {
                        setDocumentComposerOpen(false);
                        setDraftBody("");
                      }}
                      disabled={submittingNewComment}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="od-comment-btn-primary"
                      onClick={submitNew}
                      disabled={submittingNewComment || !draftBody.trim()}
                    >
                      {submittingNewComment ? (
                        "Posting…"
                      ) : (
                        <>
                          Comment
                          <kbd
                            className="od-comment-btn-primary__hint"
                            aria-hidden="true"
                          >
                            {submitShortcut}
                          </kbd>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="od-comment-doc-composer"
                  onClick={() => setDocumentComposerOpen(true)}
                >
                  <span className="od-comment-doc-composer__icon" aria-hidden="true">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </span>
                  <span className="od-comment-doc-composer__text">
                    Add document comment…
                  </span>
                  <span className="od-comment-doc-composer__hint">
                    Select text for inline comments
                  </span>
                </button>
              )
            ) : null}

            {loading ? (
              <p className="od-comment-panel__empty">Loading comments…</p>
            ) : threads.length === 0 ? (
              <p className="od-comment-panel__empty">
                {canComment
                  ? `No comments yet. Highlight text and press ${newCommentShortcut} to leave one.`
                  : "No comments on this document."}
              </p>
            ) : (
              <>
                {activeThreads.map((thread) => (
                  <CommentCard
                    key={thread.root.id}
                    thread={thread}
                    isActive={activeThreadId === thread.root.id}
                    canComment={canComment}
                    currentUserId={currentUserId}
                    onActivate={() => setActiveThreadId(thread.root.id)}
                    onResolve={(resolved) =>
                      toggleResolve(thread.root.id, resolved)
                    }
                    pendingDeleteId={pendingDeleteId}
                    onRequestDelete={(id) => setPendingDeleteId(id)}
                    onCancelDelete={() => setPendingDeleteId(null)}
                    onConfirmDelete={(id) => removeComment(id)}
                    replyBody={replyBodies[thread.root.id] ?? ""}
                    onReplyChange={(value) =>
                      setReplyBodies((prev) => ({
                        ...prev,
                        [thread.root.id]: value,
                      }))
                    }
                    onReplySubmit={() => submitReply(thread.root.id)}
                    isReplySubmitting={
                      submittingReplyThreadId === thread.root.id
                    }
                    isResolving={resolvingThreadId === thread.root.id}
                    deletingCommentId={deletingCommentId}
                    submitShortcut={submitShortcut}
                  />
                ))}
                {resolvedCount > 0 ? (
                  <details className="od-comment-resolved">
                    <summary>Resolved ({resolvedCount})</summary>
                    {threads
                      .filter((t) => t.status === "resolved")
                      .map((thread) => (
                        <CommentCard
                          key={thread.root.id}
                          thread={thread}
                          isActive={activeThreadId === thread.root.id}
                          canComment={canComment}
                          currentUserId={currentUserId}
                          onActivate={() => setActiveThreadId(thread.root.id)}
                          onResolve={(resolved) =>
                            toggleResolve(thread.root.id, resolved)
                          }
                          pendingDeleteId={pendingDeleteId}
                          onRequestDelete={(id) => setPendingDeleteId(id)}
                          onCancelDelete={() => setPendingDeleteId(null)}
                          onConfirmDelete={(id) => removeComment(id)}
                          replyBody={replyBodies[thread.root.id] ?? ""}
                          onReplyChange={(value) =>
                            setReplyBodies((prev) => ({
                              ...prev,
                              [thread.root.id]: value,
                            }))
                          }
                          onReplySubmit={() => submitReply(thread.root.id)}
                          isReplySubmitting={
                            submittingReplyThreadId === thread.root.id
                          }
                          isResolving={resolvingThreadId === thread.root.id}
                          deletingCommentId={deletingCommentId}
                          submitShortcut={submitShortcut}
                        />
                      ))}
                  </details>
                ) : null}
              </>
            )}
          </div>
        </aside>
      ) : null}
    </>
  );
}

function CommentCard({
  thread,
  isActive,
  canComment,
  currentUserId,
  onActivate,
  onResolve,
  pendingDeleteId,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
  replyBody,
  onReplyChange,
  onReplySubmit,
  isReplySubmitting,
  isResolving,
  deletingCommentId,
  submitShortcut,
}: {
  thread: ThreadView;
  isActive: boolean;
  canComment: boolean;
  currentUserId: string | null;
  onActivate: () => void;
  onResolve: (resolved: boolean) => void;
  pendingDeleteId: string | null;
  onRequestDelete: (id: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (id: string) => void;
  replyBody: string;
  onReplyChange: (value: string) => void;
  onReplySubmit: () => void;
  isReplySubmitting: boolean;
  isResolving: boolean;
  deletingCommentId: string | null;
  submitShortcut: string;
}) {
  return (
    <article
      className={`od-comment-card${isActive ? " is-active" : ""}${
        thread.status === "orphaned" ? " is-orphan" : ""
      }${thread.status === "resolved" ? " is-resolved" : ""}`}
      onClick={onActivate}
    >
      {thread.root.quotedText ? (
        <blockquote className="od-comment-card__quote">
          {thread.status === "orphaned"
            ? `(text moved) "${thread.root.quotedText}"`
            : `"${thread.root.quotedText}"`}
        </blockquote>
      ) : null}

      <CommentRow comment={thread.root}>
        {currentUserId === thread.root.authorUserId ? (
          <DeleteAction
            commentId={thread.root.id}
            label="Delete comment"
            isPending={pendingDeleteId === thread.root.id}
            isDeleting={deletingCommentId === thread.root.id}
            onRequest={onRequestDelete}
            onCancel={onCancelDelete}
            onConfirm={onConfirmDelete}
          />
        ) : null}
        {canComment ? (
          <button
            type="button"
            className="od-comment-row__action"
            disabled={isResolving}
            onClick={(event) => {
              event.stopPropagation();
              onResolve(thread.status !== "resolved");
            }}
          >
            {isResolving
              ? thread.status === "resolved"
                ? "Reopening…"
                : "Resolving…"
              : thread.status === "resolved"
                ? "Reopen"
                : "Resolve"}
          </button>
        ) : null}
      </CommentRow>

      {thread.replies.length > 0 ? (
        <div className="od-comment-card__replies">
          {thread.replies.map((reply) => (
            <CommentRow key={reply.id} comment={reply} indent>
              {currentUserId === reply.authorUserId ? (
                <DeleteAction
                  commentId={reply.id}
                  label="Delete reply"
                  isPending={pendingDeleteId === reply.id}
                  isDeleting={deletingCommentId === reply.id}
                  onRequest={onRequestDelete}
                  onCancel={onCancelDelete}
                  onConfirm={onConfirmDelete}
                />
              ) : null}
            </CommentRow>
          ))}
        </div>
      ) : null}

      {canComment && thread.status !== "resolved" ? (
        <div className="od-comment-card__reply">
          <textarea
            className="od-comment-card__textarea"
            value={replyBody}
            onChange={(event) => onReplyChange(event.target.value)}
            onKeyDown={(event) => {
              if (isSubmitChord(event) && !isReplySubmitting && replyBody.trim()) {
                event.preventDefault();
                event.stopPropagation();
                onReplySubmit();
              }
            }}
            placeholder="Reply…"
            rows={1}
            onClick={(event) => event.stopPropagation()}
          />
          <button
            type="button"
            className="od-comment-btn-primary od-comment-btn-primary--small"
            onClick={(event) => {
              event.stopPropagation();
              onReplySubmit();
            }}
            disabled={isReplySubmitting || !replyBody.trim()}
            title={`Reply (${submitShortcut})`}
          >
            {isReplySubmitting ? (
              "Replying…"
            ) : (
              <>
                Reply
                <kbd
                  className="od-comment-btn-primary__hint"
                  aria-hidden="true"
                >
                  {submitShortcut}
                </kbd>
              </>
            )}
          </button>
        </div>
      ) : null}
    </article>
  );
}

/**
 * One-or-the-other: a "Delete" link, or — once the user has tapped
 * it — an inline "Confirm? · Confirm · Cancel" trio. The
 * `pendingDeleteId` bookkeeping lives one level up so only one row at
 * a time can be in the confirming state, which keeps the UI from ever
 * showing two competing prompts.
 */
function DeleteAction({
  commentId,
  label,
  isPending,
  isDeleting,
  onRequest,
  onCancel,
  onConfirm,
}: {
  commentId: string;
  label: string;
  isPending: boolean;
  isDeleting: boolean;
  onRequest: (id: string) => void;
  onCancel: () => void;
  onConfirm: (id: string) => void;
}) {
  if (!isPending) {
    return (
      <button
        type="button"
        className="od-comment-row__action od-comment-row__action--danger"
        disabled={isDeleting}
        onClick={(event) => {
          event.stopPropagation();
          onRequest(commentId);
        }}
        aria-label={label}
      >
        {isDeleting ? "Deleting…" : "Delete"}
      </button>
    );
  }
  return (
    <span className="od-comment-row__confirm" role="group">
      <span className="od-comment-row__confirm-label">Delete?</span>
      <button
        type="button"
        className="od-comment-row__confirm-btn"
        disabled={isDeleting}
        onClick={(event) => {
          event.stopPropagation();
          onConfirm(commentId);
        }}
      >
        {isDeleting ? "Deleting…" : "Confirm"}
      </button>
      <button
        type="button"
        className="od-comment-row__cancel-btn"
        disabled={isDeleting}
        onClick={(event) => {
          event.stopPropagation();
          onCancel();
        }}
      >
        Cancel
      </button>
    </span>
  );
}

function CommentRow({
  comment,
  indent,
  children,
}: {
  comment: ApiComment;
  indent?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={`od-comment-row${indent ? " is-indent" : ""}`}>
      <div className="od-comment-row__avatar" aria-hidden="true">
        {comment.authorAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={comment.authorAvatarUrl} alt="" />
        ) : (
          <span>{authorInitial(comment)}</span>
        )}
      </div>
      <div className="od-comment-row__body">
        <div className="od-comment-row__meta">
          <strong>{authorDisplay(comment)}</strong>
          <span>{formatRelativeTime(comment.createdAt)}</span>
        </div>
        <p className="od-comment-row__text">{comment.body}</p>
        {children ? (
          <div className="od-comment-row__actions">{children}</div>
        ) : null}
      </div>
    </div>
  );
}
