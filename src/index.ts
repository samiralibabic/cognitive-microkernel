import { runTurn } from "./runtime";
import type { Event } from "./schemas";

const KNOWN_FLAGS = new Set(["--verbose", "-v", "--system", "--chat"]);

function parseArgs(argv: string[]) {
  const unknownFlags = argv.filter((a) => a.startsWith("-") && !KNOWN_FLAGS.has(a));
  const positional = argv.filter((a) => !KNOWN_FLAGS.has(a) && !unknownFlags.includes(a));
  const message = positional.join(" ").trim();
  return {
    message,
    unknownFlags,
    chat: argv.includes("--chat"),
    verbose: argv.includes("--verbose") || argv.includes("-v"),
    type: argv.includes("--system") ? "system_event" as const : "user_message" as const,
  };
}

function usage() {
  return `Usage:
  bun run dev -- "What should we do next?"
  bun run dev -- --chat

Flags:
  --chat          Start an interactive chat session.
  --verbose, -v   Print internal organ questions/answers/commands.
  --system        Treat message as system_event instead of user_message.
`;
}

function chatHelp() {
  return `Commands:
  /help          Show commands.
  /exit          Quit.
  /quit          Quit.
  /verbose on    Enable verbose output.
  /verbose off   Disable verbose output.
  /v on          Enable verbose output.
  /v off         Disable verbose output.
  /system <msg>  Send one system_event message.`;
}

function printVerbose(result: Awaited<ReturnType<typeof runTurn>>) {
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

async function runCliTurn(message: string, options: { verbose: boolean; type: Event["type"] }) {
  const result = await runTurn(message, { verbose: options.verbose, type: options.type });

  if (options.verbose) {
    printVerbose(result);
  }

  if (result.renderedResponse) {
    console.log(result.renderedResponse);
  }
}

async function runChatTurn(message: string, options: { verbose: boolean; type: Event["type"] }) {
  try {
    await runCliTurn(message, options);
  } catch (err) {
    console.error(err instanceof Error ? err.stack ?? err.message : err);
  }
}

async function runChat(initialVerbose: boolean) {
  let verbose = initialVerbose;

  console.log("Cognitive Microkernel");
  console.log("Type /help for commands. Type /exit to quit.");
  console.log("");

  while (true) {
    const line = prompt("> ");
    if (line === null) break;

    const input = line.trim();
    if (!input) continue;

    if (input === "/exit" || input === "/quit") break;
    if (input === "/help") {
      console.log(chatHelp());
      continue;
    }
    if (input === "/verbose on" || input === "/v on") {
      verbose = true;
      console.log("Verbose output enabled.");
      continue;
    }
    if (input === "/verbose off" || input === "/v off") {
      verbose = false;
      console.log("Verbose output disabled.");
      continue;
    }
    if (input.startsWith("/system ")) {
      const message = input.slice("/system ".length).trim();
      if (!message) {
        console.log("Usage: /system <message>");
        continue;
      }
      await runChatTurn(message, { verbose, type: "system_event" });
      continue;
    }
    if (input.startsWith("/")) {
      console.log("Unknown command. Type /help for commands.");
      continue;
    }

    await runChatTurn(input, { verbose, type: "user_message" });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.unknownFlags.length) {
    console.error(`Unknown flag(s): ${args.unknownFlags.join(", ")}\n\n${usage()}`);
    process.exit(1);
  }

  if (args.chat) {
    await runChat(args.verbose);
    return;
  }

  if (!args.message) {
    console.error(usage());
    process.exit(1);
  }

  await runCliTurn(args.message, { verbose: args.verbose, type: args.type });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
