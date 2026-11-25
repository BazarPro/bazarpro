import { Check, Hand, RotateCcw, ShoppingBasket, Timer, Trophy } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { SortMarkBadge } from '../../../../components/sellers/SortMarkBadge';
import { Button } from '../../../../components/ui/button';
import { formatPrice } from '../../../../lib/utils';
import { SORT_COLORS, sortMark } from '../../../../shared/sortCode';
import { cn } from '../../../../lib/utils';
import { HangTag } from '../../landing/components/demo/Illustrations';

/**
 * Four sellers, as a bazaar would draw them: two share the pile 3, so the second step has
 * something to tell apart. Any codes give realistic marks.
 */
const SELLERS = [66_643, 81_253, 40_517, 12_391];
/** Piles on the table: those of the sellers and one nobody has, as on a real bazaar */
const PILES = [1, 3, 5, 7];

interface Label {
  id: number;
  seller: number;
  title: string;
  size: string;
  price: string;
}

/** Three labels per seller, mixed as they come back from the hall; the same on every load */
function makeLabels(items: { title: string; size: string }[], order: number[]): Label[] {
  const labels = items.slice(0, SELLERS.length * 3).map((item, index) => ({
    id: index,
    seller: SELLERS[index % SELLERS.length],
    title: item.title,
    size: item.size,
    price: formatPrice(3 + ((index * 7) % 12)),
  }));
  return order.map((index) => labels[index]).filter(Boolean);
}

const FIRST_ORDER = [5, 0, 10, 3, 8, 1, 6, 11, 2, 9, 4, 7];

function shuffled(count: number): number[] {
  const order = Array.from({ length: count }, (_, index) => index);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

const pileOf = (seller: number) => sortMark(seller).pile;

type Phase = 'piles' | 'baskets' | 'done';

/**
 * A heap of returned labels to sort as helpers do after a bazaar with universal labels:
 * first onto piles by the large digit, then from each pile into the sellers' baskets. Tap
 * the right place, or drag the label there.
 */
export function SortingGame() {
  const { t } = useTranslation('company');
  const items = t('labelsPage.game.items', { returnObjects: true }) as {
    title: string;
    size: string;
  }[];
  const [order, setOrder] = useState(FIRST_ORDER);
  const labels = makeLabels(items, order);

  const [phase, setPhase] = useState<Phase>('piles');
  /** Labels sorted in this phase */
  const [placed, setPlaced] = useState(0);
  const [wrong, setWrong] = useState<string>();
  const [mistakes, setMistakes] = useState(0);
  const [startedAt, setStartedAt] = useState<number>();
  const [seconds, setSeconds] = useState(0);
  const [hint, setHint] = useState<string>();

  // The second step takes the piles one after the other, as helpers do
  const basketOrder = PILES.flatMap((pile) =>
    labels.filter((label) => pileOf(label.seller) === pile)
  );
  const queue = phase === 'piles' ? labels : basketOrder;
  const current = phase === 'done' ? undefined : queue[placed];
  const done = queue.slice(0, placed);

  useEffect(() => {
    if (startedAt === undefined || phase === 'done') return;
    const timer = setInterval(() => setSeconds(Math.round((Date.now() - startedAt) / 1000)), 500);
    return () => clearInterval(timer);
  }, [startedAt, phase]);

  const drop = (target: string) => {
    if (!current) return;
    setStartedAt((started) => started ?? Date.now());
    const right =
      phase === 'piles'
        ? target === `pile-${pileOf(current.seller)}`
        : target === `basket-${current.seller}`;
    if (!right) {
      setMistakes((count) => count + 1);
      setWrong(target);
      setHint(
        phase === 'piles'
          ? t('labelsPage.game.hintPile', { pile: pileOf(current.seller) })
          : t('labelsPage.game.hintBasket')
      );
      setTimeout(() => setWrong(undefined), 450);
      return;
    }
    setHint(undefined);
    if (placed + 1 < queue.length) return setPlaced(placed + 1);
    setPlaced(0);
    setPhase(phase === 'piles' ? 'baskets' : 'done');
  };

  const restart = () => {
    setOrder(shuffled(SELLERS.length * 3));
    setPhase('piles');
    setPlaced(0);
    setMistakes(0);
    setStartedAt(undefined);
    setSeconds(0);
    setHint(undefined);
  };

  const inPile = (pile: number) => {
    const ofPile = (list: Label[]) => list.filter((label) => pileOf(label.seller) === pile).length;
    // In the second step the piles empty one after the other
    if (phase === 'piles') return ofPile(done);
    return phase === 'baskets' ? ofPile(labels) - ofPile(done) : 0;
  };
  const inBasket = (seller: number) =>
    phase === 'done'
      ? 3
      : phase === 'baskets'
        ? done.filter((label) => label.seller === seller).length
        : 0;

  const step = phase === 'piles' ? 1 : 2;
  const activePile = phase === 'baskets' && current ? pileOf(current.seller) : undefined;

  return (
    <div className="overflow-hidden rounded-3xl border bg-card shadow-sm">
      {/* Steps and time */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/40 px-4 py-3 sm:px-6">
        <ol className="flex items-center gap-2 text-sm font-semibold">
          {[1, 2].map((number) => (
            <li
              key={number}
              aria-current={number === step && phase !== 'done' ? 'step' : undefined}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1',
                phase === 'done' || number < step
                  ? 'bg-success-soft text-success-soft-foreground'
                  : number === step
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground'
              )}
            >
              {phase === 'done' || number < step ? (
                <Check className="size-3.5" />
              ) : (
                <span className="tabular-nums">{number}</span>
              )}
              {t(number === 1 ? 'labelsPage.game.step1' : 'labelsPage.game.step2')}
            </li>
          ))}
        </ol>
        <p className="flex items-center gap-3 text-sm text-muted-foreground tabular-nums">
          <span className="inline-flex items-center gap-1">
            <Timer className="size-4" /> {t('labelsPage.game.seconds', { count: seconds })}
          </span>
          <span>
            {t('labelsPage.game.progress', {
              done: phase === 'done' ? labels.length : placed,
              total: labels.length,
            })}
          </span>
        </p>
      </div>

      {phase === 'done' ? (
        <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-tag text-tag-foreground">
            <Trophy className="size-8" />
          </span>
          <p className="text-2xl font-extrabold">
            {t('labelsPage.game.doneTitle', { count: labels.length, seconds })}
          </p>
          <p className="max-w-md text-pretty text-muted-foreground">
            {mistakes === 0
              ? t('labelsPage.game.donePerfect')
              : t('labelsPage.game.doneMistakes', { count: mistakes })}
          </p>
          <Button onClick={restart} variant="outline" size="lg">
            <RotateCcw /> {t('labelsPage.game.again')}
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 p-4 sm:p-6 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-8">
          {/* The heap with the label in hand on top */}
          <div className="flex flex-col items-center gap-3">
            <p className="text-center text-sm font-medium text-muted-foreground" aria-live="polite">
              {phase === 'piles' ? t('labelsPage.game.taskPile') : t('labelsPage.game.taskBasket')}
            </p>
            <div className="relative h-44 w-48">
              {queue.slice(placed + 1, placed + 4).map((label, index) => (
                <div
                  key={label.id}
                  aria-hidden="true"
                  className="absolute inset-x-0 top-2 mx-auto w-40"
                  style={{
                    transform: `rotate(${[-7, 5, -3][index]}deg) translateY(${(index + 1) * 4}px)`,
                    zIndex: 3 - index,
                  }}
                >
                  <HangTag
                    format="small"
                    className="w-40 opacity-90"
                    title={label.title}
                    size={label.size}
                    price={label.price}
                    sortCode={label.seller}
                  />
                </div>
              ))}
              {current && (
                <DraggableLabel key={`${phase}-${current.id}`} label={current} onDrop={drop} />
              )}
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Hand className="size-3.5" /> {t('labelsPage.game.how')}
            </p>
          </div>

          {/* Where it goes */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {PILES.map((pile) => {
                const color = SORT_COLORS[pile];
                const count = inPile(pile);
                const enabled = phase === 'piles';
                return (
                  <button
                    key={pile}
                    type="button"
                    data-drop={`pile-${pile}`}
                    disabled={!enabled}
                    onClick={() => drop(`pile-${pile}`)}
                    aria-label={t('labelsPage.game.pile', { pile })}
                    className={cn(
                      'flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-3 transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
                      enabled && 'hover:border-primary hover:bg-accent',
                      !enabled && activePile !== pile && 'opacity-40',
                      activePile === pile && 'border-solid border-primary bg-primary/5',
                      wrong === `pile-${pile}` &&
                        'animate-shake border-destructive bg-destructive/10'
                    )}
                  >
                    <span
                      className="flex size-14 items-center justify-center rounded-xl font-display text-3xl font-extrabold shadow-sm"
                      style={{
                        background: `rgb(${color.fill.join(' ')})`,
                        color: `rgb(${color.ink.join(' ')})`,
                      }}
                    >
                      {pile}
                    </span>
                    <span className="text-sm font-semibold">
                      {t('labelsPage.game.pile', { pile })}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {t('labelsPage.game.labels', { count })}
                    </span>
                  </button>
                );
              })}
            </div>
            <div
              className={cn(
                'grid grid-cols-2 gap-3 transition-opacity',
                phase === 'piles' && 'opacity-70 grayscale'
              )}
            >
              {SELLERS.map((seller) => {
                const enabled = phase === 'baskets' && activePile === pileOf(seller);
                return (
                  <button
                    key={seller}
                    type="button"
                    data-drop={`basket-${seller}`}
                    disabled={!enabled}
                    onClick={() => drop(`basket-${seller}`)}
                    aria-label={t('labelsPage.game.basket', { count: inBasket(seller) })}
                    className={cn(
                      'flex items-center gap-3 rounded-2xl border bg-background p-3 text-left transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
                      enabled && 'border-primary/60 hover:border-primary hover:bg-accent',
                      phase === 'baskets' && !enabled && 'opacity-60 grayscale',
                      wrong === `basket-${seller}` &&
                        'animate-shake border-destructive bg-destructive/10'
                    )}
                  >
                    <ShoppingBasket className="size-6 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <SortMarkBadge code={seller} className="h-9 sm:h-10" />
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                      {inBasket(seller)}/3
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="min-h-5 text-sm font-medium text-destructive" aria-live="assertive">
              {hint}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** The label in hand: drag it onto a pile or basket; tapping the target works as well. */
function DraggableLabel({ label, onDrop }: { label: Label; onDrop: (target: string) => void }) {
  const [offset, setOffset] = useState<{ x: number; y: number }>();
  const start = useRef<{ x: number; y: number }>(undefined);
  const card = useRef<HTMLDivElement>(null);

  const down = (event: ReactPointerEvent) => {
    start.current = { x: event.clientX, y: event.clientY };
    (event.target as Element).setPointerCapture?.(event.pointerId);
  };
  const move = (event: ReactPointerEvent) => {
    if (!start.current) return;
    setOffset({ x: event.clientX - start.current.x, y: event.clientY - start.current.y });
  };
  const up = (event: ReactPointerEvent) => {
    if (!start.current) return;
    start.current = undefined;
    setOffset(undefined);
    // What lies under the pointer, the label itself left out
    const element = card.current;
    if (element) element.style.visibility = 'hidden';
    const below = document.elementFromPoint(event.clientX, event.clientY);
    if (element) element.style.visibility = '';
    const target = below?.closest<HTMLElement>('[data-drop]:not(:disabled)');
    if (target?.dataset.drop) onDrop(target.dataset.drop);
  };

  return (
    <div
      ref={card}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => {
        start.current = undefined;
        setOffset(undefined);
      }}
      className={cn(
        'absolute inset-x-0 top-0 z-10 mx-auto w-44 cursor-grab touch-none select-none animate-in fade-in-0 zoom-in-95 duration-200',
        offset && 'cursor-grabbing'
      )}
      style={{
        transform: `translate(${offset?.x ?? 0}px, ${offset?.y ?? 0}px) rotate(${offset ? 3 : 0}deg)`,
        transition: offset ? 'none' : 'transform 150ms',
      }}
    >
      <HangTag
        format="small"
        className="w-44 drop-shadow-xl"
        title={label.title}
        size={label.size}
        price={label.price}
        sortCode={label.seller}
      />
    </div>
  );
}
