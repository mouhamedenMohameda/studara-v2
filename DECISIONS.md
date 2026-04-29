# Architecture decisions (ADR-lite)

Objectif: éviter la divergence silencieuse entre composants et garder une architecture stable.

## ADR-001 — Deux backends (Express + Fastify)

### Constat

- `backend/` expose l’API principale (Express).
- `services/fastify-api/` expose un service Fastify (endpoints spécifiques).

### Risque

- Duplication (auth, validation, types, conventions d’erreurs).
- Dérive: des features “semblables” ajoutées des deux côtés.

### Décision (court terme — 0 casse)

- On **n’unifie pas** ni ne migre quoi que ce soit.
- On **documente** explicitement:
  - quel backend est “source of truth” pour chaque feature,
  - quels endpoints appartiennent à quel service,
  - comment configurer les bases URL côté clients.

### Plan (moyen terme — optionnel)

- Centraliser les **DTO/validators** (types partagés) pour réduire le risque de mismatch.
- Harmoniser le format d’erreur (sans changer les codes HTTP) si/uniquement si cela ne casse pas les clients existants.

