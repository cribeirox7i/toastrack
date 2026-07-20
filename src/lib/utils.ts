/** Initials for an avatar: first letter of up to the first two words, uppercased.
 *  Mirrors the prototype's initialsFor(). "Carlos Ribeiro" -> "CR", "Ana" -> "A". */
export function initialsFor(name: string | null | undefined): string {
  return (
    (name || "?")
      .replace(/[^\p{L}\s]/gu, "")
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}
