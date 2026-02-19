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

## Files
- `app.js` — Webhook version (Plain JavaScript with Express)
- `app.ts` — Webhook version (TypeScript using `@jambonz/sdk`)
- `ws-app.ts` — WebSocket version (TypeScript using `@jambonz/sdk`)
