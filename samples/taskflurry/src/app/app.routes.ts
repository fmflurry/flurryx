import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'projects', pathMatch: 'full' },
  {
    path: 'projects',
    loadChildren: () => import('./projects/routes').then(m => m.PROJECTS_ROUTES),
  },
  {
    path: 'tasks',
    loadChildren: () => import('./tasks/routes').then(m => m.TASKS_ROUTES),
  },
];
