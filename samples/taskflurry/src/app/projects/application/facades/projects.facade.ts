import { inject, Injectable, Signal } from '@angular/core';
import { Loading, ResourceState, SkipIfCached, syncToStore } from 'flurryx';

import { Project } from '../../domain/models/project.model';
import { PROJECTS_STORE } from '../store/projects.store';
import { GetProjectsUseCase } from '../use-cases/get-projects.use-case';
import { GetProjectTasksUseCase } from '../use-cases/get-project-tasks.use-case';
import { DeleteProjectTaskUseCase } from '../use-cases/delete-project-task.use-case';
import { SnackbarService } from '../../../core/snackbar/snackbar.service';

@Injectable()
export class ProjectsFacade {
  readonly store = inject(PROJECTS_STORE);
  private readonly getProjectsUseCase = inject(GetProjectsUseCase);
  private readonly getProjectTasksUseCase = inject(GetProjectTasksUseCase);
  private readonly deleteProjectTaskUseCase = inject(DeleteProjectTaskUseCase);
  private readonly snackbar = inject(SnackbarService);

  getAllProjects(): Signal<ResourceState<Project[]>> {
    return this.store.get('PROJECTS');
  }

  getSelectedProject(): Signal<ResourceState<Project>> {
    return this.store.get('SELECTED_PROJECT');
  }

  getAllTasks() {
    return this.store.get('TASKS');
  }

  @SkipIfCached('PROJECTS', (instance) => instance.store)
  @Loading('PROJECTS', (instance) => instance.store)
  loadProjects(): void {
    this.getProjectsUseCase.execute().pipe(syncToStore(this.store, 'PROJECTS')).subscribe();
  }

  @Loading('TASKS', (instance) => instance.store)
  loadTasks(): void {
    this.getProjectTasksUseCase.execute().pipe(syncToStore(this.store, 'TASKS')).subscribe();
  }

  selectProject(project: Project): void {
    this.store.update('SELECTED_PROJECT', {
      data: project,
      isLoading: false,
      status: 'Success',
    });
  }

  clearSelection(): void {
    this.store.clear('SELECTED_PROJECT');
  }

  deleteTask(taskId: string): void {
    this.deleteProjectTaskUseCase.execute(taskId).subscribe({
      next: () => {
        this.store.clear('TASKS');
        this.loadTasks();
        this.snackbar.show('Task deleted successfully', 'success');
      },
      error: () => {
        this.snackbar.show('Failed to delete task. Please try again.', 'error');
      },
    });
  }
}
