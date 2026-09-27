// Explicit opt-in only: two paid Responses API calls, synthetic data, no DB writes.
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createAIClient } from "../src/lib/ai/client.ts";
import { publicAIError } from "../src/lib/ai/errors.ts";
import { initialLearningState } from "../src/lib/learning/selectors.ts";
import { resourceSelection } from "../src/lib/learning/resources.ts";
const require = createRequire(import.meta.url);
if (!process.argv.includes("--live")) {
  console.error(
    "Use --live to authorize two paid calls with synthetic data. No user rows are read or changed.",
  );
  process.exit(2);
}
require("@next/env").loadEnvConfig(process.cwd());
const call = createAIClient({
  apiKey: process.env.OPENAI_API_KEY ?? "",
  model: process.env.OPENAI_MODEL ?? "",
});
try {
  for (const [name, schema, input] of [
    [
      "learning_resources",
      z.strictObject({
        ids: z
          .array(z.enum(["python-docs", "think-python"]))
          .min(1)
          .max(3),
      }),
      "Synthetic beginner learning Python functions, 15 minutes. Choose python-docs as the main resource and optionally think-python as a chapter.",
    ],
    [
      "weekly_review",
      z.strictObject({ focus: z.enum(["python"]) }),
      "Synthetic learner: no completed sessions. Recommend python as the next focus, no invented achievements.",
    ],
  ]) {
    const response = await call({
      instructions: "Return only a valid choice matching the schema.",
      input,
      stream: false,
      max_output_tokens: 4000,
      text: {
        format: {
          type: "json_schema",
          name,
          strict: true,
          schema: z.toJSONSchema(schema, { target: "draft-7" }),
        },
      },
    });
    const data = await response.json();
    if (data.status !== "completed") throw new Error("INCOMPLETE");
    const output = schema.parse(
      JSON.parse(
        data.output
          .flatMap((o) => o.content ?? [])
          .filter((c) => c.type === "output_text")
          .map((c) => c.text)
          .join(""),
      ),
    );
    if (name === "learning_resources")
      resourceSelection(
        initialLearningState(),
        {
          onboardingComplete: true,
          dailyMinutes: 15,
          interests: "",
          goal: "Python",
        },
        "python",
        randomUUID(),
        new Date(),
        output.ids,
      );
    console.log(
      `PASS live ${name}: completed strict structured output; server validation passed.`,
    );
  }
} catch (error) {
  const safe = publicAIError(error);
  console.error(`FAIL live AI: ${safe.code}: ${safe.error}`);
  process.exitCode = 1;
}
