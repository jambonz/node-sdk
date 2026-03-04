/**
 * Thin wrapper around the Google Translate v2 API.
 * Requires GOOGLE_APPLICATION_CREDENTIALS to point at a service account key.
 */
import { v2 } from '@google-cloud/translate';

const client = new v2.Translate();

export async function translateText(
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<string | null> {
  text = text.replace(/\n(?!\s)/g, ' ').replace(/\n\s/g, ' ');
  if (!text.trim()) return null;
  if (sourceLang === targetLang) return text;

  const [translation] = await client.translate(text, {
    from: sourceLang,
    to: targetLang,
  });
  return translation;
}
