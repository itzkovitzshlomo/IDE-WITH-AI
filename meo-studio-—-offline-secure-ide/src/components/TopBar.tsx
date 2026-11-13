import React from 'react';
import { Globe, Play } from 'lucide-react';
import { UiLocale } from '../types/ide';
import { UI_COPY } from '../i18n';

export type WorkspaceSection = 'editor' | 'security' | 'models' | 'sandbox';

interface TopBarProps {
  locale: UiLocale;
  onToggleLocale: () => void;
  activeSection: WorkspaceSection;
  onSelectSection: (section: WorkspaceSection) => void;
  onRunCode: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  locale,
  onToggleLocale,
  activeSection,
  onSelectSection,
  onRunCode,
}) => {
  const copy = UI_COPY[locale].topBar;

  const navItems: Array<{ id: WorkspaceSection; label: string }> = [
    { id: 'editor', label: copy.workspace },
    { id: 'security', label: copy.security },
    { id: 'models', label: copy.models },
    { id: 'sandbox', label: copy.sandbox },
  ];

  return (
    <header className="h-14 shrink-0 border-b border-slate-800/90 bg-[#0D131F] px-6 flex items-center justify-between gap-6">
      {/* Zone 1: Single-line Brand Title */}
      <span className="text-base font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0">
        MEO Studio
      </span>

      {/* Zone 2: Clean single-line text navigation links */}
      <nav className="flex items-center gap-6 overflow-x-auto" aria-label="Primary navigation">
        {navItems.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectSection(item.id)}
              className={`py-1.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                isActive
                  ? 'border-blue-500 text-slate-100'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Fast Language Switcher & Primary Action */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={onToggleLocale}
          title="Switch UI Language (עברית / English)"
          className="flex items-center gap-1.5 rounded-md border border-slate-700/80 bg-[#141C2C] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Globe className="w-3.5 h-3.5 text-sky-400" />
          <span>{locale === 'en' ? 'עברית / EN' : 'English / עב'}</span>
        </button>

        <button
          onClick={onRunCode}
          className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          {copy.runSimulate}
        </button>
      </div>
    </header>
  );
};
