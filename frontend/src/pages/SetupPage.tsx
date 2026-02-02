import { useState, useEffect } from 'react';
import api from '../lib/api';

interface ValidationResult {
  valid: boolean;
  bot?: {
    username: string;
    id: string;
  };
  guildAccess?: boolean;
  channelAccess?: boolean;
  error?: string;
}

export default function SetupPage() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  
  const [config, setConfig] = useState({
    allowedUrls: [window.location.origin],
    discordClientId: '',
    discordClientSecret: '',
    discordBotToken: '',
    discordGuildId: '',
    discordChannelId: '',
  });

  const [urlInput, setUrlInput] = useState('');

  // No need to check setup status here - App.tsx handles the redirect
  // Just mark loading as false immediately
  useEffect(() => {
    setLoading(false);
  }, []);

  const validateDiscord = async () => {
    setValidating(true);
    setValidation(null);
    setError(null);
    
    try {
      const response = await api.post<ValidationResult>('/setup/validate-discord', {
        discordBotToken: config.discordBotToken,
        discordGuildId: config.discordGuildId,
        discordChannelId: config.discordChannelId,
      });
      
      setValidation(response.data);
      
      if (response.data.valid) {
        setStep(4);
      }
    } catch (err) {
      setError('Failed to validate Discord credentials');
    } finally {
      setValidating(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    
    try {
      await api.post('/setup/configure', config);
      setSuccess(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save configuration');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-800 rounded-lg shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Setup Complete!</h2>
          <p className="text-gray-400 mb-6">
            D-Drive has been configured successfully.
          </p>
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 mb-6">
            <p className="text-green-400 text-sm">
              <strong>Ready to use!</strong> Your configuration has been saved and is active immediately.
            </p>
          </div>
          <button
            onClick={() => window.location.href = '/login'}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-white">D-Drive Setup</h1>
          </div>
          <p className="text-gray-400">Configure your Discord integration to get started</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-8">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                step >= s ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-400'
              }`}>
                {step > s ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : s}
              </div>
              {s < 4 && (
                <div className={`w-16 h-1 ${step > s ? 'bg-indigo-600' : 'bg-gray-700'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="bg-gray-800 rounded-lg shadow-xl p-8">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg mb-6">
              {error}
            </div>
          )}

          {step === 1 && (
            <>
              <h2 className="text-xl font-semibold text-white mb-2">Step 1: Configure Access URLs</h2>
              <p className="text-gray-400 mb-6">
                Add all domains that will access this D-Drive instance. These URLs will be used for CORS policy and Discord OAuth redirects.
              </p>

              <div className="bg-gray-700/50 rounded-lg p-4 mb-6">
                <h3 className="text-white font-medium mb-2">Current Access URLs:</h3>
                <div className="space-y-2">
                  {config.allowedUrls.map((url, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-800 rounded px-3 py-2">
                      <code className="text-sm text-green-400">{url}</code>
                      {config.allowedUrls.length > 1 && (
                        <button
                          onClick={() => setConfig({
                            ...config,
                            allowedUrls: config.allowedUrls.filter((_, i) => i !== index)
                          })}
                          className="text-red-400 hover:text-red-300 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Add URL</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && urlInput.trim()) {
                          const url = urlInput.trim();
                          if (url.match(/^https?:\/\/.+/)) {
                            if (!config.allowedUrls.includes(url)) {
                              setConfig({ ...config, allowedUrls: [...config.allowedUrls, url] });
                              setUrlInput('');
                            } else {
                              setError('URL already added');
                              setTimeout(() => setError(null), 3000);
                            }
                          } else {
                            setError('URL must start with http:// or https://');
                            setTimeout(() => setError(null), 3000);
                          }
                        }
                      }}
                      placeholder="https://drive.yourdomain.com"
                      className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      onClick={() => {
                        const url = urlInput.trim();
                        if (url.match(/^https?:\/\/.+/)) {
                          if (!config.allowedUrls.includes(url)) {
                            setConfig({ ...config, allowedUrls: [...config.allowedUrls, url] });
                            setUrlInput('');
                          } else {
                            setError('URL already added');
                            setTimeout(() => setError(null), 3000);
                          }
                        } else {
                          setError('URL must start with http:// or https://');
                          setTimeout(() => setError(null), 3000);
                        }
                      }}
                      disabled={!urlInput.trim()}
                      className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors"
                    >
                      Add
                    </button>
                  </div>
                  <p className="text-gray-400 text-sm mt-2">
                    Examples: <code className="bg-gray-700 px-1 rounded text-xs">http://localhost</code>, <code className="bg-gray-700 px-1 rounded text-xs">https://pi.local</code>, <code className="bg-gray-700 px-1 rounded text-xs">https://drive.yourdomain.com</code>
                  </p>
                </div>
              </div>

              <div className="mt-6 bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                <p className="text-blue-400 text-sm">
                  <strong>Important:</strong> You'll need to add these URLs as Discord OAuth redirect URLs in the next step.
                  Each URL will have <code className="bg-gray-800 px-1 rounded">/auth/callback</code> appended.
                </p>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setStep(2)}
                  disabled={config.allowedUrls.length === 0}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-2 px-6 rounded-lg transition-colors"
                >
                  Next
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-xl font-semibold text-white mb-2">Step 2: Discord Application</h2>
              <p className="text-gray-400 mb-6">
                Create a Discord application and bot to enable authentication and file storage.
              </p>

              <div className="bg-gray-700/50 rounded-lg p-4 mb-6">
                <h3 className="text-white font-medium mb-3">How to create a Discord Application:</h3>
                <ol className="text-gray-300 text-sm space-y-2 list-decimal list-inside">
                  <li>Go to <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">Discord Developer Portal</a></li>
                  <li>Click "New Application" and give it a name (e.g., "D-Drive")</li>
                  <li>Go to "OAuth2" → Copy the <strong>Client ID</strong> and <strong>Client Secret</strong></li>
                  <li>Add redirect URLs (copy these exactly):
                    <div className="ml-4 mt-1 space-y-1">
                      {config.allowedUrls.map((url, index) => (
                        <code key={index} className="block bg-gray-800 px-2 py-0.5 rounded text-xs">{url}/auth/callback</code>
                      ))}
                    </div>
                  </li>
                  <li>Go to "Bot" → Click "Add Bot" → Copy the <strong>Bot Token</strong></li>
                  <li>Enable "Message Content Intent" under Privileged Gateway Intents</li>
                </ol>
                <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded">
                  <p className="text-blue-400 text-xs">
                    <strong>Multi-Domain Support:</strong> Set <code className="bg-gray-800 px-1 rounded">FRONTEND_URL</code> in .env to your primary domain. 
                    Add all domains as Discord OAuth redirect URLs above.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Client ID</label>
                  <input
                    type="text"
                    value={config.discordClientId}
                    onChange={(e) => {
                      // Only allow numeric input for Discord snowflake IDs
                      const value = e.target.value.replace(/\D/g, '');
                      setConfig({ ...config, discordClientId: value });
                    }}
                    placeholder="Enter your Discord Client ID (17-19 digits)"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                  {config.discordClientId && (config.discordClientId.length < 17 || config.discordClientId.length > 19) && (
                    <p className="text-red-400 text-xs mt-1">Discord IDs must be 17-19 digits</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Client Secret</label>
                  <input
                    type="password"
                    value={config.discordClientSecret}
                    onChange={(e) => setConfig({ ...config, discordClientSecret: e.target.value })}
                    placeholder="Enter your Discord Client Secret"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Bot Token</label>
                  <input
                    type="password"
                    value={config.discordBotToken}
                    onChange={(e) => setConfig({ ...config, discordBotToken: e.target.value })}
                    placeholder="Enter your Discord Bot Token"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-between">
                <button
                  onClick={() => setStep(1)}
                  className="text-gray-400 hover:text-white font-medium py-2 px-6 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!config.discordClientId || !config.discordClientSecret || !config.discordBotToken || config.discordClientId.length < 17 || config.discordClientId.length > 19}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-2 px-6 rounded-lg transition-colors"
                >
                  Next
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="text-xl font-semibold text-white mb-2">Step 3: Storage Server</h2>
              <p className="text-gray-400 mb-6">
                Choose a Discord server and channel where files will be stored.
              </p>

              <div className="bg-gray-700/50 rounded-lg p-4 mb-6">
                <h3 className="text-white font-medium mb-3">How to get Server and Channel IDs:</h3>
                <ol className="text-gray-300 text-sm space-y-2 list-decimal list-inside">
                  <li>Enable Developer Mode in Discord (Settings → App Settings → Advanced)</li>
                  <li>Right-click your server → "Copy Server ID"</li>
                  <li>Right-click the storage channel → "Copy Channel ID"</li>
                  <li>Make sure the bot is invited to the server with proper permissions</li>
                </ol>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Server (Guild) ID</label>
                  <input
                    type="text"
                    value={config.discordGuildId}
                    onChange={(e) => {
                      // Only allow numeric input for Discord snowflake IDs
                      const value = e.target.value.replace(/\D/g, '');
                      setConfig({ ...config, discordGuildId: value });
                    }}
                    placeholder="Enter your Discord Server ID (17-19 digits)"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                  {config.discordGuildId && (config.discordGuildId.length < 17 || config.discordGuildId.length > 19) && (
                    <p className="text-red-400 text-xs mt-1">Discord IDs must be 17-19 digits</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Storage Channel ID</label>
                  <input
                    type="text"
                    value={config.discordChannelId}
                    onChange={(e) => {
                      // Only allow numeric input for Discord snowflake IDs
                      const value = e.target.value.replace(/\D/g, '');
                      setConfig({ ...config, discordChannelId: value });
                    }}
                    placeholder="Enter the channel ID for file storage (17-19 digits)"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                  {config.discordChannelId && (config.discordChannelId.length < 17 || config.discordChannelId.length > 19) && (
                    <p className="text-red-400 text-xs mt-1">Discord IDs must be 17-19 digits</p>
                  )}
                </div>
              </div>

              {validation && !validation.valid && (
                <div className="mt-4 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg">
                  <strong>Validation Failed:</strong> {validation.error || 'Could not access the server or channel. Make sure the bot is invited to the server.'}
                </div>
              )}

              <div className="mt-6 flex justify-between">
                <button
                  onClick={() => setStep(2)}
                  className="text-gray-400 hover:text-white font-medium py-2 px-6 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={validateDiscord}
                  disabled={!config.discordGuildId || !config.discordChannelId || validating || config.discordGuildId.length < 17 || config.discordGuildId.length > 19 || config.discordChannelId.length < 17 || config.discordChannelId.length > 19}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-2 px-6 rounded-lg transition-colors flex items-center gap-2"
                >
                  {validating && (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  )}
                  Validate & Continue
                </button>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h2 className="text-xl font-semibold text-white mb-2">Step 4: Confirm Setup</h2>
              <p className="text-gray-400 mb-6">
                Review your configuration and complete the setup.
              </p>

              {validation?.bot && (
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center">
                      <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-green-400 font-medium">Discord Connected</p>
                      <p className="text-gray-400 text-sm">Bot: {validation.bot.username}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-gray-700/50 rounded-lg p-4 space-y-3">
                <div>
                  <span className="text-gray-400 block mb-2">Allowed URLs ({config.allowedUrls.length})</span>
                  <div className="space-y-1 ml-4">
                    {config.allowedUrls.map((url, index) => (
                      <div key={index} className="text-white font-mono text-sm text-green-400">{url}</div>
                    ))}
                  </div>
                </div>
                <div className="flex justify-between border-t border-gray-600 pt-3">
                  <span className="text-gray-400">Client ID</span>
                  <span className="text-white font-mono text-sm">{config.discordClientId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Server ID</span>
                  <span className="text-white font-mono text-sm">{config.discordGuildId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Channel ID</span>
                  <span className="text-white font-mono text-sm">{config.discordChannelId}</span>
                </div>
              </div>

              <div className="mt-6 flex justify-between">
                <button
                  onClick={() => setStep(3)}
                  className="text-gray-400 hover:text-white font-medium py-2 px-6 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-2 px-6 rounded-lg transition-colors flex items-center gap-2"
                >
                  {submitting && (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  )}
                  Complete Setup
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

