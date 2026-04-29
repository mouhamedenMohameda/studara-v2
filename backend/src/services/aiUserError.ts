export function toUserFacingAiError(raw: string): string {
  const m = String(raw || '').trim();
  const lc = m.toLowerCase();

  // OpenAI rate limits / TPM
  if (
    lc.includes('tokens per min') ||
    lc.includes('tpm') ||
    lc.includes('rate limit') ||
    lc.includes('request too large') ||
    lc.includes('too many tokens')
  ) {
    return "Le cours est trop long ou le service est saturé. Réessaie dans 1–2 minutes, ou importe une partie du document (ex: 10–20 pages).";
  }

  if (lc.includes('openai_api_key') || lc.includes('api key') || lc.includes('invalid_api_key')) {
    return "Le service IA n’est pas disponible (configuration). Contacte le support si le problème persiste.";
  }

  if (lc.includes('insufficient_quota') || lc.includes('quota')) {
    return "Le quota IA est atteint pour le moment. Réessaie plus tard.";
  }

  if (lc.includes('timeout') || lc.includes('timed out')) {
    return "Le service IA met trop de temps à répondre. Réessaie dans quelques secondes.";
  }

  return "Une erreur est survenue pendant la génération. Réessaie, ou importe un document plus court.";
}

