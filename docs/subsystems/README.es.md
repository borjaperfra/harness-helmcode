# Subsistemas

[English](README.md) | Español

Una página por subsistema de DeepSeek Harness: qué es, las estructuras de datos que mueve y, donde un servicio `ctx` o un ámbito de eventos lo respalda, una sección **Cordis API** generada con su referencia de servicios y eventos. La carpeta complementa a [architecture.md](../architecture.es.md), que describe el *comportamiento* entre subsistemas (el mapa de servicios, el ciclo de vida sesión/turno/paso, la taxonomía de eventos); cada página aquí es la referencia del vocabulario y el cableado de un subsistema.

| Página | Posee |
|---|---|
| [boot.md](boot.es.md) | Gestión de plugins del perfil actual y coordinación de la recarga del lanzador |
| [core.md](core.es.md) | cómo `packages/core` controla el agent loop: la descripción del loop paquete a paquete, la creación y propiedad de agents (`AgentHandle`), los contratos de entrega/cancelación/intercepción del identificador `Agent`, y los patrones de tipos de todo el repositorio (`…Map → derived-union`, ids con marca) |
| [llm-streaming.md](llm-streaming.es.md) | los tipos de conversación de `packages/llm`: `Message`/`ContentBlock`, la solicitud de modelo ensamblada, el protocolo de cable `StreamChunk` y el contrato de adaptador, `BlockAssembler`, y el contrato de proveedor `LlmAdapter` |
| [token-meter.md](token-meter.es.md) | mediciones de reproducción escalares y posicionales inmutables con revisiones del registro consumido |
| [scope.md](scope.es.md) | identidad de registro con ámbito, portadores de despacho y el contexto `Scope` poseído |
| [typert.md](typert.es.md) | descriptores de invocación Remote, declaraciones de lookup/Context, registries de Typert y las fronteras de API Host Gateway/Client |
| [goal.md](goal.es.md) | identidad de objetivo persistida, snapshots de ciclo de vida, activación, registros de cambio y atribución de Round |
| [schedule.md](schedule.es.md) | registros de recordatorios propiedad del Host, transiciones durables, vistas activas y terminadas, y entrega en conversación ordinaria |
| [todo.md](todo.es.md) | el tipo de ítem de lista completa del paquete todo, la propiedad durable de eventos, la proyección y el invariante de turno abierto |
| [deliverables.md](deliverables.es.md) | lo que un turno entrega al usuario: entregas `PresentedFile` de `present` y el `WorkspaceChangesSummary` servido por el Host con los archivos cambiados a partir de snapshots de git |
| [commands.md](commands.es.md) | el servicio de registry de comandos humanos: definiciones, descubrimiento de adaptadores, invocación directa, resultados y vistas de parseo |
| [session.md](session.es.md) | el catálogo completo de variantes de `SessionEventMap`, `TurnEndReason`, `deriveMessages()`, el encierro de ejecución y los eventos independientes |
| [persistence.md](persistence.es.md) | el seam de durabilidad: `SessionPersistence`, el proveedor JSONL, `session/flush`, la recuperación tras fallo, `SessionHeader` |
| [settings.md](settings.es.md) | el seam de configuración de usuario: registro de `SettingsNamespace`, resolución por capas (valores por defecto → `base` de composición → documento de usuario), ámbitos de propietario, commits en caliente |
| [credentials.md](credentials.es.md) | el seam de credenciales: referencias `CredentialRef` (nunca valores) en la configuración, resolución por operación, `CredentialInfo` seguro para la UI, capas de origen del proveedor |
| [session-query.md](session-query.es.md) | registros lógicos, lecturas acotadas de eventos exactos, trazas de relaciones, filtros/documentos semánticos y páginas de resultados de texto completo |
| [feedback.md](feedback.es.md) | registros de feedback por mensaje ligados al ciclo de vida, versiones optimistas, persistencia sidecar y el contrato Remote del Host |
| [session-title.md](session-title.es.md) | snapshots de título durables, seqs de mensajes fuente citados y el contrato de proveedor asíncrono |
| [session-reference.md](session-reference.es.md) | referencias estructuradas entre sesiones: `SessionReferenceInput`/`Candidate`, contextos de mensaje preparados, la taxonomía estable de errores |
| [system-prompt.md](system-prompt.es.md) | contexto por ensamblaje, resultados de proveedores de tools, secciones del prompt y ensamblaje cooperativo |
| [tools.md](tools.es.md) | campos completos de `ToolDefinition`, el schema DSL, `ToolExecution`/`ToolResult`, tipos de UI de presentación de tools y el pipeline de ejecución vigilado |
| [mcp.md](mcp.es.md) | conexiones MCP externas, tools y recursos con ámbito, instrucciones del servidor, resultados de protocolo y propiedad de la configuración |
| [user-questions.md](user-questions.es.md) | el seam de preguntas/respuestas humanas respaldado por la UI: `AskUserQuestionRequest`, vocabulario de respuestas/opciones, API del proveedor, taxonomía de errores |
| [approval.md](approval.es.md) | el seam de aprobación de usuario de una sola vez: `ApprovalRequest`, `ApprovalOutcome`, política por sesión, eventos de auditoría y contratos de respondedor |
| [office-to-pdf.md](office-to-pdf.es.md) | conversión autorizada de Office a PDF, motores nativos/WASM y reutilización compartida acotada |
| [attachment.md](attachment.es.md) | identidad y metadatos durables de imágenes, entradas de validación, lecturas verificadas y el seam `AttachmentStore` |
| [shell.md](shell.es.md) | el seam de ejecutor de shell: `ShellExecRequest`/`Spec`, `ShellRunResult`, identificadores `ShellProcess` en segundo plano |
| [subprocess.md](subprocess.es.md) | el seam de subprocesos: `SubprocessSpawnSpec` totalmente explícito, lectores de salida basados en offset, `SubprocessOutcome` sin clasificar y el vocabulario de entorno `DSH_*` gestionado |
| [ssh.md](ssh.es.md) | la conexión SSH POSIX y el sistema de archivos remoto, proveedores de subprocesos y sandbox |
| [terminal.md](terminal.es.md) | ids de terminal persistentes, contratos de backend/sesión, disposición de envío, lecturas acotadas y snapshots visibles para el propietario |
| [sandbox.md](sandbox.es.md) | resolución de política por sesión y el seam de confinamiento de procesos: modos de efecto sobre archivos, políticas de ejecución/proveedor, `ConfinedArgv`, aplicación y errores de fallo cerrado |
| [ptc-runtime.md](ptc-runtime.es.md) | el seam de ejecución PTC: `PtcRunRequest`/`Result`, namespaces de binding, logs capturados, la taxonomía `PtcRunFailure` |
| [computer-use.md](computer-use.es.md) | registro exclusivo de proveedor con nombre de computer-use y opciones de integración de Cua Driver |
| [browser-use.md](browser-use.es.md) | registro exclusivo con nombre de browser-use, opciones de proveedor y propiedad del navegador por sesión |
| [extensions.md](extensions.es.md) | plugins y paquetes de Cordis dinámicos versionados, activación Host/Client, aprobación, inspección en runtime y desmontaje del ciclo de vida |
| [filesystem.md](filesystem.es.md) | el seam de sistema de archivos: `FsTarget`, resultados de lectura/escritura/edición, estado de archivo observado, `FsErrorCode` |
| [lsp.md](lsp.es.md) | el seam de navegación LSP: `LspQueryRequest`/`Result`, `LspProvider`/`Service`, cuatro operaciones, `LspError` |
| [skills.md](skills.es.md) | el servicio de skills: prioridad de descubrimiento, `SkillSummary`/`SkillDefinition`, catálogo de prefijo de sesión, carga de `skill` orientada al modelo |
| [compaction.md](compaction.es.md) | el seam de compactación: los eventos de sesión `compaction/*`, `CompactionResult`, la interfaz `CompactionEngine` |
| [subagent.md](subagent.es.md) | el seam de subagents: el registry de proveedores con nombre, `SubagentStartRequest`/`Result`/`Run`, la división de capacidades entre inicio y runtime |
| [voice-input.md](voice-input.es.md) | reconocedores experimentales con nombre, audio transitorio e inserción de borradores protegida por revisión |
| [agent-team.md](agent-team.es.md) | Agent Teams: identidad Lead implícita, teammates continuables con nombre, mailbox de pares durable y DAG de tareas compartido |
| [web.md](web.es.md) | el seam de acceso web: `WebSearchRequest`/`Result`, `WebFetchRequest`/`Result`, `WebFetchBody`, disponibilidad del proveedor, `WebError` |
| [spill.md](spill.es.md) | el seam de almacenamiento spill: `SaveTextSpill`, `SpillOwner`/`SpillSource`, `SpillRef`, el `SpillLocator` con marca |
| [workflow.md](workflow.es.md) | el seam de flujo de trabajo: `WorkflowStartRequest`, `WorkflowMeta`, `WorkflowRun`/`Result`, los payloads de eventos `workflow/*`, la fatalidad de `WorkflowError` |
| [jobs.md](jobs.es.md) | el runtime de tareas en segundo plano: `JobId` con marca, el contrato de productor, vistas de consumidor y el comportamiento del servicio `ctx.jobs` |
| [permission-presets.md](permission-presets.es.md) | la capa de presets de permisos: `PresetSpec`/`PresetOption`, el estado `custom` derivado, el evento `permission/preset` solo de registro |
| [plan.md](plan.es.md) | el modo Plan: el estado `plan/mode` solo de registro, el vaciado de selecciones pendientes, `PlanModeConfig`, el arco de revisión de `exit_plan_mode` |
| [invariants.md](invariants.es.md) | el registry de invariantes de runtime: `Config` de selección, `InvariantInstaller`/`InvariantFailure`, el contrato de companion vacío |
| [web-server.md](web-server.es.md) | el portador HTTP: `WebRouteKind`/`WebRoute`, orden de coincidencia, el asiento de fallback reclamable, taps de índice |
| [webhook.md](webhook.es.md) | entregas autenticadas del proveedor, reglas programáticas arbitrarias y creación de sesiones de espacio de trabajo de tipo lanzar y olvidar |
| [storage.md](storage.es.md) | el subsistema de almacenamiento: el contrato de backend (`StorageBackend`), `StorageForms`, `DomainSpec`/`Domain`, `domain/changed` |
| [workspace.md](workspace.es.md) | el registry de espacios de trabajo: `Workspace`/`WorkspaceId`, registro y resolución, la relación con el `cwd` de la sesión |
| [web-client.md](web-client.es.md) | la arquitectura del navegador: arranque, comunicación Remote, modelos de Client emparejados, adaptadores de UI, ensamblaje de Conversation, slots y semántica de reconexión |
| [client-modules.md](client-modules.es.md) | la tabla de plugins web: declaraciones `dsh.client`, composición de cable de `WebBootGraph`, la ruta del bundle y el tap de índice |
| [slots.md](slots.es.md) | composición tipada de la UI Web: propiedad de declaraciones, cardinalidad y ámbito, inyección de framework y funcionalidades, derivación de props y la jerarquía entregada |
| [client-resources.md](client-resources.es.md) | el modelo de recursos del cliente: direcciones `dsh-resource://<type>/…`, proveedores de protocolo y `ResourceProtocolMap`, el hook global `useResource` y sus estados, pins y liberación |
| [sidebar-right.md](sidebar-right.es.md) | la barra lateral derecha: direcciones de recursos y navegación, registro y enrutado de tipos de pestaña, el servicio de navegación `ctx.sidebarRight`, los slots de pestañas de panel y props de propietario, el modelo de recursos y el servicio Workspace Files |
| [conversation.md](conversation.es.md) | ensamblaje de eventos de sesión neutro respecto al destino: identidad de Context, datos de Location, rutas de reproducción, constructores de vistas y nodos de renderizado propiedad del destino |
| [session-projection.md](session-projection.es.md) | el seam de proyección: `SessionProjectionMap`, la unidad pura `ProjectionDefinition`, el corte consistente de `ProjectionSnapshot`, el feed de cambios |
| [retrieval.md](retrieval.es.md) | el seam de recuperación local: el índice SQLite tras `ctx.retrieval`, la indexación de trocear/embeber/reemplazar, la búsqueda embeber → coseno → rerank y las herramientas `index_workspace`/`knowledge_search` |
| [identity.md](identity.es.md) | la atribución local de operador: el comando `/operator`, el evento durable y solo-log `identity/operator`, la proyección de sesión `operator` y la cara de lectura `ctx.identityLocal` |

> Las declaraciones de tipos y su JSDoc en estas páginas son equivalentes a la fuente y `pnpm run verify-type-equiv` comprueba que no se desvíen (véase [development.md](../development.es.md#documenting-types-verbatim-ts-type-equiv)). Los bloques ordinarios conservan declaraciones completas; los bloques `public-api` conservan declaraciones de clases públicas sin cuerpo. Los servicios y eventos de Cordis usan la sección **Cordis API** generada de cada página.
