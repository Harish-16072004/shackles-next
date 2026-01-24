import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const secretKey = process.env.SESSION_SECRET || 'your-super-secret-key-shackles-2025'
const encodedKey = new TextEncoder().encode(secretKey)

// 1. Create the Session (Login)
export async function createSession(userId: string, role: string) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  const session = await new SignJWT({ userId, role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(encodedKey)
 
  cookies().set('session', session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    expires: expiresAt,
    sameSite: 'lax',
    path: '/',
  })
}

// 2. Delete Session (Logout)
export async function deleteSession() {
  cookies().delete('session')
}

// 3. Verify Session (Middleware check)
export async function getSession() {
  const cookie = cookies().get('session')?.value
  if (!cookie) return null
  
  try {
    const { payload } = await jwtVerify(cookie, encodedKey, {
      algorithms: ['HS256'],
    })
    return payload
  } catch (err) {
    return null
  }
}