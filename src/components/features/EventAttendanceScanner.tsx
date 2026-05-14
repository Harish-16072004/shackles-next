'use client'

import { useState, useRef, useEffect } from 'react'
import { Scanner } from '@yudiel/react-qr-scanner'
import { AlertCircle, CheckCircle2, QrCode, Users, Plus, ShieldCheck, X } from 'lucide-react'
import { processQRScanAction, checkRegistrationStatus, scannerRegisterForEvent, scannerCreateTeam } from '@/server/actions/event-logistics'

interface ParticipantInfo {
  name: string
  shacklesId: string
  college?: string
}

interface EventInfo {
  id: string
  name: string
  type: string
  participationMode: string
  minTeamSize?: number
  maxTeamSize?: number
}

interface EventAttendanceScannerProps {
  eventId: string
  eventName: string
  isAdmin?: boolean
}

export default function EventAttendanceScanner({
  eventId,
  eventName,
  isAdmin = false,
}: EventAttendanceScannerProps) {
  const [participant, setParticipant] = useState<ParticipantInfo | null>(null)
  const [event, setEvent] = useState<EventInfo | null>(null)
  const [registered, setRegistered] = useState<boolean | null>(null)
  const [qrData, setQrData] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [scannedToday, setScannedToday] = useState(0)
  const [showTeamModal, setShowTeamModal] = useState(false)
  const [teamMembers, setTeamMembers] = useState<string[]>([])
  const [teamName, setTeamName] = useState('')
  const scannerRef = useRef<boolean>(false)
  const [scannerEnabled, setScannerEnabled] = useState(true)

  const handleScan = async (result: any) => {
    if (!result || scannerRef.current) return

    scannerRef.current = true
    setScannerEnabled(false)

    try {
      let decoded: any
      try {
        const raw = result[0].rawValue.trim()
        let base64 = raw.replace(/-/g, '+').replace(/_/g, '/')
        while (base64.length % 4) {
          base64 += '='
        }
        decoded = JSON.parse(atob(base64))
      } catch (e) {
        setMessage({ type: 'error', text: 'INVALID QR PAYLOAD' })
        scannerRef.current = false
        setTimeout(() => setScannerEnabled(true), 2000)
        return
      }

      if (decoded.type !== 'USER') {
        setMessage({ type: 'error', text: 'INVALID ENTITY TYPE' })
        scannerRef.current = false
        setTimeout(() => setScannerEnabled(true), 2000)
        return
      }

      const shacklesId = decoded.sid

      setLoading(true)
      const data = await checkRegistrationStatus({ shacklesId, eventId })

      if (!data.success) {
        setMessage({ type: 'error', text: data.error || 'REGISTRATION CHECK FAILED' })
        scannerRef.current = false
        setTimeout(() => setScannerEnabled(true), 2000)
        return
      }

      setParticipant(data.participant || null)
      setEvent(data.event || null)
      setRegistered(data.registered ?? null)
      setQrData(result[0].rawValue)
      setScannedToday((prev) => prev + 1)
      setMessage(null)
    } catch (error) {
      setMessage({ type: 'error', text: 'SYSTEM ERROR' })
      scannerRef.current = false
      setTimeout(() => setScannerEnabled(true), 2000)
    } finally {
      setLoading(false)
    }
  }

  const handleMarkPresent = async () => {
    if (!participant || !qrData) return

    setLoading(true)
    try {
      const data = await processQRScanAction({
        qrData: qrData!,
        eventId,
        operationType: 'ATTENDANCE',
        stationId: 'event-scanner',
      })

      if (!data.success) {
        setMessage({ type: 'error', text: data.error || 'MARKING FAILED' })
      } else {
        setMessage({ type: 'success', text: `${participant.name.toUpperCase()} MARKED PRESENT` })
        resetScannerState()
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'MARKING FAILED' })
    } finally {
      setLoading(false)
      scannerRef.current = false
      setTimeout(() => setScannerEnabled(true), 2000)
    }
  }

  const handleRegisterForEvent = async () => {
    if (!participant || !event) return

    if (event.participationMode === 'TEAM') {
      setTeamMembers(new Array(Math.max(1, (event.maxTeamSize || 2) - 1)).fill(''))
      setShowTeamModal(true)
    } else {
      await registerIndividual()
    }
  }

  const registerIndividual = async () => {
    if (!participant) return

    setLoading(true)
    try {
      const data = await scannerRegisterForEvent({
        shacklesId: participant.shacklesId,
        eventId,
      })

      if (!data.success) {
        setMessage({ type: 'error', text: data.error || 'REGISTRATION FAILED' })
      } else {
        setMessage({ type: 'success', text: `${participant.name.toUpperCase()} REGISTERED` })
        resetScannerState()
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'REGISTRATION FAILED' })
    } finally {
      setLoading(false)
      scannerRef.current = false
      setTimeout(() => setScannerEnabled(true), 2000)
    }
  }

  const handleCreateTeam = async (lockStatus: 'OPEN' | 'LOCKED') => {
    if (!participant) return

    if (!teamName.trim()) {
      setMessage({ type: 'error', text: 'TEAM NAME REQUIRED' })
      return
    }

    const memberIds = teamMembers.filter((id) => id.trim())
    
    if (lockStatus === 'LOCKED' && memberIds.length < teamMembers.length) {
      const confirmLock = window.confirm('LOCK TEAM WITH VACANCIES?')
      if (!confirmLock) return
    }

    setLoading(true)
    try {
      const data = await scannerCreateTeam({
        scannedShacklesId: participant.shacklesId,
        memberShacklesIds: memberIds,
        eventId,
        teamName: teamName.trim(),
        lockStatus,
      })

      if (!data.success) {
        setMessage({ type: 'error', text: data.error || 'TEAM CREATION FAILED' })
      } else {
        setMessage({
          type: 'success',
          text: `TEAM "${teamName.toUpperCase()}" CREATED`,
        })
        resetScannerState()
        setShowTeamModal(false)
        setTeamMembers([])
        setTeamName('')
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'TEAM CREATION FAILED' })
    } finally {
      setLoading(false)
      scannerRef.current = false
      setTimeout(() => setScannerEnabled(true), 2000)
    }
  }

  const resetScannerState = () => {
    setParticipant(null)
    setEvent(null)
    setRegistered(null)
    setQrData(null)
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* Platform Header */}
      <div className="bg-slate-900 rounded-3xl shadow-2xl border border-slate-800 overflow-hidden">
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-blue-600/10 rounded-lg">
                <QrCode className="w-5 h-5 text-blue-500" />
             </div>
             <div>
                <h2 className="text-xs font-black text-white tracking-widest uppercase">{eventName}</h2>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.2em]">Live Attendance Terminal</p>
             </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 rounded-full">
             <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
             <span className="text-[9px] font-black text-emerald-500 tracking-wider">ONLINE</span>
          </div>
        </div>

        <div className="p-6 sm:p-8">
           {/* Message Alert */}
           {message && (
             <div className={`mb-6 p-4 rounded-2xl border flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300 ${
               message.type === 'success' 
                 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' 
                 : 'bg-rose-500/10 border-rose-500/20 text-rose-500'
             }`}>
               {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
               <p className="text-xs font-black tracking-widest uppercase">{message.text}</p>
             </div>
           )}

           {/* Scanner Area */}
           {!participant ? (
             <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-violet-600 rounded-3xl blur opacity-10 group-hover:opacity-20 transition duration-1000" />
                <div className="relative border-2 border-slate-800 bg-slate-950 rounded-3xl overflow-hidden aspect-video sm:aspect-[16/9] flex items-center justify-center">
                   {scannerEnabled ? (
                      <Scanner
                        onScan={handleScan}
                        onError={(error) => console.error(error)}
                        constraints={{ facingMode: 'environment' }}
                        components={{ finder: true }}
                      />
                   ) : (
                      <div className="flex flex-col items-center gap-4">
                         <div className="w-12 h-12 border-2 border-slate-800 border-t-blue-500 rounded-full animate-spin" />
                         <p className="text-[10px] font-black text-slate-500 tracking-[0.3em] uppercase">Ready for next scan</p>
                      </div>
                   )}
                   {/* HUD Overlay */}
                   <div className="absolute inset-0 pointer-events-none border-[20px] border-slate-950/20" />
                </div>
             </div>
           ) : (
             <div className="space-y-6 animate-in zoom-in-95 duration-300">
                {/* Participant Data Card */}
                <div className="bg-slate-950/50 rounded-3xl border border-slate-800 p-6 relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-6 opacity-5">
                      <Users size={80} />
                   </div>
                   
                   <div className="flex flex-col sm:flex-row justify-between gap-6 relative z-10">
                      <div className="space-y-4">
                         <div>
                            <p className="text-[9px] font-black text-slate-500 tracking-[0.2em] uppercase mb-1">Full Name</p>
                            <p className="text-xl font-black text-white tracking-tight">{participant.name}</p>
                         </div>
                         <div>
                            <p className="text-[9px] font-black text-slate-500 tracking-[0.2em] uppercase mb-1">Identity Token</p>
                            <code className="text-sm font-mono text-blue-400 bg-blue-400/5 px-2 py-1 rounded-md border border-blue-400/10">{participant.shacklesId}</code>
                         </div>
                      </div>
                      
                      <div className="flex flex-col justify-end text-right">
                         <p className="text-[9px] font-black text-slate-500 tracking-[0.2em] uppercase mb-1">Status</p>
                         {registered ? (
                            <div className="flex items-center gap-2 text-emerald-500 justify-end">
                               <ShieldCheck className="w-5 h-5" />
                               <span className="text-sm font-black tracking-widest uppercase">Registered</span>
                            </div>
                         ) : (
                            <div className="flex items-center gap-2 text-amber-500 justify-end">
                               <AlertCircle className="w-5 h-5" />
                               <span className="text-sm font-black tracking-widest uppercase">Not Registered</span>
                            </div>
                         )}
                      </div>
                   </div>
                </div>

                {/* Action Controls */}
                <div className="flex flex-col sm:flex-row gap-3">
                   {registered ? (
                      <button
                        onClick={handleMarkPresent}
                        disabled={loading}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white font-black py-4 px-6 rounded-2xl transition-all shadow-lg shadow-emerald-950/20 text-xs tracking-widest uppercase flex items-center justify-center gap-2"
                      >
                        {loading ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        {loading ? 'PROCESSING...' : 'MARK ATTENDANCE'}
                      </button>
                   ) : (
                      <button
                        onClick={handleRegisterForEvent}
                        disabled={loading}
                        className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white font-black py-4 px-6 rounded-2xl transition-all shadow-lg shadow-blue-950/20 text-xs tracking-widest uppercase flex items-center justify-center gap-2"
                      >
                        {loading ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <Plus className="w-4 h-4" />}
                        {loading ? 'PROCESSING...' : (event?.participationMode === 'TEAM' ? 'ON-SPOT TEAM REG' : 'ON-SPOT REGISTER')}
                      </button>
                   )}

                   <button
                     onClick={() => {
                        resetScannerState()
                        scannerRef.current = false
                        setScannerEnabled(true)
                     }}
                     className="px-8 py-4 border border-slate-800 text-slate-400 font-black rounded-2xl hover:bg-slate-800 transition-all text-xs tracking-widest uppercase"
                   >
                     CANCEL
                   </button>
                </div>
             </div>
           )}
        </div>
      </div>

      {/* Stats / Footer */}
      <div className="flex justify-between items-center px-6">
         <p className="text-[10px] font-black text-slate-500 tracking-widest uppercase">Sessions Scanned: {scannedToday}</p>
         <p className="text-[10px] font-black text-slate-500 tracking-widest uppercase">Terminal ID: {eventId.slice(-8).toUpperCase()}</p>
      </div>

      {/* Team Modal Reimagined */}
      {showTeamModal && event && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] shadow-2xl p-8 max-w-md w-full relative animate-in zoom-in-95 duration-300">
            <button 
               onClick={() => setShowTeamModal(false)}
               className="absolute top-6 right-6 text-slate-500 hover:text-white transition-colors"
            >
               <X size={24} />
            </button>

            <div className="mb-8">
               <h3 className="text-2xl font-black text-white tracking-tight mb-2 uppercase">Create Team</h3>
               <p className="text-xs font-bold text-slate-500 tracking-widest uppercase">Team Registration Console</p>
            </div>
            
            <div className="space-y-6 mb-10">
              <div>
                <label className="text-[10px] font-black text-slate-500 tracking-widest uppercase block mb-2 ml-1">Team Designation</label>
                <input
                  type="text"
                  placeholder="E.G. THE VINTAGE CREW"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="w-full px-5 py-4 bg-slate-950 border border-slate-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-white font-bold text-sm tracking-wide"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-500 tracking-widest uppercase block mb-2 ml-1">Member Shackles IDs</label>
                <div className="space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                  {teamMembers.map((id, index) => (
                    <div key={index} className="relative group">
                       <input
                         type="text"
                         placeholder={`MEMBER ${index + 1} ID`}
                         value={id}
                         onChange={(e) => {
                           const newMembers = [...teamMembers]
                           newMembers[index] = e.target.value
                           setTeamMembers(newMembers)
                         }}
                         className="w-full px-5 py-4 bg-slate-950 border border-slate-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-white font-bold text-sm tracking-wide"
                       />
                       <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-20">
                          <Users size={16} />
                       </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => handleCreateTeam('LOCKED')}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white font-black py-4 rounded-2xl transition-all shadow-lg shadow-blue-900/20 text-xs tracking-widest uppercase"
              >
                {loading ? 'PROCESSING...' : 'FINALIZE REGISTRATION'}
              </button>
              <button
                onClick={() => handleCreateTeam('OPEN')}
                disabled={loading}
                className="w-full bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 text-slate-300 font-black py-4 rounded-2xl transition-all text-xs tracking-widest uppercase"
              >
                {loading ? '...' : 'SAVE AS DRAFT'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}



