/**
 * Prompts the shell offers before the user has typed anything. Each is sent as
 * an ordinary message, so the answer comes from a tool call with its own proof.
 */
import type { Suggestion } from "./types";

export const STARTERS: Suggestion[] = [
  { label: "Which agents are live?", prompt: "Which of my agents are live right now?" },
  { label: "What can my agents connect to?", prompt: "What connectors can my agents use, and which are connected?" },
  { label: "Our industry context", prompt: "What industry and regulatory context applies to us?" },
  { label: "Ask an agent to do something", prompt: "I want one of my agents to do a piece of work. Which ones can I run?" },
];
