import { Routes } from '@angular/router';

export const workoutRoutes: Routes = [
    {
        path: '',
        loadComponent: () => import('./components/routines-list/routines-list.component').then(m => m.RoutinesListComponent),
        data: { animation: 'RoutinesList' }
    },
    {
        path: 'routine/:id',
        loadComponent: () => import('./components/weekly-plan/weekly-plan.component').then(m => m.WeeklyPlanComponent),
        data: { animation: 'WeeklyPlan' }
    },
    {
        path: 'workout/:routineId/:dayId',
        loadComponent: () => import('./components/today-exercises/today-exercises.component').then(m => m.TodayExercisesComponent),
        data: { animation: 'TodayExercises' }
    },
    {
        path: 'exercise/:id',
        loadComponent: () => import('./components/exercise-detail/exercise-detail.component').then(m => m.ExerciseDetailComponent),
        data: { animation: 'ExerciseDetail' }
    },
    {
        path: 'create',
        loadComponent: () => import('./components/create-routine/create-routine.component').then(m => m.CreateRoutineComponent),
        data: { animation: 'CreateRoutine' }
    },
    {
        path: 'create/day/:dayIndex',
        loadComponent: () => import('./components/configure-day/configure-day.component').then(m => m.ConfigureDayComponent),
        data: { animation: 'ConfigureDay' }
    },
    {
        path: 'create/day/:dayIndex/add-exercise',
        loadComponent: () => import('./components/add-exercise/add-exercise.component').then(m => m.AddExerciseComponent),
        data: { animation: 'AddExercise' }
    }
];
