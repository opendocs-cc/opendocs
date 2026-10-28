/** "Oct 24, 2026": the one date format the dashboard uses. */
export function formatDate(value: Date | string): string {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
