import { Routes } from '@angular/router';
import { tasksServicesProviders } from './tasks-service.providers';

export const TASKS_ROUTES: Routes = [
  { path: '', redirectTo: 'list', pathMatch: 'full' },
  {
    path: 'list',
    loadComponent: () =>
      import('./presentation/list/tasks-list.component').then((m) => m.TasksListComponent),
    providers: [tasksServicesProviders()],
  },
  {
    path: 'create',
    loadComponent: () =>
      import('./presentation/create/task-create.component').then((m) => m.TaskCreateComponent),
    providers: [tasksServicesProviders()],
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./presentation/detail/task-detail.component').then((m) => m.TaskDetailComponent),
    providers: [tasksServicesProviders()],
  },
];
