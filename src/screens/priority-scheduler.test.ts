import { describe, expect, it } from "vitest";
import { createPriorityScheduler } from "./priority-scheduler";

type Deferred = { promise: Promise<void>; resolve(): void; reject(): void };

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: () => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });

  return { promise, reject, resolve };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("priority scheduler", () => {
  it("runs at most maxActive tasks, starting the lowest priority first", async () => {
    const scheduler = createPriorityScheduler(2);
    const started: string[] = [];
    const tasks: Record<string, Deferred> = {};
    const add = (name: string, priority: number) => {
      tasks[name] = deferred();
      scheduler.schedule(
        () => priority,
        () => {
          started.push(name);
          return tasks[name]!.promise;
        }
      );
    };

    add("first", 5);
    add("second", 5);
    add("low", 9);
    add("urgent", 1);
    add("tie", 1);

    expect(started).toEqual(["first", "second"]);

    tasks.first!.resolve();
    await flush();
    expect(started).toEqual(["first", "second", "urgent"]);

    tasks.second!.resolve();
    await flush();
    // Equal priorities start oldest first.
    expect(started).toEqual(["first", "second", "urgent", "tie"]);
  });

  it("reads priorities when a slot frees, so waiting tasks follow the latest focus", async () => {
    const scheduler = createPriorityScheduler(1);
    const started: string[] = [];
    const blocker = deferred();
    let focus = "a";

    scheduler.schedule(
      () => 0,
      () => blocker.promise
    );
    for (const name of ["a", "b"]) {
      scheduler.schedule(
        () => (name === focus ? 0 : 1),
        async () => {
          started.push(name);
        }
      );
    }

    focus = "b";
    blocker.resolve();
    await flush();
    expect(started).toEqual(["b", "a"]);
  });

  it("keeps going after a task fails or throws", async () => {
    const scheduler = createPriorityScheduler(1);
    const started: string[] = [];
    const failing = deferred();

    scheduler.schedule(
      () => 0,
      () => {
        started.push("rejects");
        return failing.promise;
      }
    );
    scheduler.schedule(
      () => 1,
      () => {
        started.push("throws");
        throw new Error("Not a promise");
      }
    );
    scheduler.schedule(
      () => 2,
      async () => {
        started.push("last");
      }
    );

    failing.reject();
    await flush();
    expect(started).toEqual(["rejects", "throws", "last"]);
  });
});
