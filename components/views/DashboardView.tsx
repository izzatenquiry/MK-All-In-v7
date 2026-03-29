
import React, { useState, useEffect } from 'react';
import { getContent } from '../../services/contentService';
import { type TutorialContent, type User, type Language, type View, type Announcement } from '../../types';
import { ImageIcon, VideoIcon, TrendingUpIcon, WandIcon, FileTextIcon, ChevronRightIcon, PlayIcon } from '../Icons';
import { BRAND_CONFIG } from '../../services/brandConfig';

interface DashboardViewProps {
    currentUser: User;
    language: Language;
    navigateTo: (view: View) => void;
    announcements: Announcement[];
}

const DashboardView: React.FC<DashboardViewProps> = ({ currentUser, navigateTo, announcements }) => {
  const [content, setContent] = useState<TutorialContent | null>(null);
  /** Same source as Settings → Profile → Video Cache Manager (Images/Videos generated) */
  const userImages = currentUser.totalImage ?? 0;
  const userVideos = currentUser.totalVideo ?? 0;

  useEffect(() => {
    const fetchPageData = async () => {
        const contentData = await getContent();
        setContent(contentData);
    };
    fetchPageData();
  }, []);

  // Extract YouTube video ID and generate thumbnail URL
  // Each brand uses thumbnail from their own video
  const getYouTubeThumbnail = (url: string): string | null => {
    if (!url) return null;
    
    // Extract video ID from various YouTube URL formats
    const patterns = [
      /(?:youtube\.com\/embed\/|youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
      /youtube\.com\/embed\/([^&\n?#]+)/,
    ];
    
    let videoId: string | null = null;
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        videoId = match[1];
        break;
      }
    }
    
    if (!videoId) return null;
    
    // Each brand uses thumbnail from their own video
    return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  };

  // Get video URL for opening in new tab
  const getVideoUrl = (url: string): string => {
    if (!url) return '#';
    
    // Convert embed URL to watch URL if needed
    if (url.includes('youtube.com/embed/')) {
      const videoId = url.match(/embed\/([^?&]+)/)?.[1];
      if (videoId) {
        return `https://www.youtube.com/watch?v=${videoId}`;
      }
    }
    
    return url;
  };

  const handleVideoClick = () => {
    if (content?.mainVideoUrl) {
      const videoUrl = getVideoUrl(content.mainVideoUrl);
      window.open(videoUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const QuickActionCard = ({ title, desc, icon: Icon, color, onClick, delay }: any) => (
      <button 
        onClick={onClick}
        className={`holo-card p-6 flex flex-col items-start justify-between h-40 group hover:border-${color}-500/50 transition-all duration-500 animate-zoomIn`}
        style={{ animationDelay: `${delay}ms` }}
      >
          {/* Ambient Glow */}
          <div className={`absolute -right-10 -top-10 w-32 h-32 rounded-full bg-${color}-500 opacity-20 blur-[50px] group-hover:opacity-40 transition-opacity duration-500`}></div>
          
          <div className={`relative z-10 p-3 rounded-2xl bg-neutral-100 dark:bg-white/5 border border-neutral-300 dark:border-white/10 text-${color}-600 dark:text-${color}-400 group-hover:text-white group-hover:bg-${color}-500 group-hover:border-${color}-400 transition-all duration-300`}>
              <Icon className="w-6 h-6" />
          </div>
          
          <div className="relative z-10 text-left w-full">
              <div className="flex justify-between items-center w-full">
                  <h3 className="font-bold text-base sm:text-lg text-neutral-900 dark:text-white group-hover:text-glow transition-all">{title}</h3>
                  <ChevronRightIcon className="w-4 h-4 text-neutral-600 dark:text-white/30 group-hover:text-neutral-900 dark:group-hover:text-white group-hover:translate-x-1 transition-all" />
              </div>
              <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 mt-1 font-medium">{desc}</p>
          </div>
      </button>
  );

  return (
    <div className="max-w-[1600px] mx-auto space-y-8">
      
      {/* Header Section with Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-end mb-4 animate-zoomIn">
        {/* Hello Message */}
        <div className="lg:col-span-8">
            <div className="flex items-center gap-3 mb-2">
                <div className="h-px w-8 bg-brand-start"></div>
                <span className="text-xs font-mono text-brand-start tracking-widest uppercase">System Online</span>
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-6xl font-black text-neutral-900 dark:text-white tracking-tight leading-none">
                HELLO, <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-start to-brand-end">{currentUser.fullName?.split(' ')[0] || currentUser.username}</span>
            </h1>
            <p className="text-neutral-600 dark:text-neutral-400 mt-2 text-sm sm:text-base lg:text-lg font-light">Welcome to the future of content creation.</p>
            {announcements.length > 0 && (
              <div className="mt-4 w-full bg-white/80 dark:bg-white/[0.05] border border-brand-start/20 text-neutral-900 dark:text-white p-2.5 rounded-2xl shadow-[0_8px_30px_rgba(74,108,247,0.15)] flex items-center gap-3 animate-zoomIn relative overflow-hidden group backdrop-blur-xl">
                <div className="flex-shrink-0 z-10 pr-4 pl-2 py-1 flex items-center gap-2">
                  <span className="bg-brand-start px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shadow-lg text-white">New</span>
                </div>
                <div className="flex-1 overflow-hidden relative h-6">
                  <div className="absolute whitespace-nowrap animate-marquee flex items-center h-full">
                    <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200 mr-24">{announcements[0].title}: {announcements[0].content}</span>
                    <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200 mr-24">{announcements[0].title}: {announcements[0].content}</span>
                    <span className="text-sm font-medium text-neutral-200 mr-24">{announcements[0].title}: {announcements[0].content}</span>
                    <span className="text-sm font-medium text-neutral-200 mr-24">{announcements[0].title}: {announcements[0].content}</span>
                  </div>
                </div>
              </div>
            )}
        </div>

        {/* Stats Module (Moved to Header) */}
        <div className="lg:col-span-4">
             <div className="holo-card p-6 relative bg-gradient-to-br from-neutral-50 to-neutral-100 dark:from-[#1a1a2e] dark:to-[#16213e] overflow-hidden border border-neutral-200 dark:border-white/10">
                 <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                     <TrendingUpIcon className="w-24 h-24 text-neutral-900 dark:text-white" />
                 </div>
                 <h3 className="text-[10px] font-bold text-neutral-600 dark:text-neutral-400 uppercase tracking-widest mb-4">Your generation</h3>
                 
                 <div className="grid grid-cols-2 gap-4 relative z-10">
                     <div>
                         <div className="flex items-baseline gap-1 mb-1">
                             <p className="text-2xl font-black text-neutral-900 dark:text-white">{userImages.toLocaleString()}</p>
                         </div>
                         <span className="text-[10px] font-bold text-green-600 dark:text-green-400 flex items-center gap-1 uppercase tracking-wide">
                             <ImageIcon className="w-3 h-3" /> Images
                         </span>
                         <div className="w-full bg-neutral-200 dark:bg-white/10 rounded-full h-1 mt-2">
                             <div className="bg-brand-start h-1 rounded-full w-3/4 shadow-[0_0_10px_#4A6CF7]"></div>
                         </div>
                     </div>
                     
                     <div>
                         <div className="flex items-baseline gap-1 mb-1">
                             <p className="text-2xl font-black text-neutral-900 dark:text-white">{userVideos.toLocaleString()}</p>
                         </div>
                         <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 flex items-center gap-1 uppercase tracking-wide">
                             <VideoIcon className="w-3 h-3" /> Videos
                         </span>
                         <div className="w-full bg-neutral-200 dark:bg-white/10 rounded-full h-1 mt-2">
                             <div className="bg-brand-end h-1 rounded-full w-1/2 shadow-[0_0_10px_#A05BFF]"></div>
                         </div>
                     </div>
                 </div>
             </div>
        </div>
      </div>

      {/* Main Content Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        
        {/* Left Panel: Welcome Video */}
        {content?.mainVideoUrl && (
            <div className="w-full animate-zoomIn h-full" style={{ animationDelay: '50ms' }}>
                <div className="nav-capsule p-1 rounded-3xl overflow-hidden shadow-2xl border border-white/10 relative group h-full">
                        <button
                            onClick={handleVideoClick}
                            className="relative aspect-video w-full bg-black rounded-[1.2rem] overflow-hidden cursor-pointer group/btn hover:scale-[1.02] transition-transform duration-300"
                        >
                            {getYouTubeThumbnail(content.mainVideoUrl) ? (
                                <>
                                    <img 
                                        src={getYouTubeThumbnail(content.mainVideoUrl)!} 
                                        alt="Get Started Video"
                                        className="w-full h-full object-cover"
                                    />
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover/btn:bg-black/30 transition-colors">
                                        <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white/90 dark:bg-white/80 flex items-center justify-center shadow-2xl group-hover/btn:scale-110 transition-transform">
                                            <PlayIcon className="w-8 h-8 md:w-10 md:h-10 text-neutral-900 ml-1" />
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-900">
                                    <div className="text-center">
                                        <VideoIcon className="w-16 h-16 text-white/50 mx-auto mb-4" />
                                        <p className="text-white/70 text-sm">Click to watch video</p>
                                    </div>
                                </div>
                            )}
                        </button>
                </div>
            </div>
        )}

        {/* Right Panel: Action Modules (2x2 Grid) */}
        <div className="grid grid-cols-2 gap-4 md:gap-6 w-full">
            <QuickActionCard 
                title="Image Gen" 
                desc="NanoBanana Engine" 
                icon={ImageIcon} 
                color="purple" 
                onClick={() => navigateTo('ai-image-suite')}
                delay={100}
            />
            <QuickActionCard 
                title="Video Gen" 
                desc="Veo Cinematic" 
                icon={VideoIcon} 
                color="blue" 
                onClick={() => navigateTo('ai-video-suite')}
                delay={200}
            />
            <QuickActionCard 
                title="Copywriter" 
                desc="Neuro-Language" 
                icon={FileTextIcon} 
                color="green" 
                onClick={() => navigateTo('ai-text-suite')}
                delay={300}
            />
            <QuickActionCard 
                title="Enhancer" 
                desc="Upscale Logic" 
                icon={WandIcon} 
                color="pink" 
                onClick={() => navigateTo('ai-image-suite')}
                delay={400}
            />
        </div>

      </div>
    </div>
  );
};

export default DashboardView;

