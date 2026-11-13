import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { existsSync } from 'node:fs';

// Sur Cloudflare, ces valeurs viennent directement de l'environnement.
if (existsSync('.env')) process.loadEnvFile('.env');
const env = process.env;
const supabase = new URL(env.PUBLIC_SUPABASE_URL);

export default defineConfig({
  site: env.PUBLIC_SITE_URL || 'https://tebby-boutique.onrender.com',
  integrations: [react()],
  server: { port: 4321 },
  devToolbar: { enabled: false },
  // Les photos sont téléchargées et optimisées au build : les clients ne consomment pas le quota Supabase.
  image: {
    remotePatterns: [{ protocol: supabase.protocol.replace(':', ''), hostname: supabase.hostname }],
  },
});
