# Arqueólogo de Workflows — Pitch

Arqueólogo de Workflows é uma ferramenta que analisa o histórico Git de um repositório e realiza engenharia reversa para explicar por que a configuração de CI está definida de determinada forma. Exemplo de saída: "Este timeout de 45 minutos foi adicionado após um teste Selenium instável em março de 2026, commit abc123. Provavelmente é seguro reduzi-lo agora."

O produto destina-se a equipes que herdam pipelines sem memória institucional das decisões que motivaram certas configurações, reduzindo o tempo gasto em investigação de CI e facilitando decisões informadas sobre ajustes de configuração.
