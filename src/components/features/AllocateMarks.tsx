'use client'

import { useState, useEffect } from 'react'
import { fetchEventMarkingData, saveTeamMarksAllocation } from '@/server/actions/marking-allocation'

export default function AllocateMarks({ eventId }: { eventId: string }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  
  // marksState[teamId][componentId][judgeIndex] = number
  const [marksState, setMarksState] = useState<Record<string, Record<string, Record<number, number>>>>({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadData()
  }, [eventId])

  async function loadData() {
    setLoading(true)
    const res = await fetchEventMarkingData(eventId)
    if (res.success) {
      setData(res)
      // Pre-fill state
      const initialMarks: any = {}
      if (res.criteria && res.judges && res.existingMarks) {
        res.teams.forEach((team: any) => {
          initialMarks[team.id] = {}
          res.criteria.components.forEach((comp: any) => {
            initialMarks[team.id][comp.id] = {}
            for (let i = 0; i < res.criteria.numberOfJudges; i++) {
              const judgeId = res.judges[i]?.id
              const existing = res.existingMarks.find(
                (m: any) => m.teamId === team.id && m.componentId === comp.id && m.judgeId === judgeId
              )
              initialMarks[team.id][comp.id][i] = existing ? Number(existing.marksAwarded) : 0
            }
          })
        })
      }
      setMarksState(initialMarks)
    } else {
      setMessage('Failed to load event data.')
    }
    setLoading(false)
  }

  const handleMarkChange = (teamId: string, compId: string, judgeIndex: number, val: string) => {
    setMarksState(prev => ({
      ...prev,
      [teamId]: {
        ...prev[teamId],
        [compId]: {
          ...prev[teamId][compId],
          [judgeIndex]: Number(val) || 0
        }
      }
    }))
  }

  const handleSaveMarks = async () => {
    if (!selectedTeamId || !data?.criteria) return
    setSaving(true)
    setMessage('')

    const payload = []
    const teamData = marksState[selectedTeamId]
    for (const comp of data.criteria.components) {
      for (let j = 0; j < data.criteria.numberOfJudges; j++) {
        payload.push({
          componentId: comp.id,
          judgeIndex: j,
          marks: teamData[comp.id]?.[j] || 0
        })
      }
    }

    const res = await saveTeamMarksAllocation({
      eventId,
      teamId: selectedTeamId,
      marks: payload
    })

    if (res.success) {
      setMessage('Marks saved successfully.')
    } else {
      setMessage(res.error || 'Error saving marks.')
    }
    setSaving(false)
  }

  if (loading) return <div className="p-4 text-center">Loading allocation platform...</div>
  if (!data || !data.criteria) return <div className="p-4 text-center text-red-600">Scoring Criteria is not set up. Please configure the criteria first.</div>

  const { event, criteria, teams } = data
  const selectedTeam = teams.find((t: any) => t.id === selectedTeamId)

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-bold mb-4">{event.name} - Mark Input</h2>
      
      {message && <div className="mb-4 text-sm font-semibold text-blue-600 bg-blue-50 p-2 rounded">{message}</div>}

      <div className="mb-6">
        <label className="block text-sm font-bold text-gray-700 mb-2">Select Team / Participant</label>
        <select 
          className="border border-gray-300 p-2 rounded-md w-full max-w-md"
          value={selectedTeamId || ''}
          onChange={(e) => { setSelectedTeamId(e.target.value); setMessage(''); }}
        >
          <option value="">-- Choose --</option>
          {teams.map((t: any) => (
            <option key={t.id} value={t.id}>{t.name} ({t.memberCount} members)</option>
          ))}
        </select>
      </div>

      {selectedTeamId && selectedTeam && (
        <div className="border border-gray-200 rounded-md overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="p-3 text-sm font-semibold text-gray-700 w-1/3">Component</th>
                <th className="p-3 text-sm font-semibold text-gray-700 w-1/6 text-center">Max</th>
                {Array.from({ length: criteria.numberOfJudges }).map((_, i) => (
                  <th key={i} className="p-3 text-sm font-semibold text-gray-700 text-center">Judge {i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {criteria.components.map((comp: any) => (
                <tr key={comp.id} className="border-b border-gray-100">
                  <td className="p-3">
                    <p className="font-semibold text-gray-800 text-sm">{comp.name}</p>
                    {comp.description && <p className="text-xs text-gray-500">{comp.description}</p>}
                  </td>
                  <td className="p-3 text-center text-sm font-bold text-gray-600">{comp.maxMarksForComponent}</td>
                  {Array.from({ length: criteria.numberOfJudges }).map((_, i) => (
                    <td key={i} className="p-3 text-center">
                      <input
                        type="number"
                        min="0"
                        max={comp.maxMarksForComponent}
                        className="w-16 p-1 text-center border border-gray-300 rounded focus:ring-violet-500 focus:border-violet-500"
                        value={marksState[selectedTeamId]?.[comp.id]?.[i] !== undefined ? marksState[selectedTeamId][comp.id][i] : ''}
                        onChange={(e) => handleMarkChange(selectedTeamId, comp.id, i, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-4 bg-gray-50 flex justify-end">
            <button
              onClick={handleSaveMarks}
              disabled={saving}
              className="bg-violet-600 text-white px-6 py-2 rounded-md font-semibold hover:bg-violet-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Marks'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
