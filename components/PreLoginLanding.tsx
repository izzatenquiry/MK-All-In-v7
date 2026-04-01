import React, { useEffect, useState } from 'react';
import {
  LogoIcon,
  SparklesIcon,
  FileTextIcon,
  ImageIcon,
  VideoIcon,
  LibraryIcon,
  CheckCircleIcon,
} from './Icons';
import { TOKEN_ULTRA_PACKAGES } from '../services/creditPackages';
import { isElectron } from '../services/environment';

interface PreLoginLandingProps {
  onOpenLogin: () => void;
  onOpenRegister: () => void;
}

/**
 * Marketing-style hero + highlights for the pre-login screen (VEOLY-AI).
 * Mobile-first: single column, readable type, touch-friendly CTAs.
 */
const PreLoginLanding: React.FC<PreLoginLandingProps> = ({ onOpenLogin, onOpenRegister }) => {
  const isElectronMode = isElectron();
  const [heroTilt, setHeroTilt] = useState({ x: 0, y: 0 });
  const [activeTestimonialSlide, setActiveTestimonialSlide] = useState(0);
  const [testimonialsPerSlide, setTestimonialsPerSlide] = useState<number>(() =>
    typeof window !== 'undefined' && window.innerWidth < 640 ? 1 : 3
  );

  const handleHeroMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    setHeroTilt({
      x: (0.5 - py) * 8,
      y: (px - 0.5) * 10,
    });
  };

  const resetHeroTilt = () => setHeroTilt({ x: 0, y: 0 });

  const suites = [
    {
      icon: FileTextIcon,
      title: 'AI Content Ideas',
      desc: 'Trending ideas, marketing copy, and storylines in minutes.',
    },
    {
      icon: ImageIcon,
      title: 'AI Image Suite',
      desc: 'Create product visuals and UGC-style images quickly.',
    },
    {
      icon: VideoIcon,
      title: 'AI Video & Voice',
      desc: 'Generate video and natural voice from text or visuals.',
    },
    {
      icon: LibraryIcon,
      title: 'Smart Platform',
      desc: 'Gallery, prompt library, and cleaner daily workflows.',
    },
  ] as const;

  const highlights = [
    'All-in-one workflow from idea to publish-ready content',
    'Powered by NANOBANANA and VEO latest-generation models',
    'Built for Malaysian users with local support',
  ] as const;

  const oldWay = [
    'Hire copywriter: RM1,000-2,000/month',
    'Graphic designer: RM1,500-3,000/month',
    'Photographer: RM1,000-2,500/month',
    'Social media tools: RM200-800/month',
    'Multiple subscriptions (ChatGPT, Gemini, Canva)',
  ] as const;

  const newWay = [
    'AI copywriter',
    'AI graphic designer',
    'AI video creator',
    'AI photo editor',
    'AI voice generator',
    'All in one platform',
  ] as const;

  const suiteDetails = [
    {
      title: 'AI Content Ideas Suite',
      points: ['Content ideas', 'Marketing copy', 'Storyboard generator'],
    },
    {
      title: 'AI Image Suite',
      points: ['Image generation', 'Product photos', 'Model photos', 'Enhancer tools'],
    },
    {
      title: 'AI Video & Voice Suite',
      points: ['Video generation', 'Video storyboard', 'Video combiner', 'Voice studio'],
    },
    {
      title: 'Smart Platform Features',
      points: ['Gallery & history', 'Prompt library', 'Personal webhook', 'AI support chat'],
    },
  ] as const;

  const testimonialImages = Array.from({ length: 19 }, (_, index) => {
    const imageNumber = 3482 + index;
    return `https://monoklix.com/wp-content/uploads/2025/12/IMG_${imageNumber}-2.jpg`;
  }).filter((_, index) => index !== 1);
  const testimonialSlides = Array.from(
    { length: Math.ceil(testimonialImages.length / testimonialsPerSlide) },
    (_, slideIndex) =>
      testimonialImages.slice(
        slideIndex * testimonialsPerSlide,
        slideIndex * testimonialsPerSlide + testimonialsPerSlide
      )
  );

  useEffect(() => {
    const handleResize = () => {
      setTestimonialsPerSlide(window.innerWidth < 640 ? 1 : 3);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (activeTestimonialSlide >= testimonialSlides.length) {
      setActiveTestimonialSlide(0);
    }
  }, [activeTestimonialSlide, testimonialSlides.length]);

  useEffect(() => {
    if (testimonialSlides.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveTestimonialSlide((prev) => (prev + 1) % testimonialSlides.length);
    }, 3200);
    return () => window.clearInterval(timer);
  }, [testimonialSlides.length]);

  const goToPrevTestimonial = () => {
    setActiveTestimonialSlide((prev) => (prev === 0 ? testimonialSlides.length - 1 : prev - 1));
  };

  const goToNextTestimonial = () => {
    setActiveTestimonialSlide((prev) => (prev + 1) % testimonialSlides.length);
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10 pb-8 relative">
      <div className="pointer-events-none absolute -top-10 -left-16 w-48 h-48 rounded-full bg-brand-start/20 blur-3xl animate-pulse" />
      <div className="pointer-events-none absolute top-20 -right-20 w-56 h-56 rounded-full bg-brand-end/20 blur-3xl animate-pulse" />

      {/* Hero */}
      <header className="text-center relative z-10">
        <div
          className="relative rounded-[28px] border border-neutral-200/80 dark:border-white/10 bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl px-4 sm:px-8 py-8 sm:py-10 overflow-hidden shadow-[0_12px_50px_rgba(15,23,42,0.08)] dark:shadow-[0_20px_80px_rgba(2,6,23,0.7)]"
          onMouseMove={handleHeroMouseMove}
          onMouseLeave={resetHeroTilt}
          style={{
            transform: `perspective(1100px) rotateX(${heroTilt.x}deg) rotateY(${heroTilt.y}deg)`,
            transition: 'transform 180ms ease-out',
          }}
        >
          <div className="pointer-events-none absolute inset-0 opacity-60">
            <div className="absolute -top-20 -right-16 w-56 h-56 bg-brand-end/25 blur-3xl rounded-full animate-pulse" />
            <div className="absolute -bottom-20 -left-16 w-56 h-56 bg-brand-start/25 blur-3xl rounded-full animate-pulse" />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.10)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.10)_1px,transparent_1px)] bg-[size:22px_22px] dark:opacity-30 opacity-20" />
          </div>

          <div className="flex justify-center mb-6 sm:mb-8 relative w-full px-1">
            <div className="relative w-full max-w-md sm:max-w-lg md:max-w-xl">
              <div
                className="absolute inset-0 rounded-3xl bg-gradient-to-br from-brand-start/35 to-brand-end/30 blur-2xl scale-110"
                aria-hidden
              />
              <div className="absolute inset-[-14%] rounded-[28px] border border-white/50 dark:border-white/10 animate-[spin_20s_linear_infinite]" />
              <LogoIcon className="relative block w-full h-auto text-neutral-900 dark:text-white drop-shadow-lg" />
            </div>
          </div>

          <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.2em] text-brand-start dark:text-primary-400 mb-3">
            All-in-One AI Content Platform
          </p>

          <h1 className="text-2xl sm:text-4xl md:text-[2.75rem] font-extrabold text-neutral-900 dark:text-white tracking-tight leading-[1.15] max-w-3xl mx-auto">
            Create high-converting videos and content{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-start to-brand-end">
              without the headache
            </span>
            .
          </h1>

          <p className="mt-4 sm:mt-5 text-sm sm:text-base text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto leading-relaxed">
            VEOLY-AI helps content creators and digital marketers{' '}
            <span className="text-neutral-800 dark:text-neutral-200 font-medium">produce daily content faster</span> with
            beginner-friendly AI tools in one platform.
          </p>

          <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={onOpenLogin}
              className="inline-flex items-center justify-center gap-2 min-h-[48px] px-6 sm:px-8 rounded-2xl font-bold text-white bg-gradient-to-r from-brand-start to-brand-end shadow-[0_12px_40px_rgba(74,108,247,0.35)] hover:shadow-[0_16px_48px_rgba(74,108,247,0.45)] hover:scale-[1.02] active:scale-[0.98] transition-all border border-white/10"
            >
              Log in
              <SparklesIcon className="w-4 h-4 opacity-90" />
            </button>
            <button
              type="button"
              onClick={onOpenRegister}
              className="inline-flex items-center justify-center min-h-[48px] px-6 sm:px-8 rounded-2xl font-semibold text-neutral-800 dark:text-neutral-100 bg-white/90 dark:bg-white/5 border border-neutral-200/90 dark:border-white/10 hover:bg-neutral-50 dark:hover:bg-white/10 transition-colors"
            >
              Register now
            </button>
          </div>
        </div>
      </header>

      {!isElectronMode && (
        <>
      {/* Highlights */}
      <section className="mt-14 sm:mt-20" aria-labelledby="prelogin-why-heading">
        <h2 id="prelogin-why-heading" className="sr-only">
          VEOLY-AI advantages
        </h2>
        <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {highlights.map(text => (
            <li
              key={text}
              className="flex gap-3 p-4 rounded-2xl bg-white/70 dark:bg-white/[0.04] border border-neutral-200/80 dark:border-white/10 backdrop-blur-sm text-left text-sm text-neutral-700 dark:text-neutral-300 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_10px_30px_rgba(74,108,247,0.18)]"
            >
              <CheckCircleIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* About VEOLY-AI */}
      <section className="mt-10 sm:mt-14" aria-labelledby="about-veoly-heading">
        <div className="rounded-2xl border border-neutral-200/80 dark:border-white/10 bg-white/75 dark:bg-white/[0.03] backdrop-blur-sm p-5 sm:p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(74,108,247,0.12)] hover:border-brand-start/30">
          <h2
            id="about-veoly-heading"
            className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white text-center"
          >
            What is VEOLY-AI?
          </h2>
          <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
            <div className="rounded-xl border border-neutral-200/80 dark:border-white/10 bg-neutral-50/90 dark:bg-neutral-900/50 p-4 sm:p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_14px_34px_rgba(59,130,246,0.14)]">
              <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
                VEOLY-AI is an all-in-one AI tool designed for beginners who want to produce daily content fast,
                even without advanced technical skills.
              </p>
              <p className="mt-3 text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
                Turn basic product photos into multiple UGC-style assets, improve engagement, and move from idea to
                publish-ready content in minutes.
              </p>
            </div>
            <div className="rounded-xl border border-neutral-200/80 dark:border-white/10 bg-gradient-to-br from-white to-slate-50 dark:from-slate-900/60 dark:to-slate-800/40 p-4 sm:p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_14px_34px_rgba(99,102,241,0.16)]">
              <h3 className="text-lg font-extrabold text-neutral-900 dark:text-white leading-tight">
                One Tool, Multiple Solutions
              </h3>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                Everything you need in one place. No need to juggle too many subscriptions and disconnected apps.
              </p>
              <ul className="mt-4 list-disc pl-5 space-y-1.5 text-sm text-neutral-700 dark:text-neutral-300">
                <li>Faster workflow</li>
                <li>Lower operating cost</li>
                <li>Built for daily creator needs</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Hero tutorial video */}
      <section className="mt-8 sm:mt-10" aria-labelledby="hero-video-heading">
        <div className="rounded-2xl border border-neutral-200/80 dark:border-white/10 bg-white/75 dark:bg-white/[0.03] backdrop-blur-xl p-3 sm:p-4 shadow-[0_12px_40px_rgba(15,23,42,0.08)] dark:shadow-[0_20px_50px_rgba(2,6,23,0.55)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_48px_rgba(74,108,247,0.2)]">
          <div className="relative w-full overflow-hidden rounded-xl border border-neutral-200/90 dark:border-white/10 bg-black aspect-video">
            <iframe
              className="absolute inset-0 w-full h-full"
              src="https://www.youtube.com/embed/BGuxsk79sYY?rel=0"
              title="VEOLY-AI tutorial video"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
        </div>
      </section>

      {/* Old vs New */}
      <section className="mt-10 sm:mt-14" aria-labelledby="old-vs-new-heading">
        <h2
          id="old-vs-new-heading"
          className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white text-center"
        >
          Old Way vs New Way
        </h2>
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          <div className="rounded-2xl border border-sky-300/50 dark:border-sky-500/30 bg-gradient-to-br from-sky-500/90 to-blue-700/90 p-5 text-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_46px_rgba(37,99,235,0.35)]">
            <h3 className="mt-2 text-xl font-extrabold">Old Way</h3>
            <ul className="mt-4 space-y-2 text-sm text-sky-50">
              {oldWay.map(item => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden>•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 rounded-lg bg-amber-400/95 text-amber-950 font-bold text-center py-2.5">
              Total: RM5,000+ per month
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-200/80 dark:border-emerald-700/40 bg-white/90 dark:bg-white/[0.04] p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_46px_rgba(16,185,129,0.22)]">
            <h3 className="mt-2 text-xl font-extrabold text-red-600 dark:text-red-400">With VEOLY-AI</h3>
            <ul className="mt-4 space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
              {newWay.map(item => (
                <li key={item} className="flex gap-2">
                  <CheckCircleIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* What you get */}
      <section className="mt-10 sm:mt-14" aria-labelledby="what-you-get-heading">
        <h2
          id="what-you-get-heading"
          className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white text-center"
        >
          What You Get
        </h2>
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          {suiteDetails.map(block => (
            <div
              key={block.title}
              className="rounded-xl border border-neutral-200/80 dark:border-white/10 bg-white/80 dark:bg-white/[0.03] p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_30px_rgba(74,108,247,0.15)]"
            >
              <h3 className="text-sm font-bold text-brand-start dark:text-primary-400">{block.title}</h3>
              <ul className="mt-3 space-y-1.5 text-sm text-neutral-700 dark:text-neutral-300">
                {block.points.map(point => (
                  <li key={point} className="flex gap-2">
                    <CheckCircleIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Token Ultra credit packages */}
      <section className="mt-10 sm:mt-12" aria-labelledby="prelogin-credit-heading">
        <div className="rounded-2xl p-4 sm:p-6 bg-gradient-to-r from-sky-50/90 via-indigo-50/70 to-violet-50/80 dark:from-slate-900/70 dark:via-indigo-950/35 dark:to-violet-950/35 border border-sky-200/70 dark:border-indigo-700/35 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_45px_rgba(99,102,241,0.2)] hover:border-indigo-300/70 dark:hover:border-indigo-500/40">
          <h2
            id="prelogin-credit-heading"
            className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white"
          >
            Token Ultra Credit Packages
          </h2>
          <p className="mt-1.5 text-sm text-neutral-700 dark:text-neutral-300">
            Same packages as in Token Ultra settings — Creator &amp; Business.
          </p>

          <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
            {TOKEN_ULTRA_PACKAGES.map((pkg) => {
              const isPopular = pkg.popular === true;
              return (
                <div
                  key={pkg.id}
                  className={`relative flex flex-col rounded-2xl border p-5 sm:p-6 text-left transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${
                    isPopular
                      ? 'border-indigo-300/90 dark:border-indigo-500/45 bg-white dark:bg-neutral-950/40 shadow-[0_12px_40px_rgba(99,102,241,0.15)]'
                      : 'border-neutral-200/90 dark:border-neutral-700/80 bg-neutral-900 text-neutral-100 dark:bg-neutral-950/90'
                  }`}
                >
                  {isPopular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-md">
                      Most popular
                    </span>
                  )}
                  <div className={isPopular ? 'pt-2' : 'pt-0'}>
                    <h3
                      className={`text-lg font-bold ${isPopular ? 'text-neutral-900 dark:text-white' : 'text-white'}`}
                    >
                      {pkg.label}
                    </h3>
                    <p
                      className={`mt-2 text-sm leading-relaxed ${isPopular ? 'text-neutral-600 dark:text-neutral-400' : 'text-neutral-300'}`}
                    >
                      {pkg.description}
                    </p>
                    <div className="mt-4 flex flex-wrap items-baseline gap-1">
                      <span
                        className={`text-3xl sm:text-4xl font-extrabold tabular-nums ${isPopular ? 'text-brand-start dark:text-primary-400' : 'text-white'}`}
                      >
                        RM{pkg.price.toFixed(2)}
                      </span>
                      <span
                        className={`text-sm font-medium ${isPopular ? 'text-neutral-600 dark:text-neutral-400' : 'text-neutral-400'}`}
                      >
                        {pkg.billingPeriod}
                      </span>
                    </div>
                    <p
                      className={`mt-1 text-sm font-semibold ${isPopular ? 'text-emerald-700 dark:text-emerald-400' : 'text-emerald-300'}`}
                    >
                      {pkg.credits.toLocaleString('en-US')} credits / month
                    </p>
                  </div>
                  <ul className={`mt-5 space-y-2.5 text-sm flex-1 ${isPopular ? 'text-neutral-700 dark:text-neutral-300' : 'text-neutral-200'}`}>
                    {pkg.features.map((f) => (
                      <li key={f.text} className="flex gap-2">
                        <CheckCircleIcon
                          className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isPopular ? 'text-emerald-600 dark:text-emerald-400' : 'text-emerald-400'}`}
                        />
                        <span className="leading-snug">
                          {f.text}
                          {f.isNew ? (
                            <span className="ml-1.5 inline-block rounded bg-red-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                              New
                            </span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          <ul className="mt-5 list-disc pl-5 text-sm text-neutral-700 dark:text-neutral-300 space-y-1.5">
            <li>Package validity: 26 days from the date of purchase.</li>
          </ul>
        </div>
      </section>

      {/* Suites */}
      <section className="mt-12 sm:mt-16" aria-labelledby="prelogin-suites-heading">
        <div className="text-center mb-8 sm:mb-10">
          <h2
            id="prelogin-suites-heading"
            className="text-lg sm:text-2xl font-bold text-neutral-900 dark:text-white"
          >
            Four suites, one platform
          </h2>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 max-w-xl mx-auto">
            From idea to publish-ready video without juggling multiple tools.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          {suites.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="group p-5 rounded-2xl bg-gradient-to-br from-white/90 to-neutral-50/90 dark:from-white/[0.06] dark:to-white/[0.02] border border-neutral-200/90 dark:border-white/10 shadow-sm hover:shadow-[0_18px_45px_rgba(74,108,247,0.18)] hover:border-brand-start/30 dark:hover:border-primary-500/30 transition-all duration-300 hover:-translate-y-1"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-brand-start/15 to-brand-end/10 text-brand-start dark:text-primary-400 ring-1 ring-black/5 dark:ring-white/10">
                  <Icon className="w-6 h-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-neutral-900 dark:text-white text-base">{title}</h3>
                  <p className="mt-1.5 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">{desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonial carousel */}
      <section className="mt-10 sm:mt-14" aria-labelledby="testimonials-heading">
        <div className="text-center mb-5 sm:mb-6">
          <h2
            id="testimonials-heading"
            className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white"
          >
            User Testimonials
          </h2>
        </div>
        <div className="relative rounded-2xl border border-neutral-200/80 dark:border-white/10 bg-white/80 dark:bg-white/[0.04] p-4 sm:p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_26px_58px_rgba(74,108,247,0.2)]">
          <div className="pointer-events-none absolute -top-10 -right-8 w-32 h-32 bg-brand-end/25 blur-2xl rounded-full" />
          <div className="pointer-events-none absolute -bottom-10 -left-8 w-32 h-32 bg-brand-start/25 blur-2xl rounded-full" />
          <div className="pointer-events-none absolute inset-[1px] rounded-2xl border border-white/55 dark:border-white/10" />
          <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_18%_20%,rgba(255,255,255,0.55),transparent_42%)] dark:bg-[radial-gradient(circle_at_18%_20%,rgba(255,255,255,0.08),transparent_45%)]" />

          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Real Results
            </span>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {activeTestimonialSlide + 1} / {testimonialSlides.length}
            </span>
          </div>

          <div className="relative overflow-hidden rounded-xl border border-neutral-200/90 dark:border-white/10 bg-gradient-to-br from-white/95 to-neutral-100/90 dark:from-neutral-900/75 dark:to-neutral-800/45 shadow-inner">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.14)_1px,transparent_1px)] bg-[size:18px_18px] opacity-[0.18] dark:opacity-[0.12]" />
            <div
              className="flex transition-transform duration-500 ease-out relative z-10"
              style={{ transform: `translateX(-${activeTestimonialSlide * 100}%)` }}
            >
              {testimonialSlides.map((slideImages, slideIdx) => (
                <div key={`slide-${slideIdx}`} className="w-full flex-shrink-0">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-2 sm:p-3">
                    {slideImages.map((imageUrl, idx) => (
                      <div
                        key={imageUrl}
                        className="rounded-lg overflow-hidden border border-neutral-200/90 dark:border-white/10 bg-neutral-100 dark:bg-neutral-800"
                      >
                        <img
                          src={imageUrl}
                          alt={`VEOLY-AI testimonial ${slideIdx * testimonialsPerSlide + idx + 1}`}
                          loading="lazy"
                          className="w-full h-full object-contain aspect-[3/5]"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={goToPrevTestimonial}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-30 pointer-events-auto h-9 w-9 rounded-full bg-black/55 text-white hover:bg-black/70 transition-colors flex items-center justify-center"
              aria-label="Previous testimonial"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={goToNextTestimonial}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-30 pointer-events-auto h-9 w-9 rounded-full bg-black/55 text-white hover:bg-black/70 transition-colors flex items-center justify-center"
              aria-label="Next testimonial"
            >
              ›
            </button>
          </div>

          <div className="mt-3 flex items-center justify-center gap-1.5 flex-wrap">
            {testimonialSlides.map((_, idx) => (
              <button
                key={`dot-${idx}`}
                type="button"
                onClick={() => setActiveTestimonialSlide(idx)}
                className={`h-2.5 rounded-full transition-all ${
                  idx === activeTestimonialSlide
                    ? 'w-6 bg-brand-start'
                    : 'w-2.5 bg-neutral-300 dark:bg-neutral-600 hover:bg-neutral-400 dark:hover:bg-neutral-500'
                }`}
                aria-label={`Go to testimonial ${idx + 1}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA (footer area) */}
      <section className="mt-12 sm:mt-16" aria-labelledby="final-cta-heading">
        <div className="rounded-2xl border border-neutral-200/80 dark:border-white/10 bg-white/80 dark:bg-white/[0.04] p-5 sm:p-7 text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_48px_rgba(74,108,247,0.16)] hover:border-brand-start/30">
          <h2 id="final-cta-heading" className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white">
            Ready to transform your content?
          </h2>
          <p className="mt-3 text-sm sm:text-base text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto">
            Stop wasting time and high production costs. Join creators and marketers who already run faster with
            VEOLY-AI.
          </p>
          <div className="mt-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
            <button
              type="button"
              onClick={onOpenLogin}
              className="inline-flex items-center justify-center min-h-[48px] px-6 rounded-xl bg-gradient-to-r from-brand-start to-brand-end text-white font-bold hover:opacity-95 transition-opacity"
            >
              Log in now
            </button>
            <button
              type="button"
              onClick={onOpenRegister}
              className="inline-flex items-center justify-center min-h-[48px] px-6 rounded-xl border border-neutral-300 dark:border-white/10 text-neutral-800 dark:text-neutral-100 font-semibold hover:bg-neutral-50 dark:hover:bg-white/10 transition-colors"
            >
              Register now
            </button>
          </div>
        </div>
      </section>

      {/* Footer strip */}
      <footer className="mt-14 sm:mt-16 pt-8 border-t border-neutral-200/80 dark:border-white/10 text-center transition-colors duration-300">
        <p className="text-xs text-neutral-500 dark:text-neutral-500">Copyright © 2026 VEOLY-AI.com</p>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">Built with ❤️ for Malaysian creators</p>
      </footer>
        </>
      )}
    </div>
  );
};

export default PreLoginLanding;
