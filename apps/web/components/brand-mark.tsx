import { brandAssetUrl, type Brand } from "@/lib/theme";

// The product's logo, or its name when no logo is uploaded (plan.md §9.1). The dark logo is only
// offered when the theme follows the viewer's dark mode; a light-only theme always looks light.
export function BrandMark({
  brand,
  className = "h-7 w-auto",
}: {
  brand: Brand;
  className?: string;
}) {
  const light = brand.logoLight ?? brand.logoDark;
  if (!light) return <span className="font-semibold">{brand.appName}</span>;
  const dark = brand.darkMode ? (brand.logoDark ?? light) : light;
  return (
    <picture>
      {dark !== light ? (
        <source srcSet={brandAssetUrl(dark)} media="(prefers-color-scheme: dark)" />
      ) : null}
      {/* A same-origin upload of any size; next/image would need to know its dimensions. */}
      <img src={brandAssetUrl(light)} alt={brand.appName} className={className} />
    </picture>
  );
}
