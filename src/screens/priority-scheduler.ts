// Runs asynchronous tasks at most `maxActive` at a time. Whenever a slot
// frees, the waiting task with the lowest priority value starts next, oldest
// first on a tie. Priorities are read at that moment, so a task's place
// follows the latest remote focus rather than where focus was when it queued.
// Tasks re-check whether they are still wanted when they start.

export type PriorityScheduler = {
  schedule(priority: () => number, task: () => Promise<unknown>): void;
};

type WaitingTask = {
  priority(): number;
  task(): Promise<unknown>;
};

export function createPriorityScheduler(maxActive: number): PriorityScheduler {
  const waiting: WaitingTask[] = [];
  let active = 0;

  function takeNext(): WaitingTask | undefined {
    let best = 0;
    let bestPriority = waiting[0]!.priority();

    for (let index = 1; index < waiting.length; index += 1) {
      const priority = waiting[index]!.priority();

      if (priority < bestPriority) {
        best = index;
        bestPriority = priority;
      }
    }

    return waiting.splice(best, 1)[0];
  }

  function drain(): void {
    while (active < maxActive && waiting.length > 0) {
      const next = takeNext();

      if (!next) {
        return;
      }

      active += 1;
      let settled = false;
      const done = () => {
        if (!settled) {
          settled = true;
          active -= 1;
          drain();
        }
      };

      try {
        next.task().then(done, done);
      } catch {
        done();
      }
    }
  }

  return {
    schedule(priority, task) {
      waiting.push({ priority, task });
      drain();
    }
  };
}
