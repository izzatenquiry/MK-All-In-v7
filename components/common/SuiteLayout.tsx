
import React from 'react';

interface SuiteLayoutProps {
    title: string;
    subtitle?: string;
    icon?: React.ComponentType<{ className?: string }>;
    children: React.ReactNode;
}

const SuiteLayout: React.FC<SuiteLayoutProps> = ({ children }) => {
    return (
        <div className="w-full max-w-[1680px] mx-auto flex flex-col md:pb-6 relative">
            <div className="relative flex-1 rounded-[30px] border border-neutral-200/80 dark:border-white/10 bg-white/78 dark:bg-white/[0.03] backdrop-blur-2xl p-3 sm:p-4 lg:p-6 flex flex-col z-10 animate-zoomIn shadow-[0_18px_48px_rgba(15,23,42,0.08)] dark:shadow-[0_18px_48px_rgba(0,0,0,0.45)]" style={{ animationDelay: '100ms' }}>
                <div className="absolute inset-0 pointer-events-none opacity-[0.05] dark:opacity-[0.08]" style={{ backgroundImage: 'linear-gradient(rgba(99,102,241,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.2) 1px, transparent 1px)', backgroundSize: '36px 36px' }}></div>

                <div className="relative z-10 flex flex-col h-full">
                    <div className="rounded-2xl border border-neutral-200/70 dark:border-white/10 bg-white/80 dark:bg-white/[0.02] p-2 sm:p-3 lg:p-4">
                        {children}
                    </div>
                </div>
            </div>

            <div className="fixed top-20 right-0 w-[500px] h-[500px] bg-brand-start/10 rounded-full blur-[120px] -z-10 pointer-events-none animate-pulse-slow"></div>
            <div className="fixed bottom-0 left-0 w-[400px] h-[400px] bg-brand-end/10 rounded-full blur-[100px] -z-10 pointer-events-none animate-float"></div>
        </div>
    );
};

export default SuiteLayout;
