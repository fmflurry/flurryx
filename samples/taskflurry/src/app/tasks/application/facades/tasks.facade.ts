import { inject, Injectable, Signal } from '@angular/core';
import {
  ResourceState,
  KeyedResourceData,
  Loading,
  SkipIfCached,
  syncToStore,
  syncToKeyedStore,
} from 'flurryx';
import { TasksStore, TasksStoreEnum } from '../store/tasks.store';
import { GetTasksUseCase } from '../use-cases/get-tasks.use-case';
import { GetTaskDetailUseCase } from '../use-cases/get-task-detail.use-case';
import { CreateTaskUseCase } from '../use-cases/create-task.use-case';
import { CreateTaskPayload, Task, UpdateTaskPayload } from '../../domain/models/task.model';
import { UpdateTaskUseCase } from '../use-cases/update-task.use-case';
import { DeleteTaskUseCase } from '../use-cases/delete-task.use-case';
import { GetTaskProjectsUseCase } from '../use-cases/get-task-projects.use-case';
import { SnackbarService } from '../../../core/snackbar/snackbar.service';
import { asDeadLetterCommand } from '../../../core/devtools/store-activity-command';

@Injectable()
export class TasksFacade {
  readonly store = inject(TasksStore);
  private readonly getTasksUseCase = inject(GetTasksUseCase);
  private readonly getTaskDetailUseCase = inject(GetTaskDetailUseCase);
  private readonly createTaskUseCase = inject(CreateTaskUseCase);
  private readonly updateTaskUseCase = inject(UpdateTaskUseCase);
  private readonly deleteTaskUseCase = inject(DeleteTaskUseCase);
  private readonly getTaskProjectsUseCase = inject(GetTaskProjectsUseCase);
  private readonly snackbar = inject(SnackbarService);

  getAllTasks(): Signal<ResourceState<Task[]>> {
    return this.store.get(TasksStoreEnum.TASKS);
  }

  getTaskDetail(): Signal<ResourceState<KeyedResourceData<string, Task>>> {
    return this.store.get(TasksStoreEnum.TASK_DETAIL);
  }

  getTaskCreation(): Signal<ResourceState<string>> {
    return this.store.get(TasksStoreEnum.TASK_CREATION);
  }

  @SkipIfCached(TasksStoreEnum.TASKS, (instance: TasksFacade) => instance.store)
  @Loading(TasksStoreEnum.TASKS, (instance: TasksFacade) => instance.store)
  loadTasks(): void {
    this.getTasksUseCase
      .execute()
      .pipe(
        syncToStore(this.store, TasksStoreEnum.TASKS, {
          deadLetterCommand: asDeadLetterCommand({ type: 'tasks.load' }),
        })
      )
      .subscribe();
  }

  @SkipIfCached(TasksStoreEnum.TASK_DETAIL, (instance: TasksFacade) => instance.store)
  @Loading(TasksStoreEnum.TASK_DETAIL, (instance: TasksFacade) => instance.store)
  loadTaskDetail(taskId: string): void {
    this.getTaskDetailUseCase
      .execute(taskId)
      .pipe(
        syncToKeyedStore(this.store, TasksStoreEnum.TASK_DETAIL, taskId, {
          deadLetterCommand: asDeadLetterCommand({
            type: 'tasks.detail.load',
            payload: { taskId },
          }),
        })
      )
      .subscribe();
  }

  @Loading(TasksStoreEnum.TASK_CREATION, (instance: TasksFacade) => instance.store)
  createTask(payload: CreateTaskPayload): void {
    this.createTaskUseCase
      .execute(payload)
      .pipe(
        syncToStore(this.store, TasksStoreEnum.TASK_CREATION, {
          callbackAfterComplete: () => this.clearTasks(),
          deadLetterCommand: asDeadLetterCommand({
            type: 'tasks.create',
            payload: { value: payload },
          }),
        })
      )
      .subscribe();
  }

  getAllProjects() {
    return this.store.get(TasksStoreEnum.PROJECTS);
  }

  @SkipIfCached(TasksStoreEnum.PROJECTS, (instance: TasksFacade) => instance.store)
  @Loading(TasksStoreEnum.PROJECTS, (instance: TasksFacade) => instance.store)
  loadProjects(): void {
    this.getTaskProjectsUseCase
      .execute()
      .pipe(
        syncToStore(this.store, TasksStoreEnum.PROJECTS, {
          deadLetterCommand: asDeadLetterCommand({ type: 'tasks.projects.load' }),
        })
      )
      .subscribe();
  }

  @Loading(TasksStoreEnum.TASK_DETAIL, (instance: TasksFacade) => instance.store)
  updateTask(taskId: string, payload: UpdateTaskPayload): void {
    this.updateTaskUseCase
      .execute(taskId, payload)
      .pipe(
        syncToKeyedStore(this.store, TasksStoreEnum.TASK_DETAIL, taskId, {
          callbackAfterComplete: () => this.clearTasks(),
          deadLetterCommand: asDeadLetterCommand({
            type: 'tasks.update',
            payload: { taskId, value: payload },
          }),
        })
      )
      .subscribe();
  }

  deleteTask(taskId: string): void {
    this.deleteTaskUseCase.execute(taskId).subscribe({
      next: () => {
        this.store.clearKeyedOne(TasksStoreEnum.TASK_DETAIL, taskId);
        this.clearTasks();
        this.loadTasks();
        this.snackbar.show('Task deleted successfully', 'success');
      },
      error: () => {
        this.snackbar.show('Failed to delete task. Please try again.', 'error');
      },
    });
  }

  clearTasks(): void {
    this.store.clear(TasksStoreEnum.TASKS);
  }

  clearTaskCreation(): void {
    this.store.clear(TasksStoreEnum.TASK_CREATION);
  }
}
