'use server'

import { prisma } from '@/lib/prisma'
import { executeSafeAction } from '@/lib/safe-action'
import { Permission, Role } from '@prisma/client'
import { z } from 'zod'

const SaveMarksSchema = z.object({
  eventId: z.string().cuid(),
  teamId: z.string().cuid(),
  marks: z.array(z.object({
    componentId: z.string().cuid(),
    judgeIndex: z.number().int().min(0),
    marks: z.number().min(0)
  }))
})

export async function saveTeamMarksAllocation(input: z.infer<typeof SaveMarksSchema>) {
  return executeSafeAction({ permission: Permission.MANAGE_SCORES }, async (session) => {
    const { eventId, teamId, marks } = SaveMarksSchema.parse(input)

    const criteria = await prisma.markingCriteria.findUnique({
      where: { eventId },
      include: { components: true }
    })
    if (!criteria) throw new Error('Marking criteria missing for this event')

    const judgeIds: string[] = []
    for (let i = 0; i < criteria.numberOfJudges; i++) {
        const dummyEmail = `judge-${i+1}-${eventId}@shackles.com`
        let judge = await prisma.user.findUnique({ where: { email: dummyEmail } })
        if (!judge) {
            judge = await prisma.user.create({
                data: {
                    email: dummyEmail, firstName: `Judge ${i+1}`, lastName: `(Event)`,
                    password: 'N/A', phone: '0000000000', collegeName: 'N/A',
                    collegeLoc: 'N/A', department: 'N/A', yearOfStudy: 'N/A', role: 'VOLUNTEER'
                }
            })
        }
        judgeIds.push(judge.id)
    }

    await prisma.$transaction(async (tx) => {
        let teamMark = await tx.teamMark.findFirst({ where: { teamId, markingCriteriaId: criteria.id } })
        if (!teamMark) teamMark = await tx.teamMark.create({ data: { teamId, markingCriteriaId: criteria.id, judgeCount: criteria.numberOfJudges, isSubmitted: true, submittedByAdmin: session.role === 'ADMIN', submittedBy: session.userId, submittedAt: new Date() } })
        
        let totalMarks = 0
        for (const comp of criteria.components) {
            const compMarks = marks.filter(m => m.componentId === comp.id)
            let compSum = 0
            for (let j = 0; j < criteria.numberOfJudges; j++) {
                const judgeId = judgeIds[j]
                const mVal = compMarks.find(m => m.judgeIndex === j)?.marks || 0
                compSum += mVal

                const existingJm = await tx.judgeMarking.findFirst({ where: { teamId, markingCriteriaId: criteria.id, componentId: comp.id, judgeId } })
                if (existingJm) await tx.judgeMarking.update({ where: { id: existingJm.id }, data: { marksAwarded: mVal } })
                else await tx.judgeMarking.create({ data: { teamId, markingCriteriaId: criteria.id, componentId: comp.id, judgeId, marksAwarded: mVal } })
            }
            const compAvg = compSum / criteria.numberOfJudges
            totalMarks += compAvg

            const existingCm = await tx.componentMark.findFirst({ where: { teamMarkId: teamMark.id, componentId: comp.id } })
            if (existingCm) await tx.componentMark.update({ where: { id: existingCm.id }, data: { averageMarks: compAvg, judgeCount: criteria.numberOfJudges } })
            else await tx.componentMark.create({ data: { teamMarkId: teamMark.id, componentId: comp.id, averageMarks: compAvg, judgeCount: criteria.numberOfJudges } })
        }
        await tx.teamMark.update({ where: { id: teamMark.id }, data: { totalMarks, isSubmitted: true } })
    })

    return { message: 'Marks allocated successfully' }
  })
}

export async function fetchEventMarkingData(eventId: string) {
    return executeSafeAction({ permission: Permission.MANAGE_SCORES }, async (session) => {
    const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { id: true, name: true, participationMode: true }
    })
    
    if (!event) return { success: false, error: 'Event not found' }

    const criteria = await prisma.markingCriteria.findUnique({
        where: { eventId },
        include: { components: { orderBy: { order: 'asc' } } }
    })

    const criteriaPlain = criteria ? {
        ...criteria,
        components: criteria.components.map(c => ({
            ...c,
            weightPercentage: Number(c.weightPercentage),
        }))
    } : null;

    const teams = await prisma.team.findMany({
        where: { 
            eventId, 
            status: { in: ['LOCKED', 'OPEN'] },
            members: {
                some: {
                    attended: true
                }
            }
        },
        select: { id: true, name: true, memberCount: true },
        orderBy: { nameNormalized: 'asc' }
    })

    const dummyEmails = Array.from({length: criteria?.numberOfJudges || 3}, (_, i) => `judge-${i+1}-${eventId}@shackles.com`)
    const judges = await prisma.user.findMany({
        where: { email: { in: dummyEmails } },
        select: { id: true, email: true }
    })
    
    let existingMarks: any[] = []
    if (criteriaPlain) {
        const rawMarks = await prisma.judgeMarking.findMany({
            where: { markingCriteriaId: criteriaPlain.id },
            select: { teamId: true, componentId: true, judgeId: true, marksAwarded: true }
        })
        existingMarks = rawMarks.map(m => ({
            ...m,
            marksAwarded: Number(m.marksAwarded)
        }))
    }

    return { event, criteria: criteriaPlain, teams, judges, existingMarks }
    })
}