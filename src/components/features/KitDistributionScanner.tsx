'use client'

import { useState, useRef } from 'react'
import { Scanner } from '@yudiel/react-qr-scanner'
import { scanParticipantQR, updateKitStatus, getKitsIssuedCount } from '@/server/actions/event-logistics'
import { useEffect } from 'react'
import { CheckCircle, XCircle, Package, User, QrCode, ArrowRight } from 'lucide-react'

interface ParticipantInfo {
  id: string
  name: string
  shacklesId: string
  kitStatus: string
  registrationType: string
}

export default function KitDistributionScanner() {
  const [participant, setParticipant] = useState<ParticipantInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [scannedToday, setScannedToday] = useState(0)
  const [scannerEnabled, setScannerEnabled] = useState(true)
  const scannerRef = useRef<boolean>(false)

  // Fetch initial count
  useEffect(() => {
    async function fetchInitialCount() {
      const res = await getKitsIssuedCount()
      if (res.success) {
        setScannedToday(res.count)
      }
    }
    fetchInitialCount()
  }, [])

  const handleScan = async (result: any) => {
    if (!result || scannerRef.current) return

    scannerRef.current = true
    setScannerEnabled(false)
    setMessage({ type: 'info', text: 'Processing QR code...' })

    try {
      const rawToken = result[0].rawValue.trim()
      const res = await scanParticipantQR(rawToken)

      if (!res.success) {
        setMessage({ type: 'error', text: res.error || 'Invalid participant QR' })
        scannerRef.current = false
        setTimeout(() => {
          setScannerEnabled(true)
          setMessage(null)
        }, 3000)
        return
      }

      if (!res.data) {
        setMessage({ type: 'error', text: 'Participant data not found' })
        scannerRef.current = false
        setTimeout(() => {
          setScannerEnabled(true)
          setMessage(null)
        }, 3000)
        return
      }

      const { id, firstName, lastName, shacklesId, kitStatus, registrationType } = res.data as any
      setParticipant({
        id,
        name: `${firstName} ${lastName || ''}`.trim(),
        shacklesId: shacklesId || 'N/A',
        kitStatus,
        registrationType
      })
      setMessage(null)
    } catch (error) {
      console.error('Scan error:', error)
      setMessage({ type: 'error', text: 'Failed to process QR code' })
      scannerRef.current = false
      setTimeout(() => {
        setScannerEnabled(true)
        setMessage(null)
      }, 3000)
    }
  }

  const handleIssueKit = async () => {
    if (!participant) return

    setLoading(true)
    try {
      const res = await updateKitStatus(participant.id)

      if (!res.success) {
        setMessage({ type: 'error', text: res.error || 'Failed to issue kit' })
      } else {
        setMessage({ type: 'success', text: `Kit successfully issued to ${participant.name}` })
        setScannedToday((prev) => prev + 1)
        // Clear participant after success
        setTimeout(() => {
          setParticipant(null)
          setMessage(null)
          scannerRef.current = false
          setScannerEnabled(true)
        }, 2000)
      }
    } catch (error) {
      console.error('Issue kit error:', error)
      setMessage({ type: 'error', text: 'Failed to update kit status' })
    } finally {
      setLoading(false)
    }
  }

  const resetScanner = () => {
    setParticipant(null)
    setMessage(null)
    scannerRef.current = false
    setScannerEnabled(true)
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Status Bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
            <QrCode size={20} />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Scanner Status</p>
            <p className="text-sm font-bold text-gray-900">
              {scannerEnabled ? 'Ready to Scan' : loading ? 'Processing...' : 'Wait...'}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Kits Issued Today</p>
          <p className="text-sm font-bold text-blue-600">{scannedToday}</p>
        </div>
      </div>

      {/* Message Alert */}
      {message && (
        <div
          className={`mb-6 p-4 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-100'
              : message.type === 'error'
                ? 'bg-red-50 text-red-800 border border-red-100'
                : 'bg-blue-50 text-blue-800 border border-blue-100'
          }`}
        >
          {message.type === 'success' && <CheckCircle className="shrink-0" size={20} />}
          {message.type === 'error' && <XCircle className="shrink-0" size={20} />}
          <p className="font-medium text-sm">{message.text}</p>
        </div>
      )}

      {/* Scanner Viewport */}
      {!participant && scannerEnabled && (
        <div className="relative group">
          <div className="absolute inset-0 bg-blue-600/5 rounded-3xl -m-1 group-hover:bg-blue-600/10 transition-colors duration-500"></div>
          <div className="relative aspect-square bg-gray-900 rounded-2xl overflow-hidden border-4 border-white shadow-2xl">
            <Scanner
              onScan={handleScan}
              onError={(error) => console.error('QR Scanner error:', error)}
              constraints={{ facingMode: 'environment' }}
              components={{}}
              styles={{
                container: {
                  width: '100%',
                  height: '100%',
                }
              }}
            />
            {/* Overlay */}
            <div className="absolute inset-0 border-[40px] border-black/40 pointer-events-none">
              <div className="w-full h-full border-2 border-white/50 rounded-lg relative">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-500 -mt-1 -ml-1"></div>
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-500 -mt-1 -mr-1"></div>
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-500 -mb-1 -ml-1"></div>
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-500 -mb-1 -mr-1"></div>
              </div>
            </div>
          </div>
          <p className="mt-4 text-center text-gray-500 text-sm font-medium">
            Center the participant's QR code in the frame
          </p>
        </div>
      )}

      {/* Loading Placeholder */}
      {!participant && !scannerEnabled && !message && (
        <div className="aspect-square bg-gray-100 rounded-2xl flex flex-col items-center justify-center gap-4 animate-pulse">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-600 font-bold uppercase tracking-widest text-xs">Fetching Data</p>
        </div>
      )}

      {/* Participant Result Card */}
      {participant && (
        <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden animate-in zoom-in-95 duration-300">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-8 text-white text-center">
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-md">
              <User size={40} />
            </div>
            <h3 className="text-2xl font-bold mb-1">{participant.name}</h3>
            <p className="text-blue-100 font-medium opacity-90">{participant.registrationType}</p>
          </div>

          <div className="p-8">
            <div className="grid grid-cols-2 gap-8 mb-10">
              <div className="space-y-1">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Shackles ID</p>
                <p className="text-lg font-bold text-gray-900 tracking-tight">{participant.shacklesId}</p>
              </div>
              <div className="space-y-1 text-right">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Current Status</p>
                <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                  participant.kitStatus === 'ISSUED' 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-orange-100 text-orange-700'
                }`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${participant.kitStatus === 'ISSUED' ? 'bg-green-500' : 'bg-orange-500'}`}></div>
                  {participant.kitStatus}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {participant.kitStatus !== 'ISSUED' ? (
                <button
                  onClick={handleIssueKit}
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] disabled:bg-gray-400 text-white font-extrabold py-5 rounded-2xl transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2 text-lg"
                >
                  {loading ? (
                    <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <Package size={24} />
                      ISSUE KIT NOW
                    </>
                  )}
                </button>
              ) : (
                <div className="w-full bg-green-50 text-green-700 font-bold py-5 rounded-2xl flex items-center justify-center gap-2 border border-green-100">
                  <CheckCircle size={24} />
                  KIT ALREADY ISSUED
                </div>
              )}

              <button
                onClick={resetScanner}
                className="w-full py-4 text-gray-500 font-bold hover:text-gray-900 transition-colors flex items-center justify-center gap-2"
              >
                Cancel and Scan Another
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
