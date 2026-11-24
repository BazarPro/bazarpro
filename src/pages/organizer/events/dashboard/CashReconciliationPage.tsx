import { PageHeader } from '../../../../components/ui/page-header';
import { useQuery } from '../../../../lib/api/react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '../../../../components/ui/button';
import { api } from '../../../../lib/api/functions';
import type { Id } from '../../../../lib/api/types';
import { ArrowRight, Banknote, CheckCircle2, Users } from 'lucide-react';
import { formatPrice } from '../../../../lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Progress } from '../../../../components/ui/progress';
import { useTranslation } from 'react-i18next';
import { ProofOfOffersCard } from './components/ProofOfOffersCard';
import { SettlementExportCard } from './components/SettlementExportCard';
import { SaleConflictsCard } from './components/SaleConflictsCard';
import { PageSkeleton } from '../../../../components/ui/loading';
import { useEventAccess } from '../../../../hooks/useEventAccess';

/**
 * What should be in the cash box right now, and whose money it is:
 * cash = sales − payouts so far + intake fees paid in
 *      = payouts still due − intake fees still to collect + commission + intake fees.
 */
export function CashReconciliationPage() {
  const { t } = useTranslation('organizer');
  const { eventId } = useParams<{ eventId: string }>();
  const { isLoading, can } = useEventAccess(eventId as Id<'events'>);
  const summary = useQuery(
    api.events.getEventFinancialSummary,
    can('cashSummary') ? { eventId: eventId as Id<'events'> } : 'skip'
  );

  if (isLoading) return <PageSkeleton className="pb-10" />;
  // Helpers without the cash summary still settle the offline sales the desk could not book
  if (!can('cashSummary')) {
    return (
      <div className="page-wide space-y-6 pb-10">
        <PageHeader title={t('cash.title')} />
        {can('sale') && <SaleConflictsCard eventId={eventId as Id<'events'>} />}
        <p className="p-8 text-center text-muted-foreground">
          {t('helper.cashSummary', { ns: 'errors' })}
        </p>
      </div>
    );
  }
  if (!summary) {
    return <PageSkeleton className="pb-10" />;
  }

  const allPaid =
    summary.vendorsTotalCount > 0 && summary.vendorsPaidCount === summary.vendorsTotalCount;
  const collecting = summary.totalFeesToCollect > 0.005;
  // Older backends do not send it
  const capCredits = summary.totalFeeCapCredits ?? 0;
  // Direct sale: the sellers have their money, so there may be nobody to settle
  const nothingToSettle = summary.vendorsTotalCount === 0 && summary.totalDirectSales > 0.005;
  const payoutProgress =
    summary.vendorsTotalCount > 0
      ? (summary.vendorsPaidCount / summary.vendorsTotalCount) * 100
      : 0;

  return (
    <div className="page-wide space-y-6 pb-10">
      <PageHeader title={t('cash.title')} />

      {can('sale') && <SaleConflictsCard eventId={eventId as Id<'events'>} />}

      <Card className="border-2 border-primary">
        <CardContent className="space-y-6 pt-6">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{t('cash.shouldBe')}</p>
            <p className="mt-1 flex items-center gap-3 whitespace-nowrap text-3xl font-semibold tabular-nums min-[360px]:text-4xl sm:text-5xl">
              <Banknote className="h-8 w-8 shrink-0 text-primary dark:text-foreground sm:h-10 sm:w-10" />
              {formatPrice(summary.cashInHandSoll)} €
            </p>
          </div>

          {/* How the sum comes about, read like a receipt: line by line down to the total */}
          <dl className="max-w-2xl divide-y rounded-xl border bg-card text-sm tabular-nums">
            <div className="flex items-baseline justify-between gap-4 px-4 py-3">
              <dt>{t('cash.pending')}</dt>
              <dd className="whitespace-nowrap text-base font-semibold">
                {formatPrice(summary.totalPendingPayout)} €
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 px-4 py-3">
              <dt>
                <span aria-hidden="true" className="mr-1 text-muted-foreground">
                  +
                </span>
                {summary.totalIntakeFees > 0 ? t('cash.commissionAndFees') : t('cash.commission')}
                {summary.totalIntakeFees > 0 && (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {t('cash.split', {
                      commission: formatPrice(summary.totalCommission),
                      fees: formatPrice(summary.totalIntakeFees),
                    })}
                  </span>
                )}
                {capCredits > 0 && (
                  <span className="mt-0.5 block text-xs text-success-soft-foreground">
                    {t('cash.capSplit', { amount: formatPrice(capCredits) })}
                  </span>
                )}
              </dt>
              <dd className="whitespace-nowrap text-base font-semibold">
                {formatPrice(summary.totalCommission + summary.totalIntakeFees - capCredits)} €
              </dd>
            </div>
            {collecting && (
              <div className="flex items-baseline justify-between gap-4 bg-warning-soft px-4 py-3 text-warning-soft-foreground">
                <dt>
                  <span aria-hidden="true" className="mr-1">
                    −
                  </span>
                  {t('cash.feesToCollect')}
                </dt>
                <dd className="whitespace-nowrap text-base font-semibold">
                  {formatPrice(summary.totalFeesToCollect)} €
                </dd>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-4 px-4 py-3 font-semibold">
              <dt>
                <span aria-hidden="true" className="mr-1 text-muted-foreground">
                  =
                </span>
                {t('cash.shouldBe')}
              </dt>
              <dd className="whitespace-nowrap text-base">
                {formatPrice(summary.cashInHandSoll)} €
              </dd>
            </div>
          </dl>
          {/* The one thing to do here: pay the sellers still waiting */}
          {!allPaid && !nothingToSettle && summary.vendorsTotalCount > 0 && (
            <Button asChild size="lg" className="max-sm:w-full">
              <Link to={`/events/view/${eventId}/sellers`} state={{ filter: 'open' }}>
                <Users className="h-5 w-5" />
                {t('cash.settleNow', {
                  count: summary.vendorsTotalCount - summary.vendorsPaidCount,
                })}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('cash.howTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm tabular-nums">
              <div className="flex justify-between gap-3">
                <dt>{t('cash.income', { count: summary.salesCount })}</dt>
                <dd className="whitespace-nowrap font-medium">
                  {formatPrice(summary.totalNetRevenue)} €
                </dd>
              </div>
              {summary.totalDirectSales > 0.005 && (
                <div className="flex justify-between gap-3">
                  <dt>{t('cash.directSales')}</dt>
                  <dd className="whitespace-nowrap font-medium">
                    −{formatPrice(summary.totalDirectSales - summary.totalDirectCommission)} €
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt>{t('cash.paidOut')}</dt>
                <dd className="whitespace-nowrap font-medium">
                  {summary.totalPaidOut > 0 ? '−' : ''}
                  {formatPrice(summary.totalPaidOut)} €
                </dd>
              </div>
              {summary.totalFeesCollected > 0.005 && (
                <div className="flex justify-between gap-3">
                  <dt>{t('cash.feesCollectedIncome')}</dt>
                  <dd className="whitespace-nowrap font-medium">
                    +{formatPrice(summary.totalFeesCollected)} €
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-3 border-t pt-2 text-base font-bold">
                <dt>{t('cash.inCash')}</dt>
                <dd className="whitespace-nowrap">{formatPrice(summary.cashInHandSoll)} €</dd>
              </div>
            </dl>
            {summary.totalDiscounts > 0.005 && (
              <p className="mt-4 text-xs text-muted-foreground">
                {t('cash.discounts', {
                  gross: formatPrice(summary.totalGrossRevenue),
                  discounts: formatPrice(summary.totalDiscounts),
                })}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5 text-muted-foreground" />
              {t('cash.settlements')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {nothingToSettle ? (
              <p className="flex items-start gap-2 rounded-lg bg-success-soft p-3 text-sm text-success-soft-foreground">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                {t('cash.directNoPayout')}
              </p>
            ) : (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>
                    {t('cash.progress', {
                      paid: summary.vendorsPaidCount,
                      total: summary.vendorsTotalCount,
                    })}
                  </span>
                  <span className="font-medium">{payoutProgress.toFixed(0)} %</span>
                </div>
                <Progress value={payoutProgress} className="h-2" />
              </div>
            )}
            <dl className="space-y-2 text-sm tabular-nums">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t('cash.paid')}</dt>
                <dd className="whitespace-nowrap font-medium">
                  {formatPrice(summary.totalPaidOut)} €
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t('cash.open')}</dt>
                <dd className="whitespace-nowrap font-medium">
                  {formatPrice(summary.totalPendingPayout)} €
                </dd>
              </div>
              {summary.totalFeesCollected > 0.005 && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{t('cash.feesCollected')}</dt>
                  <dd className="whitespace-nowrap font-medium">
                    {formatPrice(summary.totalFeesCollected)} €
                  </dd>
                </div>
              )}
              {collecting && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{t('cash.feesOpen')}</dt>
                  <dd className="whitespace-nowrap font-medium">
                    {formatPrice(summary.totalFeesToCollect)} €
                  </dd>
                </div>
              )}
            </dl>
            {collecting && (
              <div className="rounded-lg border border-tag/60 bg-warning-soft p-3 text-sm">
                <p className="mb-2 font-medium">{t('cash.sellersToCollect')}</p>
                <ul className="space-y-1 tabular-nums">
                  {summary.sellersToCollect.map((seller, index) => (
                    <li key={index} className="flex justify-between gap-3">
                      <span>
                        {seller.sellerNumber
                          ? `${t('cash.sellerNumber', { number: seller.sellerNumber })} · `
                          : ''}
                        {seller.name}
                      </span>
                      <span className="whitespace-nowrap font-medium">
                        {formatPrice(seller.amount)} €
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {allPaid && (
              <p className="flex items-start gap-2 rounded-lg bg-success-soft p-3 text-sm text-success-soft-foreground">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                {summary.totalIntakeFees > 0 ? t('cash.allPaidWithFees') : t('cash.allPaid')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <SettlementExportCard eventId={eventId as Id<'events'>} />
      <ProofOfOffersCard eventId={eventId as Id<'events'>} />
    </div>
  );
}
