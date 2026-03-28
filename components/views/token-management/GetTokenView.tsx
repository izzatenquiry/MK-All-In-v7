import React, { useState, useEffect, useMemo } from 'react';
import { getBackendCookies, getTokenFromCookie, type BackendCookie } from '../../../services/tokenBackendService';
import { type Language } from '../../../types';
import Spinner from '../../common/Spinner';
import { KeyIcon, CheckCircleIcon, AlertTriangleIcon, XIcon, ClipboardIcon, RefreshCwIcon, SearchIcon, SparklesIcon } from '../../Icons';
import { runComprehensiveTokenTest, type TokenTestResult } from '../../../services/imagenV3Service';
import { BRAND_CONFIG } from '../../../services/brandConfig';

interface GetTokenViewProps {
  language: Language;
}

type PanelState = 'empty' | 'loading' | 'result' | 'error';

const GetTokenView: React.FC<GetTokenViewProps> = ({ language }) => {
  const [cookiesByFolder, setCookiesByFolder] = useState<Record<string, BackendCookie[]>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCookie, setSelectedCookie] = useState<string>('');
  const [panelState, setPanelState] = useState<PanelState>('empty');
  const [tokenResult, setTokenResult] = useState<{
    cookie_file?: string;
    credits?: number | string;
    timestamp?: string;
    token?: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [tokenCopied, setTokenCopied] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing'>('idle');
  const [testResults, setTestResults] = useState<TokenTestResult[] | null>(null);
  const [testToken, setTestToken] = useState('');

  useEffect(() => {
    fetchCookies();
  }, []);

  const fetchCookies = async () => {
    setLoading(true);
    try {
      const data = await getBackendCookies();
      setCookiesByFolder(data);
    } catch (error) {
      console.error('Error fetching cookies:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter folders based on brand: ESAIE shows E folders, MONOKLIX shows G folders
  const filteredCookiesByFolder = useMemo(() => {
    const isEsaie = BRAND_CONFIG.name === 'ESAIE';
    const filtered: Record<string, BackendCookie[]> = {};
    
    Object.entries(cookiesByFolder).forEach(([folderName, cookies]) => {
      // For ESAIE: only show folders starting with 'E' (E1, E2, E10, etc.)
      // For MONOKLIX: only show folders starting with 'G' (G1, G2, G10, etc.)
      // Also keep 'Root' folder for both brands
      const shouldInclude = folderName === 'Root' || 
        (isEsaie && /^E\d+$/i.test(folderName)) || 
        (!isEsaie && /^G\d+$/i.test(folderName));
      
      if (shouldInclude) {
        filtered[folderName] = cookies;
      }
    });
    
    return filtered;
  }, [cookiesByFolder]);

  // Flatten all cookies with folder info
  const allCookies = useMemo(() => {
    const cookies: Array<BackendCookie & { folder: string; fullPath: string }> = [];
    Object.entries(filteredCookiesByFolder).forEach(([folder, cookieList]) => {
      cookieList.forEach(cookie => {
        cookies.push({
          ...cookie,
          folder,
          fullPath: cookie.path !== cookie.filename ? cookie.path : cookie.filename,
        });
      });
    });
    return cookies.sort((a, b) => a.fullPath.localeCompare(b.fullPath));
  }, [filteredCookiesByFolder]);

  // Filter cookies based on search term
  const filteredCookies = useMemo(() => {
    if (!searchTerm.trim()) return allCookies;
    const term = searchTerm.toLowerCase();
    return allCookies.filter(cookie => 
      cookie.fullPath.toLowerCase().includes(term) ||
      cookie.filename.toLowerCase().includes(term) ||
      cookie.folder.toLowerCase().includes(term)
    );
  }, [allCookies, searchTerm]);

  // Get selected cookie details
  const selectedCookieData = useMemo(() => {
    return allCookies.find(c => c.path === selectedCookie);
  }, [allCookies, selectedCookie]);

  const handleGetToken = async () => {
    if (!selectedCookie) return;

    setPanelState('loading');
    setErrorMessage('');
    setTokenResult(null);

    try {
      const result = await getTokenFromCookie(selectedCookie);
      
      if (result.success && result.token) {
        setTokenResult({
          cookie_file: result.cookie_file || selectedCookie,
          credits: result.credits || 'N/A',
          timestamp: result.timestamp || new Date().toLocaleString(),
          token: result.token,
        });
        setPanelState('result');
      } else {
        setErrorMessage(result.error || 'Failed to get token');
        setPanelState('error');
      }
    } catch (error: any) {
      setErrorMessage(error.message || 'Network error occurred');
      setPanelState('error');
    }
  };

  const handleCopyToken = () => {
    if (tokenResult?.token) {
      navigator.clipboard.writeText(tokenResult.token).then(() => {
        setTokenCopied(true);
        setTimeout(() => setTokenCopied(false), 2000);
      }).catch(err => {
        console.error('Failed to copy token:', err);
      });
    }
  };

  const handleRetry = () => {
    setPanelState('empty');
    setSelectedCookie('');
    setTokenResult(null);
    setErrorMessage('');
  };

  const clearSearch = () => {
    setSearchTerm('');
  };

  const handleTestToken = async () => {
    // Use testToken if provided, otherwise use tokenResult.token
    const tokenToTest = testToken.trim() || tokenResult?.token?.trim();
    if (!tokenToTest) return;
    
    setTestStatus('testing');
    setTestResults(null);
    try {
      const results = await runComprehensiveTokenTest(tokenToTest);
      setTestResults(results);
    } catch (err) {
      console.error('Token test failed:', err);
      setTestResults([
        { service: 'NanoBanana', success: false, message: 'Test failed' },
        { service: 'Veo', success: false, message: 'Test failed' },
      ]);
    } finally {
      setTestStatus('idle');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'good':
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400">Good</span>;
      case 'warning':
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-400">Warning</span>;
      case 'expired':
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400">Expired</span>;
      default:
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800 dark:bg-gray-900/40 dark:text-gray-400">Unknown</span>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left Panel: Cookie Selection */}
      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-800 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
            <KeyIcon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-200">Select Cookie & Get Token</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Choose a cookie file to generate authorization token</p>
          </div>
        </div>

        {allCookies.length === 0 ? (
          <div className="text-center py-12">
            <XIcon className="w-16 h-16 text-neutral-400 mx-auto mb-4" />
            <h5 className="text-lg font-semibold text-neutral-700 dark:text-neutral-300 mb-2">No Cookies</h5>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">Please add cookies first.</p>
          </div>
        ) : (
          <>
            {/* Search Box */}
            <div className="mb-4">
              <label htmlFor="cookieSearch" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Search Cookie:
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <SearchIcon className="w-5 h-5 text-neutral-400" />
                </div>
                <input
                  type="text"
                  id="cookieSearch"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Type cookie name to search..."
                  className="w-full pl-10 pr-10 py-2.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                />
                {searchTerm && (
                  <button
                    onClick={clearSearch}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                    title="Clear"
                  >
                    <XIcon className="w-5 h-5" />
                  </button>
                )}
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                Total: <span className="font-semibold">{filteredCookies.length}</span> cookies
              </p>
            </div>

            {/* Cookie Select */}
            <div className="mb-4">
              <label htmlFor="cookieSelect" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Select Cookie File:
              </label>
              <select
                id="cookieSelect"
                value={selectedCookie}
                onChange={(e) => setSelectedCookie(e.target.value)}
                className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                size={8}
              >
                <option value="">-- Select Cookie --</option>
                {filteredCookies.map((cookie) => (
                  <option
                    key={cookie.path}
                    value={cookie.path}
                    data-status={cookie.status}
                    data-valid={cookie.valid}
                  >
                    {cookie.status === 'good' ? '✅' : cookie.status === 'warning' ? '⚠️' : '❌'}{' '}
                    {cookie.fullPath} ({cookie.age_days} days)
                  </option>
                ))}
              </select>
            </div>

            {/* Cookie Info */}
            {selectedCookieData && (
              <div className="mb-4 p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Status Cookie:</span>
                  {getStatusBadge(selectedCookieData.status)}
                </div>
              </div>
            )}

            {/* Get Token Button */}
            <button
              onClick={handleGetToken}
              disabled={!selectedCookie || panelState === 'loading'}
              className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <KeyIcon className="w-5 h-5" />
              {panelState === 'loading' ? 'Getting Token...' : 'Get Token'}
            </button>
          </>
        )}
      </div>

      {/* Right Panel: Token Result */}
      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-800 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
            <CheckCircleIcon className="w-6 h-6 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-200">Token Result</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Token result will be displayed here</p>
          </div>
        </div>

        {/* Loading Panel */}
        {panelState === 'loading' && (
          <div className="text-center py-12">
            <Spinner />
            <h5 className="text-lg font-semibold text-neutral-700 dark:text-neutral-300 mt-4 mb-2">Getting Token...</h5>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Please wait, this process may take a few seconds.</p>
          </div>
        )}

        {/* Result Panel */}
        {panelState === 'result' && tokenResult && (
          <div className="space-y-4">
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2">
                <CheckCircleIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
                <span className="font-semibold text-green-800 dark:text-green-200">Token Successfully Retrieved!</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Cookie File:</label>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 font-mono break-all">{tokenResult.cookie_file || '-'}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Credits:</label>
              <span className="inline-block px-3 py-1 bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-400 rounded-full text-sm font-semibold">
                {tokenResult.credits || 'N/A'}
              </span>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Timestamp:</label>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">{tokenResult.timestamp || '-'}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Authorization Token:</label>
              <textarea
                readOnly
                value={tokenResult.token || ''}
                rows={6}
                className="w-full px-4 py-3 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg font-mono text-xs focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <button
              onClick={handleCopyToken}
              className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-semibold transition-colors ${
                tokenCopied
                  ? 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-400 border border-green-300 dark:border-green-700'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {tokenCopied ? (
                <>
                  <CheckCircleIcon className="w-5 h-5" />
                  Copied!
                </>
              ) : (
                <>
                  <ClipboardIcon className="w-5 h-5" />
                  Copy Token
                </>
              )}
            </button>
          </div>
        )}

        {/* Error Panel */}
        {panelState === 'error' && (
          <div className="space-y-4">
            <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2 mb-2">
                <XIcon className="w-5 h-5 text-red-600 dark:text-red-400" />
                <span className="font-semibold text-red-800 dark:text-red-200">Failed!</span>
              </div>
              <p className="text-sm text-red-700 dark:text-red-300">{errorMessage || 'Unknown error occurred'}</p>
            </div>
            <button
              onClick={handleRetry}
              className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              <RefreshCwIcon className="w-5 h-5" />
              Try Again
            </button>
          </div>
        )}

        {/* Empty Panel */}
        {panelState === 'empty' && (
          <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">
            <KeyIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <h5 className="text-lg font-semibold text-neutral-700 dark:text-neutral-300 mb-2">Select Cookie & Get Token</h5>
            <p className="text-sm">Token result will be displayed here.</p>
          </div>
        )}
      </div>
      </div>

      {/* Token Health Test Section */}
      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-800 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <SparklesIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-200">Token Health Test</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Test your token to verify it works with NanoBanana and Veo services</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Token Input for Testing */}
          <div>
            <label htmlFor="test-token" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              Token to Test (optional - will use token from result above if empty):
            </label>
            <textarea
              id="test-token"
              value={testToken}
              onChange={(e) => setTestToken(e.target.value)}
              placeholder="Paste token here to test, or leave empty to test the token from result above"
              rows={3}
              className="w-full px-4 py-3 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg font-mono text-xs focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              {tokenResult?.token 
                ? 'Leave empty to test the token from result above, or paste a different token to test'
                : 'Paste a token to test'}
            </p>
          </div>

          {/* Health Test Button */}
          <button
            onClick={handleTestToken}
            disabled={(!testToken.trim() && !tokenResult?.token?.trim()) || testStatus === 'testing'}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 dark:bg-blue-700 text-white text-sm font-semibold py-2.5 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testStatus === 'testing' ? (
              <>
                <Spinner />
                Testing...
              </>
            ) : (
              <>
                <SparklesIcon className="w-4 h-4" />
                Health Test
              </>
            )}
          </button>

          {/* Test Results */}
          {testStatus === 'testing' && (
            <div className="flex items-center gap-2 text-sm text-neutral-500">
              <Spinner />
              Testing token...
            </div>
          )}

          {testResults && (
            <div className="space-y-2">
              {testResults.map((result) => (
                <div
                  key={result.service}
                  className={`flex items-start gap-2 text-sm p-3 rounded-md ${
                    result.success
                      ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                      : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                  }`}
                >
                  {result.success ? (
                    <CheckCircleIcon className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <XIcon className="w-5 h-5 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span
                      className={`font-semibold ${
                        result.success
                          ? 'text-green-800 dark:text-green-200'
                          : 'text-red-700 dark:text-red-300'
                      }`}
                    >
                      {result.service} Service
                    </span>
                    <p
                      className={`text-xs ${
                        result.success
                          ? 'text-green-700 dark:text-green-300'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {result.message}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GetTokenView;
