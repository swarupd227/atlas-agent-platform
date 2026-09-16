/**
 * Prompts the shell offers before the user has typed anything. Each is sent as
 * an ordinary message, so the answer comes from a tool call with its own proof.
 */
import type { Suggestion } from "./types";

export const STARTERS: Suggestion[] = [
  { label: "Turn a goal into an outcome", prompt: "I have a business goal I want agents to deliver. Help me define it as an outcome." },
  { label: "Build a team for an outcome", prompt: "Propose a team of agents for one of our outcomes." },
  { label: "Which agents are live?", prompt: "Which of my agents are live right now?" },
  { label: "Ask an agent to do something", prompt: "I want one of my agents to do a piece of work. Which ones can I run?" },
];
