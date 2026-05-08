import 'server-only'
import { auth, signOut } from '@/auth'
import { redirect } from 'next/navigation'

/**
 * Auth.js v5 compatible session wrapper
 * Provides backward-compatible interface for existing code
 */

export async function getSession() {
  const session = await auth()
  if (!session?.user) {
    return null
  }

  // Convert Auth.js session to legacy format
  const user = session.user
  return {
    userId: user.id,
    role: user.role || 'APPLICANT',
    displayName: user.name,
    email: user.email,
    user,
  }
}

export async function requireSession() {
  const session = await getSession()
  if (!session) {
    redirect('/login')
  }
  return session
}

export async function requireAdmin() {
  const session = await requireSession()
  const userRole = session?.role
  if (userRole !== 'ADMIN') {
    redirect('/')
  }
  return session
}

/**
 * Create session via Auth.js signIn
 * @deprecated Auth.js handles session creation automatically after authorize()
 */
export async function createSession(_userId: string, _role: string, _displayName?: string) {
  throw new Error(
    "createSession() is deprecated. Auth.js handles session creation automatically after authorize()."
  );
}

/**
 * Delete session via Auth.js signOut
 */
export async function deleteSession() {
  await signOut({ redirect: false })
}