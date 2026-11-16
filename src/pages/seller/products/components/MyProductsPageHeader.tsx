import { PageHeader } from '../../../../components/ui/page-header';
import { ChevronDown, Plus, Printer, ShoppingBasket, Tags } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../../components/ui/dropdown-menu';
import { useTranslation } from 'react-i18next';

/**
 * Header section for the My Products page: title and actions.
 */

interface MyProductsPageHeaderProps {
  onCreateProduct: () => void;
  /** Missing while there is nothing to label */
  onPrintLabels?: () => void;
  /** Missing without a sorting mark or a bazaar with universal labels */
  onPrintBasketLabel?: () => void;
}

export function MyProductsPageHeader({
  onCreateProduct,
  onPrintLabels,
  onPrintBasketLabel,
}: MyProductsPageHeaderProps) {
  const { t } = useTranslation('seller');
  return (
    <PageHeader
      className="mb-8"
      title={t('header.title')}
      actions={
        <div className="flex flex-wrap gap-2">
          {onPrintLabels && onPrintBasketLabel ? (
            // Both kinds: one button with a menu keeps the header short
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="lg" variant="outline">
                  <Printer className="mr-2 h-5 w-5" />
                  {t('labels.print')}
                  <ChevronDown className="ml-1 h-4 w-4 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onPrintLabels}>
                  <Tags className="h-4 w-4" />
                  {t('labels.printItems')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onPrintBasketLabel} title={t('labels.basketHint')}>
                  <ShoppingBasket className="h-4 w-4" />
                  {t('labels.printBasket')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : onPrintLabels ? (
            <Button size="lg" variant="outline" onClick={onPrintLabels}>
              <Printer className="mr-2 h-5 w-5" />
              {t('labels.open')}
            </Button>
          ) : (
            onPrintBasketLabel && (
              <Button
                size="lg"
                variant="outline"
                title={t('labels.basketHint')}
                onClick={onPrintBasketLabel}
              >
                <ShoppingBasket className="mr-2 h-5 w-5" />
                {t('labels.basket')}
              </Button>
            )
          )}
          <Button size="lg" onClick={onCreateProduct} data-onboarding-id="my-products-new-product">
            <Plus className="mr-2 h-5 w-5" />
            {t('header.newProduct')}
          </Button>
        </div>
      }
    />
  );
}
