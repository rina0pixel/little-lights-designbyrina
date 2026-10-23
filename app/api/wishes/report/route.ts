// Visitors can report a wish once each. After REPORT_LIMIT reports it is hidden from everyone.
import { store, visitorId } from "../store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let id: unknown;
  try {
    id = (await request.json())?.id;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))
    return Response.json({ error: "Unknown wish" }, { status: 400 });
  try {
    const result = await store.report(id, visitorId(request));
    return result === "ok"
      ? Response.json({ ok: true })
      : Response.json({ error: "Unknown wish" }, { status: 404 });
  } catch (e) {
    console.error(e);
    return Response.json(
      { error: "Could not send the report" },
      { status: 503 },
    );
  }
}
