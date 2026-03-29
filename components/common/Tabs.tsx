
import React from 'react';

export interface Tab<T extends string> {
  id: T;
  label: string;
  adminOnly?: boolean;
  count?: number;
}

interface TabsProps<T extends string> {
  tabs: Tab<T>[];
  activeTab: T;
  // FIX: Correctly typed the `setActiveTab` prop to be compatible with React's `useState` dispatcher (`React.Dispatch<React.SetStateAction<T>>`).
  setActiveTab: React.Dispatch<React.SetStateAction<T>>;
  isAdmin?: boolean;
}

const Tabs = <T extends string>({ tabs, activeTab, setActiveTab, isAdmin = false }: TabsProps<T>) => {
  // Filter tabs: Remove admin-only tabs if user is not admin
  const visibleTabs = tabs.filter(tab => {
    // If tab has adminOnly flag and user is not admin, hide it
    if (tab.adminOnly && !isAdmin) {
      return false;
    }
    // Also explicitly check for admin tab IDs
    if (!isAdmin && (tab.id === 'recaptcha' || tab.id === 'server-status' || tab.id === 'content-admin')) {
      return false;
    }
    return true;
  });
  
  return (
    <div
      className="inline-flex max-w-full p-0.5 bg-neutral-100/90 dark:bg-neutral-800/90 rounded-xl sm:rounded-2xl items-center gap-0.5 overflow-x-auto border border-neutral-200/70 dark:border-neutral-700/60 shadow-sm flex-nowrap"
      role="tablist"
    >
      {visibleTabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`flex-shrink-0 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg sm:rounded-xl transition-colors duration-200 whitespace-nowrap relative z-10 leading-tight ${
            activeTab === tab.id
              ? 'bg-primary-600 dark:bg-primary-600 text-white shadow-sm'
              : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-200/80 dark:hover:bg-neutral-700/80'
          }`}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span
              className={`ml-1.5 px-1 py-px rounded text-[10px] tabular-nums ${
                activeTab === tab.id
                  ? 'bg-white/20 text-white'
                  : 'bg-neutral-200/90 dark:bg-neutral-600 text-neutral-600 dark:text-neutral-300'
              }`}
            >
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
};

export default Tabs;