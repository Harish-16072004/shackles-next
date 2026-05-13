'use client'

import { useState, useEffect } from 'react'
import { fetchEventMarkingData, saveTeamMarksAllocation } from '@/server/actions/marking-allocation'

interface MarkingComponent {
  id: string;
  name: string;
  maxMarksForComponent: number;
}

interface MarkingCriteria {
  id: string;
  numberOfJudges: number;
  components: MarkingComponent[];
}

interface Team {
  id: string;
  name: string;
  memberCount: number;
}

interface Judge {
  id: string;
  email: string;
}

interface ExistingMark {
  teamId: string;
  componentId: string;
  judgeId: string;
  marksAwarded: number;
}

interface MarkingData {
  event: { id: string; name: string };
  criteria: MarkingCriteria | null;
  teams: Team[];
  judges: Judge[];
  existingMarks: ExistingMark[];
}

export default function AllocateMarks({ eventId }: { eventId: string }) {
  const [data, setData] = useState<MarkingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)

  // marksState[teamId][componentId][judgeIndex] = number
  const [marksState, setMarksState] = useState<Record<string, Record<string, Record<number, number>>>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadData()
  }, [eventId])

  async function loadData() {
    setLoading(true)
    const res = await fetchEventMarkingData(eventId)
    if (res.success && res.data) {
      const markingData = res.data;
      setData(markingData)
      // Pre-fill state
      const initialMarks: Record<string, Record<string, Record<number, number>>> = {}
      if (markingData.criteria && markingData.judges && markingData.existingMarks) {
        const criteria = markingData.criteria;
        markingData.teams.forEach((team) => {
          initialMarks[team.id] = {}
          criteria.components.forEach((comp) => {
            initialMarks[team.id][comp.id] = {}
            for (let i = 0; i < criteria.numberOfJudges; i++) {
              const judgeId = markingData.judges[i]?.id
              const existing = markingData.existingMarks.find(
                (m) => m.teamId === team.id && m.componentId === comp.id && m.judgeId === judgeId
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

  const handleSaveMarks = async (teamId: string) => {
    if (!data?.criteria) return
    setSaving(teamId)
    setMessage('')

    const payload = []
    const teamData = marksState[teamId]
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
      teamId: teamId,
      marks: payload
    })

    if (res.success) {
      setMessage(`Marks for ${data.teams.find((t) => t.id === teamId)?.name} saved successfully.`)
    } else {
      setMessage(res.error || 'Error saving marks.')
    }
    setSaving(null)
  }

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="w-12 h-12 border-4 border-violet-600 border-t-transparent rounded-full animate-spin"></div>
      <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Preparing Allocation Platform</p>
    </div>
  )

  if (!data || !data.criteria) return (
    <div className="bg-white rounded-3xl shadow-xl p-10 text-center border border-slate-100 max-w-2xl mx-auto">
      <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
        <svg width={32} height={32} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
      </div>
      <h3 className="text-xl font-black text-slate-900 mb-2">Configuration Missing</h3>
      <p className="text-slate-500 leading-relaxed mb-8">
        Scoring criteria for this event has not been configured yet. Please set up the criteria in the Event Settings before allocating marks.
      </p>
      <button onClick={() => window.location.reload()} className="px-6 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all">
        Retry Loading
      </button>
    </div>
  )

  const { event, criteria, teams } = data

  return (
    <div className="space-y-6">
      {/* Platform Header */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-600/10 text-violet-700 text-[10px] font-black uppercase tracking-[0.2em] mb-3">
            Scoring Terminal
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">{event.name}</h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Judges Configured</p>
            <p className="text-sm font-black text-slate-900">{criteria.numberOfJudges} Official Judges</p>
          </div>
          <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 border border-slate-100">
            <svg width={20} height={20} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-slate-400"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          </div>
        </div>
      </div>

      {message && (
        <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="w-8 h-8 bg-emerald-500 text-white rounded-full flex items-center justify-center shrink-0">
            <svg width={16} height={16} fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
          </div>
          <p className="font-bold text-sm">{message}</p>
        </div>
      )}

      {teams.length === 0 ? (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-16 text-center">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-300">
            <svg width={20} height={20} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">No Teams Attended</h3>
          <p className="text-slate-500 max-w-sm mx-auto">
            Once teams mark their attendance via the volunteer scanner, they will automatically appear here for mark allocation.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] sticky left-0 bg-white z-10 border-r border-slate-50 shadow-[4px_0_10px_rgba(0,0,0,0.02)]">Team Details</th>
                {criteria.components.map((comp) => (
                  <th key={comp.id} className="p-6 text-center border-r border-slate-50 last:border-0" style={{ minWidth: `${Math.max(120, criteria.numberOfJudges * 70)}px` }}>
                    <p className="text-[10px] font-black text-violet-600 uppercase tracking-widest mb-1">{comp.name}</p>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">Max: {comp.maxMarksForComponent}</p>
                  </th>
                ))}
                <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {teams.map((team) => (
                <tr key={team.id} className="group hover:bg-slate-50/50 transition-colors">
                  <td className="p-6 sticky left-0 bg-white z-10 group-hover:bg-slate-50/50 transition-colors border-r border-slate-50 shadow-[4px_0_10px_rgba(0,0,0,0.02)]">
                    <p className="font-black text-slate-900 text-lg tracking-tight mb-0.5">{team.name}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{team.memberCount} Members</p>
                  </td>
                  {criteria.components.map((comp) => (
                    <td key={comp.id} className="p-4 border-r border-slate-50 last:border-0">
                      <div className="flex items-center justify-center gap-2">
                        {Array.from({ length: criteria.numberOfJudges }).map((_, i) => (
                          <div key={i} className="flex flex-col items-center gap-1">
                            <span className="text-[8px] font-black text-slate-300 uppercase">J{i + 1}</span>
                            <input
                              type="number"
                              min="0"
                              max={comp.maxMarksForComponent}
                              className="w-14 h-10 text-center text-sm font-bold border-2 border-slate-100 rounded-xl focus:border-violet-500 focus:ring-0 transition-all bg-white"
                              value={marksState[team.id]?.[comp.id]?.[i] ?? ''}
                              onChange={(e) => handleMarkChange(team.id, comp.id, i, e.target.value)}
                            />
                          </div>
                        ))}
                      </div>
                    </td>
                  ))}
                  <td className="p-6 text-center">
                    <button
                      onClick={() => handleSaveMarks(team.id)}
                      disabled={saving === team.id}
                      className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg ${saving === team.id
                          ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                          : 'bg-violet-600 text-white hover:bg-violet-700 hover:shadow-violet-200 active:scale-95'
                        }`}
                    >
                      {saving === team.id ? (
                        <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                      ) : 'Save'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Instructional Footer */}
      <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex items-center gap-4">
        <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-slate-400 shrink-0">
          <svg width={40} height={40} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </div>
        <p className="text-slate-500 text-xs font-medium leading-relaxed">
          The table only shows teams that have officially marked their attendance. All marks are automatically averaged across judges. Click <span className="font-bold text-slate-900">Save</span> after entering marks for each team.
        </p>
      </div>
    </div>
  )
}
