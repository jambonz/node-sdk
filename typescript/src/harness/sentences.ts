/**
 * Splits streamed text into sentences, so each can be checked before it is spoken.
 */

const ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'st', 'vs', 'jr', 'sr', 'prof', 'inc', 'ltd', 'e.g', 'i.e', 'etc', 'no']);

/** Accumulates text and returns complete sentences as they form. */
export class SentenceSplitter {
  private buffer = '';

  /** Add streamed text; returns any sentences it completed (each with its trailing whitespace). */
  push(text: string): string[] {
    this.buffer += text;
    const out: string[] = [];
    let start = 0;
    // a sentence ends at . ! ? (optionally followed by closing quotes/brackets) then whitespace, or at a newline
    const re = /([.!?]+["')\]]*)(\s+)|(\n+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.buffer))) {
      const end = m.index + m[0].length;
      if (m[1]) {
        const words = this.buffer.slice(start, m.index).trim().split(/\s+/);
        const last = (words[words.length - 1] ?? '').toLowerCase();
        if (m[1] === '.' && ABBREVIATIONS.has(last)) continue;
      }
      const sentence = this.buffer.slice(start, end);
      if (sentence.trim()) out.push(sentence);
      start = end;
    }
    this.buffer = this.buffer.slice(start);
    return out;
  }

  /** Returns whatever is left (the final, possibly unterminated, sentence) and clears it. */
  flush(): string {
    const rest = this.buffer;
    this.buffer = '';
    return rest;
  }
}
