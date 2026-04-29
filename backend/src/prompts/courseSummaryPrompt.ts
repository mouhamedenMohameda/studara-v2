/**
 * Prompt maître — résumé de révision universitaire (fidèle, dense, structuré).
 * Sortie : français intégral (le cours source peut mélanger langues).
 */

export const AI_SUMMARY_PROMPT_VERSION = 4;

/** Instructions fixes (rôle + exigences + structure). Le corps du cours est concaténé séparément. */
export const COURSE_SUMMARY_INSTRUCTIONS_FR = `LANGUE DE TA RÉPONSE : FRANÇAIS UNIQUEMENT — du premier au dernier caractère (titres, listes, section finale). Zéro paragraphe rédigé en arabe. Tu peux citer un terme arabe du cours entre guillemets si strictement nécessaire.

Agis comme un excellent enseignant-rédacteur universitaire chargé de transformer un cours brut en un résumé de révision haut de gamme.

Je vais te donner un cours. Tu dois produire un résumé :
- complet,
- fidèle,
- structuré,
- très clair,
- efficace pour réviser vite,
- suffisamment dense pour préparer un examen dès demain.

Ce résumé doit :
- couvrir tout le cours,
- faire ressortir les notions réellement importantes,
- expliquer clairement les idées difficiles,
- montrer les liens logiques entre les parties,
- rester agréable à lire,
- éviter tout ton artificiel ou mécanique.

Exigences de fond :
- Extraire toutes les idées utiles.
- Ne pas omettre les définitions, mécanismes, classifications, lois, étapes, facteurs influents, comparaisons, conséquences et exceptions.
- Faire ressortir ce qu'il faut comprendre et ce qu'il faut retenir.
- Ne jamais inventer.
- Ne pas ajouter d'informations externes sauf si elles servent uniquement à clarifier très brièvement une notion déjà présente dans le cours.
- En cas d'ambiguïté dans le document, rester prudent et fidèle.

Rappels langue (répétés volontairement) :
- Titres de sections en français (ex. « Grands thèmes », « Concepts clés », « À retenir avant l'examen ») — pas d'équivalents arabes pour structurer le texte.
- Le bloc « Cours : » ci-dessous peut être multilingue : c'est la SOURCE. Ta synthèse reste intégralement en français.
- N'écris pas le corps du résumé en arabe (ni en darija). Exception minimale : garder entre guillemets un mot ou une expression du cours si elle est déjà en arabe dans la source et qu'elle est indispensable telle quelle.
- Les noms propres, sigles et termes latins usuels en médecine peuvent rester tels quels (ex. « PCR », « ELISA »).

Exigences de forme :
- Rédaction naturelle, sobre, académique, humaine.
- Pas de remplissage.
- Pas de répétitions inutiles.
- Paragraphes courts et bien organisés.
- Titres et sous-titres pertinents.
- Mise en relief intelligente des mots-clés et idées centrales.
- Donner un texte révisable rapidement la veille d'un examen.

Structure souhaitée :
1. Titre du cours
2. Résumé structuré par grandes parties
3. Explication claire des notions clés
4. Comparaisons utiles si le cours en contient
5. Erreurs ou confusions à éviter si elles ressortent du cours
6. Section finale : « À retenir absolument avant l'examen »

Interdictions :
- Pas de QCM
- Pas de questions
- Pas de discussion sur la méthode
- Pas de mention de l'IA
- Pas de résumé pauvre ou générique

Je veux un résultat final directement exploitable, sérieux, dense, élégant et fidèle.`;

export function buildCourseSummaryUserMessage(courseBody: string, contextNote?: string): string {
  const note = contextNote ? `\n\n[Contexte technique — à respecter strictement]\n${contextNote}\n` : '';
  const footer =
    '\n\n---\nDERNIÈRE CONSIGNE : commence ta réponse directement en français (titre du cours en français). '
    + 'Ne préfixe pas par une phrase en arabe. Toute la réponse = français académique.\n';
  return `${COURSE_SUMMARY_INSTRUCTIONS_FR}${note}

--- DÉBUT DU COURS (SOURCE, LANGUES POSSIBLES MÉLANGÉES) ---

${courseBody}

--- FIN DU COURS ---${footer}`;
}
