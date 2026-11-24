import { Check, MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { ReasonDialog } from '../../components/moderation/ReasonDialog';
import { SearchInput } from '../../components/ui/search-input';
import { PageHeader } from '../../components/ui/page-header';
import { useMutation, useQuery } from '../../lib/api/react';
import { api } from '../../lib/api/functions';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMemo, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { dateLocale } from '../../i18n/format';
import type { Doc, Id } from '../../lib/api/types';
import { toast } from 'sonner';
import {
  ModerationActionDialog,
  type ModerationRequest,
} from '../../components/moderation/ModerationActionDialog';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { FilterTabs } from './components/AdminShared';
import { useTranslation } from 'react-i18next';
import { TableRowsSkeleton } from '../../components/ui/loading';
import { Pagination } from '../../components/ui/pagination';
import { usePagedItems } from '../../hooks/usePagedItems';
import { formatEventPlace } from '../../shared/eventJsonLd';
import { eventPhase } from '../../shared/eventPhase';
import { EventPhaseBadge } from '../../components/events/EventPhaseBadge';

type AdminEvent = Doc<'events'> & {
  isApproved: boolean;
  approvalStatus: string;
  organizerName?: string;
  organizerEmail?: string;
};

type EventFilter = 'all' | 'pending' | 'running' | 'upcoming' | 'hidden';

export function AdminEventsPage() {
  const { t } = useTranslation('admin');
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filter = (params.get('filter') ?? 'all') as EventFilter;
  const [search, setSearch] = useState('');
  const [request, setRequest] = useState<ModerationRequest | null>(null);
  const events = useQuery(api.events.getEventsForAdmin, {}) as AdminEvent[] | undefined;
  const approveEvent = useMutation(api.events.approveEventForAdmin);
  const rejectEvent = useMutation(api.events.rejectEventForAdmin);
  const restoreEvent = useMutation(api.moderation.restoreEvent);
  const [processingEventId, setProcessingEventId] = useState<string | null>(null);
  const [rejectEventId, setRejectEventId] = useState<Id<'events'> | null>(null);
  const eventsLoading = events === undefined;

  const filtered = useMemo(() => {
    const now = Date.now();
    const term = search.trim().toLowerCase();
    return (events ?? [])
      .filter((event) => {
        if (filter === 'pending')
          return event.visibility === 'public' && event.approvalStatus === 'pending';
        if (filter === 'running') return eventPhase(event, now) === 'running';
        if (filter === 'upcoming') return eventPhase(event, now) === 'upcoming';
        if (filter === 'hidden') return !!event.moderation;
        return true;
      })
      .filter(
        (event) =>
          !term ||
          event.title.toLowerCase().includes(term) ||
          formatEventPlace(event).toLowerCase().includes(term) ||
          (event.organizerName ?? '').toLowerCase().includes(term) ||
          (event.organizerEmail ?? '').toLowerCase().includes(term)
      )
      .sort((a, b) => b.startDate - a.startDate);
  }, [events, filter, search]);
  const { pageItems, page, totalPages, setPage } = usePagedItems(filtered, `${filter}:${search}`);

  const pendingCount = (events ?? []).filter(
    (event) => event.visibility === 'public' && event.approvalStatus === 'pending'
  ).length;

  const setFilter = (value: EventFilter) => {
    const next = new URLSearchParams(params);
    if (value === 'all') next.delete('filter');
    else next.set('filter', value);
    setParams(next, { replace: true });
  };

  const handleRestore = async (eventId: Id<'events'>) => {
    try {
      await restoreEvent({ eventId });
      toast.success(t('events.unblocked'));
    } catch (error) {
      toast.error(t('events.error'), { description: getUserFacingErrorMessage(error) });
    }
  };

  const handleApprove = async (eventId: string) => {
    setProcessingEventId(eventId);
    try {
      await approveEvent({ eventId: eventId as Id<'events'> });
      toast.success(t('events.approved'));
    } catch (error) {
      toast.error(t('events.error'), { description: getUserFacingErrorMessage(error) });
    } finally {
      setProcessingEventId(null);
    }
  };

  /** Only what differs from a public, approved bazaar */
  const renderStatus = (event: AdminEvent) => {
    if (event.moderation) {
      return <Badge variant="danger">{t('events.statusBlocked')}</Badge>;
    }
    if (event.visibility !== 'public') {
      return <Badge variant="outline">{t('events.statusPrivate')}</Badge>;
    }
    if (event.approvalStatus === 'rejected') {
      return <Badge variant="danger">{t('events.statusRejected')}</Badge>;
    }
    if (event.approvalStatus !== 'approved') {
      return <Badge variant="warning">{t('events.statusPending')}</Badge>;
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('events.title')} />

      <div
        id="admin-events-top"
        className="flex scroll-mt-20 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
      >
        <FilterTabs
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: t('events.all') },
            { value: 'pending', label: t('events.pending'), count: pendingCount },
            { value: 'running', label: t('events.running') },
            { value: 'upcoming', label: t('events.upcoming') },
            { value: 'hidden', label: t('events.hidden') },
          ]}
        />
        <SearchInput
          className="w-full lg:max-w-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('events.search')}
          aria-label={t('events.searchLabel')}
        />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <Table stacked>
          <TableHeader>
            <TableRow>
              <TableHead>{t('events.event')}</TableHead>
              <TableHead>{t('events.date')}</TableHead>
              <TableHead>{t('events.organizer')}</TableHead>
              <TableHead>{t('events.status')}</TableHead>
              <TableHead className="w-0">
                <span className="sr-only">{t('events.action')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {eventsLoading ? (
              <TableRowsSkeleton columns={5} />
            ) : filtered.length ? (
              pageItems.map((event) => {
                const pending = event.visibility === 'public' && event.approvalStatus === 'pending';
                const manage = `/events/view/${event._id}`;
                return (
                  <TableRow key={event._id}>
                    <TableCell className="whitespace-normal @4xl:min-w-[12rem]">
                      <Link to={manage} className="font-medium hover:underline">
                        {event.title}
                      </Link>
                      <div className="text-xs text-muted-foreground">{formatEventPlace(event)}</div>
                      {event.moderation && (
                        <div className="text-xs text-destructive">
                          {t('events.blockedReason', { reason: event.moderation.reason })}
                        </div>
                      )}
                    </TableCell>
                    <TableCell data-inline className="@4xl:whitespace-nowrap">
                      <EventDates start={event.startDate} end={event.endDate} />
                    </TableCell>
                    <TableCell data-inline className="whitespace-normal">
                      <div>{event.organizerName || t('events.unknown')}</div>
                      <div className="max-w-[13rem] truncate text-xs text-muted-foreground @max-4xl:hidden">
                        {event.organizerEmail || '—'}
                      </div>
                    </TableCell>
                    <TableCell data-inline>
                      <div className="flex flex-wrap gap-1">
                        <EventPhaseBadge event={event} />
                        {renderStatus(event)}
                      </div>
                    </TableCell>
                    <TableCell
                      data-inline
                      className="text-right @max-4xl:ml-auto @max-4xl:self-end"
                    >
                      <div className="flex items-center justify-end gap-1">
                        {pending && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={processingEventId === event._id}
                            onClick={() => handleApprove(event._id)}
                          >
                            <Check />
                            {t('events.approve')}
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={t('events.more')}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => navigate(manage)}>
                              {t('events.manage')}
                            </DropdownMenuItem>
                            {event.visibility === 'public' && (
                              <DropdownMenuItem
                                onSelect={() => navigate(`/public-events/${event._id}`)}
                              >
                                {t('events.view')}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            {pending && (
                              <DropdownMenuItem
                                className="text-destructive"
                                onSelect={() => setRejectEventId(event._id)}
                              >
                                {t('events.reject')}
                              </DropdownMenuItem>
                            )}
                            {event.moderation ? (
                              <DropdownMenuItem onSelect={() => handleRestore(event._id)}>
                                {t('events.unblock')}
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                className="text-destructive"
                                onSelect={() =>
                                  setRequest({
                                    kind: 'hideEvent',
                                    id: event._id,
                                    label: event.title,
                                  })
                                }
                              >
                                {t('events.block')}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground text-center py-6">
                  {t('events.none')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        onPageChange={setPage}
        scrollRefId="admin-events-top"
      />

      <ReasonDialog
        open={!!rejectEventId}
        onOpenChange={(open) => !open && setRejectEventId(null)}
        title={t('events.rejectTitle')}
        description={t('events.rejectText')}
        confirmLabel={t('events.rejectTitle')}
        onConfirm={async (reason) => {
          await rejectEvent({ eventId: rejectEventId!, reason });
        }}
        successMessage={t('events.rejected')}
      />

      <ModerationActionDialog request={request} onClose={() => setRequest(null)} />
    </div>
  );
}

/** "23.11.2026" with the times below, or "23.11. – 30.11.2026" for several days. */
function EventDates({ start, end }: { start: number; end: number }) {
  const from = new Date(start);
  const to = new Date(end);
  const day = (date: Date, year = true) =>
    date.toLocaleDateString(dateLocale(), {
      day: '2-digit',
      month: '2-digit',
      ...(year ? { year: 'numeric' } : {}),
    });
  const time = (date: Date) =>
    date.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' });
  if (from.toDateString() === to.toDateString()) {
    return (
      <div className="tabular-nums">
        <span>{day(from)}</span>
        <span className="text-xs text-muted-foreground @max-4xl:ml-2 @4xl:block">
          {time(from)} – {time(to)}
        </span>
      </div>
    );
  }
  return (
    <span className="tabular-nums">
      {day(from, from.getFullYear() !== to.getFullYear())} – {day(to)}
    </span>
  );
}
