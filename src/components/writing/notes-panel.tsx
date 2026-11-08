"use client";

import { useLocale } from "@/lib/i18n";

interface NotesPanelProps {
  notes: string;
  onNotesChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * Right-hand scratchpad. Generation context comes from the outline, confirmed
 * sections and the per-section requirements entered in the editor; these notes
 * are a local writing aid and are not sent to the model.
 */
export function NotesPanel({ notes, onNotesChange, disabled }: NotesPanelProps) {
  const { t } = useLocale();
  const re = t.writing.referenceExtra;

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="border-b border-border px-4 py-3.5">
        <h3 className="text-sm font-semibold text-foreground">{re.sectionNotes}</h3>
      </div>
      <div className="flex-1 p-4">
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder={re.sectionNotesPlaceholder}
          disabled={disabled}
          className="h-full w-full resize-none rounded-xl border border-border bg-background p-3 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>
    </div>
  );
}
