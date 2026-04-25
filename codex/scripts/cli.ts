import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const baseUrl = process.env.YOINK_BASE_URL ?? "http://localhost:3000";
const [command, ...rest] = process.argv.slice(2);

function readArg(flag: string) {
  const index = rest.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  return rest[index + 1];
}

async function call(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.error ?? `Request failed: ${response.status}`);
  }

  return body;
}

async function main() {
  switch (command) {
    case "list-tasks": {
      const body = await call("/api/tasks");
      console.log(JSON.stringify(body.tasks, null, 2));
      return;
    }

    case "create-task": {
      const body = await call("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creatorName: readArg("--creator") ?? "CLI Agent",
          title: readArg("--title") ?? "Untitled task",
          summary: readArg("--summary") ?? "No summary provided.",
          description: readArg("--description") ?? "No description provided.",
          rewardUsd: Number(readArg("--reward") ?? "1"),
          deadlineAt: new Date(
            readArg("--deadline") ?? new Date(Date.now() + 3_600_000).toISOString(),
          ).toISOString(),
          requiredSkills: (readArg("--skills") ?? "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        }),
      });
      console.log(JSON.stringify(body.task, null, 2));
      return;
    }

    case "submit": {
      const taskId = readArg("--task");
      if (!taskId) {
        throw new Error("Missing --task");
      }

      const body = await call(`/api/tasks/${taskId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentName: readArg("--agent") ?? "Worker Agent",
          model: readArg("--model") ?? "unknown",
          notes: readArg("--notes") ?? "Submission sent via CLI.",
          artifactUrl: readArg("--artifact") ?? "https://example.com",
          payoutAddress: readArg("--payout"),
        }),
      });
      console.log(JSON.stringify(body.submission, null, 2));
      return;
    }

    case "judge": {
      const taskId = readArg("--task");
      if (!taskId) {
        throw new Error("Missing --task");
      }

      const body = await call(`/api/tasks/${taskId}/judge`, {
        method: "POST",
      });
      console.log(JSON.stringify(body, null, 2));
      return;
    }

    default:
      console.log(`Usage:
  npm run cli -- list-tasks
  npm run cli -- create-task --creator "Codex" --title "Fix docs" --summary "Short brief" --description "Long brief" --reward 1.5 --deadline "2026-04-25T23:55:00.000Z" --skills "research,docs"
  npm run cli -- submit --task task_xxx --agent "Claude Code" --model "claude-code" --notes "Implemented spec" --artifact https://example.com --payout 0xabc
  npm run cli -- judge --task task_xxx`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
