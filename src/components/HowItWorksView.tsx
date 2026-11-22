import React, { useState } from 'react';
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Cloud,
  FolderSync,
  LayoutGrid,
  ShieldCheck,
  Upload,
} from 'lucide-react';

interface HowItWorksViewProps {
  onOpenScreens: () => void;
  onOpenImportModal: () => void;
  onOpenExportModal: () => void;
  onOpenBackups: () => void;
  onOpenWidgets: () => void;
}

const STEPS = [
  {
    number: '01',
    title: 'Pick your phone and check your screens',
    body: 'Choose a phone at the top of the Screens tab — like Pixel 9 Pro, Galaxy A15, Galaxy A16, Cricket Icon 5, or Galaxy S24 Ultra. Tap any app icon, folder, or widget on the phone screen to move it, edit it, or add extra pages.',
    tip: 'Nothing breaks while you test changes — you can rearrange icons freely.',
  },
  {
    number: '02',
    title: 'Save a copy (Backup)',
    body: 'Tap Backup Layout whenever you like how your screens look. Icon Sync saves a small map of where every icon, folder, and widget sits — either in your Cloud Vault or as a portable file on your computer or phone.',
    tip: 'Backups are tiny text files that only record layout positions, never personal files.',
  },
  {
    number: '03',
    title: 'Move it to another phone (Replace or Merge)',
    body: 'Tap Import / Restore, pick the backup you want to copy from, and pick the phone you want to update. Choose Replace for an exact fresh copy, or Merge to keep what is already on the phone and place new apps in open spots.',
    tip: 'A safety copy is saved automatically before every restore, so Undo Restore is always one tap away.',
  },
  {
    number: '04',
    title: 'Adapt different grids, install missing apps & sync widgets',
    body: 'If your old launcher used a 6×6 grid and your new launcher uses 5×4 or 4×5, Icon Sync lets you choose Auto-Reflow, Proportional Scaling, Page Splitting, or Target Resize. Missing apps get placeholder icons and Play Store links.',
    tip: 'You can also download a simple Play Store links checklist (.txt or .html) to install apps later.',
  },
];

const FAQ_ITEMS = [
  {
    question: 'What is the difference between Replace and Merge?',
    answer:
      'Replace clears the target phone’s current screens and rebuilds them to match your backup from scratch. Merge keeps every app and folder already on the phone, combines folders that have the same name (like "Work Suite"), skips duplicate apps, and places new items into open spots.',
  },
  {
    question: 'What happens if I import a 6×6 grid into a 5×4 or 4×5 launcher?',
    answer:
      'Icon Sync detects grid mismatches automatically before applying any changes. You can choose Auto-Reflow (spills excess icons to a supplemental page with zero data loss), Proportional Scaling (keeps corner/edge muscle memory), Split Per Source Page, Resize Target Grid (if your launcher supports it), or Strict Bounds Crop. You can also auto-detect or manually report any custom/mini launcher grid.',
  },
  {
    question: 'What if an app from my backup is not installed on my new phone yet?',
    answer:
      'You get three simple choices during import: put a gray placeholder icon in the exact spot and walk through Google Play Store links right away, keep placeholder icons to install later, or skip uninstalled apps while still downloading a Play Store checklist.',
  },
  {
    question: 'What if I restore a layout and do not like the result?',
    answer:
      'Every time you click Replace or Merge, Icon Sync saves a safety snapshot of the phone right before the change. Just click Undo Restore in the bar at the top of the Screens tab to go right back to how it looked before.',
  },
  {
    question: 'Does Icon Sync read my photos, messages, or passwords?',
    answer:
      'No. Icon Sync only stores layout information: which screen an icon sits on, folder names, widget display settings (like weather city or checklist items), and the phone’s grid size. It never accesses app logins, messages, emails, photos, or GPS location.',
  },
];

const DATA_MAP_ROWS = [
  {
    category: 'Home screen grid & folders',
    whatIsSaved: 'Screen names, row/column numbers, folder names, app names & package IDs',
    whereItLives: 'Browser storage + Cloud Vault (.data/icon-sync-vault.json)',
    sharedExternally: 'Never',
  },
  {
    category: 'Widget settings',
    whatIsSaved: 'Display preferences (weather city, clock time zones, task list items)',
    whereItLives: 'Browser storage + Cloud Vault (.data/icon-sync-vault.json)',
    sharedExternally: 'Never',
  },
  {
    category: 'Device profile details',
    whatIsSaved: 'Device name, model code (e.g. SM-A156U, SM-A166U, SL112C), launcher grid size & detection source, installed app list',
    whereItLives: 'Browser storage + Cloud Vault (.data/icon-sync-vault.json)',
    sharedExternally: 'Never',
  },
  {
    category: 'Downloaded files',
    whatIsSaved: 'Portable .json backup files, diagnostic bundles, and missing-app Play Store checklists (.txt / .html)',
    whereItLives: 'Only on your own device when you click Download',
    sharedExternally: 'Only if you choose to share the file',
  },
  {
    category: 'Personal content (NOT collected)',
    whatIsSaved: 'No passwords, messages, emails, photos, contacts, or GPS tracking',
    whereItLives: 'Never collected or stored',
    sharedExternally: 'Never',
  },
];

export function HowItWorksView({
  onOpenScreens,
  onOpenImportModal,
  onOpenExportModal,
  onOpenBackups,
  onOpenWidgets,
}: HowItWorksViewProps) {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [showDataMap, setShowDataMap] = useState<boolean>(true);

  return (
    <div className="space-y-8">
      {/* Plain-English Hero Header */}
      <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 border-b border-[#E4E7EC]">
        <div className="max-w-2xl space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#111827] text-balance">
            How Icon Sync Works
          </h1>
          <p className="text-sm sm:text-base text-[#4B5563] leading-relaxed">
            Setting up a new Android phone usually means dragging every app, folder, and widget back into place by hand. Icon Sync saves a map of your home screens so you can copy, adapt across different grid sizes, or merge layouts across phones in minutes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onOpenImportModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#166534] hover:bg-[#14532D] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            Try Import / Restore
          </button>
          <button
            type="button"
            onClick={onOpenScreens}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-[#111827] bg-white border border-[#E4E7EC] hover:border-[#9CA3AF] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Open Screen Studio
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </section>

      {/* 4 Simple Steps */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-[#111827]">Four simple steps</h2>
          <p className="text-xs text-[#6B7280] mt-0.5">
            No coding or phone rooting required — just save, pick your target phone, and restore.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {STEPS.map((step) => (
            <div
              key={step.number}
              className="bg-white border border-[#E4E7EC] rounded-2xl p-6 flex flex-col justify-between gap-4"
            >
              <div className="space-y-2">
                <h3 className="text-base font-semibold text-[#111827]">
                  <span className="font-mono text-[#166534] tabular-nums mr-2">{step.number}.</span>
                  {step.title}
                </h3>
                <p className="text-sm text-[#4B5563] leading-relaxed">{step.body}</p>
              </div>
              <p className="text-xs text-[#6B7280] pt-3 border-t border-[#F1F3F6]">{step.tip}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Replace vs Merge in Plain English */}
      <section className="bg-white border border-[#E4E7EC] rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#F1F3F6]">
          <h2 className="text-base font-semibold text-[#111827]">
            Replace vs. Merge — which one should I pick?
          </h2>
          <p className="text-xs text-[#6B7280] mt-0.5">
            Both modes preview every change before touching your layout and create an automatic Undo snapshot.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#F1F3F6]">
          <div className="p-6 space-y-2.5">
            <h3 className="text-sm font-semibold text-[#111827]">Choose Replace when…</h3>
            <p className="text-sm text-[#4B5563] leading-relaxed">
              You just got a brand-new phone (like upgrading from a Pixel to a Galaxy A15 or Galaxy A16) and want its home screens to look just like your old phone right away.
            </p>
            <ul className="space-y-1.5 text-xs text-[#4B5563] pt-1">
              <li>• Clears the current clutter on the new phone</li>
              <li>• Copies your screens, folders, dock, and widgets in order</li>
              <li>• Automatically adapts to the new phone’s grid size (like 4×5 to 4×6)</li>
            </ul>
          </div>

          <div className="p-6 space-y-2.5">
            <h3 className="text-sm font-semibold text-[#111827]">Choose Merge when…</h3>
            <p className="text-sm text-[#4B5563] leading-relaxed">
              You already set up apps on the phone (like Samsung Notes or Gallery) and want to add your backup’s apps and folders without erasing what you already arranged.
            </p>
            <ul className="space-y-1.5 text-xs text-[#4B5563] pt-1">
              <li>• Keeps all existing icons and screens intact</li>
              <li>• Combines folders with the same name instead of making duplicates</li>
              <li>• Skips apps already on your screen and tucks new ones into open slots</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Quick Jump Actions */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={onOpenScreens}
          className="bg-white border border-[#E4E7EC] hover:border-[#166534] rounded-2xl p-5 text-left transition-colors cursor-pointer"
        >
          <LayoutGrid className="w-4 h-4 text-[#166534] mb-2.5" />
          <p className="text-sm font-semibold text-[#111827]">Edit Screens</p>
          <p className="text-xs text-[#6B7280] mt-1">
            View and organize icons, folders, and widgets on each phone.
          </p>
        </button>

        <button
          type="button"
          onClick={onOpenExportModal}
          className="bg-white border border-[#E4E7EC] hover:border-[#166534] rounded-2xl p-5 text-left transition-colors cursor-pointer"
        >
          <Cloud className="w-4 h-4 text-[#166534] mb-2.5" />
          <p className="text-sm font-semibold text-[#111827]">Save a Backup</p>
          <p className="text-xs text-[#6B7280] mt-1">
            Store your current layout in Cloud Vault or download a file.
          </p>
        </button>

        <button
          type="button"
          onClick={onOpenBackups}
          className="bg-white border border-[#E4E7EC] hover:border-[#166534] rounded-2xl p-5 text-left transition-colors cursor-pointer"
        >
          <Upload className="w-4 h-4 text-[#166534] mb-2.5" />
          <p className="text-sm font-semibold text-[#111827]">Browse Backups</p>
          <p className="text-xs text-[#6B7280] mt-1">
            See saved layouts for Pixel 9 Pro, Galaxy A15, Galaxy A16, and S24 Ultra.
          </p>
        </button>

        <button
          type="button"
          onClick={onOpenWidgets}
          className="bg-white border border-[#E4E7EC] hover:border-[#166534] rounded-2xl p-5 text-left transition-colors cursor-pointer"
        >
          <FolderSync className="w-4 h-4 text-[#166534] mb-2.5" />
          <p className="text-sm font-semibold text-[#111827]">Sync Widgets</p>
          <p className="text-xs text-[#6B7280] mt-1">
            Keep Weather, Calendar, Tasks, and Clock widgets matching across phones.
          </p>
        </button>
      </section>

      {/* Common Questions */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-[#111827]">Common questions</h2>
          <p className="text-xs text-[#6B7280] mt-0.5">
            Straightforward answers about switching phones, missing apps, and safety rollbacks.
          </p>
        </div>

        <div className="bg-white border border-[#E4E7EC] rounded-2xl divide-y divide-[#F1F3F6] overflow-hidden">
          {FAQ_ITEMS.map((item, idx) => {
            const isOpen = openFaqIndex === idx;
            return (
              <div key={item.question}>
                <button
                  type="button"
                  onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                  aria-expanded={isOpen}
                  className="w-full px-6 py-4 flex items-center justify-between gap-4 text-left hover:bg-[#FAFBFD] transition-colors cursor-pointer"
                >
                  <span className="text-sm font-semibold text-[#111827]">{item.question}</span>
                  {isOpen ? (
                    <ChevronUp className="w-4 h-4 text-[#6B7280] shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[#6B7280] shrink-0" />
                  )}
                </button>
                {isOpen && (
                  <div className="px-6 pb-4 text-sm text-[#4B5563] leading-relaxed">
                    {item.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Privacy & Data Map Overview */}
      <section className="bg-white border border-[#E4E7EC] rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#F1F3F6] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="w-5 h-5 text-[#166534] shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base font-semibold text-[#111827]">
                Privacy & Data Map
              </h2>
              <p className="text-xs text-[#6B7280] mt-0.5">
                Exactly what Icon Sync stores, where it lives, and what it never touches. Full documentation is included in <code className="font-mono text-[#374151]">PRIVACY.md</code> and <code className="font-mono text-[#374151]">DATA_MAP.md</code>.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowDataMap((prev) => !prev)}
            className="px-3 py-1.5 text-xs font-medium text-[#374151] bg-[#F9FAFB] border border-[#E4E7EC] hover:border-[#9CA3AF] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {showDataMap ? 'Hide Data Map' : 'Show Data Map'}
          </button>
        </div>

        {showDataMap && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#FAFBFD] border-b border-[#E4E7EC] text-[#4B5563]">
                  <th className="py-3 px-6 font-semibold">Category</th>
                  <th className="py-3 px-4 font-semibold">What is saved</th>
                  <th className="py-3 px-4 font-semibold">Where it lives</th>
                  <th className="py-3 px-6 font-semibold">Shared externally?</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F3F6] text-[#374151]">
                {DATA_MAP_ROWS.map((row) => (
                  <tr key={row.category} className="hover:bg-[#FAFBFD]">
                    <td className="py-3.5 px-6 font-medium text-[#111827] whitespace-nowrap">
                      {row.category}
                    </td>
                    <td className="py-3.5 px-4 leading-relaxed">{row.whatIsSaved}</td>
                    <td className="py-3.5 px-4 text-[#4B5563]">{row.whereItLives}</td>
                    <td className="py-3.5 px-6 font-medium text-[#166534] whitespace-nowrap">
                      {row.sharedExternally}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
