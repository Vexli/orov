// d3-org-chart draws each node from an HTML string, so names and titles (which come from CSV
// imports and admin forms) must be escaped before they reach it, or a name could inject markup.
const ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ENTITIES[c]!);
}
