import { EXERCISE_CATEGORIES } from "./constants";

export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];

export type ExerciseStatus = "YES" | "SUB" | "NO";

export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  status: ExerciseStatus;
  isCustom: boolean;
  createdAt: Date;
}

export interface SessionFormSet {
  reps: string;
  weight: string;
}

export interface SessionFormExercise {
  id: string;
  exercise_id: string;
  exercise_name: string;
  sets: SessionFormSet[];
  rpe: string;
  notes: string;
}
