import type { Event, Organ, OrganAnswer, OrganCommand, OrganQuestion, OrganResult } from "../schemas";
import { LlmClient } from "../llm";
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

  async sense(question: OrganQuestion): Promise<OrganAnswer> {
    const goals = await this.load();
    // Important: score against the event only. Including the generic organ question
    // makes every goal look relevant because the question itself contains words like "goal".
    const candidates = topMatches(
      question.event.content,
      goals,
      (g) => `${g.summary} ${g.status} ${g.next_step ?? ""} ${(g.notes ?? []).join(" ")}`,
      8,
    );
    const goalIntent = looksGoalRelevant(question.event.content);

    if (this.llm.isMock()) {
      const active = goals.filter((g) => g.status === "active").sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
      const selected = candidates[0] ?? (goalIntent ? active[0] : undefined);
      return {
        organ: this.name,
        relevant: Boolean(selected),
        confidence: selected ? 0.82 : 0.75,
        summary: selected
          ? `Active goal: ${selected.summary}. Next step: ${selected.next_step ?? "not set"}.`
          : "No goal context appears relevant to this event.",
        evidence: selected ? [{ id: selected.id, status: selected.status, next_step: selected.next_step }] : [],
      };
    }

    return this.llm.chatJson<OrganAnswer>([
      {
        role: "system",
        content: `You are the Drives/Goals organ. You own active goals, larger objectives, open loops, and decision preferences.
Return only valid JSON matching OrganAnswer.
Rules:
- Explain what bigger goal this event belongs to only if the event is actually goal/project/continuation relevant.
- If the event is casual, generic, or about the system's feelings/identity, return relevant=false unless a goal is directly implicated.
- Do not inject active goals into unrelated user-facing context.
- Use only provided goals as evidence.`,
      },
      { role: "user", content: JSON.stringify({ question, candidate_goals: candidates, active_goals: goals.filter((g) => g.status === "active"), likely_goal_relevant: goalIntent }, null, 2) },
    ], { temperature: 0.1 });
  }

  async act(command: OrganCommand, event: Event): Promise<OrganResult> {
    const goals = await this.load();

    if (this.llm.isMock()) {
      const payload = command.payload as Record<string, unknown>;
      const goalText = String(payload.goal ?? payload.summary ?? "Build a lean organ-based agent runtime v0.");
      let goal = goals.find((g) => g.summary.toLowerCase().includes(goalText.toLowerCase()) || goalText.toLowerCase().includes(g.summary.toLowerCase()))
        ?? goals.find((g) => g.id === "build-organ-runtime-v0");
      if (!goal) {
        goal = { id: makeId("goal"), summary: goalText, status: "active", created_at: nowIso(), updated_at: nowIso(), notes: [] };
        goals.push(goal);
      }
      if (payload.next_step) goal.next_step = String(payload.next_step);
      if (payload.status && ["active", "blocked", "done", "stale"].includes(String(payload.status))) goal.status = payload.status as GoalRecord["status"];
      goal.notes = [...(goal.notes ?? []), `Event ${event.id}: ${command.reason ?? command.operation}`];
      goal.updated_at = nowIso();
      await this.save(goals);
      return { target: this.name, operation: command.operation, status: "accepted", summary: `Updated goal ${goal.id}.`, data: goal };
    }

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

function looksGoalRelevant(text: string): boolean {
  return /\b(next step|what should we do|continue|goal|plan|project|build|implement|runtime|organ|agent|open loop|priority|roadmap|done|blocked)\b/i.test(text);
}
