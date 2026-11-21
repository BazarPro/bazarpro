import { Check, ClipboardList, Coins, X, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  describeFeeGroups,
  describeSellerFees,
  describeSellerRules,
  describeSellerSchedule,
  type SellerConditionsEvent,
} from '../../lib/sellerFees';
import { useCategoryFieldDefinitions } from '../../hooks/useCategoryFields';
import { cn } from '../../lib/utils';
import { useTranslation } from 'react-i18next';
import type { Id } from '../../lib/api/types';
import { FeeGroupList, MyFeeGroup } from './FeeGroups';
import { RegionMapTip } from './RegionMapTip';

/**
 * What sellers agree to at a bazaar, only what applies (#303): fees with a worked example
 * that fits the kind of bazaar, hand-in and pickup times, what sellers must do and what
 * they can do. Shown before registering and to registered sellers; `compact` (bazaar page
 * sidebar) leaves out the example.
 */
export function SellerConditions({
  event,
  className,
  id,
  compact = false,
  eventId,
}: {
  event: SellerConditionsEvent;
  className?: string;
  id?: string;
  compact?: boolean;
  /** With it, a registered seller sees their fee group there (#302) */
  eventId?: Id<'events'>;
}) {
  const { t } = useTranslation('events');
  const { lines, example } = describeSellerFees(event);
  const fieldDefinitions = useCategoryFieldDefinitions();
  const { duties, options } = describeSellerRules(event, fieldDefinitions);
  const schedule = describeSellerSchedule(event);
  const groups = describeFeeGroups(event);

  return (
    <div id={id} className={className}>
      <h3 className="mb-4 flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-muted-foreground" /> {t('conditions.title')}
      </h3>

      <div className="divide-y [&>section]:py-4 [&>section:first-child]:pt-0 [&>section:last-child]:pb-0">
        <ConditionsSection title={t('conditions.fees')}>
          {eventId && <MyFeeGroup eventId={eventId} event={event} />}
          {lines.length === 0 ? (
            <ul>
              <ConditionLine text={t('conditions.noFees')} />
            </ul>
          ) : (
            <ul className="space-y-2">
              {lines.map((line) => (
                <ConditionLine key={line} icon={Coins} text={line} />
              ))}
            </ul>
          )}
          <FeeGroupList groups={groups} />
          {example && !compact && (
            <div className="mt-3 rounded-md border bg-background p-3 text-sm">
              <p className="font-medium">{t('conditions.example')}</p>
              <p className="text-muted-foreground">{example.text}</p>
              {example.groups.map((group) => (
                <p key={group} className="mt-1 text-muted-foreground">
                  {group}
                </p>
              ))}
            </div>
          )}
        </ConditionsSection>

        {(schedule.rows.length > 0 || schedule.note) && (
          <ConditionsSection title={schedule.title}>
            {schedule.rows.length > 0 && (
              <dl className="space-y-2 text-sm">
                {schedule.rows.map((row) => (
                  <div key={row.label}>
                    <dt className="font-medium">{row.label}</dt>
                    <dd className="text-muted-foreground">{row.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {schedule.note && (
              <p className="mt-2 text-sm whitespace-pre-line text-muted-foreground">
                {schedule.note}
              </p>
            )}
          </ConditionsSection>
        )}

        {[
          { key: 'duties', rules: duties },
          { key: 'options', rules: options },
        ].map(
          ({ key, rules }) =>
            rules.length > 0 && (
              <ConditionsSection key={key} title={t(`conditions.${key}` as 'conditions.duties')}>
                <ul className="space-y-2">
                  {rules.map((rule) => (
                    <ConditionLine
                      key={rule.text}
                      allowed={rule.allowed}
                      text={
                        rule.regionCodes ? (
                          <RegionMapTip image={event.regionMapImage} codes={rule.regionCodes}>
                            {rule.text}
                          </RegionMapTip>
                        ) : (
                          rule.text
                        )
                      }
                    >
                      {rule.details && (
                        <details className="group">
                          <summary className="cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:underline">
                            {t('conditions.details')}
                          </summary>
                          <p className="mt-1 text-xs text-muted-foreground">{rule.details}</p>
                        </details>
                      )}
                    </ConditionLine>
                  ))}
                </ul>
              </ConditionsSection>
            )
        )}
      </div>
    </div>
  );
}

function ConditionsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h4>
      {children}
    </section>
  );
}

function ConditionLine({
  text,
  allowed = true,
  icon,
  children,
}: {
  text: ReactNode;
  allowed?: boolean;
  icon?: LucideIcon;
  /** More about it below the text */
  children?: ReactNode;
}) {
  const Icon = icon ?? (allowed ? Check : X);
  return (
    <li className={cn('flex list-none gap-2 text-sm', !allowed && 'text-muted-foreground')}>
      <Icon
        className={cn(
          'mt-0.5 h-4 w-4 shrink-0',
          icon ? 'text-muted-foreground' : allowed && 'text-green-600'
        )}
      />
      <div className="min-w-0">
        {text}
        {children}
      </div>
    </li>
  );
}
