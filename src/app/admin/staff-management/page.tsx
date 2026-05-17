'use client'

import { useState, useEffect } from 'react'
import {
  createStaffUser,
  assignStaffToEvent,
  removeStaffFromEvent,
  listStaffUsers,
  listAvailableEvents,
} from '@/server/actions/staff-management'

type StaffUser = Extract<Awaited<ReturnType<typeof listStaffUsers>>, { success: true }>['data']['staff'][number]
type EventType = Extract<Awaited<ReturnType<typeof listAvailableEvents>>, { success: true }>['data']['events'][number]

export default function StaffManagementPage() {
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([])
  const [events, setEvents] = useState<EventType[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'create' | 'assign' | 'list'>('list')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Form states
  const [createForm, setCreateForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    phone: '',
    role: 'VOLUNTEER' as const,
  })

  const [assignForm, setAssignForm] = useState({
    userId: '',
    eventId: '',
  })

  // Load data
  useEffect(() => {
    async function loadData() {
      try {
        const [staffRes, eventsRes] = await Promise.all([
          listStaffUsers(),
          listAvailableEvents(),
        ])

        if (staffRes.success) {
          setStaffUsers(staffRes.data.staff || [])
        } else {
          console.error('[StaffMgmt] listStaffUsers failed:', staffRes)
          setMessage({ type: 'error', text: `Failed to load staff: ${staffRes.error || 'Unknown error'}` })
        }

        if (eventsRes.success) {
          setEvents(eventsRes.data.events || [])
        } else {
          console.error('[StaffMgmt] listAvailableEvents failed:', eventsRes)
          setMessage({ type: 'error', text: `Failed to load events: ${eventsRes.error || 'Unknown error'}` })
        }
      } catch (error) {
        console.error('[StaffMgmt] loadData error:', error)
        setMessage({ type: 'error', text: 'Failed to load data' })
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  // Create staff handler
  async function handleCreateStaff(e: React.FormEvent) {
    e.preventDefault()
    try {
      const result = await createStaffUser(createForm)

      if (result.success) {
        setMessage({ type: 'success', text: result.message || 'Staff user created' })
        setCreateForm({
          email: '',
          password: '',
          firstName: '',
          lastName: '',
          phone: '',
          role: 'VOLUNTEER',
        })
        // Reload staff list
        const res = await listStaffUsers()
        if (res.success) setStaffUsers(res.data.staff || [])
      } else {
        const errorRes = result as { success: false; error: any }
        const errorText = typeof errorRes.error === 'string'
          ? errorRes.error
          : errorRes.error && typeof errorRes.error === 'object'
            ? Object.values(errorRes.error as Record<string, string[]>).flat().join(', ')
            : 'Failed to create staff user'
            
        setMessage({
          type: 'error',
          text: errorText,
        })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error creating staff user' })
    }
  }

  // Assign staff handler
  async function handleAssignStaff(e: React.FormEvent) {
    e.preventDefault()
    try {
      const result = await assignStaffToEvent(assignForm)

      if (result.success) {
        setMessage({ type: 'success', text: result.message || 'Staff assigned to event' })
        setAssignForm({ userId: '', eventId: '' })
        // Reload staff list
        const res = await listStaffUsers()
        if (res.success) setStaffUsers(res.data.staff || [])

        // Redirection logic for Kit Distribution
        const data = result.data as { eventName?: string }
        if (data.eventName === 'KIT DISTRIBUTION') {
          window.location.href = '/staff/volunteerDashboard'
        }
      } else {
        setMessage({
          type: 'error',
          text: typeof result.error === 'string' ? result.error : 'Failed to assign staff',
        })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error assigning staff' })
    }
  }

  // Remove assignment handler
  async function handleRemoveAssignment(userId: string, eventId: string) {
    if (!confirm('Remove staff from event?')) return

    try {
      const result = await removeStaffFromEvent({ userId, eventId })

      if (result.success) {
        setMessage({ type: 'success', text: result.message || 'Staff removed from event' })
        // Reload staff list
        const res = await listStaffUsers()
        if (res.success) setStaffUsers(res.data.staff || [])
      } else {
        setMessage({
          type: 'error',
          text: typeof result.error === 'string' ? result.error : 'Failed to remove staff',
        })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error removing staff' })
    }
  }

  if (loading) {
    return <div className="p-8 text-center">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Staff Management</h1>
        <p className="text-gray-600 mb-6">Create and assign COORDINATOR and VOLUNTEER staff to events</p>

        {/* Message Alert */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              message.type === 'success'
                ? 'bg-green-50 border border-green-200 text-green-800'
                : 'bg-red-50 border border-red-200 text-red-800'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 flex gap-2 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('list')}
            className={`px-4 py-2 font-semibold ${
              activeTab === 'list'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            List Staff
          </button>
          <button
            onClick={() => setActiveTab('create')}
            className={`px-4 py-2 font-semibold ${
              activeTab === 'create'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Create Staff
          </button>
          <button
            onClick={() => setActiveTab('assign')}
            className={`px-4 py-2 font-semibold ${
              activeTab === 'assign'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Assign to Event
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'list' && (
          <div className="bg-white rounded-lg shadow">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Name</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Email</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Role</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Assigned Events</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {staffUsers.map(staff => (
                    <tr key={staff.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {staff.firstName} {staff.lastName}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{staff.email}</td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            staff.role === 'COORDINATOR'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {staff.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="space-y-1">
                          {staff.staffAssignments && staff.staffAssignments.length > 0 ? (
                            staff.staffAssignments.map(assignment => (
                              <div key={assignment.id} className="flex items-center justify-between gap-2">
                                <span className="text-gray-700">{assignment.event.name}</span>
                                <button
                                  onClick={() => handleRemoveAssignment(staff.id, assignment.eventId)}
                                  className="text-red-600 hover:text-red-800 text-xs"
                                >
                                  Remove
                                </button>
                              </div>
                            ))
                          ) : (
                            <span className="text-gray-400 text-xs">Not assigned</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <span className="text-xs">ID: {staff.id.slice(0, 8)}...</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'create' && (
          <div className="bg-white rounded-lg shadow p-6 max-w-2xl">
            <form onSubmit={handleCreateStaff} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">First Name</label>
                <input
                  type="text"
                  value={createForm.firstName}
                  onChange={e => setCreateForm({ ...createForm, firstName: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Last Name</label>
                <input
                  type="text"
                  value={createForm.lastName}
                  onChange={e => setCreateForm({ ...createForm, lastName: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Email</label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={e => setCreateForm({ ...createForm, email: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Phone</label>
                <input
                  type="tel"
                  value={createForm.phone}
                  onChange={e => setCreateForm({ ...createForm, phone: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Password</label>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={e => setCreateForm({ ...createForm, password: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Min 8 characters"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Role</label>
                <select
                  value={createForm.role}
                  onChange={e => setCreateForm({ ...createForm, role: e.target.value as any })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="VOLUNTEER">Volunteer</option>
                  <option value="COORDINATOR">Coordinator</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition"
              >
                Create Staff User
              </button>
            </form>
          </div>
        )}

        {activeTab === 'assign' && (
          <div className="bg-white rounded-lg shadow p-6 max-w-2xl">
            <form onSubmit={handleAssignStaff} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Select Staff</label>
                <select
                  value={assignForm.userId}
                  onChange={e => setAssignForm({ ...assignForm, userId: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">-- Choose a staff member --</option>
                  {staffUsers.map(staff => (
                    <option key={staff.id} value={staff.id}>
                      {staff.firstName} {staff.lastName} ({staff.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Select Event</label>
                <select
                  value={assignForm.eventId}
                  onChange={e => setAssignForm({ ...assignForm, eventId: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">-- Choose an event --</option>
                  {events.map(event => (
                    <option key={event.id} value={event.id}>
                      {event.name}
                    </option>
                  ))}
                </select>
              </div>

              {assignForm.userId && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    Staff Role: <span className="font-bold">{staffUsers.find(s => s.id === assignForm.userId)?.role}</span>
                  </p>
                  <p className="text-xs text-blue-600 mt-1 italic">
                    The role is automatically determined by the staff member's profile.
                  </p>
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition"
              >
                Assign to Event
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
