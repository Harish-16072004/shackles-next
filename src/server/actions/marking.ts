'use server'

import { prisma } from '@/lib/prisma'
import { executeSafeAction } from '@/lib/safe-action'
import { Permission, Role } from '@prisma/client'
import { z } from 'zod'
import { broadcastLeaderboardUpdate } from '@/lib/leaderboard-broadcast'

// Validation schemas
const CreateMarkingCriteriaSchema = z.object({
  eventId: z.string().cuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  maxMarks: z.number().int().min(1).max(10000),
  numberOfJudges: z.number().int().min(1).max(100),
  components: z.array(z.object({
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    weightPercentage: z.number().min(0).max(100),
    maxMarksForComponent: z.number().int().min(1),
    order: z.number().int().min(0),
  })).min(1, 'At least one component required'),
})

const UpdateMarkingCriteriaSchema = z.object({
  eventId: z.string().cuid(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  maxMarks: z.number().int().min(1).max(10000).optional(),
  numberOfJudges: z.number().int().min(1).max(100).optional(),
})

const AddComponentSchema = z.object({
  eventId: z.string().cuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  weightPercentage: z.number().min(0).max(100),
  maxMarksForComponent: z.number().int().min(1),
  order: z.number().int().min(0),
})

const DeleteComponentSchema = z.object({
  eventId: z.string().cuid(),
  componentId: z.string().cuid(),
})

const SubmitMarksSchema = z.object({
  eventId: z.string().cuid(),
  teamMarks: z.array(z.object({
    teamId: z.string().cuid(),
    componentMarks: z.array(z.object({
      componentId: z.string().cuid(),
      marks: z.number().min(0),
    })).min(1),
  })).min(1),
})

/**
 * Create marking criteria for an event with scoring components
 * SuperAdmin only
 */
export async function createMarkingCriteria(
  input: z.infer<typeof CreateMarkingCriteriaSchema>
) {
  return executeSafeAction({ roles: [Role.ADMIN], permission: Permission.MANAGE_SCORES }, async (session) => {
    // Validate input
    const validated = CreateMarkingCriteriaSchema.parse(input)

    // Check if criteria already exists for this event
    const existing = await prisma.markingCriteria.findUnique({
      where: { eventId: validated.eventId },
      select: { id: true },
    })

    if (existing) {
      throw new Error('Marking criteria already exists for this event')
    }

    // Verify all components have valid weight percentages that sum appropriately
    const totalWeight = validated.components.reduce((sum, c) => sum + c.weightPercentage, 0)
    if (totalWeight !== 100) {
      throw new Error(`Component weights must sum to 100% (currently ${totalWeight}%)`)
    }

    // Create criteria with components in transaction
    const criteria = await prisma.markingCriteria.create({
      data: {
        eventId: validated.eventId,
        name: validated.name,
        description: validated.description,
        maxMarks: validated.maxMarks,
        numberOfJudges: validated.numberOfJudges,
        components: {
          createMany: {
            data: validated.components,
          },
        },
      },
      include: {
        components: {
          orderBy: { order: 'asc' },
        },
      },
    })

    return {
      criteriaId: criteria.id,
      message: `Created marking criteria with ${criteria.components.length} components`,
    }
  })
}

/**
 * Get marking criteria and components for an event
 */
export async function getMarkingCriteria(eventId: string) {
  return executeSafeAction({ permission: Permission.MANAGE_SCORES }, async (session) => {
    const criteria = await prisma.markingCriteria.findUnique({
      where: { eventId },
      include: {
        components: {
          orderBy: { order: 'asc' },
        },
      },
    })

    if (!criteria) {
      throw new Error('No marking criteria found for this event')
    }

    return {
      id: criteria.id,
      name: criteria.name,
      description: criteria.description,
      maxMarks: criteria.maxMarks,
      numberOfJudges: criteria.numberOfJudges,
      components: criteria.components.map(c => ({
        id: c.id,
        name: c.name,
        description: c.description,
        weightPercentage: Number(c.weightPercentage),
        maxMarksForComponent: c.maxMarksForComponent,
        order: c.order,
      })),
      createdAt: criteria.createdAt,
    }
  })
}

/**
 * Update marking criteria details
 * SuperAdmin only
 */
export async function updateMarkingCriteria(
  input: z.infer<typeof UpdateMarkingCriteriaSchema>
) {
  return executeSafeAction({ roles: [Role.ADMIN], permission: Permission.MANAGE_SCORES }, async (session) => {
    const validated = UpdateMarkingCriteriaSchema.parse(input)

    // Update criteria
    const criteria = await prisma.markingCriteria.update({
      where: { eventId: validated.eventId },
      data: {
        ...(validated.name && { name: validated.name }),
        ...(validated.description !== undefined && { description: validated.description }),
        ...(validated.maxMarks && { maxMarks: validated.maxMarks }),
        ...(validated.numberOfJudges && { numberOfJudges: validated.numberOfJudges }),
      },
      include: {
        components: {
          orderBy: { order: 'asc' },
        },
      },
    })

    return { criteriaId: criteria.id, message: 'Criteria updated successfully' }
  })
}

/**
 * Delete marking criteria for an event
 * SuperAdmin only
 */
export async function deleteMarkingCriteria(eventId: string) {
  return executeSafeAction({ roles: [Role.ADMIN], permission: Permission.MANAGE_SCORES }, async (session) => {
    // Delete criteria (cascades to components, team marks, component marks, judge markings)
    await prisma.markingCriteria.delete({
      where: { eventId },
    })

    return { message: 'Marking criteria deleted successfully' }
  })
}

/**
 * Add a scoring component to existing criteria
 * SuperAdmin only
 */
export async function addComponent(input: z.infer<typeof AddComponentSchema>) {
  return executeSafeAction({ roles: [Role.ADMIN], permission: Permission.MANAGE_SCORES }, async (session) => {
    const validated = AddComponentSchema.parse(input)

    // Get current criteria to check weights
    const criteria = await prisma.markingCriteria.findUnique({
      where: { eventId: validated.eventId },
      include: { components: true },
    })

    if (!criteria) {
      throw new Error('Marking criteria not found')
    }

    // Check if order already exists
    const existingOrder = await prisma.criteriaComponent.findFirst({
      where: {
        markingCriteriaId: criteria.id,
        order: validated.order,
      },
      select: { id: true },
    })

    if (existingOrder) {
      throw new Error(`Component order ${validated.order} already exists`)
    }

    // Create component
    const component = await prisma.criteriaComponent.create({
      data: {
        markingCriteriaId: criteria.id,
        name: validated.name,
        description: validated.description,
        weightPercentage: validated.weightPercentage,
        maxMarksForComponent: validated.maxMarksForComponent,
        order: validated.order,
      },
    })

    return {
      componentId: component.id,
      message: 'Component added successfully',
    }
  })
}

/**
 * Delete a scoring component
 * SuperAdmin only
 */
export async function deleteComponent(input: z.infer<typeof DeleteComponentSchema>) {
  return executeSafeAction({ roles: [Role.ADMIN], permission: Permission.MANAGE_SCORES }, async (session) => {
    const validated = DeleteComponentSchema.parse(input)

    // Verify component belongs to event's criteria
    const component = await prisma.criteriaComponent.findFirst({
      where: {
        id: validated.componentId,
        criteria: { eventId: validated.eventId },
      },
      select: { id: true },
    })

    if (!component) {
      throw new Error('Component not found for this event')
    }

    // Delete component (cascades to judge markings for this component)
    await prisma.criteriaComponent.delete({
      where: { id: validated.componentId },
    })

    return { message: 'Component deleted successfully' }
  })
}

/**
 * Get leaderboard with aggregated team marks
 * SuperAdmin only - judge identities hidden
 */
export async function getLeaderboard(eventId: string) {
  return executeSafeAction({ roles: [Role.ADMIN, Role.COORDINATOR], permission: Permission.MANAGE_SCORES }, async (session) => {
    const criteria = await prisma.markingCriteria.findUnique({
      where: { eventId },
      include: {
        components: {
          orderBy: { order: 'asc' },
        },
        teamMarks: {
          where: { isSubmitted: true },
          include: {
            team: {
              select: {
                id: true,
                name: true,
                memberCount: true,
              },
            },
            componentMarks: true,
          },
          orderBy: { totalMarks: 'desc' },
        },
      },
    })

    if (!criteria) {
      throw new Error('No marking criteria found')
    }

    return {
      leaderboard: {
        eventId,
        maxMarks: criteria.maxMarks,
        components: criteria.components.map(c => ({
          ...c,
          weightPercentage: Number(c.weightPercentage),
        })),
        teams: criteria.teamMarks.map((tm, index) => ({
          rank: index + 1,
          teamId: tm.team.id,
          teamName: tm.team.name,
          memberCount: tm.team.memberCount,
          totalMarks: Number(tm.totalMarks),
          submittedAt: tm.submittedAt,
          componentMarks: tm.componentMarks.map(cm => ({
            componentId: cm.componentId,
            averageMarks: Number(cm.averageMarks),
          })),
        })),
      },
    }
  })
}

// ---------------------------------------------------------------------------
// Fetch criteria for coordinator/judge view (migrated from api/marking/criteria GET)
// ---------------------------------------------------------------------------

export async function fetchCriteriaForCoordinator(eventId: string) {
  if (!eventId) return { success: false, error: 'eventId required' }

  try {
    const criteria = await prisma.markingCriteria.findUnique({
      where: { eventId },
      include: {
        components: {
          orderBy: { order: 'asc' },
        },
      },
    })

    if (!criteria) {
      return { success: false, error: 'Marking criteria not found' }
    }

    return {
      success: true,
      criteria: {
        id: criteria.id,
        name: criteria.name,
        description: criteria.description,
        maxMarks: criteria.maxMarks,
        numberOfJudges: criteria.numberOfJudges,
        components: criteria.components.map(c => ({
          ...c,
          weightPercentage: Number(c.weightPercentage),
        })),
        createdAt: criteria.createdAt,
        updatedAt: criteria.updatedAt,
      },
    }
  } catch (error) {
    console.error('fetchCriteriaForCoordinator error:', error)
    return { success: false, error: 'Failed to fetch criteria' }
  }
}

// ---------------------------------------------------------------------------
// Submit marks (migrated from api/marking/submit-marks)
// ---------------------------------------------------------------------------

const SubmitJudgeMarksSchema = z.object({
  eventId: z.string().cuid(),
  teamMarks: z.array(z.object({
    teamId: z.string().cuid(),
    judgeId: z.string().cuid().optional(),
    componentMarks: z.array(z.object({
      componentId: z.string().cuid(),
      marks: z.number().min(0),
    })).min(1),
  })).min(1),
})

export async function submitJudgeMarks(input: z.infer<typeof SubmitJudgeMarksSchema>) {
  let validated: z.infer<typeof SubmitJudgeMarksSchema>
  try {
    validated = SubmitJudgeMarksSchema.parse(input)
  } catch (e) {
    return { success: false, error: 'Invalid request body' }
  }

  const { eventId, teamMarks } = validated

  try {
    const criteria = await prisma.markingCriteria.findUnique({
      where: { eventId },
      include: { components: true },
    })

    if (!criteria) {
      return { success: false, error: 'Marking criteria not found for this event' }
    }

    // Validate components exist and marks within bounds
    for (const tm of teamMarks) {
      for (const cm of tm.componentMarks) {
        const component = criteria.components.find(c => c.id === cm.componentId)
        if (!component) {
          return { success: false, error: `Component ${cm.componentId} not found` }
        }
        if (cm.marks > component.maxMarksForComponent) {
          return { success: false, error: `Marks for component ${component.name} exceed max (${component.maxMarksForComponent})` }
        }
      }
    }

    const results: Array<{
      teamId: string;
      teamName?: string;
      success: boolean;
      error?: string;
      totalMarks?: number;
      componentMarksCount?: number;
    }> = []

    await prisma.$transaction(async (tx) => {
      for (const tm of teamMarks) {
        try {
          const team = await tx.team.findFirst({
            where: { id: tm.teamId, eventId },
            select: { id: true, name: true },
          })

          if (!team) {
            results.push({ teamId: tm.teamId, success: false, error: 'Team not found for this event' })
            continue
          }

          let teamMark = await tx.teamMark.findFirst({
            where: { teamId: tm.teamId, markingCriteriaId: criteria.id },
          })

          if (!teamMark) {
            teamMark = await tx.teamMark.create({
              data: { teamId: tm.teamId, markingCriteriaId: criteria.id, isSubmitted: false },
            })
          }

          if (tm.judgeId) {
            for (const cm of tm.componentMarks) {
              const existing = await tx.judgeMarking.findFirst({
                where: {
                  teamId: tm.teamId,
                  markingCriteriaId: criteria.id,
                  componentId: cm.componentId,
                  judgeId: tm.judgeId,
                },
                select: { id: true },
              })
              if (!existing) {
                await tx.judgeMarking.create({
                  data: {
                    teamId: tm.teamId,
                    markingCriteriaId: criteria.id,
                    componentId: cm.componentId,
                    judgeId: tm.judgeId,
                    marksAwarded: cm.marks,
                  },
                })
              }
            }
          }

          let totalMarks = 0
          const componentUpdates = []

          for (const component of criteria.components) {
            const marksForComponent = tm.componentMarks.find(m => m.componentId === component.id)
            if (!marksForComponent) continue

            const weighted = (marksForComponent.marks / component.maxMarksForComponent) * Number(component.weightPercentage)
            totalMarks += weighted

            let finalAverage = marksForComponent.marks
            if (tm.judgeId) {
              const allJudgeMarks = await tx.judgeMarking.findMany({
                where: { teamId: tm.teamId, markingCriteriaId: criteria.id, componentId: component.id },
              })
              finalAverage = allJudgeMarks.reduce((s, j) => s + Number(j.marksAwarded), 0) / allJudgeMarks.length
            }

            const componentMark = await tx.componentMark.findFirst({
              where: { teamMarkId: teamMark.id, componentId: component.id },
            })

            if (componentMark) {
              await tx.componentMark.update({
                where: { id: componentMark.id },
                data: {
                  averageMarks: finalAverage,
                  judgeCount: tm.judgeId ? componentMark.judgeCount + 1 : 1,
                },
              })
            } else {
              await tx.componentMark.create({
                data: {
                  teamMarkId: teamMark.id,
                  componentId: component.id,
                  averageMarks: finalAverage,
                  judgeCount: 1,
                },
              })
            }

            componentUpdates.push({ componentId: component.id, marks: marksForComponent.marks })
          }

          await tx.teamMark.update({
            where: { id: teamMark.id },
            data: { totalMarks, isSubmitted: true, submittedAt: new Date() },
          })

          results.push({
            teamId: tm.teamId,
            teamName: team.name,
            success: true,
            totalMarks,
            componentMarksCount: componentUpdates.length,
          })
        } catch (error) {
          console.error(`Error submitting marks for team ${tm.teamId}:`, error)
          results.push({ teamId: tm.teamId, success: false, error: 'Failed to submit marks' })
        }
      }
    })

    const succeeded = results.filter(r => r.success).length
    const failed = results.length - succeeded

    // Trigger real-time leaderboard update via SSE broadcast
    if (succeeded > 0) {
      // We don't await this to keep the action responsive
      broadcastLeaderboardUpdate(eventId).catch(err => 
        console.error('[LeaderboardBroadcast] Failed:', err)
      );
    }

    return {
      success: true,
      message: `Submitted marks for ${succeeded}/${results.length} teams`,
      results,
      summary: { succeeded, failed, total: results.length },
    }
  } catch (error) {
    console.error('submitJudgeMarks error:', error)
    return { success: false, error: 'Failed to submit marks' }
  }
}

// ---------------------------------------------------------------------------
// Get team marks (migrated from api/marking/team-marks GET)
// ---------------------------------------------------------------------------

export async function getTeamMarks(input: { eventId: string; teamId: string }) {
  const { eventId, teamId } = input
  if (!eventId || !teamId) return { success: false, error: 'eventId and teamId required' }

  try {
    const team = await prisma.team.findFirst({
      where: { id: teamId, eventId },
      select: { id: true, name: true },
    })

    if (!team) return { success: false, error: 'Team not found for this event' }

    const teamMark = await prisma.teamMark.findFirst({
      where: { teamId, criteria: { eventId } },
      include: {
        componentMarks: {
          include: {
            component: {
              select: { id: true, name: true, maxMarksForComponent: true },
            },
          },
        },
        criteria: {
          select: { id: true, name: true, maxMarks: true, numberOfJudges: true },
        },
      },
    })

    if (!teamMark) {
      return { success: true, marks: null, message: 'No marks submitted for this team yet' }
    }

    return {
      success: true,
      marks: {
        teamId,
        teamName: team.name,
        totalMarks: Number(teamMark.totalMarks),
        isSubmitted: teamMark.isSubmitted,
        submittedAt: teamMark.submittedAt,
        criteria: teamMark.criteria,
        componentMarks: teamMark.componentMarks.map(cm => ({
          componentId: cm.componentId,
          componentName: cm.component.name,
          averageMarks: Number(cm.averageMarks),
          maxMarks: cm.component.maxMarksForComponent,
          judgeCount: cm.judgeCount,
        })),
      },
    }
  } catch (error) {
    console.error('getTeamMarks error:', error)
    return { success: false, error: 'Failed to fetch team marks' }
  }
}

// ---------------------------------------------------------------------------
// Get leaderboard data for public-facing views (migrated from api/marking/leaderboard GET)
// ---------------------------------------------------------------------------

export async function getLeaderboardData(eventId: string) {
  if (!eventId) return { success: false, error: 'eventId required' }

  try {
    const criteria = await prisma.markingCriteria.findUnique({
      where: { eventId },
      include: {
        components: {
          orderBy: { order: 'asc' },
          select: { id: true, name: true, order: true, weightPercentage: true, maxMarksForComponent: true },
        },
        teamMarks: {
          where: { isSubmitted: true },
          include: {
            team: { select: { id: true, name: true, memberCount: true } },
            componentMarks: {
              include: { component: { select: { id: true, name: true } } },
            },
          },
          orderBy: [{ totalMarks: 'desc' }, { createdAt: 'desc' }],
        },
      },
    })

    if (!criteria) return { success: false, error: 'No marking criteria found for this event' }

    const leaderboard = criteria.teamMarks.map((tm, index) => ({
      rank: index + 1,
      teamId: tm.team.id,
      teamName: tm.team.name,
      memberCount: tm.team.memberCount,
      totalMarks: Number(tm.totalMarks),
      submittedAt: tm.submittedAt,
      componentMarks: tm.componentMarks.map(cm => ({
        componentId: cm.component.id,
        componentName: cm.component.name,
        averageMarks: Number(cm.averageMarks),
        judgeCount: cm.judgeCount,
      })),
    }))

    return {
      success: true,
      leaderboard: {
        eventId,
        criteriaName: criteria.name,
        maxMarks: criteria.maxMarks,
        numberOfJudges: criteria.numberOfJudges,
        components: criteria.components.map(c => ({
          ...c,
          weightPercentage: Number(c.weightPercentage),
        })),
        teams: leaderboard,
        totalTeamsSubmitted: leaderboard.length,
      },
    }
  } catch (error) {
    console.error('getLeaderboardData error:', error)
    return { success: false, error: 'Failed to fetch leaderboard' }
  }
}

