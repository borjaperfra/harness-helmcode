---
description: "Registra una transición de tipos de persistencia y su confirmación de compatibilidad."
kind: persistence-change
---

# 2026-10-14-identity-operator

[English](2026-10-14-identity-operator.md) | Español

## Resumen

Añade el evento solo-log `identity/operator`: la atribución durable de operador por sesión que escribe un plugin de identidad local, y el evento que pliega la proyección de sesión `operator` (fuera del transcript del modelo).

## Índice

- [Declaración](#declaration)
- [Compatibilidad](#compatibility)
- [Verificación](#verification)
- [Nota de desarrollo](#dev-note)

<a id="declaration"></a>
## Declaración

```yaml persistence-change
schemaVersion: 1
id: 2026-10-14-identity-operator
baseline: false
changes:
  - root: "event:identity/operator"
    previous: null
    after: "9eb055ec1c85a7b11eb6268dc688d8fddd7a94a4bc61d8a3f697e758aef54867"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibilidad

Una raíz nueva en la misma versión del formato de sesión, y un evento solo-log (no de superficie): no produce ningún mensaje visible para el modelo, así que ningún log existente cambia de significado ni ningún lector gana un paso. Un lector anterior a él rechaza un log que lo traiga, como con todo evento requerido en lectura; `SessionEvent.ignorable` sigue siendo el mecanismo de compatibilidad para productores fuera del repositorio. El evento sólo lo escribe `@deepseek-ai/dsh-identity-local`, ante una atribución explícita `/operator <nombre>` o un borrado, nunca el bucle del agente.

<a id="verification"></a>
## Verificación

pnpm vitest run packages/identity/identity-local packages/host/compliance-evidence: 89 tests en verde (15 en identity-local; su src queda al 100% por fichero en sentencias, ramas, funciones y líneas); pnpm exec tsc -b tsconfig.host.json: 0 diagnósticos. Una sesión cuyo log trae el evento pliega la proyección `operator` a `{ operator, since }`, y `foldSurface` no reporta ningún nodo de superficie para él (aserción en tests/identity-local.spec.ts).

<a id="dev-note"></a>
## Nota de desarrollo

Ninguna.
