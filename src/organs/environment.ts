import type { Event, Organ, OrganAnswer, OrganCommand, OrganQuestion, OrganResult } from "../schemas";
import { LlmClient } from "../llm";
import { runOrganAnswerHarness } from "../harness/organ-answer";
import type { ToolTraceRecorder } from "../harness/tooling";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

export class EnvironmentOrgan implements Organ {
  name = "environment";
  responsibility = "LLM-backed environment observer: current project/runtime state, local files, inbox/timer/system events; reports only relevant changes.";

  constructor(private readonly llm: LlmClient) {}

  async sense(question: OrganQuestion, recorder?: ToolTraceRecorder): Promise<OrganAnswer> {
    const observations: Record<string, unknown> = {
      cwd: process.cwd(),
      has_package_json: existsSync("package.json"),
      has_state_dir: existsSync("state"),
    };

    if (existsSync("package.json")) {
      try {
        const pkg = JSON.parse(await readFile("package.json", "utf8"));
        observations.package = { name: pkg.name, scripts: pkg.scripts };
      } catch {}
    }

    return runOrganAnswerHarness({
      llm: this.llm,
      organName: this.name,
      method: "sense",
      recorder,
      messages: [
        {
          role: "system",
          content: `You are the Environment organ. Judge whether current runtime/project state changes how this event should be handled.
Call final_organ_answer with your answer. Do not invent files or system facts.`,
        },
        { role: "user", content: JSON.stringify({ question, observations }, null, 2) },
      ],
    });
  }

  async act(command: OrganCommand): Promise<OrganResult> {
    return {
      target: this.name,
      operation: command.operation,
      status: "accepted",
      summary: "Environment organ v0 has no mutating state; command acknowledged as no-op.",
    };
  }
}
