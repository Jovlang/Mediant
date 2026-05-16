// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";

const notificationMocks = vi.hoisted(() => ({
  scheduleNotifications: vi.fn(),
  clearScheduled: vi.fn(),
  requestPermission: vi.fn(async () => true),
  setNotificationsEnabled: vi.fn(),
}));

vi.mock("../ui/notifications.ts", () => ({
  notificationsEnabled: () => false,
  setNotificationsEnabled: notificationMocks.setNotificationsEnabled,
  requestPermission: notificationMocks.requestPermission,
  clearScheduled: notificationMocks.clearScheduled,
  scheduleNotifications: notificationMocks.scheduleNotifications,
}));

describe("main.ts server mode", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 20, 10, 0, 0));
    document.body.innerHTML = '<div id="agenda"></div>';
    localStorage.clear();
    notificationMocks.scheduleNotifications.mockClear();
    notificationMocks.clearScheduled.mockClear();
    notificationMocks.requestPermission.mockClear();
    notificationMocks.setNotificationsEnabled.mockClear();
  });

  it("writes existing edits and new items to the single server source", async () => {
    let serverSource = [
      "** TODO Work task",
      "SCHEDULED: <2026-04-20 Mon 11:00>",
      "- [ ] Check result",
      "",
      "* Tasks",
      "** TODO Inbox task",
      "",
    ].join("\n");
    let serverVersion = "v1";
    let versionCounter = 1;
    const putCalls: Array<{ content: string; version: string; path?: string }> = [];

    class FakeEventSource {
      onmessage: ((event: { data: string }) => void) | null = null;
      constructor(readonly url: string) {}
      close(): void {}
    }

    vi.stubGlobal("EventSource", FakeEventSource as unknown as typeof EventSource);
    vi.stubGlobal("fetch", vi.fn((input: string, init?: RequestInit) => {
      if (input !== "/api/source") throw new Error(`unexpected fetch: ${input}`);
      const method = init?.method ?? "GET";
      if (method === "GET") return Promise.resolve(makeServerGetResponse(serverSource, serverVersion));
      if (method === "PUT") {
        const bodyJson = JSON.parse(String(init?.body ?? "{}"));
        putCalls.push(bodyJson);
        serverSource = bodyJson.content;
        serverVersion = `v${++versionCounter}`;
        return Promise.resolve(makePutResponse(serverVersion));
      }
      throw new Error(`unexpected method: ${method}`);
    }));

    await import("../main.ts");
    await waitFor(() => Array.from(document.querySelectorAll<HTMLElement>(".item-title")).some(
      el => el.textContent?.includes("Work task"),
    ));

    const workTitle = Array.from(document.querySelectorAll<HTMLElement>(".item-title"))
      .find(el => el.textContent?.includes("Work task")) ?? null;
    expect(workTitle).not.toBeNull();
    const workState = workTitle!.closest(".scheduled-item")?.querySelector<HTMLElement>(".item-state.is-toggleable");
    expect(workState).not.toBeNull();
    workState!.click();
    await waitFor(() => putCalls.length >= 1);

    expect(putCalls[0].path).toBeUndefined();
    expect(putCalls[0].version).toBe("v1");
    expect(putCalls[0].content).toContain("** DONE Work task");
    expect(putCalls[0].content).toContain("** TODO Inbox task");

    const checkbox = document.querySelector<HTMLElement>(".checkbox-item");
    expect(checkbox).not.toBeNull();
    checkbox!.click();
    await waitFor(() => putCalls.length >= 2);

    expect(putCalls[1].path).toBeUndefined();
    expect(putCalls[1].content).toContain("- [X] Check result");

    document.querySelector<HTMLButtonElement>(".add-item-btn")!.click();
    await waitFor(() => document.querySelector(".add-panel.is-open") !== null);
    const titleInput = document.querySelector<HTMLInputElement>("#add-title");
    expect(titleInput).not.toBeNull();
    titleInput!.value = "Inbox new";
    const panel = document.querySelector<HTMLDialogElement>(".add-panel");
    expect(panel).not.toBeNull();
    panel!.dispatchEvent(new Event("cancel", { cancelable: true }));
    await waitFor(() => putCalls.length >= 3);

    expect(putCalls[2].path).toBeUndefined();
    expect(putCalls[2].content).toContain("** TODO Inbox new");
    expect(putCalls[2].content).toContain("** TODO Inbox task");
  });

  it("reloads duplicate SSE data without dropping queued edit saves", async () => {
    let serverSource = [
      "** TODO Work",
      "SCHEDULED: <2026-04-20 Mon 11:00>",
      "",
    ].join("\n");
    let serverVersion = "v1";
    const putCalls: Array<{ body: string; version: string | null }> = [];
    let resolveFirstPut: (() => void) | null = null;
    const eventSources: Array<{ emit: (data: string) => void }> = [];

    class FakeEventSource {
      onmessage: ((event: { data: string }) => void) | null = null;

      constructor(readonly url: string) {
        eventSources.push(this);
      }

      emit(data: string): void {
        this.onmessage?.({ data });
      }

      close(): void {}
    }

    vi.stubGlobal("EventSource", FakeEventSource as unknown as typeof EventSource);
    vi.stubGlobal("fetch", vi.fn((input: string, init?: RequestInit) => {
      if (input !== "/api/source") throw new Error(`unexpected fetch: ${input}`);
      const method = init?.method ?? "GET";
      if (method === "GET") return Promise.resolve(makeServerGetResponse(serverSource, serverVersion));
      if (method !== "PUT") throw new Error(`unexpected method: ${method}`);

      const bodyText = String(init?.body ?? "");
      const bodyJson = JSON.parse(bodyText);
      putCalls.push({
        body: bodyText,
        version: bodyJson.version ?? null,
      });

      if (putCalls.length === 1) {
        return new Promise((resolve) => {
          resolveFirstPut = () => {
            serverSource = bodyJson.content;
            serverVersion = "v1a";
            resolve(makePutResponse("v1a"));
          };
        });
      }

      serverSource = bodyJson.content;
      serverVersion = "v2";
      return Promise.resolve(makePutResponse("v2"));
    }));

    await import("../main.ts");
    await waitFor(() => document.querySelector(".scheduled-item .item-title") !== null);
    expect(eventSources).toHaveLength(1);

    eventSources[0].emit("stable");
    await flush();

    const workTitle = Array.from(document.querySelectorAll<HTMLElement>(".scheduled-item .item-title"))
      .find(el => el.textContent?.includes("Work")) ?? null;
    expect(workTitle).not.toBeNull();
    workTitle!.click();
    await waitFor(() => document.querySelector(".add-panel.is-open") !== null);

    const titleInput = document.querySelector<HTMLInputElement>("#add-title");
    expect(titleInput).not.toBeNull();

    titleInput!.value = "Work one";
    titleInput!.dispatchEvent(new Event("input", { bubbles: true }));
    await flush();
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0].version).toBe("v1");

    titleInput!.value = "Work two";
    titleInput!.dispatchEvent(new Event("input", { bubbles: true }));
    await flush();
    expect(putCalls).toHaveLength(1);

    eventSources[0].emit("stable");
    await flush();
    expect(putCalls).toHaveLength(1);

    expect(resolveFirstPut).not.toBeNull();
    resolveFirstPut!();
    await waitFor(() => putCalls.length === 2);

    expect(putCalls[1].version).toBe("v1a");
    expect(JSON.parse(putCalls[1].body).content).toContain("** TODO Work two");
  });
});

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 20; i++) {
    if (predicate()) return;
    await flush();
  }
  throw new Error("condition not met");
}

async function flush(): Promise<void> {
  await Promise.resolve();
  vi.runOnlyPendingTimers();
  await Promise.resolve();
}

function makeMockResponse(status: number, body = "") {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: {
      get(_name: string): string | null { return null; },
    },
    text: async (): Promise<string> => body,
    json: async () => JSON.parse(body || "null"),
  };
}

function makeServerGetResponse(source: string, version: string) {
  return makeMockResponse(200, JSON.stringify({ content: source, version }));
}

function makePutResponse(version: string) {
  return makeMockResponse(200, JSON.stringify({ version, combined: version }));
}
