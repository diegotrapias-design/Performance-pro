# Performance Pro — publicação web

Este pacote contém os arquivos-fonte do aplicativo. **O ZIP não deve ficar sozinho no repositório GitHub**: os arquivos de dentro precisam estar na raiz do repositório.

## Configuração na Vercel
- Framework Preset: Other
- Build Command: `npm run build:web`
- Output Directory: `dist`
- Install Command: `npm install`
- Root Directory: `.`

Em Project Settings → Environment Variables, cadastrar:
- `EXPO_PUBLIC_SUPABASE_URL` = URL do projeto Supabase
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` = chave pública/anon do Supabase

Depois, fazer um novo deploy.

Não coloque service_role key no navegador.
