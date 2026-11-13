import React, { useState } from 'react';
import { FolderGit2, X } from 'lucide-react';
import { PROJECT_TEMPLATES } from '../engine/projectTemplates';
import { ProjectTemplateId, UiLocale } from '../types/ide';
import { UI_COPY } from '../i18n';

interface NewProjectModalProps {
  locale: UiLocale;
  isOpen: boolean;
  onClose: () => void;
  onCreateProject: (templateId: ProjectTemplateId, projectName: string) => void;
}

export const NewProjectModal: React.FC<NewProjectModalProps> = ({
  locale,
  isOpen,
  onClose,
  onCreateProject,
}) => {
  const copy = UI_COPY[locale].modal;
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplateId>('c-cpp');
  const [projectName, setProjectName] = useState('systems-kernel-cpp');

  if (!isOpen) return null;

  const handleSelectTemplate = (id: ProjectTemplateId) => {
    setSelectedTemplate(id);
    const found = PROJECT_TEMPLATES.find((t) => t.id === id);
    if (found) setProjectName(found.defaultProjectName);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateProject(selectedTemplate, projectName.trim() || 'meo-project');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-lg rounded-lg border border-slate-800 bg-[#101624] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderGit2 className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-semibold text-slate-100">{copy.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">
              {copy.projectName}
            </label>
            <input
              type="text"
              dir="ltr"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="my-offline-project"
              className="w-full rounded-md border border-slate-700 bg-[#0B0F17] px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-300">
              {copy.projectTemplate}
            </label>
            <div className="space-y-2">
              {PROJECT_TEMPLATES.map((tpl) => {
                const active = selectedTemplate === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => handleSelectTemplate(tpl.id)}
                    className={`w-full text-start rounded-md border px-3.5 py-2.5 transition-colors cursor-pointer ${
                      active
                        ? 'border-blue-500 bg-blue-600/15'
                        : 'border-slate-800 bg-[#0B0F17] hover:border-slate-700'
                    }`}
                  >
                    <div className="text-xs font-semibold text-slate-100">{tpl.name}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{tpl.subtitle}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-700 bg-[#161E2E] px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 cursor-pointer"
            >
              {copy.cancel}
            </button>
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 cursor-pointer"
            >
              {copy.create}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
