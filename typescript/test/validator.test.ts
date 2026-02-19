import { describe, it, expect } from 'vitest';
import { JambonzValidator } from '../src/validator.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname_test = dirname(fileURLToPath(import.meta.url));
const schemaDir = resolve(__dirname_test, '../../schema');

describe('JambonzValidator', () => {
  const validator = new JambonzValidator(schemaDir);

  it('should validate a simple say + hangup app', () => {
    const app = [
      { verb: 'say', text: 'Hello!' },
      { verb: 'hangup' },
    ];
    const result = validator.validate(app);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should validate the schema examples', () => {
    const appSchemaPath = resolve(schemaDir, 'jambonz-app.schema.json');
    const appSchema = JSON.parse(readFileSync(appSchemaPath, 'utf-8'));

    for (const example of appSchema.examples) {
      const result = validator.validate(example);
      expect(result.valid).toBe(true);
    }
  });

  it('should reject an empty array', () => {
    const result = validator.validate([]);
    expect(result.valid).toBe(false);
  });

  it('should reject a verb with unknown verb name', () => {
    const result = validator.validate([{ verb: 'nonexistent' }]);
    expect(result.valid).toBe(false);
  });

  it('should reject a non-array', () => {
    const result = validator.validate({ verb: 'say', text: 'hi' });
    expect(result.valid).toBe(false);
  });

  it('should validate a gather with nested say', () => {
    const app = [
      {
        verb: 'gather',
        input: ['speech', 'digits'],
        actionHook: '/result',
        timeout: 15,
        say: { text: 'Please speak.' },
      },
    ];
    const result = validator.validate(app);
    expect(result.valid).toBe(true);
  });

  it('should validate a dial verb', () => {
    const app = [
      {
        verb: 'dial',
        target: [{ type: 'phone', number: '+15085551212' }],
        answerOnBridge: true,
        timeout: 30,
      },
    ];
    const result = validator.validate(app);
    expect(result.valid).toBe(true);
  });

  it('should validate an llm verb', () => {
    const app = [
      {
        verb: 'llm',
        vendor: 'openai',
        model: 'gpt-4o',
        llmOptions: {
          messages: [{ role: 'system', content: 'You are helpful.' }],
          temperature: 0.7,
        },
        actionHook: '/llm-done',
      },
    ];
    const result = validator.validate(app);
    expect(result.valid).toBe(true);
  });

  it('should validate a config verb', () => {
    const app = [
      {
        verb: 'config',
        synthesizer: { vendor: 'elevenlabs', voice: 'Rachel' },
        recognizer: { vendor: 'deepgram', language: 'en-US' },
      },
    ];
    const result = validator.validate(app);
    expect(result.valid).toBe(true);
  });

  it('should validate a sip:decline verb', () => {
    const app = [
      { verb: 'sip:decline', status: 486, reason: 'Busy Here' },
    ];
    const result = validator.validate(app);
    expect(result.valid).toBe(true);
  });

  it('should validate a single verb via validateVerb', () => {
    const result = validator.validateVerb({ verb: 'pause', length: 3 });
    expect(result.valid).toBe(true);
  });

  it('should reject a pause verb missing length', () => {
    const result = validator.validateVerb({ verb: 'pause' });
    expect(result.valid).toBe(false);
  });
});
