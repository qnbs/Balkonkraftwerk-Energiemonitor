import { GoogleGenerativeAI } from '@google/generative-ai';

const STORAGE_KEY = 'bkw-gemini-api-key';

export function getStoredApiKey(): string {
  return localStorage.getItem(STORAGE_KEY) ?? '';
}

export function setStoredApiKey(key: string): void {
  if (key.trim()) {
    localStorage.setItem(STORAGE_KEY, key.trim());
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function hasApiKey(): boolean {
  return getStoredApiKey().length > 0;
}

export async function analyzeEnergyData(
  data: Record<string, unknown>,
): Promise<string> {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    throw new Error('Kein Gemini API-Key konfiguriert. Bitte unter Settings eingeben.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `Du bist ein Energieberater für Balkonkraftwerke in Deutschland.
Analysiere die folgenden Energiedaten und gib konkrete, hilfreiche Tipps auf Deutsch.
Formatiere die Antwort als übersichtliches Markdown mit Emojis.

Daten:
${JSON.stringify(data, null, 2)}

Antworte mit:
1. **Zusammenfassung** der aktuellen Energiebilanz
2. **Autarkie-Bewertung** (wie gut deckt das BKW den Eigenverbrauch?)
3. **Optimierungstipps** (wann sollte man Geräte einschalten?)
4. **Prognose** für die nächsten Stunden basierend auf dem Trend
5. **Spartipp** des Tages`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}
