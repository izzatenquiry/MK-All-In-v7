
import React from 'react';
import { getTranslations } from '../../services/translations';
import { type Language } from '../../types';

interface TwoColumnLayoutProps {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  language: Language;
}

const TwoColumnLayout: React.FC<TwoColumnLayoutProps> = ({ leftPanel, rightPanel }) => {
  const T = getTranslations().common;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 lg:items-stretch gap-4 lg:gap-8">
      {/* Left Panel: Controls — padding/gap match ai-text + media tools */}
      <div className="bg-white dark:bg-neutral-900 p-4 sm:p-5 lg:p-6 rounded-lg shadow-sm flex flex-col gap-4 min-h-0">
        {leftPanel}
      </div>
      {/* Right Panel: Results — same horizontal padding as left */}
      <div className="bg-white dark:bg-neutral-900 rounded-lg flex flex-col min-h-0 p-4 sm:p-5 lg:p-6 shadow-sm lg:h-full">
        <h2 className="text-lg sm:text-xl font-bold mb-4 flex-shrink-0">{T.output}</h2>
        <div className="flex-1 flex flex-col min-h-0 bg-neutral-100 dark:bg-neutral-800/50 rounded-md overflow-hidden relative group p-2 sm:p-3 min-h-[300px]">
          {rightPanel}
        </div>
      </div>
    </div>
  );
};

export default TwoColumnLayout;
