import { ChangeEvent, useRef, type KeyboardEvent } from 'react';

export function MessageComposer({
  draft,
  setDraft,
  pendingFiles,
  setPendingFiles,
  sending,
  onSubmit
}: {
  draft: string;
  setDraft: (value: string) => void;
  pendingFiles: File[];
  setPendingFiles: (files: File[]) => void;
  sending: boolean;
  onSubmit: () => void;
}) {
  const fileInput = useRef<HTMLInputElement | null>(null);
  const textarea = useRef<HTMLTextAreaElement | null>(null);

  function chooseFiles() {
    fileInput.current?.click();
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    setPendingFiles([...pendingFiles, ...files]);
    event.currentTarget.value = '';
  }

  function removeFile(index: number) {
    setPendingFiles(pendingFiles.filter((_, fileIndex) => fileIndex !== index));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  }

  const hasContent = draft.trim().length > 0 || pendingFiles.length > 0;

  return (
    <form className="composer" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <input ref={fileInput} className="file-input" type="file" accept="image/*,video/*,audio/*" multiple onChange={handleFiles} />
      <div className="composer-top">
        <button className="attach-button" type="button" onClick={chooseFiles} aria-label="Attach media">
          +
        </button>
        <textarea
          ref={textarea}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Write a message. Enter sends, Shift+Enter adds a line."
          rows={1}
        />
        <button className="send-button" type="submit" disabled={!hasContent || sending}>
          {sending ? 'Sending' : 'Send'}
        </button>
      </div>
      {pendingFiles.length > 0 && (
        <div className="pending-files">
          {pendingFiles.map((file, index) => (
            <button className="file-chip" type="button" onClick={() => removeFile(index)} key={`${file.name}-${index}`}>
              <span>{file.name}</span>
              <strong>×</strong>
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
