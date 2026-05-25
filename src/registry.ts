import type { Organ, OrganInfo } from "./schemas";
import { LlmClient } from "./llm";
import { RecorderOrgan } from "./organs/recorder";
import { SelfModelOrgan } from "./organs/self-model";
import { EpisodicOrgan } from "./organs/episodic";
import { MemoryOrgan } from "./organs/memory";
import { ToolsOrgan } from "./organs/tools";
import { DrivesOrgan } from "./organs/drives";
import { EnvironmentOrgan } from "./organs/environment";
import { CommunicationsOrgan } from "./organs/communications";

export type OrganBundle = {
  registry: Map<string, Organ>;
  recorder: RecorderOrgan;
  communications: CommunicationsOrgan;
  episodic: EpisodicOrgan;
  selfModel: SelfModelOrgan;
};

export function createOrgans(llm: LlmClient): OrganBundle {
  const recorder = new RecorderOrgan(llm);
  const communications = new CommunicationsOrgan(llm);
  const episodic = new EpisodicOrgan(llm);
  const selfModel = new SelfModelOrgan(llm);
  const organs: Organ[] = [
    selfModel,
    episodic,
    new MemoryOrgan(llm),
    new ToolsOrgan(llm),
    new DrivesOrgan(llm),
    new EnvironmentOrgan(llm),
    communications,
    recorder,
  ];

  return {
    registry: new Map(organs.map((o) => [o.name, o])),
    recorder,
    communications,
    episodic,
    selfModel,
  };
}

export function organInfos(registry: Map<string, Organ>): OrganInfo[] {
  return [...registry.values()].map((o) => ({
    name: o.name,
    responsibility: o.responsibility,
    dangerous: o.dangerous,
  }));
}
