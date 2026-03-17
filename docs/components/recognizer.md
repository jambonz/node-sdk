## Vendor documentation links

Refer to vendor documentation for supported models and languages.

**Important**: jambonz requires real-time streaming STT. When choosing a model, ensure it supports real-time/streaming transcription. Models that only support batch transcription cannot be used.

### Deepgram
- When using Deepgram default to the latest nova model (e.g. nova-3)
- [Models & Languages Overview](https://developers.deepgram.com/docs/models-languages-overview)

### Google

- [Supported Languages](https://cloud.google.com/speech-to-text/docs/speech-to-text-supported-languages)

### Microsoft Azure

- [Language and Voice Support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support)

### AWS Transcribe

- [Supported Languages](https://docs.aws.amazon.com/transcribe/latest/dg/supported-languages.html)

### IBM Watson

- [Models and Languages](https://cloud.ibm.com/docs/speech-to-text?topic=speech-to-text-models-ng)

### AssemblyAI

- [Supported Languages](https://www.assemblyai.com/docs/getting-started/supported-languages)

#### Prompting (Universal-3 Pro)

AssemblyAI's Universal-3 Pro streaming model supports a `prompt` parameter that guides transcription behavior around punctuation, disfluencies, formatting, and domain-specific terminology. The default prompt achieves strong turn detection accuracy out of the box — only customize if needed, and start by extending the default rather than replacing it.

- See [Prompting guide](https://www.assemblyai.com/docs/streaming/universal-3-pro/prompting)

jambonz has an autogeneratePrompt recognizer setting which when used with AssemblyAI universal-3 pro streaming will automatically create the prompt for a gather verb based on the text in a nested say property.  See [here](../../examples/assemblyai-autogenerate-prompt/) for details.

A `keyterms` array can boost recognition of specific names, brands, or technical terms. This can be updated mid-stream, making it useful for voice agent scenarios where context changes during the call.

- See [Keyterms guide](https://www.assemblyai.com/docs/streaming/keyterms-prompting)

### OpenAI (Whisper)

- [Speech to Text Guide](https://platform.openai.com/docs/guides/speech-to-text)

### Nvidia Riva

- [ASR Overview](https://docs.nvidia.com/deeplearning/riva/user-guide/docs/asr/asr-overview.html)

### Speechmatics

- [Transcription Languages](https://docs.speechmatics.com/speech-to-text/languages#transcription-languages)

### Soniox

- [STT Models](https://soniox.com/docs/stt/models)

### Verbio

- [Supported Languages](https://www.verbio.com/supported-languages)

### Gladia

- [Supported Languages](https://docs.gladia.io/chapters/language/supported-languages)

### Nuance

- [ASR gRPC API](https://docs.mix.nuance.com/asr-grpc/v1/) (Nuance is now part of Microsoft; Azure Speech Service is the successor)
