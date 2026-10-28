import { instanceWebUrl } from "../config/instance";
import { renderMarkdown } from "../markdown/index";
import { extractMarkdownExcerpt } from "./excerpt";
import { createSlug } from "./slug";
import type { PublishInput } from "./validation";

type BuildPublishPreviewOptions = {
  workspaceSlug: string;
};

export async function buildPublishPreviewAsync(
  input: PublishInput,
  options: BuildPublishPreviewOptions,
) {
  const rendered = await renderMarkdown(input.markdown);
  const slug = input.slug ?? createSlug(input.title ?? rendered.title);
  const summary = extractMarkdownExcerpt(rendered.content);

  return {
    title: input.title ?? rendered.title,
    slug,
    visibility: input.visibility,
    url: `${instanceWebUrl()}/${options.workspaceSlug}/${slug}`,
    summary,
    tags: input.tags,
    toc: rendered.toc,
    renderedHtmlPreview: rendered.html,
  };
}

export function buildPublishPreview(
  input: PublishInput,
  options: BuildPublishPreviewOptions,
) {
  const slug = input.slug ?? createSlug(input.title ?? "untitled-document");

  return {
    title: input.title ?? "Untitled document",
    slug,
    visibility: input.visibility,
    url: `${instanceWebUrl()}/${options.workspaceSlug}/${slug}`,
    tags: input.tags,
  };
}
