import { z } from 'zod'

export const WorkoutExerciseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sets: z.number().int().min(1),
  reps: z.number().int().min(1),
  weight: z.number().min(0).nullable(),
})

export const WorkoutSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  startedAt: z.date(),
  endedAt: z.date().nullable(),
  durationMinutes: z.number().min(0),
  exercises: z.array(WorkoutExerciseSchema),
  notes: z.string().optional(),
})

export const CreateWorkoutSchema = WorkoutSchema.omit({
  id: true,
})

export type WorkoutExercise = z.infer<typeof WorkoutExerciseSchema>
export type Workout = z.infer<typeof WorkoutSchema>
export type CreateWorkout = z.infer<typeof CreateWorkoutSchema>
