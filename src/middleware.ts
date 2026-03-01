import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname

  // 1. Define Protected Routes
  const isAdminRoute = path.startsWith('/admin')

  // 2. Get the Cookie
  const cookie = request.cookies.get('session')?.value
  const secret = new TextEncoder().encode(process.env.SESSION_SECRET || 'your-super-secret-key-shackles-2025')

  // 3. Decrypt & Verify
  let session = null
  if (cookie) {
    try {
      const { payload } = await jwtVerify(cookie, secret, { algorithms: ['HS256'] })
      session = payload
    } catch {
      // Invalid token
    }
  }

  // 4. Rule: Admin Routes are for ADMINS only
  if (isAdminRoute) {
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  return NextResponse.next()
}

// Optimization: Only run on these paths
export const config = {
  matcher: ['/admin/:path*']
}
