// Shared wishes: GET the latest 60, POST a new one.
import { moderate } from "./moderation";
import { store, visitorId } from "./store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await store.list(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error(e);
    return Response.json(
      { error: "Wishes are temporarily unavailable" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  let b: Record<string, unknown>;
  try {
    b = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (
    !b ||
    typeof b.name !== "string" ||
    b.name.length > 24 ||
    typeof b.message !== "string" ||
    !b.message.trim() ||
    b.message.length > 280 ||
    typeof b.kind !== "string" ||
    !["balloon", "lotus"].includes(b.kind)
  )
    return Response.json({ error: "Please check your wish" }, { status: 400 });
  const balloon = b.kind === "balloon";
  if (
    balloon &&
    (!Number.isInteger(b.color) ||
      !Number.isInteger(b.shape) ||
      Number(b.color) < 0 ||
      Number(b.color) > 6 ||
      Number(b.shape) < 0 ||
      Number(b.shape) > 4)
  )
    return Response.json(
      { error: "Choose a balloon colour and shape" },
      { status: 400 },
    );
  const code = moderate(b.message + " " + b.name);
  if (code)
    return Response.json(
      {
        error:
          code === "links"
            ? "Links can't be shared in wishes"
            : "Please keep wishes kind",
        code,
      },
      { status: 400 },
    );
  try {
    const result = await store.add(
      {
        name: b.name.trim(),
        message: b.message.trim(),
        kind: b.kind,
        color: balloon ? Number(b.color) : null,
        shape: balloon ? Number(b.shape) : null,
      },
      visitorId(request),
    );
    if ("error" in result)
      return Response.json(
        {
          error: "Please wait a moment before sending another wish",
          code: "slow",
        },
        { status: 429 },
      );
    return Response.json(result.wish, { status: 201 });
  } catch (e) {
    console.error(e);
    return Response.json(
      { error: "Your wish could not be saved" },
      { status: 503 },
    );
  }
}
