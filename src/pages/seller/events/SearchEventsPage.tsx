import { PageHeader } from '../../../components/ui/page-header';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog';
import { useQuery, useMutation } from '../../../lib/api/react';
import { api } from '../../../lib/api/functions';

import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { ImageWithFallback } from '../../../components/ui/image-with-fallback';
import { CardGridSkeleton, Loading } from '../../../components/ui/loading';
import {
  Calendar,
  CalendarClock,
  MapPin,
  Check,
  Package,
  LogOut,
  Search,
  Megaphone,
  Clock,
  Users,
  Ban,
  MapPinned,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import type { Doc, Exclusion, Id } from '../../../lib/api/types';
import { useState } from 'react';
import {
  BazaarFilters,
  BazaarResultCard,
  BazaarResultsHeading,
  BazaarSearchBar,
  BazaarSearchEmpty,
} from '../../../components/events/BazaarSearch';
import { useBazaarSearch } from '../../../hooks/useBazaarSearch';
import { EventRegistrationDialog } from '../../../components/events/EventRegistrationDialog';
import { cn, formatDateDE, formatDateRangeDE } from '../../../lib/utils';
import { describeSellerSchedule } from '../../../lib/sellerFees';
import { stripMarkdownToText } from '../../../lib/markdown';
import { toast } from 'sonner';
import { getUserFacingErrorMessage } from '../../../lib/errors';
import { PostRegistrationSuccessDialog } from '../../../components/events/PostRegistrationSuccessDialog';
import { useTranslation } from 'react-i18next';
import { formatEventPlace } from '../../../shared/eventJsonLd';
import { describeRegistration } from '../../../components/participation/registrationText';
import { useMarkNoticesSeen } from '../../../hooks/useMarkNoticesSeen';
import { isEventOver } from '../../../shared/eventPhase';
import { RegionMapLink } from '../../../components/events/RegionMap';

function EventCard({
  event,
  isRegistered,
  exclusion,
  unreadMessages = 0,
  onJoin,
  onboardingId,
}: {
  event: Doc<'events'>;
  isRegistered: boolean;
  /** The organizer took the seller out: no joining, no leaving */
  exclusion?: Exclusion;
  /** New messages of the organizer; they are shown on the bazaar page */
  unreadMessages?: number;
  onJoin: (event: Doc<'events'>) => void;
  onboardingId?: string;
}) {
  const { t } = useTranslation('events');
  const navigate = useNavigate();
  const productCount = useQuery(
    api.events.getMyProductCountForEvent,
    isRegistered ? { eventId: event._id } : 'skip'
  );
  const sellerNumber = useQuery(
    api.sellerNumbers.getMySellerNumber,
    isRegistered ? { eventId: event._id } : 'skip'
  );
  const leaveEvent = useMutation(api.events.leaveEvent);

  const handleLeave = async () => {
    try {
      await leaveEvent({ eventId: event._id });
      toast.success(t('search.left', { event: event.title }));
    } catch (error) {
      console.error(error);
      const description = getUserFacingErrorMessage(error, {
        fallback: t('search.unknownError'),
      });
      toast.error(t('search.leaveFailed'), { description });
    }
  };

  const productCountLabel =
    productCount !== undefined ? t('search.products', { count: productCount }) : '…';
  const schedule = isRegistered ? describeSellerSchedule(event).rows : [];
  // Closed, not open yet or full: say so instead of a button that only fails
  const registration =
    isRegistered || exclusion ? undefined : describeRegistration(event, Date.now());
  const closedText = registration?.blocked;

  return (
    <div
      data-onboarding-id={onboardingId}
      className={cn(
        // The whole card opens the bazaar: the title link stretches over it (#299), the
        // buttons on it lie above and keep their own action
        'relative bg-card rounded-xl border shadow-xs overflow-hidden hover:shadow-md hover:border-primary/40 transition-shadow flex flex-col h-full',
        'has-[[data-card-link]:focus-visible]:ring-2 has-[[data-card-link]:focus-visible]:ring-ring has-[[data-card-link]:focus-visible]:ring-offset-2',
        exclusion && 'border-destructive/40'
      )}
    >
      <div className="aspect-[2/1] overflow-hidden relative sm:aspect-video">
        <ImageWithFallback
          storageId={event.coverImage}
          alt={event.title}
          className="w-full h-full object-cover"
        />
        {exclusion ? (
          <Badge variant="destructive" className="absolute top-2 right-2">
            <Ban /> {t('search.excluded')}
          </Badge>
        ) : (
          isRegistered && (
            <Badge variant="success" className="absolute top-2 right-2">
              <Check /> {t('search.registered')}
              {sellerNumber ? ` · ${t('search.sellerNumber', { number: sellerNumber })}` : ''}
            </Badge>
          )
        )}
      </div>
      <div className="p-5 flex-1 flex flex-col">
        <div className="flex justify-between items-start mb-2 gap-2">
          <h3
            className="text-lg font-semibold leading-snug line-clamp-2 break-words"
            title={event.title}
          >
            <Link
              to={`/public-events/${event._id}`}
              state={{ from: '/browse-events' }}
              data-card-link
              className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
            >
              {event.title}
            </Link>
          </h3>
        </div>
        <div className="mb-4 flex-1">
          <p className="text-sm text-muted-foreground line-clamp-2">
            {stripMarkdownToText(event.description)}
          </p>
        </div>

        <div className="space-y-2 mb-5">
          {exclusion && (
            // The full notice with the reason is on the bazaar page behind "Details"
            <div className="flex items-start gap-2 text-sm">
              <Ban className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
              <span className="text-destructive">
                {t('search.excludedSince', { date: formatDateDE(exclusion.excludedAt) })}
              </span>
            </div>
          )}
          <div className="flex items-start gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <span className="text-muted-foreground">
              {formatDateRangeDE(event.startDate, event.endDate)}
            </span>
          </div>
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <span className="text-muted-foreground line-clamp-2" title={formatEventPlace(event)}>
              {formatEventPlace(event)}
            </span>
          </div>
          {schedule.map((row) => (
            <div key={row.label} className="flex items-start gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <span className="text-muted-foreground">
                <span className="font-medium text-foreground">{row.label}:</span> {row.value}
              </span>
            </div>
          ))}
          {registration?.until && (
            <div className="flex items-start gap-2 text-sm">
              <CalendarClock className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <span className="text-muted-foreground">{registration.until}</span>
            </div>
          )}
          {registration?.spots && (
            <div className="flex items-start gap-2 text-sm">
              <Users className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <span className="text-muted-foreground">{registration.spots}</span>
            </div>
          )}
          {registration?.region && (
            <div className="flex items-start gap-2 text-sm">
              <MapPinned className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              {/* Above the link of the card, so the pointer reaches the map */}
              <span className="relative z-10 text-muted-foreground">
                <RegionMapLink
                  image={event.regionMapImage}
                  codes={registration.regionCodes}
                  className="text-primary"
                >
                  {registration.region}
                </RegionMapLink>
              </span>
            </div>
          )}
          {unreadMessages > 0 && (
            <button
              onClick={() =>
                navigate(`/public-events/${event._id}`, { state: { from: '/browse-events' } })
              }
              className="relative z-10 flex items-center gap-2 text-sm font-medium text-destructive hover:underline"
            >
              <Megaphone className="h-4 w-4" />
              {t('search.newMessages', { count: unreadMessages })}
            </button>
          )}
          {isRegistered && (
            <button
              onClick={() => navigate('/my-products', { state: { filterEvent: event._id } })}
              className="relative z-10 flex items-center gap-2 text-sm font-medium text-primary hover:underline transition-all cursor-pointer"
            >
              <Package className="h-4 w-4" />
              <span>{t('search.productsAndLabels', { products: productCountLabel })}</span>
            </button>
          )}
        </div>

        <div className="relative z-10 flex gap-2 mt-auto">
          {/* Registered: the bazaar's page is the way on; joining is the action otherwise */}
          <Button
            variant={isRegistered && !exclusion ? 'default' : 'outline'}
            className="flex-1"
            onClick={() =>
              navigate(`/public-events/${event._id}`, {
                state: { from: '/browse-events' },
              })
            }
          >
            {t('search.details')}
          </Button>
          {exclusion ? null : !isRegistered ? (
            <Button className="flex-1" disabled={!!closedText} onClick={() => onJoin(event)}>
              {closedText ?? t('search.join')}
            </Button>
          ) : (
            <ConfirmDialog
              trigger={
                <Button
                  variant="ghost"
                  className="gap-2 text-muted-foreground hover:text-destructive"
                  aria-label={t('search.leaveLabel')}
                >
                  <LogOut className="h-4 w-4" />
                  {t('search.leave')}
                </Button>
              }
              title={t('search.leaveTitle')}
              description={t('search.leaveConfirm', { event: event.title })}
              confirmLabel={t('search.leave')}
              onConfirm={handleLeave}
              destructive
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function SearchEventsPage() {
  const { t } = useTranslation('events');
  const allEvents = useQuery(api.events.get, { includePast: true }) as Doc<'events'>[] | undefined;
  const categories = useQuery(api.categories.getAllCategories, {});
  const search = useBazaarSearch(allEvents, categories);
  // Only the search looks into the past; the own bazaars are those still to come
  const includePast = false;
  const registeredEvents = useQuery(api.events.getMyRegisteredEvents, { includePast }) as
    | Doc<'events'>[]
    | undefined;
  const unreadMessages = useQuery(api.broadcasts.getMyUnreadMessages, {}) ?? {};
  const excludedEvents = useQuery(api.eventExclusions.getMyExcludedEvents, { includePast });
  // The excluded bazaars are right here among the seller's own
  useMarkNoticesSeen('participation');

  // State for Registration Dialog
  const [selectedEvent, setSelectedEvent] = useState<{
    id: Id<'events'>;
    title: string;
    hasAccessCode: boolean;
    conditions: Doc<'events'>;
  } | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSuccessDialogOpen, setIsSuccessDialogOpen] = useState(false);

  const handleJoinClick = (event: Doc<'events'>) => {
    setSelectedEvent({
      id: event._id,
      title: event.title,
      hasAccessCode: !!event.accessCode,
      conditions: event,
    });
    setIsDialogOpen(true);
  };

  const handleRegistrationSuccess = () => {
    setIsSuccessDialogOpen(true);
  };

  const now = Date.now();
  const isLoading =
    allEvents === undefined || registeredEvents === undefined || excludedEvents === undefined;
  const registeredEventIds = new Set(registeredEvents?.map((event) => event._id));
  const exclusions = new Map(excludedEvents?.map(({ event, exclusion }) => [event._id, exclusion]));
  // Excluded with items handed in, they are still a seller: listed once
  const myEvents = [
    ...(registeredEvents ?? []),
    ...(excludedEvents ?? [])
      .map(({ event }) => event)
      .filter((event) => !registeredEventIds.has(event._id)),
  ].sort((a, b) => a.startDate - b.startDate);

  // The search finds new bazaars; the own ones stand above it
  const found = search.results?.filter(
    ({ event }) => !registeredEventIds.has(event._id) && !exclusions.has(event._id)
  );

  const renderCard = (event: Doc<'events'>, onboardingId?: string) => (
    <div key={event._id} className={isEventOver(event, now) ? 'opacity-75 grayscale-[0.5]' : ''}>
      <EventCard
        event={event}
        isRegistered={registeredEventIds.has(event._id)}
        exclusion={exclusions.get(event._id)}
        unreadMessages={unreadMessages[event._id]?.count}
        onJoin={handleJoinClick}
        onboardingId={onboardingId}
      />
    </div>
  );

  return (
    <div>
      <div className="page-wide">
        <PageHeader
          title={t('search.title')}
          className="mb-8"
          actions={
            myEvents.length > 0 && (
              // With own bazaars on top, finding a new one is one tap away
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  const heading = document.getElementById('new-events-heading');
                  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
                  heading?.scrollIntoView({ behavior: still ? 'auto' : 'smooth' });
                  heading?.parentElement
                    ?.querySelector<HTMLInputElement>('input')
                    ?.focus({ preventScroll: true });
                }}
              >
                <Search className="h-4 w-4" />
                {t('search.findNew')}
              </Button>
            )
          }
        />

        <div data-onboarding-id="events-search-main" className="space-y-10">
          {isLoading ? (
            <Loading>
              <CardGridSkeleton className="xl:grid-cols-3 lg:grid-cols-2 gap-6" />
            </Loading>
          ) : (
            <>
              {myEvents.length > 0 && (
                <section aria-labelledby="my-events-heading" className="space-y-4">
                  <h2 id="my-events-heading" className="text-lg font-semibold">
                    {t('search.mine')}
                  </h2>
                  <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-6">
                    {myEvents.map((event) => renderCard(event))}
                  </div>
                </section>
              )}

              <section aria-labelledby="new-events-heading" className="space-y-4">
                {/* Only needed to tell it apart from the own bazaars above */}
                <h2
                  id="new-events-heading"
                  className={myEvents.length > 0 ? 'text-lg font-semibold' : 'sr-only'}
                >
                  {t('search.discover')}
                </h2>
                <BazaarSearchBar search={search} />
                <BazaarFilters search={search} categories={categories} />
                <BazaarResultsHeading search={{ ...search, results: found }} />
                {found && found.length > 0 ? (
                  <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                    {found.map((result, index) => {
                      const closed = describeRegistration(result.event, now).blocked;
                      return (
                        <div
                          key={result.event._id}
                          data-onboarding-id={index === 0 ? 'events-search-first-card' : undefined}
                        >
                          <BazaarResultCard
                            found={result}
                            from={`/browse-events${window.location.search}`}
                            actions={
                              !isEventOver(result.event, now) && (
                                <Button
                                  className="flex-1"
                                  disabled={!!closed}
                                  onClick={() => handleJoinClick(result.event)}
                                >
                                  {closed ?? t('search.join')}
                                </Button>
                              )
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <BazaarSearchEmpty
                    search={search}
                    noneText={t('search.noneNew')}
                    hidden={(search.results?.length ?? 0) - (found?.length ?? 0)}
                  />
                )}
              </section>
            </>
          )}
        </div>
      </div>

      {selectedEvent && (
        <EventRegistrationDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          eventId={selectedEvent.id}
          eventTitle={selectedEvent.title}
          hasAccessCode={selectedEvent.hasAccessCode}
          conditions={selectedEvent.conditions}
          onSuccess={handleRegistrationSuccess}
        />
      )}

      {selectedEvent && (
        <PostRegistrationSuccessDialog
          open={isSuccessDialogOpen}
          onOpenChange={setIsSuccessDialogOpen}
          eventTitle={selectedEvent.title}
          eventId={selectedEvent.id}
        />
      )}
    </div>
  );
}
