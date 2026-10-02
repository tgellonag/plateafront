"use client";

import { useActionState } from "react";
import { ask } from "@/modules/llm/api";
import type { LlmResponse } from "@/modules/llm/types";

type State = { result?: LlmResponse; error?: string };

async function submit(_: State, form: FormData): Promise<State> {
  try {
    return { result: await ask(String(form.get("q"))) };
  } catch {
    return { error: "The AI couldn't answer. Try again." };
  }
}

export function AskForm() {
  const [state, action, pending] = useActionState(submit, {});

  return (
    <section className="mt-8">
      <form action={action} className="flex gap-2">
        <input
          name="q"
          required
          maxLength={30}
          placeholder="Ask the AI…"
          aria-label="Question"
          className="flex-1 rounded border border-secondary/40 bg-transparent px-3 py-2 text-base"
        />
        <button
          disabled={pending}
          className="rounded bg-primary px-4 py-2 text-base text-white disabled:opacity-50"
        >
          {pending ? "Thinking…" : "Ask"}
        </button>
      </form>
      {state.result && <p className="mt-3 text-base">{state.result.answer}</p>}
      {state.error && <p className="mt-3 text-sm text-primary">{state.error}</p>}
    </section>
  );
}
