import { ArrowRight, Check, PartyPopper } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { Button } from './button';
import type { NextStep } from './next-steps';

/**
 * The way through a bazaar and what to do now, in one calm card: a thin bar per stop on
 * top, below it the step due now with its one button.
 */
export function BazaarJourney({
  steps,
  label,
  nowLabel,
  positionLabel,
  action,
  doneText,
  context,
  children,
}: {
  steps: NextStep[];
  /** Heading above the stops, also the name of the navigation */
  label: string;
  /** "Jetzt dran" */
  nowLabel: string;
  /** "Schritt 4 von 5" */
  positionLabel: (position: number, total: number) => string;
  /** The words of the one button */
  action: ReactNode;
  /** Without a step due: all is done */
  doneText: ReactNode;
  /** Small line under the title, e.g. the bazaar it is about */
  context?: ReactNode;
  /** More below the step, e.g. steps left behind */
  children?: ReactNode;
}) {
  const currentIndex = steps.findIndex((step) => step.current);
  const current = steps[currentIndex];
  return (
    <section data-testid="bazaar-journey" className="rounded-xl border bg-card shadow-xs">
      <div className="px-4 pt-4 sm:px-6">
        <BazaarRoadmap steps={steps} label={label} nowLabel={nowLabel} />
      </div>
      <NextStepCard
        step={current}
        eyebrow={
          current ? `${nowLabel} · ${positionLabel(currentIndex + 1, steps.length)}` : undefined
        }
        action={action}
        doneText={doneText}
        context={context}
        inJourney
      >
        {children}
      </NextStepCard>
    </section>
  );
}

/**
 * The stops of a bazaar as thin bars: blue when done, tag yellow for the one due now,
 * dashed yellow for ones left behind, grey for the rest. Every stop leads to its page.
 * On phones only the bars show; the card below names the one due now.
 */
export function BazaarRoadmap({
  steps,
  label,
  nowLabel,
}: {
  steps: NextStep[];
  /** Heading above the stops, also the name of the navigation */
  label: string;
  /** For screen readers at the stop due now, e.g. "Jetzt dran" */
  nowLabel: string;
}) {
  const headingId = useId();
  return (
    <nav aria-labelledby={headingId}>
      <h2 id={headingId} className="mb-2.5 text-sm font-semibold text-muted-foreground">
        {label}
      </h2>
      <ol
        className="grid gap-1.5 sm:gap-2"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      >
        {steps.map((step) => {
          const content = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  'block h-1.5 rounded-full',
                  step.done ? 'bg-primary' : step.current ? 'bg-tag' : 'bg-muted'
                )}
              />
              <span
                className={cn(
                  'mt-1.5 flex items-center gap-1 text-xs leading-snug sr-only sm:not-sr-only',
                  step.current ? 'font-semibold text-foreground' : 'text-muted-foreground'
                )}
              >
                {step.done && <Check className="size-3 shrink-0 text-primary" strokeWidth={3} />}
                <span className="truncate">{step.title}</span>
                {step.current && <span className="sr-only"> ({nowLabel})</span>}
                {/* The figures stand in the card below; here only for screen readers */}
                {step.text && (
                  <>
                    <span className="sr-only">: </span>
                    <span className="sr-only">{step.text}</span>
                  </>
                )}
              </span>
            </>
          );
          return (
            <li key={step.id} aria-current={step.current ? 'step' : undefined} className="min-w-0">
              {step.to ? (
                <Link
                  to={step.to}
                  state={step.state}
                  className="block rounded-md py-1 outline-none transition-opacity hover:opacity-75 focus-visible:ring-[3px] focus-visible:ring-ring"
                >
                  {content}
                </Link>
              ) : (
                <div className="py-1">{content}</div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * The one thing to do now, with its button. Inside the journey it continues the card;
 * alone it is a card of its own. Without a step due, `doneText` says all is done.
 */
export function NextStepCard({
  step,
  eyebrow,
  action,
  doneText,
  context,
  inJourney = false,
  children,
}: {
  step: NextStep | undefined;
  eyebrow?: ReactNode;
  action: ReactNode;
  doneText: ReactNode;
  context?: ReactNode;
  /** Part of BazaarJourney: no frame of its own */
  inJourney?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      data-testid="next-step"
      className={cn('@container', inJourney ? 'mt-3 border-t' : 'rounded-xl border bg-card')}
    >
      <div className="space-y-3 p-4 sm:px-6 sm:py-5">
        {step ? (
          <div className="flex flex-col gap-3 @xl:flex-row @xl:items-center @xl:gap-6">
            <div className="flex min-w-0 flex-1 items-start gap-3.5">
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-tag-soft text-tag-soft-foreground"
              >
                <step.icon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                {eyebrow && (
                  <p className="text-xs font-semibold text-muted-foreground">{eyebrow}</p>
                )}
                <h2 className="text-lg font-bold leading-snug">{step.title}</h2>
                {step.text && <p className="text-sm text-muted-foreground">{step.text}</p>}
                {context && (
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">{context}</p>
                )}
              </div>
            </div>
            {step.to && (
              <Button asChild className="shrink-0 @max-xl:w-full">
                <Link to={step.to} state={step.state}>
                  {action}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <p className="flex items-center gap-3 font-semibold">
            <PartyPopper className="size-5 shrink-0 text-primary" />
            {doneText}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
