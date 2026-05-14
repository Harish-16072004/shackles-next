'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchCriteriaForCoordinator, submitJudgeMarks } from '@/server/actions/marking'

interface MarkingComponent {
  id: string
  name: string
  order: number
  weightPercentage: number
  maxMarksForComponent: number
  description?: string
}

interface MarkingCriteria {
  id: string
  name: string
  description?: string
  maxMarks: number
  numberOfJudges: number
  components: MarkingComponent[]
}

interface Team {
  id: string
  name: string
  memberCount: number
}

interface CoordinatorMarkingProps {
  eventId: string
  teams: Team[]
}

export function CoordinatorMarking({ eventId, teams }: CoordinatorMarkingProps) {
  const [criteria, setCriteria] = useState<MarkingCriteria | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Marks state: { [teamId]: { [componentId]: marks } }
  const [marks, setMarks] = useState<Record<string, Record<string, number>>>({})

  useEffect(() => {
    // Fetch marking criteria
    const fetchCriteria = async () => {
      try {
        const response = await fetchCriteriaForCoordinator(eventId)

        if (!response.success || !response.criteria) {
          setError(response.error || 'Failed to fetch criteria')
          setLoading(false)
          return
        }

        setCriteria(response.criteria)

        // Initialize marks object
        const initialMarks: Record<string, Record<string, number>> = {}
        teams.forEach(team => {
          initialMarks[team.id] = {}
          response.criteria.components.forEach((comp: MarkingComponent) => {
            initialMarks[team.id][comp.id] = 0
          })
        })
        setMarks(initialMarks)
      } catch (err) {
        setError('Network error')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchCriteria()
  }, [eventId, teams])

  const handleMarkChange = (teamId: string, componentId: string, value: string) => {
    setMarks(prev => ({
      ...prev,
      [teamId]: {
        ...prev[teamId],
        [componentId]: value === '' ? 0 : parseFloat(value),
      },
    }))
  }

  const calculateTeamTotal = (teamId: string) => {
    if (!criteria) return 0
    return criteria.components.reduce((sum, comp) => {
      return sum + (marks[teamId]?.[comp.id] || 0)
    }, 0)
  }

  const handleSubmit = async () => {
    if (!criteria) return

    setError('')
    setSuccess('')
    setSubmitting(true)

    try {
      // Build team marks for submission
      const teamMarks = teams.map(team => ({
        teamId: team.id,
        componentMarks: criteria.components.map(comp => ({
          componentId: comp.id,
          marks: marks[team.id]?.[comp.id] || 0,
        })),
      }))

      const response = await submitJudgeMarks({
        eventId,
        teamMarks,
      })

      if (!response.success) {
        setError(response.error || 'Failed to submit marks')
        return
      }

      setSuccess(response.message || 'Marks submitted')
    } catch (err) {
      setError('Network error')
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading marking criteria...</div>
  }

  if (!criteria) {
    return (
      <Card className="bg-yellow-50 border-yellow-200">
        <CardContent className="pt-6">
          <p className="text-yellow-700">No marking criteria set up for this event yet. Contact SuperAdmin.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Marking - {criteria.name}</CardTitle>
          <CardDescription>
            Enter marks for each team. All marks are aggregated across judges.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <div className="bg-red-50 text-red-700 p-3 rounded text-sm">{error}</div>}
          {success && <div className="bg-green-50 text-green-700 p-3 rounded text-sm">{success}</div>}

          {/* Component headers */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-slate-300">
                  <th className="text-left py-2 px-2 font-semibold">Team</th>
                  {criteria.components.map(comp => (
                    <th key={comp.id} className="text-right py-2 px-2">
                      <div className="font-semibold">{comp.name}</div>
                      <div className="text-xs text-slate-500">
                        {comp.weightPercentage}% / {comp.maxMarksForComponent}
                      </div>
                    </th>
                  ))}
                  <th className="text-right py-2 px-2 font-semibold border-l border-slate-300">Total</th>
                </tr>
              </thead>
              <tbody>
                {teams.map(team => (
                  <tr key={team.id} className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="py-3 px-2 font-medium">{team.name}</td>
                    {criteria.components.map(comp => (
                      <td key={comp.id} className="text-right py-3 px-2">
                        <Input
                          type="number"
                          min="0"
                          max={comp.maxMarksForComponent}
                          step="0.1"
                          value={marks[team.id]?.[comp.id] || ''}
                          onChange={e => handleMarkChange(team.id, comp.id, e.target.value)}
                          className="w-20 text-right text-xs"
                          placeholder="0"
                        />
                      </td>
                    ))}
                    <td className="text-right py-3 px-2 font-semibold border-l border-slate-300">
                      {calculateTeamTotal(team.id).toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div className="bg-blue-50 p-3 rounded">
              <div className="text-xs text-slate-600">Max Total Marks</div>
              <div className="text-lg font-bold text-blue-700">{criteria.maxMarks}</div>
            </div>
            <div className="bg-blue-50 p-3 rounded">
              <div className="text-xs text-slate-600">Number of Judges</div>
              <div className="text-lg font-bold text-blue-700">{criteria.numberOfJudges}</div>
            </div>
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={submitting || teams.length === 0}
            className="w-full"
            size="lg"
          >
            {submitting ? 'Submitting Marks...' : 'Submit All Marks'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
