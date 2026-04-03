import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ProjectsFacade } from '../../application/facades/projects.facade';
import { Project } from '../../domain/models/project.model';

@Component({
  selector: 'app-projects-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './projects-list.component.html',
  styleUrl: './projects-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectsListComponent implements OnInit {
  private readonly facade = inject(ProjectsFacade);

  protected readonly projectsState = this.facade.getAllProjects();
  protected readonly selectedProjectState = this.facade.getSelectedProject();
  private readonly tasksState = this.facade.getAllTasks();

  protected readonly projects = computed(() => this.projectsState().data ?? []);
  protected readonly isLoading = computed(() => this.projectsState().isLoading ?? false);
  protected readonly hasError = computed(() => this.projectsState().status === 'Error');
  protected readonly errors = computed(() => this.projectsState().errors ?? []);
  protected readonly selectedProject = computed(() => this.selectedProjectState().data ?? null);
  protected readonly selectedProjectId = computed(() => this.selectedProject()?.id ?? null);

  private readonly allTasks = computed(() => this.tasksState().data ?? []);

  protected readonly taskCountByProject = computed<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    for (const task of this.allTasks()) {
      counts[task.projectId] = (counts[task.projectId] ?? 0) + 1;
    }
    return counts;
  });

  protected readonly projectTasks = computed(() => {
    const projectId = this.selectedProjectId();
    if (!projectId) return [];
    return this.allTasks().filter((t) => t.projectId === projectId);
  });
  protected readonly isLoadingTasks = computed(() => this.tasksState().isLoading ?? false);

  ngOnInit(): void {
    this.facade.loadProjects();
    this.facade.loadTasks();
  }

  protected selectProject(project: Project): void {
    if (this.selectedProjectId() === project.id) {
      this.facade.clearSelection();
    } else {
      this.facade.selectProject(project);
    }
  }

  protected clearSelection(): void {
    this.facade.clearSelection();
  }

  protected isSelected(project: Project): boolean {
    return this.selectedProjectId() === project.id;
  }

  protected deleteTask(event: Event, taskId: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.facade.deleteTask(taskId);
  }
}
