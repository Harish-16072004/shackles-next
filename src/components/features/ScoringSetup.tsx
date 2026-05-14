'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createMarkingCriteria } from '@/server/actions/marking'

interface ScoringSetupProps {
  eventId: string
  eventName: string
  onSaved?: () => void
}

interface Component {
  uid: string
  id?: string
  name: string
  description?: string
  weightPercentage: number
  maxMarksForComponent: number
  order: number
}

export function ScoringSetup({ eventId, eventName, onSaved }: ScoringSetupProps) {
  const [loading, setLoading] = useState(false)
  const [criteria, setCriteria] = useState({
    name: 'Default Marking Criteria',
    description: '',
    maxMarks: 100,
    numberOfJudges: 3,
  })
  const [components, setComponents] = useState<Component[]>([
  { uid: 'c0', name: 'Innovation', description: 'Originality and creativity', weightPercentage: 25, maxMarksForComponent: 25, order: 0 },
  { uid: 'c1', name: 'Presentation', description: 'Clarity and organization', weightPercentage: 25, maxMarksForComponent: 25, order: 1 },
  { uid: 'c2', name: 'Implementation', description: 'Feasibility and execution', weightPercentage: 25, maxMarksForComponent: 25, order: 2 },
  { uid: 'c3', name: 'Impact', description: 'Relevance and significance', weightPercentage: 25, maxMarksForComponent: 25, order: 3 },
])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const totalWeight = components.reduce((sum, c) => sum + c.weightPercentage, 0)

  const handleAddComponent = () => {
    const newComponent: Component = {
      uid: `c${Date.now()}`,
      name: 'New Component',
      weightPercentage: 0,
      maxMarksForComponent: 10,
      order: Math.max(...components.map(c => c.order), -1) + 1,
    }
    setComponents([...components, newComponent])
  }

  const handleRemoveComponent = (uid: string) => {
  setComponents(components.filter(c => c.uid !== uid))
}
  
  const handleComponentChange = (uid: string, field: string, value: any) => {
  setComponents(components.map(c => c.uid === uid ? { ...c, [field]: value } : c))
  }

  const handleSubmit = async () => {
    setError('')
    setSuccess('')

    // Validation
    const sumOfComponentMax = components.reduce((s, c) => s + c.maxMarksForComponent, 0)
    if (sumOfComponentMax !== criteria.maxMarks) {
     setError(`Component max marks sum (${sumOfComponentMax}) must equal Total Max Marks (${criteria.maxMarks})`)
     return
    }

    if (totalWeight !== 100) {
      setError(`Component weights must sum to 100% (currently ${totalWeight}%)`)
      return
    }

    if (components.length === 0) {
      setError('At least one component is required')
      return
    }

    setLoading(true)

    try {
      const response = await createMarkingCriteria({
        eventId,
        ...criteria,
        components: components.map(({ uid, ...rest }) => rest),
      })

      if (!response.success) {
        setError(response.error || 'Failed to create criteria')
        return
      }

      setSuccess(response.message || 'Criteria created')
      onSaved?.()
    } catch (err) {
      setError('Network error')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Marking Criteria for {eventName}</CardTitle>
          <CardDescription>
            Set up scoring criteria and components for judging
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Criteria Details */}
          <div className="grid gap-4">
            <div>
              <label className="text-sm font-medium">Criteria Name</label>
              <Input
                value={criteria.name}
                onChange={e => setCriteria({ ...criteria, name: e.target.value })}
                placeholder="e.g., Innovation Challenge Scoring"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Input
                value={criteria.description}
                onChange={e => setCriteria({ ...criteria, description: e.target.value })}
                placeholder="Optional description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Max Total Marks</label>
                <Input
                  type="number"
                  value={criteria.maxMarks}
                  onChange={e => setCriteria({ ...criteria, maxMarks: parseInt(e.target.value) || 0 })}
                  min={1}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Number of Judges</label>
                <Input
                  type="number"
                  value={criteria.numberOfJudges}
                  onChange={e => setCriteria({ ...criteria, numberOfJudges: parseInt(e.target.value) || 0 })}
                  min={1}
                />
              </div>
            </div>
          </div>

          {/* Components */}
          <div className="border-t pt-4">
            <h3 className="font-semibold mb-4">Scoring Components</h3>
            <div className="space-y-4">
              {components.map((comp, idx) => (
                <Card key={comp.uid} className="bg-slate-50">
                  <CardContent className="pt-4">
                    <div className="grid gap-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium">Name</label>
                          <Input
                            value={comp.name}
                            onChange={e => handleComponentChange(comp.uid, 'name', e.target.value)}
                            placeholder="Component name"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium">Order</label>
                          <Input
                            type="number"
                            value={comp.order}
                            onChange={e => handleComponentChange(comp.uid, 'order', parseInt(e.target.value) || 0)}
                            min={0}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium">Description</label>
                        <Input
                          value={comp.description || ''}
                          onChange={e => handleComponentChange(comp.uid, 'description', e.target.value)}
                          placeholder="What does this component measure?"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium">Weight %</label>
                          <Input
                            type="number"
                            value={comp.weightPercentage}
                            onChange={e => handleComponentChange(comp.uid, 'weightPercentage', parseFloat(e.target.value) || 0)}
                            min={0}
                            max={100}
                            step={0.01}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium">Max Marks</label>
                          <Input
                            type="number"
                            value={comp.maxMarksForComponent}
                            onChange={e => handleComponentChange(comp.uid, 'maxMarksForComponent', parseInt(e.target.value) || 0)}
                            min={1}
                          />
                        </div>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleRemoveComponent(comp.uid)}
                      >
                        Remove Component
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Button
              variant="outline"
              onClick={handleAddComponent}
              className="w-full mt-4"
            >
              + Add Component
            </Button>

            <div className={`mt-4 p-3 rounded text-sm ${
              totalWeight === 100 ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'
            }`}>
              Total Weight: {totalWeight.toFixed(2)}% (must be 100%)
            </div>
          </div>

          {/* Messages */}
          {error && <div className="bg-red-50 text-red-700 p-3 rounded text-sm">{error}</div>}
          {success && <div className="bg-green-50 text-green-700 p-3 rounded text-sm">{success}</div>}

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={loading || totalWeight !== 100 || components.length === 0}
            className="w-full"
          >
            {loading ? 'Creating Criteria...' : 'Create Marking Criteria'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
