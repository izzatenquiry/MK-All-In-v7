
import React, { useState, useCallback } from 'react';
import { 
    CheckCircleIcon, XIcon, InformationCircleIcon, KeyIcon, CreditCardIcon, LightbulbIcon,
    ImageIcon, VideoIcon, MegaphoneIcon, RobotIcon, LibraryIcon, SettingsIcon,
    GalleryIcon, AlertTriangleIcon, ChevronLeftIcon, ChevronRightIcon
} from '../Icons';
// FIX: Add missing Language type for component props.
import { type Language } from '../../types';
import { BRAND_CONFIG } from '../../services/brandConfig';


// --- Video Slideshow Data ---
// User: You can replace the title and src for each video below.
// Place your video files in a 'public/videos' folder if they don't exist.
const slideshowVideos = [
  {
    title: "Video 1: Platform Overview",
    src: "https://veoly-ai.com/wp-content/uploads/2025/11/WhatsApp-Video-2025-11-13-at-10.41.36-PM.mp4",
  },
  {
    title: "Video 2: AI Image Suite",
    src: "https://veoly-ai.com/wp-content/uploads/2025/11/WhatsApp-Video-2025-11-13-at-10.41.37-PM.mp4",
  },
  {
    title: "Video 3: AI Video Suite",
    src: "https://veoly-ai.com/wp-content/uploads/2025/11/WhatsApp-Video-2025-11-13-at-10.41.37-PM-1.mp4",
  },
  {
    title: "Video 4: Content Ideas",
    src: "https://veoly-ai.com/wp-content/uploads/2025/11/WhatsApp-Video-2025-11-13-at-10.41.36-PM-1.mp4",
  },
  {
    title: "Video 5: Prompt Gallery",
    src: "https://veoly-ai.com/wp-content/uploads/2025/11/WhatsApp-Video-2025-11-13-at-10.41.37-PM-2.mp4",
  },
];


const Section: React.FC<{ title: string; children: React.ReactNode; icon?: React.ComponentType<{ className?: string }> }> = ({ title, children, icon: Icon }) => (
    <div className="py-8 sm:py-10 border-b border-neutral-100 dark:border-neutral-800 last:border-b-0">
        <h3 className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white mb-4 sm:mb-6 flex items-center gap-3 sm:gap-4">
            {Icon && (
                <div className="p-2 bg-brand-start/10 rounded-xl">
                    <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-brand-start flex-shrink-0" />
                </div>
            )}
            {title}
        </h3>
        <div className="space-y-4 sm:space-y-5 text-neutral-600 dark:text-neutral-300 text-sm sm:text-base leading-relaxed pl-1 sm:pl-14">{children}</div>
    </div>
);

const SubSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="mt-6 sm:mt-8 bg-neutral-50 dark:bg-neutral-800/30 p-5 sm:p-6 rounded-2xl border border-neutral-100 dark:border-neutral-800">
        <h4 className="text-base sm:text-lg font-bold text-neutral-800 dark:text-neutral-100 mb-3">{title}</h4>
        <div className="space-y-3 text-xs sm:text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">{children}</div>
    </div>
);

interface GetStartedViewProps {
    // FIX: Add missing 'language' prop to satisfy component signature in App.tsx.
    language: Language;
}

const GetStartedView: React.FC<GetStartedViewProps> = () => {
    const [currentSlide, setCurrentSlide] = useState(0);

    const nextSlide = useCallback(() => {
        setCurrentSlide(prev => (prev === slideshowVideos.length - 1 ? 0 : prev + 1));
    }, []);

    const prevSlide = useCallback(() => {
        setCurrentSlide(prev => (prev === 0 ? slideshowVideos.length - 1 : prev - 1));
    }, []);

    const goToSlide = (index: number) => {
        setCurrentSlide(index);
    };


    return (
        <div className="max-w-5xl mx-auto pb-20">
            {/* Video Slideshow Section */}
            <div className="mb-10 sm:mb-12 bg-white dark:bg-neutral-900 p-6 sm:p-8 rounded-3xl shadow-soft border border-neutral-100 dark:border-neutral-800">
                <div className="flex items-center justify-between mb-4 sm:mb-6">
                    <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white">Video Tutorials</h2>
                    <span className="text-xs sm:text-sm font-medium text-neutral-500 bg-neutral-100 dark:bg-neutral-800 px-3 py-1 rounded-full">
                        {currentSlide + 1} / {slideshowVideos.length}
                    </span>
                </div>
                
                <div className="relative group rounded-2xl overflow-hidden shadow-lg bg-black">
                    <video 
                        key={slideshowVideos[currentSlide].src} 
                        src={slideshowVideos[currentSlide].src} 
                        controls 
                        autoPlay 
                        muted 
                        loop 
                        playsInline
                        className="w-full aspect-video object-contain"
                    />
                    
                    {/* Navigation Buttons */}
                    <button 
                        onClick={prevSlide} 
                        className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/10 backdrop-blur-md border border-white/20 text-white p-2 sm:p-3 rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-white/20 hover:scale-110 focus:outline-none"
                        aria-label="Previous video"
                    >
                        <ChevronLeftIcon className="w-5 h-5 sm:w-6 sm:h-6"/>
                    </button>
                    <button 
                        onClick={nextSlide} 
                        className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/10 backdrop-blur-md border border-white/20 text-white p-2 sm:p-3 rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-white/20 hover:scale-110 focus:outline-none"
                        aria-label="Next video"
                    >
                        <ChevronRightIcon className="w-5 h-5 sm:w-6 sm:h-6"/>
                    </button>
                </div>
                
                <div className="mt-4 sm:mt-6 flex flex-col items-center">
                    <h3 className="text-base sm:text-lg font-bold text-neutral-800 dark:text-white mb-3 sm:mb-4">{slideshowVideos[currentSlide].title}</h3>
                    
                    {/* Slide Indicators */}
                    <div className="flex justify-center gap-1.5 sm:gap-2">
                        {slideshowVideos.map((_, index) => (
                            <button 
                                key={index} 
                                onClick={() => goToSlide(index)}
                                className={`h-1.5 sm:h-2 rounded-full transition-all duration-300 ${currentSlide === index ? 'w-6 sm:w-8 bg-brand-start' : 'w-1.5 sm:w-2 bg-neutral-300 dark:bg-neutral-700 hover:bg-neutral-400'}`}
                                aria-label={`Go to video ${index + 1}`}
                            />
                        ))}
                    </div>
                </div>
            </div>


            <div className="text-center mb-10 sm:mb-16">
                <h1 className="text-2xl sm:text-4xl md:text-5xl font-extrabold text-neutral-900 dark:text-white tracking-tight mb-3 sm:mb-4">
                    Getting Started
                </h1>
                <p className="text-sm sm:text-lg text-neutral-500 dark:text-neutral-400 max-w-2xl mx-auto">
                    Your complete guide to mastering the {BRAND_CONFIG.name} AI platform.
                </p>
            </div>

            <div className="bg-white dark:bg-neutral-900 p-6 sm:p-12 rounded-3xl shadow-soft border border-neutral-100 dark:border-neutral-800">

                <Section title={`Overview: How ${BRAND_CONFIG.name} Works`} icon={InformationCircleIcon}>
                    <p className="text-base sm:text-lg">Before you begin, it helps to understand the two parts of our service. Think of the platform like a high-performance car:</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                        <div className="bg-blue-50 dark:bg-blue-900/10 p-5 rounded-xl border border-blue-100 dark:border-blue-900/30">
                            <h5 className="font-bold text-brand-start mb-2">🚗 The {BRAND_CONFIG.name} Platform (the car)</h5>
                            <p className="text-xs sm:text-sm">Your account gives you access to the dashboard, tools (such as the Image and Video suites), and your garage (your Gallery). You are in the driver&apos;s seat.</p>
                        </div>
                        <div className="bg-purple-50 dark:bg-purple-900/10 p-5 rounded-xl border border-purple-100 dark:border-purple-900/30">
                            <h5 className="font-bold text-brand-end mb-2">⛽ {BRAND_CONFIG.name} Tokens (the fuel)</h5>
                            <p className="text-xs sm:text-sm">To make the car move (to generate content), you need fuel. That comes from Google&apos;s powerful AI engines, and it requires **Tokens** to access.</p>
                        </div>
                    </div>
                    <p>This guide explains how that &quot;fuel&quot; is provided automatically and how the service fits together.</p>
                </Section>

                <Section title="Chapter 1: Account &amp; Tokens" icon={KeyIcon}>
                    <SubSection title="How to sign in">
                        <p>This platform uses simple, passwordless sign-in. Enter the email address you used to register on our main website and click &apos;Sign In&apos;. Your session is saved automatically.</p>
                    </SubSection>
                    <SubSection title="Tokens: fully automatic">
                        <p className="font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 p-3 rounded-lg inline-block mb-2 text-xs sm:text-sm">Good news: you do not need to obtain or manage tokens yourself.</p>
                        <p>The {BRAND_CONFIG.name} platform handles everything for you. When you sign in, the system automatically loads a shared central token that unlocks all AI features. You can confirm it is active by looking for the <KeyIcon className="w-4 h-4 inline-block text-green-500" /> icon in the top-right corner.</p>
                        <p>This keeps your experience smooth without complicated setup.</p>
                    </SubSection>
                </Section>
                
                <Section title="Chapter 2: Costs &amp; billing" icon={CreditCardIcon}>
                    <p className="font-semibold text-neutral-800 dark:text-neutral-200">{BRAND_CONFIG.name} runs on a subscription that covers platform access and AI usage.</p>
                    <ul className="space-y-3 mt-4">
                        <li className="flex gap-3"><span className="w-1.5 h-1.5 rounded-full bg-neutral-400 mt-2 flex-shrink-0"></span><span><strong>No per-use billing:</strong> You are not charged per image or video. Your account status (e.g. Lifetime, Subscription) determines which AI features you can use.</span></li>
                        <li className="flex gap-3"><span className="w-1.5 h-1.5 rounded-full bg-neutral-400 mt-2 flex-shrink-0"></span><span><strong>Fair use policy:</strong> While we do not enforce a hard cap for everyone, the service is subject to fair use so performance stays stable for all users. Your unique token has a generous daily quota—enough for professional workflows.</span></li>
                        <li className="flex gap-3"><span className="w-1.5 h-1.5 rounded-full bg-neutral-400 mt-2 flex-shrink-0"></span><span><strong>You stay in control:</strong> Access is managed through your account status on {BRAND_CONFIG.domain}. You do not need a separate Google Cloud account or billing setup.</span></li>
                    </ul>
                </Section>
                
                <Section title="Chapter 3: AI Content Ideas Suite" icon={LightbulbIcon}>
                    <p>This suite helps you brainstorm and create written content for marketing.</p>
                     <ul className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        <li className="bg-neutral-50 dark:bg-neutral-800/30 p-4 rounded-xl text-xs sm:text-sm"><strong className="block text-brand-start mb-1">{BRAND_CONFIG.name} Staff</strong> A team of specialist AI agents. Pick an agent (e.g. Market Researcher or Ad Writer), provide your input, and get expert-level output for specific tasks.</li>
                        <li className="bg-neutral-50 dark:bg-neutral-800/30 p-4 rounded-xl text-xs sm:text-sm"><strong className="block text-brand-start mb-1">Content Ideas</strong> Beat creative block by entering a topic. AI uses Google Search for current trends and generates five fresh content ideas with titles and descriptions.</li>
                        <li className="bg-neutral-50 dark:bg-neutral-800/30 p-4 rounded-xl text-xs sm:text-sm"><strong className="block text-brand-start mb-1">Marketing Copy</strong> Create persuasive copy for ads, social posts, or websites. Describe the product, audience, and tone you want.</li>
                        <li className="bg-neutral-50 dark:bg-neutral-800/30 p-4 rounded-xl text-xs sm:text-sm"><strong className="block text-brand-start mb-1">Ad Storyline Generator</strong> A great starting point for video ads. Upload a product image, add a short description, and AI generates a complete one-scene storyboard concept.</li>
                    </ul>
                </Section>
                
                <Section title="Chapter 4: AI Image Suite" icon={ImageIcon}>
                    <p>Powerful tools to create and edit images.</p>
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="p-6 border border-green-200 dark:border-green-800 rounded-2xl bg-green-50/50 dark:bg-green-900/10">
                            <h5 className="font-bold text-green-700 dark:text-green-400 flex items-center gap-2 mb-3 text-sm sm:text-base">
                                <CheckCircleIcon className="w-5 h-5" />
                                What it can do
                            </h5>
                            <ul className="space-y-2 text-xs sm:text-sm text-neutral-700 dark:text-neutral-300">
                                <li>• Generate new images from text (text-to-image).</li>
                                <li>• Edit existing images with text instructions (image-to-image).</li>
                                <li>• Place your product into professional studio backgrounds.</li>
                                <li>• Create realistic model shots featuring your product.</li>
                                <li>• Upscale resolution and enhance colours.</li>
                                <li>• Remove backgrounds from photos.</li>
                            </ul>
                        </div>
                        <div className="p-6 border border-red-200 dark:border-red-800 rounded-2xl bg-red-50/50 dark:bg-red-900/10">
                            <h5 className="font-bold text-red-600 dark:text-red-400 flex items-center gap-2 mb-3 text-sm sm:text-base">
                                <XIcon className="w-5 h-5" />
                                What it cannot do
                            </h5>
                            <ul className="space-y-2 text-xs sm:text-sm text-neutral-700 dark:text-neutral-300">
                                <li>• Render specific readable text in images reliably.</li>
                                <li>• Perfectly replicate complex logos or brand marks.</li>
                                <li>• Create photorealistic faces of famous people (safety policy).</li>
                                <li>• Guarantee perfect hands or anatomy in every generation.</li>
                            </ul>
                        </div>
                    </div>
                     <SubSection title="Understanding safety filters">
                        <p>All image and text generation is subject to Google&apos;s safety filters. Your request may be blocked if it relates to:</p>
                         <ul className="list-disc pl-5 space-y-1 font-medium text-neutral-800 dark:text-neutral-200 mt-2 text-xs sm:text-sm">
                            <li>Hate, harassment, or violence.</li>
                            <li>Self-harm.</li>
                            <li>Explicit sexual content.</li>
                        </ul>
                        <p className="mt-3 text-neutral-500">If your request is blocked, simplify your prompt or try a different image. We cannot disable these safety filters.</p>
                    </SubSection>
                </Section>

                <Section title="Chapter 5: AI Video &amp; Voice Suite" icon={VideoIcon}>
                    <p className="text-base sm:text-lg mb-4">Create stunning videos and professional voice-overs with ease.</p>
                    <div className="grid grid-cols-1 gap-6">
                        <SubSection title="Video generation">
                            <p>Create video from a text prompt. You can also provide a starting image. The AI will animate it according to your prompt. For best results, use descriptive prompts that spell out the scene and action.</p>
                            <p className="mt-2 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-neutral-400">Best for: Short social clips</p>
                        </SubSection>
                        <SubSection title="Video storyboard">
                            <p>A powerful two-step workflow for product review videos. In Step 1 you provide product details and creative direction to generate a four-scene storyboard script. In Step 2, AI generates a unique image for each scene from that script.</p>
                            <p className="mt-2 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-neutral-400">Best for: Full product ads</p>
                        </SubSection>
                        <SubSection title="Video merger">
                            <p>Stitch multiple clips from your Gallery into one video. Pick clips in the order you want them to play.</p>
                            <p>Processing runs in your browser—it stays private and is fast for short clips. (Admin / Lifetime users only.)</p>
                        </SubSection>
                        <SubSection title="Voice studio">
                            <p>Turn any text into a professional voice-over. Write your script, choose from many voice actors (including Malay), and adjust speed, pitch, and volume.</p>
                            <p>Output is a WAV file you can use in any video editor.</p>
                        </SubSection>
                    </div>
                </Section>
                
                <Section title="Chapter 6: Understanding AI models" icon={RobotIcon}>
                    <p>The platform uses several Google AI models, each tuned for different tasks.</p>
                    <div className="space-y-4 mt-6">
                        <div className="border-l-4 border-brand-start pl-4">
                            <h5 className="font-bold text-neutral-800 dark:text-neutral-100 text-sm sm:text-base">Gemini 2.5 Flash (text &amp; multimodal)</h5>
                            <p className="text-xs sm:text-sm mt-1">Main workhorse for text generation and image understanding. Optimised for speed without a large &quot;thinking&quot; budget.</p>
                        </div>
                        <div className="border-l-4 border-purple-500 pl-4">
                            <h5 className="font-bold text-neutral-800 dark:text-neutral-100 text-sm sm:text-base">Veo models (video)</h5>
                            <p className="text-xs sm:text-sm mt-1">Google&apos;s primary video models. We use standard (highest quality) and fast (quicker turnaround) variants.</p>
                        </div>
                        <div className="border-l-4 border-pink-500 pl-4">
                            <h5 className="font-bold text-neutral-800 dark:text-neutral-100 text-sm sm:text-base">NanoBanana GEM_PIX (images)</h5>
                            <p className="text-xs sm:text-sm mt-1">NanoBanana GEM_PIX powers editing, composition, and high-quality text-to-image generation.</p>
                        </div>
                    </div>
                    <SubSection title="Can I use my own voice in generated video?">
                        <p>Not directly during video generation. The built-in AI voice-over in the Video Storyboard tool currently supports a limited set of languages.</p>
                        <p>For a custom voice, we recommend using Voice Studio to create an audio file, then combining it with your generated video in a separate editor.</p>
                    </SubSection>
                </Section>

                <Section title="Chapter 7: Prompts &amp; library" icon={LibraryIcon}>
                    <p>The Prompt Library is your hub for inspiration and proven prompt patterns.</p>
                    <SubSection title="How to use the library">
                        <p>It currently features one main library:</p>
                        <ul className="list-disc pl-5 space-y-2 text-xs sm:text-sm mt-2 mb-4">
                            <li dangerouslySetInnerHTML={{ __html: "<strong>Nano Banana prompts:</strong> A versatile collection for image generation and editing, sourced from an open community project. Great for exploring creative possibilities."}}></li>
                        </ul>
                        <p>Browse examples inside the library. When you find one you like, click &apos;Use this prompt&apos;. It copies the prompt and opens AI Image Generation with the field filled in so you can generate immediately or tweak further.</p>
                    </SubSection>
                </Section>
                        
                <Section title="Chapter 8: Gallery, history &amp; logs" icon={GalleryIcon}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="col-span-2">
                            <SubSection title="Gallery &amp; history">
                                <p>Everything you generate—images, video, audio, and text—is saved automatically to browser storage on your device (IndexedDB). Open the Gallery &amp; History section to view, download, or reuse assets.</p>
                            </SubSection>
                        </div>
                        <div className="col-span-1">
                            <SubSection title="Local storage">
                                <p className="text-[10px] sm:text-xs">Data stays in your browser. Clearing site cache can remove your gallery. We do not store your content on our servers.</p>
                            </SubSection>
                        </div>
                    </div>
                    <SubSection title="AI API logs (for debugging)">
                        <p>API logs are technical records of each request. They help when generation fails, because they show the real error message from Google (for example safety blocks).</p>
                    </SubSection>
                </Section>

                <Section title="Chapter 9: Common errors &amp; troubleshooting" icon={AlertTriangleIcon}>
                    <p>If you hit an error, it usually comes from a small set of common causes. Below is a quick guide to what they mean and what to try.</p>
                    <div className="mt-8 overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm">
                        <table className="w-full text-xs sm:text-sm text-left border-collapse">
                            <thead className="text-[10px] sm:text-xs text-neutral-500 uppercase bg-neutral-50 dark:bg-neutral-800 dark:text-neutral-400">
                                <tr>
                                    <th scope="col" className="px-4 py-3 sm:px-6 sm:py-4 font-bold tracking-wider">Issue / error</th>
                                    <th scope="col" className="px-4 py-3 sm:px-6 sm:py-4 font-bold tracking-wider">Likely cause</th>
                                    <th scope="col" className="px-4 py-3 sm:px-6 sm:py-4 font-bold tracking-wider">What to do</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 bg-white dark:bg-neutral-900">
                                <tr className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"><td className="px-4 py-3 sm:px-6 sm:py-4 align-top font-semibold text-red-600">Email not registered</td><td className="px-4 py-3 sm:px-6 sm:py-4 align-top">The address is not in the database.</td><td className="px-4 py-3 sm:px-6 sm:py-4 align-top" dangerouslySetInnerHTML={{ __html: `1. Check spelling.<br/>2. Make sure the user registered on the main site (${BRAND_CONFIG.domain}).<br/>3. If it still fails, contact an admin to verify the account.` }}></td></tr>
                                <tr className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"><td className="px-4 py-3 sm:px-6 sm:py-4 align-top font-semibold text-red-600">Account inactive</td><td className="px-4 py-3 sm:px-6 sm:py-4 align-top">An admin set the user to inactive.</td><td className="px-4 py-3 sm:px-6 sm:py-4 align-top">Contact an admin to reactivate the account.</td></tr>
                                <tr className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"><td className="px-4 py-3 sm:px-6 sm:py-4 align-top font-semibold text-yellow-600">401 Unauthorized / 403 Permission Denied</td><td className="px-4 py-3 sm:px-6 sm:py-4 align-top" dangerouslySetInnerHTML={{ __html: "The token may be invalid, expired, or blocked by Google." }}></td><td className="px-4 py-3 sm:px-6 sm:py-4 align-top" dangerouslySetInnerHTML={{ __html: "This is a platform-side issue. Report it to an admin right away using &apos;Report to Admin&apos; on the error dialog or via WhatsApp." }}></td></tr>
                                <tr className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"><td className="px-4 py-3 sm:px-6 sm:py-4 align-top font-semibold text-yellow-600">429 Resource Exhausted</td><td className="px-4 py-3 sm:px-6 sm:py-4 align-top">The shared API hit a rate limit.</td><td className="px-4 py-3 sm:px-6 sm:py-4 align-top" dangerouslySetInnerHTML={{ __html: "Usually temporary. Wait a few minutes and try again. Admins are notified if limits need raising." }}></td></tr>
                                <tr className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"><td className="px-4 py-3 sm:px-6 sm:py-4 align-top font-semibold text-yellow-600">500 Internal Server Error / 503 Service Unavailable</td><td className="px-4 py-3 sm:px-6 sm:py-4 align-top">Google server error or maintenance—temporary and not caused by your account or prompt.</td><td className="px-4 py-3 sm:px-6 sm:py-4 align-top" dangerouslySetInnerHTML={{ __html: "1. Wait a few minutes and retry.<br/>2. If it persists, check token status or contact an admin." }}></td></tr>
                                <tr className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"><td className="px-4 py-3 sm:px-6 sm:py-4 align-top font-semibold">Network error</td><td className="px-4 py-3 sm:px-6 sm:py-4 align-top">Connection dropped, or something (firewall, ad blocker) is blocking the app from Google.</td><td className="px-4 py-3 sm:px-6 sm:py-4 align-top" dangerouslySetInnerHTML={{ __html: "1. Check your connection.<br/>2. Refresh the page.<br/>3. Temporarily disable ad blockers or VPN and try again." }}></td></tr>
                                <tr className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"><td className="px-4 py-3 sm:px-6 sm:py-4 align-top font-semibold">Video (Veo) fails while other services work</td><td className="px-4 py-3 sm:px-6 sm:py-4 align-top">Veo needs a special auth token (__SESSION), different from a normal Gemini API key. It may have expired.</td><td className="px-4 py-3 sm:px-6 sm:py-4 align-top" dangerouslySetInnerHTML={{ __html: "Platform issue—ask an admin to refresh the session token." }}></td></tr>
                                <tr className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"><td className="px-4 py-3 sm:px-6 sm:py-4 align-top font-semibold text-blue-600">400 Bad Request / &apos;Safety filter&apos; message</td><td className="px-4 py-3 sm:px-6 sm:py-4 align-top">Your text prompt or uploaded image triggered Google&apos;s safety filters.</td><td className="px-4 py-3 sm:px-6 sm:py-4 align-top" dangerouslySetInnerHTML={{ __html: "1. Simplify the prompt. Avoid ambiguous or overly graphic wording.<br/>2. Try a more neutral reference image.<br/>3. See Getting Started &gt; Chapter 4 for blocked content types." }}></td></tr>
                                <tr className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"><td className="px-4 py-3 sm:px-6 sm:py-4 align-top font-semibold">Video takes very long or fails with no clear error</td><td className="px-4 py-3 sm:px-6 sm:py-4 align-top">Veo can take several minutes. Silent failures are often safety policy on the prompt or image.</td><td className="px-4 py-3 sm:px-6 sm:py-4 align-top" dangerouslySetInnerHTML={{ __html: "1. Wait up to 5–10 minutes.<br/>2. If it still fails, simplify the prompt or change the reference image.<br/>3. Check AI API logs (in Gallery) for technical errors." }}></td></tr>
                                <tr className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"><td className="px-4 py-3 sm:px-6 sm:py-4 align-top font-semibold">Output does not match expectations</td><td className="px-4 py-3 sm:px-6 sm:py-4 align-top">The prompt may be vague or open to interpretation.</td><td className="px-4 py-3 sm:px-6 sm:py-4 align-top">Make the prompt more specific. Example: instead of &apos;add a hat&apos;, try &apos;put a red hat on the person in this image&apos;.</td></tr>
                                <tr className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"><td className="px-4 py-3 sm:px-6 sm:py-4 align-top font-semibold">Gallery missing latest items</td><td className="px-4 py-3 sm:px-6 sm:py-4 align-top">Local IndexedDB may be stuck or corrupted.</td><td className="px-4 py-3 sm:px-6 sm:py-4 align-top" dangerouslySetInnerHTML={{ __html: "1. Hard refresh the browser (Ctrl + Shift + R).<br/>2. If needed, go to Settings &gt; Profile &gt; Video cache manager and clear all cache." }}></td></tr>
                                <tr className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"><td className="px-4 py-3 sm:px-6 sm:py-4 align-top font-semibold">Video merger fails</td><td className="px-4 py-3 sm:px-6 sm:py-4 align-top" dangerouslySetInnerHTML={{ __html: "1. FFmpeg failed to load from the CDN.<br/>2. Selected clips are too large." }}></td><td className="px-4 py-3 sm:px-6 sm:py-4 align-top" dangerouslySetInnerHTML={{ __html: "1. Use a stable connection.<br/>2. Temporarily disable ad blockers.<br/>3. Try shorter clips (under ~1 minute each)." }}></td></tr>
                            </tbody>
                        </table>
                    </div>
                </Section>
            </div>
        </div>
    );
};

// FIX: Changed to a named export to resolve the "no default export" error.
export { GetStartedView };
