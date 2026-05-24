import type { Event, Organ, OrganAnswer, OrganCommand, OrganQuestion, OrganResult } from "../schemas";
import { LlmClient } from "../llm";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

export class EnvironmentOrgan implements Organ {
  name = "environment";
  responsibility = "LLM-backed environment observer: current project/runtime state, local files, inbox/timer/system events; reports only relevant changes.";

  constructor(private readonly llm: LlmClient) {}

  async sense(question: OrganQuestion): Promise<OrganAnswer> {
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

    return this.llm.chatJson<OrganAnswer>([
      {
        role: "system",
        content: `You are the Environment organ. Judge whether current runtime/project state changes how this event should be handled.
Return only valid JSON matching OrganAnswer. Do not invent files or system facts.`,
      },
      { role: "user", content: JSON.stringify({ question, observations }, null, 2) },
    ]);
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
