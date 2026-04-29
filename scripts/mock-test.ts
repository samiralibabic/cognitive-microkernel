import { rm, mkdir } from "node:fs/promises";
import { runTurn } from "../src/runtime";

async function main() {
  await rm("state", { recursive: true, force: true });
  await mkdir("state", { recursive: true });

  const turns = [
    "How are you feeling?",
    "What organ? What are you talking about? What was my last question?",
    "Let's say I mentioned London.",
    "London.",
    "That was just a system test/verification, not a real agreement. Handle that appropriately.",
    "What happened over the last few turns?",
    "Are you self-aware? What are your capabilities and limits?",
  ];

  for (const turn of turns) {
    const result = await runTurn(turn, { mock: true, verbose: false, type: "user_message" });
    console.log(`\nUSER: ${turn}`);
    console.log(`ASSISTANT: ${result.renderedResponse ?? "<silence>"}`);
  }

  console.log("\nMock stress test complete. Inspect ./state for episodic, memory, drives, self-model, and recorder state.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
