'use client';

import { useRef, useEffect, useCallback } from 'react';
import { Bold, Italic, Underline } from 'lucide-react';

interface Props {
  initialValue: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

/** Force LTR on a DOM element imperatively — beats any CSS/bidi heuristics */
function forceLtr(el: HTMLElement) {
  el.setAttribute('dir', 'ltr');
  el.setAttribute('lang', 'en');
  el.style.setProperty('direction', 'ltr', 'important');
  el.style.setProperty('text-align', 'left', 'important');
  el.style.setProperty('unicode-bidi', 'bidi-override', 'important');
}

export default function RichTextEditor({ initialValue, onChange, placeholder }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const prevInitial = useRef<string>(initialValue);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;

    forceLtr(el);
    el.innerHTML = initialValue;
    prevInitial.current = initialValue;

    // Every element the browser creates while editing (p, div, span, h1…)
    // must also be forced LTR, otherwise they inherit the RTL editing context.
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node instanceof HTMLElement) forceLtr(node);
        }
      }
    });
    observer.observe(el, { childList: true, subtree: true });
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync when parent switches language
  useEffect(() => {
    const el = editorRef.current;
    if (!el || prevInitial.current === initialValue) return;
    forceLtr(el);
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

      {/* dir + lang + style must be JSX props so the browser wires LTR editing engine on first render */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        dir="ltr"
        lang="en"
        style={{ direction: 'ltr', unicodeBidi: 'bidi-override', textAlign: 'left', writingMode: 'horizontal-tb' }}
        onInput={handleInput}
        onPaste={handlePaste}
        data-placeholder={placeholder ?? 'დაიწყეთ ტექსტის აკრეფა...'}
        className={[
          'min-h-[450px] p-5 focus:outline-none text-foreground leading-relaxed overflow-y-auto',
          '[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-5 [&_h1]:mb-2',
          '[&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-2',
          '[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1',
          '[&_p]:mb-2 [&_p]:leading-relaxed',
        ].join(' ')}
      />
    </div>
  );
}
