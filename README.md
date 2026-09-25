# MyFam – Familien Organizer

Ein gemeinsamer Ort für die ganze Familie: Einkaufsliste, Termine und Planung. Die App ist für das Smartphone gebaut und lässt sich dort wie eine normale App auf den Startbildschirm legen. Mehrere Familien können dieselbe Installation nutzen, ohne die Daten der anderen zu sehen.

## Stand

| Bereich                           | Stand                                                    |
| --------------------------------- | -------------------------------------------------------- |
| Konto, Login, Abmelden            | fertig                                                   |
| Familien, Rollen, Einladungslinks | fertig                                                   |
| Einkaufsliste                     | fertig (hinzufügen, abhaken, löschen, Erledigte löschen) |
| Kalender                          | Platzhalter                                              |
| Planung / Aufgaben                | Platzhalter                                              |

## Technik

- [SvelteKit](https://svelte.dev) mit TypeScript, Tailwind CSS, `adapter-node`
- SQLite über [Drizzle ORM](https://orm.drizzle.team) (`better-sqlite3`), Migrationen in `drizzle/` laufen beim Start automatisch
- Eigene Anmeldung: Passwörter mit Argon2id, Sitzungen per `httpOnly`-Cookie (in der Datenbank liegt nur ein Hash des Tokens)
- Mandanten: Jede Tabelle mit Familiendaten hat eine `family_id`, und alle Abfragen in `src/lib/server/*.ts` filtern danach

```
src/lib/server/
  auth.ts        Passwörter, Sitzungen
  families.ts    Familien, Mitglieder, Einladungen
  shopping.ts    Einkaufsliste
  db/schema.ts   Datenbankschema
src/routes/
  (auth)/        Login, Registrieren, Einladung annehmen
  (app)/         Einkauf, Kalender, Planung, Familie
```

## Entwickeln

```sh
cp .env.example .env
npm install
npm run dev
```

Nützliche Befehle: `npm test` (Unit-Tests), `npm run check` (Typen), `npm run lint`.
Nach einer Änderung an `src/lib/server/db/schema.ts`: `npm run db:generate` erzeugt eine neue Migration.

## Betrieb mit Docker (Ubuntu)

Voraussetzungen: Docker mit Compose-Plugin und eine Domain, die auf den Server zeigt (Ports 80 und 443 offen).

```sh
git clone https://github.com/3nric02001/myfam.git && cd myfam
echo "DOMAIN=myfam.deine-domain.de" > .env
docker compose up -d --build
```

Caddy holt automatisch ein HTTPS-Zertifikat. Danach unter `https://<DOMAIN>/registrieren` die erste Familie anlegen und die anderen über **Familie → Einladungslink erstellen** einladen.

- **Update:** `git pull && docker compose up -d --build`
- **Backup:** Die Datenbank liegt im Volume `app-data` (`/data/myfam.db`), z. B.
  `docker compose exec app node -e "require('better-sqlite3')('/data/myfam.db').backup('/data/backup.db')"` und dann `docker compose cp app:/data/backup.db .`
