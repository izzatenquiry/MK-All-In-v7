import React, { useState, useEffect } from 'react';
import { BRAND_CONFIG } from '../services/brandConfig';

/**
 * “IP blocked by Google” style page – full-page layout.
 * Shown when maintenanceMode is true in brandConfig (VEOLY-AI).
 */
const MaintenancePage: React.FC = () => {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const [userIp, setUserIp] = useState<string | null>(null);

  useEffect(() => {
    fetch('https://api.ipify.org?format=json')
      .then((res) => res.json())
      .then((data: { ip: string }) => setUserIp(data.ip))
      .catch(() => setUserIp(null));
  }, []);

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col bg-neutral-50 text-neutral-800 font-sans antialiased">
      {/* Main content - centered, grows to fill */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 py-6 sm:py-12 md:py-16">
        <div className="w-full max-w-2xl sm:max-w-3xl md:max-w-4xl">
          {/* Card */}
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg shadow-neutral-200/50 border border-neutral-200/80 overflow-hidden">
            {/* Header */}
            <div className="px-5 sm:px-8 md:px-10 pt-6 sm:pt-8 md:pt-10 pb-5 sm:pb-6 md:pb-8">
              <div className="flex flex-wrap items-baseline gap-2 sm:gap-3">
                <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold text-neutral-800 tracking-tight">
                  Access blocked
                </h1>
                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium bg-red-50 text-red-600 border border-red-200">
                  Blocked
                </span>
              </div>
              <p className="mt-3 sm:mt-4 text-sm sm:text-base text-neutral-600 leading-relaxed">
                Your IP address{userIp != null ? ` (${userIp})` : ''} has been blocked by Google. Please use{' '}
                <a href="https://labs.google/fx/tools/flow" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium underline-offset-2 touch-manipulation">
                  Flow
                </a>{' '}
                officially, not on this site.
              </p>
              <p className="mt-2 text-xs sm:text-sm text-neutral-400">{timestamp}</p>
            </div>

            {/* Connection status chain */}
            <div className="px-5 sm:px-8 md:px-10 py-5 sm:py-6 md:py-8 bg-neutral-50/80 border-y border-neutral-100">
              <div className="flex items-start justify-between gap-1 sm:gap-3 md:gap-4">
                <div className="flex flex-col items-center flex-1 min-w-0">
                  <div className="relative mb-1.5 sm:mb-2">
                    <svg className="w-9 h-9 sm:w-11 sm:h-11 md:w-12 md:h-12 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="3" width="20" height="14" rx="2" />
                      <path d="M8 21h8M12 17v4" />
                    </svg>
                    <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 flex h-4 w-4 sm:h-5 sm:w-5 items-center justify-center rounded-full bg-green-500 text-white">
                      <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
                    </span>
                  </div>
                  <span className="text-xs sm:text-sm font-medium text-neutral-800">You</span>
                  <span className="text-[10px] sm:text-xs text-neutral-500">Browser</span>
                  <span className="text-[10px] sm:text-xs font-medium text-green-600 mt-0.5">Working</span>
                </div>
                <div className="flex-1 min-w-[8px] sm:min-w-[20px] md:min-w-[24px] pt-4 sm:pt-5 md:pt-6 border-b-2 border-neutral-200 border-dashed self-center" />
                <div className="flex flex-col items-center flex-1 min-w-0">
                  <div className="relative mb-1.5 sm:mb-2">
                    <svg className="w-9 h-9 sm:w-11 sm:h-11 md:w-12 md:h-12 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
                    </svg>
                    <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 flex h-4 w-4 sm:h-5 sm:w-5 items-center justify-center rounded-full bg-green-500 text-white">
                      <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
                    </span>
                  </div>
                  <span className="text-xs sm:text-sm font-medium text-neutral-800 truncate max-w-full">{BRAND_CONFIG.domain}</span>
                  <span className="text-[10px] sm:text-xs text-blue-600">Network</span>
                  <span className="text-[10px] sm:text-xs font-medium text-green-600 mt-0.5">Working</span>
                </div>
                <div className="flex-1 min-w-[8px] sm:min-w-[20px] md:min-w-[24px] pt-4 sm:pt-5 md:pt-6 border-b-2 border-neutral-200 border-dashed self-center" />
                <div className="flex flex-col items-center flex-1 min-w-0">
                  <div className="relative mb-1.5 sm:mb-2">
                    <svg className="w-9 h-9 sm:w-11 sm:h-11 md:w-12 md:h-12 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="2" width="20" height="8" rx="2" />
                      <path d="M6 6h.01M10 6h.01M14 6h.01" />
                      <path d="M6 14v4M10 14v4M14 14v4M18 14v4" />
                    </svg>
                    <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 flex h-4 w-4 sm:h-5 sm:w-5 items-center justify-center rounded-full bg-red-500 text-white">
                      <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </span>
                  </div>
                  <span className="text-xs sm:text-sm font-medium text-neutral-800 truncate max-w-full">Your IP</span>
                  <span className="text-[10px] sm:text-xs text-neutral-500 truncate max-w-full">{userIp ?? '—'}</span>
                  <span className="text-[10px] sm:text-xs font-medium text-red-600 mt-0.5">Blocked</span>
                </div>
              </div>
              <div className="flex justify-end mt-1 pr-[33%] sm:pr-[calc(33.33%+0.5rem)]">
                <svg className="w-3 h-3 sm:w-4 sm:h-4 text-neutral-300" fill="currentColor" viewBox="0 0 20 20"><path d="M5 6l5 5 5-5" /></svg>
              </div>
            </div>

            {/* What happened? / What can I do? */}
            <div className="px-5 sm:px-8 md:px-10 py-5 sm:py-6 md:py-8 grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6 md:gap-8">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-neutral-800 mb-1.5 sm:mb-2">What happened?</h2>
                <p className="text-sm sm:text-base text-neutral-600 leading-relaxed">
                  This request has been blocked. Your IP address has been identified and restricted by Google.
                </p>
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-neutral-800 mb-1.5 sm:mb-2">What can I do?</h2>
                <p className="text-sm sm:text-base text-neutral-600 leading-relaxed">
                  Please use <a href="https://labs.google/fx/tools/flow" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium underline-offset-2 touch-manipulation">Flow</a> officially, not on this site.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer - fixed at bottom */}
      <footer className="shrink-0 py-5 sm:py-6 text-center border-t border-neutral-200/80 bg-white/80">
        <p className="text-[10px] sm:text-xs text-neutral-500 font-bold tracking-widest uppercase px-4">
          GOOGLE DATACENTER KUALA LUMPUR
        </p>
      </footer>
    </div>
  );
};

export default MaintenancePage;
