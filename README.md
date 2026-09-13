# Secret Santa frontend

Telegram Mini App frontend published as static files on GitHub Pages.

## Local development

Requires Node.js 22.12+.

```sh
cp .env.example .env.local
npm ci
npm run dev
```

Set `VITE_API_URL` to the public origin of the backend, without `/api`.

## GitHub Pages

1. In **Settings → Actions → General**, allow GitHub Actions to run.
2. In **Settings → Pages**, select **GitHub Actions** as the source.
3. In **Settings → Secrets and variables → Actions → Variables**, add `VITE_API_URL`, for example `https://santa-api.example.com`.
4. Push `main`. The workflow builds and publishes `dist`.

Use the resulting `https://<user>.github.io/<repo>/` URL as `APP_URL` in the backend. The relative Vite base supports GitHub Project Pages without hard-coding the repository name.
