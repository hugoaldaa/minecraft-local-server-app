# Instrucciones para agentes

Al terminar **cualquier implementación o cambio**, la respuesta debe incluir
siempre, de forma explícita y pegable en el CHANGELOG/cuerpo de release:

1. **Commit (English):** el nombre del commit en inglés, en estilo imperativo
   (p. ej. `Fix GitHub release publishing race and release notes path`).
2. **Añadido:** viñetas con lo nuevo.
3. **Cambios:** viñetas con lo que se modificó.
4. **Corregido:** viñetas con lo que se arregló.
5. **Otros:** viñetas con verificaciones, notas o seguimiento.

Reglas:

- Las cuatro secciones van **solo en español**.
- **No** incluir traducciones al inglés: la traducción la hace
  automáticamente el workflow con Gemini.
- El título del commit sí va en inglés.
- El formato debe poder copiarse directamente a `CHANGELOG.md` o al cuerpo de
  la release de GitHub.
