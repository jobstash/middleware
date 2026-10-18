import { BadRequestException } from "@nestjs/common";

export function replySuggestions(event: Record<string, unknown>): {
  type: "suggestions";
  question: string;
  replies: string[];
} {
  const { question, replies } = event;
  if (
    typeof question !== "string" ||
    !question.trim() ||
    question.length > 240 ||
    !Array.isArray(replies) ||
    replies.length < 2 ||
    replies.length > 4 ||
    replies.some(
      reply => typeof reply !== "string" || !reply.trim() || reply.length > 80,
    )
  )
    throw new BadRequestException(
      "Use one short question and 2–4 short replies",
    );
  const cleaned = replies.map((reply: string) => reply.trim());
  if (
    new Set(cleaned.map(reply => reply.toLowerCase())).size !== cleaned.length
  )
    throw new BadRequestException("Reply suggestions must be distinct");
  return { type: "suggestions", question: question.trim(), replies: cleaned };
}
