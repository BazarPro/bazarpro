import { ArrowRight, Check, PartyPopper } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { Button } from './button';
import type { NextStep } from './next-steps';

/**
 * The way through a bazaar as a line of stops: done ones in petrol with a tick, the one
 * due now in tag yellow with a ring, the rest outlined. Every stop leads to its page. On
 * phones only the stops show, with the step due now named below them.
 */
export function BazaarRoadmap({
  steps,
  label,
  nowLabel,
  positionLabel,
}: {
  steps: NextStep[];
  /** Heading above the stops, also the name of the navigation */
  label: string;
  /** Under the step due now, e.g. "Jetzt dran" */
  nowLabel: string;
  /** Phones: where the bazaar stands, e.g. "Schritt 4 von 5" */
  positionLabel?: (position: number, total: number) => string;
}) {
  const currentIndex = steps.findIndex((step) => step.current);
  const current = steps[currentIndex];
  const width = 100 / steps.length;
  const headingId = useId();
  return (
    <nav aria-labelledby={headingId}>
      <h2 id={headingId} className="mb-3 px-2 text-base font-bold">
        {label}
      </h2>
      <ol
        className="relative grid"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      >
        {/* The line between the stops: petrol only where both ends are done */}
        {steps.slice(1).map((step, index) => (
          <span
            key={step.id}
            aria-hidden="true"
            className={cn(
              'absolute top-4 h-0.5',
              steps[index].done && step.done ? 'bg-primary' : 'bg-input'
            )}
            style={{ left: `${width * (index + 0.5)}%`, width: `${width}%` }}
          />
        ))}
        {steps.map((step, index) => {
          const Icon = step.icon;
          const content = (
            <>
              <span
                className={cn(
                  'relative z-10 mx-auto flex size-8 items-center justify-center rounded-full border-2 bg-background font-display text-sm font-extrabold',
                  step.done && 'border-primary bg-primary text-primary-foreground',
                  step.current && 'border-foreground bg-tag text-tag-foreground ring-4 ring-tag/35',
                  !step.done && !step.current && 'border-input text-muted-foreground'
                )}
              >
                {step.done ? (
                  <Check className="size-4" strokeWidth={3} />
                ) : step.current ? (
                  <Icon className="size-4" />
                ) : (
                  index + 1
                )}
              </span>
              <span className="mt-2 block px-1 text-center sr-only sm:not-sr-only">
                <span
                  className={cn(
                    'block text-sm leading-tight',
                    step.current ? 'font-bold' : 'font-medium'
                  )}
                >
                  {step.title}
                </span>
                {step.current && (
                  <span className="mt-1 block text-xs font-semibold text-tag-soft-foreground">
                    {nowLabel}
                  </span>
                )}
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
            <li key={step.id} aria-current={step.current ? 'step' : undefined}>
              {step.to ? (
                <Link
                  to={step.to}
                  state={step.state}
                  className="block rounded-lg py-1 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring"
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
      {/* Phones: the names do not fit under the stops, so the one due now is named here */}
      <p aria-hidden="true" className="mt-2 text-center text-sm sm:hidden">
        {current && (
          <>
            {positionLabel && (
              <span className="text-muted-foreground">
                {positionLabel(currentIndex + 1, steps.length)} ·{' '}
              </span>
            )}
            <span className="font-bold">{current.title}</span>
          </>
        )}
      </p>
    </nav>
  );
}

/**
 * The one thing to do now, with its button: a calm card with a tag-yellow edge, the step's
 * icon on a yellow tile, title and figures, the button at the end of the row (below it
 * when the card is narrow). Without a step due, `doneText` says all is done.
 */
export function NextStepCard({
  step,
  eyebrow,
  action,
  doneText,
  header,
  children,
}: {
  step: NextStep | undefined;
  eyebrow: ReactNode;
  action: ReactNode;
  doneText: ReactNode;
  /** Above the step in the same card, e.g. the roadmap */
  header?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="@container relative overflow-hidden rounded-xl border bg-card shadow-sm">
      {header && <div className="border-b bg-muted/40 px-2 pb-3 pt-4 sm:px-4">{header}</div>}
      <div data-testid="next-step" className="relative space-y-4 p-5 pl-6 sm:p-6 sm:pl-7">
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5 bg-tag" />
        {step ? (
          <div className="flex flex-col gap-4 @xl:flex-row @xl:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <span
                aria-hidden="true"
                className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-tag text-tag-foreground shadow-xs"
              >
                <step.icon className="size-6" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-tag-soft-foreground">{eyebrow}</p>
                <h2 className="text-xl font-extrabold leading-tight sm:text-2xl">{step.title}</h2>
                {step.text && <p className="mt-1 text-muted-foreground">{step.text}</p>}
              </div>
            </div>
            {step.to && (
              <Button asChild size="lg" className="shrink-0 @max-xl:w-full">
                <Link to={step.to} state={step.state}>
                  {action}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <p className="flex items-center gap-3 text-lg font-semibold">
            <PartyPopper className="size-6 shrink-0 text-primary" />
            {doneText}
          </p>
        )}
        {children}
      </div>
    </section>
  );
}
