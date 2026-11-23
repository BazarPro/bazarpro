/* eslint-disable react-refresh/only-export-components -- a page of its own, not hot-reloaded */
// The preview image of links to bazarpro.de and of the GitHub repository, rendered by
// render.mjs. One scene in two sizes: 1200x630 (Open Graph) and 1280x640 (GitHub).
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-800.css';
import '../../src/styles/index.css';
import { createRoot } from 'react-dom/client';
import { CheckCircle2, Code2, Printer, ReceiptText, ScanLine, ShoppingBag } from 'lucide-react';
import {
  AppBar,
  BikePhoto,
  BikeWithTag,
  HangTag,
  PhoneFrame,
} from '../../src/pages/public/landing/components/demo/Illustrations';

const CART = [
  { name: 'Hollandrad 28"', seller: 'Nr. 12', price: '45,00 €', photo: true },
  { name: 'Kinderjacke Gr. 110', seller: 'Nr. 7', price: '8,00 €' },
  { name: 'Holzeisenbahn', seller: 'Nr. 31', price: '12,50 €' },
];

const FEATURES = [
  { icon: Printer, text: 'QR-Etiketten' },
  { icon: ScanLine, text: 'Handy-Kasse' },
  { icon: ReceiptText, text: 'Abrechnung' },
];

function Scene({ width, height, github }: { width: number; height: number; github: boolean }) {
  return (
    <div
      data-preview={github ? 'github' : 'og'}
      className="relative flex items-center overflow-hidden bg-white text-zinc-900"
      style={{ width, height, fontFamily: 'Inter, sans-serif' }}
    >
      {/* Soft blue light and the dot grid of the landing page */}
      <div className="absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-blue-100/80 blur-3xl" />
      <div className="absolute -bottom-48 right-0 h-[36rem] w-[40rem] rounded-full bg-blue-100/70 blur-3xl" />
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage: 'radial-gradient(rgb(24 24 27 / 0.12) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      />

      <div className="relative z-10 flex h-full flex-1 flex-col justify-center pl-[72px] pr-4">
        <div className="mb-9 flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-700 text-white shadow-md">
            <ShoppingBag className="h-7 w-7" strokeWidth={2.2} />
          </span>
          <span className="text-[34px] font-bold tracking-tight">BazarPro</span>
        </div>
        <h1
          className="whitespace-nowrap font-extrabold leading-[1.08] tracking-[-0.02em]"
          style={{ fontSize: github ? 58 : 54 }}
        >
          Second-Hand-Basare
          <br />
          <span className="relative text-blue-700">
            ohne
            <span className="absolute -bottom-1 left-0 h-[5px] w-full rounded-full bg-blue-700/40" />
          </span>{' '}
          Zettelwirtschaft
        </h1>
        <p className="mt-6 max-w-[34rem] text-[24px] leading-snug text-zinc-600">
          Für Kinderbasare, Flohmärkte und Fahrradbörsen.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          {FEATURES.map(({ icon: Icon, text }) => (
            <span
              key={text}
              className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white/90 px-4 py-2 text-[19px] font-medium shadow-sm"
            >
              <Icon className="h-5 w-5 text-blue-700" />
              {text}
            </span>
          ))}
        </div>
        <p className="mt-9 flex items-center gap-2 text-[19px] font-medium text-zinc-500">
          {github ? (
            <>
              <Code2 className="h-5 w-5" /> Open Source · selbst hosten oder auf bazarpro.de
            </>
          ) : (
            'bazarpro.de'
          )}
        </p>
      </div>

      {/* The bike with its label, scanned by the phone in front of it */}
      <div className="relative z-10 h-full shrink-0" style={{ width: github ? 540 : 490 }}>
        <div className="absolute -left-2 top-[56%] w-[290px] -translate-y-1/2">
          <BikeWithTag
            tag={<HangTag itemNumber="Nr. 12-034" className="scale-[1.35] origin-top" />}
          />
        </div>
        <PhoneFrame className="absolute right-[48px] top-1/2 aspect-[71.6/124] w-[220px] -translate-y-1/2">
          <AppBar title="Kasse" />
          <div className="flex flex-1 flex-col gap-1.5 p-2">
            <div className="overflow-hidden rounded-lg">
              <BikePhoto className="px-6 pt-2" />
            </div>
            {CART.map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between rounded-md border bg-white px-2 py-1"
              >
                <div className="min-w-0">
                  <p className="truncate text-[0.62rem] font-semibold leading-tight">{item.name}</p>
                  <p className="text-[0.5rem] text-zinc-500">Verkäufer {item.seller}</p>
                </div>
                <span className="text-[0.62rem] font-bold tabular-nums">{item.price}</span>
              </div>
            ))}
            <div className="mt-0.5 flex items-baseline justify-between px-1">
              <span className="text-[0.6rem] text-zinc-500">Summe (3 Artikel)</span>
              <span className="text-[0.95rem] font-extrabold tabular-nums">65,50 €</span>
            </div>
            <div className="mt-auto flex items-center justify-center gap-1 rounded-lg bg-emerald-600 py-1.5 text-[0.65rem] font-semibold text-white">
              <CheckCircle2 className="h-3 w-3" /> Verkauft
            </div>
          </div>
        </PhoneFrame>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <div className="flex flex-col items-start gap-8">
    <Scene width={1200} height={630} github={false} />
    <Scene width={1280} height={640} github />
  </div>
);
