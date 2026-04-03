import { Store } from 'flurryx';

import { Project } from '../../domain/models/project.model';
import { ProjectTask } from '../../domain/models/project-task.model';

interface ProjectsStoreConfig {
  PROJECTS: Project[];
  SELECTED_PROJECT: Project;
  TASKS: ProjectTask[];
}

export const PROJECTS_STORE = Store.for<ProjectsStoreConfig>().build();
