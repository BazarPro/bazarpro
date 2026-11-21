import { Info } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

const WIDTH = 288;
const MARGIN = 8;

/**
 * A small (i) next to a label: the explanation shows on hover and focus, a tap opens it on
 * phones. The bubble is placed on the page itself, so cards with hidden overflow cannot cut it.
 * With `trigger`, a text opens it instead of the (i), e.g. postal codes that show their map.
 */
export function InfoTip({
  children,
  label,
  className,
  trigger,
  width: maxWidth = WIDTH,
  bubbleClassName,
}: {
  children: ReactNode;
  /** Spoken name of the button; defaults to "Mehr erfahren", none for a `trigger` */
  label?: string;
  className?: string;
  /** Shown instead of the (i) */
  trigger?: ReactNode;
  /** Of the bubble in pixels */
  width?: number;
  bubbleClassName?: string;
}) {
  const { t } = useTranslation('common');
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; above: boolean }>();
  const open = hovered || pinned;

  const place = useCallback(() => {
    const rect = button.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(maxWidth, window.innerWidth - 2 * MARGIN);
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - width / 2, MARGIN),
      window.innerWidth - width - MARGIN
    );
    // Above when there is little room below, e.g. next to the sticky buttons
    const room = trigger ? 280 : 180;
    const above = window.innerHeight - rect.bottom < room && rect.top > room;
    setPosition({ top: above ? rect.top - 6 : rect.bottom + 6, left, above });
  }, [maxWidth, trigger]);

  useEffect(() => {
    if (!open) return;
    place();
    const close = (event: Event) => {
      if (event.type === 'keydown' && (event as KeyboardEvent).key !== 'Escape') return;
      if (event.type === 'pointerdown' && button.current?.contains(event.target as Node)) return;
      setPinned(false);
      setHovered(false);
    };
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', close);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      document.removeEventListener('keydown', close);
      document.removeEventListener('pointerdown', close);
    };
  }, [open, place]);

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={trigger ? label : (label ?? t('moreInfo'))}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        // Inside a label a click would toggle its checkbox
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setPinned((value) => !value);
        }}
        onPointerEnter={(event) => event.pointerType === 'mouse' && setHovered(true)}
        onPointerLeave={(event) => event.pointerType === 'mouse' && setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => {
          setHovered(false);
          setPinned(false);
        }}
        className={cn(
          trigger
            ? 'inline cursor-help rounded-sm text-left underline decoration-dotted decoration-from-font underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            : 'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground/80 transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          open && !trigger && 'bg-primary/10 text-primary',
          className
        )}
      >
        {trigger ?? <Info className="h-3.5 w-3.5" />}
      </button>
      {open &&
        position &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            style={{
              top: position.top,
              left: position.left,
              width: Math.min(maxWidth, window.innerWidth - 2 * MARGIN),
            }}
            className={cn(
              'pointer-events-none fixed z-[100] rounded-lg border bg-popover px-3 py-2 text-xs font-normal leading-relaxed text-popover-foreground shadow-lg animate-in fade-in zoom-in-95 duration-150',
              position.above && '-translate-y-full',
              bubbleClassName
            )}
          >
            {children}
          </div>,
          document.body
        )}
    </>
  );
}

/** A label with its explanation behind an (i), the usual head of a form field. */
export function LabelWithInfo({
  htmlFor,
  children,
  info,
  className,
}: {
  htmlFor?: string;
  children: ReactNode;
  info?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-h-5 items-center gap-1', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium leading-none">
        {children}
      </label>
      {info && <InfoTip>{info}</InfoTip>}
    </div>
  );
}
