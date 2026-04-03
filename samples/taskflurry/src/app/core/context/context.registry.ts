import { Provider } from '@angular/core';

import { PROJECTS_CONTEXT_PROVIDERS } from './projects-context.providers';
import { TASKS_CONTEXT_PROVIDERS } from './tasks-context.providers';

export enum AppContext {
  PROJECTS = 'projects',
  TASKS = 'tasks',
}

export const CONTEXT_REGISTRY: Record<AppContext, Provider[]> = {
  projects: PROJECTS_CONTEXT_PROVIDERS,
  tasks: TASKS_CONTEXT_PROVIDERS,
};

export function contextProvidersFor(contexts: AppContext[]): Provider[] {
  return contexts.flatMap((ctx) => CONTEXT_REGISTRY[ctx] ?? []);
}
