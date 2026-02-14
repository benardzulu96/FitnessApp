import './style.css'

import { zodResolver } from '@hookform/resolvers/zod'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
// zod imported in schema files; not used directly here

import type { CreateWorkout, WorkoutExercise } from '@repo/shared/schemas'
import { CreateWorkoutSchema } from '@repo/shared/schemas'
import type { DocumentData } from 'firebase/firestore'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@repo/ui'
import { auth, db } from './lib/firebase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

type WorkoutDocument = Omit<CreateWorkout, 'startedAt' | 'endedAt'> & {
  id: string
  startedAt: Date | null
  endedAt: Date | null
  workoutType: 'Cardio' | 'Strength' | 'Flexibility' | 'Sports'
  intensity: 'Light' | 'Moderate' | 'Hard' | 'Very Hard'
  location: 'Gym' | 'Home' | 'Outdoor'
  mood: 'Energized' | 'Normal' | 'Tired' | 'Exhausted'
  caloriesBurned?: number
  personalRecords: string[]
}

function toClientWorkout(id: string, data: DocumentData): WorkoutDocument {
  const startedAt = data.startedAt?.toDate
    ? data.startedAt.toDate()
    : (data.startedAt as Date) ?? null
  const endedAt = data.endedAt?.toDate ? data.endedAt.toDate() : (data.endedAt as Date) ?? null

  return {
    id,
    userId: String(data.userId ?? ''),
    workoutType: String(data.workoutType ?? 'Strength') as WorkoutDocument['workoutType'],
    intensity: String(data.intensity ?? 'Moderate') as WorkoutDocument['intensity'],
    location: String(data.location ?? 'Gym') as WorkoutDocument['location'],
    mood: String(data.mood ?? 'Normal') as WorkoutDocument['mood'],
    caloriesBurned: data.caloriesBurned == null ? undefined : Number(data.caloriesBurned),
    personalRecords: (data.personalRecords as string[]) ?? [],
    exercises: (data.exercises as WorkoutExercise[]) ?? [],
    notes: String(data.notes ?? ''),
    durationMinutes: Number(data.durationMinutes ?? 0),
    startedAt,
    endedAt,
  }
}

export function App() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editing, setEditing] = useState<WorkoutDocument | null>(null)
  const [deleting, setDeleting] = useState<WorkoutDocument | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [createPRText, setCreatePRText] = useState('')
  const [editPRText, setEditPRText] = useState('')

  const { data: workouts = [], isLoading } = useQuery<WorkoutDocument[]>({
    queryKey: ['workouts'],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'workouts'))
      return snap.docs.map(d => toClientWorkout(d.id, d.data()))
    },
    refetchOnWindowFocus: false,
  })

  // Real-time subscription -> update React Query cache
  useEffect(() => {
    const q = collection(db, 'workouts')
    const unsub = onSnapshot(q, snap => {
      const items = snap.docs.map(d => toClientWorkout(d.id, d.data()))
      queryClient.setQueryData(['workouts'], items)
    })
    return () => unsub()
  }, [queryClient])

  const createMutation = useMutation<void, unknown, CreateWorkout>({
    mutationFn: async values => {
      await addDoc(collection(db, 'workouts'), { ...values, createdAt: serverTimestamp() })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workouts'] })
      setIsCreateOpen(false)
      setToast({ type: 'success', message: 'Workout created' })
    },
    onError: (e: unknown) =>
      setToast({ type: 'error', message: (e as Error)?.message ?? 'Create failed' }),
  })

  const updateMutation = useMutation<void, unknown, { id: string; values: CreateWorkout }>({
    mutationFn: async ({ id, values }) => {
      await updateDoc(doc(db, 'workouts', id), values)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workouts'] })
      setEditing(null)
      setToast({ type: 'success', message: 'Workout updated' })
    },
    onError: (e: unknown) =>
      setToast({ type: 'error', message: (e as Error)?.message ?? 'Update failed' }),
  })

  const deleteMutation = useMutation<void, unknown, string>({
    mutationFn: async id => {
      await deleteDoc(doc(db, 'workouts', id))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workouts'] })
      setDeleting(null)
      setToast({ type: 'success', message: 'Workout deleted' })
    },
    onError: (e: unknown) =>
      setToast({ type: 'error', message: (e as Error)?.message ?? 'Delete failed' }),
  })

  // Filtered results based on search
  const filtered = useMemo((): WorkoutDocument[] => {
    const q = search.trim().toLowerCase()
    if (!q) return workouts
    return workouts.filter((w: WorkoutDocument) => {
      if (w.notes?.toLowerCase().includes(q)) return true
      if (
        w.exercises?.some((e: WorkoutExercise) =>
          String(e.name ?? '')
            .toLowerCase()
            .includes(q)
        )
      )
        return true
      return false
    })
  }, [workouts, search])

  // Create form (modal)
  const createForm = useForm<CreateWorkout>({
    resolver: zodResolver(CreateWorkoutSchema),
    defaultValues: {
      userId: auth.currentUser?.uid ?? 'demo-user-uid',
      startedAt: new Date(),
      endedAt: null,
      durationMinutes: 0,
      exercises: [{ id: crypto.randomUUID(), name: '', sets: 3, reps: 10, weight: null }],
      notes: '',
      workoutType: 'Strength',
      intensity: 'Moderate',
      location: 'Gym',
      mood: 'Normal',
      caloriesBurned: undefined,
      personalRecords: [],
    },
  })

  const {
    fields: createFields,
    append: createAppend,
    remove: createRemove,
  } = useFieldArray({
    control: createForm.control,
    name: 'exercises',
  })

  const onCreateSubmit = (values: CreateWorkout) => {
    const prs = createPRText
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    const payload: CreateWorkout = {
      ...values,
      personalRecords: prs,
    }
    createMutation.mutate(payload)
  }

  // Edit form
  const editForm = useForm<CreateWorkout>({ resolver: zodResolver(CreateWorkoutSchema) })
  const {
    fields: editFields,
    append: editAppend,
    remove: editRemove,
  } = useFieldArray({
    control: editForm.control,
    name: 'exercises',
  })

  useEffect(() => {
    if (editing) {
      // convert editing document to CreateWorkout shape for the form
      const editValues: CreateWorkout = {
        userId: editing.userId,
        startedAt: editing.startedAt ?? new Date(),
        endedAt: editing.endedAt ?? null,
        durationMinutes: editing.durationMinutes,
        exercises: (editing.exercises ?? []) as WorkoutExercise[],
        notes: editing.notes ?? '',
        workoutType: editing.workoutType,
        intensity: editing.intensity,
        location: editing.location,
        mood: editing.mood,
        caloriesBurned: editing.caloriesBurned,
        personalRecords: editing.personalRecords ?? [],
      }

      editForm.reset(editValues)
      setEditPRText((editing.personalRecords ?? []).join(', '))
    }
  }, [editing])

  const onEditSubmit = (values: CreateWorkout) => {
    if (!editing) return
    const prs = editPRText
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    const payload: CreateWorkout = {
      ...values,
      personalRecords: prs,
    }
    updateMutation.mutate({ id: editing.id, values: payload })
  }

  // Delete confirmation
  const confirmDelete = (id: string) => deleteMutation.mutate(id)

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  return (
    <div className="min-h-screen bg-background p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search workouts..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-64"
            />
          </div>
          <Button onClick={() => setIsCreateOpen(true)}>Add New</Button>
        </div>
      </header>

      <main>
        <Card>
          <CardHeader>
            <CardTitle>Workouts</CardTitle>
            <CardDescription>Manage workouts stored in Firestore</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-8 text-center">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No workouts found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full table-auto">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Intensity</th>
                      <th className="px-3 py-2">Location</th>
                      <th className="px-3 py-2">Calories</th>
                      <th className="px-3 py-2">Notes</th>
                      <th className="px-3 py-2">Exercises</th>
                      <th className="px-3 py-2">PRs</th>
                      <th className="px-3 py-2">Duration</th>
                      <th className="px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(w => (
                      <tr key={w.id} className="border-t">
                        <td className="px-3 py-2 align-top">{w.workoutType}</td>
                        <td className="px-3 py-2 align-top">{w.intensity}</td>
                        <td className="px-3 py-2 align-top">{w.location}</td>
                        <td className="px-3 py-2 align-top">{w.caloriesBurned ?? '—'}</td>
                        <td className="px-3 py-2 align-top">
                          <div className="max-w-xs truncate">{w.notes || '—'}</div>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="text-sm">
                            {w.exercises?.map((e: WorkoutExercise, i: number) => (
                              <div key={e.id ?? i} className="text-xs text-muted-foreground">
                                {e.name || 'Unnamed'} — {e.sets}×{e.reps}{' '}
                                {e.weight ? `@ ${e.weight}` : ''}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="text-sm">
                            {(w.personalRecords ?? []).length === 0 ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              (w.personalRecords ?? []).map((pr, i) => (
                                <div key={i} className="text-xs text-muted-foreground">
                                  {pr}
                                </div>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top">{w.durationMinutes ?? '—'}</td>
                        <td className="px-3 py-2 align-top">
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => setEditing(w)}>
                              Edit
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => setDeleting(w)}>
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
          <CardFooter />
        </Card>
      </main>

      {/* Create Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-2xl rounded-lg bg-background p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">New Workout</h2>
              <Button variant="ghost" onClick={() => setIsCreateOpen(false)}>
                Close
              </Button>
            </div>

            <form className="mt-4 space-y-4" onSubmit={createForm.handleSubmit(onCreateSubmit)}>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Input id="notes" placeholder="Notes" {...createForm.register('notes')} />
              </div>

              <div className="space-y-2">
                <Label>Exercises</Label>
                <div className="space-y-3">
                  {createFields.map((field, index) => (
                    <div key={field.id} className="flex gap-2">
                      <Input
                        placeholder="Name"
                        {...createForm.register(`exercises.${index}.name` as const)}
                      />
                      <Input
                        type="number"
                        placeholder="Sets"
                        {...createForm.register(`exercises.${index}.sets` as const, {
                          valueAsNumber: true,
                        })}
                      />
                      <Input
                        type="number"
                        placeholder="Reps"
                        {...createForm.register(`exercises.${index}.reps` as const, {
                          valueAsNumber: true,
                        })}
                      />
                      <Button type="button" variant="ghost" onClick={() => createRemove(index)}>
                        Remove
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      createAppend({
                        id: crypto.randomUUID(),
                        name: '',
                        sets: 3,
                        reps: 10,
                        weight: null,
                      })
                    }
                  >
                    Add Exercise
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="workoutType">Workout Type</Label>
                  <select
                    className="block w-full rounded-md border px-3 py-2"
                    {...editForm.register('workoutType')}
                  >
                    <option value="Cardio">Cardio</option>
                    <option value="Strength">Strength</option>
                    <option value="Flexibility">Flexibility</option>
                    <option value="Sports">Sports</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="intensity">Intensity</Label>
                  <select
                    className="block w-full rounded-md border px-3 py-2"
                    {...editForm.register('intensity')}
                  >
                    <option value="Light">Light</option>
                    <option value="Moderate">Moderate</option>
                    <option value="Hard">Hard</option>
                    <option value="Very Hard">Very Hard</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="location">Location</Label>
                  <select
                    className="block w-full rounded-md border px-3 py-2"
                    {...editForm.register('location')}
                  >
                    <option value="Gym">Gym</option>
                    <option value="Home">Home</option>
                    <option value="Outdoor">Outdoor</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="mood">Mood</Label>
                  <select
                    className="block w-full rounded-md border px-3 py-2"
                    {...editForm.register('mood')}
                  >
                    <option value="Energized">Energized</option>
                    <option value="Normal">Normal</option>
                    <option value="Tired">Tired</option>
                    <option value="Exhausted">Exhausted</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="caloriesBurned">Calories Burned</Label>
                  <Input
                    type="number"
                    {...editForm.register('caloriesBurned', { valueAsNumber: true })}
                  />
                </div>

                <div>
                  <Label>Personal Records (comma-separated)</Label>
                  <Input value={editPRText} onChange={e => setEditPRText(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="workoutType">Workout Type</Label>
                  <select
                    className="block w-full rounded-md border px-3 py-2"
                    {...createForm.register('workoutType')}
                  >
                    <option value="Cardio">Cardio</option>
                    <option value="Strength">Strength</option>
                    <option value="Flexibility">Flexibility</option>
                    <option value="Sports">Sports</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="intensity">Intensity</Label>
                  <select
                    className="block w-full rounded-md border px-3 py-2"
                    {...createForm.register('intensity')}
                  >
                    <option value="Light">Light</option>
                    <option value="Moderate">Moderate</option>
                    <option value="Hard">Hard</option>
                    <option value="Very Hard">Very Hard</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="location">Location</Label>
                  <select
                    className="block w-full rounded-md border px-3 py-2"
                    {...createForm.register('location')}
                  >
                    <option value="Gym">Gym</option>
                    <option value="Home">Home</option>
                    <option value="Outdoor">Outdoor</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="mood">Mood</Label>
                  <select
                    className="block w-full rounded-md border px-3 py-2"
                    {...createForm.register('mood')}
                  >
                    <option value="Energized">Energized</option>
                    <option value="Normal">Normal</option>
                    <option value="Tired">Tired</option>
                    <option value="Exhausted">Exhausted</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="caloriesBurned">Calories Burned</Label>
                  <Input
                    type="number"
                    {...createForm.register('caloriesBurned', { valueAsNumber: true })}
                  />
                </div>

                <div>
                  <Label>Personal Records (comma-separated)</Label>
                  <Input value={createPRText} onChange={e => setCreatePRText(e.target.value)} />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button type="submit" disabled={createMutation.status === 'pending'}>
                  {createMutation.status === 'pending' ? 'Saving…' : 'Create'}
                </Button>
                <Button variant="ghost" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-2xl rounded-lg bg-background p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Edit Workout</h2>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Close
              </Button>
            </div>

            <form className="mt-4 space-y-4" onSubmit={editForm.handleSubmit(onEditSubmit)}>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Input id="notes" placeholder="Notes" {...editForm.register('notes')} />
              </div>

              <div className="space-y-2">
                <Label>Exercises</Label>
                <div className="space-y-3">
                  {editFields.map((field, index) => (
                    <div key={field.id} className="flex gap-2">
                      <Input
                        placeholder="Name"
                        {...editForm.register(`exercises.${index}.name` as const)}
                      />
                      <Input
                        type="number"
                        placeholder="Sets"
                        {...editForm.register(`exercises.${index}.sets` as const, {
                          valueAsNumber: true,
                        })}
                      />
                      <Input
                        type="number"
                        placeholder="Reps"
                        {...editForm.register(`exercises.${index}.reps` as const, {
                          valueAsNumber: true,
                        })}
                      />
                      <Button type="button" variant="ghost" onClick={() => editRemove(index)}>
                        Remove
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      editAppend({
                        id: crypto.randomUUID(),
                        name: '',
                        sets: 3,
                        reps: 10,
                        weight: null,
                      })
                    }
                  >
                    Add Exercise
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button type="submit" disabled={updateMutation.status === 'pending'}>
                  {updateMutation.status === 'pending' ? 'Saving…' : 'Save'}
                </Button>
                <Button variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg bg-background p-6 shadow-lg">
            <h3 className="text-lg font-semibold">Confirm Delete</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Are you sure you want to delete this workout?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => confirmDelete(deleting.id)}
                disabled={deleteMutation.status === 'pending'}
              >
                {deleteMutation.status === 'pending' ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed right-6 top-6 z-50 rounded-md px-4 py-2 ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}
        >
          {toast.message}
        </div>
      )}
    </div>
  )
}

export default App
