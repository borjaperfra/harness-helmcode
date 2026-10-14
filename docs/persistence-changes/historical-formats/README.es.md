---
description: "Encuentra los tipos de persistencia declarados completos de cada formato de Session, desde V0 hasta el escritor del checkout."
---

# Formatos de persistencia de Session

[English](README.md) | Español

## Resumen

Usa esta referencia para inspeccionar los headers, los sobres de evento y los tipos de payload de una generación de Session almacenada. Cada formato anterior al escritor del checkout tiene un documento bilingüe y un snapshot de schemas completo. El formato actual usa el catálogo de persistencia generado. La [autoridad de versiones](../../session-format-status.es.md) posee la constante del escritor y el estado de publicación.

## Índice

- [Referencias de formato](#formats)
- [Alcance y evidencia](#scope)
- [Mantener la cobertura](#maintenance)
- [Nota de desarrollo](#dev-note)

-----

<a id="formats"></a>
## Referencias de formato

El índice se genera a partir de snapshots validados y de la constante del escritor actual. Cada referencia histórica identifica su punto de control de origen; un número de formato de Session no identifica cada revisión de payload de evento dentro de ese formato.

<!-- persistence-format-index:start -->

| Formato | Fuente | Referencia | Esquema máquina | Raíces / tipos |
|---|---|---|---|---|
| 0 | `dsh-v0.1.2-rc.1` | [V0](v0.es.md) | [JSON](v0.schema.json) | 54 / 415 |
| 1 | PR #3349 | [V1](v1.es.md) | [JSON](v1.schema.json) | 54 / 415 |
| 2 | `dsh-v0.1.3-alpha.2` | [V2](v2.es.md) | [JSON](v2.schema.json) | 56 / 435 |
| 3 | PR #4320 | [V3](v3.es.md) | [JSON](v3.schema.json) | 60 / 467 |
| 4 | `dsh-v4-final-baseline` | [V4](v4.es.md) | [JSON](v4.schema.json) | 60 / 575 |
| 5 | Árbol de trabajo actual | [Catálogo actual](../../persistence-catalog.es.md) | [JSON](../../persistence-schema.json) | 61 / 580 |

<!-- persistence-format-index:end -->

<a id="scope"></a>
## Alcance y evidencia

Cada par `vN.md` / `vN.es.md` tiene `kind: persistence-format`, una declaración `yaml persistence-format` idéntica que vincula cada clave de raíz a su resumen capturado, un sidecar de emparejamiento y un `vN.schema.json` completo. La [plantilla](../../../.agents/skills/dsh-doc/templates/persistence-format.md) define estos registros. Las raíces cubren el header lógico de Session, el header JSONL físico, el sobre de evento y todos los eventos propios en el punto de control seleccionado; cada raíz incluye cada tipo declarado alcanzable. Los registros de cuerpo físico empaquetados tienen propietarios de codec separados enlazados desde cada página.

V0 y V2 usan los últimos tags coincidentes del [archivo de versiones preliminares capturado](../releases/README.es.md). V1 usa un árbol fuente intermedio identificado en su referencia porque los tags capturados no contienen ningún escritor V1. V3 captura el inventario verificado antes del cambio de escritor V4 en el PR #4320. Las fuentes históricas conservan rutas de archivos sin números de línea. Los snapshots conservan los campos opcionales históricos y los valores opacos; no sustituyen tipos actuales en formatos más antiguos. Los identificadores históricos permanecen intactos solo en el JSON de schemas y en las regiones de schemas generadas verificadas; la prosa de autoría sigue las reglas de terminología actuales.

Estas referencias describen schemas seleccionados, no la reproducción histórica de aplicaciones ni la seguridad de migración. Las adiciones de eventos same-version y los cambios opcionales de payload pueden producir otros inventarios válidos. El archivo de versiones preliminares conserva las diferencias tag a tag; los [registros de cambios](../README.es.md) conservan los reconocimientos de compatibilidad actuales. Ninguno de los dos historiales queda reemplazado por estos snapshots de formatos.

<a id="maintenance"></a>
## Mantener la cobertura

`verify-persistence-formats` deriva el rango de enteros requerido de `SESSION_FORMAT_VERSION`. Cada entero anterior necesita su propio registro completo. El catálogo y el schema actuales deben existir y coincidir con la versión del escritor. La comprobación rechaza registros ausentes, extra, mal numerados, incompletos o inconsistentes y regiones generadas desactualizadas sin obtener el historial de Git ni consultar un servicio.

Antes de avanzar el escritor, verifica el catálogo actual y archiva el formato saliente. Para un cambio de V3 a V4, ejecuta estos comandos mientras el escritor y el schema actual todavía describen V3:

```sh
pnpm run verify-persistence-catalog
pnpm run verify-persistence-formats --archive 3
```

Sustituye `3` por la versión del escritor saliente en otras transiciones. `--archive N` crea `vN.schema.json` a partir del inventario actual, conserva exactamente los tipos alcanzables desde sus raíces y elimina los números de línea de las fuentes. Rechaza un destino existente, una versión distinta del escritor actual, schemas inválidos o incompletos y la combinación con `--write`. Añade el registro bilingüe del snapshot y la evidencia de origen usando la [plantilla](../../../.agents/skills/dsh-doc/templates/persistence-format.md). Conserva todos los registros anteriores. El sucesor usa el catálogo actual; copiar un nuevo catálogo actual no puede satisfacer el requisito del predecesor archivado. Sigue el [manual de referencia (cookbook) de versiones de formato](../../cookbook/adding-a-session-format-version.es.md) para los cambios de runtime.

Las definiciones de schemas y el índice dentro de los marcadores de comentario son generados. Tras avanzar el escritor y completar los datos máquina y la evidencia de autoría, actualiza sus tablas y registros de emparejamiento, y luego verifica:

```sh
pnpm run verify-persistence-formats --write
pnpm run verify-persistence-formats
pnpm run doc-sync
```

`--write` valida los datos máquina antes de actualizar el Markdown generado y los registros de emparejamiento. Conserva las explicaciones de autoría, las declaraciones máquina y los schemas. La verificación por defecto también rechaza los registros de emparejamiento desactualizados; las comprobaciones estándar de documentación validan las traducciones y los enlaces locales. La frescura del catálogo actual sigue siendo propiedad de `verify-persistence-catalog`.

<a id="dev-note"></a>
## Nota de desarrollo

Ninguna.
