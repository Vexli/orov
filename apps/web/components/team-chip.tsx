// A team badge. The primary team is filled; a team someone is in through a sub-team (#23) is
// dashed and muted, and says so to screen readers.
export function TeamChip({
  team,
  labelPrimary = false,
  className = "",
}: {
  team: { name: string; isPrimary: boolean; inherited?: boolean };
  // Adds " (primary)" to the primary team, where colour alone would be the only cue.
  labelPrimary?: boolean;
  className?: string;
}) {
  const tone = team.isPrimary
    ? "bg-primary font-medium text-primary-fg"
    : team.inherited
      ? "border border-dashed border-border text-muted-fg"
      : "bg-muted text-fg";
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-xs ${tone} ${className}`}
      title={team.inherited ? "Through a sub-team" : undefined}
    >
      {team.name}
      {team.isPrimary && labelPrimary ? " (primary)" : ""}
      {team.inherited ? <span className="sr-only"> (through a sub-team)</span> : null}
    </span>
  );
}
