/**
 * @jambonz/sdk — unified SDK for building jambonz voice applications.
 */

// Types
export type * from './types/index.js';

// Verb builder
export { VerbBuilder, type VerbBuilderOptions } from './verb-builder.js';

// Validator
export { JambonzValidator, getValidator, type ValidationResult, type ValidationError } from './validator.js';

// Webhook
export { WebhookResponse, envVarsMiddleware } from './webhook/index.js';

// WebSocket
export { createEndpoint, WsClient, Session, WsRouter, AudioClient, AudioStream } from './websocket/index.js';
export type { EndpointOptions, MakeService, Middleware, WsClientEvents, AudioClientEvents, AudioStreamEvents, AudioStreamMetadata, PlayAudioOptions } from './websocket/index.js';

// REST Client
export { JambonzClient, CallsResource, ConferencesResource, QueuesResource } from './client/index.js';
export type { ClientOptions } from './client/index.js';
