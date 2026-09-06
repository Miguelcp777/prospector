# 0004 · El remitente es el cliente; la infraestructura, nuestra

**Fecha:** septiembre 2026 · **Estado:** aceptada

## Contexto

Prospector vende captación automática, y el envío es la mitad que se
demuestra en una reunión. Antes de escribir ese módulo hay que responder una
pregunta que no es técnica: **¿de quién sale el correo?**

De ahí cuelga todo lo demás. `compliance.md` fija el reparto legal —el
cliente es responsable del tratamiento y nosotros encargados— y si los
correos salen de nuestro dominio esa frontera se emborrona justo donde más
caro sale. Y hay una consecuencia operativa igual de dura: **la reputación
de envío o se comparte o no se comparte**. Si un cliente compra una lista y
la quema, o arrastra a los demás o no.

## Las tres opciones

**A · Cada cliente trae su proveedor.** Pega su clave de Resend, de SES o
sus credenciales SMTP. Su dominio, su factura, su reputación.

Aísla perfecto y encaja con el reparto legal ya escrito. Pero mata la venta:
un fisioterapeuta no va a abrir cuenta en un ESP ni a interpretar un
registro DKIM. El alta se cae ahí.

**B · Enviamos nosotros por todos.** Nuestro ESP, nuestro dominio, alta en
dos clics.

Es la promesa comercial sin fricción, y también el modo de que un cliente
tóxico queme el dominio de todos —enterándonos cuando ya estamos en spam—.
Además nos convierte en el remitente, que es exactamente lo que el reparto
legal evita.

**C · Enviamos nosotros, desde el dominio de ellos.** El cliente añade dos o
tres registros DNS —un CNAME de DKIM y un `include` de SPF— y nada más: ni
cuenta, ni factura, ni clave. Es lo que hacen Mailchimp, Brevo o Klaviyo.

La fricción baja de «monta un ESP» a «pega esto donde tengas el dominio»,
que sí se puede acompañar por teléfono. La reputación del **dominio** vuelve
a ser suya. La **IP** sigue siendo nuestra y compartida.

## Decisión

**C por defecto, A como salida.**

El camino normal es el dominio autenticado del cliente sobre nuestra
infraestructura. El cliente que ya tenga su ESP montado —o que no quiera
compartir IP con nadie— puede traer sus credenciales, que se guardan por
tenant en el Vault.

El molde de A ya existe y no hay que inventarlo: la migración 026 guarda la
clave de OpenAI escribible desde el navegador y legible **solo** por
`service_role`. Una credencial de ESP por tenant es el mismo patrón.

**B queda descartada**, y conviene decir por qué en vez de dejarlo implícito:
no es que sea difícil, es que el día que funcione bien es indistinguible del
día antes de que un cliente nos queme el dominio.

## Consecuencias

**A favor**

- El alta sigue siendo vendible: unos registros DNS se acompañan por
  teléfono; una cuenta de ESP, no.
- El aislamiento de reputación vuelve al nivel de dominio, que es donde los
  filtros miran primero.
- El reparto legal de `compliance.md` se sostiene: el remitente es el
  cliente, nosotros ponemos la máquina.
- El coste de envío por cliente entra en el panel sin esquema nuevo:
  `tarifas_modelo` ya es multi-proveedor.

**En contra**

- La IP se comparte. Se mitiga con pools y warmup, no desaparece.
- Hay que construir la verificación de DNS: enseñar los registros, comprobar
  que están puestos y no dejar enviar hasta entonces.
- Dos caminos que mantener en vez de uno. A es minoritario pero real, y el
  código de envío tiene que aceptar los dos sin ramificarse por todas
  partes.

## Restricciones que se derivan

- **Un tenant sin dominio verificado no envía.** Nada de caer de vuelta a un
  dominio nuestro «mientras tanto»: eso es la opción B por la puerta de
  atrás, y llega sin que nadie lo haya decidido.
- **Throttling por tenant**, no global. El límite protege del cliente, no
  del sistema.
- **Poder cortar a un cliente en caliente**, sin desplegar.
- Las credenciales de A **nunca salen del Vault**, igual que la de OpenAI:
  se escriben desde el navegador y las lee la Edge Function con identidad de
  servidor.

## Lo que hay que construir antes que el envío

No es la pantalla de configuración. Es **la ingesta de rebotes y quejas**.

Hoy `suppressions` se rellena a mano. En cuanto se envíe de verdad hay que
recibir los webhooks del ESP —rebote duro, queja de spam, baja— y volcarlos
ahí solos. Sin eso la lista no se mantiene, se sigue escribiendo a
direcciones muertas y la reputación se hunde por su propio peso en semanas.

El esquema aguanta: `suppressions` ya distingue supresión por tenant de
supresión global (`tenant_id` nulo). Falta quien la rellene.

Esto **actualiza la condición de CLAUDE.md**, que hoy dice «nada de envío
hasta que exista la lista de supresión y el opt-out funcionando». Esas dos
piezas ya existen y están activas —tabla, `esta_suprimido()`, trigger
`no_enviar_a_suprimidos` sobre `messages`, y la Edge Function `baja`—. La
condición que queda viva es esta otra.

## Qué pasa con `enviar-prueba`

Se queda como está y no es un adelanto de esto. Manda a la dirección de
quien lo pide, sacada del token, y no marca nada como enviado. Cuando exista
el envío de verdad, seguirá siendo útil como lo que es: ver el diseño en una
bandeja real antes de mandarlo a nadie.

## Pendiente

- **Qué ESP.** La decisión de modelo no elige proveedor. SES tiene identidad
  verificada por remitente y *configuration sets*, que encaja bien con esto;
  Resend hay que mirar cómo resuelve el multi-tenant. Merece medir precio
  por mil y esfuerzo de integración antes de atarse.
- Pools de IP y plan de warmup.
- Pantalla de alta del dominio: enseñar los registros, comprobarlos, y decir
  en qué estado está cada tenant.
- Consulta legal antes de Fase 4, que ya estaba en `compliance.md`.
