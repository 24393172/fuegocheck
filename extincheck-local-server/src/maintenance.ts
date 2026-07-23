export type MaintenanceState = 'idle' | 'write' | 'backup' | 'restore' | 'cleanup';

export class MaintenanceCoordinator {
  private tail: Promise<void> = Promise.resolve();
  private active: MaintenanceState = 'idle';
  private queued = 0;

  status() {
    return { state: this.active, queued: this.queued };
  }

  runWrite<T>(work: () => Promise<T> | T): Promise<T> {
    return this.run('write', work);
  }

  runExclusive<T>(
    operation: Exclude<MaintenanceState, 'idle' | 'write'>,
    work: () => Promise<T> | T
  ): Promise<T> {
    return this.run(operation, work);
  }

  private run<T>(state: Exclude<MaintenanceState, 'idle'>, work: () => Promise<T> | T): Promise<T> {
    this.queued += 1;
    const result = this.tail.then(async () => {
      this.queued -= 1;
      this.active = state;
      try {
        return await work();
      } finally {
        this.active = 'idle';
      }
    });
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}
