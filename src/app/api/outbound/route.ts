import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { enqueueMessage, listMessages, retryMessage, cancelMessage, type MessageChannel } from "@/lib/outbound";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const messages = await listMessages(session.user.id);
  return NextResponse.json(messages);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json();
  const { action, ...data } = body;

  if (action === "retry") {
    await retryMessage(data.id, session.user.id);
    return NextResponse.json({ success: true });
  }

  if (action === "cancel") {
    await cancelMessage(data.id, session.user.id);
    return NextResponse.json({ success: true });
  }

  // Default: enqueue new message
  const { channel, destination, subject, body: msgBody, eventType } = data;
  if (!channel || !destination || !msgBody) {
    return NextResponse.json({ error: "channel, destination y body requeridos" }, { status: 400 });
  }

  const result = await enqueueMessage(session.user.id, {
    channel: channel as MessageChannel,
    destination,
    subject,
    body: msgBody,
    eventType: eventType || "manual_send",
  });

  return NextResponse.json({ success: true, id: result.id });
}
