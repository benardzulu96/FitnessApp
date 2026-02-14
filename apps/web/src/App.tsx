import './style.css'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { z } from 'zod'

import type { CreateWorkout } from '@repo/shared/schemas'
import { CreateWorkoutSchema } from '@repo/shared/schemas'
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

type WorkoutFormValues = z.infer<typeof CreateWorkoutSchema>

export function App() {
  const [userId] = useState<string>(() => auth.currentUser?.uid ?? 'demo-user-uid')

  const form = useForm<WorkoutFormValues>({
    resolver: zodResolver(CreateWorkoutSchema),
    defaultValues: {
      userId,
      startedAt: new Date(),
      endedAt: null,
      durationMinutes: 0,
      exercises: [
        {
          id: crypto.randomUUID(),
          name: '',
          sets: 3,
          reps: 10,
          weight: null,
        },
      ],
      notes: '',
    },
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'exercises',
  })

  const createWorkout = useMutation({
    mutationFn: async (values: WorkoutFormValues) => {
      const startedAt = values.startedAt
      const endedAt = values.endedAt ?? new Date()
      const durationMinutes =
        values.durationMinutes ||
        Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000))

      const payload: Omit<CreateWorkout, 'startedAt' | 'endedAt'> & {
        startedAt: ReturnType<typeof serverTimestamp>
        endedAt: ReturnType<typeof serverTimestamp>
      } = {
        userId: values.userId,
        exercises: values.exercises,
        notes: values.notes,
        durationMinutes,
        startedAt: serverTimestamp(),
        endedAt: serverTimestamp(),
      }

      await addDoc(collection(db, 'workouts'), payload)
    },
  })

  const onSubmit = (values: WorkoutFormValues) => {
    createWorkout.mutate(values, {
      onSuccess: () => {
        form.reset({
          userId,
          startedAt: new Date(),
          endedAt: null,
          durationMinutes: 0,
          exercises: [
            {
              id: crypto.randomUUID(),
              name: '',
              sets: 3,
              reps: 10,
              weight: null,
            },
          ],
          notes: '',
        })
      },
    })
  }

  return (
    <div className="min-h-screen bg-background py-6 px-4">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <header className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">MY BENEFIT – Workout Logger</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Log exercises, sets, reps, and weight for each workout.
          </p>
        </header>

        <Card className="w-full">
          <CardHeader>
            <CardTitle>New Workout</CardTitle>
            <CardDescription>Mobile-friendly form for quick workout logging.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Input
                  id="notes"
                  placeholder="Upper body strength focus..."
                  {...form.register('notes')}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Exercises</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      append({
                        id: crypto.randomUUID(),
                        name: '',
                        sets: 3,
                        reps: 10,
                        weight: null,
                      })
                    }
                  >
                    Add exercise
                  </Button>
                </div>

                <div className="flex flex-col gap-3">
                  {fields.map((field, index) => (
                    <div key={field.id} className="rounded-lg border bg-card p-3 shadow-sm">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-xs">Exercise {index + 1}</Label>
                        {fields.length > 1 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => remove(index)}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </div>

                      <div className="mt-2 space-y-2">
                        <Input
                          placeholder="Bench Press"
                          {...form.register(`exercises.${index}.name`)}
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <Input
                            type="number"
                            min={1}
                            inputMode="numeric"
                            placeholder="Sets"
                            {...form.register(`exercises.${index}.sets`, {
                              valueAsNumber: true,
                            })}
                          />
                          <Input
                            type="number"
                            min={1}
                            inputMode="numeric"
                            placeholder="Reps"
                            {...form.register(`exercises.${index}.reps`, {
                              valueAsNumber: true,
                            })}
                          />
                          <Input
                            type="number"
                            min={0}
                            step="0.5"
                            inputMode="decimal"
                            placeholder="Weight"
                            {...form.register(`exercises.${index}.weight`, {
                              setValueAs: (value: string) => (value === '' ? null : Number(value)),
                            })}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="durationMinutes">Duration (minutes, optional)</Label>
                <Input
                  id="durationMinutes"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  placeholder="Auto-calculated if left empty"
                  {...form.register('durationMinutes', {
                    valueAsNumber: true,
                  })}
                />
              </div>

              <CardFooter className="flex flex-col gap-2 px-0">
                <Button type="submit" className="w-full" disabled={createWorkout.isPending}>
                  {createWorkout.isPending ? 'Saving...' : 'Save Workout'}
                </Button>
                {createWorkout.isError ? (
                  <p className="text-xs text-destructive">
                    Failed to save workout. Please try again.
                  </p>
                ) : null}
                {createWorkout.isSuccess ? (
                  <p className="text-xs text-emerald-600">Workout saved to Firestore.</p>
                ) : null}
              </CardFooter>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
