# Synergy - Landing Pages

Projeto de landing pages usando Astro + Tailwind CSS, configurado para deploy na Cloudflare Pages.

## 🚀 Estrutura do Projeto

```
src/
└── pages/
    ├── index.astro          # Página inicial (lista de LPs)
    ├── lp-produto1.astro    # Landing Page Produto 1
    └── lp-produto2.astro    # Landing Page Produto 2
```

## 📝 Como criar uma nova Landing Page

1. Crie um novo arquivo `.astro` na pasta `src/pages/`
2. O nome do arquivo será a URL. Ex: `lp-meu-produto.astro` → `seusite.com/lp-meu-produto`
3. Copie a estrutura de uma LP existente como base
4. Personalize cores, textos e seções

**Importante:** Cada LP é independente. Importe o Tailwind no topo do arquivo:
```astro
---
import '../styles/global.css'
---
```

## 🛠️ Comandos

| Comando | Ação |
|---------|------|
| `npm run dev` | Inicia servidor local em `localhost:4321` |
| `npm run build` | Gera build de produção em `./dist/` |
| `npm run preview` | Preview do build antes de subir |

## ☁️ Deploy na Cloudflare Pages

1. Conecte o repositório GitHub no Cloudflare Pages
2. Configure:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
3. Pronto! Cada push na `main` faz deploy automático

## 🎨 Dicas de Personalização

- Use gradientes do Tailwind: `bg-gradient-to-br from-purple-900 to-indigo-900`
- Transparências: `bg-white/10` (10% opacidade)
- Blur de fundo: `backdrop-blur-sm`
- Animações: `hover:scale-105 transition-all`

## 👥 Colaboração

Para você e seu sócio trabalharem juntos:
1. Clone o repositório
2. Crie uma branch para sua LP: `git checkout -b lp-novo-produto`
3. Crie sua landing page
4. Faça commit e push
5. Abra um Pull Request ou merge direto na main
