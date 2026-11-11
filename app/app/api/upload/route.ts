import { NextResponse } from 'next/server';
import { handleUpload, pinToPinata } from './handler';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  const form = await req.formData().catch(() => null);
  try {
    const reply = await handleUpload(form, { jwt: process.env.PINATA_JWT, gateway: process.env.PINATA_GATEWAY, pin: pinToPinata });
    return NextResponse.json(reply.body, { status: reply.status });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'upload failed' }, { status: 502 });
  }
}
