export function fakeAI(body, res, controls) {
  controls.aiRequests.push(body);
  const mode = controls.aiMode;
  function failure(status, code) {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Retry-After": "2",
    });
    res.end(
      JSON.stringify({ error: { code, message: "PRIVATE_PROVIDER_DETAIL" } }),
    );
  }
  if (mode === "rate") return failure(429, "rate_limit_exceeded");
  if (mode === "quota") return failure(429, "insufficient_quota");
  if (mode === "access") return failure(401, "invalid_api_key");
  if (mode === "unavailable") return failure(503, "unavailable");
  if (mode === "wrong-type") {
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end("PRIVATE_PROVIDER_DETAIL");
  }
  let timer;
  res.on("close", () => {
    clearTimeout(timer);
    if (!res.writableEnded) controls.aiAborted++;
  });
  if (mode === "timeout") {
    timer = setTimeout(() => res.end(), 10000);
    return;
  }
  if (!body.stream) {
    res.writeHead(200, { "Content-Type": "application/json" });
    const candidate =
      body.text?.format?.name === "profile_memory"
        ? controls.memoryCandidate
        : controls.goalCandidate;
    return res.end(
      JSON.stringify({
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text:
                  mode === "malformed" ? "{invalid" : JSON.stringify(candidate),
              },
            ],
          },
        ],
      }),
    );
  }
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  if (mode === "malformed") return res.end("data: {invalid}\n\n");
  const action = controls.onboardingAction ?? {
    name: "record_onboarding",
    reply: "Расскажи о своей цели.",
    updates: [],
  };
  const frames = [
    { type: "response.output_text.delta", delta: action.reply },
    {
      type: "response.completed",
      response: {
        status: "completed",
        ...(body.tools
          ? {
              output: [
                {
                  type: "function_call",
                  status: "completed",
                  name: action.name,
                  arguments: JSON.stringify({
                    reply: action.reply,
                    updates: action.updates,
                  }),
                },
              ],
            }
          : {}),
      },
    },
  ];
  if (mode === "empty")
    frames.splice(0, 2, {
      type: "response.completed",
      response: { status: "completed", output: [] },
    });
  if (mode === "incomplete") frames.pop();
  let i = 0;
  function write() {
    if (res.destroyed) return;
    res.write(`data: ${JSON.stringify(frames[i++])}\n\n`);
    if (mode === "slow") return;
    if (i === frames.length) res.end();
    else timer = setTimeout(write, 30);
  }
  timer = setTimeout(write, 30);
}
