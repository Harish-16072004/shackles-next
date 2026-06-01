'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getLeaderboardData } from '@/server/actions/marking'

interface ComponentMark {
  componentId: string
  componentName: string
  averageMarks: number
  judgeCount: number
}

interface TeamLeaderboard {
  rank: number
  teamId: string
  teamName: string
  memberCount: number
  totalMarks: number
  submittedAt: string | Date | null
  componentMarks: ComponentMark[]
}

interface Component {
  id: string
  name: string
  order: number
  weightPercentage: number | any
  maxMarksForComponent: number
}

interface LeaderboardData {
  eventId: string
  criteriaName: string
  maxMarks: number
  numberOfJudges: number
  components: Component[]
  teams: TeamLeaderboard[]
  totalTeamsSubmitted: number
}

interface LeaderboardViewProps {
  eventId: string
  onRefresh?: () => void
}

export function LeaderboardView({ eventId, onRefresh }: LeaderboardViewProps) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchLeaderboard = useCallback(async () => {
    try {
      setError('')
      setLoading(true)
      const response = await getLeaderboardData(eventId)

      if (!response.success || !response.leaderboard) {
        setError(response.error || 'Failed to fetch leaderboard')
        setLoading(false)
        return
      }

      setLeaderboard(response.leaderboard)
    } catch (err) {
      setError('Network error')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    fetchLeaderboard()
  }, [fetchLeaderboard])

  if (loading) {
    return <div className="text-center py-8">Loading leaderboard...</div>
  }

  if (error) {
    return (
      <Card className="bg-red-50 border-red-200">
        <CardContent className="pt-6">
          <p className="text-red-700">{error}</p>
          <Button onClick={fetchLeaderboard} className="mt-4">Retry</Button>
        </CardContent>
      </Card>
    )
  }

  if (!leaderboard) {
    return (
      <Card className="bg-yellow-50 border-yellow-200">
        <CardContent className="pt-6">
          <p className="text-yellow-700">No marking data available yet.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Leaderboard - {leaderboard.criteriaName}</CardTitle>
          <CardDescription>
            Aggregated marks for {leaderboard.totalTeamsSubmitted} teams
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-blue-50 p-4 rounded">
              <div className="text-sm text-slate-600">Max Marks</div>
              <div className="text-2xl font-bold text-blue-700">{leaderboard.maxMarks}</div>
            </div>
            <div className="bg-blue-50 p-4 rounded">
              <div className="text-sm text-slate-600">Number of Judges</div>
              <div className="text-2xl font-bold text-blue-700">{leaderboard.numberOfJudges}</div>
            </div>
            <div className="bg-green-50 p-4 rounded">
              <div className="text-sm text-slate-600">Teams Submitted</div>
              <div className="text-2xl font-bold text-green-700">{leaderboard.totalTeamsSubmitted}</div>
            </div>
          </div>

          {/* Leaderboard Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-slate-300 bg-slate-50">
                  <th className="text-left py-3 px-3 font-semibold">Rank</th>
                  <th className="text-left py-3 px-3 font-semibold">Team Name</th>
                  <th className="text-center py-3 px-3 font-semibold">Members</th>
                  {leaderboard.components.map(comp => (
                    <th key={comp.id} className="text-right py-3 px-3">
                      <div className="font-semibold">{comp.name}</div>
                      <div className="text-xs text-slate-500">{comp.maxMarksForComponent}</div>
                    </th>
                  ))}
                  <th className="text-right py-3 px-3 font-semibold border-l border-slate-300">
                    Total Marks
                  </th>
                  <th className="text-center py-3 px-3 font-semibold text-xs">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.teams.length === 0 ? (
                  <tr>
                    <td colSpan={leaderboard.components.length + 5} className="text-center py-4 text-slate-500">
                      No teams with submitted marks
                    </td>
                  </tr>
                ) : (
                  leaderboard.teams.map((team, idx) => (
                    <tr
                      key={team.teamId}
                      className={`border-b border-slate-200 ${
                        idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'
                      } hover:bg-blue-50 transition`}
                    >
                      <td className="py-3 px-3">
                        <div className="font-bold text-lg">
                          {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : team.rank}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-medium">{team.teamName}</td>
                      <td className="text-center py-3 px-3">{team.memberCount}</td>
                      {leaderboard.components.map(comp => {
                        const componentMark = team.componentMarks.find(
                          cm => cm.componentId === comp.id
                        )
                        return (
                          <td key={comp.id} className="text-right py-3 px-3">
                            <div className="font-semibold">
                              {componentMark ? componentMark.averageMarks.toFixed(2) : '—'}
                            </div>
                            <div className="text-xs text-slate-500">
                              {componentMark ? `(${componentMark.judgeCount} judges)` : ''}
                            </div>
                          </td>
                        )
                      })}
                      <td className="text-right py-3 px-3 font-bold text-lg border-l border-slate-300">
                        {team.totalMarks.toFixed(2)}
                      </td>
                      <td className="text-center py-3 px-3 text-xs">
                        {team.submittedAt
                          ? new Date(team.submittedAt).toLocaleDateString()
                          : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <Button onClick={fetchLeaderboard} variant="outline" className="w-full">
            Refresh Leaderboard
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
