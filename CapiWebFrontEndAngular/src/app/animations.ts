import { trigger, transition, style, query, animateChild, group, animate } from '@angular/animations';

export const slideInAnimation =
    trigger('routeAnimations', [
        // Level 1 (List) => Level 2 (Detail/Create) : Slide Left (Enter)
        transition('RoutinesList => WeeklyPlan, RoutinesList => CreateRoutine, RoutinesList => EditRoutine', [
            style({ position: 'relative' }),
            query(':enter, :leave', [
                style({
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%'
                })
            ], { optional: true }),
            query(':enter', [
                style({ transform: 'translateX(100%)', opacity: 0 })
            ], { optional: true }),
            query(':leave', animateChild(), { optional: true }),
            group([
                query(':leave', [
                    animate('300ms cubic-bezier(0.35, 0, 0.25, 1)', style({ transform: 'translateX(-20%)', opacity: 0 }))
                ], { optional: true }),
                query(':enter', [
                    animate('300ms cubic-bezier(0.35, 0, 0.25, 1)', style({ transform: 'translateX(0%)', opacity: 1 }))
                ], { optional: true })
            ]),
            query(':enter', animateChild(), { optional: true }),
        ]),

        // Level 2 => Level 1 : Slide Right (Back)
        transition('WeeklyPlan => RoutinesList, CreateRoutine => RoutinesList, EditRoutine => RoutinesList', [
            style({ position: 'relative' }),
            query(':enter, :leave', [
                style({
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%'
                })
            ], { optional: true }),
            query(':enter', [
                style({ transform: 'translateX(-20%)', opacity: 0 })
            ], { optional: true }),
            query(':leave', animateChild(), { optional: true }),
            group([
                query(':leave', [
                    animate('300ms cubic-bezier(0.35, 0, 0.25, 1)', style({ transform: 'translateX(100%)', opacity: 0 }))
                ], { optional: true }),
                query(':enter', [
                    animate('300ms cubic-bezier(0.35, 0, 0.25, 1)', style({ transform: 'translateX(0%)', opacity: 1 }))
                ], { optional: true })
            ]),
            query(':enter', animateChild(), { optional: true }),
        ]),

        // Drill Down (generic deeper)
        transition('WeeklyPlan => TodayExercises, WeeklyPlan => ConfigureDay, WeeklyPlan => ExerciseDetail, WeeklyPlan => CreateRoutine, CreateRoutine => ConfigureDay, ConfigureDay => AddExercise, TodayExercises => ExerciseDetail, ExerciseDetail => AddExercise', [
            style({ position: 'relative' }),
            query(':enter, :leave', [
                style({
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%'
                })
            ], { optional: true }),
            query(':enter', [
                style({ transform: 'translateX(100%)', opacity: 0 })
            ], { optional: true }),
            query(':leave', animateChild(), { optional: true }),
            group([
                query(':leave', [
                    animate('200ms cubic-bezier(0.35, 0, 0.25, 1)', style({ transform: 'translateX(-15%)', opacity: 0 }))
                ], { optional: true }),
                query(':enter', [
                    animate('200ms cubic-bezier(0.35, 0, 0.25, 1)', style({ transform: 'translateX(0%)', opacity: 1 }))
                ], { optional: true })
            ]),
            query(':enter', animateChild(), { optional: true }),
        ]),

        // Drill Up (generic back)
        transition('TodayExercises => WeeklyPlan, ConfigureDay => WeeklyPlan, ExerciseDetail => WeeklyPlan, CreateRoutine => WeeklyPlan, ConfigureDay => CreateRoutine, AddExercise => ConfigureDay, ExerciseDetail => TodayExercises, AddExercise => ExerciseDetail', [
            style({ position: 'relative' }),
            query(':enter, :leave', [
                style({
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%'
                })
            ], { optional: true }),
            query(':enter', [
                style({ transform: 'translateX(-15%)', opacity: 0 })
            ], { optional: true }),
            query(':leave', animateChild(), { optional: true }),
            group([
                query(':leave', [
                    animate('200ms cubic-bezier(0.35, 0, 0.25, 1)', style({ transform: 'translateX(100%)', opacity: 0 }))
                ], { optional: true }),
                query(':enter', [
                    animate('200ms cubic-bezier(0.35, 0, 0.25, 1)', style({ transform: 'translateX(0%)', opacity: 1 }))
                ], { optional: true })
            ]),
            query(':enter', animateChild(), { optional: true }),
        ]),

        // Fallback for everything else (simple fade - should rarely trigger now)
        transition('* <=> *', [
            style({ position: 'relative' }),
            query(':enter, :leave', [
                style({
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%'
                })
            ], { optional: true }),
            query(':enter', [
                style({ opacity: 0 })
            ], { optional: true }),
            query(':leave', animateChild(), { optional: true }),
            group([
                query(':leave', [
                    animate('150ms ease-out', style({ opacity: 0 }))
                ], { optional: true }),
                query(':enter', [
                    animate('150ms ease-out', style({ opacity: 1 }))
                ], { optional: true }),
            ]),
            query(':enter', animateChild(), { optional: true }),
        ])
    ]);
