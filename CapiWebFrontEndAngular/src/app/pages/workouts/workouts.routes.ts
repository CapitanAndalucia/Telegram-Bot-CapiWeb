import { Routes } from '@angular/router';
import { superUserGuard } from '../../guards/superuser.guard';

export const workoutRoutes: Routes = [
    {
        path: '',
        loadComponent: () => import('./components/routines-list/routines-list.component').then(m => m.RoutinesListComponent),
        data: { animation: 'RoutinesList' }
    },
    {
        path: 'routine/:slug',
        loadComponent: () => import('./components/weekly-plan/weekly-plan.component').then(m => m.WeeklyPlanComponent),
        data: { animation: 'WeeklyPlan' }
    },
    {
        path: 'workout/:routineSlug/:daySlug',
        loadComponent: () => import('./components/today-exercises/today-exercises.component').then(m => m.TodayExercisesComponent),
        data: { animation: 'TodayExercises' }
    },
    {
        path: 'exercise/:slug',
        loadComponent: () => import('./components/exercise-detail/exercise-detail.component').then(m => m.ExerciseDetailComponent),
        data: { animation: 'ExerciseDetail' }
    },
    {
        path: 'create',
        loadComponent: () => import('./components/create-routine/create-routine.component').then(m => m.CreateRoutineComponent),
        data: { animation: 'CreateRoutine' }
    },
    {
        path: 'edit/:slug',
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
    },
    // Edit Routes
    {
        path: 'routine/:routineSlug/day/:daySlug/edit',
        loadComponent: () => import('./components/configure-day/configure-day.component').then(m => m.ConfigureDayComponent),
        data: { animation: 'ConfigureDay' }
    },
    {
        path: 'routine/:routineSlug/day/:daySlug/add-exercise',
        loadComponent: () => import('./components/add-exercise/add-exercise.component').then(m => m.AddExerciseComponent),
        data: { animation: 'AddExercise' }
    },
    {
        path: 'routine/:routineSlug/day/:daySlug/exercise/:exerciseSlug/edit',
        loadComponent: () => import('./components/add-exercise/add-exercise.component').then(m => m.AddExerciseComponent),
        data: { animation: 'AddExercise' }
    },
    {
        path: 'motivation',
        canActivate: [superUserGuard],
        children: [
            {
                path: '',
                loadComponent: () => import('./motivation-admin/motivation-admin.component').then(m => m.MotivationAdminComponent)
            },
            {
                path: 'new',
                loadComponent: () => import('./motivation-admin/motivation-form/motivation-form.component').then(m => m.MotivationFormComponent)
            },
            {
                path: 'edit/:id',
                loadComponent: () => import('./motivation-admin/motivation-form/motivation-form.component').then(m => m.MotivationFormComponent)
            }
        ]
    },
    {
        path: 'profile',
        loadComponent: () => import('./components/workout-profile/workout-profile.component').then(m => m.WorkoutProfileComponent),
        data: { animation: 'WorkoutProfile' }
    }
];

