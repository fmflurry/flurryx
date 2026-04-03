import { Store } from 'flurryx';

import { Project } from '../../domain/models/project.model';
import { ProjectTask } from '../../domain/models/project-task.model';

export const PROJECTS_STORE = Store.resource('PROJECTS')
  .as<Project[]>()
  .resource('SELECTED_PROJECT')
  .as<Project>()
  .resource('TASKS')
  .as<ProjectTask[]>()
  .build();
