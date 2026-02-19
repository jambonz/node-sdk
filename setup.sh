#!/bin/bash

# This script recreates the agent-toolkit directory structure
# Run from the project root directory

cat > 'AGENTS.md' << 'ENDOFFILE'
# jambonz Agent Toolkit

jambonz is an open-source CPaaS (Communications Platform as a Service) for building voice and messaging applications. It handles telephony infrastructure — SIP, carriers, phone numbers, media processing — so you can focus on application logic.

## How jambonz Applications Work

A jambonz application controls phone calls by returning **arrays of verbs** — JSON instructions that execute sequentially. The runtime processes each verb in order: speak text, play audio, collect input, dial a number, connect to an AI model, etc.

### The Webhook Lifecycle

1. An incoming call arrives. jambonz invokes your application's URL with call details (caller, called number, SIP headers, etc.).
2. Your application returns a JSON array of verbs.
3. jambonz executes the verbs in order.
4. When a verb with an `actionHook` completes (e.g. `gather` collects speech input), jambonz invokes the actionHook URL with the result.
5. The actionHook response (a new verb array) replaces the remaining verb stack.
6. This continues until the call ends or a `hangup` verb is executed.

### Transport Modes

jambonz supports two transport modes for delivering verb arrays:

- **Webhook (HTTP)**: Your server receives HTTP POST requests with call data and returns JSON verb arrays in the response body. Stateless and simple. Good for IVR menus, call routing, and straightforward flows.
- **WebSocket**: Your server maintains a persistent websocket connection with jambonz. Verb arrays are sent as JSON messages in both directions. Required for real-time features like LLM conversations, audio streaming, and event-driven flows.

The verb schemas and JSON structure are identical in both modes. The difference is the transport.

### When to Use Which

- **Webhook**: Simple IVR, call routing, voicemail, basic gather-and-respond patterns.
- **WebSocket**: LLM-powered voice agents, real-time audio streaming, complex conversational flows, anything requiring bidirectional communication.

## Schema

The complete verb schema is at `schema/jambonz-app.schema.json`. This is a JSON Schema (draft 2020-12) that defines the structure of a jambonz application.

Individual verb schemas are in `schema/verbs/`. Shared component types (synthesizer, recognizer, target, etc.) are in `schema/components/`.

## Core Verbs

### Audio & Speech
- **say** — Speak text using TTS. Supports SSML, streaming, multiple voices.
- **play** — Play an audio file from a URL.
- **gather** — Collect speech (STT) and/or DTMF input. The workhorse for interactive menus and voice input.

### AI & Real-time
- **llm** — Connect the caller to an LLM for real-time voice conversation. Handles the full STT→LLM→TTS pipeline.
- **pipeline** — Higher-level voice AI pipeline with integrated turn detection.
- **listen** / **stream** — Stream raw audio to a websocket endpoint for custom processing.
- **transcribe** — Real-time call transcription sent to a webhook.

### Call Control
- **dial** — Place an outbound call and bridge it to the current caller.
- **conference** — Multi-party conference room.
- **enqueue** / **dequeue** — Call queuing.
- **hangup** — End the call.
- **redirect** — Transfer control to a different webhook.
- **pause** — Wait for a specified duration.

### SIP
- **sip:decline** — Reject an incoming call with a SIP error.
- **sip:request** — Send a SIP request within the dialog.
- **sip:refer** — Transfer the call via SIP REFER.

### Utility
- **config** — Set session-level defaults (TTS vendor/voice, STT vendor, VAD, etc.).
- **tag** — Attach metadata to the call.
- **dtmf** — Send DTMF tones.
- **dub** — Mix auxiliary audio tracks into the call.
- **message** — Send SMS/MMS.
- **alert** — Send a SIP 180 with Alert-Info.
- **answer** — Explicitly answer the call.
- **leave** — Leave a conference or queue.

## Common Patterns

### Simple Greeting and Gather
```json
[
  { "verb": "say", "text": "Welcome. Press 1 for sales, 2 for support." },
  { "verb": "gather", "input": ["digits"], "numDigits": 1, "actionHook": "/menu" }
]
```

### LLM Voice Agent
```json
[
  {
    "verb": "config",
    "synthesizer": { "vendor": "elevenlabs", "voice": "Rachel" },
    "recognizer": { "vendor": "deepgram", "language": "en-US" }
  },
  {
    "verb": "llm",
    "vendor": "openai",
    "model": "gpt-4o",
    "llmOptions": {
      "messages": [{ "role": "system", "content": "You are a helpful assistant." }]
    },
    "actionHook": "/llm-done",
    "toolHook": "/tool-call"
  }
]
```

### Dial with Fallback
```json
[
  { "verb": "say", "text": "Connecting you now." },
  {
    "verb": "dial",
    "target": [{ "type": "phone", "number": "+15085551212" }],
    "answerOnBridge": true,
    "timeout": 30,
    "actionHook": "/dial-result"
  },
  { "verb": "say", "text": "The agent is unavailable. Goodbye." },
  { "verb": "hangup" }
]
```

### Call Queue
```json
[
  { "verb": "say", "text": "All agents are busy. You are in the queue." },
  {
    "verb": "enqueue",
    "name": "support",
    "waitHook": "/hold-music",
    "actionHook": "/queue-exit"
  }
]
```

## REST API

jambonz provides a REST API for platform management: creating accounts, provisioning phone numbers, configuring carriers, managing applications, and controlling active calls. The API client is available in the SDK at `@jambonz/sdk/api`.

## Examples

Complete working examples are in the `examples/` directory, covering common use cases from simple IVR to LLM-powered voice agents. Each example is a runnable project with its own README.

## Key Concepts

- **Verb**: A JSON object with a `verb` property that tells jambonz what to do. Verbs execute sequentially.
- **ActionHook**: A webhook URL that jambonz calls when a verb completes. Returns the next verb array.
- **Synthesizer**: TTS configuration (vendor, voice, language).
- **Recognizer**: STT configuration (vendor, language, model).
- **Target**: A call destination (phone number, SIP URI, registered user, Teams user).
- **Session**: A single phone call. Session-level settings (set via `config`) persist across verbs.
ENDOFFILE

mkdir -p examples/hello-world
cat > 'examples/hello-world/README.md' << 'ENDOFFILE'
# Hello World

The simplest jambonz application: answer a call, greet the caller, and hang up.

## What It Demonstrates
- Basic verb array structure
- The `say` verb
- The `hangup` verb

## Webhook Version (`app.js`)
A minimal Express server that returns a verb array.

## WebSocket Version (`ws-app.js`)
A minimal websocket server that sends a verb array on connection.
ENDOFFILE

mkdir -p examples/hello-world
cat > 'examples/hello-world/app.js' << 'ENDOFFILE'
const express = require('express');
const app = express();
app.use(express.json());

// jambonz calls this URL when a call arrives
app.post('/incoming', (req, res) => {
  console.log(`Incoming call from ${req.body.from} to ${req.body.to}`);

  res.json([
    {
      verb: 'say',
      text: 'Hello! Welcome to our service. Thank you for calling. Goodbye!'
    },
    {
      verb: 'hangup'
    }
  ]);
});

app.listen(3000, () => console.log('jambonz app listening on port 3000'));
ENDOFFILE

mkdir -p examples/ivr-menu
cat > 'examples/ivr-menu/README.md' << 'ENDOFFILE'
# IVR Menu

A classic interactive voice response menu that routes callers based on DTMF or speech input.

## What It Demonstrates
- The `gather` verb with nested `say` prompt
- Handling DTMF digit input
- Handling speech input
- Routing to different handlers based on user input
- Using `actionHook` to receive gather results and return new verbs
- Fallback when no input is received (timeout)
ENDOFFILE

mkdir -p examples/ivr-menu
cat > 'examples/ivr-menu/app.js' << 'ENDOFFILE'
const express = require('express');
const app = express();
app.use(express.json());

// Initial call handler — present the menu
app.post('/incoming', (req, res) => {
  res.json([
    {
      verb: 'gather',
      input: ['speech', 'digits'],
      actionHook: '/menu-selection',
      numDigits: 1,
      timeout: 10,
      say: {
        text: 'Welcome to Acme Corp. Press 1 or say sales for sales. Press 2 or say support for technical support. Press 3 or say billing for billing.'
      }
    },
    // Fallback if no input received
    {
      verb: 'say',
      text: 'We did not receive any input. Goodbye.'
    },
    {
      verb: 'hangup'
    }
  ]);
});

// Handle the menu selection
app.post('/menu-selection', (req, res) => {
  const { digits, speech } = req.body;
  const transcript = speech?.alternatives?.[0]?.transcript?.toLowerCase() || '';

  let department;
  if (digits === '1' || transcript.includes('sales')) {
    department = 'sales';
  } else if (digits === '2' || transcript.includes('support')) {
    department = 'support';
  } else if (digits === '3' || transcript.includes('billing')) {
    department = 'billing';
  }

  if (department) {
    res.json([
      {
        verb: 'say',
        text: `Connecting you to ${department}. Please hold.`
      },
      {
        verb: 'dial',
        target: [{ type: 'user', name: `${department}-queue` }],
        answerOnBridge: true,
        timeout: 30,
        actionHook: '/dial-result'
      },
      {
        verb: 'say',
        text: `Sorry, ${department} is not available right now. Please try again later.`
      },
      {
        verb: 'hangup'
      }
    ]);
  } else {
    // Unrecognized input — replay the menu
    res.json([
      {
        verb: 'say',
        text: 'Sorry, I didn\'t understand that.'
      },
      {
        verb: 'redirect',
        actionHook: '/incoming'
      }
    ]);
  }
});

// Handle dial result
app.post('/dial-result', (req, res) => {
  console.log(`Call ended: ${JSON.stringify(req.body)}`);
  res.json([{ verb: 'hangup' }]);
});

app.listen(3000, () => console.log('IVR app listening on port 3000'));
ENDOFFILE

mkdir -p examples/voice-agent
cat > 'examples/voice-agent/README.md' << 'ENDOFFILE'
# LLM Voice Agent

A conversational AI voice agent powered by an LLM. The caller speaks naturally and the AI responds in real time.

## What It Demonstrates
- The `config` verb to set session-level TTS and STT defaults
- The `llm` verb for real-time voice AI conversation
- Tool/function calling with `toolHook`
- Using filler noise while the LLM is processing
- Handling the end of the LLM conversation

## Prerequisites
- An OpenAI API key (or substitute your preferred LLM vendor)
- Deepgram and ElevenLabs credentials configured in jambonz (or substitute your preferred STT/TTS vendors)
ENDOFFILE

mkdir -p examples/voice-agent
cat > 'examples/voice-agent/app.js' << 'ENDOFFILE'
const express = require('express');
const app = express();
app.use(express.json());

const SYSTEM_PROMPT = `You are a helpful customer service agent for Acme Corp.
You help customers with order inquiries, returns, and general questions.
Be concise and friendly. Keep responses under 2-3 sentences when possible.
If you need to look up an order, use the lookupOrder function.
If the customer wants to speak to a human, use the transferToAgent function.`;

// Initial call handler
app.post('/incoming', (req, res) => {
  res.json([
    {
      verb: 'config',
      synthesizer: {
        vendor: 'elevenlabs',
        voice: 'Rachel',
        language: 'en-US'
      },
      recognizer: {
        vendor: 'deepgram',
        language: 'en-US',
        deepgramOptions: { model: 'nova-2', smartFormatting: true }
      },
      fillerNoise: {
        enable: true,
        url: 'https://example.com/sounds/typing.wav',
        startDelaySecs: 2
      }
    },
    {
      verb: 'llm',
      vendor: 'openai',
      model: 'gpt-4o',
      auth: { apiKey: process.env.OPENAI_API_KEY },
      llmOptions: {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT }
        ],
        temperature: 0.7,
        tools: [
          {
            type: 'function',
            function: {
              name: 'lookupOrder',
              description: 'Look up an order by order number to get status, tracking, and details',
              parameters: {
                type: 'object',
                properties: {
                  orderNumber: { type: 'string', description: 'The order number (e.g. ORD-12345)' }
                },
                required: ['orderNumber']
              }
            }
          },
          {
            type: 'function',
            function: {
              name: 'transferToAgent',
              description: 'Transfer the call to a human agent',
              parameters: {
                type: 'object',
                properties: {
                  reason: { type: 'string', description: 'Why the caller wants a human agent' }
                },
                required: ['reason']
              }
            }
          }
        ]
      },
      actionHook: '/llm-complete',
      toolHook: '/tool-call'
    }
  ]);
});

// Handle tool/function calls from the LLM
app.post('/tool-call', (req, res) => {
  const { name, args } = req.body.tool;

  switch (name) {
    case 'lookupOrder': {
      // In production, query your order database here
      const order = {
        orderNumber: args.orderNumber,
        status: 'shipped',
        trackingNumber: 'TRK-98765',
        estimatedDelivery: '2026-02-20'
      };
      res.json({ result: JSON.stringify(order) });
      break;
    }

    case 'transferToAgent': {
      // Return verbs to transfer the call
      res.json({
        result: 'Transferring to agent',
        verbs: [
          { verb: 'say', text: 'Let me connect you to a human agent. Please hold.' },
          {
            verb: 'dial',
            target: [{ type: 'user', name: 'support-queue' }],
            answerOnBridge: true,
            timeout: 60,
            actionHook: '/dial-result'
          },
          { verb: 'say', text: 'Sorry, no agents are available. Please try again later.' },
          { verb: 'hangup' }
        ]
      });
      break;
    }

    default:
      res.json({ result: 'Unknown tool' });
  }
});

// Handle LLM conversation end
app.post('/llm-complete', (req, res) => {
  console.log('LLM conversation ended:', req.body.reason);
  res.json([
    { verb: 'say', text: 'Thank you for calling Acme Corp. Goodbye!' },
    { verb: 'hangup' }
  ]);
});

app.post('/dial-result', (req, res) => {
  res.json([{ verb: 'hangup' }]);
});

app.listen(3000, () => console.log('Voice agent listening on port 3000'));
ENDOFFILE

mkdir -p schema/components
cat > 'schema/components/actionHook.schema.json' << 'ENDOFFILE'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jambonz.org/schema/components/actionHook",
  "title": "ActionHook",
  "description": "A webhook or websocket callback that jambonz invokes during call processing. Most jambonz verbs use actionHooks to report results (e.g. speech recognition results from 'gather') and to receive the next set of verbs to execute. Can be specified as a simple URL string or as an object with additional options.",
  "oneOf": [
    {
      "type": "string",
      "format": "uri",
      "description": "A URL to invoke. For webhook applications this is an HTTP(S) URL. For websocket applications this is typically a relative path or event name.",
      "examples": ["https://myapp.example.com/gather-result", "/gather-result"]
    },
    {
      "type": "object",
      "description": "A hook specification with URL and additional options.",
      "properties": {
        "url": {
          "type": "string",
          "format": "uri",
          "description": "The URL to invoke."
        },
        "method": {
          "type": "string",
          "description": "The HTTP method to use. Only applies to webhook applications.",
          "enum": ["GET", "POST"],
          "default": "POST"
        },
        "basicAuth": {
          "$ref": "auth",
          "description": "Basic authentication credentials to include in the request."
        }
      },
      "required": ["url"]
    }
  ]
}
ENDOFFILE

mkdir -p schema/components
cat > 'schema/components/actionHookDelayAction.schema.json' << 'ENDOFFILE'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jambonz.org/schema/components/actionHookDelayAction",
  "title": "ActionHookDelayAction",
  "description": "Configuration for what to do when an actionHook (webhook) takes a long time to respond. Allows playing interim content (e.g. 'please wait' messages, hold music) while waiting for the webhook response, with configurable retry and give-up behavior.",
  "type": "object",
  "properties": {
    "enabled": {
      "type": "boolean",
      "description": "Whether to enable delay handling for actionHooks."
    },
    "noResponseTimeout": {
      "type": "number",
      "description": "Time in seconds to wait before executing the delay actions. If the webhook responds before this timeout, the delay actions are skipped.",
      "examples": [3, 5]
    },
    "noResponseGiveUpTimeout": {
      "type": "number",
      "description": "Total time in seconds to wait for a webhook response before giving up and executing the giveUpActions.",
      "examples": [30, 60]
    },
    "retries": {
      "type": "number",
      "description": "Number of times to retry the delay actions while still waiting for the webhook response."
    },
    "actions": {
      "type": "array",
      "description": "An array of jambonz verbs to execute while waiting for the webhook response. Typically 'say' or 'play' verbs with messages like 'please hold'.",
      "items": { "type": "object" }
    },
    "giveUpActions": {
      "type": "array",
      "description": "An array of jambonz verbs to execute if the webhook never responds within the giveUpTimeout. Typically an error message and/or hangup.",
      "items": { "type": "object" }
    }
  }
}
ENDOFFILE

mkdir -p schema/components
cat > 'schema/components/auth.schema.json' << 'ENDOFFILE'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jambonz.org/schema/components/auth",
  "title": "Auth",
  "description": "Basic authentication credentials, used for authenticating with external services such as websocket endpoints or SIP registrars.",
  "type": "object",
  "properties": {
    "username": {
      "type": "string",
      "description": "The username for authentication."
    },
    "password": {
      "type": "string",
      "description": "The password for authentication."
    }
  },
  "required": ["username", "password"]
}
ENDOFFILE

mkdir -p schema/components
cat > 'schema/components/bidirectionalAudio.schema.json' << 'ENDOFFILE'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jambonz.org/schema/components/bidirectionalAudio",
  "title": "BidirectionalAudio",
  "description": "Configuration for bidirectional audio streaming over a websocket connection. When enabled, the remote websocket endpoint can send audio back to jambonz to be played to the caller.",
  "type": "object",
  "properties": {
    "enabled": {
      "type": "boolean",
      "description": "Whether to enable bidirectional audio on the websocket connection."
    },
    "streaming": {
      "type": "boolean",
      "description": "If true, audio is streamed continuously rather than sent as complete messages."
    },
    "sampleRate": {
      "type": "number",
      "description": "The sample rate in Hz for bidirectional audio.",
      "examples": [8000, 16000, 24000]
    }
  }
}
ENDOFFILE

mkdir -p schema/components
cat > 'schema/components/fillerNoise.schema.json' << 'ENDOFFILE'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jambonz.org/schema/components/fillerNoise",
  "title": "FillerNoise",
  "description": "Configuration for playing background filler noise (e.g. keyboard typing, hold music) while the application is processing and the caller would otherwise hear silence. Commonly used during LLM response generation to indicate the system is working.",
  "type": "object",
  "properties": {
    "enable": {
      "type": "boolean",
      "description": "Whether to enable filler noise."
    },
    "url": {
      "type": "string",
      "format": "uri",
      "description": "URL of the audio file to play as filler noise. Should be a short, loopable audio clip.",
      "examples": ["https://example.com/sounds/typing.wav"]
    },
    "startDelaySecs": {
      "type": "number",
      "description": "Number of seconds to wait before starting filler noise. Prevents filler noise from playing during brief processing pauses.",
      "examples": [1, 2]
    }
  },
  "required": ["enable"]
}
ENDOFFILE

mkdir -p schema/components
cat > 'schema/components/recognizer.schema.json' << 'ENDOFFILE'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jambonz.org/schema/components/recognizer",
  "title": "Recognizer",
  "description": "Configuration for speech-to-text recognition. Specifies the STT vendor, language, and vendor-specific options. Can be set at the session level via the 'config' verb or overridden per-verb (e.g. on 'gather').",
  "type": "object",
  "properties": {
    "vendor": {
      "type": "string",
      "description": "The STT vendor to use. Must match a vendor configured in the jambonz platform.",
      "examples": ["google", "aws", "microsoft", "deepgram", "nuance", "ibm", "nvidia", "soniox", "cobalt", "assemblyai", "speechmatics", "openai", "houndify", "gladia", "elevenlabs", "verbio", "custom"]
    },
    "label": {
      "type": "string",
      "description": "An optional label identifying a specific credential set for this vendor. Used when multiple credentials are configured for the same vendor."
    },
    "language": {
      "type": "string",
      "description": "The language code for speech recognition, in BCP-47 format.",
      "examples": ["en-US", "en-GB", "es-ES", "fr-FR"]
    },
    "fallbackVendor": {
      "type": "string",
      "description": "A backup STT vendor to use if the primary vendor fails or is unavailable."
    },
    "fallbackLabel": {
      "type": "string",
      "description": "Credential label for the fallback vendor."
    },
    "fallbackLanguage": {
      "type": "string",
      "description": "Language code to use with the fallback vendor."
    },
    "vad": {
      "$ref": "vad",
      "description": "Voice activity detection settings for this recognizer."
    },
    "hints": {
      "type": "array",
      "items": { "type": "string" },
      "description": "An array of words or phrases that the recognizer should favor. Use this to improve accuracy for domain-specific terminology, product names, or proper nouns.",
      "examples": [["jambonz", "drachtio", "SIP", "WebRTC"]]
    },
    "hintsBoost": {
      "type": "number",
      "description": "A boost factor for hint words. Higher values increase the likelihood of recognizing hinted words. Vendor-specific range."
    },
    "altLanguages": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Additional languages the recognizer should listen for simultaneously. Enables multilingual recognition.",
      "examples": [["es-ES", "fr-FR"]]
    },
    "profanityFilter": {
      "type": "boolean",
      "description": "If true, the vendor will attempt to filter profanity from transcription results."
    },
    "interim": {
      "type": "boolean",
      "description": "If true, return interim (partial) transcription results as they become available, before the utterance is complete."
    },
    "singleUtterance": {
      "type": "boolean",
      "description": "If true, recognition stops after the first complete utterance is detected."
    },
    "dualChannel": {
      "type": "boolean",
      "description": "If true, send separate audio channels for each call leg (caller and callee) to the recognizer."
    },
    "separateRecognitionPerChannel": {
      "type": "boolean",
      "description": "If true, perform independent recognition on each audio channel. Requires dualChannel."
    },
    "punctuation": {
      "type": "boolean",
      "description": "If true, enable automatic punctuation in transcription results."
    },
    "enhancedModel": {
      "type": "boolean",
      "description": "If true, use an enhanced (premium) recognition model if available from the vendor."
    },
    "words": {
      "type": "boolean",
      "description": "If true, include word-level timing information in transcription results."
    },
    "diarization": {
      "type": "boolean",
      "description": "If true, enable speaker diarization to identify different speakers in the audio."
    },
    "diarizationMinSpeakers": {
      "type": "number",
      "description": "Minimum number of speakers expected. Used to guide the diarization algorithm."
    },
    "diarizationMaxSpeakers": {
      "type": "number",
      "description": "Maximum number of speakers expected. Used to guide the diarization algorithm."
    },
    "interactionType": {
      "type": "string",
      "description": "A hint to the recognizer about the type of interaction, which can improve accuracy.",
      "enum": ["unspecified", "discussion", "presentation", "phone_call", "voicemail", "voice_search", "voice_command", "dictation"]
    },
    "naicsCode": {
      "type": "number",
      "description": "North American Industry Classification System code. Some vendors use this to improve domain-specific accuracy."
    },
    "identifyChannels": {
      "type": "boolean",
      "description": "If true, identify and label which channel each transcription segment came from."
    },
    "vocabularyName": {
      "type": "string",
      "description": "Name of a custom vocabulary resource configured at the vendor for improved recognition of specialized terms."
    },
    "vocabularyFilterName": {
      "type": "string",
      "description": "Name of a vocabulary filter configured at the vendor for masking or removing specific words."
    },
    "filterMethod": {
      "type": "string",
      "description": "How filtered vocabulary words should be handled in the transcript.",
      "enum": ["remove", "mask", "tag"]
    },
    "model": {
      "type": "string",
      "description": "The specific recognition model to use. Model names are vendor-specific.",
      "examples": ["latest_long", "phone_call", "nova-2", "chirp"]
    },
    "outputFormat": {
      "type": "string",
      "description": "The level of detail in recognition results.",
      "enum": ["simple", "detailed"]
    },
    "profanityOption": {
      "type": "string",
      "description": "How profanity should be handled in results.",
      "enum": ["masked", "removed", "raw"]
    },
    "requestSnr": {
      "type": "boolean",
      "description": "If true, request signal-to-noise ratio information in results."
    },
    "initialSpeechTimeoutMs": {
      "type": "number",
      "description": "Time in milliseconds to wait for initial speech before timing out.",
      "examples": [5000]
    },
    "azureServiceEndpoint": {
      "type": "string",
      "description": "Custom Azure Speech Services endpoint URL. Only applies when vendor is 'microsoft'."
    },
    "azureSttEndpointId": {
      "type": "string",
      "description": "Azure custom speech endpoint ID for using a custom-trained model. Only applies when vendor is 'microsoft'."
    },
    "asrDtmfTerminationDigit": {
      "type": "string",
      "description": "A DTMF digit that terminates speech recognition when pressed.",
      "examples": ["#"]
    },
    "asrTimeout": {
      "type": "number",
      "description": "Maximum time in seconds to wait for a complete recognition result."
    },
    "fastRecognitionTimeout": {
      "type": "number",
      "description": "Timeout in seconds for fast recognition mode. Shorter timeout for quick responses."
    },
    "minConfidence": {
      "type": "number",
      "description": "Minimum confidence score (0-1) required to accept a recognition result. Results below this threshold are discarded.",
      "minimum": 0,
      "maximum": 1
    },
    "deepgramOptions": {
      "type": "object",
      "description": "Deepgram-specific recognition options. Only applies when vendor is 'deepgram'. See Deepgram API documentation for available options.",
      "additionalProperties": true
    },
    "googleOptions": {
      "type": "object",
      "description": "Google Speech-to-Text specific options. Only applies when vendor is 'google'.",
      "additionalProperties": true
    },
    "awsOptions": {
      "type": "object",
      "description": "AWS Transcribe specific options. Only applies when vendor is 'aws'.",
      "additionalProperties": true
    },
    "azureOptions": {
      "type": "object",
      "description": "Azure Speech Services specific options. Only applies when vendor is 'microsoft'.",
      "additionalProperties": true
    },
    "nuanceOptions": {
      "type": "object",
      "description": "Nuance-specific recognition options. Only applies when vendor is 'nuance'.",
      "additionalProperties": true
    },
    "ibmOptions": {
      "type": "object",
      "description": "IBM Watson Speech-to-Text specific options. Only applies when vendor is 'ibm'.",
      "additionalProperties": true
    },
    "nvidiaOptions": {
      "type": "object",
      "description": "NVIDIA Riva specific options. Only applies when vendor is 'nvidia'.",
      "additionalProperties": true
    },
    "sonioxOptions": {
      "type": "object",
      "description": "Soniox-specific recognition options. Only applies when vendor is 'soniox'.",
      "additionalProperties": true
    },
    "cobaltOptions": {
      "type": "object",
      "description": "Cobalt-specific recognition options. Only applies when vendor is 'cobalt'.",
      "additionalProperties": true
    },
    "assemblyAiOptions": {
      "type": "object",
      "description": "AssemblyAI-specific recognition options. Only applies when vendor is 'assemblyai'.",
      "additionalProperties": true
    },
    "speechmaticsOptions": {
      "type": "object",
      "description": "Speechmatics-specific recognition options. Only applies when vendor is 'speechmatics'.",
      "additionalProperties": true
    },
    "openaiOptions": {
      "type": "object",
      "description": "OpenAI Whisper/Realtime specific options. Only applies when vendor is 'openai'.",
      "additionalProperties": true
    },
    "houndifyOptions": {
      "type": "object",
      "description": "Houndify-specific recognition options. Only applies when vendor is 'houndify'.",
      "additionalProperties": true
    },
    "gladiaOptions": {
      "type": "object",
      "description": "Gladia-specific recognition options. Only applies when vendor is 'gladia'.",
      "additionalProperties": true
    },
    "elevenlabsOptions": {
      "type": "object",
      "description": "ElevenLabs-specific recognition options. Only applies when vendor is 'elevenlabs'.",
      "additionalProperties": true
    },
    "verbioOptions": {
      "type": "object",
      "description": "Verbio-specific recognition options. Only applies when vendor is 'verbio'.",
      "additionalProperties": true
    },
    "customOptions": {
      "type": "object",
      "description": "Options for custom STT vendors. Only applies when vendor is 'custom'.",
      "additionalProperties": true
    }
  },
  "required": ["vendor"],
  "examples": [
    {
      "vendor": "deepgram",
      "language": "en-US",
      "deepgramOptions": {
        "model": "nova-2",
        "smartFormatting": true,
        "endpointing": 500
      }
    },
    {
      "vendor": "google",
      "language": "en-US",
      "hints": ["jambonz", "drachtio"],
      "punctuation": true,
      "enhancedModel": true
    }
  ]
}
ENDOFFILE

mkdir -p schema/components
cat > 'schema/components/synthesizer.schema.json' << 'ENDOFFILE'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jambonz.org/schema/components/synthesizer",
  "title": "Synthesizer",
  "description": "Configuration for text-to-speech synthesis. Specifies the TTS vendor, voice, language, and vendor-specific options. Can be set at the session level via the 'config' verb or overridden per-verb (e.g. on 'say').",
  "type": "object",
  "properties": {
    "vendor": {
      "type": "string",
      "description": "The TTS vendor to use. Must match a vendor configured in the jambonz platform.",
      "examples": ["google", "aws", "microsoft", "elevenlabs", "cartesia", "deepgram", "ibm", "nuance", "nvidia", "wellsaid", "whisper", "verbio", "custom"]
    },
    "label": {
      "type": "string",
      "description": "An optional label identifying a specific credential set for this vendor. Used when multiple credentials are configured for the same vendor on the jambonz platform."
    },
    "language": {
      "type": "string",
      "description": "The language code for speech synthesis, in BCP-47 format.",
      "examples": ["en-US", "en-GB", "es-ES", "fr-FR", "de-DE"]
    },
    "voice": {
      "oneOf": [
        { "type": "string" },
        { "type": "object", "additionalProperties": true }
      ],
      "description": "The voice to use for synthesis. Typically a string voice name (e.g. 'en-US-Wavenet-D' for Google, 'Joanna' for AWS Polly). Some vendors accept an object for more complex voice configuration.",
      "examples": ["en-US-Wavenet-D", "Joanna", "Rachel"]
    },
    "fallbackVendor": {
      "type": "string",
      "description": "A backup TTS vendor to use if the primary vendor fails or is unavailable."
    },
    "fallbackLabel": {
      "type": "string",
      "description": "Credential label for the fallback vendor."
    },
    "fallbackLanguage": {
      "type": "string",
      "description": "Language code to use with the fallback vendor."
    },
    "fallbackVoice": {
      "oneOf": [
        { "type": "string" },
        { "type": "object", "additionalProperties": true }
      ],
      "description": "Voice to use with the fallback vendor."
    },
    "engine": {
      "type": "string",
      "description": "The synthesis engine tier to use. Availability depends on the vendor.",
      "enum": ["standard", "neural", "generative", "long-form"]
    },
    "gender": {
      "type": "string",
      "description": "Preferred voice gender. Used by some vendors (e.g. Google) when a specific voice is not specified.",
      "enum": ["MALE", "FEMALE", "NEUTRAL"]
    },
    "options": {
      "type": "object",
      "description": "Vendor-specific options passed through to the TTS provider. The structure depends on the vendor being used.",
      "additionalProperties": true
    }
  },
  "required": ["vendor"],
  "examples": [
    {
      "vendor": "google",
      "language": "en-US",
      "voice": "en-US-Wavenet-D"
    },
    {
      "vendor": "elevenlabs",
      "voice": "Rachel",
      "options": {
        "model_id": "eleven_turbo_v2",
        "stability": 0.5,
        "similarity_boost": 0.75
      }
    }
  ]
}
ENDOFFILE

mkdir -p schema/components
cat > 'schema/components/target.schema.json' << 'ENDOFFILE'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jambonz.org/schema/components/target",
  "title": "Target",
  "description": "A call target for the 'dial' verb. Specifies who or what to connect the call to: a phone number (PSTN), a SIP endpoint, a registered user, or a Microsoft Teams user.",
  "type": "object",
  "properties": {
    "type": {
      "type": "string",
      "description": "The type of target to dial.",
      "enum": ["phone", "sip", "user", "teams"]
    },
    "number": {
      "type": "string",
      "description": "The phone number to dial. Required when type is 'phone'. Use E.164 format.",
      "examples": ["+15085551212"]
    },
    "sipUri": {
      "type": "string",
      "description": "The SIP URI to dial. Required when type is 'sip'.",
      "examples": ["sip:alice@example.com"]
    },
    "name": {
      "type": "string",
      "description": "The registered user name to dial. Required when type is 'user'. Also used as the display name for SIP targets."
    },
    "tenant": {
      "type": "string",
      "description": "The Microsoft Teams tenant ID. Required when type is 'teams'."
    },
    "trunk": {
      "type": "string",
      "description": "The SIP trunk to use for the outbound call. When specified, overrides the default carrier routing."
    },
    "confirmHook": {
      "oneOf": [
        { "type": "string", "format": "uri" },
        { "$ref": "actionHook" }
      ],
      "description": "A webhook to invoke when the target answers, before connecting the call. Use this to screen calls, play a whisper prompt, or require the target to press a key to accept."
    },
    "method": {
      "type": "string",
      "description": "The HTTP method to use when invoking the confirmHook.",
      "enum": ["GET", "POST"],
      "default": "POST"
    },
    "headers": {
      "type": "object",
      "description": "Custom SIP headers to include on the outbound INVITE. Keys are header names, values are header values.",
      "additionalProperties": { "type": "string" }
    },
    "from": {
      "type": "object",
      "description": "Override the From header on the outbound SIP INVITE.",
      "properties": {
        "user": {
          "type": "string",
          "description": "The user part of the SIP From URI."
        },
        "host": {
          "type": "string",
          "description": "The host part of the SIP From URI."
        }
      }
    },
    "auth": {
      "$ref": "auth",
      "description": "SIP authentication credentials for the outbound call, if the far end requires digest auth."
    },
    "vmail": {
      "type": "boolean",
      "description": "If true, follow the call into voicemail if the target does not answer."
    },
    "overrideTo": {
      "type": "string",
      "description": "Override the Request-URI on the outbound SIP INVITE. Useful when the Request-URI needs to differ from the To header."
    },
    "proxy": {
      "type": "string",
      "description": "A SIP proxy to route the outbound call through, specified as a SIP URI.",
      "examples": ["sip:proxy.example.com"]
    }
  },
  "required": ["type"],
  "examples": [
    {
      "type": "phone",
      "number": "+15085551212"
    },
    {
      "type": "sip",
      "sipUri": "sip:alice@example.com"
    },
    {
      "type": "user",
      "name": "bob"
    },
    {
      "type": "teams",
      "number": "+15085551212",
      "tenant": "a]b]c]d]e"
    }
  ]
}
ENDOFFILE

mkdir -p schema/components
cat > 'schema/components/vad.schema.json' << 'ENDOFFILE'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jambonz.org/schema/components/vad",
  "title": "VAD",
  "description": "Voice Activity Detection configuration. Controls how jambonz detects the presence or absence of speech on the audio channel. Used to determine speech start/end boundaries for recognition and barge-in.",
  "type": "object",
  "properties": {
    "enable": {
      "type": "boolean",
      "description": "Whether to enable voice activity detection."
    },
    "voiceMs": {
      "type": "number",
      "description": "Duration of voice activity (in milliseconds) required before speech is considered to have started.",
      "examples": [250]
    },
    "silenceMs": {
      "type": "number",
      "description": "Duration of silence (in milliseconds) required before speech is considered to have ended.",
      "examples": [1000]
    },
    "strategy": {
      "type": "string",
      "description": "The VAD strategy to use."
    },
    "mode": {
      "type": "number",
      "description": "WebRTC VAD aggressiveness mode (0-3). Higher values are more aggressive at filtering non-speech. Only applies when vendor is 'webrtc'.",
      "minimum": 0,
      "maximum": 3
    },
    "vendor": {
      "type": "string",
      "description": "The VAD engine to use.",
      "enum": ["webrtc", "silero"]
    },
    "threshold": {
      "type": "number",
      "description": "Speech detection confidence threshold for Silero VAD. Value between 0 and 1, where higher values require greater confidence. Only applies when vendor is 'silero'.",
      "minimum": 0,
      "maximum": 1
    },
    "speechPadMs": {
      "type": "number",
      "description": "Padding in milliseconds added before and after detected speech segments. Prevents clipping utterance boundaries. Only applies when vendor is 'silero'."
    }
  }
}
ENDOFFILE

mkdir -p schema
cat > 'schema/jambonz-app.schema.json' << 'ENDOFFILE'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jambonz.org/schema/jambonz-app",
  "title": "jambonz Application",
  "description": "A jambonz application is an array of verbs that are executed sequentially to control a phone call. Each verb performs an action: speaking text, playing audio, collecting input, dialing a number, connecting to an AI model, etc. When a webhook (actionHook) is invoked, it must return a new verb array to continue call processing.\n\nThe execution model is simple: verbs execute one after another, top to bottom. When a verb with an actionHook completes (e.g. gather collects input), the actionHook is called and its response replaces the remaining verb stack. If the verb array is exhausted without a hangup, the call is terminated.\n\nThere are two transport modes for delivering verb arrays to jambonz:\n- **Webhook**: Your HTTP server receives POST/GET requests with call data and returns JSON verb arrays in the response body.\n- **WebSocket**: Your server maintains a persistent websocket connection with jambonz and sends/receives verb arrays as JSON messages. Required for real-time features like LLM conversations.\n\nThe verb schemas and JSON structure are identical regardless of transport mode.",
  "type": "array",
  "items": {
    "$ref": "#/$defs/Verb"
  },
  "minItems": 1,
  "$defs": {
    "Verb": {
      "oneOf": [
        { "$ref": "verbs/answer" },
        { "$ref": "verbs/alert" },
        { "$ref": "verbs/config" },
        { "$ref": "verbs/say" },
        { "$ref": "verbs/play" },
        { "$ref": "verbs/gather" },
        { "$ref": "verbs/dial" },
        { "$ref": "verbs/listen" },
        { "$ref": "verbs/stream" },
        { "$ref": "verbs/llm" },
        { "$ref": "verbs/pipeline" },
        { "$ref": "verbs/conference" },
        { "$ref": "verbs/transcribe" },
        { "$ref": "verbs/enqueue" },
        { "$ref": "verbs/dequeue" },
        { "$ref": "verbs/dtmf" },
        { "$ref": "verbs/dub" },
        { "$ref": "verbs/hangup" },
        { "$ref": "verbs/leave" },
        { "$ref": "verbs/message" },
        { "$ref": "verbs/pause" },
        { "$ref": "verbs/redirect" },
        { "$ref": "verbs/tag" },
        { "$ref": "verbs/sip:decline" },
        { "$ref": "verbs/sip:request" },
        { "$ref": "verbs/sip:refer" }
      ],
      "discriminator": {
        "propertyName": "verb"
      }
    }
  },
  "examples": [
    [
      {
        "verb": "config",
        "synthesizer": { "vendor": "elevenlabs", "voice": "Rachel", "language": "en-US" },
        "recognizer": { "vendor": "deepgram", "language": "en-US" }
      },
      {
        "verb": "say",
        "text": "Hello! Welcome to Acme Corp. How can I help you today?"
      },
      {
        "verb": "gather",
        "input": ["speech"],
        "actionHook": "/process-input",
        "timeout": 15,
        "say": { "text": "I'm listening." }
      }
    ],
    [
      {
        "verb": "say",
        "text": "Please hold while I connect you to an agent."
      },
      {
        "verb": "dial",
        "target": [{ "type": "phone", "number": "+15085551212" }],
        "answerOnBridge": true,
        "timeout": 30,
        "actionHook": "/dial-complete"
      },
      {
        "verb": "say",
        "text": "Sorry, the agent is not available. Please try again later."
      },
      {
        "verb": "hangup"
      }
    ],
    [
      {
        "verb": "config",
        "synthesizer": { "vendor": "cartesia", "voice": "sonic-english" },
        "recognizer": { "vendor": "deepgram", "language": "en-US" }
      },
      {
        "verb": "llm",
        "vendor": "openai",
        "model": "gpt-4o",
        "llmOptions": {
          "messages": [
            { "role": "system", "content": "You are a helpful customer service agent for Acme Corp. Be concise and friendly." }
          ],
          "temperature": 0.7
        },
        "actionHook": "/llm-complete",
        "toolHook": "/llm-tool"
      }
    ]
  ]
}
ENDOFFILE

mkdir -p schema/verbs
cat > 'schema/verbs/alert.schema.json' << 'ENDOFFILE'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jambonz.org/schema/verbs/alert",
  "title": "Alert",
  "description": "Sends a 180 Ringing provisional response with an Alert-Info header. Used to trigger a specific ring tone or alert behavior on the caller's device before the call is answered.",
  "type": "object",
  "properties": {
    "verb": { "const": "alert" },
    "id": { "type": "string", "description": "An optional unique identifier for this verb instance." },
    "message": {
      "type": "string",
      "description": "The value to include in the Alert-Info header.",
      "examples": ["info=alert-internal", "http://example.com/ringtone.wav"]
    }
  },
  "required": ["message"],
  "examples": [
    { "verb": "alert", "message": "info=alert-internal" }
  ]
}
ENDOFFILE

mkdir -p schema/verbs
cat > 'schema/verbs/answer.schema.json' << 'ENDOFFILE'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jambonz.org/schema/verbs/answer",
  "title": "Answer",
  "description": "Answers an incoming call (sends a 200 OK to the SIP INVITE). Most verbs implicitly answer the call, so this verb is only needed when you want to explicitly control when the call is answered — for example, to play early media before answering.",
  "type": "object",
  "properties": {
    "verb": { "const": "answer" },
    "id": { "type": "string", "description": "An optional unique identifier for this verb instance." }
  },
  "examples": [{ "verb": "answer" }]
}
ENDOFFILE

mkdir -p schema/verbs
cat > 'schema/verbs/conference.schema.json' << 'ENDOFFILE'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jambonz.org/schema/verbs/conference",
  "title": "Conference",
  "description": "Places the caller into a multi-party conference room. Multiple callers in the same named conference can speak to each other. Supports features like muting, recording, waiting rooms, and participant limits.",
  "type": "object",
  "properties": {
    "verb": { "const": "conference" },
    "id": { "type": "string", "description": "An optional unique identifier for this verb instance." },
    "name": {
      "type": "string",
      "description": "The name of the conference room. All callers joining the same named conference are connected together.",
      "examples": ["team-standup", "customer-call-12345"]
    },
    "beep": { "type": "boolean", "description": "If true, play a beep when participants join or leave." },
    "memberTag": { "type": "string", "description": "A tag to identify this participant. Can be used to target specific members for actions like muting or whispering." },
    "speakOnlyTo": { "type": "string", "description": "If set, this participant's audio is only heard by the member with the specified memberTag. Creates a private whisper channel." },
    "startConferenceOnEnter": { "type": "boolean", "description": "If true (default), the conference starts when this participant joins. If false, this participant waits silently until a participant with startConferenceOnEnter=true joins." },
    "endConferenceOnExit": { "type": "boolean", "description": "If true, the conference ends for all participants when this participant leaves." },
    "endConferenceDuration": { "type": "number", "description": "Maximum duration of the conference in seconds." },
    "maxParticipants": { "type": "number", "description": "Maximum number of participants allowed in the conference." },
    "joinMuted": { "type": "boolean", "description": "If true, this participant joins the conference muted." },
    "actionHook": { "$ref": "../components/actionHook", "description": "A webhook invoked when this participant leaves the conference." },
    "waitHook": { "$ref": "../components/actionHook", "description": "A webhook invoked while this participant is waiting for the conference to start. Should return verbs to play (e.g. hold music)." },
    "statusEvents": { "type": "array", "items": { "type": "string" }, "description": "List of conference events to receive via the statusHook." },
    "statusHook": { "$ref": "../components/actionHook", "description": "A webhook to receive conference status events (joins, leaves, etc.)." },
    "enterHook": { "$ref": "../components/actionHook", "description": "A webhook invoked when this participant first enters the conference." },
    "record": { "type": "object", "description": "Recording configuration for the conference.", "additionalProperties": true },
    "listen": { "type": "object", "description": "Audio streaming configuration for the conference.", "additionalProperties": true },
    "distributeDtmf": { "type": "boolean", "description": "If true, DTMF events from this participant are distributed to all other participants." }
  },
  "required": ["name"],
  "examples": [
    {
      "verb": "conference",
      "name": "team-standup",
      "beep": true,
      "startConferenceOnEnter": true,
      "endConferenceOnExit": false,
      "statusHook": "/conference-events"
    }
  ]
}
ENDOFFILE

mkdir -p schema/verbs
cat > 'schema/verbs/config.schema.json' << 'ENDOFFILE'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jambonz.org/schema/verbs/config",
  "title": "Config",
  "description": "Sets session-level defaults for the call. Configures default TTS, STT, VAD, recording, streaming, and other session-wide settings. These defaults apply to all subsequent verbs unless overridden at the verb level. Typically the first verb in an application. Can be used multiple times during a call to change settings.",
  "type": "object",
  "properties": {
    "verb": {
      "const": "config",
      "description": "The verb name."
    },
    "id": {
      "type": "string",
      "description": "An optional unique identifier for this verb instance."
    },
    "synthesizer": {
      "$ref": "../components/synthesizer",
      "description": "Default TTS configuration for the session."
    },
    "recognizer": {
      "$ref": "../components/recognizer",
      "description": "Default STT configuration for the session."
    },
    "bargeIn": {
      "type": "object",
      "description": "Default barge-in configuration. When enabled, callers can interrupt playing prompts with speech or DTMF.",
      "properties": {
        "enable": { "type": "boolean" },
        "sticky": {
          "type": "boolean",
          "description": "If true, barge-in settings persist across verbs rather than resetting after each verb."
        },
        "actionHook": { "$ref": "../components/actionHook" },
        "input": {
          "type": "array",
          "items": { "type": "string", "enum": ["speech", "digits"] }
        },
        "minBargeinWordCount": { "type": "number" }
      }
    },
    "ttsStream": {
      "type": "object",
      "description": "Default TTS streaming configuration for the session.",
      "properties": {
        "enable": { "type": "boolean" },
        "synthesizer": { "$ref": "../components/synthesizer" }
      }
    },
    "record": {
      "type": "object",
      "description": "Session-level call recording configuration.",
      "additionalProperties": true
    },
    "listen": {
      "type": "object",
      "description": "Session-level audio streaming (listen/stream) configuration.",
      "additionalProperties": true
    },
    "stream": {
      "type": "object",
      "description": "Session-level audio streaming configuration. Alias for 'listen'.",
      "additionalProperties": true
    },
    "transcribe": {
      "type": "object",
      "description": "Session-level real-time transcription configuration.",
      "additionalProperties": true
    },
    "amd": {
      "type": "object",
      "description": "Session-level answering machine detection configuration.",
      "additionalProperties": true
    },
    "fillerNoise": {
      "$ref": "../components/fillerNoise",
      "description": "Default filler noise configuration for the session."
    },
    "vad": {
      "$ref": "../components/vad",
      "description": "Default voice activity detection configuration for the session."
    },
    "notifyEvents": {
      "type": "boolean",
      "description": "If true, send call events (e.g. DTMF, call status changes) to the application via the status webhook."
    },
    "notifySttLatency": {
      "type": "boolean",
      "description": "If true, include STT latency measurements in webhook payloads."
    },
    "reset": {
      "oneOf": [
        { "type": "string" },
        { "type": "array", "items": { "type": "string" } }
      ],
      "description": "Reset specific session-level settings to their defaults. Pass a setting name or array of setting names to reset."
    },
    "onHoldMusic": {
      "type": "string",
      "format": "uri",
      "description": "URL of an audio file to play when the call is placed on hold."
    },
    "actionHookDelayAction": {
      "$ref": "../components/actionHookDelayAction",
      "description": "Default configuration for handling slow webhook responses."
    },
    "sipRequestWithinDialogHook": {
      "$ref": "../components/actionHook",
      "description": "A webhook to invoke when a SIP request (e.g. INFO, NOTIFY) is received within the dialog."
    },
    "boostAudioSignal": {
      "oneOf": [
        { "type": "number" },
        { "type": "string" }
      ],
      "description": "Boost (or attenuate) the audio signal in dB for the session."
    },
    "referHook": {
      "$ref": "../components/actionHook",
      "description": "A webhook to invoke when a SIP REFER request is received."
    },
    "earlyMedia": {
      "type": "boolean",
      "description": "If true, allow early media (audio before call answer) for the session."
    },
    "autoStreamTts": {
      "type": "boolean",
      "description": "If true, automatically use streaming TTS for all 'say' verbs in the session."
    },
    "disableTtsCache": {
      "type": "boolean",
      "description": "If true, disable TTS caching for the session."
    },
    "noiseIsolation": {
      "type": "object",
      "description": "Noise isolation configuration to reduce background noise on the caller's audio.",
      "properties": {
        "enable": { "type": "boolean" },
        "vendor": { "type": "string" },
        "level": { "type": "number" },
        "model": { "type": "string" }
      }
    },
    "turnTaking": {
      "type": "object",
      "description": "Turn-taking detection configuration for conversational AI applications.",
      "properties": {
        "enable": { "type": "boolean" },
        "vendor": { "type": "string" },
        "threshold": { "type": "number" },
        "model": { "type": "string" }
      }
    }
  },
  "required": [],
  "examples": [
    {
      "verb": "config",
      "synthesizer": {
        "vendor": "elevenlabs",
        "voice": "Rachel",
        "language": "en-US"
      },
      "recognizer": {
        "vendor": "deepgram",
        "language": "en-US"
      },
      "fillerNoise": {
        "enable": true,
        "url": "https://example.com/sounds/typing.wav",
        "startDelaySecs": 2
      }
    }
  ]
}
ENDOFFILE

mkdir -p schema/verbs
cat > 'schema/verbs/dequeue.schema.json' << 'ENDOFFILE'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jambonz.org/schema/verbs/dequeue",
  "title": "Dequeue",
  "description": "Removes a caller from a named queue and bridges them to the current call. Typically used by an agent or operator call flow to connect with the next waiting caller.",
  "type": "object",
  "properties": {
    "verb": { "const": "dequeue" },
    "id": { "type": "string", "description": "An optional unique identifier for this verb instance." },
    "name": {
      "type": "string",
      "description": "The name of the queue to dequeue from.",
      "examples": ["support", "sales"]
    },
    "actionHook": {
      "$ref": "../components/actionHook",
      "description": "A webhook invoked when the dequeued call ends."
    },
    "timeout": {
      "type": "number",
      "description": "Time in seconds to wait for a caller to be available in the queue."
    },
    "beep": {
      "type": "boolean",
      "description": "If true, play a beep when the calls are connected."
    },
    "callSid": {
      "type": "string",
      "description": "Dequeue a specific call by its call SID, rather than the next caller in line."
    }
  },
  "required": ["name"],
  "examples": [
    { "verb": "dequeue", "name": "support", "beep": true }
  ]
}
ENDOFFILE

mkdir -p schema/verbs
cat > 'schema/verbs/dial.schema.json' << 'ENDOFFILE'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jambonz.org/schema/verbs/dial",
  "title": "Dial",
  "description": "Initiates an outbound call to one or more targets and bridges the caller to the first target that answers. Targets can be phone numbers (PSTN), SIP endpoints, registered users, or Microsoft Teams users. Supports simultaneous ringing, call screening, recording, and DTMF capture during the bridged call.",
  "type": "object",
  "properties": {
    "verb": {
      "const": "dial",
      "description": "The verb name."
    },
    "id": {
      "type": "string",
      "description": "An optional unique identifier for this verb instance."
    },
    "target": {
      "type": "array",
      "items": { "$ref": "../components/target" },
      "description": "One or more call targets to dial. If multiple targets are specified, they are rung simultaneously and the first to answer is connected. The rest are canceled.",
      "minItems": 1
    },
    "actionHook": {
      "$ref": "../components/actionHook",
      "description": "A webhook invoked when the dialed call ends. Receives call disposition details (duration, who hung up, etc.) and should return the next verbs to execute."
    },
    "onHoldHook": {
      "$ref": "../components/actionHook",
      "description": "A webhook invoked when the call is placed on hold. Should return verbs to execute (e.g. play hold music) while the caller is holding."
    },
    "answerOnBridge": {
      "type": "boolean",
      "description": "If true, delay answering the inbound call until the outbound leg is answered. This allows the caller to hear ringing until the target picks up, and avoids billing the caller for unanswered outbound attempts."
    },
    "callerId": {
      "type": "string",
      "description": "The caller ID (phone number) to present on the outbound call. Overrides the default caller ID.",
      "examples": ["+15085551212"]
    },
    "callerName": {
      "type": "string",
      "description": "The caller display name to present on the outbound call."
    },
    "confirmHook": {
      "$ref": "../components/actionHook",
      "description": "A webhook invoked when a target answers, before the call is bridged. Used for call screening — the webhook can return verbs (e.g. a 'say' prompt and 'gather') to confirm the callee wants to accept the call."
    },
    "referHook": {
      "$ref": "../components/actionHook",
      "description": "A webhook invoked when a SIP REFER is received on the bridged call. Allows handling call transfers initiated by the far end."
    },
    "dialMusic": {
      "type": "string",
      "format": "uri",
      "description": "URL of an audio file to play to the caller while the outbound call is ringing. Replaces the default ringback tone."
    },
    "dtmfCapture": {
      "type": "object",
      "description": "Configuration for capturing DTMF digits during the bridged call. Keys are DTMF patterns to capture, values are configuration for each.",
      "additionalProperties": true
    },
    "dtmfHook": {
      "$ref": "../components/actionHook",
      "description": "A webhook invoked when a captured DTMF pattern is detected during the bridged call."
    },
    "headers": {
      "type": "object",
      "description": "Custom SIP headers to include on the outbound INVITE.",
      "additionalProperties": { "type": "string" }
    },
    "anchorMedia": {
      "type": "boolean",
      "description": "If true, keep media anchored through the jambonz media server even if a direct media path is possible. Required for features like recording, listen, and DTMF capture during bridged calls."
    },
    "exitMediaPath": {
      "type": "boolean",
      "description": "If true, remove jambonz from the media path after the call is bridged. Reduces latency but disables mid-call features like recording and DTMF capture."
    },
    "boostAudioSignal": {
      "oneOf": [
        { "type": "number" },
        { "type": "string" }
      ],
      "description": "Boost (or attenuate) the audio signal in dB. Positive values increase volume, negative values decrease it.",
      "examples": [6, -3]
    },
    "listen": {
      "type": "object",
      "description": "Configuration for streaming audio of the bridged call to a websocket endpoint.",
      "additionalProperties": true
    },
    "stream": {
      "type": "object",
      "description": "Configuration for streaming audio of the bridged call. Alias for 'listen'.",
      "additionalProperties": true
    },
    "transcribe": {
      "type": "object",
      "description": "Configuration for real-time transcription of the bridged call.",
      "additionalProperties": true
    },
    "timeLimit": {
      "type": "number",
      "description": "Maximum duration in seconds for the bridged call. The call is automatically hung up when this limit is reached.",
      "examples": [3600]
    },
    "timeout": {
      "type": "number",
      "description": "Time in seconds to wait for the target to answer before giving up.",
      "examples": [30, 60]
    },
    "proxy": {
      "type": "string",
      "description": "A SIP proxy to route the outbound call through.",
      "examples": ["sip:proxy.example.com"]
    },
    "amd": {
      "type": "object",
      "description": "Answering machine detection configuration. When enabled, jambonz attempts to determine whether the call was answered by a human or a machine.",
      "additionalProperties": true
    },
    "dub": {
      "type": "array",
      "items": { "type": "object" },
      "description": "Audio dubbing configuration for mixing additional audio tracks into the bridged call."
    },
    "tag": {
      "type": "object",
      "description": "Arbitrary metadata to attach to this call leg. Included in subsequent webhook invocations and CDRs.",
      "additionalProperties": true
    },
    "forwardPAI": {
      "type": "boolean",
      "description": "If true, forward the P-Asserted-Identity header from the inbound call to the outbound call."
    }
  },
  "required": ["target"],
  "examples": [
    {
      "verb": "dial",
      "target": [
        { "type": "phone", "number": "+15085551212" }
      ],
      "answerOnBridge": true,
      "timeout": 30,
      "actionHook": "/dial-complete"
    },
    {
      "verb": "dial",
      "target": [
        { "type": "sip", "sipUri": "sip:alice@example.com" },
        { "type": "sip", "sipUri": "sip:bob@example.com" }
      ],
      "confirmHook": "/screen-call",
      "timeLimit": 3600
    }
  ]
}
ENDOFFILE

mkdir -p schema/verbs
cat > 'schema/verbs/dtmf.schema.json' << 'ENDOFFILE'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jambonz.org/schema/verbs/dtmf",
  "title": "DTMF",
  "description": "Sends DTMF tones on the call. Used to interact with IVR systems on the far end, or to signal systems that respond to DTMF.",
  "type": "object",
  "properties": {
    "verb": { "const": "dtmf" },
    "id": { "type": "string", "description": "An optional unique identifier for this verb instance." },
    "dtmf": {
      "type": "string",
      "description": "The DTMF digits to send. Valid characters are 0-9, *, #, and A-D. Use 'w' for a 500ms pause between digits.",
      "examples": ["1234#", "1w2w3", "5551212"]
    },
    "duration": {
      "type": "number",
      "description": "Duration in milliseconds for each DTMF tone.",
      "default": 500,
      "examples": [250, 500]
    }
  },
  "required": ["dtmf"],
  "examples": [
    { "verb": "dtmf", "dtmf": "1234#" },
    { "verb": "dtmf", "dtmf": "1w2w3w4", "duration": 250 }
  ]
}
ENDOFFILE

mkdir -p schema/verbs
cat > 'schema/verbs/dub.schema.json' << 'ENDOFFILE'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jambonz.org/schema/verbs/dub",
  "title": "Dub",
  "description": "Manages audio dubbing tracks on a call. Allows adding, removing, and controlling auxiliary audio tracks that are mixed into the call audio. Used for background music, coaching whispers, or injecting audio from external sources.",
  "type": "object",
  "properties": {
    "verb": { "const": "dub" },
    "id": { "type": "string", "description": "An optional unique identifier for this verb instance." },
    "action": {
      "type": "string",
      "description": "The dubbing action to perform.",
      "enum": ["addTrack", "removeTrack", "silenceTrack", "playOnTrack", "sayOnTrack"]
    },
    "track": {
      "type": "string",
      "description": "The name of the audio track. Used to reference the track in subsequent dub actions.",
      "examples": ["background-music", "coach-whisper"]
    },
    "play": {
      "type": "string",
      "format": "uri",
      "description": "URL of an audio file to play on the track. Used with 'playOnTrack' action."
    },
    "say": {
      "oneOf": [
        { "type": "string" },
        { "type": "object", "additionalProperties": true }
      ],
      "description": "Text to synthesize and play on the track. Used with 'sayOnTrack' action. Can be a string or a say configuration object."
    },
    "loop": {
      "type": "boolean",
      "description": "If true, loop the audio on the track continuously."
    },
    "gain": {
      "oneOf": [
        { "type": "number" },
        { "type": "string" }
      ],
      "description": "Audio gain for the track in dB. Use negative values to reduce volume.",
      "examples": [-10, 0, 6]
    }
  },
  "required": ["action", "track"],
  "examples": [
    { "verb": "dub", "action": "addTrack", "track": "bgm" },
    { "verb": "dub", "action": "playOnTrack", "track": "bgm", "play": "https://example.com/music.mp3", "loop": true, "gain": -15 },
    { "verb": "dub", "action": "sayOnTrack", "track": "coach", "say": "Ask about their budget" },
    { "verb": "dub", "action": "removeTrack", "track": "bgm" }
  ]
}
ENDOFFILE

mkdir -p schema/verbs
cat > 'schema/verbs/enqueue.schema.json' << 'ENDOFFILE'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jambonz.org/schema/verbs/enqueue",
  "title": "Enqueue",
  "description": "Places the caller into a named call queue. While in the queue, the caller hears content returned by the waitHook (typically hold music or position announcements). The caller remains in the queue until dequeued by another call or process.",
  "type": "object",
  "properties": {
    "verb": { "const": "enqueue" },
    "id": { "type": "string", "description": "An optional unique identifier for this verb instance." },
    "name": {
      "type": "string",
      "description": "The name of the queue to place the caller in. Queues are created implicitly when first referenced.",
      "examples": ["support", "sales"]
    },
    "actionHook": {
      "$ref": "../components/actionHook",
      "description": "A webhook invoked when the caller leaves the queue (either dequeued or hung up). Should return the next verbs to execute."
    },
    "waitHook": {
      "$ref": "../components/actionHook",
      "description": "A webhook invoked immediately when the caller enters the queue and periodically while waiting. Should return verbs to play to the caller (e.g. hold music, queue position announcements)."
    },
    "priority": {
      "type": "number",
      "description": "The priority of this caller in the queue. Lower numbers are higher priority and are dequeued first.",
      "examples": [1, 5, 10]
    }
  },
  "required": ["name"],
  "examples": [
    {
      "verb": "enqueue",
      "name": "support",
      "waitHook": "/queue-wait",
      "actionHook": "/queue-exit"
    }
  ]
}
ENDOFFILE

mkdir -p schema/verbs
cat > 'schema/verbs/gather.schema.json' << 'ENDOFFILE'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jambonz.org/schema/verbs/gather",
  "title": "Gather",
  "description": "Collects user input via speech (STT) and/or DTMF digits. Optionally plays a prompt (using nested 'say' or 'play') while listening. When input is received, the result is sent to the actionHook which should return the next set of verbs. This is the primary verb for building interactive voice menus and conversational flows.",
  "type": "object",
  "properties": {
    "verb": {
      "const": "gather",
      "description": "The verb name."
    },
    "id": {
      "type": "string",
      "description": "An optional unique identifier for this verb instance."
    },
    "actionHook": {
      "$ref": "../components/actionHook",
      "description": "The webhook to invoke when input is collected. Receives the transcribed speech and/or DTMF digits. Must return a new array of verbs."
    },
    "input": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": ["speech", "digits"]
      },
      "description": "The types of input to accept. Can include 'speech' (STT), 'digits' (DTMF), or both.",
      "default": ["digits"],
      "examples": [["speech", "digits"], ["speech"], ["digits"]]
    },
    "finishOnKey": {
      "type": "string",
      "description": "A DTMF key that signals the end of digit input. The key itself is not included in the collected digits.",
      "examples": ["#", "*"]
    },
    "numDigits": {
      "type": "number",
      "description": "Exact number of DTMF digits to collect. Gather completes automatically when this many digits are received."
    },
    "minDigits": {
      "type": "number",
      "description": "Minimum number of DTMF digits required."
    },
    "maxDigits": {
      "type": "number",
      "description": "Maximum number of DTMF digits to collect."
    },
    "interDigitTimeout": {
      "type": "number",
      "description": "Time in seconds to wait between DTMF digits before considering input complete.",
      "examples": [5]
    },
    "speechTimeout": {
      "type": "number",
      "description": "Time in seconds of silence after speech before considering the utterance complete.",
      "examples": [2, 3]
    },
    "timeout": {
      "type": "number",
      "description": "Overall timeout in seconds. If no input is received within this time, the gather completes with no input and the actionHook is invoked.",
      "examples": [10, 30]
    },
    "partialResultHook": {
      "$ref": "../components/actionHook",
      "description": "A webhook to invoke with interim (partial) speech recognition results. Useful for providing real-time feedback or early processing."
    },
    "listenDuringPrompt": {
      "type": "boolean",
      "description": "If true, listen for input while the prompt is playing. If false, only start listening after the prompt finishes.",
      "default": true
    },
    "dtmfBargein": {
      "type": "boolean",
      "description": "If true, DTMF input interrupts (barges in on) any playing prompt."
    },
    "bargein": {
      "type": "boolean",
      "description": "If true, speech input interrupts (barges in on) any playing prompt."
    },
    "minBargeinWordCount": {
      "type": "number",
      "description": "Minimum number of words that must be recognized before barge-in is triggered. Prevents brief noises from interrupting prompts.",
      "examples": [1, 2]
    },
    "recognizer": {
      "$ref": "../components/recognizer",
      "description": "Override the session-level STT configuration for this gather."
    },
    "say": {
      "$ref": "say",
      "description": "A nested 'say' verb to use as the prompt. Played to the caller while listening for input."
    },
    "play": {
      "$ref": "play",
      "description": "A nested 'play' verb to use as the prompt. Played to the caller while listening for input."
    },
    "fillerNoise": {
      "$ref": "../components/fillerNoise",
      "description": "Filler noise configuration while waiting for the actionHook to respond."
    },
    "actionHookDelayAction": {
      "$ref": "../components/actionHookDelayAction",
      "description": "Configuration for interim actions while the actionHook is processing."
    }
  },
  "examples": [
    {
      "verb": "gather",
      "input": ["speech", "digits"],
      "actionHook": "/gather-result",
      "timeout": 15,
      "say": {
        "text": "Please say or enter your account number."
      }
    },
    {
      "verb": "gather",
      "input": ["digits"],
      "actionHook": "/menu-selection",
      "numDigits": 1,
      "say": {
        "text": "Press 1 for sales, 2 for support, or 3 for billing."
      }
    },
    {
      "verb": "gather",
      "input": ["speech"],
      "actionHook": "/process-speech",
      "timeout": 20,
      "bargein": true,
      "recognizer": {
        "vendor": "deepgram",
        "language": "en-US",
        "hints": ["account", "balance", "transfer", "payment"]
      },
      "say": {
        "text": "How can I help you today?"
      },
      "fillerNoise": {
        "enable": true,
        "url": "https://example.com/sounds/typing.wav",
        "startDelaySecs": 2
      }
    }
  ]
}
ENDOFFILE

mkdir -p schema/verbs
cat > 'schema/verbs/hangup.schema.json' << 'ENDOFFILE'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jambonz.org/schema/verbs/hangup",
  "title": "Hangup",
  "description": "Terminates the call. Optionally includes custom SIP headers on the BYE request.",
  "type": "object",
  "properties": {
    "verb": {
      "const": "hangup",
      "description": "The verb name."
    },
    "id": {
      "type": "string",
      "description": "An optional unique identifier for this verb instance."
    },
    "headers": {
      "type": "object",
      "description": "Custom SIP headers to include on the BYE request.",
      "additionalProperties": { "type": "string" }
    }
  },
  "examples": [
    { "verb": "hangup" },
    {
      "verb": "hangup",
      "headers": { "X-Reason": "call-complete" }
    }
  ]
}
ENDOFFILE

mkdir -p schema/verbs
cat > 'schema/verbs/leave.schema.json' << 'ENDOFFILE'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jambonz.org/schema/verbs/leave",
  "title": "Leave",
  "description": "Removes the caller from a conference or queue that they are currently in. Execution continues with the next verb in the application.",
  "type": "object",
  "properties": {
    "verb": { "const": "leave" },
    "id": { "type": "string", "description": "An optional unique identifier for this verb instance." }
  },
  "examples": [{ "verb": "leave" }]
}
ENDOFFILE

mkdir -p schema/verbs
cat > 'schema/verbs/listen.schema.json' << 'ENDOFFILE'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jambonz.org/schema/verbs/listen",
  "title": "Listen",
  "description": "Streams real-time call audio to an external websocket endpoint. The remote endpoint receives raw audio and can optionally send audio back (bidirectional). Used for custom speech processing, real-time analysis, AI agent integration, and recording to external systems.",
  "type": "object",
  "properties": {
    "verb": {
      "const": "listen",
      "description": "The verb name."
    },
    "id": {
      "type": "string",
      "description": "An optional unique identifier for this verb instance."
    },
    "url": {
      "type": "string",
      "format": "uri",
      "description": "The websocket URL to stream audio to.",
      "examples": ["wss://myapp.example.com/audio-stream"]
    },
    "actionHook": {
      "$ref": "../components/actionHook",
      "description": "A webhook invoked when the listen session ends. Should return the next verbs to execute."
    },
    "wsAuth": {
      "$ref": "../components/auth",
      "description": "Authentication credentials for the websocket connection."
    },
    "mixType": {
      "type": "string",
      "description": "How to mix the audio channels when streaming. 'mono' sends a single mixed channel, 'stereo' sends caller and callee as separate left/right channels, 'mixed' sends both as a single mixed stream.",
      "enum": ["mono", "stereo", "mixed"],
      "default": "mono"
    },
    "metadata": {
      "type": "object",
      "description": "Arbitrary metadata to send to the websocket endpoint in the initial connection message.",
      "additionalProperties": true
    },
    "sampleRate": {
      "type": "number",
      "description": "The audio sample rate in Hz.",
      "examples": [8000, 16000, 24000],
      "default": 8000
    },
    "finishOnKey": {
      "type": "string",
      "description": "A DTMF key that ends the listen session when pressed.",
      "examples": ["#"]
    },
    "maxLength": {
      "type": "number",
      "description": "Maximum duration in seconds for the listen session."
    },
    "passDtmf": {
      "type": "boolean",
      "description": "If true, forward DTMF events to the websocket endpoint."
    },
    "playBeep": {
      "type": "boolean",
      "description": "If true, play a beep tone before streaming begins."
    },
    "disableBidirectionalAudio": {
      "type": "boolean",
      "description": "If true, disable receiving audio from the websocket endpoint. Audio flows only from the call to the websocket, not back."
    },
    "bidirectionalAudio": {
      "$ref": "../components/bidirectionalAudio",
      "description": "Fine-grained configuration for bidirectional audio."
    },
    "timeout": {
      "type": "number",
      "description": "Time in seconds to wait for audio activity before ending the listen session."
    },
    "transcribe": {
      "type": "object",
      "description": "Configuration for simultaneous real-time transcription of the audio being streamed.",
      "additionalProperties": true
    },
    "earlyMedia": {
      "type": "boolean",
      "description": "If true, begin streaming audio before the call is formally answered."
    },
    "channel": {
      "type": "number",
      "description": "Specific audio channel to stream. Used when streaming a single channel of a multi-channel call."
    }
  },
  "required": ["url"],
  "examples": [
    {
      "verb": "listen",
      "url": "wss://myapp.example.com/audio-stream",
      "actionHook": "/listen-complete",
      "sampleRate": 16000,
      "mixType": "stereo"
    },
    {
      "verb": "listen",
      "url": "wss://myapp.example.com/ai-agent",
      "bidirectionalAudio": {
        "enabled": true,
        "streaming": true,
        "sampleRate": 24000
      },
      "metadata": { "callType": "support", "language": "en-US" }
    }
  ]
}
ENDOFFILE

mkdir -p schema/verbs
cat > 'schema/verbs/llm.schema.json' << 'ENDOFFILE'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jambonz.org/schema/verbs/llm",
  "title": "LLM",
  "description": "Connects the caller to a large language model for a real-time voice conversation. Handles the complete STT → LLM → TTS pipeline, including turn detection, interruption handling, and tool/function calling. The caller speaks naturally and the LLM responds via synthesized speech. This is the primary verb for building AI voice agents on jambonz.",
  "type": "object",
  "properties": {
    "verb": {
      "const": "llm",
      "description": "The verb name."
    },
    "id": {
      "type": "string",
      "description": "An optional unique identifier for this verb instance."
    },
    "vendor": {
      "type": "string",
      "description": "The LLM vendor to use.",
      "examples": ["openai", "anthropic", "google", "groq", "deepseek", "custom"]
    },
    "model": {
      "type": "string",
      "description": "The specific model to use from the vendor.",
      "examples": ["gpt-4o", "claude-sonnet-4-20250514", "gemini-2.0-flash"]
    },
    "auth": {
      "type": "object",
      "description": "Authentication credentials for the LLM vendor API.",
      "properties": {
        "apiKey": {
          "type": "string",
          "description": "The API key for the LLM vendor."
        }
      },
      "additionalProperties": true
    },
    "connectOptions": {
      "type": "object",
      "description": "Additional connection options for the LLM vendor, such as custom base URLs or API versions.",
      "additionalProperties": true
    },
    "llmOptions": {
      "type": "object",
      "description": "Configuration passed to the LLM including the system prompt, temperature, tools/functions, and other model parameters. The structure varies by vendor but typically includes 'messages' (conversation history), 'temperature', 'tools' (function definitions), and 'maxTokens'.",
      "additionalProperties": true,
      "examples": [
        {
          "messages": [
            { "role": "system", "content": "You are a helpful customer service agent for Acme Corp." }
          ],
          "temperature": 0.7,
          "tools": [
            {
              "type": "function",
              "function": {
                "name": "lookupOrder",
                "description": "Look up an order by order number",
                "parameters": {
                  "type": "object",
                  "properties": {
                    "orderNumber": { "type": "string" }
                  },
                  "required": ["orderNumber"]
                }
              }
            }
          ]
        }
      ]
    },
    "mcpServers": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "url": {
            "type": "string",
            "format": "uri",
            "description": "The URL of the MCP server."
          },
          "auth": {
            "type": "object",
            "description": "Authentication for the MCP server.",
            "additionalProperties": true
          },
          "roots": {
            "type": "array",
            "items": { "type": "object" },
            "description": "MCP root definitions."
          }
        },
        "required": ["url"]
      },
      "description": "Model Context Protocol servers to connect to. MCP servers provide tools that the LLM can invoke during the conversation."
    },
    "actionHook": {
      "$ref": "../components/actionHook",
      "description": "A webhook invoked when the LLM conversation ends. Receives conversation details and should return the next verbs to execute."
    },
    "eventHook": {
      "$ref": "../components/actionHook",
      "description": "A webhook invoked for real-time events during the LLM conversation (e.g. tool calls, transcription events)."
    },
    "toolHook": {
      "$ref": "../components/actionHook",
      "description": "A webhook invoked when the LLM calls a tool/function. Receives the tool name and arguments, and should return the tool result."
    },
    "events": {
      "type": "array",
      "items": { "type": "string" },
      "description": "List of event types to receive via the eventHook."
    }
  },
  "required": ["vendor", "llmOptions"],
  "examples": [
    {
      "verb": "llm",
      "vendor": "openai",
      "model": "gpt-4o",
      "auth": { "apiKey": "sk-..." },
      "llmOptions": {
        "messages": [
          { "role": "system", "content": "You are a helpful customer service agent. Be concise and friendly." }
        ],
        "temperature": 0.7
      },
      "actionHook": "/llm-complete",
      "toolHook": "/llm-tool-call"
    }
  ]
}
ENDOFFILE

mkdir -p schema/verbs
cat > 'schema/verbs/message.schema.json' << 'ENDOFFILE'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jambonz.org/schema/verbs/message",
  "title": "Message",
  "description": "Sends an SMS or MMS message. Can be used during a voice call to send a text message to the caller or another party, or as a standalone action.",
  "type": "object",
  "properties": {
    "verb": { "const": "message" },
    "id": { "type": "string", "description": "An optional unique identifier for this verb instance." },
    "to": { "type": "string", "description": "The destination phone number in E.164 format.", "examples": ["+15085551212"] },
    "from": { "type": "string", "description": "The sender phone number in E.164 format. Must be a number provisioned on the jambonz platform.", "examples": ["+15085559876"] },
    "text": { "type": "string", "description": "The text content of the message." },
    "media": {
      "oneOf": [
        { "type": "string", "format": "uri" },
        { "type": "array", "items": { "type": "string", "format": "uri" } }
      ],
      "description": "URL(s) of media to attach to the message (MMS). Can be images, audio, or video.",
      "examples": ["https://example.com/images/receipt.png"]
    },
    "carrier": { "type": "string", "description": "The messaging carrier to use. If not specified, the default carrier is used." },
    "account_sid": { "type": "string", "description": "The account SID to use for sending. Defaults to the current account." },
    "message_sid": { "type": "string", "description": "An optional message SID for tracking." },
    "actionHook": { "$ref": "../components/actionHook", "description": "A webhook invoked when the message send completes or fails." }
  },
  "required": ["to", "from"],
  "examples": [
    { "verb": "message", "to": "+15085551212", "from": "+15085559876", "text": "Your order has been confirmed. Order #12345." }
  ]
}
ENDOFFILE

mkdir -p schema/verbs
cat > 'schema/verbs/pause.schema.json' << 'ENDOFFILE'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jambonz.org/schema/verbs/pause",
  "title": "Pause",
  "description": "Pauses execution for a specified number of seconds. The caller hears silence during the pause. Useful for adding delays between verbs.",
  "type": "object",
  "properties": {
    "verb": {
      "const": "pause",
      "description": "The verb name."
    },
    "id": {
      "type": "string",
      "description": "An optional unique identifier for this verb instance."
    },
    "length": {
      "type": "number",
      "description": "The duration of the pause in seconds.",
      "examples": [1, 2, 5]
    }
  },
  "required": ["length"],
  "examples": [
    { "verb": "pause", "length": 2 }
  ]
}
ENDOFFILE

mkdir -p schema/verbs
cat > 'schema/verbs/pipeline.schema.json' << 'ENDOFFILE'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jambonz.org/schema/verbs/pipeline",
  "title": "Pipeline",
  "description": "Configures a complete STT → LLM → TTS voice AI pipeline with integrated turn detection. Provides a higher-level abstraction than manually orchestrating the individual components. Optimized for building voice AI agents with proper turn-taking behavior.",
  "type": "object",
  "properties": {
    "verb": { "const": "pipeline" },
    "id": { "type": "string", "description": "An optional unique identifier for this verb instance." },
    "stt": {
      "$ref": "../components/recognizer",
      "description": "Speech-to-text configuration for the pipeline."
    },
    "tts": {
      "$ref": "../components/synthesizer",
      "description": "Text-to-speech configuration for the pipeline."
    },
    "vad": {
      "$ref": "../components/vad",
      "description": "Voice activity detection configuration for the pipeline."
    },
    "turnDetection": {
      "type": "object",
      "description": "Turn detection configuration. Determines when the user has finished speaking and it's the AI's turn to respond.",
      "properties": {
        "vendor": { "type": "string", "enum": ["krisp"], "description": "The turn detection vendor." },
        "threshold": { "type": "number", "description": "Confidence threshold for turn detection." },
        "eagerEotThreshold": { "type": "number", "description": "Threshold for eager end-of-turn detection. Lower values cause earlier turn transitions." }
      },
      "required": ["vendor"]
    },
    "llm": {
      "type": "object",
      "description": "LLM configuration for the pipeline. See the 'llm' verb schema for details.",
      "additionalProperties": true
    },
    "preflightLlm": {
      "type": "boolean",
      "description": "If true, establish the LLM connection before the call starts to reduce latency on the first interaction."
    },
    "actionHook": { "$ref": "../components/actionHook", "description": "A webhook invoked when the pipeline ends." },
    "eventHook": { "$ref": "../components/actionHook", "description": "A webhook invoked for pipeline events." }
  },
  "required": ["stt", "llm", "tts"],
  "examples": [
    {
      "verb": "pipeline",
      "stt": { "vendor": "deepgram", "language": "en-US" },
      "tts": { "vendor": "cartesia", "voice": "sonic-english" },
      "llm": {
        "vendor": "openai",
        "model": "gpt-4o",
        "llmOptions": {
          "messages": [{ "role": "system", "content": "You are a helpful voice assistant." }]
        }
      },
      "turnDetection": { "vendor": "krisp", "threshold": 0.5 },
      "actionHook": "/pipeline-complete"
    }
  ]
}
ENDOFFILE

mkdir -p schema/verbs
cat > 'schema/verbs/play.schema.json' << 'ENDOFFILE'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jambonz.org/schema/verbs/play",
  "title": "Play",
  "description": "Plays an audio file to the caller. Supports WAV and MP3 formats hosted at a URL. Can play a single file or cycle through a list of files.",
  "type": "object",
  "properties": {
    "verb": {
      "const": "play",
      "description": "The verb name."
    },
    "id": {
      "type": "string",
      "description": "An optional unique identifier for this verb instance."
    },
    "url": {
      "oneOf": [
        { "type": "string", "format": "uri" },
        {
          "type": "array",
          "items": { "type": "string", "format": "uri" }
        }
      ],
      "description": "The URL(s) of the audio file(s) to play. Supports WAV and MP3. If an array, files are played in sequence.",
      "examples": [
        "https://example.com/sounds/greeting.wav",
        ["https://example.com/sounds/part1.wav", "https://example.com/sounds/part2.wav"]
      ]
    },
    "loop": {
      "oneOf": [
        { "type": "number" },
        { "type": "string" }
      ],
      "description": "Number of times to repeat playback. Use 0 or 'forever' to loop indefinitely until interrupted.",
      "examples": [3, "forever"]
    },
    "earlyMedia": {
      "type": "boolean",
      "description": "If true, play the audio as early media before the call is answered."
    },
    "seekOffset": {
      "oneOf": [
        { "type": "number" },
        { "type": "string" }
      ],
      "description": "Start playback at this offset in seconds from the beginning of the file."
    },
    "timeoutSecs": {
      "oneOf": [
        { "type": "number" },
        { "type": "string" }
      ],
      "description": "Maximum time in seconds to play the audio. Playback stops after this duration even if the file has not finished."
    },
    "actionHook": {
      "$ref": "../components/actionHook",
      "description": "A webhook to invoke when playback completes."
    }
  },
  "required": ["url"],
  "examples": [
    {
      "verb": "play",
      "url": "https://example.com/sounds/hold-music.mp3",
      "loop": "forever"
    }
  ]
}
ENDOFFILE

mkdir -p schema/verbs
cat > 'schema/verbs/redirect.schema.json' << 'ENDOFFILE'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jambonz.org/schema/verbs/redirect",
  "title": "Redirect",
  "description": "Transfers call control to a different webhook URL. The current verb stack is abandoned and the new webhook's response becomes the active application. Useful for modular application design where different URLs handle different phases of a call.",
  "type": "object",
  "properties": {
    "verb": { "const": "redirect" },
    "id": { "type": "string", "description": "An optional unique identifier for this verb instance." },
    "actionHook": {
      "$ref": "../components/actionHook",
      "description": "The webhook to transfer control to. Must return a new array of verbs."
    },
    "statusHook": {
      "$ref": "../components/actionHook",
      "description": "A webhook to receive call status events after the redirect."
    }
  },
  "required": ["actionHook"],
  "examples": [
    { "verb": "redirect", "actionHook": "/new-handler" }
  ]
}
ENDOFFILE

mkdir -p schema/verbs
cat > 'schema/verbs/say.schema.json' << 'ENDOFFILE'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jambonz.org/schema/verbs/say",
  "title": "Say",
  "description": "Speaks text to the caller using text-to-speech. The text can be plain text or SSML. Optionally streams TTS output incrementally for lower latency. This is one of the most commonly used verbs in jambonz applications.",
  "type": "object",
  "properties": {
    "verb": {
      "const": "say",
      "description": "The verb name."
    },
    "id": {
      "type": "string",
      "description": "An optional unique identifier for this verb instance. Can be used to reference it in other contexts."
    },
    "text": {
      "oneOf": [
        { "type": "string" },
        {
          "type": "array",
          "items": { "type": "string" }
        }
      ],
      "description": "The text to speak. Can be plain text or SSML markup. If an array is provided, one entry is selected at random (useful for variety in prompts).",
      "examples": [
        "Hello, welcome to our service.",
        "<speak>Hello <break time='500ms'/> welcome.</speak>",
        ["Hello!", "Hi there!", "Welcome!"]
      ]
    },
    "instructions": {
      "type": "string",
      "description": "Natural language instructions to guide TTS expression and delivery. Supported by vendors that offer instruction-based synthesis (e.g. ElevenLabs, some OpenAI models).",
      "examples": ["Speak in a warm, friendly tone", "Sound excited and energetic"]
    },
    "stream": {
      "type": "boolean",
      "description": "If true, stream TTS audio to the caller incrementally as it is generated, rather than waiting for the complete audio. Reduces time-to-first-byte for long utterances. Requires a vendor that supports streaming synthesis."
    },
    "loop": {
      "oneOf": [
        { "type": "number" },
        { "type": "string" }
      ],
      "description": "Number of times to repeat the speech. Use 0 or 'forever' to loop indefinitely until interrupted.",
      "examples": [2, "forever"]
    },
    "synthesizer": {
      "$ref": "../components/synthesizer",
      "description": "Override the session-level TTS configuration for this specific utterance."
    },
    "earlyMedia": {
      "type": "boolean",
      "description": "If true, play the audio as early media (before the call is answered). Used for playing announcements or prompts to the caller before the call is formally connected."
    },
    "disableTtsCache": {
      "type": "boolean",
      "description": "If true, bypass the TTS cache and always generate fresh audio. Useful when the same text should be re-synthesized (e.g. with different SSML or when the voice has been updated)."
    },
    "closeStreamOnEmpty": {
      "type": "boolean",
      "description": "If true, close the TTS stream when an empty text string is received. Only applies when stream is true."
    }
  },
  "examples": [
    {
      "verb": "say",
      "text": "Hello, welcome to Acme Corp. How can I help you today?"
    },
    {
      "verb": "say",
      "text": "Please hold while I transfer your call.",
      "synthesizer": {
        "vendor": "elevenlabs",
        "voice": "Rachel"
      }
    },
    {
      "verb": "say",
      "text": ["Hello!", "Hi there!", "Welcome!"],
      "loop": 1
    }
  ]
}
ENDOFFILE

mkdir -p schema/verbs
cat > 'schema/verbs/sip-decline.schema.json' << 'ENDOFFILE'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jambonz.org/schema/verbs/sip:decline",
  "title": "SIP Decline",
  "description": "Rejects an incoming call with a SIP error response. Used to decline calls with a specific status code and reason (e.g. 486 Busy Here, 603 Decline).",
  "type": "object",
  "properties": {
    "verb": { "const": "sip:decline" },
    "id": { "type": "string", "description": "An optional unique identifier for this verb instance." },
    "status": {
      "type": "number",
      "description": "The SIP response status code to send.",
      "examples": [486, 603, 404, 480]
    },
    "reason": {
      "type": "string",
      "description": "The SIP reason phrase to include in the response.",
      "examples": ["Busy Here", "Decline", "Not Found"]
    },
    "headers": {
      "type": "object",
      "description": "Custom SIP headers to include in the response.",
      "additionalProperties": { "type": "string" }
    }
  },
  "required": ["status"],
  "examples": [
    { "verb": "sip:decline", "status": 486, "reason": "Busy Here" },
    { "verb": "sip:decline", "status": 603, "reason": "Decline" }
  ]
}
ENDOFFILE

mkdir -p schema/verbs
cat > 'schema/verbs/sip-refer.schema.json' << 'ENDOFFILE'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jambonz.org/schema/verbs/sip:refer",
  "title": "SIP Refer",
  "description": "Sends a SIP REFER request to transfer the call to another party. Initiates an attended or unattended (blind) transfer.",
  "type": "object",
  "properties": {
    "verb": { "const": "sip:refer" },
    "id": { "type": "string", "description": "An optional unique identifier for this verb instance." },
    "referTo": {
      "type": "string",
      "description": "The SIP URI or phone number to transfer the call to.",
      "examples": ["sip:alice@example.com", "+15085551212"]
    },
    "referredBy": {
      "type": "string",
      "description": "The SIP URI to use in the Referred-By header."
    },
    "referredByDisplayName": {
      "type": "string",
      "description": "The display name to use in the Referred-By header."
    },
    "headers": {
      "type": "object",
      "description": "Custom SIP headers to include in the REFER request.",
      "additionalProperties": { "type": "string" }
    },
    "actionHook": {
      "$ref": "../components/actionHook",
      "description": "A webhook invoked when the REFER completes (or fails)."
    },
    "eventHook": {
      "$ref": "../components/actionHook",
      "description": "A webhook invoked for NOTIFY events during the REFER process, providing transfer progress updates."
    }
  },
  "required": ["referTo"],
  "examples": [
    { "verb": "sip:refer", "referTo": "sip:alice@example.com", "actionHook": "/refer-complete" }
  ]
}
ENDOFFILE

mkdir -p schema/verbs
cat > 'schema/verbs/sip-request.schema.json' << 'ENDOFFILE'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jambonz.org/schema/verbs/sip:request",
  "title": "SIP Request",
  "description": "Sends a SIP request within the current dialog. Used to send INFO, NOTIFY, or other SIP methods to the remote party during an active call.",
  "type": "object",
  "properties": {
    "verb": { "const": "sip:request" },
    "id": { "type": "string", "description": "An optional unique identifier for this verb instance." },
    "method": {
      "type": "string",
      "description": "The SIP method to send.",
      "examples": ["INFO", "NOTIFY", "MESSAGE"]
    },
    "body": {
      "type": "string",
      "description": "The body of the SIP request."
    },
    "headers": {
      "type": "object",
      "description": "Custom SIP headers to include in the request.",
      "additionalProperties": { "type": "string" }
    },
    "actionHook": {
      "$ref": "../components/actionHook",
      "description": "A webhook invoked when the response to the SIP request is received."
    }
  },
  "required": ["method"],
  "examples": [
    { "verb": "sip:request", "method": "INFO", "body": "Signal=1\nDuration=250", "headers": { "Content-Type": "application/dtmf-relay" } }
  ]
}
ENDOFFILE

mkdir -p schema/verbs
cat > 'schema/verbs/stream.schema.json' << 'ENDOFFILE'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jambonz.org/schema/verbs/stream",
  "title": "Stream",
  "description": "Streams real-time call audio to an external websocket endpoint. Functionally equivalent to 'listen' — this is an alias provided for naming clarity when the intent is audio streaming rather than recording.",
  "type": "object",
  "properties": {
    "verb": { "const": "stream" },
    "id": { "type": "string", "description": "An optional unique identifier for this verb instance." },
    "url": { "type": "string", "format": "uri", "description": "The websocket URL to stream audio to." },
    "actionHook": { "$ref": "../components/actionHook", "description": "A webhook invoked when the stream ends." },
    "wsAuth": { "$ref": "../components/auth", "description": "Authentication credentials for the websocket connection." },
    "mixType": { "type": "string", "enum": ["mono", "stereo", "mixed"], "description": "How to mix audio channels." },
    "metadata": { "type": "object", "description": "Metadata to send with the initial connection.", "additionalProperties": true },
    "sampleRate": { "type": "number", "description": "Audio sample rate in Hz.", "examples": [8000, 16000] },
    "finishOnKey": { "type": "string", "description": "DTMF key that ends the stream." },
    "maxLength": { "type": "number", "description": "Maximum duration in seconds." },
    "passDtmf": { "type": "boolean", "description": "Forward DTMF events to the websocket." },
    "playBeep": { "type": "boolean", "description": "Play a beep before streaming begins." },
    "disableBidirectionalAudio": { "type": "boolean", "description": "Disable receiving audio from the websocket." },
    "bidirectionalAudio": { "$ref": "../components/bidirectionalAudio", "description": "Bidirectional audio configuration." },
    "timeout": { "type": "number", "description": "Inactivity timeout in seconds." },
    "transcribe": { "type": "object", "description": "Simultaneous transcription configuration.", "additionalProperties": true },
    "earlyMedia": { "type": "boolean", "description": "Stream audio before the call is answered." }
  },
  "required": ["url"],
  "examples": [
    { "verb": "stream", "url": "wss://myapp.example.com/audio", "sampleRate": 16000, "mixType": "stereo" }
  ]
}
ENDOFFILE

mkdir -p schema/verbs
cat > 'schema/verbs/tag.schema.json' << 'ENDOFFILE'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jambonz.org/schema/verbs/tag",
  "title": "Tag",
  "description": "Attaches arbitrary metadata to the current call. Tagged data is included in all subsequent webhook requests and in the call detail record (CDR). Useful for tracking business context, routing decisions, or analytics data through the call lifecycle.",
  "type": "object",
  "properties": {
    "verb": { "const": "tag" },
    "id": { "type": "string", "description": "An optional unique identifier for this verb instance." },
    "data": {
      "type": "object",
      "description": "An object containing the metadata to attach to the call. Keys and values are application-defined.",
      "additionalProperties": true,
      "examples": [{ "customerId": "12345", "department": "support", "priority": "high" }]
    }
  },
  "required": ["data"],
  "examples": [
    { "verb": "tag", "data": { "customerId": "12345", "intent": "billing-inquiry" } }
  ]
}
ENDOFFILE

mkdir -p schema/verbs
cat > 'schema/verbs/transcribe.schema.json' << 'ENDOFFILE'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jambonz.org/schema/verbs/transcribe",
  "title": "Transcribe",
  "description": "Enables real-time transcription of the call audio. Transcription results are sent to the transcriptionHook as they are produced. Runs as a background process — subsequent verbs execute immediately while transcription continues.",
  "type": "object",
  "properties": {
    "verb": { "const": "transcribe" },
    "id": { "type": "string", "description": "An optional unique identifier for this verb instance." },
    "transcriptionHook": {
      "type": "string",
      "format": "uri",
      "description": "The webhook URL to receive transcription results."
    },
    "translationHook": {
      "type": "string",
      "format": "uri",
      "description": "The webhook URL to receive translated transcription results."
    },
    "recognizer": {
      "$ref": "../components/recognizer",
      "description": "STT configuration for the transcription."
    },
    "earlyMedia": {
      "type": "boolean",
      "description": "If true, begin transcribing before the call is answered."
    },
    "channel": {
      "type": "number",
      "description": "Specific audio channel to transcribe."
    }
  },
  "examples": [
    {
      "verb": "transcribe",
      "transcriptionHook": "https://myapp.example.com/transcription",
      "recognizer": {
        "vendor": "deepgram",
        "language": "en-US",
        "deepgramOptions": { "model": "nova-2", "smartFormatting": true }
      }
    }
  ]
}
ENDOFFILE

