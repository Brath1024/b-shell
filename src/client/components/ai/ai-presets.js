export const defaultAIPresets = [
  {
    id: 'infistar',
    nameAI: 'Infistar',
    baseURLAI: 'https://infistar.cc/v1',
    // Both hosts serve the same gateway. The first one is the default, the
    // others are offered in the API URL picker.
    baseURLAIs: [
      'https://infistar.cc/v1',
      'https://infistar.ai/v1'
    ],
    apiPathAI: '/chat/completions',
    modelAI: 'deepseek-v4-flash',
    pinned: true,
    authHeaderNameAI: 'Authorization: Bearer',
    siteUrl: 'https://www.infistar.cc/register?aff=4R4JT29X&ref_source=link',
    modelAIs: [
      { value: 'deepseek-v4-flash' },
      { value: 'deepseek-v4-pro' },
      { value: 'claude-sonnet-4-6' }
    ]
  },
  {
    id: 'packycode',
    nameAI: 'PackyCode',
    baseURLAI: 'https://cf.api.fan/v1',
    apiPathAI: '/chat/completions',
    modelAI: 'deepseek-flash',
    pinned: true,
    authHeaderNameAI: 'Authorization: Bearer',
    siteUrl: 'https://www.packyapi.ai/register?aff=DOZI',
    modelAIs: [
      { value: 'deepseek-flash' },
      { value: 'deepseek-v4-pro' }
    ]
  },
  {
    id: 'apimart',
    nameAI: 'ApiMart',
    pinned: true,
    baseURLAI: 'https://api.apimart.ai/v1',
    apiPathAI: '/chat/completions',
    modelAI: 'deepseek-v4-flash',
    authHeaderNameAI: 'Authorization: Bearer',
    siteUrl: 'https://go.apimart.ai/gh-bshell'
  },
  {
    id: 'ApiSmart',
    nameAI: 'ApiSmart',
    pinned: true,
    baseURLAI: 'https://api.apismart.ai/v1',
    apiPathAI: '/chat/completions',
    modelAI: 'DEEPSEEK_V4_FLASH',
    authHeaderNameAI: 'Authorization: Bearer',
    siteUrl: 'https://apismart.ai/?utm_source=bshell_app&utm_medium=link&utm_campaign=bshell'
  },
  {
    id: 'fluxionai',
    nameAI: 'Sidrune',
    baseURLAI: 'https://sidrune.ai/v1',
    apiPathAI: '/chat/completions',
    modelAI: 'deepseek-v4-flash-0731',
    authHeaderNameAI: 'Authorization: Bearer',
    siteUrl: 'https://fluxionai.space/register?source=github&campaign=github-sidrune-bshell&promo=SDRBSHELL&aff=7H7DERHU3GFF'
  },
  {
    id: 'atlascloud',
    nameAI: 'AtlasCloud',
    baseURLAI: 'https://api.atlascloud.ai/v1',
    apiPathAI: '/chat/completions',
    modelAI: 'deepseek-ai/deepseek-v4-flash',
    authHeaderNameAI: 'Authorization: Bearer',
    siteUrl: 'https://www.atlascloud.ai?ref=PCAEL2',
    modelAIs: [
      { value: 'deepseek-ai/deepseek-v4-flash' },
      { value: 'zai-org/GLM-5.3' },
      { value: 'moonshotai/Kimi-K3' }
    ]
  },
  {
    id: 'siliconflow',
    nameAI: 'SiliconFlow',
    baseURLAI: 'https://api.siliconflow.cn/v1',
    apiPathAI: '/chat/completions',
    modelAI: 'deepseek-ai/DeepSeek-V4-Flash',
    authHeaderNameAI: 'Authorization: Bearer',
    siteUrl: 'https://cloud.siliconflow.cn/i/Xa85Yz6R'
  },
  {
    id: 'deepseek',
    nameAI: 'DeepSeek',
    // Official docs use `https://api.deepseek.com` and append
    // `/chat/completions`; `/v1` is only an OpenAI-compatible alias.
    baseURLAI: 'https://api.deepseek.com',
    baseURLAIs: [
      'https://api.deepseek.com',
      'https://api.deepseek.com/v1'
    ],
    apiPathAI: '/chat/completions',
    // `deepseek-flash` is the current cheap model id (DeepSeek-V4.1-Flash-1017
    // behind it); `deepseek-v4-pro` is the stronger one. Product names are not
    // valid ids and must never be sent as `model`.
    modelAI: 'deepseek-flash',
    authHeaderNameAI: 'Authorization: Bearer',
    siteUrl: 'https://platform.deepseek.com/api_keys?utm_source=bshell_app&utm_medium=link&utm_campaign=bshell',
    modelAIs: [
      { value: 'deepseek-flash' },
      { value: 'deepseek-v4-pro' }
    ],
    ignoreCachedModels: true
  },
  {
    id: 'opencode-go',
    nameAI: 'OpenCodeGo',
    // OpenCode Go splits its protocols under /inference/go/*; the OpenAI
    // compatible chat entry is /openai/v1 (not https://opencode.ai/v1).
    // Requests also need a stable session id and a real User-Agent header,
    // both injected in src/app/lib/ai.js from the base URL.
    baseURLAI: 'https://opencode.ai/inference/go/openai/v1',
    apiPathAI: '/chat/completions',
    modelAI: 'deepseek-v4.1-flash',
    authHeaderNameAI: 'Authorization: Bearer',
    siteUrl: 'https://opencode.ai/console',
    modelAIs: [
      { value: 'deepseek-v4.1-flash' },
      { value: 'deepseek-v4-pro' },
      { value: 'glm-5.3' },
      { value: 'kimi-k3' },
      { value: 'qwen3.8-max' },
      { value: 'gpt-6-luna' },
      { value: 'claude-haiku-5-5' },
      { value: 'grok-4.7' },
      { value: 'minimax-m3' },
      { value: 'mimo-v2.6-pro' },
      { value: 'longcat-2.0' },
      { value: 'step-5-preview' }
    ]
  },
  {
    id: 'openai',
    nameAI: 'OpenAI',
    baseURLAI: 'https://api.openai.com/v1',
    apiPathAI: '/chat/completions',
    modelAI: 'gpt-4o',
    authHeaderNameAI: 'Authorization: Bearer',
    siteUrl: 'https://platform.openai.com/api-keys?utm_source=bshell_app&utm_medium=link&utm_campaign=bshell'
  },
  {
    id: 'anthropic',
    nameAI: 'Anthropic Claude',
    baseURLAI: 'https://api.anthropic.com/v1',
    apiPathAI: '/messages',
    modelAI: 'claude-sonnet-4-6',
    authHeaderNameAI: 'x-api-key',
    modelAIs: [
      { value: 'claude-sonnet-4-6' },
      { value: 'claude-opus-4-8' },
      { value: 'claude-haiku-4-5' }
    ],
    siteUrl: 'https://console.anthropic.com/settings/keys?utm_source=bshell_app&utm_medium=link&utm_campaign=bshell'
  },
  {
    id: 'openrouter',
    nameAI: 'OpenRouter',
    baseURLAI: 'https://openrouter.ai/api/v1',
    apiPathAI: '/chat/completions',
    modelAI: 'openai/gpt-4o-mini',
    authHeaderNameAI: 'Authorization: Bearer',
    siteUrl: 'https://openrouter.ai/keys?utm_source=bshell_app&utm_medium=link&utm_campaign=bshell'
  },
  {
    id: 'orcarouter',
    nameAI: 'OrcaRouter',
    baseURLAI: 'https://api.orcarouter.ai/v1',
    apiPathAI: '/chat/completions',
    modelAI: 'orcarouter/free',
    authHeaderNameAI: 'Authorization: Bearer',
    siteUrl: 'https://www.orcarouter.ai/ref/ref_2c4884ca28b88a82593f'
  },
  {
    id: 'google',
    nameAI: 'Google Gemini',
    baseURLAI: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiPathAI: '/chat/completions',
    modelAI: 'gemini-3.8-flash',
    authHeaderNameAI: 'Authorization: Bearer',
    siteUrl: 'https://aistudio.google.com/apikey'
  },
  {
    id: 'groq',
    nameAI: 'Groq',
    baseURLAI: 'https://api.groq.com/openai/v1',
    apiPathAI: '/chat/completions',
    modelAI: 'llama-3.3-70b-versatile',
    authHeaderNameAI: 'Authorization: Bearer'
  },
  {
    id: 'together',
    nameAI: 'Together AI',
    baseURLAI: 'https://api.together.xyz/v1',
    apiPathAI: '/chat/completions',
    modelAI: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    authHeaderNameAI: 'Authorization: Bearer'
  },
  {
    id: 'mistral',
    nameAI: 'Mistral AI',
    baseURLAI: 'https://api.mistral.ai/v1',
    apiPathAI: '/chat/completions',
    modelAI: 'mistral-large-latest',
    authHeaderNameAI: 'Authorization: Bearer'
  },
  {
    id: 'minimax-global',
    nameAI: 'MiniMax (Global)',
    baseURLAI: 'https://api.minimax.io/v1',
    apiPathAI: '/chat/completions',
    modelAI: 'MiniMax-M3.1-Flash',
    authHeaderNameAI: 'Authorization: Bearer',
    // MiniMax returns retired models next to the current ones, so the preset
    // keeps its own suggestions instead of the fetched/cached list.
    ignoreCachedModels: true,
    modelAIs: [
      { value: 'MiniMax-M3.1-Flash' },
      { value: 'MiniMax-M3' }
    ],
    siteUrl: 'https://platform.minimax.io/user-center/basic-information/interface-key?utm_source=bshell_app&utm_medium=link&utm_campaign=bshell'
  },
  {
    id: 'minimax-cn',
    nameAI: 'MiniMax (China)',
    baseURLAI: 'https://api.minimax.cn/v1',
    // The same endpoint is documented under the older minimaxi.com host.
    baseURLAIs: [
      'https://api.minimax.cn/v1',
      'https://api.minimaxi.com/v1'
    ],
    apiPathAI: '/chat/completions',
    modelAI: 'MiniMax-M3.1-Flash',
    authHeaderNameAI: 'Authorization: Bearer',
    ignoreCachedModels: true,
    modelAIs: [
      { value: 'MiniMax-M3.1-Flash' },
      { value: 'MiniMax-M3' }
    ],
    siteUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key?utm_source=bshell_app&utm_medium=link&utm_campaign=bshell'
  },
  {
    id: 'xai',
    nameAI: 'xAI (Grok)',
    baseURLAI: 'https://api.x.ai/v1',
    apiPathAI: '/chat/completions',
    modelAI: 'grok-3-mini',
    authHeaderNameAI: 'Authorization: Bearer'
  },
  {
    id: 'perplexity',
    nameAI: 'Perplexity',
    baseURLAI: 'https://api.perplexity.ai',
    apiPathAI: '/chat/completions',
    modelAI: 'sonar',
    authHeaderNameAI: 'Authorization: Bearer'
  },
  {
    id: 'moonshot',
    nameAI: 'Moonshot (Kimi)',
    baseURLAI: 'https://api.moonshot.cn/v1',
    apiPathAI: '/chat/completions',
    modelAI: 'moonshot-v1-8k',
    authHeaderNameAI: 'Authorization: Bearer'
  }
]

export function normalizeAIBaseURL (url) {
  return (url || '').trim().replace(/\/+$/, '')
}

// A provider can be reachable at several hosts (Infistar's two domains,
// MiniMax's older host). `baseURLAI` stays the single value the form saves;
// the list only drives preset matching and the API URL picker.
export function getPresetBaseURLs (preset) {
  if (Array.isArray(preset?.baseURLAIs)) {
    return preset.baseURLAIs
  }
  return preset?.baseURLAI ? [preset.baseURLAI] : []
}

// `presets` is optional so the config form can search the list it renders,
// which also contains the build-injected custom preset. Trailing slashes and
// alternate provider hosts all have to resolve to the same preset, or its
// key link and curated model suggestions disappear.
export function findAIPreset (url, presets = defaultAIPresets) {
  const target = normalizeAIBaseURL(url)
  return presets.find(p =>
    getPresetBaseURLs(p).some(u => normalizeAIBaseURL(u) === target))
}

// Suggestions do not constrain the editable model value or saved configurations.
// `fetched` marks a list that just came back from the API: an explicit refresh
// is the user asking for the real list, so it is merged even for presets that
// ignore cached lists. A cached list is not trusted the same way, because it can
// still hold models the provider retired since it was saved.
export function getAIModelOptions (baseURL, preset, cachedModels = [], fetched = false) {
  const target = findAIPreset(baseURL) || preset
  const presetModels = (target?.modelAIs || [])
    .map(o => (typeof o === 'string' ? o : o.value))
  const values = target?.ignoreCachedModels && !fetched
    ? presetModels
    : [...presetModels, ...cachedModels]
  return [...new Set(values.filter(Boolean))].map(value => ({ value }))
}

export function getAIPresets () {
  const presets = [...defaultAIPresets]
  const customPreset = window.et?.defaultAIPreset
  if (customPreset) {
    const lastPinnedIndex = presets.reduce((maxIndex, preset, index) => {
      if (preset.pinned) {
        return index
      }
      return maxIndex
    }, -1)
    presets.splice(lastPinnedIndex + 1, 0, customPreset)
  }
  return presets
}
