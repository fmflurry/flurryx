import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TasksFacade } from '../../application/facades/tasks.facade';
import { TasksStore } from '../../application/store/tasks.store';
import { StoreHistoryVizComponent } from '../../../core/devtools/store-history-viz.component';

@Component({
  selector: 'app-tasks-list',
  standalone: true,
  imports: [RouterLink, StoreHistoryVizComponent],
  templateUrl: './tasks-list.component.html',
  styleUrl: './tasks-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TasksListComponent implements OnInit {
  private readonly facade = inject(TasksFacade);

  protected readonly tasksState = this.facade.getAllTasks();
  protected readonly tasks = computed(() => this.tasksState().data ?? []);
  protected readonly isLoading = computed(() => this.tasksState().isLoading ?? false);
  protected readonly hasError = computed(() => this.tasksState().status === 'Error');
  protected readonly errors = computed(() => this.tasksState().errors ?? []);

  protected readonly historyStore = inject(TasksStore);

  ngOnInit(): void {
    this.facade.loadTasks();
  }

  protected deleteTask(event: Event, taskId: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.facade.deleteTask(taskId);
  }
}
