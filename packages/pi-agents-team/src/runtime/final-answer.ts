const FINAL_ANSWER_PATTERN = /<final[_\s-]?answer>([\s\S]*?)<\/final[_\s-]?answer>/i;

function getAssistantText(event) {
  if (typeof event !== "object" || event === null) return undefined;
  if (event.type && event.type !== "message_update") return undefined;

  const message = event.message ?? event.assistantMessageEvent ?? event.assistant_message ?? event;
  if (message.role && message.role !== "assistant") return undefined;

  const content = message.content;
  if (Array.isArray(content)) {
    const text = content
      .filter((part) => part && part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("");
    return text || undefined;
  }
  if (typeof content === "string" && content.length > 0) return content;
  if (typeof message.text === "string" && message.text.length > 0) return message.text;

  return undefined;
}

function extractLastAssistantText(stdout) {
  const lines = stdout.split(/\r?\n/).filter((line) => line.trim().length > 0);
  let lastText;
  for (const line of lines) {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const text = getAssistantText(parsed);
    if (text) lastText = text;
  }
  return lastText;
}

export function extractFinalAnswer(text) {
  const match = FINAL_ANSWER_PATTERN.exec(text);
  if (match) {
    const content = match[1]?.trim();
    if (content && content.length > 0) return content;
  }
  return extractLastAssistantText(text);
}

export function parseFinalAnswerSummaryFields(text) {
  const headline = /^headline:\s*(.+)$/im.exec(text)?.[1]?.trim();
  const nextRecommendation = /^next_recommendation:\s*(.+)$/im.exec(text)?.[1]?.trim();
  const risksBlock = /^risks:\s*$(?<body>(?:\s*[-*]\s+.+\n?)*)/im.exec(text)?.groups?.body ?? "";
  const risks = risksBlock
    .split("\n")
    .map((line) => /^\s*[-*]\s+(.+)$/.exec(line)?.[1]?.trim())
    .filter((line) => Boolean(line));
  return {
    ...(headline ? { headline } : {}),
    ...(risks.length > 0 ? { risks } : {}),
    ...(nextRecommendation ? { nextRecommendation } : {}),
  };
}
