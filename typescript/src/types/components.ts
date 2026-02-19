/**
 * Component types shared across jambonz verbs.
 * These map 1:1 to the JSON schemas in schema/components/.
 */

/** Authentication credentials for SIP endpoints, websocket connections, etc. */
export interface Auth {
  username: string;
  password: string;
}

/**
 * A webhook or websocket callback that jambonz invokes during call processing.
 * Can be a simple URL string or an object with additional options.
 */
export type ActionHook = string | ActionHookObject;

export interface ActionHookObject {
  url: string;
  method?: 'GET' | 'POST';
  basicAuth?: Auth;
}

/** Text-to-speech synthesis configuration. */
export interface Synthesizer {
  /** The TTS vendor to use (e.g. 'google', 'aws', 'elevenlabs', 'cartesia', 'deepgram'). */
  vendor: string;
  /** Label identifying a specific credential set for this vendor. */
  label?: string;
  /** Language code in BCP-47 format (e.g. 'en-US'). */
  language?: string;
  /** Voice name or configuration object. */
  voice?: string | Record<string, unknown>;
  /** Backup TTS vendor if the primary fails. */
  fallbackVendor?: string;
  /** Credential label for the fallback vendor. */
  fallbackLabel?: string;
  /** Language code for the fallback vendor. */
  fallbackLanguage?: string;
  /** Voice for the fallback vendor. */
  fallbackVoice?: string | Record<string, unknown>;
  /** Synthesis engine tier. */
  engine?: 'standard' | 'neural' | 'generative' | 'long-form';
  /** Preferred voice gender. */
  gender?: 'MALE' | 'FEMALE' | 'NEUTRAL';
  /** Vendor-specific options passed through to the TTS provider. */
  options?: Record<string, unknown>;
}

/** Speech-to-text recognition configuration. */
export interface Recognizer {
  /** The STT vendor to use (e.g. 'google', 'aws', 'deepgram', 'microsoft'). */
  vendor: string;
  /** Label identifying a specific credential set for this vendor. */
  label?: string;
  /** Language code in BCP-47 format. */
  language?: string;
  /** Backup STT vendor if the primary fails. */
  fallbackVendor?: string;
  /** Credential label for the fallback vendor. */
  fallbackLabel?: string;
  /** Language code for the fallback vendor. */
  fallbackLanguage?: string;
  /** Voice activity detection settings. */
  vad?: Vad;
  /** Words or phrases to boost recognition for. */
  hints?: string[];
  /** Boost factor for hint words. */
  hintsBoost?: number;
  /** Additional languages to listen for simultaneously. */
  altLanguages?: string[];
  /** Filter profanity from results. */
  profanityFilter?: boolean;
  /** Return interim (partial) results. */
  interim?: boolean;
  /** Stop after first complete utterance. */
  singleUtterance?: boolean;
  /** Send separate audio channels for each call leg. */
  dualChannel?: boolean;
  /** Independent recognition per audio channel. */
  separateRecognitionPerChannel?: boolean;
  /** Enable automatic punctuation. */
  punctuation?: boolean;
  /** Use enhanced (premium) recognition model. */
  enhancedModel?: boolean;
  /** Include word-level timing. */
  words?: boolean;
  /** Enable speaker diarization. */
  diarization?: boolean;
  /** Minimum speakers expected for diarization. */
  diarizationMinSpeakers?: number;
  /** Maximum speakers expected for diarization. */
  diarizationMaxSpeakers?: number;
  /** Hint about interaction type. */
  interactionType?: 'unspecified' | 'discussion' | 'presentation' | 'phone_call' | 'voicemail' | 'voice_search' | 'voice_command' | 'dictation';
  /** NAICS industry code for domain-specific accuracy. */
  naicsCode?: number;
  /** Identify and label which channel each segment came from. */
  identifyChannels?: boolean;
  /** Custom vocabulary resource name. */
  vocabularyName?: string;
  /** Vocabulary filter name for masking/removing words. */
  vocabularyFilterName?: string;
  /** How filtered words are handled. */
  filterMethod?: 'remove' | 'mask' | 'tag';
  /** Specific recognition model name. */
  model?: string;
  /** Level of detail in results. */
  outputFormat?: 'simple' | 'detailed';
  /** How profanity is handled in results. */
  profanityOption?: 'masked' | 'removed' | 'raw';
  /** Request signal-to-noise ratio info. */
  requestSnr?: boolean;
  /** Milliseconds to wait for initial speech. */
  initialSpeechTimeoutMs?: number;
  /** Custom Azure Speech Services endpoint URL. */
  azureServiceEndpoint?: string;
  /** Azure custom speech endpoint ID. */
  azureSttEndpointId?: string;
  /** DTMF digit that terminates recognition. */
  asrDtmfTerminationDigit?: string;
  /** Max seconds for a complete recognition result. */
  asrTimeout?: number;
  /** Timeout for fast recognition mode. */
  fastRecognitionTimeout?: number;
  /** Minimum confidence score (0-1) to accept a result. */
  minConfidence?: number;

  // Vendor-specific option bags
  deepgramOptions?: Record<string, unknown>;
  googleOptions?: Record<string, unknown>;
  awsOptions?: Record<string, unknown>;
  azureOptions?: Record<string, unknown>;
  nuanceOptions?: Record<string, unknown>;
  ibmOptions?: Record<string, unknown>;
  nvidiaOptions?: Record<string, unknown>;
  sonioxOptions?: Record<string, unknown>;
  cobaltOptions?: Record<string, unknown>;
  assemblyAiOptions?: Record<string, unknown>;
  speechmaticsOptions?: Record<string, unknown>;
  openaiOptions?: Record<string, unknown>;
  houndifyOptions?: Record<string, unknown>;
  gladiaOptions?: Record<string, unknown>;
  elevenlabsOptions?: Record<string, unknown>;
  verbioOptions?: Record<string, unknown>;
  customOptions?: Record<string, unknown>;
}

/** Call target for the dial verb. */
export interface Target {
  /** Target type. */
  type: 'phone' | 'sip' | 'user' | 'teams';
  /** Phone number in E.164 format. Required for type 'phone'. */
  number?: string;
  /** SIP URI. Required for type 'sip'. */
  sipUri?: string;
  /** Registered user name. Required for type 'user'. */
  name?: string;
  /** Microsoft Teams tenant ID. Required for type 'teams'. */
  tenant?: string;
  /** SIP trunk to route through. */
  trunk?: string;
  /** Webhook for call screening before bridging. */
  confirmHook?: ActionHook;
  /** HTTP method for confirmHook. */
  method?: 'GET' | 'POST';
  /** Custom SIP headers on the outbound INVITE. */
  headers?: Record<string, string>;
  /** Override the From header on outbound SIP. */
  from?: { user?: string; host?: string };
  /** SIP digest auth credentials. */
  auth?: Auth;
  /** Follow into voicemail if unanswered. */
  vmail?: boolean;
  /** Override the Request-URI. */
  overrideTo?: string;
  /** SIP proxy to route through. */
  proxy?: string;
}

/** Voice Activity Detection configuration. */
export interface Vad {
  /** Enable VAD. */
  enable?: boolean;
  /** Milliseconds of voice activity before speech start. */
  voiceMs?: number;
  /** Milliseconds of silence before speech end. */
  silenceMs?: number;
  /** VAD strategy. */
  strategy?: string;
  /** WebRTC VAD aggressiveness (0-3). */
  mode?: number;
  /** VAD engine vendor. */
  vendor?: 'webrtc' | 'silero';
  /** Silero speech detection confidence threshold (0-1). */
  threshold?: number;
  /** Padding in ms before/after detected speech. */
  speechPadMs?: number;
}

/** Bidirectional audio streaming configuration. */
export interface BidirectionalAudio {
  /** Enable bidirectional audio. */
  enabled?: boolean;
  /** Stream audio continuously. */
  streaming?: boolean;
  /** Audio sample rate in Hz. */
  sampleRate?: number;
}

/** Filler noise configuration for processing pauses. */
export interface FillerNoise {
  /** Enable filler noise. */
  enable: boolean;
  /** URL of the audio file to play. */
  url?: string;
  /** Seconds to wait before starting filler noise. */
  startDelaySecs?: number;
}

/** Configuration for handling slow actionHook responses. */
export interface ActionHookDelayAction {
  /** Enable delay handling. */
  enabled?: boolean;
  /** Seconds before executing delay actions. */
  noResponseTimeout?: number;
  /** Total seconds before giving up. */
  noResponseGiveUpTimeout?: number;
  /** Times to retry delay actions. */
  retries?: number;
  /** Verbs to execute while waiting. */
  actions?: Record<string, unknown>[];
  /** Verbs to execute if webhook never responds. */
  giveUpActions?: Record<string, unknown>[];
}
