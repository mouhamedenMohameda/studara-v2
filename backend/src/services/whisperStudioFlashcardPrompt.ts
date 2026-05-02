/**
 * Prompt unique Whisper Studio — génération flashcards (OpenAI, Groq, Gemini).
 */

export function buildWhisperStudioFlashcardPrompt(
  transcript: string,
  subject: string,
  cardCount: number,
  deckLanguage: 'ar' | 'fr',
): string {
  const n = Math.max(1, Math.floor(cardCount));
  const s = subject.trim() || 'cours';
  const langLabel = deckLanguage === 'fr' ? 'français' : 'arabe';
  const langRule =
    deckLanguage === 'fr'
      ? `**Langue imposée : français uniquement.** Tous les champs « front » et « back » doivent être entièrement en français. ` +
        `Interdiction d’écrire en arabe (sauf citation mot à mot déjà présente dans la transcription). ` +
        `Pas de phrases mixtes hors exceptions techniques citées verbatim du transcript.\n`
      : `**Langue imposée : arabe uniquement.** Tous les champs « front » et « back » doivent être entièrement en langue arabe. ` +
        `Interdiction d’écrire en français (sauf citation mot à mot déjà présente dans la transcription). ` +
        `Pas de phrases mixtes hors exceptions techniques citées verbatim du transcript.\n`;

  return (
    `Tu es un expert en didactique universitaire. Tu transformes une transcription de cours en flashcards très utiles pour la révision.\n\n`
    + `**Matière / contexte :** « ${s} »\n\n`
    + `=== TRANSCRIPTION (unique source factuelle) ===\n`
    + `"""\n${transcript}\n"""\n\n`
    + langRule + `\n`
    + `=== SORTIE OBLIGATOIRE ===\n`
    + `Réponds par **un seul** tableau JSON valide, sans texte avant ni après, sans bloc markdown.\n`
    + `Nombre d’éléments : **exactement ${n}**. Chaque élément : {"front":"…","back":"…"}.\n`
    + `Les clés JSON restent **front** et **back** (anglais technique) ; seules les **valeurs textuelles** sont en ${langLabel}.\n`
    + `Si le transcript est trop pauvre pour ${n} cartes solides, fais au mieux **sans inventions** jusqu’à concurrence des idées vérifiables (mieux vaut quelques réponses très courtes que du contenu hors transcript).\n\n`
    + `### Recto (« front ») — questions\n`
    + `- **Ancrage :** la réponse doit pouvoir être **justifiée** par des passages précis de la transcription (notion nommée, étape, résultat, exemple donné au cours, comparaison, condition, objection).\n`
    + `- **Une intention par carte :** définition ; relation cause → effet ; comparaison / distinction ; ordre chronologique ou logique d’un mécanisme ; application ou conséquence ; limite ou nuance **si le cours en parle**.\n`
    + `- **Formulation :** claire, ciblée, non générique (interdire les questions du type « De quoi parle le cours ? » ou « C’est quoi ? » sans nommer la notion).\n`
    + `- **Longueur :** **≤ 20 mots** sur le recto (dans la langue imposée).\n\n`
    + `### Verso (« back ») — réponses\n`
    + `- **Niveau :** réponses **denses et maîtrisées** : **1 à 3 phrases courtes**, **≤ 60 mots** au total pour ce champ.\n`
    + `- **Structure interne :** (1) idée maîtresse (2) précision (mécanisme, condition, conséquence ou relation) (3) **exemple, chiffre ou formule** uniquement s’ils figurent dans la transcription.\n`
    + `- **Lexique :** réemploie les **termes techniques** et tournures du cours ; reste **strictement** dans le contenu du transcript (aucun savoir encyclopédique ajouté). Tu peux **condenser** ou **enchaîner** deux idées **déjà présentes** dans le même fil.\n`
    + `- **Bruit de transcription :** corrige par le contexte **uniquement** si c’est sans ambiguïté ; sinon **n’élabore pas** de carte sur ce passage.\n\n`
    + `### Couverture et qualité\n`
    + `- Couvre **plusieurs parties** ou fils du cours (évite la répétition du même point).\n`
    + `- Varie les types de questions.\n`
    + `- Si un extrait est trop pauvre pour une carte solide, **saute-le** plutôt que d’inventer.\n\n`
    + `Format exact du JSON :\n`
    + `[{"front":"…","back":"…"}, …]\n`
  );
}
