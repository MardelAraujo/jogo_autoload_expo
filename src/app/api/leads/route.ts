import type { NextRequest } from "next/server";
import { confirmarLead, parseLead } from "@/lib/server/dados";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const lead = parseLead(await request.json().catch(() => null));
  if (!lead) return Response.json({ erro: "payload_invalido" }, { status: 400 });
  await confirmarLead(lead);
  return Response.json({ ok: true });
}
