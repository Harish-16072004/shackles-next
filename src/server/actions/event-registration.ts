'use server'

import { revalidatePath } from 'next/cache'
import crypto from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { createRateLimiter, rateLimitPresets } from '@/lib/rate-limit'
import { TeamMemberRole, TeamStatus } from '@prisma/client'
import { sendTeamInviteEmail } from '@/lib/email'
import { getActiveYear } from '@/lib/edition'
import { normalizeTeamName, validateTeamName, generateUniqueJoinCode } from '@/server/services/team-registration.service'
import { sendTeamCreatedEmail } from '@/server/services/email.service'

function normalizeName(name: string) {
  return name.trim().toUpperCase()
}

function normalizeTeamCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, '')
}

function deriveLeaderName(firstName: string | null, lastName: string | null, email: string) {
  const label = [firstName, lastName].filter(Boolean).join(' ').trim()
  return label || email
}

function normalizeEventSlot(date: Date, endDate?: Date | null) {
  const start = date
  let end = endDate ?? date

  if (end < start) end = start
  if (end.getTime() === start.getTime()) end = new Date(end.getTime() + 1)

  return { start, end }
}

function hasScheduleOverlap(a: { start: Date; end: Date }, b: { start: Date; end: Date }) {
  return a.start < b.end && b.start < a.end
}

const registrationRateLimiter = createRateLimiter({
  ...rateLimitPresets.registration,
  keyPrefix: 'api:events:register',
})

const inviteRateLimiter = createRateLimiter({
  ...rateLimitPresets.registration,
  keyPrefix: 'api:team:invite',
})

async function generateUniqueTeamCode(tx: any, eventId: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase()
    const existing = await tx.team.findUnique({
      where: { eventId_teamCode: { eventId, teamCode: code } },
      select: { id: true },
    })
    if (!existing) return code
  }
  throw new Error('Unable to allocate a unique team code.')
}

async function checkRateLimitAndAuth(actionType: string) {
  const session = await getSession()
  if (!session?.userId) return { success: false, error: 'Please login to register.' }

  const rateLimitKey = `events:register:${session.userId}`
  const rl = await registrationRateLimiter.limit(rateLimitKey)
  if (!rl.success) {
    return { success: false, error: 'Too many registration attempts. Please try again later.' }
  }

  return { success: true, session }
}

async function performRegistrationChecks(tx: any, user: any, event: any, action: string) {
  if (user.payment?.status !== 'VERIFIED') {
    return { error: 'Only payment-verified users can register for events.' }
  }

  const isTeamEvent = event.participationMode === 'TEAM'

  if ((action === 'jointeam' || action === 'createteam') && event.date && !event.isAllDay) {
    const currentSlot = normalizeEventSlot(event.date, event.endDate)
    const sameUserRegistrations = await tx.eventRegistration.findMany({
      where: {
        userId: user.id,
        eventId: { not: event.id },
        event: {
          year: getActiveYear(),
          isArchived: false,
          isTemplate: false,
          isAllDay: false,
          date: { not: null },
        },
      },
      select: { event: { select: { name: true, date: true, endDate: true } } },
    })

    const conflictingRegistration = sameUserRegistrations.find((reg: any) => {
      if (!reg.event.date) return false
      const otherSlot = normalizeEventSlot(reg.event.date, reg.event.endDate)
      return hasScheduleOverlap(currentSlot, otherSlot)
    })

    if (conflictingRegistration) {
      return { error: `You have already registered for ${conflictingRegistration.event.name} in this time slot.` }
    }
  }

  if (!isTeamEvent && action !== 'jointeam') {
    return { error: 'Action is only supported for team events.' }
  }

  return { isTeamEvent }
}

export async function registerForIndividualEvent(input: { eventName: string }) {
  const auth = await checkRateLimitAndAuth('individual')
  if (!auth.success) return { success: false, error: auth.error }

  const normalizedEventName = normalizeName(input.eventName)

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: auth.session!.userId }, include: { payment: true } })
      if (!user) return { error: 'User not found.' }

      const event = await tx.event.findFirst({
        where: { name: { equals: normalizedEventName, mode: 'insensitive' }, year: getActiveYear(), isArchived: false, isActive: true },
      })
      if (!event) return { error: 'Event is not available.' }

      const checks = await performRegistrationChecks(tx, user, event, 'jointeam')
      if (checks.error) return { error: checks.error }

      const existing = await tx.eventRegistration.findUnique({
        where: { userId_eventId: { userId: user.id, eventId: event.id } },
      })
      if (existing) return { message: 'Already registered for this event.' }

      const currentParticipants = await tx.eventRegistration.count({ where: { eventId: event.id } })
      if (event.maxParticipants != null && currentParticipants + 1 > event.maxParticipants) {
        return { error: 'This event is full.' }
      }

      await tx.eventRegistration.create({
        data: { userId: user.id, eventId: event.id, teamName: null, teamSize: 1, attended: false },
      })

      return { message: 'Registered successfully.' }
    })

    if (result.error) return { success: false, error: result.error }
    revalidatePath('/events')
    revalidatePath('/userDashboard')
    return { success: true, message: result.message }
  } catch (error) {
    return { success: false, error: 'Registration failed.' }
  }
}

export async function createTeamViaForm(input: { eventName: string; teamName: string }) {
  const auth = await checkRateLimitAndAuth('create')
  if (!auth.success) return { success: false, error: auth.error }

  const normalizedEventName = normalizeName(input.eventName)
  const teamNameInput = input.teamName.trim()

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: auth.session!.userId }, include: { payment: true } })
      if (!user || !user.shacklesId) return { error: 'Shackles ID required.' }

      const event = await tx.event.findFirst({
        where: { name: { equals: normalizedEventName, mode: 'insensitive' }, year: getActiveYear(), isArchived: false, isActive: true },
      })
      if (!event) return { error: 'Event not found.' }

      const checks = await performRegistrationChecks(tx, user, event, 'createteam')
      if (checks.error) return { error: checks.error }

      const existing = await tx.eventRegistration.findUnique({
        where: { userId_eventId: { userId: user.id, eventId: event.id } },
      })
      if (existing) return { message: 'Already registered.' }

      const normalizedTeam = normalizeTeamName(teamNameInput)
      const nameCheck = validateTeamName(teamNameInput, normalizedTeam)
      if (!nameCheck.isValid) return { error: nameCheck.error || 'Invalid team name' }

      const byName = await tx.team.findUnique({
        where: { eventId_nameNormalized: { eventId: event.id, nameNormalized: normalizedTeam } },
      })
      if (byName) return { error: 'Team name already exists.' }

      const currentTeamCount = await tx.team.count({ where: { eventId: event.id } })
      if (event.maxTeams != null && currentTeamCount >= event.maxTeams) return { error: 'Team slots full.' }

      const teamCode = await generateUniqueTeamCode(tx, event.id)
      const joinCode = await generateUniqueJoinCode(tx)

      const team = await tx.team.create({
        data: {
          eventId: event.id,
          name: teamNameInput,
          nameNormalized: normalizedTeam,
          teamCode,
          joinCode,
          memberCount: 1,
          status: TeamStatus.OPEN,
          leaderUserId: user.id,
          leaderContactPhoneSnapshot: user.phone,
          leaderContactEmailSnapshot: user.email,
        },
      })

      await tx.eventRegistration.create({
        data: {
          userId: user.id,
          eventId: event.id,
          teamId: team.id,
          memberRole: TeamMemberRole.LEADER,
          teamName: team.name,
          teamSize: 1,
          attended: false,
        },
      })

      return {
        message: `Team created. Share Team Code: ${teamCode}`,
        teamCode,
        payload: {
          leaderEmail: user.email,
          leaderName: [user.firstName, user.lastName].filter(Boolean).join(" "),
          teamName: team.name,
          eventName: event.name,
          teamCode,
          joinCode,
          joinUrl: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/events?joinCode=${joinCode}`
        }
      }
    })

    if (result.error) return { success: false, error: result.error }

    if (result.payload) {
      await sendTeamCreatedEmail(result.payload).catch(console.error)
    }

    revalidatePath('/events')
    revalidatePath('/userDashboard')
    return { success: true, message: result.message, teamCode: result.teamCode }
  } catch (error) {
    return { success: false, error: 'Registration failed.' }
  }
}

export async function joinTeamViaCode(input: { eventName: string; teamCode?: string; inviteToken?: string }) {
  const auth = await checkRateLimitAndAuth('join')
  if (!auth.success) return { success: false, error: auth.error }

  const normalizedEventName = normalizeName(input.eventName)

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: auth.session!.userId }, include: { payment: true } })
      if (!user || !user.shacklesId) return { error: 'Shackles ID required.' }

      const event = await tx.event.findFirst({
        where: { name: { equals: normalizedEventName, mode: 'insensitive' }, year: getActiveYear(), isActive: true },
      })
      if (!event) return { error: 'Event not found.' }

      const checks = await performRegistrationChecks(tx, user, event, 'jointeam')
      if (checks.error) return { error: checks.error }

      const existing = await tx.eventRegistration.findUnique({
        where: { userId_eventId: { userId: user.id, eventId: event.id } },
      })
      if (existing) return { message: 'Already registered.' }

      let team = null
      let inviteRecord = null

      if (input.teamCode) {
        team = await tx.team.findUnique({
          where: { eventId_teamCode: { eventId: event.id, teamCode: normalizeTeamCode(input.teamCode) } },
        })
      } else if (input.inviteToken) {
        const invite = await tx.teamInvite.findUnique({
          where: { token: input.inviteToken },
          include: { team: true },
        })
        if (!invite || invite.team.eventId !== event.id) return { error: 'Invalid invite.' }
        if (invite.usedAt) return { error: 'Invite used.' }
        if (invite.expiresAt.getTime() < Date.now()) return { error: 'Invite expired.' }
        if (invite.invitedEmail?.toLowerCase() !== user.email.toLowerCase()) return { error: 'Invite for different email.' }
        team = invite.team
        inviteRecord = invite
      }

      if (!team) return { error: 'Team not found.' }
      if (team.status !== TeamStatus.DRAFT && team.status !== TeamStatus.OPEN) return { error: 'Team locked.' }

      if (team.memberCount + 1 > (event.teamMaxSize ?? 4)) return { error: 'Team full.' }

      await tx.eventRegistration.create({
        data: {
          userId: user.id,
          eventId: event.id,
          teamId: team.id,
          memberRole: TeamMemberRole.MEMBER,
          teamName: team.name,
          teamSize: 1,
          attended: false,
        },
      })

      await tx.team.update({
        where: { id: team.id },
        data: { memberCount: { increment: 1 } },
      })

      if (inviteRecord) {
        await tx.teamInvite.update({
          where: { id: inviteRecord.id },
          data: { usedAt: new Date(), usedByUserId: user.id },
        })
      }

      return { message: 'Joined successfully.', teamCode: team.teamCode }
    })

    if (result.error) return { success: false, error: result.error }
    revalidatePath('/events')
    revalidatePath('/userDashboard')
    return { success: true, message: result.message, teamCode: result.teamCode }
  } catch (error) {
    return { success: false, error: 'Registration failed.' }
  }
}

export async function completeTeamRegistration(input: { eventName: string; teamCode: string }) {
  const auth = await checkRateLimitAndAuth('complete')
  if (!auth.success) return { success: false, error: auth.error }

  const normalizedEventName = normalizeName(input.eventName)

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: auth.session!.userId } })
      if (!user) return { error: 'User not found' }

      const event = await tx.event.findFirst({
        where: { name: { equals: normalizedEventName, mode: 'insensitive' }, year: getActiveYear() },
      })
      if (!event) return { error: 'Event not found.' }

      const team = await tx.team.findUnique({
        where: { eventId_teamCode: { eventId: event.id, teamCode: normalizeTeamCode(input.teamCode) } },
      })

      if (!team) return { error: 'Team not found.' }
      if (team.status !== TeamStatus.DRAFT && team.status !== TeamStatus.OPEN) return { error: 'Already locked.' }
      if (team.leaderUserId !== user.id) return { error: 'Only leader can lock.' }

      if (team.memberCount < (event.teamMinSize ?? 2)) return { error: `Need at least ${event.teamMinSize ?? 2} members.` }

      await tx.team.update({
        where: { id: team.id },
        data: { status: TeamStatus.LOCKED, lockedAt: new Date(), lockedBy: user.shacklesId },
      })

      return { message: 'Team locked.', teamCode: team.teamCode }
    })

    if (result.error) return { success: false, error: result.error }
    revalidatePath('/events')
    revalidatePath('/userDashboard')
    return { success: true, message: result.message, teamCode: result.teamCode }
  } catch (error) {
    return { success: false, error: 'Failed to lock team.' }
  }
}

export async function sendTeamInvite(input: { eventId: string; teamCode: string; emails: string[] }) {
  const session = await getSession()
  if (!session?.userId) return { success: false, error: 'Unauthorized' }

  const rl = await inviteRateLimiter.limit(`team:invite:${session.userId}`)
  if (!rl.success) return { success: false, error: 'Too many invite attempts.' }

  try {
    const { eventId, teamCode, emails } = input
    const uniqueEmails = Array.from(new Set(emails.map(e => e.trim().toLowerCase())))

    const team = await prisma.team.findUnique({
      where: { eventId_teamCode: { eventId, teamCode: teamCode.toUpperCase() } },
      include: { event: { select: { name: true, teamMaxSize: true } } },
    })

    if (!team) return { success: false, error: 'Team not found.' }

    if (team.leaderUserId !== session.userId) {
      const requestor = await prisma.user.findUnique({ where: { id: session.userId }, select: { role: true } })
      if (!requestor || !['ADMIN', 'COORDINATOR'].includes(requestor.role)) {
        return { success: false, error: 'Only leader or admin can invite.' }
      }
    }

    if (team.status !== TeamStatus.OPEN && team.status !== TeamStatus.DRAFT) {
      return { success: false, error: 'Team locked.' }
    }

    const maxSize = team.event.teamMaxSize ?? 4
    if (uniqueEmails.length > maxSize - team.memberCount) {
      return { success: false, error: 'Not enough slots.' }
    }

    const alreadyRegistered = await prisma.eventRegistration.findMany({
      where: { eventId, user: { email: { in: uniqueEmails } } },
      select: { user: { select: { email: true } } },
    })
    const registeredEmails = new Set(alreadyRegistered.map(r => r.user.email.toLowerCase()))

    const toInvite = uniqueEmails.filter(e => !registeredEmails.has(e))
    if (toInvite.length === 0) return { success: false, error: 'All emails already registered.' }

    const requestor = await prisma.user.findUnique({ where: { id: session.userId } })
    const leaderName = deriveLeaderName(requestor?.firstName ?? null, requestor?.lastName ?? null, requestor?.email ?? 'Leader')

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const inviteTokenMap = new Map<string, string>()

    await prisma.$transaction(toInvite.map(email => {
      const token = crypto.randomBytes(24).toString('hex')
      inviteTokenMap.set(email, token)
      return prisma.teamInvite.create({
        data: { teamId: team.id, token, invitedEmail: email, invitedByUserId: session.userId, expiresAt },
      })
    }))

    await Promise.allSettled(toInvite.map(email => sendTeamInviteEmail({
      toEmail: email,
      leaderName,
      eventName: team.event.name,
      teamName: team.name,
      teamCode: team.teamCode,
      inviteToken: inviteTokenMap.get(email)!,
      expiresAt,
    })))

    return { success: true, message: `Sent ${toInvite.length} invites.` }
  } catch (error) {
    return { success: false, error: 'Invite failed.' }
  }
}

export async function getMyRegistrations() {
  const session = await getSession()
  if (!session?.userId) return { success: false, error: 'Unauthorized' }

  try {
    const registrations = await prisma.eventRegistration.findMany({
      where: { userId: session.userId },
      include: {
        event: { select: { participationMode: true, teamMaxSize: true } },
        team: { select: { id: true, name: true, teamCode: true, joinCode: true, leaderUserId: true, memberCount: true, status: true } },
      },
    })

    const teams = registrations
      .filter(reg => reg.event.participationMode === 'TEAM' && reg.team !== null)
      .map(reg => {
        const team = reg.team!
        return {
          eventId: reg.eventId,
          teamId: reg.teamId,
          teamName: team.name,
          teamCode: team.teamCode ?? null,
          joinCode: team.joinCode ?? null,
          isLeader: team.leaderUserId === session.userId,
          memberCount: team.memberCount,
          teamMaxSize: reg.event.teamMaxSize ?? 4,
          teamStatus: team.status,
          canInvite: team.leaderUserId === session.userId && (team.status === 'OPEN' || team.status === 'DRAFT') && team.memberCount < (reg.event.teamMaxSize ?? 4),
        }
      })

    const individualEventIds = registrations.filter(reg => reg.event.participationMode !== 'TEAM').map(reg => reg.eventId)

    return { success: true, teams, individualEventIds }
  } catch (error) {
    return { success: false, error: 'Failed to fetch registrations.' }
  }
}

export async function getPublicEventStats(category?: string) {
  try {
    const activeYear = getActiveYear()
    const events = await prisma.event.findMany({
      where: category ? { year: activeYear, isActive: true, isArchived: false, isTemplate: false, type: { equals: category, mode: 'insensitive' } } 
                      : { year: activeYear, isActive: true, isArchived: false, isTemplate: false },
      select: {
        id: true, name: true, year: true, type: true, dayLabel: true, date: true, endDate: true, description: true, rulesUrl: true,
        coordinatorName: true, coordinatorPhone: true, trainerName: true, contactName: true, contactPhone: true, participationMode: true,
        isAllDay: true, teamMinSize: true, teamMaxSize: true, maxTeams: true, maxParticipants: true, isActive: true,
      },
      orderBy: [{ date: 'asc' }, { name: 'asc' }],
    })

    const eventIds = events.map(e => e.id)
    const [teamCounts, regRowCounts, teamMemberCounts, indSums] = eventIds.length ? await Promise.all([
      prisma.team.groupBy({ by: ['eventId'], where: { eventId: { in: eventIds } }, _count: { id: true } }),
      prisma.eventRegistration.groupBy({ by: ['eventId'], where: { eventId: { in: eventIds } }, _count: { id: true } }),
      prisma.eventRegistration.groupBy({ by: ['eventId'], where: { eventId: { in: eventIds }, teamId: { not: null } }, _count: { id: true } }),
      prisma.eventRegistration.groupBy({ by: ['eventId'], where: { eventId: { in: eventIds }, teamId: null }, _sum: { teamSize: true } }),
    ]) : [[], [], [], []]

    const mapCount = (arr: any[]) => new Map(arr.map(e => [e.eventId, e._count?.id ?? 0]))
    const teamC = mapCount(teamCounts)
    const regC = mapCount(regRowCounts)
    const memC = mapCount(teamMemberCounts)
    const sumC = new Map(indSums.map((e: any) => [e.eventId, e._sum.teamSize ?? 0]))

    const payload = events.map(event => {
      const isTeam = event.participationMode === 'TEAM'
      const teamsReg = isTeam ? teamC.get(event.id) ?? 0 : regC.get(event.id) ?? 0
      const totalReg = (memC.get(event.id) ?? 0) + (sumC.get(event.id) ?? 0)
      
      return {
        ...event,
        registeredCount: totalReg,
        registeredTeams: teamsReg,
        teamsLeft: event.maxTeams == null ? null : Math.max(event.maxTeams - teamsReg, 0),
        spotsLeft: event.maxParticipants == null ? null : Math.max(event.maxParticipants - totalReg, 0),
      }
    })

    return { success: true, events: payload }
  } catch (error) {
    return { success: false, error: 'Failed to load stats.' }
  }
}
