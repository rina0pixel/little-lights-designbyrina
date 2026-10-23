// Wish storage. In production the wishes live in Supabase (shared by every visitor);
// without the Supabase settings, local development falls back to data/wishes.json.
//
// Supabase settings (server-side only, never sent to the browser):
//   SUPABASE_URL              e.g. https://<project>.supabase.co
//   SUPABASE_PUBLISHABLE_KEY  the project's publishable (anon) key
//   LITTLE_LIGHTS_TOKEN       secret the database functions require (stored in private.app_config)
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { COOLDOWN_MS, REPORT_LIMIT } from "./moderation";

export type Wish = {
  id: string;
  name: string;
  message: string;
  kind: string;
  created: number;
  color: number | null;
  shape: number | null;
};
export type NewWish = {
  name: string;
  message: string;
  kind: string;
  color: number | null;
  shape: number | null;
};
export type AddResult = { wish: Wish } | { error: "slow" };
export type ReportResult = "ok" | "unknown";

const url = process.env.SUPABASE_URL,
  key = process.env.SUPABASE_PUBLISHABLE_KEY,
  token = process.env.LITTLE_LIGHTS_TOKEN;
export const usingDatabase = Boolean(url && key && token);

/** A stable, non-reversible visitor id from the request IP (used for cooldowns and one-report-per-visitor). */
export function visitorId(request: Request): string {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "local";
  return createHash("sha256")
    .update(ip + ":" + (token ?? "local-dev"))
    .digest("hex")
    .slice(0, 32);
}

/* ---------- Supabase ---------- */
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: key!,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_token: token, ...args }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${fn} failed: ${res.status}`);
  return res.json() as Promise<T>;
}
const db = {
  list: () => rpc<Wish[]>("list_wishes", {}),
  async add(w: NewWish, visitor: string): Promise<AddResult> {
    const r = await rpc<Wish | { error: "slow" }>("add_wish", {
      p_name: w.name,
      p_message: w.message,
      p_kind: w.kind,
      p_color: w.color,
      p_shape: w.shape,
      p_visitor: visitor,
    });
    return "error" in r ? { error: r.error } : { wish: r };
  },
  async report(id: string, visitor: string): Promise<ReportResult> {
    const r = await rpc<{ ok?: boolean; error?: string }>("report_wish", {
      p_id: id,
      p_visitor: visitor,
    });
    return r.error ? "unknown" : "ok";
  },
};

/* ---------- Local JSON file (development only) ---------- */
type StoredWish = Wish & {
  visitor?: string;
  reports?: number;
  reportedBy?: string[];
};
const filename = path.join(process.cwd(), "data", "wishes.json");
let queue: Promise<unknown> = Promise.resolve();
async function readAll(): Promise<StoredWish[]> {
  try {
    return JSON.parse(await readFile(filename, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
function change<T>(
  fn: (rows: StoredWish[]) => { rows: StoredWish[]; result: T },
): Promise<T> {
  const op = queue.then(async () => {
    const { rows, result } = fn(await readAll());
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename + ".tmp", JSON.stringify(rows, null, 2), "utf8");
    await rename(filename + ".tmp", filename);
    return result;
  });
  queue = op.catch(() => {});
  return op;
}
const strip = ({
  visitor: _v,
  reports: _r,
  reportedBy: _b,
  ...w
}: StoredWish): Wish => w;
const file = {
  async list() {
    await queue;
    return (await readAll())
      .filter((w) => (w.reports ?? 0) < REPORT_LIMIT)
      .slice(0, 60)
      .map(strip);
  },
  add(w: NewWish, visitor: string): Promise<AddResult> {
    return change<AddResult>((rows) => {
      if (
        rows.some(
          (r) => r.visitor === visitor && Date.now() - r.created < COOLDOWN_MS,
        )
      )
        return { rows, result: { error: "slow" as const } };
      const wish: StoredWish = {
        id: crypto.randomUUID(),
        ...w,
        name: w.name.trim() || "Friend",
        message: w.message.trim(),
        created: Date.now(),
        visitor,
      };
      return { rows: [wish, ...rows], result: { wish: strip(wish) } };
    });
  },
  report(id: string, visitor: string): Promise<ReportResult> {
    return change((rows) => {
      const target = rows.find((r) => r.id === id);
      if (!target) return { rows, result: "unknown" as const };
      if (!target.reportedBy?.includes(visitor)) {
        target.reportedBy = [...(target.reportedBy ?? []), visitor];
        target.reports = (target.reports ?? 0) + 1;
      }
      return { rows, result: "ok" as const };
    });
  },
};

export const store = usingDatabase ? db : file;
