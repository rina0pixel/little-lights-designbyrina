// Light-touch moderation shared by the wishes API (and mirrored in the preview build).
// It is a first line of defence for a prototype, not a replacement for human review.
export type ModerationCode = "links" | "kind";

const LINK =
  /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|ru|xyz|info|top|link|ly|me)\b)/i;
// Common English insults and slurs. Extend for Burmese with words chosen by a native speaker.
const BLOCKED = [
  "fuck",
  "shit",
  "bitch",
  "bastard",
  "asshole",
  "dick",
  "cunt",
  "whore",
  "slut",
  "retard",
  "nigger",
  "nigga",
  "faggot",
  "fag",
  "kill yourself",
  "kys",
  "rape",
  "nazi",
];
const BLOCKED_RE = new RegExp(
  // Whole words only (plus common endings), so names like "Dickens" are not blocked.
  `(^|[^a-z])(${BLOCKED.map((w) => w.replace(/ /g, "\\s+")).join("|")})(s|es|ed|er|ers|ing|y)?(?![a-z])`,
  "i",
);

export function moderate(text: string): ModerationCode | null {
  if (LINK.test(text)) return "links";
  // Catch simple disguises such as f.u.c.k or sh1t.
  const squashed = text
    .toLowerCase()
    .replace(/[0@]/g, "o")
    .replace(/1|!/g, "i")
    .replace(/3/g, "e")
    .replace(/\$/g, "s")
    .replace(/[._*-]/g, "");
  if (BLOCKED_RE.test(text) || BLOCKED_RE.test(squashed)) return "kind";
  return null;
}

export const REPORT_LIMIT = 3; // a wish is hidden for everyone after this many reports
export const COOLDOWN_MS = 20_000; // one wish per visitor every 20 seconds
