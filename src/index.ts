import { runTurn } from "./runtime";

function parseArgs(argv: string[]) {
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const positional = argv.filter((a) => !a.startsWith("--"));
  const message = positional.join(" ").trim();
  return {
    message,
    mock: flags.has("--mock"),
    verbose: flags.has("--verbose") || flags.has("-v"),
    type: flags.has("--system") ? "system_event" as const : "user_message" as const,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.message) {
    console.error(`Usage:
  bun run dev -- --mock "Build organ runtime v0"
  bun run dev -- "What should we do next?"

Flags:
  --mock      Run without LLM credentials; deterministic wiring test.
  --verbose   Print internal organ questions/answers/commands.
  --system    Treat message as system_event instead of user_message.
`);
    process.exit(1);
  }

  const result = await runTurn(args.message, { mock: args.mock, verbose: args.verbose, type: args.type });

  if (args.verbose) {
    console.log("\n--- EVENT ---");
    console.log(JSON.stringify(result.event, null, 2));
    console.log("\n--- ORGAN QUESTIONS ---");
    console.log(JSON.stringify(result.questions, null, 2));
    console.log("\n--- ORGAN ANSWERS ---");
    console.log(JSON.stringify(result.answers, null, 2));
    console.log("\n--- CORTEX OUTPUT ---");
    console.log(JSON.stringify(result.cortexOutput, null, 2));
    console.log("\n--- COMMAND RESULTS ---");
    console.log(JSON.stringify(result.commandResults, null, 2));
    console.log("\n--- USER RESPONSE ---");
  }

  if (result.renderedResponse) {
    console.log(result.renderedResponse);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
