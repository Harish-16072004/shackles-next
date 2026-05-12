'use client'

import { useState, useRef } from 'react'
import { Scanner } from '@yudiel/react-qr-scanner'

interface ParticipantInfo {
  name: string
  shacklesId: string
}

interface EventInfo {
  id: string
  name: string
  type: string
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
  const scannerRef = useRef<boolean>(false)
  const [scannerEnabled, setScannerEnabled] = useState(true)

  const handleScan = async (result: any) => {
    if (!result || scannerRef.current) return

    scannerRef.current = true
    setScannerEnabled(false)

    try {
      // Decode QR payload using browser APIs
      let decoded: any
      try {
        const raw = result[0].rawValue.trim()
        let base64 = raw.replace(/-/g, '+').replace(/_/g, '/')
        while (base64.length % 4) {
          base64 += '='
        }
        decoded = JSON.parse(atob(base64))
      } catch (e) {
        setMessage({ type: 'error', text: 'Failed to decode QR code.' })
        scannerRef.current = false
        setTimeout(() => setScannerEnabled(true), 2000)
        return
      }

      if (decoded.type !== 'USER') {
        setMessage({ type: 'error', text: 'Invalid QR code. Must be a participant QR.' })
        scannerRef.current = false
        setTimeout(() => setScannerEnabled(true), 2000)
        return
      }

      const shacklesId = decoded.sid

      // Check registration status
      setLoading(true)
      const response = await fetch(
        `/api/scanner/check-registration?shacklesId=${shacklesId}&eventId=${eventId}`
      )
      const data = await response.json()

      if (!data.success) {
        setMessage({ type: 'error', text: data.error || 'Error checking registration' })
        scannerRef.current = false
        setTimeout(() => setScannerEnabled(true), 2000)
        return
      }

      setParticipant(data.participant)
      setEvent(data.event)
      setRegistered(data.registered)
      setQrData(result[0].rawValue)
      setScannedToday((prev) => prev + 1)
    } catch (error) {
      console.error('Scan error:', error)
      setMessage({ type: 'error', text: 'Failed to process QR code' })
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
      // Assuming qrData is needed; we'll need to pass decoded data structure
      // This depends on your existing qr-scan endpoint expectations
      const response = await fetch('/api/scanner/qr-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrData,
          eventId,
          operationType: 'ATTENDANCE',
          stationId: 'event-scanner', // Generic station ID for event scanning
        }),
      })

      const data = await response.json()

      if (!data.success) {
        setMessage({ type: 'error', text: data.error || 'Failed to mark attendance' })
      } else {
        setMessage({ type: 'success', text: `${participant.name} marked present` })
        setParticipant(null)
        setEvent(null)
        setRegistered(null)
        setQrData(null)
      }
    } catch (error) {
      console.error('Mark attendance error:', error)
      setMessage({ type: 'error', text: 'Failed to mark attendance' })
    } finally {
      setLoading(false)
      scannerRef.current = false
      setTimeout(() => setScannerEnabled(true), 2000)
    }
  }

  const handleRegisterForEvent = async () => {
    if (!participant || !event) return

    if (event.type === 'TEAM') {
      // Open modal for team members
      setTeamMembers(new Array(Math.max(1, (event.maxTeamSize || 2) - 1)).fill(''))
      setShowTeamModal(true)
    } else {
      // Individual event - register directly
      await registerIndividual()
    }
  }

  const registerIndividual = async () => {
    if (!participant) return

    setLoading(true)
    try {
      const response = await fetch('/api/scanner/register-for-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shacklesId: participant.shacklesId,
          eventId,
        }),
      })

      const data = await response.json()

      if (!data.success) {
        setMessage({ type: 'error', text: data.error || 'Failed to register' })
      } else {
        setMessage({ type: 'success', text: `${participant.name} registered for event` })
        setParticipant(null)
        setEvent(null)
        setRegistered(null)
      }
    } catch (error) {
      console.error('Registration error:', error)
      setMessage({ type: 'error', text: 'Failed to register participant' })
    } finally {
      setLoading(false)
      scannerRef.current = false
      setTimeout(() => setScannerEnabled(true), 2000)
    }
  }

  const handleCreateTeam = async () => {
    if (!participant) return

    const memberIds = teamMembers.filter((id) => id.trim())
    if (memberIds.length === 0) {
      setMessage({ type: 'error', text: 'At least one team member required' })
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/scanner/create-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scannedShacklesId: participant.shacklesId,
          memberShacklesIds: memberIds,
          eventId,
        }),
      })

      const data = await response.json()

      if (!data.success) {
        setMessage({ type: 'error', text: data.error || 'Failed to create team' })
      } else {
        setMessage({
          type: 'success',
          text: `Team created with ${data.totalMembers} members. Lock before marking attendance.`,
        })
        setParticipant(null)
        setEvent(null)
        setRegistered(null)
        setShowTeamModal(false)
        setTeamMembers([])
      }
    } catch (error) {
      console.error('Create team error:', error)
      setMessage({ type: 'error', text: 'Failed to create team' })
    } finally {
      setLoading(false)
      scannerRef.current = false
      setTimeout(() => setScannerEnabled(true), 2000)
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <p className="text-sm text-gray-600 uppercase tracking-wide">FOR ATTENDANCE</p>
        <h2 className="text-2xl font-bold text-gray-900">{eventName}</h2>
      </div>

      {/* Message Alert */}
      {message && (
        <div
          className={`mb-4 p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : message.type === 'error'
                ? 'bg-red-50 text-red-800 border border-red-200'
                : 'bg-blue-50 text-blue-800 border border-blue-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Scanner */}
      {!participant ? (
        <div className="border-2 border-dashed border-gray-300 rounded-lg overflow-hidden mb-6">
          {scannerEnabled && (
            <Scanner
              onScan={handleScan}
              onError={(error) => console.error('QR Scanner error:', error)}
              constraints={{ facingMode: 'environment' }}
              components={{ audio: false }}
             />
          )}
        </div>
      ) : null}

      {/* Participant Info */}
      {participant && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <p className="text-sm text-gray-600">Name</p>
              <p className="text-lg font-semibold text-gray-900">{participant.name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Shackles ID</p>
              <p className="text-lg font-semibold text-gray-900">{participant.shacklesId}</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            {registered ? (
              <button
                onClick={handleMarkPresent}
                disabled={loading}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold py-3 px-4 rounded-lg transition"
              >
                {loading ? 'Processing...' : 'MARK PRESENT'}
              </button>
            ) : (
              <button
                onClick={handleRegisterForEvent}
                disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 px-4 rounded-lg transition"
              >
                {loading ? 'Processing...' : 'REGISTER FOR EVENT'}
              </button>
            )}

            <button
              onClick={() => {
                setParticipant(null)
                setEvent(null)
                setRegistered(null)
                setQrData(null)
                scannerRef.current = false
                setScannerEnabled(true)
              }}
              className="px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Team Member Modal */}
      {showTeamModal && event && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">Enter Team Members</h3>
            <p className="text-sm text-gray-600 mb-4">
              Enter Shackles IDs for other team members (Captain is already included)
            </p>

            <div className="space-y-3 mb-6 max-h-64 overflow-y-auto">
              {teamMembers.map((id, index) => (
                <input
                  key={index}
                  type="text"
                  placeholder={`Member ${index + 1} Shackles ID`}
                  value={id}
                  onChange={(e) => {
                    const newMembers = [...teamMembers]
                    newMembers[index] = e.target.value
                    setTeamMembers(newMembers)
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                 />
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowTeamModal(false)
                  setTeamMembers([])
                  scannerRef.current = false
                  setScannerEnabled(true)
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTeam}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-semibold"
              >
                {loading ? 'Creating...' : 'Create Team'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Footer */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
        <p className="text-sm text-gray-600">Scanned today for this event:</p>
        <p className="text-2xl font-bold text-gray-900">{scannedToday}</p>
      </div>
    </div>
  )
}


