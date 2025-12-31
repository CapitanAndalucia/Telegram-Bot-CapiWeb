export interface ExerciseMedia {
    id: number;
    media_type: 'image' | 'video';
    file: string;
    order: number;
}

export interface Exercise {
    id: number;
    name: string;
    description?: string;
    default_sets: number;
    default_reps: number;
    default_weight: number;
    media: ExerciseMedia[];
}

export interface RoutineExercise {
    id: number;
    exercise: number;
    exercise_detail: Exercise;
    order: number;
    target_sets: number;
    target_reps: number;
    target_weight: number;
    rest_seconds: number;
    note?: string;
    sets?: ExerciseSet[];
    day_label?: string;
}

export interface RoutineDay {
    id: number;
    day_of_week: number;
    day_label: string;
    title?: string;
    order: number;
    is_completed: boolean;
    routine_exercises: RoutineExercise[];
}

export interface Routine {
    id: number;
    title: string;
    goal?: string;
    created_at: string;
    updated_at: string;
    days: RoutineDay[];
}

export interface ExerciseSet {
    id: number;
    routine_exercise: number;
    reps: number;
    weight: number;
    note?: string;
    media?: string | null;
    performed_at: string;
}

export interface ExerciseProgressPoint {
    day: string;
    total_reps: number;
    max_reps: number;
    avg_weight: number;
    max_weight: number;
}









