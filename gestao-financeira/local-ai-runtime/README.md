# Local AI Runtime — Gestão Financeira

Runtime HTTP local que executa a IA **fora do navegador**, via [Ollama](https://ollama.com).

- Bind: `127.0.0.1:43128` (nunca `0.0.0.0` por padrão)
- Auth: `Authorization: Bearer <token>`
- CORS: apenas `http://127.0.0.1:43127` e `http://localhost:43127`
- Sem envio de dados financeiros para a nuvem

## Pré-requisitos

1. Instale o [Ollama](https://ollama.com/download) (Windows)
2. Baixe um modelo leve:

```bash
ollama pull qwen2.5:1.5b
```

## Iniciar

Na pasta do app:

```bash
npm run ai:runtime
```

Ou:

```bash
node local-ai-runtime/src/index.js
```

## Endpoints

| Método | Path | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/health` | não | Health check |
| GET | `/pair` | localhost | Retorna token de pareamento |
| GET | `/status` | sim | Status runtime/modelo |
| GET | `/model` | sim | Info do modelo |
| POST | `/analyze` | sim | Análise estruturada |
| POST | `/chat` | sim | Pergunta livre |
| POST | `/shutdown` | sim | Encerra o runtime |

## Privacidade

- O runtime **não** acessa o cofre, PIN ou IndexedDB
- Recebe apenas `FinancialContext` agregado
- Logs não registram prompts nem respostas financeiras
