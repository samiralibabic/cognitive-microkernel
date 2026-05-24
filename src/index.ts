import { runTurn } from "./runtime";

const KNOWN_FLAGS = new Set(["--verbose", "-v", "--system"]);

function parseArgs(argv: string[]) {
  const unknownFlags = argv.filter((a) => a.startsWith("-") && !KNOWN_FLAGS.has(a));
  const positional = argv.filter((a) => !KNOWN_FLAGS.has(a) && !unknownFlags.includes(a));
  const message = positional.join(" ").trim();
  return {
    message,
    unknownFlags,
    verbose: argv.includes("--verbose") || argv.includes("-v"),
    type: argv.includes("--system") ? "system_event" as const : "user_message" as const,
  };
}

function usage() {
  return `Usage:
  bun run dev -- "What should we do next?"

Flags:
  --verbose, -v   Print internal organ questions/answers/commands.
  --system        Treat message as system_event instead of user_message.
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.unknownFlags.length) {
    console.error(`Unknown flag(s): ${args.unknownFlags.join(", ")}\n\n${usage()}`);
    process.exit(1);
  }

  if (!args.message) {
    console.error(usage());
    process.exit(1);
  }

  const result = await runTurn(args.message, { verbose: args.verbose, type: args.type });

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
