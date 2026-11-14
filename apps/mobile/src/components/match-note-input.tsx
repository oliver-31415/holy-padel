import type { ReactNode } from "react";
import { TextField } from "@/components/controls.tsx";

/** The optional pre-match note input, shown on the setup screen. */
export function MatchNoteInput({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (next: string) => void;
}): ReactNode {
  return (
    <TextField
      value={value}
      onChangeText={onChange}
      placeholder="Add a note — league night, new racket…"
      multiline={true}
      style={{ textAlignVertical: "top" }}
      testID="match-note"
    />
  );
}
