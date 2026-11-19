import { NextResponse } from 'next/server';
import { unsafeOrigin } from './lib/request-origin.js';

export function proxy(request) {
  if (unsafeOrigin(request, process.env.SITE_URL)) {
    return NextResponse.json({ error: 'Cross-origin changes are not allowed.' }, { status: 403 });
  }
  return NextResponse.next();
}
export const config = { matcher: '/api/v1/:path*' };
