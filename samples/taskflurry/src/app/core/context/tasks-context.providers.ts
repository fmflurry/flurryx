import { Provider } from '@angular/core';

import { getTasksProviders, deleteTaskProviders } from '../../tasks/public-api';

export const TASKS_CONTEXT_PROVIDERS: Provider[] = [
  ...getTasksProviders(),
  ...deleteTaskProviders(),
];
