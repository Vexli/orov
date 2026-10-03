import { exportThemeTokens } from "@officeorg/core/theme/export";
import { getCurrentUser } from "@/lib/session";
import { getCurrentTheme } from "@/lib/theme";

// The active theme as one DTCG token file (plan.md §9 "Branding"). Importing it again maps every
// token back onto its slot by name; THEME_TOKENS_PATH accepts it as a deploy-time default.
export async function GET() {
  const user = await getCurrentUser();
  if (user?.role !== "admin") return new Response("Forbidden", { status: 403 });

  const theme = await getCurrentTheme();
  const tokens = exportThemeTokens(
    theme.values,
    `${theme.values.light["appName"] ?? "OfficeOrg"} theme, exported from OfficeOrg. Logos, the favicon and fonts are uploads and aren't included.`,
  );
  return new Response(`${JSON.stringify(tokens, null, 2)}\n`, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="theme.tokens.json"',
      "Cache-Control": "no-store",
    },
  });
}
