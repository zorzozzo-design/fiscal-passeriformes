# Fiscal Passeriformes

PWA offline para consulta de criadores de passeriformes durante a fiscalização.
Os dados ficam só no aparelho (IndexedDB), cifrados com AES-GCM a partir da senha do usuário (PBKDF2, 310 mil iterações).
Este repositório contém apenas o código. Nunca versione planilhas, relatórios ou backups.

## Uso
1. Dados → importar a planilha de criadores (.xlsx/.csv: REGISTRO, CPF, CRIADOR, BAIRRO, ENDEREÇO, Cidade).
2. Dados → importar os relatórios gerais do SISPASS (.txt, vários de uma vez) ou colar o texto.
3. Backup → exportar no PC e importar no celular (mescla pelo CPF, vale o mais recente).

## Desenvolvimento
- `npm test` roda os testes do parser (fixture fictícia em `test/`).
- Servir local: `python3 -m http.server` e abrir http://localhost:8000.
- Ao publicar mudanças, incremente `CACHE` em `sw.js`.
