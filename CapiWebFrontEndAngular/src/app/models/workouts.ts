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
    short_id: string;
    slug: string;
    url_slug: string;
    exercise: number;
    exercise_detail: Exercise;
    order: number;
    target_sets: number;
    target_reps: number;
    target_weight: number;
    rest_seconds: number;

    note?: string;
    icon?: string;
    custom_name?: string;
    sets?: ExerciseSet[];
    day_label?: string;
    routine_id?: number;
    routine_short_id?: string;
    routine_slug?: string;
    routine_url_slug?: string;
    routine_day_id?: number;
    routine_day_short_id?: string;
    routine_day_slug?: string;
    routine_day_url_slug?: string;
    // Variant support
    variant_of?: number | null;
    is_active_variant?: boolean;
    variants?: RoutineExercise[];
}

export interface RoutineDay {
    id: number;
    short_id: string;
    slug: string;
    url_slug: string;
    day_of_week: number;
    day_label: string;
    title?: string;
    order: number;
    is_completed: boolean;
    routine_exercises: RoutineExercise[];
}

export interface Routine {
    id: number;
    short_id: string;
    slug: string;
    url_slug: string;
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









export interface MotivationalImage {
    id: number;
    image: string;
    description: string;
    group: 'welcome' | 'daily_first' | 'routine_complete' | 'user_return';
    group_display?: string;
    created_at: string;
    is_active: boolean;
    order: number;
}
