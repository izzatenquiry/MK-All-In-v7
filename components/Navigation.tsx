
import React from 'react';
import { type View, type User } from '../types';
import { BRAND_CONFIG } from '../services/brandConfig';
import {
  HomeIcon,
  ImageIcon,
  VideoIcon,
  FileTextIcon,
  SettingsIcon,
  LibraryIcon,
  GalleryIcon,
  ShieldCheckIcon,
  LogoutIcon,
  XIcon,
  UserIcon,
  RefreshCwIcon,
  MailIcon,
  QuestionSolutionIcon,
} from './Icons';

interface NavigationProps {
  activeView: View;
  setActiveView: (view: View) => void;
  currentUser: User;
  onLogout: () => void;
  isMenuOpen: boolean;
  setIsMenuOpen: (isOpen: boolean) => void;
  appVersion: string;
}

const MAIN_NAV_ITEMS: Array<{ id: View; icon: React.ComponentType<{ className?: string }>; label: string; description: string }> = [
  { id: 'home', icon: HomeIcon, label: 'Dashboard', description: 'Overview and quick actions' },
  { id: 'ai-text-suite', icon: FileTextIcon, label: 'Text Suite', description: 'Copy and script generation' },
  { id: 'ai-image-suite', icon: ImageIcon, label: 'Image Suite', description: 'Image tools and edits' },
  { id: 'ai-video-suite', icon: VideoIcon, label: 'Video Suite', description: 'Generate AI videos' },
  { id: 'ai-prompt-library-suite', icon: LibraryIcon, label: 'Prompt Library', description: 'Reusable prompts collection' },
  { id: 'gallery', icon: GalleryIcon, label: 'Gallery', description: 'Your generated assets' },
];

const SYSTEM_MODULES: Array<{ id: View; icon: React.ComponentType<{ className?: string }>; label: string; description: string }> = [
  { id: 'settings', icon: SettingsIcon, label: 'Settings', description: 'Token & app controls' },
];

const Navigation: React.FC<NavigationProps> = ({
  activeView,
  setActiveView,
  currentUser,
  onLogout,
  isMenuOpen,
  setIsMenuOpen,
  appVersion,
}) => {
  const displayUsername = (() => {
    const raw = (currentUser.fullName?.trim() ? currentUser.fullName : currentUser.username) || '';
    const firstToken = raw.split(' ')[0] || raw;
    // Clean common email-style suffixes (e.g. "VEOLY.AI" domain suffix)
    return firstToken.replace(/\.(com|net|org|my|co)$/i, '');
  })();

  const NavButton = ({
    id,
    icon: Icon,
    label,
    description,
    onClick,
  }: {
    id: View;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    description?: string;
    onClick: () => void;
  }) => {
    const isActive = activeView === id;
    return (
      <button
        onClick={onClick}
        className={`w-full rounded-2xl text-left p-3 transition-all duration-300 border ${
          isActive
            ? 'bg-gradient-to-r from-brand-start/20 to-brand-end/20 border-brand-start/40 dark:border-brand-start/30 text-neutral-900 dark:text-white shadow-[0_8px_24px_rgba(74,108,247,0.2)]'
            : 'bg-white/60 dark:bg-white/[0.03] border-neutral-200/80 dark:border-white/10 text-neutral-700 dark:text-neutral-300 hover:bg-white dark:hover:bg-white/[0.06]'
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 h-9 w-9 rounded-xl flex items-center justify-center ${
              isActive ? 'bg-white/80 dark:bg-white/10' : 'bg-neutral-100 dark:bg-white/5'
            }`}
          >
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">{label}</p>
            {description ? <p className="text-[11px] mt-0.5 text-neutral-600 dark:text-neutral-400">{description}</p> : null}
          </div>
        </div>
      </button>
    );
  };

  const MobileDock = () => (
    <div className="md:hidden fixed bottom-4 left-3 right-3 z-50">
      <div className="bg-white/90 dark:bg-[#090b17]/90 backdrop-blur-2xl rounded-3xl px-3 h-[72px] flex items-center justify-between relative overflow-hidden border border-neutral-200/80 dark:border-white/10 shadow-[0_14px_40px_rgba(15,23,42,0.18)] dark:shadow-[0_18px_42px_rgba(0,0,0,0.55)]">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-[1px] bg-gradient-to-r from-transparent via-brand-start to-transparent opacity-50"></div>
        {MAIN_NAV_ITEMS.filter((item) => item.id !== 'ai-prompt-library-suite').map((item) => {
          const isActive = activeView === item.id;
          return (
            <button key={item.id} onClick={() => setActiveView(item.id)} className="relative z-10 flex items-center justify-center w-full h-full">
              <div
                className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-300 ${
                  isActive
                    ? 'bg-gradient-to-br from-brand-start to-brand-end text-white shadow-[0_0_18px_rgba(74,108,247,0.48)]'
                    : 'text-neutral-600 dark:text-neutral-500 hover:text-primary-600 dark:hover:text-white'
                }`}
              >
                <item.icon className="w-5 h-5" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  const MobileDrawer = () => (
    <>
      <div
        className={`fixed inset-0 bg-black/75 backdrop-blur-sm z-[60] transition-opacity duration-300 ${
          isMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setIsMenuOpen(false)}
      />
      <div
        className={`fixed top-4 right-4 bottom-4 left-4 bg-white/94 dark:bg-[#090b17]/94 backdrop-blur-2xl rounded-3xl z-[70] transform transition-transform duration-300 flex flex-col overflow-hidden border border-neutral-200/80 dark:border-white/10 shadow-[0_20px_50px_rgba(15,23,42,0.24)] dark:shadow-[0_24px_58px_rgba(0,0,0,0.65)] ${
          isMenuOpen ? 'translate-x-0' : 'translate-x-[110%]'
        }`}
      >
        <div className="p-4 border-b border-neutral-200/80 dark:border-white/10 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-brand-start font-semibold">VEOLY-AI App</p>
            <p className="text-sm text-neutral-700 dark:text-neutral-300">Navigation Hub</p>
          </div>
          <button
            onClick={() => setIsMenuOpen(false)}
            className="p-2 rounded-full bg-neutral-100/80 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4">
          <div className="rounded-2xl border border-neutral-200/80 dark:border-white/10 bg-white/70 dark:bg-white/[0.03] p-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-start to-brand-end p-[1px] shrink-0">
                <div className="w-full h-full rounded-full bg-white dark:bg-black overflow-hidden flex items-center justify-center">
                  {currentUser.avatarUrl ? (
                    <img src={currentUser.avatarUrl} alt="User" className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon className="w-5 h-5 text-neutral-400 dark:text-neutral-400" />
                  )}
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-neutral-900 dark:text-white truncate">{displayUsername}</p>
                <p className="text-[11px] text-brand-start uppercase tracking-wider">{currentUser.status}</p>
              </div>
            </div>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] mb-2 px-1 text-brand-start font-semibold">Main Modules</p>
            <div className="space-y-2">
              {MAIN_NAV_ITEMS.filter((item) => item.id !== 'ai-prompt-library-suite').map((item) => (
                <NavButton
                  key={item.id}
                  id={item.id}
                  icon={item.icon}
                  label={item.label}
                  description={item.description}
                  onClick={() => {
                    setActiveView(item.id);
                    setIsMenuOpen(false);
                  }}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] mb-2 px-1 text-brand-start font-semibold">System</p>
            <div className="space-y-2">
              {MAIN_NAV_ITEMS.filter((item) => item.id === 'ai-prompt-library-suite').map((item) => (
                <NavButton
                  key={item.id}
                  id={item.id}
                  icon={item.icon}
                  label={item.label}
                  description={item.description}
                  onClick={() => {
                    setActiveView(item.id);
                    setIsMenuOpen(false);
                  }}
                />
              ))}
              {SYSTEM_MODULES.map((item) => (
                <NavButton
                  key={item.id}
                  id={item.id}
                  icon={item.icon}
                  label={item.label}
                  description={item.description}
                  onClick={() => {
                    setActiveView(item.id);
                    setIsMenuOpen(false);
                  }}
                />
              ))}
              <NavButton
                id="settings-faq"
                icon={QuestionSolutionIcon}
                label="Support and FAQ"
                description="Help and common questions"
                onClick={() => {
                  setActiveView('settings-faq');
                  setIsMenuOpen(false);
                }}
              />
              {currentUser.role === 'admin' ? (
                <NavButton
                  id="token-management-suite"
                  icon={ShieldCheckIcon}
                  label="Token Management"
                  description="Manage tokens and users"
                  onClick={() => {
                    setActiveView('token-management-suite');
                    setIsMenuOpen(false);
                  }}
                />
              ) : null}
              {currentUser.role === 'admin' ? (
                <NavButton
                  id="ultra-ai-sales"
                  icon={MailIcon}
                  label="ULTRA AI Sales"
                  description="Sales and support inbox"
                  onClick={() => {
                    setActiveView('ultra-ai-sales');
                    setIsMenuOpen(false);
                  }}
                />
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              onClick={() => window.location.reload()}
              className="flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 text-xs font-semibold text-neutral-700 dark:text-neutral-300 border border-neutral-200/80 dark:border-white/10"
            >
              <RefreshCwIcon className="w-4 h-4" />
              Refresh
            </button>
            <button
              onClick={onLogout}
              className="flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-600/20 hover:bg-red-100 dark:hover:bg-red-600/30 text-xs font-semibold text-red-600 dark:text-red-300 border border-red-200 dark:border-red-600/30"
            >
              <LogoutIcon className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </div>
    </>
  );

  const DesktopSidebar = () => (
    <aside className="hidden md:flex flex-col w-[272px] fixed left-4 top-4 bottom-4 z-40 rounded-[28px] border border-neutral-200/80 dark:border-white/10 bg-white/88 dark:bg-[#090b17]/88 backdrop-blur-2xl shadow-[0_18px_50px_rgba(15,23,42,0.18)] dark:shadow-[0_22px_56px_rgba(0,0,0,0.6)] p-4">
      <div className="rounded-2xl border border-neutral-200/80 dark:border-white/10 bg-white/70 dark:bg-white/[0.03] p-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-start to-brand-end flex items-center justify-center shadow-[0_0_20px_rgba(74,108,247,0.6)] shrink-0">
            <span className="font-black text-white text-lg">{BRAND_CONFIG.logo.letter}</span>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.16em] text-brand-start font-semibold">VEOLY User</p>
            <p className="text-sm font-semibold text-neutral-900 dark:text-white truncate">{displayUsername}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-1">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] mb-2 px-1 text-brand-start font-semibold">Main Modules</p>
          <div className="space-y-2">
            {MAIN_NAV_ITEMS.map((item) => (
              <NavButton
                key={item.id}
                id={item.id}
                icon={item.icon}
                label={item.label}
                description={item.description}
                onClick={() => setActiveView(item.id)}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] mb-2 px-1 text-brand-start font-semibold">System</p>
          <div className="space-y-2">
            {SYSTEM_MODULES.map((item) => (
              <NavButton
                key={item.id}
                id={item.id}
                icon={item.icon}
                label={item.label}
                description={item.description}
                onClick={() => setActiveView(item.id)}
              />
            ))}
            <NavButton
              id="settings-faq"
              icon={QuestionSolutionIcon}
              label="Support and FAQ"
              description="Help and common questions"
              onClick={() => setActiveView('settings-faq')}
            />
            {currentUser.role === 'admin' ? (
              <NavButton
                id="token-management-suite"
                icon={ShieldCheckIcon}
                label="Token Management"
                description="Manage tokens and users"
                onClick={() => setActiveView('token-management-suite')}
              />
            ) : null}
            {currentUser.role === 'admin' ? (
              <NavButton
                id="ultra-ai-sales"
                icon={MailIcon}
                label="ULTRA AI Sales"
                description="Sales and support inbox"
                onClick={() => setActiveView('ultra-ai-sales')}
              />
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-3 mt-2 border-t border-neutral-200/80 dark:border-white/10">
        <button
          onClick={() => window.location.reload()}
          className="flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 text-xs font-semibold text-neutral-700 dark:text-neutral-300 border border-neutral-200/80 dark:border-white/10"
        >
          <RefreshCwIcon className="w-4 h-4" />
          Refresh
        </button>
        <button
          onClick={onLogout}
          className="flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-600/20 hover:bg-red-100 dark:hover:bg-red-600/30 text-xs font-semibold text-red-600 dark:text-red-300 border border-red-200 dark:border-red-600/30"
        >
          <LogoutIcon className="w-4 h-4" />
          Logout
        </button>
      </div>
      <div className="pt-2 text-center">
        <span className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400 uppercase tracking-[0.22em]">
          {appVersion}
        </span>
      </div>
    </aside>
  );

  return (
    <>
      <DesktopSidebar />
      <MobileDock />
      <MobileDrawer />
    </>
  );
};

export default Navigation;
