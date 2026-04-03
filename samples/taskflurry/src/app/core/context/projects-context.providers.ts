import { Provider } from '@angular/core';

import { getProjectsProviders } from '../../projects/public-api';

export const PROJECTS_CONTEXT_PROVIDERS: Provider[] = [...getProjectsProviders()];
