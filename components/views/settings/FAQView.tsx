import React, { useState } from 'react';
import { AlertTriangleIcon, InformationCircleIcon, KeyIcon, DatabaseIcon, VideoIcon, ServerIcon, ShieldCheckIcon, ImageIcon, ChevronLeftIcon, ChevronRightIcon, TelegramIcon } from '../../Icons';
import { BRAND_CONFIG } from '../../../services/brandConfig';

interface FAQCategory {
  id: string;
  title: string;
  icon: React.ReactNode;
  items: FAQItem[];
}

interface FAQItem {
  id: string;
  title: string;
  description: string;
  imageUrls?: string[];  // Array untuk support multiple images dengan carousel
  solutions: string[];
}

const FAQView: React.FC = () => {
  const faqCategories: FAQCategory[] = [
    {
      id: 'token-issues',
      title: 'Token Issues',
      icon: <KeyIcon className="w-5 h-5" />,
      items: [
        {
          id: 'token-invalid-exhausted-expired',
          title: 'Token Invalid/Exhausted/Expired',
          description: 'Token is invalid, exhausted, expired, or authentication credentials are invalid. Resource has been exhausted (e.g. check quota) - Veo or Imagen Service.',
          imageUrls: [],  // Will be populated with images later (carousel)
          solutions: [
            'Tekan icon REFRESH di header apps. (Logout Jika Perlu)',
            'Buka setting',
            'Generate semula NEW token anda',
            'Health test'
          ]
        },
        {
          id: 'invalid-argument-renew-token',
          title: 'Invalid Argument Ketika Renew Token',
          description: 'Request contains an invalid argument when renewing token',
          solutions: [
            'Tekan icon REFRESH di header apps. (Logout Jika Perlu)',
            'Tukar server kat icon kunci',
            'Generate semula NEW token anda',
            'Health test'
          ]
        }
      ]
    },
    {
      id: 'generation-errors',
      title: 'Generation Errors',
      icon: <VideoIcon className="w-5 h-5" />,
      items: [
        {
          id: 'media-generation-failed',
          title: 'Media Generation Status Failed',
          description: 'Video generation failed on the server (MEDIA_GENERATION_STATUS_FAILED). Ini berkaitan dengan Google Server, bukan MONOKLIX. Kami hanya paparkan sahaja.',
          solutions: [
            'Semak Prompt dan Image yang attach tu. Pastikan tidak melanggar policy Google',
            'Tekan try again untuk generate semula',
            'Jika masih sama, clear cache Browser anda',
            'Health test'
          ]
        },
        {
          id: 'generation-failed',
          title: 'Generation Failed / Load Failed',
          description: 'NANOBANANA 2 generation failed or load failed/generation media error when generating content',
          solutions: [
            'Semak Prompt dan Image yang attach tu. Pastikan tidak melanggar policy Google',
            'Tekan try again untuk generate semula',
            'Jika masih sama, clear cache Browser anda',
            'Health test'
          ]
        }
      ]
    },
    {
      id: 'network-server',
      title: 'Network/Server Issues',
      icon: <ServerIcon className="w-5 h-5" />,
      items: [
        {
          id: 'network-error-retry-failed',
          title: 'Network Error Retry Failed',
          description: 'Network error occurred and retry attempts failed',
          solutions: [
            'Tekan icon REFRESH di header apps. (Logout Jika Perlu)',
            'Tukar server kat icon kunci',
            'Jika masih sama, clear cache Browser anda',
            'Health test'
          ]
        },
        {
          id: 'failed-on-server',
          title: 'Failed On Server / Failed to Fetch',
          description: 'Request failed on the server or failed to fetch from server (Cybertron N401 error)',
          solutions: [
            'Tekan icon REFRESH di header apps. (Logout Jika Perlu)',
            'Tukar server kat icon kunci',
            'Jika masih sama, clear cache Browser anda',
            'Health test'
          ]
        },
        {
          id: 'proxy-404-error',
          title: 'Proxy Returned Non-JSON (404)',
          description: 'Proxy returned non-JSON response with 404 error',
          solutions: [
            'Slide ke atas sikit check G berapa',
            'Hantar screenshot pada admin'
          ]
        }
      ]
    },
    {
      id: 'authentication',
      title: 'Authentication/Credentials',
      icon: <ShieldCheckIcon className="w-5 h-5" />,
      items: [
        {
          id: 'cookie-file-not-found',
          title: 'Cookie File Not Found',
          description: 'Cookie file not found error with invalid authentication credentials',
          solutions: [
            'Slide ke atas sikit check G berapa',
            'Hantar screenshot pada admin'
          ]
        }
      ]
    },
    {
      id: 'safety-validation',
      title: 'Safety/Validation Errors',
      icon: <ShieldCheckIcon className="w-5 h-5" />,
      items: [
        {
          id: 'invalid-argument-safety',
          title: 'Invalid Argument - Safety Block',
          description: 'Request contains an invalid argument (Safety filter)',
          solutions: [
            'Semak Prompt dan Image yang attach tu. Pastikan tidak melanggar policy Google',
            'Tekan try again untuk generate semula',
            'Jika masih sama, clear cache Browser anda',
            'Health test'
          ]
        }
      ]
    },
    {
      id: 'recaptcha',
      title: 'ReCAPTCHA Issues',
      icon: <ShieldCheckIcon className="w-5 h-5" />,
      items: [
        {
          id: 'recaptcha-failed',
          title: 'ReCAPTCHA Token Evaluation Failed',
          description: 'ReCAPTCHA token evaluation failed or failed to get reCAPTCHA token from Anti-Captcha service',
          solutions: [
            'reCAPTCHA kadang memang akan failed. Anda hanya perlu tekan try again untuk generate semula',
            'Jika masih sama berulang isu reCAPTCHA ni, Buka Setting - Semak API Key Anti-Captcha Anda. Pastikan Valid',
            'Tekan icon REFRESH di header apps. (Logout Jika Perlu)',
            'Generate semula NEW token anda',
            'Health test'
          ]
        }
      ]
    },
    {
      id: 'display-output',
      title: 'Display/Output Issues',
      icon: <ImageIcon className="w-5 h-5" />,
      items: [
        {
          id: 'image-video-not-showing',
          title: 'Image/Video Tak Keluar',
          description: 'Generated images or videos are not displaying',
          solutions: [
            'Download Anydesk (Untuk pengguna PC sahaja)',
            'Copy ID anydesk',
            'Mesej Admin, bagi ID anydesk'
          ]
        }
      ]
    }
  ];

  let globalItemIndex = 0;

  return (
    <div className="w-full max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
            <InformationCircleIcon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-neutral-800 dark:text-neutral-200">
              Frequently Asked Questions (FAQ)
            </h1>
            <p className="text-sm sm:text-base text-neutral-500 dark:text-neutral-400 mt-1">
              Common issues and their solutions organized by category
            </p>
          </div>
        </div>
      </div>

      {/* Introduction Section */}
      <div className="mb-10 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-2xl p-6 sm:p-8 border border-blue-200 dark:border-blue-800">
        <div className="space-y-4">
          <h2 className="text-xl sm:text-2xl font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-3">
            <InformationCircleIcon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
            Memahami Platform {BRAND_CONFIG.name}
          </h2>
          
          <div className="space-y-4 text-sm sm:text-base text-neutral-700 dark:text-neutral-300">
            <div className="space-y-3">
              <div>
                <h4 className="font-bold text-neutral-800 dark:text-neutral-200 mb-2">Apa itu {BRAND_CONFIG.name}?</h4>
                <p>
                  {BRAND_CONFIG.name} adalah platform AI semua-dalam-satu yang membolehkan anda menjana kandungan kreatif menggunakan teknologi AI Google. 
                  Platform ini menyediakan akses kepada pelbagai model AI termasuk NanoBANANA v1 untuk penjanaan imej, Veo 3 untuk penjanaan video, 
                  dan Gemini untuk penjanaan teks dan idea kandungan.
                </p>
              </div>
              
              <div>
                <h4 className="font-bold text-neutral-800 dark:text-neutral-200 mb-2">Apakah Tujuan {BRAND_CONFIG.name}?</h4>
                <p>
                  Tujuan {BRAND_CONFIG.name} adalah untuk memudahkan proses penciptaan kandungan AI dengan menyediakan akses kepada pelbagai alat AI 
                  dalam satu platform yang mudah digunakan. Platform ini direka untuk membantu pengguna menjana imej, video, dan teks berkualiti tinggi 
                  tanpa perlu pengetahuan teknikal yang mendalam tentang AI.
                </p>
              </div>
            </div>
            
            <div className="pt-2 border-t border-neutral-200 dark:border-neutral-700">
              <h4 className="font-bold text-neutral-800 dark:text-neutral-200 mb-2">Sistem Token {BRAND_CONFIG.name}</h4>
              <p>
                Platform {BRAND_CONFIG.name} menggunakan sistem token peribadi untuk setiap pengguna. 
                Setiap pengguna perlu menjana token sendiri melalui butang "Generate NEW Token" di bahagian Settings → Flow Login. 
                Token ini adalah unik untuk setiap pengguna dan diperlukan untuk mengakses semua ciri AI. 
                Anda boleh mengesahkan token aktif dengan mencari ikon <KeyIcon className="w-4 h-4 inline-block text-green-500" /> di penjuru kanan atas skrin.
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="bg-white/60 dark:bg-neutral-800/60 p-4 rounded-xl border border-blue-200 dark:border-blue-800">
                <h3 className="font-bold text-brand-start mb-2 text-sm sm:text-base">🚗 Platform {BRAND_CONFIG.name}</h3>
                <p className="text-xs sm:text-sm">
                  Akaun anda memberi akses kepada papan pemuka, alatan AI (Suite Imej, Video, dan Idea Kandungan), dan Galeri anda.
                </p>
              </div>
              <div className="bg-white/60 dark:bg-neutral-800/60 p-4 rounded-xl border border-purple-200 dark:border-purple-800">
                <h3 className="font-bold text-brand-end mb-2 text-sm sm:text-base">⛽ Token {BRAND_CONFIG.name}</h3>
                <p className="text-xs sm:text-sm">
                  Token adalah "bahan api" yang diperlukan untuk menjana kandungan. Setiap pengguna perlu menjana token sendiri melalui sistem. Token ini unik untuk setiap pengguna dan tidak dikongsi dengan pengguna lain.
                </p>
              </div>
            </div>

            <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <p className="text-xs sm:text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
                💡 Petua Penting:
              </p>
              <ul className="text-xs sm:text-sm text-yellow-700 dark:text-yellow-300 space-y-1 list-disc list-inside">
                <li>Setiap pengguna perlu menjana token sendiri - token tidak dikongsi antara pengguna</li>
                <li>Jika anda menghadapi masalah, ikuti langkah penyelesaian di bawah mengikut urutan yang disyorkan</li>
                <li>Kebanyakan masalah boleh diselesaikan dengan log out log in atau renew token</li>
                <li>Gunakan butang "Generate NEW Token" untuk menjana token baharu jika token lama tidak berfungsi</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* FAQ Categories */}
      <div className="space-y-8">
        {faqCategories.map((category) => (
          <div key={category.id} className="space-y-4">
            {/* Category Header */}
            <div className="flex items-center gap-3 pb-2 border-b-2 border-primary-200 dark:border-primary-800">
              <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                {category.icon}
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-800 dark:text-neutral-200">
                {category.title}
              </h2>
              <span className="ml-auto text-sm text-neutral-500 dark:text-neutral-400">
                {category.items.length} {category.items.length === 1 ? 'issue' : 'issues'}
              </span>
            </div>

            {/* Category Items */}
            <div className="space-y-6">
              {category.items.map((item) => {
                globalItemIndex++;
                // Carousel component untuk setiap item
                const ImageCarousel: React.FC<{ imageUrls?: string[]; itemTitle: string }> = ({ imageUrls, itemTitle }) => {
                  const [currentIndex, setCurrentIndex] = useState(0);
                  const hasImages = imageUrls && imageUrls.length > 0;
                  const totalImages = imageUrls?.length || 0;

                  const nextImage = () => {
                    if (hasImages && totalImages > 0) {
                      setCurrentIndex((prev) => (prev + 1) % totalImages);
                    }
                  };

                  const prevImage = () => {
                    if (hasImages && totalImages > 0) {
                      setCurrentIndex((prev) => (prev - 1 + totalImages) % totalImages);
                    }
                  };

                  return (
                    <div className="w-full h-full flex items-center justify-center relative">
                      {hasImages ? (
                        <>
                          {/* Previous Button */}
                          {totalImages > 1 && (
                            <button
                              onClick={prevImage}
                              className="absolute left-2 z-10 p-2 bg-white/80 dark:bg-neutral-800/80 rounded-full shadow-md hover:bg-white dark:hover:bg-neutral-800 transition-colors"
                              aria-label="Previous image"
                            >
                              <ChevronLeftIcon className="w-5 h-5 text-neutral-700 dark:text-neutral-300" />
                            </button>
                          )}

                          {/* Current Image */}
                          <img
                            src={imageUrls![currentIndex]}
                            alt={`${itemTitle} - Image ${currentIndex + 1}`}
                            className="max-w-full max-h-full object-contain rounded-lg"
                          />

                          {/* Next Button */}
                          {totalImages > 1 && (
                            <button
                              onClick={nextImage}
                              className="absolute right-2 z-10 p-2 bg-white/80 dark:bg-neutral-800/80 rounded-full shadow-md hover:bg-white dark:hover:bg-neutral-800 transition-colors"
                              aria-label="Next image"
                            >
                              <ChevronRightIcon className="w-5 h-5 text-neutral-700 dark:text-neutral-300" />
                            </button>
                          )}

                          {/* Image Indicator Dots */}
                          {totalImages > 1 && (
                            <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex gap-2">
                              {imageUrls!.map((_, index) => (
                                <button
                                  key={index}
                                  onClick={() => setCurrentIndex(index)}
                                  className={`w-2 h-2 rounded-full transition-all ${
                                    index === currentIndex
                                      ? 'bg-primary-600 dark:bg-primary-400 w-6'
                                      : 'bg-neutral-400 dark:bg-neutral-600'
                                  }`}
                                  aria-label={`Go to image ${index + 1}`}
                                />
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-center p-8">
                          <div className="w-24 h-24 mx-auto mb-4 bg-neutral-200 dark:bg-neutral-700 rounded-lg flex items-center justify-center">
                            <AlertTriangleIcon className="w-12 h-12 text-neutral-400 dark:text-neutral-500" />
                          </div>
                          <p className="text-sm text-neutral-500 dark:text-neutral-400">
                            Image placeholder
                          </p>
                          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
                            (Images will be attached later)
                          </p>
                        </div>
                      )}
                    </div>
                  );
                };

                return (
                  <div
                    key={item.id}
                    className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-800 overflow-hidden"
                  >
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
                      {/* Left Side - Image Carousel */}
                      <div className="bg-neutral-50 dark:bg-neutral-800/50 p-6 flex items-center justify-center min-h-[200px] lg:min-h-[300px] border-b lg:border-b-0 lg:border-r border-neutral-200 dark:border-neutral-700">
                        <ImageCarousel imageUrls={item.imageUrls} itemTitle={item.title} />
                      </div>

                      {/* Right Side - Issue Details & Solutions */}
                      <div className="p-6">
                        <div className="mb-4">
                          <div className="flex items-start gap-2 mb-2">
                            <span className="flex-shrink-0 w-8 h-8 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-full flex items-center justify-center text-sm font-bold">
                              {globalItemIndex}
                            </span>
                            <div className="flex-1">
                              <h3 className="text-lg sm:text-xl font-bold text-neutral-800 dark:text-neutral-200 mb-2">
                                {item.title}
                              </h3>
                              <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
                                {item.description}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Solutions */}
                        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                          <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-3 flex items-center gap-2">
                            <InformationCircleIcon className="w-4 h-4" />
                            Cara Penyelesaian:
                          </h4>
                          <ol className="space-y-2">
                            {item.solutions.map((solution, solIndex) => (
                              <li
                                key={solIndex}
                                className="text-sm text-blue-800 dark:text-blue-200 flex items-start gap-2"
                              >
                                <span className="flex-shrink-0 w-5 h-5 bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded-full flex items-center justify-center text-xs font-bold mt-0.5">
                                  {solIndex + 1}
                                </span>
                                <span className="flex-1">{solution}</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer - PM Admin Section */}
      <div className="mt-12 pt-8 border-t border-neutral-200 dark:border-neutral-800">
        <div className="bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 rounded-2xl p-6 sm:p-8 border border-yellow-200 dark:border-yellow-800">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex-shrink-0">
                <InformationCircleIcon className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg sm:text-xl font-bold text-neutral-800 dark:text-neutral-200 mb-3">
                  Masih Menghadapi Masalah?
                </h3>
                <div className="space-y-3 text-sm sm:text-base text-neutral-700 dark:text-neutral-300">
                  <p>
                    Sebelum PM Admin, penting untuk anda <strong>CLEAR CACHE BROWSER</strong> dan Pastikan <strong>TOKEN Hijau</strong> dan <strong>Anti-CAPTCHA key Valid</strong>. Try again untuk generate semula.
                  </p>
                  <p>
                    Jika isu anda tidak berjaya diselesaikan sendiri. PM Admin.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex justify-center pt-4">
              <a
                href="https://t.me/+rrbqeAkFJqFlY2E1"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors shadow-md hover:shadow-lg"
              >
                <TelegramIcon className="w-5 h-5" />
                PM Admin
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FAQView;
