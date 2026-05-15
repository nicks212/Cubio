'use client';

import { useRef, useEffect, useCallback } from 'react';
import { Bold, Italic, Underline } from 'lucide-react';

interface Props {
  initialValue: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export default function RichTextEditor({ initialValue, onChange, placeholder }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const prevInitial = useRef<string>(initialValue);

  // Seed content on mount
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = initialValue;
      prevInitial.current = initialValue;
    }
  }, []);

  // Sync when parent switches language
  useEffect(() => {
    const el = editorRef.current;
    if (!el || prevInitial.current === initialValue) return;
    el.innerHTML = initialValue;
    prevInitial.current = initialValue;
  }, [initialValue]);

  const exec = useCallback(
    (command: string, value?: string) => {
      editorRef.current?.focus();
      document.execCommand(command, false, value ?? undefined);
      if (editorRef.current) onChange(editorRef.current.innerHTML);
    },
    [onChange],
  );

  const handleInput = useCallback(() => {
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  }, [onChange]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const plain = e.clipboardData.getData('text/plain');
    if (!plain) return;
    document.execCommand('insertText', false, plain);
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  }, [onChange]);

  const ToolBtn = ({
    title, cmd, val, children,
  }: { title: string; cmd: string; val?: string; children: React.ReactNode }) => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); exec(cmd, val); }}
      className="px-2.5 py-1.5 rounded hover:bg-slate-200 text-foreground transition-colors leading-none"
    >
      {children}
    </button>
  );

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-white">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border bg-slate-50 flex-wrap">
        <ToolBtn title="Heading 1" cmd="formatBlock" val="h1">
          <span className="text-base font-extrabold">H1</span>
        </ToolBtn>
        <ToolBtn title="Heading 2" cmd="formatBlock" val="h2">
          <span className="text-sm font-bold">H2</span>
        </ToolBtn>
        <ToolBtn title="Heading 3" cmd="formatBlock" val="h3">
          <span className="text-xs font-bold">H3</span>
        </ToolBtn>
        <ToolBtn title="Paragraph" cmd="formatBlock" val="p">
          <span className="text-sm">¶</span>
        </ToolBtn>
        <div className="w-px h-5 bg-slate-300 mx-1 flex-shrink-0" />
        <ToolBtn title="Bold" cmd="bold"><Bold className="w-4 h-4" /></ToolBtn>
        <ToolBtn title="Italic" cmd="italic"><Italic className="w-4 h-4" /></ToolBtn>
        <ToolBtn title="Underline" cmd="underline"><Underline className="w-4 h-4" /></ToolBtn>
      </div>

      {/* Editable area - normal standard contentEditable */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={handlePaste}
        data-placeholder={placeholder ?? 'დაიწყეთ ტექსტის აკრეფა...'}
        className={[
          'min-h-[450px] p-5 focus:outline-none text-foreground leading-relaxed overflow-y-auto',
          'text-left',
          '[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-5 [&_h1]:mb-2',
          '[&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-2',
          '[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1',
          '[&_p]:mb-2 [&_p]:leading-relaxed',
        ].join(' ')}
      />
    </div>
  );
}
