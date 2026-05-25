import type { Event, Organ, OrganAnswer, OrganCommand, OrganQuestion, OrganResult } from "../schemas";
import { LlmClient } from "../llm";
import { runOrganAnswerHarness } from "../harness/organ-answer";
import type { ToolTraceRecorder } from "../harness/tooling";
import { makeId, nowIso, readJsonFile, writeJsonFile } from "../state";
import { topMatches } from "../search";

export type GoalRecord = {
  id: string;
  summary: string;
  status: "active" | "blocked" | "done" | "stale";
  next_step?: string;
  priority?: number;
  notes?: string[];
  created_at: string;
  updated_at: string;
};

const DEFAULT_GOALS: GoalRecord[] = [
  {
    id: "build-organ-runtime-v0",
    summary: "Build a lean organ-based agent runtime v0.",
    status: "active",
    next_step: "Define schemas and runtime loop.",
    priority: 1,
    notes: [],
    created_at: nowIso(),
    updated_at: nowIso(),
  },
];

export class DrivesOrgan implements Organ {
  name = "drives";
  responsibility = "LLM-backed goals, priorities, larger objectives, open loops, decision style, and progress tracking.";

  constructor(private readonly llm: LlmClient) {}

  private async load() { return readJsonFile<GoalRecord[]>("goals.json", DEFAULT_GOALS); }
  private async save(goals: GoalRecord[]) { await writeJsonFile("goals.json", goals); }

  async sense(question: OrganQuestion, recorder?: ToolTraceRecorder): Promise<OrganAnswer> {
    const goals = await this.load();
    // Important: score against the event only. Including the generic organ question
    // makes every goal look relevant because the question itself contains words like "goal".
    const candidates = topMatches(
      question.event.content,
      goals,
      (g) => `${g.summary} ${g.status} ${g.next_step ?? ""} ${(g.notes ?? []).join(" ")}`,
      8,
    );

    return runOrganAnswerHarness({
      llm: this.llm,
      organName: this.name,
      method: "sense",
      recorder,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: `You are the Drives/Goals organ. You own active goals, larger objectives, open loops, and decision preferences.
Call final_organ_answer with your answer.
Rules:
- Explain what bigger goal this event belongs to only if the event is actually goal/project/continuation relevant.
- If the event is casual, generic, or about the system's feelings/identity, return relevant=false unless a goal is directly implicated.
- Do not inject active goals into unrelated user-facing context.
- Use only provided goals as evidence.`,
        },
        { role: "user", content: JSON.stringify({ question, candidate_goals: candidates, active_goals: goals.filter((g) => g.status === "active") }, null, 2) },
      ],
    });
  }

  async act(command: OrganCommand, event: Event): Promise<OrganResult> {
    const goals = await this.load();

    const decision = await this.llm.chatJson<{
      status: "accepted" | "rejected";
      summary: string;
      goal?: Partial<GoalRecord> & { id?: string };
    }>([
      {
        role: "system",
        content: `You are the Drives/Goals organ. Decide how to mutate goal state based on a command from the main cortex.
Return only valid JSON:
{
 "status":"accepted"|"rejected",
 "summary":"...",
 "goal":{"id":"existing or omit for new","summary":"...","status":"active|blocked|done|stale","next_step":"...","priority":1,"notes":[...]}
}
Prefer updating existing active goals over creating duplicates. Reject trivial test-only updates unless the cortex explicitly asks to record test outcome.`,
      },
      { role: "user", content: JSON.stringify({ event, command, goals }, null, 2) },
    ]);

    if (decision.status !== "accepted" || !decision.goal) {
      return { target: this.name, operation: command.operation, status: decision.status, summary: decision.summary };
    }

    const idx = decision.goal.id ? goals.findIndex((g) => g.id === decision.goal!.id) : -1;
    if (idx >= 0) {
      goals[idx] = { ...goals[idx], ...decision.goal, updated_at: nowIso() } as GoalRecord;
      await this.save(goals);
      return { target: this.name, operation: command.operation, status: "accepted", summary: decision.summary, data: goals[idx] };
    }

    const goal: GoalRecord = {
      id: makeId("goal"),
      summary: String(decision.goal.summary ?? "Untitled goal"),
      status: decision.goal.status ?? "active",
      next_step: decision.goal.next_step,
      priority: decision.goal.priority,
      notes: decision.goal.notes ?? [],
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    goals.push(goal);
    await this.save(goals);
    return { target: this.name, operation: command.operation, status: "accepted", summary: decision.summary, data: { id: goal.id, summary: goal.summary } };
  }
}
